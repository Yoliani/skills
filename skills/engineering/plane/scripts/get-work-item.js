#!/usr/bin/env node

import {
  die,
  formatTimestamp,
  getDefault,
  getLookups,
  htmlToText,
  paginate,
  parseFlags,
  parseWorkItemRef,
  request,
  requireWorkspace,
  resolveProjectId,
  run,
} from "../lib/api.js";
import { formatWorkItem } from "../lib/format.js";

const HELP = `Usage: get-work-item.js <ref> [options]

Show one work item in full. <ref> is a UUID, a PROJ-123 identifier, or a URL
copied out of the Plane UI.

Options:
  --workspace, -w <slug>   Workspace slug (default: ~/.planesorc [defaults] workspace)
  --project, -p <project>  Project UUID, identifier, or name (inferred from a
                           PROJ-123 ref or a URL)
  --comments               Include comments
  --activity               Include the activity log
  --links                  Include attached links
  --json                   Output raw JSON
  --url <url>              Server root URL
  -h, --help               Show this help

Examples:
  get-work-item.js WEB-123 --comments
  get-work-item.js https://app.plane.so/acme/projects/<uuid>/issues/<uuid>
  get-work-item.js 550e8400-e29b-41d4-a716-446655440000 -p WEB --activity
`;

run(async () => {
  const { flags, positionals } = parseFlags(process.argv.slice(2), {
    aliases: { w: "workspace", p: "project", h: "help" },
    booleans: ["help", "json", "comments", "activity", "links"],
  });
  if (flags.help || positionals.length === 0) {
    console.log(HELP);
    process.exit(flags.help ? 0 : 1);
  }

  const workspace = requireWorkspace(flags.workspace);
  const ref = parseWorkItemRef(positionals[0]);
  if (!ref.id && !ref.identifier) {
    die(`could not read '${positionals[0]}' as a UUID, a PROJ-123 identifier, or a Plane URL`);
  }

  let item;
  let projectId;

  if (ref.identifier) {
    // The by-identifier endpoint is workspace-scoped and needs no project.
    item = await request(`/workspaces/${encodeURIComponent(workspace)}/work-items/${ref.identifier}/`);
    projectId = item.project || item.project_id;
  } else {
    projectId = await resolveProjectId(
      workspace,
      ref.projectId || flags.project || getDefault("project")
    );
    item = await request(
      `/workspaces/${encodeURIComponent(workspace)}/projects/${projectId}/work-items/${ref.id}/`
    );
  }

  const base = `/workspaces/${encodeURIComponent(workspace)}/projects/${projectId}`;
  const [lookups, project] = await Promise.all([
    getLookups(workspace, projectId),
    request(`${base}/`),
  ]);

  const extras = {};
  if (flags.comments) extras.comments = await paginate(`${base}/work-items/${item.id}/comments/`);
  if (flags.activity) extras.activity = await paginate(`${base}/work-items/${item.id}/activities/`);
  if (flags.links) extras.links = await paginate(`${base}/work-items/${item.id}/links/`);

  if (flags.json) {
    console.log(JSON.stringify({ ...item, ...extras }, null, 2));
    return;
  }

  console.log(
    formatWorkItem(item, { workspace, projectId, identifier: project.identifier, lookups })
  );

  const description = item.description_stripped || htmlToText(item.description_html);
  if (description) {
    console.log("\n--- Description ---");
    console.log(description);
  }

  if (extras.links?.length) {
    console.log("\n--- Links ---");
    for (const link of extras.links) console.log(`  ${link.title || link.url}: ${link.url}`);
  }

  if (extras.comments) {
    console.log(`\n--- Comments (${extras.comments.length}) ---`);
    for (const comment of extras.comments) {
      const who = lookups.members.get(comment.actor) || comment.actor || "unknown";
      console.log(`\n[${formatTimestamp(comment.created_at)}] ${who}${comment.access === "INTERNAL" ? " (internal)" : ""}`);
      console.log(htmlToText(comment.comment_html) || "(empty)");
    }
  }

  if (extras.activity) {
    console.log(`\n--- Activity (${extras.activity.length}) ---`);
    for (const entry of extras.activity) {
      const who = lookups.members.get(entry.actor) || entry.actor || "unknown";
      const change =
        entry.field
          ? `${entry.field}: ${entry.old_value || "∅"} → ${entry.new_value || "∅"}`
          : entry.verb || "";
      console.log(`  [${formatTimestamp(entry.created_at)}] ${who}: ${change}`);
    }
  }
});
