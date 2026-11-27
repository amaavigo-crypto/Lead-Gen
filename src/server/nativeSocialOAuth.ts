import crypto from 'node:crypto';
import { db, doc, getDoc, setDoc, deleteDoc } from './adminFirestore.js';
import { tenantRepo } from './tenantRepo.js';
import { encryptSecret } from './cryptoUtils.js';
import type { TenantContext } from '../types/tenant.js';
import {
  getInstagramStatus,
  startInstagramOAuth,
  disconnectInstagram,
} from './instagramIntegrationService.js';

type Provider = 'instagram' | 'facebook' | 'youtube' | 'x' | 'linkedin' | 'reddit';
type OAuthState = {
  provider: Provider;
  tenantId: string;
  uid: string;
  email: string;
  role: TenantContext['role'];
  redirectUri: string;
  codeVerifier?: string;
  createdAt: number;
  expiresAt: number;
};

const PROVIDERS: Provider[] = ['instagram', 'facebook', 'youtube', 'x', 'linkedin', 'reddit'];
const STATE_TTL_MS = 10 * 60 * 1000;
const GRAPH_VERSION = process.env.META_GRAPH_API_VERSION || 'v23.0';

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function callbackBase(): string {
  const value = String(process.env.APP_URL || process.env.APP_BASE_URL || '').trim();
  if (!value) throw new Error('APP_URL must be configured before connecting social accounts.');
  const parsed = new URL(value);
  if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') {
    throw new Error('APP_URL must use HTTPS in production.');
  }
  return parsed.origin;
}

function providerRedirect(provider: Provider): string {
  if (provider === 'instagram') {
    const configured = String(process.env.META_INSTAGRAM_REDIRECT_URI || '').trim();
    if (!configured) throw new Error('META_INSTAGRAM_REDIRECT_URI is required for Instagram Login.');
    return configured;
  }
  const envNames: Record<Exclude<Provider, 'instagram'>, string> = {
    facebook: 'META_FACEBOOK_REDIRECT_URI',
    youtube: 'YOUTUBE_REDIRECT_URI',
    x: 'X_REDIRECT_URI',
    linkedin: 'LINKEDIN_REDIRECT_URI',
    reddit: 'REDDIT_REDIRECT_URI',
  };
  const configured = String(process.env[envNames[provider as Exclude<Provider, 'instagram'>]] || '').trim();
  return configured || callbackBase() + '/api/oauth/social/' + provider + '/callback';
}

function providerCredentials(provider: Exclude<Provider, 'instagram'>): { clientId: string; clientSecret: string } {
  const env: Record<Exclude<Provider, 'instagram'>, [string, string]> = {
    facebook: ['META_APP_ID', 'META_APP_SECRET'],
    youtube: ['YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET'],
    x: ['X_CLIENT_ID', 'X_CLIENT_SECRET'],
    linkedin: ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET'],
    reddit: ['REDDIT_CLIENT_ID', 'REDDIT_CLIENT_SECRET'],
  };
  const [idName, secretName] = env[provider];
  const clientId = String(process.env[idName] || '').trim();
  const clientSecret = String(process.env[secretName] || '').trim();
  if (!clientId || !clientSecret) throw new Error(provider.toUpperCase() + ' OAuth credentials are not configured on the server.');
  return { clientId, clientSecret };
}

function scopes(provider: Exclude<Provider, 'instagram'>): string[] {
  const configured: Record<Exclude<Provider, 'instagram'>, string> = {
    facebook: process.env.META_FACEBOOK_SCOPES || 'pages_show_list,pages_read_engagement,pages_manage_posts,pages_manage_engagement',
    youtube: process.env.YOUTUBE_SCOPES || 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly',
    x: process.env.X_SCOPES || 'tweet.read tweet.write users.read offline.access media.write',
    linkedin: process.env.LINKEDIN_SCOPES || 'openid profile w_member_social w_organization_social',
    reddit: process.env.REDDIT_SCOPES || 'identity submit read',
  };
  return configured[provider].split(/[,\s]+/).map((scope) => scope.trim()).filter(Boolean);
}

