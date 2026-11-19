import React, { useEffect, useState } from 'react';
import { ArrowUpRight, ChevronDown, Menu, X } from 'lucide-react';
import { AnimatePresence, motion, useScroll, useSpring } from 'motion/react';
import { DEMO_URL, EASE } from './SiteUI';

type NavLink = { label: string; href: string; description: string };
type NavGroup = { label: string; href: string; links: NavLink[] };

const NAV_GROUPS: NavGroup[] = [
  { label: 'Platform', href: '/platform', links: [
    { label: 'Platform overview', href: '/platform', description: 'One workspace for the full journey' },
    { label: 'AI Agent', href: '/ai-agent', description: 'Conversations, qualification, follow-ups' },
    { label: 'Unified Inbox', href: '/unified-inbox', description: 'Every channel in one place' },
    { label: 'Campaign Builder', href: '/campaigns', description: 'Email and WhatsApp campaigns' },
    { label: 'CRM', href: '/crm', description: 'Pipeline, activities and AI scores' },
    { label: 'Lead capture', href: '/lead-capture', description: 'Forms, widgets and chatbots' },
    { label: 'Scheduling & bookings', href: '/demo-scheduling', description: 'Calendar sync and reminders' },
    { label: 'Analytics & reporting', href: '/analytics', description: 'Engagement to revenue' },
  ] },
  { label: 'Solutions', href: '/solutions', links: [
    { label: 'Sales teams', href: '/solutions#sales', description: 'Keep every deal moving' },
    { label: 'Marketing teams', href: '/solutions#marketing', description: 'Campaigns that convert' },
    { label: 'Customer support', href: '/solutions#support', description: 'Faster, more connected replies' },
    { label: 'Agencies', href: '/solutions#agencies', description: 'Run many clients in one place' },
  ] },
];

export const SiteHeader: React.FC<{ pathname: string }> = ({ pathname }) => {
  const [open, setOpen] = useState<string | null>(null);
  const [mobile, setMobile] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 140, damping: 28, mass: 0.2 });

  useEffect(() => {
    let frame = 0;
    const onScroll = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => setScrolled(window.scrollY > 14)); };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { window.removeEventListener('scroll', onScroll); cancelAnimationFrame(frame); };
  }, []);
  useEffect(() => { setMobile(false); setOpen(null); }, [pathname]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(null); setMobile(false); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => {
    document.body.style.overflow = mobile ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [mobile]);

  const active = (href: string) => pathname === href.split('#')[0];
  const simple = [{ label: 'Integrations', href: '/integrations' }, { label: 'Resources', href: '/resources' }, { label: 'Pricing', href: '/pricing' }];

  return (
    <header className={'sx-header ' + (scrolled ? 'scrolled' : '')}>
      <motion.div className="sx-progress" style={{ scaleX: progress }} />
      <div className="sx-header-inner">
        <a href="/" className="sx-brand" aria-label="Amaavigo home">
          <img src="/amaavigo-logo-white.png" alt="Amaavigo" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
        </a>
        <nav className="sx-nav" aria-label="Main navigation">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="sx-nav-group" onMouseEnter={() => setOpen(group.label)} onMouseLeave={() => setOpen(null)}>
              <a href={group.href} className={'sx-nav-link ' + (group.links.some((l) => active(l.href)) ? 'active' : '')} aria-haspopup="true" aria-expanded={open === group.label} onFocus={() => setOpen(group.label)}>
                {group.label}<ChevronDown size={13} className={open === group.label ? 'flip' : ''} />
              </a>
              <AnimatePresence>
                {open === group.label && (
                  <motion.div className="sx-mega" initial={{ opacity: 0, y: 8, scale: 0.985 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 6, scale: 0.99 }} transition={{ duration: 0.18, ease: EASE }}>
                    <div className={'sx-mega-grid ' + (group.links.length > 4 ? 'wide' : '')}>
                      {group.links.map((link) => (
                        <a key={link.href} href={link.href} className="sx-mega-item">
                          <strong>{link.label}</strong><small>{link.description}</small>
                          <ArrowUpRight size={13} />
                        </a>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
          {simple.map((item) => (
            <a key={item.href} href={item.href} className={'sx-nav-link ' + (active(item.href) ? 'active' : '')}>
              {item.label}
              {active(item.href) && <motion.i layoutId="sx-nav-dot" className="sx-nav-dot" />}
            </a>
          ))}
        </nav>
        <div className="sx-header-actions">
          <a href="/login" className="sx-login">Log in</a>
          <a href={DEMO_URL} target="_blank" rel="noreferrer" className="sx-btn primary small"><span>Book a demo</span><ArrowUpRight size={14} /></a>
        </div>
        <button type="button" className="sx-burger" aria-label={mobile ? 'Close menu' : 'Open menu'} aria-expanded={mobile} onClick={() => setMobile((v) => !v)}>
          {mobile ? <X size={21} /> : <Menu size={21} />}
        </button>
      </div>
      <AnimatePresence>
        {mobile && (
          <motion.nav className="sx-mobile" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.22 }}>
            {[...NAV_GROUPS.flatMap((g) => g.links.filter((l) => !l.href.includes('#'))), ...simple.map((s) => ({ ...s, description: '' }))].map((link, i) => (
              <motion.a key={link.href} href={link.href} initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.04 * i, duration: 0.4, ease: EASE }} className={active(link.href) ? 'active' : ''}>{link.label}</motion.a>
            ))}
            <div className="sx-mobile-actions">
              <a href="/login" className="sx-btn ghost"><span>Log in</span></a>
              <a href={DEMO_URL} target="_blank" rel="noreferrer" className="sx-btn primary"><span>Book a demo</span><ArrowUpRight size={15} /></a>
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
};

export const SiteFooter: React.FC = () => (
  <footer className="sx-footer">
    <div className="sx-footer-glow" aria-hidden="true" />
    <div className="sx-footer-main">
      <div className="sx-footer-brand">
        <img src="/amaavigo-logo-white.png" alt="Amaavigo" />
        <p>From the first enquiry to the next sales conversation — one connected workspace to keep the work moving.</p>
        <a href={DEMO_URL} target="_blank" rel="noreferrer" className="sx-btn primary small"><span>Book a demo</span><ArrowUpRight size={14} /></a>
      </div>
      <div className="sx-footer-col"><strong>Platform</strong><a href="/platform">Overview</a><a href="/ai-agent">AI Agent</a><a href="/unified-inbox">Unified Inbox</a><a href="/crm">CRM</a><a href="/lead-capture">Lead capture</a></div>
      <div className="sx-footer-col"><strong>Engage</strong><a href="/campaigns">Campaign Builder</a><a href="/whatsapp">WhatsApp campaigns</a><a href="/demo-scheduling">Scheduling</a><a href="/analytics">Analytics</a><a href="/integrations">Integrations</a></div>
      <div className="sx-footer-col"><strong>Company</strong><a href="/solutions">Solutions</a><a href="/pricing">Pricing</a><a href="/resources">Resources</a><a href="/how-it-works">How it works</a><a href="/faqs">FAQs</a><a href="/about">About</a><a href="/contact">Contact</a></div>
      <div className="sx-footer-col"><strong>Legal</strong><a href="/privacy">Privacy Policy</a><a href="/terms">Terms of Service</a><a href="/dpa">Data Processing</a><a href="/aup">Acceptable Use</a><a href="/login">Log in</a></div>
    </div>
    <div className="sx-footer-bottom"><span>© {new Date().getFullYear()} Amaavigo Digital Solutions LLP. All rights reserved.</span><span>Capture → Converse → Convert.</span></div>
  </footer>
);
