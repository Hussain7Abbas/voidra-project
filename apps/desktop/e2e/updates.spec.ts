import { once } from "node:events";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { _electron, expect, test } from "@playwright/test";

for (const theme of ["light", "dark"] as const)
  test(`update notice shows reviewed release notes and opt-out persists in ${theme}`, async () => {
    const temp = await mkdtemp(join(tmpdir(), "voidra-update-ui-"));
    let calls = 0;
    const host = createServer((request, response) => {
      expect(request.method).toBe("GET");
      expect(request.headers.authorization).toBeUndefined();
      calls++;
      response.end(
        JSON.stringify({
          tag_name: "v99.0.0",
          html_url:
            "https://github.com/Hussain7Abbas/voidra-project/releases/tag/v99.0.0",
          name: "Future fixture release",
          body: "Fixture release notes.\n<private-script> is plain text.",
          draft: false,
          prerelease: false,
        }),
      );
    });
    host.listen(0, "127.0.0.1");
    await once(host, "listening");
    const address = host.address();
    if (!address || typeof address === "string") throw Error("Missing server");
    const home = join(temp, "home");
    await mkdir(home);
    const env = Object.fromEntries(
      Object.entries(process.env).filter(
        (p): p is [string, string] =>
          p[1] !== undefined &&
          !["ELECTRON_RUN_AS_NODE", "NODE_V8_COVERAGE"].includes(p[0]),
      ),
    );
    const launch = () =>
      _electron.launch({
        args: [resolve(".")],
        env: {
          ...env,
          VOIDRA_DATA_DIR: join(temp, "data"),
          VOIDRA_TEST_SKILLS_HOME: home,
          VOIDRA_TEST_RELEASES_URL: `http://127.0.0.1:${address.port}/latest`,
        },
      });
    let app = await launch();
    try {
      let page = await app.firstWindow();
      await page.locator('[data-app-ready="true"]').waitFor();
      await expect(
        page.getByRole("region", { name: "Update available", exact: true }),
      ).toContainText("Fixture release notes.");
      await expect(
        page.getByRole("button", {
          name: "Download version 99.0.0",
          exact: true,
        }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Settings", exact: true }).click();
      await page.getByLabel("Appearance", { exact: true }).selectOption(theme);
      await page.getByLabel("Check for app updates", { exact: true }).uncheck();
      await expect(
        page.getByRole("region", { name: "Update available", exact: true }),
      ).toHaveCount(0);
      await page.getByRole("button", { name: "Done", exact: true }).click();
      expect(
        (await new AxeBuilder({ page }).setLegacyMode(true).analyze())
          .violations,
      ).toEqual([]);
      const previous = calls;
      await app.close();
      app = await launch();
      page = await app.firstWindow();
      await page.locator('[data-app-ready="true"]').waitFor();
      await expect(
        page.getByRole("region", { name: "Update available", exact: true }),
      ).toHaveCount(0);
      expect(calls).toBe(previous);
      await page.getByRole("button", { name: "Settings", exact: true }).click();
      await page.getByLabel("Check for app updates", { exact: true }).check();
      await page.getByRole("button", { name: "Done", exact: true }).click();
      await expect(
        page.getByRole("region", { name: "Update available", exact: true }),
      ).toBeVisible();
      expect(calls).toBe(previous + 1);
    } finally {
      await app.close();
      host.closeAllConnections();
      await new Promise<void>((done) => host.close(() => done()));
      await rm(temp, { recursive: true, force: true });
    }
  });
