"use client";
import { useQueryClient } from "@tanstack/react-query";
import { PanelBottom, PanelLeft, PanelRight, X } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { WorkspaceSnapshot } from "../shared/bridge.ts";
import {
  fitWorkspaceLayout,
  type WorkspaceLayout,
  type WorkspaceLayoutView,
  type WorkspacePanel,
  workspaceLayoutSchema,
} from "../shared/workspace-layout.ts";
import { request } from "./app.tsx";
import { flushFormDrafts } from "./form-drafts.tsx";
import { inboxAttentionSeeds, inboxItems } from "./inbox.ts";
import { ProjectActions } from "./project-actions.tsx";
import { ProjectInbox } from "./project-inbox.tsx";
import { Button } from "./ui/button.tsx";
import { useToast } from "./ui/toast.tsx";

type Patch = Partial<WorkspaceLayout>;
const fallback = {
  context: "0".repeat(64),
  value: workspaceLayoutSchema.parse({}),
};
const openField = {
  navigation: "navigationOpen",
  actions: "actionsOpen",
  waiting: "waitingOpen",
} as const;
const paneId = {
  navigation: "project-navigation",
  actions: "actions-sidebar",
  waiting: "waiting-panel",
} as const;
const toggleId = (panel: WorkspacePanel) => `toggle-${panel}`;
export function useWorkspacePanels(
  view: WorkspaceLayoutView | undefined,
  workspace: WorkspaceSnapshot | undefined,
) {
  const query = useQueryClient(),
    toast = useToast();
  const [local, setLocal] = useState(view ?? fallback),
    [bounds, setBounds] = useState({ width: 1200, height: 752 });
  const current = view && local.context !== view.context ? view : local;
  const latest = useRef(current),
    source = useRef(view),
    pending = useRef(0),
    queue = useRef(Promise.resolve());
  latest.current = current;
  source.current = view;
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (view && local.context !== view.context) {
      latest.current = view;
      setLocal(view);
    }
  }, [view, local.context]);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry)
        setBounds({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const preview = useCallback((patch: Patch) => {
    const next = {
      context: latest.current.context,
      value: { ...latest.current.value, ...patch },
    };
    latest.current = next;
    setLocal(next);
  }, []);
  const save = useCallback(
    (patch: Patch) => {
      const context = latest.current.context;
      if (!source.current || source.current.context !== context)
        return Promise.resolve();
      preview(patch);
      pending.current++;
      const next = queue.current
        .catch(() => {})
        .then(async () => {
          await request({ command: "set-workspace-layout", context, patch });
        })
        .catch((cause) => {
          toast.error(
            cause instanceof Error
              ? cause.message
              : "Layout could not be saved.",
          );
        })
        .finally(async () => {
          pending.current--;
          if (!pending.current)
            await query.invalidateQueries({ queryKey: ["snapshot"] });
        });
      queue.current = next;
      return next;
    },
    [preview, query, toast],
  );
  const available = !!workspace?.hasVoidra || !!workspace?.recoveries.length;
  const toggle = useCallback(
    async (panel: WorkspacePanel) => {
      if (
        !source.current ||
        (panel !== "navigation" && !available) ||
        document.querySelector("dialog[open]")
      )
        return;
      const field = openField[panel],
        isOpen = latest.current.value[field];
      if (isOpen) {
        try {
          await flushFormDrafts();
        } catch (cause) {
          toast.error(
            cause instanceof Error
              ? cause.message
              : "Draft could not be saved.",
          );
          return;
        }
        const pane = document.getElementById(paneId[panel]);
        if (
          pane?.contains(document.activeElement) ||
          document.activeElement?.getAttribute("aria-controls") ===
            paneId[panel]
        )
          document.getElementById(toggleId(panel))?.focus();
      }
      await save({ [field]: !isOpen });
    },
    [save, toast, available],
  );
  useEffect(
    () =>
      window.voidra.subscribe((event) => {
        if (event.type === "workspace-panel") void toggle(event.panel);
        if (event.type === "layout-changed")
          void query.invalidateQueries({ queryKey: ["snapshot"] });
      }),
    [toggle, query],
  );
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.repeat ||
        event.isComposing ||
        !(event.metaKey || event.ctrlKey) ||
        !event.altKey ||
        event.shiftKey
      )
        return;
      const panel =
        event.code === "Digit1"
          ? "navigation"
          : event.code === "Digit2"
            ? "actions"
            : event.code === "Digit3"
              ? "waiting"
              : null;
      if (!panel) return;
      event.preventDefault();
      void toggle(panel);
    };
    document.addEventListener("keydown", keyboard);
    return () => document.removeEventListener("keydown", keyboard);
  }, [toggle]);
  const seeds = useMemo(
    () => JSON.stringify(workspace ? inboxAttentionSeeds(workspace) : []),
    [workspace],
  );
  const context = current.context,
    ready = view !== undefined,
    workspaceReady = workspace !== undefined;
  useEffect(() => {
    let active = true;
    const strings = JSON.parse(seeds) as string[];
    if (!ready || !workspaceReady) return;
    void Promise.all(
      strings.map(async (seed) => {
        const bytes = await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(seed),
        );
        return Array.from(new Uint8Array(bytes), (byte) =>
          byte.toString(16).padStart(2, "0"),
        ).join("");
      }),
    )
      .then((tokens) => {
        if (!active || latest.current.context !== context) return;
        const known = new Set(latest.current.value.seen);
        const seen = [...new Set(tokens)].slice(-4096),
          fresh = seen.some((token) => !known.has(token));
        if (fresh || seen.length !== known.size)
          void save({ ...(fresh ? { waitingOpen: true } : {}), seen });
      })
      .catch((cause) => toast.error(String(cause)));
    return () => {
      active = false;
    };
  }, [seeds, context, ready, workspaceReady, save, toast]);
  const fitted = fitWorkspaceLayout(current.value, bounds.width, bounds.height);
  return {
    host,
    value: current.value,
    fitted,
    bounds,
    preview,
    save,
    toggle,
    ready: !!view,
    context,
  };
}

