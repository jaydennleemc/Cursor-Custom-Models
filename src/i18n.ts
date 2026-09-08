export type Locale = "en" | "zh-CN" | "zh-TW";

export const DEFAULT_LOCALE: Locale = "en";
const STORAGE_KEY = "ccm.locale";

export const LOCALES: { id: Locale; native: string }[] = [
  { id: "en", native: "English" },
  { id: "zh-CN", native: "简体中文" },
  { id: "zh-TW", native: "繁體中文" },
];

type Dict = Record<string, string>;

const en: Dict = {
  loading: "Loading…",
  settings: "Settings",
  save: "Save",
  saved: "Saved {path}",
  openConfig: "Open config folder",
  openLog: "Open log folder",
  language: "Language",
  configNotReady: "Config is not loaded yet",
  extraHeadersInvalid: "extraHeaders must be a JSON object",

  statusCursor: "Cursor",
  statusFound: "Installed",
  statusMissing: "Not found",
  statusProcess: "Process",
  statusRunning: "Running — quit first",
  statusIdle: "Not running",
  statusPatch: "Patch",
  statusPatched: "{n}/{total} files patched",

  start: "Start",
  starting: "Starting…",
  stop: "Stop",
  stopping: "Stopping…",
  saving: "Saving…",
  openCursor: "Open Cursor",
  openingCursor: "Opening…",
  quitCursor: "Quit Cursor",
  quittingCursor: "Quitting…",
  cursorOpened: "Cursor launched",
  cursorQuit: "Cursor quit",
  forceRestore: "Force restore (overwrite after Cursor update)",
  log: "Log",
  logIdle: "Waiting.",
  testOk: "Connected",
  testFail: "Connection failed",
  testModel: "Model {model}",
  testHttp: "HTTP {status}",
  testing: "Testing…",
  testConnection: "Test connection",

  started: "Started (written into Cursor). Fully quit Cursor, then reopen it.",
  startPartial: "Start did not finish. See the log.",
  stopped: "Stopped (Cursor files restored). Restart Cursor.",
  stopPartial: "Stop did not finish. See the log.",

  upstream: "Upstream API",
  provider: "Provider",
  model: "Model",
  baseUrl: "Base URL",
  apiKey: "API Key",
  modelCustom: "Custom…",
  modelIdPlaceholder: "Model ID",

  "provider.openai": "OpenAI",
  "provider.anthropic": "Anthropic",
  "provider.google": "Google",
  "provider.xai": "xAI",
  "provider.deepseek": "DeepSeek",
  "provider.openrouter": "OpenRouter",
  "provider.qwen": "Qwen",
  "provider.kimi": "Kimi",
  "provider.glm": "GLM",
  "provider.minimax": "MiniMax",
  "provider.custom": "Custom",

  "hint.openai": "platform.openai.com — GPT-5.6 Sol / Terra / Luna",
  "hint.anthropic": "api.anthropic.com OpenAI-compat — CORS proxy + anthropic-version header",
  "hint.google": "Gemini OpenAI-compat — generativelanguage.googleapis.com",
  "hint.xai": "api.x.ai — Grok 4.6",
  "hint.deepseek": "api.deepseek.com — V4 Pro / Flash, direct connection",
  "hint.openrouter": "openrouter.ai — one key, many models (vendor/model slugs)",
  "hint.qwen": "Alibaba DashScope compatible mode (Beijing)",
  "hint.kimi": "Moonshot (Kimi) — kimi-k2.5 / moonshot-v1 sunset Aug 31, 2026",
  "hint.glm": "Zhipu BigModel — CORS proxy starts automatically",
  "hint.minimax": "api.minimax.io — M3 / M2.7",
  "hint.custom": "Any OpenAI-compatible endpoint — URL and model required",

  advanced: "Advanced",
  mapping: "Model Mapping",
  addMapping: "Add Mapping",
  deleteMapping: "Remove Mapping",
  cursorModel: "Cursor Model Name",
  upstreamModel: "Upstream Model Name",

  agentTools: "Agent / Tools",
  context: "Context",
  enableTools: "Enable Tool Loop",
  blockUsage: "Bypass Usage Gate",
  toolTimeout: "Tool Timeout (ms)",
  ctxEnv: "Environment",
  ctxRules: "Project Rules",
  ctxRepo: "Repository",
  ctxLayout: "Project Tree",
  ctxMcp: "MCP Instructions",
  ctxMcpSchemas: "MCP Schema Bodies",

  intercept: "Intercept Channels",
  "intercept.chat": "Chat",
  "intercept.chatTools": "Chat + Tools",
  "intercept.chatIdempotent": "Chat Idempotent",
  "intercept.cmdk": "Cmd+K",
  "intercept.agent": "Agent",

  extraHeaders: "Extra Headers (JSON Object)",
  help: "What Is This?",

  "tip.mapping": "Maps a Cursor model name to an upstream model ID. Use * as the fallback for every other name.",
  "tip.agentTools": "How Agent mode talks to the upstream model, which tools it may call, and which Cursor context is attached.",
  "tip.enableTools": "Lets Agent call Cursor tools (read files, run commands, and so on) in a loop with your upstream model.",
  "tip.blockUsage": "Skip Cursor’s usage / quota checks so a custom model is not blocked as unavailable.",
  "tip.toolTimeout": "How long to wait for one tool call before giving up, in milliseconds.",
  "tip.ctxEnv": "Include OS, shell, timezone, and workspace paths in the Agent system prompt.",
  "tip.ctxRules": "Include .cursorrules and other project rules Cursor already collected.",
  "tip.ctxRepo": "Include git remote / repository names.",
  "tip.ctxLayout": "Include a truncated project file tree so the model can see folder layout.",
  "tip.ctxMcp": "Include MCP server instructions from Cursor.",
  "tip.ctxMcpSchemas": "Include full MCP tool JSON schemas. Verbose; uses more tokens.",
  "tip.intercept": "Which Cursor RPC channels are rewritten to your upstream API. Uncheck a channel to leave it on Cursor’s servers.",
  "tip.intercept.chat": "Main Chat stream without tools.",
  "tip.intercept.chatTools": "Chat with tool calling.",
  "tip.intercept.chatIdempotent": "Idempotent chat + tools retry channel.",
  "tip.intercept.cmdk": "Inline edit (Cmd+K / Ctrl+K).",
  "tip.intercept.agent": "Agent / Composer Run channel.",
  "tip.extraHeaders": "Extra HTTP headers as a JSON object, for example {\"X-Title\":\"ccm\"}.",

  profiles: "Profiles",
  profileSave: "Save as Profile",
  profileLoad: "Load",
  profileDelete: "Delete",
  profileName: "Profile Name",
  profileNamePlaceholder: "e.g. work-openai, local-ollama",
  profileSaved: "Profile '{name}' saved",
  profileLoaded: "Profile '{name}' loaded",
  profileDeleted: "Profile '{name}' deleted",
  profileConfirmDelete: "Delete profile '{name}'?",
  profileNoProfiles: "No profiles saved yet",
  cancel: "Cancel",
  deleting: "Deleting…",
};

