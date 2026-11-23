import crypto from 'node:crypto';
import {
  createDoc,
  deleteDoc,
  getDoc,
  getDocs,
  updateDoc,
} from './adminFirestore.js';
import { decryptSecret, encryptSecret, generateWebhookId } from './cryptoUtils.js';
import {
  assertValidTenantId,
  globalWhatsAppProviderRouteDoc,
  globalWhatsAppPhoneRouteDoc,
  globalWhatsAppSenderClaimDoc,
  tenantRepo,
} from './tenantRepo.js';
import type { TenantContext } from '../types/tenant.js';
import type {
  WhatsAppConnectionStatus,
  WhatsAppProvider,
  WhatsAppProviderConnection,
  WhatsAppProviderCredentials,
  WhatsAppProviderValidation,
  WhatsAppSender,
  WhatsAppWebhookStatus,
} from './whatsappProviderTypes.js';

const CREDENTIAL_SECRET_PREFIX = 'whatsapp_provider_';

export class WhatsAppProviderConnectionError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = 'WhatsAppProviderConnectionError';
    this.statusCode = statusCode;
  }
}

function normalizeConnectionId(value: string): string {
  const id = String(value || '').trim();
  if (!/^[a-f0-9]{32}$/.test(id)) {
    throw new WhatsAppProviderConnectionError(400, 'Invalid WhatsApp connection ID.');
  }
  return id;
}

function assertE164(phoneNumber: string): string {
  const normalized = String(phoneNumber || '').trim();
  if (!/^\+[1-9]\d{7,14}$/.test(normalized)) {
    throw new WhatsAppProviderConnectionError(400, 'The connected WhatsApp sender must use E.164 format.');
  }
  return normalized;
}

function assertProvider(provider: string): asserts provider is WhatsAppProvider {
  if (!['META', 'TWILIO', 'WATI'].includes(provider)) {
    throw new WhatsAppProviderConnectionError(400, 'Unsupported WhatsApp provider.');
  }
}

function sanitizeCredentials(value: WhatsAppProviderCredentials): WhatsAppProviderCredentials {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new WhatsAppProviderConnectionError(400, 'Provider credentials are required.');
  }

  const entries = Object.entries(value);
  if (!entries.length || entries.length > 30) {
    throw new WhatsAppProviderConnectionError(400, 'Provider credentials are incomplete or invalid.');
  }

  const result: WhatsAppProviderCredentials = {};
  for (const [key, raw] of entries) {
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(key) || typeof raw !== 'string') {
      throw new WhatsAppProviderConnectionError(400, 'Provider credentials contain an invalid field.');
    }
    const secret = raw.trim();
    if (!secret || secret.length > 12000) {
      throw new WhatsAppProviderConnectionError(400, `Credential "${key}" is empty or too large.`);
    }
    result[key] = secret;
  }
  return result;
}

function senderMatches(left: WhatsAppSender, right: WhatsAppSender): boolean {
  return left.providerSenderId === right.providerSenderId &&
    assertE164(left.phoneNumber) === assertE164(right.phoneNumber);
}

function senderClaimKey(phoneNumber: string): string {
  return crypto.createHash('sha256').update(assertE164(phoneNumber)).digest('hex');
}

function connectionSecretName(connectionId: string): string {
  return CREDENTIAL_SECRET_PREFIX + normalizeConnectionId(connectionId);
}

function isAlreadyExistsError(error: unknown): boolean {
  const code = String((error as any)?.code || '').toUpperCase();
  return code === '6' || code === 'ALREADY_EXISTS' || /already exists|duplicate key/i.test(String((error as any)?.message || ''));
}

/**
 * Persist a connection only after its provider adapter has validated the credentials
 * and confirmed that the selected sender belongs to the authenticated provider account.
 *
 * Credentials are encrypted in the tenant secrets collection. They are never returned
 * by list/get operations and never written to global routing documents.
 */
