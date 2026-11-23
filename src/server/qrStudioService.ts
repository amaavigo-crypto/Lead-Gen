import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  createDoc, deleteDoc, doc, getDoc, getDocs, increment, limit, query, setDoc, updateDoc, where,
} from './adminFirestore.js';
import { db } from './adminFirestore.js';
import { tenantRepo, assertValidTenantId } from './tenantRepo.js';
import type { TenantContext } from '../types/tenant.js';
import { getEntitlements } from './entitlements.js';
import { createQrPageTemplate } from '../shared/qrStudio.js';
import type { QrAnalytics, QrCodeStatus, QrPageDocument, QrSavedTheme, QrTemplateType } from '../shared/qrStudio.js';

const zeroAnalytics = (): QrAnalytics => ({ scanCount: 0, pageViewCount: 0, uniqueVisitorCount: 0, leadCount: 0, ctaClickCount: 0 });
const publicQrLeadRate = new Map<string, { startedAt: number; count: number }>();
const PUBLIC_QR_LEAD_WINDOW_MS = 10 * 60 * 1000;
const PUBLIC_QR_LEAD_LIMIT = 12;

function enforcePublicQrLeadRate(code: string, payload: any): void {
  const ip = cleanText(payload?.clientIp, 80).split(',')[0].trim();
  const visitor = cleanText(payload?.visitorId, 80);
  const identities = [ip && `ip:${ip}`, visitor && `visitor:${visitor}`].filter(Boolean) as string[];
  if (!identities.length) identities.push('visitor:anonymous');
  const now = Date.now();
  for (const [key, record] of publicQrLeadRate) {
    if (now - record.startedAt >= PUBLIC_QR_LEAD_WINDOW_MS) publicQrLeadRate.delete(key);
  }
  if (publicQrLeadRate.size > 5000) {
    for (const key of publicQrLeadRate.keys()) {
      publicQrLeadRate.delete(key);
      if (publicQrLeadRate.size <= 4000) break;
    }
  }
  for (const identity of identities) {
    const key = `${code}:${identity}`;
    const current = publicQrLeadRate.get(key);
    if (current && now - current.startedAt < PUBLIC_QR_LEAD_WINDOW_MS && current.count >= PUBLIC_QR_LEAD_LIMIT) {
      const error: any = new Error('Too many submissions. Please wait a few minutes and try again.');
      error.statusCode = 429;
      throw error;
    }
  }
  for (const identity of identities) {
    const key = `${code}:${identity}`;
    const current = publicQrLeadRate.get(key);
    if (!current || now - current.startedAt >= PUBLIC_QR_LEAD_WINDOW_MS) {
      publicQrLeadRate.set(key, { startedAt: now, count: 1 });
    } else {
      current.count += 1;
    }
  }
}
const cleanText = (value: unknown, max = 500): string => String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);
const id = (prefix: string) => `${prefix}_${randomUUID().replace(/-/g, '')}`;
const routeDoc = (code: string) => doc(db, 'qr_public_routes', code);
const tenantContextFor = (tenantId: string): TenantContext => ({ tenantId: assertValidTenantId(tenantId), uid: 'qr-public', email: '', role: 'member' });

function isHttpQrUrl(value: unknown): boolean {
  try {
    const parsed = new URL(String(value || '').trim());
    return (parsed.protocol === 'https:' || parsed.protocol === 'http:') && Boolean(parsed.hostname) && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}

export function isSafeQrUrl(input: unknown, allowRelative = true): string {
  const value = cleanText(input, 2048);
  if (!value) return '';
  if (allowRelative && value.startsWith('/api/assets/')) return value;
  try {
    const parsed = new URL(value);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:' || parsed.protocol === 'mailto:' || parsed.protocol === 'tel:') {
      return parsed.toString();
    }
  } catch {}
  return '';
}

function safeTheme(input: any): any {
  const source = input && typeof input === 'object' ? input : {};
  const color = (v: any, fallback: string) => /^#[0-9a-f]{3,8}$/i.test(String(v || '')) ? String(v) : fallback;
  const backgroundType = ['solid', 'gradient', 'image', 'video'].includes(source.backgroundType) ? source.backgroundType : 'solid';
  return {
    backgroundType,
    backgroundColor: color(source.backgroundColor, '#F7F8FC'),
    backgroundImage: isSafeQrUrl(source.backgroundImage),
    backgroundVideo: isSafeQrUrl(source.backgroundVideo),
    gradientFrom: color(source.gradientFrom, '#101A3A'),
    gradientTo: color(source.gradientTo, '#4169E1'),
    textColor: color(source.textColor, '#18233E'),
    mutedColor: color(source.mutedColor, '#64748B'),
    accentColor: color(source.accentColor, '#3459E8'),
    buttonTextColor: color(source.buttonTextColor, '#FFFFFF'),
    fontFamily: cleanText(source.fontFamily || 'Inter, ui-sans-serif, system-ui, sans-serif', 120),
    cardRadius: Math.max(0, Math.min(40, Number(source.cardRadius) || 22)),
    buttonRadius: Math.max(0, Math.min(40, Number(source.buttonRadius) || 14)),
    contentWidth: Math.max(320, Math.min(1100, Number(source.contentWidth) || 720)),
  };
}

