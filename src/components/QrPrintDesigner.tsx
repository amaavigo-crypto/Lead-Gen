import React, { useMemo, useState } from 'react';
import { ArrowRight, Check, Download, ExternalLink, FileImage, FileText, Palette, QrCode, Upload } from 'lucide-react';
import { fileToDataUrl, uploadCompanyAsset } from '../services/assetClientService';
import { renderQrSvg } from '../shared/qrCodeGenerator';
import { createQrPrintDesign } from '../shared/qrStudio';
import type { QrPrintDesign, QrStudioCode } from '../shared/qrStudio';

type Props = {
  code: QrStudioCode;
  onChange: (patch: Partial<QrStudioCode>) => void;
  mobileSettingsOpen: boolean;
  onCloseMobileSettings: () => void;
  onMessage: (message: string) => void;
  onError: (message: string) => void;
  onEditExperience: () => void;
};

const FORMATS = [
  { id: 'a4', label: 'A4 poster', size: '210 × 297 mm', width: 800, height: 1131, mmWidth: 210, mmHeight: 297 },
  { id: 'a5', label: 'A5 poster', size: '148 × 210 mm', width: 566, height: 800, mmWidth: 148, mmHeight: 210 },
  { id: 'table-tent', label: 'Table tent', size: '160 × 100 mm', width: 1120, height: 700, mmWidth: 160, mmHeight: 100 },
  { id: 'square', label: 'Square display', size: '100 × 100 mm', width: 800, height: 800, mmWidth: 100, mmHeight: 100 },
  { id: 'flyer', label: 'Flyer', size: '102 × 152 mm', width: 720, height: 1080, mmWidth: 102, mmHeight: 152 },
  { id: 'business-card', label: 'Business card', size: '89 × 51 mm', width: 1050, height: 600, mmWidth: 89, mmHeight: 51 },
] as const;

const THEMES = [
  { id: 'minimal', label: 'Minimal', description: 'Clean, spacious and simple' },
  { id: 'brand', label: 'Brand', description: 'Use your brand colour as the accent' },
  { id: 'bold', label: 'Bold', description: 'High-impact, strong contrast' },
] as const;

