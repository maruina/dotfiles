# Ownership and memory
Use this guide when choosing copy/share semantics, handling slices, strings, or maps, investigating escapes, validating numeric conversions or constants, or measuring data layout. Read the core skill first.

## Choose semantics before allocation strategy
- Arguments, assignments, and returns copy values. Passing a pointer copies the pointer, not its target; mutation through that copy reaches the shared target. Reassigning the local pointer does not replace the caller's pointer.
- Struct and array copies copy their fields/elements. Copying a value containing a pointer, slice, or map does not recursively copy referenced data. Define who can mutate that data and whether retaining it is permitted.
- Use a value for independent copy-like state. Use a pointer for shared identity or mutation, or when copying a large value has a measured cost. Keep receiver choices consistent with the core skill; do not select pointers merely because they appear cheaper.
- A pointer does not provide synchronization. When access crosses goroutines, define the owner and synchronization before sharing mutable state.

This original example distinguishes scalar copies, shared targets, and shallow struct copies:

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
	*copied.label = 8

	pointer := &original
	alias := pointer
	alias.count++
	alias = &copied
	alias.count++

	fmt.Println(original.count, copied.count, *original.label)
	// Output: 2 10 8
}
```

## Diagnose escapes without making allocation promises
- Returning a pointer to a local variable is safe. The implementation preserves the variable for as long as it can be referenced. Do not model this as a dangling C stack pointer.
- Escape analysis and inlining influence storage placement. Taking an address, returning a pointer, or using a nonconstant slice length is not a portable proof of a heap allocation. Large locals can also need heap storage without escaping.
- First choose correct ownership semantics. Then inspect the actual build with `go build -gcflags='-m' ./...`, and measure representative allocation/retention behavior. Record the Go version, target architecture, flags, and workload; diagnostics are compiler decisions, not API contracts.
- Do not infer allocation counts from printed addresses: instrumentation can alter escape decisions. Do not encode initial goroutine stack sizes, stack-growth thresholds, or register-passing conventions as language guarantees.
- GC manages Go memory, not timely closure of files, connections, or other external resources. Keep explicit cleanup and lifetimes even when memory is collected.

## Validate conversions and constant representability
- Use fixed-width numeric types when a binary format or external contract requires a width. `int` and `uint` have implementation-specific 32- or 64-bit sizes; do not infer a wire format or pointer layout from `int`.
- A conversion changes the language-level type/value according to conversion rules. It does not promise a fresh allocation or independent referenced storage. Avoid `unsafe` reinterpretation as a shortcut around those rules.
- Nonconstant integer narrowing truncates; it does not report overflow. Validate the source range before converting when truncation would violate the contract. Floating-point-to-integer conversion discards the fraction; also validate range and non-finite inputs when required.
- Numeric constants represent exact arbitrary-precision values in the language. Compilers may impose documented representation limits; 256 bits is a required minimum for integer constants and floating-point mantissas, not a universal precision or maximum.
- A typed use of a constant must be representable in the destination type. An untyped integer assigned without an explicit type defaults to `int`, so a valid constant declaration can still fail at its use site on a narrower target.
- Constant integer division truncates (`7 / 2` is `3`); `7 / 2.0` is a floating-point constant. Preserve units and intended arithmetic rather than relying on a later conversion to recover a discarded fraction.
- `iota` is the zero-based index of the constant specification, not a runtime counter. Omitted expressions repeat the previous expression list. Follow the core skill's enum default and stable external-ID rules.

## Measure layout on the target
- Struct size can include internal and trailing padding. Alignment is based on field alignment requirements, not simply the largest field's byte size.
- `unsafe.Sizeof`, `unsafe.Alignof`, and `unsafe.Offsetof` can inspect layout on a specified target. `Sizeof` does not count referenced backing storage or objects. Do not use struct memory as a portable serialization format.
- Keep fields in a readable domain order unless profiles show layout matters. Measure before/after memory and throughput before reordering fields or adding padding; address stability, cache behavior, and performance gains are not implied by a smaller struct alone.

## Bound slice mutation and retention
- An array's length is part of its type. Array assignment copies elements; slice assignment copies a descriptor that shares an underlying array. Pass slices as values by default; return an updated slice when changing its length rather than adding a pointer to the slice without a contract need.
- `make([]T, n)` creates `n` accessible zero-valued elements. Use `make([]T, 0, n)` to reserve capacity for appends. Indexing at `len(s)` panics even when spare capacity exists; reslicing can expose elements up to capacity.
- For `s[low:high:max]`, length is `high-low` and capacity is `max-low`. `s[:len(s):len(s)]` or `slices.Clip(s)` limits append reuse, not writes through existing aliases. Neither releases the original backing array.
- Always retain the result of `append`. It reuses the backing array when capacity suffices, or creates a sufficiently large array otherwise. Do not depend on a doubling rule, a growth threshold, exact capacity, or stack placement.
- A pointer to a slice element remains valid after growth, but can refer to the old array rather than the corresponding element of the grown slice. Do not retain such pointers when the contract requires them to follow replacement or reallocation; resolve an index through the owning slice instead.
- `copy(dst, src)` copies at most `min(len(dst), len(src))` elements, including when regions overlap. Spare destination capacity is not destination length. `slices.Clone` provides a shallow copy; referenced objects inside elements remain shared. Before Go 1.21, use `make` plus `copy`, preserving nil explicitly when the API requires it.
- Copy a small retained subslice when profiles show that it keeps an unwanted large array alive. For an empty retained result, return nil or an independent empty slice as the contract requires rather than relying on clipping to release storage.
- Clear discarded pointer-containing slots only when mutation of that backing array is permitted. `clear` requires Go 1.21; use an assignment loop on older versions. Store the slice returned by `slices.Delete`; Go 1.22+ also zeroes its obsolete tail. Existing aliases observe these mutations, so clone first if isolation is required.

## Iterate the intended storage
- A range element variable receives a copy, not an alias to the collection element. Use `s[i]` or `&s[i]` when modifying the stored element is intended. Copying a pointer element still shares its target.
- A two-value range over an array value observes an array copy. Range over a pointer to the array, or use indices to access the original, when live element mutations must be observed. An index-only range can omit evaluation of an array expression with constant length; do not use it for expression side effects.
- Slice range uses the initial slice and length; appending does not extend the loop. Changes to existing elements can be observed while storage remains shared, but reallocation separates the old range storage from the new slice.
- Under Go 1.22+ loop semantics, variables declared with `:=` by a range clause are distinct per iteration. Variables reused with `=` remain shared. Neither form makes the element variable an alias to `s[i]`; do not carry the book's repeated-address output into modern expectations.

## Process bytes or Unicode code points explicitly
- Strings are immutable byte sequences, not necessarily valid UTF-8. Assignment does not provide mutable independent storage. Do not rely on a fixed two-word string representation as a language contract.
- String range yields byte offsets and decoded runes. Invalid UTF-8 yields `utf8.RuneError` and advances one byte. `utf8.RuneLen(r)` is not the consumed width for invalid input; use `utf8.DecodeRuneInString` and its width when slicing the original encoding. Check `utf8.ValidString` when the input contract requires valid UTF-8.
- A code point is not necessarily a user-visible character. Byte length, rune count, and displayed-character count answer different questions; slicing arbitrary byte offsets can split an encoded rune.
- On Go 1.18+, use `strings.Clone` for a retained small substring when profiling justifies separating it from large source storage. Do not clone ordinary short-lived strings by default.
- On Go 1.27+, `strings.CutLast` and `bytes.CutLast` split at the last separator and report absence explicitly. The byte results alias the input; clone before retaining mutable data across an ownership boundary. On older toolchains, use `LastIndex` with an explicit not-found branch. Splitting is not an ownership transfer.

## Preserve map contracts
- A nil map supports lookup, length, range, and deletion; only insertion needs an initialized map. Use `value, ok := m[key]` to distinguish absence from a stored zero value. Deleting a missing key is a no-op.
- Keys must be comparable. An interface key can still panic when its dynamic value is a slice, map, or function. Prefer concrete key types when the domain permits them.
- Map range copies keys and values and has unspecified order. Removing an unreached entry prevents its visit; an entry added during range may or may not be visited. Do not use mutation during iteration as a work queue or rely on randomization for fairness.
- Map elements are not addressable. To change a struct value, read, modify, and assign it back; use pointer values only when shared identity is the intended contract.
- `maps.Clone` (Go 1.21+) is shallow. On older versions, allocate a map and copy entries, with an explicit nil branch if needed. Snapshot protected maps under their lock; cloning is not synchronization.
- Treat hash-table layout and memory reclamation after deletion as implementation details. Use the core's ordering, size-hint, and measured-retention rules; do not infer contiguous user data from runtime buckets.

## Measure access patterns, not hardware folklore
- Arrays and slice backing arrays provide contiguous element storage; referenced pointees are not necessarily adjacent. Sequential access can improve locality, but the benefit depends on the workload, element layout, processor, and memory system.
- Compare representative traversals before changing a data structure. Do not carry the book's cache-line sizes, latency numbers, linked-list/matrix speed ratios, or page-size recommendations into a portable rule. Cache and translation lookaside buffer effects are hypotheses to measure, not Go guarantees.
