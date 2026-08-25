#!/usr/bin/env node

import {
  getDefault,
  parseFlags,
  request,
  requireWorkspace,
  resolveProjectId,
  run,
  WEB_URL,
} from "../lib/api.js";

const HELP = `Usage: search-work-items.js <query> [options]

Search work items by name, description, or identifier across a workspace.

Options:
  --workspace, -w <slug>   Workspace slug (default: ~/.planesorc [defaults] workspace)
  --project, -p <project>  Restrict to one project (UUID, identifier, or name)
  --all-projects           Search the whole workspace (default when no project is set)
  --advanced               Use the advanced-search endpoint, which also takes --filter
  --filter <k=v>           Advanced-search filter, repeatable (implies --advanced)
  --limit, -n <n>          Max results (default: 20)
  --json                   Output raw JSON
  --url <url>              Server root URL
  -h, --help               Show this help

The plain search returns identifiers and names only — feed a hit to
get-work-item.js for the full record. --filter values are passed through to
Plane's issue filter set untouched; unknown keys come back as a 400.

Examples:
  search-work-items.js "login timeout"
  search-work-items.js "checkout" -p WEB -n 50
  search-work-items.js "flaky" --filter priority=urgent --filter state_group=started
`;

run(async () => {
  const { flags, positionals } = parseFlags(process.argv.slice(2), {
    aliases: { w: "workspace", p: "project", n: "limit", h: "help" },
    booleans: ["help", "json", "advanced", "all-projects"],
    arrays: ["filter"],
  });
  if (flags.help || positionals.length === 0) {
    console.log(HELP);
    process.exit(flags.help ? 0 : 1);
  }

  const workspace = requireWorkspace(flags.workspace);
  const query = positionals.join(" ");
  const limit = flags.limit ? parseInt(flags.limit, 10) : 20;

  const projectRef = flags["all-projects"] ? null : flags.project || getDefault("project");
  const projectId = projectRef ? await resolveProjectId(workspace, projectRef) : null;

  let results;
  if (flags.advanced || flags.filter) {
    const filters = {};
    for (const pair of flags.filter || []) {
      const eq = pair.indexOf("=");
      if (eq === -1) continue;
      filters[pair.slice(0, eq)] = pair.slice(eq + 1);
    }
    const body = { query, limit, workspace_search: !projectId };
    if (projectId) body.project_id = projectId;
    if (Object.keys(filters).length > 0) body.filters = filters;

    const data = await request(`/workspaces/${encodeURIComponent(workspace)}/work-items/advanced-search/`, {
      method: "POST",
      body,
    });
    results = data?.results || (Array.isArray(data) ? data.flat() : []);
  } else {
    const data = await request(`/workspaces/${encodeURIComponent(workspace)}/work-items/search/`, {
      query: { search: query, limit, project_id: projectId, workspace_search: !projectId },
    });
    results = data?.issues || data?.results || [];
  }

  if (flags.json) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  if (results.length === 0) {
    console.log(`No work items matched '${query}'.`);
    return;
  }

  console.log(`${results.length} match(es) for '${query}':\n`);
  for (const hit of results) {
    const identifier = hit.project__identifier || hit.project_identifier;
    const ref = identifier && hit.sequence_id ? `${identifier}-${hit.sequence_id}` : hit.id;
    console.log(`[${ref}] ${hit.name}`);
    console.log(`  id: ${hit.id}`);
    if (hit.project_id) {
      console.log(`  url: ${WEB_URL}/${workspace}/projects/${hit.project_id}/issues/${hit.id}`);
    }
    console.log("");
  }
});
