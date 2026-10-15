import { hash } from "voidra";
import type { AiContext, AiSuggestion } from "../shared/ai.ts";
import { buildAiPrompt, parseAiSuggestion } from "./ai-prompts.ts";
import type { AiPreferences, AiSettings } from "./ai-settings.ts";
import type { OpenRouterClient, RouterModel } from "./openrouter.ts";

export class AiService {
  private active = new Map<
    string,
    { window: number; controller: AbortController }
  >();
  private epoch = 0;
  readonly settings: AiSettings;
  readonly client: OpenRouterClient;
  constructor(settings: AiSettings, client: OpenRouterClient) {
    this.settings = settings;
    this.client = client;
  }
  status(): Promise<AiPreferences> {
    return this.settings.status();
  }
  private cancelAll(): void {
    this.epoch++;
    for (const request of this.active.values()) request.controller.abort();
  }
  async setKey(key: string): Promise<void> {
    this.cancelAll();
    await this.settings.setKey(key);
  }
  async removeKey(): Promise<void> {
    this.cancelAll();
    await this.settings.removeKey();
  }
  async setModel(model: string): Promise<void> {
    this.cancelAll();
    await this.settings.setModel(model);
  }
  cancel(window: number, id: string): boolean {
    const request = this.active.get(`${window}:${id}`);
    if (!request) return false;
    request.controller.abort();
    return true;
  }
  close(window: number): void {
    for (const request of this.active.values())
      if (request.window === window) request.controller.abort();
  }
  async models(): Promise<RouterModel[]> {
    const key = await this.settings.key();
    if (!key) throw new Error("Add an OpenRouter key in Settings first");
    const models = await this.client.models(key);
    if (JSON.stringify(models).includes(key))
      throw new Error("OpenRouter returned unsafe model data");
    return models;
  }
  async test(): Promise<{ connected: true }> {
    const key = await this.settings.key();
    if (!key) throw new Error("Add an OpenRouter key in Settings first");
    return this.client.test(key);
  }
  async preview(context: AiContext): Promise<{
    version: number;
    revision: string;
    model: string;
    text: string;
  }> {
    const preferences = await this.settings.configured();
    if (!preferences.configured)
      throw new Error("Add an OpenRouter key in Settings first");
    if (!preferences.model)
      throw new Error("Choose an AI model in Settings first");
    const prompt = buildAiPrompt(context);
    return {
      version: prompt.version,
      revision: hash(
        JSON.stringify({ prompt: prompt.revision, model: preferences.model }),
      ),
      model: preferences.model,
      text: prompt.preview,
    };
  }
  async generate(
    window: number,
    id: string,
    context: AiContext,
    revision: string,
    onProgress: (characters: number) => void,
  ): Promise<AiSuggestion> {
    if ([...this.active.values()].some((request) => request.window === window))
      throw new Error("An AI request is already running in this window");
    const prompt = buildAiPrompt(context);
    const controller = new AbortController(),
      identity = `${window}:${id}`,
      epoch = this.epoch;
    this.active.set(identity, { window, controller });
    try {
      const key = await this.settings.key(),
        preferences = await this.settings.configured();
      if (!key) throw new Error("Add an OpenRouter key in Settings first");
      if (!preferences.model)
        throw new Error("Choose an AI model in Settings first");
      if (
        hash(
          JSON.stringify({ prompt: prompt.revision, model: preferences.model }),
        ) !== revision
      )
        throw Error(
          "Selected text or model changed; review the current privacy preview",
        );
      if (epoch !== this.epoch || controller.signal.aborted)
        throw new Error("AI request cancelled");
      let characters = 0;
      const text = await this.client.complete({
        key,
        model: preferences.model,
        messages: prompt.messages,
        signal: controller.signal,
        onText: (part) => {
          characters += part.length;
          onProgress(characters);
        },
      });
      if (epoch !== this.epoch || controller.signal.aborted)
        throw new Error("AI request cancelled");
      if (text.includes(key))
        throw new Error(
          "OpenRouter returned unsafe suggestion content; your form is unchanged",
        );
      return parseAiSuggestion(context, text);
    } finally {
      this.active.delete(identity);
    }
  }
}
