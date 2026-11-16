import React, { useEffect, useMemo, useState } from 'react';
import { Sparkles, Plus, Trash2, Save, RefreshCw, AlertCircle, CheckCircle2, Flame, Users, Loader2, WandSparkles, SlidersHorizontal, ArrowLeft } from 'lucide-react';
import type { Lead } from '../types';

type Parameter = {
  id: string;
  name: string;
  description: string;
  maxPoints: number;
  evaluationInstructions: string;
  evidenceRequirements: string;
  enabled: boolean;
};
type Config = {
  enabled: boolean;
  parameters: Parameter[];
  thresholds: { hotMin: number; warmMin: number };
  aiInstructions: string;
  configVersion: number;
  backfill?: { status: string; processedCount: number; failedCount: number; jobId?: string; updatedAt?: string } | null;
};

const DEFAULT_CONFIG: Config = {
  enabled: false,
  parameters: [],
  thresholds: { hotMin: 70, warmMin: 40 },
  aiInstructions: '',
  configVersion: 0,
  backfill: null,
};

const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100';
const labelClass = 'mb-1.5 block text-xs font-semibold text-slate-600';

export interface LeadScoringViewProps {
  tenantId: string;
  canManage: boolean;
  leads: Lead[];
  onBack: () => void;
}

export const LeadScoringView: React.FC<LeadScoringViewProps> = ({ tenantId, canManage, leads, onBack }) => {
  const [config, setConfig] = useState<Config>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [description, setDescription] = useState('');
  const [suggestions, setSuggestions] = useState<{ parameters: Parameter[]; aiInstructions: string } | null>(null);
  const [notice, setNotice] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  const activeParameters = useMemo(() => config.parameters.filter((p) => p.enabled), [config.parameters]);
  const weightTotal = useMemo(() => activeParameters.reduce((sum, p) => sum + (Number(p.maxPoints) || 0), 0), [activeParameters]);
  const scoredLeads = leads.filter((lead) => lead.aiScoring?.status === 'SCORED' || lead.aiScoring?.status === 'PROVISIONAL');
  const hotCount = leads.filter((lead) => lead.aiScoring?.category === 'HOT').length;
  const warmCount = leads.filter((lead) => lead.aiScoring?.category === 'WARM').length;
  const coldCount = leads.filter((lead) => lead.aiScoring?.category === 'COLD').length;
  const pendingCount = leads.filter((lead) => !lead.aiScoring || lead.aiScoring.status === 'UNSCORED').length;

  const loadConfig = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/crm/lead-scoring/config', { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not load lead scoring settings.');
      setConfig({ ...DEFAULT_CONFIG, ...(data.config || {}) });
    } catch (error: any) {
      setNotice({ type: 'error', text: error?.message || 'Could not load lead scoring settings.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadConfig();
  }, [tenantId]);

  useEffect(() => {
    if (!config.backfill || !['PENDING', 'RUNNING'].includes(config.backfill.status)) return;
    const timer = window.setInterval(() => { void loadConfig(); }, 15000);
    return () => window.clearInterval(timer);
  }, [config.backfill?.status, config.backfill?.jobId, tenantId]);

  const updateParameter = (id: string, patch: Partial<Parameter>) => {
    setConfig((current) => ({
      ...current,
      parameters: current.parameters.map((parameter) => parameter.id === id ? { ...parameter, ...patch } : parameter),
    }));
  };

  const addParameter = () => {
    setConfig((current) => ({
      ...current,
      parameters: [...current.parameters, {
        id: 'criterion-' + Math.random().toString(36).slice(2, 10),
        name: '',
        description: '',
        maxPoints: 10,
        evaluationInstructions: '',
        evidenceRequirements: '',
        enabled: true,
      }],
    }));
  };

  const removeParameter = (id: string) => {
    setConfig((current) => ({ ...current, parameters: current.parameters.filter((p) => p.id !== id) }));
  };

  const generateSuggestions = async () => {
    if (!description.trim()) {
      setNotice({ type: 'error', text: 'Describe your business and the leads you want to prioritize first.' });
      return;
    }
    setSuggesting(true);
    setNotice(null);
    try {
      const response = await fetch('/api/crm/lead-scoring/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'AI could not suggest scoring parameters.');
      setSuggestions(data.suggestions);
      setNotice({ type: 'success', text: 'AI suggestions are ready. Review and edit them before saving.' });
    } catch (error: any) {
      setNotice({ type: 'error', text: error?.message || 'AI suggestion failed.' });
    } finally {
      setSuggesting(false);
    }
  };

  const useSuggestions = (mode: 'replace' | 'append') => {
    if (!suggestions) return;
    setConfig((current) => ({
      ...current,
      parameters: mode === 'replace' ? suggestions.parameters : [...current.parameters, ...suggestions.parameters],
      aiInstructions: suggestions.aiInstructions || current.aiInstructions,
    }));
    setSuggestions(null);
    setNotice({ type: 'info', text: 'Suggestions copied into your editable scoring criteria. Review the 100-point total before saving.' });
  };

  const save = async () => {
    if (!canManage) return;
    if (config.enabled && (activeParameters.length === 0 || weightTotal !== 100)) {
      setNotice({ type: 'error', text: 'Enabled scoring criteria must total exactly 100 points. Current total: ' + weightTotal + '.' });
      return;
    }
    if (config.thresholds.warmMin < 0 || config.thresholds.hotMin > 100 || config.thresholds.warmMin >= config.thresholds.hotMin) {
      setNotice({ type: 'error', text: 'Warm and Hot score thresholds are invalid.' });
      return;
    }
    setSaving(true);
    setNotice(null);
    try {
      const response = await fetch('/api/crm/lead-scoring/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not save scoring settings.');
      setConfig({ ...DEFAULT_CONFIG, ...(data.config || {}) });
      setNotice({ type: 'success', text: data.config?.enabled
        ? 'Scoring settings saved. Existing leads have been queued for automatic recalculation.'
        : 'Scoring settings saved. AI lead scoring is currently disabled.' });
    } catch (error: any) {
      setNotice({ type: 'error', text: error?.message || 'Could not save scoring settings.' });
    } finally {
      setSaving(false);
    }
  };

  const recalculateAll = async () => {
    if (!canManage || !config.enabled) return;
    setRecalculating(true);
    setNotice(null);
    try {
      const response = await fetch('/api/crm/lead-scoring/recalculate', { method: 'POST' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not start recalculation.');
      setConfig((current) => ({ ...current, backfill: data.backfill || current.backfill }));
      setNotice({ type: 'success', text: 'A new background recalculation has been queued.' });
    } catch (error: any) {
      setNotice({ type: 'error', text: error?.message || 'Could not start recalculation.' });
    } finally {
      setRecalculating(false);
    }
  };

  if (loading) {
    return <div className="flex min-h-[320px] items-center justify-center gap-2 text-sm text-slate-500"><Loader2 className="h-5 w-5 animate-spin" /> Loading lead scoring settings…</div>;
  }

  return (
    <div className="min-h-screen space-y-5 bg-slate-50 px-3 pb-16 pt-4 text-slate-800 sm:px-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-blue-50 p-3 text-blue-700"><SlidersHorizontal className="h-5 w-5" /></div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[.14em] text-slate-400">Sales / CRM</p>
              <h1 className="mt-1 text-xl font-bold text-slate-900">AI Lead Scoring</h1>
              <p className="mt-1 max-w-2xl text-sm text-slate-500">Set the qualification rules for this workspace. AI evaluates evidence from lead profiles and ongoing conversations against your approved criteria.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={onBack} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"><ArrowLeft className="h-4 w-4" />Back to leads</button>
            <span className={'rounded-full px-3 py-1.5 text-xs font-semibold ' + (config.enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600')}>
              {config.enabled ? 'AI scoring enabled' : 'AI scoring disabled'}
            </span>
            {canManage && <button onClick={save} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50"><Save className="h-4 w-4" />{saving ? 'Saving…' : 'Save configuration'}</button>}
          </div>
        </div>
      </div>

      {notice && <div className={'flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ' + (notice.type === 'error' ? 'border-rose-200 bg-rose-50 text-rose-700' : notice.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-blue-200 bg-blue-50 text-blue-800')}><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{notice.text}</div>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        {[
          { label: 'Total CRM leads', value: leads.length, icon: Users },
          { label: 'Scored', value: scoredLeads.length, icon: CheckCircle2 },
          { label: 'Hot', value: hotCount, icon: Flame },
          { label: 'Warm', value: warmCount, icon: Sparkles },
          { label: 'Cold', value: coldCount, icon: AlertCircle },
          { label: 'Unscored', value: pendingCount, icon: AlertCircle },
        ].map((item) => <div key={item.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between text-xs font-medium text-slate-500"><span>{item.label}</span><item.icon className="h-4 w-4 text-slate-400" /></div><div className="mt-2 text-2xl font-bold tabular-nums text-slate-900">{item.value.toLocaleString()}</div></div>)}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,.75fr)]">
        <div className="space-y-5">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div><h2 className="font-bold text-slate-900">Scoring criteria</h2><p className="mt-1 text-xs text-slate-500">AI can suggest criteria, but your workspace controls and approves the final scoring rules.</p></div>
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-700"><input type="checkbox" checked={config.enabled} disabled={!canManage} onChange={(e) => setConfig((c) => ({ ...c, enabled: e.target.checked }))} className="h-4 w-4 rounded border-slate-300 text-blue-600" /> Enable scoring</label>
            </div>
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <label className={labelClass}>Describe your business and ideal lead</label>
              <textarea className={inputClass + ' min-h-24 resize-y'} value={description} disabled={!canManage} onChange={(e) => setDescription(e.target.value)} placeholder="Describe what you sell, who your customers are and what makes a lead valuable. Keep it industry-neutral if your business serves multiple segments." />
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <p className="text-[11px] text-slate-500">AI suggestions are a starting point. Nothing is activated until an admin reviews and saves it.</p>
                {canManage && <button onClick={generateSuggestions} disabled={suggesting} className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-white px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-50"><WandSparkles className="h-4 w-4" />{suggesting ? 'Generating…' : 'Suggest with AI'}</button>}
              </div>
            </div>
            {suggestions && <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50/60 p-4"><div className="flex items-center justify-between gap-2"><p className="text-sm font-semibold text-blue-900">AI suggestions ready</p><span className="text-[11px] text-blue-700">Not saved</span></div><div className="mt-2 space-y-1">{suggestions.parameters.map((p) => <div key={p.id} className="flex justify-between gap-3 text-xs text-blue-900"><span>{p.name}</span><b>{p.maxPoints} pts</b></div>)}</div><div className="mt-3 flex flex-wrap gap-2"><button onClick={() => useSuggestions('replace')} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white">Replace current criteria</button><button onClick={() => useSuggestions('append')} className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-semibold text-blue-800">Append suggestions</button><button onClick={() => setSuggestions(null)} className="rounded-lg px-3 py-2 text-xs font-medium text-blue-700">Dismiss</button></div></div>}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-sm font-bold text-slate-800">Your parameters</h3><p className="text-[11px] text-slate-500">Enabled maximum points must total 100.</p></div>{canManage && <button onClick={addParameter} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"><Plus className="h-3.5 w-3.5" />Add parameter</button>}</div>
            <div className="mt-3 space-y-3">
              {config.parameters.map((parameter, index) => <div key={parameter.id} className="rounded-xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><span className="flex h-6 w-6 items-center justify-center rounded-lg bg-slate-100 text-[11px] font-bold text-slate-600">{index + 1}</span><span className="text-sm font-semibold text-slate-800">Scoring parameter</span></div><div className="flex items-center gap-3"><label className="flex items-center gap-1.5 text-xs text-slate-600"><input type="checkbox" checked={parameter.enabled} disabled={!canManage} onChange={(e) => updateParameter(parameter.id, { enabled: e.target.checked })} className="h-4 w-4 rounded border-slate-300 text-blue-600" />Enabled</label>{canManage && <button onClick={() => removeParameter(parameter.id)} title="Remove parameter" className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>}</div></div>
                <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_110px]"><div><label className={labelClass}>Parameter name</label><input className={inputClass} disabled={!canManage} value={parameter.name} onChange={(e) => updateParameter(parameter.id, { name: e.target.value })} placeholder="e.g. Purchase intent" /></div><div><label className={labelClass}>Maximum points</label><input type="number" min="1" max="100" className={inputClass} disabled={!canManage || !parameter.enabled} value={parameter.maxPoints} onChange={(e) => updateParameter(parameter.id, { maxPoints: Math.max(0, Math.min(100, Number(e.target.value))) })} /></div></div>
                <div className="mt-3"><label className={labelClass}>What does this parameter measure?</label><textarea className={inputClass + ' min-h-16'} disabled={!canManage} value={parameter.description} onChange={(e) => updateParameter(parameter.id, { description: e.target.value })} placeholder="Explain what makes a lead strong or weak on this criterion." /></div>
                <div className="mt-3"><label className={labelClass}>AI evaluation instructions</label><textarea className={inputClass + ' min-h-16'} disabled={!canManage} value={parameter.evaluationInstructions} onChange={(e) => updateParameter(parameter.id, { evaluationInstructions: e.target.value })} placeholder="Tell AI how to award points, including what qualifies for high or low scores." /></div>
                <div className="mt-3"><label className={labelClass}>Evidence AI should look for (optional)</label><textarea className={inputClass + ' min-h-14'} disabled={!canManage} value={parameter.evidenceRequirements} onChange={(e) => updateParameter(parameter.id, { evidenceRequirements: e.target.value })} placeholder="e.g. Explicit customer statement, confirmed requirement, actual budget." /></div>
              </div>)}
              {config.parameters.length === 0 && <div className="rounded-xl border border-dashed border-slate-300 px-4 py-10 text-center"><Sparkles className="mx-auto h-6 w-6 text-slate-300" /><p className="mt-2 text-sm font-semibold text-slate-600">No scoring parameters yet</p><p className="mt-1 text-xs text-slate-400">Generate suggestions with AI or add your first parameter manually.</p></div>}
            </div>
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="flex items-center justify-between text-xs"><span className="font-semibold text-slate-700">Enabled parameter weights</span><b className={weightTotal === 100 ? 'text-emerald-700' : 'text-amber-700'}>{weightTotal}/100 points</b></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200"><div className={'h-full rounded-full ' + (weightTotal === 100 ? 'bg-emerald-500' : 'bg-amber-500')} style={{ width: Math.min(100, weightTotal) + '%' }} /></div>{config.enabled && weightTotal !== 100 && <p className="mt-2 text-[11px] text-amber-700">Adjust enabled weights to exactly 100 before activating scoring.</p>}</div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="font-bold text-slate-900">AI scoring instructions</h2><p className="mt-1 text-xs text-slate-500">Workspace-wide guidance that applies to every parameter.</p>
            <textarea className={inputClass + ' mt-3 min-h-28 resize-y'} disabled={!canManage} value={config.aiInstructions} onChange={(e) => setConfig((c) => ({ ...c, aiInstructions: e.target.value }))} placeholder="Example: Do not infer a budget or purchase timeline unless the lead has explicitly shared it. Give more weight to verified customer statements than to assumptions." />
          </section>
        </div>

        <div className="space-y-5">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="font-bold text-slate-900">Lead classification</h2><p className="mt-1 text-xs text-slate-500">Set the score ranges used to classify leads in this workspace.</p>
            <div className="mt-4 space-y-3">
              <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3"><label className={labelClass}>Hot leads · Minimum score</label><input type="number" min="1" max="100" disabled={!canManage} className={inputClass} value={config.thresholds.hotMin} onChange={(e) => setConfig((c) => ({ ...c, thresholds: { ...c.thresholds, hotMin: Number(e.target.value) } }))} /><p className="mt-1 text-[11px] text-emerald-700">{config.thresholds.hotMin}–100</p></div>
              <div className="rounded-xl border border-amber-100 bg-amber-50/60 p-3"><label className={labelClass}>Warm leads · Minimum score</label><input type="number" min="0" max="99" disabled={!canManage} className={inputClass} value={config.thresholds.warmMin} onChange={(e) => setConfig((c) => ({ ...c, thresholds: { ...c.thresholds, warmMin: Number(e.target.value) } }))} /><p className="mt-1 text-[11px] text-amber-700">{config.thresholds.warmMin}–{config.thresholds.hotMin - 1}</p></div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><label className={labelClass}>Cold leads</label><p className="text-sm font-semibold text-slate-800">0–{config.thresholds.warmMin - 1}</p></div>
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-slate-500">Unscored leads remain separate until AI has enough evidence. Partially evaluated scores are marked provisional and show evidence coverage.</p>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-2"><div><h2 className="font-bold text-slate-900">Existing lead recalculation</h2><p className="mt-1 text-xs text-slate-500">Automatically reevaluate all current CRM leads after saving a new configuration.</p></div><RefreshCw className="h-5 w-5 text-slate-400" /></div>
            <div className="mt-4 rounded-xl bg-slate-50 p-3">
              <div className="flex items-center justify-between text-xs"><span className="text-slate-500">Job status</span><b className="text-slate-800">{config.backfill?.status || 'Not started'}</b></div>
              <div className="mt-2 grid grid-cols-2 gap-2"><div><p className="text-[11px] text-slate-500">Processed</p><p className="text-xl font-bold tabular-nums text-slate-900">{Number(config.backfill?.processedCount || 0)}</p></div><div><p className="text-[11px] text-slate-500">Failed</p><p className="text-xl font-bold tabular-nums text-rose-600">{Number(config.backfill?.failedCount || 0)}</p></div></div>
              {config.backfill?.status === 'RUNNING' || config.backfill?.status === 'PENDING' ? <p className="mt-2 text-[11px] text-blue-700">The background worker will continue processing small batches.</p> : null}
            </div>
            {canManage && <button onClick={recalculateAll} disabled={!config.enabled || recalculating || ['PENDING', 'RUNNING'].includes(config.backfill?.status || '')} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"><RefreshCw className={'h-3.5 w-3.5 ' + (recalculating ? 'animate-spin' : '')} />{recalculating ? 'Queuing…' : 'Recalculate all leads now'}</button>}
            {!canManage && <p className="mt-3 text-[11px] text-slate-500">Only workspace admins can change scoring configuration or start a bulk recalculation.</p>}
          </section>
          <section className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4"><div className="flex items-start gap-2"><Sparkles className="mt-0.5 h-4 w-4 text-blue-700" /><div><p className="text-xs font-bold text-blue-900">How scores stay current</p><p className="mt-1 text-xs leading-relaxed text-blue-800">When a new customer message arrives, AI rechecks the lead against these approved parameters. Scores can rise or fall as new evidence appears. Previous evaluations remain in the lead’s score history.</p></div></div></section>
        </div>
      </div>
    </div>
  );
};

export default LeadScoringView;
