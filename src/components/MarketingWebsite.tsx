import React, { useEffect } from 'react';
import {
  AboutPage,
  ContactPage,
  PricingPage,
  SiteFooter,
  SiteHeader,
} from './LandingPage';
import {
  AIAgentMarketingPage,
  CampaignBuilderMarketingPage,
  CapabilityPage,
  CrmMarketingPage,
  FaqMarketingPage,
  HomeMarketingPage,
  HowItWorksMarketingPage,
  UnifiedInboxMarketingPage,
} from './MarketingPages';
import './MarketingWebsite.css';

const PAGE_META: Record<string, { title: string; description: string }> = {
  '/': {
    title: 'AI Growth Workspace for Leads, Conversations & Campaigns',
    description: 'Capture leads, manage customer conversations, use AI assistance, run Email and WhatsApp campaigns, organise your CRM and coordinate follow-ups in one connected workspace.',
  },
  '/platform': {
    title: 'The Complete AI Growth Workspace',
    description: 'Explore the Amaavigo platform: lead capture, Unified Inbox, AI Agent, CRM, campaigns, scheduling, integrations and reporting.',
  },
  '/ai-agent': {
    title: 'AI Agent for Customer Conversations & Sales Workflows',
    description: 'See how the Amaavigo AI Agent can assist with conversations, lead qualification, campaign preparation and connected sales workflows.',
  },
  '/ai-agents': {
    title: 'AI Agent for Customer Conversations & Sales Workflows',
    description: 'See how the Amaavigo AI Agent can assist with conversations, lead qualification, campaign preparation and connected sales workflows.',
  },
  '/unified-inbox': {
    title: 'Unified Inbox for WhatsApp, Instagram, Messenger & Email',
    description: 'Bring supported customer conversations into one inbox with AI assistance, team ownership and customer context.',
  },
  '/campaigns': {
    title: 'Email, WhatsApp & SMS Campaign Builder',
    description: 'Create branded email, WhatsApp and SMS campaigns with reusable templates, previews and connected follow-up workflows.',
  },
  '/whatsapp': {
    title: 'WhatsApp Campaigns & Template Studio',
    description: 'Explore WhatsApp campaign previews, interactive templates and connected customer engagement workflows.',
  },
  '/crm': {
    title: 'CRM & Lead Pipeline Management',
    description: 'Organise leads, conversations, ownership, pipeline stages, activities and next steps in the Amaavigo workspace.',
  },
  '/lead-capture': {
    title: 'Lead Capture Forms, Website Chat & Enquiries',
    description: 'Capture enquiries from website forms, connected channels and imported lead sources in one workspace.',
  },
  '/demo-scheduling': {
    title: 'Scheduling & Meeting Coordination',
    description: 'Coordinate meeting availability, booking links, reminders and customer follow-through.',
  },
  '/analytics': {
    title: 'Campaign Analytics & Sales Reporting',
    description: 'Understand campaign activity, customer engagement, pipeline progress and connected sales outcomes.',
  },
  '/integrations': {
    title: 'Connected Channels & Integrations',
    description: 'Explore supported messaging channels, business mailboxes, calendars, website forms and API/webhook connections.',
  },
  '/solutions': {
    title: 'Solutions for Sales, Marketing & Customer Teams',
    description: 'Explore connected lead-to-revenue workflows for sales teams, marketing teams, customer operations and agencies.',
  },
  '/pricing': {
    title: 'Amaavigo Plans & Pricing',
    description: 'Compare current Amaavigo plans, capabilities and usage allowances from the live platform catalogue.',
  },
  '/resources': {
    title: 'Amaavigo Resources, Guides & Product Updates',
    description: 'Explore guides, use cases, product information and practical ideas for connected customer engagement.',
  },
  '/how-it-works': {
    title: 'How Amaavigo Connects the Customer Journey',
    description: 'See how lead capture, conversations, qualification, scheduling, campaigns and reporting work together.',
  },
  '/faqs': {
    title: 'Amaavigo Frequently Asked Questions',
    description: 'Answers about Amaavigo channels, AI assistance, CRM, campaigns, integrations and pricing.',
  },
  '/about': {
    title: 'About Amaavigo',
    description: 'Learn about Amaavigo and its connected workspace for customer conversations, sales and growth.',
  },
  '/contact': {
    title: 'Contact Amaavigo & Book a Product Demo',
    description: 'Talk with the Amaavigo team about your lead capture, customer conversations, campaigns and sales workflows.',
  },
  '/book-demo': {
    title: 'Book an Amaavigo Product Demo',
    description: 'Request a product walkthrough of the Amaavigo workspace.',
  },
};

