import * as api from "../api";
import { fromPairs } from "../form";
import type { ReadyGateway } from "../hooks/useGateway";
import { INTERCEPT_I18N } from "../i18n";
import { PROVIDERS } from "../providers";
import {
  btnGhost,
  check,
  control,
  cx,
  field,
  headingCopper,
  headingSm,
  iconBtn,
  mono,
  panel,
  selectControl,
  stage,
  textareaControl,
} from "../ui";
import { LanguageDialog } from "./LanguageDialog";
import { ProfilesSection } from "./ProfilesSection";
import { Spinner } from "./Spinner";
import { Tip } from "./Tip";

export function Settings({ gw }: { gw: ReadyGateway }) {
  const {
    config,
    setConfig,
    providerId,
    setProviderId,
    modelCustom,
    setModelCustom,
    mapping,
    setMapping,
    headersText,
    setHeadersText,
    busy,
    locale,
    setLocale,
    showProfileSave,
    setShowProfileSave,
    t,
    banner,
    applyModel,
  } = gw;

  const preset = PROVIDERS.find((p) => p.id === providerId);
  const presetModels = preset?.models ?? [];
  const modelIsCustom = modelCustom || !presetModels.includes(config.defaultModel);

  return (
    <main className={stage}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="m-0 text-[22px] tracking-[-0.04em]">{t("settings")}</h2>
        <div className="flex items-center gap-2">
          <LanguageDialog locale={locale} onChange={setLocale} t={t} />
          <button
            type="button"
            className={cx(btnGhost, "px-2.5")}
            disabled={busy !== null}
            aria-label={t("openConfig")}
            onClick={() => void api.openConfigDir()}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-5 w-5"
            >
              <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
            </svg>
          </button>
          <button
            type="button"
            className={cx(btnGhost, "px-2.5", busy === "save" && "disabled:opacity-100")}
            disabled={busy !== null}
            aria-label={t("save")}
            aria-busy={busy === "save"}
            onClick={() => void gw.onSave()}
          >
            {busy === "save" ? (
              <Spinner className="h-5 w-5" />
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5"
              >
                <path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
                <path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7" />
                <path d="M7 3v4a1 1 0 0 0 1 1h7" />
              </svg>
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
          <div className="flex items-center justify-between">
            <h2 className={headingSm}>{t("upstream")}</h2>
            <ProfilesSection
              config={config}
              t={t}
              onConfigChange={setConfig}
              showSave={showProfileSave}
              onShowSaveChange={setShowProfileSave}
            />
          </div>
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
            <div className="flex items-center gap-2 justify-self-start">
              <button
                className={cx(btnGhost, busy === "test" && "disabled:opacity-100")}
                type="button"
                disabled={busy !== null}
                aria-busy={busy === "test"}
                onClick={() => void gw.onTestConnection()}
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
              <button
                className={btnGhost}
                type="button"
                disabled={busy !== null}
                onClick={() => setShowProfileSave(true)}
              >
                {t("profileSave")}
              </button>
            </div>
          </div>
        </section>

        <details className={cx(panel, "group")}>
          <summary className="mb-0 flex min-h-7 cursor-pointer list-none items-center justify-between text-[13px] font-semibold text-muted group-open:mb-3">
            {t("advanced")}
            <span className="inline-block h-[7px] w-[7px] rotate-45 border-r-[1.5px] border-b-[1.5px] border-muted transition-transform duration-200 group-open:rotate-[225deg] motion-reduce:transition-none" />
          </summary>
          <div className="grid gap-4">
            {/* Model Mapping */}
            <div className="rounded-lg border border-line p-3">
              <h3 className={cx(headingCopper, "mb-2")}>
                {t("mapping")}
                <Tip text={t("tip.mapping")} label={t("help")} />
              </h3>
              <div className="grid gap-2">
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
              </div>
            </div>

            {/* Agent Tools */}
            <div className="rounded-lg border border-line p-3">
              <h3 className={cx(headingCopper, "mb-2")}>
                {t("agentTools")}
                <Tip text={t("tip.agentTools")} label={t("help")} />
              </h3>
              <div className="grid grid-cols-1 gap-2 min-[600px]:grid-cols-2">
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
              </div>
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
            </div>

            {/* Context */}
            <div className="rounded-lg border border-line p-3">
              <h3 className={cx(headingCopper, "mb-2")}>
                {t("context")}
                <Tip text={t("tip.agentTools")} label={t("help")} />
              </h3>
              <div className="grid grid-cols-1 gap-2 min-[600px]:grid-cols-2">
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
            </div>

            {/* Intercept */}
            <div className="rounded-lg border border-line p-3">
              <h3 className={cx(headingCopper, "mb-2")}>
                {t("intercept")}
                <Tip text={t("tip.intercept")} label={t("help")} />
              </h3>
              <div className="grid grid-cols-1 gap-2 min-[600px]:grid-cols-2">
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
            </div>

          </div>
        </details>
      </div>
    </main>
  );
}
