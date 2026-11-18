import React, { useEffect, useRef, useState } from 'react';
import { Activity, ArrowUpRight, Bot, CalendarClock, History, Lightbulb, Loader2, MessageSquareText, PanelLeftClose, PanelLeftOpen, Plus, X } from 'lucide-react';
import { useAgent } from '../context/AgentContext';
import type { ActiveTab } from './Navbar';

interface DashboardAiHomeHeroProps {
  userName?: string;
  canUseAi: boolean;
  onNavigate: (tab: ActiveTab) => void;
}

const QUICK_TASKS = [
  { label: 'Analyze my workspace', prompt: 'Analyze my workspace performance. Review the available CRM, conversations, campaign, follow-up and demo data, then give me the most important insights and recommended next actions.' },
  { label: 'Plan a campaign', prompt: 'Help me plan a campaign using the lead databases and brand assets available in my workspace. Recommend an audience and campaign approach first. Do not send anything without my approval.' },
  { label: 'Find leads to follow up', prompt: 'Review my CRM leads and identify the highest-priority leads that need follow-up. Explain why each one needs attention and recommend the next action.' },
];


/**
 * Lightweight, responsive particle-wave field for the Home AI hero.
 * It uses one transparent Canvas 2D layer, so no WebGL runtime or dependency
 * is needed. The CSS glow underneath remains the graceful static fallback.
 */
