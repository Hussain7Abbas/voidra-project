"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type DraftInput,
  type DraftView,
  draftInputSchema,
} from "../shared/form-drafts.ts";
import { request } from "./app.tsx";
import { Button } from "./ui/button.tsx";

type DraftScope = DraftInput["family"];
const flushers = new Map<() => Promise<void>, DraftScope>();
export async function flushFormDrafts(
  scopes?: readonly DraftScope[],
): Promise<void> {
  const results = await Promise.allSettled(
    [...flushers]
      .filter(([, scope]) => !scopes || scopes.includes(scope))
      .map(([flush]) => flush()),
  );
  const failure = results.find((result) => result.status === "rejected");
  if (failure?.status === "rejected") throw failure.reason;
}
/** Values, including original source revisions, are restored as one indivisible editing session. */
export function useFormDraft<T extends DraftInput["values"]>(
  family: DraftInput["family"],
  target: string,
  initial: () => T,
) {
  const initialRef = useRef(initial),
    state = useRef({
      id: crypto.randomUUID() as string,
      revision: null as string | null,
      values: initial(),
      dirty: false,
    }),
    queue = useRef<Promise<unknown>>(Promise.resolve()),
    alive = useRef(true);
  initialRef.current = initial;
  const [values, render] = useState(state.current.values),
    [drafts, setDrafts] = useState<DraftView[]>([]),
    [error, setError] = useState("");
  const refresh = useCallback(async () => {
    const response = await request({ command: "draft-list", family, target });
    if (response.kind !== "drafts") throw Error("Draft list unavailable");
    if (alive.current) {
      setDrafts(response.drafts);
      if (response.problems.length)
        setError(response.problems.map((p) => p.message).join(" · "));
    }
  }, [family, target]);
  const flush = useCallback(() => {
    const operation = queue.current
      .catch(() => {})
      .then(async () => {
        const current = state.current;
        if (!current.dirty) return;
        const captured = current.values;
        const response = await request({
          command: "draft-put",
          draft: draftInputSchema.parse({
            id: current.id,
            revision: current.revision,
            family,
            target,
            values: captured,
          }),
        });
        if (response.kind !== "draft") throw Error("Draft save unavailable");
        current.revision = response.draft.revision;
        if (current.values === captured) current.dirty = false;
        if (alive.current) {
          setError("");
          setDrafts((previous) => [
            response.draft,
            ...previous.filter((d) => d.id !== response.draft.id),
          ]);
        }
      });
    queue.current = operation;
    return operation.catch((cause) => {
      if (alive.current)
        setError(
          cause instanceof Error ? cause.message : "Draft could not be saved",
        );
      throw cause;
    });
  }, [family, target]);
  useEffect(() => {
    alive.current = true;
    flushers.set(flush, family);
    void refresh().catch((cause) => setError(String(cause)));
    const unsubscribe = window.voidra.subscribe((event) => {
      if (event.type !== "draft-deleted") return;
      setDrafts((previous) =>
        previous.filter((draft) => draft.id !== event.id),
      );
      if (event.id === state.current.id) {
        state.current.id = crypto.randomUUID();
        state.current.revision = null;
      }
    });
    return () => {
      unsubscribe();
      alive.current = false;
      flushers.delete(flush);
      void flush().catch(() => {});
    };
  }, [flush, refresh, family]);
  function set(update: T | ((previous: T) => T)) {
    const next =
      typeof update === "function" ? update(state.current.values) : update;
    state.current.values = next;
    state.current.dirty = true;
    render(next);
    void flush().catch(() => {});
  }
  async function restore(draft: DraftView) {
    const before = state.current.values;
    await flush();
    const response = await request({ command: "draft-read", id: draft.id });
    if (
      response.kind !== "draft" ||
      response.draft.family !== family ||
      response.draft.target !== target
    )
      throw Error("Draft context differs");
    if (state.current.values !== before)
      throw Error("The form changed while opening a draft. Try again.");
    const next = { ...initialRef.current(), ...response.draft.values } as T;
    state.current = {
      id: draft.id,
      revision: response.draft.revision,
      values: next,
      dirty: false,
    };
    render(next);
    setError("");
  }
  async function fresh(values?: T) {
    const before = state.current.values;
    await flush();
    if (state.current.values !== before)
      throw Error("The form changed while starting a draft. Try again.");
    const next = values ?? initialRef.current();
    state.current = {
      id: crypto.randomUUID(),
      revision: null,
      values: next,
      dirty: false,
    };
    render(next);
    setError("");
  }
  async function discard() {
    await queue.current.catch(() => {});
    if (state.current.revision)
      await request({
        command: "draft-delete",
        id: state.current.id,
        revision: state.current.revision,
      });
    const next = initialRef.current();
    state.current = {
      id: crypto.randomUUID(),
      revision: null,
      values: next,
      dirty: false,
    };
    render(next);
    await refresh();
  }
  async function fork() {
    await queue.current.catch(() => {});
    state.current = {
      id: crypto.randomUUID(),
      revision: null,
      values: state.current.values,
      dirty: true,
    };
    await flush();
  }
  async function submitted() {
    await flush();
    await discard();
  }
  return {
    values,
    set,
    flush,
    restore,
    fresh,
    discard,
    submitted,
    fork,
    drafts,
    error,
    id: state.current.id,
    identity: () => state.current.id,
    navigationLabel: `${family.replaceAll("-", " ")} drafts`,
  };
}
export function DraftNavigation({
  form,
  disabled = false,
  label,
}: {
  label?: string;
  form: {
    navigationLabel?: string;
    id: string;
    drafts: DraftView[];
    error: string;
    restore: (draft: DraftView) => Promise<void>;
    fresh: () => Promise<void>;
    discard: () => Promise<void>;
    fork?: () => Promise<void>;
  };
  disabled?: boolean;
}) {
  const [error, setError] = useState("");
  const act = (operation: () => Promise<void>) =>
    void operation().catch((cause) =>
      setError(
        cause instanceof Error ? cause.message : "Draft could not be opened",
      ),
    );
  return (
    <div className="space-y-2 mb-4">
      <nav
        aria-label={label ?? form.navigationLabel ?? "Unfinished drafts"}
        className="flex flex-wrap gap-2"
      >
        <Button disabled={disabled} onClick={() => act(form.fresh)}>
          New draft
        </Button>
        {form.drafts.map((draft, index) => (
          <Button
            key={draft.id}
            className="draft-badge"
            title={draft.label}
            disabled={disabled}
            aria-current={form.id === draft.id ? "page" : undefined}
            aria-label={`Restore draft ${index + 1}: ${draft.label}`}
            onClick={() => act(() => form.restore(draft))}
          >
            {draft.label}
          </Button>
        ))}
        <Button
          disabled={disabled}
          variant="ghost"
          onClick={() => act(form.discard)}
        >
          Discard current draft
        </Button>
      </nav>
      {form.error && form.fork && (
        <Button
          disabled={disabled}
          onClick={() => act(form.fork as () => Promise<void>)}
        >
          Keep as a separate draft
        </Button>
      )}
      {(form.error || error) && (
        <p role="alert" className="text-danger">
          {form.error || error}
        </p>
      )}
    </div>
  );
}

export function draftField<T extends DraftInput["values"], K extends keyof T>(
  form: { values: T; set: (update: T | ((previous: T) => T)) => void },
  key: K,
): [T[K], (update: T[K] | ((previous: T[K]) => T[K])) => void] {
  return [
    form.values[key],
    (update) =>
      form.set((previous) => ({
        ...previous,
        [key]:
          typeof update === "function"
            ? (update as (previous: T[K]) => T[K])(previous[key])
            : update,
      })),
  ];
}
