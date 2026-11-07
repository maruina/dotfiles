# Interfaces and API design
Use with the core skill for receiver choice, callbacks, interface boundaries, embedding, and exported APIs.

## Choose receivers by ownership
- A value receiver copies the receiver; it does not deep-copy slices, maps, pointers, or other referenced state. A pointer receiver shares identity, not synchronization.
- Keep the core receiver policy: pointer receivers for mutation, identity, large structs, and non-copyable state; value receivers for small copy-like values. Keep method sets consistent unless an established contract requires an exception, such as decoding into an otherwise value-like type.
- Pass slices, maps, channels, functions, and interfaces as values in ordinary APIs. A pointer can be appropriate when the operation must replace the caller's value, such as decoding a slice. Passing a descriptor by value does not isolate its referenced data.
- Read the type's documented copy contract and existing constructors/methods. A constructor's return type is useful evidence, not a universal rule for all future APIs. Copying through a pointer is legal when the value's contract permits copying; never copy synchronization state after first use.

## Separate calls from interface satisfaction
For a defined non-pointer, non-interface type `T` without embedding:

| Type | Method set |
|---|---|
| `T` | Methods declared with receiver `T` |
| `*T` | Methods declared with receiver `T` or `*T` |

- For an addressable variable `x`, `x.PointerMethod()` can mean `(&x).PointerMethod()`. This shorthand does not add methods to `T` or make `T` satisfy an interface requiring that pointer method.
- Map elements and function results are not addressable. Store pointers when shared mutation is intended, or copy a map element, update it, and assign it back. Do not change receiver semantics just to suppress an interface error.
- Use `T.Method` or `(*T).Method` when a function with an explicit receiver argument fits the caller. Method expressions are supported APIs, not merely diagnostic syntax.

## Account for saved receivers in callbacks
- `f := x.Method` evaluates and saves the receiver when the method value is created, not when `f` is called.
- A value-receiver callback saves a shallow receiver copy. A pointer-receiver callback saves a pointer; later mutations of that object are visible. Reassigning the original pointer variable does not retarget the callback.
- A value-receiver method selected through a pointer still saves a value copy. Capturing a nil pointer for a pointer-receiver method can succeed; calling it is safe only if that method handles nil. Selecting a value-receiver method through nil requires dereferencing it and panics.
- Review callbacks for retained objects, shared mutable fields, cancellation, and synchronization. Do not infer allocation cost from the method-value syntax alone.

## Introduce interfaces at real boundaries
- Use an interface for behavior that the consumer needs to vary or that callers must supply. Keep the required method set narrow; do not create speculative interfaces for every concrete type.
- Interface values exist: a non-nil interface has a dynamic concrete type and value. Assignment copies the concrete value, including a pointer when that is the dynamic value. Do not treat the runtime's word layout or dispatch table as a language contract.
- Implementation is implicit through the required method set. Keep the core compile-time assertions for supported interface contracts. Pass interface values, not pointers to interfaces, for ordinary polymorphic calls.
- A slice of interfaces can hold different implementing types. Value entries copy their concrete values shallowly; pointer entries share their objects. `[]T` is not implicitly assignable to `[]Interface`; convert elements explicitly if the boundary requires that representation.
- Prefer behavioral names, but do not require every interface to have one method or a verb name. Use generics for uniform algorithms where appropriate, not an unconditional ban on abstraction.

## Audit promotion before embedding
Keep the core preference for named fields and explicit delegation, especially in public structs. When embedding is justified, check the resulting method set, zero value, copy contract, and exported API.

| Embedded field in `S` | Methods promoted to `S` | Methods promoted to `*S` |
|---|---|---|
| `T` | Receiver `T` | Receivers `T` and `*T` |
| `*T` | Receivers `T` and `*T` | Receivers `T` and `*T` |

- Promotion is selector resolution, not inheritance or virtual dispatch. An outer method can hide a promoted method; calls inside the inner type still use the inner receiver's methods.
- Equally shallow competing names can make a selector ambiguous. Assert interfaces on the outer type too; do not assume embedding preserves them after API changes.
- A nil embedded pointer can make promoted calls panic. Do not trade a useful zero value for hidden initialization requirements. Keep embedded fields first with a blank line before named fields; do not embed mutexes.

## Keep exported construction usable
- Export only the supported API. Exported names start with a Unicode uppercase letter; unexported fields are package-private, not a security boundary.
- Prefer concrete return types that callers can name when the concrete type is part of the supported API. Returning an unexported concrete type is legal, but limits naming and construction; it is not a substitute for a deliberate public contract.
- Exported fields can be accessible through an unexported embedded type. Do not assume hiding the embedded type hides its promoted API.
- Before Go 1.27, keyed struct literals cannot initialize promoted fields directly. Go 1.27 permits promoted-field keys when the traversed embedded fields are not pointers, subject to selector and overlapping-key restrictions. Do not use that syntax on earlier baselines. Prefer explicit construction APIs when embedding would otherwise complicate initialization.

