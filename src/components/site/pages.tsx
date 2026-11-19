import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight, ArrowUpRight, BarChart3, BookOpen, Bot, Building2, CalendarCheck, Check, Clock3, Database, Facebook, FileText, Filter, Globe, Headphones,
  Inbox, Instagram, Layers, Lock, Mail, Megaphone, MessageCircle, Monitor, Palette, Repeat, ShieldCheck, Smartphone, Sparkles, Target, TrendingUp, UserCheck,
  Users, Workflow, Zap, type LucideIcon,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { RESOURCE_CATEGORIES, RESOURCE_TYPES, type SiteResourcePublic } from '../../shared/siteResources.js';
import { Btn, CountUp, DEMO_URL, EASE, Eyebrow, Marquee, Reveal, SectionHead, Stagger, StaggerItem, TiltCard, Ticks } from './SiteUI';
import {
  AgentMock, AnalyticsMock, BuilderMock, CaptureMock, ChannelIcon, CrmMock, EmailTemplate, FlowMock, InboxMock, OrbitMock, PLATFORM_ITEMS,
  ScheduleMock, WhatsAppPhone, type EmailKind, type WaKind,
} from './mockups';

/* ───────────── shared blocks ───────────── */

type Feature = { icon: LucideIcon; title: string; copy: string };

const FeatureGrid: React.FC<{ items: Feature[] }> = ({ items }) => (
  <Stagger className="sx-feature-grid">
    {items.map((f) => {
      const I = f.icon;
      return (
        <StaggerItem key={f.title}>
          <TiltCard className="sx-feature"><span className="sx-feature-icon"><I size={20} /></span><h3>{f.title}</h3><p>{f.copy}</p></TiltCard>
        </StaggerItem>
      );
    })}
  </Stagger>
);

const CtaBand: React.FC<{ title?: React.ReactNode; accent?: string; copy?: string; secondaryHref?: string; secondary?: string }> = ({
  title = 'Make the next conversation', accent = 'your next customer.', copy = 'See how Amaavigo can bring your leads, conversations and campaigns into one connected workspace.', secondaryHref = '/pricing', secondary = 'Explore plans',
}) => (
  <section className="sx-cta">
    <div className="sx-cta-orb a" /><div className="sx-cta-orb b" />
    <Reveal className="sx-wrap sx-cta-inner">
      <Eyebrow>READY WHEN YOU ARE</Eyebrow>
      <h2>{title}<br /><span className="sx-grad">{accent}</span></h2>
      <p>{copy}</p>
      <div className="sx-actions center"><Btn href={DEMO_URL} external>Book a demo</Btn><Btn href={secondaryHref} variant="ghost">{secondary}</Btn></div>
    </Reveal>
  </section>
);

const Hero: React.FC<{ tag: string; title: React.ReactNode; accent: React.ReactNode; tail?: React.ReactNode; copy: string; bullets?: string[]; visual: React.ReactNode; primary?: { href: string; label: string; external?: boolean }; secondary?: { href: string; label: string } }> = ({
  tag, title, accent, tail, copy, bullets, visual, primary = { href: DEMO_URL, label: 'See it in action', external: true }, secondary = { href: '/pricing', label: 'View plans' },
}) => (
  <section className="sx-hero">
    <div className="sx-hero-bg" aria-hidden="true"><i className="g1" /><i className="g2" /><i className="grid" /></div>
    <div className="sx-wrap sx-hero-grid">
      <div className="sx-hero-copy">
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE }}><Eyebrow>{tag}</Eyebrow></motion.div>
        <motion.h1 initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.08, ease: EASE }}>{title}<br /><span className="sx-grad">{accent}</span>{tail && <><br />{tail}</>}</motion.h1>
        <motion.p initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.18, ease: EASE }}>{copy}</motion.p>
        {bullets && <Ticks items={bullets} />}
        <motion.div className="sx-actions" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.3, ease: EASE }}>
          <Btn href={primary.href} external={primary.external}>{primary.label}</Btn><Btn href={secondary.href} variant="ghost">{secondary.label}</Btn>
        </motion.div>
      </div>
      <motion.div className="sx-hero-visual" initial={{ opacity: 0, y: 34, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 1, delay: 0.2, ease: EASE }}>
        <div className="sx-visual-glow" />{visual}
      </motion.div>
    </div>
  </section>
);

const Steps: React.FC<{ eyebrow: string; title: string; accent: string; steps: { icon: LucideIcon; title: string; copy: string }[] }> = ({ eyebrow, title, accent, steps }) => (
  <section className="sx-section">
    <div className="sx-wrap">
      <SectionHead eyebrow={eyebrow} title={title} accent={accent} />
      <Stagger className="sx-steps" gap={0.14}>
        {steps.map((s, i) => {
          const I = s.icon;
          return (
            <StaggerItem key={s.title} className="sx-step-card">
              <span className="sx-step-n">0{i + 1}</span><span className="sx-step-icon"><I size={22} /></span><h3>{s.title}</h3><p>{s.copy}</p>
              {i < steps.length - 1 && <ArrowRight className="sx-step-arrow" size={18} />}
            </StaggerItem>
          );
        })}
      </Stagger>
    </div>
  </section>
);

const StatBand: React.FC<{ items: { to?: number; suffix?: string; text?: string; label: string }[] }> = ({ items }) => (
  <section className="sx-statband">
    <Stagger className="sx-wrap sx-stat-grid">
      {items.map((s) => (
        <StaggerItem key={s.label} className="sx-stat"><b>{s.to !== undefined ? <CountUp to={s.to} suffix={s.suffix} /> : s.text}</b><small>{s.label}</small></StaggerItem>
      ))}
    </Stagger>
  </section>
);

const Related: React.FC<{ links: { href: string; title: string; copy: string; icon: LucideIcon }[] }> = ({ links }) => (
  <section className="sx-section tight">
    <div className="sx-wrap">
      <SectionHead eyebrow="KEEP EXPLORING" title="Works even better" accent="connected." />
      <Stagger className="sx-related">
        {links.map((l) => {
          const I = l.icon;
          return <StaggerItem key={l.href}><TiltCard as="a" href={l.href} className="sx-related-card"><span><I size={18} /></span><div><b>{l.title}</b><small>{l.copy}</small></div><ArrowUpRight size={16} /></TiltCard></StaggerItem>;
        })}
      </Stagger>
    </div>
  </section>
);

/* ───────────── Campaign showcase ───────────── */

const EMAIL_DESIGNS: { kind: EmailKind; label: string; copy: string }[] = [
  { kind: 'newsletter', label: 'Beautiful newsletters', copy: 'Editorial layouts that make every issue worth reading.' },
  { kind: 'product', label: 'Product announcements', copy: 'Launch emails that show off what is new.' },
  { kind: 'promo', label: 'Promotional campaigns', copy: 'Offers with urgency, codes and clear calls to action.' },
  { kind: 'welcome', label: 'Welcome sequences', copy: 'Warm onboarding journeys that run automatically.' },
];
const WA_DESIGNS: { kind: WaKind; label: string }[] = [
  { kind: 'promo', label: 'Promotional message' }, { kind: 'order', label: 'Order update' }, { kind: 'welcome', label: 'Welcome & booking' },
];

