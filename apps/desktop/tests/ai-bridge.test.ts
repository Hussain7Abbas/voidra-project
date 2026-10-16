import { once } from "node:events";
import {
  access,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron } from "@playwright/test";
import { expect, it } from "vitest";
import { parseRecord, serializeRecord } from "voidra";
import type { BridgeRequest, BridgeResponse } from "../src/shared/bridge.ts";
import { nativeCoverageDirectory } from "./coverage-setup.ts";
import { fixtureAgentCli } from "./helpers/headless-cli.ts";

it("uses actual validated native AI commands with headless agent isolation, isolated public context, editable results and no source/private outbound text", async () => {
  const temp = await mkdtemp(join(tmpdir(), "voidra-ai-bridge-")),
    root = join(temp, "project"),
    bodies: string[] = [];
  await cp(resolve("fixtures/new-project/project"), root, { recursive: true });
  const actionPath = ".voidra/actions/act-000000/action.md",
    old = parseRecord(actionPath, await readFile(join(root, actionPath)));
  await writeFile(
    join(root, actionPath),
    serializeRecord(
      old,
      {
        id: "act-000000",
        type: "docs",
        title: "Reviewed documentation",
        stage: "review",
        status: "waiting",
        doneBy: "agent",
      },
      "Updated the planning documentation.\n",
    ),
  );
  for (const [id, data] of [
    [
      "act-000001",
      {
        type: "docs",
        title: "Completed docs",
        stage: "done",
        status: "complete",
        doneBy: "agent",
      },
    ],
    [
      "act-000002",
      {
        type: "release",
        title: "New release",
        stage: "plan",
        status: "ready",
        doneBy: "agent",
        releaseActions: ["act-000001"],
      },
    ],
  ] as const) {
    const path = `.voidra/actions/${id}/action.md`;
    await mkdir(join(root, `.voidra/actions/${id}`), { recursive: true });
    await writeFile(
      join(root, path),
      serializeRecord(
        parseRecord(path, "---\n{}\n---\n"),
        { id, ...data },
        "Selected planning work.\n",
      ),
    );
  }
  const runPath =
    ".voidra/actions/act-000000/runs/2026-10-14T000000Z-codex-run-000000.md";
  await mkdir(join(root, ".voidra/actions/act-000000/runs"), {
    recursive: true,
  });
  await writeFile(
    join(root, runPath),
    serializeRecord(
      parseRecord(runPath, "---\n{}\n---\n"),
      {
        id: "run-000000",
        action: "act-000000",
        agent: "codex",
        startedAt: "2026-10-14T00:00:00Z",
        endedAt: "2026-10-14T00:00:01Z",
        consumedRecords: ["act-000000"],
        fromStage: "implement",
        toStage: "review",
        outcome: "advanced",
      },
      "Updated documentation; waiting for review.\n",
    ),
  );
  await writeFile(join(root, "README.md"), "SOURCE_CANARY_NOT_FOR_AI");
  await mkdir(join(root, ".voidra/local"), { recursive: true });
  await writeFile(
    join(root, ".voidra/local/private.txt"),
    "PRIVATE_CANARY_NOT_FOR_AI",
  );
  const host = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => {
      body += String(chunk);
    });
    request.on("end", () => {
      if (request.url === "/api/v1/models")
        return response.end(
          JSON.stringify({ data: [{ id: "test/model", name: "Test model" }] }),
        );
      if (request.url === "/api/v1/key")
        return response.end(JSON.stringify({ data: { label: "fixture" } }));
      bodies.push(body);
      const input = JSON.parse(body),
        system = String(input.messages[0].content),
        result = system.startsWith("Suggest an answer")
          ? { value: "A reviewed offline answer" }
          : system.startsWith("Suggest up to")
            ? { questions: ["Which devices?"] }
            : system.startsWith("Summarize")
              ? { text: "The documentation is waiting for review." }
              : system.startsWith("Draft concise")
                ? { text: "## Notes\nCompleted documentation." }
                : {
                    title: "Reviewed title",
                    description: "Reviewed description",
                  };
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.end(
        `data: ${JSON.stringify({ choices: [{ delta: { content: JSON.stringify(result) } }] })}\n\ndata: [DONE]\n\n`,
      );
    });
  });
  host.listen(0, "127.0.0.1");
  await once(host, "listening");
  const address = host.address();
  if (!address || typeof address === "string")
    throw new Error("Missing server");
  await mkdir(join(temp, "data/form-drafts/credentials"), { recursive: true });
  await writeFile(
    join(temp, "data/form-drafts/credentials", `${crypto.randomUUID()}.json`),
    '{"obsolete":"encrypted-key-draft"}',
  );
  await writeFile(
    join(temp, "data/ai-settings.json"),
    JSON.stringify({
      version: 1,
      key: "b2xkLWNpcGhlcnRleHQ=",
      model: "obsolete/provider-model",
    }),
  );
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      (pair): pair is [string, string] =>
        pair[1] !== undefined && pair[0] !== "ELECTRON_RUN_AS_NODE",
    ),
  );
  const app = await _electron.launch({
    args: [resolve("apps/desktop"), `--project=${root}`],
    env: {
      ...env,
      VOIDRA_DATA_DIR: join(temp, "data"),
      VOIDRA_TEST_CLAUDE_CLI: join(temp, "agent.cjs"),
      VOIDRA_TEST_CODEX_CLI: await fixtureAgentCli(
        temp,
        `http://127.0.0.1:${address.port}/complete`,
      ),
      ...(nativeCoverageDirectory
        ? { NODE_V8_COVERAGE: nativeCoverageDirectory }
        : {}),
    },
  });
  try {
    const page = await app.firstWindow();
    await page.locator('[data-app-ready="true"]').waitFor();
    const invoke = (input: BridgeRequest): Promise<BridgeResponse> =>
      page.evaluate(
        (raw) => window.voidra.invoke(JSON.parse(raw)),
        JSON.stringify(input),
      );
    expect((await invoke({ command: "ai-settings" })).ok).toBe(true);
    expect(
      await readFile(join(temp, "data/ai-settings.json"), "utf8"),
    ).not.toMatch(/b2xk|obsolete/);
    await expect(
      access(join(temp, "data/form-drafts/credentials")),
    ).rejects.toThrow();
    const obsolete = await page.evaluate(() =>
      window.voidra.invoke(
        JSON.parse('{"command":"ai-set-key","key":"removed"}'),
      ),
    );
    expect(obsolete.ok).toBe(false);

    const intent = {
      feature: "rewrite" as const,
      target: "idea" as const,
      notes: "Clarify this rough idea.",
    };
    expect((await invoke({ command: "ai-preview", intent })).ok).toBe(true);
    expect(
      (
        await invoke({
          command: "ai-configure",
          client: "codex",
          configuration: { model: "test/model", effort: "high" },
        })
      ).ok,
    ).toBe(true);
    for (const current of [
      intent,
      {
        feature: "profile" as const,
        notes: "Offline",
        template: "general",
        templateVersion: "1.0.0",
        block: "problem",
        answer: "goal",
      },
      {
        feature: "followup" as const,
        notes: "",
        template: "general",
        templateVersion: "1.0.0",
        block: "problem",
        answer: "goal",
      },
      { feature: "summary" as const, notes: "", action: "act-000000" },
      { feature: "release-notes" as const, notes: "", action: "act-000002" },
    ]) {
      const preview = await invoke({ command: "ai-preview", intent: current });
      if (!preview.ok || preview.data.kind !== "ai-preview")
        throw new Error(JSON.stringify(preview));
      const result = await invoke({
        command: "ai-generate",
        id: crypto.randomUUID(),
        intent: current,
        revision: preview.data.revision,
      });
      expect(result.ok).toBe(true);
      expect(JSON.stringify(result)).not.toContain(
        "native-fixture-private-key",
      );
    }
    expect(bodies).toHaveLength(5);
    expect(bodies.join("\n")).not.toMatch(
      /SOURCE_CANARY_NOT_FOR_AI|PRIVATE_CANARY_NOT_FOR_AI|native-fixture-private-key/,
    );
    expect(
      (await invoke({ command: "copy-ai-text", text: "Reviewed draft" })).ok,
    ).toBe(true);
    expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe(
      "Reviewed draft",
    );
    expect(
      (await invoke({ command: "ai-cancel", id: crypto.randomUUID() })).ok,
    ).toBe(true);
    expect(
      (await invoke({ command: "set-coding-client", client: "claude-code" }))
        .ok,
    ).toBe(true);
    expect(
      (
        await invoke({
          command: "ai-configure",
          client: "claude-code",
          configuration: { model: "haiku", effort: "medium" },
        })
      ).ok,
    ).toBe(true);
    const claudePreview = await invoke({ command: "ai-preview", intent });
    if (!claudePreview.ok || claudePreview.data.kind !== "ai-preview")
      throw Error("Missing Claude preview");
    expect(
      (
        await invoke({
          command: "ai-generate",
          intent,
          id: crypto.randomUUID(),
          revision: claudePreview.data.revision,
        })
      ).ok,
    ).toBe(true);
    const claudeCall = JSON.parse(bodies.at(-1) ?? "{}");
    expect(claudeCall).toMatchObject({
      client: "claude-code",
      model: "haiku",
      effort: "medium",
    });
    expect(claudeCall.cwd).not.toBe(root);
    const selected = await invoke({ command: "ai-settings" });
    expect(
      selected.ok &&
        selected.data.kind === "ai-settings" &&
        selected.data.preferences.client,
    ).toBe("claude-code");
  } finally {
    await app.close();
    host.closeAllConnections();
    await new Promise<void>((done) => host.close(() => done()));
    await rm(temp, { recursive: true, force: true });
  }
});