const ALLOWED_BLOCKS = new Set(['hero', 'text', 'image', 'gallery', 'video', 'lottie', 'button', 'form', 'menu', 'products', 'divider']);
const ALLOWED_ANIMATIONS = new Set(['none', 'fade', 'slide', 'zoom', 'stagger', 'float', 'parallax', 'scroll']);

export function sanitizeQrPage(input: any): QrPageDocument {
  const source = input && typeof input === 'object' ? input : {};
  const blocks = Array.isArray(source.blocks) ? source.blocks.slice(0, 40) : [];
  const cleanBlocks = blocks.map((raw: any) => {
    const item = raw && typeof raw === 'object' ? raw : {};
    const type = ALLOWED_BLOCKS.has(item.type) ? item.type : 'text';
    const fields = Array.isArray(item.fields) ? item.fields.slice(0, 20).map((f: any, index: number) => ({
      id: cleanText(f?.id || `field_${index + 1}`, 60) || `field_${index + 1}`,
      label: cleanText(f?.label || 'Your answer', 100),
      type: ['text', 'email', 'tel', 'number', 'textarea', 'select', 'checkbox'].includes(f?.type) ? f.type : 'text',
      placeholder: cleanText(f?.placeholder, 180),
      required: Boolean(f?.required),
      options: Array.isArray(f?.options) ? f.options.slice(0, 30).map((v: any) => cleanText(v, 100)).filter(Boolean) : [],
      showWhen: f?.showWhen && typeof f.showWhen === 'object' ? {
        fieldId: cleanText(f.showWhen.fieldId, 60),
        operator: ['equals', 'not_equals', 'contains', 'is_filled'].includes(f.showWhen.operator) ? f.showWhen.operator : 'equals',
        value: cleanText(f.showWhen.value, 120),
      } : undefined,
    })) : undefined;
    const images = Array.isArray(item.imageUrls) ? item.imageUrls.slice(0, 16).map((v: any) => isSafeQrUrl(v)).filter(Boolean) : undefined;
    const items = Array.isArray(item.items) ? item.items.slice(0, 100) : undefined;
    const safeItems = items ? JSON.parse(JSON.stringify(items, (key, value) => {
      if (typeof value === 'string') {
        if (['imageUrl', 'videoUrl', 'href', 'src', 'url'].includes(key)) return isSafeQrUrl(value);
        return value.slice(0, 1000);
      }
      return value;
    })) : undefined;
    return {
      id: cleanText(item.id || id('blk'), 80),
      type,
      title: cleanText(item.title, 180),
      body: cleanText(item.body, 4000),
      label: cleanText(item.label, 120),
      imageUrl: isSafeQrUrl(item.imageUrl),
      imageUrls: images,
      videoUrl: isSafeQrUrl(item.videoUrl),
      lottieUrl: isSafeQrUrl(item.lottieUrl),
      href: isSafeQrUrl(item.href),
      animation: ALLOWED_ANIMATIONS.has(item.animation) ? item.animation : 'none',
      items: safeItems,
      fields,
      backgroundColor: /^#[0-9a-f]{3,8}$/i.test(String(item.backgroundColor || '')) ? String(item.backgroundColor) : undefined,
      align: ['left', 'center', 'right'].includes(item.align) ? item.align : 'left',
    };
  });
  const page: QrPageDocument = {
    title: cleanText(source.title || 'Your experience', 120),
    description: cleanText(source.description, 250),
    theme: safeTheme(source.theme),
    blocks: cleanBlocks,
  };
  if (JSON.stringify(page).length > 280000) throw new Error('This page is too large. Reduce the number or size of media URLs and content.');
  return page;
}

async function getCode(ctx: TenantContext, qrId: string): Promise<any | null> {
  if (!/^[A-Za-z0-9_-]{6,100}$/.test(qrId)) return null;
  const snap = await getDoc(tenantRepo(ctx).doc('qr_codes', qrId));
  return snap.exists() ? { ...(snap.data() as any), id: snap.id } : null;
}

async function allocateCode(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomBytes(9).toString('base64url');
    try {
      await createDoc(routeDoc(code), { active: false, createdAt: new Date().toISOString() });
      return code;
    } catch (error: any) {
      const message = String(error?.message || '').toLowerCase();
      if (!message.includes('exist') && error?.code !== 6 && error?.code !== 'already-exists') throw error;
    }
  }
  throw new Error('Could not allocate a unique QR link. Please try again.');
}

export async function listQrCodes(ctx: TenantContext): Promise<any[]> {
  const repo = tenantRepo(ctx);
  const snapshot = await getDocs(query(repo.collection('qr_codes'), (q: any) => q.orderBy('createdAt', 'desc')));
  return snapshot.docs.map((entry) => ({ ...(entry.data() as any), id: entry.id }));
}

