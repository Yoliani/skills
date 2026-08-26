// Shared config, HTTP, and project resolution for the PostHog API.
// Config comes from ~/.posthogrc (INI), layered with a repo-local .posthogrc.

import { readFileSync, existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const DEFAULT_URL = "https://us.posthog.com";

/**
 * Pull `--flag value` out of process.argv so per-script arg parsers never see
 * it. Called at import time, before any script reads process.argv.
 * @param {string} flag
 * @returns {string|null}
 */
function takeGlobalFlag(flag) {
  const i = process.argv.indexOf(flag);
  if (i === -1) return null;
  const value = process.argv[i + 1];
  process.argv.splice(i, value === undefined ? 1 : 2);
  return value ?? null;
}

const cliUrl = takeGlobalFlag("--url");
const cliRc = takeGlobalFlag("--rc");

/**
 * Parse an INI-ish .posthogrc into { section: { key: value } }.
 * @param {string} content
 * @returns {Record<string, Record<string, string>>}
 */
function parseRc(content) {
  const sections = { "": {} };
  let current = "";
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || line.startsWith(";")) continue;
    const sectionMatch = line.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      current = sectionMatch[1].trim();
      sections[current] = sections[current] || {};
      continue;
    }
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    sections[current][line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
  return sections;
}

/**
 * Merge rc files, later files winning key by key within each section.
 * @param {Record<string, Record<string, string>>[]} sources
 * @returns {Record<string, Record<string, string>>}
 */
function mergeRc(sources) {
  const merged = {};
  for (const source of sources) {
    for (const [section, values] of Object.entries(source)) {
      merged[section] = { ...merged[section], ...values };
    }
  }
  return merged;
}

const explicitRc = cliRc || process.env.POSTHOG_RC || null;
export const RC_PATHS = [
  ...new Set(
    explicitRc ? [explicitRc] : [join(homedir(), ".posthogrc"), join(process.cwd(), ".posthogrc")]
  ),
].filter((path) => existsSync(path));

const rc = mergeRc(RC_PATHS.map((path) => parseRc(readFileSync(path, "utf-8"))));

/**
 * Read a key from the merged rc files' [defaults] section.
 * @param {string} key - e.g. "project", "url"
 * @returns {string|null}
 */
export function getDefault(key) {
  return rc.defaults?.[key] ?? null;
}

const rootUrl = (cliUrl || process.env.POSTHOG_URL || getDefault("url") || DEFAULT_URL).replace(
  /\/+$/,
  ""
);

/** Root URL of the instance, e.g. https://us.posthog.com */
export const ROOT_URL = rootUrl;

/** Base URL of the API, e.g. https://us.posthog.com/api */
export const API_BASE = `${rootUrl}/api`;

/**
 * Print an error and exit.
 * @param {string} message
 * @param {...string} hints - Extra lines printed after the message
 */
export function die(message, ...hints) {
  console.error(`Error: ${message}`);
  for (const hint of hints) console.error(hint);
  process.exit(1);
}

/**
 * Get the personal API key from env or ~/.posthogrc's [auth] section.
 * @returns {string} The personal API key
 */
export function getApiKey() {
  const envKey = process.env.POSTHOG_PERSONAL_API_KEY || process.env.POSTHOG_API_KEY;
  if (envKey) return envKey.trim();

  const key = rc.auth?.personal_api_key || rc.auth?.api_key || rc.auth?.token;
  if (!key) {
    const searched = RC_PATHS.length > 0 ? RC_PATHS.join(", ") : "no rc file found";
    die(
      `no personal API key found (looked at POSTHOG_PERSONAL_API_KEY and ${searched})`,
      "Create ~/.posthogrc (or a .posthogrc in this directory):",
      "  [auth]",
      "  personal_api_key=phx_...",
      "  [defaults]",
      "  project=12345",
      "  # url=https://eu.posthog.com   # omit for US Cloud",
      "",
      "The key comes from Settings -> Personal API keys in the PostHog UI.",
      "Grant it the scopes the scripts need: query:read, error_tracking:read,",
      "feature_flag:read, insight:read, session_recording:read, annotation:read",
      "(plus error_tracking:write, feature_flag:write, annotation:write to make changes)."
    );
  }
  return key.trim();
}

