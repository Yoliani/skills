#!/usr/bin/env node

import {
  request,
  requireProject,
  scopeParams,
  metricIndex,
  periodToDate,
  parseFlags,
  formatTimestamp,
  run,
} from "../lib/api.js";
import { table, formatMeasure } from "../lib/format.js";

const HELP = `Usage: history.js [project-key] [options]

Show how measures moved across past analyses, which is how you tell a real
regression from a one-off reading.

Options:
  --project, -p <key>   Project key (default: ~/.sonarrc [defaults] project)
  --branch, -b <name>   Branch to read (default: the main branch)
  --pr <number>         Pull request to read instead of a branch
  --metrics, -m <list>  Comma-separated metric keys (default: coverage,
                        duplicated_lines_density, bugs, vulnerabilities,
                        code_smells, sqale_index, ncloc)
  --since, -s <when>    Relative period (30d, 12w) or a yyyy-MM-dd date
  --limit, -n <count>   Analyses to print, most recent last (default: 20)
  --json                Raw JSON output
  -h, --help            Show this help

Examples:
  history.js --since 90d
  history.js -m coverage,new_coverage --since 2026-01-01
`;

const DEFAULT_METRICS = [
  "coverage",
  "duplicated_lines_density",
  "bugs",
  "vulnerabilities",
  "code_smells",
  "sqale_index",
  "ncloc",
];

run(async () => {
  const { flags, positionals } = parseFlags(process.argv.slice(2), {
    aliases: { p: "project", b: "branch", m: "metrics", s: "since", n: "limit", h: "help" },
    booleans: ["help", "json"],
  });
  if (flags.help) {
    console.log(HELP);
    return;
  }

  const project = requireProject(positionals[0] || flags.project);
  const scope = scopeParams(flags);
  const metricKeys = flags.metrics
    ? String(flags.metrics).split(",").map((key) => key.trim()).filter(Boolean)
    : DEFAULT_METRICS;
  const limit = Number(flags.limit) || 20;

  const data = await request("/measures/search_history", {
    query: {
      component: project,
      metrics: metricKeys.join(","),
      from: flags.since ? periodToDate(flags.since) : undefined,
      ps: 1000,
      ...scope,
    },
  });

  if (flags.json) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  const metrics = await metricIndex();
  // The API returns one series per metric; the table wants one row per analysis.
  const series = data.measures || [];
  const dates = [...new Set(series.flatMap((m) => (m.history || []).map((point) => point.date)))]
    .sort()
    .slice(-limit);
  const valueAt = (metric, date) =>
    (metric.history || []).find((point) => point.date === date)?.value;

  const rows = dates.map((date) => [
    formatTimestamp(date),
    ...series.map((metric) => formatMeasure(valueAt(metric, date), metrics[metric.metric]?.type)),
  ]);

  console.log(`Project: ${project}${scope.branch ? ` (${scope.branch})` : ""}`);
  console.log("");
  console.log(table(["ANALYSIS", ...series.map((m) => metrics[m.metric]?.name || m.metric)], rows));
  console.log("");
  console.log(`${dates.length} of ${data.paging?.total ?? dates.length} analysis point(s)`);
});
