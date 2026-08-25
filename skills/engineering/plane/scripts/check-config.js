#!/usr/bin/env node

import {
  API_BASE,
  ROOT_URL,
  WEB_URL,
  RC_PATHS,
  getDefault,
  getApiKey,
  paginate,
  parseFlags,
  run,
} from "../lib/api.js";

const HELP = `Usage: check-config.js [options]

Show the resolved configuration and verify the API key against the server.

Options:
  --workspace, -w <slug>   Workspace slug (default: ~/.planesorc [defaults] workspace)
  --url <url>              Server root URL (default: https://api.plane.so)
  --rc <path>              Read only this rc file (default: ~/.planesorc then
                           ./.planesorc, the local one winning key by key)
  -h, --help               Show this help
`;

run(async () => {
  const { flags } = parseFlags(process.argv.slice(2), {
    aliases: { w: "workspace", h: "help" },
    booleans: ["help"],
  });
  if (flags.help) {
    console.log(HELP);
    return;
  }

  const workspace = flags.workspace || process.env.PLANE_WORKSPACE || getDefault("workspace");

  console.log(`Config:    ${RC_PATHS.length > 0 ? RC_PATHS.join(" + ") : "(no rc file found)"}`);
  console.log(`Root URL:  ${ROOT_URL}`);
  console.log(`API base:  ${API_BASE}`);
  console.log(`Web URL:   ${WEB_URL}`);
  console.log(`Workspace: ${workspace || "(not set)"}`);
  console.log(`Project:   ${getDefault("project") || "(not set)"}`);

  const key = getApiKey();
  console.log(`API key:   ${key.slice(0, 12)}… (${key.length} chars)`);
  console.log("");

  if (!workspace) {
    console.log("Set a workspace to verify the key; the API has no workspace-less endpoint.");
    console.log("Add it to ~/.planesorc [defaults], or pass --workspace <slug>.");
    return;
  }

  const projects = await paginate(`/workspaces/${encodeURIComponent(workspace)}/projects/`);
  console.log(`Auth OK. ${projects.length} project(s) visible in '${workspace}':`);
  for (const project of projects) {
    console.log(`  - ${project.identifier}: ${project.name} (${project.id})`);
  }
});
