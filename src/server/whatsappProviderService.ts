import crypto from 'node:crypto';
import {
  createDoc,
  getDoc,
  getDocs,
  query,
  updateDoc,
  where,
} from './adminFirestore.js';
import { tenantRepo, globalWhatsAppPhoneRouteDoc } from './tenantRepo.js';
import {
  disconnectWhatsAppProviderConnection,
  getWhatsAppProviderConnection,
  getWhatsAppProviderCredentials,
  listWhatsAppProviderConnections,
  resolveWhatsAppProviderWebhookRoute,
  updateWhatsAppProviderWebhookStatus,
  createWhatsAppProviderConnection,
} from './whatsappConnectionService.js';
import {
  getWhatsAppProviderAdapter,
  registerWhatsAppProviderAdapter,
  WhatsAppProviderAdapterUnavailableError,
} from './whatsappProviderRegistry.js';
import { registerBuiltInWhatsAppProviderAdapters, ProviderApiError } from './whatsappProviderAdapters.js';
import type { TenantContext } from '../types/tenant.js';
import type {
  NormalizedWhatsAppEvent,
  WhatsAppProvider,
  WhatsAppProviderConnection,
  WhatsAppProviderCredentials,
  WhatsAppProviderTemplate,
  WhatsAppProviderValidation,
  WhatsAppSender,
  WhatsAppWebhookRequest,
} from './whatsappProviderTypes.js';

let builtInsRegistered = false;
function ensureAdapters(): void {
  if (builtInsRegistered) return;
  registerBuiltInWhatsAppProviderAdapters(registerWhatsAppProviderAdapter);
  builtInsRegistered = true;
}

export class WhatsAppProviderServiceError extends Error {
  readonly statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.name = 'WhatsAppProviderServiceError';
    this.statusCode = statusCode;
  }
}

function assertProvider(value: string): WhatsAppProvider {
  const provider = String(value || '').toUpperCase();
  if (!['META', 'TWILIO', 'WATI'].includes(provider)) {
    throw new WhatsAppProviderServiceError(400, 'Choose Meta Direct, Twilio or WATI.');
  }
  return provider as WhatsAppProvider;
}

function normalizeId(value: string): string {
  const id = String(value || '').trim();
  if (!/^[a-f0-9]{32}$/.test(id)) throw new WhatsAppProviderServiceError(400, 'Invalid WhatsApp connection ID.');
  return id;
}

function normalizePhone(value: string): string {
  const raw = String(value || '').trim().replace(/^whatsapp:/i, '');
  const digits = raw.replace(/\D/g, '');
  if (!/^[1-9]\d{7,14}$/.test(digits)) {
    throw new WhatsAppProviderServiceError(400, 'Use a valid international WhatsApp number, including country code.');
  }
  return '+' + digits;
}

function publicOrigin(req: any): string {
  const configured = String(process.env.APP_URL || process.env.PUBLIC_APP_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL || '').trim();
  if (configured) return (/^https?:\/\//i.test(configured) ? configured : `https://${configured}`).replace(/\/+$/, '');
  const headers = req?.headers || {};
  const hostValue = headers['x-forwarded-host'] || headers.host || '';
  const protoValue = headers['x-forwarded-proto'] || 'https';
  const host = String(Array.isArray(hostValue) ? hostValue[0] : hostValue).split(',')[0].trim();
  const protocol = String(Array.isArray(protoValue) ? protoValue[0] : protoValue).split(',')[0].trim();
  if (!host || /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host)) {
    throw new WhatsAppProviderServiceError(503, 'Set APP_URL to the public HTTPS address before creating WhatsApp webhooks.');
  }
  return `${protocol === 'http' ? 'http' : 'https'}://${host}`;
}

function webhookUrl(origin: string, provider: WhatsAppProvider, routeId: string): string {
  if (provider === 'META') return `${origin}/api/webhooks/meta`;
  return `${origin}/api/webhooks/whatsapp/${provider}/${routeId}`;
}

function statusCode(error: unknown): number {
  const code = Number((error as any)?.statusCode || (error as any)?.status || 500);
  return code >= 400 && code <= 599 ? code : 500;
}

