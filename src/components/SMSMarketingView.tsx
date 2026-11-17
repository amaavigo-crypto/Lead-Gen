import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity, AlertCircle, CheckCircle2, Clock3, Copy, FileText, Loader2,
  MessageSquareText, Plus, RefreshCw, Send, ShieldCheck, Smartphone,
  Users, X,
} from 'lucide-react';
import type { Contact } from '../types';
import { parsePhoneNumberFromString } from 'libphonenumber-js';

type SmsCapability = { status: 'SUPPORTED' | 'NOT_SUPPORTED' | 'NEEDS_SETUP' | 'UNKNOWN'; detail: string };
type SmsSettings = {
  connected?: boolean; provider?: 'TWILIO' | 'VONAGE'; sender?: string; senderNumber?: string; senderRegistrationVerified?: boolean;
  countryCode?: string; capabilities?: {
    outbound?: SmsCapability; inbound?: SmsCapability; deliveryTracking?: SmsCapability;
    startingPrice?: string; priceCurrency?: string;
  };
  webhookUrls?: { inbound?: string; delivery?: string };
};
type Props = { tenantId: string; contacts: Contact[]; leads?: any[] };

const DEFAULT_TEMPLATES = [
  { name: 'Welcome', message: 'Hi {{first_name}}, thanks for your interest. Our team will be in touch shortly.' },
  { name: 'Follow-up', message: 'Hi {{first_name}}, just checking whether you had a chance to review our details. Reply here if you have questions.' },
  { name: 'Appointment reminder', message: 'Hi {{first_name}}, this is a reminder about your upcoming appointment. Reply if you need to reschedule.' },
];

