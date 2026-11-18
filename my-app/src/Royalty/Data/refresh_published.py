"""Rewrite published RoyalTree people from typed WDQS facts, dates and positions.

People already in public/royalty are the whole set. Batches are 400 QIDs and
each batch sends the facts query, then dates, then positions. Nothing is
written if a batch fails, a rate limit does not clear, or the next request
would pass 200. Progress goes to wdqs-refresh.log.
"""
import gzip
import io
import json
import os
import sys
import time

import validate
from SplitDataForFrontend import _write_gz
from royaltree import http, wdqs
from royaltree.store import atomic_write

HERE = os.path.dirname(os.path.abspath(__file__))
PUBLIC_DIR = validate.PUBLIC_DIR
LOG_PATH = os.path.join(HERE, "wdqs-refresh.log")
CACHE_PATH = os.path.join(HERE, "wdqs-typed-cache.json.gz")
META_PATH = os.path.join(HERE, "wdqs-typed-cache.meta.json")
FIXTURE_PATH = os.path.join(HERE, "tests", "fixtures", "succession_links.json.gz")
EXPECTED_PEOPLE = 15801
REQUEST_CAP = 200
GROUPS = ("facts", "dates", "positions")
PINS = {
    "Q462856": "Q96088549",
    "Q272326": "Q96074775",
    "Q259077": None,
    "Q2634369": None,
}
KEPT_ON_OFFICE = ("from", "to", "label", "end cause")
OWNED = {"mother", "father", "date of birth", "date of death", "position held"}


def log(message):
    line = time.strftime("%H:%M:%S ") + message
    with open(LOG_PATH, "a", encoding="utf-8") as handle:
        handle.write(line + "\n")
    print(line, flush=True)


def load_files():
    originals = {}
    files = {}
    for name in sorted(os.listdir(PUBLIC_DIR)):
        if not name.endswith((".json", ".json.gz")):
            continue
        path = os.path.join(PUBLIC_DIR, name)
        with open(path, "rb") as handle:
            blob = handle.read()
        originals[name] = gzip.decompress(blob) if name.endswith(".gz") else blob
        files[name] = json.loads(originals[name])
    return files, originals


def people_in(files):
    found = {}
    for name, payload in files.items():
        if not isinstance(payload, dict):
            continue
        for section in ("nodes", "extendedNodes"):
            block = payload.get(section)
            if not isinstance(block, dict):
                continue
            for qid, person in block.items():
                found.setdefault(qid, []).append(person)
    return found


def succession_snapshot(files):
    """Offices that already have a from or to link, per file and section."""
    out = {}
    for name, payload in files.items():
        if not isinstance(payload, dict):
            continue
        for section in ("nodes", "extendedNodes"):
            block = payload.get(section)
            if not isinstance(block, dict):
                continue
            for qid, person in block.items():
                if not isinstance(person, dict):
                    continue
                offices = []
                for office in person.get("position held") or []:
                    if not isinstance(office, dict):
                        continue
                    if "from" not in office and "to" not in office:
                        continue
                    item = {"id": office.get("id")}
                    if "from" in office:
                        item["from"] = office["from"]
                    if "to" in office:
                        item["to"] = office["to"]
                    offices.append(item)
                if offices:
                    out.setdefault(name, {}).setdefault(section, {})[qid] = offices
    return out


def mother_of(record):
    if not isinstance(record, dict) or "mother" not in record:
        return None
    return wdqs.link_qid(record.get("mother"))


def unreadable(records):
    bad = []
    for qid, rec in records.items():
        for field in ("date of birth", "date of death"):
            if field not in rec:
                continue
            projected = wdqs._project_date(rec.get(field))
            if projected is not None and wdqs.published_date(rec.get(field)) is None:
                bad.append((qid, field, projected))
        for office in wdqs._project_positions(rec.get("position held")):
            for key in ("start time", "end time"):
                value = office.get(key)
                if isinstance(value, dict) and not value.get("tie") and not wdqs.published_time(value.get("time")):
                    bad.append((qid, key, value))
        if len(bad) > 20:
            break
    return bad


def fetch_all(qids):
    http.STATS.reset()
    http.configure(max_requests=REQUEST_CAP)
    records = {}
    batches = (len(qids) + wdqs.BATCH - 1) // wdqs.BATCH
    for number, start in enumerate(range(0, len(qids), wdqs.BATCH), 1):
        batch = qids[start:start + wdqs.BATCH]
        if http.STATS.requests + len(GROUPS) > REQUEST_CAP:
            raise http.RequestBudgetExceeded(
                f"batch {number} would pass {REQUEST_CAP} requests "
                f"(at {http.STATS.requests})"
            )
        began = time.monotonic()
        log(f"batch {number}/{batches} starting size={len(batch)} "
            f"requests={http.STATS.requests} 429s={http.STATS.status_429}")
        found = wdqs.fetch_typed(
            batch, groups=GROUPS, timeout=(10, 180),
        )
        records.update(found)
        log(f"batch {number}/{batches} done {time.monotonic() - began:.1f}s "
            f"requests={http.STATS.requests} 429s={http.STATS.status_429}")
    return records


def _gzip_bytes(name, raw):
    buf = io.BytesIO()
    with gzip.GzipFile(filename=name, mode="wb", fileobj=buf, mtime=0) as handle:
        handle.write(raw)
    return buf.getvalue()


def _save_cache(records):
    raw = json.dumps(records, separators=(",", ":")).encode()
    atomic_write(CACHE_PATH, _gzip_bytes("wdqs-typed-cache.json", raw))
    atomic_write(META_PATH, json.dumps({
        "requests": http.STATS.requests,
        "http": http.STATS.as_dict(),
        "people": len(records),
    }))


