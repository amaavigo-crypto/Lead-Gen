import type { Channel } from '../types/index.js';
import type { TenantContext } from '../types/tenant.js';
import {
  detectDemoSchedulingIntent,
  getSchedulingStateKey,
  hasPendingSchedulingState,
  processSchedulingConversationTurn,
  runWithSchedulingCtx,
} from './demoSchedulingService.js';

type SchedulingLeadContext = {
  leadId?: string;
  contactId?: string;
  leadName?: string;
  leadEmail?: string;
  leadPhone?: string;
  companyName?: string;
  channel: Channel;
  campaignId?: string;
  conversationId?: string;
};

export async function tryHandleInboundDemoScheduling(params: {
  ctx: TenantContext;
  messageText: string;
  leadContext: SchedulingLeadContext;
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
}): Promise<any | null> {
  const messageText = String(params.messageText || '').trim();
  if (!messageText) return null;

  const leadContext = params.leadContext;
  const hasIntent = detectDemoSchedulingIntent(messageText);
  const containsEmail = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(messageText);
  const couldBeSchedulingFollowUp =
    messageText.length <= 300 &&
    (containsEmail || /\b(yes|yeah|yep|sure|okay|ok|no|nope|works|perfect|great|sounds good|that works|let'?s do it|monday|tuesday|wednesday|thursday|friday|saturday|sunday|today|tomorrow|morning|afternoon|evening|option|slot)\b|\b\d{1,2}(?::\d{2})?\s*(am|pm)?\b/i.test(messageText));
  const stateKeyOverride = leadContext.channel === 'EMAIL'
    ? undefined
    : getSchedulingStateKey({
        leadPhone: leadContext.leadPhone,
        conversationId: leadContext.conversationId,
        leadId: leadContext.leadId,
      });
  const hasPendingState = hasIntent || !couldBeSchedulingFollowUp
    ? false
    : await runWithSchedulingCtx(params.ctx, () =>
        hasPendingSchedulingState({
          messageText,
          leadEmail: leadContext.leadEmail,
          leadPhone: leadContext.leadPhone,
          conversationId: leadContext.conversationId,
          leadId: leadContext.leadId,
          stateKeyOverride: stateKeyOverride || undefined,
        })
      );

  if (!hasIntent && !hasPendingState) return null;

  return runWithSchedulingCtx(params.ctx, () =>
    processSchedulingConversationTurn({
      automated: true,
      messageText,
      conversationHistory: params.conversationHistory || [],
      leadContext,
      schedulingStateKeyOverride: stateKeyOverride,
    })
  );
}
