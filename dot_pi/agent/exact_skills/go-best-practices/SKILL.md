---
name: go-best-practices
description: Applies general Go best practices while writing or modifying Go code. Use for idiomatic Go naming, errors, tests, concurrency, package structure, style, and performance. Do not use as the primary guidance for Kubernetes controllers or controller-runtime code; use specialized controller skills first.
---
# Go Best Practices
Use this skill when writing or modifying Go code.

If the task is specifically about Kubernetes controllers, reconcilers, controller-runtime, CRDs, watches, finalizers, status conditions, or envtest, use the specialized controller skills first.

## Writing Go
- Prefer simple, explicit code over clever abstractions.
- Match the surrounding package style before introducing new patterns.
- Keep names short and idiomatic: `ctx`, `err`, `cfg`, `srv`, `mu`, `wg`.
- Use mixedCaps; never snake_case.
- Use correct initialisms: `ID`, `HTTP`, `URL`, `JSON`, `API`.
- Return concrete types; accept small interfaces at the consumer boundary.
- Do not create interfaces only for tests.
- Design useful zero values where practical.
- Keep happy path left-aligned with early returns.
- Avoid unnecessary `else` after `return`.

## Errors
- Always handle errors.
- Wrap returned errors with operation context using `%w`.
- Do not log and return the same error unless there is a specific reason.
- Do not parse error strings; use `errors.Is` or `errors.As`.
- Error strings should start lowercase unless they begin with a proper noun or acronym.
- Use panic only for unrecoverable programmer or configuration errors.

## Tests
- Test behavior, not implementation details.
- Use table-driven tests when they reduce duplication.
- Failure messages should identify function, input, got, and want.
- Mark helpers with `t.Helper()`.
- Use `t.Cleanup`, `t.TempDir`, `t.Setenv`, and `t.Context` when available.
- Use `cmp.Diff` for complex structs and `protocmp.Transform` for protobufs.
- Prefer semantic error checks over exact error-string comparisons.

## Concurrency
- Every goroutine needs a clear lifetime and stop condition.
- Prefer synchronous functions; let callers decide whether to start a goroutine.
- Use context for cancellation.
- Call `WaitGroup.Add` before starting goroutines.
- Do not copy sync types.
- Protect package-level mutable state with synchronization.
- Use channels for coordination and mutexes for protecting shared data.

## Performance and data structures
- Do not optimize without evidence or benchmarks.
- Preallocate slices only when the capacity is known.
- Prefer nil slices over empty slice literals unless JSON/API semantics require otherwise.
- Use `map[T]struct{}` for sets unless `bool` has real three-state meaning.
- Use modern stdlib helpers when they simplify code: `strings.Cut`, `slices`, `maps`, `cmp.Or`, `min`, `max`, `clear`.
- Avoid copying large structs or non-copyable values such as `sync.Mutex`.

## Before finishing
- Run `goimports` or `gofmt`.
- Run relevant tests.
- Use `go test -race` when concurrency is touched.
