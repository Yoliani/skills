// Turning flags into a work item payload, shared by create and update.

import {
  die,
  isUuid,
  paginate,
  request,
  resolveAssigneeIds,
  resolveLabelIds,
  resolveStateId,
} from "./api.js";
import { readFileSync } from "fs";

const PRIORITIES = ["urgent", "high", "medium", "low", "none"];

/**
 * Find a cycle or module by name or UUID and return its UUID.
 * @param {string} base - Project-scoped path prefix
 * @param {"cycles"|"modules"} kind
 * @param {string} ref
 * @returns {Promise<string>}
 */
export async function resolveGrouping(base, kind, ref) {
  if (isUuid(ref)) return ref;
  const entries = await paginate(`${base}/${kind}/`);
  const match = entries.find((e) => (e.name || "").toLowerCase() === ref.toLowerCase());
  if (!match) {
    die(
      `${kind.replace(/s$/, "")} '${ref}' not found`,
      `Known: ${entries.map((e) => e.name).join(", ") || "(none)"}`
    );
  }
  return match.id;
}

/**
 * Build the request body for a create or update, resolving every name to a
 * UUID first. Only flags that were passed end up in the payload.
 * @param {string} workspace
 * @param {string} projectId
 * @param {Record<string, any>} flags
 * @returns {Promise<Record<string, any>>}
 */
export async function buildPayload(workspace, projectId, flags) {
  const payload = {};

  if (flags.name) payload.name = flags.name;

  if (flags.priority) {
    if (!PRIORITIES.includes(flags.priority)) {
      die(`priority '${flags.priority}' is not one of: ${PRIORITIES.join(", ")}`);
    }
    payload.priority = flags.priority;
  }

  const description = flags["description-file"]
    ? readFileSync(flags["description-file"], "utf-8")
    : flags.description;
  if (description !== undefined) {
    payload.description_html = flags.html ? description : textToHtml(description);
  }

  if (flags.state) payload.state = await resolveStateId(workspace, projectId, flags.state);
  if (flags.assignee) {
    payload.assignees = await resolveAssigneeIds(workspace, projectId, flags.assignee);
  }
  if (flags.label) payload.labels = await resolveLabelIds(workspace, projectId, flags.label);
  if (flags.parent) payload.parent = flags.parent;
  if (flags["start-date"]) payload.start_date = flags["start-date"];
  if (flags["target-date"]) payload.target_date = flags["target-date"];
  if (flags.estimate) payload.point = parseInt(flags.estimate, 10);

  return payload;
}

/**
 * Add one work item to a cycle and/or a module, if either flag was passed.
 * @param {string} base - Project-scoped path prefix
 * @param {string} workItemId
 * @param {Record<string, any>} flags
 */
export async function attachGroupings(base, workItemId, flags) {
  if (flags.cycle) {
    const cycleId = await resolveGrouping(base, "cycles", flags.cycle);
    await request(`${base}/cycles/${cycleId}/cycle-issues/`, {
      method: "POST",
      body: { issues: [workItemId] },
    });
  }
  if (flags.module) {
    const moduleId = await resolveGrouping(base, "modules", flags.module);
    await request(`${base}/modules/${moduleId}/module-issues/`, {
      method: "POST",
      body: { issues: [workItemId] },
    });
  }
}

/**
 * Plane stores rich text as HTML, so plain text needs wrapping before it will
 * render as paragraphs in the UI.
 * @param {string} text
 * @returns {string}
 */
export function textToHtml(text) {
  return String(text)
    .split(/\n{2,}/)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, "<br/>")}</p>`)
    .join("");
}

/** @param {string} text */
function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
