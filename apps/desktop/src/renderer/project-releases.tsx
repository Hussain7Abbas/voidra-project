import { useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useState } from "react";
import { request } from "./app.tsx";
import { SafeMarkdown } from "./markdown.tsx";
import { useWorkspace } from "./project-profile.tsx";
import { Button } from "./ui/button.tsx";
import { Dialog } from "./ui/dialog.tsx";
import { ErrorState, PageHeader } from "./ui/page.tsx";
import { Spinner } from "./ui/spinner.tsx";
import { useToast } from "./ui/toast.tsx";

export function ProjectReleases({
  onAction,
}: {
  onAction: (id: string) => void;
}) {
  const workspace = useWorkspace(),
    query = useQueryClient(),
    toast = useToast();
  const [open, setOpen] = useState(false),
    [selected, setSelected] = useState<string[]>([]),
    [busy, setBusy] = useState(false);
  if (workspace.isPending) return <Spinner label="Reading releases" />;
  if (workspace.isError)
    return (
      <ErrorState
        error={workspace.error}
        onRetry={() => void workspace.refetch()}
      />
    );
  const data = workspace.data,
    disabled =
      data.readOnly ||
      data.lock.state !== "none" ||
      !!data.recoveries.length ||
      !!data.planning.pending.length;
  const create = async (): Promise<void> => {
    setBusy(true);
    const existing = new Set(data.actions.map((action) => action.data.id));
    try {
      const actions = selected.map((id) => {
        const candidate = data.releaseCandidates.find(
          (candidate) => candidate.id === id,
        );
        if (!candidate)
          throw new Error(
            "Selected action changed; refresh the release selection.",
          );
        return { id, revision: candidate.revision };
      });
      const result = await request({ command: "create-release", actions });
      await query.invalidateQueries();
      if (result.kind === "workspace") {
        const created = result.workspace.actions.find(
          (action) =>
            !existing.has(action.data.id) && action.data.type === "release",
        );
        if (created) onAction(created.data.id);
      }
      setOpen(false);
      setSelected([]);
      toast.success("Release action created");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Please try again.");
      await query.invalidateQueries();
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <PageHeader
        title="Releases"
        description="Plan a release from completed work. Your agent commits and tags it after you accept the proposal."
        actions={
          <Button
            variant="primary"
            icon={<Plus size={16} aria-hidden />}
            disabled={disabled || !data.releaseCandidates.length}
            onClick={() => {
              setSelected([]);
              setOpen(true);
            }}
          >
            New release
          </Button>
        }
      />
      {!data.releases.length && (
        <section className="card action-detail">
          <h2>No releases yet</h2>
          <p>
            Complete an action, then choose New release to plan its version and
            notes.
          </p>
        </section>
      )}
      {data.actions
        .filter(
          (action) =>
            action.data.type === "release" &&
            !["released", "cancelled"].includes(action.data.stage ?? ""),
        )
        .map((action) => (
          <section className="card action-detail" key={action.data.id}>
            <h2>{action.data.title}</h2>
            <p>In progress · {action.data.stage}</p>
            <Button onClick={() => onAction(action.data.id)}>
              Open Release action
            </Button>
          </section>
        ))}
      {data.releases.map((release) => (
        <article className="card action-detail" key={release.path}>
          <div className="flex items-center gap-2">
            <h2>{release.data.version}</h2>
            <span className="badge">{release.data.status}</span>
          </div>
          {release.data.date && (
            <p className="text-sm text-muted">
              {new Date(release.data.date).toLocaleDateString()}
            </p>
          )}
          {release.data.tag && (
            <p>
              Tag: <code>{release.data.tag}</code>
            </p>
          )}
          <SafeMarkdown body={release.body} source={release.path} />
          <h3>Included work</h3>
          <ul>
            {release.data.actions.map((id) => (
              <li key={id}>
                <Button variant="ghost" onClick={() => onAction(id)}>
                  {data.actions.find((action) => action.data.id === id)?.data
                    .title ?? id}
                </Button>
              </li>
            ))}
          </ul>
        </article>
      ))}
      <Dialog
        open={open}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
        title="Choose completed work"
        description="Only done, unreleased actions are available. Work already in another release proposal stays reserved."
        footer={
          <>
            <Button disabled={busy} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={busy}
              disabled={disabled || !selected.length}
              onClick={() => void create()}
            >
              Create Release action
            </Button>
          </>
        }
      >
        <fieldset className="profile-choice">
          <legend>Actions to include</legend>
          <div className="choice-options">
            {data.releaseCandidates.map((candidate) => (
              <label key={candidate.id}>
                <input
                  type="checkbox"
                  checked={selected.includes(candidate.id)}
                  onChange={(event) =>
                    setSelected((current) =>
                      event.target.checked
                        ? [...current, candidate.id]
                        : current.filter((id) => id !== candidate.id),
                    )
                  }
                />
                {candidate.title}
              </label>
            ))}
          </div>
        </fieldset>
      </Dialog>
    </>
  );
}
