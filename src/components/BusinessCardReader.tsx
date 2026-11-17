import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle, Check, CheckCircle2, ChevronDown, Download, Eye, FileImage, FileText, Loader2,
  Pencil, Plus, RefreshCw, Search, ShieldCheck, Smartphone, Trash2, Upload, UserRoundPlus, X,
} from 'lucide-react';

type CardFields = {
  fullName: string; firstName: string; lastName: string; designation: string; department: string; companyName: string;
  phones: string[]; emails: string[]; website: string; address: string; city: string; state: string; postalCode: string;
  country: string; linkedin: string; otherSocialProfiles: string[]; notes: string; rawText: string;
  confidence: number; fieldConfidence: Record<string, number>;
};
type CardContact = CardFields & {
  contactId: string; scanId: string; sourceFileName?: string; ocrProvider?: string; ocrModel?: string;
  createdAt?: string; crmLeadId?: string; crmContactId?: string;
};
type ScanDraft = {
  scanId: string; fileName: string; mimeType: string; previewUrl: string;
  fields: CardFields; provider: string; model: string; status: 'READY' | 'ERROR' | 'SAVED'; error?: string;
};
type ApiFailure = Error & { status?: number; data?: any };
type Props = { tenantId?: string; autoOpenScanner?: boolean; onAutoOpenHandled?: () => void };

const MAX_FILE_BYTES = 2_800_000;
const MAX_BATCH_FILES = 10;
const EMPTY_FIELDS: CardFields = {
  fullName: '', firstName: '', lastName: '', designation: '', department: '', companyName: '',
  phones: [], emails: [], website: '', address: '', city: '', state: '', postalCode: '', country: '',
  linkedin: '', otherSocialProfiles: [], notes: '', rawText: '', confidence: 0, fieldConfidence: {},
};
const EDIT_FIELDS: Array<{ key: keyof CardFields; label: string }> = [
  { key: 'fullName', label: 'Full name' }, { key: 'firstName', label: 'First name' },
  { key: 'lastName', label: 'Last name' }, { key: 'designation', label: 'Designation' },
  { key: 'department', label: 'Department' }, { key: 'companyName', label: 'Company' },
  { key: 'phones', label: 'Phone numbers' }, { key: 'emails', label: 'Email addresses' },
  { key: 'website', label: 'Website' }, { key: 'linkedin', label: 'LinkedIn profile' },
  { key: 'address', label: 'Street address' }, { key: 'city', label: 'City' },
  { key: 'state', label: 'State / region' }, { key: 'postalCode', label: 'Postal code' },
  { key: 'country', label: 'Country' }, { key: 'otherSocialProfiles', label: 'Other social profiles' },
];