function oauthStateContext(state: OAuthState): TenantContext {
  return {
    tenantId: state.tenantId,
    uid: state.uid,
    email: state.email,
    role: state.role,
    isPlatformAdmin: false,
  };
}

function json(res: any, status: number, value: Record<string, unknown>) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(value));
}

function redirect(res: any, location: string) {
  res.statusCode = 302;
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Location', location);
  res.end();
}

function appReturnUrl(status: 'connected' | 'error', provider: Provider): string {
  const base = callbackBase();
  const url = new URL('/', base);
  url.searchParams.set('tab', 'social-studio');
  url.searchParams.set('social_oauth', status);
  url.searchParams.set('provider', provider);
  return url.toString();
}

async function responseJson(response: Response): Promise<any> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.error) {
    const message = body?.error_description || body?.error?.message || body?.error || body?.message;
    throw new Error(String(message || 'The social platform rejected the OAuth request.'));
  }
  return body;
}

function base64Url(value: Buffer): string {
  return value.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function createAuthorization(provider: Provider, ctx: TenantContext): Promise<string> {
  if (!PROVIDERS.includes(provider)) throw new Error('Unsupported social platform.');
  if (provider === 'instagram') {
    const result = await startInstagramOAuth(ctx);
    return result.authorizationUrl;
  }

  const { clientId } = providerCredentials(provider);
  const redirectUri = providerRedirect(provider);
  const state = base64Url(crypto.randomBytes(32));
  let codeVerifier: string | undefined;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    state,
  });

  if (provider === 'facebook') {
    params.set('scope', scopes(provider).join(','));
    params.set('auth_type', 'rerequest');
  } else if (provider === 'youtube') {
    params.set('scope', scopes(provider).join(' '));
    params.set('access_type', 'offline');
    params.set('prompt', 'consent');
    params.set('include_granted_scopes', 'true');
  } else if (provider === 'x') {
    codeVerifier = base64Url(crypto.randomBytes(48));
    const challenge = base64Url(crypto.createHash('sha256').update(codeVerifier).digest());
    params.set('scope', scopes(provider).join(' '));
    params.set('code_challenge', challenge);
    params.set('code_challenge_method', 'S256');
  } else if (provider === 'linkedin') {
    params.set('scope', scopes(provider).join(' '));
  } else if (provider === 'reddit') {
    params.set('scope', scopes(provider).join(' '));
    params.set('duration', 'permanent');
    params.set('response_type', 'code');
  }

  const stateRecord: OAuthState = {
    provider,
    tenantId: ctx.tenantId,
    uid: ctx.uid,
    email: ctx.email || '',
    role: ctx.role,
    redirectUri,
    ...(codeVerifier ? { codeVerifier } : {}),
    createdAt: Date.now(),
    expiresAt: Date.now() + STATE_TTL_MS,
  };
  await setDoc(doc(db, 'social_studio_oauth_states', sha256(state)), stateRecord, { merge: false });

  const authorizationBase: Record<Exclude<Provider, 'instagram'>, string> = {
    facebook: 'https://www.facebook.com/' + GRAPH_VERSION + '/dialog/oauth',
    youtube: 'https://accounts.google.com/o/oauth2/v2/auth',
    x: 'https://twitter.com/i/oauth2/authorize',
    linkedin: 'https://www.linkedin.com/oauth/v2/authorization',
    reddit: 'https://www.reddit.com/api/v1/authorize',
  };
  return authorizationBase[provider] + '?' + params.toString();
}

