# Cursor Gateway

Windows and macOS desktop app that points Cursor’s native **Chat**, **Cmd+K**, and **Agent** at DeepSeek, GLM, Kimi, OpenRouter, or any OpenAI-compatible API.

Cursor Gateway does not replace Cursor. It patches three of Cursor’s process files so those surfaces call *your* model instead of Cursor’s cloud. The intercept lives in injected JavaScript; this app is the manager: configure the upstream, apply or restore the patch, and keep a small local CORS proxy running when the provider needs it.

## Design

Cursor talks to its backend over ConnectRPC. Gateway does not emulate that protocol on a server. On **Start** it:

1. Backs up the target files.
2. Wraps Cursor’s Connect transport so Chat / Cmd+K / Agent streams are intercepted.
3. Appends `runtime/cm-runtime.js` with your config baked in.
4. Updates `product.json` checksums so Cursor still accepts the files.

The runtime translates Cursor’s protobuf chat/agent messages into OpenAI-style `POST /chat/completions` (streaming). Tool calls from Agent and Chat are mapped onto Cursor’s local tools (`read_file`, `grep_search`, `list_dir`, `write_file`, `run_terminal_cmd`, and MCP tools Cursor already collected). System text is **passthrough**: environment, `.cursorrules`, repo layout, and MCP notes Cursor gathered, plus an optional extra agent prompt. Gateway does not invent a second persona.

**Stop** copies the backups back. If Cursor has overwritten a patched file (for example after an update), restore refuses unless you enable **Force restore**.

### Why a local proxy

Cursor’s renderer is Chromium. Some hosts fail CORS preflight from that page (`open.bigmodel.cn`, Anthropic, Google, MiniMax, and loopback `http://`). On Start, Gateway can rewrite the injected base URL to `http://127.0.0.1:8117` and forward to the real origin. **Leave Gateway running** while you use Cursor against those endpoints, or the renderer cannot reach the model.

Direct HTTPS providers such as OpenAI, DeepSeek, OpenRouter, Qwen, and Kimi do not need the proxy.

## Architecture

```
┌─────────────────────┐     Start / Stop / Open / Quit
│  Cursor Gateway     │
│  (Tauri + React)    │
│                     │
│  config, test,      │         ┌──────────────────────┐
│  patch, restore,    │────────▶│  Cursor.app          │
│  CORS proxy :8117   │ inject  │  workbench*.js       │
└─────────┬───────────┘         │  extensionHostProcess│
          │                     └──────────┬───────────┘
          │  optional proxy                │ intercepted
          ▼                                │ ConnectRPC
   provider /chat/completions  ◀───────────┘
   (OpenAI-compatible)
```

| Piece | Role |
| --- | --- |
| **Desktop app** (`src/`, `src-tauri/`) | UI, config, connection test, file patch/restore, process control, local proxy |
| **Runtime** (`runtime/cm-runtime.js`) | Same script in three Cursor processes; wraps the transport and talks to the API |
| **Targets** | `workbench.desktop.main.js`, `workbench.glass.main.js` (renderer), `extensionHostProcess.js` (where HTTP actually terminates) |

Config lives on disk, not in Cursor’s settings:

- macOS: `~/Library/Application Support/cursor-custom-model/`
- Windows: `%APPDATA%\cursor-custom-model\`

## Use

1. Install Cursor Gateway (`.dmg` on macOS, NSIS/MSI on Windows). On macOS, if Gatekeeper blocks the first launch: right-click the app → **Open**. If it says the app is damaged:

   ```bash
   xattr -cr "/Applications/Cursor Gateway.app"
   open "/Applications/Cursor Gateway.app"
   ```

2. Choose a provider. OpenAI, DeepSeek, GLM, Kimi, Qwen, and the other presets only need an API key. **Custom** needs base URL, model id, and key.

3. Click **Test connection**. The app calls `/chat/completions` itself (no Cursor CORS).

4. Quit Cursor completely (use **Quit Cursor**, including the tray icon).

5. Click **Start**. Reopen Cursor (**Open Cursor**) and send a message in Chat or Agent.

6. **Stop** restores the original files. Keep Gateway running if you are on a proxied endpoint.

### Sidebar

| Control | What it does |
| --- | --- |
| **Start / Stop** | Apply or restore the Cursor patch |
| **Open Cursor** | Launch the installed Cursor app |
| **Quit Cursor** | Ask Cursor to quit, then force-kill if the tray hangs |
| **Force restore** | Overwrite files after a Cursor update when backups look older than the current install |

Advanced settings cover model mapping (`*` is the fallback), which RPC channels to intercept, Agent tools and context (env, rules, repo, tree, MCP), sampling, and extra HTTP headers.

## Build from source

Requires Node.js 18+, stable Rust, and [Tauri 2 system libraries](https://v2.tauri.app/start/prerequisites/).

```bash
npm install
npm run tauri dev      # development
npm run tauri build    # installers
```
