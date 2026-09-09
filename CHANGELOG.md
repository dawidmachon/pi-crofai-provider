# Changelog

All notable changes to `pi-crofai-provider` are documented here. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project adheres to [Semantic Versioning](https://semver.org/).

## [1.0.0] — 2026-09-09

Initial public release.

### Added

- Registers two providers from one CrofAI catalog fetched from
  `GET /v1/models`:
  - `crofai` (chat completions, `api: openai-completions`)
  - `crofai-responses` (OpenAI Responses API, `api: openai-responses`)
- Vision detection by id-pattern: id containing `vision`/`vl` OR starting with
  `kimi-`, `gemma-4-`, or `qwen3.`. Catches `deepseek-v4-flash-vision-exp`
  (missed by upstream pi-crofai's hand-curated list).
- Reasoning support via `thinkingLevelMap` (off→none, minimal/low→low,
  medium, high; xhigh→high downgrade) plus `compat.supportsReasoningEffort: true`.
- Kimi-specific `compat.deferredToolsMode: "kimi"` on Kimi reasoning models
  in chat completions — defers tool schema loading until the model references
  a tool in a turn. Smaller context, faster first-token latency on tool-heavy
  sessions. (Not available on Responses API for this catalog.)
- 5 s fetch timeout via `AbortSignal.any([callerSignal, timeoutSignal])` so
  both pi's cancellation and our ceiling work.
- NaN guard on pricing fields: `parseFloat` + `Number.isFinite`, fallback to
  `0` with `console.warn`.
- Pi's official `refreshModels` callback for `/reload` and catalog refreshes.
  Honors `RefreshModelsContext.allowNetwork` (skip fetch during offline init)
  and `signal` (cancellation). On fetch failure it returns the last known-good
  catalog — an empty return would be published as the new (empty) catalog and
  wipe the provider's models.
- Unconfigured providers are not registered at all, so `/model` shows no
  refresh errors before setup: a provider is active once `CROFAI_API_KEY` is
  set or a stored credential exists for its id (`/login` → `auth.json`).
- Auth via `CROFAI_API_KEY` env var or `/login` → "Use an API key" →
  `crofai` (persists to `~/.pi/agent/auth.json`).
- Zero runtime dependencies. Only type imports from
  `@earendil-works/pi-coding-agent` (transitive under pi).

### Hard-fork delta vs upstream `pi-crofai` (npm 1.0.5)

| # | Upstream | This fork |
|---|---|---|
| 1 | Vision: hand-curated `Set`, 5 phantom entries, missed `deepseek-v4-flash-vision-exp` | Id-pattern + prefix allowlist |
| 2 | No fetch timeout | `AbortSignal.any([caller, 5 s])` |
| 3 | `parseFloat(undefined)` → NaN poisons registry | Guard + warn + fallback |
| 4 | Models fetched once at load | `refreshModels` callback (pi's official pattern) |
| 5 | Only chat completions | Both `crofai` and `crofai-responses` |
| 6 | No Kimi-specific compat | `deferredToolsMode: "kimi"` for Kimi |
