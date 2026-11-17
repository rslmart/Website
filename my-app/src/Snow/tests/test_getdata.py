"""getData.py stores each WSDOT body under pass and season. It does not merge
with the previous file.

Checked 2026-11-17 against Data/getData.py. json.loads is the only parse.
A failed year is printed and omitted, then the file is still replaced.
An empty ``[]`` body is stored as an empty season. Neither path raises.
website-prop-pipeline-snow-safe-updater is expected to abort instead.
"""

import json
from pathlib import Path
from urllib.error import URLError
from urllib.parse import parse_qs, urlparse

import Snow.Data.getData as getData

FIXTURES = Path(__file__).resolve().parent / "fixtures"
CHECKED_IN = Path(__file__).resolve().parents[1] / "Data" / "pass_snowfall_data.json"
SEASONS = json.loads((FIXTURES / "wsdot_seasons.json").read_text())
EMPTY = json.loads((FIXTURES / "wsdot_empty.json").read_text())


class _Response:
    def __init__(self, body):
        self._body = body

    def read(self):
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def _redirect_output(monkeypatch, tmp_path):
    monkeypatch.setattr(getData, "RAW_PATH", str(tmp_path / "raw.json"))
    monkeypatch.setattr(getData, "PRETTY_PATH", str(tmp_path / "pretty.json"))


def _limit_passes(monkeypatch, years):
    """One request per pass: first year == LATEST_SEASON, except where noted."""
    monkeypatch.setattr(
        getData,
        "passId",
        {name: getData.passId[name] for name in years},
    )
    monkeypatch.setattr(getData, "passYear", dict(years))
    monkeypatch.setattr(getData, "LATEST_SEASON", max(years.values()))


def _stub_fetch(monkeypatch, bodies, *, fail=None):
    """bodies: (pass_id, year) -> bytes. fail: (pass_id, year) -> Exception."""
    fail = fail or {}

    def urlopen(url, timeout=30):
        query = parse_qs(urlparse(url).query)
        key = (query["MountainPassId"][0], int(query["Year"][0]))
        if key in fail:
            raise fail[key]
        if key not in bodies:
            raise AssertionError(f"unexpected WSDOT request {url}")
        return _Response(bodies[key])

    monkeypatch.setattr(getData.urllib.request, "urlopen", urlopen)


def _ids_for(names):
    return {name: getData.passId[name] for name in names}


def test_fixture_is_a_clip_of_checked_in_data():
    full = json.loads(CHECKED_IN.read_text())
    expect = {
        "Stevens_Pass_US-2": ("2015", 0),
        "Blewett_Pass_US-97": ("2010", 0),
    }
    for name, (year, month_index) in expect.items():
        clip = SEASONS[name][0]
        month = full[name][year][month_index]
        assert clip["dailySnowFall"] == month["dailySnowFall"][:2]
        without_days = {key: value for key, value in clip.items() if key != "dailySnowFall"}
        assert without_days == {key: month[key] for key in without_days}


def test_fetch_season_parses_recorded_month(monkeypatch):
    stevens = _ids_for(["Stevens_Pass_US-2"])["Stevens_Pass_US-2"]
    body = json.dumps(SEASONS["Stevens_Pass_US-2"]).encode()
    _stub_fetch(monkeypatch, {(stevens, 2015): body})

    assert getData.fetch_season(stevens, 2015) == SEASONS["Stevens_Pass_US-2"]


def test_download_merges_passes_and_replaces_the_file(monkeypatch, tmp_path):
    _redirect_output(monkeypatch, tmp_path)
    _limit_passes(
        monkeypatch,
        {"Stevens_Pass_US-2": 2015, "Blewett_Pass_US-97": 2015},
    )
    ids = _ids_for(["Stevens_Pass_US-2", "Blewett_Pass_US-97"])
    _stub_fetch(
        monkeypatch,
        {
            (ids["Stevens_Pass_US-2"], 2015): json.dumps(SEASONS["Stevens_Pass_US-2"]).encode(),
            (ids["Blewett_Pass_US-97"], 2015): json.dumps(SEASONS["Blewett_Pass_US-97"]).encode(),
        },
    )
    raw_path = Path(getData.RAW_PATH)
    pretty_path = Path(getData.PRETTY_PATH)
    raw_path.write_text(json.dumps({"Ghost_Pass": {"1990": [{"month": "Dec"}]}}))

    getData.download_data()
    getData.write_pretty()

    raw = json.loads(raw_path.read_text())
    pretty = json.loads(pretty_path.read_text())
    assert "Ghost_Pass" not in raw
    assert raw == pretty
    assert raw["Stevens_Pass_US-2"]["2015"] == SEASONS["Stevens_Pass_US-2"]
    assert raw["Blewett_Pass_US-97"]["2015"] == SEASONS["Blewett_Pass_US-97"]
    assert pretty_path.read_text() == json.dumps(pretty, indent=4)


def test_empty_season_is_stored(monkeypatch, tmp_path):
    """WSDOT ``[]`` is written as an empty season. It is not dropped.

    The 2026-11-16 pipeline review recorded this body for Blewett Year=2026.
    The checked-in history has no empty season to clip.
    """
    _redirect_output(monkeypatch, tmp_path)
    _limit_passes(monkeypatch, {"Blewett_Pass_US-97": 2026})
    blewett = getData.passId["Blewett_Pass_US-97"]
    _stub_fetch(monkeypatch, {(blewett, 2026): b"[]"})

    getData.download_data()

    stored = json.loads(Path(getData.RAW_PATH).read_text())
    assert stored["Blewett_Pass_US-97"]["2026"] == EMPTY == []


def test_failed_year_is_omitted_and_does_not_raise(monkeypatch, tmp_path, capsys):
    """A failed year does not fail loudly.

    download_data prints the error, leaves that season out, and still
    replaces the output file. __main__ does not check that result, so the
    process exit code stays 0. website-prop-pipeline-snow-safe-updater is
    expected to abort without writing.
    """
    _redirect_output(monkeypatch, tmp_path)
    monkeypatch.setattr(getData, "passId", {"Stevens_Pass_US-2": "10"})
    monkeypatch.setattr(getData, "passYear", {"Stevens_Pass_US-2": 2015})
    monkeypatch.setattr(getData, "LATEST_SEASON", 2016)
    stevens = "10"
    _stub_fetch(
        monkeypatch,
        {(stevens, 2015): json.dumps(SEASONS["Stevens_Pass_US-2"]).encode()},
        fail={(stevens, 2016): URLError("timed out")},
    )

    assert getData.download_data() is None

    stored = json.loads(Path(getData.RAW_PATH).read_text())
    assert stored["Stevens_Pass_US-2"]["2015"] == SEASONS["Stevens_Pass_US-2"]
    assert "2016" not in stored["Stevens_Pass_US-2"]
    assert "failed Stevens_Pass_US-2 2016" in capsys.readouterr().out
