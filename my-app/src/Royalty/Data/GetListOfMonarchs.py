"""Scrape ordered monarch lists from the registry in royaltree/monarchies.json.

Every tree uses scrape_monarchy (navbox title, wikitables, a section heading,
or an Egyptian period). A union tree, such as Chinggisids, concatenates lists
already scraped in this run. It does not read monarch_list.json, so a check
cannot observe a half-written file.

Navbox selection compares the navbox's visible title, with punctuation and
slashes ignored, to the registry param. The aria-labelledby id is not the key.
A missing navbox, table or heading raises; the caller records that tree and
continues with the others.
"""
import json
import os
import re

from bs4 import BeautifulSoup

from royaltree import http as requests  # project UA, timeouts, back-off, counters
from royaltree.registry import NAMES, REGISTRY
from royaltree.store import atomic_write
from royaltree.wikidata import get_entities

# Where saveData writes; the CLI points this at --data-dir.
MONARCH_LIST_PATH = os.path.join("data", "monarch_list.json")

# Kingdom/period groupings used to bucket the single List_of_pharaohs page.
_EGYPT_PERIODS = [
    "Early Dynastic", "Old Kingdom", "First Intermediate", "Middle Kingdom",
    "Second Intermediate", "New Kingdom", "Third Intermediate", "Late Period",
    "Ptolemaic",
]

# One run's pages. scrape_registered clears this so a check never reuses an
# earlier run, and so List_of_pharaohs is downloaded once for its three trees.
_soup_cache = {}

monarchies = list(NAMES)


def _title_from_href(href):
    """Page title from a relative or absolute wiki href, or None for non-articles."""
    if not href or "/wiki/" not in href:
        return None
    title = href.split("/wiki/")[-1].split("?")[0].split("#")[0]
    if not title or ":" in title:  # ":" excludes File:/Template:/Special:/etc.
        return None
    return title


def _get_soup(url):
    soup = _soup_cache.get(url)
    if soup is None:
        soup = BeautifulSoup(requests.get(url, timeout=30).content, "html.parser")
        _soup_cache[url] = soup
    return soup


def _ordered_unique(seq):
    out = []
    for item in seq:
        if item not in out:
            out.append(item)
    return out


def normalise_navbox_title(text):
    """Compare navbox titles ignoring case, punctuation and slashes.

    Underscores are spaces, so a legacy anchor prefix and the visible title
    collapse to the same string. The aria-labelledby id is not compared.
    """
    text = (text or "").replace("/", " ").replace("_", " ")
    text = re.sub(r"[^\w\s]", " ", text, flags=re.UNICODE)
    return re.sub(r"\s+", " ", text).strip().casefold()


def _element_text(el):
    return " ".join(el.get_text(" ", strip=True).split())


def _navbox_title(div):
    """Visible title of a navbox. The labelled element is the accessible name."""
    labelled = (div.get("aria-labelledby") or "").split()
    if labelled:
        title_el = div.find(id=labelled[0])
        if title_el is not None:
            return _element_text(title_el)
    title_el = div.find(class_="navbox-title")
    if title_el is None:
        return ""
    parts = []
    for node in title_el.descendants:
        if not isinstance(node, str):
            continue
        if any("navbar" in (parent.get("class") or []) for parent in node.parents):
            continue
        parts.append(node)
    return " ".join("".join(parts).split())


def _titles_owned_by_li(li):
    """Article titles linked from this item, excluding a nested item.

    A co-ruler is a later ``a`` in the same ``li``. A link inside a child
    ``li`` belongs to that child, so walking every item does not count it twice.
    """
    titles = []
    for link in li.find_all("a", href=True):
        if link.find_parent("li") is not li:
            continue
        item = _title_from_href(link["href"])
        if item:
            titles.append(item)
    return titles


