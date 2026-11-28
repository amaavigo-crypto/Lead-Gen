/**
 * Authenticated data API for the browser (POST /api/db).
 *
 * The browser used to talk to Firestore directly and was protected by firestore.rules. MongoDB cannot be
 * reached from a browser, so those same reads and writes now go through this endpoint. The rules were
 * ported one-to-one into `tenantAccess()` below, and enforcement happens here on the server using ONLY the
 * verified session (tenant, uid, role) - nothing in the request body can widen access.
 *
 * Request:  { op: 'get' | 'list' | 'set' | 'update' | 'delete', path, ...args }
 * Response: JSON, see handleClientDataRequest().
 */
import { createHash } from 'node:crypto';
import { collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, query, where, orderBy, limit } from './adminFirestore.js';
import { db } from './adminFirestore.js';
import { DOCUMENT_ID_FIELD } from './mongo/firestoreCompat.js';
import type { TenantContext } from '../types/tenant.js';

export interface ClientDataResult {
  status: number;
  payload: any;
}

type Access = 'none' | 'read' | 'write';

const MAX_LIST_LIMIT = 50_000;
const MAX_WHERE_CLAUSES = 6;
const MAX_IN_VALUES = 100;
const ALLOWED_OPS = new Set(['==', '<', '<=', '>', '>=', 'in', 'array-contains']);
const FIELD_RE = /^(__name__|[A-Za-z0-9_\-]+(\.[A-Za-z0-9_\-]+)*)$/;

/** Tenant subcollections the browser may touch (everything else is server-only), from firestore.rules. */
const USER_RW = new Set([
  'contacts', 'leads', 'conversations', 'messages', 'campaigns', 'campaign_leads', 'campaign_runs',
  'campaign_send_history', 'email_templates', 'assets', 'knowledge_documents', 'bookings', 'lead_activities',
  'outbound_prospects', 'outbound_campaigns', 'processed_inbound_emails', 'website_lead_thankyou_history',
  'audit_logs',
]);
const USER_READ_ADMIN_WRITE = new Set(['settings', 'integrations', 'suppressions']);
const USER_READ_ONLY = new Set(['lead_databases', 'lead_database_entries', 'lead_database_imports']);
const ADMIN_READ_ONLY = new Set(['usage']);
// Denied outright: secrets, usage_daily, jobs, ai_test_feedback and any unknown subcollection.

const isAdmin = (ctx: TenantContext) => Boolean(ctx.isPlatformAdmin) || ctx.role === 'admin' || ctx.role === 'platformAdmin';

function tenantAccess(ctx: TenantContext, tenantId: string, sub: string): Access {
  if (!(ctx.isPlatformAdmin || ctx.tenantId === tenantId)) return 'none';
  if (USER_RW.has(sub)) return 'write';
  if (USER_READ_ADMIN_WRITE.has(sub)) return isAdmin(ctx) ? 'write' : 'read';
  if (USER_READ_ONLY.has(sub)) return 'read';
  if (ADMIN_READ_ONLY.has(sub)) return isAdmin(ctx) ? 'read' : 'none';
  return 'none';
}

function parsePath(raw: unknown): string[] | null {
  if (typeof raw !== 'string') return null;
  const parts = raw.split('/').filter((p) => p.length > 0);
  if (!parts.length || parts.length > 8) return null;
  for (const p of parts) {
    if (p.length > 1500 || p === '.' || p === '..' || /^__.*__$/.test(p) || p.includes('\u0000')) return null;
  }
  return parts;
}

const denied = (message = 'You do not have access to this data.'): ClientDataResult => ({
  status: 403,
  payload: { error: message, code: 'permission-denied' },
});
const bad = (message: string): ClientDataResult => ({ status: 400, payload: { error: message, code: 'invalid-argument' } });

/** Access the caller has to the document or collection at `parts`. */
function accessFor(ctx: TenantContext, parts: string[]): Access {
  if (parts[0] === 'tenants') {
    if (parts.length === 2) {
      // The workspace record itself: members read it, only the platform admin changes it.
      if (ctx.isPlatformAdmin) return 'write';
      return ctx.tenantId === parts[1] ? 'read' : 'none';
    }
    return tenantAccess(ctx, parts[1], parts[2]);
  }
  if (parts[0] === 'users') {
    // Own profile is readable; tenant admins manage their workspace's user profiles (checked per write).
    if (parts.length !== 2) return 'none';
    if (ctx.isPlatformAdmin) return 'write';
    return parts[1] === ctx.uid ? 'read' : isAdmin(ctx) ? 'write' : 'none';
  }
  return 'none';
}

