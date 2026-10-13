"use client";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { QuestionView, WorkspaceSnapshot } from "../shared/bridge.ts";
import { request } from "./app.tsx";
import { Button } from "./ui/button.tsx";
import { Dialog } from "./ui/dialog.tsx";
import { Field } from "./ui/field.tsx";
import { useToast } from "./ui/toast.tsx";

type ActionView = WorkspaceSnapshot["actions"][number];
function QuestionCard({
  question,
  revision,
  action,
  disabled,
}: {
  question: QuestionView;
  revision: string;
  action: string;
  disabled: boolean;
}) {
  const query = useQueryClient(),
    ref = useRef<HTMLElement>(null);
  const [choice, setChoice] = useState(""),
    [text, setText] = useState(""),
    [captured, setCaptured] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [reloadRevision, setReloadRevision] = useState<string | null>(null);
  useEffect(() => {
    if (
      reloadRevision &&
      (revision === reloadRevision || revision !== captured)
    ) {
      setCaptured(null);
      setChoice("");
      setText("");
      setError("");
      setReloadRevision(null);
      setBusy(false);
    }
  }, [reloadRevision, revision, captured]);
  const answer = question.answer;
  return (
    <article
      className="profile-answer"
      ref={ref}
      tabIndex={-1}
      data-question-id={question.id}
    >
      <h3>{question.text}</h3>
      <p className="text-muted">Why: {question.why}</p>
      {answer ? (
        <div className="mt-3">
          <p>
            Answer:{" "}
            {answer.kind === "choice"
              ? answer.choice
              : answer.kind === "text"
                ? answer.text
                : "Let the agent decide"}
          </p>
          <p className="text-muted">
            Saved by {answer.by} · {new Date(answer.at).toLocaleString()}
          </p>
          {question.agentChoice ? (
            <aside
              className="service-notice"
              aria-label={`Assumption for ${question.text}`}
            >
              <h4>Assumption · {question.id}</h4>
              <p>{question.agentChoice.choice}</p>
              <p>{question.agentChoice.reason}</p>
              <p>
                Chosen by {question.agentChoice.by} ·{" "}
                {new Date(question.agentChoice.at).toLocaleString()}
              </p>
            </aside>
          ) : (
            answer.kind === "agent-decides" && (
              <p className="text-muted">
                The next agent run will record its choice and reason here.
              </p>
            )
          )}
        </div>
      ) : (
        <form
          className="mt-4 space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              await request({
                command: "answer-question",
                id: action,
                question: question.id,
                revision: captured ?? revision,
                answer:
                  choice === "delegate"
                    ? { kind: "agent-decides" }
                    : choice === "text"
                      ? { kind: "text", text: text.trim() }
                      : { kind: "choice", choice: choice.slice(7) },
              });
              await query.invalidateQueries();
              ref.current?.focus();
            } catch (e) {
              setError(e instanceof Error ? e.message : "Please try again.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <fieldset disabled={disabled || busy}>
            <legend>Choose an answer</legend>
            <div className="space-y-3 mt-3">
              {question.options.map((o) => (
                <label key={o.label} className="flex gap-3">
                  <input
                    type="radio"
                    name={question.id}
                    value={`choice:${o.label}`}
                    checked={choice === `choice:${o.label}`}
                    required
                    onChange={(e) => {
                      setChoice(e.target.value);
                      setCaptured(captured ?? revision);
                    }}
                  />
                  <span>
                    <strong>
                      {o.label}
                      {o.recommended ? " · Recommended" : ""}
                    </strong>
                    <br />
                    {o.description}
                  </span>
                </label>
              ))}
              {question.allowFreeText && (
                <label className="flex gap-3">
                  <input
                    type="radio"
                    name={question.id}
                    checked={choice === "text"}
                    required
                    onChange={() => {
                      setChoice("text");
                      setCaptured(captured ?? revision);
                    }}
                  />
                  Write my own answer
                </label>
              )}
              <label className="flex gap-3">
                <input
                  type="radio"
                  name={question.id}
                  checked={choice === "delegate"}
                  required
                  onChange={() => {
                    setChoice("delegate");
                    setCaptured(captured ?? revision);
                  }}
                />
                Let the agent decide
              </label>
            </div>
          </fieldset>
          {choice === "text" && (
            <Field label="Your answer">
              <textarea
                className="input"
                rows={4}
                required
                maxLength={20000}
                disabled={disabled || busy}
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            </Field>
          )}
          {error && (
            <div role="alert">
              <p className="text-danger">{error}</p>
              <Button
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await query.cancelQueries({ queryKey: ["workspace"] });
                    const response = await request({ command: "workspace" });
                    if (response.kind !== "workspace")
                      throw new Error("Project response unavailable");
                    const current = response.workspace.actions.find(
                      (a) => a.data.id === action,
                    )?.questions;
                    query.setQueryData(["workspace"], response.workspace);
                    if (!current)
                      throw new Error(
                        "The questions were removed; return to the action list",
                      );
                    setReloadRevision(current.revision);
                  } catch (e) {
                    setError(
                      e instanceof Error ? e.message : "Please try again.",
                    );
                    setBusy(false);
                  }
                }}
              >
                Reload question
              </Button>
            </div>
          )}
          <Button
            type="submit"
            variant="primary"
            loading={busy}
            disabled={
              disabled || !choice || (choice === "text" && !text.trim())
            }
          >
            Save answer
          </Button>
        </form>
      )}
    </article>
  );
}
export function ActionQuestions({
  action,
  disabled,
}: {
  action: ActionView;
  disabled: boolean;
}) {
  if (!action.questions) return null;
  return (
    <section className="card action-detail" aria-label="Question rounds">
      <h2>Questions</h2>
      <p>
        Your answers save one at a time. When the round is complete, queue the
        action to continue.
      </p>
      {action.questions.rounds.map((round) => (
        <section key={round.round} aria-label={`Question round ${round.round}`}>
          <h3 className="mt-6">Round {round.round}</h3>
          {round.questions.map((q) => (
            <QuestionCard
              key={q.id}
              question={q}
              revision={action.questions?.revision ?? ""}
              action={action.data.id}
              disabled={disabled}
            />
          ))}
        </section>
      ))}
    </section>
  );
}
export function PlanGate({
  action,
  disabled,
}: {
  action: ActionView;
  disabled: boolean;
}) {
  const query = useQueryClient(),
    toast = useToast(),
    [busy, setBusy] = useState(false),
    [reject, setReject] = useState(false),
    [feedback, setFeedback] = useState(""),
    [captured, setCaptured] = useState(""),
    [error, setError] = useState("");
  const unresolved = action.questions?.rounds.some((r) =>
    r.questions.some(
      (q) => !q.answer || (q.answer.kind === "agent-decides" && !q.agentChoice),
    ),
  );
  if (
    ["done", "released", "cancelled"].includes(action.data.stage ?? "") &&
    action.changedPlans.length
  )
    return (
      <section className="card action-detail" aria-label="Plan history">
        <h2>Finished plan changed</h2>
        <p>
          Ask your agent to restore the original plan files. Request scope
          changes through a new action after the history is repaired.
        </p>
        <p>Changed files: {action.changedPlans.join(", ")}</p>
      </section>
    );
  if (
    action.effectiveStage !== "plan" ||
    action.data.type === "release" ||
    action.data.doneBy !== "agent" ||
    (!action.changedPlans.length && action.data.status !== "waiting")
  )
    return null;
  return (
    <section className="card action-detail" aria-label="Plan approval">
      <h2>Approve the plan</h2>
      <p>
        Review the goal and out-of-scope work, testing seams, proposed ADRs and
        acceptance criteria below. Approval covers the current contents of all
        three files.
      </p>
      {action.changedPlans.length > 0 && (
        <p role="status" className="service-notice">
          Approval expired. Changed files: {action.changedPlans.join(", ")}.
          Approve the revised plan before further work.
        </p>
      )}
      {!action.planRevision && (
        <p role="alert" className="text-danger">
          All three valid plan files are required before approval.
        </p>
      )}
      {unresolved && (
        <p>
          Complete the questions and let the agent resolve delegated choices
          before approving.
        </p>
      )}
      <div className="flex gap-3 mt-4">
        <Button
          variant="primary"
          disabled={disabled || busy || !action.planRevision || !!unresolved}
          onClick={async () => {
            if (!action.planRevision) return;
            setBusy(true);
            try {
              await request({
                command: "approve-plan",
                id: action.data.id,
                revision: action.planRevision,
              });
              await query.invalidateQueries();
              toast.success("Plan approved");
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Please try again.");
              void query.invalidateQueries();
            } finally {
              setBusy(false);
            }
          }}
        >
          Approve plan
        </Button>
        <Button
          disabled={disabled || busy || !action.planRevision || !!unresolved}
          onClick={() => {
            setCaptured(action.planRevision ?? "");
            setReject(true);
            setError("");
          }}
        >
          Request changes
        </Button>
      </div>
      <Dialog
        open={reject}
        closeDisabled={busy}
        onClose={() => setReject(false)}
        title="Request plan changes"
        description="The agent will read your feedback and revise the plan."
        footer={
          <>
            <Button disabled={busy} onClick={() => setReject(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="reject-plan"
              variant="primary"
              loading={busy}
            >
              Send back to Plan
            </Button>
          </>
        }
      >
        <form
          id="reject-plan"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              await request({
                command: "reject-plan",
                id: action.data.id,
                revision: captured,
                feedback,
              });
              await query.invalidateQueries();
              setReject(false);
              setFeedback("");
              toast.success("Plan changes requested");
            } catch (e) {
              setError(e instanceof Error ? e.message : "Please try again.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label="Feedback">
            <textarea
              className="input"
              required
              rows={5}
              maxLength={20000}
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
            />
          </Field>
          {error && (
            <p role="alert" className="text-danger">
              {error}
            </p>
          )}
        </form>
      </Dialog>
    </section>
  );
}
