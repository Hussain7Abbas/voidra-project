import { readFile, symlink } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { checkProject, inspectFiles } from "../src/project.ts";
import { baseFiles, materialize } from "./helpers.ts";
import { bodies, markdown, samples } from "./samples.ts";

it("validates real files without changing any bytes", async () => {
  const root = await materialize();
  const before = await readFile(join(root, ".voidra/voidra.json"));
  expect((await checkProject(root)).diagnostics).toEqual([]);
  expect(await readFile(join(root, ".voidra/voidra.json"))).toEqual(before);
});
it("gates newer formats before parsing any other records", () => {
  const files = baseFiles();
  files.set(
    ".voidra/voidra.json",
    Buffer.from(
      JSON.stringify({
        ...samples.project,
        format: 99,
        requiredVoidra: "9.0.0",
      }),
    ),
  );
  files.set(".voidra/actions/act-000000/action.md", Buffer.from("broken"));
  expect(inspectFiles(files).diagnostics).toEqual([
    expect.objectContaining({
      code: "newer-format",
      message: expect.stringContaining("9.0.0"),
    }),
  ]);
});
it.each([
  [{ parent: "act-111111" }, "missing-reference"],
  [{ blockedBy: ["act-000000"] }, "dependency-cycle"],
  [{ parent: "act-000000" }, "parent-cycle"],
  [{ links: ["idea-111111"] }, "missing-reference"],
  [{ type: "research", stage: "implement" }, "stage"],
  [{ stage: "implement" }, "stale-approval"],
  [{ stage: "plan", status: "waiting" }, "missing-plan"],
  [{ stage: "discovery", status: "waiting" }, "status"],
])("reports cross-record failure %s", (patch, code) => {
  const files = baseFiles();
  files.set(
    ".voidra/actions/act-000000/action.md",
    Buffer.from(markdown({ ...samples.action, ...patch })),
  );
  expect(inspectFiles(files).diagnostics.map((d) => d.code)).toContain(code);
});
it("checks questions, queue, child completion and file identity", () => {
  const files = baseFiles();
  files.set(
    ".voidra/actions/act-000000/questions.md",
    Buffer.from(
      markdown({
        ...samples.questions,
        rounds: [
          {
            round: 1,
            askedAt: "2026-10-13T00:00:00Z",
            questions: [
              {
                ...samples.questions.rounds[0]?.questions[0],
                answer: undefined,
                dependsOn: ["q-111111"],
              },
            ],
          },
        ],
      }),
    ),
  );
  expect(inspectFiles(files).diagnostics.map((d) => d.code)).toEqual(
    expect.arrayContaining(["question-prerequisite", "status"]),
  );
  files.set(
    ".voidra/local/pending-actions.md",
    Buffer.from(
      markdown(samples.queue, "1. [ ] act-111111\n1. [ ] act-111111\n"),
    ),
  );
  files.set(
    ".voidra/actions/act-111111/action.md",
    Buffer.from(
      markdown({ ...samples.action, id: "act-111111", parent: "act-000000" }),
    ),
  );
  files.set(
    ".voidra/actions/act-000000/action.md",
    Buffer.from(
      markdown({
        ...samples.action,
        type: "docs",
        stage: "done",
        status: "complete",
      }),
    ),
  );
  expect(inspectFiles(files).diagnostics.map((d) => d.code)).toEqual(
    expect.arrayContaining(["parent-incomplete", "queue"]),
  );
  files.set(
    ".voidra/backlog/idea-111111.md",
    Buffer.from(markdown(samples.idea)),
  );
  expect(inspectFiles(files).diagnostics.map((d) => d.code)).toContain(
    "identity",
  );
});
it("rejects truncated, invalid, missing and symlinked records", async () => {
  const root = await materialize();
  await symlink(
    join(root, ".voidra/voidra.json"),
    join(root, ".voidra/profile"),
  );
  expect((await checkProject(root)).diagnostics.map((d) => d.code)).toContain(
    "symlink",
  );
  const files = baseFiles();
  files.delete(".voidra/README.md");
  files.set(".voidra/.gitignore", Buffer.from("!local/\n"));
  files.set(".voidra/actions/act-000000/action.md", Buffer.from("---\na: 1\n"));
  expect(inspectFiles(files).diagnostics.map((d) => d.code)).toEqual(
    expect.arrayContaining(["required-file", "ignore", "incomplete-write"]),
  );
  expect(inspectFiles(new Map()).diagnostics[0]?.code).toBe("required-file");
  files.set(".voidra/voidra.json", Buffer.from("{}"));
  expect(inspectFiles(files).diagnostics[0]?.code).toBe("schema");
});
it("requires exact headings before approvals can be inspected", () => {
  const files = baseFiles();
  for (const file of ["requirements", "blueprint", "acceptance"]) {
    files.set(
      `.voidra/actions/act-000000/${file}.md`,
      Buffer.from(markdown({ action: "act-000000" }, bodies[file])),
    );
  }
  expect(inspectFiles(files).diagnostics).toEqual([]);
});
it("reports conflicts in the plain guide and ignore file too", () => {
  for (const path of [".voidra/README.md", ".voidra/.gitignore"]) {
    const files = baseFiles();
    files.set(
      path,
      Buffer.from("<<<<<<< HEAD\nlocal/\n=======\nother\n>>>>>>> branch\n"),
    );
    expect(inspectFiles(files).diagnostics.map((d) => d.code)).toContain(
      "conflict",
    );
  }
});
