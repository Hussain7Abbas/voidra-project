import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readProjectFiles } from "voidra";
import {
  generalFiles,
  writeProject,
} from "../../../packages/voidra/scripts/fixtures.ts";
import { proposeArchitecture } from "../src/architecture.ts";

const repository = fileURLToPath(new URL("../../../", import.meta.url));
const bodies = {
  requirements:
    "## Goal\nSave and reopen private project notes offline. A project is a named set of notes owned by one person.\n\n## Out of scope\nTeam sharing, network synchronization and accounts.\n",
  blueprint:
    "## Approach\nUse a local SQLite repository behind the note service and a desktop screen. Keep storage replaceable through the repository interface.\n\n## Testing seams\nTest repository save/load against a real temporary database; service ownership through its public API; and screen save/reopen through Electron. Corrupted data produces a visible diagnostic without silently discarding notes.\n\n## Proposed ADRs\nLocal-only persistence: hard to reverse after notes exist; surprising without context for a project tool; trades collaboration for privacy and offline operation. Propose docs/adr/<date>-local-notes.md after plan approval, during implementation.\n",
  acceptance:
    "- Save a note, restart and reopen identical text.\n- Another owner cannot read the note through the service.\n- A corrupt database reports a recoverable error without deleting it.\n",
};
const proposals = {
  discovery: {
    action: "act-000000",
    kind: "questions",
    questions: [
      {
        text: "Who may read a project?",
        why: "Ownership determines the authorization and persistence boundaries.",
        options: [
          { label: "a", description: "Only its owner", recommended: true },
          { label: "b", description: "A shared team", recommended: false },
        ],
      },
      {
        text: "Must notes work offline?",
        why: "Determines whether network availability can block saving.",
        options: [
          {
            label: "a",
            description: "Yes, all note work is local",
            recommended: true,
          },
          {
            label: "b",
            description: "No, a connection is required",
            recommended: false,
          },
        ],
      },
    ],
  },
  "seams-adr": { action: "act-000000", kind: "plan", ...bodies },
  slices: {
    action: "act-000000",
    kind: "slices",
    slices: [
      {
        title: "Save and reopen one private note",
        description:
          "Persistence, service and screen for a single note; round-trip tests at each public seam.",
      },
      {
        title: "Search saved notes",
        description:
          "Real storage search, service query and visible results; query and screen tests. Blocked until saving works.",
      },
      {
        title: "Delete a saved note safely",
        description:
          "Storage deletion through the service and screen; deletion and recovery tests. Blocked until the previous path works.",
      },
    ],
  },
  bootstrap: {
    action: "act-000000",
    kind: "plan",
    ...bodies,
    requirements:
      bodies.requirements +
      "\nBootstrap installs the agreed TypeScript/Electron project conventions and delivers the first running save/reopen path.\n",
    blueprint:
      bodies.blueprint +
      "\nEstablish AGENTS.md, a reproducible install, formatting and public-boundary checks before the first save path. Run one failing repository round-trip test, implement it, then test the service and screen.\n",
  },
};
const catalog = [];
for (const [name, proposal] of Object.entries(proposals)) {
  const root = await mkdtemp(join(tmpdir(), "voidra-golden-"));
  try {
    await writeProject(root, await generalFiles(repository));
    const result = await proposeArchitecture(root, proposal);
    const files = (await readProjectFiles(root)).files;
    const ids = new Map(
      (result.children ?? []).map((id, i) => [id, `act-00000${i + 1}`]),
    );
    let question = 0;
    for (const bytes of files.values())
      for (const match of bytes.toString().matchAll(/q-[0-9a-hjkmnp-tv-z]{6}/g))
        if (!ids.has(match[0])) ids.set(match[0], `q-00000${question++}`);
    const normalize = (text: string) => {
      for (const [before, after] of ids) text = text.replaceAll(before, after);
      return text.replace(
        /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g,
        "2026-10-13T00:00:00Z",
      );
    };
    const project = `fixtures/architecture/${name}/project`;
    const normalized = new Map(
      [...files]
        .filter(([path]) => !path.startsWith(".voidra/local/"))
        .map(([path, bytes]) => [
          normalize(path),
          Buffer.from(normalize(bytes.toString())),
        ]),
    );
    if (process.argv.includes("--check")) {
      const existing = (await readProjectFiles(resolve(repository, project)))
        .files;
      if (
        existing.size !== normalized.size ||
        [...normalized].some(
          ([path, bytes]) => !existing.get(path)?.equals(bytes),
        )
      )
        throw new Error(`Stale architecture golden: ${name}`);
    } else {
      await rm(resolve(repository, project), { recursive: true, force: true });
      await writeProject(resolve(repository, project), normalized);
    }
    catalog.push({ name, project, gate: result.gate });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
const path = resolve(repository, "fixtures/architecture/catalog.json"),
  content = `${JSON.stringify(catalog, null, 2)}\n`;
if (process.argv.includes("--check")) {
  if ((await readFile(path, "utf8")) !== content)
    throw new Error("Stale architecture catalog");
} else {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
}
