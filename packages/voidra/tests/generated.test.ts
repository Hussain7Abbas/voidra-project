import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import {
  generatedFiles,
  verifyGenerated,
  writeGenerated,
} from "../scripts/generate.ts";
import { materialize } from "./helpers.ts";

it("exports every schema, preserves unknown fields and checks missing/stale/orphan references", async () => {
  const outputs = generatedFiles();
  expect(outputs.size).toBeGreaterThan(25);
  const schema = JSON.parse(
    outputs.get("docs/format/reference/action.schema.json") ?? "{}",
  );
  expect(schema.additionalProperties).toEqual({});
  expect(schema.properties.id.pattern).toContain("act");
  const root = await materialize(new Map());
  expect((await verifyGenerated(root)).length).toBeGreaterThan(0);
  await writeGenerated(root);
  expect(await verifyGenerated(root)).toEqual([]);
  const path = join(root, "docs/format/reference/action.md");
  await writeFile(path, "stale");
  expect(await verifyGenerated(root)).toContain(
    "docs/format/reference/action.md",
  );
  await writeGenerated(root);
  expect(await readFile(path, "utf8")).toBe(
    outputs.get("docs/format/reference/action.md"),
  );
  await mkdir(join(root, "docs/format/reference/extra"));
  await writeFile(
    join(root, "docs/format/reference/extra/orphan.md"),
    "orphan",
  );
  expect(await verifyGenerated(root)).toContain(
    "docs/format/reference/extra/orphan.md",
  );
  await rm(join(root, "docs/format/reference/extra"), { recursive: true });
});
