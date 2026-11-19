"""The monarch registry: one record per tree, checked against a schema on import.

Membership stays on the Wikipedia list pages named here. Person records stay
with the Wikidata fetch. Adding a tree is a new entry, not a new Python branch.
"""
import json
import os
import re

REGISTRY_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "monarchies.json")

STRATEGIES = ("navbox", "tables", "heading", "egypt")
ANCESTOR_MODES = ("none", "european", "deep")
SOURCE_KEYS = {"page", "strategy", "param", "blocklist", "stop_after"}
ENTRY_KEYS = {"ancestor", "sources", "union_of", "ensure_first"}
QID_RE = re.compile(r"^Q[1-9][0-9]*$")
PAGE_PREFIX = "https://en.wikipedia.org/wiki/"


class RegistryError(ValueError):
    """The registry file does not match the schema."""


def _bad(name, message):
    raise RegistryError(f"{name}: {message}")


def _check_source(name, index, source):
    where = f"{name} source {index}"
    if not isinstance(source, dict):
        _bad(where, "must be an object")
    extra = set(source) - SOURCE_KEYS
    if extra:
        _bad(where, f"unknown fields {sorted(extra)}")
    page = source.get("page")
    if not isinstance(page, str) or not page.startswith(PAGE_PREFIX):
        _bad(where, f"page must be an {PAGE_PREFIX} URL")
    strategy = source.get("strategy")
    if strategy not in STRATEGIES:
        _bad(where, f"strategy must be one of {', '.join(STRATEGIES)}")
    param = source.get("param")
    if strategy == "tables":
        if param is not None and (
            not isinstance(param, list)
            or not param
            or any(not isinstance(i, int) or i < 0 for i in param)
        ):
            _bad(where, "tables param must be null (every wikitable) or a list of indexes")
    elif not isinstance(param, str) or not param.strip():
        _bad(where, f"{strategy} param must be a non-empty string")
    blocklist = source.get("blocklist", [])
    if not isinstance(blocklist, list) or any(not isinstance(item, str) or not item for item in blocklist):
        _bad(where, "blocklist must be a list of titles")
    stop_after = source.get("stop_after")
    if stop_after is not None and (not isinstance(stop_after, str) or not stop_after):
        _bad(where, "stop_after must be a title")


def _check_entry(name, entry, registry):
    if not isinstance(name, str) or not name:
        _bad(name, "name must be a non-empty string")
    if not isinstance(entry, dict):
        _bad(name, "must be an object")
    extra = set(entry) - ENTRY_KEYS
    if extra:
        _bad(name, f"unknown fields {sorted(extra)}")
    ancestor = entry.get("ancestor")
    if ancestor not in ANCESTOR_MODES:
        _bad(name, f"ancestor must be one of {', '.join(ANCESTOR_MODES)}")
    has_sources = "sources" in entry
    has_union = "union_of" in entry
    if has_sources == has_union:
        _bad(name, "needs sources or union_of, and not both")
    if has_sources:
        sources = entry["sources"]
        if not isinstance(sources, list) or not sources:
            _bad(name, "sources must be a non-empty list")
        for index, source in enumerate(sources):
            _check_source(name, index, source)
    else:
        parts = entry["union_of"]
        if not isinstance(parts, list) or not parts:
            _bad(name, "union_of must be a non-empty list of monarchies")
        if any(not isinstance(part, str) for part in parts):
            _bad(name, "union_of entries must be monarchy names")
        if name in parts:
            _bad(name, "union_of cannot include itself")
        missing = [part for part in parts if part not in registry]
        if missing:
            _bad(name, f"union_of names not in the registry: {missing}")
    root = entry.get("ensure_first")
    if root is not None and not has_union:
        _bad(name, "ensure_first belongs on a union")
    if root is not None and (not isinstance(root, str) or not QID_RE.match(root)):
        _bad(name, "ensure_first must be a QID")


def _check_cycles(registry):
    done = set()
    visiting = []

    def walk(name):
        if name in done:
            return
        if name in visiting:
            cycle = visiting[visiting.index(name):] + [name]
            raise RegistryError("union cycle: " + " -> ".join(cycle))
        visiting.append(name)
        for part in registry[name].get("union_of", []):
            walk(part)
        visiting.pop()
        done.add(name)

    for name in registry:
        walk(name)


def validate_registry(registry):
    """Raise RegistryError if ``registry`` does not match the monarch schema."""
    if not isinstance(registry, dict) or not registry:
        raise RegistryError("registry must be a non-empty object of monarchies")
    for name, entry in registry.items():
        _check_entry(name, entry, registry)
    _check_cycles(registry)
    return registry


def load_registry(path=None):
    path = path or REGISTRY_PATH
    with open(path, encoding="utf-8") as handle:
        registry = json.load(handle)
    return validate_registry(registry)


REGISTRY = load_registry()
NAMES = list(REGISTRY)


def ancestor_mode(name):
    """``none``, ``european`` or ``deep``. An unknown tree has no ancestor stage."""
    entry = REGISTRY.get(name)
    if entry is None:
        return "none"
    return entry["ancestor"]
