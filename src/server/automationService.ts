import { createHash, createHmac, randomUUID } from 'node:crypto';
import {
  createDoc, getDoc, getDocs, increment, limit, query, setDoc, updateDoc, where,
} from './adminFirestore.js';
import { tenantRepo, globalAutomationWebhookRouteDoc } from './tenantRepo.js';
import { encryptSecret, decryptSecret, generateWebhookId, generateWebhookSecret, safeEqual } from './cryptoUtils.js';
import { generateOpenAICompletion } from './openaiClient.js';
import { checkTenantQuota } from './usageService.js';
import { getEffectiveLimits, requireFeature } from './entitlements.js';
import { writeTenantAuditEvent } from './auditLogger.js';
import { sendLiveEmail } from './smtpService.js';
import { runWithCampaignCtx, getTemplateFromDbById, personalizeTemplate } from './campaignService.js';
import { listWhatsAppTemplates, sendWhatsAppTemplate } from './metaChannelsService.js';
import { isFirebaseConfigured } from '../firebase/config.js';
import type { TenantContext } from '../types/tenant.js';
import type { EmailTemplate } from '../types/index.js';

type TriggerType = 'webhook' | 'schedule' | 'manual' | 'event';
type StepType = 'send_email' | 'send_whatsapp_template' | 'update_lead' | 'condition' | 'delay' | 'wait_for_event' | 'stop';
type SignatureMode = 'hmac_sha256' | 'stripe';

interface AutomationStep {
  id: string;
  type: StepType;
  title: string;
  config: Record<string, any>;
}
interface AutomationDefinition {
  name: string;
  description: string;
  trigger: { type: TriggerType; eventName?: string; provider?: string; intervalMinutes?: number; endpointId?: string };
  steps: AutomationStep[];
  clarifications: string[];
}

const INTERNAL_EVENTS = new Set(['lead.created', 'lead.updated', 'inbox.message_received']);
const SECRET_KEY_PATTERN = /(password|secret|token|authorization|cookie|credential|api.?key|card.?number|cvv|private.?key)/i;
const ALLOWED_LEAD_FIELDS = new Set([
  'firstName', 'lastName', 'name', 'email', 'phone', 'companyName', 'designation',
  'city', 'country', 'serviceInterest', 'requirements', 'budget', 'timeline',
  'status', 'intent', 'buyingStage', 'leadScore', 'aiSummary', 'aiRecommendation',
]);

