// Adapted from mitsuhiko/agent-stuff (skills/sentry), Apache-2.0.
// Changes: configurable base URL from ~/.sentryclirc / env / --url, backend
// detection (sentry vs glitchtip), [defaults] org/project fallbacks, and a
// repo-local .sentryclirc layered over the home one.

import { readFileSync, existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const DEFAULT_URL = "https://sentry.io/";

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
const cliBackend = takeGlobalFlag("--backend");
const cliRc = takeGlobalFlag("--rc");

/**
 * Parse an INI-ish .sentryclirc into { section: { key: value } }.
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
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    sections[current][key] = value;
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

/**
 * Which rc files apply, in increasing priority. An explicit --rc / SENTRY_RC
 * replaces the search entirely; otherwise ~/.sentryclirc is the base and a
 * .sentryclirc in the working directory overrides it, like sentry-cli does.
 */
const explicitRc = cliRc || process.env.SENTRY_RC || null;
export const RC_PATHS = [
  ...new Set(
    explicitRc ? [explicitRc] : [join(homedir(), ".sentryclirc"), join(process.cwd(), ".sentryclirc")]
  ),
].filter((path) => existsSync(path));

const rc = mergeRc(RC_PATHS.map((path) => parseRc(readFileSync(path, "utf-8"))));

/**
 * Read a key from the merged rc files' [defaults] section.
 * @param {string} key - e.g. "org", "project", "url"
 * @returns {string|null}
 */
export function getDefault(key) {
  return rc.defaults?.[key] ?? null;
}

const rootUrl = (
  cliUrl ||
  process.env.SENTRY_URL ||
  getDefault("url") ||
  DEFAULT_URL
).replace(/\/+$/, "");

/** Base URL of the API, e.g. https://glitchtip.example.com/api/0 */
export const API_BASE = `${rootUrl}/api/0`;

/** Root URL without the API path, useful for building web links. */
export const ROOT_URL = rootUrl;

/**
 * Which server we are talking to: "sentry" or "glitchtip".
 * Sentry SaaS is detected by hostname; anything else defaults to glitchtip
 * unless overridden with --backend / SENTRY_BACKEND. Self-hosted Sentry must
 * set the override, since it shares GlitchTip's "custom URL" shape.
 */
export const BACKEND = (() => {
  const explicit = cliBackend || process.env.SENTRY_BACKEND || getDefault("backend");
  if (explicit) return explicit.toLowerCase();
  try {
    const host = new URL(rootUrl).hostname;
    if (host === "sentry.io" || host.endsWith(".sentry.io")) return "sentry";
  } catch {}
  return "glitchtip";
})();

export const isGlitchTip = BACKEND === "glitchtip";

/**
 * Exit with a clear message when a script needs a Sentry-only endpoint.
 * @param {string} feature - What is unavailable
 * @param {string} alternative - What to run instead
 */
export function requireSentry(feature, alternative) {
  if (!isGlitchTip) return;
  console.error(`Error: ${feature} is a Sentry-only API; ${API_BASE} is configured as GlitchTip.`);
  console.error(alternative);
  console.error("If this is a self-hosted Sentry, re-run with --backend sentry.");
  process.exit(1);
}

/**
 * Get the auth token from env or ~/.sentryclirc's [auth] section.
 * @returns {string} The auth token
 */
export function getAuthToken() {
  const envToken = process.env.SENTRY_AUTH_TOKEN;
  if (envToken) return envToken.trim();

  const token = rc.auth?.token;
  if (!token) {
    const searched = RC_PATHS.length > 0 ? RC_PATHS.join(", ") : "no rc file found";
    console.error(`Error: no auth token found (looked at SENTRY_AUTH_TOKEN and ${searched})`);
    console.error("Add one to ~/.sentryclirc (or a .sentryclirc in this directory):");
    console.error("  [auth]");
    console.error("  token=<token>");
    console.error("  [defaults]");
    console.error("  url=https://glitchtip.example.com/");
    process.exit(1);
  }
  return token.trim();
}

/**
 * Fetch JSON from an API endpoint.
 * @param {string} url - The full URL to fetch
 * @param {string} token - The auth token
 * @returns {Promise<any>} The parsed JSON response
 */
export async function fetchJson(url, token) {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text.slice(0, 500)}`);
  }

  return res.json();
}

/**
 * Format a timestamp for display
 * @param {string|number} ts - Timestamp (ISO string or unix)
 * @returns {string} Formatted timestamp
 */
export function formatTimestamp(ts) {
  if (!ts) return "N/A";
  try {
    const date = new Date(ts);
    if (isNaN(date.getTime())) return ts;
    return date.toLocaleString();
  } catch {
    return ts;
  }
}

/**
 * Convert a relative period like "24h", "7d", "90m" to an ISO start time.
 * @param {string} period
 * @returns {string|null} ISO timestamp, or null if unparseable
 */
export function periodToStart(period) {
  const match = String(period).match(/^(\d+)([mhdw])$/);
  if (!match) return null;
  const units = { m: 60, h: 3600, d: 86400, w: 604800 };
  const seconds = parseInt(match[1], 10) * units[match[2]];
  return new Date(Date.now() - seconds * 1000).toISOString();
}

// Cache for project slug -> ID resolution
const projectIdCache = new Map();

/**
 * Resolve a project slug to its numeric ID.
 * If the input is already a numeric ID, returns it as-is.
 * @param {string} org - Organization slug
 * @param {string} project - Project slug or numeric ID
 * @param {string} token - Auth token
 * @returns {Promise<string>} The numeric project ID
 */
export async function resolveProjectId(org, project, token) {
  if (/^\d+$/.test(project)) {
    return project;
  }

  const cacheKey = `${org}/${project}`;
  if (projectIdCache.has(cacheKey)) {
    return projectIdCache.get(cacheKey);
  }

  const url = `${API_BASE}/projects/${encodeURIComponent(org)}/${encodeURIComponent(project)}/`;
  const data = await fetchJson(url, token);

  if (!data || !data.id) {
    throw new Error(`Project '${project}' not found in organization '${org}'`);
  }

  const id = String(data.id);
  projectIdCache.set(cacheKey, id);
  return id;
}
