import { db, getDoc, getDocs, setDoc, collection, doc } from './adminFirestore.js';
import { sanitizeForFirestore } from './firestoreUtils.js';
import { EMPTY_SEO_SETTINGS, normaliseSeoSettings, type SeoSettings } from '../shared/seoSettings.js';

export interface PublishedSeoSettings {
  version: number;
  seo: SeoSettings;
  publishedAt?: string;
  publishedBy?: string;
}
export interface DraftSeoSettings { seo: SeoSettings; updatedAt: string; updatedBy: string }
export interface SeoSettingsAdminView { published: PublishedSeoSettings; draft: DraftSeoSettings | null; versions: SeoVersionSummary[] }
export interface SeoVersionSummary { version: number; publishedAt?: string; publishedBy?: string; pageCount: number }

const settingsRef = () => doc(db, 'site_seo', 'main');
const versionRef = (version: number) => doc(db, 'site_seo', 'main', 'versions', String(version));
const emptyPublished = (): PublishedSeoSettings => ({ version: 0, seo: EMPTY_SEO_SETTINGS });

function parseSeo(raw: unknown): SeoSettings {
  if (typeof raw !== 'string' || !raw) return EMPTY_SEO_SETTINGS;
  try { return normaliseSeoSettings(JSON.parse(raw)); } catch { return EMPTY_SEO_SETTINGS; }
}
function parsePublished(raw: any): PublishedSeoSettings {
  if (!raw) return emptyPublished();
  return {
    version: Number(raw.version) || 0,
    seo: parseSeo(raw.seoJson),
    publishedAt: typeof raw.publishedAt === 'string' ? raw.publishedAt : undefined,
    publishedBy: typeof raw.publishedBy === 'string' ? raw.publishedBy : undefined,
  };
}
function parseDraft(raw: any): DraftSeoSettings | null {
  if (!raw || typeof raw !== 'object') return null;
  return {
    seo: parseSeo(raw.seoJson),
    updatedAt: String(raw.updatedAt || ''),
    updatedBy: String(raw.updatedBy || ''),
  };
}
async function readDoc(): Promise<any> {
  if (!db) return {};
  const snap = await getDoc(settingsRef());
  return snap.exists() ? snap.data() : {};
}

let cache: { at: number; value: PublishedSeoSettings } | null = null;
const CACHE_MS = 30_000;
export const invalidateSeoCache = () => { cache = null; };

export async function getPublishedSeoSettings(): Promise<PublishedSeoSettings> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;
  try {
    const data = await readDoc();
    const value = parsePublished(data.published);
    cache = { at: Date.now(), value };
    return value;
  } catch (error) {
    console.warn('[Website SEO] Could not read published settings; using defaults.', error);
    return cache?.value || emptyPublished();
  }
}

export async function listSeoVersions(): Promise<SeoVersionSummary[]> {
  if (!db) return [];
  const snap = await getDocs(collection(db, 'site_seo', 'main', 'versions'));
  return snap.docs.map((entry: any) => {
    const value = entry.data() as any;
    const seo = parseSeo(value.seoJson);
    return {
      version: Number(value.version) || Number(entry.id) || 0,
      publishedAt: value.publishedAt || undefined,
      publishedBy: value.publishedBy || undefined,
      pageCount: Object.keys(seo).length,
    };
  }).sort((a, b) => b.version - a.version).slice(0, 30);
}

export async function getSeoSettingsAdminView(): Promise<SeoSettingsAdminView> {
  const data = await readDoc();
  return { published: parsePublished(data.published), draft: parseDraft(data.draft), versions: await listSeoVersions() };
}

export async function saveSeoDraft(input: unknown, by: string): Promise<SeoSettingsAdminView> {
  const seo = normaliseSeoSettings(input);
  await setDoc(settingsRef(), sanitizeForFirestore({
    draft: { seoJson: JSON.stringify(seo), updatedAt: new Date().toISOString(), updatedBy: by },
  }) as any, { merge: true });
  return getSeoSettingsAdminView();
}

export async function discardSeoDraft(): Promise<SeoSettingsAdminView> {
  await setDoc(settingsRef(), { draft: null }, { merge: true });
  return getSeoSettingsAdminView();
}

export async function publishSeoSettings(by: string, input?: unknown): Promise<SeoSettingsAdminView> {
  const data = await readDoc();
  const source = input !== undefined ? input : data.draft ? parseSeo(data.draft.seoJson) : undefined;
  if (source === undefined) throw new Error('There are no SEO changes to publish');
  const seo = normaliseSeoSettings(source);
  const current = parsePublished(data.published);
  if (current.version > 0 || data.published) {
    await setDoc(versionRef(current.version), sanitizeForFirestore({
      version: current.version, seoJson: JSON.stringify(current.seo),
      publishedAt: current.publishedAt || null, publishedBy: current.publishedBy || null,
    }) as any);
  }
  const published = {
    version: current.version + 1, seoJson: JSON.stringify(seo),
    publishedAt: new Date().toISOString(), publishedBy: by,
  };
  await setDoc(settingsRef(), sanitizeForFirestore({ published, draft: null }) as any, { merge: true });
  invalidateSeoCache();
  return getSeoSettingsAdminView();
}

export async function restoreSeoVersion(version: number, by: string): Promise<SeoSettingsAdminView> {
  if (!Number.isInteger(version) || version < 0) throw new Error('Choose a valid SEO version');
  const data = await getDoc(versionRef(version));
  if (!data.exists()) throw new Error('SEO version not found');
  const versionData = data.data() as any;
  const seo = parseSeo(versionData.seoJson);
  await setDoc(settingsRef(), sanitizeForFirestore({
    draft: { seoJson: JSON.stringify(seo), updatedAt: new Date().toISOString(), updatedBy: by },
  }) as any, { merge: true });
  return getSeoSettingsAdminView();
}
