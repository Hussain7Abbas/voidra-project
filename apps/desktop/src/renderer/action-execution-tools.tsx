import type { WorkspaceSnapshot } from "../shared/bridge.ts";
import { request } from "./app.tsx";
import { useCodingClient } from "./coding-client.tsx";
import { PlanningCommit } from "./planning-commit.tsx";
import { RunQueue } from "./run-queue.tsx";
import { Button } from "./ui/button.tsx";
import { useToast } from "./ui/toast.tsx";

export function ActionExecutionTools({
  data,
  editable,
}: {
  data: WorkspaceSnapshot;
  editable: boolean;
}) {
  const client = useCodingClient(),
    toast = useToast();
  return (
    <details className="sequence-notice">
      <summary>Execution options</summary>
      <section aria-label="Agent status">
        <p role="status">{data.lock.message}</p>
      </section>
      {data.recoveries.length > 0 && (
        <section aria-label="Actions recovery">
          {data.recoveries.map((item) => (
            <div key={`${item.kind}:${item.id}`}>
              <p>{item.message}</p>
              <code>{item.id}</code>
              <Button
                disabled={!item.recoverable}
                onClick={() => {
                  void request({
                    command: "copy-recovery-command",
                    open: true,
                    agent: client,
                    kind: item.kind,
                    id: item.id,
                  })
                    .then(() =>
                      toast.success(
                        "Recovery command copied · coding client opened",
                      ),
                    )
                    .catch((cause) => toast.error(String(cause)));
                }}
              >
                {item.kind === "run" ? "Recover run" : "Recover write"}
              </Button>
            </div>
          ))}
        </section>
      )}
      <RunQueue
        data={data}
        editable={editable && !data.planning.pending.length}
      />
      <PlanningCommit data={data} />
    </details>
  );
}
