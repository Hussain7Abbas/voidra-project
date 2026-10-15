import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { checkProject } from "../src/project.ts";
import { readProjectRelease } from "../src/project-release.ts";
import { parseRecord, serializeRecord } from "../src/records.ts";
import {
  checkReleasePreparation,
  releaseVersionTickets,
} from "../src/release-preparation.ts";
import { createReleaseAction, releaseCandidates } from "../src/releases.ts";
import { materialize } from "./helpers.ts";

it("binds the source and exact current-version Done subset while preserving all source/member bytes", async () => {
  const root = await materialize();
  await writeFile(join(root, "package.json"), '{"version":"1.2.3"}\n');
  for (const [id, targetRelease] of [
    ["act-000000", "1.2.3"],
    ["act-000001", "1.1.0"],
  ] as const) {
    const path = `.voidra/actions/${id}/action.md`;
    await mkdir(join(root, `.voidra/actions/${id}`), { recursive: true });
    await writeFile(
      join(root, path),
      serializeRecord(parseRecord(path, "---\n{}\n---\n"), {
        id,
        type: "docs",
        title: id,
        stage: "done",
        status: "complete",
        doneBy: "agent",
        targetRelease,
      }),
    );
  }
  // Explicit target metadata already advertises the required reader.
  const meta = ".voidra/voidra.json",
    record = parseRecord(meta, await readFile(join(root, meta)));
  await writeFile(
    join(root, meta),
    serializeRecord(record, { ...record.data, requiredVoidra: "1.1.0" }),
  );
  const project = await checkProject(root),
    source = await readProjectRelease(root),
    actions = releaseCandidates(project),
    tickets = releaseVersionTickets(
      project,
      actions.map((member) => member.id),
      "1.2.3",
    );
  expect(project.diagnostics).toEqual([]);
  expect(tickets.map((ticket) => ticket.id)).toEqual(["act-000000"]);
  if (!source.version || !source.revision)
    throw Error("Missing fixture source");
  const preparation = {
    source: {
      path: source.path,
      version: source.version,
      revision: source.revision,
    },
    version: "1.3.0",
    bump: "minor" as const,
    ticketChoice: "move" as const,
    tickets,
  };
  await expect(
    checkReleasePreparation(
      root,
      project,
      { ...preparation, tickets: [] },
      actions.map((member) => member.id),
    ),
  ).rejects.toThrow(/scope/);
  await expect(
    checkReleasePreparation(
      root,
      project,
      { ...preparation, version: "1.2.3" },
      actions.map((member) => member.id),
    ),
  ).rejects.toThrow(/follow/);
  const before = await readFile(
    join(root, ".voidra/actions/act-000000/action.md"),
  );
  const id = await createReleaseAction(root, {
    actions: actions.map(({ id, revision }) => ({ id, revision })),
    preparation,
    notes: "## Changes\nPreserve **Markdown**.",
    by: "You",
  });
  const after = await checkProject(root);
  expect(after.diagnostics).toEqual([]);
  expect(
    after.records.get(`.voidra/actions/${id}/action.md`)?.document.data
      .releasePreparation,
  ).toEqual(preparation);
  expect(
    await readFile(join(root, ".voidra/actions/act-000000/action.md")),
  ).toEqual(before);
  expect(await readFile(join(root, "package.json"), "utf8")).toBe(
    '{"version":"1.2.3"}\n',
  );
  await writeFile(join(root, "package.json"), '{"version":"1.2.4"}\n');
  await expect(
    checkReleasePreparation(
      root,
      after,
      preparation,
      actions.map((member) => member.id),
    ),
  ).rejects.toThrow(/source changed/);
});
