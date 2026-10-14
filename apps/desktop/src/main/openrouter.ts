import { z } from "zod";

export interface RouterModel {
  id: string;
  name: string;
  contextLength: number | null;
  promptPrice: string | null;
  completionPrice: string | null;
}
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}
export class RouterError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}
function httpError(status: number): RouterError {
  if (status === 401 || status === 403)
    return new RouterError(
      "authentication",
      "OpenRouter did not accept the key. Check it in Settings.",
    );
  if (status === 429)
    return new RouterError(
      "rate-limit",
      "OpenRouter's rate limit was reached. Try again later.",
    );
  if (status === 402)
    return new RouterError(
      "balance",
      "The OpenRouter key has no available credit.",
    );
  return new RouterError(
    "unavailable",
    "OpenRouter could not complete the request. Try again later.",
  );
}
const invalid = () =>
  new RouterError(
    "invalid-response",
    "OpenRouter returned an invalid response; no suggestion was applied.",
  );
const modelSchema = z.looseObject({
  id: z.string().min(1).max(200),
  name: z.string().min(1).max(500),
  context_length: z.number().int().positive().nullable().optional(),
  architecture: z
    .looseObject({ output_modalities: z.array(z.string()).optional() })
    .optional(),
  pricing: z
    .looseObject({
      prompt: z.string().nullable().optional(),
      completion: z.string().nullable().optional(),
    })
    .optional(),
});
export class OpenRouterClient {
  readonly base: string;
  readonly timeoutMs: number;
  constructor(base = "https://openrouter.ai/api/v1", timeoutMs = 30000) {
    const url = new URL(base);
    if (
      url.username ||
      url.password ||
      url.hash ||
      url.search ||
      !(
        url.protocol === "https:" ||
        (url.protocol === "http:" &&
          ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname))
      )
    )
      throw new Error("Invalid OpenRouter endpoint");
    this.base = base.replace(/\/$/, "");
    this.timeoutMs = timeoutMs;
  }
  private async request<T>(
    path: string,
    key: string,
    init: RequestInit,
    consume: (response: Response) => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    if (!key.trim())
      throw new RouterError(
        "missing-key",
        "Add an OpenRouter key in Settings first.",
      );
    const controller = new AbortController();
    let timedOut = false;
    const abort = () => controller.abort();
    if (signal?.aborted)
      throw new RouterError("cancelled", "AI request cancelled.");
    signal?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.timeoutMs);
    try {
      const response = await fetch(`${this.base}/${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        redirect: "error",
        signal: controller.signal,
      });
      if (!response.ok) throw httpError(response.status);
      return await consume(response);
    } catch (error) {
      if (timedOut)
        throw new RouterError(
          "timeout",
          "The AI request timed out. Your form is unchanged.",
        );
      if (signal?.aborted)
        throw new RouterError("cancelled", "AI request cancelled.");
      if (error instanceof RouterError) throw error;
      throw new RouterError(
        "network",
        "The AI connection failed. Your form is unchanged.",
      );
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      controller.abort();
    }
  }
  private async json(response: Response): Promise<unknown> {
    if (!response.body) throw invalid();
    const reader = response.body.getReader(),
      decoder = new TextDecoder("utf-8", { fatal: true });
    let text = "",
      size = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.byteLength;
        if (size > 5 * 1024 * 1024) throw invalid();
        text += decoder.decode(part.value, { stream: true });
      }
      text += decoder.decode();
      try {
        return JSON.parse(text);
      } catch {
        throw invalid();
      }
    } finally {
      await reader.cancel().catch(() => {});
    }
  }
  models(key: string, signal?: AbortSignal): Promise<RouterModel[]> {
    return this.request(
      "models",
      key,
      { method: "GET" },
      async (response) => {
        const raw = z
          .object({ data: z.array(modelSchema).max(10000) })
          .safeParse(await this.json(response));
        if (!raw.success)
          throw new RouterError(
            "invalid-response",
            "OpenRouter returned an invalid model response.",
          );
        return raw.data.data
          .filter(
            (model) =>
              !model.architecture?.output_modalities ||
              model.architecture.output_modalities.includes("text"),
          )
          .map((model) => ({
            id: model.id,
            name: model.name,
            contextLength: model.context_length ?? null,
            promptPrice: model.pricing?.prompt ?? null,
            completionPrice: model.pricing?.completion ?? null,
          }));
      },
      signal,
    );
  }
  test(key: string, signal?: AbortSignal): Promise<{ connected: true }> {
    return this.request(
      "key",
      key,
      { method: "GET" },
      async (response) => {
        if (
          !z
            .object({ data: z.looseObject({}) })
            .safeParse(await this.json(response)).success
        )
          throw invalid();
        return { connected: true };
      },
      signal,
    );
  }
  complete(input: {
    key: string;
    model: string;
    messages: ChatMessage[];
    signal?: AbortSignal;
    onText?: (text: string) => void;
  }): Promise<string> {
    return this.request(
      "chat/completions",
      input.key,
      {
        method: "POST",
        body: JSON.stringify({
          model: input.model,
          messages: input.messages,
          stream: true,
          max_tokens: 2048,
        }),
      },
      async (response) => {
        if (!response.body) throw invalid();
        const reader = response.body.getReader(),
          decoder = new TextDecoder("utf-8", { fatal: true });
        let buffer = "",
          text = "",
          done = false;
        const frame = (value: string) => {
          const data = value
            .split(/\r?\n/)
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).trimStart())
            .join("\n");
          if (!data) return;
          if (data === "[DONE]") {
            done = true;
            return;
          }
          let raw: unknown;
          try {
            raw = JSON.parse(data);
          } catch {
            throw invalid();
          }
          const parsed = z
            .looseObject({
              error: z.looseObject({ code: z.number().optional() }).optional(),
              choices: z
                .array(
                  z.looseObject({
                    delta: z
                      .looseObject({
                        content: z.string().nullable().optional(),
                      })
                      .optional(),
                    finish_reason: z.string().nullable().optional(),
                  }),
                )
                .optional(),
            })
            .safeParse(raw);
          if (!parsed.success) throw invalid();
          if (parsed.data.error) throw httpError(parsed.data.error.code ?? 500);
          if (
            parsed.data.choices?.some(
              (choice) => choice.finish_reason === "error",
            )
          )
            throw invalid();
          for (const choice of parsed.data.choices ?? []) {
            const part = choice.delta?.content;
            if (!part) continue;
            text += part;
            if (text.length > 1024 * 1024) throw invalid();
            input.onText?.(part);
          }
        };
        try {
          while (!done) {
            const chunk = await reader.read();
            if (chunk.done) break;
            try {
              buffer += decoder.decode(chunk.value, { stream: true });
            } catch {
              throw invalid();
            }
            if (buffer.length > 1024 * 1024) throw invalid();
            while (!done) {
              const match = /\r?\n\r?\n/.exec(buffer);
              if (!match) break;
              frame(buffer.slice(0, match.index));
              buffer = buffer.slice(match.index + match[0].length);
            }
          }
          if (!done && buffer.trim()) frame(buffer + decoder.decode());
          if (!done)
            throw new RouterError(
              "invalid-response",
              "The AI stream ended before completion; no suggestion was applied.",
            );
          if (!text.trim()) throw invalid();
          return text;
        } finally {
          await reader.cancel().catch(() => {});
        }
      },
      input.signal,
    );
  }
}
