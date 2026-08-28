---
name: sonarqube
description: "Read code quality from SonarQube Server or SonarQube Cloud over its Web API with a user token: quality gate status and the conditions behind it, coverage, duplication, technical debt and the other measures, their history, and the issues underneath. Use when a gate fails on a branch or pull request, when checking coverage or debt before merging, or when tracking a quality metric over time."
---

# SonarQube

Read a project's measures and quality gate over the Web API. Works against
SonarQube Server (self-hosted, any URL) and SonarQube Cloud
(`https://sonarcloud.io`).

Everything here reads. No script changes anything in SonarQube.

## Configuration

Everything is resolved from `~/.sonarrc`:

```ini
[auth]
token=squ_xxxxxxxxxxxx

[defaults]
url=https://sonar.example.com
project=my-project-key
# organization=my-org   # SonarQube Cloud only
```

- `token`: a **User Token** from *My Account → Security* in the SonarQube UI.
  Copy it at creation time, it is never shown again. A Project Analysis Token or
  a Global Analysis Token is write-only for the scanner and gets a 401 here.
- `url`: instance root, the host you open in the browser. Omit it for SonarQube
  Cloud (`https://sonarcloud.io`).
- `project`: the project key, the `id=` in every dashboard URL.
- `organization`: SonarQube Cloud scopes project search by organization.

A repo that already has a `sonar-project.properties` needs no config beyond the
token: `sonar.host.url`, `sonar.projectKey`, `sonar.organization`, and
`sonar.branch.name` are read straight out of it.

Layering, each file winning over the one before it: `~/.sonarrc`, then
`./.sonarrc`, then `./sonar-project.properties`. Environment beats all three,
and CLI flags beat everything. Pass `--rc <path>` (or `SONAR_RC`) to read one
file only; `check-config.js` prints which files were merged.

| Setting | Flag | Env | Config key |
|---------|------|-----|------------|
| Instance root | `--url` | `SONAR_HOST_URL` | `[defaults] url` |
| Token | n/a | `SONAR_TOKEN` | `[auth] token` |
| Project key | `--project` / `-p` | `SONAR_PROJECT_KEY` | `[defaults] project` |
| Organization | n/a | `SONAR_ORGANIZATION` | `[defaults] organization` |
| Config path | `--rc` | `SONAR_RC` | n/a |

Start with `./scripts/check-config.js` — it prints the resolved URL and defaults,
then verifies the token against the server. Run it first whenever a call fails
with an auth or 404 error.

## Quick reference

| Task | Command |
|------|---------|
| Verify config and auth | `check-config.js` |
| Gate status and failing conditions | `quality-gate.js` |
| Dashboard measures | `measures.js` |
| New code measures | `measures.js --new` |
| Worst files for one metric | `measures.js --files coverage` |
| Measures across past analyses | `history.js --since 90d` |
| Issues behind the measures | `issues.js --severity BLOCKER,CRITICAL` |
| Find a project key | `list-projects.js <search>` |
| Branches and PRs of a project | `list-projects.js --branches <key>` |
| Find a metric key | `metrics.js coverage` |

Every script takes `--json` for raw output and `-h` for its full flag list, and
every read takes `--branch <name>` or `--pr <number>` — without one, SonarQube
answers for the main branch.

## Workflows

### "Why did the quality gate fail?"

```bash
./scripts/quality-gate.js --pr 412
```

The output names each condition, the measured value, and the threshold it
missed. Take the failing `metric` key from that table into the next step; the
gate almost always fails on the **new code** period, not on the whole project.

```bash
# The issues that produced the failing metric, on new code only
./scripts/issues.js --pr 412 --new --severity BLOCKER,CRITICAL

# Or, when coverage or duplication is the failing condition, the files to fix
./scripts/measures.js --pr 412 --files new_coverage --asc
```

### "Is this branch good enough to merge?"

```bash
./scripts/quality-gate.js --branch feature/payments --exit-code
./scripts/measures.js --branch feature/payments --new
```

`--exit-code` exits 1 on a red gate, so it reads as a check rather than as prose.

### "Did coverage drop, or is this reading noise?"

```bash
./scripts/history.js --since 90d -m coverage,duplicated_lines_density
./scripts/history.js --since 90d -m sqale_index,bugs,vulnerabilities
```

One bad analysis is noise; a trend across analyses is a regression.

### "Where is the technical debt?"

```bash
./scripts/measures.js -m sqale_index,sqale_rating,code_smells
./scripts/measures.js --files sqale_index
./scripts/issues.js --type CODE_SMELL --severity CRITICAL --limit 50
```

## Notes and gotchas

- **Overall versus new code.** Every metric has a `new_*` twin measured over the
  new code period, and a gate is normally written against those. `measures.js`
  prints both columns; a blank NEW CODE cell means the server returned no period
  value, not a zero.
- **Rating values.** The API returns ratings as `1.0`–`5.0`; the scripts print
  them as the A–E of the UI. `sqale_index` and the other durations come back in
  minutes and print on SonarQube's 8-hour day.
- **Branch and PR analysis is per edition.** Branch and pull request data needs
  Developer Edition or SonarQube Cloud. On Community Edition, `--branch` and
  `--pr` return a 404, and only the main branch exists.
- **A missing measure is usually a missing analysis.** A metric with no value
  means the last scan did not compute it — no coverage report imported, no tests
  run — rather than a value of zero.
- **`issues.js` sends `componentKeys`,** which SonarQube 10.4+ marks deprecated
  in favour of `components` but still accepts, and which SonarQube Cloud still
  requires. If a server rejects it, that is the parameter to swap.
- **Security hotspots are not issues.** They live on `/api/hotspots/search` and
  never appear in `issues.js`, even though the gate condition
  `new_security_hotspots_reviewed` can be the thing that fails.
- **Two instances at once.** Keep the everyday one in `~/.sonarrc` and reach the
  other with `--url https://other.example.com` plus `SONAR_TOKEN=...`.
