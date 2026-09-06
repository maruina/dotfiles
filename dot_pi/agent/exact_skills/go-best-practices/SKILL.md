---
name: go-best-practices
description: Applies general Go best practices while writing or modifying Go code. Use for idiomatic design, ownership, errors, tests, concurrency, generics, performance, and diagnostics. Do not use as the primary guidance for Kubernetes controllers or controller-runtime code; use specialized controller skills first.
---
# Go Best Practices
Use for general Go changes. For controller-runtime, reconcilers, CRDs, watches, finalizers, status conditions, or envtest, load the Kubernetes-specific skill first because Kubernetes lifecycle and API conventions take precedence over general Go guidance.

Default to repository conventions and make small, idiomatic changes because consistency reduces review cost and avoids unrelated risk. Do not rewrite working code for style alone because style churn obscures behavior-bearing changes.

## Version baseline
- Before using a language feature, standard-library API, or runtime behavior introduced in Go X.Y, require Go X.Y in the module's `go` directive and ensure local development and CI use Go X.Y or later. This keeps the source contract aligned with every supported toolchain.
- If the project supports an earlier Go version, use the established compatible alternative and let `go test` run its default `stdversion` vet check. Otherwise, a locally successful change can fail for users or CI on the declared baseline.

## 1. Introduction
- Evaluate designs in this order: integrity, readability, simplicity, then performance. Later concerns cannot compensate for incorrect behavior or code that maintainers cannot safely change.
- Maintain a clear mental model of ownership, data flow, invariants, and failure paths. If understanding local behavior requires repeatedly tracing distant code, simplify the design because hidden coupling makes defects and regressions harder to predict.
- Make code honest: types, signatures, and control flow should expose mutation, blocking, ownership, and failure. Concealing these costs behind surprising abstractions causes callers to form the wrong model.
- Require every rule and abstraction to prevent a concrete misuse, isolate an identified source of change, or materially simplify the system. Rules without a demonstrated benefit add complexity without paying for themselves.
- Prototype uncertain designs concretely to learn the data and discover real contracts. Before treating the result as production code, harden its invariants, failure handling, tests, and operational behavior because a prototype validates an idea, not its reliability.
- Understand the data and its transformations before choosing the algorithm or API because suitable structures and boundaries often become clear from the required data flow.

## 2. Language mechanics
- Choose pointers to express identity or shared access, not as a presumed performance optimization. Pointers can add aliasing, heap escapes, and garbage-collector work, so they can cost more than copying.
- Treat stack placement, escape analysis, and inlining as compiler decisions rather than API contracts. Inspect them only after measurement identifies allocation pressure because compiler decisions can change across versions and call sites.
- Do not copy values containing synchronization primitives or other state that becomes invalid when copied after first use. For pointer-semantic domain types, make snapshots explicit because incidental downstream copies can split identity or duplicate invalid internal state.
- Reorder struct fields for memory layout only after profiling because field order can affect positional literals, serialized output, unsafe consumers, and binary layout while producing no meaningful application-level gain.
- Assign explicit numeric values when constants become persisted data or protocol identifiers. Relying on an evolving `iota` sequence can silently reinterpret stored or transmitted values after a new constant is inserted.
- Avoid `unsafe`, `reflect`, `go:linkname`, cgo, and `syscall` unless the need is clear and documented because they step outside type safety and the compatibility promise, so they can break on a toolchain upgrade in ways ordinary tests do not exercise.

