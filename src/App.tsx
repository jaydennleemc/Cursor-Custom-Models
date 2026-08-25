import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import "./App.css";
import * as api from "./api";
import type { AppConfig, AppStatus } from "./types";
import { PROVIDERS, matchProvider, needsCorsProxy } from "./providers";
import {
  createT,
  INTERCEPT_I18N,
  LOCALES,
  type Locale,
  readLocale,
  writeLocale,
} from "./i18n";

const APP_VERSION = "1.0.0";

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
  const [busy, setBusy] = useState(false);
  const [force, setForce] = useState(false);
  const [locale, setLocale] = useState<Locale>(() => readLocale());
  const t = useMemo(() => createT(locale), [locale]);
  const [banner, setBanner] = useState<{ kind: "ok" | "bad"; text: string } | null>(null);
  const [log, setLog] = useState("");

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

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setBanner(null);
    try {
      await action();
      await refresh();
    } catch (err: unknown) {
      setBanner({ kind: "bad", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
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
    await run(async () => {
      const next = assembleConfig();
      const path = await api.saveConfig(next);
      setConfig(next);
      setBanner({ kind: "ok", text: t("saved", { path }) });
    });
  }

  async function onTestConnection() {
    setBusy(true);
    setBanner(null);
    try {
      const next = assembleConfig();
      const result = await api.testConnection(next);
      setLog(
        [
          result.ok ? t("testOk") : t("testFail"),
          t("testModel", { model: result.model }),
          t("testHttp", { status: result.status || "—" }),
          `${result.latencyMs}ms`,
          result.message,
        ].join("\n"),
      );
      setBanner({
        kind: result.ok ? "ok" : "bad",
        text: result.ok ? t("testOk") : result.message || t("testFail"),
      });
    } catch (err: unknown) {
      setBanner({ kind: "bad", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  async function onTogglePatch() {
    await run(async () => {
      if (patchedCount > 0) {
        const result = await api.stopRestore(force);
        setLog(result.log.join("\n"));
        setBanner({
          kind: result.ok ? "ok" : "bad",
          text: result.ok ? t("stopped") : t("stopPartial"),
        });
        return;
      }
      const next = assembleConfig();
      const result = await api.startPatch(next);
      setLog(result.log.join("\n"));
      setBanner({
        kind: result.ok ? "ok" : "bad",
        text: result.ok ? t("started") : t("startPartial"),
      });
    });
  }

  if (!config || !status) {
    return (
      <div className="shell">
        <aside className="rail">
          <div className="brand">
            <h1>
              Cursor Gateway <span className="ver">v{APP_VERSION}</span>
            </h1>
            <p>{t("loading")}</p>
          </div>
        </aside>
        <main className="stage" />
      </div>
    );
  }

  const preset = PROVIDERS.find((p) => p.id === providerId);
  const presetModels = preset?.models ?? [];
  const modelIsCustom = modelCustom || !presetModels.includes(config.defaultModel);

  return (
    <div className="shell">
      <aside className="rail">
        <div className="brand">
          <h1>
            Cursor Gateway <span className="ver">v{APP_VERSION}</span>
          </h1>
        </div>

        <div className="status-card">
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
          <div className="mono" title={status.cursorRoot ?? status.configPath}>
            {status.cursorRoot ?? status.configPath}
          </div>
        </div>

        <div className="actions">
          <button
            className={`btn ${patchedCount > 0 ? "btn-stop" : "btn-start"}`}
            disabled={busy}
            aria-pressed={patchedCount > 0}
            onClick={() => void onTogglePatch()}
          >
            {patchedCount > 0 ? t("stop") : t("start")}
          </button>
          {patchedCount > 0 ? (
            <label className="force">
              <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />
              {t("forceRestore")}
            </label>
          ) : null}
          {needsCorsProxy(config.baseUrl) ? (
            <p className="mono">
              {t("corsHint")}{" "}
              {status.proxyRunning ? t("corsOn", { port: status.proxyPort ?? "" }) : t("corsOff")}
            </p>
          ) : null}
        </div>

        <div className="log-card">
          <h2>{t("log")}</h2>
          <pre className="log">{log || t("logIdle")}</pre>
        </div>
      </aside>

      <main className="stage">
        <div className="toolbar">
          <h2>{t("settings")}</h2>
          <div className="toolbar-actions">
            <LanguageDialog locale={locale} onChange={setLocale} t={t} />
            <button className="btn btn-ghost" disabled={busy} onClick={() => void api.openConfigDir()}>
              {t("openConfig")}
            </button>
            <button className="btn btn-ghost" disabled={busy} onClick={() => void onSave()}>
              {t("save")}
            </button>
          </div>
        </div>

        {banner ? <div className={`banner ${banner.kind}`}>{banner.text}</div> : null}

        <div className="grid">
          <section className="panel">
            <h2>{t("upstream")}</h2>
            <div className="fields">
              <label className="field">
                <span>{t("provider")}</span>
                <select
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
              <p className="mono">{t(`hint.${providerId}`)}</p>
              {providerId === "custom" ? (
                <div className="row-2">
                  <label className="field">
                    <span>{t("baseUrl")}</span>
                    <input
                      type="text"
                      value={config.baseUrl}
                      placeholder="http://127.0.0.1:6446/v1"
                      onChange={(e) => setConfig({ ...config, baseUrl: e.target.value })}
                    />
                  </label>
                  <label className="field">
                    <span>{t("model")}</span>
                    <input
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
                <label className="field">
                  <span>{t("model")}</span>
                  <select
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
                      type="text"
                      value={config.defaultModel}
                      placeholder={t("modelIdPlaceholder")}
                      onChange={(e) => applyModel(e.target.value)}
                    />
                  ) : null}
                </label>
              )}
              <label className="field">
                <span>{t("apiKey")}</span>
                <input
                  type="password"
                  autoComplete="off"
                  value={config.apiKey}
                  onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
                />
              </label>
              <button
                className="btn btn-ghost"
                type="button"
                disabled={busy}
                onClick={() => void onTestConnection()}
              >
                {busy ? t("testing") : t("testConnection")}
              </button>
            </div>
          </section>

          <details className="panel more">
            <summary>{t("advanced")}</summary>
            <div className="fields">
              <h3>
                {t("mapping")}
                <Tip text={t("tip.mapping")} label={t("help")} />
              </h3>
              {mapping.map((row, index) => (
                <div className="map-row" key={index}>
                  <input
                    type="text"
                    aria-label={t("cursorModel")}
                    placeholder={t("cursorModel")}
                    value={row.k}
                    onChange={(e) =>
                      setMapping(mapping.map((item, i) => (i === index ? { ...item, k: e.target.value } : item)))
                    }
                  />
                  <input
                    type="text"
                    aria-label={t("upstreamModel")}
                    placeholder={t("upstreamModel")}
                    value={row.v}
                    onChange={(e) =>
                      setMapping(mapping.map((item, i) => (i === index ? { ...item, v: e.target.value } : item)))
                    }
                  />
                  <button
                    className="icon-btn"
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
                className="btn btn-ghost"
                type="button"
                onClick={() => setMapping([...mapping, { k: "", v: "" }])}
              >
                {t("addMapping")}
              </button>

              <h3>
                {t("agentTools")}
                <Tip text={t("tip.agentTools")} label={t("help")} />
              </h3>
              <label className="check">
                <input
                  type="checkbox"
                  checked={config.agentTools}
                  onChange={(e) => setConfig({ ...config, agentTools: e.target.checked })}
                />
                {t("enableTools")}
                <Tip text={t("tip.enableTools")} label={t("help")} />
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={config.blockUsageGate}
                  onChange={(e) => setConfig({ ...config, blockUsageGate: e.target.checked })}
                />
                {t("blockUsage")}
                <Tip text={t("tip.blockUsage")} label={t("help")} />
              </label>
              <label className="field">
                <span className="field-label">
                  {t("agentPrompt")}
                  <Tip text={t("tip.agentPrompt")} label={t("help")} />
                </span>
                <textarea
                  value={config.agentSystemPrompt}
                  onChange={(e) => setConfig({ ...config, agentSystemPrompt: e.target.value })}
                />
              </label>
              <div className="row-2">
                <label className="field">
                  <span className="field-label">
                    {t("toolTimeout")}
                    <Tip text={t("tip.toolTimeout")} label={t("help")} />
                  </span>
                  <input
                    type="number"
                    min={1000}
                    value={config.agentToolTimeoutMs}
                    onChange={(e) =>
                      setConfig({ ...config, agentToolTimeoutMs: Number(e.target.value) || 30000 })
                    }
                  />
                </label>
                <label className="field">
                  <span className="field-label">
                    {t("maxRounds")}
                    <Tip text={t("tip.maxRounds")} label={t("help")} />
                  </span>
                  <input
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
              <div className="check-grid">
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
                  <label className="check" key={key}>
                    <input
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

              <h3>
                {t("intercept")}
                <Tip text={t("tip.intercept")} label={t("help")} />
              </h3>
              <div className="check-grid">
                {INTERCEPT_I18N.map((opt) => {
                  const on = config.interceptMethods.includes(opt.id);
                  return (
                    <label className="check" key={opt.id}>
                      <input
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

              <h3>
                {t("sampling")}
                <Tip text={t("tip.sampling")} label={t("help")} />
              </h3>
              <div className="row-2">
                <label className="field">
                  <span className="field-label">
                    {t("temperature")}
                    <Tip text={t("tip.temperature")} label={t("help")} />
                  </span>
                  <input
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
                <label className="field">
                  <span className="field-label">
                    {t("maxTokens")}
                    <Tip text={t("tip.maxTokens")} label={t("help")} />
                  </span>
                  <input
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
              <label className="check">
                <input
                  type="checkbox"
                  checked={config.sendReasoningAsText}
                  onChange={(e) => setConfig({ ...config, sendReasoningAsText: e.target.checked })}
                />
                {t("reasoningAsText")}
                <Tip text={t("tip.reasoningAsText")} label={t("help")} />
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={config.debugDump}
                  onChange={(e) => setConfig({ ...config, debugDump: e.target.checked })}
                />
                {t("debugDump")}
                <Tip text={t("tip.debugDump")} label={t("help")} />
              </label>
              <label className="field">
                <span className="field-label">
                  {t("extraHeaders")}
                  <Tip text={t("tip.extraHeaders")} label={t("help")} />
                </span>
                <textarea value={headersText} onChange={(e) => setHeadersText(e.target.value)} />
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
    <span className="tip">
      <button
        type="button"
        className="tip-btn"
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
      <span className="tip-pop" role="tooltip" id={id}>
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
        className="btn btn-ghost"
        aria-haspopup="dialog"
        aria-label={t("language")}
        onClick={() => ref.current?.showModal()}
      >
        {current}
      </button>
      <dialog
        ref={ref}
        className="lang-dialog"
        aria-labelledby="lang-dialog-title"
        onClick={(e) => {
          if (e.target === e.currentTarget) e.currentTarget.close();
        }}
      >
        <form method="dialog" className="lang-dialog-body">
          <h2 id="lang-dialog-title">{t("language")}</h2>
          {LOCALES.map((item) => (
            <button
              key={item.id}
              type="submit"
              className={`lang-option${item.id === locale ? " current" : ""}`}
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
  const cls = warn ? "warn" : ok ? "ok" : "bad";
  return (
    <div className="status-row">
      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span className={`dot ${cls}`} />
        {label}
      </span>
      <span className="mono">{detail}</span>
    </div>
  );
}
