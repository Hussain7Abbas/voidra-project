"use client";
import { useQueryClient } from "@tanstack/react-query";
import { useId, useRef, useState } from "react";
import type { AiIntent } from "../shared/ai.ts";
import {
  type ActionType,
  actionTypeSchema,
  type WorkspaceSnapshot,
} from "../shared/bridge.ts";
import { defaultAssignee } from "../shared/team.ts";
import { actionLabels } from "./action-labels.ts";
import { AiSuggestionButton } from "./ai-suggestion.tsx";
import { request, useSnapshot } from "./app.tsx";
import { DraftNavigation, useFormDraft } from "./form-drafts.tsx";
import { SafeMarkdown } from "./markdown.tsx";
import { MarkdownEditor } from "./markdown-editor.tsx";
import { AssigneeSelect } from "./team-settings.tsx";
import { Button } from "./ui/button.tsx";
import { Dialog } from "./ui/dialog.tsx";
import { Field } from "./ui/field.tsx";
import { useToast } from "./ui/toast.tsx";

type Generated = { title: string; description: string; type: ActionType };
type GeneratedModes = { normal: Generated | null; agentic: Generated | null };
type CaptureValues = {
  mode: "normal" | "agentic";
  prompt: string;
  title: string;
  description: string;
  type: ActionType;
  assignee: string;
  release: string;
  generated: Generated | GeneratedModes | null;
  normalChanged: boolean | null;
};
function generatedModes(values: CaptureValues): GeneratedModes {
  if (!values.generated) return { normal: null, agentic: null };
  if ("title" in values.generated)
    return { normal: null, agentic: null, [values.mode]: values.generated };
  return values.generated;
}
export function TaskCapture({
  kind,
  data,
  onClose,
}: {
  kind: "action" | "idea";
  data: WorkspaceSnapshot;
  onClose: () => void;
}) {
  const snapshot = useSnapshot(),
    query = useQueryClient(),
    toast = useToast(),
    formId = useId();
  const form = useFormDraft<CaptureValues>("task-create", kind, () => ({
    mode: "agentic",
    prompt: "",
    title: "",
    description: "",
    type: "feature",
    assignee: snapshot.data ? defaultAssignee(snapshot.data.team) : "",
    release: data.projectRelease.version ?? "",
    generated: null,
    normalChanged: null,
  }));
  const values = form.values,
    generated = generatedModes(values)[values.mode];
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [preview, setPreview] = useState<{
      revision: string;
      model: string;
      client: "codex" | "claude-code";
      effort: string;
      text: string;
      intent: AiIntent;
      source: string;
    } | null>(null);
  const requestId = useRef<string | null>(null),
    sequence = useRef(0);
  function change(patch: Partial<CaptureValues>) {
    sequence.current++;
    setPreview(null);
    form.set((previous) => {
      const outputs = { ...generatedModes(previous) };
      if (patch.prompt !== undefined) outputs.agentic = null;
      if (patch.title !== undefined || patch.description !== undefined)
        outputs.normal = null;
      if (patch.type !== undefined && outputs.normal)
        outputs.normal = { ...outputs.normal, type: patch.type };
      return {
        ...previous,
        ...patch,
        generated: outputs,
        normalChanged:
          patch.title !== undefined ||
          patch.description !== undefined ||
          patch.type !== undefined
            ? true
            : previous.normalChanged,
      };
    });
  }
  async function close() {
    sequence.current++;
    if (requestId.current)
      await request({ command: "ai-cancel", id: requestId.current });
    await form.flush();
    onClose();
  }
  const source = JSON.stringify(values);
  async function prepare() {
    setError("");
    setBusy(true);
    const intent: AiIntent = {
      feature: values.mode === "agentic" ? "task-capture" : "task-title",
      notes: values.mode === "agentic" ? values.prompt : values.description,
      target: kind,
    };
    try {
      await form.flush();
      if (!intent.notes.trim()) throw Error("Describe the task first.");
      const response = await request({ command: "ai-preview", intent });
      if (response.kind !== "ai-preview") throw Error("Preview unavailable");
      setPreview({ ...response, intent, source });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Preview unavailable");
    } finally {
      setBusy(false);
    }
  }
  async function generate() {
    if (!preview || preview.source !== source) {
      setError("The form changed. Review its current text before generating.");
      return;
    }
    const current = sequence.current,
      origin = form.identity(),
      id = crypto.randomUUID();
    requestId.current = id;
    setBusy(true);
    setError("");
    try {
      const response = await request({
        command: "ai-generate",
        id,
        intent: preview.intent,
        revision: preview.revision,
      });
      if (current !== sequence.current || form.identity() !== origin) return;
      if (response.kind !== "ai-suggestion")
        throw Error("Suggestion unavailable");
      const suggestion = response.suggestion;
      if (suggestion.feature === "task-title")
        form.set((previous) => ({
          ...previous,
          generated: {
            ...generatedModes(previous),
            normal: {
              title: previous.title.trim() || suggestion.title,
              description: previous.description,
              type: previous.type,
            },
          },
        }));
      else if (suggestion.feature === "task-capture")
        form.set((previous) => {
          const untouched =
            previous.normalChanged === false ||
            (previous.normalChanged === null &&
              !previous.title &&
              !previous.description &&
              previous.type === "feature" &&
              !generatedModes(previous).normal);
          return {
            ...previous,
            ...(untouched
              ? {
                  title: suggestion.title,
                  description: suggestion.description,
                  type: suggestion.type,
                  normalChanged: false,
                }
              : {}),
            generated: {
              ...generatedModes(previous),
              agentic: {
                title: suggestion.title,
                description: suggestion.description,
                type: suggestion.type,
              },
            },
          };
        });
      else throw Error("Unexpected task suggestion");
      setPreview(null);
      await form.flush();
    } catch (cause) {
      if (current === sequence.current)
        setError(cause instanceof Error ? cause.message : "Generation failed");
    } finally {
      if (requestId.current === id) {
        requestId.current = null;
        setBusy(false);
      }
    }
  }
  async function save() {
    if (busy) return;
    if ((values.mode === "agentic" || !values.title.trim()) && !generated) {
      await prepare();
      return;
    }
    setBusy(true);
    setError("");
    try {
      await form.flush();
      const task =
        values.mode === "agentic"
          ? generated
          : {
              title: values.title.trim() || generated?.title || "",
              description: values.description,
              type: values.type,
            };
      if (!task) throw Error("Generate and review the task first.");
      if (kind === "action")
        await request({
          command: "create-action",
          submission: form.id,
          title: task.title,
          description: task.description,
          type: task.type,
          doneBy: "agent",
          assignee: values.assignee || undefined,
          targetRelease: data.taskTracking ? values.release || null : undefined,
          taskColumn: data.taskTracking ? "backlog" : undefined,
          taskWorkflow: data.taskTracking ? 1 : undefined,
        });
      else
        await request({
          command: "create-idea",
          type: task.type,
          assignee: values.assignee || undefined,
          submission: form.id,
          title: task.title,
          description: task.description,
          targetRelease: data.taskTracking ? values.release || null : undefined,
        });
      await form.submitted();
      await query.invalidateQueries();
      toast.success(kind === "action" ? "Action created" : "Idea saved");
      onClose();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Task could not be saved",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onClose={close}
      closeDisabled={busy}
      title={kind === "action" ? "Create action" : "New idea"}
      description="Capture one outcome. Generated details stay here until you save."
      footer={
        <>
          <Button
            data-dialog-close
            disabled={busy}
            onClick={() =>
              void close().catch((cause) => setError(String(cause)))
            }
          >
            Cancel
          </Button>
          <Button type="submit" form={formId} variant="primary" loading={busy}>
            {(values.mode === "agentic" || !values.title.trim()) && !generated
              ? "Review AI request"
              : kind === "action"
                ? "Create action"
                : "Save idea"}
          </Button>
        </>
      }
    >
      <DraftNavigation form={form} disabled={busy} />
      <form
        id={formId}
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <fieldset disabled={busy}>
          <legend className="field-label">Input format</legend>
          <div className="segmented-switch">
            {(["agentic", "normal"] as const).map((mode) => (
              <label key={mode} className="segmented-option">
                <input
                  className="segmented-input"
                  type="radio"
                  name={`${formId}-mode`}
                  checked={values.mode === mode}
                  onChange={() => change({ mode })}
                />
                <span>{mode === "agentic" ? "Agentic" : "Normal"}</span>
              </label>
            ))}
          </div>
        </fieldset>
        {values.mode === "normal" ? (
          <>
            <AiSuggestionButton
              key={form.id}
              owner={form.id}
              label="Improve with AI"
              intent={{
                feature: "rewrite",
                notes: [values.title, values.description]
                  .filter(Boolean)
                  .join("\n"),
                target: kind,
              }}
              disabled={busy}
              onApply={(suggestion) => {
                if (suggestion.feature === "rewrite")
                  change({
                    title: suggestion.title,
                    description: suggestion.description,
                  });
              }}
            />
            <Field
              label="Title"
              hint="Optional. Leave blank to generate a title from the description."
            >
              <input
                className="input"
                maxLength={160}
                disabled={busy}
                value={values.title}
                onChange={(event) => change({ title: event.target.value })}
              />
            </Field>
            {kind === "action" && (
              <Field label="Action type">
                <select
                  className="input"
                  disabled={busy}
                  value={values.type}
                  onChange={(event) =>
                    change({ type: event.target.value as ActionType })
                  }
                >
                  {actionTypeSchema.options.map((type) => (
                    <option key={type} value={type}>
                      {actionLabels[type]}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Field label="Description">
              <MarkdownEditor
                documentKey={`${form.id}:description`}
                required
                disabled={busy}
                rows={6}
                maxLength={20000}
                value={values.description}
                onChange={(description) => change({ description })}
              />
            </Field>
          </>
        ) : (
          <Field
            label="Task"
            hint="Describe what you want. AI suggests the title, description and action type for your review."
          >
            <MarkdownEditor
              documentKey={`${form.id}:prompt`}
              required
              disabled={busy}
              rows={8}
              maxLength={20000}
              value={values.prompt}
              onChange={(prompt) => change({ prompt })}
            />
          </Field>
        )}
        <Field label="Assignee">
          <AssigneeSelect
            value={values.assignee}
            disabled={busy}
            onChange={(assignee) => change({ assignee })}
          />
        </Field>
        {data.taskTracking && (
          <Field
            label="Target release"
            hint="Backlog tasks may have no release."
          >
            <select
              className="input"
              disabled={busy}
              value={values.release}
              onChange={(event) => change({ release: event.target.value })}
            >
              <option value="">No release</option>
              {[
                ...new Set(
                  [
                    values.release,
                    data.projectRelease.version,
                    ...data.releases.map((release) => release.data.version),
                  ].filter((v): v is string => !!v),
                ),
              ].map((release) => (
                <option key={release} value={release}>
                  {release}
                  {release === data.projectRelease.version ? " (current)" : ""}
                </option>
              ))}
            </select>
          </Field>
        )}
        {preview && (
          <section
            aria-label="Review text sent to your agent"
            className="card p-4 space-y-3"
          >
            <h3>Review text sent to your agent</h3>
            <p>
              {preview.client === "codex" ? "Codex" : "Claude Code"} · Model:{" "}
              {preview.model} · Effort: {preview.effort}
            </p>
            <SafeMarkdown body={preview.text} />
            <Button disabled={busy} onClick={() => void generate()}>
              Generate suggestion
            </Button>
          </section>
        )}
        {generated && (
          <section
            aria-label="Generated task review"
            className="card p-4 space-y-3"
          >
            <h3>{generated.title}</h3>
            <span className="badge">{actionLabels[generated.type]}</span>
            <SafeMarkdown body={generated.description} />
            <p className="text-sm text-muted">
              Review these details, then save to create the task.
            </p>
          </section>
        )}
        {busy && requestId.current && (
          <Button
            onClick={async () => {
              const id = requestId.current;
              if (!id) return;
              sequence.current++;
              await request({ command: "ai-cancel", id });
              requestId.current = null;
              setBusy(false);
              setError("Generation cancelled. Your draft is saved.");
            }}
          >
            Cancel generation
          </Button>
        )}
        {error && (
          <p role="alert" className="text-danger">
            {error}
          </p>
        )}
      </form>
    </Dialog>
  );
}
