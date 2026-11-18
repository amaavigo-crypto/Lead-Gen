import React, { useState, useEffect } from 'react';
import {
  Clock,
  Send,
  XCircle,
  AlertTriangle,
  CheckCircle2,
  Search,
  RefreshCw,
  Settings,
  Bot,
  User,
  ShieldCheck,
  Zap,
  MessageCircle,
  Mail,
  Instagram,
  Facebook,
  Globe,
  Play,
  Calendar,
} from 'lucide-react';
import { Channel, Lead, Conversation, Message } from '../types';

interface AutoFollowUpDashboardProps {
  leads: Lead[];
  conversations: Conversation[];
  messages: Message[];
  onSelectConversation?: (conversationId: string) => void;
  onRefresh?: () => void;
}

export const AutoFollowUpDashboard: React.FC<AutoFollowUpDashboardProps> = ({
  leads,
  conversations,
  messages,
  onSelectConversation,
  onRefresh,
}) => {
  const [activeTab, setActiveTab] = useState<'JOBS' | 'SETTINGS' | 'LOGS'>('JOBS');
  const [loading, setLoading] = useState<boolean>(false);
  const [dashboardData, setDashboardData] = useState<{
    metrics: {
      scheduled: number;
      sentToday: number;
      cancelled: number;
      skipped: number;
      humanReview: number;
      failed: number;
      completed: number;
    };
    jobs: any[];
    logs: any[];
    config: any;
  } | null>(null);

  // Filters
  const [channelFilter, setChannelFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Settings state
  const [whatsappDelayVal, setWhatsappDelayVal] = useState<number>(1);
  const [whatsappDelayUnit, setWhatsappDelayUnit] = useState<'minute' | 'hour' | 'day'>('hour');

  const [instagramDelayVal, setInstagramDelayVal] = useState<number>(4);
  const [instagramDelayUnit, setInstagramDelayUnit] = useState<'minute' | 'hour' | 'day'>('hour');

  const [facebookDelayVal, setFacebookDelayVal] = useState<number>(1);
  const [facebookDelayUnit, setFacebookDelayUnit] = useState<'minute' | 'hour' | 'day'>('day');

  const [emailDelayVal, setEmailDelayVal] = useState<number>(2);
  const [emailDelayUnit, setEmailDelayUnit] = useState<'minute' | 'hour' | 'day'>('day');

  const [websiteDelayVal, setWebsiteDelayVal] = useState<number>(1);
  const [websiteDelayUnit, setWebsiteDelayUnit] = useState<'minute' | 'hour' | 'day'>('hour');

  const [maxFollowUps, setMaxFollowUps] = useState<number>(3);

  const [isSavingConfig, setIsSavingConfig] = useState<boolean>(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);
  const [triggeringJobId, setTriggeringJobId] = useState<string | null>(null);

  const fetchDashboard = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/auto-followup/dashboard');
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setDashboardData(data);
          if (data.config) {
            const cfg = data.config;
            if (cfg.channels?.WHATSAPP) {
              setWhatsappDelayVal(cfg.channels.WHATSAPP.defaultDelayValue || 1);
              setWhatsappDelayUnit(cfg.channels.WHATSAPP.defaultDelayUnit || 'hour');
            }
            if (cfg.channels?.INSTAGRAM) {
              setInstagramDelayVal(cfg.channels.INSTAGRAM.defaultDelayValue || 4);
              setInstagramDelayUnit(cfg.channels.INSTAGRAM.defaultDelayUnit || 'hour');
            }
            if (cfg.channels?.FACEBOOK) {
              setFacebookDelayVal(cfg.channels.FACEBOOK.defaultDelayValue || 1);
              setFacebookDelayUnit(cfg.channels.FACEBOOK.defaultDelayUnit || 'day');
            }
            if (cfg.channels?.EMAIL) {
              setEmailDelayVal(cfg.channels.EMAIL.defaultDelayValue || 2);
              setEmailDelayUnit(cfg.channels.EMAIL.defaultDelayUnit || 'day');
            }
            if (cfg.channels?.WEBSITE) {
              setWebsiteDelayVal(cfg.channels.WEBSITE.defaultDelayValue || 1);
              setWebsiteDelayUnit(cfg.channels.WEBSITE.defaultDelayUnit || 'hour');
            }
          }
        }
      }
    } catch (e) {
      console.error('Error loading auto follow-up dashboard:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, []);

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingConfig(true);
    setSaveSuccessMsg(null);
    try {
      const res = await fetch('/api/auto-followup/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channels: {
            WHATSAPP: { enabled: true, defaultDelayValue: whatsappDelayVal, defaultDelayUnit: whatsappDelayUnit, maxFollowUps },
            INSTAGRAM: { enabled: true, defaultDelayValue: instagramDelayVal, defaultDelayUnit: instagramDelayUnit, maxFollowUps },
            FACEBOOK: { enabled: true, defaultDelayValue: facebookDelayVal, defaultDelayUnit: facebookDelayUnit, maxFollowUps },
            EMAIL: { enabled: true, defaultDelayValue: emailDelayVal, defaultDelayUnit: emailDelayUnit, maxFollowUps },
            WEBSITE: { enabled: true, defaultDelayValue: websiteDelayVal, defaultDelayUnit: websiteDelayUnit, maxFollowUps },
          },
        }),
      });
      if (res.ok) {
        setSaveSuccessMsg('Global Auto Follow-Up channel timings successfully updated!');
        setTimeout(() => setSaveSuccessMsg(null), 4000);
        fetchDashboard();
      }
    } catch (e) {
      console.error('Error saving config:', e);
    } finally {
      setIsSavingConfig(false);
    }
  };

  const handleManualTriggerNow = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/auto-followup/trigger-now', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        await fetchDashboard();
        if (onRefresh) onRefresh();
      }
    } catch (e) {
      console.error('Trigger now error:', e);
    } finally {
      setLoading(false);
    }
  };

  const filteredJobs = (dashboardData?.jobs || []).filter((j) => {
    if (channelFilter !== 'ALL' && j.channel !== channelFilter) return false;
    if (statusFilter !== 'ALL' && j.status !== statusFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const lead = leads.find((l) => l.leadId === j.leadId);
      const leadName = lead?.queryMessage || lead?.serviceInterest || j.leadId;
      const match =
        j.id.toLowerCase().includes(q) ||
        j.conversationId.toLowerCase().includes(q) ||
        j.channel.toLowerCase().includes(q) ||
        leadName.toLowerCase().includes(q);
      if (!match) return false;
    }
    return true;
  });

  const pillBase = 'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-bold tracking-wide ring-1 ring-inset ';

  const getChannelBadge = (ch: Channel | string) => {
    switch (ch) {
      case 'WHATSAPP':
        return <span className={pillBase + 'bg-emerald-50 text-emerald-700 ring-emerald-200'}><MessageCircle className="w-3 h-3" /> WhatsApp</span>;
      case 'EMAIL':
        return <span className={pillBase + 'bg-blue-50 text-blue-700 ring-blue-200'}><Mail className="w-3 h-3" /> Email</span>;
      case 'INSTAGRAM':
        return <span className={pillBase + 'bg-pink-50 text-pink-700 ring-pink-200'}><Instagram className="w-3 h-3" /> Instagram</span>;
      case 'FACEBOOK':
        return <span className={pillBase + 'bg-indigo-50 text-indigo-700 ring-indigo-200'}><Facebook className="w-3 h-3" /> Facebook</span>;
      case 'WEBSITE':
        return <span className={pillBase + 'bg-teal-50 text-teal-700 ring-teal-200'}><Globe className="w-3 h-3" /> Website</span>;
      default:
        return <span className={pillBase + 'bg-slate-50 text-slate-700 ring-slate-200'}>{ch}</span>;
    }
  };

  const getStatusBadge = (st: string) => {
    switch (st) {
      case 'scheduled':
        return <span className={pillBase + 'bg-amber-50 text-amber-700 ring-amber-200'}><Clock className="w-3 h-3" /> Scheduled</span>;
      case 'sent':
        return <span className={pillBase + 'bg-emerald-50 text-emerald-700 ring-emerald-200'}><CheckCircle2 className="w-3 h-3" /> Sent</span>;
      case 'cancelled':
        return <span className={pillBase + 'bg-slate-50 text-slate-600 ring-slate-200'}><XCircle className="w-3 h-3" /> Cancelled</span>;
      case 'skipped':
        return <span className={pillBase + 'bg-blue-50 text-blue-700 ring-blue-200'}><Bot className="w-3 h-3" /> Skipped (No-Op)</span>;
      case 'human_review':
        return <span className={pillBase + 'bg-violet-50 text-violet-700 ring-violet-200'}><AlertTriangle className="w-3 h-3" /> Human Review</span>;
      case 'failed':
        return <span className={pillBase + 'bg-rose-50 text-rose-700 ring-rose-200'}><XCircle className="w-3 h-3" /> Failed</span>;
      default:
        return <span className={pillBase + 'bg-slate-50 text-slate-700 ring-slate-200'}>{st}</span>;
    }
  };


  const statCards = [
    { label: 'Scheduled', value: dashboardData?.metrics.scheduled ?? 0, icon: Clock, tile: 'bg-sky-50 text-sky-600', note: 'Queued to send' },
    { label: 'Sent Today', value: dashboardData?.metrics.sentToday ?? 0, icon: Send, tile: 'bg-emerald-50 text-emerald-600', note: 'Follow-ups delivered today' },
    { label: 'Human Review', value: dashboardData?.metrics.humanReview ?? 0, icon: ShieldCheck, tile: 'bg-violet-50 text-violet-600', note: 'Waiting for a person' },
    { label: 'Skipped (No-Op)', value: dashboardData?.metrics.skipped ?? 0, icon: Bot, tile: 'bg-slate-100 text-slate-600', note: 'AI chose not to send' },
    { label: 'Cancelled', value: dashboardData?.metrics.cancelled ?? 0, icon: XCircle, tile: 'bg-slate-100 text-slate-600', note: 'Stopped before sending' },
    { label: 'Failed', value: dashboardData?.metrics.failed ?? 0, icon: AlertTriangle, tile: 'bg-rose-50 text-rose-600', note: 'Needs attention' },
    { label: 'Completed', value: dashboardData?.metrics.completed ?? 0, icon: CheckCircle2, tile: 'bg-emerald-50 text-emerald-600', note: 'Sequences finished' },
  ];

  const tabOptions: { id: 'JOBS' | 'SETTINGS' | 'LOGS'; label: string; count?: number }[] = [
    { id: 'JOBS', label: 'Follow-Up Queue & History', count: dashboardData?.jobs?.length || 0 },
    { id: 'SETTINGS', label: 'Channel Timing & Global Rules' },
    { id: 'LOGS', label: 'Operational Activity Feed', count: dashboardData?.logs?.length || 0 },
  ];

  const cardCopy = {
    JOBS: { title: 'Follow-up queue', desc: 'Every follow-up job with the AI decision and reason behind it.' },
    SETTINGS: { title: 'Channel timing & global rules', desc: 'Delay per channel and the maximum number of follow-ups per sequence.' },
    LOGS: { title: 'Activity feed', desc: 'Audit trail of follow-up actions taken by the agent and your team.' },
  }[activeTab];

  return (
    <div data-umrah360-module="auto-followup" className="auto-followup-module af-shell">
      {/* Header strip */}
      <header className="af-strip">
        <div className="af-strip-id">
          <div className="af-strip-tile">
            <Bot className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1>Auto Follow-Up Agent</h1>
              <span className="af-strip-pill">Operational Control Active</span>
            </div>
            <p>Context-aware follow-ups, per-channel timing, human review hand-off and a full audit trail</p>
          </div>
        </div>

        <div className="af-strip-actions">
          <button
            type="button"
            onClick={fetchDashboard}
            disabled={loading}
            title="Refresh dashboard"
            className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg border border-slate-200 transition disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-orange-500' : ''}`} />
          </button>
          <button
            type="button"
            onClick={handleManualTriggerNow}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-semibold transition shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Play className="w-4 h-4" />
            <span>Trigger Poller Cycle Now</span>
          </button>
        </div>
      </header>

      <main className="af-main">
        <div className="af-content w-full max-w-[1600px] mx-auto p-5 md:p-7 space-y-6">
          {/* Page intro */}
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
            <div>
              <div className="af-eyebrow"><span className="h-2 w-2 rounded-full bg-orange-500" /> Follow-up workspace</div>
              <h2 className="af-intro-title">AI Auto Follow-Up Agent</h2>
              <p className="af-intro-copy">Dynamic, context-aware follow-up engine for your inbound leads. Reads actual thread context and generates personalized replies.</p>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Live workspace</span>
            </div>
          </div>

          {/* Stat cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3" aria-label="Follow-up performance metrics">
            {statCards.map((card) => {
              const CardIcon = card.icon;
              return (
                <div key={card.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-slate-500">{card.label}</span>
                    <span className={'h-8 w-8 shrink-0 rounded-xl flex items-center justify-center ' + card.tile}><CardIcon className="w-4 h-4" /></span>
                  </div>
                  <div className="mt-3 text-2xl font-bold tabular-nums text-slate-950">{card.value.toLocaleString('en-IN')}</div>
                  <div className="mt-1 text-[11px] text-slate-400">{card.note}</div>
                </div>
              );
            })}
          </div>

          {/* Main card: title, filters, section chips, content */}
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="p-4 md:p-5 border-b border-slate-100 space-y-4">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                <div>
                  <h3 className="af-card-title">{cardCopy.title}</h3>
                  <p className="mt-0.5 text-xs text-slate-500">{cardCopy.desc}</p>
                </div>
                {activeTab === 'JOBS' && (
                  <div className="flex w-full lg:w-auto flex-col sm:flex-row gap-2">
                    <div className="relative w-full sm:w-72">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        type="search"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search lead or conversation..."
                        aria-label="Search follow-ups"
                        className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-800 placeholder:text-slate-400 outline-none"
                      />
                    </div>
                    <select
                      aria-label="Filter by channel"
                      value={channelFilter}
                      onChange={(e) => setChannelFilter(e.target.value)}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-600 outline-none"
                    >
                      <option value="ALL">Channel: All</option>
                      <option value="WHATSAPP">Channel: WhatsApp</option>
                      <option value="EMAIL">Channel: Email</option>
                      <option value="INSTAGRAM">Channel: Instagram</option>
                      <option value="FACEBOOK">Channel: Facebook</option>
                      <option value="WEBSITE">Channel: Website</option>
                    </select>
                    <select
                      aria-label="Filter by status"
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-600 outline-none"
                    >
                      <option value="ALL">Status: All</option>
                      <option value="scheduled">Status: Scheduled</option>
                      <option value="sent">Status: Sent</option>
                      <option value="human_review">Status: Human Review</option>
                      <option value="skipped">Status: Skipped</option>
                      <option value="cancelled">Status: Cancelled</option>
                      <option value="failed">Status: Failed</option>
                    </select>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5" role="tablist" aria-label="Auto Follow-Up sections">
                {tabOptions.map((tab) => {
                  const active = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setActiveTab(tab.id)}
                      className={'shrink-0 px-3 py-2 rounded-lg text-xs font-semibold transition ' + (active ? 'bg-orange-500 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700')}
                    >
                      {tab.label}
                      {tab.count !== undefined && (
                        <span className={'ml-1.5 tabular-nums ' + (active ? 'text-blue-100' : 'text-slate-400')}>{tab.count}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* TAB 1: JOBS TABLE */}
            {activeTab === 'JOBS' && (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] text-left">
                  <thead className="bg-slate-50/80 border-b border-slate-100">
                    <tr className="text-[10px] uppercase tracking-[0.12em] text-slate-400">
                      <th className="px-5 py-3 font-semibold">Lead / Company</th>
                      <th className="px-4 py-3 font-semibold">Channel</th>
                      <th className="px-4 py-3 font-semibold">Attempt</th>
                      <th className="px-4 py-3 font-semibold">Scheduled / Processed</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                      <th className="px-4 py-3 font-semibold">AI Decision & Operational Reason</th>
                      <th className="px-4 py-3 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredJobs.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-6 py-14 text-center">
                          <div className="mx-auto h-12 w-12 rounded-2xl bg-slate-100 text-slate-500 flex items-center justify-center"><Clock className="w-5 h-5" /></div>
                          <h4 className="mt-4 text-sm font-bold text-slate-900">{(dashboardData?.jobs?.length || 0) === 0 ? 'No follow-ups yet' : 'No matching follow-ups'}</h4>
                          <p className="mt-1 text-xs text-slate-500">{(dashboardData?.jobs?.length || 0) === 0 ? 'Follow-up jobs appear here once Auto Follow-Up is enabled on a lead.' : 'No follow-up jobs match the active filters.'}</p>
                        </td>
                      </tr>
                    ) : (
                      filteredJobs.map((j) => {
                        const lead = leads.find((l) => l.leadId === j.leadId);
                        const leadName = lead?.serviceInterest || lead?.queryMessage?.slice(0, 30) || j.leadId;
                        const fmt = (value: string) => new Date(value).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                          hour12: true,
                        });

                        return (
                          <tr key={j.id} className="hover:bg-slate-50/70 transition-colors">
                            <td className="px-5 py-4">
                              <div className="min-w-0 max-w-[280px]">
                                <p className="font-semibold text-slate-900 truncate" title={leadName}>{leadName}</p>
                                <p className="mt-0.5 text-[11px] text-slate-400 truncate" title={j.conversationId}>{j.conversationId}</p>
                              </div>
                            </td>
                            <td className="px-4 py-4">{getChannelBadge(j.channel)}</td>
                            <td className="px-4 py-4 font-semibold text-slate-700 tabular-nums">#{j.attempt}</td>
                            <td className="px-4 py-4 text-slate-600 whitespace-nowrap">
                              {j.status === 'scheduled' ? (
                                <span className="font-medium text-amber-700">{fmt(j.scheduledAt)}</span>
                              ) : (
                                <span>{j.processedAt ? fmt(j.processedAt) : '—'}</span>
                              )}
                            </td>
                            <td className="px-4 py-4">{getStatusBadge(j.status)}</td>
                            <td className="px-4 py-4 max-w-xs">
                          {j.audit ? (
                            <div>
                              {j.audit.decision && (
                                <p className="font-semibold text-slate-800">
                                  Decision: {String(j.audit.decision).replace(/_/g, ' ').toUpperCase()}
                                </p>
                              )}
                              {j.audit.objective && (
                                <p className="text-[11px] text-slate-700 mt-0.5">
                                  Objective: {j.audit.objective}
                                </p>
                              )}
                              {j.audit.reason && (
                                <p className="text-[11px] text-slate-600 mt-0.5">
                                  Reason: {j.audit.reason}
                                </p>
                              )}
                              {j.audit.generatedMessage && (
                                <p className="text-[11px] text-slate-500 line-clamp-2 italic mt-0.5">
                                  "{j.audit.generatedMessage}"
                                </p>
                              )}
                              {j.audit.humanReviewReason && (
                                <p className="text-[11px] text-purple-600 font-semibold mt-0.5">
                                  Flag: {j.audit.humanReviewReason}
                                </p>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400 italic">
                              {j.cancelReason ? `Reason: ${j.cancelReason}` : 'Awaiting send-time evaluation'}
                            </span>
                          )}
                        </td>
                            <td className="px-4 py-4 text-right whitespace-nowrap">
                              {onSelectConversation && (
                                <button
                                  type="button"
                                  onClick={() => onSelectConversation(j.conversationId)}
                                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:border-orange-200 hover:text-orange-700 transition"
                                >
                                  Open thread →
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}

      {/* TAB 2: SETTINGS */}
      {activeTab === 'SETTINGS' && (
        <form onSubmit={handleSaveConfig} className="af-panel-body ai-ops-settings-form">
          <h2 className="text-lg font-bold text-slate-900 mb-1 font-display">Channel-Specific Timing Configuration</h2>
          <p className="text-xs text-slate-500 mb-6">
            Define independent follow-up delays for each communication channel. The team member enables Auto Follow-Up on a lead, and the agent uses these channel timings.
          </p>

          {saveSuccessMsg && (
            <div className="mb-6 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              {saveSuccessMsg}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            {/* WhatsApp */}
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70">
              <div className="flex items-center gap-2 mb-3">
                <MessageCircle className="w-5 h-5 text-emerald-600" />
                <h3 className="font-bold text-sm text-slate-900">WhatsApp Timing</h3>
              </div>
              <p className="text-xs text-slate-500 mb-3">Default delay for WhatsApp inbound conversations</p>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  value={whatsappDelayVal}
                  onChange={(e) => setWhatsappDelayVal(parseInt(e.target.value, 10) || 1)}
                  className="w-20 text-xs p-2 bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-orange-500"
                />
                <select
                  value={whatsappDelayUnit}
                  onChange={(e) => setWhatsappDelayUnit(e.target.value as any)}
                  className="text-xs p-2 bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-orange-500"
                >
                  <option value="minute">Minutes (Testing / Rapid)</option>
                  <option value="hour">Hours</option>
                  <option value="day">Days</option>
                </select>
              </div>
            </div>

            {/* Instagram */}
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70">
              <div className="flex items-center gap-2 mb-3">
                <Instagram className="w-5 h-5 text-pink-600" />
                <h3 className="font-bold text-sm text-slate-900">Instagram Timing</h3>
              </div>
              <p className="text-xs text-slate-500 mb-3">Default delay for Instagram Direct Messages</p>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  value={instagramDelayVal}
                  onChange={(e) => setInstagramDelayVal(parseInt(e.target.value, 10) || 1)}
                  className="w-20 text-xs p-2 bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-orange-500"
                />
                <select
                  value={instagramDelayUnit}
                  onChange={(e) => setInstagramDelayUnit(e.target.value as any)}
                  className="text-xs p-2 bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-orange-500"
                >
                  <option value="minute">Minutes</option>
                  <option value="hour">Hours</option>
                  <option value="day">Days</option>
                </select>
              </div>
            </div>

            {/* Facebook */}
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70">
              <div className="flex items-center gap-2 mb-3">
                <Facebook className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-sm text-slate-900">Facebook Timing</h3>
              </div>
              <p className="text-xs text-slate-500 mb-3">Default delay for Facebook Messenger</p>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  value={facebookDelayVal}
                  onChange={(e) => setFacebookDelayVal(parseInt(e.target.value, 10) || 1)}
                  className="w-20 text-xs p-2 bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-orange-500"
                />
                <select
                  value={facebookDelayUnit}
                  onChange={(e) => setFacebookDelayUnit(e.target.value as any)}
                  className="text-xs p-2 bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-orange-500"
                >
                  <option value="minute">Minutes</option>
                  <option value="hour">Hours</option>
                  <option value="day">Days</option>
                </select>
              </div>
            </div>

            {/* Email */}
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70">
              <div className="flex items-center gap-2 mb-3">
                <Mail className="w-5 h-5 text-orange-600" />
                <h3 className="font-bold text-sm text-slate-900">Email Timing</h3>
              </div>
              <p className="text-xs text-slate-500 mb-3">Default delay for Email threads</p>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  value={emailDelayVal}
                  onChange={(e) => setEmailDelayVal(parseInt(e.target.value, 10) || 1)}
                  className="w-20 text-xs p-2 bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-orange-500"
                />
                <select
                  value={emailDelayUnit}
                  onChange={(e) => setEmailDelayUnit(e.target.value as any)}
                  className="text-xs p-2 bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-orange-500"
                >
                  <option value="minute">Minutes</option>
                  <option value="hour">Hours</option>
                  <option value="day">Days</option>
                </select>
              </div>
            </div>

            {/* Website */}
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70">
              <div className="flex items-center gap-2 mb-3">
                <Globe className="w-5 h-5 text-indigo-600" />
                <h3 className="font-bold text-sm text-slate-900">Website Timing</h3>
              </div>
              <p className="text-xs text-slate-500 mb-3">Default delay for website-form conversations</p>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  value={websiteDelayVal}
                  onChange={(e) => setWebsiteDelayVal(parseInt(e.target.value, 10) || 1)}
                  className="w-20 text-xs p-2 bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-orange-500"
                />
                <select
                  value={websiteDelayUnit}
                  onChange={(e) => setWebsiteDelayUnit(e.target.value as any)}
                  className="text-xs p-2 bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-orange-500"
                >
                  <option value="minute">Minutes</option>
                  <option value="hour">Hours</option>
                  <option value="day">Days</option>
                </select>
              </div>
            </div>
          </div>

          <hr className="border-slate-200 mb-6" />

          {/* Sequence & Limits */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div>
              <label className="block text-xs font-bold text-slate-900 mb-1">
                Maximum Follow-Up Attempts per Sequence
              </label>
              <p className="text-xs text-slate-500 mb-2">Default is 3 follow-ups before sequence completes</p>
              <input
                type="number"
                min="1"
                max="10"
                value={maxFollowUps}
                onChange={(e) => setMaxFollowUps(parseInt(e.target.value, 10) || 3)}
                className="w-32 text-xs p-2 bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-orange-500"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSavingConfig}
            className="ai-ops-primary-button"
          >
            {isSavingConfig ? 'Saving Settings...' : 'Save Global Channel Rules'}
          </button>
        </form>
      )}

      {/* TAB 3: AUDIT LOGS */}
      {activeTab === 'LOGS' && (
        <div className="af-panel-body ai-ops-activity-panel">
          <h2 className="text-sm font-bold text-slate-900 mb-3 font-display">Operational Activity Feed & Audit Trail</h2>
          <div className="space-y-3">
            {(dashboardData?.logs || []).length === 0 ? (
              <p className="text-xs text-slate-500 py-4">No activity logs recorded yet.</p>
            ) : (
              dashboardData?.logs.map((log: any) => (
                <div
                  key={log.id}
                  className="p-3 rounded-lg border border-slate-100 bg-slate-50/70 flex items-start gap-3"
                >
                  <div className="mt-0.5">
                    {log.type === 'SENT' && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                    {log.type === 'SCHEDULED' && <Clock className="w-4 h-4 text-amber-500" />}
                    {log.type === 'CANCELLED' && <XCircle className="w-4 h-4 text-slate-400" />}
                    {log.type === 'HUMAN_REVIEW' && <AlertTriangle className="w-4 h-4 text-purple-600" />}
                    {log.type === 'ENABLED' && <Zap className="w-4 h-4 text-orange-500" />}
                    {log.type === 'DISABLED' && <XCircle className="w-4 h-4 text-rose-500" />}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold text-slate-900">{log.title}</p>
                      <span className="text-[11px] text-slate-400">
                        {new Date(log.timestamp).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 mt-0.5">{log.description}</p>
                    {log.user && (
                      <p className="text-[11px] text-slate-400 mt-0.5 font-mono">Actor: {log.user}</p>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
          </section>
        </div>
      </main>
    </div>
  );
};
