export interface SeoFields {
  title: string;
  description: string;
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
  canonicalPath: string;
  noindex: boolean;
}

export type SeoSettings = Record<string, Partial<SeoFields>>;

export interface SeoPageDefinition {
  path: string;
  label: string;
  description: string;
}

export const SEO_PAGES: SeoPageDefinition[] = [
  { path: '/', label: 'Home', description: 'Amaavigo AI growth workspace for lead capture, conversations, CRM and marketing automation.' },
  { path: '/platform', label: 'Platform', description: 'Explore the connected Amaavigo platform for managing the complete lead-to-revenue journey.' },
  { path: '/lead-capture', label: 'Lead Capture', description: 'Capture enquiries from websites, forms, social channels and connected messaging sources.' },
  { path: '/unified-inbox', label: 'Unified Inbox', description: 'Manage customer conversations across WhatsApp, Instagram, Messenger, email and website chat.' },
  { path: '/ai-agents', label: 'AI Agents', description: 'Use AI agents to respond to enquiries, handle follow-ups and complete sales workflows.' },
  { path: '/crm', label: 'CRM', description: 'Organise leads, contacts, pipelines and sales activities in one connected CRM.' },
  { path: '/demo-scheduling', label: 'Demo Scheduling', description: 'Automate demo booking and scheduling from customer conversations.' },
  { path: '/ai-agent', label: 'AI Agent (legacy URL)', description: 'Explore the Amaavigo AI agent for customer conversations and sales workflows.' },
  { path: '/book-demo', label: 'Book a Demo (legacy URL)', description: 'Book a demonstration of the Amaavigo AI growth workspace.' },
  { path: '/campaigns', label: 'Campaigns', description: 'Create and manage campaigns with messaging, automation and performance tracking.' },
  { path: '/whatsapp', label: 'WhatsApp', description: 'Connect WhatsApp conversations and campaigns with your sales workspace.' },
  { path: '/analytics', label: 'Analytics', description: 'Understand lead activity, campaign performance and sales outcomes.' },
  { path: '/integrations', label: 'Integrations', description: 'Connect the tools and channels your team already uses with Amaavigo.' },
  { path: '/solutions', label: 'Solutions', description: 'Discover how Amaavigo helps teams capture, engage and convert more leads.' },
  { path: '/pricing', label: 'Pricing', description: 'Explore Amaavigo plans and choose the right growth workspace for your team.' },
  { path: '/resources', label: 'Resources', description: 'Explore guides and resources for improving lead management and customer engagement.' },
  { path: '/about', label: 'About', description: 'Learn about Amaavigo and its approach to making sales workflows easier to start.' },
  { path: '/contact', label: 'Contact', description: 'Contact the Amaavigo team to discuss your sales and automation needs.' },
];

export const EMPTY_SEO_SETTINGS: SeoSettings = {};

const DEFAULT_SEO: Record<string, SeoFields> = Object.fromEntries(SEO_PAGES.map((page) => [page.path, {
  title: page.path === '/' ? 'Amaavigo | AI Growth Workspace' : page.label + ' | Amaavigo',
  description: page.description,
  ogTitle: page.path === '/' ? 'Amaavigo | AI Growth Workspace' : page.label + ' | Amaavigo',
  ogDescription: page.description,
  ogImage: '',
  canonicalPath: page.path === '/ai-agent' ? '/ai-agents' : page.path === '/book-demo' ? '/contact' : page.path,
  noindex: false,
}]));

const cleanText = (value: unknown, max: number): string =>
  typeof value === 'string' ? value.replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, max) : '';

export class SeoSettingsValidationError extends Error {
  name = 'SeoSettingsValidationError';
}

export function resolveSeo(settings: SeoSettings, pathname: string): SeoFields | null {
  const path = normalizePath(pathname);
  const defaults = DEFAULT_SEO[path];
  if (!defaults) return null;
  return { ...defaults, ...(settings[path] || {}) };
}

export function normalizePath(pathname: string): string {
  let path = String(pathname || '/').split('?')[0].split('#')[0] || '/';
  while (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
  return path.startsWith('/') ? path : '/' + path;
}

export function normaliseSeoSettings(input: unknown): SeoSettings {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new SeoSettingsValidationError('SEO settings must be an object');
  const valid = new Set(SEO_PAGES.map((page) => page.path));
  const out: SeoSettings = {};
  for (const [route, raw] of Object.entries(input as Record<string, unknown>)) {
    if (!valid.has(route) || !raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const value = raw as Record<string, unknown>;
    const fields: Partial<SeoFields> = {};
    const title = cleanText(value.title, 70);
    const description = cleanText(value.description, 320);
    const ogTitle = cleanText(value.ogTitle, 70);
    const ogDescription = cleanText(value.ogDescription, 320);
    if (title) fields.title = title;
    if (description) fields.description = description;
    if (ogTitle) fields.ogTitle = ogTitle;
    if (ogDescription) fields.ogDescription = ogDescription;
    const image = cleanText(value.ogImage, 2048);
    if (image) {
      if (!image.startsWith('/') && !image.startsWith('https://')) throw new SeoSettingsValidationError('Share image must be an HTTPS URL or a site-relative path');
      fields.ogImage = image;
    }
    const canonical = cleanText(value.canonicalPath, 500);
    if (canonical) {
      if (!canonical.startsWith('/') || canonical.includes(' ')) throw new SeoSettingsValidationError('Canonical path must start with / and contain no spaces');
      fields.canonicalPath = canonical;
    }
    if (typeof value.noindex === 'boolean') fields.noindex = value.noindex;
    if (Object.keys(fields).length) out[route] = fields;
  }
  return out;
}
