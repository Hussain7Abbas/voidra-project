import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { AiService } from "../src/main/ai-service.ts";
import { AiSettings } from "../src/main/ai-settings.ts";
import type { CodingClient } from "../src/shared/team.ts";

const context = {
  feature: "rewrite" as const,
  notes: "Clear rough notes",
  target: "idea" as const,
  sources: [],
};
it("binds exact context, client, model and effort, rechecks completion and validates editable suggestions", async () => {
  const root = await mkdtemp(join(tmpdir(), "voidra-ai-service-"));
  let selected: CodingClient = "codex",
    invalid = false;
  try {
    const settings = new AiSettings(join(root, "ai.json"));
    const service = new AiService(
      settings,
      {
        async complete({ onText, preferences }) {
          expect(preferences.client).toBe(selected);
          const result = invalid
            ? "{}"
            : '{"title":"Clear title","description":"A useful outcome"}';
          onText(result);
          return result;
        },
      },
      async () => selected,
    );
    const preview = await service.preview(context);
    await expect(
      service.generate(
        1,
        "stale",
        { ...context, notes: "Changed" },
        preview.revision,
        () => {},
      ),
    ).rejects.toThrow(/changed/);
    for (const configuration of [
      { model: "test", effort: "low" as const },
      { model: null, effort: "high" as const },
    ]) {
      await service.configure("codex", configuration);
      await expect(
        service.generate(1, "stale", context, preview.revision, () => {}),
      ).rejects.toThrow(/changed/);
    }
    selected = "claude-code";
    await expect(
      service.generate(1, "stale", context, preview.revision, () => {}),
    ).rejects.toThrow(/changed/);
    await expect(
      service.configure("codex", { model: null, effort: "low" }),
    ).rejects.toThrow(/agent changed/);
    const current = await service.preview(context),
      progress: number[] = [];
    expect(
      await service.generate(1, "request", context, current.revision, (count) =>
        progress.push(count),
      ),
    ).toEqual({
      feature: "rewrite",
      title: "Clear title",
      description: "A useful outcome",
    });
    expect(progress).toHaveLength(1);
    expect(progress[0]).toBeTypeOf("number");
    invalid = true;
    await expect(
      service.generate(1, "invalid", context, current.revision, () => {}),
    ).rejects.toThrow(/invalid/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
it("cancels by sender window, close and settings changes while refusing concurrent calls", async () => {
  const root = await mkdtemp(join(tmpdir(), "voidra-ai-service-"));
  try {
    let ready = () => {};
    let started = new Promise<void>((resolve) => {
      ready = resolve;
    });
    const service = new AiService(
      new AiSettings(join(root, "ai.json")),
      {
        complete({ signal }) {
          ready();
          return new Promise((_resolve, reject) =>
            signal.addEventListener("abort", () => reject(Error("cancelled")), {
              once: true,
            }),
          );
        },
      },
      async () => "codex",
    );
    const preview = await service.preview(context);
    for (const stop of [
      () => service.cancel(1, "id"),
      () => service.close(1),
      () => service.configure("codex", { model: null, effort: "low" }),
    ]) {
      const request = service.generate(
        1,
        "id",
        context,
        preview.revision,
        () => {},
      );
      const rejected = expect(request).rejects.toThrow(/cancel/);
      await started;
      expect(service.cancel(2, "id")).toBe(false);
      await expect(
        service.generate(1, "other", context, preview.revision, () => {}),
      ).rejects.toThrow(/running/);
      await stop();
      await rejected;
      started = new Promise<void>((resolve) => {
        ready = resolve;
      });
    }
    expect(service.cancel(1, "missing")).toBe(false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("rejects cancellation arriving during the final configuration recheck", async () => {
  const root = await mkdtemp(join(tmpdir(), "voidra-ai-race-"));
  try {
    let reads = 0;
    const service = new AiService(
      new AiSettings(join(root, "ai.json")),
      {
        async complete() {
          return '{"title":"Draft","description":"Editable"}';
        },
      },
      async () => {
        if (++reads === 3) service.cancelAll();
        return "codex";
      },
    );
    const preview = await service.preview(context);
    await expect(
      service.generate(1, "race", context, preview.revision, () => {}),
    ).rejects.toThrow(/cancelled/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
