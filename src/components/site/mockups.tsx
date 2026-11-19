import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUpRight, BarChart3, Bell, Bot, Calendar, CalendarCheck, Check, CheckCheck, Clock3, Facebook, Globe, Inbox, Instagram, Layers,
  Mail, Megaphone, MessageCircle, Plus, Search, Send, Sparkles, Star, TrendingUp, Users, Workflow, Zap,
} from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { CountUp, EASE, useOnScreen, useSeenOnce } from './SiteUI';

/* ───────────── helpers ───────────── */

export function useTypewriter(text: string, active: boolean, speed = 22) {
  const reduced = useReducedMotion();
  const [out, setOut] = useState(reduced ? text : '');
  useEffect(() => {
    if (reduced) { setOut(text); return; }
    setOut('');
    if (!active) return;
    let i = 0;
    const id = window.setInterval(() => { i += 1; setOut(text.slice(0, i)); if (i >= text.length) window.clearInterval(id); }, speed);
    return () => window.clearInterval(id);
  }, [text, active, speed, reduced]);
  return out;
}

/** Cycles 0..count-1 while `active`; pauses otherwise. */
export function useCycle(count: number, ms: number, active: boolean) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setIndex((v) => (v + 1) % count), ms);
    return () => window.clearInterval(id);
  }, [count, ms, active]);
  return [index, setIndex] as const;
}

export const WindowBar: React.FC<{ title: string; meta?: string; live?: boolean }> = ({ title, meta, live = true }) => (
  <div className="sx-win-bar">
    <span className="sx-dots"><i /><i /><i /></span>
    <b>{title}</b>
    {meta && <small>{meta}</small>}
    {live && <span className="sx-live"><i />LIVE PREVIEW</span>}
  </div>
);

export const ChannelIcon: React.FC<{ kind: 'wa' | 'ig' | 'fb' | 'mail' | 'web'; size?: number }> = ({ kind, size = 16 }) => {
  const I = kind === 'wa' ? MessageCircle : kind === 'ig' ? Instagram : kind === 'fb' ? Facebook : kind === 'mail' ? Mail : Globe;
  return <span className={'sx-chan ' + kind}><I size={size} /></span>;
};

/* ───────────── Unified Inbox ───────────── */

const INBOX_PEOPLE = [
  { name: 'Ayesha Khan', initial: 'AK', kind: 'wa' as const, channel: 'WhatsApp', time: '2m', msg: 'Hi! I would like to know more about your service.', reply: 'Absolutely. I can walk you through the options and set up a quick call. What day suits you?', tone: 'Meeting intent detected' },
  { name: 'Imran Mehta', initial: 'IM', kind: 'ig' as const, channel: 'Instagram', time: '8m', msg: 'Can you share the available packages?', reply: 'Happy to. Here is a short overview of our packages — shall I send full pricing details?', tone: 'Pricing question' },
  { name: 'Sara Merchant', initial: 'SM', kind: 'fb' as const, channel: 'Messenger', time: '15m', msg: 'Could we arrange a quick call this week?', reply: 'Of course. I have Thursday at 11:00 or Friday at 15:30 — which works better?', tone: 'Ready to book' },
  { name: 'Karan Patel', initial: 'KP', kind: 'mail' as const, channel: 'Email', time: '1h', msg: 'Please send the proposal we discussed.', reply: 'Thanks Karan — I am preparing it now and a teammate will share it within the hour.', tone: 'Human handoff suggested' },
];

