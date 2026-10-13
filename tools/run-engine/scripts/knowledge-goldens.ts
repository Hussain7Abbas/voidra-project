import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  approveAction,
  checkProject,
  getPlanRevision,
  readProjectFiles,
} from "voidra";
import { writeProject } from "../../../packages/voidra/scripts/fixtures.ts";
import { proposeArchitecture } from "../src/architecture.ts";

const repository = fileURLToPath(new URL("../../../", import.meta.url));
const date = "2026-10-14",
  time = `${date}T00:00:00Z`;
const cases = [
  { name: "qualifying-date", adr: `docs/adr/${date}-local-notes.md` },
  { name: "existing-naming", adr: "docs/adr/0002-local-notes.md" },
  { name: "non-qualifying", adr: null },
  { name: "settled-glossary", adr: null },
] as const;
const catalog: { name: string; project: string; adr: string | null }[] = [];
for (const scenario of cases) {
  const root = await mkdtemp(join(tmpdir(), "voidra-knowledge-golden-"));
  try {
    await cp(resolve(repository, "fixtures/new-project/project"), root, {
      recursive: true,
    });
    const glossary =
      "# Glossary\n\n**Owner**: the person who may read a project.\n";
    await writeFile(join(root, "GLOSSARY.md"), glossary);
    if (scenario.name === "existing-naming") {
      await mkdir(join(root, "docs/adr"), { recursive: true });
      await writeFile(
        join(root, "docs/adr/0001-storage-boundary.md"),
        "# Storage boundary\n\nThe repository interface owns persistence.\n",
      );
    }
    const criteria = scenario.adr
      ? `Local-only persistence: hard to reverse after notes exist; surprising without context for a project tool; trades collaboration for privacy and offline operation. After approval write ${scenario.adr}.`
      : "None. Choosing a label for the local save button is easy to reverse, expected in context, and has no architectural trade-off. Keep this choice in the action.";
    await proposeArchitecture(root, {
      action: "act-000000",
      kind: "plan",
      requirements:
        "## Goal\nSave and reopen private notes offline.\n\n## Out of scope\nNetwork synchronization and accounts.\n",
      blueprint: `## Approach\nUse the existing repository boundary.\n\n## Testing seams\nSave/reopen through the public service using real temporary files.\n\n## Proposed ADRs\n${criteria}\n`,
      acceptance:
        "- Saved notes reopen with identical text.\n- Settled terms preserve existing definitions.\n",
      ...(scenario.name === "settled-glossary"
        ? {
            glossary: `${glossary}\n**Note**: a saved text entry owned by one person.\n`,
          }
        : {}),
    });
    // Normalize proposal timestamps before approval so its exact hashes stay valid.
    for (const [path, bytes] of (await readProjectFiles(root)).files)
      if (!path.startsWith(".voidra/local/"))
        await writeFile(
          join(root, path),
          bytes
            .toString()
            .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g, time),
        );
    await approveAction(
      root,
      "act-000000",
      "Golden reviewer",
      (await getPlanRevision(root, "act-000000")).revision,
    );
    if (scenario.adr) {
      await mkdir(join(root, "docs/adr"), { recursive: true });
      await writeFile(
        join(root, scenario.adr),
        `---\n{date: '${date}', action: act-000000, by: Golden reviewer}\n---\n# Local notes\n\n## Context\nNotes must work offline and stay private. This decision is hard to reverse once user data exists and surprising for a project tool without that constraint.\n\n## Alternatives\nCloud storage provides collaboration but needs accounts and connectivity. Local files preserve privacy and offline access.\n\n## Decision\nKeep notes local behind the existing repository boundary. Approved in [act-000000](../../.voidra/actions/act-000000/action.md).\n\n## Consequences\nOffline saving works; collaboration needs a later migration and a new decision.\n`,
      );
    }
    const files = new Map(
      [...(await readProjectFiles(root)).files]
        .filter(([path]) => !path.startsWith(".voidra/local/"))
        .map(([path, bytes]) => [
          path,
          Buffer.from(
            bytes
              .toString()
              .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g, time),
          ),
        ]),
    );
    // Long-lived docs are outside the planning-file reader by design.
    files.set("GLOSSARY.md", await readFile(join(root, "GLOSSARY.md")));
    if (scenario.adr)
      files.set(scenario.adr, await readFile(join(root, scenario.adr)));
    if (scenario.name === "existing-naming")
      files.set(
        "docs/adr/0001-storage-boundary.md",
        await readFile(join(root, "docs/adr/0001-storage-boundary.md")),
      );
    const project = `fixtures/knowledge/${scenario.name}/project`,
      destination = resolve(repository, project);
    if (process.argv.includes("--check")) {
      const existing = new Map((await readProjectFiles(destination)).files);
      existing.set(
        "GLOSSARY.md",
        await readFile(join(destination, "GLOSSARY.md")),
      );
      if (scenario.adr)
        existing.set(
          scenario.adr,
          await readFile(join(destination, scenario.adr)),
        );
      if (scenario.name === "existing-naming")
        existing.set(
          "docs/adr/0001-storage-boundary.md",
          await readFile(
            join(destination, "docs/adr/0001-storage-boundary.md"),
          ),
        );
      if (
        existing.size !== files.size ||
        [...files].some(([path, bytes]) => !existing.get(path)?.equals(bytes))
      )
        throw new Error(`Stale knowledge golden: ${scenario.name}`);
    } else {
      await rm(destination, { recursive: true, force: true });
      await writeProject(destination, files);
    }
    const checked = await checkProject(destination);
    if (checked.diagnostics.length)
      throw new Error(JSON.stringify(checked.diagnostics));
    catalog.push({ name: scenario.name, project, adr: scenario.adr });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
const path = resolve(repository, "fixtures/knowledge/catalog.json"),
  content = `${JSON.stringify(catalog, null, 2)}\n`;
if (process.argv.includes("--check")) {
  if ((await readFile(path, "utf8")) !== content)
    throw new Error("Stale knowledge catalog");
} else {
  await mkdir(join(repository, "fixtures/knowledge"), { recursive: true });
  await writeFile(path, content);
}
