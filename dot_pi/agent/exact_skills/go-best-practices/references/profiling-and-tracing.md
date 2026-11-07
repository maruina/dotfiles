# Profiling and live-service diagnosis
Use this reference to choose and interpret CPU, memory, block, and mutex profiles, expose `net/http/pprof` safely, analyze execution traces (`runtime/trace`), and tune `GOGC` / `GOMEMLIMIT`. For benchmark construction and `benchstat`, load [Testing and benchmarking](testing-and-benchmarking.md).

## Choose the right diagnostic instrument
Collect one profile type at a time on a representative workload; concurrent profilers (especially high-rate memory or block profiling) perturb CPU timings. Always verify final latency and throughput in an unprofiled run.

| Question | Instrument | What it measures and its limits |
|---|---|---|
| Where is active CPU time spent? | CPU profile (`-cpuprofile`, `/debug/pprof/profile`) | Sampled stacks executing on a CPU; excludes time spent blocked on I/O, channels, timers, or locks. |
| Where is allocation churn coming from? | Memory profile, `-alloc_space` / `-alloc_objects` | Cumulative bytes or objects allocated since process start (sampled at `runtime.MemProfileRate`, default ~1 sample per 512 KiB allocated), including short-lived objects already freed by GC. |
| What heap memory is still retained? | Memory profile, `-inuse_space` / `-inuse_objects` | Bytes or objects still live as of the most recent GC cycle, attributed to the stack that allocated them—not the pointer currently keeping them reachable and not total process RSS. |
| Where do goroutines wait on synchronization? | Block profile (`-blockprofile`) | Time spent blocked on channel operations, mutexes, `select`, and `Cond.Wait` (requires `runtime.SetBlockProfileRate`). |
| Which locks cause the most contention? | Mutex profile (`-mutexprofile`) | Contention attributed to the `Unlock` call site holding the contended lock (requires `runtime.SetMutexProfileFraction`). |
| Which goroutines are permanently leaked? | Goroutine leak profile (`goroutineleak`, Go 1.27+) | Uses GC reachability to report goroutines blocked on concurrency primitives (channels, mutexes, `Cond`) that are unreachable from any runnable goroutine and can never unblock. (Does not detect leaks blocked on primitives still reachable via globals.) |
| Why is tail latency high or CPU underutilized? | Execution trace (`-trace`, `runtime/trace`) | Timeline of goroutine scheduling, runnable queue delays, syscalls, network waits, and GC phases. |

## Profile a focused benchmark
Compile and keep the test binary (`-o work.test`) alongside the profile artifact so `pprof` can symbolize inline frames and source lines:

```sh
go test -run='^$' -bench='^BenchmarkWork$' -benchtime=3s -benchmem -cpuprofile=cpu.out -o work.test .
go tool pprof -top work.test cpu.out
go tool pprof -top -cum work.test cpu.out
go tool pprof -list=Work work.test cpu.out

go test -run='^$' -bench='^BenchmarkWork$' -benchtime=3s -benchmem -memprofile=mem.out -o work.test .
go tool pprof -top -alloc_space work.test mem.out
go tool pprof -top -inuse_space work.test mem.out
```

- `flat` is cost spent directly inside a function; `cum` includes everything it calls. Sort by `-cum` to locate expensive request paths, then inspect `flat` and `-list=<Func>` to see where work or allocations happen. Never sum `cum` rows across functions.
- `go tool pprof -noinlines` collapses inlined call frames during `pprof` analysis; it does not recompile the binary without inlining.

