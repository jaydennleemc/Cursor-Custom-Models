# AGENTS.md — Cursor Gateway

This file is for coding agents working in this repo. Product docs for humans live in `README.md`.

## What this is

**Cursor Gateway** (npm package `cursor-custom-models`) is a Tauri 2 + React desktop app. It does **not** replace Cursor and does **not** speak ConnectRPC on a server.

On **Start** it:

1. Backs up three Cursor process files.
2. Wraps Cursor’s Connect transport so Chat / Cmd+K / Agent streams are intercepted.
3. Appends `runtime/cm-runtime.js` with the user’s config baked in (`__CM_CONFIG_PLACEHOLDER__`).
4. Updates `product.json` checksums so Cursor still loads the files.

The injected runtime translates Cursor protobuf streams into OpenAI-compatible `POST /chat/completions` (SSE). Tools run **inside Cursor** (`read_file`, `write_file`, MCP, …). Gateway only maps OpenAI `tool_calls` onto Cursor’s local exec + UI protocol.

**Stop** copies the backups back. If Cursor overwrote a patched file (update), restore refuses unless **Force restore** is on.

## Layout

| Path | Role |
| --- | --- |
| `runtime/cm-runtime.js` | The whole intercept. Same script in renderer + extension host. **This is where Agent/Chat/CmdK bugs live.** |
| `runtime/test-integration.cjs` | Mock protobuf-es v2 types + mock SSE server. Primary regression suite. |
| `src/` | Gateway UI (React 19). `api.ts` → Tauri commands. `providers.ts` presets. |
| `src-tauri/src/patch.rs` | Backup, inject runtime, regex-wrap `transport()` / `registerConnectTransportProvider`, unlock free-plan model picker, checksums. |
| `src-tauri/src/restore.rs` | Copy `.cm-bak` back. |
| `src-tauri/src/proxy.rs` | Local CORS proxy `:8117` for hosts that fail Chromium preflight. |
| `src-tauri/src/config.rs` | `~/Library/Application Support/cursor-custom-model/config.json` (Windows: `%APPDATA%\cursor-custom-model\`). |
| `src-tauri/src/cursor.rs` | Discover Cursor install + the three target files. |

Patched Cursor files:

- `workbench.desktop.main.js`
- `workbench.glass.main.js`
- `extensionHostProcess.js` (this is where HTTP actually terminates)

Config is **not** stored in Cursor settings. After the first Start, the runtime pulls live `baseUrl` / `apiKey` / `defaultModel` / mapping from Gateway `GET /config` on each upstream call, so switching profile or model does not need Stop or quitting Cursor. Gateway must stay running. Intercept method list and the transport wrap still require a Start (and a Cursor restart) to change.

## Commands

```bash
npm install
npm run test:runtime          # runtime protocol tests (run this after any cm-runtime.js change)
npm run test:rust             # cargo test in src-tauri
npm run typecheck
npm run tauri dev
npm run tauri build
```

Do not claim an Agent/Chat protocol fix works unless `npm run test:runtime` is green.

App version lives in `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, and `src/App.tsx` (`APP_VERSION`). Runtime protocol version is `g.__CURSOR_CM__.version` inside `cm-runtime.js` (currently `1.6.11`). The file banner `Cursor Custom Models Runtime vX.Y.Z` **must match** that exported version — T1 asserts this. App `1.0.x` and runtime `1.6.x` are independent; keep the four app-version locations in sync with each other.

## How the Agent path works

`agent.v1.AgentService/Run` is a BiDi stream.

**Request:** `runRequest` with user text, `conversationId`, and `requestContext` (env, `.cursorrules`, repo, tree, MCP tools). On Cursor 3.16.17 `requestContext` is nested under `action.userMessageAction`; older builds put it on `runRequest`. Read both.

**Response `interactionUpdate` oneof (UI layer):**

- `heartbeat` — keep-alive. Cursor drops the stream after ~30s of silence.
- `thinkingDelta` — progress / reasoning. Safe to spam moderately.
- `textDelta` — visible assistant reply. **This is what users see stacked when the model “repeats”.**
- `toolCallStarted` / `toolCallCompleted` — UI only. **Not** what executes the tool.
- `turnEnded` — must be sent or Cursor reports Connection failed.

**Exec channel (what actually runs tools):**

1. `toolCallStarted` (UI, args only, **never a result**)
2. `execServerMessage` (`writeArgs` / `readArgs` / `mcpArgs` / …) — Cursor executes locally
3. Client sends `execClientMessage` (`writeResult` / `readResult` / …)
4. `toolCallCompleted` (UI result)

UI `EditToolCall.result` is **`EditResult` (`success.after_full_file_content`)**. Exec `writeResult` is **`WriteResult` (`message`)**. They are different protobuf messages. Stuffing the exec instance into Completed makes Cursor abort the Agent stream after a few tools.

System prompt is **passthrough**: only Cursor-collected context. Do not invent a second persona.

## Invariants (do not regress)

These were learned the hard way after 1.0.2, mostly while fixing the “Editing …” spinner.

1. **`toolCallStarted` must not carry `result`.** An empty result on Started aborts the stream.
2. **Never put an exec-channel message on `toolCallCompleted.result`.** Synthesize the UI type (`EditResult.success`, `ReadFileResult`, …) with `new ResultT(...)`. `instanceof WriteResult` on an `EditToolCall.result` is always wrong.
3. **`heartbeatWhile` must `Promise.race` the work promise.** A 200ms sleep-then-check (1.6.5) added ~200ms **per SSE token**. Long replies looked hung; the UI showed nothing useful.
4. **Preamble + `tool_calls` in the same upstream round:** hold one SSE text token, then flush as `thinkingDelta` if the next event is `tool_calls`. Pure-text rounds flush `textDelta` live (one token behind). Do not buffer the whole reply until SSE end — that makes Agent look like it is not streaming.
5. **Upstream errors** on Agent must become `textDelta` + `turnEnded`, not a thrown error (no `turnEnded` → Connection failed).
6. **Do not intercept** `StreamUnifiedChatWithToolsSSE` / Poll. Those are not the content-bearing channel.
7. Connect-es consumer reads `{ message, header, trailer }`, not v2 `output`.
8. Keep `AGENT_MAX_ROUNDS` modest (default 8). A broken tool result plus high rounds looks like infinite repeat.

## Symptom → likely cause

| User report | First place to look |
| --- | --- |
| Cursor repeats “Let me read / Let me write…” | Preamble leaked into `textDelta`, or Completed used the exec type so the stream died and Cursor retried the turn. |
| Very slow, long stretches of “nothing happening” | `heartbeatWhile` polling delay; Agent `textDelta` buffered until SSE end (fixed in 1.6.9); missing `thinkingDelta` while waiting on fetch/tools; tool timeout 30s because exec never ran. |
| Stuck “Editing …” spinner | `toolCallCompleted` missing UI `EditResult.success.after_full_file_content`. |
| Connection failed after a few tools | Result on Started, or exec `WriteResult` on Completed. |
| “You’re paused until usage resets” | Usage-gate unary bypass (`blockUsageGate`). |
| CORS / GLM / Anthropic / loopback fail | Need the `:8117` proxy; Gateway process must stay running. |

## Changing the runtime

`cm-runtime.js` is injected as a string (`include_str!` in `patch.rs`). It must stay ES5-ish IIFE, no `import`, no build step. Use `var`, `function`, and protobuf-es **field introspection** (`fields.byMember()`, `localName`) — never Cursor’s minified names.

Tests mock real Cursor shapes in `test-integration.cjs` (`makeType`, `EditResultT` vs `WriteResultT`). If you learn a new proto field from a dump, add it there first, then assert it in a T-case, then change the runtime.


After changing the runtime, users must **Stop → Quit Cursor (tray too) → Start → Open Cursor**. A live Cursor process keeps the old inject in memory.

## Desktop app notes

- Proxy is only for CORS-hostile origins (GLM, Anthropic, Google, MiniMax, `http://`). OpenAI / DeepSeek / OpenRouter / Qwen / Kimi can go direct HTTPS.
- Patch regexes in `patch.rs` (`TRANSPORT_RE`, `EXT_RE`, model-picker locks) break when Cursor minifies differently. Prefer the generic regex over the hard-coded `ANCHOR_DESKTOP` string.

## Git / release

- Default branch is `dev`. `main` is the release snapshot.
- Release PRs: branch `release/v1.0.x` → PR into `dev` → merge → tag `v1.0.x` on the merge commit → push the tag (triggers `.github/workflows/release.yml`).
- Runtime protocol (`1.6.x` in the JS header) is not the same number as the app (`1.0.x`). Mention both when you change intercept behavior.
