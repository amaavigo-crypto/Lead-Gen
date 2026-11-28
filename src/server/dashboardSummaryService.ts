import { getDoc, getDocs, query, where, countDocs, sumDocs } from './adminFirestore.js';
import { tenantRepo } from './tenantRepo.js';
import { getTenantBrand } from './brandService.js';
import type { TenantContext } from '../types/tenant.js';

/**
 * Every number on the workspace dashboard, computed from the database in one place.
 *
 * Lead metrics use the same rules as the CRM screen (CrmPipeline.tsx -> crmSummary), so the two
 * screens always agree:
 *  - a lead is visible unless it is an outbound campaign lead that has not replied yet;
 *  - "Demo booked" = visible leads whose status is DEMO_BOOKED.
 * Upcoming calendar bookings are reported separately and never added to the CRM demo count.
 */

export interface DashboardRecentLead {
  leadId: string;
  name: string;
  subline: string;
  status: string;
  updatedAt: string | null;
  leadScore: number;
}

export interface DashboardSummary {
  // Leads (CRM)
  totalLeads: number;
  demosBooked: number;
  followUpsDue: number;
  pipeline: Array<{ status: string; count: number }>;
  monthlyNewLeads: Array<{ key: string; label: string; count: number }>;
  recentLeads: DashboardRecentLead[];
  // Calendar
  upcomingBookings: number;
  // Conversations
  totalConversations: number;
  activeConversations: number;
  unreadMessages: number;
  humanHandoffs: number;
  // Campaigns
  totalCampaigns: number;
  runningCampaigns: number;
  campaignLeads: number;
  emailsSent: number;
  pendingEmails: number;
  replies: number;
  campaignDemosBooked: number;
  failedEmails: number;
  timezone: string;
  updatedAt: string;
}

const CLOSED_STATUSES = new Set(['CLOSED_WON', 'CLOSED_LOST', 'UNSUBSCRIBED', 'NOT_INTERESTED']);

function toMs(value: any): number {
  if (value === undefined || value === null || value === '') return 0;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value?.toDate === 'function') {
    const d = value.toDate();
    return d instanceof Date && Number.isFinite(d.getTime()) ? d.getTime() : 0;
  }
  if (typeof value?.seconds === 'number') return value.seconds * 1000;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

const toIso = (value: any): string | null => {
  const ms = toMs(value);
  return ms ? new Date(ms).toISOString() : null;
};

/** Same rule the CRM uses to hide outbound campaign leads until they reply. */
export function isVisibleCrmLead(lead: any): boolean {
  const isCampaignLead = Boolean(
    lead?.campaignId || lead?.campaignLeadId || (lead?.leadType === 'OUTBOUND' && lead?.source === 'EMAIL')
  );
  return !(isCampaignLead && lead?.replyStatus !== 'REPLIED');
}

export function isFollowUpDue(lead: any, now: number): boolean {
  if (CLOSED_STATUSES.has(lead?.status)) return false;
  const scheduledAt = lead?.aiAutoFollowUp?.status === 'scheduled'
    ? lead.aiAutoFollowUp.scheduledAt
    : lead?.autoFollowUp?.enabled
      ? lead.autoFollowUp.nextScheduledAt || lead.nextFollowUpAt
      : lead?.nextFollowUpAt;
  return scheduledAt ? toMs(scheduledAt) <= now : lead?.status === 'FOLLOW_UP';
}

/** Year and month (1-12) of an instant, in the workspace timezone. */
function zonedYearMonth(ms: number, timeZone: string): { y: number; m: number } {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: 'numeric' }).formatToParts(new Date(ms));
  return {
    y: Number(parts.find((p) => p.type === 'year')?.value),
    m: Number(parts.find((p) => p.type === 'month')?.value),
  };
}

/** Converts a wall-clock date + time in the workspace timezone to epoch ms. */
function zonedWallClockToMs(date: string, time: string, timeZone: string): number {
  const naive = Date.parse(`${date}T${time.length === 5 ? `${time}:00` : time}Z`);
  if (!Number.isFinite(naive)) return 0;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(naive));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asIfUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return naive - (asIfUtc - naive);
}

