---
name: agents-md
description: Write, audit, or rewrite AGENTS.md files. Use when the user mentions AGENTS.md or CLAUDE.md, wants agent guidance created for a repo or folder, or wants an existing guidance file audited, trimmed, or split.
---

# AGENTS.md Authoring

An AGENTS.md carries only the **delta**: what an agent needs but cannot infer from code, package files, folder names, or a quick search. Every line is a delta or it goes — the repo itself documents everything else.

## Rules

- Compressed, high-signal half-sentences over full prose — except greenfield and personal/global files, where prose may carry intent the code cannot hold yet.
- RFC2119 caps (`MUST`, `SHOULD`) only for true non-negotiables.
- Plain Markdown headings and bullets.
- Root and nested files each own their scope: a nested file holds only its local delta, and neither repeats the other.

## Workflow

1. **Scope.** Name the variant — brownfield root, nested folder, greenfield, or personal/global — and stay inside the user-requested scope. Done when variant and target path are stated.
2. **Inspect.** Read AGENTS.md files in scope plus nearest parent/child; skim README and build/package files only far enough to surface non-obvious commands, boundaries, and hazards. Ask only when the edit direction or blast radius is ambiguous.
3. **Filter.** Give every existing or candidate line a verdict: delta (keep) or inferable/filler/stale (drop). Done when no line is unjudged.
4. **Propose.** Present a compact draft or bullet-level diff — keep / remove / add — with questions only where user intent is genuinely needed. For audits, score against the rubric in [templates.md](templates.md) and lead with the score. Wait for direction; edit directly only when the user already asked for edits.
5. **Edit (on approval).** Edit the existing file rather than creating a sibling; read the matching template in [templates.md](templates.md) before drafting. Report changed paths, a one-line summary, and any decisions left to the user.
6. **Validate.** Done when every remaining line is a delta, the file fits its variant's budget, and root/nested files don't repeat each other.

## Variants

| Variant | Budget | Carries |
|---|---|---|
| Brownfield root | ~20 lines | direction not in code, non-negotiables, verification exceptions, architecture seams, skill/doc routing |
| Nested folder | 1–10 lines | ownership, API boundary, traps, load-X-first pointers |
| Greenfield | prose OK, longer OK | mission, product taste, anti-goals the code can't express yet |
| Personal/global | longer OK | communication, workflow, approval boundaries, memory |

Over budget: trim hard. Over ~100 lines: that's docs/spec/runbook material — link it, don't inline it.

## Compression moves

- Replace "always be careful"-style vagueness with the one specific forbidden action.
- Replace copied docs with a pointer plus the decision rule for when to follow it.
- Move folder-local edge cases into that folder's nested AGENTS.md.