/**
 * Record-level scope for CRM data. Firebase UID is the only security principal.
 * Legacy ownerId / assignedCaller values are display labels, never authorization principals.
 * Name-only legacy assignments remain admin-only until an admin reassigns them.
 */
const ASSIGNMENT_SCOPED = new Set([
  'leads', 'contacts', 'conversations', 'messages', 'lead_activities',
  'bookings', 'website_lead_thankyou_history', 'processed_inbound_emails',
]);

export interface MemberRecordScope {
  uid: string;
  leadIds: Set<string>;
  contactIds: Set<string>;
  conversationIds: Set<string>;
}

function scopedCollectionName(parts: string[]): string {
  if (parts[0] === 'tenants' && parts[2] === 'conversations' && parts[4] === 'messages') return 'messages';
  return parts[2] || '';
}

export async function loadMemberRecordScope(ctx: TenantContext, includeConversations: boolean): Promise<MemberRecordScope> {
  const leadSnap = await getDocs(query(
    collection(db, 'tenants', ctx.tenantId, 'leads'),
    where('assignedToUserId', '==', ctx.uid),
    limit(MAX_LIST_LIMIT),
  ));
  const leadIds = new Set<string>();
  const contactIds = new Set<string>();
  for (const row of leadSnap.docs) {
    const data: any = row.data() || {};
    leadIds.add(String(data.leadId || row.id));
    if (data.contactId) contactIds.add(String(data.contactId));
  }

  const conversationIds = new Set<string>();
  if (includeConversations) {
    const conversationSnap = await getDocs(query(
      collection(db, 'tenants', ctx.tenantId, 'conversations'),
      limit(MAX_LIST_LIMIT),
    ));
    for (const row of conversationSnap.docs) {
      const data: any = row.data() || {};
      const visible = data.leadId
        ? leadIds.has(String(data.leadId))
        : Boolean(data.contactId && contactIds.has(String(data.contactId)));
      if (visible) conversationIds.add(String(data.conversationId || row.id));
    }
  }
  return { uid: ctx.uid, leadIds, contactIds, conversationIds };
}

export function isVisibleAssignmentRecord(parts: string[], rowId: string, data: any, scope: MemberRecordScope): boolean {
  const sub = scopedCollectionName(parts);
  if (parts[0] === 'tenants' && parts[2] === 'conversations' && parts[4] === 'messages') {
    return scope.conversationIds.has(String(parts[3] || ''));
  }
  switch (sub) {
    case 'leads':
      return String(data?.assignedToUserId || '') === scope.uid;
    case 'contacts':
      return scope.contactIds.has(String(data?.contactId || rowId));
    case 'conversations':
      return data?.leadId
        ? scope.leadIds.has(String(data.leadId))
        : Boolean(data?.contactId && scope.contactIds.has(String(data.contactId)));
    case 'messages':
      return Boolean(data?.conversationId && scope.conversationIds.has(String(data.conversationId)));
    case 'lead_activities':
      return Boolean(data?.leadId && scope.leadIds.has(String(data.leadId)));
    case 'bookings':
      if (data?.leadId) return scope.leadIds.has(String(data.leadId));
      if (data?.conversationId) return scope.conversationIds.has(String(data.conversationId));
      return Boolean(data?.contactId && scope.contactIds.has(String(data.contactId)));
    case 'website_lead_thankyou_history':
    case 'processed_inbound_emails':
      if (data?.leadId) return scope.leadIds.has(String(data.leadId));
      if (data?.conversationId) return scope.conversationIds.has(String(data.conversationId));
      return Boolean(data?.contactId && scope.contactIds.has(String(data.contactId)));
    default:
      return true;
  }
}

function needsConversationScope(parts: string[]): boolean {
  return ['conversations', 'messages', 'bookings', 'website_lead_thankyou_history', 'processed_inbound_emails']
    .includes(scopedCollectionName(parts));
}

