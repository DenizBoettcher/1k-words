# 1K Words

[![Live app](https://img.shields.io/badge/%F0%9F%9A%80_live_app-open-brightgreen?style=for-the-badge)](https://1k-words.dbdev.workers.dev)

> **Live:** deployed from `main` on every push.

A vocabulary trainer with spaced repetition, XP/levels, and Git-style shared
word lists: versioned lists, follows, forks, maintainers, and official system
sets. One React client, two interchangeable backends  a **Cloudflare Worker**
(free-tier deployable) and a **self-host Node/Express server**  speaking the
same API on the same list-centric schema.

```
client/             React 19 + Vite + Mantine (VS Code-style dark mode)
cloudflare-server/  Hono + Prisma(D1) Worker  serves the API AND the built client
node-server/        Express + Prisma(SQLite)  self-host alternative, same API
app/                .NET MAUI WebView wrapper (optional; the web app is a PWA)
scripts/            import-system-sets.mjs (official set importer)
systemdata/         official set JSONs (git-ignored content)
test_data/          sample import files
```

## Feature overview

- **Accounts**: email + password login, unique display **username**. First
  registered user (or the `ADMIN_EMAIL` account) becomes **admin**.
- **Lists are versioned** like repos: every edit creates a snapshot
  (`1.1, 1.2, …`) with a commit message. Word rows are deduplicated across
  versions, so storage stays small and **learning progress survives updates**
  for unchanged words.
- **Follow** a public list (a reference, not a copy): you study it, keep
  progress, and get an "update available" banner when the owner publishes a new
  version  with a version picker and a diff (added / changed / removed).
- **Fork** for editing: creates your own list with its own version counter
  (starting at 1.1), linked back to the origin ("forked from X 1.2").
  **Zero-copy**: the fork references the origin's word rows; only words you
  actually change create new rows.
- **Maintainers**: owners can add other users (by username) as maintainers who
  may publish new versions  like collaborators on Git.
- **Likes (stars) + follower counts**; Browse shows the top 25, sortable by
  stars (default), followers, or combined popularity.
- **System sets**: official lists (badge "official"), public, not forkable,
  editable only by admins, imported via script (below).
- **Caps** (non-admin): 2000 word pairs per list, 4 uploaded original lists.
  Forks and follows are free. Admins are uncapped.
- **SRS + XP**: SM-2-style scheduling (missed words resurface sooner), level =
  mastery of what you *currently* know  it rises when words are mastered and
  drops again when you forget them. XP is a lifetime score. The study screen
  shows seen/total and mastered counts.
- **Answer checking** is fully client-side and configurable per account:
  capitalization checking (off by default) and special-letter folding
  (ö→o, ç→c, ø→o, ß→ss, …  see `client/src/utils/charFold.ts`) for people
  without those keys. Words can list several accepted answers.
- **"Keep me signed in"**: checked (default) keeps the session for 30 days;
  unchecked signs you out when the browser closes.
- **PWA**: installable, offline app shell.

---

## Quick start (pick ONE backend)

Both servers listen on **http://localhost:8787**  run only one at a time.
The client dev server (Vite, port 3000) proxies `/api` to 8787 automatically.

### Option A  Cloudflare Worker (local)

```bash
cd cloudflare-server
npm install
cp wrangler.jsonc.example wrangler.jsonc      # keep database_name = "1k-words"
cp .dev.vars.example .dev.vars                # set JWT_SECRET + ADMIN_EMAIL
npm run db:migrate:local                      # applies migrations/*.sql to local D1
npm start                                     # wrangler dev on :8787 (runs prisma generate first)
```

> `npm start` wants the client build present (`client/build`) because the
> Worker serves it via the ASSETS binding. Build it once:
> `cd ../client && npm install && npm run build`.

### Option B  Node self-host

```bash
cd node-server
npm install
cp .env.example .env                          # set JWT_SECRET, ADMIN_EMAIL, DATABASE_URL
npm run db:migrate                            # prisma migrate dev → creates SQLite + tables
npm run dev                                   # ts-node-dev on :8787
```

### Client (dev, either backend)

```bash
cd client
npm install
npm run dev                                   # http://localhost:3000, /api proxied to :8787
```

Register  use your `ADMIN_EMAIL` (or just be the first account) to become
admin. Registration sends you to the login page; sign in afterwards.

---

## Environment & secrets

**No real secrets are committed.** Every project ships a `*.example` template;
copy it (drop `.example`) and fill in your values. The real files are
git-ignored (verified: `.env`, `.env.*`, `.dev.vars*`, `wrangler.jsonc`,
local `*.db`, `systemdata/*.json` are ignored; only templates, migrations and
schemas are tracked).

| Project | Copy → to | Keys |
| --- | --- | --- |
| client | `.env.example` → `.env` | `VITE_API_URL` (optional, only to point the dev server at a remote worker) |
| cloudflare-server | `.dev.vars.example` → `.dev.vars` | `JWT_SECRET`, `ADMIN_EMAIL` |
| cloudflare-server | `wrangler.jsonc.example` → `wrangler.jsonc` | D1 `database_name`/`database_id`, ASSETS dir |
| node-server | `.env.example` → `.env` | `PORT`, `DATABASE_URL`, `JWT_SECRET`, `ADMIN_EMAIL`, HTTPS options |

Generate a `JWT_SECRET` (any long random string), e.g. in PowerShell:

```powershell
[Convert]::ToBase64String((1..48 | %{Get-Random -Max 256}))
```

### Cloudflare notes

- **D1 has no connection string.** Access = `database_id` in `wrangler.jsonc`
  **plus** your Cloudflare account/API token (kept by wrangler in `~/.wrangler`,
  never in the repo). The id alone is not a credential.
- Production secrets are set with `wrangler secret put JWT_SECRET` (and
  `ADMIN_EMAIL`), not files.
- **Prisma schema vs. D1 migration are separate things** here:
  `prisma/schema.prisma` only generates the typed client (`prisma generate`,
  run automatically by the `prestart`/`deploy` hooks). Tables are created by the
  hand-written SQL in `migrations/`, applied with
  `wrangler d1 migrations apply` (`npm run db:migrate:local` / `:remote`).
  Don't run `prisma migrate` against D1. If you change the schema, generate the
  next SQL file with:
  `npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > migrations/000X_change.sql`
  (for additive changes, diff from the previous schema instead of `--from-empty`).
- The **node-server** uses standard Prisma migrations: `npm run db:migrate`
  (dev) / `npm run db:deploy` (prod).

---

## Deploy to Cloudflare (free tier)

```bash
cd cloudflare-server
npx wrangler d1 create 1k-words               # paste database_id into wrangler.jsonc
npm run db:migrate:remote                     # create tables in the remote D1
npx wrangler secret put JWT_SECRET
npx wrangler secret put ADMIN_EMAIL
npm run deploy                                # prisma generate + client build + wrangler deploy
```

The Worker serves both the API (`/api/*`) and the built client (same origin, no
CORS). Point the MAUI app / your browser at `https://1k-words.<you>.workers.dev`.

### Continuous deployment (Cloudflare Git integration / Workers Builds)

Workers Builds only takes a single build/deploy command each, so the multi-step
logic lives in two committed scripts. Connect the repo in the dashboard
(Workers & Pages → your Worker → Settings → Build → connect Git repository) and
set:

| Setting | Value |
| --- | --- |
| Root directory | `cloudflare-server` |
| Build variable | `D1_DATABASE_ID` = id from `npx wrangler d1 create 1k-words` |
| Build command | `bash scripts/cf-build.sh` |
| Deploy command | `bash scripts/cf-deploy.sh` |

`scripts/cf-build.sh` generates `wrangler.jsonc` from the committed
`wrangler.jsonc.example` (injecting `D1_DATABASE_ID`), builds the web client,
and runs `prisma generate`. `scripts/cf-deploy.sh` applies pending D1
migrations and deploys. So `wrangler.jsonc` itself stays git-ignored.

Notes:

- Build variables exist only at build time. The Worker's **runtime** secrets
  (`JWT_SECRET`, `ADMIN_EMAIL`) are separate  set once via
  `npx wrangler secret put …` and untouched by builds.
- If the repo was previously connected to a Cloudflare **Pages** project (the
  old split setup), disconnect/delete it so the two don't fight over deploys.

### Resetting the Cloudflare setup from scratch

```bash
cd cloudflare-server
npx wrangler delete                     # remove the old Worker (confirm name)
npx wrangler d1 delete <old-db-name>    # remove the old database (e.g. prismadb)
# also delete any old Pages project in the dashboard (Workers & Pages → project → Settings → Delete)

npx wrangler d1 create 1k-words         # fresh DB → paste id into wrangler.jsonc
npm run db:migrate:remote
npx wrangler secret put JWT_SECRET
npx wrangler secret put ADMIN_EMAIL
npm run deploy
```

## Production with the Node server

```bash
cd node-server
npm run build                                 # prisma generate + tsc → dist/
npm run db:deploy                             # apply committed migrations
npm start                                     # builds if needed, then node dist/index.js
```

It serves the client from `../client/build` when present (override with
`CLIENT_DIR`), otherwise runs API-only.

### HTTPS (node-server)

Set in `.env`:

```
ENABLE_HTTPS=true
KEY_PATH="./certs/key.pem"
CERT_PATH="./certs/cert.pem"
```

For local certificates use [mkcert](https://github.com/FiloSottile/mkcert)
(`mkcert localhost`), for public deployments a reverse proxy (Caddy/Traefik/
nginx) with Let's Encrypt in front of plain HTTP is usually the better setup.
The Cloudflare Worker is always HTTPS automatically.

---

## Official system sets

Drop set JSONs into `systemdata/` (git-ignored; see `systemdata/README.md` for
the format), then import them into a **running** deployment:

```bash
node scripts/import-system-sets.mjs --url http://localhost:8787 --email <admin> --password <pw>
```

Run once per target: node-server, `wrangler dev` (= **local** D1), and the
deployed Worker URL (= **remote** D1). The import is idempotent  unchanged
sets are skipped, changed sets get a new version. System sets are public,
badged "official", cannot be forked, and only admins can edit them.

## Word-list JSON format

```jsonc
// structured (what "Download JSON" produces)
{ "title": "Spanish Basics", "sourceLang": "en", "targetLang": "es",
  "words": [ { "en": "hello", "es": "hola" },
             { "en": "friend", "es": ["amigo", "amiga"] } ] }

// legacy: bare array or { "words": [...] } of two-language objects
[ { "en": "and", "de": "und" }, { "en": "a", "de": ["ein", "eine"] } ]
```

A word value is a string or an **array of accepted alternatives**  every
alternative counts as correct (a legacy `"ein/eine"` string works too). The
upload dialog has a help button with an AI prompt that generates a ~600-word
list in this exact format.

## API surface (both backends)

```
POST  /api/auth/register|login        GET /api/auth/me
GET   /api/lists/mine|following|public?q=&sort=stars|followers|popular
POST  /api/lists                      POST   /api/lists/:id/version
GET   /api/lists/:id[?version=]       GET    /api/lists/:id/diff?from=&to=
PATCH /api/lists/:id                  DELETE /api/lists/:id
POST/DELETE /api/lists/:id/like       POST/PATCH/DELETE /api/lists/:id/follow
POST  /api/lists/:id/fork             GET    /api/lists/:id/export[?version=]
POST/DELETE /api/lists/:id/maintainers[/:userId]
GET   /api/study/summary|:listId      POST   /api/study/review
GET/PUT /api/settings                 GET    /api/admin/users …
POST  /api/admin/system-sets
```

## MAUI / native app

The web app is an installable PWA, which covers most of what the MAUI WebView
wrapper does. Keep `app/` for a store presence or plain APK sideloading.

The app has a **known-hosts list** (toolbar → *Servers*): saved servers with
name + URL, tap to connect, swipe to delete, add your own (Cloudflare Worker,
self-hosted node-server on a LAN IP, …). The selection persists on the device.
On first launch the server picker opens automatically. `AppConfig.ApiUrl` only
seeds the default "Cloud" entry  set it to your Worker URL before building so
fresh installs get a working default. Plain `http://` hosts are allowed on
Android and iOS (for LAN self-hosting); the Android back button navigates
inside the web app before closing.

### App CI (`.github/workflows/deploy.yml`)

Every push to `main` that touches `app/**` (or a manual run via
*Actions → Build MAUI app → Run workflow*) builds a **release Android APK**
and attaches it to a GitHub Release.

**Versioning:** `MAJOR.MINOR` is pinned in the workflow (`VERSION_PREFIX: '2.0'`);
the patch counts up automatically per run  run #1 = `2.0.0`, run #2 = `2.0.1`, …
Android's `versionCode` uses the raw run number, so it stays a monotonically
increasing integer. Bumping to `2.1`/`3.0` = edit `VERSION_PREFIX`.

The APK is signed with the default debug keystore, which is fine for
sideloading. For Play-Store signing, add a keystore as a GitHub secret and
pass `-p:AndroidKeyStore=true -p:AndroidSigningKeyStore=… -p:AndroidSigningKeyAlias=…
-p:AndroidSigningKeyPass=… -p:AndroidSigningStorePass=…` to the publish step.

## License

MIT.
