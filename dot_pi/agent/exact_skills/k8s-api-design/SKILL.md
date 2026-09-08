---
name: k8s-api-design
description: Kubernetes API and CRD design guidance for spec/status, conditions, observedGeneration, API conventions, kubebuilder validation markers, CEL validation, versioning, conversion webhooks, storage migration, compatibility, and safe schema evolution. Use when designing, reviewing, or evolving Kubernetes custom resources and CRD Go types.
model: sonnet
---

# Kubernetes API Design & CRD Lifecycle

Design Kubernetes APIs following official conventions and kstatus patterns. Safely evolve CRD schemas over time.

## API Conventions

### Resource Structure

```go
// +kubebuilder:object:root=true
// +kubebuilder:validation:Optional
// +kubebuilder:subresource:status
// +kubebuilder:printcolumn:name="Ready",type=string,JSONPath=`.status.conditions[?(@.type=="Ready")].status`
// +kubebuilder:printcolumn:name="Age",type=date,JSONPath=`.metadata.creationTimestamp`
type MyResource struct {
    metav1.TypeMeta   `json:",inline"`
    metav1.ObjectMeta `json:"metadata,omitempty"`
    // +required — overrides omitempty in the CRD schema; omitempty prevents serializing a zero-value struct in Go
    Spec   MyResourceSpec   `json:"spec,omitempty"`
    Status MyResourceStatus `json:"status,omitempty"`
}
```

Spec = user intent (desired state). Status = system output (observed state). Include kubebuilder markers on the type — printer columns, subresource declarations, and validation strategy are part of the API contract.

### Naming Conventions

| Element | Convention | Example |
|---------|------------|---------|
| Kind | Singular CamelCase | `Database`, `HorizontalPodAutoscaler` |
| Resource | Plural lowercase | `databases`, `horizontalpodautoscalers` |
| Fields | lowerCamelCase | `replicaCount`, `secretRef` |
| References | `*Ref` suffix | `secretRef`, `configMapRef` |
| Booleans | Positive form | `enabled` not `disabled` |
| Durations | `*Seconds` suffix, int32 | `timeoutSeconds`, `periodSeconds` |
| Numerics | int32 preferred; no floats or unsigned in spec | `replicas`, `minReplicas` |

### Status Conditions (kstatus)

| Condition | Polarity | kstatus reads as | Role |
|-----------|----------|------------------|------|
| `Reconciling` | Abnormal-true | **InProgress** when True | Standard. Controller is working toward desired state |
| `Stalled` | Abnormal-true | **Failed** when True | Standard. Cannot progress, needs intervention |
| `Ready` | Normal-true | **Current** when True | Fallback. Not defined by kstatus; read when `Reconciling`/`Stalled` absent. Most CRDs set all three |

Always set `ObservedGeneration` in conditions and at the top level of status. Without it, callers cannot detect stale status: `status.observedGeneration < metadata.generation`.

See **`references/kstatus-details.md`** for condition transitions, status struct shape, and printer columns.

### Phases (deprecated in status)

`status.phase` as a **top-level rollup string** is deprecated by the Kubernetes API conventions. `Pod.status.phase` and `PVC.status.phase` are the canonical anti-examples. The problem: multiple internal conditions collapse into one value, different consumers care about different sub-states, and the enum can't be extended without breaking existing consumers.

**Use conditions instead** for top-level resource health — they're additive and queryable independently.

The deprecation is specifically about the top-level rollup pattern. These uses of "phase" are **fine**:

| Use | OK? | Reason |
|-----|-----|--------|
| `status.phase` (top-level rollup string) | No | Deprecated — use conditions |
| Per-item `phase` field inside a list (e.g. `pods[].phase`) | Yes | Detail field, not a resource-level rollup |
| `phase` as a domain concept in spec (e.g. lifecycle stages) | Yes | Configuring a workflow, not summarizing resource state |
| Internal state machine phases stored outside the CRD (e.g. annotations) | Yes | Not part of the CRD API contract |

### Optional vs Required Fields

Use pointers to distinguish "not set" from "explicitly set to zero":

```go
type MyResourceSpec struct {
    Name     string `json:"name"`
    Replicas *int32 `json:"replicas,omitempty"`
}
```

**Defaulting strategies**:

