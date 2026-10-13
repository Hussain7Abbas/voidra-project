import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { getPlanRevision } from "../src/approval.ts";
import { decideReview, reviewRevision } from "../src/gates.ts";
import { collectPlanningDecisions } from "../src/knowledge.ts";
import { hash } from "../src/lifecycle.ts";
import { checkProject } from "../src/project.ts";
import { parseRecord, serializeRecord } from "../src/records.ts";
import { createReleaseAction, releaseCandidates } from "../src/releases.ts";
import { applyOperation } from "../src/writer.ts";
import { materialize } from "./helpers.ts";

async function fixture() {
  const root = await materialize();
  for (const [id, stage] of [
    ["act-000000", "done"],
    ["act-000001", "released"],
    ["act-000002", "implement"],
  ] as const) {
    const path = `.voidra/actions/${id}/action.md`;
    await mkdir(join(root, `.voidra/actions/${id}`), { recursive: true });
    await writeFile(
      join(root, path),
      serializeRecord(
        parseRecord(path, "---\n{}\n---\n"),
        {
          id,
          type: "docs",
          title: id,
          stage,
          status: stage === "implement" ? "ready" : "complete",
          doneBy: "agent",
        },
        "Fixture documentation.\n",
      ),
    );
  }
  expect((await checkProject(root)).diagnostics).toEqual([]);
  return root;
}
it("picks only done, unreleased actions and creates a source-guarded Release at Plan without changing members", async () => {
  const root = await fixture(),
    before = await checkProject(root),
    candidates = releaseCandidates(before);
  expect(candidates.map((candidate) => candidate.id)).toEqual(["act-000000"]);
  const member = await readFile(
    join(root, ".voidra/actions/act-000000/action.md"),
  );
  const id = await createReleaseAction(root, {
    actions: candidates.map(({ id, revision }) => ({ id, revision })),
    by: "You",
  });
  const after = await checkProject(root);
  expect(after.diagnostics).toEqual([]);
  expect(
    after.records.get(`.voidra/actions/${id}/action.md`)?.document.data,
  ).toMatchObject({
    type: "release",
    stage: "plan",
    status: "ready",
    releaseActions: ["act-000000"],
  });
  expect(
    await readFile(join(root, ".voidra/actions/act-000000/action.md")),
  ).toEqual(member);
  expect(releaseCandidates(after)).toEqual([]);
});
it("refuses stale, duplicate, unfinished or actively consumed selections", async () => {
  const root = await fixture(),
    selected = releaseCandidates(await checkProject(root)).map(
      ({ id, revision }) => ({ id, revision }),
    );
  await expect(
    createReleaseAction(root, {
      actions: [...selected, ...selected],
      by: "You",
    }),
  ).rejects.toThrow(/duplicate/i);
  await expect(
    createReleaseAction(root, {
      actions: [{ id: "act-000002", revision: "a".repeat(64) }],
      by: "You",
    }),
  ).rejects.toThrow(/done|eligible/i);
  const path = join(root, ".voidra/actions/act-000000/action.md");
  await writeFile(path, `${await readFile(path, "utf8")}\nOutside change\n`);
  await expect(
    createReleaseAction(root, { actions: selected, by: "You" }),
  ).rejects.toThrow(/changed|revision/i);
  await mkdir(join(root, ".voidra/local"), { recursive: true });
  await writeFile(join(root, ".voidra/local/run.lock"), "{}");
  await expect(
    createReleaseAction(root, {
      actions: releaseCandidates(await checkProject(root)).map(
        ({ id, revision }) => ({ id, revision }),
      ),
      by: "You",
    }),
  ).rejects.toThrow(/pending|run|recover/i);
});
it("concurrent release selections reserve completed actions once", async () => {
  const root = await fixture(),
    actions = releaseCandidates(await checkProject(root)).map(
      ({ id, revision }) => ({ id, revision }),
    );
  const outcomes = await Promise.allSettled([
    createReleaseAction(root, { actions, by: "First" }),
    createReleaseAction(root, { actions, by: "Second" }),
  ]);
  expect(
    outcomes.filter((result) => result.status === "fulfilled"),
  ).toHaveLength(1);
  const project = await checkProject(root);
  expect(project.diagnostics).toEqual([]);
  expect(
    [...project.records.values()].filter(
      (record) =>
        record.kind === "action" && record.document.data.type === "release",
    ),
  ).toHaveLength(1);
  expect(releaseCandidates(project)).toEqual([]);
});
it("release acceptance binds selected work, version and exact notes, and rejects a changed displayed proposal", async () => {
  const root = await fixture(),
    actions = releaseCandidates(await checkProject(root)).map(
      ({ id, revision }) => ({ id, revision }),
    ),
    id = await createReleaseAction(root, { actions, by: "You" }),
    path = `.voidra/actions/${id}/action.md`,
    doc = parseRecord(path, await readFile(join(root, path)));
  const plans = {
    "requirements.md":
      "## Goal\nRelease completed docs.\n## Out of scope\nPublishing.\n",
    "blueprint.md":
      "## Approach\nBump version and tag locally.\n## Testing seams\nActual Git and version file.\n## Proposed ADRs\nNone.\n",
    "acceptance.md": "- Release the selected work once.\n",
  };
  const recordPath = ".voidra/releases/1.0.0.md",
    record = serializeRecord(
      parseRecord(recordPath, "---\n{}\n---\n"),
      {
        version: "1.0.0",
        actions: ["act-000000"],
        status: "draft",
        tag: "v1.0.0",
        action: id,
      },
      "## Notes\nCompleted documentation.\n",
    );
  const runPath = `.voidra/actions/${id}/runs/2026-10-14T000000Z-codex-run-000000.md`;
  await applyOperation(root, {
    changes: [
      {
        path,
        expectedHash: hash(doc.raw),
        content: serializeRecord(doc, {
          ...doc.data,
          stage: "review",
          status: "waiting",
          releaseVersion: "1.0.0",
          releaseTag: "v1.0.0",
        }).toString(),
      },
      ...Object.entries(plans).map(([file, body]) => {
        const path = `.voidra/actions/${id}/${file}`;
        return {
          path,
          expectedHash: null,
          content: serializeRecord(
            parseRecord(path, "---\n{}\n---\n"),
            { action: id },
            body,
          ).toString(),
        };
      }),
      { path: recordPath, expectedHash: null, content: record.toString() },
      {
        path: runPath,
        expectedHash: null,
        content: serializeRecord(
          parseRecord(runPath, "---\n{}\n---\n"),
          {
            id: "run-000000",
            action: id,
            agent: "codex",
            fromStage: "plan",
            toStage: "review",
            startedAt: "2026-10-14T00:00:00Z",
            endedAt: "2026-10-14T00:00:01Z",
            outcome: "waiting",
            consumedRecords: [id, "act-000000"],
          },
          "Scripted completed proposal for the public gate test.\n",
        ).toString(),
      },
    ],
  });
  const displayed = reviewRevision(await checkProject(root), id),
    before = await getPlanRevision(root, id);
  await writeFile(
    join(root, recordPath),
    record.toString().replace("Completed documentation.", "Changed notes."),
  );
  expect((await getPlanRevision(root, id)).revision).not.toBe(before.revision);
  await expect(
    decideReview(root, id, displayed, "accepted", "", "You"),
  ).rejects.toThrow(/changed|revision/i);
  await writeFile(join(root, recordPath), record);
  await decideReview(
    root,
    id,
    reviewRevision(await checkProject(root), id),
    "accepted",
    "",
    "You",
  );
  expect((await checkProject(root)).diagnostics).toEqual([]);
  const accepted = parseRecord(path, await readFile(join(root, path)));
  expect(
    collectPlanningDecisions(await checkProject(root)).find(
      (entry) => entry.kind === "plan" && entry.action === id,
    )?.text,
  ).toContain("Completed documentation.");
  expect(accepted.data).toMatchObject({ stage: "review", status: "ready" });
  await writeFile(
    join(root, path),
    serializeRecord(accepted, {
      ...accepted.data,
      releaseActions: ["act-000000", "act-000002"],
    }),
  );
  expect(
    (await checkProject(root)).diagnostics.some(
      (d) => d.code === "stale-review",
    ),
  ).toBe(true);
});
