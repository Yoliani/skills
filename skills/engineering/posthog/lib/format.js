// Shared rendering, so every script prints results the same way.

/**
 * Render rows as a column-aligned text table.
 * @param {string[]} columns - Header labels
 * @param {(string|number|null)[][]} rows
 * @returns {string}
 */
export function table(columns, rows) {
  if (rows.length === 0) return "(no results)";

  const cells = rows.map((row) =>
    row.map((cell) => (cell === null || cell === undefined ? "" : String(cell)))
  );
  const widths = columns.map((column, i) =>
    Math.max(column.length, ...cells.map((row) => (row[i] || "").length))
  );

  const line = (row) => row.map((cell, i) => (cell || "").padEnd(widths[i])).join("  ").trimEnd();
  return [
    line(columns),
    widths.map((w) => "-".repeat(w)).join("  ").trimEnd(),
    ...cells.map(line),
  ].join("\n");
}

/**
 * Shorten a string for table display.
 * @param {any} value
 * @param {number} max
 * @returns {string}
 */
export function truncate(value, max = 60) {
  const text =
    value === null || value === undefined ? "" : String(value).replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * An exception event's `properties` arrives as a JSON string on error tracking
 * query results and as an object on raw events. Take either.
 * @param {any} properties
 * @returns {Record<string, any>}
 */
export function parseProperties(properties) {
  if (!properties) return {};
  if (typeof properties === "object") return properties;
  try {
    return JSON.parse(properties);
  } catch {
    return {};
  }
}

/**
 * Read one stack frame's fields. PostHog stores client-captured frames with
 * Sentry-style names (filename/function/lineno) and symbolified ones with its
 * own (source/resolved_name/line), so accept both.
 * @param {any} frame
 * @returns {{location: string, name: string, inApp: boolean, context: string|null}}
 */
function readFrame(frame) {
  const file = frame.source || frame.filename || frame.file || frame.module || "?";
  const line = frame.line ?? frame.lineno ?? frame.line_number;
  const column = frame.column ?? frame.colno;
  const name = frame.resolved_name || frame.function || frame.mangled_name || "?";
  const location = [file, line, column]
    .filter((part) => part !== undefined && part !== null)
    .join(":");
  return { location, name, inApp: frame.in_app !== false, context: frame.context_line || null };
}

/**
 * Render the `$exception_list` of an exception event as a readable stack trace.
 * Chained exceptions each get their own block.
 * @param {Record<string, any>} properties - Parsed event properties
 * @param {{appOnly?: boolean, maxFrames?: number}} [options]
 * @returns {string}
 */
export function formatStackTrace(properties, options = {}) {
  const { appOnly = false, maxFrames = 30 } = options;
  const exceptions = properties.$exception_list;

  if (!Array.isArray(exceptions) || exceptions.length === 0) {
    const types = properties.$exception_types || properties.$exception_type;
    const values = properties.$exception_values || properties.$exception_message;
    if (!types && !values) return "(no stack trace on this event)";
    return `${[].concat(types || []).join(", ")}: ${[].concat(values || []).join(", ")}`;
  }

  const blocks = exceptions.map((exception) => {
    const lines = [`${exception.type || "Exception"}: ${exception.value || ""}`.trimEnd()];

    const mechanism = exception.mechanism || {};
    if (mechanism.handled !== undefined) {
      lines.push(`  handled: ${mechanism.handled}${mechanism.synthetic ? " (synthetic)" : ""}`);
    }

    // Stacks arrive innermost-last; the failing frame reads better first.
    const frames = [...(exception.stacktrace?.frames || [])].reverse().map(readFrame);
    const shown = appOnly ? frames.filter((frame) => frame.inApp) : frames;
    const capped = shown.slice(0, maxFrames);

    for (const frame of capped) {
      lines.push(`  at ${frame.name} (${frame.location})${frame.inApp ? "" : "  [vendor]"}`);
      if (frame.context) lines.push(`       ${frame.context.trim()}`);
    }
    if (shown.length > capped.length) {
      lines.push(`  … ${shown.length - capped.length} more frame(s)`);
    }
    if (shown.length === 0) lines.push("  (no frames; the SDK captured a message without a stack)");

    return lines.join("\n");
  });

  return blocks.join("\n\nCaused by:\n");
}

/**
 * Pull the properties worth printing alongside a stack trace.
 * @param {Record<string, any>} properties
 * @returns {string[]} `key: value` lines
 */
export function contextLines(properties) {
  const interesting = [
    ["url", properties.$current_url],
    ["browser", [properties.$browser, properties.$browser_version].filter(Boolean).join(" ")],
    ["os", [properties.$os, properties.$os_version].filter(Boolean).join(" ")],
    ["library", [properties.$lib, properties.$lib_version].filter(Boolean).join(" ")],
    ["level", properties.$exception_level],
    ["release", properties.$exception_release || properties.release],
    ["session", properties.$session_id],
  ];
  return interesting.filter(([, value]) => value).map(([label, value]) => `${label}: ${value}`);
}
