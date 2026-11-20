# Testing Patterns for Kubernetes Controllers

Complete templates and advanced topics for controller testing. SKILL.md covers core patterns; start there.

## Complete Suite Setup

Complete `TestMain()` pattern for `suite_test.go`. Adapt imports and types for each project:

```go
package controller

import (
    "context"
    "os"
    "path/filepath"
    "testing"
    "time"

    . "github.com/onsi/gomega"
    "k8s.io/client-go/kubernetes/scheme"
    ctrl "sigs.k8s.io/controller-runtime"
    "sigs.k8s.io/controller-runtime/pkg/client"
    "sigs.k8s.io/controller-runtime/pkg/envtest"
    logf "sigs.k8s.io/controller-runtime/pkg/log"
    "sigs.k8s.io/controller-runtime/pkg/log/zap"

    myv1 "example.com/myproject/api/v1"
)

var (
    testEnv   *envtest.Environment
    k8sClient client.Client
    ctx       context.Context
    cancel    context.CancelFunc
)

const (
    timeout  = 10 * time.Second
    interval = 100 * time.Millisecond
)

func TestMain(m *testing.M) {
    logf.SetLogger(zap.New(zap.WriteTo(os.Stderr), zap.UseDevMode(true)))
    ctx, cancel = context.WithCancel(context.Background())

    testEnv = &envtest.Environment{
        CRDDirectoryPaths:     []string{filepath.Join("..", "..", "config", "crd", "bases")},
        ErrorIfCRDPathMissing: true,
        // Uncomment for webhook testing:
        // WebhookInstallOptions: envtest.WebhookInstallOptions{
        //     Paths: []string{filepath.Join("..", "..", "config", "webhook")},
        // },
    }

    cfg, err := testEnv.Start()
    if err != nil { panic(err) }

    err = myv1.AddToScheme(scheme.Scheme)
    if err != nil { panic(err) }

    k8sClient, err = client.New(cfg, client.Options{Scheme: scheme.Scheme})
    if err != nil { panic(err) }

    mgr, err := ctrl.NewManager(cfg, ctrl.Options{
        Scheme:                 scheme.Scheme,
        HealthProbeBindAddress: "",
    })
    if err != nil { panic(err) }

    if err = (&MyResourceReconciler{
        Client: mgr.GetClient(),
        Scheme: mgr.GetScheme(),
    }).SetupWithManager(mgr); err != nil { panic(err) }

    go func() {
        if err := mgr.Start(ctx); err != nil { panic(err) }
    }()

    code := m.Run()
    cancel()
    if err := testEnv.Stop(); err != nil { panic(err) }
    os.Exit(code)
}
```

## Canonical Integration Tests

Five tests covering the core controller lifecycle. Place in `myresource_controller_test.go` alongside `suite_test.go`.

### Test 1: Create — verify Ready condition + child Deployment

```go
func TestMyResourceReconciler_CreateResource(t *testing.T) {
    g := NewWithT(t)
    ns := createTestNamespace(t, g)

    resource := &myv1.MyResource{
        ObjectMeta: metav1.ObjectMeta{GenerateName: "test-", Namespace: ns},
        Spec:       myv1.MyResourceSpec{Replicas: 3, Image: "nginx:latest"},
    }
    g.Expect(k8sClient.Create(ctx, resource)).To(Succeed())
    t.Cleanup(func() {
        g.Expect(client.IgnoreNotFound(k8sClient.Delete(ctx, resource))).To(Succeed())
    })

    g.Eventually(func(g Gomega) {
        g.Expect(k8sClient.Get(ctx, client.ObjectKeyFromObject(resource), resource)).To(Succeed())
        cond := meta.FindStatusCondition(resource.Status.Conditions, "Ready")
        g.Expect(cond).NotTo(BeNil())
        g.Expect(cond.Status).To(Equal(metav1.ConditionTrue))
        g.Expect(cond.ObservedGeneration).To(Equal(resource.Generation))
    }, timeout, interval).Should(Succeed())

    dep := &appsv1.Deployment{}
    g.Expect(k8sClient.Get(ctx, client.ObjectKeyFromObject(resource), dep)).To(Succeed())
    g.Expect(dep.OwnerReferences).To(HaveLen(1))
    g.Expect(*dep.Spec.Replicas).To(Equal(int32(3)))
}
```

### Test 2: Update — verify new generation reconciled

