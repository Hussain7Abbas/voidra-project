"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { SkillPreview, SkillStatus } from "../shared/skills.ts";
import { request } from "./app.tsx";
import { Button } from "./ui/button.tsx";
import { Dialog } from "./ui/dialog.tsx";

const agentNames = { claude: "Claude Code", codex: "Codex" } as const;
export function SkillSettingsPanel() {
  const query = useQueryClient(),
    [expanded, setExpanded] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [preview, setPreview] = useState<SkillPreview | null>(null);
  const status = useQuery({
    queryKey: ["skills-status"],
    enabled: expanded,
    queryFn: async () => {
      const result = await request({ command: "skills-status" });
      if (result.kind !== "skills-status")
        throw new Error("Skill status is unavailable");
      return result.skills;
    },
  });
  async function apply(selected: SkillPreview, confirmed: boolean) {
    setBusy(true);
    setError("");
    try {
      await request({
        command: "skills-apply",
        agent: selected.agent,
        name: selected.name,
        operation: selected.operation,
        revision: selected.revision,
        bundleRevision: selected.bundleRevision,
        confirmed,
      });
      setPreview(null);
      await query.invalidateQueries({ queryKey: ["skills-status"] });
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }
  async function change(row: SkillStatus, operation: "install" | "remove") {
    setBusy(true);
    setError("");
    try {
      const result = await request({
        command: "skills-preview",
        agent: row.agent,
        name: row.name,
        operation,
      });
      if (result.kind !== "skills-preview")
        throw new Error("Skill preview is unavailable");
      if (result.preview.requiresConfirmation) setPreview(result.preview);
      else await apply(result.preview, false);
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <details
      className="mt-6 border-t border-line pt-5"
      onToggle={(event) => setExpanded(event.currentTarget.open)}
    >
      <summary className="cursor-pointer font-semibold">
        Coding agent skills
      </summary>
      {expanded && (
        <div className="space-y-4 pt-4">
          <p className="text-sm text-muted">
            Install bundled copies for your user account. Your other skills are
            kept. Edited copies need your confirmation before replacement or
            removal.
          </p>
          <Button
            variant="secondary"
            disabled={busy || status.isFetching}
            onClick={() => void status.refetch()}
          >
            Refresh skill status
          </Button>
          {(error || status.error) && (
            <p role="alert" className="text-danger">
              {error || status.error?.message}
            </p>
          )}
          {status.isPending && <p role="status">Checking installed skills…</p>}
          {(["claude", "codex"] as const).map((agent) => (
            <section
              key={agent}
              aria-label={`${agentNames[agent]} skills`}
              className="space-y-3"
            >
              <h3 className="font-semibold">{agentNames[agent]}</h3>
              {status.data
                ?.filter((row) => row.agent === agent)
                .map((row) => (
                  <article
                    key={row.name}
                    aria-label={`${agentNames[agent]} ${row.name}`}
                    className="rounded-lg border border-line p-3 space-y-2"
                  >
                    <h4 className="font-medium">{row.name}</h4>
                    <p className="text-sm text-muted">
                      {row.installedVersion
                        ? `Installed ${row.installedVersion}`
                        : row.present
                          ? "Unmanaged copy"
                          : "Not installed"}{" "}
                      · Bundled {row.bundledVersion} · Format{" "}
                      {row.bundledFormat}
                    </p>
                    {row.edited && <p className="text-sm">Edited locally</p>}
                    {(row.blocked || row.compatibility) && (
                      <p role="status" className="text-sm text-danger">
                        {row.blocked || row.compatibility}
                      </p>
                    )}
                    <div className="flex gap-2">
                      {(!row.present ||
                        row.installedVersion !== row.bundledVersion ||
                        row.edited) && (
                        <Button
                          variant="secondary"
                          disabled={busy || !!row.blocked}
                          aria-label={`${row.present ? "Update" : "Install"} ${row.name} for ${agentNames[agent]}`}
                          onClick={() => void change(row, "install")}
                        >
                          {row.present ? "Update" : "Install"}
                        </Button>
                      )}
                      {row.present && (
                        <Button
                          variant="ghost"
                          disabled={busy || !!row.blocked}
                          aria-label={`Remove ${row.name} for ${agentNames[agent]}`}
                          onClick={() => void change(row, "remove")}
                        >
                          Remove
                        </Button>
                      )}
                    </div>
                  </article>
                ))}
            </section>
          ))}
        </div>
      )}
      <Dialog
        open={preview !== null}
        onClose={() => {
          if (!busy) {
            setPreview(null);
            setError("");
          }
        }}
        title="Review skill changes"
        description="This copy was edited locally or installed outside Voidra. Review the difference before continuing."
        size="lg"
        closeDisabled={busy}
        footer={
          <>
            <Button
              disabled={busy}
              onClick={() => {
                setPreview(null);
                setError("");
              }}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={busy}
              onClick={() => {
                if (preview) void apply(preview, true);
              }}
            >
              {preview?.operation === "remove"
                ? "Remove edited copy"
                : "Replace edited copy"}
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted">
          {preview?.name} · {preview ? agentNames[preview.agent] : ""}
        </p>
        <pre className="whitespace-pre-wrap break-words rounded-lg border border-line p-3 text-sm">
          {preview?.diff}
        </pre>
        {error && (
          <p role="alert" className="text-danger">
            {error}
          </p>
        )}
      </Dialog>
    </details>
  );
}
