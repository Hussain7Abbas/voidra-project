"use client";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  Check,
  Code2,
  Download,
  Layers,
  Monitor,
  Moon,
  Sun,
  Terminal,
} from "lucide-react";
import { useState } from "react";
import type { Snapshot, ThemePreference } from "../shared/bridge.ts";
import { installedSkillCount, skillBundleInstalled } from "../shared/skills.ts";
import type { CodingClient } from "../shared/team.ts";
import { request } from "./app.tsx";
import { SkillSettingsPanel, useSkillStatus } from "./skill-settings.tsx";
import { Button } from "./ui/button.tsx";

const themes = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;
const clients = [
  { value: "codex", label: "Codex", icon: Terminal },
  { value: "claude-code", label: "Claude Code", icon: Code2 },
] as const;

export function AppOnboarding({ data }: { data: Snapshot }) {
  const query = useQueryClient(),
    status = useSkillStatus();
  const [saving, setSaving] = useState(false),
    [installing, setInstalling] = useState(false),
    [error, setError] = useState("");
  const [pendingChoice, setPendingChoice] = useState<{
    theme: ThemePreference;
    client: CodingClient;
  } | null>(null);
  const selectedTheme = pendingChoice?.theme ?? data.theme;
  const selectedClient = pendingChoice?.client ?? data.defaultClient;
  const agent = selectedClient === "codex" ? "codex" : "claude";
  const rows = status.data?.filter((row) => row.agent === agent) ?? [];
  const ready =
    !status.isFetching && !status.error && skillBundleInstalled(rows);
  const busy = saving || installing;
  async function change(
    input:
      | { command: "set-theme"; theme: ThemePreference }
      | { command: "set-coding-client"; client: CodingClient },
  ) {
    if (busy) return;
    setSaving(true);
    setPendingChoice({
      theme: input.command === "set-theme" ? input.theme : data.theme,
      client:
        input.command === "set-coding-client"
          ? input.client
          : data.defaultClient,
    });
    setError("");
    try {
      await request(input);
      await query.invalidateQueries({ queryKey: ["snapshot"] });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Your choice could not be saved. Try again.",
      );
    } finally {
      setPendingChoice(null);
      setSaving(false);
    }
  }
  async function finish() {
    if (busy || !ready) return;
    setSaving(true);
    setError("");
    try {
      await request({
        command: "complete-setup",
        client: data.defaultClient,
        theme: data.theme,
      });
      await query.invalidateQueries();
      requestAnimationFrame(() => document.getElementById("main")?.focus());
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Setup could not be completed. Try again.",
      );
      await query.invalidateQueries({ queryKey: ["skills-status"] });
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="app-onboarding">
      <header className="setup-heading">
        <span className="setup-brand">
          <Layers size={22} aria-hidden /> Voidra{" "}
          <span className="setup-brand-subtitle">PROJECT</span>
        </span>
        <p className="eyebrow">YOUR AGENTIC WORKSPACE</p>
        <h1>Make Voidra yours.</h1>
        <p>A little setup, then you’re ready to plan, build and ship.</p>
      </header>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void finish();
        }}
      >
        <div className="setup-sections">
          <section className="setup-section" aria-labelledby="setup-appearance">
            <div className="setup-step" aria-hidden>
              01
            </div>
            <div className="setup-section-body">
              <h2 id="setup-appearance">Choose your appearance</h2>
              <p id="setup-theme-hint">
                Pick a theme. System follows your device.
              </p>
              <fieldset disabled={busy} aria-describedby="setup-theme-hint">
                <legend className="sr-only">Theme</legend>
                <div className="setup-theme-options">
                  {themes.map(({ value, label, icon: Icon }) => (
                    <label key={value} className="setup-choice">
                      <input
                        type="radio"
                        name="setup-theme"
                        value={value}
                        checked={selectedTheme === value}
                        onChange={() =>
                          void change({ command: "set-theme", theme: value })
                        }
                      />
                      <span
                        className="setup-theme-preview"
                        data-preview={value}
                        aria-hidden
                      >
                        <span className="setup-preview-nav" />
                        <span className="setup-preview-content">
                          <i />
                          <i />
                          <i />
                        </span>
                      </span>
                      <span className="setup-choice-label">
                        <Icon size={16} aria-hidden />
                        {label}
                        <Check
                          className="setup-choice-check"
                          size={16}
                          aria-hidden
                        />
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>
          </section>
          <section className="setup-section" aria-labelledby="setup-agent">
            <div className="setup-step" aria-hidden>
              02
            </div>
            <div className="setup-section-body">
              <h2 id="setup-agent">Choose your coding agent</h2>
              <p id="setup-agent-hint">
                Voidra will open this agent when your work is ready.
              </p>
              <fieldset disabled={busy} aria-describedby="setup-agent-hint">
                <legend className="sr-only">Coding agent</legend>
                <div className="setup-client-options">
                  {clients.map(({ value, label, icon: Icon }) => (
                    <label
                      key={value}
                      className="setup-choice setup-client-choice"
                    >
                      <input
                        type="radio"
                        name="setup-client"
                        value={value}
                        checked={selectedClient === value}
                        onChange={() =>
                          void change({
                            command: "set-coding-client",
                            client: value,
                          })
                        }
                      />
                      <span className="setup-choice-label">
                        <Icon size={20} aria-hidden />
                        {label}
                        <Check
                          className="setup-choice-check"
                          size={16}
                          aria-hidden
                        />
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>
          </section>
          <section className="setup-section" aria-labelledby="setup-skills">
            <div className="setup-step" aria-hidden>
              {ready ? <Check size={17} /> : "03"}
            </div>
            <div className="setup-section-body">
              <h2 id="setup-skills">
                Connect {agent === "codex" ? "Codex" : "Claude Code"} to Voidra
              </h2>
              <p>
                Install the skills for planning, implementation and review.
                Bundled with the app, ready offline.
              </p>
              <fieldset disabled={saving}>
                <legend className="sr-only">
                  Install selected agent skills
                </legend>
                <SkillSettingsPanel
                  key={agent}
                  agent={agent}
                  onBusyChange={setInstalling}
                />
              </fieldset>
              <p className="setup-install-summary" role="status">
                {ready ? (
                  <Check size={15} aria-hidden />
                ) : (
                  <Download size={15} aria-hidden />
                )}
                {ready
                  ? `All ${rows.length} skills are ready.`
                  : `${installedSkillCount(rows)} of ${rows.length || "…"} skills installed for your selected agent.`}
              </p>
            </div>
          </section>
        </div>
        {error && (
          <p role="alert" className="setup-error text-danger">
            {error}
          </p>
        )}
        <footer className="setup-footer">
          <p id="setup-continue-hint">
            {ready
              ? "You can change these choices later in Settings."
              : "Install your agent’s skills to continue. Your choices are saved automatically."}
          </p>
          <Button
            type="submit"
            variant="primary"
            disabled={busy || !ready}
            loading={saving}
            aria-describedby="setup-continue-hint"
            icon={<ArrowRight size={17} aria-hidden />}
          >
            Continue to Voidra
          </Button>
        </footer>
      </form>
    </div>
  );
}
