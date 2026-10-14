import type { ReactNode } from "react";
import { cx, mono } from "../ui";

export function StatusLine({
  ok,
  warn,
  label,
  detail,
  extra,
}: {
  ok: boolean;
  warn?: boolean;
  label: string;
  detail: string;
  extra?: ReactNode;
}) {
  const dot = warn
    ? "bg-warn shadow-[0_0_0_4px_rgba(212,163,74,0.16)]"
    : ok
      ? "bg-ok shadow-[0_0_0_4px_rgba(143,173,115,0.16)]"
      : "bg-bad shadow-[0_0_0_4px_rgba(196,92,74,0.16)]";
  return (
    <div className="flex items-center justify-between gap-2.5 py-1.5 text-[11px]">
      <span className="flex items-center gap-2">
        <span className={cx("h-2 w-2 rounded-full", dot)} />
        {label}
      </span>
      <span className="flex min-w-0 items-center justify-end gap-1.5">
        <span className={mono}>{detail}</span>
        {extra}
      </span>
    </div>
  );
}
