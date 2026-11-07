# Profiling and live-service diagnosis
Use this reference to select and interpret profiles and execution traces, collect live diagnostics safely, and investigate compiler decisions or measured GC trade-offs. Follow the core skill's supported-toolchain and diagnostic-access safeguards. For benchmark construction and statistical comparison, load [Testing and benchmarking](testing-and-benchmarking.md).

## Start with a question
- Record the symptom, representative input, build revision, Go version, architecture, flags, concurrency, and collection duration. Keep baseline and candidate workloads comparable; repeat measurements when host load, thermal scaling, or shared infrastructure adds noise.
- Select the instrument from the symptom, not a fixed CPU-before-memory-before-blocking sequence. CPU samples cannot explain time spent waiting for I/O or scheduling.
- Collect one profile kind per run for cleaner attribution. Profilers can perturb each other; full allocation sampling is particularly expensive. Compare final performance in separate, unprofiled benchmark runs.
- Treat runtime allocation, GC, synchronization, and syscall hotspots as leads, not diagnoses. Check callers and the relevant memory or blocking evidence before adding buffering, reuse, sharding, or changing ownership.
- Preserve correctness and input/error contracts when optimizing. Fewer allocations alone do not establish lower latency or a better design.

## Choose a profile and sample type
| Question | Instrument | Interpretation limit |
|---|---|---|
| Where is CPU execution spent? | CPU profile | Sampled active CPU stacks, not elapsed request time or blocked time; short runs may have too few samples. |
| Where is allocation churn? | Memory profile, `alloc_space` or `alloc_objects` | Cumulative allocated bytes or object counts, including objects later collected; not retained process memory. |
| What heap allocations remain live? | Memory profile, `inuse_space` or `inuse_objects` | Live bytes or objects attributed to allocation stacks, generally as of the most recently completed GC; not the references retaining them or total RSS. |
| Where do goroutines wait on synchronization? | Block profile | Waiting stacks for channels, mutexes and other supported synchronization; not every I/O wait. Collection must be enabled. |
| Which critical sections cause lock contention? | Mutex profile | Stacks at the end of contended critical sections, typically unlock; not the waiting goroutine's lock call. Collection must be enabled. |
| Where are goroutines now? | Goroutine profile | A stack snapshot; one snapshot alone does not prove a leak. |

Memory profiling samples allocations. The default `runtime.MemProfileRate` aims for one sampled allocation per 512 KiB allocated on average, not exactly every Nth object. Set a different rate once, early in execution, if needed; analysis assumes a constant rate. Sampling and GC timing can hide small or short-lived changes. Never equate an absent sample with zero allocations.

## Collect and inspect a focused benchmark
Run from one selected package. Replace `BenchmarkWork` with an existing representative benchmark; use distinct output paths for each build and run. Keep profiles with the matching executable and source revision for symbolization and source/assembly views.

```sh
go test -run='^$' -bench='^BenchmarkWork$' -benchtime=3s -benchmem -cpuprofile=cpu.out -o work.test .
go tool pprof -top work.test cpu.out
go tool pprof -top -cum work.test cpu.out
go tool pprof -list=Work work.test cpu.out
go test -run='^$' -bench='^BenchmarkWork$' -benchtime=3s -benchmem -memprofile=mem.out -o work.test .
go tool pprof -top -alloc_space work.test mem.out
go tool pprof -top -inuse_space work.test mem.out
```

- Use `-blockprofile=block.out` or `-mutexprofile=mutex.out` in separate test runs when investigating contention. Check `go help testflag` for sampling-rate flags and their overhead before using full sampling.
- Select the sample type explicitly. The `heap` and `allocs` runtime profiles contain the same memory statistics but default to live bytes and allocated bytes respectively; `go test -memprofile` is allocation-oriented. Bytes and object counts answer different questions.
- `flat` is cost attributed directly to a function; `cum` includes its callees. Sort by cumulative cost to find expensive call paths and flat cost to find local work. Do not sum cumulative columns: paths overlap.
- Use `list` for source attribution and inspect callers/callees. Attribution is limited by sampling, symbols, and compiler transformations; a source line is not proof of the reason for allocation.
- `go tool pprof -http=127.0.0.1:8080 work.test cpu.out` provides a local UI. Keep profiles private: stacks, labels and paths can contain sensitive data.
- Inlined calls can appear as logical frames. `pprof -noinlines` ignores inline frames in analysis; it does not change the executable or turn compiler inlining on. Do not assume a browser view is inherently more accurate than terminal output.

## Read a live GC trace without overclaiming
- Run the built executable with `GODEBUG=gctrace=1 ./service 2>gc.log` during an approved, bounded observation window. GC lines go to stderr; redirecting stdout does not remove application logs written to stderr. Build first so compiler GC output does not mix with service output.
- Read the installed `go doc runtime` description: the trace format can change. The heap triple is heap size at GC start, at GC end, and live heap. The goal is a heap target, not RSS or a hard process limit. `P` is the runtime processor count, not an OS-thread count.
- Distinguish wall-clock phases (STW sweep termination, concurrent mark/scan, STW mark termination) from aggregate CPU work, including assist/background/idle mark work. The concurrent phase is not all stop-the-world pause time. The percentage is since program start; a rounded zero does not mean no GC cost.
- Compare equivalent steady-state windows after warm-up. Do not assume a fixed first-collection threshold, heap goal, or idle collection interval. A short trace with stable live heap cannot prove the absence of a leak; correlate repeated post-GC heap observations with request volume, cache growth, goroutine counts, and process memory.

