#!/usr/bin/env node

import { API_BASE, ROOT_URL, BACKEND, RC_PATHS, getDefault, getAuthToken, fetchJson } from "../lib/api.js";

const HELP = `Usage: check-config.js [options]

Show the resolved configuration and verify the token against the server.

Options:
  --url <url>              Server root URL (default: ~/.sentryclirc [defaults] url)
  --backend <name>         Force sentry or glitchtip (default: detected from url)
  --rc <path>              Read only this rc file (default: ~/.sentryclirc then
                           ./.sentryclirc, the local one winning key by key)
  -h, --help               Show this help
`;

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log(HELP);
    process.exit(0);
  }

  console.log(`Config:    ${RC_PATHS.length > 0 ? RC_PATHS.join(" + ") : "(no rc file found)"}`);
  console.log(`Root URL:  ${ROOT_URL}`);
  console.log(`API base:  ${API_BASE}`);
  console.log(`Backend:   ${BACKEND}`);
  console.log(`Org:       ${getDefault("org") || "(not set)"}`);
  console.log(`Project:   ${getDefault("project") || "(not set)"}`);

  const token = getAuthToken();
  console.log("");

  try {
    const orgs = await fetchJson(`${API_BASE}/organizations/`, token);
    const list = Array.isArray(orgs) ? orgs : orgs.data || [];
    console.log(`Auth OK. ${list.length} organization(s) visible:`);
    for (const org of list) {
      console.log(`  - ${org.slug}${org.name && org.name !== org.slug ? ` (${org.name})` : ""}`);
    }
  } catch (err) {
    console.error("Auth check failed:", err.message);
    process.exit(1);
  }
}

main();
