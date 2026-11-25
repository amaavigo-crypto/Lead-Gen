import crypto from 'node:crypto';
import {
  collection,
  doc,
  getDoc,
  increment,
  query,
  runTransaction,
  setDoc,
  sumDocs,
  where,
  db,
} from './adminFirestore.js';
import type { TenantContext } from '../types/tenant.js';

const LINK_ROUTE_COLLECTION = 'whatsapp_link_routes';
const TEMPLATE_LINK_CONFIG_COLLECTION = 'whatsapp_template_link_configs';
const URL_PATTERN = /https:\/\/[^\s<>"'`]+/gi;
const BOT_USER_AGENT = /(bot\b|crawler|spider|facebookexternalhit|meta[-_ ]?(externalagent|externalfetcher)|slackbot|discordbot|telegrambot|twitterbot|linkedinbot|googlebot|bingbot)/i;

function templateScope(ctx: TenantContext, templateKey: string): string {
  return `${ctx.tenantId}::${String(templateKey || '').trim().toLowerCase()}`;
}

function campaignScope(ctx: TenantContext, campaignId: string): string {
  return `${ctx.tenantId}::${String(campaignId || '').trim()}`;
}

export type WhatsAppTemplateLinkConfig = {
  bodyLinks: Array<{ parameterIndex: number; destinationUrl: string }>;
  urlButtons: Array<{ buttonIndex: number; destinationUrl: string }>;
};

function templateLinkConfigRef(ctx: TenantContext, templateName: string, language: string) {
  const key = `${ctx.tenantId}::${String(templateName || '').trim().toLowerCase()}::${String(language || '').trim().toLowerCase()}`;
  const id = crypto.createHash('sha256').update(key).digest('hex');
  return doc(db, TEMPLATE_LINK_CONFIG_COLLECTION, id);
}

export async function getWhatsAppTemplateLinkConfig(
  ctx: TenantContext,
  templateName: string,
  language: string
): Promise<WhatsAppTemplateLinkConfig> {
  const snapshot = await getDoc(templateLinkConfigRef(ctx, templateName, language));
  if (!snapshot.exists()) return { bodyLinks: [], urlButtons: [] };
  const data = snapshot.data() as any;
  if (String(data?.tenantId || '') !== ctx.tenantId) return { bodyLinks: [], urlButtons: [] };
  return {
    bodyLinks: Array.isArray(data.bodyLinks) ? data.bodyLinks : [],
    urlButtons: Array.isArray(data.urlButtons) ? data.urlButtons : [],
  };
}

async function saveWhatsAppTemplateLinkConfig(
  ctx: TenantContext,
  templateName: string,
  language: string,
  config: WhatsAppTemplateLinkConfig
): Promise<void> {
  await setDoc(templateLinkConfigRef(ctx, templateName, language), {
    tenantId: ctx.tenantId,
    templateName: String(templateName || '').trim(),
    language: String(language || '').trim(),
    bodyLinks: config.bodyLinks,
    urlButtons: config.urlButtons,
    updatedAt: new Date().toISOString(),
  }, { merge: true });
}

function publicAppOrigin(): string {
  // Prefer an explicitly configured canonical URL. On Vercel, the project production
  // hostname is stable across deployments (unlike VERCEL_URL, which changes per deploy).
  // The fallback is the verified production domain currently attached to this project.
  const configured = String(
    process.env.LEADGEN_PUBLIC_URL ||
    process.env.PUBLIC_APP_URL ||
    process.env.APP_URL ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    'https://lead-gen-nine-sandy.vercel.app'
  ).trim();
  const withProtocol = /^https?:\/\//i.test(configured) ? configured : `https://${configured}`;
  const parsed = new URL(withProtocol);
  if (parsed.protocol !== 'https:') {
    throw new Error('LEADGEN_PUBLIC_URL must use HTTPS for WhatsApp click tracking.');
  }
  return parsed.origin;
}

function normalizeDestination(raw: string): string | null {
  try {
    const parsed = new URL(String(raw || '').trim());
    if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password) return null;
    if (parsed.href.length > 1800) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

/**
 * Creates a server-owned redirect. The destination is stored server-side, never accepted
 * from the public click request, so the endpoint cannot be used as an arbitrary open redirect.
 */
export async function createWhatsAppTrackedLink(
  ctx: TenantContext,
  destination: string,
  templateKey: string,
  campaignId?: string
): Promise<string | null> {
  const destinationUrl = normalizeDestination(destination);
  if (!destinationUrl || !String(templateKey || '').trim()) return null;

  const token = crypto.randomBytes(20).toString('hex');
  const now = new Date().toISOString();
  await setDoc(doc(db, LINK_ROUTE_COLLECTION, token), {
    token,
    tenantId: ctx.tenantId,
    templateScope: templateScope(ctx, templateKey),
    templateKey: String(templateKey).trim(),
    ...(String(campaignId || '').trim() ? { campaignId: String(campaignId).trim(), campaignScope: campaignScope(ctx, String(campaignId).trim()) } : {}),
    destinationUrl,
    clickCount: 0,
    createdAt: now,
    updatedAt: now,
  });

  return `${publicAppOrigin()}/api/whatsapp/click/${token}`;
}

function trimUrlPunctuation(value: string): { url: string; suffix: string } {
  const match = value.match(/[.,!?;:)}\]]+$/);
  if (!match) return { url: value, suffix: '' };
  return { url: value.slice(0, -match[0].length), suffix: match[0] };
}

