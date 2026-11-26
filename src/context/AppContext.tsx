import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useMemo,
  ReactNode,
} from 'react';
import {
  Plano,
  Hito,
  Interferencia,
  AppConfig,
  TabType,
  NotaAudio,
  FotoCampo,
  MensajeChat,
  PliegoReal,
  PlanoComparacionDoc,
  ChatAdjuntoPdf,
  MinutaReunion,
  CompromisoMinuta,
  NotaLibro,
  NotaPedidoIngenieria,
  EstadoCompromiso,
  PrecisionNivelId,
  GeminiPrecisionState,
  PoliticaLimiteModelo,
  DriveConnectionState,
} from '../types';
import { apiFetch, tryReadJsonResponse } from '../utils/apiClient';
import { DEFAULT_ELENCOS_FOLDER_ID } from '../utils/googleAuth';
import {
  WorkspaceInviteRecord,
  backfillWorkspaceMemberUids,
  subscribeWorkspaceRealtime,
  syncCompromisoToFirestore,
  syncFotoCampoToFirestore,
  syncHitosCollectionToFirestore,
  syncInterferenciasCollectionToFirestore,
  syncMinutaToFirestore,
  syncNotasLibroCollectionToFirestore,
  syncNotaPedidoToFirestore,
  syncPlanosCollectionToFirestore,
  syncPliegoToFirestore,
  syncWorkspaceSettingsFields,
} from '../utils/firestoreSync';
import { UIProvider, useUI } from './UIContext';
import { AuthProvider, useAuth } from './AuthContext';
import { DriveProvider, useDrive } from './DriveContext';
import { PliegosProvider, usePliegos } from './PliegosContext';
import { ObraProvider, useObra } from './ObraContext';
import { MinutasProvider, useMinutas } from './MinutasContext';
import { ChatProvider, useChat } from './ChatContext';
import type {
  SubidaProgresoInfo,
  AudioMinutaResultado,
  DriveSyncSnapshot,
  CloudSyncStatus,
} from './sharedTypes';

export type {
  SubidaProgresoInfo,
  AudioMinutaResultado,
  DriveSyncSnapshot,
  CloudSyncStatus,
};

export { useUI, useAuth, useDrive, usePliegos, useObra, useMinutas, useChat };