function sanitizeCredentialsForProvider(
  provider: WhatsAppProvider,
  credentials: WhatsAppProviderCredentials
): WhatsAppProviderCredentials {
  const copy = { ...credentials };
  if (provider === 'META') {
    copy.graphVersion = String(copy.graphVersion || process.env.META_GRAPH_API_VERSION || 'v23.0');
    // Meta's webhook signature is signed with the platform app secret; the browser never receives it.
    if (process.env.META_APP_SECRET) copy.appSecret = process.env.META_APP_SECRET;
  }
  return copy;
}

export async function validateWhatsAppProviderCredentials(
  providerValue: string,
  rawCredentials: WhatsAppProviderCredentials
): Promise<WhatsAppProviderValidation> {
  ensureAdapters();
  const provider = assertProvider(providerValue);
  const credentials = sanitizeCredentialsForProvider(provider, rawCredentials);
  const adapter = getWhatsAppProviderAdapter(provider);
  try {
    return await adapter.validateCredentials(credentials);
  } catch (error: any) {
    throw new WhatsAppProviderServiceError(statusCode(error), error?.message || 'Provider credential validation failed.');
  }
}

export async function connectWhatsAppProvider(
  ctx: TenantContext,
  providerValue: string,
  input: {
    credentials: WhatsAppProviderCredentials;
    sender: WhatsAppSender;
    displayName?: string;
    origin: string;
  }
): Promise<{ connection: Omit<WhatsAppProviderConnection, 'credentialsRef'>; webhook: { inboundUrl: string; statusCallbackUrl?: string; subscriptionId?: string; setup: string[] } }> {
  const provider = assertProvider(providerValue);
  const credentials = sanitizeCredentialsForProvider(provider, input.credentials);
  if (provider === 'TWILIO') {
    credentials.senderSid = String(input.sender?.providerSenderId || '').trim();
    credentials.senderNumber = String(input.sender?.phoneNumber || '').trim();
  } else if (provider === 'WATI') {
    credentials.senderNumber = String(input.sender?.phoneNumber || '').trim();
  }
  const adapter = (ensureAdapters(), getWhatsAppProviderAdapter(provider));

  let validation: WhatsAppProviderValidation;
  try {
    validation = await adapter.validateCredentials(credentials);
  } catch (error: any) {
    throw new WhatsAppProviderServiceError(statusCode(error), error?.message || 'Could not validate the provider credentials.');
  }
  if (provider === 'WATI') {
    credentials.tenantId = String(validation.providerAccountId || credentials.tenantId || input.sender?.providerAccountId || '').trim();
    credentials.senderNumber = String(input.sender?.phoneNumber || '').trim();
    if (!credentials.tenantId) throw new WhatsAppProviderServiceError(422, 'WATI did not return a workspace tenant ID. Enter the tenant ID from your WATI account to enable webhook subscription.');
  }

  const sender = {
    ...input.sender,
    phoneNumber: normalizePhone(input.sender?.phoneNumber),
    providerSenderId: String(input.sender?.providerSenderId || '').trim(),
  };
  const origin = String(input.origin || '').replace(/\/+$/, '');
  if (!/^https:\/\//i.test(origin)) throw new WhatsAppProviderServiceError(400, 'Webhook origin must use HTTPS.');
  
  // Twilio's REST send endpoint accepts a callback URL. The same route accepts inbound form posts
  // and status callbacks, distinguished by the signed payload's MessageStatus fields.
  const { connection, webhookRouteId } = await createWhatsAppProviderConnection(ctx, {
    provider,
    displayName: input.displayName,
    sender,
    credentials,
    validation,
    webhookBaseUrl: origin,
  });

  const inboundUrl = webhookUrl(origin, provider, webhookRouteId);
  const setup: string[] = [];
  let webhookSetupStatus: 'ACTIVE' | 'PENDING' | 'ERROR' = 'PENDING';
  let webhookSubscriptionId: string | undefined;
  if (adapter.registerWebhook) {
    try {
      const registered = await adapter.registerWebhook(credentials, inboundUrl, provider === 'TWILIO' ? inboundUrl : undefined);
      webhookSetupStatus = registered.status;
      webhookSubscriptionId = registered.subscriptionId;
    } catch (error: any) {
      webhookSetupStatus = 'ERROR';
      setup.push(`Automatic webhook configuration did not complete: ${error?.message || 'Provider rejected the configuration.'}`);
    }
  }
  if (provider === 'TWILIO') {
    setup.push(webhookSetupStatus === 'ACTIVE'
      ? 'Amaavigo configured the sender inbound and status callback URLs.'
      : `Set the WhatsApp sender's Incoming Message webhook to ${inboundUrl} (POST). Set its Status Callback URL to ${inboundUrl}.`);
    setup.push('The sender must be ONLINE. Existing Messaging Service routing can override sender-level callback configuration.');
  } else if (provider === 'WATI') {
    setup.push(webhookSetupStatus === 'ACTIVE'
      ? 'Amaavigo created the WATI webhook subscription using the event types available to this workspace.'
      : `In WATI → Connector → Webhooks, add ${inboundUrl} (POST) and select the available inbound, sent, delivered, read and failed event types.`);
    setup.push('WATI callback delivery does not provide one universal signing contract. Amaavigo uses the high-entropy per-connection callback route and reconciles provider message identifiers. Confirm a real sample callback before production activation.');
  } else {
    setup.push('Subscribe the WhatsApp Business Account to the platform Meta app webhook. Meta callbacks are received at the shared Meta webhook URL and routed by Phone Number ID.');
  }

  if (webhookSetupStatus !== 'PENDING' || webhookSubscriptionId) {
    const { updateWhatsAppProviderWebhookStatus } = await import('./whatsappConnectionService.js');
    await updateWhatsAppProviderWebhookStatus(ctx, connection.connectionId, webhookSetupStatus, {
      ...(webhookSubscriptionId ? { subscriptionId: webhookSubscriptionId } : {}),
      ...(webhookSetupStatus === 'ERROR' ? { lastError: setup.find((item) => item.startsWith('Automatic')) } : {}),
    });
  }
  return {
    connection: publicConnection({ ...connection, webhook: { ...connection.webhook, status: webhookSetupStatus, ...(webhookSubscriptionId ? { subscriptionId: webhookSubscriptionId } : {}) } }),
    webhook: {
      inboundUrl,
      ...(provider === 'TWILIO' ? { statusCallbackUrl: inboundUrl } : {}),
      ...(webhookSubscriptionId ? { subscriptionId: webhookSubscriptionId } : {}),
      setup,
    },
  };
}

function publicConnection(connection: WhatsAppProviderConnection): Omit<WhatsAppProviderConnection, 'credentialsRef'> {
  const { credentialsRef: _credentialsRef, ...safe } = connection;
  return safe;
}

export async function listWhatsAppConnections(ctx: TenantContext) {
  return (await listWhatsAppProviderConnections(ctx)).map(publicConnection);
}

export async function disconnectWhatsAppConnection(ctx: TenantContext, connectionId: string): Promise<void> {
  ensureAdapters();
  const id = normalizeId(connectionId);
  const connection = await getWhatsAppProviderConnection(ctx, id);
  if (connection?.webhook?.subscriptionId) {
    try {
      const credentials = await getWhatsAppProviderCredentials(ctx, id);
      const adapter = getWhatsAppProviderAdapter(connection.provider);
      await adapter.deleteWebhook?.(credentials, connection.webhook.subscriptionId);
    } catch (error: any) {
      console.warn('[WhatsApp Provider] Remote webhook cleanup failed:', error?.message || error);
    }
  }
  // Local deactivation remains authoritative even if provider-side unsubscribe fails.
  await disconnectWhatsAppProviderConnection(ctx, id);
}

export async function getWhatsAppConnectionForTenant(ctx: TenantContext, connectionId: string) {
  const connection = await getWhatsAppProviderConnection(ctx, normalizeId(connectionId));
  return connection ? publicConnection(connection) : null;
}

export async function listWhatsAppConnectionTemplates(
  ctx: TenantContext,
  connectionId: string
): Promise<WhatsAppProviderTemplate[]> {
  ensureAdapters();
  const id = normalizeId(connectionId);
  const connection = await getWhatsAppProviderConnection(ctx, id);
  if (!connection) throw new WhatsAppProviderServiceError(404, 'WhatsApp connection not found.');
  const credentials = await getWhatsAppProviderCredentials(ctx, id);
  const adapter = getWhatsAppProviderAdapter(connection.provider);
  const templates = await adapter.listTemplates(credentials, connection.sender);
  const repo = tenantRepo(ctx);
  const now = new Date().toISOString();
  const records: Array<WhatsAppProviderTemplate & { templateRecordId: string }> = [];
  for (const template of templates) {
    const key = crypto.createHash('sha256').update(`${id}:${template.providerTemplateId}:${template.language}`).digest('hex');
    const record = { ...template, templateRecordId: key };
    await repo.whatsappTemplateDoc(key).set({
      ...record,
      tenantId: ctx.tenantId,
      connectionId: id,
      provider: connection.provider,
      syncedAt: now,
    }, { merge: true });
    records.push(record);
  }
  return records;
}

export interface SendWhatsAppProviderMessageInput {
  connectionId: string;
  recipientPhone: string;
  text?: string;
  template?: WhatsAppProviderTemplate;
  variables?: Record<string, string>;
  media?: { url: string; mimeType?: string; fileName?: string; caption?: string };
  conversationId?: string;
  providerConversationId?: string;
  clientMessageId?: string;
  senderType?: 'AGENT' | 'AI' | 'CAMPAIGN';
  campaignId?: string;
  campaignLeadId?: string;
}

export async function sendWhatsAppProviderMessage(
  ctx: TenantContext,
  input: SendWhatsAppProviderMessageInput
): Promise<{ success: true; messageId: string; providerMessageId: string; status: string; provider: WhatsAppProvider; connectionId: string }> {
  ensureAdapters();
  const connectionId = normalizeId(input.connectionId);
  const connection = await getWhatsAppProviderConnection(ctx, connectionId);
  if (!connection || connection.status !== 'CONNECTED') throw new WhatsAppProviderServiceError(409, 'The selected WhatsApp connection is not active.');
  if (!input.recipientPhone) throw new WhatsAppProviderServiceError(400, 'Recipient phone number is required.');

  const recipientPhone = normalizePhone(input.recipientPhone);
  const adapter = getWhatsAppProviderAdapter(connection.provider);
  const credentials = await getWhatsAppProviderCredentials(ctx, connectionId);
  let providerConversationId = String(input.providerConversationId || '').trim();
  if (!providerConversationId && input.conversationId) {
    const conversationSnap = await getDoc(tenantRepo(ctx).conversationDoc(input.conversationId));
    if (conversationSnap.exists()) {
      providerConversationId = String((conversationSnap.data() as any)?.providerConversationId || '').trim();
    }
  }
  const now = new Date().toISOString();
  const messageId = input.clientMessageId
    ? String(input.clientMessageId).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 100)
    : `wam_${crypto.randomUUID().replace(/-/g, '')}`;
  if (!messageId) throw new WhatsAppProviderServiceError(400, 'Invalid client message ID.');

  const outboxRef = tenantRepo(ctx).whatsappOutboxDoc(messageId);
  const existing = await getDoc(outboxRef);
  if (existing.exists()) {
    const saved = existing.data() as any;
    if (saved.tenantId !== ctx.tenantId || saved.connectionId !== connectionId) {
      throw new WhatsAppProviderServiceError(409, 'This message ID has already been used for a different connection.');
    }
    if (saved.status === 'ACCEPTED' || saved.status === 'SENT' || saved.status === 'DELIVERED' || saved.status === 'READ') {
      return {
        success: true, messageId, providerMessageId: String(saved.providerMessageId || ''),
        status: String(saved.status), provider: connection.provider, connectionId,
      };
    }
    if (saved.status === 'UNKNOWN' || saved.status === 'SENDING') {
      throw new WhatsAppProviderServiceError(409, 'The previous send attempt has an unknown outcome. Reconcile its provider status before sending again.');
    }
  } else {
    await createDoc(outboxRef, {
      messageId,
      tenantId: ctx.tenantId,
      connectionId,
      provider: connection.provider,
      recipientPhone,
      senderPhone: connection.sender.phoneNumber,
      conversationId: input.conversationId || '',
      campaignId: input.campaignId || '',
      campaignLeadId: input.campaignLeadId || '',
      status: 'SENDING',
      text: input.text || '',
      createdAt: now,
      updatedAt: now,
    });
  }

  try {
    let sent: any;
    if (input.template) {
      if (!connection.capabilities.templates) throw new WhatsAppProviderServiceError(422, 'This connection does not support WhatsApp templates.');
      if (!['APPROVED', 'APPROVED_BY_META', 'APPROVED_BY_WABA'].includes(String(input.template.status || '').toUpperCase())) {
        throw new WhatsAppProviderServiceError(422, 'Select an approved template for this exact WhatsApp connection.');
      }
      sent = await adapter.sendTemplate(credentials, {
        recipientPhone, sender: connection.sender, template: input.template,
        variables: input.variables || {}, clientMessageId: messageId,
      });
    } else if (input.media) {
      if (!connection.capabilities.media) throw new WhatsAppProviderServiceError(422, 'This connection does not support WhatsApp media.');
      sent = await adapter.sendMedia(credentials, {
        recipientPhone, sender: connection.sender, media: input.media,
        providerConversationId: providerConversationId || undefined,
        clientMessageId: messageId,
      });
    } else {
      if (!input.text?.trim()) throw new WhatsAppProviderServiceError(400, 'Enter a message or select a template/media file.');
      if (!connection.capabilities.textMessages) throw new WhatsAppProviderServiceError(422, 'This connection does not support WhatsApp text messages.');
      sent = await adapter.sendText(credentials, {
        recipientPhone, sender: connection.sender, text: input.text.trim(),
        providerConversationId: providerConversationId || undefined,
        clientMessageId: messageId,
      });
    }

    await updateDoc(outboxRef, {
      providerMessageId: sent.providerMessageId,
      providerStatus: sent.providerStatus || sent.status,
      status: sent.status || 'ACCEPTED',
      acceptedAt: sent.acceptedAt,
      updatedAt: new Date().toISOString(),
    });

    const outboundMessage = {
      messageId,
      externalMessageId: sent.providerMessageId,
      providerMessageId: sent.providerMessageId,
      provider: connection.provider,
      whatsappConnectionId: connectionId,
      conversationId: input.conversationId || '',
      channel: 'WHATSAPP',
      direction: 'OUTBOUND',
      senderType: input.senderType || 'AGENT',
      senderName: connection.displayName || 'WhatsApp Business',
      senderPhone: connection.sender.phoneNumber,
      recipientPhone,
      text: input.text || (input.template ? `[Template: ${input.template.name}]` : input.media?.caption || '[Media]'),
      timestamp: sent.acceptedAt || now,
      sentAt: sent.acceptedAt || now,
      createdAt: now,
      deliveryStatus: sent.status || 'ACCEPTED',
      campaignId: input.campaignId || undefined,
      campaignLeadId: input.campaignLeadId || undefined,
    };

    await tenantRepo(ctx).messageDoc(messageId).set(outboundMessage, { merge: true });
    if (input.conversationId) {
      const conversationRef = tenantRepo(ctx).conversationDoc(input.conversationId);
      const conversationSnap = await getDoc(conversationRef);
      if (conversationSnap.exists()) {
        await updateDoc(conversationRef, {
          whatsappConnectionId: connectionId,
          whatsappProvider: connection.provider,
          businessSenderNumber: connection.sender.phoneNumber,
          lastMessageAt: now,
          lastMessageText: outboundMessage.text.slice(0, 120),
          updatedAt: now,
        });
      }
    }

    return {
      success: true, messageId, providerMessageId: sent.providerMessageId,
      status: String(sent.status || 'ACCEPTED'), provider: connection.provider, connectionId,
    };
  } catch (error: any) {
    const ambiguous = Number(error?.statusCode || error?.status || 0) >= 500 || /timeout|timed out|socket hang up|network/i.test(String(error?.message || ''));
    await updateDoc(outboxRef, {
      status: ambiguous ? 'UNKNOWN' : 'FAILED',
      lastError: String(error?.message || 'WhatsApp send failed').slice(0, 500),
      updatedAt: new Date().toISOString(),
    }).catch(() => undefined);
    throw new WhatsAppProviderServiceError(statusCode(error), error?.message || 'WhatsApp message could not be sent.');
  }
}

