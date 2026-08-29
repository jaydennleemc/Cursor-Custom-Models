import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import * as api from "./api";
import type { AppConfig, AppStatus } from "./types";
import { PROVIDERS, matchProvider } from "./providers";
import {
  createT,
  INTERCEPT_I18N,
  LOCALES,
  type Locale,
  readLocale,
  writeLocale,
} from "./i18n";
import {
  btnGhost,
  btnStart,
  btnStop,
  card,
  check,
  control,
  cx,
  field,
  headingCopper,
  headingSm,
  iconBtn,
  mono,
  panel,
  rail,
  selectControl,
  shell,
  stage,
  textareaControl,
} from "./ui";

const APP_VERSION = "1.0.1";

type BusyKind = "start" | "stop" | "test" | "save" | null;

function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cx("h-4 w-4 shrink-0 animate-spin motion-reduce:animate-none", className)}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
      <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

type Pair = { k: string; v: string };

function toPairs(record: Record<string, string>): Pair[] {
  const keys = Object.keys(record).sort((a, b) => {
    if (a === "*") return -1;
    if (b === "*") return 1;
    return a.localeCompare(b);
  });
  return keys.length ? keys.map((k) => ({ k, v: record[k] ?? "" })) : [{ k: "*", v: "" }];
}

function fromPairs(pairs: Pair[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const row of pairs) {
    const key = row.k.trim();
    if (!key) continue;
    out[key] = row.v;
  }
  return out;
}

