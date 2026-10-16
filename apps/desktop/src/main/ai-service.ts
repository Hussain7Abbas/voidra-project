import { hash } from "voidra";
import type {
  AiAgentConfiguration,
  AiContext,
  AiPreferences,
  AiSuggestion,
} from "../shared/ai.ts";
import type { CodingClient } from "../shared/team.ts";
import { buildAiPrompt, parseAiSuggestion } from "./ai-prompts.ts";
import type { AiSettings } from "./ai-settings.ts";
import type { AgentClient } from "./headless-agent.ts";

export class AiService {
  private active = new Map<
    string,
    { window: number; controller: AbortController }
  >();
  private epoch = 0;
  readonly settings: AiSettings;
  readonly client: AgentClient;
  private selectedClient: () => Promise<CodingClient>;
  constructor(
    settings: AiSettings,
    client: AgentClient,
    selectedClient: () => Promise<CodingClient>,
  ) {
    this.settings = settings;
    this.client = client;
    this.selectedClient = selectedClient;
  }
  async status(): Promise<AiPreferences> {
    const client = await this.selectedClient();
    return {
      client,
      ...(await this.settings.configuration(client)),
      configured: true,
      available: true,
    };
  }
  cancelAll(): void {
    this.epoch++;
    for (const request of this.active.values()) request.controller.abort();
  }
  async configure(
    client: CodingClient,
    configuration: AiAgentConfiguration,
  ): Promise<void> {
    if (client !== (await this.selectedClient()))
      throw Error("The selected agent changed. Reopen AI settings.");
    this.cancelAll();
    await this.settings.set(client, configuration);
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
  async preview(context: AiContext): Promise<{
    version: number;
    revision: string;
    model: string;
    client: CodingClient;
    effort: AiAgentConfiguration["effort"];
    text: string;
  }> {
    const preferences = await this.status();
    const prompt = buildAiPrompt(context);
    return {
      version: prompt.version,
      revision: hash(
        JSON.stringify({
          prompt: prompt.revision,
          client: preferences.client,
          model: preferences.model,
          effort: preferences.effort,
        }),
      ),
      model: preferences.model ?? "Agent default",
      client: preferences.client,
      effort: preferences.effort,
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
      const preferences = await this.status();
      if (
        hash(
          JSON.stringify({
            prompt: prompt.revision,
            client: preferences.client,
            model: preferences.model,
            effort: preferences.effort,
          }),
        ) !== revision
      )
        throw Error(
          "Selected text, agent, model or effort changed; review the current privacy preview",
        );
      if (epoch !== this.epoch || controller.signal.aborted)
        throw new Error("AI request cancelled");
      let characters = 0;
      const text = await this.client.complete({
        preferences,
        messages: prompt.messages,
        signal: controller.signal,
        onText: (part) => {
          characters += part.length;
          onProgress(characters);
        },
      });
      if (epoch !== this.epoch || controller.signal.aborted)
        throw new Error("AI request cancelled");
      const current = await this.preview(context);
      if (epoch !== this.epoch || controller.signal.aborted)
        throw new Error("AI request cancelled");
      if (current.revision !== revision)
        throw Error("AI settings changed; review the current privacy preview");
      return parseAiSuggestion(context, text);
    } finally {
      this.active.delete(identity);
    }
  }
}
