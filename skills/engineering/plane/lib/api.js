// Shared config, HTTP, and name-to-UUID resolution for the Plane REST API v1.
// Config comes from ~/.planesorc (INI), layered with a repo-local .planesorc.

import { readFileSync, existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const DEFAULT_URL = "https://api.plane.so";
const CLOUD_WEB_URL = "https://app.plane.so";

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
 * Parse an INI-ish .planesorc into { section: { key: value } }.
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

const explicitRc = cliRc || process.env.PLANE_RC || null;
export const RC_PATHS = [
  ...new Set(
    explicitRc ? [explicitRc] : [join(homedir(), ".planesorc"), join(process.cwd(), ".planesorc")]
  ),
].filter((path) => existsSync(path));

const rc = mergeRc(RC_PATHS.map((path) => parseRc(readFileSync(path, "utf-8"))));

/**
 * Read a key from the merged rc files' [defaults] section.
 * @param {string} key - e.g. "workspace", "project", "url"
 * @returns {string|null}
 */
export function getDefault(key) {
  return rc.defaults?.[key] ?? null;
}

const rootUrl = (cliUrl || process.env.PLANE_URL || getDefault("url") || DEFAULT_URL).replace(
  /\/+$/,
  ""
);

/** Root URL of the server, e.g. https://api.plane.so */
export const ROOT_URL = rootUrl;

/** Base URL of the API, e.g. https://api.plane.so/api/v1 */
export const API_BASE = `${rootUrl}/api/v1`;

/**
 * Where the web UI lives, for building permalinks. Plane Cloud serves the API
 * from api.plane.so and the UI from app.plane.so; a self-hosted instance
 * usually serves both from one host, so the root URL is the better guess.
 */
export const WEB_URL = (() => {
  const explicit = process.env.PLANE_WEB_URL || getDefault("web_url");
  if (explicit) return explicit.replace(/\/+$/, "");
  try {
    if (new URL(rootUrl).hostname === "api.plane.so") return CLOUD_WEB_URL;
  } catch {}
  return rootUrl;
})();

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
 * Get the API key from env or ~/.planesorc's [auth] section.
 * @returns {string} The API key
 */
export function getApiKey() {
  const envKey = process.env.PLANE_API_KEY;
  if (envKey) return envKey.trim();

  const key = rc.auth?.api_key || rc.auth?.token || rc.auth?.key;
  if (!key) {
    const searched = RC_PATHS.length > 0 ? RC_PATHS.join(", ") : "no rc file found";
    die(
      `no API key found (looked at PLANE_API_KEY and ${searched})`,
      "Create ~/.planesorc (or a .planesorc in this directory):",
      "  [auth]",
      "  api_key=plane_api_...",
      "  [defaults]",
      "  workspace=my-workspace",
      "  # url=https://plane.example.com   # omit for Plane Cloud",
      "",
      "The key comes from Profile settings -> Personal access tokens in the Plane UI."
    );
  }
  return key.trim();
}

/**
 * The workspace slug, from --workspace, the environment, or the rc file.
 * @param {string|null} explicit - Value of --workspace, if passed
 * @returns {string}
 */
export function requireWorkspace(explicit) {
  const workspace = explicit || process.env.PLANE_WORKSPACE || getDefault("workspace");
  if (!workspace) {
    die(
      "--workspace is required (or set workspace in ~/.planesorc [defaults])",
      "The slug is the first path segment in the Plane UI URL: https://app.plane.so/<workspace>/"
    );
  }
  return workspace;
}

/**
 * Call the API. Paths are relative to /api/v1 and must end with a slash:
 * Plane redirects slashless paths and drops the method on the way.
 * @param {string} path - e.g. "/workspaces/acme/projects/"
 * @param {{method?: string, query?: Record<string, any>, body?: any}} [options]
 * @returns {Promise<any>} Parsed JSON, or null for an empty 204
 */
export async function request(path, options = {}) {
  const { method = "GET", query, body } = options;
  const url = new URL(`${API_BASE}${path}`);
  for (const [key, value] of Object.entries(query || {})) {
    if (value === undefined || value === null || value === "") continue;
    url.searchParams.set(key, String(value));
  }

  const headers = { "X-API-Key": getApiKey() };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const res = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (res.status === 429) {
    const reset = res.headers.get("X-RateLimit-Reset");
    const wait = reset ? Math.max(0, Number(reset) - Math.floor(Date.now() / 1000)) : null;
    throw new Error(
      `rate limited (60 requests/minute per key)${wait === null ? "" : `; retry in ~${wait}s`}`
    );
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status} on ${method} ${url.pathname}: ${text.slice(0, 500)}`);
  }

  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

/**
 * Follow Plane's cursor pagination until `limit` results are collected.
 * Endpoints that return a bare array are passed through unchanged.
 * @param {string} path
 * @param {{query?: Record<string, any>, limit?: number}} [options]
 * @returns {Promise<any[]>}
 */
export async function paginate(path, options = {}) {
  const { query = {}, limit = Infinity } = options;
  const perPage = Math.min(100, limit === Infinity ? 100 : limit);
  const results = [];
  let cursor = query.cursor;

  while (results.length < limit) {
    const page = await request(path, { query: { ...query, per_page: perPage, cursor } });
    if (Array.isArray(page)) return page.slice(0, limit === Infinity ? undefined : limit);

    results.push(...(page?.results || []));
    if (!page?.next_page_results || !page?.next_cursor) break;
    cursor = page.next_cursor;
  }

  return limit === Infinity ? results : results.slice(0, limit);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** @param {string} value */
export function isUuid(value) {
  return UUID.test(String(value || ""));
}

const projectCache = new Map();

/**
 * Resolve a project UUID, identifier (`WEB`), or name to its UUID.
 * @param {string} workspace
 * @param {string} project
 * @returns {Promise<string>}
 */
export async function resolveProjectId(workspace, project) {
  if (!project) {
    die(
      "--project is required (or set project in ~/.planesorc [defaults])",
      "Run list-projects.js to see the projects in this workspace."
    );
  }
  if (isUuid(project)) return project;

  const cacheKey = `${workspace}/${project}`;
  if (projectCache.has(cacheKey)) return projectCache.get(cacheKey);

  const projects = await paginate(`/workspaces/${encodeURIComponent(workspace)}/projects/`);
  const needle = project.toLowerCase();
  const match =
    projects.find((p) => (p.identifier || "").toLowerCase() === needle) ||
    projects.find((p) => (p.name || "").toLowerCase() === needle);

  if (!match) {
    die(
      `project '${project}' not found in workspace '${workspace}'`,
      `Known: ${projects.map((p) => `${p.identifier} (${p.name})`).join(", ") || "(none)"}`
    );
  }

  projectCache.set(cacheKey, match.id);
  return match.id;
}

/**
 * Fetch a project's states, labels, and members as UUID -> display-name maps,
 * so listings can print names instead of UUIDs. Members need a wider scope
 * than work items do, so a failure there is tolerated.
 * @param {string} workspace
 * @param {string} projectId
 * @returns {Promise<{states: Map<string,string>, labels: Map<string,string>, members: Map<string,string>, stateGroups: Map<string,string>}>}
 */
export async function getLookups(workspace, projectId) {
  const base = `/workspaces/${encodeURIComponent(workspace)}/projects/${projectId}`;
  const [states, labels, members] = await Promise.all([
    paginate(`${base}/states/`).catch(() => []),
    paginate(`${base}/labels/`).catch(() => []),
    paginate(`${base}/project-members/`).catch(() => []),
  ]);

  return {
    states: new Map(states.map((s) => [s.id, s.name])),
    stateGroups: new Map(states.map((s) => [s.id, s.group])),
    labels: new Map(labels.map((l) => [l.id, l.name])),
    members: new Map(members.map((m) => [memberId(m), memberName(m)])),
  };
}

/** @param {any} member - A project-members or workspace members entry */
export function memberId(member) {
  return member.member?.id || member.member_id || member.id;
}

/** @param {any} member */
export function memberName(member) {
  const user = member.member || member;
  return user.display_name || user.email || user.first_name || user.id;
}

/**
 * Resolve a state name (or UUID) to its UUID within a project.
 * @param {string} workspace
 * @param {string} projectId
 * @param {string} state
 * @returns {Promise<string>}
 */
export async function resolveStateId(workspace, projectId, state) {
  if (isUuid(state)) return state;
  const states = await paginate(
    `/workspaces/${encodeURIComponent(workspace)}/projects/${projectId}/states/`
  );
  const match = states.find((s) => (s.name || "").toLowerCase() === state.toLowerCase());
  if (!match) {
    die(
      `state '${state}' not found in this project`,
      `Known: ${states.map((s) => s.name).join(", ") || "(none)"}`
    );
  }
  return match.id;
}

/**
 * Resolve label names (or UUIDs) to UUIDs within a project.
 * @param {string} workspace
 * @param {string} projectId
 * @param {string[]} names
 * @returns {Promise<string[]>}
 */
export async function resolveLabelIds(workspace, projectId, names) {
  if (names.every(isUuid)) return names;
  const labels = await paginate(
    `/workspaces/${encodeURIComponent(workspace)}/projects/${projectId}/labels/`
  );
  return names.map((name) => {
    if (isUuid(name)) return name;
    const match = labels.find((l) => (l.name || "").toLowerCase() === name.toLowerCase());
    if (!match) {
      die(
        `label '${name}' not found in this project`,
        `Known: ${labels.map((l) => l.name).join(", ") || "(none)"}`
      );
    }
    return match.id;
  });
}

/**
 * Resolve assignees given as UUIDs, emails, or display names to user UUIDs.
 * @param {string} workspace
 * @param {string} projectId
 * @param {string[]} people
 * @returns {Promise<string[]>}
 */
export async function resolveAssigneeIds(workspace, projectId, people) {
  if (people.every(isUuid)) return people;
  const members = await paginate(
    `/workspaces/${encodeURIComponent(workspace)}/projects/${projectId}/project-members/`
  );
  return people.map((person) => {
    if (isUuid(person)) return person;
    const needle = person.toLowerCase();
    const match = members.find((m) => {
      const user = m.member || m;
      return (
        (user.email || "").toLowerCase() === needle ||
        (user.display_name || "").toLowerCase() === needle
      );
    });
    if (!match) {
      die(
        `member '${person}' not found in this project`,
        `Known: ${members.map(memberName).join(", ") || "(none)"}`
      );
    }
    return memberId(match);
  });
}

/**
 * Web permalink for a work item.
 * @param {string} workspace
 * @param {string} projectId
 * @param {string} workItemId
 */
export function workItemUrl(workspace, projectId, workItemId) {
  return `${WEB_URL}/${workspace}/projects/${projectId}/issues/${workItemId}`;
}

/**
 * Understand the three ways a work item gets referred to: a UUID, a
 * `PROJ-123` identifier, or a URL copied out of the browser.
 * @param {string} ref
 * @returns {{id: string|null, identifier: string|null, projectId: string|null}}
 */
export function parseWorkItemRef(ref) {
  const empty = { id: null, identifier: null, projectId: null };
  if (!ref) return empty;

  if (ref.startsWith("http://") || ref.startsWith("https://")) {
    const path = new URL(ref).pathname;
    const match = path.match(/\/projects\/([^/]+)\/(?:issues|work-items|epics)\/([^/?#]+)/);
    if (match) return { id: match[2], identifier: null, projectId: match[1] };
    return empty;
  }

  if (isUuid(ref)) return { ...empty, id: ref };
  if (/^[A-Za-z0-9]+-\d+$/.test(ref)) return { ...empty, identifier: ref.toUpperCase() };
  return empty;
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
 * Strip HTML down to readable plain text, for descriptions and comments.
 * @param {string} html
 * @returns {string}
 */
export function htmlToText(html) {
  if (!html) return "";
  return html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/\s*(p|div|li|h[1-6])\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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
