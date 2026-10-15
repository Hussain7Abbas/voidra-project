import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { hash, type OperationObserver, safePath } from "voidra";
import { z } from "zod";

const receiptSchema = z.strictObject({
  version: z.literal(1),
  id: z.uuid(),
  request: z.string().regex(/^[a-f0-9]{64}$/),
  operation: z.string().regex(/^op-[0-9a-hjkmnp-tv-z]{6}$/),
  state: z.enum(["prepared", "committed"]),
  changes: z
    .array(
      z.strictObject({
        path: z.string(),
        before: z.string().nullable(),
        after: z.string().nullable(),
      }),
    )
    .min(1),
});
type Receipt = z.infer<typeof receiptSchema>;
/** Binds one private form submission to the existing durable grouped-write receipt. */
export class FormSubmissions {
  private root: string;
  private directory: string;
  private active = new Map<string, Promise<unknown>>();
  constructor(root: string, directory: string) {
    this.root = root;
    this.directory = directory;
  }
  private async read(id: string): Promise<Receipt | null> {
    const raw = await readFile(
      join(this.directory, `${z.uuid().parse(id)}.json`),
      "utf8",
    ).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    if (raw === null) return null;
    try {
      const value = receiptSchema.parse(JSON.parse(raw));
      if (value.id !== id) throw Error("Identity");
      return value;
    } catch {
      throw Error(
        "Submission receipt is unreadable; preserved for recovery. Do not create this task again.",
      );
    }
  }
  private async write(value: Receipt) {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const path = join(this.directory, `${value.id}.json`),
      temp = `${path}.${randomUUID()}.tmp`;
    try {
      const handle = await open(temp, "wx", 0o600);
      try {
        await handle.writeFile(`${JSON.stringify(value)}\n`);
        await handle.sync();
      } finally {
        await handle.close();
      }
      await rename(temp, path);
      const directory = await open(this.directory, "r");
      try {
        await directory.sync();
      } finally {
        await directory.close();
      }
    } finally {
      await rm(temp, { force: true });
    }
  }
  private async completed(receipt: Receipt): Promise<boolean> {
    if (receipt.state === "committed") return true;
    const raw = await readFile(
      await safePath(
        this.root,
        `.voidra/local/operations/${receipt.operation}.json`,
        false,
        true,
      ),
      "utf8",
    ).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    if (raw !== null) {
      const operation = z
        .looseObject({
          id: z.literal(receipt.operation),
          state: z.enum(["prepared", "committed", "rolled-back"]),
        })
        .parse(JSON.parse(raw));
      if (operation.state === "committed") {
        await this.write({ ...receipt, state: "committed" });
        return true;
      }
      if (operation.state === "prepared")
        throw Error(
          "This submission has an interrupted write. Recover it before trying again.",
        );
    }
    const current = await Promise.all(
      receipt.changes.map(async (change) => {
        const bytes = await readFile(
          await safePath(this.root, change.path, false, true),
        ).catch((error: NodeJS.ErrnoException) => {
          if (error.code === "ENOENT") return null;
          throw error;
        });
        return bytes === null ? null : hash(bytes);
      }),
    );
    if (
      current.every((value, index) => value === receipt.changes[index]?.after)
    ) {
      await this.write({ ...receipt, state: "committed" });
      return true;
    }
    if (
      !current.every((value, index) => value === receipt.changes[index]?.before)
    )
      throw Error(
        "Submission state is uncertain. Recover the existing write before creating this task again.",
      );
    return false;
  }
  async perform<T>(
    id: string,
    request: unknown,
    edit: (observer: OperationObserver) => Promise<T>,
    snapshot: () => Promise<T>,
  ): Promise<T> {
    z.uuid().parse(id);
    const pending = this.active.get(id);
    if (pending) {
      await pending;
      return this.perform(id, request, edit, snapshot);
    }
    const operation = this.run(id, request, edit, snapshot);
    this.active.set(id, operation);
    try {
      return await operation;
    } finally {
      this.active.delete(id);
    }
  }
  private async run<T>(
    id: string,
    request: unknown,
    edit: (observer: OperationObserver) => Promise<T>,
    snapshot: () => Promise<T>,
  ): Promise<T> {
    const fingerprint = hash(JSON.stringify(request)),
      previous = await this.read(id);
    if (previous) {
      if (previous.request !== fingerprint)
        throw Error(
          "This draft was already submitted with different values. Open the existing task or start a new draft.",
        );
      if (await this.completed(previous)) return snapshot();
    }
    let receipt: Receipt | null = null;
    return edit({
      prepared: async (operation) => {
        receipt = {
          version: 1,
          id,
          request: fingerprint,
          operation: operation.id,
          state: "prepared",
          changes: operation.changes
            .filter((change) => change.before !== change.after)
            .map((change) => ({
              path: change.path,
              before: change.before === null ? null : hash(change.before),
              after: change.after === null ? null : hash(change.after),
            })),
        };
        await this.write(receipt);
      },
      committed: async (operation) => {
        if (!receipt || receipt.operation !== operation)
          throw Error("Submission operation differs");
        await this.write({ ...receipt, state: "committed" });
      },
    });
  }
}
