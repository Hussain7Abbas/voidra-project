import { cpSync, readFileSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "vitest";
import { manifestBytes, stageRelease } from "../src/release.ts";
import { loadStage, restoreAssets } from "../src/restore.ts";
import { fixture } from "./helpers.ts";

test("retry restores original source-bound CI bytes and validates the complete manifest before use", async () => {
  const root = await fixture();
  try {
    const original = await stageRelease(root, join(root, "stage"), "v0.2.0", [
        "app.dmg",
        "voidra-0.2.0.tgz",
      ]),
      target = join(root, "restored"),
      name = `voidra-release-v0.2.0-${original.source}`;
    const restored = await restoreAssets(root, target, "v0.2.0", {}, (args) => {
      if (args[0] === "api")
        return Buffer.from(
          JSON.stringify({
            artifacts: [
              {
                name,
                expired: false,
                workflow_run: { id: 1, head_sha: original.source },
              },
            ],
          }),
        );
      cpSync(original.directory, target, { recursive: true });
      return Buffer.alloc(0);
    });
    expect(restored?.npmIntegrity).toBe(original.npmIntegrity);
    expect(await readFile(join(target, "app.dmg"))).toEqual(
      await readFile(join(original.directory, "app.dmg")),
    );
    const raw = JSON.parse(
      await readFile(join(target, "release-manifest.json"), "utf8"),
    );
    raw.files[0].name = "../outside";
    await writeFile(join(target, "release-manifest.json"), JSON.stringify(raw));
    await expect(loadStage(target)).rejects.toThrow();
    await expect(
      restoreAssets(root, target, "v1.0.0", {}, () => Buffer.alloc(0)),
    ).rejects.toThrow(/versions/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("complete published assets restore after CI artifact expiration; partial drafts stop rather than rebuild changed bytes", async () => {
  const root = await fixture();
  try {
    const original = await stageRelease(root, join(root, "stage"), "v0.2.0", [
        "app.dmg",
        "voidra-0.2.0.tgz",
      ]),
      names = [
        "app.dmg",
        "voidra-0.2.0.tgz",
        "CHECKSUMS.txt",
        "release-manifest.json",
      ];
    let partial = false,
      absent = false;
    const execute = (args: string[]): Buffer => {
      const path = args[1] ?? "";
      if (args[0] === "release" && args[1] === "view") {
        if (absent) throw Error("release not found");
        return Buffer.from(
          JSON.stringify({
            apiUrl:
              "https://api.github.com/repos/Hussain7Abbas/voidra-project/releases/1",
            tagName: original.tag,
          }),
        );
      }
      if (path.includes("actions/artifacts"))
        return Buffer.from(JSON.stringify({ artifacts: [] }));
      if (path.includes("releases/tags") || path.endsWith("releases/1")) {
        if (absent || (partial && path.includes("releases/tags")))
          throw Error("HTTP 404");
        return Buffer.from(
          JSON.stringify({
            id: 1,
            draft: partial,
            body: original.notes,
            assets: (partial ? names.slice(0, 1) : names).map(
              (name, index) => ({ name, id: index + 1 }),
            ),
          }),
        );
      }
      return readFileSync(
        join(
          original.directory,
          names[Number(path.split("/").at(-1)) - 1] ?? "missing",
        ),
      );
    };
    expect(
      (
        await restoreAssets(
          root,
          join(root, "published"),
          "v0.2.0",
          {},
          execute,
        )
      )?.source,
    ).toBe(original.source);
    await writeFile(
      join(original.directory, "release-manifest.json"),
      manifestBytes({ ...original, notes: "Outside release notes\n" }),
    );
    await expect(
      restoreAssets(root, join(root, "changed-notes"), "v0.2.0", {}, execute),
    ).rejects.toThrow(/notes mismatch/);
    await writeFile(
      join(original.directory, "release-manifest.json"),
      manifestBytes(original),
    );
    partial = true;
    await expect(
      restoreAssets(root, join(root, "partial"), "v0.2.0", {}, execute),
    ).rejects.toThrow(/partial draft/);
    absent = true;
    expect(
      await restoreAssets(root, join(root, "missing"), "v0.2.0", {}, execute),
    ).toBeNull();
    await mkdir(join(root, "damaged"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
