"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { z } from "zod";
import type { secretDraftViewSchema } from "../shared/form-drafts.ts";
import { request } from "./app.tsx";
import { registerDraftFlusher } from "./form-drafts.tsx";
import { Button } from "./ui/button.tsx";

type SecretDraft = z.infer<typeof secretDraftViewSchema>;
export function useSecretDraft() {
  const state = useRef({
      id: crypto.randomUUID() as string,
      revision: null as string | null,
      value: "",
      dirty: false,
      hasValue: false,
    }),
    queue = useRef<Promise<unknown>>(Promise.resolve());
  const [value, setValue] = useState(""),
    [drafts, setDrafts] = useState<SecretDraft[]>([]),
    [error, setError] = useState(""),
    [selected, setSelected] = useState(false);
  const refresh = useCallback(async () => {
    const result = await request({ command: "secret-draft-list" });
    if (result.kind !== "secret-drafts")
      throw Error("Encrypted drafts unavailable");
    setDrafts(result.drafts);
    if (result.problems.length)
      setError(result.problems.map((problem) => problem.message).join(" · "));
  }, []);
  function flush(): Promise<void> {
    const operation = queue.current
      .catch(() => {})
      .then(async () => {
        const current = state.current;
        if (!current.dirty) return;
        const captured = current.value;
        const response = await request({
          command: "secret-draft-put",
          id: current.id,
          revision: current.revision,
          value: captured,
        });
        if (response.kind !== "secret-draft")
          throw Error("Encrypted draft save unavailable");
        current.revision = response.draft.revision;
        current.hasValue = response.draft.hasValue;
        if (current.value === captured) current.dirty = false;
        setDrafts((previous) => [
          response.draft,
          ...previous.filter((draft) => draft.id !== response.draft.id),
        ]);
        setError("");
      });
    queue.current = operation;
    return operation.catch((cause) => {
      setError(
        cause instanceof Error
          ? cause.message
          : "Encrypted draft could not be saved",
      );
      throw cause;
    });
  }
  const latest = useRef(flush);
  latest.current = flush;
  useEffect(() => {
    void refresh().catch((cause) => setError(String(cause)));
    const unregister = registerDraftFlusher(() => latest.current());
    return () => {
      unregister();
      void latest.current().catch(() => {});
    };
  }, [refresh]);
  function change(next: string) {
    state.current.value = next;
    state.current.dirty = true;
    setValue(next);
    setSelected(false);
    void flush().catch(() => {});
  }
  async function restore(draft: SecretDraft) {
    await flush();
    state.current = {
      id: draft.id,
      revision: draft.revision,
      value: "",
      dirty: false,
      hasValue: draft.hasValue,
    };
    setValue("");
    setSelected(true);
    setError("");
  }
  async function fresh() {
    await flush();
    state.current = {
      id: crypto.randomUUID(),
      revision: null,
      value: "",
      dirty: false,
      hasValue: false,
    };
    setValue("");
    setSelected(false);
  }
  async function discard() {
    await queue.current.catch(() => {});
    if (state.current.revision)
      await request({
        command: "secret-draft-delete",
        id: state.current.id,
        revision: state.current.revision,
      });
    state.current.dirty = false;
    await fresh();
    await refresh();
  }
  async function fork() {
    await queue.current.catch(() => {});
    state.current = {
      ...state.current,
      id: crypto.randomUUID(),
      revision: null,
      dirty: true,
    };
    setSelected(false);
    await flush();
  }
  async function apply() {
    await flush();
    if (!state.current.revision) throw Error("Enter a key first");
    await request({
      command: "secret-draft-apply",
      id: state.current.id,
      revision: state.current.revision,
    });
    state.current = {
      id: crypto.randomUUID(),
      revision: null,
      value: "",
      dirty: false,
      hasValue: false,
    };
    setValue("");
    setSelected(false);
    await refresh();
  }
  return {
    value,
    change,
    drafts,
    error,
    selected,
    canApply: selected ? state.current.hasValue : !!value.trim(),
    restore,
    fresh,
    discard,
    apply,
    fork,
  };
}
export function SecretDraftNavigation({
  draft,
  disabled,
}: {
  draft: ReturnType<typeof useSecretDraft>;
  disabled: boolean;
}) {
  const [error, setError] = useState("");
  const act = (operation: () => Promise<void>) =>
    void operation().catch((cause) => setError(String(cause)));
  return (
    <div className="space-y-2">
      <nav aria-label="Unfinished key drafts" className="flex flex-wrap gap-2">
        <Button disabled={disabled} onClick={() => act(draft.fresh)}>
          New key draft
        </Button>
        {draft.drafts.map((entry, index) => (
          <Button
            key={entry.id}
            disabled={disabled}
            onClick={() => act(() => draft.restore(entry))}
          >
            Unfinished OpenRouter key {index + 1}
          </Button>
        ))}
        <Button
          disabled={disabled}
          variant="ghost"
          onClick={() => act(draft.discard)}
        >
          Discard key draft
        </Button>
      </nav>
      {draft.selected && (
        <p role="status">
          Encrypted key draft selected. Save key applies it without displaying
          its value.
        </p>
      )}
      {draft.error && draft.value && (
        <Button disabled={disabled} onClick={() => act(draft.fork)}>
          Keep as a separate key draft
        </Button>
      )}
      {(error || draft.error) && <p role="alert">{error || draft.error}</p>}
    </div>
  );
}
