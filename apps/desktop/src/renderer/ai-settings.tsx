"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { request } from "./app.tsx";
import { SecretDraftNavigation, useSecretDraft } from "./secret-drafts.tsx";
import { Button } from "./ui/button.tsx";
import { Field } from "./ui/field.tsx";

export function AiSettingsPanel() {
  const draft = useSecretDraft();
  const key = draft.value,
    setKey = draft.change;
  const query = useQueryClient(),
    [active, setActive] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const preferences = useQuery({
    queryKey: ["ai-settings"],
    enabled: active,
    queryFn: async () => {
      const value = await request({ command: "ai-settings" });
      if (value.kind !== "ai-settings")
        throw new Error("AI settings are unavailable");
      return value.preferences;
    },
  });
  const models = useQuery({
    queryKey: ["ai-models"],
    enabled: active && !!preferences.data?.configured,
    queryFn: async () => {
      const value = await request({ command: "ai-models" });
      if (value.kind !== "ai-models") throw new Error("Models are unavailable");
      return value.models;
    },
  });
  async function perform(
    command: Parameters<typeof request>[0],
    success: string,
  ) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (command.command === "ai-set-key") await draft.apply();
      else await request(command);
      setMessage(success);
      await query.invalidateQueries();
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <details
      className="mt-6 border-t border-line pt-4"
      onToggle={(event) => setActive(event.currentTarget.open)}
    >
      <summary className="cursor-pointer font-semibold">
        AI suggestions (optional)
      </summary>
      {active && (
        <div className="space-y-4 mt-4">
          <p className="text-muted">
            Connect your OpenRouter key and choose a model. Suggestions are
            drafts you review and edit. Your saved key stays encrypted on this
            Mac.
          </p>
          <p>{preferences.data?.configured ? "Key saved" : "No key saved"}</p>
          <SecretDraftNavigation draft={draft} disabled={busy} />
          <Field
            label="OpenRouter API key"
            hint="Saved keys are never shown here."
          >
            <input
              className="input"
              type="password"
              autoComplete="new-password"
              value={key}
              maxLength={4096}
              onChange={(event) => setKey(event.target.value)}
              disabled={busy}
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={
                busy || !draft.canApply || preferences.data?.available === false
              }
              onClick={() =>
                void perform(
                  { command: "ai-set-key", key },
                  "Key saved securely",
                )
              }
            >
              Save key
            </Button>
            <Button
              disabled={busy}
              onClick={() =>
                void perform({ command: "ai-remove-key" }, "Key removed")
              }
            >
              Remove key
            </Button>
            <Button
              disabled={busy || !preferences.data?.configured}
              onClick={() =>
                void perform({ command: "ai-test" }, "Connection works")
              }
            >
              Test connection
            </Button>
          </div>
          {preferences.data?.available === false && (
            <p role="alert">
              Secure Keychain storage is unavailable. Your key cannot be saved
              right now.
            </p>
          )}
          {preferences.data?.configured && (
            <Field
              label="AI model"
              hint="Choose the model used for your suggestions."
            >
              <select
                className="input"
                value={preferences.data.model ?? ""}
                disabled={busy || models.isPending}
                onChange={(event) =>
                  void perform(
                    { command: "ai-set-model", model: event.target.value },
                    "Model saved",
                  )
                }
              >
                <option value="" disabled>
                  Choose a model
                </option>
                {models.data?.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name} · {model.id}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {message && <p role="status">{message}</p>}
          {(error || preferences.error || models.error) && (
            <p role="alert">
              {error || preferences.error?.message || models.error?.message}
            </p>
          )}
        </div>
      )}
    </details>
  );
}
