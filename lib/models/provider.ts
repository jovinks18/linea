import type { ModelChatMessage, ModelProvider } from "./types";

type ModelConfig = {
  provider: ModelProvider;
  baseUrl: string;
  apiKey: string;
  modelName: string;
  timeoutMs: number;
};

function getProvider(value: string | undefined): ModelProvider {
  if (value === "openai_compatible" || value === "ollama") return value;

  return "deterministic";
}

function getModelConfig(): ModelConfig | null {
  const provider = getProvider(process.env.MODEL_PROVIDER);

  if (provider === "deterministic") return null;

  const baseUrl = process.env.MODEL_BASE_URL?.trim() ?? "";
  const modelName = process.env.MODEL_NAME?.trim() ?? "";
  const apiKey = process.env.MODEL_API_KEY?.trim() ?? "";
  const timeoutMs = Number(process.env.MODEL_TIMEOUT_MS ?? 15000);

  if (!baseUrl || !modelName) return null;
  if (provider === "openai_compatible" && !apiKey) return null;

  return {
    provider,
    baseUrl,
    apiKey,
    modelName,
    timeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : 15000,
  };
}

function withTimeout(timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  return {
    signal: controller.signal,
    clear: () => clearTimeout(timeout),
  };
}

function chatCompletionsUrl(baseUrl: string) {
  if (baseUrl.endsWith("/chat/completions")) return baseUrl;

  return `${baseUrl.replace(/\/$/, "")}/v1/chat/completions`;
}

function ollamaChatUrl(baseUrl: string) {
  if (baseUrl.endsWith("/api/chat")) return baseUrl;

  return `${baseUrl.replace(/\/$/, "")}/api/chat`;
}

function parseJsonFromText(text: string): unknown {
  const trimmed = text.trim();

  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");

    if (start === -1 || end === -1 || end <= start) return null;

    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

async function callOpenAICompatible({
  config,
  messages,
}: {
  config: ModelConfig;
  messages: ModelChatMessage[];
}) {
  const timeout = withTimeout(config.timeoutMs);

  try {
    const response = await fetch(chatCompletionsUrl(config.baseUrl), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.modelName,
        messages,
        temperature: 0,
        response_format: { type: "json_object" },
      }),
      signal: timeout.signal,
    });

    if (!response.ok) return null;

    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;

    return typeof content === "string" ? parseJsonFromText(content) : null;
  } finally {
    timeout.clear();
  }
}

async function callOllama({
  config,
  messages,
}: {
  config: ModelConfig;
  messages: ModelChatMessage[];
}) {
  const timeout = withTimeout(config.timeoutMs);

  try {
    const response = await fetch(ollamaChatUrl(config.baseUrl), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.modelName,
        messages,
        stream: false,
        format: "json",
        options: {
          temperature: 0,
        },
      }),
      signal: timeout.signal,
    });

    if (!response.ok) return null;

    const payload = await response.json();
    const content = payload?.message?.content;

    return typeof content === "string" ? parseJsonFromText(content) : null;
  } finally {
    timeout.clear();
  }
}

export async function callConfiguredModel(
  messages: ModelChatMessage[]
): Promise<unknown | null> {
  const config = getModelConfig();

  if (!config) return null;

  try {
    if (config.provider === "openai_compatible") {
      return await callOpenAICompatible({ config, messages });
    }

    return await callOllama({ config, messages });
  } catch (error) {
    console.warn(
      "Linea model planner unavailable; using deterministic fallback.",
      error instanceof Error ? error.message : "Unknown model error"
    );

    return null;
  }
}