export const CampaignShowcase: React.FC<{ initial?: 'email' | 'whatsapp' }> = ({ initial = 'email' }) => {
  const [tab, setTab] = useState<'email' | 'whatsapp'>(initial);
  const [design, setDesign] = useState(0);
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  return (
    <div className="sx-showcase">
      <div className="sx-showcase-tabs" role="tablist">
        {(['email', 'whatsapp'] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} type="button" className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
            {t === 'email' ? <Mail size={15} /> : <MessageCircle size={15} />}{t === 'email' ? 'Email campaigns' : 'WhatsApp campaigns'}
            {tab === t && <motion.i layoutId="sx-showcase-pill" className="sx-pill-bg" />}
          </button>
        ))}
      </div>
      <AnimatePresence mode="wait">
        {tab === 'email' ? (
          <motion.div key="email" className="sx-showcase-panel" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.4, ease: EASE }}>
            <div className="sx-showcase-list">
              {EMAIL_DESIGNS.map((d, i) => (
                <button key={d.kind} type="button" className={'sx-design-pick ' + (i === design ? 'on' : '')} onClick={() => setDesign(i)}>
                  <span>0{i + 1}</span><div><b>{d.label}</b><small>{d.copy}</small></div>
                  {i === design && <motion.i layoutId="sx-design-bar" className="sx-design-bar" />}
                </button>
              ))}
              <div className="sx-device-toggle">
                <button type="button" className={device === 'desktop' ? 'on' : ''} onClick={() => setDevice('desktop')}><Monitor size={14} />Desktop</button>
                <button type="button" className={device === 'mobile' ? 'on' : ''} onClick={() => setDevice('mobile')}><Smartphone size={14} />Mobile</button>
              </div>
              <ul className="sx-mini-list"><li><Palette size={13} />Drag-and-drop visual builder</li><li><Repeat size={13} />Automated follow-up sequences</li><li><Monitor size={13} />Desktop and mobile previews</li></ul>
            </div>
            <div className={'sx-showcase-stage ' + device}>
              <div className="sx-stage-glow" />
              <AnimatePresence mode="wait">
                <motion.div key={design + device} className={'sx-stage-frame ' + device} initial={{ opacity: 0, y: 24, rotateX: 6, scale: 0.97 }} animate={{ opacity: 1, y: 0, rotateX: 0, scale: 1 }} exit={{ opacity: 0, y: -14, scale: 0.98 }} transition={{ duration: 0.5, ease: EASE }}>
                  {device === 'desktop' && <div className="sx-stage-bar"><span className="sx-dots"><i /><i /><i /></span><small>Inbox · {EMAIL_DESIGNS[design].label}</small></div>}
                  <div className="sx-stage-mail"><EmailTemplate kind={EMAIL_DESIGNS[design].kind} /></div>
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.div>
        ) : (
          <motion.div key="wa" className="sx-showcase-panel wa" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.4, ease: EASE }}>
            <div className="sx-wa-phones">
              {WA_DESIGNS.map((d, i) => (
                <motion.div key={d.kind} className={'sx-wa-col ' + (i === 1 ? 'mid' : '')} initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.1 + i * 0.12, ease: EASE }}>
                  <WhatsAppPhone kind={d.kind} /><small>{d.label}</small>
                </motion.div>
              ))}
            </div>
            <div className="sx-wa-points">
              {[[MessageCircle, 'Professional promotional messages'], [Layers, 'Product cards and media-rich messages'], [Zap, 'Interactive buttons and CTAs'], [ShieldCheck, 'Approved WhatsApp templates'], [Repeat, 'Automated follow-up sequences'], [BarChart3, 'Delivery and engagement reporting']].map(([I, t], i) => {
                const Icon = I as LucideIcon;
                return <motion.div key={t as string} initial={{ opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 + i * 0.07, duration: 0.5, ease: EASE }}><span><Icon size={15} /></span>{t as string}</motion.div>;
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

/* ───────────── HOME ───────────── */

const MARQUEE = [
  { k: 'wa', t: 'WhatsApp' }, { k: 'ig', t: 'Instagram' }, { k: 'fb', t: 'Messenger' }, { k: 'mail', t: 'Gmail' }, { k: 'mail', t: 'Outlook' },
  { k: 'web', t: 'Website chat' }, { k: 'web', t: 'Forms & webhooks' }, { k: 'mail', t: 'Google Calendar' }, { k: 'web', t: 'Microsoft 365' },
] as const;

const CAPS: { icon: LucideIcon; title: string; copy: string; href: string; wide?: boolean }[] = [
  { icon: Inbox, title: 'Unified Inbox', copy: 'WhatsApp, Instagram, Messenger, email and website chats in one shared view.', href: '/unified-inbox', wide: true },
  { icon: Bot, title: 'AI Agent', copy: 'Answers, qualifies and follows up — with you in control.', href: '/ai-agent' },
  { icon: Megaphone, title: 'Campaign Builder', copy: 'Beautiful email and WhatsApp campaigns.', href: '/campaigns' },
  { icon: Users, title: 'Built-in CRM', copy: 'Pipeline, activities and AI lead scores.', href: '/crm' },
  { icon: Globe, title: 'Lead capture', copy: 'Forms, widgets and chatbots that feed your pipeline.', href: '/lead-capture' },
  { icon: CalendarCheck, title: 'Scheduling', copy: 'Turn intent into booked meetings automatically.', href: '/demo-scheduling', wide: true },
];

const SCENARIOS = [
  { icon: Building2, tag: 'Service businesses', title: 'Every enquiry answered, even at midnight', copy: 'Website and WhatsApp enquiries get an instant, on-brand reply, are scored by AI, and land with the right person to follow up.' },
  { icon: Megaphone, tag: 'Marketing teams', title: 'From campaign send to booked call', copy: 'Replies from email and WhatsApp campaigns flow straight into the inbox and pipeline — no copy-pasting between tools.' },
  { icon: Layers, tag: 'Agencies', title: 'Many clients, one organised workspace', copy: 'Keep each client’s brand, conversations, templates and reporting separate and tidy, with team roles that fit.' },
];

export const HomePage: React.FC = () => (
  <main className="sx-page sx-home">
    {/* 1 · hero */}
    <section className="sx-hero home">
      <div className="sx-hero-bg" aria-hidden="true"><i className="g1" /><i className="g2" /><i className="grid" /></div>
      <div className="sx-wrap sx-hero-grid">
        <div className="sx-hero-copy">
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE }}><Eyebrow>The AI-powered lead-to-revenue platform</Eyebrow></motion.div>
          <motion.h1 initial={{ opacity: 0, y: 26 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.85, delay: 0.08, ease: EASE }}>Capture leads,<br />run conversations,<br />book more meetings<br />and <span className="sx-grad">grow revenue.</span></motion.h1>
          <motion.p initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.2, ease: EASE }}>All your sales, marketing and customer conversations in one AI-powered workspace.</motion.p>
          <motion.div className="sx-actions" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.32, ease: EASE }}>
            <Btn href={DEMO_URL} external>See Amaavigo in action</Btn><Btn href="/how-it-works" variant="ghost">How it works</Btn>
          </motion.div>
          <motion.div className="sx-trust" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6, duration: 0.8 }}>
            <span><ShieldCheck size={14} />Human control built in</span><span><Zap size={14} />One connected journey</span>
          </motion.div>
        </div>
        <motion.div className="sx-hero-visual" initial={{ opacity: 0, y: 40, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 1.1, delay: 0.22, ease: EASE }}>
          <div className="sx-visual-glow" />
          <div className="sx-float-chips"><ChannelIcon kind="wa" size={18} /><ChannelIcon kind="ig" size={18} /><ChannelIcon kind="fb" size={18} /><ChannelIcon kind="mail" size={18} /></div>
          <InboxMock />
          <motion.div className="sx-notify" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 1.2, duration: 0.7, ease: EASE }}>
            <span><Sparkles size={14} /></span><div><b>AI response prepared</b><small>Ready for review</small></div>
          </motion.div>
        </motion.div>
      </div>
    </section>

    {/* 2 · social proof / channel strip */}
    <section className="sx-proof">
      <p>Connects with the channels and tools your customers already use</p>
      <Marquee>{MARQUEE.map((m, i) => <span className="sx-proof-item" key={m.t + i}><ChannelIcon kind={m.k} size={14} />{m.t}</span>)}</Marquee>
    </section>

    {/* 3 · platform overview */}
    <section className="sx-section">
      <div className="sx-wrap">
        <SectionHead eyebrow="PLATFORM OVERVIEW" title="Every step from first touch" accent="to the next customer." copy="One workspace for the whole journey — so nothing slips between tools." />
        <Stagger className="sx-bento">
          {CAPS.map((c) => {
            const I = c.icon;
            return (
              <StaggerItem key={c.title} className={c.wide ? 'wide' : ''}>
                <TiltCard as="a" href={c.href} className="sx-bento-card"><span className="sx-feature-icon"><I size={20} /></span><h3>{c.title}</h3><p>{c.copy}</p><em>Explore <ArrowUpRight size={13} /></em></TiltCard>
              </StaggerItem>
            );
          })}
        </Stagger>
      </div>
    </section>

    {/* 4 · AI conversations */}
    <section className="sx-section alt">
      <div className="sx-wrap sx-split">
        <Reveal className="sx-split-copy">
          <Eyebrow>AI-POWERED CONVERSATIONS</Eyebrow>
          <h2>Tell it what needs to happen.<br /><span className="sx-grad">Watch it get done.</span></h2>
          <p>Your AI Agent answers questions, qualifies leads and prepares campaigns and follow-ups from a single instruction — and never sends anything without your approval.</p>
          <ul className="sx-check-list"><li><Check size={14} />Natural, on-brand replies from your own knowledge</li><li><Check size={14} />Lead qualification and meeting intent detection</li><li><Check size={14} />Human handoff the moment it matters</li></ul>
          <Btn href="/ai-agent" variant="ghost">Meet the AI Agent</Btn>
        </Reveal>
        <Reveal className="sx-split-visual" delay={0.1}><div className="sx-visual-glow soft" /><AgentMock /></Reveal>
      </div>
    </section>

    {/* 5 · campaign showcase */}
    <section className="sx-section">
      <div className="sx-wrap">
        <SectionHead eyebrow="EMAIL + WHATSAPP CAMPAIGNS" title="Make every message" accent="feel worth opening." copy="See the quality of campaigns you can create — newsletters, launches, promotions and WhatsApp messages, all designed in one place." />
        <Reveal><CampaignShowcase /></Reveal>
        <div className="sx-center-link"><a href="/campaigns">Explore the Campaign Builder <ArrowUpRight size={14} /></a></div>
      </div>
    </section>

    {/* 6 · CRM */}
    <section className="sx-section alt">
      <div className="sx-wrap sx-split reverse">
        <Reveal className="sx-split-visual"><div className="sx-visual-glow soft" /><CrmMock /></Reveal>
        <Reveal className="sx-split-copy" delay={0.1}>
          <Eyebrow>CRM &amp; LEAD MANAGEMENT</Eyebrow>
          <h2>Know where every lead stands.<br /><span className="sx-grad">And what happens next.</span></h2>
          <p>Lead profiles, pipeline stages, activities and AI scores sit right beside the conversation — so your team always has context.</p>
          <ul className="sx-check-list"><li><Check size={14} />Custom pipelines and deal stages</li><li><Check size={14} />AI lead scoring to prioritise follow-up</li><li><Check size={14} />Ownership, reminders and activity history</li></ul>
          <Btn href="/crm" variant="ghost">Explore the CRM</Btn>
        </Reveal>
      </div>
    </section>

    {/* 7 · automation */}
    <section className="sx-section">
      <div className="sx-wrap">
        <SectionHead eyebrow="AUTOMATION WORKFLOW" title="From first enquiry" accent="to booked meeting — automatically." />
        <Reveal><FlowMock /></Reveal>
      </div>
    </section>

    {/* 8 · scheduling */}
    <section className="sx-section alt">
      <div className="sx-wrap sx-split">
        <Reveal className="sx-split-copy">
          <Eyebrow>SCHEDULING &amp; BOOKINGS</Eyebrow>
          <h2>Turn interest into<br /><span className="sx-grad">confirmed meetings.</span></h2>
          <p>Customers pick a time that suits them while your calendar, working hours and meeting links stay in sync. Reminders go out on their own.</p>
          <ul className="sx-check-list"><li><Check size={14} />Google Calendar and Outlook sync</li><li><Check size={14} />Real-time availability</li><li><Check size={14} />Automatic reminders and follow-through</li></ul>
          <Btn href="/demo-scheduling" variant="ghost">Explore scheduling</Btn>
        </Reveal>
        <Reveal className="sx-split-visual" delay={0.1}><div className="sx-visual-glow soft" /><ScheduleMock /></Reveal>
      </div>
    </section>

    {/* 9 · analytics */}
    <section className="sx-section">
      <div className="sx-wrap sx-split reverse">
        <Reveal className="sx-split-visual"><div className="sx-visual-glow soft" /><AnalyticsMock /></Reveal>
        <Reveal className="sx-split-copy" delay={0.1}>
          <Eyebrow>ANALYTICS &amp; REPORTING</Eyebrow>
          <h2>See what drives replies,<br /><span className="sx-grad">bookings and revenue.</span></h2>
          <p>Campaign performance, channel mix, conversion and pipeline progress — connected, so you can double down on what works.</p>
          <ul className="sx-check-list"><li><Check size={14} />Campaign and channel-wise insights</li><li><Check size={14} />Lead and pipeline reporting</li><li><Check size={14} />Team performance tracking</li></ul>
          <Btn href="/analytics" variant="ghost">Explore analytics</Btn>
        </Reveal>
      </div>
    </section>

    {/* 10 · integrations */}
    <section className="sx-section alt">
      <div className="sx-wrap sx-split">
        <Reveal className="sx-split-copy">
          <Eyebrow>INTEGRATIONS</Eyebrow>
          <h2>Plug into the tools<br /><span className="sx-grad">you already use.</span></h2>
          <p>Messaging channels, business mailboxes, calendars, website forms and webhooks all connect to the same workspace.</p>
          <Btn href="/integrations" variant="ghost">See integrations</Btn>
        </Reveal>
        <Reveal className="sx-split-visual orbit" delay={0.1}><OrbitMock /></Reveal>
      </div>
    </section>

    {/* 11 · stories & proof */}
    <section className="sx-section">
      <div className="sx-wrap">
        <SectionHead eyebrow="BUILT AROUND REAL WORKFLOWS" title="Made for teams that live" accent="on conversations." copy="Illustrative examples of how teams use the connected workspace." />
        <Stagger className="sx-scenarios">
          {SCENARIOS.map((s) => {
            const I = s.icon;
            return <StaggerItem key={s.title}><TiltCard className="sx-scenario"><span className="sx-feature-icon"><I size={20} /></span><small>{s.tag}</small><h3>{s.title}</h3><p>{s.copy}</p></TiltCard></StaggerItem>;
          })}
        </Stagger>
        <Stagger className="sx-proof-stats">
          {[['5', 'Connected channels'], ['1', 'Shared customer inbox'], ['24/7', 'AI-assisted replies'], ['100%', 'Agent campaign sends need your approval']].map(([n, l]) => <StaggerItem key={l} className="sx-proof-stat"><b>{n}</b><small>{l}</small></StaggerItem>)}
        </Stagger>
      </div>
    </section>

    {/* 12 · pricing preview */}
    <section className="sx-section alt tight">
      <div className="sx-wrap">
        <Reveal className="sx-price-teaser">
          <div><Eyebrow>PRICING</Eyebrow><h2>Plans that grow<br /><span className="sx-grad">with your team.</span></h2><p>Compare current plans, usage allowances and feature availability — always up to date with the live catalogue.</p><div className="sx-actions"><Btn href="/pricing">Compare plans</Btn><Btn href={DEMO_URL} variant="ghost" external>Talk to us</Btn></div></div>
          <div className="sx-price-art" aria-hidden="true">{[0, 1, 2].map((i) => <motion.i key={i} className={'p' + i} initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.15 * i, duration: 0.7, ease: EASE }} />)}</div>
        </Reveal>
      </div>
    </section>

    {/* 13 · final CTA */}
    <CtaBand title="Your next customer is already" accent="trying to reach you." />
  </main>
);

