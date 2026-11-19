import { sanitizeResourceHtml } from './resourceHtml.js';
/**
 * Global public-site Resources CMS contract.
 * Resource records are platform-wide content, not tenant-owned workspace data.
 */
export const RESOURCE_CATEGORIES = [
  'Guides', 'Use cases', 'Insights', 'Case studies', 'Playbooks',
  'Templates', 'Videos', 'Reports', 'Product updates',
] as const;

export type ResourceCategory = (typeof RESOURCE_CATEGORIES)[number];

export const RESOURCE_TYPES = [
  { value: 'article', label: 'Article' },
  { value: 'guide', label: 'Guide' },
  { value: 'case-study', label: 'Case study' },
  { value: 'playbook', label: 'Playbook' },
  { value: 'template', label: 'Template' },
  { value: 'video', label: 'Video' },
  { value: 'report', label: 'Report' },
  { value: 'product-update', label: 'Product update' },
  { value: 'link', label: 'Resource link' },
] as const;

export type ResourceType = (typeof RESOURCE_TYPES)[number]['value'];
export type ResourceStatus = 'draft' | 'published' | 'archived';
export type ResourceContentFormat = 'html' | 'markdown';

export const RESOURCE_ICONS = [
  'BookOpen', 'Megaphone', 'CalendarCheck', 'Headphones', 'BarChart3',
  'Bot', 'Sparkles', 'Zap', 'FileText', 'Newspaper',
] as const;
export type ResourceIcon = (typeof RESOURCE_ICONS)[number];

export interface SiteResourceFields {
  title: string;
  slug: string;
  summary: string;
  category: ResourceCategory;
  type: ResourceType;
  content: string;
  contentFormat: ResourceContentFormat;
  destinationUrl: string;
  coverImageUrl: string;
  coverImageAlt: string;
  author: string;
  readingTime: string;
  ctaLabel: string;
  ctaUrl: string;
  seoTitle: string;
  metaDescription: string;
  icon: ResourceIcon;
  featured: boolean;
  order: number;
}

export interface SiteResourceAdminRecord {
  id: string;
  draft: SiteResourceFields;
  published: SiteResourceFields | null;
  revision: number;
  publishedRevision: number;
  status: ResourceStatus;
  isSample?: boolean;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string | null;
  updatedBy?: string;
}

export interface SiteResourcePublic extends SiteResourceFields {
  id: string;
  publishedAt: string;
  updatedAt: string;
}

export const RESOURCE_LIMITS = {
  title: 140, slug: 120, summary: 320, content: 250000,
  destinationUrl: 2000, coverImageUrl: 2048, coverImageAlt: 300,
  author: 100, readingTime: 40, ctaLabel: 80, ctaUrl: 2000,
  seoTitle: 80, metaDescription: 240,
} as const;

export class SiteResourceValidationError extends Error {
  name = 'SiteResourceValidationError';
}

export class SiteResourceConflictError extends Error {
  name = 'SiteResourceConflictError';
}

const categorySet = new Set<string>(RESOURCE_CATEGORIES);
const typeSet = new Set<string>(RESOURCE_TYPES.map((item) => item.value));
const iconSet = new Set<string>(RESOURCE_ICONS);

const clean = (value: unknown, max: number): string =>
  typeof value === 'string' ? value.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '').trim().slice(0, max) : '';

export function slugifyResource(value: string): string {
  return value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, RESOURCE_LIMITS.slug);
}

/** Only same-site paths and HTTPS URLs are accepted for resource destinations. */
export function normaliseResourceUrl(value: unknown, field: string, required = false): string {
  const raw = clean(value, 2000);
  if (!raw) {
    if (required) throw new SiteResourceValidationError(field + ' is required before publishing.');
    return '';
  }
  if (raw.startsWith('/') && !raw.startsWith('//') && !raw.includes('\\')) return raw;
  try {
    const url = new URL(raw);
    if (url.protocol === 'https:' && !url.username && !url.password) return url.toString();
  } catch {}
  throw new SiteResourceValidationError(field + ' must be a same-site path or a valid HTTPS URL.');
}

