<p align="center"><a href="https://llmule.xyz"><img src="assets/llmule-wordmark.png" alt="LLMule" width="460"></a></p>

# LLMule provider

**Share your GPU on [LLMule](https://llmule.xyz), the underground P2P network of LLMs.** People with a GPU share the
models running on their own machines; people without one use them for free through an OpenAI-compatible API.

This is the script that does the sharing: one file, Node 18+, no dependencies. Read it before you run it.

```bash
curl -fsSLo mule-provider.mjs https://raw.githubusercontent.com/andycufari/llmule/main/mule-provider.mjs
node mule-provider.mjs setup   # finds your local server, you pick the models
node mule-provider.mjs         # share (Ctrl+C to stop)
```

Works with Ollama, LM Studio, llama.cpp, vLLM, Jan, KoboldCpp — anything OpenAI-compatible. You need a free key
from [llmule.xyz/dashboard](https://llmule.xyz/dashboard); setup asks for it and saves `~/.llmule/provider.json`
(mode 600). Run setup again to change models.

## What it can and can't do

- **Outbound only.** It long-polls llmule.xyz for work. It opens no port; your model server stays on localhost.
- **One thing per job:** one `POST /chat/completions` to your local server, for a model **you** listed.
  Any other model name is refused — it never forwards "whatever else Ollama has".
- **The request is rebuilt from scratch** with plain OpenAI fields (`messages, temperature, top_p, max_tokens,
  stop, seed, presence_penalty, frequency_penalty, response_format, tools, tool_choice`). Server-specific knobs —
  vLLM's `chat_template`, Ollama's `options`/`keep_alive` — never reach your server. Not even llmule.xyz is trusted.
- `max_tokens` is capped (`MAX_TOKENS`, default 4096); requests over 1 MB are refused.
- It runs no tools and writes no files besides its own config.
- Errors from your server stay in your terminal; the network only hears `upstream error <status>`.
- If your server is down — or serving different weights than announced — it goes offline instead of failing
  people's requests.
- The prompts it receives come without the user's name, email, key or IP.

All of that is tested against a fake network and a fake upstream:

```bash
node mule-provider.test.mjs
```

## Config

`setup` covers the usual case. Env vars override the saved config:

| Var | What |
|-----|------|
| `LLMULE_KEY` | your key |
| `LLMULE_API` | default `https://llmule.xyz` (point it at your own server) |
| `UPSTREAM` | local OpenAI-compatible base URL, default `http://localhost:11434/v1` (Ollama) |
| `UPSTREAM_KEY` | bearer for the upstream, if it needs one |
| `MODELS` | what to share, `public=local,...` — default: everything the upstream lists |
| `NAME` | how this machine shows up |
| `MAX_TOKENS` | cap per request, default 4096 |
| `EXTRA_BODY` | JSON merged into every upstream request, e.g. `{"chat_template_kwargs":{"enable_thinking":false}}` |
| `ROOT_MATCH` | text the upstream model's `root` (weights path) must contain — keeps you honest if weights swap |
| `FOLLOW` | share one local id under the name of whatever weights it has loaded; follows swaps without a restart |

Running it as a service: it's a long-running process with `Restart=always`-friendly behavior (exits on bad config,
retries with backoff on network errors). A systemd user unit is a few lines: `ExecStart=/usr/bin/node
/path/to/mule-provider.mjs` plus `EnvironmentFile=` if you prefer env vars to the setup file.

## The rest of LLMule

- Server + website: [andycufari/llmule-server](https://github.com/andycufari/llmule-server) — run your own network.
- Docs: [llmule.xyz/docs](https://llmule.xyz/docs) · [Discord](https://discord.gg/uM8fFz56YB)

Experimental, run by hobbyists. Made by [@andycufari](https://andy.cm64.io). MIT licensed.
