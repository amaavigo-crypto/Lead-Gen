/**
 * Global Resources CMS storage.
 *
 * These records describe the public Amaavigo website and are deliberately stored outside
 * tenants/{tenantId}. Every write is additionally gated by platformAdmin in coreApiHandler.
 */
import { randomUUID } from 'node:crypto';
import { collection, createDoc, db, deleteDoc, doc, getDoc, getDocs, setDoc } from './adminFirestore.js';
import {
  SAMPLE_RESOURCES,
  SiteResourceConflictError,
  SiteResourceValidationError,
  normaliseResourceInput,
  slugifyResource,
  type SiteResourceAdminRecord,
  type SiteResourceFields,
  type SiteResourcePublic,
} from '../shared/siteResources.js';

const resourcesCollection = () => collection(db, 'site_resources');
const metaReference = () => doc(db, 'site_resources_meta', 'starter-content-v1');
const mediaCollection = () => collection(db, 'site_resources_media');

let publicCache: { at: number; resources: SiteResourcePublic[] } | null = null;
const PUBLIC_CACHE_MS = 20_000;

export function invalidateSiteResourcesCache() {
  publicCache = null;
}

function cleanRecord(id: string, raw: any): SiteResourceAdminRecord {
  return {
    id,
    draft: raw.draft as SiteResourceFields,
    published: raw.published ? raw.published as SiteResourceFields : null,
    revision: Number(raw.revision) || 0,
    publishedRevision: Number(raw.publishedRevision) || 0,
    status: raw.status === 'published' || raw.status === 'archived' ? raw.status : 'draft',
    isSample: raw.isSample === true ? true : undefined,
    createdAt: String(raw.createdAt || ''),
    updatedAt: String(raw.updatedAt || ''),
    publishedAt: raw.publishedAt ? String(raw.publishedAt) : null,
    updatedBy: raw.updatedBy ? String(raw.updatedBy) : undefined,
  };
}

async function seedStarterResources(): Promise<void> {
  const marker = await getDoc(metaReference());
  if (marker.exists()) return;
  const existing = await getDocs(resourcesCollection());
  const now = new Date().toISOString();
  if (existing.size === 0) {
    await Promise.all(SAMPLE_RESOURCES.map(async (item) => {
      const { id, ...fields } = item;
      await createDoc(doc(resourcesCollection(), id), {
        draft: fields,
        published: fields,
        revision: 1,
        publishedRevision: 1,
        status: 'published',
        isSample: true,
        createdAt: now,
        updatedAt: now,
        publishedAt: now,
        updatedBy: 'system-seed',
      }).catch(() => undefined);
    }));
  } else {
    // Upgrade any legacy card-only resource records without losing their content or visibility.
    await Promise.all(existing.docs.map(async (item: any) => {
      const raw = item.data();
      if (raw?.draft || typeof raw?.title !== 'string') return;
      const slug = String(raw.slug || slugifyResource(raw.title) || item.id).slice(0, 120);
      const destinationUrl = typeof raw.href === 'string' && raw.href ? raw.href : '/resources';
      const fields = normaliseResourceInput({
        title: raw.title,
        slug,
        summary: raw.summary || 'A resource from the original Resources library.',
        category: raw.category || 'Guides',
        type: 'link',
        destinationUrl,
        icon: raw.icon || 'BookOpen',
        order: raw.order,
        ctaLabel: 'Explore resource',
        ctaUrl: destinationUrl,
        author: 'Amaavigo Editorial Team',
      });
      const visible = raw.published !== false && raw.status !== 'archived';
      const revision = Math.max(1, Number(raw.revision) || 1);
      const createdAt = String(raw.createdAt || now);
      await setDoc(doc(resourcesCollection(), item.id), {
        draft: fields,
        published: visible ? fields : null,
        revision,
        publishedRevision: visible ? revision : 0,
        status: visible ? 'published' : raw.status === 'archived' ? 'archived' : 'draft',
        isSample: raw.isSample === true,
        createdAt,
        updatedAt: String(raw.updatedAt || now),
        publishedAt: visible ? String(raw.publishedAt || raw.updatedAt || now) : null,
        updatedBy: 'resources-schema-upgrade',
      });
    }));
  }
  await createDoc(metaReference(), { createdAt: new Date().toISOString() }).catch(() => undefined);
}

