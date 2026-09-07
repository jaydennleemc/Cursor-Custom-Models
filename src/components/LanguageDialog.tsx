import { useRef } from "react";
import { LOCALES, type Locale, type TFn } from "../i18n";
import { btnGhost, cx, headingSm } from "../ui";

export function LanguageDialog({
  locale,
  onChange,
  t,
}: {
  locale: Locale;
  onChange: (id: Locale) => void;
  t: TFn;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button
        type="button"
        className={cx(btnGhost, "px-2.5")}
        aria-haspopup="dialog"
        aria-label={t("language")}
        onClick={() => ref.current?.showModal()}
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
          <circle cx="12" cy="12" r="10" />
          <path d="M2 12h20" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
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
