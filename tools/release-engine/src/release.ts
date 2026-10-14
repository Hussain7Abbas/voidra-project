import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  readdir,
  readFile,
  realpath,
  rename,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { parseRecord, schemas, serializeRecord } from "voidra";
import { isReleaseVersion } from "./version.ts";

async function safePath(root: string, relative: string): Promise<string> {
  if (
    !relative ||
    relative.startsWith("/") ||
    relative.includes("\\") ||
    relative.split("/").some((part) => !part || part === "." || part === "..")
  )
    throw Error("Unsafe release source path");
  let current = await realpath(root);
  for (const part of relative.split("/")) {
    current = join(current, part);
    const stat = await lstat(current).catch((error) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    });
    if (stat?.isSymbolicLink())
      throw Error("Release paths must not contain symlinks");
  }
  return current;
}
const sha = (body: Buffer | string): string =>
  createHash("sha256").update(body).digest("hex");
const identityPaths = [
  "apps/desktop/package.json",
  "packages/voidra/package.json",
  "packages/voidra/src/versions.ts",
];
function pinCli(text: string, version: string): string {
  return text.replace(
    /voidra@\d+(?:\.\d+\.\d+)?(?=[\s`])/g,
    `voidra@${version}`,
  );
}
async function skillPaths(root: string): Promise<string[]> {
  return (await readdir(join(root, "skills"), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("voidra-"))
    .map((entry) => `skills/${entry.name}/SKILL.md`)
    .sort();
}
async function inputs(root: string): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  for (const path of [...identityPaths, ...(await skillPaths(root))])
    result.set(path, await readFile(await safePath(root, path), "utf8"));
  return result;
}
function declared(path: string, text: string): string {
  if (path.endsWith("package.json"))
    return String((JSON.parse(text) as { version: unknown }).version);
  if (path.endsWith("versions.ts")) {
    const values = [
      ...text.matchAll(/export const PACKAGE_VERSION = "([^"]+)";/g),
    ];
    if (values.length !== 1)
      throw Error("Reader version declaration is invalid");
    return values[0]?.[1] ?? "";
  }
  const metadata = parseRecord(path, text).data.metadata as
    | { version?: unknown }
    | undefined;
  return String(metadata?.version);
}
export async function readAlignment(
  root: string,
): Promise<{ version: string; paths: string[] }> {
  const files = await inputs(root),
    versions = [...files].map(([path, text]) => declared(path, text)),
    version = versions[0] ?? "";
  if (!isReleaseVersion(version) || versions.some((value) => value !== version))
    throw Error(
      "App, library, reader and skills must have matching aligned versions",
    );
  return { version, paths: [...files.keys()] };
}
export async function alignVersions(
  root: string,
  version: string,
): Promise<string[]> {
  if (!isReleaseVersion(version))
    throw Error("Use a canonical stable X.Y.Z release version");
  const files = await inputs(root),
    changed: string[] = [];
  // Parse every input before writing; preserve unknown metadata and skill bodies.
  const next = new Map<string, string>();
  for (const [path, text] of files) {
    declared(path, text);
    if (path.endsWith("package.json")) {
      const data = JSON.parse(text);
      data.version = version;
      next.set(path, `${JSON.stringify(data, null, 2)}\n`);
    } else if (path.endsWith("versions.ts"))
      next.set(
        path,
        text.replace(
          /export const PACKAGE_VERSION = "[^"]+";/,
          `export const PACKAGE_VERSION = "${version}";`,
        ),
      );
    else {
      const record = parseRecord(path, text),
        metadata = record.data.metadata as Record<string, unknown>;
      next.set(
        path,
        serializeRecord(
          record,
          {
            ...record.data,
            metadata: { ...metadata, version },
          },
          pinCli(record.body, version),
        ).toString(),
      );
    }
  }
  async function references(relative: string): Promise<void> {
    for (const entry of await readdir(await safePath(root, relative), {
      withFileTypes: true,
    })) {
      const path = `${relative}/${entry.name}`;
      if (entry.isDirectory()) await references(path);
      else if (
        entry.isFile() &&
        entry.name.endsWith(".md") &&
        entry.name !== "SKILL.md"
      ) {
        const text = await readFile(await safePath(root, path), "utf8");
        files.set(path, text);
        next.set(path, pinCli(text, version));
      }
    }
  }
  for (const path of await skillPaths(root)) await references(dirname(path));
  const compatibilityPath = "fixtures/newer-format/expected.json",
    compatibility = await readFile(
      await safePath(root, compatibilityPath),
      "utf8",
    ).catch((error) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    });
  if (compatibility !== null) {
    const snapshot = JSON.parse(compatibility) as {
      diagnostics: Array<{ code: string; message: string }>;
    };
    if (!Array.isArray(snapshot.diagnostics))
      throw Error("Compatibility snapshot diagnostics are invalid");
    snapshot.diagnostics = snapshot.diagnostics.map((diagnostic) =>
      diagnostic.code === "newer-format"
        ? {
            ...diagnostic,
            message: diagnostic.message.replace(
              /(; this package is )\d+\.\d+\.\d+$/,
              `$1${version}`,
            ),
          }
        : diagnostic,
    );
    files.set(compatibilityPath, compatibility);
    next.set(compatibilityPath, `${JSON.stringify(snapshot, null, 2)}\n`);
  }
  for (const [path, text] of next)
    if (files.get(path) !== text) {
      const full = await safePath(root, path),
        temp = `${full}.${randomUUID()}.tmp`;
      await writeFile(temp, text);
      await rename(temp, full);
      changed.push(path);
    }
  return changed;
}
export async function selectNotes(
  root: string,
  version: string,
): Promise<string> {
  if (!isReleaseVersion(version)) throw Error("Invalid release version");
  const path = `.voidra/releases/${version}.md`;
  try {
    const record = parseRecord(
        path,
        await readFile(await safePath(root, path), "utf8"),
      ),
      data = schemas.release.parse(record.data);
    if (data.version !== version || data.status !== "released")
      throw Error(
        "Finish the exact local Release review/tag before publication",
      );
    const notes = record.body.trim();
    if (!notes) throw Error("Release notes are empty");
    return `${notes}\n`;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const text = await readFile(await safePath(root, "CHANGELOG.md"), "utf8"),
    match = text.match(
      new RegExp(
        `^## (?:\\[${version.replaceAll(".", "\\.")}\\]|${version.replaceAll(".", "\\.")})(?:[ \t][^\\n]*)?\\n([\\s\\S]*?)(?=^## |$(?![\\s\\S]))`,
        "m",
      ),
    );
  if (!match?.[1]?.trim())
    throw Error(`Missing matching release notes for ${version}`);
  return `${match[1].trim()}\n`;
}
export interface ReleaseFile {
  name: string;
  size: number;
  sha256: string;
}
export interface ReleaseManifest {
  schema: 1;
  version: string;
  tag: string;
  source: string;
  notes: string;
  files: ReleaseFile[];
  npmAsset: string;
  npmIntegrity: string;
  skillsHash: string;
}
export interface StagedRelease extends ReleaseManifest {
  directory: string;
}
export function manifestBytes(stage: ReleaseManifest): Buffer {
  return Buffer.from(
    `${JSON.stringify({ schema: stage.schema, version: stage.version, tag: stage.tag, source: stage.source, notes: stage.notes, files: stage.files, npmAsset: stage.npmAsset, npmIntegrity: stage.npmIntegrity, skillsHash: stage.skillsHash }, null, 2)}\n`,
  );
}
async function skillsHash(root: string): Promise<string> {
  const parts: string[] = [];
  async function walk(relative: string) {
    const full = await safePath(root, relative),
      stat = await lstat(full);
    if (stat.isDirectory())
      for (const name of (await readdir(full)).sort())
        await walk(`${relative}/${name}`);
    else if (stat.isFile())
      parts.push(
        `${relative}\0${sha(await readFile(full))}\0${(stat.mode & 0o111) !== 0}`,
      );
    else throw Error("Unsupported skill payload");
  }
  for (const path of await skillPaths(root)) await walk(dirname(path));
  return sha(parts.join("\n"));
}
export async function stageRelease(
  root: string,
  directory: string,
  tag: string,
  assets: string[],
): Promise<StagedRelease> {
  const { version } = await readAlignment(root);
  if (tag !== `v${version}`) throw Error("Tag and aligned versions differ");
  const files: ReleaseFile[] = [];
  for (const name of [...new Set(assets)].sort()) {
    if (basename(name) !== name || !name || !/^[-A-Za-z0-9._]+$/.test(name))
      throw Error("Unsafe artifact name");
    const path = join(directory, name),
      stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink())
      throw Error("Artifact must be a real file");
    const body = await readFile(path);
    files.push({ name, size: body.length, sha256: sha(body) });
  }
  const npmAsset = `voidra-${version}.tgz`;
  if (
    !files.some((file) => file.name === npmAsset) ||
    !files.some((file) => file.name.endsWith(".dmg"))
  )
    throw Error("DMG and matching npm archive are required");
  const packaged = JSON.parse(
    execFileSync(
      "tar",
      ["-xOf", join(directory, npmAsset), "package/package.json"],
      { encoding: "utf8", maxBuffer: 1024 * 1024 },
    ),
  ) as {
    name?: unknown;
    version?: unknown;
    license?: unknown;
    bin?: { voidra?: unknown };
  };
  if (
    packaged.name !== "voidra" ||
    packaged.version !== version ||
    packaged.license !== "AGPL-3.0-or-later" ||
    packaged.bin?.voidra !== "dist/cli-entry.js"
  )
    throw Error("npm archive metadata does not match the aligned release");
  const source = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
    }).trim(),
    notes = await selectNotes(root, version),
    npmIntegrity = `sha512-${createHash("sha512")
      .update(await readFile(join(directory, npmAsset)))
      .digest("base64")}`;
  const stage: StagedRelease = {
    schema: 1,
    version,
    tag,
    source,
    notes,
    files,
    npmAsset,
    npmIntegrity,
    skillsHash: await skillsHash(root),
    directory,
  };
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, "CHECKSUMS.txt"),
    files.map((file) => `${file.sha256}  ${file.name}\n`).join(""),
  );
  await writeFile(
    join(directory, "release-manifest.json"),
    manifestBytes(stage),
  );
  return stage;
}
export async function verifyStage(stage: StagedRelease): Promise<void> {
  for (const file of stage.files) {
    const stat = await lstat(join(stage.directory, file.name));
    if (!stat.isFile() || stat.isSymbolicLink())
      throw Error("Artifact changed");
    const body = await readFile(join(stage.directory, file.name));
    if (body.length !== file.size || sha(body) !== file.sha256)
      throw Error(`Artifact checksum mismatch: ${file.name}`);
  }
  if (
    !(await readFile(join(stage.directory, "release-manifest.json"))).equals(
      manifestBytes(stage),
    )
  )
    throw Error("Release manifest mismatch");
  const sums = stage.files
    .map((file) => `${file.sha256}  ${file.name}\n`)
    .join("");
  if ((await readFile(join(stage.directory, "CHECKSUMS.txt"), "utf8")) !== sums)
    throw Error("Checksums mismatch");
}
export interface GitHubRemote {
  inspect(): Promise<{ draft: boolean; notes: string; source: string } | null>;
  createDraft(): Promise<void>;
  readAsset(name: string): Promise<Buffer | null>;
  upload(name: string, body: Buffer): Promise<void>;
  publish(): Promise<void>;
}
export async function publishGitHub(
  stage: StagedRelease,
  remote: GitHubRemote,
): Promise<void> {
  await verifyStage(stage);
  let existing = await remote.inspect();
  if (
    existing &&
    (existing.source !== stage.source ||
      existing.notes.trim() !== stage.notes.trim())
  )
    throw Error("Existing release/source notes mismatch; use a new version");
  if (!existing) {
    await remote.createDraft();
    existing = await remote.inspect();
    if (!existing?.draft)
      throw Error("Release draft creation was not confirmed");
  }
  for (const name of [
    ...stage.files.map((file) => file.name),
    "CHECKSUMS.txt",
    "release-manifest.json",
  ]) {
    const expected = await readFile(join(stage.directory, name)),
      actual = await remote.readAsset(name);
    if (actual) {
      if (!actual.equals(expected))
        throw Error(`Existing release asset mismatch: ${name}`);
    } else {
      if (!existing.draft)
        throw Error(
          `Published release is missing asset ${name}; stop instead of replacing published content`,
        );
      await remote.upload(name, expected);
      if (!(await remote.readAsset(name))?.equals(expected))
        throw Error(`Asset upload was not confirmed: ${name}`);
    }
  }
  const ready = await remote.inspect();
  if (
    !ready ||
    ready.source !== stage.source ||
    ready.notes.trim() !== stage.notes.trim()
  )
    throw Error("Release changed during staging; publication stopped");
  if (ready.draft) await remote.publish();
  const confirmed = await remote.inspect();
  if (
    !confirmed ||
    confirmed.draft ||
    confirmed.source !== stage.source ||
    confirmed.notes.trim() !== stage.notes.trim()
  )
    throw Error("Public release was not confirmed");
}
export interface NpmRemote {
  inspect(): Promise<{ integrity: string; source: string } | null>;
  publish(): Promise<void>;
}
export async function publishNpm(
  stage: StagedRelease,
  remote: NpmRemote,
  wait: () => Promise<void> = () =>
    new Promise<void>((done) => setTimeout(done, 5000)),
): Promise<void> {
  await verifyStage(stage);
  let existing = await remote.inspect();
  if (!existing) await remote.publish();
  // Registry bytes and their provenance can become visible at different times.
  // An existing version is never published again while confirmation is pending.
  for (let attempt = 0; attempt < 12; attempt++) {
    if (!existing) existing = await remote.inspect();
    if (
      existing &&
      (existing.integrity !== stage.npmIntegrity ||
        (existing.source && existing.source !== stage.source))
    )
      throw Error(
        "Published npm integrity/provenance mismatch; use a new version",
      );
    if (existing?.source === stage.source) return;
    if (attempt < 11) {
      await wait();
      existing = await remote.inspect();
    }
  }
  throw Error(
    "npm publication integrity/provenance is still pending; preserve the version and retry confirmation",
  );
}
