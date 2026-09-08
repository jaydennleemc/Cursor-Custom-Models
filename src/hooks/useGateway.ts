import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import * as api from "../api";
import { clock, fromPairs, parseHeaders, probeRoute, toPairs, type Pair } from "../form";
import { createT, readLocale, writeLocale, type Locale, type TFn } from "../i18n";
import { matchProvider } from "../providers";
import type { AppConfig, AppStatus } from "../types";

export type BusyKind = "start" | "stop" | "test" | "save" | "openCursor" | "quitCursor" | null;

export type Banner = { kind: "ok" | "bad"; text: string };

export type Gateway = {
  status: AppStatus | null;
  config: AppConfig | null;
  setConfig: (config: AppConfig) => void;
  providerId: string;
  setProviderId: (id: string) => void;
  modelCustom: boolean;
  setModelCustom: (value: boolean) => void;
  mapping: Pair[];
  setMapping: Dispatch<SetStateAction<Pair[]>>;
  headersText: string;
  setHeadersText: (text: string) => void;
  busy: BusyKind;
  force: boolean;
  setForce: (value: boolean) => void;
  locale: Locale;
  setLocale: (locale: Locale) => void;
  showProfileSave: boolean;
  setShowProfileSave: (show: boolean) => void;
  t: TFn;
  banner: Banner | null;
  log: string;
  logRef: RefObject<HTMLPreElement | null>;
  patchedCount: number;
  applyModel: (model: string) => void;
  syncConfig: (config: AppConfig) => void;
  commitConfig: (config: AppConfig) => void;
  onSave: () => Promise<void>;
  onTestConnection: () => Promise<void>;
  onTogglePatch: () => Promise<void>;
  onOpenCursor: () => Promise<void>;
  onQuitCursor: () => Promise<void>;
};

export type ReadyGateway = Gateway & {
  status: AppStatus;
  config: AppConfig;
};

export function useGateway(): Gateway {
  const [status, setStatus] = useState<AppStatus | null>(null);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [providerId, setProviderId] = useState("custom");
  const [modelCustom, setModelCustom] = useState(false);
  const [mapping, setMapping] = useState<Pair[]>([{ k: "*", v: "hy3-free" }]);
  const [headersText, setHeadersText] = useState("{}");
  const [busy, setBusy] = useState<BusyKind>(null);
  const [force, setForce] = useState(false);
  const [locale, setLocale] = useState<Locale>(() => readLocale());
  const [showProfileSave, setShowProfileSave] = useState(false);
  const t = useMemo(() => createT(locale), [locale]);
  const [banner, setBanner] = useState<Banner | null>(null);
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
    () => status?.targets.filter((item) => item.patched).length ?? 0,
    [status],
  );

  function writeLog(title: string, lines: string[]) {
    const block = [`${clock(locale)}  ${title}`, ...lines.filter((line) => line.trim())].join("\n");
    setLog((prev) => {
      const next = prev.trim() ? `${prev}\n${block}` : block;
      if (next.length <= 12000) return next;
      const cut = next.slice(next.length - 12000);
      const nl = cut.indexOf("\n");
      return nl >= 0 ? cut.slice(nl + 1) : cut;
    });
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

  function hydrateConfig(cfg: AppConfig) {
    setConfig(cfg);
    const matched = matchProvider(cfg.baseUrl);
    setProviderId(matched.id);
    setModelCustom(!matched.models.includes(cfg.defaultModel));
    setMapping(toPairs(cfg.modelMapping));
    setHeadersText(JSON.stringify(cfg.extraHeaders ?? {}, null, 2));
  }

  function commitConfig(cfg: AppConfig) {
    hydrateConfig(cfg);
    void api.saveConfig(cfg).catch(() => { /* keep UI; next Save retries */ });
  }

  function syncConfig(cfg: AppConfig) {
    commitConfig(cfg);
  }

  function applyModel(model: string) {
    if (!config) return;
    const rows = mapping.map((row) => (row.k === "*" ? { ...row, v: model } : row));
    const nextRows = rows.some((row) => row.k === "*") ? rows : [{ k: "*", v: model }, ...rows];
    setMapping(nextRows);
    commitConfig({
      ...config,
      defaultModel: model,
      modelMapping: fromPairs(nextRows),
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

  async function onOpenCursor() {
    writeLog(t("openingCursor"), []);
    await run("openCursor", async () => {
      const detail = await api.openCursor();
      writeLog(t("cursorOpened"), [detail]);
      setBanner({ kind: "ok", text: t("cursorOpened") });
    });
  }

  async function onQuitCursor() {
    writeLog(t("quittingCursor"), []);
    await run("quitCursor", async () => {
      const detail = await api.quitCursor();
      writeLog(t("cursorQuit"), [detail]);
      setBanner({ kind: "ok", text: t("cursorQuit") });
    });
  }

  return {
    status,
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
    force,
    setForce,
    locale,
    setLocale,
    showProfileSave,
    setShowProfileSave,
    t,
    banner,
    log,
    logRef,
    patchedCount,
    applyModel,
    syncConfig,
    commitConfig,
    onSave,
    onTestConnection,
    onTogglePatch,
    onOpenCursor,
    onQuitCursor,
  };
}
