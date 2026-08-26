#!/usr/bin/env node

import {
  API_BASE,
  ROOT_URL,
  WEB_URL,
  RC_PATHS,
  getDefault,
  getApiKey,
  listProjects,
  request,
  parseFlags,
  run,
} from "../lib/api.js";

const HELP = `Usage: check-config.js [options]

Show the resolved configuration and verify the personal API key against PostHog.

Options:
  --url <url>       Instance root URL (default: https://us.posthog.com)
  --rc <path>       Read only this rc file (default: ~/.posthogrc then
                    ./.posthogrc, the local one winning key by key)
  --json            Raw JSON output
  -h, --help        Show this help
`;

run(async () => {
  const { flags } = parseFlags(process.argv.slice(2), {
    aliases: { h: "help" },
    booleans: ["help", "json"],
  });
  if (flags.help) {
    console.log(HELP);
    return;
  }

  const key = getApiKey();
  const configured = {
    rcFiles: RC_PATHS,
    rootUrl: ROOT_URL,
    apiBase: API_BASE,
    webUrl: WEB_URL,
    project: getDefault("project") || process.env.POSTHOG_PROJECT || null,
  };

  if (!flags.json) {
    console.log(`Config:    ${RC_PATHS.length > 0 ? RC_PATHS.join(" + ") : "(no rc file found)"}`);
    console.log(`Root URL:  ${ROOT_URL}`);
    console.log(`API base:  ${API_BASE}`);
    console.log(`Web URL:   ${WEB_URL}`);
    console.log(`Project:   ${configured.project || "(not set)"}`);
    console.log(`API key:   ${key.slice(0, 8)}… (${key.length} chars)`);
    console.log("");
  }

  const me = await request("/users/@me/").catch(() => null);
  const projects = await listProjects();

  if (flags.json) {
    console.log(JSON.stringify({ ...configured, user: me?.email || null, projects }, null, 2));
    return;
  }

  console.log(`Auth OK${me?.email ? ` as ${me.email}` : ""}. ${projects.length} project(s) visible:`);
  for (const project of projects) {
    console.log(`  - ${project.id}: ${project.name}`);
  }
  console.log("");
  console.log("Set one as the default with `project=<id>` under [defaults] in ~/.posthogrc.");
});
