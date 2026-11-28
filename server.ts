import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { handleCoreApi } from './src/server/coreApiHandler.js';
import { checkAndDispatchPendingWebsiteLeadEmails } from './src/server/websiteLeadAutoResponder.js';
import { processActiveRunningCampaignsBatch } from './src/server/campaignService.js';
import { runAutoFollowUpWorkerCycle, isFollowUpWorkerDue } from './src/server/autoFollowUpService.js';
import { runSocialStudioPublishWorkerCycle } from './src/server/nativeSocialStudioContent.js';
import { hasFeature } from './src/server/entitlements.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT: number = Number(process.env.PORT) || 3000;

// Stripe webhook needs the raw body for signature verification, so it is registered BEFORE the JSON parser.
app.post('/api/webhooks/stripe', express.raw({ type: '*/*', limit: '2mb' }), async (req, res) => {
  try {
    const { handleStripeWebhook } = await import('./src/server/billingService.js');
    const result = await handleStripeWebhook(req.body as Buffer, req.headers['stripe-signature'] as string | undefined);
    res.status(result.status).json({ message: result.message });
  } catch (err) {
    console.error('[Stripe webhook error]:', err);
    res.status(500).json({ error: 'webhook handler failed' });
  }
});

// Instagram webhook needs the exact raw body for x-hub-signature-256 verification (registered BEFORE the JSON parser).
app.all('/api/webhooks/instagram', express.raw({ type: '*/*', limit: '2mb' }), async (req: any, res) => {
  try {
    const raw: Buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    if (req.method === 'POST') {
      req.rawBody = raw;
      try {
        req.body = JSON.parse(raw.toString('utf8'));
      } catch {
        return res.status(400).json({ error: 'Invalid JSON webhook payload.' });
      }
    }
    const { handleInstagramWebhook } = await import('./src/server/instagramIntegrationService.js');
    await handleInstagramWebhook(req, res);
  } catch (err) {
    console.error('[Instagram webhook error]:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Instagram webhook processing failed.' });
  }
});

// WhatsApp + Messenger webhook (one Meta app): raw body for x-hub-signature-256 verification.
app.all('/api/webhooks/meta', express.raw({ type: '*/*', limit: '2mb' }), async (req: any, res) => {
  try {
    const raw: Buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    if (req.method === 'POST') {
      req.rawBody = raw;
      try {
        req.body = JSON.parse(raw.toString('utf8'));
      } catch {
        return res.status(400).json({ error: 'Invalid JSON webhook payload.' });
      }
    }
    const { handleMetaWebhook } = await import('./src/server/metaChannelsService.js');
    await handleMetaWebhook(req, res);
  } catch (err) {
    console.error('[Meta webhook error]:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Meta webhook processing failed.' });
  }
});

// Resend webhook uses Svix signatures over the exact raw body. Register before JSON parsing.
app.all(['/api/webhooks/resend', '/api/webhooks/email/resend'], express.raw({ type: '*/*', limit: '2mb' }), async (req: any, res) => {
  if (req.method === 'GET' || req.method === 'HEAD') { res.status(200).json({ ok: true, webhook: 'resend' }); return; }
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }
  try {
    const raw: Buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    req.rawBody = raw;
    try { req.body = JSON.parse(raw.toString('utf8') || '{}'); }
    catch { res.status(400).json({ error: 'Invalid JSON webhook payload.' }); return; }
    req.url = '/api/webhooks/email/resend';
    const handled = await handleCoreApi(req, res);
    if (!handled && !res.writableEnded) res.status(200).json({ received: true });
  } catch (err: any) {
    console.error('[Resend webhook error]:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Resend webhook processing failed.' });
  }
});

// Meeting Intelligence webhook needs exact raw bytes for HMAC verification.
app.all('/api/webhooks/meeting-intelligence', express.raw({ type: '*/*', limit: '2mb' }), async (req: any, res) => {
  if (req.method !== 'POST') {
    res.status(405).set('Allow', 'POST').json({ error: 'POST only' });
    return;
  }
  try {
    const raw: Buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    req.rawBody = raw;
    try {
      req.body = JSON.parse(raw.toString('utf8') || '{}');
    } catch {
      res.status(400).json({ error: 'Invalid JSON webhook payload.' });
      return;
    }
    req.url = '/api/webhooks/meeting-intelligence';
    const handled = await handleCoreApi(req, res);
    if (!handled && !res.writableEnded) res.status(404).json({ error: 'Meeting Intelligence webhook route not found.' });
  } catch (err: any) {
    console.error('[Meeting Intelligence webhook error]:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Meeting Intelligence webhook processing failed.' });
  }
});

// Body parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

