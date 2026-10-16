import {
  chmod,
  cp,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { _electron, expect, type Page, test } from "@playwright/test";
import {
  checkProject,
  createAction,
  hash,
  schemas,
  serializeRecord,
} from "voidra";
import { publishFakeGate } from "../../../tools/fake-agent/src/gates.ts";

const environment = Object.fromEntries(
  Object.entries(process.env).filter(
    (entry): entry is [string, string] =>
      entry[1] !== undefined &&
      !["ELECTRON_RUN_AS_NODE", "NODE_V8_COVERAGE"].includes(entry[0]),
  ),
);
async function fixture(theme: "light" | "dark", customTitlebar = true) {
  const temp = await mkdtemp(join(tmpdir(), "voidra-panels-")),
    root = join(temp, "project"),
    data = join(temp, "data");
  await cp(resolve("../../fixtures/new-project/project"), root, {
    recursive: true,
  });
  await mkdir(data);
  await writeFile(
    join(data, "settings.json"),
    JSON.stringify({
      version: 1,
      theme,
      recents: [],
      customTitlebar,
      skillsOfferSeen: true,
    }),
  );
  const launch = () =>
    _electron.launch({
      args: [resolve("."), `--project=${root}`],
      env: { ...environment, VOIDRA_DATA_DIR: data },
    });
  return { temp, root, data, launch };
}
async function savedLayout(page: Page) {
  const result = await page.evaluate(() =>
    window.voidra.invoke({ command: "snapshot" }),
  );
  if (!result.ok || result.data.kind !== "snapshot")
    throw Error("Missing saved layout");
  return result.data.layout.value;
}
async function dragSeparator(page: Page, name: string, dx: number, dy: number) {
  const handle = page.getByRole("separator", { name, exact: true });
  await handle.hover();
  const bounds = await handle.boundingBox();
  if (!bounds) throw Error("Missing splitter bounds");
  const x = bounds.x + bounds.width / 2,
    y = bounds.y + bounds.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 8 });
  await page.mouse.up();
}
for (const theme of ["light", "dark"] as const)
  for (const custom of [true, false])
    test(`resizes, toggles and restores all panes in ${theme} with ${custom ? "custom" : "native"} titlebar`, async () => {
      const { temp, root, launch } = await fixture(theme, custom),
        source = await readFile(
          join(root, ".voidra/actions/act-000000/action.md"),
        );
      let app = await launch();
      try {
        let page = await app.firstWindow();
        await page
          .getByRole("heading", { name: "Tasks", exact: true })
          .waitFor();
        const titlebar = page.getByRole("region", {
          name: custom ? "Window titlebar" : "Workspace controls",
          exact: true,
        });
        await expect(
          titlebar.getByRole("group", { name: "Edit history" }),
        ).toBeVisible();
        for (const [name, open] of [
          ["Navigation", true],
          ["Actions", true],
          ["Waiting for you", false],
        ] as const) {
          const button = titlebar.getByRole("button", { name, exact: true });
          await expect(button).toHaveAttribute("aria-expanded", String(open));
          await expect(button.locator('svg [fill="currentColor"]')).toHaveCount(
            open ? 1 : 0,
          );
        }
        await expect(page.locator(".workspace-topbar")).toHaveCount(0);
        await expect(
          page.getByText("Local project", { exact: true }),
        ).toHaveCount(0);
        await expect(
          page
            .getByRole("navigation", { name: "Project pages" })
            .getByRole("button", { name: "Overview", exact: true }),
        ).toHaveCount(0);
        const navigation = page.getByRole("separator", {
            name: "Resize Project navigation",
            exact: true,
          }),
          actions = page.getByRole("separator", {
            name: "Resize Actions",
            exact: true,
          });
        const leftBefore = Number(
          await navigation.getAttribute("aria-valuenow"),
        );
        await navigation.focus();
        await page.keyboard.press("ArrowRight");
        await expect
          .poll(async () => (await savedLayout(page)).navigationWidth)
          .toBe(leftBefore + 16);
        const rightBefore = Number(await actions.getAttribute("aria-valuenow"));
        await actions.focus();
        await page.keyboard.press("ArrowLeft");
        await expect
          .poll(async () => (await savedLayout(page)).actionsWidth)
          .toBe(rightBefore + 16);
        await titlebar
          .getByRole("button", { name: "Waiting for you", exact: true })
          .click();
        await expect(page.locator("#waiting-panel")).toBeVisible();
        const waitingToggle = titlebar.getByRole("button", {
          name: "Waiting for you",
          exact: true,
        });
        await expect(
          waitingToggle.locator('svg [fill="currentColor"]'),
        ).toHaveCount(1);
        await page.mouse.move(400, 300);
        expect(
          await waitingToggle.evaluate(
            (button) => getComputedStyle(button).backgroundColor,
          ),
        ).toBe("rgba(0, 0, 0, 0)");

        await dragSeparator(page, "Resize Project navigation", 24, 0);
        await expect
          .poll(async () => (await savedLayout(page)).navigationWidth)
          .toBe(leftBefore + 40);
        await dragSeparator(page, "Resize Actions", -24, 0);
        await expect
          .poll(async () => (await savedLayout(page)).actionsWidth)
          .toBe(rightBefore + 40);
        await expect
          .poll(
            async () =>
              (await page.locator("#project-navigation").boundingBox())?.width,
          )
          .toBe(leftBefore + 40);
        await expect
          .poll(
            async () =>
              (await page.locator(".actions-pane").boundingBox())?.width,
          )
          .toBe(rightBefore + 40);
        const bottom = page.getByRole("separator", {
            name: "Resize Waiting for you",
            exact: true,
          }),
          bottomBefore = Number(await bottom.getAttribute("aria-valuenow"));
        await bottom.focus();
        await page.keyboard.press("ArrowUp");
        await expect
          .poll(async () => (await savedLayout(page)).waitingHeight)
          .toBe(bottomBefore + 16);
        await dragSeparator(page, "Resize Waiting for you", 0, -24);
        await expect
          .poll(async () => (await savedLayout(page)).waitingHeight)
          .toBe(bottomBefore + 40);
        await expect
          .poll(
            async () =>
              (await page.locator(".waiting-pane").boundingBox())?.height,
          )
          .toBe(bottomBefore + 40);
        // Escape returns the live preview to its original size without a preference write.
        await navigation.hover();
        const box = await navigation.boundingBox();
        if (!box) throw Error("Missing navigation handle");
        await page.mouse.move(box.x + 3, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(box.x + 43, box.y + box.height / 2, { steps: 6 });
        await page.keyboard.press("Escape");
        await page.mouse.up();
        await expect(navigation).toHaveAttribute(
          "aria-valuenow",
          String(leftBefore + 40),
        );
        expect((await savedLayout(page)).navigationWidth).toBe(leftBefore + 40);
        await bottom.focus();
        await page.keyboard.press("Enter");
        await expect(page.locator("#waiting-panel")).toBeHidden();
        await expect(
          titlebar.getByRole("button", {
            name: "Waiting for you",
            exact: true,
          }),
        ).toBeFocused();
        await titlebar
          .getByRole("button", { name: "Actions", exact: true })
          .click();
        await titlebar
          .getByRole("button", { name: "Navigation", exact: true })
          .click();
        await expect
          .poll(async () => (await savedLayout(page)).navigationOpen)
          .toBe(false);
        await expect
          .poll(async () => (await savedLayout(page)).actionsOpen)
          .toBe(false);
        await expect
          .poll(async () => (await savedLayout(page)).waitingOpen)
          .toBe(false);
        const saved = await savedLayout(page);
        await app.close();
        app = await launch();
        page = await app.firstWindow();
        await page
          .getByRole("heading", { name: "Tasks", exact: true })
          .waitFor();
        await expect(page.locator("#project-navigation")).toBeHidden();
        await expect(page.locator("#actions-sidebar")).toBeHidden();
        await expect(page.locator("#waiting-panel")).toBeHidden();
        expect(await savedLayout(page)).toEqual(saved);
        // Native View accelerators use the same toggle path as the titlebar.
        await page.keyboard.press("ControlOrMeta+Alt+1");
        await expect(page.locator("#project-navigation")).toBeVisible();
        await page.keyboard.press("ControlOrMeta+Alt+2");
        await expect(page.locator("#actions-sidebar")).toBeVisible();
        await app.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()[0]?.setSize(800, 600),
        );
        await expect
          .poll(
            async () => (await page.locator("main").boundingBox())?.width ?? 0,
          )
          .toBeGreaterThanOrEqual(320);
        await expect
          .poll(
            async () =>
              (
                await page
                  .getByRole("form", { name: "Task filters", exact: true })
                  .boundingBox()
              )?.height ?? Infinity,
          )
          .toBeLessThan(110);
        expect(
          (await new AxeBuilder({ page }).setLegacyMode(true).analyze())
            .violations,
        ).toEqual([]);
        await page.screenshot({
          path: resolve(
            `../../.cache/screenshots/v11-p07-panels-${theme}-${custom ? "custom" : "native"}.png`,
          ),
        });
        expect(
          await readFile(join(root, ".voidra/actions/act-000000/action.md")),
        ).toEqual(source);
      } finally {
        await app.close();
        await rm(temp, { recursive: true, force: true });
      }
    });

