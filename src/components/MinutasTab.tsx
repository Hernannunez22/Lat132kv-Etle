import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AudioMinutaResultado, SubidaProgresoInfo, useApp } from '../context/AppContext';
import { CompromisoMinuta, EstadoCompromiso, MinutaReunion, NotaPedidoIngenieria } from '../types';
import { MarkdownRenderer } from './MarkdownRenderer';
import { descargarMarkdownComoWord } from '../utils/exportWord';
import { apiFetch, tryReadJsonResponse } from '../utils/apiClient';
import {
  DEFAULT_DRIVE_ROOT_FOLDER_ID,
  esErrorPopupBloqueado,
  extraerDriveFolderId,
  getGoogleDriveAccessToken,
} from '../utils/googleAuth';
import {
  ClipboardList,
  Upload,
  Plus,
  FileWarning,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Search,
  Trash2,
  Copy,
  Check,
  FileDown,
  Printer,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  Loader2,
  Send,
  FolderSync,
  ExternalLink,
  LogOut,
  Mic,
  Square,
  Pause,
  Play,
  FileAudio,
  Sparkles,
} from 'lucide-react';

type SubVistaMinutas = 'compromisos' | 'minutas' | 'notas_pedido';
type FiltroEstado = 'TODOS' | 'INCUMPLIDO' | 'PENDIENTE' | 'CUMPLIDO';

const FRENTES_OPCIONES = [
  'LAT El Bracho - Villa Quinteros',
  'ET Leales',
  'ET Villa Quinteros',
  'ET El Bracho',
];

function calcularDiasDesvio(fechaLimite: string, hoyIso: string): number {
  const fLim = new Date(`${fechaLimite}T00:00:00`).getTime();
  const fHoy = new Date(`${hoyIso}T00:00:00`).getTime();
  if (Number.isNaN(fLim) || Number.isNaN(fHoy)) return 0;
  return Math.round((fHoy - fLim) / (1000 * 60 * 60 * 24));
}

function esIncumplidoOVencido(c: CompromisoMinuta, hoyIso: string): boolean {
  if (c.estado === 'CUMPLIDO') return false;
  if (c.estado === 'INCUMPLIDO') return true;
  return Boolean(c.fechaLimite && c.fechaLimite < hoyIso);
}

function imprimirMarkdownComoPdf(titulo: string, contenidoMarkdown: string) {
  const html = contenidoMarkdown
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/^# (.*)$/gm, '<h1>$1</h1>')
    .replace(/^## (.*)$/gm, '<h2>$1</h2>')
    .replace(/^### (.*)$/gm, '<h3>$1</h3>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br/>');

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);
  const doc = iframe.contentWindow?.document;
  if (!doc) return;
  doc.open();
  doc.write(`<!DOCTYPE html><html><head><title>${titulo}</title><style>body{font-family:Calibri,Arial,sans-serif;padding:28px;color:#0f172a;font-size:11pt;line-height:1.5;}h1{font-size:15pt;border-bottom:2px solid #0f172a;padding-bottom:6px;}h2{font-size:12pt;color:#0369a1;margin-top:14px;}</style></head><body>${html}</body></html>`);
  doc.close();
  setTimeout(() => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    setTimeout(() => iframe.remove(), 1000);
  }, 250);
}

