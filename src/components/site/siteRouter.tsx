import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

/** Public marketing routes handled in-app (no full page reload). Everything else (/login, /privacy, …) loads normally. */
export const SITE_ROUTES = new Set([
  '/', '/platform', '/ai-agent', '/ai-agents', '/unified-inbox', '/campaigns', '/whatsapp', '/crm',
  '/lead-capture', '/demo-scheduling', '/analytics', '/integrations', '/solutions', '/pricing',
  '/resources', '/how-it-works', '/faqs', '/about', '/contact', '/book-demo',
]);

export const normalizePath = (path: string) => path.replace(/\/+$/, '').toLowerCase() || '/';

interface SiteRouterValue {
  pathname: string;
  navigate: (href: string) => void;
}

const SiteRouterContext = createContext<SiteRouterValue>({ pathname: '/', navigate: () => undefined });
export const useSiteRouter = () => useContext(SiteRouterContext);

function scrollToHash(hash: string) {
  if (!hash) return; // the page-transition handler scrolls to top once the old page has left
  const id = decodeURIComponent(hash.slice(1));
  // Wait a frame for the incoming page to mount before looking for the anchor.
  window.setTimeout(() => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 380);
}

export const SiteRouter: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [pathname, setPathname] = useState(() => normalizePath(window.location.pathname));

  const navigate = useCallback((href: string) => {
    const url = new URL(href, window.location.origin);
    const next = normalizePath(url.pathname);
    if (!SITE_ROUTES.has(next)) { window.location.href = href; return; }
    window.history.pushState({}, '', url.pathname + url.search + url.hash);
    setPathname(next);
    scrollToHash(url.hash);
  }, []);

  useEffect(() => {
    const onPop = () => setPathname(normalizePath(window.location.pathname));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // One delegated listener turns every internal marketing link (including those inside the Pricing/About/Contact pages) into a client-side navigation.
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as HTMLElement | null)?.closest?.('a');
      if (!anchor) return;
      const raw = anchor.getAttribute('href');
      if (!raw || anchor.target === '_blank' || anchor.hasAttribute('download') || raw.startsWith('mailto:') || raw.startsWith('tel:')) return;
      let url: URL;
      try { url = new URL(raw, window.location.origin); } catch { return; }
      if (url.origin !== window.location.origin) return;
      const next = normalizePath(url.pathname);
      if (!SITE_ROUTES.has(next)) return;
      if (next === pathname && url.hash) return; // same page anchor: browser handles it
      event.preventDefault();
      if (next === pathname) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
      navigate(raw);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [pathname, navigate]);

  const value = useMemo(() => ({ pathname, navigate }), [pathname, navigate]);
  return <SiteRouterContext.Provider value={value}>{children}</SiteRouterContext.Provider>;
};
