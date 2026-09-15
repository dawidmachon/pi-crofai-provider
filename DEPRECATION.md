# pi-crofai-provider — Deprecation Notice

**This package is deprecated and no longer works.**

CrofAI's API (`crof.ai`) has been returning 404 errors since approximately September 15, 2026. The service is no longer operational.

---

## Why this happened

An independent investigation found that CrofAI was silently routing some model requests to OpenRouter without disclosure to users. The evidence was independently verifiable through attestations published on GitHub.

**Key findings:**
- Models accepted the `openrouter:advisor` tool (unexpected for an independent provider)
- Response fingerprints, `gen-` response IDs, and image download sources matched OpenRouter infrastructure
- Multiple models were being routed to cheaper/weaker models than requested (e.g., Kimi K3 → GLM 5.3 Flash)
- The `:consistent` fallback toggle (appended to model IDs) returned 404, not a documented behavior

**Links for full context:**
- https://kendell.dev/blog/crofaifalse/
- https://archive.ph/UY79M

---

## CrofAI owner's statements

From the Discord conversation logs (September 12–14, 2026):

> *"the greg models I believe point to openrouter, in all honesty, my goal with greg was to experiment with increasing benchmark performance with a custom mcp thing, in my testing it did work but it was marginal at best and UI was better but that's about all so greg models are openrouter re-routes"*

> *"for transparency, I do route qwen3.5-9b to openrouter because I'm happy to eat the cost on that one"*

> *"deepseek-v4-flash-vision-exp will still fallback and it's fallback is configured incorrectly, mimo-v2.5-pro is incorrect"*

The owner initially described OpenRouter as an "all hell breaks loose fallback," later confirmed "a not insignificant amount of traffic going to openrouter," and after multiple iterations maintained that the latest version had "a literal zero percent chance this somehow routes to openrouter." Attestations taken after each deployment showed the routing continued.

---

### Full statement from CrofAI owner (September 2026)

The complete message from the 19-year-old developer (who started the project at ~16–17) is preserved in `sorry.txt` (exported from https://archive.ph/UY79M). Key excerpts:

> *"I'd like to start by saying that no amount of explanation, backstory, or reasoning could ever excuse my behavior. I've failed everyone around me and deceived those who promoted me and what I was making. I'm a fraud, a 19 year old fraud."*

> *"I started crof ~2 years ago, I can't recall if I was 16 or 17 at the time... I didn't intend on marketing it fraudulently (though I recognize that my initial intentions don't excuse my final choices)... By the time I'd learned enough about what words I was throwing out there to describe what I was building, I was far enough in that I got scared... I pushed off addressing what I'd been doing so long that eventually I found success beyond a few dozen dollars a month."*

> *"This is my fault, I fucked up, I deserve to be treated as such... If you're anyone else, someone who paid for the service, someone who trusted me as an individual, anyone at all, I'm sorry I did this... I'm sorry. (but no number of sorries could ever make up for this mistake. I fear this will haunt me for the rest of my life and I think that's likely what I deserve)"*

The owner states they are refunding all existing credits, plan to pay taxes owed, close the company, and move on. They note they were born in 2007 and have a real (if mid-tier) inference engine based on llama.cpp that they intend to eventually open source.

---

## Our position

This was a mistake by a young developer, not an act of malice. We take no sides. We're simply closing this plugin.

**Actions taken:**
- Repository archived (read-only on GitHub)
- npm package deprecated with notice
- This package version (1.0.6+) shows this notice on load and does not register providers
- No new features or updates will be made

**For current users:** If you have `pi-crofai-provider` installed, you will see this notice on next pi start. Please remove it from your extensions and use an alternative provider. Your stored `CROFAI_API_KEY` credentials can be removed via `/login`.

---

## Technical note

The embedded `models.snapshot.json` and `curations.json` remain as historical record. The code structure is preserved for anyone who wants to study the implementation. The live API endpoints are non-functional.

---

*Archived September 2026. Maintained by dawidmachon as a public service record.*
