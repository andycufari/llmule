<p align="center"><a href="https://llmule.xyz"><img src="assets/llmule-wordmark.png" alt="LLMule" width="460"></a></p>

# LLMule

**Share your GPU on [LLMule](https://llmule.xyz), the underground P2P network of LLMs.** People with a GPU share the
models running on their own machines; people without one use them for free through an OpenAI-compatible API.

```bash
curl -fsSL https://llmule.xyz/install | sh          # macOS / Linux
```
```powershell
irm https://llmule.xyz/install.ps1 | iex            # Windows (PowerShell)
```

That installs **LLMule**, one program with a step-by-step setup in your terminal. It looks at your machine, links
your llmule.xyz account with a code (like `gh auth login`), finds Ollama, LM Studio, llama.cpp or vLLM if you already
run one, or installs llama.cpp and a model that fits your VRAM. It asks the model a test question and starts sharing.
Everything goes in `~/.llmule`; `~/.llmule/bin/llmule --uninstall` and deleting that folder removes it.

**Experimental.** Mostly tested on Apple Silicon Macs. The Intel Mac, Linux (x64/arm64, glibc 2.27+, not Alpine) and Windows
x64 builds are new. If something breaks, tell me on [Discord](https://discord.gg/uM8fFz56YB) or open an issue.

This repo has two things:

| | What | Needs |
|---|---|---|
| [`installer/`](installer) | The LLMule app (the one-liner above installs its binary) | nothing: single binary per OS |
| [`mule-provider.mjs`](mule-provider.mjs) | The script that does the sharing. The app runs it inside | Node 18+, no dependencies |

## The install script

[`installer/install/install.sh`](installer/install/install.sh) and [`install.ps1`](installer/install/install.ps1) are
what `llmule.xyz/install` and `llmule.xyz/install.ps1` serve. Read them before you pipe them into a shell. They:

- pick the binary for your OS and CPU (an Apple Silicon Mac under Rosetta still gets the native one);
- download it and check its sha256 against the list **inside the script**, so a swapped binary on the download server
  doesn't pass; nothing is installed if it doesn't match;
- put it in `~/.llmule/bin/llmule` (no sudo, no admin, nothing outside `~/.llmule`) and open it.

`LLMULE_NO_RUN=1` installs without opening it. Arguments after `sh -s --` go to the app
(`curl -fsSL https://llmule.xyz/install | sh -s -- --lang en`).

The binaries are also attached to each [release](https://github.com/andycufari/llmule/releases) with a `SHA256SUMS`.

## The app (`installer/`)

Zero dependencies, ANSI by hand, built into one binary per OS with `deno compile`:

```bash
cd installer
node llmule.mjs --demo          # the whole flow with every outside effect faked
node llmule.mjs                 # the real thing, from source (Node 18+)
node --test llmule.test.mjs     # tests
tools/build.sh                  # the 5 binaries into dist/ (needs deno)
node tools/gen-install.mjs      # regenerate install.sh / install.ps1 with the sha256 of the new binaries
```

`tools/fake-site.mjs` runs a local llmule.xyz with the real server functions (set `LLMULE_SITE_DIR` to a checkout of
[llmule-server](https://github.com/andycufari/llmule-server)); `LLMULE_API=http://127.0.0.1:8787` points the app at it.

## The provider (`mule-provider.mjs`)

If you'd rather not run a binary and you already have a local OpenAI-compatible server, this one readable file shares it:

```bash
curl -fsSLo mule-provider.mjs https://raw.githubusercontent.com/andycufari/llmule/main/mule-provider.mjs
node mule-provider.mjs setup   # finds your local server, you pick the models
node mule-provider.mjs         # share (Ctrl+C to stop)
```

Works with Ollama, LM Studio, llama.cpp, vLLM, Jan, KoboldCpp: anything OpenAI-compatible. You need a free key
from [llmule.xyz/dashboard](https://llmule.xyz/dashboard); setup asks for it and saves `~/.llmule/provider.json`
(mode 600). Run setup again to change models.

### What it can and can't do

- **Outbound only.** It long-polls llmule.xyz for work. It opens no port; your model server stays on localhost.
- **One thing per job:** one `POST /chat/completions` to your local server, for a model **you** listed.
  Any other model name is refused: it never forwards "whatever else Ollama has".
- **The request is rebuilt from scratch** with plain OpenAI fields (`messages, temperature, top_p, max_tokens,
  stop, seed, presence_penalty, frequency_penalty, response_format, tools, tool_choice`). Server-specific knobs
  (vLLM's `chat_template`, Ollama's `options`/`keep_alive`) never reach your server. Not even llmule.xyz is trusted.
- `max_tokens` is capped (`MAX_TOKENS`, default 4096); requests over 1 MB are refused.
- It runs no tools and writes no files besides its own config.
- Errors from your server stay in your terminal; the network only hears `upstream error <status>`.
- If your server is down, or serving different weights than announced, it goes offline instead of failing
  people's requests.
- The prompts it receives come without the user's name, email, key or IP.

All of that is tested against a fake network and a fake upstream:

```bash
node mule-provider.test.mjs
```

### Config

`setup` covers the usual case. Env vars override the saved config:

| Var | What |
|-----|------|
| `LLMULE_KEY` | your key |
| `LLMULE_API` | default `https://llmule.xyz` (point it at your own server) |
| `UPSTREAM` | local OpenAI-compatible base URL, default `http://localhost:11434/v1` (Ollama) |
| `UPSTREAM_KEY` | bearer for the upstream, if it needs one |
| `MODELS` | what to share, `public=local,...`; default: everything the upstream lists |
| `NAME` | how this machine shows up |
| `MAX_TOKENS` | cap per request, default 4096 |
| `EXTRA_BODY` | JSON merged into every upstream request, e.g. `{"chat_template_kwargs":{"enable_thinking":false}}` |
| `ROOT_MATCH` | text the upstream model's `root` (weights path) must contain: keeps you honest if weights swap |
| `FOLLOW` | share one local id under the name of whatever weights it has loaded; follows swaps without a restart |

Running it as a service: it's a long-running process with `Restart=always`-friendly behavior (exits on bad config,
retries with backoff on network errors). A systemd user unit is a few lines: `ExecStart=/usr/bin/node
/path/to/mule-provider.mjs` plus `EnvironmentFile=` if you prefer env vars to the setup file.

(`provider/` holds two symlinks to the root files: the app imports `../provider/mule-provider.mjs`.)

## The rest of LLMule

- Server + website: [andycufari/llmule-server](https://github.com/andycufari/llmule-server). Run your own network.
- Docs: [llmule.xyz/docs](https://llmule.xyz/docs) · [Discord](https://discord.gg/uM8fFz56YB)

Experimental, run by hobbyists. Made by [@andycufari](https://andy.cm64.io). MIT licensed.
