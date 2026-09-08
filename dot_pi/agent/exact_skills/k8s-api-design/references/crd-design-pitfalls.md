# CRD Design Pitfalls

Common mistakes in CRD schema design, generation, and evolution. This reference combines controller-gen marker pitfalls (from [Ahmet Cetin's article](https://ahmet.im/blog/crd-generation-pitfalls/)) with API design anti-patterns from KubeCon talks.

Only admit validated and complete resources. Per Kubernetes API conventions: "default values should be explicitly represented in APIs, rather than assuming unspecified fields get default behavior."

---

## Generation Pitfalls

### Pitfall 1: Zero Values Pass Required Validation

Go's zero values (`""`, `0`, `[]`) pass `+required` because OpenAPI checks for non-null presence, not content.

```go
//+kubebuilder:validation:MinLength=1
//+required
Brand string `json:"brand"`

//+kubebuilder:validation:Minimum=1
//+required
Replicas int32 `json:"replicas"`
```

Use pointers only to distinguish "unspecified" from "explicitly zero":

```go
Replicas *int32 `json:"replicas,omitempty"`
```

### Pitfall 2: Package-Level Required Safety Net

Fields without markers default to optional. Use package-level required as a safety net:

```go
//+kubebuilder:validation:Required
package v1beta1
```

Then explicitly mark optional fields with `//+optional`.

### Pitfall 3: Nested Validation Skipped When Parent Omitted

If `spec` is omitted entirely from YAML, no validation runs on its children. Fix by defaulting the parent:

```go
//+kubebuilder:default:={}
Spec CarSpec `json:"spec,omitempty"`
```

### Pitfall 4: Marker Typos Are Silent

`controller-gen` ignores unrecognized markers. Common mistakes:

| Wrong | Correct |
|-------|---------|
| `enum` | `Enum` |
| `minLength` | `MinLength` |
| `maxLength` | `MaxLength` |
| `minimum` | `Minimum` |
| `maximum` | `Maximum` |
| `pattern` | `Pattern` |

Use the KAL linter: `go install github.com/JoelSpeed/kal@latest`

### Pitfall 5: Nested Struct Defaults Don't Apply

Child defaults only apply if the parent is present. Default the parent to trigger child defaults:

```go
type CarSpec struct {
    //+kubebuilder:default:={}
    //+optional
    Transmission Transmission `json:"transmission,omitempty"`
}

type Transmission struct {
    //+kubebuilder:default:=Automatic
    Type string `json:"type,omitempty"`
}
```

### Pitfall 6: Parent Default Must Satisfy Child Validation

If a child field is `+required`, the parent's default must include it:

```go
type CarSpec struct {
    //+kubebuilder:default:={type:Automatic}
    Transmission Transmission `json:"transmission,omitempty"`
}

type Transmission struct {
    //+kubebuilder:default:=Automatic
    //+required
    Type string `json:"type"`
}
```

### Pitfall 7: Zero-Valued Status Fields Disappear

Status numeric fields at `0` may not appear in output. Explicitly default them:

```go
//+kubebuilder:default:=0
ReadyReplicas int32 `json:"readyReplicas"`
```

### Pitfall 8: `omitempty` Contradicts Required (Scalars Only)

On **scalar fields** (`string`, `int32`, `bool`), `omitempty` omits Go's zero value from JSON, bypassing the `+required` admission check. Remove `omitempty` from required scalars:

```go
//+required
Brand string `json:"brand"`
```

**Exception — struct fields**: On required structs like `Spec`, `omitempty` and `+required` serve different purposes and should coexist:

```go
// +required
Spec MyResourceSpec `json:"spec,omitempty"`
```

Here `omitempty` controls JSON marshaling (avoids serializing `"spec": {}` in patches), while `+required` controls admission validation (rejects requests missing the field). Removing `omitempty` from a struct field forces empty structs into every serialized output, polluting patches and diffs.

### Pitfall 9: controller-tools Version Matters

Before v0.16, `omitempty` silently overrode `+required`. Upgrade:

```bash
go get sigs.k8s.io/controller-tools@v0.16.0
```

---

## API Design Anti-Patterns

Sources: "CRD Design for the Long Haul" (Schlotter & Pandini, KubeCon), "Don't Do This with CRDs" (Nick Young, KubeCon).

### Don't Embed External API Types

Embedding types from another project (e.g. `corev1.ObjectReference`, kubeadm's `ClusterConfiguration`) couples your API to their release cycle. When the external API bumps a version, your users inherit a breaking change. Unwanted fields also leak into your schema.

**Fix**: Copy only the fields you need into your own type.

### Don't Share Structs Across CRDs

Using the same Go struct in multiple CRD specs (e.g. `MachineSpec` in both `Machine` and `MachineTemplateSpec`) binds their evolution together. A field added for one CRD appears in both.

**Fix**: Duplicate the struct and evolve each copy independently.

### Don't Use Generic Terms

Vague field names like `ready: true` conflate multiple lifecycle stages. Splitting a boolean later breaks consumers.

**Fix**: Be precise from the start — `initialization.provisioned`, `network.ready`, `controlPlane.available`.

### Don't Concatenate Names — Use Nested Structs

`nodeDrainGracePeriod`, `nodeDrainTimeout` become unreadable and can't evolve independently.

**Fix**: Group into `nodeDrain.gracePeriod`, `nodeDrain.timeout` via nested structs. Enables independent evolution and reads naturally top-down.

### Avoid Bool Fields and Bounded Enums (in Spec)

Spec booleans cannot grow a third state. Enums with only 2-3 values have the same problem.

**Fix**: Use open-ended string enums (`// +kubebuilder:validation:Enum=...`) that can be extended.

**Exceptions**: Operational kill-switches (`paused bool`) and status fields (`reconciled bool`) where the value is genuinely binary. The extensibility concern targets user-facing spec contracts, not controller-written observed state.

### Prefer Lists with `listType=map` Over Bare Maps for Extensible Collections

CRDs do not support strategic merge patch. Under server-side apply, `map[string]string` fields are granular per-key by default — but maps lack validation markers, printer columns, and structured schemas for values. Lists without `+listType=map` are atomic (whole-list replacement under SSA).

**Fix**: For collections where elements have identity, use `// +listType=map` with `// +listMapKey=name` on slices of structs. This enables per-element SSA merge, structured validation, and independent evolution of each entry's schema.

### Cross-Namespace References Need a Handshake

Cross-namespace references without the target namespace's consent create security and lifecycle coupling.

**Fix**: Use a handshake mechanism like Gateway API's `ReferenceGrant`. If cross-namespace references aren't essential, restrict to same-namespace.

### Make Fields Optional with Defaults

Required fields cannot be added after v1 without breaking existing resources. More required fields means less room to evolve.

**Fix**: Default aggressively. Limit required fields to identity and essential configuration.

### Read the API Top-Down as a Sentence

A well-designed spec reads like a declaration: "I want a Cluster with a topology that has a controlPlane with 3 replicas and workers with 2 machinePools." If the sentence is awkward, the API structure needs work.

### Maintain a Glossary

Define terms like "machine", "node", "host" precisely. Use them consistently across your API and documentation.

### Inspect the Generated OpenAPI Spec

The generated CRD manifest is your actual contract — changes impact every consumer. Diff the generated spec before every release:

```bash
make manifests
git diff -- config/crd/bases/
```

### Binary Version ≠ API Version

SemVer governs your binary release lifecycle. API version (`v1alpha1`, `v1beta1`, `v1`) governs your compatibility guarantees. They are independent — a v2.0.0 binary can still serve API `v1`.

---

## Pre-Release Checklist

- [ ] `+kubebuilder:object:root=true` present on all root types
- [ ] All required fields have `+required` AND content validation (`MinLength`, `Minimum`)
- [ ] Package-level `//+kubebuilder:validation:Required` is set
- [ ] No `omitempty` on required scalar fields (struct fields may keep `omitempty` with `+required`)
- [ ] Nested structs have parent defaults if child defaults/validation needed
- [ ] Parent defaults satisfy all child validation rules
- [ ] Status numeric fields have explicit `+kubebuilder:default:=0`
- [ ] Inspected generated CRD manifest for expected validation rules
- [ ] Tested with actual YAML payloads (not just Go tests)
- [ ] Marker names are correctly capitalized
- [ ] Using controller-tools v0.16+
- [ ] No embedded external API types
- [ ] No shared structs across CRDs
- [ ] Fields use precise names (no generic `ready`, `status`)
- [ ] No bare booleans in spec (except operational kill-switches) — use enums
- [ ] Arrays use `+listType=map` where elements have identity
- [ ] Cross-namespace references have a handshake mechanism
- [ ] Selector fields have immutability XValidation (`self == oldSelf`) and non-empty guard
- [ ] Print columns include a health indicator (Ready or Stalled sourced from conditions)
- [ ] Extensible string fields (non-enum) document built-in values and silent failure behavior
- [ ] API reads naturally top-down as a sentence

## Validation Tools

```bash
go install github.com/JoelSpeed/kal@latest
kal ./api/v1/...
```

Always inspect the generated CRD:

```bash
make manifests
cat config/crd/bases/*.yaml | yq '.spec.versions[].schema.openAPIV3Schema'
```
