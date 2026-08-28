#!/usr/bin/env node

import {
  request,
  requireProject,
  scopeParams,
  metricIndex,
  webUrl,
  parseFlags,
  formatTimestamp,
  run,
} from "../lib/api.js";
import { table, formatMeasure } from "../lib/format.js";

const HELP = `Usage: quality-gate.js [project-key] [options]

Print the quality gate status of a project and every condition behind it, so a
failing gate names the metric, the measured value, and the threshold it missed.

Options:
  --project, -p <key>  Project key (default: ~/.sonarrc [defaults] project)
  --branch, -b <name>  Branch to read (default: the main branch)
  --pr <number>        Pull request to read instead of a branch
  --exit-code          Exit 1 when the gate is ERROR, for use as a check
  --json               Raw JSON output
  -h, --help           Show this help

Examples:
  quality-gate.js
  quality-gate.js my-project-key --branch develop
  quality-gate.js --pr 412 --exit-code
`;

const CONDITION_ORDER = { ERROR: 0, WARN: 1, OK: 2, NO_VALUE: 3 };

run(async () => {
  const { flags, positionals } = parseFlags(process.argv.slice(2), {
    aliases: { p: "project", b: "branch", h: "help" },
    booleans: ["help", "json", "exit-code"],
  });
  if (flags.help) {
    console.log(HELP);
    return;
  }

  const project = requireProject(positionals[0] || flags.project);
  const scope = scopeParams(flags);
  const data = await request("/qualitygates/project_status", {
    query: { projectKey: project, ...scope },
  });

  if (flags.json) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  const gate = data.projectStatus || {};
  const metrics = await metricIndex();
  const analysis = (gate.periods || [])[0] || gate.period;

  console.log(`Project:  ${project}`);
  if (scope.branch) console.log(`Branch:   ${scope.branch}`);
  if (scope.pullRequest) console.log(`PR:       ${scope.pullRequest}`);
  console.log(`Gate:     ${gate.status}`);
  if (analysis?.date) {
    console.log(`New code: since ${formatTimestamp(analysis.date)}${analysis.mode ? ` (${analysis.mode})` : ""}`);
  }
  console.log("");

  const conditions = [...(gate.conditions || [])].sort(
    (a, b) => (CONDITION_ORDER[a.status] ?? 9) - (CONDITION_ORDER[b.status] ?? 9)
  );

  const rows = conditions.map((condition) => {
    const type = metrics[condition.metricKey]?.type;
    const comparator = condition.comparator === "GT" ? ">" : condition.comparator === "LT" ? "<" : condition.comparator;
    return [
      condition.status,
      metrics[condition.metricKey]?.name || condition.metricKey,
      formatMeasure(condition.actualValue, type),
      `${comparator} ${formatMeasure(condition.errorThreshold, type)}`,
      condition.metricKey,
    ];
  });

  console.log(table(["STATUS", "CONDITION", "ACTUAL", "FAILS WHEN", "METRIC"], rows));

  const failing = conditions.filter((condition) => condition.status === "ERROR");
  console.log("");
  console.log(
    failing.length
      ? `${failing.length} failing condition(s): ${failing.map((c) => c.metricKey).join(", ")}`
      : "All conditions pass."
  );
  if (gate.ignoredConditions) {
    console.log("Some conditions are ignored, which happens on a branch with no new code period.");
  }
  console.log(webUrl("/dashboard", { id: project, branch: scope.branch, pullRequest: scope.pullRequest }));

  if (flags["exit-code"] && gate.status === "ERROR") process.exit(1);
});