function cleanText(value: unknown, max = 500): string {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
}
function asObject(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
}
function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}
function safePayload(value: any, depth = 0): any {
  if (depth > 6 || value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') return value.slice(0, 4000);
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => safePayload(item, depth + 1));
  if (typeof value !== 'object') return undefined;
  const out: Record<string, any> = {};
  for (const [key, child] of Object.entries(value).slice(0, 80)) {
    if (SECRET_KEY_PATTERN.test(key)) continue;
    const next = safePayload(child, depth + 1);
    if (next !== undefined) out[key.slice(0, 100)] = next;
  }
  return out;
}
function fieldValue(root: any, path: string): any {
  const cleanPath = String(path || '').trim().replace(/^\$\.?/, '').replace(/^event\./, '');
  if (!cleanPath || cleanPath === 'event') return root;
  return cleanPath.split('.').reduce((current: any, segment: string) => {
    if (current === null || current === undefined) return undefined;
    if (Array.isArray(current) && /^\d+$/.test(segment)) return current[Number(segment)];
    return current[segment];
  }, root);
}
function resolveValue(value: any, event: Record<string, any>): any {
  if (typeof value === 'string') {
    return value.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_match, rawPath) => {
      const resolved = fieldValue(event, String(rawPath || '').trim());
      if (resolved === null || resolved === undefined) return '';
      return typeof resolved === 'object' ? JSON.stringify(resolved) : String(resolved);
    });
  }
  if (Array.isArray(value)) return value.map((item) => resolveValue(item, event));
  if (value && typeof value === 'object') {
    const out: Record<string, any> = {};
    for (const [key, child] of Object.entries(value)) out[key] = resolveValue(child, event);
    return out;
  }
  return value;
}
function missingMappings(definition: AutomationDefinition, payload: Record<string, any>): string[] {
  const missing = new Set<string>();
  const scan = (value: any) => {
    if (typeof value === 'string') {
      const pattern = /\{\{\s*([^}]+?)\s*\}\}/g;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(value))) {
        const path = String(match[1]).trim();
        if (path && fieldValue(payload, path) === undefined) missing.add(path);
      }
    } else if (Array.isArray(value)) value.forEach(scan);
    else if (value && typeof value === 'object') Object.values(value).forEach(scan);
  };
  definition.steps.forEach((step) => scan(step.config));
  return [...missing].slice(0, 30);
}
function normalizeDefinition(input: any): AutomationDefinition {
  const root = asObject(input);
  const rawTrigger = asObject(root.trigger);
  const triggerType = String(rawTrigger.type || 'webhook').toLowerCase();
  if (!['webhook', 'schedule', 'manual', 'event'].includes(triggerType)) {
    throw new Error('Use a webhook, schedule, manual, or supported Amaavigo event trigger.');
  }
  if (triggerType === 'event' && !INTERNAL_EVENTS.has(String(rawTrigger.eventName || ''))) {
    throw new Error('Supported native events are lead.created, lead.updated, and inbox.message_received.');
  }
  const rawSteps = Array.isArray(root.steps) ? root.steps : [];
  if (!rawSteps.length || rawSteps.length > 30) throw new Error('An automation must contain between 1 and 30 steps.');
  const steps: AutomationStep[] = rawSteps.map((raw: any, index: number) => {
    const step = asObject(raw);
    const type = String(step.type || '').toLowerCase();
    if (!['send_email', 'send_whatsapp_template', 'update_lead', 'condition', 'delay', 'wait_for_event', 'stop'].includes(type)) {
      throw new Error('Unsupported step type "' + type + '". Amaavigo will not execute generated code or unregistered actions.');
    }
    const config = asObject(step.config);
    const id = cleanText(step.id || ('step_' + (index + 1)), 50).replace(/[^A-Za-z0-9_-]/g, '_');
    if (!/^[A-Za-z0-9_-]{1,50}$/.test(id)) throw new Error('A workflow step has an invalid ID.');
    const labels: Record<string, string> = {
      send_email: 'Send email', send_whatsapp_template: 'Send WhatsApp template',
      update_lead: 'Update CRM lead', condition: 'Check condition', delay: 'Wait',
      wait_for_event: 'Wait for an event', stop: 'End this path',
    };
    if (type === 'send_email') {
      if (!cleanText(config.to, 500)) throw new Error('The email step needs a recipient mapping.');
      if (!cleanText(config.templateId, 120) && (!cleanText(config.subject, 300) || (!cleanText(config.text, 5000) && !cleanText(config.html, 10000)))) {
        throw new Error('The email step needs a saved template or a subject and message body.');
      }
    }
    if (type === 'send_whatsapp_template') {
      if (!cleanText(config.phone, 300) || !cleanText(config.templateName, 120) || !cleanText(config.language, 30)) {
        throw new Error('The WhatsApp step needs a recipient phone mapping, approved template name, and language.');
      }
      if (config.params !== undefined && !Array.isArray(config.params)) throw new Error('WhatsApp parameters must be a list.');
    }
    if (type === 'update_lead') {
      if (!cleanText(config.leadId, 300) || !Object.keys(asObject(config.fields)).length) throw new Error('The CRM update needs a lead ID mapping and at least one field.');
      for (const key of Object.keys(asObject(config.fields))) {
        if (!ALLOWED_LEAD_FIELDS.has(key)) throw new Error('The CRM update contains a field that is not allowed: ' + key);
      }
    }
    if (type === 'condition' && (!cleanText(config.path, 200) || !['equals', 'not_equals', 'contains', 'exists', 'greater_than', 'less_than'].includes(String(config.operator || 'equals')))) {
      throw new Error('A condition needs a supported field path and comparison operator.');
    }
    if (type === 'delay' && (!Number.isFinite(Number(config.minutes)) || Number(config.minutes) < 1 || Number(config.minutes) > 43200)) {
      throw new Error('Wait steps must be between 1 minute and 30 days.');
    }
    if (type === 'wait_for_event') {
      if (!INTERNAL_EVENTS.has(String(config.eventName || ''))) throw new Error('Choose a supported native event to wait for.');
      if (!Number.isFinite(Number(config.timeoutMinutes)) || Number(config.timeoutMinutes) < 1 || Number(config.timeoutMinutes) > 43200) {
        throw new Error('Event waits need a timeout between 1 minute and 30 days.');
      }
    }
    return { id, type: type as StepType, title: cleanText(step.title || labels[type], 90), config };
  });
  const ids = new Set(steps.map((step) => step.id));
  if (ids.size !== steps.length) throw new Error('Workflow step IDs must be unique.');
  for (const step of steps) {
    const targets = step.type === 'condition'
      ? [step.config.onTrueNextStepId, step.config.onFalseNextStepId]
      : step.type === 'wait_for_event'
        ? [step.config.onEventNextStepId, step.config.onTimeoutNextStepId]
        : [];
    for (const target of targets) if (target && !ids.has(String(target))) throw new Error('A workflow branch refers to a step that does not exist.');
  }
  const interval = Number(rawTrigger.intervalMinutes || 60);
  return {
    name: cleanText(root.name || 'New automation', 100),
    description: cleanText(root.description || '', 600),
    trigger: {
      type: triggerType as TriggerType,
      eventName: cleanText(rawTrigger.eventName || (triggerType === 'event' ? 'lead.created' : 'workspace.event'), 120),
      provider: cleanText(rawTrigger.provider || (triggerType === 'event' ? 'Amaavigo' : 'custom'), 80),
      ...(triggerType === 'schedule' ? { intervalMinutes: Math.min(43200, Math.max(5, Math.floor(interval))) } : {}),
    },
    steps,
    clarifications: Array.isArray(root.clarifications) ? root.clarifications.map((item: any) => cleanText(item, 240)).filter(Boolean).slice(0, 8) : [],
  };
}
function baseUrl(req: any): string {
  const configured = String(process.env.APP_URL || process.env.PUBLIC_APP_URL || '').trim().replace(/\/+$/, '');
  if (/^https?:\/\//i.test(configured)) return configured;
  const host = String(req?.headers?.['x-forwarded-host'] || req?.headers?.host || '').split(',')[0].trim();
  const protocol = String(req?.headers?.['x-forwarded-proto'] || 'https').split(',')[0].trim();
  return host && /^[A-Za-z0-9.:[\]-]+$/.test(host) ? protocol + '://' + host : 'https://leads.amaavigo.com';
}
function repoFor(ctx: TenantContext): ReturnType<typeof tenantRepo> {
  return tenantRepo(ctx);
}
async function templateContext(ctx: TenantContext): Promise<{ email: any[]; whatsapp: any[] }> {
  const email = await runWithCampaignCtx(ctx, async () => {
    const { getTemplatesFromDbOrCache } = await import('./campaignService.js');
    const templates = await getTemplatesFromDbOrCache();
    return templates.slice(0, 40).map((item: any) => ({ id: item.templateId, name: item.name, subject: item.subject }));
  }).catch(() => []);
  const whatsapp = await listWhatsAppTemplates(ctx).catch(() => []);
  return {
    email,
    whatsapp: whatsapp.slice(0, 60).map((item: any) => ({
      name: item.name, language: item.language, status: item.status,
      parameterNames: item.parameterNames || [], paramCount: item.paramCount || 0,
    })),
  };
}
async function generateDefinition(ctx: TenantContext, prompt: string): Promise<AutomationDefinition> {
  const quota = await checkTenantQuota(ctx.tenantId, 'ai');
  if (!quota.allowed) throw Object.assign(new Error(quota.reason || 'The workspace AI usage limit has been reached.'), { status: 402 });
  const templates = await templateContext(ctx);
  const systemPrompt = [
    'You are Amaavigo Automation Architect. Return one JSON workflow object with keys name, description, trigger, steps and clarifications.',
    'Triggers: webhook for external events, schedule for recurring interval work, manual only when requested, event only for lead.created, lead.updated or inbox.message_received.',
    'Steps only: send_email, send_whatsapp_template, update_lead, condition, delay, wait_for_event, stop. Never generate code, arbitrary HTTP, shell, SQL or unregistered actions.',
    'Use {{event.path}} references for event fields. Never invent contact values, secrets, credentials, phone numbers or template IDs.',
    'For email, use an existing templateId only if it appears in the available list; otherwise provide subject and text.',
    'For WhatsApp, choose an APPROVED template from the supplied list only. Ask for clarification if none is suitable.',
    'For CRM updates, provide leadId and only ordinary profile fields.',
    'For conditions, include path, operator, value and optional branch step IDs.',
    'For delay, use minutes from 1 to 43200; the worker persists waits without sleeping.',
    'For wait_for_event, use a supported eventName, timeoutMinutes, optional matchField and matchValue, optional onEventNextStepId and onTimeoutNextStepId.',
    'A no-reply follow-up should wait for inbox.message_received matching the same leadId, send nothing when the reply arrives, and send only on timeout.',
    'Never assume Amaavigo can register the webhook on an external service automatically. The endpoint is created here; customer configures provider unless a specific adapter exists.',
    'Customer request: ' + prompt,
    'Available email templates: ' + JSON.stringify(templates.email),
    'Available approved WhatsApp templates: ' + JSON.stringify(templates.whatsapp),
  ].join('\n');
  const raw = await generateOpenAICompletion({
    systemPrompt,
    userPrompt: 'Create a safe workflow definition as JSON only.',
    jsonMode: true,
    temperature: 0.1,
    maxTokens: 4000,
    tenantId: ctx.tenantId,
    usageFeature: 'automation_creator',
    models: [process.env.AUTOMATION_MODEL_ID || process.env.AGENT_MODEL_ID || 'gpt-4o-mini', 'gpt-4o-mini', 'gpt-4o'],
    timeoutMs: 90000,
    maxRetries: 0,
  });
  let parsed: any;
  try { parsed = JSON.parse(raw); }
  catch {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start < 0 || end <= start) throw new Error('The AI returned invalid workflow JSON. Please refine the request.');
    parsed = JSON.parse(raw.slice(start, end + 1));
  }
  return normalizeDefinition(parsed);
}
function definitionHash(definition: AutomationDefinition): string {
  return sha256(JSON.stringify(definition));
}
async function createDraft(ctx: TenantContext, req: any, prompt: string): Promise<any> {
  const definition = await generateDefinition(ctx, prompt);
  const repo = repoFor(ctx);
  const now = new Date().toISOString();
  const automationId = 'auto_' + randomUUID().replace(/-/g, '');
  let endpoint: any = null;
  let oneTimeSecret: string | undefined;
  if (definition.trigger.type === 'webhook') {
    const endpointId = generateWebhookId('awh');
    oneTimeSecret = generateWebhookSecret();
    const secretName = 'automation_webhook_' + endpointId;
    const encrypted = encryptSecret(oneTimeSecret);
    await createDoc(repo.secretDoc(secretName), { name: secretName, ...encrypted, createdAt: now, updatedAt: now });
    endpoint = {
      endpointId, automationId, path: '/api/webhooks/automations/' + endpointId,
      signatureMode: 'hmac_sha256' as SignatureMode, secretName, status: 'draft',
      createdAt: now, lastTestAt: null, testStatus: 'not_tested', lastTestFields: [],
    };
    await createDoc(repo.doc('automation_endpoints', endpointId), endpoint);
    await createDoc(globalAutomationWebhookRouteDoc(endpointId), {
      endpointId, tenantId: ctx.tenantId, automationId, status: 'draft', createdAt: now,
    });
    definition.trigger.endpointId = endpointId;
  }
  const hash = definitionHash(definition);
  const versionDocId = automationId + '_v1';
  await createDoc(repo.doc('automation_versions', versionDocId), {
    id: versionDocId, automationId, version: 1, definition, hash, createdAt: now, createdBy: ctx.uid,
  });
  const automation = {
    id: automationId, name: definition.name, description: definition.description,
    status: 'draft', trigger: definition.trigger, endpointId: endpoint?.endpointId || null,
    currentVersion: 1, currentVersionDocId: versionDocId, currentHash: hash,
    createdAt: now, updatedAt: now, createdBy: ctx.uid, nextRunAt: null, credentials: [],
  };
  await createDoc(repo.doc('automations', automationId), automation);
  await writeTenantAuditEvent(ctx, {
    action: 'AUTOMATION_DRAFT_CREATED', module: 'AI_ENGINE',
    description: 'AI created a new automation draft for review.',
    target: { type: 'Automation', id: automationId, name: automation.name },
    metadata: { trigger: definition.trigger.type, stepCount: definition.steps.length, version: 1 },
  });
  return {
    automation, definition,
    endpoint: endpoint ? { ...endpoint, url: baseUrl(req) + endpoint.path, secretName: undefined } : null,
    oneTimeSecret,
  };
}
async function getAutomation(ctx: TenantContext, id: string): Promise<any> {
  const snap = await getDoc(repoFor(ctx).doc('automations', id));
  if (!snap.exists() || (snap.data() as any).status === 'deleted') throw Object.assign(new Error('Automation not found.'), { status: 404 });
  return snap.data() as any;
}
async function getDefinition(ctx: TenantContext, automation: any): Promise<AutomationDefinition> {
  const snap = await getDoc(repoFor(ctx).doc('automation_versions', String(automation.currentVersionDocId || '')));
  if (!snap.exists()) throw new Error('The saved workflow version is missing.');
  const version = snap.data() as any;
  const definition = normalizeDefinition(version.definition);
  if (version.hash !== automation.currentHash || definitionHash(definition) !== version.hash) {
    throw new Error('The workflow checksum does not match. It cannot be activated or executed.');
  }
  return definition;
}
async function automationView(ctx: TenantContext, automation: any, req: any): Promise<any> {
  const repo = repoFor(ctx);
  const workflow = await getDefinition(ctx, automation).catch(() => null);
  let endpoint = null;
  if (automation.endpointId) {
    const snap = await getDoc(repo.doc('automation_endpoints', automation.endpointId));
    if (snap.exists()) {
      const data = snap.data() as any;
      endpoint = {
        endpointId: data.endpointId, path: data.path, url: baseUrl(req) + data.path,
        signatureMode: data.signatureMode, status: data.status, testStatus: data.testStatus,
        lastTestAt: data.lastTestAt, lastTestFields: data.lastTestFields || [],
      };
    }
  }
  return {
    ...automation, workflow, endpoint,
    credentials: (automation.credentials || []).map((item: any) => ({
      id: item.id, provider: item.provider, label: item.label, createdAt: item.createdAt,
    })),
  };
}
async function saveCredential(ctx: TenantContext, automationId: string, body: any): Promise<any> {
  if (ctx.role === 'member') throw Object.assign(new Error('Only workspace admins can store integration credentials.'), { status: 403 });
  const automation = await getAutomation(ctx, automationId);
  const value = String(body?.value || '');
  const label = cleanText(body?.label, 80);
  const provider = cleanText(body?.provider || 'custom', 80).toLowerCase();
  if (!value || value.length > 10000 || !label) throw new Error('Enter a credential label and a value under 10,000 characters.');
  const id = randomUUID().replace(/-/g, '');
  const secretName = 'automation_credential_' + automationId + '_' + id;
  const encrypted = encryptSecret(value);
  const now = new Date().toISOString();
  await createDoc(repoFor(ctx).secretDoc(secretName), { name: secretName, ...encrypted, createdAt: now, updatedAt: now });
  await updateDoc(repoFor(ctx).doc('automations', automationId), {
    credentials: [...(automation.credentials || []), { id, provider, label, secretName, createdAt: now }],
    updatedAt: now,
  });
  await writeTenantAuditEvent(ctx, {
    action: 'AUTOMATION_CREDENTIAL_STORED', module: 'SETTINGS',
    description: 'An encrypted provider credential was saved for an automation.',
    target: { type: 'Automation', id: automationId, name: automation.name },
    metadata: { provider, operation: 'credential_saved' },
  });
  return { id, provider, label, createdAt: now };
}
async function configureWebhookSecret(ctx: TenantContext, automationId: string, body: any): Promise<any> {
  if (ctx.role === 'member') throw Object.assign(new Error('Only workspace admins can manage webhook authentication.'), { status: 403 });
  const automation = await getAutomation(ctx, automationId);
  if (automation.status === 'active') throw Object.assign(new Error('Pause the automation before changing its webhook signing secret.'), { status: 409 });
  if (!automation.endpointId) throw new Error('This automation does not use a webhook trigger.');
  const repo = repoFor(ctx);
  const endpointSnap = await getDoc(repo.doc('automation_endpoints', automation.endpointId));
  if (!endpointSnap.exists()) throw new Error('Webhook endpoint not found.');
  const endpoint = endpointSnap.data() as any;
  const mode = String(body?.signatureMode || endpoint.signatureMode || 'hmac_sha256');
  if (!['hmac_sha256', 'stripe'].includes(mode)) throw new Error('Choose Amaavigo HMAC-SHA256 or Stripe signature verification.');
  let secret = String(body?.value || '');
  if (body?.rotate === true && mode === 'hmac_sha256') secret = generateWebhookSecret();
  if (mode === 'stripe' && !secret) throw new Error('Paste the signing secret from your Stripe webhook endpoint.');
  if (mode === 'hmac_sha256' && !secret && endpoint.signatureMode !== 'hmac_sha256') throw new Error('Generate a new HMAC secret before switching modes.');
  if (secret) {
    const encrypted = encryptSecret(secret);
    await setDoc(repo.secretDoc(endpoint.secretName), {
      name: endpoint.secretName, ...encrypted,
      createdAt: endpoint.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString(),
    }, { merge: true });
  }
  await updateDoc(repo.doc('automation_endpoints', automation.endpointId), {
    signatureMode: mode, testStatus: 'not_tested', lastTestAt: null, lastTestFields: [], lastTestPayload: null,
    updatedAt: new Date().toISOString(),
  });
  return { signatureMode: mode, oneTimeSecret: mode === 'hmac_sha256' && body?.rotate === true ? secret : undefined };
}
function headerValue(headers: Record<string, any>, name: string): string {
  const key = Object.keys(headers || {}).find((item) => item.toLowerCase() === name.toLowerCase());
  const value = key ? headers[key] : '';
  return Array.isArray(value) ? String(value[0] || '') : String(value || '');
}
function verifySignature(mode: SignatureMode, secret: string, rawBody: Buffer, headers: Record<string, any>): boolean {
  if (mode === 'stripe') {
    const parts = headerValue(headers, 'stripe-signature').split(',').map((item) => item.trim());
    const timestamp = parts.find((item) => item.startsWith('t='))?.slice(2) || '';
    const signatures = parts.filter((item) => item.startsWith('v1=')).map((item) => item.slice(3));
    const seconds = Number(timestamp);
    if (!Number.isFinite(seconds) || !signatures.length || Math.abs(Date.now() / 1000 - seconds) > 300) return false;
    const expected = createHmac('sha256', secret).update(timestamp + '.').update(rawBody).digest('hex');
    return signatures.some((candidate) => safeEqual(expected, candidate));
  }
  const signature = headerValue(headers, 'x-amaavigo-signature');
  const timestamp = headerValue(headers, 'x-amaavigo-timestamp');
  const seconds = Number(timestamp);
  if (!/^sha256=[a-f0-9]{64}$/i.test(signature) || !Number.isFinite(seconds) || Math.abs(Date.now() / 1000 - seconds) > 300) return false;
  const expected = createHmac('sha256', secret).update(timestamp + '.').update(rawBody).digest('hex');
  return safeEqual(expected, signature.slice(7).toLowerCase());
}

