# Interfaces and API design
Use with the core skill for receiver selection, method sets, saved callbacks, interface boundaries, struct embedding, exported construction, and error inspection contracts.

## Receivers and value vs. pointer parameters
- A value receiver operates on a shallow copy of the receiver; any slice, map, or pointer fields inside it still reference shared storage. A pointer receiver shares the struct instance itself.
- Keep a type's receivers consistent: if any method needs a pointer receiver (for mutation, large struct size, or non-copyable fields like `sync.Mutex`), use pointer receivers across the type unless a specific interface requires a value receiver.
- Pass slices, maps, channels, functions, and interfaces by value. Pass a pointer to a slice (`*[]T`) only when the function must modify the caller's slice header in place (such as `Unmarshal` helpers that cannot return the new slice).

## Method sets vs. call-site shorthand
For a defined non-pointer, non-interface type `T`:

| Type | Method set (determines interface satisfaction) |
|---|---|
| `T` | Methods declared with receiver `T` |
| `*T` | Methods declared with receiver `T` or `*T` |

- If `x` is an addressable variable of type `T`, the compiler rewrites `x.PtrMethod()` to `(&x).PtrMethod()`. That call-site convenience does not add `PtrMethod` to `T`'s method set: a value `T` still does not implement an interface requiring `PtrMethod`.
- Map elements (`m[k]`) and function return values (`fn()`) are not addressable, so pointer-receiver methods cannot be called directly on them.
- Method expressions (`T.Method` or `(*T).Method`) yield an ordinary function whose first parameter is the receiver (`func(T, ...)` or `func(*T, ...)`).

## Method values and saved callbacks
- Creating a method value `fn := x.Method` evaluates and captures the receiver immediately when `fn` is bound, not when `fn()` is called later.
- If `Method` has a value receiver, `fn` captures a shallow copy of `x` at bind time (even if selected through a pointer `p.Method`, which dereferences `p` immediately and panics if `p == nil`).
- If `Method` has a pointer receiver, `fn` captures the pointer address. Later mutations to that struct are visible to `fn()`, whereas reassigning the local pointer variable `p = other` does not retarget `fn`.

```go
package design

import "testing"

type record struct {
	label string
	items []int
}

func (r record) snapshot() string { return r.label }
func (r *record) current() string { return r.label }
func (r record) changeItem()      { r.items[0]++ }

func TestSavedReceivers(t *testing.T) {
	r := record{label: "first", items: []int{1}}
	valueCall, pointerCall := r.snapshot, r.current
	p := &r
	throughPointer, boundPointer := p.snapshot, p.current

	r.label = "second"
	p = &record{label: "other"}

	if valueCall() != "first" || throughPointer() != "first" {
		t.Fatal("value receiver was not captured at bind time")
	}
	if pointerCall() != "second" || boundPointer() != "second" {
		t.Fatal("pointer callback did not observe target mutation")
	}
	record.changeItem(r)
	if r.items[0] != 2 || (*record).current(&r) != "second" {
		t.Fatal("shallow slice alias or method expression failed")
	}
}
```

## Consumer-owned interfaces
- Start with concrete types. Introduce an interface in the consuming package when callers must substitute implementations (for example, isolating external I/O in tests or supporting multiple backends). Do not export producer-side interfaces that mirror a single struct's entire method surface.
- Keep interfaces narrow (often 1–3 methods) and compose them only when a function requires the combined behavior. If a function reads from one dependency and writes to another, take two narrow parameters instead of one combined interface.
- A non-nil interface value holds a dynamic concrete type and a copy of the concrete value (or pointer). Assigning a value `T` into an interface copies `T`; mutating the original `T` afterward does not change the copy stored in the interface.
- `[]Concrete` cannot be assigned directly to `[]Interface` because their memory layouts differ; convert elements explicitly when an interface slice is required.

## Struct embedding and promotion
Prefer named fields and explicit delegation in exported structs. When embedding is justified, audit promotion rules:

| Embedded field in `S` | Methods promoted to `S` | Methods promoted to `*S` |
|---|---|---|
| `T` | Receiver `T` | Receivers `T` and `*T` |
| `*T` | Receivers `T` and `*T` | Receivers `T` and `*T` |

- Promotion is compile-time selector resolution, not inheritance or dynamic dispatch:
  - `S` is not assignable to parameters of type `T`.
  - If `S` defines `Name()` and embedded `T` defines `Inside()` which calls `t.Name()`, calling `s.Inside()` still invokes `T.Name()`, not `S.Name()`.
- If two embedded fields at the same depth define the same field or method name, selecting that name on `S` is a compile error unless `S` defines its own disambiguating method.
- Embedding a pointer `*T` or an interface field makes `S`'s zero value panic on promoted method calls until initialized.
- Exported fields and methods of an unexported embedded struct are still promoted and exported on an exported outer struct `S`.
- Before Go 1.27, keyed composite literals `S{PromotedField: v}` cannot name promoted fields of embedded structs. Go 1.27 allows promoted field keys in composite literals when the path does not traverse an embedded pointer field. Avoid relying on promoted literal keys when supporting Go 1.26 or earlier.

## Type assertions and typed-nil hazards
- A wider interface can be assigned to a narrower interface at compile time without a type assertion. Narrower-to-wider or interface-to-concrete conversions require `v, ok := x.(Target)`.
- `v, ok := x.(Target)` checks the dynamic type. If `x` holds a typed `nil` pointer `(*Impl)(nil)`, `x != nil` is `true` and `v, ok := x.(*Impl)` returns `v == nil, ok == true`.
- Always return the `error` interface from functions and return a literal `nil` on success. Declaring `var err *MyError` and returning `err` unconditionally returns a non-nil `error` interface containing a `nil` pointer.

## Error trees and inspection
- Use sentinel errors (`var ErrNotFound = errors.New(...)`) with `errors.Is` for fixed error conditions, and custom error structs with `errors.As` when callers need structured fields.
- For `errors.As(err, &target)`, `target` must be a non-nil pointer to a type that implements `error` or to an interface type. On Go 1.26+, `detail, ok := errors.AsType[*DetailError](err)` provides a generic, type-checked alternative that avoids declaring `target` first.
- Do not use deprecated `net.Error.Temporary()`; timeouts and transient errors are operation-specific and require explicit idempotency checks, deadlines, and retry bounds.
- `errors.Join(errs...)` (Go 1.20+) and multi-`%w` `fmt.Errorf` construct an error tree implementing `Unwrap() []error`. `errors.Join` ignores `nil` arguments and returns `nil` if all arguments are `nil`, but it does not filter out typed-nil error interfaces.
- `errors.Is` and `errors.As` / `errors.AsType` traverse both single-wrapped (`Unwrap() error`) and multi-wrapped (`Unwrap() []error`) trees in pre-order depth-first order. `errors.Unwrap(err)` returns `nil` for multi-error trees; never write manual `for err != nil { err = errors.Unwrap(err) }` loops.