/* ───────────── Product pages ───────────── */

type ProductConfig = {
  tag: string; title: React.ReactNode; accent: React.ReactNode; tail?: React.ReactNode; copy: string; bullets: string[]; visual: () => React.ReactNode;
  stepsHead: [string, string, string]; steps: { icon: LucideIcon; title: string; copy: string }[]; features: Feature[]; stats: { to?: number; suffix?: string; text?: string; label: string }[];
  related: string[]; cta?: { title: string; accent: string };
};

const RELATED: Record<string, { href: string; title: string; copy: string; icon: LucideIcon }> = {
  inbox: { href: '/unified-inbox', title: 'Unified Inbox', copy: 'Every channel in one place', icon: Inbox },
  agent: { href: '/ai-agent', title: 'AI Agent', copy: 'Automate the busywork', icon: Bot },
  crm: { href: '/crm', title: 'CRM', copy: 'Pipeline and AI scores', icon: Users },
  campaigns: { href: '/campaigns', title: 'Campaign Builder', copy: 'Email and WhatsApp', icon: Megaphone },
  capture: { href: '/lead-capture', title: 'Lead capture', copy: 'Forms and chat widgets', icon: Globe },
  schedule: { href: '/demo-scheduling', title: 'Scheduling', copy: 'Booked meetings, on autopilot', icon: CalendarCheck },
  analytics: { href: '/analytics', title: 'Analytics', copy: 'Engagement to revenue', icon: BarChart3 },
};

