import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { _electron, expect, test } from "@playwright/test";
import { checkProject, serializeRecord } from "voidra";

for (const theme of ["light", "dark"] as const)
  test(`searches decisions, revisits assumptions and follows glossary/docs sources in ${theme}`, async () => {
    const temp = await mkdtemp(join(tmpdir(), "voidra-knowledge-ui-")),
      root = join(temp, "project");
    await cp(resolve("../../fixtures/busy-project/project"), root, {
      recursive: true,
    });
    const project = await checkProject(root);
    await rm(join(root, ".voidra/local/run.lock"), { force: true });
    for (const record of project.records.values()) {
      const data = record.document.data;
      if (record.kind === "run" && data.outcome === "running")
        await writeFile(
          join(root, record.document.file),
          serializeRecord(record.document, {
            ...data,
            outcome: "interrupted",
            endedAt: data.startedAt,
          }),
        );
      if (record.kind === "action" && data.status === "running")
        await writeFile(
          join(root, record.document.file),
          serializeRecord(record.document, { ...data, status: "ready" }),
        );
    }
    await mkdir(join(root, "docs/adr"), { recursive: true });
    await writeFile(
      join(root, "docs/adr/2026-10-13-storage.md"),
      "# Offline storage\n\nUse local files. Read the [architecture](../architecture.md).\n",
    );
    await writeFile(
      join(root, "docs/architecture.md"),
      "# Architecture\n\nThe private planning files stay in the repository.\n",
    );
    await writeFile(
      join(root, ".voidra/profile/tech.md"),
      "---\nblock: tech\ntitle: Technology\nanswers: []\n---\nRead [profile architecture](docs/architecture.md).\n",
    );
    const blueprint = join(root, ".voidra/actions/act-000000/blueprint.md");
    await writeFile(
      blueprint,
      `${await readFile(blueprint, "utf8")}\nRead [plan architecture](../../../docs/architecture.md) and [missing page](docs/missing.md).\n`,
    );
    await writeFile(
      join(root, "GLOSSARY.md"),
      "# Glossary\n\nAction: A unit of work.\n\nGate: A human decision.\n",
    );
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
      await page.getByRole("button", { name: "Profile", exact: true }).click();
      await page
        .getByRole("button", { name: "profile architecture", exact: true })
        .click();
      await expect(
        page.getByRole("dialog", { name: "Architecture", exact: true }),
      ).toContainText("private planning files");
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "Actions", exact: true }).click();
      await page
        .getByRole("button", { name: "feature discovery", exact: true })
        .click();
      await page
        .getByRole("button", { name: "plan architecture", exact: true })
        .click();
      await expect(
        page.getByRole("dialog", { name: "Architecture", exact: true }),
      ).toBeVisible();
      await page.keyboard.press("Escape");
      await page
        .getByRole("button", { name: "missing page", exact: true })
        .click();
      await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
        "document is missing",
      );
      await page.keyboard.press("Escape");
      await page
        .getByRole("button", { name: "Decisions", exact: true })
        .click();
      await page
        .getByLabel("Search decisions", { exact: true })
        .fill("storage");
      await expect(
        page.getByRole("heading", { name: "Offline storage", exact: true }),
      ).toBeVisible();
      await page
        .getByRole("button", {
          name: "Open source: Offline storage",
          exact: true,
        })
        .click();
      await expect(
        page.getByRole("dialog", { name: "Offline storage", exact: true }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "architecture", exact: true })
        .click();
      await expect(
        page.getByRole("dialog", { name: "Architecture", exact: true }),
      ).toContainText("private planning files");
      expect(
        (await new AxeBuilder({ page }).setLegacyMode(true).analyze())
          .violations,
      ).toEqual([]);
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "Glossary", exact: true }).click();
      await page.getByLabel("Search glossary", { exact: true }).fill("Gate");
      await expect(
        page.getByText("A human decision.", { exact: false }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Decisions", exact: true })
        .click();
      await page
        .getByLabel("Decision kind", { exact: true })
        .selectOption("assumption");
      const revisit = page.getByRole("button", {
        name: "Revisit assumption: What is the goal?",
        exact: true,
      });
      await revisit.focus();
      await page.keyboard.press("Enter");
      await page
        .getByRole("button", {
          name: "Create Profile change draft",
          exact: true,
        })
        .click();
      await expect(
        page.getByRole("heading", {
          name: "Revisit: What is the goal?",
          exact: true,
        }),
      ).toBeVisible();
      const after = await checkProject(root);
      expect(after.diagnostics).toEqual([]);
      expect(
        [...after.records.values()].find(
          (r) =>
            r.kind === "action" &&
            r.document.data.title === "Revisit: What is the goal?",
        )?.document.data,
      ).toMatchObject({ type: "profile-change", status: "draft" });
      expect(
        (await new AxeBuilder({ page }).setLegacyMode(true).analyze())
          .violations,
      ).toEqual([]);
      await rm(join(root, "GLOSSARY.md"));
      await page.getByRole("button", { name: "Glossary", exact: true }).click();
      await page
        .getByRole("button", { name: "Reload glossary", exact: true })
        .click();
      await expect(
        page.getByText(
          "Ask your agent to create GLOSSARY.md through a Docs action.",
          { exact: true },
        ),
      ).toBeVisible();
    } finally {
      await app.close();
      await rm(temp, { recursive: true, force: true });
    }
  });
