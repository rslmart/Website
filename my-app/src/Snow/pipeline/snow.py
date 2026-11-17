"""Merge WSDOT mountain-pass snowfall into the published season map.

One command, standard library only:

    python -m Snow.pipeline.snow --input EXISTING.json --output UPDATED.json

``--current`` is the default. It requests the active season for each of the
five passes. ``--backfill`` requests each pass from its first year of record
through that season. Point ``--input`` at the dataset being updated (the same
path as ``--output`` for a local file). A run writes that output and a
sibling ``meta.json`` only when the season records changed. ``--dry-run``
writes nothing. ``--upload`` is required before any S3 or CloudFront call.

``generatedAt`` and ``lastDate`` sit beside the pass map. Season keys stay
years, which is the shape the page already walks. ``lastDate`` is one ISO
date per pass. A failed read, fetch, or validation writes nothing.
"""

import argparse
import datetime
import hashlib
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

SOURCE_URL = (
    "https://wsdot.com/Travel/Real-time/Service/api/MountainPass/SnowFallData"
)
USER_AGENT = "makoa-snow-updater/1.0 (+https://makoa.link/Snow)"
DEFAULT_OBJECT_KEY = "snow/pass_snowfall_data.json"
ACCUMULATED_TOLERANCE = 0.05
METADATA_KEYS = ("generatedAt", "lastDate")
RETRYABLE_STATUS = {429, 500, 502, 503, 504}

# name, WSDOT MountainPassId, first season start year.
PASSES = (
    ("Blewett_Pass_US-97", "1", 2005),
    ("Sherman_Pass_SR-20", "9", 2005),
    ("Stevens_Pass_US-2", "10", 2004),
    ("Snoqualmie_Pass_I-90", "11", 1999),
    ("White_Pass_US-12", "12", 2005),
)

MONTHS = {
    "Jan": 1,
    "Feb": 2,
    "Mar": 3,
    "Apr": 4,
    "May": 5,
    "Jun": 6,
    "Jul": 7,
    "Aug": 8,
    "Sep": 9,
    "Oct": 10,
    "Nov": 11,
    "Dec": 12,
}


class SnowError(Exception):
    """A read, fetch, or validation failure. The run writes nothing."""


def current_season(today=None):
    """WSDOT Year for the active season.

    Season N runs from October N through the following summer, so October
    onward uses the calendar year and earlier months use the previous year.
    """
    today = today or datetime.date.today()
    return today.year if today.month >= 10 else today.year - 1


def now():
    return datetime.datetime.now(datetime.timezone.utc)


