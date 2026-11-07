# Testing, isolation, and benchmarking
Use with the core skill for test structure, HTTP boundaries, parallel subtests, and benchmark construction and comparison. Check the module's `go` directive before relying on loop-variable semantics.

## Test contracts and diagnostics
- Test observable behavior through supported interfaces. An external `package_name_test` package checks the exported API as a caller sees it; use internal tests when unexported behavior needs direct access.
- Put tests in `_test.go` files with `func TestName(t *testing.T)`. Use descriptive names and failure messages that identify the input, actual value, and expected value.
- Use fatal failures for prerequisites that make further checks unsafe; use non-fatal errors for independent assertions. Fatal methods stop the calling test goroutine, not all goroutines. Return worker errors to the test goroutine instead of calling fatal methods there.
- Match repository test conventions. A test's package location does not establish its isolation: label and separate tests that need live services, credentials, or expensive setup. Ordinary unit tests must not rely on public websites.

## Tables and subtests
- Use a slice named `tests`, a case named `tt`, descriptive subtest names, and `give`/`want` fields for repetitive input/output checks. Include invalid and boundary inputs as well as successful cases.
- Keep setup and assertions visible. Split unrelated cases when conditionals or mock configuration obscure their contracts; do not force all testing into one table.
- `t.Run` starts a subtest and waits until it returns or calls `t.Parallel`. A fatal failure in one subtest does not abort the parent's case loop. Filter a case with `go test -run='^TestName$/^case$' -v`.
- Parallelize only independent cases. Each case needs its own mutable state or explicit synchronization; copying a struct does not isolate slices, maps, pointers, or external resources inside it. `-parallel` bounds parallel tests, not arbitrary goroutines or downstream requests.
- With Go 1.22+ loop semantics, variables declared by the loop have per-iteration identity. Earlier module language versions need `tt := tt` before a captured parallel case. A loop that assigns to a previously declared variable still reuses it. Sequential subtests that finish before the next iteration do not need capture rebinding for that reason alone.
- A parent function's `defer` runs before its paused parallel children resume. Use parent `t.Cleanup` for resources shared with children: it runs after that test and all its subtests complete. Use child cleanup for child-owned resources. Do not change environment variables or other process-wide state from parallel tests.

## HTTP boundaries and resource lifetime
- For clients, inject a URL and client that target a loopback `httptest.NewServer`; close the server explicitly with `t.Cleanup(server.Close)`. Bound requests with a client timeout or context deadline, check errors before reading the response, and close response bodies within each case.
- For handlers, use `httptest.NewRequest` and `httptest.NewRecorder` through the real handler/router. Construct a fresh mux instead of registering routes on `http.DefaultServeMux` in `init`. This checks routing and handler behavior without a listener; it does not establish transport, TLS, proxy, or deployment correctness.
- Set response headers before the first `WriteHeader` or body write. Inspect status, relevant headers, and decoded/body content, not only a success status. `recorder.Result()` exposes the committed header snapshot; do not compare the whole response with `reflect.DeepEqual`.
- A local server is a controlled boundary, not proof that a remote service follows the same contract. Keep real-service checks separate. Use deterministic fault injection for malformed bodies, error statuses, cancellation, and transport failures when those are part of the code's contract.

