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

const RATINGS = { 1: "A", 2: "B", 3: "C", 4: "D", 5: "E" };

/**
 * Render a work duration the way the UI does, on SonarQube's 8-hour day.
 * @param {number} minutes
 * @returns {string}
 */
function workDuration(minutes) {
  const total = Math.round(minutes);
  const days = Math.floor(total / 480);
  const hours = Math.floor((total % 480) / 60);
  const rest = total % 60;
  const parts = [days && `${days}d`, hours && `${hours}h`, rest && `${rest}min`].filter(Boolean);
  return parts.length ? parts.join(" ") : "0";
}

/**
 * Render a raw measure value by its metric type, which is what turns the API's
 * "3.0" into the "C" the dashboard shows.
 * @param {any} value - Raw value from the API
 * @param {string} [type] - Metric type from /api/metrics/search
 * @returns {string}
 */
export function formatMeasure(value, type) {
  if (value === null || value === undefined || value === "") return "-";
  switch (type) {
    case "RATING":
      return RATINGS[Math.round(Number(value))] || String(value);
    case "PERCENT":
      return `${Number(value).toFixed(1)}%`;
    case "WORK_DUR":
      return workDuration(Number(value));
    case "MILLISEC":
      return `${Number(value)}ms`;
    case "BOOL":
      return Number(value) === 1 ? "true" : "false";
    default:
      return String(value);
  }
}

/**
 * A measure's value on the new code period, which the API returns as `period`
 * on current servers and as a `periods` array on older ones.
 * @param {any} measure - One entry of component.measures
 * @returns {string|null}
 */
export function newCodeValue(measure) {
  if (measure?.period?.value !== undefined) return measure.period.value;
  const periods = measure?.periods;
  return Array.isArray(periods) && periods.length ? periods[0].value : null;
}

/**
 * The value to display for a measure: the overall one, falling back to the new
 * code period for the `new_*` metrics, which carry no overall value.
 * @param {any} measure
 * @returns {string|null}
 */
export function measureValue(measure) {
  return measure?.value !== undefined ? measure.value : newCodeValue(measure);
}
