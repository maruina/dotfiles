/**
 * Pure request-body and response helpers for jira_create and jira_update.
 *
 * Uses REST v2 so descriptions and comments stay wiki-markup strings —
 * the LLM never has to produce ADF (Atlassian Document Format).
 *
 * All helpers are pure functions — unit-testable without any network calls
 * or Pi process state. Network-facing resolution (assignee lookup, status
 * pre-resolution) lives in index.ts execute().
 */

// ---------------------------------------------------------------------------
// Raw API shapes (only the fields the write tools read)
// ---------------------------------------------------------------------------

/** Minimal shape of POST /rest/api/2/issue (create) response. */
export interface RawCreateResponse {
  id?: string;
  key?: string;
}

/** Minimal shape of GET /rest/api/2/issue/{key}/transitions. */
export interface RawTransitionsResponse {
  transitions?: RawTransition[];
}

export interface RawTransition {
  id?: string;
  /** Transition name, e.g. "Start Progress". */
  name?: string;
  /** Target status, e.g. { name: "In Progress" }. */
  to?: { name?: string };
}

/** Minimal shape of a user from GET /rest/api/2/user/search. */
export interface RawUser {
  accountId?: string;
  emailAddress?: string;
  displayName?: string;
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export interface CreateInput {
  project: string;
  summary: string;
  issueType: string;
  description?: string;
  labels?: string[];
  priority?: string;
}

/** Build the POST /rest/api/2/issue body from tool parameters. */
export function buildCreateBody(input: CreateInput): Record<string, unknown> {
  const fields: Record<string, unknown> = {
    project: { key: input.project },
    summary: input.summary,
    issuetype: { name: input.issueType },
  };
  if (input.description !== undefined) {
    fields["description"] = input.description;
  }
  if (input.labels !== undefined) {
    fields["labels"] = input.labels;
  }
  if (input.priority !== undefined) {
    fields["priority"] = { name: input.priority };
  }
  return { fields };
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

export interface UpdateFieldsInput {
  summary?: string;
  description?: string;
  /** Full replacement list — Jira semantics, not a merge. */
  labels?: string[];
  priority?: string;
  /**
   * Pre-resolved account ID, null to unassign, undefined to leave unchanged.
   * Resolution from a user query happens in index.ts (needs the user search API).
   */
  assigneeAccountId?: string | null;
}

/**
 * Build the `fields` object for PUT /rest/api/2/issue/{key} from the provided
 * update parameters. Returns null when no field parameters were provided, so
 * callers can reject no-op updates before making any request.
 */
export function buildUpdateFields(input: UpdateFieldsInput): Record<string, unknown> | null {
  const fields: Record<string, unknown> = {};
  if (input.summary !== undefined) fields["summary"] = input.summary;
  if (input.description !== undefined) fields["description"] = input.description;
  if (input.labels !== undefined) fields["labels"] = input.labels;
  if (input.priority !== undefined) fields["priority"] = { name: input.priority };
  if (input.assigneeAccountId !== undefined) {
    fields["assignee"] =
      input.assigneeAccountId === null ? null : { accountId: input.assigneeAccountId };
  }
  return Object.keys(fields).length > 0 ? fields : null;
}

/** True when at least one update parameter was provided. */
export function hasUpdateChanges(params: {
  summary?: string;
  description?: string;
  labels?: string[];
  priority?: string;
  assignee?: string;
  status?: string;
  comment?: string;
}): boolean {
  return (
    params.summary !== undefined ||
    params.description !== undefined ||
    params.labels !== undefined ||
    params.priority !== undefined ||
    params.assignee !== undefined ||
    params.status !== undefined ||
    params.comment !== undefined
  );
}

/** Literal assignee values that mean "clear the assignee". */
const UNASSIGN_VALUES = new Set(["", "unassigned", "none"]);

/** True when an assignee parameter means "clear the assignee". */
export function isUnassign(value: string): boolean {
  return UNASSIGN_VALUES.has(value.trim().toLowerCase());
}

/**
 * Pick the Jira user matching a query string (email or display name).
 * Exact case-insensitive match on email first, then display name.
 * Returns undefined when no exact match — callers should fail loudly
 * rather than guess, to avoid assigning the wrong person.
 */
export function pickAssignee(users: RawUser[], query: string): RawUser | undefined {
  const q = query.trim().toLowerCase();
  return (
    users.find((u) => (u.emailAddress ?? "").trim().toLowerCase() === q) ??
    users.find((u) => (u.displayName ?? "").trim().toLowerCase() === q)
  );
}

/**
 * Find the transition that moves the issue to the requested status.
 * Matches the target status name first (e.g. "In Progress"), falling back
 * to the transition name (e.g. "Start Progress"), case-insensitively.
 */
export function findTransition(
  raw: RawTransitionsResponse,
  status: string,
): RawTransition | undefined {
  const wanted = status.trim().toLowerCase();
  const transitions = raw.transitions ?? [];
  return (
    transitions.find((t) => (t.to?.name ?? "").trim().toLowerCase() === wanted) ??
    transitions.find((t) => (t.name ?? "").trim().toLowerCase() === wanted)
  );
}

/** Distinct target status names, for error messages on unknown status. */
export function availableTransitions(raw: RawTransitionsResponse): string[] {
  const names = new Set<string>();
  for (const t of raw.transitions ?? []) {
    names.add(t.to?.name ?? t.name ?? "?");
  }
  return [...names];
}

// ---------------------------------------------------------------------------
// Result trimming
// ---------------------------------------------------------------------------

/** Browse URL for an issue key. */
export function issueUrl(key: string, domain: string): string {
  return `https://${domain}/browse/${key}`;
}

/** Trim a create response to the compact shape returned to the LLM. */
export function trimCreateResult(raw: RawCreateResponse, domain: string): {
  key: string;
  id: string;
  url: string;
} {
  const key = raw.key ?? "";
  return {
    key,
    id: raw.id ?? "",
    url: key ? issueUrl(key, domain) : "",
  };
}
