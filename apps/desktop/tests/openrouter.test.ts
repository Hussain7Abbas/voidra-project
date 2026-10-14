import { once } from "node:events";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { expect, it } from "vitest";
import { OpenRouterClient } from "../src/main/openrouter.ts";

async function server(
  handler: (request: IncomingMessage, response: ServerResponse) => void,
) {
  const server = createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing server");
  return {
    base: `http://127.0.0.1:${address.port}/api/v1`,
    async close() {
      server.closeAllConnections();
      await new Promise<void>((done, reject) =>
        server.close((error) => (error ? reject(error) : done())),
      );
    },
  };
}

it("loads text models, validates the actual key endpoint and streams split UTF-8/SSE frames without source or credential echoes", async () => {
  let authorization = "",
    body = "";
  const host = await server((request, response) => {
    authorization = request.headers.authorization ?? "";
    if (request.url === "/api/v1/models")
      return response.end(
        JSON.stringify({
          data: [
            {
              id: "test/text",
              name: "Text model",
              context_length: 8192,
              architecture: {
                input_modalities: ["text"],
                output_modalities: ["text"],
              },
              pricing: { prompt: "0", completion: "0" },
            },
            {
              id: "test/image",
              name: "Image",
              architecture: { output_modalities: ["image"] },
            },
          ],
        }),
      );
    if (request.url === "/api/v1/key")
      return response.end(
        JSON.stringify({ data: { label: "fixture", limit_remaining: 4 } }),
      );
    request.on("data", (chunk) => {
      body += String(chunk);
    });
    request.on("end", () => {
      response.writeHead(200, { "content-type": "text/event-stream" });
      const stream =
        ': processing\r\n\r\ndata: {"choices":[{"delta":{"content":"Hi "}}]}\r\n\r\ndata: {"choices":[{"delta":{"content":"🌿"}}]}\n\ndata: {"choices":[],"usage":{"completion_tokens":2}}\n\ndata: [DONE]\n\n';
      const bytes = Buffer.from(stream);
      for (let index = 0; index < bytes.length; index += 3)
        response.write(bytes.subarray(index, index + 3));
      response.end();
    });
  });
  try {
    const client = new OpenRouterClient(host.base, 1000),
      progress: string[] = [];
    expect(await client.models("fixture-secret")).toEqual([
      {
        id: "test/text",
        name: "Text model",
        contextLength: 8192,
        promptPrice: "0",
        completionPrice: "0",
      },
    ]);
    expect(await client.test("fixture-secret")).toEqual({ connected: true });
    expect(
      await client.complete({
        key: "fixture-secret",
        model: "test/text",
        messages: [
          { role: "system", content: "Summarize selected notes." },
          { role: "user", content: "Planning only." },
        ],
        onText: (text) => {
          progress.push(text);
        },
      }),
    ).toBe("Hi 🌿");
    expect(progress.join("")).toBe("Hi 🌿");
    expect(authorization).toBe("Bearer fixture-secret");
    expect(JSON.parse(body)).toMatchObject({
      model: "test/text",
      stream: true,
    });
    expect(body).not.toContain("fixture-secret");
  } finally {
    await host.close();
  }
});

it("maps authentication, rate limit, mid-stream errors and malformed/truncated data without exposing server text", async () => {
  for (const mode of ["auth", "rate", "mid", "bad", "truncated"]) {
    const host = await server((_request, response) => {
      if (mode === "auth" || mode === "rate") {
        response.writeHead(mode === "auth" ? 401 : 429);
        response.end('{"error":{"message":"Echo fixture-secret"}}');
        return;
      }
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.end(
        mode === "mid"
          ? 'data: {"error":{"code":429,"message":"Echo fixture-secret"}}\n\n'
          : mode === "bad"
            ? "data: {invalid}\n\n"
            : 'data: {"choices":[{"delta":{"content":"Partial"}}]}\n\n',
      );
    });
    try {
      const client = new OpenRouterClient(host.base, 1000);
      const request = client.complete({
        key: "fixture-secret",
        model: "test/text",
        messages: [{ role: "user", content: "Notes" }],
      });
      await expect(request).rejects.toThrow(
        mode === "auth"
          ? /key|authentication/i
          : mode === "rate" || mode === "mid"
            ? /rate|limit/i
            : /invalid|incomplete|ended/i,
      );
      await request.catch((error) => {
        expect(String(error)).not.toContain("fixture-secret");
      });
    } finally {
      await host.close();
    }
  }
});

it("aborts a live HTTP stream on cancellation and timeout, and rejects incomplete model/key responses", async () => {
  const host = await server((request, response) => {
    if (request.url === "/api/v1/models" || request.url === "/api/v1/key")
      return response.end("{}");
    response.writeHead(200, { "content-type": "text/event-stream" });
    response.write(": waiting\n\n");
  });
  try {
    const client = new OpenRouterClient(host.base, 80),
      cancel = new AbortController();
    const request = client.complete({
      key: "fixture",
      model: "test/model",
      messages: [{ role: "user", content: "Notes" }],
      signal: cancel.signal,
    });
    cancel.abort();
    await expect(request).rejects.toThrow(/cancel/i);
    await expect(
      client.complete({
        key: "fixture",
        model: "test/model",
        messages: [{ role: "user", content: "Notes" }],
      }),
    ).rejects.toThrow(/timed out/i);
    await expect(client.models("fixture")).rejects.toThrow(/model|response/i);
    await expect(client.test("fixture")).rejects.toThrow(/response/i);
  } finally {
    await host.close();
  }
});