async function claimWebhookEvent(ctx: TenantContext, event: NormalizedWhatsAppEvent): Promise<boolean> {
  const identity = [event.provider, event.connectionId, event.kind, event.providerMessageId,
    event.kind === 'MESSAGE_STATUS' ? event.status : 'INBOUND'].join(':');
  const eventKey = crypto.createHash('sha256').update(identity).digest('hex');
  const ref = tenantRepo(ctx).whatsappWebhookEventDoc(eventKey);
  try {
    await createDoc(ref, {
      eventId: eventKey,
      tenantId: ctx.tenantId,
      provider: event.provider,
      connectionId: event.connectionId,
      providerMessageId: event.providerMessageId,
      eventKind: event.kind,
      status: event.kind === 'MESSAGE_STATUS' ? event.status : 'RECEIVED',
      receivedAt: new Date().toISOString(),
      processingStatus: 'CLAIMED',
    });
    return true;
  } catch (error: any) {
    if (Number(error?.code) === 6 || /already exists|duplicate key/i.test(String(error?.message || ''))) return false;
    throw error;
  }
}

async function persistMessageStatus(ctx: TenantContext, event: Extract<NormalizedWhatsAppEvent, { kind: 'MESSAGE_STATUS' }>): Promise<void> {
  const outbox = tenantRepo(ctx).whatsappOutbox();
  // Most providers return their own message SID/ID. WATI status callbacks also send
  // the client-supplied localMessageId, so match either key without duplicating a row.
  const [providerMatches, localMatches] = await Promise.all([
    getDocs(query(outbox, where('providerMessageId', '==', event.providerMessageId))),
    getDocs(query(outbox, where('messageId', '==', event.providerMessageId))),
  ]);
  const uniqueMatches = new Map<string, any>();
  for (const item of [...providerMatches.docs, ...localMatches.docs]) uniqueMatches.set(item.id, item);
  const matches = { docs: [...uniqueMatches.values()] };
  for (const match of matches.docs) {
    const current = match.data() as any;
    const ordering: Record<string, number> = { UNKNOWN: 0, ACCEPTED: 1, SENT: 2, DELIVERED: 3, READ: 4, FAILED: 5 };
    const currentStatus = String(current.status || 'UNKNOWN').toUpperCase();
    const next = String(event.status || 'UNKNOWN').toUpperCase();
    if ((ordering[next] ?? 0) < (ordering[currentStatus] ?? 0) && next !== 'FAILED') continue;
    await updateDoc(tenantRepo(ctx).whatsappOutboxDoc(match.id), {
      status: event.status,
      providerStatusAt: event.timestamp,
      ...(event.errorMessage ? { lastError: event.errorMessage } : {}),
      updatedAt: new Date().toISOString(),
    });
    const messageId = String(current.messageId || match.id);
    if (current.campaignId && current.campaignLeadId) {
      const campaignLeadRef = tenantRepo(ctx).campaignLeadDoc(String(current.campaignLeadId));
      const campaignLeadSnap = await getDoc(campaignLeadRef);
      if (campaignLeadSnap.exists()) {
        const oldLead = campaignLeadSnap.data() as any;
        const oldDelivery = String(oldLead.whatsappDeliveryStatus || '').toUpperCase();
        const mapped = event.status === 'READ' ? 'READ' : event.status === 'DELIVERED' ? 'DELIVERED' : event.status === 'FAILED' ? 'FAILED' : 'SENT';
        await updateDoc(campaignLeadRef, {
          whatsappSendStatus: mapped,
          whatsappDeliveryStatus: event.status,
          whatsappLastError: event.errorMessage || null,
          whatsappStatusUpdatedAt: event.timestamp,
          updatedAt: new Date().toISOString(),
        });
        const campaignRef = tenantRepo(ctx).campaignDoc(String(current.campaignId));
        const campaignSnap = await getDoc(campaignRef);
        if (campaignSnap.exists()) {
          const campaign = campaignSnap.data() as any;
          const updates: Record<string, number> = {};
          if (['DELIVERED','READ'].includes(event.status) && !['DELIVERED','READ'].includes(oldDelivery)) {
            updates.whatsappDeliveredCount = Number(campaign.whatsappDeliveredCount || 0) + 1;
          }
          if (event.status === 'FAILED' && oldDelivery !== 'FAILED') {
            updates.whatsappFailedCount = Number(campaign.whatsappFailedCount || 0) + 1;
          }
          if (Object.keys(updates).length) await updateDoc(campaignRef, { ...updates, updatedAt: new Date().toISOString() });
        }
      }
    }
    const messageSnap = await getDoc(tenantRepo(ctx).messageDoc(messageId));
    if (messageSnap.exists()) {
      await updateDoc(tenantRepo(ctx).messageDoc(messageId), {
        deliveryStatus: event.status,
        statusUpdatedAt: event.timestamp,
        ...(event.errorMessage ? { deliveryError: event.errorMessage } : {}),
      });
    }
  }
}

