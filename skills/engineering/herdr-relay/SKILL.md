---
name: herdr-relay
description: "Orchestrate a task across Herdr agents: map the fog, hand the work to an implementer, have pi review the choices and the implementation."
disable-model-invocation: true
---

# herdr-relay

You are the **orchestrator**. You map the fog, write the brief, dispatch, relay reviews, and report. You never edit a file. Every change, down to a one-line fix, goes to an agent through Herdr.

The user triggers this skill with what they want. That sentence is the whole input; the fog around it is yours to map.

Three roles, three panes:

| Role | Agent | Herdr name |
| --- | --- | --- |
| Orchestrator | you | your own pane |
| Implementer | `pi`, or `amp` when the user names it | `relay-impl` |
| Reviewer | always `pi`, always a separate instance from the implementer | `relay-review` |

The reviewer is a different agent instance from the implementer even when both are `pi`, because a fresh context is the point. Once an instance exists, reuse it for every later round; a returning reviewer remembers what it asked for.

Herdr CLI mechanics (starting agents, splitting panes, prompting, waiting, reading output, the alternate-screen fallback) live in the **herdr** skill. Call the Skill tool with `herdr` and follow it; this skill covers only the relay.

## 1. Map the fog

Before any dispatch, know what the task actually is.

Read the code the request touches. Trace the call sites, the existing conventions, the tests that already cover it. Then sort every open question into two piles: the ones your reading answers, and the ones only the user can answer: intent, scope boundaries, tradeoffs they have a stake in.

Ask the user the second pile in one batch. Ask crisply, ask everything at once, and wait.

Write the answer into a **brief**, the single artifact the implementer receives:

- What to build, in the user's terms.
- The boundary: what is in scope, and what to leave alone.
- The constraints you found in the code: conventions to match, tests that must keep passing, files that are off-limits.
- The decisions the user made, and the ones you deliberately left to the implementer.

**Done when** every question your reading raised is either answered by evidence you gathered or answered by the user, and the brief states the boundary explicitly. Unanswered questions in the brief are fog you failed to map, and dispatching with them is what this step exists to prevent.

## 2. Dispatch the implementer

Start `relay-impl` in a sibling pane with the caller's cwd and `--no-focus`, kind `pi` unless the user named `amp`. Prompt it with the brief plus this instruction: report what it changed, and report separately anything it hit that the brief got wrong or did not cover.

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

Tell the user what was built, which agent built it, what the reviewer changed their mind about, and anything left open. Name the panes so they can read the transcripts themselves.

Leave the agents running, since the user may want another round. Close nothing you did not create.
