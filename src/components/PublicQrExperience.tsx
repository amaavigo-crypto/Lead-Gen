import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { QrPageBlock, QrPageDocument, QrFormField } from '../shared/qrStudio';
import './qrStudio.css';

type RenderMode = 'public' | 'preview';
type PublicQrPayload = { success: boolean; redirectUrl?: string; qr?: { id: string; name: string; page: QrPageDocument }; error?: string };

function visitorKey(): string {
  try {
    const key = 'amaavigo.qr.visitor';
    let value = window.localStorage.getItem(key);
    if (!value) {
      value = window.crypto?.randomUUID?.() || `v_${Math.random().toString(36).slice(2)}_${Date.now()}`;
      window.localStorage.setItem(key, value);
    }
    return value;
  } catch {
    return `v_${Math.random().toString(36).slice(2)}_${Date.now()}`;
  }
}

function safeLink(value?: string): string {
  const raw = String(value || '').trim();
  if (raw.startsWith('/api/assets/')) return raw;
  try {
    const url = new URL(raw);
    return ['http:', 'https:', 'mailto:', 'tel:'].includes(url.protocol) ? raw : '';
  } catch {
    return '';
  }
}

function trackEvent(code: string, type: string, label?: string) {
  const payload = { type, visitorId: visitorKey(), userAgent: navigator.userAgent, referrer: document.referrer, label };
  fetch(`/api/qr/public/${encodeURIComponent(code)}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {});
}

function AnimationFrame({ animation, children, index = 0 }: { animation?: string; children: React.ReactNode; index?: number }) {
  const [visible, setVisible] = useState(animation !== 'scroll');
  const element = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (animation !== 'scroll' || !element.current) return;
    if (!('IntersectionObserver' in window)) { setVisible(true); return; }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    }, { threshold: 0.12 });
    observer.observe(element.current);
    return () => observer.disconnect();
  }, [animation]);
  const classes: Record<string, string> = {
    fade: 'qr-motion-fade',
    slide: 'qr-motion-slide',
    zoom: 'qr-motion-zoom',
    stagger: 'qr-motion-fade',
    float: 'qr-motion-float',
    parallax: 'qr-motion-parallax',
    scroll: `qr-motion-scroll ${visible ? 'qr-visible' : ''}`,
  };
  return <div ref={element} className={classes[animation || ''] || ''} style={{ animationDelay: `${Math.min(index * 90, 720)}ms` }}>{children}</div>;
}

function LottieBlock({ url }: { url?: string }) {
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!url || !container.current) return;
    let animation: any;
    let cancelled = false;
    const start = () => {
      const lottie = (window as any).lottie;
      if (cancelled || !lottie || !container.current) return;
      animation = lottie.loadAnimation({ container: container.current, renderer: 'svg', loop: true, autoplay: true, path: url });
    };
    const existing = document.querySelector<HTMLScriptElement>('script[data-qr-lottie]');
    if ((window as any).lottie) start();
    else if (existing) existing.addEventListener('load', start, { once: true });
    else {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/lottie-web@5.13.0/build/player/lottie_light.min.js';
      script.async = true;
      script.crossOrigin = 'anonymous';
      script.dataset.qrLottie = 'true';
      script.onload = start;
      document.head.appendChild(script);
    }
    return () => {
      cancelled = true;
      try { animation?.destroy(); } catch {}
    };
  }, [url]);
  return <div ref={container} className="mx-auto min-h-24 max-w-[420px]" aria-label="Animated illustration" />;
}

function FieldIsVisible(field: QrFormField, values: Record<string, string>): boolean {
  if (!field.showWhen?.fieldId) return true;
  const actual = String(values[field.showWhen.fieldId] || '').trim();
  const expected = String(field.showWhen.value || '').trim();
  switch (field.showWhen.operator) {
    case 'not_equals': return actual !== expected;
    case 'contains': return actual.toLowerCase().includes(expected.toLowerCase());
    case 'is_filled': return Boolean(actual);
    default: return actual === expected;
  }
}

function PublicForm({ block, code, mode }: { block: QrPageBlock; code?: string; mode: RenderMode }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [honeypot, setHoneypot] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const fields = block.fields || [];
  const visibleFields = fields.filter((field) => FieldIsVisible(field, values));
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (mode === 'preview') {
      setMessage('Preview mode — submissions are disabled.');
      return;
    }
    if (!code) return;
    setSubmitting(true);
    setMessage('');
    try {
      const response = await fetch(`/api/qr/public/${encodeURIComponent(code)}/leads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formBlockId: block.id, visitorId: visitorKey(), fields: Object.fromEntries(visibleFields.map((field) => [field.id, values[field.id] || ''])), website: honeypot }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Could not send your enquiry.');
      setMessage(result.message || 'Thanks — your enquiry has been sent.');
      setValues({});
      setHoneypot('');
    } catch (error: any) {
      setMessage(error?.message || 'Could not send your enquiry.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="qr-public-form">
      {block.title && <h2 className="mb-2 text-xl font-bold">{block.title}</h2>}
      {block.body && <p className="mb-5 text-sm opacity-75">{block.body}</p>}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="qr-honeypot" value={honeypot} onChange={(event) => setHoneypot(event.target.value)} />
      {visibleFields.map((field) => (
        <label className="mb-4 block text-sm" key={field.id}>
          <span className="mb-1.5 block font-semibold">{field.label}{field.required ? ' *' : ''}</span>
          {field.type === 'textarea' ? (
            <textarea rows={4} required={field.required} placeholder={field.placeholder} value={values[field.id] || ''} onChange={(event) => setValues((old) => ({ ...old, [field.id]: event.target.value }))} />
          ) : field.type === 'select' ? (
            <select required={field.required} value={values[field.id] || ''} onChange={(event) => setValues((old) => ({ ...old, [field.id]: event.target.value }))}>
              <option value="">Choose an option</option>
              {(field.options || []).map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          ) : field.type === 'checkbox' ? (
            <span className="flex items-center gap-2 rounded-xl border border-current/15 px-3 py-3">
              <input type="checkbox" required={field.required} checked={values[field.id] === 'true'} onChange={(event) => setValues((old) => ({ ...old, [field.id]: event.target.checked ? 'true' : '' }))} />
              <span>{field.placeholder || 'I agree'}</span>
            </span>
          ) : (
            <input type={field.type === 'email' ? 'email' : field.type === 'tel' ? 'tel' : field.type === 'number' ? 'number' : 'text'} required={field.required} placeholder={field.placeholder} value={values[field.id] || ''} onChange={(event) => setValues((old) => ({ ...old, [field.id]: event.target.value }))} />
          )}
        </label>
      ))}
      <button type="submit" disabled={submitting || mode === 'preview'} className="qr-primary-button w-full">
        {submitting ? 'Sending…' : 'Send enquiry'}
      </button>
      {message && <p role="status" className="mt-3 text-sm font-medium">{message}</p>}
    </form>
  );
}

export function QrExperienceRenderer({ page, code, mode = 'preview' }: { page: QrPageDocument; code?: string; mode?: RenderMode }) {
  const theme = page.theme;
  const backgroundStyle: React.CSSProperties = {
    backgroundColor: theme.backgroundColor,
    color: theme.textColor,
    fontFamily: theme.fontFamily,
    backgroundImage: theme.backgroundType === 'gradient' ? `linear-gradient(135deg, ${theme.gradientFrom}, ${theme.gradientTo})`
      : theme.backgroundType === 'image' && theme.backgroundImage ? `linear-gradient(rgba(5,12,30,.18),rgba(5,12,30,.18)),url("${theme.backgroundImage}")` : undefined,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  };
  Object.assign(backgroundStyle, { '--qr-accent': theme.accentColor, '--qr-button-text': theme.buttonTextColor });
  const action = (label: string) => {
    if (mode === 'public' && code) trackEvent(code, 'cta_click', label);
  };
  return (
    <div className="qr-experience min-h-full w-full" style={backgroundStyle}>
      {theme.backgroundType === 'video' && theme.backgroundVideo && (
        <video className="qr-experience-video" src={theme.backgroundVideo} autoPlay muted loop playsInline />
      )}
      <div className="qr-experience-content mx-auto w-full px-4 py-8 sm:px-6 sm:py-12" style={{ maxWidth: theme.contentWidth }}>
        {page.blocks.map((block, index) => (
          <AnimationFrame key={block.id} animation={block.animation} index={index}>
            {block.type === 'hero' && (
              <section className="qr-hero-block mb-6 text-center" style={{ borderRadius: theme.cardRadius }}>
                {block.imageUrl && <img src={block.imageUrl} alt="" className="mb-5 max-h-[340px] w-full rounded-2xl object-cover" loading="lazy" />}
                {block.label && <p className="mb-3 text-xs font-bold uppercase tracking-[.18em] opacity-70">{block.label}</p>}
                <h1 className="text-3xl font-extrabold leading-tight tracking-tight sm:text-5xl">{block.title || page.title}</h1>
                {block.body && <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed opacity-80 sm:text-lg">{block.body}</p>}
                {block.href && <a href={safeLink(block.href) || '#'} onClick={() => action(block.label || 'Hero action')} className="qr-primary-button mt-6 inline-flex">{block.label || 'Explore now'}</a>}
              </section>
            )}
            {block.type === 'text' && (
              <section className="qr-content-card mb-5 p-5 sm:p-7" style={{ borderRadius: theme.cardRadius, backgroundColor: block.backgroundColor || 'rgba(255,255,255,.76)' }}>
                {block.title && <h2 className="mb-3 text-xl font-bold">{block.title}</h2>}
                <p className="whitespace-pre-wrap text-sm leading-7">{block.body}</p>
              </section>
            )}
            {block.type === 'image' && block.imageUrl && <img src={block.imageUrl} alt={block.title || ''} className="mb-5 max-h-[560px] w-full rounded-2xl object-cover" loading="lazy" />}
            {block.type === 'gallery' && (
              <section className="mb-6">
                {block.title && <h2 className="mb-3 text-xl font-bold">{block.title}</h2>}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {(block.imageUrls || []).map((url, index) => <img key={url + index} src={url} alt="" loading="lazy" className="aspect-square w-full rounded-xl object-cover" />)}
                </div>
              </section>
            )}
            {block.type === 'video' && block.videoUrl && (
              <div className="mb-6 overflow-hidden rounded-2xl bg-black"><video src={block.videoUrl} controls playsInline preload="metadata" className="w-full" /></div>
            )}
            {block.type === 'lottie' && block.lottieUrl && <div className="mb-6"><LottieBlock url={block.lottieUrl} /></div>}
            {block.type === 'button' && (
              <div className={`mb-5 flex ${block.align === 'left' ? 'justify-start' : block.align === 'right' ? 'justify-end' : 'justify-center'}`}>
                <a href={safeLink(block.href) || '#'} onClick={() => action(block.label || 'Button')} className="qr-primary-button">{block.label || 'Learn more'}</a>
              </div>
            )}
            {block.type === 'form' && <section className="qr-form-card mb-6 p-5 sm:p-7" style={{ borderRadius: theme.cardRadius }}><PublicForm block={block} code={code} mode={mode} /></section>}
            {block.type === 'menu' && (
              <section className="qr-content-card mb-6 p-5 sm:p-7" style={{ borderRadius: theme.cardRadius }}>
                <h2 className="mb-5 text-2xl font-bold">{block.title || 'Our menu'}</h2>
                {(block.items || []).map((category: any, index: number) => (
                  <div key={category.category || index} className="mb-6 last:mb-0">
                    <h3 className="mb-3 border-b border-slate-200 pb-2 text-lg font-bold">{category.category || 'Menu'}</h3>
                    {(category.items || []).map((item: any, itemIndex: number) => (
                      <div key={item.name || itemIndex} className="flex items-start justify-between gap-4 border-b border-slate-100 py-3 last:border-0">
                        <div><p className="font-semibold">{item.name || 'Item'}</p>{item.description && <p className="mt-1 text-sm opacity-65">{item.description}</p>}</div>
                        {item.price && <span className="shrink-0 font-bold">{item.price}</span>}
                      </div>
                    ))}
                  </div>
                ))}
              </section>
            )}
            {block.type === 'products' && (
              <section className="mb-6">
                {block.title && <h2 className="mb-4 text-2xl font-bold">{block.title}</h2>}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {(block.items || []).map((item: any, index: number) => (
                    <article key={item.name || index} className="qr-content-card overflow-hidden" style={{ borderRadius: theme.cardRadius }}>
                      {item.imageUrl && <img src={item.imageUrl} alt="" loading="lazy" className="aspect-[16/10] w-full object-cover" />}
                      <div className="p-4"><h3 className="font-bold">{item.name || 'Product'}</h3><p className="mt-1 text-sm opacity-70">{item.description}</p>{item.price && <p className="mt-3 font-bold">{item.price}</p>}</div>
                    </article>
                  ))}
                </div>
              </section>
            )}
            {block.type === 'divider' && <div className="my-6 h-px w-full bg-current opacity-15" />}
          </AnimationFrame>
        ))}
        {page.blocks.length === 0 && mode === 'preview' && <p className="py-12 text-center text-sm opacity-60">Your blank experience is ready for content.</p>}
      </div>
      <footer className="px-4 pb-6 pt-2 text-center text-[10px] opacity-45">Powered by Amaavigo</footer>
    </div>
  );
}

export const PublicQrExperience: React.FC<{ code: string }> = ({ code }) => {
  const [payload, setPayload] = useState<PublicQrPayload | null>(null);
  const [error, setError] = useState('');
  const tracked = useRef(false);
  useEffect(() => {
    let alive = true;
    fetch(`/api/qr/public/${encodeURIComponent(code)}`, { headers: { Accept: 'application/json' }, cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.error || 'This QR experience is unavailable.');
        if (!alive) return;
        if (data.redirectUrl) {
          window.location.replace(data.redirectUrl);
          return;
        }
        setPayload(data);
        if (!tracked.current) {
          tracked.current = true;
          trackEvent(code, 'page_view');
        }
      })
      .catch((reason) => alive && setError(reason?.message || 'This QR experience is unavailable.'));
    return () => { alive = false; };
  }, [code]);

  useEffect(() => {
    if (payload?.qr?.page?.title) document.title = payload.qr.page.title;
    return () => { document.title = 'Amaavigo'; };
  }, [payload?.qr?.page?.title]);

  if (error) return <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6 text-center text-slate-700"><div><div className="mb-3 text-3xl">↗</div><h1 className="text-xl font-bold">This QR link is unavailable</h1><p className="mt-2 text-sm text-slate-500">{error}</p></div></div>;
  if (!payload?.qr?.page) return <div className="flex min-h-screen items-center justify-center bg-slate-50"><span className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" /></div>;
  return <QrExperienceRenderer page={payload.qr.page} code={code} mode="public" />;
};
