"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { SkillBundlePreview } from "../shared/skills.ts";
import { request } from "./app.tsx";
import { Button } from "./ui/button.tsx";
import { Dialog } from "./ui/dialog.tsx";

type Agent = "claude" | "codex";
const agentNames = { claude: "Claude Code", codex: "Codex" } as const;
export function SkillSettingsPanel() {
  const query = useQueryClient(),
    [busyAgent, setBusyAgent] = useState<Agent | null>(null),
    [preview, setPreview] = useState<SkillBundlePreview | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const busy = busyAgent !== null;
  const status = useQuery({
    queryKey: ["skills-status"],
    queryFn: async () => {
      const result = await request({ command: "skills-status" });
      if (result.kind !== "skills-status")
        throw Error("Skill status is unavailable");
      return result.skills;
    },
  });
  async function getPreview(agent: Agent): Promise<SkillBundlePreview> {
    const result = await request({ command: "skills-bundle-preview", agent });
    if (result.kind !== "skills-bundle-preview")
      throw Error("Bundle preview is unavailable");
    return result.preview;
  }
  async function apply(selected: SkillBundlePreview, confirmed: boolean) {
    setBusyAgent(selected.agent);
    setError("");
    setMessage("");
    try {
      const response = await request({
        command: "skills-bundle-apply",
        agent: selected.agent,
        revision: selected.revision,
        confirmed,
      });
      if (response.kind !== "skills-bundle-applied")
        throw Error("Bundle result is unavailable");
      setPreview(null);
      if (response.result.error)
        setError(
          `${agentNames[selected.agent]} installation stopped. Completed: ${response.result.completed.join(", ") || "none"}. Remaining: ${response.result.remaining.join(", ") || "none"}. ${response.result.error} Select Install again to review and continue.`,
        );
      else setMessage(`${agentNames[selected.agent]} skills installed`);
      await query.invalidateQueries({ queryKey: ["skills-status"] });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Installation failed.");
      // A renewed preview is never applied until the user explicitly confirms it.
      try {
        setPreview(await getPreview(selected.agent));
      } catch {
        setPreview(null);
      }
    } finally {
      setBusyAgent(null);
    }
  }
  async function install(agent: Agent) {
    if (busy) return;
    setBusyAgent(agent);
    setError("");
    setMessage("");
    try {
      const selected = await getPreview(agent);
      if (selected.requiresConfirmation) setPreview(selected);
      else await apply(selected, false);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Bundle could not be checked.",
      );
    } finally {
      setBusyAgent(null);
    }
  }
  return (
    <section
      className="mt-6 border-t border-line pt-5 space-y-4"
      aria-label="Coding agent skills"
    >
      <h3 className="font-semibold">Coding agent skills</h3>
      <p className="text-sm text-muted">
        Install the complete bundled skill set for either client. Locally edited
        copies require a review before replacement.
      </p>
      <div className="flex flex-wrap gap-3">
        {(["claude", "codex"] as const).map((agent) => (
          <Button
            key={agent}
            variant="secondary"
            disabled={busy || status.isFetching}
            loading={busyAgent === agent}
            onClick={() => void install(agent)}
          >
            {agent === "claude"
              ? "Install Claude skills"
              : "Install Codex skills"}
          </Button>
        ))}
      </div>
      {status.isPending && <p role="status">Checking installed bundles…</p>}
      {(["claude", "codex"] as const).map((agent) => {
        const rows = status.data?.filter((row) => row.agent === agent) ?? [];
        return (
          rows.length > 0 && (
            <div className="text-sm" key={agent}>
              <p>
                {agentNames[agent]}:{" "}
                {
                  rows.filter(
                    (row) =>
                      row.present &&
                      !row.edited &&
                      !row.blocked &&
                      row.installedVersion === row.bundledVersion &&
                      row.installedFormat === row.bundledFormat,
                  ).length
                }
                /{rows.length} bundled copies installed ·{" "}
                {rows[0]?.bundledVersion}
              </p>
              {[
                ...new Set(
                  rows
                    .flatMap((row) => [row.blocked, row.compatibility])
                    .filter((value): value is string => !!value),
                ),
              ].map((problem) => (
                <p className="text-danger" key={problem}>
                  {problem}
                </p>
              ))}
            </div>
          )
        );
      })}
      {message && <p role="status">{message}</p>}
      {(error || status.error) && (
        <p role="alert" className="text-danger">
          {error || status.error?.message}
        </p>
      )}
      <Dialog
        open={preview !== null}
        closeDisabled={busy}
        onClose={() => {
          setPreview(null);
          setError("");
        }}
        title="Review skill bundle"
        description="Review the exact changes to the complete bundle before replacing any edited copies."
        size="lg"
        footer={
          <>
            <Button
              data-dialog-close
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
              loading={busy}
              onClick={() => {
                if (preview) void apply(preview, true);
              }}
            >
              {preview?.requiresConfirmation
                ? "Replace edited bundle"
                : "Install reviewed bundle"}
            </Button>
          </>
        }
      >
        <p className="mb-4">
          {preview ? agentNames[preview.agent] : ""} · {preview?.skills.length}{" "}
          skills
        </p>
        <div className="space-y-5">
          {preview?.skills.map((skill) => (
            <section key={skill.name}>
              <h3 className="font-semibold">{skill.name}</h3>
              <pre className="whitespace-pre-wrap break-words rounded-lg border border-line p-3 text-sm">
                {skill.diff}
              </pre>
            </section>
          ))}
        </div>
        {error && (
          <p role="alert" className="text-danger">
            {error} Review the updated preview before confirming again.
          </p>
        )}
      </Dialog>
    </section>
  );
}
