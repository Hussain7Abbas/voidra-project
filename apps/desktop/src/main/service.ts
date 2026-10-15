import { createHash, randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { type UtilityProcess, utilityProcess } from "electron";
import { z } from "zod";
import {
  type BridgeEvent,
  type KnowledgeData,
  type KnowledgeRequest,
  knowledgeDataSchema,
  type ProjectInfo,
  projectSchema,
  type WorkspaceRequest,
  type WorkspaceSnapshot,
  workspaceEdits,
  workspaceSchema,
} from "../shared/bridge.ts";

const responseSchema = z.union([
  z.strictObject({
    requestId: z.string(),
    ok: z.literal(true),
    data: knowledgeDataSchema,
  }),
  z.strictObject({
    requestId: z.string(),
    ok: z.literal(true),
    workspace: workspaceSchema,
  }),
  z.strictObject({
    requestId: z.string(),
    ok: z.literal(true),
    project: projectSchema,
  }),
  z.strictObject({
    requestId: z.string(),
    ok: z.literal(false),
    message: z.string(),
  }),
]);
export class ProjectService {
  state: "starting" | "ready" | "restarting" | "failed" = "starting";
  private child: UtilityProcess | null = null;
  private disposed = false;
  private restarts = 0;
  private pending = new Map<
    string,
    {
      resolve: (
        project: ProjectInfo | WorkspaceSnapshot | KnowledgeData,
      ) => void;
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
      [
        this.root,
        join(directory, "index.sqlite"),
        join(
          this.data,
          "form-submissions",
          createHash("sha256").update(this.root).digest("hex"),
        ),
      ],
      { serviceName: "Voidra project service" },
    );
    this.child.on("message", (input) => {
      if (
        z.strictObject({ event: z.literal("changed") }).safeParse(input).success
      ) {
        this.notify({ type: "changed" });
        return;
      }
      const parsed = responseSchema.safeParse(input);
      if (!parsed.success) return;
      const result = parsed.data;
      const pending = this.pending.get(result.requestId);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(result.requestId);
      if (result.ok) {
        this.state = "ready";
        pending.resolve(
          "project" in result
            ? result.project
            : "data" in result
              ? result.data
              : result.workspace,
        );
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
    return this.call({ command: "status" }) as Promise<ProjectInfo>;
  }
  workspace(
    request: WorkspaceRequest = { command: "workspace" },
  ): Promise<WorkspaceSnapshot> {
    return this.call(request) as Promise<WorkspaceSnapshot>;
  }
  query(request: KnowledgeRequest): Promise<KnowledgeData> {
    return this.call(request) as Promise<KnowledgeData>;
  }
  private call(
    input: { command: "status" } | WorkspaceRequest | KnowledgeRequest,
  ): Promise<ProjectInfo | WorkspaceSnapshot | KnowledgeData> {
    const child = this.child;
    if (!child)
      return Promise.reject(new Error("Project service is unavailable"));
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => {
          this.pending.delete(id);
          reject(new Error("Project service timed out"));
        },
        ["commit-planning", "recover-planning"].includes(input.command)
          ? 60000
          : input.command !== "workspace" &&
              Object.hasOwn(workspaceEdits, input.command)
            ? 30000
            : 5000,
      );
      this.pending.set(id, { resolve, reject, timer });
      child.postMessage({ requestId: id, ...input });
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
      child.postMessage({ requestId: randomUUID(), command: "shutdown" });
    });
    return this.shutdown;
  }
}
