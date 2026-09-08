# Converting Webhooks

Converting webhooks translate between API versions of a CRD. The kube-apiserver invokes a converting webhook when a client requests a version different from the storage version.

## When Required

**Mandatory** when serving multiple API versions with:
- Schema differences (field renames, type changes, restructured objects, split/merged fields)

**Not required** when:
- Serving one API version
- Versions are identical (aliased)
- Only adding optional fields (additive changes)

## Architecture

```
Client (v1alpha1) -> API Server -> Converting Webhook -> Storage (v1)
                                          |
                                Translates to storage version
                                          |
                                Stores as v1 in etcd
                                          |
                                Response translated back to v1alpha1
```

## Controller-Runtime Implementation

### Project Structure

```
api/
  v1/
    myresource_types.go      # Hub version (storage)
    groupversion_info.go
  v1alpha1/
    myresource_types.go      # Spoke version
    myresource_conversion.go # Conversion logic
    groupversion_info.go
```

### Step 1: Mark Storage Version

```go
// +kubebuilder:object:root=true
// +kubebuilder:subresource:status
// +kubebuilder:storageversion
type MyResource struct {
    metav1.TypeMeta   `json:",inline"`
    metav1.ObjectMeta `json:"metadata,omitempty"`
    Spec   MyResourceSpec   `json:"spec,omitempty"`
    Status MyResourceStatus `json:"status,omitempty"`
}
```

### Step 2: Implement Hub Interface

```go
func (*MyResource) Hub() {}
```

### Step 3: Implement Convertible Interface

In `api/v1alpha1/myresource_conversion.go`:

```go
func (src *MyResource) ConvertTo(dstRaw conversion.Hub) error {
    dst := dstRaw.(*v1.MyResource)

    // DeepCopy ObjectMeta — a plain struct assignment aliases mutable fields
    // (Labels, Annotations, Finalizers, OwnerReferences). Mutating any of
    // these on dst silently corrupts src.
    dst.ObjectMeta = *src.ObjectMeta.DeepCopy()

    dst.Spec.Name = src.Spec.OldName
    dst.Spec.Config = convertConfigToV1(src.Spec.ConfigString)
    dst.Status.Conditions = src.Status.Conditions
    dst.Status.ObservedGeneration = src.Status.ObservedGeneration
    return nil
}

func (dst *MyResource) ConvertFrom(srcRaw conversion.Hub) error {
    src := srcRaw.(*v1.MyResource)
    dst.ObjectMeta = *src.ObjectMeta.DeepCopy()

    dst.Spec.OldName = src.Spec.Name
    dst.Spec.ConfigString = convertConfigFromV1(src.Spec.Config)
    dst.Status.Conditions = src.Status.Conditions
    dst.Status.ObservedGeneration = src.Status.ObservedGeneration
    return nil
}
```

### Step 4: Register Webhook

```go
if err := (&v1.MyResource{}).SetupWebhookWithManager(mgr); err != nil {
    setupLog.Error(err, "unable to create webhook", "webhook", "MyResource")
    os.Exit(1)
}
```

### Step 5: Generate Manifests

Conversion webhooks do not use `+kubebuilder:webhook` markers (those are for admission webhooks). `controller-gen` detects `conversion.Hub` and `conversion.Convertible` implementations and configures the CRD's `spec.conversion` strategy automatically.

```bash
make manifests
```

Verify the generated CRD has `conversion.strategy: Webhook` and `conversionReviewVersions: ["v1"]`.

## Preserving Hub-Only Fields (Round-Trip Compatibility)

Conversion must be lossless: `v1alpha1 → v1 → v1alpha1` must equal the original. When the hub has fields the spoke lacks, the spoke→hub→spoke round-trip loses those fields unless explicitly preserved.

**Pattern**: Store hub-only field values in a `<domain>/conversion-data` annotation on the spoke, then restore them when converting back to the hub.

```go
const conversionAnnotation = "example.com/conversion-data"

// Use pointers for preserved fields — distinguishes "zero" from "unset".
type conversionData struct {
    StorageClass  *string `json:"storageClass,omitempty"`
    RetentionDays *int    `json:"retentionDays,omitempty"`
}
```

**In ConvertTo** (spoke → hub): restore preserved fields, then delete the annotation.

```go
if raw, ok := dst.Annotations[conversionAnnotation]; ok {
    var preserved conversionData
    if err := json.Unmarshal([]byte(raw), &preserved); err != nil {
        return fmt.Errorf("corrupt conversion annotation: %w", err)
    }
    if preserved.StorageClass != nil {
        dst.Spec.StorageClass = preserved.StorageClass
    }
    delete(dst.Annotations, conversionAnnotation)
}
```

