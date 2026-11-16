import React, { useState } from 'react';
import {
  Activity, ArrowRight, ArrowUpRight, BarChart3, Bell, CalendarCheck,
  CheckCircle2, ChevronDown, Database, Facebook, Filter, Globe,
  Image, Inbox, Instagram, LayoutTemplate, Mail, MessageCircle, MousePointer2,
  Plus, Search, ShieldCheck, Sparkles, Target, Type, Users, Workflow,
} from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import './MarketingPages.css';

const rise = { hidden: { opacity: 0, y: 28 }, visible: { opacity: 1, y: 0 } };
const PageReveal: React.FC<{ children: React.ReactNode; className?: string; delay?: number }> = ({ children, className, delay = 0 }) => {
  const reduced = useReducedMotion();
  return <motion.div className={className} variants={rise} initial={reduced ? false : 'hidden'} whileInView="visible" viewport={{ once: true, amount: .12 }} transition={{ duration: reduced ? 0 : .7, delay, ease: [.22, 1, .36, 1] }}>{children}</motion.div>;
};
const Eyebrow: React.FC<{children:React.ReactNode; light?:boolean}> = ({children,light=false}) => <span className={light?'avx-eyebrow light':'avx-eyebrow'}><i/>{children}</span>;
const Action: React.FC<{href?:string;children:React.ReactNode;quiet?:boolean}> = ({href='/contact',children,quiet=false}) => <a className={quiet?'avx-action quiet':'avx-action'} href={href}>{children}<ArrowUpRight size={15}/></a>;
const Channels = () => <div className="avx-channel-icons"><span className="wa"><MessageCircle/></span><span className="ig"><Instagram/></span><span className="fb"><Facebook/></span><span className="em"><Mail/></span><span className="web"><Globe/></span></div>;

