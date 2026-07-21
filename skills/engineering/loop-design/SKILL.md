---
name: loop-design
description: >
  Design the task DAG a work loop will walk: turn a spec, plan, or issue list
  into a `.agent-loop/<effort>/` directory holding the tasks, dependencies,
  topology decision, and durable shared state files. Use when the user asks to
  design a loop, plan or decompose work as a graph, or before dispatching
  parallel agents on a multi-task effort.
user_invocable: true
---

# loop-design — plan the task DAG the loop will walk

Agents are compute. Shared files are state. This skill produces the graph;
`loop-operate` runs the loop that works it.

## Step 0 — decide if a graph is even warranted

**Small task → no graph.** If the work is one focused change (≤ ~2 files, one
verifiable outcome), say so and run it solo. Orchestration overhead fragments
reasoning on small sequential work.

## Step 1 — gather the artifact (or grill one into existence)

Start from an existing artifact: a spec, PRD, plan, issue list, or grilling
output.

**No artifact? Grill first, graph second.** Interview the user one question at
a time until you could write the spec yourself:

- What are we building/changing, and what does "done" look like?
- Who/what is it for, and why now?
- What's explicitly out of scope?
- What constraints are non-negotiable (stack, style, deadlines, must-not-touch
  areas)?
- What's the riskiest or least-understood part?

Challenge vague answers instead of accepting them ("fast" → how fast, measured
how?). When confident (~95%), write the result to
`.agent-loop/<effort-slug>/spec.md` and get the user's sign-off before
graphing — the spec is the artifact the graph is judged against. If a
dedicated grilling/spec skill is available in the harness, invoking it is an
equally good way to run this step.

## Step 2 — interview only for the gaps

One question at a time, only for what the artifact (existing or just grilled)
doesn't answer. Skip anything Step 1 already covered. Stop when every task you
would write has an answer to all five questions — a task missing one means
keep interviewing:

1. **Decomposability** — does the work split into independent slices, or is it
   one sequential chain? (Strongest predictor of the right topology.)
2. **Dependencies** — what must finish before what? Hard blocks only, not
   preferences.
3. **File surface** — which files/dirs does each slice touch? Overlap between
   parallel tasks is how merge conflicts are born; minimize it *here*, at
   design time.
4. **Verification** — how does each task prove it's done? A task without
   acceptance criteria can't be claimed by an agent.
5. **Risk & budget** — which tasks are risky enough to need review before
   dependents start? Roughly how much time/token budget does the effort get?

## Step 3 — choose the topology

| Task structure | Topology | Why |
| --- | --- | --- |
| Sequential chain, few artifacts | **solo** — one agent walks the graph | Coordination overhead fragments sequential reasoning |
| Parallel + structured (clear slices, known shape) | **centralized** — coordinator dispatches, workers execute, coordinator merges | Lowest error amplification |
| Parallel + exploratory (open-ended, many outputs) | **decentralized** — independent agents, compare results | Diverse exploration of high-entropy work |
| Mixed | **mixed** — solo backbone, fan out only the parallel sub-sections | Best of both per section |

Cap parallel fan-out at 3–4 concurrent agents. More multiplies errors and
merge surface faster than it multiplies progress.

## Step 4 — write the graph

Create `.agent-loop/<effort-slug>/` in the repo (one directory **per effort**,
not per session — it must outlive sessions):

```
.agent-loop/<effort-slug>/
  spec.md         # the grilled spec (only if Step 1 produced one here)
  tasks.md        # the DAG: tasks, deps, status, claims
  decisions.md    # topology choice, constraints, plan versions
  feedback.md     # lessons learned mid-run (starts empty)
  log.md          # append-only: claims, completions, reorg events
```

`tasks.md` format — one entry per task:

```markdown
# Tasks: <effort name>

- plan_version: 1
- topology: centralized
- budget: <time/token guidance>

## Tasks

### T1: <short imperative title>
- status: ready            # ready | blocked | claimed | done | failed | cancelled
- blocked_by: []           # task ids; empty = no hard blocks
- files: src/checkout/**   # expected touch surface
- claimed_by: -            # <agent-id> @ <ISO timestamp>, set by operate
- acceptance: <how an agent proves this task is done>

### T2: ...
- blocked_by: [T1]
```

The inline comments are the format contract — `loop-operate` reads field
semantics from the file itself, so keep them when scaffolding.

`decisions.md` records *why*: the topology choice, the interview answers that
shaped the graph, and a dated entry per `plan_version` bump so failures are
attributable to the plan they ran under.

## Step 5 — sanity-check before handoff

- No cycles; every task reachable from the ready set.
- Ready set is non-empty (something is startable now).
- No two parallelizable tasks share a `files` surface — if they must, add a
  `blocked_by` edge to serialize them.
- Name the **critical path** (longest blocking chain) in decisions.md — it is
  the effort's minimum completion time and where escalation money goes first.

Then hand off: "graph ready at `.agent-loop/<slug>/` — run the
`loop-operate` skill to work it."