## Example: isolated parallel handler cases
This complete test uses Go 1.22+ declared-loop semantics. For an earlier module baseline, rebind `tt` immediately inside the loop. Each case constructs its own mux and response recorder.

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
			mux.HandleFunc("/ready", func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Type", "text/plain")
				_, _ = io.WriteString(w, "ready")
			})
			recorder := httptest.NewRecorder()
			mux.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, tt.givePath, nil))
			response := recorder.Result()
			defer response.Body.Close()
			body, err := io.ReadAll(response.Body)
			if err != nil {
				t.Fatalf("read response: %v", err)
			}
			if response.StatusCode != tt.wantCode {
				t.Errorf("GET %s status = %d, want %d", tt.givePath, response.StatusCode, tt.wantCode)
			}
			if string(body) != tt.wantBody {
				t.Errorf("GET %s body = %q, want %q", tt.givePath, body, tt.wantBody)
			}
			if tt.wantCode == http.StatusOK && response.Header.Get("Content-Type") != "text/plain" {
				t.Errorf("content type = %q, want text/plain", response.Header.Get("Content-Type"))
			}
		})
	}
}
```

Run focused cases first, then `go test ./...`, `go vet ./...`, and `go test -race -shuffle=on ./...` with repository-supported toolchains. Repeated shuffled passes can reveal shared state; they do not prove its absence.

## Construct a representative benchmark
- Put `func BenchmarkName(b *testing.B)` in a `_test.go` file. Define one operation, realistic input sizes/distributions, ownership, and concurrency before comparing implementations. Check correctness separately; a fast wrong result is not an improvement.
- For a Go 1.24+ supported baseline, prefer exactly `for b.Loop() { ... }`. The first call resets timing/allocation counters; the false return stops timing, so setup before and cleanup after the loop are excluded. Use one benchmark loop, not both `b.Loop` and `b.N`.
- Reset mutable input per iteration when the operation changes it. If reset is not part of the intended operation, use `b.StopTimer`/`b.StartTimer` around it inside the loop. Timer calls add harness overhead even when excluded from the reported duration; avoid this pattern for tiny operations when a representative end-to-end benchmark is possible.
- For earlier baselines, use `for i := 0; i < b.N; i++`, reset the timer after setup, and stop it before excluded cleanup. Calibration can call the function repeatedly; do not depend on a particular iteration-growth sequence or retain state between calls.
- In the exact `b.Loop` body, Go protects call arguments/results and assigned variables from elimination. This is not a correctness check or a guarantee of production-equivalent optimization. The mechanism is compiler-version dependent; do not assume Go 1.24's inlining restriction applies to later compilers.
- With `b.N`, consume results through a realistic observable use. A benchmark-only sink can change escape behavior or add synchronization costs. Inspect compiler diagnostics or generated code for suspiciously small results. Do not disable inlining globally to make a number look plausible; benchmark the production build path.
- Use `b.Run` for named input/implementation cases. Give each case independent state. The benchmark name suffix reports `GOMAXPROCS`, not the number of worker goroutines or proof of parallel execution. Use `b.RunParallel` for a representative concurrent operation, with its `pb.Next` loop rather than `b.Loop` inside workers.

## Example: reset an in-place operation
This Go 1.24+ benchmark measures sorting, not input allocation/reset. The complete block can share a disposable test module with the handler example. It checks the result after timing; separate unit tests must cover other inputs.

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

## Compare measurements, not anecdotes
- Run correctness/race checks separately from timing; race instrumentation changes performance. Use `-run='^$'` to skip ordinary tests, `-benchmem` for allocated bytes/allocations per operation, and `-bench` to select the intended leaf cases. These metrics do not measure peak/live memory.
- Record toolchain, source revision, build flags, hardware, power/thermal state, `GOMAXPROCS`, and input shape. Use an otherwise idle machine. Rerun suspicious cases in isolation: prior cases can affect caches, GC, and runtime state. A timing difference alone does not identify the cause.
- Choose a sample count before collecting data (at least 10 per case). Keep baseline/candidate workloads identical and interleave independent runs where practical. Compare with `benchstat before.txt after.txt`; inspect confidence intervals and practical effect size. Do not repeat until a desired significance appears, or treat no significant difference as proof of equivalence.
- Do not transfer a measured speed ratio, `fmt` ranking, goroutine count, or algorithm verdict to another workload. Sub-slicing alone does not imply heap allocation; measure the allocations made by the actual implementation.

Select one leaf case with this command, then collect the same selection before and after a change in separate files:

```sh
go test -run='^$' -bench='^BenchmarkSort$/^mixed$' -benchmem -count=10
```

Use the core skill's `benchstat`, profiling, and compiler-diagnostic commands for deeper investigation.
