import React from 'react';
import { AppProvider, useApp } from './context/AppContext';
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

const MainContent: React.FC = () => {
  const { activeTab } = useApp();

  return (
    <main className="flex-1 overflow-y-auto safe-bottom relative">
      <div className="max-w-6xl mx-auto p-4 lg:p-6">
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
    <AppProvider>
      <div className="flex flex-col h-full overflow-hidden bg-[#0a0e17] text-slate-100 antialiased selection:bg-sky-500 selection:text-white">
        <Header />
        <MainContent />
        <Navbar />
        <ModalsContainer />
        <OfflineIndicator />
      </div>
    </AppProvider>
  );
}