| Strategy | Mechanism | Upside | Downside |
|----------|-----------|--------|----------|
| **Static defaults** | `+kubebuilder:default` marker | Simplest; visible in CRD schema; applied at admission | Cannot compute values at runtime |
| **Webhook defaults** | Mutating admission webhook | Dynamic/computed values (e.g., derived from other fields) | Requires webhook infrastructure and cert management |
| **Controller late-init** | Controller fills unset fields on first reconcile | Most flexible; no webhook needed | Spec diffs confuse users and GitOps tools; race window between create and first reconcile |

**Status field defaults** -- the strategies above apply to spec. For status fields representing counters or gauges that should always be present (never nil), use `+kubebuilder:default:=0`. This ensures the field appears immediately after creation and prevents controllers from handling missing-field edge cases on every reconcile:

```go
// +kubebuilder:default:=0
ReadyReplicas int32 `json:"readyReplicas"`
```

Don't use defaults for status fields where "not yet set" is meaningfully different from zero — keep those as pointers.

### Validation

Use kubebuilder markers for declarative validation:

```go
type MyResourceSpec struct {
    // +kubebuilder:validation:Required
    // +kubebuilder:validation:MinLength=1
    // +kubebuilder:validation:Pattern=`^[a-z0-9]([-a-z0-9]*[a-z0-9])?$`
    Name string `json:"name"`

    // +kubebuilder:validation:Minimum=1
    // +kubebuilder:validation:Maximum=100
    Replicas int32 `json:"replicas"`

    // +kubebuilder:validation:Enum=Small;Medium;Large
    Size string `json:"size"`
}
```

**Critical pitfall**: zero values (`""`, `0`) pass `+required` because OpenAPI checks for non-null presence, not content. Always combine with content validation:

```go
//+kubebuilder:validation:MinLength=1
//+required
Name string `json:"name"`
```

**Package-level safety net** -- all fields required by default, explicitly mark exceptions:

```go
//+kubebuilder:validation:Required
package v1beta1
```

**Alternative: Optional-at-type + explicit Required** -- set `Optional` on the type and mark individual required fields. Requiredness is visible at each field rather than inherited from a distant package directive:

```go
// +kubebuilder:validation:Optional
type MyResource struct { ... }

type MyResourceSpec struct {
    // +kubebuilder:validation:Required
    // +kubebuilder:validation:MinLength=1
    Name string `json:"name"`
    Description string `json:"description,omitempty"` // optional by default
}
```

Both strategies work. Pick one per API group and stay consistent.

**Marker typos are silent** -- `controller-gen` ignores unrecognized markers. `enum` vs `Enum` produces no error but no validation. Use the KAL linter: `go install github.com/JoelSpeed/kal@latest`

See **`references/crd-design-pitfalls.md`** for all nine generation pitfalls, API design anti-patterns, and a pre-release validation checklist.

### Immutable Fields

```go
// +kubebuilder:validation:XValidation:rule="self == oldSelf",message="storageClass is immutable"
StorageClass string `json:"storageClass"`
```

**Always make label selectors immutable.** A selector change after creation means the controller either loses track of resources it already owns (old selector no longer matches) or silently acquires unrelated resources. This is why `Service.spec.selector`, `StatefulSet.spec.selector`, and `Deployment.spec.selector` are immutable:

```go
// +kubebuilder:validation:XValidation:rule="self == oldSelf",message="selector is immutable"
Selector metav1.LabelSelector `json:"selector"`
```

**Guard against empty selectors.** An empty `{}` selector matches all resources in the namespace — usually a footgun. Add a CEL rule if your controller must not operate on all resources:

```go
// +kubebuilder:validation:XValidation:rule="size(self.matchLabels) > 0 || size(self.matchExpressions) > 0",message="selector must not be empty"
Selector metav1.LabelSelector `json:"selector"`
```

### CEL Cross-Field Validation

Use `+kubebuilder:validation:XValidation` at the struct level (not field level) to enforce relationships between fields. This is the primary reason to reach for CEL beyond immutability:

```go
// +kubebuilder:validation:XValidation:rule="!has(self.tlsConfig) || has(self.secretRef)",message="secretRef is required when tlsConfig is set"
// +kubebuilder:validation:XValidation:rule="self.minReplicas <= self.maxReplicas",message="minReplicas must not exceed maxReplicas"
type MyResourceSpec struct {
    TLSConfig  *TLSConfig `json:"tlsConfig,omitempty"`
    SecretRef  *SecretRef `json:"secretRef,omitempty"`
    MinReplicas int32     `json:"minReplicas"`
    MaxReplicas int32     `json:"maxReplicas"`
}
```