function esc(value: string): string {
  return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function qrUrl(code: string): string {
  return `${window.location.origin}/q/${encodeURIComponent(code)}`;
}

function qrSvg(code: QrStudioCode): string {
  const logoUrl = code.qrStyle?.logoUrl || '';
  const style = logoUrl.startsWith('/') ? { ...code.qrStyle, logoUrl: `${window.location.origin}${logoUrl}` } : code.qrStyle;
  return renderQrSvg(qrUrl(code.code), style || {});
}

function renderArtwork(code: QrStudioCode): { svg: string; width: number; height: number; mmWidth: number; mmHeight: number } {
  const design: QrPrintDesign = code.printDesign || createQrPrintDesign(code.name);
  const format = FORMATS.find((item) => item.id === design.format) || FORMATS[0];
  const qr = qrSvg(code);
  const viewBox = qr.match(/viewBox="0 0 ([0-9.]+) ([0-9.]+)"/);
  const inner = qr.match(/^<svg\b[^>]*>([\s\S]*)<\/svg>$/);
  if (!viewBox || !inner) throw new Error('Could not prepare the QR artwork. Check the QR destination and try again.');
  const qrWidth = Number(viewBox[1]);
  const qrHeight = Number(viewBox[2]);
  const { width, height } = format;
  const landscape = width > height * 1.25;
  const padding = Math.round(Math.min(width, height) * 0.075);
  const textColor = design.theme === 'bold' ? '#FFFFFF' : design.textColor;
  const background = design.theme === 'bold' ? '#101828' : design.backgroundColor;
  const accent = design.accentColor;
  const titleFont = Math.round(Math.min(width, height) * (landscape ? 0.075 : 0.065));
  const subtitleFont = Math.round(titleFont * 0.42);
  const footerFont = Math.round(titleFont * 0.31);
  const qrSide = Math.round(Math.min(landscape ? height * 0.52 : width * 0.55, landscape ? width * 0.38 : height * 0.42));
  const qrX = Math.round((width - qrSide) / 2);
  const qrY = Math.round(landscape ? height * 0.31 : height * 0.34);
  const titleY = Math.round(landscape ? height * 0.16 : height * 0.17);
  const subtitleY = Math.round(landscape ? height * 0.24 : height * 0.235);
  const footerY = Math.round(height * 0.9);
  const band = design.theme === 'brand'
    ? `<path d="M0 0 H${width} V${Math.round(height * 0.055)} H0Z" fill="${accent}"/><path d="M0 ${Math.round(height * 0.945)} H${width} V${height} H0Z" fill="${accent}"/>`
    : design.theme === 'bold'
      ? `<rect x="${padding / 2}" y="${padding / 2}" width="${width - padding}" height="${height - padding}" rx="${Math.round(padding * 0.45)}" fill="none" stroke="${accent}" stroke-width="${Math.max(5, Math.round(padding * 0.08))}"/>`
      : `<rect x="${padding}" y="${Math.round(height * 0.085)}" width="${width - padding * 2}" height="${Math.max(5, Math.round(Math.min(width, height) * 0.012))}" rx="4" fill="${accent}"/>`;
  const logoUrl = String(design.logoUrl || '').trim();
  const resolvedLogo = logoUrl.startsWith('/') ? `${window.location.origin}${logoUrl}` : logoUrl;
  const logo = /^https?:\/\//i.test(resolvedLogo)
    ? `<image href="${esc(resolvedLogo)}" x="${Math.round(width * 0.4)}" y="${Math.round(height * 0.065)}" width="${Math.round(width * 0.2)}" height="${Math.round(height * 0.09)}" preserveAspectRatio="xMidYMid meet"/>`
    : '';
  const title = esc(design.headline || 'Scan to explore');
  const subtitle = esc(design.subheadline || '');
  const footer = esc(design.footerText || code.name);
  const linkLabel = esc(code.name);
  const qrMarkup = `<svg x="${qrX}" y="${qrY}" width="${qrSide}" height="${qrSide * (qrHeight / qrWidth)}" viewBox="0 0 ${qrWidth} ${qrHeight}" preserveAspectRatio="xMidYMid meet">${inner[1]}</svg>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Printable QR artwork for ${linkLabel}"><rect width="${width}" height="${height}" fill="${background}"/>${band}${logo}<text x="${width / 2}" y="${titleY}" text-anchor="middle" fill="${textColor}" font-family="Arial, sans-serif" font-size="${titleFont}" font-weight="700">${title}</text>${subtitle ? `<text x="${width / 2}" y="${subtitleY}" text-anchor="middle" fill="${textColor}" opacity=".72" font-family="Arial, sans-serif" font-size="${subtitleFont}">${subtitle}</text>` : ''}<rect x="${qrX - padding * .12}" y="${qrY - padding * .12}" width="${qrSide + padding * .24}" height="${qrSide * (qrHeight / qrWidth) + padding * .24}" rx="${Math.round(padding * .18)}" fill="#FFFFFF" stroke="#E5EAF2" stroke-width="2"/>${qrMarkup}<text x="${width / 2}" y="${footerY}" text-anchor="middle" fill="${textColor}" font-family="Arial, sans-serif" font-size="${footerFont}" font-weight="700">${esc(code.qrStyle?.frameText || 'SCAN TO EXPLORE')}</text><text x="${width / 2}" y="${Math.round(height * .94)}" text-anchor="middle" fill="${textColor}" opacity=".6" font-family="Arial, sans-serif" font-size="${Math.round(footerFont * .78)}">${footer}</text></svg>`;
  return { svg, width, height, mmWidth: format.mmWidth, mmHeight: format.mmHeight };
}

function dataUri(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function downloadBlob(blob: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
}

async function downloadArtwork(code: QrStudioCode, kind: 'svg' | 'png' | 'pdf') {
  const artwork = renderArtwork(code);
  const safeName = code.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'qr-artwork';
  if (kind === 'svg') {
    downloadBlob(new Blob([artwork.svg], { type: 'image/svg+xml;charset=utf-8' }), `${safeName}-print.svg`);
    return;
  }
  if (kind === 'pdf') {
    const popup = window.open('', '_blank', 'width=900,height=900');
    if (!popup) throw new Error('Allow pop-ups to create your print-ready PDF.');
    const image = dataUri(artwork.svg);
    popup.document.write(`<!doctype html><html><head><title>${safeName} print design</title><style>@page{size:${artwork.mmWidth}mm ${artwork.mmHeight}mm;margin:0}html,body{margin:0;width:100%;height:100%;background:#fff}img{display:block;width:100%;height:100%;object-fit:contain}</style></head><body><img src="${image}" alt="QR print design"><script>window.addEventListener('load',()=>window.print())<\/script></body></html>`);
    popup.document.close();
    return;
  }
  const image = new Image();
  const objectUrl = URL.createObjectURL(new Blob([artwork.svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Could not render the print artwork as a PNG. Try SVG or PDF export.'));
      image.src = objectUrl;
    });
    const canvas = document.createElement('canvas');
    canvas.width = 2400;
    canvas.height = Math.round(canvas.width * (artwork.height / artwork.width));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Your browser could not prepare the PNG.');
    context.fillStyle = '#FFFFFF';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('PNG export failed.')), 'image/png'));
    downloadBlob(blob, `${safeName}-print.png`);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return <label className="block"><span className="mb-1.5 block text-[11px] font-semibold text-slate-700">{label}</span><input value={value || ''} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="w-full min-w-0 rounded-xl border border-slate-200 px-3 py-2.5 text-xs text-slate-800 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10" /></label>;
}