## 3. Data structures
- Treat subslices as aliases because they share a backing array. Mutating a subslice changes shared elements, and appending may overwrite elements visible through another slice when spare capacity remains.
- Clone a slice when independent ownership is required. A full slice expression such as `s[:len(s):len(s)]` only prevents append from reusing spare capacity; it does not isolate mutations to existing elements.
- Do not retain pointers to slice elements across an append that may grow the backing array because reallocation leaves those pointers referring to the old array rather than the current slice.
- Copy small subslices or substrings when retaining them would keep a much larger backing allocation live because a tiny view can otherwise pin disproportionate memory.
- Distinguish byte offsets, Unicode code points, and user-visible characters because `len(string)` and range indices are byte-oriented, while rune iteration still does not perform grapheme segmentation.
- Before implementing collection helpers, check `slices`, `maps`, and `cmp` because standard implementations reduce local code and maintenance. Preserve contract-sensitive behavior such as nil versus non-nil empty slices when adopting them.
- Prefer newer standard-library helpers such as `bytes.CutLast`, `strings.CutLast`, and `uuid` (Go 1.27), subject to the version baseline above, when they replace clear local code because hand-rolled splitting and identifier generation must otherwise be maintained and tested locally.

## 4. Decoupling
- Choose receiver semantics at the type level because callers need one consistent ownership model. Use pointer receivers when identity, shared mutation, or non-copyable state matters; use value receivers for copy-like values.
- Keep receiver semantics consistent unless a specific contract requires an exception, such as an unmarshaling method that must mutate an otherwise value-semantic type. Inconsistent receivers obscure whether methods operate on copies or shared state.
- Account for interface method sets when choosing receivers because method-call auto-addressing does not apply to interface satisfaction: a type with only pointer-receiver methods may satisfy an interface as `*T` but not as `T`.
- Review method values for capture semantics because a value-receiver method value captures a copy, while a pointer-receiver method value continues to observe shared state.
- Prefer named fields when reusing state because embedding promotes behavior and can unexpectedly expand method sets or make the outer type satisfy interfaces.
- Do not use embedding to model inheritance or to create base structs whose only purpose is sharing fields because embedding provides promotion, not a subtype relationship.

## 5. Software design
- Start with concrete implementations and discover interfaces at actual change boundaries because designing interfaces before understanding the implementations produces speculative abstractions and interface pollution.
- Define interfaces where they are consumed and include only the behavior that consumer needs because a narrow consumer-owned contract limits coupling. Pass separate capabilities when that is more precise than a broad composite interface.
- Create named types when they add invariants, behavior, or type safety. Renaming existing data without adding meaning increases conversion and API cost without strengthening the model.
- Return a literal nil interface when no error or interface value exists. Returning a typed nil pointer through `error` or another interface creates a non-nil interface and can send callers down the failure path unexpectedly.
- Preserve error identity through wrapping and let callers inspect chains with `errors.Is` and `errors.As` because rendered error text is for humans and can change without changing failure semantics.
- Handle an error once by recovering, translating it at a boundary, adding useful context, or returning it. Logging and returning the same failure without a distinct operational reason creates duplicate noise and ambiguous ownership.
- Parse unstructured input into validated domain types at the boundary because raw transport representations permit invalid states to leak into business logic.
- Do not adopt `encoding/json/v2` (Go 1.27) as a mechanical migration because its stricter defaults change JSON validation and duplicate-key handling. Make the change deliberate and test contract-sensitive inputs, since a decoder that newly rejects previously accepted payloads is a compatibility break for every producer.
- Define finite classifications once and derive validation, labels, and behavior from that definition because parallel lists drift and produce contradictory treatment of the same value.
- Name packages for what they provide and keep code that is not a supported import surface under `internal/` because vague buckets such as `util`, `common`, `helpers`, `models`, and `types` accumulate unrelated dependencies, and every exported package is a compatibility commitment that `internal/` avoids making.
- Prefer explicit initialization over `init`, and never start unmanaged goroutines in `init`, because import-time side effects run before callers can configure, observe, or stop them, and work started that way has no owner, no cancellation, and no failure path.

