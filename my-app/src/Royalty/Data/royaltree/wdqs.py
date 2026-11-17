"""Typed person records from the Wikidata Query Service.

``build`` still stores ``parse_person`` output (kind ``person``, source
``wbgetentities``). This module is the next slice's fetcher: call
``fetch_typed`` and ``store_typed`` (kind and source ``wdqs``). It does not
walk succession or write public payloads.

Queries are POSTed to ``https://query.wikidata.org/sparql`` through
``royaltree.http`` (one session, the project User-Agent, a timeout, and
429/5xx/maxlag back-off). A batch is about 400 QIDs in a ``VALUES`` clause,
sent one query at a time. Four small queries cover one batch — single-valued
facts, dates, family relations, and positions — because a single join on
``wikibase:timeValue`` has timed out on this endpoint before.

Ranks follow Wikidata, not claim order. Preferred beats normal. Deprecated
statements are never used. ``wikibase:BestRank`` is right for a single-valued
fact and wrong for history: it would keep only Charles III's current reign, so
positions, titles, spouses, children and siblings keep every non-deprecated
statement and its rank. A position with no end qualifier (P582) stays; that is
an open reign.

A tie, an unknown value (``somevalue``) or an explicit ``novalue`` at the best
rank is stored on the field. It is not dropped and not replaced by whichever
claim was listed first. One unreadable claim is skipped; the rest of that
property is kept (a ``somevalue`` birth snak must not erase a real birth date).

Dates are ``{"time", "precision"}``. ``format_date`` is the Python rendering
used by tests. The React label and tooltip stay on the legacy strings until a
later slice.

Labels and descriptions are a separate query. If WDQS does not answer,
``fetch_labels`` falls back to ``wbgetentities``.
"""
import json
import re

from royaltree import http, wikidata

ENDPOINT = "https://query.wikidata.org/sparql"
ACCEPT = "application/sparql-results+json"
BATCH = 400
KIND = "wdqs"
SOURCE = "wdqs"

# Wikibase time precision constants (year bucket, not a formatted string).
PRECISION_MILLENNIUM = 6
PRECISION_CENTURY = 7
PRECISION_DECADE = 8
PRECISION_YEAR = 9
PRECISION_MONTH = 10
PRECISION_DAY = 11

_QID = re.compile(r"^Q\d+$")
_TIME = re.compile(r"^([+-]?\d+)-(\d{2})-(\d{2})")
_MONTHS = (None, "January", "February", "March", "April", "May", "June",
           "July", "August", "September", "October", "November", "December")

_DATE_PROPS = ("P569", "P570")
_SINGLE = ("P22", "P25", "P21", "P53", "P569", "P570")
_MULTI = ("P39", "P97", "P26", "P40", "P3373")
_RANK_SCORE = {"preferred": 2, "normal": 1}
# (query name, property ids, include time-value node, include position qualifiers)
_GROUPS = (
    ("single", ("P22", "P25", "P21", "P53"), False, False),
    ("dates", ("P569", "P570"), True, False),
    ("relations", ("P26", "P40", "P3373"), False, False),
    ("positions", ("P39", "P97"), False, True),
)

_PREFIXES = """\
PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX p: <http://www.wikidata.org/prop/>
PREFIX ps: <http://www.wikidata.org/prop/statement/>
PREFIX psv: <http://www.wikidata.org/prop/statement/value/>
PREFIX pq: <http://www.wikidata.org/prop/qualifier/>
PREFIX pqv: <http://www.wikidata.org/prop/qualifier/value/>
PREFIX wikibase: <http://wikiba.se/ontology#>
PREFIX schema: <http://schema.org/>
"""


def _qid_list(qids):
    out = []
    for qid in qids:
        if not isinstance(qid, str) or not _QID.match(qid):
            raise ValueError(f"not a QID: {qid!r}")
        out.append(qid)
    return out


def _qid_from_uri(value):
    if not value or not isinstance(value, str):
        return None
    name = value.rsplit("/", 1)[-1]
    if _QID.match(name):
        return name
    if _QID.match(value):
        return value
    return None


def _rank(value):
    if not value:
        return None
    name = value.rsplit("#", 1)[-1]
    return {"PreferredRank": "preferred", "NormalRank": "normal",
            "DeprecatedRank": "deprecated", "preferred": "preferred",
            "normal": "normal", "deprecated": "deprecated"}.get(name)


def _maybe_int(value):
    if value is None or value == "":
        return None
    return int(value)


