"""Offline tests for the monarch registry and list scraper.

Pinned HTML lives in tests/fixtures/lists/. Nothing here touches the network.
"""
import json
from copy import deepcopy
from pathlib import Path

import pytest
from bs4 import BeautifulSoup

import GetListOfMonarchs as lists
from royaltree import cli, graph
from royaltree.registry import NAMES, REGISTRY, RegistryError, ancestor_mode, validate_registry

FIXTURES = Path(__file__).parent / "fixtures" / "lists"

EUROPEAN = {
    "Austria", "Bavaria", "Bohemia", "Denmark", "England", "France", "Germany",
    "Greece", "Holy_Roman_Empire", "Hungary", "Iceland", "Naples", "Netherlands",
    "Norway", "Poland", "Portugal", "Russia", "Scotland", "Spain", "Sweden",
}
DEEP = {
    "Mongol_Empire", "Golden_Horde", "Ilkhanate", "Chagatai_Khanate", "Chinggisids",
}


def _soup(name):
    return BeautifulSoup((FIXTURES / name).read_bytes(), "html.parser")


def _human(qid, human=True):
    kind = "Q5" if human else "Q41710"
    return {"id": qid, "claims": {"P31": [{"mainsnak": {"datavalue": {"value": {"id": kind}}}}]}}


class _Response:
    def __init__(self, content=b"", payload=None):
        self.content = content
        self.status_code = 200
        self._payload = payload or {}

    def json(self):
        return self._payload


def test_registry_matches_the_saved_monarch_list():
    saved = json.loads((Path(__file__).parents[1] / "data" / "monarch_list.json").read_text())
    assert len(NAMES) == 41
    assert set(NAMES) == set(saved)
    assert NAMES[-1] == "Chinggisids"
    validate_registry(REGISTRY)


def test_ancestor_mode_replaces_the_old_sets():
    assert not hasattr(graph, "EUROPEAN_MONARCHIES")
    assert not hasattr(graph, "DEEP_ANCESTOR_MONARCHIES")
    for name in NAMES:
        if name in EUROPEAN:
            assert ancestor_mode(name) == "european"
            assert graph.ancestor_settings(name) == (graph.MAX_ANCESTOR_DEPTH, True)
        elif name in DEEP:
            assert ancestor_mode(name) == "deep"
            assert graph.ancestor_settings(name) == (graph.DEEP_ANCESTOR_DEPTH, False)
        else:
            assert ancestor_mode(name) == "none"
            assert graph.ancestor_settings(name) is None
    assert graph.ancestor_settings("Alpha") is None
    assert graph.ancestor_settings("Yuan") is None
    assert graph.ancestor_settings("Mughal") is None


def test_registry_rejects_a_bad_entry():
    bad = deepcopy(REGISTRY)
    bad["England"] = {"ancestor": "sideways", "sources": []}
    with pytest.raises(RegistryError, match="England"):
        validate_registry(bad)
    bad = deepcopy(REGISTRY)
    bad["England"]["colour"] = "#fff"
    with pytest.raises(RegistryError, match="unknown fields"):
        validate_registry(bad)
    bad = deepcopy(REGISTRY)
    bad["Loop"] = {"ancestor": "none", "union_of": ["Loop"]}
    with pytest.raises(RegistryError, match="itself"):
        validate_registry(bad)


def test_no_per_monarchy_scrape_branch_remains():
    source = Path(lists.__file__).read_text()
    assert "def get_monarch_list(" not in source
    assert "def convert_wiki_list_to_wiki_data_list(" not in source
    assert "def get_monarch_list_with_i(" not in source
    assert "def build_chinggisids(" not in source
    assert 'if "England"' not in source
    assert "aria-labelledby':" not in source
    assert 'startswith' not in source


