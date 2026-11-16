import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  BarChart3,
  Check,
  CheckCircle2,
  Circle,
  Mail,
  MessageCircle,
  Play,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Users,
  Workflow,
  Zap,
} from 'lucide-react';
import './LandingShowcase.css';

const AGENT_EXAMPLES = [
  {
    label: 'Launch a product campaign',
    prompt: 'Prepare a product-launch campaign for our existing customers. Identify the right audience, create a premium email and WhatsApp message in our brand voice, then show me the complete campaign before sending.',
    steps: [
      'Review customer segments and recent engagement',
      'Select an audience using the saved CRM filters',
      'Draft the email campaign and subject line',
      'Prepare the WhatsApp message and call to action',
      'Assemble both previews for approval',
    ],
    result: 'Launch campaign package',
  },
  {
    label: 'Follow up with warm leads',
    prompt: 'Find leads who enquired but have not booked a demo. Review their latest conversations and prepare a helpful, personalised follow-up for each channel.',
    steps: [
      'Find open enquiries without a booked demo',
      'Review conversation history and lead context',
      'Group leads by intent and next best action',
      'Prepare personalised email and WhatsApp drafts',
      'Create a review-ready follow-up plan',
    ],
    result: 'Personalised follow-up plan',
  },
  {
    label: 'Understand campaign performance',
    prompt: 'Compare our recent campaigns. Explain what generated engagement, where prospects dropped off and which audience or message we should test next.',
    steps: [
      'Retrieve the selected campaign reports',
      'Compare delivery and engagement outcomes',
      'Review tracked replies and demo activity',
      'Identify patterns across audiences and messages',
      'Prepare a summary with suggested experiments',
    ],
    result: 'Campaign insights report',
  },
];