`has()` tests field presence (works for optional fields). `self.field` accesses the field value. Rules are evaluated in the context of the annotated struct, so cross-field rules belong on the struct, single-field rules belong on the field.

### Enum vs Documented String for Extensible Values

Use `+kubebuilder:validation:Enum` for **closed** value sets. For **open/user-extensible** sets where a fixed enum would be too rigid, document built-in values in a comment and — critically — state what happens with unrecognized values. Silent misbehavior is a footgun:

```go
// Phase is the lifecycle phase before which this hook fires.
// Built-in values: Init, Running, Terminating.
// Custom phase names defined in spec.phases[] are also valid.
// An unrecognized phase name causes the hook to silently never fire.
// +kubebuilder:validation:MinLength=1
// +required
Phase string `json:"phase"`
```

The discipline: whenever an invalid value causes silent misbehavior rather than an admission error, the comment must say so. Users can't diagnose a hook that never fires if nothing tells them the phase name is wrong.

### Design Rules

**Enums over bools in Spec** -- bools cannot grow a third state. Prefer enums for spec fields that might need extension:

```go
// +kubebuilder:validation:Enum=Enabled;Disabled
State string `json:"state"`
```

Bools are acceptable for operational kill-switches (`paused bool`) and status fields representing simple observed state (`reconciled bool`). The extensibility concern targets user-facing spec contracts, not controller-written status.

**`paused` belongs in spec, not as an annotation.** Annotations are for ephemeral, tool-generated metadata. Pause is a user-configured desired state — it belongs in spec where it integrates with GitOps tooling, is schema-validated, and is visible in `kubectl get`. Follow ClusterAPI and Flux conventions:

```go
// +kubebuilder:printcolumn:name="Paused",type=boolean,JSONPath=`.spec.paused`
type MyResource struct { ... }

type MyResourceSpec struct {
    // Paused suspends reconciliation. The controller will not trigger any
    // external operations until this is set back to false.
    // +optional
    Paused bool `json:"paused,omitempty"`
}
```

Always expose `Paused` as a printcolumn and write a status condition (`Reconciling=False, Reason=Suspended`) when paused — returning early without updating status leaves operators no way to confirm the pause is in effect via `kubectl get`.

**Nested structs over concatenated names** -- enables independent evolution:

```go
NodeDrain *NodeDrainConfig `json:"nodeDrain,omitempty"`
```

**`listType=map` for arrays** -- without it, SSA treats lists as atomic (whole-list replacement). With it, SSA merges per-element by key:

```go
// +listType=map
// +listMapKey=name
Settings []SettingItem `json:"settings,omitempty"`

type SettingItem struct {
    Name  string `json:"name"`
    Value string `json:"value"`
}
```

Two field managers can independently own different `Settings` entries by `name`. Without `+listType=map`, applying a list with one entry replaces the entire list.

Note: CRDs do not support strategic merge patch (`--type=strategic`). Use server-side apply or JSON patch for granular list operations.

**`Conditions` requires `+listType=map` too.** This is the most commonly missed case. Without it, SSA replaces the entire conditions list atomically — a secondary controller updating one condition wipes all others:

```go
// +listType=map
// +listMapKey=type
Conditions []metav1.Condition `json:"conditions,omitempty"`
```

**Don't embed external types** -- external APIs evolve independently. Copy and adapt.

**Don't share structs across CRDs** -- binds their evolution together.

