---
name: go-best-practices
description: Applies general Go best practices while writing or modifying Go code. Use for idiomatic Go naming, errors, tests, concurrency, package structure, style, and performance. Do not use as the primary guidance for Kubernetes controllers or controller-runtime code; use specialized controller skills first.
---
# Go Best Practices
Use this skill when writing or modifying Go code.

If the task involves Kubernetes controllers, reconcilers, controller-runtime, custom resource definitions (CRDs), watches, finalizers, status conditions, or envtest, use the specialized controller skills first.

Default to the repository's conventions. Make small, idiomatic changes. Do not rewrite code to satisfy style preferences alone.

## Writing Go
- Prefer simple, explicit code over clever abstractions.
- Match the package style before adding a new pattern.
- Use short, idiomatic names. Use longer names for wider scopes or unfamiliar concepts.
- Keep compound names short. More than three words usually signals a wrong abstraction.
- Use short, type-based receiver names (`c`, `u`), consistent across a type. Never `self`, `this`, or `me`.
- Use mixedCaps, not snake_case, including constants (`MaxRetries`, not `MAX_RETRIES`).
- Capitalize initialisms consistently: `ID`, `HTTP`, `URL`, `JSON`, `API`.
- Be neutral about extracting magic numbers and strings to constants. Inline literals are often clearer; extract only when a value is tunable or repeated.
- Avoid stutter. Read exported names with the package name: `user.Config`, not `user.UserConfig`.
- Use short, lowercase, single-word package names. Avoid `util`, `common`, and `helpers`.
- Name one-method interfaces with the `-er` form when it fits: `Reader`, `Writer`, `Formatter`.
- Omit `Get` from getters: `Owner`, not `GetOwner`. Use `SetOwner` for setters.
- Return concrete types. Accept small interfaces at the consumer boundary.
- Do not create interfaces only for tests.
- Add compile-time interface checks when they protect an implicit contract.
- Design useful zero values when practical.
- Reduce nesting: handle errors and special cases first, then return early or `continue`. Keep the happy path left-aligned.
- Omit `else` after `return`, `break`, `continue`, and `goto`.
- Avoid unnecessary `else`: when both branches of an `if` assign the same variable, set a default and override it in a single `if` (`x := def; if cond { x = other }`).
- Treat deep nesting (3+ levels) and functions longer than a screen as signals to decompose, not just reformat.
- Use `defer` for cleanup, including file closes and mutex unlocks.
- Use field names in struct literals, except in small local or test literals where positional fields are clearer.
- Avoid package-level mutable state unless it is read-only, lazily initialized, or synchronized.
- Prefer for loops over filter/map helper abstractions. Clear beats clever.
- Use US spelling in identifiers and comments: `canceled`, not `cancelled`.
- Use `crypto/rand` for anything security-sensitive. Use `math/rand/v2` for other randomness.

## Errors
- Handle every error.
- Add operation and input context when returning errors.
- Use `%w` when callers should inspect the cause with `errors.Is` or `errors.As`.
- Prefer concise error context: `read config: %w`, not `failed to read config: %w`.
- Do not bikeshed `fmt.Errorf("...")` vs `errors.New` for static strings; both are fine. Prefer consistency with surrounding code.
- Do not log and return the same error without a specific reason.
- Do not parse error strings. Use `errors.Is` or `errors.As`.
- Make failure explicit in the signature. Return `error` or `(value, bool)` instead of in-band sentinels like `-1` or `nil`.
- For many sequential writes to one `io.Writer`, wrap it in a type that records the first error and check once at the end.
- Start error strings with lowercase words unless they begin with a proper noun or acronym.
- Name exported sentinel errors `ErrXxx`. Name custom error types `XxxError`.
- Use panic only for unrecoverable programmer errors or initialization failures. Return errors for expected failures.
- In commands, keep process exit in `main`. Put testable logic in a `run`-style function that returns an error.

