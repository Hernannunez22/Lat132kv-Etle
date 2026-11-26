import React from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileAudio,
  FileDown,
  Loader2,
  Mic,
  Pause,
  Play,
  Printer,
  Sparkles,
  Square,
} from 'lucide-react';
import { AudioMinutaResultado, SubidaProgresoInfo } from '../../context/AppContext';
import { MinutaReunion } from '../../types';
import { descargarMarkdownComoWord } from '../../utils/exportWord';
import {
  AudioConfigStatus,
  formatearCronometro,
  FRENTES_OPCIONES,
  imprimirMarkdownComoPdf,
} from './minutasHelpers';

interface AudioMinutaStudioProps {
  minutas: MinutaReunion[];
  puedeUsarModelosPagos: boolean;
  audioFileInputRef: React.RefObject<HTMLInputElement | null>;
  audioConfig: AudioConfigStatus | null;
  audioModeloId: string;
  setAudioModeloId: (val: string) => void;
  audioMotor: 'gratuito' | 'gemini';
  setAudioMotor: (val: 'gratuito' | 'gemini') => void;
  audioCodigo: string;
  setAudioCodigo: (val: string) => void;
  audioFecha: string;
  setAudioFecha: (val: string) => void;
  audioFrente: string;
  setAudioFrente: (val: string) => void;
  audioTitulo: string;
  setAudioTitulo: (val: string) => void;
  audioParticipantes: string;
  setAudioParticipantes: (val: string) => void;
  recEstado: 'inactivo' | 'grabando' | 'pausado';
  recSegundos: number;
  recBytesAprox: number;
  procesandoAudio: boolean;
  progresoAudio: SubidaProgresoInfo | null;
  resultadoAudio: AudioMinutaResultado | null;
  setResultadoAudio: (val: AudioMinutaResultado | null) => void;
  borradorEditado: string;
  setBorradorEditado: (val: string) => void;
  verTranscripcionLiteral: boolean;
  setVerTranscripcionLiteral: React.Dispatch<React.SetStateAction<boolean>>;
  guardandoBorradorAudio: boolean;
  handleIniciarGrabacionReunion: () => Promise<void>;
  handlePausarReanudarGrabacion: () => void;
  handleFinalizarGrabacion: () => void;
  handleDescartarGrabacion: () => void;
  handleSubirArchivoAudio: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  handleGuardarBorradorAudioComoMinuta: () => Promise<void>;
}