**Same-namespace references preferred** -- cross-namespace references need a handshake (e.g. Gateway API's `ReferenceGrant`). Use typed reference structs:

```go
type SecretReference struct {
    Name string `json:"name"`
}
```

**Prefer Patch/SSA over full Update** -- reduces conflicts in multi-controller environments. Server-side apply with field ownership prevents overwrites.

**Print columns should expose health** -- `kubectl get` is the first diagnostic tool operators reach for. Columns showing only internal lifecycle state (drain mode, phase name) without a health indicator leave operators blind. Always include at minimum a `Ready` or `Stalled` column sourced from your conditions, plus `Age`:

```go
// +kubebuilder:printcolumn:name="Ready",type=string,JSONPath=`.status.conditions[?(@.type=="Ready")].status`
// +kubebuilder:printcolumn:name="Stalled",type=string,JSONPath=`.status.conditions[?(@.type=="Stalled")].status`
// +kubebuilder:printcolumn:name="Age",type=date,JSONPath=`.metadata.creationTimestamp`
```

See **`references/crd-design-pitfalls.md`** for detailed API design anti-patterns (embedding external types, shared structs, generic names, bounded enums, maps).

### Concurrency Control

Kubernetes uses optimistic concurrency via `resourceVersion`. Follow the read-modify-write pattern:

1. GET the resource (captures `resourceVersion`)
2. Modify locally
3. UPDATE — server rejects with 409 Conflict if `resourceVersion` changed

Never cache and reuse a stale `resourceVersion`.

### Labels vs Annotations

**Labels**: queryable selectors for grouping and filtering. Keys follow `prefix/name` format. Keep values short (<63 chars).

**Annotations**: arbitrary metadata for tools, automation, and interoperability. Not queryable. Total metadata (labels + annotations) must stay under 256 KB.

### Finalizers

Cleanup pattern for resources that manage external state:

1. During reconcile: if the resource lacks the finalizer and is not being deleted, add it
2. On delete: perform cleanup, then remove finalizer
3. Object cannot be garbage-collected until all finalizers are removed

### Events

Record significant state changes:

- **Reason**: CamelCase, machine-readable (`ProvisioningSucceeded`)
- **Message**: human-readable detail
- Accumulate repeated events — don't spam

### Subresources

The `/status` subresource separates user writes (spec) from controller writes (status). The `/scale` subresource enables HPA integration.

**Scale subresource path must always resolve.** The `specpath` in `+kubebuilder:subresource:scale` must point to a field that exists on every instance of the resource — not through an optional parent. If the path traverses a pointer/optional struct that can be nil, `GET /scale` returns an error and `PATCH /scale` silently does nothing. HPA or KEDA will enter an error state and stop reconciling.

```go
// Bad: replicaManagement is *ReplicaManagementSpec (optional).
// If nil, the scale path .spec.replicaManagement.desiredReplicas doesn't resolve.
// +kubebuilder:subresource:scale:specpath=.spec.replicaManagement.desiredReplicas,...

// Good: surface the scale field at the top level of spec.
// +kubebuilder:subresource:scale:specpath=.spec.replicas,statuspath=.status.replicas
```

### Idempotency

`metadata.name` provides name-based idempotency on create (409 on conflict). Use `generateName` when callers don't need deterministic names.

---

## CRD Schema Evolution

CRDs are contracts. Breaking changes destroy trust and cause outages. Classify every schema change before implementing.

### Quick Reference

| I want to... | Breaking? | Action |
|--------------|-----------|--------|
| Add optional field | No | Add with `omitempty` |
| Add required field | **Yes** | Add default or use webhook |
| Remove field | **Yes** | Converting webhook + deprecation |
| Rename field | **Yes** | Converting webhook + deprecation |
| Change field type | **Yes** | Converting webhook + new version |
| Add enum value | No | Just add it |
| Remove enum value | **Yes** | Migrate resources first |
| Tighten validation | **Yes** | Migrate resources first |
| Relax validation | No | Just update |
| Add printer column | No | Just add marker |
| Add new API version | No | Implement conversion |

### Never Do (Unrecoverable)

| Change | Why |
|--------|-----|
| Change `group` in GVK | Different API entirely |
| Change `kind` name | Different resource type |
| Delete CRD | All resources deleted by kube-apiserver |
| Change UID semantics | Breaks owner references |

For breaking changes, see **`references/converting-webhooks.md`** (hub-and-spoke conversion, round-trip preservation, cert-manager setup) and **`references/migration-procedures.md`** (step-by-step procedures, rollback strategies, production checklists).

---

## References

### Deep Dives

- **`references/kstatus-details.md`** -- kstatus categories, condition transitions, status struct shape, printer columns
- **`references/crd-design-pitfalls.md`** -- generation pitfalls, API design anti-patterns, pre-release checklist
- **`references/converting-webhooks.md`** -- controller-runtime webhook implementation, round-trip preservation, cert-manager setup, testing
- **`references/migration-procedures.md`** -- step-by-step migration procedures, rollback strategies, production checklists

### External

- [Kubernetes API Conventions](https://github.com/kubernetes/community/blob/master/contributors/devel/sig-architecture/api-conventions.md)
- [kstatus Conditions](https://github.com/kubernetes-sigs/cli-utils/blob/master/pkg/kstatus/README.md)
- [Kubebuilder Book](https://book.kubebuilder.io/)
