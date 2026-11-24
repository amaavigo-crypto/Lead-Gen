import crypto from 'node:crypto';
import OpenAI from 'openai';
import { createDoc, getDoc } from './adminFirestore.js';
import { safeSetDoc } from './firestoreUtils.js';
import { globalUserDoc, tenantRepo } from './tenantRepo.js';
import type { TenantContext, UserRole } from '../types/tenant.js';
import { getEntitlements } from './entitlements.js';
import { checkTenantQuota, recordAiCompletionUsage } from './usageService.js';
import {
  getPostizTenantMetadata,
  provisionPostizTenant,
  removePostizTenant,
  PostizApiError,
  PostizConfigurationError,
} from './postizClient.js';
import {
  createPostizConnectLink,
  createPostizReconnectUrl,
  createSocialStudioPost,
  deletePostizIntegration,
  deleteSocialStudioPost,
  getSocialStudioAnalytics,
  getSocialStudioPostAnalytics,
  listPostizIntegrations,
  listPostizMedia,
  listPostizPosts,
  uploadTenantAssetToPostiz,
} from './socialStudioService.js';

function sendJson(res: any, status: number, payload: Record<string, any>) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.end(JSON.stringify(payload));
  return true;
}

function appOrigin(req: any): string {
  const configured = String(process.env.APP_URL || '').trim();
  if (process.env.NODE_ENV === 'production' && !configured) {
    throw new PostizConfigurationError(
      'Set APP_URL to the public HTTPS Amaavigo application URL before creating social-account connection links.',
      503
    );
  }
  const fromRequest = (() => {
    const host = String(req.headers?.['x-forwarded-host'] || req.headers?.host || '')
      .split(',')[0]
      .trim();
    const protocol = String(req.headers?.['x-forwarded-proto'] || 'https')
      .split(',')[0]
      .trim();
    return host ? protocol + '://' + host : '';
  })();
  const candidate = configured || fromRequest;
  try {
    const parsed = new URL(candidate);
    if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) {
      throw new Error('invalid');
    }
    if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') {
      throw new Error('https required');
    }
    return parsed.origin;
  } catch {
    throw new PostizConfigurationError(
      'Set APP_URL to the public HTTPS Amaavigo application URL before creating social-account connection links.',
      503
    );
  }
}

async function canUseSocialStudio(
  ctx: TenantContext,
  userRole: UserRole,
  userUid: string
): Promise<boolean> {
  if (ctx.isPlatformAdmin || userRole === 'admin') return true;
  const snapshot = await getDoc(globalUserDoc(userUid));
  if (!snapshot.exists()) return false;
  const user = snapshot.data() as any;
  const modules = Array.isArray(user?.allowedModules) ? user.allowedModules : [];
  return modules.includes('social-studio') || modules.includes('social_studio');
}

async function canPublishSocialStudioPost(
  userRole: UserRole,
  userUid: string,
  isPlatformAdmin: boolean
): Promise<boolean> {
  if (isPlatformAdmin || userRole === 'admin') return true;
  const snapshot = await getDoc(globalUserDoc(userUid));
  if (!snapshot.exists()) return false;
  const user = snapshot.data() as any;
  const modules = Array.isArray(user?.allowedModules) ? user.allowedModules : [];
  return modules.includes('social-studio-publish');
}

function requireTenantAdmin(userRole: UserRole, isPlatformAdmin: boolean) {
  if (!isPlatformAdmin && userRole !== 'admin') {
    throw new PostizConfigurationError(
      'Only a workspace administrator can connect or disconnect social accounts.',
      403
    );
  }
}

async function saveSocialAudit(
  ctx: TenantContext,
  actor: { uid: string; email: string; role: UserRole },
  action: string,
  description: string,
  targetName: string
) {
  const id = 'audit_social_' + crypto.randomUUID();
  const now = new Date().toISOString();
  try {
    await safeSetDoc(
      tenantRepo(ctx).auditLogDoc(id),
      {
        id,
        tenantId: ctx.tenantId,
        timestamp: now,
        action,
        module: 'SYSTEM',
        severity: 'INFO',
        description,
        actor: {
          userId: actor.uid,
          name: actor.email.split('@')[0] || 'Workspace User',
          email: actor.email,
          role: String(actor.role).toUpperCase(),
        },
        target: { type: 'System', id: 'social-studio', name: targetName },
      },
      { merge: false }
    );
  } catch (error) {
    console.warn('[Social Studio] Could not save audit event:', error);
  }
}