export const AIAgentMarketingPage: React.FC = () => {
  const [active, setActive] = useState(0);
  const reduced = useReducedMotion();
  const prompts = [
    { title: 'Prepare a follow-up campaign', prompt: 'Find leads who enquired but have not booked. Prepare a branded follow-up campaign and show me the draft.', steps: ['Review recent lead activity', 'Find the right audience', 'Prepare email and WhatsApp content', 'Create a campaign draft', 'Wait for approval before sending'] },
    { title: 'Create a WhatsApp template', prompt: 'Create a WhatsApp template for a new enquiry, with personalisation fields and a preview for review.', steps: ['Understand the template purpose', 'Draft message and variables', 'Create a sample preview', 'Save the template draft', 'Prepare it for Meta review'] },
    { title: 'Understand campaign performance', prompt: 'Compare recent campaigns, show what drove replies and booked meetings, and recommend the next action.', steps: ['Retrieve selected campaign data', 'Compare delivery and engagement', 'Review replies and tracked outcomes', 'Prepare an insight-led report', 'Recommend the next experiment'] },
  ];
  const selected = prompts[active];
  return <main className="avx-page avx-ai-page">
    <section className="avx-ai-hero">
      <div className="avx-ai-grid"/><div className="avx-ai-ambient a"/><div className="avx-ai-ambient b"/>
      <div className="avx-wrap avx-ai-layout">
        <PageReveal className="avx-ai-copy">
          <Eyebrow light>AMAAVIGO AI AGENT</Eyebrow>
          <h1>One prompt can move <span>the whole workflow.</span></h1>
          <p>Tell Amaavigo what you want to achieve. Your AI Agent can work across lead context, conversations, campaigns, CRM and reporting—while your team keeps control of important actions.</p>
          <div className="avx-actions"><Action>See the AI Agent in action</Action><Action href="/platform" quiet>Explore the platform</Action></div>
          <div className="avx-ai-trust"><ShieldCheck size={15}/> Permission-aware actions <i/> Human approval stays in control</div>
        </PageReveal>
        <PageReveal className="avx-ai-stage" delay={.12}>
          <div className="avx-ai-orbit orbit-one"/><div className="avx-ai-orbit orbit-two"/><div className="avx-ai-orbit orbit-three"/>
          <motion.div className="avx-ai-core" animate={reduced?{}:{y:[0,-9,0],rotate:[0,3,0,-3,0]}} transition={{duration:8,repeat:Infinity,ease:'easeInOut'}}>
            <div className="avx-ai-core-inner"><span>a</span><i/><b>AMAAVIGO AI</b></div>
          </motion.div>
          <div className="avx-ai-node node-engage"><span><MessageCircle/></span><b>Engage</b><small>Start conversations</small></div>
          <div className="avx-ai-node node-qualify"><span><Target/></span><b>Qualify</b><small>Find the right leads</small></div>
          <div className="avx-ai-node node-book"><span><CalendarCheck/></span><b>Book</b><small>Schedule meetings</small></div>
          <div className="avx-ai-node node-convert"><span><TrendingIcon/></span><b>Convert</b><small>Move deals forward</small></div>
          <div className="avx-ai-channel-label">CONNECTED WORKSPACE</div><Channels/>
          <div className="avx-ai-signal"><i/> Workflow prepared <span>Ready for review</span></div>
        </PageReveal>
      </div>
    </section>
    <section className="avx-ai-prompt-section"><div className="avx-wrap avx-ai-prompt-layout">
      <PageReveal><Eyebrow>FROM ONE INSTRUCTION</Eyebrow><h2>Give the goal.<br/><span>See the work take shape.</span></h2><p>Choose an example prompt to see how the agent can break a request into clear, reviewable steps across your workspace.</p>
        <div className="avx-prompt-options">{prompts.map((p,i)=><button key={p.title} className={active===i?'active':''} onClick={()=>setActive(i)}><span>0{i+1}</span>{p.title}<ArrowUpRight size={14}/></button>)}</div>
      </PageReveal>
      <PageReveal className="avx-agent-workspace" delay={.1}>
        <div className="avx-window-head"><span><i/><i/><i/></span><b><Sparkles size={14}/> AI Agent workspace</b><em>Balanced mode</em></div>
        <div className="avx-agent-context"><span>WORKSPACE CONTEXT</span><i/> Lead databases <i/> Conversations <i/> Campaigns <i/> CRM</div>
        <div className="avx-user-prompt"><small>YOUR INSTRUCTION</small><p>{selected.prompt}</p></div>
        <div className="avx-agent-steps-head"><b>Preparing your workflow</b><span><i/> Draft preview</span></div>
        <AnimatePresence mode="wait"><motion.div key={active} className="avx-agent-steps" initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}} transition={{duration:.22}}>{selected.steps.map((s,i)=><div key={s}><span>{String(i+1).padStart(2,'0')}</span><CheckCircle2 size={16}/><b>{s}</b><small>{i===selected.steps.length-1?'Approval gate':'Prepared'}</small></div>)}</motion.div></AnimatePresence>
        <div className="avx-agent-approval"><ShieldCheck size={17}/><span><b>You stay in control</b><small>External submissions, dispatch and other consequential actions follow workspace permissions and approval requirements.</small></span></div>
      </PageReveal>
    </div></section>
    <section className="avx-ai-capabilities"><div className="avx-wrap"><PageReveal className="avx-center-heading"><Eyebrow>WORK ACROSS THE WORKSPACE</Eyebrow><h2>Not another chatbot.<br/><span>A connected way to get work ready.</span></h2><p>One assistant for the tasks that connect customer acquisition, engagement and follow-through.</p></PageReveal>
      <div className="avx-ai-cap-grid">{[{icon:Database,title:'Understand your leads',copy:'Review lead records, saved databases and recent activity.'},{icon:Inbox,title:'Keep conversations moving',copy:'Use channel and customer context to prepare the next response.'},{icon:LayoutTemplate,title:'Create campaign drafts',copy:'Prepare branded email content and WhatsApp template previews.'},{icon:BarChart3,title:'Turn data into decisions',copy:'Summarise campaign performance and recommend practical next steps.'}].map((item,i)=>{const I=item.icon;return <PageReveal className="avx-ai-cap-card" key={item.title} delay={i*.06}><span><I size={19}/></span><b>{item.title}</b><p>{item.copy}</p></PageReveal>;})}</div>
    </div></section>
    <section className="avx-ai-bottom"><div className="avx-wrap avx-bottom-inner"><div><Eyebrow light>INTELLIGENCE WITH OVERSIGHT</Eyebrow><h2>Let AI handle the preparation.<br/><span>Keep the decisions yours.</span></h2></div><Action>Book a product demo</Action></div></section>
  </main>;
};
const TrendingIcon: React.FC = () => <Activity size={20}/>;

