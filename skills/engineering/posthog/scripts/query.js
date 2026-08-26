#!/usr/bin/env node

import { readFileSync } from "fs";
import { requireProject, runQuery, parseFlags, run, die } from "../lib/api.js";
import { table, truncate } from "../lib/format.js";

const HELP = `Usage: query.js "<HogQL>" [options]
       query.js -f query.sql [options]
       cat query.sql | query.js -f - [options]

Run HogQL (PostHog's SQL) against a project and print the result as a table.

Options:
  --project, -p <id>   Project ID or name (default: ~/.posthogrc [defaults] project)
  --file, -f <path>    Read the query from a file, or from stdin with -
  --name <text>        Label for the query_log, which makes it findable later
                       (default: the first line of the query)
  --wide               Print full cell values instead of truncating to 60 chars
  --json               Raw JSON output
  -h, --help           Show this help

Notes:
  Results cap at 100 rows unless the query has its own LIMIT (max 50k).
  PostHog rejects OFFSET for personal API keys; page on timestamp instead.
  See ../references/hogql.md for the table and property reference.

Examples:
  query.js "select count() from events where timestamp >= now() - interval 7 day"
  query.js "select event, count() from events where timestamp >= now() - interval 1 day
            group by event order by 2 desc limit 20"
  query.js -f ./funnel.sql -p 12345 --json
`;

run(async () => {
  const { flags, positionals } = parseFlags(process.argv.slice(2), {
    aliases: { p: "project", f: "file", h: "help" },
    booleans: ["help", "json", "wide"],
  });
  if (flags.help) {
    console.log(HELP);
    return;
  }

  let sql = positionals.join(" ").trim();
  if (flags.file) {
    sql = readFileSync(flags.file === "-" ? 0 : flags.file, "utf-8").trim();
  }
  if (!sql) die("no query given", "Pass HogQL as an argument, or read it with -f <path> / -f -");

  const projectId = await requireProject(flags.project);
  const name = flags.name || truncate(sql.split("\n")[0], 80);

  const response = await runQuery(projectId, { kind: "HogQLQuery", query: sql }, { name });

  if (flags.json) {
    console.log(JSON.stringify(response, null, 2));
    return;
  }

  const columns = response.columns || [];
  const rows = response.results || [];
  const cell = (value) => {
    if (value === null || value === undefined) return "";
    const text = typeof value === "object" ? JSON.stringify(value) : String(value);
    return flags.wide ? text : truncate(text, 60);
  };

  console.log(table(columns.map(String), rows.map((row) => row.map(cell))));
  console.log("");
  console.log(
    `${rows.length} row(s)${response.hasMore ? ", more available" : ""}${response.is_cached ? " (cached)" : ""}`
  );
});
