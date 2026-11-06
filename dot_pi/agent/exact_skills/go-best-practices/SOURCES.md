# Go guidance sources
## Source identity and precedence
- Ultimate Go Notebook, First Edition, Version 1.0, William Kennedy with Hoanh An (2021), Patch 39. Local PDF: 352 pages, 15,697,515 bytes; SHA-256 `12068570744faf03d4bf1e4c8880655e0baff281013a0c944a7b8d7505c66b13`. PDF pages 2–351 map to printed pages 1–350; front/back covers are unnumbered.
- [Uber Go Style Guide](https://github.com/uber-go/guide/blob/1d60a91aa5e87d443002e23c21903c49489dbde5/style.md), revision `1d60a91aa5e87d443002e23c21903c49489dbde5`, [Apache-2.0](https://github.com/uber-go/guide/blob/1d60a91aa5e87d443002e23c21903c49489dbde5/LICENSE). Originally created by Prashant Varanasi and Simon Newton, expanded by contributors. The core skill condenses, reorganizes, and supplements that guide.
- Claude marketplace `atom/skills/go-best-practices/SKILL.md`, revision `b937ce451cf47154af8566b6ad7776a7749fc810`.
- Repository contracts and supported toolchains constrain application. Verified language semantics/API contracts override inaccurate source claims. Uber wins style conflicts with the marketplace and book. Escalate a genuine modern-design/Uber policy conflict.
- Store concise original guidance, attribution, and evidence only. Do not store the PDF, raw extraction, substantial excerpts, copied diagrams, or `VENDOR.md`.

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