export function monthlyBuckets(leads: any[], now: number, timeZone: string) {
  const { y, m } = zonedYearMonth(now, timeZone);
  const buckets = Array.from({ length: 6 }, (_, i) => {
    const idx = (y * 12 + (m - 1)) - (5 - i);
    const by = Math.floor(idx / 12);
    const bm = (idx % 12) + 1;
    const label = new Intl.DateTimeFormat('en-IN', { month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(by, bm - 1, 15)));
    return { key: `${by}-${String(bm).padStart(2, '0')}`, label, count: 0 };
  });
  const byKey = new Map(buckets.map((b) => [b.key, b]));
  for (const lead of leads) {
    const ms = toMs(lead?.createdAt);
    if (!ms) continue;
    const ym = zonedYearMonth(ms, timeZone);
    const bucket = byKey.get(`${ym.y}-${String(ym.m).padStart(2, '0')}`);
    if (bucket) bucket.count++;
  }
  return buckets;
}

const contactName = (contact: any): string =>
  contact?.fullName ||
  [contact?.firstName, contact?.lastName].filter(Boolean).join(' ') ||
  contact?.companyName ||
  '';

export async function buildDashboardSummary(ctx: TenantContext, now: number = Date.now()): Promise<DashboardSummary> {
  const repo = tenantRepo(ctx);
  const brand = await getTenantBrand(ctx.tenantId).catch(() => null as any);
  const timeZone = brand?.timezone || 'UTC';

  const conversations = repo.conversations();
  const campaigns = repo.campaigns();
  const campaignLeadRows = repo.campaignLeads();

  const [
    leadsSnap,
    bookingsSnap,
    totalConversations,
    activeConversations,
    unreadTotals,
    unreadFlagged,
    humanHandoffFlagged,
    humanModeFlagged,
    totalCampaigns,
    runningCampaigns,
    campaignLeadCount,
    emailsSent,
    pendingEmails,
    replies,
    campaignDemosBooked,
    failedEmails,
  ] = await Promise.all([
    getDocs(repo.leads()),
    getDocs(query(repo.bookings(), where('status', 'in', ['BOOKED', 'RESCHEDULED']))),
    countDocs(conversations),
    countDocs(query(conversations, where('status', 'in', ['ACTIVE', 'REVIEW']))),
    sumDocs(conversations, ['unreadCount']),
    getDocs(query(conversations, where('unread', '==', true))),
    getDocs(query(conversations, where('humanHandoff', '==', true))),
    getDocs(query(conversations, where('managementMode', '==', 'HUMAN'))),
    countDocs(campaigns),
    countDocs(query(campaigns, where('status', '==', 'RUNNING'))),
    countDocs(campaignLeadRows),
    countDocs(query(campaignLeadRows, where('sendStatus', '==', 'SENT'))),
    countDocs(query(campaignLeadRows, where('sendStatus', 'in', ['PENDING', 'SENDING']))),
    countDocs(query(campaignLeadRows, where('replyStatus', '==', 'REPLIED'))),
    countDocs(query(campaignLeadRows, where('demoStatus', '==', 'BOOKED'))),
    countDocs(query(campaignLeadRows, where('sendStatus', '==', 'FAILED'))),
  ]);

  // ---- Leads (same visibility and definitions as the CRM screen) ----
  const isScopedMember = !(ctx.role === 'admin' || ctx.role === 'platformAdmin' || ctx.isPlatformAdmin === true);
  const assignment = isScopedMember ? await import('./clientDataApi.js') : null;
  const memberScope = assignment ? await assignment.loadMemberRecordScope(ctx, true) : null;
  const leads = leadsSnap.docs
    .map((d: any) => ({ ...(d.data() || {}), leadId: d.data()?.leadId || d.id }))
    .filter(isVisibleCrmLead)
    .filter((lead: any) => !memberScope || assignment!.isVisibleAssignmentRecord(
      ['tenants', ctx.tenantId, 'leads'], String(lead.leadId), lead, memberScope
    ));

  const visibleConversationDocs = memberScope
    ? (await getDocs(conversations)).docs.filter((d: any) => assignment!.isVisibleAssignmentRecord(
        ['tenants', ctx.tenantId, 'conversations'], d.id, d.data(), memberScope
      ))
    : null;
  const visibleBookingDocs = memberScope
    ? bookingsSnap.docs.filter((d: any) => assignment!.isVisibleAssignmentRecord(
        ['tenants', ctx.tenantId, 'bookings'], d.id, d.data(), memberScope
      ))
    : bookingsSnap.docs;
  const visibleTotalConversations = visibleConversationDocs ? visibleConversationDocs.length : totalConversations;
  const visibleActiveConversations = visibleConversationDocs
    ? visibleConversationDocs.filter((d: any) => ['ACTIVE', 'REVIEW'].includes(String(d.data()?.status || ''))).length
    : activeConversations;
  const visibleUnreadMessages = visibleConversationDocs
    ? visibleConversationDocs.reduce((sum: number, d: any) => sum + Math.max(0, Number(d.data()?.unreadCount || 0)), 0)
    : Math.max(0, Math.round(unreadTotals.unreadCount || 0));
  const visibleLegacyUnread = visibleConversationDocs
    ? visibleConversationDocs.filter((d: any) => d.data()?.unread === true && typeof d.data()?.unreadCount !== 'number').length
    : unreadFlagged.docs.filter((d: any) => typeof d.data()?.unreadCount !== 'number').length;
  const visibleHandoffs = visibleConversationDocs
    ? visibleConversationDocs.filter((d: any) => {
        const c: any = d.data() || {};
        return c.status !== 'RESOLVED' && c.status !== 'ARCHIVED' && (c.humanHandoff === true || c.managementMode === 'HUMAN');
      }).length
    : undefined;

  const statusCounts = new Map<string, number>();
  for (const lead of leads) {
    const status = String(lead.status || 'NEW');
    statusCounts.set(status, (statusCounts.get(status) || 0) + 1);
  }

  const recent = [...leads]
    .sort((a, b) => toMs(b.updatedAt || b.lastActivityAt || b.createdAt) - toMs(a.updatedAt || a.lastActivityAt || a.createdAt))
    .slice(0, 5);
  const contactIds = [...new Set(recent.map((l) => l.contactId).filter(Boolean))] as string[];
  const contactSnaps = await Promise.all(contactIds.map((id) => getDoc(repo.contactDoc(id)).catch(() => null)));
  const contactsById = new Map<string, any>();
  contactSnaps.forEach((snap: any, i) => { if (snap?.exists()) contactsById.set(contactIds[i], snap.data()); });

  const recentLeads: DashboardRecentLead[] = recent.map((lead) => {
    const contact = contactsById.get(lead.contactId);
    return {
      leadId: lead.leadId,
      name: contactName(contact) || lead.name || lead.fullName || 'Unnamed lead',
      subline: contact?.email || contact?.phone || lead.email || lead.source || 'CRM lead',
      status: String(lead.status || 'NEW'),
      updatedAt: toIso(lead.updatedAt || lead.lastActivityAt || lead.createdAt),
      leadScore: Number(lead.leadScore) || 0,
    };
  });

  // ---- Calendar: upcoming booked / rescheduled demos ----
  const upcomingBookings = visibleBookingDocs.filter((d: any) => {
    const b = d.data() || {};
    const start = b.startDateTimeIso
      ? toMs(b.startDateTimeIso)
      : b.date && b.startTime ? zonedWallClockToMs(String(b.date), String(b.startTime), timeZone) : 0;
    return start >= now;
  }).length;

  // ---- Conversations ----
  const legacyUnreadCount = unreadFlagged.docs.filter((d: any) => typeof d.data()?.unreadCount !== 'number').length;
  const handoffsById = new Map<string, any>();
  for (const snap of [humanHandoffFlagged, humanModeFlagged]) snap.docs.forEach((d: any) => handoffsById.set(d.id, d.data()));
  const humanHandoffs = [...handoffsById.values()].filter((c: any) => c?.status !== 'RESOLVED' && c?.status !== 'ARCHIVED').length;

  return {
    totalLeads: leads.length,
    demosBooked: statusCounts.get('DEMO_BOOKED') || 0,
    followUpsDue: leads.filter((lead) => isFollowUpDue(lead, now)).length,
    pipeline: [...statusCounts.entries()].map(([status, count]) => ({ status, count })),
    monthlyNewLeads: monthlyBuckets(leads, now, timeZone),
    recentLeads,
    upcomingBookings,
    totalConversations: visibleTotalConversations,
    activeConversations: visibleActiveConversations,
    unreadMessages: visibleUnreadMessages + visibleLegacyUnread,
    humanHandoffs: visibleHandoffs ?? humanHandoffs,
    totalCampaigns,
    runningCampaigns,
    campaignLeads: campaignLeadCount,
    emailsSent,
    pendingEmails,
    replies,
    campaignDemosBooked,
    failedEmails,
    timezone: timeZone,
    updatedAt: new Date(now).toISOString(),
  };
}