```go
func TestMyResourceReconciler_UpdateResource(t *testing.T) {
    g := NewWithT(t)
    ns := createTestNamespace(t, g)

    resource := &myv1.MyResource{
        ObjectMeta: metav1.ObjectMeta{GenerateName: "test-", Namespace: ns},
        Spec:       myv1.MyResourceSpec{Replicas: 1, Image: "nginx:1.24"},
    }
    g.Expect(k8sClient.Create(ctx, resource)).To(Succeed())
    t.Cleanup(func() {
        g.Expect(client.IgnoreNotFound(k8sClient.Delete(ctx, resource))).To(Succeed())
    })

    // Wait for initial Ready
    g.Eventually(func(g Gomega) {
        g.Expect(k8sClient.Get(ctx, client.ObjectKeyFromObject(resource), resource)).To(Succeed())
        cond := meta.FindStatusCondition(resource.Status.Conditions, "Ready")
        g.Expect(cond).NotTo(BeNil())
        g.Expect(cond.Status).To(Equal(metav1.ConditionTrue))
    }, timeout, interval).Should(Succeed())

    originalGeneration := resource.Generation
    resource.Spec.Replicas = 5
    g.Expect(k8sClient.Update(ctx, resource)).To(Succeed())

    g.Eventually(func(g Gomega) {
        g.Expect(k8sClient.Get(ctx, client.ObjectKeyFromObject(resource), resource)).To(Succeed())
        g.Expect(resource.Generation).To(BeNumerically(">", originalGeneration))
        cond := meta.FindStatusCondition(resource.Status.Conditions, "Ready")
        g.Expect(cond).NotTo(BeNil())
        g.Expect(cond.ObservedGeneration).To(Equal(resource.Generation))
    }, timeout, interval).Should(Succeed())

    dep := &appsv1.Deployment{}
    g.Expect(k8sClient.Get(ctx, client.ObjectKeyFromObject(resource), dep)).To(Succeed())
    g.Expect(*dep.Spec.Replicas).To(Equal(int32(5)))
}
```

### Test 3: Delete — verify finalizer cleanup

```go
func TestMyResourceReconciler_DeleteResource(t *testing.T) {
    g := NewWithT(t)
    ns := createTestNamespace(t, g)

    resource := &myv1.MyResource{
        ObjectMeta: metav1.ObjectMeta{GenerateName: "test-", Namespace: ns},
        Spec:       myv1.MyResourceSpec{Replicas: 1},
    }
    g.Expect(k8sClient.Create(ctx, resource)).To(Succeed())

    g.Eventually(func(g Gomega) {
        g.Expect(k8sClient.Get(ctx, client.ObjectKeyFromObject(resource), resource)).To(Succeed())
        cond := meta.FindStatusCondition(resource.Status.Conditions, "Ready")
        g.Expect(cond).NotTo(BeNil())
        g.Expect(cond.Status).To(Equal(metav1.ConditionTrue))
    }, timeout, interval).Should(Succeed())

    g.Expect(k8sClient.Delete(ctx, resource)).To(Succeed())

    g.Eventually(func() bool {
        err := k8sClient.Get(ctx, client.ObjectKeyFromObject(resource), resource)
        return apierrors.IsNotFound(err)
    }, timeout, interval).Should(BeTrue())
}
```

### Test 4: Invalid spec — verify error condition

```go
func TestMyResourceReconciler_InvalidSpec(t *testing.T) {
    g := NewWithT(t)
    ns := createTestNamespace(t, g)

    resource := &myv1.MyResource{
        ObjectMeta: metav1.ObjectMeta{GenerateName: "test-", Namespace: ns},
        Spec:       myv1.MyResourceSpec{Replicas: -1}, // Invalid
    }

    err := k8sClient.Create(ctx, resource)
    if err != nil {
        g.Expect(err.Error()).To(ContainSubstring("invalid")) // Webhook rejected
        return
    }
    t.Cleanup(func() {
        g.Expect(client.IgnoreNotFound(k8sClient.Delete(ctx, resource))).To(Succeed())
    })

    g.Eventually(func(g Gomega) {
        g.Expect(k8sClient.Get(ctx, client.ObjectKeyFromObject(resource), resource)).To(Succeed())
        cond := meta.FindStatusCondition(resource.Status.Conditions, "Ready")
        g.Expect(cond).NotTo(BeNil())
        g.Expect(cond.Status).To(Equal(metav1.ConditionFalse))
        g.Expect(cond.Reason).To(Equal("InvalidSpec"))
    }, timeout, interval).Should(Succeed())
}
```

### Test 5: Idempotence — no unexpected reconciliation

