#!/usr/bin/env bash
# Sets up the node layout, the bucket and a fixed access key. Safe to re-run.
set -euo pipefail
cd "$(dirname "$0")"

BUCKET=sscrub-dev
KEY_NAME=sscrub-dev
KEY_ID=GK672e7685ba517588f0ca3ec7
KEY_SECRET=3c9ae988d81337826dcb5e67d916d1daf72fcd3ce3d2ca1fe4f00550c0b900ce
# Frontend origin allowed to upload parts directly to the bucket
CORS_ORIGIN=${CORS_ORIGIN:-http://localhost:5201}

garage() { docker compose exec -T garage /garage "$@"; }

# The garage CLI can't set CORS, so use the S3 API. Falls back to the aws-cli image if aws isn't installed.
s3api() {
  local env=(AWS_ACCESS_KEY_ID="$KEY_ID" AWS_SECRET_ACCESS_KEY="$KEY_SECRET"
             AWS_REGION=us-east-1 AWS_ENDPOINT_URL=http://localhost:3900)
  if command -v aws >/dev/null; then
    env "${env[@]}" aws s3api "$@"
  else
    docker run --rm --network host "${env[@]/#/-e}" docker.io/amazon/aws-cli s3api "$@"
  fi
}

until garage status >/dev/null 2>&1; do sleep 1; done

if garage layout show | grep -q "No nodes currently have a role"; then
  node_id=$(garage node id -q | cut -d@ -f1)
  garage layout assign -z dc1 -c 1G "$node_id"
  garage layout apply --version 1
fi

garage bucket info "$BUCKET" >/dev/null 2>&1 || garage bucket create "$BUCKET"
garage key info "$KEY_NAME" >/dev/null 2>&1 || garage key import --yes -n "$KEY_NAME" "$KEY_ID" "$KEY_SECRET"
garage bucket allow --read --write --owner "$BUCKET" --key "$KEY_NAME"

# ETag must be exposed so the browser can read it from part uploads to complete multipart uploads
s3api put-bucket-cors --bucket "$BUCKET" --cors-configuration "{
  \"CORSRules\": [{
    \"AllowedOrigins\": [\"$CORS_ORIGIN\"],
    \"AllowedMethods\": [\"PUT\", \"GET\", \"HEAD\"],
    \"AllowedHeaders\": [\"*\"],
    \"ExposeHeaders\": [\"ETag\"],
    \"MaxAgeSeconds\": 3600
  }]
}"

cat <<INFO

Garage is ready.
  endpoint:   http://localhost:3900
  region:     us-east-1
  bucket:     $BUCKET
  access key: $KEY_ID
  secret key: $KEY_SECRET
  cors:       $CORS_ORIGIN
INFO