def _links_from_navbox(soup, title):
    """Ordered titles from the navbox whose title text matches ``title``.

    Match is on the normalised title, not on aria-labelledby. Each item
    contributes every article link that belongs to it. A missing navbox
    raises; it does not yield an empty list.
    """
    wanted = normalise_navbox_title(title)
    boxes = soup.find_all("div", class_="navbox")
    found = []
    for div in boxes:
        text = _navbox_title(div)
        found.append(text)
        if text and normalise_navbox_title(text) == wanted:
            titles = []
            for li in div.find_all("li"):
                titles.extend(_titles_owned_by_li(li))
            titles = _ordered_unique(titles)
            if not titles:
                raise ValueError(f"navbox titled {title!r} has no article links")
            return titles
    shown = [text for text in found if text]
    raise ValueError(f"navbox titled {title!r} not found; page titles: {shown}")


def _first_link_in_row(tr):
    for link in tr.find_all("a", href=True):
        title = _title_from_href(link["href"])
        if title:
            return title
    return None


def _links_from_tables(soup, indices=None):
    """First article link in each row of the requested wikitables.

    A missing table raises. An empty selection is not reported as success.
    """
    tables = soup.find_all("table", class_="wikitable")
    if indices is None:
        if not tables:
            raise ValueError("no wikitable found")
        chosen = tables
    else:
        missing = [i for i in indices if i >= len(tables)]
        if missing or not indices:
            raise ValueError(
                f"wikitable index {missing or list(indices)} not found "
                f"({len(tables)} wikitables on the page)")
        chosen = [tables[i] for i in indices]
    titles = []
    for table in chosen:
        for tr in table.find_all("tr"):
            title = _first_link_in_row(tr)
            if title:
                titles.append(title)
    titles = _ordered_unique(titles)
    if not titles:
        raise ValueError("wikitable has no article links")
    return titles


def _links_from_heading_list(soup, keyword):
    """Ordered titles from the first list or table after a matching heading."""
    for heading in soup.find_all(["h2", "h3", "h4"]):
        if keyword.lower() in heading.get_text().lower():
            container = heading.find_next(["ul", "table"])
            if container is None:
                raise ValueError(f"heading containing {keyword!r} has no list or table")
            titles = [_title_from_href(link["href"]) for link in container.find_all("a", href=True)]
            titles = _ordered_unique([title for title in titles if title])
            if not titles:
                raise ValueError(f"heading containing {keyword!r} has no article links")
            return titles
    raise ValueError(f"heading containing {keyword!r} not found")


def _links_from_egypt_period(soup, period):
    """Pharaohs under one kingdom heading on List_of_pharaohs.

    A missing period heading raises instead of returning an empty list.
    """
    if period not in _EGYPT_PERIODS:
        raise ValueError(f"unknown Egyptian period {period!r}")
    current = None
    seen = False
    titles = []
    for el in soup.find_all(["h2", "h3", "table"]):
        if el.name in ("h2", "h3"):
            text = el.get_text()
            for name in _EGYPT_PERIODS:
                if name.lower() in text.lower():
                    current = name
                    if name == period:
                        seen = True
                    break
        elif el.name == "table" and "wikitable" in (el.get("class") or []) and current == period:
            for tr in el.find_all("tr"):
                title = _first_link_in_row(tr)
                if title:
                    titles.append(title)
    if not seen:
        raise ValueError(f"heading for period {period!r} not found")
    titles = _ordered_unique(titles)
    if not titles:
        raise ValueError(f"period {period!r} has no article links")
    return titles


def _resolve_titles_to_qids(titles):
    """Map ordered enwiki titles to Wikidata Q-IDs via pageprops (follows
    redirects). Preserves order and drops duplicates/unresolved titles."""
    qids = []
    for i in range(0, len(titles), 50):
        batch = titles[i:i + 50]
        resp = requests.get(
            "https://en.wikipedia.org/w/api.php",
            params={
                "action": "query", "format": "json", "prop": "pageprops",
                "ppprop": "wikibase_item", "redirects": 1, "titles": "|".join(batch),
            },
            timeout=30,
        ).json()
        query = resp.get("query", {})
        norm = {n["from"]: n["to"] for n in query.get("normalized", [])}
        redir = {r["from"]: r["to"] for r in query.get("redirects", [])}
        by_title = {p.get("title"): p.get("pageprops", {}).get("wikibase_item")
                    for p in query.get("pages", {}).values()}
        for title in batch:
            key = title.replace("_", " ")
            key = norm.get(key, key)
            key = redir.get(key, key)
            qid = by_title.get(key)
            if qid:
                qids.append(qid)
    return _ordered_unique(qids)


