import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle, Archive, ArrowUpRight, BookOpen, CheckCircle2, Clock3, Eye,
  FilePlus2, FileText, Filter, ImagePlus, Loader2, Pencil, Plus, RefreshCw,
  Search, Send, Trash2, X,
} from 'lucide-react';
import {
  RESOURCE_CATEGORIES, RESOURCE_ICONS, RESOURCE_TYPES,
  type ResourceStatus, type SiteResourceAdminRecord, type SiteResourceFields,
} from '../shared/siteResources.js';

const API = '/api/platform/site-resources';
const blankResource = (order: number): SiteResourceFields => ({
  title: '',
  slug: '',
  summary: '',
  category: 'Guides',
  type: 'article',
  content: '',
  destinationUrl: '',
  coverImageUrl: '',
  coverImageAlt: '',
  author: 'Amaavigo Editorial Team',
  readingTime: '',
  ctaLabel: 'Read resource',
  ctaUrl: '',
  seoTitle: '',
  metaDescription: '',
  icon: 'BookOpen',
  featured: false,
  order,
});

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || 'Request failed (' + response.status + ')');
  return data as T;
}

function slugify(value: string) {
  return value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120);
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read the selected image.'));
    reader.readAsDataURL(file);
  });
}

const inputClass = 'mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100';
const labelClass = 'block text-[10px] font-bold uppercase tracking-[.13em] text-slate-500';

