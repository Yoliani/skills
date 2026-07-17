# Skills

A personal collection of [Agent Skills](https://code.claude.com/docs/en/skills) — reusable instructions that teach coding agents (Claude Code, Codex, and other Agent Skills–compatible harnesses) how to do specific tasks.

Inspired by [Matt Pocock](https://www.aihero.dev)'s [skills](https://github.com/mattpocock/skills) and his "AI Builder" way of working: plug-and-play skills for real engineering, not vibe coding.

Each skill lives in its own folder under `skills/` with a `SKILL.md` that the agent loads on demand.

## Reference

| Skill | Category | Description |
| --- | --- | --- |
| [`crabbox-setup`](skills/engineering/crabbox-setup/SKILL.md) | Engineering | Install and configure [crabbox](https://crabbox.sh) — the remote execution control plane that leases cloud machines, syncs your repo, and runs commands remotely. Covers CLI install, broker login, doctor checks, and scaffolding a repo-local `.crabbox.yaml`. |
| [`crabbox-usage`](skills/engineering/crabbox-usage/SKILL.md) | Engineering | Day-to-day crabbox workflows: one-shot remote runs, warm boxes for repeated runs, SSH/attach, file copy, artifacts, port forwarding, screenshots/VNC, and cost hygiene. |

## Install as a Claude Code plugin

This repo is packaged as a Claude Code plugin (see `.claude-plugin/`). Add the marketplace and install:

```
/plugin marketplace add Yoliani/skills
/plugin install yoliani-skills@yoliani
```

## Install via symlinks

Symlink every skill into the local skill directories used by each agent harness:

```bash
./scripts/link-skills.sh
```

This links each skill into:

- `~/.claude/skills` — Claude Code
- `~/.agents/skills` — Codex and other Agent Skills–compatible harnesses

Because each entry is a symlink into this repo, a `git pull` is all that's needed to keep installed skills up to date.

To list every skill in the repo:

```bash
./scripts/list-skills.sh
```

## Layout

```
skills/
  engineering/   # dev & tooling skills
  personal/      # personal skills
  inprogress/    # drafts not yet ready
```
