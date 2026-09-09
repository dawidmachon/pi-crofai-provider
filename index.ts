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
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

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
 * On network error we return the last known-good list — an empty array would be
 * published as the new (empty) catalog and wipe the provider's models.
 */
function register(
	pi: ExtensionAPI,
	name: string,
	api: "openai-completions" | "openai-responses",
	initial: ProviderModelConfig[],
	configured: boolean,
) {
	pi.registerProvider(name, {
		baseUrl: BASE,
		apiKey: "$CROFAI_API_KEY",
		api,
		models: initial,
		// Live catalog refresh is pi's official callback — but pi's refresh
		// resolves our $ENV credential during /model refreshes and THROWS when
		// it is unresolvable and no credential is stored. Only configured
		// providers (env key or stored /login credential) may opt in.
		...(configured
			? {
				refreshModels: async (ctx: RefreshCtx): Promise<ProviderModelConfig[]> => {
					if (!ctx.allowNetwork) return initial;
					try { return mapModels(await fetchWithTimeout(ctx.signal)); }
					catch (e) {
						console.error(`[crofai] refresh failed (${name}): ${e}`);
						return initial; // keep the known-good catalog; next refresh retries
					}
				},
			}
			: {}),
	});
}

/* ── Configuration gate ───────────────────────────────────────────────── */

/** Stored pi credentials: ~/.pi/agent/auth.json → { [providerId]: credential } */
function readStoredProviderIds(): Set<string> {
	try {
		const dir = process.env.PI_CODING_AGENT_DIR?.trim() || join(homedir(), ".pi", "agent");
		const auth = JSON.parse(readFileSync(join(dir, "auth.json"), "utf8")) as Record<string, unknown>;
		return new Set(Object.keys(auth));
	} catch {
		return new Set();
	}
}

/* ── Entry ───────────────────────────────────────────────────────────── */

export default async function provider(pi: ExtensionAPI): Promise<void> {
	const hasEnvKey = !!process.env.CROFAI_API_KEY?.trim();
	const stored = readStoredProviderIds();
	const wanted: Array<[string, "openai-completions" | "openai-responses"]> = [
		["crofai", "openai-completions"],
		["crofai-responses", "openai-responses"],
	];

	// /v1/models is public (no auth), so fetch the catalog even when
	// unconfigured: once the user logs in, models are already in /model — no
	// reload needed. Stay silent when unconfigured (pi extensions never log at
	// startup); a configured provider failing to load its catalog is reported.
	let initial: ProviderModelConfig[] = [];
	try { initial = mapModels(await fetchWithTimeout()); }
	catch (e) {
		if (hasEnvKey || stored.size > 0) console.error(`[crofai] init failed: ${e}`);
	}

	// Always register so /login offers crofai under "Use an API key" (apiKey
	// auth only — CrofAI has no account/OAuth flow, docs confirm Bearer keys).
	// pi keeps unconfigured providers' models out of /model via its auth check
	// until the env key is set or a credential is stored for that provider id.
	for (const [name, api] of wanted) {
		register(pi, name, api, initial, hasEnvKey || stored.has(name));
	}
}