async function processNormalizedEvents(
  ctx: TenantContext,
  connection: WhatsAppProviderConnection,
  events: NormalizedWhatsAppEvent[]
): Promise<{ accepted: number; duplicates: number }> {
  const stats = { accepted: 0, duplicates: 0 };
  for (const event of events) {
    if (!event.providerMessageId || event.connectionId !== connection.connectionId || event.provider !== connection.provider) continue;
    if (event.kind === 'INBOUND_MESSAGE' && normalizePhone(event.businessPhone) !== normalizePhone(connection.sender.phoneNumber)) continue;

    const claimed = await claimWebhookEvent(ctx, event);
    if (!claimed) { stats.duplicates++; continue; }
    try {
      if (event.kind === 'MESSAGE_STATUS') {
        await persistMessageStatus(ctx, event);
      } else {
        const pipeline = await import('./whatsappInboundPipeline.js');
        const result = await pipeline.processLiveInboundWhatsApp({
          from: event.senderPhone,
          fromName: event.senderName,
          to: event.businessPhone,
          body: event.text || (event.media?.length ? '[WhatsApp media message]' : ''),
          messageId: event.providerMessageId,
          providerConversationId: event.providerConversationId,
          direction: 'INBOUND',
          connectionId: connection.connectionId,
          provider: connection.provider,
          media: event.media,
        }, ctx);
        if (result.processed) {
          const { recordTenantUsage } = await import('./usageService.js');
          await recordTenantUsage(ctx.tenantId, { whatsappMessageCount: 1 }).catch(() => {});
        }
      }
      stats.accepted++;
    } catch (error: any) {
      console.error('[WhatsApp Provider] Event processing failed:', error?.message || error);
      throw error;
    }
  }
  if (stats.accepted) await updateWhatsAppProviderWebhookStatus(ctx, connection.connectionId, 'ACTIVE', { lastEventAt: new Date().toISOString() });
  return stats;
}

