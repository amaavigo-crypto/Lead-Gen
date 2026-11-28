import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, CheckCircle2, Clock3, Database, Filter, Mail, Plus, RefreshCw, Search, Upload, UserCheck, Users, X } from 'lucide-react';
import type { Contact, Lead } from '../types';
import { ModuleShell, ModuleStatGrid } from './ModulePage';
import { LeadDatabase } from './LeadDatabase';

type Section = 'marketing' | 'leads' | 'consumers';
type Props = {
  isAdmin?: boolean;
  tenantId?: string;
  leads: Lead[];
  contacts: Contact[];
  onOpenLead: (leadId: string) => void;
  onRequestAddLead: () => void;
  onCreateLead: (lead: Lead, contact: Contact) => Promise<void>;
  canAccessSalesData: boolean;
};
type LeadImportRow = {
  firstName: string; lastName: string; email: string; phone: string;
  companyName: string; jobTitle: string; city: string; country: string; website: string;
};
type ConsumerProfile = {
  customerId: string; contactId?: string; name: string; email?: string; phone?: string;
  companyName?: string; country?: string; city?: string; productInterest?: string;
  serviceInterest?: string; customerStatus?: 'ACTIVE' | 'INACTIVE'; customerSince?: string;
  lastPurchaseAt?: string; source?: string; sourceLeadIds?: string[]; createdAt?: string; updatedAt?: string;
};

async function readSpreadsheet(file: File): Promise<Array<Record<string, unknown>>> {
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('The file does not contain a worksheet.');
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], { defval: '', raw: false });
}
function clean(value: unknown): string { return String(value ?? '').trim(); }
function normalizedHeader(value: unknown): string { return clean(value).toLowerCase().replace(/[^a-z0-9]/g, ''); }
function fieldValue(row: Record<string, unknown>, aliases: string[]): string {
  const wanted = new Set(aliases.map(normalizedHeader));
  const entry = Object.entries(row).find(([key, value]) => wanted.has(normalizedHeader(key)) && clean(value));
  return entry ? clean(entry[1]) : '';
}
function emailKey(value: unknown): string { return clean(value).toLowerCase(); }
function phoneKey(value: unknown): string { return clean(value).replace(/\D/g, ''); }
function newId(prefix: string): string {
  const token = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  return prefix + '_' + token;
}
function dateLabel(value?: string): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
function statusLabel(value: string): string {
  return String(value || 'NEW').replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}
async function apiRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || 'Request failed (' + response.status + ').');
  return payload as T;
}
const buttonPrimary = 'inline-flex items-center gap-2 rounded-lg bg-[#155eef] px-3.5 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#0f4fd2] disabled:cursor-not-allowed disabled:opacity-50';
const buttonSecondary = 'inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50';
const inputClass = 'h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100';