const zhCN: Dict = {
  loading: "正在读取状态…",
  settings: "设置",
  save: "保存",
  saved: "已保存 {path}",
  openConfig: "打开配置目录",
  openLog: "打开日志目录",
  language: "语言",
  configNotReady: "配置尚未加载",
  extraHeadersInvalid: "extraHeaders 必须是 JSON 对象",

  statusCursor: "Cursor",
  statusFound: "已找到安装",
  statusMissing: "未找到",
  statusProcess: "进程",
  statusRunning: "正在运行，请先退出",
  statusIdle: "未运行",
  statusPatch: "补丁",
  statusPatched: "{n}/{total} 个文件已打",

  start: "启动",
  starting: "启动中…",
  stop: "停止",
  stopping: "停止中…",
  saving: "保存中…",
  openCursor: "打开 Cursor",
  openingCursor: "正在打开…",
  quitCursor: "退出 Cursor",
  quittingCursor: "正在退出…",
  cursorOpened: "已打开 Cursor",
  cursorQuit: "已退出 Cursor",
  forceRestore: "强制还原（Cursor 更新后覆盖）",
  log: "日志",
  logIdle: "等待操作。",
  testOk: "连接成功",
  testFail: "连接失败",
  testModel: "模型 {model}",
  testHttp: "HTTP {status}",
  testing: "测试中…",
  testConnection: "测试连接",

  started: "已启动（已写入 Cursor）。请完全退出后重启 Cursor。",
  startPartial: "启动未完全成功，见左侧日志。",
  stopped: "已停止（已还原 Cursor 文件）。请重启 Cursor。",
  stopPartial: "停止未完全成功，见左侧日志。",

  upstream: "上游 API",
  provider: "供应商",
  model: "模型",
  baseUrl: "Base URL",
  apiKey: "API Key",
  modelCustom: "自定义…",
  modelIdPlaceholder: "输入模型 ID",

  "provider.openai": "OpenAI",
  "provider.anthropic": "Anthropic",
  "provider.google": "Google",
  "provider.xai": "xAI",
  "provider.deepseek": "DeepSeek",
  "provider.openrouter": "OpenRouter",
  "provider.qwen": "通义千问",
  "provider.kimi": "Kimi",
  "provider.glm": "智谱 GLM",
  "provider.minimax": "MiniMax",
  "provider.custom": "自定义",

  "hint.openai": "platform.openai.com — GPT-5.6 Sol / Terra / Luna",
  "hint.anthropic": "Anthropic OpenAI 兼容接口，自动走 CORS 代理并带上版本头",
  "hint.google": "Gemini OpenAI 兼容接口",
  "hint.xai": "api.x.ai — Grok 4.6",
  "hint.deepseek": "api.deepseek.com — V4 Pro / Flash，可直连",
  "hint.openrouter": "OpenRouter 聚合，一个 Key 调多家模型",
  "hint.qwen": "阿里云百炼兼容模式（北京）",
  "hint.kimi": "月之暗面 Moonshot — kimi-k2.5 / moonshot-v1 将于 2026-08-31 下线",
  "hint.glm": "智谱开放平台，自动走 CORS 代理",
  "hint.minimax": "api.minimax.io — M3 / M2.7",
  "hint.custom": "任意 OpenAI 兼容接口，需填写 URL 和模型",

  advanced: "高级设置",
  mapping: "模型映射",
  addMapping: "添加映射",
  deleteMapping: "删除映射",
  cursorModel: "Cursor 模型名",
  upstreamModel: "上游模型名",

  agentTools: "Agent / 工具",
  context: "上下文",
  enableTools: "启用工具循环",
  blockUsage: "绕过 Usage 门禁",
  toolTimeout: "工具超时 (ms)",
  ctxEnv: "环境信息",
  ctxRules: "项目规则",
  ctxRepo: "仓库信息",
  ctxLayout: "目录树",
  ctxMcp: "MCP 指令",
  ctxMcpSchemas: "MCP Schema 全文",

  intercept: "拦截通道",
  "intercept.chat": "Chat",
  "intercept.chatTools": "Chat + 工具",
  "intercept.chatIdempotent": "Chat 幂等通道",
  "intercept.cmdk": "Cmd+K",
  "intercept.agent": "Agent",

  extraHeaders: "Extra Headers（JSON 对象）",
  help: "这是什么？",

  "tip.mapping": "把 Cursor 里的模型名映射成上游模型 ID。* 作为其余名称的默认项。",
  "tip.agentTools": "Agent 如何对接上游模型、能调用哪些工具、以及附带哪些 Cursor 上下文。",
  "tip.enableTools": "允许 Agent 用你的上游模型循环调用 Cursor 工具（读文件、跑命令等）。",
  "tip.blockUsage": "跳过 Cursor 的用量/配额检查，避免自定义模型被当成不可用。",
  "tip.toolTimeout": "单次工具调用的最长等待时间，单位毫秒。",
  "tip.ctxEnv": "把操作系统、Shell、时区和工作区路径写进 Agent 系统提示。",
  "tip.ctxRules": "附带 Cursor 已收集的 .cursorrules 等项目规则。",
  "tip.ctxRepo": "附带 git 远程地址 / 仓库名。",
  "tip.ctxLayout": "附带截断后的项目目录树，让模型看到文件夹结构。",
  "tip.ctxMcp": "附带 Cursor 里的 MCP 服务器说明。",
  "tip.ctxMcpSchemas": "附带完整 MCP 工具 JSON schema。内容很长，更耗 token。",
  "tip.intercept": "哪些 Cursor RPC 通道改走你的上游 API。取消勾选则该通道仍走 Cursor 官方。",
  "tip.intercept.chat": "不含工具的主 Chat 流。",
  "tip.intercept.chatTools": "带工具调用的 Chat。",
  "tip.intercept.chatIdempotent": "可重试的 Chat + 工具幂等通道。",
  "tip.intercept.cmdk": "行内编辑（Cmd+K / Ctrl+K）。",
  "tip.intercept.agent": "Agent / Composer 的 Run 通道。",
  "tip.extraHeaders": "额外 HTTP 头，JSON 对象，例如 {\"X-Title\":\"ccm\"}。",

  profiles: "配置方案",
  profileSave: "存为配置方案",
  profileLoad: "加载",
  profileDelete: "删除",
  profileName: "方案名称",
  profileNamePlaceholder: "例如 work-openai、local-ollama",
  profileSaved: "已保存方案 '{name}'",
  profileLoaded: "已加载方案 '{name}'",
  profileDeleted: "已删除方案 '{name}'",
  profileConfirmDelete: "确认删除方案 '{name}'？",
  profileNoProfiles: "暂无保存的配置方案",
  cancel: "取消",
  deleting: "删除中…",
};

