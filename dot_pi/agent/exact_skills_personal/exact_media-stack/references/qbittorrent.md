# qBittorrent quirks and recipes

Version note: container runs qBittorrent 5.2.3. Web API at `http://localhost:8080/api/v2/`.

## Endpoints

- `torrents/info` — status, progress, seeds/peers, save paths. Full list by default; `?hashes=` for one.
- `torrents/trackers?hash=` — status 2 = working, 4 = not working. Peer counts per tracker.
- `sync/torrentPeers?hash=` — **not** `torrents/peers`. Peer table (client, progress, flags).
- `torrents/peers` — does not exist; returns HTTP error.
- `torrents/add` — POST: `category=`, `autoTMM=true`, `--data-urlencode urls=$MAGNET`.
- `torrents/delete` — POST `hashes=<one-hash>&deleteFiles=true|false`. Comma-joined multi-hash lists return 200 but silently no-op; loop one per request and re-check `torrents/info`.
- `torrents/reannounce` — POST only. A GET returns 405 silently.
- `torrents/files?hash=`, `torrents/filePrio` — selective priorities. `filePrio` rejects comma-joined id lists ("File IDs must be integers"); one `id` per request.
- `torrents/recheck`, `torrents/start`, `torrents/stop`, `torrents/setForceStart` — **`torrents/resume` is gone** in 5.2.3; use `start`.

## Category semantics

- Categories `movies`, `tv`, `prowlarr` map to save paths `/data/downloads/torrents/<category>`.
- Auto TMM recomputes save paths from category; `temp_path` enabled means in-flight data sits at `torrents/incomplete/<category>` and moves to the final path on completion.
- The `noautocat` tag exempts a torrent from automatic category assignment.

## Path verification

After any move (qbit-manage, manual, category edit, import), `save_path`/`content_path` may point at the incomplete folder. Always `ls` the real path in the pod before asserting where files are:

```bash
kubectl exec -n media deploy/qbittorrent -c qbittorrent -- ls -la "<content_path>"
```

## Selective re-download (from a torrent you already have)

When the swarm is healthy, re-download individual files cheaply:

1. `torrents/info` → hash; `torrents/files?hash=` → per-file `index`.
2. Set skip/nominal priorities via `filePrio` — one `id` per request (multi-id lists no-op).
3. `torrents/recheck`, then `setForceStart` (`value=true`) so it does not queue behind other active downloads.
4. Import via ManualImport afterward, or let Completed Download Handling do it automatically.

After files appear, Sonarr's import may move the download copy away and put the torrent into `missingFiles` — safe (media lives in the library) but harder for later file-level operations.

## ENOSPC wedge recovery

An ENOSPC event puts a torrent in permanent `error` state that `recheck`/`start`/`setForceStart` alone do not clear (errored pieces stay skipped):

1. Remove the torrent (`torrents/delete`, `deleteFiles=false`).
2. Re-add the same `.torrent` from `/config/qBittorrent/BT_backup`. The same infohash re-attaches to existing on-disk data and auto-rechecks.
3. **File priorities reset to Normal on re-add — re-apply the skip list immediately or it re-downloads the whole pack.**

Tracing a real wedge (2026-10-11):

- `Failed to restore torrent ... fast resume rejected. file_stat(...): mismatching file size` in the log = truncated on-disk data from a killed pod. Re-add + recheck re-downloads only mismatching files.
- With `temp_path` + autoTMM, the data home is `torrents/incomplete/<category>` and qBittorrent recomputes it from category + state on load, overriding the fastresume `save_path`. Before a recheck (torrent stopped), confirm data sits where in-memory `content_path` expects it.
- Per-file error skip via `filePrio` + `recheck` does not clear `error` until `torrents/start`; the state can persist after recheck until started again.

## Incomplete/missingFiles after imports

After Sonarr imports and moves the download copy away, the torrent shows `missingFiles`. That is safe (media lives in the library) but makes later file-level operations harder.
