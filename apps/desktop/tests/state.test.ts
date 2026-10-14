import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { AppStore, resolveTheme, WindowRegistry } from "../src/main/state.ts";
import { requestSchema, responseSchema } from "../src/shared/bridge.ts";

it("persists theme and canonical recent folders; reports moved folders", async () => {
  const root = await mkdtemp(join(tmpdir(), "voidra-state-"));
  try {
    const first = join(root, "one");
    const second = join(root, "two");
    await mkdir(first);
    await mkdir(second);
    const store = new AppStore(join(root, "settings.json"));
    expect((await store.read()).theme).toBe("system");
    expect((await store.read()).skillsOfferSeen).toBe(false);
    await store.dismissSkillsOffer();
    expect(
      (await new AppStore(join(root, "settings.json")).read()).skillsOfferSeen,
    ).toBe(true);
    await store.setTheme("dark");
    await store.remember(first);
    await store.remember(second);
    await store.remember(first);
    expect((await store.list()).map((p) => p.name)).toEqual(["one", "two"]);
    await rm(first, { recursive: true });
    expect((await store.list())[0]?.missing).toBe(true);
    await store.remove((await store.list())[0]?.path ?? "");
    expect(
      (await new AppStore(join(root, "settings.json")).read()).recents,
    ).toHaveLength(1);
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
    await expect(store.remember(first)).rejects.toThrow();
    await expect(store.remember(join(root, "settings.json"))).rejects.toThrow(
      /folder/,
    );
    await writeFile(join(root, "invalid.json"), "{");
    await expect(
      new AppStore(join(root, "invalid.json")).read(),
    ).rejects.toThrow(/settings/);
    expect(await readFile(join(root, "invalid.json"), "utf8")).toBe("{");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
it("serializes simultaneous settings edits and preserves unknown fields", async () => {
  const root = await mkdtemp(join(tmpdir(), "voidra-store-"));
  try {
    const file = join(root, "settings.json");
    await writeFile(
      file,
      JSON.stringify({
        version: 1,
        theme: "system",
        recents: [],
        future: { keep: true },
      }),
    );
    const store = new AppStore(file);
    await Promise.all([store.setTheme("dark"), store.setTheme("light")]);
    expect((await store.read()).theme).toBe("light");
    expect(JSON.parse(await readFile(file, "utf8")).future).toEqual({
      keep: true,
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
it("maps canonical projects to one live window", () => {
  const registry = new WindowRegistry();
  registry.register(1, "one");
  registry.register(2, "two");
  expect(registry.find("one")).toBe(1);
  expect(registry.project(2)).toBe("two");
  expect(() => registry.register(3, "one")).toThrow();
  registry.remove(1);
  expect(registry.find("one")).toBeUndefined();
  expect(registry.project(1)).toBeNull();
  registry.register(3, null);
  expect(registry.ids()).toEqual([2, 3]);
});
it("rejects arbitrary IPC calls and verifies typed responses", () => {
  expect(requestSchema.safeParse({ command: "snapshot" }).success).toBe(true);
  for (const input of [
    { command: "eval", code: "alert(1)" },
    { command: "open", path: "/arbitrary" },
    { command: "theme", theme: "pink" },
    { command: "snapshot", extra: true },
  ])
    expect(requestSchema.safeParse(input).success).toBe(false);
  expect(
    responseSchema.safeParse({
      ok: false,
      error: { code: "invalid-request", message: "Bad request" },
    }).success,
  ).toBe(true);
  expect(
    responseSchema.safeParse({ ok: true, data: { kind: "snapshot" } }).success,
  ).toBe(false);
});
