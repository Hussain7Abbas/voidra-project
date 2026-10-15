"use client";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { WorkspaceSnapshot } from "../shared/bridge.ts";
import { request } from "./app.tsx";
import { type InboxKind, inboxItems } from "./inbox.ts";
import { SafeMarkdown } from "./markdown.tsx";
import { InlineMarkdown } from "./markdown-content.tsx";
import { Button } from "./ui/button.tsx";
import { PageHeader } from "./ui/page.tsx";
import { useToast } from "./ui/toast.tsx";

const labels: Record<InboxKind, string> = {
  questions: "Questions",
  plans: "Plans to approve",
  reviews: "Results to review",
  human: "Your tasks",
  inferred: "Inferred profile answers",
};
export function ProjectInbox({
  workspace,
  onSelect,
  compact = false,
}: {
  compact?: boolean;
  workspace: WorkspaceSnapshot;
  onSelect: (id: string) => void;
}) {
  const query = useQueryClient(),
    toast = useToast(),
    [busy, setBusy] = useState(false);
  const items = inboxItems(workspace),
    disabled =
      workspace.readOnly ||
      workspace.lock.state !== "none" ||
      !!workspace.recoveries.length;
  return (
    <>
      {!compact && (
        <PageHeader
          title="Waiting for you"
          description={`${items.length} ${items.length === 1 ? "item needs" : "items need"} your attention. Use Tab to move between items and Enter to open or confirm.`}
        />
      )}
      {!!workspace.diagnostics.length && (
        <section
          className="service-notice"
          aria-label={
            compact
              ? "Waiting planning file problems"
              : "Planning file problems"
          }
        >
          <h2>Planning files need attention</h2>
          <ul>
            {workspace.diagnostics.map((d) => (
              <li key={`${d.file}:${d.code}:${d.field}`}>
                <p>
                  {d.file}: {d.message}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
      {!items.length && (
        <section className="card action-detail">
          <h2>You’re all caught up</h2>
          <p>
            New questions, plans and results will appear here as your agent
            works.
          </p>
        </section>
      )}
      {(Object.keys(labels) as InboxKind[]).map((kind) => {
        const group = items.filter((i) => i.kind === kind);
        if (!group.length) return null;
        return (
          <section
            className="card action-detail"
            key={kind}
            aria-label={labels[kind]}
          >
            <h2>
              {labels[kind]} · {group.length}
            </h2>
            <ul className="profile-inferences">
              {group.map((item) => {
                if (kind !== "inferred")
                  return (
                    <li key={item.id}>
                      <Button
                        aria-label={
                          compact && kind !== "questions"
                            ? `Open ${labels[kind]}: ${item.title}`
                            : undefined
                        }
                        variant="ghost"
                        onClick={() => item.action && onSelect(item.action)}
                      >
                        {kind === "questions" ? (
                          <InlineMarkdown body={item.title} />
                        ) : (
                          item.title
                        )}
                      </Button>
                      <p className="text-muted">
                        {
                          workspace.actions.find(
                            (a) => a.data.id === item.action,
                          )?.data.title
                        }{" "}
                        · {item.action}
                      </p>
                    </li>
                  );
                const profile = workspace.profiles.find(
                    (p) => p.data.block === item.block,
                  ),
                  answer = profile?.data.answers.find(
                    (a) => a.id === item.answer,
                  ),
                  template = workspace.templates.find(
                    (t) =>
                      t.id === workspace.template?.id &&
                      t.version === workspace.template.version,
                  );
                if (!profile || !answer) return null;
                const known = template?.blocks
                  .find((b) => b.id === profile.data.block)
                  ?.questions.some((q) => q.id === answer.id);
                return (
                  <li key={item.id}>
                    <SafeMarkdown body={answer.question} />
                    <SafeMarkdown
                      body={
                        Array.isArray(answer.answer)
                          ? answer.answer.join(", ")
                          : String(answer.answer ?? "No answer inferred yet")
                      }
                    />
                    <p className="text-muted">
                      Source: {answer.source ?? "No source recorded"}
                    </p>
                    <Button
                      disabled={
                        disabled || busy || answer.answer === null || !known
                      }
                      onClick={async () => {
                        setBusy(true);
                        try {
                          await request({
                            command: "edit-profile-answer",
                            block: profile.data.block,
                            id: answer.id,
                            value: answer.answer,
                            revision: profile.revision,
                          });
                          await query.invalidateQueries();
                          toast.success("Answer confirmed");
                        } catch (e) {
                          toast.error(
                            e instanceof Error
                              ? e.message
                              : "Please try again.",
                          );
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Confirm {answer.question}
                    </Button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </>
  );
}
