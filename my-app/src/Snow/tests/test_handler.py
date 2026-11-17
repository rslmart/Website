"""Lambda handler S3 behaviour, checked 2026-11-17 against lambda/handler.py.

Normal update: read the object, store each successful WSDOT body on the
current season (string key), leave other seasons in place, PUT the whole
document (indent 4, application/json, max-age=3600), then invalidate
``/<object key>``.

Missing key: NoSuchKey is an empty document. The handler still writes the
fetched season and still invalidates.

Read error (corrupt JSON, or GetObject raising anything other than
NoSuchKey): load_existing returns ``{}`` and the handler PUTs that plus the
new season, replacing whatever was stored. That wipe is a known bug.
The test below expects the object to be left unchanged, and is xfail until
website-prop-pipeline-snow-safe-updater.
"""

import datetime
import importlib.util
import json
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import boto3
import pytest

_HANDLER_PATH = Path(__file__).resolve().parents[1] / "lambda" / "handler.py"
_spec = importlib.util.spec_from_file_location("snow_lambda_handler", _HANDLER_PATH)
handler = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(handler)

FIXTURES = Path(__file__).resolve().parent / "fixtures"
SEASONS = json.loads((FIXTURES / "wsdot_seasons.json").read_text())
BUCKET = "snow-pipeline-test"
KEY = "snow/pass_snowfall_data.json"
FETCHED = SEASONS["Stevens_Pass_US-2"]
TODAY = datetime.date(2026, 11, 17)


class _FrozenDate(datetime.date):
    @classmethod
    def today(cls):
        return cls(TODAY.year, TODAY.month, TODAY.day)


class _Response:
    def __init__(self, body):
        self._body = body

    def read(self):
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def _pin_today(monkeypatch):
    monkeypatch.setattr(handler.datetime, "date", _FrozenDate)


def _prepare(moto_s3, monkeypatch):
    """Bucket plus a distribution, because moto rejects an unknown id."""
    moto_s3.create_bucket(Bucket=BUCKET)
    cloudfront = boto3.client("cloudfront", region_name="us-east-1")
    created = cloudfront.create_distribution(
        DistributionConfig={
            "CallerReference": "snow-pipeline-test",
            "Comment": "snow pipeline test",
            "Enabled": True,
            "Origins": {
                "Quantity": 1,
                "Items": [
                    {
                        "Id": "origin",
                        "DomainName": f"{BUCKET}.s3.amazonaws.com",
                        "S3OriginConfig": {"OriginAccessIdentity": ""},
                    }
                ],
            },
            "DefaultCacheBehavior": {
                "TargetOriginId": "origin",
                "ViewerProtocolPolicy": "allow-all",
            },
        }
    )
    distribution_id = created["Distribution"]["Id"]
    monkeypatch.setenv("BUCKET_NAME", BUCKET)
    monkeypatch.setenv("OBJECT_KEY", KEY)
    monkeypatch.setenv("DISTRIBUTION_ID", distribution_id)
    return distribution_id


def _invalidation_paths(distribution_id):
    cloudfront = boto3.client("cloudfront", region_name="us-east-1")
    listed = cloudfront.list_invalidations(DistributionId=distribution_id)
    items = listed["InvalidationList"]["Items"] or []
    paths = []
    for item in items:
        detail = cloudfront.get_invalidation(
            DistributionId=distribution_id,
            Id=item["Id"],
        )
        paths.append(
            detail["Invalidation"]["InvalidationBatch"]["Paths"]["Items"]
        )
    return paths


def _stub_fetch(monkeypatch):
    def urlopen(url, timeout=30):
        query = parse_qs(urlparse(url).query)
        pass_id = query["MountainPassId"][0]
        year = int(query["Year"][0])
        if pass_id not in handler.passId.values() or year != TODAY.year:
            raise AssertionError(f"unexpected WSDOT request {url}")
        return _Response(json.dumps(FETCHED).encode())

    monkeypatch.setattr(handler.urllib.request, "urlopen", urlopen)


def _read(s3):
    return s3.get_object(Bucket=BUCKET, Key=KEY)["Body"].read()