export async function listAllResources(): Promise<SiteResourceAdminRecord[]> {
  await seedStarterResources();
  const snapshot = await getDocs(resourcesCollection());
  return snapshot.docs.map((item: any) => cleanRecord(item.id, item.data()))
    .sort((a, b) => a.draft.order - b.draft.order || b.updatedAt.localeCompare(a.updatedAt));
}

export async function listPublishedResources(): Promise<SiteResourcePublic[]> {
  if (publicCache && Date.now() - publicCache.at < PUBLIC_CACHE_MS) return publicCache.resources;
  await seedStarterResources();
  const snapshot = await getDocs(resourcesCollection());
  const resources = snapshot.docs
    .map((item: any) => cleanRecord(item.id, item.data()))
    .filter((item) => item.status === 'published' && item.published)
    .map((item) => ({
      id: item.id,
      ...(item.published as SiteResourceFields),
      publishedAt: item.publishedAt || item.updatedAt,
      updatedAt: item.updatedAt,
    }))
    .sort((a, b) => Number(b.featured) - Number(a.featured) || a.order - b.order || b.publishedAt.localeCompare(a.publishedAt));
  publicCache = { at: Date.now(), resources };
  return resources;
}

export async function getPublishedResourceBySlug(slug: string): Promise<SiteResourcePublic | null> {
  const resources = await listPublishedResources();
  return resources.find((item) => item.slug === slug) || null;
}

async function assertUniqueSlug(slug: string, exceptId = ''): Promise<void> {
  const items = await getDocs(resourcesCollection());
  const duplicate = items.docs.find((item: any) => item.id !== exceptId && item.data()?.draft?.slug === slug);
  if (duplicate) throw new SiteResourceValidationError('That URL slug is already being used by another resource.');
}

export async function createResource(input: unknown, actor: string): Promise<SiteResourceAdminRecord> {
  const fields = normaliseResourceInput(input);
  await assertUniqueSlug(fields.slug);
  const id = 'res_' + randomUUID().replace(/-/g, '');
  const now = new Date().toISOString();
  const record = {
    draft: fields, published: null, revision: 1, publishedRevision: 0,
    status: 'draft', isSample: false, createdAt: now, updatedAt: now,
    publishedAt: null, updatedBy: actor,
  };
  await createDoc(doc(resourcesCollection(), id), record);
  invalidateSiteResourcesCache();
  return cleanRecord(id, record);
}

export async function saveResourceDraft(
  id: string,
  input: unknown,
  expectedRevision: number,
  actor: string,
): Promise<SiteResourceAdminRecord> {
  const reference = doc(resourcesCollection(), id);
  const snapshot = await getDoc(reference);
  if (!snapshot.exists()) throw new SiteResourceValidationError('Resource not found.');
  const current = cleanRecord(id, snapshot.data());
  if (current.revision !== expectedRevision) throw new SiteResourceConflictError('This resource was changed in another session. Reload it before saving.');
  const fields = normaliseResourceInput(input);
  if (current.draft.slug && fields.slug !== current.draft.slug) {
    throw new SiteResourceValidationError('The URL slug is locked after the first save to protect existing links.');
  }
  await assertUniqueSlug(fields.slug, id);
  const next = {
    ...snapshot.data(),
    draft: fields,
    revision: current.revision + 1,
    updatedAt: new Date().toISOString(),
    updatedBy: actor,
  };
  await setDoc(reference, next);
  invalidateSiteResourcesCache();
  return cleanRecord(id, next);
}