async function createPostWithRequestId(
  ctx: TenantContext,
  input: any,
  actor: { uid: string; email: string; role: UserRole }
) {
  const requestId = String(input.requestId || '').trim();
  if (!/^[a-zA-Z0-9_-]{12,80}$/.test(requestId)) {
    throw new PostizApiError('Refresh the composer and submit again. A valid request ID is required.', 400);
  }
  const ref = tenantRepo(ctx).doc('social_studio_requests', requestId);
  const now = new Date().toISOString();
  let existing = await getDoc(ref);

  if (existing.exists()) {
    const prior = existing.data() as any;
    if (prior.status === 'COMPLETED' && prior.response) {
      return { ...prior.response, idempotentReplay: true };
    }
    throw new PostizApiError(
      prior.status === 'UNKNOWN'
        ? 'The previous publish request has an unknown outcome. Check the Posts page before creating another post; this request will not be submitted twice.'
        : 'This post request is already being processed. Refresh Posts before retrying.',
      409
    );
  }

  try {
    await createDoc(ref, {
      requestId,
      status: 'PROCESSING',
      createdAt: now,
      createdBy: actor.uid,
      integrationIds: input.integrationIds,
    });
  } catch {
    existing = await getDoc(ref);
    if (existing.exists()) {
      const prior = existing.data() as any;
      if (prior.status === 'COMPLETED' && prior.response) {
        return { ...prior.response, idempotentReplay: true };
      }
      throw new PostizApiError(
        'This post request is already being processed. Refresh Posts before retrying.',
        409
      );
    }
    throw new PostizApiError('Could not reserve this publishing request. Please try again.', 503);
  }

  try {
    const response = await createSocialStudioPost(ctx, {
      type: input.type,
      date: input.date,
      content: input.content,
      integrationIds: input.integrationIds,
      mediaIds: input.mediaIds,
      providerSettings: input.providerSettings,
    });
    await safeSetDoc(
      ref,
      { status: 'COMPLETED', response, completedAt: new Date().toISOString() },
      { merge: true }
    );
    await saveSocialAudit(
      ctx,
      actor,
      'SOCIAL_POST_CREATED',
      'A social media post was submitted to Postiz.',
      'Social post'
    );
    return response;
  } catch (error: any) {
    const isKnownClientRejection =
      error instanceof PostizApiError &&
      error.status >= 400 &&
      error.status < 500 &&
      error.status !== 408 &&
      error.status !== 429;
    await safeSetDoc(
      ref,
      {
        status: isKnownClientRejection ? 'FAILED' : 'UNKNOWN',
        error: String(error?.message || 'Unknown Postiz response').slice(0, 700),
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
    throw error;
  }
}

export async function handleSocialStudioApi(
  req: any,
  res: any,
  ctx: TenantContext,
  body: any,
  url: string,
  auth: { userRole: UserRole; userUid: string; userEmail: string; isPlatformAdmin: boolean }
): Promise<boolean> {
  if (!url.startsWith('/api/social-studio')) return false;
  const actor = { uid: auth.userUid, email: auth.userEmail, role: auth.userRole };

  // Platform-owner provisioning is deliberately separate from tenant routes.
  const adminTenantMatch = url.match(/^\/api\/social-studio\/admin\/tenants\/([a-zA-Z0-9_-]{1,128})(?:\/provision)?$/);
  if (adminTenantMatch) {
    if (!auth.isPlatformAdmin) {
      return sendJson(res, 403, { success: false, error: 'Platform administrator access is required.' });
    }
    const tenantId = adminTenantMatch[1];
    const targetContext: TenantContext = {
      tenantId,
      uid: auth.userUid,
      email: auth.userEmail,
      role: 'admin',
      isPlatformAdmin: false,
    };
    if (req.method === 'GET') {
      const metadata = await getPostizTenantMetadata(targetContext);
      return sendJson(res, 200, { success: true, ...metadata });
    }
    if (url.endsWith('/provision') && req.method === 'POST') {
      try {
        const result = await provisionPostizTenant(
          tenantId,
          String(body?.organizationId || ''),
          String(body?.apiKey || ''),
          { uid: auth.userUid, email: auth.userEmail }
        );
        return sendJson(res, 200, result);
      } catch (error: any) {
        const status = error instanceof PostizApiError || error instanceof PostizConfigurationError
          ? error.status
          : 400;
        return sendJson(res, status, { success: false, error: error?.message || 'Could not provision Postiz for this tenant.' });
      }
    }
    if (url.endsWith('/provision') && req.method === 'DELETE') {
      try {
        return sendJson(
          res,
          200,
          await removePostizTenant(tenantId, { uid: auth.userUid, email: auth.userEmail })
        );
      } catch (error: any) {
        return sendJson(res, 500, { success: false, error: error?.message || 'Could not remove the Postiz configuration.' });
      }
    }
    return sendJson(res, 405, { success: false, error: 'Method not allowed.' });
  }

  if (auth.isPlatformAdmin) {
    return sendJson(res, 403, {
      success: false,
      error: 'Platform administrators must provision or select a tenant before using Social Studio.',
    });
  }

  const allowed = await canUseSocialStudio(ctx, auth.userRole, auth.userUid);
  if (!allowed) {
    return sendJson(res, 403, {
      success: false,
      error: 'Your workspace administrator has not granted you access to Social Studio.',
      code: 'social_studio_access_denied',
    });
  }

  const actorContext = { uid: auth.userUid, email: auth.userEmail, role: auth.userRole };

  try {
    if (url === '/api/social-studio/ai/caption' && req.method === 'POST') {
      const topic = String(body?.topic || '').trim().slice(0, 1200);
      const tone = String(body?.tone || 'professional').trim().slice(0, 60);
      const audience = String(body?.audience || 'general audience').trim().slice(0, 180);
      const goal = String(body?.goal || 'build awareness').trim().slice(0, 120);
      const platformLabels = Array.isArray(body?.platforms)
        ? body.platforms.map((value: unknown) => String(value).slice(0, 40)).slice(0, 8)
        : [];
      if (!topic) {
        return sendJson(res, 400, { success: false, error: 'Describe the post or campaign topic first.' });
      }
      const quota = await checkTenantQuota(ctx.tenantId, 'ai');
      if (!quota.allowed) {
        return sendJson(res, 402, { success: false, error: quota.reason || 'The workspace has reached its monthly AI token limit.', code: 'ai_quota_exceeded' });
      }
      const apiKey = String(process.env.OPENAI_API_KEY || '').trim();
      if (!apiKey) {
        return sendJson(res, 503, { success: false, error: 'AI caption generation is not configured. Set the platform OpenAI API key.' });
      }
      const model = String(process.env.SOCIAL_STUDIO_AI_MODEL || 'gpt-4o-mini').trim();
      const client = new OpenAI({ apiKey });
      const completion = await client.chat.completions.create({
        model,
        temperature: 0.75,
        max_tokens: 650,
        messages: [
          {
            role: 'system',
            content: 'You are a careful social media copywriter. Write one original, platform-appropriate caption based only on the brief. Do not invent prices, offers, dates, guarantees, statistics, testimonials, or product claims. Keep the output natural, concise, and ready to edit. Do not explain your process. Add a small set of relevant hashtags only when appropriate.',
          },
          {
            role: 'user',
            content:
              'Topic / brief: ' + topic +
              '\nTarget audience: ' + audience +
              '\nTone: ' + tone +
              '\nGoal: ' + goal +
              '\nTarget platforms: ' + (platformLabels.join(', ') || 'general social media') +
              '\nWrite one caption that can be adapted across these channels. Avoid unsupported factual claims.',
          },
        ],
      });
      const caption = String(completion.choices?.[0]?.message?.content || '').trim();
      if (!caption) {
        return sendJson(res, 502, { success: false, error: 'The AI model returned an empty caption. Try a more specific brief.' });
      }
      await recordAiCompletionUsage(ctx.tenantId, completion, model, 'openai', 'social_studio_caption').catch((usageError) => {
        console.warn('[Social Studio] Caption usage could not be recorded:', usageError?.message || usageError);
      });
      return sendJson(res, 200, { success: true, caption, model });
    }

    if (url === '/api/social-studio/status' && req.method === 'GET') {
      const metadata = await getPostizTenantMetadata(ctx);
      if (!metadata.provisioned) {
        return sendJson(res, 200, {
          success: true,
          configured: Boolean(process.env.POSTIZ_BASE_URL),
          ...metadata,
          connectedChannels: [],
        });
      }
      try {
        const channels = await listPostizIntegrations(ctx);
        return sendJson(res, 200, {
          success: true,
          configured: true,
          ...metadata,
          connectedChannels: channels,
        });
      } catch (error: any) {
        return sendJson(res, 200, {
          success: true,
          configured: true,
          ...metadata,
          connectedChannels: [],
          connectionError: error?.message || 'Postiz could not be reached.',
        });
      }
    }

    if (url === '/api/social-studio/channels' && req.method === 'GET') {
      const channels = await listPostizIntegrations(ctx);
      return sendJson(res, 200, { success: true, channels });
    }

    const connectMatch = url.match(/^\/api\/social-studio\/channels\/connect\/([a-z0-9-]+)$/);
    if (connectMatch && req.method === 'POST') {
      requireTenantAdmin(auth.userRole, auth.isPlatformAdmin);
      const provider = connectMatch[1];
      const channels = await listPostizIntegrations(ctx);
      const entitlements = await getEntitlements(ctx.tenantId);
      const channelLimit = Number(entitlements.limits.socialChannels || 3);
      if (channels.length >= channelLimit) {
        return sendJson(res, 402, {
          success: false,
          error: 'Your plan allows ' + channelLimit + ' connected social channels. Upgrade or ask your administrator to change the limit.',
          code: 'social_channel_limit',
        });
      }
      const origin = appOrigin(req);
      const redirectUrl = origin + '/?tab=social-studio&social_connected=1';
      const link = await createPostizConnectLink(ctx, provider, redirectUrl);
      await saveSocialAudit(
        ctx,
        actorContext,
        'SOCIAL_CHANNEL_CONNECT_STARTED',
        'A social-account connection flow was started for ' + provider + '.',
        provider
      );
      return sendJson(res, 200, { success: true, url: link.url });
    }

    const reconnectMatch = url.match(/^\/api\/social-studio\/channels\/([^/]+)\/reconnect$/);
    if (reconnectMatch && req.method === 'POST') {
      requireTenantAdmin(auth.userRole, auth.isPlatformAdmin);
      const integrationId = decodeURIComponent(reconnectMatch[1]);
      const current = await listPostizIntegrations(ctx);
      const integration = current.find((item) => item.id === integrationId);
      if (!integration) {
        return sendJson(res, 404, { success: false, error: 'Connected channel not found in this workspace.' });
      }
      const link = await createPostizReconnectUrl(ctx, integration);
      await saveSocialAudit(
        ctx,
        actorContext,
        'SOCIAL_CHANNEL_RECONNECT_STARTED',
        'A social-account reconnect flow was started.',
        integration.name || integration.identifier
      );
      return sendJson(res, 200, { success: true, url: link.url });
    }

    const channelMatch = url.match(/^\/api\/social-studio\/channels\/([^/]+)$/);
    if (channelMatch && req.method === 'DELETE') {
      requireTenantAdmin(auth.userRole, auth.isPlatformAdmin);
      const integrationId = decodeURIComponent(channelMatch[1]);
      const current = await listPostizIntegrations(ctx);
      if (!current.some((item) => item.id === integrationId)) {
        return sendJson(res, 404, { success: false, error: 'Connected channel not found in this workspace.' });
      }
      await deletePostizIntegration(ctx, integrationId);
      await saveSocialAudit(
        ctx,
        actorContext,
        'SOCIAL_CHANNEL_DISCONNECTED',
        'A connected social channel was disconnected.',
        integrationId
      );
      return sendJson(res, 200, { success: true });
    }

    if (url === '/api/social-studio/media' && req.method === 'GET') {
      const uploads = await listPostizMedia(ctx);
      return sendJson(res, 200, { success: true, media: uploads });
    }

    if (url === '/api/social-studio/media/upload' && req.method === 'POST') {
      const assetId = String(body?.assetId || '').trim();
      if (!assetId) {
        return sendJson(res, 400, { success: false, error: 'Select a file from Company Assets before uploading it to Postiz.' });
      }
      const media = await uploadTenantAssetToPostiz(ctx, assetId);
      return sendJson(res, 201, { success: true, media });
    }

    if (url === '/api/social-studio/posts' && req.method === 'GET') {
      const query = new URL(req.url || '/', 'http://localhost').searchParams;
      const defaultStart = new Date();
      defaultStart.setDate(1);
      defaultStart.setHours(0, 0, 0, 0);
      const defaultEnd = new Date(defaultStart);
      defaultEnd.setMonth(defaultEnd.getMonth() + 1);
      const startDate = query.get('startDate') || defaultStart.toISOString();
      const endDate = query.get('endDate') || defaultEnd.toISOString();
      const start = Date.parse(startDate);
      const end = Date.parse(endDate);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > 366 * 24 * 60 * 60 * 1000) {
        return sendJson(res, 400, { success: false, error: 'Choose a valid post date range of no more than 366 days.' });
      }
      const posts = await listPostizPosts(ctx, new Date(start).toISOString(), new Date(end).toISOString());
      return sendJson(res, 200, { success: true, ...posts });
    }

    if (url === '/api/social-studio/posts' && req.method === 'POST') {
      const type = body?.type === 'draft' || body?.type === 'now' || body?.type === 'schedule'
        ? body.type
        : '';
      const integrationIds = Array.isArray(body?.integrationIds)
        ? body.integrationIds.map((value: unknown) => String(value).trim()).filter(Boolean)
        : [];
      const mediaIds = Array.isArray(body?.mediaIds)
        ? body.mediaIds.map((value: unknown) => String(value).trim()).filter(Boolean)
        : [];
      const content = String(body?.content || '').trim();
      if (!type) {
        return sendJson(res, 400, { success: false, error: 'Choose whether to save a draft, publish now or schedule the post.' });
      }
      if (type !== 'draft' && !(await canPublishSocialStudioPost(auth.userRole, auth.userUid, auth.isPlatformAdmin))) {
        return sendJson(res, 403, {
          success: false,
          error: 'This team member can prepare drafts but needs the social-studio-publish permission to publish or schedule posts.',
          code: 'social_studio_publisher_required',
        });
      }
      if (!content && mediaIds.length === 0) {
        return sendJson(res, 400, { success: false, error: 'Add a caption or at least one media file.' });
      }
      if (content.length > 20_000) {
        return sendJson(res, 400, { success: false, error: 'The caption is too long.' });
      }
      if (!integrationIds.length) {
        return sendJson(res, 400, { success: false, error: 'Select at least one connected social channel.' });
      }
      const scheduledAt = type === 'schedule' ? String(body?.date || '') : new Date().toISOString();
      const scheduledMs = Date.parse(scheduledAt);
      if (!Number.isFinite(scheduledMs)) {
        return sendJson(res, 400, { success: false, error: 'Choose a valid publishing date and time.' });
      }
      if (type === 'schedule' && scheduledMs <= Date.now()) {
        return sendJson(res, 400, { success: false, error: 'Scheduled posts must be set in the future.' });
      }
      const request = {
        requestId: String(body?.requestId || ''),
        type,
        date: new Date(scheduledMs).toISOString(),
        content,
        integrationIds,
        mediaIds,
        providerSettings: body?.providerSettings && typeof body.providerSettings === 'object'
          ? body.providerSettings
          : {},
      };
      const result = await createPostWithRequestId(ctx, request, actorContext);
      return sendJson(res, 201, { success: true, result });
    }

    const postMatch = url.match(/^\/api\/social-studio\/posts\/([^/]+)$/);
    if (postMatch && req.method === 'DELETE') {
      const postId = decodeURIComponent(postMatch[1]);
      await deleteSocialStudioPost(ctx, postId);
      await saveSocialAudit(
        ctx,
        actorContext,
        'SOCIAL_POST_DELETED',
        'A scheduled or draft social post was removed.',
        postId
      );
      return sendJson(res, 200, { success: true });
    }

    if (url === '/api/social-studio/analytics' && req.method === 'GET') {
      const query = new URL(req.url || '/', 'http://localhost').searchParams;
      const integrationId = String(query.get('integrationId') || '').trim();
      const days = Number(query.get('days') || 30);
      if (!integrationId) {
        return sendJson(res, 400, { success: false, error: 'Select a connected social channel to view analytics.' });
      }
      if (!Number.isFinite(days) || days < 1 || days > 365) {
        return sendJson(res, 400, { success: false, error: 'Choose an analytics window between 1 and 365 days.' });
      }
      const analytics = await getSocialStudioAnalytics(ctx, integrationId, days);
      return sendJson(res, 200, { success: true, analytics, days });
    }

    const postAnalyticsMatch = url.match(/^\/api\/social-studio\/analytics\/post\/([^/]+)$/);
    if (postAnalyticsMatch && req.method === 'GET') {
      const analytics = await getSocialStudioPostAnalytics(ctx, decodeURIComponent(postAnalyticsMatch[1]));
      return sendJson(res, 200, { success: true, analytics });
    }

    return sendJson(res, 404, { success: false, error: 'Social Studio endpoint not found.' });
  } catch (error: any) {
    const status =
      error instanceof PostizApiError || error instanceof PostizConfigurationError
        ? error.status
        : 500;
    console.error('[Social Studio]', error?.message || error);
    return sendJson(res, status, {
      success: false,
      error: error?.message || 'Social Studio request failed.',
    });
  }
}
