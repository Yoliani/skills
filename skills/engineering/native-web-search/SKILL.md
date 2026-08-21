---
name: native-web-search
description: "Trigger web search from the shell. Use when you need quick internet research with concise summaries or ranked results and full source URLs."
license: "Adapted from https://github.com/mitsuhiko/agent-stuff (skills/native-web-search)"
---

# Native Web Search

Run a web search from the shell and get back either a written research summary or ranked results with explicit full URLs.

## Script

- `search.mjs`

## Usage

Run from this skill directory:

```bash
node search.mjs "<what to search>" --purpose "<why you need this>"
```

Examples:

```bash
node search.mjs "latest python release" --purpose "update dependency notes"
node search.mjs "vite 7 breaking changes" --provider exa --results 8
node search.mjs "go release notes" --provider nan --fresh pw
```

Flags:

- `--purpose <why>` — what the results are for; steers the summary and Exa's highlight selection
- `--provider openai-codex|anthropic|exa|nan`
- `--model <id>` — model id for the LLM providers; Exa search `type` (`auto`, `fast`, `deep`, …) for `exa`
- `--results <n>` — result count for `exa` / `nan` (NaN clamps to 20)
- `--fresh pd|pw|pm|py|<date>` — recency filter for `exa` / `nan`
- `--text` — also pull the readable page text, not just excerpts (slower)
- `--timeout <ms>`
- `--json`

## Providers

| Provider | Returns | Credential |
| --- | --- | --- |
| `openai-codex` | written summary from a fast model with native web search | `pi` OAuth/API creds in `~/.pi/agent/auth.json` |
| `anthropic` | written summary from a fast model with native web search | `pi` OAuth/API creds in `~/.pi/agent/auth.json` |
| `exa` | ranked results with purpose-scored highlights | `EXA_API_KEY` |
| `nan` | ranked results with snippets, via NaN's proxied search | `NAN_API_KEY` |

Provider selection: `--provider`, then `defaultProvider` from `~/.pi/agent/settings.json`, then whichever `pi` credentials exist, then `EXA_API_KEY`, then `NAN_API_KEY`.

**The two LLM providers require [`pi`](https://github.com/mitsuhiko/pi-mono) to be installed and authenticated** — they load `@earendil-works/pi-ai` and read `~/.pi/agent/auth.json`. Without `pi`, use `exa` or `nan`; those are plain HTTP calls with no dependency beyond Node.

### exa

`POST https://api.exa.ai/search`. Highlights are scored against `--purpose`, so the excerpts answer why you searched rather than just matching the query. `--fresh` maps to `startPublishedDate`. Key from https://dashboard.exa.ai/api-keys. Billed per request; `--json` reports `costDollars`.

### nan

`POST https://api.nan.builders/v1/search`. NaN proxies upstream search providers, so your key never reaches them. Limits are per key and separate from NaN's model endpoints: 20 req/min, 3 concurrent, 500 searches/day. Identical queries within ~15 minutes come from cache (`cached: true` in `--json`) and still count against quota. `--purpose` does not affect NaN results — it only labels the output.

## Output expectations

The LLM providers instruct the model to:
- search the internet for the requested topic
- provide a concise summary for the given purpose
- include full canonical URLs (`https://...`) for each key finding
- highlight disagreements between sources

`exa` and `nan` return ranked results instead: numbered title, full URL, metadata, and excerpts.

## Notes

- No npm install is required.
- If module resolution fails for the LLM providers, set `PI_AI_MODULE_PATH` to `@earendil-works/pi-ai`'s `dist/index.js` path.
- If OAuth helper resolution fails, set `PI_AI_OAUTH_MODULE_PATH` to `@earendil-works/pi-ai`'s `dist/oauth.js` path.
- For OAuth providers, the script can fall back to a still-valid cached `access` token from `~/.pi/agent/auth.json`.

## Source

Adapted from [mitsuhiko/agent-stuff](https://github.com/mitsuhiko/agent-stuff/tree/main/skills/native-web-search); the `exa` and `nan` providers are additions.
