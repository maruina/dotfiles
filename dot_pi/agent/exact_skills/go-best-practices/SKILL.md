---
name: go-best-practices
description: Applies general Go best practices while writing or modifying Go code. Use for idiomatic Go naming, errors, tests, concurrency, package structure, style, and performance. Do not use as the primary guidance for Kubernetes controllers or controller-runtime code; use specialized controller skills first.
---
# Go Best Practices
Use for general Go changes. For controller-runtime, reconcilers, CRDs, watches, finalizers, status conditions, or envtest, load the Kubernetes-specific skill first.

Default to repository conventions. Make small, idiomatic changes. Do not rewrite working code for style alone.

## Principles

Optimize for simplicity, readability, and developer productivity:

- Write code for the reader. Prefer the clearest correct form over brevity, novelty, or local cleverness.
- Let identifier length scale with scope and lifetime: short names suit small local scopes; public and long-lived concepts need precise names.
- Prefer designs that eliminate expected errors and misuse rather than requiring every caller to avoid them correctly.
- Treat concurrency as an optimization. Introduce it only when it provides a measured or necessary benefit.

## Design
- Prefer simple, explicit code over clever abstractions.
- Match package style before adding a new pattern.
- Keep packages focused and domain-oriented. Name packages for what they provide, not what they contain; avoid vague buckets such as `util`, `common`, `helpers`, `models`, and `types`.
- Use `internal/` to enforce package boundaries when code is not a supported import surface.
- Prefer a useful zero value when it provides a clear and safe default. Add constructors only when callers need required setup, validation, or non-zero defaults.
- Return concrete types. Accept small interfaces at the consumer boundary.
- Do not create interfaces only for tests.
- Prefer a small amount of local duplication over coupling unrelated packages through a shared dependency.
- Avoid package-level mutable state unless it is read-only, lazily initialized, or synchronized.
- Prefer explicit initialization over `init`; never start unmanaged goroutines in `init`.
- Avoid `unsafe`, `reflect`, `go:linkname`, cgo, and `syscall` unless the need is clear and documented.
- Define a finite classification once when multiple code paths depend on it. Derive checks, labels, and validation from that shared definition rather than maintaining duplicate value lists.
- Parse external or unstructured input into a typed domain value at the boundary. Keep raw transport representations (such as `map[string]string`, JSON fields, environment variables, and ConfigMap data) out of internal state and business-logic APIs.
- Keep validation and fail-safe defaults alongside boundary parsing; pass only the resulting typed configuration to internal components.

## Naming
- Choose names for clarity and predictability, not minimum length. Use short names for narrow, conventional scopes and precise names for wider scopes or unfamiliar concepts.
- Do not repeat type information in a name when the type or surrounding scope already makes it clear.
- Use short, type-based receiver names (`c`, `u`), consistently for a type. Never use `self` or `this`.
- Use mixedCaps. Capitalize initialisms consistently: `ID`, `HTTP`, `URL`, `JSON`, `API`.
- Avoid stutter: `user.Config`, not `user.UserConfig`.
- Name one-method interfaces with `-er` when it fits.
- Omit `Get` from getters; use `SetOwner` for setters.
- Use US spelling in identifiers and comments.

## Control flow
- Handle errors and edge cases first; keep the happy path left-aligned.
- Omit `else` after `return`, `break`, `continue`, and `goto`.
- Treat deep nesting and screen-long functions as signals to decompose.
- Use `defer` for cleanup, including file closes and mutex unlocks.
- Use for loops over map/filter helpers. Clear beats clever.

## Errors
- Handle every error.
- Add concise operation and input context: `read config: %w`.
- Use `%w` only when callers should inspect the cause with `errors.Is` or `errors.As`.
- Prevent expected errors at the API boundary when a clearer type, signature, or invariant can make the invalid operation impossible.
- Handle an error once: add useful context, recover, translate it at a boundary, or return it. Do not log it and return it without a distinct operational reason.
- Keep error strings human-readable context, not a machine-readable protocol. Use typed errors, sentinel errors, or structured results when callers need to branch on failure.
- Do not parse error strings.
- Return `error` or `(value, bool)` instead of in-band sentinels.
- Keep process exit in `main`; put testable command logic in a `run` function.

## Tests
- Test behavior, not implementation details.
- Use table-driven tests when they reduce duplication; split them when setup or assertions become conditional.
- Use descriptive subtest names and failure messages with got before want.
- Mark helpers with `t.Helper()`.
- Use `t.Cleanup`, `t.TempDir`, `t.Setenv`, and `t.Context` when available.
- Use `cmp.Diff` for complex values and semantic error checks instead of exact error strings.

## Concurrency
- Treat concurrency as an optimization, not a default. Introduce it only for a stated latency, throughput, responsiveness, or isolation need.
- Give every goroutine a lifetime, stop condition, owner, and wait path when callers must observe completion.
- Prefer synchronous functions; let callers choose `go f()`.
- Pass `context.Context` as the first parameter except in established signatures. Do not store contexts in structs.
- Call `WaitGroup.Add` before starting goroutines.
- Do not copy sync types or embed mutexes; use named fields such as `mu sync.Mutex`.
- Use channels for coordination and mutexes for shared data.
- Use small channel buffers by default. Larger buffers need a reason.

## Data and performance
- Do not optimize without evidence.
- Preallocate only when capacity is known.
- Copy slices and maps at API boundaries when retaining or exposing them would allow mutation.
- Prefer nil slices unless JSON/API semantics require non-nil slices.
- Use `time.Time` for instants and `time.Duration` for durations.
- Before writing a small helper to sort, dedupe, clone, or extract keys, check `slices`/`maps`/`cmp` (Go 1.21+) for an existing function; prefer it over a hand-rolled loop. Verify nil-vs-empty-slice semantics before swapping an existing helper for a stdlib call — e.g. `slices.Clone(nil)` returns `nil`, not `[]T{}`, which can silently reintroduce `null` where a contract (such as stable JSON output) requires a non-nil empty slice.
- Use standard helpers (`strings.Cut`, `slices`, `maps`, `cmp.Or`, `min`, `max`, `clear`) when they simplify code.

## Comments
- Document exported APIs when their name and signature do not fully establish their contract.
- Write doc comments as complete sentences. Start them with the documented identifier when that improves discoverability.
- Explain contracts, constraints, ownership, invariants, compatibility behavior, and non-obvious decisions. Do not restate code.
- Keep directives exact, such as `//go:build`.

## Finish
- Run `gofmt`/`goimports`.
- Run relevant tests.
- Run `go vet` or the repo lint target when practical.
- Run race tests when touching concurrency.
