import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { extname, join } from "node:path";
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  type MenuItemConstructorOptions,
  nativeImage,
  nativeTheme,
  protocol,
  safeStorage,
  session,
  shell,
} from "electron";
import { projectDocumentPath } from "voidra";
import type { AiContext, AiIntent } from "../shared/ai.ts";
import {
  type BridgeEvent,
  type BridgeResponse,
  isKnowledgeRequest,
  isWorkspaceRequest,
  type ProjectInfo,
  requestSchema,
  responseSchema,
  type WorkspaceSnapshot,
} from "../shared/bridge.ts";
import { draftRecoveryText } from "../shared/form-drafts.ts";
import { skillBundleInstalled } from "../shared/skills.ts";
import { isTeamRequest } from "../shared/team.ts";
import { AiService } from "./ai-service.ts";
import { AiSettings } from "./ai-settings.ts";
import { openCodingClient } from "./coding-client-launcher.ts";
import { DraftStore } from "./form-drafts.ts";
import { OpenRouterClient } from "./openrouter.ts";
import {
  APP_ORIGIN,
  contentPolicy,
  isTrustedFrame,
  rendererDocument,
  resolveAsset,
} from "./security.ts";
import { ProjectService } from "./service.ts";
import { SkillInstaller } from "./skill-installer.ts";
import {
  AppStore,
  canonicalFolder,
  resolveTheme,
  WindowRegistry,
} from "./state.ts";
import { UpdateService } from "./updates.ts";

protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
]);
app.setPath(
  "userData",
  process.env.VOIDRA_DATA_DIR ?? join(app.getPath("appData"), "voidra-project"),
);
app.setName("Voidra Project");
const initialFolder = process.argv
  .find((arg) => arg.startsWith("--project="))
  ?.slice(10);
const single = app.requestSingleInstanceLock({ folder: initialFolder ?? null });
if (!single) app.quit();
const registry = new WindowRegistry();
const draftReady = new Set<number>();
const draftClosing = new Map<number, Promise<void>>();
const draftAcknowledgements = new Map<
  string,
  { window: number; resolve: () => void; reject: (error: Error) => void }
>();
function flushWindowDrafts(window: BrowserWindow): Promise<void> {
  if (!draftReady.has(window.id) || window.isDestroyed())
    return Promise.resolve();
  const pending = draftClosing.get(window.id);
  if (pending) return pending;
  const id = randomUUID();
  const promise = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      draftAcknowledgements.delete(id);
      reject(Error("Draft save did not finish. This window remains open."));
    }, 30000);
    draftAcknowledgements.set(id, {
      window: window.id,
      resolve: () => {
        clearTimeout(timer);
        resolve();
      },
      reject: (error) => {
        clearTimeout(timer);
        reject(error);
      },
    });
    notify(window.id, { type: "draft-flush", id });
  }).finally(() => draftClosing.delete(window.id));
  draftClosing.set(window.id, promise);
  return promise;
}
const services = new Map<number, ProjectService>();
const projects = new Map<number, ProjectInfo>();
const editing = new Map<number, WorkspaceSnapshot["editing"]>();
const textEditing = new Set<number>();
function updateEditMenu(id: number): void {
  const focused = BrowserWindow.getFocusedWindow();
  if (focused ? focused.id !== id : registry.ids().length !== 1) return;
  for (const direction of ["undo", "redo"] as const) {
    const item = Menu.getApplicationMenu()?.getMenuItemById(
      `project-${direction}`,
    );
    if (!item) continue;
    const value = editing.get(id)?.[direction];
    const verb = direction === "undo" ? "Undo" : "Redo";
    item.label = textEditing.has(id)
      ? `${verb} Typing`
      : `${verb}${value?.label ? ` ${value.label}` : ""}`;
    item.enabled = textEditing.has(id) || !!value?.label;
  }
}
const closing = new Set<Promise<void>>();
const notify = (id: number, event: BridgeEvent): void => {
  BrowserWindow.fromId(id)?.webContents.send("voidra:event", event);
  if (event.type === "changed" && services.get(id)?.state === "ready")
    void services
      .get(id)
      ?.workspace({ command: "workspace" })
      .then((workspace) => {
        editing.set(id, workspace.editing);
        updateEditMenu(id);
      })
      .catch(() => {});
};
const broadcast = (): void => {
  for (const id of registry.ids()) notify(id, { type: "changed" });
};
const store = new AppStore(join(app.getPath("userData"), "settings.json"));
const updateEndpoint = !app.isPackaged
  ? process.env.VOIDRA_TEST_RELEASES_URL
  : undefined;
