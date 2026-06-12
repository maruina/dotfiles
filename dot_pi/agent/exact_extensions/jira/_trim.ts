/**
 * Field-trimming helpers for Jira REST API v2 responses.
 *
 * v2 is preferred for reads because descriptions and comment bodies come
 * back as plain wiki-markup strings rather than ADF (Atlassian Document
 * Format), which is nested JSON and expensive to read.
 *
 * All helpers are pure functions — unit-testable without any network calls
 * or Pi process state.
 */

/** Minimal shape of a Jira user field as returned by v2. */
export interface JiraUser {
  displayName?: string;
}

/** Minimal shape of a v2 issue response. */
export interface RawJiraIssue {
  key?: string;
  fields?: {
    summary?: string;
    issuetype?: { name?: string };
    status?: { name?: string };
    priority?: { name?: string };
    assignee?: JiraUser | null;
    reporter?: JiraUser | null;
    labels?: string[];
    created?: string;
    updated?: string;
    description?: string | null;
    comment?: {
      comments?: RawJiraComment[];
      total?: number;
    };
    parent?: { key?: string; fields?: { summary?: string } };
  };
}

export interface RawJiraComment {
  author?: JiraUser;
  created?: string;
  body?: string;
}

/** The trimmed issue shape returned to the LLM. */
export interface TrimmedIssue {
  key: string;
  summary: string;
  type: string;
  status: string;
  priority: string;
  assignee: string;
  reporter: string;
  labels: string[];
  created: string;
  updated: string;
  description: string;
  parent?: { key: string; summary: string };
  comments?: TrimmedComment[];
  commentCount?: number;
}

export interface TrimmedComment {
  author: string;
  created: string;
  body: string;
}

/** Minimal shape of a v3 search response (POST /rest/api/3/search/jql). */
export interface RawSearchResponse {
  issues?: RawJiraIssue[];
  nextPageToken?: string;
  isLast?: boolean;
}

/** The trimmed search-result shape returned to the LLM. */
export interface TrimmedSearchResult {
  key: string;
  summary: string;
  type: string;
  status: string;
  priority: string;
  assignee: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function displayName(user: JiraUser | null | undefined, fallback = "Unassigned"): string {
  return user?.displayName ?? fallback;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Trim a raw v2 issue response to a compact shape safe to return to the LLM.
 *
 * @param raw             Raw API response.
 * @param includeComments Include the comments array. Default true.
 */
export function trimIssue(raw: RawJiraIssue, includeComments = true): TrimmedIssue {
  const f = raw.fields ?? {};
  const result: TrimmedIssue = {
    key: raw.key ?? "",
    summary: f.summary ?? "",
    type: f.issuetype?.name ?? "",
    status: f.status?.name ?? "",
    priority: f.priority?.name ?? "None",
    assignee: displayName(f.assignee),
    reporter: displayName(f.reporter, "Unknown"),
    labels: f.labels ?? [],
    created: f.created ?? "",
    updated: f.updated ?? "",
    description: f.description ?? "",
  };

  if (f.parent?.key) {
    result.parent = {
      key: f.parent.key,
      summary: f.parent.fields?.summary ?? "",
    };
  }

  if (includeComments && f.comment) {
    result.comments = (f.comment.comments ?? []).map((c) => ({
      author: displayName(c.author, "Unknown"),
      created: c.created ?? "",
      body: c.body ?? "",
    }));
    result.commentCount = f.comment.total ?? result.comments.length;
  }

  return result;
}

/**
 * Trim a list of issues from a search response.
 * Uses the same field allowlist as `trimIssue` but without comments
 * (search results never include comment bodies).
 */
export function trimSearchResults(raw: RawSearchResponse): {
  results: TrimmedSearchResult[];
  nextPageToken?: string;
  isLast: boolean;
} {
  return {
    results: (raw.issues ?? []).map((issue) => {
      const f = issue.fields ?? {};
      return {
        key: issue.key ?? "",
        summary: f.summary ?? "",
        type: f.issuetype?.name ?? "",
        status: f.status?.name ?? "",
        priority: f.priority?.name ?? "None",
        assignee: displayName(f.assignee),
      };
    }),
    nextPageToken: raw.nextPageToken,
    isLast: raw.isLast ?? true,
  };
}
