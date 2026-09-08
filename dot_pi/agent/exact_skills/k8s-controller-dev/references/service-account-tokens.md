# ServiceAccount Tokens & TokenRequest API

Token patterns for controllers that authenticate to external systems or mint credentials for managed workloads.

## Why TokenRequest Over Static Tokens

Legacy SA tokens (stored as Secrets) never expire and aren't bound to any object — exfiltration means permanent credential exposure. The TokenRequest API (`authentication.k8s.io/v1`) issues short-lived, audience-scoped JWTs that expire (default 1h), can be bound to a Pod (auto-revoked on deletion), and are never persisted to etcd. GA since v1.20.

Most controllers never need to call TokenRequest explicitly — the kubelet-managed projected volume handles in-cluster API server auth automatically.

## When to Call TokenRequest Explicitly

Call it only when the projected volume isn't sufficient:

| Scenario | Why projected volume isn't enough |
|----------|-----------------------------------|
| **Multi-cluster auth** | Controller authenticates against remote API servers; need tokens scoped to each cluster's audience |
| **Audience-scoped tokens** | Talking to webhooks or external services that validate JWT `aud` claims; the default token targets only the apiserver |
| **Tokens on behalf of other SAs** | Controller manages workloads that need their own identity; mint short-lived tokens bound to the target pod instead of creating static Secrets |

If your controller only talks to its own cluster's API server, you don't need explicit TokenRequest.

## Issuing Tokens

Via controller-runtime (SubResource):

```go
tokenReq := &authenticationv1.TokenRequest{
    Spec: authenticationv1.TokenRequestSpec{
        Audiences:         []string{"my-service.example.com"},
        ExpirationSeconds: ptr.To[int64](86400), // 24h
    },
}
err = c.SubResource("token").Create(ctx, sa, tokenReq)
// token is in tokenReq.Status.Token
```

Via client-go:

```go
tokenReq, err := clientset.CoreV1().ServiceAccounts(ns).CreateToken(
    ctx, saName, tokenReq, metav1.CreateOptions{},
)
```

Key parameters:
- **`audiences`**: set explicitly for cross-service auth to prevent token reuse across services
- **`expirationSeconds`**: capped by `--service-account-max-token-expiration` on the API server — always check `status.expirationTimestamp` on the response
- **`boundObjectRef`**: bind to a Pod, Secret, or Node; token auto-revoked when the bound object is deleted

## Token Renewal Pattern

Tokens are process-scoped — never persist them or share across processes. On crash, request a fresh token on restart.

The standard pattern for controllers authenticating to external systems:

```go
type tokenCache struct {
    mu     sync.Mutex
    tokens map[types.NamespacedName]cachedToken
}

type cachedToken struct {
    token     string
    expiresAt time.Time
}

func (tc *tokenCache) RoundTrip(req *http.Request) (*http.Response, error) {
    // Inject cached token if unexpired, otherwise request a new one
    // before the old expires (e.g., 24h tokens, re-request at 20h mark)
}
```

1. Request a new token on startup
2. Cache tokens in memory per-SA via an `http.RoundTripper`
3. On each request: use cached token if unexpired, otherwise mint a new one before expiry
4. Reap expired entries for inactive SAs
