import { Type } from "@sinclair/typebox";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { JIRA_DOMAIN, type JiraRequestOptions } from "./_client.ts";
import { buildIssueLinkBody, issueUrl } from "./_write.ts";

type JiraLinkRequest = (options: JiraRequestOptions) => Promise<unknown>;

/** Register the Jira issue-link tool with an injectable request boundary. */
export function registerJiraLinkTool(pi: ExtensionAPI, jiraRequest: JiraLinkRequest): void {
  pi.registerTool({
    name: "jira_link",
    label: "Jira Link",
    description:
      'Create one Jira "Blocks" relationship between two existing issues. "blocks" means the primary issue blocks the linked issue; "is blocked by" means the primary issue is blocked by the linked issue.',
    promptGuidelines: [
      'Use jira_link only when the user explicitly asks to link Jira issues. Choose the relationship from the primary issue\'s perspective: "blocks" means the primary issue blocks the linked issue; "is blocked by" means the linked issue blocks the primary issue.',
    ],
    parameters: Type.Object({
      key: Type.String({
        description: 'Primary issue key, e.g. "PLAT-123".',
      }),
      linkedIssueKey: Type.String({
        description: 'Issue key to link to the primary issue, e.g. "PLAT-456".',
      }),
      linkType: Type.Union([Type.Literal("blocks"), Type.Literal("is blocked by")], {
        description: 'Relationship from the primary issue\'s perspective.',
      }),
    }),

    async execute(_toolCallId, params, signal) {
      if (params.key === params.linkedIssueKey) {
        throw new Error("jira_link: cannot link an issue to itself");
      }

      await jiraRequest({
        method: "POST",
        path: "/rest/api/2/issueLink",
        body: buildIssueLinkBody(params),
        signal,
      });

      const result = {
        key: params.key,
        linkedIssueKey: params.linkedIssueKey,
        linkType: params.linkType,
        url: issueUrl(params.key, JIRA_DOMAIN),
      };
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        details: {
          key: params.key,
          linkedIssueKey: params.linkedIssueKey,
          linkType: params.linkType,
        },
      };
    },
  });
}
