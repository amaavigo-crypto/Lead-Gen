import { getDoc, getDocs } from './adminFirestore.js';
import { safeSetDoc } from './firestoreUtils.js';
import { listTenantAssets, resolveAssetRaw } from './assetService.js';
import { tenantRepo } from './tenantRepo.js';
import type { TenantContext } from '../types/tenant.js';
import {
  postizRequest,
  PostizApiError,
} from './postizClient.js';

export const POSTIZ_LINKABLE_PROVIDERS = [
  'x',
  'linkedin',
  'linkedin-page',
  'facebook',
  'instagram',
  'instagram-standalone',
  'threads',
  'youtube',
  'tiktok',
  'tiktok-business',
  'pinterest',
  'reddit',
  'discord',
  'slack',
  'mastodon',
  'gmb',
  'twitch',
  'kick',
  'dribbble',
  'vk',
  'tumblr',
  'whop',
  'mewe',
] as const;

export type PostizLinkableProvider = (typeof POSTIZ_LINKABLE_PROVIDERS)[number];

export interface PostizIntegration {
  id: string;
  name: string;
  identifier: string;
  picture?: string;
  disabled?: boolean;
  profile?: string;
  customer?: { id: string; name: string };
}

export interface PostizMediaReference {
  id: string;
  path: string;
  name?: string;
  mimeType?: string;
  sourceAssetId?: string;
  createdAt?: string;
}

export async function listPostizIntegrations(ctx: TenantContext): Promise<PostizIntegration[]> {
  const response = await postizRequest<any>('/integrations', { method: 'GET' });
  if (!Array.isArray(response)) {
    throw new PostizApiError('Postiz returned an invalid connected-channel list.', 502);
  }
  return response
    .filter((item: any) => item && typeof item.id === 'string' && typeof item.identifier === 'string')
    .map((item: any) => ({
      id: item.id,
      name: String(item.name || item.profile || item.identifier),
      identifier: item.identifier,
      picture: typeof item.picture === 'string' ? item.picture : undefined,
      disabled: Boolean(item.disabled),
      profile: typeof item.profile === 'string' ? item.profile : undefined,
      customer: item.customer && typeof item.customer === 'object'
        ? { id: String(item.customer.id || ''), name: String(item.customer.name || '') }
        : undefined,
    }));
}

export async function createPostizConnectLink(
  ctx: TenantContext,
  provider: string,
  redirectUrl: string
): Promise<{ url: string }> {
  if (!POSTIZ_LINKABLE_PROVIDERS.includes(provider as PostizLinkableProvider)) {
    throw new PostizApiError('This provider is not supported by the Postiz connect-link flow.', 400);
  }
  const response = await postizRequest<{ url?: string }>('/integrations/connect', {
    method: 'POST',
    body: JSON.stringify({ integration: provider, redirectUrl }),
  });
  if (!response?.url) {
    throw new PostizApiError('Postiz did not return a social-account connection link.', 502);
  }
  return { url: response.url };
}

export async function createPostizReconnectUrl(
  ctx: TenantContext,
  integration: PostizIntegration
): Promise<{ url: string }> {
  const query = new URLSearchParams({ refresh: integration.id });
  const response = await postizRequest<{ url?: string }>(
    '/social/' + encodeURIComponent(integration.identifier) + '?' + query.toString(),
    { method: 'GET' }
  );
  if (!response?.url) {
    throw new PostizApiError('Postiz did not return a reconnect URL for this channel.', 502);
  }
  return { url: response.url };
}

export async function deletePostizIntegration(ctx: TenantContext, integrationId: string) {
  return postizRequest<any>(
    '/integrations/' + encodeURIComponent(integrationId),
    { method: 'DELETE' }
  );
}

export async function listPostizPosts(
  ctx: TenantContext,
  startDate: string,
  endDate: string
) {
  const query = new URLSearchParams({ startDate, endDate });
  return postizRequest<any>('/posts?' + query.toString(), { method: 'GET' });
}

export async function uploadTenantAssetToPostiz(
  ctx: TenantContext,
  assetId: string
): Promise<PostizMediaReference> {
  const assets = await listTenantAssets(ctx);
  const asset = assets.find((item) => item.id === assetId);
  if (!asset || asset.tenantId !== ctx.tenantId) {
    throw new PostizApiError('The selected media file does not belong to this workspace.', 404);
  }

  const raw = await resolveAssetRaw(assetId);
  if (!raw?.buffer?.length) {
    throw new PostizApiError('The selected media file could not be read. Upload it again in Company Assets.', 404);
  }

  const allowedMimeTypes = new Set([
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/avif',
    'image/bmp',
    'image/tiff',
    'video/mp4',
  ]);
  const mimeType = String(raw.mimeType || asset.mimeType || '').toLowerCase();
  if (!allowedMimeTypes.has(mimeType)) {
    throw new PostizApiError(
      'Postiz accepts JPG, PNG, GIF, WebP, AVIF, BMP, TIFF and MP4 media. Convert this file before uploading.',
      415
    );
  }
  if (raw.buffer.length > 50 * 1024 * 1024) {
    throw new PostizApiError('Postiz media uploads must be 50 MB or smaller.', 413);
  }

  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(raw.buffer)], { type: mimeType }), raw.filename || asset.name || 'social-media');
  form.append('adjust', 'true');

  const uploaded = await postizRequest<any>('/upload', {
    method: 'POST',
    body: form,
  });
  if (!uploaded?.id || !uploaded?.path) {
    throw new PostizApiError('Postiz accepted the upload but did not return a usable media reference.', 502);
  }

  const record: PostizMediaReference = {
    id: String(uploaded.id),
    path: String(uploaded.path),
    name: String(uploaded.name || raw.filename || asset.name),
    mimeType,
    sourceAssetId: asset.id,
    createdAt: new Date().toISOString(),
  };
  await safeSetDoc(
    tenantRepo(ctx).doc('social_studio_media', record.id),
    record,
    { merge: false }
  );
  return record;
}

