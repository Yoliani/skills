#!/usr/bin/env node

import {
  getDefault,
  memberId,
  memberName,
  paginate,
  parseFlags,
  requireWorkspace,
  resolveProjectId,
  run,
} from "../lib/api.js";

const HELP = `Usage: list-metadata.js [options]

List the states, labels, members, cycles, and modules of a project: the
vocabulary the other scripts accept by name, alongside their UUIDs.

Options:
  --workspace, -w <slug>   Workspace slug (default: ~/.planesorc [defaults] workspace)
  --project, -p <project>  Project UUID, identifier, or name
  --only <kind>            Just one of: states, labels, members, cycles, modules
                           (repeatable)
  --json                   Output raw JSON
  --url <url>              Server root URL
  -h, --help               Show this help

Run this first when a --state, --label, or --assignee value is rejected.

Examples:
  list-metadata.js -p WEB
  list-metadata.js -p WEB --only states --only labels
`;

const KINDS = ["states", "labels", "members", "cycles", "modules"];

run(async () => {
  const { flags } = parseFlags(process.argv.slice(2), {
    aliases: { w: "workspace", p: "project", h: "help" },
    booleans: ["help", "json"],
    arrays: ["only"],
  });
  if (flags.help) {
    console.log(HELP);
    return;
  }

  const workspace = requireWorkspace(flags.workspace);
  const projectId = await resolveProjectId(workspace, flags.project || getDefault("project"));
  const base = `/workspaces/${encodeURIComponent(workspace)}/projects/${projectId}`;
  const wanted = flags.only ? flags.only.filter((k) => KINDS.includes(k)) : KINDS;

  const data = {};
  for (const kind of wanted) {
    const path = kind === "members" ? `${base}/project-members/` : `${base}/${kind}/`;
    data[kind] = await paginate(path).catch((err) => ({ error: err.message }));
  }

  if (flags.json) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  for (const [kind, entries] of Object.entries(data)) {
    console.log(`--- ${kind} ---`);
    if (entries.error) {
      console.log(`  (unavailable: ${entries.error})`);
    } else if (entries.length === 0) {
      console.log("  (none)");
    } else {
      for (const entry of entries) {
        if (kind === "members") {
          console.log(`  ${memberName(entry)}: ${memberId(entry)} (${entry.role ?? "?"})`);
        } else if (kind === "states") {
          console.log(`  ${entry.name} [${entry.group}]: ${entry.id}`);
        } else {
          console.log(`  ${entry.name}: ${entry.id}`);
        }
      }
    }
    console.log("");
  }
});
