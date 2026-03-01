import { z, type ZodIssue } from "zod";
import { AppConfig } from "../types";
import { HttpClientConfig, requestWithPolicy } from "../utils/http-client";

interface LlmCompletionParams {
  systemPrompt: string;
  userPrompt: string;
}

function trimSlash(v: string): string {
  return v.endsWith("/") ? v.slice(0, -1) : v;
}

function isReady(config: AppConfig["llm"]): boolean {
  return Boolean(config.apiKey && config.model && config.baseUrl);
}

interface ProviderAdapter {
  path: string;
  headers: (apiKey: string) => Record<string, string>;
  body: (cfg: AppConfig["llm"], params: LlmCompletionParams, structured: boolean) => string;
  extract: (data: unknown) => string;
  errorLabel: string;
}

const providers: Record<AppConfig["llm"]["provider"], ProviderAdapter> = {
  openai: {
    path: "/chat/completions",
    headers: (apiKey) => ({
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    }),
    body: (cfg, params, structured) =>
      JSON.stringify({
        model: cfg.model,
        temperature: cfg.temperature,
        max_tokens: cfg.maxTokens,
        ...(structured ? { response_format: { type: "json_object" } } : {}),
        messages: [
          { role: "system", content: params.systemPrompt },
          { role: "user", content: params.userPrompt },
        ],
      }),
    extract: (data) => {
      const typed = data as { choices?: Array<{ message?: { content?: string } }> };
      return typed.choices?.[0]?.message?.content?.trim() || "";
    },
    errorLabel: "OpenAI",
  },
  anthropic: {
    path: "/messages",
    headers: (apiKey) => ({
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    }),
    body: (cfg, params) =>
      JSON.stringify({
        model: cfg.model,
        max_tokens: cfg.maxTokens,
        temperature: cfg.temperature,
        system: params.systemPrompt,
        messages: [{ role: "user", content: params.userPrompt }],
      }),
    extract: (data) => {
      const typed = data as { content?: Array<{ type?: string; text?: string }> };
      return (typed.content || [])
        .filter((c) => c.type === "text" && c.text)
        .map((c) => c.text?.trim() || "")
        .join("\n")
        .trim();
    },
    errorLabel: "Anthropic",
  },
};

export class LlmClient {
  constructor(
    private readonly config: AppConfig["llm"],
    private readonly httpConfig: HttpClientConfig,
  ) {}

  ensureReady(): void {
    if (!isReady(this.config)) {
      throw new Error(
        "LLM is not configured. Set llm.provider, llm.model, llm.baseUrl, and llm.apiKey.",
      );
    }
  }

  async complete(params: LlmCompletionParams): Promise<string> {
    this.ensureReady();
    return this.completeRaw(params, false);
  }

  async completeStructured<T>(
    params: LlmCompletionParams & { schema: z.ZodSchema<T> },
  ): Promise<T> {
    this.ensureReady();
    const content = await this.completeRaw(
      {
        ...params,
        systemPrompt: `${params.systemPrompt}\n\nIMPORTANT: You must respond with valid JSON only. Do not include any text before or after the JSON.`,
      },
      true,
    );
    return this.parseStructured(content, params.schema);
  }

  private async completeRaw(params: LlmCompletionParams, structured: boolean): Promise<string> {
    const provider = providers[this.config.provider];
    const endpoint = `${trimSlash(this.config.baseUrl)}${provider.path}`;
    const response = await requestWithPolicy(endpoint, this.httpConfig, {
      method: "POST",
      headers: provider.headers(this.config.apiKey),
      body: provider.body(this.config, params, structured),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`${provider.errorLabel} completion failed ${response.status}: ${body}`);
    }

    const data = (await response.json()) as unknown;
    const content = provider.extract(data);
    if (!content) {
      throw new Error(`${provider.errorLabel} completion returned empty content`);
    }
    return content;
  }

  private parseStructured<T>(content: string, schema: z.ZodSchema<T>): T {
    try {
      const parsed = JSON.parse(content);
      return schema.parse(parsed);
    } catch (err: unknown) {
      if (err instanceof z.ZodError) {
        throw new Error(
          `LLM response validation failed: ${err.errors.map((e: ZodIssue) => `${e.path.join(".")}: ${e.message}`).join(", ")}`,
        );
      }
      throw new Error(`Failed to parse LLM JSON response: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
