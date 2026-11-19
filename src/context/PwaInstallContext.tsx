import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

type InstallChoice = 'accepted' | 'dismissed' | 'unavailable';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
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
    const standaloneQuery = window.matchMedia('(display-mode: standalone)');
    const checkInstalled = () => {
      const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
      setIsInstalled(standaloneQuery.matches || iosStandalone);
    };
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setIsInstalled(true);
      setInstallPrompt(null);
    };

    setIsIOS(/iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
    checkInstalled();
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);
    standaloneQuery.addEventListener?.('change', checkInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
      standaloneQuery.removeEventListener?.('change', checkInstalled);
    };
  }, []);

  const promptInstall = useCallback(async (): Promise<InstallChoice> => {
    if (!installPrompt) return 'unavailable';
    const prompt = installPrompt;
    setInstallPrompt(null);
    await prompt.prompt();
    const choice = await prompt.userChoice;
    if (choice.outcome === 'accepted') setIsInstalled(true);
    return choice.outcome;
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
