import { useEffect, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

let swRegistrado = false;

export function registrarServiceWorkerPWA() {
  if (swRegistrado || typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return;
  }
  swRegistrado = true;

  // En modo desarrollo, desregistrar cualquier SW previo (p.ej. dev-sw.js) para evitar bucles de recarga
  if (import.meta.env.DEV) {
    navigator.serviceWorker
      .getRegistrations()
      .then(regs => {
        for (const reg of regs) {
          reg.unregister().catch(() => {});
        }
      })
      .catch(() => {});
    return;
  }

  // En producción, limpiar cualquier dev-sw residual si quedó en el navegador
  navigator.serviceWorker
    .getRegistrations()
    .then(regs => {
      for (const reg of regs) {
        const scriptUrl = reg.active?.scriptURL || reg.waiting?.scriptURL || reg.installing?.scriptURL || '';
        if (scriptUrl.includes('dev-sw.js')) {
          reg.unregister().catch(() => {});
        }
      }
    })
    .catch(() => {});

  try {
    registerSW({
      immediate: true,
      onNeedReload() {
        // No recargar automáticamente para no interrumpir cargas o formularios en curso
      },
      onNeedRefresh() {
        // La actualización se aplicará de forma segura en la próxima apertura
      },
      onRegisterError(error) {
        console.warn('[PWA] Error registrando Service Worker:', error);
      },
    });
  } catch (err) {
    console.warn('[PWA] Service Worker no disponible en este contexto:', err);
  }
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isInIframe, setIsInIframe] = useState(false);

  useEffect(() => {
    registrarServiceWorkerPWA();

    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsInstalled(isStandalone);

    const ua = window.navigator.userAgent.toLowerCase();
    setIsIOS(/iphone|ipad|ipod/.test(ua));

    try {
      setIsInIframe(window.self !== window.top);
    } catch {
      setIsInIframe(true);
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const install = async () => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
      setDeferredPrompt(null);
      return true;
    }
    return false;
  };

  return {
    isInstallable: Boolean(deferredPrompt),
    isInstalled,
    isIOS,
    isInIframe,
    install,
  };
}

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}
