import React, { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  MessageSquare,
  Bot,
  Users,
  Send,
  QrCode,
  Database,
  BookOpen,
  Building2,
  Lock,
  LogOut,
  Menu,
  X,
} from 'lucide-react';
import { AppUser } from '../types';
import { Umrah360Logo } from './Umrah360Logo';
import { useAgent } from '../context/AgentContext';

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
  | 'workspace'
  | 'settings'
  | 'auto-followup'
  | 'automations'
  | 'audit-logs'
  | 'database'
  | 'campaign-reports'
  | 'qr-studio'
  | 'company-profile'
  | 'agent';

export interface NavbarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  unreadCount: number;
  handoffCount: number;
  isFirebaseActive: boolean;
  currentUser?: AppUser | null;
  onLogout?: () => void;
  planLocked?: (tabId: ActiveTab) => boolean;
}

type PrimaryNavItem = {
  id: string;
  label: string;
  icon: React.ReactNode;
  route: ActiveTab;
  tabs: ActiveTab[];
};

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  unreadCount,
  handoffCount,
  isFirebaseActive,
  currentUser,
  onLogout,
  planLocked,
}) => {
  const [isMobileOpen, setIsMobileOpen] = useState<boolean>(false);
  const { unreadNotificationCount: agentTaskUnreadCount } = useAgent();

  useEffect(() => {
    if (!isMobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsMobileOpen(false);
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [isMobileOpen]);

  const isModuleAccessible = (tabId: ActiveTab): boolean => {
    if (planLocked?.(tabId)) return false;
    if (tabId === 'dashboard' || tabId === 'database' || tabId === 'workspace' || tabId === 'company-profile') return true;
    if (!currentUser) return true;
    if (currentUser.accessLevel === 'ALL' || currentUser.role === 'ADMIN') return true;
    if (tabId === 'email-design-studio' && (currentUser.allowedModules || []).includes('settings')) return true;
    if (tabId === 'lead-scoring') return isModuleAccessible('crm');
    return (currentUser.allowedModules || []).includes(tabId);
  };

  const primaryItems: PrimaryNavItem[] = [
    { id: 'dashboard', label: 'Home', icon: <LayoutDashboard className="h-4 w-4 shrink-0" />, route: 'dashboard', tabs: ['dashboard', 'agent'] },
    { id: 'conversation', label: 'Conversation', icon: <MessageSquare className="h-4 w-4 shrink-0" />, route: 'inbox', tabs: ['inbox'] },
    { id: 'ai', label: 'AI', icon: <Bot className="h-4 w-4 shrink-0" />, route: 'automations', tabs: ['automations', 'auto-followup', 'scheduling', 'playground'] },
    { id: 'sales', label: 'Sales', icon: <Users className="h-4 w-4 shrink-0" />, route: 'crm', tabs: ['crm', 'lead-scoring'] },
    { id: 'marketing', label: 'Marketing', icon: <Send className="h-4 w-4 shrink-0" />, route: 'campaigns', tabs: ['campaigns', 'email-design-studio', 'campaign-reports', 'qr-studio'] },
    { id: 'database', label: 'Database', icon: <Database className="h-4 w-4 shrink-0" />, route: 'database', tabs: ['database'] },
    { id: 'knowledge', label: 'Knowledge Base', icon: <BookOpen className="h-4 w-4 shrink-0" />, route: 'knowledge', tabs: ['knowledge'] },
    { id: 'workspace', label: 'Workspace', icon: <Building2 className="h-4 w-4 shrink-0" />, route: 'workspace', tabs: ['workspace'] },
  ];

  const handleSelectTab = (tabId: ActiveTab) => {
    setActiveTab(tabId);
    setIsMobileOpen(false);
  };

  const isItemActive = (item: PrimaryNavItem) => item.tabs.includes(activeTab);
  const isItemAccessible = (item: PrimaryNavItem) => item.tabs.some((tab) => isModuleAccessible(tab));

  const sidebarContent = (
    <div className="flex h-full w-[56px] shrink-0 flex-col items-center overflow-hidden bg-[#05051f] text-white select-none">
      <div className="flex h-[56px] w-full shrink-0 items-center justify-center border-b border-white/10">
        <button type="button" onClick={() => handleSelectTab('dashboard')} title="Go to Home dashboard" aria-label="Go to Home dashboard" className="flex h-full w-full items-center justify-center transition hover:bg-white/[.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-blue-400">
          <Umrah360Logo size="sm" systemBadge="" showSubtitle={false} lightOnDark compactMark />
        </button>
      </div>
      <nav aria-label="Main modules" className="flex min-h-0 w-full flex-1 flex-col items-center gap-2 overflow-y-auto py-3">
        {primaryItems.map((item) => {
          const active = isItemActive(item);
          const accessible = isItemAccessible(item);
          const badgeCount = item.id === 'conversation' ? unreadCount : item.id === 'dashboard' ? agentTaskUnreadCount : 0;
          return (
            <button key={item.id} type="button" onClick={() => handleSelectTab(item.route)} title={item.label} aria-label={item.label} aria-current={active ? 'page' : undefined}
              className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors ${active ? 'bg-[#0848ef] text-white shadow-[0_3px_10px_rgba(8,72,239,.3)]' : 'text-slate-300 hover:bg-white/10 hover:text-white'} ${!accessible ? 'opacity-45' : ''}`}>
              {item.icon}
              {badgeCount > 0 && (item.id === 'dashboard'
                ? <span title={badgeCount + ' unread AI Agent task notifications'} className="absolute right-1 top-1 h-2 w-2 rounded-full bg-[#7895ff] shadow-[0_0_8px_rgba(120,149,255,.8)] ring-2 ring-[#05051f]" />
                : <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-rose-500 px-1 text-[9px] font-bold leading-4 text-white">{badgeCount > 99 ? '99+' : badgeCount}</span>
              )}
              {!accessible && <Lock className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-[#05051f] text-slate-400" />}
            </button>
          );
        })}
      </nav>
      {onLogout && (
        <div className="flex w-full shrink-0 items-center justify-center border-t border-white/10 py-3">
          <button type="button" onClick={onLogout} title={currentUser ? 'Sign out (' + currentUser.name + ')' : 'Sign out'} aria-label="Sign out"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-300 transition hover:bg-white/10 hover:text-white">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );

  return (
    <>
      <div className="app-mobile-nav sticky top-0 z-30 flex items-center justify-between border-b border-white/10 bg-[#05051f] px-4 py-2.5 text-white shadow-2xs lg:hidden">
        <button type="button" onClick={() => handleSelectTab('dashboard')} title="Go to Home dashboard" aria-label="Go to Home dashboard" className="rounded-md px-1 py-1"><Umrah360Logo size="sm" systemBadge="" showSubtitle={false} lightOnDark compactMark /></button>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && <span className="rounded-full bg-orange-500 px-2 py-0.5 text-[10px] font-bold text-white">{unreadCount}</span>}
          <button type="button" onClick={() => setIsMobileOpen(true)} aria-expanded={isMobileOpen} aria-controls="app-mobile-navigation" className="rounded-xl border border-white/20 p-2 text-white hover:bg-white/10" aria-label="Open navigation">
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </div>

      <aside className="sticky top-0 z-40 hidden h-screen w-[56px] shrink-0 lg:block">
        {sidebarContent}
      </aside>

      {isMobileOpen && (
        <div className="app-mobile-drawer fixed inset-0 z-50 flex lg:hidden" role="presentation">
          <button type="button" aria-label="Close navigation" onClick={() => setIsMobileOpen(false)} className="app-mobile-drawer-backdrop fixed inset-0 bg-slate-950/60 backdrop-blur-[3px]" />
          <aside id="app-mobile-navigation" role="dialog" aria-modal="true" aria-label="Main navigation" className="app-mobile-drawer-panel relative z-10 flex h-full w-[min(320px,88vw)] max-w-full flex-col bg-[#05051f] text-white shadow-2xl">
            <div className="flex min-h-[68px] shrink-0 items-center justify-between border-b border-white/10 px-5">
              <button type="button" onClick={() => handleSelectTab('dashboard')} aria-label="Go to Home dashboard" className="flex items-center">
                <Umrah360Logo size="sm" systemBadge="" showSubtitle={false} lightOnDark compactMark />
              </button>
              <button type="button" onClick={() => setIsMobileOpen(false)} aria-label="Close navigation" className="rounded-xl border border-white/15 p-2 text-slate-300 transition hover:bg-white/10 hover:text-white"><X className="h-5 w-5" /></button>
            </div>
            <div className="border-b border-white/10 px-5 py-4">
              <p className="text-[9px] font-bold uppercase tracking-[.18em] text-blue-300">Workspace navigation</p>
              <p className="mt-1 truncate text-sm font-semibold text-white">{currentUser?.name || currentUser?.email || 'Your workspace'}</p>
            </div>
            <nav aria-label="Main modules" className="app-mobile-drawer-links flex-1 overflow-y-auto px-3 py-3">
              {primaryItems.map((item) => {
                const active = isItemActive(item);
                const accessible = isItemAccessible(item);
                const badgeCount = item.id === 'conversation' ? unreadCount : item.id === 'dashboard' ? agentTaskUnreadCount : 0;
                return (
                  <button key={item.id} type="button" onClick={() => handleSelectTab(item.route)} aria-current={active ? 'page' : undefined}
                    className={'app-mobile-drawer-link flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition ' + (active ? 'bg-[#155eef] text-white shadow-[0_7px_22px_rgba(21,94,239,.22)]' : 'text-slate-300 hover:bg-white/10 hover:text-white') + (!accessible ? ' opacity-50' : '')}>
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/[.07]">{item.icon}</span>
                    <span className="min-w-0 flex-1 text-[13px] font-semibold">{item.label}</span>
                    {badgeCount > 0 && <span className="min-w-6 rounded-full bg-rose-500 px-2 py-1 text-center text-[10px] font-bold text-white">{badgeCount > 99 ? '99+' : badgeCount}</span>}
                    {!accessible && <Lock className="h-3.5 w-3.5 shrink-0 text-slate-500" />}
                  </button>
                );
              })}
            </nav>
            {onLogout && (
              <div className="shrink-0 border-t border-white/10 p-4" style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
                <button type="button" onClick={() => { setIsMobileOpen(false); onLogout(); }} className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-semibold text-slate-300 transition hover:bg-white/10 hover:text-white">
                  <LogOut className="h-4 w-4" /> Sign out
                </button>
              </div>
            )}
          </aside>
        </div>
      )}
    </>
  );
};

export default Navbar;
