# Pipeline conventions

Checked 2026-11-17 against commit `cb3b4d433f8b0fa23a2762724e2824aaa48ca521`. This file states the rules and where Hurricane, RoyalTree, Snow, and Tectonics stand. It does not change pipeline code. A cell is **met** only when today's code already does the whole rule. Anything else names the goal that owns the remaining work, or **gap** when no goal does. Deferred goals are still the owners.

The repository README link to this file is added separately.

## 1. One command, a lock, file logs, and a failed exit

Each pipeline has one entry point. Subcommands of that entry point are fine; a second refresh or upload script is not.

Python pipelines lock dependencies the way RoyalTree already does (below). Tectonics is Node and uses the shared `my-app/package-lock.json`. It imports no npm package (`src/Tectonics/data/build.mjs` uses `node:zlib`, `node:fs`, `node:path`, `node:url`, and `fetch`), so that lock is its lock. Do not add a second one.

Test dependencies are not this lock. Hurricane and Snow tests install from `src/pipeline_testing/uv.lock` (`website-testing-pipeline-infra`).

The command writes its log to a file. A printed summary is not a log file. If any source fails or the run would publish a partial dataset, the process exits non-zero and does not write that dataset.

## 2. Uploads and dry runs

An upload-capable script uploads only when given `--upload`. Without that flag it does not talk to S3 or CloudFront.

`--dry-run` writes nothing. That includes manifests, manifest timestamps, and any file the live run would publish. A pipeline with no upload-capable script meets this rule.

`deploy.sh` is not a pipeline command. Change-only deploy uploads belong to `website-prop-pipeline-deploy-data-sync` (deferred).

## 3. `meta.json`

Every published dataset ships a `meta.json` beside it:

| Field | Meaning |
|---|---|
| `source` | Upstream URL or citation. |
| `version` | Upstream version, file revision, or the git commit the build read. One of these, in this field. |
| `generatedAt` | When this build wrote the dataset, ISO-8601 UTC. |
| `dataThrough` | Last date the observations cover. This is the date the page shows. |

No pipeline ships this file today (no `meta.json` under `my-app/`).

The page date comes from `dataThrough`:

| Pipeline | Goal that shows the date |
|---|---|
| Hurricane | `website-prop-pipeline-hurricane-data-driven-years` (Sources panel) |
| Snow snowfall | `website-prop-snow-data-freshness` |
| Snow ONI | `website-prop-pipeline-snow-oni-generator` (badge as-of) |
| RoyalTree | `website-prop-pipeline-royaltree-validate` (footer or help) |
| Tectonics | **gap** — no goal shows `dataThrough` on the page |

## 4. Byte-identical rebuilds

Rebuilding unchanged inputs produces the same bytes. Gzipped outputs set the gzip `mtime` to 0 (as `SplitDataForFrontend._write_gz` does). Plain JSON has no clock and keeps a stable key order. A timestamp inside a manifest or a JPEG is not a published dataset, but it still must not change on a dry run (rule 2).

## Lock file

`website-prop-pipeline-royaltree-cleanup` (done 2026-11-17) chose this. Record it. Do not invent another pin.

- `my-app/src/Royalty/Data/pyproject.toml` sets `requires-python = ">=3.11"`.
- `my-app/src/Royalty/Data/.python-version` is `3.11`.
- `my-app/src/Royalty/Data/uv.lock` is the lock.
- `my-app/src/Royalty/Data/requirements.txt` is the frozen hash export: `uv export --frozen --no-dev --no-emit-project --format requirements-txt`.

Other Python pipelines use the same files for their own dependencies. They do not copy RoyalTree's package set. Snow's updater is stdlib-only; its runtime pin is still these files, owned by `website-prop-pipeline-snow-cleanup-docs`. Hurricane has no runtime lock (`uv run --with` in the converter docstring); that pin is `website-prop-pipeline-hurricane-refresh-cli` (deferred).

## Compliance

