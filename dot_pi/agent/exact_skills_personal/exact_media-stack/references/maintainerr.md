# Maintainerr recipes

Server at `http://localhost:6246` inside `deploy/maintainerr`. No auth.

## API surface (thin)

- `GET /api/rules` — rule groups. Each contains `rules[]` with `ruleJson` (a serialized condition spec) and a nested `collection` object with the live settings.
- `GET /api/collections` — collection registry only (no items).
- `GET /api/collections/<id>`, `/api/collections/<id>/items`, `/api/items` — **do not exist** (404). For matched-item state use sqlite (next section).

## Live rule settings

From `/api/rules`, the nested `collection` object is the source of truth. Current values (2026-10-12):

| Collection | Type | deleteAfterDays | Conditions |
|------------|------|-----------------|------------|
| Delete watched movies | movie | 14 | `Plex.viewCount > 0` AND not in `Keep - Movies` |
| Delete Watched TV Shows | show | 14 | `Plex.sw_allEpisodesSeenBy` contains `maruina` AND not in `Keep - TV Shows` |

Condition encoding in `ruleJson`: `action 4` = contains, `action 9` with `operator "0"` = not-contains, `firstVal [0, N]` = a Maintainerr data field, `customVal.value` = the compared value. Read fields as raw JSON rather than guessing semantics from ids.

Timing: rules execute every 8 hours. A matched item enters the Maintainerr-managed Plex collection, counts down `deleteAfterDays`, then gets deleted from disk + unmonitored in Radarr/Sonarr.

## State inspection (sqlite)

The item table is authoritative:

```bash
kubectl exec -n media deploy/maintainerr -- cat /opt/data/maintainerr.sqlite > /tmp/maintainerr.sqlite
sqlite3 /tmp/maintainerr.sqlite "SELECT id, title, media_type, collection_id, deletion_date, add_date FROM collection_media;"
```

- Empty `collection_media` = nothing currently matched; media not in the collection yet.
- `setting.litestream` replicas exist (`_litestream_*` tables); copy the file out before querying — the pod has no `sqlite3`.

## Deletion eligibility assessment

1. Fetch the live rule (API `/api/rules`).
2. Conditions resolve against Plex data (see `references/plex.md`): watch state for the qualifying account, collection names.
3. Exclude `Keep - <type>` members first — `Keep - TV Shows` and `Keep - Movies` are exact-name exclusions.
4. Report the countdown date, not just eligibility: `deletion_date` (if already matched) or `now + deleteAfterDays + up to 8 hours` (if not yet matched).