def _deny_get_object(monkeypatch):
    original = handler.boto3.client

    def client(service_name, *args, **kwargs):
        created = original(service_name, *args, **kwargs)
        if service_name == "s3":
            def get_object(**_kwargs):
                raise created.exceptions.ClientError(
                    {"Error": {"Code": "AccessDenied", "Message": "denied"}},
                    "GetObject",
                )
            created.get_object = get_object
        return created

    monkeypatch.setattr(handler.boto3, "client", client)


def test_current_season_uses_october_boundary():
    assert handler.current_season(datetime.date(2026, 9, 30)) == 2025
    assert handler.current_season(datetime.date(2026, 10, 1)) == 2026
    assert handler.current_season(TODAY) == 2026


def test_normal_update_keeps_history_and_writes_metadata(moto_s3, monkeypatch):
    _pin_today(monkeypatch)
    distribution_id = _prepare(moto_s3, monkeypatch)
    _stub_fetch(monkeypatch)
    existing = {
        "Stevens_Pass_US-2": {"2015": SEASONS["Blewett_Pass_US-97"]},
        "Snoqualmie_Pass_I-90": {"1999": [{"month": "Dec"}]},
    }
    moto_s3.put_object(Bucket=BUCKET, Key=KEY, Body=json.dumps(existing).encode())

    result = handler.handler({}, None)

    assert result["season"] == 2026
    assert result["passesUpdated"] == len(handler.passId)
    assert result["bucket"] == BUCKET
    assert result["key"] == KEY
    stored_obj = moto_s3.get_object(Bucket=BUCKET, Key=KEY)
    assert stored_obj["ContentType"] == "application/json"
    assert stored_obj["CacheControl"] == "max-age=3600"
    stored = json.loads(stored_obj["Body"].read())
    assert stored["Stevens_Pass_US-2"]["2015"] == SEASONS["Blewett_Pass_US-97"]
    assert stored["Stevens_Pass_US-2"]["2026"] == FETCHED
    assert stored["Snoqualmie_Pass_I-90"]["1999"] == [{"month": "Dec"}]
    assert stored["Snoqualmie_Pass_I-90"]["2026"] == FETCHED
    assert _invalidation_paths(distribution_id) == [["/" + KEY]]


def test_missing_key_starts_from_empty_and_still_writes(moto_s3, monkeypatch, capsys):
    _pin_today(monkeypatch)
    distribution_id = _prepare(moto_s3, monkeypatch)
    _stub_fetch(monkeypatch)

    result = handler.handler({}, None)

    assert "could not read" not in capsys.readouterr().out
    assert result["passesUpdated"] == len(handler.passId)
    stored = json.loads(_read(moto_s3))
    assert set(stored) == set(handler.passId)
    for name in handler.passId:
        assert list(stored[name]) == ["2026"]
        assert stored[name]["2026"] == FETCHED
    assert _invalidation_paths(distribution_id) == [["/" + KEY]]


@pytest.mark.xfail(strict=True, reason="website-prop-pipeline-snow-safe-updater")
@pytest.mark.parametrize("failure", ["corrupt-json", "access-denied"])
def test_read_error_does_not_replace_the_object(moto_s3, monkeypatch, failure):
    """A read or parse failure must leave the stored object unchanged.

    Today load_existing treats the failure as an empty document and the
    handler overwrites the key. Strict xfail: a fix that stops the write
    turns this into an unexpected pass.
    """
    _pin_today(monkeypatch)
    _prepare(moto_s3, monkeypatch)
    _stub_fetch(monkeypatch)
    if failure == "corrupt-json":
        before = b"not-json"
    else:
        before = json.dumps(
            {"Stevens_Pass_US-2": {"2015": SEASONS["Stevens_Pass_US-2"]}}
        ).encode()
        _deny_get_object(monkeypatch)
    moto_s3.put_object(Bucket=BUCKET, Key=KEY, Body=before)

    try:
        handler.handler({}, None)
    except Exception:
        pass

    assert _read(moto_s3) == before