def test_navbox_title_ignores_punctuation_and_not_the_id():
    assert lists.normalise_navbox_title("English , Scottish , and British monarchs") == \
        lists.normalise_navbox_title("English, Scottish, and British monarchs")
    assert lists.normalise_navbox_title("Ottoman sultans / caliphs") == \
        lists.normalise_navbox_title("Ottoman sultans/caliphs")
    assert lists.normalise_navbox_title("Emperors of Japan ( list )") == \
        lists.normalise_navbox_title("Emperors of Japan (list)")
    soup = _soup("navbox_title.html")
    # The first navbox's id looks like the old anchor. Its title does not match.
    titles = lists._links_from_navbox(soup, "Ottoman sultans/caliphs")
    assert titles == ["Osman_I", "Orhan", "Mehmed_II", "Oliver_Cromwell"]
    with pytest.raises(ValueError, match="navbox titled 'Monarchs of Spain' not found"):
        lists._links_from_navbox(soup, "Monarchs of Spain")


def test_navbox_keeps_a_coruler_once_and_a_nested_item_once():
    soup = _soup("navbox_coruler.html")
    titles = lists._links_from_navbox(soup, "Monarchs of Denmark")
    assert titles == ["Canute_V", "Valdemar_I", "Valdemar_the_Young", "Eric_Christoffersen"]
    assert titles.count("Valdemar_I") == 1
    assert titles.count("Valdemar_the_Young") == 1


def test_missing_table_is_an_error_not_an_empty_list():
    missing = _soup("tables_missing.html")
    with pytest.raises(ValueError, match="no wikitable found"):
        lists._links_from_tables(missing, None)
    empty = _soup("tables_empty.html")
    with pytest.raises(ValueError, match="no article links"):
        lists._links_from_tables(empty, None)
    one = _soup("tables_one.html")
    with pytest.raises(ValueError, match="wikitable index"):
        lists._links_from_tables(one, [5])
    assert lists._links_from_tables(one, [0]) == ["Taejo_of_Joseon", "Jeongjong_of_Joseon"]


def test_missing_heading_and_period_fail():
    heading = _soup("heading_list.html")
    assert lists._links_from_heading_list(heading, "Great Khans") == \
        ["Genghis_Khan", "Kublai_Khan", "Temur_Khan"]
    with pytest.raises(ValueError, match="heading containing 'Ilkhanate' not found"):
        lists._links_from_heading_list(heading, "Ilkhanate")
    egypt = _soup("egypt_periods.html")
    assert lists._links_from_egypt_period(egypt, "Old Kingdom") == ["Djoser", "Manetho"]
    with pytest.raises(ValueError, match="heading for period 'Late Period' not found"):
        lists._links_from_egypt_period(egypt, "Late Period")
    with pytest.raises(ValueError, match="period 'New Kingdom' has no article links"):
        lists._links_from_egypt_period(egypt, "New Kingdom")


def test_scrape_monarchy_keeps_humans_and_stop_after(monkeypatch):
    html = (FIXTURES / "navbox_title.html").read_bytes()
    lists._soup_cache.clear()

    def fake_get(url, params=None, timeout=None, **kwargs):
        if "api.php" in url:
            pages = {}
            for index, title in enumerate(params["titles"].split("|"), start=1):
                pages[str(index)] = {
                    "title": title.replace("_", " "),
                    "pageprops": {"wikibase_item": f"Q{index}"},
                }
            return _Response(payload={"query": {"pages": pages}})
        return _Response(content=html)

    def fake_entities(qids):
        # Document order: Osman Q1 human, Orhan Q2 not, Mehmed Q3 human.
        return {qid: _human(qid, human=qid != "Q2") for qid in qids}

    monkeypatch.setattr(lists.requests, "get", fake_get)
    monkeypatch.setattr(lists, "get_entities", fake_entities)
    assert lists.scrape_monarchy(
        "https://en.wikipedia.org/wiki/Example", "navbox", "Ottoman sultans/caliphs",
        blocklist=frozenset({"Oliver_Cromwell"}),
    ) == ["Q1", "Q3"]
    lists._soup_cache.clear()
    assert lists.scrape_monarchy(
        "https://en.wikipedia.org/wiki/Example", "navbox", "Ottoman sultans/caliphs",
        stop_after="Orhan",
    ) == ["Q1"]