export const UnifiedInboxMarketingPage: React.FC = () => {
  const [filter,setFilter] = useState('All');
  const filters=['All','WhatsApp','Instagram','Messenger','Email'];
  const rows=[{initial:'AK',name:'Ayesha Khan',channel:'WhatsApp',preview:'I would like to know more about your service.',time:'Now',tone:'mint'},{initial:'IM',name:'Imran Mehta',channel:'Instagram',preview:'Can you share the available options?',time:'4m',tone:'violet'},{initial:'SR',name:'Sara Merchant',channel:'Messenger',preview:'Could we arrange a quick call?',time:'12m',tone:'peach'},{initial:'NK',name:'Neha Kapoor',channel:'Email',preview:'Thanks for sending the details.',time:'28m',tone:'blue'}];
  const shown=filter==='All'?rows:rows.filter(r=>r.channel===filter);
  return <main className="avx-page avx-inbox-page">
    <section className="avx-inbox-hero"><div className="avx-wrap">
      <div className="avx-inbox-hero-copy"><PageReveal><Eyebrow>UNIFIED INBOX</Eyebrow><h1>Every conversation.<br/><span>One powerful inbox.</span></h1><p>Bring WhatsApp, Instagram, Facebook Messenger, email and website conversations into one shared workspace—with AI assistance, human handoff and the complete customer context beside every reply.</p><div className="avx-actions"><Action>Explore Unified Inbox</Action><Action href="/ai-agents" quiet>Meet the AI Agent</Action></div></PageReveal></div>
      <PageReveal className="avx-inbox-product" delay={.12}>
        <div className="avx-inbox-product-top"><span><i/><i/><i/></span><b>amaavigo <em>/ Unified Inbox</em></b><div><Search size={13}/> Search conversations <Bell size={15}/></div></div>
        <div className="avx-inbox-app">
          <aside className="avx-inbox-sidebar"><b>a</b><span className="selected"><Inbox/></span><span><Users/></span><span><Sparkles/></span><span><Send/></span><span><BarChart3/></span></aside>
          <section className="avx-inbox-conversations"><div className="avx-inbox-title"><b>Conversations</b><small>All channels</small></div><div className="avx-inbox-filters">{filters.map(f=><button key={f} className={filter===f?'selected':''} onClick={()=>setFilter(f)}>{f}</button>)}</div><div className="avx-inbox-search"><Search size={12}/> Search name or message</div>
            {shown.map(r=><div key={r.name} className="avx-inbox-row"><span className={'avx-avatar '+r.tone}>{r.initial}</span><span><b>{r.name}</b><small>{r.channel} · {r.preview}</small></span><em>{r.time}</em></div>)}
          </section>
          <section className="avx-inbox-chat"><div className="avx-chat-head"><span className="avx-avatar mint">AK</span><span><b>Ayesha Khan</b><small>WhatsApp · Active conversation</small></span><i>● Active</i></div><div className="avx-chat-date">TODAY · 10:42 AM</div><div className="avx-chat-bubble">Hi, I found your website and would like to understand how your service works.</div><div className="avx-chat-ai"><small><Sparkles size={12}/> AI SUGGESTED RESPONSE</small>Absolutely. I can walk you through the workflow and help identify the right next step for your team.</div><div className="avx-chat-booking"><CalendarCheck size={17}/><span><b>Meeting intent detected</b><small>Offer available demo times</small></span><ArrowUpRight size={14}/></div><div className="avx-chat-composer">Write a reply… <span><Plus size={14}/><ArrowUpRight size={14}/></span></div></section>
          <aside className="avx-inbox-profile"><small>CONTACT CONTEXT</small><span className="avx-avatar mint large">AK</span><b>Ayesha Khan</b><em>New opportunity</em><hr/><small>CHANNEL</small><b>WhatsApp</b><small>CONVERSATION STATUS</small><b className="green">Active</b><small>NEXT STEP</small><b>Qualify enquiry</b><button>View CRM profile <ArrowUpRight size={12}/></button></aside>
        </div>
        <div className="avx-inbox-floating"><span><ShieldCheck size={15}/></span><b>Human handoff built in</b><small>Team can take over at any time</small></div>
      </PageReveal>
    </div></section>
    <section className="avx-inbox-benefit-section"><div className="avx-wrap"><PageReveal className="avx-center-heading"><Eyebrow>MORE THAN A SHARED MAILBOX</Eyebrow><h2>One conversation view.<br/><span>Everything your team needs around it.</span></h2></PageReveal><div className="avx-inbox-benefits-grid">{[{icon:MessageCircle,title:'Every connected channel',copy:'Work across WhatsApp, Instagram, Messenger, email and website conversations.'},{icon:Sparkles,title:'AI-assisted replies',copy:'Prepare responses using configured knowledge and the context of the conversation.'},{icon:Users,title:'Human handoff',copy:'Assign conversations, pause automation and let a teammate take over.'},{icon:Database,title:'CRM context beside chat',copy:'Keep contact details, ownership, notes and next steps close to the conversation.'}].map((x,i)=>{const I=x.icon;return <PageReveal className="avx-inbox-benefit" key={x.title} delay={i*.05}><span><I size={19}/></span><b>{x.title}</b><p>{x.copy}</p></PageReveal>;})}</div></div></section>
    <section className="avx-inbox-bottom"><div className="avx-wrap avx-bottom-inner"><div><Eyebrow light>KEEP THE CONVERSATION MOVING</Eyebrow><h2>From first message to the next best action.</h2></div><Action>See Amaavigo in action</Action></div></section>
  </main>;
};

