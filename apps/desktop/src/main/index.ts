import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  nativeTheme,
  protocol,
  session,
} from "electron";
import {
  type BridgeEvent,
  type BridgeResponse,
  isWorkspaceRequest,
  type ProjectInfo,
  requestSchema,
  responseSchema,
} from "../shared/bridge.ts";
import {
  APP_ORIGIN,
  contentPolicy,
  isTrustedFrame,
  resolveAsset,
} from "./security.ts";
import { ProjectService } from "./service.ts";
import {
  AppStore,
  canonicalFolder,
  resolveTheme,
  WindowRegistry,
} from "./state.ts";

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
const services = new Map<number, ProjectService>();
const projects = new Map<number, ProjectInfo>();
const closing = new Set<Promise<void>>();
const notify = (id: number, event: BridgeEvent): void => {
  BrowserWindow.fromId(id)?.webContents.send("voidra:event", event);
};
const broadcast = (): void => {
  for (const id of registry.ids()) notify(id, { type: "changed" });
};
const store = new AppStore(join(app.getPath("userData"), "settings.json"));
const opening = new Map<string, Promise<BrowserWindow>>();
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
  const theme = (await store.read()).theme;
  const dark = resolveTheme(theme, nativeTheme.shouldUseDarkColors) === "dark";
  const window = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 700,
    minHeight: 550,
    show: false,
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
  registry.register(window.id, root);
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  window.webContents.on("will-frame-navigate", (event) =>
    event.preventDefault(),
  );
  window.on("closed", () => {
    registry.remove(window.id);
    const stopped = services.get(window.id)?.dispose();
    if (stopped) {
      closing.add(stopped);
      void stopped.finally(() => closing.delete(stopped));
    }
    services.delete(window.id);
    projects.delete(window.id);
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
      if (extension === ".html") {
        const theme = resolveTheme(
          (await store.read()).theme,
          nativeTheme.shouldUseDarkColors,
        );
        body = Buffer.from(
          Buffer.from(body)
            .toString()
            .replace(/<html\b/, `<html data-theme="${theme}"`),
        );
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
          "Content-Security-Policy": contentPolicy(
            extension === ".html" ? Buffer.from(body).toString() : "",
          ),
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
        if (request.command === "snapshot") {
          const service = services.get(window.id);
          if (service?.state === "ready")
            try {
              projects.set(window.id, await service.status());
            } catch {}
          response = {
            ok: true,
            data: {
              kind: "snapshot",
              theme: (await store.read()).theme,
              project: projects.get(window.id) ?? null,
              recents: await store.list(),
              serviceState: service?.state ?? null,
            },
          };
        } else if (isWorkspaceRequest(request)) {
          const service = services.get(window.id);
          if (!service) throw new Error("Open a project first");
          response = {
            ok: true,
            data: {
              kind: "workspace",
              workspace: await service.workspace(request),
            },
          };
        } else if (request.command === "copy-recovery-command") {
          await clipboard.writeText(
            `${request.agent === "claude-code" ? "/voidra-go" : "$voidra-go"} recover ${request.kind} ${request.id}`,
          );
          response = { ok: true, data: { kind: "changed" } };
        } else if (request.command === "copy-agent-command") {
          await clipboard.writeText(
            `${request.agent === "claude-code" ? "/" : "$"}${request.skill ?? "voidra-go"}`,
          );
          response = { ok: true, data: { kind: "changed" } };
        } else if (request.command === "set-theme") {
          await store.setTheme(request.theme);
          nativeTheme.themeSource = request.theme;
          broadcast();
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
      { role: "editMenu" },
      { role: "windowMenu" },
    ]),
  );
  let quitting = false;
  app.on("before-quit", (event) => {
    if (quitting) return;
    event.preventDefault();
    quitting = true;
    void Promise.allSettled([
      ...closing,
      ...Array.from(services.values(), (service) => service.dispose()),
    ]).then(() => app.quit());
  });
  nativeTheme.on("updated", broadcast);
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
