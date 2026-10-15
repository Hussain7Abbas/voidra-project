"use client";
import type { WorkspaceSnapshot } from "../shared/bridge.ts";
import { request } from "./app.tsx";
import { useCodingClient } from "./coding-client.tsx";
import { Button } from "./ui/button.tsx";
import { useToast } from "./ui/toast.tsx";

export function SyncSuggestion({
  data,
}: {
  data: WorkspaceSnapshot | undefined;
}) {
  const toast = useToast(),
    client = useCodingClient();
  if (!data?.hasVoidra || !data.sync.count) return null;
  async function copy() {
    try {
      await request({
        command: "copy-agent-command",
        agent: client,
        skill: "voidra-sync",
      });
      toast.success("Sync command copied");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  }
  return (
    <section className="card p-4 mb-4" aria-label="Changes outside Voidra">
      <p>
        <strong>Changes outside Voidra</strong>
      </p>
      <p className="text-muted">
        {data.sync.count}{" "}
        {data.sync.count === 1 ? "commit needs" : "commits need"} a look. Run
        Sync in your coding agent to update the profile and suggest follow-up
        work.
      </p>
      <div className="flex flex-wrap gap-2 mt-3">
        <Button variant="secondary" onClick={() => void copy()}>
          Copy {client === "codex" ? "$voidra-sync" : "/voidra-sync"}
        </Button>
      </div>
    </section>
  );
}
