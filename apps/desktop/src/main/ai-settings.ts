import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";

export interface SecretEncryption {
  available(): Promise<boolean>;
  encrypt(value: string): Promise<Buffer>;
  decrypt(value: Buffer): Promise<{ result: string; shouldReEncrypt: boolean }>;
}
const stored = z.looseObject({
  version: z.literal(1),
  key: z
    .string()
    .regex(/^[A-Za-z0-9+/]+={0,2}$/)
    .nullable(),
  model: z.string().trim().min(1).max(200).nullable(),
});
type Stored = z.infer<typeof stored>;
export interface AiPreferences {
  configured: boolean;
  available: boolean;
  model: string | null;
}
export class AiSettings {
  readonly file: string;
  private encryption: SecretEncryption;
  private queue: Promise<void> = Promise.resolve();
  constructor(file: string, encryption: SecretEncryption) {
    this.file = file;
    this.encryption = encryption;
  }
  private async read(): Promise<Stored> {
    const raw = await readFile(this.file, "utf8").catch((error) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw new Error("AI settings could not be read");
    });
    if (raw === null) return { version: 1, key: null, model: null };
    try {
      return stored.parse(JSON.parse(raw));
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
  /** Startup reads metadata only; it must not initialize the Keychain for a user with no key. */
  async configured(): Promise<{ configured: boolean; model: string | null }> {
    const data = await this.read();
    return { configured: data.key !== null, model: data.model };
  }
  async status(): Promise<AiPreferences> {
    return {
      ...(await this.configured()),
      available: await this.encryption.available(),
    };
  }
  async setKey(raw: string): Promise<void> {
    const key = z.string().trim().min(1).max(4096).parse(raw);
    if (!(await this.encryption.available()))
      throw new Error(
        "Secure Keychain encryption is unavailable; the key was not saved",
      );
    let bytes: Buffer;
    try {
      bytes = await this.encryption.encrypt(key);
    } catch {
      throw new Error("Secure encryption failed; the key was not saved");
    }
    if (!bytes.length || bytes.includes(Buffer.from(key)))
      throw new Error("Encryption did not protect the key");
    await this.change((data) => {
      data.key = bytes.toString("base64");
    });
  }
  async setModel(raw: string): Promise<void> {
    const model = z.string().trim().min(1).max(200).parse(raw);
    return this.change((data) => {
      data.model = model;
    });
  }
  async removeKey(): Promise<void> {
    try {
      await this.change((data) => {
        data.key = null;
      });
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !error.message.startsWith("Saved AI settings are invalid")
      )
        throw error;
      // Explicit removal may discard an unreadable private credential file; startup never does.
      await rm(this.file, { force: true });
    }
  }
  async key(): Promise<string | null> {
    const data = await this.read();
    if (data.key === null) return null;
    if (!(await this.encryption.available()))
      throw new Error("Secure Keychain encryption is unavailable");
    let result: Awaited<ReturnType<SecretEncryption["decrypt"]>>;
    try {
      result = await this.encryption.decrypt(Buffer.from(data.key, "base64"));
    } catch {
      throw new Error(
        "The saved key could not be unlocked; re-enter it in Settings",
      );
    }
    if (result.shouldReEncrypt) {
      const encrypted = await this.encryption.encrypt(result.result);
      await this.change((current) => {
        if (current.key === data.key)
          current.key = encrypted.toString("base64");
      });
    }
    return result.result;
  }
}
