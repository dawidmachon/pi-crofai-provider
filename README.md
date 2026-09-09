# pi-crofai-provider

[![npm version](https://img.shields.io/npm/v/pi-crofai-provider.svg)](https://www.npmjs.com/package/pi-crofai-provider)

All CrofAI models for the [pi coding agent](https://github.com/earendil-works/pi-coding-agent) — instant startup, a live usage footer, and model info measured against the real API instead of trusted from it.

Hard fork of [`pi-crofai`](https://www.npmjs.com/package/pi-crofai).

## Install

```bash
pi install npm:pi-crofai-provider
```

Update later with `pi update npm:pi-crofai-provider`, or install straight
from this repo: `pi install git:github.com/dawidmachon/pi-crofai-provider`.
Then restart pi (or run `/reload`).

## Setup

Pick one:

- **`/login`** → *Use an API key* → `crofai` → paste your key. The key is
  stored in pi's auth store — nothing to export. **Recommended.**
- Or set the key before starting pi: `export CROFAI_API_KEY="your_key_here"`

CrofAI is API-key only; there is no account login. Your models appear in
`/model` immediately. After your very first login, run `/reload` once so
automatic catalog refresh activates.

## What you get

- **All 16 CrofAI models in `/model`**, registered instantly at startup from
  an embedded catalog — they are there even before the network answers (and
  when you're offline). The live catalog is re-checked in the background and
  swapped in when CrofAI adds or removes models.
- **A usage footer on CrofAI models**, e.g. `$0.0123 session · $9.26 left · 87 req`:
  - *session* — what this conversation has cost, computed locally every turn;
  - *left / req* — your remaining credits and plan requests, refreshed at
    most every 90 s or 5 turns — never once per prompt.
- **Measured model info.** CrofAI's capability flags are sometimes wrong
  (it claims the greg models can't reason — they can; it misses vision on
  some models). This package ships corrections backed by real API tests —
  see [`probe-report.md`](probe-report.md) for the raw evidence.
- **New CrofAI models arrive via `/reload`** — no restart needed.

### Which provider?

| Provider | API | Use it when |
|---|---|---|
| **`crofai`** | chat completions | Always — this is the recommended one. |
| `crofai-responses` | responses | Only if you specifically want the Responses API (`reasoningSummary`, `serviceTier`). |

Both share the same catalog and the same key.

## Good to know

- CrofAI **ignores token caps** (`max_tokens` and `max_completion_tokens`)
  on every model — verified across the catalog, see
  [`probe-report.md`](probe-report.md). Token limits shown in pi are advisory
  for this provider; watch the footer if cost matters.
- Unconfigured providers stay hidden in `/model` and never trigger refresh
  errors or send your key anywhere.
- The footer only shows while a CrofAI model is selected.

## Models

`deepseek-v4-pro-0813` · `deepseek-v4-flash-0731` · `deepseek-v4-flash-vision-exp` ·
`kimi-k3` · `kimi-k3-eco` · `kimi-k2.7-code` · `kimi-k2.6` ·
`glm-5.3` · `glm-5.3-flash` · `glm-5.2` ·
`greg-2-ultra` · `greg-2-super` · `mimo-v2.5-pro` ·
`gemma-4-31b-it` · `qwen3.8-27b` · `qwen3.5-9b`

## Development

```bash
npm run check                                            # typecheck + selfcheck
npm run update-models                                    # refresh models.snapshot.json from the live API
npm run probe-models -- --models kimi-k3,glm-5.3         # E2E capability probes (spends a few credits)
```

`probe-models` measures what the API only claims: image acceptance (vision),
which reasoning levels a model really accepts, and whether token-cap fields
are honored. Results go to `curations.json` (applied at runtime) and
`probe-report.md` (verbatim evidence). Run it when the catalog changes;
commit both files with the new snapshot.

Architecture and implementation notes: see [`AGENTS.md`](AGENTS.md).
