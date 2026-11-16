import { randomUUID } from 'crypto';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { recordAiCompletionUsage } from './usageService.js';

/**
 * Gemini fallback for when OpenAI is unavailable (exhausted quota, invalid key, outage, unknown model).
 *
 * Environment:
 *   GEMINI_API_KEY (or GOOGLE_API_KEY)   required for the fallback to run
 *   AI_FALLBACK_MODEL_ID                 optional, defaults to gemini-3.8-flash
 *   AI_FALLBACK_SECONDARY_MODEL_ID       optional, defaults to gemini-3.1-flash-lite (used when the first
 *                                        Gemini model is rate limited, e.g. free-tier daily limit reached)
 *
 * Image generation has no fallback: it uses OpenAI only.
 */
export const GEMINI_FALLBACK_MODEL = (process.env.AI_FALLBACK_MODEL_ID || 'gemini-3.8-flash').trim();
export const GEMINI_SECONDARY_FALLBACK_MODEL = (process.env.AI_FALLBACK_SECONDARY_MODEL_ID || 'gemini-3.1-flash-lite').trim();

/** Gemini models to try, in order (duplicates and blanks removed). */
export function geminiFallbackModels(): string[] {
  return [...new Set([GEMINI_FALLBACK_MODEL, GEMINI_SECONDARY_FALLBACK_MODEL].filter(Boolean))];
}

/**
 * Gemini 3 validates thought signatures on function calls in the current turn. Function calls that were
 * produced by another model (OpenAI, before the fallback) have none, so they carry Google's documented
 * placeholder that skips that validation.
 */
const FOREIGN_THOUGHT_SIGNATURE = 'skip_thought_signature_validator';