export const MinutasTab: React.FC = () => {
  const {
    minutas,
    compromisosMinutas,
    notasPedido,
    sincronizarMinutasDrive,
    subirMinutaArchivo,
    transcribirAudioMinuta,
    registrarMinutaTexto,
    eliminarMinuta,
    agregarCompromisoMinuta,
    actualizarCompromisoMinuta,
    eliminarCompromisoMinuta,
    generarNotaPedido,
    eliminarNotaPedido,
    setActiveTab,
    sendChatMessage,
    hasDriveToken,
    driveConnectionState,
    conectarGoogleDriveChat,
    desconectarGoogleDrive,
    puedeUsarModelosPagos,
  } = useApp();

  const hoyIso = new Date().toISOString().split('T')[0];

  const [subVista, setSubVista] = useState<SubVistaMinutas>('compromisos');
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>('TODOS');
  const [filtroFrente, setFiltroFrente] = useState<string>('TODOS');
  const [seleccionados, setSeleccionados] = useState<string[]>([]);

  // Google Drive sync
  const [driveFolderInput, setDriveFolderInput] = useState<string>(DEFAULT_DRIVE_ROOT_FOLDER_ID);
  const [buscarTodoDrive, setBuscarTodoDrive] = useState<boolean>(true);
  const [sincronizandoDrive, setSincronizandoDrive] = useState<boolean>(false);
  const [ultimoScanDrive, setUltimoScanDrive] = useState<{
    carpetaRaizNombre: string;
    carpetasEscaneadas: number;
    archivosDetectados: number;
    minutasNuevas: number;
    compromisosNuevos: number;
    erroresArchivos: Array<{ nombre: string; error: string }>;
  } | null>(null);

  // Paneles de alta
  const [mostrarAltaMinuta, setMostrarAltaMinuta] = useState(false);
  const [mostrarAudioMinuta, setMostrarAudioMinuta] = useState(false);
  const [mostrarAltaCompromiso, setMostrarAltaCompromiso] = useState(false);
  const [subiendoArchivo, setSubiendoArchivo] = useState(false);
  const [guardandoMinuta, setGuardandoMinuta] = useState(false);
  const [errorAccion, setErrorAccion] = useState<string | null>(null);
  const [mensajeOk, setMensajeOk] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioFileInputRef = useRef<HTMLInputElement>(null);

  // Estudio de Audio Largo -> Minuta (Groq Whisper + Modelo de referencia)
  const [audioConfig, setAudioConfig] = useState<{
    groqConfigurado: boolean;
    groqVistaSegura: string | null;
    openRouterConfigurado: boolean;
    geminiConfigurado: boolean;
  } | null>(null);
  const [audioModeloId, setAudioModeloId] = useState<string>('');
  const [audioMotor, setAudioMotor] = useState<'gratuito' | 'gemini'>('gratuito');
  useEffect(() => {
    if (!puedeUsarModelosPagos && audioMotor !== 'gratuito') {
      setAudioMotor('gratuito');
    }
  }, [puedeUsarModelosPagos, audioMotor]);
  const [audioCodigo, setAudioCodigo] = useState('');
  const [audioFecha, setAudioFecha] = useState(hoyIso);
  const [audioFrente, setAudioFrente] = useState(FRENTES_OPCIONES[0]);
  const [audioTitulo, setAudioTitulo] = useState('');
  const [audioParticipantes, setAudioParticipantes] = useState(
    'UTE · Ingeniería / Proyectista · Inspección'
  );
  const [recEstado, setRecEstado] = useState<'inactivo' | 'grabando' | 'pausado'>('inactivo');
  const [recSegundos, setRecSegundos] = useState(0);
  const [recBytesAprox, setRecBytesAprox] = useState(0);
  const [procesandoAudio, setProcesandoAudio] = useState(false);
  const [progresoAudio, setProgresoAudio] = useState<SubidaProgresoInfo | null>(null);
  const [resultadoAudio, setResultadoAudio] = useState<AudioMinutaResultado | null>(null);
  const [borradorEditado, setBorradorEditado] = useState('');
  const [verTranscripcionLiteral, setVerTranscripcionLiteral] = useState(false);
  const [guardandoBorradorAudio, setGuardandoBorradorAudio] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const wakeLockRef = useRef<any>(null);
  const recTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelRecFlagRef = useRef<boolean>(false);

  // Form nueva minuta
  const [minCodigo, setMinCodigo] = useState('');
  const [minTitulo, setMinTitulo] = useState('');
  const [minFecha, setMinFecha] = useState(hoyIso);
  const [minFrente, setMinFrente] = useState(FRENTES_OPCIONES[0]);
  const [minParticipantes, setMinParticipantes] = useState('UTE · Ingeniería / Proyectista · Inspección');
  const [minTexto, setMinTexto] = useState('');

  // Form nuevo compromiso puntual
  const [compMinutaId, setCompMinutaId] = useState('');
  const [compDesc, setCompDesc] = useState('');
  const [compResp, setCompResp] = useState('Ingeniería / Proyectista');
  const [compArea, setCompArea] = useState('Ingeniería');
  const [compFrente, setCompFrente] = useState(FRENTES_OPCIONES[0]);
  const [compFechaLim, setCompFechaLim] = useState(hoyIso);
  const [compDocs, setCompDocs] = useState('');
  const [compEstadoInit, setCompEstadoInit] = useState<EstadoCompromiso>('INCUMPLIDO');

  // Form Nota de Pedido
  const [npNumero, setNpNumero] = useState('');
  const [npFecha, setNpFecha] = useState(hoyIso);
  const [npEmisor, setNpEmisor] = useState('Dirección Técnica & Control de Proyecto (UTE)');
  const [npDestinatario, setNpDestinatario] = useState('Jefatura de Ingeniería / Proyectista');
  const [npFrente, setNpFrente] = useState(FRENTES_OPCIONES[0]);
  const [npAsunto, setNpAsunto] = useState('');
  const [npPlazo, setNpPlazo] = useState(5);
  const [npEncuadre, setNpEncuadre] = useState('');
  const [generandoNp, setGenerandoNp] = useState(false);

  // Vista detalle
  const [minutaExpandidaId, setMinutaExpandidaId] = useState<string | null>(null);
  const [notaActivaId, setNotaActivaId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const resumenConteos = useMemo(() => {
    const total = compromisosMinutas.length;
    const incumplidos = compromisosMinutas.filter(c => esIncumplidoOVencido(c, hoyIso)).length;
    const cumplidos = compromisosMinutas.filter(c => c.estado === 'CUMPLIDO').length;
    const pendientes = total - incumplidos - cumplidos;
    return { total, incumplidos, cumplidos, pendientes };
  }, [compromisosMinutas, hoyIso]);

  const compromisosFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return compromisosMinutas.filter(c => {
      const esInc = esIncumplidoOVencido(c, hoyIso);
      if (filtroEstado === 'INCUMPLIDO' && !esInc) return false;
      if (filtroEstado === 'CUMPLIDO' && c.estado !== 'CUMPLIDO') return false;
      if (filtroEstado === 'PENDIENTE' && (c.estado === 'CUMPLIDO' || esInc)) return false;
      if (filtroFrente !== 'TODOS' && c.frente !== filtroFrente) return false;
      if (!q) return true;
      return (
        c.descripcion.toLowerCase().includes(q) ||
        c.responsable.toLowerCase().includes(q) ||
        c.minutaCodigo.toLowerCase().includes(q) ||
        c.frente.toLowerCase().includes(q) ||
        (c.documentosRelacionados || []).some(d => d.toLowerCase().includes(q))
      );
    });
  }, [compromisosMinutas, busqueda, filtroEstado, filtroFrente, hoyIso]);

  const minutasFiltradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return minutas.filter(m => {
      if (filtroFrente !== 'TODOS' && m.frente !== filtroFrente) return false;
      if (!q) return true;
      return (
        m.codigo.toLowerCase().includes(q) ||
        m.titulo.toLowerCase().includes(q) ||
        m.contenidoTexto.toLowerCase().includes(q) ||
        m.participantes.toLowerCase().includes(q)
      );
    });
  }, [minutas, busqueda, filtroFrente]);

  const notaVisualizada: NotaPedidoIngenieria | null = useMemo(() => {
    if (notaActivaId) {
      return notasPedido.find(n => n.id === notaActivaId) || notasPedido[0] || null;
    }
    return notasPedido[0] || null;
  }, [notasPedido, notaActivaId]);

  const limpiarMensajes = () => {
    setErrorAccion(null);
    setMensajeOk(null);
  };

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const res = await apiFetch('/api/minutas/audio/config');
        if (!res.ok || cancel) return;
        const data = await tryReadJsonResponse(res);
        if (data?.exito && !cancel) {
          setAudioConfig({
            groqConfigurado: Boolean(data.groqConfigurado),
            groqVistaSegura: data.groqVistaSegura || null,
            openRouterConfigurado: Boolean(data.openRouterConfigurado),
            geminiConfigurado: Boolean(data.geminiConfigurado),
          });
        }
      } catch {}
    })();
    return () => {
      cancel = true;
    };
  }, [mostrarAudioMinuta]);

  const liberarRecursosGrabacion = () => {
    if (recTimerRef.current) {
      clearInterval(recTimerRef.current);
      recTimerRef.current = null;
    }
    if (wakeLockRef.current) {
      try {
        wakeLockRef.current.release();
      } catch {}
      wakeLockRef.current = null;
    }
    if (mediaStreamRef.current) {
      for (const track of mediaStreamRef.current.getTracks()) {
        track.stop();
      }
      mediaStreamRef.current = null;
    }
    mediaRecorderRef.current = null;
  };

  useEffect(() => {
    return () => {
      cancelRecFlagRef.current = true;
      liberarRecursosGrabacion();
    };
  }, []);

  useEffect(() => {
    if (recEstado === 'inactivo') return;
    const onBeforeUnload = (ev: BeforeUnloadEvent) => {
      ev.preventDefault();
      ev.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [recEstado]);

  const formatearCronometro = (totalSec: number) => {
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const procesarBlobAudioHaciaMinuta = async (blob: Blob, nombreArchivo: string) => {
    limpiarMensajes();
    setProcesandoAudio(true);
    setResultadoAudio(null);
    setBorradorEditado('');
    setVerTranscripcionLiteral(false);
    setProgresoAudio({
      fase: 'subiendo',
      porcentaje: 2,
      detalle: `Preparando "${nombreArchivo}" (${(blob.size / (1024 * 1024)).toFixed(1)} MB)...`,
    });

    try {
      const res = await transcribirAudioMinuta(
        blob,
        {
          nombreArchivo,
          modeloMinutaId: audioModeloId,
          codigo: audioCodigo.trim() || undefined,
          titulo: audioTitulo.trim() || undefined,
          fechaReunion: audioFecha || hoyIso,
          frente: audioFrente || undefined,
          participantes: audioParticipantes.trim() || undefined,
          motor: audioMotor,
        },
        info => setProgresoAudio(info)
      );
      setResultadoAudio(res);
      setBorradorEditado(res.borradorMarkdown);
      setMensajeOk(
        `Audio transcrito en ${res.segmentosProcesados} tramo(s) y borrador de minuta redactado. Revisa y guarda los compromisos.`
      );
    } catch (err: any) {
      setErrorAccion(err?.message || 'Error transcribiendo el audio de reunión.');
    } finally {
      setProcesandoAudio(false);
      setProgresoAudio(null);
    }
  };

  const handleIniciarGrabacionReunion = async () => {
    limpiarMensajes();
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setErrorAccion('Tu navegador no admite grabación de micrófono directa. Usa "Subir Audio".');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const mimeCandidates = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/ogg;codecs=opus',
      ];
      const selectedMime =
        typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.isTypeSupported === 'function'
          ? mimeCandidates.find(m => MediaRecorder.isTypeSupported(m))
          : undefined;

      const recorder = new MediaRecorder(stream, {
        ...(selectedMime ? { mimeType: selectedMime } : {}),
        audioBitsPerSecond: 32000,
      });

      audioChunksRef.current = [];
      cancelRecFlagRef.current = false;
      setRecSegundos(0);
      setRecBytesAprox(0);

      recorder.ondataavailable = ev => {
        if (ev.data && ev.data.size > 0) {
          audioChunksRef.current.push(ev.data);
          setRecBytesAprox(prev => prev + ev.data.size);
        }
      };

      recorder.onstop = () => {
        const mimeFinal = recorder.mimeType || selectedMime || 'audio/webm';
        const chunks = [...audioChunksRef.current];
        const fueCancelado = cancelRecFlagRef.current;
        liberarRecursosGrabacion();
        setRecEstado('inactivo');

        if (fueCancelado || chunks.length === 0) {
          return;
        }
        const ext = mimeFinal.includes('mp4') ? 'm4a' : mimeFinal.includes('ogg') ? 'ogg' : 'webm';
        const blobFinal = new Blob(chunks, { type: mimeFinal });
        void procesarBlobAudioHaciaMinuta(
          blobFinal,
          `reunion_${audioFecha || hoyIso}_${Date.now()}.${ext}`
        );
      };

      mediaRecorderRef.current = recorder;
      recorder.start(2000);
      setRecEstado('grabando');

      recTimerRef.current = setInterval(() => {
        setRecSegundos(prev => prev + 1);
      }, 1000);

      if (typeof navigator !== 'undefined' && 'wakeLock' in navigator) {
        try {
          wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
        } catch {}
      }
    } catch (err: any) {
      liberarRecursosGrabacion();
      setRecEstado('inactivo');
      setErrorAccion(
        err?.message || 'No se pudo acceder al micrófono. Verifica los permisos del navegador.'
      );
    }
  };

  const handlePausarReanudarGrabacion = () => {
    const rec = mediaRecorderRef.current;
    if (!rec) return;
    if (recEstado === 'grabando' && rec.state === 'recording') {
      rec.pause();
      if (recTimerRef.current) {
        clearInterval(recTimerRef.current);
        recTimerRef.current = null;
      }
      setRecEstado('pausado');
    } else if (recEstado === 'pausado' && rec.state === 'paused') {
      rec.resume();
      recTimerRef.current = setInterval(() => {
        setRecSegundos(prev => prev + 1);
      }, 1000);
      setRecEstado('grabando');
    }
  };

  const handleFinalizarGrabacion = () => {
    const rec = mediaRecorderRef.current;
    if (!rec) return;
    cancelRecFlagRef.current = false;
    if (rec.state !== 'inactive') {
      rec.stop();
    }
  };

  const handleDescartarGrabacion = () => {
    const rec = mediaRecorderRef.current;
    cancelRecFlagRef.current = true;
    audioChunksRef.current = [];
    setRecSegundos(0);
    setRecBytesAprox(0);
    if (rec && rec.state !== 'inactive') {
      rec.stop();
    } else {
      liberarRecursosGrabacion();
      setRecEstado('inactivo');
    }
  };

  const handleSubirArchivoAudio = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    await procesarBlobAudioHaciaMinuta(file, file.name);
  };

  const handleGuardarBorradorAudioComoMinuta = async () => {
    if (!borradorEditado.trim()) {
      setErrorAccion('El borrador de la minuta está vacío.');
      return;
    }
    limpiarMensajes();
    setGuardandoBorradorAudio(true);
    try {
      const res = await registrarMinutaTexto({
        codigo: audioCodigo.trim() || undefined,
        titulo: audioTitulo.trim() || undefined,
        fechaReunion: audioFecha || hoyIso,
        frente: audioFrente,
        participantes: audioParticipantes.trim() || undefined,
        contenidoTexto: borradorEditado.trim(),
        extraerAutomaticamente: true,
      });
      setMensajeOk(
        `Minuta ${res.minuta.codigo} guardada desde audio con ${res.compromisosExtraidos.length} compromiso(s) extraído(s).`
      );
      setResultadoAudio(null);
      setBorradorEditado('');
      setAudioCodigo('');
      setAudioTitulo('');
      setMostrarAudioMinuta(false);
      setSubVista('compromisos');
    } catch (err: any) {
      setErrorAccion(err?.message || 'Error guardando la minuta generada.');
    } finally {
      setGuardandoBorradorAudio(false);
    }
  };

  const ejecutarLecturaDrive = async (tokenOverride?: string, forceConsent = false) => {
    limpiarMensajes();
    setSincronizandoDrive(true);
    try {
      let token = tokenOverride || (forceConsent ? null : getGoogleDriveAccessToken());
      if (!token) {
        await conectarGoogleDriveChat({ forceConsent });
        token = getGoogleDriveAccessToken();
        if (!token) {
          throw new Error(
            'No se recibió el permiso de lectura de Google Drive. Vuelve a iniciar sesión y acepta el acceso a Google Drive.'
          );
        }
      }

      const folderId = extraerDriveFolderId(driveFolderInput);
      const res = await sincronizarMinutasDrive({
        accessToken: token,
        folderId,
        buscarEnTodoDrive: buscarTodoDrive,
      });

      setUltimoScanDrive({
        carpetaRaizNombre: res.carpetaRaizNombre,
        carpetasEscaneadas: res.carpetasEscaneadas,
        archivosDetectados: res.archivosDetectados,
        minutasNuevas: res.minutasNuevas.length,
        compromisosNuevos: res.compromisosNuevos.length,
        erroresArchivos: res.erroresArchivos,
      });

      if (res.minutasNuevas.length > 0) {
        setMensajeOk(
          `Drive sincronizado ("${res.carpetaRaizNombre}"): ${res.minutasNuevas.length} minuta(s) leída(s) y ${res.compromisosNuevos.length} compromiso(s) extraído(s).`
        );
      } else if (res.archivosDetectados > 0) {
        setMensajeOk(
          `Drive verificado (${res.archivosDetectados} archivo(s) de minutas detectado(s), sin novedades pendientes).`
        );
      } else {
        setErrorAccion(
          `Se escanearon ${res.carpetasEscaneadas} carpeta(s) en "${res.carpetaRaizNombre}" sin encontrar archivos con nombre o carpeta de minuta. Pega el link o ID de la carpeta específica de minutas si están en otro directorio.`
        );
      }
    } catch (err: any) {
      setErrorAccion(err?.message || 'No se pudieron leer las minutas desde Google Drive.');
    } finally {
      setSincronizandoDrive(false);
    }
  };

  const handleDesconectarDrive = async () => {
    await desconectarGoogleDrive();
  };

  const handleArchivoMinuta = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    limpiarMensajes();
    setSubiendoArchivo(true);
    try {
      const res = await subirMinutaArchivo(file, {
        codigo: minCodigo.trim() || undefined,
        titulo: minTitulo.trim() || undefined,
        fechaReunion: minFecha || undefined,
        frente: minFrente || undefined,
        participantes: minParticipantes.trim() || undefined,
      });
      setMensajeOk(
        `Minuta ${res.minuta.codigo} cargada con ${res.compromisosExtraidos.length} compromiso(s) extraído(s).`
      );
      setMostrarAltaMinuta(false);
      setMinCodigo('');
      setMinTitulo('');
      setMinTexto('');
    } catch (err: any) {
      setErrorAccion(err?.message || 'Error cargando el archivo de minuta.');
    } finally {
      setSubiendoArchivo(false);
    }
  };

  const handleGuardarMinutaTexto = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!minTexto.trim()) {
      setErrorAccion('Pega el contenido de la minuta para poder extraer los compromisos.');
      return;
    }
    limpiarMensajes();
    setGuardandoMinuta(true);
    try {
      const res = await registrarMinutaTexto({
        codigo: minCodigo.trim() || undefined,
        titulo: minTitulo.trim() || undefined,
        fechaReunion: minFecha,
        frente: minFrente,
        participantes: minParticipantes.trim(),
        contenidoTexto: minTexto.trim(),
        extraerAutomaticamente: true,
      });
      setMensajeOk(
        `Minuta ${res.minuta.codigo} registrada con ${res.compromisosExtraidos.length} compromiso(s).`
      );
      setMostrarAltaMinuta(false);
      setMinCodigo('');
      setMinTitulo('');
      setMinTexto('');
    } catch (err: any) {
      setErrorAccion(err?.message || 'Error registrando la minuta.');
    } finally {
      setGuardandoMinuta(false);
    }
  };

  const handleCrearCompromiso = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!compDesc.trim()) {
      setErrorAccion('Ingresa la descripción del compromiso.');
      return;
    }
    limpiarMensajes();
    try {
      await agregarCompromisoMinuta({
        minutaId: compMinutaId || undefined,
        descripcion: compDesc.trim(),
        responsable: compResp.trim(),
        area: compArea.trim(),
        frente: compFrente,
        fechaLimite: compFechaLim,
        estado: compEstadoInit,
        documentosRelacionados: compDocs
          .split(',')
          .map(s => s.trim())
          .filter(Boolean),
      });
      setCompDesc('');
      setCompDocs('');
      setMostrarAltaCompromiso(false);
      setMensajeOk('Compromiso registrado en seguimiento.');
    } catch (err: any) {
      setErrorAccion(err?.message || 'No se pudo agregar el compromiso.');
    }
  };

  const toggleSeleccion = (id: string) => {
    setSeleccionados(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const seleccionarTodosIncumplidos = () => {
    const ids = compromisosMinutas
      .filter(c => esIncumplidoOVencido(c, hoyIso))
      .map(c => c.id);
    setSeleccionados(ids);
  };

  const prepararNotaPedidoDesde = (ids: string[]) => {
    if (ids.length === 0) {
      setErrorAccion('Selecciona al menos un compromiso para generar la Nota de Pedido.');
      return;
    }
    const items = compromisosMinutas.filter(c => ids.includes(c.id));
    const consecutivo = String(notasPedido.length + 1).padStart(3, '0');
    const codMinutas = Array.from(new Set(items.map(i => i.minutaCodigo))).join(', ');
    setSeleccionados(ids);
    setNpNumero(`NP-ING-${consecutivo}`);
    setNpFecha(hoyIso);
    setNpFrente(items[0]?.frente || FRENTES_OPCIONES[0]);
    setNpAsunto(
      `Intimación por incumplimiento de compromisos de ingeniería (${codMinutas})`
    );
    setSubVista('notas_pedido');
    limpiarMensajes();
  };

  const handleGenerarNotaPedido = async (e: React.FormEvent) => {
    e.preventDefault();
    if (seleccionados.length === 0) {
      setErrorAccion('Debes seleccionar al menos un compromiso incumplido.');
      return;
    }
    limpiarMensajes();
    setGenerandoNp(true);
    try {
      const nueva = await generarNotaPedido({
        compromisoIds: seleccionados,
        numeroNota: npNumero.trim() || undefined,
        fechaEmision: npFecha,
        emisor: npEmisor.trim(),
        destinatario: npDestinatario.trim(),
        frente: npFrente,
        asunto: npAsunto.trim(),
        plazoDescargoDias: Number(npPlazo) || 5,
        encuadreAdicional: npEncuadre.trim(),
      });
      setNotaActivaId(nueva.id);
      setSeleccionados([]);
      setNpEncuadre('');
      setMensajeOk(`Nota de Pedido ${nueva.numeroNota} generada e incorporada al historial.`);
    } catch (err: any) {
      setErrorAccion(err?.message || 'No se pudo generar la Nota de Pedido.');
    } finally {
      setGenerandoNp(false);
    }
  };

  const handleCopiar = (id: string, texto: string) => {
    navigator.clipboard.writeText(texto);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleAuditarMinutaEnChat = (m: MinutaReunion) => {
    const compAsociados = compromisosMinutas.filter(c => c.minutaId === m.id);
    const incumplidos = compAsociados.filter(c => esIncumplidoOVencido(c, hoyIso));
    setActiveTab('chat');
    sendChatMessage(
      `Analiza la minuta ${m.codigo} ("${m.titulo}", fecha ${m.fechaReunion}). Tiene ${compAsociados.length} compromisos registrados (${incumplidos.length} incumplidos o vencidos). Resume los desvíos críticos y genera un cuadro comparativo de cumplimiento frente al cronograma y pliego.`
    );
  };

  return (
    <div className="space-y-4">
      {/* Cabecera de módulo y navegación segmentada */}
      <div className="bento-card p-3 sm:p-5 space-y-3 sm:space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 sm:gap-4">
          <div className="flex items-start gap-2.5 sm:gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400 shrink-0">
              <ClipboardList className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-xs sm:text-sm font-bold text-white tracking-tight">
                Minutas, Compromisos y Notas de Pedido a Ingeniería
              </h2>
              <p className="text-[11px] sm:text-xs text-slate-400 mt-0.5">
                Accede a actas de reunión, controla fechas límite de compromisos y emite Notas de Pedido formales ante incumplimientos.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => ejecutarLecturaDrive()}
              disabled={sincronizandoDrive}
              className="px-3.5 py-2 rounded-xl bg-white hover:bg-slate-100 disabled:opacity-70 text-slate-900 text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0 shadow-sm"
            >
              {sincronizandoDrive ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-600" />
                  <span>Leyendo Drive...</span>
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                    <path fill="#4285F4" d="M23.745 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-8.97z" />
                    <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24z" />
                    <path fill="#FBBC05" d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14z" />
                    <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96z" />
                  </svg>
                  <span>{hasDriveToken ? 'Sincronizar Minutas de Drive' : 'Conectar y Leer Drive'}</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                setMostrarAltaCompromiso(prev => !prev);
                setMostrarAltaMinuta(false);
                limpiarMensajes();
              }}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Nuevo Compromiso</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMostrarAudioMinuta(prev => !prev);
                setMostrarAltaMinuta(false);
                setMostrarAltaCompromiso(false);
                limpiarMensajes();
              }}
              className={`px-3.5 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                mostrarAudioMinuta || recEstado !== 'inactivo'
                  ? 'bg-sky-600 border-sky-500 text-white'
                  : 'bg-sky-600/15 hover:bg-sky-600/25 border-sky-500/40 text-sky-300'
              }`}
              title="Grabar reunión o subir audio largo con Groq Whisper"
            >
              <Mic className="w-3.5 h-3.5" />
              <span>
                {recEstado !== 'inactivo'
                  ? `REC ${formatearCronometro(recSegundos)}`
                  : 'Grabar / Audio'}
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMostrarAltaMinuta(prev => !prev);
                setMostrarAudioMinuta(false);
                setMostrarAltaCompromiso(false);
                limpiarMensajes();
              }}
              className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              title="Carga manual alternativa"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Carga Manual</span>
            </button>
            {resumenConteos.incumplidos > 0 && (
              <button
                type="button"
                onClick={() => {
                  const ids = seleccionados.length > 0
                    ? seleccionados
                    : compromisosMinutas.filter(c => esIncumplidoOVencido(c, hoyIso)).map(c => c.id);
                  prepararNotaPedidoDesde(ids);
                }}
                className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <FileWarning className="w-3.5 h-3.5" />
                <span>
                  {seleccionados.length > 0
                    ? `Nota de Pedido (${seleccionados.length})`
                    : `Emitir NP (${resumenConteos.incumplidos} incumplidos)`}
                </span>
              </button>
            )}
          </div>
        </div>

        {/* Barra de origen Google Drive */}
        <div className="pt-3 border-t border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-3 text-xs">
          <div className="flex flex-1 flex-wrap items-center gap-2 min-w-0">
            <label className="text-[11px] font-semibold text-slate-400 whitespace-nowrap">
              Carpeta / Link Google Drive:
            </label>
            <input
              type="text"
              value={driveFolderInput}
              onChange={e => setDriveFolderInput(e.target.value)}
              placeholder={DEFAULT_DRIVE_ROOT_FOLDER_ID}
              className="w-full sm:w-auto sm:flex-1 sm:min-w-[220px] sm:max-w-md bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-[11px] text-slate-200 font-mono focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
            <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={buscarTodoDrive}
                onChange={e => setBuscarTodoDrive(e.target.checked)}
                className="rounded border-slate-600 bg-slate-950"
              />
              <span>Buscar también en todo mi Drive</span>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400 shrink-0">
            {driveConnectionState.accountEmail && (
              <span className="text-emerald-300 font-mono">
                {driveConnectionState.accountEmail}
                {driveConnectionState.remainingMinutes > 0 ? ` (${driveConnectionState.remainingMinutes}m)` : ''}
              </span>
            )}
            {hasDriveToken && (
              <button
                type="button"
                onClick={() => void ejecutarLecturaDrive(undefined, true)}
                disabled={sincronizandoDrive}
                className="text-sky-300 hover:text-sky-200 underline cursor-pointer"
                title="Cambiar de cuenta o renovar permiso de Google Drive"
              >
                Reautorizar
              </button>
            )}
            {hasDriveToken && (
              <button
                type="button"
                onClick={handleDesconectarDrive}
                className="text-slate-400 hover:text-slate-200 inline-flex items-center gap-1 cursor-pointer"
              >
                <LogOut className="w-3 h-3" />
                <span>Desconectar</span>
              </button>
            )}
            {ultimoScanDrive && (
              <span className="font-mono tabular-nums text-sky-300">
                {ultimoScanDrive.carpetasEscaneadas} carpetas · {ultimoScanDrive.archivosDetectados} minutas detectadas
              </span>
            )}
          </div>
        </div>

        {/* Métricas planas y pestañas internas */}
        <div className="pt-3 border-t border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400 font-mono tabular-nums">
            <span>
              <strong className="text-white">{minutas.length}</strong> minutas
            </span>
            <span aria-hidden="true">·</span>
            <span>
              <strong className="text-white">{resumenConteos.total}</strong> compromisos
            </span>
            <span aria-hidden="true">·</span>
            <span>
              <strong className="text-rose-400">{resumenConteos.incumplidos}</strong> incumplidos / vencidos
            </span>
            <span aria-hidden="true">·</span>
            <span>
              <strong className="text-emerald-400">{resumenConteos.cumplidos}</strong> cumplidos
            </span>
            <span aria-hidden="true">·</span>
            <span>
              <strong className="text-sky-400">{notasPedido.length}</strong> notas de pedido
            </span>
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-950 border border-slate-800 rounded-xl max-w-full overflow-x-auto flex-nowrap no-scrollbar self-start md:self-auto">
            <button
              type="button"
              onClick={() => setSubVista('compromisos')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                subVista === 'compromisos'
                  ? 'bg-sky-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Compromisos ({resumenConteos.total})
            </button>
            <button
              type="button"
              onClick={() => setSubVista('minutas')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                subVista === 'minutas'
                  ? 'bg-sky-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Minutas ({minutas.length})
            </button>
            <button
              type="button"
              onClick={() => setSubVista('notas_pedido')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                subVista === 'notas_pedido'
                  ? 'bg-rose-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Notas de Pedido ({notasPedido.length})
            </button>
          </div>
        </div>
      </div>

      {/* Alertas de operación */}
      {errorAccion && (
        <div className="bento-card p-3.5 border-rose-500/40 bg-rose-950/30 text-xs text-rose-200 flex flex-col gap-2">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span>{errorAccion}</span>
          </div>
          {(esErrorPopupBloqueado(errorAccion) ||
            errorAccion.toLowerCase().includes('drive') ||
            errorAccion.toLowerCase().includes('permiso') ||
            errorAccion.toLowerCase().includes('expir')) && (
            <div className="flex flex-wrap items-center gap-2">
              {esErrorPopupBloqueado(errorAccion) && (
                <a
                  href={typeof window !== 'undefined' ? window.location.href : '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-bold"
                >
                  <ExternalLink className="w-3 h-3" />
                  <span>Abrir en pestaña nueva y reintentar</span>
                </a>
              )}
              <button
                type="button"
                onClick={() => void ejecutarLecturaDrive(undefined, true)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 text-[11px] font-semibold cursor-pointer"
              >
                <span>Reautorizar Google Drive</span>
              </button>
            </div>
          )}
        </div>
      )}
      {mensajeOk && (
        <div className="bento-card p-3.5 border-emerald-500/40 bg-emerald-950/25 text-xs text-emerald-200 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{mensajeOk}</span>
        </div>
      )}

      {/* Estudio desplegable: Grabar Reunión o Subir Audio Largo -> Transcribir con Groq + Armar Minuta Modelo */}
      {mostrarAudioMinuta && (
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
      )}

      {/* Formulario desplegable: Cargar Minuta (Archivo o Texto) */}
      {mostrarAltaMinuta && (
        <div className="bento-card p-3.5 sm:p-5 space-y-4 border-sky-500/30">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-800">
            <div>
              <h3 className="text-xs font-bold text-white">
                Registrar Minuta de Reunión y Extraer Compromisos
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Sube el acta en PDF / Word (.docx) / TXT o pega el texto completo. Los compromisos, responsables y fechas límite se extraerán automáticamente.
              </p>
            </div>
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                onChange={handleArchivoMinuta}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={subiendoArchivo}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-xs font-bold flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0"
              >
                {subiendoArchivo ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Analizando archivo...</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-3.5 h-3.5" />
                    <span>Subir PDF / Word / TXT</span>
                  </>
                )}
              </button>
            </div>
          </div>

          <form onSubmit={handleGuardarMinutaTexto} className="space-y-3 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Código Minuta / Nota
                </label>
                <input
                  type="text"
                  value={minCodigo}
                  onChange={e => setMinCodigo(e.target.value)}
                  placeholder="Ej: MIN-ING-018 o COMCT2-TU1-00018"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Fecha de Reunión
                </label>
                <input
                  type="date"
                  value={minFecha}
                  onChange={e => setMinFecha(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Frente de Obra
                </label>
                <select
                  value={minFrente}
                  onChange={e => setMinFrente(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-sky-500"
                >
                  {FRENTES_OPCIONES.map(f => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Título / Tema Principal
                </label>
                <input
                  type="text"
                  value={minTitulo}
                  onChange={e => setMinTitulo(e.target.value)}
                  placeholder="Ej: Revisión Ingeniería Ejecutiva ET VQ"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                Participantes / Áreas
              </label>
              <input
                type="text"
                value={minParticipantes}
                onChange={e => setMinParticipantes(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                Contenido de la Minuta (o sube el archivo arriba)
              </label>
              <textarea
                rows={5}
                value={minTexto}
                onChange={e => setMinTexto(e.target.value)}
                placeholder="Pega aquí los puntos tratados y compromisos asumidos (ej: 1. Ingeniería se compromete a entregar plano ET-VQ-OC-PL-500 rev B antes del 05/11/2026...)"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setMostrarAltaMinuta(false)}
                className="px-3.5 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={guardandoMinuta}
                className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-60 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                {guardandoMinuta ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Extrayendo compromisos...</span>
                  </>
                ) : (
                  <span>Guardar y Extraer Compromisos</span>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Formulario desplegable: Nuevo Compromiso Puntual */}
      {mostrarAltaCompromiso && (
        <form onSubmit={handleCrearCompromiso} className="bento-card p-3.5 sm:p-5 space-y-3 border-slate-700 text-xs">
          <div className="pb-2 border-b border-slate-800">
            <h3 className="text-xs font-bold text-white">Registrar Compromiso de Minuta</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">Minuta Vinculada</label>
              <select
                value={compMinutaId}
                onChange={e => setCompMinutaId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
              >
                <option value="">Registro directo (sin minuta previa)</option>
                {minutas.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.codigo} · {m.fechaReunion}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">Responsable</label>
              <input
                type="text"
                value={compResp}
                onChange={e => setCompResp(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">Frente</label>
              <select
                value={compFrente}
                onChange={e => setCompFrente(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
              >
                {FRENTES_OPCIONES.map(f => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">Fecha Límite</label>
              <input
                type="date"
                value={compFechaLim}
                onChange={e => setCompFechaLim(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">Descripción del Compromiso</label>
              <input
                type="text"
                value={compDesc}
                onChange={e => setCompDesc(e.target.value)}
                placeholder="Ej: Entregar memoria de cálculo de fundaciones y planos de pórticos 132 kV revisados"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">Estado Inicial</label>
              <select
                value={compEstadoInit}
                onChange={e => setCompEstadoInit(e.target.value as EstadoCompromiso)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
              >
                <option value="INCUMPLIDO">Incumplido</option>
                <option value="PENDIENTE">Pendiente</option>
                <option value="EN_CURSO">En Curso</option>
                <option value="CUMPLIDO">Cumplido</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">Área / Especialidad</label>
              <input
                type="text"
                value={compArea}
                onChange={e => setCompArea(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">Planos / Documentos asociados (separados por coma)</label>
              <input
                type="text"
                value={compDocs}
                onChange={e => setCompDocs(e.target.value)}
                placeholder="Ej: ET-VQ-OC-PL-500, ET-VQ-OEM-PL-300"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setMostrarAltaCompromiso(false)}
              className="px-3.5 py-2 rounded-xl bg-slate-800 text-slate-300 font-semibold hover:bg-slate-700 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold cursor-pointer"
            >
              Guardar Compromiso
            </button>
          </div>
        </form>
      )}

      {/* Barra de filtros compartida para Compromisos y Minutas */}
      {subVista !== 'notas_pedido' && (
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
      )}

      {/* SUBVISTA 1: MATRIZ DE COMPROMISOS */}
      {subVista === 'compromisos' && (
        <div className="space-y-3">
          {compromisosFiltrados.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={seleccionarTodosIncumplidos}
                  className="text-rose-300 hover:text-rose-200 font-semibold cursor-pointer"
                >
                  Seleccionar todos los incumplidos ({resumenConteos.incumplidos})
                </button>
                {seleccionados.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSeleccionados([])}
                    className="text-slate-400 hover:text-slate-200 cursor-pointer"
                  >
                    Limpiar selección ({seleccionados.length})
                  </button>
                )}
              </div>
              {seleccionados.length > 0 && (
                <button
                  type="button"
                  onClick={() => prepararNotaPedidoDesde(seleccionados)}
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
                  {compromisosMinutas.length === 0
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
                  onClick={() => ejecutarLecturaDrive()}
                  disabled={sincronizandoDrive}
                  className="px-4 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-900 text-xs font-bold cursor-pointer inline-flex items-center gap-2"
                >
                  <FolderSync className="w-3.5 h-3.5 text-sky-600" />
                  <span>{sincronizandoDrive ? 'Leyendo Google Drive...' : 'Leer Minutas desde Drive'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMostrarAltaCompromiso(true)}
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
                            onChange={() => toggleSeleccion(comp.id)}
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
                            onClick={() => actualizarCompromisoMinuta(comp.id, { estado: 'CUMPLIDO' })}
                            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-emerald-600/20 border border-slate-700 text-emerald-300 text-[11px] font-semibold cursor-pointer"
                          >
                            Cumplir
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => actualizarCompromisoMinuta(comp.id, { estado: 'INCUMPLIDO' })}
                            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-rose-600/20 border border-slate-700 text-slate-300 text-[11px] font-semibold cursor-pointer"
                          >
                            Reabrir
                          </button>
                        )}
                        {comp.estado !== 'CUMPLIDO' && (
                          <button
                            type="button"
                            onClick={() => prepararNotaPedidoDesde([comp.id])}
                            className="px-2.5 py-1 rounded-lg bg-rose-600/20 hover:bg-rose-600/35 border border-rose-500/40 text-rose-200 text-[11px] font-bold cursor-pointer"
                          >
                            Nota de Pedido
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => eliminarCompromisoMinuta(comp.id)}
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
                              onChange={() => toggleSeleccion(comp.id)}
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
                                  onClick={() => actualizarCompromisoMinuta(comp.id, { estado: 'CUMPLIDO' })}
                                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-emerald-600/20 border border-slate-700 text-emerald-300 text-[11px] font-semibold cursor-pointer"
                                  title="Marcar compromiso como cumplido"
                                >
                                  Cumplir
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => actualizarCompromisoMinuta(comp.id, { estado: 'INCUMPLIDO' })}
                                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-rose-600/20 border border-slate-700 text-slate-300 text-[11px] font-semibold cursor-pointer"
                                >
                                  Reabrir
                                </button>
                              )}
                              {comp.estado !== 'CUMPLIDO' && (
                                <button
                                  type="button"
                                  onClick={() => prepararNotaPedidoDesde([comp.id])}
                                  className="px-2.5 py-1 rounded-lg bg-rose-600/20 hover:bg-rose-600/35 border border-rose-500/40 text-rose-200 text-[11px] font-bold cursor-pointer"
                                >
                                  Nota de Pedido
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => eliminarCompromisoMinuta(comp.id)}
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
      )}

      {/* SUBVISTA 2: ARCHIVO DE MINUTAS */}
      {subVista === 'minutas' && (
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
                onClick={() => setMostrarAltaMinuta(true)}
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
                        onClick={() => handleAuditarMinutaEnChat(m)}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-sky-300 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        <span>Auditar en Chat</span>
                      </button>
                      {incumplidos.length > 0 && (
                        <button
                          type="button"
                          onClick={() => prepararNotaPedidoDesde(incumplidos.map(c => c.id))}
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
                        onClick={() => eliminarMinuta(m.id)}
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
                              onClick={() => handleCopiar(m.id, m.contenidoTexto)}
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
      )}

      {/* SUBVISTA 3: GENERADOR E HISTORIAL DE NOTAS DE PEDIDO */}
      {subVista === 'notas_pedido' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          {/* Columna Generador */}
          <form onSubmit={handleGenerarNotaPedido} className="lg:col-span-5 bento-card p-3.5 sm:p-5 space-y-3.5 text-xs">
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
                  onClick={seleccionarTodosIncumplidos}
                  className="text-[11px] text-rose-300 hover:text-rose-200 font-semibold cursor-pointer"
                >
                  Cargar incumplidos ({resumenConteos.incumplidos})
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
                          onChange={() => toggleSeleccion(c.id)}
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
                      onClick={() => handleCopiar(notaVisualizada.id, notaVisualizada.contenidoMarkdown)}
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
                      onClick={() => eliminarNotaPedido(notaVisualizada.id)}
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
      )}
    </div>
  );
};
