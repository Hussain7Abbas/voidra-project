import { once } from "node:events";
import { cp, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron, expect, test } from "@playwright/test";
import { checkProject } from "voidra";

for (const theme of ["light", "dark"] as const)
  test(`task capture reviews optional titles and Agentic metadata before Save in ${theme}`, async () => {
    const temp = await mkdtemp(join(tmpdir(), "voidra-capture-ai-")),
      root = join(temp, "project");
    await cp(resolve("../../fixtures/new-project/project"), root, {
      recursive: true,
    });
    const requests: string[] = [];
    let invalid = true,
      delay = false;
    const server = createServer((request, response) => {
      let body = "";
      request.on("data", (chunk) => {
        body += String(chunk);
      });
      request.on("end", () => {
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
        requests.push(body);
        response.writeHead(200, { "content-type": "text/event-stream" });
        if (delay) {
          response.write(": wait\n\n");
          return;
        }
        const capture = body.includes("Turn the supplied task notes");
        const output = capture
          ? {
              title: "Generated Agentic bug",
              description: "**Fix** the captured bug.\n",
              type: invalid ? "unknown" : "bug",
            }
          : { title: "Generated Normal title" };
        response.end(
          `data: ${JSON.stringify({ choices: [{ delta: { content: JSON.stringify(output) } }] })}\n\ndata: [DONE]\n\n`,
        );
      });
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string")
      throw Error("No fixture address");
    const env = Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] =>
          entry[1] !== undefined &&
          !["ELECTRON_RUN_AS_NODE", "NODE_V8_COVERAGE"].includes(entry[0]),
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
      await page.getByRole("tab", { name: "Appearance" }).click();
      await page.getByLabel("Theme", { exact: true }).selectOption(theme);
      await page.keyboard.press("Escape");
      const count = async () =>
        [...(await checkProject(root)).records.values()].filter(
          (record) => record.kind === "action",
        ).length;
      const originalCount = await count();
      await page
        .getByRole("button", { name: "New action", exact: true })
        .click();
      const dialog = page.getByRole("dialog", {
        name: "Create action",
        exact: true,
      });
      await dialog.getByRole("radio", { name: "Normal", exact: true }).check();
      await dialog
        .getByRole("textbox", { name: "Description", exact: true })
        .fill("# Exact description\n\nالعربية 🧭");
      await dialog
        .getByRole("button", { name: "Review AI request", exact: true })
        .click();
      await expect(dialog.getByRole("alert")).toContainText("OpenRouter key");
      expect(await count()).toBe(originalCount);
      expect(requests).toEqual([]);
      await page.evaluate(async () => {
        for (const command of [
          { command: "ai-set-key", key: "fixture-private-key" },
          { command: "ai-set-model", model: "test/model" },
        ] as const) {
          const reply = await window.voidra.invoke(command);
          if (!reply.ok) throw Error(reply.error.message);
        }
      });
      await dialog
        .getByRole("button", { name: "Review AI request", exact: true })
        .click();
      await expect(
        dialog.getByRole("region", { name: "Review text sent to OpenRouter" }),
      ).toContainText("Exact description");
      await dialog
        .getByRole("button", { name: "Generate suggestion", exact: true })
        .click();
      await expect(
        dialog.getByRole("region", { name: "Generated task review" }),
      ).toContainText("Generated Normal title");
      expect(await count()).toBe(originalCount);
      await expect(dialog.getByLabel("Title", { exact: true })).toHaveValue("");
      await dialog
        .getByRole("button", { name: "Create action", exact: true })
        .click();
      await expect(dialog).toBeHidden({ timeout: 30000 });
      let records = [...(await checkProject(root)).records.values()];
      expect(
        records.find(
          (record) => record.document.data.title === "Generated Normal title",
        )?.document.body,
      ).toBe("# Exact description\n\nالعربية 🧭");
      await page
        .getByRole("button", { name: "New action", exact: true })
        .click();
      await expect(
        dialog.getByRole("radio", { name: "Agentic", exact: true }),
      ).toBeChecked();
      await expect(dialog.getByLabel("Title", { exact: true })).toHaveCount(0);
      await expect(
        dialog.getByLabel("Action type", { exact: true }),
      ).toHaveCount(0);
      await dialog
        .getByRole("textbox", { name: "Task", exact: true })
        .fill("A bug from this prompt");
      await dialog
        .getByRole("button", { name: "Review AI request", exact: true })
        .click();
      await dialog
        .getByRole("button", { name: "Generate suggestion", exact: true })
        .click();
      await expect(dialog.getByRole("alert")).toContainText(
        "invalid suggestion",
      );
      expect(await count()).toBe(originalCount + 1);
      invalid = false;
      await dialog
        .getByRole("button", { name: "Generate suggestion", exact: true })
        .click();
      await expect(
        dialog.getByRole("region", { name: "Generated task review" }),
      ).toContainText("Generated Agentic bug");
      expect(await count()).toBe(originalCount + 1);
      await page.screenshot({
        path: test.info().outputPath(`agentic-review-${theme}.png`),
      });
      const generationCalls = requests.length;
      await dialog.getByRole("radio", { name: "Normal", exact: true }).check();
      await expect(dialog.getByLabel("Title", { exact: true })).toHaveValue(
        "Generated Agentic bug",
      );
      await dialog
        .getByLabel("Title", { exact: true })
        .fill("Normal variant stays available");
      await dialog
        .getByRole("textbox", { name: "Description", exact: true })
        .fill("Normal notes stay available");
      await dialog.getByRole("radio", { name: "Agentic", exact: true }).check();
      await expect(
        dialog.getByRole("region", { name: "Generated task review" }),
      ).toContainText("Generated Agentic bug");
      await expect(
        dialog.getByRole("textbox", { name: "Task", exact: true }),
      ).toContainText("A bug from this prompt");
      expect(requests).toHaveLength(generationCalls);
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      await page
        .getByRole("button", { name: "New action", exact: true })
        .click();
      await dialog
        .getByRole("button", { name: /Restore draft .*Generated Agentic bug/ })
        .click();
      await expect(
        dialog.getByRole("region", { name: "Generated task review" }),
      ).toContainText("Generated Agentic bug");
      await dialog
        .getByRole("button", { name: "Create action", exact: true })
        .click();
      await expect(dialog).toBeHidden({ timeout: 30000 });
      records = [...(await checkProject(root)).records.values()];
      expect(
        records.find(
          (record) => record.document.data.title === "Generated Agentic bug",
        )?.document.data.type,
      ).toBe("bug");
      await page
        .getByRole("button", { name: "New action", exact: true })
        .click();
      await dialog.getByRole("radio", { name: "Normal", exact: true }).check();
      await dialog.getByLabel("Title", { exact: true }).fill("My manual title");
      await dialog
        .getByRole("textbox", { name: "Description", exact: true })
        .fill("No generation needed");
      const calls = requests.length;
      await dialog
        .getByRole("button", { name: "Create action", exact: true })
        .click();
      await expect(dialog).toBeHidden({ timeout: 30000 });
      expect(requests).toHaveLength(calls);
      delay = true;
      await page
        .getByRole("button", { name: "New action", exact: true })
        .click();
      await dialog
        .getByRole("textbox", { name: "Task", exact: true })
        .fill("Cancelled prompt remains");
      await dialog
        .getByRole("button", { name: "Review AI request", exact: true })
        .click();
      await dialog
        .getByRole("button", { name: "Generate suggestion", exact: true })
        .click();
      await dialog
        .getByRole("button", { name: "Cancel generation", exact: true })
        .click();
      await expect(
        dialog.getByRole("textbox", { name: "Task", exact: true }),
      ).toContainText("Cancelled prompt remains");
      await expect(
        dialog.getByRole("button", { name: "Review AI request", exact: true }),
      ).toBeEnabled();
      expect(await count()).toBe(originalCount + 3);
      for (const body of requests)
        expect(body).not.toMatch(/\.voidra|source code|fixture-private-key/);
      const draftFiles = await readdir(join(temp, "data/form-drafts"), {
        recursive: true,
      });
      expect(draftFiles.some((file) => file.endsWith(".json"))).toBe(true);
      expect(
        (
          await Promise.all(
            draftFiles
              .filter((file) => file.endsWith(".json"))
              .map((file) =>
                readFile(join(temp, "data/form-drafts", file), "utf8"),
              ),
          )
        ).join(""),
      ).toContain("Cancelled prompt remains");
    } finally {
      await app.close();
      server.closeAllConnections();
      await new Promise<void>((done) => server.close(() => done()));
      await rm(temp, { recursive: true, force: true });
    }
  });