const PRODUCTS: Record<string, ProductConfig> = {
  'ai-agent': {
    tag: 'AI Agent', title: 'Your always-on', accent: 'AI sales agent', tail: <>that turns conversations into revenue.</>,
    copy: 'Engage visitors, answer questions, qualify leads, book meetings and follow up — across every channel, with you in control.',
    bullets: ['Natural, context-aware conversations', 'Trained on your own business knowledge', 'Works across WhatsApp, Instagram, Messenger, email and web', 'Never sends campaigns without your approval'],
    visual: () => <AgentMock />, stepsHead: ['HOW IT WORKS', 'One instruction.', 'Connected actions.'],
    steps: [{ icon: MessageCircle, title: 'Tell it what you need', copy: 'Describe the outcome in plain language — a follow-up campaign, a template, a report.' }, { icon: Workflow, title: 'Watch it work', copy: 'The agent reads your data, prepares the work and shows each step as it happens.' }, { icon: UserCheck, title: 'Approve and go', copy: 'Review the draft, adjust it, then confirm. Nothing is sent without your say-so.' }],
    features: [{ icon: MessageCircle, title: 'Natural conversations', copy: 'Human-like, context-aware replies in your brand voice.' }, { icon: Database, title: 'Trained on your business', copy: 'Website, documents and custom knowledge keep answers accurate.' }, { icon: Workflow, title: 'Works across channels', copy: 'One agent for WhatsApp, Instagram, Messenger, email and web chat.' }, { icon: Clock3, title: 'Follow-ups on autopilot', copy: 'Nurture leads until they are ready, then hand over to a human.' }, { icon: ShieldCheck, title: 'Human control built in', copy: 'Approval steps, handoff rules and clear activity records.' }, { icon: TrendingUp, title: 'Measurable results', copy: 'See which conversations turned into bookings and revenue.' }],
    stats: [{ text: '24/7', label: 'Always available' }, { text: '5', label: 'Channels supported' }, { text: '100%', label: 'Approval before sending' }], related: ['inbox', 'crm', 'campaigns'],
  },
  'unified-inbox': {
    tag: 'Unified Inbox', title: 'All your conversations.', accent: 'In one powerful inbox.',
    copy: 'Bring every customer conversation into one place, with AI assistance, clear ownership and the full customer context beside every reply.',
    bullets: ['WhatsApp, Instagram, Messenger, email and website chat', 'AI-suggested replies and intent detection', 'Human handoff and team assignment', 'Complete conversation history'],
    visual: () => <InboxMock />, stepsHead: ['EVERY CHANNEL. ONE VIEW.', 'Respond with context.', 'Keep every opportunity moving.'],
    steps: [{ icon: Inbox, title: 'Everything arrives together', copy: 'Messages from every connected channel land in one shared inbox.' }, { icon: Sparkles, title: 'AI prepares the reply', copy: 'Suggested answers and intent detection save your team the typing.' }, { icon: Users, title: 'The right person takes over', copy: 'Assign, hand off and keep notes — the context follows the conversation.' }],
    features: [{ icon: Layers, title: 'All channels, one place', copy: 'Stop switching tabs between apps.' }, { icon: Sparkles, title: 'AI suggestions', copy: 'Draft replies and detect meeting intent automatically.' }, { icon: Users, title: 'Assignment & handoff', copy: 'Route conversations to the right teammate in a click.' }, { icon: Clock3, title: 'Full history', copy: 'Every message and note, always one scroll away.' }, { icon: Filter, title: 'Views & filters', copy: 'Focus on what needs attention right now.' }, { icon: Lock, title: 'Secure by design', copy: 'Workspace-level access control for every conversation.' }],
    stats: [{ text: '5', label: 'Channels in one inbox' }, { text: '1', label: 'Shared team view' }, { text: 'AI', label: 'Assisted replies' }], related: ['agent', 'crm', 'schedule'],
  },
  crm: {
    tag: 'CRM', title: 'A built-in CRM that', accent: 'keeps every lead', tail: <>moving forward.</>,
    copy: 'One clear view of every contact, conversation, deal and follow-up — connected to the rest of your workspace.',
    bullets: ['Track leads, deals and activities', 'Custom pipelines and deal stages', 'Lead assignment and team collaboration', 'AI lead scoring and reminders'],
    visual: () => <CrmMock />, stepsHead: ['ONE RECORD. COMPLETE CONTEXT.', 'Know where every lead stands.', 'And what should happen next.'],
    steps: [{ icon: Globe, title: 'Leads arrive scored', copy: 'New enquiries are created automatically and scored by AI.' }, { icon: Target, title: 'Move through the pipeline', copy: 'Stages, owners and activities keep everyone aligned.' }, { icon: CalendarCheck, title: 'Never miss a follow-up', copy: 'Reminders and next actions keep deals from going cold.' }],
    features: [{ icon: Users, title: 'Lead profiles', copy: 'Contact details, channels and history in one record.' }, { icon: Target, title: 'Custom pipelines', copy: 'Stages that match the way your team really sells.' }, { icon: Sparkles, title: 'AI lead scores', copy: 'Focus on the leads most likely to convert.' }, { icon: Database, title: 'Databases & imports', copy: 'Bring lists in and keep them tidy and de-duplicated.' }, { icon: UserCheck, title: 'Ownership', copy: 'Clear assignment and teamwork on every lead.' }, { icon: Megaphone, title: 'Connected to campaigns', copy: 'Target segments straight from your CRM.' }],
    stats: [{ text: '360°', label: 'Lead view' }, { text: 'AI', label: 'Lead scoring' }, { text: '1', label: 'Connected workspace' }], related: ['inbox', 'campaigns', 'analytics'],
  },
  'lead-capture': {
    tag: 'Lead Capture', title: 'Turn more visitors into', accent: 'qualified leads.',
    copy: 'Capture enquiries from your website, connected channels and imported lists, and bring every new prospect into the right workflow.',
    bullets: ['AI chat on your website', 'Custom lead capture forms', 'Auto-assign to your team', 'Capture from ads and campaigns'],
    visual: () => <CaptureMock />, stepsHead: ['FROM VISITOR TO LEAD', 'Capture it once.', 'Follow up everywhere.'],
    steps: [{ icon: Globe, title: 'Meet visitors where they are', copy: 'Forms, chat widgets and connected channels collect the enquiry.' }, { icon: Sparkles, title: 'Qualify instantly', copy: 'AI scores intent and fit the moment a lead arrives.' }, { icon: UserCheck, title: 'Route to the right person', copy: 'Auto-assign and notify so no enquiry waits.' }],
    features: [{ icon: Bot, title: 'Website chat', copy: 'An AI chat widget that answers and captures.' }, { icon: FileText, title: 'Lead forms', copy: 'Configurable forms with confirmation emails.' }, { icon: Database, title: 'Enrichment', copy: 'Add context so your team starts informed.' }, { icon: Users, title: 'Auto-assignment', copy: 'Rules that route leads to the right owner.' }, { icon: Megaphone, title: 'Campaign capture', copy: 'Collect leads from ads, emails and WhatsApp.' }, { icon: Zap, title: 'Webhooks & API', copy: 'Connect any source that can send an event.' }],
    stats: [{ text: '5', label: 'Capture sources' }, { text: 'Instant', label: 'AI qualification' }, { text: '0', label: 'Leads left waiting' }], related: ['crm', 'inbox', 'agent'],
  },
  'demo-scheduling': {
    tag: 'Scheduling & Bookings', title: 'Turn interest into', accent: 'confirmed meetings.',
    copy: 'Let customers choose a suitable time while your connected calendar, working hours and meeting links stay in sync.',
    bullets: ['Share your booking link', 'Real-time availability', 'Automatic reminders', 'Google Calendar and Outlook sync'],
    visual: () => <ScheduleMock />, stepsHead: ['FROM INTENT TO CALENDAR', 'They choose a time.', 'Everything else is automatic.'],
    steps: [{ icon: MessageCircle, title: 'Intent is detected', copy: 'The conversation shows a buying signal and offers available times.' }, { icon: CalendarCheck, title: 'They pick a slot', copy: 'Live availability from your connected calendars — no back-and-forth.' }, { icon: Clock3, title: 'Reminders go out', copy: 'Confirmations and reminders reduce no-shows automatically.' }],
    features: [{ icon: CalendarCheck, title: 'Booking links', copy: 'Share a link or offer slots inside the conversation.' }, { icon: Clock3, title: 'Real-time availability', copy: 'Working hours and busy time always respected.' }, { icon: Mail, title: 'Smart reminders', copy: 'Email reminders that keep meetings on track.' }, { icon: Globe, title: 'Calendar sync', copy: 'Google Calendar and Outlook stay up to date.' }, { icon: Users, title: 'Team routing', copy: 'Book with the right person for each lead.' }, { icon: FileText, title: 'Meeting outcomes', copy: 'Capture notes and next steps against the lead.' }],
    stats: [{ text: '2', label: 'Calendars supported' }, { text: 'Auto', label: 'Reminders' }, { text: '1-click', label: 'Booking for customers' }], related: ['inbox', 'crm', 'agent'],
  },
  analytics: {
    tag: 'Analytics & Reporting', title: 'Track performance and', accent: 'grow revenue.',
    copy: 'See the impact of your lead generation, conversations and campaigns with connected reporting and practical AI insights.',
    bullets: ['Campaign and sales insights', 'Lead and pipeline reports', 'Channel-wise analytics', 'Team performance tracking'],
    visual: () => <AnalyticsMock />, stepsHead: ['FROM ACTIVITY TO INSIGHT', 'Understand what works.', 'Do more of it.'],
    steps: [{ icon: Megaphone, title: 'Everything is tracked', copy: 'Deliveries, opens, replies, bookings and pipeline movement.' }, { icon: BarChart3, title: 'See the full picture', copy: 'Connected reports across channels, campaigns and teams.' }, { icon: Sparkles, title: 'Act on insights', copy: 'AI highlights what drove results and what to try next.' }],
    features: [{ icon: Megaphone, title: 'Campaign performance', copy: 'Delivery and engagement for every send.' }, { icon: Target, title: 'Pipeline reports', copy: 'Stage-by-stage movement and conversion.' }, { icon: Layers, title: 'Channel analytics', copy: 'Compare WhatsApp, email, Instagram and web.' }, { icon: Users, title: 'Team performance', copy: 'Response times and follow-through by owner.' }, { icon: Sparkles, title: 'AI insights', copy: 'Plain-language takeaways and suggested next steps.' }, { icon: TrendingUp, title: 'Revenue attribution', copy: 'Connect conversations to outcomes.' }],
    stats: [{ text: 'Live', label: 'Performance insights' }, { text: '5', label: 'Channels compared' }, { text: 'AI', label: 'Recommendations' }], related: ['campaigns', 'crm', 'agent'],
  },
};

