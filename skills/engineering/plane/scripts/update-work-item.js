#!/usr/bin/env node

import {
  die,
  getDefault,
  getLookups,
  parseFlags,
  parseWorkItemRef,
  request,
  requireWorkspace,
  resolveProjectId,
  run,
} from "../lib/api.js";
import { attachGroupings, buildPayload } from "../lib/work-item.js";
import { formatWorkItem } from "../lib/format.js";

const HELP = `Usage: update-work-item.js <ref> [options]

Update a work item. <ref> is a UUID, a PROJ-123 identifier, or a Plane URL.
Only the fields you pass are changed.

Options:
  --workspace, -w <slug>   Workspace slug (default: ~/.planesorc [defaults] workspace)
  --project, -p <project>  Project UUID, identifier, or name (inferred from ref)
  --name <text>            New title
  --description <text>     Replace the description (plain text)
  --description-file <f>   Replace the description from a file
  --html                   Treat the description as HTML, don't wrap it
  --state <name>           Move to this state
  --priority <level>       urgent, high, medium, low, none
  --assignee <who>         Replace assignees (repeatable; pass none to clear)
  --label <name>           Replace labels (repeatable)
  --parent <uuid>          Reparent
  --start-date <date>      YYYY-MM-DD
  --target-date <date>     YYYY-MM-DD
  --estimate <n>           Estimate points
  --cycle <name-or-id>     Add to this cycle
  --module <name-or-id>    Add to this module
  --json                   Output raw JSON
  --url <url>              Server root URL
  -h, --help               Show this help

--assignee and --label replace the whole list rather than adding to it: pass
every value you want to keep.

Examples:
  update-work-item.js WEB-123 --state Done
  update-work-item.js WEB-123 --priority urgent --assignee me@example.com
  update-work-item.js WEB-123 --cycle "Sprint 12"
`;

run(async () => {
  const { flags, positionals } = parseFlags(process.argv.slice(2), {
    aliases: { w: "workspace", p: "project", h: "help" },
    booleans: ["help", "json", "html"],
    arrays: ["assignee", "label"],
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

  // PATCH is project-scoped, so an identifier has to be looked up first.
  let workItemId = ref.id;
  let projectId = ref.projectId;
  if (ref.identifier) {
    const found = await request(
      `/workspaces/${encodeURIComponent(workspace)}/work-items/${ref.identifier}/`
    );
    workItemId = found.id;
    projectId = found.project || found.project_id;
  }
  projectId = await resolveProjectId(workspace, projectId || flags.project || getDefault("project"));
  const base = `/workspaces/${encodeURIComponent(workspace)}/projects/${projectId}`;

  const payload = await buildPayload(workspace, projectId, flags);
  if (Object.keys(payload).length === 0 && !flags.cycle && !flags.module) {
    die("nothing to update, pass at least one field", "Run with --help for the field list.");
  }

  const item =
    Object.keys(payload).length > 0
      ? await request(`${base}/work-items/${workItemId}/`, { method: "PATCH", body: payload })
      : await request(`${base}/work-items/${workItemId}/`);
  await attachGroupings(base, workItemId, flags);

  if (flags.json) {
    console.log(JSON.stringify(item, null, 2));
    return;
  }

  const [lookups, project] = await Promise.all([
    getLookups(workspace, projectId),
    request(`${base}/`),
  ]);
  console.log("Updated:\n");
  console.log(
    formatWorkItem(item, { workspace, projectId, identifier: project.identifier, lookups })
  );
});