function externalUrl(req: any): string {
  const origin = publicOrigin(req);
  const raw = String(req.originalUrl || req.url || '');
  if (/^https?:\/\//i.test(raw)) return raw;
  return origin + raw;
}

export async function handleWhatsAppProviderWebhook(
  req: any,
  res: any,
  providerValue: string,
  routeId: string
): Promise<boolean> {
  const provider = assertProvider(providerValue);
  const route = await resolveWhatsAppProviderWebhookRoute(routeId);
  if (!route || route.provider !== provider) {
    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'WhatsApp webhook route not found.' }));
    return true;
  }

  const ctx: TenantContext = { tenantId: route.tenantId, uid: 'whatsapp-provider-webhook', email: 'whatsapp-provider@system.local', role: 'admin' };
  const connection = await getWhatsAppProviderConnection(ctx, route.connectionId);
  if (!connection || connection.status !== 'CONNECTED') {
    res.statusCode = 410;
    res.end(JSON.stringify({ error: 'WhatsApp connection is inactive.' }));
    return true;
  }

  if (req.method === 'GET') {
    // Meta uses its platform-level verify token; Twilio/WATI use a callback reachability check.
    const parsed = new URL(req.url || '/', 'https://localhost');
    const mode = parsed.searchParams.get('hub.mode');
    const token = parsed.searchParams.get('hub.verify_token');
    const challenge = parsed.searchParams.get('hub.challenge');
    if (provider === 'META' && mode === 'subscribe' &&
        token && token === process.env.META_WEBHOOK_VERIFY_TOKEN && challenge) {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/plain');
      res.end(challenge);
    } else {
      res.statusCode = provider === 'META' ? 403 : 200;
      res.end(provider === 'META' ? 'Verification failed' : 'WhatsApp webhook endpoint active');
    }
    return true;
  }

  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.end(JSON.stringify({ error: 'POST only.' }));
    return true;
  }

  try {
    const credentials = await getWhatsAppProviderCredentials(ctx, connection.connectionId);
    const adapter = getWhatsAppProviderAdapter(provider);
    const request: WhatsAppWebhookRequest = {
      method: String(req.method || 'POST'),
      url: externalUrl(req),
      headers: req.headers || {},
      rawBody: req.rawBody,
      body: req.body || {},
    };
    if (!(await adapter.verifyWebhook(request, credentials))) {
      res.statusCode = 403;
      res.end(JSON.stringify({ error: 'WhatsApp webhook signature validation failed.' }));
      return true;
    }
    const events = await adapter.normalizeWebhook(request, connection.connectionId);
    const normalized = events.map((event) => event.kind === 'INBOUND_MESSAGE' && event.provider === 'WATI'
      ? { ...event, businessPhone: connection.sender.phoneNumber }
      : event);
    const result = await processNormalizedEvents(ctx, connection, normalized);
    res.statusCode = 200;
    res.end(JSON.stringify({ received: true, accepted: result.accepted, duplicates: result.duplicates }));
  } catch (error: any) {
    console.error('[WhatsApp Provider Webhook] Processing error:', error?.message || error);
    res.statusCode = statusCode(error) >= 500 ? 500 : statusCode(error);
    res.end(JSON.stringify({ error: error?.message || 'WhatsApp provider webhook processing failed.' }));
  }
  return true;
}

