import crypto from 'crypto';
import { getDoc, getDocs, limit, orderByDocumentId, query, setDoc, where } from './adminFirestore.js';
import { tenantRepo } from './tenantRepo.js';
import type { TenantContext } from '../types/tenant.js';

const MAX_IMPORT_ROWS = 2000;

export interface ConsumerProfile {
  customerId: string;
  contactId?: string;
  name: string;
  email?: string;
  normalizedEmail?: string;
  phone?: string;
  normalizedPhone?: string;
  companyName?: string;
  country?: string;
  city?: string;
  website?: string;
  productInterest?: string;
  serviceInterest?: string;
  customerStatus: 'ACTIVE' | 'INACTIVE';
  customerSince: string;
  lastPurchaseAt?: string;
  source?: string;
  sourceLeadIds: string[];
  purchaseHistory: Array<{
    leadId: string;
    product?: string;
    service?: string;
    purchasedAt: string;
    status: 'WON';
  }>;
  createdAt: string;
  updatedAt: string;
}

function clean(value: unknown, max = 500): string {
  return String(value ?? '').replace(/\u0000/g, '').trim().slice(0, max);
}
function emailKey(value: unknown): string {
  return clean(value, 320).toLowerCase();
}
function phoneKey(value: unknown): string {
  return clean(value, 80).replace(/\D/g, '');
}
function hash(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}
function displayName(contact: any, fallback = ''): string {
  const name = [contact?.firstName, contact?.lastName].map((part) => clean(part, 100)).filter(Boolean).join(' ');
  return name || clean(contact?.name || fallback, 200);
}

async function findExistingProfile(ctx: TenantContext, input: {
  customerId?: string; contactId?: string; normalizedEmail?: string; normalizedPhone?: string;
}): Promise<{ id: string; data: Record<string, any> } | null> {
  const repo = tenantRepo(ctx);
  if (input.customerId) {
    const byId = await getDoc(repo.consumerProfileDoc(input.customerId));
    if (byId.exists()) return { id: input.customerId, data: byId.data() as Record<string, any> };
  }
  const lookups: Array<[string, string]> = [];
  if (input.contactId) lookups.push(['contactId', input.contactId]);
  if (input.normalizedEmail) lookups.push(['normalizedEmail', input.normalizedEmail]);
  if (input.normalizedPhone) lookups.push(['normalizedPhone', input.normalizedPhone]);
  for (const [field, value] of lookups) {
    const snap = await getDocs(query(repo.consumerProfiles(), where(field, '==', value), limit(1)));
    if (!snap.empty) return { id: snap.docs[0].id, data: snap.docs[0].data() as Record<string, any> };
  }
  return null;
}

export async function upsertConsumerProfile(ctx: TenantContext, input: Record<string, unknown>): Promise<{
  profile: ConsumerProfile; created: boolean;
}> {
  const name = clean(input.name || [input.firstName, input.lastName].filter(Boolean).join(' '), 200);
  const email = emailKey(input.email);
  const phone = clean(input.phone || input.mobile, 80);
  const phoneDigits = phoneKey(phone);
  const normalizedPhone = phoneDigits.length >= 7 ? phoneDigits : '';
  const contactId = clean(input.contactId, 160);
  if (!name) throw new Error('Customer name is required.');
  if (!email && !normalizedPhone && !contactId) throw new Error('Add a valid email address or a phone number with at least 7 digits to identify this customer.');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Customer email address is invalid.');

  const normalizedEmail = email;
  const existing = await findExistingProfile(ctx, { contactId, normalizedEmail, normalizedPhone });
  const identity = normalizedEmail ? 'email:' + normalizedEmail
    : normalizedPhone ? 'phone:' + normalizedPhone : 'contact:' + contactId;
  const customerId = existing?.id || ('cus_' + hash(identity).slice(0, 32));
  const now = new Date().toISOString();
  const previous = existing?.data || {};
  const sourceLeadId = clean(input.sourceLeadId || input.leadId, 160);
  const sourceLeadIds = Array.isArray(previous.sourceLeadIds) ? previous.sourceLeadIds.map(String) : [];
  if (sourceLeadId && !sourceLeadIds.includes(sourceLeadId)) sourceLeadIds.push(sourceLeadId);

  const purchaseHistory = Array.isArray(previous.purchaseHistory) ? previous.purchaseHistory.slice(-99) : [];
  const purchasedAt = clean(input.purchasedAt || input.customerSince || now, 80);
  if (sourceLeadId && !purchaseHistory.some((item: any) => String(item?.leadId || '') === sourceLeadId)) {
    purchaseHistory.push({
      leadId: sourceLeadId,
      product: clean(input.productInterest || input.product, 200) || undefined,
      service: clean(input.serviceInterest || input.service, 200) || undefined,
      purchasedAt,
      status: 'WON' as const,
    });
  }

  const profile: ConsumerProfile = {
    customerId,
    ...(contactId ? { contactId } : previous.contactId ? { contactId: String(previous.contactId) } : {}),
    name,
    ...(email ? { email, normalizedEmail } : previous.email ? { email: previous.email, normalizedEmail: previous.normalizedEmail } : {}),
    ...(phone ? { phone, normalizedPhone } : previous.phone ? { phone: previous.phone, normalizedPhone: previous.normalizedPhone } : {}),
    ...(clean(input.companyName || input.company, 200) ? { companyName: clean(input.companyName || input.company, 200) } : previous.companyName ? { companyName: previous.companyName } : {}),
    ...(clean(input.country, 120) ? { country: clean(input.country, 120) } : previous.country ? { country: previous.country } : {}),
    ...(clean(input.city, 120) ? { city: clean(input.city, 120) } : previous.city ? { city: previous.city } : {}),
    ...(clean(input.website, 300) ? { website: clean(input.website, 300) } : previous.website ? { website: previous.website } : {}),
    ...(clean(input.productInterest || input.product, 200) ? { productInterest: clean(input.productInterest || input.product, 200) } : previous.productInterest ? { productInterest: previous.productInterest } : {}),
    ...(clean(input.serviceInterest || input.service, 200) ? { serviceInterest: clean(input.serviceInterest || input.service, 200) } : previous.serviceInterest ? { serviceInterest: previous.serviceInterest } : {}),
    customerStatus: String(input.customerStatus || previous.customerStatus || 'ACTIVE').toUpperCase() === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
    customerSince: String(previous.customerSince || input.customerSince || purchasedAt || now),
    ...(sourceLeadId ? { lastPurchaseAt: purchasedAt } : previous.lastPurchaseAt ? { lastPurchaseAt: previous.lastPurchaseAt } : {}),
    source: clean(input.source || previous.source || (sourceLeadId ? 'CRM_WON' : 'MANUAL_IMPORT'), 80),
    sourceLeadIds,
    purchaseHistory,
    createdAt: String(previous.createdAt || now),
    updatedAt: now,
  };
  await setDoc(tenantRepo(ctx).consumerProfileDoc(customerId), profile, { merge: true });
  return { profile, created: !existing };
}

