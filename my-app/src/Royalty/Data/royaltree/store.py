"""One entity store per data directory: SQLite, keyed by (QID, kind).

Source-agnostic by design: a row holds a JSON document plus where it came from
(``source``: wbgetentities, legacy import, later WDQS), the Wikidata revision it
reflects (``lastrevid``, when known) and when it was fetched and last verified.
``kind`` separates record shapes, so ``-wdqs-fetch`` can add its own typed kind
next to today's ``person`` and ``label`` rows without a migration.

Per-tree derived artefacts (succession paths, ancestor closure, the set of
QIDs the tree's traversal requested) live in ``trees``.

Writes are transactional (WAL journal), so a killed run leaves every committed
batch intact and nothing half-written; the next run resumes from what is there.
An advisory lock keeps a second writer out.
"""
import fcntl
import json
import os
import sqlite3
import tempfile
import time
from datetime import datetime, timezone

STORE_NAME = "royaltree.sqlite"
SCHEMA_VERSION = 1
LEGACY_TIME = "1970-01-01T00:00:00Z"  # fetch time unknown (imported from old caches)

SCHEMA = """
CREATE TABLE IF NOT EXISTS entities (
    qid        TEXT NOT NULL,
    kind       TEXT NOT NULL,
    data       TEXT NOT NULL,
    source     TEXT NOT NULL,
    lastrevid  INTEGER,
    fetched_at TEXT NOT NULL,
    checked_at TEXT NOT NULL,
    PRIMARY KEY (qid, kind)
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS trees (
    monarchy   TEXT NOT NULL,
    name       TEXT NOT NULL,
    data       TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (monarchy, name)
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT, started_at TEXT NOT NULL, summary TEXT NOT NULL
);
"""

_CHUNK = 500


def now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def dumps(obj):
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"))


def atomic_write(path, data):
    """Write bytes/str to ``path`` via a temp file in the same dir + os.replace."""
    if isinstance(data, str):
        data = data.encode("utf-8")
    directory = os.path.dirname(os.path.abspath(path))
    os.makedirs(directory, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=directory, prefix=".tmp-", suffix=os.path.basename(path))
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(data)
            f.flush()
            os.fsync(f.fileno())
        os.chmod(tmp, 0o644)
        os.replace(tmp, path)
    except BaseException:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise


class StoreLocked(RuntimeError):
    pass


class Store:
    def __init__(self, data_dir, readonly=False):
        os.makedirs(data_dir, exist_ok=True)
        self.path = os.path.join(data_dir, STORE_NAME)
        self._lock = None
        if not readonly:
            self._lock = open(self.path + ".lock", "w")
            try:
                fcntl.flock(self._lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                raise StoreLocked(f"another royaltree run holds {self.path}.lock")
        self.conn = sqlite3.connect(self.path, timeout=30)
        self.conn.execute("PRAGMA journal_mode=WAL")
        self.conn.execute("PRAGMA synchronous=NORMAL")
        with self.conn:
            self.conn.executescript(SCHEMA)
            self.conn.execute("INSERT OR IGNORE INTO meta VALUES ('schema_version', ?)",
                              (str(SCHEMA_VERSION),))

    def close(self):
        self.conn.close()
        if self._lock:
            self._lock.close()

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()

    # -- entities ---------------------------------------------------------
    def get(self, kind, qids):
        """{qid: data} for the given QIDs that exist."""
        out = {}
        qids = list(qids)
        for i in range(0, len(qids), _CHUNK):
            chunk = qids[i:i + _CHUNK]
            marks = ",".join("?" * len(chunk))
            for qid, data in self.conn.execute(
                    f"SELECT qid, data FROM entities WHERE kind=? AND qid IN ({marks})",
                    [kind, *chunk]):
                out[qid] = json.loads(data)
        return out

    def get_all(self, kind):
        return {q: json.loads(d) for q, d in
                self.conn.execute("SELECT qid, data FROM entities WHERE kind=?", (kind,))}

    def info(self, kind, qids=None):
        """{qid: (lastrevid, fetched_at, checked_at)}."""
        sql = "SELECT qid, lastrevid, fetched_at, checked_at FROM entities WHERE kind=?"
        if qids is None:
            return {r[0]: r[1:] for r in self.conn.execute(sql, (kind,))}
        out = {}
        qids = list(qids)
        for i in range(0, len(qids), _CHUNK):
            chunk = qids[i:i + _CHUNK]
            marks = ",".join("?" * len(chunk))
            for r in self.conn.execute(sql + f" AND qid IN ({marks})", [kind, *chunk]):
                out[r[0]] = r[1:]
        return out

    def count(self, kind):
        return self.conn.execute("SELECT COUNT(*) FROM entities WHERE kind=?", (kind,)).fetchone()[0]

    def put_many(self, kind, records, source, revisions=None, fetched_at=None):
        """Upsert {qid: data} in one transaction (all or nothing)."""
        fetched_at = fetched_at or now_iso()
        revisions = revisions or {}
        rows = [(q, kind, dumps(d), source, revisions.get(q), fetched_at, fetched_at)
                for q, d in records.items()]
        with self.conn:
            self.conn.executemany(
                "INSERT OR REPLACE INTO entities VALUES (?,?,?,?,?,?,?)", rows)

    def mark_checked(self, kind, revisions, checked_at=None):
        """Record a successful revision check: {qid: lastrevid}."""
        checked_at = checked_at or now_iso()
        with self.conn:
            self.conn.executemany(
                "UPDATE entities SET checked_at=?, lastrevid=? WHERE kind=? AND qid=?",
                [(checked_at, rev, kind, q) for q, rev in revisions.items()])

    # -- trees ------------------------------------------------------------
    def tree_put(self, monarchy, artefacts):
        """Replace several artefacts of one tree atomically: {name: data}."""
        ts = now_iso()
        with self.conn:
            self.conn.executemany(
                "INSERT OR REPLACE INTO trees VALUES (?,?,?,?)",
                [(monarchy, name, dumps(data), ts) for name, data in artefacts.items()])

    def tree_get(self, monarchy, name, default=None):
        row = self.conn.execute("SELECT data FROM trees WHERE monarchy=? AND name=?",
                                (monarchy, name)).fetchone()
        return json.loads(row[0]) if row else default

    def trees(self, name):
        return {m: json.loads(d) for m, d in self.conn.execute(
            "SELECT monarchy, data FROM trees WHERE name=? ORDER BY monarchy", (name,))}

    # -- runs -------------------------------------------------------------
    def add_run(self, started_at, summary):
        with self.conn:
            self.conn.execute("INSERT INTO runs (started_at, summary) VALUES (?, ?)",
                              (started_at, dumps(summary)))
