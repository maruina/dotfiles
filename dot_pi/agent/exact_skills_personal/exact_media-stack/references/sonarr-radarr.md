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
6. `mode: Auto` copies when the series folder is on a different filesystem. Observed (2026-10-12): an explicit no-mode ManualImport of a 46 GiB pack on the same filesystem still produced nlink=1 copies — assume copy unless verified.
7. Anime guardrails: exclude `NC/` paths unconditionally (creditless OP/ED clips named `OP 01.mkv` match the `NN.mkv` pattern; importing one replaces the real episode file and deletes it). Sanity check: TV episode ≥ 150 MiB, NC clip < 50 MiB.
8. Manual imports do not carry a `downloadId`, so qBittorrent keeps seeding from the download copy. Verify site hardlinks (`stat -c "%h"`) before storage math.

## Quality profiles

- Sonarr: `WEB-1080p` (default TV), `Remux-1080p - Anime` (anime; hard-excludes raw and dub-only releases). Profile id from the series resource.
- Radarr: `[SQP] SQP-1 WEB (1080p)` is the movies default. Radarr movie add: `POST /api/v3/movie {tmdbId, qualityProfileId, rootFolderPath, monitored:true}` then `POST /api/v3/command {"name":"MoviesSearch","movieIds":[<id>]}`.
- Lookups: Sonarr `GET /api/v3/series/lookup?term=`, Radarr `GET /api/v3/movie/lookup?term=` (search TMDB). Sonarr fansub-style anime listing differences are normal; release-parse failures surface in interactive searches.

## Prowlarr

- `GET /api/v1/search?query=<terms>&categories=5000,5040&apikey=` — results include `guid` (often the magnet), `downloadUrl`, `seeders`, `infoHash`, `indexerId`.
- Only add indexers via UI or API with care — existing indexers: Nyaa.si, showRSS, The Pirate Bay, YTS.
- Cloudflare-tagged indexers resolve via ByParr (`http://byparr.media.svc.cluster.local:8191`).