export const QrPrintDesigner: React.FC<Props> = ({ code, onChange, mobileSettingsOpen, onCloseMobileSettings, onMessage, onError, onEditExperience }) => {
  const [panel, setPanel] = useState<'artwork' | 'qr' | 'destination'>('artwork');
  const [uploading, setUploading] = useState(false);
  const design = code.printDesign || createQrPrintDesign(code.name);
  const preview = useMemo(() => {
    try { return dataUri(renderArtwork(code).svg); } catch { return ''; }
  }, [code.code, code.name, code.qrStyle, code.printDesign]);
  const patchDesign = (patch: Partial<QrPrintDesign>) => onChange({ printDesign: { ...design, ...patch } });
  const patchQr = (patch: Record<string, any>) => onChange({ qrStyle: { ...code.qrStyle, ...patch } });
  const uploadLogo = async (file?: File, target: 'artwork' | 'qr' = 'artwork') => {
    if (!file) return;
    setUploading(true);
    onError('');
    try {
      if (!file.type.startsWith('image/')) throw new Error('Choose a PNG, JPG, SVG or WebP logo.');
      if (file.size > 700 * 1024) throw new Error('Logo files must be 700 KB or smaller.');
      const dataUrl = await fileToDataUrl(file);
      const asset = await uploadCompanyAsset({ name: file.name, category: 'OTHER', mimeType: file.type, dataUrl, size: file.size, altText: file.name });
      if (target === 'qr') patchQr({ logoUrl: asset.url });
      else patchDesign({ logoUrl: asset.url });
      onMessage('Logo uploaded to your workspace assets.');
    } catch (reason: any) {
      onError(reason?.message || 'Could not upload the logo.');
    } finally {
      setUploading(false);
    }
  };
  const format = FORMATS.find((item) => item.id === design.format) || FORMATS[0];
  const destinationType = code.destination?.type || (code.destination?.kind === 'url' ? 'website' : code.template === 'menu' ? 'menu' : code.template === 'lead-capture' ? 'enquiry' : 'custom');
  const destinationLabel = destinationType === 'pdf' ? 'PDF document' : destinationType === 'menu' ? 'Digital menu' : destinationType === 'enquiry' ? 'Enquiry form' : destinationType === 'custom' ? 'Custom landing page' : destinationType === 'whatsapp' ? 'WhatsApp' : 'Website';
  return <div className="flex min-h-0 flex-1 overflow-hidden">
    <aside className="hidden w-[218px] shrink-0 flex-col border-r border-slate-200 bg-white 2xl:flex">
      <div className="border-b border-slate-100 p-4"><p className="text-[10px] font-bold uppercase tracking-[.16em] text-slate-400">Print design</p><p className="mt-1 text-xs text-slate-500">Choose a size and visual style.</p></div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
        <div><p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">Print format</p><div className="space-y-1.5">{FORMATS.map((item) => <button key={item.id} onClick={() => patchDesign({ format: item.id })} className={`flex w-full items-start justify-between rounded-xl border p-2.5 text-left ${design.format === item.id ? 'border-blue-400 bg-blue-50' : 'border-slate-200 hover:bg-slate-50'}`}><span><span className="block text-[11px] font-bold text-slate-800">{item.label}</span><span className="mt-0.5 block text-[9px] text-slate-400">{item.size}</span></span>{design.format === item.id && <Check className="h-4 w-4 text-blue-600" />}</button>)}</div></div>
        <div><p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">Artwork style</p><div className="space-y-1.5">{THEMES.map((item) => <button key={item.id} onClick={() => patchDesign({ theme: item.id })} className={`w-full rounded-xl border p-2.5 text-left ${design.theme === item.id ? 'border-blue-400 bg-blue-50' : 'border-slate-200 hover:bg-slate-50'}`}><span className="block text-[11px] font-bold text-slate-800">{item.label}</span><span className="mt-0.5 block text-[9px] text-slate-400">{item.description}</span></button>)}</div></div>
      </div>
    </aside>

    <main className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-6">
      <div className="mx-auto flex w-full max-w-[820px] flex-col items-center gap-4">
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <div><p className="text-[10px] font-bold uppercase tracking-[.15em] text-slate-400">Live print preview</p><p className="mt-1 text-xs text-slate-500">{format.label} · {format.size} · {destinationLabel}</p></div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button onClick={() => void downloadArtwork(code, 'svg').catch((e) => onError(e.message))} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[10px] font-bold text-slate-600 hover:border-blue-300"><FileImage className="h-3.5 w-3.5" />SVG</button>
            <button onClick={() => void downloadArtwork(code, 'png').catch((e) => onError(e.message))} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[10px] font-bold text-slate-600 hover:border-blue-300"><Download className="h-3.5 w-3.5" />PNG</button>
            <button onClick={() => void downloadArtwork(code, 'pdf').catch((e) => onError(e.message))} className="inline-flex items-center gap-1.5 rounded-lg bg-[#155eef] px-3 py-2 text-[10px] font-bold text-white hover:bg-blue-700"><FileText className="h-3.5 w-3.5" />Print PDF</button>
          </div>
        </div>
        <div className="w-full rounded-2xl border border-slate-200 bg-[#e9edf4] p-3 shadow-inner sm:p-6">
          <div className="mx-auto overflow-hidden rounded-md bg-white shadow-[0_12px_40px_rgba(15,23,42,.18)]" style={{ maxWidth: format.width > format.height ? 660 : 520, aspectRatio: `${format.width} / ${format.height}` }}>
            {preview ? <img src={preview} alt={`Print-ready QR artwork for ${code.name}`} className="block h-full w-full object-contain" /> : <div className="flex h-full items-center justify-center text-xs text-rose-600">QR artwork preview could not be generated.</div>}
          </div>
        </div>
        <div className="flex w-full flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3">
          <div className="min-w-0"><p className="text-[11px] font-bold text-slate-800">{code.name}</p><p className="mt-1 truncate text-[10px] text-slate-400">{qrUrl(code.code)}</p></div>
          <span className="shrink-0 rounded-full bg-blue-50 px-2.5 py-1 text-[9px] font-bold text-blue-700">{code.status}</span>
        </div>
      </div>
    </main>

    {mobileSettingsOpen && <button type="button" aria-label="Close print design settings" onClick={onCloseMobileSettings} className="fixed inset-0 z-[1001] bg-slate-950/30 xl:hidden" />}
    <aside className={`hidden w-[330px] shrink-0 flex-col border-l border-slate-200 bg-white xl:flex ${mobileSettingsOpen ? 'qr-mobile-settings-open' : ''}`}>
      <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-4 py-4"><div><p className="text-xs font-bold text-slate-900">Design settings</p><p className="mt-1 text-[10px] text-slate-400">Fine-tune the artwork and actual QR.</p></div><button onClick={onCloseMobileSettings} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 xl:hidden">×</button></div>
      <div className="flex shrink-0 gap-1 border-b border-slate-100 p-3"><button onClick={() => setPanel('artwork')} className={`flex-1 rounded-lg px-2 py-2 text-[10px] font-bold ${panel === 'artwork' ? 'bg-blue-50 text-blue-700' : 'text-slate-500'}`}><Palette className="mr-1 inline h-3.5 w-3.5" />Artwork</button><button onClick={() => setPanel('qr')} className={`flex-1 rounded-lg px-2 py-2 text-[10px] font-bold ${panel === 'qr' ? 'bg-blue-50 text-blue-700' : 'text-slate-500'}`}><QrCode className="mr-1 inline h-3.5 w-3.5" />QR code</button><button onClick={() => setPanel('destination')} className={`flex-1 rounded-lg px-2 py-2 text-[10px] font-bold ${panel === 'destination' ? 'bg-blue-50 text-blue-700' : 'text-slate-500'}`}><ExternalLink className="mr-1 inline h-3.5 w-3.5" />Destination</button></div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {panel === 'artwork' && <>
          <label className="block"><span className="mb-1.5 block text-[11px] font-semibold text-slate-700">Print format</span><select value={design.format} onChange={(event) => patchDesign({ format: event.target.value as any })} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs">{FORMATS.map((item) => <option key={item.id} value={item.id}>{item.label} · {item.size}</option>)}</select></label>
          <label className="block"><span className="mb-1.5 block text-[11px] font-semibold text-slate-700">Artwork style</span><select value={design.theme} onChange={(event) => patchDesign({ theme: event.target.value as any })} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs">{THEMES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
          <Field label="Headline" value={design.headline} onChange={(headline) => patchDesign({ headline })} />
          <Field label="Supporting text" value={design.subheadline} onChange={(subheadline) => patchDesign({ subheadline })} />
          <Field label="Business / footer text" value={design.footerText} onChange={(footerText) => patchDesign({ footerText })} />
          <div className="grid grid-cols-2 gap-3"><label className="block"><span className="mb-1 block text-[10px] font-semibold text-slate-600">Background</span><input type="color" value={design.backgroundColor} onChange={(event) => patchDesign({ backgroundColor: event.target.value })} className="h-10 w-full rounded-lg border border-slate-200 bg-white p-1" /></label><label className="block"><span className="mb-1 block text-[10px] font-semibold text-slate-600">Text colour</span><input type="color" value={design.textColor} onChange={(event) => patchDesign({ textColor: event.target.value })} className="h-10 w-full rounded-lg border border-slate-200 bg-white p-1" /></label></div>
          <label className="block"><span className="mb-1 block text-[10px] font-semibold text-slate-600">Accent colour</span><input type="color" value={design.accentColor} onChange={(event) => patchDesign({ accentColor: event.target.value })} className="h-10 w-full rounded-lg border border-slate-200 bg-white p-1" /></label>
          <div className="space-y-2"><p className="text-[11px] font-semibold text-slate-700">Business logo</p>{design.logoUrl && <img src={design.logoUrl} alt="Business logo" className="h-12 max-w-full rounded-lg border border-slate-100 bg-white p-1 object-contain" />}<label className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-slate-300 px-3 py-3 text-[10px] font-semibold text-slate-600 hover:border-blue-400"><Upload className="h-4 w-4" />{uploading ? 'Uploading…' : 'Upload logo'}<input type="file" accept="image/*" className="hidden" disabled={uploading} onChange={(event) => { void uploadLogo(event.target.files?.[0], 'artwork'); event.currentTarget.value = ''; }} /></label></div>
        </>}
        {panel === 'destination' && <>
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">What opens when someone scans</p><p className="mt-1 text-sm font-bold text-slate-900">{destinationLabel}</p><p className="mt-1 text-[10px] leading-5 text-slate-500">The printed QR remains the same when you update this destination.</p></div>
          {code.destination.kind === 'url' ? <>
            <Field label={code.destination.type === 'pdf' ? 'PDF document URL' : code.destination.type === 'whatsapp' ? 'WhatsApp destination URL' : 'Website URL'} value={code.destination.url || ''} onChange={(url) => onChange({ destination: { ...code.destination, kind: 'url', url } })} placeholder="https://… or /api/assets/…" />
            <p className="rounded-lg bg-blue-50 p-3 text-[10px] leading-5 text-blue-800">Changes take effect after you save and publish. Your previously printed QR code does not need to change.</p>
          </> : <div className="space-y-3 rounded-xl border border-slate-200 p-3"><p className="text-xs font-semibold text-slate-800">This QR opens your mobile page.</p><p className="text-[10px] leading-5 text-slate-500">Edit its content separately. Your printed artwork and QR styling stay independent.</p><button type="button" onClick={onEditExperience} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-50 px-3 py-2.5 text-xs font-bold text-blue-700 hover:bg-blue-100">Edit scan experience <ArrowRight className="h-3.5 w-3.5" /></button></div>}
        </>}
        {panel === 'qr' && <>
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-center"><div className="mx-auto w-36 rounded-lg bg-white p-2"><img src={dataUri(qrSvg(code))} alt="Actual scannable QR code" className="w-full" /></div><p className="mt-2 text-[9px] text-slate-500">This is the exact dynamic QR embedded in the print artwork.</p></div>
          <label className="block"><span className="mb-1.5 block text-[11px] font-semibold text-slate-700">Module shape</span><select value={code.qrStyle?.shape || 'square'} onChange={(event) => patchQr({ shape: event.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs"><option value="square">Square</option><option value="rounded">Rounded</option><option value="dots">Dots</option></select></label>
          <div className="grid grid-cols-2 gap-3"><label className="block"><span className="mb-1 block text-[10px] font-semibold text-slate-600">QR foreground</span><input type="color" value={code.qrStyle?.foregroundColor || '#101828'} onChange={(event) => patchQr({ foregroundColor: event.target.value })} className="h-10 w-full rounded-lg border border-slate-200 bg-white p-1" /></label><label className="block"><span className="mb-1 block text-[10px] font-semibold text-slate-600">QR background</span><input type="color" value={code.qrStyle?.backgroundColor || '#FFFFFF'} onChange={(event) => patchQr({ backgroundColor: event.target.value })} className="h-10 w-full rounded-lg border border-slate-200 bg-white p-1" /></label></div>
          <Field label="Text under QR" value={code.qrStyle?.frameText || ''} onChange={(frameText) => patchQr({ frameText })} placeholder="SCAN TO EXPLORE" />
          <div className="space-y-2"><p className="text-[11px] font-semibold text-slate-700">QR centre logo (optional)</p><label className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-slate-300 px-3 py-3 text-[10px] font-semibold text-slate-600 hover:border-blue-400"><Upload className="h-4 w-4" />{uploading ? 'Uploading…' : 'Upload centre logo'}<input type="file" accept="image/*" className="hidden" disabled={uploading} onChange={(event) => { void uploadLogo(event.target.files?.[0], 'qr'); event.currentTarget.value = ''; }} /></label></div>
          <p className="rounded-lg bg-amber-50 p-3 text-[10px] leading-5 text-amber-800">Use strong contrast and keep the logo modest in size. Always scan-test the final print at its real physical size.</p>
        </>}
      </div>
    </aside>
  </div>;
};