```go
func TestMyResourceReconciler_NoUnexpectedReconciliation(t *testing.T) {
    g := NewWithT(t)
    ns := createTestNamespace(t, g)

    resource := &myv1.MyResource{
        ObjectMeta: metav1.ObjectMeta{GenerateName: "test-", Namespace: ns},
        Spec:       myv1.MyResourceSpec{Replicas: 1},
    }
    g.Expect(k8sClient.Create(ctx, resource)).To(Succeed())
    t.Cleanup(func() {
        g.Expect(client.IgnoreNotFound(k8sClient.Delete(ctx, resource))).To(Succeed())
    })

    g.Eventually(func(g Gomega) {
        g.Expect(k8sClient.Get(ctx, client.ObjectKeyFromObject(resource), resource)).To(Succeed())
        cond := meta.FindStatusCondition(resource.Status.Conditions, "Ready")
        g.Expect(cond).NotTo(BeNil())
        g.Expect(cond.Status).To(Equal(metav1.ConditionTrue))
    }, timeout, interval).Should(Succeed())

    g.Expect(k8sClient.Get(ctx, client.ObjectKeyFromObject(resource), resource)).To(Succeed())
    initialResourceVersion := resource.ResourceVersion

    g.Consistently(func(g Gomega) {
        g.Expect(k8sClient.Get(ctx, client.ObjectKeyFromObject(resource), resource)).To(Succeed())
        g.Expect(resource.ResourceVersion).To(Equal(initialResourceVersion))
    }, 2*time.Second, 200*time.Millisecond).Should(Succeed())
}
```

### Namespace helper

```go
func createTestNamespace(t *testing.T, g Gomega) string {
    t.Helper()
    ns := &corev1.Namespace{
        ObjectMeta: metav1.ObjectMeta{GenerateName: "test-"},
    }
    g.Expect(k8sClient.Create(ctx, ns)).To(Succeed())
    t.Cleanup(func() {
        g.Expect(client.IgnoreNotFound(k8sClient.Delete(ctx, ns))).To(Succeed())
    })
    return ns.Name
}
```

## fakeclient Limitations

The fakeclient (`client/fake`) is fast but has significant gaps:

| Limitation | Impact |
|-----------|--------|
| No `creationTimestamp`, `resourceVersion`, `generation`, `uid` | Logic depending on these fields breaks silently |
| No webhook execution | Validation/mutation webhooks never fire |
| Status subresource requires `WithStatusSubresource()` | `Status().Update()` silently ignored without opt-in |
| No server-side apply | SSA and strategic merge patches behave differently |
| No conversion webhooks | Multi-version CRDs won't convert correctly |
| No cache | No cache sync behavior to test against |

```go
// WRONG: status updates silently ignored
client := fake.NewClientBuilder().WithObjects(resource).Build()
resource.Status.Phase = "Ready"
client.Status().Update(ctx, resource) // No-op!

// CORRECT: opt in to status subresource
client := fake.NewClientBuilder().
    WithObjects(resource).
    WithStatusSubresource(resource).
    Build()
```

**When to use fakeclient**: pure business logic (`calculateDesiredReplicas`), helper functions (`buildDeployment`), input validation, error handling paths. Never for full reconciliation loops.

## Mocking External APIs

Mock at the interface boundary for controllers calling cloud providers or external services.

### Service Factory Pattern (CAPA)

Injectable factories — nil in production, injected in tests:

```go
type MyReconciler struct {
    client.Client
    cloudServiceFactory func(scope Scope) CloudInterface // nil in production
}

func (r *MyReconciler) getCloudService(s Scope) CloudInterface {
    if r.cloudServiceFactory != nil {
        return r.cloudServiceFactory(s)
    }
    return cloud.NewService(s)
}
```

Test setup:

```go
mockCtrl := gomock.NewController(t)
mockCloud := mocks.NewMockCloudInterface(mockCtrl)
mockCloud.EXPECT().Create(gomock.Any(), gomock.Any()).Return("id-123", nil)

reconciler := &MyReconciler{
    Client: k8sClient,
    cloudServiceFactory: func(s Scope) CloudInterface { return mockCloud },
}
```

### GoMock

For AWS/cloud SDK interfaces. Generate mocks, create reusable helper functions:

```go
mockgen -destination=test/mocks/cloud_mock.go -package=mocks \
    example.com/project/pkg/cloud CloudInterface
```

Compose mock helpers for common scenarios:

