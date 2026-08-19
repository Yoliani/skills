---
name: sentry
description: Fetch and analyze issues, events, and logs from Sentry or a GlitchTip instance (any custom URL from ~/.sentryclirc). Use when debugging a production error, chasing a stack trace, finding what broke at a given time, or checking recent errors for a project.
---

# Sentry / GlitchTip

Read error-tracking data over the API. Works against Sentry SaaS and against
GlitchTip (or any Sentry-compatible server) at a custom URL, because GlitchTip
implements a subset of the same `/api/0/` surface.

## Configuration

Everything is resolved from `~/.sentryclirc` (the `sentry-cli` config file):

```ini
[auth]
token=<auth token>

[defaults]
url=https://glitchtip.example.com/
org=myorg
project=backend
```

- `url` — server root. Omit it for Sentry SaaS (`https://sentry.io/`). For
  GlitchTip, use the same host you open in the browser; `/api/0` is appended.
- `org` / `project` — used whenever `--org` / `--project` is omitted.
- The token for GlitchTip comes from *Profile → Auth Tokens* in its UI.

Overrides, highest priority first: CLI flags → environment → rc file.

| Setting | Flag | Env | rc key |
|---------|------|-----|--------|
| Server root | `--url` | `SENTRY_URL` | `[defaults] url` |
| Token | — | `SENTRY_AUTH_TOKEN` | `[auth] token` |
| Backend | `--backend` | `SENTRY_BACKEND` | `[defaults] backend` |
| rc file path | `--rc` | `SENTRY_RC` | — |

**Two rc files.** Like `sentry-cli`, `~/.sentryclirc` is the base and a
`.sentryclirc` in the working directory layers on top, key by key: a repo can
set `url`/`org`/`project` while the token keeps coming from the home file. Pass
`--rc <path>` (or `SENTRY_RC`) to skip that search and read one file only.
`check-config.js` prints which files were merged.

A repo-local `.sentryclirc` sits in the working tree — keep tokens in the home
file, or make sure the local one is ignored by git before writing one.

**Backend detection:** `sentry.io` and `*.sentry.io` are treated as Sentry;
every other host is assumed to be GlitchTip. Self-hosted Sentry therefore needs
`--backend sentry` (or `backend=sentry` in the rc file), otherwise the
Sentry-only scripts refuse to run.

Start with `./scripts/check-config.js` — it prints the resolved URL, backend,
and defaults, then verifies the token by listing organizations. Run it first
whenever a call fails with an auth or 404 error.

## What works where

| Script | Sentry | GlitchTip |
|--------|--------|-----------|
| `check-config.js` | yes | yes |
| `list-issues.js` | yes | yes (`is:`/`level:` query subset, sorts mapped) |
| `fetch-issue.js` | yes | yes, except short IDs (`PROJ-ABC`) |
| `fetch-event.js` | yes | yes |
| `search-logs.js` | yes (Logs Explorer) | yes (different filter flags, see below) |
| `search-events.js` | yes (Discover) | **no** — Discover has no GlitchTip equivalent |

On GlitchTip, replace a Discover search with `list-issues.js --query ...`
followed by `fetch-issue.js <id> --latest`.

## Quick reference

| Task | Command |
|------|---------|
| Verify config and auth | `check-config.js` |
| List open issues | `list-issues.js --status unresolved --period 24h` |
| Get issue + stack trace | `fetch-issue.js <issue-id-or-url> --latest` |
| Get one event | `fetch-event.js <event-id> --project backend` |
| Search logs | `search-logs.js "timeout" --level error` |
| Search events (Sentry only) | `search-events.js --start 2026-08-19T15:00:00 --level error` |

All scripts take `--json` for raw output and `-h` for full usage.

## Common debugging workflows

### "What errors are happening right now?"

```bash
# Unresolved errors from the last 24 hours
./scripts/list-issues.js --status unresolved --level error --period 24h

# The noisiest ones first
./scripts/list-issues.js --sort freq --period 7d

# Search by message text
./scripts/list-issues.js --query "ConnectionResetError"
```

### "Show me this issue"

```bash
# Numeric ID, or the URL straight from the browser (Sentry or GlitchTip)
./scripts/fetch-issue.js 5765604106 --latest
./scripts/fetch-issue.js https://glitchtip.example.com/myorg/issues/42 --latest

# Short IDs are Sentry-only
./scripts/fetch-issue.js MYPROJ-123 --org myorg --latest
```

`--latest` attaches the most recent event: stack trace, request, breadcrumbs,
runtime context. That is usually the whole story for a crash.

### "Give me the full event"

```bash
./scripts/fetch-event.js abc123def456 --project backend --breadcrumbs
./scripts/fetch-event.js abc123def456 --project backend --spans   # transactions
```

### "What was logged around that time?"

```bash
# GlitchTip: positional query is full-text over the log body
./scripts/search-logs.js "timeout" --level error --period 6h --project backend
./scripts/search-logs.js --trace 4f2a... --period 7d

# Sentry: Logs Explorer query syntax, and its URLs are accepted directly
./scripts/search-logs.js "level:error message:*timeout*" --org myorg
./scripts/search-logs.js "https://myorg.sentry.io/explore/logs/?project=123&statsPeriod=7d"
```

### "What went wrong at 15:40?" (Sentry only)

```bash
./scripts/search-events.js --start 2026-08-19T15:00:00 --end 2026-08-19T17:00:00
./scripts/search-events.js --start 2026-08-19T15:00:00 --level error
./scripts/search-events.js --tag thread_id:th_abc123
./scripts/search-events.js --transaction process-incoming-email
```

## Notes and gotchas

- **Time ranges.** Sentry takes `statsPeriod`; GlitchTip only takes explicit
  `start`/`end`, so `--period 24h` is converted to a start timestamp for it.
- **Sorting.** `--sort date|new|freq|priority` maps onto GlitchTip's
  `-last_seen|-first_seen|-count|-priority`. `--sort user` is Sentry-only.
- **Query syntax.** GlitchTip understands `is:unresolved` and plain text search;
  it does not implement the full Sentry query language (`times_seen:>100`,
  `has:user`, …). If a query returns something surprising, simplify it rather
  than trusting the filter silently applied.
- **Log limits.** GlitchTip caps `--limit` at 200 per page; Sentry allows 1000.
- **Two servers at once.** Keep the everyday one in `~/.sentryclirc` and reach
  the other with `--url https://other.example.com` plus `SENTRY_AUTH_TOKEN=...`.

## Debugging tips

1. Start broad (`list-issues.js`), then drill into one issue with `--latest`.
2. Breadcrumbs show what happened *before* the error — usually more informative
   than the stack trace alone.
3. Correlate across services with the trace ID: `search-logs.js --trace <id>`.
4. Frequency (`--sort freq`) separates a real regression from background noise.

---

Adapted from [mitsuhiko/agent-stuff](https://github.com/mitsuhiko/agent-stuff)'s
`sentry` skill (Apache-2.0) — see `NOTICE`.