async function createRun(ctx: TenantContext, automation: any, payload: Record<string, any>, eventId: string, source: string) {
  const repo = repoFor(ctx);
  const now = new Date().toISOString();
  const month = now.slice(0, 7);
  const limits = await getEffectiveLimits(ctx.tenantId);
  const usageRef = repo.usageDoc(month);
  const usageSnap = await getDoc(usageRef);
  const used = Number((usageSnap.data() as any)?.automationRunCount || 0);
  const monthlyLimit = Number(limits.monthlyAutomationRuns ?? 10000);
  if (monthlyLimit >= 0 && used >= monthlyLimit) throw Object.assign(new Error('This workspace has reached its monthly automation-run limit.'), { status: 429 });
  const runId = 'run_' + sha256(ctx.tenantId + ':' + automation.id + ':' + eventId).slice(0, 36);
  const run = {
    id: runId, automationId: automation.id, automationName: automation.name,
    workflowVersion: automation.currentVersion, versionDocId: automation.currentVersionDocId,
    status: 'queued', source, eventId, eventPayload: safePayload(payload), stepIndex: 0,
    createdAt: now, updatedAt: now,
  };
  try {
    await createDoc(repo.doc('automation_runs', runId), run);
    await setDoc(usageRef, { month, automationRunCount: increment(1), updatedAt: now }, { merge: true }).catch(() => {});
    return { runId, duplicate: false };
  } catch (error) {
    const existing = await getDoc(repo.doc('automation_runs', runId));
    if (existing.exists()) return { runId, duplicate: true };
    throw error;
  }
}

