export interface AgentContext {
  env: boolean;
  rules: boolean;
  repo: boolean;
  layout: boolean;
  layoutMaxDepth: number;
  layoutMaxLines: number;
  mcp: boolean;
  mcpToolSchemas: boolean;
}

export interface AppConfig {
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
  defaultModel: string;
  modelMapping: Record<string, string>;
  interceptMethods: string[];
  temperature: number | null;
  maxTokens: number | null;
  extraHeaders: Record<string, string>;
  sendReasoningAsText: boolean;
  blockUsageGate: boolean;
  agentTools: boolean;
  agentSystemPrompt: string;
  agentToolTimeoutMs: number;
  agentContext: AgentContext;
  debugDump: boolean;
}

export interface ProxySettings {
  upstream: string;
  port: number;
}

export interface TargetStatus {
  name: string;
  path: string;
  exists: boolean;
  patched: boolean;
  backup: boolean;
}

export interface AppStatus {
  cursorFound: boolean;
  cursorRoot: string | null;
  cursorRunning: boolean;
  targets: TargetStatus[];
  productJson: string | null;
  configPath: string;
  proxyRunning: boolean;
  proxyPort: number | null;
  proxyUpstream: string | null;
}

export interface OpResult {
  ok: boolean;
  log: string[];
}

export interface ConnectionTest {
  ok: boolean;
  latencyMs: number;
  status: number;
  model: string;
  message: string;
}

export interface ProfilesState {
  activeProfile: string | null;
  profiles: Record<string, AppConfig>;
}


