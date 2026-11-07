---
name: go-best-practices
description: Write, review, and debug Go code using the Uber Go Style Guide and practical Go correctness, concurrency, testing, and performance guidance. Use for general Go work; load specialized Kubernetes skills first for controllers and API types.
---
# Go Best Practices
Use for general Go changes. For controller-runtime, reconcilers, CRDs, watches, finalizers, status conditions, or envtest, load the Kubernetes-specific skill first because Kubernetes lifecycle and API conventions take precedence over general Go guidance.

Default to repository conventions and make small, idiomatic changes. Do not rewrite working code for style alone.

## Version baseline
- Check the module's `go` directive and supported development and CI toolchains before adopting a language feature, standard-library API, or runtime behavior introduced in a later Go version.
- If the project supports an earlier version, use a compatible alternative. Do not raise the minimum Go version as an incidental style change. Run tests and `go vet` with the supported toolchain to check compatibility.

## References
Load only the reference required by the task. Keep simple error-wrapping work in this core skill.

| Task | Read |
|---|---|
| Value/pointer semantics, slice aliasing/append/retention, array or map iteration, UTF-8, escape analysis, numeric conversions/constants, or data locality/layout | [Ownership and memory](references/ownership-and-memory.md) |
| Receiver/method sets, saved callbacks, consumer-owned interfaces, composition/embedding, exported construction, custom error contracts, typed-nil errors, or joined-error inspection | [Interfaces and API design](references/interfaces-and-design.md) |
| Goroutine lifetime, worker/queue limits, races, mutex/atomic invariants, channel protocols, cancellation, retries, or timer compatibility | [Concurrency and channel patterns](references/concurrency.md) |
| Unit/table tests, HTTP boundaries, subtest isolation, `synctest`, benchmark construction, compiler elimination, or benchmark comparison | [Testing and benchmarking](references/testing-and-benchmarking.md) |
| Constraints/type sets, named generic collections, generic API inference, comparable keys, `iter.Seq` iterators, or generic methods | [Generics and collection contracts](references/generics.md) |
| CPU/heap/allocation profiles, live HTTP profiling, execution traces/tasks/regions, GC trace interpretation or tuning, sync.Pool, memory-profile comparison, synchronization waits, flat/cumulative attribution, or compiler inlining/escape diagnosis | [Profiling and live-service diagnosis](references/profiling-and-tracing.md) |

## Contracts and nil values
- Validate external input and public API arguments where required by the contract. Trust internal constructors and functions that guarantee valid results on success; do not add redundant nil checks after every call.
- A nil result with a nil error is valid only when the API contract permits it.
- A nil slice has length zero and supports `append` and iteration. Prefer `var items []T` and return `nil` for an empty result unless the serialization contract requires a non-nil empty slice. Test emptiness with `len(items) == 0`.
- A nil map supports reads, `len`, `range`, and `delete`, but panics on writes. A nil channel blocks on send and receive; in a `select`, it disables that case. Calling a nil function panics.
- An interface containing a typed nil pointer is not nil. Return a literal `nil` when returning no error or no interface value.
- Use the comma-ok form for type assertions and handle failure instead of allowing an unchecked assertion to panic.

## APIs, interfaces, and receivers
- Start with concrete implementations. Discover narrow interfaces at real consumer boundaries; define them in the consuming package. Prefer concrete return types and small interface parameters such as `io.Reader` and `io.Writer` where they fit the contract.
- Pass interfaces as values, not pointers to interfaces. The concrete value inside an interface can itself be a pointer.
- Verify required interface contracts at compile time, for example `var _ http.Handler = (*Handler)(nil)`. Use the asserted type's zero value on the right-hand side.
- Use pointer receivers for mutation, identity, large structs, or state that must not be copied. Use value receivers for small copy-like values. Keep receiver semantics consistent.
- Value-receiver methods belong to the method sets of both `T` and `*T`; pointer-receiver methods belong only to `*T`. Automatic addressing at a call site does not change interface satisfaction. Map values are not addressable.
- Export only the supported API. Prefer direct field access over trivial getters and setters unless encapsulation is required. Document exported declarations with comments that start with the declaration's name.
- Use named types and typed constants for finite domain values instead of repeated raw strings. Typed constants do not provide exhaustive switch checking.
- Start integer enums with `iota + 1` unless zero is a useful default. Use explicit stable values for persisted or transmitted identifiers.
- Avoid opaque boolean or numeric arguments. Prefer domain types; when the API cannot change, annotate unclear arguments with parameter-name comments such as `true /* flush */`.
- Named return values can clarify multiple same-type results; avoid shadowing them or making the returned values unclear.

