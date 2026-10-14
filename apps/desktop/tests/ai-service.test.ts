import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { AiService } from "../src/main/ai-service.ts";
import { AiSettings } from "../src/main/ai-settings.ts";
import { OpenRouterClient } from "../src/main/openrouter.ts";

const context = {
  feature: "rewrite" as const,
  notes: "Clear rough notes",
  target: "idea" as const,
  sources: [],
};
it("binds preview bytes, returns editable drafts with numeric-only progress and refuses provider key echoes", async () => {
  const root = await mkdtemp(join(tmpdir(), "voidra-ai-service-"));
  let echo = false;
  const host = createServer((request, response) => {
    request.resume();
    request.on("end", () => {
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.end(
        `data: ${JSON.stringify({ choices: [{ delta: { content: JSON.stringify({ title: echo ? "fixture-private-key" : "Clear title", description: "A useful outcome" }) } }] })}\n\ndata: [DONE]\n\n`,
      );
    });
  });
  host.listen(0, "127.0.0.1");
  await once(host, "listening");
  try {
    const address = host.address();
    if (!address || typeof address === "string")
      throw new Error("Missing server");
    const encryption = {
      async available() {
        return true;
      },
      async encrypt(value: string) {
        return Buffer.from(value.split("").reverse().join(""));
      },
      async decrypt(bytes: Buffer) {
        return {
          result: bytes.toString().split("").reverse().join(""),
          shouldReEncrypt: false,
        };
      },
    };
    const settings = new AiSettings(join(root, "ai.json"), encryption),
      service = new AiService(
        settings,
        new OpenRouterClient(`http://127.0.0.1:${address.port}/api/v1`, 1000),
      );
    await expect(service.preview(context)).rejects.toThrow(/key/i);
    await service.setKey("fixture-private-key");
    await expect(service.preview(context)).rejects.toThrow(/model/i);
    await service.setModel("test/model");
    const preview = await service.preview(context),
      progress: number[] = [];
    await expect(
      service.generate(
        1,
        "request",
        { ...context, notes: "Changed" },
        preview.revision,
        () => {},
      ),
    ).rejects.toThrow(/changed/i);
    expect(
      await service.generate(
        1,
        "request",
        context,
        preview.revision,
        (count) => {
          progress.push(count);
        },
      ),
    ).toEqual({
      feature: "rewrite",
      title: "Clear title",
      description: "A useful outcome",
    });
    expect(progress.every((count) => typeof count === "number")).toBe(true);
    expect(JSON.stringify(await service.status())).not.toContain(
      "fixture-private-key",
    );
    echo = true;
    await expect(
      service.generate(1, "echo", context, preview.revision, () => {}),
    ).rejects.toThrow(/unsafe|invalid/i);
  } finally {
    host.closeAllConnections();
    await new Promise<void>((done) => host.close(() => done()));
    await rm(root, { recursive: true, force: true });
  }
});

it("keeps cancellation window-scoped and aborts existing calls when the key is removed", async () => {
  const root = await mkdtemp(join(tmpdir(), "voidra-ai-cancel-")),
    host = createServer((_request, response) => {
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.write(": wait\n\n");
    });
  host.listen(0, "127.0.0.1");
  await once(host, "listening");
  try {
    const address = host.address();
    if (!address || typeof address === "string")
      throw new Error("Missing server");
    const settings = new AiSettings(join(root, "ai.json"), {
        async available() {
          return true;
        },
        async encrypt(value) {
          return Buffer.from(value.split("").reverse().join(""));
        },
        async decrypt(bytes) {
          return {
            result: bytes.toString().split("").reverse().join(""),
            shouldReEncrypt: false,
          };
        },
      }),
      service = new AiService(
        settings,
        new OpenRouterClient(`http://127.0.0.1:${address.port}/api/v1`, 1000),
      );
    await service.setKey("fixture-private-key");
    await service.setModel("test/model");
    const preview = await service.preview(context);
    const request = service.generate(
      1,
      "request",
      context,
      preview.revision,
      () => {},
    );
    await once(host, "request");
    expect(service.cancel(2, "request")).toBe(false);
    await expect(
      service.generate(1, "second", context, preview.revision, () => {}),
    ).rejects.toThrow(/running/i);
    const rejected = expect(request).rejects.toThrow(/cancel/i);
    await service.removeKey();
    await rejected;
    expect((await service.status()).configured).toBe(false);
    expect(service.cancel(1, "missing")).toBe(false);
  } finally {
    host.closeAllConnections();
    await new Promise<void>((done) => host.close(() => done()));
    await rm(root, { recursive: true, force: true });
  }
});
