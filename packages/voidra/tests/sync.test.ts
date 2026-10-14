import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { hash } from "../src/lifecycle.ts";
import { checkProject, inspectFiles } from "../src/project.ts";
import { applySyncReport } from "../src/sync.ts";
import type { Template } from "../src/templates.ts";
import { baseFiles, materialize } from "./helpers.ts";
import { markdown, samples } from "./samples.ts";

const head = "a".repeat(40),
  other = "b".repeat(40);
const template: Template = {
  id: "example",
  version: "1.0.0",
  format: 1,
  title: "Example",
  description: "Test",
  architectureSkill: "example",
  blocks: [
    {
      id: "problem",
      title: "Problem",
      help: "Test",
      questions: [
        { id: "goal", question: "Goal?", type: "short-text", help: "Test" },
        { id: "workflow", question: "Workflow?", type: "list", help: "Test" },
      ],
    },
  ],
};
async function setup() {
  const files = baseFiles();
  files.set(
    ".voidra/voidra.json",
    Buffer.from(
      JSON.stringify({
        ...samples.project,
        template: { id: template.id, version: template.version },
      }),
    ),
  );
  files.set(
    ".voidra/profile/problem.md",
    Buffer.from(
      markdown(
        {
          ...samples.profile,
          future: "retained",
          answers: [
            ...samples.profile.answers,
            {
              id: "workflow",
              question: "Workflow?",
              answer: ["Old"],
              status: "inferred",
              future: true,
            },
          ],
        },
        "Existing notes.\n",
      ),
    ),
  );
  return materialize(files);
}
const report = {
  examinedRevision: head,
  since: null,
  commits: [head],
  by: "Sync agent",
  summary: "Examined outside changes.",
  profiles: [],
  ideas: [],
  actions: [],
};

it("protects confirmed answers, infers other updates and saves source-linked proposals with one sync record", async () => {
  const root = await setup(),
    path = ".voidra/profile/problem.md";
  const before = await readFile(join(root, path));
  const result = await applySyncReport(root, template, {
    ...report,
    profiles: [
      {
        block: "problem",
        id: "goal",
        value: "A changed goal",
        revision: hash(before),
        commit: head,
        source: "README.md",
      },
      {
        block: "problem",
        id: "workflow",
        value: ["New"],
        revision: hash(before),
        commit: head,
        source: "README.md",
      },
    ],
    ideas: [
      {
        title: "Document the new workflow",
        body: "Explain its usage.",
        commits: [head],
      },
    ],
    actions: [
      {
        type: "research",
        title: "Assess migration",
        body: "Measure compatibility.",
        commits: [head],
      },
    ],
  });
  const project = await checkProject(root);
  expect(project.diagnostics).toEqual([]);
  const profile = project.records.get(path)?.document;
  expect(profile?.data).toMatchObject({
    future: "retained",
    answers: [
      { answer: "A working example", status: "confirmed" },
      {
        answer: ["New"],
        status: "inferred",
        future: true,
        source: expect.stringContaining(head),
      },
    ],
  });
  expect(profile?.body).toBe("Existing notes.\n");
  expect(result.proposals).toHaveLength(3);
  const proposed = project.records.get(
    `.voidra/actions/${result.proposals[0]}/action.md`,
  );
  expect(proposed?.document.data).toMatchObject({
    type: "profile-change",
    status: "draft",
    profileChange: {
      before: "A working example",
      after: "A changed goal",
    },
  });
  expect(project.records.get(result.path)?.document.data).toMatchObject({
    examinedRevision: head,
    proposals: result.proposals,
  });
  expect(project.files.has(".voidra/local/pending-actions.md")).toBe(false);
  const repeat = await applySyncReport(root, template, report);
  expect(repeat).toMatchObject({
    id: result.id,
    repeated: true,
    proposals: result.proposals,
  });
});

it("refuses stale profile bytes, wrong template types and evidence outside the examined commits without writing", async () => {
  const root = await setup(),
    path = ".voidra/profile/problem.md",
    before = await readFile(join(root, path));
  const update = {
    block: "problem",
    id: "workflow",
    value: ["New"],
    revision: hash(before),
    commit: head,
    source: "README.md",
  };
  for (const profiles of [
    [{ ...update, revision: "0".repeat(64) }],
    [{ ...update, value: "Not a list" }],
    [{ ...update, commit: other }],
    [{ ...update, id: "missing" }],
  ])
    await expect(
      applySyncReport(root, template, { ...report, profiles }),
    ).rejects.toThrow();
  await expect(
    applySyncReport(root, null, { ...report, profiles: [update] }),
  ).rejects.toThrow(/template/i);
  await expect(
    applySyncReport(root, template, {
      ...report,
      ideas: [{ title: "Idea", body: "Evidence", commits: [other] }],
    }),
  ).rejects.toThrow(/commit/i);
  expect(await readFile(join(root, path))).toEqual(before);
  expect(
    [...(await checkProject(root)).records.values()].filter(
      (r) => r.kind === "sync",
    ),
  ).toHaveLength(0);
});

it("serializes simultaneous syncs and diagnoses invalid record identity, references and minimum reader", async () => {
  const root = await setup();
  const results = await Promise.allSettled([
    applySyncReport(root, template, report),
    applySyncReport(root, template, report),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  const project = await checkProject(root),
    files = new Map(project.files);
  const record = [...project.records.values()].find((r) => r.kind === "sync");
  if (!record) throw new Error("Missing sync");
  files.delete(record.document.file);
  files.set(
    ".voidra/syncs/sync-000000.md",
    Buffer.from(
      markdown({ ...record.document.data, proposals: ["idea-999999"] }),
    ),
  );
  files.set(
    ".voidra/voidra.json",
    Buffer.from(JSON.stringify(samples.project)),
  );
  expect(inspectFiles(files).diagnostics.map((d) => d.code)).toEqual(
    expect.arrayContaining(["identity", "missing-reference", "minimum-reader"]),
  );
});

it("preserves identical confirmed bytes, rejects duplicate or missing updates and blocks unfinished work", async () => {
  const root = await setup(),
    path = ".voidra/profile/problem.md",
    before = await readFile(join(root, path));
  const update = {
    block: "problem",
    id: "goal",
    value: "A working example",
    revision: hash(before),
    commit: head,
    source: "README.md",
  };
  await expect(
    applySyncReport(root, template, { ...report, profiles: [update, update] }),
  ).rejects.toThrow(/duplicate/i);
  await expect(
    applySyncReport(root, template, { ...report, commits: [head, head] }),
  ).rejects.toThrow(/duplicate/i);
  await expect(
    applySyncReport(root, template, {
      ...report,
      profiles: [{ ...update, block: "missing" }],
    }),
  ).rejects.toThrow(/block/i);
  await expect(
    applySyncReport(
      root,
      { ...template, version: "2.0.0" },
      { ...report, profiles: [update] },
    ),
  ).rejects.toThrow(/template/i);
  const result = await applySyncReport(root, template, {
    ...report,
    profiles: [update],
  });
  expect(result.proposals).toEqual([]);
  expect(await readFile(join(root, path))).toEqual(before);
  await mkdir(join(root, ".voidra/local"), { recursive: true });
  await writeFile(join(root, ".voidra/local/run.lock"), "{}");
  await expect(
    applySyncReport(root, template, { ...report, examinedRevision: other }),
  ).rejects.toThrow(/pending/i);
});
