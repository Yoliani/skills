---
name: crabbox-usage
description: >
  Day-to-day crabbox workflows: one-shot remote runs, warm boxes for repeated runs,
  SSH/attach, file copy, artifacts, port forwarding, screenshots/VNC, and cost
  hygiene. Use when the user says "run this on crabbox", "run tests remotely",
  "warm up a box", "ssh into the box", "pull artifacts off the box", or any
  crabbox command question. If crabbox is missing or unauthenticated, call the
  Skill tool with `crabbox-setup` first.
user_invocable: true
---

# crabbox-usage — run work on remote boxes

Prerequisite: `crabbox doctor` passes (otherwise → call the Skill tool with
`crabbox-setup`).
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
crabbox run --preflight -- pnpm test     # report remote tool availability first
crabbox run --script ./ci/check.sh       # upload + run a standalone script
crabbox run --attest receipt.json -- pnpm test   # signed receipt (→ crabbox verify)
```

**Commit before running** — sync is skipped when the tree matches `HEAD`, so
uncommitted changes mean a full re-upload each run. Sync also **requires a Git
workspace**: non-Git workdirs fail before the lease is acquired, and native
Jujutsu workspaces are rejected (colocated Git is fine). `--no-sync` is the only
escape.

`--preflight` probes only *report* what's installed — they never install anything.
Pick probes with `--preflight-tools python,python3` or `run.preflightTools` in
config; `default` keeps the built-ins, `none` disables them.

`--attest <path>` writes an Ed25519-signed receipt even on a non-zero exit
(SSH leases use schema v2, binding outcome, command digest, timing, and log
digests). Brokered runs submit a schema v2 terminal receipt even without
`--attest`; pull it back later with `crabbox receipt <run-id>` and check it
with `crabbox verify`. `--emit-proof` still writes the older proof block.

`--script` uploads a **content-hashed standalone copy** under `.crabbox/scripts/`
on POSIX SSH leases, so `$0` points there, not into the repo. A script that reads
adjacent repo files must be invoked by its synced path instead
(`crabbox run -- ./ci/check.sh`).

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

`crabbox warmup --lease-id cbx_<12 hex>` requests a fixed, idempotent lease ID:
replaying the same create intent adopts the existing box instead of leasing a
second one, drift fails with `lease_id_conflict`, and a released ID is
single-use (direct AWS, Machine0, local-container, and coordinator leases).
Useful when an orchestrator may retry a warmup it cannot confirm.

UI-capable boxes: `crabbox warmup --desktop --browser --code`, then
`crabbox vnc --id <slug> --open` (or `webvnc`) and `crabbox code --id <slug>`.

Use `--no-sync` on polling/status runs against a box where a long process is
already going — a plain run re-syncs and can clobber in-flight work.

`--id` self-routes: `run`, `watch`, `status`, and `inspect` resolve the provider
from the local lease claim before the configured one, so reusing a box from a
different provider needs no `--provider` flag (an explicit one still wins).

## Inspecting & connecting

```sh
crabbox list                     # your boxes (add --provider X to filter)
crabbox status --id <slug>       # lease state; --wait blocks until ready
crabbox inspect --id <slug>      # lease/provider details; --json for scripts
crabbox receipt <run-id>         # retrieve + verify a stored brokered receipt
crabbox history                  # recorded runs → run_<hex> ids
crabbox logs <run-id>            # retained output of a past run
crabbox events <run-id>          # phase-tagged event stream (sync, exec, release)
crabbox attach <run-id>          # follow events of a run still in flight
crabbox results <run-id>         # parsed JUnit summaries
```

On brokered leases, `inspect --json` also reports the coordinator's cleanup
state (`cleanupStartedAt`, `cleanupError`, `cleanupRetryAt`,
`releaseDeletesServer`). Release is only confirmed-terminal when `state` is
`released`, the three cleanup fields are absent, and `releaseDeletesServer` is
omitted or `true`; an explicit `false` means the machine was kept on purpose.

## Files, artifacts, evidence

```sh
crabbox artifacts collect|pull|list|publish  # QA artifacts (screenshots, video, JUnit)
crabbox sync-plan            # preview what a sync would transfer (size hotspots)
crabbox cp <src> <dst>       # bidirectional copy over SSH leases and delegated
                             # sandboxes