async function activeSameTenantAssignee(ctx: TenantContext, targetTenantId: string, uid: string): Promise<boolean> {
  if (!uid) return true;
  const candidates = await Promise.all([
    getDoc(doc(db, 'users', uid)).catch(() => null),
    getDoc(doc(db, 'app_users', uid)).catch(() => null),
  ]);
  return candidates.some((snap: any) => {
    if (!snap?.exists()) return false;
    const data: any = snap.data() || {};
    const role = String(data.role || data.appRole || '').toLowerCase();
    return String(data.tenantId || data.workspaceId || '') === targetTenantId
      && data.isActive !== false && data.active !== false
      && String(data.status || '').toLowerCase() !== 'disabled'
      && role !== 'admin' && role !== 'platformadmin';
  });
}

/** users/{uid}: writes by tenant admins are limited to their own workspace's profiles. */
async function userWriteAllowed(ctx: TenantContext, uid: string, data: any, deleting: boolean): Promise<boolean> {
  if (ctx.isPlatformAdmin) return true;
  if (!isAdmin(ctx)) return false;
  const existing = await getDoc(doc(db, 'users', uid));
  const existingTenant = existing.exists() ? String((existing.data() as any)?.tenantId || '') : '';
  if (existing.exists() && existingTenant !== ctx.tenantId) return false;
  if (deleting) return existing.exists();
  if (String(data?.tenantId || '') !== ctx.tenantId) return false;
  if (String(data?.role || '') === 'platformAdmin' || data?.platformAdmin) return false;
  return true;
}

function etagOf(payload: unknown): string {
  return createHash('sha1').update(JSON.stringify(payload)).digest('base64').slice(0, 20);
}

function cleanWheres(raw: unknown): { field: string; op: string; value: any }[] | string {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw) || raw.length > MAX_WHERE_CLAUSES) return 'Too many filters.';
  const out: { field: string; op: string; value: any }[] = [];
  for (const w of raw) {
    if (!w || typeof w.field !== 'string' || !FIELD_RE.test(w.field) || !ALLOWED_OPS.has(w.op)) return 'Unsupported filter.';
    if (w.op === 'in' && (!Array.isArray(w.value) || w.value.length > MAX_IN_VALUES)) return 'Invalid "in" filter.';
    out.push({ field: w.field, op: w.op, value: w.value });
  }
  return out;
}

