import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { RefreshCw, CheckCircle2, AlertTriangle, MapPin } from 'lucide-react';

export const InterferenciasTab: React.FC = () => {
  const { interferencias, sincronizarDatos, isSyncing } = useApp();
  const [filtro, setFiltro] = useState<'TODOS' | 'LISTOS' | 'FALTANTES'>('TODOS');

  const filtradas = interferencias.filter(item => {
    const estado = (item.estadoTramite || '').toUpperCase();
    const esListo = estado.includes('LISTO') || estado.includes('SUFICIENTES');
    if (filtro === 'LISTOS') return esListo;
    if (filtro === 'FALTANTES') return !esListo || (item.faltantes && item.faltantes.length > 0);
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Top Banner Bento */}
      <div className="bento-card p-5 bg-gradient-to-br from-slate-900 via-slate-900 to-amber-950/20 border-amber-900/30">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 mb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">🚧</span>
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400">
                Interferencias & Cruces (LAT 132 kV)
              </h3>
              <p className="text-[11px] text-slate-400">
                Auditoría de trámites ante TGN, Gasnor, Vialidad, Ferrocarril y EDET
              </p>
            </div>
          </div>
          <button 
            onClick={() => sincronizarDatos()} 
            disabled={isSyncing}
            className="px-3 py-1.5 bg-amber-950/80 hover:bg-amber-900 text-amber-300 border border-amber-800/80 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer self-start sm:self-auto disabled:opacity-60"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>Auditar</span>
          </button>
        </div>

        {/* Filtros */}
        <div className="flex items-center gap-2 overflow-x-auto text-xs pt-1">
          <button 
            onClick={() => setFiltro('TODOS')} 
            className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition-all cursor-pointer font-bold ${
              filtro === 'TODOS' 
                ? 'bg-amber-600 text-white shadow-sm' 
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
            }`}
          >
            Todos ({interferencias.length})
          </button>
          <button 
            onClick={() => setFiltro('LISTOS')} 
            className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition-all cursor-pointer font-medium ${
              filtro === 'LISTOS' 
                ? 'bg-amber-600 text-white font-bold shadow-sm' 
                : 'bg-slate-800 hover:bg-slate-700 text-emerald-400'
            }`}
          >
            ✅ Listos para Presentar
          </button>
          <button 
            onClick={() => setFiltro('FALTANTES')} 
            className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition-all cursor-pointer font-medium ${
              filtro === 'FALTANTES' 
                ? 'bg-amber-600 text-white font-bold shadow-sm' 
                : 'bg-slate-800 hover:bg-slate-700 text-rose-400'
            }`}
          >
            ⚠️ Con Faltantes
          </button>
        </div>
      </div>

      {/* Grilla de Organismos e Interferencias */}
      <div id="contenedorTarjetasInterferencias" className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filtradas.length === 0 ? (
          <div className="col-span-full bento-card p-8 text-center text-slate-500 text-xs">
            No hay organismos con ese filtro de interferencias.
          </div>
        ) : (
          filtradas.map((item, idx) => {
            const estado = (item.estadoTramite || '').toUpperCase();
            const esListo = estado.includes('LISTO') || estado.includes('SUFICIENTES');

            return (
              <div 
                key={item.id || idx} 
                className="bento-card p-5 space-y-3.5 flex flex-col justify-between hover:border-amber-700/40"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-mono uppercase font-bold text-slate-400">
                        {item.normativa || 'Norma Ente'}
                      </span>
                      <h4 className="text-sm font-extrabold text-white leading-tight mt-0.5">
                        {item.empresa}
                      </h4>
                      <p className="text-[11px] text-amber-300 font-medium mt-0.5">
                        {item.tipoInterferencia || 'Cruce'}
                      </p>
                    </div>
                    <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border shrink-0 flex items-center gap-1 ${
                      esListo 
                        ? 'bg-emerald-950 text-emerald-400 border-emerald-800' 
                        : 'bg-rose-950 text-rose-400 border-rose-800'
                    }`}>
                      {esListo ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                      <span>{esListo ? 'Listo' : 'Incompleto'}</span>
                    </span>
                  </div>

                  {/* Vanos Afectados */}
                  <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800 text-[11px] text-slate-300 flex items-center gap-2">
                    <MapPin className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <div>
                      <span className="text-slate-500 font-semibold">Vanos Afectados: </span>
                      <b className="text-white">{item.vanosAfectados || 'Traza General'}</b>
                    </div>
                  </div>

                  {/* Faltantes si existen */}
                  {item.faltantes && item.faltantes.length > 0 && (
                    <div className="space-y-1.5 p-2.5 rounded-lg bg-rose-950/20 border border-rose-900/40 text-[11px]">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-rose-400 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> Requisitos Faltantes para Dictamen:
                      </span>
                      <ul className="space-y-1 pl-1">
                        {item.faltantes.map((f, fIdx) => (
                          <li key={fIdx} className="text-rose-200 flex items-start gap-1.5">
                            <span className="text-rose-400">•</span>
                            <span>{f}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
