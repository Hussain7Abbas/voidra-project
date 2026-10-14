import { execFileSync } from "node:child_process";
import { readFileSync as requireRead } from "node:fs";
import { mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "vitest";
import {
  alignVersions,
  type GitHubRemote,
  publishGitHub,
  publishNpm,
  readAlignment,
  selectNotes,
  stageRelease,
  verifyStage,
} from "../src/release.ts";

import { fixture } from "./helpers.ts";

test("alignment updates only version fields and declares one matching source while preserving unknown metadata", async () => {
  const root = await fixture();
  try {
    expect((await readAlignment(root)).version).toBe("0.2.0");
    await mkdir(join(root, "skills/voidra-go/references/nested"), {
      recursive: true,
    });
    const reference = join(
      root,
      "skills/voidra-go/references/nested/validation.md",
    );
    await writeFile(
      reference,
      "Run `npx --offline --yes voidra@0.2.0 check .`.\n",
    );
    await alignVersions(root, "0.3.0");
    expect(await readFile(reference, "utf8")).toContain("voidra@0.3.0 check");
    expect((await readAlignment(root)).version).toBe("0.3.0");
    expect(
      JSON.parse(
        await readFile(join(root, "apps/desktop/package.json"), "utf8"),
      ).future,
    ).toEqual({ keep: true });
    expect(
      await readFile(join(root, "skills/voidra-go/SKILL.md"), "utf8"),
    ).toContain("Exact gates.");
    await expect(alignVersions(root, "01.2.0")).rejects.toThrow();
    await writeFile(
      join(root, "packages/voidra/src/versions.ts"),
      'export const PACKAGE_VERSION = "0.9.0";',
    );
    await expect(readAlignment(root)).rejects.toThrow(/align|match/i);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("staging refuses unsafe, symlinked, incomplete and mismatched archives; modified manifests/checksums cannot be reused", async () => {
  const root = await fixture();
  try {
    const directory = join(root, "stage"),
      npmAsset = "voidra-0.2.0.tgz",
      assets = ["app.dmg", npmAsset];
    await expect(
      stageRelease(root, directory, "v0.2.0", ["../outside"]),
    ).rejects.toThrow(/Unsafe/);
    await expect(
      stageRelease(root, directory, "v0.2.0", [npmAsset]),
    ).rejects.toThrow(/required/);
    await rm(join(directory, "app.dmg"));
    await symlink(join(root, "CHANGELOG.md"), join(directory, "app.dmg"));
    await expect(
      stageRelease(root, directory, "v0.2.0", assets),
    ).rejects.toThrow(/real file/);
    await rm(join(directory, "app.dmg"));
    await writeFile(join(directory, "app.dmg"), "Fixture");
    const stage = await stageRelease(root, directory, "v0.2.0", assets);
    const manifest = await readFile(join(directory, "release-manifest.json")),
      sums = await readFile(join(directory, "CHECKSUMS.txt"));
    await writeFile(
      join(directory, "release-manifest.json"),
      Buffer.concat([manifest, Buffer.from("\n")]),
    );
    await expect(verifyStage(stage)).rejects.toThrow(/manifest mismatch/);
    await writeFile(join(directory, "release-manifest.json"), manifest);
    await writeFile(join(directory, "CHECKSUMS.txt"), "Outside checksum\n");
    await expect(verifyStage(stage)).rejects.toThrow(/Checksums/);
    await writeFile(join(directory, "CHECKSUMS.txt"), sums);
    await rm(join(directory, "app.dmg"));
    await symlink(join(root, "CHANGELOG.md"), join(directory, "app.dmg"));
    await expect(verifyStage(stage)).rejects.toThrow(/changed/);
    await rm(join(directory, "app.dmg"));
    await writeFile(join(directory, "app.dmg"), "Fixture");
    const packagePath = join(root, "package/package.json"),
      data = JSON.parse(await readFile(packagePath, "utf8"));
    data.version = "0.3.0";
    await writeFile(packagePath, JSON.stringify(data));
    execFileSync("tar", [
      "-czf",
      join(directory, npmAsset),
      "-C",
      root,
      "package",
    ]);
    await expect(
      stageRelease(root, directory, "v0.2.0", assets),
    ).rejects.toThrow(/metadata/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("unconfirmed or changed GitHub state cannot pass the public release barriers", async () => {
  const root = await fixture();
  try {
    const stage = await stageRelease(root, join(root, "stage"), "v0.2.0", [
      "app.dmg",
      "voidra-0.2.0.tgz",
    ]);
    for (const mode of [
      "notes",
      "draft",
      "missing",
      "upload",
      "changed",
      "publication",
    ]) {
      let inspections = 0,
        publishes = 0;
      const assets = new Map<string, Buffer>();
      const remote: GitHubRemote = {
        inspect: async () => {
          inspections++;
          if (mode === "draft") return null;
          return {
            draft: mode !== "missing",
            source: stage.source,
            notes:
              mode === "notes" || (mode === "changed" && inspections > 1)
                ? "Outside notes"
                : stage.notes,
          };
        },
        createDraft: async () => {},
        readAsset: async (name) => assets.get(name) ?? null,
        upload: async (name, body) => {
          if (mode !== "upload") assets.set(name, body);
        },
        publish: async () => {
          publishes++;
        },
      };
      await expect(publishGitHub(stage, remote)).rejects.toThrow();
      expect(publishes).toBe(mode === "publication" ? 1 : 0);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("released project notes take priority; draft notes, unrelated changelog versions and symlinked source are refused", async () => {
  const root = await fixture();
  try {
    await writeFile(join(root, "CHANGELOG.md"), "## 0.2.01\nWrong notes.\n");
    await expect(selectNotes(root, "0.2.0")).rejects.toThrow(/matching/);
    await mkdir(join(root, ".voidra/releases"), { recursive: true });
    const path = join(root, ".voidra/releases/0.2.0.md");
    const released =
      "---\nversion: 0.2.0\naction: act-000001\nactions: [act-000000]\ntag: v0.2.0\nstatus: released\ndate: 2026-10-14T00:00:00Z\n---\nReviewed project notes.\n";
    await writeFile(path, released);
    expect(await selectNotes(root, "0.2.0")).toBe("Reviewed project notes.\n");
    await writeFile(
      path,
      released.replace("status: released", "status: draft"),
    );
    await expect(selectNotes(root, "0.2.0")).rejects.toThrow(/review/);
    await writeFile(path, released.replace("Reviewed project notes.", ""));
    await expect(selectNotes(root, "0.2.0")).rejects.toThrow(/empty/);
    await rm(path);
    await symlink(join(root, "CHANGELOG.md"), path);
    await expect(selectNotes(root, "0.2.0")).rejects.toThrow(/symlinks/);
    await expect(selectNotes(root, "bad")).rejects.toThrow(/version/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("npm confirmation waits for registry propagation and never republishes a visible version without provenance", async () => {
  const root = await fixture();
  try {
    const stage = await stageRelease(root, join(root, "stage"), "v0.2.0", [
      "app.dmg",
      "voidra-0.2.0.tgz",
    ]);
    let reads = 0,
      publishes = 0,
      waits = 0;
    await publishNpm(
      stage,
      {
        inspect: async () =>
          ++reads < 3
            ? null
            : {
                integrity: stage.npmIntegrity,
                source: reads < 5 ? "" : stage.source,
              },
        publish: async () => {
          publishes++;
        },
      },
      async () => {
        waits++;
      },
    );
    expect(publishes).toBe(1);
    expect(waits).toBeGreaterThan(0);
    reads = 0;
    await publishNpm(
      stage,
      {
        inspect: async () => ({
          integrity: stage.npmIntegrity,
          source: ++reads < 3 ? "" : stage.source,
        }),
        publish: async () => {
          publishes++;
        },
      },
      async () => {},
    );
    expect(publishes).toBe(1);
    await expect(
      publishNpm(
        stage,
        {
          inspect: async () => ({ integrity: stage.npmIntegrity, source: "" }),
          publish: async () => {
            publishes++;
          },
        },
        async () => {},
      ),
    ).rejects.toThrow(/pending.*preserve/);
    expect(publishes).toBe(1);
    await expect(
      publishNpm(
        stage,
        {
          inspect: async () => ({
            integrity: stage.npmIntegrity,
            source: "a".repeat(40),
          }),
          publish: async () => {
            publishes++;
          },
        },
        async () => {},
      ),
    ).rejects.toThrow(/mismatch/);
    expect(publishes).toBe(1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("matching notes and checksummed real staged files are source-bound; corruption stops reuse", async () => {
  const root = await fixture();
  try {
    expect(await selectNotes(root, "0.2.0")).toBe("A useful preview.\n");
    await expect(selectNotes(root, "9.0.0")).rejects.toThrow(/notes/i);
    const stage = await stageRelease(root, join(root, "stage"), "v0.2.0", [
      "app.dmg",
      "voidra-0.2.0.tgz",
    ]);
    await verifyStage(stage);
    expect(await readFile(join(root, "stage/CHECKSUMS.txt"), "utf8")).toContain(
      "app.dmg",
    );
    await writeFile(join(root, "stage/app.dmg"), "Changed");
    await expect(verifyStage(stage)).rejects.toThrow(/mismatch|changed/i);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("failed asset staging leaves no public release; retry preserves matching completed destinations and refuses mismatches", async () => {
  const root = await fixture();
  try {
    const stage = await stageRelease(root, join(root, "stage"), "v0.2.0", [
      "app.dmg",
      "voidra-0.2.0.tgz",
    ]);
    let exists = false,
      draft = true,
      fail = true,
      publishes = 0;
    const assets = new Map<string, Buffer>();
    const remote: GitHubRemote = {
      inspect: async () =>
        exists ? { draft, notes: stage.notes, source: stage.source } : null,
      createDraft: async () => {
        exists = true;
      },
      readAsset: async (name) => assets.get(name) ?? null,
      upload: async (name, body) => {
        if (fail) throw Error("Network failure");
        assets.set(name, body);
      },
      publish: async () => {
        draft = false;
        publishes++;
      },
    };
    await expect(publishGitHub(stage, remote)).rejects.toThrow(/Network/);
    expect(draft).toBe(true);
    expect(publishes).toBe(0);
    fail = false;
    await publishGitHub(stage, remote);
    expect(draft).toBe(false);
    await publishGitHub(stage, remote);
    expect(publishes).toBe(1);
    let npmCalls = 0,
      integrity: string | null = null;
    await expect(
      publishNpm(stage, {
        inspect: async () => null,
        publish: async () => {
          throw Error("npm unavailable");
        },
      }),
    ).rejects.toThrow();
    expect(draft).toBe(false);
    const npm = {
      inspect: async () =>
        integrity ? { integrity, source: stage.source } : null,
      publish: async () => {
        npmCalls++;
        integrity = stage.npmIntegrity;
      },
    };
    await publishNpm(stage, npm);
    await publishNpm(stage, npm);
    expect(npmCalls).toBe(1);
    assets.set("app.dmg", Buffer.from("Outside bytes"));
    await expect(publishGitHub(stage, remote)).rejects.toThrow(/mismatch/i);
    integrity = "outside";
    await expect(publishNpm(stage, npm)).rejects.toThrow(/mismatch/i);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the GitHub adapter uses checked tags/drafts/assets and never overwrites a public asset", async () => {
  const { GitHubReleaseRemote } = await import("../src/github.ts"),
    root = await fixture();
  try {
    const stage = await stageRelease(root, join(root, "stage"), "v0.2.0", [
        "app.dmg",
        "voidra-0.2.0.tgz",
      ]),
      requests: string[][] = [];
    let exists = false,
      draft = true;
    const assets = new Map<string, Buffer>();
    const remote = new GitHubReleaseRemote(stage, {}, (args) => {
      requests.push(args);
      if (args[0] === "api") {
        const path = args[1] ?? "";
        if (path.endsWith("/releases/tags/v0.2.0")) {
          if (!exists) throw Error("HTTP 404");
          return Buffer.from(
            JSON.stringify({
              id: 1,
              draft,
              body: stage.notes,
              assets: [...assets.keys()].map((name, index) => ({
                name,
                id: index + 1,
              })),
            }),
          );
        }
        if (path.includes("/git/ref/tags/"))
          return Buffer.from(
            JSON.stringify({ object: { type: "tag", sha: "a".repeat(40) } }),
          );
        if (path.includes("/git/tags/"))
          return Buffer.from(
            JSON.stringify({ object: { type: "commit", sha: stage.source } }),
          );
        if (path.includes("/releases/assets/"))
          return (
            [...assets.values()][Number(path.split("/").at(-1)) - 1] ??
            Buffer.alloc(0)
          );
      }
      if (args[1] === "create") {
        exists = true;
        return Buffer.alloc(0);
      }
      if (args[1] === "upload") {
        const file = args[3] ?? "";
        assets.set(file.split("/").at(-1) ?? "", requireRead(file));
        return Buffer.alloc(0);
      }
      if (args[1] === "edit") {
        draft = false;
        return Buffer.alloc(0);
      }
      throw Error("Unexpected request");
    });
    await publishGitHub(stage, remote);
    await publishGitHub(stage, remote);
    expect(requests.filter((args) => args[1] === "create")).toHaveLength(1);
    expect(requests.filter((args) => args[1] === "edit")).toHaveLength(1);
    expect(requests.find((args) => args[1] === "create")).toContain(
      "--verify-tag",
    );
    expect(requests.find((args) => args[1] === "create")).toContain(
      "--prerelease",
    );
    expect(requests.some((args) => args.includes("--clobber"))).toBe(false);
    expect(await readFile(join(root, "stage/release-notes.md"), "utf8")).toBe(
      stage.notes,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
