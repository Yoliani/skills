---
name: loop-operate
description: >
  Run the work loop over an existing `.agent-loop/<effort>/` task DAG: claim
  ready tasks, execute, verify, update shared state, and react to runtime
  reorg triggers. Use when the user asks to run, work, or continue a loop or
  graph, to keep looping, or to claim ready tasks. If no graph exists, run
  the loop-design skill first.
user_invocable: true
---

# loop-operate — run the work loop over the task DAG

Prerequisite: `.agent-loop/<effort-slug>/` exists (otherwise →
`loop-design` skill). The graph outlives sessions; a session is just one
pass of the loop that claims work, does it, and leaves the state better
documented.

## The loop (every agent, every substrate)

1. **Read state first**: `decisions.md` (topology, constraints, plan version)
   and `feedback.md` (lessons from earlier runs — reading them before claiming
   is what stops repeat mistakes).
2. **Compute the ready set**: tasks with `status: ready` whose `blocked_by`
   are all `done`, and that are unclaimed or hold a stale claim.
3. **Claim**: set `claimed_by: <agent-id> @ <ISO timestamp>` in `tasks.md` and
   append a claim line to `log.md`. One task per claim. If the claim was
   already taken when you re-read the file, pick another task.
4. **Execute** within the task's declared `files` surface. Touching files
   outside it risks colliding with a parallel agent — if you must, log it and
   check no active claim covers those files.
5. **Verify** against the task's `acceptance` line. No acceptance pass, no
   `done`.
6. **Update state**: mark `done` (or `failed` with a one-line cause) in
   `tasks.md`, append to `log.md`, and write any lesson (correction, gotcha,
   standard) into `feedback.md` — that's how runs compound.
7. **Check the trigger table** (below), then loop back to step 2.

The loop ends only when the ready set is empty — either the effort is done
(→ Finishing an effort) or everything left is blocked, which is itself a
trigger-table situation.

`log.md` is append-only. Long-running tasks should append a progress line at
least every ~15 min — that heartbeat is what distinguishes "working" from
"stalled" for other agents.

## Runtime reorg triggers

Check after every task completion/failure and before every new claim:

| Trigger | Signal | Response |
| --- | --- | --- |
| **2× failed fix** | Same task failed twice | Stop retrying. Escalate: stronger model, different approach, or ask the user. Log the escalation. |
| **Failure cluster** | ≥2 tasks failing in one area | Stop dispatching into that area. Insert a review/root-cause task that blocks the cluster. |
| **Budget > progress** | Time/tokens burning, completions not landing | Collapse fan-out: finish in-flight claims, then go solo-sequential on the critical path. |
| **Small remainder** | Few small tasks left | Drop orchestration; one agent finishes the graph solo. |
| **Merge conflict** | Parallel agents collided on files | Serialize: add a `blocked_by` edge between the offenders, resolve, note the missed overlap in decisions.md. |
| **Stale graph** | Reality diverged from plan (task obsolete, new work discovered) | Replan: edit the graph, bump `plan_version`, add a dated decisions.md entry explaining what changed and why. |
| **Claimed but stalled** | Claim older than 30 min with no log heartbeat | Treat the claim as stale and reclaim. Log the takeover. |
| **Spinning** | Same action/error ~3× with no new information | Break out: mark the attempt in log.md, change approach or escalate per the 2×-fix rule. Never silently retry a fourth time. |

## Substrate adapters

**Solo walk** (default, any harness): one agent runs the loop sequentially,
claiming the next ready task each iteration — across as many sessions as it
takes. Claims still get written; a future parallel run depends on them.

**Subagents** (centralized topology; any harness that can dispatch
background subagents, e.g. Claude Code's Agent tool): the session acts as
coordinator. Dispatch one background subagent per ready task (cap 3–4
concurrent), each prompt containing: effort path, task id, its `files`
surface, the acceptance line, and "run the loop-operate loop".
Coordinator merges results, updates the graph, and owns the trigger table —
workers report, the coordinator reorganizes.

**Orca worktrees** (parallel work touching overlapping infra): spawn one
worktree agent per ready task via the orca-cli skill so each works an isolated
copy; merge branches sequentially on completion. The shared `.agent-loop/`
state lives on the main branch — coordinator applies graph updates there on
each merge.

## Finishing an effort

When all tasks are `done`/`cancelled`: summarize outcomes in decisions.md,
tell the user, and ask whether to archive or delete `.agent-loop/<slug>/`.
Lessons in `feedback.md` that apply beyond this effort belong in the repo's
agent guidance file (AGENTS.md or CLAUDE.md) / docs — promote them before
archiving.