export async function getQrSummary(ctx: TenantContext): Promise<any> {
  const codes = await listQrCodes(ctx);
  return {
    total: codes.length,
    active: codes.filter((c) => c.status === 'active').length,
    drafts: codes.filter((c) => c.status === 'draft').length,
    paused: codes.filter((c) => c.status === 'paused').length,
    scans: codes.reduce((sum, c) => sum + Number(c.scanCount || 0), 0),
    visits: codes.reduce((sum, c) => sum + Number(c.pageViewCount || 0), 0),
    visitors: codes.reduce((sum, c) => sum + Number(c.uniqueVisitorCount || 0), 0),
    leads: codes.reduce((sum, c) => sum + Number(c.leadCount || 0), 0),
    clicks: codes.reduce((sum, c) => sum + Number(c.ctaClickCount || 0), 0),
    codes,
  };
}

export async function createQrCode(ctx: TenantContext, input: any): Promise<any> {
  const name = cleanText(input?.name, 100);
  if (!name) throw new Error('Give your QR code a name.');
  const template = ['menu', 'business-profile', 'offer', 'lead-capture', 'blank'].includes(input?.template)
    ? input.template as QrTemplateType : 'blank';
  const destinationKind = input?.destination?.kind === 'url' ? 'url' : 'page';
  const destinationUrl = destinationKind === 'url' && isHttpQrUrl(input?.destination?.url) ? isSafeQrUrl(input?.destination?.url, false) : '';
  if (destinationKind === 'url' && !destinationUrl) throw new Error('Enter a valid http or https destination URL.');
  const entitlements = await getEntitlements(ctx.tenantId);
  const existing = await listQrCodes(ctx);
  const cap = Number(entitlements?.limits?.qrCodes ?? 100);
  if (Number.isFinite(cap) && cap >= 0 && existing.filter((c) => c.status !== 'archived').length >= cap) {
    throw new Error(`Your plan allows ${cap} managed QR codes. Archive an unused code or update your plan.`);
  }
  const code = await allocateCode();
  const now = new Date().toISOString();
  const qrId = id('qr');
  const record = {
    id: qrId, tenantId: ctx.tenantId, name, description: cleanText(input?.description, 240), template,
    code, status: 'draft', destination: { kind: destinationKind, ...(destinationUrl ? { url: destinationUrl } : {}) },
    pageData: createQrPageTemplate(template, name),
    qrStyle: { shape: 'square', foregroundColor: '#101828', backgroundColor: '#FFFFFF', frameText: 'SCAN TO EXPLORE' },
    analytics: zeroAnalytics(), scanCount: 0, pageViewCount: 0, uniqueVisitorCount: 0, leadCount: 0, ctaClickCount: 0,
    folder: cleanText(input?.folder, 80), tags: Array.isArray(input?.tags) ? input.tags.slice(0, 12).map((v: any) => cleanText(v, 40)) : [],
    createdAt: now, updatedAt: now,
  };
  try {
    await setDoc(tenantRepo(ctx).doc('qr_codes', qrId), record, { merge: false });
    await updateDoc(routeDoc(code), { tenantId: ctx.tenantId, qrId, active: false, createdAt: now });
  } catch (error) {
    await deleteDoc(routeDoc(code)).catch(() => {});
    throw error;
  }
  return record;
}

export async function updateQrCode(ctx: TenantContext, qrId: string, input: any): Promise<any> {
  const current = await getCode(ctx, qrId);
  if (!current) return null;
  if (current.status === 'archived') throw new Error('Archived QR codes are read-only. Duplicate the code to create a new experience.');
  const patch: any = { updatedAt: new Date().toISOString() };
  if (input?.name !== undefined) {
    const name = cleanText(input.name, 100);
    if (!name) throw new Error('QR code name cannot be empty.');
    patch.name = name;
  }
  if (input?.description !== undefined) patch.description = cleanText(input.description, 240);
  if (input?.destination !== undefined) {
    if (input.destination?.kind === 'url') {
      const url = isHttpQrUrl(input.destination.url) ? isSafeQrUrl(input.destination.url, false) : '';
      if (!url) throw new Error('Enter a valid http or https destination URL.');
      patch.destination = { kind: 'url', url };
    } else patch.destination = { kind: 'page' };
  }
  if (input?.pageData !== undefined) patch.pageData = sanitizeQrPage(input.pageData);
  if (input?.qrStyle !== undefined) {
    const s = input.qrStyle || {};
    const color = (v: any, fallback: string) => /^#[0-9a-f]{3,8}$/i.test(String(v || '')) ? String(v) : fallback;
    patch.qrStyle = {
      shape: ['square', 'rounded', 'dots'].includes(s.shape) ? s.shape : 'square',
      foregroundColor: color(s.foregroundColor, '#101828'),
      backgroundColor: color(s.backgroundColor, '#FFFFFF'),
      logoUrl: isSafeQrUrl(s.logoUrl),
      frameText: cleanText(s.frameText, 36),
    };
  }
  if (input?.schedule !== undefined) {
    const startsAt = input.schedule?.startsAt ? new Date(input.schedule.startsAt) : null;
    const endsAt = input.schedule?.endsAt ? new Date(input.schedule.endsAt) : null;
    if (startsAt && !Number.isFinite(startsAt.getTime())) throw new Error('Start date is invalid.');
    if (endsAt && !Number.isFinite(endsAt.getTime())) throw new Error('End date is invalid.');
    if (startsAt && endsAt && endsAt <= startsAt) throw new Error('End date must be after the start date.');
    patch.schedule = { startsAt: startsAt?.toISOString(), endsAt: endsAt?.toISOString() };
  }
  if (input?.folder !== undefined) patch.folder = cleanText(input.folder, 80);
  if (input?.tags !== undefined) patch.tags = Array.isArray(input.tags) ? input.tags.slice(0, 12).map((v: any) => cleanText(v, 40)) : [];
  await updateDoc(tenantRepo(ctx).doc('qr_codes', qrId), patch);
  return { ...current, ...patch };
}

