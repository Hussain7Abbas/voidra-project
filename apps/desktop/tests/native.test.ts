import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron } from "@playwright/test";
import { expect, it } from "vitest";
import { nativeCoverageDirectory } from "./coverage-setup.ts";

it("opens the real exported renderer with isolation and a strict policy", async () => {
  const data = await mkdtemp(join(tmpdir(), "voidra-native-"));
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      (pair): pair is [string, string] =>
        pair[1] !== undefined && pair[0] !== "ELECTRON_RUN_AS_NODE",
    ),
  );
  const application = await _electron.launch({
    args: [resolve("apps/desktop")],
    env: {
      ...env,
      VOIDRA_DATA_DIR: data,
      ...(nativeCoverageDirectory
        ? { NODE_V8_COVERAGE: nativeCoverageDirectory }
        : {}),
    },
  });
  try {
    const page = await application.firstWindow();
    await page.locator('[data-app-ready="true"]').waitFor();
    expect(page.url()).toBe("app://voidra-project/");
    expect(
      await page.evaluate(() => ({
        require: typeof (window as unknown as { require: unknown }).require,
        node: typeof (window as unknown as { process: unknown }).process,
      })),
    ).toEqual({ require: "undefined", node: "undefined" });
    expect(
      await page.evaluate(() => window.open("https://example.com")),
    ).toBeNull();
    await page.evaluate(() => {
      window.location.href = "https://example.com";
    });
    await page.waitForTimeout(100);
    expect(page.url()).toBe("app://voidra-project/");
  } finally {
    await application.close();
    await rm(data, { recursive: true, force: true });
  }
}, 60000);
it("denies permissions and inline code in the running renderer", async () => {
  const data = await mkdtemp(join(tmpdir(), "voidra-security-"));
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      (pair): pair is [string, string] =>
        pair[1] !== undefined && pair[0] !== "ELECTRON_RUN_AS_NODE",
    ),
  );
  const application = await _electron.launch({
    args: [resolve("apps/desktop")],
    env: {
      ...env,
      VOIDRA_DATA_DIR: data,
      ...(nativeCoverageDirectory
        ? { NODE_V8_COVERAGE: nativeCoverageDirectory }
        : {}),
    },
  });
  try {
    const page = await application.firstWindow();
    await page.locator('[data-app-ready="true"]').waitFor();
    expect(await page.evaluate(() => Notification.requestPermission())).toBe(
      "denied",
    );
    expect(
      await page.evaluate(() => {
        const script = document.createElement("script");
        script.textContent = "window.__unsafe = true";
        document.body.append(script);
        return (window as unknown as { __unsafe?: boolean }).__unsafe ?? false;
      }),
    ).toBe(false);
    expect(
      await page.evaluate(async () => {
        try {
          await navigator.mediaDevices.getUserMedia({ audio: true });
          return "allowed";
        } catch (error) {
          return (error as Error).name;
        }
      }),
    ).toBe("NotAllowedError");
  } finally {
    await application.close();
    await rm(data, { recursive: true, force: true });
  }
}, 60000);
it("uses a real project service and focuses one window per canonical project", async () => {
  const { mkdir, writeFile, realpath } = await import("node:fs/promises");
  const data = await mkdtemp(join(tmpdir(), "voidra-projects-"));
  await mkdir(join(data, "one"));
  await mkdir(join(data, "two"));
  const one = await realpath(join(data, "one"));
  const two = await realpath(join(data, "two"));
  await writeFile(
    join(data, "settings.json"),
    JSON.stringify({
      version: 1,
      theme: "dark",
      recents: [
        { path: one, name: "one", lastOpened: new Date().toISOString() },
        { path: two, name: "two", lastOpened: new Date().toISOString() },
      ],
    }),
  );
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      (pair): pair is [string, string] =>
        pair[1] !== undefined && pair[0] !== "ELECTRON_RUN_AS_NODE",
    ),
  );
  const application = await _electron.launch({
    args: [resolve("apps/desktop"), `--project=${one}`],
    env: {
      ...env,
      VOIDRA_DATA_DIR: data,
      ...(nativeCoverageDirectory
        ? { NODE_V8_COVERAGE: nativeCoverageDirectory }
        : {}),
    },
  });
  try {
    const page = await application.firstWindow();
    await page.locator('[data-app-ready="true"]').waitFor();
    expect(await page.evaluate(() => window.voidra.sandboxed)).toBe(true);
    const initial = await page.evaluate(() =>
      window.voidra.invoke({ command: "snapshot" }),
    );
    expect(initial).toMatchObject({
      ok: true,
      data: {
        project: {
          name: "one",
          hasVoidra: false,
          sqliteVersion: expect.any(String),
        },
        theme: "dark",
        serviceState: "ready",
      },
    });
    expect(
      await page.evaluate(() =>
        window.voidra.invoke({ command: "open-recent", path: "/unlisted" }),
      ),
    ).toMatchObject({ ok: false, error: { code: "not-found" } });
    expect(
      await page.evaluate(() =>
        window.voidra.invoke({ command: "set-theme", theme: "light" }),
      ),
    ).toMatchObject({ ok: true });
    const response = await page.evaluate(
      async (folder) =>
        Promise.all([
          window.voidra.invoke({ command: "open-recent", path: folder }),
          window.voidra.invoke({ command: "open-recent", path: folder }),
        ]),
      two,
    );
    expect(response.every((r) => r.ok)).toBe(true);
    expect(
      await application.evaluate(
        ({ BrowserWindow }) => BrowserWindow.getAllWindows().length,
      ),
    ).toBe(2);
    expect(
      await page.evaluate(
        (folder) =>
          window.voidra.invoke({ command: "open-recent", path: folder }),
        one,
      ),
    ).toMatchObject({ ok: true });
    expect(
      await application.evaluate(
        ({ BrowserWindow }) => BrowserWindow.getAllWindows().length,
      ),
    ).toBe(2);
    if (process.env.VOIDRA_TEST_BACKGROUND === "1")
      expect(
        await application.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows().map((window) => ({
            visible: window.isVisible(),
            focused: window.isFocused(),
          })),
        ),
      ).toEqual([
        { visible: false, focused: false },
        { visible: false, focused: false },
      ]);
    const pid = await application.evaluate(
      ({ app }) =>
        app
          .getAppMetrics()
          .find(
            (metric) =>
              metric.serviceName === "Voidra project service" ||
              metric.name === "Voidra project service",
          )?.pid,
    );
    expect(pid).toBeTypeOf("number");
    process.kill(pid as number, "SIGTERM");
    await page.waitForTimeout(600);
    expect(
      await page.evaluate(() =>
        window.voidra.invoke({ command: "service-retry" }),
      ),
    ).toMatchObject({ ok: true, data: { project: { name: "one" } } });
    await application.evaluate(({ dialog }) => {
      dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] });
    });
    expect(
      await page.evaluate(() =>
        window.voidra.invoke({ command: "choose-folder" }),
      ),
    ).toEqual({ ok: true, data: { kind: "project", project: null } });
    expect(
      await page.evaluate(
        (folder) =>
          window.voidra.invoke({ command: "locate-recent", path: folder }),
        two,
      ),
    ).toEqual({ ok: true, data: { kind: "project", project: null } });
    expect(
      await page.evaluate(
        (folder) =>
          window.voidra.invoke({ command: "remove-recent", path: folder }),
        two,
      ),
    ).toMatchObject({ ok: true });
  } finally {
    await application.close();
    await rm(data, { recursive: true, force: true });
  }
}, 60000);
it("forwards a second instance to the running app", async () => {
  const { mkdir, realpath } = await import("node:fs/promises");
  const data = await mkdtemp(join(tmpdir(), "voidra-instance-"));
  await mkdir(join(data, "project"));
  const project = await realpath(join(data, "project"));
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      (pair): pair is [string, string] =>
        pair[1] !== undefined &&
        !["ELECTRON_RUN_AS_NODE", "NODE_V8_COVERAGE"].includes(pair[0]),
    ),
  );
  const application = await _electron.launch({
    args: [resolve("apps/desktop")],
    env: {
      ...env,
      VOIDRA_DATA_DIR: data,
      ...(nativeCoverageDirectory
        ? { NODE_V8_COVERAGE: nativeCoverageDirectory }
        : {}),
    },
  });
  try {
    const page = await application.firstWindow();
    await page.locator('[data-app-ready="true"]').waitFor();
    const opened = application.waitForEvent("window");
    const { spawn } = await import("node:child_process");
    const { default: executable } = await import("electron");
    const child = spawn(
      executable as unknown as string,
      [resolve("apps/desktop"), `--project=${project}`],
      {
        env: { ...env, VOIDRA_DATA_DIR: data, NODE_ENV: "test" },
        stdio: "ignore",
      },
    );
    await new Promise<void>((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", () => resolve());
    });
    const openedWindow = await opened;
    await openedWindow.locator('[data-app-ready="true"]').waitFor();
    expect(
      await openedWindow.evaluate(() =>
        window.voidra.invoke({ command: "snapshot" }),
      ),
    ).toMatchObject({ ok: true, data: { project: { name: "project" } } });
    expect(
      await application.evaluate(
        ({ BrowserWindow }) => BrowserWindow.getAllWindows().length,
      ),
    ).toBe(2);
  } finally {
    await application.close();
    await rm(data, { recursive: true, force: true });
  }
}, 60000);
