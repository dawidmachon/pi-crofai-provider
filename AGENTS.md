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

Single-file extension at the repo root (`index.ts`, ~330 LOC). No runtime deps.

```
index.ts                  # Extension: registration + footer wiring
models.snapshot.json      # Embedded catalog (regenerated each release) — sync startup
curations.json            # Evidence-based per-model overrides (from probe runs)
scripts/update-models.mjs # snapshot + probe generator (no deps)
probe-report.md           # Verbatim probe evidence (committed)
test/
  selfcheck.ts            # Pure logic tests (no pi runtime needed)
  fixture.json            # Live /v1/models fixture (2026-09-09)
```

### Model data strategy (three layers)

1. **Instant** — `models.snapshot.json` is mapped, curated, and registered
   synchronously at entry: zero startup latency, works offline.
2. **Fresh** — live `/v1/models` (public) is fetched in the background once;
   providers are re-registered only when the result differs from the snapshot
   (no-churn guard).
3. **Corrected** — `curations.json` overrides are applied on top of either
   source by `applyCurations` (vision, reasoning flags, thinking levels,
   compat merge; a resulting `reasoning: false` also strips stale thinking
   maps).

### Key implementation decisions

**Vision heuristic** — CrofAI has no `image_input` field in `/v1/models`. Derive from id:
- `id` contains `"vision"` or `"-vl-"` or ends with `"-vl"` → vision
- `id` starts with `"kimi-"`, `"gemma-4-"`, or `"qwen3."` → vision (prefix = future family members inherit)

**`refreshModels` callback** — official pi pattern for dynamic catalogs. On network error it returns the last known-good list — an empty array would be published as the new (empty) catalog and wipe the models. `ctx.allowNetwork` skips network on offline refresh phases.

**Auth / visibility model** — providers are always registered so `/login` can
offer them (API-key section only; CrofAI has no OAuth flow — Bearer keys).
`refreshModels` — pi's opt-in to network catalog refresh, whose credential
resolution throws on unresolvable `$ENV` keys — is attached only to configured
providers (env key or stored `/login` credential for that id). pi keeps
unconfigured providers' models out of `/model` via its auth check. The
embedded snapshot means models exist before any network access; the public
background revalidate means they are current without user action.

**Pricing** — CrofAI returns `$/M` as strings. `parseFloat` + `Number.isFinite` guard. `cacheWrite: 0` because CrofAI doesn't expose that field.

**Thinking map** — CrofAI accepts `"none"|"low"|"medium"|"high"`. pi's `xhigh` maps to `"high"` (closest valid value).

**Fetch timeout** — every fetch runs under `setTimeout` + `AbortController`,
composed with the caller's signal via `AbortSignal.any` so caller
cancellation (e.g., pi's session abort) also works. Failures are silent:
models fall back to the snapshot, the footer keeps its last value.

**Usage footer** — session cost is summed locally from turn-end
`usage.cost.total` (zero extra requests). The credits/requests balance is
fetched throttled: at most once per 90 s AND only after 5 turns — whichever
condition is satisfied first wins (light sessions update over time, heavy
sessions every few prompts). Renders happen even when the throttle blocks a
fetch (cost may have accumulated); the status is cleared when the active
model is not crofai. A failed balance fetch still consumes the throttle
window — deliberate anti-flooding.

**Token caps are not enforceable** — probe evidence shows CrofAI ignores both
`max_tokens` and `max_completion_tokens` on every model. pi's `maxTokens`
values are advisory here; do not add `compat.maxTokensField` curations.

## References

- **Live API**: `https://crof.ai/v1/models` — 16 models as of 2026-09-09
- **CrofAI docs** (broken/JS-rendered): `https://crof.ai/docs.md` returns raw markdown
- **Upstream**: `npm pack pi-crofai` → extract `package/index.ts`
- **pi types**: `dist/core/extensions/types.d.ts` → `ProviderConfig`, `ProviderModelConfig`, `RefreshModelsContext`
- **pi docs**: `docs/custom-provider.md` (provider registration), `docs/extensions.md` (lifecycle)

## Layout

```
index.ts                  # ~330 LOC. No runtime deps.
models.snapshot.json      # Embedded catalog (update: npm run update-models)
curations.json            # Per-model overrides (update: npm run probe-models)
probe-report.md           # Probe evidence (regenerated with curations)
scripts/update-models.mjs # snapshot + probe generator (no deps)
test/
  selfcheck.ts      # node --experimental-strip-types test/selfcheck.ts
  fixture.json      # Live API fixture for reproducible tests
package.json         # devDeps: @earendil-works/pi-coding-agent (types) + typescript
tsconfig.json        # strict, NodeNext, noEmit
AGENTS.md            # this file
README.md            # user-facing front page
CHANGELOG.md         # user-facing release notes
```
