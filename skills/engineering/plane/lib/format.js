// Shared rendering of work items, so every script prints them the same way.

import { formatTimestamp, workItemUrl } from "./api.js";

/**
 * Render one work item as a few lines of text.
 * @param {any} item - A work item from the API
 * @param {{workspace: string, projectId: string, identifier?: string, lookups?: any}} ctx
 * @returns {string}
 */
export function formatWorkItem(item, ctx) {
  const { workspace, projectId, identifier, lookups } = ctx;
  const lines = [];

  const ref = identifier && item.sequence_id ? `${identifier}-${item.sequence_id}` : item.id;
  lines.push(`[${ref}] ${item.name || "(no name)"}`);

  const state = lookups?.states?.get(item.state) || item.state?.name || item.state || "?";
  const group = lookups?.stateGroups?.get(item.state);
  lines.push(
    `  state: ${state}${group ? ` (${group})` : ""} | priority: ${item.priority || "none"}`
  );

  const assignees = (item.assignees || []).map(
    (id) => lookups?.members?.get(id) || id?.display_name || id
  );
  const labels = (item.labels || []).map((id) => lookups?.labels?.get(id) || id?.name || id);
  if (assignees.length > 0) lines.push(`  assignees: ${assignees.join(", ")}`);
  if (labels.length > 0) lines.push(`  labels: ${labels.join(", ")}`);

  const dates = [];
  if (item.start_date) dates.push(`start ${item.start_date}`);
  if (item.target_date) dates.push(`target ${item.target_date}`);
  if (dates.length > 0) lines.push(`  ${dates.join(" | ")}`);

  lines.push(
    `  created: ${formatTimestamp(item.created_at)} | updated: ${formatTimestamp(item.updated_at)}`
  );
  lines.push(`  id: ${item.id}`);
  lines.push(`  url: ${workItemUrl(workspace, projectId, item.id)}`);

  return lines.join("\n");
}
