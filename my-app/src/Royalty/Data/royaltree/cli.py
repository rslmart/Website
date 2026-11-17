"""python -m royaltree <command> [monarchies] [options]

Commands
  fetch          bring the store up to date for some trees (network; incremental)
  build          fetch (unless --offline), derive the combined files, houses and
                 public/royalty payloads
  split          offline: rebuild houses and public/royalty/ from the committed
                 combined files in --data-dir (no store needed)
  check / diff   validate.py on --out-dir (schema + invariants / data-level diff)
  import-legacy  one-time, network-free import of the old data/*.json caches

Examples (from my-app/src/Royalty/Data)
  python -m royaltree build England --offline     # warm rebuild, no network
  python -m royaltree build Thailand              # fetches only what is missing
  python -m royaltree fetch England --refresh --since 2026-11-01
  python -m royaltree build --all --offline && python -m royaltree diff
  python -m royaltree import-legacy --from data.legacy
  python -m royaltree fetch --all --refresh-conflicts --max-refetch 5000

Every run ends with a summary: stages, durations, request counts, 429s.
"""
import argparse
import json
import os
import sys
import time
from collections import Counter

from royaltree import graph, http, wikidata
from royaltree.build import combine, write_combined
from royaltree.store import Store, now_iso

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_DATA_DIR = os.path.join(HERE, "data")
DEFAULT_OUT_DIR = os.path.abspath(os.path.join(HERE, "..", "..", "..", "public", "royalty"))
DEFAULT_MAX_REQUESTS = 3000
DEFAULT_MAX_REFETCH = 2000


class Run:
    """Collects per-stage timings and request deltas for the run summary."""

    def __init__(self, command):
        self.command = command
        self.started = now_iso()
        self.t0 = time.monotonic()
        self.stages = []
        self.counters = Counter()

    def stage(self, name):
        run = self

        class _Stage:
            def __enter__(self):
                self.t = time.monotonic()
                self.r = http.STATS.requests
                self.q = http.STATS.status_429
                print(f"[royaltree] {name} ...", file=sys.stderr, flush=True)

            def __exit__(self, *exc):
                run.stages.append({
                    "stage": name,
                    "seconds": round(time.monotonic() - self.t, 2),
                    "requests": http.STATS.requests - self.r,
                    "429s": http.STATS.status_429 - self.q,
                    "ok": exc[0] is None,
                })

        return _Stage()

    def summary(self, status):
        return {
            "command": self.command,
            "status": status,
            "started_at": self.started,
            "seconds": round(time.monotonic() - self.t0, 2),
            "http": http.STATS.as_dict(),
            "stages": self.stages,
            "counters": dict(sorted(self.counters.items())),
        }


def print_summary(s, stream=sys.stderr):
    h = s["http"]
    print(f"\n== royaltree {s['command']}: {s['status']} in {s['seconds']}s; "
          f"{h['requests']} requests, {h['429s']} 429s, {h['maxlag_waits']} maxlag waits, "
          f"{h['5xx']} 5xx, {h['network_errors']} network errors, waited {h['wait_seconds']}s",
          file=stream)
    for st in s["stages"]:
        flag = "" if st["ok"] else "  (FAILED)"
        print(f"   {st['stage']:<28} {st['seconds']:>8.2f}s {st['requests']:>6} req "
              f"{st['429s']:>3} 429{flag}", file=stream)
    if s["counters"]:
        print("   counters: " + ", ".join(f"{k}={v}" for k, v in s["counters"].items()),
              file=stream)


# -- helpers ---------------------------------------------------------------
def _load_lists(data_dir):
    path = os.path.join(data_dir, "monarch_list.json")
    if not os.path.exists(path):
        return {}
    with open(path) as f:
        return json.load(f)


def _known_monarchies():
    import GetListOfMonarchs
    return list(GetListOfMonarchs.monarchies)