export async function publishQrCode(ctx: TenantContext, qrId: string): Promise<any> {
  const current = await getCode(ctx, qrId);
  if (!current) return null;
  if (current.status === 'archived') throw new Error('Archived QR codes cannot be published. Duplicate this code to create a new experience.');
  if (current.destination?.kind === 'url' && !isHttpQrUrl(current.destination.url)) throw new Error('Destination URL must use http or https.');
  const page = sanitizeQrPage(current.pageData);
  const now = new Date().toISOString();
  const versions = await getDocs(query(tenantRepo(ctx).collection('qr_page_versions'), where('qrId', '==', qrId)));
  const versionId = id('qrv');
  const versionNumber = versions.size + 1;
  await setDoc(tenantRepo(ctx).doc('qr_page_versions', versionId), {
    id: versionId, qrId, version: versionNumber, pageData: page, createdAt: now, createdBy: ctx.uid,
  }, { merge: false });
  const patch = { publishedPage: page, status: 'active', publishedAt: now, updatedAt: now };
  await updateDoc(tenantRepo(ctx).doc('qr_codes', qrId), patch);
  await updateDoc(routeDoc(current.code), { tenantId: ctx.tenantId, qrId, active: true, updatedAt: now });
  return { ...current, ...patch };
}

export async function setQrStatus(ctx: TenantContext, qrId: string, status: QrCodeStatus): Promise<any> {
  if (!['active', 'paused', 'archived', 'draft'].includes(status)) throw new Error('Invalid QR status.');
  const current = await getCode(ctx, qrId);
  if (!current) return null;
  if (current.status === 'archived' && status !== 'archived') throw new Error('Archived QR codes cannot be reactivated. Duplicate this code to create a new experience.');
  if (status === 'active' && !current.publishedPage) throw new Error('Publish this QR experience before activating it.');
  const now = new Date().toISOString();
  await updateDoc(tenantRepo(ctx).doc('qr_codes', qrId), { status, updatedAt: now });
  await updateDoc(routeDoc(current.code), { active: status === 'active', updatedAt: now });
  return { ...current, status, updatedAt: now };
}

export async function duplicateQrCode(ctx: TenantContext, qrId: string): Promise<any> {
  const current = await getCode(ctx, qrId);
  if (!current) return null;
  const code = await allocateCode();
  const now = new Date().toISOString();
  const copyId = id('qr');
  const copy = {
    ...current, id: copyId, tenantId: ctx.tenantId, name: `${cleanText(current.name, 80)} copy`, code,
    status: 'draft', publishedPage: undefined, publishedAt: undefined, lastScannedAt: undefined,
    analytics: zeroAnalytics(), scanCount: 0, pageViewCount: 0, uniqueVisitorCount: 0, leadCount: 0, ctaClickCount: 0,
    createdAt: now, updatedAt: now,
  };
  await setDoc(tenantRepo(ctx).doc('qr_codes', copyId), copy, { merge: false });
  await updateDoc(routeDoc(code), { tenantId: ctx.tenantId, qrId: copyId, active: false, createdAt: now });
  return copy;
}

export async function deleteQrCode(ctx: TenantContext, qrId: string): Promise<boolean> {
  const current = await getCode(ctx, qrId);
  if (!current) return false;
  if (current.status !== 'archived' && current.status !== 'draft') throw new Error('Pause or archive this QR code before deleting it.');
  const repo = tenantRepo(ctx);
  const collections = ['qr_page_versions', 'qr_scan_events', 'qr_public_visitors', 'qr_analytics_daily'];
  const snapshots = await Promise.all(collections.map((name) =>
    getDocs(query(repo.collection(name), where('qrId', '==', qrId)))
  ));
  await Promise.all(snapshots.flatMap((snapshot, index) => snapshot.docs.map((entry) =>
    deleteDoc(repo.doc(collections[index], entry.id))
  )));
  await deleteDoc(repo.doc('qr_codes', qrId));
  await deleteDoc(routeDoc(current.code)).catch(() => {});
  return true;
}

export async function listQrVersions(ctx: TenantContext, qrId: string): Promise<any[]> {
  if (!await getCode(ctx, qrId)) return [];
  const snap = await getDocs(query(tenantRepo(ctx).collection('qr_page_versions'), where('qrId', '==', qrId)));
  return snap.docs.map((entry) => ({ ...(entry.data() as any), id: entry.id })).sort((a, b) => Number(b.version || 0) - Number(a.version || 0));
}

