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

## Branches

- **`dev`** — default branch for day-to-day work.
- **`main`** — release snapshots only. Merge `dev` into `main` when you ship.

```bash
git checkout dev
git switch -c your-change
# open a PR into dev

# ship
git checkout main
git merge --ff-only dev
git push origin main
git tag v1.0.0
git push origin v1.0.0
```

## GitHub Actions

- **CI** runs TypeScript check, runtime tests, and Rust tests on pushes and pull requests to `dev` and `main`.
- **Release** builds Windows and macOS (Apple Silicon + Intel) installers. It runs on `v*` tags or from **Actions → Release → Run workflow**. Builds land on a **draft** GitHub Release named `Cursor Gateway v<version>`.

macOS artifacts from CI are unsigned unless you add Apple signing secrets later. Windows NSIS/MSI builds do not need extra secrets.

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
