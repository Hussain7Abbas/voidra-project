"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  type AiAgentConfiguration,
  aiAgentConfigurationSchema,
  aiEfforts,
} from "../shared/ai.ts";
import type { CodingClient } from "../shared/team.ts";
import { request, useSnapshot } from "./app.tsx";
import { DraftNavigation, draftField, useFormDraft } from "./form-drafts.tsx";
import { Button } from "./ui/button.tsx";
import { Field } from "./ui/field.tsx";

export function AgentAiSettings({
  client,
  onBusyChange,
}: {
  client: CodingClient;
  onBusyChange?: ((busy: boolean) => void) | undefined;
}) {
  const preferences = useQuery({
    queryKey: ["ai-settings", client],
    queryFn: async () => {
      const response = await request({ command: "ai-settings" });
      if (
        response.kind !== "ai-settings" ||
        response.preferences.client !== client
      )
        throw Error("The selected agent changed. Reopen settings.");
      return response.preferences;
    },
  });
  return preferences.data ? (
    <AgentAiFields
      key={client}
      client={client}
      saved={preferences.data}
      onBusyChange={onBusyChange}
    />
  ) : (
    <p role={preferences.error ? "alert" : "status"}>
      {preferences.error?.message ?? "Loading AI preferences…"}
    </p>
  );
}
function AgentAiFields({
  client,
  saved,
  onBusyChange,
}: {
  client: CodingClient;
  saved: AiAgentConfiguration;
  onBusyChange?: ((busy: boolean) => void) | undefined;
}) {
  const query = useQueryClient();
  const form = useFormDraft<{
    model: string;
    effort: AiAgentConfiguration["effort"];
  }>("ai-settings", client, () => ({
    model: saved.model ?? "",
    effort: saved.effort,
  }));
  const [model, setModel] = draftField(form, "model"),
    [effort, setEffort] = draftField(form, "effort");
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const requestId = useRef<string | null>(null);
  useEffect(
    () => () => {
      if (requestId.current)
        void request({ command: "ai-cancel", id: requestId.current });
    },
    [],
  );
  const dirty = model.trim() !== (saved.model ?? "") || effort !== saved.effort;
  useEffect(() => {
    onBusyChange?.(busy || dirty);
    return () => onBusyChange?.(false);
  }, [onBusyChange, busy, dirty]);
  async function save() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const configuration = aiAgentConfigurationSchema.safeParse({
        model: model.trim() || null,
        effort,
      });
      if (!configuration.success)
        throw Error(
          "Enter a valid model ID or alias and choose a supported effort. Model IDs cannot contain spaces or shell expressions.",
        );
      await form.flush();
      await request({
        command: "ai-configure",
        client,
        configuration: configuration.data,
      });
      await query.invalidateQueries();
      await form.submitted();
      await form.fresh({ model: model.trim(), effort });
      setMessage("AI preferences saved");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "AI preferences could not be saved",
      );
    } finally {
      setBusy(false);
    }
  }
  async function test() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      requestId.current = crypto.randomUUID();
      await request({ command: "ai-test", id: requestId.current });
      requestId.current = null;
      setMessage("Agent connection works");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Agent connection failed",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <fieldset className="space-y-3 mt-4" disabled={busy}>
      <legend className="field-label">
        AI suggestions · {client === "codex" ? "Codex" : "Claude Code"}
      </legend>
      <DraftNavigation form={form} disabled={busy} />
      <p className="field-hint">
        Internal prompts use this agent’s signed-in CLI. Review the selected
        text before sending; suggestions remain editable drafts.
      </p>
      <Field
        label="AI model"
        hint="Enter a model ID or alias available to your agent account. Leave blank for the agent’s default model."
      >
        <input
          className="input"
          name="ai-model"
          value={model}
          onChange={(event) => {
            setModel(event.target.value);
            setMessage("");
          }}
          maxLength={200}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          placeholder={
            client === "codex" ? "Agent default" : "e.g. haiku, sonnet, opus"
          }
        />
      </Field>
      <Field
        label="AI effort"
        hint="Higher effort may take longer. Model support depends on your installed agent."
      >
        <select
          className="input"
          name="ai-effort"
          value={effort}
          onChange={(event) => {
            setEffort(event.target.value as AiAgentConfiguration["effort"]);
            setMessage("");
          }}
        >
          {aiEfforts[client].map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button disabled={!dirty} onClick={() => void save()}>
          Save AI preferences
        </Button>
        <Button
          disabled={dirty}
          title="Sends a small test prompt using your saved model and effort"
          onClick={() => void test()}
        >
          Test agent connection
        </Button>
      </div>
      {dirty && (
        <p className="field-hint">
          Save your AI preferences to use these choices.
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
    </fieldset>
  );
}
export function AiSettingsPanel({ active }: { active: boolean }) {
  const snapshot = useSnapshot();
  return active ? (
    <AgentAiSettings client={snapshot.data?.defaultClient ?? "codex"} />
  ) : null;
}