export function PanelControls({
  value,
  ready,
  available,
  waitingCount,
  onToggle,
}: {
  value: WorkspaceLayout;
  ready: boolean;
  available: boolean;
  waitingCount: number;
  onToggle: (panel: WorkspacePanel) => Promise<void>;
}) {
  const fills = {
    navigation: "M9 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4Z",
    actions: "M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4Z",
    waiting: "M3 15v4a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4Z",
  };
  return (
    <fieldset className="panel-controls">
      <legend className="sr-only">Workspace panels</legend>
      {(
        [
          ["navigation", "Navigation", PanelLeft],
          ["actions", "Actions", PanelRight],
          ["waiting", "Waiting for you", PanelBottom],
        ] as const
      ).map(([panel, label, Icon], index) => (
        <Button
          key={panel}
          id={toggleId(panel)}
          variant="ghost"
          iconOnly
          aria-label={label}
          aria-description={
            panel === "waiting" ? `${waitingCount} waiting items` : undefined
          }
          aria-expanded={
            (panel === "navigation" || available) && value[openField[panel]]
          }
          aria-controls={
            panel === "navigation" || available ? paneId[panel] : undefined
          }
          disabled={!ready || (panel !== "navigation" && !available)}
          title={`${label} · Cmd/Ctrl+Alt+${index + 1}`}
          onClick={() => void onToggle(panel)}
          icon={
            <Icon size={18} aria-hidden>
              {(panel === "navigation" || available) &&
                value[openField[panel]] && (
                  <path d={fills[panel]} fill="currentColor" stroke="none" />
                )}
            </Icon>
          }
        >
          {panel === "waiting" && waitingCount > 0 && (
            <span className="panel-attention-count">{waitingCount}</span>
          )}
        </Button>
      ))}
    </fieldset>
  );
}