crabbox verify               # verify a receipt from run --attest/--emit-proof
```

`cp` over SSH falls back to a checksummed, validated archive transfer when the
*local* rsync is missing or older than 3.4.3 (stock macOS OpenRsync qualifies).
The fallback covers POSIX operator hosts talking to native Linux or macOS leases
— not WSL2.

Run proofs record stdout/stderr capture paths and byte counts; they never embed
the captured output itself.

## Networking, desktop, browser

```sh
crabbox ports                # publish/list/unpublish provider-native ports
crabbox tunnel               # readiness-gated, loopback-only port tunnel
crabbox egress               # bridge lease browser/app traffic through this machine
crabbox screenshot           # capture a PNG from a desktop lease
crabbox vnc --open | webvnc  # (web) VNC into the box's desktop
crabbox desktop              # launch apps into a visible desktop session
crabbox code                 # bridge a code-server lease into the web portal
```

## Scale & orchestration (when needed)

`checkpoint` (snapshot/restore/fork a workspace; `create`/`fork` take `--json`
for orchestration, and `fork --lease-id` replays the same fixed lease) +
`shard --from <checkpoint> --count <n> -- <cmd>` (parallel test shards, merged
results), `prewarm`/`pool` (hydrated ready capacity; opt-in *typed* pools are
provider-scoped and image-pinned via `crabbox pool identity <key>` +
`--pool-identity-file`, currently AWS Linux only, and never fall back to legacy
capacity), `actions` (hydrate a box from GitHub Actions
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

Lost the local claim for a box you own? `crabbox stop --force --provider <p>
--id <exact-id>` recovers exactly one resource by verifying provider ownership
(or inspecting the exact coordinator lease) before the normal fenced stop. It
is recovery, not an ownership bypass: it needs both flags, refuses slugs, and
providers without a verified adoption contract reject it. `cleanup` has no
`--force`.

Cheap lanes: `--class tiny` / `--class small` for smoke checks and small repos.

Leases are TTL-bounded (`lease.ttl`, `lease.idleTimeout`), but don't rely on it:
release explicitly. Direct Daytona now maps those onto its native wall-clock TTL
and idle auto-stop (idle stop preserves the filesystem, TTL deletes the sandbox,
and `heartbeat --idle-timeout` changes the provider policy too), but other
delegated providers may not auto-stop at all and forgotten boxes keep billing.

## Provider capability gotchas

- **SSH-lease providers** (Hetzner/AWS/Azure/GCP/Machine0, static): full command
  surface: `screenshot`, `vnc`, `tunnel`, artifact globs all work, and there is
  no exec time cap. File copy: `crabbox cp` (or scp/rsync via the connection
  `crabbox ssh` prints).
- **`ports` is provider-opt-in**, and only `docker-sandbox` and `codesandbox`
  implement it. Everywhere else, reach a remote port with `crabbox tunnel`
  (loopback-only) or `crabbox egress`; providers without a native port bridge
  fail clearly rather than guessing.
- **Daytona** is an SSH-lease provider (Linux only) whose `run` is delegated to
  the toolbox APIs, so it rejects `--script`/`--script-stdin`, `--checksum`,
  `--full-resync`, `--fresh-pr`, `--env-helper`, `--capture-*`, `--download`,
  `--artifact-glob`/`--require-artifact`, `--emit-proof`, and `--stop-after`.
  `--class`/`--type` are rejected too: size the sandbox through its snapshot.
  There is no desktop, `code`, or Actions-hydration surface. Direct Linux
  leases *do* support filesystem `checkpoint` create/fork/delete (stop the
  source with `--no-reboot=false`; memory is not captured). Exec deadlines now
  follow the caller's context up to Daytona's maximum, so the old ~60s
  per-command cutoff is gone; sync and exec refresh activity every 30s so quiet
  commands do not trip idle auto-stop. Use `--sync-only` to pre-upload before a
  later run. Scaffolding recipe:
  https://github.com/AI-Builder-Club/skills/tree/main/skills/crabbox-setup
- Secrets reach the box only via `env.allow` (encrypted SSH), never file sync.
