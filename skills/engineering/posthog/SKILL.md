---
name: posthog
description: "Read product analytics and error tracking from PostHog (cloud or self-hosted) over its API: run HogQL, triage error tracking issues with stack traces, read feature flags and saved insights, find session recordings, and annotate deploys. Use when answering a question about product usage, chasing a production exception, checking what a flag is set to, or marking a release."
---

# PostHog

Query a PostHog project over its private API. Works against US Cloud
(`https://us.posthog.com`), EU Cloud (`https://eu.posthog.com`), and a
self-hosted instance at any URL.

## Confirm before you write

Three scripts change PostHog: `update-flag.js`, `update-issue.js`, and
`annotate.js`. A flag governs live traffic, an issue status is a signal the rest
of the team reads, and an annotation shows up on everyone's charts.

For each of them, in order:

1. Run it with `--dry-run`, which prints the exact before-and-after and sends
   nothing.
2. Show the user that output and say what you are about to do in one line.
3. Wait for their go-ahead, then run the same command without `--dry-run`.

The step is done when the user has said yes to the change they were shown. A
plan to change a flag is not the same as permission to change it.

Everything else in this skill only reads.

## Configuration

Everything is resolved from `~/.posthogrc`:

```ini
[auth]
personal_api_key=phx_xxxxxxxxxxxx

[defaults]
url=https://eu.posthog.com
project=12345
```

- `personal_api_key`: from *Settings → Personal API keys* in the PostHog UI.
  Copy it at creation time, it is never shown again.
- `url`: instance root. Omit it for US Cloud (`https://us.posthog.com`). Use the
  private host, `us.posthog.com` or `eu.posthog.com`, rather than the
  `*.i.posthog.com` capture hosts, which only accept event ingestion.
- `project`: the numeric project ID, the one in every UI URL after `/project/`.
  A project name works too, at the cost of one lookup call.

Overrides, highest priority first: CLI flags → environment → rc file.

| Setting | Flag | Env | rc key |
|---------|------|-----|--------|
| Instance root | `--url` | `POSTHOG_URL` | `[defaults] url` |
| Personal API key | n/a | `POSTHOG_PERSONAL_API_KEY` | `[auth] personal_api_key` |
| Project | `--project` / `-p` | `POSTHOG_PROJECT` | `[defaults] project` |
| Web UI root | n/a | `POSTHOG_WEB_URL` | `[defaults] web_url` |
| rc file path | `--rc` | `POSTHOG_RC` | n/a |

**Two rc files.** `~/.posthogrc` is the base and a `.posthogrc` in the working
directory layers on top, key by key: a repo can set `project` while the key
keeps coming from the home file. Pass `--rc <path>` (or `POSTHOG_RC`) to skip
that search and read one file only. `check-config.js` prints which files were
merged.

A repo-local `.posthogrc` sits in the working tree, so keep the key in the home
file, or make sure the local one is gitignored before writing one.

**Scopes.** Personal API keys are scoped per resource, so a key that reads
issues fine can still be refused on flags. The read-only scripts need
`query:read`, `error_tracking:read`, `feature_flag:read`, `insight:read`,
`session_recording:read`, and `annotation:read`. The three write scripts need
`error_tracking:write`, `feature_flag:write`, and `annotation:write`.

A rejected key and a missing scope both surface as a `401` or a `403` depending
on the endpoint, so the status code alone will not tell you which it is. The
scripts read the response body and say which one it was.

Start with `./scripts/check-config.js`, which prints the resolved URL and
project, then verifies the key by listing the organization's projects. Run it
first whenever a call fails with a 401, 403, or 404.

## Quick reference

| Task | Command | Kind |
|------|---------|------|
| Verify config and auth | `check-config.js` | read |
| Run HogQL | `query.js "select count() from events where timestamp >= now() - interval 1 day"` | read |
| List error tracking issues | `list-issues.js --period 24h` | read |
| Read an issue with its stack trace | `get-issue.js <issue-id>` | read |
| Resolve or suppress an issue | `update-issue.js <issue-id> --status resolved` | **write** |
| List feature flags | `list-flags.js --active` | read |
| Read one flag's conditions | `list-flags.js <key>` | read |
| Enable, disable, or re-roll a flag | `update-flag.js <key> --on` | **write** |
| List session recordings | `list-recordings.js --person <distinct-id>` | read |
| Read a saved insight | `get-insight.js <short-id>` | read |
| Mark a deploy | `annotate.js "Deployed v2.4.0"` | **write** |