type ResizeGesture = {
  pointer: number;
  coordinate: number;
  start: number;
  restore: number;
  latest: number;
};
export function PaneResize({
  panel,
  label,
  controls,
  orientation,
  value,
  preferred,
  min,
  max,
  hidden,
  sign = 1,
  onPreview,
  onSave,
  onToggle,
}: {
  panel: WorkspacePanel;
  label?: string;
  controls?: string;
  orientation: "horizontal" | "vertical";
  value: number;
  preferred: number;
  min: number;
  max: number;
  hidden: boolean;
  sign?: number;
  onPreview: (size: number) => void;
  onSave: (size: number) => void;
  onToggle: () => void;
}) {
  const gesture = useRef<ResizeGesture | null>(null),
    frame = useRef<number | null>(null);
  const callbacks = useRef({ onPreview, onSave });
  callbacks.current = { onPreview, onSave };
  const clamp = (size: number) =>
    Math.round(Math.max(min, Math.min(max, size)));
  const cancel = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    const drag = gesture.current;
    gesture.current = null;
    if (drag) callbacks.current.onPreview(drag.restore);
  }, []);
  useEffect(() => {
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") cancel();
    };
    window.addEventListener("keydown", onEscape);
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      gesture.current = null;
      window.removeEventListener("keydown", onEscape);
    };
  }, [cancel]);
  const name =
    label ??
    (panel === "navigation"
      ? "Project navigation"
      : panel === "actions"
        ? "Actions"
        : "Waiting for you");
  return (
    <section
      className={`pane-resize-control pane-resize-control-${orientation}`}
      aria-label={`${name} resize controls`}
      hidden={hidden}
    >
      <hr
        tabIndex={0}
        className={`pane-resizer pane-resizer-${orientation}`}
        aria-label={`Resize ${name}`}
        aria-controls={controls ?? paneId[panel]}
        aria-orientation={orientation}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={`${value} pixels`}
        title={`Resize ${name} · arrow keys, Home/End; Enter to hide; Escape to cancel a drag`}
        onKeyDown={(event) => {
          const lower = orientation === "vertical" ? "ArrowLeft" : "ArrowUp",
            higher = orientation === "vertical" ? "ArrowRight" : "ArrowDown";
          if (event.key === "Enter") {
            event.preventDefault();
            onToggle();
            return;
          }
          const next =
            event.key === lower
              ? value - 16 * sign
              : event.key === higher
                ? value + 16 * sign
                : event.key === "Home"
                  ? min
                  : event.key === "End"
                    ? max
                    : null;
          if (next === null) return;
          event.preventDefault();
          onSave(clamp(next));
        }}
        onPointerDown={(event) => {
          if (!event.isPrimary || event.button !== 0) return;
          gesture.current = {
            pointer: event.pointerId,
            coordinate:
              orientation === "vertical" ? event.clientX : event.clientY,
            start: value,
            restore: preferred,
            latest: value,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const drag = gesture.current;
          if (!drag || drag.pointer !== event.pointerId) return;
          const coordinate =
            orientation === "vertical" ? event.clientX : event.clientY;
          drag.latest = clamp(
            drag.start + (coordinate - drag.coordinate) * sign,
          );
          if (frame.current === null)
            frame.current = requestAnimationFrame(() => {
              frame.current = null;
              if (gesture.current) onPreview(gesture.current.latest);
            });
        }}
        onPointerUp={(event) => {
          const drag = gesture.current;
          if (!drag || drag.pointer !== event.pointerId) return;
          gesture.current = null;
          if (frame.current !== null) cancelAnimationFrame(frame.current);
          frame.current = null;
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
          onSave(drag.latest);
        }}
        onPointerCancel={cancel}
        onLostPointerCapture={cancel}
      />
    </section>
  );
}

export const WaitingPanel = memo(function WaitingPanel({
  workspace,
  onHide,
}: {
  workspace: WorkspaceSnapshot;
  onHide: () => void;
}) {
  const [selected, setSelected] = useState<string | null>(null),
    toast = useToast(),
    body = useRef<HTMLDivElement>(null);
  const count = inboxItems(workspace).length;
  const select = (id: string | null) => {
    void flushFormDrafts()
      .then(() => {
        setSelected(id);
        requestAnimationFrame(() => {
          const heading = body.current?.querySelector<HTMLElement>("h1, h2");
          if (heading) {
            heading.tabIndex = -1;
            heading.focus();
          }
        });
      })
      .catch((cause) => toast.error(String(cause)));
  };
  return (
    <section
      id="waiting-panel"
      className="waiting-panel"
      aria-labelledby="waiting-panel-title"
    >
      <header className="waiting-panel-heading">
        <h2 id="waiting-panel-title">
          Waiting for you{" "}
          <span aria-hidden="true" className="text-muted">
            {count}
          </span>
        </h2>
        <Button
          variant="ghost"
          iconOnly
          aria-label="Hide Waiting for you"
          onClick={onHide}
          icon={<X size={16} aria-hidden />}
        />
      </header>
      <p className="sr-only" aria-live="polite">
        {count} {count === 1 ? "item needs" : "items need"} your attention.
      </p>
      <div
        className="waiting-panel-body"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: This independent scroller needs keyboard access even when every inferred answer is disabled.
        tabIndex={0}
        ref={body}
      >
        {selected &&
        workspace.actions.some(
          (action) => action.data.id === selected && !action.data.deletedAt,
        ) ? (
          <ProjectActions
            key={selected}
            view="actions"
            surface="waiting"
            initialAction={selected}
            onBack={() => select(null)}
            backLabel="Back to Waiting for you"
          />
        ) : (
          <ProjectInbox
            workspace={workspace}
            onSelect={(id) => select(id)}
            compact
          />
        )}
      </div>
    </section>
  );
});
