# Platform and SDK Guidance
Start with the workflow's proto definitions. Generated interfaces, clients, and test helpers define the supported contract; do not infer names or request shapes from an older example.

## Discover the supported API
1. Read the proto and its Temporal options.
2. Find the generated worker interface, client, and test helper.
3. Read the worker implementation and bootstrap registration.
4. Read callers and nearby workers before changing a public workflow or activity contract.

Use generated Atlas clients for calls within the same worker and across workers. Generated APIs preserve registered names, request types, and supported invocation patterns. Do not bypass an Atlas abstraction with a direct Temporal client, worker API, or test-suite API when an Atlas equivalent exists.

## Cross-worker calls
Treat another worker's generated client as a contract boundary. Confirm its proto request and response types, retry behavior, and current call pattern. In tests, use generated helpers and dependency support rather than manually registering names unless the repository already requires a documented exception.

## Source precedence
Current `dd-source` code and generated output are authoritative. Nearby production workers establish repository conventions. This reference explains durable choices but must not override either source.
