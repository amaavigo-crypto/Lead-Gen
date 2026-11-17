import { SEO_PAGES, normalizePath, resolveSeo, type SeoFields } from '../shared/seoSettings.js';
import { getPublishedSeoSettings } from './seoSettingsService.js';

const escapeHtml = (value: string): string => value
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function trimTrailingSlashes(value: string): string {
  let result = value;
  while (result.endsWith('/')) result = result.slice(0, -1);
  return result;
}
const absolute = (origin: string, path: string) =>
  path.startsWith('https://') || path.startsWith('http://')
    ? path
    : trimTrailingSlashes(origin) + (path.startsWith('/') ? path : '/' + path);

function jsonLdForPage(pagePath: string, seo: SeoFields, origin: string) {
  const canonical = absolute(origin, seo.canonicalPath || pagePath);
  const page = SEO_PAGES.find((item) => item.path === pagePath);
  const parts = pagePath.split('/').filter(Boolean);
  const breadcrumbs = [{ '@type': 'ListItem', position: 1, name: 'Home', item: absolute(origin, '/') }];
  if (parts.length) breadcrumbs.push({ '@type': 'ListItem', position: 2, name: page?.label || parts[parts.length - 1], item: canonical });
  return {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'Organization', '@id': absolute(origin, '/#organization'), name: 'Amaavigo', url: origin },
      { '@type': 'WebSite', '@id': absolute(origin, '/#website'), url: origin, name: 'Amaavigo', publisher: { '@id': absolute(origin, '/#organization') } },
      { '@type': 'WebPage', '@id': canonical + '#webpage', url: canonical, name: seo.title, description: seo.description, isPartOf: { '@id': absolute(origin, '/#website') } },
      { '@type': 'BreadcrumbList', itemListElement: breadcrumbs },
    ],
  };
}

export function renderSeoHtml(template: string, pagePath: string, origin: string, seo: SeoFields): string {
  const canonical = absolute(origin, seo.canonicalPath || pagePath);
  const image = seo.ogImage ? absolute(origin, seo.ogImage) : '';
  const robots = seo.noindex ? 'noindex, nofollow' : 'index, follow';
  const meta = [
    '<meta name="description" content="' + escapeHtml(seo.description) + '" />',
    '<meta name="robots" content="' + robots + '" />',
    '<link rel="canonical" href="' + escapeHtml(canonical) + '" />',
    '<meta property="og:type" content="website" />',
    '<meta property="og:site_name" content="Amaavigo" />',
    '<meta property="og:title" content="' + escapeHtml(seo.ogTitle || seo.title) + '" />',
    '<meta property="og:description" content="' + escapeHtml(seo.ogDescription || seo.description) + '" />',
    ...(image ? ['<meta property="og:image" content="' + escapeHtml(image) + '" />', '<meta name="twitter:card" content="summary_large_image" />', '<meta name="twitter:image" content="' + escapeHtml(image) + '" />'] : ['<meta name="twitter:card" content="summary" />']),
    '<meta name="twitter:title" content="' + escapeHtml(seo.ogTitle || seo.title) + '" />',
    '<meta name="twitter:description" content="' + escapeHtml(seo.ogDescription || seo.description) + '" />',
    '<script type="application/ld+json">' + JSON.stringify(jsonLdForPage(pagePath, seo, origin)).replace(/</g, '\\u003c') + '</script>',
  ].join('');
  let html = template.replace(/<title[^>]*>[\s\S]*?<\/title>/i, '<title>' + escapeHtml(seo.title) + '</title>');
  html = html.replace(/<meta\s+(?:name=["']description["']|name=["']robots["']|property=["']og:[^"']+["']|name=["']twitter:[^"']+["'])[^>]*\/?\s*>/gi, '');
  html = html.replace(/<link\s+rel=["']canonical["'][^>]*\/?\s*>/gi, '');
  return html.includes('</head>') ? html.replace('</head>', meta + '</head>') : html;
}

export async function renderSeoPage(template: string, rawPath: string, origin: string): Promise<string> {
  const pagePath = normalizePath(rawPath);
  if (!SEO_PAGES.some((page) => page.path === pagePath)) return template;
  const published = await getPublishedSeoSettings();
  const seo = resolveSeo(published.seo, pagePath);
  return seo ? renderSeoHtml(template, pagePath, origin, seo) : template;
}

export function siteOrigin(headers: Record<string, any>): string {
  const configured = trimTrailingSlashes(String(process.env.APP_URL || '').trim());
  if (configured.startsWith('https://') || configured.startsWith('http://')) return configured;
  const host = String(headers['x-forwarded-host'] || headers.host || '').split(',')[0].trim();
  const protocol = String(headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  return host ? protocol + '://' + host : '';
}

export function robotsTxt(origin: string): string {
  return ['User-agent: *', 'Allow: /', 'Disallow: /api/', 'Disallow: /login', 'Disallow: /onboarding/', 'Sitemap: ' + trimTrailingSlashes(origin) + '/sitemap.xml', ''].join('\n');
}

export async function sitemapXml(origin: string): Promise<string> {
  const published = await getPublishedSeoSettings();
  const lastmod = published.publishedAt ? '<lastmod>' + published.publishedAt.slice(0, 10) + '</lastmod>' : '';
  const entries = SEO_PAGES.filter((page) => {
    const seo = resolveSeo(published.seo, page.path);
    return seo && !seo.noindex && (seo.canonicalPath || page.path) === page.path;
  }).map((page) => {
    const priority = page.path === '/' ? '1.0' : '0.8';
    return '<url><loc>' + escapeHtml(absolute(origin, page.path)) + '</loc>' + lastmod + '<priority>' + priority + '</priority></url>';
  }).join('');
  return '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + entries + '</urlset>';
}