## Tests
- Test behavior, not implementation details.
- Use table-driven tests when they reduce duplication. Split tests when table logic becomes conditional or hard to read.
- Use descriptive subtest names.
- Write failure messages that identify the function, input, got value, and want value. Put got before want.
- Mark helpers with `t.Helper()`.
- Use `t.Cleanup`, `t.TempDir`, `t.Setenv`, and `t.Context` when available.
- Use `cmp.Diff` for complex values. Use `protocmp.Transform` for protobufs.
- Check errors semantically instead of comparing exact error strings.
- Use `t.Fatal` only when continuing would be meaningless or unsafe. Otherwise, prefer `t.Error`.
- Avoid spurious interfaces for tests. Simple test hooks are acceptable when tests are not parallel.

## Concurrency
- Give every goroutine a clear lifetime, stop condition, and wait path when the caller must observe completion.
- Prefer synchronous functions. Let callers choose `go f()`.
- Use context for cancellation. Pass `context.Context` as the first parameter except in established signatures such as HTTP handlers.
- Do not store contexts in structs.
- Call `WaitGroup.Add` before starting goroutines.
- Do not copy sync types or types that contain sync types.
- Do not embed mutexes. Use named fields such as `mu sync.Mutex`.
- Protect package-level mutable state with synchronization.
- Use channels for coordination. Use mutexes to protect shared data, not to orchestrate goroutines.
- Use unbuffered channels or buffers of one by default. Larger buffers need a clear reason.
- Prefer `sync.OnceValue`, `sync.OnceFunc`, and `sync.OnceValues` over manual `sync.Once` patterns for lazy initialization.
- Prefer `golang.org/x/sync/semaphore` over hand-rolled worker pools to bound concurrency.

## Performance and data structures
- Do not optimize without evidence or benchmarks, especially outside hot paths.
- Preallocate slices and maps only when the capacity is known.
- Copy slices and maps at API boundaries when retaining or exposing them would allow unintended mutation.
- Prefer nil slices over empty slice literals unless JSON or API semantics require non-nil slices.
- Check slice emptiness with `len(s) == 0`.
- Use `map[T]struct{}` for sets unless `bool` has real three-state meaning.
- Use `time.Time` for instants and `time.Duration` for durations. Include units in external field names when plain numbers are unavoidable.
- Use `make` for slices, maps, and channels; `new(T)` only when you need a zeroed `*T`. Use composite literals or `&T{}` for structs.
- Use named result parameters when multiple results share a type and order would otherwise be ambiguous.
- Avoid copying large structs and non-copyable values such as `sync.Mutex`.
- Use modern standard library helpers when they simplify code: `strings.Cut`, `slices`, `maps`, `cmp.Or`, `min`, `max`, `clear`, `sync.OnceValue`.

## Package and API shape
- Keep packages focused and domain-oriented. Avoid generic layers such as `models` or `helpers`.
- Keep interfaces small. The bigger the interface, the weaker the abstraction.
- Avoid blank imports outside `main` unless side-effect registration is the point.
- Avoid dot imports except in narrow test cases where they improve readability.
- Prefer explicit initialization over `init`. Never start unmanaged goroutines in `init`.
- Avoid `unsafe`, `reflect`, `go:linkname`, cgo, and `syscall` unless the need is clear and documented.
- Prefer `any` over `interface{}` in new code, and a concrete type over `any` when possible.
- Promote a single-field wrapper to the field's type, and inline a struct used only once, unless the wrapper adds semantic meaning or methods.
- Treat package-level variables as idiomatic for read-only config, compiled regexes, templates, and sentinel errors; synchronize them only when mutable.
- Use `internal/` for packages that should not be imported outside a module subtree.

## Comments and documentation
- Document exported packages, types, functions, methods, and variables that form an API.
- Explain why, constraints, contracts, and non-obvious behavior. Do not restate obvious code.
- Start doc comments with the documented identifier when appropriate. End comment sentences with periods.
- Use `//` comments by default. Keep machine-readable directives exact, such as `//go:build`.

## Before finishing
- Run `goimports` or `gofmt`.
- Run relevant tests.
- Run `go vet` or the repository lint target when practical.
- Run `go test -race` when touching concurrency.
