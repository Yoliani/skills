#!/usr/bin/env node

import {
  getDefault,
  getLookups,
  paginate,
  parseFlags,
  request,
  requireWorkspace,
  resolveAssigneeIds,
  resolveLabelIds,
  resolveProjectId,
  resolveStateId,
  run,
} from "../lib/api.js";
import { formatWorkItem } from "../lib/format.js";
import { resolveGrouping } from "../lib/work-item.js";

const HELP = `Usage: list-work-items.js [options]

List work items in a project, newest activity first.

Options:
  --workspace, -w <slug>   Workspace slug (default: ~/.planesorc [defaults] workspace)
  --project, -p <project>  Project UUID, identifier (WEB), or name
  --state <name>           Only this state, by name (repeatable)
  --group <group>          Only this state group: backlog, unstarted, started,
                           completed, cancelled (repeatable)
  --priority <level>       Only this priority: urgent, high, medium, low, none (repeatable)
  --assignee <who>         Only items assigned to this email or display name (repeatable)
  --label <name>           Only items carrying this label (repeatable)
  --cycle <name-or-id>     Only items in this cycle
  --module <name-or-id>    Only items in this module
  --order-by <field>       API order field, '-' for descending (default: -updated_at)
  --limit, -n <n>          Max results (default: 50)
  --json                   Output raw JSON
  --url <url>              Server root URL
  -h, --help               Show this help

Filters other than --cycle/--module are applied client-side, because the list
endpoint takes no filter parameters. Raise --limit if a filter looks too
narrow: only the fetched pages are searched.

Examples:
  list-work-items.js -p WEB --group started
  list-work-items.js -p WEB --priority urgent --priority high
  list-work-items.js -p WEB --assignee me@example.com --state "In Progress"
  list-work-items.js -p WEB --cycle "Sprint 12" -n 100
`;

run(async () => {
  const { flags } = parseFlags(process.argv.slice(2), {
    aliases: { w: "workspace", p: "project", n: "limit", h: "help", "order-by": "orderBy" },
    booleans: ["help", "json"],
    arrays: ["state", "group", "priority", "assignee", "label"],
  });
  if (flags.help) {
    console.log(HELP);
    return;
  }

  const workspace = requireWorkspace(flags.workspace);
  const projectId = await resolveProjectId(workspace, flags.project || getDefault("project"));
  const base = `/workspaces/${encodeURIComponent(workspace)}/projects/${projectId}`;
  const limit = flags.limit ? parseInt(flags.limit, 10) : 50;

  const [project, lookups] = await Promise.all([
    request(`${base}/`),
    getLookups(workspace, projectId),
  ]);

  let items;
  if (flags.cycle || flags.module) {
    const kind = flags.cycle ? "cycles" : "modules";
    const id = await resolveGrouping(base, kind, flags.cycle || flags.module);
    const path = flags.cycle ? `${base}/cycles/${id}/cycle-issues/` : `${base}/modules/${id}/module-issues/`;
    const entries = await paginate(path, { limit: limit * 4 });
    // Cycles return link records ({cycle, issue}); modules return work items.
    items = entries[0]?.name
      ? entries
      : await Promise.all(
          entries.slice(0, limit * 2).map((e) => request(`${base}/work-items/${e.issue}/`))
        );
  } else {
    items = await paginate(`${base}/work-items/`, {
      query: { order_by: flags.orderBy || "-updated_at" },
      limit: hasClientFilters(flags) ? Math.max(limit * 10, 200) : limit,
    });
  }

  // Resolve names to UUIDs once, so filters compare ids rather than labels
  // that may be spelled as an email in one place and a display name in another.
  const wanted = {
    states: flags.state
      ? await Promise.all(flags.state.map((s) => resolveStateId(workspace, projectId, s)))
      : null,
    groups: flags.group ? flags.group.map((g) => g.toLowerCase()) : null,
    priorities: flags.priority ? flags.priority.map((p) => p.toLowerCase()) : null,
    assignees: flags.assignee ? await resolveAssigneeIds(workspace, projectId, flags.assignee) : null,
    labels: flags.label ? await resolveLabelIds(workspace, projectId, flags.label) : null,
  };

  const filtered = items.filter((item) => matches(item, wanted, lookups)).slice(0, limit);

  if (flags.json) {
    console.log(JSON.stringify(filtered, null, 2));
    return;
  }

  if (filtered.length === 0) {
    console.log(`No work items matched (searched ${items.length} fetched item(s)).`);
    return;
  }

  console.log(`${filtered.length} work item(s) in ${project.identifier || project.name}:\n`);
  for (const item of filtered) {
    console.log(formatWorkItem(item, { workspace, projectId, identifier: project.identifier, lookups }));
    console.log("");
  }
});

/** @param {Record<string, any>} flags */
function hasClientFilters(flags) {
  return Boolean(flags.state || flags.group || flags.priority || flags.assignee || flags.label);
}

/**
 * @param {any} item
 * @param {{states: string[]|null, groups: string[]|null, priorities: string[]|null, assignees: string[]|null, labels: string[]|null}} wanted
 * @param {any} lookups
 */
function matches(item, wanted, lookups) {
  if (wanted.states && !wanted.states.includes(item.state)) return false;
  if (wanted.groups) {
    const group = (lookups.stateGroups.get(item.state) || "").toLowerCase();
    if (!wanted.groups.includes(group)) return false;
  }
  if (wanted.priorities && !wanted.priorities.includes((item.priority || "none").toLowerCase())) {
    return false;
  }
  if (wanted.assignees) {
    const on = item.assignees || [];
    if (!wanted.assignees.some((id) => on.includes(id))) return false;
  }
  if (wanted.labels) {
    const on = item.labels || [];
    if (!wanted.labels.every((id) => on.includes(id))) return false;
  }
  return true;
}
