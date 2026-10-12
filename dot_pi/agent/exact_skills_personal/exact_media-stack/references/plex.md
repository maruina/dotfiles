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

## Watch state notes

- `viewedLeafCount` shows only the aggregation relative to the server owner token (`maruina`). For a per-user "all episodes seen" check, that aggregation is what Maintainerr's `sw_allEpisodesSeenBy` uses for the owner.
- Plex picks up imported files on its next library scan; that takes minutes. Do not block waiting for a Plex scan — report and move on.
