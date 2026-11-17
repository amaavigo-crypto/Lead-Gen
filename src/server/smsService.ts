import crypto from 'node:crypto';
import twilio from 'twilio';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { waitUntil } from '@vercel/functions';
import { getDoc, getDocs, setDoc, updateDoc, query, where, limit, runTransaction } from './adminFirestore.js';
import { tenantRepo, globalSmsWebhookRouteDoc } from './tenantRepo.js';
import { encryptSecret, decryptSecret } from './cryptoUtils.js';
import type { TenantContext } from '../types/tenant.js';

export type SmsProvider = 'TWILIO' | 'VONAGE';
type Credentials = { accountSid: string; authToken: string } | { apiKey: string; apiSecret: string };
type CapabilityState = 'SUPPORTED' | 'NOT_SUPPORTED' | 'NEEDS_SETUP' | 'UNKNOWN';
type Connection = {
  provider: SmsProvider; sender: string; senderNumber?: string; countryCode: string; senderRegistrationVerified?: boolean;
  connectionId: string; webhookToken: string; webhookBaseUrl: string;
  credentialsEncrypted: ReturnType<typeof encryptSecret>; connectedAt: string; lastCapabilities?: any;
};
const makeId = (prefix: string) => prefix + '-' + crypto.randomUUID();
const hashPhone = (phone: string) => crypto.createHash('sha256').update(phone).digest('hex');
const baseUrl = () => String(process.env.PUBLIC_APP_URL || process.env.APP_BASE_URL || 'https://leads.amaavigo.com').replace(/\/$/, '');
const cap = (status: CapabilityState, detail: string) => ({ status, detail });
const e164 = (raw: unknown): string => {
  const value = String(raw || '').trim().replace(/[\s().-]/g, '');
  return /^\+[1-9]\d{6,14}$/.test(value) ? value : '';
};
const basic = (user: string, password: string) => Buffer.from(user + ':' + password).toString('base64');
const decodeCredentials = (c: Connection): Credentials => JSON.parse(decryptSecret(c.credentialsEncrypted)) as Credentials;
async function getConnection(ctx: TenantContext): Promise<Connection | null> {
  const snap = await getDoc(tenantRepo(ctx).settingsDoc('sms'));
  if (!snap.exists()) return null;
  const data = snap.data() as any;
  return data?.provider && data?.credentialsEncrypted && data?.webhookToken ? data as Connection : null;
}
async function twilioAccountCheck(c: Extract<Credentials, { accountSid: string }>) {
  const url = 'https://api.twilio.com/2010-04-01/Accounts/' + encodeURIComponent(c.accountSid) + '.json';
  const response = await fetch(url, { headers: { Authorization: 'Basic ' + basic(c.accountSid, c.authToken) } });
  const data: any = await response.json().catch(() => ({}));
  if (!response.ok || data.status !== 'active') throw new Error(data.message || 'Twilio Account SID/Auth Token could not be verified.');
}
async function vonageAccountCheck(c: Extract<Credentials, { apiKey: string }>) {
  const url = new URL('https://rest.nexmo.com/account/get-balance');
  url.searchParams.set('api_key', c.apiKey);
  url.searchParams.set('api_secret', c.apiSecret);
  const response = await fetch(url);
  const data: any = await response.json().catch(() => ({}));
  if (!response.ok || data['error-code'] || data.value === undefined) throw new Error(data['error-code-label'] || 'Vonage API credentials could not be verified.');
}
async function twilioCountry(c: Extract<Credentials, { accountSid: string }>, country: string) {
  const url = 'https://pricing.twilio.com/v1/Messaging/Countries/' + encodeURIComponent(country);
  const response = await fetch(url, { headers: { Authorization: 'Basic ' + basic(c.accountSid, c.authToken) } });
  const data: any = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || 'Twilio country availability check failed.');
  return data;
}
async function twilioNumber(c: Extract<Credentials, { accountSid: string }>, number: string) {
  const url = new URL('https://api.twilio.com/2010-04-01/Accounts/' + c.accountSid + '/IncomingPhoneNumbers.json');
  url.searchParams.set('PhoneNumber', number);
  url.searchParams.set('PageSize', '20');
  const response = await fetch(url, { headers: { Authorization: 'Basic ' + basic(c.accountSid, c.authToken) } });
  const data: any = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || 'Twilio sender-number lookup failed.');
  return (data.incoming_phone_numbers || []).find((n: any) => n.phone_number === number) || null;
}
async function vonageCountry(c: Extract<Credentials, { apiKey: string }>, country: string) {
  const url = new URL('https://api.nexmo.com/v2/account/pricing/sms-outbound');
  url.searchParams.set('country', country);
  const response = await fetch(url, { headers: { Authorization: 'Basic ' + basic(c.apiKey, c.apiSecret) } });
  const data: any = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || data.title || 'Vonage country route check failed.');
  return data;
}
async function vonageNumber(c: Extract<Credentials, { apiKey: string }>, number: string) {
  const url = new URL('https://rest.nexmo.com/account/numbers');
  url.searchParams.set('api_key', c.apiKey);
  url.searchParams.set('api_secret', c.apiSecret);
  const response = await fetch(url);
  const data: any = await response.json().catch(() => ({}));
  if (!response.ok || data['error-code']) throw new Error(data['error-code-label'] || 'Vonage number lookup failed.');
  const normalized = number.replace(/\D/g, '');
  return (data.numbers || []).find((n: any) => String(n.msisdn || '').replace(/\D/g, '') === normalized) || null;
}