export const ProductPage: React.FC<{ slug: string }> = ({ slug }) => {
  const key = slug === 'ai-agents' ? 'ai-agent' : slug;
  const p = PRODUCTS[key];
  if (!p) return null;
  return (
    <main className="sx-page">
      <Hero tag={p.tag} title={p.title} accent={p.accent} tail={p.tail} copy={p.copy} bullets={p.bullets} visual={p.visual()} />
      <StatBand items={p.stats} />
      <Steps eyebrow={p.stepsHead[0]} title={p.stepsHead[1]} accent={p.stepsHead[2]} steps={p.steps} />
      <section className="sx-section alt"><div className="sx-wrap"><SectionHead eyebrow="CAPABILITIES" title={`Everything in ${p.tag},`} accent="designed to work together." /><FeatureGrid items={p.features} /></div></section>
      <Related links={p.related.map((r) => RELATED[r])} />
      <CtaBand />
    </main>
  );
};

/* ───────────── Campaigns page ───────────── */

export const CampaignsPage: React.FC<{ initial?: 'email' | 'whatsapp' }> = ({ initial = 'email' }) => (
  <main className="sx-page">
    <Hero
      tag="Campaign Builder" title="Create stunning" accent="Email & WhatsApp" tail={<>campaigns.</>}
      copy="Design, personalise, automate and send on-brand campaigns — all in one place, with AI to help you get started."
      bullets={['Drag-and-drop visual builder', 'Ready-to-use templates', 'Automated follow-up sequences', 'Desktop and mobile previews']}
      visual={<BuilderMock />}
    />
    <section className="sx-section">
      <div className="sx-wrap">
        <SectionHead eyebrow="SEE THE QUALITY" title="Campaigns your customers" accent="will actually enjoy." copy="Not a screenshot of an email in a laptop — the real designs you can build, with live previews on desktop and mobile." />
        <Reveal><CampaignShowcase initial={initial} /></Reveal>
      </div>
    </section>
    <Steps eyebrow="FROM DESIGN TO DELIVERY" title="Beautiful messages." accent="Measurable engagement." steps={[
      { icon: Palette, title: 'Design', copy: 'Start from a template or let the AI Agent draft one in your brand colours.' },
      { icon: Users, title: 'Choose your audience', copy: 'Pick a lead database or segment and personalise with merge fields.' },
      { icon: BarChart3, title: 'Send & learn', copy: 'Track deliveries, replies and bookings, then follow up automatically.' },
    ]} />
    <section className="sx-section alt"><div className="sx-wrap"><SectionHead eyebrow="CAPABILITIES" title="Everything you need to" accent="run great campaigns." />
      <FeatureGrid items={[
        { icon: Palette, title: 'Visual editor', copy: 'Drag-and-drop blocks, brand colours and logos.' }, { icon: FileText, title: 'Template library', copy: 'Reusable email and WhatsApp templates.' }, { icon: ShieldCheck, title: 'WhatsApp approvals', copy: 'Build and submit templates for Meta review.' },
        { icon: Repeat, title: 'Follow-up sequences', copy: 'Welcome series and nurture journeys on autopilot.' }, { icon: Smartphone, title: 'Live previews', copy: 'Check every design on desktop and mobile.' }, { icon: BarChart3, title: 'Engagement reporting', copy: 'Delivered, read and replied — at a glance.' },
      ]} /></div></section>
    <Related links={[RELATED.agent, RELATED.crm, RELATED.analytics]} />
    <CtaBand />
  </main>
);