if (
  updateEndpoint &&
  !["127.0.0.1", "localhost", "[::1]"].includes(
    new URL(updateEndpoint).hostname,
  )
)
  throw new Error("The test release endpoint must be local");
const updates = new UpdateService(
  app.getVersion(),
  updateEndpoint ??
    "https://api.github.com/repos/Hussain7Abbas/voidra-project/releases/latest",
  broadcast,
);
const skills = new SkillInstaller(
  join(app.getAppPath(), "dist/skills"),
  !app.isPackaged && process.env.VOIDRA_TEST_SKILLS_HOME
    ? process.env.VOIDRA_TEST_SKILLS_HOME
    : homedir(),
);
const encryption = {
  available: () => safeStorage.isAsyncEncryptionAvailable(),
  encrypt: (value: string) => safeStorage.encryptStringAsync(value),
  decrypt: (value: Buffer) => safeStorage.decryptStringAsync(value),
};
const drafts = new DraftStore(
  join(app.getPath("userData"), "form-drafts"),
  encryption,
);
const aiSettings = new AiSettings(
  join(app.getPath("userData"), "ai-settings.json"),
  encryption,
);
const aiEndpoint = !app.isPackaged
  ? process.env.VOIDRA_TEST_OPENROUTER_URL
  : undefined;
if (
  aiEndpoint &&
  !["127.0.0.1", "localhost", "[::1]"].includes(new URL(aiEndpoint).hostname)
)
  throw new Error("The test OpenRouter endpoint must be local");
