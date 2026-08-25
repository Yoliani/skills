---
name: plane
description: Read and write work items in Plane (plane.so cloud or a self-hosted instance) over the REST API — list and search work items, read one with comments and activity, create, update, move states, and comment. Use when picking up a ticket, checking what's assigned, filing an issue found while coding, or updating a work item after shipping.
---

# Plane

Work with a Plane project tracker over its REST API v1. Works against Plane
Cloud (`https://api.plane.so`) and against a self-hosted instance at any URL.

## Configuration

Everything is resolved from `~/.planesorc`:

```ini
[auth]
api_key=plane_api_xxxxxxxxxxxx

[defaults]
url=https://plane.example.com
workspace=acme
project=WEB
```

- `api_key` — from *Profile settings → Personal access tokens* in the Plane UI.
- `url` — server root. Omit it for Plane Cloud (`https://api.plane.so`). For a
  self-hosted instance, use the host you open in the browser; `/api/v1` is
  appended.
- `workspace` — the slug in the UI URL: `https://app.plane.so/<workspace>/`.
- `project` — a project identifier (`WEB`), name, or UUID, used whenever
  `--project` is omitted.

Overrides, highest priority first: CLI flags → environment → rc file.

| Setting | Flag | Env | rc key |
|---------|------|-----|--------|
| Server root | `--url` | `PLANE_URL` | `[defaults] url` |
| API key | — | `PLANE_API_KEY` | `[auth] api_key` |
| Workspace | `--workspace` | `PLANE_WORKSPACE` | `[defaults] workspace` |
| Project | `--project` | — | `[defaults] project` |
| Web UI root | — | `PLANE_WEB_URL` | `[defaults] web_url` |
| rc file path | `--rc` | `PLANE_RC` | — |

**Two rc files.** `~/.planesorc` is the base and a `.planesorc` in the working
directory layers on top, key by key: a repo can set `workspace`/`project` while
the key keeps coming from the home file. Pass `--rc <path>` (or `PLANE_RC`) to
skip that search and read one file only. `check-config.js` prints which files
were merged.

A repo-local `.planesorc` sits in the working tree — keep the key in the home
file, or make sure the local one is gitignored before writing one.

**Web links.** Plane Cloud serves the API from `api.plane.so` and the UI from
`app.plane.so`, so permalinks are built against `app.plane.so` automatically. A
self-hosted instance usually serves both from one host, which is the default
there; override with `web_url` if it doesn't.

Start with `./scripts/check-config.js` — it prints the resolved URL, workspace,
and key prefix, then verifies the key by listing the workspace's projects. Run
it first whenever a call fails with a 401 or 404.

## Quick reference

| Task | Command |
|------|---------|
| Verify config and auth | `check-config.js` |
| List projects (and their UUIDs) | `list-projects.js` |
| List work items | `list-work-items.js -p WEB --group started` |
| Read one work item | `get-work-item.js WEB-123 --comments` |
| Search across the workspace | `search-work-items.js "checkout timeout"` |
| File a work item | `create-work-item.js "Title" -p WEB --priority high` |
| Update / move state | `update-work-item.js WEB-123 --state Done` |
| Read or add comments | `comment-work-item.js WEB-123 "text"` |
| States, labels, members, cycles | `list-metadata.js -p WEB` |

All scripts take `--json` for raw output and `-h` for full usage.

## Referring to things by name

Every script takes human names where the API takes UUIDs, and resolves them:

- **Projects** — identifier (`WEB`), name (`Website`), or UUID.
- **Work items** — `WEB-123`, a UUID, or a URL pasted from the browser.
- **States, labels, cycles, modules** — by name, case-insensitive.
- **Assignees** — email or display name.

Resolution costs an extra call or two and fails loudly with the list of valid
values. When a name is rejected, `list-metadata.js -p <project>` prints the
project's whole vocabulary alongside the UUIDs.

## Common workflows

### "What's on my plate?"

```bash
# Everything in flight, most recently updated first
./scripts/list-work-items.js -p WEB --group started

# Mine, unfinished
./scripts/list-work-items.js -p WEB --assignee me@example.com --group started --group unstarted

# The urgent pile across a cycle
./scripts/list-work-items.js -p WEB --cycle "Sprint 12" --priority urgent --priority high
```

State **groups** (`backlog`, `unstarted`, `started`, `completed`, `cancelled`)
are the stable way to ask this — state *names* are per-project and get renamed.

### "Show me this ticket"

```bash
./scripts/get-work-item.js WEB-123 --comments
./scripts/get-work-item.js WEB-123 --comments --activity --links
./scripts/get-work-item.js https://app.plane.so/acme/projects/<uuid>/issues/<uuid>
```

`--activity` is the field-by-field history — who changed the state, when the
priority was raised. Usually the fastest way to reconstruct how a ticket got
into its current shape.

### "Find the ticket about X"

```bash
./scripts/search-work-items.js "checkout timeout"
./scripts/search-work-items.js "checkout" -p WEB -n 50

# Advanced search also takes filters, passed through to Plane's filter set
./scripts/search-work-items.js "flaky" --filter priority=urgent
```

Search returns identifiers and names only. Feed a hit to `get-work-item.js` for
the full record.

### "File what I just found"

```bash
./scripts/create-work-item.js "Checkout times out on slow networks" \
  -p WEB --priority high --label backend --assignee me@example.com

# Longer write-ups read better from a file
./scripts/create-work-item.js "Rate limit the export endpoint" \
  -p API --description-file ./repro.md --cycle "Sprint 12"
```

Descriptions are stored as HTML; plain text is wrapped into paragraphs for you.
Pass `--html` to send markup through untouched.

### "I shipped it"

```bash
./scripts/update-work-item.js WEB-123 --state Done
./scripts/update-work-item.js WEB-123 --priority urgent --assignee me@example.com
git log -1 --format=%B | ./scripts/comment-work-item.js WEB-123 -f -
```

## Notes and gotchas

- **Filters are client-side.** The list endpoint takes no filter parameters, so
  `list-work-items.js` fetches pages and filters them locally. It only searches
  what it fetched: if a filter looks suspiciously empty on a big project, raise
  `--limit` before believing the result. `--cycle` and `--module` are the
  exception — those are separate endpoints and filter server-side.
- **Rate limit: 60 requests per minute per key.** Name resolution and `--assignee`
  filtering spend calls, so a wide sweep over several projects can hit it. A 429
  is reported with the seconds left until reset.
- **`--assignee` and `--label` replace, not append.** On update, pass every value
  you want to keep.
- **Work items, not issues.** Plane renamed issues to work items and the
  `/issues/` API paths are deprecated (support ends 31 March 2026); these scripts
  use `/work-items/` throughout. Web UI URLs still say `/issues/`, and are parsed
  as such.
- **Members may be invisible.** Listing project members needs a wider token scope
  than reading work items. When it's denied, assignees print as UUIDs instead of
  names rather than failing the command.
- **Pagination is cursor-based** (`per_page` max 100). Scripts follow cursors
  until `--limit` is met; `--limit` defaults to 50 for work items and to
  everything for projects and metadata.
