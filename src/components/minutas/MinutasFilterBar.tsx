import React from 'react';
import { Search } from 'lucide-react';
import { FiltroEstado, FRENTES_OPCIONES, SubVistaMinutas } from './minutasHelpers';

interface MinutasFilterBarProps {
  subVista: SubVistaMinutas;
  busqueda: string;
  setBusqueda: (val: string) => void;
  filtroFrente: string;
  setFiltroFrente: (val: string) => void;
  filtroEstado: FiltroEstado;
  setFiltroEstado: (val: FiltroEstado) => void;
}

export const MinutasFilterBar: React.FC<MinutasFilterBarProps> = ({
  subVista,
  busqueda,
  setBusqueda,
  filtroFrente,
  setFiltroFrente,
  filtroEstado,
  setFiltroEstado,
}) => {
  return (
    <div className="bento-card p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3">
      <div className="relative flex-1">
        <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar por código de minuta, compromiso, responsable o plano..."
          className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={filtroFrente}
          onChange={e => setFiltroFrente(e.target.value)}
          className="w-full sm:w-auto bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none"
        >
          <option value="TODOS">Todos los frentes</option>
          {FRENTES_OPCIONES.map(f => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>

        {subVista === 'compromisos' && (
          <div className="flex items-center gap-1 p-1 bg-slate-950 border border-slate-800 rounded-xl max-w-full overflow-x-auto flex-nowrap no-scrollbar">
            {(['TODOS', 'INCUMPLIDO', 'PENDIENTE', 'CUMPLIDO'] as FiltroEstado[]).map(f => (
              <button
                key={f}
                type="button"
                onClick={() => setFiltroEstado(f)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold cursor-pointer whitespace-nowrap shrink-0 transition-colors ${
                  filtroEstado === f
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {f === 'TODOS'
                  ? 'Todos'
                  : f === 'INCUMPLIDO'
                    ? 'Incumplidos'
                    : f === 'PENDIENTE'
                      ? 'Pendientes'
                      : 'Cumplidos'}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