/* ───────────── Platform / Solutions / Resources / Integrations ───────────── */

export const PlatformPage: React.FC = () => (
  <main className="sx-page">
    <Hero tag="Platform" title="The complete" accent="AI growth workspace."
      copy="Everything you need to capture, engage, convert and grow customers — in one connected platform."
      bullets={['Lead capture and enrichment', 'Unified customer conversations', 'AI agent and automation', 'CRM, campaigns, scheduling and analytics']}
      visual={<OrbitMock items={PLATFORM_ITEMS} center="Amaavigo" />} primary={{ href: DEMO_URL, label: 'Book a demo', external: true }} />
    <section className="sx-section"><div className="sx-wrap"><SectionHead eyebrow="ONE ECOSYSTEM" title="Eight modules." accent="One connected journey." />
      <FeatureGrid items={[
        { icon: Globe, title: 'Lead capture', copy: 'Forms, widgets and chatbots.' }, { icon: Inbox, title: 'Unified Inbox', copy: 'Every conversation, one view.' }, { icon: Bot, title: 'AI Agent', copy: 'Automate the busywork.' },
        { icon: Users, title: 'CRM', copy: 'Pipeline, scores and ownership.' }, { icon: Megaphone, title: 'Campaigns', copy: 'Email and WhatsApp builders.' }, { icon: CalendarCheck, title: 'Scheduling', copy: 'Calendar-synced bookings.' },
        { icon: BarChart3, title: 'Analytics', copy: 'Engagement to revenue.' }, { icon: Zap, title: 'Integrations', copy: 'Channels, mailboxes and APIs.' },
      ]} /></div></section>
    <section className="sx-section alt"><div className="sx-wrap"><SectionHead eyebrow="THE JOURNEY" title="Capture. Converse." accent="Convert." /><Reveal><FlowMock /></Reveal></div></section>
    <CtaBand />
  </main>
);

const SOLUTIONS = [
  { id: 'sales', icon: Users, tag: 'Sales teams', title: 'Keep every deal moving', copy: 'Conversations, pipeline, meetings and follow-ups connected in one place so reps spend time selling.', points: ['Instant replies to new enquiries', 'AI lead scores to prioritise outreach', 'Booked meetings straight into calendars'], visual: <CrmMock /> },
  { id: 'marketing', icon: Megaphone, tag: 'Marketing teams', title: 'Campaigns that convert', copy: 'Build on-brand email and WhatsApp campaigns, pick the audience and see exactly what drove replies and bookings.', points: ['Visual builder and template library', 'Audience selection from your CRM', 'Channel-wise engagement reports'], visual: <BuilderMock /> },
  { id: 'support', icon: Headphones, tag: 'Customer support', title: 'Faster, more connected replies', copy: 'Give support teams every channel and the full customer context, with AI drafting and smooth human handoff.', points: ['One inbox across channels', 'AI-suggested replies', 'Assignment and conversation history'], visual: <InboxMock compact /> },
  { id: 'agencies', icon: Layers, tag: 'Agencies', title: 'Many clients, one workspace', copy: 'Keep each client’s brand, conversations, templates and reporting tidy, with roles that fit how you work.', points: ['Separate workspaces and branding', 'Reusable templates across clients', 'Reporting you can share'], visual: <AnalyticsMock /> },
];