## Generics
- Use generics for reusable data structures and collection algorithms that perform the same operations across types. Use interfaces for varying behavior; do not introduce type parameters for ordinary method calls that a small interface can express.
- Prefer concrete or constrained types to `any` when the contract is known. Use `any` only when heterogeneous values are genuinely part of the API, such as general serialization; do not recover a known contract through unchecked assertions.
- Keep constraints limited to required operations. Preserve named collection types in results when that identity matters, and use `var zero T` for an unconstrained type parameter's zero value.

## Functional options
Use functional options for optional constructor or public API arguments that are expected to grow, especially when there are already three or more arguments. Keep required arguments explicit and establish defaults before applying options.

Prefer opaque interface-based options over closure-based options when option values need to be compared in tests or implement other interfaces:

```go
type options struct {
	port int
}

type Option interface {
	apply(*options)
}

type portOption int

func (p portOption) apply(opts *options) {
	opts.port = int(p)
}

func WithPort(port int) Option {
	return portOption(port)
}
```

Validate the resulting configuration before constructing the resource.

## State, embedding, and initialization
- Avoid mutable globals, including replaceable function variables. Inject dependencies such as clocks instead of changing global state in tests.
- Do not move lookup maps or slices to package globals to avoid allocation without measurement. For a fixed small classification, use a `switch`; a package-level map remains mutable even when callers intend to treat it as read-only.
- Prefer named fields and explicit delegation over embedding in public structs. Embedding exposes promoted methods and fields, expands the API, and restricts future changes. Do not use it to model inheritance.
- Embed only when all promoted behavior belongs to the outer type and its zero value, copy semantics, and public contract remain appropriate. Put embedded fields first, followed by a blank line before named fields.
- Do not embed mutexes, even in unexported structs. Store `mu sync.Mutex` or `mu sync.RWMutex` as a named value field. Their zero values are usable; allocating a separate mutex pointer is unnecessary.
- Do not copy synchronization values after first use. Pass the containing state by pointer when shared identity is required.
- Avoid `init()`. Prefer explicit initialization that can return errors. An unavoidable `init()` must be deterministic and avoid dependencies on other initialization side effects, environment access, and I/O. Registry hooks and deterministic precomputation are valid exceptions.
- Do not start goroutines in `init()`. Expose an object whose shutdown method signals its workers and waits for them to exit.

## Errors and process termination
- Choose error representations by matching and context needs:
  - Static message, no matching needed: `errors.New`.
  - Dynamic message, no matching needed: `fmt.Errorf`.
  - Static message, matching needed: a package-level error variable (`ErrSomething` / `errSomething`).
  - Dynamic message, matching needed: a custom error type (`SomethingError` / `somethingError`).
- Match wrapped errors with `errors.Is` and `errors.As` (or `errors.AsType[E]` on Go 1.26+), not string comparison or direct equality.
- Return an error unchanged when it already has sufficient context. Otherwise add concise context with `fmt.Errorf("get user %q: %w", id, err)`. Avoid repetitive phrases such as `failed to` at every layer.
- Use `%w` when callers inspect the cause; document and test that contract. Use `%v` when hiding the underlying error from matching.
- Handle each error once: recover and continue, translate it, or return it with context. Do not log and return the same error.
- Return errors for operational failures. Do not use `panic`/`recover` as normal error handling. Irrecoverable faults or startup validation such as `template.Must` are exceptions.
- Call `os.Exit` or `log.Fatal` only in `main`, preferably at one exit point. Put fallible work in a testable function that returns an error or exit code because immediate exit skips deferred cleanup.

