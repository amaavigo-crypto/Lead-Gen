import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock3, Eye, Globe2, History, Loader2, Save, Search, Send, Undo2 } from 'lucide-react';
import { SEO_PAGES, resolveSeo, type SeoFields, type SeoSettings } from '../shared/seoSettings.js';

type Version = { version: number; publishedAt?: string; publishedBy?: string; pageCount: number };
type AdminData = {
  published: { version: number; seo: SeoSettings; publishedAt?: string; publishedBy?: string };
  draft: { seo: SeoSettings; updatedAt: string; updatedBy: string } | null;
  versions: Version[];
};

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || 'Request failed (' + response.status + ')');
  return data as T;
}
const post = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) });
const dateLabel = (value?: string) => value ? new Date(value).toLocaleString() : '—';

export default function SeoSettingsEditor() {
  const [data, setData] = useState<AdminData | null>(null);
  const [seoMap, setSeoMap] = useState<SeoSettings>({});
  const [selectedPath, setSelectedPath] = useState('/');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try {
      const result = await request<AdminData>('/api/platform/site-seo');
      setData(result);
      setSeoMap(result.draft?.seo || result.published?.seo || {});
    } catch (err: any) { setError(err?.message || 'Could not load SEO settings.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const page = SEO_PAGES.find((item) => item.path === selectedPath) || SEO_PAGES[0];
  const seo = useMemo(() => resolveSeo(seoMap, selectedPath)!, [seoMap, selectedPath]);
  const filteredPages = SEO_PAGES.filter((item) => (item.label + ' ' + item.path).toLowerCase().includes(search.trim().toLowerCase()));
  const changedCount = Object.keys(seoMap).length;
  const update = <K extends keyof SeoFields>(key: K, value: SeoFields[K]) => {
    setSeoMap((current) => ({ ...current, [selectedPath]: { ...(current[selectedPath] || {}), [key]: value } }));
    setNotice('');
  };
  const action = async (name: 'draft' | 'publish' | 'discard' | 'restore', body: unknown = {}) => {
    setSaving(true); setError(''); setNotice('');
    try {
      const result = await request<AdminData>('/api/platform/site-seo/' + name, post(body));
      setData(result);
      setSeoMap(result.draft?.seo || result.published?.seo || {});
      setNotice(name === 'publish' ? 'SEO settings published successfully.' : name === 'draft' ? 'Draft saved. It is not live until published.' : name === 'discard' ? 'Draft discarded.' : 'Previous version restored as a draft.');
    } catch (err: any) { setError(err?.message || 'Could not update SEO settings.'); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading website SEO settings…</div>;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.18em] text-slate-400"><Globe2 className="h-3.5 w-3.5" /> Search visibility</div>
          <h1 className="mt-1 text-xl font-bold tracking-tight text-slate-900">Website SEO</h1>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">Manage search titles, descriptions, social previews, canonical URLs and indexing for every public Amaavigo page. Changes are versioned and only go live when published.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] font-semibold text-slate-600">Published v{data?.published?.version || 0}</span>
          {data?.draft && <span className="rounded-lg bg-amber-50 px-3 py-2 text-[10px] font-semibold text-amber-700">Unpublished draft</span>}
          <button type="button" onClick={() => void load()} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] font-semibold text-slate-600 hover:bg-slate-50">Refresh</button>
        </div>
      </div>

      {error && <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div>}
      {notice && <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700"><CheckCircle2 className="h-4 w-4 shrink-0" />{notice}</div>}

      <div className="grid min-w-0 gap-4 xl:grid-cols-[250px_minmax(0,1fr)]">
        <aside className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 p-3">
            <div className="relative"><Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find a page…" className="w-full rounded-lg border border-slate-200 py-2 pl-8 pr-3 text-xs outline-none focus:border-orange-400" /></div>
            <p className="mt-2 text-[10px] text-slate-400">{SEO_PAGES.length} public pages</p>
          </div>
          <div className="max-h-[560px] overflow-y-auto p-2">
            {filteredPages.map((item) => <button key={item.path} type="button" onClick={() => setSelectedPath(item.path)} className={'mb-1 flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-xs transition ' + (selectedPath === item.path ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50')}>
              <span><span className="block font-semibold">{item.label}</span><span className={'mt-0.5 block text-[10px] ' + (selectedPath === item.path ? 'text-slate-300' : 'text-slate-400')}>{item.path}</span></span>
              {seoMap[item.path] && <span className={'h-1.5 w-1.5 rounded-full ' + (selectedPath === item.path ? 'bg-orange-300' : 'bg-orange-500')} />}
            </button>)}
          </div>
        </aside>

        <div className="min-w-0 space-y-4">
          <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3">
              <div><div className="text-[9px] font-bold uppercase tracking-[.16em] text-slate-400">Page settings</div><h2 className="mt-1 text-base font-bold text-slate-900">{page.label}</h2><p className="mt-0.5 text-[10px] text-slate-400">{page.path}</p></div>
              <a href={page.path} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-[10px] font-semibold text-slate-600 hover:bg-slate-50"><Eye className="h-3.5 w-3.5" /> View page</a>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <label className="block"><span className="mb-1 block text-[11px] font-semibold text-slate-700">Page title <span className="font-normal text-slate-400">({seo.title.length}/70)</span></span><input maxLength={70} value={seo.title} onChange={(e) => update('title', e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-xs outline-none focus:border-orange-400" /></label>
              <label className="block"><span className="mb-1 block text-[11px] font-semibold text-slate-700">Meta description <span className="font-normal text-slate-400">({seo.description.length}/320)</span></span><textarea maxLength={320} rows={3} value={seo.description} onChange={(e) => update('description', e.target.value)} className="w-full resize-y rounded-lg border border-slate-200 px-3 py-2.5 text-xs outline-none focus:border-orange-400" /></label>
              <label className="block"><span className="mb-1 block text-[11px] font-semibold text-slate-700">Social share title</span><input maxLength={70} value={seo.ogTitle} onChange={(e) => update('ogTitle', e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-xs outline-none focus:border-orange-400" /></label>
              <label className="block"><span className="mb-1 block text-[11px] font-semibold text-slate-700">Social share description</span><textarea maxLength={320} rows={3} value={seo.ogDescription} onChange={(e) => update('ogDescription', e.target.value)} className="w-full resize-y rounded-lg border border-slate-200 px-3 py-2.5 text-xs outline-none focus:border-orange-400" /></label>
              <label className="block lg:col-span-2"><span className="mb-1 block text-[11px] font-semibold text-slate-700">Social share image URL</span><input value={seo.ogImage} onChange={(e) => update('ogImage', e.target.value)} placeholder="/images/amaavigo-share.png or https://…" className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-xs outline-none focus:border-orange-400" /><span className="mt-1 block text-[10px] text-slate-400">Use an HTTPS image URL or a path from this website.</span></label>
              <label className="block lg:col-span-2"><span className="mb-1 block text-[11px] font-semibold text-slate-700">Canonical path</span><input value={seo.canonicalPath} onChange={(e) => update('canonicalPath', e.target.value)} placeholder={page.path} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-xs outline-none focus:border-orange-400" /><span className="mt-1 block text-[10px] text-slate-400">Usually the same as the page path. Point duplicate or alternate URLs to the preferred page.</span></label>
              <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-700 lg:col-span-2"><input type="checkbox" checked={seo.noindex} onChange={(e) => update('noindex', e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-orange-600 focus:ring-orange-500" /><span><strong className="block">Hide this page from search engines</strong><span className="text-[10px] text-slate-500">Adds noindex, nofollow and removes the page from the sitemap.</span></span></label>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.16em] text-slate-400"><Eye className="h-3.5 w-3.5" /> Search result preview</div>
            <div className="mt-3 max-w-2xl"><div className="text-[10px] text-slate-500">amaavigo.com › {page.path === '/' ? '' : page.path.slice(1).split('/').join(' › ')}</div><div className="mt-1 text-lg leading-snug text-blue-700">{seo.title || 'Page title'}</div><p className="mt-1 text-xs leading-5 text-slate-600">{seo.description || 'Your meta description will appear here.'}</p></div>
            <div className="mt-4 border-t border-slate-100 pt-3 text-[10px] text-slate-400">Social title: {seo.ogTitle || seo.title} · Canonical: {seo.canonicalPath}</div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3"><div><div className="text-[10px] font-bold uppercase tracking-[.16em] text-slate-400">Publishing</div><p className="mt-1 text-[10px] text-slate-500">Draft changes do not affect the live website until published.</p></div><div className="flex flex-wrap gap-2">
              <button type="button" disabled={saving} onClick={() => void action('draft', { seo: seoMap })} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><Save className="h-3.5 w-3.5" /> Save draft</button>
              <button type="button" disabled={saving} onClick={() => void action('publish', { seo: seoMap })} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-[10px] font-semibold text-white hover:bg-slate-800 disabled:opacity-50"><Send className="h-3.5 w-3.5" /> Publish live</button>
              <button type="button" disabled={saving || !data?.draft} onClick={() => void action('discard')} className="rounded-lg border border-slate-200 px-3 py-2 text-[10px] font-semibold text-slate-500 hover:bg-slate-50 disabled:opacity-40">Discard draft</button>
            </div></div>
            {saving && <p className="mt-3 flex items-center gap-2 text-[10px] text-slate-400"><Loader2 className="h-3 w-3 animate-spin" /> Saving changes…</p>}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.16em] text-slate-400"><History className="h-3.5 w-3.5" /> Version history</div>
            <div className="mt-3 divide-y divide-slate-100">
              {(data?.versions || []).length === 0 ? <p className="py-3 text-xs text-slate-400">Published versions will appear here after the first update.</p> : data!.versions.map((version) => <div key={version.version} className="flex flex-wrap items-center justify-between gap-2 py-2.5"><div><p className="text-xs font-semibold text-slate-700">Version {version.version}</p><p className="text-[10px] text-slate-400">{dateLabel(version.publishedAt)} · {version.pageCount} configured pages · {version.publishedBy || 'Unknown editor'}</p></div><button type="button" disabled={saving} onClick={() => void action('restore', { version: version.version })} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"><Undo2 className="h-3 w-3" /> Restore as draft</button></div>)}
            </div>
          </section>
          {data?.published?.publishedAt && <p className="flex items-center gap-1.5 text-[10px] text-slate-400"><Clock3 className="h-3 w-3" /> Last published {dateLabel(data.published.publishedAt)} by {data.published.publishedBy || 'an administrator'}.</p>}
        </div>
      </div>
    </div>
  );
}
