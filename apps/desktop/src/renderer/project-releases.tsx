import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  type ReleasePreparation,
  releasePreparationSchema,
} from "voidra/release-preparation";
import { request, useSnapshot } from "./app.tsx";
import {
  DraftNavigation,
  flushFormDrafts,
  useFormDraft,
} from "./form-drafts.tsx";
import { SafeMarkdown } from "./markdown.tsx";
import { MarkdownEditor } from "./markdown-editor.tsx";
import { useWorkspace } from "./project-profile.tsx";
import { ProjectReleaseSource } from "./project-release-source.tsx";
import { TaskTrackingUpgrade } from "./task-tracking-upgrade.tsx";
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
    toast = useToast(),
    snapshot = useSnapshot();
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false);
  const options = useQuery({
    queryKey: ["release-options", snapshot.data?.project?.path],
    enabled: open,
    retry: false,
    queryFn: async () => {
      const result = await request({ command: "release-options" });
      if (result.kind !== "release-options")
        throw Error("Unexpected release options");
      return result;
    },
  });
  const draft = useFormDraft<{
    selected: string[];
    revisions: Record<string, string>;
    step: number;
    bump: ReleasePreparation["bump"];
    version: string;
    notes: string;
    source: { path: string; version: string; revision: string } | null;
    tickets: { id: string; revision: string }[];
    ticketChoice: ReleasePreparation["ticketChoice"] | null;
  }>("release-prepare", "", () => ({
    selected: [],
    revisions: {},
    step: 0,
    bump: "patch",
    version: "",
    notes: "",
    source: null,
    tickets: [],
    ticketChoice: null,
  }));
  const stepHeading = useRef<HTMLParagraphElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: Move focus to the new wizard step, without reacting to typed values or source refresh.
  useEffect(() => {
    if (open) stepHeading.current?.focus();
  }, [open, draft.values.step]);
  const selected = draft.values.selected;
  const setSelected = (values: string[] | ((previous: string[]) => string[])) =>
    draft.set((previous) => {
      const selected =
        typeof values === "function" ? values(previous.selected) : values;
      return {
        ...previous,
        selected,
        revisions: Object.fromEntries(
          selected.map((id) => [
            id,
            previous.revisions[id] ??
              workspace.data?.releaseCandidates.find(
                (candidate) => candidate.id === id,
              )?.revision ??
              "",
          ]),
        ),
      };
    });
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
  const values = draft.values,
    source = options.data?.source,
    sourceReady =
      !!source?.version && !!source.revision && !!options.data?.choices.length,
    stale =
      !!values.source &&
      (values.source.path !== source?.path ||
        values.source.revision !== source?.revision),
    checked = releasePreparationSchema.safeParse({
      source: values.source,
      version: values.version,
      bump: values.bump,
      ticketChoice: values.ticketChoice ?? "keep",
      tickets: values.tickets,
    }),
    forward =
      checked.success &&
      values.source !== null &&
      (() => {
        const current = values.source.version.split(".").map(BigInt),
          next = values.version.split(".").map(BigInt);
        for (let i = 0; i < 3; i++)
          if (current[i] !== next[i])
            return (next[i] ?? 0n) > (current[i] ?? 0n);
        return false;
      })();
  const advance = () => {
    if (values.step === 0) {
      if (!sourceReady || !source?.version || !source.revision || stale) return;
      const captured = values.source ?? {
        path: source.path,
        version: source.version,
        revision: source.revision,
      };
      draft.set((previous) => ({
        ...previous,
        step: 1,
        source: captured,
        version: previous.version || options.data?.choices[0]?.version || "",
        tickets: previous.selected
          .flatMap((id) =>
            data.actions.find((action) => action.data.id === id)?.data
              .targetRelease === captured.version
              ? [{ id, revision: previous.revisions[id] ?? "" }]
              : [],
          )
          .sort((a, b) => a.id.localeCompare(b.id)),
      }));
    } else draft.set((previous) => ({ ...previous, step: 2 }));
  };
  const close = async () => {
    try {
      await draft.flush();
      setOpen(false);
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "Draft could not be saved",
      );
    }
  };
  const create = async (): Promise<void> => {
    setBusy(true);
    const existing = new Set(data.actions.map((action) => action.data.id));
    try {
      await draft.flush();
      const actions = selected.map((id) => {
        const candidate = data.releaseCandidates.find(
          (candidate) => candidate.id === id,
        );
        if (!candidate)
          throw new Error(
            "Selected action changed; refresh the release selection.",
          );
        return { id, revision: draft.values.revisions[id] ?? "" };
      });
      if (!forward || !values.ticketChoice || !checked.success || stale)
        throw Error("Review the release version and exact ticket choice first");
      const result = await request({
        command: "create-release",
        actions,
        preparation: { ...checked.data, ticketChoice: values.ticketChoice },
        notes: values.notes,
      });
      await draft.submitted();
      await query.invalidateQueries();
      if (result.kind === "workspace") {
        const created = result.workspace.actions.find(
          (action) =>
            !existing.has(action.data.id) && action.data.type === "release",
        );
        if (created) onAction(created.data.id);
      }
      setOpen(false);
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
            onClick={async () => {
              await draft.fresh();
              setOpen(true);
            }}
          >
            New release
          </Button>
        }
      />
      <details className="mb-5">
        {/* biome-ignore lint/a11y/noStaticElementInteractions: Native summary already supports pointer and keyboard activation; closing must await draft durability. */}
        <summary
          className="cursor-pointer font-medium"
          onClick={(event) => {
            const details = event.currentTarget.parentElement;
            if (!(details instanceof HTMLDetailsElement) || !details.open)
              return;
            event.preventDefault();
            void flushFormDrafts(["release-source"])
              .then(() => {
                details.open = false;
              })
              .catch((cause) =>
                toast.error(
                  cause instanceof Error
                    ? cause.message
                    : "Draft could not be saved",
                ),
              );
          }}
        >
          Release settings · {data.projectRelease.version ?? "Choose a package"}
        </summary>
        <div className="mt-3">
          <ProjectReleaseSource data={data} />
          <TaskTrackingUpgrade data={data} />
        </div>
      </details>
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
            <span className="badge">
              {release.data.supersededByVersion
                ? "Superseded"
                : release.data.status}
            </span>
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
        onClose={close}
        title={
          values.step === 0
            ? "Choose completed work"
            : values.step === 1
              ? "Choose release version"
              : "Review release choices"
        }
        description="Only done, unreleased actions are available. Work already in another release proposal stays reserved."
        footer={
          <>
            <Button
              data-dialog-close
              disabled={busy}
              onClick={() => void close()}
            >
              Cancel
            </Button>
            {values.step > 0 && (
              <Button
                disabled={busy}
                onClick={() =>
                  draft.set((previous) => ({
                    ...previous,
                    step: previous.step - 1,
                  }))
                }
              >
                Back
              </Button>
            )}
            {values.step < 2 ? (
              <Button
                variant="primary"
                disabled={
                  disabled ||
                  busy ||
                  !selected.length ||
                  !sourceReady ||
                  stale ||
                  (values.step === 1 && !forward)
                }
                type="submit"
                form="release-preparation"
              >
                Next
              </Button>
            ) : (
              <Button
                variant="primary"
                loading={busy}
                disabled={
                  disabled ||
                  !selected.length ||
                  !forward ||
                  !values.ticketChoice ||
                  stale
                }
                type="submit"
                form="release-preparation"
              >
                Create Release action
              </Button>
            )}
          </>
        }
      >
        <form
          id="release-preparation"
          onSubmit={(event) => {
            event.preventDefault();
            if (
              disabled ||
              busy ||
              stale ||
              !selected.length ||
              !sourceReady ||
              (values.step > 0 && !forward)
            )
              return;
            if (values.step < 2) advance();
            else if (values.ticketChoice) void create();
          }}
        >
          <DraftNavigation form={draft} disabled={busy} />
          <p
            ref={stepHeading}
            tabIndex={-1}
            className="text-sm text-muted"
            role="status"
          >
            Step {Math.min(3, values.step + 1)} of 3 · Xeploy version planning
          </p>
          {options.isPending ? (
            <Spinner label="Reading release versions" />
          ) : options.isError ? (
            <p role="alert" className="field-error">
              {options.error.message}
            </p>
          ) : !sourceReady ? (
            <p role="alert" className="field-error">
              {source?.message ??
                "Choose a valid package version in Release settings."}
            </p>
          ) : null}
          {stale && (
            <p role="alert" className="field-error">
              The version source changed. This draft retains its original
              values; start a new draft to use the current source.
            </p>
          )}
          <fieldset
            disabled={busy}
            className="profile-choice"
            hidden={values.step !== 0}
          >
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
          {values.step === 1 && (
            <fieldset disabled={busy || stale} className="action-detail">
              <legend>Release version and notes</legend>
              <p>
                Current release: {values.source?.version} ·{" "}
                {values.source?.path}
              </p>
              <label htmlFor="release-bump">Xeploy bump type</label>
              <select
                id="release-bump"
                className="input"
                value={values.bump}
                onChange={(event) => {
                  const bump = event.target.value as ReleasePreparation["bump"];
                  draft.set((previous) => ({
                    ...previous,
                    bump,
                    version:
                      bump === "custom"
                        ? ""
                        : (options.data?.choices.find(
                            (choice) => choice.value === bump,
                          )?.version ?? ""),
                  }));
                }}
              >
                {options.data?.choices.map((choice) => (
                  <option key={choice.value} value={choice.value}>
                    {choice.label} → {choice.version}
                  </option>
                ))}
                <option value="custom">Custom</option>
              </select>
              {values.bump === "custom" && (
                <label>
                  New release version
                  <input
                    className="input"
                    value={values.version}
                    placeholder="X.Y.Z"
                    onChange={(event) =>
                      draft.set((previous) => ({
                        ...previous,
                        version: event.target.value,
                      }))
                    }
                  />
                </label>
              )}
              <p>Proposed release: {values.version || "Choose a version"}</p>
              <label htmlFor="release-notes">Proposed release notes</label>
              <MarkdownEditor
                id="release-notes"
                aria-label="Proposed release notes"
                documentKey={`release-notes:${draft.id}`}
                value={values.notes}
                onChange={(notes) =>
                  draft.set((previous) => ({ ...previous, notes }))
                }
                disabled={busy}
              />
            </fieldset>
          )}
          {values.step === 2 && (
            <fieldset disabled={busy} className="profile-choice">
              <legend>Done-ticket release assignment</legend>
              <p>
                Package: {values.source?.path} · {values.source?.version} →{" "}
                {values.version}
              </p>
              <p>
                The choice applies only to these selected Done tickets currently
                assigned to {values.source?.version}:
              </p>
              {values.tickets.length ? (
                <ul>
                  {values.tickets.map((ticket) => (
                    <li key={ticket.id}>
                      {data.actions.find(
                        (action) => action.data.id === ticket.id,
                      )?.data.title ?? ticket.id}{" "}
                      · {ticket.id}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>
                  No selected Done tickets use the current release. Other
                  release assignments stay as recorded.
                </p>
              )}
              <div className="choice-options">
                {(["keep", "move"] as const).map((choice) => (
                  <label key={choice}>
                    <input
                      type="radio"
                      name="done-ticket-choice"
                      value={choice}
                      checked={values.ticketChoice === choice}
                      onChange={() =>
                        draft.set((previous) => ({
                          ...previous,
                          ticketChoice: choice,
                        }))
                      }
                    />
                    {choice === "keep"
                      ? `Keep Done tickets at ${values.source?.version} (current release)`
                      : `Move these Done tickets to ${values.version} (new release)`}
                  </label>
                ))}
              </div>
              <h3>Proposed notes</h3>
              <SafeMarkdown body={values.notes || "No notes supplied yet."} />
              <p>
                Your selected coding client prepares the exact proposal for
                Review. Version files, commits and tags change only after that
                acceptance.
              </p>
            </fieldset>
          )}
        </form>
      </Dialog>
    </>
  );
}
