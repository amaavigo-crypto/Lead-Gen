import crypto from 'node:crypto';
import {
  collection,
  doc,
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
const URL_PATTERN = /https:\/\/[^\s<>"'`]+/gi;
const BOT_USER_AGENT = /(bot\b|crawler|spider|facebookexternalhit|meta[-_ ]?(externalagent|externalfetcher)|slackbot|discordbot|telegrambot|twitterbot|linkedinbot|googlebot|bingbot)/i;

function templateScope(ctx: TenantContext, templateKey: string): string {
  return `${ctx.tenantId}::${String(templateKey || '').trim().toLowerCase()}`;
}

function publicAppOrigin(): string {
  const configured = String(
    process.env.LEADGEN_PUBLIC_URL ||
    process.env.PUBLIC_APP_URL ||
    'https://leads.amaavigo.com'
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
  templateKey: string
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
  templateKey: string
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

    const tracked = await createWhatsAppTrackedLink(ctx, url, templateKey);
    output += tracked ? tracked + suffix : raw;
  }
  output += source.slice(cursor);
  return output;
}

/** Rewrites body URLs, URL buttons and carousel-card URLs before a new template is submitted to Meta. */
export async function rewriteWhatsAppTemplateLinks(
  ctx: TenantContext,
  templateName: string,
  language: string,
  components: any[]
): Promise<any[]> {
  const templateKey = `${String(templateName || '').trim()}::${String(language || '').trim()}`;
  const rewritten = JSON.parse(JSON.stringify(Array.isArray(components) ? components : []));

  const rewriteComponentList = async (items: any[]) => {
    for (const component of items) {
      const type = String(component?.type || '').toUpperCase();
      if (type === 'BODY' && typeof component?.text === 'string') {
        component.text = await rewriteWhatsAppTextLinks(ctx, component.text, templateKey);
      }
      if (type === 'BUTTONS' && Array.isArray(component.buttons)) {
        for (const button of component.buttons) {
          if (String(button?.type || '').toUpperCase() !== 'URL' || typeof button?.url !== 'string') continue;
          if (button.url.includes('{{') || button.url.includes('}}')) continue;
          const tracked = await createWhatsAppTrackedLink(ctx, button.url, templateKey);
          if (tracked) button.url = tracked;
        }
      }
      if (type === 'CAROUSEL' && Array.isArray(component.cards)) {
        for (const card of component.cards) {
          if (Array.isArray(card?.components)) await rewriteComponentList(card.components);
        }
      }
    }
  };

  await rewriteComponentList(rewritten);
  return rewritten;
}

/** Counts tracked URL opens for this tenant and WhatsApp template, without Meta Insights opt-in. */
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
