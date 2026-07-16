# systemdata/

Put official ("system") word-list JSON files here  e.g. the 1000 most common
words for en↔de, en↔es, en↔tr, en↔it, …

Files in this folder are **git-ignored** (except this README): system sets are
content, not code. Import them into a running deployment with:

```bash
node scripts/import-system-sets.mjs --url http://localhost:8787 --email <admin> --password <pw>
```

Run the script once per target (node-server, wrangler dev = local D1, deployed
worker = remote D1). Imports are idempotent  unchanged sets are skipped,
changed sets get a new version.

Accepted formats (same as the normal upload):

```jsonc
// structured
{ "title": "German Top 1000", "sourceLang": "en", "targetLang": "de",
  "words": [ { "en": "and", "de": "und" } ] }

// legacy: bare array or { "words": [...] } of two-language objects
[ { "en": "and", "de": "und" } ]
```

System sets are public, show an "official" badge, cannot be forked, and can
only be edited by an admin.
