#!/usr/bin/env node

import {
  API_BASE,
  ROOT_URL,
  ORGANIZATION,
  RC_PATHS,
  isCloud,
  getDefault,
  request,
  parseFlags,
  run,
} from "../lib/api.js";

const HELP = `Usage: check-config.js [options]

Show the resolved configuration and verify the token against the server.

Options:
  --url <url>   Server root URL (default: ~/.sonarrc [defaults] url)
  --rc <path>   Read only this config file (default: ~/.sonarrc, then ./.sonarrc,
                then ./sonar-project.properties, each winning over the last)
  -h, --help    Show this help
`;

run(async () => {
  const { flags } = parseFlags(process.argv.slice(2), {
    aliases: { h: "help" },
    booleans: ["help"],
  });
  if (flags.help) {
    console.log(HELP);
    return;
  }

  console.log(`Config:   ${RC_PATHS.length > 0 ? RC_PATHS.join(" + ") : "(no config file found)"}`);
  console.log(`Root URL: ${ROOT_URL}`);
  console.log(`API base: ${API_BASE}`);
  console.log(`Edition:  ${isCloud ? "SonarQube Cloud" : "SonarQube Server (self-hosted)"}`);
  console.log(`Org:      ${ORGANIZATION || "(not set)"}`);
  console.log(`Project:  ${getDefault("project") || "(not set)"}`);
  console.log("");

  const me = await request("/users/current");
  console.log(`Auth OK as ${me.login}${me.name && me.name !== me.login ? ` (${me.name})` : ""}.`);

  if (!isCloud) {
    const status = await request("/system/status");
    console.log(`Server ${status.version}, status ${status.status}.`);
  }

  const project = getDefault("project");
  if (project) {
    const found = await request("/components/show", { query: { component: project } });
    console.log(`Project '${project}' readable: ${found.component.name}.`);
  }
});
