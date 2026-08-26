#!/usr/bin/env node

import {
  requireProject,
  paginate,
  request,
  webUrl,
  formatTimestamp,
  parseFlags,
  run,
} from "../lib/api.js";
import { table } from "../lib/format.js";

const HELP = `Usage: list-recordings.js [options]

List session recordings with replay permalinks.

Options:
  --project, -p <id>    Project ID or name (default: ~/.posthogrc [defaults] project)
  --person <id>         Only this person's sessions (distinct_id)
  --session <id>        Look up one session by ID
  --limit, -n <count>   Recordings to return (default: 20)
  --json                Raw JSON output
  -h, --help            Show this help

Notes:
  The list endpoint takes no rich filters. To find a recording by what happened
  in it, query the sessions table with HogQL and feed the session_id back here:

    query.js "select session_id, min(timestamp) from events
              where event = '\\$exception' and timestamp >= now() - interval 1 day
              group by session_id order by 2 desc limit 20"
`;

run(async () => {
  const { flags } = parseFlags(process.argv.slice(2), {
    aliases: { p: "project", n: "limit", h: "help" },
    booleans: ["help", "json"],
  });
  if (flags.help) {
    console.log(HELP);
    return;
  }

  const projectId = await requireProject(flags.project);
  const recordings = flags.session
    ? [await request(`/projects/${projectId}/session_recordings/${flags.session}/`)]
    : await paginate(`/projects/${projectId}/session_recordings/`, {
        query: flags.person ? { distinct_id: flags.person } : {},
        limit: Number(flags.limit || 20),
      });

  if (flags.json) {
    console.log(JSON.stringify(recordings, null, 2));
    return;
  }

  console.log(
    table(
      ["session", "start", "duration", "person", "url"],
      recordings.map((recording) => [
        recording.id,
        formatTimestamp(recording.start_time),
        recording.recording_duration ? `${Math.round(recording.recording_duration)}s` : "",
        recording.person?.distinct_ids?.[0] || recording.distinct_id || "",
        webUrl(projectId, "replay", recording.id),
      ])
    )
  );
  console.log("");
  console.log(`${recordings.length} recording(s).`);
});
