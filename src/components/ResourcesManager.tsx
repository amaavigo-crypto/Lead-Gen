import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Eye, EyeOff, ExternalLink, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
import {
  RESOURCE_CATEGORIES, RESOURCE_ICONS, RESOURCE_LIMITS,
  type SiteResource, type SiteResourceInput,
} from '../shared/siteResources.js';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || 'Request failed (' + response.status + ')');
  return data as T;
}

const API = '/api/platform/site-resources';
const blank = (order: number): SiteResourceInput => ({ title: '', summary: '', category: 'Guides', href: '', icon: 'BookOpen', published: true, order });

export default function ResourcesManager() {
  const [items, setItems] = useState<SiteResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editingId, setEditingId] = useState<string | 'new' | null>(null);
  const [form, setForm] = useState<SiteResourceInput>(blank(1));
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try { setItems((await request<{ resources: SiteResource[] }>(API)).resources); }
    catch (err: any) { setError(err?.message || 'Could not load resources.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const openNew = () => { setForm(blank(items.length ? Math.max(...items.map((i) => i.order)) + 1 : 1)); setEditingId('new'); setError(''); setNotice(''); };
  const openEdit = (r: SiteResource) => { setForm({ title: r.title, summary: r.summary, category: r.category, href: r.href, icon: r.icon, published: r.published, order: r.order }); setEditingId(r.id); setError(''); setNotice(''); };
  const set = <K extends keyof SiteResourceInput>(key: K, value: SiteResourceInput[K]) => setForm((f) => ({ ...f, [key]: value }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      if (editingId === 'new') await request(API, { method: 'POST', body: JSON.stringify(form) });
      else await request(API + '/' + encodeURIComponent(String(editingId)), { method: 'PUT', body: JSON.stringify(form) });
      setNotice(editingId === 'new' ? 'Resource added. It is live on the website now.' : 'Resource updated.');
      setEditingId(null);
      await load();
    } catch (err: any) { setError(err?.message || 'Could not save.'); }
    finally { setSaving(false); }
  };

  const togglePublished = async (r: SiteResource) => {
    setBusyId(r.id); setError('');
    try { await request(API + '/' + encodeURIComponent(r.id), { method: 'PUT', body: JSON.stringify({ published: !r.published }) }); await load(); }
    catch (err: any) { setError(err?.message || 'Could not update.'); }
    finally { setBusyId(''); }
  };

  const remove = async (r: SiteResource) => {
    if (!window.confirm('Delete "' + r.title + '"? It will be removed from the website.')) return;
    setBusyId(r.id); setError('');
    try { await request(API + '/' + encodeURIComponent(r.id), { method: 'DELETE' }); setNotice('Resource deleted.'); await load(); }
    catch (err: any) { setError(err?.message || 'Could not delete.'); }
    finally { setBusyId(''); }
  };

  const input = 'mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100';
  const label = 'block text-[11px] font-bold uppercase tracking-wider text-slate-500';

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-[9px] font-bold uppercase tracking-[.18em] text-slate-400">Public website</div>
          <h1 className="mt-1 text-xl font-bold tracking-tight text-slate-900">Resources</h1>
          <p className="mt-1 max-w-xl text-xs text-slate-500">These cards appear on the website’s Resources page. Add your own guides and articles, hide them, or delete the sample ones — changes go live within about a minute.</p>
        </div>
        <button onClick={openNew} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-indigo-700"><Plus className="h-4 w-4" /> Add resource</button>
      </div>

      {error && <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
      {notice && <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />{notice}</div>}

      {editingId && (
        <form onSubmit={save} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900">{editingId === 'new' ? 'New resource' : 'Edit resource'}</h2>
            <button type="button" onClick={() => setEditingId(null)} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close"><X className="h-4 w-4" /></button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={label}>Title</label>
              <input className={input} value={form.title || ''} maxLength={RESOURCE_LIMITS.title} onChange={(e) => set('title', e.target.value)} required placeholder="e.g. How to qualify leads faster" />
            </div>
            <div className="sm:col-span-2">
              <label className={label}>Short description <span className="font-normal normal-case text-slate-400">({(form.summary || '').length}/{RESOURCE_LIMITS.summary})</span></label>
              <textarea className={input} rows={2} value={form.summary || ''} maxLength={RESOURCE_LIMITS.summary} onChange={(e) => set('summary', e.target.value)} placeholder="One or two sentences shown on the card." />
            </div>
            <div className="sm:col-span-2">
              <label className={label}>Link</label>
              <input className={input} value={form.href || ''} maxLength={RESOURCE_LIMITS.href} onChange={(e) => set('href', e.target.value)} required placeholder="/how-it-works  or  https://your-blog.com/post" />
              <p className="mt-1 text-[11px] text-slate-400">Use a page on this site (starts with /) or a full https:// link — external links open in a new tab.</p>
            </div>
            <div>
              <label className={label}>Category</label>
              <select className={input} value={form.category} onChange={(e) => set('category', e.target.value as any)}>{RESOURCE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
            </div>
            <div>
              <label className={label}>Icon</label>
              <select className={input} value={form.icon} onChange={(e) => set('icon', e.target.value as any)}>{RESOURCE_ICONS.map((c) => <option key={c}>{c}</option>)}</select>
            </div>
            <div>
              <label className={label}>Display order</label>
              <input type="number" min={0} max={9999} className={input} value={form.order ?? 0} onChange={(e) => set('order', Number(e.target.value))} />
              <p className="mt-1 text-[11px] text-slate-400">Lower numbers appear first.</p>
            </div>
            <label className="flex items-center gap-2 self-end pb-2 text-sm font-medium text-slate-700">
              <input type="checkbox" checked={form.published !== false} onChange={(e) => set('published', e.target.checked)} className="h-4 w-4 rounded border-slate-300" /> Visible on website
            </label>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={() => setEditingId(null)} className="rounded-lg px-3.5 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
            <button type="submit" disabled={saving} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">{saving && <Loader2 className="h-4 w-4 animate-spin" />}{editingId === 'new' ? 'Add resource' : 'Save changes'}</button>
          </div>
        </form>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {loading ? (
          <div className="flex items-center gap-2 p-6 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading resources…</div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">No resources yet. Click “Add resource” to create the first one.</div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((r) => (
              <li key={r.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-semibold text-slate-900">{r.title}</span>
                    <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700">{r.category}</span>
                    {r.isSample && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">Sample</span>}
                    {!r.published && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">Hidden</span>}
                  </div>
                  <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">{r.summary || 'No description'}</p>
                  <a href={r.href} target="_blank" rel="noreferrer" className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-indigo-600"><ExternalLink className="h-3 w-3" />{r.href}</a>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <span className="mr-2 text-[11px] text-slate-400">#{r.order}</span>
                  <button disabled={busyId === r.id} onClick={() => togglePublished(r)} title={r.published ? 'Hide from website' : 'Show on website'} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">{r.published ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}</button>
                  <button onClick={() => openEdit(r)} title="Edit" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><Pencil className="h-4 w-4" /></button>
                  <button disabled={busyId === r.id} onClick={() => remove(r)} title="Delete" className="rounded-lg p-2 text-rose-500 hover:bg-rose-50">{busyId === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