def resolve_monarchies(args, lists):
    if args.all or not args.monarchies:
        if args.command == "fetch" and not args.all:
            raise SystemExit("fetch: name one or more monarchies, or --all")
        return sorted(lists) if lists else _known_monarchies()
    known = set(lists) | set(_known_monarchies())
    unknown = [m for m in args.monarchies if m not in known]
    if unknown:
        raise SystemExit(f"unknown monarchies: {unknown}")
    return list(dict.fromkeys(args.monarchies))


def ensure_lists(run, args, monarchies):
    lists = _load_lists(args.data_dir)
    missing = [m for m in monarchies if m not in lists]
    scrape = monarchies if args.lists else missing
    if not scrape:
        return lists
    if args.offline:
        raise SystemExit(f"--offline but no monarch list for {missing} in "
                         f"{args.data_dir}/monarch_list.json")
    import GetListOfMonarchs
    GetListOfMonarchs.MONARCH_LIST_PATH = os.path.join(args.data_dir, "monarch_list.json")
    with run.stage("lists"):
        GetListOfMonarchs.get_monarch_lists(scrape)
    lists = _load_lists(args.data_dir)
    still = [m for m in monarchies if not lists.get(m)]
    if still:
        raise SystemExit(f"no monarch list scraped for {still}")
    return lists


def refresh(run, store, monarchies, since, max_refetch):
    """Revision check (wbgetentities props=info), then refetch what changed.

    Rows with a known lastrevid are refetched only if Wikidata's lastrevid
    differs. Rows with no known revision (legacy import) must be refetched;
    the cap stops an accidental full cold refetch.
    """
    scope = set()
    for m in monarchies:
        scope.update(store.tree_get(m, "touched", []))
    info = store.info("person", scope)
    due = sorted(q for q, (_rev, _f, checked) in info.items() if since is None or checked < since)
    known = {q: info[q][0] for q in due if info[q][0] is not None}
    unknown = [q for q in due if info[q][0] is None]
    changed = []
    with run.stage("revision-check"):
        ids = sorted(known)
        for i in range(0, len(ids), 500):
            chunk = ids[i:i + 500]
            current = wikidata.revision_info(chunk)
            # A deleted/missing item is stored with lastrevid 0 and stays unchanged
            # while Wikidata still returns nothing for it.
            same = {q: known[q] for q in chunk if current.get(q, 0) == known[q]}
            changed += [q for q in chunk if q not in same]
            store.mark_checked("person", same)
    refetch = changed + unknown
    run.counters.update({"refresh_due": len(due), "refresh_unchanged": len(known) - len(changed),
                         "refresh_changed": len(changed), "refresh_unknown_revision": len(unknown)})
    if len(refetch) > max_refetch:
        raise SystemExit(f"refresh would refetch {len(refetch)} entities "
                         f"({len(unknown)} with no known revision); cap is --max-refetch "
                         f"{max_refetch}. Narrow with --since or raise the cap.")
    if refetch:
        with run.stage("refetch"):
            graph.Retriever(store, False, run.counters)._fetch(refetch)


def refresh_conflicts(run, store, max_refetch):
    """Refetch the people whose legacy caches disagreed (recorded by import-legacy).

    Covers the whole recorded set, whatever trees are named. Only rows still
    without a known revision are due (a refetched item that turned out to be
    deleted is stored with lastrevid 0), so an interrupted run resumes and a
    finished one is a no-op. Counts against --max-refetch like --refresh.
    """
    from royaltree.legacy import CONFLICTS_KEY
    conflicts = store.meta_get(CONFLICTS_KEY)
    if conflicts is None:
        raise SystemExit("no legacy conflict set in the store; run "
                         "import-legacy --from <legacy dir> --conflicts-only first")
    info = store.info("person", conflicts)
    due = [q for q in conflicts if q not in info or info[q][0] is None]
    run.counters.update({"conflicts_recorded": len(conflicts), "conflicts_due": len(due)})
    if len(due) > max_refetch:
        raise SystemExit(f"--refresh-conflicts would refetch {len(due)} entities; cap is "
                         f"--max-refetch {max_refetch}. Raise the cap to proceed.")
    if due:
        with run.stage("refetch-conflicts"):
            graph.Retriever(store, False, run.counters)._fetch(due)