export const CampaignBuilderMarketingPage: React.FC<{initialTab?:'email'|'whatsapp'}> = ({initialTab='email'}) => {
  const [tab,setTab]=useState<'email'|'whatsapp'>(initialTab);
  const [block,setBlock]=useState('Text');
  return <main className="avx-page avx-campaign-page">
    <section className="avx-campaign-hero"><div className="avx-wrap">
      <div className="avx-campaign-intro"><PageReveal><Eyebrow>CAMPAIGN BUILDER</Eyebrow><h1>Create campaigns that look like <span>your brand.</span></h1><p>Design beautiful email campaigns, create your own WhatsApp templates, choose the right audience and coordinate follow-ups—all in one visual workspace.</p><div className="avx-actions"><Action>Explore Campaign Builder</Action><Action href="/ai-agents" quiet>Generate a draft with AI</Action></div><div className="avx-campaign-proof"><span><CheckCircle2/> Visual email design</span><span><CheckCircle2/> Custom WhatsApp templates</span><span><CheckCircle2/> Audience snapshots</span></div></PageReveal></div>
      <PageReveal className="avx-builder-window" delay={.1}>
        <div className="avx-builder-top"><span><i/><i/><i/></span><b>Campaign Studio <small>/ New campaign</small></b><div><button>Save draft</button><button className="primary">Review campaign <ArrowRight size={12}/></button></div></div>
        <div className="avx-builder-stepbar"><span className="active">01 <b>Design</b></span><i/><span>02 <b>Audience</b></span><i/><span>03 <b>Schedule</b></span><i/><span>04 <b>Review & send</b></span></div>
        <div className="avx-builder-tabs"><button className={tab==='email'?'active':''} onClick={()=>setTab('email')}><Mail size={14}/> Email campaign</button><button className={tab==='whatsapp'?'active':''} onClick={()=>setTab('whatsapp')}><MessageCircle size={14}/> WhatsApp template</button><span>Live preview</span></div>
        <div className="avx-builder-workspace">
          <aside className="avx-builder-tools"><small>CONTENT BLOCKS</small>{[{n:'Text',i:Type},{n:'Image',i:Image},{n:'Button',i:MousePointer2},{n:'Divider',i:Workflow},{n:'Social',i:Globe}].map(x=>{const I=x.i;return <button key={x.n} className={block===x.n?'active':''} onClick={()=>setBlock(x.n)}><I size={15}/>{x.n}</button>;})}<div className="avx-builder-ai"><Sparkles size={14}/><b>AI assist</b><small>Draft on-brand copy</small></div></aside>
          {tab==='email'?<div className="avx-email-canvas"><div className="avx-email-canvas-head"><span>DESKTOP PREVIEW · 600 PX</span><span>100%</span></div><div className="avx-email-design"><div className="avx-email-brand">YOUR BRAND <small>Thoughtful updates, made simple.</small></div><div className="avx-email-art"><span>THE NEXT CHAPTER</span><b>Make every<br/>conversation count.</b><i> </i></div><div className="avx-email-body"><small>{'HELLO {{first_name}},'}</small><h3>A better way to keep things moving.</h3><p>Share something useful, make the next step clear, and give your audience a reason to continue the conversation.</p><button>Explore what’s next <ArrowUpRight size={12}/></button><div className="avx-email-placeholder"><i/><i/><i/></div></div><div className="avx-email-foot">YOUR BRAND · YOUR MESSAGE · YOUR NEXT STEP</div></div></div>:<div className="avx-wa-builder"><div className="avx-wa-form"><small>WHATSAPP TEMPLATE SETUP</small><label>Template name <b>customer_follow_up</b></label><label>Category <b>Marketing <ChevronDown size={12}/></b></label><label>Header type <b><Image size={13}/> Image <ChevronDown size={12}/></b></label><label>Message body <b>Hi {'{{1}}'}, thanks for connecting with us. Here’s the next step…</b></label><label>Personalisation <b>{'{{1}}'} First name <Plus size={12}/></b></label><div className="avx-wa-note"><ShieldCheck size={13}/> Draft preview. Meta approval is required before eligible template sending.</div></div><div className="avx-wa-phone"><div className="avx-phone-head">Business account <small>online</small></div><div className="avx-phone-message"><div className="avx-phone-art"><Sparkles size={20}/><b>YOUR BRAND</b><span>Make the next step simple.</span></div><p>Hi Ayesha, thanks for connecting with us. Here’s the next step to keep things moving.</p><button>Continue <ArrowUpRight size={11}/></button><small>10:42 AM</small></div><div className="avx-phone-input">Message <Plus size={13}/></div></div></div>}
          <aside className="avx-builder-settings"><small>{tab==='email'?'DESIGN PROPERTIES':'TEMPLATE PREVIEW'}</small><b>{tab==='email'?'Content properties':'Message settings'}</b><div className="avx-setting-row">Selected block <strong>{block}</strong></div><div className="avx-setting-row">Brand colours <strong><i className="swatch blue"/><i className="swatch violet"/><i className="swatch orange"/></strong></div><div className="avx-setting-row">Personalisation <strong>On</strong></div><div className="avx-setting-row">Mobile preview <strong>Enabled</strong></div><div className="avx-setting-foot"><CheckCircle2 size={13}/> Changes preview instantly</div></aside>
        </div>
      </PageReveal>
    </div></section>
    <section className="avx-campaign-flow"><div className="avx-wrap"><PageReveal className="avx-center-heading"><Eyebrow>FROM IDEA TO IMPACT</Eyebrow><h2>Build it. Target it.<br/><span>Understand what happened next.</span></h2></PageReveal><div className="avx-campaign-flow-grid">{[{n:'01',t:'Design',d:'Create branded email creative and WhatsApp templates.',i:LayoutTemplate},{n:'02',t:'Choose audience',d:'Select a lead database and snapshot recipients for the campaign.',i:Users},{n:'03',t:'Automate',d:'Coordinate timing, follow-ups and campaign steps.',i:Workflow},{n:'04',t:'Measure',d:'Review delivery, engagement, replies and tracked outcomes.',i:BarChart3}].map((x,i)=>{const I=x.i;return <PageReveal key={x.t} className="avx-flow-card" delay={i*.06}><span>{x.n}</span><I size={20}/><b>{x.t}</b><p>{x.d}</p></PageReveal>;})}</div></div></section>
    <section className="avx-campaign-bottom"><div className="avx-wrap avx-bottom-inner"><div><Eyebrow light>YOUR BRAND. YOUR AUDIENCE. YOUR CAMPAIGN.</Eyebrow><h2>Make every campaign feel intentional.</h2></div><Action>Book a product demo</Action></div></section>
  </main>;
};

