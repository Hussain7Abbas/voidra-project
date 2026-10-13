import { execFileSync } from "node:child_process";
import { readFile, rm, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import {
  applyOperation,
  checkProject,
  hash,
  parseRecord,
  schemas,
  serializeRecord,
} from "voidra";
import { proposeArchitecture, runArchitecture } from "../src/architecture.ts";
import { startRun } from "../src/run.ts";
import { fixture } from "./helpers.ts";

const question = {
  text: "Who may read saved projects?",
  why: "Defines the authorization boundary.",
  options: [
    { label: "a", description: "Only the owner", recommended: true },
    { label: "b", description: "A shared team", recommended: false },
  ],
};
const plan = {
  requirements:
    "## Goal\nSave a project for its owner.\n\n## Out of scope\nTeam sharing.\n",
  blueprint:
    "## Approach\nStore projects behind an owner-scoped repository.\n\n## Testing seams\nRepository save/load and authenticated project API, using real temporary storage.\n\n## Proposed ADRs\nLocal-only persistence: hard to reverse, surprising without context, trades collaboration for offline privacy.\n",
  acceptance:
    "- Saving and reopening returns the same project.\n- A different owner cannot read it.\n",
};
const actionPath = ".voidra/actions/act-000000/action.md";
async function answered(root: string, path: string, content: Buffer) {
  const raw = await readFile(join(root, actionPath)),
    doc = parseRecord(actionPath, raw);
  await applyOperation(root, {
    changes: [
      {
        path,
        expectedHash: hash(await readFile(join(root, path))),
        content: content.toString(),
      },
      {
        path: actionPath,
        expectedHash: hash(raw),
        content: serializeRecord(doc, {
          ...doc.data,
          status: "ready",
        }).toString(),
      },
    ],
  });
}
async function action(root: string) {
  return schemas.action.parse(
    parseRecord(actionPath, await readFile(join(root, actionPath))).data,
  );
}
it("writes prerequisite frontiers atomically, protects answers and stops planning at the exact approval gate without Git or code effects", async () => {
  const root = await fixture("feature");
  try {
    const before = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
    }).toString();
    const revision = hash(await readFile(join(root, actionPath)));
    const result = await proposeArchitecture(root, {
      action: "act-000000",
      revision,
      kind: "questions",
      questions: [question],
      glossary: "# Glossary\n\n**Owner**: the person who may read a project.\n",
    });
    expect(result.gate).toBe("questions");
    expect((await action(root)).status).toBe("waiting");
    const waitingRevision = hash(await readFile(join(root, actionPath)));
    const path = ".voidra/actions/act-000000/questions.md";
    const old = parseRecord(path, await readFile(join(root, path))),
      data = schemas.questions.parse(old.data),
      first = data.rounds[0]?.questions[0];
    expect(first?.allowFreeText).toBe(true);
    await expect(
      proposeArchitecture(root, {
        action: "act-000000",
        kind: "plan",
        ...plan,
      }),
    ).rejects.toThrow(/Answer/);
    await expect(
      proposeArchitecture(root, {
        action: "act-000000",
        kind: "questions",
        questions: [question],
      }),
    ).rejects.toThrow(/Answer/);
    if (!first) throw new Error("Missing question");
    first.answer = {
      kind: "choice",
      choice: "a",
      by: "Fixture owner",
      at: new Date().toISOString(),
    };
    await answered(root, path, serializeRecord(old, data));
    await proposeArchitecture(root, {
      action: "act-000000",
      kind: "questions",
      questions: [
        {
          ...question,
          text: "How long are saved projects retained?",
          dependsOn: [first.id],
        },
      ],
    });
    const next = parseRecord(path, await readFile(join(root, path))),
      nextData = schemas.questions.parse(next.data);
    expect(nextData.rounds[0]?.questions[0]?.answer).toEqual(first.answer);
    const second = nextData.rounds[1]?.questions[0];
    if (!second) throw new Error("Missing second question");
    second.answer = {
      kind: "text",
      text: "Until deleted",
      by: "Fixture owner",
      at: new Date().toISOString(),
    };
    await answered(root, path, serializeRecord(next, nextData));
    await expect(
      proposeArchitecture(root, {
        action: "act-000000",
        revision: waitingRevision,
        kind: "plan",
        ...plan,
      }),
    ).rejects.toThrow(/revision/);
    await expect(
      proposeArchitecture(root, {
        action: "act-000000",
        kind: "questions",
        questions: [{ ...question, dependsOn: ["q-000000"] }],
      }),
    ).rejects.toThrow(/Prerequisite/);
    const planned = await proposeArchitecture(root, {
      action: "act-000000",
      kind: "plan",
      ...plan,
    });
    expect(planned.gate).toBe("plan");
    expect((await action(root)).stage).toBe("plan");
    expect((await action(root)).planApproval).toBeUndefined();
    expect((await checkProject(root)).diagnostics).toEqual([]);
    expect(
      execFileSync("git", ["rev-parse", "HEAD"], { cwd: root }).toString(),
    ).toBe(before);
    expect(await readFile(join(root, "README.md"), "utf8")).toBe("# Fixture\n");
    await writeFile(join(root, ".voidra/local/run.lock"), "{}");
    await expect(
      proposeArchitecture(root, {
        action: "act-000000",
        kind: "plan",
        ...plan,
      }),
    ).rejects.toThrow();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
it("creates linked thin slices without implementation, and rejects invalid plans, stages and unsafe input", async () => {
  const root = await fixture("feature");
  try {
    await expect(
      proposeArchitecture(root, {
        action: "act-000000",
        kind: "plan",
        ...plan,
        requirements: "No required headings",
      }),
    ).rejects.toThrow();
    const result = await proposeArchitecture(root, {
      action: "act-000000",
      kind: "slices",
      slices: [
        {
          title: "Save and reopen one project",
          description:
            "Storage, application service, screen and round-trip tests.",
        },
        {
          title: "Delete a saved project",
          description: "Storage deletion, service, screen and deletion tests.",
        },
      ],
    });
    expect(result.children).toHaveLength(2);
    const parent = await action(root);
    expect(parent.blockedBy).toEqual(result.children);
    const second = schemas.action.parse(
      parseRecord(
        "action.md",
        await readFile(
          join(root, `.voidra/actions/${result.children?.[1]}/action.md`),
        ),
      ).data,
    );
    expect(second.parent).toBe(parent.id);
    expect(second.blockedBy).toEqual([result.children?.[0]]);
    expect((await checkProject(root)).diagnostics).toEqual([]);
    expect((await runArchitecture(["--help"], "", root)).code).toBe(0);
    for (const [args, input] of [
      [[], "{}"],
      [["--unknown", "x"], "{}"],
      [["--project", ".", "--project", "."], "{}"],
      [[], "invalid"],
    ] as [string[], string][])
      expect((await runArchitecture(args, input, root)).code).toBe(1);
    await writeFile(
      join(root, "proposal.json"),
      JSON.stringify({ action: result.children?.[0], kind: "plan", ...plan }),
    );
    expect(
      (
        await runArchitecture(
          ["--report", "proposal.json", "--project", root],
          "",
          root,
        )
      ).code,
    ).toBe(0);
    expect(
      (
        await runArchitecture(
          [],
          JSON.stringify({
            action: result.children?.[1],
            kind: "plan",
            ...plan,
          }),
          root,
        )
      ).code,
    ).toBe(0);
    await expect(
      proposeArchitecture(root, { action: "../escape", kind: "plan", ...plan }),
    ).rejects.toThrow();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
  const docs = await fixture();
  try {
    await expect(
      proposeArchitecture(docs, {
        action: "act-000000",
        kind: "plan",
        ...plan,
      }),
    ).rejects.toThrow(/Discovery|Plan/);
    await startRun(docs, "codex");
    await unlink(join(docs, ".voidra/local/run.lock"));
    await expect(
      proposeArchitecture(docs, {
        action: "act-000000",
        kind: "plan",
        ...plan,
      }),
    ).rejects.toThrow(/Recover unfinished/);
  } finally {
    await rm(docs, { recursive: true, force: true });
  }
});
