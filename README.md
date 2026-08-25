# Cursor Custom Models

Windows / macOS desktop app **Cursor Gateway**. Point Cursor’s native Chat, Cmd+K, and Agent at DeepSeek, GLM, or any OpenAI-compatible API.

**Start** injects `runtime/cm-runtime.js` into Cursor. **Stop** restores the backups. Intercept logic stays in the injected JavaScript; this app is the manager.

## Develop

Requires Node.js 18+, stable Rust, and [Tauri 2 system dependencies](https://v2.tauri.app/start/prerequisites/).

```bash
npm install
npm run tauri dev
```

Package:

```bash
npm run tauri build
```

Tests:

```bash
npm run test:rust
npm run test:runtime
```

## Use

1. Pick a provider (OpenAI / DeepSeek / GLM / Kimi / Qwen only need an API key; Custom needs URL, model, and key).
2. Click **Test Connection** (the app calls `/chat/completions` directly, so Cursor page CORS does not apply).
3. Fully quit Cursor.
4. Click **Start** in the sidebar.
5. Reopen Cursor and send a message in Chat or Agent.

`http://127.0.0.1` / `localhost` endpoints (and GLM) have no browser CORS. On Start, the app launches a built-in proxy and rewrites the injected URL to `127.0.0.1:8117`. **Keep Cursor Gateway running**, or the Cursor renderer cannot reach the local model.

Config is stored at:

- macOS: `~/Library/Application Support/cursor-custom-model/`
- Windows: `%APPDATA%\cursor-custom-model\`

## Restore

When a patch is applied, the same button becomes **Stop**. If Cursor has already overwritten patched files, restore refuses to cover a newer Cursor with an old backup unless you check **Force restore**.