export async function publishResource(id: string, expectedRevision: number, actor: string): Promise<SiteResourceAdminRecord> {
  const reference = doc(resourcesCollection(), id);
  const snapshot = await getDoc(reference);
  if (!snapshot.exists()) throw new SiteResourceValidationError('Resource not found.');
  const current = cleanRecord(id, snapshot.data());
  if (current.revision !== expectedRevision) throw new SiteResourceConflictError('This resource was changed in another session. Reload it before publishing.');
  const fields = normaliseResourceInput(current.draft, true);
  const now = new Date().toISOString();
  const next = {
    ...snapshot.data(),
    draft: fields,
    published: fields,
    revision: current.revision + 1,
    publishedRevision: current.revision + 1,
    status: 'published',
    updatedAt: now,
    publishedAt: current.publishedAt || now,
    updatedBy: actor,
  };
  await setDoc(reference, next);
  invalidateSiteResourcesCache();
  return cleanRecord(id, next);
}

export async function unpublishResource(id: string, expectedRevision: number, actor: string): Promise<SiteResourceAdminRecord> {
  return changeResourceStatus(id, expectedRevision, actor, 'draft', null);
}

export async function archiveResource(id: string, expectedRevision: number, actor: string): Promise<SiteResourceAdminRecord> {
  return changeResourceStatus(id, expectedRevision, actor, 'archived', undefined);
}

async function changeResourceStatus(
  id: string,
  expectedRevision: number,
  actor: string,
  status: 'draft' | 'archived',
  published: SiteResourceFields | null | undefined,
): Promise<SiteResourceAdminRecord> {
  const reference = doc(resourcesCollection(), id);
  const snapshot = await getDoc(reference);
  if (!snapshot.exists()) throw new SiteResourceValidationError('Resource not found.');
  const current = cleanRecord(id, snapshot.data());
  if (current.revision !== expectedRevision) throw new SiteResourceConflictError('This resource was changed in another session. Reload it before continuing.');
  const next = {
    ...snapshot.data(),
    published: published === undefined ? current.published : published,
    status,
    revision: current.revision + 1,
    updatedAt: new Date().toISOString(),
    updatedBy: actor,
  };
  await setDoc(reference, next);
  invalidateSiteResourcesCache();
  return cleanRecord(id, next);
}

export async function deleteResource(id: string, expectedRevision: number): Promise<void> {
  const reference = doc(resourcesCollection(), id);
  const snapshot = await getDoc(reference);
  if (!snapshot.exists()) throw new SiteResourceValidationError('Resource not found.');
  const current = cleanRecord(id, snapshot.data());
  if (current.revision !== expectedRevision) throw new SiteResourceConflictError('This resource was changed in another session. Reload it before deleting.');
  await deleteDoc(reference);
  invalidateSiteResourcesCache();
}

export async function saveResourceImage(dataUrl: unknown): Promise<{ id: string; url: string }> {
  if (typeof dataUrl !== 'string') throw new SiteResourceValidationError('Choose a valid image.');
  const match = dataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/i);
  if (!match) throw new SiteResourceValidationError('Use a PNG, JPG or WebP image.');
  const contentType = match[1].toLowerCase();
  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length || buffer.length > 2 * 1024 * 1024) throw new SiteResourceValidationError('Images must be 2 MB or smaller.');
  const png = contentType === 'image/png' && buffer[0] === 137 && buffer.subarray(1, 4).toString() === 'PNG';
  const jpeg = contentType === 'image/jpeg' && buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255;
  const webp = contentType === 'image/webp' && buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP';
  if (!(png || jpeg || webp)) throw new SiteResourceValidationError('The uploaded file does not match its image type.');
  const id = randomUUID();
  await createDoc(doc(mediaCollection(), id), {
    contentType,
    data: buffer.toString('base64'),
    size: buffer.length,
    createdAt: new Date().toISOString(),
  });
  return { id, url: '/api/site-resources/media/' + id };
}

export async function getResourceImage(id: string): Promise<{ data: Buffer; contentType: string } | null> {
  if (!/^[a-f0-9-]{36}$/.test(id)) return null;
  const snapshot = await getDoc(doc(mediaCollection(), id));
  if (!snapshot.exists()) return null;
  const raw = snapshot.data();
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(String(raw.contentType))) return null;
  const data = Buffer.from(String(raw.data || ''), 'base64');
  if (!data.length || data.length > 2 * 1024 * 1024) return null;
  return { data, contentType: String(raw.contentType) };
}