export const InboxMock: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const [ref, visible] = useOnScreen<HTMLDivElement>(0.3);
  const [paused, setPaused] = useState(false);
  const [index, setIndex] = useCycle(INBOX_PEOPLE.length, 6500, visible && !paused);
  const person = INBOX_PEOPLE[index];
  const reply = useTypewriter(person.reply, visible, 16);
  return (
    <div ref={ref} className={'sx-window sx-inbox ' + (compact ? 'compact' : '')} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <WindowBar title="amaavigo / Unified Inbox" meta="All conversations" />
      <div className="sx-inbox-body">
        <aside className="sx-rail"><b>a</b><span><Layers size={15} /></span><span className="on"><Inbox size={15} /></span><span><Users size={15} /></span><span><Megaphone size={15} /></span><span><Sparkles size={15} /></span><span><BarChart3 size={15} /></span></aside>
        <div className="sx-threads">
          <div className="sx-threads-head"><b>Unified Inbox</b><span className="sx-count">24</span></div>
          <div className="sx-tabs"><b>All</b><span>WhatsApp</span><span>Instagram</span><span>Email</span></div>
          {INBOX_PEOPLE.map((p, i) => (
            <button key={p.name} type="button" className={'sx-thread ' + (i === index ? 'sel' : '')} onClick={() => setIndex(i)}>
              <span className={'sx-avatar t' + i}>{p.initial}<ChannelIcon kind={p.kind} size={9} /></span>
              <span className="sx-thread-text"><b>{p.name}</b><small>{p.msg}</small></span>
              <em>{p.time}</em>
              {i === index && <motion.i layoutId="sx-thread-bar" className="sx-thread-bar" />}
            </button>
          ))}
        </div>
        <section className="sx-chat">
          <div className="sx-chat-top"><span className={'sx-avatar t' + index}>{person.initial}</span><span><b>{person.name}</b><small>{person.channel} · Active now</small></span></div>
          <AnimatePresence mode="wait">
            <motion.div key={index} className="sx-chat-flow" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.3, ease: EASE }}>
              <div className="sx-bubble in">{person.msg}</div>
              <div className="sx-bubble ai"><small><Sparkles size={10} /> AI SUGGESTED REPLY</small>{reply}<span className="sx-caret" /></div>
              <div className="sx-intent"><CalendarCheck size={14} /><span><b>{person.tone}</b><small>Suggested next step ready</small></span><ArrowUpRight size={13} /></div>
            </motion.div>
          </AnimatePresence>
          <div className="sx-chat-input">Type a message… <span><Plus size={12} /><Send size={12} /></span></div>
        </section>
        {!compact && <aside className="sx-profile"><small>CONTACT</small><span className={'sx-avatar lg t' + index}>{person.initial}</span><b>{person.name}</b><em>New opportunity</em><hr /><small>CHANNEL</small><b>{person.channel}</b><small>AI ASSIST</small><b className="ok">Enabled</b><small>NEXT ACTION</small><b>Qualify enquiry</b></aside>}
      </div>
    </div>
  );
};

/* ───────────── AI Agent ───────────── */

const AGENT_TASKS = [
  { label: 'Follow-up campaign', prompt: 'Find leads who enquired but have not booked and prepare a follow-up campaign for review.', steps: ['Reviewing lead databases', 'Finding the right audience', 'Preparing branded content', 'Creating campaign draft'], result: 'Draft ready · 142 recipients · Awaiting your approval' },
  { label: 'WhatsApp template', prompt: 'Create a WhatsApp template for new enquiries with personalisation and a preview.', steps: ['Understanding the purpose', 'Drafting message and variables', 'Preparing a preview', 'Saving the template draft'], result: 'Template drafted · Ready to submit for Meta review' },
  { label: 'Campaign insights', prompt: 'Compare recent campaigns and tell me what drove replies and bookings.', steps: ['Retrieving performance data', 'Comparing engagement', 'Reviewing replies and outcomes', 'Preparing insights'], result: '3 insights found · Evening sends booked 2.1× more demos' },
];