## Ownership and collections
- Copy slices and maps at ownership boundaries when retaining caller data or returning internal mutable state. Copy while holding the lock when taking a snapshot of protected state.
- `maps.Clone` and `slices.Clone` make shallow copies. Pointers, maps, slices, and other references inside the copied elements still share their referenced data; copy deeper when the ownership contract requires it.
- Slice assignment and slicing share a backing array; `append` can overwrite shared storage. Capacity limits (`s[:len(s):len(s)]` or `slices.Clip`) force reallocation on `append` but do not isolate element writes.
- Map iteration order is unspecified. Sort keys when order matters. Deleting keys does not shrink a map's backing allocation; rebuild a long-lived map if measured retention warrants it.
- Use `make(map[K]V, sizeHint)` for empty or programmatically populated maps, and literals for a fixed initial set.
- Slices, maps, and functions can be compared only to `nil` with `==`. Prefer `slices.Equal`, `maps.Equal`, or `bytes.Equal` over `reflect.DeepEqual` when element types support them.

## Numbers, strings, and control flow
- Use explicit octal such as `0o600` rather than leading-zero notation, and separators such as `1_000_000` where useful.
- Runtime integer overflow wraps silently. Check bounds before arithmetic or narrowing conversions when overflow or truncation would violate the contract.
- Use domain-appropriate tolerances for floating-point comparisons rather than exact `==` after rounded calculations.
- `len(string)` and string indexing count bytes; `range` over a string decodes UTF-8 runes. `strings.TrimRight` strips a cutset of characters; use `strings.TrimSuffix` to remove a suffix.
- Prefer raw string literals when they remove escaping noise. Use `strings.Builder` or `bytes.Buffer` for repeated concatenation and preallocate when the size is known.
- Avoid repeated conversions between `string` and `[]byte`. Use the `bytes` package for byte-oriented I/O.
- `range` iteration copies element values. Use index access (`s[i]`) to mutate slice elements. Iterating a slice evaluates the slice header once; appending during the loop does not extend the iteration count.
- A `break` in a nested `switch` or `select` exits that statement, not the enclosing loop. Use a labeled `break` when exiting the loop.
- Reduce nesting with early returns and `continue`. Watch for accidental variable shadowing with `:=` in inner blocks.

## Resource lifetime and concurrency
- Use `defer` to release files, locks, and other resources promptly after acquisition. Check `Close` errors when they affect correctness, especially on writable files or streams.
- Deferred call arguments are evaluated when `defer` executes, not when the deferred function runs. Wrap the call in a closure when arguments must be evaluated at return time.
- A `defer` inside a loop runs at function return, not at the end of each iteration. Extract a per-iteration helper function when resources must be released each iteration.
- Give every goroutine a stop signal or bounded completion condition and a way for its owner to wait for exit. Context cancellation signals work to stop; it does not wait for goroutines to finish.
- Bound fan-out, queues, and concurrency by the protected resource. Size CPU-bound and I/O-bound pools separately; do not assume `GOMAXPROCS` fits I/O concurrency.
- Default to unbuffered channels or capacity one. Use a larger buffer only with a bounded resource budget and an explicit backpressure or drop policy.
- An unbuffered send waits for the receiver to receive the value, not to finish processing it. A `select` with multiple ready cases chooses pseudorandomly regardless of case order.
- Use `chan struct{}` for signaling. Close channels from the producer or coordinator after all sends complete; sending on a closed channel panics.
- Protect complete multi-step invariants under one lock acquisition, not just individual reads and writes. Clone protected collections inside the critical section before iterating without the lock.
- Use `sync.WaitGroup` to join workers (`wg.Go` on Go 1.25+, or `wg.Add` before launch and `defer wg.Done()` inside the goroutine on earlier versions). Use `errgroup.Group` when concurrent tasks need error propagation and shared cancellation.
- Use `sync.Cond` for condition-based waiting; always check the condition in a `for` loop around `Wait()`.
- Use typed atomic state (`sync/atomic.Bool`, `sync/atomic.Int64`, `sync/atomic.Pointer[T]` on Go 1.19+, or `go.uber.org/atomic` in repositories that standardize on it) rather than raw integer primitives. Never mix atomic and non-atomic access to the same variable.
- Watch for re-entrant lock acquisition when methods such as `String()` acquire the same non-reentrant mutex while formatting under lock.
- Test packages that spawn goroutines for leaks (for example with `go.uber.org/goleak` when available in the repository).

