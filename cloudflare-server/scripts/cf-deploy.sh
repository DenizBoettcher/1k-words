#!/usr/bin/env bash
# Deploy step for Cloudflare Workers Builds.
# Set this ONE line as the "Deploy command" in the dashboard:
#     bash scripts/cf-deploy.sh
set -euo pipefail

echo "→ Applying pending D1 migrations (remote)"
npx wrangler d1 migrations apply 1k-words --remote

echo "→ Deploying Worker"
npx wrangler deploy

echo "✓ Deploy complete"