export const AiAgentExecutionShowcase: React.FC = () => {
  const [activeExample, setActiveExample] = useState(0);
  const [phase, setPhase] = useState<'complete' | 'running'>('complete');
  const [completed, setCompleted] = useState(AGENT_EXAMPLES[0].steps.length);
  const example = AGENT_EXAMPLES[activeExample];
  const progress = phase === 'complete' ? 100 : Math.round((completed / example.steps.length) * 100);

  useEffect(() => {
    if (phase !== 'running') return;
    if (completed >= example.steps.length) {
      setPhase('complete');
      return;
    }
    const timer = window.setTimeout(() => setCompleted((value) => value + 1), 720);
    return () => window.clearTimeout(timer);
  }, [phase, completed, example.steps.length]);

  const chooseExample = (index: number) => {
    setActiveExample(index);
    setCompleted(AGENT_EXAMPLES[index].steps.length);
    setPhase('complete');
  };

  const runExample = () => {
    setCompleted(0);
    setPhase('running');
  };

  return (
    <section className="av-ai-execution" id="ai-agent">
      <div className="av-ai-execution-glow av-ai-glow-one" />
      <div className="av-ai-execution-glow av-ai-glow-two" />
      <div className="av-showcase-container av-ai-execution-layout">
        <div className="av-ai-copy">
          <span className="av-showcase-kicker av-kicker-light"><Sparkles size={14} /> THE AMAAVIGO AI AGENT</span>
          <h2>One prompt.<br /><span>A whole workflow in motion.</span></h2>
          <p>Describe the outcome you want. The Agent can coordinate supported workspace actions, prepare the work and bring the result back for your review.</p>
          <div className="av-ai-example-list" aria-label="Example AI Agent prompts">
            {AGENT_EXAMPLES.map((item, index) => (
              <button
                key={item.label}
                type="button"
                className={activeExample === index ? 'is-active' : ''}
                onClick={() => chooseExample(index)}
              >
                <span>0{index + 1}</span>
                <b>{item.label}</b>
                <ArrowRight size={15} />
              </button>
            ))}
          </div>
          <a href="/ai-agents" className="av-showcase-text-link av-link-light">Explore the AI Agent <ArrowRight size={15} /></a>
        </div>

        <div className="av-agent-console">
          <div className="av-agent-console-head">
            <div className="av-agent-console-brand">
              <span><Sparkles size={17} /></span>
              <div><b>Amaavigo Agent</b><small>Workspace execution preview</small></div>
            </div>
            <span className="av-agent-mode"><i /> Human-controlled</span>
          </div>

          <div className="av-agent-context-row">
            <span>AVAILABLE CONTEXT</span>
            <b><Users size={12} /> CRM</b>
            <b><MessageCircle size={12} /> Inbox</b>
            <b><Mail size={12} /> Campaigns</b>
          </div>

          <div className="av-agent-prompt-panel">
            <div className="av-agent-prompt-label"><span>YOUR PROMPT</span><span>EXAMPLE {String(activeExample + 1).padStart(2, '0')}</span></div>
            <p>{example.prompt}</p>
          </div>

          <div className="av-agent-run-row">
            <div><span className="av-agent-live-dot" /> WORKFLOW EXECUTION</div>
            <button type="button" onClick={runExample} disabled={phase === 'running'}>
              {phase === 'running' ? <><Zap size={13} /> Running example</> : phase === 'complete' ? <><RotateCcw size={13} /> Replay execution</> : <><Play size={13} /> Run example</>}
            </button>
          </div>

          <div className="av-agent-progress-track"><i style={{ width: progress + '%' }} /></div>

          <div className="av-agent-step-list">
            {example.steps.map((step, index) => {
              const done = phase === 'complete' || index < completed;
              const running = phase === 'running' && index === completed;
              return (
                <div className={'av-agent-step' + (done ? ' is-done' : running ? ' is-running' : '')} key={step}>
                  <span className="av-agent-step-index">{String(index + 1).padStart(2, '0')}</span>
                  <span className="av-agent-step-icon">
                    {done ? <Check size={13} /> : running ? <span className="av-agent-spinner" /> : <Circle size={12} />}
                  </span>
                  <b>{step}</b>
                  <small>{done ? 'Prepared' : running ? 'Working' : 'Queued'}</small>
                </div>
              );
            })}
          </div>

          {phase === 'complete' ? (
            <div className="av-agent-result">
              <div className="av-agent-result-head">
                <span><CheckCircle2 size={15} /> EXECUTION PREVIEW COMPLETE</span>
                <b>{example.result}</b>
              </div>
              <div className="av-agent-output-grid">
                <div className="av-agent-output-card av-output-email">
                  <span><Mail size={13} /> EMAIL DRAFT</span>
                  <b>A new chapter for your customers.</b>
                  <small>Subject, message and branded creative prepared</small>
                </div>
                <div className="av-agent-output-card av-output-wa">
                  <span><MessageCircle size={13} /> WHATSAPP DRAFT</span>
                  <b>Your next favourite starts here.</b>
                  <small>Personalisation fields and CTA preview prepared</small>
                </div>
              </div>
              <div className="av-agent-approval-row">
                <ShieldCheck size={16} />
                <span><b>Ready for your review</b><small>No external messages are sent by this interactive example.</small></span>
                <em>APPROVAL REQUIRED</em>
              </div>
            </div>
          ) : (
            <div className="av-agent-running-note">
              <span className="av-agent-spinner" />
              <span><b>Preparing the requested work</b><small>Reviewing each step in this illustrative workflow…</small></span>
            </div>
          )}
          <div className="av-agent-console-foot"><Workflow size={13} /> Illustrative product walkthrough · actions depend on workspace permissions and connected channels</div>
        </div>
      </div>
    </section>
  );
};

