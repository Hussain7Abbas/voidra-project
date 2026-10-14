import { execFileSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkProject, hash, readProjectFiles } from "voidra";
import { writeProject } from "../../../packages/voidra/scripts/fixtures.ts";
import { applySync, syncContext } from "../src/sync.ts";

const repository = fileURLToPath(new URL("../../../", import.meta.url));
const root = await mkdtemp(join(tmpdir(), "voidra-sync-golden-"));
try {
  await cp(resolve(repository, "fixtures/new-project/project"), root, {
    recursive: true,
  });
  await writeFile(
    join(root, "README.md"),
    "# Existing app\n\nOutside work adds a documented workflow.\n",
  );
  for (const args of [
    ["init", "-q"],
    ["config", "user.name", "Sync golden"],
    ["config", "user.email", "sync@example.test"],
    ["add", "."],
    ["commit", "-qm", "Document outside workflow"],
  ])
    execFileSync("git", args, { cwd: root, stdio: "pipe" });
  const context = await syncContext(root),
    path = ".voidra/profile/problem.md",
    revision = hash(await readFile(join(root, path)));
  if (!context.examinedRevision) throw new Error("Missing golden Git revision");
  const result = await applySync(root, {
    examinedRevision: context.examinedRevision,
    since: context.since,
    commits: context.commits.map((commit) => commit.hash),
    summary:
      "Reviewed the outside workflow commit. The confirmed goal is protected by a draft Profile change; the observed workflow is inferred.",
    profiles: [
      {
        block: "problem",
        id: "goal",
        value: "Document project workflows",
        revision,
        commit: context.examinedRevision,
        source: "README.md",
      },
      {
        block: "problem",
        id: "workflow",
        value: "The README documents an offline workflow.",
        revision,
        commit: context.examinedRevision,
        source: "README.md",
      },
    ],
    ideas: [
      {
        title: "Document outside changes",
        body: "Expand the workflow guide with examples.",
        commits: [context.examinedRevision],
      },
    ],
    actions: [],
  });
  if (
    (await checkProject(root)).diagnostics.length ||
    (await syncContext(root)).commits.length
  )
    throw new Error("Invalid actual Sync output");
  const replacements = new Map([
    [result.id, "sync-000000"],
    [result.proposals[0] ?? "", "act-000001"],
    [result.proposals[1] ?? "", "idea-000000"],
    [context.examinedRevision, "abcdef0123456789abcdef0123456789abcdef0123"],
  ]);
  const normalize = (value: string) => {
    for (const [from, to] of replacements) value = value.replaceAll(from, to);
    return value.replace(
      /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})/g,
      "2026-10-14T00:00:00Z",
    );
  };
  const files = new Map(
    [...(await readProjectFiles(root)).files]
      .filter(([path]) => !path.startsWith(".voidra/local/"))
      .map(([path, bytes]) => [
        normalize(path),
        Buffer.from(normalize(bytes.toString())),
      ]),
  );
  const destination = resolve(repository, "fixtures/sync/outside-work/project");
  if (process.argv.includes("--check")) {
    const existing = (await readProjectFiles(destination)).files;
    if (
      existing.size !== files.size ||
      [...files].some(([path, bytes]) => !existing.get(path)?.equals(bytes))
    )
      throw new Error("Stale Sync golden");
  } else {
    await rm(destination, { recursive: true, force: true });
    await writeProject(destination, files);
  }
  if ((await checkProject(destination)).diagnostics.length)
    throw new Error("Invalid normalized Sync golden");
  const catalog = resolve(repository, "fixtures/sync/catalog.json"),
    content =
      '[\n  {\n    "name": "outside-work",\n    "project": "fixtures/sync/outside-work/project"\n  }\n]\n';
  if (process.argv.includes("--check")) {
    if ((await readFile(catalog, "utf8")) !== content)
      throw new Error("Stale Sync catalog");
  } else {
    await mkdir(resolve(repository, "fixtures/sync"), { recursive: true });
    await writeFile(catalog, content);
  }
} finally {
  await rm(root, { recursive: true, force: true });
}
