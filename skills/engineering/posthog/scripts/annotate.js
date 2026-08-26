#!/usr/bin/env node

// WRITE. Posts an annotation that everyone sees on project charts. Preview with
// --dry-run and get the user's go-ahead before running it for real.

import { readFileSync } from "fs";
import {
  requireProject,
  paginate,
  request,
  webUrl,
  formatTimestamp,
  parseFlags,
  run,
  die,
} from "../lib/api.js";
import { table, truncate } from "../lib/format.js";

const HELP = `Usage: annotate.js "<text>" [options]
       annotate.js -f notes.md [options]
       git log -1 --format=%s | annotate.js -f -
       annotate.js --list [options]

Mark a moment on every chart in the project: a deploy, a migration, an incident.

WRITE: this is visible to the whole project. Run --dry-run first, show the user
what it prints, and wait for their go-ahead.

Options:
  --project, -p <id>   Project ID or name (default: ~/.posthogrc [defaults] project)
  --file, -f <path>    Read the text from a file, or from stdin with -
  --at <timestamp>     When it happened, ISO 8601 (default: now)
  --scope <scope>      project | organization (default: project)
  --list               List recent annotations instead of creating one
  --limit, -n <count>  Annotations to list (default: 20)
  --dry-run            Print the annotation without sending it
  --json               Raw JSON output
  -h, --help           Show this help

Examples:
  annotate.js "Deployed v2.4.0" --dry-run
  annotate.js "Deployed v2.4.0"
  annotate.js "Backfill started" --at 2026-08-26T09:00:00Z
  annotate.js --list
`;

run(async () => {
  const { flags, positionals } = parseFlags(process.argv.slice(2), {
    aliases: { p: "project", f: "file", n: "limit", h: "help" },
    booleans: ["help", "json", "list", "dry-run"],
  });
  if (flags.help) {
    console.log(HELP);
    return;
  }

  const projectId = await requireProject(flags.project);

  if (flags.list) {
    const annotations = await paginate(`/projects/${projectId}/annotations/`, {
      limit: Number(flags.limit || 20),
    });
    if (flags.json) {
      console.log(JSON.stringify(annotations, null, 2));
      return;
    }
    console.log(
      table(
        ["id", "date", "scope", "content"],
        annotations.map((annotation) => [
          annotation.id,
          formatTimestamp(annotation.date_marker),
          annotation.scope,
          truncate(annotation.content, 70),
        ])
      )
    );
    return;
  }

  let content = positionals.join(" ").trim();
  if (flags.file) {
    content = readFileSync(flags.file === "-" ? 0 : flags.file, "utf-8").trim();
  }
  if (!content) {
    die("no annotation text given", "Pass it as an argument, or read it with -f <path> / -f -");
  }

  const body = {
    content,
    date_marker: flags.at || new Date().toISOString(),
    scope: flags.scope || "project",
  };

  console.log(`Annotation on project ${projectId}, scope ${body.scope}:`);
  console.log(`  at:      ${body.date_marker}`);
  console.log(`  content: ${content}`);

  if (flags["dry-run"]) {
    console.log("");
    console.log("Dry run, nothing sent. Re-run without --dry-run to apply.");
    return;
  }

  const created = await request(`/projects/${projectId}/annotations/`, { method: "POST", body });

  if (flags.json) {
    console.log(JSON.stringify(created, null, 2));
    return;
  }

  console.log("");
  console.log(`Created annotation ${created.id}. ${webUrl(projectId, "data-management", "annotations")}`);
});
