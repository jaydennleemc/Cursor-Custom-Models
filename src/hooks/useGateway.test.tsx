// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppConfig, AppStatus } from "../types";
import { useGateway } from "./useGateway";

vi.mock("../api", () => ({
  getStatus: vi.fn(),
  getConfig: vi.fn(),
  saveConfig: vi.fn(),
  startPatch: vi.fn(),
  stopRestore: vi.fn(),
  openCursor: vi.fn(),
  quitCursor: vi.fn(),
  testConnection: vi.fn(),
}));

import * as api from "../api";

const config: AppConfig = {
  enabled: true,
  baseUrl: "https://api.deepseek.com/v1",
  apiKey: "sk-test",
  defaultModel: "deepseek-chat",
  modelMapping: { "*": "deepseek-chat" },
  interceptMethods: [],
  extraHeaders: {},
  blockUsageGate: true,
  agentTools: true,
  agentToolTimeoutMs: 120000,
  agentContext: {
    env: true,
    rules: true,
    repo: true,
    layout: true,
    layoutMaxDepth: 4,
    layoutMaxLines: 160,
    mcp: true,
    mcpToolSchemas: true,
  },
};

function statusWith(patched: number): AppStatus {
  return {
    cursorFound: true,
    cursorRoot: "/x",
    cursorRunning: false,
    cursorVersion: "3.21.18",
    patchedVersion: "3.21.18",
    targets: [0, 1, 2].map((i) => ({
      name: `f${i}.js`,
      path: `/x/f${i}.js`,
      exists: true,
      patched: i < patched,
      backup: patched > 0,
    })),
    productJson: "/x/product.json",
    configPath: "/cfg",
    proxyRunning: false,
    proxyPort: null,
    proxyUpstream: null,
  };
}

beforeEach(() => {
  vi.mocked(api.getStatus).mockResolvedValue(statusWith(0));
  vi.mocked(api.getConfig).mockResolvedValue(config);
  vi.mocked(api.saveConfig).mockResolvedValue("/cfg");
  vi.mocked(api.startPatch).mockResolvedValue({ ok: true, log: ["patched"] });
  vi.mocked(api.stopRestore).mockResolvedValue({ ok: true, log: ["restored"] });
});

describe("useGateway", () => {
  it("loads status and config on mount", async () => {
    const { result } = renderHook(() => useGateway());
    await waitFor(() => expect(result.current.config).not.toBeNull());
    expect(result.current.status?.cursorFound).toBe(true);
    expect(result.current.patchedCount).toBe(0);
    expect(result.current.mapping).toEqual([{ k: "*", v: "deepseek-chat" }]);
  });

  it("Start calls startPatch with the assembled config and reports success", async () => {
    const { result } = renderHook(() => useGateway());
    await waitFor(() => expect(result.current.config).not.toBeNull());
    await act(async () => {
      await result.current.onTogglePatch();
    });
    expect(api.startPatch).toHaveBeenCalledWith(
      expect.objectContaining({ modelMapping: { "*": "deepseek-chat" } }),
    );
    expect(result.current.banner?.kind).toBe("ok");
  });

  it("Stop calls stopRestore with the force flag when patched", async () => {
    vi.mocked(api.getStatus).mockResolvedValue(statusWith(3));
    const { result } = renderHook(() => useGateway());
    await waitFor(() => expect(result.current.patchedCount).toBe(3));
    act(() => result.current.setForce(true));
    await act(async () => {
      await result.current.onTogglePatch();
    });
    expect(api.stopRestore).toHaveBeenCalledWith(true);
    expect(api.startPatch).not.toHaveBeenCalled();
  });

  it("a failed Start surfaces a bad banner and stays unpatched", async () => {
    vi.mocked(api.startPatch).mockResolvedValue({
      ok: false,
      log: ["Cursor install mixes files from different versions"],
    });
    const { result } = renderHook(() => useGateway());
    await waitFor(() => expect(result.current.config).not.toBeNull());
    await act(async () => {
      await result.current.onTogglePatch();
    });
    expect(result.current.banner?.kind).toBe("bad");
    expect(result.current.busy).toBeNull();
  });

  it("isDirty is false right after load and true after an edit", async () => {
    const { result } = renderHook(() => useGateway());
    await waitFor(() => expect(result.current.config).not.toBeNull());
    expect(result.current.isDirty).toBe(false);
    act(() => result.current.setMapping([{ k: "*", v: "other-model" }]));
    await waitFor(() => expect(result.current.isDirty).toBe(true));
  });
});
