import React, { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Check } from 'lucide-react';
import { animate, motion, useInView, useReducedMotion } from 'motion/react';

export const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];
export const DEMO_URL = 'https://www.amaavigo.com/consult-now';

/** Fade + rise on scroll. Falls back to instantly visible for reduced-motion users. */
export const Reveal: React.FC<{ children: React.ReactNode; className?: string; delay?: number; y?: number; as?: 'div' | 'section' | 'li' }> = ({ children, className, delay = 0, y = 26, as = 'div' }) => {
  const reduced = useReducedMotion();
  const Comp = (motion as any)[as] as typeof motion.div;
  return (
    <Comp className={className} initial={reduced ? false : { opacity: 0, y }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.15 }} transition={{ duration: 0.75, delay, ease: EASE }}>
      {children}
    </Comp>
  );
};

/** Children appear one after another. */
export const Stagger: React.FC<{ children: React.ReactNode; className?: string; gap?: number }> = ({ children, className, gap = 0.08 }) => {
  const reduced = useReducedMotion();
  return (
    <motion.div className={className} initial={reduced ? false : 'hidden'} whileInView="show" viewport={{ once: true, amount: 0.12 }} variants={{ hidden: {}, show: { transition: { staggerChildren: gap } } }}>
      {children}
    </motion.div>
  );
};
export const StaggerItem: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <motion.div className={className} variants={{ hidden: { opacity: 0, y: 24 }, show: { opacity: 1, y: 0, transition: { duration: 0.65, ease: EASE } } }}>{children}</motion.div>
);

export const Eyebrow: React.FC<{ children: React.ReactNode }> = ({ children }) => <span className="sx-eyebrow"><i />{children}</span>;

export const SectionHead: React.FC<{ eyebrow: string; title: React.ReactNode; accent?: React.ReactNode; copy?: React.ReactNode; align?: 'center' | 'left' }> = ({ eyebrow, title, accent, copy, align = 'center' }) => (
  <Reveal className={'sx-section-head ' + (align === 'left' ? 'left' : '')}>
    <Eyebrow>{eyebrow}</Eyebrow>
    <h2>{title}{accent && <><br /><span className="sx-grad">{accent}</span></>}</h2>
    {copy && <p>{copy}</p>}
  </Reveal>
);

export const Btn: React.FC<{ href: string; children: React.ReactNode; variant?: 'primary' | 'ghost'; external?: boolean }> = ({ href, children, variant = 'primary', external = false }) => (
  <a className={'sx-btn ' + variant} href={href} {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}>
    <span>{children}</span><ArrowUpRight size={15} />
  </a>
);

export const Ticks: React.FC<{ items: string[] }> = ({ items }) => (
  <ul className="sx-ticks">
    {items.map((item, i) => (
      <motion.li key={item} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.35 + i * 0.07, duration: 0.5, ease: EASE }}>
        <span><Check size={11} strokeWidth={3} /></span>{item}
      </motion.li>
    ))}
  </ul>
);

/** Card with cursor spotlight and a gentle 3D tilt. Pure CSS variables, so no React re-renders while the pointer moves. */
export const TiltCard: React.FC<{ children: React.ReactNode; className?: string; tilt?: number; as?: 'div' | 'a'; href?: string }> = ({ children, className = '', tilt = 5, as = 'div', href }) => {
  const ref = useRef<HTMLElement | null>(null);
  const frame = useRef(0);
  const reduced = useReducedMotion();
  const onMove = (event: React.PointerEvent) => {
    if (event.pointerType === 'touch') return;
    const el = ref.current; if (!el) return;
    const { clientX, clientY } = event;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const rect = el.getBoundingClientRect();
      const x = (clientX - rect.left) / rect.width;
      const y = (clientY - rect.top) / rect.height;
      el.style.setProperty('--mx', `${x * 100}%`);
      el.style.setProperty('--my', `${y * 100}%`);
      if (!reduced) {
        el.style.setProperty('--rx', `${(0.5 - y) * tilt}deg`);
        el.style.setProperty('--ry', `${(x - 0.5) * tilt}deg`);
      }
    });
  };
  const onLeave = () => {
    const el = ref.current; if (!el) return;
    el.style.setProperty('--rx', '0deg'); el.style.setProperty('--ry', '0deg');
  };
  const props = { ref: ref as any, className: 'sx-tilt ' + className, onPointerMove: onMove, onPointerLeave: onLeave };
  return as === 'a' ? <a {...props} href={href}>{children}</a> : <div {...props}>{children}</div>;
};

export const CountUp: React.FC<{ to: number; suffix?: string; prefix?: string; decimals?: number; duration?: number }> = ({ to, suffix = '', prefix = '', decimals = 0, duration = 1.6 }) => {
  const ref = useRef<HTMLSpanElement | null>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const reduced = useReducedMotion();
  const [value, setValue] = useState(reduced ? to : 0);
  useEffect(() => {
    if (!inView || reduced) return;
    const controls = animate(0, to, { duration, ease: EASE, onUpdate: (v) => setValue(v) });
    return () => controls.stop();
  }, [inView, to, duration, reduced]);
  return <span ref={ref}>{prefix}{value.toFixed(decimals)}{suffix}</span>;
};

/** Looping horizontal marquee; pauses on hover. */
export const Marquee: React.FC<{ children: React.ReactNode; speed?: number }> = ({ children, speed = 38 }) => (
  <div className="sx-marquee" style={{ ['--sx-marquee' as any]: `${speed}s` }}>
    <div className="sx-marquee-track">
      <div className="sx-marquee-group">{children}</div>
      <div className="sx-marquee-group" aria-hidden="true">{children}</div>
    </div>
  </div>
);

/** True only while the element is on screen — used to start/stop looping demo animations. */
export function useOnScreen<T extends HTMLElement>(amount = 0.3) {
  const ref = useRef<T | null>(null);
  const visible = useInView(ref, { amount });
  return [ref, visible] as const;
}

/** Becomes true the first time the element is seen and stays true — for one-shot entrance animations such as charts and counters. */
export function useSeenOnce<T extends HTMLElement>(amount = 0.3) {
  const ref = useRef<T | null>(null);
  const seen = useInView(ref, { amount, once: true });
  return [ref, seen] as const;
}
