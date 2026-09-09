#!/usr/bin/env node
/**
 * update-models.mjs — dev tool for pi-crofai-provider. No dependencies, Node 22+.
 *
 *   node scripts/update-models.mjs snapshot
 *       Fetch the public https://crof.ai/v1/models catalog and regenerate
 *       models.snapshot.json (the embedded startup catalog). Run before releases.
 *
 *   node scripts/update-models.mjs probe [options]
 *       Run cheap end-to-end probes against live models and write EVIDENCE-BASED
 *       corrections to curations.json + a human-readable probe-report.md.
 *       The CrofAI /v1/models capability flags (reasoning_effort / custom_reasoning)
 *       are not always accurate — this script measures reality instead of trusting
 *       them. Probes cost a few credits per model; keep --models narrow when testing.
 *
 *       Options:
 *         --key <key>        API key (default: $CROFAI_API_KEY)
 *         --models <a,b,c>   Limit to specific model ids
 *         --checks <list>    vision,reasoning,levels,maxtokens (default: all)
 *         --timeout <ms>     Per-request timeout (default 45000)
 *
 * What each check proves:
 *   vision     a 1x1 PNG message is accepted          → input: ["text","image"]
 *   reasoning  reasoning_effort:"low" is accepted      → reasoning: true (+ effort support)
 *   levels     which of low/medium/high are accepted   → thinkingLevelMap (unsupported → null)
 *   maxtokens whether max_completion_tokens is honored → compat.maxTokensField
 *              or silently ignored (CrofAI is rumored to ignore it)
 *
 * Everything probed is recorded verbatim in probe-report.md: request params,
 * HTTP status, response usage counts and error messages — reproducible proof,
 * not folklore.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SNAPSHOT_PATH = path.join(ROOT, "models.snapshot.json");
const CURATIONS_PATH = path.join(ROOT, "curations.json");
const REPORT_PATH = path.join(ROOT, "probe-report.md");
const MODELS_URL = "https://crof.ai/v1/models";
const CHAT_URL = "https://crof.ai/v1/chat/completions";
const LEVELS = ["low", "medium", "high"];
/** 1x1 transparent PNG */
const TINY_PNG =
	"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

const args = process.argv.slice(2);
const command = args[0];
const option = (name) => {
	const i = args.indexOf(`--${name}`);
	return i >= 0 ? args[i + 1] : undefined;
};

async function fetchJson(url, key, timeoutMs, body) {
	const ctl = new AbortController();
	const timer = setTimeout(() => ctl.abort(), timeoutMs);
	try {
		const r = await fetch(url, {
			method: body ? "POST" : "GET",
			headers: { "Content-Type": "application/json", ...(key ? { Authorization: `Bearer ${key}` } : {}) },
			body: body ? JSON.stringify(body) : undefined,
			signal: ctl.signal,
		});
		const text = await r.text();
		let json = null;
		try { json = JSON.parse(text); } catch { /* non-JSON error body */ }
		return { ok: r.ok, status: r.status, json, text: text.slice(0, 300) };
	} catch (e) {
		return { ok: false, status: 0, json: null, text: String(e) };
	} finally {
		clearTimeout(timer);
	}
}

/* ── snapshot ─────────────────────────────────────────────────────────────── */

async function snapshot() {
	const r = await fetchJson(MODELS_URL, undefined, 15_000);
	if (!r.ok || !Array.isArray(r.json?.data)) {
		console.error(`snapshot failed: HTTP ${r.status} ${r.text}`);
		process.exit(1);
	}
	const out = { generatedAt: new Date().toISOString(), data: r.json.data };
	fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(out, null, 2) + "\n");
	console.log(`models.snapshot.json written: ${out.data.length} models`);
}

/* ── probe ────────────────────────────────────────────────────────────────── */

const chat = (key, timeoutMs, body) => fetchJson(CHAT_URL, key, timeoutMs, { ...body, stream: false });

async function probeVision(key, model, timeoutMs) {
	const r = await chat(key, timeoutMs, {
		model,
		max_tokens: 20,
		messages: [{
			role: "user",
			content: [
				{ type: "text", text: "What color is this pixel? Answer in one word." },
				{ type: "image_url", image_url: { url: TINY_PNG } },
			],
		}],
	});
	return { accepted: r.ok && r.json?.choices != null, evidence: `HTTP ${r.status}${r.ok ? "" : ` — ${r.text}`}` };
}

async function probeEffort(key, model, effort, timeoutMs) {
	const r = await chat(key, timeoutMs, {
		model,
		reasoning_effort: effort,
		max_tokens: 400,
		messages: [{ role: "user", content: "Reply with the single word: OK" }],
	});
	const rejected = !r.ok && /reasoning|effort|thinking/i.test(r.text);
	return { accepted: r.ok, rejected, evidence: `HTTP ${r.status}${r.ok ? "" : ` — ${r.text}`}` };
}

/** Sends "count 1..N" capped at limit tokens; returns the reported completion token count. */
async function probeTokenCap(key, model, field, limit, timeoutMs) {
	const body = { model, messages: [{ role: "user", content: "Count from 1 to 50, digits separated by spaces." }] };
	body[field] = limit;
	const r = await chat(key, timeoutMs, body);
	const used = r.json?.usage?.completion_tokens;
	return { ok: r.ok, used, evidence: `HTTP ${r.status} completion_tokens=${used ?? "?"}${!r.ok ? ` — ${r.text}` : ""}` };
}

