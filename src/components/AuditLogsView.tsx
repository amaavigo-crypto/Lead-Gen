import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  ShieldCheck,
  Search,
  Filter,
  Download,
  Clock,
  User,
  Activity,
  AlertTriangle,
  Info,
  ShieldAlert,
  FileText,
  Calendar,
  RefreshCw,
  Plus,
  Eye,
  CheckCircle2,
  X,
  Database,
  Layers,
  Send,
  Users,
  Settings as SettingsIcon,
  BookOpen,
  Sparkles,
  ChevronRight,
  Terminal,
} from 'lucide-react';
import { AuditLog, AuditModule, AuditSeverity } from '../types';
import { logAuditEvent } from '../services/auditService';

interface AuditLogsViewProps {
  tenantId?: string;
  currentUserEmail?: string;
  canCreateTestLog?: boolean;
}

export const AuditLogsView: React.FC<AuditLogsViewProps> = ({
  tenantId = 'umrah360',
  canCreateTestLog = false,
}) => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [allAuditCount, setAllAuditCount] = useState<number>(0);
  const [criticalOrSecurityCount, setCriticalOrSecurityCount] = useState<number>(0);
  const [warningCount, setWarningCount] = useState<number>(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [pageCursors, setPageCursors] = useState<Array<string | null>>([null]);
  const [pageIndex, setPageIndex] = useState<number>(0);
  const requestSequence = useRef(0);

  // Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedModule, setSelectedModule] = useState<AuditModule | 'ALL'>('ALL');
  const [selectedSeverity, setSelectedSeverity] = useState<AuditSeverity | 'ALL'>('ALL');
  const [dateRange, setDateRange] = useState<'ALL' | 'TODAY' | '7_DAYS' | '30_DAYS'>('ALL');

  // Inspection modal
  const [inspectedLog, setInspectedLog] = useState<AuditLog | null>(null);

  // Test log event state
  const [isTestLogModalOpen, setIsTestLogModalOpen] = useState<boolean>(false);
  const [testAction, setTestAction] = useState<string>('MANUAL_AUDIT_CHECK');
  const [testModule, setTestModule] = useState<AuditModule>('SETTINGS');
  const [testDescription, setTestDescription] = useState<string>('Manual audit inspection performed by workspace administrator.');
  const [isSubmittingTest, setIsSubmittingTest] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const buildAuditLogsUrl = (cursor: string | null = null, includeMetrics = false) => {
    const params = new URLSearchParams({ tenantId, limit: '25' });
    if (searchQuery.trim()) params.set('search', searchQuery.trim().slice(0, 120));
    if (selectedModule !== 'ALL') params.set('module', selectedModule);
    if (selectedSeverity !== 'ALL') params.set('severity', selectedSeverity);
    if (dateRange !== 'ALL') params.set('dateRange', dateRange);
    if (cursor) params.set('cursor', cursor);
    if (includeMetrics) params.set('metrics', '1');
    return `/api/audit-logs?${params.toString()}`;
  };

  // The authenticated server returns one cursor page; the browser never downloads the full collection.
  const loadAuditLogs = async (cursor: string | null = null) => {
    const sequence = ++requestSequence.current;
    setRefreshing(true);
    setLoading(true);
    setLoadError(null);
    try {
      const response = await fetch(buildAuditLogsUrl(cursor, cursor === null), { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.success !== true) throw new Error(data?.error || `Audit API returned HTTP ${response.status}`);
      if (sequence !== requestSequence.current) return;
      setLogs(Array.isArray(data.logs) ? data.logs : []);
      setTotalCount(Number(data.totalCount || 0));
      setNextCursor(typeof data.nextCursor === 'string' ? data.nextCursor : null);
      if (data.metrics) {
        setAllAuditCount(Number(data.metrics.total || 0));
        setCriticalOrSecurityCount(Number(data.metrics.criticalOrSecurity || 0));
        setWarningCount(Number(data.metrics.warning || 0));
      }
    } catch (error: any) {
      if (sequence !== requestSequence.current) return;
      setLoadError(error?.message || 'Could not load audit logs.');
      setLogs([]);
      setTotalCount(0);
      setNextCursor(null);
    } finally {
      if (sequence === requestSequence.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  };

  useEffect(() => {
    setPageCursors([null]);
    setPageIndex(0);
    const timer = setTimeout(() => { void loadAuditLogs(null); }, 250);
    return () => clearTimeout(timer);
  }, [tenantId, searchQuery, selectedModule, selectedSeverity, dateRange]);

  useEffect(() => {
    const timer = setInterval(() => { void loadAuditLogs(pageCursors[pageIndex] || null); }, 30000);
    return () => clearInterval(timer);
  }, [tenantId, searchQuery, selectedModule, selectedSeverity, dateRange, pageCursors, pageIndex]);

  // Test events use the same authenticated, server-classified write path.
  const handleCreateTestLog = async () => {
    if (!canCreateTestLog || !testDescription.trim()) return;
    setIsSubmittingTest(true);
    try {
      await logAuditEvent(tenantId, {
        action: testAction,
        module: testModule,
        description: testDescription.trim(),
        target: { type: 'System', id: 'sys-audit-test', name: 'Audit Log Verification' },
        metadata: { triggeredBy: 'MANUAL_UI_TEST' },
      });
      setIsTestLogModalOpen(false);
      setPageCursors([null]);
      setPageIndex(0);
      void loadAuditLogs(null);
      setToastMessage('New audit event successfully recorded.');
      setTimeout(() => setToastMessage(null), 4000);
    } catch (error: any) {
      alert(`Error recording audit log: ${error?.message || error}`);
    } finally {
      setIsSubmittingTest(false);
    }
  };

  const filteredLogs = logs;


  const metrics = useMemo(() => ({
    total: allAuditCount,
    criticalOrSecurity: criticalOrSecurityCount,
    warning: warningCount,
    uniqueActors: new Set(logs.map((log) => log.actor?.email || log.actor?.name).filter(Boolean)).size,
  }), [allAuditCount, criticalOrSecurityCount, warningCount, logs]);

  // Export every record matching the active filters, not only the current 25-row page.
  const handleExportCsv = async () => {
    if (totalCount === 0 || isExporting) return;
    setIsExporting(true);
    try {
      const allMatchingLogs: AuditLog[] = [];
      let cursor: string | null = null;
      let pageCount = 0;
      do {
        const response = await fetch(buildAuditLogsUrl(cursor), { cache: 'no-store' });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data?.success !== true) throw new Error(data?.error || 'Could not export audit logs.');
        if (Array.isArray(data.logs)) allMatchingLogs.push(...data.logs);
        cursor = typeof data.nextCursor === 'string' ? data.nextCursor : null;
        pageCount += 1;
        if (pageCount >= 1000 && cursor) throw new Error('Export is limited to 25,000 matching records. Apply a date filter and try again.');
      } while (cursor);

      if (!allMatchingLogs.length) return;
      const esc = (value: unknown) => {
        const raw = String(value ?? '');
        const safe = /^[=+@-]/.test(raw) ? `'${raw}` : raw;
        return `"${safe.replace(/"/g, '""')}"`;
      };
      const headers = ['Timestamp', 'Action', 'Module', 'Severity', 'Actor Name', 'Actor Email', 'Description', 'Target Type', 'Target Name'];
      const rows = [
        headers.join(','),
        ...allMatchingLogs.map((log) => [
          esc(log.timestamp), esc(log.action), esc(log.module), esc(log.severity),
          esc(log.actor?.name), esc(log.actor?.email), esc(log.description),
          esc(log.target?.type || ''), esc(log.target?.name || ''),
        ].join(',')),
      ];
      const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error: any) {
      alert(error?.message || 'Could not export audit logs.');
    } finally {
      setIsExporting(false);
    }
  };

  const getModuleIcon = (mod: AuditModule) => {
    switch (mod) {
      case 'CAMPAIGNS': return <Send className="w-3.5 h-3.5 text-orange-500" />;
      case 'CRM': return <Users className="w-3.5 h-3.5 text-emerald-500" />;
      case 'INBOX': return <Layers className="w-3.5 h-3.5 text-sky-500" />;
      case 'KNOWLEDGE': return <BookOpen className="w-3.5 h-3.5 text-amber-500" />;
      case 'SETTINGS': return <SettingsIcon className="w-3.5 h-3.5 text-slate-500" />;
      case 'AUTH': return <ShieldCheck className="w-3.5 h-3.5 text-indigo-500" />;
      case 'AI_ENGINE': return <Sparkles className="w-3.5 h-3.5 text-purple-500" />;
      default: return <Activity className="w-3.5 h-3.5 text-slate-400" />;
    }
  };

  const getSeverityBadge = (severity: AuditSeverity) => {
    switch (severity) {
      case 'CRITICAL':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-md">
            <AlertTriangle className="w-3 h-3 text-rose-600" />
            <span>CRITICAL</span>
          </span>
        );
      case 'SECURITY':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-purple-700 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-md">
            <ShieldAlert className="w-3 h-3 text-purple-600" />
            <span>SECURITY</span>
          </span>
        );
      case 'WARNING':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">
            <AlertTriangle className="w-3 h-3 text-amber-600" />
            <span>WARNING</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md">
            <Info className="w-3 h-3 text-slate-400" />
            <span>INFO</span>
          </span>
        );
    }
  };

  const getSafeMetadataEntries = (metadata?: Record<string, any>) => {
    const visibleKeys = new Set(['triggeredBy', 'status', 'channel', 'result', 'itemCount', 'reason', 'source', 'authMethod', 'confidenceScore', 'knowledgeSourcesUsed', 'category', 'version', 'changedFields', 'fromStatus', 'toStatus', 'provider', 'operation', 'deliveryStatus', 'triggerKeyword', 'handoffReason']);
    return Object.entries(metadata || {}).filter(([key]) => visibleKeys.has(key)).slice(0, 12).map(([key, value]) => ({
      label: key.replace(/([A-Z])/g, ' $1').replace(/^./, (letter) => letter.toUpperCase()),
      value: Array.isArray(value) ? value.filter((item) => ['string', 'number', 'boolean'].includes(typeof item)).slice(0, 8).join(', ') : String(value ?? ''),
    })).filter((item) => item.value.length > 0 && item.value.length <= 500);
  };

  const formatRelativeTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      const diffMs = Date.now() - date.getTime();
      const diffMins = Math.floor(diffMs / (60 * 1000));
      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours}h ago`;
      const diffDays = Math.floor(diffHours / 24);
      if (diffDays < 7) return `${diffDays}d ago`;
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto font-sans">
      
      {/* Toast Notification */}
      {toastMessage && (
        <div className="p-3.5 bg-emerald-500 text-white rounded-xl text-xs font-semibold flex items-center justify-between shadow-lg animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-white shrink-0" />
            <span>{toastMessage}</span>
          </div>
          <button onClick={() => setToastMessage(null)} className="p-1 hover:bg-white/20 rounded-md">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* HEADER BAR */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-slate-900 text-white rounded-xl">
              <ShieldCheck className="w-5 h-5 text-orange-400" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-lg font-bold text-slate-900">System Audit Trail & Compliance Logs</h2>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-orange-50 text-orange-700 border border-orange-200">
                  {totalCount} Events Logged
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Server-verified audit history for workspace activity, operational changes, and security events.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            onClick={() => loadAuditLogs(pageCursors[pageIndex] || null)}
            disabled={refreshing}
            className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 border border-slate-200 rounded-xl transition text-xs font-semibold flex items-center gap-1.5"
            title="Refresh Audit Logs"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-orange-500' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          <button
            onClick={handleExportCsv}
            disabled={totalCount === 0 || isExporting}
            className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-800 border border-slate-200 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 shadow-2xs"
            title="Export CSV for compliance audits"
          >
            <Download className="w-4 h-4 text-slate-600" />
            <span>{isExporting ? 'Exporting...' : 'Export CSV'}</span>
          </button>

          {canCreateTestLog && (
          <button
            onClick={() => setIsTestLogModalOpen(true)}
            className="px-3.5 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-xs font-semibold transition flex items-center gap-1.5 shadow-2xs"
          >
            <Plus className="w-4 h-4" />
            <span>Log Audit Event</span>
          </button>
          )}
        </div>
      </div>

      {/* METRIC KPI SUMMARY CARDS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>Total Audit Records</span>
            <Database className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-extrabold text-slate-900 tracking-tight font-mono">
            {metrics.total}
          </div>
          <div className="text-[11px] text-slate-400 flex items-center gap-1">
            <span>All recorded events in this workspace</span>
          </div>
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>Security & Critical Events</span>
            <ShieldAlert className="w-4 h-4 text-purple-500" />
          </div>
          <div className="text-2xl font-extrabold text-purple-700 tracking-tight font-mono">
            {metrics.criticalOrSecurity}
          </div>
          <div className="text-[11px] text-purple-600 font-medium flex items-center gap-1">
            <span>High-priority security triggers</span>
          </div>
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>Warning Alerts</span>
            <AlertTriangle className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-extrabold text-amber-600 tracking-tight font-mono">
            {metrics.warning}
          </div>
          <div className="text-[11px] text-amber-700 font-medium">
            <span>Server-classified operational warnings</span>
          </div>
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>Active Logged Users</span>
            <User className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-extrabold text-emerald-700 tracking-tight font-mono">
            {metrics.uniqueActors}
          </div>
          <div className="text-[11px] text-slate-500">
            <span>Users represented on this page</span>
          </div>
        </div>
      </div>

      {/* SEARCH AND MULTI-FILTER CONTROL BAR */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
        {/* Search Bar */}
        <div className="flex items-center gap-3 bg-slate-50 p-2.5 rounded-xl border border-slate-200 focus-within:border-orange-500 transition">
          <Search className="w-4 h-4 text-slate-400 ml-1 shrink-0" />
          <input
            type="text"
            placeholder="Search all audit records by description, action, user email, or target..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-transparent border-none text-xs text-slate-800 placeholder-slate-400 focus:outline-none flex-1 font-sans"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="text-slate-400 hover:text-slate-600 text-xs px-2 font-medium"
            >
              Clear
            </button>
          )}
        </div>

        {/* Filter Controls Row */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs pt-1 border-t border-slate-100">
          
          {/* Module Filter Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto scrollbar-none py-0.5 max-w-full">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mr-1 shrink-0">Module:</span>
            {(['ALL', 'CAMPAIGNS', 'CRM', 'INBOX', 'KNOWLEDGE', 'SETTINGS', 'AUTH', 'AI_ENGINE'] as const).map((mod) => (
              <button
                key={mod}
                onClick={() => setSelectedModule(mod)}
                className={`px-2.5 py-1 rounded-lg font-semibold transition shrink-0 flex items-center gap-1.5 ${
                  selectedModule === mod
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-slate-100/80 text-slate-600 hover:bg-slate-200/80 hover:text-slate-900'
                }`}
              >
                {mod !== 'ALL' && getModuleIcon(mod as AuditModule)}
                <span>{mod === 'ALL' ? 'All Modules' : mod}</span>
              </button>
            ))}
          </div>

          {/* Severity & Date Filters */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Severity Filter */}
            <select
              value={selectedSeverity}
              onChange={(e) => setSelectedSeverity(e.target.value as any)}
              className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 focus:outline-none focus:border-orange-500"
            >
              <option value="ALL">All Severities</option>
              <option value="INFO">INFO Only</option>
              <option value="WARNING">WARNING Only</option>
              <option value="CRITICAL">CRITICAL Only</option>
              <option value="SECURITY">SECURITY Only</option>
            </select>

            {/* Date Range Filter */}
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value as any)}
              className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 focus:outline-none focus:border-orange-500"
            >
              <option value="ALL">All Time</option>
              <option value="TODAY">Last 24 Hours</option>
              <option value="7_DAYS">Last 7 Days</option>
              <option value="30_DAYS">Last 30 Days</option>
            </select>
          </div>

        </div>
      </div>

      {/* AUDIT LOGS TABLE */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase font-semibold text-[10px] tracking-wider">
              <tr>
                <th className="py-3.5 px-4">Time</th>
                <th className="py-3.5 px-4">Actor / Identity</th>
                <th className="py-3.5 px-4">Module & Action</th>
                <th className="py-3.5 px-4">Audit Description</th>
                <th className="py-3.5 px-4">Severity</th>
                <th className="py-3.5 px-4 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin text-orange-500 mx-auto mb-2" />
                    <span>Loading audit records...</span>
                  </td>
                </tr>
              ) : loadError ? (
                <tr><td colSpan={6} className="py-12 text-center text-rose-600">{loadError}</td></tr>
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400 space-y-2">
                    <ShieldCheck className="w-8 h-8 text-slate-300 mx-auto" />
                    <p className="text-sm font-semibold text-slate-700">No audit records match your filters.</p>
                    <p className="text-xs text-slate-500 max-w-sm mx-auto">
                      Try clearing search terms or selecting 'All Modules' to view historical events.
                    </p>
                    <button
                      onClick={() => {
                        setSearchQuery('');
                        setSelectedModule('ALL');
                        setSelectedSeverity('ALL');
                        setDateRange('ALL');
                      }}
                      className="mt-2 inline-flex items-center gap-1 px-3 py-1.5 bg-orange-500 text-white rounded-lg text-xs font-semibold shadow-xs"
                    >
                      Reset All Filters
                    </button>
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => {
                  return (
                    <tr
                      key={log.id}
                      onClick={() => setInspectedLog(log)}
                      className="hover:bg-slate-50/80 transition cursor-pointer group"
                    >
                      {/* Time & ID */}
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                          <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                          <span>{formatRelativeTime(log.timestamp)}</span>
                        </div>
                      </td>

                      {/* Actor */}
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-800 flex items-center gap-1.5">
                          <span>{log.actor?.name || 'System'}</span>
                          <span className="text-[9px] px-1.5 py-0.2 bg-slate-100 text-slate-600 rounded font-mono">
                            {log.actor?.role || 'ADMIN'}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono">
                          {log.actor?.email || '—'}
                        </div>
                      </td>

                      {/* Module & Action */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5">
                          {getModuleIcon(log.module)}
                          <span className="font-bold text-slate-900 text-xs">
                            {log.module}
                          </span>
                        </div>
                        <div className="text-[10px] font-mono text-orange-700 bg-orange-50/80 px-1.5 py-0.5 rounded border border-orange-100 inline-block mt-1">
                          {log.action}
                        </div>
                      </td>

                      {/* Description & Target */}
                      <td className="py-3.5 px-4 max-w-md">
                        <p className="text-slate-800 text-xs leading-relaxed font-sans line-clamp-2">
                          {log.description}
                        </p>
                        {log.target && (
                          <div className="flex items-center gap-1 text-[11px] text-slate-500 mt-1">
                            <span className="font-semibold text-slate-600">Target:</span>
                            <span className="font-mono bg-slate-100 px-1.5 py-0.2 rounded text-[10px]">
                              {log.target.type}: {log.target.name}
                            </span>
                          </div>
                        )}
                      </td>

                      {/* Severity */}
                      <td className="py-3.5 px-4">
                        {getSeverityBadge(log.severity)}
                      </td>

                      {/* Details Icon Action */}
                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setInspectedLog(log);
                          }}
                          className="p-1.5 text-slate-400 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition"
                          title="View safe audit details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Table Footer */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
          <span>
            Showing <strong className="text-slate-800">{totalCount === 0 ? 0 : pageIndex * 25 + 1}-{Math.min(pageIndex * 25 + filteredLogs.length, totalCount)}</strong> of {totalCount} matching audit entries
          </span>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-500">Page {pageIndex + 1}</span>
            <button type="button" onClick={() => {
              if (pageIndex <= 0) return;
              const previousIndex = pageIndex - 1;
              const previousCursor = pageCursors[previousIndex] || null;
              setPageIndex(previousIndex);
              void loadAuditLogs(previousCursor);
            }} disabled={pageIndex === 0 || loading} className="px-3 py-1.5 border border-slate-200 rounded-lg bg-white text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100">Previous</button>
            <button type="button" onClick={() => {
              if (!nextCursor) return;
              const nextHistory = [...pageCursors.slice(0, pageIndex + 1), nextCursor];
              setPageCursors(nextHistory);
              setPageIndex(pageIndex + 1);
              void loadAuditLogs(nextCursor);
            }} disabled={!nextCursor || loading} className="px-3 py-1.5 border border-slate-200 rounded-lg bg-white text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100">Next</button>
          </div>
        </div>
      </div>

      {/* INSPECTED LOG METADATA MODAL */}
      {inspectedLog && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl text-slate-900 animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-slate-900 text-white rounded-xl">
                  <Terminal className="w-4 h-4 text-orange-400" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <span>Audit Log Event Details</span>
                    {getSeverityBadge(inspectedLog.severity)}
                  </h3>
                  <p className="text-xs text-slate-500">Operator-safe event details</p>
                </div>
              </div>
              <button
                onClick={() => setInspectedLog(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200/60 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5 text-xs">
              {/* Event Overview Box */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <div className="flex items-center justify-between text-slate-500 text-[11px]">
                  <span>Action: <strong className="text-slate-800">{inspectedLog.action}</strong></span>
                  <span>{new Date(inspectedLog.timestamp).toLocaleString()}</span>
                </div>
                <p className="text-sm font-semibold text-slate-900 leading-relaxed">
                  {inspectedLog.description}
                </p>
              </div>

              {/* Actor & Module Grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-white border border-slate-200 rounded-xl space-y-1 shadow-2xs">
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Actor / User:</span>
                  <div className="font-bold text-slate-900 text-xs">{inspectedLog.actor?.name || 'System'}</div>
                  <div className="text-[11px] text-slate-500 font-mono">{inspectedLog.actor?.email || '—'}</div>
                  <div className="text-[10px] text-slate-400 pt-1">
                    Role: <span className="font-semibold text-slate-700">{inspectedLog.actor?.role}</span>
                  </div>
                </div>

                <div className="p-3 bg-white border border-slate-200 rounded-xl space-y-1 shadow-2xs">
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Target Entity:</span>
                  <div className="font-bold text-slate-900 text-xs">
                    {inspectedLog.target?.type ? `${inspectedLog.target.type}: ${inspectedLog.target.name}` : 'N/A'}
                  </div>
                  <div className="text-[10px] text-slate-400 pt-1">
                    Module: <span className="font-semibold text-orange-600">{inspectedLog.module}</span>
                  </div>
                </div>
              </div>

              {/* Only allow-listed technical details are visible to workspace operators. */}
              <div className="space-y-2">
                <div className="text-[11px] font-semibold text-slate-700">Additional details</div>
                {getSafeMetadataEntries(inspectedLog.metadata).length > 0 ? (
                  <div className="grid grid-cols-2 gap-2">
                    {getSafeMetadataEntries(inspectedLog.metadata).map((item) => (
                      <div key={item.label} className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                        <div className="text-[10px] uppercase tracking-wider font-bold text-slate-400">{item.label}</div>
                        <div className="mt-1 text-xs text-slate-700 break-words">{item.value}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 p-3 bg-slate-50 border border-slate-200 rounded-lg">No additional operator-safe details are available for this event.</p>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end">
              <button
                onClick={() => setInspectedLog(null)}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold shadow-2xs transition"
              >
                Close Audit Record
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CREATE TEST AUDIT LOG MODAL */}
      {canCreateTestLog && isTestLogModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg p-6 space-y-4 shadow-2xl text-slate-900 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-orange-50 border border-orange-200 rounded-xl text-orange-600">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Record Audit Event</h3>
                  <p className="text-xs text-slate-500">Manually trigger a system audit event for verification</p>
                </div>
              </div>
              <button onClick={() => setIsTestLogModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 uppercase tracking-wider mb-1">
                  Action Name *
                </label>
                <input
                  type="text"
                  value={testAction}
                  onChange={(e) => setTestAction(e.target.value)}
                  placeholder="e.g. MANUAL_AUDIT_CHECK"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono text-slate-800 focus:outline-none focus:border-orange-500"
                />
              </div>

              <div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 uppercase tracking-wider mb-1">
                    Target Module *
                  </label>
                  <select
                    value={testModule}
                    onChange={(e) => setTestModule(e.target.value as AuditModule)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:border-orange-500"
                  >
                    <option value="SETTINGS">SETTINGS</option>
                    <option value="CAMPAIGNS">CAMPAIGNS</option>
                    <option value="CRM">CRM</option>
                    <option value="INBOX">INBOX</option>
                    <option value="KNOWLEDGE">KNOWLEDGE</option>
                    <option value="AUTH">AUTH</option>
                    <option value="AI_ENGINE">AI_ENGINE</option>
                  </select>
                </div>

              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 uppercase tracking-wider mb-1">
                  Audit Description *
                </label>
                <textarea
                  rows={3}
                  value={testDescription}
                  onChange={(e) => setTestDescription(e.target.value)}
                  placeholder="Provide detailed prose describing what occurred..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:border-orange-500 font-sans"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsTestLogModalOpen(false)}
                className="px-4 py-2 text-xs text-slate-600 hover:text-slate-900 font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateTestLog}
                disabled={isSubmittingTest || !testDescription.trim()}
                className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-xs font-semibold transition flex items-center gap-1.5 disabled:opacity-50 shadow-2xs"
              >
                {isSubmittingTest ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Writing to DB...</span>
                  </>
                ) : (
                  <span>Commit Audit Log</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default AuditLogsView;
