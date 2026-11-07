# Go guidance sources
## Source identity and precedence
- Ultimate Go Notebook, First Edition, Version 1.0, William Kennedy with Hoanh An (2021), Patch 39. Local PDF: 352 pages, 15,697,515 bytes; SHA-256 `12068570744faf03d4bf1e4c8880655e0baff281013a0c944a7b8d7505c66b13`. PDF pages 2–351 map to printed pages 1–350; front/back covers are unnumbered.
- [Uber Go Style Guide](https://github.com/uber-go/guide/blob/1d60a91aa5e87d443002e23c21903c49489dbde5/style.md), revision `1d60a91aa5e87d443002e23c21903c49489dbde5`, [Apache-2.0](https://github.com/uber-go/guide/blob/1d60a91aa5e87d443002e23c21903c49489dbde5/LICENSE). Originally created by Prashant Varanasi and Simon Newton, expanded by contributors. The core skill condenses, reorganizes, and supplements that guide.
- Claude marketplace `atom/skills/go-best-practices/SKILL.md`, revision `b937ce451cf47154af8566b6ad7776a7749fc810`.
- Repository contracts and supported toolchains constrain application. Verified language semantics/API contracts override inaccurate source claims. Uber wins style conflicts with the marketplace and book. Escalate a genuine modern-design/Uber policy conflict.
- Store concise original guidance, attribution, and evidence only. Do not store the PDF, raw extraction, substantial excerpts, copied diagrams, or `VENDOR.md`.

## Chapter 12 modernization evidence
Checked 2026-11-06; matching PDF hash, printed 233–257 / PDF 234–258, sections 12.1–12.10. Go 1.27.3 darwin/arm64; official download JSON confirmed go1.27.3. Approved walkthrough omissions 12.1/12.6/12.8 retained. No older toolchain, browser UI, production endpoint, throughput improvement or hard memory bound was tested. No unresolved claim or Uber policy conflict; reuse existing synchronization/worker guidance, not raw atomic examples.

| Rule | Printed / PDF pages | Classification | Decision and primary evidence |
|---|---|---|---|
| TR1: bounded trace collection and interpretation | 235–240 / 236–241 | Version-dependent diagnostics | [runtime/trace](https://pkg.go.dev/runtime/trace), local package/Start/Stop docs read; [cmd/trace](https://pkg.go.dev/cmd/trace), installed tool help read. Check Start errors; Stop before writer close; private bounded windows. Derived profiles distinguish scheduling, sync, network and syscall waits. Replace Chrome-only assertion with actively-tested viewer qualification; no UI layout/color guarantees or fixed heap-threshold inference. |
| TR2: bounded fan-out and local reduction | 241–244 / 242–245; 248–249 / 249–250 | Design; workload-dependent performance | Existing core and concurrency reference retain cancellation/join, race and resource bounds. GOMAXPROCS is not universal I/O concurrency or queue sizing. Local aggregation may reduce contention; no cache-line mechanism, speed ratio, unbounded goroutines, fixed int32 count or atomic-library policy change retained. |
| TR3: temporary reuse | Supplemental to worker pooling, 248–249 / 249–250 | API contract; workload-dependent optimization | [sync.Pool](https://pkg.go.dev/sync#Pool), local primary docs read. Book's pooling means workers, not sync.Pool. Distinguish bounded workers from opportunistic temporary-object reuse; misses/discard allowed, no copies after use, transfer ownership at Put, reset/drop retained state. Supplements existing core safeguard. |
| TR4: GC memory budget | 252–253 / 253–254 | Version-dependent runtime; workload-dependent tuning | [GC guide GOGC](https://go.dev/doc/gc-guide#GOGC) and [memory limit](https://go.dev/doc/gc-guide#Memory_limit), downloaded primary HTML sections read; [SetMemoryLimit](https://pkg.go.dev/runtime/debug#SetMemoryLimit), local docs read. Go 1.18+ target includes roots; Go 1.19+ soft runtime memory limit excludes non-Go memory and may be exceeded to avoid thrashing. Replace fixed first trigger and GOGC=1000 recipe with measured headroom/burst/rollback comparisons. No OOM-prevention guarantee. |
| TR5: complete task/region lifetime | 254–257 / 255–258 | API contract; instrumentation design | runtime/trace User annotation primary docs and Region.End/StartRegion docs. Task context can span joined goroutines; regions are same-goroutine and stack-nested. Stable task types replace per-file type names. End on failures too; per-operation helper avoids accumulated loop defers. Trace context does not itself cancel/join. |

### Chapter 12 reproducible original checks
Run the following Python 3 block. It creates an isolated disposable Go module. Tests, vet, two shuffled race runs, owned trace plus testing-owned trace parsing, all four derived profile kinds and pprof parsing passed. Negative checks cover duplicate Start, invalid operation input, invalid trace and unsupported profile type. Pool checks accept either a reused or newly allocated value after GC; they do not assert eviction/identity. GC setter checks restore process-global values and establish API settings only, not pacing/performance or a hard memory ceiling. Headless parsing checks annotations, not browser rendering. Expected pprof missing-main-binary notices did not prevent parsing. No external service or production resource used.

```python
import os, pathlib, subprocess, tempfile
p = pathlib.Path(tempfile.mkdtemp(prefix='go-trace-check-')); os.chdir(p)
(p/'go.mod').write_text('module example.com/tracecheck\n\ngo 1.27\n')
(p/'trace_test.go').write_text(r'''package tracecheck
import (
 "bytes"
 "context"
 "errors"
 "os"
 "runtime"
 "runtime/debug"
 "runtime/trace"
 "sync"
 "testing"
)
func operation(parent context.Context, fail bool) error {
 ctx, task := trace.NewTask(parent, "processBatch")
 defer task.End()
 var wg sync.WaitGroup
 wg.Add(1)
 go func() { defer wg.Done(); trace.WithRegion(ctx, "worker", func(){ trace.Log(ctx, "stage", "count") }) }()
 wg.Wait()
 region := trace.StartRegion(ctx, "decode")
 defer region.End()
 if fail { return errors.New("invalid input") }
 return nil
}
func TestWork(t *testing.T) {
 if err := operation(context.Background(), false); err != nil { t.Fatal(err) }
 if err := operation(context.Background(), true); err == nil { t.Fatal("missing input error") }
}
func TestOwnedTrace(t *testing.T) {
 if trace.IsEnabled() { t.Skip("go test owns this trace") }
 f, err := os.Create("owned.out"); if err != nil { t.Fatal(err) }
 if err := trace.Start(f); err != nil { f.Close(); t.Fatal(err) }
 var other bytes.Buffer
 if err := trace.Start(&other); err == nil { t.Error("second trace unexpectedly started") }
 if err := operation(context.Background(), true); err == nil { t.Error("missing input error") }
 trace.Stop()
 if err := f.Close(); err != nil { t.Fatal(err) }
 if trace.IsEnabled() { t.Fatal("trace still active") }
}
func TestPoolMissAndReset(t *testing.T) {
 var empty sync.Pool
 if empty.Get() != nil { t.Fatal("empty pool should miss") }
 pool := sync.Pool{New: func() any { return new(bytes.Buffer) }}
 b := pool.Get().(*bytes.Buffer); b.WriteString("temporary"); b.Reset(); pool.Put(b)
 runtime.GC()
 next := pool.Get().(*bytes.Buffer)
 if next.Len() != 0 { t.Fatal("stale state") }
 // deliberate: no identity assertion; GC may discard pooled items.
}
func TestGCSettings(t *testing.T) {
 old := debug.SetGCPercent(150); defer debug.SetGCPercent(old)
 if got := debug.SetGCPercent(100); got != 150 { t.Fatalf("previous GOGC=%d", got) }
 oldLimit := debug.SetMemoryLimit(512 << 20); defer debug.SetMemoryLimit(oldLimit)
 if got := debug.SetMemoryLimit(-1); got != 512 << 20 { t.Fatalf("limit=%d", got) }
}
''')
def run(*args, **kw): return subprocess.run(args, check=True, **kw)
run('gofmt', '-w', 'trace_test.go')
run('go', 'test', './...')
run('go', 'vet', './...')
run('go', 'test', '-race', '-shuffle=on', '-count=2', './...')
run('go', 'test', '-run=^TestWork$', '-trace=trace.out', '.')
for source in ['owned.out', 'trace.out']:
 with open(source+'.txt', 'w') as out: run('go', 'tool', 'trace', '-d=parsed', source, stdout=out)
 data = pathlib.Path(source+'.txt').read_text()
 for marker in ['processBatch', 'decode', 'worker']:
  assert marker in data, marker
 for kind in ['sched', 'sync', 'net', 'syscall']:
  profile = source+'.'+kind+'.pb.gz'
  with open(profile, 'wb') as out: run('go', 'tool', 'trace', '-pprof='+kind, source, stdout=out)
  run('go', 'tool', 'pprof', '-top', profile, stdout=subprocess.DEVNULL)
(p/'invalid.out').write_text('not a trace')
assert subprocess.run(['go','tool','trace','-pprof=sched','invalid.out'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode != 0
assert subprocess.run(['go','tool','trace','-pprof=unsupported','trace.out'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode != 0
print('PASS: original contracts and negative cases; scratch:', p)
```

## Chapter 11 modernization evidence
Checked 2026-11-06 with Go 1.27.3 darwin/arm64; official download JSON reported go1.27.3. PDF hash matched; printed 220–232 / PDF 221–233 read. Approved walkthrough omissions 11.1, 11.3, 11.5 and 11.6 remain omitted, not converted into implementation recipes. No older toolchain tested. No Uber policy conflict: explicit handler registration avoids depending on the default-mux side effect, but importing net/http/pprof still performs that registration.

| Rule | Printed / PDF pages | Classification | Decision and primary evidence |
|---|---|---|---|
| LP1: GC trace interpretation | 222–223 / 223–224 | Version-dependent runtime diagnostics | [runtime environment](https://pkg.go.dev/runtime#hdr-Environment_Variables), gctrace section, downloaded primary document and local go doc runtime read. Stderr, changeable format, heap start/end/live, goal, P, wall/CPU phases. Correct first STW phase to sweep termination. Do not interpret rounded zero as zero overhead, P as OS threads, goal as RSS, fixed 4 MB trigger as a guarantee, or a stable short trace as proof of no leak. |
| LP2: private HTTP profiling | 224–227 / 225–228 | API behavior; security/lifetime design | [net/http/pprof](https://pkg.go.dev/net/http/pprof), overview and Parameters, downloaded primary document and local go doc read. Named imports also register DefaultServeMux routes. Use explicit private muxes, loopback, administrative access control, bounded capture and owned server lifetime. Go 1.22+ paths require GET; method-aware mux syntax also requires Go 1.22+. Keep older compatible checks when needed. |
| LP3: memory comparison | 224–227 / 225–228 | Runtime/tool behavior; workload-dependent inference | Same HTTP package Parameters; [pprof base comparison](https://github.com/google/pprof/blob/main/doc/README.md), local go tool pprof -help. gc=1 forces heap GC; seconds on allocs returns interval delta. Retain Chapter 10 sample distinctions; add comparable post-GC snapshots and signed -base interpretation, not leak proof or throughput guarantees. No book ratios or search/cache rewrite retained. |

### Chapter 11 reproducible original checks
Run this Python 3 block from any directory. It creates a disposable module, uses isolated httptest loopback listeners, and does not contact a service. Go tests, vet and two shuffled race runs passed. Checks cover real HTTP binary heap/delta captures and pprof parsing, signed base comparison, default-mux registration, application mux isolation, unregistered broad/index/command-line routes, POST rejection, missing artifacts and child-process gctrace output. No public listener, authentication implementation, production timeout/shutdown integration or performance improvement is claimed by these tests. The reference's curl commands are illustrative; HTTP/pprof contracts were exercised through a bounded Go client with ephemeral addresses and a 1s delta instead of 5s.

Initial one-GC helper exited before runtime trace printing finished; it produced a truncated line. Three explicit GC cycles provide a completed earlier trace without a sleep or a format golden test. The final fixture retains a bounded allocation only; sampling size or exact retained-byte differences are not assertions.

```python
import os, pathlib, subprocess, tempfile
p=pathlib.Path(tempfile.mkdtemp(prefix='go-live-profile-')); os.chdir(p)
(p/'go.mod').write_text('module example.com/livecheck\n\ngo 1.27\n')
(p/'live_test.go').write_text(r'''package livecheck
import (
 "bytes"
 "io"
 "net/http"
 "net/http/httptest"
 "net/http/pprof"
 "os"
 "os/exec"
 "path/filepath"
 "runtime"
 "testing"
 "time"
)
func TestGC(t *testing.T) {
 if os.Getenv("GC_HELPER")=="1" { for range 3 { runtime.GC() }; return }
 cmd:=exec.Command(os.Args[0], "-test.run=^TestGC$")
 cmd.Env=append(os.Environ(),"GC_HELPER=1","GODEBUG=gctrace=1")
 out,err:=cmd.CombinedOutput(); if err!=nil {t.Fatal(err)}
 if !bytes.Contains(out,[]byte("gc ")) || !bytes.Contains(out,[]byte("(forced)")) {t.Fatalf("missing GC trace: %s",out)}
}
func TestPrivateProfiles(t *testing.T) {
 app:=http.NewServeMux()
 debug:=http.NewServeMux()
 debug.Handle("GET /debug/pprof/heap",pprof.Handler("heap"))
 debug.Handle("GET /debug/pprof/allocs",pprof.Handler("allocs"))
 for _,tt:=range []struct{giveMethod,givePath string; want int}{
  {"GET","/debug/pprof/heap",404}, {"GET","/debug/pprof/cmdline",404},
 } {w:=httptest.NewRecorder(); app.ServeHTTP(w,httptest.NewRequest(tt.giveMethod,tt.givePath,nil)); if w.Code!=tt.want {t.Fatal(w.Code)}}
 for _,tt:=range []struct{giveMethod,givePath string; want int}{
  {"POST","/debug/pprof/heap",405},{"GET","/debug/pprof/cmdline",404},{"GET","/debug/pprof/",404},
 } {w:=httptest.NewRecorder(); debug.ServeHTTP(w,httptest.NewRequest(tt.giveMethod,tt.givePath,nil)); if w.Code!=tt.want {t.Fatal(w.Code)}}
 // deliberate: the isolated default mux proves import registration, not access control; production needs its administrative boundary.
 w:=httptest.NewRecorder(); http.DefaultServeMux.ServeHTTP(w,httptest.NewRequest("GET","/debug/pprof/",nil)); if w.Code!=200 {t.Fatal(w.Code)}
 srv:=httptest.NewServer(debug); defer srv.Close()
 client:=&http.Client{Timeout:10*time.Second}; dir:=t.TempDir()
 capture:=func(name,path string) string {t.Helper(); resp,err:=client.Get(srv.URL+path); if err!=nil {t.Fatal(err)}; defer resp.Body.Close(); if resp.StatusCode!=200 {t.Fatal(resp.Status)}; b,err:=io.ReadAll(io.LimitReader(resp.Body,8<<20)); if err!=nil || len(b)==0 || len(b)>=8<<20 {t.Fatal("invalid bounded capture",err)}; dest:=filepath.Join(dir,name); if err:=os.WriteFile(dest,b,0600); err!=nil {t.Fatal(err)}; return dest}
 before:=capture("before.pb.gz","/debug/pprof/heap?gc=1")
 keep:=make([]byte,2<<20); for i:=range keep {keep[i]=byte(i)}
 after:=capture("after.pb.gz","/debug/pprof/heap?gc=1"); runtime.KeepAlive(keep)
 delta:=capture("allocs.pb.gz","/debug/pprof/allocs?seconds=1")
 for _,args:=range [][]string{{"tool","pprof","-top","-inuse_space","-base="+before,after},{"tool","pprof","-top","-alloc_space",delta}} {out,err:=exec.Command("go",args...).CombinedOutput(); if err!=nil || !bytes.Contains(out,[]byte("Type:")) {t.Fatalf("pprof: %v %s",err,out)}}
 cmd:=exec.Command("go","tool","pprof","-top",filepath.Join(dir,"missing")); if err:=cmd.Run(); err==nil {t.Fatal("missing profile accepted")}
}
''')
for args in [('go','test','-v','./...'),('go','vet','./...'),('go','test','-race','-shuffle=on','-count=2','./...')]:
 subprocess.run(args,check=True,timeout=120)
print('PASS: original GC, private HTTP, delta/base, method/path and missing-artifact checks',p)

```

## Chapter 10 modernization evidence
Checked 2026-11-06 against Go 1.27.3 darwin/arm64; official download JSON also reported go1.27.3. Printed 200–219 / PDF 201–220 read in bounded chunks; 10.2 remains an approved walkthrough omission. All new guidance is in references/profiling-and-tracing.md. No older toolchain compatibility claim or Uber policy conflict.

| Rule | Printed / PDF pages | Classification | Decision and primary evidence |
|---|---|---|---|
| PF1: question-led profiling | 200–202 / 201–203 | Workload-dependent measurement; design preference | [Diagnostics: profiling](https://go.dev/doc/diagnostics#profiling). Retain comparable representative workloads and isolated collection; replace universal SIGPROF/10ms mechanism claims, mandatory dedicated hardware and never-update advice with target-specific measurement. Blocking evidence need not wait for CPU/memory optimization. Core already covers measurement/correctness safeguards. |
| PF2: profile/sample selection | 200–202, 206–209 / 201–203, 207–210 | Runtime/tool behavior | [runtime/pprof.Profile](https://pkg.go.dev/runtime/pprof#Profile), [MemProfileRate](https://pkg.go.dev/runtime#MemProfileRate), [test flags](https://pkg.go.dev/cmd/go#hdr-Testing_flags). Distinguish CPU, block, mutex, goroutine, cumulative allocation and post-GC live heap; live heap is not RSS or a retaining-reference graph. Sampling is an average per bytes allocated, not every Nth object. No allocation/GC or syscall hotspot is a sufficient diagnosis. |
| PF3: capture and attribution | 205–211, 217–219 / 206–212, 218–220 | Tool behavior; compiler-dependent attribution | [pprof documentation](https://github.com/google/pprof/blob/main/doc/README.md), local go tool pprof -help and successful top/cum/list/sample-index runs. Flat is direct cost, cumulative includes callees. Keep matching binary/source and private artifacts. Replace historical browser/terminal claims: -noinlines ignores inline frames, does not enable compiler inlining. Profiling perturbs timings; do not publish book ratios. |
| PF4: compiler explanation | 210–219 / 211–220 | Compiler implementation detail; API contracts | [Compiler flags](https://pkg.go.dev/cmd/compile#hdr-Command_Line), [build flags](https://pkg.go.dev/cmd/go#hdr-Compile_packages_and_dependencies), [heap/stack FAQ](https://go.dev/doc/faq#stack_or_heap), [io.ReadFull](https://pkg.go.dev/io#ReadFull). Replace fixed inline budget, leaf-function recipe, pointer-return/interface/variable-size heap absolutes with build-specific flow diagnostics. Interface conversion alone does not imply allocation. Preserve ReadFull short-input semantics and domain buffer sizes rather than mechanically substituting Read or hard-coded lengths. |

Primary package/command documents were downloaded and relevant profiling, sampling, flag, and compiler sections read (also local go doc runtime/pprof.Profile and cmd/compile). The pprof help explicitly says “Ignore inlines.” No unsupported CPU sampling frequency, stack-cost promise, hard-coded budget, or quantitative speedup retained. OS perf counters are omitted: optional platform tooling adds no portable rule here.

### Chapter 10 reproducible original checks
Run the following Python 3 block from any directory. It creates an isolated mktemp-equivalent module; no repository or service changes. It tests original checksum/allocation workloads, empty input, partial/EOF reads, compiler pointer/interface flows, four separate profile collections, all four memory sample views, flat/cumulative/list/noinlines views, missing-profile and invalid-compiler-flag failures. Block/mutex output parsing is a tool smoke check, not proof of a contention workload. Full memory sampling is restricted to this scratch experiment. The fixture retains only the last allocation, not an unbounded history.

Execution passed: tests, vet, two shuffled race runs, profile commands and expected negative rejections. Initial harness assumption that list output includes a Type header was corrected to require Total instead. Initial allocation fixture remained on stack; adding bounded observable retention made the intended heap-churn workload explicit. No production assertion or guidance was weakened. Compiler text is not a cross-version golden result. Exact shell commands in the reference were exercised with the fixture names/paths and 1s bounded collection in place of the illustrative 3s window; no UI server was started.

```python
import os, pathlib, subprocess, tempfile
p=pathlib.Path(tempfile.mkdtemp(prefix='go-profiling-')); os.chdir(p)
(p/'go.mod').write_text('module example.com/profilecheck\n\ngo 1.27\n')
(p/'work.go').write_text('''package profilecheck
import "bytes"
func Work(data []byte) uint64 {
 var total uint64
 for _, v := range data { total = total*33 + uint64(v) }
 return total
}
func makeValue() *int { v := 17; return &v }
func localValue() int { return *makeValue() }
func bufferLen(data []byte) int { return bytes.NewBuffer(data).Len() }
''')
(p/'work_test.go').write_text('''package profilecheck
import (
 "errors"
 "io"
 "testing"
)
type shortReader struct{ remaining int }
func (r *shortReader) Read(p []byte) (int, error) {
 if r.remaining == 0 { return 0, io.EOF }
 if len(p) == 0 { return 0, nil }
 p[0] = 'x'; r.remaining--; return 1, nil
}
func TestContracts(t *testing.T) {
 if Work(nil) != 0 || Work([]byte{1,2}) != 35 || localValue()!=17 || bufferLen([]byte{1,2})!=2 { t.Fatal("value contract") }
 for _, n := range []int{0,1,3} {
  r:=&shortReader{remaining:n}; dst:=make([]byte,3); got,err:=io.ReadFull(r,dst)
  wantErr:=error(nil); if n==0 {wantErr=io.EOF} else if n<3 {wantErr=io.ErrUnexpectedEOF}
  if got!=n || !errors.Is(err,wantErr) {t.Fatalf("n=%d: %d %v",n,got,err)}
 }
 r:=&shortReader{remaining:3}; dst:=make([]byte,3); n,err:=r.Read(dst)
 if n!=1 || err!=nil {t.Fatal("short read fixture")}
}
func BenchmarkWork(b *testing.B) {
 data:=make([]byte,16384)
 for i:=range data {data[i]=byte(i)}
 for b.Loop() { Work(data) }
}
// deliberate: retain only the last allocation to measure churn without unbounded storage.
var retained []byte
func BenchmarkAllocate(b *testing.B) {
 for b.Loop() { data:=make([]byte,16384); for i:=range data {data[i]=byte(i)}; Work(data); retained=data }
}
''')
def run(*args):
 r=subprocess.run(args,text=True,capture_output=True)
 if r.returncode: raise RuntimeError((args,r.stdout,r.stderr))
 return r.stdout+r.stderr
print(run('go','version')); print(run('go','test','./...')); print(run('go','vet','./...')); print(run('go','test','-race','-shuffle=on','-count=2','./...'))
for flags in [('-cpuprofile=cpu.out',),('-memprofile=mem.out','-memprofilerate=1'),('-blockprofile=block.out',),('-mutexprofile=mutex.out',)]:
 print(run('go','test','-run=^$','-bench=^Benchmark(Work|Allocate)$','-benchtime=1s','-benchmem','-o=work.test',*flags,'.'))
for args in [('-top','cpu.out'),('-top','-cum','cpu.out'),('-list=Work','cpu.out'),('-noinlines','-top','cpu.out'),('-top','-alloc_space','mem.out'),('-top','-inuse_space','mem.out'),('-top','-alloc_objects','mem.out'),('-top','-inuse_objects','mem.out'),('-top','block.out'),('-top','mutex.out')]:
 out=run('go','tool','pprof',*args[:-1],'work.test',args[-1]); assert ('Total:' in out if args[0].startswith('-list') else 'Type:' in out); print(out)
assert 'Work' in run('go','tool','pprof','-top','work.test','cpu.out')
assert 'BenchmarkAllocate' in run('go','tool','pprof','-top','-alloc_space','work.test','mem.out')
report=run('go','test','-run=^$','-gcflags=-m=2','.')
(p/'compiler.txt').write_text(report)
assert 'inlining call to makeValue' in report and 'does not escape' in report and 'escapes to heap' in report
print(report)
for args in [('go','tool','pprof','missing.out'),('go','test','-run=^$','-gcflags=-invalid-flag','.')]:
 r=subprocess.run(args,capture_output=True,text=True); assert r.returncode!=0; print('expected rejection:',args)
print('PASS; scratch:',p)

```

## Coverage and verification
`plans/go-notebook-skill/coverage.md` tracks source disposition separately from shipped guidance. Reading a range is not verification. Version-sensitive claims require primary documentation and original tests where applicable; missing evidence leaves a claim blocked. A successful modern-toolchain test does not establish older-toolchain compatibility.

The existing core is the merged PR #125 baseline (`13d2330ff3bfc749e560ff382442b123f7eddcf7`). Book-derived rules are added only after bounded content review and the modernization gate.

## Chapter 2 modernization evidence
Checked 2026-11-06. [Official downloads](https://go.dev/dl/?mode=json) reported Go 1.27.3; local execution used `go1.27.3 darwin/arm64`. Older toolchains were not tested. The language rules below are not permission to raise a consumer's minimum version. All retained Chapter 2 rules are in `references/ownership-and-memory.md`; declaration/enum preferences remain in the core.

| Rule | Printed / PDF pages | Classification | Decision and primary evidence |
|---|---|---|---|
| LM1: numeric widths, zero values, conversions | 25–28, 31 / 26–29, 32 | Language guarantee; declaration style is a preference | [Numeric types](https://go.dev/ref/spec#Numeric_types), [zero value](https://go.dev/ref/spec#The_zero_value), [conversions](https://go.dev/ref/spec#Conversions). Retain semantic zero initialization, not an all-bits-zero representation promise. Ordinary conversions do not promise new memory; integer narrowing can truncate. Core already covers zero declarations and keyed literals. |
| LM2: struct layout | 29–30 / 30–31 | Language alignment constraints; target/compiler-dependent layout; workload-dependent optimization | [Size/alignment guarantees](https://go.dev/ref/spec#Size_and_alignment_guarantees), [unsafe.Sizeof](https://pkg.go.dev/unsafe#Sizeof), [Alignof](https://pkg.go.dev/unsafe#Alignof), [Offsetof](https://pkg.go.dev/unsafe#Offsetof). Replace largest-field-size heuristic with field alignment requirements. Omit fixed offsets/byte totals as portable promises and universal descending-size ordering. Benchmark before changing domain order. |
| LM3: copying and shared identity | 32–34 / 33–35 | Language guarantee; ownership design preference | [Calls](https://go.dev/ref/spec#Calls), [representation of values](https://go.dev/ref/spec#Representation_of_values), [FAQ: pass by value](https://go.dev/doc/faq#pass_by_value). Retain copied values, including copied pointers. Struct copies do not recursively isolate referenced data. Core supplies receiver/locking policy; pointers provide no synchronization. |
| LM4: lifetime and escape analysis | 32, 34–37 / 33, 35–38 | Lifetime semantics; compiler/runtime implementation detail | [FAQ: heap or stack](https://go.dev/doc/faq#stack_or_heap). Retain safe lifetime of returned locals; replace unconditional pointer-return/variable-size-allocation claims with build-specific diagnostics and measurements. Omit 2 KiB stacks, fixed frames, stack cleaning and growth mechanics, no-cross-stack-pointer claims, and GC pacing recipes as implementation teaching rather than portable rules. GC does not replace explicit resource cleanup (core resource-lifetime policy). |
| LM5: constants and iota | 37–40 / 38–41 | Language guarantee; enum defaults are style | [Constants](https://go.dev/ref/spec#Constants), [constant expressions](https://go.dev/ref/spec#Constant_expressions), [iota](https://go.dev/ref/spec#Iota). Replace fixed 256-bit precision with arbitrary-precision semantics and specified compiler minima. Count constant specifications, not identifiers; preserve representability/default-type and integer-division caveats. Core's Uber enum policy remains unchanged. |

The documents above were downloaded and the relevant sections read, not accepted from a search summary. The [Go 1.27 allocation release note](https://go.dev/doc/go1.27#faster-memory-allocation) describes an implementation optimization; it does not change copy or lifetime contracts. No release benchmark numbers are carried into guidance. Compared with the pinned Uber-derived baseline: no style policy conflict found; core safeguards are retained.

### Original-example validation
The ownership reference contains a complete example test. Copy its Go block to `ownership_test.go` in a disposable module outside the repository. The additional test below covers semantic zero values, truncation, constant division, iota specification indexing, defined-type conversion, and observational layout. Layout numbers are logged, not asserted as portable contracts.

```go
package ownership

import (
	"testing"
	"unsafe"
)

func TestMechanics(t *testing.T) {
	var zero struct {
		Flag  bool
		Count int
		Next  *int
	}
	if zero.Flag || zero.Count != 0 || zero.Next != nil {
		t.Fatal("nonzero default")
	}
	wide := uint16(513)
	if uint8(wide) != 1 {
		t.Fatal("integer narrowing")
	}
	const exact = 7 / 2.0
	const truncated = 7 / 2
	if exact != 3.5 || truncated != 3 {
		t.Fatal("constant division")
	}
	const (
		first, same = iota, iota
		second, again
	)
	if first != 0 || same != 0 || second != 1 || again != 1 {
		t.Fatal("iota specification index")
	}
	type countA int
	type countB int
	if countB(countA(4)) != 4 {
		t.Fatal("defined type conversion")
	}
	type padded struct {
		A byte
		B int64
		C byte
	}
	type grouped struct {
		B int64
		A byte
		C byte
	}
	t.Logf("layout padded=%d grouped=%d alignment=%d offset=%d", unsafe.Sizeof(padded{}), unsafe.Sizeof(grouped{}), unsafe.Alignof(padded{}), unsafe.Offsetof(padded{}.B))
}
```

Reproduce on the intended toolchain:
1. Create a directory with `mktemp -d`; put the two Go blocks in `ownership_test.go` and `mechanics_test.go`.
2. Run `go mod init example.com/ownership`, `go version`, `go test -v ./...`, `go vet ./...`, and `go test -gcflags=-m ./...`.
3. In a separate `invalid.go`, use `package ownership` followed by `const overflow uint8 = 300`. Run `go test ./...`: it must fail with constant overflow. Remove that file.
4. Repeat with `type left int; type right int; var a left; var b right = a`: it must fail because distinct defined types are not implicitly assignable. Remove that file before rerunning the passing suite.

Execution outcome (Go 1.27.3 darwin/arm64): example and mechanics tests passed; `go vet` and escape-diagnostic build passed. Layout observation: padded 24 bytes, grouped 16, alignment 8, field offset 8; these are not cross-target expectations. Both invalid programs failed as required. No allocation count, older-version compatibility, or performance improvement is asserted.

The first example test run failed because `ExampleOwnership` named a nonexistent documented identifier. Renaming the package example to `Example` fixed the test naming error; no check was disabled. All checks were rerun after the fix.

## Chapter 3 evidence
Source reviewed 2026-11-06: printed 41–66 / PDF 42–67 in two extractions (42–54, 55–67). Source hash matched the edition above; local toolchain reports `go1.27.3 darwin/arm64`. Official documentation was fetched and relevant specification/package sections read after public source discovery. Search summaries alone were not used as proof. Recovery execution rechecked source identity, bounded extraction, and primary documentation, then passed implementation checks before integration. Independent lifecycle verification remains pending. Older toolchain compatibility and performance results are unverified.

| Rule | Printed / PDF pages | Classification | Decision and primary evidence (checked 2026-11-06) |
|---|---|---|---|
| DS1: locality | 41–44, 49, 51, 61–62 / 42–45, 50, 52, 62–63 | Workload-dependent observation; hardware implementation detail | Keep measurement guidance and contiguous element storage from [slice types](https://go.dev/ref/spec#Slice_types); distinguish referenced pointees. Omit fixed cache lines/latencies, benchmark ratios, TLB/page-size prescriptions, and asserted no-allocation results. No performance claim requires a synthetic benchmark. Core already requires profiling before layout changes. |
| DS2: arrays and value descriptors | 45, 48–51 / 46, 49–52 | Language guarantees; value-parameter design preference | [Array types](https://go.dev/ref/spec#Array_types), [slice types](https://go.dev/ref/spec#Slice_types), [string types](https://go.dev/ref/spec#String_types), [calls](https://go.dev/ref/spec#Calls). Keep array length/type and copy/share semantics. Omit fixed string/slice word counts, address outputs, and guaranteed stack allocation. Pointers remain appropriate when replacement/shared identity is the actual contract; no universal ban. |
| DS3: iteration | 46–49 / 47–50 | Language guarantee; Go-version-dependent loop bindings | [Range clauses](https://go.dev/ref/spec#For_range), [Go 1.22 language changes](https://go.dev/doc/go1.22#language). Replace generalized collection-copy claims with array-value vs slice-storage behavior. Index-only array range can omit expression evaluation. Go 1.22+ declared iteration variables are distinct; assignment to existing variables still reuses them. Do not promise copying prevents escape. |
| DS4: append, slicing, copying | 50–59 / 51–60 | Language/API guarantee; growth policy is implementation detail | [Slice expressions](https://go.dev/ref/spec#Slice_expressions), [append/copy](https://go.dev/ref/spec#Appending_to_and_copying_slices), [slices.Clip](https://pkg.go.dev/slices#Clip), [slices.Clone](https://pkg.go.dev/slices#Clone). Retain capacity-controlled append and shared element writes. Correct full-slice arithmetic to high-low/max-low. Omit 1024-element/doubling/25% growth algorithm. `slices`/`maps` require [Go 1.21](https://go.dev/doc/go1.21#library); make/copy or an entry loop is the earlier-version alternative. |
| DS5: retained storage and element pointers | 54–61 / 55–62; existing core retention policy | Language lifetime; API guarantee; ownership preference | [Append](https://go.dev/ref/spec#Appending_to_and_copying_slices) can replace storage; old element pointers remain valid but do not follow the new array. [Clip](https://pkg.go.dev/slices#Clip) only restricts capacity. [Delete](https://pkg.go.dev/slices#Delete) changes shared storage; [Go 1.22 library notes](https://go.dev/doc/go1.22#slices) specify zeroing the obsolete tail (not a Go 1.21 promise). [clear](https://go.dev/ref/spec#Clear) requires Go 1.21; earlier toolchains need an assignment loop. |
| DS6: strings and decoding | 45, 62–63 / 46, 63–64; existing core retention policy | Language/API guarantees; version-dependent helpers | [String range](https://go.dev/ref/spec#For_range) specifies invalid-byte advancement; [DecodeRuneInString](https://pkg.go.dev/unicode/utf8#DecodeRuneInString) supplies consumed width. Do not reconstruct invalid bytes using RuneLen. [strings.Clone](https://pkg.go.dev/strings#Clone) requires Go 1.18, copies nonempty strings, and needs a retention reason. [strings.CutLast](https://pkg.go.dev/strings#CutLast), [bytes.CutLast](https://pkg.go.dev/bytes#CutLast), and [Go 1.27 notes](https://go.dev/doc/go1.27) confirm Go 1.27 addition. Byte results alias input; earlier versions can use LastIndex plus an absence branch. |
| DS7: map contracts | 64–66 / 65–67 | Language/API guarantee; layout is implementation detail | [Map types](https://go.dev/ref/spec#Map_types), [index expressions](https://go.dev/ref/spec#Index_expressions), [delete](https://go.dev/ref/spec#Deletion_of_map_elements), [range](https://go.dev/ref/spec#For_range), [maps.Clone](https://pkg.go.dev/maps#Clone). Correct the book's nil-map general panic claim: reads/range/delete work; writes panic. Require comparable keys including dynamic interface values. Retain comma-ok; omit bucket-layout and iteration-randomization-threshold assumptions. Core owns synchronization/ordering/size hints. |

Compared with the pinned Uber-derived core: ownership-boundary copies, nil defaults, and synchronization safeguards remain in the core. Detailed aliasing/retention guidance moves to the existing reference. No style-policy conflict found. No dependencies, minimum-version increase, or Chapter 4 rules are proposed.

### Chapter 3 reproducible original checks
Copy this complete block to `structures_test.go` in a disposable module outside the repository. It deliberately requires Go 1.27 for CutLast. Copy the ownership reference's existing Go block into `ownership_test.go`. Run `go mod init example.com/ownership`, `go version`, `go test -v ./...`, and `go vet ./...`. Recovery execution passed `go test -v ./...`, `go vet ./...`, and `go test -race -shuffle=on ./...` on Go 1.27.3 darwin/arm64, including the existing ownership example. Both compile-negative cases below were rejected with expected type errors. No scratch file is a resume dependency.

```go
package ownership

import (
	"bytes"
	"maps"
	"slices"
	"strings"
	"testing"
	"unicode/utf8"
)

func TestSliceStorage(t *testing.T) {
	base := []int{1, 2, 3}
	view := base[:1]
	view = append(view, 9)
	if base[1] != 9 { t.Fatal("append must reuse spare capacity") }
	limited := slices.Clip(base[:1])
	limited[0] = 7
	if base[0] != 7 { t.Fatal("clip must still alias elements") }
	limited = append(limited, 8)
	if base[1] != 9 { t.Fatal("clipped append overwrote original") }
	old := &base[0]
	grown := append(base[:len(base):len(base)], 4)
	*old = 5
	if grown[0] != 7 { t.Fatal("old pointer followed new storage") }
	x := 1
	original := []*int{&x}
	cloned := slices.Clone(original)
	*cloned[0] = 2
	cloned[0] = nil
	if original[0] != &x || x != 2 { t.Fatal("clone depth") }
	dst := make([]int, 0, 3)
	if copy(dst, base) != 0 { t.Fatal("copy used capacity as length") }
	overlap := []int{1, 2, 3}
	copy(overlap[1:], overlap[:2])
	if !slices.Equal(overlap, []int{1, 1, 2}) { t.Fatal("overlap") }
	backing := []*int{&x, &x, &x}
	short := slices.Delete(backing, 1, 3)
	if len(short) != 1 || backing[1] != nil || backing[2] != nil { t.Fatal("delete tail") }
	if slices.Clone([]int(nil)) != nil { t.Fatal("nil clone") }
}

func TestRangeStorage(t *testing.T) {
	array := [2]int{1, 2}
	var observed []int
	for i, value := range array {
		if i == 0 { array[1] = 9 }
		observed = append(observed, value)
	}
	if !slices.Equal(observed, []int{1, 2}) { t.Fatal("array snapshot") }
	values := []int{1, 2}
	observed = nil
	for i, value := range values {
		observed = append(observed, value)
		if i == 0 { values[1] = 8; values = append(values, 3) }
	}
	if !slices.Equal(observed, []int{1, 8}) { t.Fatal("slice range storage or bounds") }
	for i := range values { values[i]++ }
	if values[0] != 2 { t.Fatal("index mutation") }
	var pointers []*int
	for _, value := range []int{3, 4} { pointers = append(pointers, &value) }
	if *pointers[0] != 3 || *pointers[1] != 4 { t.Fatal("Go 1.22 declared bindings") }
	pointers = nil
	var reused int
	for _, reused = range []int{3, 4} { pointers = append(pointers, &reused) }
	if pointers[0] != pointers[1] { t.Fatal("assigned binding was not reused") }
}

func TestStringsAndMaps(t *testing.T) {
	input := "é\xffz"
	var offsets []int
	for i := range input { offsets = append(offsets, i) }
	if !slices.Equal(offsets, []int{0, 2, 3}) || utf8.ValidString(input) { t.Fatal("invalid UTF-8") }
	r, width := utf8.DecodeRuneInString(input[2:])
	if r != utf8.RuneError || width != 1 { t.Fatal("invalid consumed width") }
	if strings.Clone(input) != input || strings.Clone("") != "" { t.Fatal("string clone") }
	before, after, ok := strings.CutLast("a/b/c", "/")
	if !ok || before != "a/b" || after != "c" { t.Fatal("last separator") }
	before, after, ok = strings.CutLast("abc", "/")
	if ok || before != "abc" || after != "" { t.Fatal("missing separator") }
	before, after, ok = strings.CutLast("", "")
	if !ok || before != "" || after != "" { t.Fatal("empty separator") }
	data := []byte("a/b")
	_, tail, ok := bytes.CutLast(data, []byte("/"))
	if !ok { t.Fatal("byte separator") }
	tail[0] = 'c'
	if string(data) != "a/c" { t.Fatal("byte result must alias") }
	_, tail, ok = bytes.CutLast(data, []byte("!"))
	if ok || tail != nil { t.Fatal("missing byte separator") }
	var absent map[string]int
	delete(absent, "x")
	if value, ok := absent["x"]; ok || value != 0 { t.Fatal("nil map lookup") }
	m := map[string]*int{"zero": new(int)}
	clone := maps.Clone(m)
	*clone["zero"] = 9
	delete(clone, "zero")
	if *m["zero"] != 9 { t.Fatal("map clone depth") }
	zero := map[string]int{"present": 0}
	if _, ok := zero["present"]; !ok { t.Fatal("stored zero") }
}

func TestInvalidCollectionOperations(t *testing.T) {
	tests := []struct { name string; run func() }{
		{name: "nil map write", run: func() { var m map[string]int; m["x"] = 1 }},
		{name: "interface key", run: func() { m := map[any]int{}; m[[]int{1}] = 1 }},
		{name: "index at length", run: func() { s := make([]int, 1, 3); s[len(s)] = 1 }},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			defer func() { if recover() == nil { t.Fatal("expected panic") } }()
			tt.run()
		})
	}
}
```

Also compile two independent negative cases, each as the sole `invalid.go` in a separate disposable directory: `package invalid; var a [2]int; var b [3]int = a` and `package invalid; var m map[[]int]int`. `go test invalid.go` must reject each. Do not treat their expected failure as a failed positive suite. No test asserts allocator growth ratios, addresses, allocation counts, memory release timing, or speedups.

## Chapter 4 evidence
Reviewed 2026-11-06: printed 67–89 / PDF 68–90, sections 4.1–4.14. Hash matched; extraction read in two bounded reads. Local toolchain: Go 1.27.3 darwin/arm64. Older toolchains were not run. The specification and pinned Uber source were downloaded and the sections below read after public source discovery; search summaries were not used as proof.

| Rule | Printed / PDF pages | Classification | Decision and primary evidence |
|---|---|---|---|
| DC1: receiver ownership | 67–71 / 68–72 | Language guarantee; design preference | [Calls](https://go.dev/ref/spec#Calls), [representation](https://go.dev/ref/spec#Representation_of_values). Retain shallow copies/shared identity; core receiver policy wins. Replace “never pointer to value” with documented copy safety. Constructor returns are evidence, not mandatory semantics. Omit obsolete time/file implementation listings and the inaccurate claim that IP.Mask mutates its input; its shown code allocates output. |
| DC2: method sets and calls | 67–68, 72, 80–81 / 68–69, 73, 81–82 | Language guarantee | [Method sets](https://go.dev/ref/spec#Method_sets), [calls](https://go.dev/ref/spec#Calls), [method expressions](https://go.dev/ref/spec#Method_expressions). Addressing shorthand requires addressability and does not affect interface satisfaction. Method expressions are valid reusable functions, not prohibited style. Omit stack/heap explanations for non-addressability. |
| DC3: saved receivers | 73–75 / 74–76 | Language guarantee; performance is implementation-dependent | [Method values](https://go.dev/ref/spec#Method_values). Retain evaluation-time capture and shallow copy caveat. Pointer reassignment does not retarget a callback. No allocation/cost prediction from semantics alone. |
| DC4: interfaces | 76–82 / 77–83 | Language guarantee; design preference | [Variables](https://go.dev/ref/spec#Variables), [interface types](https://go.dev/ref/spec#Interface_types), [assignability](https://go.dev/ref/spec#Assignability). Replace “valueless” with dynamic type/value; omit two-word/itable layout as normative guidance. Keep implicit implementation and heterogeneous collections; do not copy the book's reader implementation (it returns a length that can exceed the supplied buffer). Narrow consumer boundaries, not mandatory single-method/verb names or speculative change defenses. Generics remain appropriate for uniform algorithms. |
| DC5: embedding | 83–86 / 84–87 | Language guarantee; public API design preference | [Struct types](https://go.dev/ref/spec#Struct_types), [selectors](https://go.dev/ref/spec#Selectors). Retain promotion with exact value/pointer method-set distinction, ambiguity, nil hazards and non-virtual dispatch. Pinned Uber “Avoid Embedding Types in Public Structs” and “Embedding in Structs” govern design; prefer named delegation. |
| DC6: exporting | 87–89 / 88–90 | Language guarantee; API preference; version-dependent syntax | [Exported identifiers](https://go.dev/ref/spec#Exported_identifiers), [composite literals](https://go.dev/ref/spec#Composite_literals), [Go 1.27 language changes](https://go.dev/doc/go1.27#language). Correct outdated blanket restriction: Go 1.27 allows promoted-field literal keys, but not traversal through embedded pointers or overlapping keys. Unexported concrete returns are legal; prefer nameable supported APIs. Exported promoted fields are accessible; do not turn the book's broad reflection/marshaling claim into a universal rule. |

Compared with pinned Uber revision 1d60a91aa5e87d443002e23c21903c49489dbde5: receiver/interface assertions, value interface parameters, and public embedding policy agree with the core. Representation corrections are specification-over-implementation, not a style-policy conflict. No unresolved modern-guidance/Uber design conflict. No Chapter 5 integration or dependency changes.

### Chapter 4 reproducible original checks
In a disposable module, run `go mod init example.com/design`. Copy the reference's Go block to `callbacks_test.go` and this block to `contracts_test.go`. Mixed receivers and embedding here test language behavior, not production design preferences.

```go
package design

import "testing"

type counter int

func (c counter) Value() int { return int(c) }
func (c *counter) Add()      { *c++ }

type valuer interface{ Value() int }
type adder interface{ Add() }
type byValue struct{ counter }
type byPointer struct{ *counter }
type left struct{}

func (left) Name() string     { return "inner" }
func (v left) Inside() string { return v.Name() }

type outer struct{ left }

func (outer) Name() string { return "outer" }

var _ valuer = counter(0)
var _ valuer = (*counter)(nil)
var _ adder = (*counter)(nil)
var _ valuer = byValue{}
var _ adder = (*byValue)(nil)
var _ adder = byPointer{}
var _ adder = (*byPointer)(nil)

func TestContracts(t *testing.T) {
	c := counter(1)
	c.Add()
	var v valuer = c
	var p valuer = &c
	c.Add()
	if v.Value() != 2 || p.Value() != 3 {
		t.Fatal("interface copy/share")
	}
	entries := []valuer{c, &c}
	c.Add()
	if entries[0].Value() != 3 || entries[1].Value() != 4 {
		t.Fatal("interface collection")
	}
	b := byValue{counter: 1}
	b.Add()
	bp := byPointer{counter: &c}
	bp.Add()
	if b.Value() != 2 || bp.Value() != 5 {
		t.Fatal("promotion")
	}
	o := outer{}
	if o.Name() != "outer" || o.Inside() != "inner" {
		t.Fatal("not virtual dispatch")
	}
}
func TestNilMethods(t *testing.T) {
	tests := []struct {
		name string
		run  func()
	}{
		{name: "nil embedded pointer", run: func() { var b byPointer; b.Add() }},
		{name: "nil value method selection", run: func() { var p *counter; _ = p.Value }},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			defer func() {
				if recover() == nil {
					t.Fatal("expected panic")
				}
			}()
			tt.run()
		})
	}
}
```

For a cross-package construction check, create `exported/model.go`:
```go
package exported

type hidden struct { Name string }
type Public struct { hidden }
type Pointer struct { *hidden }
func New() hidden { return hidden{Name: "factory"} }
```

Create `export_test.go`:
```go
package design

import (
    "testing"

    "example.com/design/exported"
)

func TestExportedConstruction(t *testing.T) {
    v := exported.New()
    v.Name = "changed"
    p := exported.Public{Name: "literal"}
    if v.Name != "changed" || p.Name != "literal" { t.Fatal("export access") }
}
```

Run `gofmt -w *.go exported/*.go`, `go test -v ./...`, `go vet ./...`, and `go test -race -shuffle=on ./...`. The promoted literal test intentionally requires Go 1.27. Older baseline compatibility is not claimed.

Run each following body independently as `invalid.go` beside the tests, using `go test ./...`; require nonzero exit and the indicated diagnostic, then remove only that scratch file:
- `package design; var _ adder = counter(0)`: pointer receiver / does not implement.
- `package design; func bad() { map[int]counter{0: 1}[0].Add() }`: cannot call pointer method.
- `package design; func makeCounter() counter { return 1 }; func bad() { makeCounter().Add() }`: cannot call pointer method.
- `package design; var _ []valuer = []counter{1}`: cannot use concrete slice as interface slice.
- `package design; type right struct{}; func (right) Name() string { return "" }; type ambiguous struct { left; right }; var _ = ambiguous{}.Name`: ambiguous selector.
- `package design; import "example.com/design/exported"; var _ = exported.Pointer{Name: "bad"}`: promoted key through embedded pointer is rejected.
- `package design; import "example.com/design/exported"; var _ exported.hidden`: unexported name is rejected.

Execution: all positive checks passed on Go 1.27.3, including two recovered nil panic cases and cross-package construction. All seven independent compile-negative cases were rejected with the required diagnostic. No older-toolchain, allocation, speed, or interface-layout guarantee is inferred.

## Chapter 5 evidence
Checked 2026-11-06 against Go 1.27.3, the specification, standard-library documentation/source, Go 1.20 and 1.26 release notes, and pinned Uber sections “Error Wrapping”, “Handle Errors Once”, and public embedding guidance. PDF 91–119 (printed 90–118), sections 5.1–5.13, read in two bounded chunks. All prose/examples below are original. Older toolchains were not run.

| Rule | Printed / PDF pages | Classification | Evidence and decision |
|---|---|---|---|
| SD1: composition and ownership | 90–102, 105–108 / 91–103, 106–109 | Design preference; embedding is language semantics | [Struct types](https://go.dev/ref/spec#Struct_types), [Go review: interfaces](https://go.dev/wiki/CodeReviewComments#interfaces), pinned Uber public embedding. Consumer-owned narrow contracts, concrete implementations, independent dependency parameters. Replace blanket bans on state helpers, aliases, test seams, and interface returns with contract-based choices. Named fields/delegation take precedence over the book's embedded interface wiring. |
| SD2: assignment and assertions | 103–105 / 104–106 | Language guarantee | [Assignability](https://go.dev/ref/spec#Assignability), [type assertions](https://go.dev/ref/spec#Type_assertions). Static interface narrowing, checked dynamic assertions, nil cases. Correct “interfaces do not exist” and omit fixed dispatch/mandatory allocation claims; costs require measurement. |
| SD3: typed nil | 114–115 / 115–116 | Language guarantee; error API preference | [FAQ: nil errors](https://go.dev/doc/faq#nil_error). Return error and literal nil; an error signature alone does not prevent typed-nil returns. Successful assertion can yield a nil pointer. |
| SD4: structured errors and retries | 108–114 / 109–115 | API guarantee; design preference; deprecated behavior | [errors](https://pkg.go.dev/errors), [net.Error](https://pkg.go.dev/net#Error). Replace equality/direct type switches with Is/As across wrappers; do not parse messages. Omit Temporary-based unbounded retry example: Temporary is deprecated and timeout is not retry safety. Logging/termination are boundary policy, not universal handling steps. |
| SD5: wrapping and trees | 115–118 / 116–119 | Version-dependent APIs; API design preference | [Go 1.13 errors](https://go.dev/blog/go1.13-errors), [Go 1.20 wrapping](https://go.dev/doc/go1.20#errors), [errors.Unwrap](https://pkg.go.dev/errors#Unwrap), [Go 1.26 errors](https://go.dev/doc/go1.26#errors). Is/As/%w since 1.13; Join/multiple wrapping since 1.20; AsType since 1.26. Replace pkg/errors and linear Cause helper with standard tree inspection. Document first-match order and matching exposure. Keep compatible As; AsType is an optional version-gated typed alternative, not a policy conflict with Uber. No speed claim retained. |

### Chapter 5 reproducible original checks
Create a disposable directory with `mktemp -d`, run `go mod init example.com/design`, copy the callback test from the design reference to `callbacks_test.go`, and copy this block to `design_test.go`. The AsType check requires Go 1.26+; this run only establishes Go 1.27.3 behavior.

```go
package design

import (
 "errors"
 "fmt"
 "testing"
)

type reader interface { Read() string }
type readCloser interface { reader; Close() error }
type source struct{}
func (source) Read() string { return "data" }
func (source) Close() error { return nil }
type readOnly struct{}
func (readOnly) Read() string { return "only" }
type detailError struct { key string }
func (e *detailError) Error() string { return "bad key: " + e.key }
func success() error { return nil }
func typedNil() error { var e *detailError; return e }

func TestConsumerContracts(t *testing.T) {
 var both readCloser = source{}
 var narrow reader = both
 if narrow.Read() != "data" { t.Fatal("narrow assignment") }
 if _, ok := narrow.(readCloser); !ok { t.Fatal("behavior assertion") }
 narrow = readOnly{}
 if got, ok := narrow.(source); ok || got != (source{}) { t.Fatal("failed concrete assertion") }
 if _, ok := narrow.(readCloser); ok { t.Fatal("unsupported behavior") }
 var empty reader
 if _, ok := empty.(readCloser); ok { t.Fatal("nil interface assertion") }
}

func TestErrorContracts(t *testing.T) {
 sentinel := errors.New("missing")
 first, second := &detailError{"first"}, &detailError{"second"}
 wrapped := fmt.Errorf("lookup: %w", sentinel)
 hidden := fmt.Errorf("lookup: %v", sentinel)
 joined := errors.Join(nil, wrapped, first, second)
 if !errors.Is(joined, sentinel) || errors.Is(hidden, sentinel) {
  t.Fatal("exposure contract")
 }
 var detail *detailError
 if !errors.As(joined, &detail) || detail != first { t.Fatal("first match") }
 if got, ok := errors.AsType[*detailError](joined); !ok || got != first {
  t.Fatal("typed first match")
 }
 var behavior interface { Error() string }
 if !errors.As(joined, &behavior) { t.Fatal("behavior assertion") }
 if errors.Unwrap(joined) != nil || errors.Unwrap(wrapped) != sentinel {
  t.Fatal("single versus multi unwrap")
 }
 if errors.Join(nil, nil) != nil || success() != nil { t.Fatal("nil success") }
 e := typedNil()
 detail = first
 if e == nil || !errors.As(e, &detail) || detail != nil {
  t.Fatal("typed nil must match with nil value")
 }
 if errors.Join(e) == nil { t.Fatal("typed nil discarded") }
 if _, ok := errors.AsType[*detailError](hidden); ok { t.Fatal("hidden type") }
 var absent *detailError
 if errors.As(wrapped, &absent) || errors.Is(nil, sentinel) { t.Fatal("absent match") }
}

func TestInvalidAssertions(t *testing.T) {
 tests := []struct { name string; run func() }{
  {"unchecked", func() { var r reader = readOnly{}; _ = r.(readCloser) }},
  {"nil interface", func() { var r reader; _ = r.(readCloser) }},
  {"nil As target", func() { var target any = (*detailError)(nil); errors.As(errors.New("x"), target) }},
 }
 for _, tt := range tests {
  t.Run(tt.name, func(t *testing.T) {
   defer func() { if recover() == nil { t.Fatal("wanted panic") } }()
   tt.run()
  })
 }
}
```

Run `gofmt -w *.go`, `go test -v ./...`, `go vet ./...`, and `go test -race -shuffle=on ./...`.
Compile each body independently as `invalid.go` beside these tests using `go test ./...`; require nonzero status with the indicated diagnostic, then remove only that scratch file:
- `package design; var r reader = source{}; var _ readCloser = r`: missing Close; dynamic implementation cannot widen the static contract.
- `package design; type base struct{}; type outer struct { base }; var _ base = outer{}`: outer is not assignable to embedded base.

The tests cover narrowing, concrete/behavior assertion failures, nil assertions, three recovered panic cases, typed-nil success hazards, wrapping exposure, absent matches, Join nil filtering, first-match order, As/AsType agreement, and Unwrap's single-error limitation. No network, retries, allocation or older-version compatibility is exercised.

Execution outcome: all positive checks, three recovered panic cases, and both compile-negative cases passed on Go 1.27.3. The initial invalid-As runtime test was rejected by go vet's static target check before execution. Passing the deliberately nil target through an `any` variable exercises the runtime contract without a statically invalid call; no vet check was disabled. Full positive, vet, and race checks then passed.

## Chapter 6 evidence
Checked 2026-11-06 with Go 1.27.3 darwin/arm64. PDF hash matched; printed 119–150 / PDF 120–151 read in two bounded extractions, including all sections 6.1–6.11.10. Rules are in references/concurrency.md; core safeguards are retained. No older toolchain, Linux quota experiment, timer-GC measurement, or throughput comparison was run.

| Rule | Source sections | Classification | Decision and primary evidence |
|---|---|---|---|
| CC1: scheduling and completion | 6.1–6.3 | Runtime/API contract; scheduler internals are implementation detail | [runtime.GOMAXPROCS](https://pkg.go.dev/runtime#GOMAXPROCS), [Go 1.25 defaults](https://go.dev/doc/go1.25#container-aware-gomaxprocs), [WaitGroup.Go](https://pkg.go.dev/sync#WaitGroup.Go). Replace thread-count/single-thread claims and universal manual CPU tuning. WaitGroup.Go is Go 1.25+; retain Add-before-launch fallback. Omit timing/output predictions and sleep-based joins. |
| CC2: data and logical races | 6.4–6.6, 6.8 | Memory-model guarantee; detector coverage/overhead depends on workload | [Memory model](https://go.dev/ref/mem), [race detector usage, coverage and overhead](https://go.dev/doc/articles/race_detector). Correct split-lock lost updates: logical race, not unsynchronized data access. Detector report is not a recoverable panic; omit fixed 20% overhead and guaranteed detection claims. |
| CC3: synchronization policy | 6.7–6.9 | API guarantees; wrapper choice and RWMutex use are design preferences | [sync](https://pkg.go.dev/sync#RWMutex), [sync/atomic](https://pkg.go.dev/sync/atomic), [pinned Uber atomic policy](https://github.com/uber-go/guide/blob/1d60a91aa5e87d443002e23c21903c49489dbde5/style.md#use-gouberorgatomic). Standard typed atomics exist since Go 1.19; Uber's raw-types-only rationale is obsolete, but its wrapper recommendation remains valid. Retain Uber policy, not a silent standard-library replacement. No dependency added. No genuine incompatible design recommendation found. |
| CC4: channel protocols | 6.10, 6.11.1, 6.11.3 | Language/memory-model guarantees | [Channel communication](https://go.dev/ref/mem#chan), [channel types](https://go.dev/ref/spec#Channel_types), [close](https://go.dev/ref/spec#Close), [select](https://go.dev/ref/spec#Select_statements). Replace nanosecond/receive-before-send language with happens-before relations; buffered channels also synchronize and support cancelable operations. Handoff does not prove downstream completion. |
| CC5: bounded patterns | 6.11, 6.11.2, 6.11.4–6.11.8 | Resource/lifetime design preferences | Memory-model channel semaphore rule and pinned Uber goroutine ownership policy. Bound admission before launch, not only work inside already-created goroutines. Join workers; make drop/rejection observable. Correct fixed-size literal example: index 2000 implies length 2001, not 2000. Do not carry its arbitrary worker/buffer sizes forward. |
| CC6: cancellation, retries and timers | 6.11.6, 6.11.9–6.11.10 | API guarantees; retry policy depends on operation | [context](https://pkg.go.dev/context#WithCancel), [time.NewTimer](https://pkg.go.dev/time#NewTimer), [Stop](https://pkg.go.dev/time#Timer.Stop), [Reset](https://pkg.go.dev/time#Timer.Reset), [Go 1.23 timers](https://go.dev/doc/go1.23#timer-changes), [Go 1.27 removal](https://go.dev/doc/go1.27). Replace unconditional timer retention/drain recipes. Go 1.23–1.26 compatibility settings matter; 1.27 removes asynctimerchan. Cancel promptly; cancellation is not a join or forced I/O termination. Correct milliseconds/seconds typo, adapter lifetime, swallowed errors and unclosed HTTP body; do not reproduce the network example. |

Official release, memory-model, race-detector, and specification pages were downloaded and relevant sections read. Installed Go 1.27.3 package documentation was read for GOMAXPROCS, WaitGroup.Go, RWMutex, atomic.Bool, context.WithCancel, and timer Stop/Reset/NewTimer. The pinned Uber atomic section was downloaded and compared directly. Web-search summaries were discovery only. API existence does not mandate a style-policy change.

### Original Chapter 6 checks
In a disposable `mktemp -d` module with `go.mod` declaring `module example.com/concurrency` and `go 1.27`, copy the reference's complete Go block to `invariant_test.go` and the following block to `mechanics_test.go`. The standard atomic in this audit test checks API semantics; it does not change Uber policy for project code.

```go
package concurrency

import (
 "context"
 "sync"
 "sync/atomic"
 "testing"
 "time"
)

func TestCounters(t *testing.T) {
 var mu sync.Mutex
 var count int
 var scalar atomic.Int64
 var wg sync.WaitGroup
 for i:=0;i<4;i++ { wg.Go(func(){ for j:=0;j<100;j++ { mu.Lock(); count++; mu.Unlock(); scalar.Add(1) } }) }
 wg.Wait()
 if count!=400 || scalar.Load()!=400 { t.Fatal(count, scalar.Load()) }
}

func TestChannelStates(t *testing.T) {
 var nilCh chan int
 select { case <-nilCh: t.Fatal("nil ready"); default: }
 ch:=make(chan int,1); ch<-7; close(ch)
 if v,ok:=<-ch; v!=7 || !ok {t.Fatal(v,ok)}
 if v,ok:=<-ch; v!=0 || ok {t.Fatal(v,ok)}
 for name, f:=range map[string]func(){"send closed":func(){ch<-1},"close closed":func(){close(ch)},"close nil":func(){close(nilCh)}} {
 t.Run(name,func(t *testing.T){ defer func(){if recover()==nil {t.Fatal("no panic")}}(); f() })
 }
 full:=make(chan int,1); full<-1
 select {case full<-2:t.Fatal("overflow admitted"); default:}
}

func TestBoundedPoolAndCancel(t *testing.T) {
 for _,capacity:=range []int{0,2} {
 jobs:=make(chan int,capacity)
 var wg sync.WaitGroup
 var mu sync.Mutex
 count,active,peak:=0,0,0
 for i:=0;i<3;i++ { wg.Go(func(){for range jobs { mu.Lock();active++;if active>peak {peak=active};mu.Unlock();mu.Lock();active--;count++;mu.Unlock() }}) }
 for i:=0;i<20;i++ {jobs<-i};close(jobs);wg.Wait()
 if count!=20 || peak>3 {t.Fatal(count,peak)}
 ctx,cancel:=context.WithCancel(context.Background());cancel()
 blocked:=make(chan int,capacity);for i:=0;i<capacity;i++ {blocked<-i}
 select {case blocked<-1:t.Fatal("canceled blocked send admitted");case <-ctx.Done():}
 }
}

func TestAbandonedResultAndAdapter(t *testing.T) {
 ctx,cancel:=context.WithCancel(context.Background())
 result:=make(chan int,1);release:=make(chan struct{});done:=make(chan struct{})
 go func(){defer close(done);<-release;result<-1}()
 cancel();<-ctx.Done();close(release);<-done
 if <-result!=1 {t.Fatal("lost result")}
 for _,stopFirst:=range []bool{true,false} {
 stop:=make(chan struct{});ctx,cancel:=context.WithCancel(context.Background());joined:=make(chan struct{})
 go func(){defer close(joined);select {case <-stop:cancel();case <-ctx.Done():}}()
 if stopFirst {close(stop);<-ctx.Done()} else {cancel()};cancel();<-joined
 }
}

func TestModernTimerAndWaitGroupMisuse(t *testing.T) {
 timer:=time.NewTimer(time.Hour)
 if cap(timer.C)!=0 {t.Fatal("not synchronous")}
 if !timer.Stop() {t.Fatal("inactive timer")}
 select {case <-timer.C:t.Fatal("stale stopped value");default:}
 timer.Reset(time.Hour);timer.Stop()
 t.Run("negative count",func(t *testing.T){defer func(){if recover()==nil {t.Fatal("no panic")}}();var wg sync.WaitGroup;wg.Done()})
}
```

Run `gofmt -w .`, `go test -v -timeout=30s ./...`, `go vet ./...`, and `go test -race -shuffle=on -timeout=30s ./...`. All passed. Tests cover complete versus split invariants, WaitGroup.Go completion, scalar atomic increments, nil/closed/draining channels, overload rejection, bounded workers, canceled blocked sends with zero/two-slot buffers, one finite abandoned result, both legacy-adapter exits, synchronous timer stop/reset, and four recovered misuse panics. Timer GC and old compatibility modes are documentation-backed, not measured.

For a deliberate detector-negative case, add this separate scratch file, run `go test -race -run=TestRacy -count=1 .`, require nonzero status and `DATA RACE`, then remove that scratch file. This check passed as an expected failure, while the forced logical-race test passed under the detector.

```go
package concurrency
import ("sync"; "testing")
func TestRacy(t *testing.T) {
 var n int
 var wg sync.WaitGroup
 wg.Add(2)
 for i := 0; i < 2; i++ {
  go func() { defer wg.Done(); for j := 0; j < 1000; j++ { n++ } }()
 }
 wg.Wait()
 t.Log(n)
}
```

## Chapter 7 modernization evidence
Checked 2026-11-06. PDF 152–163 (printed 151–162), sections 7.1–7.5, read as one bounded extraction after hash verification. Walkthroughs 7.3–7.4 remain excluded; their reusable HTTP mechanics were independently checked against package contracts, not copied. Official downloads and local toolchain report Go 1.27.3. Older toolchains were not run.

| Rule | Printed / PDF pages | Classification | Decision and primary evidence |
|---|---|---|---|
| TS1: tests and failures | 151–153 / 152–154 | API guarantee; isolation/design preference | [testing](https://pkg.go.dev/testing), including test naming, external test packages and FailNow. Retain error checks, supported API testing and useful diagnostics. Do not define unit/integration isolation solely by package boundaries or require public-network calls. |
| TS2: tables | 153–154 / 154–155 | Style/design preference | Pinned [Uber Test Tables](https://github.com/uber-go/guide/blob/1d60a91aa5e87d443002e23c21903c49489dbde5/style.md#test-tables): tests/tt, give/want, named subtests and simple assertions. Preserve existing core policy; include negative paths. |
| TS3: parallel subtest ownership | 160–162 / 161–163 | Version-dependent language semantics; testing API guarantee | [Go loop change](https://go.dev/blog/loopvar-preview), [spec range clause](https://go.dev/ref/spec#For_range), [T.Run](https://pkg.go.dev/testing#T.Run), [T.Parallel](https://pkg.go.dev/testing#T.Parallel), [T.Cleanup](https://pkg.go.dev/testing#T.Cleanup). Qualify book and pinned Uber unconditional rebinding advice: declared loop variables are per iteration with Go 1.22+ language semantics, assigned variables are not. Parent cleanup outlives parallel children; parent defer does not. No new style-policy conflict. |
| TS4: HTTP test boundaries | 154–159 / 155–160 (walkthroughs omitted) | API guarantee; isolation preference | [httptest.NewServer](https://pkg.go.dev/net/http/httptest#NewServer), [NewRecorder](https://pkg.go.dev/net/http/httptest#NewRecorder), [ResponseRecorder.Result](https://pkg.go.dev/net/http/httptest#ResponseRecorder.Result), [ResponseWriter](https://pkg.go.dev/net/http#ResponseWriter). Retain existing core choice of server vs recorder; add explicit server/body cleanup, request bounds, fresh mux, and committed-header assertions. Do not reproduce RSS/JSON walkthroughs, inverted assertions, global init registration, or headers set after WriteHeader. |

Read the fetched official loop article and pinned Uber sections. Checked testing/httptest contracts with local Go 1.27.3 `go doc` (Run, Parallel, Cleanup, Fatal, NewServer, ResponseRecorder.Result), not the search summary. In particular, NewServer requires caller cleanup; it does not implicitly register test cleanup. No new dependencies or baseline increase.

### Original testing examples and negative checks
Copy the reference's complete Go block to `routing_test.go` and the following block to `mechanics_test.go` in a `mktemp -d` module (`module example.com/ch7`, `go 1.27`). Run `go test -v -timeout=30s ./...`, `go vet ./...`, `go test -race -shuffle=on -count=5 -timeout=30s ./...`, and `go test -run='^TestRoutes$/^missing$' -v ./...`. All passed with go1.27.3 darwin/arm64. Tests cover 200/404, body/header checks, real loopback client transport, shared-server cleanup after parallel children, late-header exclusion, and declared versus assigned loop identity. These are original examples, not book listings.

Negative controls, run separately and then restored:
- Replace `t.Cleanup(server.Close)` with `defer server.Close()` in TestClientCleanup; `go test -run='^TestClientCleanup$' -count=1 -timeout=30s ./...` must fail with connection refused. Observed expected failure, not a passing integration.
- Change the missing-route wantCode from StatusNotFound to StatusOK; `go test -run='^TestRoutes$/^missing$' -count=1 ./...` must fail with `status = 404, want 200`. Observed expected failure. Restored examples passed shuffled race testing again.
- Go 1.27.3 tests demonstrate current language behavior only; pre-1.22 rebinding advice is supported by official semantics, not an older-toolchain run. No claim about remote-service integration or TLS is made.

```go
package routing_test

import (
 "io"
 "net/http"
 "net/http/httptest"
 "testing"
 "time"
)

func TestClientCleanup(t *testing.T) {
 server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
  if r.URL.Path != "/ready" { http.NotFound(w, r); return }
  w.Header().Set("Content-Type", "text/plain")
  _, _ = io.WriteString(w, "ready")
 }))
 t.Cleanup(server.Close)
 client := server.Client()
 client.Timeout = time.Second
 for _, tt := range []struct{name, path string; want int}{
  {"ready", "/ready", 200}, {"missing", "/missing", 404},
 } {
  t.Run(tt.name, func(t *testing.T) {
   t.Parallel()
   response, err := client.Get(server.URL + tt.path)
   if err != nil { t.Fatal(err) }
   defer response.Body.Close()
   if response.StatusCode != tt.want { t.Errorf("status = %d, want %d", response.StatusCode, tt.want) }
  })
 }
}

func TestHeaderCommit(t *testing.T) {
 recorder := httptest.NewRecorder()
 recorder.WriteHeader(http.StatusOK)
 recorder.Header().Set("X-Late", "ignored")
 response := recorder.Result()
 defer response.Body.Close()
 if response.Header.Get("X-Late") != "" { t.Fatal("late header reached committed response") }
}

func TestLoopIdentity(t *testing.T) {
 seen := make([]*int, 0, 2)
 for _, value := range []int{1, 2} { seen = append(seen, &value) }
 if seen[0] == seen[1] || *seen[0] != 1 { t.Fatal("declared variables not per iteration") }
 var reused int
 seen = seen[:0]
 for _, reused = range []int{1, 2} { seen = append(seen, &reused) }
 if seen[0] != seen[1] || *seen[0] != 2 { t.Fatal("assigned variable not reused") }
}
```

## Chapter 8 modernization evidence
Checked 2026-11-06; printed 163–173 / PDF 164–174 read in two bounded chunks, sections 8.1–8.3. Local and package-doc baseline: Go 1.27.3. Earlier toolchains untested; do not infer compatibility from this run. Destination: references/testing-and-benchmarking.md. Compared with pinned Uber performance guidance: no policy conflict; retain hot-path measurement, not illustrative timing rankings.

| Rule | Source pages (printed / PDF) | Classification | Decision and primary evidence |
|---|---|---|---|
| BM1: benchmark loops and timer boundaries | 163–166 / 164–167 | Versioned API contract; compiler implementation detail | [testing benchmarks](https://pkg.go.dev/testing#hdr-Benchmarks), [B.Loop](https://pkg.go.dev/testing#B.Loop), [ResetTimer](https://pkg.go.dev/testing#B.ResetTimer), [Go blog](https://go.dev/blog/testing-b-loop). Prefer Loop on Go 1.24+; keep b.N for older baselines. Exact syntax protects values, not correctness. The blog's Go 1.24 no-inlining mechanism is not a permanent guarantee; Go 1.27.3 docs describe KeepAlive transformation. Omit fixed calibration multipliers/counts, Sprint/Sprintf rankings, and blanket sink requirements. |
| BM2: named sub-benchmarks | 167 / 168 | API contract; workload-design preference | [B.Run](https://pkg.go.dev/testing#B.Run), [RunParallel](https://pkg.go.dev/testing#B.RunParallel), [benchmark format](https://go.dev/design/14313-benchmark-format). Use independent cases and anchored leaf selection. Correct suffix interpretation to GOMAXPROCS, not thread/worker count. |
| BM3: validate and compare | 168–173 / 169–174 | Workload-dependent performance; measurement practice | [benchstat](https://pkg.go.dev/golang.org/x/perf/cmd/benchstat), [B.Loop blog](https://go.dev/blog/testing-b-loop), [slice expressions](https://go.dev/ref/spec#Slice_expressions). Validate results and reset mutable input; exclude reset only when outside the defined operation. Repeated, comparable samples on an idle machine; isolate suspicious cases and interleave A/B runs. Omit speed ratios, merge-sort verdict, slicing-implies-allocation claim, and inferred goroutine-cleanup cause without measurement. |

Primary pages were downloaded and relevant sections read, including benchstat noise, confidence, and multiple-testing cautions. Statistical significance is not practical value or proof of equivalence. These documentation changes make no production performance claim.

### Original benchmark validation
Copy both Go blocks from the reference into separate test files in a disposable module (module example.com/benchchecks, go 1.27). Add this independent loop-mechanics check as loops_test.go:

```go
package routing_test

import (
 "strconv"
 "testing"
)

var _sink string

func TestBenchmarkLoops(t *testing.T) {
 calls, iterations := 0, 0
 result := testing.Benchmark(func(b *testing.B) {
  calls++
  for b.Loop() { iterations++; strconv.Itoa(iterations) }
 })
 if calls != 1 || iterations != result.N || result.N == 0 {
  t.Fatalf("calls=%d iterations=%d N=%d", calls, iterations, result.N)
 }
 legacy := testing.Benchmark(func(b *testing.B) {
  var text string
  b.ResetTimer()
  for i := 0; i < b.N; i++ { text = strconv.Itoa(i) }
  b.StopTimer()
  _sink = text
 })
 if legacy.N == 0 || _sink != strconv.Itoa(legacy.N-1) {
  t.Fatalf("legacy N=%d result=%q", legacy.N, _sink)
 }
}
```

On go1.27.3 darwin/arm64: go test -v -timeout=30s ./..., go vet ./..., and go test -race -shuffle=on -count=2 -timeout=60s ./... passed. Run timing separately from race instrumentation. Both benchmark cases passed go test -run='^$' -bench=. -benchtime=1x. Anchored mixed-case selection produced only that leaf.

Collected the identical mixed-case workload twice with go test -run='^$' -bench='^BenchmarkSort$/^mixed$' -benchmem -benchtime=10x -count=10 into before.txt and after.txt. Installed benchstat into the disposable module's bin directory with golang.org/x/perf/cmd/benchstat@v0.0.0-20261009192801-be2c69fb417e and ran bin/benchstat before.txt after.txt successfully. This is a parser/comparison smoke check with small samples, not an isolated A/B performance experiment or improvement claim.

Negative control: replace slices.Sort(work) in the reference benchmark with _ = work; go test -run='^$' -bench='^BenchmarkSort$/^mixed$' -benchtime=1x must fail with the unsorted result. It returned 1. Restore the sort and rerun both leaf benchmarks; passed. No performance threshold is asserted. Dependency installation stayed outside the repository; source npm dependencies remain installed for independent verification.

## Chapter 9 modernization evidence
Checked 2026-11-06; printed 174–199 / PDF 175–200, sections 9.1–9.10 read in two bounded chunks. Hash matched. Go 1.27.3 darwin/arm64; older toolchains untested. Destination: references/generics.md. No conflict with pinned Uber/core guidance: retain minimal constraints and built-in containers.

| Rule | Printed / PDF pages | Classification | Decision and primary evidence |
|---|---|---|---|
| GN1: instantiation and zero values | 174–179 / 175–180 | Language guarantee, Go 1.18+ | [Type definitions](https://go.dev/ref/spec#Type_definitions), [Instantiations](https://go.dev/ref/spec#Instantiations), [Type inference](https://go.dev/ref/spec#Type_inference), [Variables](https://go.dev/ref/spec#Variables). Explicit type arguments in literals replace draft inference. Function inference is not inferred from an expected result type. Retain var zero T, receiver and field type relationships; omit linked-list walkthrough and specialization promises. |
| GN2: operations and constraints | 180–185 / 181–186 | Language guarantee; versioned API contract | [General interfaces](https://go.dev/ref/spec#General_interfaces), [Constraint satisfaction](https://go.dev/ref/spec#Satisfying_a_type_constraint), [Selectors](https://go.dev/ref/spec#Selectors), [cmp.Ordered](https://pkg.go.dev/cmp#Ordered). Replace draft type lists with unions/~; distinguish intersections and constraint-only interfaces. Comparable accepts interface arguments since Go 1.20, but dynamic comparison can panic. cmp requires Go 1.21+; includes strings, with a NaN ordering policy needed. Reject common-field selectors; use concrete access, callbacks or meaningful methods. Multiple type parameters do not validate runtime lengths. |
| GN3: named slices and methods | 186–188 / 187–189; modern supplement | Language guarantee; design preference | [Underlying types](https://go.dev/ref/spec#Underlying_types), [Method declarations](https://go.dev/ref/spec#Method_declarations), [Go 1.27 language changes](https://go.dev/doc/go1.27#language), [slices.Clone](https://pkg.go.dev/slices#Clone). S ~[]E preserves type identity, not storage isolation. Receiver parameters work in Go 1.18+; independent method parameters require Go 1.27. Interface methods cannot declare type parameters or be implemented by generic methods. Use package-level generic functions on earlier baselines. |
| GN4: channels and keyed storage | 189–199 / 190–200 | Design preference; language guarantee | [Channel types](https://go.dev/ref/spec#Channel_types), [Map types](https://go.dev/ref/spec#Map_types). Typed payloads do not supply cancellation, bounds or lifecycle ownership. Reuse concurrency reference instead of sample pools/timeouts that ignore cancellation. Prefer map[K]V; omit fixed-bucket hash implementation with unvalidated size/hash bounds, negative-key modulo and growth contracts. No generic speed claim retained. |

Downloaded current specification, Go 1.27 release notes and cmp docs and read relevant sections. Original tests confirm forbidden field selectors and literal inference. Prefer standard slices.Clone when its contract fits; the original clone illustrates explicit nil/empty and shallow storage semantics, not a requirement to replace library code.

### Original generics validation
Create a disposable mktemp -d module outside Git, with module example.com/generics and go 1.27. Copy both Go blocks from references/generics.md into example0.go and example1.go. Add generics_test.go:
```go
package generics

import (
	"cmp"
	"math"
	"reflect"
	"strconv"
	"testing"
)

type counts []int

func (c counts) Total() int {
	n := 0
	for _, v := range c {
		n += v
	}
	return n
}

type count int

func add[T ~int | ~int64](a, b T) T     { return a + b }
func equal[T comparable](a, b T) bool   { return a == b }
func ordered[T cmp.Ordered](a, b T) int { return cmp.Compare(a, b) }
func TestCollections(t *testing.T) {
	var nilInput counts
	if Clone(nilInput) != nil {
		t.Fatal("nil lost")
	}
	empty := Clone(counts{})
	if empty == nil || len(empty) != 0 {
		t.Fatal("empty contract")
	}
	input := counts{2, 3}
	output := Clone(input)
	if output.Total() != 5 {
		t.Fatal(output)
	}
	output[0] = 9
	if input[0] != 2 {
		t.Fatal("alias")
	}
	ptr := new(int)
	refs := Clone([]*int{ptr})
	*refs[0] = 7
	if *ptr != 7 {
		t.Fatal("not shallow")
	}
	q := Queue[*int]{}
	if v, ok := q.Pop(); ok || v != nil {
		t.Fatal("empty")
	}
	storage := []*int{ptr}
	q.items = storage
	if v, ok := q.Pop(); !ok || v != ptr || storage[0] != nil {
		t.Fatal("pop/clear")
	}
	if v, ok := q.Pop(); ok || v != nil {
		t.Fatal("drained")
	}
	if v, ok := (&Queue[string]{}).Pop(); ok || v != "" {
		t.Fatal("zero")
	}
	mapped := Batch[int]{2, 3}.Map(strconv.Itoa)
	if !reflect.DeepEqual(mapped, Batch[string]{"2", "3"}) {
		t.Fatal(mapped)
	}
	if Batch[int](nil).Map(strconv.Itoa) != nil {
		t.Fatal("map nil")
	}
	if (Batch[int]{}).Map(strconv.Itoa) == nil {
		t.Fatal("map empty")
	}
	f := Batch[int]{4}.Map[string]
	if f(strconv.Itoa)[0] != "4" {
		t.Fatal("method value")
	}
	if add(count(2), count(3)) != 5 || ordered(count(2), count(3)) != -1 {
		t.Fatal("constraints")
	}
	if ordered(math.NaN(), 1.0) != -1 {
		t.Fatal("NaN policy")
	}
	m := map[string]int{}
	m["x"] = 1
	m["x"] = 2
	if m["x"] != 2 {
		t.Fatal("overwrite")
	}
	if v, ok := m["absent"]; ok || v != 0 {
		t.Fatal("missing")
	}
}
func TestDynamicComparablePanic(t *testing.T) {
	defer func() {
		if recover() == nil {
			t.Fatal("wanted panic")
		}
	}()
	equal[any]([]int{1}, []int{1})
}
```

Go 1.27.3: gofmt -w *.go, go test -v -timeout=30s ./..., go vet ./..., and go test -race -shuffle=on -count=2 -timeout=60s ./... passed. Initial fixture had an unparenthesized composite literal in an if condition; parser rejected it. Parenthesized the fixture and reran successfully; assertions unchanged.

Run this as negative.py with python3 negative.py in that module. All ten independent compile-negative cases rejected; go 1.26 language directive rejected independent method parameters. This tests a language gate with the Go 1.27 compiler, not older-toolchain compatibility. Restored go test ./... passed.
```python
from pathlib import Path
import subprocess
cases = {
 'draft': 'type C interface { type int, int64 }',
 'literal': 'var _ = Queue{ }',
 'field': 'type A struct{ ID int }; type B struct{ ID int }; func id[T A|B](v T) int { return v.ID }',
 'constraint_value': 'type C interface{ ~int }; var _ C',
 'exact': 'type Number int; func f[T int](v T) {}; func use(){ f(Number(1)) }',
 'slice_key': 'var _ map[[]int]string',
 'zero': 'func zero[T any]() T { return T{} }',
 'interface_method': 'type I interface { Convert[T any](T) T }',
 'inference': 'func result[T any]() T { var z T; return z }; var _ int = result()',
 'missing_method': 'type C interface{ String() string }; func f[T C](v T) {}; func use(){f(1)}',
}
for name, body in cases.items():
 p=Path('negative.go'); p.write_text('package generics\n'+body+'\n')
 run=subprocess.run(['go','test','-run=^$','./...'],capture_output=True,text=True)
 p.unlink()
 if run.returncode==0: raise SystemExit('unexpected success: '+name)
 print(name+': rejected: '+run.stderr.splitlines()[1])
# No older toolchain compatibility claim: test language gate using the same compiler.
p=Path('go.mod'); original=p.read_text(); p.write_text(original.replace('go 1.27','go 1.26'))
run=subprocess.run(['go','test','-run=^$','./...'],capture_output=True,text=True)
p.write_text(original)
assert run.returncode!=0 and 'go1.27' in run.stderr, run.stderr
print('go 1.26 directive: independent method parameters rejected')
```