export const CrmMarketingPage: React.FC = () => {
  const [stage,setStage]=useState('All leads');
  const stages=['All leads','New leads','Qualified','Demo booked'];
  const cards=[{n:'AK',name:'Ayesha Khan',company:'Northstar Studio',stage:'New leads',src:'Website',tone:'mint'},{n:'IM',name:'Imran Patel',company:'Brightline Co.',stage:'Qualified',src:'Instagram',tone:'violet'},{n:'SM',name:'Sara Merchant',company:'Meridian Works',stage:'Qualified',src:'WhatsApp',tone:'peach'},{n:'ZS',name:'Zeeshan Khan',company:'Orbit Labs',stage:'Demo booked',src:'Messenger',tone:'blue'},{n:'NK',name:'Neha Kapoor',company:'Fieldnote Group',stage:'New leads',src:'Website',tone:'pink'},{n:'RA',name:'Rizwan Ali',company:'Goodform Digital',stage:'Demo booked',src:'Email',tone:'mint'}];
  const shown=stage==='All leads'?cards:cards.filter(c=>c.stage===stage);
  return <main className="avx-page avx-crm-page">
    <section className="avx-crm-hero"><div className="avx-wrap">
      <div className="avx-crm-intro"><PageReveal><Eyebrow>BUILT-IN CRM</Eyebrow><h1>Every lead. Every next step.<br/><span>All moving forward.</span></h1><p>A built-in CRM that keeps contact records, conversations, ownership, pipeline stages, notes and follow-ups connected—without making your team switch tools.</p><div className="avx-actions"><Action>Explore the built-in CRM</Action><Action href="/lead-capture" quiet>See lead capture</Action></div><div className="avx-crm-proof"><span><CheckCircle2/> Complete lead profiles</span><span><CheckCircle2/> Pipeline & ownership</span><span><CheckCircle2/> Reusable lead databases</span></div></PageReveal></div>
      <PageReveal className="avx-crm-window" delay={.12}>
        <div className="avx-crm-window-head"><b><Users size={15}/> CRM <span>/ Pipeline</span></b><div><Search size={13}/> Search leads <button><Plus size={12}/> Add lead</button></div></div>
        <div className="avx-crm-summary"><div><small>LEAD RECORDS</small><b>One connected view</b></div><div><small>PIPELINE</small><b>Clear next stages</b></div><div><small>FOLLOW-UP</small><b>Nothing gets lost</b></div><div><small>DATABASES</small><b>Audiences organised</b></div></div>
        <div className="avx-crm-board">
          {['New leads','Qualified','Demo booked'].map((col,i)=><div className={'avx-crm-lane lane-'+i} key={col}><header><b>{col}</b><span>{cards.filter(c=>c.stage===col).length.toString().padStart(2,'0')}</span><Filter size={12}/></header>{cards.filter(c=>c.stage===col).map(c=><article key={c.name}><div className="avx-crm-card-person"><span className={'avx-avatar '+c.tone}>{c.n}</span><span><b>{c.name}</b><small>{c.company}</small></span><button>···</button></div><div className="avx-crm-card-meta"><span>{c.src}</span><small>Next action <b>{c.stage==='Demo booked'?'Meeting':'Follow up'}</b></small></div></article>)}<button className="avx-crm-add"><Plus size={12}/> Add lead</button></div>)}
        </div>
        <div className="avx-crm-database"><Database size={17}/><span><b>Lead databases</b><small>Reusable audiences · Import history · Duplicate review · Campaign snapshots</small></span><ArrowUpRight size={15}/></div>
      </PageReveal>
    </div></section>
    <section className="avx-crm-deep"><div className="avx-wrap"><PageReveal className="avx-center-heading"><Eyebrow>MORE THAN A PIPELINE</Eyebrow><h2>Every lead has a story.<br/><span>Keep the full context together.</span></h2><p>Move beyond a list of names with connected records, activity and campaign-ready audiences.</p></PageReveal><div className="avx-crm-feature-grid">{[{icon:Users,title:'Lead profiles',copy:'Contact details, source, owner, notes and linked conversations.'},{icon:Workflow,title:'Flexible pipeline',copy:'Track stages, status, follow-up and the next action.'},{icon:Activity,title:'Activity history',copy:'Keep calls, messages, updates and customer touchpoints connected.'},{icon:Database,title:'Lead databases',copy:'Import, organise and select reusable audiences for campaigns.'}].map((x,i)=>{const I=x.icon;return <PageReveal className="avx-crm-feature" key={x.title} delay={i*.05}><span><I size={20}/></span><b>{x.title}</b><p>{x.copy}</p></PageReveal>;})}</div></div></section>
    <section className="avx-crm-bottom"><div className="avx-wrap avx-bottom-inner"><div><Eyebrow light>ONE CUSTOMER RECORD. A CONNECTED JOURNEY.</Eyebrow><h2>Give every lead a clear next step.</h2></div><Action>See Amaavigo in action</Action></div></section>
  </main>;
};

