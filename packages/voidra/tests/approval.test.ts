import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { approveAction, getPlanRevision } from "../src/approval.ts";
import { planFiles } from "../src/lifecycle.ts";
import { checkProject } from "../src/project.ts";
import { parseRecord } from "../src/records.ts";
import { baseFiles, materialize } from "./helpers.ts";
import { bodies, markdown, samples } from "./samples.ts";

async function planned(type = "feature", stage = "plan"): Promise<string> {
  const files = baseFiles();
  files.set(
    ".voidra/actions/act-000000/action.md",
    Buffer.from(
      markdown({ ...samples.action, type, stage, status: "waiting" }),
    ),
  );
  for (const file of planFiles)
    files.set(
      `.voidra/actions/act-000000/${file}`,
      Buffer.from(
        markdown({ action: "act-000000" }, bodies[file.replace(".md", "")]),
      ),
    );
  return materialize(files);
}
it("approves only the displayed bytes and preserves previous approvals", async () => {
  const root = await planned();
  let revision = await getPlanRevision(root, "act-000000");
  await approveAction(root, "act-000000", "You", revision.revision);
  expect((await checkProject(root)).diagnostics).toEqual([]);
  for (const file of planFiles) {
    const path = join(root, `.voidra/actions/act-000000/${file}`);
    await writeFile(path, `${await readFile(path, "utf8")} \n`);
    expect((await checkProject(root)).diagnostics.map((d) => d.code)).toContain(
      "stale-approval",
    );
    await expect(
      approveAction(root, "act-000000", "You", revision.revision),
    ).rejects.toThrow(/revision/);
    revision = await getPlanRevision(root, "act-000000");
    await approveAction(root, "act-000000", "You", revision.revision);
    expect((await checkProject(root)).diagnostics).toEqual([]);
  }
  const record = parseRecord(
    "action.md",
    await readFile(join(root, ".voidra/actions/act-000000/action.md")),
  );
  expect(record.data.approvalHistory).toHaveLength(3);
});
it("rejects missing, invalid, changed-between-display-and-write and unrelated gates", async () => {
  const root = await planned();
  const revision = await getPlanRevision(root, "act-000000");
  await expect(
    approveAction(root, "act-000000", "You", revision.revision, {
      checkpoint: async (p) => {
        if (p === "validated")
          await writeFile(
            join(root, ".voidra/actions/act-000000/requirements.md"),
            "changed",
          );
      },
    }),
  ).rejects.toThrow(/conflict/);
  await expect(getPlanRevision(root, "../outside")).rejects.toThrow(/ID/);
  await expect(getPlanRevision(root, "act-111111")).rejects.toThrow(/missing/);
  for (const type of ["docs", "research"]) {
    const other = await planned(type, "review");
    await expect(
      approveAction(
        other,
        "act-000000",
        "You",
        (await getPlanRevision(other, "act-000000")).revision,
      ),
    ).rejects.toThrow(/approval/);
  }
});
it("release approval stays in Review; changed plan bytes invalidate review", async () => {
  const root = await planned("release", "review");
  const revision = await getPlanRevision(root, "act-000000");
  await approveAction(root, "act-000000", "You", revision.revision);
  const record = parseRecord(
    "action.md",
    await readFile(join(root, ".voidra/actions/act-000000/action.md")),
  );
  expect(record.data.stage).toBe("review");
  expect(record.data.status).toBe("ready");
  expect(record.data.planApproval).toBeUndefined();
  await writeFile(
    join(root, ".voidra/actions/act-000000/acceptance.md"),
    "---\naction: act-000000\n---\n- Changed criterion.\n",
  );
  expect((await checkProject(root)).diagnostics.map((d) => d.code)).toContain(
    "stale-review",
  );
  const updated = await getPlanRevision(root, "act-000000");
  await approveAction(root, "act-000000", "You", updated.revision);
  const approved = parseRecord(
    "action.md",
    await readFile(join(root, ".voidra/actions/act-000000/action.md")),
  );
  expect(approved.data.reviewHistory).toHaveLength(1);
  expect((await checkProject(root)).diagnostics).toEqual([]);
});

