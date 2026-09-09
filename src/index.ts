/**
 * pi-crofai-provider — CrofAI provider for the pi coding agent.
 *
 * Two providers from the same CrofAI catalog:
 *   "crofai"           → /v1/chat/completions  (openai-completions) — RECOMMENDED
 *   "crofai-responses"  → /v1/responses         (openai-responses)
 *
 * See README "Which provider to use" for the recommendation.
 */

import type { ExtensionAPI, ProviderModelConfig } from "@earendil-works/pi-coding-agent";

/* ── Constants ───────────────────────────────────────────────────────────── */

const BASE = "https://crof.ai/v1";
const MODELS_URL = `${BASE}/models`;
const FETCH_TIMEOUT_MS = 5_000;

/* ── API types ───────────────────────────────────────────────────────────── */

interface CrofAIModel {
	id: string;
	name: string;
	context_length: number;
	max_completion_tokens: number;
	pricing: { prompt: string; completion: string; cache_prompt?: string };
	reasoning_effort?: boolean;
	custom_reasoning?: boolean;
}

interface CrofAIResponse { data: CrofAIModel[] }

/* ── RefreshModels context (pi-ai types subset) ───────────────────────────── */

interface RefreshCtx { allowNetwork: boolean; signal: AbortSignal }

/* ── Vision heuristic ─────────────────────────────────────────────────────── */

/**
 * CrofAI's /v1/models has no `image_input` field — vision must be inferred
 * from the model id:
 *   (a) "vision" / "-vl-" in id  → vision
 *   (b) Kimi / Gemma-4 / Qwen3 family prefix → vision (covers future models)
 */
const VISION_PREFIXES = ["kimi-", "gemma-4-", "qwen3."] as const;

export function isVisionModel(id: string): boolean {
	const l = id.toLowerCase();
	return l.includes("vision") || l.includes("-vl-") || l.endsWith("-vl")
		|| VISION_PREFIXES.some((p) => l.startsWith(p));
}

/* ── Pricing ──────────────────────────────────────────────────────────────── */

export function safeParseFloat(raw: string | undefined, field: string, id: string): number {
	if (raw === undefined || raw === null || raw === "") {
		console.warn(`[crofai] missing "${field}" for ${id}; using 0`);
		return 0;
	}
	const n = parseFloat(raw);
	if (!Number.isFinite(n)) {
		console.warn(`[crofai] non-numeric "${field}" for ${id}; using 0`);
		return 0;
	}
	return n;
}

/* ── Thinking level map ──────────────────────────────────────────────────── */

/** CrofAI accepts: "none" | "low" | "medium" | "high". pi's "xhigh" maps to "high". */
const THINKING_MAP = {
	off: "none", minimal: "low", low: "low", medium: "medium", high: "high", xhigh: "high",
} as const;

/* ── Mapping ──────────────────────────────────────────────────────────────── */

export function mapModels(raw: CrofAIModel[]): ProviderModelConfig[] {
	return raw.map((m) => {
		const reasoning = m.reasoning_effort === true || m.custom_reasoning === true;
		const isKimi = m.id.startsWith("kimi-");
		return {
			id: m.id,
			name: m.name,
			reasoning,
			input: isVisionModel(m.id) ? ["text", "image"] : ["text"],
			contextWindow: m.context_length,
			maxTokens: m.max_completion_tokens,
			cost: {
				input: safeParseFloat(m.pricing.prompt, "prompt", m.id),
				output: safeParseFloat(m.pricing.completion, "completion", m.id),
				cacheRead: safeParseFloat(m.pricing.cache_prompt, "cache_prompt", m.id),
				cacheWrite: 0,
			},
			...(reasoning ? {
				thinkingLevelMap: THINKING_MAP,
				compat: {
					supportsReasoningEffort: true,
					// Kimi-specific: defer tool schemas until the model references them.
					...(isKimi ? { deferredToolsMode: "kimi" as const } : {}),
				},
			} : {}),
		};
	});
}

/* ── Fetch ───────────────────────────────────────────────────────────────── */

async function fetchModels(sig: AbortSignal): Promise<CrofAIModel[]> {
	const r = await fetch(MODELS_URL, { signal: sig });
	if (!r.ok) throw new Error(`HTTP ${r.status}`);
	const { data } = await r.json() as CrofAIResponse;
	if (!Array.isArray(data)) throw new Error("missing 'data' array");
	return data;
}

function fetchWithTimeout(parent?: AbortSignal): Promise<CrofAIModel[]> {
	const ctl = new AbortController();
	const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
	const sig = parent ? AbortSignal.any([parent, ctl.signal]) : ctl.signal;
	return fetchModels(sig).finally(() => clearTimeout(timer));
}

/* ── Registration ─────────────────────────────────────────────────────────── */

/**
 * `refreshModels` is pi's official callback: fires on /reload and catalog refresh.
 * Returning [] on error preserves the prior model list (transient network issues
 * don't wipe the registry).
 */
function register(
	pi: ExtensionAPI,
	name: string,
	api: "openai-completions" | "openai-responses",
	initial: ProviderModelConfig[],
) {
	pi.registerProvider(name, {
		baseUrl: BASE,
		apiKey: "$CROFAI_API_KEY",
		api,
		models: initial,
		refreshModels: async (ctx: RefreshCtx): Promise<ProviderModelConfig[]> => {
			if (!ctx.allowNetwork) return initial;
			try { return mapModels(await fetchWithTimeout(ctx.signal)); }
			catch (e) { console.error(`[crofai] refresh failed (${name}): ${e}`); return []; }
		},
	});
}

/* ── Entry ───────────────────────────────────────────────────────────────── */

export default async function provider(pi: ExtensionAPI): Promise<void> {
	let initial: ProviderModelConfig[];
	try { initial = mapModels(await fetchWithTimeout()); }
	catch (e) { console.error(`[crofai] init failed: ${e}`); return; }

	register(pi, "crofai", "openai-completions", initial);
	register(pi, "crofai-responses", "openai-responses", initial);
}
