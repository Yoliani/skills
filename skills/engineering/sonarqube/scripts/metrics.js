#!/usr/bin/env node

import { metricIndex, parseFlags, run } from "../lib/api.js";
import { table, truncate } from "../lib/format.js";

const HELP = `Usage: metrics.js [search-text] [options]

List the metric keys this server knows, which are what --metrics takes.

Options:
  --domain, -d <name>  Only this domain (Reliability, Coverage, Size, ...)
  --json               Raw JSON output
  -h, --help           Show this help

Examples:
  metrics.js coverage
  metrics.js -d Maintainability
`;

run(async () => {
  const { flags, positionals } = parseFlags(process.argv.slice(2), {
    aliases: { d: "domain", h: "help" },
    booleans: ["help", "json"],
  });
  if (flags.help) {
    console.log(HELP);
    return;
  }

  const search = (positionals.join(" ") || "").toLowerCase();
  const all = Object.values(await metricIndex());
  const matches = all.filter((metric) => {
    if (metric.hidden) return false;
    if (flags.domain && (metric.domain || "").toLowerCase() !== String(flags.domain).toLowerCase()) {
      return false;
    }
    if (!search) return true;
    return `${metric.key} ${metric.name} ${metric.description || ""}`.toLowerCase().includes(search);
  });

  if (flags.json) {
    console.log(JSON.stringify(matches, null, 2));
    return;
  }

  console.log(
    table(
      ["METRIC", "TYPE", "DOMAIN", "NAME"],
      matches.map((metric) => [metric.key, metric.type, metric.domain || "", truncate(metric.name, 50)])
    )
  );
  console.log("");
  console.log(`${matches.length} of ${all.length} metric(s)`);
});