# -- commands --------------------------------------------------------------
def _published_trees(args):
    """Trees the committed combined files or the current payload index publish."""
    from SplitDataForFrontend import listed_names
    names = listed_names(os.path.join(args.out_dir, "index.json"))
    path = os.path.join(args.data_dir, "monarchy_family_trees.json")
    if os.path.exists(path):
        with open(path) as f:
            names.update(json.load(f))
    return names


def check_tree_coverage(args, store, monarchies):
    """build rewrites the combined files from the store's trees only. Refuse
    (before any request) when that would silently drop published trees, e.g. a
    fresh clone or worktree whose git-ignored store holds just one tree."""
    dropped = sorted(_published_trees(args) - set(store.trees("family_tree")) - set(monarchies))
    if dropped and not args.allow_dropped_trees:
        raise SystemExit(
            f"the store has no tree for {len(dropped)} published monarchies ({', '.join(dropped[:5])}"
            f"{', ...' if len(dropped) > 5 else ''}); building would delete them from the combined "
            "files and public/royalty. Run import-legacy or build --all first, or pass "
            "--allow-dropped-trees to drop them on purpose.")


def cmd_fetch(run, args, store, derive):
    monarchies = resolve_monarchies(args, _load_lists(args.data_dir))
    if derive:
        check_tree_coverage(args, store, monarchies)
    lists = ensure_lists(run, args, monarchies)
    if args.refresh_conflicts:
        refresh_conflicts(run, store, args.max_refetch)
    if args.refresh or args.since:
        refresh(run, store, monarchies, args.since, args.max_refetch)
    for m in monarchies:
        with run.stage(f"traverse:{m}"):
            graph.traverse_tree(m, lists[m], store, args.offline, run.counters,
                                fresh_membership=args.fresh_membership)
    with run.stage("combine"):
        data, trees, anc = combine(store, args.offline, run.counters)
    run.counters["people_combined"] = len(data)
    if derive:
        with run.stage("write-combined"):
            write_combined(args.data_dir, data, trees, anc)
        derive_outputs(run, args)


def derive_outputs(run, args):
    import BuildHouses
    import SplitDataForFrontend
    BuildHouses.DATA_DIR = args.data_dir
    SplitDataForFrontend.DATA_DIR = args.data_dir
    SplitDataForFrontend.PUBLIC_DIR = args.out_dir
    with run.stage("houses"):  # local and cheap; lets a fresh clone rebuild every payload
        BuildHouses.build_houses()
    with run.stage("split"):
        previous = SplitDataForFrontend.published_names()
        names = SplitDataForFrontend.split() + SplitDataForFrontend.split_houses()
        run.counters["payloads_written"] = len(names)
        run.counters["stale_payloads_removed"] = len(SplitDataForFrontend.prune(previous, names))


def cmd_import(run, args, store):
    from royaltree.legacy import import_legacy
    with run.stage("import-legacy"):
        import_legacy(store, args.source, run.counters, conflicts_only=args.conflicts_only,
                      force=args.force)
    run.counters["store_people"] = store.count("person")
    run.counters["store_labels"] = store.count("label")


