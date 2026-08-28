#!/usr/bin/env node

import { request, ORGANIZATION, isCloud, parseFlags, formatTimestamp, run } from "../lib/api.js";
import { table, truncate } from "../lib/format.js";

const HELP = `Usage: list-projects.js [search-text] [options]
       list-projects.js --branches <project-key>

Find the project key to pass everywhere else, or list one project's branches
and pull requests.

Options:
  --branches <key>     Branches and pull requests of this project instead
  --limit, -n <count>  Projects to print (default: 50)
  --json               Raw JSON output
  -h, --help           Show this help

Examples:
  list-projects.js payments
  list-projects.js --branches my-project-key
`;

run(async () => {
  const { flags, positionals } = parseFlags(process.argv.slice(2), {
    aliases: { n: "limit", h: "help" },
    booleans: ["help", "json"],
  });
  if (flags.help) {
    console.log(HELP);
    return;
  }

  if (flags.branches) {
    const project = String(flags.branches);
    const branches = await request("/project_branches/list", { query: { project } });
    const pulls = await request("/project_pull_requests/list", { query: { project } });

    if (flags.json) {
      console.log(JSON.stringify({ branches: branches.branches, pullRequests: pulls.pullRequests }, null, 2));
      return;
    }

    console.log(
      table(
        ["BRANCH", "TYPE", "GATE", "LAST ANALYSIS"],
        (branches.branches || []).map((branch) => [
          `${branch.name}${branch.isMain ? " *" : ""}`,
          branch.type,
          branch.status?.qualityGateStatus || "",
          formatTimestamp(branch.analysisDate),
        ])
      )
    );
    console.log("");
    console.log(
      table(
        ["PR", "TITLE", "TARGET", "GATE", "LAST ANALYSIS"],
        (pulls.pullRequests || []).map((pr) => [
          pr.key,
          truncate(pr.title, 50),
          pr.base || "",
          pr.status?.qualityGateStatus || "",
          formatTimestamp(pr.analysisDate),
        ])
      )
    );
    return;
  }

  const data = await request("/components/search", {
    query: {
      qualifiers: "TRK",
      q: positionals.join(" ") || undefined,
      organization: isCloud ? ORGANIZATION : undefined,
      ps: Number(flags.limit) || 50,
    },
  });

  if (flags.json) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  console.log(
    table(
      ["PROJECT KEY", "NAME"],
      (data.components || []).map((component) => [component.key, truncate(component.name, 60)])
    )
  );
  console.log("");
  console.log(`${(data.components || []).length} of ${data.paging?.total ?? "?"} project(s)`);
});
