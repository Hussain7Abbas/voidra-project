import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { migrateProject } from "../src/migration.ts";
import { checkProject } from "../src/project.ts";
import { parseRecord } from "../src/records.ts";
import { baseFiles, materialize } from "./helpers.ts";
import { markdown, samples } from "./samples.ts";

it("dry-runs, migrates and repeats the prototype migration without dropping unknowns", async () => {
  const files = baseFiles();
  files.set(
    ".voidra/voidra.json",
    Buffer.from(
      JSON.stringify({
        ...samples.project,
        format: 0,
        requiredVoidra: "0.0.0",
        future: "keep",
      }),
    ),
  );
  files.set(
    ".voidra/actions/act-000000/action.md",
    Buffer.from(
      markdown({
        ...samples.action,
        stage: undefined,
        state: "discovery",
        future: "keep",
      }),
    ),
  );
  const root = await materialize(files);
  expect((await migrateProject(root, { dryRun: true })).changed).toBe(true);
  expect(await readFile(join(root, ".voidra/voidra.json"))).toEqual(
    files.get(".voidra/voidra.json"),
  );
  await migrateProject(root);
  expect((await checkProject(root)).diagnostics).toEqual([]);
  expect(
    parseRecord(
      "x.md",
      await readFile(join(root, ".voidra/actions/act-000000/action.md")),
    ).data,
  ).toMatchObject({ stage: "discovery", state: "discovery", future: "keep" });
  expect((await migrateProject(root)).changed).toBe(false);
});
it("never downgrades newer metadata, edits invalid migration inputs or migrates a missing project", async () => {
  for (const format of [2]) {
    const files = baseFiles();
    files.set(
      ".voidra/voidra.json",
      Buffer.from(
        JSON.stringify({ ...samples.project, format, requiredVoidra: "9.0.0" }),
      ),
    );
    const root = await materialize(files);
    await expect(migrateProject(root)).rejects.toThrow(/9.0.0/);
    expect(await readFile(join(root, ".voidra/voidra.json"))).toEqual(
      files.get(".voidra/voidra.json"),
    );
  }
  await expect(migrateProject(await materialize(new Map()))).rejects.toThrow(
    /missing/,
  );
  const files = baseFiles();
  files.set(
    ".voidra/voidra.json",
    Buffer.from(JSON.stringify({ ...samples.project, format: 0 })),
  );
  files.set(
    ".voidra/actions/act-000000/action.md",
    Buffer.from(markdown({ ...samples.action, stage: undefined })),
  );
  await expect(migrateProject(await materialize(files))).rejects.toThrow(
    /invalid/,
  );
});
it("recovers or rolls back an interrupted migration while old metadata still exists", async () => {
  const { recoverOperation } = await import("../src/writer.ts");
  for (const rollback of [false, true]) {
    const files = baseFiles();
    files.set(
      ".voidra/voidra.json",
      Buffer.from(
        JSON.stringify({
          ...samples.project,
          format: 0,
          requiredVoidra: "0.0.0",
        }),
      ),
    );
    files.set(
      ".voidra/actions/act-000000/action.md",
      Buffer.from(
        markdown({ ...samples.action, stage: undefined, state: "discovery" }),
      ),
    );
    const root = await materialize(files);
    let op = "";
    await expect(
      migrateProject(root, {
        checkpoint: async (point, path) => {
          if (point === "journal-prepared") {
            op = path;
            throw new Error("stop");
          }
        },
      }),
    ).rejects.toThrow();
    expect((await recoverOperation(root, op, { rollback })).state).toBe(
      rollback ? "rolled-back" : "committed",
    );
    expect(
      (await recoverOperation(root, op, { rollback })).alreadyCompleted,
    ).toBe(true);
    expect((await checkProject(root)).diagnostics.map((d) => d.code)).toEqual(
      rollback ? ["migration-required"] : [],
    );
  }
});
