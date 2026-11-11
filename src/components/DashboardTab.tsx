import React from 'react';
import { useApp } from '../context/AppContext';
import { FRENTES_OBRA, matchPlanoFrente } from '../data/initialData';

export const DashboardTab: React.FC = () => {
  const { planos, megabytesR2, totalPlanificados, setActiveTab, setSelectedFrenteFilter } = useApp();

  const totalEmitidos = planos.length;
  const totalApc = planos.filter(p => p.selloApc === true).length;
  const pctGlobal = totalPlanificados > 0 
    ? ((totalEmitidos / totalPlanificados) * 100).toFixed(1) 
    : "0.0";

  const handleSelectFrente = (frenteId: string) => {
    setSelectedFrenteFilter(frenteId);
    setActiveTab('planos');
  };

  return (
    <div className="space-y-6">
      {/* Tarjeta Superior: Métricas Globales (Bento Row) */}
      <div className="bento-card p-5 lg:p-6 bg-gradient-to-br from-slate-900/90 via-slate-900/70 to-slate-950">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 pb-4 border-b border-slate-800/80">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <span className="text-sky-400">📊</span> Resumen General de Ingeniería
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">Estado consolidado de las 4 obras del corredor eléctrico</p>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <span className="text-[11px] bg-sky-950/60 text-sky-300 border border-sky-800/60 px-3 py-1 rounded-full font-medium">
              ⚡ 4 Frentes Contractuales
            </span>
          </div>
        </div>

        {/* Grilla 3 Métricas Destacadas */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 mb-5">
          <div className="metric-pill rounded-xl p-4 flex items-center justify-between">
            <div>
              <div className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">Planos Registrados</div>
              <div className="text-2xl font-extrabold text-white font-mono mt-1">{totalEmitidos}</div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-slate-800/80 flex items-center justify-center text-lg text-slate-300 border border-slate-700/60">
              📁
            </div>
          </div>

          <div className="metric-pill rounded-xl p-4 flex items-center justify-between border-emerald-900/40 bg-emerald-950/20">
            <div>
              <div className="text-[11px] text-emerald-400 font-semibold uppercase tracking-wider">Aprobados Sello APC</div>
              <div className="text-2xl font-extrabold text-emerald-400 font-mono mt-1">{totalApc}</div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-900/40 flex items-center justify-center text-lg text-emerald-300 border border-emerald-700/40">
              ✅
            </div>
          </div>

          <div className="metric-pill rounded-xl p-4 flex items-center justify-between border-sky-900/40 bg-sky-950/20">
            <div>
              <div className="text-[11px] text-sky-400 font-semibold uppercase tracking-wider">Respaldo Cloudflare R2</div>
              <div className="text-2xl font-extrabold text-sky-400 font-mono mt-1">{megabytesR2}</div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-sky-900/40 flex items-center justify-center text-lg text-sky-300 border border-sky-700/40">
              ☁️
            </div>
          </div>
        </div>

        {/* Barra de Avance Global (Calculada: emitidos vs 910 planificados) */}
        <div className="space-y-2">
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-400 font-medium">
              Avance Global de Emisión Documental (<span className="text-slate-300 font-mono">{totalEmitidos} / {totalPlanificados}</span>)
            </span>
            <span className="text-emerald-400 font-mono font-bold">{pctGlobal}%</span>
          </div>
          <div className="h-2 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-800/90">
            <div 
              className="h-full bg-gradient-to-r from-sky-500 via-blue-500 to-emerald-400 rounded-full transition-all duration-700" 
              style={{ width: `${Math.min(100, Math.max(3, parseFloat(pctGlobal)))}%` }}
            ></div>
          </div>
        </div>
      </div>

      {/* Cabecera de Frentes de Obra */}
      <div className="flex items-center justify-between px-1">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
          <span>🏗️</span> Frentes de Obra (132 kV)
        </h3>
        <span className="text-xs text-slate-500">Haz clic en una tarjeta para ver sus planos</span>
      </div>

      {/* Grilla de Frentes de Obra */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {FRENTES_OBRA.map(frente => {
          const planosFrente = planos.filter(p => matchPlanoFrente(p.proyecto, frente.id));

          const countCargados = planosFrente.length;
          const faltantes = Math.max(0, frente.totalPlanificados - countCargados);
          const pct = frente.totalPlanificados > 0 ? Math.min(100, Math.round((countCargados / frente.totalPlanificados) * 100)) : 0;

          return (
            <div 
              key={frente.id}
              onClick={() => handleSelectFrente(frente.id)}
              className="bento-card p-5 space-y-4 cursor-pointer hover:border-sky-500/50 group"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-slate-800/80 border border-slate-700/60 flex items-center justify-center text-xl shadow-inner shrink-0 group-hover:scale-105 transition-transform">
                    {frente.icono}
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white tracking-tight">{frente.nombre}</h4>
                    <p className="text-[11px] text-slate-400">
                      {frente.tipo} • <span className="font-mono text-sky-400 font-semibold">{frente.tension}</span>
                    </p>
                  </div>
                </div>
                <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-slate-950 text-slate-300 border border-slate-800 font-mono">
                  {countCargados} / {frente.totalPlanificados}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="metric-pill rounded-lg p-2.5 border-emerald-900/30 bg-emerald-950/20">
                  <div className="text-xs font-bold text-emerald-400 font-mono">{countCargados}</div>
                  <div className="text-[9px] text-emerald-400 uppercase font-semibold mt-0.5">Planos Emitidos</div>
                </div>
                <div className="metric-pill rounded-lg p-2.5 border-rose-900/30 bg-rose-950/20">
                  <div className="text-xs font-bold text-rose-400 font-mono">{faltantes}</div>
                  <div className="text-[9px] text-rose-400 uppercase font-semibold mt-0.5">Pendientes de Emisión</div>
                </div>
              </div>

              <div className="space-y-1.5 pt-1">
                <div className="flex justify-between text-[11px] text-slate-400">
                  <span>Avance de Diseño</span>
                  <span className="font-bold text-white font-mono">{pct}%</span>
                </div>
                <div className="h-1.5 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-800/80">
                  <div 
                    className="h-full bg-gradient-to-r from-sky-500 to-emerald-400 rounded-full transition-all duration-500" 
                    style={{ width: `${pct}%` }}
                  ></div>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-sky-400 font-semibold pt-1 border-t border-slate-800/60 group-hover:text-sky-300">
                <span>Explorar planos del frente ➔</span>
                <span className="text-[11px] text-slate-500 font-normal">Ver {countCargados} planos</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Banner Acceso Directo Anotador de Campo */}
      <div className="bento-card p-5 bg-gradient-to-r from-sky-950/40 via-slate-900 to-indigo-950/40 border-sky-800/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-2xl shrink-0">
            💡
          </div>
          <div>
            <h4 className="text-sm font-bold text-white leading-snug">Anotador Técnico & Auditor de Campo</h4>
            <p className="text-xs text-slate-400 mt-0.5">Coteja al instante qué exige el pliego vs qué indica el plano aprobado.</p>
          </div>
        </div>
        <button 
          onClick={() => setActiveTab('anotador')} 
          className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 active:scale-95 text-white font-bold text-xs shadow-lg shadow-sky-600/20 whitespace-nowrap transition-all cursor-pointer">
          Abrir Anotador ➔
        </button>
      </div>
    </div>
  );
};
