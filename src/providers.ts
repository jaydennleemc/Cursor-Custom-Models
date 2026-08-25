export interface ProviderPreset {
  id: string;
  baseUrl: string;
  defaultModel: string;
  models: string[];
}

/** Hosts that fail Chromium CORS preflight from Cursor's renderer. */
export const CORS_HOSTS = [
  "open.bigmodel.cn",
  "api.anthropic.com",
  "generativelanguage.googleapis.com",
  "api.minimax.io",
];

export const PROVIDERS: ProviderPreset[] = [
  {
    id: "openai",
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-5.6-sol",
    models: ["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna", "gpt-5.5", "gpt-5.3-codex"],
  },
  {
    id: "anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    defaultModel: "claude-sonnet-5",
    models: ["claude-sonnet-5", "claude-opus-5", "claude-fable-5", "claude-haiku-4-5"],
  },
  {
    id: "google",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    defaultModel: "gemini-3.7-flash",
    models: [
      "gemini-3.7-flash",
      "gemini-3.6-flash",
      "gemini-3.1-pro-preview",
      "gemini-2.5-pro",
    ],
  },
  {
    id: "xai",
    baseUrl: "https://api.x.ai/v1",
    defaultModel: "grok-4.6",
    models: ["grok-4.6", "grok-4.5", "grok-4.3", "grok-build-0.1"],
  },
  {
    id: "deepseek",
    baseUrl: "https://api.deepseek.com/v1",
    defaultModel: "deepseek-v4-flash",
    models: ["deepseek-v4-pro", "deepseek-v4-flash", "deepseek-v4-flash-vision-exp"],
  },
  {
    id: "openrouter",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "openai/gpt-5.6-sol",
    models: [
      "openai/gpt-5.6-sol",
      "anthropic/claude-sonnet-5",
      "google/gemini-3.7-flash",
      "x-ai/grok-4.6",
      "deepseek/deepseek-v4-flash",
      "moonshotai/kimi-k3",
    ],
  },
  {
    id: "qwen",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    defaultModel: "qwen3.8-max",
    models: ["qwen3.8-max", "qwen3.7-max", "qwen-plus", "qwen-flash"],
  },
  {
    id: "kimi",
    baseUrl: "https://api.moonshot.cn/v1",
    defaultModel: "kimi-k3",
    models: ["kimi-k3", "kimi-k2.6", "kimi-k2.7-code", "kimi-k2.7-code-highspeed"],
  },
  {
    id: "glm",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    defaultModel: "glm-5.3",
    models: ["glm-5.3", "glm-5.2", "glm-5", "glm-4.7", "glm-4.7-flash"],
  },
  {
    id: "minimax",
    baseUrl: "https://api.minimax.io/v1",
    defaultModel: "MiniMax-M3",
    models: ["MiniMax-M3", "MiniMax-M2.7", "MiniMax-M2.7-highspeed"],
  },
  {
    id: "custom",
    baseUrl: "",
    defaultModel: "",
    models: [],
  },
];

export function matchProvider(baseUrl: string): ProviderPreset {
  const url = baseUrl.trim().replace(/\/+$/, "");
  const found = PROVIDERS.find((p) => {
    if (!p.baseUrl) return false;
    const base = p.baseUrl.replace(/\/+$/, "");
    return url === base || url.startsWith(`${base}/`);
  });
  return found ?? PROVIDERS.find((p) => p.id === "custom")!;
}

export function needsCorsProxy(baseUrl: string): boolean {
  try {
    const parsed = new URL(baseUrl);
    const host = parsed.hostname;
    if (host === "127.0.0.1" || host === "localhost" || host === "0.0.0.0") {
      return parsed.protocol === "http:";
    }
    return CORS_HOSTS.includes(host);
  } catch {
    return false;
  }
}
