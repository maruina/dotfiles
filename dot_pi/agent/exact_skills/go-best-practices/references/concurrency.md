# Concurrency and channel patterns
Load for goroutine ownership, worker limits, channels, cancellation, synchronization, or race diagnosis. The core skill retains the general safety rules; this reference supplies decisions and failure cases.

## Scheduling is not synchronization
- Concurrency permits overlapping progress; parallelism permits simultaneous execution. Neither requires results to arrive out of order. Tag and reorder results when the API needs stable order.
- Do not infer execution order from launch order, log output, sleeps, or a successful test run. `GOMAXPROCS(1)` still permits interleaving and does not make shared state safe.
- `GOMAXPROCS` limits simultaneous execution of user Go code, not the total number of OS threads or goroutines. Scheduler G/M/P details are implementation context, not application contracts.
- Go 1.25 introduced container-aware defaults and periodic updates. Check the deployed Go version, module compatibility settings, affinity, quota, and explicit overrides before tuning. Setting `GOMAXPROCS` manually disables automatic updates; do not universally set it to host CPU count.
- For CPU-bound workers, the current execution limit can be a starting benchmark configuration. For I/O work, size limits from connection, memory, downstream, and latency budgets. More goroutines do not guarantee more throughput.

## Lifetime and completion
- Identify who starts each goroutine, what stops it, how errors reach its owner, and who joins it. Returning from a caller or canceling a context does not kill its workers. Returning from `main` does not wait for them.
- On Go 1.25+, `WaitGroup.Go` registers and launches a task; the function must not panic. Register the first task before `Wait` when the group is empty. Do not call `Done` inside that task. On older baselines, call `Add` before launch and defer `Done` inside the goroutine.
- A WaitGroup is not a concurrency limit or error channel. Wait for the previous group before reusing it for independent work; never copy it after first use. Keep registration and completion ownership visible.
- Every potentially blocking send, receive, semaphore acquisition, or I/O call needs a completion or cancellation path. Use a context-aware API for the operation itself, not only for the caller's wait.
- A capacity-one result channel lets one finite worker publish once after its caller leaves. It does not stop an infinite or blocked operation, or support an unbounded number of abandoned sends. Detached work still needs an explicit owner and resource bound.

## Shared-state invariants
- A data race is unsynchronized conflicting access to a memory location, with at least one write. Protect every access consistently, including diagnostic reads. Run `go test -race -shuffle=on ./...` and exercise realistic paths; an instrumented build alone does not exercise them.
- A clean race run is not a proof of correctness. Reading under one lock and writing under a later lock can lose an update without a data race. Hold the lock across the complete read-modify-write invariant.
- Start with a named `sync.Mutex` field. Keep the critical section small but complete; avoid slow I/O or callbacks under the lock. Do not assume FIFO acquisition. Use `RWMutex` only when measured reader concurrency justifies it; pair `RLock/RUnlock` and `Lock/Unlock`, and do not upgrade, downgrade, or recursively read-lock it.
- Use an atomic operation for an independent scalar transition, not for a multi-field invariant. Separate atomic loads and stores do not make an increment atomic. Never mix ordinary and atomic access during concurrent use, or copy atomic wrappers after first use.
- Prefer typed atomics (`sync/atomic.Bool`, `sync/atomic.Int64`, `sync/atomic.Pointer[T]` on Go 1.19+, or `go.uber.org/atomic` when a repository already standardizes on it) over raw primitive atomics; the pinned Uber claim that `sync/atomic` only exposes raw types is pre-Go 1.19. Do not add a third-party atomic dependency when standard-library typed atomics satisfy the module's Go baseline.
- Race reports identify conflicting accesses and goroutine creation stacks. They are diagnostics, not a recoverable Go panic. Do not budget detector overhead from the book's fixed percentage; measure instrumented workloads separately.

## Channel contracts
- A send is synchronized before completion of its corresponding receive. On an unbuffered channel, the receive is also synchronized before completion of the send. This is not a nanosecond timing promise or an acknowledgment of work after receipt.
- Buffered channels also synchronize: the kth receive precedes completion of the (k+capacity)th send. A successful buffered send means admission, not processing. Use a result or join when completion matters.
- Choose capacity from a bounded queue/resource budget. Keep the core's unbuffered-or-one default; document why a larger buffer is safe and what happens at capacity. Buffering changes backpressure, not cancellation support: buffered and unbuffered operations can both participate in a cancelable `select`.
- A nil channel disables a select case; direct sends/receives block. A closed channel yields buffered values first, then the zero value with `ok == false`. Range ends only after draining. Disable a closed receive case or return so it does not spin.
- Close only after all senders finish. Closing signals no further sends; it neither waits for consumers nor frees a resource that otherwise needs closing. Sending on a closed channel, closing it twice, or closing nil panics.
- Use close on `chan struct{}` to broadcast completion/cancellation. One data send goes to one receiver, not all receivers. A multi-ready `select` chooses without priority; cancellation may race with a ready result or admission. Define whether that is acceptable.

## Choose a bounded pattern
| Need | Pattern and completion contract |
|---|---|
| One result or one task handoff | Send/receive with cancellation where blocking can outlive the owner; handoff is not completed processing. |
| Fan-out/in | Bound active work and outstanding tasks/results; collect errors and join producers. Do not allocate a goroutine and buffer slot per item of an unbounded input. |
| Worker pooling | Fixed workers plus a bounded task channel; coordinator closes tasks after sending, workers exit, owner joins. A channel range alone cannot respond to cancellation while idle. |
| Semaphore fan-out | Acquire before launch, with cancellation, to bound created goroutines. Acquiring inside every launched goroutine limits active work but leaves unbounded waiting goroutines. Release on every exit. |
| Overload/drop | Nonblocking send with `default` only when loss is part of the contract; report rejection, count drops, and bound any fallback. Do not hide overload in another unbounded queue. |
| Retry with deadline | Retry only safe, transient failures. Check context before attempts, pass it into attempts, bound attempts/time, and use a positive delay/backoff with cancellation. Return the final error; a timeout around a wait does not bound an uncancelable attempt. |
| Legacy stop-channel adapter | Derive a context from the real parent; adapter selects on stop and context completion. Cancel and join the adapter on return, including normal completion. Propagate operation errors and close successful HTTP bodies. |

## Timers and compatibility
- Call context cancel functions to release associated resources promptly, even after successful work. Cancellation is a signal, not a join.
- Go 1.23 introduced collection of unreachable, unstopped timers/tickers and synchronous timer channels. In Go 1.23–1.26, behavior depends on module and compatibility settings. Go 1.27 removes `asynctimerchan`: timer channels are always synchronous.
- With modern synchronous timers, successful `Stop`/`Reset` prevents a later receive of a stale pre-call value; do not blindly perform a blocking drain. Older asynchronous timers need their documented stop/drain/reset protocol under exclusive ownership. Check the actual baseline rather than copying a universal recipe.
- Stop timers/tickers when no longer useful to stop their activity; GC improvements do not make polling or repeated timer allocation free. Reuse only when ownership and reset behavior are clear. A fresh per-attempt timer is often simpler.

## Original invariant check
This test forces a lost update without a data race. Both workers read before either writes; every shared access holds the same mutex. Contrast it with holding the lock across the full increment. Run with and without `-race`.

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
		t.Fatalf("value = %d, want forced lost update 1", value)
	}
}
```
