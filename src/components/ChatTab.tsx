import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useApp, SubidaProgresoInfo } from '../context/AppContext';
import type {
  ActorNotaLibro,
  EstadoRespuestaNota,
  NotaLibro,
  PoliticaLimiteModelo,
  PrecisionNivelId,
} from '../types';
import { MarkdownRenderer } from './MarkdownRenderer';
import { descargarMarkdownComoWord } from '../utils/exportWord';
import {
  DEFAULT_DRIVE_ROOT_FOLDER_ID,
  esErrorPopupBloqueado,
  extraerDriveFolderId,
} from '../utils/googleAuth';
import {
  BOOTSTRAP_ADMIN_EMAIL,
  type WorkspaceInviteRecord,
} from '../utils/firestoreSync';
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
  RefreshCw,
  FolderOpen,
  Users,
  MessageSquareText,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Upload,
  Pencil,
  SlidersHorizontal,
  RotateCcw,
  LogOut,
  ShieldCheck,
  Clock,
  FilePenLine,
  Activity,
} from 'lucide-react';

type FiltroLibro = 'TODAS' | 'CRITICAS' | 'TRANSNOA' | 'UTE' | 'SIN_RESPUESTA' | 'CON_DISCREPANCIA';
const ACTORES_LIBRO: ActorNotaLibro[] = [
  'UTE / Contratista',
  'TRANSNOA',
  'Inspección',
  'Comitente',
  'Proyectista',
  'Otro',
];