interface AppContextType {
  planos: Plano[];
  hitos: Hito[];
  interferencias: Interferencia[];
  pliegosReales: PliegoReal[];
  planoCompararA: PlanoComparacionDoc | null;
  planoCompararB: PlanoComparacionDoc | null;
  chatAdjuntos: ChatAdjuntoPdf[];
  minutas: MinutaReunion[];
  compromisosMinutas: CompromisoMinuta[];
  notasPedido: NotaPedidoIngenieria[];
  notasLibro: NotaLibro[];
  config: AppConfig;
  connectionStatus: string;
  cloudSyncStatus: CloudSyncStatus;
  cloudUserEmail: string | null;
  cloudRole: 'admin' | 'engineer' | null;
  invitedEmailHint: string;
  megabytesR2: string;
  activeTab: TabType;
  selectedFrenteFilter: string;
  isSyncing: boolean;
  notasCampo: string;
  audiosCampo: NotaAudio[];
  fotosCampo: FotoCampo[];
  chatMessages: MensajeChat[];
  ultimoInforme: string;
  totalPlanificados: number;
  planificadosPorFrente: Record<string, number>;
  elencosMeta: {
    fuente: string;
    ultimaSincronizacion: string | null;
    archivosAnalizados: number;
    folderId: string;
  };
  sincronizarElencosDrive: (params?: {
    accessToken?: string;
    folderId?: string;
  }) => Promise<{ totalPlanificados: number; porFrente: Record<string, number>; fuente: string }>;
  isSettingsOpen: boolean;
  isHitosModalOpen: boolean;
  isPliegosModalOpen: boolean;
  setActiveTab: (tab: TabType) => void;
  setSelectedFrenteFilter: (filter: string) => void;
  setIsSettingsOpen: (open: boolean) => void;
  setIsHitosModalOpen: (open: boolean) => void;
  setIsPliegosModalOpen: (open: boolean) => void;
  conectarNubeDispositivos: () => Promise<void>;
  conectarCorreoCorporativo: (email: string, password: string) => Promise<{ emailVerified: boolean }>;
  registrarCorreoCorporativo: (email: string, password: string, nombre?: string) => Promise<void>;
  reenviarMailVerificacion: () => Promise<void>;
  reintentarConexionNube: () => Promise<
    'sincronizado' | 'verificacion-pendiente' | 'acceso-pendiente' | 'sin-sesion'
  >;
  enviarResetClaveCorreo: (email: string) => Promise<void>;
  desconectarNubeDispositivos: () => Promise<void>;
  invitarColaboradorNube: (email: string) => Promise<void>;
  listarInvitacionesNube: () => Promise<WorkspaceInviteRecord[]>;
  revocarInvitacionNube: (inviteId: string) => Promise<void>;
  subirArchivoPliegoReal: (
    file: File,
    onProgress?: (info: SubidaProgresoInfo) => void
  ) => Promise<PliegoReal>;
  subirPlanoComparador: (
    rol: 'A' | 'B',
    file: File,
    onProgress?: (info: SubidaProgresoInfo) => void
  ) => Promise<PlanoComparacionDoc>;
  eliminarPlanoComparador: (rol: 'A' | 'B') => Promise<void>;
  subirAdjuntoChat: (
    file: File,
    onProgress?: (info: SubidaProgresoInfo) => void
  ) => Promise<ChatAdjuntoPdf>;
  eliminarAdjuntoChat: (id: string) => Promise<void>;
  limpiarAdjuntosChat: () => Promise<void>;
  agregarPliegoReal: (pliego: PliegoReal) => Promise<void>;
  eliminarPliegoReal: (id: string) => Promise<void>;
  limpiarTodosPliegosReales: () => Promise<void>;
  sincronizarInterferenciasDrive: (params?: {
    accessToken?: string;
    folderId?: string;
    forzarRelectura?: boolean;
  }) => Promise<{
    carpetaInterferenciasNombre: string;
    subcarpetasDetectadas: number;
    subcarpetasProcesadas: number;
    interferencias: Interferencia[];
    erroresCarpetas: Array<{ carpeta: string; error: string }>;
  }>;
  archivosPendientesNotasLibro: number;
  escaneoTruncadoNotasLibro: boolean;
  driveDocsCount: number;
  hasDriveToken: boolean;
  driveFolderId: string;
  setDriveFolderId: (val: string) => void;
  driveConnectionState: DriveConnectionState;
  ultimaSyncDrive: DriveSyncSnapshot | null;
  verificarConexionDriveLive: (
    folderIdOverride?: string,
    tokenOverride?: string
  ) => Promise<DriveConnectionState | null>;
  conectarGoogleDriveChat: (options?: { forceConsent?: boolean }) => Promise<boolean>;
  desconectarGoogleDrive: () => Promise<void>;
  sincronizarDocsTecnicosDrive: (params?: {
    folderId?: string;
    maxNuevos?: number;
  }) => Promise<{
    totalIndexados: number;
    nuevos: number;
    omitidosExistentes: number;
    nombresNuevos: string[];
  }>;
  sincronizarNotasLibroDrive: (params?: {
    accessToken?: string;
    folderId?: string;
    forzarRelectura?: boolean;
    continuarLote?: boolean;
  }) => Promise<{
    carpetaRaizNombre: string;
    carpetasEscaneadas: number;
    archivosDetectados: number;
    archivosOmitidosSinCodigo: number;
    notasNuevas: number;
    notasActualizadas: number;
    notasOmitidasPorExistentes: number;
    archivosPendientes: number;
    escaneoTruncado: boolean;
    notasLibro: NotaLibro[];
    erroresArchivos: Array<{ nombre: string; error: string }>;
  }>;
  subirNotaLibroArchivo: (file: File) => Promise<{ nota: NotaLibro; notasLibro: NotaLibro[] }>;
  registrarNotaLibroTexto: (payload: {
    titulo?: string;
    contenidoTexto: string;
  }) => Promise<{ nota: NotaLibro; notasLibro: NotaLibro[] }>;
  actualizarNotaLibro: (
    id: string,
    cambios: Partial<
      Pick<
        NotaLibro,
        | 'codigo'
        | 'tipoNota'
        | 'actorEmisor'
        | 'emisorDetalle'
        | 'actorReceptor'
        | 'receptorDetalle'
        | 'sentido'
        | 'estadoRespuesta'
        | 'referenciasNotas'
        | 'resumen'
      >
    >
  ) => Promise<void>;
  eliminarNotaLibro: (id: string) => Promise<void>;
  sincronizarMinutasDrive: (params?: {
    accessToken?: string;
    folderId?: string;
    buscarEnTodoDrive?: boolean;
  }) => Promise<{
    carpetaRaizNombre: string;
    carpetasEscaneadas: number;
    archivosDetectados: number;
    minutasNuevas: MinutaReunion[];
    minutasActualizadas: number;
    minutasOmitidasPorExistentes: number;
    compromisosNuevos: CompromisoMinuta[];
    erroresArchivos: Array<{ nombre: string; error: string }>;
  }>;
  subirMinutaArchivo: (
    file: File,
    meta?: { codigo?: string; titulo?: string; fechaReunion?: string; frente?: string; participantes?: string }
  ) => Promise<{ minuta: MinutaReunion; compromisosExtraidos: CompromisoMinuta[]; fuenteExtraccion: string }>;
  transcribirAudioMinuta: (
    audio: Blob | File,
    options?: {
      nombreArchivo?: string;
      modeloMinutaId?: string;
      codigo?: string;
      titulo?: string;
      fechaReunion?: string;
      frente?: string;
      participantes?: string;
      motor?: 'gratuito' | 'gemini';
    },
    onProgress?: (info: SubidaProgresoInfo) => void
  ) => Promise<AudioMinutaResultado>;
  registrarMinutaTexto: (payload: {
    codigo?: string;
    titulo?: string;
    fechaReunion?: string;
    frente?: string;
    participantes?: string;
    contenidoTexto?: string;
    compromisosManuales?: Array<{
      descripcion: string;
      responsable?: string;
      area?: string;
      frente?: string;
      fechaLimite?: string;
      estado?: EstadoCompromiso;
      documentosRelacionados?: string[];
    }>;
    extraerAutomaticamente?: boolean;
  }) => Promise<{ minuta: MinutaReunion; compromisosExtraidos: CompromisoMinuta[]; fuenteExtraccion: string }>;
  eliminarMinuta: (id: string) => Promise<void>;
  agregarCompromisoMinuta: (payload: {
    minutaId?: string;
    minutaCodigo?: string;
    minutaFecha?: string;
    descripcion: string;
    responsable?: string;
    area?: string;
    frente?: string;
    fechaLimite?: string;
    estado?: EstadoCompromiso;
    observaciones?: string;
    documentosRelacionados?: string[];
  }) => Promise<CompromisoMinuta>;
  actualizarCompromisoMinuta: (
    id: string,
    cambios: Partial<
      Pick<CompromisoMinuta, 'estado' | 'responsable' | 'fechaLimite' | 'descripcion' | 'observaciones' | 'frente'>
    >
  ) => Promise<void>;
  eliminarCompromisoMinuta: (id: string) => Promise<void>;
  generarNotaPedido: (payload: {
    compromisoIds: string[];
    numeroNota?: string;
    fechaEmision?: string;
    emisor?: string;
    destinatario?: string;
    frente?: string;
    asunto?: string;
    plazoDescargoDias?: number;
    encuadreAdicional?: string;
  }) => Promise<NotaPedidoIngenieria>;
  eliminarNotaPedido: (id: string) => Promise<void>;
  updateConfig: (cfg: AppConfig) => void;
  sincronizarDatos: () => Promise<void>;
  saveHitos: (nuevosHitos: Hito[]) => Promise<void>;
  setNotasCampo: (notas: string) => void;
  addFoto: (foto: FotoCampo) => void;
  actualizarFotoAnalisis: (id: string, analisisIA: string) => void;
  deleteFoto: (id: string) => void;
  addAudio: (audio: NotaAudio) => void;
  actualizarAudioTranscripcion: (id: string, transcripcion: string) => void;
  deleteAudio: (id: string) => void;
  sendChatMessage: (texto: string, precisionOverride?: PrecisionNivelId) => Promise<void>;
  extraerDePliego: (consulta: string) => Promise<string>;
  clearChat: () => void;
  setUltimoInforme: (inf: string) => void;
  precisionNivel: PrecisionNivelId;
  setPrecisionNivel: (nivel: PrecisionNivelId) => void;
  geminiPrecisionState: GeminiPrecisionState | null;
  esUsuarioMaestro: boolean;
  modelosPagosHabilitados: boolean;
  puedeUsarModelosPagos: boolean;
  usuariosPagosAutorizados: string[];
  limitesPorUsuarioUsd: Record<string, number>;
  toggleModelosPagosMaestro: (habilitado: boolean) => Promise<GeminiPrecisionState | null>;
  actualizarControlMaestroIA: (payload: {
    modelosPagosHabilitados?: boolean;
    usuariosPagosAutorizados?: string[];
    limitesPorUsuarioUsd?: Record<string, number>;
  }) => Promise<GeminiPrecisionState | null>;
  refrescarEstadoGemini: () => Promise<GeminiPrecisionState | null>;
  guardarConfigPrecision: (payload: {
    nivelPreferido?: PrecisionNivelId;
    politicaLimite?: PoliticaLimiteModelo;
    openRouterModeloPreferido?: string;
    limitesPorModelo?: Record<string, { maxConsultasDiarias?: number; maxCostoUsdDiario?: number }>;
  }) => Promise<GeminiPrecisionState | null>;
  resetearUsoGemini: (modelo?: string) => Promise<GeminiPrecisionState | null>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const AppAggregator: React.FC<{ children: ReactNode }> = ({ children }) => {
  const ui = useUI();
  const authCtx = useAuth();
  const drive = useDrive();
  const pliegos = usePliegos();
  const obra = useObra();
  const minutasCtx = useMinutas();
  const chat = useChat();

  const {
    config,
    setConfig,
    cloudSession,
    setCloudSession,
    cloudSessionRef,
  } = authCtx;
  const { setDriveDocsCount, setDriveFolderIdState } = drive;
  const {
    pliegosReales,
    setPliegosReales,
    setPlanoCompararA,
    setPlanoCompararB,
    setChatAdjuntos,
    pliegosHydratedServerRef,
    guardarMetadataLocal,
    hidratarPliegoEnServidorLocal,
    hidratarChatAdjuntosEnServidorLocal,
    resincronizarPliegosDesdeIDB,
  } = pliegos;
  const {
    planos,
    setPlanos,
    hitos,
    setHitos,
    setTotalPlanificados,
    setPlanificadosPorFrente,
    setElencosMeta,
    setMegabytesR2,
    ultimoInforme,
    setUltimoInformeState,
    interferencias,
    setInterferencias,
    hidratarInterferenciasEnServidorLocal,
    notasLibro,
    setNotasLibro,
    hidratarNotasLibroEnServidorLocal,
    notasCampo,
    setNotasCampoState,
    fotosCampo,
    setFotosCampo,
    setAudiosCampo,
  } = obra;
  const {
    minutas,
    setMinutas,
    compromisosMinutas,
    setCompromisosMinutas,
    notasPedido,
    setNotasPedido,
    persistirMinutasLocal,
    hidratarMinutasEnServidorLocal,
  } = minutasCtx;

  // Refs para acceso seguro desde listeners/seeders sin disparar re-suscripciones
  const stateSnapshotRef = useRef({
    hitos,
    planos,
    pliegosReales,
    minutas,
    compromisosMinutas,
    notasPedido,
    notasLibro,
    interferencias,
    notasCampo,
    config,
    ultimoInforme,
    fotosCampo,
  });
  useEffect(() => {
    stateSnapshotRef.current = {
      hitos,
      planos,
      pliegosReales,
      minutas,
      compromisosMinutas,
      notasPedido,
      notasLibro,
      interferencias,
      notasCampo,
      config,
      ultimoInforme,
      fotosCampo,
    };
  }, [
    hitos,
    planos,
    pliegosReales,
    minutas,
    compromisosMinutas,
    notasPedido,
    notasLibro,
    interferencias,
    notasCampo,
    config,
    ultimoInforme,
    fotosCampo,
  ]);

  const backfilledMemberUidsKeyRef = useRef<string>('');

  // Al iniciar, sincronizar pliegos, planos comparador, minutas, interferencias, notas de libro y docs Drive del servidor
  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const [
          resPliegos,
          resPlanos,
          resMinutas,
          resChatAdj,
          resInterf,
          resNotasLibro,
          resDriveDocs,
          resElencos,
        ] = await Promise.all([
          apiFetch('/api/pliegos'),
          apiFetch('/api/comparador/planos'),
          apiFetch('/api/minutas'),
          apiFetch('/api/chat/adjuntos'),
          apiFetch('/api/interferencias'),
          apiFetch('/api/notas-libro'),
          apiFetch('/api/drive-docs'),
          apiFetch('/api/elencos'),
        ]);
        if (cancelado) return;
        if (resPliegos.ok) {
          const data = await tryReadJsonResponse(resPliegos);
          if (Array.isArray(data?.pliegos) && data.pliegos.length > 0) {
            setPliegosReales(data.pliegos);
            guardarMetadataLocal(data.pliegos);
            for (const p of data.pliegos) {
              if (p?.id) pliegosHydratedServerRef.current.add(p.id);
            }
          } else {
            await resincronizarPliegosDesdeIDB();
          }
        }
        if (resPlanos.ok && !cancelado) {
          const cmpData = await tryReadJsonResponse(resPlanos);
          if (cmpData?.planoA) setPlanoCompararA(cmpData.planoA);
          if (cmpData?.planoB) setPlanoCompararB(cmpData.planoB);
        }
        if (resMinutas.ok && !cancelado) {
          const minData = await tryReadJsonResponse(resMinutas);
          if (minData?.exito) {
            const mList = Array.isArray(minData.minutas) ? minData.minutas : [];
            const cList = Array.isArray(minData.compromisos) ? minData.compromisos : [];
            const npList = Array.isArray(minData.notasPedido) ? minData.notasPedido : [];
            if (mList.length > 0 || cList.length > 0 || npList.length > 0) {
              setMinutas(mList);
              setCompromisosMinutas(cList);
              setNotasPedido(npList);
              persistirMinutasLocal(mList, cList, npList);
            }
          }
        }
        if (resChatAdj.ok && !cancelado) {
          const adjData = await tryReadJsonResponse(resChatAdj);
          if (Array.isArray(adjData?.adjuntos)) {
            setChatAdjuntos(adjData.adjuntos);
          }
        }
        if (resInterf.ok && !cancelado) {
          const intData = await tryReadJsonResponse(resInterf);
          if (Array.isArray(intData?.interferencias) && intData.interferencias.length > 0) {
            setInterferencias(intData.interferencias);
            localStorage.setItem(
              'cache_interferencias_132kv',
              JSON.stringify(intData.interferencias)
            );
          }
        }
        if (resNotasLibro.ok && !cancelado) {
          const nlData = await tryReadJsonResponse(resNotasLibro);
          if (Array.isArray(nlData?.notasLibro) && nlData.notasLibro.length > 0) {
            setNotasLibro(nlData.notasLibro);
            try {
              localStorage.setItem('cache_notas_libro_132kv', JSON.stringify(nlData.notasLibro));
            } catch {}
          }
        }
        if (resDriveDocs.ok && !cancelado) {
          const ddData = await tryReadJsonResponse(resDriveDocs);
          if (typeof ddData?.total === 'number') {
            setDriveDocsCount(ddData.total);
          }
        }
        if (resElencos.ok && !cancelado) {
          const elData = await tryReadJsonResponse(resElencos);
          if (elData?.exito) {
            if (
              Number.isFinite(Number(elData.totalPlanificados)) &&
              Number(elData.totalPlanificados) > 0
            ) {
              setTotalPlanificados(Math.round(Number(elData.totalPlanificados)));
            }
            if (elData.porFrente && typeof elData.porFrente === 'object') {
              setPlanificadosPorFrente(elData.porFrente);
            }
            setElencosMeta({
              fuente: String(elData.fuente || 'Seguimiento de Elencos (Base 543)'),
              ultimaSincronizacion: elData.ultimaSincronizacion || null,
              archivosAnalizados: Array.isArray(elData.archivosAnalizados)
                ? elData.archivosAnalizados.length
                : 0,
              folderId: String(elData.folderId || DEFAULT_ELENCOS_FOLDER_ID),
            });
          }
        }
      } catch {}
    })();
    return () => {
      cancelado = true;
    };
  }, [
    resincronizarPliegosDesdeIDB,
    guardarMetadataLocal,
    persistirMinutasLocal,
    pliegosHydratedServerRef,
    setPliegosReales,
    setPlanoCompararA,
    setPlanoCompararB,
    setMinutas,
    setCompromisosMinutas,
    setNotasPedido,
    setChatAdjuntos,
    setInterferencias,
    setNotasLibro,
    setDriveDocsCount,
    setTotalPlanificados,
    setPlanificadosPorFrente,
    setElencosMeta,
  ]);

  // Orquestador en tiempo real con Firestore al iniciar sesión en un workspace
  const sessionKey = cloudSession
    ? `${cloudSession.uid}:${cloudSession.workspaceId}:${cloudSession.role}`
    : '';
  useEffect(() => {
    const session = cloudSessionRef.current;
    if (!session || !sessionKey) return;

    let unsubFirestore: (() => void) | null = null;
    let cancelled = false;

    (async () => {
      // Si el workspace es nuevo en Firestore, sembrar los datos locales actuales (sin datos ficticios de cruces)
      if (!session.workspaceExists) {
        const snap = stateSnapshotRef.current;
        try {
          await syncWorkspaceSettingsFields(session, {
            config: snap.config,
            notasCampo: snap.notasCampo,
            ultimoInforme: snap.ultimoInforme,
          });
          if (snap.hitos.length > 0) {
            await syncHitosCollectionToFirestore(session, snap.hitos, []);
          }
          if (snap.planos.length > 0) {
            await syncPlanosCollectionToFirestore(session, snap.planos);
          }
          for (const pl of snap.pliegosReales) {
            await syncPliegoToFirestore(session, pl);
          }
          for (const m of snap.minutas) {
            await syncMinutaToFirestore(session, m);
          }
          for (const c of snap.compromisosMinutas) {
            await syncCompromisoToFirestore(session, c);
          }
          for (const np of snap.notasPedido) {
            await syncNotaPedidoToFirestore(session, np);
          }
          if (snap.interferencias.length > 0) {
            await syncInterferenciasCollectionToFirestore(session, snap.interferencias, []);
          }
          if (snap.notasLibro.length > 0) {
            await syncNotasLibroCollectionToFirestore(session, snap.notasLibro, []);
          }
          for (const ft of snap.fotosCampo) {
            await syncFotoCampoToFirestore(session, ft);
          }
        } catch (seedErr) {
          console.warn('[FirestoreSync] Error sembrando datos iniciales:', seedErr);
        }
      }

      if (cancelled) return;

      unsubFirestore = subscribeWorkspaceRealtime(session, {
        onWorkspaceFields: ws => {
          setConfig(prev => {
            const next: AppConfig = {
              apiUrl: ws.config.apiUrl ?? prev.apiUrl,
              r2AccountId: ws.config.r2AccountId || prev.r2AccountId,
              r2Bucket: ws.config.r2Bucket || prev.r2Bucket,
            };
            localStorage.setItem('cfg_api_url', next.apiUrl);
            localStorage.setItem('cfg_r2_account_id', next.r2AccountId);
            localStorage.setItem('cfg_r2_bucket', next.r2Bucket);
            return next;
          });
          setNotasCampoState(ws.notasCampo);
          localStorage.setItem('notas_obra_132kv', ws.notasCampo);
          if (ws.ultimoInforme) setUltimoInformeState(ws.ultimoInforme);
          if (ws.megabytesR2) setMegabytesR2(ws.megabytesR2);
          if (ws.defaultDriveFolderId && ws.defaultDriveFolderId.trim()) {
            setDriveFolderIdState(ws.defaultDriveFolderId.trim());
            try {
              localStorage.setItem(
                'drive_folder_notas_libro_132kv',
                ws.defaultDriveFolderId.trim()
              );
            } catch {}
          }
          setCloudSession(prev => (prev ? { ...prev, memberUids: ws.memberUids } : prev));

          if (session.role === 'admin' && ws.memberUids.length > 1) {
            const sigUids = [...ws.memberUids].sort().join(',');
            if (backfilledMemberUidsKeyRef.current !== sigUids) {
              backfilledMemberUidsKeyRef.current = sigUids;
              void backfillWorkspaceMemberUids(
                { ...session, memberUids: ws.memberUids },
                ws.memberUids
              );
            }
          }
        },
        onHitos: items => {
          setHitos(items);
          localStorage.setItem('cache_hitos_obra_132kv', JSON.stringify(items));
        },
        onPlanos: items => {
          setPlanos(items);
          localStorage.setItem('cache_planos_132kv', JSON.stringify(items));
        },
        onInterferencias: items => {
          setInterferencias(items);
          localStorage.setItem('cache_interferencias_132kv', JSON.stringify(items));
          void hidratarInterferenciasEnServidorLocal(items);
        },
        onPliegos: items => {
          setPliegosReales(items);
          guardarMetadataLocal(items);
          for (const p of items) {
            void hidratarPliegoEnServidorLocal(p);
          }
        },
        onMinutas: items => {
          setMinutas(items);
          const snap = stateSnapshotRef.current;
          persistirMinutasLocal(items, snap.compromisosMinutas, snap.notasPedido);
          void hidratarMinutasEnServidorLocal(items, snap.compromisosMinutas, snap.notasPedido);
        },
        onCompromisos: items => {
          setCompromisosMinutas(items);
          const snap = stateSnapshotRef.current;
          persistirMinutasLocal(snap.minutas, items, snap.notasPedido);
          void hidratarMinutasEnServidorLocal(snap.minutas, items, snap.notasPedido);
        },
        onNotasPedido: items => {
          setNotasPedido(items);
          const snap = stateSnapshotRef.current;
          persistirMinutasLocal(snap.minutas, snap.compromisosMinutas, items);
          void hidratarMinutasEnServidorLocal(snap.minutas, snap.compromisosMinutas, items);
        },
        onFotosCampo: items => {
          setFotosCampo(items);
          try {
            localStorage.setItem('fotos_obra_132kv', JSON.stringify(items));
          } catch {}
        },
        onAudiosCampo: items => {
          setAudiosCampo(items);
          try {
            localStorage.setItem('audios_obra_132kv', JSON.stringify(items));
          } catch {}
        },
        onChatAdjuntos: items => {
          setChatAdjuntos(items);
          void hidratarChatAdjuntosEnServidorLocal(items);
        },
        onNotasLibro: items => {
          setNotasLibro(items);
          try {
            localStorage.setItem('cache_notas_libro_132kv', JSON.stringify(items));
          } catch {}
          void hidratarNotasLibroEnServidorLocal(items);
        },
      });
    })();

    return () => {
      cancelled = true;
      if (unsubFirestore) {
        unsubFirestore();
      }
    };
  }, [
    sessionKey,
    cloudSessionRef,
    setConfig,
    setNotasCampoState,
    setUltimoInformeState,
    setMegabytesR2,
    setDriveFolderIdState,
    setCloudSession,
    setHitos,
    setPlanos,
    setInterferencias,
    hidratarInterferenciasEnServidorLocal,
    setPliegosReales,
    guardarMetadataLocal,
    hidratarPliegoEnServidorLocal,
    setMinutas,
    persistirMinutasLocal,
    hidratarMinutasEnServidorLocal,
    setCompromisosMinutas,
    setNotasPedido,
    setFotosCampo,
    setAudiosCampo,
    setChatAdjuntos,
    hidratarChatAdjuntosEnServidorLocal,
    setNotasLibro,
    hidratarNotasLibroEnServidorLocal,
  ]);

  const value = useMemo<AppContextType>(
    () => ({
      // Obra
      planos: obra.planos,
      hitos: obra.hitos,
      interferencias: obra.interferencias,
      notasLibro: obra.notasLibro,
      megabytesR2: obra.megabytesR2,
      notasCampo: obra.notasCampo,
      audiosCampo: obra.audiosCampo,
      fotosCampo: obra.fotosCampo,
      ultimoInforme: obra.ultimoInforme,
      totalPlanificados: obra.totalPlanificados,
      planificadosPorFrente: obra.planificadosPorFrente,
      elencosMeta: obra.elencosMeta,
      sincronizarElencosDrive: obra.sincronizarElencosDrive,
      sincronizarInterferenciasDrive: obra.sincronizarInterferenciasDrive,
      archivosPendientesNotasLibro: obra.archivosPendientesNotasLibro,
      escaneoTruncadoNotasLibro: obra.escaneoTruncadoNotasLibro,
      sincronizarNotasLibroDrive: obra.sincronizarNotasLibroDrive,
      subirNotaLibroArchivo: obra.subirNotaLibroArchivo,
      registrarNotaLibroTexto: obra.registrarNotaLibroTexto,
      actualizarNotaLibro: obra.actualizarNotaLibro,
      eliminarNotaLibro: obra.eliminarNotaLibro,
      sincronizarDatos: obra.sincronizarDatos,
      saveHitos: obra.saveHitos,
      setNotasCampo: obra.setNotasCampo,
      addFoto: obra.addFoto,
      actualizarFotoAnalisis: obra.actualizarFotoAnalisis,
      deleteFoto: obra.deleteFoto,
      addAudio: obra.addAudio,
      actualizarAudioTranscripcion: obra.actualizarAudioTranscripcion,
      deleteAudio: obra.deleteAudio,
      setUltimoInforme: obra.setUltimoInforme,

      // Pliegos / Comparador / Adjuntos Chat
      pliegosReales: pliegos.pliegosReales,
      planoCompararA: pliegos.planoCompararA,
      planoCompararB: pliegos.planoCompararB,
      chatAdjuntos: pliegos.chatAdjuntos,
      subirArchivoPliegoReal: pliegos.subirArchivoPliegoReal,
      subirPlanoComparador: pliegos.subirPlanoComparador,
      eliminarPlanoComparador: pliegos.eliminarPlanoComparador,
      subirAdjuntoChat: pliegos.subirAdjuntoChat,
      eliminarAdjuntoChat: pliegos.eliminarAdjuntoChat,
      limpiarAdjuntosChat: pliegos.limpiarAdjuntosChat,
      agregarPliegoReal: pliegos.agregarPliegoReal,
      eliminarPliegoReal: pliegos.eliminarPliegoReal,
      limpiarTodosPliegosReales: pliegos.limpiarTodosPliegosReales,
      extraerDePliego: pliegos.extraerDePliego,

      // Minutas / Compromisos / Notas de Pedido
      minutas: minutasCtx.minutas,
      compromisosMinutas: minutasCtx.compromisosMinutas,
      notasPedido: minutasCtx.notasPedido,
      sincronizarMinutasDrive: minutasCtx.sincronizarMinutasDrive,
      subirMinutaArchivo: minutasCtx.subirMinutaArchivo,
      transcribirAudioMinuta: minutasCtx.transcribirAudioMinuta,
      registrarMinutaTexto: minutasCtx.registrarMinutaTexto,
      eliminarMinuta: minutasCtx.eliminarMinuta,
      agregarCompromisoMinuta: minutasCtx.agregarCompromisoMinuta,
      actualizarCompromisoMinuta: minutasCtx.actualizarCompromisoMinuta,
      eliminarCompromisoMinuta: minutasCtx.eliminarCompromisoMinuta,
      generarNotaPedido: minutasCtx.generarNotaPedido,
      eliminarNotaPedido: minutasCtx.eliminarNotaPedido,

      // UI
      connectionStatus: ui.connectionStatus,
      invitedEmailHint: ui.invitedEmailHint,
      activeTab: ui.activeTab,
      selectedFrenteFilter: ui.selectedFrenteFilter,
      isSyncing: ui.isSyncing,
      isSettingsOpen: ui.isSettingsOpen,
      isHitosModalOpen: ui.isHitosModalOpen,
      isPliegosModalOpen: ui.isPliegosModalOpen,
      setActiveTab: ui.setActiveTab,
      setSelectedFrenteFilter: ui.setSelectedFrenteFilter,
      setIsSettingsOpen: ui.setIsSettingsOpen,
      setIsHitosModalOpen: ui.setIsHitosModalOpen,
      setIsPliegosModalOpen: ui.setIsPliegosModalOpen,

      // Auth & Config & Master Control IA
      config: authCtx.config,
      updateConfig: authCtx.updateConfig,
      cloudSyncStatus: authCtx.cloudSyncStatus,
      cloudUserEmail: authCtx.cloudUserEmail,
      cloudRole: authCtx.cloudRole,
      conectarNubeDispositivos: authCtx.conectarNubeDispositivos,
      conectarCorreoCorporativo: authCtx.conectarCorreoCorporativo,
      registrarCorreoCorporativo: authCtx.registrarCorreoCorporativo,
      reenviarMailVerificacion: authCtx.reenviarMailVerificacion,
      reintentarConexionNube: authCtx.reintentarConexionNube,
      enviarResetClaveCorreo: authCtx.enviarResetClaveCorreo,
      desconectarNubeDispositivos: authCtx.desconectarNubeDispositivos,
      invitarColaboradorNube: authCtx.invitarColaboradorNube,
      listarInvitacionesNube: authCtx.listarInvitacionesNube,
      revocarInvitacionNube: authCtx.revocarInvitacionNube,
      precisionNivel: authCtx.precisionNivel,
      setPrecisionNivel: authCtx.setPrecisionNivel,
      geminiPrecisionState: authCtx.geminiPrecisionState,
      esUsuarioMaestro: authCtx.esUsuarioMaestro,
      modelosPagosHabilitados: authCtx.modelosPagosHabilitados,
      puedeUsarModelosPagos: authCtx.puedeUsarModelosPagos,
      usuariosPagosAutorizados: authCtx.usuariosPagosAutorizados,
      limitesPorUsuarioUsd: authCtx.limitesPorUsuarioUsd,
      toggleModelosPagosMaestro: authCtx.toggleModelosPagosMaestro,
      actualizarControlMaestroIA: authCtx.actualizarControlMaestroIA,
      refrescarEstadoGemini: authCtx.refrescarEstadoGemini,
      guardarConfigPrecision: authCtx.guardarConfigPrecision,
      resetearUsoGemini: authCtx.resetearUsoGemini,

      // Drive
      driveDocsCount: drive.driveDocsCount,
      hasDriveToken: drive.hasDriveToken,
      driveFolderId: drive.driveFolderId,
      setDriveFolderId: drive.setDriveFolderId,
      driveConnectionState: drive.driveConnectionState,
      ultimaSyncDrive: drive.ultimaSyncDrive,
      verificarConexionDriveLive: drive.verificarConexionDriveLive,
      conectarGoogleDriveChat: drive.conectarGoogleDriveChat,
      desconectarGoogleDrive: drive.desconectarGoogleDrive,
      sincronizarDocsTecnicosDrive: drive.sincronizarDocsTecnicosDrive,

      // Chat
      chatMessages: chat.chatMessages,
      sendChatMessage: chat.sendChatMessage,
      clearChat: chat.clearChat,
    }),
    [obra, pliegos, minutasCtx, ui, authCtx, drive, chat]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => (
  <UIProvider>
    <AuthProvider>
      <DriveProvider>
        <PliegosProvider>
          <ObraProvider>
            <MinutasProvider>
              <ChatProvider>
                <AppAggregator>{children}</AppAggregator>
              </ChatProvider>
            </MinutasProvider>
          </ObraProvider>
        </PliegosProvider>
      </DriveProvider>
    </AuthProvider>
  </UIProvider>
);

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within an AppProvider');
  return context;
};
