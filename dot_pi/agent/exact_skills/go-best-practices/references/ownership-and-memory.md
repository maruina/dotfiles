# Ownership and memory
Use this reference when choosing value vs. pointer semantics, handling slices, strings, or maps, diagnosing compiler escapes, validating numeric conversions or constants, or inspecting struct layout.

## Value copies vs. shared targets
- Arguments, assignments, and returns copy values. Passing a pointer copies the pointer, not its target; mutating `*p` updates the shared target, while reassigning `p` only updates the local pointer variable.
- Copying a struct or array copies its fields or elements shallowly. Any pointer, slice, map, channel, or function field inside the copy still aliases the same underlying target. Define which caller or struct owns mutation of that referenced data.
- Choose value semantics for small, immutable, or independent values. Choose pointer semantics for shared identity, in-place mutation, types containing synchronization primitives, or structs whose copy cost is measured as significant.
- Pointers share identity, not synchronization. Define lock or channel ownership before sharing mutable pointees across goroutines.

```go
package ownership

import "fmt"

type record struct {
	count int
	label *int
}

func Example() {
	label := 3
	original := record{count: 1, label: &label}
	copied := original
	copied.count = 9
	*copied.label = 8 // mutates shared pointee

	pointer := &original
	alias := pointer
	alias.count++
	alias = &copied // retargets local pointer only
	alias.count++

	fmt.Println(original.count, copied.count, *original.label)
	// Output: 2 10 8
}
```

## Escape analysis and lifetime
- Returning a pointer to a local variable is valid Go; the compiler places the variable on the heap if its lifetime outlives the stack frame.
- Heap allocation is a compiler decision, not a syntax rule:
  - Returning a pointer or converting a value to an interface can stay on the stack when the compiler inlines the call or devirtualizes the interface.
  - A local variable that never escapes its function can still allocate on the heap if it is too large for the stack frame or has a runtime-computed size above the compiler's threshold.
- Choose clear value or pointer contracts first, then inspect compiler placement on the real build with `go build -gcflags='-m' ./...` and measure allocations with `go test -bench=. -benchmem`.
- Do not pass pointers to `fmt.Println` or logging functions to "check" stack addresses; passing the pointer to an interface parameter often causes the escape you are trying to observe.
- Garbage collection reclaims memory, not operating-system descriptors. Always close files, network connections, and cursors explicitly.

## Numeric conversions and constants
- `int` and `uint` are 32-bit or 64-bit depending on target architecture. Use explicit-width types (`int32`, `int64`, `uint64`) for wire formats, persisted fields, and cross-platform arithmetic.
- Runtime integer narrowing (`int64` to `int32`, `uint16` to `uint8`) truncates high bits without error. Float-to-integer conversion truncates the fraction and is undefined/implementation-dependent on overflow or `NaN`/`Inf`. Validate bounds before narrowing.
- Untyped numeric constants have arbitrary precision in the language specification (compilers must support at least 256 bits for integers and mantissas). Overflow is checked at compile time when an untyped constant is assigned to a typed variable or defaults to `int`.
- Untyped integer constant division truncates toward zero (`7 / 2` is `3`, whereas `7 / 2.0` is `3.5`).
- `iota` is the zero-based line index of the `const` specification within a `const (...)` block, not a count of identifiers on the same line. Omitted expressions repeat the previous specification's expression list.

## Struct layout and alignment
- A struct's size includes internal padding between fields and trailing padding so the struct's total size is a multiple of its largest field alignment (`unsafe.Alignof`).
- Inspect target-specific layout with `unsafe.Sizeof`, `unsafe.Alignof`, and `unsafe.Offsetof`. `unsafe.Sizeof` measures only the top-level struct header, not backing arrays or pointees.
- Keep struct fields in domain-logical order by default. Reorder fields (typically largest alignment to smallest) only when heap profiles or high-cardinality slice allocations show that padding bytes materially affect memory footprint or throughput.