export function getGeminiApiKey(): string {
  // Tolerate values pasted with surrounding quotes or whitespace (a common env-var mistake).
  return (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '').trim().replace(/^['"]+|['"]+$/g, '').trim();
}

export function isGeminiConfigured(): boolean {
  return Boolean(getGeminiApiKey());
}

let cachedClient: { key: string; client: GoogleGenAI } | null = null;
export function getGeminiClient(): GoogleGenAI {
  const key = getGeminiApiKey();
  if (!key) throw new Error('Gemini fallback is not configured (GEMINI_API_KEY is missing).');
  if (!cachedClient || cachedClient.key !== key) cachedClient = { key, client: new GoogleGenAI({ apiKey: key }) };
  return cachedClient.client;
}

/**
 * Short, readable description of a provider error (never includes keys or payloads). Gemini errors arrive as a
 * JSON string such as {"error":{"code":400,"message":"API key not valid...","status":"INVALID_ARGUMENT"}};
 * the inner message is extracted so the user sees the actual reason.
 */
export function describeAiError(err: any): string {
  const rawStatus = err?.status ?? err?.statusCode ?? err?.response?.status ?? err?.error?.code ?? err?.code;
  const numericStatus = Number(rawStatus);
  let status: string | number | undefined = Number.isFinite(numericStatus)
    ? (numericStatus >= 100 && numericStatus <= 599 ? numericStatus : undefined)
    : rawStatus ? String(rawStatus) : undefined;
  let message = String(err?.error?.message || err?.message || err || 'unknown error');
  const jsonStart = message.indexOf('{');
  if (jsonStart >= 0) {
    try {
      const parsed = JSON.parse(message.slice(jsonStart));
      const inner = parsed?.error || parsed;
      if (inner?.message) message = String(inner.message);
      if (inner?.code && !status) status = inner.code;
    } catch {
      // not JSON; keep the raw message
    }
  }
  message = message.replace(/\s+/g, ' ').trim();
  if (/api key not valid|api_key_invalid|api key expired|permission_denied.*api key|api key.*(missing|invalid)/i.test(message)) {
    message += ' Check GEMINI_API_KEY in the server environment (create a key at aistudio.google.com/apikey).';
  }
  message = message.slice(0, 220);
  return status ? `${status}: ${message}` : message;
}

function errorStatus(err: any): number {
  const raw = err?.status ?? err?.statusCode ?? err?.response?.status ?? err?.error?.code ?? err?.code;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 100 && n <= 599 ? n : 0;
}

function errorText(err: any): string {
  return [err?.name, err?.code, err?.type, err?.error?.code, err?.error?.type, err?.error?.status,
    err?.message, err?.error?.message, err?.cause?.name, err?.cause?.message]
    .filter(Boolean).map(String).join(' ').toLowerCase();
}

/**
 * True when an OpenAI failure means "OpenAI cannot serve this right now", so the Gemini fallback should take
 * over: no credits / quota, invalid or revoked key, rate limit, unknown model, server error, timeout or network
 * failure. Requests that OpenAI rejected for their content (other 4xx) are not retried on another provider.
 */
export function isOpenAiFallbackError(err: any): boolean {
  const status = errorStatus(err);
  const text = errorText(err);
  if (/insufficient_quota|exceeded your current quota|billing|quota|rate.?limit|model_not_found|does not exist|invalid_api_key|incorrect api key|timeout|timed out|econnreset|econnrefused|enotfound|etimedout|socket hang up|fetch failed|network/.test(text)) return true;
  if (!status) return /connection|abort/.test(text) || err?.name === 'APIConnectionError' || err?.name === 'APIConnectionTimeoutError';
  return status === 401 || status === 402 || status === 403 || status === 404 || status === 408 || status === 409 || status === 429 || status >= 500;
}

/** True when the next Gemini model should be tried: quota, transient service, network, abort, or timeout errors. */
export function isGeminiNextModelError(err: any): boolean {
  const status = errorStatus(err);
  const text = errorText(err);
  return status === 408 || status === 425 || status === 429 || status === 404 ||
    status === 500 || status === 502 || status === 503 || status === 504 ||
    /resource_exhausted|quota|rate.?limit|unavailable|overloaded|not found|not supported|aborterror|operation was aborted|request aborted|aborted|requesttimeout|timed out|timeout|deadline exceeded|econnreset|etimedout|socket hang up|fetch failed/.test(text);
}

// ---------------------------------------------------------------------------------------------------------------
// Simple text / JSON completion (fallback for generateOpenAICompletion)
// ---------------------------------------------------------------------------------------------------------------

export interface GeminiTextOptions {
  systemPrompt?: string;
  userPrompt: string;
  jsonMode?: boolean;
  maxTokens?: number;
  temperature?: number;
  tenantId?: string;
  usageFeature?: string;
}

export async function generateGeminiText(options: GeminiTextOptions): Promise<string> {
  const ai = getGeminiClient();
  const models = geminiFallbackModels();
  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    try {
      const response: any = await ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts: [{ text: options.userPrompt }] }],
        config: {
          ...(options.systemPrompt ? { systemInstruction: options.systemPrompt } : {}),
          ...(options.jsonMode ? { responseMimeType: 'application/json' } : {}),
          // Thinking tokens share the output budget, so keep thinking light and leave room for the answer.
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          maxOutputTokens: Math.max(4096, (options.maxTokens ?? 1000) * 3),
        },
      });
      if (options.tenantId) {
        await recordAiCompletionUsage(options.tenantId, response, model, 'gemini', options.usageFeature || 'unclassified').catch(() => {});
      }
      const text = String(response?.text || '').trim();
      if (!text) throw new Error('Gemini returned an empty response.');
      return text;
    } catch (err) {
      if (i < models.length - 1 && isGeminiNextModelError(err)) continue;
      throw err;
    }
  }
  throw new Error('No Gemini fallback model is configured.');
}

// ---------------------------------------------------------------------------------------------------------------
// Agent support: convert OpenAI Responses-API tools and conversation items to Gemini format
// ---------------------------------------------------------------------------------------------------------------

/** OpenAI Responses function tools -> Gemini function declarations. Built-in OpenAI tools (web_search) are skipped. */
export function toGeminiFunctionDeclarations(tools: any[]): any[] {
  return tools
    .filter((tool) => tool?.type === 'function' && tool?.name)
    .map((tool) => ({
      name: String(tool.name),
      description: String(tool.description || ''),
      parametersJsonSchema: tool.parameters || { type: 'object', properties: {} },
    }));
}