def _stamp(moment):
    return moment.astimezone(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def years_for(first_year, season, backfill):
    if not backfill:
        return (season,)
    if season < first_year:
        return ()
    return tuple(range(first_year, season + 1))


def request_plan(today, backfill):
    season = current_season(today)
    plan = []
    for name, pass_id, first_year in PASSES:
        for year in years_for(first_year, season, backfill):
            plan.append((name, pass_id, year))
    return season, plan


def _number(value, label):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise SnowError(f"{label} is not a number")
    if value < 0:
        raise SnowError(f"{label} is negative")
    return value


def validate_season(body, pass_name, year):
    """Reject a bad WSDOT season. An empty list means no data yet."""
    if body == []:
        return
    if not isinstance(body, list):
        raise SnowError(f"{pass_name} {year} is not a season list")
    points = []
    for month_index, month in enumerate(body):
        if not isinstance(month, dict):
            raise SnowError(f"invalid date for {pass_name} {year}")
        name = month.get("month")
        month_num = month.get("monthNum")
        month_year = month.get("year")
        where = f"{pass_name} {year} month {month_index}"
        if name not in MONTHS or month_num != MONTHS[name]:
            raise SnowError(f"invalid date for {where}")
        if isinstance(month_year, bool) or not isinstance(month_year, int):
            raise SnowError(f"invalid date for {where}")
        for field in ("avgNewSnowfallInches", "avgTotalSnowfallInches"):
            if month.get(field) is not None:
                _number(month[field], f"{where} {field}")
        days = month.get("dailySnowFall")
        if not isinstance(days, list):
            raise SnowError(f"invalid date for {where}")
        for day in days:
            if not isinstance(day, dict):
                raise SnowError(f"invalid date for {where}")
            day_num = day.get("day")
            if isinstance(day_num, bool) or not isinstance(day_num, int):
                raise SnowError(f"invalid date for {where}")
            try:
                observed = datetime.date(month_year, MONTHS[name], day_num)
            except ValueError as err:
                raise SnowError(f"invalid date for {where}") from err
            accumulated = _number(
                day.get("accumulatedSnowFall"), f"{where} accumulatedSnowFall"
            )
            _number(day.get("newDailySnowFall"), f"{where} newDailySnowFall")
            _number(day.get("totalSnowFall"), f"{where} totalSnowFall")
            points.append((observed, accumulated))
    previous = None
    for observed, accumulated in sorted(points):
        if previous is not None and accumulated < previous - ACCUMULATED_TOLERANCE:
            raise SnowError(
                f"accumulatedSnowFall decreased for {pass_name} {year} on {observed}"
            )
        previous = accumulated


def fetch_season(pass_id, year, retries):
    url = f"{SOURCE_URL}?MountainPassId={pass_id}&Year={year}"
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    attempt = 0
    while True:
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                raw = response.read()
            try:
                return json.loads(raw.decode("utf-8"))
            except (UnicodeDecodeError, json.JSONDecodeError) as err:
                raise SnowError(f"corrupt JSON for pass {pass_id} year {year}") from err
        except SnowError:
            raise
        except urllib.error.HTTPError as err:
            if err.code in RETRYABLE_STATUS and attempt < retries:
                time.sleep(min(8, 2**attempt))
                attempt += 1
                continue
            raise SnowError(f"WSDOT HTTP {err.code} for pass {pass_id} year {year}") from err
        except urllib.error.URLError as err:
            if attempt < retries:
                time.sleep(min(8, 2**attempt))
                attempt += 1
                continue
            raise SnowError(
                f"WSDOT request failed for pass {pass_id} year {year}: {err.reason}"
            ) from err


def parse_document(raw):
    try:
        data = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as err:
        raise SnowError(f"corrupt JSON: {err}") from err
    if not isinstance(data, dict):
        raise SnowError("corrupt JSON: input must be an object")
    passes = {}
    for key, value in data.items():
        if key in METADATA_KEYS:
            continue
        if not isinstance(value, dict):
            raise SnowError(f"corrupt JSON: {key} is not a pass")
        for season_year, season in value.items():
            if not isinstance(season, list):
                raise SnowError(f"corrupt JSON: {key} {season_year} is not a season list")
        passes[key] = dict(value)
    return passes


def read_local(path):
    if not path.is_file():
        raise SnowError(f"missing input: {path}")
    try:
        return path.read_bytes()
    except OSError as err:
        raise SnowError(f"missing input: {path}: {err}") from err


def aws_clients():
    """S3 and CloudFront clients. Imported only when ``--upload`` is set."""
    try:
        import boto3
    except ImportError as err:
        raise SnowError("boto3 is required for --upload") from err
    return (
        boto3.client("s3", region_name="us-east-1"),
        boto3.client("cloudfront", region_name="us-east-1"),
    )


def read_s3(bucket, key):
    s3, _cloudfront = aws_clients()
    try:
        obj = s3.get_object(Bucket=bucket, Key=key)
        return obj["Body"].read()
    except Exception as err:
        code = ""
        response = getattr(err, "response", None)
        if isinstance(response, dict):
            code = response.get("Error", {}).get("Code", "")
        detail = code or err
        raise SnowError(f"could not read s3://{bucket}/{key}: {detail}") from err


def daily_count(season):
    total = 0
    for month in season:
        days = month.get("dailySnowFall") if isinstance(month, dict) else None
        if isinstance(days, list):
            total += len(days)
    return total


def merge_passes(existing, fetched):
    """Add fetched seasons. Never delete a season or replace it with a shorter one.

    A WSDOT ``[]`` is no data yet: it does not create a season key and it
    does not remove one that is already stored.
    """
    merged = {name: dict(seasons) for name, seasons in existing.items()}
    for name, year, body in fetched:
        if body == []:
            continue
        seasons = merged.setdefault(name, {})
        key = str(year)
        if key not in seasons or daily_count(body) >= daily_count(seasons[key]):
            seasons[key] = body
    return merged


def pass_last_date(seasons):
    latest = None
    for season in seasons.values():
        if not isinstance(season, list):
            continue
        for month in season:
            if not isinstance(month, dict):
                continue
            try:
                year = month["year"]
                month_num = month["monthNum"]
            except KeyError:
                continue
            for day in month.get("dailySnowFall") or []:
                if not isinstance(day, dict):
                    continue
                try:
                    observed = datetime.date(int(year), int(month_num), int(day["day"]))
                except (KeyError, TypeError, ValueError):
                    continue
                if latest is None or observed > latest:
                    latest = observed
    if latest is None:
        return None
    return latest.isoformat()


def canonical(passes):
    return json.dumps(passes, sort_keys=True, separators=(",", ":"))


def version_of(passes):
    digest = hashlib.sha256(canonical(passes).encode("utf-8")).hexdigest()
    return f"sha256:{digest}"


def build_document(passes, generated_at):
    last_date = {}
    for name, seasons in passes.items():
        stamp = pass_last_date(seasons)
        if stamp:
            last_date[name] = stamp
    document = {"generatedAt": generated_at, "lastDate": last_date}
    document.update(passes)
    return document


def meta_document(passes, generated_at):
    dates = [stamp for stamp in (pass_last_date(seasons) for seasons in passes.values()) if stamp]
    if not dates:
        raise SnowError("no observation date to record")
    return {
        "source": SOURCE_URL,
        "version": version_of(passes),
        "generatedAt": generated_at,
        "dataThrough": max(dates),
    }


def render(document):
    return json.dumps(document, indent=4) + "\n"


def meta_key_for(object_key):
    parent, _separator, _name = object_key.rpartition("/")
    return f"{parent}/meta.json" if parent else "meta.json"


def upload(bucket, key, document_text, meta_text, distribution_id):
    s3, cloudfront = aws_clients()
    meta_key = meta_key_for(key)
    body = {
        "ContentType": "application/json",
        "CacheControl": "max-age=3600",
    }
    try:
        s3.put_object(Bucket=bucket, Key=key, Body=document_text.encode("utf-8"), **body)
        s3.put_object(Bucket=bucket, Key=meta_key, Body=meta_text.encode("utf-8"), **body)
        cloudfront.create_invalidation(
            DistributionId=distribution_id,
            InvalidationBatch={
                "Paths": {
                    "Quantity": 2,
                    "Items": ["/" + key, "/" + meta_key],
                },
                "CallerReference": str(time.time_ns()),
            },
        )
    except Exception as err:
        raise SnowError(f"upload failed: {err}") from err


def write_text(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".tmp")
    try:
        temporary.write_text(text, encoding="utf-8")
        os.replace(temporary, path)
    finally:
        if temporary.exists():
            temporary.unlink()


def _log_path(args):
    if args.log:
        return args.log
    if args.output:
        return args.output.parent / "snow-update.log"
    return Path("snow-update.log")


def execute(args, log):
    today = args.today or datetime.date.today()
    backfill = bool(args.backfill)
    if args.upload and not args.dry_run:
        if not args.bucket or not args.distribution_id:
            raise SnowError("--upload needs --bucket and --distribution-id")
    if args.dry_run or not args.upload:
        if not args.input:
            raise SnowError("missing input: --input is required")
        if not args.dry_run and not args.upload and not args.output:
            raise SnowError("--output is required")
        raw = read_local(args.input)
    elif args.input:
        raw = read_local(args.input)
    else:
        raw = read_s3(args.bucket, args.key)
    existing = parse_document(raw)
    season, plan = request_plan(today, backfill)
    mode = "backfill" if backfill else "current"
    log.append(f"{mode} season {season}: {len(plan)} requests")
    fetched = []
    for name, pass_id, year in plan:
        try:
            body = fetch_season(pass_id, year, args.retries)
            validate_season(body, name, year)
        except SnowError as err:
            raise SnowError(f"{name} {year}: {err}") from err
        fetched.append((name, year, body))
    merged = merge_passes(existing, fetched)
    changed = canonical(existing) != canonical(merged)
    generated_at = _stamp(now())
    document = build_document(merged, generated_at)
    meta = meta_document(merged, generated_at) if changed else None
    log.append("changed" if changed else "unchanged")
    return changed, document, meta


def _write_outputs(args, document, meta):
    document_text = render(document)
    meta_text = render(meta)
    try:
        if args.upload:
            upload(args.bucket, args.key, document_text, meta_text, args.distribution_id)
        if args.output:
            write_text(args.output, document_text)
            write_text(args.output.parent / "meta.json", meta_text)
    except SnowError:
        raise
    except OSError as err:
        raise SnowError(f"could not write output: {err}") from err


def main(argv=None):
    parser = argparse.ArgumentParser(prog="snow")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument(
        "--current",
        action="store_true",
        help="request the active season for each pass (default)",
    )
    mode.add_argument(
        "--backfill",
        action="store_true",
        help="request every recorded season through the active one",
    )
    parser.add_argument("--input", type=Path, help="existing snowfall JSON to update")
    parser.add_argument("--output", type=Path, help="merged snowfall JSON")
    parser.add_argument("--log", type=Path, help="log file, written only after a run that can publish")
    parser.add_argument("--today", type=datetime.date.fromisoformat)
    parser.add_argument("--dry-run", action="store_true", help="write nothing")
    parser.add_argument(
        "--upload",
        action="store_true",
        help="read and write S3, then invalidate CloudFront",
    )
    parser.add_argument("--bucket")
    parser.add_argument("--key", default=DEFAULT_OBJECT_KEY)
    parser.add_argument("--distribution-id")
    parser.add_argument("--retries", type=int, default=3)
    args = parser.parse_args(argv)
    if args.retries < 0:
        print("--retries must be zero or greater", file=sys.stderr)
        return 1
    log = []
    try:
        changed, document, meta = execute(args, log)
        if args.dry_run:
            return 0
        if changed:
            _write_outputs(args, document, meta)
        write_text(_log_path(args), "\n".join(log) + "\n")
    except SnowError as err:
        print(str(err), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
