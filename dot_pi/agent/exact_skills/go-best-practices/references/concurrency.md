# Concurrency and channel patterns
Use with the core skill for goroutine ownership, worker bounds, mutex vs. atomic invariants, channel protocols, cancellation, and timer semantics.

## Scheduling vs. synchronization
- Concurrency is out-of-order code structure; parallelism is simultaneous execution across CPU cores. `GOMAXPROCS(1)` eliminates parallelism of user Go code but still preempts and interleaves goroutines—it never makes unsynchronized shared state safe.
- `GOMAXPROCS` bounds simultaneous user-level Go execution (Ps), not blocking syscalls/cgo threads (Ms) or total goroutines (Gs).
- Since Go 1.25, the runtime sets `GOMAXPROCS` from container CPU bandwidth limits (such as Linux cgroup quotas) and updates it periodically. Calling `runtime.GOMAXPROCS(n)` or setting `GOMAXPROCS` in the environment disables automatic updates.
- Size CPU-bound worker pools near `GOMAXPROCS`. Size I/O-bound concurrency from downstream rate limits, connection pools, memory budgets, and tail-latency targets.

## Goroutine lifetime and joining
- Before starting a goroutine, define what stops it, how its errors reach the caller, and what waits for it to exit. Returning from the spawning function or canceling a `context.Context` does not wait for child goroutines.
- On Go 1.25+, prefer `wg.Go(func() { ... })`, which calls `Add(1)` before launch and `Done()` when the function returns (the function must not recover-violatingly panic, and the first `wg.Go` on an empty group must precede `wg.Wait()`). On Go 1.24 and earlier, call `wg.Add(1)` before `go func()` and `defer wg.Done()` inside it.
- Never reuse a `sync.WaitGroup` for a new batch before the previous `Wait()` has returned, and never copy a `WaitGroup` after first use.
- When a caller waits on a worker with a `select` on `ctx.Done()`, give the worker's result channel a buffer of `1` (`make(chan Result, 1)`) so the worker can send its final result and exit even if the caller has already returned on timeout. Also pass `ctx` into the worker's underlying I/O call so the work itself aborts.

## Data races vs. logical races
- A data race occurs when two goroutines access the same memory location concurrently, at least one access is a write, and there is no synchronization ordering them. Run `go test -race -shuffle=on ./...` to detect data races along exercised code paths.
- Absence of a data race does not guarantee invariant safety: reading a value under `mu.Lock()`/`mu.Unlock()` and writing back a computed update under a second `mu.Lock()`/`mu.Unlock()` is race-detector clean but loses updates. Hold one lock across the entire read-modify-write invariant.
- Default to a named `mu sync.Mutex` field. Keep critical sections short and avoid blocking network/disk I/O or external callbacks while holding `mu`. Use `sync.RWMutex` only when contention profiles show read-heavy lock contention; never recursively acquire `RLock` in the same goroutine (a waiting writer blocks new `RLock` acquisitions and deadlocks recursive readers).
- Use atomic operations only for independent scalar state (`sync/atomic.Bool`, `sync/atomic.Int64`, `sync/atomic.Pointer[T]` on Go 1.19+, or `go.uber.org/atomic` when a repository standardizes on it). Separate `Load` and `Store` calls are not an atomic read-modify-write, and mixing atomic and non-atomic reads/writes is a data race.

```go
package concurrency

import (
	"sync"
	"testing"
)

func TestSplitLockLosesUpdate(t *testing.T) {
	var mu sync.Mutex
	var value int
	read := make(chan struct{}, 2)
	write := make(chan struct{})
	var wg sync.WaitGroup
	wg.Add(2)
	for i := 0; i < 2; i++ {
		go func() {
			defer wg.Done()
			mu.Lock()
			snapshot := value
			mu.Unlock()
			read <- struct{}{}
			<-write
			mu.Lock()
			value = snapshot + 1
			mu.Unlock()
		}()
	}
	<-read
	<-read
	close(write)
	wg.Wait()
	if value != 1 {
		t.Fatalf("value = %d, want lost-update result 1", value)
	}
}
```

## Channel synchronization and state rules
- Memory model guarantees:
  - A send on a channel happens before the corresponding receive from that channel completes.
  - On an **unbuffered** channel, the receive happens before the send completes (the sender knows the receiver has taken the value, not that the receiver has finished processing it).
  - On a **buffered** channel of capacity `C`, the `k`th receive happens before the `(k+C)`th send completes (which allows a buffered channel of size `C` to act as a counting semaphore).
- Channel state behavior:
  - **`nil` channel:** sends and receives block forever; in a `select`, a `nil` channel case is disabled.
  - **Closed channel:** sends panic; closing again panics; receives return any remaining buffered values with `ok == true`, then immediately return the zero value with `ok == false`. In a `select` loop, set a closed input channel variable to `nil` (or return) so the case does not busy-spin on zero values.
- Only the sender or coordinating owner should close a data channel, and only after all senders have exited. Use `close(done)` on a `chan struct{}` to broadcast cancellation or completion to any number of listeners.

## Bounded concurrency patterns
| Scenario | Pattern and completion contract |
|---|---|
| Single async result with caller timeout | Pass `ctx` to the worker; send on a `make(chan result, 1)` buffer so the worker never leaks if the caller exits early on `<-ctx.Done()`. |
| Bounded fan-out (semaphore) | Acquire the semaphore token (`select { case sem <- struct{}{}: case <-ctx.Done(): }`) **before** `go func()` so waiting work does not spawn unbounded blocked goroutines. Release in `defer`. |
| Fixed worker pool | Spawn `N` workers reading from `jobs`; close `jobs` from the producer after all sends complete; wait on `wg.Wait()`. Include `ctx.Done()` in worker selects when in-flight or idle work must abort early. |
| Load shedding / drop | Use `select { case ch <- item: default: }` only when dropping or rejecting excess work is an explicit contract; increment a drop metric or return an overload error. |
| Retry with backoff | Retry only idempotent/transient errors. Check `ctx.Err()` before each attempt, pass `ctx` into the attempt, bound max attempts/deadline, and wait with `select { case <-timer.C: case <-ctx.Done(): }`. |

## Timers and Go 1.23–1.27 behavior
- In Go 1.23+, unreferenced `time.Timer` and `time.Ticker` instances are eligible for garbage collection even if `Stop()` was not called, and timer channels (`timer.C`) are synchronous (unbuffered) so `Stop()` and `Reset()` immediately prevent stale values from being received afterward.
- In Go 1.23–1.26, legacy buffered timer channels could still be re-enabled via `GODEBUG=asynctimerchan=1` or older `go` module directives. Go 1.27 removes `asynctimerchan` support completely: `timer.C` and `ticker.C` are always synchronous.
- Still call `timer.Stop()` / `ticker.Stop()` when done in hot loops or long-lived scopes, and never blindly `<-timer.C` after `Stop()` on Go 1.23+ because no stale value is buffered and the receive will block forever.
