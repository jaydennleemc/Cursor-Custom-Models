export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export const shell =
  "relative isolate grid h-full grid-cols-1 min-[921px]:grid-cols-[320px_1fr] max-[920px]:overflow-auto";

export const rail =
  "relative z-[1] flex h-full min-h-0 flex-col gap-[18px] overflow-hidden border-r border-line bg-rail bg-[radial-gradient(1200px_280px_at_-10%_-20%,rgba(212,120,74,0.16),transparent_50%)] px-5 pb-[18px] pt-[22px]";

export const stage =
  "relative z-[1] min-h-0 overflow-auto bg-app bg-[linear-gradient(180deg,rgba(36,31,25,0.4),transparent_140px)] px-[26px] pb-8 pt-[22px]";

const btn =
  "inline-flex cursor-pointer appearance-none items-center justify-center gap-2 rounded-xl px-4 transition-colors duration-200 ease-in-out disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-copper-2 motion-reduce:transition-none";

export const btnStart = cx(
  btn,
  "min-h-11 bg-copper font-bold tracking-[0.04em] text-[#1a120c] hover:enabled:bg-copper-2",
);

export const btnStop = cx(
  btn,
  "min-h-11 bg-bad font-bold tracking-[0.04em] text-[#f8ece9] hover:enabled:bg-[#d46b59]",
);

export const btnGhost = cx(
  btn,
  "min-h-9 border border-line bg-transparent text-[13px] text-muted hover:enabled:text-ink",
);

export const control =
  "w-full min-h-10 rounded-[10px] border border-line bg-app px-2.5 py-2 text-ink outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-copper-2 motion-reduce:transition-none";

export const selectControl =
  "h-10 w-full cursor-pointer rounded-[10px] border border-line bg-app px-2.5 text-ink outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-copper-2 motion-reduce:transition-none";

export const textareaControl = cx(control, "min-h-[88px] resize-y font-mono text-xs leading-snug");

export const field = "grid gap-1.5 text-[13px] text-muted";

export const check =
  "flex min-h-8 cursor-pointer items-center gap-2 text-[13px] text-ink";

export const panel =
  "rounded-2xl border border-line bg-rail px-4 pb-[18px] pt-4 shadow-panel";

export const card =
  "rounded-[14px] border border-line bg-[rgba(19,17,14,0.55)] p-3";

export const headingSm =
  "m-0 mb-2.5 text-[13px] font-semibold uppercase tracking-[0.08em] text-muted";

export const headingCopper =
  "m-1 mb-0 flex items-center gap-1 text-xs font-semibold tracking-[0.04em] text-copper-2";

export const mono =
  "overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[11px] text-muted";

export const iconBtn =
  "min-h-10 min-w-9 cursor-pointer rounded-[10px] border border-line bg-transparent text-muted hover:border-bad hover:text-bad focus-visible:outline-2 focus-visible:outline-copper-2";
