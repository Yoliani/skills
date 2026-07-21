# Skills

A personal collection of [Agent Skills](https://code.claude.com/docs/en/skills) — reusable instructions that teach coding agents (Claude Code, Codex, and other Agent Skills–compatible harnesses) how to do specific tasks.

Inspired by [Matt Pocock](https://www.aihero.dev)'s [skills](https://github.com/mattpocock/skills) and his "AI Builder" way of working: plug-and-play skills for real engineering, not vibe coding.

Each skill lives in its own folder under `skills/` with a `SKILL.md` that the agent loads on demand.

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

## Reference

### Engineering

Skills for daily code work.

- **[crabbox-setup](./skills/engineering/crabbox-setup/SKILL.md)** — Install and configure [crabbox](https://crabbox.sh), the remote execution control plane that leases cloud machines, syncs your repo, and runs commands remotely. Covers CLI install, broker login, doctor checks, and scaffolding a repo-local `.crabbox.yaml`.
- **[crabbox-usage](./skills/engineering/crabbox-usage/SKILL.md)** — Day-to-day crabbox workflows: one-shot remote runs, warm boxes for repeated runs, SSH/attach, file copy, artifacts, port forwarding, screenshots/VNC, and cost hygiene.
- **[agents-md](./skills/engineering/agents-md/SKILL.md)** — Write, audit, or rewrite `AGENTS.md` files so they carry only what an agent can't infer from the repo.
- **[loop-design](./skills/engineering/loop-design/SKILL.md)** — Design the task DAG a work loop will walk: turn a spec, plan, or issue list into a `.agent-loop/<effort>/` directory with tasks, dependencies, topology decision, and durable shared state files.
- **[loop-operate](./skills/engineering/loop-operate/SKILL.md)** — Run the work loop over an existing `.agent-loop/` task DAG: claim ready tasks, execute, verify, update shared state, and react to runtime reorg triggers.
- **[why](./skills/engineering/why/SKILL.md)** — Code archaeology: recover the design rationale behind code by fanning investigators out across every available evidence source (source control, tickets, docs, chat, observability, error tracking, analytics) and returning a cited, confidence-calibrated read.

### Productivity

General workflow tools, not code-specific.

- **[hyperplan](./skills/productivity/hyperplan/SKILL.md)** — Interrogate a task's requirements until every assumption is explicit, then generate an implementation-ready plan for a build agent.
- **[show-me-your-work](./skills/productivity/show-me-your-work/SKILL.md)** — Keep a reviewable decision trail for long-running or unattended work: a TSV log with one row per decision (what, why, evidence, result).

### Personal

Tied to my own setup and voice.

- **[unslop](./skills/personal/unslop/SKILL.md)** — Remove AI tells from prose and restore human voice, preserving meaning and intended tone.
- **[pixel-art-creator](./skills/personal/pixel-art-creator/SKILL.md)** — Create new pixel art sprites from scratch: canvas, layers, and basic drawing primitives.
- **[pixel-art-animator](./skills/personal/pixel-art-animator/SKILL.md)** — Build sprite animations with frames, animation tags, and onion skinning.
- **[pixel-art-professional](./skills/personal/pixel-art-professional/SKILL.md)** — Apply advanced techniques: dithering, palette optimization, anti-aliasing, outlining.
- **[pixel-art-exporter](./skills/personal/pixel-art-exporter/SKILL.md)** — Export sprites to PNG, GIF, or spritesheets with JSON metadata for game engines.

The four `pixel-art-*` skills are copied from [willibrandon/pixel-plugin](https://github.com/willibrandon/pixel-plugin) (MIT) and require its Aseprite MCP server to be configured.
