# Plex recipes

Server at `http://localhost:32400` inside `deploy/plex`. Auth: `?X-Plex-Token=<token>`.

## Token

From the server owner account (Preferences XML, not the DB):

```bash
kubectl exec -n media deploy/plex -- grep -oE 'PlexOnlineToken="[a-zA-Z0-9]+"' \
  "/config/Library/Application Support/Plex Media Server/Preferences.xml" \
  | sed 's/.*="//;s/"//' > /tmp/ptoken.txt
```

## Libraries

- `GET /library/sections` — list sections. Movies = section 1, TV Shows = section 2.
- `GET /library/sections/2/all` — all shows with `leafCount` and `viewedLeafCount` (viewed counts are relative to the token's account).
- `GET /library/metadata/952/children` — seasons of a show; each season has leaf/viewed counts.
- `GET /library/metadata/<key>` returns the item's `Collection` tags (its collection memberships).

## Collections

- List per section: `GET /library/sections/2/collections` (section-level, not `/library/collections` — the latter returns empty data here).
- Members: `GET /library/collections/<machine-key>` — or fetch the collection's `key` from the listing and follow it with the token.
- Maintainerr matches `Keep - TV Shows` and `Keep - Movies` by **exact Plex collection name** — never rename or delete them while rules are active. Adding an item to the Keep collection instantly excludes it from deletion.

## Library settings via API

Section-level advanced settings (Plex Web: Edit library → Advanced):

- Read: `GET /library/sections/<id>/prefs` — returns `<Setting id="..." value="..." enumValues="...">` per setting. Use the listed ids and enum values verbatim; do not guess values.
- Edit: `PUT /library/sections/<id>?agent=<section-agent>&prefs%5B<id>%5D=<value>` — keep the current `agent` value (the call returns 400 without it). URL-encode the brackets: raw `prefs[...]` in the URL makes curl exit 3 (globbing), and busybox curl has no `--globoff` escape here.

Failure modes learned the hard way — a `200` proves nothing, always re-read the prefs endpoint or the DB after a PUT:

- `pr:<id>=<value>` params are silently ignored by the section-edit endpoint.
- Bare setting names (`showOrdering=...` without `prefs[]`) return 400.
- Hidden settings absent from the prefs listing (for example `pr:ratingsSource`, ratings source) are not writable through this endpoint — change them in Plex Web → Edit library → Advanced if the UI offers them.

Episode-ordering value map for the modern TV agent (`tv.plex.agents.series`, `pr:showOrdering`):

| Value | UI label |
|-------|----------|
| `tmdbAiring` (default) | The Movie Database |
| `aired` | TheTVDB |

TheTVDB stopped as a metadata source on 2026-12-03; libraries on `aired` stop picking up metadata for new episodes. Changed TV Shows to `tmdbAiring` on 2026-11-27.

## Library DB inspection

`sqlite3` does not exist in the pod. Copy the DB out and inspect on the laptop (grab `db` + `-wal` together, or recently written rows live in the WAL):

```bash
d='/config/Library/Application Support/Plex Media Server/Plug-in Support/Databases'
pod=$(kubectl get -n media pod -l app=plex -o jsonpath='{.items[0].metadata.name}')
kubectl exec -n media deploy/plex -- sh -c "cp '$d/com.plexapp.plugins.library.db' /tmp/v.db; cp '$d/com.plexapp.plugins.library.db-wal' /tmp/v.db-wal 2>/dev/null; true" 2>/dev/null
kubectl cp media/$pod:/tmp/v.db /tmp/v.db
kubectl cp media/$pod:/tmp/v.db-wal /tmp/v.db-wal
```

Useful tables and values:

- `library_sections.user_fields` — JSON blob of section preferences (`pr:` keys). Ground truth for settings the prefs endpoint hides.
- `metadata_items.metadata_type`: 1 = movie, 2 = show, 3 = season, 4 = episode. Shows link to episodes through seasons: `e.parent_id = season.id`, `se.parent_id = show.id` (episode `parent_id` is the season, not the show).
- `originally_available_at` is a Unix epoch; filter ongoing shows with a converted date.

## Watch state notes

- `viewedLeafCount` shows only the aggregation relative to the server owner token (`maruina`). For a per-user "all episodes seen" check, that aggregation is what Maintainerr's `sw_allEpisodesSeenBy` uses for the owner.
- Plex picks up imported files on its next library scan; that takes minutes. Do not block waiting for a Plex scan — report and move on.
