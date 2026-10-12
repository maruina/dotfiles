# Sonarr and Radarr API recipes

Sonarr 4.x at `http://localhost:8989/api/v3/`, Radarr 3.x-era at `http://localhost:7878/api/v3/`.

## Acquisition discipline (learned 2026-10-12)

One acquisition path per series at a time. Sonarr cannot see manual magnet grabs (no download-client linkage, no queue item on its side), so an automatic search will happily grab a full alternate release pack in parallel:

- Decide on search vs manual-magnet BEFORE triggering anything. Do not run `SeasonSearch`/`EpisodesSearch`/`MoviesSearch` when a manual grab for the same series is in flight or planned. Check `GET /api/v3/queue?seriesId=<id>` before grabbing a manual magnet — a series already acquiring must not gain a second path.
- Automatic season-pack grabs cost multiples of the target: two Vodes packs (65 + 84 GiB) raced a 46 GiB manual pack. Always read `size` from Prowlarr search results before grabbing anything; a "season pack" for a full BD anime can run 65–90 GiB.
- To cancel a search-driven grab: delete the torrent(s) in qBittorrent (one hash per call, verify with `torrents/info`), then `DELETE /api/v3/queue/bulk` with `removeFromClient: true` and `blocklist: true` so RSS cannot re-grab the same release. Partially downloaded data of the cancelled path is lost — accept and state that to the user when it is large (do not silently fall for the nearly-done argument; the user's storage budget decides).
- Unmonitored seasons do not search. Use monitoring state (not just grabs) as part of acquisition-state checks.

## Series / movies

- `GET /api/v3/series` returns ALL series — `?id=` is not a filter. Use `GET /api/v3/series/<id>` and assert on the returned `id`.
- `PUT /api/v3/series` replaces the object: send the full resource with the complete `seasons` array (same shape for Radarr movies). Partial payloads lose data.
- Episode metadata for an unmonitored season may be missing (0 episodes) until a refresh: `POST /api/v3/command {"name":"RefreshSeries","seriesIds":[<id>]}`.
- Useful commands: `SeasonSearch` (`seriesId`, `seasonNumber`), `MoviesSearch` (`movieIds`), `RescanSeries`, `ManualImport`.
- Sonarr grabs: an automatic `SeasonSearch` takes the best-scored release; a parsed full season pack scores above per-episode alternatives when available. Interactively grab a pack only if the automatic search picks singles after several minutes.

## Queue management

- `GET /api/v3/queue?seriesId=<id>&includeEpisodes=true` — items keep stale entries after the download client removes the torrent; Sonarr notices on its periodic refresh.
- Bulk cleanup: `DELETE /api/v3/queue/bulk` with `{"ids":[...],"removeFromClient":true,"blocklist":false}`. An empty `ids` array returns 400.
- `queue.singleDownloadId` historical quirk: manual grabs (no downloadId in the import payload) do not link a queue item; fine.

## Manual import (pack-level)

The dry run and import command split the UI's "select" phase:

1. Dry run: `GET /api/v3/manualimport?folder=<dir>&filterExistingFiles=false` — **`folder`, not `path`** (`path` 500s with "The string can't be left empty").
2. Candidates come back parsed (series, quality, episodes). For anime packs, `episodes` is often empty — map files yourself against `GET /api/v3/episode?seriesId=<id>` by parsed filenames (plain `NN.mkv` → episode number).
3. Payload shape is **flat per file**: `path` (full), `seriesId`, `episodeIds` (array), `quality` (full object), `languages` (list of `{id,name}` objects), `mode`. The UI-style nested payload (a `series` object + `episodes` array) silently normalizes to `seriesId: 0` and fails with "Series with ID 0 does not exist".
4. `languages` is required. Omitting it: Sonarr moves the file on disk, then fails the DB insert — files on disk but `hasFile: false`. Recovery: `POST /api/v3/command {"name":"RescanSeries","seriesId":<id>}` (do not re-import; files are already in place).
5. One file per episode ID in one command — two files mapped to the same episode collide.
6. `Auto` mode picks per-filesystem: hardlink when possible (same fs), copy next, and **move** as the last resort for cross-filesystem series roots — see the cross-filesystem section below for when this emptied a pack mid-seed.
7. Anime guardrails: exclude `NC/` paths unconditionally (creditless OP/ED clips named `OP 01.mkv` match the `NN.mkv` pattern; importing one replaces the real episode file and deletes it). Sanity check: TV episode ≥ 150 MiB, NC clip < 50 MiB.
8. Manual imports do not carry a `downloadId`, so qBittorrent keeps seeding from the download copy. Verify site hardlinks (`stat -c "%h"`) before storage math.

Cross-filesystem import = move (verified 2026-10-12, JUJUTSU KAISEN backfill):

- With a library root on a different filesystem (`media-archive` NFS series root, NVMe pack), `Auto` mode **moves, not copies** — the pack folder empties and the qBittorrent torrent loses its data home (`missingFiles`). It self-recovers to `uploading` once the files return to the pack path; no recheck needed.
- After an interrupted import/restore cycle: reconcile pack and recycle-bin dirs per season — expect mixed old/new naming and root-owned partial files from a killed copy. Count `SxxEyy` per dir, delete strays and partials, import only from a verified set.
- Statistics oscillate mid-import (episode counts drift while RssSync/RefreshMonitoredDownloads run concurrently). Poll until import commands report `completed`, then re-verify from `/api/v3/series/<id>`.

Quality override is silently ignored (same session):

- The `quality` field in the `ManualImport` payload and `PUT /api/v3/episodefile` (returns 202, persists nothing) do not stick — Sonarr re-derives quality from filename tags and falls back to `HDTV-2160p` when names lack tags. Trial-import one file and read it back before a multi-GB pass.
- Consequences when ignored: correct files, wrong labels, `[HDTV-...]` baked into renamed filenames; upgrade logic sees a bogus above-cutoff tier (blocks unwanted auto-upgrades — desirable here); Plex reads accurate mediainfo regardless. Only real fix is parseable tags in the source filenames.

## Radarr movie inside a series pack (JUJUTSU KAISEN 0)

1. Add the movie first: `POST /api/v3/movie` with the full lookup resource qualityProfileId, rootFolderPath, `movies`, addOptions. Radarr parses bare batch names (`Jujutsu Kaisen 0.mkv`) poorly — `DownloadedMoviesScan` on the pack root returns an empty import list.
2. Stage a parseable **hardlink** (zero-copy, keeps the torrent data seeded): `ln <pack-file> /data/downloads/manual/<staging>/<Name> (Year) [BLURAY-1080p][x265 10bit].mkv`, then `{"name":"DownloadedMoviesScan","path":"<staging>","movieId":<id>}`.
3. **Staging dir ownership**: kubectl exec runs as UID 0, Radarr as `1000:1000` (`abc`) — `chown -R 1000:1000` and `chmod 775` the staging dirs before the scan, else the import dies with `UnauthorizedAccessException ... denied` even with 664 files.
4. Delete the staging dir after import; the library file keeps the pack file hardlinked (nlink=2) and seeding.

## Quality profiles

- Sonarr: `WEB-1080p` (default TV), `Remux-1080p - Anime` (anime; hard-excludes raw and dub-only releases). Profile id from the series resource.
- Radarr: `[SQP] SQP-1 WEB (1080p)` is the movies default. Radarr movie add: `POST /api/v3/movie {tmdbId, qualityProfileId, rootFolderPath, monitored:true}` then `POST /api/v3/command {"name":"MoviesSearch","movieIds":[<id>]}`.
- Lookups: Sonarr `GET /api/v3/series/lookup?term=`, Radarr `GET /api/v3/movie/lookup?term=` (search TMDB). Sonarr fansub-style anime listing differences are normal; release-parse failures surface in interactive searches.

## Prowlarr

- `GET /api/v1/search?query=<terms>&categories=5000,5040&apikey=` — results include `guid` (often the magnet), `downloadUrl`, `seeders`, `infoHash`, `indexerId`.
- Only add indexers via UI or API with care — existing indexers: Nyaa.si, showRSS, The Pirate Bay, YTS.
- Cloudflare-tagged indexers resolve via ByParr (`http://byparr.media.svc.cluster.local:8191`).