def split_time(time):
    """(astronomical year, month, day) from a Wikidata or xsd time literal."""
    match = _TIME.match(time or "")
    if not match:
        raise ValueError(f"unreadable wikidata time: {time!r}")
    return int(match.group(1)), int(match.group(2)), int(match.group(3))


def _ordinal(n):
    if 10 <= n % 100 <= 20:
        suffix = "th"
    else:
        suffix = {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
    return f"{n}{suffix}"


def _historical_year(astro):
    """Astronomical year to (historical year, is_bce). Year 0 is 1 BCE."""
    if astro > 0:
        return astro, False
    return 1 - astro, True


def format_date(when):
    """Render ``{"time", "precision"}``.

    Century precision is a century (``c. 12th century``), not a year and not a
    ``1100-1100`` range. Decade precision is ``990s``. BCE uses the historical
    year with an unambiguous `` BCE`` suffix (astronomical year 0 is 1 BCE,
    astronomical −43 is 44 BCE). A bare time string is rejected.
    """
    if not isinstance(when, dict) or "time" not in when or "precision" not in when:
        raise ValueError("date must be {time, precision}")
    astro, month, day = split_time(when["time"])
    precision = int(when["precision"])
    year, bce = _historical_year(astro)
    era = " BCE" if bce else ""
    if precision <= 5:
        return f"c. {year}{era}"
    if precision == PRECISION_MILLENNIUM:
        n = (astro // 1000 + 1) if astro > 0 else ((year - 1) // 1000 + 1)
        return f"c. {_ordinal(n)} millennium{era}"
    if precision == PRECISION_CENTURY:
        # Wikidata stores the first year of the hundred-year block: 1100 is
        # the 12th century, not the year 1100.
        n = (astro // 100 + 1) if astro > 0 else ((year - 1) // 100 + 1)
        return f"c. {_ordinal(n)} century{era}"
    if precision == PRECISION_DECADE:
        base = (astro // 10) * 10 if astro > 0 else (year // 10) * 10
        return f"{base}s{era}"
    if precision >= PRECISION_DAY and month and day:
        return f"{day} {_MONTHS[month]} {year}{era}"
    if precision >= PRECISION_MONTH and month:
        return f"{_MONTHS[month]} {year}{era}"
    return f"{year}{era}"


def queries_for(qids):
    """The SPARQL texts for one VALUES batch, in send order."""
    qids = _qid_list(qids)
    if not qids:
        return []
    return [_group_query(name, qids, props, times, quals)
            for name, props, times, quals in _GROUPS]


def _group_query(name, qids, props, times, qualifiers):
    values_items = " ".join(f"wd:{qid}" for qid in qids)
    if times:
        pairs = " ".join(f'(p:{pid} ps:{pid} psv:{pid} "{pid}")' for pid in props)
        values_pred = f"VALUES (?prop ?ps ?psv ?pid) {{ {pairs} }}"
        snak = (
            'BIND(IF(BOUND(?time), "value", '
            'IF(BOUND(?value), IF(wikibase:isSomeValue(?value), "somevalue", "value"), '
            '"novalue")) AS ?snak)'
        )
    else:
        pairs = " ".join(f'(p:{pid} ps:{pid} "{pid}")' for pid in props)
        values_pred = f"VALUES (?prop ?ps ?pid) {{ {pairs} }}"
        snak = (
            'BIND(IF(BOUND(?value), IF(wikibase:isSomeValue(?value), "somevalue", "value"), '
            '"novalue") AS ?snak)'
        )
    select = ["?item", "?stmt", "?pid", "?rank", "?snak", "?value", "?rev"]
    extra = ""
    if times:
        select.extend(("?time", "?precision"))
        extra += """
  OPTIONAL {
    ?stmt ?psv ?node .
    ?node wikibase:timeValue ?time ;
          wikibase:timePrecision ?precision .
  }"""
    if qualifiers:
        select.extend(("?start", "?startPrec", "?end", "?endPrec", "?of"))
        extra += """
  OPTIONAL { ?stmt pqv:P580 ?snode . ?snode wikibase:timeValue ?start ; wikibase:timePrecision ?startPrec . }
  OPTIONAL { ?stmt pqv:P582 ?enode . ?enode wikibase:timeValue ?end ; wikibase:timePrecision ?endPrec . }
  OPTIONAL { ?stmt pq:P1001 ?of . }"""
    return (
        f"{_PREFIXES}# royaltree wdqs {name}\n"
        f"SELECT {' '.join(select)} WHERE {{\n"
        f"  VALUES ?item {{ {values_items} }}\n"
        f"  {values_pred}\n"
        "  ?item ?prop ?stmt .\n"
        "  ?stmt wikibase:rank ?rank .\n"
        "  FILTER(?rank != wikibase:DeprecatedRank)\n"
        "  OPTIONAL { ?stmt ?ps ?value }\n"
        "  OPTIONAL { ?item schema:version ?rev }"
        f"{extra}\n"
        f"  {snak}\n"
        "}\n"
    )


def query(sparql, *, timeout=None, retries=None):
    """POST one SPARQL query. Form body is ``query=<urlencoded>``, as WDQS requires."""
    kwargs = {}
    if timeout is not None:
        kwargs["timeout"] = timeout
    if retries is not None:
        kwargs["retries"] = retries
    resp = http.post(ENDPOINT, data={"query": sparql}, headers={"Accept": ACCEPT}, **kwargs)
    if resp.status_code >= 400:
        raise http.FetchError(f"WDQS HTTP {resp.status_code}")
    try:
        data = resp.json()
    except ValueError as exc:
        raise http.FetchError(f"WDQS returned non-JSON ({exc})") from exc
    if "results" not in data:
        raise http.FetchError("WDQS response has no results")
    return data


def fetch_typed(qids, *, batch_size=BATCH, retries=None, timeout=None):
    """``{qid: typed record}`` for every id. Missing people are empty records.

    Batches run in order, and the queries inside a batch run in order. Nothing
    is fetched concurrently.
    """
    if batch_size < 1:
        raise ValueError("batch_size must be positive")
    out = {}
    seen = list(dict.fromkeys(_qid_list(qids)))
    for start in range(0, len(seen), batch_size):
        batch = seen[start:start + batch_size]
        results = [query(text, retries=retries, timeout=timeout) for text in queries_for(batch)]
        out.update(parse_typed(results, batch))
    return out


def fetch_labels(qids, *, batch_size=BATCH, retries=None, timeout=None):
    """English labels and descriptions. WDQS first; ``wbgetentities`` if it fails.

    Offline runs raise ``NetworkDisabled`` and do not try the other API.
    """
    if batch_size < 1:
        raise ValueError("batch_size must be positive")
    seen = list(dict.fromkeys(_qid_list(qids)))
    try:
        return _labels_sparql(seen, batch_size, retries=retries, timeout=timeout)
    except http.FetchError:
        return _labels_action_api(seen)


def attach_labels(records, labels):
    """Copy label and description onto typed records, in place."""
    for qid, rec in records.items():
        found = labels.get(qid) or {}
        if found.get("label"):
            rec["label"] = found["label"]
        if found.get("description"):
            rec["description"] = found["description"]
    return records


def store_typed(store, records, *, fetched_at=None):
    """Write typed records under kind ``wdqs`` and source ``wdqs``.

    Does not touch kind ``person``. ``revision`` on the record, when present,
    is the store's ``lastrevid``.
    """
    revisions = {qid: rec.get("revision") for qid, rec in records.items()}
    store.put_many(KIND, records, SOURCE, revisions, fetched_at)


def iter_bindings(result):
    for row in result.get("results", {}).get("bindings", []):
        yield {key: value.get("value") for key, value in row.items() if isinstance(value, dict)}


def parse_typed(results, qids):
    """SPARQL JSON (one document or a list) -> ``{qid: record}`` for ``qids`` only."""
    if isinstance(results, dict):
        results = [results]
    wanted = _qid_list(qids)
    wanted_set = set(wanted)
    statements = {}
    order = []
    for result in results:
        for row in iter_bindings(result):
            qid = _qid_from_uri(row.get("item"))
            if qid not in wanted_set:
                continue
            stmt = row.get("stmt") or f"{qid}:{row.get('pid')}:{len(order)}"
            key = (qid, stmt)
            if key not in statements:
                statements[key] = _new_statement(row)
                order.append(key)
            else:
                _merge_statement(statements[key], row)
    grouped = {qid: [] for qid in wanted}
    for qid, _stmt in order:
        grouped[qid].append(statements[(qid, _stmt)])
    return {qid: _record(qid, grouped[qid]) for qid in wanted}


def assess(records, expect):
    """Mismatches against the pinned cases. Empty means the pin still holds.

    ``expect`` maps a QID to any of ``mother`` / ``father`` (a QID or null),
    ``birth`` / ``death`` (``precision`` and ``text``), ``birth_has_value`` /
    ``death_has_value``, and ``open_reign`` (``year``, optional ``id``).
    """
    lines = []
    for qid, spec in expect.items():
        rec = records.get(qid)
        if rec is None:
            lines.append(f"{qid}: no record")
            continue
        for field in ("mother", "father"):
            if field not in spec:
                continue
            got = _value_id(rec.get(field))
            if got != spec[field]:
                lines.append(f"{qid}: {field} {got!r} != {spec[field]!r}")
        for field, key in (("date of birth", "birth"), ("date of death", "death")):
            if key in spec:
                lines.extend(_check_date(qid, field, rec.get(field), spec[key]))
        if spec.get("birth_has_value") and "value" not in (rec.get("date of birth") or {}):
            lines.append(f"{qid}: birth date missing")
        if spec.get("death_has_value") and "value" not in (rec.get("date of death") or {}):
            lines.append(f"{qid}: death date missing")
        if "open_reign" in spec:
            lines.extend(_check_open(qid, rec, spec["open_reign"]))
    return lines


def _labels_sparql(qids, batch_size, *, retries, timeout):
    out = {}
    for start in range(0, len(qids), batch_size):
        batch = qids[start:start + batch_size]
        data = query(labels_query(batch), retries=retries, timeout=timeout)
        for row in iter_bindings(data):
            qid = _qid_from_uri(row.get("item"))
            if qid not in set(batch):
                continue
            label = row.get("itemLabel")
            description = row.get("itemDescription")
            # The label service substitutes the bare QID when no English label exists.
            if label == qid:
                label = None
            if description == qid:
                description = None
            out[qid] = {"label": label, "description": description}
        for qid in batch:
            out.setdefault(qid, {"label": None, "description": None})
    return out


def labels_query(qids):
    values = " ".join(f"wd:{qid}" for qid in _qid_list(qids))
    return (
        f"{_PREFIXES}# royaltree wdqs labels\n"
        "SELECT ?item ?itemLabel ?itemDescription WHERE {\n"
        f"  VALUES ?item {{ {values} }}\n"
        '  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }\n'
        "}\n"
    )


def _labels_action_api(qids):
    entities = wikidata.get_entities(qids, props="labels|descriptions")
    out = {}
    for qid in qids:
        entity = entities.get(qid) or {}
        out[qid] = {
            "label": ((entity.get("labels") or {}).get("en") or {}).get("value"),
            "description": ((entity.get("descriptions") or {}).get("en") or {}).get("value"),
        }
    return out


def _new_statement(row):
    statement = {
        "pid": row.get("pid"),
        "rank": _rank(row.get("rank")),
        "snak": row.get("snak"),
        "item": None,
        "time": row.get("time"),
        "precision": _maybe_int(row.get("precision")),
        "starts": [],
        "ends": [],
        "ofs": [],
        "rev": _maybe_int(row.get("rev")),
    }
    _take_value(statement, row)
    _take_qualifiers(statement, row)
    return statement


def _merge_statement(statement, row):
    if statement["rank"] is None:
        statement["rank"] = _rank(row.get("rank"))
    if not statement["snak"]:
        statement["snak"] = row.get("snak")
    if statement["time"] is None and row.get("time"):
        statement["time"] = row["time"]
        statement["precision"] = _maybe_int(row.get("precision"))
    rev = _maybe_int(row.get("rev"))
    if rev is not None and (statement["rev"] is None or rev > statement["rev"]):
        statement["rev"] = rev
    _take_value(statement, row)
    _take_qualifiers(statement, row)


def _take_value(statement, row):
    if statement["pid"] in _DATE_PROPS or statement["snak"] != "value" or statement["item"]:
        return
    statement["item"] = _qid_from_uri(row.get("value"))


def _take_qualifiers(statement, row):
    if row.get("start") is not None and row.get("startPrec") is not None:
        date = {"time": row["start"], "precision": int(row["startPrec"])}
        if date not in statement["starts"]:
            statement["starts"].append(date)
    if row.get("end") is not None and row.get("endPrec") is not None:
        date = {"time": row["end"], "precision": int(row["endPrec"])}
        if date not in statement["ends"]:
            statement["ends"].append(date)
    of = _qid_from_uri(row.get("of"))
    if of and of not in statement["ofs"]:
        statement["ofs"].append(of)


def _record(qid, statements):
    by_pid = {}
    revision = None
    allowed = set(_SINGLE + _MULTI)
    for statement in statements:
        pid = statement["pid"]
        if pid not in allowed or statement["rank"] not in _RANK_SCORE:
            continue
        if pid in _DATE_PROPS and statement["snak"] == "value":
            if statement["precision"] is None or not statement["time"]:
                continue
            try:
                split_time(statement["time"])
            except ValueError:
                continue
        if pid not in _DATE_PROPS and statement["snak"] == "value" and not statement["item"]:
            continue
        by_pid.setdefault(pid, []).append(statement)
        if statement["rev"] is not None:
            revision = statement["rev"] if revision is None else max(revision, statement["rev"])
    record = {"id": qid}
    if revision is not None:
        record["revision"] = revision
    single = set(_SINGLE)
    for pid in _SINGLE + _MULTI:
        group = by_pid.get(pid)
        if not group:
            continue
        name = wikidata.PROPERTIES[pid]
        if pid in single:
            collapsed = _collapse(group)
            if collapsed:
                record[name] = collapsed
        else:
            values = [value for value in (_multi_value(statement) for statement in group) if value]
            if values:
                record[name] = sorted(values, key=_multi_key)
    return record


def _collapse(statements):
    best_score = max(_RANK_SCORE[statement["rank"]] for statement in statements)
    best = [statement for statement in statements if _RANK_SCORE[statement["rank"]] == best_score]
    rank = best[0]["rank"]
    unknown = any(statement["snak"] == "somevalue" for statement in best)
    novalue = any(statement["snak"] == "novalue" for statement in best)
    values = []
    for statement in best:
        if statement["snak"] != "value":
            continue
        if statement["pid"] in _DATE_PROPS:
            values.append({"time": statement["time"], "precision": statement["precision"]})
        else:
            values.append({"id": statement["item"]})
    values = _dedupe(values)
    if len(values) == 1:
        out = {"rank": rank, "value": values[0]}
    elif len(values) > 1:
        out = {"rank": rank, "tie": True,
               "values": sorted(values, key=lambda value: json.dumps(value, sort_keys=True))}
    elif unknown:
        out = {"rank": rank, "unknown": True}
    elif novalue:
        out = {"rank": rank, "novalue": True}
    else:
        return None
    if unknown and ("value" in out or out.get("tie")):
        out["unknown"] = True
    return out


def _dedupe(values):
    out = []
    for value in values:
        if value not in out:
            out.append(value)
    return out


def _multi_value(statement):
    out = {"rank": statement["rank"]}
    if statement["snak"] == "value":
        if not statement["item"]:
            return None
        out["id"] = statement["item"]
    elif statement["snak"] == "somevalue":
        out["unknown"] = True
    elif statement["snak"] == "novalue":
        out["novalue"] = True
    else:
        return None
    start = _one(statement["starts"])
    end = _one(statement["ends"])
    of = _one(statement["ofs"])
    if start is not None:
        out["start"] = start
    if end is not None:
        out["end"] = end
    if of is not None:
        out["of"] = of
    return out


def _one(items):
    if not items:
        return None
    if len(items) == 1:
        return items[0]
    return list(items)


def _multi_key(value):
    start = value.get("start")
    if isinstance(start, list):
        start_time = start[0]["time"] if start else ""
    elif isinstance(start, dict):
        start_time = start.get("time") or ""
    else:
        start_time = ""
    return (0 if value["rank"] == "preferred" else 1, value.get("id") or "", start_time)


def _value_id(field):
    if not field:
        return None
    if field.get("tie"):
        return "tie:" + ",".join(value.get("id", "?") for value in field.get("values", []))
    if "value" in field and "id" in field["value"]:
        return field["value"]["id"]
    if field.get("unknown"):
        return "unknown"
    if field.get("novalue"):
        return "novalue"
    return None


def _check_date(qid, field, got, spec):
    if not got or "value" not in got:
        return [f"{qid}: {field} missing"]
    if got.get("tie"):
        return [f"{qid}: {field} is a tie"]
    value = got["value"]
    lines = []
    if "precision" in spec and value.get("precision") != spec["precision"]:
        lines.append(f"{qid}: {field} precision {value.get('precision')} != {spec['precision']}")
    if "text" in spec:
        text = format_date(value)
        if text != spec["text"]:
            lines.append(f"{qid}: {field} {text!r} != {spec['text']!r}")
    return lines


def _check_open(qid, rec, spec):
    year = spec["year"]
    want_id = spec.get("id")
    for position in rec.get("position held") or []:
        if "end" in position:
            continue
        start = position.get("start")
        if isinstance(start, list):
            start = start[0] if start else None
        if not isinstance(start, dict) or "time" not in start:
            continue
        if split_time(start["time"])[0] != year:
            continue
        if want_id and position.get("id") != want_id:
            continue
        return []
    extra = f" ({want_id})" if want_id else ""
    return [f"{qid}: no open position in {year}{extra}"]
