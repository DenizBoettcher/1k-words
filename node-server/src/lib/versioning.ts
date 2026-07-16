/**
 * Versioning helpers shared by both servers.
 *
 * Storage model: WordItem rows are immutable (source,target) pairs. A version
 * is just a set of references (VersionItem) to items. Deduplication happens on
 * two levels:
 *   1. Against the PREVIOUS version — unchanged words keep the same wordItemId,
 *      even across forks (a fork's v1 references the origin's items directly,
 *      copying nothing). Only actually-changed pairs create new rows.
 *   2. Against the list's own item pool (re-added words are reused).
 * Because progress hangs off wordItemId, it survives version updates AND the
 * follow→fork transition for unchanged words.
 */

export interface Pair { source: string; target: string; }

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
 */
async function resolveItemIds(
  prisma: any,
  listId: number,
  pairs: Pair[],
  baseVersionId: number | null,
): Promise<number[]> {
  const baseMap = baseVersionId ? await versionItemMap(prisma, baseVersionId) : new Map<string, number>();
  const ids: number[] = [];
  for (const p of pairs) {
    const source = p.source.trim();
    const target = p.target.trim();
    const key = `${source}\u0000${target}`;

    const fromBase = baseMap.get(key);
    if (fromBase) { ids.push(fromBase); continue; }

    const existing = await prisma.wordItem.findFirst({
      where: { listId, source, target },
      select: { id: true },
    });
    if (existing) { ids.push(existing.id); continue; }

    const created = await prisma.wordItem.create({
      data: { listId, source, target },
      select: { id: true },
    });
    ids.push(created.id);
  }
  return ids;
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

  const rows = itemIds.map((wordItemId, position) => ({ versionId: created.id, wordItemId, position }));
  for (let i = 0; i < rows.length; i += 50) {
    await prisma.versionItem.createMany({ data: rows.slice(i, i + 50) });
  }

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

  const rows = sourceItems.map((s: any) => ({
    versionId: created.id, wordItemId: s.wordItemId, position: s.position,
  }));
  for (let i = 0; i < rows.length; i += 50) {
    await prisma.versionItem.createMany({ data: rows.slice(i, i + 50) });
  }
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
