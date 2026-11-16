# Royalty data pipeline

Builds the datasets behind the royal tree charts (`/RoyalTree`). The ordered
monarch lists are scraped from English Wikipedia. Person facts come from
[Wikidata](https://www.wikidata.org/) through the Action API (`wbgetentities`,
50 IDs per call), not SPARQL. Portraits come from Wikimedia Commons.

Everything except portraits is orchestrated by [`pipeline.py`](pipeline.py).

## Setup

Python **3.11 or newer** is required (the code uses `match`). The version is
pinned in [`.python-version`](.python-version) (3.11) and
[`pyproject.toml`](pyproject.toml) (`requires-python >= 3.11`). Dependencies
are locked in [`uv.lock`](uv.lock): requests and beautifulsoup4 for the
pipeline, plus pillow and boto3 for the portrait script.

With [uv](https://docs.astral.sh/uv/) (recommended):

```bash
cd my-app/src/Royalty/Data
uv sync --frozen            # creates .venv/ from uv.lock
uv run python pipeline.py --help
```

Without uv, use the hash-pinned export in [`requirements.txt`](requirements.txt):

```bash
cd my-app/src/Royalty/Data
python3.11 -m venv .venv
source .venv/bin/activate
pip install --require-hashes -r requirements.txt
python pipeline.py --help
```

`.venv/` is git-ignored. After changing a dependency in `pyproject.toml`, run
`uv lock`, then regenerate `requirements.txt` with
`uv export --frozen --no-dev --no-emit-project --format requirements-txt -o requirements.txt`.

All scripts use paths relative to this directory. `pipeline.py` `chdir`s here
itself, so it can be run from anywhere. Run the other scripts from here.

## Commands

The examples use `python` inside the activated venv. With uv, prefix them with
`uv run`.

```bash
# Full build of one or more monarchies (network: Wikipedia + Wikidata)
python pipeline.py England France Spain

# Full build of every known monarchy (the 41 names in GetListOfMonarchs.monarchies)
python pipeline.py --all

# Reuse data/monarch_list.json and skip the brittle Wikipedia scraping stage
python pipeline.py England --skip-lists

# Normal build without the common-ancestor stages
python pipeline.py England --skip-ancestors

# Layer common-ancestor data onto the existing build (no succession rebuild; network)
python pipeline.py England France Spain --ancestors-only

# Fetch the deep Mongol-house lineages (khanates -> Genghis Khan), fold them in
# and rebuild houses (network). With no names it defaults to
# GatherAncestors.DEEP_ANCESTOR_MONARCHIES.
python pipeline.py --deep-ancestors

# Rebuild only the house groupings and their payloads (offline)
python pipeline.py --houses-only

# Rebuild only public/royalty/ from the combined files (offline)
python pipeline.py --split-only
```

Flag precedence: `--houses-only`, then `--deep-ancestors`, then
`--split-only`, then `--ancestors-only`. The first one set wins and the others
are ignored. Monarchy names are validated against `GetListOfMonarchs.monarchies`
for normal builds and `--ancestors-only`. `--deep-ancestors` does not validate
them.

Portraits are a separate script, covered under [Portraits](#portraits).

## Stages of a normal build

`python pipeline.py <M...>` (`pipeline.run`) runs these steps in order:

| # | Function | Reads | Writes |
|---|----------|-------|--------|
| 1 | `GetListOfMonarchs.get_monarch_lists` (skipped by `--skip-lists`) | Wikipedia list pages and navboxes; Wikipedia API (title -> Q-ID) | `data/monarch_list.json` (only the requested keys are replaced) |
| 2 | `GetData.get_monarch_data` | `data/monarch_list.json`; Wikidata | `data/<M>.json` (entity cache), `data/<M>_family_tree.json` |
| 3 | `GatherAncestors.gather_ancestors` (European realms only) | `data/monarch_list.json`, `data/<M>.json`; Wikidata | `data/<M>_ancestors.json`; adds people to `data/<M>.json` |
| 4 | `GatherAncestors.gather_deep_ancestors` (Mongol houses only) | as above | as above |
| 5 | `GetData.label_people` | `data/<M>.json`, `data/properties.json`; Wikidata for unseen labels | `data/<M>_labelled.json`, `data/properties.json` |
| 6 | `CleanRoyalTreeData.clean_and_combine` | `data/<M>_family_tree.json`, `data/<M>_labelled.json`, existing combined files | `data/monarchy_data.json`, `data/monarchy_family_trees.json` |
| 7 | `GatherAncestors.combine_ancestors` | `data/<M>_ancestors.json`, `data/<M>_labelled.json` | folds into `data/monarchy_data.json`; `data/monarchy_ancestors.json` |
| 8 | `BuildHouses.build_houses` | `data/monarchy_data.json`, `data/monarch_list.json` | `data/houses.json` |
| 9 | `SplitDataForFrontend.split` | combined files, `data/monarchy_ancestors.json` | `public/royalty/<M>.json.gz`, `public/royalty/index.json` |
| 10 | `SplitDataForFrontend.split_houses` | `data/houses.json` | `public/royalty/<House>.json.gz`, `public/royalty/houses.json` |

`--skip-ancestors` drops steps 3, 4 and 7. The shortcut commands run subsets:

| Command | Steps |
|---------|-------|
| `--ancestors-only <M...>` | 3, 5, 7, 8, 9, 10 |
| `--deep-ancestors [M...]` | 4, 5, 7, 8, 9, 10 |
| `--houses-only` | 8, 10 |
| `--split-only` | 9, 10 (10 is skipped with a message if `data/houses.json` is missing) |

### 1. Monarch lists

`GetListOfMonarchs.get_monarch_lists` has one branch per monarchy. Older
branches parse a specific navbox (`aria-labelledby` anchor plus `td` classes)
through `get_monarch_list` / `get_monarch_list_with_i`. Newer branches use
`scrape_monarchy` with a named strategy (navbox, wikitables, heading list or
Egyptian period). `Chinggisids` is the union of the Mongol lists
(`build_chinggisids`). Article titles are resolved to Q-IDs in batches through
the Wikipedia API, and only humans (`P31 = Q5`) are kept. This stage depends on
exact Wikipedia markup and is the most fragile one. Use `--skip-lists` when you
only need to rebuild from Wikidata.

### 2. People and succession paths

`GetData.DataRetriever` fetches entities in batches and keeps the fields in
`GetData.PROPERTIES`: parents (`P22`/`P25`), spouses (`P26`), children (`P40`),
siblings (`P3373`), family (`P53`), dates, places, titles, positions with their
qualifiers, and more. The `from`/`to` keys deliberately merge `replaces`/
`follows` and `replaced by`/`followed by`. `construct_family_tree_from_monarch_list`
then runs a level-batched BFS over family edges from each monarch to the next
one in the list. It is capped by `MAX_BFS_DEPTH` (8) and `MAX_BFS_NODES` (4000)
and records `[]` when no path is found.

### 3–4. Ancestors

`gather_ancestors` follows `father`/`mother` out to `MAX_ANCESTOR_DEPTH` (5)
from every listed monarch and adds the siblings of each ancestor. It
runs only for `EUROPEAN_MONARCHIES` and lets multi-monarchy views show shared
ancestry. `gather_deep_ancestors` is a deeper (`DEEP_ANCESTOR_DEPTH` = 12),
sibling-free pass for `DEEP_ANCESTOR_MONARCHIES`. It reconnects the khanates
(Golden Horde, Chagatai, Ilkhanate) to Genghis Khan through the paternal chain
the BFS never climbs. Both are no-ops for other monarchies. People whose
`father` is missing in Wikidata stay unconnected.

### 5. Labels

`GetData.PropertyRetriever` replaces display-only Q-IDs (places, titles,
positions, qualifiers and so on) with English labels. Relationship fields
(`id`, `father`, `mother`, `spouse`, `child`, `sibling`, `relative`, `from`,
`to`) stay as Q-IDs. Everything else is labelled, including `unmarried partner`.

### 6–7. Combine

`clean_and_combine` loads the existing `monarchy_data.json` and
`monarchy_family_trees.json` and, for each rebuilt monarchy, replaces its
succession paths and upserts the people on those paths along with their
parents, spouses and siblings. It never deletes people, so
the combined file accumulates across runs.
**Known bug:** `CleanRoyalTreeData.py` also tries to upsert `unmarried partner`
entries, but that property is labelled (names, not Q-IDs) by this point, so
partners never reach the combined data. Tracked for the overhaul. `combine_ancestors` then folds in
each monarchy's labelled ancestors and rewrites `monarchy_ancestors.json`.

### 8. Houses

`BuildHouses.build_houses` groups everyone in the combined pool by `family`
(`P53`), merges obvious variants through `HOUSE_ALIASES`, and keeps houses
with at least `MIN_HOUSE_MEMBERS` (20). Each member gets a `Ranks.rank_tier`
score, a heuristic over occupation, position, noble title, label and
description, refined by a curated Q-ID map. Each house also carries a
father/mother ancestor pool capped at `ANCESTOR_DEPTH` (8), so the frontend can
connect a rank-filtered subset into one subtree.

### 9–10. Frontend payloads

`SplitDataForFrontend` writes one gzipped JSON file per monarchy and per house
into `my-app/public/royalty/`, plus `index.json` (monarchy names) and
`houses.json` (house index). The payload contract is described in
[`../README.md`](../README.md).

## Caches and data files

Committed (inputs to the offline commands):

- `data/monarch_list.json`: ordered monarch Q-IDs per monarchy.
- `data/monarchy_data.json`: deduplicated, labelled person records for all monarchies.
- `data/monarchy_family_trees.json`: succession paths per monarchy.
- `data/monarchy_ancestors.json`: monarchy -> ancestor Q-IDs (feeds `extendedNodes`).
- `data/properties.json`: Q-ID -> English label cache, which is expensive to rebuild.
- `monarch_images_manifest.json`: Q-IDs whose portraits are already uploaded.
- `../../../public/royalty/*`: the payloads the app fetches.

Regenerable (git-ignored, recreated by the pipeline):

- `data/<M>.json`: raw Wikidata entity cache per monarchy.
- `data/<M>_family_tree.json`: per-monarchy BFS succession paths.
- `data/<M>_labelled.json`: per-monarchy labelled people.
- `data/<M>_ancestors.json`: per-monarchy ancestor (plus sibling) Q-IDs.
- `data/houses.json`: house members, ranks and node pools (~56 MB). Regenerate it
  with `python pipeline.py --houses-only` instead of committing it.

A fresh clone can therefore run `--houses-only` and `--split-only` offline.
Every other command fetches from Wikipedia and/or Wikidata.

## Refreshing data

The caches never expire. Once an entity is in `data/<M>.json`, or a label is in
`data/properties.json`, it is reused on every later run. To pick up Wikidata
edits for a monarchy:

1. Delete `data/<M>.json` (and `data/<M>_ancestors.json` if relevant). Remove
   individual entries from `data/properties.json` only if a label itself changed.
2. Run `python pipeline.py <M>` (add `--skip-lists` if the Wikipedia list hasn't
   changed).
3. Review `git diff --stat src/Royalty/Data/data public/royalty`, check the page
   locally (`npm run dev` in `my-app/`), and commit the data files with the code.

Note that the combined files only grow (see stages 6–7), and the JSON key order
is not stable between runs. Two runs over identical inputs can produce
byte-different but JSON-equal files.

Wikidata calls go through `utils._get_json_with_retry`, which sends the
`User-Agent` in `utils.WIKIMEDIA_HEADERS` and retries failures. The newer
list scrapers (`_get_soup`, `_resolve_titles_to_qids`) send `_SCRAPER_UA`. The
legacy list branches (`get_monarch_list`, `get_monarch_list_with_i`,
`convert_wiki_list_to_wiki_data_list` and some inline `requests.get` calls in
`get_monarch_lists`) send no User-Agent, so Wikipedia may reject them.

## Portraits

`buildMonarchImages.py` is a standalone script and not part of `pipeline.py`.
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

1. Commit the regenerated `src/Royalty/Data/data/*.json` and
   `public/royalty/*` files.
2. `npm run build` in `my-app/` copies `public/royalty/` to `build/royalty/`.
3. [`my-app/deploy.sh`](../../../deploy.sh) (`npm run deploy`) uploads the
   fingerprinted `build/assets/` with an immutable cache, syncs the rest of
   `build/` (including `royalty/`) to the S3 bucket root with
   `Cache-Control: max-age=3600`, uploads `index.html` uncached, and invalidates
   CloudFront. The root sync runs **without** `--delete`, so payloads removed
   locally stay in the bucket until they are removed by hand.

Portraits bypass `deploy.sh` entirely. `buildMonarchImages.py` uploads them
straight to `s3://makoa.link/monarchy/`.
