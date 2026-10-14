import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
export async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "voidra-release-dist-"));
  for (const folder of [
    "apps/desktop",
    "packages/voidra/src",
    "skills/voidra-go",
    "stage",
  ])
    await mkdir(join(root, folder), { recursive: true });
  for (const path of [
    "apps/desktop/package.json",
    "packages/voidra/package.json",
  ])
    await writeFile(
      join(root, path),
      JSON.stringify({
        name: "fixture",
        version: "0.2.0",
        future: { keep: true },
      }),
    );
  await writeFile(
    join(root, "packages/voidra/src/versions.ts"),
    'export const PACKAGE_VERSION = "0.2.0";\n',
  );
  await writeFile(
    join(root, "skills/voidra-go/SKILL.md"),
    '---\nname: voidra-go\ndescription: Checked work.\nmetadata:\n  version: "0.2.0"\n  format-version: "1"\n---\nExact gates.\n',
  );
  await writeFile(
    join(root, "CHANGELOG.md"),
    "# Changelog\n\n## 0.2.0\n\nA useful preview.\n\n## 0.1.0\n\nOlder notes.\n",
  );
  for (const file of ["app.dmg"])
    await writeFile(join(root, "stage", file), `Fixture ${file}`);
  await mkdir(join(root, "package/dist"), { recursive: true });
  await writeFile(
    join(root, "package/package.json"),
    JSON.stringify({
      name: "voidra",
      version: "0.2.0",
      license: "AGPL-3.0-or-later",
      bin: { voidra: "dist/cli-entry.js" },
    }),
  );
  await writeFile(
    join(root, "package/dist/cli-entry.js"),
    "console.log('0.2.0');\n",
  );
  await writeFile(join(root, "package/LICENSE"), "Fixture AGPL license text\n");
  execFileSync(
    "tar",
    ["-czf", join(root, "stage/voidra-0.2.0.tgz"), "-C", root, "package"],
    { stdio: "pipe" },
  );
  for (const args of [
    ["init", "-b", "main"],
    ["config", "user.name", "Fixture"],
    ["config", "user.email", "fixture@example.test"],
    ["add", "."],
    ["commit", "-m", "Baseline"],
  ])
    execFileSync("git", args, { cwd: root, stdio: "pipe" });
  return root;
}
