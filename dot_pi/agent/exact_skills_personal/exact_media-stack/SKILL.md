---
name: media-stack
description: Operate the malazan.xyz home media stack (qBittorrent, Sonarr, Radarr, Prowlarr, Plex, Maintainerr) through its REST APIs from inside the cluster. Use when asked to check downloads, search indexers, grab or delete torrents, run *arr interactive or automatic searches, do manual imports, replace episode files, inspect Plex libraries/collections/watch state, or assess Maintainerr deletion eligibility. Read-only by default; confirm before mutations.
---

# Media Stack API Operations

Agent-facing API surgery for the `media` namespace. The human runbook lives in the malazan.xyz repo at `docs/how-to/media-stack-operations.md` (lifecycles, UI-level config, security, bulk-import guardrail context) — read it before bulk imports or post-deployment work. This skill covers the API recipes and endpoint quirks.

## Access

All services talk on localhost inside their pods. Always `KUBECONFIG=config/kubeconfig` from the repo checkout (decrypted per `docs/how-to/cluster-access.md`).

| Service | Deploy | Port | Auth |
|---------|--------|------|------|
| qBittorrent | `deploy/qbittorrent` (`-c qbittorrent`) | 8080 | `/api/v2/*?` — localhost auth bypass enabled |
| Sonarr | `deploy/sonarr` | 8989 | `?apikey=$SKEY` from `/config/config.xml` |
| Radarr | `deploy/radarr` | 7878 | `?apikey=$RKEY` from `/config/config.xml` |
| Prowlarr | `deploy/prowlarr` | 9696 | `?apikey=$PKEY` from `/config/config.xml` |
| Plex | `deploy/plex` | 32400 | `?X-Plex-Token=$TOK` from `PlexOnlineToken` in Preferences |
| Maintainerr | `deploy/maintainerr` | 6246 | none |

Key extraction (run once per session, store in `/tmp`):

```bash
kubectl exec -n media deploy/sonarr -- grep -o '<ApiKey>[^<]*</ApiKey>' /config/config.xml | sed 's/.*<ApiKey>\(.*\)<\/ApiKey>.*/\1/' > /tmp/skey.txt
kubectl exec -n media deploy/plex -- grep -oE 'PlexOnlineToken="[a-zA-Z0-9]+"' "/config/Library/Application Support/Plex Media Server/Preferences.xml" | sed 's/.*="//;s/"//' > /tmp/ptoken.txt
```

## Container tooling (verified 2026-10-12)

All images are Alpine (busybox `sh`). Even when `bash` exists, prefer `sh -c` — it works everywhere.

| Tool | qBittorrent | Sonarr | Radarr | Prowlarr | Maintainerr | Plex |
|------|-------------|--------|--------|----------|-------------|------|
| `curl`, `wget` | yes | yes | yes | yes | yes | yes |
| `jq` | yes | no | no | no | no | yes |
| `python3` | yes | no | no | no | no | no |
| `bash` | yes | yes | yes | yes | **no** — `sh` only | yes |
| `sqlite3` | no | no | no | no | no — copy the DB out | no |

So: parse JSON with local `python3`/`sqlite3` after copying output to the laptop; never `jq`-parse inside Sonarr/Radarr/Prowlarr/Maintainerr.

## Shell discipline (every command)

- Append `2>/dev/null` to every `kubectl exec`. kubectl's "Defaulted container..." stderr poisons piped JSON.
- Debug with an explicit HTTP code: `curl -s -w '\nHTTP:%{http_code}'`.
- Parse JSON with local `python3` after `kubectl exec ... > /tmp/out.json`; never inline-parse inside the pod (no `jq` there).

## Long operations: background + poll, never block

Sonarr interactive searches and large series can run 4+ minutes and block the tool call. Kick the call off in the pod and poll:

```bash
# start (returns immediately)
kubectl exec -n media deploy/sonarr -- sh -c "nohup curl -s 'http://localhost:8989/api/v3/release?...' -o /tmp/rel.json > /dev/null 2>&1 &"
# poll every 10-20s in separate short calls
kubectl exec -n media deploy/sonarr -- sh -c "wc -c /tmp/rel.json"
```

Any expected-to-be-slow query (interactive search, full indexer fan-out, big library scans) follows this pattern. Report ETAs instead of waiting in one blocking call.

## Safety rules

1. Read-only by default. Ask before: grabbing a release, deleting a torrent (especially `deleteFiles=true`), changing monitoring state, triggering imports, editing Maintainerr rules/collections, deleting Plex files or collections.
2. Never trust `save_path`/`content_path` from qBittorrent after any torrent move — `ls` the real path inside the pod before asserting where files live.
3. Multi-value requests no-op silently on qBittorrent (5.2.3): `torrents/delete` and `filePrio` take one `value` or `id` per request. Verify each delete with `torrents/info`; a 200 means nothing.
4. Before bulk imports or file surgery on torrents near ratio limits, suspend qbit_manage (Flux kustomization + CronJob) — it deletes download data every 30 min with no confirmation. Full recipe in the repo runbook.
5. Unmonitor affected episodes before deleting/replacing their files; re-monitor after. Otherwise RSS grabs new releases mid-surgery.
6. Sonarr's recycle bin only catches Sonarr-initiated deletions (since 2026-10-11). Raw `torrents/delete` and qbit_manage cleanup have no safety net.
7. Check download-volume headroom before large operations (`df -h /data` in the pod). ENOSPC wedges torrents in `error` state and poisons in-flight imports.

## Common workflows

### Stuck torrent diagnosis
`torrents/info` → compare `num_seeds`/`num_complete`/`availability`. Trackers working (status 2 in `trackers?hash=`) + zero seeds = dead swarm, not a VPN problem. Then find alternatives via Prowlarr search (below).

### Search alternatives (prefer one big pack over per-episode grabs)
Prowlarr: `GET /api/v1/search?query=<terms>&categories=5000&apikey=` (5000 = TV). Parse locally; sort by seeders; prefer full-season/series packs. For per-season grading use Sonarr `GET /api/v3/release?seriesId=&seasonNumber=` (background + poll — it hangs).

### Manual magnet grab (release Sonarr cannot parse or rejected)
`POST qBittorrent torrents/add` with `category=tv` (or `movies`) + `autoTMM=true` and `--data-urlencode urls=$MAGNET`. Then import (see `references/sonarr-radarr.md`).

### Import a completed torrent into Sonarr
Dry run → map files → (anime: exclude `NC/` clips, sanity-check sizes ≥ 150 MiB) → ManualImport command with flat schema → re-monitor → verify via `episodefile`. Full procedure + quirks in `references/sonarr-radarr.md`.

### Maintainerr deletion eligibility
Evaluate conditions from the live rule JSON and cross-check Plex: watch state, `Keep - TV Shows`/`Keep - Movies` membership (exact-name match). State lives in sqlite at `/opt/data/maintainerr.sqlite` — see `references/maintainerr.md`.

## References

| File | Contents |
|------|----------|
| `references/qbittorrent.md` | endpoints, peers/trackers, ENOSPC recovery, file priorities |
| `references/sonarr-radarr.md` | series/commands, manual import schema, queue, Radarr movie ops |
| `references/plex.md` | token, sections, collections, watch state |
| `references/maintainerr.md` | rules, sqlite inspection, deletion conditions |
