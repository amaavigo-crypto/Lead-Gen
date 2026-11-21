import {
  WHATSAPP_PROVIDERS,
  type WhatsAppProvider,
  type WhatsAppProviderAdapter,
} from './whatsappProviderTypes.js';

export class WhatsAppProviderAdapterUnavailableError extends Error {
  readonly statusCode = 503;

  constructor(provider: WhatsAppProvider) {
    super(`The ${provider} WhatsApp adapter is not installed in this release.`);
    this.name = 'WhatsAppProviderAdapterUnavailableError';
  }
}

const adapters = new Map<WhatsAppProvider, WhatsAppProviderAdapter>();

/** Register an adapter during server startup. Duplicate provider registrations fail closed. */
export function registerWhatsAppProviderAdapter(adapter: WhatsAppProviderAdapter): void {
  if (!WHATSAPP_PROVIDERS.includes(adapter.provider)) {
    throw new Error(`Unsupported WhatsApp provider: ${String(adapter.provider)}`);
  }

  const existing = adapters.get(adapter.provider);
  if (existing && existing !== adapter) {
    throw new Error(`A WhatsApp adapter is already registered for ${adapter.provider}.`);
  }

  adapters.set(adapter.provider, adapter);
}

/** Resolve an adapter only when it has been registered by the server runtime. */
export function getWhatsAppProviderAdapter(provider: WhatsAppProvider): WhatsAppProviderAdapter {
  const adapter = adapters.get(provider);
  if (!adapter) throw new WhatsAppProviderAdapterUnavailableError(provider);
  return adapter;
}

export function hasWhatsAppProviderAdapter(provider: WhatsAppProvider): boolean {
  return adapters.has(provider);
}

export function listRegisteredWhatsAppProviders(): WhatsAppProvider[] {
  return [...adapters.keys()];
}
