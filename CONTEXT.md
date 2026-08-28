# Yoliani Skills

A personal collection of agent skills loaded by Claude Code, Codex, and other Agent-Skills-compatible harnesses, shipped both as a Claude Code plugin and as symlinks via `scripts/link-skills.sh`.

## Language

**Skill**:
One folder under `skills/<bucket>/<name>/` containing a `SKILL.md` (frontmatter `name` + `description`, then instructions) that a harness loads on demand.
_Avoid_: command, prompt, recipe

**Bucket**:
A category folder directly under `skills/` — `engineering/`, `productivity/`, or `personal/`. Every skill lives in exactly one bucket.
_Avoid_: category, group, folder (when the bucket is meant)

**Promoted skill**:
A skill in `engineering/` or `productivity/`. Promoted skills are listed in the top-level `README.md` and are candidates for the plugin's `skills` array. `personal/` skills are listed but not promoted.

**Harness**:
The agent runtime that loads skills — Claude Code, Codex, or anything else that reads the Agent Skills format from `~/.claude/skills` or `~/.agents/skills`.
_Avoid_: agent (when the runtime, not the model, is meant), IDE, tool

**Box**:
A crabbox-leased remote machine. A **warm box** is kept alive across runs in a session; a **one-shot run** leases, runs, and releases in a single command. The `crabbox-setup` and `crabbox-usage` skills manage them.
_Avoid_: server, VM, instance

**Effort**:
One unit of looped work — a `.agent-loop/<effort>/` directory holding a task DAG plus durable shared state. `loop-design` creates an effort; `loop-operate` walks it.
_Avoid_: project, plan, job

**Task DAG**:
The dependency graph of tasks inside an effort. A task is **ready** when all its blocking edges are resolved; operators claim ready tasks.
_Avoid_: task list, todo list, backlog

**Backend** (error tracking):
Which server the `sentry` skill talks to — `sentry` (Sentry SaaS or self-hosted) or `glitchtip`. Detected from the configured URL, overridable with `--backend`. Feature availability differs per backend.
_Avoid_: provider, instance, server (when the backend kind is meant)

**Search provider**:
Which upstream the `native-web-search` skill queries — `openai-codex`, `anthropic`, `exa`, or `nan`. The first two return a written summary from a fast model with native web search; `exa` and `nan` return ranked results over plain HTTP. Selected with `--provider`.
_Avoid_: engine, backend (which the `sentry` skill reserves for error-tracking servers)

**Work item**:
A ticket in Plane, what its UI and API v1 call an issue's successor. The `plane` skill addresses one by `PROJ-123` identifier, UUID, or browser URL, and never uses the deprecated `/issues/` API paths.
_Avoid_: issue, ticket, task (when the Plane record is meant)

**Project** (PostHog):
The numeric container the `posthog` skill queries, the ID in every PostHog UI URL after `/project/`. Distinct from a **Plane project**, which the `plane` skill addresses by identifier (`WEB`), name, or UUID.
_Avoid_: team, environment, workspace (which is Plane's outer container, not PostHog's)

**Issue** (error tracking):
A group of similar `$exception` events. The `posthog` skill reads them out of PostHog error tracking; the `sentry` skill reads them out of Sentry or GlitchTip. The two systems assign separate IDs to the same crash, so an issue is always qualified by which skill fetched it. Plane's tickets are **work items**, never issues.
_Avoid_: error, bug, exception (which is one event inside the issue, not the group)

**Write** (PostHog):
Any `posthog` script that changes PostHog: `update-flag.js`, `update-issue.js`, `annotate.js`. Every write is previewed with `--dry-run` and confirmed by the user before it is sent. Everything else in the skill reads.
_Avoid_: mutation, update (when the class of operation is meant)

**Quality gate** (SonarQube):
The pass/fail verdict the `sonarqube` skill reads for a project, plus the **conditions** behind it — one metric, comparator, and threshold each. A gate is normally written against the **new code** period rather than the whole project, so a red gate names a `new_*` metric.
_Avoid_: check, gate status, build status (which is CI's verdict, not SonarQube's)

**Measure**:
One metric's value for a SonarQube component, read by the `sonarqube` skill. A **project key** addresses the project (the `id=` in a dashboard URL), never a numeric ID, which is what distinguishes it from a **PostHog project**.
_Avoid_: metric (which is the definition, not the value), stat, KPI

**Relay**:
One `herdr-relay` run: map the fog → dispatch an implementer → review with `pi` → re-audit. The **orchestrator** never edits files; the **implementer** (`pi`, or `amp` when named) writes the code; the **reviewer** (always a separate `pi` instance) reviews the choices and the implementation.
_Avoid_: pipeline, handoff, delegation

**Brief**:
The single artifact the orchestrator hands the implementer at the end of fog-mapping: what to build, the scope boundary, the constraints found in the code, and the decisions the user made. A question left unanswered in the brief is unmapped fog.
_Avoid_: spec, plan, prompt

## Relationships

- A **Bucket** holds many **Skills**; a **Skill** may be a **Promoted skill**
- A **Harness** loads **Skills** (via plugin install or symlink)
- An **Effort** holds one **Task DAG**; `loop-operate` claims ready tasks from it
- crabbox skills lease and reuse **Boxes**; other skills may run commands on them
- A **Relay** carries one **Brief** from the orchestrator to the implementer; the reviewer reads both
- A **Project** (PostHog) holds **Issues** (error tracking), feature flags, insights, and recordings; a **Write** targets one of them

## Flagged ambiguities

- "plugin" vs "marketplace" — resolved: the **plugin** is `yoliani-skills` (defined in `.claude-plugin/plugin.json`); the **marketplace** is the repo itself (`.claude-plugin/marketplace.json`), which lists that one plugin.
- "loop" was used for both the design artifact and the act of running it — resolved: the artifact is the **Effort** (with its **Task DAG**); "the loop" refers only to `loop-operate`'s claim–execute–verify cycle.
- "project" meant two things. Resolved: a **Project** (PostHog) is a numeric analytics container; a Plane project is a ticket container inside a workspace. Qualify it whenever both skills are in play.
- "issue" meant three things. Resolved: an **Issue** (error tracking) is a PostHog or Sentry exception group, always qualified by source; Plane's records are **work items**.
- "provider" meant two things — resolved: a **Search provider** is a `native-web-search` upstream; the error-tracking server the `sentry` skill talks to is a **Backend**, never a provider.
