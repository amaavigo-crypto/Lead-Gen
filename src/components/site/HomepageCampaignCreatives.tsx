import React, { useEffect, useState } from 'react';
import { ArrowUpRight, Check, CheckCheck, MessageCircle } from 'lucide-react';
import type { EmailKind, WaKind } from './mockups';
import './homepage-campaign-creatives.css';

type PhotoKind = 'newsletter' | 'product' | 'promo' | 'welcome';

const photoLabels: Record<PhotoKind, string> = {
  newsletter: 'Sunlit floral home vignette',
  product: 'Premium headphones against a deep blue studio backdrop',
  promo: 'Luxury skincare and fragrance product arrangement',
  welcome: 'Thoughtful gift beside a coffee and journal',
};

const Photo: React.FC<{ kind: PhotoKind; className?: string }> = ({ kind, className = '' }) => (
  <div className={`hc-photo hc-photo--${kind} ${className}`} role="img" aria-label={photoLabels[kind]} />
);

const EMAIL_CONTENT: Record<EmailKind, {
  brand: string; kicker: string; title: string; copy: string; cta: string; footer: string;
}> = {
  newsletter: {
    brand: 'ATELIER', kicker: 'THE WEEKLY EDIT', title: 'A little more beauty in the everyday.',
    copy: 'Thoughtful spaces, considered details and fresh ideas selected for the week ahead.',
    cta: 'Explore the edit', footer: 'The Sunday Edit · Curated with care',
  },
  product: {
    brand: 'SONORA', kicker: 'JUST ARRIVED', title: 'Sound that moves with you.',
    copy: 'Meet the new studio collection: beautifully tuned, effortlessly comfortable and made for the everyday.',
    cta: 'Meet the collection', footer: 'Designed for your everyday rhythm',
  },
  promo: {
    brand: 'AURELLE', kicker: 'A PRIVATE INVITATION', title: 'A little glow goes a long way.',
    copy: 'Enjoy an exclusive seasonal edit, selected to make your daily ritual feel special.',
    cta: 'Shop the edit', footer: 'Your code is ready at checkout',
  },
  welcome: {
    brand: 'THE GOOD CLUB', kicker: 'YOU’RE IN', title: 'Welcome to something good.',
    copy: 'We’re glad you found us. Here’s a thoughtful place to begin and a few favourites to explore.',
    cta: 'Discover your welcome gift', footer: 'A note from us, whenever you need one',
  },
};

const EMAIL_PHOTO: Record<EmailKind, PhotoKind> = {
  newsletter: 'newsletter', product: 'product', promo: 'promo', welcome: 'welcome',
};

export const HomepageEmailTemplate: React.FC<{ kind: EmailKind }> = ({ kind }) => {
  const content = EMAIL_CONTENT[kind];
  return (
    <article className={`hc-mail hc-mail--${kind}`}>
      <header className="hc-mail-header">
        <span className="hc-mail-mark">A</span>
        <strong>{content.brand}</strong>
        <small>STORIES · SHOP · ABOUT</small>
      </header>
      <Photo kind={EMAIL_PHOTO[kind]} className="hc-mail-hero" />
      <div className="hc-mail-body">
        <span className="hc-mail-kicker">{content.kicker}</span>
        <h2>{content.title}</h2>
        <p>{content.copy}</p>
        <a className="hc-mail-cta">{content.cta}<ArrowUpRight size={13} /></a>
      </div>
      {kind === 'newsletter' && (
        <div className="hc-mail-bottom-grid">
          <div><Photo kind="product" className="hc-mail-thumb" /><b>Objects with intention</b><small>Small details, a calmer space.</small></div>
          <div><Photo kind="welcome" className="hc-mail-thumb" /><b>Gifting, made thoughtful</b><small>Ideas worth keeping close.</small></div>
        </div>
      )}
      {kind === 'product' && (
        <div className="hc-mail-specs"><span>PURE SOUND</span><span>ALL-DAY COMFORT</span><span>MADE TO MOVE</span></div>
      )}
      {kind === 'promo' && (
        <div className="hc-mail-offer"><b>THE SEASONAL EDIT</b><span>Use code <strong>GLOW15</strong> at checkout</span></div>
      )}
      {kind === 'welcome' && (
        <div className="hc-mail-welcome-steps">
          <span><i>01</i> Find your favourites</span><span><i>02</i> Make it yours</span>
        </div>
      )}
      <footer className="hc-mail-footer">{content.footer}<span>Unsubscribe · Preferences</span></footer>
    </article>
  );
};

const WA_CONTENT: Record<WaKind, {
  brand: string; body: string; cta: string; photo: PhotoKind; time: string;
}> = {
  promo: {
    brand: 'Aurelle Studio', body: 'Hi Sara 👋 Your weekend edit is here. A little something special, picked just for you.',
    cta: 'Shop the edit', photo: 'promo', time: '10:42 AM',
  },
  order: {
    brand: 'Northline Store', body: 'Your order #4821 is on its way. We’ll keep you posted until it reaches your door.',
    cta: 'Track your order', photo: 'product', time: '11:18 AM',
  },
  welcome: {
    brand: 'The Good Club', body: 'Welcome in, Sara! Your first little gift is ready. We’re happy to have you here.',
    cta: 'Claim your welcome gift', photo: 'welcome', time: '12:30 PM',
  },
};

export const HomepageWhatsAppPhone: React.FC<{ kind: WaKind }> = ({ kind }) => {
  const copy = WA_CONTENT[kind];
  const [ticks, setTicks] = useState(0);
  useEffect(() => {
    const a = window.setTimeout(() => setTicks(1), 700);
    const b = window.setTimeout(() => setTicks(2), 1500);
    const c = window.setTimeout(() => setTicks(3), 2400);
    return () => [a, b, c].forEach(window.clearTimeout);
  }, [kind]);

  return (
    <div className="sx-phone hc-phone">
      <div className="sx-phone-notch" />
      <div className="sx-wa-head">
        <span className="sx-wa-av">{copy.brand[0]}</span>
        <span><b>{copy.brand}</b><small>Business account</small></span>
      </div>
      <div className="sx-wa-chat">
        <div className="sx-wa-date">TODAY</div>
        <div className={`sx-wa-msg ${kind} hc-wa-message`}>
          <Photo kind={copy.photo} className="hc-wa-art" />
          <p>{copy.body}</p>
          <small>{copy.time} <CheckCheck size={12} className={ticks >= 2 ? 'read' : ''} /></small>
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