async function api(path: string, method = 'GET', payload?: unknown) {
  const response = await fetch(path, {
    method,
    headers: payload ? { 'Content-Type': 'application/json' } : undefined,
    body: payload ? JSON.stringify(payload) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || data.message || 'Request failed.');
  return data;
}
function StatusPill({ item }: { item?: SmsCapability }) {
  const status = item?.status || 'UNKNOWN';
  const styles: Record<string, string> = {
    SUPPORTED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    NOT_SUPPORTED: 'bg-rose-50 text-rose-700 border-rose-200',
    NEEDS_SETUP: 'bg-amber-50 text-amber-700 border-amber-200',
    UNKNOWN: 'bg-slate-100 text-slate-600 border-slate-200',
  };
  const label: Record<string, string> = {
    SUPPORTED: 'Supported', NOT_SUPPORTED: 'Not supported', NEEDS_SETUP: 'Needs setup', UNKNOWN: 'Unknown',
  };
  return <span className={'inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ' + styles[status]}>{label[status]}</span>;
}
function SmsSegments({ value }: { value: string }) {
  const gsm = /^[\x00-\x7F]*$/.test(value);
  const length = value.length;
  const limit = gsm ? 160 : 70;
  const multi = gsm ? 153 : 67;
  const count = length <= limit ? 1 : Math.ceil(length / multi);
  return <span className="text-xs text-slate-500">{length} characters · {count} SMS segment{count === 1 ? '' : 's'} estimated</span>;
}

export const SMSMarketingView: React.FC<Props> = ({ tenantId, contacts = [] }) => {
  const [section, setSection] = useState<'overview' | 'campaigns' | 'templates' | 'consent'>('overview');
  const [settings, setSettings] = useState<SmsSettings>({});
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [analytics, setAnalytics] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [provider, setProvider] = useState<'TWILIO' | 'VONAGE'>('TWILIO');
  const [accountSid, setAccountSid] = useState('');
  const [authToken, setAuthToken] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [sender, setSender] = useState('');
  const [senderNumber, setSenderNumber] = useState('');
  const [senderRegistrationVerified, setSenderRegistrationVerified] = useState(false);
  const [countryCode, setCountryCode] = useState('IN');
  const [capabilityResult, setCapabilityResult] = useState<any>(null);
  const [campaignName, setCampaignName] = useState('');
  const [campaignText, setCampaignText] = useState('');
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [scheduledAt, setScheduledAt] = useState('');
  const [consentPhone, setConsentPhone] = useState('');
  const [consentSource, setConsentSource] = useState('Website form');
  const [consentEvidence, setConsentEvidence] = useState('');
  const [consentStatus, setConsentStatus] = useState<'OPTED_IN' | 'OPTED_OUT'>('OPTED_IN');
  const [templates, setTemplates] = useState(DEFAULT_TEMPLATES);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [newTemplateText, setNewTemplateText] = useState('');

  const audience = useMemo(() => {
    const byPhone = new Map<string, any>();
    contacts.forEach((contact) => {
      const rawPhone = String(contact.phone || '').trim();
      if (!rawPhone) return;
      const contactCountry = /^[A-Z]{2}$/i.test(String(contact.country || '')) ? String(contact.country).toUpperCase() : countryCode;
      const parsedPhone = parsePhoneNumberFromString(rawPhone, contactCountry as any);
      if (!parsedPhone?.isValid()) return;
      const phone = parsedPhone.number;
      const id = contact.contactId || phone;
      byPhone.set(id, {
        contactId: id, phone, firstName: contact.firstName || '',
        lastName: contact.lastName || '', name: [contact.firstName, contact.lastName].filter(Boolean).join(' '),
        companyName: contact.companyName || '',
      });
    });
    return Array.from(byPhone.values());
  }, [contacts, countryCode]);

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const [config, campaignData, analyticsData] = await Promise.all([
        api('/api/sms/settings'),
        api('/api/sms/campaigns'),
        api('/api/sms/analytics'),
      ]);
      setSettings(config || {});
      setCampaigns(campaignData.campaigns || []);
      setAnalytics(analyticsData || {});
      const templateData = await api('/api/sms/templates');
      if (Array.isArray(templateData.templates) && templateData.templates.length) setTemplates(templateData.templates);
      setCountryCode(config.countryCode || 'IN');
      setSender(config.sender || '');
      setSenderNumber(config.senderNumber || '');
      setSenderRegistrationVerified(Boolean(config.senderRegistrationVerified));
      setCapabilityResult(config.capabilities || null);
    } catch (err: any) {
      setError(err?.message || 'Could not load SMS settings.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void loadData(); }, [tenantId]);

  const connect = async () => {
    setSaving(true); setError(''); setMessage('');
    try {
      const credentials = provider === 'TWILIO'
        ? { accountSid, authToken }
        : { apiKey, apiSecret };
      const result = await api('/api/sms/connect', 'POST', { provider, countryCode, sender, senderNumber, senderRegistrationVerified, credentials });
      setSettings({
        connected: true, provider, sender, senderNumber, senderRegistrationVerified, countryCode,
        capabilities: result.capabilities, webhookUrls: result.webhookUrls,
      });
      setCapabilityResult(result.capabilities);
      setMessage('Provider connected. Configure the inbound webhook in your provider dashboard using the URLs below.');
      setAccountSid(''); setAuthToken(''); setApiKey(''); setApiSecret('');
    } catch (err: any) {
      setError(err?.message || 'Could not connect SMS provider.');
    } finally { setSaving(false); }
  };

  const refreshCapabilities = async () => {
    setChecking(true); setError('');
    try {
      const result = await api('/api/sms/capabilities', 'POST', { countryCode, sender, senderNumber, senderRegistrationVerified });
      setCapabilityResult(result);
      setMessage('Country and sender capabilities refreshed.');
    } catch (err: any) { setError(err?.message || 'Capability check failed.'); }
    finally { setChecking(false); }
  };

  const disconnect = async () => {
    if (!window.confirm('Disconnect this SMS provider? Historical messages and campaigns will remain, but new sends will stop.')) return;
    setSaving(true); setError('');
    try {
      await api('/api/sms/disconnect', 'POST', {});
      setSettings({ connected: false }); setCapabilityResult(null); setMessage('SMS provider disconnected.');
    } catch (err: any) { setError(err?.message || 'Could not disconnect provider.'); }
    finally { setSaving(false); }
  };

  const recordConsent = async (phone: string, status: 'OPTED_IN' | 'OPTED_OUT', source = consentSource, evidence = consentEvidence) => {
    try {
      await api('/api/sms/consent', 'POST', { phone, status, source, evidence });
      setConsentPhone(phone);
      setMessage(status === 'OPTED_IN' ? 'SMS marketing consent saved.' : 'SMS opt-out saved.');
      setError('');
    } catch (err: any) { setError(err?.message || 'Could not save consent.'); }
  };

  const createCampaign = async () => {
    const selected = audience.filter((x) => selectedContacts.includes(x.contactId));
    const recipients = Array.from(new Map(selected.map((recipient) => [recipient.phone, recipient])).values());
    if (!recipients.length) { setError('Select at least one CRM contact with a phone number.'); return; }
    if (!window.confirm('Create and start this SMS campaign for ' + recipients.length + ' selected contacts? Only contacts with recorded SMS marketing consent will be sent.')) return;
    setSaving(true); setError(''); setMessage('');
    try {
      const result = await api('/api/sms/campaigns', 'POST', {
        name: campaignName, message: campaignText, recipients,
        scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
      });
      setMessage('Campaign created. ' + (result.campaign?.totalRecipients || 0) + ' recipients were eligible; ' + (result.rejectedCount || 0) + ' were skipped because they lacked consent or had invalid numbers.');
      setCampaignName(''); setCampaignText(''); setSelectedContacts([]); setScheduledAt('');
      await loadData();
    } catch (err: any) { setError(err?.message || 'Could not create SMS campaign.'); }
    finally { setSaving(false); }
  };

  const saveTemplate = async () => {
    if (!newTemplateName.trim() || !newTemplateText.trim()) return;
    setSaving(true); setError('');
    try {
      const saved = await api('/api/sms/templates', 'POST', { name: newTemplateName.trim(), message: newTemplateText.trim() });
      setTemplates((current) => [...current, saved]);
      setNewTemplateName(''); setNewTemplateText('');
      setMessage('SMS template saved to this workspace.');
    } catch (err: any) { setError(err?.message || 'Could not save template.'); }
    finally { setSaving(false); }
  };

  const copyValue = async (value?: string) => {
    if (!value) return;
    try { await navigator.clipboard.writeText(value); setMessage('Copied to clipboard.'); }
    catch { setError('Clipboard access is unavailable in this browser.'); }
  };

  const capabilityRows = [
    { label: 'Outbound SMS', value: capabilityResult?.outbound },
    { label: 'Incoming SMS replies', value: capabilityResult?.inbound },
    { label: 'Delivery tracking', value: capabilityResult?.deliveryTracking },
  ];

  if (loading) return <div className="flex min-h-[360px] items-center justify-center text-sm text-slate-500"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading SMS Marketing…</div>;

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-violet-700"><Smartphone size={17} /> Marketing channel</div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">SMS Marketing</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">Create SMS campaigns, manage consent and handle customer replies from Unified Inbox. Your workspace pays the SMS provider directly.</p>
        </div>
        <button onClick={() => void loadData()} className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><RefreshCw size={15} /> Refresh</button>
      </div>

      {(error || message) && <div className={'flex items-start gap-2 rounded-lg border px-4 py-3 text-sm ' + (error ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700')}>
        {error ? <AlertCircle size={17} className="mt-0.5 shrink-0" /> : <CheckCircle2 size={17} className="mt-0.5 shrink-0" />}
        <span>{error || message}</span>
      </div>}

      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        {[
          ['overview', 'Provider & capabilities'], ['campaigns', 'Campaigns'], ['templates', 'Templates'], ['consent', 'Consent & contacts'],
        ].map(([id, label]) => (
          <button key={id} onClick={() => setSection(id as any)} className={'rounded-lg px-3 py-2 text-sm font-semibold ' + (section === id ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100')}>
            {label}
          </button>
        ))}
      </div>

      {section === 'overview' && (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(340px,0.9fr)]">
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold text-slate-900">SMS provider connection</h2>
              {settings.connected ? <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">Connected</span> : <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">Not connected</span>}
            </div>
            {settings.connected ? (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-500">Provider</div><div className="mt-1 font-semibold text-slate-900">{settings.provider}</div></div>
                  <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-500">Sender</div><div className="mt-1 font-semibold text-slate-900">{settings.sender}</div></div>
                </div>
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-slate-800">Webhook configuration</h3>
                  <p className="text-xs leading-5 text-slate-500">Add the inbound URL to your provider's inbound-message webhook. The status URL receives delivery callbacks. Twilio status callbacks are attached to each outgoing message automatically.</p>
                  {[
                    ['Incoming messages', settings.webhookUrls?.inbound],
                    ['Delivery receipts', settings.webhookUrls?.delivery],
                  ].map(([label, value]) => (
                    <div key={label} className="flex items-center gap-2 rounded-lg border border-slate-200 p-3">
                      <div className="min-w-0 flex-1"><div className="text-xs font-semibold text-slate-600">{label}</div><div className="mt-1 truncate font-mono text-xs text-slate-700">{value}</div></div>
                      <button onClick={() => void copyValue(value)} className="rounded-md border border-slate-200 p-2 text-slate-600 hover:bg-slate-50" aria-label={'Copy ' + label + ' URL'}><Copy size={15} /></button>
                    </div>
                  ))}
                </div>
                <button disabled={saving} onClick={() => void disconnect()} className="rounded-lg border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50">Disconnect provider</button>
              </div>
            ) : (
              <div className="space-y-4">
                <label className="block text-sm font-medium text-slate-700">Provider
                  <select value={provider} onChange={(e) => setProvider(e.target.value as any)} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm">
                    <option value="TWILIO">Twilio</option><option value="VONAGE">Vonage</option>
                  </select>
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  {provider === 'TWILIO' ? <>
                    <label className="block text-sm font-medium text-slate-700">Account SID<input value={accountSid} onChange={(e) => setAccountSid(e.target.value)} autoComplete="off" className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="AC…" /></label>
                    <label className="block text-sm font-medium text-slate-700">Auth Token<input type="password" value={authToken} onChange={(e) => setAuthToken(e.target.value)} autoComplete="new-password" className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Twilio auth token" /></label>
                  </> : <>
                    <label className="block text-sm font-medium text-slate-700">API Key<input value={apiKey} onChange={(e) => setApiKey(e.target.value)} autoComplete="off" className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></label>
                    <label className="block text-sm font-medium text-slate-700">API Secret<input type="password" value={apiSecret} onChange={(e) => setApiSecret(e.target.value)} autoComplete="new-password" className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></label>
                  </>}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-sm font-medium text-slate-700">Destination country (ISO code)<input value={countryCode} onChange={(e) => setCountryCode(e.target.value.toUpperCase().slice(0, 2))} maxLength={2} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="IN, US, GB…" /></label>
                  <label className="block text-sm font-medium text-slate-700">Sender ID / phone number<input value={sender} onChange={(e) => setSender(e.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="+14155550123 or BrandName" /></label>
                </div>
                <label className="block text-sm font-medium text-slate-700">Inbound-capable phone number (optional, if different)<input value={senderNumber} onChange={(e) => setSenderNumber(e.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="E.164 number owned by your provider account" /></label>
                <label className="flex items-start gap-2 text-xs leading-5 text-slate-600">
                  <input type="checkbox" checked={senderRegistrationVerified} onChange={(e) => setSenderRegistrationVerified(e.target.checked)} className="mt-1" />
                  My alphanumeric sender ID is registered/approved for this destination country (leave unchecked for phone-number senders).
                </label>
                <p className="text-xs leading-5 text-slate-500">Credentials are encrypted and stored per workspace. Amaavigo does not store or collect SMS provider billing details.</p>
                <button disabled={saving || (provider === 'TWILIO' ? !accountSid || !authToken : !apiKey || !apiSecret) || !sender || countryCode.length !== 2} onClick={() => void connect()} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50">
                  {saving ? <Loader2 size={15} className="animate-spin" /> : <PlugIcon />} Connect provider
                </button>
              </div>
            )}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between"><h2 className="font-semibold text-slate-900">Country & sender capabilities</h2><ShieldCheck size={18} className="text-slate-400" /></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm font-medium text-slate-700">Country code<input value={countryCode} onChange={(e) => setCountryCode(e.target.value.toUpperCase().slice(0, 2))} maxLength={2} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></label>
              <label className="block text-sm font-medium text-slate-700">Sender number / ID<input value={sender} readOnly className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm" /></label>
            </div>
            <label className="mt-3 block text-sm font-medium text-slate-700">Two-way phone number<input value={senderNumber} readOnly className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm" /></label>
            <label className="mt-3 flex items-start gap-2 text-xs leading-5 text-slate-600">
              <input type="checkbox" checked={senderRegistrationVerified} onChange={(e) => setSenderRegistrationVerified(e.target.checked)} className="mt-1" />
              I confirm this alphanumeric sender ID is registered/approved with my provider for the selected destination country. This does not override provider or carrier rejection.
            </label>
            <button onClick={() => void refreshCapabilities()} disabled={!settings.connected || checking} className="mt-3 inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
              {checking ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} Check country & sender
            </button>
            <div className="mt-4 divide-y divide-slate-100">
              {capabilityRows.map((row) => (
                <div key={row.label} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between">
                  <div><div className="text-sm font-semibold text-slate-800">{row.label}</div><p className="mt-1 text-xs leading-5 text-slate-500">{row.value?.detail || 'Connect a provider to check availability for this country and sender.'}</p></div>
                  <StatusPill item={row.value} />
                </div>
              ))}
            </div>
            {capabilityResult?.startingPrice && <p className="mt-3 text-xs text-slate-500">Indicative provider starting rate: {capabilityResult.startingPrice} {capabilityResult.priceCurrency || ''} per SMS segment. Carrier surcharges may apply.</p>}
            <div className="mt-3 rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-800">
              Capabilities are provider- and sender-specific. “Supported” means the provider lists a route or capability; it does not guarantee carrier delivery. Local sender registration, consent and content rules still apply.
            </div>
          </section>
        </div>
      )}

      {section === 'campaigns' && (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2"><Send size={18} className="text-slate-500" /><h2 className="font-semibold text-slate-900">Create SMS campaign</h2></div>
            <label className="mb-3 block text-sm font-medium text-slate-700">Campaign name<input value={campaignName} onChange={(e) => setCampaignName(e.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="November product update" /></label>
            <label className="mb-2 block text-sm font-medium text-slate-700">Message<textarea rows={5} value={campaignText} onChange={(e) => setCampaignText(e.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Hi {{first_name}}, ..." /></label>
            <div className="mb-4 flex flex-wrap justify-between gap-2"><SmsSegments value={campaignText} /><span className="text-xs text-slate-500">Variables: {'{{first_name}}'}, {'{{name}}'}, {'{{company}}'}</span></div>
            <label className="mb-3 block text-sm font-medium text-slate-700">Schedule (optional)<input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></label>
            <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
              Immediate campaigns start sending on creation (up to 50 recipients initially). On Vercel Hobby, the built-in cron runs only once per day, so scheduled sends and later batches need an external scheduler. Configure it to call /api/campaigns/process-active every 5 minutes with Authorization: Bearer CRON_SECRET.
            </p>
            <div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-semibold text-slate-800">CRM contacts with phone numbers</h3><span className="text-xs text-slate-500">{selectedContacts.length} selected</span></div>
            <div className="max-h-72 overflow-y-auto rounded-lg border border-slate-200">
              {audience.length ? audience.map((contact) => (
                <label key={contact.contactId} className="flex cursor-pointer items-center gap-3 border-b border-slate-100 px-3 py-2.5 last:border-0 hover:bg-slate-50">
                  <input type="checkbox" checked={selectedContacts.includes(contact.contactId)} onChange={(e) => setSelectedContacts((current) => e.target.checked ? [...current, contact.contactId] : current.filter((id) => id !== contact.contactId))} />
                  <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium text-slate-800">{contact.name || contact.phone}</div><div className="truncate text-xs text-slate-500">{contact.phone} {contact.companyName ? '· ' + contact.companyName : ''}</div></div>
                </label>
              )) : <div className="p-4 text-sm text-slate-500">No CRM contacts have phone numbers yet.</div>}
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-500">Only numbers with a recorded SMS marketing opt-in are sent. Others are skipped and listed in the campaign response.</p>
            <button disabled={!settings.connected || saving || !campaignName.trim() || !campaignText.trim() || !selectedContacts.length} onClick={() => void createCampaign()} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Create campaign
            </button>
          </section>
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="font-semibold text-slate-900">Campaign performance</h2>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {[
                ['Campaigns', analytics.campaigns || 0], ['Recipients', analytics.recipients || 0],
                ['Sent', analytics.sent || 0], ['Delivered', analytics.delivered || 0],
                ['Failed', analytics.failed || 0], ['Replies', analytics.replies || 0],
              ].map(([label, value]) => <div key={label} className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-500">{label}</div><div className="mt-1 text-xl font-bold tabular-nums text-slate-900">{value}</div></div>)}
            </div>
            <h3 className="mb-2 mt-5 text-sm font-semibold text-slate-800">Recent campaigns</h3>
            <div className="space-y-2">
              {campaigns.slice(0, 8).map((campaign) => <div key={campaign.campaignId} className="rounded-lg border border-slate-200 p-3">
                <div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="truncate text-sm font-semibold text-slate-800">{campaign.name}</div><div className="mt-1 text-xs text-slate-500">{campaign.createdAt ? new Date(campaign.createdAt).toLocaleString() : ''}</div></div><span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600">{campaign.status}</span></div>
                <div className="mt-2 text-xs text-slate-500">{campaign.sentCount || 0} sent · {campaign.deliveredCount || 0} delivered · {campaign.failedCount || 0} failed</div>
              </div>)}
              {!campaigns.length && <p className="text-sm text-slate-500">Your SMS campaigns will appear here.</p>}
            </div>
          </section>
        </div>
      )}

      {section === 'templates' && (
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2"><FileText size={18} className="text-slate-500" /><h2 className="font-semibold text-slate-900">SMS templates</h2></div>
          <div className="grid gap-3 md:grid-cols-2">
            {templates.map((template, index) => <div key={template.name + index} className="rounded-lg border border-slate-200 p-4">
              <div className="text-sm font-semibold text-slate-800">{template.name}</div><p className="mt-2 whitespace-pre-wrap text-sm leading-5 text-slate-600">{template.message}</p>
              <button onClick={() => { setCampaignText(template.message); setSection('campaigns'); }} className="mt-3 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Use in campaign</button>
            </div>)}
          </div>
          <div className="mt-5 grid gap-3 border-t border-slate-100 pt-5">
            <h3 className="text-sm font-semibold text-slate-800">Create template</h3>
            <input value={newTemplateName} onChange={(e) => setNewTemplateName(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Template name" />
            <textarea value={newTemplateText} onChange={(e) => setNewTemplateText(e.target.value)} rows={3} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Write a reusable SMS template…" />
            <button onClick={() => void saveTemplate()} className="inline-flex w-fit items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Plus size={15} /> Add template</button>
          </div>
        </section>
      )}

      {section === 'consent' && (
        <section className="grid gap-5 xl:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2"><ShieldCheck size={18} className="text-slate-500" /><h2 className="font-semibold text-slate-900">Manage SMS consent</h2></div>
            <label className="mb-3 block text-sm font-medium text-slate-700">Phone number (E.164)<input value={consentPhone} onChange={(e) => setConsentPhone(e.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="+14155552671" /></label>
            <label className="mb-3 block text-sm font-medium text-slate-700">Consent action<select value={consentStatus} onChange={(e) => setConsentStatus(e.target.value as any)} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"><option value="OPTED_IN">Record marketing opt-in</option><option value="OPTED_OUT">Opt out / suppress number</option></select></label>
            <label className="mb-3 block text-sm font-medium text-slate-700">Consent source<input value={consentSource} onChange={(e) => setConsentSource(e.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Website form, signed form, keyword…" /></label>
            <label className="mb-3 block text-sm font-medium text-slate-700">Evidence / reference<textarea value={consentEvidence} onChange={(e) => setConsentEvidence(e.target.value)} rows={3} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Form submission ID, timestamp, consent text, etc." /></label>
            <button onClick={() => void recordConsent(consentPhone, consentStatus)} disabled={!consentPhone.trim() || (consentStatus === 'OPTED_IN' && (!consentSource.trim() || !consentEvidence.trim()))} className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Save consent preference</button>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="font-semibold text-slate-900">Compliance safeguards</h2>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-600">
              <li className="flex gap-2"><ShieldCheck size={17} className="mt-1 shrink-0 text-emerald-600" /> Promotional campaigns require a recorded marketing opt-in for each recipient.</li>
              <li className="flex gap-2"><ShieldCheck size={17} className="mt-1 shrink-0 text-emerald-600" /> STOP, STOPALL, UNSUBSCRIBE, CANCEL, END and QUIT replies are recorded as opt-outs.</li>
              <li className="flex gap-2"><ShieldCheck size={17} className="mt-1 shrink-0 text-emerald-600" /> A suppressed number is blocked from future outbound SMS.</li>
              <li className="flex gap-2"><ShieldCheck size={17} className="mt-1 shrink-0 text-emerald-600" /> Consent records are scoped to the workspace and are not shared across tenants.</li>
            </ul>
            <div className="mt-5 rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-800">Recording consent here does not replace country-specific sender registration, template approval, quiet hours, or legal review. Verify local requirements before sending in each destination market.</div>
          </div>
        </section>
      )}
    </div>
  );
};

function PlugIcon() { return <Activity size={15} />; }

