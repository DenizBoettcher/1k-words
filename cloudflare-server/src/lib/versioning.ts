/**
 * Usage: 
 * put all system jsons into systemdata folder then run
 * node scripts/import-system-sets.mjs --url https://1k-words.[your-domian].workers.dev --email "[Admin E-Mail]" --password "[Admin Password]"
 */

export interface Pair { source: string; target: string; }

async function insertWordItemsJson(
  prisma: any,
  listId: number,
  rows: { source: string; target: string }[],
): Promise<void> {
  for (let i = 0; i < rows.length; i += 500) {
    const payload = JSON.stringify(
      rows.slice(i, i + 500).map((r) => ({ s: r.source, t: r.target })),
    );
    await prisma.$executeRaw`
      INSERT INTO "WordItem" ("listId", "source", "target")
      SELECT ${listId}, json_extract(value, '$.s'), json_extract(value, '$.t')
      FROM json_each(${payload})`;
  }
}

/** Same single-parameter JSON trick for the version↔item join rows. */
async function insertVersionItemsJson(
  prisma: any,
  versionId: number,
  rows: { wordItemId: number; position: number }[],
): Promise<void> {
  for (let i = 0; i < rows.length; i += 500) {
    const payload = JSON.stringify(
      rows.slice(i, i + 500).map((r) => ({ i: r.wordItemId, p: r.position })),
    );
    await prisma.$executeRaw`
      INSERT INTO "VersionItem" ("versionId", "wordItemId", "position")
      SELECT ${versionId}, json_extract(value, '$.i'), json_extract(value, '$.p')
      FROM json_each(${payload})`;
  }
}

/** Display form: internal version 1,2,3… is shown as "1.1", "1.2", … */
export const formatVersion = (version: number) => `1.${version}`;

export async function latestVersion(prisma: any, listId: number) {
  return prisma.listVersion.findFirst({
    where: { listId },
    orderBy: { version: 'desc' },
  });
}

/** Map "source␀target" -> wordItemId for a version. */
async function versionItemMap(prisma: any, versionId: number): Promise<Map<string, number>> {
  const rows = await prisma.versionItem.findMany({
    where: { versionId },
    include: { wordItem: { select: { id: true, source: true, target: true } } },
  });
  const map = new Map<string, number>();
  for (const r of rows) map.set(`${r.wordItem.source}\u0000${r.wordItem.target}`, r.wordItem.id);
  return map;
}

/**
 * Resolve an item id for every pair: prefer the base version's item (sharing,
 * possibly cross-list), then the list's own pool, else create under this list.
 *
 * BATCHED on purpose: Cloudflare caps a single Worker invocation at ~1000
 * subrequests and every D1 query counts. A per-word findFirst/create (N+1)
 * blows that cap on a 600-word import, so this resolves everything with a
 * constant handful of queries instead.
 */
async function resolveItemIds(
  prisma: any,
  listId: number,
  pairs: Pair[],
  baseVersionId: number | null,
): Promise<number[]> {
  const keyOf = (source: string, target: string) => `${source}\u0000${target}`;
  const trimmed = pairs.map((p) => ({ source: p.source.trim(), target: p.target.trim() }));

  // 1 query: the base version's items (may reference other lists — fork sharing).
  const baseMap = baseVersionId ? await versionItemMap(prisma, baseVersionId) : new Map<string, number>();

  // 1 query: this list's whole item pool.
  const poolRows = await prisma.wordItem.findMany({
    where: { listId },
    select: { id: true, source: true, target: true },
  });
  const poolMap = new Map<string, number>(poolRows.map((r: any) => [keyOf(r.source, r.target), r.id]));

  // Collect pairs that exist nowhere yet (deduplicated within the upload).
  const missing: { listId: number; source: string; target: string }[] = [];
  const seenMissing = new Set<string>();
  for (const p of trimmed) {
    const key = keyOf(p.source, p.target);
    if (baseMap.has(key) || poolMap.has(key) || seenMissing.has(key)) continue;
    seenMissing.add(key);
    missing.push({ listId, source: p.source, target: p.target });
  }

  // ONE query regardless of size: bind the whole set as a single JSON
  // parameter and unpack it with SQLite's json_each. This sidesteps both the
  // Worker subrequest cap (only 50/invocation on the free plan) and D1's
  // ~100 bound-parameters-per-query limit.
  if (missing.length > 0) {
    await insertWordItemsJson(prisma, listId, missing);
  }

  // 1 query: reload the pool to learn the ids of the freshly created rows.
  if (missing.length > 0) {
    const reloaded = await prisma.wordItem.findMany({
      where: { listId },
      select: { id: true, source: true, target: true },
    });
    poolMap.clear();
    for (const r of reloaded) poolMap.set(keyOf(r.source, r.target), r.id);
  }

  return trimmed.map((p) => {
    const key = keyOf(p.source, p.target);
    return baseMap.get(key) ?? poolMap.get(key)!;
  });
}

