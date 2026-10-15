import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { AppStore } from "../src/main/state.ts";
import { requestSchema } from "../src/shared/bridge.ts";
import {
  fitWorkspaceLayout,
  workspaceLayoutSchema,
} from "../src/shared/workspace-layout.ts";

it("persists independent project panels and merges queued preference patches", async () => {
  const temp = await mkdtemp(join(tmpdir(), "voidra-layout-")),
    file = join(temp, "settings.json"),
    store = new AppStore(file);
  try {
    const initial = await store.workspaceLayout("/project/one");
    expect(initial.value).toMatchObject({
      navigationOpen: true,
      actionsOpen: true,
      waitingOpen: false,
      navigationWidth: 256,
      actionsWidth: 320,
      waitingHeight: 280,
      seen: [],
    });
    await Promise.all([
      store.setWorkspaceLayout("/project/one", {
        context: initial.context,
        patch: { navigationWidth: 300, navigationOpen: false },
      }),
      store.setWorkspaceLayout("/project/one", {
        context: initial.context,
        patch: { waitingHeight: 340, seen: ["a".repeat(64)] },
      }),
    ]);
    expect(
      (await new AppStore(file).workspaceLayout("/project/one")).value,
    ).toMatchObject({
      navigationWidth: 300,
      navigationOpen: false,
      waitingHeight: 340,
      seen: ["a".repeat(64)],
    });
    const second = await store.workspaceLayout("/project/two");
    expect(second.context).not.toBe(initial.context);
    expect(second.value.navigationOpen).toBe(true);
    await expect(
      store.setWorkspaceLayout("/project/two", {
        context: initial.context,
        patch: { actionsOpen: false },
      }),
    ).rejects.toThrow(/project changed/i);
    expect(
      (await store.workspaceLayout("/project/two")).value.actionsOpen,
    ).toBe(true);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
it("resets malformed layout alone and preserves unrelated and future settings", async () => {
  const temp = await mkdtemp(join(tmpdir(), "voidra-layout-bad-")),
    file = join(temp, "settings.json"),
    store = new AppStore(file);
  try {
    await store.setTheme("dark");
    const view = await store.workspaceLayout(null),
      raw = JSON.parse(await readFile(file, "utf8"));
    raw.future = { retain: true };
    raw.layouts = {
      [view.context]: {
        ...view.value,
        navigationWidth: -1,
        futureLayout: "retain",
      },
    };
    await writeFile(file, JSON.stringify(raw));
    expect((await store.workspaceLayout(null)).value.navigationWidth).toBe(256);
    expect((await store.read()).theme).toBe("dark");
    await store.setWorkspaceLayout(null, {
      context: view.context,
      patch: { actionsOpen: false },
    });
    const saved = JSON.parse(await readFile(file, "utf8"));
    expect(saved.future).toEqual({ retain: true });
    expect(saved.layouts[view.context].futureLayout).toBe("retain");
    for (const patch of [
      { actionsWidth: -1 },
      { waitingHeight: Infinity },
      { navigationWidth: 1e9 },
      { seen: ["raw question"] },
      { unknown: true },
    ])
      expect(
        requestSchema.safeParse({
          command: "set-workspace-layout",
          context: view.context,
          patch,
        }).success,
      ).toBe(false);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
it("fits visible panes to the usable viewport without changing stored sizes", () => {
  const input = workspaceLayoutSchema.parse({
      navigationWidth: 650,
      actionsWidth: 700,
      waitingHeight: 800,
      waitingOpen: true,
    }),
    saved = structuredClone(input);
  const fit = fitWorkspaceLayout(input, 800, 550);
  expect(fit.navigationWidth).toBeGreaterThanOrEqual(180);
  expect(fit.actionsWidth).toBeGreaterThanOrEqual(240);
  expect(
    800 - fit.navigationWidth - fit.actionsWidth - 12,
  ).toBeGreaterThanOrEqual(320);
  expect(550 - fit.waitingHeight - 6).toBeGreaterThanOrEqual(160);
  expect(input).toEqual(saved);
  expect(
    fitWorkspaceLayout(
      { ...input, navigationOpen: false, actionsOpen: false },
      800,
      550,
    ),
  ).toMatchObject({ navigationWidth: 0, actionsWidth: 0 });
});
