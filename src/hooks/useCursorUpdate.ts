import { useCallback, useEffect, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import * as api from "../api";
import type { CursorUpdate } from "../types";

export type CursorUpdateState = {
  offer: CursorUpdate | null;
  open: () => Promise<void>;
};

/// `versionKey` is undefined until status has loaded. A change (Cursor was
/// replaced) checks the feed again. Polls that keep the same version do not.
export function useCursorUpdate(versionKey: string | undefined): CursorUpdateState {
  const [offer, setOffer] = useState<CursorUpdate | null>(null);

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

  const open = useCallback(async () => {
    const url = offer?.url;
    if (!url) return;
    await api.openExternal(url);
  }, [offer]);

  return { offer, open };
}
