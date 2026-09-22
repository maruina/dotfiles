/**
 * Jira extension — jira_issue, jira_search, jira_create, jira_update tools.
 *
 * Registers lean tools the LLM can call directly instead of going
 * through the Atlassian MCP:
 *
 *   jira_issue  — fetch a single issue with a fixed field allowlist.
 *                 ~300 bytes vs. ~50 KB from the raw API or MCP.
 *   jira_search — run a JQL query and return a trimmed list of results.
 *   jira_create — create an issue in one call.
 *   jira_update — update fields, transition status, or comment on an issue.
 *
 * Uses Jira REST API v2 for issue GETs and writes (descriptions and
 * comments are plain wiki-markup, not ADF), and the new v3 POST
 * /rest/api/3/search/jql endpoint for JQL (the v2/v3 GET was deprecated
 * in 2025).
 *
 * Auth: 1Password via op://Employee/Confluence API tokens/personal.
 * Override via ATLASSIAN_API_KEY_REF, JIRA_EMAIL, JIRA_DOMAIN env vars.
 */

import { Type } from "@sinclair/typebox";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { jiraRequest, JIRA_DOMAIN } from "./_client.ts";
import { trimIssue, trimSearchResults } from "./_trim.ts";
import type { RawJiraIssue, RawSearchResponse } from "./_trim.ts";
import {
  availableTransitions,
  buildCreateBody,
  buildUpdateFields,
  findTransition,
  hasUpdateChanges,
  isUnassign,
  issueUrl,
  pickAssignee,
  trimCreateResult,
} from "./_write.ts";
import type { RawTransitionsResponse, RawUser } from "./_write.ts";

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
      "Use jira_issue when reading a Jira ticket — it returns a compact response that fits in context without field bloat.",
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
      "Use jira_search when running a JQL query — it returns compact results without field bloat.",
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

  // ── jira_create ─────────────────────────────────────────────────────────

  pi.registerTool({
    name: "jira_create",
    label: "Jira Create",
    description:
      'Create a Jira issue. Returns the new key, id, and URL. Descriptions use wiki markup (e.g. "h2. Heading", "*bold*", "[link|url]"), not ADF. Default issue type is Task.',
    promptGuidelines: [
      "Use jira_create only when the user explicitly asks to create a Jira ticket. Use jira_search or jira_issue first when the project key, issue type, or priority convention is unclear.",
    ],
    parameters: Type.Object({
      project: Type.String({
        description: 'Project key, e.g. "PLAT" or "COST".',
      }),
      summary: Type.String({
        description: "Issue summary (title).",
      }),
      type: Type.Optional(
        Type.String({
          description: 'Issue type name, e.g. "Task", "Story", "Bug". Defaults to "Task".',
          default: "Task",
        }),
      ),
      description: Type.Optional(
        Type.String({
          description: "Issue description in wiki markup.",
        }),
      ),
      labels: Type.Optional(
        Type.Array(Type.String(), {
          description: "Labels to set on the new issue.",
        }),
      ),
      priority: Type.Optional(
        Type.String({
          description: 'Priority name, e.g. "P1". Project-specific — check with jira_search when unsure.',
        }),
      ),
    }),

    async execute(_toolCallId, params, signal) {
      const body = buildCreateBody({
        project: params.project,
        summary: params.summary,
        issueType: params.type ?? "Task",
        description: params.description,
        labels: params.labels,
        priority: params.priority,
      });

      const raw = await jiraRequest({
        method: "POST",
        path: "/rest/api/2/issue",
        body,
        signal,
      });

      const trimmed = trimCreateResult(raw, JIRA_DOMAIN);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(trimmed, null, 2) }],
        details: { key: trimmed.key, project: params.project },
      };
    },
  });

  // ── jira_update ─────────────────────────────────────────────────────────

  pi.registerTool({
    name: "jira_update",
    label: "Jira Update",
    description:
      'Update a Jira issue: edit summary, description, labels, priority, assignee; transition workflow status; or add a comment. All parameters are optional — only provided ones change. Labels are a full replacement list. Assignee takes an email or display name ("Unassigned" clears it). Status is the target workflow status, e.g. "In Progress" or "Done".',
    promptGuidelines: [
      "Use jira_update only when the user explicitly asks to modify a Jira ticket. For assignee or status changes, pass the exact name — resolution failures list valid candidates and apply no changes.",
    ],
    parameters: Type.Object({
      key: Type.String({
        description: 'Issue key, e.g. "PLAT-123".',
      }),
      summary: Type.Optional(Type.String({ description: "New summary." })),
      description: Type.Optional(
        Type.String({ description: "New description in wiki markup (full replacement)." }),
      ),
      labels: Type.Optional(
        Type.Array(Type.String(), {
          description: "New full label list (replaces existing labels).",
        }),
      ),
      priority: Type.Optional(
        Type.String({ description: 'Priority name, e.g. "P2".' }),
      ),
      assignee: Type.Optional(
        Type.String({
          description: 'Assignee email or display name. "Unassigned" clears the assignee.',
        }),
      ),
      status: Type.Optional(
        Type.String({
          description: 'Target workflow status, e.g. "In Progress" or "Done".',
        }),
      ),
      comment: Type.Optional(
        Type.String({ description: "Comment to add, in wiki markup." }),
      ),
    }),

    async execute(_toolCallId, params, signal) {
      if (!hasUpdateChanges(params)) {
        throw new Error(
          "jira_update: nothing to update — provide at least one of summary, description, labels, priority, assignee, status, comment",
        );
      }

      const issuePath = `/rest/api/2/issue/${encodeURIComponent(params.key)}`;

      // Pre-resolve before any mutation so a bad assignee or status name
      // fails with zero side effects.
      let assigneeAccountId: string | null | undefined;
      if (params.assignee !== undefined) {
        if (isUnassign(params.assignee)) {
          assigneeAccountId = null;
        } else {
          const users = (await jiraRequest({
            method: "GET",
            path: "/rest/api/2/user/search",
            params: { query: params.assignee },
            signal,
          })) as RawUser[];
          const user = pickAssignee(users, params.assignee);
          if (!user?.accountId) {
            const candidates = users
              .map((u) => u.displayName ?? u.emailAddress ?? "unknown")
              .slice(0, 5)
              .join(", ");
            throw new Error(
              `jira_update: no exact Jira user match for "${params.assignee}"${candidates ? ` (searched: ${candidates})` : ""}`,
            );
          }
          assigneeAccountId = user.accountId;
        }
      }

      let transitionId: string | undefined;
      if (params.status !== undefined) {
        const raw = (await jiraRequest({
          method: "GET",
          path: `${issuePath}/transitions`,
          signal,
        })) as RawTransitionsResponse;
        const transition = findTransition(raw, params.status);
        if (!transition?.id) {
          throw new Error(
            `jira_update: issue ${params.key} has no transition to status "${params.status}". Available: ${availableTransitions(raw).join(", ") || "none"}`,
          );
        }
        // deliberate: screen transitions that require extra fields are not
        // supported; Jira's error names the missing fields if one is hit.
        transitionId = transition.id;
      }

      const applied: string[] = [];

      const fields = buildUpdateFields({
        summary: params.summary,
        description: params.description,
        labels: params.labels,
        priority: params.priority,
        assigneeAccountId,
      });
      if (fields) {
        await jiraRequest({ method: "PUT", path: issuePath, body: { fields }, signal });
        applied.push(...Object.keys(fields));
      }

      if (transitionId !== undefined) {
        await jiraRequest({
          method: "POST",
          path: `${issuePath}/transitions`,
          body: { transition: { id: transitionId } },
          signal,
        });
        applied.push(`status:${params.status}`);
      }

      if (params.comment !== undefined) {
        await jiraRequest({
          method: "POST",
          path: `${issuePath}/comment`,
          body: { body: params.comment },
          signal,
        });
        applied.push("comment");
      }

      const result = {
        key: params.key,
        url: issueUrl(params.key, JIRA_DOMAIN),
        updated: applied,
      };
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        details: { key: params.key, updated: applied },
      };
    },
  });
}
