import React, { useState, useRef, useEffect } from 'react';
import { useApp, SubidaProgresoInfo } from '../context/AppContext';
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
  Paperclip,
  X,
  Loader2,
  AlertTriangle,
  FileCheck2,
} from 'lucide-react';

export const ChatTab: React.FC = () => {
  const {
    chatMessages,
    sendChatMessage,
    clearChat,
    pliegosReales,
    planoCompararA,
    planoCompararB,
    chatAdjuntos,
    subirAdjuntoChat,
    eliminarAdjuntoChat,
    limpiarAdjuntosChat,
    planos,
    hitos,
    interferencias,
    setIsPliegosModalOpen,
    setActiveTab,
  } = useApp();

  const [inputText, setInputText] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [subiendoPdf, setSubiendoPdf] = useState(false);
  const [progresoPdf, setProgresoPdf] = useState<SubidaProgresoInfo | null>(null);
  const [errorPdf, setErrorPdf] = useState<string | null>(null);
  const [arrastrando, setArrastrando] = useState(false);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);

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

  const procesarArchivosPdf = async (files: FileList | File[]) => {
    const lista = Array.from(files);
    if (lista.length === 0) return;

    setErrorPdf(null);
    setSubiendoPdf(true);
    try {
      for (const file of lista) {
        await subirAdjuntoChat(file, info => setProgresoPdf(info));
      }
    } catch (err: any) {
      setErrorPdf(err?.message || 'No se pudo adjuntar el documento PDF.');
    } finally {
      setSubiendoPdf(false);
      setProgresoPdf(null);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      await procesarArchivosPdf(files);
    }
    e.target.value = '';
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setArrastrando(false);
    if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
      await procesarArchivosPdf(e.dataTransfer.files);
    }
  };

  const auditarDiscrepanciasAdjuntosVsPliego = () => {
    if (chatAdjuntos.length === 0) return;
    const nombres = chatAdjuntos.map(a => a.nombre).join(', ');
    handleSend(
      `Audita en detalle el/los documento(s) PDF adjunto(s) (${nombres}) frente a todos los Pliegos Reales indexados. ` +
        `Identifica cada observación, exigencia o devolución de archivos (ej. Orden de Servicio de TRANSNOA) y entrega una tabla Markdown de Discrepancias y Cumplimiento con columnas: ` +
        `| Punto / Observación del PDF Adjunto | Exigencia / Criterio del Documento | Lo que establece el Pliego (Tomo / Art. / Pág.) | Dictamen (Discrepancia / Cumple / Sin Respaldo Contractual) | Acción Recomendada |.`
    );
  };

  const copyToClipboard = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const totalPlanosComparador = [planoCompararA, planoCompararB].filter(Boolean).length;

  return (
    <div
      className={`flex flex-col space-y-4 transition-colors ${
        arrastrando ? 'ring-2 ring-sky-500/60 rounded-2xl' : ''
      }`}
      onDragOver={e => {
        e.preventDefault();
        setArrastrando(true);
      }}
      onDragLeave={() => setArrastrando(false)}
      onDrop={handleDrop}
    >
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
                <span className={chatAdjuntos.length > 0 ? 'text-sky-300 font-semibold' : 'text-slate-400'}>
                  {chatAdjuntos.length} PDF adjunto(s) en chat
                </span>
                {' · '}
                <span className={totalPlanosComparador > 0 ? 'text-sky-300 font-semibold' : 'text-slate-400'}>
                  {totalPlanosComparador} plano(s) en comparador
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
              type="button"
              onClick={() => pdfInputRef.current?.click()}
              disabled={subiendoPdf}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap shrink-0"
            >
              {subiendoPdf ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Paperclip className="w-3.5 h-3.5" />
              )}
              <span>Adjuntar PDF</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('comparador')}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-sky-300 text-xs font-semibold border border-slate-700/80 flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap shrink-0"
            >
              <FileDiff className="w-3.5 h-3.5" />
              <span>Comparador PDF</span>
            </button>
            <button
              type="button"
              onClick={() => setIsPliegosModalOpen(true)}
              className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold shadow-md shadow-sky-600/20 flex items-center gap-1.5 cursor-pointer transition-all active:scale-95 whitespace-nowrap shrink-0"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>{pliegosReales.length > 0 ? 'Pliegos' : 'Cargar Pliego Real'}</span>
            </button>
            <button
              type="button"
              onClick={clearChat}
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700/80 flex items-center gap-1 cursor-pointer transition-colors whitespace-nowrap shrink-0"
              title="Limpiar chat"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Limpiar</span>
            </button>
          </div>
        </div>

        {/* Lista compacta de pliegos indexados, PDFs adjuntos y atajos comparativos */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 text-xs text-slate-300 space-y-2.5">
          {pliegosReales.length > 0 ? (
            <div className="text-[11px] text-slate-300 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-bold text-sky-400 flex items-center gap-1.5 shrink-0">
                <BookOpen className="w-3.5 h-3.5" />
                Pliegos indexados:
              </span>
              {pliegosReales.map((p, idx) => (
                <span key={p.id} className="text-slate-200 font-mono text-[10px] tabular-nums">
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
                Sin pliegos cargados todavía. Sube tus pliegos reales para poder contrastar órdenes de servicio, devoluciones o notas adjuntas.
              </span>
              <button
                type="button"
                onClick={() => setIsPliegosModalOpen(true)}
                className="text-amber-300 font-bold underline shrink-0 cursor-pointer text-left"
              >
                Subir Pliegos Reales
              </button>
            </div>
          )}

          {/* Documentos PDF adjuntos en el Chat IA */}
          {chatAdjuntos.length > 0 && (
            <div className="pt-2 border-t border-slate-800/80 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] font-bold text-emerald-400 flex items-center gap-1.5">
                  <FileCheck2 className="w-3.5 h-3.5" />
                  Documentos PDF adjuntos en esta consulta ({chatAdjuntos.length}):
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={auditarDiscrepanciasAdjuntosVsPliego}
                    className="px-2.5 py-1 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-[11px] font-bold cursor-pointer whitespace-nowrap shrink-0"
                  >
                    Auditar discrepancias vs. Pliego
                  </button>
                  <button
                    type="button"
                    onClick={limpiarAdjuntosChat}
                    className="text-[11px] text-slate-400 hover:text-rose-300 cursor-pointer"
                  >
                    Quitar todos
                  </button>
                </div>
              </div>

              <div className="divide-y divide-slate-800/70 bg-slate-950/70 border border-slate-800 rounded-lg">
                {chatAdjuntos.map(adj => (
                  <div
                    key={adj.id}
                    className="px-3 py-2 flex items-center justify-between gap-3 text-[11px]"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span className="font-semibold text-slate-100 truncate">{adj.nombre}</span>
                      <span className="text-slate-400 font-mono tabular-nums shrink-0">
                        {adj.paginas} pág. · {adj.tamanioTexto}
                        {adj.esEscaneado ? ' · PDF escaneado' : ''}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => eliminarAdjuntoChat(adj.id)}
                      className="p-1 rounded hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 cursor-pointer shrink-0"
                      title={`Quitar ${adj.nombre}`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Barra de progreso de subida PDF */}
          {subiendoPdf && (
            <div className="pt-2 border-t border-slate-800/80 flex items-center gap-2 text-[11px] text-sky-300">
              <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
              <span className="font-mono tabular-nums">
                {progresoPdf?.detalle || 'Indexando documento PDF adjunto...'}
              </span>
            </div>
          )}

          {errorPdf && (
            <div className="pt-2 border-t border-slate-800/80 flex items-center gap-2 text-[11px] text-rose-300">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span>{errorPdf}</span>
            </div>
          )}

          {/* Atajos para cuadros comparativos y auditoría */}
          <div className="pt-2 border-t border-slate-800/80 flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] font-bold text-slate-400 mr-1">Atajos comparativos:</span>
            <button
              type="button"
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
              type="button"
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
              type="button"
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
              type="button"
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
              {msg.esUsuario && msg.adjuntosNombres && msg.adjuntosNombres.length > 0 && (
                <div className="text-[10px] font-mono text-sky-100/90 pb-1.5 mb-1.5 border-b border-sky-400/30 flex items-center gap-1.5">
                  <Paperclip className="w-3 h-3 shrink-0" />
                  <span>PDF adjuntos: {msg.adjuntosNombres.join(', ')}</span>
                </div>
              )}

              {!msg.esUsuario && (
                <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2.5 gap-2">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-sky-400">
                    <FileText className="w-3.5 h-3.5" />
                    <span>Análisis Técnico & Cuadros Comparativos</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
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
                      type="button"
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

      {/* Input oculto para adjuntar PDF/DOCX/TXT directo en el Chat */}
      <input
        ref={pdfInputRef}
        type="file"
        multiple
        accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Barra de Entrada */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => pdfInputRef.current?.click()}
          disabled={subiendoPdf}
          className="h-12 px-3.5 bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-emerald-300 rounded-xl flex items-center justify-center font-semibold text-xs gap-1.5 cursor-pointer shrink-0 transition-colors whitespace-nowrap"
          title="Adjuntar PDF (ej. Orden de Servicio de TRANSNOA / devolución de archivos)"
        >
          {subiendoPdf ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Paperclip className="w-4 h-4" />
          )}
          <span className="hidden sm:inline">Adjuntar PDF</span>
        </button>

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
            placeholder={
              chatAdjuntos.length > 0
                ? 'Pregunta sobre tu PDF adjunto vs. el pliego (ej. ¿Esta Orden de Servicio de TRANSNOA tiene discrepancias con el pliego?)...'
                : 'Adjunta un PDF con el botón de la izquierda o consulta sobre pliegos, hitos y discrepancias...'
            }
            className="w-full bg-slate-900 border border-slate-700/80 rounded-xl pl-4 pr-4 py-3.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 font-sans shadow-inner"
          />
        </div>
        <button
          type="button"
          onClick={() => handleSend()}
          className="h-12 px-6 bg-sky-600 hover:bg-sky-500 text-white rounded-xl flex items-center justify-center font-bold text-xs shadow-lg active:scale-95 transition-all gap-1.5 cursor-pointer shrink-0 whitespace-nowrap"
        >
          <Send className="w-4 h-4" />
          <span>Consultar IA</span>
        </button>
      </div>
    </div>
  );
};