export const AgentMock: React.FC = () => {
  const [ref, visible] = useOnScreen<HTMLDivElement>(0.3);
  const [task, setTask] = useState(0);
  const [stage, setStage] = useState(0); // 0 typing, 1..n steps, n+1 result
  const t = AGENT_TASKS[task];
  const prompt = useTypewriter(t.prompt, visible, 18);
  const typed = prompt.length >= t.prompt.length;
  useEffect(() => { setStage(0); }, [task]);
  useEffect(() => {
    if (!visible || !typed) return;
    if (stage > t.steps.length + 1) {
      const id = window.setTimeout(() => setTask((v) => (v + 1) % AGENT_TASKS.length), 3200);
      return () => window.clearTimeout(id);
    }
    const id = window.setTimeout(() => setStage((s) => s + 1), stage === 0 ? 500 : 750);
    return () => window.clearTimeout(id);
  }, [visible, typed, stage, t.steps.length]);
  return (
    <div ref={ref} className="sx-window sx-agent">
      <WindowBar title="AI Agent workspace" meta="One instruction. Connected actions." />
      <div className="sx-agent-body">
        <div className="sx-agent-tabs">
          {AGENT_TASKS.map((x, i) => <button key={x.label} type="button" className={i === task ? 'on' : ''} onClick={() => setTask(i)}><Bot size={12} />{x.label}</button>)}
        </div>
        <div className="sx-agent-chat">
          <div className="sx-agent-user"><span>You</span><p>{prompt}{!typed && <i className="sx-caret" />}</p></div>
          <div className="sx-agent-steps">
            {t.steps.map((s, i) => {
              const done = stage > i + 1; const current = stage === i + 1;
              return (
                <motion.div key={task + s} className={'sx-step ' + (done ? 'done' : current ? 'now' : '')} initial={false} animate={{ opacity: stage > i ? 1 : 0.28, x: stage > i ? 0 : -8 }} transition={{ duration: 0.4, ease: EASE }}>
                  <span>{done ? <Check size={11} strokeWidth={3} /> : current ? <i className="sx-spin" /> : null}</span>{s}
                </motion.div>
              );
            })}
          </div>
          <AnimatePresence>
            {stage > t.steps.length && (
              <motion.div key={task + 'r'} className="sx-agent-result" initial={{ opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.5, ease: EASE }}>
                <Sparkles size={15} /><span><b>Done — nothing is sent without approval</b><small>{t.result}</small></span><button type="button">Review</button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

/* ───────────── Campaign designs (original, coded) ───────────── */

export type EmailKind = 'newsletter' | 'product' | 'promo' | 'welcome';

export const EmailTemplate: React.FC<{ kind: EmailKind }> = ({ kind }) => {
  if (kind === 'newsletter') {
    return (
      <div className="sx-mail news">
        <div className="sx-mail-nav"><b>Studio Notes<span>.</span></b><small>ISSUE 24 · NOVEMBER</small></div>
        <div className="sx-mail-hero"><small>THIS MONTH</small><strong>Ideas worth<br />your inbox.</strong><i className="o1" /><i className="o2" /><i className="o3" /></div>
        <div className="sx-mail-row"><div className="sx-mail-thumb a" /><div><b>The quiet power of follow-ups</b><p>Why the second message wins more meetings.</p><a>Read story →</a></div></div>
        <div className="sx-mail-row"><div className="sx-mail-thumb b" /><div><b>Behind a 3-minute reply</b><p>How fast teams keep conversations warm.</p><a>Read story →</a></div></div>
        <div className="sx-mail-foot">You are receiving this because you subscribed.</div>
      </div>
    );
  }
  if (kind === 'product') {
    return (
      <div className="sx-mail prod">
        <div className="sx-mail-nav"><b>Northwind<span>.</span></b><small>NEW RELEASE</small></div>
        <div className="sx-mail-prod-hero"><div className="sx-mail-device"><i /><i /><i /></div><div><small>INTRODUCING</small><strong>Aura Series</strong><p>Everything you love, rebuilt to move faster.</p><a className="sx-mail-cta">Meet Aura →</a></div></div>
        <div className="sx-mail-features"><div><span><Zap size={13} /></span><b>2× faster</b></div><div><span><Star size={13} /></span><b>Redesigned</b></div><div><span><Check size={13} /></span><b>Built to last</b></div></div>
        <div className="sx-mail-price"><div><small>FROM</small><b>$129</b></div><a className="sx-mail-cta">Shop now</a></div>
      </div>
    );
  }
  if (kind === 'promo') {
    return (
      <div className="sx-mail promo">
        <div className="sx-mail-tag">WEEKEND ONLY</div>
        <div className="sx-mail-sale"><strong>30<span>%</span></strong><small>OFF EVERYTHING</small></div>
        <p>Our biggest offer of the season ends Sunday midnight.</p>
        <div className="sx-mail-code">CODE · <b>GLOW30</b></div>
        <a className="sx-mail-cta light">Claim the offer →</a>
        <div className="sx-mail-timer">{['02', '14', '37'].map((n, i) => <span key={i}><b>{n}</b><small>{['DAYS', 'HRS', 'MIN'][i]}</small></span>)}</div>
      </div>
    );
  }
  return (
    <div className="sx-mail welcome">
      <div className="sx-mail-nav"><b>Haven<span>.</span></b><small>WELCOME SERIES · 1 OF 3</small></div>
      <div className="sx-mail-wave"><strong>Welcome, {'{{first_name}}'}.</strong><p>We are so glad you are here.</p></div>
      <div className="sx-mail-steps"><div><span>1</span><b>Set up your profile</b></div><div><span>2</span><b>Explore your dashboard</b></div><div><span>3</span><b>Book a quick intro</b></div></div>
      <a className="sx-mail-cta">Get started →</a>
      <div className="sx-mail-foot">Next: a short guide arrives in 2 days.</div>
    </div>
  );
};

export type WaKind = 'promo' | 'order' | 'welcome';

export const WhatsAppPhone: React.FC<{ kind: WaKind; animate?: boolean }> = ({ kind, animate = true }) => {
  const copy = {
    promo: { head: 'Brand Zone', body: 'Hey Sara 👋 New arrivals are trending. Flat 30% off, only for you this weekend.', cta: 'Start shopping', art: 'SALE' },
    order: { head: 'Brand Zone', body: 'Your order #4821 is on its way 🚚 Arriving tomorrow by 6 PM.', cta: 'Track order', art: 'SHIPPED' },
    welcome: { head: 'Haven Care', body: 'Welcome aboard, Sara! Here is what happens next — and a quick way to book your intro call.', cta: 'Book intro call', art: 'HELLO' },
  }[kind];
  const [ticks, setTicks] = useState(animate ? 0 : 3);
  useEffect(() => {
    if (!animate) return;
    const a = window.setTimeout(() => setTicks(1), 700);
    const b = window.setTimeout(() => setTicks(2), 1500);
    const c = window.setTimeout(() => setTicks(3), 2400);
    return () => { [a, b, c].forEach(window.clearTimeout); };
  }, [animate]);
  return (
    <div className="sx-phone">
      <div className="sx-phone-notch" />
      <div className="sx-wa-head"><span className="sx-wa-av">{copy.head[0]}</span><span><b>{copy.head}</b><small>Business account</small></span></div>
      <div className="sx-wa-chat">
        <div className="sx-wa-date">TODAY</div>
        <div className={'sx-wa-msg ' + kind}>
          <div className="sx-wa-art"><span>{copy.art}</span><i /><i /></div>
          <p>{copy.body}</p>
          <small>10:42 AM <CheckCheck size={12} className={ticks >= 2 ? 'read' : ''} /></small>
          <div className="sx-wa-cta"><ArrowUpRight size={12} />{copy.cta}</div>
        </div>
      </div>
      <div className="sx-wa-status">
        <span className={ticks >= 1 ? 'on' : ''}><Check size={10} />Delivered</span>
        <span className={ticks >= 2 ? 'on read' : ''}><CheckCheck size={10} />Read</span>
        <span className={ticks >= 3 ? 'on rep' : ''}><MessageCircle size={10} />Replied</span>
      </div>
    </div>
  );
};

/* ───────────── Builder ───────────── */

export const BuilderMock: React.FC = () => {
  const [ref, visible] = useOnScreen<HTMLDivElement>(0.3);
  const blocks = ['Text', 'Image', 'Button', 'Social'];
  const [i, setI] = useCycle(blocks.length, 2600, visible);
  const kinds: EmailKind[] = ['newsletter', 'product', 'promo', 'welcome'];
  const [k, setK] = useCycle(kinds.length, 5200, visible);
  return (
    <div ref={ref} className="sx-window sx-builder">
      <WindowBar title="Campaign Studio" meta="Create & design" />
      <div className="sx-builder-body">
        <div className="sx-builder-side">
          <small>BLOCKS</small>
          {blocks.map((b, n) => <button type="button" key={b} className={n === i ? 'on' : ''} onClick={() => setI(n)}><Plus size={12} />{b}{n === i && <motion.i layoutId="sx-block" className="sx-block-ring" />}</button>)}
        </div>
        <div className="sx-builder-canvas">
          <div className="sx-builder-tabs">{['Email', 'WhatsApp', 'SMS'].map((t, n) => <span key={t} className={n === 0 ? 'on' : ''}>{t}</span>)}<small>Drag & drop editor</small></div>
          <AnimatePresence mode="wait">
            <motion.div key={k} className="sx-builder-mail" initial={{ opacity: 0, y: 14, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.45, ease: EASE }}>
              <EmailTemplate kind={kinds[k]} />
              <motion.span className="sx-builder-handle" animate={{ y: [0, -4, 0] }} transition={{ repeat: Infinity, duration: 2.4, ease: 'easeInOut' }}>Editing · {blocks[i]}</motion.span>
            </motion.div>
          </AnimatePresence>
        </div>
        <div className="sx-builder-props"><small>PROPERTIES</small><div><span>Personalise</span><b>On</b></div><div><span>Mobile preview</span><b>On</b></div><div><span>A/B test</span><b>2 variants</b></div><div className="sx-swatches"><i style={{ background: '#3b6cff' }} /><i style={{ background: '#8f5bff' }} /><i style={{ background: '#ff7a45' }} /></div></div>
      </div>
    </div>
  );
};

/* ───────────── CRM ───────────── */

const LANES = [
  { name: 'New', n: 128, cards: [['AK', 'Ayesha Khan', 'Website', 82], ['NK', 'Neha Kapoor', 'Instagram', 64]] },
  { name: 'Qualified', n: 64, cards: [['IM', 'Imran Mehta', 'WhatsApp', 91], ['SM', 'Sara Merchant', 'Email', 73]] },
  { name: 'Demo booked', n: 32, cards: [['KP', 'Karan Patel', 'Website', 88], ['ZS', 'Zeeshan Shah', 'Messenger', 79]] },
];

export const CrmMock: React.FC = () => {
  const [ref, visible] = useOnScreen<HTMLDivElement>(0.3);
  const [moved, setMoved] = useState(false);
  useEffect(() => {
    if (!visible) return;
    const id = window.setInterval(() => setMoved((v) => !v), 3200);
    return () => window.clearInterval(id);
  }, [visible]);
  return (
    <div ref={ref} className="sx-window sx-crm">
      <WindowBar title="CRM › Pipeline" meta="Sales workspace" />
      <div className="sx-crm-body">
        <div className="sx-crm-top"><div><b>Sales pipeline</b><small>Every opportunity, one view</small></div><span><Search size={12} />Search leads</span><button type="button"><Plus size={12} />Add lead</button></div>
        <div className="sx-lanes">
          {LANES.map((lane, li) => (
            <div className="sx-lane" key={lane.name}>
              <div className="sx-lane-head"><b>{lane.name}</b><span>{lane.n + (li === 1 && moved ? 1 : li === 0 && moved ? -1 : 0)}</span></div>
              {lane.cards.map(([ini, name, src, score], ci) => (
                <motion.div key={name as string} layout className="sx-lead" transition={{ type: 'spring', stiffness: 260, damping: 28 }}>
                  <span className={'sx-avatar sm t' + ((li * 2 + ci) % 4)}>{ini}</span>
                  <span className="sx-lead-text"><b>{name}</b><small>{src}</small></span>
                  <span className={'sx-score ' + ((score as number) > 85 ? 'hot' : '')}><Sparkles size={9} />{score}</span>
                </motion.div>
              ))}
              {li === 0 && (
                <motion.div className="sx-lead moving" animate={moved ? { opacity: 0, x: 40, scale: 0.96 } : { opacity: 1, x: 0, scale: 1 }} transition={{ duration: 0.6, ease: EASE }}>
                  <span className="sx-avatar sm t3">RD</span><span className="sx-lead-text"><b>Riya Desai</b><small>Website · just now</small></span><span className="sx-score hot"><Sparkles size={9} />94</span>
                </motion.div>
              )}
              {li === 1 && (
                <motion.div className="sx-lead moving" initial={false} animate={moved ? { opacity: 1, x: 0, scale: 1 } : { opacity: 0, x: -40, scale: 0.96 }} transition={{ duration: 0.6, ease: EASE }}>
                  <span className="sx-avatar sm t3">RD</span><span className="sx-lead-text"><b>Riya Desai</b><small>Qualified by AI</small></span><span className="sx-score hot"><Sparkles size={9} />94</span>
                </motion.div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

/* ───────────── Lead capture ───────────── */

export const CaptureMock: React.FC = () => {
  const [ref, visible] = useOnScreen<HTMLDivElement>(0.3);
  const [step, setStep] = useCycle(4, 1700, visible);
  return (
    <div ref={ref} className="sx-window sx-capture">
      <WindowBar title="Website lead capture" meta="Form + chat widget" />
      <div className="sx-capture-body">
        <div className="sx-capture-form">
          <b>Request a consultation</b><small>Tell us a little about you</small>
          {['Full name', 'Work email', 'How can we help?'].map((f, i) => (
            <div key={f} className={'sx-field ' + (step > i ? 'filled' : step === i ? 'focus' : '')}><span>{f}</span>{step > i && <Check size={12} />}</div>
          ))}
          <button type="button" className={step === 3 ? 'press' : ''}>Send enquiry</button>
        </div>
        <div className="sx-capture-flow">
          <AnimatePresence>
            {step === 3 && (
              <motion.div className="sx-capture-toast" initial={{ opacity: 0, y: 14, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4, ease: EASE }}>
                <Bell size={14} /><span><b>New lead captured</b><small>Assigned to Sales · AI score 86</small></span>
              </motion.div>
            )}
          </AnimatePresence>
          <div className="sx-widget"><div className="sx-widget-head"><Bot size={13} /> Chat with us<i /></div><div className="sx-bubble in sm">Hi! How can we help today?</div><div className="sx-bubble out sm">Do you offer team plans?</div><div className="sx-bubble ai sm"><small><Sparkles size={9} /> AI</small>Yes! Let me find the best fit for you.</div></div>
        </div>
      </div>
    </div>
  );
};

/* ───────────── Scheduling ───────────── */

export const ScheduleMock: React.FC = () => {
  const [ref, visible] = useOnScreen<HTMLDivElement>(0.3);
  const days = useMemo(() => Array.from({ length: 28 }, (_, i) => i + 1), []);
  const slots = ['10:00', '11:30', '14:00', '16:30'];
  const [slot, setSlot] = useCycle(slots.length, 2200, visible);
  const [day, setDay] = useCycle(5, 8800, visible);
  const dayN = [10, 12, 17, 19, 24][day];
  return (
    <div ref={ref} className="sx-window sx-schedule">
      <WindowBar title="Book a product demo" meta="30-minute walkthrough" />
      <div className="sx-schedule-body">
        <div className="sx-cal">
          <div className="sx-cal-head"><b>November 2026</b><span>‹ ›</span></div>
          <div className="sx-cal-grid">
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <small key={i}>{d}</small>)}
            {days.map((d) => <button type="button" key={d} className={d === dayN ? 'sel' : [10, 12, 17, 19, 24].includes(d) ? 'avail' : ''} onClick={() => { const n = [10, 12, 17, 19, 24].indexOf(d); if (n >= 0) setDay(n); }}>{d}</button>)}
          </div>
        </div>
        <div className="sx-slots">
          <small>AVAILABLE · {dayN} NOV</small>
          {slots.map((s, i) => <button type="button" key={s} className={i === slot ? 'on' : ''} onClick={() => setSlot(i)}><Clock3 size={12} />{s}{i === slot && <Check size={13} className="sx-slot-check" />}</button>)}
          <div className="sx-confirm"><CalendarCheck size={14} /><span><b>Confirmed</b><small>Reminder + meeting link sent</small></span></div>
          <div className="sx-sync"><Calendar size={12} />Synced with Google Calendar & Outlook</div>
        </div>
      </div>
    </div>
  );
};

/* ───────────── Analytics ───────────── */

export const AnalyticsMock: React.FC = () => {
  const [ref, visible] = useSeenOnce<HTMLDivElement>(0.3);
  const reduced = useReducedMotion();
  const line = 'M0,150 C40,140 60,120 100,112 S160,70 200,78 S260,40 310,34 S380,52 420,20';
  const line2 = 'M0,165 C40,160 80,150 120,142 S180,120 220,118 S300,96 340,92 S400,84 420,70';
  return (
    <div ref={ref} className="sx-window sx-analytics">
      <WindowBar title="Growth analytics" meta="Last 30 days" />
      <div className="sx-analytics-body">
        <div className="sx-kpis">
          {[['Total leads', 4892, '', '+22%'], ['Bookings', 318, '', '+42%'], ['Conversion', 8.4, '%', '+18%']].map(([l, v, s, d]) => (
            <div key={l as string}><small>{l}</small><b>{visible ? <CountUp to={v as number} suffix={s as string} decimals={s === '%' ? 1 : 0} /> : '0'}</b><em><TrendingUp size={11} />{d}</em></div>
          ))}
        </div>
        <div className="sx-chart">
          <div className="sx-chart-head"><b>Campaign performance</b><span><i className="a" />Replies<i className="b" />Bookings</span></div>
          <svg viewBox="0 0 420 180" preserveAspectRatio="none" role="img" aria-label="Rising performance chart">
            <defs>
              <linearGradient id="sx-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#8f5bff" stopOpacity=".42" /><stop offset="1" stopColor="#8f5bff" stopOpacity="0" /></linearGradient>
              <linearGradient id="sx-stroke" x1="0" x2="1"><stop offset="0" stopColor="#3b6cff" /><stop offset="1" stopColor="#f06bd8" /></linearGradient>
            </defs>
            {[40, 80, 120, 160].map((y) => <line key={y} x1="0" x2="420" y1={y} y2={y} stroke="rgba(255,255,255,.07)" />)}
            <motion.path d={line + ' L420,180 L0,180 Z'} fill="url(#sx-area)" initial={reduced ? false : { opacity: 0 }} animate={{ opacity: visible ? 1 : 0 }} transition={{ duration: 1.2, delay: 0.5 }} />
            <motion.path d={line2} fill="none" stroke="#5a79ff" strokeWidth="2" strokeDasharray="5 6" strokeLinecap="round" initial={reduced ? false : { pathLength: 0 }} animate={{ pathLength: visible ? 1 : 0 }} transition={{ duration: 1.6, ease: EASE }} />
            <motion.path d={line} fill="none" stroke="url(#sx-stroke)" strokeWidth="3" strokeLinecap="round" initial={reduced ? false : { pathLength: 0 }} animate={{ pathLength: visible ? 1 : 0 }} transition={{ duration: 1.8, ease: EASE }} />
            <motion.circle r="5" fill="#fff" stroke="#8f5bff" strokeWidth="3" cx="420" cy="20" initial={false} animate={{ opacity: visible ? 1 : 0, scale: visible ? [1, 1.35, 1] : 0 }} transition={{ delay: 1.8, duration: 1.8, repeat: Infinity }} />
          </svg>
        </div>
        <div className="sx-bars">
          {[['WhatsApp', 86], ['Email', 64], ['Instagram', 48], ['Website', 72]].map(([n, p], i) => (
            <div key={n as string}><span>{n}</span><i><motion.u initial={reduced ? false : { width: 0 }} animate={{ width: visible ? `${p}%` : 0 }} transition={{ duration: 1.1, delay: 0.3 + i * 0.12, ease: EASE }} /></i><b>{p}%</b></div>
          ))}
        </div>
      </div>
    </div>
  );
};

/* ───────────── Orbit (integrations / platform) ───────────── */

const ORBIT_ITEMS = [
  { n: 'WhatsApp', i: MessageCircle, c: 'wa' }, { n: 'Instagram', i: Instagram, c: 'ig' }, { n: 'Messenger', i: Facebook, c: 'fb' },
  { n: 'Email', i: Mail, c: 'mail' }, { n: 'Calendar', i: CalendarCheck, c: 'cal' }, { n: 'Website', i: Globe, c: 'web' },
];

export const OrbitMock: React.FC<{ items?: { n: string; i: React.ComponentType<{ size?: number }>; c: string }[]; center?: string }> = ({ items = ORBIT_ITEMS, center = 'Connected workspace' }) => (
  <div className="sx-orbit" role="img" aria-label="Connected channels around the Amaavigo workspace">
    <div className="sx-orbit-ring r1" /><div className="sx-orbit-ring r2" />
    <div className="sx-orbit-core"><span>a</span><small>{center}</small></div>
    {items.map((it, idx) => {
      const I = it.i;
      return (
        <div className="sx-orbit-slot" key={it.n} style={{ ['--a' as any]: `${(360 / items.length) * idx}deg` }}>
          <div className={'sx-orbit-node ' + it.c}><I size={18} /><b>{it.n}</b></div>
        </div>
      );
    })}
  </div>
);

export const PLATFORM_ITEMS = [
  { n: 'Inbox', i: Inbox, c: 'cal' }, { n: 'AI Agent', i: Sparkles, c: 'ig' }, { n: 'CRM', i: Users, c: 'fb' },
  { n: 'Campaigns', i: Send, c: 'wa' }, { n: 'Scheduling', i: CalendarCheck, c: 'web' }, { n: 'Analytics', i: BarChart3, c: 'mail' },
];

/* ───────────── Automation flow ───────────── */

export const FlowMock: React.FC = () => {
  const [ref, visible] = useOnScreen<HTMLDivElement>(0.3);
  const nodes = [
    { i: Globe, t: 'New enquiry', d: 'Form, chat or message' },
    { i: Bot, t: 'AI qualifies', d: 'Scores intent & fit' },
    { i: Users, t: 'Assign owner', d: 'Routes to the right rep' },
    { i: Mail, t: 'Follow-up sent', d: 'Email or WhatsApp' },
    { i: CalendarCheck, t: 'Meeting booked', d: 'Synced to calendar' },
  ];
  const [active] = useCycle(nodes.length, 1500, visible);
  return (
    <div ref={ref} className="sx-flow">
      <div className="sx-flow-line"><motion.i animate={{ width: `${(active / (nodes.length - 1)) * 100}%` }} transition={{ duration: 0.8, ease: EASE }} /></div>
      {nodes.map((n, idx) => {
        const I = n.i;
        return (
          <div key={n.t} className={'sx-flow-node ' + (idx <= active ? 'on' : '') + (idx === active ? ' now' : '')}>
            <span><I size={20} /></span><b>{n.t}</b><small>{n.d}</small>
          </div>
        );
      })}
    </div>
  );
};

export const MiniIcons = { Workflow, Sparkles, Zap };
