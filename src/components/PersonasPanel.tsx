import React, { useEffect, useMemo, useState } from 'react';
import {
  Bot, CheckCircle2, Facebook, Instagram, Loader2, Mail, MessageCircle,
  MessagesSquare, Power, Save, Sparkles, ShieldCheck,
} from 'lucide-react';
import { ChannelResponseSettingsFields, DEFAULT_CHANNEL_RESPONSE_SETTINGS } from './ChannelResponseSettingsFields';
import type { ChannelResponseSettings } from './ChannelResponseSettingsFields';

type PersonaChannel = 'WHATSAPP' | 'EMAIL' | 'INSTAGRAM' | 'MESSENGER' | 'WEBSITE_CHAT';
interface PersonaDraft {
  botName: string;
  role: string;
  personality: string;
  tone: string;
  communicationStyle: string;
  language: string;
  behavior: string;
  salesApproach: string;
  formatting: string;
  restrictions: string;
  welcomeMessage: string;
  customInstructions: string;
}
interface PersonaRecord {
  enabled: boolean;
  active: PersonaDraft | null;
  draft: PersonaDraft | null;
  responseSettings: ChannelResponseSettings | null;
  updatedAt?: string;
}
const CHANNELS: Array<{ id: PersonaChannel; label: string; description: string; icon: React.ReactNode }> = [
  { id: 'WHATSAPP', label: 'WhatsApp', description: 'Customer conversations and sales enquiries', icon: <MessageCircle className="h-5 w-5 text-emerald-600" /> },
  { id: 'EMAIL', label: 'Email', description: 'Inbound email replies and follow-ups', icon: <Mail className="h-5 w-5 text-blue-600" /> },
  { id: 'INSTAGRAM', label: 'Instagram', description: 'Instagram direct messages', icon: <Instagram className="h-5 w-5 text-fuchsia-600" /> },
  { id: 'MESSENGER', label: 'Messenger', description: 'Facebook Messenger conversations', icon: <Facebook className="h-5 w-5 text-blue-700" /> },
  { id: 'WEBSITE_CHAT', label: 'Website Chatbot', description: 'Your website visitor-facing chatbot', icon: <MessagesSquare className="h-5 w-5 text-violet-600" /> },
];
const EMPTY_PERSONA: PersonaDraft = {
  botName: '', role: '', personality: '', tone: '', communicationStyle: '',
  language: '', behavior: '', salesApproach: '', formatting: '',
  restrictions: '', welcomeMessage: '', customInstructions: '',
};
const inputClass = 'mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-100 disabled:bg-slate-50';
const fieldClass = 'block text-xs font-semibold text-slate-700';

