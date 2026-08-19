#!/usr/bin/env node

// Adapted from mitsuhiko/agent-stuff (skills/sentry), Apache-2.0.

import { API_BASE, isGlitchTip, getDefault, periodToStart, getAuthToken, fetchJson, formatTimestamp, resolveProjectId } from "../lib/api.js";

const LOG_FIELDS = [
  "sentry.item_id",
  "trace",
  "sentry.severity",
  "timestamp",
  "message",
];

/**
 * Parse a Sentry logs explorer URL
 * Examples:
 *   https://earendil.sentry.io/explore/logs/?project=123&statsPeriod=14d
 *   https://sentry.io/organizations/myorg/explore/logs/?project=123
 */
function parseLogsUrl(urlStr) {
  try {
    const url = new URL(urlStr);
    const params = url.searchParams;
    const result = {};

    // Extract org from subdomain (earendil.sentry.io) or path (/organizations/myorg/)
    const subdomainMatch = url.hostname.match(/^([^.]+)\.sentry\.io$/);
    if (subdomainMatch && subdomainMatch[1] !== "www") {
      result.org = subdomainMatch[1];
    } else {
      const pathMatch = url.pathname.match(/\/organizations\/([^/]+)\//);
      if (pathMatch) {
        result.org = pathMatch[1];
      }
    }

    // Extract project ID
    if (params.has("project")) {
      result.project = params.get("project");
    }

    // Extract time period
    if (params.has("statsPeriod")) {
      result.period = params.get("statsPeriod");
    }

    // Extract query
    if (params.has("logsQuery")) {
      result.query = params.get("logsQuery");
    }

    return result;
  } catch {
    return null;
  }
}

function parseArgs(args) {
  const options = {
    org: null,
    project: null,
    query: null,
    levels: [],
    trace: null,
    period: "24h",
    limit: 100,
    json: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--org" || arg === "-o") {
      options.org = args[++i];
    } else if (arg === "--project" || arg === "-p") {
      options.project = args[++i];
    } else if (arg === "--period" || arg === "-t") {
      options.period = args[++i];
    } else if (arg === "--level") {
      options.levels.push(args[++i]);
    } else if (arg === "--trace") {
      options.trace = args[++i];
    } else if (arg === "--limit" || arg === "-n") {
      options.limit = parseInt(args[++i], 10);
    } else if (!arg.startsWith("-")) {
      // Check if it's a Sentry URL
      if (arg.includes("sentry.io/") && arg.includes("/logs")) {
        const urlOptions = parseLogsUrl(arg);
        if (urlOptions) {
          if (urlOptions.org) options.org = urlOptions.org;
          if (urlOptions.project) options.project = urlOptions.project;
          if (urlOptions.period) options.period = urlOptions.period;
          if (urlOptions.query) options.query = urlOptions.query;
        }
      } else if (!options.query) {
        options.query = arg;
      }
    }
  }

  return options;
}

function showHelp() {
  console.log(`Usage: search-logs.js [query|url] [options]

Search for logs in Sentry or GlitchTip.

Arguments:
  query              Search query (e.g., "level:error", "user.id:123")
  url                Sentry logs explorer URL (extracts org, project, period)

Options:
  --org, -o <org>    Organization slug (required unless URL provided)
  --project, -p <p>  Project slug or ID to filter by
  --period, -t <p>   Time period (default: 24h, e.g., 1h, 7d, 90d)
  --limit, -n <n>    Max results (default: 100, max: 1000)
  --level <level>    Filter by level (GlitchTip; repeatable)
  --trace <id>       Filter by trace ID (GlitchTip)
  --json             Output raw JSON
  --url <url>        Server root URL (default: ~/.sentryclirc [defaults] url)
  --backend <name>   Force sentry or glitchtip (default: detected from url)
  -h, --help         Show this help

Search Query Syntax:
  level:error              Filter by log level (trace, debug, info, warn, error, fatal)
  message:*timeout*        Search message text
  trace:abc123             Filter by trace ID
  project:my-project       Filter by project slug

  Combine filters: level:error message:*failed*

  On GlitchTip the positional query is a plain full-text search over the log
  body; use --level and --trace for structured filters (max --limit is 200).

Examples:
  search-logs.js --org myorg
  search-logs.js "level:error" --org myorg --project backend
  search-logs.js "message:*timeout*" --org myorg --period 7d
  search-logs.js --org myorg --limit 50 --json

  # Use a Sentry URL directly:
  search-logs.js "https://myorg.sentry.io/explore/logs/?project=123&statsPeriod=7d"
`);
}