export const HowItWorksMarketingPage: React.FC = () => {
 const steps=[{n:'01',t:'Capture',d:'Bring enquiries from your website, connected channels and imported lead lists into one workspace.',i:Globe,tag:'A new lead arrives'},{n:'02',t:'Engage',d:'See every conversation in Unified Inbox. AI can prepare responses using your configured business knowledge.',i:Inbox,tag:'Conversation begins'},{n:'03',t:'Qualify',d:'Keep the customer context, lead record and team ownership together as intent becomes clear.',i:Target,tag:'Context gets connected'},{n:'04',t:'Book',d:'Coordinate availability and help the customer choose a suitable meeting time.',i:CalendarCheck,tag:'Next step confirmed'},{n:'05',t:'Grow',d:'Use CRM, campaigns and reporting to continue the relationship and understand the outcome.',i:BarChart3,tag:'Relationship continues'}];
 return <main className="avx-page avx-how-page"><section className="avx-simple-hero"><div className="avx-wrap"><PageReveal><Eyebrow>HOW IT WORKS</Eyebrow><h1>From the first enquiry<br/><span>to the next customer.</span></h1><p>A connected lead-to-revenue journey, with customer context carried from capture through conversation, qualification, booking and follow-up.</p><Action>See the platform in action</Action></PageReveal></div></section><section className="avx-how-flow"><div className="avx-wrap">{steps.map((s,i)=>{const I=s.i;return <PageReveal className="avx-how-step" key={s.n} delay={i*.04}><div className="avx-how-number">{s.n}</div><div className="avx-how-icon"><I size={22}/></div><div><small>{s.tag}</small><h2>{s.t}</h2><p>{s.d}</p></div><ArrowRight className="avx-how-arrow" size={20}/></PageReveal>;})}</div></section><section className="avx-how-bottom"><div className="avx-wrap avx-bottom-inner"><div><Eyebrow light>ONE CONNECTED WORKSPACE</Eyebrow><h2>Stop stitching the sales process together.</h2></div><Action>Book a product demo</Action></div></section></main>;
};

