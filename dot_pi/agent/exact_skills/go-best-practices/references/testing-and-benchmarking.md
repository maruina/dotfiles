# Testing and benchmarking
Use with the core skill for table tests, HTTP boundary tests, parallel subtest isolation, `testing/synctest`, benchmark construction (`testing.B.Loop` vs. `b.N`), and `benchstat` comparisons.

## Table tests, test contexts, and parallel subtests
- Use a slice named `tests`, loop variable `tt`, descriptive subtest names, and `give`/`want` struct fields. Include boundary and error cases alongside happy paths; split tables when setup or assertions diverge enough to require complex branching inside the loop.
- Call `t.Fatal`/`t.Fatalf` only from the goroutine running that test or subtest (`t.Fatal` calls `runtime.Goexit`, which terminates only the current goroutine and causes a panic or hang if called in a spawned worker goroutine).
- On Go 1.24+, use `t.Context()` (or `b.Context()`) for a test-scoped `context.Context` that cancels automatically just before `t.Cleanup` functions run, so `t.Cleanup` callbacks can wait for background workers to exit after cancellation. Use `t.TempDir()` for scratch files and `t.ArtifactDir()` (Go 1.26+) for persisted test output artifacts.
- On Go 1.25+, use `synctest.Test(t, func(t *testing.T) { ... })` (`testing/synctest`) to test concurrent code and timeouts deterministically in an isolated bubble with a synthetic clock: `synctest.Wait()` blocks until all goroutines in the bubble are durably blocked (on in-bubble channels, timers, `time.Sleep`, `sync.Cond.Wait`, or `sync.WaitGroup.Wait`), and synthetic time advances automatically when all goroutines are blocked on timers. Do not use loopback network sockets inside a `synctest` bubble (use `net.Pipe()` instead, because OS network I/O is not durably blocking).
- Parallel subtests (`t.Parallel()`) pause when `t.Parallel()` is called and resume concurrently after the enclosing test function returns:
  - Any `defer` in the parent test function runs **before** parallel subtests execute. Register shared teardown with `t.Cleanup(...)`, which runs only after the test and all of its subtests complete.
  - Never call `t.Setenv`, `os.Chdir`, or mutate package globals inside a test that uses `t.Parallel()`.
  - In modules with `go 1.22` or later in `go.mod`, `for _, tt := range tests` creates a fresh `tt` variable per iteration. If the module targets Go 1.21 or earlier, add `tt := tt` inside the loop before `t.Run`.

## HTTP handler and client tests
- **Testing an `http.Handler` or router:** construct a fresh router/mux per test (never register routes on `http.DefaultServeMux`), pass `httptest.NewRecorder()` and `httptest.NewRequest(...)` into `mux.ServeHTTP`, and inspect `resp := recorder.Result()` (closing `resp.Body`). Verify status code, response headers (which must be set before `WriteHeader` or `Write`), and body content.
- **Testing an HTTP client:** start `srv := httptest.NewServer(handler)`, register `t.Cleanup(srv.Close)`, inject `srv.URL` and `srv.Client()` (with a bounded timeout or context deadline) into the client under test, and close every non-nil `resp.Body`.

```go
package routing_test

import (
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestRoutes(t *testing.T) {
	tests := []struct {
		name     string
		givePath string
		wantCode int
		wantBody string
	}{
		{name: "ready", givePath: "/ready", wantCode: http.StatusOK, wantBody: "ready"},
		{name: "missing", givePath: "/missing", wantCode: http.StatusNotFound, wantBody: "404 page not found\n"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			mux := http.NewServeMux()
			mux.HandleFunc("GET /ready", func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Type", "text/plain")
				_, _ = io.WriteString(w, "ready")
			})
			recorder := httptest.NewRecorder()
			mux.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, tt.givePath, nil))
			resp := recorder.Result()
			defer resp.Body.Close()
			body, err := io.ReadAll(resp.Body)
			if err != nil {
				t.Fatalf("read response: %v", err)
			}
			if resp.StatusCode != tt.wantCode {
				t.Errorf("GET %s status = %d, want %d", tt.givePath, resp.StatusCode, tt.wantCode)
			}
			if string(body) != tt.wantBody {
				t.Errorf("GET %s body = %q, want %q", tt.givePath, body, tt.wantBody)
			}
			if tt.wantCode == http.StatusOK && resp.Header.Get("Content-Type") != "text/plain" {
				t.Errorf("content type = %q, want text/plain", resp.Header.Get("Content-Type"))
			}
		})
	}
}
```

## Benchmark construction (`b.Loop` vs. `b.N`)
- On Go 1.24+, write the benchmark loop as `for b.Loop() { ... }`:
  - `b.Loop()` runs the benchmark function once per measurement, automatically resets the timer on the first iteration (excluding setup before the loop), and stops the timer when the loop exits (excluding cleanup after the loop).
  - The compiler automatically wraps function arguments, call results, and assigned variables inside `for b.Loop() { ... }` with `runtime.KeepAlive` so the loop body is not dead-code eliminated.
  - Do not combine `b.Loop()` with `b.N` loops, and do not use `b.Loop()` inside `b.RunParallel` worker goroutines (which must use `for pb.Next() { ... }`).
- On Go 1.23 and earlier, use `for i := 0; i < b.N; i++ { ... }`, call `b.ResetTimer()` after setup, and assign pure-function outputs to a package-level sink variable after the loop so the compiler cannot optimize the call away.
- When benchmarking an in-place mutating operation (such as sorting a slice), reset the input each iteration so later iterations do not benchmark already-mutated data. Wrap the reset in `b.StopTimer()` / `b.StartTimer()` only when the operation itself is long enough that timer bookkeeping does not dominate.
- Assert that the benchmarked operation produced a valid result after the loop so a broken no-op implementation is never reported as a speedup.

```go
package routing_test

import (
	"slices"
	"testing"
)

func BenchmarkSort(b *testing.B) {
	tests := []struct {
		name string
		give []int
	}{
		{name: "mixed", give: []int{7, 1, 4, 1, 9, 2}},
		{name: "sorted", give: []int{1, 1, 2, 4, 7, 9}},
	}
	for _, tt := range tests {
		b.Run(tt.name, func(b *testing.B) {
			work := make([]int, len(tt.give))
			want := slices.Clone(tt.give)
			slices.Sort(want)
			b.ReportAllocs()
			for b.Loop() {
				b.StopTimer()
				copy(work, tt.give)
				b.StartTimer()
				slices.Sort(work)
			}
			if !slices.Equal(work, want) {
				b.Fatalf("sort = %v, want %v", work, want)
			}
		})
	}
}
```

## Running and comparing benchmarks
- Run benchmarks without `-race` and skip unit tests with `-run='^$'`. Use anchored regexes to isolate a specific sub-benchmark leaf so prior benchmarks do not warm or pollute the heap/CPU cache.
- The `-N` suffix in benchmark output (such as `BenchmarkSort/mixed-8`) reports `GOMAXPROCS`, not the number of goroutines spawned by the benchmark.
- Collect at least 10 samples (`-count=10`) before and after a change under identical load conditions and compare with `benchstat`:

```sh
go test -run='^$' -bench='^BenchmarkSort$/^mixed$' -benchmem -count=10 > before.txt
# apply candidate change
go test -run='^$' -bench='^BenchmarkSort$/^mixed$' -benchmem -count=10 > after.txt
benchstat before.txt after.txt
```
