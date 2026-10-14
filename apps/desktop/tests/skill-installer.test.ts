import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import {
  prepareSkillBundle,
  SkillInstaller,
} from "../src/main/skill-installer.ts";

const temporary: string[] = [];
afterEach(async () => {
  for (const path of temporary.splice(0))
    await rm(path, { recursive: true, force: true });
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "voidra-install-"));
  temporary.push(root);
  const source = join(root, "source"),
    bundle = join(root, "bundle"),
    home = join(root, "home");
  await mkdir(join(source, "voidra-go/scripts"), { recursive: true });
  await mkdir(home);
  await writeFile(
    join(source, "voidra-go/SKILL.md"),
    '---\nname: voidra-go\ndescription: Run checked work.\nmetadata:\n  version: "0.2.0"\n  format-version: "1"\n---\nOriginal instructions.\n',
  );
  await writeFile(join(source, "voidra-go/scripts/run"), "#!/bin/sh\nexit 0\n");
  await chmod(join(source, "voidra-go/scripts/run"), 0o755);
  await prepareSkillBundle(source, bundle);
  return { source, bundle, home, installer: new SkillInstaller(bundle, home) };
}
test("bundled copies install, update and remove independently in both temporary agent homes", async () => {
  const { source, bundle, home, installer } = await fixture();
  expect(
    (await installer.status()).every(
      (row) => row.installedVersion === null && row.bundledVersion === "0.2.0",
    ),
  ).toBe(true);
  for (const agent of ["claude", "codex"] as const) {
    const preview = await installer.preview(agent, "voidra-go", "install");
    expect(preview.requiresConfirmation).toBe(false);
    await installer.apply(preview, false);
  }
  expect(
    (await installer.status()).every(
      (row) => !row.edited && row.installedFormat === 1,
    ),
  ).toBe(true);
  const claude = join(home, ".claude/skills/voidra-go"),
    codex = join(home, ".agents/skills/voidra-go");
  expect(await readFile(join(claude, "SKILL.md"), "utf8")).toContain(
    "Original instructions",
  );
  await writeFile(
    join(source, "voidra-go/SKILL.md"),
    (await readFile(join(source, "voidra-go/SKILL.md"), "utf8"))
      .replace('"0.2.0"', '"0.3.0"')
      .replace("Original", "Updated"),
  );
  await prepareSkillBundle(source, bundle);
  await installer.apply(
    await installer.preview("claude", "voidra-go", "install"),
    false,
  );
  expect(
    (await installer.status()).find((row) => row.agent === "claude")
      ?.installedVersion,
  ).toBe("0.3.0");
  expect(await readFile(join(codex, "SKILL.md"), "utf8")).toContain("Original");
  await mkdir(join(home, ".claude/skills/other"));
  await writeFile(join(home, ".claude/skills/other/keep"), "outside");
  await installer.apply(
    await installer.preview("claude", "voidra-go", "remove"),
    false,
  );
  expect(await readFile(join(home, ".claude/skills/other/keep"), "utf8")).toBe(
    "outside",
  );
  expect(await readFile(join(codex, "SKILL.md"), "utf8")).toContain("Original");
});
test("hand edits require exact diff confirmation, stale previews refuse and unmanaged copies survive", async () => {
  const { installer, home } = await fixture();
  await installer.apply(
    await installer.preview("codex", "voidra-go", "install"),
    false,
  );
  const path = join(home, ".agents/skills/voidra-go/SKILL.md");
  await writeFile(path, `${await readFile(path, "utf8")}Hand edit.\n`);
  const preview = await installer.preview("codex", "voidra-go", "install");
  expect(preview.requiresConfirmation).toBe(true);
  expect(preview.diff).toContain("Hand edit.");
  await expect(installer.apply(preview, false)).rejects.toThrow(/confirm/i);
  expect(await readFile(path, "utf8")).toContain("Hand edit.");
  await writeFile(path, `${await readFile(path, "utf8")}Later edit.\n`);
  await expect(installer.apply(preview, true)).rejects.toThrow(
    /changed|stale/i,
  );
  await installer.apply(
    await installer.preview("codex", "voidra-go", "install"),
    true,
  );
  expect(await readFile(path, "utf8")).not.toContain("Hand edit.");
  await rm(join(home, ".agents/skills/voidra-go/voidra-skill.json"));
  const remove = await installer.preview("codex", "voidra-go", "remove");
  expect(remove.requiresConfirmation).toBe(true);
  await expect(installer.apply(remove, false)).rejects.toThrow(/confirm/i);
  await installer.apply(remove, true);
});
test("symlink destinations and failed bundle copies preserve installed bytes; compatibility warns both ways", async () => {
  const { installer, home, bundle } = await fixture();
  const outside = join(home, "outside");
  await mkdir(outside);
  await writeFile(join(outside, "keep"), "unchanged");
  await mkdir(join(home, ".agents/skills"), { recursive: true });
  await symlink(outside, join(home, ".agents/skills/voidra-go"));
  expect(
    (await installer.status()).find((row) => row.agent === "codex")?.blocked,
  ).toMatch(/link/i);
  await expect(
    installer.preview("codex", "voidra-go", "install"),
  ).rejects.toThrow(/link/i);
  expect(await readFile(join(outside, "keep"), "utf8")).toBe("unchanged");
  await installer.apply(
    await installer.preview("claude", "voidra-go", "install"),
    false,
  );
  expect(
    (await installer.status(2)).find((row) => row.agent === "claude")
      ?.compatibility,
  ).toMatch(/older/i);
  expect(
    (await installer.status(0)).find((row) => row.agent === "claude")
      ?.compatibility,
  ).toMatch(/newer/i);
  const preview = await installer.preview("claude", "voidra-go", "install");
  await writeFile(join(bundle, "voidra-go/SKILL.md"), "corrupted bundle");
  await expect(installer.apply(preview, false)).rejects.toThrow(
    /bundle|changed/i,
  );
  expect(
    await readFile(join(home, ".claude/skills/voidra-go/SKILL.md"), "utf8"),
  ).toContain("Original instructions");
});

test("a real copy permission failure leaves the previous installed version and added empty folders need confirmation", async () => {
  const { installer, home } = await fixture();
  await installer.apply(
    await installer.preview("claude", "voidra-go", "install"),
    false,
  );
  const parent = join(home, ".claude/skills"),
    path = join(parent, "voidra-go/SKILL.md"),
    before = await readFile(path);
  const preview = await installer.preview("claude", "voidra-go", "install");
  await chmod(parent, 0o500);
  try {
    await expect(installer.apply(preview, false)).rejects.toThrow();
    expect(await readFile(path)).toEqual(before);
  } finally {
    await chmod(parent, 0o700);
  }
  await mkdir(join(parent, "voidra-go/my-notes"));
  expect(
    (await installer.preview("claude", "voidra-go", "remove"))
      .requiresConfirmation,
  ).toBe(true);
});