export async function restoreQrVersion(ctx: TenantContext, qrId: string, versionId: string): Promise<any> {
  if (!await getCode(ctx, qrId)) return null;
  const snapshot = await getDoc(tenantRepo(ctx).doc('qr_page_versions', versionId));
  if (!snapshot.exists() || (snapshot.data() as any).qrId !== qrId) return null;
  const pageData = sanitizeQrPage((snapshot.data() as any).pageData);
  return updateQrCode(ctx, qrId, { pageData });
}

export async function listQrThemes(ctx: TenantContext): Promise<any[]> {
  const snap = await getDocs(tenantRepo(ctx).collection('qr_themes'));
  return snap.docs.map((entry) => ({ ...(entry.data() as any), id: entry.id }));
}

export async function saveQrTheme(ctx: TenantContext, input: any): Promise<any> {
  const name = cleanText(input?.name, 80);
  if (!name) throw new Error('Give this reusable theme or section a name.');
  const kind = input?.kind === 'section' ? 'section' : 'theme';
  const theme = kind === 'theme' ? safeTheme(input.theme) : undefined;
  const rawBlock = input?.block;
  const block = kind === 'section' && rawBlock ? sanitizeQrPage({ blocks: [rawBlock] }).blocks[0] : undefined;
  if (kind === 'section' && !block) throw new Error('Choose a page section to save.');
  const themeId = id('qrt');
  const now = new Date().toISOString();
  const record = { id: themeId, name, kind, theme, block, createdAt: now, updatedAt: now };
  await setDoc(tenantRepo(ctx).doc('qr_themes', themeId), record, { merge: false });
  return record;
}

export async function getQrAnalytics(ctx: TenantContext, requestedDays = 30): Promise<any> {
  const days = Math.max(7, Math.min(90, Math.floor(Number(requestedDays) || 30)));
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const endDay = today.toISOString().slice(0, 10);
  const start = new Date(today.getTime() - (days - 1) * 86_400_000);
  const startDay = start.toISOString().slice(0, 10);
  const repo = tenantRepo(ctx);
  const [dailySnapshot, eventSnapshot, codes] = await Promise.all([
    getDocs(query(repo.collection('qr_analytics_daily'), where('day', '>=', startDay), where('day', '<=', endDay))),
    getDocs(query(repo.collection('qr_scan_events'), where('day', '>=', startDay), where('day', '<=', endDay), limit(2000))),
    listQrCodes(ctx),
  ]);
  const byDay = new Map<string, any>();
  for (const item of dailySnapshot.docs) {
    const row = item.data() as any;
    const day = String(row.day || '');
    if (!day) continue;
    const current = byDay.get(day) || { day, scans: 0, pageViews: 0, ctaClicks: 0, leads: 0 };
    current.scans += Number(row.scans || 0);
    current.pageViews += Number(row.pageViews || 0);
    current.ctaClicks += Number(row.ctaClicks || 0);
    current.leads += Number(row.leads || 0);
    byDay.set(day, current);
  }
  const trend = Array.from({ length: days }, (_, index) => {
    const date = new Date(start.getTime() + index * 86_400_000);
    const day = date.toISOString().slice(0, 10);
    return byDay.get(day) || { day, scans: 0, pageViews: 0, ctaClicks: 0, leads: 0 };
  });
  const counts = (key: string) => {
    const map = new Map<string, number>();
    for (const entry of eventSnapshot.docs) {
      const row = entry.data() as any;
      if (row.type !== 'page_view') continue;
      const value = cleanText(row[key] || 'Direct', 120) || 'Direct';
      map.set(value, (map.get(value) || 0) + 1);
    }
    return [...map.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 8);
  };
  const ctas = new Map<string, number>();
  for (const entry of eventSnapshot.docs) {
    const row = entry.data() as any;
    if (row.type !== 'cta_click') continue;
    const label = cleanText(row.actionLabel || 'Button', 80) || 'Button';
    ctas.set(label, (ctas.get(label) || 0) + 1);
  }
  return {
    days,
    from: startDay,
    to: endDay,
    trend,
    devices: counts('device'),
    referrers: counts('referrerHost'),
    topCtas: [...ctas.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count).slice(0, 10),
    topQrCodes: [...codes].sort((a, b) => Number(b.pageViewCount || 0) - Number(a.pageViewCount || 0)).slice(0, 8),
    sampledEvents: eventSnapshot.size,
    eventSampleLimit: 2000,
  };
}

export async function getPublicQr(code: string): Promise<any | null> {
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(code)) return null;
  const route = await getDoc(routeDoc(code));
  if (!route.exists()) return null;
  const routeData = route.data() as any;
  if (!routeData.active || !routeData.tenantId || !routeData.qrId) return null;
  const ctx = tenantContextFor(String(routeData.tenantId));
  const qr = await getCode(ctx, String(routeData.qrId));
  if (!qr || qr.status !== 'active' || !qr.publishedPage) return null;
  const now = Date.now();
  const startsAt = qr.schedule?.startsAt ? Date.parse(qr.schedule.startsAt) : NaN;
  const endsAt = qr.schedule?.endsAt ? Date.parse(qr.schedule.endsAt) : NaN;
  if (Number.isFinite(startsAt) && now < startsAt) return null;
  if (Number.isFinite(endsAt) && now > endsAt) return null;
  const redirectUrl = qr.destination?.kind === 'url' && isHttpQrUrl(qr.destination.url) ? isSafeQrUrl(qr.destination.url, false) : '';
  return {
    code, redirectUrl: redirectUrl || undefined,
    qr: { id: qr.id, name: qr.name, template: qr.template, page: qr.publishedPage, theme: qr.publishedPage?.theme },
  };
}