/** Create the next version of a list from a full set of pairs. */
export async function createVersion(
  prisma: any,
  listId: number,
  pairs: Pair[],
  commitMessage: string,
): Promise<{ id: number; version: number; itemCount: number }> {
  const last = await latestVersion(prisma, listId);
  const version = (last?.version ?? 0) + 1;

  const itemIds = await resolveItemIds(prisma, listId, pairs, last?.id ?? null);

  const created = await prisma.listVersion.create({
    data: { listId, version, commitMessage: commitMessage || '', itemCount: itemIds.length },
  });

  await insertVersionItemsJson(
    prisma,
    created.id,
    itemIds.map((wordItemId, position) => ({ wordItemId, position })),
  );

  await prisma.wordList.update({ where: { id: listId }, data: { updatedAt: new Date() } });
  return { id: created.id, version, itemCount: itemIds.length };
}

/**
 * Fork: create version 1 of `forkListId` referencing EXACTLY the items of
 * `sourceVersionId` — zero WordItem rows are copied.
 */
export async function forkVersion(
  prisma: any,
  forkListId: number,
  sourceVersionId: number,
  commitMessage: string,
): Promise<{ id: number; version: number; itemCount: number }> {
  const sourceItems = await prisma.versionItem.findMany({
    where: { versionId: sourceVersionId },
    orderBy: { position: 'asc' },
    select: { wordItemId: true, position: true },
  });

  const created = await prisma.listVersion.create({
    data: { listId: forkListId, version: 1, commitMessage, itemCount: sourceItems.length },
  });

  await insertVersionItemsJson(
    prisma,
    created.id,
    sourceItems.map((s: any) => ({ wordItemId: s.wordItemId, position: s.position })),
  );
  return { id: created.id, version: 1, itemCount: sourceItems.length };
}

/** Delete word items that belonged to `listId` and are no longer referenced. */
export async function cleanupOrphanItems(prisma: any, listId: number | null) {
  await prisma.wordItem.deleteMany({
    where: { listId, versionItems: { none: {} }, progress: { none: {} } },
  });
}

/** Ordered pairs of a version (for study, export, detail table). */
export async function versionPairs(
  prisma: any,
  versionId: number,
): Promise<{ id: number; source: string; target: string; position: number }[]> {
  const rows = await prisma.versionItem.findMany({
    where: { versionId },
    orderBy: { position: 'asc' },
    include: { wordItem: { select: { id: true, source: true, target: true } } },
  });
  return rows.map((r: any) => ({
    id: r.wordItem.id, source: r.wordItem.source, target: r.wordItem.target, position: r.position,
  }));
}

/** Diff two versions by source term: added / removed / changed. */
export async function diffVersions(prisma: any, fromVersionId: number, toVersionId: number) {
  const [from, to] = await Promise.all([
    versionPairs(prisma, fromVersionId),
    versionPairs(prisma, toVersionId),
  ]);
  const fromMap = new Map(from.map((p) => [p.source, p.target]));
  const toMap = new Map(to.map((p) => [p.source, p.target]));

  const added: Pair[] = [];
  const removed: Pair[] = [];
  const changed: { source: string; from: string; to: string }[] = [];

  for (const [source, target] of toMap) {
    if (!fromMap.has(source)) added.push({ source, target });
    else if (fromMap.get(source) !== target)
      changed.push({ source, from: fromMap.get(source)!, to: target });
  }
  for (const [source, target] of fromMap) {
    if (!toMap.has(source)) removed.push({ source, target });
  }
  return { added, removed, changed };
}