async function exchangeAuthorizationCode(provider: Exclude<Provider, 'instagram'>, code: string, state: OAuthState): Promise<any> {
  const { clientId, clientSecret } = providerCredentials(provider);
  const form = new URLSearchParams();
  form.set('grant_type', 'authorization_code');
  form.set('code', code);
  form.set('redirect_uri', state.redirectUri);

  let endpoint = '';
  const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded' };

  if (provider === 'facebook') {
    const url = new URL('https://graph.facebook.com/' + GRAPH_VERSION + '/oauth/access_token');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('client_secret', clientSecret);
    url.searchParams.set('redirect_uri', state.redirectUri);
    url.searchParams.set('code', code);
    return responseJson(await fetch(url));
  }
  if (provider === 'youtube') {
    endpoint = 'https://oauth2.googleapis.com/token';
    form.set('client_id', clientId);
    form.set('client_secret', clientSecret);
  } else if (provider === 'x') {
    endpoint = 'https://api.x.com/2/oauth2/token';
    form.set('client_id', clientId);
    if (state.codeVerifier) form.set('code_verifier', state.codeVerifier);
    if (clientSecret) headers.Authorization = 'Basic ' + Buffer.from(clientId + ':' + clientSecret).toString('base64');
  } else if (provider === 'linkedin') {
    endpoint = 'https://www.linkedin.com/oauth/v2/accessToken';
    form.set('client_id', clientId);
    form.set('client_secret', clientSecret);
  } else {
    endpoint = 'https://www.reddit.com/api/v1/access_token';
    headers.Authorization = 'Basic ' + Buffer.from(clientId + ':' + clientSecret).toString('base64');
  }

  if (provider === 'reddit') {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { ...headers, 'User-Agent': 'AmaavigoSocialStudio/1.0' },
      body: form.toString(),
    });
    return responseJson(response);
  }
  return responseJson(await fetch(endpoint, { method: 'POST', headers, body: form.toString() }));
}

async function loadAccountIdentity(provider: Exclude<Provider, 'instagram'>, accessToken: string): Promise<Record<string, any>> {
  if (provider === 'facebook') {
    const url = new URL('https://graph.facebook.com/' + GRAPH_VERSION + '/me');
    url.searchParams.set('fields', 'id,name,accounts.limit(100){id,name,access_token,tasks,instagram_business_account}');
    url.searchParams.set('access_token', accessToken);
    const data = await responseJson(await fetch(url));
    const pages = Array.isArray(data.accounts?.data) ? data.accounts.data : [];
    return {
      accountId: String(data.id),
      displayName: String(data.name || 'Facebook user'),
      pages: pages.map((page: any) => ({
        id: String(page.id),
        name: String(page.name || ''),
        tasks: Array.isArray(page.tasks) ? page.tasks : [],
        instagramBusinessAccountId: page.instagram_business_account?.id ? String(page.instagram_business_account.id) : null,
      })),
      pageTokens: pages.reduce((all: Record<string, string>, page: any) => {
        if (page.id && page.access_token) all[String(page.id)] = String(page.access_token);
        return all;
      }, {}),
    };
  }
  if (provider === 'youtube') {
    const url = new URL('https://www.googleapis.com/youtube/v3/channels');
    url.searchParams.set('part', 'id,snippet');
    url.searchParams.set('mine', 'true');
    const data = await responseJson(await fetch(url, { headers: { Authorization: 'Bearer ' + accessToken } }));
    const channel = data.items?.[0];
    if (!channel) throw new Error('No YouTube channel was returned for this Google account.');
    return { accountId: String(channel.id), displayName: String(channel.snippet?.title || 'YouTube channel'), thumbnail: channel.snippet?.thumbnails?.default?.url || '' };
  }
  if (provider === 'x') {
    const data = await responseJson(await fetch('https://api.x.com/2/users/me?user.fields=name,username,profile_image_url', {
      headers: { Authorization: 'Bearer ' + accessToken },
    }));
    return { accountId: String(data.data?.id || ''), displayName: String(data.data?.name || ''), username: String(data.data?.username || ''), avatar: data.data?.profile_image_url || '' };
  }
  if (provider === 'linkedin') {
    const data = await responseJson(await fetch('https://api.linkedin.com/v2/userinfo', {
      headers: { Authorization: 'Bearer ' + accessToken },
    }));
    return { accountId: String(data.sub || ''), displayName: String(data.name || data.given_name || 'LinkedIn member'), username: String(data.email || ''), avatar: String(data.picture || '') };
  }
  const data = await responseJson(await fetch('https://oauth.reddit.com/api/v1/me', {
    headers: { Authorization: 'Bearer ' + accessToken, 'User-Agent': 'AmaavigoSocialStudio/1.0' },
  }));
  return { accountId: String(data.id || ''), displayName: String(data.name || 'Reddit user'), username: String(data.name || ''), avatar: String(data.icon_img || '') };
}

