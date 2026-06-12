/**
 * Thin authenticated Jira REST API client.
 *
 * Fetches the API token from 1Password at first call and caches it for
 * the lifetime of the Pi process. Everything else (method, path, body,
 * query params) is the caller's responsibility.
 *
 * All values are configurable via environment variables so the defaults
 * can be overridden without code changes.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const JIRA_DOMAIN = process.env["JIRA_DOMAIN"] ?? "datadoghq.atlassian.net";
export const JIRA_EMAIL = process.env["JIRA_EMAIL"] ?? "matteo.ruina@datadoghq.com";

/** 1Password reference for the Atlassian API token. Override via env. */
const OP_REF =
  process.env["ATLASSIAN_API_KEY_REF"] ?? "op://Employee/Confluence API tokens/personal";

// Module-level cache — fetched once per Pi process.
let cachedToken: string | null = null;

async function getToken(): Promise<string> {
  if (cachedToken !== null) return cachedToken;
  try {
    const { stdout } = await execFileAsync("op", ["read", OP_REF], {
      encoding: "utf8",
      timeout: 15_000,
    });
    cachedToken = stdout.trim();
    if (!cachedToken) throw new Error("op read returned empty value");
    return cachedToken;
  } catch (err) {
    throw new Error(
      `jira: failed to read API token from 1Password (${OP_REF}): ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

export interface JiraRequestOptions {
  method: "GET" | "POST" | "PUT" | "DELETE";
  /** API path, must start with /. E.g. /rest/api/2/issue/PROJ-123 */
  path: string;
  /** Query-string params appended to the URL. */
  params?: Record<string, string>;
  /** JSON body for POST/PUT. */
  body?: unknown;
  signal?: AbortSignal;
}

/** Make an authenticated Jira REST API request and return the parsed JSON. */
export async function jiraRequest(opts: JiraRequestOptions): Promise<unknown> {
  const token = await getToken();
  const credentials = Buffer.from(`${JIRA_EMAIL}:${token}`).toString("base64");

  let url = `https://${JIRA_DOMAIN}${opts.path}`;
  if (opts.params && Object.keys(opts.params).length > 0) {
    const qs = new URLSearchParams(opts.params).toString();
    url = `${url}?${qs}`;
  }

  const headers: Record<string, string> = {
    Authorization: `Basic ${credentials}`,
    Accept: "application/json",
  };
  if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(url, {
    method: opts.method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Jira API ${opts.method} ${opts.path} → ${response.status}: ${text.slice(0, 300)}`);
  }

  return response.json();
}