## Read `GODEBUG=gctrace=1` output
Run `GODEBUG=gctrace=1 ./service 2>gc.log` to emit one stderr line per GC cycle (see `go doc runtime` for the current toolchain's exact fields):
- The heap triple `A->B->C MB` reports heap size before GC (`A`), heap size after mark completion (`B`), and live heap (`C`). The `goal` is the target heap size for the cycle, not process RSS.
- The wall-clock triple `stwSweep+concMark+stwMarkTerm ms clock` separates brief stop-the-world pauses from the concurrent mark phase. Only the first and third numbers are stop-the-world pauses; concurrent mark runs alongside application goroutines (using background and assist CPU reported in the `cpu` fields).

## Expose and compare live HTTP profiles safely
- Importing `net/http/pprof` (even as `_ "net/http/pprof"`) registers `/debug/pprof/*` on `http.DefaultServeMux` inside `init()`. Never pass `nil` (which uses `DefaultServeMux`) to a public `http.Server`.
- Mount required diagnostic handlers on a dedicated admin `http.ServeMux` bound to loopback (`127.0.0.1:6060`) or protected by internal auth/network policy, with explicit server timeouts and shutdown handling:
  ```go
  debugMux := http.NewServeMux()
  debugMux.Handle("GET /debug/pprof/heap", pprof.Handler("heap"))
  debugMux.Handle("GET /debug/pprof/allocs", pprof.Handler("allocs"))
  debugMux.Handle("GET /debug/pprof/goroutineleak", pprof.Handler("goroutineleak")) // Go 1.27+
  ```
- Compare live retention or windowed allocation deltas with `-base`:
  ```sh
  curl --fail --show-error --max-time 15 -o before.pb.gz 'http://127.0.0.1:6060/debug/pprof/heap?gc=1'
  # run bounded workload
  curl --fail --show-error --max-time 15 -o after.pb.gz 'http://127.0.0.1:6060/debug/pprof/heap?gc=1'
  go tool pprof -top -inuse_space -base=before.pb.gz ./service after.pb.gz

  curl --fail --show-error --max-time 15 -o allocs.pb.gz 'http://127.0.0.1:6060/debug/pprof/allocs?seconds=5'
  go tool pprof -top -alloc_space ./service allocs.pb.gz
  ```
  `heap?gc=1` triggers a full GC before snapshotting live memory so unreachable garbage does not skew the `-base` diff (use only when the GC pause is acceptable). `allocs?seconds=5` captures the allocation delta over that 5-second window rather than since process start.

## Execution traces, tasks, and regions
- Capture a short window (`go test -run='^TestWork$' -trace=trace.out .` or `curl -o trace.out 'http://127.0.0.1:6060/debug/pprof/trace?seconds=2'`) and inspect timelines or derived pprof profiles:
  ```sh
  go tool trace -http=127.0.0.1:8080 trace.out
  go tool trace -pprof=sched trace.out > sched.pb.gz && go tool pprof -top sched.pb.gz
  ```
  Supported `-pprof` types are `net`, `sync`, `syscall`, and `sched` (runnable-to-running scheduling delay).
- Annotate domain operations with `runtime/trace` when diagnosing multi-goroutine critical paths:
  - `ctx, task := trace.NewTask(parentCtx, "processBatch")` tracks an operation across goroutines; `defer task.End()` after all child goroutines for that operation have joined. Use low-cardinality operation names, never per-request IDs or PII.
  - `trace.WithRegion(ctx, "decode", fn)` (or `defer trace.StartRegion(ctx, "decode").End()` inside a per-item helper function, never deferred directly inside a long loop) records a single-goroutine span.

## `sync.Pool` and GC tuning (`GOGC` / `GOMEMLIMIT`)
- `sync.Pool` amortizes temporary allocations (such as scratch `bytes.Buffer` instances) across GC cycles; it does **not** bound concurrency or guarantee object lifetime. Any pooled item may be deallocated by GC at any time without notification. Always `Reset()` state before `Put` (or after `Get`), drop oversized buffers so one outlier request does not pin a huge backing array in the pool, and never touch an object after passing it to `Put`.
- `GOGC` (default `100`) sets the heap growth ratio before the next GC cycle: since Go 1.18, `target = live_heap + (live_heap + gc_roots) * GOGC / 100`.
- `GOMEMLIMIT` / `debug.SetMemoryLimit` (Go 1.19+) sets a **soft** limit on Go runtime-managed memory (`MemStats.Sys - MemStats.HeapReleased`). Set `GOMEMLIMIT` with 5–15% headroom below the container's hard memory limit to account for non-Go memory (cgo, OS thread stacks, kernel buffers) and allocation spikes. Because `GOMEMLIMIT` is soft, the runtime will exceed it rather than thrash at 100% GC CPU if the live heap itself approaches the limit.
- Inspect compiler inlining and escape decisions with `go build -gcflags='-m=2' .`. Distinguish `can inline` (the function is under the compiler's inlining budget) from `inlining call` (the specific call site was inlined), and never replace `io.ReadFull` with a single `r.Read` call to avoid an escape unless you also handle short reads.
