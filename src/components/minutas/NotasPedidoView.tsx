import React from 'react';
import {
  Check,
  Copy,
  FileDown,
  FileWarning,
  Loader2,
  Printer,
  Send,
  Trash2,
} from 'lucide-react';
import { CompromisoMinuta, NotaPedidoIngenieria } from '../../types';
import { descargarMarkdownComoWord } from '../../utils/exportWord';
import { MarkdownRenderer } from '../MarkdownRenderer';
import { FRENTES_OPCIONES, imprimirMarkdownComoPdf } from './minutasHelpers';

interface NotasPedidoViewProps {
  compromisosMinutas: CompromisoMinuta[];
  notasPedido: NotaPedidoIngenieria[];
  notaVisualizada: NotaPedidoIngenieria | null;
  setNotaActivaId: (id: string | null) => void;
  seleccionados: string[];
  incumplidosCount: number;
  copiedId: string | null;
  npNumero: string;
  setNpNumero: (val: string) => void;
  npFecha: string;
  setNpFecha: (val: string) => void;
  npEmisor: string;
  setNpEmisor: (val: string) => void;
  npDestinatario: string;
  setNpDestinatario: (val: string) => void;
  npFrente: string;
  setNpFrente: (val: string) => void;
  npPlazo: number;
  setNpPlazo: (val: number) => void;
  npAsunto: string;
  setNpAsunto: (val: string) => void;
  npEncuadre: string;
  setNpEncuadre: (val: string) => void;
  generandoNp: boolean;
  onSeleccionarTodosIncumplidos: () => void;
  onToggleSeleccion: (id: string) => void;
  onGenerarNotaPedido: (e: React.FormEvent) => Promise<void>;
  onEliminarNotaPedido: (id: string) => Promise<void>;
  onCopiar: (id: string, texto: string) => void;
}

