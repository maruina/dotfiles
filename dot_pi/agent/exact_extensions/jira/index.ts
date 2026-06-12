/**
 * Jira extension — jira_issue and jira_search tools.
 *
 * Registers two lean tools the LLM can call directly instead of going
 * through the Atlassian MCP:
 *
 *   jira_issue  — fetch a single issue with a fixed field allowlist.
 *                 ~300 bytes vs. ~50 KB from the raw API or MCP.
 *   jira_search — run a JQL query and return a trimmed list of results.
 *
 * Uses Jira REST API v2 for issue GETs (descriptions and comments come
 * back as plain wiki-markup, not ADF), and the new v3 POST
 * /rest/api/3/search/jql endpoint for JQL (the v2/v3 GET was deprecated
 * in 2025).
 *
 * Auth: 1Password via op://Employee/Confluence API tokens/personal.
 * Override via ATLASSIAN_API_KEY_REF, JIRA_EMAIL, JIRA_DOMAIN env vars.
 */

import { Type } from "@sinclair/typebox";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { jiraRequest } from "./_client.ts";
import { trimIssue, trimSearchResults } from "./_trim.ts";
import type { RawJiraIssue, RawSearchResponse } from "./_trim.ts";

// Fields fetched on every issue GET. Explicit allowlist keeps responses
// small and predictable — the default includes 50+ customfield_* entries.
const ISSUE_FIELDS = [
  "summary",
  "issuetype",
  "status",
  "priority",
  "assignee",
  "reporter",
  "labels",
  "created",
  "updated",
  "description",
  "comment",
  "parent",
].join(",");

// Fields fetched per issue in search results (no comment bodies).
const SEARCH_FIELDS = ["summary", "issuetype", "status", "priority", "assignee"];

export default function jiraExtension(pi: ExtensionAPI): void {
  // ── jira_issue ─────────────────────────────────────────────────────────

  pi.registerTool({
    name: "jira_issue",
    label: "Jira Issue",
    description:
      "Fetch a Jira issue with a trimmed field set. Returns key, summary, type, status, priority, assignee, reporter, labels, dates, description (plain text), parent, and optionally comments. No custom fields, no ADF blobs, no rendered HTML duplicates.",
    promptGuidelines: [
      "Use jira_issue (not the atlassian-mcp getJiraIssue tool) when reading a Jira ticket — it returns a compact response that fits in context without field bloat.",
    ],
    parameters: Type.Object({
      key: Type.String({
        description: 'Issue key, e.g. "PLAT-123" or "COST-456".',
      }),
      includeComments: Type.Optional(
        Type.Boolean({
          description: "Include comment thread. Defaults to true.",
          default: true,
        }),
      ),
    }),

    async execute(_toolCallId, params, signal) {
      const includeComments = params.includeComments ?? true;
      const fields = includeComments ? ISSUE_FIELDS : ISSUE_FIELDS.replace(",comment", "");

      const raw = (await jiraRequest({
        method: "GET",
        path: `/rest/api/2/issue/${encodeURIComponent(params.key)}`,
        params: { fields },
        signal,
      })) as RawJiraIssue;

      const trimmed = trimIssue(raw, includeComments);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(trimmed, null, 2) }],
        details: { key: params.key, includeComments },
      };
    },
  });

  // ── jira_search ────────────────────────────────────────────────────────

  pi.registerTool({
    name: "jira_search",
    label: "Jira Search",
    description:
      "Search Jira with a JQL query. Returns a trimmed list: key, summary, type, status, priority, assignee. Use jira_issue for full issue detail including description and comments.",
    promptGuidelines: [
      "Use jira_search (not the atlassian-mcp searchJiraIssuesUsingJql tool) when running a JQL query — it returns compact results without field bloat.",
    ],
    parameters: Type.Object({
      jql: Type.String({
        description:
          'JQL query string. E.g. "project = PLAT AND assignee = currentUser() AND status != Done ORDER BY updated DESC".',
      }),
      maxResults: Type.Optional(
        Type.Number({
          description: "Maximum number of results to return. Defaults to 20, max 50.",
          default: 20,
        }),
      ),
      nextPageToken: Type.Optional(
        Type.String({
          description: "Pagination token from a previous jira_search call.",
        }),
      ),
    }),

    async execute(_toolCallId, params, signal) {
      const maxResults = Math.min(params.maxResults ?? 20, 50);

      const body: Record<string, unknown> = {
        jql: params.jql,
        fields: SEARCH_FIELDS,
        maxResults,
      };
      if (params.nextPageToken) {
        body["nextPageToken"] = params.nextPageToken;
      }

      const raw = (await jiraRequest({
        method: "POST",
        path: "/rest/api/3/search/jql",
        body,
        signal,
      })) as RawSearchResponse;

      const trimmed = trimSearchResults(raw);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(trimmed, null, 2) }],
        details: {
          jql: params.jql,
          maxResults,
          count: trimmed.results.length,
          isLast: trimmed.isLast,
          nextPageToken: trimmed.nextPageToken,
        },
      };
    },
  });
}