function dataUrlToInlineData(dataUrl: string): { mimeType: string; data: string } | null {
  const match = /^data:([^;,]+)(?:;[^,]*)?;base64,(.*)$/s.exec(String(dataUrl || ''));
  return match ? { mimeType: match[1], data: match[2] } : null;
}

function contentToParts(content: any): any[] {
  if (typeof content === 'string') return content ? [{ text: content }] : [];
  if (!Array.isArray(content)) return [];
  const parts: any[] = [];
  for (const part of content) {
    if (!part) continue;
    if ((part.type === 'input_text' || part.type === 'output_text' || part.type === 'text') && part.text) {
      parts.push({ text: String(part.text) });
    } else if (part.type === 'input_image') {
      const inline = dataUrlToInlineData(part.image_url);
      if (inline) parts.push({ inlineData: inline });
    } else if (part.type === 'input_file') {
      const inline = dataUrlToInlineData(part.file_data);
      if (inline) parts.push({ inlineData: inline });
      else if (part.filename) parts.push({ text: `[Attached file: ${part.filename}]` });
    }
  }
  return parts;
}

function parseJsonObject(raw: any): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(String(raw ?? ''));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : { result: parsed };
  } catch {
    return { result: String(raw ?? '') };
  }
}

/**
 * Converts the agent's OpenAI Responses `input` array (system message, history, current user message and any
 * function calls / outputs already exchanged this turn) into a Gemini system instruction and contents.
 */
export function openAiInputToGemini(
  input: any[],
  /** Thought signatures of function calls Gemini produced itself (call_id -> signature, or null if it gave none). */
  geminiSignatures: Map<string, string | null> = new Map(),
): { systemInstruction: string; contents: any[] } {
  const systemParts: string[] = [];
  const contents: Array<{ role: 'user' | 'model'; parts: any[] }> = [];
  const callNames = new Map<string, string>();

  const push = (role: 'user' | 'model', parts: any[]) => {
    if (!parts.length) return;
    const last = contents[contents.length - 1];
    if (last && last.role === role) last.parts.push(...parts);
    else contents.push({ role, parts: [...parts] });
  };

  for (const item of input) {
    if (!item) continue;
    if (item.role === 'system' || item.role === 'developer') {
      const text = typeof item.content === 'string' ? item.content : contentToParts(item.content).map((p) => p.text || '').join('\n');
      if (text) systemParts.push(text);
      continue;
    }
    if (item.type === 'function_call') {
      const id = String(item.call_id || item.id || '');
      callNames.set(id, String(item.name || ''));
      // Gemini's own calls must go back with the exact signature it returned; calls made by OpenAI get the
      // documented placeholder instead.
      const signature = geminiSignatures.has(id) ? geminiSignatures.get(id) : FOREIGN_THOUGHT_SIGNATURE;
      push('model', [{ functionCall: { id, name: String(item.name || ''), args: parseJsonObject(item.arguments) }, ...(signature ? { thoughtSignature: signature } : {}) }]);
      continue;
    }
    if (item.type === 'function_call_output') {
      const id = String(item.call_id || '');
      push('user', [{ functionResponse: { id, name: callNames.get(id) || 'tool', response: parseJsonObject(item.output) } }]);
      continue;
    }
    if (item.type === 'reasoning' || item.type === 'web_search_call') continue; // OpenAI-internal items
    if (item.type === 'message' || item.role === 'assistant' || item.role === 'user') {
      push(item.role === 'assistant' ? 'model' : 'user', contentToParts(item.content));
    }
  }

  // Gemini expects the conversation to start with a user turn.
  if (contents.length && contents[0].role !== 'user') contents.unshift({ role: 'user', parts: [{ text: '(conversation continues)' }] });
  return { systemInstruction: systemParts.join('\n\n'), contents };
}

// ---------------------------------------------------------------------------------------------------------------
// Agent support: one model step on Gemini, returned in the agent's OpenAI Responses item format
// ---------------------------------------------------------------------------------------------------------------

