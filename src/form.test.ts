import { describe, expect, it } from "vitest";
import { fromPairs, parseHeaders, probeRoute, toPairs } from "./form";

describe("toPairs", () => {
  it("sorts the wildcard row first and other keys alphabetically", () => {
    expect(toPairs({ "gpt-*": "x", "*": "fallback", "claude-*": "y" })).toEqual([
      { k: "*", v: "fallback" },
      { k: "claude-*", v: "y" },
      { k: "gpt-*", v: "x" },
    ]);
  });

  it("returns a single empty wildcard row for an empty mapping", () => {
    expect(toPairs({})).toEqual([{ k: "*", v: "" }]);
  });
});

describe("fromPairs", () => {
  it("trims keys and drops rows with empty keys", () => {
    expect(fromPairs([{ k: " * ", v: "a" }, { k: "  ", v: "b" }])).toEqual({ "*": "a" });
  });
});

describe("parseHeaders", () => {
  it("parses an object and stringifies values", () => {
    expect(parseHeaders('{"X-Key": "v", "N": 1}', "bad")).toEqual({ "X-Key": "v", N: "1" });
  });

  it("treats empty input as no headers", () => {
    expect(parseHeaders("  ", "bad")).toEqual({});
  });

  it("rejects arrays and scalars", () => {
    expect(() => parseHeaders("[1]", "bad")).toThrow("bad");
    expect(() => parseHeaders('"s"', "bad")).toThrow("bad");
  });
});

describe("probeRoute", () => {
  it("recognizes the chat completions route", () => {
    expect(probeRoute("ok POST /chat/completions")).toBe("/chat/completions");
    expect(probeRoute("GET /models 200")).toBe("/models");
    expect(probeRoute("nothing")).toBe("");
  });
});