export const SolutionsPage: React.FC = () => (
  <main className="sx-page">
    <section className="sx-hero simple">
      <div className="sx-hero-bg" aria-hidden="true"><i className="g1" /><i className="g2" /><i className="grid" /></div>
      <div className="sx-wrap sx-simple-hero">
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE }}><Eyebrow>SOLUTIONS</Eyebrow></motion.div>
        <motion.h1 initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.08, ease: EASE }}>Built for teams<br /><span className="sx-grad">that live on conversations.</span></motion.h1>
        <motion.p initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.18, ease: EASE }}>Power your sales, marketing and customer operations with a single AI-driven platform.</motion.p>
        <motion.div className="sx-chips" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}>{SOLUTIONS.map((s) => <a key={s.id} href={'#' + s.id}>{s.tag}</a>)}</motion.div>
      </div>
    </section>
    {SOLUTIONS.map((s, i) => {
      const I = s.icon;
      return (
        <section key={s.id} id={s.id} className={'sx-section sx-anchor ' + (i % 2 === 0 ? '' : 'alt')}>
          <div className={'sx-wrap sx-split ' + (i % 2 === 0 ? '' : 'reverse')}>
            <Reveal className="sx-split-copy"><span className="sx-feature-icon"><I size={20} /></span><Eyebrow>{s.tag.toUpperCase()}</Eyebrow><h2>{s.title}</h2><p>{s.copy}</p><ul className="sx-check-list">{s.points.map((p) => <li key={p}><Check size={14} />{p}</li>)}</ul></Reveal>
            <Reveal className="sx-split-visual" delay={0.1}><div className="sx-visual-glow soft" />{s.visual}</Reveal>
          </div>
        </section>
      );
    })}
    <CtaBand />
  </main>
);

const RESOURCE_ICON_MAP: Record<string, LucideIcon> = {
  BookOpen, Megaphone, CalendarCheck, Headphones, BarChart3, Bot, Sparkles, Zap, FileText, Newspaper,
};

function renderInlineMarkdown(value: string, prefix: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const pattern = /\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\)/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  let index = 0;
  while ((match = pattern.exec(value))) {
    if (match.index > cursor) parts.push(value.slice(cursor, match.index));
    const token = match[0];
    if (token.startsWith('**')) {
      parts.push(<strong key={prefix + '-' + index}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('*')) {
      parts.push(<em key={prefix + '-' + index}>{token.slice(1, -1)}</em>);
    } else {
      const parsed = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      const href = parsed?.[2] || '';
      const safe = (href.startsWith('/') && !href.startsWith('//')) || /^https:\/\//i.test(href);
      if (parsed && safe) {
        const external = /^https:\/\//i.test(href);
        parts.push(<a key={prefix + '-' + index} href={href} className="sx-resource-inline-link" {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}>{parsed[1]}</a>);
      } else {
        parts.push(token);
      }
    }
    cursor = match.index + token.length;
    index += 1;
  }
  if (cursor < value.length) parts.push(value.slice(cursor));
  return parts;
}

function ResourceMarkdown({ content }: { content: string }) {
  const lines = content.split('\n');
  const blocks: React.ReactNode[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];
  let listNumbered = false;
  const flushParagraph = () => {
    if (paragraph.length) {
      const value = paragraph.join(' ').trim();
      blocks.push(<p key={'p-' + blocks.length}>{renderInlineMarkdown(value, 'p-' + blocks.length)}</p>);
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list.length) {
      const values = list;
      const numbered = listNumbered;
      blocks.push(numbered
        ? <ol key={'ol-' + blocks.length}>{values.map((item, i) => <li key={i}>{renderInlineMarkdown(item, 'ol-' + blocks.length + '-' + i)}</li>)}</ol>
        : <ul key={'ul-' + blocks.length}>{values.map((item, i) => <li key={i}>{renderInlineMarkdown(item, 'ul-' + blocks.length + '-' + i)}</li>)}</ul>);
      list = [];
    }
  };
  lines.forEach((raw) => {
    const line = raw.trim();
    if (!line) { flushParagraph(); flushList(); return; }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushParagraph(); flushList();
      const text = renderInlineMarkdown(heading[2], 'h-' + blocks.length);
      if (heading[1].length === 1) blocks.push(<h2 key={'h-' + blocks.length}>{text}</h2>);
      else if (heading[1].length === 2) blocks.push(<h3 key={'h-' + blocks.length}>{text}</h3>);
      else blocks.push(<h4 key={'h-' + blocks.length}>{text}</h4>);
      return;
    }
    const bullet = line.match(/^[-*]\s+(.+)$/);
    const numbered = line.match(/^\d+[.)]\s+(.+)$/);
    if (bullet || numbered) {
      flushParagraph();
      const nextNumbered = Boolean(numbered);
      if (list.length && listNumbered !== nextNumbered) flushList();
      listNumbered = nextNumbered;
      list.push((bullet || numbered)![1]);
      return;
    }
    if (line.startsWith('> ')) {
      flushParagraph(); flushList();
      blocks.push(<blockquote key={'q-' + blocks.length}>{renderInlineMarkdown(line.slice(2), 'q-' + blocks.length)}</blockquote>);
      return;
    }
    flushList();
    paragraph.push(line);
  });
  flushParagraph();
  flushList();
  return <div className="sx-resource-prose">{blocks}</div>;
}

