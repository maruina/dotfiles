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

Without `-L` the request stalls as `000`/empty. Size sanity checks are limited: a HEAD with `-L` reports `Content-Length: 0` (useless), and the server ignores Range requests (`curl -C -` returns 200 and resends the whole body, so resume probing cannot detect completeness). Verify completion with `curl -sL -w 'HTTP:%{http_code} bytes:%{size_download}'` and a clean exit code; identical byte counts across two downloads is a strong completeness signal.

## Workflow (verified 2026-11-03; refines the 2026-10-19 procedure)

1. **Identify the series in Plex** (`GET /library/sections/2/all`): get the series `ratingKey`, then `GET /library/metadata/<key>/children` → season `ratingKey`s, then the season's children for one existing `Part/file` path. That path gives both the disk folder (carries the TVDB id: `... {tvdb-436956}`) and the naming pattern (`S02E04.mkv` = plain `S{season:02}E{episode:02}.mkv`). Plex matches by that id; the display title can differ from the folder name (Italian title vs English folder).
2. **Verify the episode id before downloading.** A user-supplied URL embeds `<user>/<pass>/<file-id>.mkv`. Resolve it: `player_api get_series` → `series_id` by name (the catalog is a flat list; beware near-matches — `1883`, `Spider-Man: L'uomo ragno` vs `Hanno ucciso l'Uomo Ragno...`), then `get_series_info&series_id=`. Its `episodes` field is a **dict keyed by season number** (not a list); match `episode.id` to the URL's file-id and read `episode_num` + `info.duration_secs` + `info.bitrate`. Never trust the claimed SxxEyy without this check. `bitrate` (kbps) × `duration_secs` / 8 ≈ expected size in bytes — a free completeness sanity check (1538 kbps × 2967 s ≈ 571 MB; actual 570,415,694).
3. **Download to a temp dir on the media-archive export, outside the scanned paths.** Section 2 scans **two** locations (`/media-archive/tv` and `/data/media/tv`), so use a dot-dir at the export root, e.g. `/media-archive/.tmp-hn-dl/`. Being on the same NFS export makes the final `mv` an **atomic rename** — no partial file ever exists at the destination path. (The earlier `/config/tmp-hn-dl` advice caused a cross-export `mv` = copy+unlink, leaving a partial-file window while Plex could scan; don't go back to it.) Run in the **Sonarr pod** (rw `/media-archive`; the Plex pod mounts it read-only):
   ```bash
   mkdir -p /media-archive/.tmp-hn-dl
   nohup sh -c 'curl -sL -o /media-archive/.tmp-hn-dl/S02E05.mkv.part \
     -w "HTTP:%{http_code} bytes:%{size_download}\n" \
     "http://smart.entertai5.pro:80/series/<user>/<pass>/<file-id>.mkv"; \
     echo curl_exit:$?' > /media-archive/.tmp-hn-dl/dl.log 2>&1 &
   ```
   Poll `wc -c` on the `.part` + `cat dl.log` every 15–30 s (see SKILL.md long-operations rule). Observed ~30–45 MB/s (570 MB in <20 s). Always capture `curl -w` byte counts + exit code — curl can exit silently mid-transfer (empty log, no error); see the redirect section above for why HEAD/Range checks don't work.
4. **Move + clean up.** Atomic rename into the series folder, then remove the temp dir, then `ls` the folder to confirm the size matches the expected estimate and the neighboring episodes:
   ```bash
   mv /media-archive/.tmp-hn-dl/S02E05.mkv.part '/media-archive/tv/<series folder>/S02E05.mkv' \
     && rm -rf /media-archive/.tmp-hn-dl
   ```
5. **Scan and verify.** `POST /library/sections/2/refresh?X-Plex-Token=`, wait ~45 s, re-fetch the season `children`. Caveat: `leafCount` can be `None` on this endpoint after a refresh — verify by counting the `Video` elements and checking the new one's `index` and `Part/file` path instead.

## Library hygiene notes

- The `media-archive` NFS volume has no Sonarr-side lifecycle: these downloads are not hardlinked from `/data`, and Maintainerr rules do not see series without a Sonarr entry. Only way to remove them is manual filesystem delete. State this limitation to the user when importing.
- Plex-matched metadata for manual imports keeps titles like `Episode 1` when file names are minimal but SxxEyy-correct; the provider's `tvg-name` field (episode title) is not preserved by plain `S02Exx.mkv` naming — acceptable in practice, mention if the user cares.