def load_cache():
    with gzip.open(CACHE_PATH, "rt", encoding="utf-8") as handle:
        records = json.load(handle)
    with open(META_PATH, encoding="utf-8") as handle:
        meta = json.load(handle)
    return records, meta


def _untouched(person):
    return {key: value for key, value in person.items() if key not in OWNED}


def _office_kept(office):
    return tuple(office.get(key) for key in ("id", *KEPT_ON_OFFICE))


def apply_all(found, records):
    stats = {
        "mother": set(), "father": set(), "birth": set(), "death": set(),
        "offices_updated": 0, "offices_added": 0, "office_people": set(),
        "copies": 0,
    }
    seen_offices = set()
    for qid, copies in found.items():
        typed = records[qid]
        for person in copies:
            before_rest = json.dumps(_untouched(person), sort_keys=True)
            before_offices = list(person.get("position held") or [])
            before_links = [_office_kept(office) for office in before_offices if isinstance(office, dict)]
            before_bounds = [(office.get("start time"), office.get("end time"))
                             for office in before_offices if isinstance(office, dict)]
            had = {field: (field in person, person.get(field))
                   for field in ("mother", "father", "date of birth", "date of death")}
            wdqs.apply_published(person, typed)
            if json.dumps(_untouched(person), sort_keys=True) != before_rest:
                raise RuntimeError(f"{qid}: a field other than parents, dates and offices changed")
            after = [office for office in person.get("position held") or [] if isinstance(office, dict)]
            if [_office_kept(office) for office in after[:len(before_links)]] != before_links:
                raise RuntimeError(f"{qid}: an existing office lost its id, from, to, label or end cause")
            if len(after) < len(before_links):
                raise RuntimeError(f"{qid}: an existing office was deleted")
            updated = 0
            after_bounds = [(office.get("start time"), office.get("end time")) for office in after]
            for (old_start, old_end), (new_start, new_end) in zip(before_bounds, after_bounds):
                if old_start != new_start or old_end != new_end:
                    updated += 1
            added = len(after) - len(before_links)
            signature = (qid, tuple(before_bounds), tuple(after_bounds))
            if (updated or added) and signature not in seen_offices:
                seen_offices.add(signature)
                stats["offices_updated"] += updated
                stats["offices_added"] += added
                stats["office_people"].add(qid)
            for field, bucket in (("mother", "mother"), ("father", "father"),
                                  ("date of birth", "birth"), ("date of death", "death")):
                if had[field] != (field in person, person.get(field)):
                    stats[bucket].add(qid)
            stats["copies"] += 1
    return stats


def check_pins(found):
    for qid, mother in PINS.items():
        for person in found[qid]:
            got = person.get("mother") if "mother" in person else None
            if got != mother:
                raise RuntimeError(f"pin {qid} mother {got!r} != {mother!r}")


def write_changed(files, originals):
    written = 0
    for name, payload in files.items():
        if not name.endswith(".json.gz") or not isinstance(payload, dict):
            continue
        raw = json.dumps(payload, separators=(",", ":")).encode()
        if raw == originals[name]:
            continue
        _write_gz(os.path.join(PUBLIC_DIR, name), payload)
        written += 1
    return written


def main():
    from_cache = "--from-cache" in sys.argv
    files, originals = load_files()
    found = people_in(files)
    if len(found) != EXPECTED_PEOPLE:
        log(f"expected {EXPECTED_PEOPLE} people, found {len(found)}; nothing written")
        return 1
    qids = sorted(found, key=lambda qid: (len(qid), qid))
    log(f"people={len(qids)} copies={sum(len(v) for v in found.values())} from_cache={from_cache}")
    snapshot = succession_snapshot(files)
    try:
        if from_cache:
            records, meta = load_cache()
            log(f"loaded cache people={len(records)} requests={meta.get('requests')}")
        else:
            records = fetch_all(qids)
            _save_cache(records)
            meta = {"requests": http.STATS.requests, "http": http.STATS.as_dict()}
            log(f"fetch complete {json.dumps(meta['http'])}")
    except (http.FetchError, http.RequestBudgetExceeded) as exc:
        log(f"STOPPED without writing: {type(exc).__name__}: {exc}")
        log(f"http {json.dumps(http.STATS.as_dict())}")
        return 1
    if set(records) != set(qids):
        log("fetch did not return every person; nothing written")
        return 1
    for qid, mother in PINS.items():
        if mother_of(records[qid]) != mother:
            log(f"pin failed before write: {qid} mother {mother_of(records[qid])!r} != {mother!r}")
            return 1
    bad = unreadable(records)
    if bad:
        log(f"{len(bad)} dates could not be stored; nothing written. first={bad[:3]!r}")
        return 1
    try:
        stats = apply_all(found, records)
        check_pins(found)
    except RuntimeError as exc:
        log(f"STOPPED without writing: {exc}")
        return 1
    written = write_changed(files, originals)
    fixture_raw = json.dumps(snapshot, separators=(",", ":")).encode()
    atomic_write(FIXTURE_PATH, _gzip_bytes("succession_links.json", fixture_raw))
    summary = {
        "requests": meta.get("requests"),
        "http": meta.get("http"),
        "files_written": written,
        "copies": stats["copies"],
        "mother_people": len(stats["mother"]),
        "father_people": len(stats["father"]),
        "birth_people": len(stats["birth"]),
        "death_people": len(stats["death"]),
        "offices_updated": stats["offices_updated"],
        "offices_added": stats["offices_added"],
        "office_people": len(stats["office_people"]),
        "succession_offices": sum(len(offices) for sections in snapshot.values()
                                  for people in sections.values() for offices in people.values()),
    }
    log("SUCCESS " + json.dumps(summary))
    return 0


if __name__ == "__main__":
    sys.exit(main())
