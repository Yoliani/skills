#!/usr/bin/env node

import {
  requireProject,
  paginate,
  request,
  runQuery,
  webUrl,
  formatTimestamp,
  parseFlags,
  run,
  die,
} from "../lib/api.js";
import { table, truncate } from "../lib/format.js";

const HELP = `Usage: get-insight.js [short-id-or-url] [options]

List saved insights, or read one and run its query to get current numbers.

Options:
  --project, -p <id>    Project ID or name (default: ~/.posthogrc [defaults] project)
  --search <text>       Filter the list by name, case-insensitive
  --limit, -n <count>   Insights to list (default: 50)
  --no-run              Show the insight's saved query without executing it
  --json                Raw JSON output
  -h, --help            Show this help

Examples:
  get-insight.js
  get-insight.js --search "signup funnel"
  get-insight.js AbCd1234
`;

run(async () => {
  const { flags, positionals } = parseFlags(process.argv.slice(2), {
    aliases: { p: "project", n: "limit", h: "help" },
    booleans: ["help", "json", "no-run"],
  });
  if (flags.help) {
    console.log(HELP);
    return;
  }

  const projectId = await requireProject(flags.project);
  const ref = positionals[0];

  if (!ref) {
    let insights = await paginate(`/projects/${projectId}/insights/`, {
      limit: Number(flags.limit || 50),
    });
    if (flags.search) {
      const needle = flags.search.toLowerCase();
      insights = insights.filter((insight) =>
        (insight.name || insight.derived_name || "").toLowerCase().includes(needle)
      );
    }

    if (flags.json) {
      console.log(JSON.stringify(insights, null, 2));
      return;
    }

    console.log(
      table(
        ["short id", "name", "kind", "updated"],
        insights.map((insight) => [
          insight.short_id,
          truncate(insight.name || insight.derived_name, 55),
          insight.query?.kind || insight.filters?.insight || "",
          formatTimestamp(insight.last_modified_at || insight.updated_at),
        ])
      )
    );
    console.log("");
    console.log(`${insights.length} insight(s). Read one with: get-insight.js <short-id>`);
    return;
  }

  const shortId = ref.startsWith("http")
    ? (new URL(ref).pathname.match(/\/insights\/([^/?#]+)/) || [])[1]
    : ref;
  if (!shortId) die(`could not find an insight short ID in ${ref}`);

  const found = await request(`/projects/${projectId}/insights/`, {
    query: { short_id: shortId },
  });
  const insight = found?.results?.[0];
  if (!insight) {
    die(
      `insight '${shortId}' not found in project ${projectId}`,
      "Run get-insight.js with no argument to list them."
    );
  }

  console.log(insight.name || insight.derived_name || "(unnamed insight)");
  if (insight.description) console.log(insight.description);
  console.log("");
  console.log(`short id: ${insight.short_id}`);
  console.log(`kind:     ${insight.query?.kind || insight.filters?.insight || "?"}`);
  console.log(`updated:  ${formatTimestamp(insight.last_modified_at || insight.updated_at)}`);
  console.log(`url:      ${webUrl(projectId, "insights", insight.short_id)}`);

  if (!insight.query) {
    console.log("");
    console.log("(this insight uses the legacy `filters` format, which /query/ cannot run)");
    if (flags.json) console.log(JSON.stringify(insight, null, 2));
    return;
  }

  if (flags["no-run"]) {
    console.log("");
    console.log(JSON.stringify(insight.query, null, 2));
    return;
  }

  const response = await runQuery(projectId, insight.query.source || insight.query, {
    name: `insight ${insight.short_id}`,
  });

  if (flags.json) {
    console.log(JSON.stringify({ insight, response }, null, 2));
    return;
  }

  console.log("");
  const columns = response.columns;
  const rows = response.results || [];
  if (Array.isArray(columns) && Array.isArray(rows[0])) {
    console.log(table(columns.map(String), rows.map((row) => row.map((c) => truncate(c, 40)))));
  } else {
    console.log(JSON.stringify(rows, null, 2));
  }
});