## Slice aliasing, capacity, and retention
- An array type `[N]T` includes its length `N` and copies all elements on assignment. A slice `[]T` is a descriptor (pointer, length, capacity); assigning or slicing a slice shares the underlying array.
- `make([]T, n)` initializes `n` zero-valued elements (`len == n`); appending adds elements starting at index `n`. Use `make([]T, 0, n)` when populating with `append`. Indexing `s[i]` requires `i < len(s)` regardless of `cap(s)`.
- A full slice expression `s[low:high:max]` sets `len = high - low` and `cap = max - low`. Capping capacity with `s[:len(s):len(s)]` or `slices.Clip(s)` forces a later `append` to allocate a new backing array instead of overwriting elements past `high`, but existing elements within `[:len(s)]` remain shared.
- Always assign the result of `append`. Never rely on a specific capacity growth factor (such as doubling below 1,024 elements); growth heuristics are runtime implementation details.
- Never retain a pointer `&s[i]` across operations that may `append` to `s`: reallocation moves the slice to a new array while the old pointer still points into the stale array. Store the index `i` instead.
- `copy(dst, src)` copies `min(len(dst), len(src))` elements and handles overlapping slices safely; spare capacity in `dst` is ignored. `slices.Clone(s)` (Go 1.21+) returns a shallow copy and preserves `nil`.
- Slicing a small window out of a large slice or string keeps the entire backing allocation live. Clone the retained subslice (`slices.Clone`) or substring (`strings.Clone`, Go 1.18+) when it outlives a much larger buffer.
- `slices.Delete(s, i, j)` (Go 1.21+) shifts elements in the shared backing array and, since Go 1.22, zeroes the obsolete tail `s[len(s)-(j-i):len(s)]` so pointers in dropped slots do not leak. Use `clear(s)` (Go 1.21+) to zero a slice range in place.

## Range iteration semantics
- In `for i, v := range s`, `v` is a value copy of `s[i]`. Mutating `v` does not update the slice; mutate `s[i]` directly.
- Ranging over an array value `for i, v := range arr` copies the entire array before the loop starts. Range over `&arr` or `arr[:]`, or use an index-only `for i := range arr`, to avoid copying the array or to observe in-loop mutations to later elements.
- Ranging over a slice evaluates the slice header once at loop entry. Appending inside the loop does not increase the iteration count, and in-place writes to `s[j]` (`j > i`) are visible to later iterations only if `s` was not reallocated.
- In modules targeting Go 1.22+, loop variables declared with `:=` have per-iteration instances. Variables declared outside the loop and assigned with `=` remain shared across iterations.

## Strings and UTF-8
- A `string` is an immutable byte slice, not guaranteed valid UTF-8. `s[i]` accesses byte `i`; `for byteOffset, r := range s` decodes UTF-8 runes.
- On invalid UTF-8 bytes, `range` yields `utf8.RuneError` (`U+FFFD`) and advances by 1 byte, whereas `utf8.RuneLen(utf8.RuneError)` returns 3. When advancing manually, use the width returned by `utf8.DecodeRuneInString(s[i:])`, and validate untrusted text with `utf8.ValidString`.
- A Unicode code point (`rune`) is not a user-perceived character (grapheme cluster); slicing at arbitrary byte or rune offsets can split combining marks or multi-code-point sequences.
- On Go 1.27+, `strings.CutLast(s, sep)` and `bytes.CutLast(b, sep)` split around the final instance of `sep` and return `(before, after, found)`. `bytes.CutLast` returns subslices that alias `b`. On earlier Go versions, use `strings.LastIndex` / `bytes.LastIndex`.

## Maps and data locality
- A `nil` map supports lookup (`m[k]`), `len`, `range`, and `delete`; only assignment (`m[k] = v`) panics. Use `v, ok := m[k]` to distinguish a missing key from a stored zero value.
- Map keys must be comparable. An interface key (`any`) compiles, but panics at runtime if assigned a dynamic value whose type is uncomparable (slice, map, function, or struct containing them).
- Map elements are not addressable (`&m[k]` and `m[k].Field = x` do not compile). Read the struct, modify the local copy, and assign `m[k] = updated`, or store `*V` when shared identity is required.
- Deleting map entries during `range` guarantees unreached deleted keys are not visited; inserting entries during `range` may or may not visit the new keys. `maps.Clone` (Go 1.21+) makes a shallow copy; snapshot concurrent maps while holding their lock.
- Contiguous slices (`[]T`) have better spatial locality than pointer chains (`[]*T` or linked lists), but only change representations when benchmarks on realistic data sizes show a measurable gain.
