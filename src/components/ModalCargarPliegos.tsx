import React, { useState, useRef } from 'react';
import { useApp, SubidaProgresoInfo } from '../context/AppContext';
import { 
  X, 
  Upload, 
  FileText, 
  Trash2, 
  AlertCircle, 
  BookOpen, 
  Plus, 
  Eye, 
  FileUp,
  FileCode,
  Zap,
  Loader2,
  ScanText
} from 'lucide-react';
import { PliegoReal } from '../types';

interface ModalCargarPliegosProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ModalCargarPliegos: React.FC<ModalCargarPliegosProps> = ({ isOpen, onClose }) => {
  const { 
    pliegosReales, 
    subirArchivoPliegoReal, 
    agregarPliegoReal, 
    eliminarPliegoReal, 
    limpiarTodosPliegosReales 
  } = useApp();
  const [activeTab, setActiveTab] = useState<'archivo' | 'pegar'>('archivo');
  
  // Estado para subida e indexación rápida
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [mensajeEstado, setMensajeEstado] = useState<string | null>(null);
  const [progresoUpload, setProgresoUpload] = useState<SubidaProgresoInfo | null>(null);
  const [confirmandoLimpiar, setConfirmandoLimpiar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Estado para texto pegado
  const [tituloManual, setTituloManual] = useState('');
  const [textoManual, setTextoManual] = useState('');

  // Estado para previsualización
  const [pliegoVisualizando, setPliegoVisualizando] = useState<PliegoReal | null>(null);

  if (!isOpen) return null;

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const procesarArchivos = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    if (files.length === 0) return;

    setIsProcessing(true);
    setConfirmandoLimpiar(false);
    setProgresoUpload(null);
    const tInicio = performance.now();
    let subidosOk = 0;

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const prefijo = files.length > 1 ? `[${i + 1}/${files.length}] ` : '';
        setMensajeEstado(
          `${prefijo}Preparando "${file.name}" (${formatFileSize(file.size)})...`
        );
        await subirArchivoPliegoReal(file, (info) => {
          setProgresoUpload(info);
          setMensajeEstado(`${prefijo}${info.detalle}`);
        });
        subidosOk++;
      }

