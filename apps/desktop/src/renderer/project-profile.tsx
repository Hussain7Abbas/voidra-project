"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import type { TemplateView } from "../shared/bridge.ts";
import { request } from "./app.tsx";
import { SafeMarkdown } from "./markdown.tsx";
import { Button } from "./ui/button.tsx";
import { Dialog } from "./ui/dialog.tsx";
import { Field } from "./ui/field.tsx";
import { ErrorState, PageHeader } from "./ui/page.tsx";
import { Spinner } from "./ui/spinner.tsx";
import { useToast } from "./ui/toast.tsx";

type Question = TemplateView["blocks"][number]["questions"][number];
type Value = string | string[] | null;
export function useWorkspace(enabled = true) {
  return useQuery({
    queryKey: ["workspace"],
    enabled,
    queryFn: async () => {
      const result = await request({ command: "workspace" });
      if (result.kind !== "workspace")
        throw new Error("Unexpected project response");
      return result.workspace;
    },
  });
}
function editableValue(value: unknown): Value {
  return typeof value === "string" ||
    (Array.isArray(value) && value.every((v) => typeof v === "string"))
    ? value
    : null;
}
function syncValidity(control: HTMLInputElement | HTMLTextAreaElement) {
  control.setAttribute(
    "aria-invalid",
    control.checkValidity() ? "false" : "true",
  );
}
function AnswerControl({
  question,
  value,
  onChange,
  name,
}: {
  question: Question;
  value: Value;
  onChange: (value: Value) => void;
  name: string;
}) {
  const id = useId(),
    choices = question.options ?? [],
    listed = choices.map((o) => o.value);
  const [other, setOther] = useState(
    typeof value === "string" && !listed.includes(value) && !!value,
  );
  if (
    question.type === "single-choice" ||
    question.type === "multiple-choice"
  ) {
    const multiple = question.type === "multiple-choice",
      selected = multiple && Array.isArray(value) ? value : [];
    return (
      <fieldset className="profile-choice" aria-describedby={`${id}-help`}>
        <legend>
          {question.question}
          {question.required ? " (required)" : ""}
        </legend>
        <p id={`${id}-help`} className="field-hint">
          {question.help} {multiple ? "Choose any that apply." : "Choose one."}
        </p>
        <div className="choice-options">
          {choices.map((option) => (
            <label key={option.value}>
              <input
                type={multiple ? "checkbox" : "radio"}
                name={name}
                value={option.value}
                checked={
                  multiple
                    ? selected.includes(option.value)
                    : !other && value === option.value
                }
                required={!multiple && question.required}
                onChange={(e) => {
                  setOther(false);
                  if (multiple) {
                    const next = e.target.checked
                      ? [...selected, option.value]
                      : selected.filter((v) => v !== option.value);
                    onChange(next.length ? next : null);
                  } else onChange(option.value);
                }}
              />
              {option.label}
            </label>
          ))}
          {!multiple && question.allowFreeText && (
            <label>
              <input
                type="radio"
                name={name}
                checked={other}
                onChange={() => {
                  setOther(true);
                  onChange(null);
                }}
              />
              Other
            </label>
          )}
        </div>
        {question.allowFreeText && (multiple || other) && (
          <Field
            label={
              multiple ? "Other choices, one per line" : "Your other answer"
            }
          >
            <textarea
              className="input"
              rows={multiple ? 2 : 1}
              name={`${name}-other`}
              value={
                multiple
                  ? selected.filter((v) => !listed.includes(v)).join("\n")
                  : typeof value === "string"
                    ? value
                    : ""
              }
              required={!multiple && question.required}
              onBlur={(e) => syncValidity(e.currentTarget)}
              onChange={(e) => {
                e.currentTarget.setAttribute("aria-invalid", "false");
                const custom = e.target.value
                  .split("\n")
                  .map((v) => v.trim())
                  .filter(Boolean);
                onChange(
                  multiple
                    ? [...selected.filter((v) => listed.includes(v)), ...custom]
                    : e.target.value || null,
                );
              }}
            />
          </Field>
        )}
      </fieldset>
    );
  }
  const display = Array.isArray(value) ? value.join("\n") : (value ?? "");
  const shared = {
    name,
    required: question.required,
    value: display,
    onBlur: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      syncValidity(e.currentTarget),
    onInvalid: (e: React.FormEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      e.currentTarget.setAttribute("aria-invalid", "true"),
    onChange: (
      e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => {
      e.currentTarget.setAttribute("aria-invalid", "false");
      const next =
        question.type === "list" ? e.target.value.split("\n") : e.target.value;
      onChange(next);
    },
    className: "input",
  };
  return (
    <Field
      label={`${question.question}${question.required ? " (required)" : ""}`}
      hint={question.help}
    >
      {question.type === "short-text" ? (
        <input {...shared} maxLength={2000} />
      ) : (
        <textarea
          {...shared}
          rows={question.type === "list" ? 4 : 5}
          maxLength={20000}
        />
      )}
    </Field>
  );
}
function cleanValue(value: Value): Value {
  if (Array.isArray(value)) {
    const list = [...new Set(value.map((v) => v.trim()).filter(Boolean))];
    return list.length ? list : null;
  }
  return value?.trim() || null;
}
export function ProjectOnboarding({ name }: { name: string }) {
  const workspace = useWorkspace(),
    query = useQueryClient(),
    toast = useToast();
  const [manual, setManual] = useState(false),
    [chosen, setChosen] = useState<string | null>(null),
    [answers, setAnswers] = useState<Record<string, Value>>({}),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  if (workspace.isPending) return <Spinner label="Reading project setup" />;
  if (workspace.isError)
    return (
      <ErrorState
        error={workspace.error}
        onRetry={() => void workspace.refetch()}
      />
    );
  const data = workspace.data,
    template = data.templates.find((t) => t.id === chosen);
  if (data.hasCode && !manual)
    return (
      <>
        <PageHeader
          title="Bring this codebase into Voidra"
          description="Your coding agent can read the project and propose a profile for you to confirm."
        />
        <section className="card action-detail">
          <h2>Start with your agent</h2>
          <p>
            Run the setup command in this folder. It infers answers from code,
            records their sources and leaves them for your review.
          </p>
          {(["claude-code", "codex"] as const).map((agent) => (
            <div className="command-row" key={agent}>
              <code>
                {agent === "claude-code" ? "/voidra-init" : "$voidra-init"}
              </code>
              <Button
                onClick={() =>
                  void request({
                    command: "copy-agent-command",
                    agent,
                    skill: "voidra-init",
                  })
                    .then(() => toast.success("Setup command copied"))
                    .catch((e) => toast.error(e.message))
                }
              >
                {agent === "claude-code"
                  ? "Copy Claude Code setup command"
                  : "Copy Codex setup command"}
              </Button>
            </div>
          ))}
          <p className="text-muted">
            Code found: {data.codeEvidence.join(", ")}
          </p>
          <Button className="mt-6" onClick={() => setManual(true)}>
            Fill in by hand
          </Button>
        </section>
      </>
    );
  return (
    <>
      <PageHeader
        title={template ? "Project profile" : name}
        description={
          template
            ? "Answer what you know. Optional questions can stay open."
            : "Choose a starting profile for your project."
        }
      />
      {data.templateProblems.map((problem) => (
        <p key={problem} role="alert" className="service-notice">
          {problem}
        </p>
      ))}
      {!template ? (
        <section className="template-grid" aria-label="Project templates">
          {data.templates.map((t) => (
            <article className="card action-detail" key={t.id}>
              <h2>{t.title}</h2>
              <p>{t.description}</p>
              <Button
                className="mt-6"
                variant="primary"
                onClick={() => {
                  setChosen(t.id);
                  setError("");
                }}
              >
                Use {t.title}
              </Button>
            </article>
          ))}
          {!data.templates.length && (
            <p>No valid templates are available. Inspect the messages above.</p>
          )}
        </section>
      ) : (
        <form
          className="profile-form space-y-6"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              const values = Object.fromEntries(
                template.blocks.flatMap((b) =>
                  b.questions.map((q) => [
                    `${b.id}.${q.id}`,
                    cleanValue(answers[`${b.id}.${q.id}`] ?? null),
                  ]),
                ),
              );
              const missing = template.blocks
                .flatMap((b) => b.questions)
                .find(
                  (q) =>
                    q.required &&
                    !values[
                      `${template.blocks.find((b) => b.questions.includes(q))?.id}.${q.id}`
                    ],
                );
              if (missing)
                throw new Error(`Please answer: ${missing.question}`);
              await request({
                command: "initialize-profile",
                template: template.id,
                name,
                answers: values,
              });
              await query.invalidateQueries();
              toast.success("Project profile created");
            } catch (e) {
              setError(e instanceof Error ? e.message : "Please try again.");
            } finally {
              setBusy(false);
            }
          }}
        >
          {template.blocks.map((block) => (
            <section className="card action-detail" key={block.id}>
              <h2>{block.title}</h2>
              <p className="text-muted mb-6">{block.help}</p>
              <div className="space-y-6">
                {block.questions.map((question) => (
                  <AnswerControl
                    key={question.id}
                    name={`${block.id}.${question.id}`}
                    question={question}
                    value={answers[`${block.id}.${question.id}`] ?? null}
                    onChange={(value) =>
                      setAnswers((a) => ({
                        ...a,
                        [`${block.id}.${question.id}`]: value,
                      }))
                    }
                  />
                ))}
              </div>
            </section>
          ))}
          {error && (
            <p role="alert" className="text-danger">
              {error}
            </p>
          )}
          <div className="flex gap-3">
            <Button disabled={busy} onClick={() => setChosen(null)}>
              Back to templates
            </Button>
            <Button type="submit" variant="primary" loading={busy}>
              Create planning folder
            </Button>
          </div>
        </form>
      )}
    </>
  );
}
export function ProjectProfile() {
  const workspace = useWorkspace(),
    query = useQueryClient(),
    toast = useToast();
  const [edit, setEdit] = useState<{ block: string; id: string } | null>(null),
    [value, setValue] = useState<Value>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  if (workspace.isPending) return <Spinner label="Reading profile" />;
  if (workspace.isError)
    return (
      <ErrorState
        error={workspace.error}
        onRetry={() => void workspace.refetch()}
      />
    );
  const data = workspace.data,
    template = data.templates.find(
      (t) => t.id === data.template?.id && t.version === data.template.version,
    ),
    current = data.profiles.find((p) => p.data.block === edit?.block),
    answer = current?.data.answers.find((a) => a.id === edit?.id),
    question = template?.blocks
      .find((b) => b.id === edit?.block)
      ?.questions.find((q) => q.id === edit?.id);
  const orderedProfiles = [...data.profiles].sort(
    (a, b) =>
      (template?.blocks.findIndex((block) => block.id === a.data.block) ?? 0) -
      (template?.blocks.findIndex((block) => block.id === b.data.block) ?? 0),
  );
  const knowsAnswer = (block: string, id: string) =>
    template?.blocks
      .find((b) => b.id === block)
      ?.questions.some((q) => q.id === id) ?? false;
  const disabled =
    data.readOnly || data.lock.state !== "none" || data.recoveries.length > 0;
  return (
    <>
      <PageHeader
        title="Profile"
        description="The project's answers, with facts and inferences shown separately."
      />
      {!template && (
        <p className="service-notice">
          This project's template version is not installed. You can read its
          answers; install the matching template before editing.
        </p>
      )}
      {disabled && (
        <p className="service-notice">
          Resolve the planning file or run recovery notice before changing
          answers.
        </p>
      )}
      {orderedProfiles.map((profile) => (
        <section
          className="card action-detail profile-block"
          key={profile.path}
        >
          <h2>{profile.data.title}</h2>
          {profile.body && (
            <SafeMarkdown body={profile.body} source={profile.path} />
          )}
          {profile.data.answers.map((a) => (
            <article key={a.id} className="profile-answer">
              <div className="profile-answer-heading">
                <h3>{a.question}</h3>
                <span className="badge">{a.status}</span>
              </div>
              {Array.isArray(a.answer) ? (
                <ul>
                  {a.answer.map((v) => (
                    <li key={JSON.stringify(v)}>
                      <SafeMarkdown body={String(v)} source={profile.path} />
                    </li>
                  ))}
                </ul>
              ) : typeof a.answer === "string" ? (
                <SafeMarkdown body={a.answer} source={profile.path} />
              ) : (
                <p className="answer-text">
                  {a.answer === null
                    ? "No answer yet"
                    : JSON.stringify(a.answer)}
                </p>
              )}
              {a.source && <p className="text-muted">Source: {a.source}</p>}
              {a.confirmedBy && (
                <p className="text-muted">Confirmed by {a.confirmedBy}</p>
              )}
              <Button
                className="mt-3"
                disabled={disabled || !knowsAnswer(profile.data.block, a.id)}
                onClick={() => {
                  setEdit({ block: profile.data.block, id: a.id });
                  setValue(editableValue(a.answer));
                  setError("");
                }}
              >
                Edit {a.question}
              </Button>
            </article>
          ))}
        </section>
      ))}
      {!data.profiles.length && (
        <section className="card action-detail">
          <h2>No profile blocks yet</h2>
          <p>
            This planning folder was created before onboarding. Its existing
            actions remain available.
          </p>
        </section>
      )}
      <Dialog
        open={!!edit}
        onClose={() => {
          if (!busy) setEdit(null);
        }}
        title="Edit profile answer"
        description={
          answer?.status === "confirmed"
            ? "Changing a confirmed answer creates a draft Profile change for you to review."
            : "Saving an answer confirms it and records who confirmed it."
        }
        footer={
          <>
            <Button disabled={busy} onClick={() => setEdit(null)}>
              Cancel
            </Button>
            <Button
              form="edit-profile"
              type="submit"
              variant="primary"
              loading={busy}
            >
              Save answer
            </Button>
          </>
        }
      >
        {current && answer && question && (
          <form
            id="edit-profile"
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              try {
                await request({
                  command: "edit-profile-answer",
                  block: current.data.block,
                  id: answer.id,
                  value: cleanValue(value),
                  revision: current.revision,
                });
                await query.invalidateQueries();
                setEdit(null);
                toast.success("Profile answer saved");
              } catch (e) {
                setError(e instanceof Error ? e.message : "Please try again.");
              } finally {
                setBusy(false);
              }
            }}
          >
            <AnswerControl
              key={`${current.path}.${answer.id}`}
              name={answer.id}
              question={question}
              value={value}
              onChange={setValue}
            />
            {error && (
              <p role="alert" className="text-danger">
                {error}
              </p>
            )}
          </form>
        )}
      </Dialog>
    </>
  );
}