## Protect and own live profile endpoints
- Importing `net/http/pprof`, including a named import, registers routes on `http.DefaultServeMux` during package initialization. Audit every listener that uses a nil handler or that mux. A second debug port does not make a public default-mux listener safe.
- Use a separate application mux and a dedicated diagnostic mux. Register only required handlers explicitly, for example `debugMux.Handle("GET /debug/pprof/heap", pprof.Handler("heap"))` on Go 1.22+. Do not mount the default mux or the broad index handler merely to obtain one profile. Older supported baselines need compatible method checks.
- Bind diagnostics to an explicit loopback address, not `:6060` or `0.0.0.0:6060`. Loopback still permits local users and may be forwarded. For remote access, use the repository's authenticated, authorized administrative path and network policy; never expose diagnostic routes through public ingress. Profiles and command-line/stack data can be sensitive.
- Integrate diagnostic serving with the service's startup, error reporting, and bounded shutdown/join lifecycle. Configure server timeouts for the longest permitted capture plus transfer time. Do not copy an unowned fire-and-forget listener or silently ignore bind/serve errors.
- Bound collection duration and concurrent captures. CPU profiling and forced GC perturb the service; coordinate captures and do not allow unrestricted callers to choose arbitrarily expensive durations. Block/mutex collection still needs explicit runtime sampling configuration.

## Compare live memory profiles
Use the approved private diagnostic address and matching executable. These commands illustrate a loopback listener; they do not start one or provide authentication. Store artifacts in a private directory. HTTP profiling paths require GET on Go 1.22+; omit `debug=1` when downloading binary profiles for pprof.

```sh
curl --fail --show-error --max-time 15 -o before.pb.gz 'http://127.0.0.1:6060/debug/pprof/heap?gc=1'
# Run the same bounded workload, then capture with the same GC policy.
curl --fail --show-error --max-time 15 -o after.pb.gz 'http://127.0.0.1:6060/debug/pprof/heap?gc=1'
go tool pprof -top -inuse_space -base=before.pb.gz ./service after.pb.gz
curl --fail --show-error --max-time 15 -o allocs.pb.gz 'http://127.0.0.1:6060/debug/pprof/allocs?seconds=5'
go tool pprof -top -alloc_space ./service allocs.pb.gz
```

- `heap?gc=1` forces a GC before capture. Obtain approval for that disturbance; otherwise capture without forcing GC and record the timing limitation. A signed `-base` difference locates allocation stacks whose live bytes changed; negative values can reflect reclamation or sampling noise. It is not a retaining-reference graph or proof of a leak.
- Allocation snapshots accumulate since process start. Use a bounded `allocs?seconds=N` delta, or subtract comparable snapshots from the same process, to isolate a workload interval. Live-heap deltas describe net retained change, not allocation churn. Do not subtract arbitrary snapshots across restarted builds as if they shared counters.
- Keep sampling settings, workload, warm-up, concurrency, GC policy, binary and observation duration with the artifacts. Compare repeated equivalent windows; validate latency and throughput separately without profiling. No allocation reduction guarantees an end-to-end speedup.

## Trace a bounded critical path
- Use an execution trace for scheduling, runnable delays, blocking, syscalls, GC activity, and operation latency across goroutines. It complements CPU samples; a long task is not necessarily CPU work, and a GC interval is not entirely a stop-the-world pause.
- Capture a short representative window with `go test -run='^TestWork$' -trace=trace.out .` or an owned `runtime/trace` session. Check `trace.Start` errors; after a successful start, call `trace.Stop` before closing the destination and check the close error. Only one execution trace can be active; do not stop another owner's session after a failed start. Keep binary data separate from application stdout/logs.
- Apply the same private-access, duration, concurrent-capture and artifact safeguards as live profiles to HTTP trace capture. Bound trace volume through workload and duration; tracing is not free. Validate performance again without instrumentation.

```sh
go tool trace -http=127.0.0.1:8080 trace.out
go tool trace -pprof=sched trace.out > sched.pb.gz
go tool pprof -top sched.pb.gz
```

- Use the matching toolchain's `go tool trace -help`; supported derived profiles include `net`, `sync`, `syscall` and `sched`. Scheduler latency measures runnable waiting, not total request latency. Inspect the timeline alongside derived profiles before changing worker counts. Tool views change; the trace viewer is actively tested in Chrome/Chromium, not a guarantee that every view requires Chrome.
- Compare equivalent workload windows, goroutine states, processor activity, heap targets, GC work and task latency. A heap target is not peak RSS; rounded live-heap values do not establish that every object died. Do not infer an application bottleneck merely because some processors are idle.

