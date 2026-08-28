#!/usr/bin/env node

import {
  request,
  requireProject,
  scopeParams,
  metricIndex,
  webUrl,
  parseFlags,
  run,
  die,
} from "../lib/api.js";
import { table, formatMeasure, measureValue, newCodeValue, truncate } from "../lib/format.js";

const HELP = `Usage: measures.js [project-key] [options]

Read the measures behind the dashboard: coverage, duplication, size, the four
ratings, and the issue counts. Overall by default, new code with --new.

Options:
  --project, -p <key>   Project key (default: ~/.sonarrc [defaults] project)
  --branch, -b <name>   Branch to read (default: the main branch)
  --pr <number>         Pull request to read instead of a branch
  --new                 New code period metrics instead of overall ones
  --metrics, -m <list>  Comma-separated metric keys, replacing the default set
  --files <metric>      Rank files by that metric instead of showing the project
  --limit, -n <count>   Files to list with --files (default: 20)
  --asc                 Rank --files ascending (default: worst first)
  --json                Raw JSON output
  -h, --help            Show this help

Examples:
  measures.js
  measures.js --new --pr 412
  measures.js -m coverage,ncloc,sqale_index
  measures.js --files coverage --limit 30
`;

const OVERALL = [
  "alert_status",
  "bugs",
  "vulnerabilities",
  "code_smells",
  "security_hotspots",
  "reliability_rating",
  "security_rating",
  "sqale_rating",
  "sqale_index",
  "coverage",
  "line_coverage",
  "tests",
  "duplicated_lines_density",
  "ncloc",
  "complexity",
  "cognitive_complexity",
];

const NEW_CODE = [
  "new_bugs",
  "new_vulnerabilities",
  "new_code_smells",
  "new_security_hotspots",
  "new_reliability_rating",
  "new_security_rating",
  "new_maintainability_rating",
  "new_technical_debt",
  "new_coverage",
  "new_line_coverage",
  "new_duplicated_lines_density",
  "new_lines",
];

run(async () => {
  const { flags, positionals } = parseFlags(process.argv.slice(2), {
    aliases: { p: "project", b: "branch", m: "metrics", n: "limit", h: "help" },
    booleans: ["help", "json", "new", "asc"],
  });
  if (flags.help) {
    console.log(HELP);
    return;
  }

  const project = requireProject(positionals[0] || flags.project);
  const scope = scopeParams(flags);
  const metricKeys = flags.metrics
    ? String(flags.metrics).split(",").map((key) => key.trim()).filter(Boolean)
    : flags.new
      ? NEW_CODE
      : OVERALL;
  const metrics = await metricIndex();

  if (flags.files) {
    const metric = String(flags.files);
    if (!metrics[metric]) die(`unknown metric '${metric}'`, "List them with: metrics.js");

    const data = await request("/measures/component_tree", {
      query: {
        component: project,
        metricKeys: metric,
        qualifiers: "FIL",
        s: "metric",
        metricSort: metric,
        asc: flags.asc ? "true" : "false",
        ps: Number(flags.limit) || 20,
        ...scope,
      },
    });

    if (flags.json) {
      console.log(JSON.stringify(data, null, 2));
      return;
    }

    const rows = (data.components || []).map((component) => {
      const measure = (component.measures || [])[0];
      return [formatMeasure(measureValue(measure), metrics[metric].type), truncate(component.path || component.key, 90)];
    });
    console.log(table([metrics[metric].name.toUpperCase(), "FILE"], rows));
    console.log("");
    console.log(`${rows.length} of ${data.paging?.total ?? rows.length} file(s) with a value for ${metric}`);
    return;
  }

  const data = await request("/measures/component", {
    query: { component: project, metricKeys: metricKeys.join(","), ...scope },
  });

  if (flags.json) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  const byKey = Object.fromEntries((data.component.measures || []).map((m) => [m.metric, m]));
  const rows = metricKeys.map((key) => {
    const measure = byKey[key];
    const type = metrics[key]?.type;
    const overall = measure?.value !== undefined ? formatMeasure(measure.value, type) : "-";
    const onNew = newCodeValue(measure);
    return [
      metrics[key]?.name || key,
      overall,
      onNew === null || onNew === undefined ? "" : formatMeasure(onNew, type),
      key,
    ];
  });

  console.log(`Project: ${data.component.name} (${project})`);
  if (scope.branch) console.log(`Branch:  ${scope.branch}`);
  if (scope.pullRequest) console.log(`PR:      ${scope.pullRequest}`);
  console.log("");
  console.log(table(["MEASURE", "VALUE", "NEW CODE", "METRIC"], rows));
  console.log("");
  console.log(webUrl("/dashboard", { id: project, branch: scope.branch, pullRequest: scope.pullRequest }));
});
