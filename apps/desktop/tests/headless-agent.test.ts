import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import {
  type CompletionInput,
  HeadlessAgentClient,
} from "../src/main/headless-agent.ts";

const input = (client: "codex" | "claude-code"): CompletionInput => ({
  preferences: {
    client,
    model: "custom-model",
    effort: "high",
    configured: true,
    available: true,
  },
  messages: [
    { role: "system", content: "Return JSON" },
    { role: "user", content: "Selected public planning text" },
  ],
  signal: new AbortController().signal,
  onText: () => {},
});
const result = '{"title":"Safe draft"}';
async function fixture(code: string) {
  const directory = await mkdtemp(join(tmpdir(), "voidra-agent-test-")),
    executable = join(directory, "agent.cjs");
  await writeFile(executable, `#!${process.execPath}\n${code}`, {
    mode: 0o700,
  });
  return { directory, executable };
}
for (const client of ["codex", "claude-code"] as const)
  it(`runs ${client} headlessly in a disposable directory with stdin-only public context and fixed permissions/model/effort`, async () => {
    const { directory, executable } = await fixture(`
let text=""; process.stdin.on("data", data => text+=data); process.stdin.on("end", () => {
console.log(${JSON.stringify(client === "codex" ? `${JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: result } })}\n${JSON.stringify({ type: "turn.completed" })}` : JSON.stringify({ type: "result", subtype: "success", is_error: false, result }))});
});`);
    // Record the actual subprocess boundary in the owning fixture directory.
    await writeFile(
      executable,
      (await readFile(executable, "utf8")).replace(
        'let text="";',
        `require("node:fs").writeFileSync(${JSON.stringify(join(directory, "invocation.json"))}, JSON.stringify({args:process.argv.slice(2),cwd:process.cwd(),env:process.env.NODE_OPTIONS})); let text="";`,
      ),
    );
    try {
      const chunks: string[] = [];
      const output = await new HeadlessAgentClient({
        executables: { [client]: executable },
      }).complete({ ...input(client), onText: (part) => chunks.push(part) });
      expect(output).toBe(result);
      expect(chunks).toEqual([result]);
      const invocation = JSON.parse(
        await readFile(join(directory, "invocation.json"), "utf8"),
      );
      expect(invocation.args).toContain("custom-model");
      expect(invocation.args.join(" ")).not.toContain(
        "Selected public planning text",
      );
      expect(invocation.cwd).not.toBe(process.cwd());
      await expect(access(invocation.cwd)).rejects.toThrow();
      expect(invocation.env).toBeUndefined();
      if (client === "codex") {
        expect(invocation.args).toContain("read-only");
        expect(invocation.args).toContain('model_reasoning_effort="high"');
        expect(invocation.args).toContain("--ignore-user-config");
        expect(invocation.args).toContain("--strict-config");
        expect(invocation.args).toContain("shell_tool");
        for (const feature of [
          "view_image",
          "browser_use",
          "computer_use",
          "image_generation",
          "code_mode_host",
        ]) {
          const index = invocation.args.indexOf(feature);
          expect(index).toBeGreaterThan(0);
          expect(invocation.args[index - 1]).toBe("--disable");
        }
        expect(invocation.args).toContain("--ephemeral");
      } else {
        expect(invocation.args).toContain("--safe-mode");
        expect(invocation.args[invocation.args.indexOf("--tools") + 1]).toBe(
          "",
        );
        expect(invocation.args[invocation.args.indexOf("--effort") + 1]).toBe(
          "high",
        );
        expect(invocation.args).toContain("--no-session-persistence");
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

for (const [name, code, expected] of [
  ["missing executable", "", /could not start/],
  [
    "nonzero exit",
    'console.error("token=PRIVATE_SECRET");process.exit(1)',
    /sign-in/,
  ],
  ["invalid JSON", 'console.log("PRIVATE_SECRET")', /invalid/],
  [
    "incomplete response",
    'console.log(JSON.stringify({type:"item.completed",item:{type:"agent_message",text:"{}"}}))',
    /incomplete/,
  ],
  [
    "failed turn",
    'console.log(JSON.stringify({type:"turn.failed"}))',
    /invalid/,
  ],
  [
    "tool invocation",
    'console.log(JSON.stringify({type:"item.completed",item:{type:"command_execution"}}));console.log(JSON.stringify({type:"turn.completed"}))',
    /invalid/,
  ],
  ["oversized output", 'process.stdout.write("x".repeat(20000))', /too much/],
  [
    "oversized diagnostics",
    'process.stderr.write("x".repeat(20000))',
    /too much/,
  ],
  ["timeout", "setInterval(()=>{},1000)", /timed out/],
] as const)
  it(`handles ${name} without returning raw diagnostics`, async () => {
    const { directory, executable } = await fixture(code);
    try {
      if (!code) await rm(executable);
      const promise = new HeadlessAgentClient({
        executables: { codex: executable },
        timeout: name === "timeout" ? 150 : 5000,
        maxBytes: 10000,
      }).complete(input("codex"));
      await expect(promise).rejects.toThrow(expected);
      await expect(promise).rejects.not.toThrow(/PRIVATE_SECRET/);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
it("cancels before startup and kills a running agent that ignores SIGTERM", async () => {
  const { directory, executable } = await fixture(
    'process.on("SIGTERM",()=>{});require("node:fs").writeFileSync(require("node:path").join(__dirname,"ready"),process.cwd());setInterval(()=>{},1000)',
  );
  try {
    const controller = new AbortController(),
      client = new HeadlessAgentClient({ executables: { codex: executable } });
    const promise = client.complete({
      ...input("codex"),
      signal: controller.signal,
    });
    const rejected = expect(promise).rejects.toThrow(/cancelled/);
    await expect
      .poll(
        () =>
          access(join(directory, "ready")).then(
            () => true,
            () => false,
          ),
        { timeout: 5000 },
      )
      .toBe(true);
    const temporary = await readFile(join(directory, "ready"), "utf8");
    controller.abort();
    await rejected;
    await expect(access(temporary)).rejects.toThrow();
    await expect(
      client.complete({ ...input("codex"), signal: controller.signal }),
    ).rejects.toThrow(/cancelled/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
it("refuses a Claude error result even when the CLI exits zero", async () => {
  const { directory, executable } = await fixture(
    'console.log(JSON.stringify({type:"result",subtype:"success",is_error:true,result:"PRIVATE_SECRET"}))',
  );
  try {
    await expect(
      new HeadlessAgentClient({
        executables: { "claude-code": executable },
      }).complete(input("claude-code")),
    ).rejects.toThrow(/invalid/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

for (const before of [true, false])
  it(`accepts the disabled-host diagnostic only before the turn (${before})`, async () => {
    const diagnostic = {
      type: "item.completed",
      item: {
        type: "error",
        message:
          "Code Mode is unavailable because code-mode host is disabled. Code mode will fail closed; enable `features.code_mode_host` and install `codex-code-mode-host`.",
      },
    };
    const start = { type: "turn.started" };
    const events = [
      ...(before ? [diagnostic, start] : [start, diagnostic]),
      { type: "item.completed", item: { type: "agent_message", text: result } },
      { type: "turn.completed" },
    ];
    const { directory, executable } = await fixture(
      `console.log(${JSON.stringify(events.map((event) => JSON.stringify(event)).join("\n"))})`,
    );
    try {
      const request = new HeadlessAgentClient({
        executables: { codex: executable },
      }).complete(input("codex"));
      if (before) await expect(request).resolves.toBe(result);
      else await expect(request).rejects.toThrow(/invalid/);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