/** Drafts require their card identity; body/media/SEO requirements are checked at publish time. */
export function normaliseResourceInput(input: unknown, publish = false): SiteResourceFields {
  const src = input && typeof input === 'object' && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {};
  const title = clean(src.title, RESOURCE_LIMITS.title);
  const slug = clean(src.slug, RESOURCE_LIMITS.slug);
  const summary = clean(src.summary, RESOURCE_LIMITS.summary);
  const category = categorySet.has(String(src.category)) ? src.category as ResourceCategory : 'Guides';
  const type = typeSet.has(String(src.type)) ? src.type as ResourceType : 'article';
  const contentFormat: ResourceContentFormat = src.contentFormat === 'html' ? 'html' : 'markdown';
  const rawContent = typeof src.content === 'string' ? src.content.replace(/\r\n/g, '\n').trim().slice(0, RESOURCE_LIMITS.content) : '';
  const content = contentFormat === 'html' ? sanitizeResourceHtml(rawContent) : rawContent;
  const destinationUrl = normaliseResourceUrl(src.destinationUrl, 'Destination URL', publish && (type === 'link' || type === 'video'));
  const coverImageUrl = normaliseResourceUrl(src.coverImageUrl, 'Cover image URL');
  const ctaUrl = normaliseResourceUrl(src.ctaUrl, 'Call-to-action URL');

  if (!title) throw new SiteResourceValidationError('Resource title is required.');
  if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || /^(api|admin|assets|login|resources|sitemap|robots)$/.test(slug)) {
    throw new SiteResourceValidationError('Use a valid URL slug with lowercase words separated by hyphens.');
  }
  if (!summary) throw new SiteResourceValidationError('Add a short summary for the resource card.');
  if (publish && type !== 'link' && type !== 'video' && !content) {
    throw new SiteResourceValidationError('Add the resource content before publishing this resource type.');
  }
  const coverImageAlt = clean(src.coverImageAlt, RESOURCE_LIMITS.coverImageAlt);
  if (publish && coverImageUrl && !coverImageAlt) {
    throw new SiteResourceValidationError('Add image alt text before publishing the featured image.');
  }
  const seoTitle = clean(src.seoTitle, RESOURCE_LIMITS.seoTitle) || title;
  const metaDescription = clean(src.metaDescription, RESOURCE_LIMITS.metaDescription) || summary;

  return {
    title, slug, summary, category, type, content, contentFormat, destinationUrl,
    coverImageUrl, coverImageAlt,
    author: clean(src.author, RESOURCE_LIMITS.author) || 'Amaavigo Editorial Team',
    readingTime: clean(src.readingTime, RESOURCE_LIMITS.readingTime),
    ctaLabel: clean(src.ctaLabel, RESOURCE_LIMITS.ctaLabel) || 'Explore resource',
    ctaUrl, seoTitle, metaDescription,
    icon: iconSet.has(String(src.icon)) ? src.icon as ResourceIcon : 'BookOpen',
    featured: src.featured === true,
    order: Number.isFinite(Number(src.order)) ? Math.max(0, Math.min(9999, Math.round(Number(src.order)))) : 0,
  };
}

const starter = (
  id: string,
  title: string,
  slug: string,
  category: ResourceCategory,
  summary: string,
  destinationUrl: string,
  icon: ResourceIcon,
  order: number,
): SiteResourceFields & { id: string } => ({
  id, title, slug, summary, category, type: 'link', content: '', contentFormat: 'markdown', destinationUrl,
  coverImageUrl: '', coverImageAlt: '', author: 'Amaavigo Editorial Team',
  readingTime: '', ctaLabel: 'Explore guide', ctaUrl: destinationUrl,
  seoTitle: title + ' | Amaavigo', metaDescription: summary, icon,
  featured: order === 1, order,
});

/** Existing landing-page cards are migrated as editable starter resources on first CMS access. */
export const SAMPLE_RESOURCES: Array<SiteResourceFields & { id: string }> = [
  starter('sample-journey', 'The connected lead-to-revenue journey', 'connected-lead-to-revenue-journey', 'Guides', 'How capture, conversations, CRM and campaigns fit together.', '/how-it-works', 'BookOpen', 1),
  starter('sample-campaigns', 'Designing campaigns people open', 'designing-campaigns-people-open', 'Guides', 'Layout, copy and previews for email and WhatsApp.', '/campaigns', 'Megaphone', 2),
  starter('sample-booking', 'From first enquiry to booked meeting', 'first-enquiry-to-booked-meeting', 'Use cases', 'A walkthrough of the fastest path to a conversation.', '/demo-scheduling', 'CalendarCheck', 3),
  starter('sample-inbox', 'One inbox for every channel', 'one-inbox-for-every-channel', 'Use cases', 'How teams answer faster without switching tabs.', '/unified-inbox', 'Headphones', 4),
  starter('sample-engagement', 'Reading campaign engagement', 'reading-campaign-engagement', 'Insights', 'What delivered, read and replied really tell you.', '/analytics', 'BarChart3', 5),
  starter('sample-agent', 'Working with an AI agent safely', 'working-with-ai-agent-safely', 'Insights', 'Approvals, handoff and keeping humans in control.', '/ai-agent', 'Bot', 6),
  starter('sample-whatsnew', 'What’s new across the workspace', 'whats-new-across-workspace', 'Product updates', 'The latest improvements to inbox, CRM and campaigns.', '/platform', 'Sparkles', 7),
  starter('sample-faq', 'Frequently asked questions', 'frequently-asked-questions', 'Product updates', 'Quick answers about channels, AI and plans.', '/faqs', 'Zap', 8),
];
