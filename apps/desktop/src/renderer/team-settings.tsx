"use client";
import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import type { TeamRequest } from "../shared/team.ts";
import { assigneeOptions } from "../shared/team.ts";
import { request, useSnapshot } from "./app.tsx";
import { DraftNavigation, useFormDraft } from "./form-drafts.tsx";
import { Button } from "./ui/button.tsx";
import { Field } from "./ui/field.tsx";
import { Spinner } from "./ui/spinner.tsx";

export function TeamSettings() {
  const snapshot = useSnapshot(),
    query = useQueryClient();
  const draft = useFormDraft("team-member", "", () => ({
    name: "",
    email: "",
    revision: "",
  }));
  const { name, email } = draft.values;
  const setName = (name: string) =>
    draft.set((previous) => ({
      ...previous,
      name,
      revision: previous.revision || snapshot.data?.team.revision || "",
    }));
  const setEmail = (email: string) =>
    draft.set((previous) => ({
      ...previous,
      email,
      revision: previous.revision || snapshot.data?.team.revision || "",
    }));
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [pending, setPending] = useState<TeamRequest | null>(null);
  const entryForm = useRef<HTMLFormElement>(null);
  const team = snapshot.data?.team;
  if (!team) return <Spinner label="Reading Team" />;
  async function save(command: TeamRequest) {
    if (busy) return;
    setPending(command);
    setBusy(true);
    setError("");
    try {
      if (command.command === "team-add") await draft.flush();
      await request(command);
      if (command.command === "team-add") {
        entryForm.current?.reset();
        await draft.submitted();
      }
      await query.invalidateQueries({ queryKey: ["snapshot"] });
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Team could not be saved.",
      );
      await query.invalidateQueries({ queryKey: ["snapshot"] });
    } finally {
      setPending(null);
      setBusy(false);
    }
  }
  const me = pending?.command === "team-me" ? pending.id : team.me;
  return (
    <div className="space-y-5">
      <p className="text-sm text-muted">
        Team stays on this computer. Choose who belongs to each project; saved
        task assignments remain in project files.
      </p>
      <DraftNavigation form={draft} disabled={busy} />
      <form
        inert={busy}
        ref={entryForm}
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          void save({
            command: "team-add",
            name,
            email,
            revision: draft.values.revision || team.revision,
          });
        }}
      >
        <Field label="Member name">
          <input
            className="input"
            value={name}
            maxLength={160}
            required
            disabled={busy}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <Field
          label="Member email"
          hint="Use the name and email from this member's Git identity."
        >
          <input
            className="input"
            type="email"
            value={email}
            maxLength={254}
            required
            disabled={busy}
            onChange={(event) => setEmail(event.target.value)}
          />
        </Field>
        {snapshot.data?.project && (
          <p className="text-sm text-muted">
            New members also join this project. You can change membership below.
          </p>
        )}
        <Button type="submit" variant="primary" loading={busy}>
          Add team member
        </Button>
      </form>
      <Field
        label="Me"
        hint="Used as the default assignee only in projects you belong to."
      >
        <select
          className="input"
          value={me ?? ""}
          disabled={busy}
          onChange={(event) =>
            void save({
              command: "team-me",
              id: event.target.value || null,
              revision: team.revision,
            })
          }
        >
          <option value="">Not selected</option>
          {team.members.map((member) => (
            <option key={member.id} value={member.id}>
              {member.name} · {member.email}
            </option>
          ))}
        </select>
      </Field>
      <section aria-label="Team members" className="space-y-3">
        <h3 className="font-semibold">
          {snapshot.data?.project ? "Members in this project" : "Local members"}
        </h3>
        {!team.members.length && (
          <p className="text-muted">Add a member to assign work.</p>
        )}
        {team.members.map((member) => (
          <div
            className="flex items-center justify-between gap-3 rounded-lg border border-line p-3"
            key={member.id}
          >
            {snapshot.data?.project ? (
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={
                    pending?.command === "team-project-member" &&
                    pending.id === member.id
                      ? pending.enabled
                      : team.projectMembers.includes(member.id)
                  }
                  disabled={busy}
                  onChange={(event) =>
                    void save({
                      command: "team-project-member",
                      id: member.id,
                      enabled: event.target.checked,
                      revision: team.revision,
                    })
                  }
                />
                <span>
                  {member.name} · {member.email}
                  {member.id === me ? " (Me)" : ""}
                </span>
              </label>
            ) : (
              <span>
                {member.name} · {member.email}
              </span>
            )}
            <Button
              variant="ghost"
              disabled={busy}
              aria-label={`Remove ${member.name} from Team`}
              onClick={() =>
                void save({
                  command: "team-remove",
                  id: member.id,
                  revision: team.revision,
                })
              }
            >
              Remove
            </Button>
          </div>
        ))}
      </section>
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export function AssigneeSelect({
  value,
  onChange,
  id,
  disabled,
  "aria-labelledby": labelledBy,
  "aria-describedby": describedBy,
  "aria-invalid": invalid,
}: {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  disabled?: boolean;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
}) {
  const snapshot = useSnapshot(),
    team = snapshot.data?.team;
  return (
    <>
      <select
        className="input"
        id={id}
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        aria-invalid={invalid}
        value={value}
        disabled={disabled || !team}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Unassigned</option>
        {team &&
          assigneeOptions(team, value).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
      </select>
      <Button
        variant="ghost"
        onClick={() => window.dispatchEvent(new Event("voidra-open-team"))}
        disabled={disabled}
      >
        Manage Team
      </Button>
    </>
  );
}
