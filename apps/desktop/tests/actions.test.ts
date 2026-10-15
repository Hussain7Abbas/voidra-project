import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron } from "@playwright/test";
import { expect, it } from "vitest";
import { checkProject } from "voidra";
import { nativeCoverageDirectory } from "./coverage-setup.ts";

it("creates a valid Docs/chore record from the form and lists it immediately", async () => {
  const temp = await mkdtemp(join(tmpdir(), "voidra-action-")),
    root = join(temp, "project");
  await cp(resolve("fixtures/new-project/project"), root, { recursive: true });
  const originalGuide = await readFile(join(root, ".voidra/README.md"), "utf8");
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      (p): p is [string, string] =>
        p[1] !== undefined && p[0] !== "ELECTRON_RUN_AS_NODE",
    ),
  );
  const app = await _electron.launch({
    args: [resolve("apps/desktop"), `--project=${root}`],
    env: {
      ...env,
      VOIDRA_DATA_DIR: join(temp, "data"),
      ...(nativeCoverageDirectory
        ? { NODE_V8_COVERAGE: nativeCoverageDirectory }
        : {}),
    },
  });
  try {
    const page = await app.firstWindow();
    await page.locator('[data-app-ready="true"]').waitFor();
    await expect
      .poll(
        () =>
          page
            .getByRole("button", {
              name: "New action",
              exact: true,
            })
            .count(),
        { timeout: 5000 },
      )
      .toBe(1);
    await page.getByRole("button", { name: "New action", exact: true }).click();
    await page.getByRole("radio", { name: "Normal", exact: true }).check();
    await page.getByLabel("Action type", { exact: true }).selectOption("docs");
    await page.getByLabel("Title", { exact: true }).fill('Fix docs: "install"');
    await page
      .getByLabel("Description", { exact: true })
      .fill("## Goal\nDocument how to install.\n");
    await page
      .getByRole("button", { name: "Create action", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "Create action", exact: true })
      .waitFor({ state: "hidden", timeout: 30000 });
    await page
      .getByText('Fix docs: "install"', { exact: true })
      .waitFor({ timeout: 5000 });
    const checked = await checkProject(root);
    expect(checked.diagnostics).toEqual([]);
    const record = [...checked.records.values()].find(
      (r) =>
        r.kind === "action" && r.document.data.title === 'Fix docs: "install"',
    );
    expect(record?.document.data).toMatchObject({
      type: "docs",
      stage: "implement",
      status: "ready",
      doneBy: "agent",
    });
    expect(record?.document.body).toBe("## Goal\nDocument how to install.\n");
    const guide = await readFile(join(root, ".voidra/README.md"), "utf8");
    expect(guide).toBe(originalGuide);
    const bad = await page.evaluate(() =>
      window.voidra.invoke({
        command: "create-action",
        title: "",
        description: "bad",
      } as never),
    );
    expect(bad.ok).toBe(false);
  } finally {
    await app.close();
    await rm(temp, { recursive: true, force: true, maxRetries: 3 });
  }
}, 30000);
