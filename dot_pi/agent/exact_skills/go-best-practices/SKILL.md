---
name: go-best-practices
description: Applies general Go best practices while writing or modifying Go code. Use for idiomatic Go naming, errors, tests, concurrency, package structure, style, and performance. Do not use as the primary guidance for Kubernetes controllers or controller-runtime code; use specialized controller skills first.
---
# Go Best Practices
Use for general Go changes. For controller-runtime, reconcilers, CRDs, watches, finalizers, status conditions, or envtest, load the Kubernetes-specific skill first.

Default to repository conventions. Make small, idiomatic changes. Do not rewrite working code for style alone.

## Design
- Prefer simple, explicit code over clever abstractions.
- Match package style before adding a new pattern.
- Keep packages focused and domain-oriented; avoid `util`, `common`, and `helpers`.
- Return concrete types. Accept small interfaces at the consumer boundary.
- Do not create interfaces only for tests.
- Avoid package-level mutable state unless it is read-only, lazily initialized, or synchronized.
- Prefer explicit initialization over `init`; never start unmanaged goroutines in `init`.
- Avoid `unsafe`, `reflect`, `go:linkname`, cgo, and `syscall` unless the need is clear and documented.
- Define a finite classification once when multiple code paths depend on it. Derive checks, labels, and validation from that shared definition rather than maintaining duplicate value lists.
- Parse external or unstructured input into a typed domain value at the boundary. Keep raw transport representations (such as `map[string]string`, JSON fields, environment variables, and ConfigMap data) out of internal state and business-logic APIs.
- Keep validation and fail-safe defaults alongside boundary parsing; pass only the resulting typed configuration to internal components.

## Naming
- Use short names for narrow scopes and longer names for wider scopes or unfamiliar concepts.
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
- Do not log and return the same error without a specific reason.
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
- Give every goroutine a lifetime, stop condition, and wait path when callers must observe completion.
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
- Use standard helpers (`strings.Cut`, `slices`, `maps`, `cmp.Or`, `min`, `max`, `clear`) when they simplify code.

## Comments
- Document exported APIs.
- Explain why, constraints, contracts, and non-obvious behavior. Do not restate code.
- Keep directives exact, such as `//go:build`.

## Finish
- Run `gofmt`/`goimports`.
- Run relevant tests.
- Run `go vet` or the repo lint target when practical.
- Run race tests when touching concurrency.
