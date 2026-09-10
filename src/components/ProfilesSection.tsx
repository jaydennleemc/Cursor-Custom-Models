import { useCallback, useEffect, useRef, useState } from "react";
import * as api from "../api";
import type { TFn } from "../i18n";
import type { AppConfig } from "../types";
import { btnGhost, control, cx, field, headingSm, iconBtn } from "../ui";

export function ProfilesSection({
  config,
  t,
  syncConfig,
  showSave,
  onShowSaveChange,
}: {
  config: AppConfig;
  t: TFn;
  syncConfig: (config: AppConfig) => void;
  showSave: boolean;
  onShowSaveChange: (show: boolean) => void;
}) {
  const [profiles, setProfiles] = useState<Record<string, AppConfig>>({});
  const [activeProfile, setActiveProfile] = useState<string | null>(null);
  const [newProfileName, setNewProfileName] = useState("");
  const [busy, setBusy] = useState<"load" | "save" | "delete" | "rename" | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const deleteRef = useRef<HTMLDialogElement>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);

  const loadProfiles = useCallback(async () => {
    try {
      const state = await api.listProfiles();
      setProfiles(state.profiles);
      setActiveProfile(state.activeProfile);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void loadProfiles();
  }, [loadProfiles]);

  const handleSave = async () => {
    const name = newProfileName.trim();
    if (!name) return;
    setBusy("save");
    try {
      const state = await api.saveProfile(name, config);
      setProfiles(state.profiles);
      setActiveProfile(state.activeProfile);
      onShowSaveChange(false);
      setNewProfileName("");
    } catch {
      /* ignore */
    } finally {
      setBusy(null);
    }
  };

  const handleLoad = async (name: string) => {
    setBusy("load");
    try {
      const [loaded, state] = await api.loadProfile(name);
      syncConfig(loaded);
      setProfiles(state.profiles);
      setActiveProfile(state.activeProfile);
      dialogRef.current?.close();
    } catch {
      /* ignore */
    } finally {
      setBusy(null);
    }
  };

  const startRename = (name: string) => {
    setRenameError(null);
    setEditingName(name);
    setEditValue(name);
  };

  const cancelRename = () => {
    setEditingName(null);
    setEditValue("");
    setRenameError(null);
  };

  const handleRename = async (from: string) => {
    const to = editValue.trim();
    if (!to || to === from) {
      cancelRename();
      return;
    }
    setBusy("rename");
    setRenameError(null);
    try {
      const state = await api.renameProfile(from, to);
      setProfiles(state.profiles);
      setActiveProfile(state.activeProfile);
      cancelRename();
    } catch (err: unknown) {
      const text = err instanceof Error ? err.message : String(err);
      setRenameError(
        /already exists/i.test(text) ? t("profileExists").replace("{name}", to) : text,
      );
    } finally {
      setBusy(null);
    }
  };

  const handleDelete = async (name: string) => {
    setBusy("delete");
    try {
      const state = await api.deleteProfile(name);
      setProfiles(state.profiles);
      setActiveProfile(state.activeProfile);
      deleteRef.current?.close();
      setPendingDelete(null);
    } catch {
      /* ignore */
    } finally {
      setBusy(null);
    }
  };

  const profileNames = Object.keys(profiles);

  return (
    <>
      <button
        type="button"
        className={cx(btnGhost, "px-2.5")}
        aria-label={t("profiles")}
        aria-haspopup="dialog"
        onClick={(e) => {
          void loadProfiles();
          dialogRef.current?.showModal();
          e.currentTarget.blur();
        }}
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
          <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      </button>

      <dialog
        ref={dialogRef}
        tabIndex={-1}
        className="lang-dialog w-[min(400px,calc(100vw-48px))] max-h-[80vh] rounded-2xl border border-line bg-rail p-0 text-ink shadow-panel outline-none"
        aria-labelledby="profiles-dialog-title"
        onClick={(e) => {
          if (e.target === e.currentTarget) e.currentTarget.close();
        }}
      >
        <form
          method="dialog"
          className="grid gap-3 px-4 pt-[18px] pb-4"
          onSubmit={(e) => e.preventDefault()}
        >
          <h3 id="profiles-dialog-title" className={headingSm}>
            {t("profiles")}
          </h3>

          {profileNames.length === 0 ? (
            <p className="text-sm text-muted">{t("profileNoProfiles")}</p>
          ) : (
            <div className="grid max-h-[50vh] gap-2 overflow-y-auto">
              {profileNames.map((name) => (
                <div
                  key={name}
                  className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2"
                >
                  {editingName === name ? (
                    <input
                      className={cx(control, "min-h-8 min-w-0 flex-1")}
                      type="text"
                      value={editValue}
                      aria-label={t("profileRename")}
                      disabled={busy !== null}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void handleRename(name);
                        }
                        if (e.key === "Escape") {
                          e.preventDefault();
                          cancelRename();
                        }
                      }}
                      onBlur={() => {
                        // Only confirm on Enter; blur cancels to avoid accidental renaming.
                        cancelRename();
                      }}
                      autoFocus
                    />
                  ) : (
                    <span
                      className={cx(
                        "min-w-0 flex-1 truncate text-sm",
                        name === activeProfile ? "font-semibold text-copper-2" : "text-ink",
                      )}
                    >
                      {name}
                    </span>
                  )}
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      className={cx(iconBtn, "hover:border-line hover:text-ink focus-visible:outline-none")}
                      aria-label={t("profileRename")}
                      disabled={busy !== null}
                      onClick={() => startRename(name)}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="h-4 w-4"
                        aria-hidden="true"
                      >
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      className={cx(iconBtn, "hover:border-line hover:text-ink focus-visible:outline-none")}
                      aria-label={t("profileLoad")}
                      disabled={busy !== null}
                      onClick={() => void handleLoad(name)}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="h-4 w-4"
                        aria-hidden="true"
                      >
                        <path d="M2 9V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-1" />
                        <path d="M2 13h10" />
                        <path d="m9 16 3-3-3-3" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      className={cx(iconBtn, "focus-visible:outline-none")}
                      aria-label={t("profileDelete")}
                      disabled={busy !== null}
                      onClick={() => {
                        setPendingDelete(name);
                        deleteRef.current?.showModal();
                      }}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="h-4 w-4"
                      >
                        <path d="M3 6h18" />
                        <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                        <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {renameError ? <p className="text-sm text-bad">{renameError}</p> : null}
        </form>
      </dialog>

      <dialog
        ref={deleteRef}
        className="lang-dialog w-[min(360px,calc(100vw-48px))] rounded-2xl border border-line bg-rail p-0 text-ink shadow-panel"
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            deleteRef.current?.close();
            setPendingDelete(null);
          }
        }}
      >
        <form method="dialog" className="grid gap-3 px-4 pt-[18px] pb-4">
          <h3 className={headingSm}>{t("profileDelete")}</h3>
          <p className="text-sm text-muted">
            {pendingDelete ? t("profileConfirmDelete").replace("{name}", pendingDelete) : ""}
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className={btnGhost}
              onClick={() => {
                deleteRef.current?.close();
                setPendingDelete(null);
              }}
            >
              {t("cancel")}
            </button>
            <button
              type="button"
              className={cx(btnGhost, "text-bad")}
              disabled={busy !== null}
              onClick={() => pendingDelete && void handleDelete(pendingDelete)}
            >
              {busy === "delete" ? t("deleting") : t("profileDelete")}
            </button>
          </div>
        </form>
      </dialog>

      {showSave ? (
        <dialog
          open
          className="lang-dialog w-[min(360px,calc(100vw-48px))] rounded-2xl border border-line bg-rail p-0 text-ink shadow-panel"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              onShowSaveChange(false);
              setNewProfileName("");
            }
          }}
        >
          <form method="dialog" className="grid gap-3 px-4 pt-[18px] pb-4">
            <h3 className={headingSm}>{t("profileSave")}</h3>
            <label className={field}>
              <span className="tracking-[0.02em]">{t("profileName")}</span>
              <input
                className={control}
                type="text"
                value={newProfileName}
                placeholder={t("profileNamePlaceholder")}
                onChange={(e) => setNewProfileName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void handleSave();
                  }
                }}
                autoFocus
              />
            </label>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className={btnGhost}
                onClick={() => {
                  onShowSaveChange(false);
                  setNewProfileName("");
                }}
              >
                {t("cancel")}
              </button>
              <button
                type="button"
                className={cx(btnGhost, "text-copper")}
                disabled={!newProfileName.trim() || busy !== null}
                onClick={() => void handleSave()}
              >
                {busy === "save" ? t("saving") : t("save")}
              </button>
            </div>
          </form>
        </dialog>
      ) : null}
    </>
  );
}