def _keep_humans(qids):
    """Keep only Q-IDs whose instance-of (P31) includes human (Q5)."""
    data = get_entities(qids)
    humans = []
    for qid in qids:
        entity = data.get(qid)
        if not entity:
            continue
        try:
            p31 = [claim["mainsnak"]["datavalue"]["value"]["id"]
                   for claim in entity["claims"].get("P31", [])]
        except (KeyError, TypeError):
            p31 = []
        if "Q5" in p31:
            humans.append(qid)
    return humans


def scrape_monarchy(url, strategy, param=None, blocklist=frozenset(), stop_after=None):
    """Scrape an ordered, humans-only list of Wikidata Q-IDs for one source.

    strategy: "navbox" (param=title text), "tables" (param=list of table
    indexes, or None for every wikitable), "heading" (param=heading keyword),
    or "egypt" (param=kingdom/period name).
    stop_after: optional title to truncate the list after (inclusive).
    """
    soup = _get_soup(url)
    if strategy == "navbox":
        titles = _links_from_navbox(soup, param)
    elif strategy == "tables":
        titles = _links_from_tables(soup, param)
    elif strategy == "heading":
        titles = _links_from_heading_list(soup, param)
    elif strategy == "egypt":
        titles = _links_from_egypt_period(soup, param)
    else:
        raise ValueError(f"unknown strategy: {strategy}")

    titles = [title for title in titles if title not in blocklist]
    if stop_after and stop_after in titles:
        titles = titles[: titles.index(stop_after) + 1]
    if not titles:
        raise ValueError(f"no titles left after filtering {url}")

    qids = _resolve_titles_to_qids(titles)
    qids = _keep_humans(qids)
    if not qids:
        raise ValueError(f"no human Q-IDs resolved from {url}")
    print(f"scrape_monarchy({url}, {strategy}, {param}) -> {len(qids)} humans", flush=True)
    return qids


def scrape_entry(entry):
    """Q-IDs for one registry entry that has ``sources`` (not a union)."""
    qids = []
    for source in entry["sources"]:
        qids.extend(scrape_monarchy(
            source["page"],
            source["strategy"],
            source.get("param"),
            blocklist=frozenset(source.get("blocklist") or ()),
            stop_after=source.get("stop_after"),
        ))
    return _ordered_unique(qids)


def union_lists(entry, scraped):
    """Concatenate this run's component lists. Does not read monarch_list.json."""
    qids = []
    for name in entry["union_of"]:
        qids.extend(scraped[name])
    qids = _ordered_unique(qids)
    root = entry.get("ensure_first")
    if root:
        if root in qids:
            qids.remove(root)
        qids.insert(0, root)
    if not qids:
        raise ValueError("union is empty")
    return qids


def _closure(names, registry):
    """Requested trees plus the union members they depend on, dependencies first."""
    seen = []

    def add(name):
        if name in seen:
            return
        entry = registry[name]
        for part in entry.get("union_of", []):
            add(part)
        seen.append(name)

    for name in names:
        add(name)
    return seen


