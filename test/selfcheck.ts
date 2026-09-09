/**
 * Smoke + regression tests for pi-crofai-provider.
 * Run: node --experimental-strip-types test/selfcheck.ts
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { isVisionModel, mapModels, safeParseFloat } from "../index.ts";

const fixture: { data: Parameters<typeof mapModels>[0] } = JSON.parse(
	readFileSync(join(dirname(fileURLToPath(import.meta.url)), "fixture.json"), "utf8"),
);
const mapped = mapModels(fixture.data);
let failures = 0;
const check = (name: string, cond: boolean, detail = ""): void => {
	if (cond) console.log(`  ok   ${name}`);
	else { failures++; console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
};

const find = (id: string) => mapped.find((m) => m.id === id);
const inputEq = (m: { input: readonly string[] }, exp: readonly string[]) =>
	JSON.stringify(m.input) === JSON.stringify(exp);

check("16 models mapped", mapped.length === 16, `got ${mapped.length}`);

/* Vision — upstream regression */
check("deepseek-v4-flash-vision-exp has vision", inputEq(find("deepseek-v4-flash-vision-exp")!, ["text", "image"]));

/* Vision — no false positives */
for (const id of ["greg-2-ultra", "greg-2-super", "deepseek-v4-flash-0731", "deepseek-v4-pro-0813", "mimo-v2.5-pro", "glm-5.3"])
	check(`${id} is text-only`, inputEq(find(id)!, ["text"]));

/* Vision — prefix families (upstream's Set was missing these) */
for (const id of ["kimi-k3", "kimi-k3-eco", "kimi-k2.7-code", "kimi-k2.6", "gemma-4-31b-it", "qwen3.8-27b", "qwen3.5-9b"])
	check(`${id} has vision (family prefix)`, inputEq(find(id)!, ["text", "image"]));

/* Reasoning */
const kimiK3 = find("kimi-k3");
check("kimi-k3 is reasoning", kimiK3!.reasoning === true && !!kimiK3!.thinkingLevelMap);
check("kimi-k3 has deferredToolsMode: kim", JSON.stringify(kimiK3!.compat) === JSON.stringify({ supportsReasoningEffort: true, deferredToolsMode: "kimi" }));

const glm = find("glm-5.3");
check("glm-5.3 is reasoning", glm!.reasoning === true && !!glm!.thinkingLevelMap);
check("glm-5.3 compat", JSON.stringify(glm!.compat) === JSON.stringify({ supportsReasoningEffort: true }));

check("greg-2-ultra is NOT reasoning", find("greg-2-ultra")!.reasoning === false);

/* Pricing */
const p = find("deepseek-v4-pro-0813")!.cost;
check("cost.input = 0.35", Math.abs(p.input - 0.35) < 1e-9);
check("cost.output = 0.80", Math.abs(p.output - 0.80) < 1e-9);
check("cost.cacheRead = 0.01", Math.abs(p.cacheRead - 0.01) < 1e-9);
check("cost.cacheWrite = 0", p.cacheWrite === 0);

/* Context */
const k2 = find("kimi-k2.6");
check("contextWindow = 262144", k2!.contextWindow === 262144);
check("maxTokens = 262144", k2!.maxTokens === 262144);

/* Guards */
check("safeParseFloat '1.5' → 1.5", safeParseFloat("1.5", "x", "t") === 1.5);
check("safeParseFloat undefined → 0 + warn", safeParseFloat(undefined, "x", "t") === 0);
check("safeParseFloat '' → 0 + warn", safeParseFloat("", "x", "t") === 0);
check("safeParseFloat 'abc' → 0 + warn", safeParseFloat("abc", "x", "t") === 0);
check("safeParseFloat 'NaN' → 0 + warn", safeParseFloat("NaN", "x", "t") === 0);

/* isVisionModel */
for (const [id, exp] of [
	["foo-vision-bar", true], ["foo-vl-bar", true], ["qwen-vl", true],
	["kimi-k2.6", true], ["qwen3.8-27b", true], ["gemma-4-31b-it", true],
	["greg-2-ultra", false], ["glm-5.3", false], ["deepseek-v4-pro-0813", false],
] as [string, boolean][]) {
	check(`isVisionModel('${id}') = ${exp}`, isVisionModel(id) === exp);
}

console.log(failures === 0 ? "\nselfcheck: all passed" : `\nselfcheck: ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