## Context and time
- Pass `context.Context` as the first parameter of request-scoped functions. Always call the `cancel` function returned by `WithCancel`, `WithTimeout`, or `WithDeadline`.
- An incoming `http.Request` context is canceled when the client connection closes, an HTTP/2 stream is canceled, or `ServeHTTP` returns. If detached work must outlive the request, use `context.WithoutCancel` with a new deadline and a service-owned wait path.
- Use `time.Time` for instants and `time.Duration` for elapsed periods. Include unit suffixes in untyped numeric config fields (such as `TimeoutMillis`) and use RFC 3339 for serialized timestamps.
- Compare `time.Time` instants with `Equal`, `Before`, and `After`, not `==`, which also compares location and monotonic clock readings. Use `AddDate` for calendar shifts and `Add` for durations.

## HTTP, SQL, and serialization
- Add explicit struct tags (`json`, `yaml`) on serialized types. Do not embed `time.Time` in serialized structs because its promoted marshaling methods alter the outer type's wire format.
- Use `json.Decoder.UseNumber` when decoding arbitrary JSON numbers where `float64` conversion would lose integer precision.
- Configure HTTP client timeouts and server `ReadHeaderTimeout`, `ReadTimeout`, `WriteTimeout`, and `IdleTimeout`. Close non-nil HTTP response bodies and return after `http.Error`.
- `sql.Open` does not verify connectivity; call `PingContext` when startup must validate the connection. Always `defer rows.Close()` and check `rows.Err()` after iteration.
- Pass untrusted SQL values as query parameters, never via string concatenation or `fmt.Sprintf`. Configure pool limits (`SetMaxOpenConns`, `SetMaxIdleConns`, `SetConnMaxLifetime`).
- Use `os.OpenRoot` (Go 1.24+) when opening untrusted relative file paths within a directory so the OS rejects symlink or `..` traversal outside that root.

## Formatting and naming
- Run `gofmt` or `goimports` with two import groups (standard library, then third-party/internal).
- Use short, lowercase, singular package names without underscores. Avoid generic package names (`common`, `util`, `shared`, `lib`).
- Alias imports only when package names collide or differ from the directory name. Do not shadow built-in identifiers (`error`, `string`, `len`).
- Prefix unexported package-level variables and constants with `_` (except `errFoo` error variables) when following Uber package conventions.
- Use `var v T` for zero-value variables, `:=` for initialized locals, keyed struct literals, and `&T{}` instead of `new(T)` for struct pointers. On Go 1.26+, `new(expr)` creates a pointer initialized to `expr` (such as `new(42)` or `new("ok")`) without a temporary variable or generic pointer helper. Give `Printf`-style helpers an `f` suffix so `go vet` checks format verbs.

## Tests, benchmarks, and validation
- Prefer table-driven subtests (`tests`, `tt`, `give`/`want` fields) when cases share setup and assertion logic; split tables when conditionals obscure individual test contracts.
- Use `t.Fatal`/`require` for preconditions and `t.Error`/`assert` for independent checks. Call `t.Fatal` only from the test goroutine.
- Avoid `time.Sleep` for synchronization in tests; use channels, condition variables, or injected clocks. Use `httptest.NewServer` for clients and `httptest.NewRecorder` for handlers.
- Measure before optimizing. In hot paths, prefer `strconv` over `fmt` and preallocate known collection capacities.

```sh
go test ./...
go test -race -shuffle=on ./...
go vet ./...
golangci-lint run
go test -run='^$' -bench=. -benchmem -count=10 > bench.txt && benchstat bench.txt
```
