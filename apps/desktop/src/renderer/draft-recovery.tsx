"use client";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { draftRecoveryText } from "../shared/form-drafts.ts";
import { request } from "./app.tsx";
import { SafeMarkdown } from "./markdown.tsx";
import { Button } from "./ui/button.tsx";

/** Read-only recovery remains available when a draft's original ticket/question no longer exists. */
export function DraftRecovery() {
  const [active, setActive] = useState(false),
    [selected, setSelected] = useState<string | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const drafts = useQuery({
    queryKey: ["private-form-recovery"],
    enabled: active,
    queryFn: async () => {
      const result = await request({ command: "draft-list" });
      if (result.kind !== "drafts") throw Error("Unfinished forms unavailable");
      return result;
    },
  });
  const current = drafts.data?.drafts.find((draft) => draft.id === selected);
  return (
    <details
      className="mt-6 border-t border-line pt-4"
      onToggle={(event) => {
        setActive(event.currentTarget.open);
        if (event.currentTarget.open) void drafts.refetch();
      }}
    >
      <summary className="cursor-pointer font-semibold">
        Unfinished forms
      </summary>
      {active && (
        <div className="space-y-4 mt-4">
          <p className="text-sm text-muted">
            Your unfinished forms stay on this computer. Resume them from their
            forms, or recover the text here when the original item is
            unavailable.
          </p>
          <nav
            aria-label="Saved unfinished forms"
            className="flex flex-wrap gap-2"
          >
            {drafts.data?.drafts.map((draft, index) => (
              <Button
                key={draft.id}
                className="draft-badge"
                title={draft.label}
                aria-current={draft.id === selected ? "page" : undefined}
                aria-label={`Read unfinished form ${index + 1}: ${draft.label}`}
                onClick={() => setSelected(draft.id)}
              >
                {draft.label}
              </Button>
            ))}
          </nav>
          {drafts.data && !drafts.data.drafts.length && (
            <p>No unfinished forms in this project.</p>
          )}
          {current && (
            <section
              aria-label="Recovered form text"
              className="card p-4 space-y-4"
            >
              <h3>{current.label}</h3>
              <SafeMarkdown body={draftRecoveryText(current.values)} />
              <Button
                onClick={async () => {
                  try {
                    await request({
                      command: "copy-draft",
                      id: current.id,
                      revision: current.revision,
                    });
                    setMessage("Markdown copied");
                  } catch (cause) {
                    setError(
                      cause instanceof Error
                        ? cause.message
                        : "Draft could not be copied",
                    );
                  }
                }}
              >
                Copy Markdown
              </Button>
              {message && <p role="status">{message}</p>}
              <Button
                variant="danger"
                onClick={async () => {
                  try {
                    await request({
                      command: "draft-delete",
                      id: current.id,
                      revision: current.revision,
                    });
                    setSelected(null);
                    await drafts.refetch();
                  } catch (cause) {
                    setError(
                      cause instanceof Error
                        ? cause.message
                        : "Draft could not be discarded",
                    );
                  }
                }}
              >
                Discard this draft
              </Button>
            </section>
          )}
          {(error || drafts.error) && (
            <p role="alert">{error || drafts.error?.message}</p>
          )}
          {drafts.data?.problems.map((problem) => (
            <p role="alert" key={problem.id}>
              {problem.message}
            </p>
          ))}
        </div>
      )}
    </details>
  );
}
