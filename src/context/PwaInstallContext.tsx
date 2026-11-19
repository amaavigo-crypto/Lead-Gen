import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

type InstallChoice = 'accepted' | 'dismissed' | 'unavailable';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

interface RelatedInstalledApp {
  platform?: string;
  id?: string;
  url?: string;
}

type PwaNavigator = Navigator & {
  standalone?: boolean;
  getInstalledRelatedApps?: () => Promise<RelatedInstalledApp[]>;
};

interface PwaInstallContextValue {
  canInstall: boolean;
  isInstalled: boolean;
  isIOS: boolean;
  promptInstall: () => Promise<InstallChoice>;
}

const PwaInstallContext = createContext<PwaInstallContextValue | null>(null);

export const PwaInstallProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    let mounted = true;
    const pwaNavigator = navigator as PwaNavigator;
    const displayModeQueries = ['standalone', 'fullscreen', 'minimal-ui'].map((mode) =>
      window.matchMedia(`(display-mode: ${mode})`)
    );

    const isStandalone = () =>
      pwaNavigator.standalone === true || displayModeQueries.some((query) => query.matches);

    const syncInstalledState = async () => {
      if (isStandalone()) {
        if (mounted) setIsInstalled(true);
        return;
      }

      // Chromium can also confirm installation while the user is browsing in a normal tab.
      // The manifest declares this PWA as its own related web app for this purpose.
      if (typeof pwaNavigator.getInstalledRelatedApps === 'function') {
        try {
          const installedApps = await pwaNavigator.getInstalledRelatedApps();
          const appId = new URL('/', window.location.href).href;
          const manifestUrl = new URL('/manifest.webmanifest', window.location.href).href;
          const relatedPwaIsInstalled = installedApps.some((app) =>
            app.platform === 'webapp' && (app.id === appId || app.url === manifestUrl)
          );
          if (mounted) setIsInstalled(relatedPwaIsInstalled);
          return;
        } catch {
          // Fall back to display-mode detection in browsers that restrict this API.
        }
      }

      if (mounted) setIsInstalled(false);
    };

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      if (!isStandalone()) setInstallPrompt(event as BeforeInstallPromptEvent);
    };

    const onInstalled = () => {
      setIsInstalled(true);
      setInstallPrompt(null);
    };

    const refreshInstalledState = () => {
      if (document.visibilityState === 'visible') void syncInstalledState();
    };

    setIsIOS(
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    );
    void syncInstalledState();

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);
    window.addEventListener('focus', refreshInstalledState);
    window.addEventListener('pageshow', refreshInstalledState);
    document.addEventListener('visibilitychange', refreshInstalledState);
    displayModeQueries.forEach((query) => query.addEventListener?.('change', refreshInstalledState));

    return () => {
      mounted = false;
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
      window.removeEventListener('focus', refreshInstalledState);
      window.removeEventListener('pageshow', refreshInstalledState);
      document.removeEventListener('visibilitychange', refreshInstalledState);
      displayModeQueries.forEach((query) => query.removeEventListener?.('change', refreshInstalledState));
    };
  }, []);

  const promptInstall = useCallback(async (): Promise<InstallChoice> => {
    if (!installPrompt) return 'unavailable';

    const prompt = installPrompt;
    // A BeforeInstallPromptEvent can only be consumed once. A new event is captured
    // separately if Chrome makes another install attempt available.
    setInstallPrompt(null);

    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      // "accepted" means the user approved the dialog; appinstalled confirms completion.
      // Do not mark the app installed here, since the platform may still cancel/fail the install.
      return choice.outcome;
    } catch {
      return 'unavailable';
    }
  }, [installPrompt]);

  const value = useMemo(() => ({
    canInstall: installPrompt !== null,
    isInstalled,
    isIOS,
    promptInstall,
  }), [installPrompt, isInstalled, isIOS, promptInstall]);

  return <PwaInstallContext.Provider value={value}>{children}</PwaInstallContext.Provider>;
};

export const usePwaInstall = (): PwaInstallContextValue => {
  const context = useContext(PwaInstallContext);
  if (!context) throw new Error('usePwaInstall must be used inside PwaInstallProvider');
  return context;
};
