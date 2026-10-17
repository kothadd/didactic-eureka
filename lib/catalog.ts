import type { Entry, Provider, Snapshot } from './types';
import { invariant } from './errors';

export async function buildSnapshot(provider: Provider, options: { maxItems?: number; maxFolders?: number; maxDepth?: number; deadlineMs?: number } = {}): Promise<Snapshot> {
  const { maxItems = 5000, maxFolders = 100, maxDepth = 32, deadlineMs = 25000 } = options;
  const deadline = Date.now() + deadlineMs;
  const raw = await provider.get(provider.rootId);
  invariant(raw.id === provider.rootId && raw.kind === 'folder' && raw.name === 'Public' && !raw.trashed,
    'ROOT_REJECTED', 'The pinned root must be an active folder named Public.', 503);
  // Do not publish the account parent ID or any path above Public.
  const root: Entry = { ...raw, parentId: null, path: [] };
  const entries = new Map<string, Entry>([[root.id, root]]);
  const queue: Entry[] = [root];
  for (let i = 0; i < queue.length; i++) {
    invariant(i < maxFolders && Date.now() < deadline, 'INDEX_LIMIT', 'Index exceeds the MVP crawl budget. Reduce the published subtree.', 503);
    const parent = queue[i];
    const children = await provider.children(parent.id);
    for (const child of children) {
      if (child.trashed) continue;
      invariant(child.parentId === parent.id, 'PARENT_MISMATCH', 'Provider returned an inconsistent folder listing.');
      invariant(!entries.has(child.id), 'DUPLICATE_ID', 'Provider returned duplicate or cyclic file IDs.');
      invariant(entries.size < maxItems && parent.path.length < maxDepth, 'INDEX_LIMIT', 'Index exceeds the MVP size or depth limit.', 503);
      const entry: Entry = { ...child, path: [...parent.path, child.name] };
      entries.set(entry.id, entry);
      if (entry.kind === 'folder') queue.push(entry);
    }
  }
  invariant(Date.now() < deadline, 'INDEX_LIMIT', 'Index exceeded the crawl time budget.', 503);
  return { root, entries, builtAt: new Date().toISOString() };
}

export function requireEntry(snapshot: Snapshot, id: string): Entry {
  const entry = snapshot.entries.get(id);
  invariant(entry, 'NOT_FOUND', 'Item not found in Public.', 404);
  return entry;
}

// A cached membership record alone must never authorize a fresh signed download.
export async function assertFreshMembership(provider: Provider, snapshot: Snapshot, id: string) {
  requireEntry(snapshot, id);
  let cursor = id;
  const seen = new Set<string>();
  for (let depth = 0; depth <= 32; depth++) {
    invariant(!seen.has(cursor), 'NOT_FOUND', 'Item not found in Public.', 404);
    seen.add(cursor);
    const item = await provider.get(cursor);
    invariant(item.id === cursor && !item.trashed, 'NOT_FOUND', 'Item not found in Public.', 404);
    if (cursor === provider.rootId) {
      invariant(item.name === 'Public' && item.kind === 'folder', 'ROOT_REJECTED', 'Public root is no longer available.', 503);
      return;
    }
    const expected = snapshot.entries.get(cursor);
    invariant(expected && expected.parentId === item.parentId && item.parentId &&
      snapshot.entries.get(item.parentId)?.kind === 'folder', 'NOT_FOUND', 'Item moved; refresh the index.', 404);
    if (depth > 0) invariant(item.kind === 'folder', 'NOT_FOUND', 'Parent is not a folder.', 404);
    cursor = item.parentId;
  }
  invariant(false, 'NOT_FOUND', 'Item not found in Public.', 404);
}

export function isWithin(entry: Entry, ancestor: string, snapshot: Snapshot): boolean {
  let cursor: Entry | undefined = entry;
  while (cursor) {
    if (cursor.id === ancestor) return true;
    cursor = cursor.parentId ? snapshot.entries.get(cursor.parentId) : undefined;
  }
  return false;
}

export function expandSelection(snapshot: Snapshot, ids: string[], maxFiles = 200) {
  invariant(ids.length > 0 && ids.length <= 100, 'BAD_SELECTION', 'Select between 1 and 100 entries.', 400);
  const selected = [...new Set(ids)].map(id => requireEntry(snapshot, id));
  const result = [...snapshot.entries.values()].filter(e => e.kind === 'file' && selected.some(s => isWithin(e, s.id, snapshot)));
  invariant(result.length <= maxFiles, 'BULK_LIMIT', `Select at most ${maxFiles} files, including folder contents.`, 400);
  return result.sort((a, b) => a.path.join('/').localeCompare(b.path.join('/')));
}