export const ResourcesPage: React.FC = () => {
  const [resources, setResources] = useState<SiteResourcePublic[]>([]);
  const [tag, setTag] = useState('All');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    fetch('/api/site-resources')
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data?.error || 'Resources are temporarily unavailable.');
        return data;
      })
      .then((data) => { if (active) setResources(Array.isArray(data.resources) ? data.resources : []); })
      .catch((err) => { if (active) setError(err?.message || 'Resources are temporarily unavailable.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return resources.filter((resource) => {
      if (tag !== 'All' && resource.category !== tag) return false;
      return !q || [resource.title, resource.summary, resource.category].some((value) => String(value || '').toLowerCase().includes(q));
    });
  }, [resources, tag, search]);

  return (
    <main className="sx-page">
      <section className="sx-hero simple">
        <div className="sx-hero-bg" aria-hidden="true"><i className="g1" /><i className="g2" /><i className="grid" /></div>
        <div className="sx-wrap sx-simple-hero">
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE }}><Eyebrow>RESOURCES</Eyebrow></motion.div>
          <motion.h1 initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.08, ease: EASE }}>Insights, guides<br /><span className="sx-grad">and product updates.</span></motion.h1>
          <motion.p initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.18, ease: EASE }}>Practical ideas to help your team get more leads, book meetings and grow with Amaavigo.</motion.p>
        </div>
      </section>
      <section className="sx-section tight">
        <div className="sx-wrap">
          <div className="sx-resource-toolbar">
            <div className="sx-filters">
              {['All', ...RESOURCE_CATEGORIES].map((filter) => (
                <button type="button" key={filter} className={tag === filter ? 'on' : ''} onClick={() => setTag(filter)}>
                  {filter}{tag === filter && <motion.i layoutId="sx-filter" className="sx-pill-bg" />}
                </button>
              ))}
            </div>
            <label className="sx-resource-search"><span>Search resources</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search guides, insights, topics…" /></label>
          </div>
          <div className="sx-resource-count">{loading ? 'Loading resources…' : shown.length + (shown.length === 1 ? ' resource' : ' resources')}</div>
          {error && <div className="sx-resource-error">{error}</div>}
          {loading ? <div className="sx-resource-loading"><i /><i /><i /></div> :
            shown.length === 0 ? <div className="sx-resource-empty"><BookOpen size={24} /><h2>No resources found</h2><p>Try another category or search term.</p></div> :
            <motion.div layout className="sx-resource-grid">
              <AnimatePresence mode="popLayout">
                {shown.map((resource) => {
                  const Icon = RESOURCE_ICON_MAP[resource.icon] || BookOpen;
                  const typeLabel = RESOURCE_TYPES.find((item) => item.value === resource.type)?.label || 'Resource';
                  const isDirectLink = resource.type === 'link' || resource.type === 'video';
                  const href = isDirectLink ? resource.destinationUrl : '/resources/' + resource.slug;
                  const external = /^https:\/\//i.test(href);
                  return (
                    <motion.div layout key={resource.id} initial={{ opacity: 0, scale: 0.97, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }} transition={{ duration: 0.3, ease: EASE }}>
                      <a href={href} className="sx-resource" {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}>
                        <div className="sx-resource-art">
                          {resource.coverImageUrl ? <img src={resource.coverImageUrl} alt={resource.coverImageAlt} loading="lazy" /> : <><Icon size={30} /><i /><i /></>}
                        </div>
                        <div className="sx-resource-meta"><small>{resource.category}</small><span>{typeLabel}</span></div>
                        <h3>{resource.title}</h3>
                        <p>{resource.summary}</p>
                        <em>{resource.ctaLabel || (isDirectLink ? 'Explore resource' : 'Read resource')} <ArrowUpRight size={13} /></em>
                      </a>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </motion.div>
          }
        </div>
      </section>
      <CtaBand />
    </main>
  );
};

export const ResourceDetailPage: React.FC<{ slug: string }> = ({ slug }) => {
  const [resource, setResource] = useState<SiteResourcePublic | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setResource(null);
    setLoading(true);
    setError('');
    fetch('/api/site-resources/' + encodeURIComponent(slug))
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data?.error || 'This resource could not be found.');
        return data;
      })
      .then((data) => { if (active) setResource(data.resource || null); })
      .catch((err) => { if (active) setError(err?.message || 'This resource could not be found.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [slug]);

  useEffect(() => {
    if (!resource) return;
    const title = resource.seoTitle || resource.title;
    const description = resource.metaDescription || resource.summary;
    document.title = title + ' | Amaavigo';
    const setMeta = (selector: string, attribute: string, value: string) => {
      let element = document.querySelector(selector) as HTMLMetaElement | null;
      if (!element) {
        element = document.createElement('meta');
        if (selector.includes('property=')) element.setAttribute('property', selector.match(/property="([^"]+)"/)?.[1] || '');
        else element.name = selector.match(/name="([^"]+)"/)?.[1] || '';
        document.head.appendChild(element);
      }
      element.setAttribute(attribute, value);
    };
    setMeta('meta[name="description"]', 'content', description);
    setMeta('meta[property="og:title"]', 'content', title + ' | Amaavigo');
    setMeta('meta[property="og:description"]', 'content', description);
    setMeta('meta[property="og:url"]', 'content', window.location.href);
    if (resource.coverImageUrl) setMeta('meta[property="og:image"]', 'content', resource.coverImageUrl.startsWith('/') ? window.location.origin + resource.coverImageUrl : resource.coverImageUrl);
    let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canonical) { canonical = document.createElement('link'); canonical.rel = 'canonical'; document.head.appendChild(canonical); }
    canonical.href = window.location.origin + '/resources/' + resource.slug;
  }, [resource]);

  if (loading) return <main className="sx-resource-detail"><div className="sx-wrap sx-resource-detail-loading">Loading resource…</div></main>;
  if (!resource || error) return <main className="sx-resource-detail"><div className="sx-wrap sx-resource-not-found"><Eyebrow>RESOURCE</Eyebrow><h1>We could not find that resource.</h1><p>{error || 'It may have been unpublished or moved.'}</p><a href="/resources">Back to all resources <ArrowUpRight size={14} /></a></div></main>;

  const typeLabel = RESOURCE_TYPES.find((item) => item.value === resource.type)?.label || 'Resource';
  return (
    <main className="sx-resource-detail">
      <div className="sx-wrap">
        <nav className="sx-resource-breadcrumb" aria-label="Breadcrumb"><a href="/">Home</a><span>/</span><a href="/resources">Resources</a><span>/</span><span>{resource.title}</span></nav>
        <article className="sx-resource-article">
          <header className="sx-resource-article-head">
            <div className="sx-resource-meta"><small>{resource.category}</small><span>{typeLabel}</span></div>
            <h1>{resource.title}</h1>
            <p className="sx-resource-article-summary">{resource.summary}</p>
            <div className="sx-resource-byline">{resource.author}{resource.readingTime ? ' · ' + resource.readingTime : ''}{resource.publishedAt ? ' · ' + new Date(resource.publishedAt).toLocaleDateString() : ''}</div>
          </header>
          {resource.coverImageUrl && <img className="sx-resource-article-cover" src={resource.coverImageUrl} alt={resource.coverImageAlt} />}
          {resource.content ? <ResourceMarkdown content={resource.content} /> : <div className="sx-resource-external"><p>Continue to the full resource.</p><a href={resource.destinationUrl} target="_blank" rel="noreferrer">{resource.ctaLabel || 'Open resource'} <ArrowUpRight size={15} /></a></div>}
          <footer className="sx-resource-article-footer">
            <div><small>KEEP MOVING FORWARD</small><h2>Make the next conversation count.</h2></div>
            <a href={resource.ctaUrl || '/contact'}>{resource.ctaLabel || 'Talk to our team'} <ArrowUpRight size={15} /></a>
          </footer>
        </article>
      </div>
    </main>
  );
};

export const IntegrationsPage: React.FC = () => (
  <main className="sx-page">
    <Hero tag="Integrations" title="Connect your" accent="favourite tools."
      copy="Bring your customer channels, business inboxes, calendars and automation tools into one connected workspace."
      bullets={['WhatsApp, Instagram and Messenger', 'Gmail, Outlook and IMAP mailboxes', 'Google Calendar and Microsoft 365', 'Website forms, APIs and webhooks']}
      visual={<OrbitMock />} />
    <section className="sx-section alt"><div className="sx-wrap"><SectionHead eyebrow="WHAT CONNECTS" title="One workspace," accent="every source." copy="Availability depends on provider permissions and your workspace configuration." />
      <FeatureGrid items={[
        { icon: MessageCircle, title: 'Messaging channels', copy: 'WhatsApp Business, Instagram messaging and Facebook Messenger.' }, { icon: Mail, title: 'Business mailboxes', copy: 'Gmail, Outlook / Microsoft 365 and any IMAP provider.' }, { icon: CalendarCheck, title: 'Calendars', copy: 'Google Calendar and Outlook for live availability.' },
        { icon: Globe, title: 'Website', copy: 'Chat widget, lead forms and thank-you emails.' }, { icon: Zap, title: 'Webhooks & API', copy: 'Send and receive events with your other systems.' }, { icon: Lock, title: 'Secure access', copy: 'Credentials stored encrypted, scoped to your workspace.' },
      ]} /></div></section>
    <CtaBand />
  </main>
);

export const MiniIconsUsed = { Instagram, Facebook };
