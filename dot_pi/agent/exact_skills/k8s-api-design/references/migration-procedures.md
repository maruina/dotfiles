# CRD Migration Procedures

Step-by-step procedures for safely migrating CRD schemas in production. Each procedure includes pre-flight checks, execution steps, verification, and rollback.

## Risk Overview

| Category | Risk | Duration | Downtime |
|----------|------|----------|----------|
| Optional field addition | Low | Minutes | No |
| Field deprecation | Medium | Weeks | No |
| Breaking schema change | High | Hours-Days | Possibly |
| API version removal | Critical | Months | No |

---

## Procedure 1: Adding Optional Fields

**Risk**: Low.

1. Add field with pointer type and `omitempty`:
   ```go
   NewField *string `json:"newField,omitempty"`
   ```

2. Regenerate and apply:
   ```bash
   make generate manifests
   kubectl apply -f config/crd/bases/
   ```

3. Verify existing resources still work:
   ```bash
   kubectl get myresources -A
   ```

4. Update and deploy controller.

**Rollback**: Apply previous CRD, rollback controller deployment.

---

## Procedure 2: Adding Required Field with Default

**Risk**: Medium -- existing resources get defaulted, behavior may change.

1. Add field with default:
   ```go
   // +kubebuilder:default="default-value"
   NewRequiredField string `json:"newRequiredField"`
   ```

2. Regenerate, apply, verify defaulting works on existing resources.

**Rollback**: Make field optional, apply previous CRD.

---

## Procedure 3: Deprecating a Field

**Risk**: Low initially, higher at removal.

### Phase 1: Announce

1. Add new field alongside old, mark old as `// Deprecated`.
2. Update controller to read new field, fall back to old.
3. Add validation webhook warning for old field usage.

### Phase 2: Migrate (2-3 release cycles)

1. Track deprecated field usage. Two approaches:
   - **Metric**: increment a counter in the reconciler each time the deprecated field is set. Query to find remaining consumers.
   - **Ad-hoc audit**: `kubectl get myresources -A -o json | jq '[.items[] | select(.spec.oldField != null)] | length'`

2. Communicate timeline.

### Phase 3: Remove

See Procedure 5.

---

## Procedure 4: Breaking Schema Change with Converting Webhook

**Risk**: High.

### Pre-flight

- [ ] Converting webhook implemented and tested
- [ ] Webhook certificates configured (cert-manager)
- [ ] Round-trip conversion tests pass
- [ ] Rollback plan documented
- [ ] Users notified
- [ ] Maintenance window scheduled (if needed)

### Steps

1. Implement converting webhook (see `converting-webhooks.md`).

2. Test in staging with existing resources.

3. Backup production:
   ```bash
   kubectl get myresources -A -o yaml > myresources-backup.yaml
   ```

4. Deploy webhook first (must be running before CRD update):
   ```bash
   kubectl apply -f config/webhook/
   kubectl rollout status deployment/controller-manager -n system
   ```

5. Apply CRD update, test conversion, monitor for errors.

### Rollback

1. Revert CRD (keep webhook running for reverse conversion).
2. Revert webhook (only after CRD reverted).
3. Restore from backup if needed.

---

## Procedure 5: Removing a Deprecated Field

**Risk**: High.

### Pre-flight

- [ ] Deprecation period complete (2+ release cycles)
- [ ] Metrics show low/no usage
- [ ] Users notified multiple times
- [ ] Controller no longer references old field

### Steps

1. Check remaining usage:
   ```bash
   kubectl get myresources -A -o json | jq '.items[] | select(.spec.oldField != null) | .metadata.name'
   ```

2. Contact remaining users.

3. Remove field from types and controller.

4. Regenerate, apply, verify.

**Orphaned data**: etcd retains old field data after removal. Leave it in place (harmless) or force a re-save using the annotation patch from Procedure 6, step 4 — this triggers the API server to rewrite each resource in the current storage version, stripping removed fields.

---

## Procedure 6: Changing Storage Version

**Risk**: Critical.

1. Ensure conversion works perfectly (round-trip tests pass).

2. Move `+kubebuilder:storageversion` marker to new version.

3. Regenerate, apply CRD.

4. Force storage migration (Kubernetes doesn't re-save automatically):
   ```bash
   kubectl get myresources -A -o name | xargs -I {} kubectl patch {} \
     --type=merge -p '{"metadata":{"annotations":{"storage-migration":"'$(date +%s)'"}}}'
   ```

5. Explicitly remove old versions from `status.storedVersions`. Kubernetes does **not** do this automatically after object migration — stale entries remain indefinitely otherwise, blocking version removal in Procedure 8:
   ```bash
   kubectl patch crd myresources.example.com --subresource=status --type=merge \
     -p '{"status":{"storedVersions":["v2"]}}'
   ```

6. Verify `storedVersions` shows only the new version:
   ```bash
   kubectl get crd myresources.example.com -o jsonpath='{.status.storedVersions}'
   ```

---

## Procedure 7: Adding New API Version

**Risk**: Medium.

1. Create new version directory, copy and modify types.
2. Decide hub version (usually newest stable).
3. Implement conversion (see `converting-webhooks.md`).
4. Register in scheme, regenerate, test, deploy.

---

## Procedure 8: Removing API Version

**Risk**: Critical.

### Pre-flight

- [ ] New version stable for 2+ release cycles
- [ ] All clients migrated
- [ ] Deprecation warnings issued for 2+ cycles
- [ ] No resources stored in old version

### Steps

1. Verify no stored resources in old version:
   ```bash
   kubectl get crd myresources.example.com -o jsonpath='{.status.storedVersions}'
   ```

2. If old version still in `storedVersions`, run Procedure 6 first.

3. Set `served: false` on old version (soft removal), deploy, monitor.

4. Remove version entirely after verification period.

---

## Emergency Rollback

1. Scale down controller:
   ```bash
   kubectl scale deployment/controller-manager -n system --replicas=0
   ```

2. Assess: `kubectl get myresources -A` and check events.

3. Revert CRD to previous version.

4. Restore from backup if needed:
   ```bash
   kubectl apply -f myresources-backup.yaml --force
   ```

5. Rollback and restart controller:
   ```bash
   kubectl rollout undo deployment/controller-manager -n system
   kubectl scale deployment/controller-manager -n system --replicas=1
   ```

---

## Production Checklist

```markdown
### Planning
- [ ] Change classified (breaking/non-breaking)
- [ ] Migration procedure selected
- [ ] Rollback plan documented
- [ ] Stakeholders notified

### Testing
- [ ] Unit and integration tests pass
- [ ] Tested in dev/staging
- [ ] Conversion round-trips verified (if applicable)

### Backup
- [ ] Resources backed up: kubectl get myresources -A -o yaml > backup.yaml
- [ ] CRD and controller deployment backed up

### Execution
- [ ] Monitoring dashboards open
- [ ] Team available for support

### Post-Migration
- [ ] All resources accessible
- [ ] Controller healthy, no error spikes
- [ ] Users notified of completion
```