export default function ResourcesManager() {
  const [items, setItems] = useState<SiteResourceAdminRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState<'all' | ResourceStatus>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<SiteResourceFields>(blankResource(1));
  const [editing, setEditing] = useState(false);
  const [slugTouched, setSlugTouched] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [uploading, setUploading] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await request<{ resources: SiteResourceAdminRecord[] }>(API);
      setItems(Array.isArray(data.resources) ? data.resources : []);
    } catch (err: any) {
      setError(err?.message || 'Could not load the Resources library.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      const resource = item.draft;
      if (categoryFilter !== 'All' && resource.category !== categoryFilter) return false;
      if (statusFilter !== 'all' && item.status !== statusFilter) return false;
      return !q || [resource.title, resource.summary, resource.slug, resource.author].some((value) => String(value || '').toLowerCase().includes(q));
    });
  }, [items, query, categoryFilter, statusFilter]);

  const summary = useMemo(() => ({
    all: items.length,
    published: items.filter((item) => item.status === 'published').length,
    drafts: items.filter((item) => item.status === 'draft').length,
    archived: items.filter((item) => item.status === 'archived').length,
  }), [items]);

  const openNew = () => {
    setSelectedId(null);
    setForm(blankResource(items.length ? Math.max(...items.map((item) => item.draft.order)) + 1 : 1));
    setEditing(true);
    setSlugTouched(false);
    setError('');
    setNotice('');
    setPreviewOpen(false);
  };

  const openEdit = (item: SiteResourceAdminRecord) => {
    setSelectedId(item.id);
    setForm({ ...item.draft });
    setEditing(true);
    setSlugTouched(true);
    setError('');
    setNotice('');
    setPreviewOpen(false);
  };

  const setField = <K extends keyof SiteResourceFields>(key: K, value: SiteResourceFields[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const saveDraft = async (): Promise<SiteResourceAdminRecord | null> => {
    setSaving(true);
    setError('');
    try {
      let result: { resource: SiteResourceAdminRecord };
      if (!selectedId) {
        result = await request<{ resource: SiteResourceAdminRecord }>(API, {
          method: 'POST',
          body: JSON.stringify({ resource: form }),
        });
        setSelectedId(result.resource.id);
      } else {
        const current = items.find((item) => item.id === selectedId);
        if (!current) throw new Error('This resource is no longer in the library. Reload and try again.');
        result = await request<{ resource: SiteResourceAdminRecord }>(API + '/' + encodeURIComponent(selectedId), {
          method: 'PUT',
          body: JSON.stringify({ resource: form, revision: current.revision }),
        });
      }
      setForm({ ...result.resource.draft });
      setItems((current) => {
        const without = current.filter((item) => item.id !== result.resource.id);
        return [...without, result.resource].sort((a, b) => a.draft.order - b.draft.order);
      });
      setNotice('Draft saved. The live website is unchanged until you publish.');
      return result.resource;
    } catch (err: any) {
      setError(err?.message || 'Could not save this resource.');
      return null;
    } finally {
      setSaving(false);
    }
  };

  const publish = async () => {
    let record: SiteResourceAdminRecord | null = null;
    if (!selectedId) {
      record = await saveDraft();
      if (!record) return;
    } else {
      record = await saveDraft();
      if (!record) return;
    }
    setBusy(record.id);
    setError('');
    try {
      const result = await request<{ resource: SiteResourceAdminRecord }>(API + '/' + encodeURIComponent(record.id) + '/publish', {
        method: 'POST',
        body: JSON.stringify({ revision: record.revision }),
      });
      setItems((current) => current.map((item) => item.id === record?.id ? result.resource : item));
      setForm({ ...result.resource.draft });
      setNotice('Published successfully. The public Resources page now uses this version.');
    } catch (err: any) {
      setError(err?.message || 'Could not publish this resource.');
    } finally {
      setBusy('');
    }
  };

  const changeStatus = async (action: 'unpublish' | 'archive') => {
    if (!selectedId) return;
    const current = items.find((item) => item.id === selectedId);
    if (!current) return;
    setBusy(selectedId);
    setError('');
    try {
      const result = await request<{ resource: SiteResourceAdminRecord }>(API + '/' + encodeURIComponent(selectedId) + '/' + action, {
        method: 'POST',
        body: JSON.stringify({ revision: current.revision }),
      });
      setItems((list) => list.map((item) => item.id === selectedId ? result.resource : item));
      setNotice(action === 'archive' ? 'Resource archived and removed from the public library.' : 'Resource unpublished.');
      setForm({ ...result.resource.draft });
    } catch (err: any) {
      setError(err?.message || 'Could not update the resource status.');
    } finally {
      setBusy('');
    }
  };

  const remove = async () => {
    if (!selectedId) return;
    const current = items.find((item) => item.id === selectedId);
    if (!current || !window.confirm('Permanently delete "' + current.draft.title + '"? This cannot be undone.')) return;
    setBusy(selectedId);
    setError('');
    try {
      await request(API + '/' + encodeURIComponent(selectedId), {
        method: 'DELETE',
        body: JSON.stringify({ revision: current.revision }),
      });
      setItems((list) => list.filter((item) => item.id !== selectedId));
      setSelectedId(null);
      setEditing(false);
      setNotice('Resource deleted.');
    } catch (err: any) {
      setError(err?.message || 'Could not delete this resource.');
    } finally {
      setBusy('');
    }
  };

  const uploadImage = async (file?: File) => {
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) {
      setError('Choose a PNG, JPG or WebP image up to 2 MB.');
      return;
    }
    setUploading(true);
    setError('');
    try {
      const dataUrl = await readAsDataUrl(file);
      const result = await request<{ image: { id: string; url: string } }>(API + '/media', {
        method: 'POST',
        body: JSON.stringify({ dataUrl }),
      });
      setField('coverImageUrl', result.image.url);
      setNotice('Featured image uploaded. Save the draft to keep the change.');
    } catch (err: any) {
      setError(err?.message || 'Could not upload this image.');
    } finally {
      setUploading(false);
    }
  };

  const selected = items.find((item) => item.id === selectedId) || null;

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-4 py-5 sm:px-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-[9px] font-bold uppercase tracking-[.2em] text-slate-400">Amaavigo public website</div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Resources studio</h1>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">Manage guides, use cases, insights, case studies, playbooks, templates, videos, reports and product updates from one publishing workspace.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href="/resources" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"><Eye className="h-3.5 w-3.5" /> View public page</a>
          <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"><RefreshCw className="h-3.5 w-3.5" /> Refresh</button>
          <button type="button" onClick={openNew} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800"><Plus className="h-3.5 w-3.5" /> Create resource</button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: 'All resources', value: summary.all, icon: <BookOpen className="h-4 w-4" /> },
          { label: 'Published', value: summary.published, icon: <CheckCircle2 className="h-4 w-4" /> },
          { label: 'Drafts', value: summary.drafts, icon: <FileText className="h-4 w-4" /> },
          { label: 'Archived', value: summary.archived, icon: <Archive className="h-4 w-4" /> },
        ].map((item) => <div key={item.label} className="rounded-xl border border-slate-200 bg-white p-3"><div className="flex items-center gap-2 text-[10px] font-semibold text-slate-500">{item.icon}{item.label}</div><div className="mt-2 text-2xl font-bold tabular-nums text-slate-900">{item.value}</div></div>)}
      </div>

      {error && <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
      {notice && <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />{notice}</div>}

      <div className="grid min-w-0 gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <section className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="space-y-2 border-b border-slate-100 p-3">
            <div className="relative"><Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" /><input aria-label="Search resources" className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-xs outline-none focus:border-indigo-400" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search titles, summaries, slugs…" /></div>
            <div className="grid grid-cols-2 gap-2">
              <select aria-label="Filter category" className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-[10px] text-slate-600" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option>All</option>{RESOURCE_CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select>
              <select aria-label="Filter status" className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-[10px] text-slate-600" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as any)}><option value="all">All statuses</option><option value="published">Published</option><option value="draft">Draft</option><option value="archived">Archived</option></select>
            </div>
          </div>
          <div className="max-h-[780px] overflow-y-auto divide-y divide-slate-100">
            {loading ? <div className="flex items-center gap-2 p-6 text-xs text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading resources…</div> :
              filtered.length === 0 ? <div className="p-7 text-center text-xs text-slate-500">No resources match these filters.</div> :
              filtered.map((item) => <button type="button" key={item.id} onClick={() => openEdit(item)} className={'block w-full p-3 text-left transition hover:bg-slate-50 ' + (selectedId === item.id ? 'bg-indigo-50/70' : '')}>
                <div className="flex items-start justify-between gap-2"><span className="line-clamp-2 text-xs font-bold text-slate-800">{item.draft.title}</span><span className={'shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold ' + (item.status === 'published' ? 'bg-emerald-50 text-emerald-700' : item.status === 'archived' ? 'bg-slate-100 text-slate-500' : 'bg-amber-50 text-amber-700')}>{item.status}</span></div>
                <div className="mt-1 flex items-center gap-2 text-[10px] text-slate-400"><span>{item.draft.category}</span><span>·</span><span>{RESOURCE_TYPES.find((type) => type.value === item.draft.type)?.label || 'Article'}</span>{item.isSample && <span className="text-amber-600">· Starter</span>}</div>
              </button>)}
          </div>
        </section>

        <section className="min-w-0 rounded-xl border border-slate-200 bg-white">
          {!editing ? <div className="flex min-h-[420px] flex-col items-center justify-center p-8 text-center"><span className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600"><FilePlus2 className="h-6 w-6" /></span><h2 className="mt-3 text-sm font-bold text-slate-900">Your content library</h2><p className="mt-1 max-w-sm text-xs leading-5 text-slate-500">Select a resource to edit it, or create a new guide, article, playbook, template, case study, video or product update.</p><button onClick={openNew} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white"><Plus className="h-3.5 w-3.5" /> Create your first resource</button></div> :
            <form onSubmit={(event) => { event.preventDefault(); void saveDraft(); }} className="space-y-5 p-4 sm:p-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><div className="text-[9px] font-bold uppercase tracking-[.18em] text-slate-400">{selectedId ? 'Edit resource' : 'New resource'}</div><h2 className="mt-1 text-base font-bold text-slate-900">{form.title || 'Untitled resource'}</h2></div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => setPreviewOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-[10px] font-semibold text-slate-600"><Eye className="h-3.5 w-3.5" /> Preview</button><button type="submit" disabled={saving} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-[10px] font-semibold text-slate-700 disabled:opacity-50">{saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />} Save draft</button><button type="button" onClick={() => void publish()} disabled={saving || busy !== ''} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-[10px] font-semibold text-white disabled:opacity-50"><Send className="h-3.5 w-3.5" /> Publish</button></div></div>

              <div className="grid gap-3 md:grid-cols-2">
                <label className={labelClass + ' md:col-span-2'}>Resource title<input required maxLength={140} className={inputClass} value={form.title} onChange={(event) => { const title = event.target.value; setField('title', title); if (!slugTouched) setField('slug', slugify(title)); }} placeholder="e.g. The practical guide to AI-led lead qualification" /></label>
                <label className={labelClass}>Resource category<select className={inputClass} value={form.category} onChange={(event) => setField('category', event.target.value as any)}>{RESOURCE_CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select></label>
                <label className={labelClass}>Resource format<select className={inputClass} value={form.type} onChange={(event) => setField('type', event.target.value as any)}>{RESOURCE_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
                <label className={labelClass + ' md:col-span-2'}>Short description<textarea required rows={2} maxLength={320} className={inputClass} value={form.summary} onChange={(event) => setField('summary', event.target.value)} placeholder="Explain what the reader will get from this resource." /></label>
                <label className={labelClass}>URL slug<input required disabled={Boolean(selectedId)} maxLength={120} className={inputClass} value={form.slug} onChange={(event) => { setSlugTouched(true); setField('slug', slugify(event.target.value)); }} placeholder="ai-led-lead-qualification" /><span className="mt-1 block text-[10px] font-normal normal-case tracking-normal text-slate-400">Public URL: /resources/{form.slug || 'your-resource'}</span></label>
                <label className={labelClass}>Author<input maxLength={100} className={inputClass} value={form.author} onChange={(event) => setField('author', event.target.value)} /></label>
                <label className={labelClass}>Reading time<input maxLength={40} className={inputClass} value={form.readingTime} onChange={(event) => setField('readingTime', event.target.value)} placeholder="5 min read" /></label>
                <label className={labelClass}>Display order<input type="number" min={0} max={9999} className={inputClass} value={form.order} onChange={(event) => setField('order', Number(event.target.value))} /></label>
              </div>

              {form.type === 'link' || form.type === 'video' ? <label className={labelClass}>Destination URL<input required className={inputClass} value={form.destinationUrl} onChange={(event) => setField('destinationUrl', event.target.value)} placeholder="https://… or /platform" /></label> :
                <label className={labelClass}>Resource content (Markdown)<textarea required rows={13} className={inputClass + ' font-mono text-xs leading-6'} value={form.content} onChange={(event) => setField('content', event.target.value)} placeholder={'# Start with the problem\n\nExplain the idea in a few clear paragraphs.\n\n## What to do next\n\n- First action\n- Second action\n\n**Tip:** Keep the advice practical.'} /><span className="mt-1 block text-[10px] font-normal normal-case tracking-normal text-slate-400">Supports headings (# / ##), paragraphs, bullet lists, numbered lists, bold, italic and safe links.</span></label>}

              <details className="rounded-lg border border-slate-200 p-3" open><summary className="cursor-pointer text-xs font-bold text-slate-700">Featured image & card appearance</summary><div className="mt-3 grid gap-3 md:grid-cols-2">
                <label className={labelClass + ' md:col-span-2'}>Upload cover image<input type="file" accept="image/png,image/jpeg,image/webp" className="mt-2 block w-full text-xs text-slate-600" disabled={uploading} onChange={(event) => { void uploadImage(event.target.files?.[0]); event.currentTarget.value = ''; }} /><span className="mt-1 block text-[10px] font-normal normal-case tracking-normal text-slate-400">PNG, JPG or WebP · maximum 2 MB</span></label>
                {form.coverImageUrl && <div className="md:col-span-2"><img src={form.coverImageUrl} alt={form.coverImageAlt || ''} className="max-h-48 w-full rounded-lg border border-slate-100 object-cover" /></div>}
                <label className={labelClass + ' md:col-span-2'}>Image URL<input className={inputClass} value={form.coverImageUrl} onChange={(event) => setField('coverImageUrl', event.target.value)} placeholder="Optional image URL or uploaded image" /></label>
                <label className={labelClass + ' md:col-span-2'}>Image alt text<input className={inputClass} value={form.coverImageAlt} onChange={(event) => setField('coverImageAlt', event.target.value)} maxLength={300} placeholder="Describe the image for accessibility and search engines" /></label>
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-700"><input type="checkbox" checked={form.featured} onChange={(event) => setField('featured', event.target.checked)} /> Feature this resource at the top of the library</label>
                <label className={labelClass}>Card icon<select className={inputClass} value={form.icon} onChange={(event) => setField('icon', event.target.value as any)}>{RESOURCE_ICONS.map((item) => <option key={item}>{item}</option>)}</select></label>
              </div></details>

              <details className="rounded-lg border border-slate-200 p-3"><summary className="cursor-pointer text-xs font-bold text-slate-700">Call to action & search appearance</summary><div className="mt-3 grid gap-3 md:grid-cols-2">
                <label className={labelClass}>Button label<input className={inputClass} value={form.ctaLabel} onChange={(event) => setField('ctaLabel', event.target.value)} maxLength={80} /></label>
                <label className={labelClass}>Button URL<input className={inputClass} value={form.ctaUrl} onChange={(event) => setField('ctaUrl', event.target.value)} placeholder="Optional internal path or HTTPS URL" /></label>
                <label className={labelClass + ' md:col-span-2'}>SEO title<input className={inputClass} value={form.seoTitle} onChange={(event) => setField('seoTitle', event.target.value)} maxLength={80} placeholder="Defaults to resource title" /></label>
                <label className={labelClass + ' md:col-span-2'}>Meta description<textarea className={inputClass} rows={2} value={form.metaDescription} onChange={(event) => setField('metaDescription', event.target.value)} maxLength={240} placeholder="Defaults to the short description" /></label>
                <label className={labelClass + ' md:col-span-2'}>Destination URL (optional for CTA)<input className={inputClass} value={form.destinationUrl} onChange={(event) => setField('destinationUrl', event.target.value)} placeholder="https://… or /platform" /></label>
              </div></details>

              {selected && <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4"><div className="text-[10px] text-slate-400">Revision {selected.revision} · Last updated {selected.updatedAt ? new Date(selected.updatedAt).toLocaleString() : '—'} · Published revision {selected.publishedRevision}</div><div className="flex flex-wrap gap-2">{selected.status === 'published' && <button type="button" disabled={busy !== ''} onClick={() => void changeStatus('unpublish')} className="rounded-lg border border-slate-200 px-3 py-2 text-[10px] font-semibold text-slate-600">Unpublish</button>}{selected.status !== 'archived' && <button type="button" disabled={busy !== ''} onClick={() => void changeStatus('archive')} className="rounded-lg border border-slate-200 px-3 py-2 text-[10px] font-semibold text-slate-600"><Archive className="mr-1 inline h-3 w-3" /> Archive</button>}<button type="button" disabled={busy !== ''} onClick={() => void remove()} className="rounded-lg border border-rose-200 px-3 py-2 text-[10px] font-semibold text-rose-600"><Trash2 className="mr-1 inline h-3 w-3" /> Delete</button></div></div>}
            </form>}
        </section>
      </div>

      {previewOpen && <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4 sm:p-8" role="dialog" aria-modal="true" aria-label="Resource preview"><div className="my-auto w-full max-w-3xl rounded-2xl bg-white p-5 shadow-2xl sm:p-8"><div className="flex items-center justify-between"><span className="text-[9px] font-bold uppercase tracking-[.18em] text-indigo-600">Draft preview · not public</span><button type="button" onClick={() => setPreviewOpen(false)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button></div><div className="mt-6">{form.coverImageUrl && <img src={form.coverImageUrl} alt={form.coverImageAlt} className="mb-6 max-h-64 w-full rounded-xl object-cover" />}<span className="text-[10px] font-bold uppercase tracking-[.15em] text-indigo-600">{form.category} · {RESOURCE_TYPES.find((item) => item.value === form.type)?.label}</span><h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">{form.title || 'Untitled resource'}</h2><p className="mt-3 text-sm leading-6 text-slate-500">{form.summary}</p><div className="mt-5 whitespace-pre-wrap border-t border-slate-100 pt-5 text-sm leading-7 text-slate-700">{form.content || form.destinationUrl}</div></div></div></div>}
    </div>
  );
}
