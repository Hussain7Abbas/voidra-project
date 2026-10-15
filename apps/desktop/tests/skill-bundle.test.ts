import { spawnSync } from "node:child_process";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, it } from "vitest";
import {
  prepareSkillBundle,
  SkillInstaller,
} from "../src/main/skill-installer.ts";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "voidra-bundle-"));
  roots.push(root);
  const source = join(root, "source"),
    bundle = join(root, "bundle"),
    home = join(root, "home");
  for (const name of ["voidra-go", "voidra-plan"]) {
    await mkdir(join(source, name), { recursive: true });
    await writeFile(
      join(source, name, "SKILL.md"),
      `---\nname: ${name}\ndescription: Checked work.\nmetadata:\n  version: "1.1.0"\n  format-version: "1"\n---\nOriginal ${name}.\n`,
    );
  }
  await mkdir(home);
  await prepareSkillBundle(source, bundle);
  return { root, bundle, home, installer: new SkillInstaller(bundle, home) };
}
it("installs only the entire selected client bundle and binds every hand edit to exact confirmation", async () => {
  const { home, installer } = await fixture();
  await mkdir(join(home, ".claude/skills/unrelated"), { recursive: true });
  await writeFile(join(home, ".claude/skills/unrelated/keep"), "outside");
  const first = await installer.previewBundle("claude");
  expect(first.skills.map((skill) => skill.name)).toEqual([
    "voidra-go",
    "voidra-plan",
  ]);
  expect(await installer.applyBundle("claude", first.revision, false)).toEqual({
    completed: ["voidra-go", "voidra-plan"],
    remaining: [],
    error: null,
  });
  await expect(stat(join(home, ".agents"))).rejects.toMatchObject({
    code: "ENOENT",
  });
  const edited = join(home, ".claude/skills/voidra-plan/SKILL.md"),
    other = join(home, ".claude/skills/voidra-go/SKILL.md");
  await writeFile(edited, `${await readFile(edited, "utf8")}Hand edit.\n`);
  const selected = await installer.previewBundle("claude"),
    before = await readFile(other);
  expect(selected.requiresConfirmation).toBe(true);
  expect(
    selected.skills.find((skill) => skill.name === "voidra-plan")?.diff,
  ).toContain("Hand edit.");
  await expect(
    installer.applyBundle("claude", selected.revision, false),
  ).rejects.toThrow(/confirm/i);
  expect(await readFile(other)).toEqual(before);
  await writeFile(other, `${before.toString()}Later change.\n`);
  await expect(
    installer.applyBundle("claude", selected.revision, true),
  ).rejects.toThrow(/changed|stale/i);
  expect(await readFile(edited, "utf8")).toContain("Hand edit.");
  const fresh = await installer.previewBundle("claude");
  expect(
    (await installer.applyBundle("claude", fresh.revision, true)).error,
  ).toBeNull();
  expect(await readFile(edited, "utf8")).not.toContain("Hand edit.");
  expect(
    await readFile(join(home, ".claude/skills/unrelated/keep"), "utf8"),
  ).toBe("outside");
  const codex = await installer.previewBundle("codex");
  await installer.applyBundle("codex", codex.revision, false);
  expect((await installer.status()).filter((row) => row.present)).toHaveLength(
    4,
  );
});
it("resumes a real process death between complete skill copies without losing unrelated or other-client files", async () => {
  const { root, bundle, home, installer } = await fixture();
  const helper = join(root, "interrupt.mjs"),
    module = fileURLToPath(
      new URL("../src/main/skill-installer.ts", import.meta.url),
    );
  await writeFile(
    helper,
    `import {SkillInstaller} from ${JSON.stringify(module)};\nconst installer=new SkillInstaller(${JSON.stringify(bundle)},${JSON.stringify(home)},{afterSkill:()=>process.exit(42)});\nconst preview=await installer.previewBundle("claude");\nawait installer.applyBundle("claude",preview.revision,false);\n`,
  );
  const env = { ...process.env };
  delete env.NODE_V8_COVERAGE;
  const ended = spawnSync(process.execPath, [helper], {
    encoding: "utf8",
    env,
  });
  expect(ended.status, ended.stderr).toBe(42);
  expect(
    await readFile(join(home, ".claude/skills/voidra-go/SKILL.md"), "utf8"),
  ).toContain("Original voidra-go");
  await expect(
    stat(join(home, ".claude/skills/voidra-plan")),
  ).rejects.toMatchObject({ code: "ENOENT" });
  const preview = await installer.previewBundle("claude");
  expect(
    (await installer.applyBundle("claude", preview.revision, false)).remaining,
  ).toEqual([]);
  expect(
    (await installer.status())
      .filter((row) => row.agent === "claude")
      .every((row) => row.present && !row.edited),
  ).toBe(true);
  await expect(stat(join(home, ".agents"))).rejects.toMatchObject({
    code: "ENOENT",
  });
});
it("reports completed/remaining copies after a real permission failure and safely retries", async () => {
  const { bundle, home } = await fixture(),
    parent = join(home, ".claude/skills");
  const installer = new SkillInstaller(bundle, home, {
    afterSkill: async (name: string) => {
      if (name === "voidra-go") await chmod(parent, 0o500);
    },
  });
  try {
    const preview = await installer.previewBundle("claude"),
      result = await installer.applyBundle("claude", preview.revision, false);
    expect(result.completed).toEqual(["voidra-go"]);
    expect(result.remaining).toEqual(["voidra-plan"]);
    expect(result.error).toMatch(/permission|EACCES/i);
  } finally {
    await chmod(parent, 0o700);
  }
  const retry = new SkillInstaller(bundle, home),
    preview = await retry.previewBundle("claude");
  expect(
    (await retry.applyBundle("claude", preview.revision, false)).error,
  ).toBeNull();
  expect(
    await readFile(join(parent, "voidra-plan/SKILL.md"), "utf8"),
  ).toContain("Original voidra-plan");
});
it("preflights every destination and refuses symlink escape before changing any bundle member", async () => {
  const { root, home, installer } = await fixture(),
    outside = join(root, "outside");
  await mkdir(outside);
  await writeFile(join(outside, "keep"), "unchanged");
  const preview = await installer.previewBundle("claude");
  await mkdir(join(home, ".claude/skills"), { recursive: true });
  await symlink(outside, join(home, ".claude/skills/voidra-plan"));
  await expect(
    installer.applyBundle("claude", preview.revision, false),
  ).rejects.toThrow(/link/i);
  await expect(
    stat(join(home, ".claude/skills/voidra-go")),
  ).rejects.toMatchObject({ code: "ENOENT" });
  expect(await readFile(join(outside, "keep"), "utf8")).toBe("unchanged");
});

it("refuses a missing bundled member instead of silently installing a smaller catalog", async () => {
  const { bundle, home, installer } = await fixture();
  await rm(join(bundle, "voidra-plan"), { recursive: true });
  await expect(installer.previewBundle("claude")).rejects.toThrow(
    /catalog|bundle/i,
  );
  await expect(installer.status()).rejects.toThrow(/catalog|bundle/i);
  await expect(stat(join(home, ".claude"))).rejects.toMatchObject({
    code: "ENOENT",
  });
});