it("allows independent fresh approvals when two actions have stale plans, without changing the other action", async () => {
  const root = await planned(),
    { createAction, applyOperation, serializeRecord, hash } = await import(
      "../src/index.ts"
    );
  const other = await createAction(root, {
    type: "feature",
    title: "Second",
    description: "A separate action",
    by: "You",
  });
  const project = await checkProject(root),
    path = `.voidra/actions/${other}/action.md`,
    doc = project.records.get(path)?.document;
  if (!doc) throw new Error("Missing action");
  await applyOperation(root, {
    changes: [
      {
        path,
        expectedHash: hash(doc.raw),
        content: serializeRecord(doc, {
          ...doc.data,
          stage: "plan",
          status: "waiting",
        }).toString(),
      },
      ...planFiles.map((file) => ({
        path: `.voidra/actions/${other}/${file}`,
        expectedHash: null,
        content: markdown({ action: other }, bodies[file.replace(".md", "")]),
      })),
    ],
  });
  for (const id of ["act-000000", other])
    await approveAction(
      root,
      id,
      "You",
      (await getPlanRevision(root, id)).revision,
    );
  for (const id of ["act-000000", other]) {
    const path = join(root, `.voidra/actions/${id}/blueprint.md`);
    await writeFile(path, `${await readFile(path, "utf8")} \n`);
  }
  const otherPath = join(root, `.voidra/actions/${other}/action.md`),
    before = await readFile(otherPath, "utf8");
  await approveAction(
    root,
    "act-000000",
    "You",
    (await getPlanRevision(root, "act-000000")).revision,
  );
  expect(await readFile(otherPath, "utf8")).toBe(before);
  expect((await checkProject(root)).diagnostics.map((d) => d.code)).toEqual([
    "stale-approval",
  ]);
  await approveAction(
    root,
    other,
    "You",
    (await getPlanRevision(root, other)).revision,
  );
  expect((await checkProject(root)).diagnostics).toEqual([]);
});

it("guards an absent questions file and refuses work on an action whose own gate remains stale", async () => {
  const root = await planned();
  const revision = await getPlanRevision(root, "act-000000");
  await expect(
    approveAction(root, "act-000000", "You", revision.revision, {
      checkpoint: async (point) => {
        if (point === "validated")
          await writeFile(
            join(root, ".voidra/actions/act-000000/questions.md"),
            markdown(samples.questions),
          );
      },
    }),
  ).rejects.toThrow(/conflict/);
  const { recoverOperation, applyOperation, hash, serializeRecord } =
    await import("../src/index.ts");
  const project = await checkProject(root),
    operation = [...project.records.values()].find(
      (r) => r.kind === "operation" && r.document.data.state === "prepared",
    );
  expect(
    await readFile(
      join(root, ".voidra/actions/act-000000/questions.md"),
      "utf8",
    ),
  ).toBe(markdown(samples.questions));
  // Restore only this disposable fixture's deliberate outside edit before recovery.
  const { unlink } = await import("node:fs/promises");
  await unlink(join(root, ".voidra/actions/act-000000/questions.md"));
  if (operation)
    await recoverOperation(root, String(operation.document.data.id), {
      rollback: true,
    });
  await approveAction(
    root,
    "act-000000",
    "You",
    (await getPlanRevision(root, "act-000000")).revision,
  );
  const blueprint = join(root, ".voidra/actions/act-000000/blueprint.md");
  await writeFile(blueprint, `${await readFile(blueprint, "utf8")} \n`);
  const path = ".voidra/actions/act-000000/action.md",
    doc = (await checkProject(root)).records.get(path)?.document;
  if (!doc) throw new Error("Missing action");
  await expect(
    applyOperation(root, {
      changes: [
        {
          path,
          expectedHash: hash(doc.raw),
          content: serializeRecord(doc, {
            ...doc.data,
            title: "Unapproved work",
          }).toString(),
        },
      ],
    }),
  ).rejects.toThrow(/invalid/);
});
