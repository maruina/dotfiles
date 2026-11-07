# Generics and collection contracts
Read this for constraints, named collections, generic APIs, or generic methods. Follow the core skill's module/toolchain gate. Type parameters require Go 1.18+; `cmp` and the `slices`/`maps` packages require Go 1.21+; methods with their own type parameters require Go 1.27+.

## Choose the abstraction
- Use generics when the same algorithm or storage contract applies across types. Use a concrete type for one domain and an ordinary interface for behavior that does not need a type relationship across arguments or results.
- Prefer standard maps, slices, and their standard-library algorithms to a custom container. Introduce a generic wrapper only for a real invariant or operation, not to reproduce built-in storage.
- Multiple type parameters can express independent key/value or input/output types. They do not prove runtime relationships such as equal slice lengths; validate those separately.
- Generic code is not a promise of specialization, inlining, zero allocations, or faster execution. Measure the actual workload before making a performance claim.

## Constraints define permitted operations
- `any` is an alias for `interface{}` and permits all types. It does not permit arbitrary operations on a value of type `T`. A constraint must justify each operation in the body.
- Use `interface{ ~int | ~int64 }` for a union of underlying integer types; the pre-release `interface{ type int, int64 }` syntax is invalid. `int` alone accepts that exact type, not a defined `type Count int`; `~int` includes such defined types.
- Separate interface elements intersect their type sets; alternatives within one union use `|`. Keep constraints no stronger than the operations require. Declare required methods explicitly; common fields or methods on every union member do not supply an implicit selector contract.
- Type-set constraints such as `interface{ ~int | ~string }` are not runtime value types. Use them as constraints, not as the type of a variable or struct field. Use an ordinary behavior interface when runtime polymorphism is the goal.
- Use `cmp.Ordered` (Go 1.21+) for ordered built-in types and defined types with those underlying types. Ordering is not numeric addition: it includes strings and excludes complex numbers. State the NaN policy for floating-point ordering; `cmp.Compare` supplies a consistent order where raw `<` does not.
- Use `comparable` for `==`, `!=`, or map keys, not for ordering. Since Go 1.20, interface types such as `any` can satisfy it. Comparing or hashing interface values with uncomparable dynamic values can still panic. A `comparable` constraint does not validate heterogeneous input.

## Instantiate and preserve type identity
- Instantiate generic types explicitly, including composite literals: `Queue[int]{}` rather than `Queue{}`. Generic function calls can infer arguments from inputs and constraints; supply explicit arguments when inference lacks enough information. Do not assume an expected return type supplies inference.
- Use `var zero T` for a zero result valid for any `T`. `T{}` does not work for arbitrary scalar types, and `nil` cannot represent every type's zero value.
- A receiver such as `func (q *Queue[T]) Pop() (T, bool)` declares receiver type parameters with constraints inherited from `Queue`. These names are not a specialization for one concrete type. A generic struct's fields must use instantiated types, such as `next *node[T]`.
- Use `S ~[]E` and return `S` when a collection operation must preserve a caller's defined slice type and methods. Returning `[]E` loses that identity. Preserving the type does not establish independent storage or a deep copy.
- State nil, empty, aliasing, mutation, and callback contracts. This shallow clone preserves nil and named type identity, and allocates independent element storage for non-empty inputs; referenced element data remains shared:

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
	q.items[0] = zero
	q.items = q.items[1:]
	return value, true
}
```

Prefer `slices.Clone` when its nil/empty contract fits. The queue fragment illustrates generic zero values, not a complete queue API: it has no enqueue operation or concurrency protection. Clearing removed elements releases references, but reslicing can retain the backing allocation; use the ownership reference for measured retention decisions.

## Fields, methods, and version gates
- A union of structs with a common `ID` field does not permit `value.ID` on a type parameter. Keep field access in concrete code, or pass a typed accessor/update callback. Require a method only when it belongs in the domain contract; do not add meaningless setters only to make a generic helper compile.
- Before Go 1.27, a method can use its receiver's type parameters but cannot introduce independent ones. Use a package-level generic function for that operation on older baselines.
- Go 1.27 permits independent method type parameters. Interface methods still cannot declare type parameters, and generic methods do not implement interface methods. Do not add an unsupported generic-method requirement to an interface.
- This Go 1.27-only example maps to an independent output type; use explicit instantiation when passing a generic method as a value if inference cannot determine its parameters:

```go
package generics

type Batch[T any] []T

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

The callback runs synchronously once per element; callers supply a non-nil callback for non-empty inputs. Allocation and callback work scale with input length. Type parameters do not add cancellation or bounds to a workload.

## Channels and keyed collections
- `chan T` can carry typed results, but generics do not change send/close ownership, backpressure, cancellation, or join requirements. A capacity-one result channel can release a completed sender; it cannot terminate work that ignores cancellation. Read [Concurrency](concurrency.md) when designing a generic worker API rather than copying a sample pool.
- Prefer `map[K]V` with `K comparable` to a custom hash table. Test overwrite, absent-key zero/false results, and key restrictions. A custom table additionally needs hash/equality consistency, validated bucket bounds and size, collision behavior, growth policy, and synchronization ownership. Omit fixed-bucket teaching implementations unless the measured requirement justifies maintaining those contracts.

## Validation
Test named and unnamed input types, nil and non-nil empty collections, aliasing, zero values, and independent input/output types. Keep compile-negative checks for invalid constraints, missing explicit type arguments, forbidden field access, and unsupported interface methods separate from the passing package. Test the repository's supported versions; a Go 1.27 run alone does not establish older-version compatibility.