async function completeAuthorization(provider: Exclude<Provider, 'instagram'>, code: string, state: OAuthState): Promise<void> {
  const tokens = await exchangeAuthorizationCode(provider, code, state);
  const accessToken = String(tokens.access_token || '');
  if (!accessToken) throw new Error('The platform did not return an access token.');
  const identity = await loadAccountIdentity(provider, accessToken);
  if (!identity.accountId) throw new Error('The platform account could not be verified.');
  const ctx = oauthStateContext(state);
  const now = new Date().toISOString();
  const bundle = {
    accessToken,
    refreshToken: tokens.refresh_token ? String(tokens.refresh_token) : null,
    tokenType: String(tokens.token_type || 'Bearer'),
    scope: String(tokens.scope || ''),
    expiresAt: Number(tokens.expires_in) > 0 ? new Date(Date.now() + Number(tokens.expires_in) * 1000).toISOString() : null,
    identity,
  };
  await setDoc(tenantRepo(ctx).secretDoc('social_studio_' + provider + '_oauth'), {
    ...encryptSecret(JSON.stringify(bundle)),
    name: 'social_studio_' + provider + '_oauth',
    updatedAt: now,
    createdAt: now,
  }, { merge: false });
  const safeIdentity = { ...identity };
  delete safeIdentity.pageTokens;
  await setDoc(tenantRepo(ctx).integrationDoc('social_studio_' + provider), {
    provider,
    status: 'connected',
    accountId: String(identity.accountId),
    displayName: String(identity.displayName || provider),
    username: String(identity.username || ''),
    pages: Array.isArray(identity.pages) ? identity.pages : [],
    avatar: String(identity.avatar || identity.thumbnail || ''),
    scopes: String(tokens.scope || '').split(/[,\s]+/).filter(Boolean),
    connectedAt: now,
    updatedAt: now,
    tokenExpiresAt: bundle.expiresAt,
  }, { merge: false });
}

export async function handleNativeSocialOAuthCallback(req: any, res: any, url: string): Promise<boolean> {
  const match = url.match(/^\/api\/oauth\/social\/(facebook|youtube|x|linkedin|reddit)\/callback$/);
  if (!match || req.method !== 'GET') return false;
  const provider = match[1] as Exclude<Provider, 'instagram'>;
  const params = new URL(req.url || '/', 'https://localhost').searchParams;
  const stateValue = params.get('state') || '';
  const code = params.get('code') || '';
  if (!stateValue) {
    json(res, 400, { error: 'OAuth state is missing.' });
    return true;
  }
  const stateRef = doc(db, 'social_studio_oauth_states', sha256(stateValue));
  const stateSnap = await getDoc(stateRef);
  if (!stateSnap.exists()) {
    json(res, 400, { error: 'This authorization request is invalid or has already been used.' });
    return true;
  }
  const state = stateSnap.data() as OAuthState;
  await deleteDoc(stateRef);
  if (state.provider !== provider || Date.now() > Number(state.expiresAt || 0)) {
    redirect(res, appReturnUrl('error', provider));
    return true;
  }
  if (params.get('error') || !code) {
    redirect(res, appReturnUrl('error', provider));
    return true;
  }
  try {
    await completeAuthorization(provider, code, state);
    redirect(res, appReturnUrl('connected', provider));
  } catch (error: any) {
    console.error('[Social OAuth] callback failed:', provider, error?.message || 'unknown error');
    redirect(res, appReturnUrl('error', provider));
  }
  return true;
}

