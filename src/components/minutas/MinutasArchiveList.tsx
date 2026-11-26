import React from 'react';
import {
  Check,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Copy,
  ExternalLink,
  FileDown,
  FileWarning,
  MessageSquare,
  Printer,
  Trash2,
} from 'lucide-react';
import { CompromisoMinuta, MinutaReunion } from '../../types';
import { descargarMarkdownComoWord } from '../../utils/exportWord';
import { esIncumplidoOVencido, imprimirMarkdownComoPdf } from './minutasHelpers';

interface MinutasArchiveListProps {
  hoyIso: string;
  minutasFiltradas: MinutaReunion[];
  compromisosMinutas: CompromisoMinuta[];
  minutaExpandidaId: string | null;
  setMinutaExpandidaId: (id: string | null) => void;
  copiedId: string | null;
  onAbrirAltaMinuta: () => void;
  onAuditarMinutaEnChat: (m: MinutaReunion) => void;
  onPrepararNotaPedidoDesde: (ids: string[]) => void;
  onEliminarMinuta: (id: string) => Promise<void>;
  onCopiar: (id: string, texto: string) => void;
}

export const MinutasArchiveList: React.FC<MinutasArchiveListProps> = ({
  hoyIso,
  minutasFiltradas,
  compromisosMinutas,
  minutaExpandidaId,
  setMinutaExpandidaId,
  copiedId,
  onAbrirAltaMinuta,
  onAuditarMinutaEnChat,
  onPrepararNotaPedidoDesde,
  onEliminarMinuta,
  onCopiar,
}) => {
  return (
    <div className="space-y-3">
      {minutasFiltradas.length === 0 ? (
        <div className="bento-card p-10 text-center space-y-3">
          <ClipboardList className="w-8 h-8 text-slate-500 mx-auto" />
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-white">No hay minutas cargadas</h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              Carga tus actas o minutas de reunión en PDF, Word o texto para mantener el historial accesible y extraer automáticamente los compromisos.
            </p>
          </div>
          <button
            type="button"
            onClick={onAbrirAltaMinuta}
            className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold cursor-pointer"
          >
            Cargar Minuta
          </button>
        </div>
      ) : (
        minutasFiltradas.map(m => {
          const compAsociados = compromisosMinutas.filter(c => c.minutaId === m.id);
          const incumplidos = compAsociados.filter(c => esIncumplidoOVencido(c, hoyIso));
          const expandida = minutaExpandidaId === m.id;

          return (
            <div key={m.id} className="bento-card p-3 sm:p-5 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 font-mono tabular-nums">
                    <span className="text-sky-400 font-bold">{m.codigo}</span>
                    <span aria-hidden="true">·</span>
                    <span>{m.fechaReunion}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-sans text-slate-300">{m.frente}</span>
                  </div>
                  <h4 className="text-sm font-bold text-white">{m.titulo}</h4>
                  <p className="text-xs text-slate-400">{m.participantes}</p>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => onAuditarMinutaEnChat(m)}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-sky-300 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>Auditar en Chat</span>
                  </button>
                  {incumplidos.length > 0 && (
                    <button
                      type="button"
                      onClick={() => onPrepararNotaPedidoDesde(incumplidos.map(c => c.id))}
                      className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                    >
                      <FileWarning className="w-3.5 h-3.5" />
                      <span>Nota de Pedido ({incumplidos.length})</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setMinutaExpandidaId(expandida ? null : m.id)}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    {expandida ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    <span>{expandida ? 'Ocultar' : 'Ver Acta'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onEliminarMinuta(m.id)}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 cursor-pointer"
                    title="Eliminar minuta"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {m.resumen && (
                <p className="text-xs text-slate-300 leading-relaxed pt-2 border-t border-slate-800/80">
                  {m.resumen}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-mono tabular-nums text-slate-400">
                <span>{compAsociados.length} compromisos extraídos</span>
                <span aria-hidden="true">·</span>
                <span className={incumplidos.length > 0 ? 'text-rose-400 font-semibold' : ''}>
                  {incumplidos.length} incumplidos / vencidos
                </span>
                {m.driveRuta && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="font-sans truncate max-w-full sm:max-w-sm text-sky-300/90">{m.driveRuta}</span>
                  </>
                )}
                {m.nombreArchivo && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="font-sans truncate max-w-full sm:max-w-xs">{m.nombreArchivo}</span>
                  </>
                )}
                {m.driveUrl && (
                  <>
                    <span aria-hidden="true">·</span>
                    <a
                      href={m.driveUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-sans text-sky-400 hover:text-sky-300 inline-flex items-center gap-1"
                    >
                      <span>Abrir en Drive</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </>
                )}
              </div>

              {expandida && (
                <div className="pt-3 border-t border-slate-800 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xs font-semibold text-slate-300">Contenido íntegro de la minuta</div>
                    {m.contenidoTexto && (
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onCopiar(m.id, m.contenidoTexto)}
                          className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                        >
                          {copiedId === m.id ? (
                            <Check className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                          <span>{copiedId === m.id ? 'Copiado' : 'Copiar'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            descargarMarkdownComoWord(
                              m.codigo.replace(/[^a-zA-Z0-9_-]/g, '_'),
                              `${m.codigo} - ${m.titulo}`,
                              m.contenidoTexto
                            )
                          }
                          className="px-2.5 py-1 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-300 text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                        >
                          <FileDown className="w-3 h-3" />
                          <span>Word (.doc)</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => imprimirMarkdownComoPdf(m.codigo, m.contenidoTexto)}
                          className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-sky-300 text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                        >
                          <Printer className="w-3 h-3" />
                          <span>PDF</span>
                        </button>
                      </div>
                    )}
                  </div>
                  <pre className="whitespace-pre-wrap text-xs text-slate-300 bg-slate-950 border border-slate-800 rounded-xl p-4 max-h-80 overflow-y-auto font-sans leading-relaxed">
                    {m.contenidoTexto || 'Sin texto adjunto (minuta registrada por ítems manuales).'}
                  </pre>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
};
