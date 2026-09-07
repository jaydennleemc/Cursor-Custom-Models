import { cx } from "../ui";

export function Spinner({ className }: { className?: string }) {
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