const zhTW: Dict = {
  loading: "正在讀取狀態…",
  settings: "設定",
  save: "儲存",
  saved: "已儲存 {path}",
  openConfig: "開啟設定目錄",
  openLog: "開啟日誌目錄",
  language: "語言",
  configNotReady: "設定尚未載入",
  extraHeadersInvalid: "extraHeaders 必須是 JSON 物件",

  statusCursor: "Cursor",
  statusFound: "已找到安裝",
  statusMissing: "找不到",
  statusProcess: "行程",
  statusRunning: "正在執行，請先結束",
  statusIdle: "未執行",
  statusPatch: "補丁",
  statusPatched: "{n}/{total} 個檔案已套用",

  start: "啟動",
  starting: "啟動中…",
  stop: "停止",
  stopping: "停止中…",
  saving: "保存中…",
  openCursor: "開啟 Cursor",
  openingCursor: "正在開啟…",
  quitCursor: "結束 Cursor",
  quittingCursor: "正在結束…",
  cursorOpened: "已開啟 Cursor",
  cursorQuit: "已結束 Cursor",
  forceRestore: "強制還原（Cursor 更新後覆蓋）",
  log: "日誌",
  logIdle: "等待操作。",
  testOk: "連線成功",
  testFail: "連線失敗",
  testModel: "模型 {model}",
  testHttp: "HTTP {status}",
  testing: "測試中…",
  testConnection: "測試連線",

  started: "已啟動（已寫入 Cursor）。請完全結束後重新開啟 Cursor。",
  startPartial: "啟動未完全成功，請見左側日誌。",
  stopped: "已停止（已還原 Cursor 檔案）。請重新開啟 Cursor。",
  stopPartial: "停止未完全成功，請見左側日誌。",

  upstream: "上游 API",
  provider: "供應商",
  model: "模型",
  baseUrl: "Base URL",
  apiKey: "API Key",
  modelCustom: "自訂…",
  modelIdPlaceholder: "輸入模型 ID",

  "provider.openai": "OpenAI",
  "provider.anthropic": "Anthropic",
  "provider.google": "Google",
  "provider.xai": "xAI",
  "provider.deepseek": "DeepSeek",
  "provider.openrouter": "OpenRouter",
  "provider.qwen": "通義千問",
  "provider.kimi": "Kimi",
  "provider.glm": "智譜 GLM",
  "provider.minimax": "MiniMax",
  "provider.custom": "自訂",

  "hint.openai": "platform.openai.com — GPT-5.6 Sol / Terra / Luna",
  "hint.anthropic": "Anthropic OpenAI 相容介面，自動走 CORS 代理並帶上版本標頭",
  "hint.google": "Gemini OpenAI 相容介面",
  "hint.xai": "api.x.ai — Grok 4.6",
  "hint.deepseek": "api.deepseek.com — V4 Pro / Flash，可直連",
  "hint.openrouter": "OpenRouter 聚合，一個 Key 調多家模型",
  "hint.qwen": "阿里雲百鍊相容模式（北京）",
  "hint.kimi": "月之暗面 Moonshot — kimi-k2.5 / moonshot-v1 將於 2026-08-31 下線",
  "hint.glm": "智譜開放平台，自動走 CORS 代理",
  "hint.minimax": "api.minimax.io — M3 / M2.7",
  "hint.custom": "任意 OpenAI 相容介面，需填寫 URL 與模型",

  advanced: "進階設定",
  mapping: "模型對應",
  addMapping: "新增對應",
  deleteMapping: "刪除對應",
  cursorModel: "Cursor 模型名",
  upstreamModel: "上游模型名",

  agentTools: "Agent / 工具",
  context: "上下文",
  enableTools: "啟用工具迴圈",
  blockUsage: "略過 Usage 門檻",
  toolTimeout: "工具逾時 (ms)",
  ctxEnv: "環境資訊",
  ctxRules: "專案規則",
  ctxRepo: "儲存庫資訊",
  ctxLayout: "目錄樹",
  ctxMcp: "MCP 指令",
  ctxMcpSchemas: "MCP Schema 全文",

  intercept: "攔截通道",
  "intercept.chat": "Chat",
  "intercept.chatTools": "Chat + 工具",
  "intercept.chatIdempotent": "Chat 冪等通道",
  "intercept.cmdk": "Cmd+K",
  "intercept.agent": "Agent",

  extraHeaders: "Extra Headers（JSON 物件）",
  help: "這是什麼？",

  "tip.mapping": "把 Cursor 裡的模型名對應成上游模型 ID。* 作為其餘名稱的預設項。",
  "tip.agentTools": "Agent 如何對接上游模型、能呼叫哪些工具、以及附帶哪些 Cursor 上下文。",
  "tip.enableTools": "允許 Agent 用你的上游模型循環呼叫 Cursor 工具（讀檔、跑命令等）。",
  "tip.blockUsage": "略過 Cursor 的用量/配額檢查，避免自訂模型被當成不可用。",
  "tip.toolTimeout": "單次工具呼叫的最長等待時間，單位毫秒。",
  "tip.ctxEnv": "把作業系統、Shell、時區和工作區路徑寫進 Agent 系統提示。",
  "tip.ctxRules": "附帶 Cursor 已收集的 .cursorrules 等專案規則。",
  "tip.ctxRepo": "附帶 git 遠端位址 / 儲存庫名稱。",
  "tip.ctxLayout": "附帶截斷後的專案目錄樹，讓模型看到資料夾結構。",
  "tip.ctxMcp": "附帶 Cursor 裡的 MCP 伺服器說明。",
  "tip.ctxMcpSchemas": "附帶完整 MCP 工具 JSON schema。內容很長，更耗 token。",
  "tip.intercept": "哪些 Cursor RPC 通道改走你的上游 API。取消勾選則該通道仍走 Cursor 官方。",
  "tip.intercept.chat": "不含工具的主 Chat 流。",
  "tip.intercept.chatTools": "帶工具呼叫的 Chat。",
  "tip.intercept.chatIdempotent": "可重試的 Chat + 工具冪等通道。",
  "tip.intercept.cmdk": "行內編輯（Cmd+K / Ctrl+K）。",
  "tip.intercept.agent": "Agent / Composer 的 Run 通道。",
  "tip.extraHeaders": "額外 HTTP 標頭，JSON 物件，例如 {\"X-Title\":\"ccm\"}。",

  profiles: "配置方案",
  profileSave: "存為配置方案",
  profileLoad: "載入",
  profileDelete: "刪除",
  profileName: "方案名稱",
  profileNamePlaceholder: "例如 work-openai、local-ollama",
  profileSaved: "已儲存方案 '{name}'",
  profileLoaded: "已載入方案 '{name}'",
  profileDeleted: "已刪除方案 '{name}'",
  profileConfirmDelete: "確認刪除方案 '{name}'？",
  profileNoProfiles: "尚無儲存的配置方案",
  cancel: "取消",
  deleting: "刪除中…",
};

