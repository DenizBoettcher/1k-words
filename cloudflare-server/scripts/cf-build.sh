#!/usr/bin/env bash
# Build step for Cloudflare Workers Builds.
# Set this ONE line as the "Build command" in the dashboard:
#     bash scripts/cf-build.sh
# Root directory stays "cloudflare-server".
#
# Needs a build variable D1_DATABASE_ID (the id from `wrangler d1 create 1k-words`).
set -euo pipefail

echo "→ Generating wrangler.jsonc from example"
if [ -z "${D1_DATABASE_ID:-}" ]; then
  echo "!! D1_DATABASE_ID build variable is not set" >&2
  exit 1
fi
sed "s/local-placeholder/${D1_DATABASE_ID}/" wrangler.jsonc.example > wrangler.jsonc

echo "→ Building web client"
( cd ../client && npm ci && npm run build )

echo "→ Generating Prisma client"
npm ci
npx prisma generate

echo "✓ Build complete"