**In ConvertFrom** (hub → spoke): capture hub-only fields into the annotation.

```go
preserved := conversionData{}
needsAnnotation := false
if src.Spec.StorageClass != nil {
    preserved.StorageClass = src.Spec.StorageClass
    needsAnnotation = true
}
if needsAnnotation {
    data, err := json.Marshal(preserved)
    if err != nil {
        return fmt.Errorf("marshal conversion data: %w", err)
    }
    if dst.Annotations == nil {
        dst.Annotations = make(map[string]string)
    }
    dst.Annotations[conversionAnnotation] = string(data)
}
```

Key rules:
- Return unmarshal errors — swallowing them hides corrupt data.
- Use pointer types in `conversionData` to distinguish zero values from absent fields.
- Annotation keys are implementation details — follow the `<domain>/<name>` convention.

## Certificate Management

Converting webhooks require TLS. Use cert-manager:

```yaml
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: serving-cert
  namespace: system
spec:
  dnsNames:
  - webhook-service.system.svc
  - webhook-service.system.svc.cluster.local
  issuerRef:
    kind: Issuer
    name: selfsigned-issuer
  secretName: webhook-server-cert
---
apiVersion: cert-manager.io/v1
kind: Issuer
metadata:
  name: selfsigned-issuer
  namespace: system
spec:
  selfSigned: {}
```

Inject CA bundle into the CRD:

```yaml
apiVersion: apiextensions.k8s.io/v1
kind: CustomResourceDefinition
metadata:
  annotations:
    cert-manager.io/inject-ca-from: system/serving-cert
  name: myresources.mygroup.example.com
```

## Testing

### Unit Tests

```go
func TestConversion(t *testing.T) {
    tests := []struct {
        name     string
        v1alpha1 *v1alpha1.MyResource
        wantV1   *v1.MyResource
    }{
        {
            name: "field rename conversion",
            v1alpha1: &v1alpha1.MyResource{
                Spec: v1alpha1.MyResourceSpec{OldName: "test-value"},
            },
            wantV1: &v1.MyResource{
                Spec: v1.MyResourceSpec{Name: "test-value"},
            },
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            converted := &v1.MyResource{}
            require.NoError(t, tt.v1alpha1.ConvertTo(converted))
            assert.Equal(t, tt.wantV1.Spec.Name, converted.Spec.Name)

            roundTrip := &v1alpha1.MyResource{}
            require.NoError(t, roundTrip.ConvertFrom(converted))
            assert.Equal(t, tt.v1alpha1.Spec.OldName, roundTrip.Spec.OldName)
        })
    }
}
```

### Integration Tests with envtest

```go
func TestConversionWebhook(t *testing.T) {
    ctx := context.Background()

    v1alpha1Resource := &v1alpha1.MyResource{
        ObjectMeta: metav1.ObjectMeta{Name: "test-resource", Namespace: "default"},
        Spec:       v1alpha1.MyResourceSpec{OldName: "test-value"},
    }
    require.NoError(t, k8sClient.Create(ctx, v1alpha1Resource))

    v1Resource := &v1.MyResource{}
    require.NoError(t, k8sClient.Get(ctx, client.ObjectKeyFromObject(v1alpha1Resource), v1Resource))
    assert.Equal(t, "test-value", v1Resource.Spec.Name)
}
```

## Common Pitfalls

**ObjectMeta aliasing** -- `dst.ObjectMeta = src.ObjectMeta` shallow-copies the struct. Labels, Annotations, Finalizers, and OwnerReferences still share the underlying maps/slices, so mutating `dst` silently corrupts `src`. Fix: `dst.ObjectMeta = *src.ObjectMeta.DeepCopy()`.

**Nil pointer panics** -- always guard pointer dereferences:

```go
if src.Spec.Config != nil {
    dst.Spec.Config = *src.Spec.Config
}
```

**Swallowed errors** -- `if err := json.Unmarshal(...); err == nil { ... }` silently drops corrupt annotation data. Return conversion errors so they surface as API errors.

**Zero-value ambiguity in preserved data** -- bare `int` or `string` in conversion data structs cannot distinguish "explicitly zero/empty" from "not set". Use pointers.

**Mutating source** -- never modify `src` in ConvertTo/ConvertFrom. Only read from source, write to destination.

**Missing scheme registration** -- both versions must call `SchemeBuilder.Register()` in their `init()`.