## 6. Concurrency
- Give every goroutine an owner, a stop condition, and a wait path when completion matters because unowned work leaks resources and makes shutdown behavior unknowable. Bound its lifetime on error and cancellation paths as well as success.
- Never infer ordering or progress guarantees from observed scheduler behavior because a result seen repeatedly is still not synchronization and may change across runs, machines, or Go versions.
- Bound goroutine fan-out, worker pools, queues, retries, and pending work by the resource being protected because unbounded concurrency multiplies memory, connections, and scheduler pressure under load.
- Size concurrency for the workload and constrained resource rather than defaulting to `GOMAXPROCS`, particularly for I/O-bound work, because CPU capacity may not be the limiting resource.
- Protect complete invariants and read-modify-write operations because separately locking reads and writes can be data-race-free while still losing updates. The race detector finds unsynchronized memory access, not logical atomicity errors.
- Treat channel capacity as part of the concurrency contract because it determines backpressure and handoff behavior. An unbuffered send guarantees that a receiver accepted the value, not that the resulting work completed.
- Let the producer or coordinating owner close a channel when no more values will be sent because receivers cannot know whether another producer still intends to send, and sending after close panics. Closing is a signal, not resource cleanup.
- Make work observe its context or another cancellation signal because cancellation only communicates that work should stop; it does not terminate a goroutine automatically.
- Pass `context.Context` as the first parameter, except in established signatures, and do not store it in a struct because a stored context outlives the call it was scoped to and detaches cancellation and deadlines from the caller that owns them.
- If a caller may abandon one result from non-cancelable work, use a one-result buffer so the worker can publish the result and terminate instead of blocking forever after the caller leaves.
- Use non-blocking `select` and dropping only as deliberate overload policies because a `default` case silently trades delivery for latency. Bound the queue and expose dropped work through metrics or errors so overload remains observable.
- Treat `sync.RWMutex` as a measured optimization rather than a default because its coordination overhead and write contention can make read-heavy code slower than a regular mutex.
- Do not rely on buffered delivery from `time` timer channels: they are unbuffered for modules declaring Go 1.23 or later, and Go 1.27 removes the `asynctimerchan` GODEBUG escape hatch. Review timeout and timer code when raising a module's Go version because code that previously observed a stale tick buffered before `Stop` or `Reset` no longer receives it.

## 7. Testing
- Test exported behavior from an external test package when package boundaries are part of the contract because this catches accidental reliance on unexported state. Use internal-package tests only when exercising unexported behavior is necessary.
- Prefer deterministic in-process facilities such as `httptest` over real external network calls because network availability and remote changes make tests slow and flaky.
- Use mocks for behavior the test owns or failures that are otherwise impractical to trigger. Avoid broad mocks of external systems because they can silently drift from the real contract while tests continue to pass.
- Run subtests in parallel only when their inputs, package state, environment, filesystem, and dependencies are isolated because shared mutable state turns timing into nondeterministic test interference.
- Use table-driven tests only when setup and assertions remain unconditional and readable because a table that encodes case-specific control flow becomes a harder-to-understand testing language.
- Test contract-sensitive failure behavior semantically rather than asserting complete error strings because wording can change while the error's identity and meaning remain stable.
- Keep process exit in `main` and put command logic in a `run` function that returns an error because a function that calls `os.Exit` cannot be called from a test, and pending deferred cleanup does not run on exit.

## 8. Benchmarking
- Validate a benchmark's result before interpreting its speed because an incorrect operation or one removed by the compiler can produce an impressive but meaningless number.
- Prefer `testing.B.Loop` when the module requires Go 1.24 or later because it manages benchmark timing and protects common loop bodies from optimization mistakes. Keep setup and cleanup outside the measured operation.
- Preserve production-like data flow and consume results when necessary because small benchmark-only changes can alter inlining, escape analysis, or dead-code elimination.
- Compare repeated runs with `benchstat` on an otherwise idle machine because scheduler noise, thermal scaling, and background activity can exceed the difference being measured.
- Run potentially interfering benchmarks separately because goroutines, garbage collection, caches, or retained state from one benchmark can distort the next.
- Include allocation measurements when allocation behavior is relevant, but do not pursue zero allocations independently of latency, clarity, and total resource use because avoiding one allocation can make the overall system worse.

