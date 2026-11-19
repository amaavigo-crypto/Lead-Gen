import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy, ImagePlus, Loader2, Search, Upload, X } from 'lucide-react';
import { fileToDataUrl, getImageDimensions } from '../services/assetClientService.js';
import { fetchPlatformAssets, uploadPlatformAsset, type PlatformSiteAsset } from '../services/platformAssetClientService.js';

interface ResourceAssetLibraryProps {
  onClose: () => void;
  onUse: (asset: PlatformSiteAsset, purpose: 'content' | 'cover') => void;
}

export default function ResourceAssetLibrary({ onClose, onUse }: ResourceAssetLibraryProps) {
  const [assets, setAssets] = useState<PlatformSiteAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try { setAssets(await fetchPlatformAssets()); }
    catch (err: any) { setError(err?.message || 'Could not load images.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase();
    return assets.filter((asset) => !value || [asset.name, asset.altText, asset.mimeType].some((item) => String(item || '').toLowerCase().includes(value)));
  }, [assets, query]);

  const handleUpload = async (file?: File) => {
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) {
      setError('Choose a PNG, JPG or WebP image up to 2 MB.');
      if (fileRef.current) fileRef.current.value = '';
      return;
    }
    setUploading(true);
    setError('');
    setNotice('');
    try {
      const dataUrl = await fileToDataUrl(file);
      const dimensions = await getImageDimensions(dataUrl);
      const asset = await uploadPlatformAsset({
        name: file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').slice(0, 120) || 'Resource image',
        mimeType: file.type,
        dataUrl,
        size: file.size,
        dimensions,
        altText: file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').slice(0, 300),
      });
      setAssets((current) => [asset, ...current.filter((item) => item.id !== asset.id)]);
      setNotice('Image uploaded. It is now available to reuse in any public resource.');
    } catch (err: any) { setError(err?.message || 'Image upload failed.'); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  const copyUrl = async (asset: PlatformSiteAsset) => {
    try { await navigator.clipboard.writeText(new URL(asset.url, window.location.origin).toString()); setNotice('Image URL copied.'); }
    catch { setError('Could not copy the image URL in this browser.'); }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center overflow-y-auto bg-slate-950/60 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label="Platform image library">
      <div className="my-auto flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div><div className="text-[9px] font-bold uppercase tracking-[.18em] text-indigo-600">Shared platform media</div><h2 className="mt-1 text-lg font-bold text-slate-900">Resource image library</h2><p className="mt-1 text-xs text-slate-500">Images uploaded here use the existing public asset URL mechanism and remain separate from tenant assets.</p></div>
          <div className="flex items-center gap-2">
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(event) => { void handleUpload(event.target.files?.[0]); }} />
            <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"><Upload size={14} /> {uploading ? 'Uploading…' : 'Upload image'}</button>
            <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Close image library"><X size={18} /></button>
          </div>
        </header>
        <div className="border-b border-slate-100 p-3">
          <div className="relative max-w-sm"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search image names…" className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-xs outline-none focus:border-indigo-400" /></div>
          {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}
          {notice && <p className="mt-2 text-xs text-emerald-700"><Check size={12} className="mr-1 inline" />{notice}</p>}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {loading ? <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" /> Loading images…</div> :
            filtered.length === 0 ? <div className="py-12 text-center text-sm text-slate-500"><ImagePlus size={24} className="mx-auto mb-2 text-slate-300" />No images yet. Upload the first platform image.</div> :
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((asset) => <article key={asset.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <div className="flex h-40 items-center justify-center bg-slate-50"><img src={asset.url} alt={asset.altText || asset.name} className="max-h-full max-w-full object-contain" /></div>
                <div className="space-y-2 p-3">
                  <div className="truncate text-xs font-semibold text-slate-800" title={asset.name}>{asset.name}</div>
                  <div className="text-[10px] text-slate-400">{asset.mimeType} · {asset.sizeFormatted} · {asset.dimensions?.width || 0} × {asset.dimensions?.height || 0}</div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => onUse(asset, 'content')} className="flex-1 rounded-lg bg-indigo-600 px-2 py-2 text-[10px] font-semibold text-white">Insert in article</button>
                    <button type="button" onClick={() => onUse(asset, 'cover')} className="flex-1 rounded-lg border border-slate-200 px-2 py-2 text-[10px] font-semibold text-slate-700">Use as cover</button>
                    <button type="button" onClick={() => void copyUrl(asset)} className="rounded-lg border border-slate-200 p-2 text-slate-500" title="Copy URL"><Copy size={13} /></button>
                  </div>
                </div>
              </article>)}
            </div>}
        </div>
      </div>
    </div>
  );
}