for (const theme of ["light", "dark"] as const)
  test(`bottom attention preserves typing, dismissal and answer drafts in ${theme}`, async () => {
    const { temp, root, data, launch } = await fixture(theme);
    let app = await launch(),
      protectedFolder: string | null = null;
    try {
      let page = await app.firstWindow();
      await page.getByRole("heading", { name: "Tasks", exact: true }).waitFor();
      await page.getByRole("button", { name: "Add task", exact: true }).click();
      let dialog = page.getByRole("dialog", {
        name: "Create action",
        exact: true,
      });
      await dialog.getByRole("radio", { name: "Normal", exact: true }).check();
      await dialog.getByLabel("Title", { exact: true }).fill("Private typing");
      const description = dialog.getByLabel("Description", { exact: true });
      await description.fill("Keep **typing** here.");
      await publishFakeGate(root, "act-000000", "questions");
      let project = await checkProject(root),
        qPath = ".voidra/actions/act-000000/questions.md",
        doc = project.records.get(qPath)?.document;
      if (!doc) throw Error("Missing fixture questions");
      const rounds = structuredClone(doc.data.rounds) as {
        questions: { text: string }[];
      }[];
      const first = rounds[0]?.questions[0];
      if (!first) throw Error("Missing first question");
      first.text = "Who can read the **notes**?";
      await writeFile(
        join(root, qPath),
        serializeRecord(doc, { ...doc.data, rounds }),
      );
      await expect(page.locator("#waiting-panel")).toBeVisible();
      await expect(description).toBeFocused();
      await expect(description).toContainText("typing");
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      let panel = page.locator("#waiting-panel");
      await expect(
        panel.locator("strong").filter({ hasText: "notes" }),
      ).toBeVisible();
      await panel
        .getByRole("button", { name: "Who can read the notes?", exact: true })
        .click();
      await panel
        .getByRole("radio", { name: "Write my own answer", exact: true })
        .check();
      await panel
        .getByLabel("Your answer", { exact: true })
        .fill("**Pending** private answer");
      await expect(
        panel.getByRole("button", { name: /^Restore draft/ }),
      ).toBeVisible();
      const draftFile = (
        await readdir(join(data, "form-drafts"), { recursive: true })
      ).find((file) => file.endsWith(".json"));
      if (!draftFile) throw Error("Missing private draft");
      protectedFolder = dirname(join(data, "form-drafts", draftFile));
      await chmod(protectedFolder, 0o500);
      await panel
        .getByLabel("Your answer", { exact: true })
        .fill("**Pending** answer after storage failure");
      await expect(
        page
          .getByText(
            "The draft could not be saved on this computer. Keep this form open and retry.",
            { exact: true },
          )
          .first(),
      ).toBeVisible();
      await panel
        .getByRole("button", { name: "Hide Waiting for you", exact: true })
        .click();
      await expect(
        page.getByRole("alert").filter({
          hasText: "The draft could not be saved on this computer.",
        }),
      ).toHaveCount(2);
      await expect(panel).toBeVisible();
      await chmod(protectedFolder, 0o700);
      protectedFolder = null;
      await panel
        .getByRole("button", { name: "Hide Waiting for you", exact: true })
        .click();
      await expect(panel).toBeHidden();
      await expect
        .poll(async () => (await savedLayout(page)).waitingOpen)
        .toBe(false);
      await expect
        .poll(async () => (await savedLayout(page)).seen.length)
        .toBeGreaterThan(0);
      // A changed action body does not create a new unanswered question.
      const path = join(root, ".voidra/actions/act-000000/action.md"),
        old = await readFile(path, "utf8");
      await writeFile(path, `${old}\nUnrelated source note.\n`);
      await expect
        .poll(async () => {
          const result = await page.evaluate(() =>
            window.voidra.invoke({ command: "workspace" }),
          );
          return result.ok && result.data.kind === "workspace"
            ? result.data.workspace.actions.find(
                (a) => a.data.id === "act-000000",
              )?.editRevision
            : null;
        })
        .toBe(hash(`${old}\nUnrelated source note.\n`));
      await expect(panel).toBeHidden();
      await app.close();
      app = await launch();
      page = await app.firstWindow();
      await page.getByRole("heading", { name: "Tasks", exact: true }).waitFor();
      panel = page.locator("#waiting-panel");
      await expect(panel).toBeHidden();
      const release = page.getByLabel("Release", { exact: true });
      await release.focus();
      const next = await createAction(root, {
        type: "feature",
        title: "New attention",
        description: "Another question",
        by: "You",
      });
      await publishFakeGate(root, next, "questions");
      await expect(panel).toBeVisible();
      await expect(release).toBeFocused();
      await panel
        .getByRole("listitem")
        .filter({ hasText: "act-000000" })
        .getByRole("button", { name: "Who can read the notes?", exact: true })
        .click();
      await panel.getByRole("button", { name: /^Restore draft/ }).click();
      await expect(
        panel.getByLabel("Your answer", { exact: true }),
      ).toContainText("answer after storage failure");
      project = await checkProject(root);
      doc = project.records.get(qPath)?.document;
      if (!doc) throw Error("Missing restored question");
      await writeFile(
        join(root, qPath),
        `${doc.raw}\nOutside question change.\n`,
      );
      await panel
        .getByRole("button", { name: "Save answer", exact: true })
        .click();
      await expect(
        panel.getByRole("alert").filter({ hasText: "Questions changed" }),
      ).toBeVisible();
      expect(
        schemas.questions.parse(
          (await checkProject(root)).records.get(qPath)?.document.data,
        ).rounds[0]?.questions[0]?.answer,
      ).toBeUndefined();
      expect(
        (await new AxeBuilder({ page }).setLegacyMode(true).analyze())
          .violations,
      ).toEqual([]);
      // Capture draft survives independently of answer restoration.
      await page.getByRole("button", { name: "Add task", exact: true }).click();
      dialog = page.getByRole("dialog", { name: "Create action", exact: true });
      await dialog
        .getByRole("button", { name: /Restore draft .*Private typing/ })
        .click();
      await expect(
        dialog.getByLabel("Description", { exact: true }),
      ).toContainText("typing");
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
    } finally {
      if (protectedFolder) await chmod(protectedFolder, 0o700);
      await app.close();
      await rm(temp, { recursive: true, force: true });
    }
  });