export async function handleClientDataRequest(ctx: TenantContext, body: any): Promise<ClientDataResult> {
  const opName = String(body?.op || '');
  const parts = parsePath(body?.path);
  if (!parts) return bad('A valid path is required.');
  const access = accessFor(ctx, parts);
  if (access === 'none') return denied();

  try {
    const scopedSub = scopedCollectionName(parts);
    const memberScope = !isAdmin(ctx) && parts[0] === 'tenants' && ASSIGNMENT_SCOPED.has(scopedSub)
      ? await loadMemberRecordScope(ctx, needsConversationScope(parts))
      : null;

    if (opName === 'get') {
      if (parts.length % 2 !== 0) return bad('get needs a document path.');
      const snap = await getDoc(doc(db, ...(parts as [string, ...string[]])));
      if (snap.exists() && memberScope && !isVisibleAssignmentRecord(parts, parts[parts.length - 1], snap.data(), memberScope)) return denied();
      const payload = { exists: snap.exists(), data: snap.exists() ? snap.data() : null };
      const etag = etagOf(payload);
      if (body?.ifNoneMatch && body.ifNoneMatch === etag) return { status: 200, payload: { notModified: true, etag } };
      return { status: 200, payload: { ...payload, etag } };
    }

    if (opName === 'list') {
      if (parts.length % 2 !== 1) return bad('list needs a collection path.');
      const wheres = cleanWheres(body?.wheres);
      if (typeof wheres === 'string') return bad(wheres);
      const orders: { field: string; dir: 'asc' | 'desc' }[] = [];
      for (const o of Array.isArray(body?.orders) ? body.orders.slice(0, 3) : []) {
        if (!o || typeof o.field !== 'string' || !FIELD_RE.test(o.field)) return bad('Unsupported ordering.');
        orders.push({ field: o.field, dir: o.dir === 'desc' ? 'desc' : 'asc' });
      }
      const requested = Number(body?.limit);
      const cap = Number.isFinite(requested) && requested > 0 ? Math.min(Math.floor(requested), MAX_LIST_LIMIT) : MAX_LIST_LIMIT;

      const constraints: any[] = [
        ...wheres.map((w) => where(w.field, w.op, w.value)),
        ...(memberScope && scopedSub === 'leads' ? [where('assignedToUserId', '==', ctx.uid)] : []),
        ...orders.map((o) => orderBy(o.field, o.dir)),
        limit(memberScope ? MAX_LIST_LIMIT : cap),
      ];
      if (memberScope && parts[0] === 'tenants' && parts[2] === 'conversations' && parts[4] === 'messages'
        && !memberScope.conversationIds.has(String(parts[3] || ''))) return denied();
      const snap = await getDocs(query(collection(db, ...(parts as [string, ...string[]])), ...constraints));
      const rows = snap.docs
        .map((d) => ({ id: d.id, data: d.data() }))
        .filter((row) => !memberScope || isVisibleAssignmentRecord(parts, row.id, row.data, memberScope))
        .slice(0, cap);
      const payload = { docs: rows };
      const etag = etagOf(payload);
      if (body?.ifNoneMatch && body.ifNoneMatch === etag) return { status: 200, payload: { notModified: true, etag } };
      return { status: 200, payload: { ...payload, etag } };
    }

    if (opName === 'set' || opName === 'update' || opName === 'delete') {
      if (parts.length % 2 !== 0) return bad(`${opName} needs a document path.`);
      if (access !== 'write') return denied();
      let data = body?.data;
      if (opName === 'delete') data = {};
      if (opName !== 'delete' && (data === null || typeof data !== 'object' || Array.isArray(data))) {
        return bad('data must be an object.');
      }
      if (parts[0] === 'users' && !(await userWriteAllowed(ctx, parts[1], data, opName === 'delete'))) return denied();
      const ref = doc(db, ...(parts as [string, ...string[]]));
      if (memberScope && ASSIGNMENT_SCOPED.has(scopedSub)) {
        const existing = await getDoc(ref);
        const existingData: any = existing.exists() ? existing.data() : null;
        if (existingData && !isVisibleAssignmentRecord(parts, parts[parts.length - 1], existingData, memberScope)) return denied();
        if (scopedSub === 'leads') {
          if (existingData) {
            const protectedFields = ['assignedToUserId', 'assignedToName', 'assignedCaller', 'ownerId'];
            for (const field of protectedFields) {
              if (Object.prototype.hasOwnProperty.call(data, field)
                && String(data[field] ?? '') !== String(existingData[field] ?? '')) {
                return denied('Only a workspace admin can assign or reassign leads.');
              }
            }
            const preserved = { ...data };
            for (const field of protectedFields) {
              if (existingData[field] !== undefined) preserved[field] = existingData[field];
              else delete preserved[field];
            }
            data = preserved;
          } else if (opName === 'set') {
            data = {
              ...data,
              assignedToUserId: ctx.uid,
              assignedToName: ctx.email || 'Team member',
              assignedCaller: ctx.email ? ctx.email.split('@')[0] : 'Team member',
              ownerId: ctx.uid,
            };
          }
        } else if (!existingData) {
          const incomingVisible = isVisibleAssignmentRecord(parts, parts[parts.length - 1], data, memberScope);
          if (scopedSub !== 'contacts' && !incomingVisible) return denied();
          if (scopedSub === 'contacts' && opName !== 'set') return denied();
        }
      } else if (parts[0] === 'tenants' && parts[2] === 'leads' && isAdmin(ctx)
        && Object.prototype.hasOwnProperty.call(data, 'assignedToUserId')) {
        const assigneeId = String(data.assignedToUserId || '').trim();
        if (assigneeId && !(await activeSameTenantAssignee(ctx, parts[1], assigneeId))) {
          return denied('The selected assignee must be an active user in this workspace.');
        }
        if (!assigneeId) data = { ...data, assignedToUserId: null, assignedToName: 'Unassigned' };
      }
      if (opName === 'set') await setDoc(ref, data, body?.merge ? { merge: true } : undefined);
      else if (opName === 'update') await updateDoc(ref, data);
      else await deleteDoc(ref);
      return { status: 200, payload: { success: true } };
    }

    return bad('Unknown operation.');
  } catch (err: any) {
    if (err?.code === 5) return { status: 404, payload: { error: 'Document not found.', code: 'not-found' } };
    console.error('[ClientDb] request failed:', opName, parts.join('/'), err?.message || err);
    return { status: 500, payload: { error: 'Data request failed.', code: 'internal' } };
  }
}

export { DOCUMENT_ID_FIELD };