export const AudioMinutaStudio: React.FC<AudioMinutaStudioProps> = ({
  minutas,
  puedeUsarModelosPagos,
  audioFileInputRef,
  audioConfig,
  audioModeloId,
  setAudioModeloId,
  audioMotor,
  setAudioMotor,
  audioCodigo,
  setAudioCodigo,
  audioFecha,
  setAudioFecha,
  audioFrente,
  setAudioFrente,
  audioTitulo,
  setAudioTitulo,
  audioParticipantes,
  setAudioParticipantes,
  recEstado,
  recSegundos,
  recBytesAprox,
  procesandoAudio,
  progresoAudio,
  resultadoAudio,
  setResultadoAudio,
  borradorEditado,
  setBorradorEditado,
  verTranscripcionLiteral,
  setVerTranscripcionLiteral,
  guardandoBorradorAudio,
  handleIniciarGrabacionReunion,
  handlePausarReanudarGrabacion,
  handleFinalizarGrabacion,
  handleDescartarGrabacion,
  handleSubirArchivoAudio,
  handleGuardarBorradorAudioComoMinuta,
}) => {
  return (
    <div className="bento-card p-3.5 sm:p-5 space-y-4 border-sky-500/40">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-xs sm:text-sm font-bold text-white flex items-center gap-2">
              <Mic className="w-4 h-4 text-sky-400" />
              <span>Grabar Reunión o Subir Audio (Groq Whisper + Minuta Automática)</span>
            </h3>
            {audioConfig && (
              <span
                className={`text-[11px] font-mono px-2 py-0.5 rounded border ${
                  audioConfig.groqConfigurado
                    ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                    : 'bg-amber-950/40 border-amber-500/40 text-amber-300'
                }`}
              >
                {audioConfig.groqConfigurado
                  ? `Groq Whisper Listo (${audioConfig.groqVistaSegura || 'activo'})`
                  : 'Falta GROQ_API_KEY en Secrets'}
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-400">
            Soporta grabaciones en vivo y archivos de hasta 2+ horas (.mp3, .m4a, .wav, .webm, .ogg, .mp4). El servidor divide el audio en tramos de 15 min (&lt;25 MB) para transcribirlo gratis con Groq Whisper y redactar la minuta siguiendo el modelo elegido.
          </p>
        </div>
      </div>

      {/* Configuración de modelo y metadatos */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
        <div>
          <label className="block text-[11px] font-semibold text-slate-300 mb-1">
            Minuta modelo (estructura a imitar)
          </label>
          <select
            value={audioModeloId}
            onChange={e => setAudioModeloId(e.target.value)}
            disabled={procesandoAudio}
            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-sky-500"
          >
            <option value="">
              {minutas.length > 0
                ? `Automático: ${minutas[0].codigo} (${minutas[0].titulo.slice(0, 32)})`
                : 'Plantilla estándar de Obra 132 kV'}
            </option>
            {minutas.map(m => (
              <option key={m.id} value={m.id}>
                {m.codigo} · {m.titulo.slice(0, 48)}
              </option>
            ))}
            <option value="__NINGUNO__">Plantilla estándar de Obra 132 kV</option>
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-slate-300 mb-1">
            Motor de redacción de minuta
          </label>
          <select
            value={puedeUsarModelosPagos ? audioMotor : 'gratuito'}
            onChange={e =>
              setAudioMotor(puedeUsarModelosPagos && e.target.value === 'gemini' ? 'gemini' : 'gratuito')
            }
            disabled={procesandoAudio || !puedeUsarModelosPagos}
            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:opacity-80"
          >
            <option value="gratuito">
              Gratuito $0 · Groq Whisper + OpenRouter (:free)
            </option>
            {puedeUsarModelosPagos && (
              <option value="gemini">Groq Whisper + Gemini</option>
            )}
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-slate-300 mb-1">
            Frente de Obra
          </label>
          <select
            value={audioFrente}
            onChange={e => setAudioFrente(e.target.value)}
            disabled={procesandoAudio}
            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-sky-500"
          >
            {FRENTES_OPCIONES.map(f => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-slate-300 mb-1">
            Código Minuta (opcional)
          </label>
          <input
            type="text"
            value={audioCodigo}
            onChange={e => setAudioCodigo(e.target.value)}
            placeholder="Ej: MIN-ING-025"
            disabled={procesandoAudio}
            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-slate-300 mb-1">
            Fecha de Reunión
          </label>
          <input
            type="date"
            value={audioFecha}
            onChange={e => setAudioFecha(e.target.value)}
            disabled={procesandoAudio}
            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-slate-300 mb-1">
            Tema / Título (opcional)
          </label>
          <input
            type="text"
            value={audioTitulo}
            onChange={e => setAudioTitulo(e.target.value)}
            placeholder="Ej: Reunión Semanal Ingeniería 132 kV"
            disabled={procesandoAudio}
            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
        </div>
      </div>

      <div>
        <label className="block text-[11px] font-semibold text-slate-300 mb-1">
          Participantes / Áreas presentes
        </label>
        <input
          type="text"
          value={audioParticipantes}
          onChange={e => setAudioParticipantes(e.target.value)}
          disabled={procesandoAudio}
          className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-sky-500"
        />
      </div>

      {/* Controles de Grabación en Vivo y Subida de Archivo */}
      <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          {recEstado === 'inactivo' ? (
            <button
              type="button"
              onClick={handleIniciarGrabacionReunion}
              disabled={procesandoAudio}
              className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer"
            >
              <Mic className="w-4 h-4" />
              <span>Grabar Reunión en Vivo</span>
            </button>
          ) : (
            <>
              <div className="px-3 py-2 rounded-xl bg-rose-950/50 border border-rose-500/40 flex items-center gap-2 font-mono text-xs text-rose-200">
                <span
                  className={`w-2.5 h-2.5 rounded-full ${
                    recEstado === 'grabando' ? 'bg-rose-500 animate-pulse' : 'bg-amber-400'
                  }`}
                />
                <span className="font-bold">{formatearCronometro(recSegundos)}</span>
                <span className="text-[11px] text-slate-400">
                  ({(recBytesAprox / (1024 * 1024)).toFixed(1)} MB)
                </span>
              </div>
              <button
                type="button"
                onClick={handlePausarReanudarGrabacion}
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                {recEstado === 'grabando' ? (
                  <>
                    <Pause className="w-3.5 h-3.5" />
                    <span>Pausar</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5" />
                    <span>Reanudar</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={handleFinalizarGrabacion}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>Finalizar y Armar Minuta</span>
              </button>
              <button
                type="button"
                onClick={handleDescartarGrabacion}
                className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-rose-950/40 border border-slate-800 text-slate-400 hover:text-rose-300 text-xs cursor-pointer"
              >
                Descartar
              </button>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          <input
            ref={audioFileInputRef}
            type="file"
            accept=".mp3,.m4a,.wav,.webm,.ogg,.mp4,.aac,.flac,audio/*"
            onChange={handleSubirArchivoAudio}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => audioFileInputRef.current?.click()}
            disabled={procesandoAudio || recEstado !== 'inactivo'}
            className="px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
          >
            <FileAudio className="w-4 h-4" />
            <span>Subir Audio (.mp3, .m4a, .wav, .webm)</span>
          </button>
        </div>
      </div>

      {/* Barra de progreso de subida / segmentación / transcripción */}
      {procesandoAudio && progresoAudio && (
        <div className="p-3.5 rounded-xl bg-slate-950 border border-sky-500/30 space-y-2">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="text-sky-300 font-semibold flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>{progresoAudio.detalle}</span>
            </span>
            <span className="font-mono text-slate-300 tabular-nums">
              {progresoAudio.porcentaje}%
            </span>
          </div>
          <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
            <div
              className="h-full bg-sky-500 transition-all duration-300"
              style={{ width: `${Math.min(100, Math.max(4, progresoAudio.porcentaje))}%` }}
            />
          </div>
        </div>
      )}

      {/* Revisión y Guardado de la Minuta generada */}
      {resultadoAudio && !procesandoAudio && (
        <div className="space-y-3 pt-3 border-t border-slate-800">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
            <div className="flex flex-wrap items-center gap-2 text-slate-300 font-mono">
              <span className="text-emerald-400 font-bold inline-flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5" />
                Borrador generado
              </span>
              <span aria-hidden="true">·</span>
              <span>{resultadoAudio.segmentosProcesados} tramo(s)</span>
              <span aria-hidden="true">·</span>
              <span>{resultadoAudio.modeloTranscripcion}</span>
              <span aria-hidden="true">·</span>
              <span>{resultadoAudio.fuenteRedaccion}</span>
              {resultadoAudio.modeloReferenciaUsado && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-sky-300">
                    Modelo: {resultadoAudio.modeloReferenciaUsado}
                  </span>
                </>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  descargarMarkdownComoWord(
                    (audioCodigo || 'Minuta_Audio').replace(/[^a-zA-Z0-9_-]/g, '_'),
                    audioTitulo || 'Minuta de Reunión 132 kV',
                    borradorEditado
                  )
                }
                className="px-2.5 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-300 text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
              >
                <FileDown className="w-3.5 h-3.5" />
                <span>Word (.doc)</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  imprimirMarkdownComoPdf(audioCodigo || 'Minuta de Reunión', borradorEditado)
                }
                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-sky-300 text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Imprimir / PDF</span>
              </button>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-300 mb-1">
              Borrador editable de la Minuta (puedes ajustarlo antes de guardar)
            </label>
            <textarea
              rows={12}
              value={borradorEditado}
              onChange={e => setBorradorEditado(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-slate-100 font-sans leading-relaxed focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>

          <div>
            <button
              type="button"
              onClick={() => setVerTranscripcionLiteral(prev => !prev)}
              className="text-[11px] text-sky-400 hover:text-sky-300 font-semibold flex items-center gap-1 cursor-pointer"
            >
              {verTranscripcionLiteral ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
              <span>
                {verTranscripcionLiteral
                  ? 'Ocultar transcripción literal de audio'
                  : 'Ver transcripción literal completa (con marcas de tiempo)'}
              </span>
            </button>
            {verTranscripcionLiteral && (
              <pre className="mt-2 whitespace-pre-wrap text-[11px] text-slate-300 bg-slate-950 border border-slate-800 rounded-xl p-3 max-h-60 overflow-y-auto font-sans leading-relaxed">
                {resultadoAudio.transcripcionMarcaTiempo}
              </pre>
            )}
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setResultadoAudio(null);
                setBorradorEditado('');
              }}
              className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 text-xs cursor-pointer"
            >
              Descartar
            </button>
            <button
              type="button"
              onClick={handleGuardarBorradorAudioComoMinuta}
              disabled={guardandoBorradorAudio || !borradorEditado.trim()}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-xs font-bold flex items-center gap-2 cursor-pointer"
            >
              {guardandoBorradorAudio ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Guardando y extrayendo compromisos...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Guardar Minuta y Extraer Compromisos</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