export interface GeminiAgentStepResult {
  /** New conversation items in OpenAI Responses format (assistant message and/or function_call items). */
  outputItems: any[];
  /** Final answer text when the model called no tools. */
  text: string;
  /** Raw Gemini response, for usage recording. */
  response: any;
}

/**
 * Runs one agent step on Gemini. The agent keeps its conversation in OpenAI Responses format, so the input is
 * converted on the way in and Gemini's answer (text and function calls) is converted back on the way out.
 */
export async function runGeminiAgentStep(options: {
  model: string;
  input: any[];
  tools: any[];
  geminiSignatures: Map<string, string | null>;
  extraSystemInstruction?: string;
  maxOutputTokens?: number;
  /** Abort the call after this many milliseconds (keeps the request inside the hosting time limit). */
  timeoutMs?: number;
}): Promise<GeminiAgentStepResult> {
  const ai = getGeminiClient();
  const { systemInstruction, contents } = openAiInputToGemini(options.input, options.geminiSignatures);
  const functionDeclarations = toGeminiFunctionDeclarations(options.tools);
  const response: any = await ai.models.generateContent({
    model: options.model,
    contents,
    config: {
      systemInstruction: [systemInstruction, options.extraSystemInstruction].filter(Boolean).join('\n\n'),
      ...(functionDeclarations.length ? { tools: [{ functionDeclarations }] } : {}),
      // Low thinking keeps each agent step fast enough for serverless time limits; tool choice and
      // argument quality stay good for this workload.
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      // Thinking shares the output budget; leave plenty of room for tool arguments such as full email HTML.
      maxOutputTokens: options.maxOutputTokens ?? 24000,
      ...(options.timeoutMs && options.timeoutMs > 0
        ? { httpOptions: { timeout: options.timeoutMs, retryOptions: { attempts: 1 } } }
        : {}),
    },
  });

  const candidate = response?.candidates?.[0];
  const parts: any[] = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
  const textParts: string[] = [];
  const outputItems: any[] = [];
  const calls: any[] = [];
  for (const part of parts) {
    if (part?.functionCall?.name) {
      const id = String(part.functionCall.id || 'gem_' + randomUUID());
      options.geminiSignatures.set(id, typeof part.thoughtSignature === 'string' && part.thoughtSignature ? part.thoughtSignature : null);
      calls.push({ type: 'function_call', call_id: id, name: String(part.functionCall.name), arguments: JSON.stringify(part.functionCall.args || {}) });
    } else if (typeof part?.text === 'string' && part.text && part.thought !== true) {
      textParts.push(part.text);
    }
  }
  const text = textParts.join('').trim();
  if (text) outputItems.push({ type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] });
  outputItems.push(...calls);

  if (!outputItems.length) {
    const reason = String(candidate?.finishReason || response?.promptFeedback?.blockReason || 'no content');
    throw Object.assign(new Error('Gemini returned no answer (' + reason + ').'), { geminiEmpty: true, finishReason: reason });
  }
  return { outputItems, text: calls.length ? '' : text, response };
}

// ---------------------------------------------------------------------------------------------------------------
// OpenAI availability memory: after OpenAI fails with "no credits" / invalid key, skip it for a while so every
// request does not first wait for a failing OpenAI call (per server instance).
// ---------------------------------------------------------------------------------------------------------------

let openAiSkipUntil = 0;
let openAiSkipReason = '';

export function noteOpenAiFailure(err: any): void {
  const status = errorStatus(err);
  const text = errorText(err);
  const accountProblem = status === 401 || status === 402 || status === 403 ||
    /insufficient_quota|no credits|exceeded your current quota|billing|invalid_api_key|incorrect api key/.test(text);
  openAiSkipUntil = Date.now() + (accountProblem ? 10 * 60_000 : 60_000);
  openAiSkipReason = describeAiError(err);
}

/** Reason OpenAI should be skipped right now, or '' when it should be tried. */
export function openAiSkipReasonNow(): string {
  return Date.now() < openAiSkipUntil ? openAiSkipReason : '';
}

export function clearOpenAiFailure(): void {
  openAiSkipUntil = 0;
  openAiSkipReason = '';
}
