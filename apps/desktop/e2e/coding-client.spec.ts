import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { launchConfiguredApp } from "./helpers/configured-app.ts";

for (const client of ["claude-code", "codex"] as const)
  test(`operational guidance uses only ${client} and retains it after restart`, async () => {
    const temp = await mkdtemp(join(tmpdir(), "voidra-client-ui-")),
      root = join(temp, "project");
    await cp(resolve("../../fixtures/new-project/project"), root, {
      recursive: true,
    });
    const env = Object.fromEntries(
      Object.entries(process.env).filter(
        (p): p is [string, string] =>
          p[1] !== undefined &&
          !["ELECTRON_RUN_AS_NODE", "NODE_V8_COVERAGE"].includes(p[0]),
      ),
    );
    const launch = () =>
      launchConfiguredApp({
        args: [resolve("."), `--project=${root}`],
        env: { ...env, VOIDRA_DATA_DIR: join(temp, "data") },
      });
    let app = await launch();
    try {
      let page = await app.firstWindow();
      await page.locator('[data-app-ready="true"]').waitFor();
      await page.getByRole("button", { name: "Settings", exact: true }).click();
      await expect(
        page.getByRole("radio", {
          name: client === "codex" ? "Codex" : "Claude Code",
          exact: true,
        }),
      ).toHaveCount(1);
      await page
        .getByRole("radio", {
          name: client === "codex" ? "Codex" : "Claude Code",
          exact: true,
        })
        .check();
      await expect(
        page.getByRole("radio", {
          name: client === "codex" ? "Codex" : "Claude Code",
          exact: true,
        }),
      ).toBeChecked();
      const otherName = client === "codex" ? "Claude Code" : "Codex";
      const desired = page.getByRole("radio", {
        name: client === "codex" ? "Codex" : "Claude Code",
        exact: true,
      });
      await expect(desired).toBeEnabled();
      await desired.focus();
      await page.keyboard.press(
        client === "codex" ? "ArrowLeft" : "ArrowRight",
      );
      await expect(
        page.getByRole("radio", { name: otherName, exact: true }),
      ).toBeChecked();
      await desired.check();
      await page.keyboard.press("Escape");
      await expect(page.locator("#actions-sidebar")).toBeVisible();
      const selected =
        client === "codex" ? "Voidra Go · Codex" : "Voidra Go · Claude Code";
      await expect(
        page.getByRole("button", { name: selected, exact: true }),
      ).toHaveCount(1);
      await expect(
        page.getByRole("button", {
          name:
            client === "codex"
              ? "Voidra Go · Claude Code"
              : "Voidra Go · Codex",
          exact: true,
        }),
      ).toHaveCount(0);
      await app.evaluate(({ clipboard }) =>
        clipboard.writeText("unchanged clipboard"),
      );
      const refused = await page.evaluate(
        async (agent) =>
          window.voidra.invoke({ command: "copy-agent-command", agent }),
        client === "codex" ? ("claude-code" as const) : ("codex" as const),
      );
      expect(refused.ok).toBe(false);
      expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe(
        "unchanged clipboard",
      );
      await page.getByRole("button", { name: selected, exact: true }).click();
      await expect
        .poll(() => app.evaluate(({ clipboard }) => clipboard.readText()))
        .toBe(client === "codex" ? "$voidra-go" : "/voidra-go");
      await expect
        .poll(
          async () =>
            JSON.parse(
              (await readFile(join(temp, "data/agent-launches.jsonl"), "utf8"))
                .trim()
                .split("\n")
                .at(-1) ?? "{}",
            ).agent,
        )
        .toBe(client);
      await app.close();
      app = await launch();
      page = await app.firstWindow();
      await page.locator('[data-app-ready="true"]').waitFor();
      await expect(page.locator("#actions-sidebar")).toBeVisible();
      await expect(
        page.getByRole("button", { name: selected, exact: true }),
      ).toBeVisible();
    } finally {
      await app.close();
      await rm(temp, { recursive: true, force: true, maxRetries: 3 });
    }
  });