| Pipeline | 1. Command, lock, logs, exit | 2. `--upload` and dry run | 3. `meta.json` and the page date | 4. Byte-identical rebuild |
|---|---|---|---|---|
| Hurricane | **gap** — `website-prop-pipeline-hurricane-refresh-cli` (deferred) for one dataset command and the runtime lock. Logs: **gap**. HURSAT exiting 0 after errors: **gap**. | **gap** — `website-prop-pipeline-hurricane-hursat-coverage` (deferred) | **gap** — file and Sources-panel date: `website-prop-pipeline-hurricane-data-driven-years` | **gap** — `website-prop-pipeline-hurricane-payload-split` |
| RoyalTree | **gap** — lock **met**. Tree CLI exits non-zero on a failed fetch before it writes payloads. Portraits are a second command and exit 0 after errors: `website-prop-pipeline-royaltree-portraits` (deferred). Logs: **gap**. | **gap** — `website-prop-pipeline-royaltree-portraits` (deferred). The tree CLI does not upload. | **gap** — `website-prop-pipeline-royaltree-validate` | **met** |
| Snow | **gap** — one `snow:refresh` command and the runtime pin: `website-prop-pipeline-snow-cleanup-docs`. Non-zero exit with no write: `website-prop-pipeline-snow-safe-updater`. Logs: **gap**. | **gap** — `website-prop-pipeline-snow-safe-updater`. Deleting the Lambda script: `website-prop-pipeline-snow-refresh-automation` (deferred). | **gap** — snowfall metadata: `website-prop-pipeline-snow-safe-updater`; page label: `website-prop-snow-data-freshness`. ONI: `website-prop-pipeline-snow-oni-generator`. | **met** |
| Tectonics | **gap** — one command and `package-lock.json` **met**. A failed download exits 1 before any write. Logs: **gap**. | **met** | **gap** — file: `website-prop-pipeline-tectonics-boundary-fidelity` (source, commit, licence, fetch date; not yet `generatedAt` / `dataThrough`). Page date: **gap**. | **met** |

### What the code does today

**Hurricane.** `convertIbtracsToJson.py` and `buildHursatImages.py` are separate. The converter docstring uses unpinned `uv run --with`. `requirements-dev.txt` is tests only. The converter logs with `print` and writes `public/hurricane/storms.json.gz` through `gzip.open` without `mtime=0`. `tests/test_convert_ibtracs.py` records that two runs differ only in that header. `buildHursatImages.py` calls `put_object` unless `--dry-run` is set; there is no `--upload`. `save_manifest_entry` still runs on a dry run, including when no tarball exists. `tests/test_hursat_dry_run.py` expects the manifest to stay byte-identical and is an xfail for `website-prop-pipeline-hurricane-hursat-coverage`. `main` returns after per-storm errors. The Sources panel lists providers and no data-through date.

**RoyalTree.** Dataset entry point is `python -m royaltree`. The lock files are the standard above. The run summary goes to stderr; `--summary-json` is optional, and `store.add_run` records it in the sqlite store, not as the command's log file. `http._request` raises `FetchError` or `RequestBudgetExceeded`, and `cli.main` re-raises, so a failed fetch does not reach `derive_outputs`. `buildMonarchImages.py` is a second command: it uploads unless `--dry-run`, and `save_manifest_entry` runs either way (the entry includes `time.time()`). Failed fetches return `fetch-error` and the process still exits 0. `SplitDataForFrontend._write_gz` uses `mtime=0` and compact JSON; core node ids are sorted. `validate-diff` (2026-11-17) recorded three unchanged rebuilds with identical sha256. There is no `meta.json`. `-validate` plans `generatedAt` and a source window on `index.json`, plus a page label. That is not this schema.

**Snow.** `src/Snow/Data/getData.py` and `src/Snow/lambda/handler.py` are two entry points. `getData.py` prints to stdout, catches a failed season, and still writes the file (exit 0). `handler.py` has no flags: it `put_object`s and invalidates CloudFront even when a pass failed. There is no runtime `pyproject.toml` or `uv.lock`. `requirements-dev.txt` points at the test lock. Published snowfall is indented JSON, not gzip; `write_pretty` adds no timestamp, so an unchanged raw file rewrites the same bytes. `src/Snow/Data/oni.json` is hand-maintained and has no `meta.json`. Nothing on the page reads a data-through date.

**Tectonics.** One command: `node src/Tectonics/data/build.mjs`. Lock: `my-app/package-lock.json`. Logs are `console.log`. `fetchJson` throws on a bad response, and `main` writes only after all three downloads; the entry point then `process.exit(1)`. `writeGzip` calls `gzipSync` with `{level: 9}`. The gzip header time is already 0. No upload, no manifest, no `meta.json`. The legend credit is not a data-through date. `-boundary-fidelity` owns writing `meta.json`; no goal owns showing `dataThrough` on the page.