const TABLES: Record<Locale, Dict> = { en, "zh-CN": zhCN, "zh-TW": zhTW };

export function isLocale(value: string | null): value is Locale {
  return value === "en" || value === "zh-CN" || value === "zh-TW";
}

export function readLocale(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isLocale(stored)) return stored;
  } catch {
    /* ignore */
  }
  return DEFAULT_LOCALE;
}

export function writeLocale(locale: Locale) {
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    /* ignore */
  }
  document.documentElement.lang = locale;
}

export type TFn = (key: string, vars?: Record<string, string | number>) => string;

export function createT(locale: Locale): TFn {
  const table = TABLES[locale] ?? en;
  return (key, vars) => {
    let text = table[key] ?? en[key] ?? key;
    if (vars) {
      for (const [name, value] of Object.entries(vars)) {
        text = text.split(`{${name}}`).join(String(value));
      }
    }
    return text;
  };
}

export const INTERCEPT_I18N: { id: string; key: string }[] = [
  { id: "aiserver.v1.ChatService/StreamUnifiedChat", key: "intercept.chat" },
  { id: "aiserver.v1.ChatService/StreamUnifiedChatWithTools", key: "intercept.chatTools" },
  { id: "aiserver.v1.ChatService/StreamUnifiedChatWithToolsIdempotent", key: "intercept.chatIdempotent" },
  { id: "aiserver.v1.CmdKService/StreamCmdK", key: "intercept.cmdk" },
  { id: "agent.v1.AgentService/Run", key: "intercept.agent" },
];