```go
func mockedCreateCalls(m *mocks.MockCloudInterfaceMockRecorder) {
    m.Create(gomock.Any(), gomock.Any()).Return("resource-id", nil)
}

func mockedGetCalls(m *mocks.MockCloudInterfaceMockRecorder, id string) {
    m.Get(gomock.Any(), id).Return(&Resource{ID: id, Status: "ready"}, nil)
}

func mockedFullLifecycle(m *mocks.MockCloudInterfaceMockRecorder) {
    mockedCreateCalls(m)
    mockedGetCalls(m, "resource-id")
}
```

### Simple Interface Stubs

For quick iteration without GoMock:

```go
type MockCloudProvider struct {
    CreateFunc func(ctx context.Context, spec Spec) (string, error)
    GetFunc    func(ctx context.Context, id string) (*Resource, error)
    DeleteFunc func(ctx context.Context, id string) error
}

func (m *MockCloudProvider) Create(ctx context.Context, spec Spec) (string, error) {
    if m.CreateFunc != nil {
        return m.CreateFunc(ctx, spec)
    }
    return "mock-id", nil
}
```

### httptest for HTTP APIs

```go
server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
    switch {
    case r.Method == "POST" && r.URL.Path == "/instances":
        w.WriteHeader(http.StatusCreated)
        json.NewEncoder(w).Encode(map[string]string{"id": "mock-123"})
    case r.Method == "GET" && strings.HasPrefix(r.URL.Path, "/instances/"):
        json.NewEncoder(w).Encode(map[string]string{"id": "mock-123", "state": "running"})
    default:
        w.WriteHeader(http.StatusNotFound)
    }
}))
defer server.Close()
```

**Prefer**: mock at the interface level, not HTTP transport. Interface mocks are less brittle.

## Test Builders

Fluent API for test objects — reduces boilerplate, centralizes defaults:

```go
type MyResourceBuilder struct {
    resource *myv1.MyResource
}

func MyResource(namespace, name string) *MyResourceBuilder {
    return &MyResourceBuilder{
        resource: &myv1.MyResource{
            ObjectMeta: metav1.ObjectMeta{
                Namespace: namespace, Name: name, Generation: 1,
            },
            Spec: myv1.MyResourceSpec{Replicas: 1},
        },
    }
}

func (b *MyResourceBuilder) WithReplicas(n int32) *MyResourceBuilder {
    b.resource.Spec.Replicas = n
    return b
}

func (b *MyResourceBuilder) WithFinalizer(f string) *MyResourceBuilder {
    b.resource.Finalizers = append(b.resource.Finalizers, f)
    return b
}

func (b *MyResourceBuilder) WithDeletionTimestamp() *MyResourceBuilder {
    now := metav1.Now()
    b.resource.DeletionTimestamp = &now
    return b
}

func (b *MyResourceBuilder) Build() *myv1.MyResource {
    return b.resource.DeepCopy()
}
```

Usage:

```go
resource := builder.MyResource(ns, "test").
    WithReplicas(3).
    WithFinalizer("mygroup.io/cleanup").
    Build()
```

## Wait Helpers

Reusable async assertion helpers:

```go
func WaitForCondition(ctx context.Context, g Gomega, c client.Client,
    obj client.Object, condType string, status metav1.ConditionStatus,
    timeout, interval time.Duration) {
    key := client.ObjectKeyFromObject(obj)
    g.EventuallyWithOffset(1, func(g Gomega) {
        fresh := obj.DeepCopyObject().(client.Object)
        g.Expect(c.Get(ctx, key, fresh)).To(Succeed())
        cond := meta.FindStatusCondition(getConditions(fresh), condType)
        g.Expect(cond).NotTo(BeNil())
        g.Expect(cond.Status).To(Equal(status))
    }, timeout, interval).Should(Succeed())
}

func WaitForDeletion(ctx context.Context, g Gomega, c client.Client,
    obj client.Object, timeout, interval time.Duration) {
    key := client.ObjectKeyFromObject(obj)
    g.EventuallyWithOffset(1, func() error {
        return c.Get(ctx, key, obj.DeepCopyObject().(client.Object))
    }, timeout, interval).Should(MatchError(ContainSubstring("not found")))
}

func WaitForResourceCount(ctx context.Context, g Gomega, c client.Client,
    list client.ObjectList, count int, timeout, interval time.Duration,
    opts ...client.ListOption) {
    g.EventuallyWithOffset(1, func(g Gomega) {
        fresh := list.DeepCopyObject().(client.ObjectList)
        g.Expect(c.List(ctx, fresh, opts...)).To(Succeed())
        g.Expect(meta.ExtractList(fresh)).To(HaveLen(count))
    }, timeout, interval).Should(Succeed())
}
```