function updateMeta(selector: string, attribute: string, value: string) {
  let element = document.querySelector(selector) as HTMLMetaElement | null;
  if (!element) {
    element = document.createElement('meta');
    if (selector.includes('property=')) element.setAttribute('property', selector.match(/property="([^"]+)"/)?.[1] || '');
    else if (selector.includes('name=')) element.name = selector.match(/name="([^"]+)"/)?.[1] || '';
    document.head.appendChild(element);
  }
  element.setAttribute(attribute, value);
}

export const MarketingWebsite: React.FC = () => {
  const pathname = typeof window !== 'undefined'
    ? (window.location.pathname.replace(/\/+$/, '').toLowerCase() || '/')
    : '/';

  useEffect(() => {
    const meta = PAGE_META[pathname] || PAGE_META['/'];
    document.title = meta.title + ' | Amaavigo';
    updateMeta('meta[name="description"]', 'content', meta.description);
    updateMeta('meta[property="og:title"]', 'content', meta.title + ' | Amaavigo');
    updateMeta('meta[property="og:description"]', 'content', meta.description);
    updateMeta('meta[property="og:url"]', 'content', window.location.href);
    updateMeta('meta[name="twitter:title"]', 'content', meta.title + ' | Amaavigo');
    updateMeta('meta[name="twitter:description"]', 'content', meta.description);
    let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.appendChild(canonical);
    }
    canonical.href = window.location.origin + pathname;
  }, [pathname]);

  let page: React.ReactNode;
  if (pathname === '/') page = <HomeMarketingPage />;
  else if (pathname === '/pricing') page = <PricingPage />;
  else if (pathname === '/ai-agent' || pathname === '/ai-agents') page = <AIAgentMarketingPage />;
  else if (pathname === '/unified-inbox') page = <UnifiedInboxMarketingPage />;
  else if (pathname === '/campaigns' || pathname === '/whatsapp') {
    page = <CampaignBuilderMarketingPage initialTab={pathname === '/whatsapp' ? 'whatsapp' : 'email'} />;
  } else if (pathname === '/crm') page = <CrmMarketingPage />;
  else if (pathname === '/lead-capture') page = <CapabilityPage kind="capture" path={pathname} />;
  else if (pathname === '/demo-scheduling') page = <CapabilityPage kind="schedule" path={pathname} />;
  else if (pathname === '/analytics') page = <CapabilityPage kind="analytics" path={pathname} />;
  else if (pathname === '/integrations') page = <CapabilityPage kind="integrations" path={pathname} />;
  else if (pathname === '/platform') page = <CapabilityPage kind="platform" path={pathname} />;
  else if (pathname === '/solutions') page = <CapabilityPage kind="solutions" path={pathname} />;
  else if (pathname === '/resources') page = <CapabilityPage kind="resources" path={pathname} />;
  else if (pathname === '/how-it-works') page = <HowItWorksMarketingPage />;
  else if (pathname === '/faqs') page = <FaqMarketingPage />;
  else if (pathname === '/about') page = <AboutPage />;
  else if (pathname === '/contact' || pathname === '/book-demo') page = <ContactPage />;
  else page = <HomeMarketingPage />;

  return (
    <div className="av-site avx-site-shell">
      <SiteHeader pathname={pathname} />
      {page}
      <SiteFooter />
    </div>
  );
};

export default MarketingWebsite;
