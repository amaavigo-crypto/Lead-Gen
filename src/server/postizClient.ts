import { getDoc, deleteDoc } from './adminFirestore.js';
import { safeSetDoc } from './firestoreUtils.js';
import { encryptSecret, decryptSecret } from './cryptoUtils.js';
import { globalTenantDoc, tenantRepo } from './tenantRepo.js';
import type { TenantContext } from '../types/tenant.js';

const API_SUFFIX = '/api/public/v1';
const API_TIMEOUT_MS = 30_000;

export class PostizApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly responseBody?: unknown
  ) {
    super(message);
    this.name = 'PostizApiError';
  }
}

export class PostizConfigurationError extends Error {
  constructor(message: string, public readonly status = 503) {
    super(message);
    this.name = 'PostizConfigurationError';
  }
}

/**
 * POSTIZ_BASE_URL is a server-only origin such as https://publisher.amaavigo.com.
 * The public API path is appended here so tenants cannot select an arbitrary host.
 */
export function getPostizApiBaseUrl(): string {
  const raw = String(process.env.POSTIZ_BASE_URL || '').trim();
  if (!raw) {
    throw new PostizConfigurationError(
      'Social publishing is not configured yet. The Postiz service URL is missing.'
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new PostizConfigurationError('POSTIZ_BASE_URL must be a valid URL.');
  }

  if (
    !['http:', 'https:'].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    throw new PostizConfigurationError(
      'POSTIZ_BASE_URL must be an HTTP(S) origin without credentials, query parameters or fragments.'
    );
  }

  const localHost =
    parsed.hostname === 'localhost' ||
    parsed.hostname === '127.0.0.1' ||
    parsed.hostname === '::1';
  if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') {
    throw new PostizConfigurationError(
      'POSTIZ_BASE_URL must use HTTPS in production.'
    );
  }
  if (process.env.NODE_ENV === 'production' && localHost) {
    throw new PostizConfigurationError(
      'POSTIZ_BASE_URL cannot point to localhost in production.'
    );
  }

  const cleanPath = parsed.pathname.replace(/\/+$/, '');
  const apiPath = cleanPath.endsWith(API_SUFFIX)
    ? cleanPath
    : cleanPath + API_SUFFIX;
  return parsed.origin + apiPath;
}

function safePostizMessage(body: any, fallback: string): string {
  const message =
    body?.message ||
    body?.msg ||
    body?.error_description ||
    (typeof body?.error === 'string' ? body.error : '');
  const text = String(message || fallback).replace(/[\r\n\t]+/g, ' ').trim();
  return text.slice(0, 700) || fallback;
}

export async function postizRequestWithKey<T = any>(
  apiKey: string,
  path: string,
  init: RequestInit = {}
): Promise<T> {
  if (!apiKey || typeof apiKey !== 'string') {
    throw new PostizConfigurationError('The tenant Postiz API key is not configured.', 409);
  }

  const base = getPostizApiBaseUrl();
  const normalizedPath = path.startsWith('/') ? path : '/' + path;
  const url = base + normalizedPath;
  const headers = new Headers(init.headers || {});
  headers.set('Authorization', apiKey);
  headers.set('Accept', 'application/json');

  let body = init.body;
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
  if (body !== undefined && body !== null && !isFormData && typeof body !== 'string') {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(body);
  } else if (typeof body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers,
      body,
      signal: init.signal || AbortSignal.timeout(API_TIMEOUT_MS),
      redirect: 'error',
    });
  } catch (error: any) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      throw new PostizApiError(
        'Postiz did not respond before the request timed out. Check the publishing service before retrying this action.',
        504
      );
    }
    throw new PostizApiError(
      'Could not reach the Postiz publishing service. Check its health and network connection.',
      502
    );
  }

  const responseText = await response.text().catch(() => '');
  let parsed: any = null;
  if (responseText) {
    try {
      parsed = JSON.parse(responseText);
    } catch {
      parsed = null;
    }
  }

  if (!response.ok) {
    const fallback =
      response.status === 401
        ? 'The Postiz API key was rejected. Ask the platform administrator to reconnect this workspace.'
        : response.status === 403
          ? 'Postiz refused access to this resource. Verify that this channel belongs to the configured workspace.'
          : response.status === 429
            ? 'Postiz rate limit reached. Please wait before trying again.'
            : 'Postiz could not complete the request.';
    throw new PostizApiError(
      safePostizMessage(parsed, fallback),
      response.status,
      parsed
    );
  }

  if (!responseText) return null as T;
  if (parsed === null) {
    throw new PostizApiError(
      'Postiz returned an unexpected non-JSON response. Verify the configured API URL.',
      502
    );
  }
  return parsed as T;
}

export async function getTenantPostizApiKey(ctx: TenantContext): Promise<string> {
  const snapshot = await getDoc(tenantRepo(ctx).secretDoc('postiz_api_key'));
  if (!snapshot.exists()) {
    throw new PostizConfigurationError(
      'Social Studio has not been provisioned for this workspace yet. Contact your Amaavigo administrator.',
      409
    );
  }

  try {
    const key = decryptSecret(snapshot.data() as any);
    if (!key || typeof key !== 'string') throw new Error('empty');
    return key;
  } catch {
    throw new PostizConfigurationError(
      'The saved Postiz credential could not be decrypted. Ask the platform administrator to provision this workspace again.',
      503
    );
  }
}

