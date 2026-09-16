# opencode-provider-proxy

Per-provider HTTP(S) proxy routing for [opencode](https://opencode.ai).

Route **selected providers** (or **selected models**) through a proxy while everything
else connects directly. Works in the opencode TUI, the CLI, and the desktop app.

- Foreign models (Anthropic, OpenAI, Google, OpenRouter, xAI, Grok, ...) go through your proxy.
- Domestic models (DeepSeek, GLM, Kimi, Qwen, MiniMax, MiMo, LongCat, ...) connect directly.
- The opencode **Go / Zen** catalog lives on a single host (`opencode.ai`), so routing
  there is decided per **model id** instead of per host.
- No system-wide environment variables, no OS proxy settings. Only opencode is affected.

## Install

### Option A - Download from GitHub (no npm account needed)

The plugin ships as a **single self-contained file**, so installing it is just
"download one file + add one line".

#### 1. Download the plugin file

Direct link:

```
https://raw.githubusercontent.com/litt-s/opencode-provider-proxy/main/bundle/opencode-provider-proxy.mjs
```

Or with a command.

**Windows (PowerShell):**

```powershell
$dir = "$env:USERPROFILE\.config\opencode\plugin"
New-Item -ItemType Directory -Path $dir -Force | Out-Null
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/litt-s/opencode-provider-proxy/main/bundle/opencode-provider-proxy.mjs" -OutFile "$dir\opencode-provider-proxy.mjs"
```

**macOS / Linux:**

```bash
mkdir -p ~/.config/opencode/plugin
curl -fsSL "https://raw.githubusercontent.com/litt-s/opencode-provider-proxy/main/bundle/opencode-provider-proxy.mjs" \
  -o ~/.config/opencode/plugin/opencode-provider-proxy.mjs
```

**Manual:** open the link above in a browser, then *Save as* to the plugin folder
(`C:\Users\<you>\.config\opencode\plugin\` on Windows, `~/.config/opencode/plugin/` elsewhere).
You can also download the repo as a zip and copy `bundle/opencode-provider-proxy.mjs`
out of it.

#### 2. Register the plugin

Add this to your global `opencode.json` / `opencode.jsonc`
(`C:\Users\<you>\.config\opencode\opencode.jsonc` on Windows):

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["./plugin/opencode-provider-proxy.mjs"]
}
```

The path is relative to the config file. An absolute path also works, e.g.
`"file:///C:/Users/<you>/.config/opencode/plugin/opencode-provider-proxy.mjs"`.

#### 3. Restart opencode

Fully quit and reopen opencode. The proxy is auto-detected, so no further setup is
usually needed.

#### 4. Verify

Set `"debug": true` in the config (see below) and check the opencode server log
(`C:\Users\<you>\.local\share\opencode\log\opencode.log` on Windows) for:

```
[provider-proxy] active: 20 host rules via undici (proxy: http://127.0.0.1:7897)
```

If you see `failed to load plugin` instead, make sure the file kept its `.mjs`
extension and that the path in `plugin` is correct.

> The `.mjs` file bundles everything it needs (including `undici`), so there is **no
> `npm install` and no build step**. Keep the `.mjs` extension — it is what makes the
> file load as an ES module regardless of the surrounding `package.json`.

### Option B - npm

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-provider-proxy"]
}
```

Restart opencode. opencode installs the package and its dependencies automatically.

### Proxy

The proxy is **auto-detected**, so most people need nothing else. The plugin looks, in
order, at:

1. the `proxy` option / config file (see below),
2. `HTTPS_PROXY` / `HTTP_PROXY` / `ALL_PROXY`,
3. the Windows system proxy (Internet Settings),
4. common local proxy ports (`7890`, `7897`, `7891`, `10809`, `1080`, `8080`, ...), each
   verified to actually speak the HTTP proxy protocol.

To pin a proxy explicitly:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    ["./plugin/opencode-provider-proxy.mjs", { "proxy": "http://127.0.0.1:<PORT>" }]
  ]
}
```

Proxy with authentication: `"proxy": "http://user:pass@proxy.example.com:8080"`.

## Configuration

Options can be passed inline (as above) or placed in a config file. Inline options
always win.

### Config file

Create `~/.config/opencode/provider-proxy.json` (on Windows:
`C:\Users\<you>\.config\opencode\provider-proxy.json`):

```json
{
  "proxy": "http://127.0.0.1:<PORT>",
  "providers": ["anthropic", "openai", "google", "openrouter", "xai"],
  "hosts": [],
  "directModels": ["glm-", "kimi-", "deepseek-", "qwen", "minimax-", "mimo-", "longcat"],
  "debug": false
}
```

The file is watched and hot-reloaded — no restart needed after editing it.
`~/.config/opencode/proxy.json` is also picked up for backwards compatibility.

### Options

| Option             | Type       | Default                                | Description                                                                 |
| ------------------ | ---------- | -------------------------------------- | --------------------------------------------------------------------------- |
| `proxy`            | `string`   | auto-detected                          | Proxy URL. `http://`, `https://` and `socks5://` (Bun only) are supported.  |
| `providers`        | `string[]` | foreign providers                      | Provider ids routed through the proxy. Unknown ids are ignored with a warning. |
| `hosts`            | `string[]` | `[]`                                   | Extra hostname fragments routed through the proxy.                          |
| `directModels`     | `string[]` | domestic model prefixes                | Model id fragments that always connect directly.                            |
| `directModelHosts` | `string[]` | `["opencode.ai"]`                      | Hosts the `directModels` rules apply to.                                    |
| `autoDetect`       | `boolean`  | `true`                                 | Auto-detect a proxy when `proxy` is unset.                                  |
| `probePorts`       | `number[]` | `[7890, 7897, 7891, 10809, ...]`       | Ports probed by auto-detection.                                             |
| `configFile`       | `string`   | –                                      | Explicit path to a JSON config file.                                        |
| `debug`            | `boolean`  | `false`                                | Log routing decisions to the opencode server log.                           |

### Built-in provider ids

`opencode`, `opencode-go`, `opencode-zen`, `anthropic`, `openai`, `openai-codex`, `azure`,
`google`, `google-vertex`, `google-vertex-anthropic`, `github-copilot`, `openrouter`,
`xai`, `groq`, `mistral`, `cohere`, `together`, `perplexity`, `cerebras`, `fireworks`,
`amazon-bedrock`, `deepseek`, `moonshot`, `kimi`, `zhipu`, `alibaba`, `qwen`, `minimax`,
`siliconflow`.

Need a provider that is not listed? Add its host to `hosts`:

```json
{ "proxy": "http://127.0.0.1:<PORT>", "hosts": ["api.example.com"] }
```

## How it works

The plugin patches `globalThis.fetch` once at startup. Every request is matched by
hostname against the compiled rules:

- **Bun runtime** (opencode CLI/TUI): uses the built-in `proxy` fetch option.
- **Node runtime** (opencode desktop): uses `undici`'s `ProxyAgent` as the request
  `dispatcher`. `undici` is installed as a normal dependency.

For proxied hosts that serve both foreign and domestic models (the opencode Go/Zen
catalog on `opencode.ai`), the plugin inspects the JSON request body and bypasses the
proxy when the `model` field matches `directModels`.

`localhost` / `127.0.0.1` traffic is never proxied, so the TUI's connection to the local
opencode server keeps working.

## Troubleshooting

Set `"debug": true` and check the opencode server log
(`~/.local/share/opencode/log/opencode.log` on Windows) for lines prefixed with
`[provider-proxy]`.

You should see something like:

```
[provider-proxy] auto-detected system proxy: http://127.0.0.1:7897
[provider-proxy] active: 20 host rules via undici (proxy: http://127.0.0.1:7897)
[provider-proxy] proxy https://api.anthropic.com/v1/messages -> http://127.0.0.1:7897
[provider-proxy] direct by model deepseek-v4-pro https://opencode.ai/zen/go/v1/chat/completions
```

## Development

```bash
npm install
npm run build     # tsc -> dist/ (used by the npm package)
npm run bundle    # esbuild -> bundle/opencode-provider-proxy.mjs (single-file, committed)
npm run typecheck
```

`bundle/opencode-provider-proxy.mjs` is committed to the repo so users can grab a single
file without npm. Re-run `npm run bundle` and commit the result after changing `src/`.

## License

MIT