## Compose required behavior, not inheritance
- Embedding does not make an outer value assignable to the embedded concrete type. Group different implementations through the behavior the consumer needs, not a shared base struct.
- Start with concrete data transformations. Introduce a consumer-owned interface when callers must supply behavior, an external boundary needs isolation, or implementations actually vary. One production implementation plus a test implementation can justify a narrow boundary; a speculative copy of the producer's whole API does not.
- Return concrete types when their implementation is the supported API. Returning `error` or another deliberate abstraction remains valid; do not turn this preference into a ban on interface returns.
- Compose small interfaces only when an operation needs their combined contract. If an operation needs independent source and destination behaviors, accept separate parameters instead of requiring a wrapper type for every combination.
- Prefer named dependency fields and explicit delegation. Embedded interface fields promote methods but can hide nil dependencies and unintentionally expand the public API. Validate required dependencies at construction, not through checks after every trusted call.
- Shared state can justify a helper struct when that struct represents a coherent domain value. Do not mechanically duplicate fields or prohibit aliases used for compatibility.

## Distinguish static contracts from dynamic assertions
- Assignment from a wider behavior interface to a narrower one is valid when its static method set satisfies the target. The reverse needs an assertion even when the dynamic value implements both.
- `v, ok := x.(T)` tests the dynamic type or behavior without a panic; on failure `v` is the zero value of `T`. A nil interface also fails. Keep the core comma-ok policy; a type assertion does not convert unrelated concrete types.
- An assertion can succeed for a typed nil pointer. `ok` proves the dynamic type, not that its pointer value is non-nil. A nil dependency or a nil receiver can still make a later method call fail.
- Interface dispatch does not imply an allocation on every assignment or call. Measure the actual compiler/build/workload before adding indirection-avoidance machinery.

## Design error contracts for inspection
Keep basic error selection, wrapping, naming, and handle-once rules in the core. Load this section for custom errors, interface nil hazards, or aggregate error contracts.

- Return `error` for a fallible operation and literal `nil` on success. A nil `*CustomError` returned through `error` is non-nil; changing only the return signature does not fix returning a typed nil local.
- Expose a sentinel when callers need a stable category, or a custom error type when they need structured context. Use `errors.Is` for categories and `errors.As` for typed context through wrappers, not message parsing or a direct type switch that misses wrapped errors.
- With `errors.As`, use `var detail *DetailError; errors.As(err, &detail)` for a pointer error type. The target must be a non-nil pointer to a type implementing `error` or to an interface. On Go 1.26+, `errors.AsType[*DetailError](err)` provides a type-safe alternative; keep `As` for earlier supported baselines or targets that need its broader interface form.
- A behavior interface used with `As` can reduce coupling to a concrete error type. Inspect a documented behavior, not an assumed universal retry signal. Do not use deprecated `net.Error.Temporary`; a timeout alone does not prove retry safety. Retries need operation-specific idempotency, cancellation, and a bound.
- Since Go 1.20, `errors.Join` can preserve independent failures, such as operation and cleanup failures, when callers need both. It discards nil errors and returns nil when all inputs are nil. It does not discard typed nils inside non-nil interfaces.
- `Is` and `As` inspect error trees in pre-order, depth-first order; `As` selects the first match. Document any meaningful precedence when multiple errors have the same type. Do not rely on aggregate error text as a protocol.
- `errors.Unwrap` handles only `Unwrap() error`, not `Unwrap() []error`. Do not write a linear root-cause loop or add a third-party wrapping package for ordinary inspection; use `Is`/`As` across single and joined errors.
- Wrapping exposes matching behavior as an API commitment. Test that `%w` preserves the promised category/type and that intentional `%v` translation hides it. Handle or propagate an error once; logging is a boundary decision, not mandatory work at every layer.

## Original callback example
Copy this block into `callbacks_test.go` in a disposable module and run `go test -v ./...` and `go vet ./...`. Mixed receivers here deliberately demonstrate the language distinction, not a recommended production method set.

```go
package design

import "testing"

type record struct {
	label string
	items []int
}

func (r record) snapshot() string { return r.label }
func (r *record) current() string { return r.label }
func (r record) changeItem() { r.items[0]++ }

func TestSavedReceivers(t *testing.T) {
	r := record{label: "first", items: []int{1}}
	valueCall, pointerCall := r.snapshot, r.current
	p := &r
	throughPointer := p.snapshot
	boundPointer := p.current
	r.label = "second"
	p = &record{label: "other"}
	if valueCall() != "first" || throughPointer() != "first" {
		t.Fatal("value receiver was not saved")
	}
	if pointerCall() != "second" || boundPointer() != "second" {
		t.Fatal("pointer callback changed target")
	}
	record.changeItem(r)
	if r.items[0] != 2 || (*record).current(&r) != "second" {
		t.Fatal("shallow copy or method expression")
	}
}
```
