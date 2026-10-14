import { useCallback, useEffect, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import * as api from "../api";
import type { CursorUpdate } from "../types";

export type CursorDownload =
  | { kind: "idle" }
  | { kind: "downloading"; percent: number | null }
  | { kind: "saved"; name: string }
  | { kind: "error"; message: string };

export type CursorUpdateState = {
  offer: CursorUpdate | null;
  download: CursorDownload;
  startDownload: () => Promise<void>;
};

function fileName(path: string): string {
  const parts = path.split(/[/\\]/);
  return parts[parts.length - 1] || path;
}

/// `versionKey` is undefined until status has loaded. A change (Cursor was
/// replaced) checks the feed again. Polls that keep the same version do not.
export function useCursorUpdate(versionKey: string | undefined): CursorUpdateState {
  const [offer, setOffer] = useState<CursorUpdate | null>(null);
  const [download, setDownload] = useState<CursorDownload>({ kind: "idle" });
  const busy = useRef(false);

  useEffect(() => {
    if (!isTauri() || versionKey === undefined) return;
    let cancelled = false;
    api
      .checkCursorUpdate()
      .then((next) => {
        if (!cancelled) setOffer(next);
      })
      .catch(() => {
        if (!cancelled) setOffer(null);
      });
    return () => {
      cancelled = true;
    };
  }, [versionKey]);

  const startDownload = useCallback(async () => {
    const url = offer?.url;
    if (!url || busy.current) return;
    busy.current = true;
    setDownload({ kind: "downloading", percent: null });
    let unlisten = () => {};
    let active = true;
    try {
      unlisten = await listen<{ received: number; total: number | null }>(
        "cursor-download-progress",
        (event) => {
          if (!active) return;
          const { received, total } = event.payload;
          const percent =
            total && total > 0 ? Math.min(99, Math.round((received / total) * 100)) : null;
          setDownload({ kind: "downloading", percent });
        },
      );
      const path = await api.downloadCursorUpdate(url);
      active = false;
      setDownload({ kind: "saved", name: fileName(path) });
    } catch (error) {
      active = false;
      const message = error instanceof Error ? error.message : String(error);
      setDownload({ kind: "error", message });
    } finally {
      active = false;
      unlisten();
      busy.current = false;
    }
  }, [offer]);

  return { offer, download, startDownload };
}
