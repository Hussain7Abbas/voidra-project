import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { _electron, expect, test } from "@playwright/test";
import { checkProject, parseRecord, serializeRecord } from "voidra";

for (const theme of ["light", "dark"] as const)
  test(`dependencies, slices and outside-edit conflicts in ${theme}`, async () => {
    const temp = await mkdtemp(join(tmpdir(), "voidra-dependencies-")),
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
    const app = await _electron.launch({
      args: [resolve("."), `--project=${root}`],
      env: { ...env, VOIDRA_DATA_DIR: join(temp, "data") },
    });
    try {
      const page = await app.firstWindow();
      await page.locator('[data-app-ready="true"]').waitFor();
      await page.getByRole("button", { name: "Settings", exact: true }).click();
      await page.getByRole("tab", { name: "Appearance", exact: true }).click();
      await page.getByLabel("Theme", { exact: true }).selectOption(theme);
      await page.getByRole("tab", { name: "General", exact: true }).click();
      await page.keyboard.press("Escape");
      async function create(title: string, type: string, human = false) {
        await page
          .getByRole("button", { name: "New action", exact: true })
          .click();
        await page
          .getByLabel("Action type", { exact: true })
          .selectOption(type);
        await page
          .getByRole("radio", { name: human ? "You" : "Agent", exact: true })
          .check();
        await page.getByLabel("Title", { exact: true }).fill(title);
        await page
          .getByLabel("Description", { exact: true })
          .fill("Complete one observable setup outcome.");
        if (human) await page.getByLabel("Steps", { exact: true }).fill(title);
        await page
          .getByRole("button", { name: "Create action", exact: true })
          .click();
        await expect(page.getByRole("dialog")).toBeHidden({ timeout: 30000 });
      }
      await create("Provision dependencies", "feature");
      await create("Create account", "docs", true);
      await create("Confirm access", "docs", true);
      await create("Document integration", "docs");
      const records = [...(await checkProject(root)).records.values()].filter(
        (r) => r.kind === "action",
      );
      const id = (title: string) =>
        String(
          records.find((r) => r.document.data.title === title)?.document.data
            .id,
        );
      const parent = id("Provision dependencies");
      for (const child of ["Create account", "Confirm access"]) {
        await page.getByRole("button", { name: child, exact: true }).click();
        await page
          .getByRole("button", { name: "Edit dependencies", exact: true })
          .click();
        await page
          .getByLabel("Parent action", { exact: true })
          .selectOption(parent);
        await page
          .getByRole("button", { name: "Save changes", exact: true })
          .click();
        await expect(page.getByRole("dialog")).toBeHidden({ timeout: 30000 });
        await page
          .getByRole("button", { name: "Back to actions", exact: true })
          .click();
      }
      await expect(
        page.getByRole("button", {
          name: "Slices of Provision dependencies",
          exact: true,
        }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Document integration", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Edit dependencies", exact: true })
        .click();
      await page
        .getByRole("checkbox", { name: "Create account", exact: true })
        .check();
      await page
        .getByRole("button", { name: "Save changes", exact: true })
        .click();
      await expect(page.getByRole("dialog")).toBeHidden({ timeout: 30000 });
      await expect(
        page.getByRole("button", { name: "Queue for agent", exact: true }),
      ).toBeDisabled();
      await page
        .getByRole("button", { name: "Back to actions", exact: true })
        .click();
      for (const child of ["Create account", "Confirm access"]) {
        await page.getByRole("button", { name: child, exact: true }).click();
        await page.getByRole("checkbox", { name: child, exact: true }).check();
        await expect
          .poll(
            async () =>
              (await checkProject(root)).records.get(
                `.voidra/actions/${id(child)}/action.md`,
              )?.document.data.status,
          )
          .toBe("complete");
        await page
          .getByRole("button", { name: "Back to actions", exact: true })
          .click();
      }
      expect(
        (await checkProject(root)).records.get(
          `.voidra/actions/${parent}/action.md`,
        )?.document.data,
      ).toMatchObject({ stage: "done", completedBySlices: true });
      await page
        .getByRole("button", { name: "Document integration", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Queue for agent", exact: true }),
      ).toBeEnabled();
      await page
        .getByRole("button", { name: "Edit description", exact: true })
        .click();
      await page
        .getByLabel("Description", { exact: true })
        .fill("My intended updated description.");
      const path = `.voidra/actions/${id("Document integration")}/action.md`,
        old = parseRecord(path, await readFile(join(root, path)));
      await writeFile(
        join(root, path),
        serializeRecord(
          old,
          { ...old.data, outsideField: "preserve me" },
          "A teammate changed this description.",
        ),
      );
      await expect(
        page.getByRole("button", { name: "Reload action", exact: true }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Save changes", exact: true })
        .click();
      await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
        "changed",
      );
      expect(parseRecord(path, await readFile(join(root, path))).body).toBe(
        "A teammate changed this description.",
      );
      await page
        .getByRole("button", {
          name: "Overwrite current description",
          exact: true,
        })
        .click();
      await expect(page.getByRole("dialog")).toBeHidden({ timeout: 30000 });
      const saved = parseRecord(path, await readFile(join(root, path)));
      expect(saved.body).toBe("My intended updated description.");
      expect(saved.data.outsideField).toBe("preserve me");
      await page.waitForFunction(() =>
        Array.from(document.querySelectorAll("button")).every((b) =>
          b.getAnimations().every((a) => a.playState !== "running"),
        ),
      );
      expect(
        (await new AxeBuilder({ page }).setLegacyMode(true).analyze())
          .violations,
      ).toEqual([]);
      expect((await checkProject(root)).diagnostics).toEqual([]);
    } finally {
      await app.close();
      await rm(temp, { recursive: true, force: true, maxRetries: 3 });
    }
  });
