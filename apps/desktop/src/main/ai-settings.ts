import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import {
  type AiAgentConfiguration,
  aiAgentConfigurationSchema,
  aiEfforts,
} from "../shared/ai.ts";
import type { CodingClient } from "../shared/team.ts";

const stored = z.strictObject({
  version: z.literal(2),
  codex: aiAgentConfigurationSchema,
  "claude-code": aiAgentConfigurationSchema,
});
type Stored = z.infer<typeof stored>;
const defaults = (): Stored => ({
  version: 2,
  codex: { model: null, effort: "low" },
  "claude-code": { model: null, effort: "low" },
});
/** Non-secret preferences. Agent authentication remains owned by the installed CLI. */
export class AiSettings {
  readonly file: string;
  private queue: Promise<void> = Promise.resolve();
  constructor(file: string) {
    this.file = file;
  }
  private async read(): Promise<Stored> {
    const raw = await readFile(this.file, "utf8").catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return null;
        throw new Error("AI settings could not be read");
      },
    );
    if (raw === null) return defaults();
    try {
      const data = JSON.parse(raw);
      // Discard the obsolete encrypted provider credential without unlocking it.
      if (data.version === 1) return defaults();
      return stored.parse(data);
    } catch {
      throw new Error(
        "Saved AI settings are invalid; the original file has been preserved",
      );
    }
  }
  private change(edit: (data: Stored) => void): Promise<void> {
    this.queue = this.queue
      .catch(() => {})
      .then(async () => {
        const data = await this.read();
        edit(data);
        await mkdir(dirname(this.file), { recursive: true });
        const temp = `${this.file}.${randomUUID()}.tmp`;
        try {
          const handle = await open(temp, "wx", 0o600);
          try {
            await handle.writeFile(`${JSON.stringify(data, null, 2)}\n`);
            await handle.sync();
          } finally {
            await handle.close();
          }
          await rename(temp, this.file);
          const directory = await open(dirname(this.file), "r");
          try {
            await directory.sync();
          } finally {
            await directory.close();
          }
        } finally {
          await rm(temp, { force: true });
        }
      });
    return this.queue;
  }
  async configuration(client: CodingClient): Promise<AiAgentConfiguration> {
    return (await this.read())[client];
  }
  async set(client: CodingClient, raw: AiAgentConfiguration): Promise<void> {
    const configuration = aiAgentConfigurationSchema.parse(raw);
    if (
      !(aiEfforts[client] as readonly string[]).includes(configuration.effort)
    )
      throw Error("Choose an effort supported by the selected coding agent");
    await this.change((data) => {
      data[client] = configuration;
    });
  }
  async migrate(): Promise<void> {
    await this.change(() => {});
  }
}
