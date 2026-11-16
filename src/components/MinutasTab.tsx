import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { CompromisoMinuta, EstadoCompromiso, MinutaReunion, NotaPedidoIngenieria } from '../types';
import { MarkdownRenderer } from './MarkdownRenderer';
import { descargarMarkdownComoWord } from '../utils/exportWord';
import {
  DEFAULT_DRIVE_ROOT_FOLDER_ID,
  GoogleDriveAuthState,
  extraerDriveFolderId,
  getGoogleDriveAccessToken,
  signInWithGoogleDrive,
  signOutGoogleDrive,
  subscribeGoogleAuthState,
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
    registrarMinutaTexto,
    eliminarMinuta,
    agregarCompromisoMinuta,
    actualizarCompromisoMinuta,
    eliminarCompromisoMinuta,
    generarNotaPedido,
    eliminarNotaPedido,
    setActiveTab,
    sendChatMessage,
  } = useApp();

  const hoyIso = new Date().toISOString().split('T')[0];

  const [subVista, setSubVista] = useState<SubVistaMinutas>('compromisos');
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>('TODOS');
  const [filtroFrente, setFiltroFrente] = useState<string>('TODOS');
  const [seleccionados, setSeleccionados] = useState<string[]>([]);

  // Google Drive sync
  const [driveAuth, setDriveAuth] = useState<GoogleDriveAuthState>({
    isSignedIn: false,
    hasDriveToken: false,
    email: null,
    displayName: null,
  });
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

  useEffect(() => {
    const unsub = subscribeGoogleAuthState(setDriveAuth);
    return () => unsub();
  }, []);

  // Paneles de alta
  const [mostrarAltaMinuta, setMostrarAltaMinuta] = useState(false);
  const [mostrarAltaCompromiso, setMostrarAltaCompromiso] = useState(false);
  const [subiendoArchivo, setSubiendoArchivo] = useState(false);
  const [guardandoMinuta, setGuardandoMinuta] = useState(false);
  const [errorAccion, setErrorAccion] = useState<string | null>(null);
  const [mensajeOk, setMensajeOk] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const ejecutarLecturaDrive = async (tokenOverride?: string) => {
    limpiarMensajes();
    setSincronizandoDrive(true);
    try {
      let token = tokenOverride || getGoogleDriveAccessToken();
      if (!token) {
        const authRes = await signInWithGoogleDrive();
        token = authRes.accessToken;
        setDriveAuth({
          isSignedIn: true,
          hasDriveToken: true,
          email: authRes.user.email || null,
          displayName: authRes.user.displayName || null,
        });
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
    await signOutGoogleDrive();
    setDriveAuth({
      isSignedIn: false,
      hasDriveToken: false,
      email: null,
      displayName: null,
    });
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
      <div className="bento-card p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400 shrink-0">
              <ClipboardList className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white tracking-tight">
                Minutas, Compromisos y Notas de Pedido a Ingeniería
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
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
                  <span>{driveAuth.hasDriveToken ? 'Sincronizar Minutas de Drive' : 'Conectar y Leer Drive'}</span>
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
                setMostrarAltaMinuta(prev => !prev);
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
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <label className="text-[11px] font-semibold text-slate-400 whitespace-nowrap">
              Carpeta / Link Google Drive:
            </label>
            <input
              type="text"
              value={driveFolderInput}
              onChange={e => setDriveFolderInput(e.target.value)}
              placeholder={DEFAULT_DRIVE_ROOT_FOLDER_ID}
              className="flex-1 min-w-[220px] max-w-md bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-[11px] text-slate-200 font-mono focus:outline-none focus:ring-1 focus:ring-sky-500"
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
            {driveAuth.email && (
              <span className="text-slate-300 font-mono">{driveAuth.email}</span>
            )}
            {driveAuth.isSignedIn && (
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

          <div className="flex items-center gap-1 p-1 bg-slate-950 border border-slate-800 rounded-xl self-start md:self-auto">
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
        <div className="bento-card p-3.5 border-rose-500/40 bg-rose-950/30 text-xs text-rose-200 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{errorAccion}</span>
        </div>
      )}
      {mensajeOk && (
        <div className="bento-card p-3.5 border-emerald-500/40 bg-emerald-950/25 text-xs text-emerald-200 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{mensajeOk}</span>
        </div>
      )}

      {/* Formulario desplegable: Cargar Minuta (Archivo o Texto) */}
      {mostrarAltaMinuta && (
        <div className="bento-card p-5 space-y-4 border-sky-500/30">
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
        <form onSubmit={handleCrearCompromiso} className="bento-card p-5 space-y-3 border-slate-700 text-xs">
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
              className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none"
            >
              <option value="TODOS">Todos los frentes</option>
              {FRENTES_OPCIONES.map(f => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>

            {subVista === 'compromisos' && (
              <div className="flex items-center gap-1 p-1 bg-slate-950 border border-slate-800 rounded-xl">
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
              <div className="overflow-x-auto">
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
                <div key={m.id} className="bento-card p-5 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="space-y-1">
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
                        <span className="font-sans truncate max-w-sm text-sky-300/90">{m.driveRuta}</span>
                      </>
                    )}
                    {m.nombreArchivo && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-sans truncate max-w-xs">{m.nombreArchivo}</span>
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
                      <div className="text-xs font-semibold text-slate-300">Contenido íntegro de la minuta</div>
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
          <form onSubmit={handleGenerarNotaPedido} className="lg:col-span-5 bento-card p-5 space-y-3.5 text-xs">
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
              <div className="bento-card p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800">
                  <div>
                    <div className="text-xs font-mono font-bold text-rose-300">
                      {notaVisualizada.numeroNota} · {notaVisualizada.fechaEmision}
                    </div>
                    <h4 className="text-sm font-bold text-white">{notaVisualizada.asunto}</h4>
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
