import type { TFn } from "../i18n";
import type { AppUpdate } from "../hooks/useAppUpdate";
import { cx } from "../ui";
import { Spinner } from "./Spinner";

export function BrandTitle({
  version,
  update,
  t,
}: {
  version: string;
  update: AppUpdate;
  t: TFn;
}) {
  const { phase } = update;
  const offer =
    phase.kind === "available" ||
    phase.kind === "downloading" ||
    phase.kind === "installing" ||
    phase.kind === "error";
  const busy = phase.kind === "downloading" || phase.kind === "installing";
  const nextVersion = offer ? phase.version : "";

  let label = t("updateTo", { version: nextVersion });
  if (phase.kind === "downloading") {
    label =
      phase.percent == null
        ? t("updateDownloading")
        : t("updateDownloadingPercent", { percent: phase.percent });
  } else if (phase.kind === "installing") {
    label = t("updateInstalling");
  }

  return (
    <div className="flex flex-col gap-1.5">
      <h1 className="m-0 flex items-baseline gap-2 text-lg font-bold leading-tight tracking-[-0.03em]">
        Cursor Gateway{" "}
        <span className="font-mono text-[11px] font-medium tracking-[0.04em] text-muted">
          v{version}
        </span>
      </h1>
      {offer ? (
        <button
          type="button"
          className={cx(
            "inline-flex w-fit cursor-pointer items-center gap-1.5 rounded-lg border border-copper/50 bg-transparent px-2.5 py-1 text-xs font-semibold text-copper-2",
            "hover:enabled:bg-copper/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-copper-2",
            "disabled:cursor-progress disabled:opacity-80",
          )}
          disabled={busy}
          aria-busy={busy}
          onClick={() => void update.install()}
        >
          {busy ? <Spinner className="h-3.5 w-3.5" /> : null}
          {label}
        </button>
      ) : null}
      {phase.kind === "downloading" ? (
        <div className="h-0.5 overflow-hidden rounded-full bg-line" aria-hidden="true">
          <div
            className={cx(
              "h-full rounded-full bg-copper",
              phase.percent == null && "loading-bar w-1/3",
            )}
            style={phase.percent == null ? undefined : { width: `${phase.percent}%` }}
          />
        </div>
      ) : null}
      {phase.kind === "error" ? (
        <p className="m-0 line-clamp-3 text-[11px] leading-snug break-words text-bad" role="alert">
          {t("updateFailed", { message: phase.message })}
        </p>
      ) : null}
    </div>
  );
}
