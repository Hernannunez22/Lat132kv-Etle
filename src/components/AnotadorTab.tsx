import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { apiFetch, readJsonResponse } from '../utils/apiClient';
import { comprimirImagenCampo } from '../utils/imageFieldUtils';
import {
  Search,
  Mic,
  MicOff,
  Camera,
  Trash2,
  CheckCircle,
  FileText,
  Sparkles,
  Volume2,
  Loader2,
  Plus,
} from 'lucide-react';
import { buscarYExtraerDePliegosReales } from '../data/pliegosContractuales';

interface FichaData {
  titulo: string;
  exigenciaPliego: string;
  planoApc: string;
  secuenciaInspeccion: string[];
  referencias?: string[];
  fuente?: string;
}

export const AnotadorTab: React.FC = () => {
  const { 
    notasCampo, 
    setNotasCampo, 
    fotosCampo, 
    addFoto,
    actualizarFotoAnalisis,
    deleteFoto, 
    audiosCampo, 
    addAudio,
    actualizarAudioTranscripcion,
    deleteAudio,
    pliegosReales,
    planos,
    interferencias,
    selectedFrenteFilter
  } = useApp();

  const [consulta, setConsulta] = useState('');
  const [ficha, setFicha] = useState<FichaData | null>(null);
  const [isAuditing, setIsAuditing] = useState(false);
  const [isDictatingConsulta, setIsDictatingConsulta] = useState(false);
  const [isDictatingNota, setIsDictatingNota] = useState(false);
  const [isAnalyzingFoto, setIsAnalyzingFoto] = useState(false);
  const [fotoFrenteDraft, setFotoFrenteDraft] = useState<string>('General');
  const [fotoInterfDraft, setFotoInterfDraft] = useState<string>('');
  const [transcribingAudioId, setTranscribingAudioId] = useState<string | null>(null);
  const [estadoGuardadoNota, setEstadoGuardadoNota] = useState('Guardado automáticamente');
  const [bannerNotice, setBannerNotice] = useState<string | null>(null);
  const [isConfirmingClearNotes, setIsConfirmingClearNotes] = useState(false);

  // Audio Recording State & Refs
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingStartMsRef = useRef<number>(0);
  const speechRecognitionRef = useRef<any>(null);

  const showNotice = (msg: string) => {
    setBannerNotice(msg);
    setTimeout(() => setBannerNotice(null), 4000);
  };

  // Setup SpeechRecognition
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'es-AR';

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        if (isDictatingConsulta) {
          setConsulta(transcript);
          ejecutarAuditoria(transcript);
        } else if (isDictatingNota) {
          setNotasCampo(notasCampo ? `${notasCampo} ${transcript}` : transcript);
        }
      };

      recognition.onerror = () => {
        setIsDictatingConsulta(false);
        setIsDictatingNota(false);
      };

      recognition.onend = () => {
        setIsDictatingConsulta(false);
        setIsDictatingNota(false);
      };

      speechRecognitionRef.current = recognition;
    }
  }, [isDictatingConsulta, isDictatingNota, notasCampo, setNotasCampo]);

  const toggleDictadoConsulta = () => {
    if (!speechRecognitionRef.current) {
      showNotice("Dictado no soportado por este navegador.");
      return;
    }
    if (isDictatingConsulta) {
      speechRecognitionRef.current.stop();
      setIsDictatingConsulta(false);
    } else {
      setIsDictatingNota(false);
      setIsDictatingConsulta(true);
      speechRecognitionRef.current.start();
    }
  };

  const toggleDictadoNota = () => {
    if (!speechRecognitionRef.current) {
      showNotice("Dictado no soportado por este navegador.");
      return;
    }
    if (isDictatingNota) {
      speechRecognitionRef.current.stop();
      setIsDictatingNota(false);
    } else {
      setIsDictatingConsulta(false);
      setIsDictatingNota(true);
      speechRecognitionRef.current.start();
    }
  };

  const ejecutarAuditoria = async (textoQuery?: string) => {
    const qRaw = (textoQuery || consulta).trim();
    if (!qRaw) return;
    const qLower = qRaw.toLowerCase();

    setIsAuditing(true);
    try {
      const tokens = qLower.split(/\s+/).filter(t => t.length >= 3);
      const planosRelacionados = planos
        .filter(p => {
          const txt = `${p.codigo} ${p.descripcion} ${p.disciplina}`.toLowerCase();
          return tokens.some(t => txt.includes(t));
        })
        .slice(0, 12);

      const res = await apiFetch('/api/anotador/auditar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          consulta: qRaw,
          frente: selectedFrenteFilter === 'TODOS' ? 'Obra General 132 kV' : selectedFrenteFilter,
          planosMencionados: planosRelacionados,
        }),
      });
      const data = await readJsonResponse(res, 'Error auditando consulta');
      if (!res.ok || !data?.exito || !data?.dictamen) {
        throw new Error(data?.error || `Error auditando (HTTP ${res.status})`);
      }
      setFicha({
        titulo: data.dictamen.titulo,
        exigenciaPliego: data.dictamen.exigenciaPliego,
        planoApc: data.dictamen.planoApc,
        secuenciaInspeccion: Array.isArray(data.dictamen.secuenciaInspeccion)
          ? data.dictamen.secuenciaInspeccion
          : [],
        referencias: Array.isArray(data.dictamen.referencias) ? data.dictamen.referencias : [],
        fuente: String(data.fuente || 'openrouter/free'),
      });
    } catch {
      const extraccion = buscarYExtraerDePliegosReales(qLower, pliegosReales);
      if (extraccion.coincidencias.length > 0) {
        const c = extraccion.coincidencias[0];
        setFicha({
          titulo: `Pliego Real: ${c.pliegoNombre}`,
          exigenciaPliego: c.fragmento,
          planoApc: 'Cotejar contra catálogo de planos APC vigente.',
          secuenciaInspeccion: [
            'Verificar cumplimiento del requerimiento extraído del pliego real.',
            'Cotejar con el plano emitido con sello APC (Aprobado para Construcción).',
            'Registrar protocolo de inspección en el Libro de Comunicaciones de Obra.',
          ],
          referencias: [c.pliegoNombre],
          fuente: 'indice-local',
        });
      } else {
        setFicha({
          titulo: `Auditoría Técnica: "${qRaw}"`,
          exigenciaPliego:
            pliegosReales.length > 0
              ? 'No se hallaron coincidencias directas para esta consulta en tus pliegos reales cargados.'
              : 'No hay pliegos reales cargados. Sube tus documentos con el botón "Pliegos Reales".',
          planoApc: 'Planos Aprobados APC: verificar revisión vigente antes de liberar.',
          secuenciaInspeccion: [
            'Verificar la vigencia de la última revisión emitida del plano (Rev 0 o APC).',
            'Comprobar certificados de calidad de fábrica y ensayos de recepción.',
            'Asentar en el Libro de Comunicaciones de Obra el inicio de los trabajos.',
          ],
          fuente: 'indice-local',
        });
      }
    } finally {
      setIsAuditing(false);
    }
  };

  // Manejo de Fotos con compresión Canvas + análisis Gemini Vision
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const listaFiles = Array.from(files);
    e.target.value = '';

    setIsAnalyzingFoto(true);
    const interfSel = interferencias.find(i => i.id === fotoInterfDraft);
    const frenteFinal = interfSel
      ? interfSel.empresa
      : fotoFrenteDraft && fotoFrenteDraft !== 'General'
        ? fotoFrenteDraft
        : undefined;
    try {
      for (const file of listaFiles) {
        const { dataUrl: compressedDataUrl } = await comprimirImagenCampo(file);
        const fotoId = 'foto_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
        addFoto({
          id: fotoId,
          nombre: file.name,
          fecha: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          dataUrl: compressedDataUrl,
          ...(frenteFinal ? { frente: frenteFinal } : {}),
          ...(interfSel ? { interferenciaId: interfSel.id } : {}),
        });

        try {
          const res = await apiFetch('/api/anotador/analizar-foto', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              dataUrl: compressedDataUrl,
              nombre: file.name,
              notaActual: [
                frenteFinal ? `Frente/Cruce: ${frenteFinal}` : '',
                notasCampo,
              ]
                .filter(Boolean)
                .join(' · '),
            }),
          });
          const data = await readJsonResponse(res, 'Error analizando foto');
          if (res.ok && data?.exito && data?.analisisIA) {
            actualizarFotoAnalisis(fotoId, String(data.analisisIA));
          }
        } catch {
          // Si está offline, la foto comprimida igual queda guardada y sincronizada
        }
      }
    } catch (err: any) {
      showNotice(err?.message || 'Error procesando fotografía.');
    } finally {
      setIsAnalyzingFoto(false);
    }
  };

  // Manejo de Audio con fix de duración via ref + transcripción Gemini 3.5 Transcribe
  const toggleGrabacionAudio = async () => {
    if (isRecordingAudio) {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      if (timerRef.current) clearInterval(timerRef.current);
      setIsRecordingAudio(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mr = new MediaRecorder(stream);

      mr.ondataavailable = e => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mr.onstop = () => {
        const mime = mr.mimeType || 'audio/webm';
        const blobAudio = new Blob(audioChunksRef.current, { type: mime });
        stream.getTracks().forEach(t => t.stop());

        const elapsedSec = Math.max(1, Math.round((Date.now() - recordingStartMsRef.current) / 1000));
        const m = Math.floor(elapsedSec / 60);
        const s = (elapsedSec % 60).toString().padStart(2, '0');
        const duracionStr = `${m}:${s}`;

        const reader = new FileReader();
        reader.onloadend = async () => {
          const dataUrl = String(reader.result || '');
          const audioId = 'audio_' + Date.now();
          addAudio({
            id: audioId,
            fecha: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            duracion: duracionStr,
            dataUrl,
            transcripcion: 'Transcribiendo nota de voz con IA...',
          });
          setRecordingSeconds(0);

          setTranscribingAudioId(audioId);
          try {
            const res = await apiFetch('/api/anotador/transcribir-audio', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ dataUrl, mimeType: mime }),
            });
            const data = await readJsonResponse(res, 'Error transcribiendo audio');
            if (res.ok && data?.exito && data?.transcripcion) {
              actualizarAudioTranscripcion(audioId, String(data.transcripcion));
            } else {
              actualizarAudioTranscripcion(audioId, 'Audio grabado en terreno (sin transcripción IA).');
            }
          } catch {
            actualizarAudioTranscripcion(audioId, 'Audio grabado en terreno (pendiente de transcripción).');
          } finally {
            setTranscribingAudioId(null);
          }
        };
        reader.readAsDataURL(blobAudio);
      };

      recordingStartMsRef.current = Date.now();
      mr.start();
      mediaRecorderRef.current = mr;
      setIsRecordingAudio(true);
      setRecordingSeconds(0);

      timerRef.current = setInterval(() => {
        setRecordingSeconds((prev: number) => prev + 1);
      }, 1000);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      showNotice('No se pudo acceder al micrófono: ' + errorMsg);
    }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setNotasCampo(e.target.value);
    setEstadoGuardadoNota('Guardado ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
  };

  return (
    <div className="space-y-5">
      {bannerNotice && (
        <div className="p-3 rounded-xl bg-amber-950/80 border border-amber-800 text-amber-200 text-xs flex items-center justify-between">
          <span>{bannerNotice}</span>
          <button onClick={() => setBannerNotice(null)} className="text-amber-400 hover:text-white font-bold ml-2">✕</button>
        </div>
      )}

      {/* Search Bar Bento Anotador */}
      <div className="bento-card p-3 sm:p-5 space-y-3.5 border-sky-800/40 bg-gradient-to-br from-slate-900 via-slate-900 to-sky-950/20">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-sky-400 flex items-center gap-1.5 font-mono">
            <span>📓</span> Auditoría Técnica & Normativa
          </span>
          <span className="text-[10px] bg-sky-950/80 text-sky-300 border border-sky-800 px-2.5 py-0.5 rounded-full font-mono flex items-center gap-1 shrink-0 whitespace-nowrap">
            <Sparkles className="w-3 h-3 text-sky-400" />
            <span>IA Gemini Flash</span>
          </span>
        </div>
        <p className="text-xs text-slate-300 leading-relaxed">
          Escribe cualquier tema de obra para auditar en segundos qué exige el <b>Pliego Técnico</b> vs qué indica el <b>Plano Aprobado (APC)</b> y la secuencia de inspección.
        </p>

        {/* Campo de Consulta con Dictado y Búsqueda */}
        <div className="relative">
          <input 
            type="text"
            id="txtConsultaAnotador"
            value={consulta}
            onChange={e => setConsulta(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') ejecutarAuditoria(); }}
            placeholder="Ej: fundaciones de pórticos H-25, malla PAT, cruce gasoducto TGN..."
            className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-4 py-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 font-medium pr-20"
          />
          <div className="absolute right-2 top-2 flex items-center gap-1">
            <button 
              type="button"
              onClick={toggleDictadoConsulta}
              title={isDictatingConsulta ? "Detener dictado" : "Dictar consulta por voz"}
              className={`h-8 w-8 rounded-lg flex items-center justify-center text-sm transition-all cursor-pointer ${
                isDictatingConsulta 
                  ? 'bg-rose-600 text-white animate-pulse' 
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700'
              }`}
            >
              {isDictatingConsulta ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>
            <button 
              onClick={() => ejecutarAuditoria()}
              disabled={isAuditing}
              className="h-8 w-8 bg-sky-600 hover:bg-sky-500 disabled:opacity-60 text-white rounded-lg flex items-center justify-center text-sm font-bold shadow-md active:scale-95 transition-all cursor-pointer"
            >
              {isAuditing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Chips de Búsqueda Rápida */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pt-1">
          <button 
            onClick={() => { setConsulta('fundaciones de porticos hormigones H25 y stub'); void ejecutarAuditoria('fundaciones de porticos hormigones H25 y stub'); }}
            className="shrink-0 text-xs px-3 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700/80 transition-all cursor-pointer"
          >
            🏗️ Fundaciones
          </button>
          <button 
            onClick={() => { setConsulta('malla de puesta a tierra PAT resistividad y cables'); void ejecutarAuditoria('malla de puesta a tierra PAT resistividad y cables'); }}
            className="shrink-0 text-xs px-3 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700/80 transition-all cursor-pointer"
          >
            ⚡ Malla PAT
          </button>
          <button 
            onClick={() => { setConsulta('cruce de gasoducto TGN galibos y protecciones'); void ejecutarAuditoria('cruce de gasoducto TGN galibos y protecciones'); }}
            className="shrink-0 text-xs px-3 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700/80 transition-all cursor-pointer"
          >
            🔥 Cruce TGN
          </button>
          <button 
            onClick={() => { setConsulta('curado y probetas de hormigon tiempo de desencofrado'); void ejecutarAuditoria('curado y probetas de hormigon tiempo de desencofrado'); }}
            className="shrink-0 text-xs px-3 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700/80 transition-all cursor-pointer"
          >
            🧪 Ensayos H°
          </button>
        </div>
      </div>

      {isAuditing && (
        <div className="bento-card p-5 text-center space-y-2 border-sky-800/40 bg-slate-900/90">
          <Loader2 className="w-6 h-6 animate-spin text-sky-400 mx-auto" />
          <div className="text-xs font-bold text-white">Consultando Pliegos Reales y planos APC con IA...</div>
        </div>
      )}

      {/* Ficha Técnica de Inspección */}
      {ficha && !isAuditing && (
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <FileText className="w-3.5 h-3.5 text-sky-400" />
              <span>Ficha Técnica de Inspección</span>
              {ficha.fuente && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-sky-950/70 text-sky-300 border border-sky-800/50 lowercase">
                  {ficha.fuente}
                </span>
              )}
            </h4>
            <button 
              onClick={() => setFicha(null)} 
              className="text-xs text-slate-400 hover:text-white underline cursor-pointer"
            >
              Cerrar ficha
            </button>
          </div>

          <div className="bento-card p-3 sm:p-5 text-xs space-y-4 border-sky-800/50 bg-slate-900/90 shadow-xl">
            <h3 className="text-sm font-extrabold text-sky-300 border-b border-slate-800 pb-2">
              {ficha.titulo}
            </h3>

            <div className="space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <span>📜</span> Exigencia del Pliego Técnico Contractual:
              </span>
              <p className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/90 text-slate-300 leading-relaxed font-sans whitespace-pre-line">
                {ficha.exigenciaPliego}
              </p>
            </div>

            <div className="space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                <span>📐</span> Disposición en Plano Aprobado con Sello APC:
              </span>
              <p className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/90 text-slate-300 leading-relaxed font-sans">
                {ficha.planoApc}
              </p>
            </div>

            <div className="space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                <span>📋</span> Protocolo de Control & Secuencia de Inspección en Terreno:
              </span>
              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/90 space-y-1.5">
                {ficha.secuenciaInspeccion.map((p, idx) => (
                  <div key={idx} className="flex items-start gap-2 text-slate-200">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
                    <span>{p}</span>
                  </div>
                ))}
              </div>
            </div>

            {Array.isArray(ficha.referencias) && ficha.referencias.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-800">
                <span className="text-[10px] text-slate-500 mr-1">Referencias:</span>
                {ficha.referencias.map((r, rIdx) => (
                  <span
                    key={rIdx}
                    className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-[10px] text-slate-300 font-mono"
                  >
                    {r}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Notas Privadas de Campo */}
      <div className="bento-card p-3 sm:p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
            <span>✍️</span> Mis Notas Privadas de Campo
          </h4>
          <div className="flex items-center gap-2">
            <button 
              type="button"
              onClick={toggleDictadoNota}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                isDictatingNota 
                  ? 'bg-rose-600 border border-rose-500 text-white animate-pulse' 
                  : 'bg-sky-950/80 hover:bg-sky-900 border border-sky-800/80 text-sky-300'
              }`}
            >
              {isDictatingNota ? <MicOff className="w-3 h-3" /> : <Mic className="w-3 h-3" />}
              <span>{isDictatingNota ? 'Escuchando...' : 'Dictar por voz'}</span>
            </button>
            <span className="text-[10px] text-slate-500 font-mono hidden sm:inline-block">Persistente</span>
          </div>
        </div>

        <textarea 
          rows={4}
          value={notasCampo}
          onChange={handleTextChange}
          placeholder="Anota observaciones o dicta por voz en terreno (ej: 'Revisar piquete 42: verificar nivelación del stub antes de colar hormigón')..."
          className="w-full bg-slate-950 border border-slate-700/80 rounded-xl p-3.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-500 resize-none font-sans"
        />

        <div className="flex items-center justify-between text-xs text-slate-400">
          <span className="text-[11px]">{estadoGuardadoNota}</span>
          {isConfirmingClearNotes ? (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-amber-300">¿Confirmar borrado?</span>
              <button 
                onClick={() => { setNotasCampo(""); setIsConfirmingClearNotes(false); }}
                className="text-rose-400 hover:text-rose-300 font-bold px-1.5 py-0.5 rounded bg-rose-950/60 border border-rose-800"
              >
                Sí, borrar
              </button>
              <button 
                onClick={() => setIsConfirmingClearNotes(false)}
                className="text-slate-400 hover:text-white px-1.5 py-0.5"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <button 
              onClick={() => setIsConfirmingClearNotes(true)}
              className="text-rose-400 hover:text-rose-300 font-medium cursor-pointer"
            >
              Borrar notas
            </button>
          )}
        </div>

        {/* Sección de Fotos y Evidencia */}
        <div className="pt-3 border-t border-slate-800/80 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <span>📷</span> Fotos y Evidencia de Campo
            </span>
            <span className="text-[10px] text-slate-400 font-mono">{fotosCampo.length} fotos</span>
          </div>

          <input 
            type="file"
            id="fileInputFoto"
            accept="image/*"
            capture="environment"
            multiple
            className="hidden"
            onChange={handlePhotoUpload}
          />

          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <select
              value={fotoFrenteDraft}
              onChange={e => setFotoFrenteDraft(e.target.value)}
              className="bg-slate-950 border border-slate-700/80 rounded-xl px-2.5 py-2 text-[11px] text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500"
              aria-label="Frente de obra para la foto"
            >
              <option value="General">Frente: Obra General</option>
              <option value="LAT">Frente: LAT 132 kV</option>
              <option value="Leales">Frente: ET Leales</option>
              <option value="Villa Quinteros">Frente: ET Villa Quinteros</option>
              <option value="Bracho">Frente: ET El Bracho</option>
            </select>
            {interferencias.length > 0 && (
              <select
                value={fotoInterfDraft}
                onChange={e => setFotoInterfDraft(e.target.value)}
                className="bg-slate-950 border border-slate-700/80 rounded-xl px-2.5 py-2 text-[11px] text-slate-200 focus:outline-none focus:ring-1 focus:ring-amber-500 max-w-full sm:max-w-[200px]"
                aria-label="Vincular foto a interferencia o cruce"
              >
                <option value="">Sin cruce específico</option>
                {interferencias.map(i => (
                  <option key={i.id} value={i.id}>
                    Cruce: {i.empresa}
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              onClick={() => document.getElementById('fileInputFoto')?.click()}
              className="flex-1 py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 border border-sky-800/40 text-sky-300 text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <Camera className="w-4 h-4 text-sky-400" />
              <span>Tomar Foto / Adjuntar Imagen</span>
            </button>
          </div>

          {isAnalyzingFoto && (
            <div className="text-[11px] text-emerald-400 font-medium flex items-center gap-2 bg-emerald-950/40 p-2.5 rounded-xl border border-emerald-800/40">
              <div className="w-3.5 h-3.5 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin"></div>
              <span>Analizando fotografía con IA de ingeniería...</span>
            </div>
          )}

          {/* Grilla de Fotos */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {fotosCampo.map(f => (
              <div key={f.id} className="bento-card p-3 space-y-2 bg-slate-950/90 border-slate-800 min-w-0">
                <div className="flex justify-between items-center gap-2 text-[11px]">
                  <div className="min-w-0 flex-1 flex items-center gap-1.5 flex-wrap">
                    <span className="font-bold text-slate-200 truncate">{f.nombre}</span>
                    {f.frente && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-sky-950/70 text-sky-300 border border-sky-700/50 font-mono">
                        {f.frente}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-slate-500 font-mono text-[10px]">{f.fecha}</span>
                    <button
                      onClick={() => deleteFoto(f.id)}
                      className="text-rose-400 hover:text-rose-300 cursor-pointer p-0.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <img src={f.dataUrl} alt={f.nombre} className="w-full h-36 object-cover rounded-lg" />
                {f.analisisIA && (
                  <div className="p-2.5 rounded-lg bg-emerald-950/25 border border-emerald-800/40 text-[11px] text-slate-200 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1">
                        <Sparkles className="w-3 h-3" /> Inspección IA
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setNotasCampo(
                            `${notasCampo ? `${notasCampo}\n\n` : ''}[Foto ${f.nombre} - ${f.fecha}]\n${f.analisisIA}`
                          )
                        }
                        className="text-[10px] font-semibold text-sky-300 hover:text-sky-200 flex items-center gap-0.5 cursor-pointer"
                      >
                        <Plus className="w-3 h-3" /> Pasar a notas
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-300 whitespace-pre-line leading-relaxed">
                      {f.analisisIA}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Grabadora de Notas de Voz */}
        <div className="pt-3 border-t border-slate-800/80 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <span>🎧</span> Notas de Audio Grabadas en Campo
            </span>
            {isRecordingAudio && (
              <span className="text-[11px] font-mono text-rose-400 font-bold animate-pulse">
                ● {Math.floor(recordingSeconds / 60).toString().padStart(2, '0')}:{(recordingSeconds % 60).toString().padStart(2, '0')}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button 
              type="button"
              onClick={toggleGrabacionAudio}
              className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                isRecordingAudio 
                  ? 'bg-rose-600 hover:bg-rose-500 border border-rose-400 text-white shadow-lg animate-pulse' 
                  : 'bg-slate-900 hover:bg-slate-800 border border-rose-900/40 text-rose-300'
              }`}
            >
              <span className={`w-2.5 h-2.5 rounded-full ${isRecordingAudio ? 'bg-white' : 'bg-rose-500'}`}></span>
              <span>{isRecordingAudio ? 'Detener y Transcribir' : 'Grabar y Transcribir Nota de Voz'}</span>
            </button>
          </div>

          {/* Lista de Audios */}
          <div className="space-y-2">
            {audiosCampo.length === 0 ? (
              <div className="text-[11px] text-slate-500 italic p-3 text-center bg-slate-950/60 rounded-xl border border-slate-800/60">
                No hay grabaciones de voz aún.
              </div>
            ) : (
              audiosCampo.map((item, idx) => (
                <div key={item.id} className="bento-card p-3 space-y-2 bg-slate-950/80 border-slate-800">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-200 flex items-center gap-1.5">
                      <Volume2 className="w-3.5 h-3.5 text-rose-400" />
                      <span>Nota #{audiosCampo.length - idx} ({item.duracion})</span>
                      <span className="text-slate-500 text-[10px] font-mono font-normal">({item.fecha})</span>
                    </span>
                    <button 
                      onClick={() => deleteAudio(item.id)} 
                      className="text-rose-400 hover:text-rose-300 text-xs font-bold cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <audio controls src={item.dataUrl} className="w-full h-8" />
                  {item.transcripcion && (
                    <div className="p-2 rounded-lg bg-slate-900/90 border border-slate-800 text-[11px] text-slate-200 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-bold text-sky-400 flex items-center gap-1">
                          {transcribingAudioId === item.id && <Loader2 className="w-3 h-3 animate-spin" />}
                          Transcripción IA:
                        </span>
                        {transcribingAudioId !== item.id && (
                          <button
                            type="button"
                            onClick={() =>
                              setNotasCampo(
                                `${notasCampo ? `${notasCampo}\n\n` : ''}[Audio ${item.fecha}] ${item.transcripcion}`
                              )
                            }
                            className="text-[10px] font-semibold text-emerald-300 hover:text-emerald-200 flex items-center gap-0.5 cursor-pointer"
                          >
                            <Plus className="w-3 h-3" /> Agregar a notas
                          </button>
                        )}
                      </div>
                      <p className="text-slate-300 leading-relaxed whitespace-pre-line">{item.transcripcion}</p>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
