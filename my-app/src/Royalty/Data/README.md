# Royalty data pipeline

Builds the datasets behind the royal tree charts (`/RoyalTree`). The ordered
monarch lists are scraped from English Wikipedia. Person facts used by `build`
come from [Wikidata](https://www.wikidata.org/) through the Action API
(`wbgetentities`, 50 IDs per call). Typed SPARQL records
([`royaltree/wdqs.py`](royaltree/wdqs.py)) are fetched and stored separately
and are not read by `build` yet. Portraits come from Wikimedia Commons.

Everything except portraits runs through one command, `python -m royaltree`
([`royaltree/`](royaltree/)), over one local entity store
(`data/royaltree.sqlite`).

## Setup

Python **3.11 or newer** is required (the code uses `match`). The version is
pinned in [`.python-version`](.python-version) (3.11) and
[`pyproject.toml`](pyproject.toml) (`requires-python >= 3.11`). Dependencies
are locked in [`uv.lock`](uv.lock): requests and beautifulsoup4 for the
pipeline, plus pillow and boto3 for the portrait script. pytest is a dev
dependency (`uv sync` installs it; `requirements.txt` leaves it out).

With [uv](https://docs.astral.sh/uv/) (recommended):

```bash
cd my-app/src/Royalty/Data
uv sync --frozen            # creates .venv/ from uv.lock
uv run python -m royaltree --help
uv run pytest               # offline unit tests
```

Without uv, use the hash-pinned export in [`requirements.txt`](requirements.txt):

```bash
cd my-app/src/Royalty/Data
python3.11 -m venv .venv
source .venv/bin/activate
pip install --require-hashes -r requirements.txt
python -m royaltree --help
```

`.venv/` is git-ignored. After changing a dependency in `pyproject.toml`, run
`uv lock`, then regenerate `requirements.txt` with
`uv export --frozen --no-dev --no-emit-project --format requirements-txt -o requirements.txt`.

Run the commands from this directory (`python -m` needs it on the path).
`--data-dir` (default `data/`) and `--out-dir` (default
`../../../public/royalty`) can point anywhere.

## Commands

```bash
# Rebuild one tree from the store with no network (seconds; any request is an error).
# build rewrites the combined files from the store's trees, so it refuses when the
# store lacks a tree that is already published (e.g. a fresh clone: run
# import-legacy or build --all first; --allow-dropped-trees drops one on purpose).
python -m royaltree build England --offline

# Rebuild every tree offline (about 10 s), then compare with the committed payloads
python -m royaltree build --all --offline
python -m royaltree diff                      # validate.py diff --base HEAD

# Build a tree, fetching only people and labels the store doesn't have yet.
# A missing monarch list is scraped first; --lists forces a re-scrape.
python -m royaltree build Thailand

# Update the store only (no files written)
python -m royaltree fetch England

# Pick up Wikidata edits: check revisions (props=info, 50 per request) and
# refetch only the people whose revision changed. --since skips rows already
# verified after that date. Refuses to refetch more than --max-refetch (2000).
python -m royaltree fetch England --refresh --since 2026-11-01

# Offline: rebuild houses and every payload from the committed combined files
# (works on a fresh clone without a store)
python -m royaltree split

# Schema + invariants, and the data-level diff (see below)
python -m royaltree check
python -m royaltree diff --base master -v

# One-time migration of the old data/*.json caches (no network). Refuses if the
# store already holds fetched people (--force replaces them with the old snapshots).
python -m royaltree import-legacy --from /path/to/old/data

# After the migration: refetch the people whose old caches disagreed (see
# Refreshing data). --conflicts-only records that set for an already-migrated
# store without re-importing.
python -m royaltree import-legacy --from /path/to/old/data --conflicts-only
python -m royaltree fetch --all --refresh-conflicts --max-refetch 5000 --maxlag 30
```

Options shared by every command: `--data-dir`, `--out-dir`, `--offline`,
`--max-requests N` (default 3000: the run stops cleanly at the cap and the next
run resumes) and `--summary-json PATH`. Tree commands also take `--all`,
`--lists`, `--refresh`, `--since DATE`, `--refresh-conflicts`, `--max-refetch N`,
`--fresh-membership` and `--allow-dropped-trees` (see [Store](#the-entity-store)).

Every run ends with a summary on stderr. It is also stored in the store's `runs`
table:

```
== royaltree build: ok in 8.28s; 0 requests, 0 429s, 0 maxlag waits, 0 5xx, 0 network errors, waited 0.0s
   traverse:England                 0.15s      0 req   0 429
   combine                          ...
```

Portraits are a separate script, covered under [Portraits](#portraits).

## Checking and diffing the payloads

[`validate.py`](validate.py) checks and compares `public/royalty/` offline. Both
commands are read-only and take a few seconds.

```bash
# Schema + invariants for every payload. Exit 1 on any issue not in the allow-list.
python -m royaltree check           # or: python validate.py check; add -v to list every failure, --json for tooling

# Data-level diff against a git ref (default HEAD) or a directory
python validate.py diff
python validate.py diff --base master
python validate.py diff --base /path/to/old/royalty -v   # -v prints each change as JSON
```

`check` validates each file against a JSON Schema subset for its type
(monarchy, house, person record, `index.json`, `houses.json`) and these
invariants:

- the node key equals the record's `id`; no one is their own parent; father and
  mother differ;
- birth is not after death, and each parent in the payload was born before the
  child (compared at the shared precision: `-00-00` means year only);
- every `monarchList` and `successionList` ID is in `nodes`, and no succession
  path is empty;
- house members are in `nodes`, their ranks equal `Ranks.rank_tier`, and house
  monarchs are members;
- `index.json` and `houses.json` match the files on disk, and a person's record
  is identical in every file.

Known current issues are allowed in [`check_allowlist.py`](check_allowlist.py),
with a reason and the step expected to fix each. Small rules list their subjects
there; the bulk rules (dates, empty paths, missing monarchs) keep them in
`check_allowlist.json`. `python validate.py check --update-allowlist` rewrites
that JSON from the current output: review its diff, which should only shrink
unless the change explains why. Allow-list entries that no longer occur are
printed as stale.

`diff` reports, per changed file: people added, removed, changed (with field
names) or moved between `nodes` and `extendedNodes`; parent and succession
edges added or removed; `monarchList`/`successionList` changes, including pure
reorders; list fields whose items only changed order; and house member and rank
changes. Gzip headers, JSON key order and node order are ignored.

Use both as evidence for a data change: run `check`, then `diff` against the
commit before the change, and explain every change it reports.

Unit tests for these tools (tiny inline fixtures, no network):

```bash
uv run pytest
```

## Stages of a build

`python -m royaltree build <M...>` runs these stages (each is timed in the
summary):

| Stage | Code | Network (skipped with `--offline`) | Writes |
|---|---|---|---|
| `lists` (only if a list is missing, or `--lists`) | `GetListOfMonarchs.get_monarch_lists` | Wikipedia + Wikidata | `data/monarch_list.json` |
| `refetch-conflicts` (only with `--refresh-conflicts`) | `cli.refresh_conflicts` | Wikidata | store |
| `revision-check`, `refetch` (only with `--refresh`/`--since`) | `cli.refresh` | Wikidata `props=info` | store |
| `traverse:<M>` per requested tree | `graph.traverse_tree` | Wikidata, for people not in the store | store: people, the tree's paths, ancestors and member set |
| `combine` (every stored tree) | `build.combine` | Wikidata, for labels not in the store | nothing yet |
| `write-combined` | `build.write_combined` | | `data/monarchy_data.json`, `monarchy_family_trees.json`, `monarchy_ancestors.json` |
| `houses` | `BuildHouses.build_houses` | | `data/houses.json` |
| `split` | `SplitDataForFrontend` | | `public/royalty/*`, removes payloads no longer indexed |

`fetch` runs `lists` to `combine` and writes no files. `split` runs `houses` and
`split` only.

### Monarch lists

`GetListOfMonarchs.get_monarch_lists` has one branch per monarchy. Older
branches parse a specific navbox (`aria-labelledby` anchor plus `td` classes)
through `get_monarch_list` / `get_monarch_list_with_i`. Newer branches use
`scrape_monarchy` with a named strategy (navbox, wikitables, heading list or
Egyptian period). `Chinggisids` is the union of the Mongol lists
(`build_chinggisids`). Article titles are resolved to Q-IDs in batches through
the Wikipedia API, and only humans (`P31 = Q5`) are kept. This stage depends on
exact Wikipedia markup and is the most fragile one, so it runs only when a list
is missing or with `--lists`.

### People and succession paths

`royaltree/wikidata.py` parses each entity into a person record with the fields
in `PROPERTIES`: parents (`P22`/`P25`), spouses (`P26`), children (`P40`),
siblings (`P3373`), family (`P53`), dates, places, titles, positions with their
qualifiers, and more. The `from`/`to` keys deliberately merge `replaces`/
`follows` and `replaced by`/`followed by`. `graph.family_tree` then runs a
level-batched BFS over family edges from each monarch to the earliest of the
next five in the list. It is capped by `MAX_BFS_DEPTH` (8) and `MAX_BFS_NODES`
(4000) and records `[]` when no path is found.

`royaltree/wdqs.py` is the typed fetcher for the next slice. It POSTs to
`https://query.wikidata.org/sparql` (`Accept: application/sparql-results+json`)
in sequential `VALUES` batches of 400, through the same HTTP session as the
Action API. Single-valued facts (parents, sex, family, birth, death) use the
best rank: preferred over normal, deprecated never, and a tie or an unknown
value is stored explicitly. Positions, titles, spouses, children and siblings
keep every non-deprecated statement and its rank, including a position with no
end date. Dates are `{time, precision}`. `format_date` renders those for tests
(a century is `c. 12th century`, a decade is `990s`, BCE years stay historical).
Labels still come from `wbgetentities` when WDQS does not answer. Pinned
responses live in [`tests/fixtures/wdqs_pinned.json`](tests/fixtures/wdqs_pinned.json);
`uv run python -m royaltree.wdqs_drift` reports live drift and is not part of
pytest.

### Ancestors

`graph.gather_ancestors` follows `father`/`mother` out to 5 generations from
every listed monarch and adds the siblings of each ancestor, for
`EUROPEAN_MONARCHIES`, so multi-monarchy views show shared ancestry. The Mongol
houses (`DEEP_ANCESTOR_MONARCHIES`) get a deeper (12), sibling-free pass that
reconnects the khanates to Genghis Khan. Other trees have no ancestor stage.
People whose `father` is missing in Wikidata stay unconnected.

### Labels and combine

`build.combine` derives the combined files from the store for **every** stored
tree. Each tree contributes its succession nodes plus their parents, spouses
and siblings, and its labelled ancestors. Every contribution is limited to the
tree's member set (the people its own traversals requested). Display-only
Q-IDs (places, titles, positions, qualifiers) become English labels. The
relationship fields (`id`, `father`, `mother`, `spouse`, `child`, `sibling`,
`relative`, `from`, `to`) stay as Q-IDs. Because each person has one store
record and membership depends only on the tree's own traversal, rebuilding one
tree never changes another tree's people, whatever the build order.

**Known bug:** `unmarried partner` is labelled (names, not Q-IDs) before
membership is computed, so partners never reach the combined data. It is kept
as-is for payload stability and will be fixed in `-wdqs-fetch`.

### Houses

`BuildHouses.build_houses` groups everyone in the combined pool by `family`
(`P53`), merges obvious variants through `HOUSE_ALIASES`, and keeps houses
with at least `MIN_HOUSE_MEMBERS` (20). Each member gets a `Ranks.rank_tier`
score, a heuristic over occupation, position, noble title, label and
description, refined by a curated Q-ID map. Each house also carries a
father/mother ancestor pool capped at `ANCESTOR_DEPTH` (8), so the frontend can
connect a rank-filtered subset into one subtree.

### Frontend payloads

`SplitDataForFrontend` writes one gzipped JSON file per monarchy and per house
into `my-app/public/royalty/`, plus `index.json` (monarchy names) and
`houses.json` (house index). It also removes `.json.gz` files that are no
longer indexed, for example a house that fell under 20 members. The output is
byte-deterministic (sorted nodes, gzip `mtime=0`) and every file is written
atomically. The payload contract is described in [`../README.md`](../README.md).

## The entity store

`data/royaltree.sqlite` (git-ignored, about 65 MB after the migration) is the
only cache. It has three tables:

- `entities(qid, kind, data, source, lastrevid, fetched_at, checked_at)`: one
  row per QID and kind. `kind` is `person` (parsed record) or `label`. `source`
  is `wbgetentities`, `legacy:<file>`, or `wdqs`. `lastrevid` is the Wikidata
  revision the row reflects (NULL for imported rows). Kind `wdqs` (source
  `wdqs`) holds the typed SPARQL record; `build` still writes `person`.
- `trees(monarchy, name, data)`: per-tree `family_tree` (succession paths),
  `ancestors` (closure) and `touched` (member set).
- `runs`: one summary per run.

Each 50-ID batch is committed in one transaction (WAL journal), so a killed or
interrupted run keeps every finished batch and corrupts nothing. Rerunning the
same command resumes: it finds those people in the store and fetches only the
rest. An advisory lock (`royaltree.sqlite.lock`) stops a second writer.

The member set is **sticky**. A run adds what it requested to the tree's
earlier set, as the old per-tree caches did, so relatives that only an earlier
run fetched stay in the tree. `--fresh-membership` recomputes the set from this
run alone. This drops about 1,300 relatives that today's payloads show, mostly
parents of monarchs in trees without an ancestor stage.

**Request hygiene** (`royaltree/http.py`). Every request goes through one
session with the User-Agent `RoyalTreeBot/1.0 (+https://makoa.link)` and a
`(10 s, 60 s)` timeout. GET and POST share it. Requests are sent serially, with
`maxlag=5` on the Action API, and back off on HTTP 429/5xx (honouring
`Retry-After`; a request asking for more than 120 s fails instead of retrying
early). maxlag waits have their own, more
patient retry budget. Counters feed the summary.

## Data files

Committed (inputs to the offline `split`):

- `data/monarch_list.json`: ordered monarch Q-IDs per monarchy.
- `data/monarchy_data.json`: deduplicated, labelled person records for all trees
  (written sorted by Q-ID).
- `data/monarchy_family_trees.json`: succession paths per monarchy.
- `data/monarchy_ancestors.json`: monarchy -> ancestor Q-IDs (feeds `extendedNodes`).
- `monarch_images_manifest.json`: Q-IDs whose portraits are already uploaded.
- `../../../public/royalty/*`: the payloads the app fetches.

Git-ignored: `data/royaltree.sqlite*` (the store) and `data/houses.json` (about
56 MB; `split` regenerates it). The old per-tree caches (`data/<M>.json`,
`<M>_labelled.json`, `<M>_family_tree.json`, `<M>_ancestors.json`) and
`data/properties.json` are no longer read or written. Import them once with
`import-legacy`.

A fresh clone without a store can run `split` offline. Building from an empty
`data/` directory works with the network as `build --all` (lists are scraped,
then people and labels fetched). A single `build <M>` on a store without the
other published trees is refused rather than dropping them; import the old
caches or build `--all` first.

`split` deletes only payloads that the previous `index.json`/`houses.json`
listed and this run no longer writes (e.g. a house that fell below the member
threshold), so pointing `--out-dir` at another folder deletes nothing.

## Refreshing data

Rows never expire on their own. To pick up Wikidata edits for a tree:

1. `python -m royaltree fetch <M> --refresh` checks the revisions of the tree's
   stored people (one request per 50) and refetches only the changed ones.
   Imported rows have no known revision, so the first refresh of a tree refetches
   them. The cap applies: a refresh that would refetch more than `--max-refetch`
   entities stops before fetching anything. Use `--since DATE` to check only
   rows not verified since then.
2. `python -m royaltree build <M>` (or `--offline` right after the fetch)
   rebuilds the files, then `check` and `diff`.

Labels of non-person items (places, titles) are not revision-checked yet.

**Conflicting legacy snapshots.** A person cached by several old trees could
hold different snapshots, and `import-legacy` kept only one (the published one,
else the newest file), often an older snapshot with fewer siblings or children.
It records those QIDs in the store's `meta` table (`legacy_conflicts`; for an
already-migrated store, `import-legacy --from <dir> --conflicts-only` records
them without touching imported rows). `fetch --refresh-conflicts` refetches the
whole recorded set, whatever trees are named, 50 per request. Only rows still
without a known revision are due (an item since deleted on Wikidata is stored
with revision 0 and not refetched again), so an interrupted run resumes and a finished
one does nothing. It counts against `--max-refetch` (about 5,000 rows here, so
raise the cap). Follow it with an online `build --all`, which fetches the
relatives the fresh records newly reference.

## Portraits

`buildMonarchImages.py` is a standalone script and not part of the `royaltree` CLI.
For every person in `data/monarchy_data.json` with a Commons `image`, it
downloads a 200 px thumbnail from `commons.wikimedia.org/wiki/Special:FilePath/`,
re-encodes it as JPEG (quality 82) with Pillow, and uploads it with boto3
(AWS profile `makoa`) to `s3://makoa.link/monarchy/<Qid>.jpg`. Finished Q-IDs
are recorded in `monarch_images_manifest.json`, so re-runs resume where they
stopped. `--dry-run` fetches without uploading. `--ids`, `--limit`, `--workers`,
`--width` and `--force` narrow or override a run.

```bash
uv run python buildMonarchImages.py --dry-run --limit 5
```

The real run writes to the production bucket and needs AWS credentials.
Run it only deliberately. The manifest currently lags the dataset: it has far
fewer entries than there are people with images.

## How the data reaches the site

The pipeline writes only local files. Publishing works like this:

1. Run `python validate.py check`, then commit the regenerated
   `src/Royalty/Data/data/*.json` and `public/royalty/*` files.
2. `npm run build` in `my-app/` copies `public/royalty/` to `build/royalty/`.
3. [`my-app/deploy.sh`](../../../deploy.sh) (`npm run deploy`) uploads the
   fingerprinted `build/assets/` with an immutable cache, syncs the rest of
   `build/` (including `royalty/`) to the S3 bucket root with
   `Cache-Control: max-age=3600`, uploads `index.html` uncached, and invalidates
   CloudFront. The root sync runs **without** `--delete`, so payloads removed
   locally stay in the bucket until they are removed by hand.

Portraits bypass `deploy.sh` entirely. `buildMonarchImages.py` uploads them
straight to `s3://makoa.link/monarchy/`.