export async function handleAutomationWebhook(
  endpointId: string, rawBody: Buffer, headers: Record<string, any>
): Promise<{ status: number; body: Record<string, any> }> {
  if (!isFirebaseConfigured) return { status: 503, body: { error: 'Workspace storage is not configured.' } };
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(endpointId)) return { status: 404, body: { error: 'Webhook endpoint not found.' } };
  if (!Buffer.isBuffer(rawBody) || !rawBody.length || rawBody.length > 1000000) {
    return { status: 400, body: { error: 'A valid JSON payload under 1 MB is required.' } };
  }
  const routeSnap = await getDoc(globalAutomationWebhookRouteDoc(endpointId));
  if (!routeSnap.exists()) return { status: 404, body: { error: 'Webhook endpoint not found.' } };
  const route = routeSnap.data() as any;
  const ctx: TenantContext = { tenantId: String(route.tenantId || ''), uid: 'automation-webhook', email: 'webhook@automation.local', role: 'admin' };
  if (!ctx.tenantId || !route.automationId || route.status === 'deleted') return { status: 404, body: { error: 'Webhook endpoint not found.' } };
  if (route.status === 'paused') return { status: 423, body: { error: 'This automation is paused.' } };
  const repo = repoFor(ctx);
  const endpointSnap = await getDoc(repo.doc('automation_endpoints', endpointId));
  if (!endpointSnap.exists()) return { status: 404, body: { error: 'Webhook endpoint not found.' } };
  const endpoint = endpointSnap.data() as any;
  const secretSnap = await getDoc(repo.secretDoc(String(endpoint.secretName || '')));
  if (!secretSnap.exists()) return { status: 503, body: { error: 'Webhook authentication is not configured.' } };
  let secret = '';
  try { secret = decryptSecret(secretSnap.data() as any); }
  catch { return { status: 503, body: { error: 'Webhook authentication could not be loaded securely.' } }; }
  if (!verifySignature(endpoint.signatureMode as SignatureMode, secret, rawBody, headers || {})) {
    return { status: 401, body: { error: 'Webhook signature is invalid or outside the five-minute replay window.' } };
  }
  let payload: any;
  try { payload = JSON.parse(rawBody.toString('utf8')); }
  catch { return { status: 400, body: { error: 'The webhook body must be valid JSON.' } }; }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return { status: 400, body: { error: 'The webhook body must be a JSON object.' } };
  const automationSnap = await getDoc(repo.doc('automations', String(route.automationId)));
  if (!automationSnap.exists()) return { status: 404, body: { error: 'Automation not found.' } };
  const automation = automationSnap.data() as any;
  if (automation.status === 'paused') return { status: 423, body: { error: 'This automation is paused.' } };
  if (automation.status === 'deleted') return { status: 410, body: { error: 'This automation has been removed.' } };
  const sanitized = safePayload(payload) || {};
  if (automation.status !== 'active' || route.status !== 'active') {
    const definition = await getDefinition(ctx, automation).catch(() => null);
    const missing = definition ? missingMappings(definition, sanitized) : [];
    await updateDoc(repo.doc('automation_endpoints', endpointId), {
      lastTestAt: new Date().toISOString(),
      testStatus: missing.length ? 'needs_mapping' : 'passed_signed',
      lastTestFields: Object.keys(sanitized).slice(0, 50),
      lastTestPayload: sanitized, updatedAt: new Date().toISOString(),
    });
    return { status: 200, body: { received: true, testEvent: true, missingMappings: missing } };
  }
  const eventId = cleanText(
    headerValue(headers || {}, 'x-event-id') || headerValue(headers || {}, 'x-webhook-id') ||
    payload.id || payload.event_id || sha256(rawBody), 180
  );
  try {
    const result = await createRun(ctx, automation, sanitized, eventId, 'webhook');
    return { status: 202, body: { received: true, queued: !result.duplicate, duplicate: result.duplicate, runId: result.runId } };
  } catch (error: any) {
    return { status: Number(error?.status) || 500, body: { error: cleanText(error?.message || 'Webhook could not be queued.', 400) } };
  }
}

