#!/usr/bin/env node

import {
  requireProject,
  runQuery,
  webUrl,
  toDateFrom,
  formatTimestamp,
  parseFlags,
  run,
} from "../lib/api.js";
import { table, truncate } from "../lib/format.js";

const HELP = `Usage: list-issues.js [options]

List error tracking issues, newest activity first.

Options:
  --project, -p <id>    Project ID or name (default: ~/.posthogrc [defaults] project)
  --status <status>     active | resolved | suppressed | all (default: active)
  --period <range>      Time window: 24h, 7d, 30d, or an ISO date (default: 7d)
  --until <range>       End of the window (default: now)
  --search <text>       Free-text over exception type, message, and stack frames
  --sort <field>        last_seen | first_seen | occurrences | users | sessions
                        (default: last_seen)
  --asc                 Sort ascending instead of descending
  --assignee <user-id>  Only issues assigned to this user ID
  --limit, -n <count>   Issues to return (default: 25)
  --json                Raw JSON output
  -h, --help            Show this help

Examples:
  list-issues.js --period 24h
  list-issues.js --sort occurrences --period 7d -n 10
  list-issues.js --search "ConnectionResetError" --status all
`;

run(async () => {
  const { flags } = parseFlags(process.argv.slice(2), {
    aliases: { p: "project", n: "limit", h: "help" },
    booleans: ["help", "json", "asc"],
  });
  if (flags.help) {
    console.log(HELP);
    return;
  }

  const projectId = await requireProject(flags.project);
  const limit = Number(flags.limit || 25);
  const status = flags.status || "active";

  const response = await runQuery(
    projectId,
    {
      kind: "ErrorTrackingQuery",
      dateRange: { date_from: toDateFrom(flags.period || "7d"), date_to: flags.until || null },
      orderBy: flags.sort || "last_seen",
      orderDirection: flags.asc ? "ASC" : "DESC",
      volumeResolution: 0,
      status: status === "all" ? null : status,
      searchQuery: flags.search || null,
      assignee: flags.assignee ? { id: flags.assignee, type: "user" } : null,
      withAggregations: true,
      limit,
    },
    { name: `list error tracking issues (${status}, ${flags.period || "7d"})` }
  );

  const issues = response.results || [];

  if (flags.json) {
    console.log(JSON.stringify(issues, null, 2));
    return;
  }

  console.log(
    table(
      ["issue", "status", "occurrences", "users", "last seen", "title"],
      issues.map((issue) => [
        issue.id,
        issue.status,
        issue.aggregations?.occurrences ?? "",
        issue.aggregations?.users ?? "",
        formatTimestamp(issue.last_seen),
        truncate(issue.name || issue.description, 70),
      ])
    )
  );
  console.log("");
  console.log(`${issues.length} issue(s). Read one with: get-issue.js <issue-id>`);
  if (issues.length > 0) console.log(webUrl(projectId, "error_tracking"));
});
