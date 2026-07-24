# Royal Family Trees (`/RoyalTree`)

An interactive genealogy graph of ~41 monarchies, rendered with Cytoscape.js.
Nodes are people (with portraits where available), edges are parent/child,
marriage, sibling, and succession links. You can load one or several monarchies
at once; the app bridges them through shared ancestors.

- Page component: [`RoyalTreePage.jsx`](RoyalTreePage.jsx)
- Graph-building helpers: [`RoyalTreeUtils.js`](RoyalTreeUtils.js)
- Data pipeline (Python): [`Data/`](Data) — full mechanics in
  [`Data/README.md`](Data/README.md)
- Served payloads: [`../../public/royalty/`](../../public/royalty)

## Data sources

| Data | Source |
|------|--------|
| Ordered lists of monarchs per realm | **English Wikipedia** (navboxes, wikitables, section headings) |
| Person facts (parents, spouses, dates, titles, etc.) | **Wikidata** via the Action API (`wbgetentities`) |
| Portraits | **Wikimedia Commons** (from each person's Wikidata `P18` image) |

There is a legacy SPARQL/`wikibase-sdk` stub (`Data/get-data.js`) left over from
prototyping; the production pipeline is pure Python and uses the Wikidata Action
API, **not** SPARQL.

## How the data is gathered and processed

The pipeline is orchestrated by [`Data/pipeline.py`](Data/pipeline.py). The short
version (see [`Data/README.md`](Data/README.md) for the full stage-by-stage
account and CLI flags):

1. **Scrape monarch lists** — [`Data/GetListOfMonarchs.py`](Data/GetListOfMonarchs.py)
   reads Wikipedia list pages for each realm, resolves article titles to Wikidata
   Q-ids, filters to humans (`P31 = Q5`), and writes ordered id lists to
   `Data/data/monarch_list.json`.
2. **Fetch people + build succession paths** — [`Data/GetData.py`](Data/GetData.py)
   batch-fetches each monarch from Wikidata (extracting parents `P22`/`P25`,
   spouses `P26`, children `P40`, siblings `P3373`, dates, places, titles,
   positions, and more), then does a bounded BFS over family edges to connect each
   monarch to the next in the list.
3. **Gather ancestors** — [`Data/GatherAncestors.py`](Data/GatherAncestors.py)
   walks parents upward (depth 5 + siblings for European realms; a deeper depth-12
   pass for the Mongol khanates) so separate monarchies can be joined at shared
   ancestors.
4. **Label** — [`Data/GetData.py`](Data/GetData.py) replaces display-only Q-ids
   with English labels, cached in `Data/data/properties.json`. Relationship edges
   stay as Q-ids.
5. **Combine + group houses** — merged into `monarchy_data.json` /
   `monarchy_family_trees.json`; `BuildHouses` groups people by family (`P53`).
6. **Split for the frontend** — [`Data/SplitDataForFrontend.py`](Data/SplitDataForFrontend.py)
   writes one gzipped payload per monarchy/house to `public/royalty/*.json.gz`
   plus `index.json` (monarchy names) and `houses.json`.

### Per-monarchy payload schema (`public/royalty/<Monarchy>.json.gz`)

```jsonc
{
  "successionList": [["Q83476", "Q187114"], ...],  // genealogical path per reign
  "monarchList":    ["Q83476", "Q187114", ...],    // ordered succession
  "nodes":          { "Q...": { /* person */ } },  // succession nodes + parents
  "extendedNodes":  { "Q...": { /* person */ } }   // ancestors (European/Mongol only)
}
```

A person node looks like:

```jsonc
{
  "id": "Q80823",
  "label": "Anne Boleyn",
  "father": "Q312398", "mother": "Q236905",   // relationships stay as Q-ids
  "spouse": ["Q38370"], "child": ["Q7207"], "sibling": ["Q209502"],
  "sex or gender": "female",
  "family": "Boleyn family",
  "date of birth": "+1507-00-00T00:00:00Z",   // Wikidata time format
  "date of death": "+1536-05-19T00:00:00Z",
  "place of death": "Tower of London",
  "image": ["Anne boleyn.jpg"],               // Commons filename, not a URL
  "position held": [{ "label": "queen consort", "start time": "...", "end time": "..." }]
}
```

## Portraits

[`Data/buildMonarchImages.py`](Data/buildMonarchImages.py) (run standalone, not
part of `pipeline.py`) takes each person's first Commons image, downloads a 200px
thumbnail from `commons.wikimedia.org/wiki/Special:FilePath/…`, converts to JPEG,
and uploads to `s3://makoa.link/monarchy/<Qid>.jpg`. Progress is tracked in
`Data/monarch_images_manifest.json`.

The frontend derives the portrait URL purely from the Q-id
(`https://makoa.link/monarchy/<Qid>.jpg`) — there is no client-side manifest.
People without an uploaded portrait render as a solid colored node.

## How the frontend uses it

- On mount, `RoyalTreePage.jsx` loads `index.json` (+ `houses.json`) to populate
  the selector, then fetches the gzipped payload(s) for the chosen realm(s) and
  decompresses them in-browser.
- [`RoyalTreeUtils.js`](RoyalTreeUtils.js) merges the selected monarchies, builds
  Cytoscape nodes/edges (parent→marriage→child, spouse, sibling, and gold
  succession edges), colors nodes by monarchy and sex, and flags people shared
  across realms.
- Layout runs dagre per connected component, ordered left-to-right by median
  birth year. Clicking a shared node highlights the bloodline path to the nearest
  monarch in each connected realm.

## Regenerating the data

```bash
cd src/Royalty/Data
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

python pipeline.py --all            # full rebuild → public/royalty/*.json.gz
python pipeline.py --split-only     # only refresh the frontend payloads
python buildMonarchImages.py        # (separate) portraits → s3://makoa.link/monarchy/
```

See [`Data/README.md`](Data/README.md) for every stage, flag, and cache file.
