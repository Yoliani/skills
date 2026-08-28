// Shared config, HTTP, and project resolution for the SonarQube Web API.
// Config comes from ~/.sonarrc (INI), layered with a repo-local .sonarrc and
// with the sonar-project.properties the scanner already reads.

import { readFileSync, existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const DEFAULT_URL = "https://sonarcloud.io";

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
 * Parse an INI-ish .sonarrc into { section: { key: value } }.
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
 * Parse a sonar-project.properties into the same shape, mapping the scanner's
 * `sonar.*` keys onto the rc file's sections. The scanner file describes one
 * repo, so it is treated as [defaults] plus an optional token.
 * @param {string} content
 * @returns {Record<string, Record<string, string>>}
 */
function parseScannerProperties(content) {
  const props = parseRc(content)[""] || {};
  const defaults = {};
  if (props["sonar.host.url"]) defaults.url = props["sonar.host.url"];
  if (props["sonar.projectKey"]) defaults.project = props["sonar.projectKey"];
  if (props["sonar.organization"]) defaults.organization = props["sonar.organization"];
  if (props["sonar.branch.name"]) defaults.branch = props["sonar.branch.name"];
  const auth = props["sonar.token"] ? { token: props["sonar.token"] } : {};
  return { defaults, auth };
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

const explicitRc = cliRc || process.env.SONAR_RC || null;
export const RC_PATHS = [
  ...new Set(
    explicitRc
      ? [explicitRc]
      : [
          join(homedir(), ".sonarrc"),
          join(process.cwd(), ".sonarrc"),
          join(process.cwd(), "sonar-project.properties"),
        ]
  ),
].filter((path) => existsSync(path));

const rc = mergeRc(
  RC_PATHS.map((path) => {
    const content = readFileSync(path, "utf-8");
    return path.endsWith(".properties") ? parseScannerProperties(content) : parseRc(content);
  })
);

/**
 * Read a key from the merged config's [defaults] section.
 * @param {string} key - e.g. "project", "url", "organization"
 * @returns {string|null}
 */
export function getDefault(key) {
  return rc.defaults?.[key] ?? null;
}

const rootUrl = (
  cliUrl ||
  process.env.SONAR_HOST_URL ||
  process.env.SONARQUBE_URL ||
  getDefault("url") ||
  DEFAULT_URL
).replace(/\/+$/, "");

/** Root URL of the instance, e.g. https://sonar.example.com */
export const ROOT_URL = rootUrl;

/** Base URL of the Web API, e.g. https://sonar.example.com/api */
export const API_BASE = `${rootUrl}/api`;

/** SonarQube Cloud needs an organization key on several endpoints. */
export const ORGANIZATION =
  process.env.SONAR_ORGANIZATION || getDefault("organization") || null;

/** Whether the configured host is SonarQube Cloud (formerly SonarCloud). */
export const isCloud = /(^|\.)sonarcloud\.io$/.test(
  (() => {
    try {
      return new URL(rootUrl).hostname;
    } catch {
      return "";
    }
  })()
);

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
 * Get the user token from env or ~/.sonarrc's [auth] section.
 * @returns {string} The token
 */
export function getToken() {
  const envToken = process.env.SONAR_TOKEN || process.env.SONARQUBE_TOKEN;
  if (envToken) return envToken.trim();

  const token = rc.auth?.token;
  if (!token) {
    const searched = RC_PATHS.length > 0 ? RC_PATHS.join(", ") : "no rc file found";
    die(
      `no token found (looked at SONAR_TOKEN and ${searched})`,
      "Create ~/.sonarrc (or a .sonarrc in this directory):",
      "  [auth]",
      "  token=squ_...",
      "  [defaults]",
      "  url=https://sonar.example.com",
      "  project=my-project-key",
      "  # organization=my-org   # SonarQube Cloud only",
      "",
      "The token comes from My Account -> Security in the SonarQube UI.",
      "A User Token sees every project you can see; a Project Analysis Token",
      "cannot read these endpoints, so create the user one."
    );
  }
  return token.trim();
}

// SonarQube 10+ and SonarQube Cloud take a bearer token; 9.x and older only
// accept the token as the HTTP Basic username. Start with bearer and remember
// the fallback once the server has rejected it.
let authMode = "bearer";

/**
 * @param {string} token
 * @returns {string} Value for the Authorization header
 */
function authHeader(token) {
  return authMode === "bearer"
    ? `Bearer ${token}`
    : `Basic ${Buffer.from(`${token}:`).toString("base64")}`;
}

/**
 * Call the Web API.
 * @param {string} path - e.g. "/measures/component" (relative to /api)
 * @param {{method?: string, query?: Record<string, any>, form?: Record<string, any>}} [options]
 * @returns {Promise<any>} Parsed JSON, or null for an empty 204
 */
export async function request(path, options = {}) {
  const { method = "GET", query, form } = options;
  const token = getToken();
  const url = path.startsWith("http") ? new URL(path) : new URL(`${API_BASE}${path}`);
  for (const [key, value] of Object.entries(query || {})) {
    if (value === undefined || value === null || value === "") continue;
    url.searchParams.set(key, String(value));
  }

  const send = async () => {
    const headers = { Authorization: authHeader(token) };
    let body;
    if (form) {
      headers["Content-Type"] = "application/x-www-form-urlencoded";
      body = new URLSearchParams(form).toString();
    }
    return fetch(url, { method, headers, body });
  };

  let res = await send();
  if (res.status === 401 && authMode === "bearer") {
    authMode = "basic";
    res = await send();
  }

  if (!res.ok) {
    const text = await res.text();
    const messages = (() => {
      try {
        return (JSON.parse(text).errors || []).map((e) => e.msg).join("; ");
      } catch {
        return "";
      }
    })();
    const detail = messages || text.slice(0, 500);
    const hint =
      res.status === 401
        ? " (the token was rejected; check it with check-config.js)"
        : res.status === 403
          ? " (the token is valid but lacks Browse permission on this project)"
          : res.status === 404
            ? " (unknown project key, branch, or endpoint for this server version)"
            : "";
    throw new Error(`API error ${res.status} on ${method} ${url.pathname}${hint}: ${detail}`);
  }

  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

/**
 * The project key from --project, the environment, or the config files.
 * @param {string|null} explicit - Value of --project, if passed
 * @returns {string}
 */
export function requireProject(explicit) {
  const project = explicit || process.env.SONAR_PROJECT_KEY || getDefault("project");
  if (!project) {
    die(
      "--project is required (or set project in ~/.sonarrc [defaults])",
      "Run list-projects.js to see the project keys this token can read.",
      "The key is also in the SonarQube URL: /dashboard?id=<key>"
    );
  }
  return String(project);
}

/**
 * Branch or pull request selector, shared by every read endpoint. SonarQube
 * rejects both at once, so --pr wins and --branch is ignored alongside it.
 * @param {Record<string, any>} flags
 * @returns {{branch?: string, pullRequest?: string}}
 */
export function scopeParams(flags) {
  if (flags.pr) return { pullRequest: String(flags.pr) };
  const branch = flags.branch || getDefault("branch");
  return branch ? { branch: String(branch) } : {};
}

/**
 * Build a permalink into the SonarQube UI.
 * @param {string} path - e.g. "/dashboard"
 * @param {Record<string, any>} query
 * @returns {string}
 */
export function webUrl(path, query = {}) {
  const url = new URL(`${ROOT_URL}${path}`);
  for (const [key, value] of Object.entries(query)) {
    if (value) url.searchParams.set(key, String(value));
  }
  return url.toString();
}

let metricCache = null;

/**
 * Every metric the server knows, keyed by metric key. One call, cached, so the
 * scripts can format a value by its declared type instead of guessing.
 * @returns {Promise<Record<string, {key: string, name: string, type: string, domain?: string, description?: string}>>}
 */
export async function metricIndex() {
  if (metricCache) return metricCache;
  const metrics = [];
  for (let page = 1; ; page++) {
    const data = await request("/metrics/search", { query: { ps: 500, p: page } });
    metrics.push(...(data.metrics || []));
    if (metrics.length >= (data.total || 0) || (data.metrics || []).length === 0) break;
  }
  metricCache = Object.fromEntries(metrics.map((metric) => [metric.key, metric]));
  return metricCache;
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
 * Format a timestamp for display. SonarQube returns ISO-8601 with a +0000
 * offset that Date parses fine on Node.
 * @param {string} ts
 * @returns {string}
 */
export function formatTimestamp(ts) {
  if (!ts) return "N/A";
  const date = new Date(ts);
  return isNaN(date.getTime()) ? String(ts) : date.toLocaleString();
}

/**
 * Turn a relative period like "30d" into the `from` date SonarQube expects
 * (yyyy-MM-dd). Absolute values are passed through untouched.
 * @param {string} period
 * @returns {string}
 */
export function periodToDate(period) {
  const match = String(period).trim().match(/^(\d+)([hdwmy])$/);
  if (!match) return String(period).trim();
  const units = { h: 3600, d: 86400, w: 604800, m: 2592000, y: 31536000 };
  const seconds = parseInt(match[1], 10) * units[match[2]];
  return new Date(Date.now() - seconds * 1000).toISOString().slice(0, 10);
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