async function probeModel(id, checks, key, timeoutMs) {
	const result = { vision: null, reasoning: null, levels: null, maxtokens: null };

	if (checks.has("vision")) {
		result.vision = await probeVision(key, id, timeoutMs);
	}
	if (checks.has("reasoning")) {
		result.reasoning = await probeEffort(key, id, "low", timeoutMs);
	}
	if (checks.has("levels")) {
		result.levels = {};
		for (const level of LEVELS) result.levels[level] = await probeEffort(key, id, level, timeoutMs);
	}
	if (checks.has("maxtokens")) {
		// "Count from 1 to 50" needs ~140 tokens; a capped request reports <= limit.
		const a = await probeTokenCap(key, id, "max_completion_tokens", 6, timeoutMs);
		const b = await probeTokenCap(key, id, "max_tokens", 6, timeoutMs);
		result.maxtokens = {
			maxCompletionTokens: a,
			maxTokens: b,
			honored: a.ok && a.used != null && a.used <= 8 ? "max_completion_tokens"
				: b.ok && b.used != null && b.used <= 8 ? "max_tokens"
				: a.ok && a.used != null && b.ok && b.used != null && b.used > 8 ? "neither (both ignored!)"
				: "inconclusive",
		};
	}
	return result;
}

function curationFor(id, apiFlag, result) {
	const c = {};
	if (result.vision?.accepted) c.input = ["text", "image"];
	if (result.reasoning) {
		if (result.reasoning.accepted && !apiFlag) c.reasoning = true;      // API under-reports
		if (result.reasoning.rejected && apiFlag) c.reasoning = false;      // API over-reports
		if (result.reasoning.accepted) {
			c.compat = { supportsReasoningEffort: true };
		}
	}
	if (result.levels) {
		const map = { off: "none", minimal: result.levels.low?.accepted ? "low" : null };
		for (const level of LEVELS) map[level] = result.levels[level]?.accepted ? level : null;
		if (Object.values(map).some((v) => v === null)) c.thinkingLevelMap = map;
	}
	if (result.maxtokens?.honored === "max_tokens") {
		c.compat = { ...c.compat, maxTokensField: "max_tokens" };
	}
	return Object.keys(c).length > 0 ? c : null;
}

async function probe() {
	const key = option("key") || process.env.CROFAI_API_KEY;
	if (!key) { console.error("probe needs an API key: --key or $CROFAI_API_KEY"); process.exit(1); }
	const timeoutMs = Number(option("timeout") ?? 45_000);
	const checks = new Set((option("checks") ?? "vision,reasoning,levels,maxtokens").split(","));
	const only = option("models")?.split(",");

	const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, "utf8"));
	const curations = JSON.parse(fs.readFileSync(CURATIONS_PATH, "utf8"));
	const models = snapshot.data.filter((m) => !only || only.includes(m.id));
	if (models.length === 0) { console.error("no models matched"); process.exit(1); }

	const lines = ["# CrofAI probe report", "", `Generated: ${new Date().toISOString()}`, ""];
	for (const m of models) {
		const apiFlag = m.reasoning_effort === true || m.custom_reasoning === true;
		console.log(`probing ${m.id} …`);
		const result = await probeModel(m.id, checks, key, timeoutMs);
		const c = curationFor(m.id, apiFlag, result);
		if (c) curations[m.id] = { ...curations[m.id], ...c };

		lines.push(`## ${m.id} (API reasoning flag: ${apiFlag})`, "");
		if (result.vision) lines.push(`- vision: ${result.vision.accepted ? "YES" : "no"} (${result.vision.evidence})`);
		if (result.reasoning) lines.push(`- reasoning_effort low: ${result.reasoning.accepted ? "accepted" : result.reasoning.rejected ? "rejected" : `error (${result.reasoning.evidence})`}`);
		if (result.levels) for (const [level, r] of Object.entries(result.levels)) lines.push(`- effort ${level}: ${r.accepted ? "accepted" : r.rejected ? "rejected" : `error (${r.evidence})`}`);
		if (result.maxtokens) {
			lines.push(`- max_completion_tokens=6 → ${result.maxtokens.maxCompletionTokens.evidence}`);
			lines.push(`- max_tokens=6 → ${result.maxtokens.maxTokens.evidence}`);
			lines.push(`- **honored field: ${result.maxtokens.honored}**`);
		}
		lines.push(c ? `- curation: \`${JSON.stringify(c)}\`` : "- curation: none (API flags confirmed)", "");
	}

	fs.writeFileSync(CURATIONS_PATH, JSON.stringify(curations, null, 2) + "\n");
	fs.writeFileSync(REPORT_PATH, lines.join("\n") + "\n");
	console.log(`done → curations.json + probe-report.md (${models.length} models, ~${models.length * 6} requests spent)`);
}

/* ── main ─────────────────────────────────────────────────────────────────── */

if (command === "snapshot") await snapshot();
else if (command === "probe") await probe();
else {
	console.error("usage: node scripts/update-models.mjs <snapshot|probe> [options]");
	process.exit(1);
}
