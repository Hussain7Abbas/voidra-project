import { spawnSync } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { largeFiles, writeProject } from "../scripts/fixtures.ts";
import { checkProject, readProjectFiles } from "../src/project.ts";
import { parseRecord, serializeRecord } from "../src/records.ts";
import { materialize } from "./helpers.ts";

const catalog = JSON.parse(await readFile("fixtures/catalog.json", "utf8")) as {
  name: string;
  project: string;
  expected: string;
}[];

for (const entry of catalog)
  it(`matches the API and built CLI snapshot: ${entry.name}`, async () => {
    const project = resolve(entry.project);
    await mkdir(project, { recursive: true });
    const expected = JSON.parse(await readFile(entry.expected, "utf8"));
    const result = await checkProject(project);
    expect(result.diagnostics).toEqual(expected.diagnostics);
    const cli = spawnSync(
      process.execPath,
      [
        resolve("packages/voidra/dist/cli-entry.js"),
        "check",
        project,
        "--json",
      ],
      { encoding: "utf8" },
    );
    expect(cli.status, cli.stderr).toBe(expected.exitCode);
    expect(JSON.parse(cli.stdout).diagnostics).toEqual(expected.diagnostics);
    if (["new-project", "busy-project"].includes(entry.name))
      expect(expected.exitCode).toBe(0);
    else expect(expected.exitCode).toBe(1);
    for (const record of result.records.values())
      expect(
        serializeRecord(parseRecord(record.document.file, record.document.raw)),
      ).toEqual(Buffer.from(record.document.raw));
  });
it("generates and validates 1,000 actions without committing large output", async () => {
  const root = await materialize(new Map());
  await writeProject(root, largeFiles());
  const files = await readProjectFiles(root);
  expect(files.files.size).toBe(1003);
  const result = await checkProject(root);
  expect(result.diagnostics).toEqual([]);
  expect(result.records.size).toBe(1001);
});
