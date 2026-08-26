#!/usr/bin/env node

// WRITE. A feature flag governs live traffic. Preview with --dry-run and get
// the user's go-ahead before running it for real.

import { requireProject, paginate, request, webUrl, parseFlags, run, die } from "../lib/api.js";

const HELP = `Usage: update-flag.js <key-or-id> [options]

Enable, disable, or re-roll a feature flag.

WRITE: this changes live traffic. Run --dry-run first, show the user what it
prints, and wait for their go-ahead.

Options:
  --project, -p <id>   Project ID or name (default: ~/.posthogrc [defaults] project)
  --on                 Set active true
  --off                Set active false
  --rollout <percent>  Rollout percentage, 0 to 100, applied to every release
                       condition group unless --group picks one
  --group <index>      Only re-roll this release condition group (0-based)
  --dry-run            Print the change without sending it
  --json               Raw JSON output
  -h, --help           Show this help

Examples:
  update-flag.js new-checkout-flow --on --dry-run
  update-flag.js new-checkout-flow --on
  update-flag.js new-checkout-flow --rollout 25
  update-flag.js new-checkout-flow --off
`;

run(async () => {
  const { flags, positionals } = parseFlags(process.argv.slice(2), {
    aliases: { p: "project", h: "help" },
    booleans: ["help", "json", "on", "off", "dry-run"],
  });
  if (flags.help) {
    console.log(HELP);
    return;
  }

  const ref = positionals[0];
  if (!ref) die("a feature flag key or ID is required", "List them with: list-flags.js");
  if (flags.on && flags.off) die("pass either --on or --off, not both");

  // Validate before spending a call, so a typo fails instantly.
  const rollout = flags.rollout === undefined ? null : Number(flags.rollout);
  if (rollout !== null && (!Number.isFinite(rollout) || rollout < 0 || rollout > 100)) {
    die(`--rollout must be a number between 0 and 100, got '${flags.rollout}'`);
  }
  if (!flags.on && !flags.off && rollout === null) {
    die("nothing to change", "Pass --on, --off, or --rollout <percent>");
  }

  const projectId = await requireProject(flags.project);
  const all = await paginate(`/projects/${projectId}/feature_flags/`);
  const flag = all.find((f) => f.key === ref) || all.find((f) => String(f.id) === ref);
  if (!flag) {
    die(
      `feature flag '${ref}' not found in project ${projectId}`,
      `Known keys: ${all.map((f) => f.key).join(", ") || "(none)"}`
    );
  }

  const body = {};
  const changes = [];

  if (flags.on || flags.off) {
    const active = Boolean(flags.on);
    body.active = active;
    changes.push(`  active: ${flag.active} -> ${active}`);
  }

  if (rollout !== null) {
    const groups = structuredClone(flag.filters?.groups || []);
    if (groups.length === 0) die("this flag has no release condition groups to re-roll");

    const target = flags.group === undefined ? null : Number(flags.group);
    if (target !== null && !groups[target]) {
      die(`no release condition group at index ${target}`, `The flag has ${groups.length}`);
    }

    groups.forEach((group, index) => {
      if (target !== null && index !== target) return;
      changes.push(`  group ${index} rollout: ${group.rollout_percentage ?? 100}% -> ${rollout}%`);
      group.rollout_percentage = rollout;
    });

    // PATCH replaces `filters` wholesale, so send the whole object back.
    body.filters = { ...(flag.filters || {}), groups };
  }

  console.log(`Flag '${flag.key}' (id ${flag.id}) in project ${projectId}:`);
  console.log(changes.join("\n"));

  if (flags["dry-run"]) {
    console.log("");
    console.log("Dry run, nothing sent. Re-run without --dry-run to apply.");
    return;
  }

  const after = await request(`/projects/${projectId}/feature_flags/${flag.id}/`, {
    method: "PATCH",
    body,
  });

  if (flags.json) {
    console.log(JSON.stringify(after, null, 2));
    return;
  }

  console.log("");
  console.log(`Applied. ${webUrl(projectId, "feature_flags", flag.id)}`);
});
