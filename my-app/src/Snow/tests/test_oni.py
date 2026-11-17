"""CPC ONI rows, pinned from oni.ascii.txt on 2026-11-17.

Nothing in the Snow pipeline parses this file. Data/oni.json is hand-written.
The README rule is: snowfall season S uses the ANOM on the DJF row whose
year is S+1. Other season codes are not that winter. This test locks that
rule to a recorded excerpt. It does not compare the excerpt to oni.json;
those values differ (see snow-pipeline-tests-report.md).
"""

from pathlib import Path

EXCERPT = Path(__file__).resolve().parent / "fixtures" / "oni_excerpt.ascii.txt"


def djf_anomaly_by_season(text):
    """Map snowfall season start year to the DJF anomaly for the next calendar year."""
    parsed = {}
    for line in text.splitlines():
        parts = line.split()
        if len(parts) != 4 or parts[0] != "DJF":
            continue
        season = int(parts[1]) - 1
        parsed[str(season)] = float(parts[3])
    return parsed


def test_pinned_excerpt_uses_djf_of_the_following_year():
    parsed = djf_anomaly_by_season(EXCERPT.read_text())
    assert parsed == {
        "1999": float("-1.47"),
        "2001": float("-0.15"),
        "2009": float("1.47"),
        "2015": float("2.50"),
        "2025": float("-0.39"),
    }


def test_non_djf_rows_are_not_season_values():
    text = EXCERPT.read_text()
    assert "JFM" in text and "ASO" in text
    parsed = djf_anomaly_by_season(text)
    assert parsed["1999"] != float("-1.26")
    assert "2026" not in parsed
