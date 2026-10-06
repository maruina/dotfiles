import assert from "node:assert/strict";
import test from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import type { JiraRequestOptions } from "./_client.ts";
import { registerJiraLinkTool } from "./_link.ts";

type JiraLinkTool = {
  name: string;
  description: string;
  promptGuidelines: string[];
  parameters: {
    properties: {
      linkType: {
        anyOf: Array<{ const: string }>;
      };
    };
  };
  execute(
    toolCallId: string,
    params: { key: string; linkedIssueKey: string; linkType: string },
    signal: AbortSignal,
  ): Promise<{ content: Array<{ text: string }>; details: Record<string, unknown> }>;
};

function registerLinkTool(request: (options: JiraRequestOptions) => Promise<unknown>): JiraLinkTool {
  let registeredTool: unknown;
  const pi = {
    registerTool(tool: unknown) {
      registeredTool = tool;
    },
  } as unknown as ExtensionAPI;

  registerJiraLinkTool(pi, request);
  assert.ok(registeredTool, "jira_link should be registered");
  return registeredTool as JiraLinkTool;
}

const linkCases = [
  {
    linkType: "blocks",
    inwardIssue: { key: "PLAT-456" },
    outwardIssue: { key: "PLAT-123" },
  },
  {
    linkType: "is blocked by",
    inwardIssue: { key: "PLAT-123" },
    outwardIssue: { key: "PLAT-456" },
  },
] as const;

test("jira_link registers only the supported directions and gives usage guidance", () => {
  const tool = registerLinkTool(async () => null);

  assert.equal(tool.name, "jira_link");
  assert.deepEqual(
    tool.parameters.properties.linkType.anyOf.map((option) => option.const),
    ["blocks", "is blocked by"],
  );
  assert.match(tool.description, /Blocks/);
  assert.ok(tool.promptGuidelines.some((guideline) => guideline.includes("jira_link")));
});

for (const linkCase of linkCases) {
  test(`jira_link maps ${linkCase.linkType} to the Jira Blocks direction`, async () => {
    const requests: JiraRequestOptions[] = [];
    const tool = registerLinkTool(async (options) => {
      requests.push(options);
      return null;
    });
    const signal = new AbortController().signal;

    const result = await tool.execute("call-1", {
      key: "PLAT-123",
      linkedIssueKey: "PLAT-456",
      linkType: linkCase.linkType,
    }, signal);

    assert.deepEqual(requests, [
      {
        method: "POST",
        path: "/rest/api/2/issueLink",
        body: {
          type: { name: "Blocks" },
          inwardIssue: linkCase.inwardIssue,
          outwardIssue: linkCase.outwardIssue,
        },
        signal,
      },
    ]);
    assert.deepEqual(JSON.parse(result.content[0].text), {
      key: "PLAT-123",
      linkedIssueKey: "PLAT-456",
      linkType: linkCase.linkType,
      url: "https://datadoghq.atlassian.net/browse/PLAT-123",
    });
    assert.deepEqual(result.details, {
      key: "PLAT-123",
      linkedIssueKey: "PLAT-456",
      linkType: linkCase.linkType,
    });
  });
}

test("jira_link rejects a self-link before making a request", async () => {
  let requestCount = 0;
  const tool = registerLinkTool(async () => {
    requestCount++;
    return null;
  });

  await assert.rejects(
    tool.execute("call-1", {
      key: "PLAT-123",
      linkedIssueKey: "PLAT-123",
      linkType: "blocks",
    }, new AbortController().signal),
    /cannot link an issue to itself/i,
  );
  assert.equal(requestCount, 0);
});

test("jira_link propagates Jira errors without retrying", async () => {
  const failure = new Error("permission denied");
  let requestCount = 0;
  const tool = registerLinkTool(async () => {
    requestCount++;
    throw failure;
  });

  await assert.rejects(
    tool.execute("call-1", {
      key: "PLAT-123",
      linkedIssueKey: "PLAT-456",
      linkType: "blocks",
    }, new AbortController().signal),
    failure,
  );
  assert.equal(requestCount, 1);
});
