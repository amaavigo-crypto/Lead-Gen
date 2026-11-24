export type ActiveTab =
  | 'dashboard'
  | 'inbox'
  | 'campaigns'
  | 'email-design-studio'
  | 'crm'
  | 'lead-scoring'
  | 'scheduling'
  | 'knowledge'
  | 'playground'
  | 'audit-logs'
  | 'settings'
  | 'auto-followup'
  | 'database'
  | 'campaign-reports'
  | 'workspace'
  | 'company-profile'
  | 'agent'
  | 'social-studio';

export type AuditModule =
  | 'CAMPAIGNS'
  | 'CRM'
  | 'INBOX'
  | 'KNOWLEDGE'
  | 'SETTINGS'
  | 'AUTH'
  | 'SCHEDULING'
  | 'AI_ENGINE'
  | 'SYSTEM';

export type AuditSeverity = 'INFO' | 'WARNING' | 'CRITICAL' | 'SECURITY';

export interface AuditActor {