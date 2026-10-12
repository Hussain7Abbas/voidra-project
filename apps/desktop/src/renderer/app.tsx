"use client";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  Activity,
  ArrowRight,
  BookOpen,
  ChevronDown,
  FolderOpen,
  Inbox,
  Layers,
  ListChecks,
  Package,
  PanelLeft,
  Settings,
} from "lucide-react";
import { useEffect, useState } from "react";
import type {
  BridgeRequest,
  BridgeResponse,
  Snapshot,
  ThemePreference,
} from "../shared/bridge.ts";
import { Button } from "./ui/button.tsx";
import { ConfirmDialog } from "./ui/confirm-dialog.tsx";
import { Dialog } from "./ui/dialog.tsx";
import { Field } from "./ui/field.tsx";
import { ErrorState, PageHeader } from "./ui/page.tsx";
import { Spinner } from "./ui/spinner.tsx";
import { ToastProvider, useToast } from "./ui/toast.tsx";
export async function request(
  input: BridgeRequest,
): Promise<Extract<BridgeResponse, { ok: true }>["data"]> {
  const response = await window.voidra.invoke(input);
  if (!response.ok) throw new Error(response.error.message);
  return response.data;
}
function useSnapshot() {
  return useQuery({
    queryKey: ["snapshot"],
    queryFn: async () => {
      const response = await request({ command: "snapshot" });
      if (response.kind !== "snapshot")
        throw new Error("Unexpected app response");
      return response;
    },
    staleTime: 1000,
    retry: 1,
  });
}
function applyTheme(preference: ThemePreference): void {
  document.documentElement.dataset.theme =
    preference === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : preference;
}
function Shell() {
  const snapshot = useSnapshot();
  const query = useQueryClient();
  const toast = useToast();
  const [settings, setSettings] = useState(false);
  const [switcher, setSwitcher] = useState(false);
  const [remove, setRemove] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState(false);
  const data = snapshot.data;
  const themePreference = data?.theme;
  useEffect(
    () =>
      window.voidra.subscribe((event) => {
        if (event.type === "settings") setSettings(true);
        else void query.invalidateQueries({ queryKey: ["snapshot"] });
      }),
    [query],
  );
  useEffect(() => {
    if (!themePreference) return;
    const preference = themePreference;
    applyTheme(preference);
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = (): void => applyTheme(preference);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [themePreference]);
  const act = async (input: BridgeRequest, success?: string): Promise<void> => {
    setBusy(true);
    try {
      await request(input);
      await query.invalidateQueries({ queryKey: ["snapshot"] });
      if (success) toast.success(success);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  };
  const open = (): void => {
    void act({ command: "choose-folder" });
    setSwitcher(false);
  };
  const navigation = [
    { label: "Overview", icon: Layers },
    { label: "Profile", icon: BookOpen },
    { label: "Backlog", icon: Inbox },
    { label: "Actions", icon: ListChecks },
    { label: "Waiting for you", icon: Inbox },
    { label: "Run", icon: Activity },
    { label: "Releases", icon: Package },
  ];
  return (
    <div className="desktop-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside
        className={`sidebar ${menu ? "sidebar-open" : ""}`}
        aria-label="Project navigation"
      >
        <div className="brand">
          <span className="brand-mark">
            <Layers size={22} strokeWidth={1.75} aria-hidden />
          </span>
          <div>
            <strong>Voidra</strong>
            <span className="brand-subtitle">PROJECT</span>
          </div>
        </div>
        <div className="project-switcher">
          <Button
            className="switcher-trigger"
            aria-expanded={switcher}
            aria-controls="project-list"
            onClick={() => {
              setSwitcher(!switcher);
              void snapshot.refetch();
            }}
            icon={<FolderOpen size={18} aria-hidden />}
          >
            {data?.project?.name ?? "Choose a project"}
            <ChevronDown size={16} aria-hidden />
          </Button>
          {switcher && (
            <section
              id="project-list"
              className="switcher-list"
              aria-label="Recent projects"
            >
              <p className="eyebrow">Recent projects</p>
              {data?.recents.length ? (
                data.recents.map((recent) => (
                  <div key={recent.path} className="recent-row">
                    <Button
                      variant="ghost"
                      disabled={recent.missing || busy}
                      onClick={() => {
                        void act({ command: "open-recent", path: recent.path });
                        setSwitcher(false);
                      }}
                    >
                      {recent.name}
                    </Button>
                    {recent.missing && (
                      <>
                        <span className="text-warning text-xs">Missing</span>
                        <Button
                          variant="ghost"
                          onClick={() =>
                            void act({
                              command: "locate-recent",
                              path: recent.path,
                            })
                          }
                        >
                          Locate
                        </Button>
                      </>
                    )}
                    <Button
                      variant="ghost"
                      aria-label={`Remove ${recent.name} from recents`}
                      onClick={() => setRemove(recent.path)}
                    >
                      Remove
                    </Button>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted">
                  Your opened folders will appear here.
                </p>
              )}
              <Button
                className="mt-3 w-full"
                onClick={open}
                icon={<FolderOpen size={16} aria-hidden />}
              >
                Open another folder
              </Button>
            </section>
          )}
        </div>
        <nav aria-label="Project pages">
          <ul className="navigation">
            {navigation.map((item, index) => (
              <li key={item.label}>
                <button
                  type="button"
                  className={`nav-item ${index === 0 ? "active" : ""}`}
                  disabled={index !== 0}
                  aria-current={index === 0 ? "page" : undefined}
                >
                  <item.icon size={18} strokeWidth={1.75} aria-hidden />
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <div className="sidebar-footer">
          <Button
            variant="ghost"
            className="w-full justify-start"
            icon={<Settings size={18} aria-hidden />}
            onClick={() => setSettings(true)}
          >
            Settings
          </Button>
          <span className="version">Voidra Project · 0.1.0</span>
        </div>
      </aside>
      <div className="workspace">
        <header className="workspace-topbar">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              iconOnly
              aria-label="Toggle sidebar"
              className="sidebar-toggle"
              onClick={() => setMenu(!menu)}
              icon={<PanelLeft size={18} aria-hidden />}
            />
            <span className="text-muted text-sm">
              {data?.project?.name ?? "Your workspace"}
            </span>
          </div>
          <span className="workspace-status">
            <span className="status-dot" />
            {data?.serviceState === "ready"
              ? "Local project"
              : "Local workspace"}
          </span>
        </header>
        <main
          id="main"
          tabIndex={-1}
          className="main-content"
          data-app-ready={Boolean(data)}
        >
          {snapshot.isPending ? (
            <div className="loading-state">
              <Spinner label="Loading workspace" />
              <p>Opening your workspace…</p>
            </div>
          ) : snapshot.isError ? (
            <ErrorState
              error={snapshot.error}
              onRetry={() => void snapshot.refetch()}
            />
          ) : (
            <Content
              data={data as Snapshot}
              open={open}
              busy={busy}
              retry={() => void act({ command: "service-retry" })}
            />
          )}
        </main>
      </div>
      <Dialog
        open={settings}
        onClose={() => setSettings(false)}
        title="Settings"
        description="Make this workspace feel like yours."
        footer={<Button onClick={() => setSettings(false)}>Done</Button>}
      >
        <Field label="Appearance" hint="System follows your Mac’s appearance.">
          <select
            className="input"
            value={data?.theme ?? "system"}
            onChange={(event) =>
              void act(
                {
                  command: "set-theme",
                  theme: event.target.value as ThemePreference,
                },
                "Appearance saved",
              )
            }
          >
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </Field>
      </Dialog>
      <ConfirmDialog
        open={remove !== null}
        title="Remove recent project?"
        confirmLabel="Remove from recents"
        busy={busy}
        onClose={() => setRemove(null)}
        onConfirm={() => {
          if (remove)
            void act(
              { command: "remove-recent", path: remove },
              "Removed from recents",
            ).then(() => setRemove(null));
        }}
      >
        This removes the shortcut from the recent list. Your project files stay
        in their folder.
      </ConfirmDialog>
    </div>
  );
}
function Content({
  data,
  open,
  busy,
  retry,
}: {
  data: Snapshot;
  open: () => void;
  busy: boolean;
  retry: () => void;
}) {
  const project = data.project;
  return (
    <>
      <PageHeader
        title={project ? project.name : "Your next project starts here"}
        description={
          project
            ? "A workspace for your plans, decisions and progress."
            : "Bring your project’s plans and progress together, with clear checkpoints for you and your coding agent."
        }
        actions={
          <Button
            variant="primary"
            loading={busy}
            onClick={open}
            icon={<FolderOpen size={17} aria-hidden />}
          >
            Open project folder
          </Button>
        }
      />
      {data.serviceState && data.serviceState !== "ready" && (
        <div
          className="service-notice"
          role="alert"
          aria-label="Project connection"
        >
          <p>
            {data.serviceState === "failed"
              ? "The project connection stopped."
              : "The project connection stopped. Reconnecting…"}
          </p>
          <Button onClick={retry}>Reconnect</Button>
        </div>
      )}
      <section className="welcome-card card" aria-labelledby="welcome-title">
        <div className="welcome-symbol">
          <Layers size={34} strokeWidth={1.5} aria-hidden />
        </div>
        <div>
          <p className="eyebrow">
            {project
              ? "Project folder opened"
              : "A place for the whole project"}
          </p>
          <h2 id="welcome-title">
            {project
              ? project.hasVoidra
                ? "Planning folder found"
                : "Set up a home for your project’s plans"
              : "Keep the plan close to the work"}
          </h2>
          <p>
            {project
              ? project.hasVoidra
                ? "Your planning records are kept with this project. You can open another folder or adjust this workspace’s appearance."
                : "Voidra planning hasn’t been set up in this folder yet. Your existing project files stay where they are."
              : "Open an existing project or choose an empty folder. Voidra keeps planning records alongside your code."}
          </p>
          {!project && (
            <Button
              className="mt-6"
              onClick={open}
              icon={<ArrowRight size={16} aria-hidden />}
            >
              Choose a folder
            </Button>
          )}
          {project && <code className="project-path">{project.path}</code>}
        </div>
      </section>
      {!project && (
        <section className="workflow-grid" aria-label="How Voidra works">
          <article className="card workflow-card">
            <span className="step-number">01</span>
            <h2>Shape the plan</h2>
            <p>Collect ideas and define what a useful change should do.</p>
          </article>
          <article className="card workflow-card">
            <span className="step-number">02</span>
            <h2>Work with your agent</h2>
            <p>Give your coding agent a clear plan and checkpoints.</p>
          </article>
          <article className="card workflow-card">
            <span className="step-number">03</span>
            <h2>Review and ship</h2>
            <p>Accept completed work and keep track of what ships.</p>
          </article>
        </section>
      )}
    </>
  );
}
export function DesktopApp() {
  const [client] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={client}>
      <ToastProvider>
        <Shell />
      </ToastProvider>
    </QueryClientProvider>
  );
}
