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
