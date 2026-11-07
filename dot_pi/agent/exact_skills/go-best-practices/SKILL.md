---
name: go-best-practices
description: Write, review, and debug Go code using the Uber Go Style Guide and practical Go correctness, concurrency, testing, and performance guidance. Use for general Go work; load specialized Kubernetes skills first for controllers and API types.
---
# Go Best Practices
Use for general Go changes. For controller-runtime, reconcilers, CRDs, watches, finalizers, status conditions, or envtest, load the Kubernetes-specific skill first because Kubernetes lifecycle and API conventions take precedence over general Go guidance.

Default to repository conventions and make small, idiomatic changes because consistency reduces review cost and avoids unrelated risk. Do not rewrite working code for style alone because style churn obscures behavior-bearing changes.

This skill merges the [Uber Go Style Guide](https://github.com/uber-go/guide/blob/master/style.md) (revision `1d60a91aa5e87d443002e23c21903c49489dbde5`) and `atom/skills/go-best-practices/SKILL.md` from the Claude marketplace (revision `b937ce451cf47154af8566b6ad7776a7749fc810`). **Uber wins when the two sources conflict.** The rules below consolidate both sources rather than requiring either source at runtime. The Uber guide is [Apache-2.0 licensed](https://github.com/uber-go/guide/blob/1d60a91aa5e87d443002e23c21903c49489dbde5/LICENSE). The Uber guide was originally created by Prashant Varanasi and Simon Newton and expanded by its contributors; this skill condenses, reorganizes, and supplements their guidance. The task references also incorporate verified notebook guidance; see [SOURCES.md](SOURCES.md) for edition, precedence, and modernization evidence.

## Version baseline
- Check the module's `go` directive and supported development and CI toolchains before adopting a language feature, standard-library API, or runtime behavior introduced in a later Go version.
- If the project supports an earlier version, use a compatible alternative. Do not raise the minimum Go version as an incidental style change. Run tests and `go vet` with the supported toolchain to check compatibility.

## References
Load only the reference required by the task. Keep simple error-wrapping work in this core skill; it does not require a topic reference.

| Task | Read |
|---|---|
| Value/pointer semantics, slice aliasing/append/retention, array or map iteration, UTF-8, escape analysis, numeric conversions/constants, or data locality/layout | [Ownership and memory](references/ownership-and-memory.md) |
| Receiver/method sets, saved callbacks, consumer-owned interfaces, composition/embedding, exported construction, custom error contracts, typed-nil errors, or joined-error inspection | [Interfaces and API design](references/interfaces-and-design.md) |
| Goroutine lifetime, worker/queue limits, races, mutex/atomic invariants, channel protocols, cancellation, retries, or timer compatibility | [Concurrency and channel patterns](references/concurrency.md) |
| Unit/table tests, HTTP boundaries, subtest isolation, benchmark construction, compiler elimination, or benchmark comparison | [Testing and benchmarking](references/testing-and-benchmarking.md) |
| Constraints/type sets, named generic collections, generic API inference, comparable keys, or generic methods | [Generics and collection contracts](references/generics.md) |
| CPU/heap/allocation profiles, live HTTP profiling, execution traces/tasks/regions, GC trace interpretation or tuning, sync.Pool, memory-profile comparison, synchronization waits, flat/cumulative attribution, or compiler inlining/escape diagnosis | [Profiling and live-service diagnosis](references/profiling-and-tracing.md) |
| Source provenance or verification of a source-derived claim | [Sources and evidence](SOURCES.md) |

## Contracts and nil values
- Validate external input and public API arguments where required by the contract. Trust internal constructors and functions that guarantee valid results on success; do not add redundant nil checks after every call.
- A nil result with a nil error is valid only when the API contract permits it. Do not impose a universal non-nil rule on APIs where absence is a valid result.
- A nil slice has length zero and supports `append` and iteration. Prefer `var items []T` and return `nil` for an empty result unless the serialization contract requires a non-nil empty slice. Test emptiness with `len(items) == 0`.
- A nil map supports reads but panics on writes. A nil channel blocks on send and receive; in a `select`, it disables that case. Calling a nil function panics.
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

Prefer Uber's opaque interface-based options over a closure-based option type. Give the interface an unexported method that applies to an unexported options struct. Concrete option values can be compared in tests and can implement other interfaces.

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
- Do not automatically move lookup maps or slices to package globals to avoid allocation. For a fixed small classification, consider a switch; otherwise keep ownership explicit and measure before introducing shared state. A package-level map is mutable even if callers intend to treat it as read-only.
- Prefer named fields and explicit delegation over embedding in public structs. Embedding exposes methods and fields, expands the API, and restricts future changes. Do not use it to model inheritance.
- Embed only when all promoted behavior belongs to the outer type and its zero value, copy semantics, and public contract remain appropriate. Put embedded fields first, followed by a blank line before named fields.
- Do not embed mutexes, even in unexported structs. Store `mu sync.Mutex` or `mu sync.RWMutex` as a named value field. Their zero values are usable; allocating a separate mutex is usually unnecessary.
- Do not copy synchronization values after first use. Pass the containing state by pointer when shared identity is required.
- Avoid `init()`. Prefer explicit initialization that can return errors. An unavoidable `init()` must be deterministic, avoid dependencies on other initialization side effects, and avoid environment access and I/O. Registry hooks and deterministic precomputation can justify exceptions.
- Do not start goroutines in `init()`. Expose an object whose shutdown method signals its workers and waits for them to exit.

## Errors and process termination
- Choose errors by matching and context needs, not by whether the failure is expected or unexpected:
  - Static message, no matching needed: `errors.New`.
  - Dynamic message, no matching needed: `fmt.Errorf`.
  - Static message, matching needed: a package-level error variable.
  - Dynamic message, matching needed: a custom error type.
- Name exported error variables `ErrSomething`, unexported ones `errSomething`, and custom types `SomethingError` or `somethingError`. Exported errors are part of the public API.
- Match wrapped errors with `errors.Is` and `errors.As`, not string comparison or direct equality.
- Return an error unchanged when it already has sufficient context. Otherwise add concise context with `fmt.Errorf("get user %q: %w", id, err)`. Avoid repetitive phrases such as `failed to` at every layer.
- Use `%w` when callers can inspect the cause; document and test that contract. Use `%v` when intentionally hiding the underlying error from matching.
- Handle each error once: recover and continue, translate it, or return it with useful context. Do not log and return the same error for a caller to log again.
- Return errors for operational failures. Do not use panic/recover as normal error handling. Irrecoverable faults or startup validation such as `template.Must` are exceptions.
- Call `os.Exit` or `log.Fatal` only in `main`, preferably at one exit point. Put fallible work in a testable function that returns an error or exit code. Immediate exit skips deferred cleanup.

## Ownership and collections
- Copy slices and maps at ownership boundaries when retaining caller data or returning internal mutable state. Copy while holding the lock when taking a snapshot of protected state; the original mutex does not protect a returned alias.
- `maps.Clone` and `slices.Clone` make shallow copies. Pointers, maps, slices, and other references inside the copied elements still share their referenced data; copy deeper only when the ownership contract requires it.
- Slice assignment and slicing share a backing array; append can overwrite shared storage. Capacity limits do not isolate element writes. Use the ownership reference for growth, iteration, and measured retention decisions.
- Map iteration order is unspecified. Sort keys when order matters. Do not rely on deletion to reduce a map's backing allocation; rebuild a long-lived map if measured retention warrants it.
- Use `make(map[K]V, sizeHint)` for empty or programmatically populated maps, and literals for a fixed initial set. A map size hint is not a guarantee of allocation-free insertion.
- Slices, maps, and functions cannot be compared to each other with `==`; they can be compared to nil. Prefer `slices.Equal`, `maps.Equal`, or `bytes.Equal` for suitable element types. Use reflection-based comparison only when its semantics are intended.

## Numbers, strings, and control flow
- Use explicit octal such as `0o600` rather than ambiguous leading-zero notation, and separators such as `1_000_000` where useful.
- Runtime integer overflow does not panic. Check bounds before arithmetic when overflow would violate the contract.
- Choose floating-point comparisons for the domain. Approximate comparisons need appropriate absolute or relative tolerances; do not assume exact equality after rounded calculations.
- `len(string)` and string indexing count bytes; range decodes code points, not user-visible characters. Use the ownership reference for UTF-8 validation and byte-boundary handling.
- `strings.TrimRight` removes a set of trailing characters; use `strings.TrimSuffix` to remove one suffix.
- Prefer raw string literals when they remove distracting escaping. Use `strings.Builder` or `bytes.Buffer` for repeated concatenation; preallocate when the final size is known and meaningful.
- Avoid repeated conversions between strings and byte slices. Use the `bytes` package for byte-oriented I/O, and convert fixed strings once when reusing the bytes.
- Range iteration copies element values. Use indices to mutate slice elements. Iterating a slice uses the initial iteration bounds; appending does not extend that loop.
- A `break` in a nested `switch` or `select` exits that statement, not the enclosing loop. Use a labeled break when needed.
- Reduce nesting with early returns and loop continues. Remove unnecessary `else` branches and keep the successful path easy to follow.
- Keep variables and constants in the smallest useful scope, but do not add nesting merely to reduce scope. Watch for accidental shadowing with `:=` in inner blocks.

## Resource lifetime and concurrency
- Use `defer` to release files, locks, and other resources promptly after successful acquisition. Check cleanup errors when they affect correctness, especially for writes.
- Deferred arguments are evaluated when the defer is registered. Use a closure if cleanup needs a value evaluated later.
- A defer inside a loop runs at function return, not at the end of each iteration. Extract a per-iteration function or close explicitly when resources must be released each iteration.
- Every goroutine needs a predictable completion condition or a stop signal, plus a way for its owner to wait for completion. Cancellation signals work to stop; it does not terminate a goroutine by itself. A WaitGroup waits but does not cancel.
- Bound fan-out, queues, and concurrency by the protected resource. CPU-bound work and I/O-bound work need different limits; do not assume `GOMAXPROCS` is appropriate for both.
- Usually use an unbuffered channel or capacity one. A larger buffer requires a reasoned bound, a backpressure policy, and an explicit account of what happens when it fills.
- Channels provide synchronization according to their send/receive rules, including when buffered. An unbuffered send waits for a corresponding receive, not for completion of the receiver's subsequent work.
- A `select` with multiple ready cases does not give priority to the first case. Do not rely on case order.
- Use `chan struct{}` for notifications. Let the producer or coordinating owner close channels after all sends are finished. A send to a closed channel panics.
- Use mutexes for shared state and channels for coordination when they fit the design. Protect complete invariants, not only individual reads and writes. Data races and timing-dependent logical races are different; the race detector does not find every logical race.
- Use a WaitGroup to wait for multiple workers. On compatible Go versions, `WaitGroup.Go` combines registration and launch; otherwise call `Add` before starting the goroutine and defer `Done` inside it.
- Use `errgroup` when related concurrent tasks need error collection and cancellation. Use `sync.Cond` for condition-based waiting; `Broadcast` wakes all waiters and `Signal` wakes one. Wait in a loop that checks the condition.
- Follow Uber's recommendation to use `go.uber.org/atomic` for typed atomic state rather than raw integer flags with mixed atomic and ordinary access. Do not read an atomic flag through a non-atomic path.
- Watch for methods such as `String` acquiring locks during formatting while the same lock is held.
- Shared slice appends require synchronization or independent storage. Clone protected collections inside the critical section before iterating without the lock.
- Test packages that start goroutines for leaks; Uber recommends `go.uber.org/goleak`.

## Context and time
- Pass `context.Context` through request-scoped work, normally as the first parameter. Call the cancel function returned by `WithCancel`, `WithTimeout`, or `WithDeadline` when the operation ends.
- An incoming HTTP request context is canceled when the connection closes, an HTTP/2 request is canceled, or `ServeHTTP` returns. Do not assume that writing a response is the cancellation boundary.
- If work must outlive a request, give it a service-owned lifetime and shutdown path. `context.WithoutCancel` can preserve values while removing parent cancellation and deadlines; use it only deliberately, with a new bound and an owner that waits for completion.
- Use `time.Time` for instants and `time.Duration` for elapsed periods. Specify units with `time.Second`, `time.Millisecond`, and similar constants, not unexplained integers.
- Compare instants with `Equal`, `Before`, and `After`, not `==`, which also compares location and monotonic-clock representation.
- Use `AddDate` for calendar changes and `Add` for elapsed durations. A calendar day is not always 24 hours.
- Prefer time types at external boundaries when supported. Otherwise include units in numeric field names and use RFC 3339 for timestamps unless another format is agreed upon. Standard JSON encoding does not give `time.Duration` a human-readable duration representation.

## HTTP, SQL, and serialization
- Add explicit field tags for JSON, YAML, and other tag-based serialized formats. Wire field names are a compatibility contract.
- Prefer typed decoding when the schema is known. For arbitrary JSON numbers, use a decoder with `UseNumber` when conversion to `float64` would lose required precision.
- Use a named `time.Time` field instead of embedding it: promoted marshaling methods can change the enclosing type's serialized form.
- Configure HTTP client timeouts and server read, write, header, and idle timeouts for the workload. Streaming and long-lived requests need explicit policies rather than arbitrary universal limits.
- Close a successful HTTP response body. Read to EOF when connection reuse requires it and doing so is safe and bounded. Return after `http.Error` unless further execution is intentional.
- `sql.Open` creates a pool and may not establish a connection. Use `PingContext` when startup requires a connection check.
- Close `sql.Rows` and check `rows.Err` after iteration. Represent nullable columns with appropriate nullable or pointer types.
- Use query parameters, not string concatenation, for untrusted SQL values. Prepared statements can help repeated queries; SQL injection prevention depends on parameterization, not on explicitly calling `Prepare`.
- Bound database pools with suitable maximum open/idle connections and connection lifetimes.

## Formatting and naming
- Run `gofmt` or `goimports`. Use two import groups: the standard library, then everything else.
- Use short, lowercase, singular package names without underscores. Name packages for what they provide; avoid `common`, `util`, `shared`, `lib`, and similar vague names.
- Use MixedCaps for functions. Test functions may use underscores to group related cases.
- Alias imports when the declared package name differs from the last path element, or when imports directly conflict. Otherwise avoid aliases; rename a conflicting local variable rather than adding an arbitrary alias.
- Do not reuse built-in names such as `error`, `string`, or `len` for variables, fields, or parameters.
- Prefix unexported package-level variables and constants with `_`. Error values use `err` instead, without the underscore.
- Group related declarations. Adjacent variable declarations inside a function can be grouped even when unrelated.
- At package scope, use `var` and omit a redundant type unless the desired type differs from the initializer's type. Locally, use `:=` for explicit initial values and `var` for zero values.
- Put type and related constant/variable definitions before functions. Group methods by receiver and use rough call order, with exported functions early, constructors near their types, and helper functions toward the end.
- Aim for a soft 99-character line limit; readability takes priority over a hard limit.
- Use keyed struct literals. Test tables with at most three fields can omit field names. Omit zero-valued fields unless they add meaningful context.
- Use `var value T` for a zero-value struct and `&T{}` rather than `new(T)` for a struct pointer.
- Declare extracted format strings as constants. Give Printf-style functions a recognized name or an `f` suffix so `go vet` can check formatting.

## Tests
- Use table-driven subtests for repetitive behavior with varying inputs and outputs. Name the table `tests`, the case `tt`, and inputs/expectations with `give`/`want` prefixes.
- Split tables when setup, mocks, or assertions require complex conditional logic. A short success-versus-error branch is acceptable when the test remains clear.
- Run parallel subtests only when state and dependencies are isolated. For modules using pre-Go 1.22 loop semantics, rebind captured loop variables inside the loop before parallel subtests or goroutines. Go 1.22 per-iteration variables apply to variables declared by the loop, not reused variables.
- Test exported behavior from an external `_test` package where useful. Use internal tests when access to unexported behavior is needed.
- Use `t.Fatal`/`t.Fatalf` for hard preconditions and `t.Error`/`t.Errorf` for independent failures. With an existing Testify dependency, use `require` and `assert` for the same distinction. Do not introduce panics for test failures.
- Call fatal test methods only in the test goroutine; send errors from worker goroutines back to it.
- Avoid sleeps for coordination. Use channels, synchronization, or bounded polling. Inject a clock when exact time behavior matters.
- Use `httptest.NewServer` for client tests, `httptest.NewRecorder` for handlers, and `iotest.ErrReader` for reader failures instead of depending on external services.
- Test invalid inputs, error identity, cleanup, cancellation, and ownership boundaries. Use fuzzing for input-dependent invariants.
- Use `testing.Short` or established integration build tags to separate expensive tests. Run race tests in CI where supported, and use shuffled runs to detect order dependencies. `-parallel` limits parallel tests; tests still need `t.Parallel` to opt in.

## Benchmarks, profiling, and optimization
- Measure a representative workload before changing allocation, data layout, or concurrency. Validate benchmark results so an incorrect or optimized-away operation is not mistaken for an improvement.
- For benchmark loops, input reset, compiler-elimination safeguards, isolated measurements, and `benchstat` comparisons, load `references/testing-and-benchmarking.md`. Use `testing.B.Loop` only with a supported Go 1.24+ baseline; preserve a compatible `b.N` path otherwise.
- In hot paths, prefer `strconv` to general `fmt` formatting for primitive conversions and avoid repeated fixed string-to-byte conversions. Supply realistic collection capacities when known.
- Use CPU profiles for execution cost, heap/allocation profiles for retained memory or allocation churn, goroutine profiles for leaks, and block/mutex profiles for waiting and contention. Use runtime traces for scheduling, goroutine lifetimes, and critical paths.
- `net/http/pprof` registers diagnostic handlers on the default mux. Do not expose them on an unprotected public listener. Restrict access and profile for bounded windows; collection itself can affect the workload.
- Compare heap profiles over time to investigate retention. Escape-analysis and inlining reports explain compiler decisions; stack placement and inlining are not source-level guarantees.
- Consider buffer reuse or `sync.Pool` only for measured allocation pressure. A pool is an opportunistic cache, not guaranteed storage or a concurrency limit.
- Profile before changing layout, batching, or restructuring arithmetic. For field alignment and padding, load `references/ownership-and-memory.md`; cache-line effects are hardware-dependent.
- Tune `GOGC` and `GOMEMLIMIT` only with measured memory headroom. `GOMEMLIMIT` is a soft runtime limit, not a hard process-memory cap. Use explicit cleanup instead of finalizers for resource lifetime.

## Validation commands
Use repository targets when available. Otherwise run the relevant subset of these commands with the project's supported tools:

```sh
go test ./...
go test -race -shuffle=on ./...
go test -short ./...
go test -coverprofile=cover.out ./...
go tool cover -html=cover.out
go vet ./...
staticcheck ./...
golangci-lint run
```

Uber recommends consistent linting with `errcheck`, `goimports`, `revive`, `govet`, and `staticcheck`, with `golangci-lint` as a runner. Use `revive` rather than deprecated `golint`. The old `go vet -shadow` command is not supported; use an explicitly configured shadow analyzer if needed.

Use these commands for focused performance work:

```sh
go test -run='^$' -bench=. -benchmem -count=10 > bench.txt
benchstat bench.txt
go test -run='^$' -bench=. -cpuprofile=cpu.out
go test -run='^$' -bench=. -memprofile=mem.out
go tool pprof -http=127.0.0.1:8080 cpu.out
go test -run='^$' -bench=. -trace=trace.out
go tool trace trace.out
go build -gcflags='-m' ./...
```
