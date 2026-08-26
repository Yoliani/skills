#!/usr/bin/env node

import {
  requireProject,
  request,
  runQuery,
  webUrl,
  toDateFrom,
  formatTimestamp,
  parseFlags,
  run,
  die,
} from "../lib/api.js";
import { parseProperties, formatStackTrace, contextLines } from "../lib/format.js";

const HELP = `Usage: get-issue.js <issue-id-or-url> [options]

Read one error tracking issue: counts, status, and the stack trace of its most
recent exception. That trace is usually the whole story for a crash.

Options:
  --project, -p <id>   Project ID or name (default: ~/.posthogrc [defaults] project)
  --period <range>     Window the counts cover (default: 30d)
  --first              Show the first event's trace instead of the latest
  --app-only           Hide vendor frames (in_app false)
  --frames <count>     Frames per exception (default: 30)
  --json               Raw JSON output
  -h, --help           Show this help

Examples:
  get-issue.js 0193a1b2-...-c3d4
  get-issue.js https://us.posthog.com/project/12345/error_tracking/0193a1b2-...
  get-issue.js 0193a1b2-...-c3d4 --app-only
`;

/**
 * Accept a bare UUID or the URL copied out of the browser.
 * @param {string} ref
 * @returns {{id: string, projectId: string|null}}
 */
function parseIssueRef(ref) {
  if (!ref) die("an issue ID or URL is required", "Find one with: list-issues.js");
  if (!ref.startsWith("http")) return { id: ref, projectId: null };

  const path = new URL(ref).pathname;
  const match = path.match(/\/project\/([^/]+)\/error_tracking\/([^/?#]+)/);
  if (!match) die(`could not find an issue ID in ${ref}`);
  return { id: match[2], projectId: match[1] };
}

run(async () => {
  const { flags, positionals } = parseFlags(process.argv.slice(2), {
    aliases: { p: "project", h: "help" },
    booleans: ["help", "json", "first", "app-only"],
  });
  if (flags.help) {
    console.log(HELP);
    return;
  }

  const ref = parseIssueRef(positionals[0]);
  const projectId = await requireProject(flags.project || ref.projectId);
  const wantFirst = Boolean(flags.first);

  const [detail, aggregated] = await Promise.all([
    request(`/projects/${projectId}/error_tracking/issues/${ref.id}/`).catch(() => null),
    runQuery(
      projectId,
      {
        kind: "ErrorTrackingQuery",
        dateRange: { date_from: toDateFrom(flags.period || "30d") },
        orderBy: "last_seen",
        volumeResolution: 0,
        issueId: ref.id,
        status: null,
        withAggregations: true,
        withFirstEvent: wantFirst,
        withLastEvent: !wantFirst,
        limit: 1,
      },
      { name: `error tracking issue ${ref.id}` }
    ),
  ]);

  const issue = aggregated.results?.[0];
  if (!issue && !detail) die(`issue ${ref.id} not found in project ${projectId}`);

  const merged = { ...(issue || {}), ...(detail || {}) };
  const event = wantFirst ? issue?.first_event : issue?.last_event;
  const properties = parseProperties(event?.properties);

  if (flags.json) {
    console.log(JSON.stringify({ ...merged, event: { ...event, properties } }, null, 2));
    return;
  }

  console.log(`${merged.name || "(unnamed issue)"}`);
  if (merged.description) console.log(merged.description);
  console.log("");
  console.log(`id:       ${merged.id || ref.id}`);
  console.log(`status:   ${merged.status || "?"}${merged.severity ? ` | severity: ${merged.severity}` : ""}`);
  if (issue?.aggregations) {
    const { occurrences, users, sessions } = issue.aggregations;
    console.log(`volume:   ${occurrences} occurrence(s), ${users} user(s), ${sessions} session(s)`);
  }
  console.log(`first:    ${formatTimestamp(merged.first_seen)}`);
  console.log(`last:     ${formatTimestamp(merged.last_seen)}`);
  if (merged.assignee) console.log(`assignee: ${merged.assignee.type} ${merged.assignee.id}`);
  if (merged.library) console.log(`library:  ${merged.library}`);
  console.log(`url:      ${webUrl(projectId, "error_tracking", merged.id || ref.id)}`);

  if (!event) {
    console.log("");
    console.log(`(no ${wantFirst ? "first" : "latest"} event in the last ${flags.period || "30d"}; widen --period)`);
    return;
  }

  console.log("");
  console.log(`--- ${wantFirst ? "first" : "latest"} event, ${formatTimestamp(event.timestamp)} ---`);
  const context = contextLines(properties);
  if (context.length > 0) console.log(context.join("\n"));
  console.log("");
  console.log(
    formatStackTrace(properties, {
      appOnly: Boolean(flags["app-only"]),
      maxFrames: Number(flags.frames || 30),
    })
  );

  if (properties.$session_id) {
    console.log("");
    console.log(`Session replay: ${webUrl(projectId, "replay", properties.$session_id)}`);
  }
});
