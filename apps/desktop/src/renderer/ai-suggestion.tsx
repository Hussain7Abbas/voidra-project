"use client";
import { Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  type AiIntent,
  type AiSuggestion,
  aiSuggestionSchema,
} from "../shared/ai.ts";
import { request, useSnapshot } from "./app.tsx";
import { Button } from "./ui/button.tsx";
import { Dialog } from "./ui/dialog.tsx";
import { Field } from "./ui/field.tsx";

export function AiSuggestionButton({
  label,
  intent,
  onApply,
  disabled = false,
}: {
  label: string;
  intent: AiIntent;
  onApply: (suggestion: AiSuggestion) => void;
  disabled?: boolean;
}) {
  const snapshot = useSnapshot(),
    [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [preview, setPreview] = useState<{
      revision: string;
      model: string;
      text: string;
    } | null>(null),
    [result, setResult] = useState<AiSuggestion | null>(null),
    [error, setError] = useState(""),
    [characters, setCharacters] = useState(0),
    [title, setTitle] = useState(""),
    [text, setText] = useState(""),
    [notes, setNotes] = useState(intent.notes);
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
  if (!snapshot.data?.ai.configured) return null;
  function close() {
    sequence.current++;
    if (id.current) void request({ command: "ai-cancel", id: id.current });
    id.current = null;
    setOpen(false);
    setBusy(false);
  }
  async function show() {
    const current = ++sequence.current;
    setOpen(true);
    setError("");
    setResult(null);
    setPreview(null);
    setNotes(intent.notes);
    setBusy(true);
    try {
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
    const current = sequence.current;
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
      if (!displayed) throw new Error("Review the preview first");
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
      if (sequence.current !== current) return;
      const suggestion = response.suggestion;
      setResult(suggestion);
      if (suggestion.feature === "rewrite") {
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
      else setText(suggestion.text);
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
  function apply() {
    if (!result) return;
    try {
      const draft =
        result.feature === "rewrite"
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
      onApply(aiSuggestionSchema.parse(draft));
      close();
    } catch {
      setError("Complete the suggestion fields before using it.");
    }
  }
  return (
    <>
      <Button
        variant="secondary"
        disabled={disabled || !snapshot.data.ai.model}
        onClick={() => void show()}
        icon={<Sparkles size={16} aria-hidden />}
      >
        {label}
      </Button>
      <Dialog
        open={open}
        onClose={close}
        title={result ? "Review suggestion" : "Review text sent to OpenRouter"}
        description="Only the selected planning text and your notes are sent. Source code and private files are excluded. Nothing is saved automatically."
        size="lg"
        footer={
          <>
            <Button onClick={close}>
              {busy ? "Cancel request" : "Cancel"}
            </Button>
            {result ? (
              <Button variant="primary" onClick={apply}>
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
        <div className="space-y-4">
          {!result && preview && (
            <>
              <p className="text-muted">Model: {preview.model}</p>
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
                <textarea
                  className="input"
                  rows={3}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  disabled={busy}
                />
              </Field>
            )}
          {result?.feature === "rewrite" && (
            <Field label="Suggested title">
              <input
                className="input"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={2000}
              />
            </Field>
          )}
          {result && (
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
              <textarea
                className="input"
                rows={6}
                value={text}
                onChange={(event) => setText(event.target.value)}
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
