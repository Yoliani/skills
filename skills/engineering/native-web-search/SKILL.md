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
node search.mjs "go release notes" --provider exa --fresh pw
```

Flags:

- `--purpose <why>`: what the results are for; steers the summary and Exa's highlight selection
- `--provider openai-codex|anthropic|exa`
- `--model <id>`: model id for the LLM providers; Exa search `type` (`auto`, `fast`, `deep`, …) for `exa`
- `--results <n>`: result count for `exa`
- `--fresh pd|pw|pm|py|<date>`: recency filter for `exa`
- `--text`: also pull the readable page text, not just excerpts (slower)
- `--timeout <ms>`
- `--json`

## Providers

| Provider | Returns | Credential |
| --- | --- | --- |
| `openai-codex` | written summary from a fast model with native web search | `pi` OAuth/API creds in `~/.pi/agent/auth.json` |
| `anthropic` | written summary from a fast model with native web search | `pi` OAuth/API creds in `~/.pi/agent/auth.json` |
| `exa` | ranked results with purpose-scored highlights | `EXA_API_KEY` |

Provider selection: `--provider`, then `defaultProvider` from `~/.pi/agent/settings.json` when it names one of these providers, then whichever `pi` credentials exist, then `EXA_API_KEY`.

**The two LLM providers require [`pi`](https://github.com/earendil-works/pi) to be installed and authenticated.** They load `@earendil-works/pi-ai` and read `~/.pi/agent/auth.json`. Without `pi`, use `exa`: a plain HTTP call with no dependency beyond Node.

### openai-codex

Searches use the ChatGPT plan's Codex usage limit. When Codex returns HTTP 400 `model is not supported when using Codex with a ChatGPT account` (the default model was retired) or HTTP 429 `usage_limit_reached` (the limit is used up until `resets_at`), rerun the search with `--provider exa`.

### exa

`POST https://api.exa.ai/search`. Highlights are scored against `--purpose`, so the excerpts answer why you searched rather than just matching the query. `--fresh` maps to `startPublishedDate`. Key from https://dashboard.exa.ai/api-keys. Billed per request; `--json` reports `costDollars`.

## Output expectations

The LLM providers instruct the model to:
- search the internet for the requested topic
- provide a concise summary for the given purpose
- include full canonical URLs (`https://...`) for each key finding
- highlight disagreements between sources

`exa` returns ranked results instead: numbered title, full URL, metadata, and excerpts.

## Notes

- No npm install is required.
- If module resolution fails for the LLM providers, set `PI_AI_MODULE_PATH` to `@earendil-works/pi-ai`'s `dist/index.js` path.
- OAuth tokens come from `~/.pi/agent/auth.json`. The script refreshes an expired token only when pi-ai exports `getOAuthApiKey` (set `PI_AI_OAUTH_MODULE_PATH` to its `dist/oauth.js` if the script cannot find it). Otherwise it uses the cached `access` token until that expires; after that, use `exa` until `pi` refreshes the token.

## Source

Adapted from [mitsuhiko/agent-stuff](https://github.com/mitsuhiko/agent-stuff/tree/main/skills/native-web-search); the `exa` provider is an addition.