const ai = new AiService(aiSettings, new OpenRouterClient(aiEndpoint));
async function aiContext(window: number, intent: AiIntent): Promise<AiContext> {
  if (
    intent.feature === "rewrite" ||
    intent.feature === "task-title" ||
    intent.feature === "task-capture"
  )
    return {
      feature: intent.feature,
      notes: intent.notes,
      target: intent.target,
      sources: [],
    };
  const service = services.get(window);
  if (!service) throw new Error("Open a project first");
  const response = await service.query({ command: "ai-context", intent });
  if (response.kind !== "ai-context")
    throw new Error("AI context is unavailable");
  return response.context;
}
const opening = new Map<string, Promise<BrowserWindow>>();
const customTitlebars = new Map<number, boolean>();
async function createWindow(root: string | null): Promise<BrowserWindow> {
  if (root === null) return createWindowOnce(root);
  const inProgress = opening.get(root);
  if (inProgress) return inProgress;
  const task = createWindowOnce(root);
  opening.set(root, task);
  try {
    return await task;
  } finally {
    opening.delete(root);
  }
}
async function createWindowOnce(root: string | null): Promise<BrowserWindow> {
  if (root) {
    await store.remember(root);
    broadcast();
    const existing = registry.find(root);
    if (existing !== undefined) {
      const window = BrowserWindow.fromId(existing);
      if (window) {
        window.restore();
        window.focus();
        return window;
      }
    }
  }
  const { theme, customTitlebar } = await store.read();
  const dark = resolveTheme(theme, nativeTheme.shouldUseDarkColors) === "dark";
  const window = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 700,
    minHeight: 550,
    show: false,
    frame: !customTitlebar,
    title: root ? `Voidra Project — ${root}` : "Voidra Project",
    backgroundColor: dark ? "#171820" : "#f7f7fb",
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      webviewTag: false,
      preload: join(app.getAppPath(), "dist/preload.cjs"),
    },
  });
  let closeAuthorized = false;
  window.on("close", (event) => {
    if (closeAuthorized || !draftReady.has(window.id)) return;
    event.preventDefault();
    void flushWindowDrafts(window)
      .then(() => {
        closeAuthorized = true;
        window.close();
      })
      .catch((error) =>
        dialog.showErrorBox("Draft could not be saved", error.message),
      );
  });
  registry.register(window.id, root);
  customTitlebars.set(window.id, customTitlebar);
  const windowChanged = (): void => notify(window.id, { type: "changed" });
  window.on("maximize", windowChanged);
  window.on("unmaximize", windowChanged);
  window.on("enter-full-screen", windowChanged);
  window.on("leave-full-screen", windowChanged);
  window.on("focus", () => updateEditMenu(window.id));
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  window.webContents.on("will-frame-navigate", (event) =>
    event.preventDefault(),
  );
  window.on("closed", () => {
    draftReady.delete(window.id);
    ai.close(window.id);
    customTitlebars.delete(window.id);
    registry.remove(window.id);
    const stopped = services.get(window.id)?.dispose();
    if (stopped) {
      closing.add(stopped);
      void stopped.finally(() => closing.delete(stopped));
    }
    services.delete(window.id);
    projects.delete(window.id);
    editing.delete(window.id);
    textEditing.delete(window.id);
  });
  window.on("ready-to-show", () => window.show());
  if (root) {
    const service = new ProjectService(
      root,
      app.getPath("userData"),
      join(app.getAppPath(), "dist/project-service.cjs"),
      (event) => notify(window.id, event),
    );
    services.set(window.id, service);
    try {
      await service.start();
      projects.set(window.id, await service.status());
    } catch {
      service.state = "failed";
    }
  }
  await window.loadURL(`${APP_ORIGIN}/`);
  broadcast();
  return window;
}
async function chooseFolder(window: BrowserWindow): Promise<string | null> {
  const result = await dialog.showOpenDialog(window, {
    title: "Open project folder",
    properties: ["openDirectory"],
  });
  return result.canceled || !result.filePaths[0]
    ? null
    : canonicalFolder(result.filePaths[0]);
}
async function start(): Promise<void> {
  await app.whenReady();
  nativeTheme.themeSource = (await store.read()).theme;
  const renderer = join(app.getAppPath(), "out");
  protocol.handle("app", async (request) => {
    try {
      const path = await resolveAsset(renderer, request.url);
      let body: Uint8Array = await readFile(path);
      const extension = extname(path);
      let policy = contentPolicy("");
      if (extension === ".html") {
        const theme = resolveTheme(
          (await store.read()).theme,
          nativeTheme.shouldUseDarkColors,
        );
        const document = rendererDocument(Buffer.from(body).toString(), theme);
        body = Buffer.from(document.html);
        policy = document.policy;
      }
      const type =
        (
          {
            ".html": "text/html",
            ".css": "text/css",
            ".js": "text/javascript",
            ".woff2": "font/woff2",
            ".json": "application/json",
            ".txt": "text/plain",
          } as Record<string, string>
        )[extension] ?? "application/octet-stream";
      return new Response(Uint8Array.from(body), {
        headers: {
          "Content-Type": type,
          "Content-Security-Policy": policy,
        },
      });
    } catch {
      return new Response("Not found", { status: 404 });
    }
  });
  session.defaultSession.setPermissionRequestHandler(
    (_contents, _permission, callback) => callback(false),
  );
  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.on("will-download", (event) => event.preventDefault());
  ipcMain.handle(
    "voidra:request",
    async (event, input: unknown): Promise<BridgeResponse> => {
      if (
        !isTrustedFrame(
          event.senderFrame?.url ?? "",
          event.senderFrame === event.sender.mainFrame,
        )
      )
        return {
          ok: false,
          error: {
            code: "untrusted-sender",
            message: "Requests must come from the app’s main window",
          },
        };
      const parsed = requestSchema.safeParse(input);
      if (!parsed.success)
        return {
          ok: false,
          error: { code: "invalid-request", message: "Invalid request" },
        };
      const window = BrowserWindow.fromWebContents(event.sender);
      if (!window)
        return {
          ok: false,
          error: { code: "not-found", message: "Window is closed" },
        };
      const request = parsed.data;
      try {
        let response: BridgeResponse;
        if (request.command === "draft-ready") {
          draftReady.add(window.id);
          response = { ok: true, data: { kind: "changed" } };
        } else if (request.command === "draft-flushed") {
          const pending = draftAcknowledgements.get(request.id);
          if (!pending || pending.window !== window.id)
            throw Error("Draft flush request expired");
          draftAcknowledgements.delete(request.id);
          if (request.error) pending.reject(Error(request.error));
          else pending.resolve();
          response = { ok: true, data: { kind: "changed" } };
        } else if (request.command === "draft-list") {
          response = {
            ok: true,
            data: {
              kind: "drafts",
              ...(await drafts.list(registry.project(window.id), request)),
            },
          };
        } else if (request.command === "draft-read") {
          response = {
            ok: true,
            data: {
              kind: "draft",
              draft: await drafts.read(registry.project(window.id), request.id),
            },
          };
        } else if (request.command === "draft-put") {
          response = {
            ok: true,
            data: {
              kind: "draft",
              draft: await drafts.put(
                registry.project(window.id),
                request.draft,
              ),
            },
          };
        } else if (request.command === "copy-draft") {
          const draft = await drafts.read(
            registry.project(window.id),
            request.id,
          );
          if (draft.revision !== request.revision)
            throw Error("This draft changed. Reopen it before copying.");
          clipboard.writeText(draftRecoveryText(draft.values));
          response = { ok: true, data: { kind: "changed" } };
        } else if (request.command === "draft-delete") {
          await drafts.delete(
            registry.project(window.id),
            request.id,
            request.revision,
          );
          notify(window.id, { type: "draft-deleted", id: request.id });
          response = { ok: true, data: { kind: "changed" } };
        } else if (request.command === "secret-draft-list") {
          response = {
            ok: true,
            data: { kind: "secret-drafts", ...(await drafts.listSecrets()) },
          };
        } else if (request.command === "secret-draft-put") {
          response = {
            ok: true,
            data: {
              kind: "secret-draft",
              draft: await drafts.putSecret(request),
            },
          };
        } else if (request.command === "secret-draft-delete") {
          await drafts.delete(null, request.id, request.revision, true);
          response = { ok: true, data: { kind: "changed" } };
        } else if (request.command === "secret-draft-apply") {
          await drafts.applySecret(request.id, request.revision, (key) =>
            ai.setKey(key),
          );
          broadcast();
          response = { ok: true, data: { kind: "changed" } };
        } else if (request.command === "text-edit-focus") {
          if (request.editing) textEditing.add(window.id);
          else textEditing.delete(window.id);
          updateEditMenu(window.id);
          response = { ok: true, data: { kind: "changed" } };
        } else if (request.command === "text-edit") {
          if (request.direction === "undo") window.webContents.undo();
          else window.webContents.redo();
          response = { ok: true, data: { kind: "changed" } };
        } else if (isTeamRequest(request)) {
          await store.changeTeam(request, registry.project(window.id));
          broadcast();
          response = { ok: true, data: { kind: "changed" } };
        } else if (request.command === "set-workspace-layout") {
          await store.setWorkspaceLayout(registry.project(window.id), {
            context: request.context,
            patch: request.patch,
          });
          notify(window.id, { type: "layout-changed" });
          response = { ok: true, data: { kind: "changed" } };
        } else if (request.command === "set-coding-client") {
          await store.setClient(request.client);
          broadcast();
          response = { ok: true, data: { kind: "changed" } };
        } else if (request.command === "snapshot") {
          const service = services.get(window.id);
          const settings = await store.read();
          if (service?.state === "ready")
            try {
              projects.set(window.id, await service.status());
            } catch {}
          response = {
            ok: true,
            data: {
              kind: "snapshot",
              appVersion: app.getVersion(),
              layout: store.layoutFrom(settings, registry.project(window.id)),
              defaultClient: settings.defaultClient,
              team: await store.team(registry.project(window.id)),
              updatesEnabled: settings.updatesEnabled,
              update: updates.notice,
              skillsOffer: !settings.skillsOfferSeen,
              setupCompleted: settings.setupCompleted,
              theme: settings.theme,
              customTitlebar: settings.customTitlebar,
              window: {
                customTitlebar: customTitlebars.get(window.id) ?? false,
                maximized: window.isMaximized() || window.isFullScreen(),
                platform: process.platform,
              },
              project: projects.get(window.id) ?? null,
              recents: await store.list(),
              serviceState: service?.state ?? null,
              ai: await aiSettings
                .configured()
                .catch(() => ({ configured: false, model: null })),
            },
          };
        } else if (request.command === "set-updates") {
          await store.setUpdates(request.enabled);
          if (app.isPackaged || updateEndpoint)
            void updates.setEnabled(request.enabled);
          broadcast();
          response = { ok: true, data: { kind: "changed" } };
        } else if (request.command === "open-update") {
          if (!updates.notice || updates.notice.version !== request.version)
            throw new Error(
              "The displayed update changed; review the current notice.",
            );
          await shell.openExternal(updates.notice.url);
          response = { ok: true, data: { kind: "changed" } };
        } else if (request.command === "skills-status") {
          const service = services.get(window.id);
          const format = service
            ? (await service.workspace({ command: "workspace" })).format
            : null;
          response = {
            ok: true,
            data: {
              kind: "skills-status",
              skills: await skills.status(format ?? undefined),
            },
          };
        } else if (request.command === "skills-dismiss-offer") {
          await store.dismissSkillsOffer();
          broadcast();
          response = { ok: true, data: { kind: "changed" } };
        } else if (request.command === "skills-bundle-preview") {
          response = {
            ok: true,
            data: {
              kind: "skills-bundle-preview",
              preview: await skills.previewBundle(request.agent),
            },
          };
        } else if (request.command === "skills-bundle-apply") {
          const result = await skills.applyBundle(
            request.agent,
            request.revision,
            request.confirmed,
          );
          broadcast();
          response = {
            ok: true,
            data: { kind: "skills-bundle-applied", result },
          };
        } else if (request.command === "ai-settings") {
          response = {
            ok: true,
            data: { kind: "ai-settings", preferences: await ai.status() },
          };
        } else if (
          request.command === "ai-set-key" ||
          request.command === "ai-remove-key" ||
          request.command === "ai-set-model"
        ) {
          if (request.command === "ai-set-key") await ai.setKey(request.key);
          else if (request.command === "ai-remove-key") await ai.removeKey();
          else {
            if (
              !(await ai.models()).some((model) => model.id === request.model)
            )
              throw new Error(
                "Choose a model from the current OpenRouter list",
              );
            await ai.setModel(request.model);
          }
          broadcast();
          response = { ok: true, data: { kind: "changed" } };
        } else if (request.command === "ai-models") {
          response = {
            ok: true,
            data: { kind: "ai-models", models: await ai.models() },
          };
        } else if (request.command === "ai-test") {
          response = {
            ok: true,
            data: { kind: "ai-connected", ...(await ai.test()) },
          };
        } else if (request.command === "ai-preview") {
          response = {
            ok: true,
            data: {
              kind: "ai-preview",
              ...(await ai.preview(await aiContext(window.id, request.intent))),
            },
          };
        } else if (request.command === "ai-generate") {
          const context = await aiContext(window.id, request.intent);
          response = {
            ok: true,
            data: {
              kind: "ai-suggestion",
              suggestion: await ai.generate(
                window.id,
                request.id,
                context,
                request.revision,
                (characters) => {
                  if (!window.isDestroyed())
                    notify(window.id, {
                      type: "ai-progress",
                      id: request.id,
                      characters,
                    });
                },
              ),
            },
          };
        } else if (request.command === "ai-cancel") {
          ai.cancel(window.id, request.id);
          response = { ok: true, data: { kind: "changed" } };
        } else if (request.command === "copy-ai-text") {
          clipboard.writeText(request.text);
          response = { ok: true, data: { kind: "changed" } };
        } else if (isKnowledgeRequest(request)) {
          const service = services.get(window.id);
          if (!service) throw new Error("Open a project first");
          response = { ok: true, data: await service.query(request) };
        } else if (request.command === "open-document-editor") {
          const service = services.get(window.id);
          if (!service) throw new Error("Open a project first");
          const path = await projectDocumentPath(service.root, request.path),
            problem = await shell.openPath(path);
          if (problem) throw new Error(problem);
          response = { ok: true, data: { kind: "changed" } };
        } else if (isWorkspaceRequest(request)) {
          const service = services.get(window.id);
          if (!service) throw new Error("Open a project first");
          const workspace = await service.workspace(request);
          editing.set(window.id, workspace.editing);
          updateEditMenu(window.id);
          response = {
            ok: true,
            data: {
              kind: "workspace",
              workspace,
            },
          };
        } else if (request.command === "open-commit") {
          const service = services.get(window.id);
          if (!service) throw new Error("Open a project first");
          const workspace = await service.workspace({ command: "workspace" });
          const commit = workspace.history.commits.find(
            (c) => c.hash === request.hash,
          );
          if (
            !commit?.url ||
            !/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/commit\/[a-f0-9]{40,64}$/.test(
              commit.url,
            )
          )
            throw new Error("No verified GitHub link for this commit");
          await shell.openExternal(commit.url);
          response = { ok: true, data: { kind: "changed" } };
        } else if (request.command === "copy-recovery-command") {
          if (request.agent !== (await store.read()).defaultClient)
            throw Error(
              "Coding client changed; refresh the command before copying.",
            );
          await clipboard.writeText(
            `${request.agent === "claude-code" ? "/voidra-go" : "$voidra-go"} recover ${request.kind} ${request.id}`,
          );
          if (request.open)
            await openCodingClient(
              request.agent,
              projects.get(window.id)?.path,
              app.getPath("userData"),
              {
                test:
                  !app.isPackaged &&
                  process.env.VOIDRA_TEST_AGENT_LAUNCH === "1",
              },
            );
          response = { ok: true, data: { kind: "changed" } };
        } else if (request.command === "copy-agent-command") {
          if (request.agent !== (await store.read()).defaultClient)
            throw Error(
              "Coding client changed; refresh the command before copying.",
            );
          await clipboard.writeText(
            `${request.agent === "claude-code" ? "/" : "$"}${request.skill ?? "voidra-go"}`,
          );
          if (request.open)
            await openCodingClient(
              request.agent,
              projects.get(window.id)?.path,
              app.getPath("userData"),
              {
                test:
                  !app.isPackaged &&
                  process.env.VOIDRA_TEST_AGENT_LAUNCH === "1",
              },
            );
          response = { ok: true, data: { kind: "changed" } };
        } else if (request.command === "complete-setup") {
          const agent = request.client === "codex" ? "codex" : "claude";
          const rows = (await skills.status()).filter(
            (row) => row.agent === agent,
          );
          if (!skillBundleInstalled(rows))
            throw Error(
              "Install the complete skills for your selected coding agent before continuing.",
            );
          await store.completeSetup(request.client, request.theme);
          broadcast();
          response = { ok: true, data: { kind: "changed" } };
        } else if (request.command === "set-theme") {
          await store.setTheme(request.theme);
          nativeTheme.themeSource = request.theme;
          broadcast();
          response = { ok: true, data: { kind: "changed" } };
        } else if (request.command === "set-custom-titlebar") {
          await store.setCustomTitlebar(request.enabled);
          broadcast();
          response = { ok: true, data: { kind: "changed" } };
        } else if (request.command === "window-control") {
          if (request.action === "close")
            setImmediate(() => {
              if (!window.isDestroyed()) window.close();
            });
          else if (request.action === "minimize") window.minimize();
          else if (window.isFullScreen()) window.setFullScreen(false);
          else if (window.isMaximized()) window.unmaximize();
          else window.maximize();
          response = { ok: true, data: { kind: "changed" } };
        } else if (
          request.command === "service-status" ||
          request.command === "service-retry"
        ) {
          const service = services.get(window.id);
          if (!service)
            return { ok: true, data: { kind: "service", project: null } };
          const project = await (request.command === "service-retry"
            ? service.retry()
            : service.status());
          projects.set(window.id, project);
          broadcast();
          response = { ok: true, data: { kind: "service", project } };
        } else if (request.command === "choose-folder") {
          const folder = await chooseFolder(window);
          if (folder) {
            const opened = await createWindow(folder);
            response = {
              ok: true,
              data: {
                kind: "project",
                project: projects.get(opened.id) ?? null,
              },
            };
          } else
            response = { ok: true, data: { kind: "project", project: null } };
        } else {
          const recent = (await store.read()).recents.find(
            (project) => project.path === request.path,
          );
          if (!recent)
            return {
              ok: false,
              error: {
                code: "not-found",
                message: "Project is not in the recent list",
              },
            };
          if (request.command === "remove-recent") {
            await store.remove(request.path);
            broadcast();
            response = { ok: true, data: { kind: "changed" } };
          } else if (request.command === "locate-recent") {
            const folder = await chooseFolder(window);
            if (folder) {
              await store.remember(folder);
              await store.remove(request.path);
              const opened = await createWindow(folder);
              response = {
                ok: true,
                data: {
                  kind: "project",
                  project: projects.get(opened.id) ?? null,
                },
              };
            } else
              response = { ok: true, data: { kind: "project", project: null } };
            broadcast();
          } else {
            const root = await canonicalFolder(request.path);
            const opened = await createWindow(root);
            response = {
              ok: true,
              data: {
                kind: "project",
                project: projects.get(opened.id) ?? null,
              },
            };
          }
        }
        return responseSchema.parse(response);
      } catch (error) {
        return {
          ok: false,
          error: {
            code: request.command.startsWith("service")
              ? "service-unavailable"
              : "io",
            message: (error as Error).message,
          },
        };
      }
    },
  );
  app.on("second-instance", (_event, _argv, _directory, data) => {
    const folder =
      data && typeof data === "object" && "folder" in data ? data.folder : null;
    if (typeof folder === "string")
      void canonicalFolder(folder)
        .then(createWindow)
        .catch(() =>
          dialog.showErrorBox(
            "Project unavailable",
            "The requested folder could not be opened.",
          ),
        );
    else BrowserWindow.getAllWindows()[0]?.focus();
  });
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: "Voidra Project",
        submenu: [
          {
            label: "Settings…",
            accelerator: "CmdOrCtrl+,",
            click: () => {
              const focused = BrowserWindow.getFocusedWindow();
              if (focused) notify(focused.id, { type: "settings" });
            },
          },
          { type: "separator" },
          { role: "quit" },
        ],
      },
      {
        label: "File",
        submenu: [
          {
            label: "Open project…",
            accelerator: "CmdOrCtrl+O",
            click: () => {
              const focused = BrowserWindow.getFocusedWindow();
              if (focused)
                void chooseFolder(focused)
                  .then((root) => (root ? createWindow(root) : null))
                  .catch((error) =>
                    dialog.showErrorBox(
                      "Couldn’t open project",
                      (error as Error).message,
                    ),
                  );
            },
          },
          { role: "close" },
        ],
      },
      {
        label: "Edit",
        submenu: [
          ...(["undo", "redo"] as const).map<MenuItemConstructorOptions>(
            (direction) => ({
              id: `project-${direction}`,
              label: direction === "undo" ? "Undo" : "Redo",
              enabled: false,
              accelerator:
                direction === "undo" ? "CmdOrCtrl+Z" : "CmdOrCtrl+Shift+Z",
              click: (_event, window) => {
                const focused = window
                  ? BrowserWindow.fromId(window.id)
                  : BrowserWindow.getFocusedWindow();
                if (focused)
                  notify(focused.id, { type: "edit-history", direction });
              },
            }),
          ),
          { type: "separator" },
          { role: "cut" },
          { role: "copy" },
          { role: "paste" },
          { role: "pasteAndMatchStyle" },
          { role: "selectAll" },
        ],
      },
      {
        label: "View",
        submenu: (
          ["navigation", "actions", "waiting"] as const
        ).map<MenuItemConstructorOptions>((panel, index) => ({
          label:
            panel === "navigation"
              ? "Toggle navigation"
              : panel === "actions"
                ? "Toggle Actions"
                : "Toggle Waiting for you",
          accelerator: `CmdOrCtrl+Alt+${index + 1}`,
          click: () => {
            const focused = BrowserWindow.getFocusedWindow();
            if (focused) notify(focused.id, { type: "workspace-panel", panel });
          },
        })),
      },
      { role: "windowMenu" },
    ]),
  );
  let quitting = false;
  app.on("before-quit", (event) => {
    if (quitting) return;
    event.preventDefault();
    void Promise.all(BrowserWindow.getAllWindows().map(flushWindowDrafts))
      .then(async () => {
        quitting = true;
        updates.close();
        await Promise.allSettled([
          ...closing,
          ...Array.from(services.values(), (service) => service.dispose()),
        ]);
        app.quit();
      })
      .catch((error) =>
        dialog.showErrorBox("Draft could not be saved", error.message),
      );
  });
  nativeTheme.on("updated", broadcast);
  app.dock?.setIcon(
    nativeImage.createFromPath(join(app.getAppPath(), "dist/icon.png")),
  );
  if (app.isPackaged || updateEndpoint)
    void updates.setEnabled((await store.read()).updatesEnabled);
  await createWindow(
    initialFolder ? await canonicalFolder(initialFolder) : null,
  );
  app.on("window-all-closed", () => app.quit());
}
if (single)
  void start().catch((error) => {
    dialog.showErrorBox("Voidra Project", (error as Error).message);
    app.quit();
  });