export async function trackPublicQrEvent(code: string, input: any): Promise<boolean> {
  const resolved = await getPublicQr(code);
  if (!resolved) return false;
  const type = ['scan_request', 'page_view', 'cta_click'].includes(input?.type) ? input.type : '';
  if (!type) return false;
  const ctx = tenantContextFor((await getDoc(routeDoc(code))).data()?.tenantId);
  const qr = await getCode(ctx, resolved.qr.id);
  if (!qr) return false;
  const repo = tenantRepo(ctx);
  const now = new Date();
  const timestamp = now.toISOString();
  const day = timestamp.slice(0, 10);
  const visitorId = /^[a-zA-Z0-9_-]{16,80}$/.test(String(input?.visitorId || '')) ? String(input.visitorId) : '';
  const visitorHash = visitorId ? createHash('sha256').update(`${code}:${visitorId}`).digest('hex') : '';
  const eventId = id('qre');
  const ua = cleanText(input?.userAgent, 400).toLowerCase();
  const device = /ipad|tablet/.test(ua) ? 'tablet' : /mobile|android|iphone/.test(ua) ? 'mobile' : 'desktop';
  const referrerHost = (() => { try { return new URL(String(input?.referrer || '')).host.slice(0, 120); } catch { return ''; } })();
  await setDoc(repo.doc('qr_scan_events', eventId), {
    id: eventId, qrId: qr.id, type, timestamp, day, device, referrerHost,
    visitorHash: visitorHash || undefined,
    actionLabel: type === 'cta_click' ? cleanText(input?.label, 80) : undefined,
  }, { merge: false });
  const patch: any = { updatedAt: timestamp, lastScannedAt: timestamp };
  if (type === 'scan_request') patch.scanCount = increment(1);
  if (type === 'page_view') patch.pageViewCount = increment(1);
  if (type === 'cta_click') patch.ctaClickCount = increment(1);
  await updateDoc(repo.doc('qr_codes', qr.id), patch);
  if (visitorHash && type === 'page_view') {
    const visitorDoc = repo.doc('qr_public_visitors', `${qr.id}_${visitorHash.slice(0, 48)}`);
    const prior = await getDoc(visitorDoc);
    if (!prior.exists()) {
      await setDoc(visitorDoc, { qrId: qr.id, firstSeenAt: timestamp, lastSeenAt: timestamp }, { merge: true });
      await updateDoc(repo.doc('qr_codes', qr.id), { uniqueVisitorCount: increment(1) });
    } else {
      await updateDoc(visitorDoc, { lastSeenAt: timestamp });
    }
  }
  const dailyId = `${qr.id}_${day}`;
  const dailyRef = repo.doc('qr_analytics_daily', dailyId);
  const dailyPatch: any = { qrId: qr.id, day, updatedAt: timestamp };
  if (type === 'scan_request') dailyPatch.scans = increment(1);
  if (type === 'page_view') dailyPatch.pageViews = increment(1);
  if (type === 'cta_click') dailyPatch.ctaClicks = increment(1);
  await setDoc(dailyRef, dailyPatch, { merge: true });
  return true;
}

