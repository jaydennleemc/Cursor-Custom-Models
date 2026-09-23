import { useCallback, useEffect, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export type UpdatePhase =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "none" }
  | { kind: "available"; version: string }
  | { kind: "downloading"; version: string; percent: number | null }
  | { kind: "installing"; version: string }
  | { kind: "error"; version: string; message: string };

export type AppUpdate = {
  phase: UpdatePhase;
  install: () => Promise<void>;
};

export function useAppUpdate(): AppUpdate {
  const [phase, setPhase] = useState<UpdatePhase>({ kind: "idle" });
  const updateRef = useRef<Update | null>(null);
  const busyRef = useRef(false);

  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;
    setPhase({ kind: "checking" });
    check({ timeout: 15000 })
      .then((update) => {
        if (cancelled) return;
        if (!update) {
          setPhase({ kind: "none" });
          return;
        }
        updateRef.current = update;
        setPhase({ kind: "available", version: update.version });
      })
      .catch(() => {
        if (!cancelled) setPhase({ kind: "none" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const install = useCallback(async () => {
    const update = updateRef.current;
    if (!update || busyRef.current) return;
    busyRef.current = true;
    const version = update.version;
    try {
      let total = 0;
      let got = 0;
      setPhase({ kind: "downloading", version, percent: null });
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") {
          total = event.data.contentLength ?? 0;
          got = 0;
        } else if (event.event === "Progress") {
          got += event.data.chunkLength;
          const percent = total > 0 ? Math.min(100, Math.round((got / total) * 100)) : null;
          setPhase({ kind: "downloading", version, percent });
        } else if (event.event === "Finished") {
          setPhase({ kind: "installing", version });
        }
      });
      setPhase({ kind: "installing", version });
      await relaunch();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setPhase({ kind: "error", version, message });
    } finally {
      busyRef.current = false;
    }
  }, []);

  return { phase, install };
}
