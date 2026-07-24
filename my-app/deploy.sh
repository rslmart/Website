#!/usr/bin/env bash
#
# Build the site and deploy it to S3 + invalidate CloudFront.
#
# Configuration (set via environment or a gitignored my-app/.env.deploy file):
#   S3_BUCKET                   (required) target bucket name, e.g. my-site-bucket
#   CLOUDFRONT_DISTRIBUTION_ID  (required) distribution to invalidate, e.g. E1234ABCDEF
#   AWS_PROFILE                 (optional) named AWS CLI profile to use
#   AWS_REGION                  (optional) bucket region, defaults to us-east-1
#   BUILD_PATH                  (optional) build output dir, defaults to "build"
#
# Usage:
#   ./deploy.sh                 build, sync, invalidate
#   ./deploy.sh --skip-build    deploy the existing build/ without rebuilding
#   ./deploy.sh --dry-run       show what would be uploaded/deleted, change nothing
#   ./deploy.sh --yes           skip the confirmation prompt
#   ./deploy.sh --help
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

DRY_RUN=false
SKIP_BUILD=false
ASSUME_YES=false

for arg in "$@"; do
    case "$arg" in
        --dry-run)    DRY_RUN=true ;;
        --skip-build) SKIP_BUILD=true ;;
        --yes|-y)     ASSUME_YES=true ;;
        -h|--help)
            sed -n '2,18p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
            exit 0
            ;;
        *)
            echo "Unknown option: $arg (try --help)" >&2
            exit 1
            ;;
    esac
done

# Load local, gitignored config if present.
if [[ -f .env.deploy ]]; then
    set -a
    # shellcheck disable=SC1091
    source .env.deploy
    set +a
fi

: "${S3_BUCKET:?Missing S3_BUCKET. Set it in my-app/.env.deploy (see .env.deploy.example).}"
: "${CLOUDFRONT_DISTRIBUTION_ID:?Missing CLOUDFRONT_DISTRIBUTION_ID. Set it in my-app/.env.deploy (see .env.deploy.example).}"

BUILD_DIR="${BUILD_PATH:-build}"
AWS_REGION="${AWS_REGION:-us-east-1}"

# Shared AWS CLI flags (profile is optional).
AWS_ARGS=()
[[ -n "${AWS_PROFILE:-}" ]] && AWS_ARGS+=(--profile "$AWS_PROFILE")

DRY_RUN_ARG=()
$DRY_RUN && DRY_RUN_ARG+=(--dryrun)

command -v aws >/dev/null 2>&1 || { echo "Error: aws CLI not found. Install it: https://aws.amazon.com/cli/" >&2; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "Error: npm not found." >&2; exit 1; }

echo "Verifying AWS credentials..."
if ! aws sts get-caller-identity "${AWS_ARGS[@]}" >/dev/null 2>&1; then
    echo "Error: AWS credentials are not configured or the profile is invalid." >&2
    echo "Configure with 'aws configure'${AWS_PROFILE:+ --profile $AWS_PROFILE} or set AWS_PROFILE." >&2
    exit 1
fi

echo
echo "  Bucket:       s3://$S3_BUCKET"
echo "  Distribution: $CLOUDFRONT_DISTRIBUTION_ID"
echo "  Region:       $AWS_REGION"
echo "  Profile:      ${AWS_PROFILE:-<default>}"
echo "  Build dir:    $BUILD_DIR"
$DRY_RUN && echo "  Mode:         DRY RUN (no changes will be made)"
echo

if ! $ASSUME_YES && ! $DRY_RUN; then
    read -r -p "Deploy to the above bucket/distribution? [y/N] " reply
    [[ "$reply" =~ ^[Yy]$ ]] || { echo "Aborted."; exit 0; }
fi

# 1. Build (unless skipped).
if $SKIP_BUILD; then
    echo "Skipping build (--skip-build)."
else
    echo "Building production bundle..."
    npm run build
fi

if [[ ! -d "$BUILD_DIR" ]]; then
    echo "Error: build directory '$BUILD_DIR' does not exist. Run without --skip-build." >&2
    exit 1
fi

# 2. Upload fingerprinted assets first with a long, immutable cache. These
#    filenames change on every content change, so they are safe to cache forever.
echo "Uploading hashed assets (immutable cache)..."
aws s3 sync "$BUILD_DIR/assets" "s3://$S3_BUCKET/assets" \
    --delete \
    --cache-control "public, max-age=31536000, immutable" \
    "${DRY_RUN_ARG[@]}" "${AWS_ARGS[@]}" --region "$AWS_REGION"

# 3. Upload everything else with a short cache (favicons, manifest, and the
#    non-hashed data files under hurricane/, royalty/, snow/, tectonics/).
#    NOTE: deliberately NO --delete here. The bucket also hosts large,
#    externally-managed content that is not produced by the build (e.g. the
#    hurricane-ir/ satellite imagery uploaded by the data pipeline). A root-level
#    --delete would erase all of it, so we only ever add/update at the root.
echo "Uploading remaining files (short cache)..."
aws s3 sync "$BUILD_DIR" "s3://$S3_BUCKET" \
    --exclude "assets/*" \
    --exclude "index.html" \
    --cache-control "public, max-age=3600" \
    "${DRY_RUN_ARG[@]}" "${AWS_ARGS[@]}" --region "$AWS_REGION"

# 4. Upload index.html last, never cached, so new deploys are picked up instantly.
echo "Uploading index.html (no-cache)..."
aws s3 cp "$BUILD_DIR/index.html" "s3://$S3_BUCKET/index.html" \
    --cache-control "no-cache, no-store, must-revalidate" \
    --content-type "text/html" \
    "${DRY_RUN_ARG[@]}" "${AWS_ARGS[@]}" --region "$AWS_REGION"

if $DRY_RUN; then
    echo
    echo "Dry run complete. No CloudFront invalidation was created."
    exit 0
fi

# 5. Invalidate the CloudFront cache (global service, no --region).
echo "Creating CloudFront invalidation..."
INVALIDATION_ID=$(aws cloudfront create-invalidation \
    --distribution-id "$CLOUDFRONT_DISTRIBUTION_ID" \
    --paths "/*" \
    --query 'Invalidation.Id' --output text \
    "${AWS_ARGS[@]}")

echo
echo "Deploy complete."
echo "  CloudFront invalidation: $INVALIDATION_ID (may take a few minutes to finish)"
