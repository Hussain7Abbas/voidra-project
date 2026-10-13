import { cp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";
import {
  collectPlanningDecisions,
  revisitAssumption,
} from "../src/knowledge.ts";
import { checkProject } from "../src/project.ts";
import { serializeRecord } from "../src/records.ts";
import { materialize } from "./helpers.ts";

async function busy(idle = false): Promise<string> {
  const root = await materialize(new Map());
  await cp(resolve("fixtures/busy-project/project"), root, { recursive: true });
  if (idle) {
    const project = await checkProject(root);
    await rm(join(root, ".voidra/local/run.lock"), { force: true });
    for (const record of project.records.values()) {
      const data = record.document.data;
      if (record.kind === "run" && data.outcome === "running")
        await writeFile(
          join(root, record.document.file),
          serializeRecord(record.document, {
            ...data,
            outcome: "interrupted",
            endedAt: data.startedAt,
          }),
        );
      if (record.kind === "action" && data.status === "running")
        await writeFile(
          join(root, record.document.file),
          serializeRecord(record.document, { ...data, status: "ready" }),
        );
    }
    expect((await checkProject(root)).diagnostics).toEqual([]);
  }
  return root;
}
it("collects answered questions, approved plans and assumed profiles without changing their sources", async () => {
  const root = await busy(),
    project = await checkProject(root),
    before = [...project.files].map(([path, bytes]) => [
      path,
      bytes.toString(),
    ]);
  const entries = collectPlanningDecisions(project);
  expect(
    entries.some(
      (e) =>
        e.kind === "question" &&
        e.assumed &&
        e.text.includes("Smallest useful scope"),
    ),
  ).toBe(true);
  expect(entries.some((e) => e.kind === "plan")).toBe(true);
  expect(
    entries.some(
      (e) =>
        e.kind === "profile" && e.assumed && e.title === "What is the goal?",
    ),
  ).toBe(true);
  expect(new Set(entries.map((e) => e.id)).size).toBe(entries.length);
  expect(
    [...project.files].map(([path, bytes]) => [path, bytes.toString()]),
  ).toEqual(before);
  expect(entries.every((e) => /^[a-f0-9]{64}$/.test(e.revision))).toBe(true);
});
it("creates a draft Profile change or linked Research for an unchanged assumption, preserving the original answer", async () => {
  const root = await busy(true);
  for (const kind of ["profile", "question"]) {
    const project = await checkProject(root),
      entry = collectPlanningDecisions(project).find(
        (e) => e.kind === kind && e.assumed,
      );
    if (!entry) throw new Error("Fixture assumption missing");
    const before = await readFile(join(root, entry.path));
    const id = await revisitAssumption(root, {
      id: entry.id,
      revision: entry.revision,
      by: "You",
    });
    const next = await checkProject(root),
      action = next.records.get(`.voidra/actions/${id}/action.md`)?.document
        .data;
    expect(action).toMatchObject({
      type: kind === "profile" ? "profile-change" : "research",
      status: kind === "profile" ? "draft" : "ready",
      doneBy: "agent",
    });
    expect(action?.links).toContain(
      entry.kind === "question"
        ? entry.anchor
        : `${entry.path}#${entry.anchor}`,
    );
    expect(await readFile(join(root, entry.path))).toEqual(before);
    expect(next.diagnostics).toEqual([]);
  }
});
it("refuses stale assumptions and active runs without creating a follow-up", async () => {
  const active = await busy(),
    assumption = collectPlanningDecisions(await checkProject(active)).find(
      (e) => e.assumed,
    );
  if (!assumption) throw new Error("Fixture assumption missing");
  await expect(
    revisitAssumption(active, {
      id: assumption.id,
      revision: assumption.revision,
      by: "You",
    }),
  ).rejects.toThrow(/pending work/);
  const root = await busy(true),
    entry = collectPlanningDecisions(await checkProject(root)).find(
      (e) => e.kind === "profile",
    );
  if (!entry) throw new Error("Fixture assumption missing");
  await writeFile(
    join(root, entry.path),
    `${await readFile(join(root, entry.path), "utf8")}\nOutside note\n`,
  );
  await expect(
    revisitAssumption(root, {
      id: entry.id,
      revision: entry.revision,
      by: "You",
    }),
  ).rejects.toThrow(/changed/);
});
