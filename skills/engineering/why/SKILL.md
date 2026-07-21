---
name: why
description: >
  Investigate why code is the way it is: "why does X work this way", "why did
  we pick Y over Z", "where did this threshold come from", design rationale,
  regressions, postmortem archaeology. Fans investigators out across every
  available evidence source (source control, tickets, docs, chat,
  observability, error tracking, analytics warehouse) and returns a cited,
  confidence-calibrated read on decisions and tradeoffs. For what the code
  does at runtime, use a `how`-style skill instead; this one recovers intent.
user_invocable: true
---

# why — code archaeology

Recover the forces that shaped code: the motivating edge cases, the product and
operational constraints, the alternatives that were rejected. Historical
context scatters across seven evidence categories, and you cannot predict from
the question alone which one holds the answer — so query **every available
category in parallel** and synthesize with explicit confidence calibration. A
null result from a searched category is first-class evidence about how the
decision was made; the default is coverage, not minimalism.

## Epistemics

You are assembling a patchwork understanding from fragmentary records: tickets
go stale, threads get deleted, commit messages lie, authors change their minds
between the PR description and the diff, or leave the company. The product is
calibrated evidence the user can verify and triangulate — a plausible story
recruited from thin evidence is the exact failure this skill exists to
prevent. Collect the pieces first, then see what story they support.

- **Cite everything.** Every claim about intent references a specific commit
  hash, PR number, ticket ID, doc URL, chat permalink, or code comment. An
  uncited claim is inference and gets labeled as such.
- **Hedge to match the evidence.** Reserve confident language ("because") for
  direct, explicit evidence; use "appears to", "likely", "suggests" for
  indirect. A reader should be able to follow any claim to its source and
  verify it in under a minute.
- **Surface contradictions and rival hypotheses.** When sources disagree or
  the evidence fits several stories, show all of them with the evidence for
  each, and let the user triangulate.
- **Name the gaps.** A cold thread, an unsearchable source, an unanswered
  question — document each specifically. An honest "we couldn't find out why"
  beats an authoritative-sounding guess.
- **Motivation lives outside the code.** "Checks for null because nulls occur"
  is mechanics, not motivation; intent needs an external source (PR thread,
  ticket, doc, chat, comment) behind it, or it is labeled inference. Code that
  makes sense today may have been written for reasons that no longer apply —
  resist retrofitting intent, and trace back past the most recent commit: the
  current shape is usually an accretion of earlier decisions.
- **Treat the user's own guess as a hypothesis.** If they suggest a reason
  ("I assume this is for performance?"), check it against the evidence
  independently like any other candidate.

`references/epistemics.md` holds the full confidence framework and phrasing
guide. The synthesizer must follow it.

## Step 1 — Pin the target and the question

The **target** is a chunk of code, a pattern, a feature, or a named design
decision. The **question** is usually one of: design rationale, tradeoff or
alternatives, motivating edge cases, external forcing function
(product/business/compliance), dead-code territory, or a broad historical
sweep.

If the target is vague ("why do we do it this way?" with no referent), take
your best guess from conversation context — recently discussed or edited
files, what was just on screen — state your interpretation in one line so the
user can redirect, then proceed.

Done when you can name the target in one sentence and classify the question.

## Step 2 — Build the code anchor

Anchor the investigation in concrete code before fanning out. Build this
inline — it's cheap, and every investigator needs it:

```bash
# Blame target lines for last-touch commits
git blame -L <start>,<end> <file>

# Full file history, with patches, through renames
git log --follow -p -- <file>

# Last N commits touching the file, PR numbers visible in subjects (#1234)
git log --oneline -20 -- <file>

# Full message of a commit (linked tickets, PR refs)
git log -1 --format=%B <commit>
```

Pull PR bodies and discussion for substantive commits:

```bash
gh pr view <number> --json title,body,author,createdAt,mergedAt,labels,closingIssuesReferences,comments,reviews
```

Done when the anchor lists: file paths and line ranges, key symbols, the
recent commits touching the target, PR numbers, and any linked ticket IDs.
Pass it to every investigator so none rediscovers it.

## Step 3 — Fan out investigators

### Discovery

Enumerate the tools and MCP servers available in your environment and map
each to one of the seven evidence categories below, using server names,
instructions, tool names, and resource descriptors. Source control is always
available through `git` and `gh`. If a server fits more than one category,
assign it by its primary evidence and record the ambiguity in the coverage
map.

1. **Source control** — git history, PRs, code comments, tests. Always
   available; the most trustworthy source because it ties directly to the
   diff that shipped. Surfaces implementation-time rationale: PR descriptions,
   review debates, test names encoding motivating edge cases.
2. **Issue / ticket tracker** (Linear, Jira, GitHub Issues, …) — surfaces the
   product or business forcing function: customer requests, compliance
   deadlines, parent-initiative framing, motivation labels.
3. **Long-form documents** (Notion, Confluence, Google Docs, …) — surfaces
   written-out design rationale: PRDs, RFCs, ADRs, "alternatives considered"
   sections, postmortem action items.
4. **Real-time team chat** (Slack, Discord, Teams, …) — surfaces deliberation
   that never reached a doc: incident fire-drills, author–reviewer Q&A,
   casual "we decided X because Y" threads. Vital when the paper trail is
   thin.