All scripts take `--json` for raw output and `-h` for full usage. The three
write scripts also take `--dry-run`.

## HogQL

`query.js` is the workhorse: HogQL reaches events, persons, sessions, replay
metadata, and the query log, so most read questions are one query rather than
one endpoint. Read [`references/hogql.md`](references/hogql.md) before writing a
query. It carries the table and column list, the `properties.$x` access syntax,
the time-bounding idioms, and worked recipes for the usual questions.

```bash
./scripts/query.js "select event, count() as n from events
                    where timestamp >= now() - interval 1 day
                    group by event order by n desc limit 20"

./scripts/query.js -f ./retention.sql -p 12345 --json
./scripts/query.js -f - <<'SQL'                    # or from stdin
select toStartOfDay(timestamp) as day, uniq(person_id) as dau
from events where timestamp >= now() - interval 14 day
group by day order by day
SQL
```

## Common workflows

### "What's erroring in production?"

```bash
# Active issues, most recent activity first
./scripts/list-issues.js --period 24h

# The ones actually hurting people
./scripts/list-issues.js --sort users --period 7d -n 10

# Find one by message text
./scripts/list-issues.js --search "ConnectionResetError" --status all
```

### "Show me this exception"

```bash
./scripts/get-issue.js 0193a1b2-...-c3d4
./scripts/get-issue.js 0193a1b2-...-c3d4 --app-only    # hide vendor frames
./scripts/get-issue.js 0193a1b2-...-c3d4 --first       # the first occurrence
```

`get-issue.js` prints the counts, then the stack trace from the most recent
exception, then the replay link for the session it happened in. Chained
exceptions each get their own block. Watching the session is usually faster than
reasoning about the trace alone.

### "Is this flag on?"

```bash
./scripts/list-flags.js --active
./scripts/list-flags.js new-checkout-flow      # conditions, variants, rollout
```

### "Roll this out to 25%" (write)

```bash
./scripts/update-flag.js new-checkout-flow --rollout 25 --dry-run
# show the user the diff, get their go-ahead, then:
./scripts/update-flag.js new-checkout-flow --rollout 25
```

### "We shipped, mark it" (write)

```bash
./scripts/annotate.js "Deployed v2.4.0" --dry-run
./scripts/annotate.js "Deployed v2.4.0"
git log -1 --format=%s | ./scripts/annotate.js -f -
```

### "What did this user do?"

```bash
./scripts/list-recordings.js --person user@example.com

./scripts/query.js "select timestamp, event, properties.\$current_url
                    from events
                    where distinct_id = 'user@example.com'
                      and timestamp >= now() - interval 2 day
                    order by timestamp desc limit 100"
```

## Notes and gotchas

- **Two hosts.** `us.posthog.com` and `eu.posthog.com` serve the private API and
  the app. `us.i.posthog.com` and `eu.i.posthog.com` are capture-only and will
  not answer these calls. Configure the private one.
- **A 401 or 403 is either the key or its scopes.** The status code varies by
  endpoint, so the scripts read the response body and name which one it was. A
  scope problem wants wider scopes in the PostHog UI, not a rolled key.
- **Rate limits are org-wide, not per key.** 240/minute and 1200/hour for
  analytics endpoints, 2400/hour for `/query/`. Somebody else's script can spend
  your budget, and a 429 reports the seconds left.
- **`OFFSET` is rejected on `/query/`** for personal API keys, with a 400. Page
  with a keyset on `timestamp` (or `id` for persons) instead.
- **Queries are cached and capped.** Responses carry `is_cached`, execution is
  capped at 10 seconds, and 3 queries run concurrently per project. A timeout
  wants a shorter time range, not a retry.
- **Free plans have a monthly read allowance** of 50 TB across API queries.
  Past it, `/query/` returns a 402 with `api_queries_quota_exceeded`, while
  cached results keep working.
- **Flag `filters` replace wholesale.** `update-flag.js` reads the flag, edits
  the release condition groups, and sends the whole `filters` object back,
  because a partial PATCH would drop the conditions it did not mention.
- **Issue counts come from the query API, issue metadata from REST.** The REST
  issue endpoint has no occurrence counts and no filtering, so `list-issues.js`
  and `get-issue.js` go through `ErrorTrackingQuery` and merge in the REST
  record for assignee and external links. An issue with no events inside
  `--period` shows metadata and no counts, so widen the window.
- **Error tracking here, not in Sentry.** Call the Skill tool with `sentry` when
  the errors live in Sentry or GlitchTip instead. The two are separate backends
  with separate issue IDs.