export async function listPostizMedia(ctx: TenantContext): Promise<PostizMediaReference[]> {
  const snapshot = await getDocs(tenantRepo(ctx).collection('social_studio_media'));
  const result: PostizMediaReference[] = [];
  snapshot.forEach((entry) => {
    const item = entry.data() as PostizMediaReference;
    if (item && item.id && item.path) result.push(item);
  });
  return result.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

async function getOwnedMediaReferences(
  ctx: TenantContext,
  mediaIds: string[]
): Promise<Array<{ id: string; path: string }>> {
  const distinct = Array.from(new Set(mediaIds.filter(Boolean)));
  if (distinct.length > 20) {
    throw new PostizApiError('Choose no more than 20 media files for one post.', 400);
  }
  const result: Array<{ id: string; path: string }> = [];
  for (const id of distinct) {
    const snapshot = await getDoc(tenantRepo(ctx).doc('social_studio_media', id));
    if (!snapshot.exists()) {
      throw new PostizApiError('One of the selected Postiz media files is missing or belongs to another workspace.', 404);
    }
    const record = snapshot.data() as PostizMediaReference;
    if (record.id !== id || !record.path) {
      throw new PostizApiError('A selected media reference is invalid.', 400);
    }
    result.push({ id: record.id, path: record.path });
  }
  return result;
}

export async function createSocialStudioPost(
  ctx: TenantContext,
  input: {
    type: 'draft' | 'schedule' | 'now';
    date: string;
    content: string;
    integrationIds: string[];
    mediaIds?: string[];
    providerSettings?: Record<string, Record<string, unknown>>;
  }
) {
  const integrations = await listPostizIntegrations(ctx);
  const selectedIds = Array.from(new Set(input.integrationIds));
  if (!selectedIds.length || selectedIds.length > 20) {
    throw new PostizApiError('Choose between 1 and 20 connected social channels.', 400);
  }

  const selected = selectedIds.map((id) => {
    const integration = integrations.find((item) => item.id === id && !item.disabled);
    if (!integration) {
      throw new PostizApiError('A selected social channel is no longer connected. Refresh your channels and try again.', 409);
    }
    return integration;
  });

  const media = await getOwnedMediaReferences(ctx, input.mediaIds || []);
  const content = String(input.content || '').trim();
  if (!content && media.length === 0) {
    throw new PostizApiError('Add a caption or at least one media file before publishing.', 400);
  }

  const scheduledDate = new Date(input.date);
  if (!Number.isFinite(scheduledDate.getTime())) {
    throw new PostizApiError('Choose a valid publication date and time.', 400);
  }

  const posts = selected.map((integration) => {
    const customSettings =
      input.providerSettings &&
      input.providerSettings[integration.id] &&
      typeof input.providerSettings[integration.id] === 'object'
        ? input.providerSettings[integration.id]
        : {};
    return {
      integration: { id: integration.id },
      value: [
        {
          content,
          image: media,
        },
      ],
      settings: {
        ...customSettings,
        __type: integration.identifier,
      },
    };
  });

  return postizRequest<any>('/posts', {
    method: 'POST',
    body: JSON.stringify({
      type: input.type,
      date: scheduledDate.toISOString(),
      shortLink: false,
      tags: [],
      posts,
    }),
  });
}

export async function deleteSocialStudioPost(ctx: TenantContext, postId: string) {
  return postizRequest<any>(
    '/posts/' + encodeURIComponent(postId),
    { method: 'DELETE' }
  );
}

export async function getSocialStudioAnalytics(
  ctx: TenantContext,
  integrationId: string,
  days = 30
) {
  const integrations = await listPostizIntegrations(ctx);
  if (!integrations.some((item) => item.id === integrationId)) {
    throw new PostizApiError('The selected channel does not belong to this workspace.', 404);
  }
  const lookbackDays = Math.max(1, Math.min(365, Math.floor(Number(days) || 30)));
  const query = new URLSearchParams({ date: String(lookbackDays) });
  return postizRequest<any>(
    '/analytics/' + encodeURIComponent(integrationId) + '?' + query.toString(),
    { method: 'GET' }
  );
}

export async function getSocialStudioPostAnalytics(ctx: TenantContext, postId: string) {
  const query = new URLSearchParams({ date: String(Math.floor(Date.now() / 1000)) });
  return postizRequest<any>(
    '/analytics/post/' + encodeURIComponent(postId) + '?' + query.toString(),
    { method: 'GET' }
  );
}
