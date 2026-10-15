import { createHash } from "node:crypto";
import { cp, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron } from "@playwright/test";
import { expect, it } from "vitest";
import { nativeCoverageDirectory } from "./coverage-setup.ts";

interface Workspace {
  hasVoidra: boolean;
  readOnly: boolean;
  tasks: {
    id: string;
    sourceIdea: string | null;
    column: string;
    parent: string | null;
  }[];
  actions: {
    data: { id: string; title: string };
    body: string;
    runs: unknown[];
  }[];
  diagnostics: { code: string; file: string; field: string }[];
}
async function load(project: string, data: string): Promise<Workspace> {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      (pair): pair is [string, string] =>
        pair[1] !== undefined && pair[0] !== "ELECTRON_RUN_AS_NODE",
    ),
  );
  const app = await _electron.launch({
    args: [resolve("apps/desktop"), `--project=${project}`],
    env: {
      ...env,
      VOIDRA_DATA_DIR: data,
      ...(nativeCoverageDirectory
        ? { NODE_V8_COVERAGE: nativeCoverageDirectory }
        : {}),
    },
  });
  try {
    const page = await app.firstWindow();
    await page.locator('[data-app-ready="true"]').waitFor();
    const response = (await page.evaluate(() =>
      window.voidra.invoke({ command: "workspace" } as never),
    )) as unknown as { ok: boolean; data: { workspace: Workspace } };
    expect(response.ok).toBe(true);
    return response.data.workspace;
  } finally {
    await app.close();
  }
}
it("loads records through the package and rebuilds deleted, corrupt and obsolete SQLite caches", async () => {
  const temp = await mkdtemp(join(tmpdir(), "voidra-index-"));
  const project = join(temp, "project"),
    data = join(temp, "data");
  try {
    await cp(resolve("fixtures/busy-project/project"), project, {
      recursive: true,
    });
    const before = await load(project, data);
    expect(before.hasVoidra).toBe(true);
    expect(before.diagnostics).toEqual([]);
    expect(before.actions.length).toBeGreaterThan(5);
    expect(before.tasks.length).toBe(before.actions.length);
    expect(before.tasks.some((task) => task.sourceIdea === "idea-000000")).toBe(
      true,
    );
    expect(before.tasks.some((task) => task.parent !== null)).toBe(true);
    expect(before.actions.some((action) => action.runs.length > 0)).toBe(true);
    const database = join(
      data,
      "projects",
      createHash("sha256")
        .update(await realpath(project))
        .digest("hex"),
      "index.sqlite",
    );
    await rm(database);
    expect(await load(project, data)).toEqual(before);
    await writeFile(database, "not a SQLite database");
    expect(await load(project, data)).toEqual(before);
    const app = await _electron.launch({
      args: [resolve("apps/desktop")],
      env: {
        ...(process.env as Record<string, string>),
        VOIDRA_DATA_DIR: join(temp, "other-data"),
      },
    });
    const window = await app.firstWindow();
    await window.locator('[data-app-ready="true"]').waitFor();
    try {
      await app.evaluate(
        `async ({app}, file) => {
        const {createRequire} = await import("node:module");
        const Database = createRequire(app.getAppPath()+"/package.json")("better-sqlite3");
        const db = new Database(file);
        db.pragma("user_version = 999");
        db.close();
      }`,
        database,
      );
    } finally {
      await app.close();
    }
    expect(await load(project, data)).toEqual(before);
  } finally {
    await rm(temp, { recursive: true, force: true, maxRetries: 3 });
  }
}, 60000);
it("reports file/field diagnostics, missing setup and newer read-only projects", async () => {
  const temp = await mkdtemp(join(tmpdir(), "voidra-invalid-"));
  try {
    for (const fixture of [
      "new-project",
      "newer-format",
      "broken/action",
      "interrupted-run",
    ]) {
      const project = join(temp, fixture.replaceAll("/", "-"));
      await cp(resolve("fixtures", fixture, "project"), project, {
        recursive: true,
      });
      const state = await load(
        project,
        join(temp, `data-${fixture.replaceAll("/", "-")}`),
      );
      if (fixture === "new-project") expect(state.diagnostics).toEqual([]);
      else {
        expect(state.readOnly).toBe(true);
        expect(state.diagnostics.some((d) => d.file && d.field)).toBe(true);
      }
    }
    const state = await load(temp, join(temp, "empty-data"));
    expect(state.hasVoidra).toBe(false);
    expect(state.actions).toEqual([]);
  } finally {
    await rm(temp, { recursive: true, force: true, maxRetries: 3 });
  }
}, 60000);
