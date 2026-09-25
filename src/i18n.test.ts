import { describe, expect, it } from "vitest";
import { createT, LOCALE_TABLES, LOCALES } from "./i18n";

// The three locale tables are separate literals; adding a key to one without
// the others silently falls back to English at runtime.
describe("locale tables", () => {
  it("every locale defines exactly the same keys", () => {
    const reference = [...LOCALE_TABLES.en].sort();
    for (const { id } of LOCALES) {
      expect([...LOCALE_TABLES[id]].sort(), `locale ${id} key mismatch`).toEqual(reference);
    }
  });
});

describe("createT", () => {
  it("substitutes variables", () => {
    const t = createT("en");
    expect(t("statusPatched", { n: 3, total: 3 })).toBe("3/3 files patched");
  });

  it("falls back to the key itself when missing everywhere", () => {
    const t = createT("zh-TW");
    expect(t("definitely-not-a-real-key")).toBe("definitely-not-a-real-key");
  });
});