function calcularDiasSinRespuestaNota(n: NotaLibro): number | null {
  if (n.estadoRespuesta !== 'SIN_RESPUESTA' && n.estadoRespuesta !== 'CON_DISCREPANCIA') {
    return null;
  }
  const f = String(n.fecha || '').trim();
  let ms: number | null = null;
  const iso = f.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    ms = Date.parse(`${iso[1]}-${iso[2]}-${iso[3]}T00:00:00Z`);
  } else {
    const lat = f.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (lat) ms = Date.parse(`${lat[3]}-${lat[2]}-${lat[1]}T00:00:00Z`);
  }
  if (!ms || !Number.isFinite(ms)) return null;
  const dias = Math.floor((Date.now() - ms) / (1000 * 60 * 60 * 24));
  return dias >= 0 ? dias : null;
}
const ESTADOS_LIBRO: EstadoRespuestaNota[] = [
  'SIN_RESPUESTA',
  'CONTESTADA',
  'PARCIALMENTE_CONTESTADA',
  'CON_DISCREPANCIA',
  'INFORMATIVA',
];

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
    notasLibro,
    archivosPendientesNotasLibro,
    escaneoTruncadoNotasLibro,
    driveDocsCount,
    hasDriveToken,
    driveFolderId,
    setDriveFolderId,
    driveConnectionState,
    ultimaSyncDrive,
    verificarConexionDriveLive,
    conectarGoogleDriveChat,
    desconectarGoogleDrive,
    sincronizarDocsTecnicosDrive,
    sincronizarNotasLibroDrive,
    subirNotaLibroArchivo,
    actualizarNotaLibro,
    eliminarNotaLibro,
    planos,
    hitos,
    interferencias,
    setIsPliegosModalOpen,
    setActiveTab,
    precisionNivel,
    setPrecisionNivel,
    geminiPrecisionState,
    esUsuarioMaestro,
    modelosPagosHabilitados,
    puedeUsarModelosPagos,
    usuariosPagosAutorizados,
    limitesPorUsuarioUsd,
    toggleModelosPagosMaestro,
    actualizarControlMaestroIA,
    listarInvitacionesNube,
    cloudRole,
    cloudSyncStatus,
    guardarConfigPrecision,
    resetearUsoGemini,
  } = useApp();

  const [inputText, setInputText] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [subiendoPdf, setSubiendoPdf] = useState(false);
  const [progresoPdf, setProgresoPdf] = useState<SubidaProgresoInfo | null>(null);
  const [errorPdf, setErrorPdf] = useState<string | null>(null);
  const [arrastrando, setArrastrando] = useState(false);
  const [conectandoDrive, setConectandoDrive] = useState(false);
  const [mostrarExploradorDrive, setMostrarExploradorDrive] = useState(false);
  const [sincronizandoDocsDrive, setSincronizandoDocsDrive] = useState(false);
  const [avisoDocsDrive, setAvisoDocsDrive] = useState<{
    tipo: 'ok' | 'error';
    texto: string;
    popupBloqueado?: boolean;
  } | null>(null);
  const [mostrarPanelLimites, setMostrarPanelLimites] = useState(false);
  const [mostrarUsuariosPagosMaestro, setMostrarUsuariosPagosMaestro] = useState(false);
  const [invitacionesMaestro, setInvitacionesMaestro] = useState<WorkspaceInviteRecord[]>([]);
  const [nuevoEmailPagoMaestro, setNuevoEmailPagoMaestro] = useState('');
  const [limitesUsuarioDraftChat, setLimitesUsuarioDraftChat] = useState<Record<string, string>>({});
  const [guardandoLimites, setGuardandoLimites] = useState(false);
  const [cambiandoMaster, setCambiandoMaster] = useState(false);
  const [avisoLimites, setAvisoLimites] = useState<string | null>(null);
  const [politicaDraft, setPoliticaDraft] = useState<PoliticaLimiteModelo>('bloquear');
  const [openRouterModeloDraft, setOpenRouterModeloDraft] = useState<string>('openrouter/free');
  const [limitesDraft, setLimitesDraft] = useState<
    Record<string, { maxConsultasDiarias: string; maxCostoUsdDiario: string }>
  >({});

  // Estado Libro de Comunicaciones / Notas de Libro
  const [mostrarLibro, setMostrarLibro] = useState(false);
  const [filtroLibro, setFiltroLibro] = useState<FiltroLibro>('TODAS');
  const [sincronizandoLibro, setSincronizandoLibro] = useState(false);
  const [subiendoNotaLibro, setSubiendoNotaLibro] = useState(false);
  const [avisoLibro, setAvisoLibro] = useState<{
    tipo: 'ok' | 'error';
    texto: string;
    popupBloqueado?: boolean;
  } | null>(null);
  const folderIdLibro = driveFolderId;
  const [editingNotaId, setEditingNotaId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{
    actorEmisor: ActorNotaLibro;
    actorReceptor: ActorNotaLibro;
    estadoRespuesta: EstadoRespuestaNota;
  } | null>(null);

  useEffect(() => {
    if (!geminiPrecisionState) return;
    setPoliticaDraft(geminiPrecisionState.politicaLimite);
    if (geminiPrecisionState.openRouterModeloPreferido) {
      setOpenRouterModeloDraft(geminiPrecisionState.openRouterModeloPreferido);
    }
    const next: Record<string, { maxConsultasDiarias: string; maxCostoUsdDiario: string }> = {};
    for (const m of geminiPrecisionState.modelos) {
      next[m.modelo] = {
        maxConsultasDiarias: String(m.maxConsultasDiarias),
        maxCostoUsdDiario: String(m.maxCostoUsdDiario),
      };
    }
    setLimitesDraft(next);
  }, [geminiPrecisionState]);

  useEffect(() => {
    const nextUserLimits: Record<string, string> = {};
    for (const [k, v] of Object.entries(limitesPorUsuarioUsd || {})) {
      nextUserLimits[k.toLowerCase().trim()] = String(v);
    }
    setLimitesUsuarioDraftChat(nextUserLimits);
  }, [limitesPorUsuarioUsd]);

  useEffect(() => {
    if (!esUsuarioMaestro || cloudRole !== 'admin' || cloudSyncStatus !== 'sincronizado') return;
    if (!mostrarUsuariosPagosMaestro) return;
    let cancelado = false;
    void listarInvitacionesNube()
      .then(lista => {
        if (!cancelado) setInvitacionesMaestro(lista);
      })
      .catch(() => {
        // Silencioso si falla carga temporal
      });
    return () => {
      cancelado = true;
    };
  }, [esUsuarioMaestro, cloudRole, cloudSyncStatus, mostrarUsuariosPagosMaestro, listarInvitacionesNube]);

  const handleSeleccionarNivelPrecision = async (nivel: PrecisionNivelId) => {
    const nivelEfectivo: PrecisionNivelId = puedeUsarModelosPagos ? nivel : 'gratuito';
    setPrecisionNivel(nivelEfectivo);
    try {
      await guardarConfigPrecision({ nivelPreferido: nivelEfectivo });
    } catch {
      // Mantiene selección local en caso de fallo transitorio
    }
  };

  const handleToggleMasterPagos = async () => {
    if (!esUsuarioMaestro || cambiandoMaster) return;
    setCambiandoMaster(true);
    setAvisoLimites(null);
    try {
      await toggleModelosPagosMaestro(!modelosPagosHabilitados);
    } catch (e: any) {
      setAvisoLimites(e?.message || 'No se pudo cambiar el control maestro.');
    } finally {
      setCambiandoMaster(false);
    }
  };

  const handleToggleUsuarioPagoChat = async (emailRaw: string) => {
    const emailNorm = emailRaw.trim().toLowerCase();
    if (!esUsuarioMaestro || cambiandoMaster || !emailNorm) return;
    setCambiandoMaster(true);
    setAvisoLimites(null);
    try {
      const yaTiene = usuariosPagosAutorizados.includes(emailNorm);
      const nextUsers = yaTiene
        ? usuariosPagosAutorizados.filter(u => u !== emailNorm)
        : [...usuariosPagosAutorizados, emailNorm];
      const nextGlobal = yaTiene ? modelosPagosHabilitados : true;
      await actualizarControlMaestroIA({
        modelosPagosHabilitados: nextGlobal,
        usuariosPagosAutorizados: nextUsers,
      });
    } catch (e: any) {
      setAvisoLimites(e?.message || 'No se pudo actualizar permiso del usuario.');
    } finally {
      setCambiandoMaster(false);
    }
  };

  const handleAgregarEmailPagoChat = async () => {
    const emailNorm = nuevoEmailPagoMaestro.trim().toLowerCase();
    if (!esUsuarioMaestro || cambiandoMaster) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNorm)) {
      setAvisoLimites('Ingresa un correo electrónico válido.');
      return;
    }
    if (usuariosPagosAutorizados.includes(emailNorm)) {
      setNuevoEmailPagoMaestro('');
      return;
    }
    setCambiandoMaster(true);
    setAvisoLimites(null);
    try {
      await actualizarControlMaestroIA({
        modelosPagosHabilitados: true,
        usuariosPagosAutorizados: [...usuariosPagosAutorizados, emailNorm],
      });
      setNuevoEmailPagoMaestro('');
    } catch (e: any) {
      setAvisoLimites(e?.message || 'No se pudo agregar el correo.');
    } finally {
      setCambiandoMaster(false);
    }
  };

  const handleGuardarTopesUsuarioChat = async () => {
    if (!esUsuarioMaestro || cambiandoMaster) return;
    setCambiandoMaster(true);
    setAvisoLimites(null);
    try {
      const nextLimits: Record<string, number> = {};
      for (const [emailKey, rawVal] of Object.entries(limitesUsuarioDraftChat)) {
        const clean = emailKey.trim().toLowerCase();
        const num = Number(rawVal);
        if (clean.includes('@') && Number.isFinite(num) && num > 0) {
          nextLimits[clean] = Number(num.toFixed(2));
        }
      }
      await actualizarControlMaestroIA({ limitesPorUsuarioUsd: nextLimits });
      setAvisoLimites('Topes USD por usuario guardados.');
      setTimeout(() => setAvisoLimites(null), 2600);
    } catch (e: any) {
      setAvisoLimites(e?.message || 'Error guardando topes USD por usuario.');
    } finally {
      setCambiandoMaster(false);
    }
  };

  const handleFijarModeloOpenRouterSalud = async (modeloId: string) => {
    if (!modeloId) return;
    setGuardandoLimites(true);
    setAvisoLimites(null);
    try {
      setOpenRouterModeloDraft(modeloId);
      await guardarConfigPrecision({ openRouterModeloPreferido: modeloId });
      setAvisoLimites(`Modelo gratuito fijado: ${modeloId}`);
      setTimeout(() => setAvisoLimites(null), 2600);
    } catch (e: any) {
      setAvisoLimites(e?.message || 'No se pudo fijar el modelo gratuito.');
    } finally {
      setGuardandoLimites(false);
    }
  };

  const handleGuardarLimitesPrecision = async () => {
    setGuardandoLimites(true);
    setAvisoLimites(null);
    try {
      const payloadLimites: Record<
        string,
        { maxConsultasDiarias?: number; maxCostoUsdDiario?: number }
      > = {};
      for (const [modelo, vals] of Object.entries(limitesDraft)) {
        const q = Number(vals.maxConsultasDiarias);
        const usd = Number(vals.maxCostoUsdDiario);
        payloadLimites[modelo] = {
          maxConsultasDiarias: Number.isFinite(q) && q >= 0 ? Math.round(q) : 0,
          maxCostoUsdDiario: Number.isFinite(usd) && usd >= 0 ? Number(usd.toFixed(4)) : 0,
        };
      }
      await guardarConfigPrecision({
        nivelPreferido: precisionNivel,
        politicaLimite: politicaDraft,
        openRouterModeloPreferido: openRouterModeloDraft,
        limitesPorModelo: payloadLimites,
      });
      setAvisoLimites('Límites y costos por modelo guardados.');
      setTimeout(() => setAvisoLimites(null), 2600);
    } catch (e: any) {
      setAvisoLimites(e?.message || 'Error guardando límites.');
    } finally {
      setGuardandoLimites(false);
    }
  };

  const handleResetContadoresHoy = async () => {
    setGuardandoLimites(true);
    setAvisoLimites(null);
    try {
      await resetearUsoGemini();
      setAvisoLimites('Contadores de consultas y costo de hoy reiniciados a 0.');
      setTimeout(() => setAvisoLimites(null), 2600);
    } catch (e: any) {
      setAvisoLimites(e?.message || 'No se pudieron reiniciar los contadores.');
    } finally {
      setGuardandoLimites(false);
    }
  };
  const [savingNotaId, setSavingNotaId] = useState<string | null>(null);
  const [progresoLibro, setProgresoLibro] = useState<string | null>(null);

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const notaLibroInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const cancelarSyncLibroRef = useRef(false);

  const handleFolderIdLibroChange = (val: string) => {
    setDriveFolderId(val);
  };

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const nextHeight = Math.min(200, Math.max(46, el.scrollHeight));
    el.style.height = `${nextHeight}px`;
  }, [inputText]);

  const abrirEdicionNota = (n: NotaLibro) => {
    if (editingNotaId === n.id) {
      setEditingNotaId(null);
      setEditDraft(null);
      return;
    }
    setEditingNotaId(n.id);
    setEditDraft({
      actorEmisor: n.actorEmisor,
      actorReceptor: n.actorReceptor,
      estadoRespuesta: n.estadoRespuesta,
    });
  };

  const guardarEdicionNota = async (id: string) => {
    if (!editDraft) return;
    setSavingNotaId(id);
    try {
      await actualizarNotaLibro(id, editDraft);
      setEditingNotaId(null);
      setEditDraft(null);
      setAvisoLibro({
        tipo: 'ok',
        texto: 'Nota de libro actualizada manualmente (respetada en futuras sincronizaciones).',
      });
    } catch (err: any) {
      setAvisoLibro({
        tipo: 'error',
        texto: err?.message || 'Error guardando edición de nota.',
      });
    } finally {
      setSavingNotaId(null);
    }
  };

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

  const handleSyncDocsTecnicosDrive = async () => {
    setAvisoDocsDrive(null);
    setSincronizandoDocsDrive(true);
    try {
      const folderId = extraerDriveFolderId(folderIdLibro);
      const res = await sincronizarDocsTecnicosDrive({ folderId, maxNuevos: 15 });
      setAvisoDocsDrive({
        tipo: 'ok',
        texto:
          `Docs técnicos / Memorias Drive listos: ${res.totalIndexados} indexado(s) en caché ` +
          `(${res.nuevos} nuevo(s)${res.nombresNuevos.length > 0 ? `: ${res.nombresNuevos.slice(0, 4).join(', ')}` : ''}). ` +
          `El Chat también buscará en vivo dentro de tu Drive mientras la sesión siga conectada.`,
      });
    } catch (err: any) {
      setAvisoDocsDrive({
        tipo: 'error',
        texto: err?.message || 'No se pudieron indexar los documentos técnicos desde Drive.',
        popupBloqueado: esErrorPopupBloqueado(err),
      });
    } finally {
      setSincronizandoDocsDrive(false);
    }
  };

  const handleConectarDriveParaChat = async (forceConsent = false) => {
    setAvisoDocsDrive(null);
    setConectandoDrive(true);
    try {
      const ok = await conectarGoogleDriveChat({ forceConsent });
      if (ok) {
        setAvisoDocsDrive({
          tipo: 'ok',
          texto: 'Google Drive conectado y verificado para búsquedas en vivo (Memorias Descriptivas, Estudios de Suelos, Minutas y Notas).',
        });
      }
    } catch (err: any) {
      setAvisoDocsDrive({
        tipo: 'error',
        texto: err?.message || 'No se pudo conectar Google Drive.',
        popupBloqueado: esErrorPopupBloqueado(err),
      });
    } finally {
      setConectandoDrive(false);
    }
  };

  const handleVerificarCarpetaDrive = async (folderOverride?: string) => {
    setAvisoDocsDrive(null);
    const idTarget = folderOverride !== undefined ? folderOverride : folderIdLibro;
    if (folderOverride !== undefined) {
      setDriveFolderId(folderOverride);
    }
    const diag = await verificarConexionDriveLive(idTarget);
    if (diag && !diag.rootFolderAccessible) {
      setAvisoDocsDrive({
        tipo: 'error',
        texto:
          diag.sugerencia ||
          diag.error ||
          'No se pudo acceder a esa carpeta desde tu cuenta de Google Drive.',
      });
    } else if (diag?.rootFolderAccessible) {
      setAvisoDocsDrive({
        tipo: 'ok',
        texto: `Carpeta verificada: "${diag.rootFolderName || diag.rootFolderId}" (${diag.subcarpetas.length} subcarpeta(s) detectada(s)).`,
      });
    }
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

  const handleNotaLibroFilesChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setAvisoLibro(null);
    setSubiendoNotaLibro(true);
    try {
      let cargadas = 0;
      for (const f of Array.from(files)) {
        await subirNotaLibroArchivo(f);
        cargadas++;
      }
      setMostrarLibro(true);
      setAvisoLibro({
        tipo: 'ok',
        texto: `${cargadas} nota(s) de libro indexada(s) con actores y seguimiento Q&A.`,
      });
    } catch (err: any) {
      setAvisoLibro({
        tipo: 'error',
        texto: err?.message || 'Error leyendo archivo de nota de libro.',
      });
    } finally {
      setSubiendoNotaLibro(false);
      e.target.value = '';
    }
  };

  const handleSyncNotasLibroDrive = async (forzarRelectura = false, continuarSolo = false) => {
    cancelarSyncLibroRef.current = false;
    setAvisoLibro(null);
    setSincronizandoLibro(true);
    setMostrarLibro(true);
    const folderId = extraerDriveFolderId(folderIdLibro);
    setProgresoLibro(
      continuarSolo
        ? 'Leyendo lote siguiente desde Drive...'
        : 'Escaneando carpeta en Google Drive...'
    );

    try {
      let lote = 1;
      let totalNuevas = 0;
      let totalActualizadas = 0;
      let ultimoRes = await sincronizarNotasLibroDrive({
        folderId,
        forzarRelectura,
        continuarLote: continuarSolo,
      });

      totalNuevas += ultimoRes.notasNuevas;
      totalActualizadas += ultimoRes.notasActualizadas;

      while (
        ultimoRes.archivosPendientes > 0 &&
        !cancelarSyncLibroRef.current &&
        lote < 15
      ) {
        lote++;
        setProgresoLibro(
          `Lote ${lote - 1} listo (${ultimoRes.notasLibro.length} notas). Leyendo ${ultimoRes.archivosPendientes} pendiente(s)...`
        );
        setAvisoLibro({
          tipo: 'ok',
          texto: `Progreso ("${ultimoRes.carpetaRaizNombre}"): ${ultimoRes.notasLibro.length} nota(s) cargadas · procesando ${ultimoRes.archivosPendientes} archivo(s) restante(s)...`,
        });

        ultimoRes = await sincronizarNotasLibroDrive({
          folderId,
          forzarRelectura,
          continuarLote: true,
        });
        totalNuevas += ultimoRes.notasNuevas;
        totalActualizadas += ultimoRes.notasActualizadas;
      }

      const detalleOmitidos =
        ultimoRes.archivosOmitidosSinCodigo > 0
          ? ` · ${ultimoRes.archivosOmitidosSinCodigo} archivo(s) sin código de nota omitidos`
          : '';
      const detalleCancelado = cancelarSyncLibroRef.current
        ? ` · Detenido por usuario (quedan ${ultimoRes.archivosPendientes} pendientes).`
        : ultimoRes.archivosPendientes > 0
          ? ` · Quedan ${ultimoRes.archivosPendientes} pendientes (haz clic en "Leer lote siguiente").`
          : '';

      setAvisoLibro({
        tipo: 'ok',
        texto: `Drive leído ("${ultimoRes.carpetaRaizNombre}"): ${ultimoRes.notasLibro.length} nota(s) con código indexadas (${totalNuevas} nuevas, ${totalActualizadas} actualizadas)${detalleOmitidos}${detalleCancelado}`,
      });
    } catch (err: any) {
      setAvisoLibro({
        tipo: 'error',
        texto: err?.message || 'No se pudieron leer las Notas de Libro desde Google Drive.',
        popupBloqueado: esErrorPopupBloqueado(err),
      });
    } finally {
      setSincronizandoLibro(false);
      setProgresoLibro(null);
    }
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
      `Audita en detalle el/los documento(s) PDF adjunto(s) (${nombres}) frente a todos los Pliegos Reales y Notas de Libro indexados. ` +
        `Identifica cada observación, exigencia o devolución de archivos (ej. Orden de Servicio de TRANSNOA) y entrega una tabla Markdown de Discrepancias y Cumplimiento con columnas: ` +
        `| Punto / Observación del PDF Adjunto | Exigencia / Criterio del Documento | Lo que establece el Pliego / Notas (Tomo / Art. / Pág.) | Dictamen (Discrepancia / Cumple / Sin Respaldo Contractual) | Acción Recomendada |.`
    );
  };

  const copyToClipboard = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const statsLibro = useMemo(() => {
    const transnoa = notasLibro.filter(
      n => n.actorEmisor === 'TRANSNOA' || n.actorReceptor === 'TRANSNOA'
    ).length;
    const ute = notasLibro.filter(n => n.actorEmisor === 'UTE / Contratista').length;
    const sinRespuesta = notasLibro.filter(n => n.estadoRespuesta === 'SIN_RESPUESTA').length;
    const conDiscrepancia = notasLibro.filter(n => n.estadoRespuesta === 'CON_DISCREPANCIA').length;
    const criticas = notasLibro.filter(n => {
      const d = calcularDiasSinRespuestaNota(n);
      return d !== null && d >= 7;
    }).length;
    const pendientesTransnoa = notasLibro.filter(
      n =>
        (n.estadoRespuesta === 'SIN_RESPUESTA' || n.estadoRespuesta === 'CON_DISCREPANCIA') &&
        n.actorReceptor === 'TRANSNOA'
    ).length;
    const pendientesUte = notasLibro.filter(
      n =>
        (n.estadoRespuesta === 'SIN_RESPUESTA' || n.estadoRespuesta === 'CON_DISCREPANCIA') &&
        n.actorReceptor === 'UTE / Contratista'
    ).length;
    return { transnoa, ute, sinRespuesta, conDiscrepancia, criticas, pendientesTransnoa, pendientesUte };
  }, [notasLibro]);

  const notasLibroFiltradas = useMemo(() => {
    return notasLibro.filter(n => {
      if (filtroLibro === 'CRITICAS') {
        const d = calcularDiasSinRespuestaNota(n);
        return d !== null && d >= 7;
      }
      if (filtroLibro === 'TRANSNOA') {
        return n.actorEmisor === 'TRANSNOA' || n.actorReceptor === 'TRANSNOA';
      }
      if (filtroLibro === 'UTE') {
        return n.actorEmisor === 'UTE / Contratista' || n.actorReceptor === 'UTE / Contratista';
      }
      if (filtroLibro === 'SIN_RESPUESTA') {
        return n.estadoRespuesta === 'SIN_RESPUESTA';
      }
      if (filtroLibro === 'CON_DISCREPANCIA') {
        return n.estadoRespuesta === 'CON_DISCREPANCIA';
      }
      return true;
    });
  }, [notasLibro, filtroLibro]);

  // Índice rápido de vínculos cruzados desde Notas de Libro hacia Planos e Interferencias
  const enlacesCruzadosPorNota = useMemo(() => {
    const map = new Map<string, { planosMatch: string[]; crucesMatch: string[] }>();
    for (const n of notasLibroFiltradas.slice(0, 80)) {
      const corpus = `${n.codigo} ${n.titulo || n.nombreArchivo || ''} ${n.resumen || ''} ${(n.referenciasNotas || []).join(' ')}`.toUpperCase();
      const planosMatch: string[] = [];
      for (const p of planos) {
        const cod = (p.codigo || '').trim().toUpperCase();
        if (cod.length >= 4 && corpus.includes(cod)) {
          planosMatch.push(p.codigo);
          if (planosMatch.length >= 2) break;
        }
      }
      const crucesMatch: string[] = [];
      for (const c of interferencias) {
        const emp = (c.empresa || '').trim().toUpperCase();
        const carp = (c.carpetaNombre || '').trim().toUpperCase();
        if ((emp.length >= 3 && corpus.includes(emp)) || (carp.length >= 4 && corpus.includes(carp))) {
          crucesMatch.push(c.empresa);
          if (crucesMatch.length >= 2) break;
        }
      }
      if (planosMatch.length > 0 || crucesMatch.length > 0) {
        map.set(n.id, { planosMatch, crucesMatch });
      }
    }
    return map;
  }, [notasLibroFiltradas, planos, interferencias]);

  const badgeActorColor = (actor: string) => {
    if (actor === 'TRANSNOA') return 'bg-violet-500/15 text-violet-300 border-violet-500/30';
    if (actor === 'UTE / Contratista') return 'bg-sky-500/15 text-sky-300 border-sky-500/30';
    if (actor === 'Inspección') return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
    if (actor === 'Comitente') return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
    return 'bg-slate-800 text-slate-300 border-slate-700';
  };

  const badgeEstadoColor = (estado: string) => {
    if (estado === 'CONTESTADA') return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
    if (estado === 'PARCIALMENTE_CONTESTADA') return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
    if (estado === 'CON_DISCREPANCIA') return 'bg-rose-500/15 text-rose-300 border-rose-500/30';
    if (estado === 'SIN_RESPUESTA') return 'bg-orange-500/15 text-orange-300 border-orange-500/30';
    return 'bg-slate-800 text-slate-400 border-slate-700';
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
      <div className="bento-card p-4 sm:p-5 flex flex-col gap-3.5">
        {/* Fila superior: Título y barra de acciones sin comprimir el texto */}
        <div className="flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400 shrink-0">
                <Bot className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h4 className="text-sm sm:text-base font-bold text-white leading-snug text-balance">
                  Asistente Integral IA, Libro de Notas &amp; Auditoría (132 kV)
                </h4>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Consultas abiertas de ingeniería, búsqueda en Google Drive, Pliegos y Libro de Comunicaciones
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {hasDriveToken ? (
                <div className="inline-flex flex-wrap items-center gap-1.5 px-2.5 py-1 rounded-lg bg-teal-950/60 border border-teal-500/35 text-[11px] text-teal-200">
                  <ShieldCheck className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                  <span className="font-semibold">
                    {driveConnectionState.accountEmail || 'Drive conectado'}
                  </span>
                  {driveConnectionState.remainingMinutes > 0 && (
                    <span className="text-[10px] font-mono text-teal-300/80">
                      ({driveConnectionState.remainingMinutes}m)
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setMostrarExploradorDrive(prev => !prev)}
                    className="ml-1 px-1.5 py-0.5 rounded bg-slate-900/80 hover:bg-slate-800 border border-slate-700 text-[10px] text-slate-200 cursor-pointer"
                    title="Ver o cambiar carpeta activa de Drive"
                  >
                    {mostrarExploradorDrive ? 'Ocultar carpeta' : 'Carpeta'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleConectarDriveParaChat(true)}
                    disabled={conectandoDrive}
                    className="px-1.5 py-0.5 rounded bg-slate-900/80 hover:bg-slate-800 border border-slate-700 text-[10px] text-teal-200 cursor-pointer disabled:opacity-60"
                    title="Cambiar de cuenta Google o renovar permisos de Drive"
                  >
                    {conectandoDrive ? '...' : 'Renovar'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void desconectarGoogleDrive()}
                    className="p-0.5 rounded hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 cursor-pointer"
                    title="Desconectar token de Google Drive"
                  >
                    <LogOut className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleConectarDriveParaChat(false)}
                  disabled={conectandoDrive}
                  className="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 disabled:opacity-60 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap shrink-0"
                  title="Autorizar búsqueda en vivo en Google Drive (Memorias Descriptivas, Estudios de Suelos, etc.)"
                >
                  {conectandoDrive ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <FolderOpen className="w-3.5 h-3.5" />
                  )}
                  <span>{conectandoDrive ? 'Conectando...' : 'Conectar Drive'}</span>
                </button>
              )}
            </div>
          </div>

          {hasDriveToken && (driveConnectionState.rootFolderName || mostrarExploradorDrive || driveConnectionState.verificando) && (
            <div className="rounded-xl bg-slate-950/75 border border-teal-500/25 px-3 py-2 text-[11px] space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2 min-w-0">
                  <span className="text-slate-400">Carpeta Drive activa:</span>
                  {driveConnectionState.verificando ? (
                    <span className="inline-flex items-center gap-1 text-teal-300">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Verificando permisos...
                    </span>
                  ) : driveConnectionState.rootFolderAccessible ? (
                    <span className="font-semibold text-emerald-300 truncate">
                      ✓ {driveConnectionState.rootFolderName || driveConnectionState.rootFolderId}
                    </span>
                  ) : (
                    <span className="font-semibold text-amber-300 truncate">
                      ⚠ Sin acceso a carpeta ({driveConnectionState.rootFolderId})
                    </span>
                  )}
                  {driveConnectionState.elencosAccesible && (
                    <span className="text-[10px] font-mono text-sky-300">· Elencos ✓</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setMostrarExploradorDrive(prev => !prev)}
                  className="text-[10px] text-teal-300 hover:text-teal-200 underline cursor-pointer shrink-0"
                >
                  {mostrarExploradorDrive ? 'Cerrar explorador' : 'Explorar / cambiar carpeta'}
                </button>
              </div>

              {mostrarExploradorDrive && (
                <div className="space-y-2 pt-1.5 border-t border-slate-800/80">
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      value={folderIdLibro}
                      onChange={e => handleFolderIdLibroChange(e.target.value)}
                      placeholder={DEFAULT_DRIVE_ROOT_FOLDER_ID}
                      className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-[11px] text-slate-200 font-mono focus:outline-none focus:ring-1 focus:ring-teal-500"
                    />
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => void handleVerificarCarpetaDrive()}
                        disabled={driveConnectionState.verificando}
                        className="px-2.5 py-1.5 rounded-lg bg-teal-600/80 hover:bg-teal-500 text-white text-[11px] font-semibold cursor-pointer disabled:opacity-60"
                      >
                        Verificar carpeta
                      </button>
                      {extraerDriveFolderId(folderIdLibro) !== DEFAULT_DRIVE_ROOT_FOLDER_ID && (
                        <button
                          type="button"
                          onClick={() => void handleVerificarCarpetaDrive(DEFAULT_DRIVE_ROOT_FOLDER_ID)}
                          className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] cursor-pointer"
                        >
                          Volver a raíz
                        </button>
                      )}
                    </div>
                  </div>

                  {driveConnectionState.subcarpetas.length > 0 && (
                    <div className="space-y-1">
                      <div className="text-[10px] text-slate-400">
                        Subcarpetas detectadas (clic para seleccionar):
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {driveConnectionState.subcarpetas.map(sub => (
                          <button
                            key={sub.id}
                            type="button"
                            onClick={() => void handleVerificarCarpetaDrive(sub.id)}
                            className="px-2 py-1 rounded-md bg-slate-900 hover:bg-teal-900/40 border border-slate-700 hover:border-teal-500/50 text-[10px] text-slate-200 inline-flex items-center gap-1 cursor-pointer transition-colors"
                          >
                            <FolderOpen className="w-3 h-3 text-teal-400 shrink-0" />
                            <span>{sub.name}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="flex items-center gap-2 flex-wrap">
            {!hasDriveToken && (
              <button
                type="button"
                onClick={() => void handleConectarDriveParaChat(false)}
                disabled={conectandoDrive}
                className="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 disabled:opacity-60 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap shrink-0"
                title="Autorizar búsqueda en vivo en Google Drive (Memorias Descriptivas, Estudios de Suelos, etc.)"
              >
                <FolderOpen className="w-3.5 h-3.5" />
                <span>Conectar Drive</span>
              </button>
            )}
            {ultimaSyncDrive && (
              <span
                className="text-[10px] font-mono px-2 py-1 rounded-lg bg-slate-900/90 border border-slate-800 text-slate-300 whitespace-nowrap shrink-0"
                title={ultimaSyncDrive.resumen}
              >
                Caché Drive: {new Date(ultimaSyncDrive.fechaIso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            <button
              type="button"
              onClick={handleSyncDocsTecnicosDrive}
              disabled={sincronizandoDocsDrive}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-60 text-teal-300 text-xs font-semibold border border-teal-500/30 flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap shrink-0"
              title="Indexar Memorias Descriptivas, Estudios de Suelos y documentos técnicos desde Google Drive"
            >
              {sincronizandoDocsDrive ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <BookOpen className="w-3.5 h-3.5" />
              )}
              <span>Docs Drive ({driveDocsCount})</span>
            </button>
            <button
              type="button"
              onClick={() => handleSyncNotasLibroDrive(false)}
              disabled={sincronizandoLibro}
              className="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-60 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap shrink-0"
              title="Leer Notas de Pedido, Órdenes de Servicio y Comunicaciones desde Google Drive"
            >
              {sincronizandoLibro ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              <span>Notas Drive</span>
            </button>
            <button
              type="button"
              onClick={() => setMostrarLibro(prev => !prev)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap shrink-0 ${
                mostrarLibro
                  ? 'bg-violet-600/25 border-violet-400/50 text-white'
                  : 'bg-slate-800 hover:bg-slate-700 text-violet-300 border-violet-500/30'
              }`}
            >
              <MessageSquareText className="w-3.5 h-3.5" />
              <span>Libro ({notasLibro.length})</span>
              {mostrarLibro ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
            <button
              type="button"
              onClick={() => setIsPliegosModalOpen(true)}
              className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap shrink-0"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>{pliegosReales.length > 0 ? `Pliegos (${pliegosReales.length})` : 'Cargar Pliego Real'}</span>
            </button>
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
              <span>Comparador</span>
            </button>
            <button
              type="button"
              onClick={clearChat}
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700/80 flex items-center gap-1 cursor-pointer transition-colors whitespace-nowrap shrink-0 ml-auto"
              title="Limpiar historial del chat"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Limpiar</span>
            </button>
          </div>
        </div>

        {/* Franja de fuentes conectadas (grilla responsiva tabular, sin saltos de línea huérfanos) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-1.5 pt-3 border-t border-slate-800/80 text-[11px]">
          <button
            type="button"
            onClick={handleSyncDocsTecnicosDrive}
            className="text-left group cursor-pointer px-2 py-1.5 rounded-lg hover:bg-slate-800/50 transition-colors"
            title="Indexar documentos técnicos y Memorias desde Drive"
          >
            <div className="text-slate-400 group-hover:text-slate-200 transition-colors truncate">Docs Drive</div>
            <div className={`font-mono tabular-nums font-bold ${driveDocsCount > 0 || hasDriveToken ? 'text-teal-300' : 'text-slate-200'}`}>
              {driveDocsCount}{hasDriveToken ? ' · Vivo' : ''}
            </div>
          </button>

          <button
            type="button"
            onClick={() => setMostrarLibro(prev => !prev)}
            className="text-left group cursor-pointer px-2 py-1.5 rounded-lg hover:bg-slate-800/50 transition-colors"
            title="Abrir panel de Libro de Comunicaciones"
          >
            <div className="text-slate-400 group-hover:text-slate-200 transition-colors truncate">Notas de Libro</div>
            <div className={`font-mono tabular-nums font-bold ${notasLibro.length > 0 ? 'text-violet-300' : 'text-amber-300'}`}>
              {notasLibro.length}
            </div>
          </button>

          <button
            type="button"
            onClick={() => setIsPliegosModalOpen(true)}
            className="text-left group cursor-pointer px-2 py-1.5 rounded-lg hover:bg-slate-800/50 transition-colors"
            title="Gestionar Pliegos Reales indexados"
          >
            <div className="text-slate-400 group-hover:text-slate-200 transition-colors truncate">Pliegos</div>
            <div className={`font-mono tabular-nums font-bold ${pliegosReales.length > 0 ? 'text-emerald-400' : 'text-amber-300'}`}>
              {pliegosReales.length}
            </div>
          </button>

          <button
            type="button"
            onClick={() => pdfInputRef.current?.click()}
            className="text-left group cursor-pointer px-2 py-1.5 rounded-lg hover:bg-slate-800/50 transition-colors"
            title="Adjuntar archivo PDF al chat"
          >
            <div className="text-slate-400 group-hover:text-slate-200 transition-colors truncate">PDF en chat</div>
            <div className={`font-mono tabular-nums font-bold ${chatAdjuntos.length > 0 ? 'text-sky-300' : 'text-slate-200'}`}>
              {chatAdjuntos.length}
            </div>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('comparador')}
            className="text-left group cursor-pointer px-2 py-1.5 rounded-lg hover:bg-slate-800/50 transition-colors"
            title="Ir al Comparador de Planos PDF"
          >
            <div className="text-slate-400 group-hover:text-slate-200 transition-colors truncate">Comparador</div>
            <div className={`font-mono tabular-nums font-bold ${totalPlanosComparador > 0 ? 'text-sky-300' : 'text-slate-200'}`}>
              {totalPlanosComparador}
            </div>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('planos')}
            className="text-left group cursor-pointer px-2 py-1.5 rounded-lg hover:bg-slate-800/50 transition-colors"
            title="Ver catálogo de planos"
          >
            <div className="text-slate-400 group-hover:text-slate-200 transition-colors truncate">Planos obra</div>
            <div className="font-mono tabular-nums font-bold text-slate-200">{planos.length}</div>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('hitos')}
            className="text-left group cursor-pointer px-2 py-1.5 rounded-lg hover:bg-slate-800/50 transition-colors"
            title="Ver hitos contractuales"
          >
            <div className="text-slate-400 group-hover:text-slate-200 transition-colors truncate">Hitos</div>
            <div className="font-mono tabular-nums font-bold text-slate-200">{hitos.length}</div>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('interferencias')}
            className="text-left group cursor-pointer px-2 py-1.5 rounded-lg hover:bg-slate-800/50 transition-colors"
            title="Ver interferencias y cruces"
          >
            <div className="text-slate-400 group-hover:text-slate-200 transition-colors truncate">Cruces</div>
            <div className="font-mono tabular-nums font-bold text-slate-200">{interferencias.length}</div>
          </button>
        </div>

        {/* Selector de Niveles de Precisión, Modelo IA, Límites y Control Maestro */}
        {(() => {
          const modelosBase = geminiPrecisionState?.modelos || [
            {
              nivelId: 'gratuito' as PrecisionNivelId,
              etiquetaNivel: 'Gratuito · $0',
              proveedor: 'openrouter' as const,
              modelo: 'openrouter/free',
              costoInputPor1M: 0,
              costoOutputPor1M: 0,
              configuradoEnServidor: true,
              maxConsultasDiarias: 0,
              maxCostoUsdDiario: 0,
              usoHoy: { consultas: 0, inputTokens: 0, outputTokens: 0, costoUsd: 0 },
              disponiblePorLimite: true,
            },
          ];
          const modelosVisibles = puedeUsarModelosPagos
            ? modelosBase
            : modelosBase.filter(m => m.nivelId === 'gratuito');

          return (
            <div className="pt-3 border-t border-slate-800/80 space-y-2.5">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2">
                <div
                  className={
                    modelosVisibles.length <= 1
                      ? 'grid grid-cols-1 max-w-md flex-1'
                      : 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-1.5 flex-1'
                  }
                >
                  {modelosVisibles.map(item => {
                    const activo = precisionNivel === item.nivelId || (!puedeUsarModelosPagos && item.nivelId === 'gratuito');
                    const sinCupo = !item.disponiblePorLimite;
                    const esGratuito = item.nivelId === 'gratuito';
                    const limQ = item.maxConsultasDiarias > 0 ? String(item.maxConsultasDiarias) : '∞';
                    const limUsd = esGratuito
                      ? '$0.00'
                      : item.maxCostoUsdDiario > 0
                        ? `$${item.maxCostoUsdDiario.toFixed(2)}`
                        : '∞';
                    const shortModelLabel =
                      esGratuito && geminiPrecisionState?.openRouterModeloPreferido
                        ? geminiPrecisionState.openRouterModeloPreferido === 'openrouter/free'
                          ? 'openrouter/free'
                          : geminiPrecisionState.openRouterModeloPreferido.split('/').pop()?.replace(':free', '') || 'free'
                        : item.modelo.replace('gemini-', '');
                    return (
                      <button
                        key={item.nivelId}
                        type="button"
                        onClick={() => void handleSeleccionarNivelPrecision(item.nivelId)}
                        className={`text-left px-2.5 py-2 rounded-xl border transition-all cursor-pointer ${
                          activo
                            ? sinCupo
                              ? 'bg-rose-950/50 border-rose-500/70 text-white'
                              : esGratuito
                                ? 'bg-emerald-600/20 border-emerald-400/70 text-white shadow-sm'
                                : 'bg-sky-600/20 border-sky-400/70 text-white shadow-sm'
                            : sinCupo
                              ? 'bg-slate-950/60 border-rose-900/50 text-slate-400 hover:border-rose-600/50'
                              : 'bg-slate-950/70 border-slate-800 text-slate-300 hover:border-slate-600 hover:text-white'
                        }`}
                        title={`${item.etiquetaNivel} (${item.modelo}) · In $${item.costoInputPor1M}/1M · Out $${item.costoOutputPor1M}/1M`}
                      >
                        <div className="flex items-center justify-between gap-1.5">
                          <span className="text-[11px] font-bold truncate">{item.etiquetaNivel}</span>
                          <span
                            className={`text-[9px] font-mono uppercase shrink-0 ${
                              sinCupo
                                ? 'text-rose-400 font-bold'
                                : activo
                                  ? esGratuito
                                    ? 'text-emerald-300 font-semibold'
                                    : 'text-sky-300 font-semibold'
                                  : esGratuito
                                    ? 'text-emerald-400/80'
                                    : 'text-slate-500'
                            }`}
                          >
                            {sinCupo ? 'LÍMITE' : shortModelLabel}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2 mt-0.5 text-[10px] font-mono tabular-nums text-slate-400">
                          <span>
                            {item.usoHoy.consultas}/{limQ} cons.
                          </span>
                          <span className={esGratuito ? 'text-emerald-300/90' : ''}>
                            {esGratuito
                              ? item.configuradoEnServidor
                                ? '$0.00'
                                : 'Sin API Key'
                              : `$${item.usoHoy.costoUsd.toFixed(4)} / ${limUsd}`}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="flex flex-wrap items-center justify-between lg:justify-end gap-2 shrink-0">
                  {esUsuarioMaestro && (
                    <>
                      <button
                        type="button"
                        onClick={() => void handleToggleMasterPagos()}
                        disabled={cambiandoMaster}
                        className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-bold flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap disabled:opacity-60 ${
                          modelosPagosHabilitados
                            ? 'bg-amber-500/20 border-amber-400/60 text-amber-200 hover:bg-amber-500/30'
                            : 'bg-emerald-950/60 border-emerald-500/50 text-emerald-200 hover:bg-emerald-900/60'
                        }`}
                        title="Control Maestro exclusivo: activa el modo selectivo o bloquea modelos pagos a todos"
                      >
                        {cambiandoMaster ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <ShieldCheck className="w-3.5 h-3.5" />
                        )}
                        <span>
                          {modelosPagosHabilitados
                            ? `Maestro: Pagos (${usuariosPagosAutorizados.length})`
                            : 'Maestro: Solo Gratuito'}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setMostrarUsuariosPagosMaestro(prev => !prev)}
                        className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap ${
                          mostrarUsuariosPagosMaestro
                            ? 'bg-amber-500/25 border-amber-400/70 text-amber-100'
                            : 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-300'
                        }`}
                        title="Elegir qué usuarios pueden usar el nivel pago"
                      >
                        <Users className="w-3.5 h-3.5 text-amber-300" />
                        <span>Elegir usuarios ({usuariosPagosAutorizados.length})</span>
                      </button>
                    </>
                  )}

                  {puedeUsarModelosPagos && (
                    <div className="text-[10px] font-mono tabular-nums text-slate-300 bg-slate-950/80 border border-slate-800 rounded-lg px-2.5 py-1.5">
                      {geminiPrecisionState?.miLimiteDiarioUsd && geminiPrecisionState.miLimiteDiarioUsd > 0 ? (
                        <>
                          Mi tope hoy:{' '}
                          <strong className="text-emerald-300">
                            ${(geminiPrecisionState.miConsumoHoyUsd ?? 0).toFixed(4)} / ${geminiPrecisionState.miLimiteDiarioUsd.toFixed(2)}
                          </strong>
                        </>
                      ) : (
                        <>
                          Hoy:{' '}
                          <strong className="text-emerald-300">
                            ${(geminiPrecisionState?.costoTotalHoyUsd ?? 0).toFixed(4)} USD
                          </strong>
                        </>
                      )}
                    </div>
                  )}

                  {geminiPrecisionState?.openRouterSalud && (
                    <div className="text-[10px] font-mono text-slate-300 bg-slate-950/80 border border-emerald-800/40 rounded-lg px-2.5 py-1.5 flex items-center gap-1.5">
                      <Activity
                        className={`w-3 h-3 shrink-0 ${
                          geminiPrecisionState.openRouterSalud.modelosConAlerta.length > 0
                            ? 'text-amber-400'
                            : 'text-emerald-400'
                        }`}
                      />
                      <span className="truncate max-w-[170px]" title={geminiPrecisionState.openRouterSalud.ultimoModeloExitoso || 'openrouter/free'}>
                        OR :free{' '}
                        {geminiPrecisionState.openRouterSalud.ultimoModeloExitoso
                          ? geminiPrecisionState.openRouterSalud.ultimoModeloExitoso.split('/').pop()?.replace(':free', '')
                          : 'auto'}
                      </span>
                      {geminiPrecisionState.openRouterSalud.ultimoModeloExitoso &&
                        geminiPrecisionState.openRouterSalud.ultimoModeloExitoso !== geminiPrecisionState.openRouterModeloPreferido && (
                          <button
                            type="button"
                            onClick={() =>
                              void handleFijarModeloOpenRouterSalud(
                                geminiPrecisionState.openRouterSalud!.ultimoModeloExitoso!
                              )
                            }
                            className="px-1.5 py-0.5 rounded bg-emerald-600/30 hover:bg-emerald-500/40 text-emerald-200 border border-emerald-500/40 text-[9px] font-bold cursor-pointer"
                            title="Fijar último modelo gratuito que respondió OK"
                          >
                            Fijar
                          </button>
                        )}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => setMostrarPanelLimites(prev => !prev)}
                    className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap ${
                      mostrarPanelLimites
                        ? 'bg-sky-600/25 border-sky-400/60 text-white'
                        : 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-300'
                    }`}
                    title="Configurar modelo gratuito y límites diarios"
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5 text-sky-400" />
                    <span>{puedeUsarModelosPagos ? 'Límites y costos' : 'Modelo y límites'}</span>
                  </button>
                </div>
              </div>

              {esUsuarioMaestro && mostrarUsuariosPagosMaestro && (
                <div className="rounded-xl bg-amber-950/20 border border-amber-500/40 p-3 space-y-2.5 text-[11px]">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-500/20 pb-2">
                    <div>
                      <div className="font-bold text-amber-100 flex items-center gap-1.5">
                        <ShieldCheck className="w-3.5 h-3.5 text-amber-300" />
                        <span>Usuarios autorizados y tope diario USD individual</span>
                      </div>
                      <div className="text-[10px] text-slate-300">
                        {modelosPagosHabilitados
                          ? 'Configura acceso pago y tope USD/día por persona (0 = sin tope propio).'
                          : 'El bloqueo global ($0) está activo: al habilitar un usuario se activará el modo selectivo.'}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleGuardarTopesUsuarioChat()}
                      disabled={cambiandoMaster}
                      className="px-2.5 py-1 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-[10px] font-bold cursor-pointer disabled:opacity-50 shrink-0"
                    >
                      Guardar topes USD
                    </button>
                  </div>

                  {(() => {
                    const usoUsuariosMap = new Map(
                      (geminiPrecisionState?.usoPorUsuarioHoy || []).map(u => [
                        u.email.toLowerCase().trim(),
                        u,
                      ])
                    );
                    const emailsLista = Array.from(
                      new Set([
                        BOOTSTRAP_ADMIN_EMAIL.toLowerCase(),
                        ...invitacionesMaestro
                          .map(i => i.invitedEmail.toLowerCase().trim())
                          .filter(Boolean),
                        ...usuariosPagosAutorizados
                          .map(u => u.toLowerCase().trim())
                          .filter(Boolean),
                        ...Object.keys(limitesPorUsuarioUsd || {})
                          .map(u => u.toLowerCase().trim())
                          .filter(Boolean),
                        ...Array.from(usoUsuariosMap.keys()),
                      ])
                    );
                    const invMap = new Map(
                      invitacionesMaestro.map(i => [i.invitedEmail.toLowerCase().trim(), i])
                    );

                    return (
                      <div className="space-y-1.5">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5 max-h-48 overflow-y-auto pr-1">
                          {emailsLista.map(emailItem => {
                            const tienePago = usuariosPagosAutorizados.includes(emailItem);
                            const esMaestroItem = emailItem === BOOTSTRAP_ADMIN_EMAIL.toLowerCase();
                            const inv = invMap.get(emailItem);
                            const usoHoyUser = usoUsuariosMap.get(emailItem);
                            const limitVal =
                              limitesUsuarioDraftChat[emailItem] ??
                              String(limitesPorUsuarioUsd[emailItem] ?? 0);
                            const rolTag = esMaestroItem
                              ? 'Maestro'
                              : inv
                                ? inv.status === 'accepted'
                                  ? 'Conectado'
                                  : 'Invitado'
                                : 'Manual';

                            return (
                              <div
                                key={emailItem}
                                className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-950/85 border border-slate-800 px-2.5 py-1.5"
                              >
                                <div className="min-w-0 flex-1 space-y-0.5">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-mono text-[10px] text-slate-100 truncate">
                                      {emailItem}
                                    </span>
                                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 shrink-0">
                                      {rolTag}
                                    </span>
                                  </div>
                                  <div className="text-[9px] font-mono text-slate-400">
                                    Hoy: {usoHoyUser?.consultas ?? 0} cons. · ${(usoHoyUser?.costoUsd ?? 0).toFixed(4)}
                                  </div>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <input
                                    type="number"
                                    min={0}
                                    step={0.1}
                                    value={limitVal}
                                    onChange={e =>
                                      setLimitesUsuarioDraftChat(prev => ({
                                        ...prev,
                                        [emailItem]: e.target.value,
                                      }))
                                    }
                                    className="w-14 bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-[10px] font-mono text-white"
                                    title="Tope USD/día (0 = sin tope)"
                                    aria-label={`Tope USD diario para ${emailItem}`}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => void handleToggleUsuarioPagoChat(emailItem)}
                                    disabled={cambiandoMaster}
                                    className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer shrink-0 disabled:opacity-60 ${
                                      tienePago
                                        ? 'bg-amber-500/20 text-amber-200 border border-amber-400/60 hover:bg-amber-500/30'
                                        : 'bg-slate-900 text-slate-300 border border-slate-700 hover:border-emerald-500/50 hover:text-emerald-200'
                                    }`}
                                  >
                                    {tienePago ? 'Nivel Pago: SÍ' : 'Solo Gratis ($0)'}
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5 pt-1">
                          <input
                            type="email"
                            value={nuevoEmailPagoMaestro}
                            onChange={e => setNuevoEmailPagoMaestro(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                void handleAgregarEmailPagoChat();
                              }
                            }}
                            placeholder="Agregar correo electrónico..."
                            className="flex-1 min-w-[200px] bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-[11px] font-mono text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-amber-400"
                          />
                          <button
                            type="button"
                            onClick={() => void handleAgregarEmailPagoChat()}
                            disabled={cambiandoMaster || !nuevoEmailPagoMaestro.trim()}
                            className="px-3 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-[10px] font-bold cursor-pointer disabled:opacity-50"
                          >
                            Autorizar correo
                          </button>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {mostrarPanelLimites && geminiPrecisionState && (
                <div className="rounded-xl bg-slate-950/90 border border-slate-800 p-3 space-y-3 text-[11px]">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-2">
                    <div>
                      <div className="font-bold text-slate-100">
                        {puedeUsarModelosPagos
                          ? `Control de Límites y Costos por Modelo IA (${geminiPrecisionState.fechaActual})`
                          : `Configuración Motor IA Gratuito (${geminiPrecisionState.fechaActual})`}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        Usa <code className="text-slate-200">0</code> en un límite si deseas dejarlo sin tope.
                        {puedeUsarModelosPagos && (
                          <>
                            {' '}Acumulado histórico:{' '}
                            <span className="font-mono text-sky-300">
                              ${geminiPrecisionState.costoHistoricoUsd.toFixed(4)} USD
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    {puedeUsarModelosPagos && (
                      <div className="flex items-center gap-2 shrink-0 flex-wrap">
                        <select
                          value={politicaDraft}
                          onChange={e => setPoliticaDraft(e.target.value as PoliticaLimiteModelo)}
                          className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-[10px] text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500"
                          aria-label="Acción al alcanzar límite diario"
                        >
                          <option value="bloquear">Al llegar al límite: Bloquear modelo</option>
                          <option value="fallback_economico">Al llegar al límite: Bajar a Económico (Flash Lite)</option>
                        </select>
                      </div>
                    )}
                  </div>

                  <div
                    className={
                      modelosVisibles.length <= 1
                        ? 'grid grid-cols-1 max-w-md gap-2'
                        : 'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2'
                    }
                  >
                    {modelosVisibles.map(m => {
                      const draft = limitesDraft[m.modelo] || {
                        maxConsultasDiarias: String(m.maxConsultasDiarias),
                        maxCostoUsdDiario: String(m.maxCostoUsdDiario),
                      };
                      const esOpenRouter = m.proveedor === 'openrouter';
                      return (
                        <div
                          key={m.modelo}
                          className={`rounded-lg border p-2.5 space-y-2 ${
                            esOpenRouter
                              ? 'bg-emerald-950/20 border-emerald-800/60'
                              : 'bg-slate-900/80 border-slate-800'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-bold text-slate-100 text-[11px]">{m.etiquetaNivel}</span>
                            <span className={`font-mono text-[9px] ${esOpenRouter ? 'text-emerald-300' : 'text-sky-300'}`}>
                              {m.modelo}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-400 leading-snug">
                            {esOpenRouter ? (
                              <span>
                                Tarifa: <span className="font-mono text-emerald-300">$0.00 (OpenRouter :free)</span>
                                {!m.configuradoEnServidor && ' · Falta OPENROUTER_API_KEY'}
                              </span>
                            ) : (
                              <span>
                                Tarifa: <span className="font-mono text-slate-300">${m.costoInputPor1M}/1M In · ${m.costoOutputPor1M}/1M Out</span>
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] font-mono tabular-nums text-slate-300">
                            Hoy: {m.usoHoy.consultas} cons. · {(m.usoHoy.inputTokens + m.usoHoy.outputTokens).toLocaleString()} tok ·{' '}
                            <span className="text-emerald-300">${m.usoHoy.costoUsd.toFixed(4)}</span>
                          </div>
                          {esOpenRouter && geminiPrecisionState.openRouterModelosGratuitos?.length > 0 && (
                            <div>
                              <label className="block text-[9px] text-slate-400 mb-0.5">Modelo gratuito OpenRouter</label>
                              <select
                                value={openRouterModeloDraft}
                                onChange={e => setOpenRouterModeloDraft(e.target.value)}
                                className="w-full bg-slate-950 border border-slate-700 rounded px-1.5 py-1 text-[10px] font-mono text-emerald-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                              >
                                {geminiPrecisionState.openRouterModelosGratuitos.map(orMod => (
                                  <option key={orMod.id} value={orMod.id}>
                                    {orMod.id} ({Math.round(orMod.contextLength / 1000)}k)
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}
                          <div className={esOpenRouter ? 'grid grid-cols-1 gap-1.5' : 'grid grid-cols-2 gap-1.5'}>
                            <div>
                              <label className="block text-[9px] text-slate-400 mb-0.5">Máx. cons./día (0 = ∞)</label>
                              <input
                                type="number"
                                min={0}
                                step={1}
                                value={draft.maxConsultasDiarias}
                                onChange={e =>
                                  setLimitesDraft(prev => ({
                                    ...prev,
                                    [m.modelo]: { ...draft, maxConsultasDiarias: e.target.value },
                                  }))
                                }
                                className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-[10px] font-mono text-white focus:outline-none focus:ring-1 focus:ring-sky-500"
                              />
                            </div>
                            {!esOpenRouter && (
                              <div>
                                <label className="block text-[9px] text-slate-400 mb-0.5">Tope USD/día</label>
                                <input
                                  type="number"
                                  min={0}
                                  step={0.05}
                                  value={draft.maxCostoUsdDiario}
                                  onChange={e =>
                                    setLimitesDraft(prev => ({
                                      ...prev,
                                      [m.modelo]: { ...draft, maxCostoUsdDiario: e.target.value },
                                    }))
                                  }
                                  className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-[10px] font-mono text-white focus:outline-none focus:ring-1 focus:ring-sky-500"
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <div className="text-[10px] text-emerald-300">{avisoLimites || ''}</div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleResetContadoresHoy}
                        disabled={guardandoLimites}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-[10px] font-semibold inline-flex items-center gap-1 cursor-pointer disabled:opacity-60"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Reiniciar contadores hoy</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleGuardarLimitesPrecision}
                        disabled={guardandoLimites}
                        className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-[10px] font-bold inline-flex items-center gap-1 cursor-pointer disabled:opacity-60"
                      >
                        {guardandoLimites ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                        <span>Guardar límites</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {avisoDocsDrive && (
          <div
            className={`px-3 py-2.5 rounded-lg text-[11px] border flex flex-col gap-2 ${
              avisoDocsDrive.tipo === 'ok'
                ? 'bg-teal-500/10 border-teal-500/30 text-teal-200'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-200'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <span className="leading-relaxed">{avisoDocsDrive.texto}</span>
              <button
                type="button"
                onClick={() => setAvisoDocsDrive(null)}
                className="text-slate-400 hover:text-white cursor-pointer shrink-0 mt-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            {avisoDocsDrive.popupBloqueado && (
              <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-rose-500/20">
                <a
                  href={typeof window !== 'undefined' ? window.location.href : '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2.5 py-1 rounded-md bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-bold inline-flex items-center gap-1"
                >
                  <ExternalLink className="w-3 h-3" />
                  <span>Abrir en pestaña nueva</span>
                </a>
                <button
                  type="button"
                  onClick={() => void handleConectarDriveParaChat(true)}
                  className="px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 text-[10px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Reintentar Conectar Drive</span>
                </button>
                <span className="text-[10px] text-rose-200/80">
                  Tip: si prefieres no usar Drive ahora, usa «Adjuntar PDF» para analizar cualquier archivo directo en el chat.
                </span>
              </div>
            )}
          </div>
        )}

        {/* Panel desplegable de Libro de Comunicaciones / Notas de Libro (Actores y Q&A) */}
        {mostrarLibro && (
          <div className="bg-slate-950/90 border border-violet-500/30 rounded-xl p-3 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Users className="w-4 h-4 text-violet-400 shrink-0" />
                <div className="min-w-0">
                  <div className="text-xs font-bold text-white">
                    Libro de Comunicaciones / Notas de Libro (Actores y Seguimiento Q&A)
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono flex flex-wrap items-center gap-x-2">
                    <span>{notasLibro.length} total · {statsLibro.sinRespuesta} sin resp. ({statsLibro.pendientesTransnoa} a TRANSNOA, {statsLibro.pendientesUte} a UTE) · {statsLibro.conDiscrepancia} con discrepancia</span>
                    {statsLibro.criticas > 0 && (
                      <span className="text-rose-300 font-bold">· {statsLibro.criticas} críticas (+7d)</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => notaLibroInputRef.current?.click()}
                  disabled={subiendoNotaLibro}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-semibold border border-slate-700 flex items-center gap-1 cursor-pointer"
                >
                  {subiendoNotaLibro ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Upload className="w-3 h-3" />
                  )}
                  <span>Subir Nota</span>
                </button>
                {sincronizandoLibro && (
                  <button
                    type="button"
                    onClick={() => {
                      cancelarSyncLibroRef.current = true;
                      setProgresoLibro('Deteniendo al finalizar el lote actual...');
                    }}
                    className="px-2.5 py-1.5 rounded-lg bg-rose-600/80 hover:bg-rose-500 text-white text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                    <span>Detener</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleSyncNotasLibroDrive(true)}
                  disabled={sincronizandoLibro}
                  className="px-2.5 py-1.5 rounded-lg bg-violet-600/80 hover:bg-violet-500 disabled:opacity-60 text-white text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                  title="Releer todas las notas desde Google Drive actualizando actores y enlaces"
                >
                  <RefreshCw className={`w-3 h-3 ${sincronizandoLibro ? 'animate-spin' : ''}`} />
                  <span>{sincronizandoLibro ? 'Leyendo...' : 'Releer Drive'}</span>
                </button>
              </div>
            </div>

            {progresoLibro && (
              <div className="px-3 py-2 rounded-lg text-[11px] border bg-violet-500/10 border-violet-500/30 text-violet-200 flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0 text-violet-400" />
                <span>{progresoLibro}</span>
              </div>
            )}

            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <div className="flex items-center gap-1.5 flex-1 min-w-0 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5">
                <FolderOpen className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <input
                  type="text"
                  value={folderIdLibro}
                  onChange={e => handleFolderIdLibroChange(e.target.value)}
                  placeholder="ID o enlace URL de la carpeta Drive de Libro de Obra"
                  className="w-full bg-transparent text-[11px] text-slate-200 font-mono focus:outline-none"
                />
              </div>
              <div className="flex items-center gap-1 flex-wrap">
                {(['TODAS', 'CRITICAS', 'TRANSNOA', 'UTE', 'SIN_RESPUESTA', 'CON_DISCREPANCIA'] as FiltroLibro[]).map(f => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFiltroLibro(f)}
                    className={`px-2 py-1 rounded text-[10px] font-semibold border cursor-pointer transition-colors ${
                      filtroLibro === f
                        ? f === 'CRITICAS'
                          ? 'bg-rose-600 text-white border-rose-500'
                          : 'bg-violet-600 text-white border-violet-500'
                        : f === 'CRITICAS' && statsLibro.criticas > 0
                          ? 'bg-rose-950/50 text-rose-300 border-rose-700/60 hover:bg-rose-900/50'
                          : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                    }`}
                  >
                    {f === 'TODAS'
                      ? 'Todas'
                      : f === 'CRITICAS'
                        ? `Críticas (+7d) (${statsLibro.criticas})`
                        : f === 'TRANSNOA'
                          ? 'TRANSNOA'
                          : f === 'UTE'
                            ? 'UTE / Contr.'
                            : f === 'SIN_RESPUESTA'
                              ? 'Sin Respuesta'
                              : 'Discrepancia'}
                  </button>
                ))}
              </div>
            </div>

            {(escaneoTruncadoNotasLibro || archivosPendientesNotasLibro > 0) && (
              <div className="px-3 py-2 rounded-lg text-[11px] border bg-amber-500/10 border-amber-500/30 text-amber-200 flex flex-wrap items-center justify-between gap-2">
                <span>
                  Quedan <b>{archivosPendientesNotasLibro}</b> archivo(s) o carpetas pendientes de procesar en Drive.
                </span>
                <button
                  type="button"
                  onClick={() => handleSyncNotasLibroDrive(false, true)}
                  disabled={sincronizandoLibro}
                  className="px-2.5 py-1 rounded bg-amber-600 hover:bg-amber-500 text-white text-[10px] font-bold cursor-pointer disabled:opacity-60"
                >
                  Leer lote siguiente
                </button>
              </div>
            )}

            {avisoLibro && (
              <div
                className={`px-3 py-2 rounded-lg text-[11px] border space-y-1.5 ${
                  avisoLibro.tipo === 'ok'
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-200'
                }`}
              >
                <div>{avisoLibro.texto}</div>
                {avisoLibro.popupBloqueado && (
                  <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-rose-500/20">
                    <a
                      href={typeof window !== 'undefined' ? window.location.href : '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2.5 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-bold inline-flex items-center gap-1"
                    >
                      <ExternalLink className="w-3 h-3" />
                      <span>Abrir en pestaña nueva</span>
                    </a>
                    <button
                      type="button"
                      onClick={() => handleSyncNotasLibroDrive(false)}
                      className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 text-[10px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>Reintentar Notas Drive</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {notasLibroFiltradas.length === 0 ? (
              <div className="text-[11px] text-slate-400 py-3 text-center border border-dashed border-slate-800 rounded-lg">
                {notasLibro.length === 0
                  ? 'Aún no hay Notas de Libro cargadas. Haz clic en "Notas Drive" para leer Notas de Pedido, Órdenes de Servicio y Comunicaciones desde tu Google Drive.'
                  : 'Ninguna nota coincide con el filtro seleccionado.'}
              </div>
            ) : (
              <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
                {notasLibroFiltradas.map(n => {
                  const diasSinResp = calcularDiasSinRespuestaNota(n);
                  const esCritica = diasSinResp !== null && diasSinResp >= 7;
                  const esAlerta = diasSinResp !== null && diasSinResp >= 3 && diasSinResp < 7;
                  const enlaces = enlacesCruzadosPorNota.get(n.id);
                  const requiereBorrador =
                    n.estadoRespuesta === 'SIN_RESPUESTA' || n.estadoRespuesta === 'CON_DISCREPANCIA';

                  return (
                  <div
                    key={n.id}
                    className={`p-2.5 rounded-lg border flex flex-col gap-1.5 text-[11px] ${
                      esCritica
                        ? 'bg-rose-950/20 border-rose-500/50'
                        : esAlerta
                          ? 'bg-amber-950/15 border-amber-500/40'
                          : 'bg-slate-900/90 border-slate-800'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                        <span className="font-mono font-bold text-white">{n.codigo}</span>
                        <span className="text-slate-400">· {n.tipoNota}</span>
                        {n.fecha && <span className="text-slate-500 font-mono">({n.fecha})</span>}
                        <span className={`px-1.5 py-0.5 rounded border text-[10px] font-semibold ${badgeEstadoColor(n.estadoRespuesta)}`}>
                          {n.estadoRespuesta.replace(/_/g, ' ')}
                        </span>
                        {diasSinResp !== null && (
                          <span
                            className={`px-1.5 py-0.5 rounded border text-[9px] font-mono font-bold inline-flex items-center gap-1 ${
                              esCritica
                                ? 'bg-rose-500/20 border-rose-500/50 text-rose-200'
                                : esAlerta
                                  ? 'bg-amber-500/20 border-amber-500/50 text-amber-200'
                                  : 'bg-slate-800 border-slate-700 text-slate-300'
                            }`}
                          >
                            <Clock className="w-2.5 h-2.5" />
                            <span>{diasSinResp}d</span>
                          </span>
                        )}
                        {n.manualOverride && (
                          <span className="px-1.5 py-0.5 rounded bg-sky-500/10 border border-sky-500/30 text-[9px] text-sky-300 font-semibold">
                            Editado
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                        {requiereBorrador && (
                          <button
                            type="button"
                            onClick={() =>
                              handleSend(
                                `Redacta un borrador formal de Nota de Pedido / Orden de Servicio de seguimiento vinculada a la nota ${n.codigo} (${n.actorEmisor} ➔ ${n.actorReceptor}, fecha ${n.fecha || 's/d'}${diasSinResp !== null ? `, ${diasSinResp} días pendiente` : ''}). Incluye Asunto, Antecedentes concretos, Puntos pendientes o discrepancias a subsanar ("${n.resumen.slice(0, 220)}"), Respaldo del Pliego contractual aplicable y Plazo perentorio de respuesta en 48/72 horas.`
                              )
                            }
                            className="px-2 py-0.5 rounded bg-amber-600/25 hover:bg-amber-500/35 text-amber-200 border border-amber-500/40 text-[10px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                            title="Generar borrador formal de Nota de Pedido / Orden de Servicio con IA"
                          >
                            <FilePenLine className="w-3 h-3" />
                            <span>Redactar NP/OS</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            handleSend(
                              `Verifica punto por punto la nota ${n.codigo} (${n.actorEmisor} ➔ ${n.actorReceptor}): indica qué preguntó o solicitó originalmente, si TRANSNOA o el receptor ya la contestó en notas posteriores (y cuáles), qué puntos siguen sin respuesta y si existen discrepancias.`
                            )
                          }
                          className="px-2 py-0.5 rounded bg-sky-600/20 hover:bg-sky-600/40 text-sky-300 border border-sky-500/30 text-[10px] font-semibold cursor-pointer"
                        >
                          ¿Contestada?
                        </button>
                        <button
                          type="button"
                          onClick={() => abrirEdicionNota(n)}
                          className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-amber-300 cursor-pointer"
                          title="Editar actor emisor, receptor o estado de respuesta"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                        {n.driveUrl && (
                          <a
                            href={n.driveUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-sky-300"
                            title="Abrir archivo original en Drive"
                          >
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => eliminarNotaLibro(n.id)}
                          className="p-1 rounded hover:bg-rose-500/20 text-slate-500 hover:text-rose-300 cursor-pointer"
                          title="Eliminar nota"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    {editingNotaId === n.id && editDraft && (
                      <div className="p-2 rounded-lg bg-slate-950 border border-amber-500/30 grid grid-cols-1 sm:grid-cols-4 gap-2 items-end text-[10px]">
                        <label className="space-y-1">
                          <span className="text-slate-400 block">Actor Emisor</span>
                          <select
                            value={editDraft.actorEmisor}
                            onChange={e =>
                              setEditDraft(prev =>
                                prev ? { ...prev, actorEmisor: e.target.value as ActorNotaLibro } : prev
                              )
                            }
                            className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200"
                          >
                            {ACTORES_LIBRO.map(a => (
                              <option key={a} value={a}>
                                {a}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="space-y-1">
                          <span className="text-slate-400 block">Actor Receptor</span>
                          <select
                            value={editDraft.actorReceptor}
                            onChange={e =>
                              setEditDraft(prev =>
                                prev ? { ...prev, actorReceptor: e.target.value as ActorNotaLibro } : prev
                              )
                            }
                            className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200"
                          >
                            {ACTORES_LIBRO.map(a => (
                              <option key={a} value={a}>
                                {a}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="space-y-1">
                          <span className="text-slate-400 block">Estado Q&A</span>
                          <select
                            value={editDraft.estadoRespuesta}
                            onChange={e =>
                              setEditDraft(prev =>
                                prev
                                  ? { ...prev, estadoRespuesta: e.target.value as EstadoRespuestaNota }
                                  : prev
                              )
                            }
                            className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200"
                          >
                            {ESTADOS_LIBRO.map(st => (
                              <option key={st} value={st}>
                                {st.replace(/_/g, ' ')}
                              </option>
                            ))}
                          </select>
                        </label>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => void guardarEdicionNota(n.id)}
                            disabled={savingNotaId === n.id}
                            className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold cursor-pointer disabled:opacity-60"
                          >
                            {savingNotaId === n.id ? '...' : 'Guardar'}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingNotaId(null);
                              setEditDraft(null);
                            }}
                            className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                      <span className={`px-1.5 py-0.5 rounded border font-semibold ${badgeActorColor(n.actorEmisor)}`}>
                        Emisor: {n.actorEmisor}
                      </span>
                      <span className="text-slate-500">➔</span>
                      <span className={`px-1.5 py-0.5 rounded border font-semibold ${badgeActorColor(n.actorReceptor)}`}>
                        Receptor: {n.actorReceptor}
                      </span>
                      {n.respondeANotas.length > 0 && (
                        <span className="text-sky-300 font-mono">
                          Responde a: {n.respondeANotas.join(', ')}
                        </span>
                      )}
                      {n.respondidaPorNotas.length > 0 && (
                        <span className="text-emerald-300 font-mono">
                          Respondida por: {n.respondidaPorNotas.join(', ')}
                        </span>
                      )}
                    </div>

                    <p className="text-slate-300 leading-snug line-clamp-2">{n.resumen}</p>
                    {enlaces && (enlaces.planosMatch.length > 0 || enlaces.crucesMatch.length > 0) && (
                      <div className="flex flex-wrap items-center gap-1 pt-1">
                        {enlaces.planosMatch.map(codPlano => (
                          <button
                            key={codPlano}
                            type="button"
                            onClick={() => setActiveTab('planos')}
                            className="px-1.5 py-0.5 rounded bg-sky-950/60 hover:bg-sky-900/70 border border-sky-500/30 text-[9px] font-mono text-sky-300 cursor-pointer"
                            title="Ir al Catálogo de Planos"
                          >
                            Plano: {codPlano}
                          </button>
                        ))}
                        {enlaces.crucesMatch.map(emp => (
                          <button
                            key={emp}
                            type="button"
                            onClick={() => setActiveTab('interferencias')}
                            className="px-1.5 py-0.5 rounded bg-amber-950/60 hover:bg-amber-900/70 border border-amber-500/30 text-[9px] font-mono text-amber-300 cursor-pointer"
                            title="Ir a Cruces e Interferencias"
                          >
                            Cruce: {emp}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Línea compacta de pliegos indexados, adjuntos y barra única de atajos rápidos */}
        <div className="pt-3 border-t border-slate-800/80 text-xs text-slate-300 space-y-2.5">
          {pliegosReales.length > 0 ? (
            <div className="text-[11px] text-slate-300 flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 min-w-0 flex-wrap">
                <span className="font-semibold text-sky-400 whitespace-nowrap shrink-0">Pliegos activos:</span>
                <span className="text-slate-300 font-mono text-[10px] tabular-nums leading-relaxed">
                  {pliegosReales
                    .map(p => `${p.nombre} (${p.paginas ? `${p.paginas}p ` : ''}${p.tamanioTexto})`)
                    .join(' · ')}
                </span>
              </div>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-amber-200">
              <span>
                Sin pliegos cargados todavía. Puedes consultar de forma abierta o subir tus pliegos y conectar Drive para auditar documentos de obra.
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
            <div className="pt-2.5 border-t border-slate-800/70 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] font-bold text-emerald-400 flex items-center gap-1.5">
                  <FileCheck2 className="w-3.5 h-3.5" />
                  Documentos PDF adjuntos ({chatAdjuntos.length}):
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

              <div className="divide-y divide-slate-800/70 border-t border-slate-800/70">
                {chatAdjuntos.map(adj => (
                  <div
                    key={adj.id}
                    className="py-1.5 flex items-center justify-between gap-3 text-[11px]"
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
            <div className="pt-2 border-t border-slate-800/70 flex items-center gap-2 text-[11px] text-sky-300">
              <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
              <span className="font-mono tabular-nums">
                {progresoPdf?.detalle || 'Indexando documento PDF adjunto...'}
              </span>
            </div>
          )}

          {errorPdf && (
            <div className="pt-2 border-t border-slate-800/70 flex items-center gap-2 text-[11px] text-rose-300">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span>{errorPdf}</span>
            </div>
          )}

          {/* Atajos en una sola fila desplazable sin envolver en múltiples líneas */}
          <div className="pt-2.5 border-t border-slate-800/70 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            <span className="text-[10px] font-semibold text-slate-400 whitespace-nowrap shrink-0 mr-1">
              Auditoría rápida:
            </span>
            <button
              type="button"
              onClick={() =>
                handleSend(
                  'Verifica todas las Notas de Libro diferenciando los actores (UTE/Contratista vs. TRANSNOA vs. Inspección). Indica en una tabla Markdown cuáles notas fueron contestadas por TRANSNOA, cuáles tienen respuesta parcial o devolución con discrepancias y qué preguntas siguen SIN RESPUESTA.'
                )
              }
              className="px-2.5 py-1 bg-violet-950/70 hover:bg-violet-600/40 border border-violet-500/40 rounded-lg text-[10px] text-violet-200 font-semibold cursor-pointer transition-colors whitespace-nowrap shrink-0"
            >
              Respuestas de TRANSNOA
            </button>
            <button
              type="button"
              onClick={() =>
                handleSend(
                  'Arma un cuadro comparativo en tabla Markdown detectando TODAS las discrepancias y contradicciones entre Notas de Libro (ej. entre Notas de Pedido de la UTE y Órdenes/Notas de Servicio de TRANSNOA o contra el Pliego), citando código de nota, actor emisor, receptor y punto en conflicto.'
                )
              }
              className="px-2.5 py-1 bg-violet-950/70 hover:bg-violet-600/40 border border-violet-500/40 rounded-lg text-[10px] text-violet-200 font-semibold cursor-pointer transition-colors whitespace-nowrap shrink-0"
            >
              Discrepancias entre Notas
            </button>
            <button
              type="button"
              onClick={() =>
                handleSend(
                  'Genera un cuadro comparativo en tabla Markdown contrastando las especificaciones técnicas principales entre todos los tomos/pliegos cargados (alcance, normas, tolerancias, ensayos y plazos).'
                )
              }
              className="px-2.5 py-1 bg-slate-800 hover:bg-sky-600/30 border border-slate-700/70 rounded-lg text-[10px] text-slate-200 cursor-pointer transition-colors whitespace-nowrap shrink-0"
            >
              Comparar Pliegos
            </button>
            <button
              type="button"
              onClick={() =>
                handleSend(
                  'Genera una tabla comparativa con las discrepancias entre los Planos PDF cargados en el comparador y los Pliegos Reales, indicando parámetro, valor en plano, exigencia del pliego y estado.'
                )
              }
              className="px-2.5 py-1 bg-slate-800 hover:bg-sky-600/30 border border-slate-700/70 rounded-lg text-[10px] text-slate-200 cursor-pointer transition-colors whitespace-nowrap shrink-0"
            >
              Planos PDF vs. Pliego
            </button>
            <button
              type="button"
              onClick={() =>
                handleSend(
                  'Arma una matriz comparativa del estado actual de Hitos Contractuales e Interferencias/Cruces de la obra, identificando retrasos, faltantes y planes APC pendientes.'
                )
              }
              className="px-2.5 py-1 bg-slate-800 hover:bg-sky-600/30 border border-slate-700/70 rounded-lg text-[10px] text-slate-200 cursor-pointer transition-colors whitespace-nowrap shrink-0"
            >
              Matriz Hitos y Cruces
            </button>
          </div>
        </div>
      </div>

      {/* Historial de Mensajes */}
      <div
        ref={messagesContainerRef}
        className="bento-card p-3 sm:p-4 space-y-3 sm:space-y-4 min-h-[360px] sm:min-h-[420px] max-h-[600px] overflow-y-auto overflow-x-hidden scroll-smooth"
      >
        {chatMessages.map(msg => (
          <div
            key={msg.id}
            className={`flex flex-col ${msg.esUsuario ? 'items-end' : 'items-start'} w-full min-w-0 group`}
          >
            <div
              className={`p-3 sm:p-4 rounded-2xl text-xs leading-relaxed shadow-sm relative min-w-0 max-w-full overflow-hidden ${
                msg.esUsuario
                  ? 'bg-sky-600 text-white rounded-br-xs sm:max-w-2xl'
                  : 'bg-slate-950 border border-slate-800/90 text-slate-200 rounded-bl-xs w-full sm:max-w-4xl'
              }`}
            >
              {msg.esUsuario && msg.adjuntosNombres && msg.adjuntosNombres.length > 0 && (
                <div className="text-[10px] font-mono text-sky-100/90 pb-1.5 mb-1.5 border-b border-sky-400/30 flex items-center gap-1.5 min-w-0">
                  <Paperclip className="w-3 h-3 shrink-0" />
                  <span className="truncate">PDF adjuntos: {msg.adjuntosNombres.join(', ')}</span>
                </div>
              )}

              {!msg.esUsuario && (
                <div className="flex flex-wrap items-center justify-between border-b border-slate-800 pb-2 mb-2.5 gap-2">
                  <div className="flex items-center gap-2 text-[11px] font-bold text-sky-400 min-w-0 flex-wrap">
                    <span className="inline-flex items-center gap-1.5 min-w-0">
                      <FileText className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">Análisis Técnico, Libro de Notas & Comparativas</span>
                    </span>
                    {msg.precisionMeta && (
                      <span className="text-[9px] font-mono font-normal text-slate-300 bg-slate-900 border border-slate-800 rounded px-1.5 py-0.5 tabular-nums">
                        {msg.precisionMeta.etiquetaNivel} · {msg.precisionMeta.modeloUsado} ·{' '}
                        {(msg.precisionMeta.inputTokens + msg.precisionMeta.outputTokens).toLocaleString()} tok ·{' '}
                        <span className="text-emerald-300">${msg.precisionMeta.costoUsd.toFixed(4)}</span>
                      </span>
                    )}
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

      {/* Inputs ocultos para adjuntar PDF en Chat y subir Notas de Libro */}
      <input
        ref={pdfInputRef}
        type="file"
        multiple
        accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
        onChange={handleFileChange}
        className="hidden"
      />
      <input
        ref={notaLibroInputRef}
        type="file"
        multiple
        accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
        onChange={handleNotaLibroFilesChange}
        className="hidden"
      />

      {/* Barra de Entrada Multi-línea para consultas extensas */}
      <div className="space-y-1.5">
        <div className="flex items-end gap-2 min-w-0">
          <button
            type="button"
            onClick={() => pdfInputRef.current?.click()}
            disabled={subiendoPdf}
            className="h-11 sm:h-12 px-3 sm:px-3.5 bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-emerald-300 rounded-xl flex items-center justify-center font-semibold text-xs gap-1.5 cursor-pointer shrink-0 transition-colors whitespace-nowrap"
            title="Adjuntar PDF (ej. Orden de Servicio de TRANSNOA / devolución de archivos)"
          >
            {subiendoPdf ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Paperclip className="w-4 h-4" />
            )}
            <span className="hidden sm:inline">Adjuntar PDF</span>
          </button>

          <div className="relative flex-1 min-w-0">
            <textarea
              ref={textareaRef}
              id="txtChatInput"
              rows={1}
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Escribe o pega tu consulta extensa: Memorias Descriptivas, Estudios de Suelos, Notas de Libro, cálculos, normativa o análisis completo..."
              className="w-full min-h-[46px] max-h-[200px] overflow-y-auto resize-none bg-slate-900 border border-slate-700/80 rounded-xl px-3 sm:px-4 py-3 text-xs leading-relaxed text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 font-sans shadow-inner"
            />
          </div>
          <button
            type="button"
            onClick={() => handleSend()}
            className="h-11 sm:h-12 px-3.5 sm:px-6 bg-sky-600 hover:bg-sky-500 text-white rounded-xl flex items-center justify-center font-bold text-xs shadow-lg active:scale-95 transition-all gap-1.5 cursor-pointer shrink-0 whitespace-nowrap"
          >
            <Send className="w-4 h-4 shrink-0" />
            <span className="sm:hidden">Consultar</span>
            <span className="hidden sm:inline">Consultar IA</span>
          </button>
        </div>
        <div className="flex items-center justify-between text-[10px] text-slate-500 px-1">
          <span>
            <strong className="text-slate-400">Enter</strong> envía · <strong className="text-slate-400">Shift + Enter</strong> salta de línea para consultas extensas
          </span>
          {inputText.length > 0 && (
            <span className="font-mono tabular-nums">{inputText.length} caracteres</span>
          )}
        </div>
      </div>
    </div>
  );
};



