#!/usr/bin/env node

import {
  die,
  getDefault,
  getLookups,
  parseFlags,
  request,
  requireWorkspace,
  resolveProjectId,
  run,
} from "../lib/api.js";
import { attachGroupings, buildPayload } from "../lib/work-item.js";
import { formatWorkItem } from "../lib/format.js";

const HELP = `Usage: create-work-item.js <name> [options]

Create a work item. The name may also be passed with --name.

Options:
  --workspace, -w <slug>   Workspace slug (default: ~/.planesorc [defaults] workspace)
  --project, -p <project>  Project UUID, identifier, or name
  --description <text>     Description as plain text (wrapped in paragraphs)
  --description-file <f>   Read the description from a file
  --html                   Treat the description as HTML, don't wrap it
  --state <name>           State by name (defaults to the project's default state)
  --priority <level>       urgent, high, medium, low, none
  --assignee <who>         Email, display name, or UUID (repeatable)
  --label <name>           Label name or UUID (repeatable)
  --parent <uuid>          Parent work item
  --start-date <date>      YYYY-MM-DD
  --target-date <date>     YYYY-MM-DD
  --estimate <n>           Estimate points
  --cycle <name-or-id>     Add to this cycle after creating
  --module <name-or-id>    Add to this module after creating
  --json                   Output raw JSON
  --url <url>              Server root URL
  -h, --help               Show this help

Examples:
  create-work-item.js "Checkout times out on slow networks" -p WEB --priority high
  create-work-item.js "Rate limit the export endpoint" -p API \\
    --description-file ./notes.md --assignee me@example.com --label backend
`;

run(async () => {
  const { flags, positionals } = parseFlags(process.argv.slice(2), {
    aliases: { w: "workspace", p: "project", h: "help" },
    booleans: ["help", "json", "html"],
    arrays: ["assignee", "label"],
  });
  if (flags.help || (positionals.length === 0 && !flags.name)) {
    console.log(HELP);
    process.exit(flags.help ? 0 : 1);
  }

  flags.name = flags.name || positionals.join(" ");
  const workspace = requireWorkspace(flags.workspace);
  const projectId = await resolveProjectId(workspace, flags.project || getDefault("project"));
  const base = `/workspaces/${encodeURIComponent(workspace)}/projects/${projectId}`;

  const payload = await buildPayload(workspace, projectId, flags);
  if (!payload.name) die("a name is required");

  const item = await request(`${base}/work-items/`, { method: "POST", body: payload });
  await attachGroupings(base, item.id, flags);

  if (flags.json) {
    console.log(JSON.stringify(item, null, 2));
    return;
  }

  const [lookups, project] = await Promise.all([
    getLookups(workspace, projectId),
    request(`${base}/`),
  ]);
  console.log("Created:\n");
  console.log(
    formatWorkItem(item, { workspace, projectId, identifier: project.identifier, lookups })
  );
});
