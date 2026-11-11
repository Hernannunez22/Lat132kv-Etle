import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { FolderUp, Zap } from 'lucide-react';

export const HitosTab: React.FC = () => {
  const { hitos, planos, setIsHitosModalOpen, setActiveTab, sendChatMessage } = useApp();
  const [filtroHito, setFiltroHito] = useState<'TODOS' | 'ALERTA' | 'VENCIDO' | 'EN_PLAZO'>('TODOS');

  const hoy = new Date();

  // Calcular semáforo para cada hito
  const hitosCalculados = hitos.map(h => {
    let fIso = h.fechaObjetivo || "2026-12-31";
    if (fIso.includes("/")) {
      const p = fIso.split("/");
      if (p.length === 3) fIso = `${p[2]}-${p[1].padStart(2, '0')}-${p[0].padStart(2, '0')}`;
    }

    const fObj = new Date(fIso + "T00:00:00");
    const diffMs = fObj.getTime() - hoy.getTime();
    const diasRestantes = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    let semaforo: 'EN_PLAZO' | 'ALERTA' | 'VENCIDO' = "EN_PLAZO";
    let semaforoEtiqueta = `🟢 En plazo (${diasRestantes}d)`;
    let semaforoColor = "text-emerald-400 bg-emerald-950/40 border-emerald-800";

    if (diasRestantes < 0) {
      semaforo = "VENCIDO";
      semaforoEtiqueta = `🔴 Vencido (${Math.abs(diasRestantes)}d atrás)`;
      semaforoColor = "text-rose-400 bg-rose-950/40 border-rose-800";
    } else if (diasRestantes <= 15) {
      semaforo = "ALERTA";
      semaforoEtiqueta = `🟡 Por vencer (${diasRestantes}d)`;
      semaforoColor = "text-amber-400 bg-amber-950/40 border-amber-800";
    }

    return { ...h, fechaObjetivo: fIso, diasRestantes, semaforo, semaforoEtiqueta, semaforoColor };
  });

  const filtrados = hitosCalculados.filter(h => {
    if (filtroHito === 'ALERTA') return h.semaforo === 'ALERTA';
    if (filtroHito === 'VENCIDO') return h.semaforo === 'VENCIDO';
    if (filtroHito === 'EN_PLAZO') return h.semaforo === 'EN_PLAZO';
    return true;
  });

  const handleAuditarHito = (codigo: string, nombre: string) => {
    setActiveTab('chat');
    sendChatMessage(`¿Cuál es el estado crítico del Hito ${codigo} ("${nombre}") y qué documentación o planos falta presentar para no retrasar el cronograma?`);
  };

  return (
    <div className="space-y-4">
      {/* Top Banner Bento */}
      <div className="bento-card p-5 bg-gradient-to-br from-slate-900 via-slate-900 to-amber-950/30 border-amber-800/40">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 mb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">⏳</span>
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400">
                Cronograma Maestro de Hitos Contractuales
              </h3>
              <p className="text-[11px] text-slate-400">
                Ruta crítica, fechas contractuales de entrega y semáforos de cumplimiento
              </p>
            </div>
          </div>
          <button 
            onClick={() => setIsHitosModalOpen(true)}
            className="px-3.5 py-1.5 bg-amber-950/80 hover:bg-amber-900 text-amber-300 border border-amber-800/80 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer self-start sm:self-auto"
          >
            <FolderUp className="w-3.5 h-3.5" />
            <span>Cargar Cronograma (Excel)</span>
          </button>
        </div>

        {/* Filtros de Hitos */}
        <div className="flex items-center gap-2 overflow-x-auto text-xs pt-1">
          <button 
            onClick={() => setFiltroHito('TODOS')} 
            className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition-all cursor-pointer font-bold ${
              filtroHito === 'TODOS' 
                ? 'bg-amber-600 text-white shadow-sm' 
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
            }`}
          >
            Todos ({hitos.length})
          </button>
          <button 
            onClick={() => setFiltroHito('ALERTA')} 
            className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition-all cursor-pointer font-medium ${
              filtroHito === 'ALERTA' 
                ? 'bg-amber-600 text-white font-bold shadow-sm' 
                : 'bg-slate-800 hover:bg-slate-700 text-amber-400'
            }`}
          >
            🟡 Próximos a Vencer
          </button>
          <button 
            onClick={() => setFiltroHito('VENCIDO')} 
            className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition-all cursor-pointer font-medium ${
              filtroHito === 'VENCIDO' 
                ? 'bg-amber-600 text-white font-bold shadow-sm' 
                : 'bg-slate-800 hover:bg-slate-700 text-rose-400'
            }`}
          >
            🔴 Vencidos
          </button>
          <button 
            onClick={() => setFiltroHito('EN_PLAZO')} 
            className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition-all cursor-pointer font-medium ${
              filtroHito === 'EN_PLAZO' 
                ? 'bg-amber-600 text-white font-bold shadow-sm' 
                : 'bg-slate-800 hover:bg-slate-700 text-emerald-400'
            }`}
          >
            🟢 En Plazo
          </button>
        </div>
      </div>

      {/* Listado de Tarjetas de Hitos */}
      <div className="space-y-4">
        {filtrados.length === 0 ? (
          <div className="bento-card p-8 text-center text-slate-500 text-xs">
            No hay hitos con el filtro seleccionado.
          </div>
        ) : (
          filtrados.map(hito => {
            return (
              <div 
                key={hito.id} 
                className="bento-card p-5 space-y-4 border-slate-800/90 bg-slate-900/80 hover:border-amber-700/50"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2.5">
                    <span className="px-2 py-1 rounded bg-slate-800 text-amber-400 font-mono font-extrabold text-xs border border-slate-700">
                      {hito.codigo}
                    </span>
                    <div>
                      <h4 className="text-xs font-bold text-white leading-snug">{hito.nombre}</h4>
                      <p className="text-[11px] text-slate-400">
                        {hito.frente} • Ponderación: <b className="text-sky-400 font-mono">{hito.pesoContractual || '15%'}</b>
                      </p>
                    </div>
                  </div>
                  <span className={`text-[10px] font-mono font-bold px-2.5 py-1 rounded-full border self-start sm:self-auto ${hito.semaforoColor}`}>
                    {hito.semaforoEtiqueta}
                  </span>
                </div>

                {/* Planos Críticos Requeridos */}
                <div className="space-y-1.5">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Planos Críticos Requeridos:
                  </div>
                  <div className="space-y-1">
                    {(hito.planosRequeridos || []).map((p, pIdx) => {
                      const planoEncontrado = planos.find(item => 
                        (item.codigo || '').toLowerCase().includes(p.toLowerCase()) || 
                        p.toLowerCase().includes((item.codigo || '').toLowerCase())
                      );
                      const isEmitido = !!planoEncontrado;

                      return (
                        <div 
                          key={pIdx} 
                          className="flex items-center justify-between text-[11px] p-2 rounded-lg bg-slate-950/80 border border-slate-800"
                        >
                          <span className="font-mono text-slate-200 font-bold">{p}</span>
                          {isEmitido ? (
                            <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 font-mono">
                              Emitido (Rev {planoEncontrado?.revision || 'EO'})
                            </span>
                          ) : (
                            <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-amber-950 text-amber-400 border border-amber-800 font-mono">
                              Pendiente ⚠️
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Footer del Hito */}
                <div className="pt-3 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                  <span className="text-slate-400 text-[11px]">
                    Responsable: <b className="text-slate-200">{hito.responsable || 'UTE'}</b> | Fecha: <b className="text-white font-mono">{hito.fechaObjetivo}</b>
                  </span>
                  <button 
                    onClick={() => handleAuditarHito(hito.codigo, hito.nombre)} 
                    className="px-3 py-1.5 bg-amber-950/80 hover:bg-amber-900 border border-amber-800 text-amber-300 rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition-all cursor-pointer self-start sm:self-auto"
                  >
                    <Zap className="w-3.5 h-3.5 text-amber-400" />
                    <span>Auditar Ruta Crítica</span>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
