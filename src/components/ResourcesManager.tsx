import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle, Archive, BookOpen, CheckCircle2, Eye,
  FilePlus2, FileText, ImagePlus, Loader2, Plus, RefreshCw,
  Search, Send, Trash2, X, Monitor, Smartphone, FileUp,
} from 'lucide-react';
import {
  RESOURCE_CATEGORIES, type ResourceCategory,
  type ResourceStatus, type SiteResourceAdminRecord, type SiteResourceFields,
} from '../shared/siteResources.js';
import ResourceHtmlEditor from './ResourceHtmlEditor.js';
import ResourceAssetLibrary from './ResourceAssetLibrary.js';
import { importResourceFile } from '../services/resourceArchiveImport.js';
import { getImageDimensions } from '../services/assetClientService.js';
import { uploadPlatformAsset, type PlatformSiteAsset } from '../services/platformAssetClientService.js';
import { sanitizeResourceHtml } from '../shared/resourceHtml.js';

const API = '/api/platform/site-resources';
const blankResource = (order: number): SiteResourceFields => ({
  title: '',
  slug: '',
  summary: '',
  category: 'Guides',
  type: 'article',
  content: '',
  contentFormat: 'html',
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

function estimateReadingTime(content: string, format: SiteResourceFields['contentFormat']): string {
  const plainText = (format === 'html' ? content.replace(/<[^>]+>/g, ' ') : content)
    .replace(/&nbsp;|&#160;/gi, ' ');
  const words = plainText.trim().match(/\S+/g)?.length || 0;
  return words ? Math.max(1, Math.ceil(words / 200)) + ' min read' : '';
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
  const [assetLibraryOpen, setAssetLibraryOpen] = useState(false);
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop');

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
    setForm({ ...item.draft, contentFormat: item.draft.contentFormat || 'markdown' });
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
      const resourcePayload = {
        ...form,
        readingTime: form.type === 'link' || form.type === 'video'
          ? ''
          : estimateReadingTime(form.content, form.contentFormat),
      };
      if (!selectedId) {
        result = await request<{ resource: SiteResourceAdminRecord }>(API, {
          method: 'POST',
          body: JSON.stringify({ resource: resourcePayload }),
        });
        setSelectedId(result.resource.id);
      } else {
        const current = items.find((item) => item.id === selectedId);
        if (!current) throw new Error('This resource is no longer in the library. Reload and try again.');
        result = await request<{ resource: SiteResourceAdminRecord }>(API + '/' + encodeURIComponent(selectedId), {
          method: 'PUT',
          body: JSON.stringify({ resource: resourcePayload, revision: current.revision }),
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

  const openAssetLibrary = (_purpose: 'content' | 'cover') => setAssetLibraryOpen(true);

  const usePlatformAsset = (asset: PlatformSiteAsset, purpose: 'content' | 'cover') => {
    if (purpose === 'cover') {
      setField('coverImageUrl', asset.url);
      setField('coverImageAlt', asset.altText || asset.name);
      setNotice('Cover image selected from the platform asset library. Save the draft to keep the change.');
    } else {
      const currentHtml = form.contentFormat === 'markdown' ? legacyMarkdownToHtml(form.content) : form.content;
      const imageHtml = '<figure><img src="' + escapeHtmlAttribute(asset.url) + '" alt="' + escapeHtmlAttribute(asset.altText || asset.name) + '" loading="lazy" /></figure>';
      setField('contentFormat', 'html');
      setField('content', (currentHtml.trim() ? currentHtml.trim() + '\n' : '') + imageHtml);
      setNotice('Image URL inserted into the article HTML. You can reposition it in the visual editor.');
    }
    setAssetLibraryOpen(false);
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
      const dimensions = await getImageDimensions(dataUrl);
      const asset = await uploadPlatformAsset({
        name: file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').slice(0, 120) || 'Resource image',
        mimeType: file.type,
        dataUrl,
        size: file.size,
        dimensions,
        altText: file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').slice(0, 300),
      });
      setField('coverImageUrl', asset.url);
      setField('coverImageAlt', asset.altText || asset.name);
      setNotice('Image uploaded to the shared platform asset library. Save the draft to keep the change.');
    } catch (err: any) {
      setError(err?.message || 'Could not upload this image.');
    } finally {
      setUploading(false);
    }
  };

  const importPackage = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    setError('');
    setNotice('');
    try {
      const imported = await importResourceFile(file, async (name, dataUrl, mimeType, size) => {
        const dimensions = await getImageDimensions(dataUrl);
        const asset = await uploadPlatformAsset({
          name: name.replace(/\.[^.]+$/, '').slice(0, 120) || 'Resource image',
          mimeType,
          dataUrl,
          size,
          dimensions,
          altText: name.replace(/\.[^.]+$/, '').slice(0, 300) || 'Resource image',
        });
        return asset.url;
      });
      setField('contentFormat', 'html');
      setField('content', imported.html);
      if (!form.title.trim() && imported.suggestedTitle) {
        setField('title', imported.suggestedTitle.slice(0, 140));
        if (!slugTouched) setField('slug', slugify(imported.suggestedTitle));
      }
      setNotice('Imported HTML successfully' + (imported.uploadedImages ? ' and uploaded ' + imported.uploadedImages + ' image(s) to the platform library.' : '.'));
    } catch (err: any) {
      setError(err?.message || 'Could not import this blog package.');
    } finally {
      setUploading(false);
    }
  };

  const selected = items.find((item) => item.id === selectedId) || null;

  function escapeHtmlAttribute(value: string) { return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function legacyMarkdownToHtml(markdown: string) { return markdown.split(/\n\s*\n/).map((block) => { const trimmed = block.trim(); if (!trimmed) return ''; const heading = trimmed.match(/^(#{1,3})\s+(.+)$/); if (heading) return '<h' + (heading[1].length + 1) + '>' + escapeHtmlAttribute(heading[2]) + '</h' + (heading[1].length + 1) + '>'; if (/^[-*]\s/m.test(trimmed)) return '<ul>' + trimmed.split('\n').map((line) => line.replace(/^[-*]\s+/, '')).map((line) => '<li>' + escapeHtmlAttribute(line) + '</li>').join('') + '</ul>'; return '<p>' + escapeHtmlAttribute(trimmed).replace(/\n/g, '<br />') + '</p>'; }).join('\n'); }

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
                <div className="mt-1 flex items-center gap-2 text-[10px] text-slate-400"><span>{item.draft.category}</span>{item.isSample && <span className="text-amber-600">· Starter</span>}</div>
              </button>)}
          </div>
        </section>

        <section className="min-w-0 rounded-xl border border-slate-200 bg-white">
          {!editing ? <div className="flex min-h-[420px] flex-col items-center justify-center p-8 text-center"><span className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600"><FilePlus2 className="h-6 w-6" /></span><h2 className="mt-3 text-sm font-bold text-slate-900">Your content library</h2><p className="mt-1 max-w-sm text-xs leading-5 text-slate-500">Select a resource to edit it, or create a new guide, article, playbook, template, case study, video or product update.</p><button onClick={openNew} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white"><Plus className="h-3.5 w-3.5" /> Create your first resource</button></div> :
            <form onSubmit={(event) => { event.preventDefault(); void saveDraft(); }} className="space-y-5 p-4 sm:p-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><div className="text-[9px] font-bold uppercase tracking-[.18em] text-slate-400">{selectedId ? 'Edit resource' : 'New resource'}</div><h2 className="mt-1 text-base font-bold text-slate-900">{form.title || 'Untitled resource'}</h2></div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => setPreviewOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-[10px] font-semibold text-slate-600"><Eye className="h-3.5 w-3.5" /> Preview</button><button type="submit" disabled={saving} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-[10px] font-semibold text-slate-700 disabled:opacity-50">{saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />} Save draft</button><button type="button" onClick={() => void publish()} disabled={saving || busy !== ''} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-[10px] font-semibold text-white disabled:opacity-50"><Send className="h-3.5 w-3.5" /> Publish</button></div></div>

              <div className="space-y-5">
                <section className="rounded-xl border border-slate-200 p-4">
                  <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className={labelClass}>Content & organisation</div>
                      <p className="mt-1 text-xs text-slate-500">Choose one category. It appears on the public resource card and controls the library filter.</p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-500">{selectedId ? 'Editing existing URL' : 'New resource'}</span>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className={labelClass + ' md:col-span-2'}>Resource title
                      <input required maxLength={140} className={inputClass} value={form.title} onChange={(event) => {
                        const title = event.target.value;
                        setField('title', title);
                        if (!slugTouched) setField('slug', slugify(title));
                      }} placeholder="e.g. The practical guide to AI-led lead qualification" />
                    </label>
                    <label className={labelClass}>Resource category
                      <select className={inputClass} value={form.category} onChange={(event) => {
                        const category = event.target.value as ResourceCategory;
                        setField('category', category);
                        setField('type', category === 'Videos' ? 'video' : category === 'External links' ? 'link' : 'article');
                        const categoryIcons: Record<string, SiteResourceFields['icon']> = {
                          'Guides': 'BookOpen', 'Use cases': 'CalendarCheck', 'Insights': 'BarChart3',
                          'Case studies': 'Newspaper', 'Playbooks': 'FileText', 'Templates': 'FileText',
                          'Videos': 'Headphones', 'Reports': 'BarChart3', 'Product updates': 'Sparkles',
                          'External links': 'BookOpen',
                        };
                        setField('icon', categoryIcons[category] || 'BookOpen');
                      }}>
                        {RESOURCE_CATEGORIES.map((item) => <option key={item}>{item}</option>)}
                      </select>
                    </label>
                    <label className={labelClass}>Public URL slug
                      <input required disabled={Boolean(selectedId)} maxLength={120} className={inputClass} value={form.slug} onChange={(event) => {
                        setSlugTouched(true);
                        setField('slug', slugify(event.target.value));
                      }} placeholder="resource-url-slug" />
                      <span className="mt-1 block text-[10px] font-normal normal-case tracking-normal text-slate-400">/resources/{form.slug || 'your-resource'}{selectedId ? ' · locked after first save' : ''}</span>
                    </label>
                    <label className={labelClass + ' md:col-span-2'}>Short description
                      <textarea required rows={2} maxLength={320} className={inputClass} value={form.summary} onChange={(event) => setField('summary', event.target.value)} placeholder="Explain what the reader will learn or get from this resource." />
                    </label>
                  </div>
                </section>

                {form.type === 'link' || form.type === 'video' ? (
                  <section className="rounded-xl border border-slate-200 p-4">
                    <div className={labelClass}>{form.type === 'video' ? 'Video URL' : 'External resource URL'}</div>
                    <p className="mt-1 text-xs text-slate-500">Visitors will open this destination directly from the Resources card.</p>
                    <input required className={inputClass} value={form.destinationUrl} onChange={(event) => setField('destinationUrl', event.target.value)} placeholder="https://…" />
                  </section>
                ) : (
                  <section className="rounded-xl border border-slate-200 p-4">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className={labelClass}>Article content</div>
                        <p className="mt-1 text-xs text-slate-500">Write visually, edit HTML, or import a complete HTML / ZIP package. Reading time is calculated automatically.</p>
                      </div>
                      <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] font-semibold text-slate-700 hover:bg-slate-50">
                        <FileUp className="h-3.5 w-3.5" /> {uploading ? 'Importing…' : 'Import HTML / ZIP'}
                        <input type="file" accept=".html,.htm,.zip,text/html,application/zip" className="hidden" disabled={uploading} onChange={(event) => {
                          void importPackage(event.target.files?.[0]);
                          event.currentTarget.value = '';
                        }} />
                      </label>
                    </div>
                    {form.contentFormat === 'markdown' ? (
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className={labelClass}>Legacy Markdown content</span>
                          <button type="button" onClick={() => {
                            setField('content', legacyMarkdownToHtml(form.content));
                            setField('contentFormat', 'html');
                          }} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] font-semibold text-slate-700">Convert to visual editor</button>
                        </div>
                        <textarea required rows={13} className={inputClass + ' font-mono text-xs leading-6'} value={form.content} onChange={(event) => setField('content', event.target.value)} />
                      </div>
                    ) : (
                      <ResourceHtmlEditor value={form.content} onChange={(value) => setField('content', value)} onOpenImageLibrary={() => openAssetLibrary('content')} />
                    )}
                    <p className="mt-2 text-[10px] leading-5 text-slate-400">ZIP images are added to the shared platform library and their paths are rewritten to reusable asset URLs. Unsafe scripts and embeds are removed before publishing.</p>
                  </section>
                )}

                <section className="rounded-xl border border-slate-200 p-4">
                  <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className={labelClass}>Cover image <span className="font-medium normal-case tracking-normal text-slate-400">· optional</span></div>
                      <p className="mt-1 text-xs text-slate-500">Used on the public resource card, article page and social sharing previews.</p>
                    </div>
                    {form.featured && <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[10px] font-semibold text-indigo-700">Pinned to top</span>}
                  </div>
                  {form.coverImageUrl && (
                    <div className="mb-3 flex flex-wrap items-start gap-3 rounded-lg border border-slate-100 bg-slate-50 p-2.5">
                      <img src={form.coverImageUrl} alt={form.coverImageAlt || ''} className="h-24 w-36 rounded-md object-cover" />
                      <div className="min-w-0 flex-1">
                        <div className="break-all text-[10px] font-semibold text-slate-600">{form.coverImageUrl}</div>
                        <button type="button" onClick={() => {
                          setField('coverImageUrl', '');
                          setField('coverImageAlt', '');
                        }} className="mt-2 text-[10px] font-semibold text-rose-600 hover:text-rose-700">Remove cover image</button>
                      </div>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] font-semibold text-slate-700 hover:bg-slate-50">
                      <ImagePlus className="h-3.5 w-3.5" /> {uploading ? 'Uploading…' : 'Upload cover'}
                      <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" disabled={uploading} onChange={(event) => {
                        void uploadImage(event.target.files?.[0]);
                        event.currentTarget.value = '';
                      }} />
                    </label>
                    <button type="button" onClick={() => openAssetLibrary('cover')} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] font-semibold text-slate-700 hover:bg-slate-50">
                      <ImagePlus className="h-3.5 w-3.5" /> Choose from image library
                    </button>
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <label className={labelClass + ' md:col-span-2'}>Or paste a cover image URL
                      <input className={inputClass} value={form.coverImageUrl} onChange={(event) => setField('coverImageUrl', event.target.value)} placeholder="https://… or /api/assets/…" />
                    </label>
                    <label className={labelClass + ' md:col-span-2'}>Image description (alt text)
                      <input className={inputClass} value={form.coverImageAlt} onChange={(event) => setField('coverImageAlt', event.target.value)} maxLength={300} placeholder="Describe what the image shows for accessibility." />
                    </label>
                    <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 md:col-span-2">
                      <input type="checkbox" checked={form.featured} onChange={(event) => setField('featured', event.target.checked)} />
                      Pin this resource to the top of the public Resources page
                    </label>
                  </div>
                </section>

                <details className="rounded-xl border border-slate-200 p-4">
                  <summary className="cursor-pointer text-xs font-bold text-slate-700">Search appearance <span className="font-normal text-slate-400">· optional overrides</span></summary>
                  <div className="mt-3 grid gap-3">
                    <p className="text-xs text-slate-500">Leave these blank to use the resource title and short description automatically.</p>
                    <label className={labelClass}>SEO title
                      <input className={inputClass} value={form.seoTitle} onChange={(event) => setField('seoTitle', event.target.value)} maxLength={80} placeholder={form.title || 'Defaults to resource title'} />
                    </label>
                    <label className={labelClass}>Meta description
                      <textarea className={inputClass} rows={2} value={form.metaDescription} onChange={(event) => setField('metaDescription', event.target.value)} maxLength={240} placeholder={form.summary || 'Defaults to the short description'} />
                    </label>
                  </div>
                </details>
              </div>

              {selected && <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4"><div className="text-[10px] text-slate-400">Revision {selected.revision} · Last updated {selected.updatedAt ? new Date(selected.updatedAt).toLocaleString() : '—'} · Published revision {selected.publishedRevision}</div><div className="flex flex-wrap gap-2">{selected.status === 'published' && <button type="button" disabled={busy !== ''} onClick={() => void changeStatus('unpublish')} className="rounded-lg border border-slate-200 px-3 py-2 text-[10px] font-semibold text-slate-600">Unpublish</button>}{selected.status !== 'archived' && <button type="button" disabled={busy !== ''} onClick={() => void changeStatus('archive')} className="rounded-lg border border-slate-200 px-3 py-2 text-[10px] font-semibold text-slate-600"><Archive className="mr-1 inline h-3 w-3" /> Archive</button>}<button type="button" disabled={busy !== ''} onClick={() => void remove()} className="rounded-lg border border-rose-200 px-3 py-2 text-[10px] font-semibold text-rose-600"><Trash2 className="mr-1 inline h-3 w-3" /> Delete</button></div></div>}
            </form>}
        </section>
      </div>

      {previewOpen && <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4 sm:p-8" role="dialog" aria-modal="true" aria-label="Resource preview"><div className={'my-auto w-full rounded-2xl bg-white p-5 shadow-2xl transition-all sm:p-8 ' + (previewDevice === 'mobile' ? 'max-w-[390px]' : 'max-w-5xl')}><div className="flex flex-wrap items-center justify-between gap-3"><div><span className="text-[9px] font-bold uppercase tracking-[.18em] text-indigo-600">Draft preview · not public</span><p className="mt-1 text-xs text-slate-500">Preview the article at desktop or mobile width.</p></div><div className="flex items-center gap-2"><button type="button" onClick={() => setPreviewDevice('desktop')} className={'rounded-lg border p-2 ' + (previewDevice === 'desktop' ? 'border-indigo-200 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-500')} aria-label="Desktop preview"><Monitor size={15} /></button><button type="button" onClick={() => setPreviewDevice('mobile')} className={'rounded-lg border p-2 ' + (previewDevice === 'mobile' ? 'border-indigo-200 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-500')} aria-label="Mobile preview"><Smartphone size={15} /></button><button type="button" onClick={() => setPreviewOpen(false)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Close preview"><X className="h-4 w-4" /></button></div></div><article className="mx-auto mt-6 max-w-3xl"><div className="border-b border-slate-100 pb-5">{form.coverImageUrl && <img src={form.coverImageUrl} alt={form.coverImageAlt} className="mb-6 max-h-64 w-full rounded-xl object-cover" />}<span className="text-[10px] font-bold uppercase tracking-[.15em] text-indigo-600">{form.category}</span><h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">{form.title || 'Untitled resource'}</h2><p className="mt-3 text-sm leading-6 text-slate-500">{form.summary}</p></div><div className="mt-5 border-t border-slate-100 pt-5 text-sm leading-7 text-slate-700">{form.contentFormat === 'html' ? <div className="sx-resource-html-content" dangerouslySetInnerHTML={{ __html: sanitizeResourceHtml(form.content) }} /> : <div className="whitespace-pre-wrap">{form.content || form.destinationUrl}</div>}</div></article></div></div>}
      {assetLibraryOpen && <ResourceAssetLibrary onClose={() => setAssetLibraryOpen(false)} onUse={usePlatformAsset} />}
    </div>
  );
}
