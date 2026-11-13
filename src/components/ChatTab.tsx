import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { MarkdownRenderer } from './MarkdownRenderer';
import { descargarMarkdownComoWord } from '../utils/exportWord';
import {
  Send,
  Trash2,
  Bot,
  BookOpen,
  Check,
  Copy,
  FileText,
  PlusCircle,
  FileDown,
  FileDiff,
} from 'lucide-react';

export const ChatTab: React.FC = () => {
  const {
    chatMessages,
    sendChatMessage,
    clearChat,
    pliegosReales,
    planoCompararA,
    planoCompararB,
    planos,
    hitos,
    interferencias,
    setIsPliegosModalOpen,
    setActiveTab,
  } = useApp();

  const [inputText, setInputText] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = messagesContainerRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [chatMessages]);

  const handleSend = (textToSend?: string) => {
    const txt = (textToSend || inputText).trim();
    if (!txt) return;
    setInputText('');
    sendChatMessage(txt);
  };

  const copyToClipboard = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const totalPlanosComparador = [planoCompararA, planoCompararB].filter(Boolean).length;

  return (
    <div className="flex flex-col space-y-4">
      {/* Cabecera e indicadores de documentación conectada */}
      <div className="bento-card p-4 flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400 shadow-sm shrink-0">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-white">
                Asistente Integral IA & Cuadros Comparativos (132 kV)
              </h4>
              <p className="text-[11px] text-slate-400 mt-0.5 font-mono tabular-nums">
                <span className={pliegosReales.length > 0 ? 'text-emerald-400 font-semibold' : 'text-amber-300'}>
                  {pliegosReales.length} pliego(s)
                </span>
                {' · '}
                <span className={totalPlanosComparador > 0 ? 'text-sky-300 font-semibold' : 'text-slate-400'}>
                  {totalPlanosComparador} plano(s) PDF en comparador
                </span>
                {' · '}
                <span>{planos.length} planos catálogo</span>
                {' · '}
                <span>{hitos.length} hitos</span>
                {' · '}
                <span>{interferencias.length} cruces</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <button
              onClick={() => setActiveTab('comparador')}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-sky-300 text-xs font-semibold border border-slate-700/80 flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <FileDiff className="w-3.5 h-3.5" />
              <span>Comparador PDF</span>
            </button>
            <button
              onClick={() => setIsPliegosModalOpen(true)}
              className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold shadow-md shadow-sky-600/20 flex items-center gap-1.5 cursor-pointer transition-all active:scale-95"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>{pliegosReales.length > 0 ? 'Pliegos' : 'Cargar Pliego Real'}</span>
            </button>
            <button
              onClick={clearChat}
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700/80 flex items-center gap-1 cursor-pointer transition-colors"
              title="Limpiar chat"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Limpiar</span>
            </button>
          </div>
        </div>

        {/* Lista compacta de documentos indexados y atajos comparativos */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 text-xs text-slate-300 space-y-2.5">
          {pliegosReales.length > 0 ? (
            <div className="text-[11px] text-slate-300 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-bold text-sky-400 flex items-center gap-1.5 shrink-0">
                <BookOpen className="w-3.5 h-3.5" />
                Pliegos indexados:
              </span>
              {pliegosReales.map((p, idx) => (
                <span key={p.id} className="text-slate-200 font-mono text-[10px]">
                  {idx > 0 ? '· ' : ''}
                  {p.nombre}{' '}
                  <span className="text-slate-500">
                    ({p.paginas ? `${p.paginas}p ` : ''}{p.tamanioTexto})
                  </span>
                </span>
              ))}
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-amber-200">
              <span>
                Sin pliegos cargados todavía. Puedes consultar hitos, cruces o catálogo, o subir tus pliegos reales para auditar especificaciones.
              </span>
              <button
                onClick={() => setIsPliegosModalOpen(true)}
                className="text-amber-300 font-bold underline shrink-0 cursor-pointer text-left"
              >
                Subir Pliegos Reales
              </button>
            </div>
          )}

          {/* Atajos para cuadros comparativos y auditoría */}
          <div className="pt-2 border-t border-slate-800/80 flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] font-bold text-slate-400 mr-1">Atajos comparativos:</span>
            <button
              onClick={() =>
                handleSend(
                  'Genera un cuadro comparativo en tabla Markdown contrastando las especificaciones técnicas principales entre todos los tomos/pliegos cargados (alcance, normas, tolerancias, ensayos y plazos).'
                )
              }
              className="px-2.5 py-1 bg-slate-800 hover:bg-sky-600/30 border border-slate-700/70 rounded-lg text-[10px] text-slate-200 cursor-pointer transition-colors"
            >
              Cuadro Comparativo entre Pliegos
            </button>
            <button
              onClick={() =>
                handleSend(
                  'Genera una tabla comparativa con las discrepancias entre los Planos PDF cargados en el comparador y los Pliegos Reales, indicando parámetro, valor en plano, exigencia del pliego y estado.'
                )
              }
              className="px-2.5 py-1 bg-slate-800 hover:bg-sky-600/30 border border-slate-700/70 rounded-lg text-[10px] text-slate-200 cursor-pointer transition-colors"
            >
              Discrepancias Planos PDF vs. Pliego
            </button>
            <button
              onClick={() =>
                handleSend(
                  'Arma una matriz comparativa del estado actual de Hitos Contractuales e Interferencias/Cruces de la obra, identificando retrasos, faltantes y planes APC pendientes.'
                )
              }
              className="px-2.5 py-1 bg-slate-800 hover:bg-sky-600/30 border border-slate-700/70 rounded-lg text-[10px] text-slate-200 cursor-pointer transition-colors"
            >
              Matriz Hitos y Cruces de Obra
            </button>
            <button
              onClick={() =>
                handleSend(
                  'Extrae en una tabla todas las tolerancias numéricas, ensayos exigidos (hormigón, acero, PAT, aislación) y criterios de aceptación de los pliegos.'
                )
              }
              className="px-2.5 py-1 bg-slate-800 hover:bg-sky-600/30 border border-slate-700/70 rounded-lg text-[10px] text-slate-200 cursor-pointer transition-colors"
            >
              Tabla de Tolerancias y Ensayos
            </button>
          </div>
        </div>
      </div>

      {/* Historial de Mensajes */}
      <div
        ref={messagesContainerRef}
        className="bento-card p-4 space-y-4 min-h-[420px] max-h-[600px] overflow-y-auto scroll-smooth"
      >
        {chatMessages.map(msg => (
          <div
            key={msg.id}
            className={`flex flex-col ${msg.esUsuario ? 'items-end' : 'items-start'} w-full group`}
          >
            <div
              className={`p-4 rounded-2xl text-xs leading-relaxed shadow-sm relative ${
                msg.esUsuario
                  ? 'bg-sky-600 text-white rounded-br-xs max-w-2xl'
                  : 'bg-slate-950 border border-slate-800/90 text-slate-200 rounded-bl-xs w-full max-w-4xl'
              }`}
            >
              {!msg.esUsuario && (
                <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2.5 gap-2">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-sky-400">
                    <FileText className="w-3.5 h-3.5" />
                    <span>Análisis Técnico & Cuadros Comparativos</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() =>
                        descargarMarkdownComoWord(
                          `Analisis_132kV_${msg.id}`,
                          'Informe Comparativo de Ingeniería 132 kV',
                          msg.texto
                        )
                      }
                      className="px-2 py-1 rounded hover:bg-slate-800 text-emerald-300 hover:text-emerald-200 text-[10px] flex items-center gap-1 cursor-pointer transition-colors"
                      title="Descargar respuesta en Word (.doc)"
                    >
                      <FileDown className="w-3 h-3" />
                      <span>Word</span>
                    </button>
                    <button
                      onClick={() => copyToClipboard(msg.id, msg.texto)}
                      className="px-2 py-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 text-[10px] flex items-center gap-1 cursor-pointer transition-colors"
                      title="Copiar contenido"
                    >
                      {copiedId === msg.id ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span className="text-emerald-400">Copiado</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Copiar</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {msg.esUsuario ? (
                <div className="whitespace-pre-line font-sans">{msg.texto}</div>
              ) : (
                <MarkdownRenderer content={msg.texto} />
              )}

              {msg.fecha && (
                <div
                  className={`text-[9px] mt-2 text-right font-mono ${
                    msg.esUsuario ? 'text-sky-200' : 'text-slate-500'
                  }`}
                >
                  {msg.fecha}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Barra de Entrada */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <input
            type="text"
            id="txtChatInput"
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Pide un cuadro comparativo, discrepancias entre planos PDF y pliegos, hitos vencidos o artículos..."
            className="w-full bg-slate-900 border border-slate-700/80 rounded-xl pl-4 pr-4 py-3.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 font-sans shadow-inner"
          />
        </div>
        <button
          onClick={() => handleSend()}
          className="h-12 px-6 bg-sky-600 hover:bg-sky-500 text-white rounded-xl flex items-center justify-center font-bold text-xs shadow-lg active:scale-95 transition-all gap-1.5 cursor-pointer shrink-0"
        >
          <Send className="w-4 h-4" />
          <span>Consultar IA</span>
        </button>
      </div>
    </div>
  );
};

