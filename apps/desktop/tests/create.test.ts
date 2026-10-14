import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron } from "@playwright/test";
import { expect, it } from "vitest";
import { checkProject } from "voidra";
import { nativeCoverageDirectory } from "./coverage-setup.ts";

it("creates minimal planning files through the app, leaves code untouched and publishes no write echo", async () => {
  const temp = await mkdtemp(join(tmpdir(), "voidra-create-"));
  const root = join(temp, "project");
  await mkdir(root);
  await writeFile(join(root, "code.ts"), "export const existing = true;\n");
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
    await page.evaluate(() => {
      const w = window as unknown as { changes: number };
      w.changes = 0;
      window.voidra.subscribe((e) => {
        if (e.type === "changed") w.changes++;
      });
    });
    const created = await page.evaluate(() =>
      window.voidra.invoke({ command: "create-voidra" }),
    );
    expect(created.ok).toBe(true);
    const version = await app.evaluate(({ app }) => app.getVersion());
    expect(
      JSON.parse(await readFile(join(root, ".voidra/voidra.json"), "utf8"))
        .createdWith,
    ).toBe(`voidra-project/${version}`);
    expect((await checkProject(root)).diagnostics).toEqual([]);
    expect(await readdir(root)).toEqual([".voidra", "code.ts"]);
    expect(await readFile(join(root, "code.ts"), "utf8")).toBe(
      "export const existing = true;\n",
    );
    expect(
      JSON.parse(await readFile(join(root, ".voidra/voidra.json"), "utf8"))
        .template,
    ).toBeNull();
    await page.waitForTimeout(500);
    expect(
      await page.evaluate(
        () => (window as unknown as { changes: number }).changes,
      ),
    ).toBe(1);
    const again = await page.evaluate(() =>
      window.voidra.invoke({ command: "create-voidra" } as never),
    );
    expect(again.ok).toBe(false);
  } finally {
    await app.close();
    await rm(temp, { recursive: true, force: true, maxRetries: 3 });
  }
}, 30000);