/** Rewrites HTTPS links in visible WhatsApp message text while leaving surrounding punctuation intact. */
export async function rewriteWhatsAppTextLinks(
  ctx: TenantContext,
  text: string,
  templateKey: string,
  campaignId?: string
): Promise<string> {
  const source = String(text || '');
  const matches = Array.from(source.matchAll(URL_PATTERN));
  if (!matches.length) return source;

  let output = '';
  let cursor = 0;
  for (const match of matches) {
    const raw = String(match[0] || '');
    const index = Number(match.index || 0);
    const { url, suffix } = trimUrlPunctuation(raw);
    output += source.slice(cursor, index);
    cursor = index + raw.length;

    if (!url || url.includes('{{') || url.includes('}}')) {
      output += raw;
      continue;
    }

    const tracked = await createWhatsAppTrackedLink(ctx, url, templateKey, campaignId);
    output += tracked ? tracked + suffix : raw;
  }
  output += source.slice(cursor);
  return output;
}

/**
 * Fixed body URLs become body parameters; fixed URL buttons become Meta dynamic URL
 * suffixes. Each send receives a fresh campaign-tagged route, including when campaigns reuse
 * the same approved WhatsApp template.
 */
export async function rewriteWhatsAppTemplateLinks(
  ctx: TenantContext,
  templateName: string,
  language: string,
  components: any[]
): Promise<any[]> {
  const templateKey = `${String(templateName || '').trim()}::${String(language || '').trim()}`;
  const rewritten = JSON.parse(JSON.stringify(Array.isArray(components) ? components : []));
  const config: WhatsAppTemplateLinkConfig = { bodyLinks: [], urlButtons: [] };
  const clickPrefix = `${publicAppOrigin()}/api/whatsapp/click/`;

  // Convert every static URL in the primary body into an additional positional
  // parameter. Amaavigo fills this parameter with a fresh campaign-scoped link at send time.
  const bodyComponent = rewritten.find((component: any) => String(component?.type || '').toUpperCase() === 'BODY');
  if (bodyComponent && typeof bodyComponent.text === 'string') {
    const source = String(bodyComponent.text);
    const existingIndexes = Array.from(source.matchAll(/\{\{\s*(\d+)\s*\}\}/g)).map((match: any) => Number(match[1]));
    let nextIndex = existingIndexes.length ? Math.max(...existingIndexes) + 1 : 1;
    const samples = Array.isArray(bodyComponent?.example?.body_text?.[0])
      ? [...bodyComponent.example.body_text[0]].map((value: any) => String(value ?? ''))
      : [];
    const matches = Array.from(source.matchAll(URL_PATTERN));
    if (matches.length) {
      let output = '';
      let cursor = 0;
      for (const match of matches) {
        const raw = String(match[0] || '');
        const index = Number(match.index || 0);
        const { url, suffix } = trimUrlPunctuation(raw);
        const destinationUrl = normalizeDestination(url);
        output += source.slice(cursor, index);
        cursor = index + raw.length;
        if (!destinationUrl || url.includes('{{') || url.includes('}}')) {
          output += raw;
          continue;
        }
        if (nextIndex > 20) {
          throw new Error('This template already uses all 20 WhatsApp body variables. To enable campaign-specific click tracking, move the website link to a URL button or free one body variable.');
        }
        const parameterIndex = nextIndex++;
        config.bodyLinks.push({ parameterIndex, destinationUrl });
        samples[parameterIndex - 1] = destinationUrl;
        output += `{{${parameterIndex}}}${suffix}`;
      }
      output += source.slice(cursor);
      // Meta does not accept a body variable as the very first or final token.
      if (/^\s*\{\{\s*\d+\s*\}\}/.test(output)) output = output.replace(/^\s*/, 'Visit ');
      if (/\{\{\s*\d+\s*\}\}\s*$/.test(output)) output += '.';
      bodyComponent.text = output;
      bodyComponent.example = { ...(bodyComponent.example || {}), body_text: [samples] };
    }
  }

  // Fixed URL buttons are changed into dynamic URL suffix buttons. Their original
  // destinations stay server-side, and sendWhatsAppTemplate supplies one token per send.
  const buttonsComponent = rewritten.find((component: any) => String(component?.type || '').toUpperCase() === 'BUTTONS');
  if (buttonsComponent && Array.isArray(buttonsComponent.buttons)) {
    buttonsComponent.buttons.forEach((button: any, buttonIndex: number) => {
      if (String(button?.type || '').toUpperCase() !== 'URL' || typeof button?.url !== 'string') return;
      const url = String(button.url);
      if (url.includes('{{') || url.includes('}}')) return;
      const destinationUrl = normalizeDestination(url);
      if (!destinationUrl) return;
      config.urlButtons.push({ buttonIndex, destinationUrl });
      button.url = `${clickPrefix}{{1}}`;
      button.example = ['example-click-token'];
    });
  }

  // Keep the existing template-level tracking behaviour for nested carousel-card links.
  for (const component of rewritten) {
    if (String(component?.type || '').toUpperCase() !== 'CAROUSEL' || !Array.isArray(component.cards)) continue;
    for (let cardIndex = 0; cardIndex < component.cards.length; cardIndex++) {
      const card = component.cards[cardIndex];
      for (const nested of Array.isArray(card?.components) ? card.components : []) {
        const type = String(nested?.type || '').toUpperCase();
        if (type === 'BODY' && typeof nested?.text === 'string') {
          nested.text = await rewriteWhatsAppTextLinks(ctx, nested.text, `${templateKey}::carousel-card-${cardIndex}`);
        }
        if (type === 'BUTTONS' && Array.isArray(nested.buttons)) {
          for (const button of nested.buttons) {
            if (String(button?.type || '').toUpperCase() !== 'URL' || typeof button?.url !== 'string') continue;
            if (button.url.includes('{{') || button.url.includes('}}')) continue;
            const tracked = await createWhatsAppTrackedLink(ctx, button.url, `${templateKey}::carousel-card-${cardIndex}`);
            if (tracked) button.url = tracked;
          }
        }
      }
    }
  }

  await saveWhatsAppTemplateLinkConfig(ctx, templateName, language, config);
  return rewritten;
}

