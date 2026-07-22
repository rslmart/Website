# Royalty data pipeline

Builds the datasets behind the royal tree charts. Data is sourced from
[Wikidata](https://www.wikidata.org/) (structured facts) with the ordered
monarch lists scraped from Wikipedia navboxes.

## Setup

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Running

Everything is orchestrated by `pipeline.py`, which runs the stages in order:

```bash
# One or more monarchies
python pipeline.py England France Spain

# Everything
python pipeline.py --all

# Reuse the existing scraped monarch lists (skip the brittle Wikipedia step)
python pipeline.py England --skip-lists

# Only rebuild the frontend assets from the combined files (no network)
python pipeline.py --split-only

# Layer common-ancestor data onto an already-built dataset (no succession rebuild)
python pipeline.py England France Spain --ancestors-only

# Skip the additive common-ancestor stage during a normal build
python pipeline.py England --skip-ancestors
```

## Stages

| # | Function | Reads | Writes |
|---|----------|-------|--------|
| 1 | `GetListOfMonarchs.get_monarch_lists` | Wikipedia | `data/monarch_list.json` |
| 2 | `GetData.get_monarch_data` | Wikidata | `data/<M>.json`, `data/<M>_family_tree.json` |
| 3 | `GetData.label_people` | Wikidata | `data/<M>_labelled.json` |
| 4 | `CleanRoyalTreeData.clean_and_combine` | per-country files | `data/monarchy_data.json`, `data/monarchy_family_trees.json` |
| 5 | `SplitDataForFrontend.split` | combined files | `public/royalty/<M>.json.gz`, `public/royalty/index.json` |

Additive common-ancestor stages (European monarchies only; run between 2 and 3,
and after 4 — orchestrated automatically by `pipeline.py`):

| Function | Reads | Writes |
|----------|-------|--------|
| `GatherAncestors.gather_ancestors` | Wikidata | `data/<M>_ancestors.json` (warms `data/<M>.json`) |
| `GatherAncestors.combine_ancestors` | per-country files | `data/monarchy_ancestors.json` (folds into `data/monarchy_data.json`) |

These follow `father`/`mother` links out to `MAX_ANCESTOR_DEPTH` (5) from each
monarch and add the siblings of every gathered ancestor, so multi-monarchy views
can reveal shared ancestry (and lateral sibling links when a shared parent is
missing). The set of enriched monarchies and the depth are configured at the top
of `GatherAncestors.py`. Everything else is unchanged, so single-monarchy views
and non-European monarchies behave exactly as before.

Stage 1 is the fragile part: it depends on exact Wikipedia navbox markup
(`aria-labelledby` anchors, `td` classes) and has per-country special cases.
`--skip-lists` avoids re-running it when you only need to rebuild from Wikidata.

## Data layout

Committed (source of truth / runtime assets):

- `data/monarch_list.json` — ordered monarch IDs per monarchy.
- `data/monarchy_data.json` — deduplicated person records across all monarchies.
- `data/monarchy_family_trees.json` — succession/family-tree paths per monarchy.
- `data/properties.json` — Wikidata ID → label cache (expensive to rebuild).
- `public/royalty/*.json.gz`, `index.json` — per-monarchy assets the app fetches.

Regenerable caches (gitignored; recreated by the pipeline):

- `data/<M>.json` — raw Wikidata entity cache.
- `data/<M>_family_tree.json` — per-country BFS succession paths.
- `data/<M>_labelled.json` — per-country labelled data merged in stage 4.
- `data/<M>_ancestors.json` — per-country ancestor+sibling Q-IDs (European only).

## Frontend contract

The React app (`../RoyalTreePage.jsx`) never imports the combined dataset. It
fetches `public/royalty/index.json` for the monarchy dropdown, then fetches and
gunzips `public/royalty/<Monarchy>.json.gz` on selection. Each file contains
`{ successionList, monarchList, nodes }` (and, for European monarchies, an
additional `extendedNodes`), where `nodes` is only the person subset that
monarchy's chart needs. `extendedNodes` (ancestors + their siblings) is used
solely when several monarchies are shown together, to splice in the
father/mother/sibling chains that connect them up to their shared relatives. Run
`python pipeline.py --split-only` after changing the combined data to refresh
these assets.
