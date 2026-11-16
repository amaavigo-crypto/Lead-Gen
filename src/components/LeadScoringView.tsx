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

const inputClass = 'w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 outline-none transition focus:border-orange-300 focus:ring-2 focus:ring-orange-100 disabled:cursor-not-allowed disabled:opacity-60';
const labelClass = 'mb-1.5 block text-xs font-bold text-slate-600';

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
    return (
      <div className="marketing-studio-shell lead-scoring-module mx-auto max-w-[1440px]">
        <div className="flex min-h-[320px] items-center justify-center gap-2 text-xs font-medium text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin text-orange-500" /> Loading AI lead scoring settings…
        </div>
      </div>
    );
  }

  return (
    <div className="marketing-studio-shell lead-scoring-module mx-auto max-w-[1440px]">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-orange-600">
            <span className="h-2 w-2 rounded-full bg-orange-500" />
            Sales workspace
            <span className="text-slate-300">/</span>
            CRM
          </div>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">AI Lead Scoring</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Configure how your workspace qualifies leads. AI evaluates profile details and conversation evidence against the criteria you approve.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={'inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold ' + (config.enabled
            ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
            : 'border-slate-200 bg-white text-slate-500')}>
            <span className={'h-2 w-2 rounded-full ' + (config.enabled ? 'bg-emerald-500' : 'bg-slate-400')} />
            {config.enabled ? 'Scoring enabled' : 'Scoring disabled'}
          </span>
          <button
            onClick={onBack}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" /> Back to leads
          </button>
          {canManage && (
            <button
              onClick={save}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-orange-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Save className="h-4 w-4" /> {saving ? 'Saving…' : 'Save configuration'}
            </button>
          )}
        </div>
      </div>

      {notice && (
        <div className={'flex items-start gap-2 rounded-xl border px-4 py-3 text-xs ' + (
          notice.type === 'error'
            ? 'border-rose-200 bg-rose-50 text-rose-700'
            : notice.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-orange-100 bg-orange-50 text-orange-800'
        )}>
          {notice.type === 'success'
            ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
          {notice.text}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {[
          { label: 'Total CRM leads', value: leads.length, helper: 'In this workspace', icon: Users, tone: 'orange' },
          { label: 'Scored', value: scoredLeads.length, helper: 'Evaluated by AI', icon: CheckCircle2, tone: 'blue' },
          { label: 'Hot', value: hotCount, helper: 'High-priority leads', icon: Flame, tone: 'green' },
          { label: 'Warm', value: warmCount, helper: 'Potential opportunities', icon: Sparkles, tone: 'amber' },
          { label: 'Cold', value: coldCount, helper: 'Below warm threshold', icon: AlertCircle, tone: 'slate' },
          { label: 'Unscored', value: pendingCount, helper: 'Awaiting evidence', icon: AlertCircle, tone: 'slate' },
        ].map((item) => (
          <div key={item.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-500">{item.label}</span>
              <span className={'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ' + (
                item.tone === 'green' ? 'bg-emerald-50 text-emerald-600'
                  : item.tone === 'amber' ? 'bg-amber-50 text-amber-600'
                    : item.tone === 'blue' ? 'bg-sky-50 text-sky-600'
                      : item.tone === 'slate' ? 'bg-slate-100 text-slate-500'
                        : 'bg-orange-50 text-orange-600'
              )}>
                <item.icon className="h-4 w-4" />
              </span>
            </div>
            <div className="mt-3 text-2xl font-bold tabular-nums text-slate-950">{item.value.toLocaleString()}</div>
            <div className="mt-1 text-[11px] text-slate-400">{item.helper}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,.75fr)]">
        <div className="space-y-5">
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col justify-between gap-3 border-b border-slate-100 p-4 md:flex-row md:items-center md:p-5">
              <div>
                <h2 className="text-base font-bold text-slate-900">Scoring criteria</h2>
                <p className="mt-0.5 text-xs text-slate-500">AI can suggest a framework, but your workspace controls and approves every scoring rule.</p>
              </div>
              <label className="inline-flex items-center gap-2 self-start rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
                <input
                  type="checkbox"
                  checked={config.enabled}
                  disabled={!canManage}
                  onChange={(e) => setConfig((c) => ({ ...c, enabled: e.target.checked }))}
                  className="h-4 w-4 rounded border-slate-300 text-orange-600 focus:ring-orange-500"
                />
                Enable scoring
              </label>
            </div>

            <div className="space-y-4 p-4 md:p-5">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <label className={labelClass}>Describe your business and ideal lead</label>
                <textarea
                  className={inputClass + ' min-h-24 resize-y'}
                  value={description}
                  disabled={!canManage}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe what you sell, who your customers are and what makes a lead valuable. Keep it industry-neutral if your business serves multiple segments."
                />
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <p className="max-w-xl text-[11px] text-slate-500">AI suggestions are a starting point. Nothing is activated until an admin reviews and saves the criteria.</p>
                  {canManage && (
                    <button
                      onClick={generateSuggestions}
                      disabled={suggesting}
                      className="inline-flex items-center gap-2 rounded-xl border border-orange-200 bg-white px-3 py-2 text-xs font-bold text-orange-700 transition hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <WandSparkles className="h-4 w-4" /> {suggesting ? 'Generating…' : 'Suggest with AI'}
                    </button>
                  )}
                </div>
              </div>

              {suggestions && (
                <div className="rounded-xl border border-orange-100 bg-orange-50/70 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-bold text-orange-900">AI suggestions ready</p>
                    <span className="rounded-full border border-orange-200 bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-orange-700">Not saved</span>
                  </div>
                  <div className="mt-3 divide-y divide-orange-100">
                    {suggestions.parameters.map((p) => (
                      <div key={p.id} className="flex justify-between gap-3 py-2 text-xs text-slate-700">
                        <span className="font-medium">{p.name}</span>
                        <b className="tabular-nums text-slate-900">{p.maxPoints} pts</b>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button onClick={() => useSuggestions('replace')} className="rounded-lg bg-orange-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-orange-700">Replace current criteria</button>
                    <button onClick={() => useSuggestions('append')} className="rounded-lg border border-orange-200 bg-white px-3 py-2 text-xs font-bold text-orange-800 transition hover:bg-orange-50">Append suggestions</button>
                    <button onClick={() => setSuggestions(null)} className="rounded-lg px-3 py-2 text-xs font-semibold text-slate-500 transition hover:bg-white hover:text-slate-800">Dismiss</button>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Your parameters</h3>
                  <p className="mt-0.5 text-[11px] text-slate-500">Enabled maximum points must total 100.</p>
                </div>
                {canManage && (
                  <button
                    onClick={addParameter}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add parameter
                  </button>
                )}
              </div>

              <div className="space-y-3">
                {config.parameters.map((parameter, index) => (
                  <div key={parameter.id} className="rounded-xl border border-slate-200 bg-white p-4 transition hover:border-slate-300">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-50 text-xs font-bold text-orange-700">{index + 1}</span>
                        <span className="text-sm font-bold text-slate-800">Scoring parameter</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                          <input
                            type="checkbox"
                            checked={parameter.enabled}
                            disabled={!canManage}
                            onChange={(e) => updateParameter(parameter.id, { enabled: e.target.checked })}
                            className="h-4 w-4 rounded border-slate-300 text-orange-600 focus:ring-orange-500"
                          />
                          Enabled
                        </label>
                        {canManage && (
                          <button onClick={() => removeParameter(parameter.id)} title="Remove parameter" className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_120px]">
                      <div>
                        <label className={labelClass}>Parameter name</label>
                        <input className={inputClass} disabled={!canManage} value={parameter.name} onChange={(e) => updateParameter(parameter.id, { name: e.target.value })} placeholder="e.g. Purchase intent" />
                      </div>
                      <div>
                        <label className={labelClass}>Maximum points</label>
                        <input type="number" min="1" max="100" className={inputClass} disabled={!canManage || !parameter.enabled} value={parameter.maxPoints} onChange={(e) => updateParameter(parameter.id, { maxPoints: Math.max(0, Math.min(100, Number(e.target.value))) })} />
                      </div>
                    </div>
                    <div className="mt-3">
                      <label className={labelClass}>What does this parameter measure?</label>
                      <textarea className={inputClass + ' min-h-16'} disabled={!canManage} value={parameter.description} onChange={(e) => updateParameter(parameter.id, { description: e.target.value })} placeholder="Explain what makes a lead strong or weak on this criterion." />
                    </div>
                    <div className="mt-3">
                      <label className={labelClass}>AI evaluation instructions</label>
                      <textarea className={inputClass + ' min-h-16'} disabled={!canManage} value={parameter.evaluationInstructions} onChange={(e) => updateParameter(parameter.id, { evaluationInstructions: e.target.value })} placeholder="Tell AI how to award points, including what qualifies for high or low scores." />
                    </div>
                    <div className="mt-3">
                      <label className={labelClass}>Evidence AI should look for (optional)</label>
                      <textarea className={inputClass + ' min-h-14'} disabled={!canManage} value={parameter.evidenceRequirements} onChange={(e) => updateParameter(parameter.id, { evidenceRequirements: e.target.value })} placeholder="e.g. Explicit customer statement, confirmed requirement, actual budget." />
                    </div>
                  </div>
                ))}

                {config.parameters.length === 0 && (
                  <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center">
                    <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-white text-orange-500 shadow-sm"><Sparkles className="h-5 w-5" /></div>
                    <p className="mt-3 text-sm font-bold text-slate-700">No scoring parameters yet</p>
                    <p className="mt-1 text-xs text-slate-500">Generate suggestions with AI or add your first parameter manually.</p>
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-bold text-slate-700">Enabled parameter weights</span>
                  <b className={weightTotal === 100 ? 'text-emerald-700' : 'text-amber-700'}>{weightTotal}/100 points</b>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                  <div className={'h-full rounded-full transition-all ' + (weightTotal === 100 ? 'bg-emerald-500' : 'bg-amber-500')} style={{ width: Math.min(100, weightTotal) + '%' }} />
                </div>
                {config.enabled && weightTotal !== 100 && <p className="mt-2 text-[11px] text-amber-700">Adjust enabled weights to exactly 100 before activating scoring.</p>}
              </div>
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 p-4 md:p-5">
              <h2 className="text-base font-bold text-slate-900">AI scoring instructions</h2>
              <p className="mt-0.5 text-xs text-slate-500">Workspace-wide guidance that applies to every parameter.</p>
            </div>
            <div className="p-4 md:p-5">
              <textarea
                className={inputClass + ' min-h-32 resize-y'}
                disabled={!canManage}
                value={config.aiInstructions}
                onChange={(e) => setConfig((c) => ({ ...c, aiInstructions: e.target.value }))}
                placeholder="Example: Do not infer a budget or purchase timeline unless the lead has explicitly shared it. Give more weight to verified customer statements than to assumptions."
              />
            </div>
          </section>
        </div>

        <div className="space-y-5">
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 p-4 md:p-5">
              <h2 className="text-base font-bold text-slate-900">Lead classification</h2>
              <p className="mt-0.5 text-xs text-slate-500">Set the score ranges used to classify leads in this workspace.</p>
            </div>
            <div className="space-y-3 p-4 md:p-5">
              <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3">
                <label className={labelClass}>Hot leads · Minimum score</label>
                <input type="number" min="1" max="100" disabled={!canManage} className={inputClass} value={config.thresholds.hotMin} onChange={(e) => setConfig((c) => ({ ...c, thresholds: { ...c.thresholds, hotMin: Number(e.target.value) } }))} />
                <p className="mt-1.5 text-[11px] font-semibold text-emerald-700">{config.thresholds.hotMin}–100</p>
              </div>
              <div className="rounded-xl border border-amber-100 bg-amber-50/60 p-3">
                <label className={labelClass}>Warm leads · Minimum score</label>
                <input type="number" min="0" max="99" disabled={!canManage} className={inputClass} value={config.thresholds.warmMin} onChange={(e) => setConfig((c) => ({ ...c, thresholds: { ...c.thresholds, warmMin: Number(e.target.value) } }))} />
                <p className="mt-1.5 text-[11px] font-semibold text-amber-700">{config.thresholds.warmMin}–{config.thresholds.hotMin - 1}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <label className={labelClass}>Cold leads</label>
                <p className="mt-1 text-sm font-bold text-slate-800">0–{config.thresholds.warmMin - 1}</p>
              </div>
              <p className="text-[11px] leading-relaxed text-slate-500">Unscored leads remain separate until AI has enough evidence. Partially evaluated scores are marked provisional and show evidence coverage.</p>
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-4 md:p-5">
              <div>
                <h2 className="text-base font-bold text-slate-900">Existing lead recalculation</h2>
                <p className="mt-0.5 text-xs text-slate-500">Automatically reevaluate all current CRM leads after saving a new configuration.</p>
              </div>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-600"><RefreshCw className="h-4 w-4" /></span>
            </div>
            <div className="p-4 md:p-5">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-slate-500">Job status</span>
                  <b className="text-slate-800">{config.backfill?.status || 'Not started'}</b>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[11px] text-slate-500">Processed</p>
                    <p className="mt-1 text-xl font-bold tabular-nums text-slate-900">{Number(config.backfill?.processedCount || 0)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-500">Failed</p>
                    <p className="mt-1 text-xl font-bold tabular-nums text-rose-600">{Number(config.backfill?.failedCount || 0)}</p>
                  </div>
                </div>
                {config.backfill?.status === 'RUNNING' || config.backfill?.status === 'PENDING'
                  ? <p className="mt-3 border-t border-slate-200 pt-3 text-[11px] text-orange-700">The background worker will continue processing small batches.</p>
                  : null}
              </div>
              {canManage && (
                <button
                  onClick={recalculateAll}
                  disabled={!config.enabled || recalculating || ['PENDING', 'RUNNING'].includes(config.backfill?.status || '')}
                  className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-600 transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <RefreshCw className={'h-3.5 w-3.5 ' + (recalculating ? 'animate-spin' : '')} />
                  {recalculating ? 'Queuing…' : 'Recalculate all leads now'}
                </button>
              )}
              {!canManage && <p className="mt-3 text-[11px] text-slate-500">Only workspace admins can change scoring configuration or start a bulk recalculation.</p>}
            </div>
          </section>

          <section className="rounded-2xl border border-orange-100 bg-orange-50/60 p-4">
            <div className="flex items-start gap-2">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white text-orange-600 shadow-sm"><Sparkles className="h-4 w-4" /></span>
              <div>
                <p className="text-xs font-bold text-orange-900">How scores stay current</p>
                <p className="mt-1 text-xs leading-relaxed text-orange-800">When a new customer message arrives, AI rechecks the lead against these approved parameters. Scores can rise or fall as new evidence appears. Previous evaluations remain in the lead’s score history.</p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
};

export default LeadScoringView;