/**
 * Website Resources: Mongo collection `site_resources/{id}`, global (not per workspace).
 * First read seeds the sample resources once (tracked in `site_resources_meta/seed`), so anything an
 * admin deletes later stays deleted. Only platform admins can write; the public page reads published items.
 */
import { db, getDoc, getDocs, setDoc, deleteDoc, collection, doc } from './adminFirestore.js';
import { sanitizeForFirestore } from './firestoreUtils.js';
import {
  SAMPLE_RESOURCES, normaliseResourceInput, SiteResourceValidationError,
  type SiteResource, type SiteResourceInput,
} from '../shared/siteResources.js';

const col = () => collection(db, 'site_resources');
const seedRef = () => doc(db, 'site_resources_meta', 'seed');

let cache: { at: number; value: SiteResource[] } | null = null;
const CACHE_MS = 30_000;
export const invalidateResourcesCache = () => { cache = null; };

const byOrder = (a: SiteResource, b: SiteResource) => (a.order - b.order) || String(b.createdAt || '').localeCompare(String(a.createdAt || ''));

function toResource(id: string, raw: any): SiteResource {
  return {
    id,
    title: String(raw.title || ''),
    summary: String(raw.summary || ''),
    category: raw.category,
    href: String(raw.href || '/'),
    icon: raw.icon,
    published: raw.published !== false,
    order: Number(raw.order) || 0,
    isSample: raw.isSample === true ? true : undefined,
    createdAt: raw.createdAt || undefined,
    updatedAt: raw.updatedAt || undefined,
  };
}

async function seedIfNeeded(): Promise<void> {
  const seeded = await getDoc(seedRef());
  if (seeded.exists()) return;
  const now = new Date().toISOString();
  for (const item of SAMPLE_RESOURCES) {
    await setDoc(doc(col(), item.id), sanitizeForFirestore({ ...item, createdAt: now, updatedAt: now }) as any);
  }
  await setDoc(seedRef(), { seededAt: now });
}

/** Every resource (drafts included), for the admin panel. */
export async function listAllResources(): Promise<SiteResource[]> {
  if (!db) return SAMPLE_RESOURCES.map((s) => ({ ...s }));
  await seedIfNeeded();
  const snap = await getDocs(col());
  return snap.docs.map((d: any) => toResource(d.id, d.data())).sort(byOrder);
}

/** Published resources for the public Resources page. Falls back to the samples if the DB is unreachable. */
export async function listPublishedResources(): Promise<SiteResource[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;
  try {
    const value = (await listAllResources()).filter((r) => r.published);
    cache = { at: Date.now(), value };
    return value;
  } catch (error) {
    console.warn('[Site resources] Could not read resources; using samples.', error);
    return cache?.value || SAMPLE_RESOURCES.map((s) => ({ ...s }));
  }
}

export async function createResource(input: SiteResourceInput): Promise<SiteResource> {
  await seedIfNeeded();
  const data = normaliseResourceInput(input);
  const now = new Date().toISOString();
  const ref = doc(col());
  await setDoc(ref, sanitizeForFirestore({ ...data, createdAt: now, updatedAt: now }) as any);
  invalidateResourcesCache();
  return toResource(ref.id, { ...data, createdAt: now, updatedAt: now });
}

export async function updateResource(id: string, input: SiteResourceInput): Promise<SiteResource> {
  const ref = doc(col(), id);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new SiteResourceValidationError('Resource not found.');
  const current = toResource(id, snap.data());
  const data = normaliseResourceInput({ ...current, ...input });
  const updatedAt = new Date().toISOString();
  await setDoc(ref, sanitizeForFirestore({ ...data, isSample: current.isSample && input.title === undefined ? true : false, createdAt: current.createdAt, updatedAt }) as any);
  invalidateResourcesCache();
  return toResource(id, { ...data, createdAt: current.createdAt, updatedAt });
}

export async function deleteResource(id: string): Promise<void> {
  await deleteDoc(doc(col(), id));
  invalidateResourcesCache();
}