      const elapsedSec = ((performance.now() - tInicio) / 1000).toFixed(1);
      setProgresoUpload(null);
      setMensajeEstado(
        `✅ ${subidosOk} pliego(s) real(es) indexado(s) en ${elapsedSec}s y listo(s) para consultas instantáneas.`
      );
      setTimeout(() => setMensajeEstado(null), 6000);
    } catch (err: any) {
      setProgresoUpload(null);
      setMensajeEstado(`❌ Error al indexar: ${err?.message || 'Fallo de lectura del archivo'}`);
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await procesarArchivos(e.target.files);
    }
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (isProcessing) return;
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await procesarArchivos(e.dataTransfer.files);
    }
  };

  const handleGuardarTextoManual = async () => {
    if (!tituloManual.trim() || !textoManual.trim()) {
      setMensajeEstado('⚠️ Por favor ingresa un título y el texto del pliego antes de guardar.');
      return;
    }

    setIsProcessing(true);
    const bytes = new Blob([textoManual]).size;

    try {
      const nuevoPliego: PliegoReal = {
        id: 'pliego_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
        nombre: tituloManual.trim(),
        tipoMime: 'text/plain',
        tamanioBytes: bytes,
        tamanioTexto: formatFileSize(bytes),
        fechaSubida: new Date().toLocaleDateString('es-AR', { 
          day: '2-digit', 
          month: '2-digit', 
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        }),
        contenidoTexto: textoManual.trim()
      };

      await agregarPliegoReal(nuevoPliego);
      setTituloManual('');
      setTextoManual('');
      setMensajeEstado('✅ Texto de pliego indexado y disponible para respuestas rápidas.');
      setTimeout(() => setMensajeEstado(null), 4000);
    } catch (err: any) {
      setMensajeEstado(`❌ Error al guardar texto: ${err?.message || 'Fallo interno'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-2.5 sm:p-4">
      <div className="bg-[#0f172a] border border-slate-800 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Cabecera */}
        <div className="p-3 sm:p-4 border-b border-slate-800 flex items-center justify-between gap-2 bg-slate-900/60">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400 shrink-0">
              <BookOpen className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-xs sm:text-sm font-bold text-white truncate">Gestor de Pliegos Reales de Licitación</h3>
              <p className="text-[11px] text-slate-400 truncate">
                Soporta pliegos pesados (250 MB+) mediante subida por partes e indexación única
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Pestañas de Carga */}
        <div className="flex border-b border-slate-800 px-2.5 sm:px-4 bg-slate-950 overflow-x-auto flex-nowrap no-scrollbar">
          <button
            onClick={() => setActiveTab('archivo')}
            className={`py-2.5 sm:py-3 px-3 sm:px-4 text-xs font-bold border-b-2 transition-colors cursor-pointer flex items-center gap-2 whitespace-nowrap shrink-0 ${
              activeTab === 'archivo'
                ? 'border-sky-500 text-sky-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Upload className="w-4 h-4 shrink-0" />
            <span>Subir Archivo (PDF / Word / TXT)</span>
          </button>
          <button
            onClick={() => setActiveTab('pegar')}
            className={`py-2.5 sm:py-3 px-3 sm:px-4 text-xs font-bold border-b-2 transition-colors cursor-pointer flex items-center gap-2 whitespace-nowrap shrink-0 ${
              activeTab === 'pegar'
                ? 'border-sky-500 text-sky-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileCode className="w-4 h-4 shrink-0" />
            <span>Pegar Texto o Artículos Directamente</span>
          </button>
        </div>

        {/* Contenido Principal con Scroll */}
        <div className="p-3 sm:p-4 overflow-y-auto space-y-3 sm:space-y-4 flex-1">
          {mensajeEstado && (
            <div className="p-3 rounded-xl bg-sky-950/60 border border-sky-500/30 text-xs text-sky-200 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {isProcessing && <Loader2 className="w-4 h-4 animate-spin text-sky-400 shrink-0" />}
                  <span className="truncate">{mensajeEstado}</span>
                </div>
                {!isProcessing && (
                  <button onClick={() => setMensajeEstado(null)} className="text-slate-400 hover:text-white cursor-pointer shrink-0">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              {isProcessing && progresoUpload && (
                <div className="space-y-1">
                  <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                    <div
                      className={`h-full transition-all duration-200 ${
                        progresoUpload.fase === 'subiendo' ? 'bg-sky-500' : 'bg-emerald-500'
                      }`}
                      style={{ width: `${Math.max(4, Math.min(100, progresoUpload.porcentaje))}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-slate-400">
                    <span>
                      {progresoUpload.fase === 'subiendo'
                        ? 'Fase 1/2: Transfiriendo partes seguras (4 MB c/u)'
                        : 'Fase 2/2: Extrayendo texto e indexando páginas'}
                    </span>
                    <span className="font-mono font-bold text-sky-300">{progresoUpload.porcentaje}%</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'archivo' ? (
            <div className="space-y-3">
              {/* Dropzone */}
              <div 
                onClick={() => !isProcessing && fileInputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (!isProcessing) setIsDragging(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsDragging(false);
                }}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-2xl p-4 sm:p-6 text-center transition-all flex flex-col items-center justify-center space-y-2.5 ${
                  isProcessing
                    ? 'border-sky-500/50 bg-sky-950/20 cursor-wait opacity-80'
                    : isDragging
                      ? 'border-sky-400 bg-sky-500/10 cursor-copy'
                      : 'border-slate-700 hover:border-sky-500/70 bg-slate-900/40 hover:bg-slate-900/80 cursor-pointer'
                }`}
              >
                <div className="w-12 h-12 rounded-full bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
                  {isProcessing ? <Loader2 className="w-6 h-6 animate-spin" /> : <FileUp className="w-6 h-6" />}
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white">
                    {isProcessing
                      ? 'Subiendo e indexando pliego...'
                      : 'Haz clic o arrastra aquí tus pliegos reales'}
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Formatos soportados: <strong>PDF (incluidos pliegos pesados de 250 MB+)</strong>, <strong>Word (.docx)</strong>, TXT, MD o CSV
                  </p>
                </div>
                <span className="px-3 py-1 rounded-full text-[10px] font-semibold bg-sky-500/10 text-sky-300 border border-sky-500/20 flex items-center gap-1.5">
                  <Zap className="w-3 h-3" />
                  <span>Transferencia fragmentada • Consultas instantáneas</span>
                </span>
                <input 
                  type="file" 
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  multiple 
                  disabled={isProcessing}
                  accept=".pdf,.txt,.docx,.md,.csv" 
                  className="hidden" 
                />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Nombre del Pliego / Documento:
                </label>
                <input 
                  type="text" 
                  value={tituloManual}
                  onChange={e => setTituloManual(e.target.value)}
                  placeholder="Ej: Pliego de Bases y Condiciones Particulares - Sección 4 (Tolerancias y Ensayos)"
                  className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Texto del Pliego o Artículos a Cargar:
                </label>
                <textarea 
                  rows={6}
                  value={textoManual}
                  onChange={e => setTextoManual(e.target.value)}
                  placeholder="Pega aquí el contenido del pliego, artículos, tolerancias numéricas o especificaciones..."
                  className="w-full bg-slate-900 border border-slate-700/80 rounded-xl p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 font-mono"
                />
              </div>
              <button
                onClick={handleGuardarTextoManual}
                disabled={isProcessing}
                className="w-full py-2.5 bg-sky-600 hover:bg-sky-500 disabled:bg-slate-800 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 cursor-pointer transition-colors shadow-md"
              >
                <Plus className="w-4 h-4" />
                <span>Incorporar este Pliego a la Memoria del Sistema</span>
              </button>
            </div>
          )}

          {/* Listado de Pliegos Reales Cargados */}
          <div className="pt-3 border-t border-slate-800">
            <div className="flex items-center justify-between mb-2.5 gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <h4 className="text-xs font-bold text-slate-200">
                  Pliegos Reales en el Sistema ({pliegosReales.length})
                </h4>
                {pliegosReales.length > 0 && (
                  <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                    Indexados y Listos
                  </span>
                )}
              </div>
              {pliegosReales.length > 0 && (
                confirmandoLimpiar ? (
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-rose-300">¿Eliminar todos?</span>
                    <button
                      onClick={() => {
                        limpiarTodosPliegosReales();
                        setConfirmandoLimpiar(false);
                      }}
                      className="px-2 py-0.5 rounded bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-bold cursor-pointer"
                    >
                      Sí, eliminar
                    </button>
                    <button
                      onClick={() => setConfirmandoLimpiar(false)}
                      className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] cursor-pointer"
                    >
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmandoLimpiar(true)}
                    className="text-[11px] text-rose-400 hover:text-rose-300 flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Eliminar todos</span>
                  </button>
                )
              )}
            </div>

            {pliegosReales.length === 0 ? (
              <div className="text-center py-6 border border-slate-800/80 rounded-xl bg-slate-900/30">
                <AlertCircle className="w-8 h-8 text-amber-400/80 mx-auto mb-2" />
                <p className="text-xs font-semibold text-slate-300">Aún no has cargado pliegos reales</p>
                <p className="text-[11px] text-slate-500 max-w-md mx-auto mt-1">
                  Usa el selector arriba para subir tus PDFs, Word o pegar el texto. Ningún ejemplo ficticio está activo: la IA responderá exclusivamente sobre los documentos reales que tú cargues.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {pliegosReales.map(pliego => (
                  <div 
                    key={pliego.id}
                    className="p-2.5 sm:p-3 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-2 sm:gap-3 hover:border-slate-700 transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <div className="w-8 h-8 rounded-lg bg-sky-500/10 text-sky-400 flex items-center justify-center shrink-0">
                        <FileText className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                          <h5 className="text-xs font-bold text-white truncate max-w-full">{pliego.nombre}</h5>
                          {pliego.esEscaneado ? (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/20 flex items-center gap-1">
                              <ScanText className="w-2.5 h-2.5" />
                              PDF Escaneado (Visión IA)
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                              <Zap className="w-2.5 h-2.5" />
                              Texto Indexado
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          {pliego.tamanioTexto}
                          {pliego.paginas ? ` • ${pliego.paginas} pág(s)` : ''}
                          {typeof pliego.tiempoProcesoMs === 'number' ? ` • Indexado en ${pliego.tiempoProcesoMs} ms` : ''}
                          {` • ${pliego.fechaSubida}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {(pliego.contenidoTexto || pliego.esEscaneado) && (
                        <button
                          onClick={() => setPliegoVisualizando(pliego)}
                          className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
                          title="Ver vista previa del pliego"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => eliminarPliegoReal(pliego.id)}
                        className="p-1.5 rounded-lg hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
                        title="Eliminar este pliego"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Modal interno para previsualizar texto de pliego */}
        {pliegoVisualizando && (
          <div className="fixed inset-0 z-60 bg-black/80 flex items-center justify-center p-2.5 sm:p-4">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col p-3 sm:p-4 shadow-2xl">
              <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-800">
                <div className="min-w-0 flex-1">
                  <h4 className="text-xs font-bold text-white truncate">
                    Contenido: {pliegoVisualizando.nombre}
                  </h4>
                  {pliegoVisualizando.paginas && (
                    <span className="text-[10px] text-slate-400">
                      {pliegoVisualizando.paginas} página(s) • {pliegoVisualizando.caracteresTexto?.toLocaleString('es-AR') || 0} caracteres indexados
                    </span>
                  )}
                </div>
                <button 
                  onClick={() => setPliegoVisualizando(null)}
                  className="text-slate-400 hover:text-white cursor-pointer shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto my-3 text-xs text-slate-300 whitespace-pre-wrap font-mono p-3 bg-slate-950 rounded-xl border border-slate-800">
                {pliegoVisualizando.esEscaneado && !pliegoVisualizando.contenidoTexto
                  ? 'Este PDF contiene páginas escaneadas como imagen (sin texto seleccionable). Fue cacheado en Gemini Files API para lectura multimodal directa sin re-subir el archivo en cada pregunta.'
                  : (pliegoVisualizando.contenidoTexto || 'Sin vista previa disponible.')}
              </div>
              <button
                onClick={() => setPliegoVisualizando(null)}
                className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold cursor-pointer"
              >
                Cerrar Previsualización
              </button>
            </div>
          </div>
        )}

        {/* Pie */}
        <div className="p-3 border-t border-slate-800 bg-slate-950 flex flex-wrap items-center justify-between gap-2">
          <span className="text-[11px] text-slate-400">
            {pliegosReales.length} pliego(s) real(es) registrado(s)
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-xl text-xs cursor-pointer transition-colors shadow-md whitespace-nowrap"
          >
            Listo, ir al Chat IA
          </button>
        </div>

      </div>
    </div>
  );
};
