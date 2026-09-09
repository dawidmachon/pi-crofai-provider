# pi-crofai-provider

CrofAI provider for the [pi coding agent](https://github.com/earendil-works/pi-coding-agent) — hard fork of [`pi-crofai`](https://www.npmjs.com/package/pi-crofai).

## Which provider to use

| Provider | Protocol | When to use |
|---|---|---|
| **`crofai`** | `/v1/chat/completions` | **Default. Use this.** More mature in pi; supports `deferredToolsMode: "kimi"` for faster first-token on tool-heavy sessions with Kimi models. |
| `crofai-responses` | `/v1/responses` | Niche. Only if you specifically need the Responses API (`reasoningSummary`, `serviceTier`). Less tested in pi. |

Both share the same 16-model catalog and the same API key.

## Install

```bash
# Local checkout (one session):
pi -e /path/to/pi-crofai-provider

# Persistent:
pi install /path/to/pi-crofai-provider
# Then restart pi or type /reload
```

## Setup

```bash
export CROFAI_API_KEY="your_key_here"
```

Or: `pi` → `/login` → "Use an API key" → provider `crofai` → paste key.

## Hard-fork fixes vs upstream

1. **Vision detection** — upstream's hand-curated list had 5 phantom entries and missed `deepseek-v4-flash-vision-exp`. This fork infers vision from model-id patterns.
2. **Fetch timeout** — 5 s hard cap on `/v1/models` so a slowCroft.ai doesn't block extension load.
3. **NaN guard** — malformed pricing fields fall back to 0 with a warning instead of silent corruption.
4. **`/reload` support** — uses pi's official `refreshModels` callback; new CrofAI models appear after `/reload`, no restart needed.
5. **Responses API** — registers both `/v1/chat/completions` and `/v1/responses` providers from the same catalog.

## Models (16)

`deepseek-v4-pro-0813`, `deepseek-v4-flash-0731`, `deepseek-v4-flash-vision-exp`,
`kimi-k3`, `kimi-k3-eco`, `kimi-k2.7-code`, `kimi-k2.6`,
`glm-5.3`, `glm-5.3-flash`, `glm-5.2`, `glm-5.2-highspeed`,
`greg-2-ultra`, `greg-2-super`, `mimo-v2.5-pro`, `gemma-4-31b-it`, `qwen3.8-27b`

## Develop

```bash
npm install
npm run check   # typecheck + selfcheck
```

Requires: `CROFAI_API_KEY` env var or `auth.json` entry for end-to-end tests.