/**
 * Where the web UI lives. PostHog serves the app and the private API from the
 * same host, so the root URL is right for both.
 */
export const WEB_URL = (process.env.POSTHOG_WEB_URL || getDefault("web_url") || rootUrl).replace(
  /\/+$/,
  ""
);

/**
 * Build a permalink into the PostHog UI.
 * @param {string|number} projectId
 * @param {...string} parts - Path segments after /project/<id>/
 * @returns {string}
 */
export function webUrl(projectId, ...parts) {
  return `${WEB_URL}/project/${projectId}/${parts.filter(Boolean).join("/")}`;
}

/**
 * Call the API. Paths are relative to /api and must end with a slash, since
 * PostHog redirects slashless paths and drops the method on the way.
 * @param {string} path - e.g. "/organizations/@current/projects/"
 * @param {{method?: string, query?: Record<string, any>, body?: any}} [options]
 * @returns {Promise<any>} Parsed JSON, or null for an empty 204
 */
export async function request(path, options = {}) {
  const { method = "GET", query, body } = options;
  const url = path.startsWith("http") ? new URL(path) : new URL(`${API_BASE}${path}`);
  for (const [key, value] of Object.entries(query || {})) {
    if (value === undefined || value === null || value === "") continue;
    url.searchParams.set(key, String(value));
  }

  const headers = { Authorization: `Bearer ${getApiKey()}` };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const res = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (res.status === 429) {
    const retry = res.headers.get("Retry-After");
    throw new Error(
      `rate limited by PostHog${retry ? `; retry in ~${retry}s` : ""}. ` +
        "Limits are 240/min and 1200/hour for analytics endpoints, 2400/hour for /query/, " +
        "and they apply to the whole organization rather than to one key."
    );
  }

  if (res.status === 402) {
    const text = await res.text();
    throw new Error(
      `402 from PostHog, which usually means the free-plan query allowance is spent: ${text.slice(0, 300)}`
    );
  }

  if (!res.ok) {
    const text = await res.text();
    // A 403 means either a bad key or a key missing the endpoint's scope, and
    // the two want opposite fixes, so read the body rather than guess.
    const badKey = /authentication_failed|invalid_personal_api_key/.test(text);
    const hint =
      res.status === 401 || (res.status === 403 && badKey)
        ? " (the personal API key was rejected; check it with check-config.js)"
        : res.status === 403
          ? " (the key is valid but lacks this endpoint's scope; widen it in the PostHog UI)"
          : "";
    throw new Error(
      `API error ${res.status} on ${method} ${url.pathname}${hint}: ${text.slice(0, 500)}`
    );
  }

  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

/**
 * Follow PostHog's `next` pagination until `limit` results are collected.
 * @param {string} path
 * @param {{query?: Record<string, any>, limit?: number}} [options]
 * @returns {Promise<any[]>}
 */
export async function paginate(path, options = {}) {
  const { query = {}, limit = Infinity } = options;
  const results = [];
  let next = null;

  while (results.length < limit) {
    const page = next
      ? await request(next)
      : await request(path, {
          query: { ...query, limit: Math.min(100, limit === Infinity ? 100 : limit) },
        });
    if (Array.isArray(page)) return page.slice(0, limit === Infinity ? undefined : limit);

    results.push(...(page?.results || []));
    if (!page?.next) break;
    next = page.next;
  }

  return limit === Infinity ? results : results.slice(0, limit);
}

const projectCache = new Map();

/**
 * Resolve a project name to its numeric ID. Numeric input passes through, so
 * the common case costs no extra call.
 * @param {string} project - Numeric ID or project name
 * @returns {Promise<string>}
 */
export async function resolveProjectId(project) {
  if (!project) {
    die(
      "--project is required (or set project in ~/.posthogrc [defaults])",
      "Run check-config.js to list the projects this key can see.",
      "The numeric ID is also in the PostHog URL: /project/<id>/..."
    );
  }
  if (/^\d+$/.test(String(project))) return String(project);

  if (projectCache.has(project)) return projectCache.get(project);

  const projects = await listProjects();
  const match = projects.find((p) => (p.name || "").toLowerCase() === project.toLowerCase());
  if (!match) {
    die(
      `project '${project}' not found`,
      `Known: ${projects.map((p) => `${p.name} (${p.id})`).join(", ") || "(none)"}`
    );
  }

  projectCache.set(project, String(match.id));
  return String(match.id);
}

/**
 * The project from --project, the environment, or the rc file, resolved to an ID.
 * @param {string|null} explicit - Value of --project, if passed
 * @returns {Promise<string>}
 */
export async function requireProject(explicit) {
  return resolveProjectId(explicit || process.env.POSTHOG_PROJECT || getDefault("project"));
}

/**
 * Every project the key can see. There is no bare /api/projects/ list, so this
 * goes through the current organization.
 * @returns {Promise<any[]>}
 */
export async function listProjects() {
  return paginate("/organizations/@current/projects/");
}

/**
 * Run a query through /query/. Handles the async hand-off, which a blocking
 * query should not trigger but occasionally does under load.
 * @param {string} projectId
 * @param {any} queryNode - e.g. { kind: "HogQLQuery", query: "select 1" }
 * @param {{name?: string, refresh?: string}} [options]
 * @returns {Promise<any>} The query response
 */
export async function runQuery(projectId, queryNode, options = {}) {
  const { name = "agent-skill query", refresh } = options;
  let response = await request(`/projects/${projectId}/query/`, {
    method: "POST",
    body: { query: queryNode, name, ...(refresh ? { refresh } : {}) },
  });

  const started = Date.now();
  while (response?.query_status && !response.query_status.complete) {
    if (Date.now() - started > 60000) {
      throw new Error(
        `query ${response.query_status.id} still running after 60s; PostHog caps execution at 10s, so this is queueing behind the 3-concurrent-query limit`
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const status = await request(`/projects/${projectId}/query/${response.query_status.id}/`);
    if (status?.query_status?.complete) {
      if (status.query_status.error) {
        throw new Error(status.query_status.error_message || "query failed");
      }
      return status.query_status.results ?? status.results ?? status;
    }
    response = status;
  }

  return response;
}

/**
 * Minimal flag parser shared by the scripts.
 * @param {string[]} args
 * @param {{aliases?: Record<string,string>, booleans?: string[], arrays?: string[]}} spec
 * @returns {{flags: Record<string, any>, positionals: string[]}}
 */
export function parseFlags(args, spec = {}) {
  const { aliases = {}, booleans = [], arrays = [] } = spec;
  const flags = {};
  const positionals = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith("-") || arg === "-") {
      positionals.push(arg);
      continue;
    }
    const bare = arg.replace(/^--?/, "");
    const name = aliases[bare] || bare;
    if (booleans.includes(name)) {
      flags[name] = true;
    } else if (arrays.includes(name)) {
      (flags[name] = flags[name] || []).push(args[++i]);
    } else {
      flags[name] = args[++i];
    }
  }

  return { flags, positionals };
}

/**
 * Format a timestamp for display.
 * @param {string|number} ts
 * @returns {string}
 */
export function formatTimestamp(ts) {
  if (!ts) return "N/A";
  const date = new Date(ts);
  return isNaN(date.getTime()) ? String(ts) : date.toLocaleString();
}

/**
 * Turn a relative period like "24h" or "7d" into the date_from string PostHog
 * expects ("-24h", "-7d"). Absolute values are passed through untouched.
 * @param {string} period
 * @returns {string}
 */
export function toDateFrom(period) {
  const value = String(period).trim();
  return /^\d+[mhdwy]$/.test(value) ? `-${value}` : value;
}

/**
 * Run a script body, turning any thrown error into a clean exit.
 * @param {() => Promise<void>} main
 */
export function run(main) {
  main().catch((err) => {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  });
}
