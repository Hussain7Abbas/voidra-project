import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { access, mkdtemp, readdir, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import type { AiPreferences } from "../shared/ai.ts";
import type { CodingClient } from "../shared/team.ts";
import type { ChatMessage } from "./ai-prompts.ts";

export interface CompletionInput {
  preferences: AiPreferences;
  messages: ChatMessage[];
  signal: AbortSignal;
  onText: (part: string) => void;
}
export interface AgentClient {
  complete(input: CompletionInput): Promise<string>;
}
const label = (client: CodingClient) =>
  client === "codex" ? "Codex" : "Claude Code";
export class HeadlessAgentClient implements AgentClient {
  private options: {
    executables?: Partial<Record<CodingClient, string | undefined>> | undefined;
    timeout?: number;
    maxBytes?: number;
  };
  constructor(
    options: {
      executables?:
        | Partial<Record<CodingClient, string | undefined>>
        | undefined;
      timeout?: number;
      maxBytes?: number;
    } = {},
  ) {
    this.options = options;
  }
  private async executable(client: CodingClient): Promise<string> {
    const override = this.options.executables?.[client];
    if (override) return override;
    const name = client === "codex" ? "codex" : "claude";
    const nvm = join(homedir(), ".nvm/versions/node");
    const versions = await readdir(nvm).catch(() => [] as string[]);
    const folders = [
      ...(process.env.PATH ?? "").split(delimiter),
      join(homedir(), ".local/bin"),
      join(homedir(), ".bun/bin"),
      "/opt/homebrew/bin",
      "/usr/local/bin",
      ...versions
        .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
        .map((version) => join(nvm, version, "bin")),
    ];
    for (const folder of folders.filter(Boolean)) {
      const path = join(folder, name);
      if (
        await access(path, constants.X_OK).then(
          () => true,
          () => false,
        )
      )
        return path;
    }
    throw Error(
      `Install ${label(client)} CLI and sign in before using AI suggestions.`,
    );
  }
  async complete({
    preferences,
    messages,
    signal,
    onText,
  }: CompletionInput): Promise<string> {
    if (signal.aborted) throw Error("AI request cancelled");
    const executable = await this.executable(preferences.client);
    const directory = await mkdtemp(join(tmpdir(), "voidra-ai-"));
    try {
      const codex = preferences.client === "codex";
      const policy =
        messages
          .filter((message) => message.role === "system")
          .map((message) => message.content)
          .join("\n") +
        " Return only the requested JSON. Do not use tools, read files, browse, or perform any actions.";
      const args = codex
        ? [
            "exec",
            "--ignore-user-config",
            "--strict-config",
            "--ignore-rules",
            "--ephemeral",
            "--skip-git-repo-check",
            "--sandbox",
            "read-only",
            "--json",
            "--color",
            "never",
            "-c",
            'approval_policy="never"',
            "-c",
            "project_doc_max_bytes=0",
            "-c",
            "suppress_unstable_features_warning=true",
            "-c",
            'web_search="disabled"',
            "-c",
            "mcp_servers={}",
            ...[
              "shell_tool",
              "view_image",
              "browser_use",
              "browser_use_external",
              "browser_use_full_cdp_access",
              "computer_use",
              "image_generation",
              "in_app_browser",
              "code_mode",
              "code_mode_host",
              "apps",
              "hooks",
              "plugins",
              "remote_plugin",
              "multi_agent",
              "memories",
              "shell_snapshot",
            ].flatMap((feature) => ["--disable", feature]),
            "--enable",
            "skip_host_skill_discovery",
            "-c",
            `developer_instructions=${JSON.stringify(policy)}`,
            "-c",
            `model_reasoning_effort=${JSON.stringify(preferences.effort)}`,
            ...(preferences.model ? ["--model", preferences.model] : []),
            "-",
          ]
        : [
            "--print",
            "--safe-mode",
            "--tools",
            "",
            "--strict-mcp-config",
            "--mcp-config",
            '{"mcpServers":{}}',
            "--setting-sources",
            "",
            "--settings",
            '{"disableAllHooks":true}',
            "--no-session-persistence",
            "--output-format",
            "json",
            "--permission-mode",
            "dontAsk",
            "--effort",
            preferences.effort,
            "--system-prompt",
            policy,
            ...(preferences.model ? ["--model", preferences.model] : []),
          ];
      const env: NodeJS.ProcessEnv = {
        ...process.env,
        PATH: `${dirname(executable)}${delimiter}${process.env.PATH ?? "/usr/bin:/bin"}`,
      };
      // Electron's own runtime and inherited agent sessions must not change child CLI semantics.
      for (const key of [
        "ELECTRON_RUN_AS_NODE",
        "NODE_V8_COVERAGE",
        "NODE_OPTIONS",
        "CLAUDECODE",
        "CLAUDE_CODE_ENTRYPOINT",
        "CODEX_THREAD_ID",
      ])
        delete env[key];
      const input = messages
        .filter((message) => message.role === "user")
        .map((message) => message.content)
        .join("\n\n");
      const output = await new Promise<string>((resolve, reject) => {
        const child = spawn(executable, args, {
          cwd: directory,
          env,
          shell: false,
          detached: process.platform !== "win32",
          windowsHide: true,
          stdio: ["pipe", "pipe", "pipe"],
        });
        let stdout = "",
          bytes = 0,
          failure: Error | null = null;
        let force: ReturnType<typeof setTimeout> | undefined;
        const kill = (signal: NodeJS.Signals) => {
          try {
            if (process.platform !== "win32" && child.pid)
              process.kill(-child.pid, signal);
            else child.kill(signal);
          } catch {
            /* Already exited. */
          }
        };
        const stop = (message: string) => {
          if (failure) return;
          failure = Error(message);
          kill("SIGTERM");
          force = setTimeout(() => kill("SIGKILL"), 500);
        };
        const abort = () => stop("AI request cancelled");
        const timer = setTimeout(
          () =>
            stop(
              "AI request timed out. Try a lower effort or a smaller prompt.",
            ),
          this.options.timeout ?? 120_000,
        );
        signal.addEventListener("abort", abort, { once: true });
        if (signal.aborted) abort();
        child.stdout.setEncoding("utf8");
        child.stdout.on("data", (part: string) => {
          bytes += Buffer.byteLength(part);
          if (bytes > (this.options.maxBytes ?? 1_000_000))
            stop("AI returned too much output; your form is unchanged");
          else stdout += part;
        });
        child.stderr.on("data", (part: Buffer) => {
          bytes += part.length;
          if (bytes > (this.options.maxBytes ?? 1_000_000))
            stop("AI returned too much output; your form is unchanged");
        });
        child.stdin.on("error", () => {});
        child.on("error", () => {
          failure = Error(
            `${label(preferences.client)} CLI could not start. Check its installation in Terminal.`,
          );
        });
        child.on("close", (code) => {
          clearTimeout(timer);
          if (force) {
            kill("SIGKILL");
            clearTimeout(force);
          }
          signal.removeEventListener("abort", abort);
          // Never expose raw CLI diagnostics: they may contain tokens or prompt text.
          if (failure) reject(failure);
          else if (code !== 0)
            reject(
              Error(
                `${label(preferences.client)} request failed. Check CLI sign-in, model access and effort in Terminal, then try again.`,
              ),
            );
          else resolve(stdout);
        });
        child.stdin.end(input);
      });
      let text: string;
      try {
        if (codex) {
          const events = output
            .trim()
            .split("\n")
            .map((line) => JSON.parse(line));
          if (
            !events.some((event) => event.type === "turn.completed") ||
            events.some((event) =>
              ["error", "turn.failed"].includes(event.type),
            )
          )
            throw Error();
          // This installed CLI reports a deliberate disabled host as a startup error item.
          // Accept only that exact pre-turn diagnostic, never a failed turn or tool activity.
          const firstTurn = events.findIndex(
            (event) => event.type === "turn.started",
          );
          const items = events
            .filter(
              (event, index) =>
                event.type === "item.completed" &&
                !(
                  index < firstTurn &&
                  event.item?.type === "error" &&
                  event.item.message ===
                    "Code Mode is unavailable because code-mode host is disabled. Code mode will fail closed; enable `features.code_mode_host` and install `codex-code-mode-host`."
                ),
            )
            .map((event) => event.item);
          if (
            items.some(
              (item) => !["agent_message", "reasoning"].includes(item?.type),
            )
          )
            throw Error();
          text = items
            .filter((item) => item.type === "agent_message")
            .map((item) => item.text)
            .join("\n");
        } else {
          const result = JSON.parse(output);
          if (
            result.type !== "result" ||
            result.subtype !== "success" ||
            result.is_error ||
            typeof result.result !== "string"
          )
            throw Error();
          text = result.result;
        }
        if (!text.trim() || Buffer.byteLength(text) > 128_000) throw Error();
      } catch {
        throw Error(
          `${label(preferences.client)} returned an invalid or incomplete response; your form is unchanged`,
        );
      }
      if (signal.aborted) throw Error("AI request cancelled");
      onText(text);
      return text;
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
}