export async function evaluateSmsCapabilities(provider: SmsProvider, credentials: Credentials, countryInput: string, sender: string, senderNumber?: string, senderRegistrationVerified = false) {
  const country = String(countryInput || '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) throw new Error('Choose a destination country.');
  const checkedAt = new Date().toISOString();
  if (provider === 'TWILIO') {
    const c = credentials as Extract<Credentials, { accountSid: string }>;
    const pricing = await twilioCountry(c, country);
    const outboundPrices = Array.isArray(pricing.outboundSmsPrices) ? pricing.outboundSmsPrices : [];
    const inboundPrices = Array.isArray(pricing.inboundSmsPrices) ? pricing.inboundSmsPrices : [];
    const outboundNumber = e164(sender) ? await twilioNumber(c, sender).catch(() => null) : null;
    const inboundNumberValue = e164(senderNumber || sender) ? String(senderNumber || sender) : '';
    const inboundNumber = inboundNumberValue ? await twilioNumber(c, inboundNumberValue).catch(() => null) : null;
    const outboundRoute = outboundPrices.length > 0;
    const outboundSenderOwned = Boolean(outboundNumber?.capabilities?.sms);
    const inbound = inboundPrices.length > 0 && Boolean(inboundNumber?.capabilities?.sms);
    const priceValues = outboundPrices.flatMap((x: any) => x.prices || []).map((x: any) => Number(x.currentPrice)).filter((n: number) => Number.isFinite(n) && n > 0);
    const outboundStatus: CapabilityState = !outboundRoute ? 'NOT_SUPPORTED' : e164(sender) ? (outboundSenderOwned ? 'SUPPORTED' : 'NEEDS_SETUP') : (senderRegistrationVerified ? 'SUPPORTED' : 'NEEDS_SETUP');
    return {
      provider, countryCode: country, sender, checkedAt,
      outbound: cap(outboundStatus, !outboundRoute
        ? 'Twilio does not list an outbound SMS route for this country.'
        : e164(sender) && outboundSenderOwned
          ? 'Twilio lists this destination route and the selected sender is an SMS-capable number owned by this account. Local registration and carrier rules still apply.'
          : e164(sender)
            ? 'Twilio lists the destination route, but the selected sender is not verified as an SMS-capable number owned by this account.'
            : senderRegistrationVerified ? 'The workspace confirms this alphanumeric sender ID is registered for this country. Twilio and carriers still enforce sender registration.' : 'Twilio lists the destination route, but the selected alphanumeric sender ID cannot be verified by this connection. Complete country-specific sender registration and confirm it below before sending.'),
      inbound: cap(inbound ? 'SUPPORTED' : inboundPrices.length === 0 ? 'NOT_SUPPORTED' : 'NEEDS_SETUP',
        inbound ? 'The selected inbound number is owned by this account, is SMS-capable, and Twilio lists inbound SMS pricing for this country.' :
        inboundPrices.length === 0 ? 'Twilio does not list inbound SMS pricing for this country.' :
        'Select an SMS-capable Twilio phone number owned by this account to receive replies. Alphanumeric sender IDs cannot receive replies.'),
      deliveryTracking: cap(outboundRoute && outboundStatus === 'SUPPORTED' ? 'SUPPORTED' : outboundRoute ? 'NEEDS_SETUP' : 'NOT_SUPPORTED',
        outboundRoute ? 'Twilio supports per-message status callbacks for this route. Final delivery receipts still depend on carrier reporting.' : 'No outbound route is available for delivery tracking.'),
      priceCurrency: pricing.priceUnit || undefined,
      startingPrice: priceValues.length ? Math.min(...priceValues).toFixed(4) : undefined,
    };
  }
  const c = credentials as Extract<Credentials, { apiKey: string }>;
  const inboundNumberValue = senderNumber || (e164(sender) ? sender : '');
  const [pricing, outboundNumber, inboundNumber] = await Promise.all([
    vonageCountry(c, country),
    e164(sender) ? vonageNumber(c, sender).catch(() => null) : Promise.resolve(null),
    inboundNumberValue ? vonageNumber(c, inboundNumberValue).catch(() => null) : Promise.resolve(null),
  ]);
  const routeAvailable = Boolean(pricing.pricing && Object.keys(pricing.pricing).length);
  const outboundNumberReady = Boolean(outboundNumber && (outboundNumber.features || []).includes('SMS'));
  const inbound = Boolean(inboundNumber && (inboundNumber.features || []).includes('SMS'));
  const outboundStatus: CapabilityState = !routeAvailable ? 'UNKNOWN' : e164(sender) ? (outboundNumberReady ? 'SUPPORTED' : 'NEEDS_SETUP') : (senderRegistrationVerified ? 'SUPPORTED' : 'NEEDS_SETUP');
  return {
    provider, countryCode: country, sender, checkedAt,
    outbound: cap(outboundStatus, !routeAvailable
      ? 'Vonage did not confirm a route; verify country coverage with Vonage before sending.'
      : e164(sender) && outboundNumberReady
        ? 'Vonage returned country-specific pricing and the selected sender is an SMS-enabled number owned by this account. Local registration rules still apply.'
        : e164(sender)
          ? 'Vonage lists country pricing, but this sender is not verified as an SMS-enabled number owned by this account.'
          : senderRegistrationVerified ? 'The workspace confirms this alphanumeric sender ID is registered for this country. Vonage and carriers still enforce sender registration.' : 'Vonage lists country pricing, but the alphanumeric sender ID cannot be verified by this connection. Complete local sender registration and confirm it below before sending.'),
    inbound: cap(inbound ? 'SUPPORTED' : 'NEEDS_SETUP', inbound
      ? 'The selected Vonage virtual number belongs to this account and supports SMS.'
      : 'Two-way SMS requires a Vonage virtual number owned by this account with SMS capability. Alphanumeric sender IDs cannot receive replies.'),
    deliveryTracking: cap(routeAvailable && outboundStatus === 'SUPPORTED' ? 'SUPPORTED' : routeAvailable ? 'NEEDS_SETUP' : 'UNKNOWN',
      routeAvailable ? 'Vonage supports delivery-receipt callbacks; carrier confirmation varies by country and network.' : 'Delivery receipt availability could not be verified for this country.'),
    priceCurrency: pricing.currency || undefined,
  };
}

export async function connectSmsProvider(ctx: TenantContext, input: any) {
  const provider = input.provider as SmsProvider;
  if (provider !== 'TWILIO' && provider !== 'VONAGE') throw new Error('Choose Twilio or Vonage.');
  const countryCode = String(input.countryCode || '').toUpperCase();
  const sender = String(input.sender || '').trim();
  if (!/^[A-Z]{2}$/.test(countryCode) || !sender) throw new Error('Destination country and sender number/ID are required.');
  const credentials = input.credentials as Credentials;
  if (provider === 'TWILIO') {
    const c = credentials as any;
    if (!/^AC[a-f0-9]{32}$/i.test(c.accountSid || '') || !c.authToken) throw new Error('Enter a valid Twilio Account SID and Auth Token.');
    await twilioAccountCheck(c);
  } else {
    const c = credentials as any;
    if (!c.apiKey || !c.apiSecret) throw new Error('Enter a valid Vonage API Key and Secret.');
    await vonageAccountCheck(c);
  }
  const senderRegistrationVerified = Boolean(input.senderRegistrationVerified);
  const capabilities = await evaluateSmsCapabilities(provider, credentials, countryCode, sender, input.senderNumber || sender, senderRegistrationVerified);
  const previous = await getConnection(ctx);
  const token = crypto.randomBytes(32).toString('hex');
  const connection: Connection = {
    provider, sender, senderNumber: String(input.senderNumber || sender).trim(), countryCode, senderRegistrationVerified,
    connectionId: makeId('smsconn'), webhookToken: token, webhookBaseUrl: baseUrl(),
    credentialsEncrypted: encryptSecret(JSON.stringify(credentials)), connectedAt: new Date().toISOString(), lastCapabilities: capabilities,
  };
  await setDoc(tenantRepo(ctx).settingsDoc('sms'), connection, { merge: false });
  await setDoc(globalSmsWebhookRouteDoc(token), { tenantId: ctx.tenantId, connectionId: connection.connectionId, provider, active: true, createdAt: new Date().toISOString() }, { merge: false });
  if (previous?.webhookToken) await updateDoc(globalSmsWebhookRouteDoc(previous.webhookToken), { active: false, replacedAt: new Date().toISOString() }).catch(() => {});
  return {
    connected: true, provider, sender, countryCode, capabilities,
    webhookUrls: {
      inbound: connection.webhookBaseUrl + '/api/webhooks/sms/' + token + '/inbound',
      delivery: connection.webhookBaseUrl + '/api/webhooks/sms/' + token + '/status',
    },
    setupInstructions: provider === 'TWILIO'
      ? 'Twilio Console → Phone Numbers → Active Numbers → select the SMS-capable number → Messaging → A MESSAGE COMES IN: paste the inbound URL and select HTTP POST. Status callback URL is added automatically to each outbound message.'
      : 'Vonage Dashboard → Settings/API Settings: configure the inbound SMS webhook and delivery receipt webhook. Use a rented SMS-enabled virtual number for replies.',
  };
}
export async function getSmsSettings(ctx: TenantContext) {
  const c = await getConnection(ctx);
  if (!c) return { connected: false };
  return {
    connected: true, provider: c.provider, sender: c.sender, senderNumber: c.senderNumber,
    countryCode: c.countryCode, connectedAt: c.connectedAt, senderRegistrationVerified: Boolean(c.senderRegistrationVerified), capabilities: c.lastCapabilities || null,
    webhookUrls: {
      inbound: c.webhookBaseUrl + '/api/webhooks/sms/' + c.webhookToken + '/inbound',
      delivery: c.webhookBaseUrl + '/api/webhooks/sms/' + c.webhookToken + '/status',
    },
  };
}
export async function refreshSmsCapabilities(ctx: TenantContext, input: any = {}) {
  const c = await getConnection(ctx);
  if (!c) throw new Error('Connect an SMS provider first.');
  const senderRegistrationVerified = input.senderRegistrationVerified === undefined ? Boolean(c.senderRegistrationVerified) : Boolean(input.senderRegistrationVerified);
  const result = await evaluateSmsCapabilities(c.provider, decodeCredentials(c), input.countryCode || c.countryCode, input.sender || c.sender, input.senderNumber || c.senderNumber, senderRegistrationVerified);
  const patch: Record<string, any> = {};
  if (!input.countryCode && !input.sender && !input.senderNumber) patch.lastCapabilities = result;
  if (input.senderRegistrationVerified !== undefined) patch.senderRegistrationVerified = senderRegistrationVerified;
  if (Object.keys(patch).length) await updateDoc(tenantRepo(ctx).settingsDoc('sms'), patch);
  return result;
}
export async function disconnectSmsProvider(ctx: TenantContext) {
  const c = await getConnection(ctx);
  if (c) await updateDoc(globalSmsWebhookRouteDoc(c.webhookToken), { active: false, disconnectedAt: new Date().toISOString() }).catch(() => {});
  await updateDoc(tenantRepo(ctx).settingsDoc('sms'), { provider: null, credentialsEncrypted: null, webhookToken: null, disconnectedAt: new Date().toISOString() }).catch(() => {});
  return { disconnected: true };
}
async function sendProvider(c: Connection, to: string, text: string, callbackUrl: string) {
  const credentials = decodeCredentials(c);
  if (c.provider === 'TWILIO') {
    const cr = credentials as Extract<Credentials, { accountSid: string }>;
    const form = new URLSearchParams({ To: to, From: c.sender, Body: text, StatusCallback: callbackUrl });
    const response = await fetch('https://api.twilio.com/2010-04-01/Accounts/' + cr.accountSid + '/Messages.json', {
      method: 'POST', headers: { Authorization: 'Basic ' + basic(cr.accountSid, cr.authToken), 'Content-Type': 'application/x-www-form-urlencoded' }, body: form,
    });
    const data: any = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || 'Twilio rejected the SMS.');
    return { id: data.sid, status: data.status || 'queued' };
  }
  const cr = credentials as Extract<Credentials, { apiKey: string }>;
  const form = new URLSearchParams({ to: to.replace(/^\+/, ''), from: c.sender, text, 'status-report-req': '1' });
  const response = await fetch('https://rest.nexmo.com/sms/json', {
    method: 'POST', headers: { Authorization: 'Basic ' + basic(cr.apiKey, cr.apiSecret), 'Content-Type': 'application/x-www-form-urlencoded' }, body: form,
  });
  const data: any = await response.json().catch(() => ({}));
  const first = (data.messages || [])[0];
  if (!response.ok || !first || String(first.status) !== '0') throw new Error(first?.['error-text'] || 'Vonage rejected the SMS.');
  return { id: first['message-id'], status: 'accepted' };
}
async function isOptedOut(ctx: TenantContext, phone: string) {
  const snap = await getDoc(tenantRepo(ctx).smsConsentDoc(hashPhone(phone)));
  return snap.exists() && (snap.data() as any).status === 'OPTED_OUT';
}
async function hasActiveSmsMarketingConsent(ctx: TenantContext, phone: string) {
  const snap = await getDoc(tenantRepo(ctx).smsConsentDoc(hashPhone(phone)));
  return snap.exists() && (snap.data() as any).status === 'OPTED_IN';
}
export async function sendSmsReply(ctx: TenantContext, input: any) {
  const c = await getConnection(ctx);
  if (!c) throw new Error('Connect an SMS provider before sending.');
  const to = e164(input.to);
  const text = String(input.text || '').trim();
  if (!to || !text || text.length > 1500) throw new Error('Enter an E.164 recipient number and a message under 1,500 characters.');
  if (await isOptedOut(ctx, to)) throw new Error('This number has opted out of SMS and cannot be messaged.');
  if (input.requireMarketingConsent && !(await hasActiveSmsMarketingConsent(ctx, to))) {
    throw new Error('An active SMS marketing opt-in is required before an automated follow-up can be sent.');
  }
  const destinationCountry = parsePhoneNumberFromString(to)?.country;
  if (!destinationCountry) throw new Error('The destination country could not be identified from this phone number.');
  const capability = await evaluateSmsCapabilities(c.provider, decodeCredentials(c), destinationCountry, c.sender, c.senderNumber, Boolean(c.senderRegistrationVerified));
  if (capability.outbound.status !== 'SUPPORTED') throw new Error(capability.outbound.detail || 'Outbound SMS is not confirmed for this destination.');
  const sent = await sendProvider(c, to, text, c.webhookBaseUrl + '/api/webhooks/sms/' + c.webhookToken + '/status');
  const messageId = makeId('sms');
  const now = new Date().toISOString();
  await setDoc(tenantRepo(ctx).smsMessageDoc(messageId), {
    messageId, tenantId: ctx.tenantId, provider: c.provider, providerMessageId: sent.id,
    conversationId: input.conversationId || null, direction: 'OUTBOUND', from: c.sender, to, text,
    status: 'SENT', providerStatus: sent.status, sentAt: now, createdAt: now, updatedAt: now,
  }, { merge: false });
  return { success: true, messageId, providerMessageId: sent.id, status: sent.status, sentAt: now };
}
async function saveConsent(ctx: TenantContext, phone: string, status: 'OPTED_IN' | 'OPTED_OUT', source: string, evidence: string) {
  const now = new Date().toISOString();
  await setDoc(tenantRepo(ctx).smsConsentDoc(hashPhone(phone)), {
    phone, status, source, evidence: evidence.slice(0, 500), updatedAt: now,
    ...(status === 'OPTED_IN' ? { consentedAt: now } : { optedOutAt: now }),
  }, { merge: true });
}
async function findContact(ctx: TenantContext, phone: string) {
  for (const candidate of [phone, phone.replace(/^\+/, '')]) {
    const snap = await getDocs(query(tenantRepo(ctx).contacts(), where('phone', '==', candidate), limit(3)));
    if (snap.docs[0]) return { id: snap.docs[0].id, data: snap.docs[0].data() as any };
  }
  return null;
}
async function saveInbound(ctx: TenantContext, c: Connection, fromValue: string, toValue: string, text: string, providerId: string) {
  let from = e164(fromValue);
  let to = e164(toValue);
  if (!to && /^\d{8,15}$/.test(toValue.replace(/\D/g, ''))) to = '+' + toValue.replace(/\D/g, '');
  if (!from && /^\d{8,15}$/.test(fromValue.replace(/\D/g, ''))) from = '+' + fromValue.replace(/\D/g, '');
  if (!from || !to || !text.trim() || !providerId) throw new Error('Invalid inbound SMS payload.');
  const repo = tenantRepo(ctx);
  const eventId = 'in-' + c.provider.toLowerCase() + '-' + providerId.replace(/[^a-zA-Z0-9_-]/g, '_');
  if ((await getDoc(repo.smsWebhookEventDoc(eventId))).exists()) return;
  const now = new Date().toISOString();
  const keyword = text.trim().toUpperCase();
  if (['STOP','STOPALL','UNSUBSCRIBE','CANCEL','END','QUIT'].includes(keyword)) await saveConsent(ctx, from, 'OPTED_OUT', 'SMS_STOP', text);
  if (['START','UNSTOP','SUBSCRIBE'].includes(keyword)) await saveConsent(ctx, from, 'OPTED_IN', 'SMS_START', text);
  const contact = await findContact(ctx, from);
  const contactId = contact?.id || 'sms-' + hashPhone(from).slice(0, 24);
  if (!contact) await setDoc(repo.contactDoc(contactId), {
    contactId, firstName: 'SMS', lastName: from, email: '', phone: from, companyName: '', jobTitle: '',
    source: 'SMS', createdAt: now, updatedAt: now, lastActivityAt: now,
  }, { merge: true });
  else await updateDoc(repo.contactDoc(contactId), { lastActivityAt: now, updatedAt: now });
  const conversationId = 'sms-' + hashPhone(from + '|' + to).slice(0, 28);
  const conversationRef = repo.conversationDoc(conversationId);
  const previous = await getDoc(conversationRef);
  const messageId = makeId('smsin');

  await setDoc(conversationRef, {
    conversationId, contactId, channel: 'SMS', direction: 'INBOUND', externalConversationId: from,
    customerPhone: from, smsSenderNumber: to, status: 'ACTIVE', aiEnabled: false, humanHandoff: false,
    lastMessageAt: now, lastMessageText: text.slice(0, 200),
    unreadCount: (previous.exists() ? Number((previous.data() as any).unreadCount || 0) : 0) + 1,
    isRead: false, unread: true,
    startedAt: previous.exists() ? (previous.data() as any).startedAt || now : now,
    createdAt: previous.exists() ? (previous.data() as any).createdAt || now : now, updatedAt: now,
  }, { merge: true });
  await setDoc(repo.messageDoc(messageId, conversationId), {
    messageId, conversationId, channel: 'SMS', senderType: 'CUSTOMER',
    senderName: contact?.data?.firstName || from, text, timestamp: now, receivedAt: now,
    createdAt: now, direction: 'INBOUND', providerMessageId: providerId,
  }, { merge: false });

  // Attribute the reply to the latest eligible campaign recipient for this phone number.
  const recipientMatches = await getDocs(query(repo.smsCampaignRecipients(), where('phone', '==', from), limit(100)));
  const latestRecipient = recipientMatches.docs
    .map((doc: any) => ({ ...(doc.data() as any), recipientId: doc.id }))
    .filter((item: any) => ['SENT', 'DELIVERED'].includes(item.status) && item.campaignId && !item.repliedAt)
    .sort((a: any, b: any) => Date.parse(String(b.sentAt || '')) - Date.parse(String(a.sentAt || '')))[0];
  if (latestRecipient) {
    const recipientRef = repo.smsCampaignRecipientDoc(latestRecipient.recipientId);
    const campaignRef = repo.smsCampaignDoc(latestRecipient.campaignId);
    await runTransaction(async (tx: any) => {
      const currentRecipientSnap = await tx.get(recipientRef);
      if (!currentRecipientSnap.exists) return;
      const currentRecipient = currentRecipientSnap.data() as any;
      if (currentRecipient.repliedAt || !['SENT', 'DELIVERED'].includes(currentRecipient.status)) return;
      const campaignSnap = await tx.get(campaignRef);
      tx.set(recipientRef, { repliedAt: now, replyMessageId: providerId, updatedAt: now }, { merge: true });
      if (campaignSnap.exists) {
        const campaignData = campaignSnap.data() as any;
        tx.set(campaignRef, { repliedCount: Number(campaignData.repliedCount || 0) + 1, updatedAt: now }, { merge: true });
      }
    });
  }
  await setDoc(repo.smsWebhookEventDoc(eventId), { eventId, provider: c.provider, providerMessageId: providerId, eventType: 'INBOUND', receivedAt: now }, { merge: false });
}
async function updateDelivery(ctx: TenantContext, providerId: string, providerStatus: string, errorCode: string) {
  if (!providerId) return;
  const snap = await getDocs(query(tenantRepo(ctx).smsMessages(), where('providerMessageId', '==', providerId), limit(5)));
  if (!snap.docs[0]) return;
  const id = snap.docs[0].id;
  const status = /delivered/i.test(providerStatus) ? 'DELIVERED' :
    /failed|undelivered|rejected|expired/i.test(providerStatus) ? 'FAILED' : 'SENT';
  const record = snap.docs[0].data() as any;
  if (['DELIVERED', 'FAILED'].includes(record.status) && status === 'SENT') return;
  const changedAt = new Date().toISOString();
  await updateDoc(tenantRepo(ctx).smsMessageDoc(id), {
    status, providerStatus, errorCode: errorCode || null, updatedAt: changedAt,
    ...(status === 'DELIVERED' ? { deliveredAt: changedAt } : {}),
  });
  if (record.conversationId) {
    const inboxMessages = await getDocs(query(tenantRepo(ctx).messages(record.conversationId), where('providerMessageId', '==', providerId), limit(5)));
    for (const message of inboxMessages.docs) {
      await updateDoc(tenantRepo(ctx).messageDoc(message.id, record.conversationId), {
        smsStatus: status, deliveryStatus: status, providerStatus, errorCode: errorCode || null,
        ...(status === 'DELIVERED' ? { deliveredAt: changedAt } : {}), updatedAt: changedAt,
      });
    }
  }
  if (record.recipientId) {
    await updateDoc(tenantRepo(ctx).smsCampaignRecipientDoc(record.recipientId), {
      status, providerStatus, errorCode: errorCode || null, updatedAt: changedAt,
      ...(status === 'DELIVERED' ? { deliveredAt: changedAt } : {}),
    }).catch(() => {});
  }
  if (status === 'DELIVERED' && record.campaignId && record.status !== 'DELIVERED') {
    const campaignRef = tenantRepo(ctx).smsCampaignDoc(record.campaignId);
    const campaignSnap = await getDoc(campaignRef);
    if (campaignSnap.exists()) {
      const campaign = campaignSnap.data() as any;
      await updateDoc(campaignRef, { deliveredCount: Number(campaign.deliveredCount || 0) + 1, updatedAt: changedAt });
    }
  }
}
export async function routeSmsWebhook(req: any, res: any, token: string, event: 'inbound' | 'status') {
  const routeSnap = await getDoc(globalSmsWebhookRouteDoc(token));
  if (!routeSnap.exists() || (routeSnap.data() as any).active !== true) { res.statusCode = 404; res.end('not found'); return true; }
  const route = routeSnap.data() as any;
  const ctx: TenantContext = { tenantId: route.tenantId, uid: 'sms-webhook', email: 'sms-webhook@system.local', role: 'admin' };
  const c = await getConnection(ctx);
  if (!c || c.connectionId !== route.connectionId) { res.statusCode = 410; res.end('connection inactive'); return true; }
  const body = { ...(req.query || {}), ...(req.body || {}) };
  if (c.provider === 'TWILIO') {
    const signature = req.headers?.['x-twilio-signature'];
    const url = c.webhookBaseUrl + (req.originalUrl || req.url || '');
    if (!signature || !twilio.validateRequest((decodeCredentials(c) as any).authToken, String(signature), url, body)) {
      res.statusCode = 403; res.end('invalid signature'); return true;
    }
  }
  try {
    if (event === 'inbound') {
      if (c.provider === 'TWILIO') await saveInbound(ctx, c, String(body.From || ''), String(body.To || ''), String(body.Body || ''), String(body.MessageSid || ''));
      else await saveInbound(ctx, c, String(body.msisdn || body.from || ''), String(body.to || c.senderNumber || c.sender), String(body.text || ''), String(body.messageId || body['message-id'] || crypto.randomUUID()));
    } else {
      if (c.provider === 'TWILIO') await updateDelivery(ctx, String(body.MessageSid || ''), String(body.MessageStatus || ''), String(body.ErrorCode || ''));
      else await updateDelivery(ctx, String(body.messageId || body['message-id'] || ''), String(body.status || ''), String(body['err-code'] || ''));
    }
    res.statusCode = 204; res.end();
  } catch (error: any) {
    console.error('[SMS webhook]', error?.message || error);
    res.statusCode = 500; res.end('webhook processing failed');
  }
  return true;
}
export async function recordSmsConsent(ctx: TenantContext, input: any) {
  const phone = e164(input.phone);
  if (!phone) throw new Error('Enter a valid E.164 phone number.');
  const status = input.status === 'OPTED_OUT' ? 'OPTED_OUT' : 'OPTED_IN';
  if (status === 'OPTED_IN' && (!String(input.source || '').trim() || !String(input.evidence || '').trim())) {
    throw new Error('Marketing opt-in requires the consent source and evidence.');
  }
  await saveConsent(ctx, phone, status, String(input.source || 'MANUAL'), String(input.evidence || ''));
  return { phone, status };
}
export async function getSmsCampaigns(ctx: TenantContext) {
  const snap = await getDocs(tenantRepo(ctx).smsCampaigns());
  return snap.docs.map((d: any) => d.data()).sort((a: any, b: any) => String(b.createdAt).localeCompare(String(a.createdAt)));
}
export async function createSmsCampaign(ctx: TenantContext, input: any) {
  const connection = await getConnection(ctx);
  if (!connection) throw new Error('Connect an SMS provider first.');
  const message = String(input.message || '').trim();
  if (!String(input.name || '').trim() || !message || message.length > 1500) throw new Error('Campaign name and an SMS message under 1,500 characters are required.');
  const repo = tenantRepo(ctx);
  const eligible: any[] = [];
  const rejected: any[] = [];
  const credentials = decodeCredentials(connection);
  const capabilitiesByCountry = new Map<string, any>();
  for (const item of (input.recipients || []).slice(0, 5000)) {
    const phone = e164(item.phone);
    if (!phone) { rejected.push({ phone: item.phone, reason: 'Invalid E.164 phone number' }); continue; }
    const parsedPhone = parsePhoneNumberFromString(phone);
    const countryCode = parsedPhone?.country;
    if (!countryCode) { rejected.push({ phone, reason: 'Destination country could not be identified from this phone number' }); continue; }
    const consent = await getDoc(repo.smsConsentDoc(hashPhone(phone)));
    if (!consent.exists() || (consent.data() as any).status !== 'OPTED_IN') { rejected.push({ phone, reason: 'No active SMS marketing consent' }); continue; }
    if (!capabilitiesByCountry.has(countryCode)) {
      try {
        capabilitiesByCountry.set(countryCode, await evaluateSmsCapabilities(
          connection.provider, credentials, countryCode, connection.sender, connection.senderNumber, Boolean(connection.senderRegistrationVerified),
        ));
      } catch (error: any) {
        capabilitiesByCountry.set(countryCode, { outbound: { status: 'UNKNOWN', detail: error?.message || 'Country capability could not be verified.' } });
      }
    }
    const countryCapabilities = capabilitiesByCountry.get(countryCode);
    if (countryCapabilities?.outbound?.status !== 'SUPPORTED') {
      rejected.push({ phone, countryCode, reason: countryCapabilities?.outbound?.detail || 'Outbound SMS is not confirmed for this destination and sender' });
      continue;
    }
    eligible.push({ ...item, phone, countryCode, recipientId: makeId('smsrec') });
  }
  if (!eligible.length) throw new Error('No eligible recipients: every contact needs a valid phone number and recorded SMS marketing consent.');
  const id = makeId('smscamp');
  const now = new Date().toISOString();
  const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt).toISOString() : null;
  const status = scheduledAt && Date.parse(scheduledAt) > Date.now() ? 'SCHEDULED' : 'RUNNING';
  const campaign = {
    campaignId: id, name: String(input.name).trim(), channel: 'SMS', message, provider: connection.provider, connectionId: connection.connectionId,
    sender: connection.sender, countryCode: connection.countryCode, status, scheduledAt,
    totalRecipients: eligible.length, eligibleCount: eligible.length, sentCount: 0, deliveredCount: 0,
    failedCount: 0, repliedCount: 0, skippedCount: rejected.length, createdAt: now, updatedAt: now, createdBy: ctx.uid,
  };
  await setDoc(repo.smsCampaignDoc(id), campaign, { merge: false });
  for (const recipient of eligible) await setDoc(repo.smsCampaignRecipientDoc(recipient.recipientId), {
    ...recipient, campaignId: id, tenantId: ctx.tenantId, status: 'PENDING', createdAt: now, updatedAt: now,
  }, { merge: false });
  if (status === 'RUNNING') waitUntil(dispatchSmsCampaign(ctx, id).catch((error) => console.error('[SMS campaign]', error?.message || error)));
  return { campaign, rejectedCount: rejected.length, rejected: rejected.slice(0, 100) };
}
async function dispatchSmsCampaign(ctx: TenantContext, campaignId: string) {
  let processed = 0;
  for (let page = 0; page < 2; page++) {
    const result = await processSmsCampaignBatch(ctx, campaignId, 25);
    processed += result.processed;
    if (result.status !== 'RUNNING' || result.remaining === 0 || result.processed === 0) break;
  }
  return { processed };
}

