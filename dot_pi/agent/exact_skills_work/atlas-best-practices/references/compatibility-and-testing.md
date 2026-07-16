# Compatibility and Testing
A deployed workflow must replay its existing history. Treat payload type changes and adding, removing, or reordering workflow commands as compatibility-sensitive changes.

## Version gates
When a change can alter recorded behavior, gate it with `workflow.GetVersion` and `workflow.DefaultVersion`. Keep the old and new paths replay-safe. Gate names are durable, and the maximum supported gate version only increases; never decrement or reuse a previous maximum for a different meaning.

Before a risky change, run Breaking Change Detection and record a baseline. Run it again after the change and compare failures with the baseline. New failures block deployment; pre-existing failures still need explicit comparison rather than dismissal.

Do not remove an old gate merely because a version search returns no old executions. A conditional or not-yet-evaluated gate might not be visible in that search attribute. Establish safe evidence that relevant long-running histories cannot reach the old path, then run Breaking Change Detection before and after removal.

## Tests and evidence
Use the generated Atlas test helper and the repository's Atlas test-suite pattern. Mock external activities and child workflows through supported helpers, assert important requests and invocations, and test the public workflow behavior.

Add replay tests for high-risk changes, prior determinism failures, or important real histories. Before deployment, collect the focused test result, any replay result, Breaking Change Detection baseline and comparison, and the detected worker's repository-native validation result.
