export type Item = {
  id: string; parentId: string | null; name: string; kind: 'folder' | 'file';
  size: number; modified: string | null; trashed: boolean;
};
export type Entry = Item & { path: string[] };
export interface Provider {
  rootId: string;
  get(id: string): Promise<Item>;
  children(id: string): Promise<Item[]>;
  download(id: string): Promise<string>;
}
export type Snapshot = { root: Entry; entries: Map<string, Entry>; builtAt: string };
export type Listing = {
  mode: 'demo' | 'degoo'; folder: Entry; breadcrumbs: Entry[]; items: Entry[];
  total: number; page: number; pages: number; query: string;
  stats: { files: number; folders: number; bytes: number };
  cachedAt: string; cacheSeconds: number;
};
export type PreviewKind = 'image' | 'audio' | 'video' | 'text' | 'none';
export function previewKind(name: string): PreviewKind {
  const ext = name.toLowerCase().split('.').pop() || '';
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif'].includes(ext)) return 'image';
  if (['mp3', 'ogg', 'wav', 'm4a', 'flac'].includes(ext)) return 'audio';
  if (['mp4', 'webm', 'm4v', 'mov'].includes(ext)) return 'video';
  if (['txt', 'md', 'json', 'csv', 'log', 'ts', 'js', 'css', 'py', 'rs', 'yaml', 'yml'].includes(ext)) return 'text';
  return 'none';
}
export function formatBytes(n: number) {
  if (!n) return '0 B';
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), 4);
  return `${(n / 1024 ** i).toFixed(i ? 1 : 0)} ${['B', 'KB', 'MB', 'GB', 'TB'][i]}`;
}
