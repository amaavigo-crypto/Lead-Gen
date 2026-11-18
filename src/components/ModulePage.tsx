import React from 'react';
import type { LucideIcon } from 'lucide-react';

/**
 * Shared page structure used by every workspace module so they all follow the
 * Campaigns layout: header strip -> intro (eyebrow / title / live pill) ->
 * captioned stat cards -> one card holding title, filters, chips and content.
 *
 * The component only provides structure. Data, state and actions stay in each module.
 */

export interface ModuleShellProps {
  /** Value for data-umrah360-module on the root. */
  moduleId: string;
  /** Extra class for the root (kept so existing per-module CSS keeps matching). */
  className?: string;
  icon: LucideIcon;
  /** Title in the header strip. */
  title: string;
  /** Small pill next to the strip title. */
  badge?: string;
  /** One-line description under the strip title. */
  subtitle: string;
  /** Buttons on the right of the strip. */
  actions?: React.ReactNode;
  /** Small caps line above the intro title. */
  eyebrow: string;
  /** Intro title. Defaults to the strip title. */
  heading?: string;
  /** Intro paragraph. Defaults to the strip subtitle. */
  copy?: string;
  /** Pill on the right of the intro. Pass null to hide. */
  live?: React.ReactNode;
  children: React.ReactNode;
}

export const ModuleShell: React.FC<ModuleShellProps> = ({
  moduleId,
  className = '',
  icon: Icon,
  title,
  badge,
  subtitle,
  actions,
  eyebrow,
  heading,
  copy,
  live,
  children,
}) => (
  <div data-umrah360-module={moduleId} className={'mp-shell ' + className}>
    <header className="mp-strip">
      <div className="mp-strip-id">
        <div className="mp-strip-tile"><Icon className="w-5 h-5" /></div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1>{title}</h1>
            {badge && <span className="mp-strip-pill">{badge}</span>}
          </div>
          <p>{subtitle}</p>
        </div>
      </div>
      {actions && <div className="mp-strip-actions">{actions}</div>}
    </header>

    <main className="mp-main">
      <div className="mp-content w-full max-w-[1600px] mx-auto p-5 md:p-7 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
          <div className="min-w-0">
            <div className="mp-eyebrow"><span className="h-2 w-2 rounded-full bg-orange-500" /> {eyebrow}</div>
            <h2 className="mp-intro-title">{heading || title}</h2>
            <p className="mp-intro-copy">{copy || subtitle}</p>
          </div>
          {live !== null && (
            <div className="flex items-center gap-2 text-xs text-slate-500 shrink-0">
              {live ?? (
                <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" /> Live workspace
                </span>
              )}
            </div>
          )}
        </div>
        {children}
      </div>
    </main>
  </div>
);

export interface ModuleStat {
  label: string;
  value: React.ReactNode;
  icon: LucideIcon;
  /** Tailwind classes for the icon tile, e.g. 'bg-sky-50 text-sky-600'. */
  tile?: string;
  note?: string;
  onClick?: () => void;
}

export const ModuleStatGrid: React.FC<{ stats: ModuleStat[]; label?: string; className?: string }> = ({
  stats,
  label = 'Overview metrics',
  className,
}) => {
  const cols =
    stats.length >= 7 ? 'grid-cols-2 md:grid-cols-4 xl:grid-cols-7'
      : stats.length === 6 ? 'grid-cols-2 md:grid-cols-3 xl:grid-cols-6'
      : stats.length === 5 ? 'grid-cols-2 md:grid-cols-3 xl:grid-cols-5'
      : stats.length === 4 ? 'grid-cols-2 xl:grid-cols-4'
      : stats.length === 3 ? 'grid-cols-1 sm:grid-cols-3'
      : 'grid-cols-1 sm:grid-cols-2';
  return (
    <div className={'grid gap-3 ' + cols + (className ? ' ' + className : '')} aria-label={label}>
      {stats.map((stat) => {
        const StatIcon = stat.icon;
        const body = (
          <>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-500">{stat.label}</span>
              <span className={'h-8 w-8 shrink-0 rounded-xl flex items-center justify-center ' + (stat.tile || 'bg-sky-50 text-sky-600')}>
                <StatIcon className="w-4 h-4" />
              </span>
            </div>
            <div className="mt-3 text-2xl font-bold tabular-nums text-slate-950">{stat.value}</div>
            {stat.note && <div className="mt-1 text-[11px] text-slate-400">{stat.note}</div>}
          </>
        );
        return stat.onClick ? (
          <button
            key={stat.label}
            type="button"
            onClick={stat.onClick}
            className="mp-stat rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-slate-300"
          >
            {body}
          </button>
        ) : (
          <div key={stat.label} className="mp-stat rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">{body}</div>
        );
      })}
    </div>
  );
};

export interface ModuleChip {
  id: string;
  label: string;
  count?: number;
  icon?: React.ReactNode;
}

export const ModuleChips: React.FC<{
  chips: ModuleChip[];
  active: string;
  onChange: (id: string) => void;
  label: string;
}> = ({ chips, active, onChange, label }) => (
  <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5" role="tablist" aria-label={label}>
    {chips.map((chip) => {
      const isActive = chip.id === active;
      return (
        <button
          key={chip.id}
          type="button"
          role="tab"
          aria-selected={isActive}
          onClick={() => onChange(chip.id)}
          className={'shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition ' + (isActive ? 'bg-orange-500 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700')}
        >
          {chip.icon}
          {chip.label}
          {chip.count !== undefined && (
            <span className={'tabular-nums ' + (isActive ? 'text-blue-100' : 'text-slate-400')}>{chip.count}</span>
          )}
        </button>
      );
    })}
  </div>
);

/** Card with the Campaigns title / description / toolbar / chips header. */
export const ModuleCard: React.FC<{
  title?: string;
  description?: string;
  toolbar?: React.ReactNode;
  chips?: React.ReactNode;
  /** Remove the body padding (for tables and full-bleed content). */
  flush?: boolean;
  className?: string;
  children?: React.ReactNode;
}> = ({ title, description, toolbar, chips, flush = true, className, children }) => (
  <section className={'mp-card rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden' + (className ? ' ' + className : '')}>
    {(title || toolbar || chips) && (
      <div className="p-4 md:p-5 border-b border-slate-100 space-y-4">
        {(title || toolbar) && (
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            {title && (
              <div className="min-w-0">
                <h3 className="mp-card-title">{title}</h3>
                {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
              </div>
            )}
            {toolbar}
          </div>
        )}
        {chips}
      </div>
    )}
    <div className={flush ? '' : 'p-4 md:p-5'}>{children}</div>
  </section>
);

export default ModuleShell;