export async function submitPublicQrLead(code: string, payload: any): Promise<any> {
  const resolved = await getPublicQr(code);
  if (!resolved || resolved.redirectUrl) throw new Error('This QR experience is unavailable.');
  if (cleanText(payload?.website, 200)) return { success: true, message: 'Thank you.' };
  enforcePublicQrLeadRate(code, payload);
  const route = await getDoc(routeDoc(code));
  const ctx = tenantContextFor(String((route.data() as any)?.tenantId || ''));
  const qr = await getCode(ctx, resolved.qr.id);
  if (!qr || qr.status !== 'active') throw new Error('This QR experience is unavailable.');
  const formBlocks = (resolved.qr.page?.blocks || []).filter((item: any) => item.type === 'form');
  const requestedFormId = cleanText(payload?.formBlockId, 80);
  const submittedForm = formBlocks.find((item: any) => item.id === requestedFormId)
    || formBlocks.find((item: any) => (item.fields || []).some((field: any) => Object.prototype.hasOwnProperty.call(payload?.fields || {}, field.id)))
    || formBlocks[0];
  if (!submittedForm) throw new Error('This QR page does not currently accept form submissions.');
  const submittedFields = Array.isArray(submittedForm.fields) ? submittedForm.fields : [];
  const fields = payload?.fields && typeof payload.fields === 'object' && !Array.isArray(payload.fields) ? payload.fields : {};
  const values: Record<string, string> = {};
  for (const definition of submittedFields) {
    if (!Object.prototype.hasOwnProperty.call(fields, definition.id)) continue;
    const rawValue = fields[definition.id];
    const safeValue = definition.type === 'checkbox'
      ? (rawValue === true || rawValue === 'true' ? 'true' : '')
      : cleanText(rawValue, 1500);
    values[cleanText(definition.id, 60)] = safeValue;
  }
  const visibleField = (field: any): boolean => {
    const condition = field?.showWhen;
    if (!condition?.fieldId) return true;
    const actual = String(values[condition.fieldId] || '').trim();
    const expected = String(condition.value || '').trim();
    if (condition.operator === 'not_equals') return actual !== expected;
    if (condition.operator === 'contains') return actual.toLowerCase().includes(expected.toLowerCase());
    if (condition.operator === 'is_filled') return Boolean(actual);
    return actual === expected;
  };
  for (const definition of submittedFields) {
    const value = String(values[definition.id] || '').trim();
    if (definition.required && visibleField(definition) && !value) {
      throw new Error(`Please complete the required field: ${cleanText(definition.label, 100)}.`);
    }
    if (definition.required && definition.type === 'checkbox' && value !== 'true' && visibleField(definition)) {
      throw new Error(`Please confirm: ${cleanText(definition.label, 100)}.`);
    }
    if (definition.type === 'select' && value && Array.isArray(definition.options) && !definition.options.includes(value)) {
      throw new Error(`Choose a valid option for: ${cleanText(definition.label, 100)}.`);
    }
    if (!value) continue;
    if (definition.type === 'email') {
      const parts = value.toLowerCase().split('@');
      if (parts.length !== 2 || !parts[0] || !parts[1].includes('.') || value.includes(' ')) throw new Error(`Enter a valid email address for: ${cleanText(definition.label, 100)}.`);
      if (!values.email) values.email = value;
    }
    if (definition.type === 'tel' && !values.phone) values.phone = value;
    const key = `${definition.id} ${definition.label}`.toLowerCase();
    if (!values.email && (key.includes('email') || key.includes('e-mail'))) values.email = value;
    if (!values.phone && ['phone', 'mobile', 'telephone', 'whatsapp'].some((word) => key.includes(word))) values.phone = value;
    if (!values.fullName && (key.includes('full name') || key.includes('your name') || key.includes('contact name') || key.trim() === 'name' || key.endsWith(' name'))) values.fullName = value;
    if (!values.company && key.includes('company')) values.company = value;
    if (!values.country && key.includes('country')) values.country = value;
    if (!values.city && key.includes('city')) values.city = value;
    if (!values.website && key.includes('website')) values.website = value;
    if (!values.message && ['message', 'enquiry', 'inquiry', 'requirement', 'comment'].some((word) => key.includes(word))) values.message = value;
  }
  if (!Object.values(values).some((value) => String(value).trim())) {
    throw new Error('Please complete this form before submitting.');
  }
  const field = (...keys: string[]) => {
    const wanted = new Set(keys.map((key) => key.toLowerCase().replace(/[^a-z0-9]/g, '')));
    const found = Object.entries(values).find(([key]) => wanted.has(key.toLowerCase().replace(/[^a-z0-9]/g, '')));
    return found?.[1] || '';
  };
  const fullName = field('fullname', 'name', 'yourname') || [field('firstname'), field('lastname')].filter(Boolean).join(' ');
  const email = field('email', 'emailaddress').toLowerCase();
  const phone = field('phone', 'phonenumber', 'mobile', 'telephone', 'whatsapp');
  if (email) {
    const parts = email.split('@');
    if (email.includes(' ') || parts.length !== 2 || !parts[0] || !parts[1].includes('.')) throw new Error('Enter a valid email address.');
  }

  const repo = tenantRepo(ctx);
  let existingContact: any = null;
  if (email) {
    const match = await getDocs(query(repo.contacts(), where('email', '==', email), limit(1)));
    if (!match.empty) existingContact = { ...(match.docs[0].data() as any), contactId: match.docs[0].id };
  }
  if (!existingContact && phone) {
    const match = await getDocs(query(repo.contacts(), where('phone', '==', phone), limit(1)));
    if (!match.empty) existingContact = { ...(match.docs[0].data() as any), contactId: match.docs[0].id };
  }
  const now = new Date().toISOString();
  const contactId = existingContact?.contactId || id('con');
  const names = (fullName || 'QR visitor').trim().split(' ').filter(Boolean);
  const messageText = field('message', 'query', 'comments', 'enquiry', 'howcanwehelp');
  const contact = {
    ...(existingContact || {}),
    contactId, firstName: names[0] || 'QR', lastName: names.slice(1).join(' '),
    email, phone, companyName: field('company', 'companyname', 'business') || existingContact?.companyName || '',
    country: field('country') || existingContact?.country || '',
    city: field('city') || existingContact?.city || '',
    website: field('website') || existingContact?.website || '',
    tags: Array.from(new Set([...(existingContact?.tags || []), 'QR', `QR:${qr.id}`])),
    notes: [existingContact?.notes, `QR enquiry: ${qr.name}`].filter(Boolean).join(String.fromCharCode(10)),
    createdAt: existingContact?.createdAt || now, updatedAt: now, lastActivityAt: now,
  };
  let reusableConversation: any = null;
  if (contactId) {
    try {
      const matches = await getDocs(query(repo.conversations(), where('contactId', '==', contactId), limit(20)));
      reusableConversation = matches.docs
        .map((entry) => ({ ...(entry.data() as any), conversationId: (entry.data() as any).conversationId || entry.id }))
        .filter((entry) => !['CLOSED', 'RESOLVED', 'ARCHIVED'].includes(String(entry.status || '').toUpperCase()))
        .sort((a, b) => Date.parse(b.lastMessageAt || b.updatedAt || '') - Date.parse(a.lastMessageAt || a.updatedAt || ''))[0] || null;
    } catch (error: any) {
      console.warn('[QR Studio] Could not find an existing conversation for this contact:', error?.message || error);
    }
  }
  let existingLead: any = null;
  if (reusableConversation?.leadId) {
    const previousLead = await getDoc(repo.leadDoc(String(reusableConversation.leadId)));
    if (previousLead.exists()) existingLead = previousLead.data();
  }
  const leadId = reusableConversation?.leadId || id('lead');
  const sourceUrl = `/q/${code}`;
  const previousRequirements = Array.isArray(existingLead?.requirements) ? existingLead.requirements : [];
  const lead = {
    ...(existingLead || {}),
    leadId, contactId, source: 'WEBSITE', leadType: 'INBOUND',
    status: existingLead?.status || 'NEW',
    leadScore: Number.isFinite(Number(existingLead?.leadScore)) ? Number(existingLead.leadScore) : 50,
    intent: existingLead?.intent || 'MEDIUM',
    buyingStage: existingLead?.buyingStage || 'AWARENESS',
    requirements: Array.from(new Set([...previousRequirements, qr.name])),
    serviceInterest: qr.name,
    queryMessage: messageText,
    notes: [existingLead?.notes, messageText || `QR enquiry from ${qr.name}`].filter(Boolean).join(String.fromCharCode(10)),
    sourceUrl, campaignName: `QR · ${qr.name}`,
    rawFormFields: { ...(existingLead?.rawFormFields || {}), ...values, qrCodeId: qr.id, qrCodeName: qr.name, qrCode: code },
    createdAt: existingLead?.createdAt || now, updatedAt: now, lastActivityAt: now,
  };
  const conversationId = reusableConversation?.conversationId || id('conv');
  const messageId = id('msg');
  const conversationText = [
    `QR enquiry: ${qr.name}`,
    `Name: ${fullName || 'Not provided'}`,
    `Email: ${email || 'Not provided'}`,
    `Phone: ${phone || 'Not provided'}`,
    `Message: ${messageText || 'Visitor submitted a QR enquiry form.'}`,
    `Scan link: ${sourceUrl}`,
  ].join(String.fromCharCode(10));
  const conversation = {
    ...(reusableConversation || {}),
    conversationId, contactId, leadId, channel: 'WEBSITE', direction: 'INBOUND',
    status: 'ACTIVE', aiEnabled: false, humanHandoff: Boolean(reusableConversation?.humanHandoff),
    conversationSummary: reusableConversation?.conversationSummary || `QR enquiry: ${qr.name}`,
    subject: reusableConversation?.subject || `QR enquiry: ${qr.name}`, customerEmail: email || reusableConversation?.customerEmail || '',
    thankYouEmailSent: false, thankYouEmailSuppressed: true,
    startedAt: reusableConversation?.startedAt || now, lastMessageAt: now,
    lastMessageText: conversationText.slice(0, 180) + '...',
    unreadCount: Number(reusableConversation?.unreadCount || 0) + 1,
    isRead: false, unread: true, createdAt: reusableConversation?.createdAt || now, updatedAt: now,
  };
  const message = {
    messageId, conversationId, senderType: 'CUSTOMER',
    senderName: fullName || 'QR visitor', senderEmail: email,
    channel: 'WEBSITE', direction: 'INBOUND',
    text: conversationText, timestamp: now, sentAt: now, receivedAt: now,
    aiReplied: true,
  };
  await Promise.all([
    setDoc(repo.contactDoc(contactId), contact, { merge: true }),
    setDoc(repo.leadDoc(leadId), lead, { merge: true }),
    setDoc(repo.conversationDoc(conversationId), conversation, { merge: true }),
    setDoc(repo.messageDoc(messageId), message, { merge: false }),
  ]);
  await updateDoc(repo.doc('qr_codes', qr.id), { leadCount: increment(1), updatedAt: now });
  const eventId = id('qre');
  await setDoc(repo.doc('qr_scan_events', eventId), {
    id: eventId, qrId: qr.id, type: 'lead', timestamp: now, day: now.slice(0, 10), leadId,
  }, { merge: false });
  await setDoc(repo.doc('qr_analytics_daily', `${qr.id}_${now.slice(0, 10)}`), { qrId: qr.id, day: now.slice(0, 10), leads: increment(1), updatedAt: now }, { merge: true });
  try {
    const scoring = await import('./leadScoringService.js');
    await scoring.enqueueLeadScoringEvaluation(ctx, leadId, conversationId, 'NEW_LEAD');
  } catch (error: any) {
    console.warn('[QR Studio] Lead scoring enqueue notice:', error?.message || error);
  }
  return { success: true, leadId, message: 'Thanks — your enquiry has been sent.' };
}
