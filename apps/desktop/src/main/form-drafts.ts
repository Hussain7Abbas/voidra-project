import { createHash, randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  open,
  readdir,
  realpath,
  rename,
  rm,
} from "node:fs/promises";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import {
  type DraftInput,
  type DraftView,
  draftFamilySchema,
  draftInputSchema,
} from "../shared/form-drafts.ts";

const bodySchema = z.strictObject({
  version: z.literal(1),
  id: z.uuid(),
  family: draftFamilySchema,
  target: z.string().max(1000),
  values: z.record(z.string(), z.json()),
  createdAt: z.string(),
  updatedAt: z.string(),
});
const hash = (raw: string) => createHash("sha256").update(raw).digest("hex");
const message = (error: unknown) =>
  error instanceof Error ? error.message : "Draft could not be read";
/** Private app-data storage, independent of canonical history and disposable project indexes. */
export class DraftStore {
  private directory: string;
  private checkpoint:
    | ((stage: "temporary-written" | "replaced", id: string) => Promise<void>)
    | undefined;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(
    directory: string,
    checkpoint?: (
      stage: "temporary-written" | "replaced",
      id: string,
    ) => Promise<void>,
  ) {
    this.directory = directory;
    this.checkpoint = checkpoint;
  }
  /** Retire the removed provider without unlocking keys or following linked directories. */
  async removeLegacyCredentials(): Promise<void> {
    await this.scope(null);
    const directory = join(this.directory, "credentials");
    const entry = await lstat(directory).catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return null;
        throw error;
      },
    );
    if (!entry) return;
    if (entry.isSymbolicLink() || !entry.isDirectory())
      throw Error("Legacy credential directory must not be a link or file");
    await rm(directory, { recursive: true, force: true });
  }
  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const pending = this.queue.catch(() => {}).then(operation);
    this.queue = pending;
    return pending;
  }
  private async scope(project: string | null): Promise<string> {
    const scope = project === null ? "global" : hash(await realpath(project));
    const directory = join(this.directory, scope);
    for (const path of [this.directory, directory]) {
      const entry = await lstat(path).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return null;
        throw error;
      });
      if (entry && (entry.isSymbolicLink() || !entry.isDirectory()))
        throw Error("Draft directory must not be a link or file");
    }
    return directory;
  }
  private path(directory: string, id: string) {
    return join(directory, `${z.uuid().parse(id)}.json`);
  }
  private async raw(directory: string, id: string): Promise<string | null> {
    const path = this.path(directory, id),
      entry = await lstat(path).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return null;
        throw error;
      });
    if (!entry) return null;
    if (entry.isSymbolicLink() || !entry.isFile())
      throw Error("Draft file must not be a link");
    if (entry.size > 2_000_000) throw Error("Oversized draft preserved");
    const handle = await open(path, "r");
    try {
      const actual = await handle.stat();
      if (actual.ino !== entry.ino || actual.dev !== entry.dev)
        throw Error("Draft changed while opening");
      return await handle.readFile("utf8");
    } finally {
      await handle.close();
    }
  }
  private check(raw: string | null, revision: string | null) {
    if ((raw === null ? null : hash(raw)) !== revision)
      throw Error(
        "This draft changed in another window. Reopen it before saving.",
      );
  }
  private async write(
    directory: string,
    id: string,
    data: unknown,
  ): Promise<string> {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await this.scope(null); // Recheck the private root after creation.
    if ((await lstat(directory)).isSymbolicLink())
      throw Error("Draft directory must not be a link");
    const path = this.path(directory, id),
      temp = join(directory, `.${id}.${randomUUID()}.tmp`),
      raw = `${JSON.stringify(data)}\n`;
    try {
      const handle = await open(temp, "wx", 0o600);
      try {
        await handle.writeFile(raw);
        await handle.sync();
      } finally {
        await handle.close();
      }
      await this.checkpoint?.("temporary-written", id);
      await rename(temp, path);
      const parent = await open(directory, "r");
      try {
        await parent.sync();
      } finally {
        await parent.close();
      }
      await this.checkpoint?.("replaced", id);
      return raw;
    } catch {
      throw Error(
        "The draft could not be saved on this computer. Keep this form open and retry.",
      );
    } finally {
      await rm(temp, { force: true }).catch(() => {});
    }
  }
  private view(raw: string, id: string): DraftView {
    try {
      let parsed = JSON.parse(raw);
      if (parsed.version === 0)
        parsed = {
          version: 1,
          id: parsed.id,
          family: parsed.kind,
          target: parsed.target,
          values: { ...parsed.values, mode: parsed.values.mode ?? "normal" },
          createdAt: "",
          updatedAt: "",
        };
      const data = bodySchema.parse(parsed);
      if (data.id !== id) throw Error("Draft identity differs");
      const generated = data.values.generated;
      const output =
        generated && typeof generated === "object" && !Array.isArray(generated)
          ? "title" in generated
            ? generated
            : generated[data.values.mode === "agentic" ? "agentic" : "normal"]
          : null;
      const generatedTitle =
        output && typeof output === "object" && !Array.isArray(output)
          ? output.title
          : null;
      const captureText =
        data.family === "task-create"
          ? data.values.mode === "agentic"
            ? [generatedTitle, data.values.prompt]
            : [data.values.title, generatedTitle, data.values.description]
          : [];
      const candidate = [
        ...captureText,
        data.values.title,
        data.values.model,
        data.values.prompt,
        data.values.description,
        data.values.name,
        data.values.feedback,
        data.values.value,
        data.values.body,
        data.values.text,
        data.values.notes,
        data.values.questions,
        data.values.message,
        data.values.path,
        data.values.projectName,
      ].find((value) => typeof value === "string" && value.trim());
      const { version: _version, ...fields } = data;
      return {
        ...fields,
        label:
          typeof candidate === "string"
            ? candidate.replace(/\s+/g, " ").slice(0, 80)
            : data.family === "release-prepare" &&
                Array.isArray(data.values.selected)
              ? `Release · ${data.values.selected.length} selected tasks`
              : data.family === "question-answer"
                ? "Unfinished answer"
                : "Unfinished form",
        revision: hash(raw),
      };
    } catch {
      throw Error("Invalid saved draft; original file preserved");
    }
  }
  async read(project: string | null, id: string): Promise<DraftView> {
    const raw = await this.raw(await this.scope(project), id);
    if (raw === null) throw Error("Draft no longer exists");
    return this.view(raw, id);
  }
  async list(
    project: string | null,
    filter: {
      family?: DraftInput["family"] | undefined;
      target?: string | undefined;
    } = {},
  ) {
    const directory = await this.scope(project),
      drafts: DraftView[] = [],
      problems: { id: string; message: string }[] = [];
    for (const name of await readdir(directory).catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return [];
        throw error;
      },
    )) {
      if (!name.endsWith(".json")) continue;
      const id = name.slice(0, -5);
      try {
        const draft = await this.read(project, id);
        if (
          (!filter.family || draft.family === filter.family) &&
          (filter.target === undefined || draft.target === filter.target)
        )
          drafts.push(draft);
      } catch (error) {
        problems.push({ id, message: message(error) });
      }
    }
    drafts.sort(
      (a, b) =>
        b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id),
    );
    return { drafts, problems };
  }
  put(project: string | null, input: DraftInput): Promise<DraftView> {
    return this.serialize(async () => {
      const data = draftInputSchema.parse(input);
      if (Buffer.byteLength(JSON.stringify(data.values), "utf8") > 1_000_000)
        throw Error("Draft is too large");
      const directory = await this.scope(project),
        old = await this.raw(directory, data.id);
      if (old !== null && hash(old) !== data.revision) {
        const saved = this.view(old, data.id);
        if (
          saved.family === data.family &&
          saved.target === data.target &&
          isDeepStrictEqual(saved.values, data.values)
        )
          return saved;
      }
      this.check(old, data.revision);
      const previous = old === null ? null : this.view(old, data.id),
        now = new Date().toISOString();
      if (
        previous &&
        (previous.family !== data.family || previous.target !== data.target)
      )
        throw Error("Draft context changed");
      const raw = await this.write(directory, data.id, {
        version: 1,
        id: data.id,
        family: data.family,
        target: data.target,
        values: data.values,
        createdAt: previous?.createdAt || now,
        updatedAt: now,
      });
      return this.view(raw, data.id);
    });
  }
  delete(project: string | null, id: string, revision: string): Promise<void> {
    return this.serialize(async () => {
      const directory = await this.scope(project);
      const raw = await this.raw(directory, id);
      if (raw === null) return;
      this.check(raw, revision);
      await rm(this.path(directory, id));
      const parent = await open(directory, "r");
      try {
        await parent.sync();
      } finally {
        await parent.close();
      }
    });
  }
}