/** Meta uses one platform callback URL; route each event by its phone_number_id. */
export async function handleMetaProviderWebhook(req: any, res: any): Promise<boolean> {
  if (req.method === 'GET') {
    const parsed = new URL(req.url || '/', 'https://localhost');
    const mode = parsed.searchParams.get('hub.mode') || parsed.searchParams.get('hub_mode');
    const token = parsed.searchParams.get('hub.verify_token') || parsed.searchParams.get('hub_verify_token');
    const challenge = parsed.searchParams.get('hub.challenge') || parsed.searchParams.get('hub_challenge');
    if (mode === 'subscribe' && token && token === process.env.META_WEBHOOK_VERIFY_TOKEN && challenge) {
      res.statusCode = 200; res.setHeader('Content-Type', 'text/plain'); res.end(challenge);
    } else {
      res.statusCode = 403; res.end('Verification failed');
    }
    return true;
  }
  const body = req.body || {};
  const phoneId = String(body?.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id || '');
  if (!phoneId) {
    return false;
  }
  const routeSnap = await getDoc(globalWhatsAppPhoneRouteDoc(phoneId));
  if (!routeSnap.exists()) return false; // Let the legacy Meta handler process existing Embedded Signup connections.
  const route = routeSnap.data() as any;
  if (!route?.tenantId || !route?.connectionId || route.provider !== 'META') {
    res.statusCode = 404; res.end(JSON.stringify({ error: 'Meta WhatsApp connection route is invalid.' })); return true;
  }
  const ctx: TenantContext = { tenantId: String(route.tenantId), uid: 'meta-provider-webhook', email: 'meta-provider@system.local', role: 'admin' };
  const connection = await getWhatsAppProviderConnection(ctx, String(route.connectionId));
  if (!connection || connection.status !== 'CONNECTED') {
    res.statusCode = 410; res.end(JSON.stringify({ error: 'Meta WhatsApp connection is inactive.' })); return true;
  }
  try {
    const credentials = await getWhatsAppProviderCredentials(ctx, connection.connectionId);
    const adapter = getWhatsAppProviderAdapter('META');
    const request: WhatsAppWebhookRequest = {
      method: String(req.method || 'POST'),
      url: externalUrl(req),
      headers: req.headers || {},
      rawBody: req.rawBody,
      body,
    };
    if (!(await adapter.verifyWebhook(request, credentials))) {
      res.statusCode = 403; res.end(JSON.stringify({ error: 'Meta webhook signature validation failed.' })); return true;
    }
    const events = await adapter.normalizeWebhook(request, connection.connectionId);
    const result = await processNormalizedEvents(ctx, connection, events);
    res.statusCode = 200;
    res.end(JSON.stringify({ received: true, accepted: result.accepted, duplicates: result.duplicates }));
  } catch (error: any) {
    console.error('[Meta Provider Webhook] Processing error:', error?.message || error);
    res.statusCode = statusCode(error) >= 500 ? 500 : statusCode(error);
    res.end(JSON.stringify({ error: error?.message || 'Meta WhatsApp webhook processing failed.' }));
  }
  return true;
}