export async function processSmsCampaignBatch(ctx: TenantContext, campaignId: string, batchSize = 25) {
  const repo = tenantRepo(ctx);
  const campaignRef = repo.smsCampaignDoc(campaignId);
  const snapshot = await getDoc(campaignRef);
  if (!snapshot.exists()) return { processed: 0, status: 'MISSING' };
  const campaign = snapshot.data() as any;
  if (campaign.status === 'SCHEDULED' && Date.parse(campaign.scheduledAt || '') > Date.now()) return { processed: 0, status: 'SCHEDULED' };
  if (!['RUNNING', 'SCHEDULED'].includes(campaign.status)) return { processed: 0, status: campaign.status };

  const connection = await getConnection(ctx);
  if (!connection || connection.connectionId !== campaign.connectionId) {
    await updateDoc(campaignRef, {
      status: 'PAUSED',
      lastError: 'The provider connection used to create this campaign is no longer active. Reconnect the original provider or create a new campaign.',
      updatedAt: new Date().toISOString(),
    });
    return { processed: 0, status: 'PAUSED' };
  }

  const leaseId = crypto.randomUUID();
  const claimed = await runTransaction(async (tx: any) => {
    const currentSnap = await tx.get(campaignRef);
    if (!currentSnap.exists) return false;
    const current = currentSnap.data() as any;
    if (!['RUNNING', 'SCHEDULED'].includes(current.status)) return false;
    const leaseUntil = Date.parse(String(current.workerLeaseUntil || ''));
    if (Number.isFinite(leaseUntil) && leaseUntil > Date.now()) return false;
    tx.set(campaignRef, {
      workerLeaseId: leaseId,
      workerLeaseUntil: new Date(Date.now() + 2 * 60 * 1000).toISOString(),
      updatedAt: new Date().toISOString(),
    }, { merge: true });
    return true;
  });
  if (!claimed) return { processed: 0, status: 'BUSY' };

  try {
    const pending = await getDocs(query(
      repo.smsCampaignRecipients(),
      where('campaignId', '==', campaignId),
      where('status', '==', 'PENDING'),
      limit(Math.min(100, batchSize)),
    ));
    let sent = 0;
    let failed = 0;
    for (const doc of pending.docs) {
      const recipient: any = doc.data();
      try {
        if (!(await hasActiveSmsMarketingConsent(ctx, recipient.phone))) throw new Error('Recipient no longer has active SMS marketing consent.');
        const personalized = String(campaign.message)
          .replace(/{{\s*first_name\s*}}/gi, recipient.firstName || String(recipient.name || '').split(' ')[0] || '')
          .replace(/{{\s*name\s*}}/gi, recipient.name || '')
          .replace(/{{\s*company\s*}}/gi, recipient.companyName || '');
        const result = await sendProvider(
          connection,
          recipient.phone,
          personalized,
          connection.webhookBaseUrl + '/api/webhooks/sms/' + connection.webhookToken + '/status',
        );
        const now = new Date().toISOString();
        await setDoc(repo.smsMessageDoc(result.id), {
          messageId: result.id,
          tenantId: ctx.tenantId,
          provider: connection.provider,
          providerMessageId: result.id,
          campaignId,
          recipientId: recipient.recipientId,
          countryCode: recipient.countryCode,
          to: recipient.phone,
          from: connection.sender,
          text: personalized,
          direction: 'OUTBOUND',
          status: 'SENT',
          sentAt: now,
          createdAt: now,
          updatedAt: now,
        }, { merge: false });
        await updateDoc(repo.smsCampaignRecipientDoc(recipient.recipientId), {
          status: 'SENT',
          providerMessageId: result.id,
          sentAt: now,
          updatedAt: now,
        });
        sent++;
      } catch (error: any) {
        await updateDoc(repo.smsCampaignRecipientDoc(recipient.recipientId), {
          status: 'FAILED',
          lastError: String(error?.message || 'Send failed').slice(0, 400),
          updatedAt: new Date().toISOString(),
        });
        failed++;
      }
    }

    const remaining = await getDocs(query(
      repo.smsCampaignRecipients(),
      where('campaignId', '==', campaignId),
      where('status', '==', 'PENDING'),
      limit(1),
    ));
    const latest = await getDoc(campaignRef);
    const latestData = latest.data() as any;
    const status = remaining.docs.length ? 'RUNNING' : 'COMPLETED';
    await updateDoc(campaignRef, {
      sentCount: Number(latestData.sentCount || 0) + sent,
      failedCount: Number(latestData.failedCount || 0) + failed,
      status,
      completedAt: remaining.docs.length ? null : new Date().toISOString(),
      workerLeaseId: null,
      workerLeaseUntil: null,
      lastError: null,
      updatedAt: new Date().toISOString(),
    });
    return { processed: sent + failed, remaining: remaining.docs.length, status };
  } finally {
    await runTransaction(async (tx: any) => {
      const currentSnap = await tx.get(campaignRef);
      if (!currentSnap.exists) return;
      const current = currentSnap.data() as any;
      if (current.workerLeaseId === leaseId) {
        tx.set(campaignRef, { workerLeaseId: null, workerLeaseUntil: null, updatedAt: new Date().toISOString() }, { merge: true });
      }
    }).catch(() => {});
  }
}
export async function runSmsCampaignWorkerCycle(ctx: TenantContext) {
  const campaigns = await getSmsCampaigns(ctx);
  let processed = 0;
  for (const campaign of campaigns.filter((x: any) => ['RUNNING', 'SCHEDULED'].includes(x.status)).slice(0, 1)) {
    const result = await processSmsCampaignBatch(ctx, campaign.campaignId, 25);
    processed += result.processed;
  }
  return { processed };
}
export async function getSmsAnalytics(ctx: TenantContext) {
  const campaigns = await getSmsCampaigns(ctx);
  return campaigns.reduce((acc: any, c: any) => ({
    campaigns: acc.campaigns + 1, recipients: acc.recipients + Number(c.totalRecipients || 0),
    sent: acc.sent + Number(c.sentCount || 0), delivered: acc.delivered + Number(c.deliveredCount || 0),
    failed: acc.failed + Number(c.failedCount || 0), replies: acc.replies + Number(c.repliedCount || 0),
  }), { campaigns: 0, recipients: 0, sent: 0, delivered: 0, failed: 0, replies: 0 });
}


export async function getSmsTemplates(ctx: TenantContext) {
  const snapshot = await getDocs(tenantRepo(ctx).smsTemplates());
  return snapshot.docs.map((doc: any) => doc.data()).sort((a: any, b: any) => String(a.name).localeCompare(String(b.name)));
}
export async function saveSmsTemplate(ctx: TenantContext, input: any) {
  const name = String(input.name || '').trim();
  const message = String(input.message || '').trim();
  if (!name || !message || message.length > 1500) throw new Error('Template name and message under 1,500 characters are required.');
  const templateId = String(input.templateId || makeId('smstpl'));
  const now = new Date().toISOString();
  const record = { templateId, name, message, updatedAt: now, createdAt: input.createdAt || now };
  await setDoc(tenantRepo(ctx).smsTemplateDoc(templateId), record, { merge: true });
  return record;
}
