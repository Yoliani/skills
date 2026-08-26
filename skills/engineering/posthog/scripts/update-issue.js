#!/usr/bin/env node

// WRITE. Changes issue state in PostHog. Preview with --dry-run and get the
// user's go-ahead before running it for real.

import { requireProject, request, webUrl, parseFlags, run, die } from "../lib/api.js";

const HELP = `Usage: update-issue.js <issue-id-or-url> [options]

Change an error tracking issue's status, severity, name, or description.

WRITE: this changes PostHog. Run --dry-run first, show the user what it prints,
and wait for their go-ahead.

Options:
  --project, -p <id>     Project ID or name (default: ~/.posthogrc [defaults] project)
  --status <status>      active | resolved | suppressed
  --severity <level>     low | medium | high | critical, or "none" to clear it
  --name <text>          Issue display name
  --description <text>   Issue description
  --dry-run              Print the change without sending it
  --json                 Raw JSON output
  -h, --help             Show this help

Examples:
  update-issue.js 0193a1b2-...-c3d4 --status resolved --dry-run
  update-issue.js 0193a1b2-...-c3d4 --status resolved
  update-issue.js 0193a1b2-...-c3d4 --severity high
`;

const STATUSES = ["active", "resolved", "suppressed"];
const SEVERITIES = ["low", "medium", "high", "critical"];

run(async () => {
  const { flags, positionals } = parseFlags(process.argv.slice(2), {
    aliases: { p: "project", h: "help" },
    booleans: ["help", "json", "dry-run"],
  });
  if (flags.help) {
    console.log(HELP);
    return;
  }

  const ref = positionals[0];
  if (!ref) die("an issue ID or URL is required", "Find one with: list-issues.js");
  const id = ref.startsWith("http")
    ? (new URL(ref).pathname.match(/\/error_tracking\/([^/?#]+)/) || [])[1]
    : ref;
  if (!id) die(`could not find an issue ID in ${ref}`);

  const projectId = await requireProject(flags.project);

  const body = {};
  if (flags.status) {
    if (!STATUSES.includes(flags.status)) {
      die(`unknown status '${flags.status}'`, `Use one of: ${STATUSES.join(", ")}`);
    }
    body.status = flags.status;
  }
  if (flags.severity) {
    if (flags.severity === "none") body.severity = null;
    else if (!SEVERITIES.includes(flags.severity)) {
      die(`unknown severity '${flags.severity}'`, `Use one of: ${SEVERITIES.join(", ")}, or none`);
    } else body.severity = flags.severity;
  }
  if (flags.name !== undefined) body.name = flags.name;
  if (flags.description !== undefined) body.description = flags.description;

  if (Object.keys(body).length === 0) {
    die("nothing to change", "Pass at least one of --status, --severity, --name, --description");
  }

  const before = await request(`/projects/${projectId}/error_tracking/issues/${id}/`);

  const changes = Object.entries(body).map(
    ([key, value]) => `  ${key}: ${JSON.stringify(before?.[key] ?? null)} -> ${JSON.stringify(value)}`
  );
  console.log(`Issue ${id} (${before?.name || "unnamed"}) in project ${projectId}:`);
  console.log(changes.join("\n"));

  if (flags["dry-run"]) {
    console.log("");
    console.log("Dry run, nothing sent. Re-run without --dry-run to apply.");
    return;
  }

  const after = await request(`/projects/${projectId}/error_tracking/issues/${id}/`, {
    method: "PATCH",
    body,
  });

  if (flags.json) {
    console.log(JSON.stringify(after, null, 2));
    return;
  }

  console.log("");
  console.log(`Applied. ${webUrl(projectId, "error_tracking", id)}`);
});