## komega Utilities

`sigs.k8s.io/controller-runtime/pkg/envtest/komega` provides Kubernetes-aware Gomega matchers:

```go
k := komega.New(g)

k.Get(resource).Should(Succeed())
k.Object(resource).Should(HaveField("Status.Phase", Equal("Ready")))

list := &myv1.MyResourceList{}
k.ObjectList(list, client.InNamespace(ns)).Should(HaveField("Items", HaveLen(1)))

g.Eventually(k.Object(resource)).Should(
    HaveField("Status.Conditions", ContainElement(HaveField("Type", Equal("Ready")))),
)
```

## Webhook Testing

envtest supports webhook testing with `WebhookInstallOptions`:

```go
testEnv = &envtest.Environment{
    CRDDirectoryPaths:     []string{filepath.Join("..", "..", "config", "crd", "bases")},
    ErrorIfCRDPathMissing: true,
    WebhookInstallOptions: envtest.WebhookInstallOptions{
        Paths: []string{filepath.Join("..", "..", "config", "webhook")},
    },
}
```

CAPA uses a `TestEnvironmentConfiguration` builder to compose webhook configs:

```go
testEnvConfig := helpers.NewTestEnvironmentConfiguration(crdPaths).
    WithWebhookConfiguration("unmanaged", webhookPath)
testEnv, err = testEnvConfig.Build()
// Register webhooks
(&myv1.MyResource{}).SetupWebhookWithManager(testEnv)
go testEnv.StartManager(ctx)
testEnv.WaitForWebhooks()
```

## Custom Gomega Matchers

For domain-specific assertions:

```go
func HaveCondition(condType string, status metav1.ConditionStatus) types.GomegaMatcher {
    return &conditionMatcher{condType: condType, status: status}
}

type conditionMatcher struct {
    condType string
    status   metav1.ConditionStatus
}

func (m *conditionMatcher) Match(actual interface{}) (bool, error) {
    obj, ok := actual.(client.Object)
    if !ok {
        return false, fmt.Errorf("HaveCondition expects a client.Object")
    }
    cond := meta.FindStatusCondition(getConditions(obj), m.condType)
    if cond == nil {
        return false, nil
    }
    return cond.Status == m.status, nil
}

func (m *conditionMatcher) FailureMessage(actual interface{}) string {
    return fmt.Sprintf("Expected condition %q with status %q", m.condType, m.status)
}

func (m *conditionMatcher) NegatedFailureMessage(actual interface{}) string {
    return fmt.Sprintf("Expected condition %q to not have status %q", m.condType, m.status)
}
```

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Do Instead |
|-------------|-------------|------------|
| Table-driven Ginkgo (`DescribeTable`) | Poor failure output, hard to debug | Explicit Ginkgo specs or standard Go `t.Run` |
| Immediate assertions after Create | Cache hasn't synced | Always `Eventually` |
| Missing `t.Cleanup()` | envtest has no GC; resources leak between tests | Explicit cleanup for every created resource |
| Provider-specific assertions | Brittle, breaks for other providers | Assert on interfaces, not concrete types |
| Mocking HTTP transport | Coupled to implementation details | Mock at the interface level |
| Shared mutable state between subtests | Flaky tests, order-dependent | Deep copy objects, isolated namespaces |

## Test Organization

```
internal/controller/
├── suite_test.go                    # envtest setup with TestMain()
├── myresource_controller.go
├── myresource_controller_test.go    # Integration tests (envtest)
└── helpers_test.go                  # Unit tests (fakeclient or pure)

internal/test/
├── builder/                         # Fluent test object builders
├── helpers.go                       # Wait helpers, namespace creation
└── matchers.go                      # Custom Gomega matchers

test/e2e/
├── suite_test.go                    # kind cluster setup (Ginkgo)
├── data/                            # Test manifests
└── myresource_e2e_test.go           # E2E tests
```

## References

- [Cluster API Testing Guide](https://cluster-api.sigs.k8s.io/developer/core/testing)
- [CAPA Test Helpers](https://github.com/kubernetes-sigs/cluster-api-provider-aws/tree/main/test/helpers)
- [CAPV Test Helpers](https://github.com/kubernetes-sigs/cluster-api-provider-vsphere/tree/main/internal/test/helpers)
- [komega Package](https://pkg.go.dev/sigs.k8s.io/controller-runtime/pkg/envtest/komega)
- [Custom Gomega Matchers](https://onsi.github.io/gomega/#adding-your-own-matchers)
