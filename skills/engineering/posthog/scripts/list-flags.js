#!/usr/bin/env node

import { requireProject, paginate, request, webUrl, parseFlags, run, die } from "../lib/api.js";
import { table, truncate } from "../lib/format.js";

const HELP = `Usage: list-flags.js [key-or-id] [options]

List feature flags, or read one with its release conditions and variants.

Options:
  --project, -p <id>   Project ID or name (default: ~/.posthogrc [defaults] project)
  --active             Only enabled flags
  --search <text>      Filter by key or name, case-insensitive
  --limit, -n <count>  Flags to return (default: 100)
  --json               Raw JSON output
  -h, --help           Show this help

Examples:
  list-flags.js
  list-flags.js --active --search checkout
  list-flags.js new-checkout-flow
`;

/**
 * Describe one release condition group in a line.
 * @param {any} group
 * @returns {string}
 */
function describeGroup(group) {
  const rollout = group.rollout_percentage ?? 100;
  const properties = (group.properties || []).map(
    (p) => `${p.key} ${p.operator || "exact"} ${JSON.stringify(p.value)}`
  );
  const who = properties.length > 0 ? properties.join(" and ") : "everyone";
  return `${rollout}% of ${who}${group.variant ? ` -> variant ${group.variant}` : ""}`;
}

run(async () => {
  const { flags, positionals } = parseFlags(process.argv.slice(2), {
    aliases: { p: "project", n: "limit", h: "help" },
    booleans: ["help", "json", "active"],
  });
  if (flags.help) {
    console.log(HELP);
    return;
  }

  const projectId = await requireProject(flags.project);
  const all = await paginate(`/projects/${projectId}/feature_flags/`, {
    limit: Number(flags.limit || 100),
  });

  const ref = positionals[0];
  if (ref) {
    const flag =
      all.find((f) => String(f.id) === ref) ||
      all.find((f) => f.key === ref) ||
      (await request(`/projects/${projectId}/feature_flags/${ref}/`).catch(() => null));
    if (!flag) {
      die(
        `feature flag '${ref}' not found in project ${projectId}`,
        "Run list-flags.js with no argument to see the keys."
      );
    }

    if (flags.json) {
      console.log(JSON.stringify(flag, null, 2));
      return;
    }

    console.log(`${flag.key}${flag.name ? `  (${flag.name})` : ""}`);
    console.log("");
    console.log(`id:       ${flag.id}`);
    console.log(`active:   ${flag.active}${flag.archived ? " (archived)" : ""}`);
    console.log(`type:     ${flag.filters?.multivariate ? "multivariate" : "boolean"}`);
    if (flag.filters?.multivariate?.variants) {
      console.log("variants:");
      for (const variant of flag.filters.multivariate.variants) {
        console.log(`  - ${variant.key}: ${variant.rollout_percentage}%`);
      }
    }
    console.log("release conditions:");
    for (const group of flag.filters?.groups || []) {
      console.log(`  - ${describeGroup(group)}`);
    }
    console.log(`url:      ${webUrl(projectId, "feature_flags", flag.id)}`);
    return;
  }

  let rows = all;
  if (flags.active) rows = rows.filter((flag) => flag.active);
  if (flags.search) {
    const needle = flags.search.toLowerCase();
    rows = rows.filter(
      (flag) =>
        (flag.key || "").toLowerCase().includes(needle) ||
        (flag.name || "").toLowerCase().includes(needle)
    );
  }

  if (flags.json) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }

  console.log(
    table(
      ["id", "active", "key", "rollout", "name"],
      rows.map((flag) => [
        flag.id,
        flag.active ? "yes" : "no",
        flag.key,
        (flag.filters?.groups || []).map((g) => `${g.rollout_percentage ?? 100}%`).join(","),
        truncate(flag.name, 50),
      ])
    )
  );
  console.log("");
  console.log(`${rows.length} flag(s). Read one with: list-flags.js <key>`);
});
