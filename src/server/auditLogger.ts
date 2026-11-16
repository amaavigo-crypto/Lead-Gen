import { setDoc } from './adminFirestore.js';
import { sanitizeForFirestore } from './firestoreUtils.js';
import { tenantRepo } from './tenantRepo.js';
import type { TenantContext } from '../types/tenant.js';

export type ServerAuditModule = 'CAMPAIGNS' | 'CRM' | 'INBOX' | 'KNOWLEDGE' | 'SETTINGS' | 'AUTH' | 'SCHEDULING' | 'AI_ENGINE' | 'WHATSAPP' | 'EMAIL_DESIGN' | 'DATABASE' | 'SYSTEM';
export type ServerAuditSeverity = 'INFO' | 'WARNING' | 'CRITICAL' | 'SECURITY';

export interface ServerAuditEntry {
  action: string;
  module: ServerAuditModule;
  description: string;
  /** Caller-supplied severity is ignored; classification belongs to the server. */
  severity?: ServerAuditSeverity;
  target?: { type: string; id: string; name?: string };
  metadata?: Record<string, unknown>;
  actor?: { userId?: string; name?: string; email?: string; role?: string };
}

const SENSITIVE_METADATA_KEY = /(password|passcode|token|secret|api.?key|authorization|cookie|credential|otp|private.?key|webhook.?secret|signature)/i;
const DISPLAY_METADATA_KEYS = new Set([
  'triggeredBy', 'status', 'channel', 'result', 'itemCount', 'reason', 'source',
  'authMethod', 'confidenceScore', 'knowledgeSourcesUsed', 'category', 'version',
  'changedFields', 'fromStatus', 'toStatus', 'provider', 'operation', 'deliveryStatus',
  'triggerKeyword', 'handoffReason',
]);

/** Redact credential-like key/value pairs from operator-facing text. */
export function sanitizeAuditText(value: unknown, maxLength = 1000): string {
  return String(value || '')
    .replace(/(Bearer[ ]+)[A-Za-z0-9._~+/=-]+/gi, '$1[REDACTED]')
    .replace(/(password|passcode|access[_-]?token|refresh[_-]?token|api[_-]?key|client[_-]?secret|authorization|cookie|webhook[_-]?secret)([ ]*[:=][ ]*|[ ]+)([^ ,;]+)/gi, '$1$2[REDACTED]')
    .slice(0, maxLength);
}

function sanitizeValue(value: unknown, depth = 0): unknown {
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string') return value.slice(0, 1000);
  if (depth >= 4) return undefined;
  if (Array.isArray(value)) {
    return value.slice(0, 30).map((item) => sanitizeValue(item, depth + 1)).filter((item) => item !== undefined);
  }
  if (typeof value === 'object') {
    const safe: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>).slice(0, 40)) {
      if (SENSITIVE_METADATA_KEY.test(key)) continue;
      const cleaned = sanitizeValue(child, depth + 1);
      if (cleaned !== undefined) safe[key.slice(0, 80)] = cleaned;
    }
    return safe;
  }
  return undefined;
}

export function sanitizeAuditMetadata(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return (sanitizeValue(value) as Record<string, unknown>) || {};
}

/** Expose only allow-listed, low-risk metadata fields to workspace operators. */
export function sanitizeAuditMetadataForDisplay(value: unknown): Record<string, unknown> {
  const safe = sanitizeAuditMetadata(value);
  const visible: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(safe)) {
    if (!DISPLAY_METADATA_KEYS.has(key)) continue;
    if (child === null || ['number', 'boolean'].includes(typeof child)) visible[key] = child;
    else if (typeof child === 'string') visible[key] = sanitizeAuditText(child, 500);
    else if (Array.isArray(child)) {
      const values = child.filter((item) => ['string', 'number', 'boolean'].includes(typeof item)).slice(0, 8).map((item) => typeof item === 'string' ? sanitizeAuditText(item, 120) : item);
      if (values.length) visible[key] = values;
    }
    if (Object.keys(visible).length >= 12) break;
  }
  return visible;
}

