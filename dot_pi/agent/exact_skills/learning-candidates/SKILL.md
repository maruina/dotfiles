---
name: learning-candidates
description: Record learning candidates in a plan's `## Learning candidates` ledger for a later /learn run. Use from /plan, /execute, /simplify, and /pr-address-feedback when the calling prompt's trigger occurs. Read-only stages such as /systematic-review and /verify do not record candidates.
---
# Learning Candidates
Record surprises from lifecycle work so that a later plain `/learn` run can adjudicate them. The calling prompt names the trigger that makes an event a candidate. This skill defines the ledger format and the filter.

## Ledger format
Append one line under the plan's `## Learning candidates` section. Create the section only on the first candidate.

```md
- YYYY-MM-DD: <what happened> — evidence: <shareable pointer: PR thread URL, repo-relative file and line, or command and result>
```

## Filter
Record only surprises that a fresh model would not reliably produce and apply unaided at the moment it matters.

Never record:
- routine best practice
- design rationale
- session paths
- secrets
- vault content

## Ledger location
Write to the plan that the calling prompt resolved. If the calling prompt cannot resolve exactly one plan, report the candidates in its output and do not pick a plan silently.
