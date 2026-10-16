"use client";
import { Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  type AiIntent,
  type AiSuggestion,
  aiIntentSchema,
  aiSuggestionSchema,
} from "../shared/ai.ts";
import { request, useSnapshot } from "./app.tsx";
import { DraftNavigation, draftField, useFormDraft } from "./form-drafts.tsx";
import { MarkdownEditor } from "./markdown-editor.tsx";
import { Button } from "./ui/button.tsx";
import { Dialog } from "./ui/dialog.tsx";
import { Field } from "./ui/field.tsx";

export function AiSuggestionButton({
  label,
  intent,
  onApply,
  disabled = false,
  owner = "shared",
  showUnavailable = false,
}: {
  showUnavailable?: boolean;
  owner?: string;
  label: string;
  intent: AiIntent;
  onApply: (suggestion: AiSuggestion) => void;
  disabled?: boolean;
}) {
  const target =
    intent.feature === "profile" || intent.feature === "followup"
      ? `${intent.feature}:${intent.template}:${intent.templateVersion}:${intent.block}:${intent.answer}`
      : intent.feature === "rewrite"
        ? `rewrite:${intent.target}:${owner}`
        : "action" in intent
          ? `${intent.feature}:${intent.action}:${intent.feature === "summary" ? (intent.run ?? "latest") : ""}`
          : `${intent.feature}:${intent.target}:${owner}`;
  const draft = useFormDraft<{
    result: AiSuggestion | null;
    title: string;
    text: string;
    notes: string;
    original: string;
    generationRevision: string | null;
  }>("ai-review", target, () => ({
    result: null,
    title: "",
    text: "",
    notes: intent.notes,
    original: JSON.stringify(intent),
    generationRevision: null,
  }));
  const [result] = draftField(draft, "result"),
    [title, setTitle] = draftField(draft, "title"),
    [text, setText] = draftField(draft, "text"),
    [notes, setNotes] = draftField(draft, "notes");
  const snapshot = useSnapshot(),
    [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [preview, setPreview] = useState<{
      revision: string;
      model: string;
      client: "codex" | "claude-code";
      effort: string;
      text: string;
    } | null>(null),
    [error, setError] = useState(""),
    [characters, setCharacters] = useState(0);
  const id = useRef<string | null>(null),
    sequence = useRef(0),
    previewIntent = useRef<AiIntent | null>(null);
  useEffect(
    () =>
      window.voidra.subscribe((event) => {
        if (event.type === "ai-progress" && event.id === id.current)
          setCharacters(event.characters);
      }),
    [],
  );
  useEffect(
    () => () => {
      if (id.current) void request({ command: "ai-cancel", id: id.current });
    },
    [],
  );
  if (!snapshot.data?.ai.configured && !draft.drafts.length && !showUnavailable)
    return null;
  async function close() {
    sequence.current++;
    if (id.current) void request({ command: "ai-cancel", id: id.current });
    id.current = null;
    try {
      await draft.flush();
      setOpen(false);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Draft could not be saved",
      );
    }
    setBusy(false);
  }
  async function show() {
    const current = ++sequence.current;
    setOpen(true);
    setError("");
    setPreview(null);
    setBusy(true);
    try {
      await draft.fresh();
      const response = await request({ command: "ai-preview", intent });
      if (response.kind !== "ai-preview")
        throw new Error("Preview is unavailable");
      if (sequence.current === current) {
        setPreview(response);
        previewIntent.current = intent;
      }
    } catch (error) {
      if (sequence.current === current)
        setError(error instanceof Error ? error.message : String(error));
    } finally {
      if (sequence.current === current) setBusy(false);
    }
  }
  async function generate() {
    const current = sequence.current,
      origin = draft.identity();
    setBusy(true);
    setError("");
    setCharacters(0);
    try {
      const selected = { ...intent, notes };
      let displayed = preview;
      if (JSON.stringify(selected) !== JSON.stringify(previewIntent.current)) {
        const response = await request({
          command: "ai-preview",
          intent: selected,
        });
        if (response.kind !== "ai-preview")
          throw new Error("Preview unavailable");
        displayed = response;
        setPreview(response);
        previewIntent.current = selected;
        setError(
          "Your text changed. Review this updated preview, then generate.",
        );
        return;
      }
      if (!displayed) {
        const response = await request({
          command: "ai-preview",
          intent: selected,
        });
        if (response.kind !== "ai-preview") throw Error("Preview unavailable");
        setPreview(response);
        previewIntent.current = selected;
        setError("Review the current preview, then generate.");
        return;
      }
      const requestId = crypto.randomUUID();
      id.current = requestId;
      const response = await request({
        command: "ai-generate",
        id: requestId,
        intent: selected,
        revision: displayed.revision,
      });
      if (response.kind !== "ai-suggestion")
        throw new Error("Suggestion unavailable");
      if (sequence.current !== current || draft.identity() !== origin) return;
      const suggestion = response.suggestion;
      draft.set((previous) => ({
        ...previous,
        result: suggestion,
        generationRevision: displayed.revision,
        original: JSON.stringify(selected),
      }));
      if (suggestion.feature === "task-title") {
        setTitle(suggestion.title);
        setText("");
      } else if (
        suggestion.feature === "rewrite" ||
        suggestion.feature === "task-capture"
      ) {
        setTitle(suggestion.title);
        setText(suggestion.description);
      } else if (suggestion.feature === "profile")
        setText(
          Array.isArray(suggestion.value)
            ? suggestion.value.join("\n")
            : String(suggestion.value ?? ""),
        );
      else if (suggestion.feature === "followup")
        setText(suggestion.questions.join("\n"));
      else if ("text" in suggestion) setText(suggestion.text);
    } catch (error) {
      if (sequence.current === current)
        setError(error instanceof Error ? error.message : String(error));
    } finally {
      if (sequence.current === current) {
        id.current = null;
        setBusy(false);
      }
    }
  }
  async function apply() {
    if (!result || busy) return;
    const origin = draft.identity();
    setBusy(true);
    try {
      await draft.flush();
      const suggestionDraft =
        result.feature === "task-title"
          ? { ...result, title }
          : result.feature === "rewrite" || result.feature === "task-capture"
            ? { ...result, title, description: text }
            : result.feature === "profile"
              ? {
                  ...result,
                  value: Array.isArray(result.value)
                    ? text
                        .split("\n")
                        .map((value) => value.trim())
                        .filter(Boolean)
                    : text || null,
                }
              : result.feature === "followup"
                ? {
                    ...result,
                    questions: text
                      .split("\n")
                      .map((value) => value.trim())
                      .filter(Boolean),
                  }
                : { ...result, text };
      if (result.feature !== "rewrite") {
        if (!draft.values.generationRevision)
          throw Error(
            "Review the current source and regenerate this suggestion before using it.",
          );
        const current = await request({
          command: "ai-preview",
          intent: aiIntentSchema.parse(JSON.parse(draft.values.original)),
        });
        if (
          current.kind !== "ai-preview" ||
          current.revision !== draft.values.generationRevision
        )
          throw Error(
            "The source or AI settings changed. Regenerate the suggestion before using it.",
          );
      }
      if (draft.identity() !== origin)
        throw Error(
          "This draft changed while its source was checked. Review the current draft before using it.",
        );
      onApply(aiSuggestionSchema.parse(suggestionDraft));
      await draft.submitted();
      await close();
    } catch (cause) {
      setError(
        cause instanceof Error && cause.name !== "ZodError"
          ? cause.message
          : "Complete the suggestion fields before using it.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Button
        variant="secondary"
        disabled={disabled}
        onClick={() => void show()}
        icon={<Sparkles size={16} aria-hidden />}
      >
        {label}
      </Button>
      <Dialog
        open={open}
        onClose={close}
        title={result ? "Review suggestion" : "Review text sent to your agent"}
        description="Only the selected planning text and your notes are sent. Source code and private files are excluded. Nothing is saved automatically."
        size="lg"
        footer={
          <>
            <Button data-dialog-close onClick={close}>
              {busy ? "Cancel request" : "Cancel"}
            </Button>
            {result ? (
              <Button
                variant="primary"
                disabled={busy}
                onClick={() => void apply()}
              >
                Use suggestion
              </Button>
            ) : (
              <Button
                variant="primary"
                disabled={busy || !preview}
                loading={busy}
                onClick={() => void generate()}
              >
                Generate suggestion
              </Button>
            )}
          </>
        }
      >
        <DraftNavigation
          form={{
            ...draft,
            restore: async (entry) => {
              sequence.current++;
              if (id.current)
                await request({ command: "ai-cancel", id: id.current });
              id.current = null;
              setBusy(false);
              await draft.restore(entry);
              setPreview(null);
              previewIntent.current = null;
            },
          }}
          disabled={busy}
        />
        <div className="space-y-4">
          {!result && preview && (
            <>
              <p className="text-muted">
                {preview.client === "codex" ? "Codex" : "Claude Code"} · Model:{" "}
                {preview.model} · Effort: {preview.effort}
              </p>
              <div className="whitespace-pre-wrap rounded-lg border border-line p-3 text-sm">
                {preview.text}
              </div>
            </>
          )}
          {!result &&
            (intent.feature === "profile" || intent.feature === "followup") && (
              <Field
                label="Extra context"
                hint="Add what you know. Review the updated preview before generating."
              >
                <MarkdownEditor
                  documentKey={`${draft.id}:notes`}
                  rows={3}
                  value={notes}
                  onChange={setNotes}
                  disabled={busy}
                />
              </Field>
            )}
          {result && "title" in result && (
            <Field label="Suggested title">
              <input
                className="input"
                disabled={busy}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={result.feature === "rewrite" ? 2000 : 160}
              />
            </Field>
          )}
          {result && result.feature !== "task-title" && (
            <Field
              label={
                result.feature === "rewrite"
                  ? "Suggested description"
                  : result.feature === "profile"
                    ? "Suggested answer"
                    : result.feature === "followup"
                      ? "Suggested questions"
                      : "Suggested text"
              }
            >
              <MarkdownEditor
                documentKey={`${draft.id}:result`}
                disabled={busy}
                rows={6}
                value={text}
                onChange={setText}
                maxLength={20000}
              />
            </Field>
          )}
          {busy && (
            <p role="status">
              Generating suggestion
              {characters ? ` · ${characters} characters received` : ""}…
            </p>
          )}
          {error && <p role="alert">{error}</p>}
        </div>
      </Dialog>
    </>
  );
}
