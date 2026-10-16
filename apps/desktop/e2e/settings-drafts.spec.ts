import { once } from "node:events";
import { cp, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { checkProject } from "voidra";
import { launchConfiguredApp } from "./helpers/configured-app.ts";

for (const theme of ["light", "dark"] as const)
  test(`Team and encrypted credential drafts restore without applying settings in ${theme}`, async () => {
    const temp = await mkdtemp(join(tmpdir(), "voidra-settings-drafts-")),
      root = join(temp, "project"),
      data = join(temp, "data");
    await cp(resolve("../../fixtures/new-project/project"), root, {
      recursive: true,
    });
    const server = createServer((_request, response) =>
      response.end(JSON.stringify({ data: [] })),
    );
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
    const launch = () =>
      launchConfiguredApp({
        args: [resolve("."), `--project=${root}`, "--use-mock-keychain"],
        env: {
          ...env,
          VOIDRA_DATA_DIR: data,
          VOIDRA_TEST_OPENROUTER_URL: `http://127.0.0.1:${address.port}/api/v1`,
        },
      });
    let app = await launch();
    try {
      let page = await app.firstWindow();
      await page.locator('[data-app-ready="true"]').waitFor();
      await page.getByRole("button", { name: "Settings", exact: true }).click();
      await page.getByRole("tab", { name: "Appearance" }).click();
      await page.getByLabel("Theme", { exact: true }).selectOption(theme);
      await page.getByRole("tab", { name: "Team" }).click();
      await page
        .getByLabel("Member name", { exact: true })
        .fill("Unfinished member");
      await page.getByLabel("Member email", { exact: true }).fill("partial@");
      await page.keyboard.press("Escape");
      await expect(
        page.getByRole("dialog", { name: "Settings", exact: true }),
      ).toBeHidden();
      await page.getByRole("button", { name: "Settings", exact: true }).click();
      await page.getByRole("tab", { name: "Team" }).click();
      await page
        .getByRole("button", { name: /Restore draft .*Unfinished member/ })
        .click();
      await expect(
        page.getByLabel("Member email", { exact: true }),
      ).toHaveValue("partial@");
      await expect(
        page
          .getByRole("region", { name: "Team members", exact: true })
          .getByRole("button", { name: /Remove/ }),
      ).toHaveCount(0);
      await page
        .getByLabel("Member email", { exact: true })
        .fill("member@example.test");
      await page
        .getByRole("button", { name: "Add team member", exact: true })
        .click();
      await expect(
        page.getByRole("button", {
          name: "Remove Unfinished member from Team",
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: /Restore draft/ }),
      ).toHaveCount(0);
      await page.keyboard.press("Escape");
      const bootstrap = [...(await checkProject(root)).records.values()].find(
        (record) =>
          record.kind === "action" &&
          record.document.data.title === "Bootstrap",
      );
      if (!bootstrap) throw Error("Missing Bootstrap fixture");
      await page
        .getByRole("button", { name: "Bootstrap", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Edit description", exact: true })
        .click();
      await page.getByLabel("Description", { exact: true }).focus();
      await page.keyboard.press("ControlOrMeta+a");
      await page.keyboard.insertText("Recover **removed** task description");
      await page.keyboard.press("Escape");
      await rm(
        join(root, ".voidra/actions", String(bootstrap.document.data.id)),
        { recursive: true },
      );
      await page.getByRole("button", { name: "Settings", exact: true }).click();
      await page.getByText("Unfinished forms", { exact: true }).click();
      await page
        .getByRole("button", { name: /Read unfinished form .*Recover/ })
        .click();
      await expect(
        page.getByRole("region", { name: "Recovered form text", exact: true }),
      ).toContainText("Recover removed task description");
      await page
        .getByRole("button", { name: "Copy Markdown", exact: true })
        .click();
      expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe(
        "Recover **removed** task description",
      );
      await page
        .getByRole("button", { name: "Discard this draft", exact: true })
        .click();
      await expect(
        page.getByText("No unfinished forms in this project.", { exact: true }),
      ).toBeVisible();
      await page
        .getByText("AI suggestions (optional)", { exact: true })
        .click();
      await page
        .getByLabel("OpenRouter API key", { exact: true })
        .fill("pending-fixture-secret");
      await page.keyboard.press("Escape");
      await app.close();
      app = await launch();
      page = await app.firstWindow();
      await page.locator('[data-app-ready="true"]').waitFor();
      await page.getByRole("button", { name: "Settings", exact: true }).click();
      await page
        .getByText("AI suggestions (optional)", { exact: true })
        .click();
      await page
        .getByRole("button", {
          name: "Unfinished OpenRouter key 1",
          exact: true,
        })
        .click();
      await expect(
        page.getByLabel("OpenRouter API key", { exact: true }),
      ).toHaveValue("");
      await expect(
        page.getByText("No key saved", { exact: true }),
      ).toBeVisible();
      await expect(
        page
          .getByRole("status")
          .filter({ hasText: "Encrypted key draft selected" }),
      ).toBeVisible();
      const files = await readdir(join(data, "form-drafts"), {
        recursive: true,
      });
      for (const file of files.filter((file) => file.endsWith(".json")))
        expect(
          await readFile(join(data, "form-drafts", file), "utf8"),
        ).not.toContain("pending-fixture-secret");
      await page.getByRole("button", { name: "Save key", exact: true }).click();
      await expect(page.getByText("Key saved", { exact: true })).toBeVisible();
      await expect(
        page.getByRole("button", {
          name: "Unfinished OpenRouter key 1",
          exact: true,
        }),
      ).toHaveCount(0);
    } finally {
      await app.close();
      server.closeAllConnections();
      await new Promise<void>((done) => server.close(() => done()));
      await rm(temp, { recursive: true, force: true });
    }
  });