import { runWithJobLease } from './src/server/jobLeaseService.js';
import { startTenantMailboxPoller } from './src/server/tenantImapPoller.js';
import { globalTenantsCol } from './src/server/tenantRepo.js';
import { getDocs } from './src/server/adminFirestore.js';
import { isFirebaseConfigured } from './src/firebase/config.js';
import { db } from './src/server/adminFirestore.js';
import type { TenantContext } from './src/types/tenant.js';

// Background poller for inbound email, website leads, and outbound campaigns with distributed leasing
let isBackgroundPolling = false;
const safeBackgroundPoll = async () => {
  if (isBackgroundPolling) return;
  isBackgroundPolling = true;

  try {
    // 1. Discover all active tenants
    const tenantIds: string[] = ['umrah360'];
    if (isFirebaseConfigured && db) {
      try {
        const snap = await getDocs(globalTenantsCol());
        snap.forEach((d) => {
          const t = d.data();
          if (t.id && t.status !== 'suspended' && !tenantIds.includes(t.id)) {
            tenantIds.push(t.id);
          }
        });
      } catch {}
    }

    // 2. Process background tasks per tenant under distributed lease
    for (const tId of tenantIds) {
      const ctx: TenantContext = {
        tenantId: tId,
        uid: 'system-worker',
        email: `worker@${tId}.in`,
        role: 'admin',
      };

      // A. Inbound website demo lead auto-responder
      await runWithJobLease(tId, 'website_leads_worker', 15_000, async () => {
        await checkAndDispatchPendingWebsiteLeadEmails(ctx).catch(() => {});
      }).catch(() => {});

      // C. Process active campaign batches
      if (await hasFeature(tId, 'campaigns')) {
        await runWithJobLease(tId, 'campaign_dispatch_worker', 20_000, async () => {
          await processActiveRunningCampaignsBatch(3, ctx).catch(() => {});
        }).catch(() => {});
      }

      // Social Studio scheduled publishing is isolated from CRM/campaign queues and uses
      // a tenant-specific lease so multiple app instances cannot publish the same scheduled post.
      if (await hasFeature(tId, 'social_studio')) {
        await runWithJobLease(tId, 'social_studio_publish_worker', 120_000, async () => {
          await runSocialStudioPublishWorkerCycle(ctx, 2).catch((error: any) => {
            console.warn('[Social Studio worker] Tenant cycle failed:', tId, error?.message || 'unknown error');
          });
        }).catch(() => {});
      }

      // D. AI Auto Follow-Up (cheap: reads only this tenant's scheduled jobs, and skips
      //    the read entirely until a job could be due)
      if (isFollowUpWorkerDue(tId) && (await hasFeature(tId, 'auto_followup'))) {
        await runWithJobLease(tId, 'auto_followup_worker', 30_000, async () => {
          await runAutoFollowUpWorkerCycle(ctx).catch(() => {});
        }).catch(() => {});
      }
    }
  } catch (e) {
    // ignore background errors
  } finally {
    isBackgroundPolling = false;
  }
};

// Start the tenant-specific mailbox poller. It only reads mailboxes registered to their own workspace.
// No shared environment-backed IMAP mailbox is polled.
startTenantMailboxPoller();
setTimeout(safeBackgroundPoll, 2000);
setInterval(safeBackgroundPoll, 30_000);

// API route middleware
app.use('/api', async (req, res, next) => {
  try {
    const handled = await handleCoreApi(req, res);
    if (!handled && !res.writableEnded) {
      res.status(404).json({ error: 'Endpoint not found', url: req.originalUrl || req.url });
    }
  } catch (err: any) {
    console.error('[Server API Error]:', err);
    if (!res.writableEnded) {
      res.status(500).json({ error: err?.message || 'Internal Server Error' });
    }
  }
});

// Serve frontend assets directly; every page route goes through the SEO renderer.
const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath, { index: false }));

import fs from 'fs';
import { renderSeoPage, robotsTxt, sitemapXml, siteOrigin } from './src/server/seoPage.js';

let appTemplate: string | null = null;
const loadAppTemplate = (): string => {
  if (appTemplate) return appTemplate;
  const file = path.join(distPath, 'index.html');
  if (!fs.existsSync(file)) throw new Error('dist/index.html not found. Run npm run build first.');
  appTemplate = fs.readFileSync(file, 'utf8');
  return appTemplate;
};

app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(robotsTxt(siteOrigin(req.headers)));
});
app.get('/sitemap.xml', async (req, res) => {
  res.type('application/xml').send(await sitemapXml(siteOrigin(req.headers)));
});

app.get('*', async (req, res) => {
  if (req.url.startsWith('/api')) return res.status(404).json({ error: 'API route not found' });
  try {
    res.type('html').send(await renderSeoPage(loadAppTemplate(), req.path, siteOrigin(req.headers)));
  } catch (err: any) {
    console.error('[Server] Could not render the app page:', err);
    res.status(500).send('Service temporarily unavailable');
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Umrah360 Server] Running on http://0.0.0.0:${PORT} in ${process.env.NODE_ENV || 'production'} mode`);
});