5. **Infrastructure observability** (Datadog, Grafana, Honeycomb, …) —
   surfaces the runtime reality that motivated the code: monitor thresholds
   matching code constants, metric spikes just before the merge, incident
   timelines. Strongest for timeouts, retries, rate limits, circuit breakers.
6. **Error / exception tracking** (Sentry, Rollbar, …) — surfaces the
   specific exceptions that motivated defensive code: stack traces through
   the target, issues whose first-seen/last-seen bracket the ship date,
   errors stopping at a release.
7. **Product analytics warehouse** (Snowflake, BigQuery, Databricks, …) —
   surfaces user-behavior and data reality: usage ramps proving a launch,
   experiment/flag exposure, pre-ship distributions revealing where a
   threshold constant came from.

### Spawning

Launch one investigator subagent per category that has a matching tool, all
in a single message so they run concurrently. One investigator per category —
each system has its own query vocabulary, result shape, and pitfalls, and
pooling them dilutes specialization and blurs the coverage map. Give each
investigator full tool access, MCP tools included: a restricted or read-only
agent mode that strips MCP access disables the investigator outright.
Investigators are read-only by posture — they investigate and report, writing
nothing.

Each investigator gets:

1. The base prompt from `references/investigator-prompt.md`
2. Its category playbook from `references/sources/` (see
   `references/source-playbook.md` for the index), adapted to the tool
   actually available
3. `references/sources/incident-postmortem.md` as well, if the target looks
   defensive (null checks, retries, timeouts, rate limits, feature flags,
   OOM handlers)
4. The code anchor from Step 2
5. The user's original question

If your harness has no subagents, work the categories yourself in sequence
using the same playbooks, and keep the same coverage map.

### Skipping a category

Skip only with a written justification that lands in "Sources Consulted",
and only for one of two reasons:

- **No matching tool exists** in this environment. Record it as a gap:
  "Real-time chat skipped — no matching tool, so the conversational record
  was not searchable."
- **The category is provably irrelevant** — a high bar. "Error tracking
  skipped — target is a build-time script with no runtime code path"
  qualifies; "probably not relevant" does not. When in doubt, run the search
  and let the null result speak: an empty investigator costs one subagent,
  while a missed design doc costs a wrong answer.

If a single-commit trivial target's PR description already contains the
complete answer, you may answer inline — only after confirming every
available category search would be redundant, and saying so explicitly. Rare.

Done when the coverage map accounts for all seven categories, each marked
queried-with-findings, queried-null, or skipped-with-reason.

## Step 4 — Synthesize

Spawn one synthesizer subagent on the most capable model available, with the
same full tool access (its quality check spot-verifies citations, which can
require the same tools the investigators used). It gets:

1. All investigator findings, including null results and justified skips
2. The code anchor from Step 2
3. The user's original question
4. `references/epistemics.md`
5. The prompt template from `references/synthesizer-prompt.md`

Its product: a confidence-weighted, evidence-cited narrative with cleanly
separated "what we know" and "what we're inferring", plus the gaps and null
results.

## Step 5 — Present

Present the synthesizer's output. Light edits for clarity or conversational
context are fine; the confidence language stays verbatim — the epistemic
framing *is* the product, and smoothing the hedges away recreates the exact
failure this skill prevents.

## Output format

Keep the confidence separation intact:

- **The Question** — restated concisely.
- **The Code in Question** — paths, line ranges, key symbols; one or two
  lines.
- **What We Found (direct evidence)** — cited claims only (PR #, ticket ID,
  doc URL, permalink, commit hash, `file:line` comment), quoting or
  paraphrasing the source.
- **What We Can Reasonably Infer** — hedged claims with the inference chain
  spelled out: "Given A and B, likely C."
- **Competing Hypotheses** — when the record supports several stories:
  each with its evidence for and against, no forced winner. Omit when the
  answer is clear.
- **What We Don't Know** — specific gaps: "searched the tracker for 'rate
  limit', no ticket discusses this threshold" beats "we don't know why."
- **Sources Consulted** — one line per category:
  `- <Source>: <what was searched>. <what was found | "no relevant results" | "skipped — reason">.`

  - Source control (git/gh): `git log --follow backend/retry.ts`, PRs #49074,
    #47812. PR #49074 introduced exponential backoff, linked ENG-4421.
  - Long-form docs (Notion): searched "retry policy", "ENG-4421". No relevant
    results.
  - Real-time chat: skipped — no matching tool available; conversational
    record not searched.

If the question is a precursor to changing the code, close by converting the
findings into a Preserve / Change / Avoid / Risk constraint set for planning
the change.

## Reference files

- `references/epistemics.md` — confidence tiers and phrasing guide; binding
  on the synthesizer.
- `references/investigator-prompt.md` — base prompt for investigators.
- `references/source-playbook.md` — index of the category playbooks.
- `references/sources/*.md` — one example playbook per category, plus the
  cross-cutting `incident-postmortem.md`. Adapt each to the tool actually
  available.
- `references/synthesizer-prompt.md` — synthesizer prompt, including the
  output format.
