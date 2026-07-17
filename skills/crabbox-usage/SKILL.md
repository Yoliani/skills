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
Full command reference: https://crabbox.sh/commands/

## Mental model

`crabbox run` leases a machine (or reuses a warm/static one), rsyncs your tracked
files, executes the command remotely, streams output back, and releases the lease.
Every lease gets a canonical ID (`cbx_<12 hex>`) and a friendly slug
(`<adjective>-<noun>`); either works with `--id` across all commands.
Config precedence: flags > env > repo `.crabbox.yaml` > user config > defaults.

## One-shot runs

```sh
crabbox run -- pnpm test                 # lease → sync → exec → release
crabbox run --keep -- pnpm build         # keep the lease alive after the run
crabbox run --no-sync -- <cmd>           # reuse the box's tree as-is (no re-sync)
```

**Commit before running** — sync is skipped when the tree matches `HEAD`, so
uncommitted changes mean a full re-upload each run.

## Warm box loop (repeated runs)

```sh
crabbox warmup                           # provision and keep a box, prints slug
crabbox run --id swift-crab -- pnpm test:changed
crabbox ssh --id swift-crab              # interactive shell on the box
crabbox stop swift-crab                  # release it when done
```

Use `--no-sync` on polling/status runs against a box where a long process is
already going — a plain run re-syncs and can clobber in-flight work.

## Inspecting & connecting

```sh
crabbox list                 # your boxes (add --provider X to filter)
crabbox status               # system status
crabbox logs / history       # execution logs / past commands
crabbox attach               # reconnect to a running instance
crabbox watch                # monitor running processes
```

## Files, artifacts, evidence

```sh
crabbox cp <src> <dst>       # copy files to/from a box
crabbox artifacts            # manage collected artifacts (screenshots, video, JUnit)
crabbox results              # retrieve test results
crabbox sync-plan            # preview what a sync would transfer
```

## Networking, desktop, browser

```sh
crabbox ports                # port forwarding (reach the box's app locally)
crabbox open                 # launch browser session
crabbox screenshot           # capture the box's screen
crabbox vnc | webvnc         # (web) VNC into the box's desktop
crabbox desktop              # interactive desktop environment
crabbox code                 # open a code editor against the box
```

## Scale & orchestration (when needed)

`shard` (distribute tests across boxes), `prewarm`/`pool` (pre-allocated capacity),
`job` (named workflows from `.crabbox.yaml` `jobs:`), `bench`, `checkpoint`,
`pause`/`resume`, `cache` (persistent volumes for pnpm/npm/docker/git).

## Cost hygiene — always

```sh
crabbox usage                # spend by user/org/provider/server type
crabbox list                 # find forgotten boxes
crabbox stop <slug>          # release them
crabbox cleanup              # remove temporary resources
```

Leases are TTL-bounded (`lease.ttl`, `lease.idleTimeout`), but don't rely on it —
release explicitly. **Delegated providers (e.g. Daytona) have no auto-stop**;
forgotten boxes keep billing.

## Provider capability gotchas

- **SSH-lease providers** (Hetzner/AWS/Azure/GCP, static): full command surface —
  `cp`, `ports`, `screenshot`, `vnc`, artifact globs all work; no exec time cap.
- **Delegated sandboxes (Daytona)**: minimal surface — essentially only
  `warmup`/`run`/`ssh`/`stop`; no `cp`, `ports`, or preview URLs, and each
  `crabbox run` exec is capped at ~60s. Long setups must be backgrounded on the
  box and polled with `--no-sync`; pull files over `ssh`+`cat`/scp-style wrappers;
  reach the app via an SSH tunnel or an in-box browser. See the scaffolding recipe:
  https://github.com/AI-Builder-Club/skills/tree/main/skills/crabbox-setup
- Secrets reach the box only via `env.allow` (encrypted SSH), never file sync.
