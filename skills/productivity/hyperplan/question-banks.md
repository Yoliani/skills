# Question banks

Draw interrogation rounds from these banks. Every bank must contribute at least 2–3 task-relevant questions across the interrogation; a bank that seems inapplicable is a tripwire — ask why it doesn't apply.

## Challenge the obvious

- Key terms: when the user says "[term]", what exactly do they mean? Multiple interpretations — which one?
- "Add X" — where exactly? Which layer, which component?
- Approach: options A/B/C exist with these tradeoffs — which, and why?
- Conventions: the codebase uses [pattern/naming/library] for this — follow it here, or deviate?

## Scope & boundaries

- Ultimate objective; what problem, why now, what happens if we don't?
- Definitively IN scope / definitively OUT of scope / unsure?
- Completion: how do we know it's done? Acceptance criteria, minimum vs. maximum expectations?

## Edge cases

**Inputs** — empty/null, wrong types, extreme sizes, special characters/encoding, malformed, boundary values (max/min/zero/negative), missing optional fields, unexpected formats.

**Errors & failures** — what happens when X fails; retry, fail loud, or alert; cascading effects; network timeouts, rate limits, auth failures, database and third-party API failures.

**State & boundaries** — concurrency and races, transitions mid-operation, partial failures, inconsistent state, rollback, validation at boundaries.

**User experience** — cancel mid-operation, contradictory input, missing permissions, lost connection, session timeout, unauthorized access, accessibility.

**Integration & compatibility** — interaction with existing features, backward compatibility, API contracts, browser/device/version/library compatibility.

**Performance & scale** — 1 item vs. 10,000; heavy load; memory at scale; timeout thresholds; caching.

**Security** — injection and malicious input, privilege escalation, data exposure, auth edge cases, CSRF/XSS, rate-limit abuse.

## What-ifs

- What if [unexpected event / user action / dependency behavior] happens mid-execution? What if [assumption] is false?
- What if this needs 10x the data, offline support, concurrent users, internationalization?
- What would a malicious user try? What are the worst-case scenarios?

## Testing & validation

- Which test cases are critical? Which discovered edge cases get tests? Integration tests? Existing tests to update?
- How will we verify the implementation matches the requirements?

## Build & integration

- Build config changes, CI/CD impact, type checking / linting / static analysis to run, compilation verified as a final step?