def test_check_unions_in_memory_and_writes_nothing(tmp_path, monkeypatch):
    registry = {
        "Mongol_Empire": {
            "ancestor": "deep",
            "sources": [{
                "page": "https://en.wikipedia.org/wiki/List_of_Mongol_rulers",
                "strategy": "heading",
                "param": "Great Khans",
            }],
        },
        "Chinggisids": {
            "ancestor": "deep",
            "union_of": ["Mongol_Empire"],
            "ensure_first": "Q720",
        },
    }
    monkeypatch.setattr(lists, "scrape_monarchy", lambda *args, **kwargs: ["Q2", "Q1"])
    path = tmp_path / "monarch_list.json"
    path.write_text(json.dumps({"Mongol_Empire": ["Q9"], "Chinggisids": ["Q9"]}))
    before = path.read_bytes()
    previous = lists.MONARCH_LIST_PATH
    lists.MONARCH_LIST_PATH = str(path)
    scraped, errors, lines = lists.report_lists(
        ["Mongol_Empire", "Chinggisids"],
        json.loads(before),
        registry,
    )
    assert errors == {}
    assert scraped["Chinggisids"] == ["Q720", "Q2", "Q1"]
    assert scraped["Mongol_Empire"] == ["Q2", "Q1"]
    assert path.read_bytes() == before
    text = "\n".join(lines)
    assert "Q720" in text and "added:" in text and "removed:" in text and "reordered:" in text
    lists.apply_lists(["Chinggisids"], scraped)
    written = json.loads(path.read_text())
    lists.MONARCH_LIST_PATH = previous
    assert written["Chinggisids"] == ["Q720", "Q2", "Q1"]
    assert written["Mongol_Empire"] == ["Q9"]


def test_a_failed_tree_does_not_stop_the_others(monkeypatch):
    registry = {
        "England": {
            "ancestor": "european",
            "sources": [{
                "page": "https://en.wikipedia.org/wiki/List_of_English_monarchs",
                "strategy": "navbox",
                "param": "English, Scottish, and British monarchs",
            }],
        },
        "France": {
            "ancestor": "european",
            "sources": [{
                "page": "https://en.wikipedia.org/wiki/List_of_French_monarchs",
                "strategy": "navbox",
                "param": "Monarchs of France",
            }],
        },
    }

    def scrape(url, strategy, param=None, blocklist=frozenset(), stop_after=None):
        if "English" in url:
            raise ValueError("navbox titled 'English, Scottish, and British monarchs' not found")
        return ["Q10"]

    monkeypatch.setattr(lists, "scrape_monarchy", scrape)
    scraped, errors, lines = lists.report_lists(["England", "France"], {"France": []}, registry)
    assert scraped == {"France": ["Q10"]}
    assert "not found" in errors["England"]
    text = "\n".join(lines)
    assert "England: failed:" in text and "France:" in text
    assert text.endswith("2 trees: 0 match, 1 differ, 1 failed")


def test_cli_check_prints_reordered_qids_and_does_not_write(tmp_path, monkeypatch, capsys):
    data = tmp_path / "data"
    data.mkdir()
    path = data / "monarch_list.json"
    path.write_text(json.dumps({"England": ["Q1", "Q2"]}))
    before = path.read_bytes()
    monkeypatch.setattr(lists, "scrape_registered", lambda names, registry=None: ({"England": ["Q2", "Q1"]}, {}))
    code = cli.main(["lists", "England", "--check", "--data-dir", str(data),
                     "--out-dir", str(tmp_path / "out")])
    assert code == 0
    assert path.read_bytes() == before
    out = capsys.readouterr().out
    assert "reordered: Q2, Q1" in out
    assert "added: -" in out and "removed: -" in out


def test_cli_apply_is_what_writes(tmp_path, monkeypatch, capsys):
    data = tmp_path / "data"
    data.mkdir()
    monkeypatch.setattr(lists, "scrape_registered", lambda names, registry=None: ({"England": ["Q5"]}, {}))
    code = cli.main(["lists", "England", "--apply", "--data-dir", str(data),
                     "--out-dir", str(tmp_path / "out")])
    assert code == 0
    assert json.loads((data / "monarch_list.json").read_text())["England"] == ["Q5"]
    with pytest.raises(SystemExit):
        cli.main(["lists", "England", "--data-dir", str(data), "--out-dir", str(tmp_path / "out")])
