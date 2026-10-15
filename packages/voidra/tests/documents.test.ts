import { mkdir, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import {
  listProjectAdrs,
  parseAdr,
  readProjectDocument,
} from "../src/documents.ts";
import { materialize } from "./helpers.ts";

it("reads ordinary and frontmatter ADRs with existing names, dates and source hashes", async () => {
  const root = await materialize();
  await mkdir(join(root, "docs/adr"), { recursive: true });
  await writeFile(
    join(root, "docs/adr/2026-10-13-storage.md"),
    "# Storage trade-off\n\n## Decision\nUse local storage.\n",
  );
  await writeFile(
    join(root, "docs/adr/ADR-0042.md"),
    "---\ntitle: Existing naming\ndate: 2026-10-12\nby: Team\n---\n# Decision\nKeep current naming.\n",
  );
  const { entries, problems } = await listProjectAdrs(root);
  expect(problems).toEqual([]);
  expect(entries.map((e) => e.title).sort()).toEqual([
    "Existing naming",
    "Storage trade-off",
  ]);
  expect(entries.find((e) => e.path.endsWith("ADR-0042.md"))).toMatchObject({
    at: "2026-10-12",
    by: "Team",
  });
  expect(entries.every((e) => /^[a-f0-9]{64}$/.test(e.revision))).toBe(true);
  expect(
    parseAdr("docs/adr/custom.md", Buffer.from("# Custom\n")).at,
  ).toBeNull();
});
it("contains document reads and rejects private/source paths, traversal and symlinks", async () => {
  const root = await materialize(),
    outside = await materialize();
  await mkdir(join(root, "docs"), { recursive: true });
  await writeFile(
    join(root, "GLOSSARY.md"),
    "# Glossary\n\nAction: A unit of work.\n",
  );
  expect((await readProjectDocument(root, "GLOSSARY.md")).body).toContain(
    "unit of work",
  );
  await writeFile(join(outside, "secret.md"), "Outside content");
  await symlink(join(outside, "secret.md"), join(root, "docs/link.md"));
  await symlink(outside, join(root, "docs/alias"));
  for (const path of [
    "../secret.md",
    "docs/../secret.md",
    ".voidra/voidra.json",
    "source.ts",
    "/absolute.md",
    "docs/link.md",
    "docs/alias/secret.md",
  ])
    await expect(readProjectDocument(root, path)).rejects.toThrow(
      /path|symlink|document/i,
    );
});
it("lists unreadable or invalid ADRs as problems and bounds document bodies", async () => {
  const root = await materialize();
  await mkdir(join(root, "docs/adr"), { recursive: true });
  await writeFile(join(root, "docs/adr/invalid.md"), Buffer.from([0xff]));
  await writeFile(join(root, "docs/adr/huge.md"), "a".repeat(256 * 1024 + 1));
  const result = await listProjectAdrs(root);
  expect(result.entries).toEqual([]);
  expect(result.problems.map((p) => p.path).sort()).toEqual([
    "docs/adr/huge.md",
    "docs/adr/invalid.md",
  ]);
  const empty = await listProjectAdrs(await materialize());
  expect(empty).toEqual({ entries: [], problems: [] });
});
it("inventories bounded nested docs without following linked folders or exposing other sources", async () => {
  const { listProjectDocuments } = await import("../src/documents.ts");
  const root = await materialize(),
    outside = await materialize();
  await mkdir(join(root, "docs/nested"), { recursive: true });
  await writeFile(join(root, "docs/nested/page.md"), "# Page\n\nOriginal\r\n");
  await writeFile(join(root, "GLOSSARY.md"), "# Glossary\n");
  await writeFile(join(root, "docs/ignored.txt"), "not indexed");
  await writeFile(join(outside, "hidden.md"), "secret");
  await symlink(outside, join(root, "docs/linked"));
  const result = await listProjectDocuments(root);
  expect(result.entries.map((doc) => doc.path)).toEqual([
    "GLOSSARY.md",
    "docs/nested/page.md",
  ]);
  expect(result.entries[1]?.body).toContain("Original\r\n");
  expect(result.problems).toEqual([
    { path: "docs/linked", message: "Document path contains a symlink" },
  ]);
});