async function apiRequest<T = any>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data?.error || ('Request failed (' + response.status + ')')) as ApiFailure;
    error.status = response.status; error.data = data; throw error;
  }
  return data as T;
}
function jsonPost(body: unknown): RequestInit {
  return { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}
function csvCell(value: unknown): string { return '"' + String(value ?? '').replace(/"/g, '""') + '"'; }
function downloadCsv(rows: CardContact[]) {
  if (!rows.length) return;
  const keys: Array<keyof CardContact> = [
    'fullName', 'firstName', 'lastName', 'designation', 'department', 'companyName', 'phones', 'emails',
    'website', 'linkedin', 'address', 'city', 'state', 'postalCode', 'country', 'notes', 'rawText',
  ];
  const output = [keys.map(csvCell).join(','), ...rows.map((row) => keys.map((key) =>
    csvCell(Array.isArray(row[key]) ? (row[key] as string[]).join(' | ') : row[key])).join(','))].join('\r\n');
  const url = URL.createObjectURL(new Blob([output], { type: 'text/csv;charset=utf-8;' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'business-card-contacts.csv';
  document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
}
function displayDate(value?: string) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
function fieldString(value: unknown): string {
  return Array.isArray(value) ? value.join(', ') : String(value ?? '');
}
function splitValues(value: string): string[] {
  return Array.from(new Set(value.split(/[,\n;]/).map((item) => item.trim()).filter(Boolean)));
}
async function readFileForUpload(file: File): Promise<{ dataUrl: string; fileName: string; mimeType: string }> {
  let uploadFile = file;
  if (file.type.startsWith('image/') && file.size > MAX_FILE_BYTES) {
    if (typeof createImageBitmap !== 'function') throw new Error('This image is larger than 2.8 MB. Please resize it before uploading.');
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 2200 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not prepare this image for upload.');
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
    let dataUrl = '';
    for (const quality of [0.88, 0.78, 0.68, 0.58, 0.48]) {
      dataUrl = canvas.toDataURL('image/jpeg', quality);
      if (Math.ceil((dataUrl.length * 3) / 4) < MAX_FILE_BYTES) break;
    }
    if (Math.ceil((dataUrl.length * 3) / 4) > MAX_FILE_BYTES) throw new Error('Could not reduce this image below 2.8 MB.');
    return { dataUrl, fileName: file.name.replace(/\.[^.]+$/, '') + '.jpg', mimeType: 'image/jpeg' };
  }
  if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(file.type)) {
    throw new Error('Choose a JPG, PNG, WEBP image or PDF.');
  }
  if (file.size > MAX_FILE_BYTES) throw new Error('PDF files must be 2.8 MB or smaller.');
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read this file.'));
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Could not read this file.'));
    reader.readAsDataURL(file);
  });
  return { dataUrl, fileName: file.name, mimeType: file.type };
}

export const BusinessCardReader: React.FC<Props> = ({ tenantId = '', autoOpenScanner = false, onAutoOpenHandled }) => {
  const [contacts, setContacts] = useState<CardContact[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState('');
  const [scans, setScans] = useState<ScanDraft[]>([]);
  const [activeScanId, setActiveScanId] = useState('');
  const [duplicateMatches, setDuplicateMatches] = useState<Array<Record<string, any>>>([]);
  const [saving, setSaving] = useState(false);
  const [editContact, setEditContact] = useState<CardContact | null>(null);
  const [editFields, setEditFields] = useState<CardFields>(EMPTY_FIELDS);
  const [viewScan, setViewScan] = useState<any>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const loadContacts = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const data = await apiRequest<{ contacts: CardContact[] }>('/api/business-cards?q=' + encodeURIComponent(search.trim()));
      setContacts(data.contacts || []);
    } catch (err: any) { setError(err?.message || 'Could not load business card contacts.'); }
    finally { setLoading(false); }
  }, [search]);

  useEffect(() => { void loadContacts(); }, [loadContacts, tenantId]);
  useEffect(() => {
    if (!autoOpenScanner) return;
    setScannerOpen(true); setError(''); onAutoOpenHandled?.();
  }, [autoOpenScanner, onAutoOpenHandled]);

  const activeScan = useMemo(() => scans.find((scan) => scan.scanId === activeScanId) || null, [scans, activeScanId]);
  const savedCount = contacts.length;
  const companyCount = useMemo(() => new Set(contacts.map((item) => item.companyName).filter(Boolean)).size, [contacts]);
  const scanCount = scans.length;

  const openScanner = () => {
    setSelectedFiles([]); setScans([]); setActiveScanId(''); setDuplicateMatches([]);
    setScanProgress(''); setError(''); setNotice(''); setScannerOpen(true);
  };
  const addFiles = (list: FileList | null) => {
    if (!list) return;
    setError('');
    const next = Array.from(list);
    setSelectedFiles((current) => current.concat(next).slice(0, MAX_BATCH_FILES));
  };
  const removeFile = (index: number) => setSelectedFiles((current) => current.filter((_file, i) => i !== index));

  const startScanning = async () => {
    if (!selectedFiles.length || scanning) return;
    setScanning(true); setError(''); setScans([]); setActiveScanId(''); setDuplicateMatches([]);
    const completed: ScanDraft[] = [];
    for (let index = 0; index < selectedFiles.length; index++) {
      const file = selectedFiles[index];
      setScanProgress('Reading card ' + (index + 1) + ' of ' + selectedFiles.length + ': ' + file.name);
      try {
        const upload = await readFileForUpload(file);
        const result = await apiRequest<any>('/api/business-cards/extract', jsonPost(upload));
        const draft: ScanDraft = {
          scanId: result.scanId, fileName: result.fileName || upload.fileName, mimeType: result.mimeType || upload.mimeType,
          previewUrl: upload.dataUrl, fields: { ...EMPTY_FIELDS, ...(result.fields || {}) },
          provider: result.provider || 'gemini', model: result.model || '', status: 'READY',
        };
        completed.push(draft); setScans([...completed]); setActiveScanId((current) => current || draft.scanId);
      } catch (err: any) {
        completed.push({
          scanId: 'failed_' + index + '_' + Date.now(), fileName: file.name, mimeType: file.type,
          previewUrl: '', fields: { ...EMPTY_FIELDS }, provider: '', model: '', status: 'ERROR',
          error: err?.message || 'Could not read this business card.',
        });
        setScans([...completed]);
      }
    }
    setSelectedFiles([]); setScanning(false); setScanProgress('');
    const good = completed.filter((item) => item.status === 'READY').length;
    if (good) setNotice(good + ' card' + (good === 1 ? '' : 's') + ' ready for review. Check the extracted details before saving.');
    if (!good) setError('No cards could be read. Review the errors and try again with a clearer image.');
  };

  const updateScanFields = (scanId: string, patch: Partial<CardFields>) => {
    setScans((current) => current.map((item) => item.scanId === scanId ? { ...item, fields: { ...item.fields, ...patch } } : item));
    setDuplicateMatches([]);
  };
  const saveScan = async (scan: ScanDraft, allowDuplicate = false) => {
    if (scan.status !== 'READY' || saving) return;
    setSaving(true); setError(''); setDuplicateMatches([]);
    try {
      await apiRequest('/api/business-cards/save', jsonPost({ scanId: scan.scanId, fields: scan.fields, allowDuplicate }));
      setScans((current) => current.map((item) => item.scanId === scan.scanId ? { ...item, status: 'SAVED' } : item));
      setNotice('Saved ' + (scan.fields.fullName || scan.fields.companyName || scan.fileName) + ' to Business Card Contacts.');
      await loadContacts();
    } catch (err: any) {
      if (err?.status === 409) setDuplicateMatches(err.data?.duplicates || []);
      else setError(err?.message || 'Could not save this contact.');
    } finally { setSaving(false); }
  };

  const openEdit = (contact: CardContact) => {
    setDuplicateMatches([]); setEditContact(contact); setEditFields({ ...EMPTY_FIELDS, ...contact });
  };
  const saveEdit = async (allowDuplicate = false) => {
    if (!editContact || saving) return;
    setSaving(true); setError(''); setDuplicateMatches([]);
    try {
      await apiRequest('/api/business-cards/contacts/' + encodeURIComponent(editContact.contactId), {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: editFields, allowDuplicate }),
      });
      setEditContact(null); setNotice('Business card contact updated.'); await loadContacts();
    } catch (err: any) {
      if (err?.status === 409) setDuplicateMatches(err.data?.duplicates || []);
      else setError(err?.message || 'Could not update this contact.');
    } finally { setSaving(false); }
  };

  const openOriginal = async (contact: CardContact) => {
    setError('');
    try {
      const data = await apiRequest<any>('/api/business-cards/scans/' + encodeURIComponent(contact.scanId));
      setViewScan(data.scan);
    } catch (err: any) { setError(err?.message || 'Could not open the original card.'); }
  };
  const convertToLead = async (contact: CardContact) => {
    setError('');
    try {
      const result = await apiRequest<any>('/api/business-cards/contacts/' + encodeURIComponent(contact.contactId) + '/convert-to-lead', { method: 'POST' });
      setNotice(result.alreadyConverted ? 'This contact was already linked to a CRM lead.' : 'Contact converted to a CRM lead successfully.');
      await loadContacts();
    } catch (err: any) { setError(err?.message || 'Could not convert this contact to a CRM lead.'); }
  };
  const removeContact = async (contact: CardContact) => {
    if (!window.confirm('Delete this Business Card Reader contact? The original scan will remain in scan history.')) return;
    setError('');
    try {
      await apiRequest('/api/business-cards/contacts/' + encodeURIComponent(contact.contactId), { method: 'DELETE' });
      setNotice('Business card contact deleted.'); await loadContacts();
    } catch (err: any) { setError(err?.message || 'Could not delete this contact.'); }
  };

  const renderFields = (fields: CardFields, onChange: (patch: Partial<CardFields>) => void, showRawText = true) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {EDIT_FIELDS.map(({ key, label }) => {
        const isArray = key === 'phones' || key === 'emails' || key === 'otherSocialProfiles';
        const value = fieldString(fields[key]);
        return <label key={String(key)} className="block min-w-0">
          <span className="block text-[11px] font-semibold text-slate-600 mb-1">{label}</span>
          <input className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
            value={value} onChange={(event) => onChange({ [key]: isArray ? splitValues(event.target.value) : event.target.value } as Partial<CardFields>)}
            placeholder={'Enter ' + label.toLowerCase()} />
          {Number(fields.fieldConfidence[String(key)] || 0) > 0 && Number(fields.fieldConfidence[String(key)] || 0) < 0.7 && <span className="mt-1 block text-[10px] font-semibold text-amber-700">Low AI confidence · please verify</span>}
        </label>;
      })}
      <label className="block sm:col-span-2">
        <span className="block text-[11px] font-semibold text-slate-600 mb-1">Notes</span>
        <textarea rows={2} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
          value={fields.notes} onChange={(event) => onChange({ notes: event.target.value })} placeholder="Add any extra notes" />
      </label>
      {showRawText && <label className="block sm:col-span-2">
        <span className="block text-[11px] font-semibold text-slate-600 mb-1">Original OCR text</span>
        <textarea rows={4} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-600 outline-none"
          value={fields.rawText} onChange={(event) => onChange({ rawText: event.target.value })} />
      </label>}
    </div>
  );

  return (
    <div className="space-y-4" data-umrah360-module="business-card-reader">
      {error && <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><AlertCircle size={17} className="mt-0.5 shrink-0" /><span className="flex-1">{error}</span><button onClick={() => setError('')}><X size={15} /></button></div>}
      {notice && <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"><CheckCircle2 size={17} className="mt-0.5 shrink-0" /><span className="flex-1">{notice}</span><button onClick={() => setNotice('')}><X size={15} /></button></div>}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4"><div className="text-[11px] font-semibold text-slate-500">SAVED CONTACTS</div><div className="mt-1 text-2xl font-extrabold text-slate-800">{savedCount.toLocaleString()}</div><div className="text-xs text-slate-400 mt-1">In this workspace</div></div>
        <div className="rounded-xl border border-slate-200 bg-white p-4"><div className="text-[11px] font-semibold text-slate-500">COMPANIES</div><div className="mt-1 text-2xl font-extrabold text-slate-800">{companyCount.toLocaleString()}</div><div className="text-xs text-slate-400 mt-1">Unique company names</div></div>
        <div className="rounded-xl border border-slate-200 bg-white p-4"><div className="text-[11px] font-semibold text-slate-500">CURRENT BATCH</div><div className="mt-1 text-2xl font-extrabold text-slate-800">{scanCount.toLocaleString()}</div><div className="text-xs text-slate-400 mt-1">Cards scanned in this session</div></div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-4">
          <div><h2 className="font-bold text-slate-800">Business card contacts</h2><p className="text-xs text-slate-500 mt-1">Extract, review and organise contacts from physical business cards.</p></div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => void loadContacts()} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">{loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Refresh</button>
            <button type="button" onClick={() => downloadCsv(contacts)} disabled={!contacts.length} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"><Download size={14} /> Export CSV</button>
            <button type="button" onClick={openScanner} className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-3 py-2 text-xs font-bold text-white shadow-sm hover:bg-orange-700"><Plus size={15} /> Scan cards</button>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex min-w-[240px] max-w-md flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5"><Search size={15} className="text-slate-400" /><input className="w-full text-sm outline-none" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, company, email or phone" /></div>
          <span className="text-xs text-slate-400">{contacts.length} contacts shown · latest 300</span>
        </div>
        {loading && !contacts.length ? <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-400"><Loader2 size={18} className="animate-spin" /> Loading contacts…</div>
          : !contacts.length ? <div className="px-5 py-14 text-center"><div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-orange-50 text-orange-600"><FileImage size={23} /></div><h3 className="mt-3 text-sm font-bold text-slate-800">No business cards saved yet</h3><p className="mt-1 text-xs text-slate-500">Upload a card image or use your camera to extract contact details.</p><button onClick={openScanner} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2.5 text-xs font-bold text-white"><Upload size={14} /> Upload or scan a card</button></div>
          : <div className="overflow-x-auto"><table className="w-full min-w-[880px] text-left">
            <thead className="bg-slate-50 text-[10px] font-bold tracking-wider text-slate-500"><tr><th className="px-4 py-3">CONTACT</th><th className="px-4 py-3">COMPANY / ROLE</th><th className="px-4 py-3">CONTACT DETAILS</th><th className="px-4 py-3">ADDED</th><th className="px-4 py-3 text-right">ACTIONS</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{contacts.map((contact) => <tr key={contact.contactId} className="hover:bg-slate-50/70">
              <td className="px-4 py-3"><div className="font-semibold text-sm text-slate-800">{contact.fullName || 'Name not provided'}</div><div className="text-[11px] text-slate-400 mt-1">{contact.country || contact.city || 'Business card contact'}</div></td>
              <td className="px-4 py-3"><div className="text-sm font-medium text-slate-700">{contact.companyName || '—'}</div><div className="text-[11px] text-slate-400 mt-1">{contact.designation || '—'}</div></td>
              <td className="px-4 py-3"><div className="text-xs text-slate-700">{contact.emails?.[0] || '—'}</div><div className="text-[11px] text-slate-400 mt-1">{contact.phones?.[0] || 'No phone'}</div></td>
              <td className="px-4 py-3 text-xs text-slate-500">{displayDate(contact.createdAt)}</td>
              <td className="px-4 py-3"><div className="flex items-center justify-end gap-1">
                <button title="View original card" onClick={() => void openOriginal(contact)} className="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800"><Eye size={15} /></button>
                <button title="Edit contact" onClick={() => openEdit(contact)} className="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800"><Pencil size={15} /></button>
                <button title={contact.crmLeadId ? 'Already converted to CRM' : 'Convert to CRM lead'} onClick={() => void convertToLead(contact)} className="rounded-md p-2 text-slate-500 hover:bg-emerald-50 hover:text-emerald-700"><UserRoundPlus size={15} /></button>
                <button title="Delete contact" onClick={() => void removeContact(contact)} className="rounded-md p-2 text-slate-500 hover:bg-red-50 hover:text-red-600"><Trash2 size={15} /></button>
              </div></td>
            </tr>)}</tbody>
          </table></div>}
      </div>

      {scannerOpen && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-3 sm:p-6" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !scanning && !saving) setScannerOpen(false); }}>
        <section className="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" role="dialog" aria-modal="true" aria-label="Business Card Reader">
          <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <div><div className="text-[10px] font-extrabold tracking-[0.18em] text-orange-600">AI CONTACT CAPTURE</div><h2 className="mt-1 text-lg font-bold text-slate-900">Business Card Reader</h2><p className="text-xs text-slate-500">Upload images or PDFs, or capture a card using your camera.</p></div>
            <button onClick={() => !scanning && !saving && setScannerOpen(false)} disabled={scanning || saving} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-40"><X size={19} /></button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            {scans.length === 0 ? <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <button onClick={() => uploadRef.current?.click()} className="flex min-h-[150px] flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 p-5 text-center hover:border-orange-300 hover:bg-orange-50/40">
                  <span className="grid h-11 w-11 place-items-center rounded-xl bg-white text-orange-600 shadow-sm"><Upload size={21} /></span><strong className="mt-3 text-sm text-slate-800">Upload business cards</strong><span className="mt-1 text-xs text-slate-500">JPG, PNG, WEBP or PDF · up to 10 cards</span>
                </button>
                <button onClick={() => cameraRef.current?.click()} className="flex min-h-[150px] flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 p-5 text-center hover:border-orange-300 hover:bg-orange-50/40">
                  <span className="grid h-11 w-11 place-items-center rounded-xl bg-white text-orange-600 shadow-sm"><Smartphone size={21} /></span><strong className="mt-3 text-sm text-slate-800">Take a photo</strong><span className="mt-1 text-xs text-slate-500">Open your device camera</span>
                </button>
              </div>
              <input ref={uploadRef} type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={(event) => { addFiles(event.target.files); event.target.value = ''; }} />
              <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(event) => { addFiles(event.target.files); event.target.value = ''; }} />
              {selectedFiles.length > 0 && <div className="mt-5 rounded-xl border border-slate-200 p-4">
                <div className="flex items-center justify-between"><strong className="text-sm text-slate-800">Selected files ({selectedFiles.length}/{MAX_BATCH_FILES})</strong><button onClick={() => setSelectedFiles([])} className="text-xs font-semibold text-slate-500 hover:text-red-600">Clear all</button></div>
                <div className="mt-3 space-y-2">{selectedFiles.map((file, index) => <div key={index} className="flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-2"><FileText size={17} className="shrink-0 text-slate-500" /><span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-700">{file.name}</span><span className="text-[10px] text-slate-400">{Math.ceil(file.size / 1024)} KB</span><button onClick={() => removeFile(index)} className="rounded p-1 text-slate-400 hover:text-red-600"><X size={14} /></button></div>)}</div>
                <button onClick={() => void startScanning()} disabled={scanning} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">{scanning ? <Loader2 size={15} className="animate-spin" /> : <FileImage size={15} />} {scanning ? 'Reading cards…' : 'Scan ' + selectedFiles.length + ' card' + (selectedFiles.length === 1 ? '' : 's')}</button>
              </div>}
              {scanning && <div className="mt-4 flex items-center gap-3 rounded-lg bg-blue-50 p-3 text-xs text-blue-700"><Loader2 size={16} className="animate-spin" />{scanProgress}</div>}
              <div className="mt-4 flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-500"><ShieldCheck size={15} className="mt-0.5 shrink-0 text-emerald-600" /> Each original card file is retained in your workspace. AI extracts the information for review; nothing is added to contacts until you approve and save it.</div>
            </> : <div className="grid grid-cols-1 gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
              <div className="space-y-2">
                <div className="flex items-center justify-between"><strong className="text-xs font-bold text-slate-700">Scan batch</strong><button onClick={() => { setScans([]); setActiveScanId(''); setDuplicateMatches([]); setSelectedFiles([]); }} className="text-[11px] font-semibold text-orange-600">New batch</button></div>
                {scans.map((scan) => <button key={scan.scanId} onClick={() => { setActiveScanId(scan.scanId); setDuplicateMatches([]); }} className={'w-full rounded-xl border p-3 text-left ' + (activeScanId === scan.scanId ? 'border-orange-300 bg-orange-50' : 'border-slate-200 bg-white hover:bg-slate-50')}>
                  <div className="flex items-center gap-2"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500">{scan.mimeType === 'application/pdf' ? <FileText size={15} /> : <FileImage size={15} />}</span><span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-slate-700">{scan.fileName}</span></div>
                  <div className="mt-2 text-[10px]">{scan.status === 'SAVED' ? <span className="text-emerald-700">Saved</span> : scan.status === 'ERROR' ? <span className="text-red-600">Read failed</span> : <span className="text-blue-700">Ready for review</span>}</div>
                </button>)}
                {scanning && <div className="rounded-lg bg-blue-50 p-3 text-[11px] text-blue-700"><Loader2 size={14} className="mr-1 inline animate-spin" />{scanProgress}</div>}
                <button onClick={() => { setScans([]); setActiveScanId(''); setSelectedFiles([]); setScannerOpen(false); }} disabled={scanning || saving} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">Close reader</button>
              </div>
              <div className="min-w-0">
                {!activeScan ? <div className="rounded-xl border border-dashed border-slate-200 p-10 text-center text-sm text-slate-400">Choose a card from the batch to review its extracted details.</div>
                  : activeScan.status === 'ERROR' ? <div className="rounded-xl border border-red-200 bg-red-50 p-5"><AlertCircle className="text-red-600" /><h3 className="mt-2 text-sm font-bold text-red-800">Could not read this card</h3><p className="mt-1 text-xs text-red-700">{activeScan.error}</p></div>
                  : activeScan.status === 'SAVED' ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-center"><CheckCircle2 className="mx-auto text-emerald-600" size={30} /><h3 className="mt-2 font-bold text-emerald-800">Contact saved</h3><p className="mt-1 text-xs text-emerald-700">{activeScan.fields.fullName || activeScan.fields.companyName || activeScan.fileName}</p></div>
                  : <>
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-sm font-bold text-slate-800">Review extracted details</h3><p className="mt-1 text-[11px] text-slate-500">{activeScan.fileName}</p></div><span className="rounded-full bg-blue-50 px-3 py-1 text-[10px] font-bold text-blue-700">AI: {activeScan.provider} · {activeScan.model}</span></div>
                    <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-[180px_minmax(0,1fr)]">
                      <div className="flex max-h-48 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                        {activeScan.mimeType === 'application/pdf' ? <div className="p-4 text-center"><FileText className="mx-auto text-red-500" size={30} /><div className="mt-2 text-[10px] text-slate-500">PDF original retained</div></div> : <img src={activeScan.previewUrl} alt="Business card preview" className="max-h-48 w-full object-contain" />}
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="text-[10px] font-bold tracking-wide text-slate-500">EXTRACTION CONFIDENCE</div><div className="mt-1 flex items-center gap-2"><div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-emerald-500" style={{ width: Math.round((activeScan.fields.confidence || 0) * 100) + '%' }} /></div><strong className="text-sm text-slate-700">{Math.round((activeScan.fields.confidence || 0) * 100)}%</strong></div><p className="mt-2 text-[10px] leading-relaxed text-slate-500">Please check spelling and low-confidence fields before saving. Empty fields have not been guessed.</p></div>
                    </div>
                    {renderFields(activeScan.fields, (patch) => updateScanFields(activeScan.scanId, patch))}
                    {duplicateMatches.length > 0 && <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4"><div className="flex items-center gap-2 text-sm font-bold text-amber-900"><AlertCircle size={16} /> Possible duplicate contacts found</div><p className="mt-1 text-xs text-amber-800">Nothing has been overwritten. Review these matches, then choose whether to save this as a separate contact.</p><div className="mt-2 space-y-2">{duplicateMatches.map((item) => <div key={item.contactId} className="rounded-lg bg-white/70 p-2 text-xs text-amber-900"><strong>{item.fullName || item.companyName || 'Existing contact'}</strong><span className="ml-2 text-[10px]">{(item.matchReasons || []).join(' · ')}</span></div>)}</div></div>}
                    <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4">
                      <span className="text-[10px] text-slate-400">Save only after you have reviewed these details.</span>
                      <div className="flex flex-wrap gap-2">
                        {duplicateMatches.length > 0 && <button onClick={() => void saveScan(activeScan, true)} disabled={saving} className="rounded-lg border border-amber-300 bg-amber-100 px-3 py-2 text-xs font-bold text-amber-900 disabled:opacity-50">{saving ? 'Saving…' : 'Save as separate contact'}</button>}
                        <button onClick={() => void saveScan(activeScan, false)} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Save contact</button>
                      </div>
                    </div>
                  </>}
              </div>
            </div>}
          </div>
        </section>
      </div>}

      {editContact && <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/55 p-3" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) { setEditContact(null); setDuplicateMatches([]); } }}>
        <section className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl" role="dialog" aria-modal="true" aria-label="Edit business card contact">
          <div className="mb-4 flex items-center justify-between"><div><div className="text-[10px] font-extrabold tracking-widest text-orange-600">CONTACT DETAILS</div><h2 className="mt-1 text-lg font-bold text-slate-900">Edit business card contact</h2></div><button onClick={() => { setEditContact(null); setDuplicateMatches([]); }} disabled={saving} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={18} /></button></div>
          {renderFields(editFields, (patch) => { setEditFields((current) => ({ ...current, ...patch })); setDuplicateMatches([]); })}
          {duplicateMatches.length > 0 && <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900"><strong>Possible duplicates:</strong> {duplicateMatches.map((item) => item.fullName || item.companyName || 'Existing contact').join(', ')}<p className="mt-1">The existing contacts will not be overwritten.</p></div>}
          <div className="mt-5 flex justify-end gap-2"><button onClick={() => setEditContact(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600">Cancel</button>{duplicateMatches.length > 0 && <button onClick={() => void saveEdit(true)} disabled={saving} className="rounded-lg border border-amber-300 bg-amber-100 px-4 py-2 text-xs font-bold text-amber-900">Save separately</button>}<button onClick={() => void saveEdit(false)} disabled={saving} className="rounded-lg bg-orange-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save changes'}</button></div>
        </section>
      </div>}

      {viewScan && <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/60 p-3" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setViewScan(null); }}>
        <section className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" role="dialog" aria-modal="true" aria-label="Original business card">
          <header className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div><div className="text-[10px] font-bold tracking-widest text-orange-600">ORIGINAL UPLOAD</div><h2 className="mt-1 text-sm font-bold text-slate-900">{viewScan.fileName}</h2></div><button onClick={() => setViewScan(null)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={18} /></button></header>
          <div className="min-h-[300px] flex-1 bg-slate-100 p-3">{viewScan.mimeType === 'application/pdf' ? <iframe title="Original business card PDF" src={viewScan.imageDataUrl} className="h-[70vh] w-full rounded-lg bg-white" /> : <img src={viewScan.imageDataUrl} alt="Original business card" className="mx-auto max-h-[70vh] max-w-full rounded-lg object-contain" />}</div>
          <div className="border-t border-slate-100 p-4"><div className="text-[10px] font-bold text-slate-500">OCR TEXT</div><pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap text-xs text-slate-600">{viewScan.ocrText || 'No OCR text was saved.'}</pre></div>
        </section>
      </div>}
    </div>
  );
};
export default BusinessCardReader;
