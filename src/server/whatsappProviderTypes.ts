/**
 * Provider-neutral WhatsApp domain contracts.
 *
 * Provider adapters translate their vendor-specific APIs and webhook payloads into
 * these types. Domain services must not depend directly on Meta, Twilio or WATI SDKs.
 */

export const WHATSAPP_PROVIDERS = ['META', 'TWILIO', 'WATI'] as const;
export type WhatsAppProvider = (typeof WHATSAPP_PROVIDERS)[number];

export type WhatsAppConnectionStatus =
  | 'PENDING_VERIFICATION'
  | 'CONNECTED'
  | 'DISCONNECTED'
  | 'ERROR'
  | 'REAUTH_REQUIRED';

export type WhatsAppWebhookStatus = 'PENDING' | 'ACTIVE' | 'ERROR' | 'DISABLED';

export type WhatsAppMessageStatus =
  | 'ACCEPTED'
  | 'SENT'
  | 'DELIVERED'
  | 'READ'
  | 'FAILED'
  | 'UNKNOWN';

export interface WhatsAppCapabilities {
  textMessages: boolean;
  templates: boolean;
  media: boolean;
  interactiveMessages: boolean;
  inboundWebhooks: boolean;
  deliveryUpdates: boolean;
  readUpdates: boolean;
  templateSync: boolean;
  automaticWebhookSetup: boolean;
  historicalSync: boolean;
}

export interface WhatsAppSender {
  /** Canonical E.164 phone number, e.g. +919876543210. */
  phoneNumber: string;
  /** Provider-specific sender identifier (phone number ID, channel ID, etc.). */
  providerSenderId: string;
  providerAccountId?: string;
  displayName?: string;
  verifiedName?: string;
}

export interface WhatsAppProviderValidation {
  valid: boolean;
  providerAccountId?: string;
  accountName?: string;
  senders: WhatsAppSender[];
  capabilities: WhatsAppCapabilities;
  validatedAt: string;
  warnings?: string[];
}

export interface WhatsAppProviderConnection {
  connectionId: string;
  tenantId: string;
  provider: WhatsAppProvider;
  displayName: string;
  status: WhatsAppConnectionStatus;
  sender: WhatsAppSender;
  providerAccountId?: string;
  capabilities: WhatsAppCapabilities;
  webhook: {
    routeId: string;
    status: WhatsAppWebhookStatus;
    lastEventAt?: string;
    lastError?: string;
    subscriptionId?: string;
  };
  credentialsRef: string;
  createdAt: string;
  updatedAt: string;
  connectedAt?: string;
  disconnectedAt?: string;
}

export type WhatsAppProviderCredentials = Record<string, string>;

export interface WhatsAppProviderTemplate {
  providerTemplateId: string;
  name: string;
  language: string;
  category?: string;
  status: string;
  components: Array<Record<string, unknown>>;
  updatedAt?: string;
  customParams?: Array<Record<string, unknown>>;
}

export interface WhatsAppMediaReference {
  url?: string;
  providerMediaId?: string;
  mimeType?: string;
  fileName?: string;
  caption?: string;
}

export interface WhatsAppSendTextInput {
  recipientPhone: string;
  sender: WhatsAppSender;
  text: string;
  providerConversationId?: string;
  clientMessageId?: string;
}

export interface WhatsAppSendTemplateInput {
  recipientPhone: string;
  sender: WhatsAppSender;
  template: WhatsAppProviderTemplate;
  variables: Record<string, string>;
  clientMessageId?: string;
}

export interface WhatsAppSendMediaInput {
  recipientPhone: string;
  sender: WhatsAppSender;
  media: WhatsAppMediaReference;
  providerConversationId?: string;
  clientMessageId?: string;
}

export interface WhatsAppSendResult {
  providerMessageId: string;
  status: WhatsAppMessageStatus;
  acceptedAt: string;
  providerStatus?: string;
}

export interface WhatsAppWebhookRequest {
  method: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
  rawBody?: Buffer | string;
  body: unknown;
}

export interface WhatsAppInboundMessageEvent {
  kind: 'INBOUND_MESSAGE';
  provider: WhatsAppProvider;
  connectionId: string;
  providerMessageId: string;
  providerConversationId?: string;
  senderPhone: string;
  businessPhone: string;
  messageType: string;
  text?: string;
  media?: WhatsAppMediaReference[];
  senderName?: string;
  timestamp: string;
}

export interface WhatsAppMessageStatusEvent {
  kind: 'MESSAGE_STATUS';
  provider: WhatsAppProvider;
  connectionId: string;
  providerMessageId: string;
  status: WhatsAppMessageStatus;
  timestamp: string;
  errorCode?: string;
  errorMessage?: string;
}

export type NormalizedWhatsAppEvent =
  | WhatsAppInboundMessageEvent
  | WhatsAppMessageStatusEvent;

/**
 * Provider adapters are transport-only. They must not write CRM records,
 * generate AI responses or decide tenant ownership.
 */
export interface WhatsAppProviderAdapter {
  readonly provider: WhatsAppProvider;
  readonly capabilities: WhatsAppCapabilities;

  validateCredentials(
    credentials: WhatsAppProviderCredentials
  ): Promise<WhatsAppProviderValidation>;

  sendText(
    credentials: WhatsAppProviderCredentials,
    input: WhatsAppSendTextInput
  ): Promise<WhatsAppSendResult>;

  sendTemplate(
    credentials: WhatsAppProviderCredentials,
    input: WhatsAppSendTemplateInput
  ): Promise<WhatsAppSendResult>;

  sendMedia(
    credentials: WhatsAppProviderCredentials,
    input: WhatsAppSendMediaInput
  ): Promise<WhatsAppSendResult>;

  listTemplates(
    credentials: WhatsAppProviderCredentials,
    sender: WhatsAppSender
  ): Promise<WhatsAppProviderTemplate[]>;

  verifyWebhook(
    request: WhatsAppWebhookRequest,
    credentials: WhatsAppProviderCredentials
  ): Promise<boolean>;

  normalizeWebhook(
    request: WhatsAppWebhookRequest,
    connectionId: string,
    sender?: WhatsAppSender
  ): Promise<NormalizedWhatsAppEvent[]>;

  registerWebhook?(
    credentials: WhatsAppProviderCredentials,
    callbackUrl: string,
    statusCallbackUrl?: string
  ): Promise<{ subscriptionId?: string; status: WhatsAppWebhookStatus }>;

  deleteWebhook?(
    credentials: WhatsAppProviderCredentials,
    subscriptionId: string
  ): Promise<void>;
}