export async function listConsumerProfiles(ctx: TenantContext, search = ''): Promise<ConsumerProfile[]> {
  const term = clean(search, 120).toLowerCase();
  const snap = await getDocs(query(tenantRepo(ctx).consumerProfiles(), orderByDocumentId(), limit(1000)));
  return snap.docs
    .map((doc) => ({ ...(doc.data() as ConsumerProfile), customerId: doc.id }))
    .filter((profile) => !term || [
      profile.name, profile.email, profile.phone, profile.companyName, profile.productInterest,
      profile.serviceInterest, profile.customerStatus,
    ].some((value) => String(value || '').toLowerCase().includes(term)))
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
}

export async function importConsumerRows(ctx: TenantContext, rows: Array<Record<string, unknown>>): Promise<{
  received: number; added: number; updated: number; invalid: number;
}> {
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('No customer rows were supplied.');
  if (rows.length > MAX_IMPORT_ROWS) throw new Error('Import is limited to ' + MAX_IMPORT_ROWS + ' rows per file.');
  let added = 0;
  let updated = 0;
  let invalid = 0;
  for (const row of rows) {
    try {
      const result = await upsertConsumerProfile(ctx, { ...row, source: row.source || 'MANUAL_IMPORT' });
      if (result.created) added++; else updated++;
    } catch {
      invalid++;
    }
  }
  return { received: rows.length, added, updated, invalid };
}

/** Creates/updates a customer profile only after the authoritative CRM lead is marked CLOSED_WON. */
export async function promoteWonLeadToConsumer(ctx: TenantContext, leadIdValue: string): Promise<ConsumerProfile> {
  const leadId = clean(leadIdValue, 160);
  if (!leadId) throw new Error('Lead ID is required.');
  const repo = tenantRepo(ctx);
  const leadSnap = await getDoc(repo.leadDoc(leadId));
  if (!leadSnap.exists()) throw new Error('CRM lead was not found.');
  const lead = leadSnap.data() as Record<string, any>;
  if (String(lead.status || '').toUpperCase() !== 'CLOSED_WON') {
    throw new Error('Only a CRM lead marked Won can be promoted to the Consumer Database.');
  }
  const contactId = clean(lead.contactId, 160);
  if (!contactId) throw new Error('The Won lead does not have a linked contact.');
  const contactSnap = await getDoc(repo.contactDoc(contactId));
  if (!contactSnap.exists()) throw new Error('The CRM contact linked to this Won lead was not found.');
  const contact = contactSnap.data() as Record<string, any>;
  const now = new Date().toISOString();
  const profileResult = await upsertConsumerProfile(ctx, {
    contactId,
    name: displayName(contact),
    email: contact.email,
    phone: contact.phone,
    companyName: contact.companyName,
    country: contact.country || lead.country,
    city: contact.city || lead.city,
    website: contact.website || lead.website,
    productInterest: lead.productInterest,
    serviceInterest: lead.serviceInterest,
    source: 'CRM_WON',
    sourceLeadId: leadId,
    purchasedAt: lead.updatedAt || now,
  });
  return profileResult.profile;
}
