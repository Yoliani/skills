# Variant templates and audit rubric

## Audit rubric (/20)

1. Local specificity /5 — unique to this repo, folder, or person.
2. Actionability /5 — commands, paths, boundaries, forbidden moves, or clear intent.
3. Non-verbosity /4 — compact rules; prose only where it carries intent.
4. Source-of-truth hygiene /3 — points at docs/code instead of duplicating them.
5. Scope fit /3 — content matches the variant.

## Templates

Pick the one matching the variant named in step 1. Every filled-in line must still pass the delta test.

### Brownfield root

```md
# AGENTS.md

- <Non-obvious project direction or current migration state>.
- <MUST/SHOULD non-negotiable agents are likely to violate>.
- <Verification exception: command, when to run, or what not to run>.
- <Architecture seam: use X, go through Y>.
- <Nested AGENTS / skill / doc routing if relevant>.
```

### Nested folder

```md
# <Folder/module> rules

- This folder owns <specific responsibility>.
- Public access goes through <path/import/API>.
- Keep internal imports/changes inside <boundary>.
- <Wrong concern> lives in <correct place>, not here.
- Load/read <skill/doc> before changing <area>.
```

### Greenfield

A founder/developer braindump is valid when it carries mission, product taste, anti-goals, and direction the codebase cannot contain yet. Generic corporate inspiration is not a delta.

```md
# AGENTS.md

This project is early. <Mission / product taste / what this should become>.

- Optimize for <goal> over <non-goal>.
- Avoid <premature complexity> until repeated patterns appear.
- <What "good" feels like>.
- <What not to waste time on yet>.
- <Known starting paths, if any>.
```

### Personal/global

May include communication style, permission boundaries, memory, collaboration preferences, and identity. Personal guidance stays in the personal file — project repos get their own deltas.

```md
# Personal agent guidance

## Communication
- <How to answer this user.>

## Workflow
- <How to plan, ask, commit, finish.>

## Boundaries
- <What requires explicit approval.>

## Memory / continuity
- <What to remember and where.>
```