export async function postizRequest<T = any>(
  ctx: TenantContext,
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const apiKey = await getTenantPostizApiKey(ctx);
  return postizRequestWithKey<T>(apiKey, path, init);
}

export async function getPostizTenantMetadata(ctx: TenantContext) {
  const repository = tenantRepo(ctx);
  const [snapshot, secret] = await Promise.all([
    getDoc(repository.integrationDoc('postiz')),
    getDoc(repository.secretDoc('postiz_api_key')),
  ]);
  if (!snapshot.exists() || !secret.exists()) {
    return {
      provisioned: false,
      organizationId: null,
      configuredAt: null,
      lastVerifiedAt: null,
      connectedChannelCount: 0,
    };
  }
  const value = snapshot.data() as any;
  return {
    provisioned: Boolean(value?.status === 'connected' && value?.organizationId),
    organizationId: value?.organizationId || null,
    configuredAt: value?.configuredAt || null,
    lastVerifiedAt: value?.lastVerifiedAt || null,
    connectedChannelCount: Number(value?.connectedChannelCount || 0),
  };
}

/**
 * Validates a manually provisioned organization key against the live Postiz API
 * before saving it. The key is encrypted and is never returned to the browser.
 */
export async function provisionPostizTenant(
  tenantId: string,
  organizationId: string,
  apiKey: string,
  actor: { uid: string; email: string }
) {
  const cleanTenantId = String(tenantId || '').trim();
  const cleanOrganizationId = String(organizationId || '').trim();
  const cleanApiKey = String(apiKey || '').trim();

  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(cleanTenantId)) {
    throw new PostizConfigurationError('Choose a valid Amaavigo tenant.', 400);
  }
  if (!cleanOrganizationId || cleanOrganizationId.length > 160) {
    throw new PostizConfigurationError('Enter the Postiz Organization ID.', 400);
  }
  if (cleanApiKey.length < 16 || cleanApiKey.length > 1024) {
    throw new PostizConfigurationError('Enter a valid Postiz API key.', 400);
  }

  const tenantSnapshot = await getDoc(globalTenantDoc(cleanTenantId));
  if (!tenantSnapshot.exists()) {
    throw new PostizConfigurationError('The selected Amaavigo tenant does not exist.', 404);
  }

  const identity = await postizRequestWithKey<any>(
    cleanApiKey,
    '/me',
    { method: 'GET' }
  );
  const verifiedOrganizationId = String(identity?.organization?.id || '').trim();
  if (!verifiedOrganizationId || verifiedOrganizationId !== cleanOrganizationId) {
    throw new PostizConfigurationError(
      'The API key is valid, but it belongs to a different Postiz organization. Check the Organization ID and API key pair.',
      409
    );
  }

  const checkedIntegrations = await postizRequestWithKey<any>(
    cleanApiKey,
    '/integrations',
    { method: 'GET' }
  );
  if (!Array.isArray(checkedIntegrations)) {
    throw new PostizApiError(
      'The Postiz API key was accepted, but the integrations response was not in the expected format.',
      502
    );
  }

  const targetContext: TenantContext = {
    tenantId: cleanTenantId,
    uid: actor.uid || 'platform-admin',
    email: actor.email || '',
    role: 'admin',
    isPlatformAdmin: false,
  };
  const repository = tenantRepo(targetContext);
  const now = new Date().toISOString();

  const secretRef = repository.secretDoc('postiz_api_key');
  const metadataRef = repository.integrationDoc('postiz');
  const [previousSecret, previousMetadata] = await Promise.all([
    getDoc(secretRef),
    getDoc(metadataRef),
  ]);
  try {
    await safeSetDoc(
      secretRef,
      {
        ...encryptSecret(cleanApiKey),
        name: 'postiz_api_key',
        createdAt: previousSecret.exists() ? previousSecret.data().createdAt || now : now,
        updatedAt: now,
      },
      { merge: false }
    );
    await safeSetDoc(
      metadataRef,
      {
        provider: 'postiz',
        status: 'connected',
        organizationId: cleanOrganizationId,
        configuredAt: previousMetadata.exists() ? previousMetadata.data().configuredAt || now : now,
        configuredBy: actor.uid || 'platform-admin',
        lastVerifiedAt: now,
        connectedChannelCount: checkedIntegrations.length,
        updatedAt: now,
      },
      { merge: false }
    );
  } catch (error) {
    if (previousSecret.exists()) {
      await safeSetDoc(secretRef, previousSecret.data(), { merge: false }).catch(() => {});
    } else {
      await deleteDoc(secretRef).catch(() => {});
    }
    if (previousMetadata.exists()) {
      await safeSetDoc(metadataRef, previousMetadata.data(), { merge: false }).catch(() => {});
    } else {
      await deleteDoc(metadataRef).catch(() => {});
    }
    throw error;
  }

  return {
    success: true,
    tenantId: cleanTenantId,
    organizationId: cleanOrganizationId,
    connectedChannelCount: checkedIntegrations.length,
    lastVerifiedAt: now,
  };
}

export async function removePostizTenant(tenantId: string, actor: { uid: string; email: string }) {
  const targetContext: TenantContext = {
    tenantId,
    uid: actor.uid || 'platform-admin',
    email: actor.email || '',
    role: 'admin',
    isPlatformAdmin: false,
  };
  const repository = tenantRepo(targetContext);
  await deleteDoc(repository.secretDoc('postiz_api_key')).catch(() => {});
  await deleteDoc(repository.integrationDoc('postiz')).catch(() => {});
  return { success: true };
}