def scrape_registered(names, registry=None):
    """Scrape ``names``. Return ``(lists, errors)``.

    A failing tree is an error string. The others are still scraped. Union
    trees are built from the lists this call just scraped.
    """
    registry = registry or REGISTRY
    names = list(names)
    unknown = [name for name in names if name not in registry]
    if unknown:
        raise ValueError(f"unknown monarchies: {unknown}")
    _soup_cache.clear()
    order = _closure(names, registry)
    scraped = {}
    errors = {}
    for name in order:
        entry = registry[name]
        if "union_of" in entry:
            continue
        try:
            scraped[name] = scrape_entry(entry)
        except Exception as exc:
            errors[name] = str(exc)
    for name in order:
        entry = registry[name]
        if "union_of" not in entry:
            continue
        missing = [part for part in entry["union_of"] if part not in scraped]
        if missing:
            detail = "; ".join(f"{part}: {errors.get(part, 'not scraped')}" for part in missing)
            errors[name] = f"union incomplete ({detail})"
            continue
        try:
            scraped[name] = union_lists(entry, scraped)
        except Exception as exc:
            errors[name] = str(exc)
    return (
        {name: scraped[name] for name in names if name in scraped},
        {name: errors[name] for name in names if name in errors},
    )


def diff_qids(old, new):
    """QIDs added, removed, or reordered relative to the saved list.

    Order is compared on the shared QIDs only, so an insertion is "added"
    and not also "reordered".
    """
    old_ids = _ordered_unique(old or [])
    new_ids = _ordered_unique(new or [])
    old_set = set(old_ids)
    new_set = set(new_ids)
    added = [qid for qid in new_ids if qid not in old_set]
    removed = [qid for qid in old_ids if qid not in new_set]
    shared_old = [qid for qid in old_ids if qid in new_set]
    shared_new = [qid for qid in new_ids if qid in old_set]
    reordered = []
    if shared_old != shared_new:
        position = {qid: index for index, qid in enumerate(shared_old)}
        new_position = {qid: index for index, qid in enumerate(shared_new)}
        reordered = [qid for qid in shared_new if position[qid] != new_position[qid]]
    return added, removed, reordered


def report_lists(names, baseline, registry=None):
    """Scrape and describe each tree. Does not write."""
    scraped, errors = scrape_registered(names, registry)
    lines = []
    for name in names:
        if name in errors:
            lines.append(f"{name}: failed: {errors[name]}")
            continue
        added, removed, reordered = diff_qids(baseline.get(name), scraped[name])
        if name not in baseline:
            lines.append(f"{name}: added {len(added)}, removed 0, reordered 0 (no saved list)")
        elif not added and not removed and not reordered:
            lines.append(f"{name}: match ({len(scraped[name])})")
        else:
            lines.append(
                f"{name}: added {len(added)}, removed {len(removed)}, reordered {len(reordered)}"
            )
        lines.append("  added: " + (", ".join(added) or "-"))
        lines.append("  removed: " + (", ".join(removed) or "-"))
        lines.append("  reordered: " + (", ".join(reordered) or "-"))
    failed = len(errors)
    matched = sum(
        1 for name in names
        if name in scraped and name in baseline and not any(diff_qids(baseline.get(name), scraped[name]))
    )
    differed = len(names) - matched - failed
    lines.append(f"{len(names)} trees: {matched} match, {differed} differ, {failed} failed")
    return scraped, errors, lines


def saveData(list_name, monarch_list):
    print("Saving Data: {} {}".format(list_name, len(monarch_list)))
    file_path = MONARCH_LIST_PATH
    if not os.path.exists(file_path):
        data = {}
    else:
        with open(file_path, "r", encoding="utf-8") as handle:
            data = json.load(handle)
    data[list_name] = monarch_list
    atomic_write(file_path, json.dumps(data, indent=4))


def apply_lists(names, scraped):
    """Write scraped lists. ``--apply`` is the only caller. Unions are already in ``scraped``."""
    for name in names:
        if name in scraped:
            saveData(name, scraped[name])


def get_monarch_lists(monarchies_to_scrape):
    """Re-scrape and save, for ``royaltree build --lists``. Failures are printed and skipped."""
    scraped, errors = scrape_registered(monarchies_to_scrape)
    for name in monarchies_to_scrape:
        if name in errors:
            print(f"{name}: failed: {errors[name]}")
    apply_lists(monarchies_to_scrape, scraped)