## 9. Generics
- Use generics for algorithms and data structures that are genuinely identical across types; use interfaces when behavior must vary dynamically. Choosing by purpose keeps compile-time abstraction separate from runtime polymorphism.
- Keep constraints as small as the required operations allow because constraints are part of the public compatibility surface and tightening them later can reject existing callers.
- Use `~T` only when accepting user-defined types with underlying type `T` is intentional because it broadens the admitted type set beyond the exact built-in or named type.
- Preserve named collection types in generic results, for example with `S ~[]E`, when callers should retain their type identity because returning `[]E` can discard methods and domain meaning.
- Use `var zero T` for a type parameter's zero value because `nil` is not valid for every type a constraint may permit.
- Express requirements with a constraint instead of accepting `any` and recovering behavior through assertions or reflection because static constraints detect unsupported operations at compile time.
- Do not introduce a type parameter when one concrete type or a small behavioral interface produces a clearer API because unnecessary generic dimensions increase inference, documentation, and compatibility costs.
- Do not use generic methods (Go 1.27) to satisfy an interface because interface methods still cannot declare type parameters, so a generic method cannot implement one. Keep the type parameter on the type, or take it as a function parameter, when a value must satisfy an interface.

## 10. Profiling
- Profile a representative workload before changing APIs, ownership, or data layout because optimizing an unmeasured path can add complexity without improving a meaningful outcome.
- Select the profile for the symptom: CPU for execution time, allocation profiles for churn, heap profiles for retained memory, and mutex or block profiles for contention. Using the wrong profile answers a different question from the one being investigated.
- Distinguish flat cost from cumulative cost and allocated bytes from live bytes before choosing an optimization target because each view attributes a different kind of resource consumption.
- Collect one expensive profile at a time when profiling overhead could distort the result because simultaneous profilers can measure their effects on each other.
- Use escape-analysis and inlining reports to explain measured allocations, not to establish source-level guarantees, because compiler decisions change across releases and surrounding call sites.
- Prefer the clearest correct implementation unless profiling shows that a specialized implementation changes a meaningful system-level outcome because local micro-optimizations impose lasting maintenance cost.
- Do not replace a precise interface or standard-library operation solely to remove an allocation without showing that the allocation matters because the resulting coupling can cost more than the saved memory.

## 12. Tracing
- Use runtime traces for scheduler behavior, blocking, garbage-collector pauses, goroutine lifetimes, and latency critical paths rather than as a replacement for CPU profiles because the tools expose different dimensions of execution.
- Keep trace windows short and targeted because trace output, processing cost, and runtime overhead grow quickly.
- Annotate important operations with tasks and regions because domain phases are easier to identify than raw runtime events in a large trace.
- Confirm that fan-out shortens the critical path because additional goroutines can instead increase scheduling, synchronization, and garbage-collection costs.
- Pool resources to enforce a resource budget, not merely to reuse goroutines, because the protected resource determines safe concurrency. Treat `sync.Pool` only as an opportunistic allocation cache because its contents may disappear at any garbage collection.
- Tune `GOGC` or `GOMEMLIMIT` only with measured memory headroom and load tests because lower CPU cost from less frequent collection requires a larger live heap and raises out-of-memory risk.
- Apply data-locality and batching optimizations only after traces or profiles identify memory access or coordination as a material cost because these changes often trade clarity and latency for throughput.

## Finish
- Run relevant tests because compilation alone does not validate the changed behavior or failure paths.
- Run `go vet` or the repository lint target when practical because static analysis catches correctness and compatibility problems that tests may not execute.
- Run race tests when touching concurrency because ordinary tests can pass despite unsynchronized accesses that only instrumentation reveals.
- After writing new Go code and before committing, run the [modernize analyzer](https://pkg.go.dev/golang.org/x/tools/go/analysis/passes/modernize): `go run golang.org/x/tools/go/analysis/passes/modernize/cmd/modernize@latest ./...`. This identifies standard-library and language improvements while the module's Go version prevents unsupported rewrites.
