import { execFileSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test } from "vitest";
import { syncSkills } from "../src/sync.ts";

const git = (root: string, args: string[]) =>
  execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
async function fixture() {
  const temp = await mkdtemp(join(tmpdir(), "voidra-skills-sync-")),
    source = join(temp, "source"),
    destination = join(temp, "destination"),
    remote = join(temp, "remote.git");
  // This is the genuine distribution implementation, not a fake publish target.
  await mkdir(destination);
  execFileSync("tar", [
    "-xzf",
    resolve(
      "tools/skills-distribution/tests/fixtures/voidra-skills-d5f6775.tgz",
    ),
    "-C",
    destination,
  ]);
  await mkdir(source);
  await mkdir(join(source, "skills/voidra-go"), { recursive: true });
  await mkdir(join(source, "templates"));
  await writeFile(
    join(source, "skills/voidra-go/SKILL.md"),
    '---\nname: voidra-go\ndescription: Run checked work.\nmetadata:\n  version: "0.2.0"\n  format-version: "1"\n---\nFollow exact gates.\n',
  );
  await cp(resolve("templates/general"), join(source, "templates/general"), {
    recursive: true,
  });
  await cp(resolve("LICENSE"), join(source, "LICENSE"));
  git(destination, ["init", "-b", "main"]);
  git(destination, ["config", "user.name", "Fixture"]);
  git(destination, ["config", "user.email", "fixture@example.test"]);
  git(destination, ["add", "."]);
  git(destination, ["commit", "-m", "Baseline"]);
  execFileSync("git", ["init", "--bare", remote]);
  git(destination, ["remote", "add", "origin", remote]);
  git(destination, ["push", "-u", "origin", "main"]);
  execFileSync("make", ["setup"], { cwd: destination, stdio: "pipe" });
  return { temp, source, destination, remote };
}
test("dry runs validate genuine tooling, display exact changes and preserve the target and remote", async () => {
  const f = await fixture();
  try {
    const before = git(f.destination, ["rev-parse", "HEAD"]),
      readme = await readFile(join(f.destination, "README.md"));
    const result = await syncSkills({
      sourceRoot: f.source,
      destinationRoot: f.destination,
      dryRun: true,
    });
    expect(result.paths).toContain("skills/voidra-go/SKILL.md");
    expect(result.diff).toContain("Follow exact gates.");
    expect(result.diff).toContain("Voidra Project release skills");
    expect(git(f.destination, ["status", "--porcelain"])).toBe("");
    expect(await readFile(join(f.destination, "README.md"))).toEqual(readme);
    expect(
      git(f.destination, ["ls-remote", "origin", "refs/heads/main"]).split(
        /\s/,
      )[0],
    ).toBe(before);
  } finally {
    await rm(f.temp, { recursive: true, force: true });
  }
}, 30000);
test("real sync uses single-skill publishing, updates shared catalogs separately and repeats without new commits", async () => {
  const f = await fixture();
  try {
    const result = await syncSkills({
      sourceRoot: f.source,
      destinationRoot: f.destination,
      dryRun: false,
    });
    expect(result.published).toEqual(["voidra-go"]);
    expect(
      await readFile(join(f.destination, "skills/init/SKILL.md"), "utf8"),
    ).toContain("name: init");
    expect(
      await readFile(join(f.destination, "skills/voidra-go/LICENSE"), "utf8"),
    ).toContain("GNU AFFERO");
    const commits = git(f.destination, ["log", "-2", "--format=%H"]).split(
        "\n",
      ),
      skill = commits[1];
    expect(
      git(f.destination, [
        "diff-tree",
        "--no-commit-id",
        "--name-only",
        "-r",
        skill ?? "",
      ])
        .split("\n")
        .every((path) => path.startsWith("skills/voidra-go/")),
    ).toBe(true);
    expect(
      JSON.parse(
        await readFile(join(f.destination, "skills.sh.json"), "utf8"),
      ).groupings.find((g: { title: string }) => g.title === "Voidra Project")
        .skills,
    ).toEqual(["voidra-go"]);
    const head = git(f.destination, ["rev-parse", "HEAD"]);
    await syncSkills({
      sourceRoot: f.source,
      destinationRoot: f.destination,
      dryRun: false,
    });
    expect(git(f.destination, ["rev-parse", "HEAD"])).toBe(head);
    expect(
      git(f.destination, ["ls-remote", "origin", "refs/heads/main"]).split(
        /\s/,
      )[0],
    ).toBe(head);
  } finally {
    await rm(f.temp, { recursive: true, force: true });
  }
}, 30000);
test("invalid payloads fail before any publication and dirty distribution copies are preserved", async () => {
  const f = await fixture();
  try {
    const head = git(f.destination, ["rev-parse", "HEAD"]);
    await writeFile(join(f.source, "skills/voidra-go/SKILL.md"), "invalid");
    await expect(
      syncSkills({
        sourceRoot: f.source,
        destinationRoot: f.destination,
        dryRun: false,
      }),
    ).rejects.toThrow();
    expect(git(f.destination, ["rev-parse", "HEAD"])).toBe(head);
    expect(git(f.destination, ["status", "--porcelain"])).toBe("");
    await writeFile(join(f.destination, "README.md"), "Human edit");
    await expect(
      syncSkills({
        sourceRoot: f.source,
        destinationRoot: f.destination,
        dryRun: false,
      }),
    ).rejects.toThrow(/clean|working/i);
    expect(await readFile(join(f.destination, "README.md"), "utf8")).toBe(
      "Human edit",
    );
    expect(
      git(f.destination, ["ls-remote", "origin", "refs/heads/main"]).split(
        /\s/,
      )[0],
    ).toBe(head);
  } finally {
    await rm(f.temp, { recursive: true, force: true });
  }
}, 30000);
