# IPTV provider downloads

Series episodes for the personal IPTV subscription (Xtream Codes provider) that no *arr search can acquire. Downloads land directly in the library; Plex picks them up on refresh. Alternative acquisition path to torrents — follow the one-path-per-series rule from `references/sonarr-radarr.md` (check the Sonarr queue first; these series are Plex-only, no Sonarr entry).

## Provider API

Host `smart.entertai5.pro:80`, credentials embedded in the URL path (`<user>/<pass>`). Two endpoints; prefer the targeted one:

| Endpoint | Size | Use |
|----------|------|-----|
| `player_api.php?username=&password=&action=get_series` then `action=get_series_info&series_id=` | KBs | Series catalog → episodes per series. Preferred. |
| `get.php?username=&password=&type=m3u_plus` | ~40 MB | FULL playlist dump — every episode of every series. Only when `player_api` lacks the series. Grep inside the pod; never pull it to the laptop. |

`get_series_info` returns nested season/episode JSON with per-episode stream URLs and sizes — no 40 MB dump needed.

## Critical redirect behavior

Episode URLs return **HTTP 302 to a tokenized CDN node** (`ironv-0X.entertai4.xyz?token=...`). A plain `curl -sI` shows the redirect and nothing more. Always:

```bash
curl -L -o <target> 'http://smart.entertai5.pro:80/series/<user>/<pass>/<file-id>.mkv'
```

Without `-L` the request stalls as `000`/empty. A HEAD with `-L` gives `Content-Length` for a size sanity check.

## Workflow (verified 2026-10-12)

1. Locate the Plex series (`library/sections/2/all`) and confirm its disk folder and existing file naming pattern — look at one `Part/file` path from `GET /library/metadata/<key>/children`. The folder name carries the TVDB id: `... {tvdb-436956}`. Plex matches by that id; the display title can differ from the folder name (Italian title vs English folder).
2. Enumerate available episodes (player_api or m3u grep). Match provider `Sxx Eyy` numbering to the file names used by existing seasons (`S01Exx.mkv` = plain `S{season:02}E{episode:02}`).
3. Download into a **temp dir first** (`/tmp/hn-dl` in the pod), `mv` into the series folder only when complete — Plex rescan runs on its own and must not ingest partial files.
4. Downloads reach ~45 MB/s from the cluster (a couple of GB per episode). Run as a background pod script with a log file, poll every 15–30 s (see SKILL.md long-operations rule).
5. Trigger the scan explicitly, then verify: `POST /library/sections/2/refresh?X-Plex-Token=`, wait ~45 s, re-fetch the series `children` — expect the new `Season N` with `leafCount` matching, and part paths pointing at the new files.

## Library hygiene notes

- The `media-archive` NFS volume has no Sonarr-side lifecycle: these downloads are not hardlinked from `/data`, and Maintainerr rules do not see series without a Sonarr entry. Only way to remove them is manual filesystem delete. State this limitation to the user when importing.
- Plex-matched metadata for manual imports keeps titles like `Episode 1` when file names are minimal but SxxEyy-correct; the provider's `tvg-name` field (episode title) is not preserved by plain `S02Exx.mkv` naming — acceptable in practice, mention if the user cares.