/** Convert opaque internal action identifiers to safe, readable labels. */
export function auditActionLabel(action: string): string {
  const raw = String(action || 'GENERAL_ACTION').trim();
  if (/^API_DELETE_AST_/i.test(raw) || /^(?:API_)?DELETE_(?:AST|ASSET)(?:_|$)/i.test(raw)) return 'Asset deleted';
  if (/^API_DELETE_/i.test(raw)) return 'Record deleted';
  const readable = raw
    .replace(/^API_/i, '')
    .replace(/_[0-9]{10,}(?=_|$)/g, '')
    .replace(/_[A-Z0-9]{8,}$/i, '')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/(^| )[a-z]/g, (part) => part.toUpperCase())
    .slice(0, 80);
  return readable || 'System activity';
}

/** INFO = routine, WARNING = operational risk, CRITICAL = destructive, SECURITY = access incidents. */
export function classifyAuditSeverity(action: string, module: ServerAuditModule | string, description = ''): ServerAuditSeverity {
  const normalized = `${action || ''} ${description || ''}`.toUpperCase();
  if (/(WORKSPACE|TENANT|ORGANIZATION|ACCOUNT)_(DELETE|PURGE|DESTROY)|(?:BULK|MASS)_(DELETE|PURGE|REMOVE)|(?:DATABASE|DATA)_(DROP|PURGE)|PERMANENT_DELETE/.test(normalized)) return 'CRITICAL';
  if (/(UNAUTHORIZED|FORBIDDEN|ACCESS_DENIED|LOGIN_FAILED|AUTH_FAILED|TOKEN_INVALID|TOKEN_REVOKED|BRUTE_FORCE|SUSPICIOUS|CREDENTIAL|PERMISSION_DENIED|MFA_FAILED|SESSION_HIJACK)/.test(normalized)) return 'SECURITY';
  if (module === 'AUTH' && /(FAIL|DENIED|INVALID|REVOKED|LOCKED|SUSPICIOUS)/.test(normalized)) return 'SECURITY';
  if (/(DELETE|REMOVE|REVOKE|DISCONNECT|CONFIG(?:URATION)?_?(?:UPDATE|CHANGE)|PERMISSION|ROLE_CHANGE|BULK_UPDATE|DATA_EXPORT)/.test(normalized)) return 'WARNING';
  return 'INFO';
}

/** Persist tenant-scoped events. Audit failures must never break the primary workflow. */
export async function writeTenantAuditEvent(ctx: TenantContext, entry: ServerAuditEntry): Promise<void> {
  if (!ctx?.tenantId) return;
  const now = new Date().toISOString();
  const id = 'audit-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  const actor = entry.actor || {
    userId: ctx.uid || 'system',
    name: (ctx.email || '').split('@')[0] || 'System Automation',
    email: ctx.email || 'system@workspace.local',
    role: String(ctx.role || 'admin').toUpperCase(),
  };
  const record = {
    id, tenantId: ctx.tenantId, timestamp: now,
    action: sanitizeAuditText(entry.action || 'GENERAL_ACTION', 120),
    module: entry.module,
    severity: classifyAuditSeverity(entry.action, entry.module, entry.description),
    description: sanitizeAuditText(entry.description || 'System event', 1000),
    actor,
    target: entry.target ? {
      type: sanitizeAuditText(entry.target.type || 'Record', 60),
      id: sanitizeAuditText(entry.target.id || '', 200),
      name: sanitizeAuditText(entry.target.name || '', 160),
    } : null,
    metadata: sanitizeAuditMetadata(entry.metadata),
  };
  try {
    await setDoc(tenantRepo(ctx).auditLogDoc(id), sanitizeForFirestore(record) as any, { merge: false });
  } catch (error) {
    console.error('[AuditLogger] Failed to persist tenant audit event:', { tenantId: ctx.tenantId, action: record.action, error });
  }
}