export const FaqMarketingPage: React.FC = () => {
 const items=[
 ['What is Amaavigo?','Amaavigo is an AI-powered lead-to-revenue workspace that connects lead capture, customer conversations, AI assistance, CRM, demo scheduling, campaigns and reporting.'],
 ['Which channels can I connect?','The platform supports WhatsApp, Instagram messaging, Facebook Messenger, email and website lead capture, subject to provider permissions and workspace configuration.'],
 ['Can the AI Agent handle conversations automatically?','The available operating mode depends on channel configuration. Teams can use automatic replies, review drafts before sending, or turn AI replies off where supported. Human handoff remains available.'],
 ['Can the AI Agent create campaigns from one prompt?','The AI Agent can prepare supported campaign drafts, message content and workflow steps. Sending, external submissions and other consequential actions remain subject to permissions and approval.'],
 ['Can I create my own WhatsApp templates?','Yes. Amaavigo includes a template creation workflow with custom message content, variables and previews. Meta approval is still required before eligible templates can be used for outbound messaging.'],
 ['Does Amaavigo include a CRM?','Yes. The built-in CRM keeps lead profiles, pipeline stages, ownership, notes, activities and follow-ups connected. Separate lead databases can be used to organise campaign audiences.'],
 ['Can campaigns use my own lead databases?','Yes. You can select a database when preparing a campaign. The selected audience is snapshotted for that campaign so its recipients are not silently changed by later database edits.'],
 ['Which calendars are supported?','Google Calendar and Microsoft 365 scheduling connections are supported, subject to account permissions and configuration.'],
 ['How does pricing work?','Published plans and allowances are managed in the platform catalog. AI usage and third-party messaging provider charges may be billed separately depending on configuration.'],
 ['Can a human take over from AI?','Yes. Human handoff, assignment and review controls are part of the conversation workflow where the channel and workspace settings support them.'],
 ];
 return <main className="avx-page avx-faq-page"><section className="avx-simple-hero"><div className="avx-wrap"><PageReveal><Eyebrow>FREQUENTLY ASKED QUESTIONS</Eyebrow><h1>Good questions.<br/><span>Clear answers.</span></h1><p>Learn how Amaavigo connects your leads, conversations, campaigns and customer workflows.</p><Action href="/contact">Talk to our team</Action></PageReveal></div></section><section className="avx-faq-body"><div className="avx-wrap avx-faq-layout"><PageReveal><Eyebrow>HELP & GUIDANCE</Eyebrow><h2>Everything you need to know<br/><span>before getting started.</span></h2><p>Still have a question? Our team can walk you through the relevant workflow.</p><a href="/contact">Contact Amaavigo <ArrowUpRight size={14}/></a></PageReveal><div className="avx-faq-accordion">{items.map(([q,a],i)=><details key={q} open={i===0}><summary><span>{q}</span><ChevronDown size={17}/></summary><p>{a}</p></details>)}</div></div></section><section className="avx-faq-bottom"><div className="avx-wrap avx-bottom-inner"><div><Eyebrow light>READY TO SEE IT IN ACTION?</Eyebrow><h2>Let’s map your lead-to-revenue workflow.</h2></div><Action>Book a product demo</Action></div></section></main>;
};