## Annotate operation lifetime, including failures
- Create a task with `ctx, task := trace.NewTask(parent, "processBatch")`, pass the returned context to related work, and end the task after all participating goroutines finish. A task can span goroutines; its context carries trace association, not automatic cancellation or joining.
- Use stable, low-cardinality task/region types, not a filename or request ID as each task type. Keep sensitive identifiers out of annotations. Tasks group latency by type; use only approved, bounded log values for instance detail when needed.
- Use `trace.WithRegion(ctx, "decode", fn)` or a locally deferred `StartRegion(...).End()` in a per-operation helper. End regions in the starting goroutine and nested regions in reverse order. End tasks and regions on error paths too; success-only End calls make incomplete traces. Do not accumulate defers across an unbounded worker loop.

## Optimize concurrency only after attribution
- For worker/queue/cancellation mechanics, load [Concurrency and channel patterns](concurrency.md). Bound fan-out by memory, descriptors and downstream capacity as well as CPU. `GOMAXPROCS` is not a universal I/O worker count or queue capacity; measure throughput, tail latency and resource peaks at candidate limits.
- When a shared counter is a measured contention point, accumulate per worker and combine after joining, or synchronize fewer aggregate updates. Preserve count width, overflow/error semantics and cancellation behavior. Do not replace a race with an unsafe ordinary read or promise a hardware-independent cache-coherence speedup.
- A worker pool bounds active work; `sync.Pool` does not. Use `sync.Pool` only for measured reusable temporary allocations. Get may miss, items may disappear at any time, and the pool must not be copied after first use. Correctness must not depend on a particular item surviving GC.
- Reset reusable state, drop oversized backing storage when appropriate, and remove references to sensitive or retained data. After Put, relinquish all aliases until a later Get transfers ownership back. Pool synchronization does not make concurrent use of one borrowed object safe. Do not use a pool for resources that require deterministic cleanup or as a bounded cache.

## Tune GC with a memory budget, not a copied number
- Establish allocation rate, live heap, GC CPU/assist work, latency and total process/container memory under representative steady state and bursts. Reduce unnecessary allocation or retained references first when justified; record baseline settings and a rollback before a one-knob comparison.
- `GOGC` defaults to 100 and trades heap headroom for GC work. Since Go 1.18, the target model is `live heap + (live heap + GC roots) * GOGC / 100`; roots include stacks and globals. This is a pacing model, not an exact trigger, RSS ceiling, fixed first-collection threshold, or promised speed ratio. Do not copy the book's GOGC=1000 setting.
- Go 1.19+ `GOMEMLIMIT` / `debug.SetMemoryLimit` sets a soft limit on runtime-managed memory (`MemStats.Sys - MemStats.HeapReleased`), not total process memory. Leave measured headroom for non-Go allocations, mappings, kernel costs and workload bursts below the actual container/process budget. Earlier baselines need a compatible budget strategy, not an incidental version bump.
- A binding memory limit can increase GC frequency even with a high GOGC or `GOGC=off`. A limit below the live working set can cause severe GC pressure; the runtime may exceed the soft limit to preserve progress. It cannot prevent OOM or collect reachable data. Do not disable GC as a general tuning recommendation.
- Change settings in isolated runs; runtime debug setters are process-global, not per-request controls. Compare correctness, throughput, tail latency, GC cost and peak process memory without profiling, including burst behavior. Retain a setting only when the whole budget improves; exact timing and GC counts are workload/toolchain-dependent.

## Explain a compiler decision, then measure again
```sh
go build -gcflags='-m' .
go test -run='^$' -gcflags='-m=2' .
```

- `-m` prints optimization decisions; higher levels provide more detail. These forms target the selected package. Use a package pattern such as `-gcflags='all=-m=2'` only when dependency diagnostics are necessary; the output can be large.
- Distinguish `can inline` (eligibility) from `inlining call` (a specific transformed call). Inlining budgets, heuristics, and diagnostics vary by compiler, flags, target and version. Do not design APIs around a fixed budget or require leaf constructors to obtain an optimization.
- Read the escape report's flow from construction through assignments, calls, and retained values. `escapes to heap` describes this build's compiler decision, not a Go language lifetime rule or an exact allocation count for every execution.
- Returning a pointer, converting to an interface, or allocating a variable-length slice does not universally require a heap allocation. Inlining and devirtualization can change what the compiler proves. An inlined construction can still escape.
- Keep supported abstractions unless measured cost justifies a change. Replacing `io.ReadFull` with one `Read` changes short-read and error semantics; test partial input and EOF before accepting such a change. Do not hard-code buffer lengths unless the domain contract fixes them.
- Use `-gcflags='-l'` only as a controlled diagnostic comparison, not as the release performance baseline. Removing optimizations changes the program being measured.
- Rerun correctness tests and representative unprofiled benchmarks after a change. Preserve new compiler/profile evidence for the actual candidate build; do not copy allocation counts or timing ratios from another compiler or workload.

For copy/lifetime contracts rather than diagnostic attribution, use [Ownership and memory](ownership-and-memory.md).