export const CampaignStudioShowcase: React.FC = () => {
  const [activeChannel, setActiveChannel] = useState<'email' | 'whatsapp'>('email');

  return (
    <section className="av-campaign-vision" id="campaigns">
      <div className="av-campaign-vision-glow" />
      <div className="av-showcase-container">
        <div className="av-campaign-vision-heading">
          <span className="av-showcase-kicker"><Sparkles size={14} /> CAMPAIGN STUDIO</span>
          <h2>Campaigns that make every<br /><span>message feel designed.</span></h2>
          <p>Create polished email campaigns and on-brand WhatsApp templates in one connected workspace.</p>
        </div>

        <div className="av-campaign-concept-intro">
          <span><CheckCircle2 size={15} /> EMAIL CAMPAIGN BUILDER</span>
          <span><MessageCircle size={15} /> WHATSAPP TEMPLATE STUDIO</span>
          <span><ShieldCheck size={15} /> RESPONSIVE PREVIEWS</span>
        </div>

        <div className="av-campaign-native-head">
          <div>
            <span className="av-showcase-kicker"><Workflow size={14} /> FROM EDITOR TO CUSTOMER</span>
            <h3>See how each message comes together.</h3>
          </div>
          <div className="av-campaign-channel-tabs" role="tablist" aria-label="Choose a campaign preview">
            <button type="button" role="tab" aria-selected={activeChannel === 'email'} className={activeChannel === 'email' ? 'is-active' : ''} onClick={() => setActiveChannel('email')}><Mail size={14} /> Email creative</button>
            <button type="button" role="tab" aria-selected={activeChannel === 'whatsapp'} className={activeChannel === 'whatsapp' ? 'is-active' : ''} onClick={() => setActiveChannel('whatsapp')}><MessageCircle size={14} /> WhatsApp template</button>
          </div>
        </div>

        <div className="av-campaign-native-grid">
          <article className={'av-campaign-native-card' + (activeChannel === 'email' ? ' is-selected' : '')}>
            <div className="av-native-card-head"><span><Mail size={15} /> EMAIL CAMPAIGN</span><em>DESKTOP + MOBILE</em></div>
            <div className="av-native-email">
              <div className="av-native-email-brand"><b>ATELIER</b><small>LIVING</small><span>NEW COLLECTION</span></div>
              <div className="av-native-email-hero">
                <div className="av-native-room-art"><i /><i /><i /><span /></div>
                <div className="av-native-email-copy">
                  <small>MADE FOR THE WAY YOU LIVE</small>
                  <strong>Make room for what inspires.</strong>
                  <p>Thoughtful pieces. Softer spaces. A collection made to feel like home.</p>
                  <span>EXPLORE THE COLLECTION <ArrowRight size={11} /></span>
                </div>
              </div>
              <div className="av-native-products"><span /><span /><span /></div>
              <div className="av-native-email-footer">A considered collection · Made to be lived in</div>
            </div>
            <div className="av-native-card-foot"><span><CheckCircle2 size={13} /> Responsive layout preview</span><span>Editable content blocks</span></div>
          </article>

          <article className={'av-campaign-native-card' + (activeChannel === 'whatsapp' ? ' is-selected' : '')}>
            <div className="av-native-card-head"><span><MessageCircle size={15} /> WHATSAPP TEMPLATE</span><em>UTILITY / MARKETING</em></div>
            <div className="av-native-wa-stage">
              <div className="av-native-phone">
                <div className="av-native-phone-speaker" />
                <div className="av-native-wa-header"><span className="av-native-brand-avatar">L</span><span><b>LUMA</b><small>Business account</small></span><i>•••</i></div>
                <div className="av-native-wa-bubble">
                  <div className="av-native-product-art"><i /><i /><i /></div>
                  <span>YOUR DAILY RITUAL</span>
                  <b>Your daily ritual, reimagined.</b>
                  <p>Discover a thoughtful edit of everyday essentials, selected for the moments that matter.</p>
                  <small>11:24 AM · Delivered</small>
                </div>
                <div className="av-native-wa-actions"><span>Explore products <ArrowRight size={11} /></span><span>Chat with us <MessageCircle size={11} /></span></div>
              </div>
              <div className="av-native-wa-details">
                <span className="av-native-detail-label">TEMPLATE PREVIEW</span>
                <b>luma_product_discovery</b>
                <p>Hi {'{{first_name}}'}, discover a thoughtful edit of everyday essentials.</p>
                <div><CheckCircle2 size={13} /> Variable preview</div>
                <div><CheckCircle2 size={13} /> CTA button layout</div>
                <div><ShieldCheck size={13} /> Review before submission</div>
              </div>
            </div>
            <div className="av-native-card-foot"><span><CheckCircle2 size={13} /> Mobile-first preview</span><span>Template variables and CTAs</span></div>
          </article>
        </div>

        <div className="av-campaign-capabilities">
          <div><span><Workflow size={17} /></span><b>Drag-and-drop layout</b><small>Build around reusable content blocks</small></div>
          <div><span><ShieldCheck size={17} /></span><b>Brand consistency</b><small>Keep every message on-brand</small></div>
          <div><span><MessageCircle size={17} /></span><b>Channel-ready previews</b><small>Review desktop and mobile layouts</small></div>
          <div><span><BarChart3 size={17} /></span><b>Campaign insights</b><small>Connect engagement with outcomes</small></div>
        </div>
        <div className="av-campaign-vision-cta"><a href="/campaigns">Explore Campaigns <ArrowRight size={15} /></a><a href="/whatsapp">Explore WhatsApp Template Studio <ArrowRight size={15} /></a></div>
        <p className="av-campaign-disclaimer">The creative examples above are illustrative previews. Actual sending, template approval and reporting depend on the connected channel, provider rules and workspace permissions.</p>
      </div>
    </section>
  );
};
