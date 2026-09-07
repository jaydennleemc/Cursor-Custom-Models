import type { Locale } from "./i18n";

export type Pair = { k: string; v: string };

export function toPairs(record: Record<string, string>): Pair[] {
  const keys = Object.keys(record).sort((a, b) => {
    if (a === "*") return -1;
    if (b === "*") return 1;
    return a.localeCompare(b);
  });
  return keys.length ? keys.map((k) => ({ k, v: record[k] ?? "" })) : [{ k: "*", v: "" }];
}

export function fromPairs(pairs: Pair[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const row of pairs) {
    const key = row.k.trim();
    if (!key) continue;
    out[key] = row.v;
  }
  return out;
}

export function clock(locale: Locale) {
  return new Date().toLocaleTimeString(locale, {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function probeRoute(message: string) {
  if (message.includes("/chat/completions")) return "/chat/completions";
  if (message.includes("/models")) return "/models";
  return "";
}

export function parseHeaders(text: string, invalidMsg: string): Record<string, string> {
  const trimmed = text.trim();
  if (!trimmed) return {};
  const value = JSON.parse(trimmed) as unknown;
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(invalidMsg);
  }
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = String(v);
  }
  return out;
}
