#!/usr/bin/env bash
# Sets up the node layout, the bucket and a fixed access key. Safe to re-run.
set -euo pipefail
cd "$(dirname "$0")"

BUCKET=sscrub-dev
KEY_NAME=sscrub-dev
KEY_ID=GK672e7685ba517588f0ca3ec7
KEY_SECRET=3c9ae988d81337826dcb5e67d916d1daf72fcd3ce3d2ca1fe4f00550c0b900ce

garage() { docker compose exec -T garage /garage "$@"; }

until garage status >/dev/null 2>&1; do sleep 1; done

if garage layout show | grep -q "No nodes currently have a role"; then
  node_id=$(garage node id -q | cut -d@ -f1)
  garage layout assign -z dc1 -c 1G "$node_id"
  garage layout apply --version 1
fi

garage bucket info "$BUCKET" >/dev/null 2>&1 || garage bucket create "$BUCKET"
garage key info "$KEY_NAME" >/dev/null 2>&1 || garage key import --yes -n "$KEY_NAME" "$KEY_ID" "$KEY_SECRET"
garage bucket allow --read --write --owner "$BUCKET" --key "$KEY_NAME"

cat <<INFO

Garage is ready.
  endpoint:   http://localhost:3900
  region:     us-east-1
  bucket:     $BUCKET
  access key: $KEY_ID
  secret key: $KEY_SECRET
INFO