const AiParticleWaveBackground: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = canvas?.parentElement;
    if (!canvas || !host) return;

    let context = canvas.getContext('2d', { alpha: true, desynchronized: true });
    if (!context) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let width = 0;
    let height = 0;
    let pixelRatio = 1;
    let frameId = 0;
    let lastFrameAt = 0;
    let visible = true;
    let disposed = false;
    let contextAvailable = true;
    let columns = 20;
    let rows = 12;
    let pointGroups: Array<{ side: 0 | 1; points: Array<{ col: number; row: number; u: number; v: number; x: number; y: number; alpha: number; depth: number }> }> = [];

    const smoothstep = (edge0: number, edge1: number, value: number) => {
      const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
      return t * t * (3 - 2 * t);
    };

    const buildGrid = () => {
      pointGroups = ([0, 1] as const).map((side) => ({
        side,
        points: Array.from({ length: columns * rows }, (_, index) => {
          const col = index % columns;
          const row = Math.floor(index / columns);
          return {
            col,
            row,
            u: col / Math.max(1, columns - 1),
            v: row / Math.max(1, rows - 1),
            x: 0,
            y: 0,
            alpha: 0,
            depth: row / Math.max(1, rows - 1),
          };
        }),
      }));
    };

    const resize = () => {
      const rect = host.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      const smallScreen = width < 600;
      const tablet = width < 980;
      columns = smallScreen ? 11 : tablet ? 16 : 21;
      rows = smallScreen ? 8 : tablet ? 10 : 12;
      pixelRatio = Math.min(window.devicePixelRatio || 1, smallScreen ? 1.25 : 1.6);
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      canvas.style.width = width + 'px';
      canvas.style.height = height + 'px';
      context = canvas.getContext('2d', { alpha: true, desynchronized: true });
      if (!context) {
        contextAvailable = false;
        return;
      }
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      contextAvailable = true;
      buildGrid();
      if (reducedMotion.matches) drawFrame(0);
    };

    const positionPoints = (time: number) => {
      for (const group of pointGroups) {
        const leftSide = group.side === 0;
        for (const point of group.points) {
          const depth = point.depth;
          const u = point.u;
          const xUnit = leftSide ? 0.015 + u * 0.405 : 0.58 + u * 0.405;
          const horizontalFlow =
            Math.sin(u * 8.3 + time * 0.30 + point.row * 0.39 + group.side * 1.8) * 0.52 +
            Math.sin(u * 3.4 - time * 0.21 + point.row * 0.67 + group.side) * 0.31 +
            Math.sin(u * 14.0 + time * 0.13 - point.row * 0.22) * 0.17;
          const verticalEnvelope = 0.28 + depth * 0.72;
          const amplitude = height * (0.045 + depth * 0.018);
          const yUnit = 0.53 + depth * 0.48;
          point.x = width * xUnit + Math.sin(time * 0.18 + point.row * 0.4 + u * 4) * (2 + depth * 3);
          point.y = height * yUnit + horizontalFlow * amplitude * verticalEnvelope;

          const centerFade = leftSide
            ? 1 - smoothstep(0.69, 1, u)
            : smoothstep(0, 0.31, u);
          const edgeFade = leftSide
            ? smoothstep(0, 0.11, u)
            : 1 - smoothstep(0.89, 1, u);
          const verticalFade = 0.20 + depth * 0.80;
          const shimmer = 0.88 + 0.12 * Math.sin(time * 0.62 + point.col * 0.72 + point.row * 0.91);
          point.alpha = Math.max(0, Math.min(1, centerFade * edgeFade * verticalFade * shimmer));
        }
      }
    };

    const drawFrame = (time: number) => {
      if (!context || !contextAvailable || width <= 1 || height <= 1) return;
      const ctx = context;
      ctx.clearRect(0, 0, width, height);
      positionPoints(time);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';

      for (const group of pointGroups) {
        const leftSide = group.side === 0;
        const baseColor = leftSide ? '139,53,255' : '8,123,255';
        const brightColor = leftSide ? '190,108,255' : '0,200,255';
        const at = (col: number, row: number) => group.points[row * columns + col];

        // Fine triangulated mesh across a deforming wave surface.
        for (let row = 0; row < rows; row++) {
          for (let col = 0; col < columns; col++) {
            const point = at(col, row);
            if (col < columns - 1) {
              const next = at(col + 1, row);
              const pulse = 0.5 + 0.5 * Math.sin(time * 0.76 + col * 0.57 + row * 0.43 + group.side);
              const alpha = Math.min(point.alpha, next.alpha) * (0.095 + pulse * 0.105);
              ctx.strokeStyle = 'rgba(' + baseColor + ',' + alpha.toFixed(3) + ')';
              ctx.lineWidth = 0.55 + point.depth * 0.12;
              ctx.beginPath();
              ctx.moveTo(point.x, point.y);
              ctx.lineTo(next.x, next.y);
              ctx.stroke();

              // A very soft travelling spark on each row, not a flashing strobe.
              const travel = (time * 0.048 + row * 0.071 + group.side * 0.37) % 1;
              const pulseColumn = Math.floor(travel * (columns - 1));
              if (col === pulseColumn) {
                const mix = travel * (columns - 1) - pulseColumn;
                const px = point.x + (next.x - point.x) * mix;
                const py = point.y + (next.y - point.y) * mix;
                const pulseAlpha = Math.min(point.alpha, next.alpha) * 0.58;
                ctx.fillStyle = 'rgba(' + brightColor + ',' + pulseAlpha.toFixed(3) + ')';
                ctx.shadowColor = 'rgba(' + brightColor + ',.72)';
                ctx.shadowBlur = 8;
                ctx.beginPath();
                ctx.arc(px, py, 1.15 + point.depth * 0.45, 0, Math.PI * 2);
                ctx.fill();
                ctx.shadowBlur = 0;
              }
            }
            if (row < rows - 1) {
              const below = at(col, row + 1);
              const pulse = 0.5 + 0.5 * Math.sin(time * 0.58 + col * 0.34 - row * 0.61);
              const alpha = Math.min(point.alpha, below.alpha) * (0.075 + pulse * 0.085);
              ctx.strokeStyle = 'rgba(' + baseColor + ',' + alpha.toFixed(3) + ')';
              ctx.lineWidth = 0.5;
              ctx.beginPath();
              ctx.moveTo(point.x, point.y);
              ctx.lineTo(below.x, below.y);
              ctx.stroke();

              if (col < columns - 1 && (col + row) % 2 === 0) {
                const diagonal = at(col + 1, row + 1);
                const diagonalAlpha = Math.min(point.alpha, diagonal.alpha) * 0.065;
                ctx.strokeStyle = 'rgba(' + baseColor + ',' + diagonalAlpha.toFixed(3) + ')';
                ctx.beginPath();
                ctx.moveTo(point.x, point.y);
                ctx.lineTo(diagonal.x, diagonal.y);
                ctx.stroke();
              }
            }
          }
        }

        // Fine particles with occasional brighter nodes for a sense of depth.
        for (const point of group.points) {
          if (point.alpha < 0.025) continue;
          const twinkle = 0.82 + 0.18 * Math.sin(time * 0.68 + point.col * 0.86 + point.row * 1.12);
          const alpha = point.alpha * twinkle;
          const radius = 0.52 + point.depth * 0.56;
          const featured = (point.col * 17 + point.row * 11 + group.side * 7) % 31 === 0;
          ctx.fillStyle = 'rgba(' + (featured ? brightColor : baseColor) + ',' + (alpha * (featured ? 0.78 : 0.43)).toFixed(3) + ')';
          if (featured) {
            ctx.shadowColor = 'rgba(' + brightColor + ',.65)';
            ctx.shadowBlur = 6;
          }
          ctx.beginPath();
          ctx.arc(point.x, point.y, featured ? radius * 1.28 : radius, 0, Math.PI * 2);
          ctx.fill();
          if (featured) ctx.shadowBlur = 0;
        }
      }
      ctx.restore();
    };

    const stop = () => {
      if (frameId) window.cancelAnimationFrame(frameId);
      frameId = 0;
      lastFrameAt = 0;
    };

    const animate = (timestamp: number) => {
      if (disposed || !visible || document.hidden || reducedMotion.matches || !contextAvailable) {
        stop();
        return;
      }
      // Cap at 30fps: the particles are intentionally slow, and this saves GPU time.
      if (timestamp - lastFrameAt >= 1000 / 30) {
        lastFrameAt = timestamp;
        drawFrame(timestamp * 0.001);
      }
      frameId = window.requestAnimationFrame(animate);
    };

    const start = () => {
      stop();
      if (reducedMotion.matches) {
        drawFrame(0);
        return;
      }
      if (visible && !document.hidden && contextAvailable) {
        frameId = window.requestAnimationFrame(animate);
      }
    };

    const onVisibilityChange = () => {
      if (document.hidden) stop();
      else start();
    };
    const onReducedMotionChange = () => start();
    const onContextLost = (event: Event) => {
      event.preventDefault();
      contextAvailable = false;
      stop();
    };
    const onContextRestored = () => {
      context = canvas.getContext('2d', { alpha: true, desynchronized: true });
      contextAvailable = Boolean(context);
      if (context) {
        context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
        buildGrid();
        start();
      }
    };

    canvas.addEventListener('contextlost', onContextLost);
    canvas.addEventListener('contextrestored', onContextRestored);
    document.addEventListener('visibilitychange', onVisibilityChange);
    reducedMotion.addEventListener?.('change', onReducedMotionChange);

    const observer = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(resize)
      : null;
    if (observer) observer.observe(host);
    else window.addEventListener('resize', resize);

    const intersection = typeof IntersectionObserver !== 'undefined'
      ? new IntersectionObserver((entries) => {
          visible = entries.some((entry) => entry.isIntersecting);
          if (visible) start();
          else stop();
        }, { threshold: 0.01 })
      : null;
    if (intersection) intersection.observe(canvas);

    resize();
    start();

    return () => {
      disposed = true;
      stop();
      observer?.disconnect();
      intersection?.disconnect();
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      reducedMotion.removeEventListener?.('change', onReducedMotionChange);
      canvas.removeEventListener('contextlost', onContextLost);
      canvas.removeEventListener('contextrestored', onContextRestored);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="dashboard-ai-particle-wave"
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 0,
        width: '100%',
        height: '100%',
        display: 'block',
        opacity: 0.94,
        pointerEvents: 'none',
      }}
    />
  );
};

