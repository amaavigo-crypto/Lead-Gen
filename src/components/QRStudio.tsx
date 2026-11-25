import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowDown, ArrowLeft, ArrowUp, BarChart3, Bell, BookOpen, Check, ChevronDown, ChevronRight, CirclePause, Copy,
  Download, ExternalLink, Eye, FileImage, FileText, Filter, Globe, Image as ImageIcon, Layers3, Link2, Loader2,
  Menu as MenuIcon, MessageCircle, MoreHorizontal, Palette, PanelRight, Play, Plus, QrCode, RefreshCw, Save, Search,
  Settings2, Sparkles, Trash2, Upload, Video, WandSparkles, X, Zap,
} from 'lucide-react';
import { authFetch } from '../services/authService';
import { fileToDataUrl, getImageDimensions, uploadCompanyAsset } from '../services/assetClientService';
import { renderQrSvg } from '../shared/qrCodeGenerator';
import { createQrPrintDesign } from '../shared/qrStudio';
import type { QrCodeStatus, QrDestinationType, QrFormField, QrPageBlock, QrPageDocument, QrSavedTheme, QrStudioCode, QrTemplateType } from '../shared/qrStudio';
import { QrExperienceRenderer } from './PublicQrExperience';
import { QrPrintDesigner } from './QrPrintDesigner';

type Props = { tenantId: string };
type MainTab = 'overview' | 'codes' | 'analytics' | 'themes';

const TEMPLATES: Array<{ id: QrTemplateType; name: string; description: string; icon: React.ReactNode }> = [
  { id: 'menu', name: 'Digital menu', description: 'Categories, items and prices', icon: <MenuIcon className="h-5 w-5" /> },
  { id: 'business-profile', name: 'Business profile', description: 'About, services and contact actions', icon: <Globe className="h-5 w-5" /> },
  { id: 'offer', name: 'Offer or promotion', description: 'A branded offer with a clear CTA', icon: <Zap className="h-5 w-5" /> },
  { id: 'lead-capture', name: 'Lead capture', description: 'Collect enquiries directly into CRM', icon: <Plus className="h-5 w-5" /> },
  { id: 'blank', name: 'Start from blank', description: 'Build a completely custom page', icon: <Layers3 className="h-5 w-5" /> },
];

const BLOCKS: Array<{ type: QrPageBlock['type']; label: string; icon: React.ReactNode }> = [
  { type: 'hero', label: 'Hero section', icon: <Sparkles className="h-4 w-4" /> },
  { type: 'text', label: 'Text section', icon: <FileText className="h-4 w-4" /> },
  { type: 'image', label: 'Image', icon: <ImageIcon className="h-4 w-4" /> },
  { type: 'gallery', label: 'Image gallery', icon: <Layers3 className="h-4 w-4" /> },
  { type: 'video', label: 'Video', icon: <Video className="h-4 w-4" /> },
  { type: 'lottie', label: 'Lottie animation', icon: <WandSparkles className="h-4 w-4" /> },
  { type: 'button', label: 'Button / link', icon: <ExternalLink className="h-4 w-4" /> },
  { type: 'form', label: 'Lead form', icon: <Plus className="h-4 w-4" /> },
  { type: 'menu', label: 'Menu / list', icon: <MenuIcon className="h-4 w-4" /> },
  { type: 'products', label: 'Product cards', icon: <Layers3 className="h-4 w-4" /> },
  { type: 'divider', label: 'Divider', icon: <PanelRight className="h-4 w-4" /> },
];

async function api<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await authFetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    throw new Error(payload.error || `Request failed (HTTP ${response.status})`);
  }
  return payload as T;
}

function qrUrl(code: string): string {
  return `${window.location.origin}/q/${encodeURIComponent(code)}`;
}

function toSvgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function qrSvgFor(code: QrStudioCode): string {
  const logoUrl = code.qrStyle?.logoUrl || '';
  const resolvedStyle = logoUrl.startsWith('/') && typeof window !== 'undefined'
    ? { ...code.qrStyle, logoUrl: `${window.location.origin}${logoUrl}` }
    : code.qrStyle || {};
  return renderQrSvg(qrUrl(code.code), resolvedStyle);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

async function downloadQr(code: QrStudioCode, kind: 'svg' | 'png' | 'pdf') {
  const svg = qrSvgFor(code);
  const safeName = code.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'qr-code';
  if (kind === 'svg') {
    downloadBlob(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), `${safeName}.svg`);
    return;
  }
  if (kind === 'pdf') {
    const popup = window.open('', '_blank', 'width=700,height=760');
    if (!popup) throw new Error('Allow pop-ups to print this QR code as a PDF.');
    const dataUrl = toSvgDataUrl(svg);
    popup.document.write(`<!doctype html><html><head><title>${safeName}</title><style>body{font-family:Arial,sans-serif;text-align:center;padding:32px}img{width:440px;max-width:90vw}h1{font-size:20px;margin:18px 0 6px}p{color:#667085;font-size:12px}@page{margin:15mm}</style></head><body><img src="${dataUrl}" alt="QR code"><h1>${code.name.replace(/[<>&"]/g, '')}</h1><p>${qrUrl(code.code)}</p><script>window.onload=()=>window.print()<\\/script></body></html>`);
    popup.document.close();
    return;
  }
  const image = new Image();
  const objectUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Could not render this QR image.'));
      image.src = objectUrl;
    });
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = Math.round(1200 * (image.height / image.width));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Your browser could not prepare the PNG.');
    context.fillStyle = code.qrStyle.backgroundColor || '#FFFFFF';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('PNG export failed.')), 'image/png'));
    downloadBlob(blob, `${safeName}.png`);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
function qrDestinationLabel(code: QrStudioCode): string {
  const type = code.destination?.type || (code.destination?.kind === 'url' ? 'website' : code.template === 'menu' ? 'menu' : code.template === 'lead-capture' ? 'enquiry' : 'custom');
  const labels: Record<QrDestinationType, string> = {
    website: 'Website', pdf: 'PDF document', menu: 'Digital menu',
    enquiry: 'Enquiry form', custom: 'Custom landing page', whatsapp: 'WhatsApp',
  };
  return labels[type] || 'Custom landing page';
}

