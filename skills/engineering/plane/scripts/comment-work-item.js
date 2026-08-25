#!/usr/bin/env node

import {
  die,
  formatTimestamp,
  getDefault,
  getLookups,
  htmlToText,
  paginate,
  parseFlags,
  parseWorkItemRef,
  request,
  requireWorkspace,
  resolveProjectId,
  run,
} from "../lib/api.js";
import { textToHtml } from "../lib/work-item.js";
import { readFileSync } from "fs";

const HELP = `Usage: comment-work-item.js <ref> [text] [options]

Read or add comments on a work item. With no text and no --file, the existing
comments are listed. <ref> is a UUID, a PROJ-123 identifier, or a Plane URL.

Options:
  --workspace, -w <slug>   Workspace slug (default: ~/.planesorc [defaults] workspace)
  --project, -p <project>  Project UUID, identifier, or name (inferred from ref)
  --file, -f <path>        Read the comment body from a file ('-' for stdin)
  --html                   Treat the body as HTML, don't wrap it in paragraphs
  --internal               Post as an internal comment (default: EXTERNAL)
  --json                   Output raw JSON
  --url <url>              Server root URL
  -h, --help               Show this help

Examples:
  comment-work-item.js WEB-123
  comment-work-item.js WEB-123 "Reproduced on staging, logs attached."
  git log -1 --format=%B | comment-work-item.js WEB-123 -f -
`;

run(async () => {
  const { flags, positionals } = parseFlags(process.argv.slice(2), {
    aliases: { w: "workspace", p: "project", f: "file", h: "help" },
    booleans: ["help", "json", "html", "internal"],
  });
  if (flags.help || positionals.length === 0) {
    console.log(HELP);
    process.exit(flags.help ? 0 : 1);
  }

  const workspace = requireWorkspace(flags.workspace);
  const ref = parseWorkItemRef(positionals[0]);
  if (!ref.id && !ref.identifier) {
    die(`could not read '${positionals[0]}' as a UUID, a PROJ-123 identifier, or a Plane URL`);
  }

  let workItemId = ref.id;
  let projectId = ref.projectId;
  if (ref.identifier) {
    const found = await request(
      `/workspaces/${encodeURIComponent(workspace)}/work-items/${ref.identifier}/`
    );
    workItemId = found.id;
    projectId = found.project || found.project_id;
  }
  projectId = await resolveProjectId(workspace, projectId || flags.project || getDefault("project"));
  const path = `/workspaces/${encodeURIComponent(workspace)}/projects/${projectId}/work-items/${workItemId}/comments/`;

  let body = positionals.slice(1).join(" ");
  if (flags.file) {
    body = readFileSync(flags.file === "-" ? 0 : flags.file, "utf-8");
  }

  if (body) {
    const comment = await request(path, {
      method: "POST",
      body: {
        comment_html: flags.html ? body : textToHtml(body),
        access: flags.internal ? "INTERNAL" : "EXTERNAL",
      },
    });
    if (flags.json) {
      console.log(JSON.stringify(comment, null, 2));
    } else {
      console.log(`Comment added (${comment.id}).`);
    }
    return;
  }

  const [comments, lookups] = await Promise.all([
    paginate(path),
    getLookups(workspace, projectId),
  ]);

  if (flags.json) {
    console.log(JSON.stringify(comments, null, 2));
    return;
  }

  if (comments.length === 0) {
    console.log("No comments.");
    return;
  }

  for (const comment of comments) {
    const who = lookups.members.get(comment.actor) || comment.actor || "unknown";
    console.log(
      `[${formatTimestamp(comment.created_at)}] ${who}${comment.access === "INTERNAL" ? " (internal)" : ""}`
    );
    console.log(htmlToText(comment.comment_html) || "(empty)");
    console.log("");
  }
});
