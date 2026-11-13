import React from 'react';
import { useApp } from '../context/AppContext';
import { FileText, Clock, Settings, RefreshCw, BookOpen } from 'lucide-react';

export const Header: React.FC = () => {
  const { 
    activeTab, 
    setActiveTab, 
    connectionStatus, 
    isSyncing, 
    sincronizarDatos, 
    setIsSettingsOpen,
    pliegosReales,
    setIsPliegosModalOpen
  } = useApp();

  const getSubtitle = () => {
    switch (activeTab) {
      case 'dashboard': return 'Control Documental & Ingeniería de Campo';
      case 'planos': return 'Explorador de Planos y Respaldo R2';
      case 'hitos': return 'Cronograma de Hitos & Alerta de Vencimientos';
      case 'informes': return 'Generador de Informes Ejecutivos en 1 Clic';
      case 'interferencias': return 'Auditoría de Cruces & Entes (LAT 132 kV)';
      case 'anotador': return 'Anotador Técnico & Auditoría';
      case 'chat': return 'Asistente IA Multimodal (Gemini)';
      default: return 'Control Documental & Ingeniería de Campo';
    }
  };

  return (
    <header className="bg-[#0f172a]/90 border-b border-slate-800/80 px-4 lg:px-8 py-3.5 flex items-center justify-between shrink-0 z-30 backdrop-blur-xl">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-600 via-blue-600 to-indigo-600 flex items-center justify-center text-lg font-black shadow-lg shadow-sky-500/20 text-white border border-sky-400/30 shrink-0">
          ⚡
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-extrabold tracking-tight text-white leading-none">Obras 132 kV</h1>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full bg-emerald-400 ${isSyncing ? 'animate-ping' : 'animate-pulse'}`}></span>
              <span>{connectionStatus}</span>
            </span>
          </div>
          <p className="text-[11px] text-slate-400 font-medium mt-0.5">{getSubtitle()}</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button 
          onClick={() => setIsPliegosModalOpen(true)} 
          className="px-3 py-1.5 rounded-xl bg-sky-950/80 hover:bg-sky-900 border border-sky-800 text-sky-300 text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
          title="Cargar y Gestionar Pliegos Reales (PDF / Word / Texto)">
          <BookOpen className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Pliegos Reales</span>
          {pliegosReales.length > 0 ? (
            <span className="px-1.5 py-0.2 rounded-full bg-sky-500 text-white text-[10px] font-bold">
              {pliegosReales.length}
            </span>
          ) : (
            <span className="px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-semibold border border-amber-500/40">
              Cargar
            </span>
          )}
        </button>

        <button 
          onClick={() => setActiveTab('informes')} 
          className="px-3 py-1.5 rounded-xl bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-800 text-emerald-300 text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer">
          <FileText className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Generar Informe</span>
        </button>

        <button 
          onClick={() => setActiveTab('hitos')} 
          className="px-3 py-1.5 rounded-xl bg-amber-950/80 hover:bg-amber-900 border border-amber-800 text-amber-300 text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer">
          <Clock className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Hitos</span>
        </button>

        <button 
          onClick={() => setIsSettingsOpen(true)} 
          className="p-2 rounded-xl bg-slate-800/70 hover:bg-slate-700 active:scale-95 text-slate-300 text-xs border border-slate-700/60 transition-all shadow-sm cursor-pointer" 
          title="Ajustes de Conexión (API / R2)">
          <Settings className="w-4 h-4" />
        </button>

        <button 
          onClick={() => sincronizarDatos()} 
          disabled={isSyncing}
          className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 active:scale-95 text-white text-xs font-bold shadow-md shadow-sky-600/20 flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-60">
          <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">{isSyncing ? 'Sincronizando' : 'Sincronizar'}</span>
        </button>
      </div>
    </header>
  );
};
