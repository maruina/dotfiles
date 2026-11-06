# Ownership and memory
Use this guide when choosing copy/share semantics, investigating escapes, validating numeric conversions or constants, or measuring struct layout. Read the core skill first. Rule IDs map to evidence in [SOURCES.md](../SOURCES.md).

## Choose semantics before allocation strategy (LM3)
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

## Diagnose escapes without making allocation promises (LM4)
- Returning a pointer to a local variable is safe. The implementation preserves the variable for as long as it can be referenced. Do not model this as a dangling C stack pointer.
- Escape analysis and inlining influence storage placement. Taking an address, returning a pointer, or using a nonconstant slice length is not a portable proof of a heap allocation. Large locals can also need heap storage without escaping.
- First choose correct ownership semantics. Then inspect the actual build with `go build -gcflags='-m' ./...`, and measure representative allocation/retention behavior. Record the Go version, target architecture, flags, and workload; diagnostics are compiler decisions, not API contracts.
- Do not infer allocation counts from printed addresses: instrumentation can alter escape decisions. Do not encode initial goroutine stack sizes, stack-growth thresholds, or register-passing conventions as language guarantees.
- GC manages Go memory, not timely closure of files, connections, or other external resources. Keep explicit cleanup and lifetimes even when memory is collected.

## Validate conversions and constant representability (LM1, LM5)
- Use fixed-width numeric types when a binary format or external contract requires a width. `int` and `uint` have implementation-specific 32- or 64-bit sizes; do not infer a wire format or pointer layout from `int`.
- A conversion changes the language-level type/value according to conversion rules. It does not promise a fresh allocation or independent referenced storage. Avoid `unsafe` reinterpretation as a shortcut around those rules.
- Nonconstant integer narrowing truncates; it does not report overflow. Validate the source range before converting when truncation would violate the contract. Floating-point-to-integer conversion discards the fraction; also validate range and non-finite inputs when required.
- Numeric constants represent exact arbitrary-precision values in the language. Compilers may impose documented representation limits; 256 bits is a required minimum for integer constants and floating-point mantissas, not a universal precision or maximum.
- A typed use of a constant must be representable in the destination type. An untyped integer assigned without an explicit type defaults to `int`, so a valid constant declaration can still fail at its use site on a narrower target.
- Constant integer division truncates (`7 / 2` is `3`); `7 / 2.0` is a floating-point constant. Preserve units and intended arithmetic rather than relying on a later conversion to recover a discarded fraction.
- `iota` is the zero-based index of the constant specification, not a runtime counter. Omitted expressions repeat the previous expression list. Follow the core skill's enum default and stable external-ID rules.

## Measure layout on the target (LM2)
- Struct size can include internal and trailing padding. Alignment is based on field alignment requirements, not simply the largest field's byte size.
- `unsafe.Sizeof`, `unsafe.Alignof`, and `unsafe.Offsetof` can inspect layout on a specified target. `Sizeof` does not count referenced backing storage or objects. Do not use struct memory as a portable serialization format.
- Keep fields in a readable domain order unless profiles show layout matters. Measure before/after memory and throughput before reordering fields or adding padding; address stability, cache behavior, and performance gains are not implied by a smaller struct alone.
