import { createHash, randomUUID } from "node:crypto";
import {
  cp,
  lstat,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { parseRecord } from "voidra";
import { z } from "zod";
import {
  type SkillPreview,
  type SkillStatus,
  skillAgentSchema,
  skillNameSchema,
  skillOperationSchema,
} from "../shared/skills.ts";

const markerName = "voidra-skill.json";
const markerSchema = z.strictObject({
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  formatVersion: z.number().int().nonnegative(),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
});
type Marker = z.infer<typeof markerSchema>;
type Tree = Map<string, { body: Buffer; executable: boolean }>;
const digest = (body: string | Buffer): string =>
  createHash("sha256").update(body).digest("hex");
async function existing(path: string) {
  return lstat(path).catch((error) => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  });
}
async function tree(root: string): Promise<Tree> {
  const files: Tree = new Map();
  async function visit(relative: string) {
    const full = join(root, relative),
      stat = await lstat(full);
    if (stat.isSymbolicLink())
      throw new Error(
        "Skill contains a symbolic link; preserve it and manage the link manually.",
      );
    if (stat.isDirectory()) {
      if (relative)
        files.set(`${relative}/`, { body: Buffer.alloc(0), executable: false });
      for (const name of (await readdir(full)).sort())
        await visit(relative ? `${relative}/${name}` : name);
    } else if (stat.isFile())
      files.set(relative, {
        body: await readFile(full),
        executable: (stat.mode & 0o111) !== 0,
      });
    else throw new Error("Skill contains an unsupported file; preserved.");
  }
  await visit("");
  return files;
}
function treeHash(files: Tree, includeMarker = false): string {
  return digest(
    [...files]
      .filter(([path]) => includeMarker || path !== markerName)
      .map(
        ([path, file]) =>
          `${path}\0${file.body.length}\0${digest(file.body)}\0${file.executable}\n`,
      )
      .join(""),
  );
}
function declaration(
  files: Tree,
  name: string,
): { version: string; formatVersion: number } {
  const text = files.get("SKILL.md")?.body.toString();
  if (!text) throw new Error("Bundled skill is missing SKILL.md");
  const record = parseRecord("SKILL.md", text);
  if (record.data.name !== name)
    throw new Error("Bundled skill name does not match its folder");
  const metadata = z
    .object({
      version: z.string().regex(/^\d+\.\d+\.\d+$/),
      "format-version": z.string().regex(/^\d+$/),
    })
    .parse(record.data.metadata);
  return {
    version: metadata.version,
    formatVersion: Number(metadata["format-version"]),
  };
}
function marker(files: Tree): Marker | null {
  try {
    return markerSchema.parse(
      JSON.parse(files.get(markerName)?.body.toString() ?? "null"),
    );
  } catch {
    return null;
  }
}
/** Build-time copies are self-contained, checked and independent of agent installations. */
export async function prepareSkillBundle(
  source: string,
  destination: string,
): Promise<void> {
  await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true });
  for (const entry of (await readdir(source, { withFileTypes: true })).sort(
    (a, b) => a.name.localeCompare(b.name),
  )) {
    if (!entry.isDirectory() || !entry.name.startsWith("voidra-")) continue;
    const name = skillNameSchema.parse(entry.name),
      files = await tree(join(source, name)),
      meta = declaration(files, name);
    const target = join(destination, name);
    await cp(join(source, name), target, {
      recursive: true,
      errorOnExist: true,
      force: false,
    });
    await writeFile(
      join(target, markerName),
      `${JSON.stringify({ ...meta, contentHash: treeHash(files) }, null, 2)}\n`,
    );
  }
}
function difference(old: Tree, next: Tree): string {
  const hunks: string[] = [];
  for (const path of [...new Set([...old.keys(), ...next.keys()])].sort()) {
    const before = old.get(path)?.body,
      after = next.get(path)?.body;
    if (
      before?.equals(after ?? Buffer.alloc(0)) &&
      old.get(path)?.executable === next.get(path)?.executable
    )
      continue;
    const header = `--- installed/${path}\n+++ bundled/${path}`;
    if (path.endsWith("/")) {
      hunks.push(`${header}\nDirectory ${after ? "added" : "removed"}.`);
      continue;
    }
    if (before?.equals(after ?? Buffer.alloc(0))) {
      hunks.push(`${header}\nExecutable permission changed.`);
      continue;
    }
    if (
      before?.includes(0) ||
      after?.includes(0) ||
      (before?.length ?? 0) > 32768 ||
      (after?.length ?? 0) > 32768
    ) {
      hunks.push(
        `${header}\nBinary or large file: ${before ? digest(before) : "absent"} → ${after ? digest(after) : "removed"}`,
      );
      continue;
    }
    const a = before?.toString().split("\n") ?? [],
      b = after?.toString().split("\n") ?? [];
    let start = 0,
      endA = a.length,
      endB = b.length;
    while (start < endA && start < endB && a[start] === b[start]) start++;
    while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
      endA--;
      endB--;
    }
    hunks.push(
      `${header}\n@@ -${start + 1},${endA - start} +${start + 1},${endB - start} @@\n${a
        .slice(start, endA)
        .map((line) => `-${line}`)
        .join("\n")}\n${b
        .slice(start, endB)
        .map((line) => `+${line}`)
        .join("\n")}`,
    );
  }
  const result = hunks.join("\n\n");
  return result.length > 200000
    ? `${result.slice(0, 200000)}\n[Preview truncated; full contents are bound by the displayed revision.]`
    : result || "Contents are unchanged.";
}
export class SkillInstaller {
  readonly bundle: string;
  readonly home: string;
  private queue: Promise<void> = Promise.resolve();
  constructor(bundle: string, home: string) {
    this.bundle = bundle;
    this.home = home;
  }
  private parent(agent: "claude" | "codex"): string {
    return join(
      this.home,
      agent === "claude" ? ".claude" : ".agents",
      "skills",
    );
  }
  private async safeParent(agent: "claude" | "codex"): Promise<void> {
    for (const path of [
      join(this.home, agent === "claude" ? ".claude" : ".agents"),
      this.parent(agent),
    ]) {
      const stat = await existing(path);
      if (stat && (stat.isSymbolicLink() || !stat.isDirectory()))
        throw new Error(
          "Agent skill folder is a link or non-directory; preserved.",
        );
    }
  }
  private async bundled(name: string): Promise<{ files: Tree; meta: Marker }> {
    skillNameSchema.parse(name);
    const files = await tree(join(this.bundle, name)),
      meta = marker(files);
    if (
      !meta ||
      meta.contentHash !== treeHash(files) ||
      JSON.stringify(declaration(files, name)) !==
        JSON.stringify({
          version: meta.version,
          formatVersion: meta.formatVersion,
        })
    )
      throw new Error(
        "Bundled skill changed or is invalid; rebuild the bundle.",
      );
    return { files, meta };
  }
  private async installed(
    agent: "claude" | "codex",
    name: string,
  ): Promise<Tree | null> {
    await this.safeParent(agent);
    const path = join(this.parent(agent), name),
      stat = await existing(path);
    if (!stat) return null;
    if (!stat.isDirectory() || stat.isSymbolicLink())
      throw new Error("Installed skill is a link or non-directory; preserved.");
    return tree(path);
  }
  async status(projectFormat?: number): Promise<SkillStatus[]> {
    const rows: SkillStatus[] = [];
    for (const entry of (
      await readdir(this.bundle, { withFileTypes: true })
    ).sort((a, b) => a.name.localeCompare(b.name))) {
      if (!entry.isDirectory()) continue;
      const name = skillNameSchema.parse(entry.name),
        { meta } = await this.bundled(name);
      for (const agent of ["claude", "codex"] as const) {
        let files: Tree | null = null,
          blocked: string | null = null;
        try {
          files = await this.installed(agent, name);
        } catch (error) {
          blocked = error instanceof Error ? error.message : String(error);
        }
        const saved = files ? marker(files) : null;
        let format = saved?.formatVersion ?? null;
        if (files && format === null) {
          try {
            format = declaration(files, name).formatVersion;
          } catch {}
        }
        rows.push({
          agent,
          name,
          installedVersion: saved?.version ?? null,
          bundledVersion: meta.version,
          installedFormat: format,
          bundledFormat: meta.formatVersion,
          present: files !== null || blocked !== null,
          edited:
            files !== null && (!saved || saved.contentHash !== treeHash(files)),
          blocked,
          revision: files
            ? treeHash(files, true)
            : blocked
              ? null
              : digest("absent"),
          compatibility:
            format !== null &&
            projectFormat !== undefined &&
            format !== projectFormat
              ? `Installed skill writes ${format < projectFormat ? "older" : "newer"} format ${format}; this project uses ${projectFormat}.`
              : null,
        });
      }
    }
    return rows;
  }
  async preview(
    agent: "claude" | "codex",
    name: string,
    operation: "install" | "remove",
  ): Promise<SkillPreview> {
    skillAgentSchema.parse(agent);
    skillOperationSchema.parse(operation);
    const { files: bundled } = await this.bundled(name),
      old = await this.installed(agent, name),
      saved = old ? marker(old) : null;
    return {
      agent,
      name,
      operation,
      revision: old ? treeHash(old, true) : digest("absent"),
      bundleRevision: treeHash(bundled, true),
      requiresConfirmation:
        old !== null && (!saved || saved.contentHash !== treeHash(old)),
      diff: difference(
        old ?? new Map(),
        operation === "install" ? bundled : new Map(),
      ),
    };
  }
  apply(
    selected: Pick<
      SkillPreview,
      "agent" | "name" | "operation" | "revision" | "bundleRevision"
    >,
    confirmed: boolean,
  ): Promise<void> {
    const operation = this.queue
      .catch(() => {})
      .then(async () => {
        const current = await this.preview(
          selected.agent,
          selected.name,
          selected.operation,
        );
        if (
          current.revision !== selected.revision ||
          current.bundleRevision !== selected.bundleRevision
        )
          throw new Error("Skill or bundle changed; review a fresh preview.");
        if (current.requiresConfirmation && !confirmed)
          throw new Error(
            "Confirm the displayed hand edits before replacing or removing this skill.",
          );
        const parent = this.parent(selected.agent),
          target = join(parent, selected.name),
          token = randomUUID(),
          stage = join(parent, `.voidra-stage-${token}`),
          backup = join(parent, `.voidra-backup-${token}`);
        await mkdir(parent, { recursive: true });
        await this.safeParent(selected.agent);
        let backedUp = false,
          placed = false;
        try {
          if (selected.operation === "install") {
            const verified = await this.bundled(selected.name);
            if (treeHash(verified.files, true) !== current.bundleRevision)
              throw new Error(
                "Bundled copy changed; installed version was preserved.",
              );
            await mkdir(stage, { mode: 0o700 });
            // Electron can read asar entries, but Node's recursive cp cannot
            // copy their virtual directories. Materialize the checked bytes.
            for (const [path, file] of verified.files) {
              const destination = join(stage, path);
              if (path.endsWith("/"))
                await mkdir(destination, { recursive: true });
              else {
                await mkdir(dirname(destination), { recursive: true });
                await writeFile(destination, file.body, {
                  flag: "wx",
                  mode: file.executable ? 0o755 : 0o644,
                });
              }
            }
            const copied = await tree(stage);
            if (treeHash(copied, true) !== current.bundleRevision)
              throw new Error(
                "Bundled copy changed; installed version was preserved.",
              );
          }
          const latest = await this.preview(
            selected.agent,
            selected.name,
            selected.operation,
          );
          if (
            latest.revision !== current.revision ||
            latest.bundleRevision !== current.bundleRevision
          )
            throw new Error("Skill changed during copy; preserved.");
          if (await existing(target)) {
            await rename(target, backup);
            backedUp = true;
          }
          if (selected.operation === "install") {
            await rename(stage, target);
            placed = true;
          }
        } catch (error) {
          if (backedUp && !placed) await rename(backup, target);
          throw error;
        } finally {
          await rm(stage, { recursive: true, force: true });
        }
        if (backedUp) await rm(backup, { recursive: true, force: true });
      });
    this.queue = operation;
    return operation;
  }
}
