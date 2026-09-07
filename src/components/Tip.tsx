import { useId } from "react";

export function Tip({ text, label }: { text: string; label: string }) {
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
