# WA Snowfall daily updater (Lambda + EventBridge)

Keeps the live WA Snowfall page current during ski season. Once a day the
Lambda:

1. Fetches the current WSDOT season for each tracked pass.
2. Merges it into the JSON object the site serves from S3
   (`snow/pass_snowfall_data.json`).
3. Creates a CloudFront invalidation for that path so the update shows
   immediately.

The frontend ([../SnowPage.jsx](../SnowPage.jsx)) fetches this object at
runtime, so no site rebuild/redeploy is needed for a data refresh.

## Files

- `handler.py` — the function. Standard library + `boto3` only (boto3 is
  preinstalled in the Lambda Python runtime), so there are no dependencies to
  package.
- `template.yaml` — AWS SAM template: the function, a daily EventBridge
  schedule, and a least-privilege IAM policy (`s3:GetObject`/`s3:PutObject` on
  the one object + `cloudfront:CreateInvalidation` on the distribution).

## Deploy

Requires the [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html)
and AWS credentials.

```bash
cd src/Snow/lambda
sam build
sam deploy --guided
```

`--guided` will prompt for the three parameters (saved to
`samconfig.toml` for subsequent `sam deploy` runs):

| Parameter        | What to enter                                              |
|------------------|-----------------------------------------------------------|
| `BucketName`     | The S3 bucket the site is served from.                    |
| `ObjectKey`      | Leave as `snow/pass_snowfall_data.json` unless you moved it. |
| `DistributionId` | The CloudFront distribution id serving the site.          |

## Schedule

Defaults to `cron(0 15 * * ? *)` (15:00 UTC daily, roughly 7-8am Pacific).
Change the `Schedule` in `template.yaml` and redeploy to adjust. It runs
year-round; in the off-season it simply re-writes the last completed season,
which is a no-op for the data.

## Test

```bash
# Local dry run (needs AWS creds + the three env vars set):
BUCKET_NAME=your-bucket DISTRIBUTION_ID=EXXXX python handler.py

# Or invoke the deployed function:
aws lambda invoke --function-name wa-snowfall-daily-updater /dev/stdout
```
