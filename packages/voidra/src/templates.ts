import {
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { type Diagnostic, VoidraError } from "./errors.ts";
import { createId } from "./ids.ts";
import { hash, lifecycles, validateLifecycles } from "./lifecycle.ts";
import { checkProject, FORMAT_VERSION, PACKAGE_VERSION } from "./project.ts";
import { fieldLine, parseRecord, serializeRecord } from "./records.ts";
import { lifecycleOverridesSchema, schemas, version } from "./schemas.ts";
import { applyOperation, type WriteManifest } from "./writer.ts";

const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  text = z.string().min(1);
export const templateQuestionSchema = z.looseObject({
  id: slug,
  question: text,
  type: z.enum([
    "short-text",
    "long-text",
    "single-choice",
    "multiple-choice",
    "list",
  ]),
  help: text,
  why: text.optional(),
  required: z.boolean().optional(),
  example: z.json().optional(),
  allowFreeText: z.boolean().optional(),
  options: z.array(z.looseObject({ value: text, label: text })).optional(),
});
export const templateSchema = z.looseObject({
  id: slug,
  version,
  format: z.number().int().min(1),
  title: text,
  description: text,
  architectureSkill: slug,
  blocks: z
    .array(
      z.looseObject({
        id: slug,
        title: text,
        help: text,
        questions: z.array(templateQuestionSchema).min(1),
      }),
    )
    .min(1),
  lifecycleOverrides: lifecycleOverridesSchema.optional(),
});
export type Template = z.infer<typeof templateSchema>;
export type TemplateQuestion = z.infer<typeof templateQuestionSchema>;
export function validateTemplate(
  input: unknown,
  file = "template.yaml",
): Template {
  const parsed = templateSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new VoidraError(
      "template",
      file,
      `${issue?.path.map(String).join(".") || "$"}: ${issue?.message ?? "Invalid template"}`,
      issue?.path.map(String).join(".") ?? "$",
    );
  }
  const template = parsed.data;
  const fail = (message: string) => {
    throw new VoidraError("template", file, message);
  };
  if (template.format !== FORMAT_VERSION)
    fail(
      `Template requires format ${template.format}; supported format is ${FORMAT_VERSION}`,
    );
  if (new Set(template.blocks.map((b) => b.id)).size !== template.blocks.length)
    fail("Duplicate profile block ID");
  for (const block of template.blocks) {
    if (
      new Set(block.questions.map((q) => q.id)).size !== block.questions.length
    )
      fail(`Duplicate question ID in ${block.id}`);
    for (const question of block.questions) {
      if (
        ["single-choice", "multiple-choice"].includes(question.type) &&
        !question.options?.length
      )
        fail(`${block.id}.${question.id}: choices require options`);
      if (
        question.options &&
        new Set(question.options.map((o) => o.value)).size !==
          question.options.length
      )
        fail(`${block.id}.${question.id}: duplicate option`);
      if (question.example !== undefined)
        validateTemplateAnswer(question, question.example);
    }
  }
  const errors = validateLifecycles({
    ...lifecycles,
    ...template.lifecycleOverrides,
  });
  if (errors.length) fail(errors.join("; "));
  return template;
}
export async function loadTemplate(file: string): Promise<Template> {
  // Reuse the strict UTF-8/JSON-safe YAML parser. A template is plain YAML, not Markdown.
  const source = new TextDecoder("utf-8", { fatal: true })
    .decode(await readFile(file))
    .replace(/^\uFEFF/, "")
    .replace(/^---\r?\n/, "")
    .replace(/\r?\n(?:---|\.\.\.)\s*$/, "");
  const doc = parseRecord(file, `---\n${source}\n---\n`);
  if (doc.body.trim())
    throw new VoidraError(
      "template",
      file,
      "Unexpected content after YAML document",
    );
  try {
    return validateTemplate(doc.data, file);
  } catch (error) {
    if (error instanceof VoidraError) {
      const field = error.field;
      throw new VoidraError(
        error.code,
        file,
        error.message,
        field,
        Math.max(1, fieldLine(doc, field.split(".")) - 1),
      );
    }
    throw error;
  }
}
export async function readTemplates(
  directory: string,
): Promise<{ templates: Template[]; diagnostics: Diagnostic[] }> {
  const templates: Template[] = [],
    diagnostics: Diagnostic[] = [];
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort(
    (a, b) => a.name.localeCompare(b.name),
  )) {
    if (!entry.isDirectory()) continue;
    const file = join(directory, entry.name, "template.yaml");
    try {
      if ((await lstat(file)).isSymbolicLink())
        throw new VoidraError(
          "template",
          file,
          "Linked templates are not loaded",
        );
      templates.push(await loadTemplate(file));
    } catch (error) {
      diagnostics.push(
        error instanceof VoidraError
          ? error.diagnostic()
          : {
              code: "template",
              file,
              field: "$",
              line: 1,
              message: error instanceof Error ? error.message : String(error),
            },
      );
    }
  }
  return { templates, diagnostics };
}
export function validateTemplateAnswer(
  question: TemplateQuestion,
  value: unknown,
): z.infer<ReturnType<typeof z.json>> {
  if (value === null) return null;
  const list = ["list", "multiple-choice"].includes(question.type);
  if (
    list
      ? !Array.isArray(value) ||
        value.some((v) => typeof v !== "string" || !v.trim())
      : typeof value !== "string" || !value.trim()
  )
    throw new Error(
      `${question.id}: expected ${list ? "a list of text values" : "text"}`,
    );
  const allowed = question.options?.map((o) => o.value);
  if (
    allowed &&
    !question.allowFreeText &&
    (list
      ? (value as string[]).some((v) => !allowed.includes(v))
      : !allowed.includes(value as string))
  )
    throw new Error(`${question.id}: choose a listed option`);
  if (list && new Set(value as string[]).size !== (value as string[]).length)
    throw new Error(`${question.id}: duplicate answer`);
  return value as string | string[];
}
export async function detectCode(
  root: string,
): Promise<{ hasCode: boolean; evidence: string[] }> {
  const manifests = new Set([
    "package.json",
    "go.mod",
    "Cargo.toml",
    "pyproject.toml",
    "requirements.txt",
    "pom.xml",
    "build.gradle",
    "Gemfile",
    "composer.json",
    "project.godot",
  ]);
  const ignored = new Set([
    ".git",
    ".voidra",
    "node_modules",
    "dist",
    "build",
    ".next",
    ".cache",
    "coverage",
    "vendor",
    "venv",
    ".venv",
  ]);
  const evidence: string[] = [];
  const visit = async (path: string, depth: number): Promise<void> => {
    if (evidence.length || depth > 6) return;
    for (const item of (
      await readdir(join(root, path), { withFileTypes: true })
    ).sort((a, b) => a.name.localeCompare(b.name))) {
      if (
        item.isSymbolicLink() ||
        ignored.has(item.name) ||
        item.name.startsWith(".voidra-staging-")
      )
        continue;
      const file = path ? `${path}/${item.name}` : item.name;
      if (
        item.isFile() &&
        (manifests.has(item.name) ||
          /\.(?:[cm]?jsx?|tsx?|py|go|rs|java|kt|swift|c|cpp|h|cs|rb|php|gd)$/.test(
            item.name,
          ))
      ) {
        evidence.push(file);
        return;
      }
      if (item.isDirectory()) await visit(file, depth + 1);
      if (evidence.length) return;
    }
  };
  await visit("", 0);
  return { hasCode: evidence.length > 0, evidence };
}
export interface IntakeOptions {
  name: string;
  answers: Record<string, { value: unknown; source?: string }>;
  inferred?: boolean;
  bootstrap?: boolean;
  by?: string;
}
export async function initializeProject(
  root: string,
  input: Template,
  options: IntakeOptions,
): Promise<{ paths: string[]; bootstrap?: string }> {
  const template = validateTemplate(input),
    at = new Date().toISOString(),
    by = options.by ?? "You";
  if (!options.name.trim()) throw new Error("Project name is required");
  const known = new Set(
    template.blocks.flatMap((b) => b.questions.map((q) => `${b.id}.${q.id}`)),
  );
  for (const key of Object.keys(options.answers))
    if (!known.has(key)) throw new Error(`Unknown profile answer ${key}`);
  const exists = async () =>
    lstat(join(root, ".voidra"))
      .then(() => true)
      .catch((error) => {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
        throw error;
      });
  if (await exists()) throw new Error("Planning directory already exists");
  const files = new Map<string, string | Buffer>([
    [
      ".voidra/voidra.json",
      `${JSON.stringify({ format: FORMAT_VERSION, requiredVoidra: PACKAGE_VERSION, project: { id: createId("prj"), name: options.name.trim() }, template: { id: template.id, version: template.version }, createdWith: `voidra/${PACKAGE_VERSION}`, lifecycleOverrides: template.lifecycleOverrides }, null, 2)}\n`,
    ],
    [
      ".voidra/README.md",
      "# Project planning\n\nRead the profile and actions before work. Use the Voidra skills and preserve human approval gates. Run `npx voidra@0 check` after writing planning records.\n",
    ],
    [".voidra/.gitignore", "local/\n"],
  ]);
  for (const block of template.blocks) {
    const answers = block.questions.map((q) => {
      const given = options.answers[`${block.id}.${q.id}`],
        value = validateTemplateAnswer(q, given?.value ?? null);
      if (options.inferred && !given?.source)
        throw new Error(
          `${block.id}.${q.id}: inferred answers require a source`,
        );
      if (
        !options.inferred &&
        q.required &&
        (value === null || (Array.isArray(value) && value.length === 0))
      )
        throw new Error(`${block.id}.${q.id}: a required answer is missing`);
      return {
        id: q.id,
        question: q.question,
        answer: value,
        status: options.inferred
          ? "inferred"
          : value === null
            ? "open"
            : "confirmed",
        ...(given?.source ? { source: given.source } : {}),
        updatedAt: at,
        ...(!options.inferred && value !== null ? { confirmedBy: by } : {}),
      };
    });
    const path = `.voidra/profile/${block.id}.md`;
    files.set(
      path,
      serializeRecord(
        parseRecord(path, "---\n{}\n---\n"),
        { block: block.id, title: block.title, answers },
        "",
      ),
    );
  }
  let bootstrap: string | undefined;
  if (options.bootstrap !== false) {
    bootstrap = createId("act");
    const path = `.voidra/actions/${bootstrap}/action.md`;
    files.set(
      path,
      serializeRecord(
        parseRecord(path, "---\n{}\n---\n"),
        {
          id: bootstrap,
          type: "feature",
          title: "Bootstrap",
          stage: (template.lifecycleOverrides?.feature ?? lifecycles.feature)
            .stages[0],
          status: "ready",
          doneBy: "agent",
          createdBy: by,
          createdAt: at,
        },
        "Use the project profile to discover the remaining questions and propose a Bootstrap plan. Stop for approval before implementation.\n",
      ),
    );
  }
  const stage = await mkdtemp(join(dirname(resolve(root)), ".voidra-staging-"));
  try {
    for (const [path, content] of files) {
      await mkdir(dirname(join(stage, path)), { recursive: true });
      await writeFile(join(stage, path), content);
    }
    const checked = await checkProject(stage, {
      lifecycles: { ...lifecycles, ...template.lifecycleOverrides },
    });
    if (checked.diagnostics.length)
      throw new Error(checked.diagnostics.map((d) => d.message).join("; "));
    if (await exists()) throw new Error("Planning directory already exists");
    await rename(join(stage, ".voidra"), join(root, ".voidra"));
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
  return { paths: [...files.keys()], ...(bootstrap ? { bootstrap } : {}) };
}
export async function updateProfileAnswer(
  root: string,
  input: Template,
  options: {
    block: string;
    id: string;
    value: unknown;
    by: string;
    expectedHash: string;
  },
): Promise<{ action?: string }> {
  const template = validateTemplate(input),
    question = template.blocks
      .find((b) => b.id === options.block)
      ?.questions.find((q) => q.id === options.id);
  if (!question) throw new Error("Profile question not found in template");
  const value = validateTemplateAnswer(question, options.value),
    checked = await checkProject(root);
  if (checked.diagnostics.length)
    throw new Error("Fix planning validation/recovery problems first");
  const path = `.voidra/profile/${options.block}.md`,
    doc = checked.records.get(path)?.document;
  if (!doc) throw new Error("Profile block not found");
  if (hash(doc.raw) !== options.expectedHash)
    throw new Error("Profile answer changed; read it again before saving");
  const profile = schemas.profile.parse(doc.data),
    current = profile.answers.find((a) => a.id === options.id);
  if (!current) throw new Error("Profile answer not found");
  if (
    current.status === "confirmed" &&
    isDeepStrictEqual(current.answer, value)
  )
    return {};
  const at = new Date().toISOString(),
    changes: WriteManifest["changes"] = [
      {
        path,
        expectedHash: options.expectedHash,
        content: serializeRecord(doc, {
          ...profile,
          answers: profile.answers.map((a) =>
            a.id === options.id
              ? {
                  ...a,
                  answer: value,
                  status: value === null ? "open" : "confirmed",
                  confirmedBy: options.by,
                  updatedAt: at,
                }
              : a,
          ),
        }).toString(),
      },
      { path: ".voidra/local/run.lock", expectedHash: null, content: null },
    ];
  let action: string | undefined;
  if (
    current.status === "confirmed" &&
    !isDeepStrictEqual(current.answer, value)
  ) {
    action = createId(
      "act",
      new Set(
        [...checked.records.values()]
          .filter((r) => r.kind === "action")
          .map((r) => String(r.document.data.id)),
      ),
    );
    const actionPath = `.voidra/actions/${action}/action.md`;
    changes.push({
      path: actionPath,
      expectedHash: null,
      content: serializeRecord(
        parseRecord(actionPath, "---\n{}\n---\n"),
        {
          id: action,
          type: "profile-change",
          title: `Update ${profile.title}: ${current.question}`,
          stage: "discovery",
          status: "draft",
          doneBy: "agent",
          createdBy: options.by,
          createdAt: at,
          links: [`${path}#${options.id}`],
          profileChange: {
            block: options.block,
            answerId: options.id,
            before: current.answer,
            after: value,
          },
        },
        "Review this draft before queueing it. Analyze the impact of the profile change on code, documents and open actions.\n",
      ).toString(),
    });
  }
  await applyOperation(root, { changes });
  return action ? { action } : {};
}