/** Sum tracked clicks from routes created specifically for this tenant and campaign. */
export async function getWhatsAppCampaignTrackedClickCount(
  ctx: TenantContext,
  campaignId: string
): Promise<number> {
  const id = String(campaignId || '').trim();
  if (!id) return 0;
  const totals = await sumDocs(
    query(collection(db, LINK_ROUTE_COLLECTION), where('campaignScope', '==', campaignScope(ctx, id))),
    ['clickCount']
  );
  return Math.max(0, Math.floor(Number(totals?.clickCount || 0)));
}

/** Legacy template total, retained for non-campaign sends and previously-created routes. */
export async function getWhatsAppTrackedClickCount(
  ctx: TenantContext,
  templateName: string,
  language: string
): Promise<number> {
  if (!String(templateName || '').trim() || !String(language || '').trim()) return 0;
  const scope = templateScope(ctx, `${String(templateName).trim()}::${String(language).trim()}`);
  const totals = await sumDocs(
    query(collection(db, LINK_ROUTE_COLLECTION), where('templateScope', '==', scope)),
    ['clickCount']
  );
  return Math.max(0, Math.floor(Number(totals?.clickCount || 0)));
}

/**
 * Handles the public redirect. Known preview/scanner bots are redirected but are not
 * counted as human clicks. Every accepted browser hit increments the exact route atomically.
 */
export async function resolveAndRecordWhatsAppTrackedClick(
  token: string,
  userAgent = ''
): Promise<string | null> {
  if (!/^[a-f0-9]{40}$/.test(String(token || ''))) return null;
  const ref = doc(db, LINK_ROUTE_COLLECTION, token);
  const countAsClick = !BOT_USER_AGENT.test(String(userAgent || ''));

  return runTransaction(async (tx: any) => {
    const snapshot = await tx.get(ref);
    if (!snapshot?.exists) return null;
    const route = snapshot.data() || {};
    if (!route.tenantId || !route.templateScope) return null;
    const destinationUrl = normalizeDestination(String(route.destinationUrl || ''));
    if (!destinationUrl) return null;

    if (countAsClick) {
      const now = new Date().toISOString();
      tx.update(ref, {
        clickCount: increment(1),
        lastClickedAt: now,
        updatedAt: now,
      });
    }
    return destinationUrl;
  });
}