export const DashboardAiHomeHero: React.FC<DashboardAiHomeHeroProps> = ({ userName, canUseAi, onNavigate }) => {
  const { conversations, sending, loading, error, sendMessage, newConversation, selectConversation, clearError } = useAgent();
  const [prompt, setPrompt] = useState('');
  const [startingAgent, setStartingAgent] = useState(false);
  const [showChatHistory, setShowChatHistory] = useState(false);
  const [openingConversation, setOpeningConversation] = useState<string | null>(null);

  const openConversation = async (conversationId: string) => {
    if (openingConversation) return;
    setOpeningConversation(conversationId);
    try {
      await selectConversation(conversationId);
      setShowChatHistory(false);
      onNavigate('agent');
    } finally {
      setOpeningConversation(null);
    }
  };

  const startConversationFromHistory = async () => {
    if (startingAgent || sending) return;
    setStartingAgent(true);
    try {
      const conversationId = await newConversation('agent');
      if (!conversationId) return;
      setShowChatHistory(false);
      onNavigate('agent');
    } finally {
      setStartingAgent(false);
    }
  };

  const openAgentWithMessage = async (message?: string) => {
    if (!canUseAi || sending || startingAgent) return;
    clearError();
    setStartingAgent(true);
    const conversationId = await newConversation('agent');
    if (!conversationId) {
      setStartingAgent(false);
      return;
    }
    if (message) setPrompt('');
    setStartingAgent(false);
    onNavigate('agent');
    if (message) {
      // Reuse the exact conversation created above; do not create a second chat.
      void sendMessage(message, 'agent', [], conversationId);
    }
  };

  const submit = async (event?: React.FormEvent<HTMLFormElement>, override?: string) => {
    event?.preventDefault();
    const message = String(override ?? prompt).trim();
    if (!message || sending || startingAgent || !canUseAi) return;
    await openAgentWithMessage(message);
  };

  const startFresh = async () => {
    if (!canUseAi || sending || startingAgent) return;
    setPrompt('');
    await openAgentWithMessage();
  };

  return (
    <section className="dashboard-ai-hero relative isolate overflow-hidden rounded-2xl border border-white/10 text-white">
      <div
        className="dashboard-ai-hero-glow"
        aria-hidden="true"
        style={{
          background: 'radial-gradient(ellipse at 8% 94%, rgba(139,53,255,.22), transparent 39%), radial-gradient(ellipse at 94% 91%, rgba(0,135,255,.20), transparent 40%), linear-gradient(180deg, #07091f 0%, #090b27 100%)',
        }}
      />
      <AiParticleWaveBackground />
      {showChatHistory && <>
        <button type="button" aria-label="Close chat history" onClick={() => setShowChatHistory(false)} className="dashboard-home-history-backdrop absolute inset-0 z-20 cursor-default bg-[#03031a]/65 backdrop-blur-[2px]" />
        <aside id="dashboard-home-history" aria-label="All conversations" className="dashboard-home-history-panel absolute inset-y-0 left-0 z-30 flex w-[min(340px,88vw)] flex-col border-r border-white/10 bg-[#090927]/[.98] p-4 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-indigo-300/20 bg-indigo-400/10 text-indigo-200"><History className="h-4 w-4" /></span>
              <div><div className="text-[12px] font-semibold text-white">All conversations</div><div className="mt-0.5 text-[10px] text-blue-100/55">{conversations.length} saved chats</div></div>
            </div>
            <button type="button" onClick={() => setShowChatHistory(false)} aria-label="Close chat history" className="rounded-lg border border-white/10 p-2 text-blue-100/65 transition hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button>
          </div>
          <button type="button" onClick={() => void startConversationFromHistory()} disabled={!canUseAi || startingAgent || sending} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-indigo-300/25 bg-gradient-to-r from-[#6656e8] via-[#405fe9] to-[#087edc] px-3 py-2.5 text-[11px] font-semibold text-white shadow-lg shadow-blue-950/30 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45">
            <Plus className="h-4 w-4" /> New conversation
          </button>
          <div className="mt-4 flex items-center justify-between text-[9px] font-bold uppercase tracking-[.17em] text-blue-100/45"><span>Recent chats</span><span>{conversations.length}</span></div>
          <div className="mt-2 min-h-0 flex-1 space-y-1 overflow-y-auto pr-1 dashboard-home-history-list">
            {conversations.map((item) => {
              return <button key={item.id} type="button" disabled={Boolean(openingConversation)} onClick={() => void openConversation(item.id)} className="dashboard-home-history-item group w-full rounded-xl border border-transparent px-3 py-3 text-left transition hover:border-indigo-300/20 hover:bg-indigo-400/[.09] disabled:cursor-wait disabled:opacity-55">
                <span className="flex min-w-0 items-center gap-2"><MessageSquareText className="h-3.5 w-3.5 shrink-0 text-indigo-200/70" /><span className="min-w-0 flex-1 truncate text-[11px] font-medium text-blue-50/90">{item.title || 'New conversation'}</span><ArrowUpRight className="h-3 w-3 shrink-0 text-blue-100/25 opacity-0 transition group-hover:opacity-100" /></span>
                <span className="mt-1.5 block pl-[22px] text-[9px] text-blue-100/45">{new Date(item.updatedAt || item.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</span>
              </button>;
            })}
            {conversations.length === 0 && !loading && <div className="rounded-xl border border-dashed border-white/10 px-3 py-8 text-center"><MessageSquareText className="mx-auto h-5 w-5 text-blue-100/35" /><p className="mt-2 text-[11px] text-blue-100/65">Your conversations will appear here.</p></div>}
            {loading && conversations.length === 0 && <div className="flex items-center justify-center gap-2 py-8 text-[10px] text-blue-100/55"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading conversations…</div>}
          </div>
        </aside>
      </>}
      <div className="relative z-10 flex min-h-[370px] flex-col px-4 pb-7 pt-4 sm:min-h-[400px] sm:px-8 sm:pb-8 sm:pt-5">
        <div className="flex items-center justify-between gap-3">
          <button type="button" aria-expanded={showChatHistory} aria-controls="dashboard-home-history" onClick={() => setShowChatHistory((open) => !open)} className={'dashboard-home-history-toggle inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-[10px] font-semibold shadow-sm backdrop-blur transition ' + (showChatHistory ? 'border-indigo-200/40 bg-indigo-300/20 text-white' : 'border-white/20 bg-[#080824]/55 text-white/90 hover:border-indigo-200/40 hover:bg-indigo-300/10')}>
            {showChatHistory ? <PanelLeftClose className="h-3.5 w-3.5" /> : <PanelLeftOpen className="h-3.5 w-3.5" />}
            Chat history
            <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] text-blue-50/80">{conversations.length}</span>
          </button>
        </div>

        <div className="mx-auto mt-8 w-full max-w-[820px] text-center sm:mt-8">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[9px] font-bold uppercase tracking-[.18em] text-blue-100/90 backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_10px_rgba(110,231,183,.8)]" />
            Your AI workspace assistant
          </div>
          <h1 className="text-[30px] font-semibold leading-[1.1] tracking-[-.055em] text-white sm:text-[42px] lg:text-[48px]">
            Let&apos;s automate your success{userName ? ', ' + userName.split(' ')[0] : ''}.
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-[11px] leading-5 text-blue-100/75 sm:text-[12px]">
            Ask your AI Agent to understand your workspace, uncover opportunities and help you get work done.
          </p>

          <form onSubmit={(event) => void submit(event)} className="dashboard-ai-prompt mt-6 rounded-2xl border border-white/15 bg-[#05051f]/95 p-3 text-left shadow-[0_18px_55px_rgba(0,0,0,.38)] backdrop-blur-xl sm:mt-8 sm:p-4">
            <textarea
              value={prompt}
              disabled={!canUseAi || sending}
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void submit(); } }}
              placeholder="What would you like to accomplish today?"
              rows={2}
              maxLength={4000}
              aria-label="Ask your AI Agent"
              className="min-h-[62px] w-full resize-none border-0 bg-transparent px-1 py-1 text-[13px] leading-6 text-white outline-none placeholder:text-slate-400 focus:ring-0 sm:min-h-[74px] sm:text-[14px]"
            />
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => void startFresh()} title="Start a new AI conversation" className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/15 text-slate-300 transition hover:bg-white/10 hover:text-white disabled:opacity-40" disabled={!canUseAi || startingAgent || sending}><Plus className="h-4 w-4" /></button>
                <button type="button" onClick={() => onNavigate('agent')} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/15 px-2.5 text-[10px] font-medium text-slate-300 transition hover:bg-white/10 hover:text-white disabled:opacity-40" disabled={!canUseAi}><Bot className="h-3.5 w-3.5" /> Tools</button>
                <button type="button" onClick={() => setPrompt((value) => value ? value + ' Use the approved information and assets in my workspace as context.' : 'Use the approved information and assets in my workspace as context.')} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/15 px-2.5 text-[10px] font-medium text-slate-300 transition hover:bg-white/10 hover:text-white disabled:opacity-40" disabled={!canUseAi}><Lightbulb className="h-3.5 w-3.5" /> Add context</button>
                <button type="button" onClick={() => void submit(undefined, 'Help me plan a task and schedule the next steps for my workspace. First ask me for any deadline or timing details you need.')} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/15 px-2.5 text-[10px] font-medium text-slate-300 transition hover:bg-white/10 hover:text-white disabled:opacity-40" disabled={!canUseAi}><CalendarClock className="h-3.5 w-3.5" /> Schedule task</button>
              </div>
              <button type="submit" disabled={!canUseAi || !prompt.trim() || sending || startingAgent} aria-label="Send prompt to AI Agent" className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#0848ef] text-white shadow-[0_4px_16px_rgba(8,72,239,.35)] transition hover:bg-[#2864ff] disabled:cursor-not-allowed disabled:opacity-45">
                {sending || startingAgent ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUpRight className="h-4 w-4" />}
              </button>
            </div>
          </form>

          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            <span className="mr-1 text-[9px] text-blue-100/55">Try asking</span>
            {QUICK_TASKS.map((task) => <button key={task.label} type="button" onClick={() => setPrompt(task.prompt)} disabled={!canUseAi} className="rounded-full border border-white/15 bg-white/[.06] px-3 py-1.5 text-[9px] font-medium text-blue-50/85 transition hover:border-white/30 hover:bg-white/10">{task.label}</button>)}
          </div>

          {error && <div role="alert" className="mx-auto mt-3 flex max-w-[760px] items-start justify-between gap-3 rounded-lg border border-rose-300/25 bg-rose-950/50 px-3 py-2 text-left text-[10px] text-rose-100"><span>{error}</span><button type="button" onClick={clearError} aria-label="Dismiss AI error"><X className="h-3.5 w-3.5" /></button></div>}
          {!canUseAi && <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-amber-200/20 bg-amber-100/10 px-3 py-1.5 text-[9px] text-amber-100/80">AI Agent access is restricted by your workspace role or plan. Contact your administrator for access.</div>}
          {canUseAi && <div className="mt-4 inline-flex items-center gap-1.5 text-[9px] text-blue-100/45"><Activity className="h-3 w-3" /> Connected to your existing workspace AI Agent {loading ? '· Syncing' : '· Ready'}</div>}
        </div>
      </div>
    </section>
  );
};

export default DashboardAiHomeHero;
