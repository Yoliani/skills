---
name: crabbox-setup
description: >
  Install and configure crabbox (crabbox.sh) — the remote execution control plane
  that leases cloud machines, syncs your repo, and runs commands remotely while you
  keep the local edit-and-run loop. Covers CLI install, broker login, doctor checks,
  and scaffolding a repo-local .crabbox.yaml (provider, sync excludes, env allowlist).
  Use when the user says "set up crabbox", "install crabbox", "configure crabbox for
  this repo", or when crabbox-usage fails because crabbox is missing or unauthenticated.
user_invocable: true
---

# crabbox-setup — install & configure crabbox

Crabbox runs repo commands on remote machines (brokered cloud leases, static SSH
hosts, or delegated sandboxes like Daytona) while you edit locally; it syncs tracked
files via rsync, streams output back, and releases the lease. This skill gets a
machine + repo from zero to a passing `crabbox doctor`.

Docs: https://crabbox.sh (Command reference: /commands/, Configuration: /features/configuration.html)

## Step 1 — Install the CLI (once per machine)

```sh
brew install openclaw/tap/crabbox
crabbox --version
```

If `crabbox --version` already works, skip to Step 2.

## Step 2 — Authenticate (once per machine)

Log in against the broker to store a token in user config:

```sh
crabbox login --url <BROKER_URL>     # e.g. https://broker.example.com
crabbox whoami
```

Ask the user for their broker URL if it isn't in memory, `CRABBOX_COORDINATOR`,
or an existing config (`crabbox config show`). If they don't have a broker, crabbox
can also work in **direct SSH** mode (`static:` provider, no broker) or **delegated**
mode (e.g. Daytona) — see Step 3.

## Step 3 — Repo config: `.crabbox.yaml`

Create `.crabbox.yaml` at the repo root. Repo config should hold provider selection,
sizing, sync rules, and profiles — never secrets (those live in user config or env
vars). Minimal starting point; adapt per repo:

```yaml
provider: <aws|hetzner|gcp|azure|daytona|static|localContainer>
target: linux            # linux | macos | windows
class: standard          # standard | fast | large | beast

lease:
  idleTimeout: 30m
  ttl: 90m

sync:
  delete: true
  exclude:
    - node_modules
    - dist
    - .turbo
    - "**/.env*"

env:
  allow:                 # secrets/vars forwarded over SSH — NEVER synced as files
    - CI
    - NODE_OPTIONS
```

Notes:
- Precedence: **flags > env > repo `.crabbox.yaml` > user config > defaults**.
  Inspect the merged result with `crabbox config show`.
- A `.crabboxignore` at repo root appends to `sync.exclude`.
- Static SSH host (no cloud account needed):
  ```yaml
  static: { host: my-box.local, user: alice, port: "22", workRoot: /home/alice/crabbox }
  ```
- Provider-specific sections (`aws:`, `gcp:`, `azure:`, `proxmox:`, `daytona:`, …)
  are documented at crabbox.sh/features/configuration.html. Provider secrets go in
  env vars, not files.
- For a **per-agent isolated dev box on Daytona** (own DB + dev server + in-box
  browser, snapshot image, setup.sh, cbx.sh wrapper), follow the fuller recipe:
  https://github.com/AI-Builder-Club/skills/tree/main/skills/crabbox-setup

## Step 4 — gitignore + commit

Add crabbox runtime artifacts to `.gitignore`: `.crabbox`, `evidence/`, `.cbx-*.id`,
`.cbx-*.sandbox`. Then **commit** — crabbox only skips re-uploading when the working
tree matches `HEAD`, so uncommitted trees sync slowly every run.

## Step 5 — Verify

```sh
crabbox doctor         # validates config, broker/provider reachability, SSH keys
crabbox usage          # confirms spend tracking works (recent spend by provider)
crabbox run -- echo ok # end-to-end smoke: lease → sync → exec → release
```

`doctor` passing + the smoke run streaming `ok` back means setup is complete.
Hand off to the `crabbox-usage` skill for day-to-day workflows.

## Gotchas

- Secrets travel through `env.allow` (forwarded over encrypted SSH), never through
  file sync — keep `**/.env*` excluded.
- Repo config can select providers, images, and runtime commands: **review a
  `.crabbox.yaml` you didn't write before running crabbox in that repo.**
- Leases are TTL-bounded, but delegated providers (e.g. Daytona) may have **no
  auto-stop** — always release boxes (`crabbox stop <slug>`); find stragglers with
  `crabbox list`.