export const PersonasPanel: React.FC<{ tenantId: string; canEdit: boolean }> = ({ tenantId, canEdit }) => {
  const apiUrl = '/api/tenants/' + encodeURIComponent(tenantId) + '/personas';
  const [selectedChannel, setSelectedChannel] = useState<PersonaChannel>('WHATSAPP');
  const [records, setRecords] = useState<Partial<Record<PersonaChannel, PersonaRecord>>>({});
  const [form, setForm] = useState<PersonaDraft>(EMPTY_PERSONA);
  const [responseSettings, setResponseSettings] = useState<ChannelResponseSettings>(DEFAULT_CHANNEL_RESPONSE_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const selectedMeta = CHANNELS.find((channel) => channel.id === selectedChannel) || CHANNELS[0];
  const selectedRecord = records[selectedChannel] || { enabled: false, active: null, draft: null, responseSettings: null };
  const hasPersona = Boolean(form.botName.trim() || form.role.trim() || form.customInstructions.trim());

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setRecords({});
    setForm(EMPTY_PERSONA);
    fetch(apiUrl, { cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data?.error || 'Could not load channel personas.');
        if (active) setRecords(data.personas || {});
      })
      .catch((err: any) => { if (active) setError(err?.message || 'Could not load channel personas.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [apiUrl]);

  useEffect(() => {
    const record = records[selectedChannel];
    setForm({ ...EMPTY_PERSONA, ...(record?.draft || record?.active || {}) });
    setResponseSettings({ ...DEFAULT_CHANNEL_RESPONSE_SETTINGS, ...(record?.responseSettings || {}) });
    setNotice(null);
  }, [selectedChannel, records]);

  const save = async (action: 'SAVE_DRAFT' | 'ACTIVATE' | 'DISABLE') => {
    setBusy(action);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: selectedChannel, action, persona: form }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || 'Could not save this persona.');
      setRecords((current) => ({ ...current, [selectedChannel]: data.record }));
      setNotice(action === 'ACTIVATE' ? selectedMeta.label + ' persona activated.' : action === 'DISABLE' ? selectedMeta.label + ' persona disabled. Standard AI behaviour is now in use.' : 'Draft saved. It is not active until you activate it.');
    } catch (err: any) {
      setError(err?.message || 'Could not save this persona.');
    } finally {
      setBusy(null);
    }
  };

  const saveResponseSettings = async () => {
    setBusy('response-settings');
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: selectedChannel, action: 'SAVE_RESPONSE_SETTINGS', responseSettings }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || 'Could not save response behaviour.');
      setRecords((current) => ({ ...current, [selectedChannel]: data.record }));
      setNotice(selectedMeta.label + ' response behaviour saved. It will apply to new AI replies.');
    } catch (err: any) {
      setError(err?.message || 'Could not save response behaviour.');
    } finally {
      setBusy(null);
    }
  };

  const showResponseSettings = selectedChannel !== 'EMAIL';
  const statusLabel = useMemo(() => selectedRecord.enabled ? 'Active' : selectedRecord.draft ? 'Draft saved · not active' : 'Optional · not configured', [selectedRecord.enabled, selectedRecord.draft]);

  const textareaField = (label: string, key: keyof PersonaDraft, placeholder: string, rows = 3) => (
    <label className={fieldClass}>
      {label}
      <textarea
        className={inputClass + ' resize-y'}
        rows={rows}
        maxLength={key === 'customInstructions' ? 2000 : key === 'behavior' || key === 'salesApproach' || key === 'restrictions' ? 1200 : 900}
        disabled={!canEdit || busy !== null}
        value={form[key]}
        onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}
        placeholder={placeholder}
      />
    </label>
  );

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-100 text-orange-700"><Bot className="h-5 w-5" /></div>
          <div className="min-w-0">
            <h3 className="text-sm font-extrabold text-slate-950">Your AI personas, your channel identities</h3>
            <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-600">Create a different AI assistant for each channel. Personas are optional and belong only to this workspace. Save a draft without changing live replies, then activate it when ready.</p>
          </div>
        </div>
      </section>

      {!canEdit && <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">Only workspace administrators can edit or activate personas.</div>}
      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div>}
      {notice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{notice}</div>}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[250px_minmax(0,1fr)]">
        <aside className="space-y-2">
          {CHANNELS.map((channel) => {
            const record = records[channel.id];
            const active = selectedChannel === channel.id;
            const status = record?.enabled ? 'Active' : record?.draft ? 'Draft saved' : 'Optional';
            return (
              <button
                key={channel.id}
                type="button"
                onClick={() => setSelectedChannel(channel.id)}
                className={'flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ' + (active ? 'border-orange-300 bg-orange-50 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50')}
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-100 bg-white">{channel.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-slate-900">{channel.label}</span>
                  <span className="mt-0.5 block truncate text-[10px] text-slate-500">{status}</span>
                </span>
                {record?.enabled ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /> : <span className="h-2 w-2 shrink-0 rounded-full bg-slate-300" />}
              </button>
            );
          })}
        </aside>

        <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-50">{selectedMeta.icon}</div>
              <div className="min-w-0">
                <h3 className="text-base font-extrabold text-slate-950">{selectedMeta.label} persona</h3>
                <p className="mt-1 text-xs text-slate-500">{selectedMeta.description}</p>
                <p className="mt-1 text-[11px] font-semibold text-slate-600">{statusLabel}</p>
              </div>
            </div>
            {selectedRecord.enabled && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700"><CheckCircle2 className="h-3 w-3" /> Active for new replies</span>}
          </div>

          {loading ? (
            <div className="flex items-center gap-2 py-10 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading tenant personas…</div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <label className={fieldClass}>Bot name
                  <input className={inputClass} disabled={!canEdit || busy !== null} maxLength={100} value={form.botName} onChange={(event) => setForm((current) => ({ ...current, botName: event.target.value }))} placeholder={selectedMeta.label + ' assistant'} />
                </label>
                <label className={fieldClass}>Role / identity
                  <input className={inputClass} disabled={!canEdit || busy !== null} maxLength={240} value={form.role} onChange={(event) => setForm((current) => ({ ...current, role: event.target.value }))} placeholder="For example, senior sales consultant" />
                </label>
                {textareaField('Personality', 'personality', 'Describe how the assistant should come across: warm, confident, patient, consultative…')}
                {textareaField('Tone of voice', 'tone', 'For example: professional but friendly; concise and reassuring.')}
                {textareaField('Communication style', 'communicationStyle', 'Describe response length, vocabulary, formality and conversational rhythm.')}
                {textareaField('Language preferences', 'language', 'For example: reply in the customer’s language; prefer English and Hindi when suitable.', 2)}
                {textareaField('Conversation behaviour', 'behavior', 'How should the bot ask questions, handle uncertainty, objections and follow-ups?')}
                {textareaField('Sales and lead qualification approach', 'salesApproach', 'How should it qualify interest, recommend services and guide the next step?')}
                {textareaField('Formatting preferences', 'formatting', 'For example: short paragraphs, bold key details, restrained emojis, channel-appropriate formatting.')}
                {textareaField('Restrictions and things to avoid', 'restrictions', 'List claims, topics, tone or commitments this bot must avoid.', 2)}
                {textareaField('Welcome message guidance', 'welcomeMessage', 'How should the assistant introduce itself when a conversation starts?', 2)}
                <div className="md:col-span-2">{textareaField('Additional custom instructions', 'customInstructions', 'Add any other tenant-specific instructions for this channel.', 4)}</div>
              </div>

              {showResponseSettings && (
                <section className="mt-6 border-t border-slate-100 pt-5">
                  <div className="mb-3">
                    <h4 className="text-sm font-extrabold text-slate-900">Response behaviour</h4>
                    <p className="mt-1 text-[11px] leading-relaxed text-slate-500">Control how this channel writes and delivers new AI replies. These settings are saved separately from the persona.</p>
                  </div>
                  <ChannelResponseSettingsFields value={responseSettings} onChange={setResponseSettings} disabled={!canEdit || busy !== null} />
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[11px] text-slate-500">Bubble mode sends separate messages on WhatsApp, Instagram and Messenger. Website Chatbot renders each message in its own chat bubble.</p>
                    <button type="button" disabled={!canEdit || busy !== null} onClick={saveResponseSettings} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3.5 py-2.5 text-xs font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50">
                      {busy === 'response-settings' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save response behaviour
                    </button>
                  </div>
                </section>
              )}

              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={!canEdit || busy !== null} onClick={() => save('SAVE_DRAFT')} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">
                    {busy === 'SAVE_DRAFT' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save draft
                  </button>
                  <button type="button" disabled={!canEdit || busy !== null || !hasPersona} onClick={() => save('ACTIVATE')} className="inline-flex items-center gap-2 rounded-xl bg-orange-600 px-3.5 py-2.5 text-xs font-bold text-white transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50">
                    {busy === 'ACTIVATE' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Save & activate
                  </button>
                </div>
                {selectedRecord.enabled && <button type="button" disabled={!canEdit || busy !== null} onClick={() => save('DISABLE')} className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-white px-3.5 py-2.5 text-xs font-bold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50">
                  {busy === 'DISABLE' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />} Disable persona
                </button>}
              </div>
              <p className="mt-3 flex items-start gap-2 text-[11px] leading-relaxed text-slate-500"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" /> Personas affect only this tenant and this channel. If no active persona is set, Amaavigo keeps using the current shared AI behaviour and the tenant’s own company knowledge.</p>
              {selectedRecord.active && selectedRecord.enabled && (
                <div className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50/60 p-3 text-[11px] text-emerald-900">
                  <div className="font-bold">Active persona preview</div>
                  <div className="mt-1">{selectedRecord.active.botName || 'Unnamed assistant'}{selectedRecord.active.role ? ' · ' + selectedRecord.active.role : ''}</div>
                  <div className="mt-1 text-emerald-800">{selectedRecord.active.personality || selectedRecord.active.tone || 'Custom communication behaviour is active for this channel.'}</div>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
};

export default PersonasPanel;
