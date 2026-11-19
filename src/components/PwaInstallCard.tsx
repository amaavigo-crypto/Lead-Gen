import React, { useState } from 'react';
import { CheckCircle2, ChevronDown, Download, MonitorDown, ShieldCheck, Smartphone } from 'lucide-react';
import { usePwaInstall } from '../context/PwaInstallContext';

interface PwaInstallCardProps {
  variant?: 'login' | 'settings';
}

export const PwaInstallCard: React.FC<PwaInstallCardProps> = ({ variant = 'settings' }) => {
  const { canInstall, isInstalled, isIOS, promptInstall } = usePwaInstall();
  const [showInstructions, setShowInstructions] = useState(false);
  const isLogin = variant === 'login';

  const handleInstall = async () => {
    if (!canInstall) {
      setShowInstructions((current) => !current);
      return;
    }
    const outcome = await promptInstall();
    if (outcome !== 'accepted') setShowInstructions(true);
  };

  return (
    <section className={isLogin
      ? 'rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-lg shadow-slate-900/5'
      : 'overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm'}>
      <div className={isLogin ? 'flex items-center gap-3' : 'flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6'}>
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-orange-400">
            <Smartphone className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-extrabold text-slate-950">Install Amaavigo app</h3>
              {isInstalled && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700"><CheckCircle2 className="h-3 w-3" /> Installed</span>}
            </div>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              Use your full workspace in its own app window, with the same login and mobile experience.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleInstall}
          disabled={isInstalled}
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-xs font-extrabold text-white shadow-sm transition hover:bg-orange-600 active:bg-orange-700 disabled:cursor-default disabled:bg-emerald-600"
        >
          {isInstalled ? <CheckCircle2 className="h-4 w-4" /> : canInstall ? <Download className="h-4 w-4" /> : <MonitorDown className="h-4 w-4" />}
          {isInstalled ? 'App installed' : canInstall ? 'Install app' : 'Installation help'}
        </button>
      </div>

      {!isLogin && (
        <div className="grid gap-3 border-t border-slate-100 bg-slate-50/80 px-5 py-4 sm:grid-cols-3 sm:px-6">
          <div className="flex items-start gap-2 text-xs text-slate-600"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /><span><strong className="block text-slate-800">Same secure account</strong>Existing sign-in, tenant boundaries and permissions stay in place.</span></div>
          <div className="flex items-start gap-2 text-xs text-slate-600"><Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-orange-600" /><span><strong className="block text-slate-800">App-like experience</strong>Launch from your home screen or desktop app launcher.</span></div>
          <div className="flex items-start gap-2 text-xs text-slate-600"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" /><span><strong className="block text-slate-800">Always current</strong>Live workspace data continues to load from the platform.</span></div>
        </div>
      )}

      {(showInstructions || (!canInstall && !isInstalled)) && (
        <div className={isLogin ? 'mt-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-600' : 'border-t border-slate-100 px-5 py-4 text-xs text-slate-600 sm:px-6'}>
          <p className="font-bold text-slate-800">{isIOS ? 'Add Amaavigo to your Home Screen' : 'Install from your browser'}</p>
          {isIOS ? (
            <ol className="mt-2 list-decimal space-y-1 pl-4">
              <li>Open this page in Safari.</li>
              <li>Tap the Share button.</li>
              <li>Choose <strong>Add to Home Screen</strong>, then tap Add.</li>
            </ol>
          ) : (
            <p className="mt-2 leading-relaxed">Open your browser menu and choose <strong>Install app</strong> or <strong>Add to Home Screen</strong>. In supported browsers, the Install app button above opens the native install prompt.</p>
          )}
          {!isLogin && <p className="mt-3 inline-flex items-center gap-1 text-[11px] text-slate-500"><ChevronDown className="h-3 w-3" /> Your installed app uses the same live platform; it does not create a separate account or data store.</p>}
        </div>
      )}
    </section>
  );
};
