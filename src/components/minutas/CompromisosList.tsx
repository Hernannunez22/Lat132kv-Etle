import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Clock,
  FileWarning,
  FolderSync,
  Trash2,
} from 'lucide-react';
import { CompromisoMinuta } from '../../types';
import { calcularDiasDesvio, esIncumplidoOVencido } from './minutasHelpers';

interface CompromisosListProps {
  hoyIso: string;
  totalCompromisosCount: number;
  incumplidosCount: number;
  compromisosFiltrados: CompromisoMinuta[];
  seleccionados: string[];
  sincronizandoDrive: boolean;
  onSeleccionarTodosIncumplidos: () => void;
  onLimpiarSeleccion: () => void;
  onPrepararNotaPedidoDesde: (ids: string[]) => void;
  onToggleSeleccion: (id: string) => void;
  onActualizarCompromiso: (id: string, data: Partial<CompromisoMinuta>) => Promise<void>;
  onEliminarCompromiso: (id: string) => Promise<void>;
  onEjecutarLecturaDrive: () => Promise<void>;
  onAbrirAltaCompromiso: () => void;
}

export const CompromisosList: React.FC<CompromisosListProps> = ({
  hoyIso,
  totalCompromisosCount,
  incumplidosCount,
  compromisosFiltrados,
  seleccionados,
  sincronizandoDrive,
  onSeleccionarTodosIncumplidos,
  onLimpiarSeleccion,
  onPrepararNotaPedidoDesde,
  onToggleSeleccion,
  onActualizarCompromiso,
  onEliminarCompromiso,
  onEjecutarLecturaDrive,
  onAbrirAltaCompromiso,
}) => {
  return (
    <div className="space-y-3">
      {compromisosFiltrados.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onSeleccionarTodosIncumplidos}
              className="text-rose-300 hover:text-rose-200 font-semibold cursor-pointer"
            >
              Seleccionar todos los incumplidos ({incumplidosCount})
            </button>
            {seleccionados.length > 0 && (
              <button
                type="button"
                onClick={onLimpiarSeleccion}
                className="text-slate-400 hover:text-slate-200 cursor-pointer"
              >
                Limpiar selección ({seleccionados.length})
              </button>
            )}
          </div>
          {seleccionados.length > 0 && (
            <button
              type="button"
              onClick={() => onPrepararNotaPedidoDesde(seleccionados)}
              className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <FileWarning className="w-3.5 h-3.5" />
              <span>Generar Nota de Pedido ({seleccionados.length})</span>
            </button>
          )}
        </div>
      )}

      {compromisosFiltrados.length === 0 ? (
        <div className="bento-card p-10 text-center space-y-3">
          <ClipboardList className="w-8 h-8 text-slate-500 mx-auto" />
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-white">
              {totalCompromisosCount === 0
                ? 'No hay compromisos de minutas cargados todavía'
                : 'No hay compromisos que coincidan con el filtro'}
            </h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              Conecta tu Google Drive para leer automáticamente las minutas alojadas en las carpetas del proyecto y extraer todos sus compromisos y plazos.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => onEjecutarLecturaDrive()}
              disabled={sincronizandoDrive}
              className="px-4 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-900 text-xs font-bold cursor-pointer inline-flex items-center gap-2"
            >
              <FolderSync className="w-3.5 h-3.5 text-sky-600" />
              <span>{sincronizandoDrive ? 'Leyendo Google Drive...' : 'Leer Minutas desde Drive'}</span>
            </button>
            <button
              type="button"
              onClick={onAbrirAltaCompromiso}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold cursor-pointer"
            >
              Agregar Compromiso Manual
            </button>
          </div>
        </div>
      ) : (
        <div className="bento-card overflow-hidden">
          {/* Vista apilada en móvil (<768px) */}
          <div className="md:hidden divide-y divide-slate-800/80">
            {compromisosFiltrados.map(comp => {
              const esInc = esIncumplidoOVencido(comp, hoyIso);
              const diasDesvio = calcularDiasDesvio(comp.fechaLimite, hoyIso);
              const isSel = seleccionados.includes(comp.id);

              return (
                <div
                  key={comp.id}
                  className={`p-3 space-y-2.5 text-xs ${isSel ? 'bg-sky-950/20' : ''}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2 min-w-0">
                      <input
                        type="checkbox"
                        checked={isSel}
                        onChange={() => onToggleSeleccion(comp.id)}
                        className="mt-0.5 rounded border-slate-600 bg-slate-950 text-sky-500 cursor-pointer shrink-0"
                        aria-label={`Seleccionar compromiso ${comp.numeroItem}`}
                      />
                      <div className="min-w-0">
                        <div className="font-mono font-bold text-sky-400 truncate">{comp.minutaCodigo}</div>
                        <div className="text-[11px] text-slate-500 font-mono tabular-nums">
                          {comp.numeroItem} · {comp.minutaFecha}
                        </div>
                      </div>
                    </div>

                    {comp.estado === 'CUMPLIDO' ? (
                      <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold shrink-0 text-[11px]">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Cumplido</span>
                      </span>
                    ) : esInc ? (
                      <span className="inline-flex items-center gap-1 text-rose-400 font-semibold shrink-0 text-[11px]">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>Incumplido</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-amber-300 font-semibold shrink-0 text-[11px]">
                        <Clock className="w-3.5 h-3.5" />
                        <span>{comp.estado === 'EN_CURSO' ? 'En curso' : 'Pendiente'}</span>
                      </span>
                    )}
                  </div>

                  <p className="text-slate-100 leading-relaxed">{comp.descripcion}</p>

                  {((comp.documentosRelacionados && comp.documentosRelacionados.length > 0) ||
                    (comp.notasPedidoIds && comp.notasPedidoIds.length > 0)) && (
                    <div className="text-[11px] text-slate-400 font-mono flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      {comp.documentosRelacionados && comp.documentosRelacionados.length > 0 && (
                        <span className="break-all">Docs: {comp.documentosRelacionados.join(', ')}</span>
                      )}
                      {comp.notasPedidoIds && comp.notasPedidoIds.length > 0 && (
                        <span className="text-rose-300 font-semibold">
                          NP emitidas: {comp.notasPedidoIds.join(', ')}
                        </span>
                      )}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] pt-1 border-t border-slate-800/60">
                    <div className="min-w-0">
                      <span className="font-semibold text-slate-200">{comp.responsable}</span>
                      <span className="text-slate-500"> · {comp.frente}</span>
                    </div>
                    <div className="font-mono tabular-nums shrink-0">
                      <span className={esInc ? 'text-rose-300 font-bold' : 'text-slate-200'}>
                        Vence: {comp.fechaLimite}
                      </span>
                      {comp.estado !== 'CUMPLIDO' && diasDesvio > 0 && (
                        <span className="text-rose-400 ml-1">({diasDesvio}d mora)</span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-1.5 pt-1">
                    {comp.estado !== 'CUMPLIDO' ? (
                      <button
                        type="button"
                        onClick={() => onActualizarCompromiso(comp.id, { estado: 'CUMPLIDO' })}
                        className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-emerald-600/20 border border-slate-700 text-emerald-300 text-[11px] font-semibold cursor-pointer"
                      >
                        Cumplir
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onActualizarCompromiso(comp.id, { estado: 'INCUMPLIDO' })}
                        className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-rose-600/20 border border-slate-700 text-slate-300 text-[11px] font-semibold cursor-pointer"
                      >
                        Reabrir
                      </button>
                    )}
                    {comp.estado !== 'CUMPLIDO' && (
                      <button
                        type="button"
                        onClick={() => onPrepararNotaPedidoDesde([comp.id])}
                        className="px-2.5 py-1 rounded-lg bg-rose-600/20 hover:bg-rose-600/35 border border-rose-500/40 text-rose-200 text-[11px] font-bold cursor-pointer"
                      >
                        Nota de Pedido
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onEliminarCompromiso(comp.id)}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 cursor-pointer"
                      title="Eliminar compromiso"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Tabla completa en escritorio (>=768px) */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/60 text-[11px] font-semibold text-slate-400">
                  <th className="py-3 px-3 w-8"></th>
                  <th className="py-3 px-3">Minuta · Ítem</th>
                  <th className="py-3 px-3">Compromiso Establecido</th>
                  <th className="py-3 px-3">Responsable · Frente</th>
                  <th className="py-3 px-3 whitespace-nowrap">Fecha Límite</th>
                  <th className="py-3 px-3 whitespace-nowrap">Estado</th>
                  <th className="py-3 px-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 text-xs">
                {compromisosFiltrados.map(comp => {
                  const esInc = esIncumplidoOVencido(comp, hoyIso);
                  const diasDesvio = calcularDiasDesvio(comp.fechaLimite, hoyIso);
                  const isSel = seleccionados.includes(comp.id);

                  return (
                    <tr
                      key={comp.id}
                      className={`hover:bg-slate-900/70 transition-colors ${
                        isSel ? 'bg-sky-950/20' : ''
                      }`}
                    >
                      <td className="py-3 px-3 align-top">
                        <input
                          type="checkbox"
                          checked={isSel}
                          onChange={() => onToggleSeleccion(comp.id)}
                          className="mt-0.5 rounded border-slate-600 bg-slate-950 text-sky-500 cursor-pointer"
                          aria-label={`Seleccionar compromiso ${comp.numeroItem}`}
                        />
                      </td>
                      <td className="py-3 px-3 align-top whitespace-nowrap">
                        <div className="font-mono font-bold text-sky-400">{comp.minutaCodigo}</div>
                        <div className="text-[11px] text-slate-500 font-mono tabular-nums">
                          {comp.numeroItem} · {comp.minutaFecha}
                        </div>
                      </td>
                      <td className="py-3 px-3 align-top max-w-md">
                        <p className="text-slate-100 leading-relaxed">{comp.descripcion}</p>
                        {((comp.documentosRelacionados && comp.documentosRelacionados.length > 0) ||
                          (comp.notasPedidoIds && comp.notasPedidoIds.length > 0)) && (
                          <div className="text-[11px] text-slate-400 font-mono mt-1 flex flex-wrap items-center gap-x-2">
                            {comp.documentosRelacionados && comp.documentosRelacionados.length > 0 && (
                              <span>Docs: {comp.documentosRelacionados.join(', ')}</span>
                            )}
                            {comp.notasPedidoIds && comp.notasPedidoIds.length > 0 && (
                              <span className="text-rose-300 font-semibold">
                                NP emitidas: {comp.notasPedidoIds.join(', ')}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-3 align-top">
                        <div className="font-semibold text-slate-200">{comp.responsable}</div>
                        <div className="text-[11px] text-slate-400">{comp.frente}</div>
                      </td>
                      <td className="py-3 px-3 align-top font-mono tabular-nums whitespace-nowrap">
                        <div className={esInc ? 'text-rose-300 font-bold' : 'text-slate-200'}>
                          {comp.fechaLimite}
                        </div>
                        {comp.estado !== 'CUMPLIDO' && diasDesvio > 0 && (
                          <div className="text-[11px] text-rose-400">
                            {diasDesvio} d de mora
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-3 align-top whitespace-nowrap">
                        {comp.estado === 'CUMPLIDO' ? (
                          <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Cumplido</span>
                          </span>
                        ) : esInc ? (
                          <span className="inline-flex items-center gap-1 text-rose-400 font-semibold">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            <span>Incumplido</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-amber-300 font-semibold">
                            <Clock className="w-3.5 h-3.5" />
                            <span>{comp.estado === 'EN_CURSO' ? 'En curso' : 'Pendiente'}</span>
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 align-top text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          {comp.estado !== 'CUMPLIDO' ? (
                            <button
                              type="button"
                              onClick={() => onActualizarCompromiso(comp.id, { estado: 'CUMPLIDO' })}
                              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-emerald-600/20 border border-slate-700 text-emerald-300 text-[11px] font-semibold cursor-pointer"
                              title="Marcar compromiso como cumplido"
                            >
                              Cumplir
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => onActualizarCompromiso(comp.id, { estado: 'INCUMPLIDO' })}
                              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-rose-600/20 border border-slate-700 text-slate-300 text-[11px] font-semibold cursor-pointer"
                            >
                              Reabrir
                            </button>
                          )}
                          {comp.estado !== 'CUMPLIDO' && (
                            <button
                              type="button"
                              onClick={() => onPrepararNotaPedidoDesde([comp.id])}
                              className="px-2.5 py-1 rounded-lg bg-rose-600/20 hover:bg-rose-600/35 border border-rose-500/40 text-rose-200 text-[11px] font-bold cursor-pointer"
                            >
                              Nota de Pedido
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => onEliminarCompromiso(comp.id)}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 cursor-pointer"
                            title="Eliminar compromiso"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
