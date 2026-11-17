"""Safe Snow updater. Recorded WSDOT bodies only; no live requests.

The checked-in season clips live in fixtures/wsdot_seasons.json. Blewett
Year=2026 is fixtures/wsdot_empty.json, the [] WSDOT returned on 2026-11-16.
Invalid dates, negative readings, and short seasons are those clips with one
field changed. S3 uses moto.
"""

import copy
import datetime
import hashlib
import http.client
import io
import json
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import boto3
import pytest

import Snow.pipeline.snow as snow

FIXTURES = Path(__file__).resolve().parent / "fixtures"
CHECKED_IN = Path(__file__).resolve().parents[1] / "Data" / "pass_snowfall_data.json"
SEASONS = json.loads((FIXTURES / "wsdot_seasons.json").read_text())
EMPTY = json.loads((FIXTURES / "wsdot_empty.json").read_text())
BUCKET = "snow-pipeline-test"
KEY = "snow/pass_snowfall_data.json"
TODAY = "2026-11-18"
STAMP = "2026-11-18T01:02:03Z"
CURRENT_IDS = {("1", 2026), ("9", 2026), ("10", 2026), ("11", 2026), ("12", 2026)}
FIRST_YEAR = {"1": 2005, "9": 2005, "10": 2004, "11": 1999, "12": 2005}


class _Response:
    def __init__(self, body):
        self._body = body

    def read(self):
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def urllib_error(code):
    import urllib.error

    return urllib.error.HTTPError(
        snow.SOURCE_URL,
        code,
        "unavailable",
        http.client.HTTPMessage(),
        io.BytesIO(b""),
    )


def _freeze(monkeypatch, stamp=STAMP):
    moment = datetime.datetime.strptime(stamp, "%Y-%m-%dT%H:%M:%SZ").replace(
        tzinfo=datetime.timezone.utc
    )
    monkeypatch.setattr(snow, "now", lambda: moment)


def _forbid_aws(monkeypatch):
    def forbid():
        raise AssertionError("S3 or CloudFront called")

    monkeypatch.setattr(snow, "aws_clients", forbid)


def _stub(monkeypatch, responses=None, *, fail=None, default=None):
    """responses: (pass id, year) -> season or bytes. fail: key -> Exception."""
    responses = responses or {}
    fail = fail or {}
    calls = []

    def urlopen(url, timeout=30):
        assert isinstance(url, snow.urllib.request.Request)
        assert url.get_header("User-agent") == snow.USER_AGENT
        query = parse_qs(urlparse(url.full_url).query)
        key = (query["MountainPassId"][0], int(query["Year"][0]))
        calls.append(key)
        if key in fail:
            raise fail[key]
        if key in responses:
            body = responses[key]
        elif default is not None:
            body = default
        else:
            raise AssertionError(f"unexpected WSDOT request {url.full_url}")
        if isinstance(body, bytes):
            return _Response(body)
        return _Response(json.dumps(body).encode())

    monkeypatch.setattr(snow.urllib.request, "urlopen", urlopen)
    return calls


def _write(path, document):
    path.write_text(json.dumps(document), encoding="utf-8")
    return path.read_bytes()


def _local_argv(tmp, source, *extra, today=TODAY):
    return [
        "--input",
        str(source),
        "--output",
        str(tmp / "out.json"),
        "--log",
        str(tmp / "snow-update.log"),
        "--today",
        today,
        "--retries",
        "0",
        *extra,
    ]


def _history():
    season = copy.deepcopy(SEASONS["Stevens_Pass_US-2"])
    return {name: {"2015": copy.deepcopy(season)} for name, _pass_id, _year in snow.PASSES}


def _current_body():
    """A season whose observation dates fall in November 2026."""
    body = copy.deepcopy(SEASONS["Stevens_Pass_US-2"])
    body[0]["year"] = 2026
    body[0]["dailySnowFall"][0]["day"] = 3
    body[0]["dailySnowFall"][1]["day"] = 4
    return body


def _only(tmp, source, before):
    assert source.read_bytes() == before
    assert sorted(path.name for path in tmp.iterdir()) == [source.name, "snow-update.log"]
    assert not (tmp / "out.json").exists()
    assert not (tmp / "meta.json").exists()
    assert (tmp / "snow-update.log").read_text().strip()


