#!/usr/bin/env node

import { paginate, parseFlags, requireWorkspace, run, WEB_URL } from "../lib/api.js";

const HELP = `Usage: list-projects.js [options]

List the projects in a workspace, with the UUIDs other scripts need.

Options:
  --workspace, -w <slug>   Workspace slug (default: ~/.planesorc [defaults] workspace)
  --limit, -n <n>          Max results (default: all)
  --json                   Output raw JSON
  --url <url>              Server root URL
  -h, --help               Show this help
`;

run(async () => {
  const { flags } = parseFlags(process.argv.slice(2), {
    aliases: { w: "workspace", n: "limit", h: "help" },
    booleans: ["help", "json"],
  });
  if (flags.help) {
    console.log(HELP);
    return;
  }

  const workspace = requireWorkspace(flags.workspace);
  const projects = await paginate(`/workspaces/${encodeURIComponent(workspace)}/projects/`, {
    limit: flags.limit ? parseInt(flags.limit, 10) : Infinity,
  });

  if (flags.json) {
    console.log(JSON.stringify(projects, null, 2));
    return;
  }

  if (projects.length === 0) {
    console.log(`No projects visible in '${workspace}'.`);
    return;
  }

  console.log(`${projects.length} project(s) in ${workspace}:\n`);
  for (const project of projects) {
    console.log(`[${project.identifier}] ${project.name}`);
    console.log(`  id: ${project.id}`);
    if (project.description) console.log(`  ${project.description}`);
    console.log(`  url: ${WEB_URL}/${workspace}/projects/${project.id}/issues/`);
    console.log("");
  }
});
