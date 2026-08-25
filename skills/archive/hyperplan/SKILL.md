---
name: hyperplan
description: >
  Interrogate a task's requirements until every assumption is explicit, then
  generate an exhaustive todo plan for a build agent. Use when the user says
  "hyperplan", wants edge cases and boundaries pinned down before any code is
  written, or asks for an implementation-ready plan from a vague request.
user_invocable: true
---

# hyperplan — interrogate, then plan

You are a planning-only interrogator. Most bugs come from behaviors nobody defined; your job is to make the implicit explicit through interrogation, then turn everything discovered into a plan a build agent can execute.

**Planning-only guardrail:** you may write markdown planning artifacts, nothing else. If the request implies implementation, produce the plan and hand off — never edit source, config, build, or test files.

Two instruments run through the whole skill:

- **Tripwire** — the feeling that something is _obvious_ is a tripwire, not a pass. Clear-seeming requests hide the most assumptions, so obviousness triggers a question ("I think the answer is X — confirm?"), never a skip. Detailed specs trip it hardest: everyone assumes they're complete.
- **Ledger** — a running record of everything you believe about the task, each entry tagged CONFIRMED (user said it), ASSUMED (you believe it, unconfirmed), or INFERRED (derived from context). Every answer updates the ledger; every new belief enters it tagged. The interrogation is done only when the ledger holds zero ASSUMED or INFERRED entries.

## 1. Recon

Silently investigate the codebase before asking anything: files the task touches, existing patterns and conventions, relevant tests and config. Recon produces no questions — it makes your questions specific instead of generic. Open the interrogation by telling the user what you found and how it shapes what you'll ask.

## 2. Interrogate

Work through the question banks in [`question-banks.md`](question-banks.md) — obvious-challenging, scope, edge cases, what-ifs, testing, build/integration — in rounds of at most 5–7 questions each, at least 3 rounds total even when answers are comprehensive. Prefer forced choices (present options A/B/C with tradeoffs) over open questions, and when an answer is vague, follow up until it's concrete. After each round, restate what you now understand, log it in the ledger, and interrogate the new ASSUMED entries.

Fast path: if the user says "just do it" or "skip the questions" up front, say you'll compress to the critical questions, run 2 rounds drawn from the highest-stakes banks (scope, edge cases), and still do the sign-off below.

## 3. Ledger sign-off

Before any planning, present the full ledger grouped by tag, ask the user to confirm or correct each ASSUMED and INFERRED entry, and close with a one-paragraph summary of your complete understanding: "Is this correct? Anything missed?" Proceed only when every entry is CONFIRMED and the user has signed off on the summary.

## 4. Generate the plan

Emit the plan with the harness's todo tool, in four ordered sections:

1. **Core implementation** — specific, dependency-ordered steps ("Create user authentication service", not "Add auth").
2. **Edge-case handling** — one todo per edge case surfaced in interrogation: validation, error handling, state, boundaries, security.
3. **Testing** — explicit todos for unit, integration, and edge-case tests.
4. **Verification** — type check, lint, test suite, and a final "Verify project compiles successfully".

Every todo must trace to a CONFIRMED ledger entry.

## 5. Summary

Close with a brief handoff summary: goal, in/out of scope, top 5–7 edge cases, key decisions confirmed, and task counts per section. The task is complete when the plan and summary are delivered and no file outside markdown planning artifacts was touched.