export const DatabaseModule: React.FC<Props> = ({
  isAdmin = false, tenantId = '', leads, contacts, onOpenLead, onRequestAddLead, onCreateLead, canAccessSalesData,
}) => {
  const [section, setSection] = useState<Section>('marketing');
  const [leadSearch, setLeadSearch] = useState('');
  const [leadScope, setLeadScope] = useState<'OPEN' | 'ALL'>('OPEN');
  const [leadImportRows, setLeadImportRows] = useState<LeadImportRow[]>([]);
  const [leadImportDuplicates, setLeadImportDuplicates] = useState(0);
  const [leadImportInvalid, setLeadImportInvalid] = useState(0);
  const [leadImportFile, setLeadImportFile] = useState('');
  const [leadImportOpen, setLeadImportOpen] = useState(false);
  const [leadImporting, setLeadImporting] = useState(false);
  const [leadImportNotice, setLeadImportNotice] = useState('');
  const [leadImportError, setLeadImportError] = useState('');
  const leadFileRef = useRef<HTMLInputElement>(null);

  const [consumers, setConsumers] = useState<ConsumerProfile[]>([]);
  const [consumerSearch, setConsumerSearch] = useState('');
  const [consumerLoading, setConsumerLoading] = useState(false);
  const [consumerError, setConsumerError] = useState('');
  const [consumerNotice, setConsumerNotice] = useState('');
  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [customerSaving, setCustomerSaving] = useState(false);
  const [customerForm, setCustomerForm] = useState({ name: '', email: '', phone: '', companyName: '', productInterest: '', country: '', city: '' });
  const [consumerImportRows, setConsumerImportRows] = useState<Array<Record<string, unknown>>>([]);
  const [consumerImportFile, setConsumerImportFile] = useState('');
  const [consumerImportOpen, setConsumerImportOpen] = useState(false);
  const [consumerImporting, setConsumerImporting] = useState(false);
  const consumerFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!canAccessSalesData && section !== 'marketing') setSection('marketing');
  }, [canAccessSalesData, section]);

  const contactById = useMemo(() => {
    const map = new Map<string, Contact>();
    contacts.forEach((contact) => map.set(contact.contactId, contact));
    return map;
  }, [contacts]);

  const leadRows = useMemo(() => {
    const term = leadSearch.trim().toLowerCase();
    return leads
      .map((lead) => ({ lead, contact: contactById.get(lead.contactId) }))
      .filter(({ lead }) => leadScope === 'ALL' || (lead.status !== 'CLOSED_WON' && lead.status !== 'CLOSED_LOST'))
      .filter(({ lead, contact }) => !term || [
        lead.leadId, lead.status, lead.source, lead.assignedToName, lead.assignedCaller,
        lead.productInterest, lead.serviceInterest, contact?.firstName, contact?.lastName,
        contact?.email, contact?.phone, contact?.companyName,
      ].some((value) => String(value || '').toLowerCase().includes(term)))
      .sort((a, b) => String(b.lead.updatedAt || '').localeCompare(String(a.lead.updatedAt || '')));
  }, [leads, contactById, leadSearch, leadScope]);

  const loadConsumers = useCallback(async () => {
    setConsumerLoading(true);
    setConsumerError('');
    try {
      const params = new URLSearchParams();
      if (consumerSearch.trim()) params.set('q', consumerSearch.trim());
      const data = await apiRequest<{ profiles: ConsumerProfile[] }>('/api/consumer-database?' + params.toString());
      setConsumers(data.profiles || []);
    } catch (error: any) {
      setConsumerError(error?.message || 'Could not load the Consumer Database.');
    } finally {
      setConsumerLoading(false);
    }
  }, [consumerSearch, tenantId]);

  useEffect(() => {
    if (section === 'consumers') void loadConsumers();
  }, [section, loadConsumers]);

  const prepareLeadImport = async (file?: File) => {
    if (!file) return;
    setLeadImportError('');
    setLeadImportNotice('');
    try {
      const rawRows = await readSpreadsheet(file);
      if (!rawRows.length) throw new Error('No contact rows were found in this file.');
      if (rawRows.length > 1000) throw new Error('Import is limited to 1,000 lead rows at a time.');
      const knownEmails = new Set(contacts.map((contact) => emailKey(contact.email)).filter(Boolean));
      const knownPhones = new Set(contacts.map((contact) => phoneKey(contact.phone)).filter((value) => value.length >= 7));
      const fileEmails = new Set<string>();
      const filePhones = new Set<string>();
      const ready: LeadImportRow[] = [];
      let duplicates = 0;
      let invalid = 0;
      rawRows.forEach((row) => {
        const firstName = fieldValue(row, ['first name', 'firstname', 'given name']);
        const lastName = fieldValue(row, ['last name', 'lastname', 'surname', 'family name']);
        const fullName = fieldValue(row, ['name', 'full name', 'contact name', 'lead name']);
        const split = fullName.split(/\s+/).filter(Boolean);
        const email = emailKey(fieldValue(row, ['email', 'email address', 'email id']));
        const phone = fieldValue(row, ['phone', 'mobile', 'mobile number', 'phone number', 'whatsapp']);
        const digits = phoneKey(phone);
        const finalFirst = firstName || split.shift() || (email ? email.split('@')[0] : 'New');
        const finalLast = lastName || split.join(' ');
        if ((!email && digits.length < 7) || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) { invalid++; return; }
        if ((email && (knownEmails.has(email) || fileEmails.has(email))) ||
            (digits.length >= 7 && (knownPhones.has(digits) || filePhones.has(digits)))) { duplicates++; return; }
        if (email) fileEmails.add(email);
        if (digits.length >= 7) filePhones.add(digits);
        ready.push({
          firstName: finalFirst, lastName: finalLast, email, phone,
          companyName: fieldValue(row, ['company', 'company name', 'organization', 'organisation', 'business']),
          jobTitle: fieldValue(row, ['job title', 'designation', 'role']),
          city: fieldValue(row, ['city']), country: fieldValue(row, ['country']),
          website: fieldValue(row, ['website', 'domain', 'url']),
        });
      });
      setLeadImportRows(ready);
      setLeadImportDuplicates(duplicates);
      setLeadImportInvalid(invalid);
      setLeadImportFile(file.name);
      setLeadImportOpen(true);
    } catch (error: any) {
      setLeadImportError(error?.message || 'Could not read this lead file.');
    } finally {
      if (leadFileRef.current) leadFileRef.current.value = '';
    }
  };

  const confirmLeadImport = async () => {
    if (!leadImportRows.length || leadImporting) return;
    setLeadImporting(true);
    setLeadImportError('');
    let created = 0;
    try {
      for (let index = 0; index < leadImportRows.length; index += 10) {
        const batch = leadImportRows.slice(index, index + 10);
        await Promise.all(batch.map(async (row) => {
          const now = new Date().toISOString();
          const contactId = newId('contact');
          const leadId = newId('lead');
          const contact: Contact = {
            contactId,
            firstName: row.firstName,
            lastName: row.lastName,
            email: row.email,
            phone: row.phone || undefined,
            companyName: row.companyName || '',
            jobTitle: row.jobTitle || undefined,
            city: row.city || undefined,
            country: row.country || undefined,
            website: row.website || undefined,
            createdAt: now,
            updatedAt: now,
            lastActivityAt: now,
          };
          const lead: Lead = {
            leadId, contactId, source: 'MANUAL', leadType: 'OUTBOUND', status: 'NEW',
            leadScore: 0, intent: 'LOW', buyingStage: 'AWARENESS', requirements: [],
            createdAt: now, updatedAt: now, lastActivityAt: now,
          };
          await onCreateLead(lead, contact);
          created++;
        }));
      }
      setLeadImportNotice('Imported ' + created.toLocaleString() + ' leads. Duplicates skipped: ' + leadImportDuplicates + '; invalid rows skipped: ' + leadImportInvalid + '.');
      setLeadImportOpen(false);
      setLeadImportRows([]);
    } catch (error: any) {
      setLeadImportError(error?.message || 'The lead import could not be completed.');
      setLeadImportNotice('Imported ' + created.toLocaleString() + ' leads before the error. Retry only the remaining records after checking CRM.');
    } finally {
      setLeadImporting(false);
    }
  };

  const prepareConsumerImport = async (file?: File) => {
    if (!file) return;
    setConsumerError('');
    try {
      const rawRows = await readSpreadsheet(file);
      if (!rawRows.length) throw new Error('No customer rows were found in this file.');
      if (rawRows.length > 2000) throw new Error('Import is limited to 2,000 customer rows at a time.');
      const rows = rawRows.map((row) => ({
        name: fieldValue(row, ['name', 'full name', 'customer name', 'contact name']) ||
          [fieldValue(row, ['first name', 'firstname']), fieldValue(row, ['last name', 'lastname'])].filter(Boolean).join(' '),
        email: fieldValue(row, ['email', 'email address', 'email id']),
        phone: fieldValue(row, ['phone', 'mobile', 'mobile number', 'phone number', 'whatsapp']),
        companyName: fieldValue(row, ['company', 'company name', 'organization', 'organisation', 'business']),
        country: fieldValue(row, ['country']),
        city: fieldValue(row, ['city']),
        website: fieldValue(row, ['website', 'domain', 'url']),
        productInterest: fieldValue(row, ['product', 'product interest', 'purchased product']),
        serviceInterest: fieldValue(row, ['service', 'service interest', 'purchased service']),
        customerSince: fieldValue(row, ['customer since', 'purchase date', 'customer date']),
        customerStatus: fieldValue(row, ['customer status', 'status']) || 'ACTIVE',
      })).filter((row) => row.name || row.email || row.phone);
      if (!rows.length) throw new Error('No rows with customer name, email or phone were found.');
      setConsumerImportRows(rows);
      setConsumerImportFile(file.name);
      setConsumerImportOpen(true);
    } catch (error: any) {
      setConsumerError(error?.message || 'Could not read this customer file.');
    } finally {
      if (consumerFileRef.current) consumerFileRef.current.value = '';
    }
  };

  const confirmConsumerImport = async () => {
    if (!consumerImportRows.length || consumerImporting) return;
    setConsumerImporting(true);
    setConsumerError('');
    setConsumerNotice('');
    try {
      const result = await apiRequest<{ added: number; updated: number; invalid: number }>('/api/consumer-database', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: consumerImportRows, sourceFileName: consumerImportFile }),
      });
      setConsumerNotice('Import complete: ' + result.added + ' new customers added, ' + result.updated + ' existing profiles updated, ' + result.invalid + ' invalid rows skipped.');
      setConsumerImportOpen(false);
      setConsumerImportRows([]);
      await loadConsumers();
    } catch (error: any) {
      setConsumerError(error?.message || 'Could not import customers.');
    } finally {
      setConsumerImporting(false);
    }
  };

  const saveCustomer = async (event: React.FormEvent) => {
    event.preventDefault();
    setCustomerSaving(true);
    setConsumerError('');
    setConsumerNotice('');
    try {
      await apiRequest('/api/consumer-database', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer: customerForm }),
      });
      setCustomerModalOpen(false);
      setCustomerForm({ name: '', email: '', phone: '', companyName: '', productInterest: '', country: '', city: '' });
      setConsumerNotice('Customer profile saved.');
      await loadConsumers();
    } catch (error: any) {
      setConsumerError(error?.message || 'Could not save this customer.');
    } finally {
      setCustomerSaving(false);
    }
  };

  const activeCustomers = consumers.filter((profile) => profile.customerStatus !== 'INACTIVE').length;
  const leadHotCount = leads.filter((lead) => lead.status !== 'CLOSED_WON' && lead.aiScoring?.category === 'HOT').length;
  const openLeadCount = leads.filter((lead) => lead.status !== 'CLOSED_WON' && lead.status !== 'CLOSED_LOST').length;
  const wonLeadCount = leads.filter((lead) => lead.status === 'CLOSED_WON').length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1 rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm" role="tablist" aria-label="Database types">
        {([
          { id: 'marketing', label: 'Marketing Database', icon: Database },
          { id: 'leads', label: 'Lead Database', icon: Users },
          { id: 'consumers', label: 'Consumer Database', icon: UserCheck },
        ] as const).filter((tab) => tab.id === 'marketing' || canAccessSalesData).map((tab) => {
          const Icon = tab.icon;
          const active = section === tab.id;
          return (
            <button key={tab.id} type="button" role="tab" aria-selected={active} onClick={() => setSection(tab.id)}
              className={'inline-flex items-center gap-2 rounded-lg px-3.5 py-2.5 text-xs font-semibold transition ' + (active ? 'bg-[#155eef] text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900')}>
              <Icon size={15} /> {tab.label}
            </button>
          );
        })}
        <span className="ml-auto hidden px-2 text-[11px] text-slate-400 md:inline">3 connected databases</span>
      </div>

      {section === 'marketing' && <LeadDatabase isAdmin={isAdmin} tenantId={tenantId} />}

      {section === 'leads' && canAccessSalesData && (
        <ModuleShell
          moduleId="database-leads"
          icon={Users}
          title="Lead Database"
          subtitle="Manage sales prospects connected to your CRM, with existing ownership, scoring and pipeline history."
          eyebrow="Workspace / Database"
          heading="Lead Database"
          copy="Your sales-ready prospects. These records stay connected to CRM, Unified Inbox and existing lead assignments."
          actions={<>
            <button type="button" className={buttonSecondary} onClick={() => leadFileRef.current?.click()}><Upload size={15} /> Import leads</button>
            <button type="button" className={buttonPrimary} onClick={onRequestAddLead}><Plus size={15} /> Add lead</button>
            <input ref={leadFileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(event) => void prepareLeadImport(event.target.files?.[0])} />
          </>}
        >
          <div className="space-y-5">
            {leadImportNotice && <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"><CheckCircle2 size={17} className="mt-0.5 shrink-0" />{leadImportNotice}<button className="ml-auto" onClick={() => setLeadImportNotice('')}><X size={15} /></button></div>}
            {leadImportError && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{leadImportError}</div>}
            <ModuleStatGrid stats={[
              { label: 'All CRM leads', value: leads.length.toLocaleString(), icon: Users, tile: 'bg-blue-50 text-blue-600', note: 'Linked to CRM contacts' },
              { label: 'Open leads', value: openLeadCount.toLocaleString(), icon: Clock3, tile: 'bg-sky-50 text-sky-600', note: 'Active sales pipeline' },
              { label: 'Hot leads', value: leadHotCount.toLocaleString(), icon: Mail, tile: 'bg-emerald-50 text-emerald-600', note: 'AI scoring category' },
              { label: 'Won', value: wonLeadCount.toLocaleString(), icon: UserCheck, tile: 'bg-violet-50 text-violet-600', note: 'Now available in Consumers' },
            ]} />
            <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:flex-row sm:items-center">
              <div className="relative min-w-0 flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><input className={inputClass + ' pl-9'} value={leadSearch} onChange={(event) => setLeadSearch(event.target.value)} placeholder="Search name, email, company, owner or status" /></div>
              <label className="flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-600"><Filter size={14} /><select className="bg-transparent outline-none" value={leadScope} onChange={(event) => setLeadScope(event.target.value as 'OPEN' | 'ALL')}><option value="OPEN">Open leads</option><option value="ALL">All CRM leads</option></select></label>
              <span className="px-1 text-xs text-slate-400">{leadRows.length.toLocaleString()} records</span>
            </div>
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[950px] text-left text-xs">
                  <thead className="bg-slate-50 text-[10px] font-semibold uppercase tracking-wider text-slate-500"><tr><th className="px-4 py-3">Lead</th><th className="px-4 py-3">Company</th><th className="px-4 py-3">Score</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Assigned to</th><th className="px-4 py-3">Source</th><th className="px-4 py-3">Updated</th><th className="px-4 py-3 text-right">CRM</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {leadRows.map(({ lead, contact }) => {
                      const fullName = [contact?.firstName, contact?.lastName].filter(Boolean).join(' ') || contact?.email || 'Unnamed contact';
                      const category = lead.aiScoring?.category || (lead.leadScore >= 75 ? 'HOT' : lead.leadScore >= 40 ? 'WARM' : 'COLD');
                      return <tr key={lead.leadId} className="hover:bg-slate-50/70">
                        <td className="px-4 py-3"><div className="font-semibold text-slate-900">{fullName}</div><div className="mt-1 text-slate-500">{contact?.email || 'No email'}{contact?.phone ? ' · ' + contact.phone : ''}</div></td>
                        <td className="px-4 py-3 text-slate-600">{contact?.companyName || '—'}</td>
                        <td className="px-4 py-3"><span className={'rounded-md px-2 py-1 text-[10px] font-semibold ' + (category === 'HOT' ? 'bg-rose-50 text-rose-700' : category === 'WARM' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600')}>{category} · {lead.leadScore}</span></td>
                        <td className="px-4 py-3"><span className="rounded-md bg-blue-50 px-2 py-1 text-[10px] font-semibold text-blue-700">{statusLabel(lead.status)}</span></td>
                        <td className="px-4 py-3 text-slate-600">{lead.assignedToName || lead.assignedCaller || 'Unassigned'}</td>
                        <td className="px-4 py-3 text-slate-600">{statusLabel(lead.source)}</td>
                        <td className="px-4 py-3 text-slate-500">{dateLabel(lead.updatedAt)}</td>
                        <td className="px-4 py-3 text-right"><button type="button" onClick={() => onOpenLead(lead.leadId)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-2 font-semibold text-slate-700 hover:border-blue-200 hover:text-blue-700">Open CRM <ArrowUpRight size={13} /></button></td>
                      </tr>;
                    })}
                    {!leadRows.length && <tr><td colSpan={8} className="px-4 py-12 text-center text-sm text-slate-400">No leads match this view. Add a lead or import an existing sales list.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
            <p className="text-[11px] text-slate-400">CRM remains the source of truth for lead status, assignment, scoring and activity. Won leads are shown in the Consumer Database and remain available in CRM history.</p>
          </div>
        </ModuleShell>
      )}

      {section === 'consumers' && canAccessSalesData && (
        <ModuleShell
          moduleId="database-consumers"
          icon={UserCheck}
          title="Consumer Database"
          subtitle="A customer directory for won deals, existing customers and repeat-purchase relationships."
          eyebrow="Workspace / Database"
          heading="Consumer Database"
          copy="Every customer profile is linked to its original contact and Won CRM record where available."
          actions={<>
            <button type="button" className={buttonSecondary} onClick={() => void loadConsumers()} disabled={consumerLoading}>{consumerLoading ? <RefreshCw size={14} className="animate-spin" /> : <RefreshCw size={14} />} Refresh</button>
            <button type="button" className={buttonSecondary} onClick={() => consumerFileRef.current?.click()}><Upload size={15} /> Import customers</button>
            <button type="button" className={buttonPrimary} onClick={() => setCustomerModalOpen(true)}><Plus size={15} /> Add customer</button>
            <input ref={consumerFileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(event) => void prepareConsumerImport(event.target.files?.[0])} />
          </>}
        >
          <div className="space-y-5">
            {consumerError && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{consumerError}</div>}
            {consumerNotice && <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"><CheckCircle2 size={17} className="mt-0.5 shrink-0" />{consumerNotice}<button className="ml-auto" onClick={() => setConsumerNotice('')}><X size={15} /></button></div>}
            <ModuleStatGrid stats={[
              { label: 'Total customers', value: consumers.length.toLocaleString(), icon: UserCheck, tile: 'bg-emerald-50 text-emerald-600', note: 'Unique customer profiles' },
              { label: 'Active customers', value: activeCustomers.toLocaleString(), icon: Users, tile: 'bg-blue-50 text-blue-600', note: 'Available for account activity' },
              { label: 'CRM conversions', value: consumers.filter((profile) => (profile.sourceLeadIds || []).length > 0).length.toLocaleString(), icon: CheckCircle2, tile: 'bg-violet-50 text-violet-600', note: 'Linked to Won leads' },
              { label: 'Recently updated', value: consumers.filter((profile) => profile.updatedAt && Date.now() - new Date(profile.updatedAt).getTime() < 7 * 86400000).length.toLocaleString(), icon: Clock3, tile: 'bg-sky-50 text-sky-600', note: 'Updated in the last 7 days' },
            ]} />
            <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:flex-row sm:items-center">
              <div className="relative min-w-0 flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><input className={inputClass + ' pl-9'} value={consumerSearch} onChange={(event) => setConsumerSearch(event.target.value)} placeholder="Search customers by name, email, phone or company" onKeyDown={(event) => { if (event.key === 'Enter') void loadConsumers(); }} /></div>
              <button type="button" className={buttonSecondary} onClick={() => void loadConsumers()}><Search size={14} /> Search</button>
              <span className="px-1 text-xs text-slate-400">{consumers.length.toLocaleString()} customers</span>
            </div>
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[850px] text-left text-xs">
                  <thead className="bg-slate-50 text-[10px] font-semibold uppercase tracking-wider text-slate-500"><tr><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Company</th><th className="px-4 py-3">Product / Service</th><th className="px-4 py-3">Customer since</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Record source</th><th className="px-4 py-3">Last updated</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {consumers.map((profile) => <tr key={profile.customerId} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3"><div className="font-semibold text-slate-900">{profile.name}</div><div className="mt-1 text-slate-500">{profile.email || 'No email'}{profile.phone ? ' · ' + profile.phone : ''}</div></td>
                      <td className="px-4 py-3 text-slate-600">{profile.companyName || '—'}</td>
                      <td className="px-4 py-3 text-slate-600">{profile.productInterest || profile.serviceInterest || '—'}</td>
                      <td className="px-4 py-3 text-slate-500">{dateLabel(profile.customerSince)}</td>
                      <td className="px-4 py-3"><span className={'rounded-md px-2 py-1 text-[10px] font-semibold ' + (profile.customerStatus === 'INACTIVE' ? 'bg-slate-100 text-slate-600' : 'bg-emerald-50 text-emerald-700')}>{profile.customerStatus || 'ACTIVE'}</span></td>
                      <td className="px-4 py-3 text-slate-600">{profile.source === 'CRM_WON' ? 'CRM · Won' : 'Manual / Import'}</td>
                      <td className="px-4 py-3 text-slate-500">{dateLabel(profile.updatedAt)}</td>
                    </tr>)}
                    {!consumers.length && <tr><td colSpan={7} className="px-4 py-12 text-center text-sm text-slate-400">{consumerLoading ? 'Loading customer profiles…' : 'No customers yet. Import existing customers or mark a CRM opportunity Won to create the first profile.'}</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
            <p className="text-[11px] text-slate-400">Repeat Won opportunities update the existing customer profile and purchase history instead of creating duplicate customer records.</p>
          </div>
        </ModuleShell>
      )}

      {leadImportOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/45 p-4" role="dialog" aria-modal="true" aria-label="Review lead import">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3"><div><div className="text-[10px] font-bold uppercase tracking-wider text-blue-600">Lead import preview</div><h3 className="mt-1 text-lg font-bold text-slate-950">Review {leadImportFile}</h3><p className="mt-1 text-xs text-slate-500">Contacts will be created as CRM leads and added to the Lead Database.</p></div><button type="button" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100" onClick={() => setLeadImportOpen(false)} disabled={leadImporting}><X size={18} /></button></div>
            <div className="my-4 grid grid-cols-3 gap-2"><div className="rounded-xl bg-emerald-50 p-3"><div className="text-xl font-bold text-emerald-800">{leadImportRows.length}</div><div className="text-[10px] text-emerald-700">Ready to import</div></div><div className="rounded-xl bg-amber-50 p-3"><div className="text-xl font-bold text-amber-800">{leadImportDuplicates}</div><div className="text-[10px] text-amber-700">Duplicates skipped</div></div><div className="rounded-xl bg-rose-50 p-3"><div className="text-xl font-bold text-rose-800">{leadImportInvalid}</div><div className="text-[10px] text-rose-700">Invalid rows</div></div></div>
            <div className="max-h-56 overflow-auto rounded-xl border border-slate-200"><table className="w-full text-left text-xs"><thead className="sticky top-0 bg-slate-50 text-slate-500"><tr><th className="px-3 py-2">Name</th><th className="px-3 py-2">Email</th><th className="px-3 py-2">Phone</th><th className="px-3 py-2">Company</th></tr></thead><tbody className="divide-y divide-slate-100">{leadImportRows.slice(0, 20).map((row, index) => <tr key={index}><td className="px-3 py-2 text-slate-800">{row.firstName + ' ' + row.lastName}</td><td className="px-3 py-2 text-slate-600">{row.email}</td><td className="px-3 py-2 text-slate-600">{row.phone || '—'}</td><td className="px-3 py-2 text-slate-600">{row.companyName || '—'}</td></tr>)}</tbody></table></div>
            {leadImportError && <p className="mt-3 text-xs text-rose-600">{leadImportError}</p>}
            <div className="mt-5 flex justify-end gap-2"><button type="button" className={buttonSecondary} onClick={() => setLeadImportOpen(false)} disabled={leadImporting}>Cancel</button><button type="button" className={buttonPrimary} onClick={() => void confirmLeadImport()} disabled={leadImporting || !leadImportRows.length}>{leadImporting ? 'Importing…' : 'Import ' + leadImportRows.length + ' leads'}</button></div>
          </div>
        </div>
      )}

      {consumerImportOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/45 p-4" role="dialog" aria-modal="true" aria-label="Review customer import">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3"><div><div className="text-[10px] font-bold uppercase tracking-wider text-blue-600">Customer import preview</div><h3 className="mt-1 text-lg font-bold text-slate-950">Import {consumerImportFile}</h3><p className="mt-1 text-xs text-slate-500">{consumerImportRows.length} rows are ready. Existing customers will be matched and updated.</p></div><button type="button" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100" onClick={() => setConsumerImportOpen(false)} disabled={consumerImporting}><X size={18} /></button></div>
            <div className="my-4 max-h-48 overflow-auto rounded-xl border border-slate-200"><table className="w-full text-left text-xs"><thead className="bg-slate-50 text-slate-500"><tr><th className="px-3 py-2">Customer</th><th className="px-3 py-2">Email</th><th className="px-3 py-2">Phone</th></tr></thead><tbody className="divide-y divide-slate-100">{consumerImportRows.slice(0, 15).map((row, index) => <tr key={index}><td className="px-3 py-2">{String(row.name || '—')}</td><td className="px-3 py-2">{String(row.email || '—')}</td><td className="px-3 py-2">{String(row.phone || '—')}</td></tr>)}</tbody></table></div>
            <div className="mt-5 flex justify-end gap-2"><button type="button" className={buttonSecondary} onClick={() => setConsumerImportOpen(false)} disabled={consumerImporting}>Cancel</button><button type="button" className={buttonPrimary} onClick={() => void confirmConsumerImport()} disabled={consumerImporting}>{consumerImporting ? 'Importing…' : 'Import customers'}</button></div>
          </div>
        </div>
      )}

      {customerModalOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/45 p-4" role="dialog" aria-modal="true" aria-label="Add customer">
          <form className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl" onSubmit={(event) => void saveCustomer(event)}>
            <div className="flex items-start justify-between gap-3"><div><div className="text-[10px] font-bold uppercase tracking-wider text-blue-600">New customer</div><h3 className="mt-1 text-lg font-bold text-slate-950">Add customer profile</h3><p className="mt-1 text-xs text-slate-500">A matching contact will update the existing customer rather than create a duplicate.</p></div><button type="button" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100" onClick={() => setCustomerModalOpen(false)}><X size={18} /></button></div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-medium text-slate-600 sm:col-span-2">Customer name<input className={inputClass + ' mt-1'} required value={customerForm.name} onChange={(event) => setCustomerForm((form) => ({ ...form, name: event.target.value }))} /></label>
              <label className="text-xs font-medium text-slate-600">Email<input className={inputClass + ' mt-1'} type="email" value={customerForm.email} onChange={(event) => setCustomerForm((form) => ({ ...form, email: event.target.value }))} /></label>
              <label className="text-xs font-medium text-slate-600">Phone<input className={inputClass + ' mt-1'} value={customerForm.phone} onChange={(event) => setCustomerForm((form) => ({ ...form, phone: event.target.value }))} /></label>
              <label className="text-xs font-medium text-slate-600 sm:col-span-2">Company<input className={inputClass + ' mt-1'} value={customerForm.companyName} onChange={(event) => setCustomerForm((form) => ({ ...form, companyName: event.target.value }))} /></label>
              <label className="text-xs font-medium text-slate-600">Product<input className={inputClass + ' mt-1'} value={customerForm.productInterest} onChange={(event) => setCustomerForm((form) => ({ ...form, productInterest: event.target.value }))} /></label>
              <label className="text-xs font-medium text-slate-600">Country<input className={inputClass + ' mt-1'} value={customerForm.country} onChange={(event) => setCustomerForm((form) => ({ ...form, country: event.target.value }))} /></label>
            </div>
            <div className="mt-5 flex justify-end gap-2"><button type="button" className={buttonSecondary} onClick={() => setCustomerModalOpen(false)} disabled={customerSaving}>Cancel</button><button type="submit" className={buttonPrimary} disabled={customerSaving || (!customerForm.email.trim() && !customerForm.phone.trim())}>{customerSaving ? 'Saving…' : 'Save customer'}</button></div>
          </form>
        </div>
      )}
    </div>
  );
};