def build_parser():
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("--data-dir", default=DEFAULT_DATA_DIR,
                        help="store + combined files (default: %(default)s)")
    common.add_argument("--out-dir", default=DEFAULT_OUT_DIR,
                        help="public payload directory (default: %(default)s)")
    common.add_argument("--offline", action="store_true",
                        help="no network: any request is an error")
    common.add_argument("--max-requests", type=int, default=DEFAULT_MAX_REQUESTS,
                        help="abort the run after this many HTTP requests (default: %(default)s)")
    common.add_argument("--maxlag", type=int, default=http.MAXLAG,
                        help="Wikidata maxlag in seconds (default: %(default)s, the bot "
                             "recommendation; requests wait while the servers lag more)")
    common.add_argument("--summary-json", help="also write the run summary here")

    trees = argparse.ArgumentParser(add_help=False)
    trees.add_argument("monarchies", nargs="*", help="e.g. England Sweden (default for build: all)")
    trees.add_argument("--all", action="store_true", help="every tree in monarch_list.json")
    trees.add_argument("--lists", action="store_true",
                       help="re-scrape the monarch lists from Wikipedia first")
    trees.add_argument("--refresh", action="store_true",
                       help="revision-check stored people and refetch changed ones")
    trees.add_argument("--since", help="with --refresh: only rows not verified since this "
                                       "ISO date (implies --refresh)")
    trees.add_argument("--refresh-conflicts", action="store_true",
                       help="refetch the people whose legacy cache snapshots conflicted "
                            "(recorded by import-legacy; counts against --max-refetch)")
    trees.add_argument("--fresh-membership", action="store_true",
                       help="recompute each tree's member set from this run only, dropping "
                            "relatives that only earlier runs fetched")
    trees.add_argument("--allow-dropped-trees", action="store_true",
                       help="build: let the combined files lose published trees the store lacks")
    trees.add_argument("--max-refetch", type=int, default=DEFAULT_MAX_REFETCH,
                       help="refuse a refresh that would refetch more entities (default: %(default)s)")

    parser = argparse.ArgumentParser(prog="python -m royaltree", description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("fetch", parents=[common, trees], help="update the store (network)")
    sub.add_parser("build", parents=[common, trees], help="fetch + derive + split")
    sub.add_parser("split", parents=[common], help="houses + public/royalty from the combined files")
    # Other options (--base, --verbose, --json, --update-allowlist) pass through to validate.py.
    sub.add_parser("check", parents=[common], help="validate.py check on --out-dir")
    sub.add_parser("diff", parents=[common], help="validate.py diff on --out-dir (e.g. --base HEAD)")
    p = sub.add_parser("import-legacy", parents=[common], help="import the old JSON caches")
    p.add_argument("--from", dest="source", required=True, help="legacy data directory")
    p.add_argument("--conflicts-only", action="store_true",
                   help="only record the conflicting QIDs for --refresh-conflicts "
                        "(reads the legacy dir; leaves imported rows untouched)")
    p.add_argument("--force", action="store_true",
                   help="import even though the store already holds fetched rows "
                        "(they would be replaced by the older legacy snapshots)")
    return parser


def main(argv=None):
    parser = build_parser()
    args, extra = parser.parse_known_args(argv)
    args.data_dir = os.path.abspath(args.data_dir)
    args.out_dir = os.path.abspath(args.out_dir)
    if args.command in ("check", "diff"):
        import validate
        return validate.main(["--public", args.out_dir, args.command, *extra])
    if extra:
        parser.error(f"unrecognized arguments: {' '.join(extra)}")
    if getattr(args, "offline", False) and (getattr(args, "refresh", False) or getattr(args, "since", None)
                                            or getattr(args, "refresh_conflicts", False)):
        parser.error("--refresh/--since/--refresh-conflicts need the network; drop --offline")

    http.configure(offline=args.offline or args.command in ("split", "import-legacy"),
                   max_requests=args.max_requests, maxlag=args.maxlag)
    run = Run(args.command)
    store = None
    status = "ok"
    try:
        if args.command == "split":
            derive_outputs(run, args)
        else:
            store = Store(args.data_dir)
            if args.command == "import-legacy":
                cmd_import(run, args, store)
            else:
                cmd_fetch(run, args, store, derive=args.command == "build")
    except KeyboardInterrupt:
        status = "interrupted (committed batches kept; rerun to resume)"
        raise
    except BaseException as exc:
        status = f"failed: {type(exc).__name__}: {exc}"
        raise
    finally:
        summary = run.summary(status)
        print_summary(summary)
        if store is not None:
            store.add_run(run.started, summary)
            store.close()
        if args.summary_json:
            with open(args.summary_json, "w") as f:
                json.dump(summary, f, indent=2)
    return 0
