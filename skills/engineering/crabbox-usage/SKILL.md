---
name: crabbox-usage
description: >
  Day-to-day crabbox workflows: one-shot remote runs, warm boxes for repeated runs,
  SSH/attach, file copy, artifacts, port forwarding, screenshots/VNC, and cost
  hygiene. Use when the user says "run this on crabbox", "run tests remotely",
  "warm up a box", "ssh into the box", "pull artifacts off the box", or any
  crabbox command question. If crabbox is missing or unauthenticated, run the
  crabbox-setup skill first.
user_invocable: true
---

# crabbox-usage — run work on remote boxes

Prerequisite: `crabbox doctor` passes (otherwise → `crabbox-setup` skill).
Full command reference: https://crabbox.sh/cli.html (architecture: /architecture.html,
broker/teams: /orchestrator.html)

## Mental model

`crabbox run` leases a machine (or reuses a warm/static one), rsyncs your tracked
files, executes the command remotely, streams output back, and releases the lease
(unless `--keep`). Every lease gets a canonical ID (`cbx_<12 hex>`) and a friendly
slug (`<adjective>-<noun>`); either works with `--id` across all commands. Each
run also gets a `run_<hex>` record (see `history`) for logs/events/results.
Config precedence: flags > env > repo `.crabbox.yaml` > user config > defaults.

Lease expiry: `expiresAt = min(createdAt + ttl, lastTouchedAt + idleTimeout)`
(defaults 90m TTL / 30m idle). The CLI heartbeats while a command runs, so long
runs don't idle out; an *idle warm box* does. Override per lease:
`crabbox warmup --ttl 8h --idle-timeout 4h`.

Sync is smart: git-seeds the base tree remotely, rsyncs only the diff, and skips
entirely when local/remote fingerprints match — another reason to commit first.

## One-shot runs

```sh
crabbox run -- pnpm test                 # lease → sync → exec → release
crabbox run --keep -- pnpm build         # keep the lease alive after the run
crabbox run --no-sync -- <cmd>           # reuse the box's tree as-is (no re-sync)
crabbox run --provider aws --class beast -- pnpm test   # per-run overrides
```

**Commit before running** — sync is skipped when the tree matches `HEAD`, so
uncommitted changes mean a full re-upload each run.

## Warm box loop (repeated runs)

```sh
crabbox warmup                           # provision and keep a box, prints slug
crabbox run --id swift-crab -- pnpm test:changed
crabbox watch --id swift-crab -- pnpm test:changed   # auto re-run on file change
crabbox connect --id swift-crab          # interactive shell on the box
crabbox stop swift-crab                  # release it when done
```

Interactive shell: use **`connect`**. `crabbox ssh` does *not* attach — it only
prints the fully-quoted ssh command (useful for scripts/scp; `eval "$(...)"` it
to get a shell). The synced repo lives under `<workRoot>/<lease>/<repo>` on the
box, not in `$HOME` — `cd` there.

UI-capable boxes: `crabbox warmup --desktop --browser --code`, then
`crabbox vnc --id <slug> --open` (or `webvnc`) and `crabbox code --id <slug>`.

Use `--no-sync` on polling/status runs against a box where a long process is
already going — a plain run re-syncs and can clobber in-flight work.

## Inspecting & connecting

```sh
crabbox list                     # your boxes (add --provider X to filter)
crabbox status --id <slug>       # lease state; --wait blocks until ready
crabbox inspect --id <slug>      # lease/provider details; --json for scripts
crabbox history                  # recorded runs → run_<hex> ids
crabbox logs <run-id>            # retained output of a past run
crabbox events <run-id>          # phase-tagged event stream (sync, exec, release)
crabbox attach <run-id>          # follow events of a run still in flight
crabbox results <run-id>         # parsed JUnit summaries
```

## Files, artifacts, evidence

```sh
crabbox artifacts collect|pull|list|publish  # QA artifacts (screenshots, video, JUnit)
crabbox sync-plan            # preview what a sync would transfer (size hotspots)
crabbox cp <src> <dst>       # delegated sandboxes ONLY — for SSH boxes use
                             # scp/rsync built from `crabbox ssh` output
crabbox verify               # verify a signed run receipt
```

## Networking, desktop, browser

```sh
crabbox ports                # publish/list/unpublish provider-native ports
crabbox egress               # bridge lease browser/app traffic through this machine
crabbox screenshot           # capture a PNG from a desktop lease
crabbox vnc --open | webvnc  # (web) VNC into the box's desktop
crabbox desktop              # launch apps into a visible desktop session
crabbox code                 # bridge a code-server lease into the web portal
```

## Scale & orchestration (when needed)

`checkpoint` (snapshot/restore/fork a workspace) + `shard --from <checkpoint>
--count <n> -- <cmd>` (parallel test shards, merged results), `prewarm`/`pool`
(hydrated ready capacity), `actions` (hydrate a box from GitHub Actions
workflows — how deps/runtimes get onto minimal boxes), `job run <name>` (named
workflows from `.crabbox.yaml` `jobs:`), `bench`, `pause`/`resume` (free compute,
keep state), `cache` (persistent volumes for pnpm/npm/docker/git).

## Cost hygiene — always

```sh
crabbox usage                # spend by user/org/provider/server type
                             # scopes: --scope user|org|all, --month YYYY-MM
crabbox list                 # find forgotten boxes
crabbox stop <slug>          # release them (idempotent — safe to repeat)
crabbox pause <slug>         # long gap but state worth keeping? pause > keep
crabbox cleanup --dry-run    # preview orphan sweep, then run without --dry-run
```

`cleanup` is direct-provider only — it refuses to run when a coordinator/broker
manages the leases (the broker's own reaper handles those).

Leases are TTL-bounded (`lease.ttl`, `lease.idleTimeout`), but don't rely on it —
release explicitly. **Delegated providers (e.g. Daytona) have no auto-stop**;
forgotten boxes keep billing.

## Provider capability gotchas

- **SSH-lease providers** (Hetzner/AWS/Azure/GCP, static): full command surface —
  `ports`, `screenshot`, `vnc`, artifact globs all work; no exec time cap. File
  copy: scp/rsync using the connection `crabbox ssh` prints (`cp` is not for these).
- **Delegated sandboxes (Daytona)**: minimal surface — essentially only
  `warmup`/`run`/`ssh`/`cp`/`stop`; no `ports` or preview URLs, and each
  `crabbox run` exec is capped at ~60s. Long setups must be backgrounded on the
  box and polled with `--no-sync`; pull files over `ssh`+`cat`/scp-style wrappers;
  reach the app via an SSH tunnel or an in-box browser. See the scaffolding recipe:
  https://github.com/AI-Builder-Club/skills/tree/main/skills/crabbox-setup
- Secrets reach the box only via `env.allow` (encrypted SSH), never file sync.