test("bottom human checklist completion and reopened work use real history", async () => {
  const { temp, root, launch } = await fixture("light");
  const id = await createAction(root, {
    type: "docs",
    title: "Manual access",
    description: "Confirm **access**.",
    by: "You",
    doneBy: "you",
    steps: ["Confirm access"],
  });
  const app = await launch();
  try {
    const page = await app.firstWindow(),
      panel = page.locator("#waiting-panel");
    await expect(panel).toBeVisible();
    await panel
      .getByRole("button", {
        name: "Open Your tasks: Manual access",
        exact: true,
      })
      .click();
    await expect(
      panel.locator("strong").filter({ hasText: "access" }),
    ).toBeVisible();
    await panel
      .getByRole("checkbox", { name: "Confirm access", exact: true })
      .check();
    await expect
      .poll(
        async () =>
          (await checkProject(root)).records.get(
            `.voidra/actions/${id}/action.md`,
          )?.document.data.status,
      )
      .toBe("complete");
    await expect.poll(async () => (await savedLayout(page)).seen).toEqual([]);
    await panel
      .getByRole("button", { name: "Hide Waiting for you", exact: true })
      .click();
    await expect(panel).toBeHidden();
    await page
      .getByRole("group", { name: "Edit history", exact: true })
      .getByRole("button", { name: /^Undo/ })
      .click();
    await expect(panel).toBeVisible();
    await expect(
      panel.getByRole("checkbox", { name: "Confirm access", exact: true }),
    ).not.toBeChecked();
  } finally {
    await app.close();
    await rm(temp, { recursive: true, force: true });
  }
});
