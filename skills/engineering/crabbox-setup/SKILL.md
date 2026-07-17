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

Docs: https://crabbox.sh (Getting started: /getting-started.html, CLI: /cli.html,
Configuration: /features/configuration.html, Architecture: /architecture.html)

## Step 1 — Install the CLI (once per machine)

```sh
brew install openclaw/tap/crabbox
crabbox --version
```

No brew? Signed archives for macOS/Linux/Windows:
https://github.com/openclaw/crabbox/releases

If `crabbox --version` already works, skip to Step 2.

## Step 2 — Authenticate (once per machine)

Log in against the broker to store a token in user config:

```sh
crabbox login --url <BROKER_URL>     # e.g. https://broker.example.com
crabbox whoami
```

Ask the user for their broker URL if it isn't in memory, `CRABBOX_COORDINATOR`,
or an existing config (`crabbox config show`). CI / non-browser environments:
`printf '%s' "$TOKEN" | crabbox login --url <BROKER_URL> --token-stdin`.

**A broker is optional.** Three modes:
- **Brokered** — coordinator holds provider credentials + lease state; the CLI
  still drives SSH/rsync directly to the box (AWS, Azure, GCP, Hetzner, Daytona).
- **Direct** — no broker: local cloud credentials, or a **static SSH** host
  (`static:` provider) — see Step 3. No login needed.
- **Delegated** — the provider owns sync + exec end-to-end (Daytona, e2b, Modal).

## Step 3 — Repo config: `.crabbox.yaml`

Prefer `crabbox init` — it scaffolds `.crabbox.yaml`, a GitHub Actions hydration
workflow (`.github/workflows/crabbox.yml`), and an agent skill
(`.agents/skills/crabbox/SKILL.md`); then trim to taste. Repo config holds provider
selection, sizing, sync rules, and profiles — never secrets (those live in user
config or env vars). Minimal hand-written starting point; adapt per repo:

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
  # include: [src, package.json]   # optional whitelist applied after excludes

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
crabbox sync-plan      # preview sync manifest: file count, bytes, largest files
crabbox usage          # confirms spend tracking works (recent spend by provider)
crabbox run -- echo ok # end-to-end smoke: lease → sync → exec → release
```

`sync-plan` catches sync surprises (huge untracked dirs) before the first run.

`doctor` passing + the smoke run streaming `ok` back means setup is complete.
Hand off to the `crabbox-usage` skill for day-to-day workflows.

## Gotchas

- **Profiles cannot switch hosts.** `profiles:` blocks only carry env, presets,
  doctor checks, and artifact globs — provider/`static:`/`ssh:` keys inside a
  profile are ignored. To target a second static host (e.g. a remote Mac next to
  a default Linux box), override per run with env vars or flags:
  ```sh
  CRABBOX_TARGET_OS=macos CRABBOX_STATIC_HOST=<host> CRABBOX_STATIC_USER=<user> \
  CRABBOX_STATIC_WORK_ROOT=/Users/<user>/crabbox CRABBOX_SSH_KEY=~/.ssh/<key> \
  CRABBOX_SSH_USER=<user> crabbox run -- <cmd>
  ```
  (equivalently `--target --static-host --static-user --static-work-root` flags;
  there is no `--ssh-key` flag, so the key must come via env or user config).
  Wrap this in a shell function (e.g. `crabbox-mac`) for a per-host alias.
  What profiles *are* for: per-lane `env`, `envAllow`, `presets` (named command
  templates), `doctor` tool checks, and `artifactGlobs`.
- **Boxes boot minimal by design**: a `crabbox` user, git, rsync, curl, jq —
  nothing else. Language runtimes, Docker, and dependencies are *project* setup:
  use Actions hydration (`crabbox init` scaffolds the workflow; `crabbox prewarm`
  runs it), devcontainers, Nix, or mise/asdf. Don't expect node/python on a fresh
  lease.
- Per-lease SSH keys are generated locally under
  `<user-config>/crabbox/testboxes/<lease-id>/id_ed25519`; the broker never sees
  private keys, and command I/O streams directly CLI↔box (broker is control
  plane only). User config must never hold live leases, private keys, or provider
  secrets.
- Secrets travel through `env.allow` (forwarded over encrypted SSH), never through
  file sync — keep `**/.env*` excluded.
- Repo config can select providers, images, and runtime commands: **review a
  `.crabbox.yaml` you didn't write before running crabbox in that repo.**
- Leases are TTL-bounded, but delegated providers (e.g. Daytona) may have **no
  auto-stop** — always release boxes (`crabbox stop <slug>`); find stragglers with
  `crabbox list`.
