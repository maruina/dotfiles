# Generics and collection contracts
Use with the core skill for type parameters, type-set constraints, generic containers, slice type preservation, and generic methods. Check the module's `go` directive first: generics require Go 1.18+, `cmp`/`slices`/`maps` require Go 1.21+, and methods with their own type parameters require Go 1.27+.

## When to use type parameters
- Use type parameters when the exact same algorithm or container logic operates across multiple types, or when a function must preserve a caller's concrete or defined type across arguments and return values.
- Do not replace a simple interface parameter (such as `func Read(r io.Reader)`) with a generic type parameter (`func Read[R io.Reader](r R)`) unless preserving the concrete type avoids a measured escape/allocation on a hot path or is required by the return signature.
- Prefer standard-library generic helpers (`slices`, `maps`, `cmp`) and built-in `map[K]V` / `[]T` over custom generic containers unless you are enforcing a domain invariant (such as a bounded ring buffer or thread-safe queue).

## Type-set constraints and `comparable`
- `any` (`interface{}`) permits any type argument but supports only assignment, passing, taking an address, and reflection. Every other operation in a generic body must be justified by the constraint.
- Express underlying-type unions with `~` and `|`: `interface{ ~int | ~int64 }`. Without `~`, `int` matches only `int` and rejects `type UserID int`. Separate lines inside an interface intersect their type sets; `|` unions them.
- Type-set interfaces containing `~` or type unions can be used only as type constraints, not as the type of variables, parameters, or struct fields.
- Use `cmp.Ordered` (Go 1.21+) for `<`, `<=`, `>`, `>=`. For floating-point values that may contain `NaN`, use `cmp.Compare(a, b)` or `cmp.Less(a, b)` so `NaN` sorts deterministically before non-`NaN` values.
- Use `comparable` when the function uses `==`, `!=`, or `map[K]V` keys. Since Go 1.20, non-type-parameter interfaces (such as `any` or `io.Reader`) satisfy `comparable` at compile time, but comparing or hashing an interface value whose dynamic type is uncomparable (slice, map, function) still panics at runtime.

## Instantiation, zero values, and defined slice types
- Generic types must always provide explicit type arguments when instantiated (`var q Queue[int]`), whereas generic functions infer type arguments from value arguments when unambiguous. Type inference never infers a type parameter solely from how the caller uses the return value.
- Return or clear a generic zero value with `var zero T` (or `**new(T)`). `T{}` fails to compile for primitive/interface types, and `nil` is invalid for value types.
- Use `S ~[]E` when a slice helper should return the caller's defined slice type `S` (preserving methods attached to `type IDs []int`) rather than decaying the return type to `[]E`:

```go
package generics

func Clone[S ~[]E, E any](input S) S {
	if input == nil {
		return nil
	}
	output := make(S, len(input))
	copy(output, input)
	return output
}

type Queue[T any] struct {
	items []T
}

func (q *Queue[T]) Pop() (T, bool) {
	if len(q.items) == 0 {
		var zero T
		return zero, false
	}
	value := q.items[0]
	var zero T
	q.items[0] = zero // clear slot so popped pointers are not retained by backing array
	q.items = q.items[1:]
	return value, true
}
```

## Struct fields and generic methods (Go 1.27+)
- Go does not support structural field access through type-set unions: even if both `A` and `B` have an `ID int` field, `func getID[T A | B](v T) int { return v.ID }` does not compile. Access fields in concrete code, pass an accessor function `func(T) int`, or use a behavioral interface method when it fits the domain.
- In Go 1.18–1.26, methods can use their receiver's type parameters (`func (b Batch[T]) Len() int`) but cannot declare additional type parameters of their own; use a package-level function `func Map[T, U any](b Batch[T], fn func(T) U) Batch[U]` when supporting Go 1.26 or earlier.
- Go 1.27 allows methods to declare their own type parameters. Interface definitions still cannot contain generic methods, and a generic method cannot satisfy an interface method:

```go
package generics

type Batch[T any] []T

// Go 1.27+: method declares independent type parameter U.
func (input Batch[T]) Map[U any](transform func(T) U) Batch[U] {
	if input == nil {
		return nil
	}
	output := make(Batch[U], len(input))
	for i, value := range input {
		output[i] = transform(value)
	}
	return output
}
```
