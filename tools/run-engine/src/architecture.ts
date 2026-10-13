import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  applyOperation,
  checkProject,
  createId,
  hash,
  parseRecord,
  questionSchema,
  safePath,
  schemas,
  serializeRecord,
  type WriteManifest,
} from "voidra";
import { z } from "zod";
import { listRunContexts } from "./run.ts";

const text = z.string().min(1);
const base = {
  action: schemas.action.shape.id,
  revision: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
  glossary: text.optional(),
};
const inputSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    ...base,
    kind: z.literal("questions"),
    questions: z
      .array(
        questionSchema.pick({
          text: true,
          why: true,
          options: true,
          dependsOn: true,
        }),
      )
      .min(1),
  }),
  z.strictObject({
    ...base,
    kind: z.literal("plan"),
    requirements: text,
    blueprint: text,
    acceptance: text,
  }),
  z.strictObject({
    ...base,
    kind: z.literal("slices"),
    slices: z.array(z.strictObject({ title: text, description: text })).min(2),
  }),
]);
export type ArchitectureProposal = z.infer<typeof inputSchema>;

/** Direct architecture proposals stop at gates. No code, instruction or Git effects. */
export async function proposeArchitecture(
  root: string,
  raw: unknown,
): Promise<{ gate: "questions" | "plan" | "slices"; children?: string[] }> {
  const input = inputSchema.parse(raw),
    path = `.voidra/actions/${input.action}/action.md`;
  const check = await checkProject(root);
  if (check.diagnostics.length)
    throw new Error(
      "Project is invalid or read-only; inspect diagnostics first",
    );
  if (
    [...check.records.values()].some(
      (r) =>
        (r.kind === "operation" && r.document.data.state === "prepared") ||
        (r.kind === "run" && r.document.data.outcome === "running"),
    ) ||
    (await listRunContexts(root)).some(
      (ctx) =>
        !["failed", "unsupported", "interrupted"].includes(ctx.phase) &&
        !(ctx.phase === "finalized" && ctx.indexReconciled),
    )
  )
    throw new Error(
      "Recover unfinished operations or runs before architecture proposals",
    );
  const bytes = await readFile(await safePath(root, path)),
    record = parseRecord(path, bytes),
    action = schemas.action.parse(record.data);
  if (
    action.doneBy !== "agent" ||
    !["discovery", "plan"].includes(action.stage ?? "")
  )
    throw new Error(
      "Architecture proposals require an agent action in Discovery or Plan",
    );
  if (input.revision && input.revision !== hash(bytes))
    throw new Error("Action revision changed; reread before proposing");
  const changes: WriteManifest["changes"] = [
    { path: ".voidra/local/run.lock", expectedHash: null, content: null },
  ];
  async function put(
    file: string,
    data: Record<string, unknown>,
    body = "",
  ): Promise<void> {
    const full = await safePath(root, file),
      old = await readFile(full).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
        return null;
      });
    changes.push({
      path: file,
      expectedHash: old === null ? null : hash(old),
      content: serializeRecord(
        parseRecord(file, old ?? "---\n{}\n---\n"),
        data,
        body,
      ).toString(),
    });
  }
  const qPath = `.voidra/actions/${input.action}/questions.md`,
    qBytes = await readFile(await safePath(root, qPath)).catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
        return null;
      },
    );
  const questions = qBytes
    ? schemas.questions.parse(parseRecord(qPath, qBytes).data)
    : { action: input.action, rounds: [] };
  changes.push({
    path: qPath,
    expectedHash: qBytes === null ? null : hash(qBytes),
    content: qBytes === null ? null : qBytes.toString(),
  });
  const previous = questions.rounds.flatMap((round) => round.questions);
  if (
    previous.some(
      (q) => !q.answer || (q.answer.kind === "agent-decides" && !q.agentChoice),
    )
  )
    throw new Error(
      "Answer open questions and resolve delegated choices before continuing",
    );
  if (input.kind === "questions") {
    const answered = new Set(previous.map((q) => q.id));
    for (const q of input.questions) {
      if (q.options.filter((option) => option.recommended).length !== 1)
        throw new Error("Each question needs exactly one recommended option");
      for (const dep of q.dependsOn ?? [])
        if (!answered.has(dep))
          throw new Error(
            `Prerequisite ${dep} is not answered in an earlier round`,
          );
    }
    changes.pop();
    await put(qPath, {
      ...questions,
      rounds: [
        ...questions.rounds,
        {
          round: Math.max(0, ...questions.rounds.map((r) => r.round)) + 1,
          askedAt: new Date().toISOString(),
          questions: input.questions.map((q) => ({
            ...q,
            id: createId("q"),
            allowFreeText: true,
          })),
        },
      ],
    });
    const questionChange = changes.at(-1);
    if (questionChange)
      questionChange.expectedHash = qBytes === null ? null : hash(qBytes);
    action.status = "waiting";
  } else if (input.kind === "plan") {
    for (const file of ["requirements", "blueprint", "acceptance"] as const)
      await put(
        `.voidra/actions/${input.action}/${file}.md`,
        { action: input.action },
        input[file],
      );
    action.stage = "plan";
    action.status = "waiting";
    if (action.planApproval)
      action.approvalHistory = [
        ...(action.approvalHistory ?? []),
        action.planApproval,
      ];
    delete action.planApproval;
  } else {
    const children = input.slices.map(() => createId("act"));
    for (const [index, slice] of input.slices.entries())
      await put(
        `.voidra/actions/${children[index]}/action.md`,
        {
          id: children[index],
          type: "feature",
          title: slice.title,
          stage: "discovery",
          status: "ready",
          doneBy: "agent",
          parent: action.id,
          blockedBy: index ? [children[index - 1]] : [],
          createdAt: new Date().toISOString(),
          createdBy: "Architecture agent",
        },
        slice.description,
      );
    action.blockedBy = [...new Set([...(action.blockedBy ?? []), ...children])];
    action.status = "ready";
    changes.push({
      path,
      expectedHash: hash(bytes),
      content: serializeRecord(record, action).toString(),
    });
    await applyOperation(root, { changes });
    return { gate: "slices", children };
  }
  changes.push({
    path,
    expectedHash: hash(bytes),
    content: serializeRecord(record, action).toString(),
  });
  if (input.glossary) {
    const full = await safePath(root, "GLOSSARY.md", true),
      old = await readFile(full).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
        return null;
      });
    changes.push({
      path: "GLOSSARY.md",
      expectedHash: old === null ? null : hash(old),
      content: input.glossary,
    });
  }
  await applyOperation(root, { changes }, { allowGlossary: true });
  return { gate: input.kind };
}

export async function runArchitecture(
  args: string[],
  stdin: string,
  cwd = process.cwd(),
): Promise<{ code: number; value: unknown }> {
  try {
    if (args[0] === "--help")
      return {
        code: 0,
        value:
          "Architecture proposal JSON on stdin or --report FILE; optional --project FOLDER. Kinds: questions, plan, slices. Writes planning only and stops at questions, plan approval or child slices; no commits.",
      };
    const flags = new Map<string, string>();
    for (let i = 0; i < args.length; i += 2) {
      const key = args[i],
        value = args[i + 1];
      if (
        !key ||
        !["--project", "--report"].includes(key) ||
        !value ||
        flags.has(key)
      )
        throw new Error("Use unique --project and --report flags");
      flags.set(key, value);
    }
    const root = resolve(cwd, flags.get("--project") ?? "."),
      input = flags.has("--report")
        ? await readFile(resolve(root, flags.get("--report") as string), "utf8")
        : stdin;
    return {
      code: 0,
      value: {
        ok: true,
        ...(await proposeArchitecture(root, JSON.parse(input))),
      },
    };
  } catch (error) {
    return {
      code: 1,
      value: {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}
