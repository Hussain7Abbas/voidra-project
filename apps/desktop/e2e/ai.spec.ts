import { once } from "node:events";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { _electron, expect, test } from "@playwright/test";
import { checkProject, parseRecord, serializeRecord } from "voidra";

for (const theme of ["light", "dark"] as const)
  test(`optional AI key settings and editable idea suggestions in ${theme}`, async () => {
    const temp = await mkdtemp(join(tmpdir(), "voidra-ai-ui-")),
      root = join(temp, "project"),
      requests: { url: string; body: string; auth: string }[] = [];
    await cp(resolve("../../fixtures/new-project/project"), root, {
      recursive: true,
    });

    const host = createServer((request, response) => {
      let body = "";
      request.on("data", (chunk) => {
        body += String(chunk);
      });
      request.on("end", () => {
        requests.push({
          url: request.url ?? "",
          body,
          auth: request.headers.authorization ?? "",
        });
        if (request.url === "/api/v1/models")
          return response.end(
            JSON.stringify({
              data: [
                {
                  id: "test/model",
                  name: "Test model",
                  context_length: 8192,
                  architecture: { output_modalities: ["text"] },
                  pricing: { prompt: "0", completion: "0" },
                },
              ],
            }),
          );
        if (request.url === "/api/v1/key")
          return response.end(JSON.stringify({ data: { label: "fixture" } }));
        response.writeHead(200, { "content-type": "text/event-stream" });
        response.end(
          `data: ${JSON.stringify({ choices: [{ delta: { content: JSON.stringify({ title: "Clear offline export", description: "Export notes as local JSON documents." }) } }] })}\n\ndata: [DONE]\n\n`,
        );
      });
    });
    host.listen(0, "127.0.0.1");
    await once(host, "listening");
    const address = host.address();
    if (!address || typeof address === "string")
      throw new Error("Missing server");
    const env = Object.fromEntries(
      Object.entries(process.env).filter(
        (pair): pair is [string, string] =>
          pair[1] !== undefined &&
          !["ELECTRON_RUN_AS_NODE", "NODE_V8_COVERAGE"].includes(pair[0]),
      ),
    );
    const app = await _electron.launch({
      args: [resolve("."), `--project=${root}`, "--use-mock-keychain"],
      env: {
        ...env,
        VOIDRA_DATA_DIR: join(temp, "data"),
        VOIDRA_TEST_OPENROUTER_URL: `http://127.0.0.1:${address.port}/api/v1`,
      },
    });
    try {
      const page = await app.firstWindow();
      await page.locator('[data-app-ready="true"]').waitFor();
      await page.getByRole("button", { name: "Backlog", exact: true }).click();
      await page.getByRole("button", { name: "New idea", exact: true }).click();
      await expect(
        page.getByRole("button", { name: "Improve with AI", exact: true }),
      ).toHaveCount(0);
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "Settings", exact: true }).click();
      await page.getByRole("tab", { name: "Appearance", exact: true }).click();
      await page.getByLabel("Theme", { exact: true }).selectOption(theme);
      await page.getByRole("tab", { name: "General", exact: true }).click();
      await page
        .getByText("AI suggestions (optional)", { exact: true })
        .click();
      await page
        .getByLabel("OpenRouter API key", { exact: true })
        .fill("fixture-private-key");
      await page.getByRole("button", { name: "Save key", exact: true }).click();
      await expect(page.getByText("Key saved", { exact: true })).toBeVisible();
      await page
        .getByLabel("AI model", { exact: true })
        .selectOption("test/model");
      await page
        .getByRole("button", { name: "Test connection", exact: true })
        .click();
      await expect(
        page.getByText("Connection works", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Test connection", exact: true }),
      ).toBeEnabled();
      expect(
        await readFile(join(temp, "data/ai-settings.json"), "utf8"),
      ).not.toContain("fixture-private-key");
      expect(
        (await new AxeBuilder({ page }).setLegacyMode(true).analyze())
          .violations,
      ).toEqual([]);
      await page.getByRole("button", { name: "Done", exact: true }).click();
      await page.getByRole("button", { name: "New idea", exact: true }).click();
      await page
        .getByLabel("Description", { exact: true })
        .fill("rough idea: export offline notes to json");
      await page
        .getByRole("button", { name: "Improve with AI", exact: true })
        .click();
      await expect(
        page.getByRole("heading", {
          name: "Review text sent to OpenRouter",
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        page
          .getByText("rough idea: export offline notes to json", {
            exact: false,
          })
          .last(),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Generate suggestion", exact: true })
        .click();
      await expect(
        page.getByLabel("Suggested title", { exact: true }),
      ).toHaveValue("Clear offline export");
      await page
        .getByLabel("Suggested title", { exact: true })
        .fill("Reviewed offline export");
      await page
        .getByRole("button", { name: "Use suggestion", exact: true })
        .click();
      await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
        "Reviewed offline export",
      );
      await page
        .getByRole("button", { name: "Save idea", exact: true })
        .click();
      await expect(
        page.getByText("Reviewed offline export", { exact: true }),
      ).toBeVisible();
      expect(
        requests.filter(
          (request) => request.url === "/api/v1/chat/completions",
        ),
      ).toHaveLength(1);
      expect(
        requests.every(
          (request) => request.auth === "Bearer fixture-private-key",
        ),
      ).toBe(true);
      await page.getByRole("button", { name: "Settings", exact: true }).click();
      await page
        .getByText("AI suggestions (optional)", { exact: true })
        .click();
      await page
        .getByRole("button", { name: "Remove key", exact: true })
        .click();
      await expect(
        page.getByText("No key saved", { exact: true }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Done", exact: true }).click();
      await page.getByRole("button", { name: "New idea", exact: true }).click();
      await expect(
        page.getByRole("button", { name: "Improve with AI", exact: true }),
      ).toHaveCount(0);
    } finally {
      await app.close();
      host.closeAllConnections();
      await new Promise<void>((done) => host.close(() => done()));
      await rm(temp, { recursive: true, force: true });
    }
  });

for (const theme of ["light", "dark"] as const)
  test(`AI profile questions, run summaries and release drafts remain reviewable in ${theme}`, async () => {
    const temp = await mkdtemp(join(tmpdir(), "voidra-ai-features-")),
      root = join(temp, "project"),
      bodies: string[] = [];
    await cp(resolve("../../fixtures/new-project/project"), root, {
      recursive: true,
    });
    const path = ".voidra/actions/act-000000/action.md",
      old = parseRecord(path, await readFile(join(root, path)));
    await writeFile(
      join(root, path),
      serializeRecord(
        old,
        {
          id: "act-000000",
          type: "docs",
          title: "Documentation result",
          stage: "review",
          status: "waiting",
          doneBy: "agent",
        },
        "Updated documentation.\n",
      ),
    );
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
        "Documentation is waiting for review.\n",
      ),
    );
    for (const [id, data] of [
      [
        "act-000001",
        {
          type: "docs",
          title: "Completed offline docs",
          stage: "done",
          status: "complete",
          doneBy: "agent",
        },
      ],
      [
        "act-000002",
        {
          type: "release",
          title: "Planned release",
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
          "Selected offline documentation.\n",
        ),
      );
    }
    await writeFile(join(root, "README.md"), "SOURCE_CANARY");
    await mkdir(join(root, ".voidra/local"), { recursive: true });
    await writeFile(join(root, ".voidra/local/private.txt"), "PRIVATE_CANARY");
    const original = await checkProject(root);
    expect(original.diagnostics).toEqual([]);
    const host = createServer((request, response) => {
      let body = "";
      request.on("data", (chunk) => {
        body += String(chunk);
      });
      request.on("end", () => {
        if (request.url === "/api/v1/models")
          return response.end(
            JSON.stringify({
              data: [{ id: "test/model", name: "Test model" }],
            }),
          );
        if (request.url === "/api/v1/key")
          return response.end(JSON.stringify({ data: { label: "fixture" } }));
        bodies.push(body);
        const input = JSON.parse(body),
          system = String(input.messages[0].content),
          output = system.startsWith("Suggest an answer")
            ? { value: "A reviewed offline workflow" }
            : system.startsWith("Suggest up to")
              ? { questions: ["Which devices must work offline?"] }
              : system.startsWith("Summarize")
                ? { text: "The documentation is waiting for review." }
                : system.startsWith("Draft concise")
                  ? { text: "## Notes\nCompleted offline documentation." }
                  : {
                      title: "Reviewed action",
                      description: "A reviewed action outcome",
                    };
        response.writeHead(200, { "content-type": "text/event-stream" });
        response.end(
          `data: ${JSON.stringify({ choices: [{ delta: { content: JSON.stringify(output) } }] })}\n\ndata: [DONE]\n\n`,
        );
      });
    });
    host.listen(0, "127.0.0.1");
    await once(host, "listening");
    const address = host.address();
    if (!address || typeof address === "string")
      throw new Error("Missing server");
    const env = Object.fromEntries(
      Object.entries(process.env).filter(
        (pair): pair is [string, string] =>
          pair[1] !== undefined &&
          !["ELECTRON_RUN_AS_NODE", "NODE_V8_COVERAGE"].includes(pair[0]),
      ),
    );
    const app = await _electron.launch({
      args: [resolve("."), `--project=${root}`, "--use-mock-keychain"],
      env: {
        ...env,
        VOIDRA_DATA_DIR: join(temp, "data"),
        VOIDRA_TEST_OPENROUTER_URL: `http://127.0.0.1:${address.port}/api/v1`,
      },
    });
    try {
      const page = await app.firstWindow();
      await page.locator('[data-app-ready="true"]').waitFor();
      await page.getByRole("button", { name: "Settings", exact: true }).click();
      await page.getByRole("tab", { name: "Appearance", exact: true }).click();
      await page.getByLabel("Theme", { exact: true }).selectOption(theme);
      await page.getByRole("tab", { name: "General", exact: true }).click();
      await page
        .getByText("AI suggestions (optional)", { exact: true })
        .click();
      await page
        .getByLabel("OpenRouter API key", { exact: true })
        .fill("fixture-private-key");
      await page.getByRole("button", { name: "Save key", exact: true }).click();
      await expect(page.getByText("Key saved", { exact: true })).toBeVisible();
      await page
        .getByLabel("AI model", { exact: true })
        .selectOption("test/model");
      await expect(
        page.getByText("Model saved", { exact: true }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Done", exact: true }).click();
      async function generate(label: string) {
        await page.getByRole("button", { name: label, exact: true }).click();
        await expect(
          page.getByRole("heading", {
            name: "Review text sent to OpenRouter",
            exact: true,
          }),
        ).toBeVisible();
        await page
          .getByRole("button", { name: "Generate suggestion", exact: true })
          .click();
        await expect(
          page.getByRole("heading", {
            name: "Review suggestion",
            exact: true,
          }),
        ).toBeVisible();
      }
      await page.getByRole("button", { name: "Profile", exact: true }).click();
      await page
        .getByRole("button", {
          name: "Edit How is this work done today, and where does it break down?",
          exact: true,
        })
        .click();
      await generate("Suggest follow-up questions");
      await page
        .getByRole("button", { name: "Use suggestion", exact: true })
        .click();
      await expect(
        page.getByLabel("Questions to consider", { exact: true }),
      ).toHaveValue("Which devices must work offline?");
      await generate("Suggest answer with AI");
      await expect(
        page.getByLabel("Suggested answer", { exact: true }),
      ).toHaveValue("A reviewed offline workflow");
      expect(
        (await checkProject(root)).files.get(".voidra/profile/problem.md"),
      ).toEqual(original.files.get(".voidra/profile/problem.md"));
      await page
        .getByRole("button", { name: "Use suggestion", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Save answer", exact: true })
        .click();
      await expect(
        page.getByRole("dialog", { name: "Edit profile answer", exact: true }),
      ).toHaveCount(0);
      const profile = (await checkProject(root)).records.get(
        ".voidra/profile/problem.md",
      );
      expect(profile?.document.data.answers).toMatchObject([
        { status: "confirmed" },
        { status: "confirmed", answer: "A reviewed offline workflow" },
      ]);
      await page.getByRole("button", { name: "Actions", exact: true }).click();
      await page
        .getByRole("button", { name: "Documentation result", exact: true })
        .first()
        .click();
      await generate("Summarize run with AI");
      await page
        .getByRole("button", { name: "Use suggestion", exact: true })
        .click();
      await expect(
        page.getByRole("complementary", { name: "AI summary draft" }),
      ).toContainText("waiting for review");
      await page.getByRole("button", { name: "Actions", exact: true }).click();
      await page
        .getByRole("button", { name: "Planned release", exact: true })
        .first()
        .click();
      await generate("Draft release notes with AI");
      await page
        .getByRole("button", { name: "Use suggestion", exact: true })
        .click();
      await expect(
        page.getByRole("dialog", { name: "Edit description", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByLabel("Description", { exact: true }),
      ).toContainText(/Draft release notes/);
      await page
        .getByRole("button", { name: "Save changes", exact: true })
        .click();
      await expect(
        page.getByRole("dialog", { name: "Edit description", exact: true }),
      ).toHaveCount(0);
      expect(
        (await checkProject(root)).records.get(
          ".voidra/actions/act-000002/action.md",
        )?.document.body,
      ).toContain("Completed offline documentation");
      expect(bodies).toHaveLength(4);
      expect(bodies.join("\n")).not.toMatch(
        /SOURCE_CANARY|PRIVATE_CANARY|fixture-private-key/,
      );
      expect(await readFile(join(root, "README.md"), "utf8")).toBe(
        "SOURCE_CANARY",
      );
      expect(
        (await new AxeBuilder({ page }).setLegacyMode(true).analyze())
          .violations,
      ).toEqual([]);
    } finally {
      await app.close();
      host.closeAllConnections();
      await new Promise<void>((done) => host.close(() => done()));
      await rm(temp, { recursive: true, force: true });
    }
  });

test("AI onboarding suggestions and rate errors keep the profile draft under user control", async () => {
  const temp = await mkdtemp(join(tmpdir(), "voidra-ai-onboarding-")),
    root = join(temp, "project");
  await mkdir(root);
  let calls = 0;
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
      const input = JSON.parse(body),
        system = String(input.messages[0].content);
      if (calls++ === 0) {
        response.writeHead(429);
        return response.end(
          JSON.stringify({ error: { message: "fixture-private-key" } }),
        );
      }
      const output = system.startsWith("Suggest up to")
        ? { questions: ["What should work offline?"] }
        : { value: "Build a useful offline planner" };
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.end(
        `data: ${JSON.stringify({ choices: [{ delta: { content: JSON.stringify(output) } }] })}\n\ndata: [DONE]\n\n`,
      );
    });
  });
  host.listen(0, "127.0.0.1");
  await once(host, "listening");
  const address = host.address();
  if (!address || typeof address === "string")
    throw new Error("Missing server");
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      (p): p is [string, string] =>
        p[1] !== undefined &&
        !["ELECTRON_RUN_AS_NODE", "NODE_V8_COVERAGE"].includes(p[0]),
    ),
  );
  const app = await _electron.launch({
    args: [resolve("."), `--project=${root}`, "--use-mock-keychain"],
    env: {
      ...env,
      VOIDRA_DATA_DIR: join(temp, "data"),
      VOIDRA_TEST_OPENROUTER_URL: `http://127.0.0.1:${address.port}/api/v1`,
    },
  });
  try {
    const page = await app.firstWindow();
    await page.locator('[data-app-ready="true"]').waitFor();
    await page
      .getByRole("button", { name: "Use General software", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Suggest answer with AI", exact: true }),
    ).toHaveCount(0);
    await page
      .getByLabel(/What should this project make possible/)
      .fill("My original notes");
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByText("AI suggestions (optional)", { exact: true }).click();
    await page
      .getByLabel("OpenRouter API key", { exact: true })
      .fill("fixture-private-key");
    await page.getByRole("button", { name: "Save key", exact: true }).click();
    await expect(page.getByText("Key saved", { exact: true })).toBeVisible();
    await page
      .getByLabel("AI model", { exact: true })
      .selectOption("test/model");
    await expect(page.getByText("Model saved", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await page
      .getByRole("button", { name: "Suggest answer with AI", exact: true })
      .first()
      .click();
    await page
      .getByRole("button", { name: "Generate suggestion", exact: true })
      .click();
    const aiDialog = page.getByRole("dialog", {
      name: "Review text sent to OpenRouter",
      exact: true,
    });
    await expect(aiDialog.getByRole("alert")).toContainText(/rate|limit/i);
    await expect(aiDialog.getByRole("alert")).not.toContainText(
      "fixture-private-key",
    );
    await expect(
      page.getByLabel(/What should this project make possible/),
    ).toHaveValue("My original notes");
    await page
      .getByRole("button", { name: "Generate suggestion", exact: true })
      .click();
    await expect(
      page.getByLabel("Suggested answer", { exact: true }),
    ).toHaveValue("Build a useful offline planner");
    await page
      .getByRole("button", { name: "Use suggestion", exact: true })
      .click();
    await expect(
      page.getByLabel(/What should this project make possible/),
    ).toHaveValue("Build a useful offline planner");
    await expect(readFile(join(root, ".voidra/voidra.json"))).rejects.toThrow();
    await page
      .getByRole("button", { name: "Suggest follow-up questions", exact: true })
      .first()
      .click();
    await page
      .getByRole("button", { name: "Generate suggestion", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Review suggestion", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Use suggestion", exact: true })
      .click();
    await expect(
      page.getByLabel("Questions to consider", { exact: true }),
    ).toHaveValue("What should work offline?");
    expect(
      (await new AxeBuilder({ page }).setLegacyMode(true).analyze()).violations,
    ).toEqual([]);
    await page
      .getByRole("button", { name: "Create planning folder", exact: true })
      .click();
    await expect(
      page.getByText("Project profile created", { exact: true }),
    ).toBeVisible();
    const checked = await checkProject(root);
    expect(checked.diagnostics).toEqual([]);
    expect(
      checked.records.get(".voidra/profile/problem.md")?.document.data.answers,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          answer: "Build a useful offline planner",
          status: "confirmed",
        }),
      ]),
    );
  } finally {
    await app.close();
    host.closeAllConnections();
    await new Promise<void>((done) => host.close(() => done()));
    await rm(temp, { recursive: true, force: true });
  }
});
