import { execFileSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyOperation,
  checkProject,
  decideReview,
  hash,
  parseRecord,
  readProjectFiles,
  replaceActionQueue,
  reviewRevision,
  serializeRecord,
} from "voidra";
import { writeProject } from "../../../packages/voidra/scripts/fixtures.ts";
import { startRelease } from "../src/release-intake.ts";
import {
  commitResult,
  finalizeResult,
  guardRun,
  prepareResult,
  publishReleasePlan,
  startRun,
} from "../src/run.ts";

const repository = fileURLToPath(new URL("../../../", import.meta.url)),
  time = "2026-10-14T00:00:00Z",
  catalog: { name: string; project: string }[] = [];
for (const name of ["release-plan", "release-tagged"]) {
  const root = await mkdtemp(join(tmpdir(), "voidra-release-golden-"));
  try {
    await cp(resolve(repository, "fixtures/new-project/project"), root, {
      recursive: true,
    });
    const path = ".voidra/actions/act-000000/action.md",
      old = parseRecord(path, await readFile(join(root, path)));
    await writeFile(
      join(root, path),
      serializeRecord(
        old,
        {
          ...old.data,
          type: "docs",
          title: "Completed documentation",
          stage: "done",
          status: "complete",
        },
        "Completed fixture work.\n",
      ),
    );
    await writeFile(
      join(root, "package.json"),
      '{"name":"release-golden","version":"0.1.0"}\n',
    );
    const git = (args: string[]) =>
      execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
    for (const args of [
      ["init", "-q"],
      ["config", "user.name", "Golden verification"],
      ["config", "user.email", "golden@example.test"],
      ["add", "."],
      ["commit", "-qm", "Golden baseline"],
    ])
      git(args);
    const intake = await startRelease(root);
    if (!intake.action) throw new Error("Golden release missing");
    const sourcePath = `.voidra/actions/${intake.action}/action.md`,
      targetPath = ".voidra/actions/act-000001/action.md",
      doc = parseRecord(sourcePath, await readFile(join(root, sourcePath))),
      queuePath = ".voidra/local/pending-actions.md",
      queue = parseRecord(queuePath, await readFile(join(root, queuePath)));
    // Fix the fixture action ID before approval; never rewrite approved plan hashes.
    await applyOperation(root, {
      changes: [
        { path: sourcePath, expectedHash: hash(doc.raw), content: null },
        {
          path: targetPath,
          expectedHash: null,
          content: serializeRecord(parseRecord(targetPath, doc.raw), {
            ...doc.data,
            id: "act-000001",
          }).toString(),
        },
        {
          path: queuePath,
          expectedHash: hash(queue.raw),
          content: serializeRecord(
            queue,
            queue.data,
            "1. [ ] act-000001\n",
          ).toString(),
        },
      ],
    });
    const ctx = await startRun(root, "codex", process.pid);
    if (!ctx) throw new Error("Golden plan missing");
    const proposal = {
      version: "0.2.0",
      tag: "v0.2.0",
      message: "chore(release): 0.2.0",
      paths: ["package.json"],
      notes:
        "## Notes\nCompleted documentation. No changelog exists; notes stay in release files.\n",
      requirements:
        "## Goal\nRelease completed work as 0.2.0.\n## Out of scope\nPublishing and adding a changelog.\n",
      blueprint:
        "## Approach\nBump the existing package version; keep notes only in the release record and tag locally after acceptance.\n## Testing seams\nRead the package version, validate planning files and inspect actual Git commit/tag.\n## Proposed ADRs\nNone.\n",
      acceptance:
        "- Version 0.2.0 is committed and tagged once.\n- No CHANGELOG.md is created.\n",
    };
    await publishReleasePlan(root, ctx.ownerToken, proposal);
    let commit: string | undefined;
    if (name === "release-tagged") {
      const project = await checkProject(root);
      await decideReview(
        root,
        "act-000001",
        reviewRevision(project, "act-000001"),
        "accepted",
        "",
        "Golden reviewer",
      );
      const queueRaw = project.files.get(queuePath);
      await replaceActionQueue(root, {
        ids: ["act-000001"],
        revision: queueRaw ? hash(queueRaw) : null,
        by: "Golden reviewer",
      });
      const run = await startRun(root, "codex", process.pid);
      if (!run) throw new Error("Golden finalization missing");
      await guardRun(root, run.ownerToken, proposal.paths);
      await writeFile(
        join(root, "package.json"),
        '{"name":"release-golden","version":"0.2.0"}\n',
      );
      await prepareResult(root, run.ownerToken, {
        summary: "Scripted version readback passed.",
        paths: proposal.paths,
        checks: [{ name: "Version readback", passed: true }],
        reviews: {
          standards: {
            passed: true,
            summary: "No changelog convention exists; none created.",
          },
          plan: {
            passed: true,
            summary: "Matches the accepted local release.",
          },
        },
      });
      commit = await commitResult(root, run.ownerToken, proposal.message);
      await finalizeResult(root, run.ownerToken);
      if (
        git(["rev-parse", "v0.2.0^{commit}"]) !== commit ||
        git(["rev-list", "--count", "HEAD"]) !== "2"
      )
        throw new Error("Golden tag/commit mismatch");
    }
    const files = (await readProjectFiles(root)).files,
      ids = new Map<string, string>();
    for (const bytes of files.values())
      for (const match of bytes
        .toString()
        .matchAll(/run-[0-9a-hjkmnp-tv-z]{6}/g))
        if (!ids.has(match[0])) ids.set(match[0], `run-00000${ids.size}`);
    const normalize = (text: string): string => {
      for (const [before, after] of ids) text = text.replaceAll(before, after);
      if (commit)
        text = text.replaceAll(
          commit,
          "abcdef0123456789abcdef0123456789abcdef0123",
        );
      return text
        .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g, time)
        .replace(
          /\d{4}-\d{2}-\d{2}T\d{6}(?:\.\d+)?Z/g,
          time.replaceAll(":", ""),
        );
    };
    const normalized = new Map(
      [...files]
        .filter(([path]) => !path.startsWith(".voidra/local/"))
        .map(([path, bytes]) => [
          normalize(path),
          Buffer.from(normalize(bytes.toString())),
        ]),
    );
    normalized.set(
      "package.json",
      Buffer.from(
        `${JSON.stringify(JSON.parse(await readFile(join(root, "package.json"), "utf8")), null, 2)}\n`,
      ),
    );
    const project = `fixtures/releases/${name}/project`,
      destination = resolve(repository, project);
    if (process.argv.includes("--check")) {
      const existing = (await readProjectFiles(destination)).files;
      existing.set(
        "package.json",
        await readFile(join(destination, "package.json")),
      );
      if (
        existing.size !== normalized.size ||
        [...normalized].some(
          ([path, bytes]) => !existing.get(path)?.equals(bytes),
        )
      )
        throw new Error(`Stale release golden: ${name}`);
    } else {
      await rm(destination, { recursive: true, force: true });
      await writeProject(destination, normalized);
    }
    if ((await checkProject(destination)).diagnostics.length)
      throw new Error(
        JSON.stringify((await checkProject(destination)).diagnostics),
      );
    catalog.push({ name, project });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
const path = resolve(repository, "fixtures/releases/catalog.json"),
  content = `${JSON.stringify(catalog, null, 2)}\n`;
if (process.argv.includes("--check")) {
  if ((await readFile(path, "utf8")) !== content)
    throw new Error("Stale release catalog");
} else {
  await mkdir(resolve(repository, "fixtures/releases"), { recursive: true });
  await writeFile(path, content);
}
