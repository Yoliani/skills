#!/usr/bin/env node

import { request, requireProject, scopeParams, webUrl, parseFlags, run } from "../lib/api.js";
import { table, truncate } from "../lib/format.js";

const HELP = `Usage: issues.js [project-key] [options]

List the issues behind the measures: what to fix, where, and how bad Sonar
thinks it is. Open issues on the whole project by default.

Options:
  --project, -p <key>   Project key (default: ~/.sonarrc [defaults] project)
  --branch, -b <name>   Branch to read (default: the main branch)
  --pr <number>         Pull request to read instead of a branch
  --new                 Only issues on the new code period
  --severity <list>     BLOCKER,CRITICAL,MAJOR,MINOR,INFO
  --type <list>         BUG,VULNERABILITY,CODE_SMELL
  --tag <list>          Comma-separated issue tags
  --rule <key>          One rule key, e.g. java:S1192
  --file <path>         Only issues under this file or directory path
  --query, -q <text>    Free text match on the message or the rule
  --all                 Include resolved issues (default: open only)
  --limit, -n <count>   Issues to print (default: 30, max 500)
  --json                Raw JSON output
  -h, --help            Show this help

Examples:
  issues.js --new --pr 412
  issues.js --severity BLOCKER,CRITICAL --type BUG
  issues.js --file src/payments --limit 50
`;

run(async () => {
  const { flags, positionals } = parseFlags(process.argv.slice(2), {
    aliases: { p: "project", b: "branch", q: "query", n: "limit", h: "help" },
    booleans: ["help", "json", "new", "all"],
  });
  if (flags.help) {
    console.log(HELP);
    return;
  }

  const project = requireProject(positionals[0] || flags.project);
  const scope = scopeParams(flags);
  const limit = Math.min(Number(flags.limit) || 30, 500);

  const data = await request("/issues/search", {
    query: {
      componentKeys: project,
      resolved: flags.all ? undefined : "false",
      inNewCodePeriod: flags.new ? "true" : undefined,
      severities: flags.severity,
      types: flags.type,
      tags: flags.tag,
      rules: flags.rule,
      s: "SEVERITY",
      asc: "false",
      ps: limit,
      ...scope,
    },
  });

  if (flags.json) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  // componentKeys prefixes every path with the project key; the path alone
  // reads better, and --file / --query filter on what is printed.
  const strip = (key) => String(key).replace(`${project}:`, "");
  let issues = data.issues || [];
  if (flags.file) {
    issues = issues.filter((issue) => strip(issue.component).startsWith(String(flags.file)));
  }
  if (flags.query) {
    const needle = String(flags.query).toLowerCase();
    issues = issues.filter((issue) =>
      `${issue.message} ${issue.rule}`.toLowerCase().includes(needle)
    );
  }

  const rows = issues.map((issue) => [
    issue.severity,
    issue.type,
    `${strip(issue.component)}${issue.line ? `:${issue.line}` : ""}`,
    truncate(issue.message, 70),
    issue.rule,
  ]);

  console.log(table(["SEVERITY", "TYPE", "LOCATION", "MESSAGE", "RULE"], rows));
  console.log("");
  console.log(`${rows.length} shown of ${data.total ?? data.paging?.total ?? rows.length} matching issue(s)`);
  console.log(webUrl("/project/issues", { id: project, branch: scope.branch, pullRequest: scope.pullRequest, resolved: flags.all ? undefined : "false" }));
});