/** Called after tenant CRM records have been persisted by inbound services. */
export async function publishAutomationEvent(
  ctx: TenantContext, eventName: string, payload: Record<string, any>, eventId?: string
): Promise<{ triggered: number; resumed: number }> {
  if (!isFirebaseConfigured || !ctx?.tenantId || !INTERNAL_EVENTS.has(eventName)) return { triggered: 0, resumed: 0 };
  const repo = repoFor(ctx);
  const safe = safePayload(payload) || {};
  let triggered = 0;
  let resumed = 0;
  const active = await getDocs(query(repo.collection('automations'), where('status', '==', 'active'), limit(100)));
  const stableId = cleanText(eventId || (eventName + ':' + sha256(JSON.stringify(safe))), 180);
  for (const item of active.docs) {
    const automation = item.data() as any;
    if (automation.trigger?.type !== 'event' || automation.trigger?.eventName !== eventName) continue;
    const queued = await createRun(ctx, automation, safe, stableId + ':' + automation.id, 'native_event').catch(() => null);
    if (queued && !queued.duplicate) triggered += 1;
  }
  const waiting = await getDocs(query(repo.collection('automation_runs'), where('status', '==', 'waiting_event'), limit(150)));
  for (const runDoc of waiting.docs) {
    const run = runDoc.data() as any;
    const automation = await getAutomation(ctx, String(run.automationId)).catch(() => null);
    if (!automation || automation.status !== 'active') continue;
    const versionSnap = await getDoc(repo.doc('automation_versions', String(run.versionDocId || '')));
    if (!versionSnap.exists()) continue;
    const definition = normalizeDefinition((versionSnap.data() as any).definition);
    const index = Number(run.stepIndex || 0);
    const step = definition.steps[index];
    if (!step || step.type !== 'wait_for_event' || step.config.eventName !== eventName) continue;
    const matchField = cleanText(step.config.matchField || '', 180);
    const expected = step.config.matchValue === undefined ? '' : cleanText(resolveValue(step.config.matchValue, asObject(run.eventPayload)), 500);
    const actual = matchField ? fieldValue(safe, matchField) : undefined;
    if (expected && String(actual ?? '') !== expected) continue;
    const target = step.config.onEventNextStepId;
    const next = target ? definition.steps.findIndex((item) => item.id === String(target)) : index + 1;
    if (next < 0) continue;
    const stepId = String(run.id) + '_' + step.id;
    await updateDoc(repo.doc('automation_run_steps', stepId), {
      status: 'completed', result: { eventReceived: eventName, matchedAt: new Date().toISOString() },
      completedAt: new Date().toISOString(), nextStepIndex: next,
    }).catch(() => {});
    await updateDoc(repo.doc('automation_runs', run.id), {
      status: next >= definition.steps.length ? 'completed' : 'queued',
      stepIndex: next, waitUntil: null,
      eventPayload: { ...asObject(run.eventPayload), waitEvent: { eventName, receivedAt: new Date().toISOString(), timedOut: false, payload: safe } },
      updatedAt: new Date().toISOString(),
      ...(next >= definition.steps.length ? { completedAt: new Date().toISOString() } : {}),
    });
    resumed += 1;
  }
  return { triggered, resumed };
}
function conditionMatches(config: Record<string, any>, payload: Record<string, any>): boolean {
  const actual = fieldValue(payload, String(config.path || ''));
  const expected = resolveValue(config.value, payload);
  switch (String(config.operator || 'equals')) {
    case 'exists': return actual !== undefined && actual !== null && actual !== '';
    case 'not_equals': return String(actual) !== String(expected);
    case 'contains': return Array.isArray(actual)
      ? actual.some((item) => String(item) === String(expected))
      : String(actual ?? '').toLowerCase().includes(String(expected ?? '').toLowerCase());
    case 'greater_than': return Number(actual) > Number(expected);
    case 'less_than': return Number(actual) < Number(expected);
    default: return String(actual) === String(expected);
  }
}
function branchIndex(definition: AutomationDefinition, target: unknown, fallback: number): number {
  if (!target) return fallback;
  const index = definition.steps.findIndex((step) => step.id === String(target));
  if (index < 0) throw new Error('A workflow branch points to a missing step.');
  return index;
}
async function executeRegisteredAction(
  ctx: TenantContext, automation: any, step: AutomationStep, payload: Record<string, any>
): Promise<Record<string, any>> {
  const config = step.config || {};
  if (step.type === 'send_email') {
    const to = cleanText(resolveValue(config.to, payload), 320);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw new Error('The mapped email recipient is missing or invalid.');
    let subject = cleanText(resolveValue(config.subject, payload), 300);
    let text = cleanText(resolveValue(config.text, payload), 5000);
    let html = cleanText(resolveValue(config.html, payload), 10000);
    let attachments: any[] | undefined;
    if (config.templateId) {
      const template = await runWithCampaignCtx(ctx, () => getTemplateFromDbById(String(config.templateId)));
      if (!template) throw new Error('The selected saved email template no longer exists.');
      const personalized = personalizeTemplate(template as EmailTemplate, {
        name: cleanText(payload.name || payload.customerName || '', 120),
        firstName: cleanText(payload.firstName || '', 80),
        lastName: cleanText(payload.lastName || '', 80),
        companyName: cleanText(payload.companyName || '', 120),
        designation: cleanText(payload.designation || '', 120),
        email: to,
      });
      subject = cleanText(resolveValue(personalized.subject, payload), 300);
      text = cleanText(resolveValue(personalized.body, payload), 5000);
      html = cleanText(resolveValue(personalized.html || '', payload), 10000);
      attachments = personalized.attachments;
    }
    if (!subject || (!text && !html)) throw new Error('The email subject or body is empty after mapping.');
    const sent = await sendLiveEmail({
      to, subject, text: text || html.replace(/<[^>]*>/g, ' ').slice(0, 5000),
      html: html || undefined, attachments, tenantId: ctx.tenantId, usageCategory: 'solicited',
      tags: [
        { name: 'automation', value: String(automation.id).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 200) },
        { name: 'automation_step', value: step.id.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 200) },
      ],
    });
    if (!sent.success) throw new Error(sent.error || 'The email provider did not accept the message.');
    return { provider: sent.provider || 'email', messageId: sent.messageId || '', recipient: to, accepted: true };
  }
  if (step.type === 'send_whatsapp_template') {
    const phone = cleanText(resolveValue(config.phone, payload), 80).replace(/[^\d+]/g, '');
    const name = cleanText(config.templateName, 120);
    const language = cleanText(config.language || 'en', 30);
    const params = Array.isArray(config.params) ? config.params.map((item: any) => cleanText(resolveValue(item, payload), 1024)) : [];
    const approved = await listWhatsAppTemplates(ctx);
    const snapshot = approved.find((item: any) => item.name === name && item.language === language);
    if (!snapshot) throw new Error('The WhatsApp template is not currently approved or connected.');
    const sent = await sendWhatsAppTemplate(ctx, phone, { name, language, params }, snapshot);
    return { provider: 'whatsapp', messageId: sent.messageId, recipient: phone, templateName: name, accepted: true };
  }
  if (step.type === 'update_lead') {
    const leadId = cleanText(resolveValue(config.leadId, payload), 180);
    if (!/^[A-Za-z0-9_-]{1,180}$/.test(leadId)) throw new Error('The CRM lead ID mapping is missing or invalid.');
    const fields = asObject(resolveValue(config.fields, payload));
    const updates: Record<string, any> = { updatedAt: new Date().toISOString() };
    for (const [key, value] of Object.entries(fields)) {
      if (!ALLOWED_LEAD_FIELDS.has(key)) continue;
      if (key === 'leadScore') {
        const score = Number(value);
        if (Number.isFinite(score)) updates[key] = Math.max(0, Math.min(100, score));
      } else if (typeof value === 'string') updates[key] = value.slice(0, 2000);
      else if (typeof value === 'number' || typeof value === 'boolean' || Array.isArray(value) || value === null) updates[key] = value;
    }
    if (Object.keys(updates).length === 1) throw new Error('No permitted CRM fields were supplied.');
    const ref = repoFor(ctx).leadDoc(leadId);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error('The mapped CRM lead was not found in this workspace.');
    await updateDoc(ref, updates);
    return { action: 'lead_updated', leadId, fields: Object.keys(updates).filter((key) => key !== 'updatedAt') };
  }
  throw new Error('This is not a registered automation action.');
}
async function cancelPendingRuns(ctx: TenantContext, automationId: string): Promise<void> {
  const repo = repoFor(ctx);
  for (const status of ['queued', 'waiting', 'waiting_event']) {
    const snap = await getDocs(query(repo.collection('automation_runs'), where('automationId', '==', automationId), where('status', '==', status), limit(200)));
    for (const item of snap.docs) {
      await updateDoc(repo.doc('automation_runs', item.id), {
        status: 'cancelled', error: 'The automation was paused or edited before this run completed.',
        updatedAt: new Date().toISOString(),
      }).catch(() => {});
    }
  }
}
async function processRunStep(ctx: TenantContext, run: any): Promise<void> {
  const repo = repoFor(ctx);
  const automation = await getAutomation(ctx, String(run.automationId));
  if (automation.status !== 'active') {
    await updateDoc(repo.doc('automation_runs', run.id), { status: 'cancelled', updatedAt: new Date().toISOString(), error: 'Automation is not active.' });
    return;
  }
  const versionSnap = await getDoc(repo.doc('automation_versions', String(run.versionDocId || '')));
  if (!versionSnap.exists()) throw new Error('The run references a missing workflow version.');
  const version = versionSnap.data() as any;
  const definition = normalizeDefinition(version.definition);
  if (Number(run.workflowVersion) === Number(automation.currentVersion) &&
      (version.hash !== automation.currentHash || definitionHash(definition) !== version.hash)) {
    throw new Error('The saved workflow checksum changed after this run was queued.');
  }
  const index = Number(run.stepIndex || 0);
  if (index >= definition.steps.length) {
    await updateDoc(repo.doc('automation_runs', run.id), { status: 'completed', completedAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    return;
  }
  const step = definition.steps[index];
  const stepId = String(run.id) + '_' + step.id;
  const stepRef = repo.doc('automation_run_steps', stepId);
  const now = new Date().toISOString();
  try {
    await createDoc(stepRef, {
      id: stepId, runId: run.id, automationId: automation.id, stepId: step.id,
      stepIndex: index, type: step.type, status: 'processing', startedAt: now,
    });
  } catch {
    const existing = await getDoc(stepRef);
    if (!existing.exists()) throw new Error('Could not claim the workflow step.');
    const state = existing.data() as any;
    if (state.status === 'completed') {
      const next = Number(state.nextStepIndex ?? index + 1);
      await updateDoc(repo.doc('automation_runs', run.id), {
        status: next >= definition.steps.length ? 'completed' : 'queued',
        stepIndex: next, updatedAt: new Date().toISOString(),
        ...(next >= definition.steps.length ? { completedAt: new Date().toISOString() } : {}),
      });
    } else if (state.status === 'failed' || state.status === 'needs_review') {
      await updateDoc(repo.doc('automation_runs', run.id), { status: state.status, error: state.error || 'The step requires review.', updatedAt: new Date().toISOString() });
    } else if (state.status === 'waiting') {
      await updateDoc(repo.doc('automation_runs', run.id), { status: 'waiting', stepIndex: index + 1, resumeAt: state.resumeAt, updatedAt: new Date().toISOString() });
    } else if (state.status === 'waiting_event') {
      await updateDoc(repo.doc('automation_runs', run.id), { status: 'waiting_event', stepIndex: index, waitUntil: state.waitUntil, waitEventName: state.waitEventName, updatedAt: new Date().toISOString() });
    } else if (state.status === 'processing' && Date.now() - Date.parse(state.startedAt || '') > 180000) {
      await updateDoc(stepRef, { status: 'needs_review', error: 'Worker stopped during this step. It was not replayed to avoid a duplicate external action.' });
      await updateDoc(repo.doc('automation_runs', run.id), {
        status: 'needs_review',
        error: 'An external action may have reached its provider. Check the provider before taking further action.',
        updatedAt: new Date().toISOString(),
      });
    }
    return;
  }
  const payload = asObject(run.eventPayload);
  try {
    if (step.type === 'delay') {
      const resumeAt = new Date(Date.now() + Number(step.config.minutes) * 60000).toISOString();
      await updateDoc(stepRef, { status: 'waiting', resumeAt, nextStepIndex: index + 1 });
      await updateDoc(repo.doc('automation_runs', run.id), { status: 'waiting', stepIndex: index + 1, resumeAt, updatedAt: new Date().toISOString() });
      return;
    }
    if (step.type === 'wait_for_event') {
      const waitUntil = new Date(Date.now() + Number(step.config.timeoutMinutes) * 60000).toISOString();
      await updateDoc(stepRef, { status: 'waiting_event', waitUntil, waitEventName: step.config.eventName, nextStepIndex: index });
      await updateDoc(repo.doc('automation_runs', run.id), { status: 'waiting_event', stepIndex: index, waitUntil, waitEventName: step.config.eventName, updatedAt: new Date().toISOString() });
      return;
    }
    if (step.type === 'stop') {
      await updateDoc(stepRef, { status: 'completed', result: { stopped: true }, completedAt: new Date().toISOString(), nextStepIndex: definition.steps.length });
      await updateDoc(repo.doc('automation_runs', run.id), {
        status: 'completed', stepIndex: definition.steps.length, completedAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      });
      return;
    }
    let result: Record<string, any> = {};
    let next = index + 1;
    if (step.type === 'condition') {
      const matched = conditionMatches(step.config, payload);
      next = branchIndex(definition, matched ? step.config.onTrueNextStepId : step.config.onFalseNextStepId, index + 1);
      result = { conditionMatched: matched };
    } else result = await executeRegisteredAction(ctx, automation, step, payload);
    const complete = next >= definition.steps.length;
    await updateDoc(stepRef, { status: 'completed', result, completedAt: new Date().toISOString(), nextStepIndex: next });
    await updateDoc(repo.doc('automation_runs', run.id), {
      status: complete ? 'completed' : 'queued', stepIndex: next, updatedAt: new Date().toISOString(),
      ...(complete ? { completedAt: new Date().toISOString() } : {}),
    });
  } catch (error: any) {
    const message = cleanText(error?.message || 'Automation step failed.', 700);
    await updateDoc(stepRef, { status: 'failed', error: message, failedAt: new Date().toISOString() });
    await updateDoc(repo.doc('automation_runs', run.id), {
      status: 'failed', error: message, failedAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    });
    await writeTenantAuditEvent(ctx, {
      action: 'AUTOMATION_RUN_FAILED', module: 'AI_ENGINE',
      description: 'An automation run failed during a workflow step.',
      target: { type: 'Automation', id: automation.id, name: automation.name },
      metadata: { runId: run.id, stepId: step.id, status: 'failed' },
    }).catch(() => {});
  }
}
async function releaseEventTimeout(ctx: TenantContext, run: any): Promise<void> {
  const repo = repoFor(ctx);
  const versionSnap = await getDoc(repo.doc('automation_versions', String(run.versionDocId || '')));
  if (!versionSnap.exists()) return;
  const definition = normalizeDefinition((versionSnap.data() as any).definition);
  const index = Number(run.stepIndex || 0);
  const step = definition.steps[index];
  if (!step || step.type !== 'wait_for_event') return;
  const next = branchIndex(definition, step.config.onTimeoutNextStepId, index + 1);
  const stepId = String(run.id) + '_' + step.id;
  await updateDoc(repo.doc('automation_run_steps', stepId), {
    status: 'completed', result: { timedOut: true, eventName: step.config.eventName },
    completedAt: new Date().toISOString(), nextStepIndex: next,
  }).catch(() => {});
  await updateDoc(repo.doc('automation_runs', run.id), {
    status: next >= definition.steps.length ? 'completed' : 'queued',
    stepIndex: next, waitUntil: null,
    eventPayload: { ...asObject(run.eventPayload), waitEvent: { eventName: step.config.eventName, timedOut: true, receivedAt: null } },
    updatedAt: new Date().toISOString(),
    ...(next >= definition.steps.length ? { completedAt: new Date().toISOString() } : {}),
  });
}
export async function runAutomationWorkerCycle(ctx: TenantContext, batchSize = 8): Promise<{ scheduled: number; processed: number }> {
  if (!isFirebaseConfigured || !ctx?.tenantId) return { scheduled: 0, processed: 0 };
  const repo = repoFor(ctx);
  let scheduled = 0;
  let processed = 0;
  const now = Date.now();
  const active = await getDocs(query(repo.collection('automations'), where('status', '==', 'active'), limit(100)));
  for (const item of active.docs) {
    const automation = item.data() as any;
    if (automation.trigger?.type !== 'schedule' || !automation.nextRunAt) continue;
    const due = Date.parse(String(automation.nextRunAt));
    if (!Number.isFinite(due) || due > now) continue;
    const slot = new Date(due).toISOString();
    const queued = await createRun(ctx, automation, { scheduledAt: slot, automationId: automation.id }, 'schedule:' + automation.id + ':' + slot, 'schedule').catch(() => null);
    if (queued && !queued.duplicate) scheduled += 1;
    const interval = Math.max(5, Number(automation.trigger.intervalMinutes) || 60);
    await updateDoc(repo.doc('automations', automation.id), {
      nextRunAt: new Date(Math.max(now, due) + interval * 60000).toISOString(), updatedAt: new Date().toISOString(),
    }).catch(() => {});
  }
  const waiting = await getDocs(query(repo.collection('automation_runs'), where('status', '==', 'waiting'), limit(Math.max(10, batchSize * 4))));
  for (const item of waiting.docs) {
    const run = item.data() as any;
    if (Date.parse(String(run.resumeAt || '')) <= now) {
      await updateDoc(repo.doc('automation_runs', run.id), { status: 'queued', resumeAt: null, updatedAt: new Date().toISOString() }).catch(() => {});
    }
  }
  const waitingEvents = await getDocs(query(repo.collection('automation_runs'), where('status', '==', 'waiting_event'), limit(150)));
  for (const item of waitingEvents.docs) {
    const run = item.data() as any;
    if (Date.parse(String(run.waitUntil || '')) <= now) await releaseEventTimeout(ctx, run).catch(() => {});
  }
  const queued = await getDocs(query(repo.collection('automation_runs'), where('status', '==', 'queued'), limit(Math.max(1, batchSize))));
  for (const item of queued.docs) {
    await processRunStep(ctx, item.data() as any).catch(async (error: any) => {
      await updateDoc(repo.doc('automation_runs', item.id), {
        status: 'failed', error: cleanText(error?.message || 'Automation worker failed.', 700),
        failedAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      }).catch(() => {});
    });
    processed += 1;
  }
  return { scheduled, processed };
}
async function testAutomation(ctx: TenantContext, automationId: string, body: any): Promise<any> {
  const automation = await getAutomation(ctx, automationId);
  const definition = await getDefinition(ctx, automation);
  const payload = asObject(body?.payload);
  if (!Object.keys(payload).length) throw new Error('Paste a sample JSON event to test the workflow mappings.');
  const safe = safePayload(payload);
  const missing = missingMappings(definition, safe);
  if (automation.endpointId) {
    await updateDoc(repoFor(ctx).doc('automation_endpoints', automation.endpointId), {
      lastTestAt: new Date().toISOString(), testStatus: missing.length ? 'needs_mapping' : 'mapping_passed',
      lastTestFields: Object.keys(safe).slice(0, 50), lastTestPayload: safe, updatedAt: new Date().toISOString(),
    });
  }
  return {
    passed: missing.length === 0, fields: Object.keys(safe), missingMappings: missing,
    note: 'Dry run only. No email, WhatsApp message or CRM update was executed.',
  };
}
async function updateWorkflow(ctx: TenantContext, automationId: string, body: any, req: any): Promise<any> {
  if (ctx.role === 'member') throw Object.assign(new Error('Only workspace admins can edit workflow definitions.'), { status: 403 });
  const automation = await getAutomation(ctx, automationId);
  if (automation.status === 'active') throw Object.assign(new Error('Pause the automation before editing it.'), { status: 409 });
  const current = await getDefinition(ctx, automation);
  const definition = normalizeDefinition(body?.workflow);
  if (definition.trigger.type !== current.trigger.type) throw new Error('Changing the trigger type requires a new automation so its endpoint can be provisioned safely.');
  if (definition.trigger.type === 'webhook') definition.trigger.endpointId = automation.endpointId;
  const version = Number(automation.currentVersion || 1) + 1;
  const versionDocId = automation.id + '_v' + version;
  const hash = definitionHash(definition);
  const now = new Date().toISOString();
  await createDoc(repoFor(ctx).doc('automation_versions', versionDocId), {
    id: versionDocId, automationId, version, definition, hash, createdAt: now, createdBy: ctx.uid,
  });
  await updateDoc(repoFor(ctx).doc('automations', automationId), {
    name: definition.name, description: definition.description, trigger: definition.trigger,
    status: 'draft', currentVersion: version, currentVersionDocId: versionDocId, currentHash: hash,
    activationApprovalId: null, activatedAt: null, activatedBy: null, nextRunAt: null, updatedAt: now,
  });
  await cancelPendingRuns(ctx, automationId);
  if (automation.endpointId) {
    await updateDoc(repoFor(ctx).doc('automation_endpoints', automation.endpointId), {
      status: 'draft', lastTestAt: null, testStatus: 'not_tested', lastTestFields: [], lastTestPayload: null, updatedAt: now,
    });
    await updateDoc(globalAutomationWebhookRouteDoc(automation.endpointId), { status: 'draft', updatedAt: now });
  }
  const updated = {
    ...automation, name: definition.name, description: definition.description, trigger: definition.trigger,
    status: 'draft', currentVersion: version, currentVersionDocId: versionDocId, currentHash: hash,
    activationApprovalId: null, nextRunAt: null, updatedAt: now,
  };
  await writeTenantAuditEvent(ctx, {
    action: 'AUTOMATION_VERSION_UPDATED', module: 'AI_ENGINE',
    description: 'A new immutable workflow version was saved; previous approval was invalidated.',
    target: { type: 'Automation', id: automationId, name: definition.name },
    metadata: { version, stepCount: definition.steps.length },
  });
  return automationView(ctx, updated, req);
}
async function activateAutomation(ctx: TenantContext, automationId: string, body: any, req: any): Promise<any> {
  if (ctx.role === 'member') throw Object.assign(new Error('Only workspace admins can activate automations.'), { status: 403 });
  if (body?.confirm !== true) throw Object.assign(new Error('Explicit activation confirmation is required.'), { status: 400 });
  const automation = await getAutomation(ctx, automationId);
  if (automation.status === 'active') return automationView(ctx, automation, req);
  const definition = await getDefinition(ctx, automation);
  const repo = repoFor(ctx);
  const limits = await getEffectiveLimits(ctx.tenantId);
  const active = await getDocs(query(repo.collection('automations'), where('status', '==', 'active'), limit(500)));
  const maxActive = Number(limits.activeAutomations ?? 10);
  if (maxActive >= 0 && active.size >= maxActive) throw Object.assign(new Error('This workspace has reached its active automation limit.'), { status: 402 });
  if (definition.trigger.type === 'webhook') {
    const snap = await getDoc(repo.doc('automation_endpoints', String(automation.endpointId || '')));
    if (!snap.exists()) throw new Error('Webhook endpoint is missing.');
    const endpoint = snap.data() as any;
    if (!endpoint.lastTestAt || endpoint.testStatus !== 'passed_signed') {
      throw Object.assign(new Error('Send a correctly signed provider test webhook after validating the field mappings before activation.'), { status: 409 });
    }
  }
  const now = new Date().toISOString();
  const approvalId = 'approval_' + randomUUID().replace(/-/g, '');
  await createDoc(repo.doc('automation_approvals', approvalId), {
    id: approvalId, automationId, workflowVersion: automation.currentVersion,
    workflowHash: automation.currentHash, approvedBy: ctx.uid, approvedAt: now,
    status: 'approved', explicitConfirmation: true,
  });
  const patch: Record<string, any> = {
    status: 'active', activatedAt: now, activatedBy: ctx.uid,
    activationApprovalId: approvalId, activatedVersion: automation.currentVersion, updatedAt: now,
  };
  if (definition.trigger.type === 'schedule') {
    patch.nextRunAt = new Date(Date.now() + (Number(definition.trigger.intervalMinutes) || 60) * 60000).toISOString();
  }
  await updateDoc(repo.doc('automations', automationId), patch);
  try {
    if (automation.endpointId) {
      await updateDoc(repo.doc('automation_endpoints', automation.endpointId), { status: 'active', updatedAt: now });
      await updateDoc(globalAutomationWebhookRouteDoc(automation.endpointId), { status: 'active', updatedAt: now });
    }
  } catch (error) {
    await updateDoc(repo.doc('automations', automationId), { status: 'draft', nextRunAt: null, activationApprovalId: null, updatedAt: new Date().toISOString() }).catch(() => {});
    await updateDoc(repo.doc('automation_approvals', approvalId), { status: 'revoked', revokedAt: new Date().toISOString() }).catch(() => {});
    if (automation.endpointId) {
      await updateDoc(repo.doc('automation_endpoints', automation.endpointId), { status: 'draft' }).catch(() => {});
      await updateDoc(globalAutomationWebhookRouteDoc(automation.endpointId), { status: 'draft' }).catch(() => {});
    }
    throw error;
  }
  await writeTenantAuditEvent(ctx, {
    action: 'AUTOMATION_ACTIVATED', module: 'AI_ENGINE',
    description: 'Workspace admin explicitly activated a reviewed, version-bound automation.',
    target: { type: 'Automation', id: automationId, name: automation.name },
    metadata: { workflowVersion: automation.currentVersion, status: 'active' },
  });
  return automationView(ctx, { ...automation, ...patch }, req);
}
async function changeAutomationState(ctx: TenantContext, automationId: string, body: any, req: any, resume: boolean): Promise<any> {
  if (ctx.role === 'member') throw Object.assign(new Error('Only workspace admins can change activation.'), { status: 403 });
  if (body?.confirm !== true) throw Object.assign(new Error('Explicit confirmation is required.'), { status: 400 });
  const automation = await getAutomation(ctx, automationId);
  const now = new Date().toISOString();
  const status = resume ? 'active' : 'paused';
  const patch: Record<string, any> = { status, updatedAt: now };
  if (resume) {
    const snap = await getDoc(repoFor(ctx).doc('automation_approvals', String(automation.activationApprovalId || '')));
    const approval = snap.exists() ? snap.data() as any : null;
    if (!approval || approval.status !== 'approved' || approval.workflowHash !== automation.currentHash ||
        Number(approval.workflowVersion) !== Number(automation.currentVersion)) {
      throw new Error('The previous approval does not match this workflow version. Save and approve a new version.');
    }
    if (automation.trigger?.type === 'schedule') {
      const definition = await getDefinition(ctx, automation);
      patch.nextRunAt = new Date(Date.now() + (Number(definition.trigger.intervalMinutes) || 60) * 60000).toISOString();
    }
  } else {
    patch.nextRunAt = null;
    await cancelPendingRuns(ctx, automationId);
  }
  await updateDoc(repoFor(ctx).doc('automations', automationId), patch);
  if (automation.endpointId) {
    await updateDoc(repoFor(ctx).doc('automation_endpoints', automation.endpointId), { status, updatedAt: now });
    await updateDoc(globalAutomationWebhookRouteDoc(automation.endpointId), { status, updatedAt: now });
  }
  await writeTenantAuditEvent(ctx, {
    action: resume ? 'AUTOMATION_RESUMED' : 'AUTOMATION_PAUSED', module: 'AI_ENGINE',
    description: resume ? 'Workspace admin resumed an approved automation.' : 'Workspace admin paused an automation.',
    target: { type: 'Automation', id: automationId, name: automation.name }, metadata: { status },
  });
  return automationView(ctx, { ...automation, ...patch }, req);
}
async function manualRun(ctx: TenantContext, automationId: string, body: any): Promise<any> {
  const automation = await getAutomation(ctx, automationId);
  if (automation.status !== 'active') throw new Error('Activate the automation before running it.');
  const definition = await getDefinition(ctx, automation);
  if (definition.trigger.type !== 'manual') throw new Error('This automation is not configured for manual runs.');
  return createRun(ctx, automation, safePayload(asObject(body?.payload)), 'manual:' + ctx.uid + ':' + randomUUID(), 'manual');
}
async function listAutomations(ctx: TenantContext, req: any): Promise<any[]> {
  const snap = await getDocs(query(repoFor(ctx).collection('automations'), limit(100)));
  const items = await Promise.all(snap.docs.map(async (item) => automationView(ctx, item.data() as any, req).catch(() => item.data())));
  return items.filter((item) => item.status !== 'deleted').sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
}
async function listRuns(ctx: TenantContext, automationId: string): Promise<any[]> {
  await getAutomation(ctx, automationId);
  const repo = repoFor(ctx);
  const snap = await getDocs(query(repo.collection('automation_runs'), where('automationId', '==', automationId), limit(100)));
  const runs = snap.docs.map((item) => item.data() as any)
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
    .slice(0, 50);
  return Promise.all(runs.map(async (run) => {
    const steps = await getDocs(query(repo.collection('automation_run_steps'), where('runId', '==', run.id), limit(50))).catch(() => null);
    return {
      id: run.id, status: run.status, source: run.source, workflowVersion: run.workflowVersion,
      stepIndex: run.stepIndex, createdAt: run.createdAt, completedAt: run.completedAt,
      resumeAt: run.resumeAt || run.waitUntil, error: run.error,
      eventPreview: Object.keys(asObject(run.eventPayload)).slice(0, 12),
      steps: steps ? steps.docs.map((item) => {
        const data = item.data() as any;
        return { stepId: data.stepId, type: data.type, status: data.status, result: data.result, error: data.error, startedAt: data.startedAt, completedAt: data.completedAt };
      }).sort((a, b) => String(a.startedAt || '').localeCompare(String(b.startedAt || ''))) : [],
    };
  }));
}
export async function handleAutomationApi(req: any, res: any, ctx: TenantContext, body: any, url: string): Promise<boolean> {
  const send = (status: number, payload: any) => {
    res.statusCode = status;
    res.end(JSON.stringify(payload));
    return true;
  };
  if (!isFirebaseConfigured) return send(503, { success: false, error: 'Workspace storage is not configured.' });
  try {
    await requireFeature(ctx.tenantId, 'automations');
    if (url === '/api/automations' && req.method === 'GET') return send(200, { success: true, automations: await listAutomations(ctx, req) });
    if (url === '/api/automations/generate' && req.method === 'POST') {
      const prompt = cleanText(body?.prompt, 6000);
      if (!prompt) return send(400, { success: false, error: 'Describe the outcome you want to automate.' });
      if (ctx.role === 'member') return send(403, { success: false, error: 'Only workspace admins can create automations.' });
      const draft = await createDraft(ctx, req, prompt);
      return send(201, { success: true, ...draft });
    }
    const match = url.match(/^\/api\/automations\/([A-Za-z0-9_-]{8,100})(?:\/(.*))?$/);
    if (!match) return send(404, { success: false, error: 'Automation route not found.' });
    const automationId = match[1];
    const action = match[2] || '';
    if (!action && req.method === 'GET') return send(200, { success: true, automation: await automationView(ctx, await getAutomation(ctx, automationId), req) });
    if (!action && req.method === 'PATCH') return send(200, { success: true, automation: await updateWorkflow(ctx, automationId, body, req) });
    if (action === 'runs' && req.method === 'GET') return send(200, { success: true, runs: await listRuns(ctx, automationId) });
    if (action === 'test' && req.method === 'POST') return send(200, { success: true, test: await testAutomation(ctx, automationId, body) });
    if (action === 'credentials' && req.method === 'POST') return send(201, { success: true, credential: await saveCredential(ctx, automationId, body) });
    if (action === 'webhook-secret' && req.method === 'POST') return send(200, { success: true, webhook: await configureWebhookSecret(ctx, automationId, body) });
    if (action === 'activate' && req.method === 'POST') return send(200, { success: true, automation: await activateAutomation(ctx, automationId, body, req) });
    if (action === 'pause' && req.method === 'POST') return send(200, { success: true, automation: await changeAutomationState(ctx, automationId, body, req, false) });
    if (action === 'resume' && req.method === 'POST') return send(200, { success: true, automation: await changeAutomationState(ctx, automationId, body, req, true) });
    if (action === 'run' && req.method === 'POST') return send(202, { success: true, run: await manualRun(ctx, automationId, body) });
    if (req.method === 'DELETE' && !action) {
      if (ctx.role === 'member') return send(403, { success: false, error: 'Only workspace admins can remove automations.' });
      const automation = await getAutomation(ctx, automationId);
      await cancelPendingRuns(ctx, automationId);
      const now = new Date().toISOString();
      await updateDoc(repoFor(ctx).doc('automations', automationId), { status: 'deleted', updatedAt: now, nextRunAt: null });
      if (automation.endpointId) {
        await updateDoc(repoFor(ctx).doc('automation_endpoints', automation.endpointId), { status: 'deleted', updatedAt: now });
        await updateDoc(globalAutomationWebhookRouteDoc(automation.endpointId), { status: 'deleted', updatedAt: now });
      }
      return send(200, { success: true });
    }
    return send(404, { success: false, error: 'Automation action not found.' });
  } catch (error: any) {
    return send(Number(error?.status) || 400, { success: false, error: cleanText(error?.message || 'Automation request failed.', 700) });
  }
}
