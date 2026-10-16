import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { AiSettings } from "../src/main/ai-settings.ts";

it("persists separate agent model/effort settings, serializes writes and discards obsolete encrypted credentials without unlocking them", async () => {
  const root = await mkdtemp(join(tmpdir(), "voidra-ai-settings-")),
    file = join(root, "ai.json");
  try {
    await writeFile(
      file,
      JSON.stringify({
        version: 1,
        key: "obsolete-ciphertext",
        model: "router/model",
      }),
    );
    const store = new AiSettings(file);
    await store.migrate();
    expect(await readFile(file, "utf8")).not.toMatch(/ciphertext|router/);
    expect(await store.configuration("codex")).toEqual({
      model: null,
      effort: "low",
    });
    await Promise.all([
      store.set("codex", { model: "gpt-test", effort: "high" }),
      store.set("claude-code", { model: "haiku", effort: "low" }),
    ]);
    const restarted = new AiSettings(file);
    expect(await restarted.configuration("codex")).toEqual({
      model: "gpt-test",
      effort: "high",
    });
    expect(await restarted.configuration("claude-code")).toEqual({
      model: "haiku",
      effort: "low",
    });
    expect((await stat(file)).mode & 0o777).toBe(0o600);
    await expect(
      store.set("claude-code", { model: null, effort: "minimal" }),
    ).rejects.toThrow(/effort/);
    await expect(
      store.set("codex", { model: "--shell $(unsafe)", effort: "low" }),
    ).rejects.toThrow();
    await writeFile(file, "{");
    await expect(store.migrate()).rejects.toThrow(/preserved/);
    expect(await readFile(file, "utf8")).toBe("{");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
