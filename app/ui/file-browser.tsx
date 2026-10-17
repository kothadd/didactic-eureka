'use client';
import { useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowRight, AudioLines, Check, ChevronLeft, ChevronRight, CircleAlert, Cloud, Code2, Copy, File, FileText, Folder, FolderOpen, Grid2X2, ImageIcon, Link2, List, LoaderCircle, RefreshCw, Search, ShieldCheck, Video, X } from 'lucide-react';
import { formatBytes, previewKind, type Entry, type Listing } from '../../lib/types';

type LocationState = { folder: string; q: string; page: number };
type BulkFile = { id: string; name: string; path: string[]; bytes: number; href: string };
function readLocation(): LocationState {
  const q = new URLSearchParams(window.location.search);
  return { folder: q.get('folder') || '', q: q.get('q') || '', page: Math.max(1, Number(q.get('page')) || 1) };
}
async function responseJson(response: Response) {
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || 'The request could not be completed.');
  return data;
}
function FileIcon({ item }: { item: Entry }) {
  if (item.kind === 'folder') return <Folder fill="currentColor" fillOpacity=".13" />;
  const kind = previewKind(item.name);
  return kind === 'image' ? <ImageIcon /> : kind === 'audio' ? <AudioLines /> : kind === 'video' ? <Video /> : /\.(json|js|ts|py|rs|css)$/i.test(item.name) ? <Code2 /> : kind === 'text' ? <FileText /> : <File />;
}
function downloadBlob(name: string, contents: string, type: string) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function FileBrowser() {
  const [location, setLocation] = useState<LocationState>({ folder: '', q: '', page: 1 });
  const [ready, setReady] = useState(false);
  const [data, setData] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'list' | 'grid'>('list');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<Entry | null>(null);
  const [bulk, setBulk] = useState<BulkFile[] | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [copied, setCopied] = useState(false);
  const requestVersion = useRef(0);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const sync = () => { const next = readLocation(); setLocation(next); setSearch(next.q); setSelected(new Set()); };
    sync(); setReady(true); window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);
  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    setLoading(true); setError(''); setNotice(''); setData(null);
    const version = ++requestVersion.current;
    const params = new URLSearchParams({ folder: location.folder, q: location.q, page: String(location.page) });
    fetch(`/api/list?${params}`, { signal: controller.signal }).then(responseJson).then(result => {
      if (version === requestVersion.current) setData(result);
    }).catch(err => { if (!controller.signal.aborted) setError(err.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [location, ready, refresh]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'k') { event.preventDefault(); searchRef.current?.focus(); }
    };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, []);

  function navigate(next: LocationState) {
    const params = new URLSearchParams();
    if (next.folder) params.set('folder', next.folder);
    if (next.q) params.set('q', next.q);
    if (next.page > 1) params.set('page', String(next.page));
    history.pushState(null, '', params.size ? `/?${params}` : '/');
    setLocation(next); setSearch(next.q); setSelected(new Set()); setBulk(null); setNotice('');
  }
  function open(item: Entry) {
    if (item.kind === 'folder') navigate({ folder: item.id, q: '', page: 1 });
    else setPreview(item);
  }
  function toggle(id: string) {
    setSelected(old => { const next = new Set(old); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }
  async function prepareBulk() {
    setBulkLoading(true); setNotice('');
    try {
      const result = await responseJson(await fetch('/api/bulk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: [...selected] }) }));
      setBulk(result.files);
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not prepare download list.'); }
    finally { setBulkLoading(false); }
  }
  async function copyLink() {
    try { await navigator.clipboard.writeText(window.location.href); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { setNotice('Copy the current address from your browser to share this folder.'); }
  }
  const folders = data?.items.filter(i => i.kind === 'folder').length || 0;
  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="/" aria-label="Degoo Index home"><span className="brand-mark"><Cloud size={24} /></span><span>degoo<span className="brand-sub">INDEX</span></span></a>
      <div className="sidebar-label">WORKSPACE</div>
      <button className="nav-item active" onClick={() => navigate({ folder: '', q: '', page: 1 })}><FolderOpen size={18} /> Public collection <span className="nav-dot" /></button>
      <div className="sidebar-note"><ShieldCheck size={18} /><div><strong>Open by design</strong><p>Browse, preview, and download. No account needed.</p></div></div>
      <div className="sidebar-bottom"><span className="online-dot" /> Read-only collection<span>Built for sharing.</span></div>
    </aside>
    <div className="main-shell">
      <header className="topbar"><div className="topbar-title"><Cloud size={18} /><span>Public file index</span><span className="slash">/</span><span className="muted">Browse freely</span></div>
        <span className={`mode-badge ${data?.mode === 'demo' ? 'demo' : ''}`}>{data?.mode === 'demo' ? 'SAMPLE DATA' : data?.mode === 'degoo' ? 'DEGOO CONNECTED' : 'PUBLIC ACCESS'}</span>
      </header>
      <main>
        <section className="intro"><div><div className="eyebrow">YOUR SHARED CORNER OF THE CLOUD</div><h1>A place for everything.<br /><span>A link for everyone.</span></h1><p>Explore the collection. Find something useful. Make it yours.</p></div><div className="intro-art" aria-hidden="true"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><FolderOpen size={78} strokeWidth={1.2} /><span className="art-dot" /></div></section>
        {data?.mode === 'demo' && <div className="demo-banner"><CircleAlert size={16} /><span>You’re exploring sample files. Live Degoo access has not been verified.</span></div>}
        <section className="stats" aria-label="Collection summary"><div><span className="stat-icon"><FileText /></span><div><strong>{data?.stats.files ?? '—'}</strong><span>Shared files</span></div></div><div><span className="stat-icon"><Folder /></span><div><strong>{data?.stats.folders ?? '—'}</strong><span>Folders to explore</span></div></div><div><span className="stat-icon"><Cloud /></span><div><strong>{data ? formatBytes(data.stats.bytes) : '—'}</strong><span>In the collection</span></div></div></section>
        <section className="explorer" aria-label="File browser">
          <div className="explorer-heading"><nav className="breadcrumbs" aria-label="Breadcrumb">{(data?.breadcrumbs || []).map((item, index) => <span key={item.id}>{index > 0 && <ChevronRight size={14} />}<button onClick={() => navigate({ folder: index ? item.id : '', q: '', page: 1 })} aria-current={index === (data?.breadcrumbs.length || 0) - 1 ? 'page' : undefined}>{index === 0 && <FolderOpen size={18} />}{item.name}</button></span>)}{!data && <span><FolderOpen size={18} /> Public</span>}</nav><button className="button subtle share" onClick={copyLink}>{copied ? <Check size={15} /> : <Link2 size={15} />}{copied ? 'Copied' : 'Copy folder link'}</button></div>
          <div className="toolbar"><form className="search" onSubmit={event => { event.preventDefault(); navigate({ ...location, q: search.trim(), page: 1 }); }}><Search size={18} /><input ref={searchRef} aria-label="Search this folder and subfolders" placeholder="Search this folder and subfolders…" value={search} onChange={e => setSearch(e.target.value)} maxLength={200} /><button type="submit" aria-label="Search"><ArrowRight size={16} /></button></form><div className="view-controls"><button className="icon-button" aria-label="Reload collection" title="Reload (metadata cache may be reused)" onClick={() => { setSelected(new Set()); setRefresh(v => v + 1); }}><RefreshCw size={16} className={loading ? 'spin' : ''} /></button><span className="divider" /><button className={`icon-button ${view === 'list' ? 'chosen' : ''}`} aria-label="List view" aria-pressed={view === 'list'} onClick={() => setView('list')}><List size={18} /></button><button className={`icon-button ${view === 'grid' ? 'chosen' : ''}`} aria-label="Grid view" aria-pressed={view === 'grid'} onClick={() => setView('grid')}><Grid2X2 size={17} /></button></div></div>
          <div className="results-summary"><span>{location.q ? `Results for “${location.q}”` : 'All files'} <span className="count">{data?.total ?? 0}</span></span><span>{location.q ? 'Including subfolders' : `${folders} folders on this page · Name A–Z`}</span></div>
          {notice && <div className="inline-error" role="alert">{notice}</div>}
          {loading ? <div className="empty-state" role="status"><LoaderCircle className="spin" /><h2>Opening the collection</h2><p>Fetching the folder index…</p></div> : error ? <div className="empty-state error" role="alert"><CircleAlert /><h2>Collection unavailable</h2><p>{error}</p><button className="button" onClick={() => setRefresh(v => v + 1)}>Try again</button></div> : !data?.items.length ? <div className="empty-state"><FolderOpen /><h2>{location.q ? 'No matches here' : 'A little room to grow'}</h2><p>{location.q ? 'Try another filename or search from Public.' : 'This folder is empty.'}</p>{location.q && <button className="button" onClick={() => navigate({ ...location, q: '', page: 1 })}>Clear search</button>}</div> : <>
            <div className="selection-row"><label><input type="checkbox" aria-label="Select all on this page" checked={!!data.items.length && data.items.every(i => selected.has(i.id))} onChange={e => setSelected(e.target.checked ? new Set(data.items.map(i => i.id)) : new Set())} /><span>{selected.size ? `${selected.size} selected` : 'Select all on this page'}</span></label>{selected.size > 0 && <button className="button primary compact" onClick={prepareBulk} disabled={bulkLoading}>{bulkLoading ? <LoaderCircle className="spin" size={15} /> : <ArrowDownToLine size={15} />}Prepare downloads</button>}</div>
            <div className={view === 'grid' ? 'file-grid' : 'file-list'}>
              {view === 'list' && <div className="table-heading"><span /><span>Name</span><span>Size</span><span>Modified</span><span /></div>}
              {data.items.map(item => <article className={`file-row ${selected.has(item.id) ? 'selected' : ''}`} key={item.id}>
                <input type="checkbox" aria-label={`Select ${item.name}`} checked={selected.has(item.id)} onChange={() => toggle(item.id)} />
                <button className="file-name" onClick={() => open(item)}><span className={`file-symbol ${item.kind === 'folder' ? 'folder' : previewKind(item.name)}`}><FileIcon item={item} /></span><span><strong>{item.name}</strong><small>{location.q ? `Public / ${item.path.slice(0, -1).join(' / ')}` : item.kind === 'folder' ? 'Folder' : item.name.split('.').pop()?.toUpperCase() + ' file'}</small></span></button>
                <span className="file-size">{item.kind === 'folder' ? '—' : formatBytes(item.size)}</span><time className="file-date" dateTime={item.modified || undefined}>{item.modified ? new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(item.modified)) : '—'}</time>
                {item.kind === 'folder' ? <button className="icon-button row-action" aria-label={`Open ${item.name}`} onClick={() => open(item)}><ChevronRight size={17} /></button> : <a className="icon-button row-action" aria-label={`Download ${item.name}`} href={`/api/download?id=${encodeURIComponent(item.id)}`} target="_blank" rel="noopener noreferrer"><ArrowDownToLine size={17} /></a>}
              </article>)}
            </div>
          </>}
          <div className="explorer-footer"><span><span className="online-dot" />{data ? `Index cached for ${data.cacheSeconds}s` : 'Read-only access'}{data && <span className="cache-time"> · Updated {new Date(data.cachedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}</span><div className="pagination"><button className="icon-button" disabled={!data || data.page <= 1} aria-label="Previous page" onClick={() => navigate({ ...location, page: (data?.page || 1) - 1 })}><ChevronLeft size={16} /></button><span>{data?.page || 1} / {data?.pages || 1}</span><button className="icon-button" disabled={!data || data.page >= data.pages} aria-label="Next page" onClick={() => navigate({ ...location, page: (data?.page || 1) + 1 })}><ChevronRight size={16} /></button></div></div>
        </section>
        <footer className="page-footer"><span>DEGOO INDEX <span> / </span> A simple way to share.</span><span>Public folder only <ShieldCheck size={13} /></span></footer>
      </main>
    </div>
    {preview && <Preview item={preview} onClose={() => setPreview(null)} />}
    {bulk && <Modal title="Your download list" onClose={() => setBulk(null)}><p className="modal-description">{bulk.length} files, including selected folder contents. Links are resolved when opened, so the list does not contain expiring storage URLs.</p><div className="bulk-actions"><button className="button primary" disabled={!bulk.length} onClick={() => downloadBlob('downloads.txt', bulk.map(f => new URL(f.href, window.location.origin).href).join('\n') + '\n', 'text/plain')}><ArrowDownToLine size={16} />Save URL list</button><button className="button" disabled={!bulk.length} onClick={() => downloadBlob('downloads.json', JSON.stringify({ generatedAt: new Date().toISOString(), files: bulk.map(f => ({ ...f, href: new URL(f.href, window.location.origin).href })) }, null, 2), 'application/json')}>Save manifest</button></div><div className="bulk-list">{bulk.map(f => <a key={f.id} href={f.href} target="_blank" rel="noopener noreferrer"><FileText size={17} /><span>{f.path.join(' / ')}</span><ArrowDownToLine size={15} /></a>)}</div><p className="hint">Use the URL list with a download manager, or open files individually. This MVP does not create bulk ZIP archives.</p></Modal>}
  </div>;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  return <dialog ref={ref} className="modal" aria-labelledby="modal-title" onCancel={e => { e.preventDefault(); onClose(); }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}><div className="modal-inner"><header><h2 id="modal-title">{title}</h2><button autoFocus className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={20} /></button></header>{children}</div></dialog>;
}
function Preview({ item, onClose }: { item: Entry; onClose: () => void }) {
  const kind = previewKind(item.name);
  const src = `/api/download?id=${encodeURIComponent(item.id)}`;
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (kind !== 'text') return;
    const controller = new AbortController();
    fetch(`/api/preview?id=${encodeURIComponent(item.id)}`, { signal: controller.signal }).then(responseJson).then(data => setText(data.text))
      .catch(err => { if (!controller.signal.aborted) setError(err.message); });
    return () => controller.abort();
  }, [item.id, kind]);
  return <Modal title={item.name} onClose={onClose}><p className="modal-description">Public / {item.path.join(' / ')} <span> · {formatBytes(item.size)}</span></p><div className="preview-content">
    {error ? <div className="empty-state"><CircleAlert /><p>{error}</p></div> : kind === 'image' ? <img src={src} alt={item.name} onError={() => setError('The browser could not preview this image. Try downloading it.')} /> : kind === 'audio' ? <div className="audio-preview"><AudioLines size={56} /><audio controls preload="metadata" src={src} onError={() => setError('Audio preview is unavailable for this file or storage host.')} /></div> : kind === 'video' ? <video controls preload="metadata" src={src} onError={() => setError('Video preview is unavailable for this codec or storage host.')} /> : kind === 'text' ? text === null ? <div className="empty-state"><LoaderCircle className="spin" /><p>Loading text…</p></div> : <pre>{text}</pre> : <div className="empty-state"><File size={44} /><h3>Ready to download</h3><p>This format does not have an inline preview.</p></div>}
  </div><div className="preview-footer"><span className="hint">Media support depends on your browser and the storage host.</span><a className="button primary" href={src} target="_blank" rel="noopener noreferrer"><ArrowDownToLine size={16} />Download file</a></div></Modal>;
}
