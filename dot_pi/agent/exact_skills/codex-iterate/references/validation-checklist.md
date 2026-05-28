# Validation checklist

Use this checklist for every Codex finding. The output of validation is a verdict (`valid — fix`, `valid — judgment-call`, `valid — accept as-is`, `valid — defer`, `uncertain`, or `rejected — <reason>`) that determines routing: silent auto-apply, auto-apply with audit note, addressed list, end-of-loop buffer, or drop.

## Override of the parent rule

The parent skill `codex:codex-result-handling` says:

> CRITICAL: After presenting review findings, STOP. Do not make any code changes. Do not fix any issues. Explicitly ask the user which issues, if any, they want fixed before touching a single file. Auto-applying fixes from a review is strictly forbidden, even if the fix is obvious.

**This skill (`codex-iterate`) explicitly overrides that rule, scoped to its own iteration loop.** The rationale: this skill is designed for uninterrupted multi-round iteration, where pausing for user approval after every round defeats the entire premise. The gate that replaces user approval is **Pi's independent verification** — Pi must reproduce the finding from current code before applying any fix, and findings Pi cannot independently verify go to a buffer that surfaces at end-of-loop instead of mid-round.

The override is scoped: single-pass usages via `codex:rescue` still honor the parent rule unchanged. Inside this skill, `valid — fix` and `valid — judgment-call` findings are applied autonomously after Pi's gate passes.

## Pi's independent verification gate

Every finding routed to `valid — fix` or `valid — judgment-call` must pass all four steps. On any failure or unclear step, demote to `uncertain` (buffer) or `rejected` (drop) as appropriate.

1. **Cited location exists.** Open the file/line range. The file must exist, the line must be in range, the cited symbol must be present. Codex sometimes hallucinates symbol locations, especially across renames.
2. **Code matches the claim.** Read the cited code. Does it actually do what Codex says? Reject (`rejected — code does not match`) if the claim describes a different shape of code.
3. **Trace the consequence.** For findings of shape "this could leak / race / nil-deref / break X", trace the consequence through the surrounding code far enough to be confident it actually applies. Superficial pattern-match is not enough.
4. **Cross-check conventions and callers.** Check the nearest `CLAUDE.md`, code-style files, and visible project rules. For any change that affects callers, grep for usages and confirm the proposed fix doesn't regress other call sites.

If any step is unclear or requires judgment Pi cannot defend → demote to `uncertain` → buffer for end-of-loop.

## Validity checks (does the finding describe reality?)

The gate above handles validity. For reference, the failure modes that map to `rejected — <reason>`:

1. **Location does not exist** (gate step 1 fails). Codex hallucinated the symbol or file.
2. **Code does not match the claim** (gate step 2 fails). The cited code does a different thing.
3. **Already addressed** in an earlier round or by a parallel edit — the finding no longer applies.
4. **Conflicts with project conventions** (gate step 4) — `CLAUDE.md` or visible rule overrides the finding.
5. **Severity overstated.** If Codex labels something "critical" but the cited code is in a dev-only path or behind a feature flag, downgrade severity in the verdict line; don't silently reject. Be honest about real impact.

## Actionability checks (should the loop address it now?)

For findings that pass validity, these determine routing:

1. **Scope match.** Inside the user's declared scope? If not → `valid — defer` → buffer.
2. **Concrete cause.** Specific cause cited, not vague "could be improved"? Vague suggestions → `uncertain` → buffer.
3. **Reversibility.** Would the fix require destructive/hard-to-reverse changes (schema migration, file deletion, force-push)? Surface as `uncertain` → buffer; the user must opt in explicitly.
4. **Cost.** Is the fix proportional to the issue? A 200-line refactor for a minor nit → `valid — defer` → buffer.

## Verdict labels and routing

| Verdict | When | Routing |
|---|---|---|
| `valid — fix` | Passes all four gate steps cleanly; no reviewer would reasonably pick a different fix | Auto-apply edit silently — the tool call itself is the audit trail |
| `valid — judgment-call` | Passes all four gate steps; Pi is confident enough to defend the choice; the fix encodes a non-trivial inline decision a reviewer might reasonably pick differently | Auto-apply edit AND write a one-line audit note in this round's summary block explaining the decision |
| `valid — accept as-is` | Passes validity; the user previously marked this behavior as intended | Add to addressed list (carries forward to Codex on `--resume-last` so it stops re-flagging) |
| `valid — defer` | Passes validity but fails actionability (out of scope, too costly, or behind a flag the user must opt into) | Buffer for end-of-loop |
| `uncertain` | Passes most checks but at least one is unclear, OR Pi cannot defend the proposed fix against a reasonable reviewer | Buffer for end-of-loop |
| `rejected — <one-line reason>` | Fails at least one gate step (location, code-match, already addressed, conflicts with convention) | Drop with the one-line reason in the round summary |

### `valid — fix` vs `valid — judgment-call`: the decision-shape test

Both pass the four-step gate. The difference is the shape of the fix:

- **Silent `valid — fix`** when the fix is mechanically determined by the finding — rename a misspelled symbol, add a clearly-missing null check that matches surrounding code, fix a documented signature mismatch, restore a broken doc link.
- **`valid — judgment-call`** when applying the fix requires a non-trivial inline decision a reviewer might reasonably pick differently — for example: "should we emulate Splunk's behavior here or document the divergence?", "should this retry be exponential or fixed delay?", "should missing input be a warning or a hard error?" Apply the fix Pi judges best AND record the one-line reason as an audit note.

Be honest in tiering. Lazy use of `judgment-call` for a fix that's actually mechanical pollutes the audit trail. Conversely, silently auto-applying a fix when the choice was genuinely contestable is exactly what the audit-note tier is meant to prevent.

## Round log format

Use this structure for each finding line in the per-round summary block (appended in Step 5 of `SKILL.md`):

```
- `<file>:<line>` — <one-line summary> — <verdict> → <action>
```

Examples:

```
- `cache/redis.go:120` — Race on `cache.m` map writes — valid — fix → applied (added RWMutex around accessor)
- `api/user.go:45` — Missing nil check — rejected — code does not match (caller is type-guarded)
- `service/retry.go:80` — Retry policy ambiguous — valid — judgment-call → applied (chose fixed delay; Splunk parity requires deterministic retries)
- `migration/0014.sql:14` — Schema column rename — uncertain → queued (destructive; needs user go-ahead)
```

The audit-note in parentheses on `valid — judgment-call` lines is what distinguishes them from silent `valid — fix` lines. Make the note specific enough that a reviewer reading the transcript later can tell what trade-off Pi was making.
