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
import { useCallback, useEffect, useState } from "react";
import type {
  BridgeRequest,
  BridgeResponse,
  Snapshot,
  ThemePreference,
} from "../shared/bridge.ts";
import { ActionsSidebar } from "./actions-sidebar.tsx";
import { AiSettingsPanel } from "./ai-settings.tsx";
import { CodingClientSetting } from "./coding-client.tsx";
import { DocumentViewerProvider } from "./document-viewer.tsx";
import { DraftRecovery } from "./draft-recovery.tsx";
import { EditHistory } from "./edit-history.tsx";
import { flushFormDrafts } from "./form-drafts.tsx";
import { inboxItems } from "./inbox.ts";
import { ProjectActions } from "./project-actions.tsx";
import { ProjectDecisions, ProjectGlossary } from "./project-knowledge.tsx";
import {
  ProjectOnboarding,
  ProjectProfile,
  useWorkspace,
} from "./project-profile.tsx";
import { ProjectReleases } from "./project-releases.tsx";
import { ProjectTasks } from "./project-tasks.tsx";
import { SettingsTabs } from "./settings-tabs.tsx";
import { SkillSettingsPanel } from "./skill-settings.tsx";
import { SyncSuggestion } from "./sync-suggestion.tsx";
import { TeamSettings } from "./team-settings.tsx";
import { TitlebarSetting } from "./titlebar-setting.tsx";
import { Button } from "./ui/button.tsx";
import { ConfirmDialog } from "./ui/confirm-dialog.tsx";
import { Dialog } from "./ui/dialog.tsx";
import { Field } from "./ui/field.tsx";
import { ErrorState, PageHeader } from "./ui/page.tsx";
import { Spinner } from "./ui/spinner.tsx";
import { ToastProvider, useToast } from "./ui/toast.tsx";
import { UpdateNotice } from "./update-notice.tsx";
import { UpdateSettings } from "./update-settings.tsx";
import { WindowTitlebar } from "./window-titlebar.tsx";
export async function request(
  input: BridgeRequest,
): Promise<Extract<BridgeResponse, { ok: true }>["data"]> {
  const response = await window.voidra.invoke(input);
  if (!response.ok) throw new Error(response.error.message);
  return response.data;
}
export function useSnapshot() {
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
  const root = document.documentElement;
  const theme =
    preference === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : preference;
  if (root.dataset.theme === theme) return;
  root.dataset.theme = theme;
}
function Shell() {
  const snapshot = useSnapshot();
  useEffect(() => {
    const unsubscribe = window.voidra.subscribe((event) => {
      if (event.type !== "draft-flush") return;
      document.body.inert = true;
      void flushFormDrafts()
        .then(
          () =>
            request({ command: "draft-flushed", id: event.id, error: null }),
          (cause) =>
            request({
              command: "draft-flushed",
              id: event.id,
              error:
                cause instanceof Error
                  ? cause.message
                  : "Draft could not be saved",
            }),
        )
        .finally(() => {
          document.body.inert = false;
        });
    });
    void request({ command: "draft-ready" });
    return unsubscribe;
  }, []);
  const query = useQueryClient();
  const toast = useToast();
  const [settings, setSettings] = useState(false);
  const [teamSettings, setTeamSettings] = useState(false);
  useEffect(() => {
    const openTeam = () => {
      setTeamSettings(true);
      setSettings(true);
    };
    window.addEventListener("voidra-open-team", openTeam);
    return () => window.removeEventListener("voidra-open-team", openTeam);
  }, []);
  const [switcher, setSwitcher] = useState(false);
  const [remove, setRemove] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState(false);
  const [navigationEpoch, setNavigationEpoch] = useState(0);
  const [navigationTarget, setNavigationTarget] = useState<
    | "tasks"
    | "actions"
    | "run"
    | "profile"
    | "backlog"
    | "inbox"
    | "decisions"
    | "glossary"
    | "releases"
  >("tasks");
  const [selectedAction, setSelectedAction] = useState<string | null>(null);
  const [selectedIdea, setSelectedIdea] = useState<string | null>(null);
  const showAction = useCallback(
    (id: string): void => {
      void flushFormDrafts()
        .then(() => {
          setSelectedAction(id);
          setSelectedIdea(null);
          setNavigationTarget("actions");
          setNavigationEpoch((value) => value + 1);
        })
        .catch((cause) =>
          toast.error(
            cause instanceof Error ? cause.message : "Draft could not be saved",
          ),
        );
    },
    [toast],
  );
  const showIdea = useCallback(
    (id: string | null): void => {
      void flushFormDrafts()
        .then(() => {
          setSelectedIdea(id);
          setSelectedAction(null);
          setNavigationTarget("tasks");
        })
        .catch((cause) =>
          toast.error(
            cause instanceof Error ? cause.message : "Draft could not be saved",
          ),
        );
    },
    [toast],
  );
  const showProfile = useCallback((): void => {
    void flushFormDrafts()
      .then(() => {
        setSelectedAction(null);
        setNavigationTarget("profile");
        setNavigationEpoch((value) => value + 1);
      })
      .catch((cause) =>
        toast.error(
          cause instanceof Error ? cause.message : "Draft could not be saved",
        ),
      );
  }, [toast]);
  const data = snapshot.data;
  const workspace = useWorkspace(!!data?.project);
  const hasPlanning = workspace.data
    ? workspace.data.hasVoidra || workspace.data.recoveries.length > 0
    : !!data?.project?.hasVoidra;
  const waitingCount = workspace.data ? inboxItems(workspace.data).length : 0;
  const themePreference = data?.theme;
  useEffect(
    () =>
      window.voidra.subscribe((event) => {
        if (event.type === "settings") setSettings(true);
        else if (
          event.type !== "edit-history" &&
          event.type !== "ai-progress" &&
          event.type !== "draft-deleted"
        )
          void query.invalidateQueries();
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
      if (
        [
          "choose-folder",
          "open-recent",
          "locate-recent",
          "window-control",
        ].includes(input.command)
      )
        await flushFormDrafts();
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
    { label: "Tasks", icon: ListChecks },
    { label: "Profile", icon: BookOpen },
    { label: "Decisions", icon: BookOpen },
    { label: "Glossary", icon: BookOpen },
    { label: "Waiting for you", icon: Inbox },
    { label: "Run", icon: Activity },
    { label: "Releases", icon: Package },
  ];
  return (
    <div
      className={`desktop-app ${data?.window?.customTitlebar ? "has-custom-titlebar" : ""}`}
    >
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      {data?.window?.customTitlebar && (
        <WindowTitlebar
          state={data.window}
          title={data.project?.name ?? "Voidra Project"}
          onSettings={() => setSettings(true)}
          onControl={(action) => {
            void act({ command: "window-control", action });
          }}
        />
      )}
      <div className="desktop-shell">
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
                          void act({
                            command: "open-recent",
                            path: recent.path,
                          });
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
                    aria-label={item.label}
                    className={`nav-item ${(hasPlanning ? item.label === (["tasks", "actions", "backlog"].includes(navigationTarget) ? "Tasks" : navigationTarget === "inbox" ? "Waiting for you" : navigationTarget === "run" ? "Run" : navigationTarget === "decisions" ? "Decisions" : navigationTarget === "releases" ? "Releases" : navigationTarget === "glossary" ? "Glossary" : navigationTarget === "profile" ? "Profile" : navigationTarget === "backlog" ? "Backlog" : "Actions") : index === 0) ? "active" : ""}`}
                    disabled={
                      hasPlanning
                        ? ![
                            "Tasks",
                            "Actions",
                            "Run",
                            "Profile",
                            "Backlog",
                            "Waiting for you",
                            "Decisions",
                            "Glossary",
                            "Releases",
                          ].includes(item.label)
                        : index !== 0
                    }
                    onClick={async () => {
                      try {
                        await flushFormDrafts();
                      } catch (cause) {
                        toast.error(
                          cause instanceof Error
                            ? cause.message
                            : "Draft could not be saved",
                        );
                        return;
                      }
                      setSelectedAction(null);
                      setSelectedIdea(null);
                      setNavigationEpoch((value) => value + 1);
                      setNavigationTarget(
                        item.label === "Tasks"
                          ? "tasks"
                          : item.label === "Releases"
                            ? "releases"
                            : item.label === "Decisions"
                              ? "decisions"
                              : item.label === "Glossary"
                                ? "glossary"
                                : item.label === "Waiting for you"
                                  ? "inbox"
                                  : item.label === "Run"
                                    ? "run"
                                    : item.label === "Backlog"
                                      ? "backlog"
                                      : item.label === "Profile"
                                        ? "profile"
                                        : "actions",
                      );
                      setMenu(false);
                    }}
                    aria-current={
                      (
                        hasPlanning
                          ? item.label ===
                            (["tasks", "actions", "backlog"].includes(
                              navigationTarget,
                            )
                              ? "Tasks"
                              : navigationTarget === "inbox"
                                ? "Waiting for you"
                                : navigationTarget === "run"
                                  ? "Run"
                                  : navigationTarget === "decisions"
                                    ? "Decisions"
                                    : navigationTarget === "releases"
                                      ? "Releases"
                                      : navigationTarget === "glossary"
                                        ? "Glossary"
                                        : navigationTarget === "profile"
                                          ? "Profile"
                                          : navigationTarget === "backlog"
                                            ? "Backlog"
                                            : "Actions")
                          : index === 0
                      )
                        ? "page"
                        : undefined
                    }
                  >
                    <item.icon size={18} strokeWidth={1.75} aria-hidden />
                    {item.label}
                    {item.label === "Waiting for you" && (
                      <span
                        className="badge"
                        role="status"
                        aria-label={`${waitingCount} waiting items`}
                      >
                        {waitingCount}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
          <div className="sidebar-footer">
            {!data?.window?.customTitlebar && (
              <Button
                variant="ghost"
                className="w-full justify-start"
                icon={<Settings size={18} aria-hidden />}
                onClick={() => setSettings(true)}
              >
                Settings
              </Button>
            )}
            <span className="version">
              Voidra Project{data?.appVersion && ` · ${data.appVersion}`}
            </span>
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
            <EditHistory
              editing={workspace.data?.editing}
              onChange={() => query.invalidateQueries()}
            />
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
            <UpdateNotice />
            {data?.skillsOffer && (
              <section
                aria-label="Coding agent setup"
                className="service-notice mb-5"
              >
                <p>
                  Install Voidra’s bundled skills for Claude Code and Codex when
                  you are ready.
                </p>
                <div className="flex gap-2 mt-3">
                  <Button
                    onClick={() => {
                      setSettings(true);
                      void act({ command: "skills-dismiss-offer" });
                    }}
                  >
                    Review skill installation
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() =>
                      void act({ command: "skills-dismiss-offer" })
                    }
                  >
                    Dismiss skill setup
                  </Button>
                </div>
              </section>
            )}
            {data?.serviceState && data?.serviceState !== "ready" && (
              <div
                className="service-notice"
                role="alert"
                aria-label="Project connection"
              >
                <p>
                  {data?.serviceState === "failed"
                    ? "The project connection stopped."
                    : "The project connection stopped. Reconnecting…"}
                </p>
                <Button onClick={() => void act({ command: "service-retry" })}>
                  Reconnect
                </Button>
              </div>
            )}

            <SyncSuggestion data={workspace.data} />
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
                hasPlanning={hasPlanning}
                open={open}
                busy={busy}
                navigationEpoch={navigationEpoch}
                navigationTarget={navigationTarget}
                selectedAction={selectedAction}
                selectedIdea={selectedIdea}
                onIdea={showIdea}
                onAction={showAction}
                onTasks={() => {
                  setSelectedAction(null);
                  setSelectedIdea(null);
                  setNavigationTarget("tasks");
                  setNavigationEpoch((value) => value + 1);
                }}
                onProfile={showProfile}
              />
            )}
          </main>
        </div>
        {workspace.data?.hasVoidra && (
          <ActionsSidebar
            key={data?.project?.path}
            data={workspace.data}
            onAction={showAction}
          />
        )}
      </div>
      <Dialog
        open={settings}
        onClose={async () => {
          await flushFormDrafts(["team-member", "credential"]);
          setSettings(false);
          setTeamSettings(false);
        }}
        title="Settings"
        description="Make this workspace feel like yours."
        footer={
          <Button
            data-dialog-close
            onClick={async () => {
              try {
                await flushFormDrafts(["team-member", "credential"]);
              } catch (cause) {
                toast.error(String(cause));
                return;
              }
              setSettings(false);
              setTeamSettings(false);
            }}
          >
            Done
          </Button>
        }
      >
        <SettingsTabs
          key={teamSettings ? "team" : "general"}
          initialTab={teamSettings ? 2 : 0}
          team={<TeamSettings />}
          general={
            <>
              <CodingClientSetting />
              <AiSettingsPanel />
              <DraftRecovery />
              <SkillSettingsPanel />
              <UpdateSettings />
            </>
          }
          appearance={
            <div className="space-y-6">
              <Field label="Theme" hint="System follows your Mac’s appearance.">
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
              <TitlebarSetting
                enabled={data?.customTitlebar ?? true}
                disabled={busy || !data}
                onChange={(enabled) =>
                  act(
                    { command: "set-custom-titlebar", enabled },
                    "Titlebar preference saved",
                  )
                }
              />
              {data && data.customTitlebar !== data.window?.customTitlebar && (
                <p role="status" className="text-sm text-muted">
                  Reopen this window to apply your titlebar preference.
                </p>
              )}
            </div>
          }
        />
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
  hasPlanning,
  open,
  busy,
  navigationEpoch,
  navigationTarget,
  selectedAction,
  selectedIdea,
  onIdea,
  onAction,
  onTasks,
  onProfile,
}: {
  selectedAction: string | null;
  selectedIdea: string | null;
  onIdea: (id: string | null) => void;
  onAction: (id: string) => void;
  onTasks: () => void;
  onProfile: () => void;
  data: Snapshot;
  hasPlanning: boolean;
  open: () => void;
  busy: boolean;
  navigationEpoch: number;
  navigationTarget:
    | "tasks"
    | "actions"
    | "run"
    | "profile"
    | "backlog"
    | "inbox"
    | "decisions"
    | "glossary"
    | "releases";
}) {
  const project = data.project;
  if (project && hasPlanning)
    return ["tasks", "actions", "backlog"].includes(navigationTarget) ? (
      <ProjectTasks
        key={project.path}
        onAction={onAction}
        onIdea={onIdea}
        selectedIdea={selectedIdea}
        selectedAction={navigationTarget === "actions" ? selectedAction : null}
        onTasks={onTasks}
        navigationEpoch={navigationEpoch}
      />
    ) : navigationTarget === "releases" ? (
      <ProjectReleases key={navigationEpoch} onAction={onAction} />
    ) : navigationTarget === "decisions" ? (
      <ProjectDecisions
        key={navigationEpoch}
        onAction={onAction}
        onProfile={onProfile}
      />
    ) : navigationTarget === "glossary" ? (
      <ProjectGlossary key={navigationEpoch} />
    ) : navigationTarget === "profile" ? (
      <ProjectProfile key={navigationEpoch} />
    ) : (
      <ProjectActions
        key={navigationEpoch}
        view={navigationTarget === "inbox" ? "inbox" : "run"}
        initialAction={selectedAction}
        {...(navigationTarget === "actions" ? { onBack: onTasks } : {})}
      />
    );
  if (project) return <ProjectOnboarding name={project.name} />;
  return (
    <>
      <PageHeader
        title="Your next project starts here"
        description="Bring your project’s plans and progress together, with clear checkpoints for you and your coding agent."
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
      <section className="welcome-card card" aria-labelledby="welcome-title">
        <div className="welcome-symbol">
          <Layers size={34} strokeWidth={1.5} aria-hidden />
        </div>
        <div>
          <p className="eyebrow">A place for the whole project</p>
          <h2 id="welcome-title">Keep the plan close to the work</h2>
          <p>
            Open an existing project or choose an empty folder. Voidra keeps
            planning records alongside your code.
          </p>
          <Button
            className="mt-6"
            onClick={open}
            icon={<ArrowRight size={16} aria-hidden />}
          >
            Choose a folder
          </Button>
        </div>
      </section>
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
    </>
  );
}

export function DesktopApp() {
  const [client] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={client}>
      <ToastProvider>
        <DocumentViewerProvider>
          <Shell />
        </DocumentViewerProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}