export async function createWhatsAppProviderConnection(
  ctx: TenantContext,
  input: {
    provider: WhatsAppProvider;
    displayName?: string;
    sender: WhatsAppSender;
    credentials: WhatsAppProviderCredentials;
    validation: WhatsAppProviderValidation;
    webhookBaseUrl?: string;
  }
): Promise<{ connection: WhatsAppProviderConnection; webhookRouteId: string }> {
  const tenantId = assertValidTenantId(ctx.tenantId);
  assertProvider(input.provider);

  if (!input.validation?.valid || !Array.isArray(input.validation.senders)) {
    throw new WhatsAppProviderConnectionError(422, 'Provider credentials must pass validation before the connection can be saved.');
  }

  const selectedSender: WhatsAppSender = {
    ...input.sender,
    phoneNumber: assertE164(input.sender?.phoneNumber),
    providerSenderId: String(input.sender?.providerSenderId || '').trim(),
  };
  if (!selectedSender.providerSenderId || selectedSender.providerSenderId.length > 256) {
    throw new WhatsAppProviderConnectionError(400, 'The provider did not return a valid sender identifier.');
  }

  const discoveredSender = input.validation.senders.find((candidate) =>
    candidate.providerSenderId === selectedSender.providerSenderId &&
    assertE164(candidate.phoneNumber) === selectedSender.phoneNumber
  );
  if (!discoveredSender) {
    throw new WhatsAppProviderConnectionError(403, 'The selected sender was not returned by the authenticated provider account.');
  }

  const capabilities = input.validation.capabilities;
  if (!capabilities || typeof capabilities.textMessages !== 'boolean' ||
      typeof capabilities.inboundWebhooks !== 'boolean') {
    throw new WhatsAppProviderConnectionError(422, 'The provider capability response is incomplete.');
  }

  const credentials = sanitizeCredentials(input.credentials);
  const connectionId = crypto.randomBytes(16).toString('hex');
  const webhookRouteId = generateWebhookId('wa');
  if (input.provider === 'TWILIO' && input.webhookBaseUrl) {
    credentials.statusCallbackUrl = `${input.webhookBaseUrl.replace(/\/+$/, '')}/api/webhooks/whatsapp/TWILIO/${webhookRouteId}`;
  }
  const secretName = connectionSecretName(connectionId);
  const now = new Date().toISOString();

  const connection: WhatsAppProviderConnection = {
    connectionId,
    tenantId,
    provider: input.provider,
    displayName: String(input.displayName || input.validation.accountName || input.provider).trim().slice(0, 100),
    status: 'CONNECTED',
    sender: {
      ...discoveredSender,
      phoneNumber: selectedSender.phoneNumber,
    },
    providerAccountId: input.validation.providerAccountId,
    capabilities: { ...capabilities },
    webhook: { routeId: webhookRouteId, status: 'PENDING' },
    credentialsRef: secretName,
    createdAt: now,
    updatedAt: now,
    connectedAt: now,
  };

  const secretRef = tenantRepo(ctx).secretDoc(secretName);
  const connectionRef = tenantRepo(ctx).whatsappConnectionDoc(connectionId);
  const routeRef = globalWhatsAppProviderRouteDoc(webhookRouteId);
  const claimRef = globalWhatsAppSenderClaimDoc(senderClaimKey(selectedSender.phoneNumber));
  const metaRouteRef = input.provider === 'META'
    ? globalWhatsAppPhoneRouteDoc(selectedSender.providerSenderId)
    : null;

  let claimCreated = false;
  let secretCreated = false;
  let connectionCreated = false;
  let routeCreated = false;
  let metaRouteCreated = false;

  try {
    await createDoc(claimRef, {
      tenantId,
      connectionId,
      provider: input.provider,
      phoneNumber: selectedSender.phoneNumber,
      createdAt: now,
    });
    claimCreated = true;

    await createDoc(secretRef, {
      ...encryptSecret(JSON.stringify(credentials)),
      name: secretName,
      createdAt: now,
      updatedAt: now,
    });
    secretCreated = true;

    await createDoc(connectionRef, connection);
    connectionCreated = true;

    await createDoc(routeRef, {
      routeId: webhookRouteId,
      tenantId,
      connectionId,
      provider: input.provider,
      senderPhoneNumber: selectedSender.phoneNumber,
      active: true,
      createdAt: now,
    });
    routeCreated = true;
    if (metaRouteRef) {
      await createDoc(metaRouteRef, {
        tenantId, connectionId, provider: 'META', phoneNumberId: selectedSender.providerSenderId,
        routeId: webhookRouteId, active: true, createdAt: now,
      });
      metaRouteCreated = true;
    }
  } catch (error) {
    await Promise.all([
      ...(metaRouteCreated && metaRouteRef ? [deleteDoc(metaRouteRef)] : []),
      ...(routeCreated ? [deleteDoc(routeRef)] : []),
      ...(connectionCreated ? [deleteDoc(connectionRef)] : []),
      ...(secretCreated ? [deleteDoc(secretRef)] : []),
      ...(claimCreated ? [deleteDoc(claimRef)] : []),
    ].map((operation) => operation.catch(() => undefined)));

    if (isAlreadyExistsError(error)) {
      throw new WhatsAppProviderConnectionError(409, 'This WhatsApp sender is already connected to an Amaavigo workspace.');
    }
    throw error;
  }

  return { connection, webhookRouteId };
}

