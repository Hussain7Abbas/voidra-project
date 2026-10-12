import { createHash, randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { type UtilityProcess, utilityProcess } from "electron";
import { z } from "zod";
import {
  type BridgeEvent,
  type ProjectInfo,
  projectSchema,
} from "../shared/bridge.ts";

const responseSchema = z.discriminatedUnion("ok", [
  z.strictObject({
    id: z.string(),
    ok: z.literal(true),
    project: projectSchema,
  }),
  z.strictObject({ id: z.string(), ok: z.literal(false), message: z.string() }),
]);
export class ProjectService {
  state: "starting" | "ready" | "restarting" | "failed" = "starting";
  private child: UtilityProcess | null = null;
  private disposed = false;
  private restarts = 0;
  private pending = new Map<
    string,
    {
      resolve: (project: ProjectInfo) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  readonly root: string;
  readonly data: string;
  readonly entry: string;
  readonly notify: (event: BridgeEvent) => void;
  constructor(
    root: string,
    data: string,
    entry: string,
    notify: (event: BridgeEvent) => void,
  ) {
    this.root = root;
    this.data = data;
    this.entry = entry;
    this.notify = notify;
  }
  async start(): Promise<void> {
    const directory = join(
      this.data,
      "projects",
      createHash("sha256").update(this.root).digest("hex"),
    );
    await mkdir(directory, { recursive: true });
    this.child = utilityProcess.fork(
      this.entry,
      [this.root, join(directory, "index.sqlite")],
      { serviceName: "Voidra project service" },
    );
    this.child.on("message", (input) => {
      const parsed = responseSchema.safeParse(input);
      if (!parsed.success) return;
      const result = parsed.data;
      const pending = this.pending.get(result.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(result.id);
      if (result.ok) {
        this.state = "ready";
        pending.resolve(result.project);
      } else pending.reject(new Error(result.message));
    });
    this.child.on("exit", () => {
      this.child = null;
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timer);
        pending.reject(new Error("Project service stopped"));
      }
      this.pending.clear();
      if (this.disposed) return;
      this.state = "restarting";
      this.notify({ type: "service", state: this.state });
      if (++this.restarts > 3) {
        this.state = "failed";
        this.notify({ type: "service", state: this.state });
        return;
      }
      setTimeout(() => {
        if (!this.disposed)
          void this.start()
            .then(() => this.status())
            .then(() => this.notify({ type: "service", state: "ready" }))
            .catch(() => {});
      }, 250);
    });
  }
  status(): Promise<ProjectInfo> {
    const child = this.child;
    if (!child)
      return Promise.reject(new Error("Project service is unavailable"));
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("Project service timed out"));
      }, 5000);
      this.pending.set(id, { resolve, reject, timer });
      child.postMessage({ id, command: "status" });
    });
  }
  async retry(): Promise<ProjectInfo> {
    this.restarts = 0;
    if (!this.child) await this.start();
    return this.status();
  }
  private shutdown: Promise<void> | null = null;
  dispose(): Promise<void> {
    if (this.shutdown) return this.shutdown;
    this.disposed = true;
    const child = this.child;
    if (!child) return Promise.resolve();
    this.shutdown = new Promise((resolve) => {
      const timer = setTimeout(() => child.kill(), 1000);
      child.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
      child.postMessage({ id: randomUUID(), command: "shutdown" });
    });
    return this.shutdown;
  }
}