function StatusPill({ status }: { status: QrCodeStatus }) {
  const style: Record<QrCodeStatus, string> = {
    active: 'bg-emerald-50 text-emerald-700 ring-emerald-600/15',
    draft: 'bg-slate-100 text-slate-600 ring-slate-500/15',
    paused: 'bg-amber-50 text-amber-700 ring-amber-600/15',
    archived: 'bg-rose-50 text-rose-700 ring-rose-600/15',
  };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold capitalize ring-1 ring-inset ${style[status]}`}>{status}</span>;
}

function Metric({ label, value, icon, detail }: { label: string; value: number | string; icon: React.ReactNode; detail?: string }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,.03)] sm:p-5">
    <div className="flex items-start justify-between"><span className="text-xs font-semibold text-slate-500">{label}</span><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-700">{icon}</span></div>
    <p className="mt-3 text-2xl font-extrabold tracking-tight text-slate-900">{Number(value || 0).toLocaleString()}</p>
    {detail && <p className="mt-1 text-[10px] text-slate-400">{detail}</p>}
  </div>;
}

function QrImage({ code, className = '' }: { code: QrStudioCode; className?: string }) {
  const source = useMemo(() => {
    try { return toSvgDataUrl(qrSvgFor(code)); } catch { return ''; }
  }, [code.code, code.qrStyle]);
  return source ? <img src={source} alt={`QR code for ${code.name}`} className={`aspect-square bg-white object-contain ${className}`} /> : <div className={`flex aspect-square items-center justify-center bg-slate-100 text-slate-400 ${className}`}><QrCode className="h-8 w-8" /></div>;
}

const DESTINATION_OPTIONS: Array<{ id: QrDestinationType; label: string; description: string; icon: React.ReactNode }> = [
  { id: 'website', label: 'Website', description: 'Open your existing website or a specific page', icon: <Globe className="h-5 w-5" /> },
  { id: 'pdf', label: 'PDF / document', description: 'Open a brochure, catalogue, rate card or PDF menu', icon: <FileText className="h-5 w-5" /> },
  { id: 'menu', label: 'Digital menu', description: 'Create an editable mobile menu experience', icon: <MenuIcon className="h-5 w-5" /> },
  { id: 'enquiry', label: 'Enquiry form', description: 'Collect customer details directly in your CRM', icon: <Plus className="h-5 w-5" /> },
  { id: 'custom', label: 'Custom landing page', description: 'Build your own mobile page with content and media', icon: <Layers3 className="h-5 w-5" /> },
  { id: 'whatsapp', label: 'WhatsApp chat', description: 'Start a WhatsApp conversation with your team', icon: <MessageCircle className="h-5 w-5" /> },
];

function CreateDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (code: QrStudioCode) => void }) {
  const [name, setName] = useState('');
  const [destinationType, setDestinationType] = useState<QrDestinationType>('enquiry');
  const [url, setUrl] = useState('');
  const [phone, setPhone] = useState('');
  const [pdfAsset, setPdfAsset] = useState<{ url: string; id: string; name: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, []);

  const uploadPdf = async (file?: File) => {
    if (!file) return;
    setUploading(true); setError(''); setPdfAsset(null); setUrl('');
    try {
      if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) throw new Error('Choose a PDF document.');
      // Tenant Company Assets stores data URLs in Firestore; keep this below the document-size ceiling.
      if (file.size > 650 * 1024) throw new Error('This PDF is larger than 650 KB. Use a hosted PDF URL instead.');
      const dataUrl = await fileToDataUrl(file);
      const asset = await uploadCompanyAsset({ name: file.name, category: 'OTHER', mimeType: 'application/pdf', dataUrl, size: file.size, altText: file.name });
      setPdfAsset({ url: asset.url, id: asset.id, name: file.name });
    } catch (reason: any) {
      setError(reason?.message || 'Could not upload the PDF.');
    } finally {
      setUploading(false);
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      if (!name.trim()) throw new Error('Give this QR code an internal name.');
      const isDirect = destinationType === 'website' || destinationType === 'pdf' || destinationType === 'whatsapp';
      let destinationUrl = '';
      let fileName = '';
      let assetId = '';
      if (destinationType === 'website') {
        try {
          const parsed = new URL(url.trim());
          if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) throw new Error();
          destinationUrl = parsed.toString();
        } catch { throw new Error('Enter a valid website address starting with https:// or http://.'); }
      }
      if (destinationType === 'pdf') {
        if (pdfAsset) {
          destinationUrl = pdfAsset.url;
          fileName = pdfAsset.name;
          assetId = pdfAsset.id;
        } else {
          try {
            const parsed = new URL(url.trim());
            if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) throw new Error();
            destinationUrl = parsed.toString();
          } catch { throw new Error('Upload a PDF or enter a hosted PDF URL.'); }
        }
      }
      if (destinationType === 'whatsapp') {
        const digits = phone.replace(/\D/g, '');
        if (digits.length < 8 || digits.length > 15) throw new Error('Enter a valid WhatsApp phone number including country code.');
        destinationUrl = `https://wa.me/${digits}`;
      }
      const template: QrTemplateType = destinationType === 'menu' ? 'menu'
        : destinationType === 'enquiry' ? 'lead-capture' : 'blank';
      const destination = { kind: isDirect ? 'url' : 'page', type: destinationType, ...(destinationUrl ? { url: destinationUrl } : {}), ...(fileName ? { fileName } : {}), ...(assetId ? { assetId } : {}) };
      const labels: Record<QrDestinationType, { headline: string; subheadline: string }> = {
        website: { headline: 'Visit our website', subheadline: 'Scan to explore our website and services' },
        pdf: { headline: 'View our document', subheadline: 'Scan to open the brochure or catalogue' },
        menu: { headline: 'Explore our menu', subheadline: 'Scan to view items, prices and specials' },
        enquiry: { headline: 'Let’s start a conversation', subheadline: 'Scan to send an enquiry to our team' },
        custom: { headline: 'Explore our experience', subheadline: 'Scan to discover more' },
        whatsapp: { headline: 'Chat with our team', subheadline: 'Scan to start a WhatsApp conversation' },
      };
      const printDesign = { ...createQrPrintDesign(name.trim()), ...labels[destinationType], footerText: name.trim() };
      const data = await api<{ code: QrStudioCode }>('/api/qr-studio', { method: 'POST', body: JSON.stringify({ name, template, destination, printDesign }) });
      onCreated(data.code);
    } catch (reason: any) {
      setError(reason?.message || 'Could not create the QR code.');
    } finally {
      setBusy(false);
    }
  };

  const selected = DESTINATION_OPTIONS.find((option) => option.id === destinationType)!;
  return <div className="fixed inset-0 z-[1010] flex items-start justify-center overflow-y-auto bg-slate-950/55 p-3 pt-[max(12px,env(safe-area-inset-top))] backdrop-blur-sm sm:items-center sm:p-5" role="dialog" aria-modal="true">
    <form onSubmit={submit} className="my-auto flex max-h-[calc(100dvh-24px-env(safe-area-inset-top))] w-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
      <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-7 sm:py-5"><div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-blue-600">QR Studio</p><h2 className="mt-1 text-xl font-bold text-slate-900">Create a QR code</h2><p className="mt-1 text-xs text-slate-500">First choose what people should see after scanning.</p></div><button type="button" onClick={onClose} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button></div>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain p-5 sm:p-7">
        <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-700">Internal QR name</span><input required maxLength={100} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Hotel lobby — guest services" className="w-full rounded-xl border border-slate-200 px-3.5 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10" /></label>
        <div><div className="mb-3"><p className="text-xs font-bold text-slate-800">What should happen after scanning?</p><p className="mt-1 text-[10px] text-slate-500">You can edit the destination and print design separately later.</p></div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {DESTINATION_OPTIONS.map((option) => <button type="button" key={option.id} onClick={() => { setDestinationType(option.id); setError(''); }} aria-pressed={destinationType === option.id} className={`flex min-h-[88px] items-start gap-3 rounded-xl border p-3 text-left transition ${destinationType === option.id ? 'border-blue-500 bg-blue-50/70 ring-2 ring-blue-500/10' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'}`}>
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${destinationType === option.id ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>{option.icon}</span>
              <span className="min-w-0"><span className="block text-xs font-bold text-slate-900">{option.label}</span><span className="mt-1 block text-[10px] leading-4 text-slate-500">{option.description}</span></span>
            </button>)}
          </div>
        </div>
        {destinationType === 'website' && <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-700">Website URL</span><input required type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://yourwebsite.com" className="w-full rounded-xl border border-slate-200 px-3.5 py-3 text-sm outline-none focus:border-blue-500" /></label>}
        {destinationType === 'pdf' && <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><p className="text-xs font-bold text-slate-800">Choose a PDF document</p><p className="mt-1 text-[10px] leading-4 text-slate-500">Upload a small PDF to your workspace or use a hosted PDF URL for larger files.</p>
          <label className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white px-3 py-4 text-xs font-semibold text-slate-600 hover:border-blue-400"><Upload className="h-4 w-4" />{uploading ? 'Uploading PDF…' : pdfAsset ? 'Replace PDF' : 'Upload PDF (650 KB max)'}<input type="file" accept="application/pdf,.pdf" className="hidden" disabled={uploading} onChange={(event) => { void uploadPdf(event.target.files?.[0]); event.currentTarget.value = ''; }} /></label>
          {pdfAsset && <p className="mt-2 flex items-center gap-2 text-[10px] font-semibold text-emerald-700"><Check className="h-3.5 w-3.5" />{pdfAsset.name} uploaded</p>}
          <label className="mt-3 block"><span className="mb-1.5 block text-[10px] font-semibold text-slate-600">Or use a hosted PDF URL</span><input type="url" value={url} onChange={(event) => { setUrl(event.target.value); if (event.target.value) setPdfAsset(null); }} placeholder="https://your-site.com/menu.pdf" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs outline-none focus:border-blue-500" /></label>
        </div>}
        {destinationType === 'whatsapp' && <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-700">WhatsApp number (include country code)</span><input required value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="e.g. +91 98765 43210" className="w-full rounded-xl border border-slate-200 px-3.5 py-3 text-sm outline-none focus:border-blue-500" /></label>}
        {(destinationType === 'menu' || destinationType === 'enquiry' || destinationType === 'custom') && <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-3"><div className="flex items-center gap-2 text-xs font-bold text-blue-900">{selected.icon}{destinationType === 'menu' ? 'An editable digital menu will be created.' : destinationType === 'enquiry' ? 'A lead form connected to your CRM will be created.' : 'A blank mobile landing page will be created.'}</div><p className="mt-1 text-[10px] leading-4 text-blue-800">After creating the QR code, you can open “Edit scan experience” to customise its content.</p></div>}
        {error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}
      </div>
      <div className="flex shrink-0 flex-col-reverse items-stretch gap-3 border-t border-slate-100 bg-slate-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7"><p className="text-[10px] text-slate-500">Next: design the actual QR poster, table display or print artwork.</p><button disabled={busy || uploading} type="submit" className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#155eef] px-5 py-3 text-xs font-bold text-white shadow-lg shadow-blue-600/20 disabled:opacity-50 sm:w-auto">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Create QR code</button></div>
    </form>
  </div>;
}

function FieldInput({ label, value, onChange, placeholder, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return <label className="block"><span className="mb-1.5 block text-[11px] font-semibold text-slate-700">{label}</span><input type={type} value={value || ''} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs text-slate-800 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10" /></label>;
}

function QrBuilder({ initial, onClose, onSaved }: { initial: QrStudioCode; onClose: () => void; onSaved: (code: QrStudioCode) => void }) {
  const [working, setWorking] = useState<QrStudioCode>(initial);
  const [editorMode, setEditorMode] = useState<'print' | 'experience'>('print');
  const [pane, setPane] = useState<'content' | 'design' | 'publish'>('content');
  const [mobileSettingsOpen, setMobileSettingsOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(working.pageData.blocks[0]?.id || '');
  const [themes, setThemes] = useState<QrSavedTheme[]>([]);
  const [versions, setVersions] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, []);

  const page = working.pageData;
  const selected = page.blocks.find((block) => block.id === selectedId) || null;
  const updatePage = (update: Partial<QrPageDocument>) => setWorking((old) => ({ ...old, pageData: { ...old.pageData, ...update } }));
  const updateTheme = (update: Record<string, any>) => updatePage({ theme: { ...page.theme, ...update } });
  const updateBlock = (update: Partial<QrPageBlock>) => {
    if (!selected) return;
    updatePage({ blocks: page.blocks.map((block) => block.id === selected.id ? { ...block, ...update } : block) });
  };
  const addBlock = (type: QrPageBlock['type']) => {
    const next: QrPageBlock = {
      id: `blk_${Math.random().toString(36).slice(2, 10)}`, type, animation: 'fade',
      ...(type === 'hero' ? { title: 'Your headline', body: 'Add a short introduction for visitors.' } : {}),
      ...(type === 'text' ? { title: 'Section heading', body: 'Add your content here.' } : {}),
      ...(type === 'button' ? { label: 'Learn more', href: 'https://example.com', align: 'center' as const } : {}),
      ...(type === 'form' ? { title: 'Get in touch', fields: [{ id: 'fullName', label: 'Your name', type: 'text' as const, required: true }, { id: 'email', label: 'Email address', type: 'email' as const, required: true }] } : {}),
      ...(type === 'menu' ? { title: 'Menu', items: [{ category: 'Category', items: [{ name: 'Item', description: 'Description', price: '₹0' }] }] } : {}),
      ...(type === 'products' ? { title: 'Featured products', items: [{ name: 'Product', description: 'Product description', price: '₹0' }] } : {}),
      ...(type === 'gallery' ? { title: 'Gallery', imageUrls: [] } : {}),
    };
    updatePage({ blocks: [...page.blocks, next] });
    setSelectedId(next.id);
    setPane('content');
  };
  const moveBlock = (direction: -1 | 1) => {
    if (!selected) return;
    const index = page.blocks.findIndex((block) => block.id === selected.id);
    const target = index + direction;
    if (target < 0 || target >= page.blocks.length) return;
    const blocks = [...page.blocks];
    [blocks[index], blocks[target]] = [blocks[target], blocks[index]];
    updatePage({ blocks });
  };
  const removeBlock = () => {
    if (!selected) return;
    const blocks = page.blocks.filter((block) => block.id !== selected.id);
    updatePage({ blocks });
    setSelectedId(blocks[0]?.id || '');
  };
  const upload = async (file: File, kind: 'image' | 'video', onComplete: (url: string) => void) => {
    setUploading(true); setError('');
    try {
      const max = kind === 'video' ? 3 * 1024 * 1024 : 2.5 * 1024 * 1024;
      if (file.size > max) throw new Error(kind === 'video' ? 'Video must be 3 MB or smaller.' : 'Image must be 2.5 MB or smaller.');
      if (kind === 'image' && !file.type.startsWith('image/')) throw new Error('Choose an image file.');
      if (kind === 'video' && !file.type.startsWith('video/')) throw new Error('Choose a video file.');
      const dataUrl = await fileToDataUrl(file);
      const dimensions = kind === 'image' ? await getImageDimensions(dataUrl) : undefined;
      const asset = await uploadCompanyAsset({
        name: file.name,
        category: kind === 'video' ? 'VIDEO' : 'OTHER',
        mimeType: file.type,
        dataUrl,
        size: file.size,
        dimensions,
        altText: file.name,
      });
      onComplete(asset.url);
      setMessage('Media uploaded to your workspace assets.');
    } catch (reason: any) { setError(reason?.message || 'Could not upload this file.'); }
    finally { setUploading(false); }
  };
  const loadThemes = useCallback(async () => {
    try { const data = await api<{ themes: QrSavedTheme[] }>('/api/qr-studio/themes'); setThemes(data.themes || []); } catch {}
  }, []);
  const loadVersions = useCallback(async () => {
    try { const data = await api<{ versions: any[] }>(`/api/qr-studio/${encodeURIComponent(working.id)}/versions`); setVersions(data.versions || []); } catch {}
  }, [working.id]);
  useEffect(() => { void loadThemes(); void loadVersions(); }, [loadThemes, loadVersions]);

  const save = async (closeAfter = false) => {
    setSaving(true); setError(''); setMessage('');
    try {
      const data = await api<{ code: QrStudioCode }>(`/api/qr-studio/${encodeURIComponent(working.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: working.name,
          description: working.description,
          pageData: working.pageData,
          destination: working.destination,
          qrStyle: working.qrStyle,
          printDesign: working.printDesign || createQrPrintDesign(working.name),
          schedule: working.schedule || {},
        }),
      });
      const next = data.code || { ...working, updatedAt: new Date().toISOString() };
      setWorking(next);
      onSaved(next);
      setMessage('Draft saved.');
      if (closeAfter) onClose();
      return next;
    } catch (reason: any) { setError(reason?.message || 'Could not save changes.'); return null; }
    finally { setSaving(false); }
  };
  const publish = async () => {
    setPublishing(true); setError(''); setMessage('');
    try {
      const saved = await save();
      if (!saved) return;
      const data = await api<{ code: QrStudioCode }>(`/api/qr-studio/${encodeURIComponent(working.id)}/publish`, { method: 'POST', body: '{}' });
      const next = data.code || { ...saved, status: 'active' as const };
      setWorking(next); onSaved(next); setMessage('Published. Your QR code is now live.');
      await loadVersions();
    } catch (reason: any) { setError(reason?.message || 'Could not publish this experience.'); }
    finally { setPublishing(false); }
  };
  const saveTheme = async () => {
    const name = window.prompt('Name this reusable brand theme');
    if (!name?.trim()) return;
    try {
      await api('/api/qr-studio/themes', { method: 'POST', body: JSON.stringify({ name, kind: 'theme', theme: page.theme }) });
      await loadThemes(); setMessage('Brand theme saved.');
    } catch (reason: any) { setError(reason?.message || 'Could not save theme.'); }
  };
  const saveSection = async () => {
    if (!selected) return;
    const name = window.prompt('Name this reusable section');
    if (!name?.trim()) return;
    try {
      await api('/api/qr-studio/themes', { method: 'POST', body: JSON.stringify({ name, kind: 'section', block: selected }) });
      await loadThemes(); setMessage('Reusable section saved.');
    } catch (reason: any) { setError(reason?.message || 'Could not save section.'); }
  };
  const restoreVersion = async (versionId: string) => {
    try {
      const data = await api<{ code: QrStudioCode }>(`/api/qr-studio/${encodeURIComponent(working.id)}/versions/${encodeURIComponent(versionId)}/restore`, { method: 'POST', body: '{}' });
      if (data.code) setWorking(data.code);
      setMessage('Version restored to the draft. Publish to make it live.');
    } catch (reason: any) { setError(reason?.message || 'Could not restore this version.'); }
  };
  const applyTheme = (theme: QrSavedTheme) => {
    if (theme.kind === 'theme' && theme.theme) updateTheme(theme.theme);
    if (theme.kind === 'section' && theme.block) {
      const clone = { ...theme.block, id: `blk_${Math.random().toString(36).slice(2, 10)}` };
      updatePage({ blocks: [...page.blocks, clone] });
      setSelectedId(clone.id);
    }
  };
  const scheduleValue = (value?: string) => value ? new Date(value).toISOString().slice(0, 16) : '';

  return <div className="fixed inset-0 z-[1000] flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-[#f5f7fb]" role="dialog" aria-modal="true" aria-label="QR experience builder">
    <header className="flex min-h-[66px] shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 sm:px-6">
      <div className="flex min-w-0 items-center gap-2 sm:gap-3"><button onClick={onClose} aria-label="Close QR designer" className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"><ArrowLeft className="h-4 w-4" /></button><div className="min-w-0"><p className="truncate text-sm font-bold text-slate-900">{working.name}</p><p className="text-[10px] text-slate-400">{editorMode === 'print' ? 'Print designer' : 'Scan experience editor'} · {working.status}</p></div></div>
      <div className="flex shrink-0 items-center gap-1.5">
        {editorMode === 'print' && working.destination.kind === 'page' && <button onClick={() => { setEditorMode('experience'); setPane('content'); setMobileSettingsOpen(true); }} className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-2.5 py-2 text-[10px] font-bold text-blue-700 hover:bg-blue-100 sm:px-3 sm:text-xs"><ArrowDown className="h-3.5 w-3.5" /><span className="hidden sm:inline">Edit scan experience</span><span className="sm:hidden">Edit page</span></button>}
        {editorMode === 'experience' && <button onClick={() => { setEditorMode('print'); setMobileSettingsOpen(false); }} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-2.5 py-2 text-[10px] font-bold text-slate-600 hover:bg-slate-50 sm:px-3 sm:text-xs"><ArrowLeft className="h-3.5 w-3.5" /><span className="hidden sm:inline">Back to print design</span><span className="sm:hidden">Print design</span></button>}
        {working.status === 'active' && <button onClick={() => window.open(qrUrl(working.code), '_blank', 'noopener,noreferrer')} className="hidden items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 lg:inline-flex"><Eye className="h-3.5 w-3.5" />Test scan</button>}
        <button onClick={() => void save()} disabled={saving} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-2.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 sm:px-3">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}<span className="hidden sm:inline">Save draft</span></button>
        <button onClick={() => setMobileSettingsOpen((open) => !open)} className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-2.5 py-2 text-xs font-semibold text-slate-600 xl:hidden"><Settings2 className="h-4 w-4" /><span className="hidden sm:inline">Settings</span></button>
        <button onClick={() => void publish()} disabled={publishing || saving} className="inline-flex items-center gap-1.5 rounded-xl bg-[#155eef] px-3 py-2.5 text-xs font-bold text-white shadow-md shadow-blue-600/20 sm:px-4">{publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}<span className="hidden sm:inline">Publish</span></button>
      </div>
    </header>
    {editorMode === 'print' ? (
      <div className="flex min-h-0 flex-1 flex-col">
        {error && <p role="alert" className="mx-3 mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[10px] text-rose-700 sm:mx-6">{error}</p>}
        {message && <p role="status" className="mx-3 mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[10px] text-emerald-700 sm:mx-6">{message}</p>}
        <QrPrintDesigner code={working} onChange={(patch) => setWorking((old) => ({ ...old, ...patch }))} mobileSettingsOpen={mobileSettingsOpen} onCloseMobileSettings={() => setMobileSettingsOpen(false)} onMessage={setMessage} onError={setError} onEditExperience={() => { setEditorMode('experience'); setPane('content'); setMobileSettingsOpen(true); }} />
      </div>
    ) : (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <aside className="hidden w-[230px] shrink-0 flex-col border-r border-slate-200 bg-white 2xl:flex">
        <div className="border-b border-slate-100 p-4"><p className="text-[10px] font-bold uppercase tracking-[.16em] text-slate-400">Page content</p><p className="mt-1 text-xs text-slate-500">Select a section or add a new one.</p></div>
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-3">
          {page.blocks.map((block, index) => <div key={block.id} className={`flex items-center gap-1 rounded-xl border p-1.5 ${selectedId === block.id ? 'border-blue-300 bg-blue-50' : 'border-transparent hover:bg-slate-50'}`}>
            <button onClick={() => setSelectedId(block.id)} className="flex min-w-0 flex-1 items-center gap-2 px-1.5 py-2 text-left"><span className="text-slate-500">{BLOCKS.find((item) => item.type === block.type)?.icon}</span><span className="min-w-0"><span className="block truncate text-[11px] font-semibold text-slate-800">{block.title || block.label || block.type}</span><span className="block text-[9px] capitalize text-slate-400">{block.type}</span></span></button>
            <button title="Move up" disabled={index === 0} onClick={() => { setSelectedId(block.id); const i = index; const b = [...page.blocks]; [b[i - 1], b[i]] = [b[i], b[i - 1]]; updatePage({ blocks: b }); }} className="rounded p-1 text-slate-400 hover:bg-white disabled:opacity-20"><ArrowUp className="h-3 w-3" /></button>
            <button title="Move down" disabled={index === page.blocks.length - 1} onClick={() => { setSelectedId(block.id); const i = index; const b = [...page.blocks]; [b[i + 1], b[i]] = [b[i], b[i + 1]]; updatePage({ blocks: b }); }} className="rounded p-1 text-slate-400 hover:bg-white disabled:opacity-20"><ArrowDown className="h-3 w-3" /></button>
          </div>)}
          <p className="px-1 pt-4 text-[9px] font-bold uppercase tracking-[.15em] text-slate-400">Add a block</p>
          <div className="grid grid-cols-2 gap-1.5">{BLOCKS.map((item) => <button key={item.type} onClick={() => addBlock(item.type)} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2 py-2 text-left text-[9px] font-semibold text-slate-600 hover:border-blue-300 hover:bg-blue-50">{item.icon}<span>{item.label}</span></button>)}</div>
          {themes.some((theme) => theme.kind === 'section') && <div className="pt-3"><p className="mb-2 text-[9px] font-bold uppercase tracking-[.15em] text-slate-400">Reusable sections</p>{themes.filter((theme) => theme.kind === 'section').map((theme) => <button key={theme.id} onClick={() => applyTheme(theme)} className="mb-1 flex w-full items-center gap-2 rounded-lg border border-slate-100 px-2 py-2 text-left text-[10px] text-slate-600 hover:border-blue-200 hover:bg-blue-50"><Plus className="h-3 w-3" />{theme.name}</button>)}</div>}
        </div>
      </aside>

      <main className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-6">
        <div className="mx-auto flex w-full min-w-0 max-w-[980px] flex-col items-center gap-4">
          <div className="flex w-full flex-wrap items-center justify-between gap-2"><div><p className="text-[10px] font-bold uppercase tracking-[.15em] text-slate-400">Live mobile preview</p><p className="mt-1 text-xs text-slate-500">Changes appear as you edit. Test with a real phone after publishing.</p></div><div className="flex gap-1 rounded-xl border border-slate-200 bg-white p-1"><button onClick={() => setPane('content')} className={`rounded-lg px-3 py-2 text-[10px] font-bold ${pane === 'content' ? 'bg-blue-50 text-blue-700' : 'text-slate-500'}`}>Content</button><button onClick={() => setPane('design')} className={`rounded-lg px-3 py-2 text-[10px] font-bold ${pane === 'design' ? 'bg-blue-50 text-blue-700' : 'text-slate-500'}`}>Design</button><button onClick={() => setPane('publish')} className={`rounded-lg px-3 py-2 text-[10px] font-bold ${pane === 'publish' ? 'bg-blue-50 text-blue-700' : 'text-slate-500'}`}>Publish</button></div></div>
          <div className="w-full max-w-[420px] overflow-hidden rounded-[34px] border-[8px] border-slate-900 bg-white shadow-[0_28px_80px_rgba(15,23,42,.16)]">
            <div className="mx-auto mt-1 h-1.5 w-20 rounded-full bg-slate-900" />
            <div className="max-h-[min(70vh,760px)] overflow-y-auto">
              <QrExperienceRenderer page={page} mode="preview" />
            </div>
          </div>
          <p className="text-[10px] text-slate-400">Preview is mobile-first. The published page also adapts to tablet and desktop.</p>
        </div>
      </main>

      {mobileSettingsOpen && <button type="button" aria-label="Close settings panel" onClick={() => setMobileSettingsOpen(false)} className="fixed inset-0 z-[1001] bg-slate-950/30 xl:hidden" />}
      <aside className={`hidden w-[330px] shrink-0 flex-col border-l border-slate-200 bg-white xl:flex ${mobileSettingsOpen ? 'qr-mobile-settings-open' : ''}`}>
        <div className="border-b border-slate-100 px-4 py-4"><div className="flex items-center justify-between"><p className="text-xs font-bold text-slate-900">{pane === 'content' ? 'Section settings' : pane === 'design' ? 'Page design' : pane === 'publish' ? 'Destination & publishing' : 'Publishing'}</p><button onClick={() => setMobileSettingsOpen(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 xl:hidden"><X className="h-4 w-4" /></button></div><p className="mt-1 text-[10px] text-slate-400">Customize the selected experience.</p></div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4"><div className="space-y-3 rounded-xl border border-slate-100 bg-slate-50 p-3 xl:hidden">
            <div><p className="text-[10px] font-bold uppercase tracking-[.12em] text-slate-400">Page sections</p><div className="mt-2 flex flex-wrap gap-1.5">
              {page.blocks.map((block) => <button key={block.id} onClick={() => { setSelectedId(block.id); setPane('content'); }} className={`rounded-lg border px-2.5 py-1.5 text-[10px] font-semibold ${selectedId === block.id ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-600'}`}>{block.title || block.label || block.type}</button>)}
            </div></div>
            <div><p className="text-[10px] font-bold uppercase tracking-[.12em] text-slate-400">Add a section</p><div className="mt-2 grid grid-cols-2 gap-1.5">
              {BLOCKS.map((item) => <button key={item.type} onClick={() => addBlock(item.type)} className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-2 text-left text-[10px] font-semibold text-slate-600 hover:border-blue-300 hover:bg-blue-50">{item.icon}{item.label}</button>)}
            </div></div>
          </div>
          {pane === 'content' && <>
            <FieldInput label="QR name" value={working.name} onChange={(name) => setWorking((old) => ({ ...old, name }))} />
            <FieldInput label="Page title" value={page.title} onChange={(title) => updatePage({ title })} />
            <FieldInput label="Page description" value={page.description} onChange={(description) => updatePage({ description })} />
            {selected ? <>
              <div className="border-t border-slate-100 pt-4"><p className="mb-3 text-[10px] font-bold uppercase tracking-[.12em] text-slate-400">Selected: {selected.type}</p>
                {selected.type !== 'divider' && <>
                  {(selected.type === 'hero' || selected.type === 'text' || selected.type === 'menu' || selected.type === 'products' || selected.type === 'form' || selected.type === 'gallery') && <FieldInput label="Heading" value={selected.title || ''} onChange={(title) => updateBlock({ title })} />}
                  {(selected.type === 'hero' || selected.type === 'text' || selected.type === 'form') && <label className="block"><span className="mb-1.5 block text-[11px] font-semibold text-slate-700">Text</span><textarea rows={4} value={selected.body || ''} onChange={(event) => updateBlock({ body: event.target.value })} className="w-full rounded-xl border border-slate-200 p-3 text-xs outline-none focus:border-blue-500" /></label>}
                  {selected.type === 'hero' && <FieldInput label="Eyebrow / brand label" value={selected.label || ''} onChange={(label) => updateBlock({ label })} />}
                  {selected.type === 'button' && <><FieldInput label="Button text" value={selected.label || ''} onChange={(label) => updateBlock({ label })} /><FieldInput label="Destination URL" value={selected.href || ''} onChange={(href) => updateBlock({ href })} placeholder="https:// or tel: / mailto:" /></>}
                  {(selected.type === 'image' || selected.type === 'hero') && <><FieldInput label="Image URL" value={selected.imageUrl || ''} onChange={(imageUrl) => updateBlock({ imageUrl })} placeholder="/api/assets/…" /><label className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-slate-300 px-3 py-3 text-[10px] font-semibold text-slate-600 hover:border-blue-400"><Upload className="h-4 w-4" />{uploading ? 'Uploading…' : 'Upload image'}<input type="file" accept="image/*" className="hidden" disabled={uploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file, 'image', (imageUrl) => updateBlock({ imageUrl })); event.currentTarget.value = ''; }} /></label></>}
                  {selected.type === 'gallery' && <><FieldInput label="Image URLs (comma separated)" value={(selected.imageUrls || []).join(', ')} onChange={(value) => updateBlock({ imageUrls: value.split(',').map((v) => v.trim()).filter(Boolean).slice(0, 16) })} /><label className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-slate-300 px-3 py-3 text-[10px] font-semibold text-slate-600 hover:border-blue-400"><Upload className="h-4 w-4" />Upload gallery image<input type="file" accept="image/*" className="hidden" disabled={uploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file, 'image', (imageUrl) => updateBlock({ imageUrls: [...(selected.imageUrls || []), imageUrl].slice(0, 16) })); event.currentTarget.value = ''; }} /></label></>}
                  {selected.type === 'video' && <><FieldInput label="Video URL" value={selected.videoUrl || ''} onChange={(videoUrl) => updateBlock({ videoUrl })} placeholder="Paste a hosted MP4 URL" /><label className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-slate-300 px-3 py-3 text-[10px] font-semibold text-slate-600"><Upload className="h-4 w-4" />Upload video (3 MB max)<input type="file" accept="video/*" className="hidden" disabled={uploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file, 'video', (videoUrl) => updateBlock({ videoUrl })); event.currentTarget.value = ''; }} /></label></>}
                  {selected.type === 'lottie' && <><FieldInput label="Lottie JSON URL" value={selected.lottieUrl || ''} onChange={(lottieUrl) => updateBlock({ lottieUrl })} placeholder="https://example.com/animation.json or /api/assets/…" /><label className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-slate-300 px-3 py-3 text-[10px] font-semibold text-slate-600 hover:border-blue-400"><Upload className="h-4 w-4" />Upload Lottie JSON (1.5 MB max)<input type="file" accept=".json,application/json" className="hidden" disabled={uploading} onChange={async (event) => { const file = event.target.files?.[0]; if (file) { try { if (file.size > 1.5 * 1024 * 1024) throw new Error('Lottie JSON must be 1.5 MB or smaller.'); const dataUrl = await fileToDataUrl(file); const asset = await uploadCompanyAsset({ name: file.name, category: 'OTHER', mimeType: file.type || 'application/json', dataUrl, size: file.size, altText: file.name }); updateBlock({ lottieUrl: asset.url }); setMessage('Lottie animation uploaded.'); } catch (reason: any) { setError(reason?.message || 'Could not upload Lottie JSON.'); } } event.currentTarget.value = ''; }} /></label></>}
                  {selected.type === 'menu' && <div className="space-y-3">
                    {(selected.items || []).map((category: any, categoryIndex: number) => <div key={categoryIndex} className="rounded-xl border border-slate-200 p-3">
                      <div className="flex items-center gap-2"><div className="flex-1"><FieldInput label={`Category ${categoryIndex + 1}`} value={category.category || ''} onChange={(value) => updateBlock({ items: (selected.items || []).map((item: any, index: number) => index === categoryIndex ? { ...item, category: value } : item) })} /></div><button onClick={() => updateBlock({ items: (selected.items || []).filter((_: any, index: number) => index !== categoryIndex) })} className="mt-5 rounded-lg p-2 text-rose-500 hover:bg-rose-50"><Trash2 className="h-3.5 w-3.5" /></button></div>
                      {(category.items || []).map((item: any, itemIndex: number) => <div key={itemIndex} className="mt-3 rounded-lg bg-slate-50 p-2.5">
                        <FieldInput label="Item name" value={item.name || ''} onChange={(value) => updateBlock({ items: (selected.items || []).map((entry: any, index: number) => index === categoryIndex ? { ...entry, items: (entry.items || []).map((sub: any, at: number) => at === itemIndex ? { ...sub, name: value } : sub) } : entry) })} />
                        <div className="mt-2"><FieldInput label="Description" value={item.description || ''} onChange={(value) => updateBlock({ items: (selected.items || []).map((entry: any, index: number) => index === categoryIndex ? { ...entry, items: (entry.items || []).map((sub: any, at: number) => at === itemIndex ? { ...sub, description: value } : sub) } : entry) })} /></div>
                        <div className="mt-2 flex items-end gap-2"><div className="flex-1"><FieldInput label="Price" value={item.price || ''} onChange={(value) => updateBlock({ items: (selected.items || []).map((entry: any, index: number) => index === categoryIndex ? { ...entry, items: (entry.items || []).map((sub: any, at: number) => at === itemIndex ? { ...sub, price: value } : sub) } : entry) })} /></div><button onClick={() => updateBlock({ items: (selected.items || []).map((entry: any, index: number) => index === categoryIndex ? { ...entry, items: (entry.items || []).filter((_: any, at: number) => at !== itemIndex) } : entry) })} className="mb-0.5 rounded-lg p-2 text-rose-500 hover:bg-rose-50"><Trash2 className="h-3.5 w-3.5" /></button></div>
                      </div>)}
                      <button onClick={() => updateBlock({ items: (selected.items || []).map((entry: any, index: number) => index === categoryIndex ? { ...entry, items: [...(entry.items || []), { name: 'New menu item', description: '', price: '' }] } : entry) })} className="mt-3 text-[10px] font-bold text-blue-600"><Plus className="mr-1 inline h-3 w-3" />Add item</button>
                    </div>)}
                    <button onClick={() => updateBlock({ items: [...(selected.items || []), { category: 'New category', items: [] }] })} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 px-3 py-3 text-[10px] font-bold text-slate-600 hover:border-blue-300 hover:bg-blue-50"><Plus className="h-3.5 w-3.5" />Add menu category</button>
                  </div>}
                  {selected.type === 'products' && <div className="space-y-3">
                    {(selected.items || []).map((item: any, itemIndex: number) => <div key={itemIndex} className="rounded-xl border border-slate-200 p-3">
                      <div className="flex items-center justify-between"><p className="text-[10px] font-bold text-slate-700">Product {itemIndex + 1}</p><button onClick={() => updateBlock({ items: (selected.items || []).filter((_: any, index: number) => index !== itemIndex) })} className="rounded-lg p-1.5 text-rose-500 hover:bg-rose-50"><Trash2 className="h-3.5 w-3.5" /></button></div>
                      <div className="mt-2"><FieldInput label="Product name" value={item.name || ''} onChange={(value) => updateBlock({ items: (selected.items || []).map((entry: any, index: number) => index === itemIndex ? { ...entry, name: value } : entry) })} /></div>
                      <div className="mt-2"><FieldInput label="Description" value={item.description || ''} onChange={(value) => updateBlock({ items: (selected.items || []).map((entry: any, index: number) => index === itemIndex ? { ...entry, description: value } : entry) })} /></div>
                      <div className="mt-2"><FieldInput label="Price" value={item.price || ''} onChange={(value) => updateBlock({ items: (selected.items || []).map((entry: any, index: number) => index === itemIndex ? { ...entry, price: value } : entry) })} /></div>
                      <div className="mt-2"><FieldInput label="Image URL" value={item.imageUrl || ''} onChange={(value) => updateBlock({ items: (selected.items || []).map((entry: any, index: number) => index === itemIndex ? { ...entry, imageUrl: value } : entry) })} /></div>
                    </div>)}
                    <button onClick={() => updateBlock({ items: [...(selected.items || []), { name: 'New product', description: '', price: '', imageUrl: '' }] })} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 px-3 py-3 text-[10px] font-bold text-slate-600 hover:border-blue-300 hover:bg-blue-50"><Plus className="h-3.5 w-3.5" />Add product</button>
                  </div>}
                  {selected.type === 'form' && <div className="space-y-3">
                    {(selected.fields || []).map((field: QrFormField, fieldIndex: number) => <div key={field.id} className="rounded-xl border border-slate-200 p-3">
                      <div className="flex items-center justify-between"><p className="text-[10px] font-bold text-slate-700">Field {fieldIndex + 1}</p><button onClick={() => updateBlock({ fields: (selected.fields || []).filter((_: any, index: number) => index !== fieldIndex) })} className="rounded-lg p-1.5 text-rose-500 hover:bg-rose-50"><Trash2 className="h-3.5 w-3.5" /></button></div>
                      <div className="mt-2"><FieldInput label="Field label" value={field.label} onChange={(label) => updateBlock({ fields: (selected.fields || []).map((entry, index) => index === fieldIndex ? { ...entry, label } : entry) })} /></div>
                      <div className="mt-2"><label className="block"><span className="mb-1.5 block text-[11px] font-semibold text-slate-700">Answer type</span><select value={field.type} onChange={(event) => updateBlock({ fields: (selected.fields || []).map((entry, index) => index === fieldIndex ? { ...entry, type: event.target.value as QrFormField['type'] } : entry) })} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs"><option value="text">Short text</option><option value="email">Email</option><option value="tel">Phone</option><option value="number">Number</option><option value="textarea">Long text</option><option value="select">Dropdown</option><option value="checkbox">Consent checkbox</option></select></label></div>
                      <div className="mt-2"><FieldInput label="Placeholder" value={field.placeholder || ''} onChange={(placeholder) => updateBlock({ fields: (selected.fields || []).map((entry, index) => index === fieldIndex ? { ...entry, placeholder } : entry) })} /></div>
                      {field.type === 'select' && <div className="mt-2"><FieldInput label="Options (comma separated)" value={(field.options || []).join(', ')} onChange={(value) => updateBlock({ fields: (selected.fields || []).map((entry, index) => index === fieldIndex ? { ...entry, options: value.split(',').map((part) => part.trim()).filter(Boolean) } : entry) })} /></div>}
                      <label className="mt-2 flex items-center gap-2 text-[10px] text-slate-600"><input type="checkbox" checked={Boolean(field.required)} onChange={(event) => updateBlock({ fields: (selected.fields || []).map((entry, index) => index === fieldIndex ? { ...entry, required: event.target.checked } : entry) })} />Required field</label>
                      <div className="mt-3 border-t border-slate-100 pt-3">
                        <p className="mb-2 text-[9px] font-bold uppercase tracking-wide text-slate-400">Conditional display · optional</p>
                        <label className="block"><span className="mb-1 block text-[10px] text-slate-600">Show this field when</span><select value={field.showWhen?.fieldId || ''} onChange={(event) => updateBlock({ fields: (selected.fields || []).map((entry, index) => index === fieldIndex ? { ...entry, showWhen: event.target.value ? { fieldId: event.target.value, operator: 'equals', value: '' } : undefined } : entry) })} className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-[10px]"><option value="">Always visible</option>{(selected.fields || []).filter((other) => other.id !== field.id).map((other) => <option key={other.id} value={other.id}>{other.label}</option>)}</select></label>
                        {field.showWhen?.fieldId && <div className="mt-2 space-y-2"><select value={field.showWhen.operator} onChange={(event) => updateBlock({ fields: (selected.fields || []).map((entry, index) => index === fieldIndex ? { ...entry, showWhen: { ...entry.showWhen!, operator: event.target.value as any } } : entry) })} className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-[10px]"><option value="equals">Equals</option><option value="not_equals">Does not equal</option><option value="contains">Contains</option><option value="is_filled">Has an answer</option></select>{field.showWhen.operator !== 'is_filled' && <FieldInput label="Matching answer" value={field.showWhen.value || ''} onChange={(value) => updateBlock({ fields: (selected.fields || []).map((entry, index) => index === fieldIndex ? { ...entry, showWhen: { ...entry.showWhen!, value } } : entry) })} />}</div>}
                      </div>
                    </div>)}
                    <button onClick={() => updateBlock({ fields: [...(selected.fields || []), { id: `field_${Math.random().toString(36).slice(2, 9)}`, label: 'New question', type: 'text', required: false }] })} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 px-3 py-3 text-[10px] font-bold text-slate-600 hover:border-blue-300 hover:bg-blue-50"><Plus className="h-3.5 w-3.5" />Add form field</button>
                  </div>}
                  {selected.type === 'form' && <JsonField label="Form fields and conditions" value={selected.fields || []} onSave={(fields) => updateBlock({ fields: Array.isArray(fields) ? fields as QrFormField[] : [] })} rows={12} />}
                </>}
                <label className="block"><span className="mb-1.5 block text-[11px] font-semibold text-slate-700">Entrance animation</span><select value={selected.animation || 'none'} onChange={(event) => updateBlock({ animation: event.target.value as any })} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs"><option value="none">None</option><option value="fade">Fade in</option><option value="slide">Slide in</option><option value="zoom">Zoom in</option><option value="stagger">Stagger</option><option value="float">Float</option><option value="parallax">Parallax feel</option><option value="scroll">Scroll reveal</option></select></label>
                {selected.type !== 'divider' && <button onClick={() => void saveSection()} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-[10px] font-semibold text-slate-600 hover:bg-slate-50"><Layers3 className="h-3.5 w-3.5" />Save section for reuse</button>}
                <div className="flex items-center justify-between border-t border-slate-100 pt-3"><div className="flex gap-1"><button onClick={() => moveBlock(-1)} className="rounded-lg border border-slate-200 p-2 text-slate-500"><ArrowUp className="h-3.5 w-3.5" /></button><button onClick={() => moveBlock(1)} className="rounded-lg border border-slate-200 p-2 text-slate-500"><ArrowDown className="h-3.5 w-3.5" /></button></div><button onClick={removeBlock} className="inline-flex items-center gap-1 rounded-lg px-2 py-2 text-[10px] font-semibold text-rose-600 hover:bg-rose-50"><Trash2 className="h-3.5 w-3.5" />Delete section</button></div>
              </div>
            </> : <p className="rounded-xl bg-slate-50 p-4 text-[11px] text-slate-500">Choose a section or add a block to begin.</p>}
          </>}
          {pane === 'design' && <>
            <div className="space-y-3"><p className="text-[10px] font-bold uppercase tracking-[.12em] text-slate-400">Reusable brand themes</p><select defaultValue="" onChange={(event) => { const found = themes.find((theme) => theme.id === event.target.value); if (found) applyTheme(found); }} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs"><option value="" disabled>Apply a saved theme…</option>{themes.filter((theme) => theme.kind === 'theme').map((theme) => <option key={theme.id} value={theme.id}>{theme.name}</option>)}</select><button onClick={() => void saveTheme()} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-[10px] font-semibold text-slate-600"><Save className="h-3.5 w-3.5" />Save current theme</button></div>
            <label className="block"><span className="mb-1.5 block text-[11px] font-semibold text-slate-700">Background style</span><select value={page.theme.backgroundType} onChange={(event) => updateTheme({ backgroundType: event.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs"><option value="solid">Solid colour</option><option value="gradient">Gradient</option><option value="image">Image background</option><option value="video">Video background</option></select></label>
            <FieldInput label="Background colour" value={page.theme.backgroundColor} onChange={(backgroundColor) => updateTheme({ backgroundColor })} />
            {page.theme.backgroundType === 'gradient' && <><FieldInput label="Gradient start" value={page.theme.gradientFrom} onChange={(gradientFrom) => updateTheme({ gradientFrom })} /><FieldInput label="Gradient end" value={page.theme.gradientTo} onChange={(gradientTo) => updateTheme({ gradientTo })} /></>}
            {page.theme.backgroundType === 'image' && <><FieldInput label="Background image URL" value={page.theme.backgroundImage || ''} onChange={(backgroundImage) => updateTheme({ backgroundImage })} /><label className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-slate-300 px-3 py-3 text-[10px] font-semibold text-slate-600"><Upload className="h-4 w-4" />Upload background image<input type="file" accept="image/*" className="hidden" disabled={uploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file, 'image', (backgroundImage) => updateTheme({ backgroundImage })); event.currentTarget.value = ''; }} /></label></>}
            {page.theme.backgroundType === 'video' && <><FieldInput label="Background video URL" value={page.theme.backgroundVideo || ''} onChange={(backgroundVideo) => updateTheme({ backgroundVideo })} /><label className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-slate-300 px-3 py-3 text-[10px] font-semibold text-slate-600"><Upload className="h-4 w-4" />Upload background video<input type="file" accept="video/*" className="hidden" disabled={uploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file, 'video', (backgroundVideo) => updateTheme({ backgroundVideo })); event.currentTarget.value = ''; }} /></label></>}
            <FieldInput label="Text colour" value={page.theme.textColor} onChange={(textColor) => updateTheme({ textColor })} />
            <FieldInput label="Muted text colour" value={page.theme.mutedColor} onChange={(mutedColor) => updateTheme({ mutedColor })} />
            <FieldInput label="Accent / button colour" value={page.theme.accentColor} onChange={(accentColor) => updateTheme({ accentColor })} />
            <FieldInput label="Font family" value={page.theme.fontFamily} onChange={(fontFamily) => updateTheme({ fontFamily })} placeholder="Inter, Arial, sans-serif" />
            <label className="block"><span className="mb-1.5 block text-[11px] font-semibold text-slate-700">Content width · {page.theme.contentWidth}px</span><input type="range" min="320" max="1100" step="20" value={page.theme.contentWidth} onChange={(event) => updateTheme({ contentWidth: Number(event.target.value) })} className="w-full accent-blue-600" /></label>
            <label className="block"><span className="mb-1.5 block text-[11px] font-semibold text-slate-700">Card roundness · {page.theme.cardRadius}px</span><input type="range" min="0" max="40" value={page.theme.cardRadius} onChange={(event) => updateTheme({ cardRadius: Number(event.target.value) })} className="w-full accent-blue-600" /></label>
          </>}

          {pane === 'publish' && <>
            <div className="rounded-xl bg-blue-50 p-3"><p className="text-xs font-bold text-blue-900">Dynamic destination</p><p className="mt-1 break-all text-[10px] text-blue-700">{qrUrl(working.code)}</p><button onClick={() => navigator.clipboard?.writeText(qrUrl(working.code)).then(() => setMessage('Link copied.')).catch(() => {})} className="mt-2 inline-flex items-center gap-1 text-[10px] font-bold text-blue-700"><Copy className="h-3 w-3" />Copy scan link</button></div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Scan destination</p><p className="mt-1 text-xs font-bold text-slate-800">{working.destination.type === 'pdf' ? 'PDF / document' : working.destination.type === 'menu' ? 'Digital menu' : working.destination.type === 'enquiry' ? 'Enquiry form' : working.destination.type === 'custom' ? 'Custom landing page' : working.destination.type === 'whatsapp' ? 'WhatsApp chat' : working.destination.kind === 'url' ? 'Website' : 'QR experience'}</p><p className="mt-1 text-[10px] text-slate-500">{working.destination.kind === 'url' ? 'Visitors are sent directly to this destination.' : 'Visitors see the mobile experience you build in the page editor.'}</p></div>
            {working.destination.kind === 'url' && <FieldInput label={working.destination.type === 'pdf' ? 'PDF URL' : 'Destination URL'} value={working.destination.url || ''} onChange={(url) => setWorking((old) => ({ ...old, destination: { ...old.destination, kind: 'url', url } }))} placeholder="https://… or /api/assets/…" />}
            <div className="border-t border-slate-100 pt-4"><p className="mb-2 text-[10px] font-bold uppercase tracking-[.12em] text-slate-400">Schedule availability</p><FieldInput label="Start at" type="datetime-local" value={scheduleValue(working.schedule?.startsAt)} onChange={(value) => setWorking((old) => ({ ...old, schedule: { ...old.schedule, startsAt: value ? new Date(value).toISOString() : undefined } }))} /><div className="mt-3"><FieldInput label="End at" type="datetime-local" value={scheduleValue(working.schedule?.endsAt)} onChange={(value) => setWorking((old) => ({ ...old, schedule: { ...old.schedule, endsAt: value ? new Date(value).toISOString() : undefined } }))} /></div><p className="mt-2 text-[9px] text-slate-400">A scheduled page is only available during its configured window.</p></div>
            <div className="border-t border-slate-100 pt-4"><p className="text-[10px] font-bold uppercase tracking-[.12em] text-slate-400">Published versions</p>{versions.length === 0 ? <p className="mt-2 text-[10px] text-slate-400">Versions are created every time you publish.</p> : versions.slice(0, 8).map((version) => <div key={version.id} className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-slate-100 p-2"><span className="text-[10px] text-slate-600">Version {version.version} · {new Date(version.createdAt).toLocaleString()}</span><button onClick={() => void restoreVersion(version.id)} className="text-[10px] font-bold text-blue-600">Restore</button></div>)}</div>
          </>}
          {uploading && <p className="flex items-center gap-2 text-[10px] text-blue-600"><Loader2 className="h-3 w-3 animate-spin" />Uploading media…</p>}
          {message && <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-[10px] text-emerald-700">{message}</p>}
          {error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-[10px] text-rose-700">{error}</p>}
        </div>
        <div className="border-t border-slate-100 p-3"><button disabled={saving} onClick={() => void save()} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-xs font-bold text-white">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save draft</button></div>
      </aside>
    </div>
    )}
  </div>;
}

export const QRStudio: React.FC<Props> = ({ tenantId }) => {
  const [tab, setTab] = useState<MainTab>('overview');
  const [codes, setCodes] = useState<QrStudioCode[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [themes, setThemes] = useState<QrSavedTheme[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | QrCodeStatus>('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<QrStudioCode | null>(null);
  const [toast, setToast] = useState('');
  const refresh = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const data = await api<any>('/api/qr-studio');
      setCodes(data.codes || []);
    } catch (reason: any) { setError(reason?.message || 'Could not load QR Studio.'); }
    finally { setLoading(false); }
  }, [tenantId]);
  const loadThemes = useCallback(async () => {
    try { const data = await api<{ themes: QrSavedTheme[] }>('/api/qr-studio/themes'); setThemes(data.themes || []); } catch {}
  }, []);
  useEffect(() => { void refresh(); void loadThemes(); }, [refresh, loadThemes]);

  const summary = useMemo(() => ({
    total: codes.length,
    active: codes.filter((code) => code.status === 'active').length,
    scans: codes.reduce((sum, code) => sum + Number(code.scanCount || 0), 0),
    views: codes.reduce((sum, code) => sum + Number(code.pageViewCount || 0), 0),
    visitors: codes.reduce((sum, code) => sum + Number(code.uniqueVisitorCount || 0), 0),
    leads: codes.reduce((sum, code) => sum + Number(code.leadCount || 0), 0),
    clicks: codes.reduce((sum, code) => sum + Number(code.ctaClickCount || 0), 0),
  }), [codes]);
  const filtered = useMemo(() => codes.filter((code) =>
    (statusFilter === 'all' || code.status === statusFilter) &&
    (!query.trim() || `${code.name} ${code.description || ''} ${code.template}`.toLowerCase().includes(query.toLowerCase()))
  ), [codes, statusFilter, query]);
  const loadAnalytics = useCallback(async () => {
    setAnalyticsLoading(true);
    try { const data = await api<{ analytics: any }>('/api/qr-studio/analytics?days=30'); setAnalytics(data.analytics); }
    catch (reason: any) { setError(reason?.message || 'Could not load QR analytics.'); }
    finally { setAnalyticsLoading(false); }
  }, []);
  useEffect(() => { if (tab === 'analytics') void loadAnalytics(); }, [tab, loadAnalytics]);
  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(''), 2600); };
  const onCreated = (code: QrStudioCode) => { setCodes((old) => [code, ...old]); setCreateOpen(false); setEditing(code); };
  const onSaved = (code: QrStudioCode) => setCodes((old) => old.map((item) => item.id === code.id ? code : item));
  const duplicate = async (code: QrStudioCode) => {
    try { const data = await api<{ code: QrStudioCode }>(`/api/qr-studio/${encodeURIComponent(code.id)}/duplicate`, { method: 'POST', body: '{}' }); setCodes((old) => [data.code, ...old]); notify('QR code duplicated.'); }
    catch (reason: any) { notify(reason?.message || 'Could not duplicate QR code.'); }
  };
  const setStatus = async (code: QrStudioCode, status: QrCodeStatus) => {
    try { const data = await api<{ code: QrStudioCode }>(`/api/qr-studio/${encodeURIComponent(code.id)}/status`, { method: 'POST', body: JSON.stringify({ status }) }); if (data.code) onSaved(data.code); notify(`QR code ${status}.`); }
    catch (reason: any) { notify(reason?.message || 'Could not update QR code.'); }
  };
  const archive = async (code: QrStudioCode) => {
    if (!window.confirm(`Archive “${code.name}”? Its public scan link will stop opening.`)) return;
    await setStatus(code, 'archived');
  };
  const remove = async (code: QrStudioCode) => {
    if (!window.confirm(`Permanently delete “${code.name}”? This cannot be undone.`)) return;
    try { await api(`/api/qr-studio/${encodeURIComponent(code.id)}`, { method: 'DELETE' }); setCodes((old) => old.filter((item) => item.id !== code.id)); notify('QR code deleted.'); }
    catch (reason: any) { notify(reason?.message || 'Could not delete QR code.'); }
  };
  const copyLink = async (code: QrStudioCode) => {
    try { await navigator.clipboard.writeText(qrUrl(code.code)); notify('Scan link copied.'); }
    catch { notify(qrUrl(code.code)); }
  };

  const tabButton = (id: MainTab, label: string, icon: React.ReactNode) => <button onClick={() => setTab(id)} className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-xs font-semibold transition ${tab === id ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'}`}>{icon}{label}</button>;

  return <div className="mx-auto w-full max-w-[1500px] space-y-5 text-slate-900">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.18em] text-blue-700"><QrCode className="h-4 w-4" /> Marketing · QR Studio</div><h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Create experiences from every scan.</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Create dynamic QR codes, build the mobile experience behind them, and understand which scans turn into customer enquiries.</p></div><div className="flex items-center gap-2"><button onClick={() => void refresh()} className="rounded-xl border border-slate-200 bg-white p-3 text-slate-500 hover:bg-slate-50" title="Refresh"><RefreshCw className="h-4 w-4" /></button><button onClick={() => setCreateOpen(true)} className="inline-flex items-center gap-2 rounded-xl bg-[#155eef] px-4 py-3 text-xs font-bold text-white shadow-lg shadow-blue-600/20"><Plus className="h-4 w-4" />Create QR code</button></div></div>
    {error && <div role="alert" className="flex items-center justify-between rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">{error}<button onClick={() => void refresh()} className="font-bold underline">Retry</button></div>}
    <div className="flex flex-wrap gap-1 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-[0_1px_2px_rgba(15,23,42,.03)]">
      {tabButton('overview', 'Overview', <BarChart3 className="h-4 w-4" />)}
      {tabButton('codes', 'My QR codes', <QrCode className="h-4 w-4" />)}
      {tabButton('analytics', 'Analytics', <Zap className="h-4 w-4" />)}
      {tabButton('themes', 'Brand & themes', <Palette className="h-4 w-4" />)}
    </div>

    {tab === 'overview' && <>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Metric label="QR codes" value={summary.total} icon={<QrCode className="h-4 w-4" />} detail={`${summary.active} currently active`} />
        <Metric label="Link requests" value={summary.scans} icon={<Zap className="h-4 w-4" />} detail="Includes scanner link prefetches" />
        <Metric label="Page visits" value={summary.views} icon={<Eye className="h-4 w-4" />} detail={`${summary.visitors.toLocaleString()} estimated unique visitors`} />
        <Metric label="Leads generated" value={summary.leads} icon={<Plus className="h-4 w-4" />} detail={`${summary.clicks.toLocaleString()} tracked CTA clicks`} />
      </div>
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div><h2 className="text-sm font-bold">Recently created</h2><p className="mt-1 text-[10px] text-slate-400">Your latest dynamic QR destinations</p></div><button onClick={() => setTab('codes')} className="text-[11px] font-bold text-blue-700">View all <ChevronRight className="inline h-3.5 w-3.5" /></button></div>
        {loading ? <div className="p-10 text-center text-xs text-slate-400"><Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />Loading QR codes…</div> : codes.length === 0 ? <div className="px-5 py-12 text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-700"><QrCode className="h-7 w-7" /></div><h3 className="mt-4 text-sm font-bold">Your first QR experience starts here</h3><p className="mx-auto mt-2 max-w-sm text-xs leading-5 text-slate-500">Create a menu, offer, profile or lead form. You can change its destination even after you print the QR code.</p><button onClick={() => setCreateOpen(true)} className="mt-4 rounded-xl bg-[#155eef] px-4 py-2.5 text-xs font-bold text-white">Create your first QR code</button></div> : <div className="divide-y divide-slate-100">{codes.slice(0, 5).map((code) => <div key={code.id} className="flex items-center gap-3 px-4 py-3.5 sm:px-5"><div className="w-14 shrink-0 rounded-lg border border-slate-200 p-1"><QrImage code={code} className="w-full" /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="truncate text-xs font-bold text-slate-900">{code.name}</p><StatusPill status={code.status} /></div><p className="mt-1 text-[10px] text-slate-400">{qrDestinationLabel(code)}</p></div><div className="hidden text-right sm:block"><p className="text-xs font-bold text-slate-800">{Number(code.pageViewCount || 0).toLocaleString()}</p><p className="text-[9px] text-slate-400">page visits</p></div><button onClick={() => setEditing(code)} className="rounded-lg border border-slate-200 px-3 py-2 text-[10px] font-bold text-slate-600 hover:border-blue-300 hover:text-blue-700">Edit</button></div>)}</div>}
      </section>
      <div className="grid gap-3 lg:grid-cols-2"><div className="rounded-2xl border border-slate-200 bg-white p-5"><div className="flex items-center gap-2 text-slate-900"><Sparkles className="h-4 w-4 text-blue-600" /><h3 className="text-xs font-bold">Build beyond the QR code</h3></div><p className="mt-2 text-xs leading-5 text-slate-500">Create a complete mobile-first page with images, video, galleries, animations, menus, product cards and conditional lead forms.</p></div><div className="rounded-2xl border border-slate-200 bg-white p-5"><div className="flex items-center gap-2 text-slate-900"><Zap className="h-4 w-4 text-blue-600" /><h3 className="text-xs font-bold">Connect scans to sales</h3></div><p className="mt-2 text-xs leading-5 text-slate-500">QR enquiry forms create or update contacts and leads in your CRM with the originating QR code recorded for attribution.</p></div></div>
    </>}

    {tab === 'codes' && <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4"><div><h2 className="text-sm font-bold">My QR codes</h2><p className="mt-1 text-[10px] text-slate-400">{filtered.length} QR code{filtered.length === 1 ? '' : 's'}</p></div><div className="flex flex-wrap items-center gap-2"><label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2"><Search className="h-3.5 w-3.5 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search QR codes" className="w-36 text-xs outline-none" /></label><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as any)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs"><option value="all">All statuses</option><option value="active">Active</option><option value="draft">Draft</option><option value="paused">Paused</option><option value="archived">Archived</option></select></div></div>
      {loading ? <div className="p-10 text-center text-xs text-slate-400"><Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />Loading…</div> : filtered.length === 0 ? <div className="p-12 text-center text-xs text-slate-500">No matching QR codes. Create a new one to get started.</div> : <div className="divide-y divide-slate-100">{filtered.map((code) => <div key={code.id} className="grid grid-cols-[56px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3.5 sm:grid-cols-[64px_minmax(0,1fr)_120px_100px_auto] sm:px-5"><div className="rounded-lg border border-slate-200 p-1"><QrImage code={code} className="w-full" /></div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="truncate text-xs font-bold text-slate-900">{code.name}</p><StatusPill status={code.status} /></div><p className="mt-1 truncate text-[10px] text-slate-400">{qrUrl(code.code)}</p><p className="mt-1 text-[9px] text-slate-400">{qrDestinationLabel(code)} · Updated {new Date(code.updatedAt).toLocaleDateString()}</p></div><div className="hidden text-right sm:block"><p className="text-xs font-bold">{Number(code.scanCount || 0).toLocaleString()}</p><p className="text-[9px] text-slate-400">link requests</p></div><div className="hidden text-right sm:block"><p className="text-xs font-bold">{Number(code.leadCount || 0).toLocaleString()}</p><p className="text-[9px] text-slate-400">leads</p></div><div className="flex items-center justify-end gap-1"><button title="Edit experience" onClick={() => setEditing(code)} className="rounded-lg p-2 text-slate-500 hover:bg-blue-50 hover:text-blue-700"><Settings2 className="h-4 w-4" /></button><button title="Copy scan link" onClick={() => void copyLink(code)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><Link2 className="h-4 w-4" /></button><button title="Download PNG" onClick={() => void downloadQr(code, 'png').catch((e) => notify(e.message))} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><Download className="h-4 w-4" /></button><div className="group relative"><button title="More actions" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><MoreHorizontal className="h-4 w-4" /></button><div className="invisible absolute right-0 top-8 z-20 w-44 rounded-xl border border-slate-200 bg-white p-1 opacity-0 shadow-xl transition group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
          {code.status === 'active' && <button onClick={() => void setStatus(code, 'paused')} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[10px] text-slate-600 hover:bg-slate-50"><CirclePause className="h-3.5 w-3.5" />Pause QR code</button>}
          {(code.status === 'paused' || code.status === 'draft') && <button onClick={() => void setStatus(code, 'active')} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[10px] text-slate-600 hover:bg-slate-50"><Play className="h-3.5 w-3.5" />Activate</button>}
          <button onClick={() => void duplicate(code)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[10px] text-slate-600 hover:bg-slate-50"><Copy className="h-3.5 w-3.5" />Duplicate</button>
          <button onClick={() => void archive(code)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[10px] text-slate-600 hover:bg-slate-50"><Trash2 className="h-3.5 w-3.5" />Archive</button>
          {(code.status === 'archived' || code.status === 'draft') && <button onClick={() => void remove(code)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[10px] text-rose-600 hover:bg-rose-50"><Trash2 className="h-3.5 w-3.5" />Delete permanently</button>}
        </div></div></div></div>)}</div>}
    </section>}

    {tab === 'analytics' && <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
        <Metric label="Link requests" value={summary.scans} icon={<Zap className="h-4 w-4" />} />
        <Metric label="Page visits" value={summary.views} icon={<Eye className="h-4 w-4" />} />
        <Metric label="Unique visitors" value={summary.visitors} icon={<Globe className="h-4 w-4" />} />
        <Metric label="CTA clicks" value={summary.clicks} icon={<ExternalLink className="h-4 w-4" />} />
        <Metric label="Leads" value={summary.leads} icon={<Plus className="h-4 w-4" />} />
      </div>
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-sm font-bold">30-day performance</h2><p className="mt-1 text-[10px] text-slate-400">Daily scan requests, page visits and lead submissions</p></div><button onClick={() => void loadAnalytics()} disabled={analyticsLoading} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-[10px] font-semibold text-slate-600"><RefreshCw className={`h-3.5 w-3.5 ${analyticsLoading ? 'animate-spin' : ''}`} />Refresh</button></div>
        {analyticsLoading && !analytics ? <div className="p-10 text-center text-xs text-slate-400"><Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />Loading daily analytics…</div> : <div className="mt-6">
          <div className="flex h-44 items-end gap-1.5 border-b border-slate-100 pb-2">
            {(analytics?.trend || []).map((day: any) => {
              const peak = Math.max(1, ...(analytics?.trend || []).map((item: any) => Math.max(item.pageViews || 0, item.scans || 0, item.leads || 0)));
              const visitHeight = Math.max(2, (Number(day.pageViews || 0) / peak) * 100);
              const scanHeight = Math.max(2, (Number(day.scans || 0) / peak) * 100);
              const leadHeight = Math.max(2, (Number(day.leads || 0) / peak) * 100);
              return <div key={day.day} className="group flex h-full min-w-0 flex-1 items-end justify-center gap-[2px]" title={`${day.day} · ${day.scans} requests · ${day.pageViews} visits · ${day.leads} leads`}>
                <div className="w-1/3 rounded-t bg-slate-300 transition group-hover:bg-slate-400" style={{ height: `${scanHeight}%` }} />
                <div className="w-1/3 rounded-t bg-blue-500 transition group-hover:bg-blue-600" style={{ height: `${visitHeight}%` }} />
                <div className="w-1/3 rounded-t bg-emerald-500 transition group-hover:bg-emerald-600" style={{ height: `${leadHeight}%` }} />
              </div>;
            })}
            {!analytics?.trend?.length && <p className="m-auto text-xs text-slate-400">No activity in this period yet.</p>}
          </div>
          <div className="mt-3 flex flex-wrap gap-4 text-[10px] text-slate-500"><span className="inline-flex items-center gap-1.5"><i className="h-2 w-2 rounded-sm bg-slate-300"/>Link requests</span><span className="inline-flex items-center gap-1.5"><i className="h-2 w-2 rounded-sm bg-blue-500"/>Page visits</span><span className="inline-flex items-center gap-1.5"><i className="h-2 w-2 rounded-sm bg-emerald-500"/>Leads</span><span className="ml-auto text-slate-400">{analytics?.from || ''} – {analytics?.to || ''}</span></div>
        </div>}
      </section>
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-2xl border border-slate-200 bg-white p-5"><h3 className="text-xs font-bold">Devices</h3><p className="mt-1 text-[10px] text-slate-400">Page-view event sample</p>{(analytics?.devices || []).map((item: any) => <div key={item.name} className="mt-3 flex items-center justify-between gap-2 text-xs"><span className="capitalize text-slate-600">{item.name}</span><span className="font-bold text-slate-900">{item.count}</span></div>)}{!analytics?.devices?.length && <p className="mt-4 text-[10px] text-slate-400">No device data yet.</p>}</section>
        <section className="rounded-2xl border border-slate-200 bg-white p-5"><h3 className="text-xs font-bold">Top referrers</h3><p className="mt-1 text-[10px] text-slate-400">Where visitors arrived from</p>{(analytics?.referrers || []).map((item: any) => <div key={item.name} className="mt-3 flex items-center justify-between gap-2 text-xs"><span className="truncate text-slate-600">{item.name}</span><span className="font-bold text-slate-900">{item.count}</span></div>)}{!analytics?.referrers?.length && <p className="mt-4 text-[10px] text-slate-400">No referrer data yet.</p>}</section>
        <section className="rounded-2xl border border-slate-200 bg-white p-5"><h3 className="text-xs font-bold">Top CTA actions</h3><p className="mt-1 text-[10px] text-slate-400">Most-clicked buttons and links</p>{(analytics?.topCtas || []).map((item: any) => <div key={item.label} className="mt-3 flex items-center justify-between gap-2 text-xs"><span className="truncate text-slate-600">{item.label}</span><span className="font-bold text-slate-900">{item.count}</span></div>)}{!analytics?.topCtas?.length && <p className="mt-4 text-[10px] text-slate-400">CTA events will appear after visitors interact with a published page.</p>}</section>
      </div>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 p-5"><h2 className="text-sm font-bold">Performance by QR code</h2><p className="mt-1 text-[10px] text-slate-400">All-time requests, page views, unique visitors, CTA interactions and CRM enquiries.</p></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left text-xs"><thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-400"><tr><th className="px-5 py-3">QR code</th><th className="px-3 py-3 text-right">Requests</th><th className="px-3 py-3 text-right">Visits</th><th className="px-3 py-3 text-right">Visitors</th><th className="px-3 py-3 text-right">Clicks</th><th className="px-5 py-3 text-right">Leads</th></tr></thead><tbody className="divide-y divide-slate-100">{codes.map((code) => <tr key={code.id}><td className="px-5 py-3"><p className="font-bold text-slate-800">{code.name}</p><p className="mt-1 text-[9px] text-slate-400">{qrDestinationLabel(code)}</p></td><td className="px-3 py-3 text-right">{Number(code.scanCount || 0).toLocaleString()}</td><td className="px-3 py-3 text-right">{Number(code.pageViewCount || 0).toLocaleString()}</td><td className="px-3 py-3 text-right">{Number(code.uniqueVisitorCount || 0).toLocaleString()}</td><td className="px-3 py-3 text-right">{Number(code.ctaClickCount || 0).toLocaleString()}</td><td className="px-5 py-3 text-right font-bold">{Number(code.leadCount || 0).toLocaleString()}</td></tr>)}</tbody></table></div>
        <p className="border-t border-slate-100 px-5 py-3 text-[9px] text-slate-400">Link requests can include scanner prefetches. Page visits are counted when the published experience loads. Device and referrer breakdowns use up to 2,000 recent event records for this period. Unique visitors are privacy-conscious estimates based on a first-party browser identifier.</p>
      </div>
    </div>}

    {tab === 'themes' && <div className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-sm font-bold text-slate-900">Brand themes and reusable sections</h2><p className="mt-1 text-xs text-slate-500">Save design systems and page sections from the experience builder, then reuse them across QR codes.</p></div><button onClick={() => codes[0] ? setEditing(codes[0]) : setCreateOpen(true)} className="rounded-xl bg-[#155eef] px-4 py-2.5 text-xs font-bold text-white">{codes[0] ? 'Open experience builder' : 'Create a QR code'}</button></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{themes.map((theme) => <div key={theme.id} className="rounded-2xl border border-slate-200 bg-white p-4"><div className="mb-3 flex items-center justify-between"><span className="rounded-full bg-blue-50 px-2.5 py-1 text-[9px] font-bold uppercase text-blue-700">{theme.kind}</span><Layers3 className="h-4 w-4 text-slate-400" /></div><p className="text-sm font-bold text-slate-900">{theme.name}</p><p className="mt-1 text-[10px] text-slate-400">{theme.kind === 'theme' ? 'Reusable typography, backgrounds and colours' : 'Reusable content section'}</p>{theme.theme && <div className="mt-4 flex gap-1">{[theme.theme.backgroundColor, theme.theme.accentColor, theme.theme.gradientFrom, theme.theme.gradientTo].filter(Boolean).map((color, index) => <span key={index} className="h-6 flex-1 rounded-md border border-black/5" style={{ backgroundColor: color }} />)}</div>}</div>)}{themes.length === 0 && <div className="col-span-full rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center"><Palette className="mx-auto h-7 w-7 text-slate-300" /><p className="mt-3 text-sm font-bold text-slate-700">No saved themes yet</p><p className="mt-1 text-xs text-slate-500">Create a design in the builder and save it as a reusable theme or section.</p></div>}</div></div>}
    {toast && <div role="status" className="fixed bottom-5 right-5 z-[95] rounded-xl bg-slate-900 px-4 py-3 text-xs font-semibold text-white shadow-xl">{toast}</div>}
    {createOpen && createPortal(<CreateDialog onClose={() => setCreateOpen(false)} onCreated={onCreated} />, document.body)}
    {editing && createPortal(<QrBuilder initial={editing} onClose={() => setEditing(null)} onSaved={onSaved} />, document.body)}
  </div>;
};
