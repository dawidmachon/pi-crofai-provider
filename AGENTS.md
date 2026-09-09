# pi-crofai-provider — project context

Loaded automatically when pi opens in this folder.

## Two-provider design

```
crofai           → openai-completions  → /v1/chat/completions  ← RECOMMENDED
crofai-responses → openai-responses    → /v1/responses
```

Both share the same catalog and `CROFAI_API_KEY`. Registered in one `provider()` call each.

**Why `openai-completions` wins over `openai-responses` for pi:**
- `deferredToolsMode: "kimi"` — Kimi models (kimi-*) get deferred tool loading: tool schemas are sent only after the model references them in a turn. Smaller context, faster first-token on tool-heavy sessions.
- `thinkingBudgets` — per-thinking-level token budgets available.
- Battle-tested in pi; `openai-responses` is less mature in pi's codebase.

**`openai-responses` advantages** (niche): `reasoningSummary` ("auto"|"detailed"|"concise"), `serviceTier` for scaling. Only use `crofai-responses` if you need these specific features.

## Architecture

Single-file extension (`# `index.ts` (repo root)`). No runtime deps.

```
# `index.ts` (repo root)       # Extension: fetchModels + mapModels + register
test/
  selfcheck.ts     # Pure logic tests (no pi runtime needed)
  fixture.json     # Live /v1/models snapshot (2026-09-09)
```

### Key implementation decisions

**Vision heuristic** — CrofAI has no `image_input` field in `/v1/models`. Derive from id:
- `id` contains `"vision"` or `"-vl-"` or ends with `"-vl"` → vision
- `id` starts with `"kimi-"`, `"gemma-4-"`, or `"qwen3."` → vision (prefix = future family members inherit)

**`refreshModels` callback** — official pi pattern for dynamic catalogs. On network error it returns the last known-good list — an empty array would be published as the new (empty) catalog and wipe the models. `ctx.allowNetwork` skips network on offline refresh phases.

**Unconfigured gate** — a provider registers only when configured: `CROFAI_API_KEY` set (env covers both providers) or a stored credential for its own id in `~/.pi/agent/auth.json` (respects `PI_CODING_AGENT_DIR`). Registering unconfigured would make pi's `/model` catalog refresh fail: pi-ai's credential resolution throws on unresolvable `$ENV` keys (unlike builtins, whose unconfigured auth resolves to `undefined` gracefully). Set the key and `/reload` to enable.

**Pricing** — CrofAI returns `$/M` as strings. `parseFloat` + `Number.isFinite` guard. `cacheWrite: 0` because CrofAI doesn't expose that field.

**Thinking map** — CrofAI accepts `"none"|"low"|"medium"|"high"`. pi's `xhigh` maps to `"high"` (closest valid value).

**Fetch timeout** — `AbortSignal.timeout(5000)` composed with `AbortSignal.any([parent, ctl.signal])` so caller cancellation (e.g., pi's session abort) also works.

## References

- **Live API**: `https://crof.ai/v1/models` — 16 models as of 2026-09-09
- **CrofAI docs** (broken/JS-rendered): `https://crof.ai/docs.md` returns raw markdown
- **Upstream**: `npm pack pi-crofai` → extract `package/index.ts`
- **pi types**: `dist/core/extensions/types.d.ts` → `ProviderConfig`, `ProviderModelConfig`, `RefreshModelsContext`
- **pi docs**: `docs/custom-provider.md` (provider registration), `docs/extensions.md` (lifecycle)

## Layout

```
# `index.ts` (repo root)         # ~100 LOC. No runtime deps.
test/
  selfcheck.ts      # node --experimental-strip-types test/selfcheck.ts
  fixture.json      # Live API snapshot for reproducible tests
package.json         # devDeps: @earendil-works/pi-coding-agent (types) + typescript
tsconfig.json       # strict, NodeNext, noEmit
AGENTS.md           # this file
README.md           # user-facing front page
```