export const NotasPedidoView: React.FC<NotasPedidoViewProps> = ({
  compromisosMinutas,
  notasPedido,
  notaVisualizada,
  setNotaActivaId,
  seleccionados,
  incumplidosCount,
  copiedId,
  npNumero,
  setNpNumero,
  npFecha,
  setNpFecha,
  npEmisor,
  setNpEmisor,
  npDestinatario,
  setNpDestinatario,
  npFrente,
  setNpFrente,
  npPlazo,
  setNpPlazo,
  npAsunto,
  setNpAsunto,
  npEncuadre,
  setNpEncuadre,
  generandoNp,
  onSeleccionarTodosIncumplidos,
  onToggleSeleccion,
  onGenerarNotaPedido,
  onEliminarNotaPedido,
  onCopiar,
}) => {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
      {/* Columna Generador */}
      <form onSubmit={onGenerarNotaPedido} className="lg:col-span-5 bento-card p-3.5 sm:p-5 space-y-3.5 text-xs">
        <div className="pb-3 border-b border-slate-800">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <FileWarning className="w-4 h-4 text-rose-400" />
            <span>Generar Nota de Pedido a Ingeniería</span>
          </h3>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Emite una intimación formal basada en los compromisos incumplidos seleccionados y los pliegos indexados.
          </p>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-300">
              Compromisos incluidos ({seleccionados.length})
            </span>
            <button
              type="button"
              onClick={onSeleccionarTodosIncumplidos}
              className="text-[11px] text-rose-300 hover:text-rose-200 font-semibold cursor-pointer"
            >
              Cargar incumplidos ({incumplidosCount})
            </button>
          </div>
          <div className="max-h-44 overflow-y-auto divide-y divide-slate-800 bg-slate-950 border border-slate-800 rounded-xl">
            {compromisosMinutas.filter(c => c.estado !== 'CUMPLIDO').length === 0 ? (
              <div className="p-3 text-[11px] text-slate-500">
                No hay compromisos pendientes o incumplidos registrados.
              </div>
            ) : (
              compromisosMinutas
                .filter(c => c.estado !== 'CUMPLIDO')
                .map(c => (
                  <label
                    key={c.id}
                    className="flex items-start gap-2.5 p-2.5 hover:bg-slate-900/70 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={seleccionados.includes(c.id)}
                      onChange={() => onToggleSeleccion(c.id)}
                      className="mt-0.5 rounded border-slate-600 bg-slate-950"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] font-mono text-sky-400">
                        {c.minutaCodigo} · {c.numeroItem} · Vence {c.fechaLimite}
                      </div>
                      <p className="text-[11px] text-slate-200 line-clamp-2">{c.descripcion}</p>
                    </div>
                  </label>
                ))
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-slate-300 mb-1">N° Nota de Pedido</label>
            <input
              type="text"
              value={npNumero}
              onChange={e => setNpNumero(e.target.value)}
              placeholder={`NP-ING-${String(notasPedido.length + 1).padStart(3, '0')}`}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-300 mb-1">Fecha Emisión</label>
            <input
              type="date"
              value={npFecha}
              onChange={e => setNpFecha(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-slate-300 mb-1">Emisor</label>
            <input
              type="text"
              value={npEmisor}
              onChange={e => setNpEmisor(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-300 mb-1">Destinatario (Ingeniería)</label>
            <input
              type="text"
              value={npDestinatario}
              onChange={e => setNpDestinatario(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2">
            <label className="block text-[11px] font-semibold text-slate-300 mb-1">Obra / Frente</label>
            <select
              value={npFrente}
              onChange={e => setNpFrente(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
            >
              {FRENTES_OPCIONES.map(f => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-300 mb-1">Plazo (días)</label>
            <input
              type="number"
              min={1}
              max={60}
              value={npPlazo}
              onChange={e => setNpPlazo(Number(e.target.value) || 5)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono"
            />
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-slate-300 mb-1">Asunto</label>
          <input
            type="text"
            value={npAsunto}
            onChange={e => setNpAsunto(e.target.value)}
            placeholder="Incumplimiento de entrega de documentación comprometida en minuta"
            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
          />
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-slate-300 mb-1">
            Observaciones / Encuadre Contractual (Opcional)
          </label>
          <textarea
            rows={2}
            value={npEncuadre}
            onChange={e => setNpEncuadre(e.target.value)}
            placeholder="Ej: La falta de estos planos bloquea la liberación de fundaciones y el cruce RN 38..."
            className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white placeholder-slate-500"
          />
        </div>

        <button
          type="submit"
          disabled={generandoNp || seleccionados.length === 0}
          className="w-full py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
        >
          {generandoNp ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Redactando Nota de Pedido...</span>
            </>
          ) : (
            <>
              <Send className="w-4 h-4" />
              <span>Emitir Nota de Pedido Formal</span>
            </>
          )}
        </button>
      </form>

      {/* Columna Visor e Historial */}
      <div className="lg:col-span-7 space-y-4">
        {notasPedido.length > 0 && (
          <div className="bento-card p-3 flex items-center gap-2 overflow-x-auto">
            {notasPedido.map(n => (
              <button
                key={n.id}
                type="button"
                onClick={() => setNotaActivaId(n.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono whitespace-nowrap shrink-0 cursor-pointer border transition-colors ${
                  notaVisualizada?.id === n.id
                    ? 'bg-rose-600/20 border-rose-500/50 text-rose-200 font-bold'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {n.numeroNota} · {n.fechaEmision}
              </button>
            ))}
          </div>
        )}

        {notaVisualizada ? (
          <div className="bento-card p-3 sm:p-5 space-y-4 min-w-0 overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800">
              <div className="min-w-0">
                <div className="text-xs font-mono font-bold text-rose-300">
                  {notaVisualizada.numeroNota} · {notaVisualizada.fechaEmision}
                </div>
                <h4 className="text-sm font-bold text-white break-words">{notaVisualizada.asunto}</h4>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => onCopiar(notaVisualizada.id, notaVisualizada.contenidoMarkdown)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-[11px] font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  {copiedId === notaVisualizada.id ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span>{copiedId === notaVisualizada.id ? 'Copiado' : 'Copiar'}</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    descargarMarkdownComoWord(
                      notaVisualizada.numeroNota.replace(/[^a-zA-Z0-9_-]/g, '_'),
                      `${notaVisualizada.numeroNota} - ${notaVisualizada.asunto}`,
                      notaVisualizada.contenidoMarkdown
                    )
                  }
                  className="px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-300 text-[11px] font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <FileDown className="w-3.5 h-3.5" />
                  <span>Word (.doc)</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    imprimirMarkdownComoPdf(notaVisualizada.numeroNota, notaVisualizada.contenidoMarkdown)
                  }
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-sky-300 text-[11px] font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Imprimir / PDF</span>
                </button>
                <button
                  type="button"
                  onClick={() => onEliminarNotaPedido(notaVisualizada.id)}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 cursor-pointer"
                  title="Eliminar Nota de Pedido"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <MarkdownRenderer content={notaVisualizada.contenidoMarkdown} />
          </div>
        ) : (
          <div className="bento-card p-10 text-center space-y-2">
            <FileWarning className="w-8 h-8 text-slate-500 mx-auto" />
            <h4 className="text-sm font-bold text-white">Sin Notas de Pedido emitidas aún</h4>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              Selecciona uno o más compromisos incumplidos a la izquierda, completa destinatario y plazo, y presiona Emitir Nota de Pedido Formal.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
