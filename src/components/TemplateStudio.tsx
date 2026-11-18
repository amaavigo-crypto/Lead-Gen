import React, { useEffect, useState } from 'react';
import { Image as ImageIcon, LayoutTemplate, Mail, MessageCircle } from 'lucide-react';
import { EmailDesignStudio } from './EmailDesignStudio';
import { WhatsAppTemplatesPanel } from './WhatsAppTemplatesPanel';
import { CompanyAssetsPanel } from './CompanyAssetsPanel';
import { ModuleShell, ModuleCard, ModuleChips } from './ModulePage';

export type TemplateStudioSection = 'conversation' | 'campaign' | 'website-thankyou' | 'whatsapp' | 'assets';

type Props = {
  tenantId: string;
  canManageWhatsAppTemplates?: boolean;
  initialView?: TemplateStudioSection;
  initialTemplateId?: string;
};

const SECTIONS: Array<{ id: TemplateStudioSection; label: string; description: string; icon: React.ReactNode }> = [
  { id: 'conversation', label: 'Conversation & AI', description: 'Branded designs for inbox emails and AI replies.', icon: <Mail className="h-4 w-4" /> },
  { id: 'campaign', label: 'Campaign Emails', description: 'Complete personalized emails for outbound campaigns.', icon: <LayoutTemplate className="h-4 w-4" /> },
  { id: 'website-thankyou', label: 'Website Form Thank-you', description: 'Tenant-owned acknowledgement emails for website form submissions.', icon: <Mail className="h-4 w-4" /> },
  { id: 'whatsapp', label: 'WhatsApp Templates', description: 'Utility and marketing templates submitted to Meta.', icon: <MessageCircle className="h-4 w-4" /> },
  { id: 'assets', label: 'Company Assets', description: 'Reusable company logos, images, banners and video cards.', icon: <ImageIcon className="h-4 w-4" /> },
];

export const TemplateStudio: React.FC<Props> = ({
  tenantId,
  canManageWhatsAppTemplates = false,
  initialView = 'conversation',
  initialTemplateId,
}) => {
  const [section, setSection] = useState<TemplateStudioSection>(initialView);
  const [pendingTemplateId, setPendingTemplateId] = useState<string | undefined>(initialTemplateId);
  const [visitedSections, setVisitedSections] = useState<Set<TemplateStudioSection>>(() => new Set([initialView]));

  useEffect(() => {
    setSection(initialView);
    setPendingTemplateId(initialTemplateId);
    setVisitedSections((current) => new Set([...current, initialView]));
  }, [initialView, initialTemplateId]);

  useEffect(() => {
    const onGlobalSearchResult = (event: Event) => {
      const detail = (event as CustomEvent<any>).detail;
      if (!detail || detail.module !== 'email-design-studio') return;
      if (detail.recordType === 'whatsapp-template') {
        setPendingTemplateId(undefined);
        setSection('whatsapp');
        setVisitedSections((current) => new Set([...current, 'whatsapp']));
        return;
      }
      const purpose = String(detail.subtitle || '').toLowerCase().includes('campaign') ? 'campaign' : 'conversation';
      setPendingTemplateId(String(detail.recordId || ''));
      setSection(purpose);
      setVisitedSections((current) => new Set([...current, purpose]));
    };
    window.addEventListener('umrah360:global-search-result', onGlobalSearchResult);
    return () => window.removeEventListener('umrah360:global-search-result', onGlobalSearchResult);
  }, []);

  const changeSection = (next: TemplateStudioSection) => {
    if (section === 'campaign' && next !== 'campaign') setPendingTemplateId(undefined);
    setVisitedSections((current) => new Set([...current, next]));
    setSection(next);
  };

  return (
    <ModuleShell
      moduleId="template-studio"
      icon={LayoutTemplate}
      title="Template Studio"
      badge="Marketing"
      subtitle="Create and manage branded communication templates from one workspace."
      eyebrow="Marketing / Template studio"
    >
    <div className="mp-inner space-y-6">
      <ModuleCard
        title={SECTIONS.find((item) => item.id === section)?.label || 'Templates'}
        description={SECTIONS.find((item) => item.id === section)?.description}
        chips={
          <ModuleChips
            label="Template workspace sections"
            active={section}
            onChange={(id) => changeSection(id as TemplateStudioSection)}
            chips={SECTIONS.map((item) => ({ id: item.id, label: item.label, icon: item.icon }))}
          />
        }
      />

      {visitedSections.has('conversation') && <div className={section === 'conversation' ? 'block' : 'hidden'} aria-hidden={section !== 'conversation'}>
        <EmailDesignStudio tenantId={tenantId} purpose="conversation" initialTemplateId={pendingTemplateId} />
      </div>}
      {visitedSections.has('campaign') && <div className={section === 'campaign' ? 'block' : 'hidden'} aria-hidden={section !== 'campaign'}>
        <EmailDesignStudio tenantId={tenantId} purpose="campaign" initialTemplateId={pendingTemplateId} />
      </div>}
      {visitedSections.has('website-thankyou') && <div className={section === 'website-thankyou' ? 'block' : 'hidden'} aria-hidden={section !== 'website-thankyou'}>
        <EmailDesignStudio tenantId={tenantId} purpose="website-thankyou" initialTemplateId={pendingTemplateId} />
      </div>}
      {visitedSections.has('whatsapp') && <div className={section === 'whatsapp' ? 'block' : 'hidden'} aria-hidden={section !== 'whatsapp'}>
        <WhatsAppTemplatesPanel canEdit={canManageWhatsAppTemplates} />
      </div>}
      {visitedSections.has('assets') && <div className={section === 'assets' ? 'block' : 'hidden'} aria-hidden={section !== 'assets'}>
        <CompanyAssetsPanel />
      </div>}
    </div>
    </ModuleShell>
  );
};
