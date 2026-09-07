import type { ReadyGateway } from "../hooks/useGateway";
import { btnGhost, btnQuit, btnStart, btnStop, card, cx, headingSm, mono, rail } from "../ui";
import { Spinner } from "./Spinner";
import { StatusLine } from "./StatusLine";

export function Rail({ gw, version }: { gw: ReadyGateway; version: string }) {
  const { status, patchedCount, busy, force, setForce, log, logRef, t } = gw;

  return (
    <aside className={rail}>
      <div className="flex flex-col gap-1.5">
        <h1 className="m-0 flex items-baseline gap-2 text-lg font-bold leading-tight tracking-[-0.03em]">
          Cursor Gateway{" "}
          <span className="font-mono text-[11px] font-medium tracking-[0.04em] text-muted">
            v{version}
          </span>
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
          onClick={() => void gw.onTogglePatch()}
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
        <div className="grid grid-cols-2 gap-2">
          <button
            className={cx(btnGhost, "min-h-11", busy === "openCursor" && "disabled:opacity-100")}
            disabled={busy !== null || !status.cursorFound}
            aria-busy={busy === "openCursor"}
            onClick={() => void gw.onOpenCursor()}
          >
            {busy === "openCursor" ? (
              <>
                <Spinner />
                {t("openingCursor")}
              </>
            ) : (
              t("openCursor")
            )}
          </button>
          <button
            className={cx(btnQuit, busy === "quitCursor" && "disabled:opacity-100")}
            disabled={busy !== null || !status.cursorRunning}
            aria-busy={busy === "quitCursor"}
            onClick={() => void gw.onQuitCursor()}
          >
            {busy === "quitCursor" ? (
              <>
                <Spinner />
                {t("quittingCursor")}
              </>
            ) : (
              t("quitCursor")
            )}
          </button>
        </div>
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
  );
}
