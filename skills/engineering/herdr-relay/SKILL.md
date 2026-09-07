---
name: herdr-relay
description: "Orchestrate a task across Herdr agents: map the fog, hand the work to an implementer, have pi review the choices and the implementation. Routes each piece of work to a Herdr pane, a subagent, or a dispatched session."
disable-model-invocation: true
---

# herdr-relay

You are the **orchestrator**. You map the fog, write the brief, dispatch, relay reviews, and report. You never edit a file. Every change, down to a one-line fix, goes to an agent.

The user triggers this skill with what they want. That sentence is the whole input; the fog around it is yours to map.

Three roles:

| Role | Agent | Herdr name |
| --- | --- | --- |
| Orchestrator | you | your own pane |
| Implementer | `pi`, or `amp` when the user names it | `relay-impl` |
| Reviewer | always `pi`, always a separate instance from the implementer | `relay-review` |

The reviewer is a different agent instance from the implementer even when both are `pi`, because a fresh context is the point. Once an instance exists, reuse it for every later round; a returning reviewer remembers what it asked for.

Herdr CLI mechanics (starting agents, splitting panes, prompting, waiting, reading output, the alternate-screen fallback) live in the **herdr** skill. Call the Skill tool with `herdr` and follow it; this skill covers only the relay.

## 0. Check what you can dispatch with

You may be running as Claude Code, or as `amp`, `pi`, or `omp`. Only Herdr panes work everywhere. Establish your capabilities before you plan the run:

- **Herdr panes**: always available inside Herdr. Confirm with `test "${HERDR_ENV:-}" = 1`. If that fails, say you are not inside Herdr and stop.
- **Subagents**: you have the `Agent` tool.
- **Dispatched sessions**: `claude --bg` is on `PATH`.
- **Cross-session messaging**: you have `ListAgents` and `SendMessage`.

If you only have Herdr panes, run the whole relay through panes. Every step below is written so the pane path is complete on its own; the other mechanisms are shortcuts, never requirements.

When you do have messaging, run `ListAgents` once now and keep your own session name (the first line names it). Anything you dispatch needs that name to report back to you.

## Pick the dispatch mechanism

Route by what the work needs, not by what is fanciest:

| The work is | Use | Because |
| --- | --- | --- |
| The implementer or the reviewer | **Herdr pane** | The user watches it, you reuse the same instance across rounds, and it works under any orchestrator |
| Read-only fan-out while you map the fog: trace call sites, find the tests, survey conventions | **Subagent** (`Agent` tool) | Ephemeral, parallelizable, and the file dumps stay out of your context |
| Genuinely independent work running alongside the relay, where you want status rather than a transcript | **Dispatched session** (`claude --bg`) | Outlives the relay and reports back over `SendMessage` |
| Anything a workflow would cover | Do not | Only if the user asks for a workflow by name |

Never make a subagent or a dispatched session the implementer or the reviewer. A subagent dies with its report, so it cannot take round two, and neither one shows the user a transcript they can read.

Pass model and effort to match the work: `--model claude-fable-5-1|claude-opus-5|claude-sonnet-5 --effort low|medium|high` for `claude --bg`, the `model` parameter for a subagent.

### Dispatched sessions in the relay's workspace

Start `claude --bg` from a Herdr pane so it inherits the caller's cwd and lands in the same repo as the relay. It prints an id. To make it visible to the user, run `claude attach <id>` in a sibling pane; to keep it headless, read it with `claude logs <id>`.

### Message-back protocol

Everything you dispatch reports to **you**, never to the user. Put this in every dispatch prompt:

> Report back to the orchestrator session `<your session name>` with `SendMessage`. Do not address the user. Message immediately if you hit a breaking change, a decision that affects other work, or a question you cannot answer from the repo. Otherwise message once when you are done.

For Herdr panes there is no push channel: you pull with `herdr agent prompt <name> ... --wait` and `herdr agent read <name>`. A settled `blocked` state is the pane's version of a question: read it with `agent read`, and if it is an approval or question dialog, take it to the user before answering; `agent prompt` will refuse the pane with `agent_blocked` until it is cleared. If a prompt returns `timeout` or `agent_prompt_stalled`, read the pane before sending anything again; the prompt may already have landed.

A dispatched session that asks *you* a question you cannot answer from the repo is fog. Take it to the user under step 1's rules; do not let the dispatched session go around you.

## 1. Map the fog

Before any dispatch, know what the task actually is.

Read the code the request touches. Trace the call sites, the existing conventions, the tests that already cover it. When that reading spans several modules or naming conventions, fan it out across subagents and keep only their conclusions. Then sort every open question into two piles: the ones your reading answers, and the ones only the user can answer: intent, scope boundaries, tradeoffs they have a stake in.

Ask the user the second pile in one batch. Ask crisply, ask everything at once, and wait.

Write the answer into a **brief**, the single artifact the implementer receives:

- What to build, in the user's terms.
- The boundary: what is in scope, and what to leave alone.
- The constraints you found in the code: conventions to match, tests that must keep passing, files that are off-limits.
- The decisions the user made, and the ones you deliberately left to the implementer.

**Done when** every question your reading raised is either answered by evidence you gathered or answered by the user, and the brief states the boundary explicitly. Unanswered questions in the brief are fog you failed to map, and dispatching with them is what this step exists to prevent.

## 2. Dispatch the implementer

Start `relay-impl` in a sibling pane with the caller's cwd and `--no-focus`, kind `pi` unless the user named `amp`. Prompt it with the brief, the message-back protocol, and this instruction: report what it changed, and report separately anything it hit that the brief got wrong or did not cover.

**Done when** the implementer settles and you have read its full report.

If that report says the brief was wrong or the work spills past the boundary, **stop the relay and return to step 1** with the user. Do not let the implementer renegotiate scope on its own.

## 3. Review the choices and the implementation

Start `relay-review` (`pi`, separate pane) and prompt it to review two things, named separately:

- **The choices**: was this the right approach, given the brief? Name a better one if there is one.
- **The implementation**: is the code correct, does it match the repo's conventions, does it break anything?

Give it the brief and the implementer's report. Ask for actionable findings only, each marked as blocking or not.

**Done when** you have the reviewer's findings and have classified every one as blocking or not.

## 4. Re-audit

Clean review, no blocking findings → go to step 5.

Blocking findings → send them to the existing `relay-impl` instance (reuse it, do not start a new one), then send the new diff back to the existing `relay-review` instance. That is one round.

Two rounds is the ceiling. If the review is still blocking after the second, stop and hand the user the disagreement: what the reviewer wants, what the implementer did, and your read of which is right.

If a fix reveals the brief was wrong, the rule from step 2 applies: stop and re-map the fog with the user.

**Done when** the reviewer returns no blocking findings, or you have escalated to the user.

## 5. Report

Tell the user what was built, which agent built it, what the reviewer changed their mind about, and anything left open. Name the panes so they can read the transcripts themselves, and name any dispatched session id so they can `claude attach` it.

Leave the agents running, since the user may want another round. Subagents end on their own. A dispatched session you started for this relay is yours to stop; tell the user its id and ask before you `claude stop` it. Close nothing you did not create.
