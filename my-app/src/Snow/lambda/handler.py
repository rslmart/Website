"""Daily in-season updater for the WA Snowfall page.

Fetches the current WSDOT season for every tracked pass, merges it into the
JSON object the site serves from S3, then invalidates the CloudFront path so
the update is visible immediately.

Uses only the Python standard library plus boto3 (preinstalled in the AWS
Lambda Python runtime), so there is nothing to package.

Configured via environment variables:
  BUCKET_NAME      S3 bucket the site is served from (required)
  OBJECT_KEY       key of the JSON object (default: snow/pass_snowfall_data.json)
  DISTRIBUTION_ID  CloudFront distribution id to invalidate (required)
"""

import datetime
import json
import os
import time
import urllib.request

import boto3

DEFAULT_OBJECT_KEY = "snow/pass_snowfall_data.json"

passId = {
    "Blewett_Pass_US-97": "1",
    "Sherman_Pass_SR-20": "9",
    "Stevens_Pass_US-2": "10",
    "Snoqualmie_Pass_I-90": "11",
    "White_Pass_US-12": "12",
}


def current_season(today=None):
    """WSDOT 'Year' for the active season.

    A season labelled N runs Oct(N) -> May(N+1), so from October onward the
    season is the current year; before October it is the previous year.
    """
    today = today or datetime.date.today()
    return today.year if today.month >= 10 else today.year - 1


def fetch_season(pass_id, year):
    url = (
        "https://wsdot.com/Travel/Real-time/Service/api/MountainPass/"
        f"SnowFallData?MountainPassId={pass_id}&Year={year}"
    )
    with urllib.request.urlopen(url, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def load_existing(s3, bucket, key):
    try:
        obj = s3.get_object(Bucket=bucket, Key=key)
        return json.loads(obj["Body"].read().decode("utf-8"))
    except s3.exceptions.NoSuchKey:
        return {}
    except Exception as err:  # noqa: BLE001 - start fresh on any read failure
        print(f"could not read s3://{bucket}/{key}: {err}")
        return {}


def handler(event, context):
    bucket = os.environ["BUCKET_NAME"]
    key = os.environ.get("OBJECT_KEY", DEFAULT_OBJECT_KEY)
    distribution_id = os.environ["DISTRIBUTION_ID"]

    season = current_season()
    s3 = boto3.client("s3")
    data = load_existing(s3, bucket, key)

    updated = 0
    for pass_name, pass_id in passId.items():
        try:
            season_data = fetch_season(pass_id, season)
        except Exception as err:  # noqa: BLE001 - skip a failing pass, keep going
            print(f"failed {pass_name} {season}: {err}")
            continue
        data.setdefault(pass_name, {})[str(season)] = season_data
        updated += 1

    s3.put_object(
        Bucket=bucket,
        Key=key,
        Body=json.dumps(data, indent=4).encode("utf-8"),
        ContentType="application/json",
        CacheControl="max-age=3600",
    )

    cloudfront = boto3.client("cloudfront")
    cloudfront.create_invalidation(
        DistributionId=distribution_id,
        InvalidationBatch={
            "Paths": {"Quantity": 1, "Items": ["/" + key]},
            "CallerReference": str(time.time()),
        },
    )

    result = {"season": season, "passesUpdated": updated, "bucket": bucket, "key": key}
    print(json.dumps(result))
    return result


if __name__ == "__main__":
    handler({}, None)