function clock(locale: Locale) {
  return new Date().toLocaleTimeString(locale, {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function probeRoute(message: string) {
  if (message.includes("/chat/completions")) return "/chat/completions";
  if (message.includes("/models")) return "/models";
  return "";
}

function parseHeaders(text: string, invalidMsg: string): Record<string, string> {
  const trimmed = text.trim();
  if (!trimmed) return {};
  const value = JSON.parse(trimmed) as unknown;
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(invalidMsg);
  }
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = String(v);
  }
  return out;
}

export default function App() {
  const [status, setStatus] = useState<AppStatus | null>(null);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [providerId, setProviderId] = useState("custom");
  const [modelCustom, setModelCustom] = useState(false);
  const [mapping, setMapping] = useState<Pair[]>([{ k: "*", v: "hy3-free" }]);
  const [headersText, setHeadersText] = useState("{}");
  const [busy, setBusy] = useState<BusyKind>(null);
  const [force, setForce] = useState(false);
  const [locale, setLocale] = useState<Locale>(() => readLocale());
  const t = useMemo(() => createT(locale), [locale]);
  const [banner, setBanner] = useState<{ kind: "ok" | "bad"; text: string } | null>(null);
  const [log, setLog] = useState("");
  const logRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log]);

  useEffect(() => {
    writeLocale(locale);
  }, [locale]);

  const refresh = useCallback(async () => {
    const [nextStatus, nextConfig] = await Promise.all([api.getStatus(), api.getConfig()]);
    setStatus(nextStatus);
    setConfig(nextConfig);
    const matched = matchProvider(nextConfig.baseUrl);
    setProviderId(matched.id);
    setModelCustom(!matched.models.includes(nextConfig.defaultModel));
    setMapping(toPairs(nextConfig.modelMapping));
    setHeadersText(JSON.stringify(nextConfig.extraHeaders ?? {}, null, 2));
  }, []);

  useEffect(() => {
    refresh().catch((err: unknown) => {
      setBanner({ kind: "bad", text: err instanceof Error ? err.message : String(err) });
    });
  }, [refresh]);

  const patchedCount = useMemo(
    () => status?.targets.filter((t) => t.patched).length ?? 0,
    [status],
  );

  function writeLog(title: string, lines: string[]) {
    setLog([`${clock(locale)}  ${title}`, ...lines.filter((line) => line.trim())].join("\n"));
  }

  async function run(kind: Exclude<BusyKind, null>, action: () => Promise<void>) {
    setBusy(kind);
    setBanner(null);
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, 0);
    });
    try {
      await action();
      await refresh();
    } catch (err: unknown) {
      const text = err instanceof Error ? err.message : String(err);
      writeLog(text, []);
      setBanner({ kind: "bad", text });
    } finally {
      setBusy(null);
    }
  }

  function applyModel(model: string) {
    if (!config) return;
    setConfig({ ...config, defaultModel: model });
    setMapping((rows) => {
      const next = rows.map((row) => (row.k === "*" ? { ...row, v: model } : row));
      return next.some((row) => row.k === "*") ? next : [{ k: "*", v: model }, ...next];
    });
  }

  function assembleConfig(): AppConfig {
    if (!config) throw new Error(t("configNotReady"));
    return {
      ...config,
      modelMapping: fromPairs(mapping),
      extraHeaders: parseHeaders(headersText, t("extraHeadersInvalid")),
    };
  }

  async function onSave() {
    await run("save", async () => {
      const next = assembleConfig();
      const path = await api.saveConfig(next);
      setConfig(next);
      setBanner({ kind: "ok", text: t("saved", { path }) });
    });
  }

  async function onTestConnection() {
    setBusy("test");
    setBanner(null);
    try {
      const next = assembleConfig();
      const result = await api.testConnection(next);
      const http = result.status || "—";
      if (result.ok) {
        writeLog(t("testOk"), [
          `${result.latencyMs}ms · HTTP ${http} · ${result.model}`,
          probeRoute(result.message),
        ]);
      } else {
        writeLog(t("testFail"), [
          `${result.latencyMs}ms · HTTP ${http} · ${result.model}`,
          result.message,
        ]);
      }
      setBanner({
        kind: result.ok ? "ok" : "bad",
        text: result.ok ? t("testOk") : result.message || t("testFail"),
      });
    } catch (err: unknown) {
      const text = err instanceof Error ? err.message : String(err);
      writeLog(t("testFail"), [text]);
      setBanner({ kind: "bad", text });
    } finally {
      setBusy(null);
    }
  }

  async function onTogglePatch() {
    const stopping = patchedCount > 0;
    writeLog(stopping ? t("stopping") : t("starting"), []);
    await run(stopping ? "stop" : "start", async () => {
      if (stopping) {
        const result = await api.stopRestore(force);
        writeLog(t("stop"), result.log);
        setBanner({
          kind: result.ok ? "ok" : "bad",
          text: result.ok ? t("stopped") : t("stopPartial"),
        });
        return;
      }
      const next = assembleConfig();
      const result = await api.startPatch(next);
      writeLog(t("start"), result.log);
      setBanner({
        kind: result.ok ? "ok" : "bad",
        text: result.ok ? t("started") : t("startPartial"),
      });
    });
  }

  if (!config || !status) {
    return (
      <div className={shell}>
        <div className="noise" />
        <aside className={rail}>
          <div className="flex flex-col gap-1.5">
            <h1 className="m-0 flex items-baseline gap-2 text-lg font-bold leading-tight tracking-[-0.03em]">
              Cursor Gateway <span className="font-mono text-[11px] font-medium tracking-[0.04em] text-muted">v{APP_VERSION}</span>
            </h1>
            <p className="m-0 text-[13px] leading-snug text-muted">{t("loading")}</p>
          </div>
        </aside>
        <main className={stage} />
      </div>
    );
  }

  const preset = PROVIDERS.find((p) => p.id === providerId);
  const presetModels = preset?.models ?? [];
  const modelIsCustom = modelCustom || !presetModels.includes(config.defaultModel);

  return (
    <div className={shell}>
      <div className="noise" />
      <aside className={rail}>
        <div className="flex flex-col gap-1.5">
          <h1 className="m-0 flex items-baseline gap-2 text-lg font-bold leading-tight tracking-[-0.03em]">
            Cursor Gateway <span className="font-mono text-[11px] font-medium tracking-[0.04em] text-muted">v{APP_VERSION}</span>
          </h1>
        </div>

        <div className={cx(card, "divide-y divide-line/70")}>
          <StatusLine
            ok={status.cursorFound}
            label={t("statusCursor")}
            detail={status.cursorFound ? t("statusFound") : t("statusMissing")}
          />
          <StatusLine
            ok={!status.cursorRunning}
            warn={status.cursorRunning}
            label={t("statusProcess")}
            detail={status.cursorRunning ? t("statusRunning") : t("statusIdle")}
          />
          <StatusLine
            ok={patchedCount > 0}
            label={t("statusPatch")}
            detail={
              status.cursorFound
                ? t("statusPatched", { n: patchedCount, total: status.targets.length })
                : "—"
            }
          />
          <div className={cx(mono, "pt-1.5")} title={status.cursorRoot ?? status.configPath}>
            {status.cursorRoot ?? status.configPath}
          </div>
        </div>

        <div className="grid shrink-0 gap-2">
          <button
            className={cx(
              patchedCount > 0 ? btnStop : btnStart,
              (busy === "start" || busy === "stop") && "disabled:opacity-100",
            )}
            disabled={busy !== null}
            aria-busy={busy === "start" || busy === "stop"}
            aria-pressed={patchedCount > 0}
            onClick={() => void onTogglePatch()}
          >
            {busy === "start" || busy === "stop" ? (
              <>
                <Spinner />
                {busy === "stop" ? t("stopping") : t("starting")}
              </>
            ) : patchedCount > 0 ? (
              t("stop")
            ) : (
              t("start")
            )}
          </button>
          {busy === "start" || busy === "stop" ? (
            <div className="h-0.5 overflow-hidden rounded-full bg-line" aria-hidden="true">
              <div className="loading-bar h-full w-1/3 rounded-full bg-copper" />
            </div>
          ) : null}
          {patchedCount > 0 ? (
            <label className="flex cursor-pointer items-center gap-2 text-xs text-muted">
              <input
                type="checkbox"
                className="accent-copper"
                checked={force}
                onChange={(e) => setForce(e.target.checked)}
              />
              {t("forceRestore")}
            </label>
          ) : null}
        </div>

        <div className={cx(card, "mt-auto flex min-h-0 flex-1 flex-col")}>
          <h2 className={cx(headingSm, "shrink-0")}>{t("log")}</h2>
          <pre
            ref={logRef}
            className="m-0 min-h-0 flex-1 overflow-auto font-mono text-[11px] leading-normal break-words whitespace-pre-wrap text-[#d7ccbb]"
            aria-live="polite"
          >
            {log || t("logIdle")}
          </pre>
        </div>
      </aside>

      <main className={stage}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="m-0 text-[22px] tracking-[-0.04em]">{t("settings")}</h2>
          <div className="flex items-center gap-2">
            <LanguageDialog locale={locale} onChange={setLocale} t={t} />
            <button className={btnGhost} disabled={busy !== null} onClick={() => void api.openConfigDir()}>
              {t("openConfig")}
            </button>
            <button
              className={cx(btnGhost, busy === "save" && "disabled:opacity-100")}
              disabled={busy !== null}
              aria-busy={busy === "save"}
              onClick={() => void onSave()}
            >
              {busy === "save" ? (
                <>
                  <Spinner />
                  {t("saving")}
                </>
              ) : (
                t("save")
              )}
            </button>
          </div>
        </div>

        {banner ? (
          <div
            className={cx(
              "mb-4 rounded-xl border border-line px-3.5 py-3 text-[13px]",
              banner.kind === "ok" ? "bg-[#182016] text-[#d7e7c8]" : "bg-[#2a1c16] text-[#f3d4ce]",
            )}
          >
            {banner.text}
          </div>
        ) : null}

        <div className="grid gap-4">
          <section className={panel}>
            <h2 className={headingSm}>{t("upstream")}</h2>
            <div className="grid gap-3">
              <label className={field}>
                <span className="tracking-[0.02em]">{t("provider")}</span>
                <select
                  className={selectControl}
                  value={providerId}
                  onChange={(e) => {
                    const p = PROVIDERS.find((item) => item.id === e.target.value);
                    if (!p) return;
                    setProviderId(p.id);
                    if (!p.baseUrl) return;
                    setModelCustom(false);
                    setConfig({
                      ...config,
                      baseUrl: p.baseUrl,
                      defaultModel: p.defaultModel,
                      modelMapping: { ...fromPairs(mapping), "*": p.defaultModel },
                    });
                    setMapping((rows) => {
                      const next = rows.map((row) => (row.k === "*" ? { ...row, v: p.defaultModel } : row));
                      return next.some((row) => row.k === "*")
                        ? next
                        : [{ k: "*", v: p.defaultModel }, ...next];
                    });
                  }}
                >
                  {PROVIDERS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {t(`provider.${p.id}`)}
                    </option>
                  ))}
                </select>
              </label>
              <p className={cx(mono, "whitespace-normal")}>{t(`hint.${providerId}`)}</p>
              {providerId === "custom" ? (
                <div className="grid grid-cols-1 gap-3 min-[921px]:grid-cols-2">
                  <label className={field}>
                    <span className="tracking-[0.02em]">{t("baseUrl")}</span>
                    <input
                      className={control}
                      type="text"
                      value={config.baseUrl}
                      placeholder="http://127.0.0.1:6446/v1"
                      onChange={(e) => setConfig({ ...config, baseUrl: e.target.value })}
                    />
                  </label>
                  <label className={field}>
                    <span className="tracking-[0.02em]">{t("model")}</span>
                    <input
                      className={control}
                      type="text"
                      value={config.defaultModel}
                      placeholder="hy3-free"
                      onChange={(e) => {
                        const model = e.target.value;
                        setConfig({ ...config, defaultModel: model });
                        setMapping((rows) =>
                          rows.map((row) => (row.k === "*" ? { ...row, v: model } : row)),
                        );
                      }}
                    />
                  </label>
                </div>
              ) : (
                <label className={field}>
                  <span className="tracking-[0.02em]">{t("model")}</span>
                  <select
                    className={selectControl}
                    value={modelIsCustom ? "__custom__" : config.defaultModel}
                    onChange={(e) => {
                      if (e.target.value === "__custom__") {
                        setModelCustom(true);
                        return;
                      }
                      setModelCustom(false);
                      applyModel(e.target.value);
                    }}
                  >
                    {presetModels.map((model) => (
                      <option key={model} value={model}>
                        {model}
                      </option>
                    ))}
                    <option value="__custom__">{t("modelCustom")}</option>
                  </select>
                  {modelIsCustom ? (
                    <input
                      className={control}
                      type="text"
                      value={config.defaultModel}
                      placeholder={t("modelIdPlaceholder")}
                      onChange={(e) => applyModel(e.target.value)}
                    />
                  ) : null}
                </label>
              )}
              <label className={field}>
                <span className="tracking-[0.02em]">{t("apiKey")}</span>
                <input
                  className={control}
                  type="password"
                  autoComplete="off"
                  value={config.apiKey}
                  onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
                />
              </label>
              <button
                className={cx(btnGhost, "justify-self-start", busy === "test" && "disabled:opacity-100")}
                type="button"
                disabled={busy !== null}
                aria-busy={busy === "test"}
                onClick={() => void onTestConnection()}
              >
                {busy === "test" ? (
                  <>
                    <Spinner />
                    {t("testing")}
                  </>
                ) : (
                  t("testConnection")
                )}
              </button>
            </div>
          </section>

          <details className={cx(panel, "group")}>
            <summary className="mb-0 flex min-h-7 cursor-pointer list-none items-center justify-between text-[13px] font-semibold text-muted group-open:mb-3">
              {t("advanced")}
              <span className="inline-block h-[7px] w-[7px] rotate-45 border-r-[1.5px] border-b-[1.5px] border-muted transition-transform duration-200 group-open:rotate-[225deg] motion-reduce:transition-none" />
            </summary>
            <div className="grid gap-3">
              <h3 className={headingCopper}>
                {t("mapping")}
                <Tip text={t("tip.mapping")} label={t("help")} />
              </h3>
              {mapping.map((row, index) => (
                <div className="grid grid-cols-[1fr_1fr_36px] gap-2" key={index}>
                  <input
                    className={control}
                    type="text"
                    aria-label={t("cursorModel")}
                    placeholder={t("cursorModel")}
                    value={row.k}
                    onChange={(e) =>
                      setMapping(mapping.map((item, i) => (i === index ? { ...item, k: e.target.value } : item)))
                    }
                  />
                  <input
                    className={control}
                    type="text"
                    aria-label={t("upstreamModel")}
                    placeholder={t("upstreamModel")}
                    value={row.v}
                    onChange={(e) =>
                      setMapping(mapping.map((item, i) => (i === index ? { ...item, v: e.target.value } : item)))
                    }
                  />
                  <button
                    className={iconBtn}
                    type="button"
                    aria-label={t("deleteMapping")}
                    onClick={() => setMapping(mapping.filter((_, i) => i !== index))}
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                      <path d="M2 2l8 8M10 2L2 10" stroke="currentColor" strokeWidth="1.6" fill="none" />
                    </svg>
                  </button>
                </div>
              ))}
              <button
                className={cx(btnGhost, "justify-self-start")}
                type="button"
                onClick={() => setMapping([...mapping, { k: "", v: "" }])}
              >
                {t("addMapping")}
              </button>

              <h3 className={headingCopper}>
                {t("agentTools")}
                <Tip text={t("tip.agentTools")} label={t("help")} />
              </h3>
              <label className={check}>
                <input
                  className="accent-copper"
                  type="checkbox"
                  checked={config.agentTools}
                  onChange={(e) => setConfig({ ...config, agentTools: e.target.checked })}
                />
                {t("enableTools")}
                <Tip text={t("tip.enableTools")} label={t("help")} />
              </label>
              <label className={check}>
                <input
                  className="accent-copper"
                  type="checkbox"
                  checked={config.blockUsageGate}
                  onChange={(e) => setConfig({ ...config, blockUsageGate: e.target.checked })}
                />
                {t("blockUsage")}
                <Tip text={t("tip.blockUsage")} label={t("help")} />
              </label>
              <label className={field}>
                <span className="inline-flex items-center gap-1">
                  {t("agentPrompt")}
                  <Tip text={t("tip.agentPrompt")} label={t("help")} />
                </span>
                <textarea
                  className={textareaControl}
                  value={config.agentSystemPrompt}
                  onChange={(e) => setConfig({ ...config, agentSystemPrompt: e.target.value })}
                />
              </label>
              <div className="grid grid-cols-1 gap-3 min-[921px]:grid-cols-2">
                <label className={field}>
                  <span className="inline-flex items-center gap-1">
                    {t("toolTimeout")}
                    <Tip text={t("tip.toolTimeout")} label={t("help")} />
                  </span>
                  <input
                    className={control}
                    type="number"
                    min={1000}
                    value={config.agentToolTimeoutMs}
                    onChange={(e) =>
                      setConfig({ ...config, agentToolTimeoutMs: Number(e.target.value) || 30000 })
                    }
                  />
                </label>
                <label className={field}>
                  <span className="inline-flex items-center gap-1">
                    {t("maxRounds")}
                    <Tip text={t("tip.maxRounds")} label={t("help")} />
                  </span>
                  <input
                    className={control}
                    type="number"
                    min={1}
                    max={32}
                    value={config.agentMaxToolRounds}
                    onChange={(e) =>
                      setConfig({ ...config, agentMaxToolRounds: Number(e.target.value) || 8 })
                    }
                  />
                </label>
              </div>
              <div className="grid gap-2">
                {(
                  [
                    ["env", "ctxEnv"],
                    ["rules", "ctxRules"],
                    ["repo", "ctxRepo"],
                    ["layout", "ctxLayout"],
                    ["mcp", "ctxMcp"],
                    ["mcpToolSchemas", "ctxMcpSchemas"],
                  ] as const
                ).map(([key, labelKey]) => (
                  <label className={check} key={key}>
                    <input
                      className="accent-copper"
                      type="checkbox"
                      checked={config.agentContext[key]}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          agentContext: { ...config.agentContext, [key]: e.target.checked },
                        })
                      }
                    />
                    {t(labelKey)}
                    <Tip text={t(`tip.${labelKey}`)} label={t("help")} />
                  </label>
                ))}
              </div>

              <h3 className={headingCopper}>
                {t("intercept")}
                <Tip text={t("tip.intercept")} label={t("help")} />
              </h3>
              <div className="grid gap-2">
                {INTERCEPT_I18N.map((opt) => {
                  const on = config.interceptMethods.includes(opt.id);
                  return (
                    <label className={check} key={opt.id}>
                      <input
                        className="accent-copper"
                        type="checkbox"
                        checked={on}
                        onChange={() => {
                          const next = on
                            ? config.interceptMethods.filter((id) => id !== opt.id)
                            : [...config.interceptMethods, opt.id];
                          setConfig({ ...config, interceptMethods: next });
                        }}
                      />
                      {t(opt.key)}
                      <Tip text={`${t(`tip.${opt.key}`)} ${opt.id}`} label={t("help")} />
                    </label>
                  );
                })}
              </div>

              <h3 className={headingCopper}>
                {t("sampling")}
                <Tip text={t("tip.sampling")} label={t("help")} />
              </h3>
              <div className="grid grid-cols-1 gap-3 min-[921px]:grid-cols-2">
                <label className={field}>
                  <span className="inline-flex items-center gap-1">
                    {t("temperature")}
                    <Tip text={t("tip.temperature")} label={t("help")} />
                  </span>
                  <input
                    className={control}
                    type="number"
                    step="0.1"
                    value={config.temperature ?? ""}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        temperature: e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                  />
                </label>
                <label className={field}>
                  <span className="inline-flex items-center gap-1">
                    {t("maxTokens")}
                    <Tip text={t("tip.maxTokens")} label={t("help")} />
                  </span>
                  <input
                    className={control}
                    type="number"
                    value={config.maxTokens ?? ""}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        maxTokens: e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                  />
                </label>
              </div>
              <label className={check}>
                <input
                  className="accent-copper"
                  type="checkbox"
                  checked={config.sendReasoningAsText}
                  onChange={(e) => setConfig({ ...config, sendReasoningAsText: e.target.checked })}
                />
                {t("reasoningAsText")}
                <Tip text={t("tip.reasoningAsText")} label={t("help")} />
              </label>
              <label className={check}>
                <input
                  className="accent-copper"
                  type="checkbox"
                  checked={config.debugDump}
                  onChange={(e) => setConfig({ ...config, debugDump: e.target.checked })}
                />
                {t("debugDump")}
                <Tip text={t("tip.debugDump")} label={t("help")} />
              </label>
              <label className={field}>
                <span className="inline-flex items-center gap-1">
                  {t("extraHeaders")}
                  <Tip text={t("tip.extraHeaders")} label={t("help")} />
                </span>
                <textarea
                  className={textareaControl}
                  value={headersText}
                  onChange={(e) => setHeadersText(e.target.value)}
                />
              </label>
            </div>
          </details>
        </div>
      </main>
    </div>
  );
}

