import React, { useEffect, useRef } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import type { TabType } from './types';
import { Header } from './components/Header';
import { Navbar } from './components/Navbar';
import { DashboardTab } from './components/DashboardTab';
import { PlanosTab } from './components/PlanosTab';
import { ComparadorTab } from './components/ComparadorTab';
import { HitosTab } from './components/HitosTab';
import { MinutasTab } from './components/MinutasTab';
import { InformesTab } from './components/InformesTab';
import { InterferenciasTab } from './components/InterferenciasTab';
import { AnotadorTab } from './components/AnotadorTab';
import { ChatTab } from './components/ChatTab';
import { ModalConfiguracion } from './components/ModalConfiguracion';
import { ModalEditorHitos } from './components/ModalEditorHitos';
import { ModalCargarPliegos } from './components/ModalCargarPliegos';
import { OfflineIndicator } from './components/OfflineIndicator';
import { ErrorBoundary } from './components/ErrorBoundary';

const VALID_TABS: TabType[] = [
  'dashboard',
  'planos',
  'comparador',
  'hitos',
  'minutas',
  'informes',
  'interferencias',
  'anotador',
  'chat',
];

const HashNavigationSync: React.FC = () => {
  const {
    activeTab,
    setActiveTab,
    isSettingsOpen,
    setIsSettingsOpen,
    isHitosModalOpen,
    setIsHitosModalOpen,
    isPliegosModalOpen,
    setIsPliegosModalOpen,
  } = useApp();

  const skipNextPushRef = useRef(false);
  const modalStateRef = useRef({ isSettingsOpen, isHitosModalOpen, isPliegosModalOpen, activeTab });
  useEffect(() => {
    modalStateRef.current = { isSettingsOpen, isHitosModalOpen, isPliegosModalOpen, activeTab };
  }, [isSettingsOpen, isHitosModalOpen, isPliegosModalOpen, activeTab]);

  // Leer hash inicial al cargar
  useEffect(() => {
    const raw = window.location.hash.replace(/^#/, '') as TabType;
    if (VALID_TABS.includes(raw) && raw !== 'dashboard') {
      skipNextPushRef.current = true;
      setActiveTab(raw);
    } else if (!window.location.hash) {
      try {
        window.history.replaceState({ tab: 'dashboard' }, '', '#dashboard');
      } catch {
        // Ignorar en iframes con restricciones de historial
      }
    }
  }, [setActiveTab]);

  // Sincronizar activeTab -> hash
  useEffect(() => {
    if (skipNextPushRef.current) {
      skipNextPushRef.current = false;
      return;
    }
    const targetHash = `#${activeTab}`;
    if (window.location.hash !== targetHash) {
      try {
        window.history.pushState({ tab: activeTab }, '', targetHash);
      } catch {
        // Ignorar en iframes con restricciones de historial
      }
    }
  }, [activeTab]);

  // Manejar botón Atrás (popstate / hashchange): primero cerrar modales, luego navegar entre pestañas
  useEffect(() => {
    const onPopState = () => {
      const {
        isSettingsOpen: cfgOpen,
        isHitosModalOpen: hitosOpen,
        isPliegosModalOpen: pliegosOpen,
        activeTab: curTab,
      } = modalStateRef.current;

      if (cfgOpen) {
        setIsSettingsOpen(false);
        try {
          window.history.pushState({ tab: curTab }, '', `#${curTab}`);
        } catch {}
        return;
      }
      if (hitosOpen) {
        setIsHitosModalOpen(false);
        try {
          window.history.pushState({ tab: curTab }, '', `#${curTab}`);
        } catch {}
        return;
      }
      if (pliegosOpen) {
        setIsPliegosModalOpen(false);
        try {
          window.history.pushState({ tab: curTab }, '', `#${curTab}`);
        } catch {}
        return;
      }

      const nextHash = window.location.hash.replace(/^#/, '') as TabType;
      const resolvedTab: TabType = VALID_TABS.includes(nextHash) ? nextHash : 'dashboard';
      if (resolvedTab !== curTab) {
        skipNextPushRef.current = true;
        setActiveTab(resolvedTab);
      }
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [setActiveTab, setIsSettingsOpen, setIsHitosModalOpen, setIsPliegosModalOpen]);

  return null;
};

const MainContent: React.FC = () => {
  const { activeTab } = useApp();

  return (
    <main className="flex-1 overflow-y-auto overflow-x-hidden pb-24 safe-bottom relative w-full">
      <div className="max-w-6xl mx-auto p-3 sm:p-4 lg:p-6 w-full">
        {activeTab === 'dashboard' && <DashboardTab />}
        {activeTab === 'planos' && <PlanosTab />}
        {activeTab === 'comparador' && <ComparadorTab />}
        {activeTab === 'hitos' && <HitosTab />}
        {activeTab === 'minutas' && <MinutasTab />}
        {activeTab === 'informes' && <InformesTab />}
        {activeTab === 'interferencias' && <InterferenciasTab />}
        {activeTab === 'anotador' && <AnotadorTab />}
        {activeTab === 'chat' && <ChatTab />}
      </div>
    </main>
  );
};

const ModalsContainer: React.FC = () => {
  const { isPliegosModalOpen, setIsPliegosModalOpen } = useApp();

  return (
    <>
      <ModalConfiguracion />
      <ModalEditorHitos />
      <ModalCargarPliegos 
        isOpen={isPliegosModalOpen} 
        onClose={() => setIsPliegosModalOpen(false)} 
      />
    </>
  );
};

export default function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <HashNavigationSync />
        <div className="flex flex-col h-full w-full overflow-x-hidden overflow-y-hidden bg-[#0a0e17] text-slate-100 antialiased selection:bg-sky-500 selection:text-white">
          <Header />
          <MainContent />
          <Navbar />
          <ModalsContainer />
          <OfflineIndicator />
        </div>
      </AppProvider>
    </ErrorBoundary>
  );
}
