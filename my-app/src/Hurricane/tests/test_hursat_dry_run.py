"""Dry-run behaviour of buildHursatImages.py.

pytest-socket does not see a curl subprocess, so these tests patch _curl,
the download helper. make_s3_client is patched as well. A dry run does not
need S3, and the makoa profile cannot load while credential files are /dev/null.
"""

from __future__ import annotations

import gzip
import importlib.util
import json
import sys
from pathlib import Path

import pytest

HURRICANE_DIR = Path(__file__).resolve().parents[1]
REAL_MANIFEST = HURRICANE_DIR / "data" / "hursat_manifest.json"
SCRIPT = HURRICANE_DIR / "data" / "buildHursatImages.py"
SID = "1990001N00000"


@pytest.fixture(scope="module")
def hursat():
    spec = importlib.util.spec_from_file_location("buildHursatImages", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _stage(tmp_path, hursat, monkeypatch, extra_args):
    storms_path = tmp_path / "storms.json.gz"
    manifest_path = tmp_path / "hursat_manifest.json"
    payload = {
        SID: {
            "id": SID,
            "name": "TEST",
            "season": 1990,
            "max_wind": 120,
            "record_type_list": ["L"],
        }
    }
    with gzip.open(storms_path, "wb") as handle:
        handle.write(json.dumps(payload).encode("utf-8"))
    original = {"kept": {"count": 3, "ts": 1}}
    manifest_path.write_text(json.dumps(original), encoding="utf-8")

    hursat._year_cache.clear()
    monkeypatch.setattr(hursat, "STORMS_PATH", str(storms_path))
    monkeypatch.setattr(hursat, "MANIFEST_PATH", str(manifest_path))

    def fake_curl(url, out_path=None, timeout=300):
        if out_path is not None:
            raise AssertionError(f"dry-run tried to download {url}")
        return ""

    def fail_s3():
        raise AssertionError("dry-run called make_s3_client")

    monkeypatch.setattr(hursat, "_curl", fake_curl)
    monkeypatch.setattr(hursat, "make_s3_client", fail_s3)
    monkeypatch.setattr(
        sys,
        "argv",
        ["buildHursatImages.py", "--dry-run", "--workers", "1", "--sids", SID, *extra_args],
    )
    return manifest_path, original


def test_dry_run_does_not_call_s3(tmp_path, hursat, monkeypatch):
    real_before = REAL_MANIFEST.read_bytes()
    manifest_path, _original = _stage(tmp_path, hursat, monkeypatch, [])
    hursat.main()
    assert REAL_MANIFEST.read_bytes() == real_before
    # The patched client raises if called. Reaching this line means it was not.
    assert manifest_path.exists()


@pytest.mark.parametrize("extra", [[], ["--force"]], ids=["dry-run", "dry-run-force"])
@pytest.mark.xfail(
    reason="website-prop-pipeline-hurricane-hursat-coverage",
    strict=True,
    raises=AssertionError,
)
def test_dry_run_does_not_write_the_manifest(tmp_path, hursat, monkeypatch, extra):
    """A dry run leaves hursat_manifest.json byte-identical, with or without --force."""
    real_before = REAL_MANIFEST.read_bytes()
    manifest_path, original = _stage(tmp_path, hursat, monkeypatch, extra)
    before = manifest_path.read_bytes()
    hursat.main()
    assert REAL_MANIFEST.read_bytes() == real_before
    assert json.loads(manifest_path.read_text(encoding="utf-8")) == original
    assert manifest_path.read_bytes() == before