export async function handleNativeSocialStudioApi(req: any, res: any, ctx: TenantContext, url: string): Promise<boolean> {
  if (url === '/api/social-studio/status' && req.method === 'GET') {
    json(res, 200, {
      success: true,
      provisioned: true,
      provider: 'native',
      connectedChannels: 0,
    });
    return true;
  }

  if (url === '/api/social-studio/posts' && req.method === 'GET') {
    json(res, 200, { success: true, posts: [] });
    return true;
  }

  if (url === '/api/social-studio/media' && req.method === 'GET') {
    json(res, 200, { success: true, media: [] });
    return true;
  }

  const connect = url.match(/^\/api\/social-studio\/channels\/connect\/(instagram|facebook|youtube|x|linkedin|reddit)$/);
  if (connect && req.method === 'POST') {
    if (!ctx.isPlatformAdmin && ctx.role !== 'admin') {
      json(res, 403, { success: false, error: 'Only a workspace administrator can connect social accounts.' });
      return true;
    }
    try {
      const authorizationUrl = await createAuthorization(connect[1] as Provider, ctx);
      json(res, 200, { success: true, url: authorizationUrl });
    } catch (error: any) {
      json(res, 503, { success: false, error: error?.message || 'Could not start social account authorization.' });
    }
    return true;
  }

  if (url === '/api/social-studio/channels' && req.method === 'GET') {
    try {
      const results: any[] = [];
      const instagram = await getInstagramStatus(ctx).catch(() => ({ connected: false, connection: null }));
      if (instagram.connected && instagram.connection) {
        const grantedScopes = Array.isArray(instagram.connection.scopes) ? instagram.connection.scopes : [];
        results.push({
          id: 'instagram',
          identifier: 'instagram',
          name: instagram.connection.username || 'Instagram',
          username: instagram.connection.username || '',
          status: instagram.connection.status,
          disabled: !grantedScopes.includes('instagram_business_content_publish'),
        });
      }
      for (const provider of ['facebook', 'youtube', 'x', 'linkedin', 'reddit'] as const) {
        const snapshot = await getDoc(tenantRepo(ctx).integrationDoc('social_studio_' + provider));
        if (!snapshot.exists()) continue;
        const value = snapshot.data() as any;
        if (value?.status !== 'connected') continue;
        results.push({
          id: String(value.accountId || provider),
          identifier: provider,
          name: String(value.displayName || provider),
          username: String(value.username || ''),
          picture: String(value.avatar || ''),
          status: 'connected',
        });
      }
      json(res, 200, { success: true, channels: results });
    } catch (error: any) {
      json(res, 500, { success: false, error: error?.message || 'Could not load connected social accounts.' });
    }
    return true;
  }

  const disconnect = url.match(/^\/api\/social-studio\/channels\/(instagram|facebook|youtube|x|linkedin|reddit)$/);
  if (disconnect && req.method === 'DELETE') {
    if (!ctx.isPlatformAdmin && ctx.role !== 'admin') {
      json(res, 403, { success: false, error: 'Only a workspace administrator can disconnect social accounts.' });
      return true;
    }
    const provider = disconnect[1];
    if (provider === 'instagram') {
      await disconnectInstagram(ctx);
    } else {
      const repository = tenantRepo(ctx);
      await deleteDoc(repository.secretDoc('social_studio_' + provider + '_oauth'));
      await deleteDoc(repository.integrationDoc('social_studio_' + provider));
    }
    json(res, 200, { success: true });
    return true;
  }
  return false;
}
