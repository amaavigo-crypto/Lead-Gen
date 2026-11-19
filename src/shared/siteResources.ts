/**
 * Website "Resources" (the cards on the public /resources page), managed from the Platform Console.
 * Shared by the server (validation, seeding) and the browser (admin editor, public page).
 */
export const RESOURCE_CATEGORIES = ['Guides', 'Use cases', 'Insights', 'Product updates'] as const;
export type ResourceCategory = (typeof RESOURCE_CATEGORIES)[number];

export const RESOURCE_ICONS = ['BookOpen', 'Megaphone', 'CalendarCheck', 'Headphones', 'BarChart3', 'Bot', 'Sparkles', 'Zap', 'FileText', 'Newspaper'] as const;
export type ResourceIcon = (typeof RESOURCE_ICONS)[number];

export interface SiteResource {
  id: string;
  title: string;
  summary: string;
  category: ResourceCategory;
  /** Internal path ("/how-it-works") or full https URL. */
  href: string;
  icon: ResourceIcon;
  published: boolean;
  order: number;
  /** True for the starter content; shown as "Sample" in the admin panel. */
  isSample?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export type SiteResourceInput = Partial<Omit<SiteResource, 'id' | 'createdAt' | 'updatedAt' | 'isSample'>>;

export class SiteResourceValidationError extends Error {}

export const RESOURCE_LIMITS = { title: 120, summary: 280, href: 500 };

const isCategory = (v: unknown): v is ResourceCategory => (RESOURCE_CATEGORIES as readonly string[]).includes(v as string);
const isIcon = (v: unknown): v is ResourceIcon => (RESOURCE_ICONS as readonly string[]).includes(v as string);

/** Accepts "/internal-path" or http(s) URLs only (no javascript:, data:, protocol-relative etc). */
export function normaliseHref(raw: unknown): string {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!value) throw new SiteResourceValidationError('Link is required.');
  if (value.length > RESOURCE_LIMITS.href) throw new SiteResourceValidationError('Link is too long.');
  if (value.startsWith('/') && !value.startsWith('//')) return value;
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' || url.protocol === 'http:') return url.toString();
  } catch { /* fall through */ }
  throw new SiteResourceValidationError('Link must start with / (a page on this site) or https://');
}

export function normaliseResourceInput(input: SiteResourceInput, partial = false): Required<SiteResourceInput> {
  const src = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const title = typeof src.title === 'string' ? src.title.trim() : '';
  const summary = typeof src.summary === 'string' ? src.summary.trim() : '';
  if (!partial || 'title' in src) {
    if (!title) throw new SiteResourceValidationError('Title is required.');
    if (title.length > RESOURCE_LIMITS.title) throw new SiteResourceValidationError('Title must be ' + RESOURCE_LIMITS.title + ' characters or fewer.');
  }
  if (summary.length > RESOURCE_LIMITS.summary) throw new SiteResourceValidationError('Description must be ' + RESOURCE_LIMITS.summary + ' characters or fewer.');
  const order = Number(src.order);
  return {
    title,
    summary,
    category: isCategory(src.category) ? src.category : 'Guides',
    href: normaliseHref(src.href),
    icon: isIcon(src.icon) ? src.icon : 'BookOpen',
    published: src.published === undefined ? true : Boolean(src.published),
    order: Number.isFinite(order) ? Math.max(0, Math.min(9999, Math.round(order))) : 0,
  };
}

/** Starter content so the Resources page is never empty. Admins can edit or delete every one of these. */
export const SAMPLE_RESOURCES: Array<Omit<SiteResource, 'createdAt' | 'updatedAt'>> = [
  { id: 'sample-journey', category: 'Guides', icon: 'BookOpen', title: 'The connected lead-to-revenue journey', summary: 'How capture, conversations, CRM and campaigns fit together.', href: '/how-it-works', published: true, order: 1, isSample: true },
  { id: 'sample-campaigns', category: 'Guides', icon: 'Megaphone', title: 'Designing campaigns people open', summary: 'Layout, copy and previews for email and WhatsApp.', href: '/campaigns', published: true, order: 2, isSample: true },
  { id: 'sample-booking', category: 'Use cases', icon: 'CalendarCheck', title: 'From first enquiry to booked meeting', summary: 'A walkthrough of the fastest path to a conversation.', href: '/demo-scheduling', published: true, order: 3, isSample: true },
  { id: 'sample-inbox', category: 'Use cases', icon: 'Headphones', title: 'One inbox for every channel', summary: 'How teams answer faster without switching tabs.', href: '/unified-inbox', published: true, order: 4, isSample: true },
  { id: 'sample-engagement', category: 'Insights', icon: 'BarChart3', title: 'Reading campaign engagement', summary: 'What delivered, read and replied really tell you.', href: '/analytics', published: true, order: 5, isSample: true },
  { id: 'sample-agent', category: 'Insights', icon: 'Bot', title: 'Working with an AI agent safely', summary: 'Approvals, handoff and keeping humans in control.', href: '/ai-agent', published: true, order: 6, isSample: true },
  { id: 'sample-whatsnew', category: 'Product updates', icon: 'Sparkles', title: 'What’s new across the workspace', summary: 'The latest improvements to inbox, CRM and campaigns.', href: '/platform', published: true, order: 7, isSample: true },
  { id: 'sample-faq', category: 'Product updates', icon: 'Zap', title: 'Frequently asked questions', summary: 'Quick answers about channels, AI and plans.', href: '/faqs', published: true, order: 8, isSample: true },
];
