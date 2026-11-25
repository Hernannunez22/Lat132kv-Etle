import React, { useState } from 'react';
import { RefreshCw, ExternalLink } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { FRENTES_OBRA, matchPlanoFrente } from '../data/initialData';
import { esErrorPopupBloqueado } from '../utils/googleAuth';

export const DashboardTab: React.FC = () => {
  const {
    planos,
    megabytesR2,
    totalPlanificados,
    planificadosPorFrente,
    elencosMeta,
    sincronizarElencosDrive,
    hasDriveToken,
    driveConnectionState,
    conectarGoogleDriveChat,
    setActiveTab,
    setSelectedFrenteFilter,
  } = useApp();

  const [sincronizandoElenco, setSincronizandoElenco] = useState(false);
  const [errorElenco, setErrorElenco] = useState<string | null>(null);

  const totalEmitidos = planos.length;
  const totalApc = planos.filter(p => p.selloApc === true).length;
  const pctGlobal = totalPlanificados > 0 
    ? ((totalEmitidos / totalPlanificados) * 100).toFixed(1) 
    : "0.0";

  const handleSelectFrente = (frenteId: string) => {
    setSelectedFrenteFilter(frenteId);
    setActiveTab('planos');
  };

  const handleSincronizarElencos = async () => {
    setSincronizandoElenco(true);
    setErrorElenco(null);
    try {
      await sincronizarElencosDrive();
    } catch (err: any) {
      setErrorElenco(err?.message || 'No se pudo leer la carpeta de Elencos en Google Drive.');
    } finally {
      setSincronizandoElenco(false);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Tarjeta Superior: Métricas Globales (Bento Row) */}
      <div className="bento-card p-3 sm:p-5 lg:p-6 bg-gradient-to-br from-slate-900/90 via-slate-900/70 to-slate-950">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 mb-3 pb-3 sm:mb-5 sm:pb-4 border-b border-slate-800/80">
          <div className="min-w-0">
            <h2 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <span className="text-sky-400">📊</span> Resumen General de Ingeniería
            </h2>
            <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5">Estado consolidado de las 4 obras del corredor eléctrico</p>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
            <span className="text-[10px] sm:text-[11px] bg-sky-950/60 text-sky-300 border border-sky-800/60 px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-full font-medium whitespace-nowrap">
              ⚡ 4 Frentes Contractuales
            </span>
          </div>
        </div>

        {/* Grilla 3 Métricas Destacadas */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3.5 mb-3.5 sm:mb-5">
          <div className="metric-pill rounded-xl p-3 sm:p-4 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[10px] sm:text-[11px] text-slate-400 font-semibold uppercase tracking-wider">Planos Registrados</div>
              <div className="text-lg sm:text-2xl font-extrabold text-white font-mono tabular-nums mt-0.5 sm:mt-1">{totalEmitidos}</div>
            </div>
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-slate-800/80 flex items-center justify-center text-base sm:text-lg text-slate-300 border border-slate-700/60 shrink-0">
              📁
            </div>
          </div>

          <div className="metric-pill rounded-xl p-3 sm:p-4 flex items-center justify-between gap-2 border-emerald-900/40 bg-emerald-950/20">
            <div className="min-w-0">
              <div className="text-[10px] sm:text-[11px] text-emerald-400 font-semibold uppercase tracking-wider">Aprobados Sello APC</div>
              <div className="text-lg sm:text-2xl font-extrabold text-emerald-400 font-mono tabular-nums mt-0.5 sm:mt-1">{totalApc}</div>
            </div>
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-emerald-900/40 flex items-center justify-center text-base sm:text-lg text-emerald-300 border border-emerald-700/40 shrink-0">
              ✅
            </div>
          </div>

          <div className="metric-pill rounded-xl p-3 sm:p-4 flex items-center justify-between gap-2 border-sky-900/40 bg-sky-950/20">
            <div className="min-w-0">
              <div className="text-[10px] sm:text-[11px] text-sky-400 font-semibold uppercase tracking-wider">Respaldo Cloudflare R2</div>
              <div className="text-lg sm:text-2xl font-extrabold text-sky-400 font-mono tabular-nums mt-0.5 sm:mt-1">{megabytesR2}</div>
            </div>
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-sky-900/40 flex items-center justify-center text-base sm:text-lg text-sky-300 border border-sky-700/40 shrink-0">
              ☁️
            </div>
          </div>
        </div>

        {/* Barra de Avance Global (Sincronizada con Seguimiento / Carpeta de Elencos en Drive) */}
        <div className="space-y-1.5 sm:space-y-2">
          <div className="flex flex-wrap justify-between items-center gap-2 text-[11px] sm:text-xs">
            <span className="text-slate-400 font-medium min-w-0">
              Avance Global de Emisión Documental (<span className="text-slate-300 font-mono tabular-nums">{totalEmitidos} / {totalPlanificados}</span>)
            </span>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleSincronizarElencos}
                disabled={sincronizandoElenco}
                className="px-2 py-0.5 rounded-lg bg-slate-800/80 hover:bg-sky-900/50 border border-slate-700/70 hover:border-sky-500/40 text-[10px] font-semibold text-sky-300 inline-flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-60"
                title={`Leer automáticamente carpeta de Elencos y Seguimiento en Google Drive (${elencosMeta.fuente})`}
              >
                <RefreshCw className={`w-2.5 h-2.5 ${sincronizandoElenco ? 'animate-spin' : ''}`} />
                <span>{sincronizandoElenco ? 'Leyendo Elencos...' : 'Actualizar Elencos Drive'}</span>
              </button>
              <span className="text-emerald-400 font-mono font-bold tabular-nums">{pctGlobal}%</span>
            </div>
          </div>
          <div className="h-2 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-800/90">
            <div 
              className="h-full bg-gradient-to-r from-sky-500 via-blue-500 to-emerald-400 rounded-full transition-all duration-700" 
              style={{ width: `${Math.min(100, Math.max(3, parseFloat(pctGlobal)))}%` }}
            ></div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-500">
            <span>
              Fuente elenco: {elencosMeta.fuente}
              {hasDriveToken && driveConnectionState.accountEmail
                ? ` · Drive: ${driveConnectionState.accountEmail}${
                    driveConnectionState.remainingMinutes > 0 ? ` (${driveConnectionState.remainingMinutes}m)` : ''
                  }`
                : ''}
            </span>
            {errorElenco && (
              <div className="flex flex-wrap items-center gap-2 text-rose-400">
                <span>{errorElenco}</span>
                {esErrorPopupBloqueado(errorElenco) && (
                  <a
                    href={typeof window !== 'undefined' ? window.location.href : '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-600 text-white font-semibold"
                  >
                    <ExternalLink className="w-2.5 h-2.5" />
                    <span>Abrir en pestaña nueva</span>
                  </a>
                )}
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await conectarGoogleDriveChat({ forceConsent: true });
                      await handleSincronizarElencos();
                    } catch (e: any) {
                      setErrorElenco(e?.message || errorElenco);
                    }
                  }}
                  className="underline text-sky-300 hover:text-sky-200 cursor-pointer"
                >
                  Reautorizar Drive
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Cabecera de Frentes de Obra */}
      <div className="flex flex-wrap items-center justify-between gap-1 px-1">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
          <span>🏗️</span> Frentes de Obra (132 kV)
        </h3>
        <span className="text-[11px] sm:text-xs text-slate-500">Haz clic en una tarjeta para ver sus planos</span>
      </div>

      {/* Grilla de Frentes de Obra */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
        {FRENTES_OBRA.map(frente => {
          const planosFrente = planos.filter(p => matchPlanoFrente(p.proyecto, frente.id));
          const totalFrente =
            Number(planificadosPorFrente[frente.id]) > 0
              ? Number(planificadosPorFrente[frente.id])
              : frente.totalPlanificados;

          const countCargados = planosFrente.length;
          const faltantes = Math.max(0, totalFrente - countCargados);
          const pct = totalFrente > 0 ? Math.min(100, Math.round((countCargados / totalFrente) * 100)) : 0;

          return (
            <div 
              key={frente.id}
              onClick={() => handleSelectFrente(frente.id)}
              className="bento-card p-3 sm:p-5 space-y-3 sm:space-y-4 cursor-pointer hover:border-sky-500/50 group"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                  <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-slate-800/80 border border-slate-700/60 flex items-center justify-center text-lg sm:text-xl shadow-inner shrink-0 group-hover:scale-105 transition-transform">
                    {frente.icono}
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-xs font-bold text-white tracking-tight truncate">{frente.nombre}</h4>
                    <p className="text-[11px] text-slate-400">
                      {frente.tipo} • <span className="font-mono text-sky-400 font-semibold">{frente.tension}</span>
                    </p>
                  </div>
                </div>
                <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-slate-950 text-slate-300 border border-slate-800 font-mono tabular-nums shrink-0 whitespace-nowrap">
                  {countCargados} / {totalFrente}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="metric-pill rounded-lg p-2 sm:p-2.5 border-emerald-900/30 bg-emerald-950/20">
                  <div className="text-xs font-bold text-emerald-400 font-mono tabular-nums">{countCargados}</div>
                  <div className="text-[9px] text-emerald-400 uppercase font-semibold mt-0.5">Planos Emitidos</div>
                </div>
                <div className="metric-pill rounded-lg p-2 sm:p-2.5 border-rose-900/30 bg-rose-950/20">
                  <div className="text-xs font-bold text-rose-400 font-mono tabular-nums">{faltantes}</div>
                  <div className="text-[9px] text-rose-400 uppercase font-semibold mt-0.5">Pendientes de Emisión</div>
                </div>
              </div>

              <div className="space-y-1.5 pt-1">
                <div className="flex justify-between text-[11px] text-slate-400">
                  <span>Avance de Diseño</span>
                  <span className="font-bold text-white font-mono tabular-nums">{pct}%</span>
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
      <div className="bento-card p-3 sm:p-5 bg-gradient-to-r from-sky-950/40 via-slate-900 to-indigo-950/40 border-sky-800/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
        <div className="flex items-center gap-3 sm:gap-3.5 min-w-0">
          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-xl sm:text-2xl shrink-0">
            💡
          </div>
          <div className="min-w-0">
            <h4 className="text-xs sm:text-sm font-bold text-white leading-snug">Anotador Técnico & Auditor de Campo</h4>
            <p className="text-[11px] sm:text-xs text-slate-400 mt-0.5">Coteja al instante qué exige el pliego vs qué indica el plano aprobado.</p>
          </div>
        </div>
        <button 
          onClick={() => setActiveTab('anotador')} 
          className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 active:scale-95 text-white font-bold text-xs shadow-lg shadow-sky-600/20 whitespace-nowrap transition-all cursor-pointer shrink-0">
          Abrir Anotador ➔
        </button>
      </div>
    </div>
  );
};
