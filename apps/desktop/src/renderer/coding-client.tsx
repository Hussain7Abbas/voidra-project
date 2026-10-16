"use client";
import { useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import type { CodingClient } from "../shared/team.ts";
import { request, useSnapshot } from "./app.tsx";

export function useCodingClient(): CodingClient {
  return useSnapshot().data?.defaultClient ?? "codex";
}
export function CodingClientSetting() {
  const snapshot = useSnapshot(),
    query = useQueryClient(),
    id = useId();
  const [pending, setPending] = useState<CodingClient | null>(null),
    [error, setError] = useState("");
  const value = pending ?? snapshot.data?.defaultClient ?? "codex";
  async function change(client: CodingClient) {
    if (pending) return;
    setPending(client);
    setError("");
    try {
      await request({ command: "set-coding-client", client });
      await query.invalidateQueries({ queryKey: ["snapshot"] });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Coding client could not be saved.",
      );
    } finally {
      setPending(null);
    }
  }
  return (
    <fieldset
      className="space-y-3"
      disabled={!!pending || !snapshot.data}
      aria-describedby={`${id}-hint`}
    >
      <legend className="field-label">Default coding AI client</legend>
      <div className="segmented-switch">
        {(["claude-code", "codex"] as const).map((client) => (
          <label key={client} className="segmented-option">
            <input
              className="segmented-input"
              type="radio"
              name={`${id}-client`}
              value={client}
              checked={value === client}
              onChange={() => void change(client)}
            />
            <span>{client === "codex" ? "Codex" : "Claude Code"}</span>
          </label>
        ))}
      </div>
      <p id={`${id}-hint`} className="field-hint">
        Commands and internal AI prompts use this client. Running work keeps its
        recorded client.
      </p>
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
    </fieldset>
  );
}