function Tip({ text, label }: { text: string; label: string }) {
  const id = useId();
  return (
    <span className="group/tip relative inline-flex shrink-0">
      <button
        type="button"
        className="h-[18px] w-[18px] cursor-help rounded-full border border-line bg-transparent p-0 text-[11px] font-semibold leading-none text-muted group-hover/tip:border-copper group-hover/tip:text-copper-2 group-focus-within/tip:border-copper group-focus-within/tip:text-copper-2"
        aria-label={label}
        aria-describedby={id}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onMouseDown={(e) => e.preventDefault()}
      >
        ?
      </button>
      <span
        className="absolute top-[calc(100%+6px)] left-0 z-40 hidden w-max max-w-[min(280px,62vw)] rounded-lg border border-line bg-raised px-2.5 py-2 text-xs font-normal tracking-normal text-ink normal-case shadow-panel group-hover/tip:block group-focus-within/tip:block"
        role="tooltip"
        id={id}
      >
        {text}
      </span>
    </span>
  );
}

function LanguageDialog({
  locale,
  onChange,
  t,
}: {
  locale: Locale;
  onChange: (id: Locale) => void;
  t: (key: string) => string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const current = LOCALES.find((item) => item.id === locale)?.native ?? locale;
  return (
    <>
      <button
        type="button"
        className={btnGhost}
        aria-haspopup="dialog"
        aria-label={t("language")}
        onClick={() => ref.current?.showModal()}
      >
        {current}
      </button>
      <dialog
        ref={ref}
        className="lang-dialog w-[min(360px,calc(100vw-48px))] rounded-2xl border border-line bg-rail p-0 text-ink shadow-panel"
        aria-labelledby="lang-dialog-title"
        onClick={(e) => {
          if (e.target === e.currentTarget) e.currentTarget.close();
        }}
      >
        <form method="dialog" className="grid gap-2 px-4 pt-[18px] pb-4">
          <h2 id="lang-dialog-title" className={headingSm}>
            {t("language")}
          </h2>
          {LOCALES.map((item) => (
            <button
              key={item.id}
              type="submit"
              className={cx(
                "min-h-12 cursor-pointer rounded-[10px] border bg-app px-3.5 text-left text-[15px] text-ink",
                item.id === locale
                  ? "border-copper text-copper-2"
                  : "border-line hover:border-copper-2",
                "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-copper-2",
              )}
              onClick={() => onChange(item.id)}
            >
              {item.native}
            </button>
          ))}
        </form>
      </dialog>
    </>
  );
}

function StatusLine({
  ok,
  warn,
  label,
  detail,
}: {
  ok: boolean;
  warn?: boolean;
  label: string;
  detail: string;
}) {
  const dot = warn
    ? "bg-warn shadow-[0_0_0_4px_rgba(212,163,74,0.16)]"
    : ok
      ? "bg-ok shadow-[0_0_0_4px_rgba(143,173,115,0.16)]"
      : "bg-bad shadow-[0_0_0_4px_rgba(196,92,74,0.16)]";
  return (
    <div className="flex items-center justify-between gap-2.5 py-1.5 text-[13px]">
      <span className="flex items-center gap-2">
        <span className={cx("h-2 w-2 rounded-full", dot)} />
        {label}
      </span>
      <span className={mono}>{detail}</span>
    </div>
  );
}