def _dataset_untouched(tmp, source, before):
    assert source.read_bytes() == before
    assert not (tmp / "out.json").exists()
    assert not (tmp / "meta.json").exists()
    assert (tmp / "snow-update.log").is_file()


def _distribution():
    cloudfront = boto3.client("cloudfront", region_name="us-east-1")
    created = cloudfront.create_distribution(
        DistributionConfig={
            "CallerReference": "snow-updater-test",
            "Comment": "snow updater test",
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
    return created["Distribution"]["Id"]


def _invalidation_paths(distribution_id):
    cloudfront = boto3.client("cloudfront", region_name="us-east-1")
    listed = cloudfront.list_invalidations(DistributionId=distribution_id)
    items = listed["InvalidationList"].get("Items") or []
    paths = []
    for item in items:
        detail = cloudfront.get_invalidation(DistributionId=distribution_id, Id=item["Id"])
        paths.append(detail["Invalidation"]["InvalidationBatch"]["Paths"]["Items"])
    return paths


def _s3_bytes(client):
    return client.get_object(Bucket=BUCKET, Key=KEY)["Body"].read()


def test_current_season_uses_october_boundary():
    assert snow.current_season(datetime.date(2026, 9, 30)) == 2025
    assert snow.current_season(datetime.date(2026, 10, 1)) == 2026
    assert snow.current_season(datetime.date(2026, 11, 18)) == 2026


def test_accumulated_drop_inside_tolerance_is_kept():
    body = copy.deepcopy(SEASONS["Stevens_Pass_US-2"])
    body[0]["dailySnowFall"][0]["accumulatedSnowFall"] = 1
    body[0]["dailySnowFall"][1]["accumulatedSnowFall"] = 1 - 0.04
    snow.validate_season(body, "Stevens_Pass_US-2", 2015)
    body[0]["dailySnowFall"][1]["accumulatedSnowFall"] = 1 - 0.2
    with pytest.raises(snow.SnowError, match="decreased"):
        snow.validate_season(body, "Stevens_Pass_US-2", 2015)


@pytest.mark.parametrize("flag", [[], ["--current"]])
def test_current_requests_five_passes(tmp_path, monkeypatch, flag):
    _freeze(monkeypatch)
    _forbid_aws(monkeypatch)
    source = tmp_path / "input.json"
    before = _write(source, _history())
    calls = _stub(monkeypatch, default=[])
    code = snow.main(_local_argv(tmp_path, source, *flag))
    assert code == 0
    assert set(calls) == CURRENT_IDS
    assert len(calls) == 5
    _dataset_untouched(tmp_path, source, before)
    lines = (tmp_path / "snow-update.log").read_text().splitlines()
    assert lines[0] == "current season 2026: 5 requests"
    assert lines[-1] == "unchanged"


def test_september_requests_the_previous_season(tmp_path, monkeypatch):
    _freeze(monkeypatch)
    _forbid_aws(monkeypatch)
    source = tmp_path / "input.json"
    _write(source, _history())
    calls = _stub(monkeypatch, default=[])
    code = snow.main(_local_argv(tmp_path, source, today="2026-09-30"))
    assert code == 0
    assert set(calls) == {("1", 2025), ("9", 2025), ("10", 2025), ("11", 2025), ("12", 2025)}


def test_backfill_requests_history(tmp_path, monkeypatch):
    _freeze(monkeypatch)
    _forbid_aws(monkeypatch)
    source = tmp_path / "input.json"
    _write(source, {})
    calls = _stub(monkeypatch, default=EMPTY)
    code = snow.main(_local_argv(tmp_path, source, "--backfill"))
    expected = {
        (pass_id, year)
        for pass_id, start in FIRST_YEAR.items()
        for year in range(start, 2027)
    }
    assert code == 0
    assert set(calls) == expected
    assert len(calls) == 117
    assert ("11", 1999) in calls
    assert ("10", 2003) not in calls
    assert not (tmp_path / "out.json").exists()


def test_merge_keeps_seasons_and_records_metadata(tmp_path, monkeypatch):
    _freeze(monkeypatch)
    _forbid_aws(monkeypatch)
    source = tmp_path / "input.json"
    history = _history()
    history["Blewett_Pass_US-97"] = {"2010": copy.deepcopy(SEASONS["Blewett_Pass_US-97"])}
    _write(source, history)
    current = _current_body()
    responses = {(pass_id, 2026): current for _name, pass_id, _year in snow.PASSES}
    responses[("1", 2026)] = EMPTY
    calls = _stub(monkeypatch, responses)
    code = snow.main(_local_argv(tmp_path, source))
    assert code == 0
    assert set(calls) == CURRENT_IDS
    stored = json.loads((tmp_path / "out.json").read_text())
    meta = json.loads((tmp_path / "meta.json").read_text())
    assert stored["generatedAt"] == STAMP
    assert stored["Blewett_Pass_US-97"]["2010"] == SEASONS["Blewett_Pass_US-97"]
    assert "2026" not in stored["Blewett_Pass_US-97"]
    assert stored["lastDate"]["Blewett_Pass_US-97"] == "2010-11-02"
    for name, pass_id, _year in snow.PASSES:
        assert all(key.isdigit() for key in stored[name])
        if pass_id == "1":
            continue
        assert stored[name]["2015"] == history[name]["2015"]
        assert stored[name]["2026"] == current
        assert stored["lastDate"][name] == "2026-11-04"
    assert meta["source"] == snow.SOURCE_URL
    assert meta["generatedAt"] == STAMP
    assert meta["dataThrough"] == "2026-11-04"
    assert set(meta) == {"source", "version", "generatedAt", "dataThrough"}
    passes = {key: value for key, value in stored.items() if key not in snow.METADATA_KEYS}
    digest = hashlib.sha256(
        json.dumps(passes, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()
    assert meta["version"] == f"sha256:{digest}"
    assert (tmp_path / "snow-update.log").read_text().splitlines()[-1] == "changed"


def test_empty_response_does_not_delete_or_shrink(tmp_path, monkeypatch):
    _freeze(monkeypatch)
    _forbid_aws(monkeypatch)
    full = copy.deepcopy(SEASONS["Stevens_Pass_US-2"])
    short = copy.deepcopy(full)
    short[0]["dailySnowFall"] = short[0]["dailySnowFall"][:1]
    source = tmp_path / "input.json"
    history = _history()
    history["Blewett_Pass_US-97"]["2026"] = full
    before = _write(source, history)
    responses = {(pass_id, 2026): EMPTY for _name, pass_id, _year in snow.PASSES}
    responses[("1", 2026)] = short
    _stub(monkeypatch, responses)
    code = snow.main(_local_argv(tmp_path, source))
    assert code == 0
    _dataset_untouched(tmp_path, source, before)
    assert (tmp_path / "snow-update.log").read_text().splitlines()[-1] == "unchanged"


def test_longer_response_replaces_the_current_season(tmp_path, monkeypatch):
    _freeze(monkeypatch)
    _forbid_aws(monkeypatch)
    full = _current_body()
    short = copy.deepcopy(full)
    short[0]["dailySnowFall"] = short[0]["dailySnowFall"][:1]
    source = tmp_path / "input.json"
    history = _history()
    history["Stevens_Pass_US-2"]["2026"] = short
    _write(source, history)
    responses = {(pass_id, 2026): EMPTY for _name, pass_id, _year in snow.PASSES}
    responses[("10", 2026)] = full
    _stub(monkeypatch, responses)
    code = snow.main(_local_argv(tmp_path, source))
    assert code == 0
    stored = json.loads((tmp_path / "out.json").read_text())
    assert stored["Stevens_Pass_US-2"]["2015"] == history["Stevens_Pass_US-2"]["2015"]
    assert stored["Stevens_Pass_US-2"]["2026"] == full
    assert stored["lastDate"]["Stevens_Pass_US-2"] == "2026-11-04"


def test_checked_in_history_stays_record_equal(tmp_path, monkeypatch):
    _freeze(monkeypatch)
    _forbid_aws(monkeypatch)
    original_bytes = CHECKED_IN.read_bytes()
    original = json.loads(original_bytes)
    assert sum(len(seasons) for seasons in original.values()) == 112
    current = _current_body()
    calls = _stub(
        monkeypatch,
        {(pass_id, 2026): current for _name, pass_id, _year in snow.PASSES},
    )
    code = snow.main(_local_argv(tmp_path, CHECKED_IN))
    assert code == 0
    assert set(calls) == CURRENT_IDS
    assert CHECKED_IN.read_bytes() == original_bytes
    stored = json.loads((tmp_path / "out.json").read_text())
    for name, seasons in original.items():
        for year, records in seasons.items():
            assert stored[name][year] == records
        assert stored[name]["2026"] == current
    assert stored["generatedAt"] == STAMP
    assert set(stored["lastDate"]) == set(original)
    meta = json.loads((tmp_path / "meta.json").read_text())
    assert meta["dataThrough"] == max(stored["lastDate"].values())
    assert meta["source"] == snow.SOURCE_URL


def test_second_run_and_dry_run_do_not_rewrite(tmp_path, monkeypatch):
    _forbid_aws(monkeypatch)
    path = tmp_path / "pass_snowfall_data.json"
    history = _history()
    _write(path, history)
    current = _current_body()
    _stub(monkeypatch, {(pass_id, 2026): current for _name, pass_id, _year in snow.PASSES})
    dry = [
        "--input",
        str(path),
        "--output",
        str(path),
        "--log",
        str(tmp_path / "snow-update.log"),
        "--today",
        TODAY,
        "--retries",
        "0",
        "--dry-run",
    ]
    _freeze(monkeypatch, STAMP)
    before = path.read_bytes()
    assert snow.main(dry) == 0
    assert path.read_bytes() == before
    assert not (tmp_path / "meta.json").exists()
    assert not (tmp_path / "snow-update.log").exists()

    assert snow.main(dry[:-1]) == 0
    written = path.read_bytes()
    meta = (tmp_path / "meta.json").read_bytes()
    assert json.loads(written)["generatedAt"] == STAMP
    assert b"2026" in written

    _freeze(monkeypatch, "2026-11-18T09:00:00Z")
    assert snow.main(dry[:-1]) == 0
    assert path.read_bytes() == written
    assert (tmp_path / "meta.json").read_bytes() == meta
    assert json.loads(path.read_text())["Stevens_Pass_US-2"]["2015"] == history["Stevens_Pass_US-2"]["2015"]


@pytest.mark.parametrize(
    "problem",
    ["missing", "corrupt-input", "corrupt-body", "503", "outage", "one-pass", "date", "negative"],
)
def test_failure_writes_nothing(tmp_path, monkeypatch, capsys, problem):
    _freeze(monkeypatch)
    _forbid_aws(monkeypatch)
    source = tmp_path / "input.json"
    history = _history()
    current = _current_body()
    responses = {(pass_id, 2026): current for _name, pass_id, _year in snow.PASSES}
    fail = {}
    argv = _local_argv(tmp_path, source)
    before = None
    if problem == "missing":
        argv = _local_argv(tmp_path, tmp_path / "absent.json")
    else:
        before = _write(source, history)
        if problem == "corrupt-input":
            source.write_bytes(b"not-json")
            before = source.read_bytes()
        elif problem == "corrupt-body":
            responses[("1", 2026)] = b"not-json"
        elif problem == "503":
            fail[("1", 2026)] = urllib_error(503)
        elif problem == "outage":
            import urllib.error

            fail = {key: urllib.error.URLError("timed out") for key in CURRENT_IDS}
        elif problem == "one-pass":
            import urllib.error

            fail[("10", 2026)] = urllib.error.URLError("timed out")
        elif problem == "date":
            bad = copy.deepcopy(current)
            bad[0]["dailySnowFall"][0]["day"] = 32
            responses[("1", 2026)] = bad
        elif problem == "negative":
            bad = copy.deepcopy(current)
            bad[0]["dailySnowFall"][0]["newDailySnowFall"] = -1
            responses[("1", 2026)] = bad
    _stub(monkeypatch, responses, fail=fail)
    code = snow.main(argv)
    assert code == 1
    error = capsys.readouterr().err
    if problem == "missing":
        assert "missing input" in error
        assert [path.name for path in tmp_path.iterdir()] == ["snow-update.log"]
        assert "missing input" in (tmp_path / "snow-update.log").read_text()
        assert not (tmp_path / "out.json").exists()
        assert not (tmp_path / "meta.json").exists()
        return
    if problem == "corrupt-input":
        assert "corrupt JSON" in error
    elif problem == "corrupt-body":
        assert "corrupt JSON" in error
    elif problem == "503":
        assert "HTTP 503" in error
    elif problem in ("outage", "one-pass"):
        assert "WSDOT request failed" in error
    elif problem == "date":
        assert "invalid date" in error
    elif problem == "negative":
        assert "negative" in error
    _only(tmp_path, source, before)
    assert error.strip() in (tmp_path / "snow-update.log").read_text()


def test_dry_run_failure_writes_nothing(tmp_path, monkeypatch, capsys):
    _freeze(monkeypatch)
    _forbid_aws(monkeypatch)
    argv = _local_argv(tmp_path, tmp_path / "absent.json", "--dry-run")
    assert snow.main(argv) == 1
    assert "missing input" in capsys.readouterr().err
    assert list(tmp_path.iterdir()) == []


def test_retries_then_records_the_season(tmp_path, monkeypatch):
    _freeze(monkeypatch)
    _forbid_aws(monkeypatch)
    slept = []
    monkeypatch.setattr(snow.time, "sleep", slept.append)
    source = tmp_path / "input.json"
    _write(source, _history())
    current = _current_body()
    calls = []

    def urlopen(url, timeout=30):
        assert url.get_header("User-agent") == snow.USER_AGENT
        query = parse_qs(urlparse(url.full_url).query)
        key = (query["MountainPassId"][0], int(query["Year"][0]))
        calls.append(key)
        if key == ("1", 2026) and calls.count(key) == 1:
            raise urllib_error(503)
        return _Response(json.dumps(current).encode())

    monkeypatch.setattr(snow.urllib.request, "urlopen", urlopen)
    argv = _local_argv(tmp_path, source)
    argv[argv.index("--retries") + 1] = "1"
    assert snow.main(argv) == 0
    assert slept == [1]
    stored = json.loads((tmp_path / "out.json").read_text())
    assert stored["Blewett_Pass_US-97"]["2026"] == current


def test_persistent_503_backs_off(tmp_path, monkeypatch, capsys):
    _freeze(monkeypatch)
    _forbid_aws(monkeypatch)
    slept = []
    monkeypatch.setattr(snow.time, "sleep", slept.append)
    source = tmp_path / "input.json"
    before = _write(source, _history())
    _stub(monkeypatch, fail={key: urllib_error(503) for key in CURRENT_IDS})
    argv = _local_argv(tmp_path, source)
    argv[argv.index("--retries") + 1] = "2"
    assert snow.main(argv) == 1
    error = capsys.readouterr().err
    assert "HTTP 503" in error
    assert slept == [1, 2]
    _only(tmp_path, source, before)
    assert error.strip() in (tmp_path / "snow-update.log").read_text()


def test_access_denied_and_bad_s3_write_nothing(tmp_path, monkeypatch, moto_s3, capsys):
    _freeze(monkeypatch)
    distribution_id = _distribution()
    moto_s3.create_bucket(Bucket=BUCKET)
    original = {"Stevens_Pass_US-2": {"2015": SEASONS["Stevens_Pass_US-2"]}}
    moto_s3.put_object(Bucket=BUCKET, Key=KEY, Body=json.dumps(original).encode())
    before = _s3_bytes(moto_s3)
    saved = snow.aws_clients

    def denied():
        s3, cloudfront = saved()

        def get_object(**_kwargs):
            raise s3.exceptions.ClientError(
                {"Error": {"Code": "AccessDenied", "Message": "denied"}},
                "GetObject",
            )

        s3.get_object = get_object
        return s3, cloudfront

    monkeypatch.setattr(snow, "aws_clients", denied)
    _stub(monkeypatch, default=_current_body())
    code = snow.main(
        [
            "--upload",
            "--bucket",
            BUCKET,
            "--key",
            KEY,
            "--distribution-id",
            distribution_id,
            "--output",
            str(tmp_path / "out.json"),
            "--log",
            str(tmp_path / "snow-update.log"),
            "--today",
            TODAY,
            "--retries",
            "0",
        ]
    )
    assert code == 1
    error = capsys.readouterr().err
    assert "AccessDenied" in error
    assert _s3_bytes(moto_s3) == before
    assert _invalidation_paths(distribution_id) == []
    assert [path.name for path in tmp_path.iterdir()] == ["snow-update.log"]
    assert error.strip() in (tmp_path / "snow-update.log").read_text()
    assert not (tmp_path / "out.json").exists()
    assert not (tmp_path / "meta.json").exists()


@pytest.mark.parametrize("failure", ["missing", "corrupt"])
def test_s3_read_failure_writes_nothing(tmp_path, monkeypatch, moto_s3, capsys, failure):
    _freeze(monkeypatch)
    distribution_id = _distribution()
    moto_s3.create_bucket(Bucket=BUCKET)
    if failure == "corrupt":
        moto_s3.put_object(Bucket=BUCKET, Key=KEY, Body=b"not-json")
        before = _s3_bytes(moto_s3)
    output = tmp_path / "out.json"
    code = snow.main(
        [
            "--upload",
            "--bucket",
            BUCKET,
            "--key",
            KEY,
            "--distribution-id",
            distribution_id,
            "--output",
            str(output),
            "--log",
            str(tmp_path / "snow-update.log"),
            "--today",
            TODAY,
            "--retries",
            "0",
        ]
    )
    assert code == 1
    error = capsys.readouterr().err
    assert not output.exists()
    assert not (tmp_path / "meta.json").exists()
    assert error.strip() in (tmp_path / "snow-update.log").read_text()
    assert _invalidation_paths(distribution_id) == []
    if failure == "corrupt":
        assert "corrupt JSON" in error
        assert _s3_bytes(moto_s3) == before
    else:
        assert "could not read" in error


def test_upload_puts_only_after_the_flag_and_only_when_changed(tmp_path, monkeypatch, moto_s3):
    _freeze(monkeypatch)
    distribution_id = _distribution()
    moto_s3.create_bucket(Bucket=BUCKET)
    existing = {"Stevens_Pass_US-2": {"2015": copy.deepcopy(SEASONS["Stevens_Pass_US-2"])}}
    for name, _pass_id, _year in snow.PASSES:
        existing.setdefault(name, {"2015": copy.deepcopy(SEASONS["Stevens_Pass_US-2"])})
    moto_s3.put_object(Bucket=BUCKET, Key=KEY, Body=json.dumps(existing).encode())
    current = _current_body()
    _stub(monkeypatch, {(pass_id, 2026): current for _name, pass_id, _year in snow.PASSES})
    output = tmp_path / "out.json"
    argv = [
        "--upload",
        "--bucket",
        BUCKET,
        "--key",
        KEY,
        "--distribution-id",
        distribution_id,
        "--output",
        str(output),
        "--log",
        str(tmp_path / "snow-update.log"),
        "--today",
        TODAY,
        "--retries",
        "0",
    ]
    assert snow.main(argv) == 0
    stored = json.loads(_s3_bytes(moto_s3))
    assert stored["Stevens_Pass_US-2"]["2015"] == existing["Stevens_Pass_US-2"]["2015"]
    assert stored["Stevens_Pass_US-2"]["2026"] == current
    assert stored["generatedAt"] == STAMP
    assert stored["lastDate"]["Stevens_Pass_US-2"] == "2026-11-04"
    meta = json.loads(moto_s3.get_object(Bucket=BUCKET, Key="snow/meta.json")["Body"].read())
    assert meta["dataThrough"] == max(stored["lastDate"].values())
    assert meta["source"] == snow.SOURCE_URL
    headers = moto_s3.get_object(Bucket=BUCKET, Key=KEY)
    assert headers["ContentType"] == "application/json"
    assert headers["CacheControl"] == "max-age=3600"
    assert json.loads(output.read_text())["generatedAt"] == STAMP
    assert _invalidation_paths(distribution_id) == [["/" + KEY, "/snow/meta.json"]]

    _freeze(monkeypatch, "2026-11-18T09:00:00Z")
    first = _s3_bytes(moto_s3)
    assert snow.main(argv) == 0
    assert _s3_bytes(moto_s3) == first
    assert _invalidation_paths(distribution_id) == [["/" + KEY, "/snow/meta.json"]]
    assert output.read_bytes()  # local file still the first publish
    assert json.loads(output.read_text())["generatedAt"] == STAMP


def _assert_meta(meta, stored, generated_at):
    assert set(meta) == {"source", "version", "generatedAt", "dataThrough"}
    assert meta["source"] == snow.SOURCE_URL
    assert meta["generatedAt"] == generated_at
    assert meta["dataThrough"] == max(stored["lastDate"].values())
    passes = {key: value for key, value in stored.items() if key not in snow.METADATA_KEYS}
    digest = hashlib.sha256(
        json.dumps(passes, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()
    assert meta["version"] == f"sha256:{digest}"


def test_next_run_writes_meta_when_snowfall_was_replaced(tmp_path, monkeypatch, capsys):
    _freeze(monkeypatch)
    _forbid_aws(monkeypatch)
    path = tmp_path / "pass_snowfall_data.json"
    _write(path, _history())
    _stub(monkeypatch, {(pass_id, 2026): _current_body() for _name, pass_id, _year in snow.PASSES})
    original = snow.write_text

    def fail_meta(target, text):
        if target.name == "meta.json":
            raise OSError("disk full")
        original(target, text)

    monkeypatch.setattr(snow, "write_text", fail_meta)
    argv = [
        "--input",
        str(path),
        "--output",
        str(path),
        "--log",
        str(tmp_path / "snow-update.log"),
        "--today",
        TODAY,
        "--retries",
        "0",
    ]
    assert snow.main(argv) == 1
    error = capsys.readouterr().err
    assert "could not write output" in error
    written = path.read_bytes()
    stored = json.loads(written)
    assert stored["generatedAt"] == STAMP
    assert "2026" in stored["Stevens_Pass_US-2"]
    assert not (tmp_path / "meta.json").exists()
    assert error.strip() in (tmp_path / "snow-update.log").read_text()

    monkeypatch.setattr(snow, "write_text", original)
    _freeze(monkeypatch, "2026-11-18T09:00:00Z")
    assert snow.main(argv) == 0
    assert path.read_bytes() == written
    _assert_meta(json.loads((tmp_path / "meta.json").read_text()), stored, "2026-11-18T09:00:00Z")
    assert (tmp_path / "snow-update.log").read_text().splitlines()[-1] == "unchanged"


def test_next_upload_writes_meta_when_snowfall_was_replaced(tmp_path, monkeypatch, moto_s3, capsys):
    _freeze(monkeypatch)
    distribution_id = _distribution()
    moto_s3.create_bucket(Bucket=BUCKET)
    moto_s3.put_object(Bucket=BUCKET, Key=KEY, Body=json.dumps(_history()).encode())
    _stub(monkeypatch, {(pass_id, 2026): _current_body() for _name, pass_id, _year in snow.PASSES})
    saved = snow.aws_clients
    state = {"fail_meta": True}

    def clients():
        s3, cloudfront = saved()
        if not state["fail_meta"]:
            return s3, cloudfront
        original = s3.put_object

        def put_object(**kwargs):
            if kwargs.get("Key") == "snow/meta.json":
                raise s3.exceptions.ClientError(
                    {"Error": {"Code": "InternalError", "Message": "meta failed"}},
                    "PutObject",
                )
            return original(**kwargs)

        s3.put_object = put_object
        return s3, cloudfront

    monkeypatch.setattr(snow, "aws_clients", clients)
    argv = [
        "--upload",
        "--bucket",
        BUCKET,
        "--key",
        KEY,
        "--distribution-id",
        distribution_id,
        "--log",
        str(tmp_path / "snow-update.log"),
        "--today",
        TODAY,
        "--retries",
        "0",
    ]
    assert snow.main(argv) == 1
    error = capsys.readouterr().err
    assert "upload failed" in error
    written = _s3_bytes(moto_s3)
    stored = json.loads(written)
    assert stored["generatedAt"] == STAMP
    assert "2026" in stored["Stevens_Pass_US-2"]
    with pytest.raises(moto_s3.exceptions.ClientError):
        moto_s3.get_object(Bucket=BUCKET, Key="snow/meta.json")
    assert _invalidation_paths(distribution_id) == []
    assert error.strip() in (tmp_path / "snow-update.log").read_text()
    assert [path.name for path in tmp_path.iterdir()] == ["snow-update.log"]

    state["fail_meta"] = False
    _freeze(monkeypatch, "2026-11-18T09:00:00Z")
    assert snow.main(argv) == 0
    assert _s3_bytes(moto_s3) == written
    meta_object = moto_s3.get_object(Bucket=BUCKET, Key="snow/meta.json")
    _assert_meta(json.loads(meta_object["Body"].read()), stored, "2026-11-18T09:00:00Z")
    assert meta_object["ContentType"] == "application/json"
    assert meta_object["CacheControl"] == "max-age=3600"
    assert _invalidation_paths(distribution_id) == [["/" + KEY, "/snow/meta.json"]]


def test_without_upload_does_not_call_aws(tmp_path, monkeypatch):
    _freeze(monkeypatch)
    _forbid_aws(monkeypatch)
    source = tmp_path / "input.json"
    _write(source, _history())
    _stub(monkeypatch, {(pass_id, 2026): _current_body() for _name, pass_id, _year in snow.PASSES})
    assert snow.main(_local_argv(tmp_path, source)) == 0
    assert (tmp_path / "out.json").exists()
