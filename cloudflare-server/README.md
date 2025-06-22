```txt
npm install
npm run dev
```

```txt
npm run deploy
```

DB:
```bash
npx wrangler d1 create *DBNAME* #create
npx wrangler d1 migrations create *DBNAME* *MIGRATIONNAME* # migration
npx prisma migrate diff --from-empty --to-schema-datamodel ./prisma/schema.prisma --script --output migrations/*MIGRATIONNAME*.sql # push migarion
npx wrangler d1 migrations apply *DBNAME* --local # For the local database
npx wrangler d1 migrations apply *DBNAME* --remote # For the remote database
```

[For generating/synchronizing types based on your Worker configuration run](https://developers.cloudflare.com/workers/wrangler/commands/#types):

```txt
npm run cf-typegen
```

Pass the `CloudflareBindings` as generics when instantiation `Hono`:

```ts
// src/index.ts
const app = new Hono<{ Bindings: CloudflareBindings }>()
```