function formatLogEntry(entry) {
  const lines = [];

  const ts = entry.timestamp || "N/A";
  const severity = entry["sentry.severity"] || "info";
  const message = entry.message || "(no message)";
  const trace = entry.trace || null;

  // Format timestamp for display
  let displayTs = ts;
  try {
    const date = new Date(ts);
    if (!isNaN(date.getTime())) {
      displayTs = date.toISOString().replace("T", " ").slice(0, 19);
    }
  } catch {}

  // Color-code severity in output
  const severityDisplay = `[${severity.toUpperCase().padEnd(5)}]`;

  lines.push(`${displayTs} ${severityDisplay} ${message}`);

  if (trace) {
    lines.push(`  trace: ${trace}`);
  }

  return lines.join("\n");
}

function formatOutput(data) {
  if (!data.data || data.data.length === 0) {
    return "No logs found matching your query.";
  }

  const lines = [];
  lines.push(`Found ${data.data.length} log entries:\n`);

  for (const entry of data.data) {
    lines.push(formatLogEntry(entry));
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

function formatGlitchTipEntry(entry) {
  const lines = [];

  let displayTs = entry.timestamp || "N/A";
  try {
    const date = new Date(entry.timestamp);
    if (!isNaN(date.getTime())) {
      displayTs = date.toISOString().replace("T", " ").slice(0, 19);
    }
  } catch {}

  const severity = (entry.level || "info").toUpperCase().padEnd(5);
  lines.push(`${displayTs} [${severity}] ${entry.body || "(no message)"}`);

  const meta = [];
  if (entry.service) meta.push(`service: ${entry.service}`);
  if (entry.environment) meta.push(`env: ${entry.environment}`);
  if (entry.host) meta.push(`host: ${entry.host}`);
  if (entry.traceID) meta.push(`trace: ${entry.traceID}`);
  if (meta.length > 0) {
    lines.push(`  ${meta.join(" | ")}`);
  }

  return lines.join("\n");
}

/**
 * GlitchTip exposes logs at /organizations/<org>/logs/ with its own filter
 * params rather than Sentry's Discover-style dataset query.
 */
async function searchGlitchTipLogs(options, token) {
  const params = new URLSearchParams();

  if (options.period) {
    const start = periodToStart(options.period);
    if (!start) {
      console.error(`Error: could not parse period '${options.period}' (use forms like 24h, 7d)`);
      process.exit(1);
    }
    params.set("start", start);
  }

  params.set("limit", Math.min(options.limit, 200).toString());

  if (options.project) {
    params.append("project", await resolveProjectId(options.org, options.project, token));
  }
  for (const level of options.levels) {
    params.append("level", level);
  }
  if (options.trace) {
    params.set("traceId", options.trace);
  }
  if (options.query) {
    params.set("query", options.query);
  }

  const url = `${API_BASE}/organizations/${encodeURIComponent(options.org)}/logs/?${params.toString()}`;

  try {
    const data = await fetchJson(url, token);

    if (options.json) {
      console.log(JSON.stringify(data, null, 2));
      return;
    }

    const entries = Array.isArray(data) ? data : data.results || [];
    if (entries.length === 0) {
      console.log("No logs found matching your query.");
      return;
    }

    console.log(`Found ${entries.length} log entries:\n`);
    console.log(entries.map(formatGlitchTipEntry).join("\n\n"));
  } catch (err) {
    console.error("Error:", err.message);
    process.exit(1);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const options = parseArgs(args);

  if (options.help) {
    showHelp();
    process.exit(0);
  }

  options.org = options.org || getDefault("org");
  options.project = options.project || getDefault("project");

  if (!options.org) {
    console.error("Error: --org is required (or set org in ~/.sentryclirc [defaults])");
    console.error("Run with --help for usage information");
    process.exit(1);
  }

  const token = getAuthToken();

  if (isGlitchTip) {
    await searchGlitchTipLogs(options, token);
    return;
  }

  // Build query parameters
  const params = new URLSearchParams();
  params.set("dataset", "logs");
  params.set("statsPeriod", options.period);
  params.set("per_page", Math.min(options.limit, 1000).toString());
  params.set("sort", "-timestamp");

  // Add fields
  for (const field of LOG_FIELDS) {
    params.append("field", field);
  }

  // Build search query
  const queryParts = [];
  if (options.project) {
    queryParts.push(`project:${options.project}`);
  }
  if (options.query) {
    queryParts.push(options.query);
  }
  if (queryParts.length > 0) {
    params.set("query", queryParts.join(" "));
  }

  const url = `${API_BASE}/organizations/${encodeURIComponent(options.org)}/events/?${params.toString()}`;

  try {
    const data = await fetchJson(url, token);

    if (options.json) {
      console.log(JSON.stringify(data, null, 2));
    } else {
      console.log(formatOutput(data));
    }
  } catch (err) {
    console.error("Error:", err.message);
    process.exit(1);
  }
}

main();