export async function listWhatsAppProviderConnections(
  ctx: TenantContext
): Promise<WhatsAppProviderConnection[]> {
  const snapshot = await getDocs(tenantRepo(ctx).whatsappConnections());
  return snapshot.docs
    .map((item) => item.data() as WhatsAppProviderConnection)
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

export async function getWhatsAppProviderConnection(
  ctx: TenantContext,
  connectionId: string
): Promise<WhatsAppProviderConnection | null> {
  const snapshot = await getDoc(tenantRepo(ctx).whatsappConnectionDoc(normalizeConnectionId(connectionId)));
  if (!snapshot.exists()) return null;
  const connection = snapshot.data() as WhatsAppProviderConnection;
  if (connection.tenantId !== assertValidTenantId(ctx.tenantId)) {
    throw new WhatsAppProviderConnectionError(403, 'This WhatsApp connection belongs to another workspace.');
  }
  return connection;
}

/** Server-only credential access. Never expose this result from an API response. */
export async function getWhatsAppProviderCredentials(
  ctx: TenantContext,
  connectionId: string
): Promise<WhatsAppProviderCredentials> {
  const connection = await getWhatsAppProviderConnection(ctx, connectionId);
  if (!connection || connection.status !== 'CONNECTED') {
    throw new WhatsAppProviderConnectionError(409, 'The WhatsApp provider connection is not active.');
  }

  const secretSnapshot = await getDoc(tenantRepo(ctx).secretDoc(connection.credentialsRef));
  if (!secretSnapshot.exists()) {
    throw new WhatsAppProviderConnectionError(409, 'Provider credentials are unavailable. Reconnect this WhatsApp account.');
  }

  try {
    const raw = decryptSecret(secretSnapshot.data() as any);
    const parsed = JSON.parse(raw);
    return sanitizeCredentials(parsed as WhatsAppProviderCredentials);
  } catch {
    throw new WhatsAppProviderConnectionError(500, 'Provider credentials could not be decrypted. Rotate the connection credentials.');
  }
}

export async function updateWhatsAppProviderConnectionStatus(
  ctx: TenantContext,
  connectionId: string,
  status: WhatsAppConnectionStatus
): Promise<void> {
  const connection = await getWhatsAppProviderConnection(ctx, connectionId);
  if (!connection) throw new WhatsAppProviderConnectionError(404, 'WhatsApp connection not found.');

  const now = new Date().toISOString();
  await updateDoc(tenantRepo(ctx).whatsappConnectionDoc(connection.connectionId), {
    status,
    updatedAt: now,
    ...(status === 'DISCONNECTED' ? { disconnectedAt: now } : {}),
  });
}

export async function updateWhatsAppProviderWebhookStatus(
  ctx: TenantContext,
  connectionId: string,
  status: WhatsAppWebhookStatus,
  details?: { lastEventAt?: string; lastError?: string; subscriptionId?: string }
): Promise<void> {
  const connection = await getWhatsAppProviderConnection(ctx, connectionId);
  if (!connection) throw new WhatsAppProviderConnectionError(404, 'WhatsApp connection not found.');

  await updateDoc(tenantRepo(ctx).whatsappConnectionDoc(connection.connectionId), {
    webhook: {
      ...connection.webhook,
      status,
      ...(details?.lastEventAt ? { lastEventAt: details.lastEventAt } : {}),
      ...(details?.lastError ? { lastError: details.lastError.slice(0, 500) } : {}),
      ...(details?.subscriptionId ? { subscriptionId: details.subscriptionId } : {}),
    },
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Retain the connection record for conversation history, but remove its route,
 * sender claim and secret so no new webhook or outbound send can use it.
 */
export async function disconnectWhatsAppProviderConnection(
  ctx: TenantContext,
  connectionId: string
): Promise<void> {
  const connection = await getWhatsAppProviderConnection(ctx, connectionId);
  if (!connection) throw new WhatsAppProviderConnectionError(404, 'WhatsApp connection not found.');

  const now = new Date().toISOString();
  await updateDoc(tenantRepo(ctx).whatsappConnectionDoc(connection.connectionId), {
    status: 'DISCONNECTED',
    disconnectedAt: now,
    updatedAt: now,
    webhook: { ...connection.webhook, status: 'DISABLED' },
  });

  await Promise.all([
    ...(connection.provider === 'META' ? [deleteDoc(globalWhatsAppPhoneRouteDoc(connection.sender.providerSenderId)).catch(() => undefined)] : []),
    deleteDoc(globalWhatsAppProviderRouteDoc(connection.webhook.routeId)).catch(() => undefined),
    deleteDoc(globalWhatsAppSenderClaimDoc(senderClaimKey(connection.sender.phoneNumber))).catch(() => undefined),
    deleteDoc(tenantRepo(ctx).secretDoc(connection.credentialsRef)).catch(() => undefined),
  ]);
}

/** Resolve an opaque callback route to tenant/connection metadata; credentials stay tenant-scoped. */
export async function resolveWhatsAppProviderWebhookRoute(
  routeId: string
): Promise<{
  tenantId: string;
  connectionId: string;
  provider: WhatsAppProvider;
  senderPhoneNumber: string;
} | null> {
  const id = String(routeId || '').trim();
  if (!/^wa_[a-f0-9]{32}$/.test(id)) return null;

  const snapshot = await getDoc(globalWhatsAppProviderRouteDoc(id));
  if (!snapshot.exists()) return null;
  const route = snapshot.data() as any;
  if (route.active !== true || !route.tenantId || !route.connectionId || !route.provider) return null;

  return {
    tenantId: assertValidTenantId(String(route.tenantId)),
    connectionId: normalizeConnectionId(String(route.connectionId)),
    provider: route.provider as WhatsAppProvider,
    senderPhoneNumber: assertE164(String(route.senderPhoneNumber || '')),
  };
}
