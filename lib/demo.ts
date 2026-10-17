import type { Item, Provider } from './types';
import { invariant } from './errors';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
const modified = '2026-10-17T08:00:00.000Z';
const folder = (id: string, name: string, parentId = 'public'): Item => ({ id, parentId, name, kind: 'folder', size: 0, modified, trashed: false });
const file = (id: string, name: string, parentId: string, size: number): Item => ({ id, parentId, name, kind: 'file', size, modified, trashed: false });
export const demoAssets: Record<string, { file: string; type: string }> = {
  welcome: { file: 'Welcome.md', type: 'text/plain; charset=utf-8' },
  guide: { file: 'Getting-started.md', type: 'text/plain; charset=utf-8' },
  notes: { file: 'Release-notes.txt', type: 'text/plain; charset=utf-8' },
  config: { file: 'example.json', type: 'application/json' },
  image: { file: 'Blue-hour.png', type: 'image/png' },
  audio: { file: 'Soft-chime.wav', type: 'audio/wav' },
  data: { file: 'Collection.csv', type: 'text/csv; charset=utf-8' }
};
const items: Item[] = [folder('public', 'Public', 'hidden'), folder('documents', 'Documents'), folder('images', 'Images'),
  folder('audio-folder', 'Audio'), folder('code', 'Code'), folder('guides', 'Guides', 'documents'),
  file('welcome', 'Welcome.md', 'public', 647), file('guide', 'Getting-started.md', 'guides', 380),
  file('notes', 'Release-notes.txt', 'documents', 250), file('config', 'example.json', 'code', 108),
  file('image', 'Blue-hour.png', 'images', 0), file('audio', 'Soft-chime.wav', 'audio-folder', 0),
  file('data', 'Collection.csv', 'documents', 0)];
export async function demoBytes(id: string) {
  const asset = demoAssets[id];
  invariant(asset, 'NOT_FOUND', 'Sample file not found.', 404);
  return { bytes: await readFile(path.join(process.cwd(), 'public', 'demo', asset.file)), type: asset.type, name: asset.file };
}
export class DemoProvider implements Provider {
  rootId = 'public';
  async get(id: string) {
    const item = items.find(i => i.id === id);
    invariant(item, 'NOT_FOUND', 'Sample file not found.', 404);
    return item.kind === 'file' ? { ...item, size: (await demoBytes(id)).bytes.length } : { ...item };
  }
  async children(id: string) { return Promise.all(items.filter(i => i.parentId === id).map(i => this.get(i.id))); }
  async download(id: string) { await this.get(id); return `/api/demo-file?id=${encodeURIComponent(id)}`; }
}
