import { createHmac, timingSafeEqual } from 'node:crypto';
import { collection, createDoc, db, doc, getDoc, setDoc } from './adminFirestore.js';
import { tenantRepo } from './tenantRepo.js';
import type { TenantContext } from '../types/tenant.js';

type EventEnvelope = {
  event_id: string; type: string; tenant_id: string; meeting_id: string;
  external_booking_id?: string; lead_id?: string; data?: Record<string, unknown>;
};

function verifySignature(rawBody: Buffer, presented: string | undefined, secret: string): boolean {
  if (!presented || !/^[a-f0-9]{64}$/i.test(presented)) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest();
  const actual = Buffer.from(presented, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function statusForEvent(type: string): string {
  const states: Record<string, string> = {
    'meeting.scheduled': 'scheduled', 'meeting.rescheduled': 'scheduled', 'meeting.joined': 'joining',
    'meeting.recording.started': 'recording', 'meeting.recording.completed': 'recorded',
    'meeting.transcript.completed': 'transcribed', 'meeting.analysis.completed': 'completed',
    'meeting.needs_reauth': 'needs_reauth', 'meeting.failed': 'failed',
    'meeting.cancelled': 'cancelled',
  };
  return states[type] || 'updated';
}

export async function handleMeetingIntelligenceWebhook(rawBody: Buffer, signature?: string) {
  const secret = process.env.MEETING_INTELLIGENCE_WEBHOOK_SECRET || '';
  if (secret.length < 24) return { status: 503, body: { error: 'Meeting Intelligence webhook secret is not configured.' } };
  if (!verifySignature(rawBody, signature, secret)) return { status: 401, body: { error: 'Invalid webhook signature.' } };

  let event: EventEnvelope;
  try { event = JSON.parse(rawBody.toString('utf8')); }
  catch { return { status: 400, body: { error: 'Invalid JSON payload.' } }; }
  if (!event || !/^[A-Za-z0-9_-]{1,128}$/.test(String(event.event_id || '')) ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(String(event.tenant_id || '')) ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(String(event.meeting_id || '')) ||
      !event.external_booking_id || String(event.external_booking_id).length > 200 ||
      !String(event.type || '').startsWith('meeting.')) {
    return { status: 422, body: { error: 'Missing or invalid tenant, event, meeting, or booking identity.' } };
  }

  // This callback is server-to-server. The tenant identity is signed and is never taken from a browser.
  const ctx: TenantContext = { tenantId: event.tenant_id, uid: 'meeting-intelligence-webhook', email: '', role: 'admin' };
  const apiBaseUrl = String(process.env.MEETING_INTELLIGENCE_API_URL || '').replace(/\/+$/, '');
  const apiKey = process.env.MEETING_INTELLIGENCE_API_KEY || '';
  if (!apiBaseUrl || !apiKey) return { status: 503, body: { error: 'Meeting Intelligence API access is not configured.' } };
  const serviceResponse = await fetch(`${apiBaseUrl}/v1/meetings/${encodeURIComponent(event.meeting_id)}?tenant_id=${encodeURIComponent(event.tenant_id)}`, {
    headers: { 'X-Service-Key': apiKey }, signal: AbortSignal.timeout(10000),
  });
  if (!serviceResponse.ok) return { status: 502, body: { error: `Could not verify current meeting state (HTTP ${serviceResponse.status}).` } };
  const liveMeeting: any = await serviceResponse.json();
  if (liveMeeting.tenant_id !== event.tenant_id || liveMeeting.external_booking_id !== event.external_booking_id) {
    return { status: 409, body: { error: 'Signed event booking identity does not match the service meeting.' } };
  }
  const repo = tenantRepo(ctx);
  const bookingRef = repo.bookingDoc(String(event.external_booking_id));
  const bookingSnap = await getDoc(bookingRef);
  if (!bookingSnap.exists()) return { status: 404, body: { error: 'Booking not found in the signed tenant scope.' } };

  const data = event.data || {};
  const now = new Date().toISOString();
  const intelligence: Record<string, unknown> = {
    meetingId: event.meeting_id, status: String(liveMeeting.status || statusForEvent(event.type)),
    lastEventId: event.event_id, lastEventType: event.type, updatedAt: now,
  };
  if (typeof data.object_key === 'string') intelligence.recordingObjectKey = data.object_key;
  if (typeof data.transcript_id === 'string') intelligence.transcriptId = data.transcript_id;
  if (typeof data.reason === 'string') intelligence.failureReason = data.reason.slice(0, 1000);
  if (data.report && typeof data.report === 'object') intelligence.report = data.report;
  await setDoc(bookingRef, { meetingIntelligence: intelligence, updatedAt: now } as any, { merge: true });

  const booking = bookingSnap.data() as any;
  const leadId = String(event.lead_id || booking.leadId || '').trim();
  if (leadId) {
    const leadRef = repo.leadDoc(leadId);
    const leadSnap = await getDoc(leadRef);
    if (leadSnap.exists()) {
      await setDoc(leadRef, { meetingIntelligence: intelligence, updatedAt: now } as any, { merge: true });
    }
  }

  // Record delivery only after CRM writes have succeeded. Repeated events safely re-apply the same state.
  const receiptRef = doc(collection(db, `tenants/${event.tenant_id}/meeting_intelligence_events`), event.event_id);
  try {
    await createDoc(receiptRef, { eventId: event.event_id, type: event.type, meetingId: event.meeting_id,
      bookingId: event.external_booking_id, receivedAt: now });
  } catch (error: any) {
    if (error?.code !== 6 && error?.code !== 'already-exists' && error?.code !== 'ALREADY_EXISTS') throw error;
    return { status: 200, body: { received: true, duplicate: true } };
  }
  return { status: 202, body: { received: true, duplicate: false } };
}
