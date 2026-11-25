import React, { createContext, useContext, useState, useEffect, useRef, ReactNode, useCallback } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
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
  GeminiPrecisionMeta,
  PoliticaLimiteModelo,
  DriveConnectionState,
} from '../types';
import {
  TOTAL_PLANIFICADOS_CONTRATO_GLOBAL,
  PLANOS_INICIALES_FIJOS,
  HITOS_CONTRATUALES_INICIALES_FIJOS,
  INTERFERENCIAS_INICIALES,
} from '../data/initialData';
import { buscarYExtraerDePliegosReales } from '../data/pliegosContractuales';
import {
  guardarArchivoEnIDB,
  obtenerTodosArchivosIDB,
  eliminarArchivoDeIDB,
  limpiarTodosArchivosIDB,
} from '../utils/pliegoStorage';
import { auth } from '../firebase';
import { apiFetch, readJsonResponse, tryReadJsonResponse } from '../utils/apiClient';
import {
  DEFAULT_DRIVE_ROOT_FOLDER_ID,
  DEFAULT_ELENCOS_FOLDER_ID,
  clearGoogleDriveAccessToken,
  extraerDriveFolderId,
  getGoogleDriveAccessToken,
  getGoogleDriveTokenInfo,
  markDriveConsentNeeded,
  runWithDriveToken,
  signInWithGoogleDrive,
  signOutGoogleDrive,
  subscribeDriveToken,
} from '../utils/googleAuth';
import {
  iniciarSesionCorreoCorporativo,
  reenviarVerificacionCorreo,
  registrarConCorreoCorporativo,
  restablecerClaveCorreo,
  verificarEstadoEmailActual,
} from '../utils/corporateAuth';
import {
  BOOTSTRAP_ADMIN_EMAIL,
  WorkspaceInviteRecord,
  WorkspaceSessionInfo,
  backfillWorkspaceMemberUids,
  bootstrapWorkspaceForUser,
  deletePliegoFromFirestore,
  deleteWorkspaceSubdoc,
  invitarColaboradorWorkspace,
  listarInvitacionesWorkspace,
  revocarInvitacionWorkspace,
  setWorkspaceIAControl,
  subscribeWorkspaceIAControl,
  subscribeWorkspaceRealtime,
  syncAudioCampoToFirestore,
  syncChatAdjuntoToFirestore,
  syncCompromisoToFirestore,
  syncFotoCampoToFirestore,
  syncHitosCollectionToFirestore,
  syncInterferenciasCollectionToFirestore,
  syncMinutaToFirestore,
  syncNotaLibroToFirestore,
  syncNotasLibroCollectionToFirestore,
  syncNotaPedidoToFirestore,
  syncPlanosCollectionToFirestore,
  syncPliegoToFirestore,
  syncWorkspaceSettingsFields,
} from '../utils/firestoreSync';

export interface SubidaProgresoInfo {
  fase: 'subiendo' | 'procesando';
  porcentaje: number;
  detalle: string;
}

export interface AudioMinutaResultado {
  transcripcionMarcaTiempo: string;
  transcripcionLimpia: string;
  borradorMarkdown: string;
  segmentosProcesados: number;
  modeloTranscripcion: string;
  fuenteRedaccion: string;
  modeloReferenciaUsado: string | null;
}

export type CloudSyncStatus =
  | 'sin-sesion'
  | 'conectando'
  | 'verificacion-pendiente'
  | 'acceso-pendiente'
  | 'sincronizado'
  | 'error';

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
  reintentarConexionNube: () => Promise<'sincronizado' | 'verificacion-pendiente' | 'acceso-pendiente' | 'sin-sesion'>;
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
    cambios: Partial<Pick<CompromisoMinuta, 'estado' | 'responsable' | 'fechaLimite' | 'descripcion' | 'observaciones' | 'frente'>>
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
  toggleModelosPagosMaestro: (habilitado: boolean) => Promise<GeminiPrecisionState | null>;
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

function filtrarInterferenciasRealesCache(lista: any[]): Interferencia[] {
  if (!Array.isArray(lista)) return [];
  // Purgar datos ficticios anteriores (INT-1..INT-5 sin origen Drive real)
  return lista.filter(
    item => item && (item.origen === 'drive' || !/^INT-[1-5]$/.test(String(item.id || '')))
  );
}

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Config
  const [config, setConfig] = useState<AppConfig>(() => ({
    apiUrl: localStorage.getItem('cfg_api_url') || '',
    r2AccountId: localStorage.getItem('cfg_r2_account_id') || 'e1d197bd1aa5e242733d883eab2a9322',
    r2Bucket: localStorage.getItem('cfg_r2_bucket') || 'backup-obra-132kv',
  }));

  // App State
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [selectedFrenteFilter, setSelectedFrenteFilter] = useState<string>('TODOS');
  const [connectionStatus, setConnectionStatus] = useState<string>('Conectado');
  const [cloudSyncStatus, setCloudSyncStatus] = useState<CloudSyncStatus>('sin-sesion');
  const [cloudUserEmail, setCloudUserEmail] = useState<string | null>(null);
  const [cloudSession, setCloudSession] = useState<WorkspaceSessionInfo | null>(null);
  const cloudSessionRef = useRef<WorkspaceSessionInfo | null>(null);
  useEffect(() => {
    cloudSessionRef.current = cloudSession;
  }, [cloudSession]);

  const [invitedEmailHint] = useState<string>(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      const raw = sp.get('invitar') || sp.get('inviteEmail') || '';
      return raw.trim().toLowerCase();
    } catch {
      return '';
    }
  });
  const [megabytesR2, setMegabytesR2] = useState<string>('156.4 MB');
  const [totalPlanificados, setTotalPlanificados] = useState<number>(
    TOTAL_PLANIFICADOS_CONTRATO_GLOBAL
  );
  const [planificadosPorFrente, setPlanificadosPorFrente] = useState<Record<string, number>>({});
  const [elencosMeta, setElencosMeta] = useState<{
    fuente: string;
    ultimaSincronizacion: string | null;
    archivosAnalizados: number;
    folderId: string;
  }>({
    fuente: 'Seguimiento de Elencos (Base 543)',
    ultimaSincronizacion: null,
    archivosAnalizados: 0,
    folderId: DEFAULT_ELENCOS_FOLDER_ID,
  });
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      return Boolean((sp.get('invitar') || sp.get('inviteEmail') || '').trim());
    } catch {
      return false;
    }
  });
  const [isHitosModalOpen, setIsHitosModalOpen] = useState<boolean>(false);
  const [isPliegosModalOpen, setIsPliegosModalOpen] = useState<boolean>(false);
  const [driveDocsCount, setDriveDocsCount] = useState<number>(0);
  const [hasDriveToken, setHasDriveToken] = useState<boolean>(() => Boolean(getGoogleDriveAccessToken()));
  const [driveFolderId, setDriveFolderIdState] = useState<string>(
    () => localStorage.getItem('drive_folder_notas_libro_132kv') || DEFAULT_DRIVE_ROOT_FOLDER_ID
  );
  const setDriveFolderId = useCallback((val: string) => {
    setDriveFolderIdState(val);
    try {
      localStorage.setItem('drive_folder_notas_libro_132kv', val);
    } catch {}
  }, []);
  const [driveConnectionState, setDriveConnectionState] = useState<DriveConnectionState>(() => {
    const info = getGoogleDriveTokenInfo();
    return {
      connected: info.hasToken,
      verificando: false,
      permisoLecturaDrive: info.hasToken,
      accountEmail: info.accountEmail,
      accountName: info.accountName,
      remainingMinutes: info.remainingMinutes,
      rootFolderId: extraerDriveFolderId(
        localStorage.getItem('drive_folder_notas_libro_132kv') || ''
      ),
      rootFolderName: null,
      rootFolderAccessible: false,
      subcarpetas: [],
      elencosAccesible: false,
      error: null,
      ultimaVerificacion: null,
    };
  });

  // Pliegos Reales
  const [pliegosReales, setPliegosReales] = useState<PliegoReal[]>(() => {
    try {
      const saved = localStorage.getItem('pliegos_reales_obra_132kv');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.error('Error al recuperar pliegos reales:', e);
    }
    return [];
  });

  const [planoCompararA, setPlanoCompararA] = useState<PlanoComparacionDoc | null>(null);
  const [planoCompararB, setPlanoCompararB] = useState<PlanoComparacionDoc | null>(null);
  const [chatAdjuntos, setChatAdjuntos] = useState<ChatAdjuntoPdf[]>([]);
  const [archivosPendientesNotasLibro, setArchivosPendientesNotasLibro] = useState<number>(0);
  const [escaneoTruncadoNotasLibro, setEscaneoTruncadoNotasLibro] = useState<boolean>(false);

  const [minutas, setMinutas] = useState<MinutaReunion[]>(() => {
    try {
      const saved = localStorage.getItem('cache_minutas_132kv');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  });

  const [compromisosMinutas, setCompromisosMinutas] = useState<CompromisoMinuta[]>(() => {
    try {
      const saved = localStorage.getItem('cache_compromisos_minutas_132kv');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  });

  const [notasPedido, setNotasPedido] = useState<NotaPedidoIngenieria[]>(() => {
    try {
      const saved = localStorage.getItem('cache_notas_pedido_132kv');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  });

  const [notasLibro, setNotasLibro] = useState<NotaLibro[]>(() => {
    try {
      const saved = localStorage.getItem('cache_notas_libro_132kv');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  });

  const [planos, setPlanos] = useState<Plano[]>(() => {
    try {
      const saved = localStorage.getItem('cache_planos_132kv');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.error(e);
    }
    return PLANOS_INICIALES_FIJOS;
  });

  const [hitos, setHitos] = useState<Hito[]>(() => {
    try {
      const saved = localStorage.getItem('cache_hitos_obra_132kv');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.error(e);
    }
    return HITOS_CONTRATUALES_INICIALES_FIJOS;
  });

  const [interferencias, setInterferencias] = useState<Interferencia[]>(() => {
    try {
      const saved = localStorage.getItem('cache_interferencias_132kv');
      if (saved) {
        const parsed = JSON.parse(saved);
        const reales = filtrarInterferenciasRealesCache(parsed);
        if (reales.length !== (Array.isArray(parsed) ? parsed.length : 0)) {
          localStorage.setItem('cache_interferencias_132kv', JSON.stringify(reales));
        }
        return reales;
      }
    } catch (e) {
      console.error(e);
    }
    return INTERFERENCIAS_INICIALES;
  });

  const [notasCampo, setNotasCampoState] = useState<string>(() => {
    return localStorage.getItem('notas_obra_132kv') || '';
  });

  const [precisionNivel, setPrecisionNivelState] = useState<PrecisionNivelId>(() => {
    try {
      const saved = localStorage.getItem('cfg_gemini_precision_nivel');
      if (
        saved === 'gratuito' ||
        saved === 'economico' ||
        saved === 'balanceado' ||
        saved === 'alta'
      ) {
        return saved;
      }
    } catch {}
    return 'gratuito';
  });
  const [geminiPrecisionState, setGeminiPrecisionState] = useState<GeminiPrecisionState | null>(null);
  const [firestoreIAControl, setFirestoreIAControl] = useState<boolean | null>(null);

  const esUsuarioMaestro = Boolean(
    cloudSession?.email?.toLowerCase().trim() === BOOTSTRAP_ADMIN_EMAIL ||
      geminiPrecisionState?.esUsuarioMaestro
  );
  const modelosPagosHabilitados =
    firestoreIAControl !== null
      ? firestoreIAControl
      : Boolean(geminiPrecisionState?.modelosPagosHabilitados);

  const setPrecisionNivel = useCallback((nivel: PrecisionNivelId) => {
    setPrecisionNivelState(nivel);
    try {
      localStorage.setItem('cfg_gemini_precision_nivel', nivel);
    } catch {}
  }, []);

  useEffect(() => {
    if (!modelosPagosHabilitados && precisionNivel !== 'gratuito') {
      setPrecisionNivel('gratuito');
    }
  }, [modelosPagosHabilitados, precisionNivel, setPrecisionNivel]);

  const refrescarEstadoGemini = useCallback(async (): Promise<GeminiPrecisionState | null> => {
    try {
      const res = await apiFetch('/api/gemini/config');
      if (!res.ok) return null;
      const data = await res.json();
      if (data?.precisionState) {
        setGeminiPrecisionState(data.precisionState as GeminiPrecisionState);
        return data.precisionState as GeminiPrecisionState;
      }
    } catch {}
    return null;
  }, []);

  const toggleModelosPagosMaestro = useCallback(
    async (habilitado: boolean): Promise<GeminiPrecisionState | null> => {
      const sess = cloudSessionRef.current;
      const esMaestroActual = Boolean(
        sess?.email?.toLowerCase().trim() === BOOTSTRAP_ADMIN_EMAIL ||
          geminiPrecisionState?.esUsuarioMaestro
      );
      if (!esMaestroActual) {
        throw new Error('Solo el administrador maestro puede habilitar o ocultar los modelos pagos.');
      }

      const res = await apiFetch('/api/gemini/master-control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelosPagosHabilitados: Boolean(habilitado) }),
      });
      const data = await readJsonResponse(res, 'Error actualizando control maestro de IA');
      let updatedState: GeminiPrecisionState | null = null;
      if (data?.precisionState) {
        updatedState = data.precisionState as GeminiPrecisionState;
        setGeminiPrecisionState(updatedState);
      }

      if (sess) {
        await setWorkspaceIAControl(sess, Boolean(habilitado));
        setFirestoreIAControl(Boolean(habilitado));
      }

      if (!habilitado) {
        setPrecisionNivel('gratuito');
      }
      return updatedState;
    },
    [geminiPrecisionState?.esUsuarioMaestro, setPrecisionNivel]
  );

  const guardarConfigPrecision = useCallback(
    async (payload: {
      nivelPreferido?: PrecisionNivelId;
      politicaLimite?: PoliticaLimiteModelo;
      openRouterModeloPreferido?: string;
      limitesPorModelo?: Record<string, { maxConsultasDiarias?: number; maxCostoUsdDiario?: number }>;
    }): Promise<GeminiPrecisionState | null> => {
      const effectivePayload = !modelosPagosHabilitados
        ? { ...payload, nivelPreferido: 'gratuito' as PrecisionNivelId }
        : payload;
      if (effectivePayload.nivelPreferido) {
        setPrecisionNivel(effectivePayload.nivelPreferido);
      }
      const res = await apiFetch('/api/gemini/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(effectivePayload),
      });
      const data = await readJsonResponse(res, 'Error guardando límites de modelos IA');
      if (data?.precisionState) {
        setGeminiPrecisionState(data.precisionState as GeminiPrecisionState);
        return data.precisionState as GeminiPrecisionState;
      }
      return null;
    },
    [modelosPagosHabilitados, setPrecisionNivel]
  );

  const resetearUsoGemini = useCallback(
    async (modelo?: string): Promise<GeminiPrecisionState | null> => {
      const res = await apiFetch('/api/gemini/reset-uso', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelo }),
      });
      const data = await readJsonResponse(res, 'Error reiniciando uso diario de IA');
      if (data?.precisionState) {
        setGeminiPrecisionState(data.precisionState as GeminiPrecisionState);
        return data.precisionState as GeminiPrecisionState;
      }
      return null;
    },
    []
  );

  useEffect(() => {
    void refrescarEstadoGemini();
  }, [refrescarEstadoGemini, cloudSession?.uid]);

  const masterInitSeededRef = useRef<boolean>(false);
  useEffect(() => {
    if (!cloudSession) {
      setFirestoreIAControl(null);
      masterInitSeededRef.current = false;
      return;
    }

    const esMaestroSess = cloudSession.email.toLowerCase().trim() === BOOTSTRAP_ADMIN_EMAIL;
    const unsubControl = subscribeWorkspaceIAControl(cloudSession.workspaceId, val => {
      setFirestoreIAControl(val);
      if (val === null) {
        if (esMaestroSess && !masterInitSeededRef.current) {
          masterInitSeededRef.current = true;
          void setWorkspaceIAControl(cloudSession, false).catch(() => {
            masterInitSeededRef.current = false;
          });
        }
        return;
      }

      if (esMaestroSess) {
        void apiFetch('/api/gemini/master-control', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ modelosPagosHabilitados: val }),
        })
          .then(r => (r.ok ? r.json() : null))
          .then(data => {
            if (data?.precisionState) {
              setGeminiPrecisionState(data.precisionState as GeminiPrecisionState);
            }
          })
          .catch(() => {});
      }
    });

    return () => {
      unsubControl();
    };
  }, [cloudSession]);

  const [audiosCampo, setAudiosCampo] = useState<NotaAudio[]>(() => {
    try {
      const saved = localStorage.getItem('audios_obra_132kv');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [fotosCampo, setFotosCampo] = useState<FotoCampo[]>(() => {
    try {
      const saved = localStorage.getItem('fotos_obra_132kv');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [chatMessages, setChatMessages] = useState<MensajeChat[]>([
    {
      id: 'init-1',
      texto:
        '⚡ **Asistente Integral de Ingeniería Eléctrica 132 kV, Documentos de Obra y Auditoría**\n\n' +
        'Puedes consultarme cualquier tema técnico o documental:\n' +
        '- **Memorias Descriptivas, Estudios de Suelos y Docs de Drive:** conecta Google Drive con **"Docs Drive"** para buscar y leer archivos reales de cualquier carpeta (ej. `ET-LE-OC-MD-*`).\n' +
        '- **Libro de Comunicaciones / Notas de Libro:** lee NP, OS y NS diferenciando **Actores (UTE, TRANSNOA, Inspección)** para detectar discrepancias y contestaciones.\n' +
        '- **Pliegos, Planos PDF y Cálculos / Normativa:** contrasta cláusulas, hitos, interferencias o responde consultas técnicas abiertas (AEA, CIRSOC, IRAM, IEC).',
      esUsuario: false,
      fecha: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);

  const [ultimoInforme, setUltimoInformeState] = useState<string>('');

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

  const pliegosHydratedServerRef = useRef<Set<string>>(new Set());
  const notasLibroHydratedSigRef = useRef<string>('');
  const minutasHydratedSigRef = useRef<string>('');
  const interferenciasHydratedSigRef = useRef<string>('');
  const chatAdjuntosHydratedSigRef = useRef<string>('');
  const backfilledMemberUidsKeyRef = useRef<string>('');

  const guardarMetadataLocal = (lista: PliegoReal[]) => {
    try {
      const compacta = lista.map(({ dataBase64: _drop, ...rest }) => ({
        ...rest,
        contenidoTexto: rest.contenidoTexto ? rest.contenidoTexto.slice(0, 12000) : '',
      }));
      localStorage.setItem('pliegos_reales_obra_132kv', JSON.stringify(compacta));
    } catch (e) {
      console.warn('LocalStorage limit for pliegos:', e);
    }
  };

  const persistirMinutasLocal = (
    m: MinutaReunion[],
    c: CompromisoMinuta[],
    np: NotaPedidoIngenieria[]
  ) => {
    try {
      localStorage.setItem('cache_minutas_132kv', JSON.stringify(m));
      localStorage.setItem('cache_compromisos_minutas_132kv', JSON.stringify(c));
      localStorage.setItem('cache_notas_pedido_132kv', JSON.stringify(np));
    } catch {}
  };

  // Hidrata en el servidor Express local los pliegos sincronizados desde otro dispositivo vía Firestore
  const hidratarPliegoEnServidorLocal = useCallback(async (pliego: PliegoReal) => {
    if (!pliego?.id || !pliego?.contenidoTexto) return;
    if (pliegosHydratedServerRef.current.has(pliego.id)) return;
    pliegosHydratedServerRef.current.add(pliego.id);
    try {
      await apiFetch('/api/pliegos/cargar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: pliego.id,
          nombre: pliego.nombre,
          tipoMime: pliego.tipoMime || 'text/plain',
          tamanioBytes: pliego.tamanioBytes || pliego.contenidoTexto.length,
          tamanioTexto: pliego.tamanioTexto || `${Math.max(1, Math.round(pliego.contenidoTexto.length / 1024))} KB`,
          fechaSubida: pliego.fechaSubida,
          paginas: pliego.paginas,
          contenidoTexto: pliego.contenidoTexto,
        }),
      });
    } catch {
      pliegosHydratedServerRef.current.delete(pliego.id);
    }
  }, []);

  // Hidrata Notas de Libro sincronizadas desde Firestore en la memoria del servidor local
  const hidratarNotasLibroEnServidorLocal = useCallback(async (lista: NotaLibro[]) => {
    if (!Array.isArray(lista) || lista.length === 0) return;
    const firma = lista.map(n => `${n.id}:${n.estadoRespuesta}:${n.actorEmisor}`).join('|');
    if (notasLibroHydratedSigRef.current === firma) return;
    notasLibroHydratedSigRef.current = firma;
    try {
      await apiFetch('/api/notas-libro/hidratar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notasLibro: lista, compact: true }),
      });
    } catch {
      notasLibroHydratedSigRef.current = '';
    }
  }, []);

  const hidratarMinutasEnServidorLocal = useCallback(
    async (m: MinutaReunion[], c: CompromisoMinuta[], np: NotaPedidoIngenieria[]) => {
      if (m.length === 0 && c.length === 0 && np.length === 0) return;
      const firma = `${m.length}:${c.map(x => `${x.id}:${x.estado}`).join(',')}:${np.length}`;
      if (minutasHydratedSigRef.current === firma) return;
      minutasHydratedSigRef.current = firma;
      try {
        await apiFetch('/api/minutas/hidratar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ minutas: m, compromisos: c, notasPedido: np }),
        });
      } catch {
        minutasHydratedSigRef.current = '';
      }
    },
    []
  );

  const hidratarInterferenciasEnServidorLocal = useCallback(async (lista: Interferencia[]) => {
    if (!Array.isArray(lista) || lista.length === 0) return;
    const firma = lista.map(x => `${x.id}:${x.estadoTramite}:${x.fechaDocumento || ''}`).join('|');
    if (interferenciasHydratedSigRef.current === firma) return;
    interferenciasHydratedSigRef.current = firma;
    try {
      await apiFetch('/api/interferencias/hidratar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interferencias: lista }),
      });
    } catch {
      interferenciasHydratedSigRef.current = '';
    }
  }, []);

  const hidratarChatAdjuntosEnServidorLocal = useCallback(async (lista: ChatAdjuntoPdf[]) => {
    if (!Array.isArray(lista) || lista.length === 0) return;
    const firma = lista.map(x => `${x.id}:${x.caracteresTexto}`).join('|');
    if (chatAdjuntosHydratedSigRef.current === firma) return;
    chatAdjuntosHydratedSigRef.current = firma;
    try {
      await apiFetch('/api/chat/adjuntos/hidratar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adjuntos: lista }),
      });
    } catch {
      chatAdjuntosHydratedSigRef.current = '';
    }
  }, []);

  const unsubFirestoreRef = useRef<(() => void) | null>(null);

  const attachUserToWorkspace = useCallback(
    async (
      user: User | null,
      isCancelled?: () => boolean
    ): Promise<'sincronizado' | 'verificacion-pendiente' | 'acceso-pendiente' | 'sin-sesion'> => {
      if (unsubFirestoreRef.current) {
        unsubFirestoreRef.current();
        unsubFirestoreRef.current = null;
      }

      if (!user) {
        clearGoogleDriveAccessToken();
        setHasDriveToken(false);
        setDriveConnectionState(prev => ({
          ...prev,
          connected: false,
          verificando: false,
          permisoLecturaDrive: false,
          accountEmail: null,
          accountName: null,
          remainingMinutes: 0,
          rootFolderName: null,
          rootFolderAccessible: false,
          subcarpetas: [],
          elencosAccesible: false,
          error: null,
        }));
        setCloudSession(null);
        cloudSessionRef.current = null;
        setCloudUserEmail(null);
        setCloudSyncStatus('sin-sesion');
        setConnectionStatus('Local');
        return 'sin-sesion';
      }

      setCloudUserEmail(user.email || null);

      if (!user.emailVerified) {
        setCloudSession(null);
        cloudSessionRef.current = null;
        setCloudSyncStatus('verificacion-pendiente');
        setConnectionStatus('Verificar Mail');
        return 'verificacion-pendiente';
      }

      setCloudSyncStatus('conectando');

      try {
        const session = await bootstrapWorkspaceForUser(user);
        if (isCancelled?.()) return 'sin-sesion';

        if (!session) {
          setCloudSession(null);
          cloudSessionRef.current = null;
          setCloudSyncStatus('acceso-pendiente');
          setConnectionStatus('Acceso Pendiente');
          return 'acceso-pendiente';
        }

        setCloudSession(session);
        cloudSessionRef.current = session;
        setCloudSyncStatus('sincronizado');
        setConnectionStatus('Nube Sync ✓');

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

        unsubFirestoreRef.current = subscribeWorkspaceRealtime(session, {
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
            setCloudSession(prev => (prev ? { ...prev, memberUids: ws.memberUids } : prev));

            if (session.role === 'admin' && ws.memberUids.length > 1) {
              const sigUids = [...ws.memberUids].sort().join(',');
              if (backfilledMemberUidsKeyRef.current !== sigUids) {
                backfilledMemberUidsKeyRef.current = sigUids;
                void backfillWorkspaceMemberUids({ ...session, memberUids: ws.memberUids }, ws.memberUids);
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
        return 'sincronizado';
      } catch (err) {
        console.error('[FirestoreSync] Error conectando nube:', err);
        setCloudSyncStatus('error');
        return 'acceso-pendiente';
      }
    },
    [
      hidratarPliegoEnServidorLocal,
      hidratarNotasLibroEnServidorLocal,
      hidratarMinutasEnServidorLocal,
      hidratarInterferenciasEnServidorLocal,
      hidratarChatAdjuntosEnServidorLocal,
    ]
  );

  // Conexión y suscripción en tiempo real con Firebase Firestore (todos los celulares y notebooks)
  useEffect(() => {
    let cancelado = false;
    const unsubAuth = onAuthStateChanged(auth, async user => {
      await attachUserToWorkspace(user, () => cancelado);
    });

    return () => {
      cancelado = true;
      unsubAuth();
      if (unsubFirestoreRef.current) {
        unsubFirestoreRef.current();
        unsubFirestoreRef.current = null;
      }
    };
  }, [attachUserToWorkspace]);

  const conectarNubeDispositivos = async () => {
    setCloudSyncStatus('conectando');
    try {
      const res = await signInWithGoogleDrive({ forceConsent: false, includeDriveScope: true });
      const tok = res?.accessToken || getGoogleDriveAccessToken();
      if (tok) {
        setHasDriveToken(true);
      }
    } catch (err) {
      setCloudSyncStatus('error');
      throw err;
    }
  };

  const conectarCorreoCorporativo = async (email: string, password: string) => {
    setCloudSyncStatus('conectando');
    try {
      const res = await iniciarSesionCorreoCorporativo({ email, password });
      await attachUserToWorkspace(res.user);
      return { emailVerified: res.emailVerified };
    } catch (err) {
      setCloudSyncStatus('sin-sesion');
      throw err;
    }
  };

  const registrarCorreoCorporativo = async (email: string, password: string, nombre?: string) => {
    setCloudSyncStatus('conectando');
    try {
      const res = await registrarConCorreoCorporativo({ email, password, nombre });
      await attachUserToWorkspace(res.user);
    } catch (err) {
      setCloudSyncStatus('sin-sesion');
      throw err;
    }
  };

  const reenviarMailVerificacion = async () => {
    await reenviarVerificacionCorreo();
  };

  const reintentarConexionNube = async () => {
    const checked = await verificarEstadoEmailActual();
    if (!checked) {
      setCloudSyncStatus('sin-sesion');
      return 'sin-sesion' as const;
    }
    return attachUserToWorkspace(checked.user);
  };

  const enviarResetClaveCorreo = async (email: string) => {
    await restablecerClaveCorreo(email);
  };

  const desconectarNubeDispositivos = async () => {
    await signOutGoogleDrive();
    if (unsubFirestoreRef.current) {
      unsubFirestoreRef.current();
      unsubFirestoreRef.current = null;
    }
    setCloudSession(null);
    cloudSessionRef.current = null;
    setCloudUserEmail(null);
    setCloudSyncStatus('sin-sesion');
    setConnectionStatus('Local');
  };

  const invitarColaboradorNube = async (email: string) => {
    const sess = cloudSessionRef.current;
    if (!sess) {
      throw new Error('Primero conecta tu cuenta administradora en Sincronización Multi-Dispositivo.');
    }
    await invitarColaboradorWorkspace({ session: sess, emailColaborador: email });
  };

  const listarInvitacionesNube = useCallback(async () => {
    const sess = cloudSessionRef.current;
    if (!sess) return [];
    return listarInvitacionesWorkspace(sess);
  }, []);

  const revocarInvitacionNube = useCallback(async (inviteId: string) => {
    const sess = cloudSessionRef.current;
    if (!sess) {
      throw new Error('Debes estar conectado como administrador para revocar accesos.');
    }
    await revocarInvitacionWorkspace(sess, inviteId);
  }, []);

  const enviarArchivoPorPartes = useCallback(
    async (
      id: string,
      nombre: string,
      tipoMime: string,
      fechaSubida: string,
      blob: Blob,
      onProgress?: (info: SubidaProgresoInfo) => void,
      destino: 'pliego' | 'planoA' | 'planoB' | 'chatPdf' = 'pliego'
    ): Promise<{ pliego?: PliegoReal; plano?: PlanoComparacionDoc; adjuntoChat?: ChatAdjuntoPdf }> => {
      const CHUNK_SIZE = 4 * 1024 * 1024;
      const totalBytes = blob.size;
      const totalMB = (totalBytes / (1024 * 1024)).toFixed(1);

      onProgress?.({
        fase: 'subiendo',
        porcentaje: 0,
        detalle: `Iniciando subida de "${nombre}" (${totalMB} MB)...`,
      });

      const initRes = await apiFetch('/api/pliegos/subir/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, nombre, tipoMime, totalBytes, fechaSubida, destino }),
      });
      if (!initRes.ok) {
        const errData = await tryReadJsonResponse(initRes);
        throw new Error(errData?.error || `No se pudo iniciar la subida de ${nombre}`);
      }

      const totalChunks = Math.max(1, Math.ceil(totalBytes / CHUNK_SIZE));
      for (let i = 0; i < totalChunks; i++) {
        const offset = i * CHUNK_SIZE;
        const slice = blob.slice(offset, Math.min(totalBytes, offset + CHUNK_SIZE));

        let lastErr: any = null;
        let ok = false;
        for (let intento = 0; intento < 3; intento++) {
          try {
            const chunkRes = await apiFetch('/api/pliegos/subir/chunk', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/octet-stream',
                'x-pliego-id': id,
                'x-chunk-offset': String(offset),
              },
              body: slice,
            });
            if (chunkRes.ok) {
              ok = true;
              break;
            }
            const errJson = await tryReadJsonResponse(chunkRes);
            lastErr = new Error(errJson?.error || `HTTP ${chunkRes.status}`);
          } catch (err) {
            lastErr = err;
          }
          await new Promise(r => setTimeout(r, 350 * (intento + 1)));
        }

        if (!ok) {
          throw new Error(
            `Error subiendo parte ${i + 1}/${totalChunks} de "${nombre}": ${lastErr?.message || 'Error de red'}`
          );
        }

        const subidoHastaAhora = Math.min(totalBytes, offset + slice.size);
        const pct = Math.round((subidoHastaAhora / totalBytes) * 100);
        const subidoMB = (subidoHastaAhora / (1024 * 1024)).toFixed(1);
        onProgress?.({
          fase: 'subiendo',
          porcentaje: pct,
          detalle: `Subiendo "${nombre}": ${subidoMB} / ${totalMB} MB (${pct}%)`,
        });
      }

      onProgress?.({
        fase: 'procesando',
        porcentaje: 5,
        detalle: `Archivo subido. Iniciando extracción de texto e índice...`,
      });

      const finRes = await apiFetch('/api/pliegos/subir/finalizar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!finRes.ok) {
        const errData = await tryReadJsonResponse(finRes);
        throw new Error(errData?.error || 'Error finalizando subida');
      }

      while (true) {
        await new Promise(r => setTimeout(r, 500));
        const stRes = await apiFetch(`/api/pliegos/subir/estado/${encodeURIComponent(id)}`);
        if (!stRes.ok) {
          throw new Error('Se perdió el seguimiento de indexación en el servidor.');
        }
        const stData = await readJsonResponse(stRes, 'Error consultando estado de indexación');
        if (stData.estado === 'error') {
          throw new Error(stData.error || 'Error procesando el PDF');
        }
        onProgress?.({
          fase: 'procesando',
          porcentaje: Number(stData.progreso) || 0,
          detalle: stData.detalle || 'Extrayendo texto e indexando...',
        });
        if (stData.estado === 'completado') {
          if (stData.adjuntoChat) return { adjuntoChat: stData.adjuntoChat as ChatAdjuntoPdf };
          if (stData.plano) return { plano: stData.plano as PlanoComparacionDoc };
          if (stData.pliego) return { pliego: stData.pliego as PliegoReal };
        }
      }
    },
    []
  );

  // Resincroniza pliegos guardados en IndexedDB hacia el servidor si este se reinició
  const resincronizarPliegosDesdeIDB = useCallback(async () => {
    try {
      const itemsIDB = await obtenerTodosArchivosIDB();
      if (itemsIDB.length === 0) return false;

      const actualizados: PliegoReal[] = [];
      for (const item of itemsIDB) {
        if (item.blob) {
          if (item.blob.size > 3.5 * 1024 * 1024) {
            try {
              const resPart = await enviarArchivoPorPartes(
                item.id,
                item.nombre,
                item.tipoMime || 'application/pdf',
                item.fechaSubida,
                item.blob,
                undefined,
                'pliego'
              );
              if (resPart.pliego) actualizados.push(resPart.pliego);
            } catch {}
          } else {
            const res = await apiFetch('/api/pliegos/subir', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/octet-stream',
                'x-pliego-id': item.id,
                'x-pliego-nombre': encodeURIComponent(item.nombre),
                'x-pliego-mime': item.tipoMime || 'application/pdf',
                'x-pliego-fecha': encodeURIComponent(item.fechaSubida),
              },
              body: item.blob,
            });
            if (res.ok) {
              const data = await tryReadJsonResponse(res);
              if (data?.pliego) actualizados.push(data.pliego);
            }
          }
        } else if (item.contenidoTexto) {
          const res = await apiFetch('/api/pliegos/cargar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: item.id,
              nombre: item.nombre,
              tipoMime: item.tipoMime || 'text/plain',
              tamanioBytes: item.contenidoTexto.length,
              tamanioTexto: `${Math.max(1, Math.round(item.contenidoTexto.length / 1024))} KB`,
              fechaSubida: item.fechaSubida,
              contenidoTexto: item.contenidoTexto,
            }),
          });
          if (res.ok) {
            const data = await tryReadJsonResponse(res);
            if (data?.pliego) actualizados.push(data.pliego);
          }
        }
      }
      if (actualizados.length > 0) {
        setPliegosReales(actualizados);
        guardarMetadataLocal(actualizados);
        return true;
      }
    } catch (err) {
      console.warn('Fallo resincronizando IDB:', err);
    }
    return false;
  }, [enviarArchivoPorPartes]);

  // Al iniciar, sincronizar pliegos, planos comparador, minutas, interferencias, notas de libro y docs Drive del servidor
  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const [resPliegos, resPlanos, resMinutas, resChatAdj, resInterf, resNotasLibro, resDriveDocs, resElencos] = await Promise.all([
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
            localStorage.setItem('cache_interferencias_132kv', JSON.stringify(intData.interferencias));
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
            if (Number.isFinite(Number(elData.totalPlanificados)) && Number(elData.totalPlanificados) > 0) {
              setTotalPlanificados(Math.round(Number(elData.totalPlanificados)));
            }
            if (elData.porFrente && typeof elData.porFrente === 'object') {
              setPlanificadosPorFrente(elData.porFrente);
            }
            setElencosMeta({
              fuente: String(elData.fuente || 'Seguimiento de Elencos (Base 543)'),
              ultimaSincronizacion: elData.ultimaSincronizacion || null,
              archivosAnalizados: Array.isArray(elData.archivosAnalizados) ? elData.archivosAnalizados.length : 0,
              folderId: String(elData.folderId || DEFAULT_ELENCOS_FOLDER_ID),
            });
          }
        }
      } catch {}
    })();
    return () => {
      cancelado = true;
    };
  }, [resincronizarPliegosDesdeIDB]);

  const subirArchivoPliegoReal = async (
    file: File,
    onProgress?: (info: SubidaProgresoInfo) => void
  ): Promise<PliegoReal> => {
    const id = 'pliego_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const fechaSubida = new Date().toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    const tipoMime = file.type || (file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream');

    let pliegoIndexado: PliegoReal;

    if (file.size <= 3.5 * 1024 * 1024) {
      onProgress?.({
        fase: 'subiendo',
        porcentaje: 50,
        detalle: `Subiendo e indexando "${file.name}"...`,
      });
      const res = await apiFetch('/api/pliegos/subir', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'x-pliego-id': id,
          'x-pliego-nombre': encodeURIComponent(file.name),
          'x-pliego-mime': tipoMime,
          'x-pliego-fecha': encodeURIComponent(fechaSubida),
        },
        body: file,
      });

      if (!res.ok) {
        const errData = await tryReadJsonResponse(res);
        throw new Error(errData?.error || `Error subiendo ${file.name} (HTTP ${res.status})`);
      }

      const data = await readJsonResponse(res, `Error procesando ${file.name}`);
      pliegoIndexado = data.pliego;
      onProgress?.({
        fase: 'procesando',
        porcentaje: 100,
        detalle: `Completado (${pliegoIndexado.paginas || 1} pág.)`,
      });
    } else {
      const resPart = await enviarArchivoPorPartes(
        id,
        file.name,
        tipoMime,
        fechaSubida,
        file,
        onProgress,
        'pliego'
      );
      if (!resPart.pliego) {
        throw new Error('No se recibió el pliego procesado del servidor.');
      }
      pliegoIndexado = resPart.pliego;
    }

    if (file.size <= 30 * 1024 * 1024) {
      await guardarArchivoEnIDB({
        id: pliegoIndexado.id,
        nombre: pliegoIndexado.nombre,
        tipoMime: pliegoIndexado.tipoMime,
        fechaSubida: pliegoIndexado.fechaSubida,
        blob: file,
      });
    } else if (pliegoIndexado.contenidoTexto) {
      await guardarArchivoEnIDB({
        id: pliegoIndexado.id,
        nombre: pliegoIndexado.nombre,
        tipoMime: 'text/plain',
        fechaSubida: pliegoIndexado.fechaSubida,
        contenidoTexto: pliegoIndexado.contenidoTexto,
      });
    }

    pliegosHydratedServerRef.current.add(pliegoIndexado.id);
    setPliegosReales(prev => {
      const actualizados = [pliegoIndexado, ...prev.filter(p => p.id !== pliegoIndexado.id)];
      guardarMetadataLocal(actualizados);
      return actualizados;
    });

    const sess = cloudSessionRef.current;
    if (sess) {
      try {
        let pliegoParaNube = pliegoIndexado;
        if (!pliegoParaNube.contenidoTexto || pliegoParaNube.contenidoTexto.length < (pliegoParaNube.caracteresTexto || 0)) {
          const txtRes = await apiFetch(`/api/pliegos/${encodeURIComponent(pliegoIndexado.id)}/texto`);
          if (txtRes.ok) {
            const txtData = await tryReadJsonResponse(txtRes);
            if (txtData?.contenidoTexto) {
              pliegoParaNube = { ...pliegoParaNube, contenidoTexto: txtData.contenidoTexto };
            }
          }
        }
        await syncPliegoToFirestore(sess, pliegoParaNube);
      } catch (err) {
        console.warn('[FirestoreSync] Error sincronizando pliego:', err);
      }
    }

    return pliegoIndexado;
  };

  const subirPlanoComparador = async (
    rol: 'A' | 'B',
    file: File,
    onProgress?: (info: SubidaProgresoInfo) => void
  ): Promise<PlanoComparacionDoc> => {
    const id = `cmp_${rol}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const destino = rol === 'A' ? 'planoA' : 'planoB';
    const fechaSubida = new Date().toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    const tipoMime = file.type || 'application/pdf';

    let planoDoc: PlanoComparacionDoc;

    if (file.size <= 3.5 * 1024 * 1024) {
      onProgress?.({
        fase: 'subiendo',
        porcentaje: 50,
        detalle: `Subiendo e indexando Plano ${rol}: "${file.name}"...`,
      });
      const res = await apiFetch('/api/pliegos/subir', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'x-pliego-id': id,
          'x-upload-destino': destino,
          'x-pliego-nombre': encodeURIComponent(file.name),
          'x-pliego-mime': tipoMime,
          'x-pliego-fecha': encodeURIComponent(fechaSubida),
        },
        body: file,
      });
      if (!res.ok) {
        const errData = await tryReadJsonResponse(res);
        throw new Error(errData?.error || `Error subiendo Plano ${rol} (HTTP ${res.status})`);
      }
      const data = await readJsonResponse(res, `Error procesando Plano ${rol}`);
      if (!data?.plano) {
        throw new Error(`El servidor no devolvió los metadatos del Plano ${rol}`);
      }
      planoDoc = data.plano as PlanoComparacionDoc;
      onProgress?.({
        fase: 'procesando',
        porcentaje: 100,
        detalle: `Plano ${rol} listo (${planoDoc.paginas || 1} pág.)`,
      });
    } else {
      const resPart = await enviarArchivoPorPartes(
        id,
        file.name,
        tipoMime,
        fechaSubida,
        file,
        onProgress,
        destino
      );
      if (!resPart.plano) {
        throw new Error(`No se recibió el Plano ${rol} procesado del servidor.`);
      }
      planoDoc = resPart.plano;
    }

    if (rol === 'A') setPlanoCompararA(planoDoc);
    else setPlanoCompararB(planoDoc);

    return planoDoc;
  };

  const eliminarPlanoComparador = async (rol: 'A' | 'B') => {
    if (rol === 'A') setPlanoCompararA(null);
    else setPlanoCompararB(null);
    try {
      await apiFetch(`/api/comparador/planos/${rol}`, { method: 'DELETE' });
    } catch (err) {
      console.warn(`Error eliminando Plano ${rol}:`, err);
    }
  };

  const subirAdjuntoChat = async (
    file: File,
    onProgress?: (info: SubidaProgresoInfo) => void
  ): Promise<ChatAdjuntoPdf> => {
    const id = `chatpdf_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const fechaSubida = new Date().toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    const tipoMime = file.type || (file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream');

    let adjunto: ChatAdjuntoPdf;

    if (file.size <= 3.5 * 1024 * 1024) {
      onProgress?.({
        fase: 'subiendo',
        porcentaje: 55,
        detalle: `Adjuntando e indexando "${file.name}"...`,
      });
      const res = await apiFetch('/api/pliegos/subir', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'x-pliego-id': id,
          'x-upload-destino': 'chatPdf',
          'x-pliego-nombre': encodeURIComponent(file.name),
          'x-pliego-mime': tipoMime,
          'x-pliego-fecha': encodeURIComponent(fechaSubida),
        },
        body: file,
      });
      if (!res.ok) {
        const errData = await tryReadJsonResponse(res);
        throw new Error(errData?.error || `Error adjuntando "${file.name}" (HTTP ${res.status})`);
      }
      const data = await readJsonResponse(res, `Error adjuntando "${file.name}"`);
      if (!data?.adjuntoChat) {
        throw new Error('No se recibió el PDF adjunto indexado del servidor.');
      }
      adjunto = data.adjuntoChat as ChatAdjuntoPdf;
      onProgress?.({
        fase: 'procesando',
        porcentaje: 100,
        detalle: `Listo (${adjunto.paginas} pág.)`,
      });
    } else {
      const resPart = await enviarArchivoPorPartes(
        id,
        file.name,
        tipoMime,
        fechaSubida,
        file,
        onProgress,
        'chatPdf'
      );
      if (!resPart.adjuntoChat) {
        throw new Error('No se recibió el PDF adjunto procesado.');
      }
      adjunto = resPart.adjuntoChat;
    }

    setChatAdjuntos(prev => [adjunto, ...prev.filter(a => a.id !== adjunto.id)]);
    const sess = cloudSessionRef.current;
    if (sess) {
      syncChatAdjuntoToFirestore(sess, adjunto).catch(() => {});
    }
    return adjunto;
  };

  const eliminarAdjuntoChat = async (id: string) => {
    setChatAdjuntos(prev => prev.filter(a => a.id !== id));
    try {
      await apiFetch(`/api/chat/adjuntos/${encodeURIComponent(id)}`, { method: 'DELETE' });
    } catch (err) {
      console.warn('Error eliminando adjunto de chat:', err);
    }
    const sess = cloudSessionRef.current;
    if (sess) {
      deleteWorkspaceSubdoc(sess, 'chat_adjuntos', id).catch(() => {});
    }
  };

  const limpiarAdjuntosChat = async () => {
    const actuales = [...chatAdjuntos];
    setChatAdjuntos([]);
    try {
      await apiFetch('/api/chat/adjuntos/limpiar', { method: 'POST' });
    } catch (err) {
      console.warn('Error limpiando adjuntos de chat:', err);
    }
    const sess = cloudSessionRef.current;
    if (sess) {
      for (const a of actuales) {
        deleteWorkspaceSubdoc(sess, 'chat_adjuntos', a.id).catch(() => {});
      }
    }
  };

  const agregarPliegoReal = async (pliego: PliegoReal) => {
    let pliegoFinal = pliego;
    try {
      const res = await apiFetch('/api/pliegos/cargar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pliego),
      });
      if (res.ok) {
        const data = await tryReadJsonResponse(res);
        if (data?.pliego) pliegoFinal = data.pliego;
      }
    } catch (err) {
      console.warn('Fallo al sincronizar pliego con servidor:', err);
    }

    await guardarArchivoEnIDB({
      id: pliegoFinal.id,
      nombre: pliegoFinal.nombre,
      tipoMime: pliegoFinal.tipoMime,
      fechaSubida: pliegoFinal.fechaSubida,
      contenidoTexto: pliego.contenidoTexto,
    });

    pliegosHydratedServerRef.current.add(pliegoFinal.id);
    setPliegosReales(prev => {
      const actualizados = [pliegoFinal, ...prev.filter(p => p.id !== pliegoFinal.id)];
      guardarMetadataLocal(actualizados);
      return actualizados;
    });

    const sess = cloudSessionRef.current;
    if (sess) {
      syncPliegoToFirestore(sess, {
        ...pliegoFinal,
        contenidoTexto: pliegoFinal.contenidoTexto || pliego.contenidoTexto || '',
      }).catch(err => console.warn('[FirestoreSync] Error subiendo pliego texto:', err));
    }
  };

  const eliminarPliegoReal = async (id: string) => {
    setPliegosReales(prev => {
      const actualizados = prev.filter(p => p.id !== id);
      guardarMetadataLocal(actualizados);
      return actualizados;
    });

    await eliminarArchivoDeIDB(id);
    try {
      await apiFetch(`/api/pliegos/${encodeURIComponent(id)}`, { method: 'DELETE' });
    } catch (err) {
      console.warn('Fallo al eliminar pliego del servidor:', err);
    }

    const sess = cloudSessionRef.current;
    if (sess) {
      deletePliegoFromFirestore(sess, id).catch(err =>
        console.warn('[FirestoreSync] Error eliminando pliego de Firestore:', err)
      );
    }
  };

  const limpiarTodosPliegosReales = async () => {
    const actuales = [...pliegosReales];
    setPliegosReales([]);
    localStorage.removeItem('pliegos_reales_obra_132kv');
    await limpiarTodosArchivosIDB();
    try {
      await apiFetch('/api/pliegos/limpiar', { method: 'POST' });
    } catch (err) {
      console.warn('Fallo al limpiar pliegos en servidor:', err);
    }

    const sess = cloudSessionRef.current;
    if (sess) {
      for (const p of actuales) {
        deletePliegoFromFirestore(sess, p.id).catch(() => {});
      }
    }
  };

  // Sincronización REAL de Interferencias y Cruces desde carpeta "interferencias" en Google Drive
  const sincronizarInterferenciasDrive = async (params?: {
    accessToken?: string;
    folderId?: string;
    forzarRelectura?: boolean;
  }) => {
    const data = await runWithDriveToken(async token => {
      const res = await apiFetch('/api/interferencias/sincronizar-drive', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          folderId: params?.folderId || DEFAULT_DRIVE_ROOT_FOLDER_ID,
          forzarRelectura: Boolean(params?.forzarRelectura),
        }),
      });
      const json = await readJsonResponse(
        res,
        'Error sincronizando carpeta "interferencias" desde Drive'
      );
      if (!res.ok || !json?.exito) {
        throw new Error(
          json?.error ||
            `Error sincronizando carpeta "interferencias" desde Drive (HTTP ${res.status})`
        );
      }
      return json;
    }, params?.accessToken);

    const nuevas: Interferencia[] = Array.isArray(data.interferencias) ? data.interferencias : [];
    const anteriores = [...interferencias];
    setInterferencias(nuevas);
    localStorage.setItem('cache_interferencias_132kv', JSON.stringify(nuevas));

    const sess = cloudSessionRef.current;
    if (sess) {
      await syncInterferenciasCollectionToFirestore(sess, nuevas, anteriores).catch(err =>
        console.warn('[FirestoreSync] Error sincronizando interferencias reales:', err)
      );
    }

    return {
      carpetaInterferenciasNombre: String(data.carpetaInterferenciasNombre || 'interferencias'),
      subcarpetasDetectadas: Number(data.subcarpetasDetectadas || 0),
      subcarpetasProcesadas: Number(data.subcarpetasProcesadas || 0),
      interferencias: nuevas,
      erroresCarpetas: Array.isArray(data.erroresCarpetas) ? data.erroresCarpetas : [],
    };
  };

  // Sincronización y gestión de Notas de Libro (Libro de Comunicaciones con Actores y Q&A)
  const sincronizarNotasLibroDrive = async (params?: {
    accessToken?: string;
    folderId?: string;
    forzarRelectura?: boolean;
    continuarLote?: boolean;
  }) => {
    const data = await runWithDriveToken(async token => {
      const res = await apiFetch('/api/notas-libro/sincronizar-drive', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          folderId: params?.folderId || DEFAULT_DRIVE_ROOT_FOLDER_ID,
          forzarRelectura: Boolean(params?.forzarRelectura),
          continuarLote: Boolean(params?.continuarLote),
        }),
      });
      const json = await readJsonResponse(
        res,
        'Error sincronizando Notas de Libro desde Drive'
      );
      if (!res.ok || !json?.exito) {
        throw new Error(
          json?.error || `Error sincronizando Notas de Libro desde Drive (HTTP ${res.status})`
        );
      }
      return json;
    }, params?.accessToken);

    const anteriores = [...notasLibro];
    const nuevas: NotaLibro[] = Array.isArray(data.notasLibro) ? data.notasLibro : [];
    setNotasLibro(nuevas);
    setArchivosPendientesNotasLibro(Number(data.archivosPendientes || 0));
    setEscaneoTruncadoNotasLibro(Boolean(data.escaneoTruncado));
    try {
      localStorage.setItem('cache_notas_libro_132kv', JSON.stringify(nuevas));
    } catch {}

    const sess = cloudSessionRef.current;
    if (sess) {
      syncNotasLibroCollectionToFirestore(sess, nuevas, anteriores).catch(err =>
        console.warn('[FirestoreSync] Error sincronizando Notas de Libro:', err)
      );
    }

    return {
      carpetaRaizNombre: String(data.carpetaRaizNombre || 'Google Drive'),
      carpetasEscaneadas: Number(data.carpetasEscaneadas || 0),
      archivosDetectados: Number(data.archivosDetectados || 0),
      archivosOmitidosSinCodigo: Number(data.archivosOmitidosSinCodigo || 0),
      notasNuevas: Number(data.notasNuevas || 0),
      notasActualizadas: Number(data.notasActualizadas || 0),
      notasOmitidasPorExistentes: Number(data.notasOmitidasPorExistentes || 0),
      archivosPendientes: Number(data.archivosPendientes || 0),
      escaneoTruncado: Boolean(data.escaneoTruncado),
      notasLibro: nuevas,
      erroresArchivos: Array.isArray(data.erroresArchivos) ? data.erroresArchivos : [],
    };
  };

  const subirNotaLibroArchivo = async (file: File) => {
    const res = await apiFetch('/api/notas-libro/subir', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'x-nota-nombre': encodeURIComponent(file.name),
        'x-nota-mime': file.type || 'application/pdf',
      },
      body: file,
    });
    const data = await readJsonResponse(res, 'No se pudo leer la nota de libro');
    if (!res.ok || !data?.exito) {
      throw new Error(data?.error || `No se pudo leer la nota (HTTP ${res.status})`);
    }
    const anteriores = [...notasLibro];
    const lista: NotaLibro[] = Array.isArray(data.notasLibro) ? data.notasLibro : [];
    setNotasLibro(lista);
    try {
      localStorage.setItem('cache_notas_libro_132kv', JSON.stringify(lista));
    } catch {}

    const sess = cloudSessionRef.current;
    if (sess) {
      syncNotasLibroCollectionToFirestore(sess, lista, anteriores).catch(() => {});
    }
    return { nota: data.nota as NotaLibro, notasLibro: lista };
  };

  const registrarNotaLibroTexto = async (payload: { titulo?: string; contenidoTexto: string }) => {
    const res = await apiFetch('/api/notas-libro/registrar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await readJsonResponse(res, 'Error registrando nota de libro');
    if (!res.ok || !data?.exito) {
      throw new Error(data?.error || `Error registrando nota (HTTP ${res.status})`);
    }
    const anteriores = [...notasLibro];
    const lista: NotaLibro[] = Array.isArray(data.notasLibro) ? data.notasLibro : [];
    setNotasLibro(lista);
    try {
      localStorage.setItem('cache_notas_libro_132kv', JSON.stringify(lista));
    } catch {}

    const sess = cloudSessionRef.current;
    if (sess) {
      syncNotasLibroCollectionToFirestore(sess, lista, anteriores).catch(() => {});
    }
    return { nota: data.nota as NotaLibro, notasLibro: lista };
  };

  const actualizarNotaLibro = async (
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
  ) => {
    const res = await apiFetch(`/api/notas-libro/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cambios),
    });
    const data = await readJsonResponse(res, 'Error actualizando nota de libro');
    if (!res.ok || !data?.exito) {
      throw new Error(data?.error || 'No se pudo actualizar la nota de libro');
    }
    const anteriores = [...notasLibro];
    const lista: NotaLibro[] = Array.isArray(data.notasLibro) ? data.notasLibro : anteriores;
    setNotasLibro(lista);
    try {
      localStorage.setItem('cache_notas_libro_132kv', JSON.stringify(lista));
    } catch {}

    const sess = cloudSessionRef.current;
    if (sess) {
      if (data.nota) {
        await syncNotaLibroToFirestore(sess, data.nota as NotaLibro).catch(() => {});
      } else {
        await syncNotasLibroCollectionToFirestore(sess, lista, anteriores).catch(() => {});
      }
    }
  };

  const eliminarNotaLibro = async (id: string) => {
    const anteriores = [...notasLibro];
    const res = await apiFetch(`/api/notas-libro/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('No se pudo eliminar la nota de libro');
    const data = await tryReadJsonResponse(res);
    const lista: NotaLibro[] = Array.isArray(data?.notasLibro)
      ? data.notasLibro
      : anteriores.filter(n => n.id !== id);
    setNotasLibro(lista);
    try {
      localStorage.setItem('cache_notas_libro_132kv', JSON.stringify(lista));
    } catch {}

    const sess = cloudSessionRef.current;
    if (sess) {
      await deleteWorkspaceSubdoc(sess, 'notas_libro', id).catch(() => {});
      await syncNotasLibroCollectionToFirestore(sess, lista, lista).catch(() => {});
    }
  };

  // Acciones de Minutas, Compromisos y Notas de Pedido
  const sincronizarMinutasDrive = async (params?: {
    accessToken?: string;
    folderId?: string;
    buscarEnTodoDrive?: boolean;
  }) => {
    const data = await runWithDriveToken(async token => {
      const res = await apiFetch('/api/minutas/sincronizar-drive', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          folderId: params?.folderId,
          buscarEnTodoDrive: params?.buscarEnTodoDrive ?? true,
        }),
      });
      const json = await readJsonResponse(res, 'Error sincronizando minutas desde Drive');
      if (!res.ok || !json?.exito) {
        throw new Error(
          json?.error || `Error sincronizando minutas desde Drive (HTTP ${res.status})`
        );
      }
      return json;
    }, params?.accessToken);
    const mList = Array.isArray(data.minutas) ? (data.minutas as MinutaReunion[]) : minutas;
    const cList = Array.isArray(data.compromisos)
      ? (data.compromisos as CompromisoMinuta[])
      : compromisosMinutas;
    const npList = Array.isArray(data.notasPedido)
      ? (data.notasPedido as NotaPedidoIngenieria[])
      : notasPedido;
    setMinutas(mList);
    setCompromisosMinutas(cList);
    setNotasPedido(npList);
    persistirMinutasLocal(mList, cList, npList);

    const sess = cloudSessionRef.current;
    if (sess) {
      const mNuevas = Array.isArray(data.minutasNuevas) ? (data.minutasNuevas as MinutaReunion[]) : mList;
      const cNuevos = Array.isArray(data.compromisosNuevos) ? (data.compromisosNuevos as CompromisoMinuta[]) : [];
      for (const m of mNuevas) {
        await syncMinutaToFirestore(sess, m).catch(() => {});
      }
      for (const c of cNuevos) {
        await syncCompromisoToFirestore(sess, c).catch(() => {});
      }
    }

    return {
      carpetaRaizNombre: String(data.carpetaRaizNombre || 'Google Drive'),
      carpetasEscaneadas: Number(data.carpetasEscaneadas || 0),
      archivosDetectados: Number(data.archivosDetectados || 0),
      minutasNuevas: Array.isArray(data.minutasNuevas) ? (data.minutasNuevas as MinutaReunion[]) : [],
      minutasActualizadas: Number(data.minutasActualizadas || 0),
      minutasOmitidasPorExistentes: Number(data.minutasOmitidasPorExistentes || 0),
      compromisosNuevos: Array.isArray(data.compromisosNuevos)
        ? (data.compromisosNuevos as CompromisoMinuta[])
        : [],
      erroresArchivos: Array.isArray(data.erroresArchivos) ? data.erroresArchivos : [],
    };
  };

  const subirMinutaArchivo = async (
    file: File,
    meta?: { codigo?: string; titulo?: string; fechaReunion?: string; frente?: string; participantes?: string }
  ) => {
    const res = await apiFetch('/api/minutas/subir', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'x-minuta-nombre': encodeURIComponent(file.name),
        'x-minuta-mime': file.type || 'application/pdf',
        'x-minuta-codigo': encodeURIComponent(meta?.codigo || ''),
        'x-minuta-titulo': encodeURIComponent(meta?.titulo || ''),
        'x-minuta-fecha': encodeURIComponent(meta?.fechaReunion || ''),
        'x-minuta-frente': encodeURIComponent(meta?.frente || ''),
        'x-minuta-participantes': encodeURIComponent(meta?.participantes || ''),
      },
      body: file,
    });
    const data = await readJsonResponse(res, 'No se pudo procesar la minuta');
    if (!res.ok || !data?.exito) {
      throw new Error(data?.error || `No se pudo procesar la minuta (HTTP ${res.status})`);
    }
    const nuevaMinuta = data.minuta as MinutaReunion;
    const nuevosCompExtraidos = data.compromisosExtraidos as CompromisoMinuta[];
    const nuevasMinutas = [nuevaMinuta, ...minutas];
    const nuevosComp = [...nuevosCompExtraidos, ...compromisosMinutas];
    setMinutas(nuevasMinutas);
    setCompromisosMinutas(nuevosComp);
    persistirMinutasLocal(nuevasMinutas, nuevosComp, notasPedido);

    const sess = cloudSessionRef.current;
    if (sess) {
      await syncMinutaToFirestore(sess, nuevaMinuta).catch(() => {});
      for (const c of nuevosCompExtraidos) {
        await syncCompromisoToFirestore(sess, c).catch(() => {});
      }
    }

    return {
      minuta: nuevaMinuta,
      compromisosExtraidos: nuevosCompExtraidos,
      fuenteExtraccion: String(data.fuenteExtraccion || 'extractor-local'),
    };
  };

  const transcribirAudioMinuta = async (
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
  ): Promise<AudioMinutaResultado> => {
    const id = `maud_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const nombre =
      options?.nombreArchivo ||
      (audio instanceof File && audio.name ? audio.name : `reunion_${new Date().toISOString().slice(0, 10)}.webm`);
    const tipoMime = audio.type || 'audio/webm';
    const totalBytes = audio.size;
    const totalMB = (totalBytes / (1024 * 1024)).toFixed(1);

    const motorEfectivo: 'gratuito' | 'gemini' =
      modelosPagosHabilitados && options?.motor === 'gemini' ? 'gemini' : 'gratuito';

    if (totalBytes <= 3.5 * 1024 * 1024) {
      onProgress?.({
        fase: 'subiendo',
        porcentaje: 45,
        detalle: `Enviando audio "${nombre}" (${totalMB} MB) al servidor...`,
      });
      const res = await apiFetch('/api/minutas/audio/subir-directo', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'x-audio-id': id,
          'x-audio-nombre': encodeURIComponent(nombre),
          'x-audio-mime': tipoMime,
          'x-audio-modelo-id': encodeURIComponent(options?.modeloMinutaId || ''),
          'x-audio-codigo': encodeURIComponent(options?.codigo || ''),
          'x-audio-titulo': encodeURIComponent(options?.titulo || ''),
          'x-audio-fecha': encodeURIComponent(options?.fechaReunion || ''),
          'x-audio-frente': encodeURIComponent(options?.frente || ''),
          'x-audio-participantes': encodeURIComponent(options?.participantes || ''),
          'x-audio-motor': motorEfectivo,
        },
        body: audio,
      });
      if (!res.ok) {
        const errData = await tryReadJsonResponse(res);
        throw new Error(errData?.error || `Error enviando audio (HTTP ${res.status})`);
      }
    } else {
      const CHUNK_SIZE = 4 * 1024 * 1024;
      onProgress?.({
        fase: 'subiendo',
        porcentaje: 0,
        detalle: `Iniciando subida por partes de "${nombre}" (${totalMB} MB)...`,
      });

      const initRes = await apiFetch('/api/minutas/audio/subir/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          nombre,
          tipoMime,
          totalBytes,
          modeloMinutaId: options?.modeloMinutaId || '',
          codigo: options?.codigo || '',
          titulo: options?.titulo || '',
          fechaReunion: options?.fechaReunion || '',
          frente: options?.frente || '',
          participantes: options?.participantes || '',
          motor: motorEfectivo,
        }),
      });
      if (!initRes.ok) {
        const errData = await tryReadJsonResponse(initRes);
        throw new Error(errData?.error || `No se pudo iniciar la subida de "${nombre}"`);
      }

      const totalChunks = Math.max(1, Math.ceil(totalBytes / CHUNK_SIZE));
      for (let i = 0; i < totalChunks; i++) {
        const offset = i * CHUNK_SIZE;
        const slice = audio.slice(offset, Math.min(totalBytes, offset + CHUNK_SIZE));

        let lastErr: any = null;
        let ok = false;
        for (let intento = 0; intento < 3; intento++) {
          try {
            const chunkRes = await apiFetch('/api/minutas/audio/subir/chunk', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/octet-stream',
                'x-audio-id': id,
                'x-chunk-offset': String(offset),
              },
              body: slice,
            });
            if (chunkRes.ok) {
              ok = true;
              break;
            }
            const errJson = await tryReadJsonResponse(chunkRes);
            lastErr = new Error(errJson?.error || `HTTP ${chunkRes.status}`);
          } catch (err) {
            lastErr = err;
          }
          await new Promise(r => setTimeout(r, 400 * (intento + 1)));
        }

        if (!ok) {
          throw new Error(
            `Error subiendo parte ${i + 1}/${totalChunks} de "${nombre}": ${lastErr?.message || 'Error de red'}`
          );
        }

        const subidoHastaAhora = Math.min(totalBytes, offset + slice.size);
        const pct = Math.round((subidoHastaAhora / totalBytes) * 100);
        const subidoMB = (subidoHastaAhora / (1024 * 1024)).toFixed(1);
        onProgress?.({
          fase: 'subiendo',
          porcentaje: pct,
          detalle: `Subiendo audio "${nombre}": ${subidoMB} / ${totalMB} MB (${pct}%)`,
        });
      }

      onProgress?.({
        fase: 'procesando',
        porcentaje: 4,
        detalle: 'Audio subido. Segmentando y enviando a Groq Whisper...',
      });

      const finRes = await apiFetch('/api/minutas/audio/subir/finalizar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!finRes.ok) {
        const errData = await tryReadJsonResponse(finRes);
        throw new Error(errData?.error || 'Error finalizando subida de audio');
      }
    }

    while (true) {
      await new Promise(r => setTimeout(r, 700));
      const stRes = await apiFetch(`/api/minutas/audio/estado/${encodeURIComponent(id)}`);
      if (!stRes.ok) {
        const errData = await tryReadJsonResponse(stRes);
        throw new Error(errData?.error || 'Se perdió el seguimiento de transcripción en el servidor.');
      }
      const stData = await readJsonResponse(stRes, 'Error consultando progreso de audio');
      if (stData.estado === 'error') {
        throw new Error(stData.error || 'Error procesando el audio de reunión');
      }
      onProgress?.({
        fase: 'procesando',
        porcentaje: Number(stData.progreso) || 10,
        detalle: stData.detalle || 'Transcribiendo audio con Groq Whisper...',
      });
      if (stData.estado === 'completado' && stData.resultado) {
        return stData.resultado as AudioMinutaResultado;
      }
    }
  };

  const registrarMinutaTexto = async (payload: {
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
  }) => {
    const res = await apiFetch('/api/minutas/registrar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await readJsonResponse(res, 'Error registrando minuta');
    if (!res.ok || !data?.exito) {
      throw new Error(data?.error || `Error registrando minuta (HTTP ${res.status})`);
    }
    const nuevaMinuta = data.minuta as MinutaReunion;
    const nuevosCompExtraidos = data.compromisosExtraidos as CompromisoMinuta[];
    const nuevasMinutas = [nuevaMinuta, ...minutas];
    const nuevosComp = [...nuevosCompExtraidos, ...compromisosMinutas];
    setMinutas(nuevasMinutas);
    setCompromisosMinutas(nuevosComp);
    persistirMinutasLocal(nuevasMinutas, nuevosComp, notasPedido);

    const sess = cloudSessionRef.current;
    if (sess) {
      await syncMinutaToFirestore(sess, nuevaMinuta).catch(() => {});
      for (const c of nuevosCompExtraidos) {
        await syncCompromisoToFirestore(sess, c).catch(() => {});
      }
    }

    return {
      minuta: nuevaMinuta,
      compromisosExtraidos: nuevosCompExtraidos,
      fuenteExtraccion: String(data.fuenteExtraccion || 'manual'),
    };
  };

  const eliminarMinuta = async (id: string) => {
    const res = await apiFetch(`/api/minutas/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('No se pudo eliminar la minuta');
    const compEliminar = compromisosMinutas.filter(c => c.minutaId === id);
    const nuevasMinutas = minutas.filter(m => m.id !== id);
    const nuevosComp = compromisosMinutas.filter(c => c.minutaId !== id);
    setMinutas(nuevasMinutas);
    setCompromisosMinutas(nuevosComp);
    persistirMinutasLocal(nuevasMinutas, nuevosComp, notasPedido);

    const sess = cloudSessionRef.current;
    if (sess) {
      deleteWorkspaceSubdoc(sess, 'minutas', id).catch(() => {});
      for (const c of compEliminar) {
        deleteWorkspaceSubdoc(sess, 'compromisos', c.id).catch(() => {});
      }
    }
  };

  const agregarCompromisoMinuta = async (payload: {
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
  }): Promise<CompromisoMinuta> => {
    const res = await apiFetch('/api/minutas/compromisos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await readJsonResponse(res, 'Error creando compromiso');
    if (!res.ok || !data?.exito) {
      throw new Error(data?.error || 'Error creando compromiso');
    }
    const comp = data.compromiso as CompromisoMinuta;
    const nuevosComp = [comp, ...compromisosMinutas];
    setCompromisosMinutas(nuevosComp);
    persistirMinutasLocal(minutas, nuevosComp, notasPedido);

    const sess = cloudSessionRef.current;
    if (sess) {
      await syncCompromisoToFirestore(sess, comp).catch(() => {});
    }

    return comp;
  };

  const actualizarCompromisoMinuta = async (
    id: string,
    cambios: Partial<Pick<CompromisoMinuta, 'estado' | 'responsable' | 'fechaLimite' | 'descripcion' | 'observaciones' | 'frente'>>
  ) => {
    const res = await apiFetch(`/api/minutas/compromisos/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cambios),
    });
    const data = await readJsonResponse(res, 'No se pudo actualizar el compromiso');
    if (!res.ok || !data?.exito) {
      throw new Error(data?.error || 'No se pudo actualizar el compromiso');
    }
    const comp = data.compromiso as CompromisoMinuta;
    const nuevosComp = compromisosMinutas.map(c => (c.id === id ? comp : c));
    setCompromisosMinutas(nuevosComp);
    persistirMinutasLocal(minutas, nuevosComp, notasPedido);

    const sess = cloudSessionRef.current;
    if (sess) {
      await syncCompromisoToFirestore(sess, comp).catch(() => {});
    }
  };

  const eliminarCompromisoMinuta = async (id: string) => {
    const res = await apiFetch(`/api/minutas/compromisos/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('No se pudo eliminar el compromiso');
    const nuevosComp = compromisosMinutas.filter(c => c.id !== id);
    setCompromisosMinutas(nuevosComp);
    persistirMinutasLocal(minutas, nuevosComp, notasPedido);

    const sess = cloudSessionRef.current;
    if (sess) {
      deleteWorkspaceSubdoc(sess, 'compromisos', id).catch(() => {});
    }
  };

  const generarNotaPedido = async (payload: {
    compromisoIds: string[];
    numeroNota?: string;
    fechaEmision?: string;
    emisor?: string;
    destinatario?: string;
    frente?: string;
    asunto?: string;
    plazoDescargoDias?: number;
    encuadreAdicional?: string;
  }): Promise<NotaPedidoIngenieria> => {
    const res = await apiFetch('/api/minutas/nota-pedido/generar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await readJsonResponse(res, 'Error generando Nota de Pedido');
    if (!res.ok || !data?.exito) {
      throw new Error(data?.error || `Error generando Nota de Pedido (HTTP ${res.status})`);
    }
    const nota = data.notaPedido as NotaPedidoIngenieria;
    const compActualizados = Array.isArray(data.compromisosActualizados)
      ? (data.compromisosActualizados as CompromisoMinuta[])
      : compromisosMinutas;
    const nuevasNotas = [nota, ...notasPedido];
    setNotasPedido(nuevasNotas);
    setCompromisosMinutas(compActualizados);
    persistirMinutasLocal(minutas, compActualizados, nuevasNotas);

    const sess = cloudSessionRef.current;
    if (sess) {
      await syncNotaPedidoToFirestore(sess, nota).catch(() => {});
      for (const c of compActualizados.filter(item => payload.compromisoIds.includes(item.id))) {
        await syncCompromisoToFirestore(sess, c).catch(() => {});
      }
    }

    return nota;
  };

  const eliminarNotaPedido = async (id: string) => {
    const res = await apiFetch(`/api/minutas/notas-pedido/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('No se pudo eliminar la Nota de Pedido');
    const nuevasNotas = notasPedido.filter(n => n.id !== id);
    setNotasPedido(nuevasNotas);
    persistirMinutasLocal(minutas, compromisosMinutas, nuevasNotas);

    const sess = cloudSessionRef.current;
    if (sess) {
      deleteWorkspaceSubdoc(sess, 'notas_pedido', id).catch(() => {});
    }
  };

  // Persist handlers
  const aplicarResultadoElencos = useCallback((elData: any) => {
    if (!elData) return;
    if (Number.isFinite(Number(elData.totalPlanificados)) && Number(elData.totalPlanificados) > 0) {
      setTotalPlanificados(Math.round(Number(elData.totalPlanificados)));
    }
    if (elData.porFrente && typeof elData.porFrente === 'object') {
      setPlanificadosPorFrente(elData.porFrente);
    }
    setElencosMeta({
      fuente: String(elData.fuente || 'Google Drive Elencos'),
      ultimaSincronizacion: elData.ultimaSincronizacion || new Date().toISOString(),
      archivosAnalizados: Array.isArray(elData.archivosAnalizados) ? elData.archivosAnalizados.length : 0,
      folderId: String(elData.folderId || DEFAULT_ELENCOS_FOLDER_ID),
    });
  }, []);

  // Auto-sincronizar Elencos desde la carpeta oficial de Drive en cuanto exista un token de Drive activo
  const autoSyncedElencoSessionRef = useRef(false);

  const sincronizarElencosDrive = useCallback(
    async (params?: { accessToken?: string; folderId?: string }) => {
      autoSyncedElencoSessionRef.current = true;
      try {
        const data = await runWithDriveToken(async token => {
          setHasDriveToken(true);
          const res = await apiFetch('/api/elencos/sincronizar-drive', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              folderId: params?.folderId || DEFAULT_ELENCOS_FOLDER_ID,
            }),
          });
          const json = await readJsonResponse(res, 'Error sincronizando carpeta de Elencos en Drive');
          if (!res.ok || !json?.exito) {
            throw new Error(json?.error || `Error leyendo carpeta de Elencos (HTTP ${res.status})`);
          }
          return json;
        }, params?.accessToken);

        aplicarResultadoElencos(data);
        return {
          totalPlanificados: Number(data.totalPlanificados || TOTAL_PLANIFICADOS_CONTRATO_GLOBAL),
          porFrente: (data.porFrente || {}) as Record<string, number>,
          fuente: String(data.fuente || 'Google Drive Elencos'),
        };
      } catch (err) {
        if (!getGoogleDriveAccessToken()) {
          autoSyncedElencoSessionRef.current = false;
        }
        throw err;
      }
    },
    [aplicarResultadoElencos]
  );

  const verificarConexionDriveLive = useCallback(
    async (
      folderIdOverride?: string,
      tokenOverride?: string
    ): Promise<DriveConnectionState | null> => {
      const token = tokenOverride || getGoogleDriveAccessToken();
      const targetFolderId = extraerDriveFolderId(folderIdOverride ?? driveFolderId);
      if (!token) {
        setHasDriveToken(false);
        const vacio: DriveConnectionState = {
          connected: false,
          verificando: false,
          permisoLecturaDrive: false,
          accountEmail: null,
          accountName: null,
          remainingMinutes: 0,
          rootFolderId: targetFolderId,
          rootFolderName: null,
          rootFolderAccessible: false,
          subcarpetas: [],
          elencosAccesible: false,
          error: null,
          ultimaVerificacion: null,
        };
        setDriveConnectionState(vacio);
        return null;
      }

      const tokenInfo = getGoogleDriveTokenInfo();
      setDriveConnectionState(prev => ({
        ...prev,
        connected: true,
        verificando: true,
        accountEmail: tokenInfo.accountEmail || prev.accountEmail,
        accountName: tokenInfo.accountName || prev.accountName,
        remainingMinutes: tokenInfo.remainingMinutes || prev.remainingMinutes,
        rootFolderId: targetFolderId,
        error: null,
      }));

      try {
        const res = await apiFetch('/api/drive/verificar', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ folderId: targetFolderId }),
        });
        const data = await tryReadJsonResponse(res);

        if (res.status === 401) {
          clearGoogleDriveAccessToken();
          setHasDriveToken(false);
          const nextState: DriveConnectionState = {
            connected: false,
            verificando: false,
            permisoLecturaDrive: false,
            accountEmail: null,
            accountName: null,
            remainingMinutes: 0,
            rootFolderId: targetFolderId,
            rootFolderName: null,
            rootFolderAccessible: false,
            subcarpetas: [],
            elencosAccesible: false,
            error: data?.error || 'La sesión de Google Drive venció.',
            ultimaVerificacion: new Date().toISOString(),
          };
          setDriveConnectionState(nextState);
          return nextState;
        }

        if (res.status === 403 && data && !data.permisoLecturaDrive) {
          markDriveConsentNeeded(true);
        }

        const nextState: DriveConnectionState = {
          connected: Boolean(data?.conectado ?? res.ok),
          verificando: false,
          permisoLecturaDrive: Boolean(data?.permisoLecturaDrive),
          accountEmail: data?.usuarioEmail || tokenInfo.accountEmail || null,
          accountName: data?.usuarioNombre || tokenInfo.accountName || null,
          remainingMinutes: tokenInfo.remainingMinutes,
          rootFolderId: targetFolderId,
          rootFolderName: data?.carpetaRaizNombre || null,
          rootFolderAccessible: Boolean(data?.carpetaRaizAccesible),
          subcarpetas: Array.isArray(data?.subcarpetas) ? data.subcarpetas : [],
          elencosAccesible: Boolean(data?.elencosAccesible),
          sugerencia: data?.sugerencia || undefined,
          error: !res.ok ? data?.error || `HTTP ${res.status}` : data?.sugerencia || null,
          ultimaVerificacion: new Date().toISOString(),
        };
        setDriveConnectionState(nextState);
        return nextState;
      } catch (err: any) {
        const fallbackState: DriveConnectionState = {
          connected: true,
          verificando: false,
          permisoLecturaDrive: true,
          accountEmail: tokenInfo.accountEmail,
          accountName: tokenInfo.accountName,
          remainingMinutes: tokenInfo.remainingMinutes,
          rootFolderId: targetFolderId,
          rootFolderName: null,
          rootFolderAccessible: false,
          subcarpetas: [],
          elencosAccesible: false,
          error: err?.message || 'No se pudo verificar la carpeta de Google Drive.',
          ultimaVerificacion: new Date().toISOString(),
        };
        setDriveConnectionState(fallbackState);
        return fallbackState;
      }
    },
    [driveFolderId]
  );

  useEffect(() => {
    const tokenInicial = getGoogleDriveAccessToken();
    if (tokenInicial) {
      setHasDriveToken(true);
      void verificarConexionDriveLive(driveFolderId, tokenInicial);
      if (!autoSyncedElencoSessionRef.current) {
        void sincronizarElencosDrive({ accessToken: tokenInicial }).catch(() => {});
      }
    }
    return subscribeDriveToken(token => {
      setHasDriveToken(Boolean(token));
      if (token) {
        void verificarConexionDriveLive(driveFolderId, token);
        if (!autoSyncedElencoSessionRef.current) {
          void sincronizarElencosDrive({ accessToken: token }).catch(() => {});
        }
      } else {
        autoSyncedElencoSessionRef.current = false;
        setDriveConnectionState(prev => ({
          ...prev,
          connected: false,
          verificando: false,
          permisoLecturaDrive: false,
          remainingMinutes: 0,
        }));
      }
    });
  }, [sincronizarElencosDrive, verificarConexionDriveLive, driveFolderId]);

  useEffect(() => {
    if (!hasDriveToken) return;
    const timer = setInterval(() => {
      const info = getGoogleDriveTokenInfo();
      setHasDriveToken(info.hasToken);
      setDriveConnectionState(prev => ({
        ...prev,
        connected: info.hasToken,
        remainingMinutes: info.remainingMinutes,
      }));
    }, 30000);
    return () => clearInterval(timer);
  }, [hasDriveToken]);

  const updateConfig = (newCfg: AppConfig) => {
    setConfig(newCfg);
    localStorage.setItem('cfg_api_url', newCfg.apiUrl);
    localStorage.setItem('cfg_r2_account_id', newCfg.r2AccountId);
    localStorage.setItem('cfg_r2_bucket', newCfg.r2Bucket);

    const sess = cloudSessionRef.current;
    if (sess) {
      syncWorkspaceSettingsFields(sess, { config: newCfg }).catch(err =>
        console.warn('[FirestoreSync] Error guardando config:', err)
      );
    }
  };

  const notasTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setNotasCampo = (txt: string) => {
    setNotasCampoState(txt);
    localStorage.setItem('notas_obra_132kv', txt);

    const sess = cloudSessionRef.current;
    if (sess) {
      if (notasTimerRef.current) clearTimeout(notasTimerRef.current);
      notasTimerRef.current = setTimeout(() => {
        syncWorkspaceSettingsFields(sess, { notasCampo: txt }).catch(() => {});
      }, 800);
    }
  };

  const setUltimoInforme = (inf: string) => {
    setUltimoInformeState(inf);
    const sess = cloudSessionRef.current;
    if (sess) {
      syncWorkspaceSettingsFields(sess, { ultimoInforme: inf }).catch(() => {});
    }
  };

  const addFoto = (f: FotoCampo) => {
    setFotosCampo(prev => {
      const updated = [f, ...prev].slice(0, 10);
      try {
        localStorage.setItem('fotos_obra_132kv', JSON.stringify(updated));
      } catch (e) {
        console.warn('LocalStorage limit for photos:', e);
      }
      return updated;
    });
    const sess = cloudSessionRef.current;
    if (sess) {
      syncFotoCampoToFirestore(sess, f).catch(() => {});
    }
  };

  const actualizarFotoAnalisis = (id: string, analisisIA: string) => {
    let fotoActualizada: FotoCampo | null = null;
    setFotosCampo(prev => {
      const updated = prev.map(f => {
        if (f.id === id) {
          fotoActualizada = { ...f, analisisIA };
          return fotoActualizada;
        }
        return f;
      });
      try {
        localStorage.setItem('fotos_obra_132kv', JSON.stringify(updated));
      } catch {}
      return updated;
    });
    const sess = cloudSessionRef.current;
    if (sess && fotoActualizada) {
      syncFotoCampoToFirestore(sess, fotoActualizada).catch(() => {});
    }
  };

  const deleteFoto = (id: string) => {
    setFotosCampo(prev => {
      const updated = prev.filter(f => f.id !== id);
      localStorage.setItem('fotos_obra_132kv', JSON.stringify(updated));
      return updated;
    });
    const sess = cloudSessionRef.current;
    if (sess) {
      deleteWorkspaceSubdoc(sess, 'fotos_campo', id).catch(() => {});
    }
  };

  const addAudio = (a: NotaAudio) => {
    setAudiosCampo(prev => {
      const updated = [a, ...prev].slice(0, 10);
      try {
        localStorage.setItem('audios_obra_132kv', JSON.stringify(updated));
      } catch (e) {
        console.warn('LocalStorage limit for audio:', e);
      }
      return updated;
    });
    const sess = cloudSessionRef.current;
    if (sess) {
      syncAudioCampoToFirestore(sess, a).catch(() => {});
    }
  };

  const actualizarAudioTranscripcion = (id: string, transcripcion: string) => {
    let audioActualizado: NotaAudio | null = null;
    setAudiosCampo(prev => {
      const updated = prev.map(a => {
        if (a.id === id) {
          audioActualizado = { ...a, transcripcion };
          return audioActualizado;
        }
        return a;
      });
      try {
        localStorage.setItem('audios_obra_132kv', JSON.stringify(updated));
      } catch {}
      return updated;
    });
    const sess = cloudSessionRef.current;
    if (sess && audioActualizado) {
      syncAudioCampoToFirestore(sess, audioActualizado).catch(() => {});
    }
  };

  const deleteAudio = (id: string) => {
    setAudiosCampo(prev => {
      const updated = prev.filter(a => a.id !== id);
      localStorage.setItem('audios_obra_132kv', JSON.stringify(updated));
      return updated;
    });
    const sess = cloudSessionRef.current;
    if (sess) {
      deleteWorkspaceSubdoc(sess, 'audios_campo', id).catch(() => {});
    }
  };

  const saveHitos = async (nuevosHitos: Hito[]) => {
    const anteriores = [...hitos];
    setHitos(nuevosHitos);
    localStorage.setItem('cache_hitos_obra_132kv', JSON.stringify(nuevosHitos));

    const sess = cloudSessionRef.current;
    if (sess) {
      syncHitosCollectionToFirestore(sess, nuevosHitos, anteriores).catch(err =>
        console.warn('[FirestoreSync] Error sincronizando hitos:', err)
      );
    }

    if (config.apiUrl && config.apiUrl.startsWith('http')) {
      let url = config.apiUrl;
      if (url.includes('/edit')) url = url.replace(/\/edit.*$/, '/exec');
      if (!url.endsWith('/exec')) url = url.replace(/\/?$/, '/exec');

      try {
        await fetch(url, {
          method: 'POST',
          body: JSON.stringify({
            accion: 'guardar_cronograma_hitos_r2',
            hitos: nuevosHitos,
          }),
        });
      } catch (e) {
        console.warn('Could not sync hitos to remote API:', e);
      }
    }
  };

  // Sync Logic (Sheets/R2 + Cloud Firestore)
  const sincronizarDatos = useCallback(async () => {
    setIsSyncing(true);
    setConnectionStatus('Sincronizando...');

    const sess = cloudSessionRef.current;
    const apiUrl = config.apiUrl.trim();
    if (apiUrl && apiUrl.startsWith('http')) {
      let finalUrl = apiUrl;
      if (finalUrl.includes('/edit')) finalUrl = finalUrl.replace(/\/edit.*$/, '/exec');
      if (!finalUrl.endsWith('/exec') && !finalUrl.includes('/exec?')) finalUrl = finalUrl.replace(/\/?$/, '/exec');

      try {
        const separador = finalUrl.includes('?') ? '&' : '?';
        const res = await fetch(`${finalUrl}${separador}api=datos&_t=${Date.now()}`, {
          method: 'GET',
          redirect: 'follow',
        });
        const data = await readJsonResponse(res, 'Error leyendo Google Sheets');
        if (data && data.planos && Array.isArray(data.planos)) {
          setPlanos(data.planos);
          localStorage.setItem('cache_planos_132kv', JSON.stringify(data.planos));
          if (sess) {
            syncPlanosCollectionToFirestore(sess, data.planos).catch(() => {});
          }
          if (Array.isArray(data.hitos) && data.hitos.length > 0) {
            setHitos(data.hitos);
            localStorage.setItem('cache_hitos_obra_132kv', JSON.stringify(data.hitos));
            if (sess) {
              syncHitosCollectionToFirestore(sess, data.hitos, hitos).catch(() => {});
            }
          }
          if (data.megabytesR2) {
            const mb = `${data.megabytesR2} MB`;
            setMegabytesR2(mb);
            if (sess) syncWorkspaceSettingsFields(sess, { megabytesR2: mb }).catch(() => {});
          }
          if (Number.isFinite(Number(data.totalPlanificados)) && Number(data.totalPlanificados) > 0) {
            setTotalPlanificados(Math.round(Number(data.totalPlanificados)));
          }
          if (data.porFrente && typeof data.porFrente === 'object') {
            setPlanificadosPorFrente(data.porFrente);
          }
          const driveToken = getGoogleDriveAccessToken();
          if (driveToken) {
            void sincronizarElencosDrive({ accessToken: driveToken }).catch(() => {});
          }
          setConnectionStatus(sess ? 'Nube + Sheets ✓' : 'Sheets Conectado');
          setIsSyncing(false);
          return;
        }
      } catch (err) {
        console.warn('Fetch to Sheets failed, trying R2...', err);
      }
    }

    // Si Google Drive está conectado, sincronizar automáticamente los Elencos / Seguimiento desde la carpeta oficial
    const activeDriveToken = getGoogleDriveAccessToken();
    if (activeDriveToken) {
      try {
        await sincronizarElencosDrive({ accessToken: activeDriveToken });
      } catch (errEl) {
        console.warn('Drive Elencos sync warning:', errEl);
      }
    } else {
      try {
        const resEl = await apiFetch('/api/elencos');
        if (resEl.ok) {
          const elData = await tryReadJsonResponse(resEl);
          if (elData?.exito) aplicarResultadoElencos(elData);
        }
      } catch {}
    }

    const accountId = config.r2AccountId || 'e1d197bd1aa5e242733d883eab2a9322';
    const bucketName = config.r2Bucket || 'backup-obra-132kv';
    const urlR2 = `https://${accountId}.r2.cloudflarestorage.com/${bucketName}/_indice_maestro_obra.json`;

    try {
      const resR2 = await fetch(urlR2);
      const dataR2 = await readJsonResponse(resR2, 'Error leyendo respaldo R2');
      if (dataR2 && (dataR2.carpetas || dataR2.planos)) {
        const planosExtraidos: Plano[] = (dataR2.carpetas || []).map((c: { ruta?: string; nombre: string }) => {
          const partes = (c.ruta || '').split('/');
          const nombreDoc = partes[partes.length - 1] || c.nombre;
          return {
            codigo: nombreDoc,
            descripcion: nombreDoc,
            disciplina: 'General',
            revision: 'EO',
            proyecto: 'General',
            estado: 'Abierto',
            selloApc: false,
            urlDrive: '',
            urlR2: `https://${accountId}.r2.cloudflarestorage.com/${bucketName}/${encodeURI(c.ruta || '')}`,
          };
        });

        if (planosExtraidos.length > 0) {
          setPlanos(planosExtraidos);
          localStorage.setItem('cache_planos_132kv', JSON.stringify(planosExtraidos));
          if (sess) {
            syncPlanosCollectionToFirestore(sess, planosExtraidos).catch(() => {});
          }
        }
        if (dataR2.megabytes_transferidos) {
          const mb = `${dataR2.megabytes_transferidos} MB`;
          setMegabytesR2(mb);
          if (sess) syncWorkspaceSettingsFields(sess, { megabytesR2: mb }).catch(() => {});
        }
        setConnectionStatus(sess ? 'Nube Sync ✓' : 'Respaldo R2 Activo');
        setIsSyncing(false);
        return;
      }
    } catch (errR2) {
      console.warn('R2 backup check:', errR2);
    }

    setConnectionStatus(sess ? 'Nube Sync ✓' : 'Respaldo R2 Activo');
    setIsSyncing(false);
  }, [config.apiUrl, config.r2AccountId, config.r2Bucket, hitos, sincronizarElencosDrive, aplicarResultadoElencos]);

  // Extracción directa de pliegos técnicos reales
  const extraerDePliego = async (consulta: string): Promise<string> => {
    if (pliegosReales.length === 0) {
      return "⚠️ **No hay pliegos reales cargados en el sistema.**\n\nPor favor, haz clic en **'➕ Cargar Pliego Real'** para subir tus documentos (PDF, Word o Texto).";
    }

    try {
      const res = await apiFetch('/api/pliegos/extraer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ consulta }),
      });
      if (res.ok) {
        const data = await tryReadJsonResponse(res);
        if (data && data.exito && data.respuesta) {
          return data.respuesta;
        }
      }
    } catch (e) {
      console.warn('Fallo en /api/pliegos/extraer, usando motor local:', e);
    }
    const local = buscarYExtraerDePliegosReales(consulta, pliegosReales);
    return local.resumen;
  };

  const construirContextoObra = (consulta?: string) => {
    const apcCount = planos.filter(p => p.selloApc).length;
    const resumenPorDisciplina: Record<string, { total: number; apc: number }> = {};
    for (const p of planos) {
      const disc = p.disciplina || 'General';
      if (!resumenPorDisciplina[disc]) resumenPorDisciplina[disc] = { total: 0, apc: 0 };
      resumenPorDisciplina[disc].total += 1;
      if (p.selloApc) resumenPorDisciplina[disc].apc += 1;
    }

    // Buscar sobre TODOS los planos los que coincidan con la consulta + completar hasta 120 representativos
    const tokensConsulta = (consulta || '')
      .toLowerCase()
      .split(/\s+/)
      .filter(t => t.length >= 2);
    const planosOrdenados = [...planos]
      .map(p => {
        const txt = `${p.codigo} ${p.descripcion} ${p.disciplina} ${p.proyecto} ${p.estado || ''}`.toLowerCase();
        let sc = 0;
        for (const t of tokensConsulta) {
          if (txt.includes(t)) sc += 10;
        }
        return { p, sc };
      })
      .sort((a, b) => b.sc - a.sc)
      .slice(0, 120)
      .map(({ p }) => ({
        codigo: p.codigo,
        descripcion: p.descripcion,
        disciplina: p.disciplina,
        revision: p.revision,
        proyecto: p.proyecto,
        estado: p.estado,
        selloApc: p.selloApc,
      }));

    return {
      resumenPlanos: {
        totalPlanificados,
        emitidos: planos.length,
        conSelloApc: apcCount,
        porDisciplina: resumenPorDisciplina,
        planosRelevantesYCatalogo: planosOrdenados,
      },
      hitos: hitos.map(h => ({
        codigo: h.codigo,
        nombre: h.nombre,
        frente: h.frente,
        fechaObjetivo: h.fechaObjetivo,
        pesoContractual: h.pesoContractual,
        responsable: h.responsable,
      })),
      interferencias: interferencias.map(i => ({
        empresa: i.empresa,
        tipoInterferencia: i.tipoInterferencia,
        estadoTramite: i.estadoTramite,
        vanosAfectados: i.vanosAfectados,
        fechaDocumento: i.fechaDocumento,
        resumenSolicitud: i.resumenSolicitud ? i.resumenSolicitud.slice(0, 350) : '',
      })),
      minutas: minutas.map(m => ({
        codigo: m.codigo,
        titulo: m.titulo,
        fechaReunion: m.fechaReunion,
        frente: m.frente,
        resumen: m.resumen ? m.resumen.slice(0, 350) : '',
      })),
      compromisosMinutas: compromisosMinutas.map(c => ({
        minutaCodigo: c.minutaCodigo,
        minutaFecha: c.minutaFecha,
        numeroItem: c.numeroItem,
        descripcion: c.descripcion ? c.descripcion.slice(0, 260) : '',
        responsable: c.responsable,
        frente: c.frente,
        fechaLimite: c.fechaLimite,
        estado: c.estado,
      })),
      notasPedido: notasPedido.map(n => ({
        numeroNota: n.numeroNota,
        fechaEmision: n.fechaEmision,
        emisor: n.emisor,
        destinatario: n.destinatario,
        frente: n.frente,
        asunto: n.asunto,
      })),
      notasLibroResumen: notasLibro.map(n => ({
        id: n.id,
        codigo: n.codigo,
        tipoNota: n.tipoNota,
        titulo: n.titulo,
        fecha: n.fecha,
        actorEmisor: n.actorEmisor,
        emisorDetalle: n.emisorDetalle,
        actorReceptor: n.actorReceptor,
        receptorDetalle: n.receptorDetalle,
        sentido: n.sentido,
        estadoRespuesta: n.estadoRespuesta,
        respondeANotas: n.respondeANotas,
        respondidaPorNotas: n.respondidaPorNotas,
        referenciasNotas: n.referenciasNotas,
        resumen: n.resumen ? n.resumen.slice(0, 240) : '',
      })),
      notasCampo: notasCampo ? notasCampo.slice(0, 6000) : '',
    };
  };

  const conectarGoogleDriveChat = async (options?: {
    forceConsent?: boolean;
  }): Promise<boolean> => {
    const res = await signInWithGoogleDrive({
      forceConsent: Boolean(options?.forceConsent),
      includeDriveScope: true,
    });
    const tok = res?.accessToken || getGoogleDriveAccessToken();
    const ok = Boolean(tok);
    setHasDriveToken(ok);
    if (!ok || !tok) {
      throw new Error(
        'No se recibió el permiso de lectura de Google Drive. Asegúrate de marcar la casilla de Google Drive en la ventana de Google.'
      );
    }
    const diag = await verificarConexionDriveLive(driveFolderId, tok);
    if (diag && !diag.permisoLecturaDrive) {
      markDriveConsentNeeded(true);
      throw new Error(
        diag.sugerencia ||
          'Tu cuenta de Google inició sesión sin permiso de lectura de Drive. Haz clic en "Reautorizar Drive" y marca la casilla de Google Drive.'
      );
    }
    return ok;
  };

  const desconectarGoogleDrive = async () => {
    markDriveConsentNeeded(false);
    clearGoogleDriveAccessToken();
    setHasDriveToken(false);
    setDriveConnectionState(prev => ({
      ...prev,
      connected: false,
      verificando: false,
      permisoLecturaDrive: false,
      accountEmail: null,
      accountName: null,
      remainingMinutes: 0,
      rootFolderName: null,
      rootFolderAccessible: false,
      subcarpetas: [],
      elencosAccesible: false,
      error: null,
    }));
  };

  const sincronizarDocsTecnicosDrive = async (params?: {
    folderId?: string;
    maxNuevos?: number;
  }) => {
    const data = await runWithDriveToken(async token => {
      setHasDriveToken(true);
      const res = await apiFetch('/api/drive-docs/sincronizar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          folderId: params?.folderId || extraerDriveFolderId(driveFolderId),
          maxNuevos: params?.maxNuevos ?? 15,
        }),
      });
      const json = await readJsonResponse(res, 'Error indexando documentos técnicos desde Drive');
      if (!res.ok || !json?.exito) {
        throw new Error(json?.error || `Error indexando Drive (HTTP ${res.status})`);
      }
      return json;
    });

    const total = Number(data.totalIndexados || 0);
    setDriveDocsCount(total);
    return {
      totalIndexados: total,
      nuevos: Number(data.nuevos || 0),
      omitidosExistentes: Number(data.omitidosExistentes || 0),
      nombresNuevos: Array.isArray(data.nombresNuevos) ? (data.nombresNuevos as string[]) : [],
    };
  };

  const ejecutarStreamChat = async (
    msg: string,
    historial: string,
    historialMensajes: Array<{ rol: 'usuario' | 'asistente'; texto: string }>,
    pliegoIds: string[],
    contextoObra: Record<string, any>,
    idAi: string,
    driveAccessToken?: string,
    driveFolderIdParam?: string,
    precisionOverride?: PrecisionNivelId
  ): Promise<{
    ok: boolean;
    needsSync?: boolean;
    limitReached?: boolean;
    errorMsg?: string;
    precisionMeta?: GeminiPrecisionMeta;
  }> => {
    const res = await apiFetch('/api/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mensaje: msg,
        historial,
        historialMensajes,
        pliegoIds,
        contextoObra,
        driveAccessToken,
        driveFolderId: driveFolderIdParam,
        precisionNivel: modelosPagosHabilitados ? precisionOverride || precisionNivel : 'gratuito',
      }),
    });

    const cType = (res.headers.get('content-type') || '').toLowerCase();
    if (!res.ok || !res.body || cType.includes('text/html')) {
      let detail = `HTTP ${res.status}`;
      try {
        const errJson = await tryReadJsonResponse(res);
        if (errJson?.error) detail = `${detail}: ${String(errJson.error)}`;
      } catch {}
      return { ok: false, errorMsg: detail };
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let acumulado = '';
    let needsSync = false;
    let streamErr = '';
    let streamPrecisionMeta: GeminiPrecisionMeta | undefined;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const eventos = buffer.split('\n\n');
      buffer = eventos.pop() || '';

      for (const evt of eventos) {
        const line = evt.trim();
        if (!line.startsWith('data:')) continue;
        const jsonStr = line.slice(5).trim();
        if (!jsonStr) continue;
        try {
          const payload = JSON.parse(jsonStr);
          if (payload.needsSync) {
            needsSync = true;
          }
          if (typeof payload.driveDocsTotal === 'number') {
            setDriveDocsCount(payload.driveDocsTotal);
          }
          if (payload.estadoPrecision) {
            setGeminiPrecisionState(payload.estadoPrecision as GeminiPrecisionState);
          }
          if (payload.precisionMeta) {
            streamPrecisionMeta = payload.precisionMeta as GeminiPrecisionMeta;
            setChatMessages(prev =>
              prev.map(m => (m.id === idAi ? { ...m, precisionMeta: streamPrecisionMeta } : m))
            );
          }
          if (payload.chunk) {
            acumulado += payload.chunk;
            const textoActual = acumulado;
            setChatMessages(prev =>
              prev.map(m =>
                m.id === idAi
                  ? {
                      ...m,
                      texto: textoActual,
                      ...(streamPrecisionMeta ? { precisionMeta: streamPrecisionMeta } : {}),
                    }
                  : m
              )
            );
          }
          if (payload.error && !acumulado) {
            streamErr = String(payload.error);
            return {
              ok: false,
              limitReached: Boolean(payload.limitReached),
              errorMsg: streamErr,
            };
          }
        } catch {}
      }
    }

    if (needsSync) return { ok: false, needsSync: true };
    return {
      ok: acumulado.trim().length > 0,
      precisionMeta: streamPrecisionMeta,
      errorMsg: streamErr || (!acumulado.trim() ? 'Stream vacío del servidor' : undefined),
    };
  };

  const construirRespaldoLocalMultifuente = (consulta: string, motivoErrorApi?: string): string => {
    const qNorm = consulta
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    const stop = new Set([
      'los', 'las', 'una', 'uno', 'con', 'sin', 'por', 'para', 'sobre', 'entre',
      'como', 'cual', 'que', 'hay', 'tiene', 'esta', 'este', 'del', 'algun', 'alguna',
    ]);
    const tokens = Array.from(
      new Set(
        qNorm
          .replace(/[^a-z0-9_-]+/g, ' ')
          .split(/\s+/)
          .filter(t => t.length >= 3 && !stop.has(t))
      )
    );

    const scoreTexto = (txt: string) => {
      const n = txt
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
      let s = 0;
      for (const t of tokens) {
        if (n.includes(t)) s += 10;
      }
      return s;
    };

    const notasCoinc = notasLibro
      .map(n => ({
        n,
        sc: scoreTexto(
          `${n.codigo} ${n.tipoNota} ${n.titulo} ${n.resumen} ${n.contenidoTexto || ''}`
        ),
      }))
      .filter(x => x.sc > 0)
      .sort((a, b) => b.sc - a.sc)
      .slice(0, 8);

    const npCoinc = notasPedido
      .map(np => ({
        np,
        sc: scoreTexto(`${np.numeroNota} ${np.asunto} ${np.contenidoMarkdown || ''}`),
      }))
      .filter(x => x.sc > 0)
      .sort((a, b) => b.sc - a.sc)
      .slice(0, 5);

    const minCoinc = minutas
      .map(m => ({
        m,
        sc: scoreTexto(`${m.codigo} ${m.titulo} ${m.resumen || ''} ${m.contenidoTexto || ''}`),
      }))
      .filter(x => x.sc > 0)
      .sort((a, b) => b.sc - a.sc)
      .slice(0, 5);

    const extraccionPliegos = buscarYExtraerDePliegosReales(consulta, pliegosReales);

    const partes: string[] = [];
    if (motivoErrorApi) {
      partes.push(
        `> ⚠️ **El motor IA Gemini del servidor no pudo completar esta respuesta (${motivoErrorApi}).** Mostrando búsqueda local directa en Notas, Minutas y Pliegos.`
      );
    }

    if (notasCoinc.length > 0) {
      partes.push(
        `### Notas de Libro / Comunicaciones coincidentes (${notasCoinc.length})\n` +
          notasCoinc
            .map(
              ({ n }) =>
                `- **${n.codigo}** (${n.tipoNota} · ${n.fecha || 's/f'}) — *${n.actorEmisor} ➔ ${n.actorReceptor}* · **${n.estadoRespuesta}**\n  ${n.resumen || n.titulo}`
            )
            .join('\n')
      );
    }

    if (npCoinc.length > 0) {
      partes.push(
        `### Notas de Pedido generadas coincidentes (${npCoinc.length})\n` +
          npCoinc
            .map(({ np }) => `- **${np.numeroNota}** (${np.fechaEmision}): ${np.asunto}`)
            .join('\n')
      );
    }

    if (minCoinc.length > 0) {
      partes.push(
        `### Minutas coincidentes (${minCoinc.length})\n` +
          minCoinc
            .map(({ m }) => `- **${m.codigo}** (${m.fechaReunion}): ${m.titulo}${m.resumen ? ` — ${m.resumen.slice(0, 180)}` : ''}`)
            .join('\n')
      );
    }

    if (extraccionPliegos.coincidencias.length > 0 || partes.length === (motivoErrorApi ? 1 : 0)) {
      partes.push(extraccionPliegos.resumen);
    }

    return partes.join('\n\n');
  };

  const sendChatMessage = async (msg: string, precisionOverride?: PrecisionNivelId) => {
    if (!msg.trim()) return;
    const nivelActivo: PrecisionNivelId = modelosPagosHabilitados
      ? precisionOverride || precisionNivel
      : 'gratuito';

    const mensajesPrevios = chatMessages
      .filter(m => m.id !== 'init-1' && m.id !== 'init-reset' && m.texto.trim().length > 0)
      .slice(-14);

    const historialMensajes: Array<{ rol: 'usuario' | 'asistente'; texto: string }> =
      mensajesPrevios.map(m => ({
        rol: m.esUsuario ? 'usuario' : 'asistente',
        texto: m.texto.slice(0, 4000),
      }));

    const historialReciente = mensajesPrevios
      .slice(-8)
      .map(m => `${m.esUsuario ? 'Usuario' : 'Asistente'}: ${m.texto.slice(0, 1800)}`)
      .join('\n\n');

    const driveAccessToken = getGoogleDriveAccessToken() || undefined;
    setHasDriveToken(Boolean(driveAccessToken));
    const driveFolderResuelto = extraerDriveFolderId(driveFolderId);

    const userMsg: MensajeChat = {
      id: 'usr-' + Date.now(),
      texto: msg,
      esUsuario: true,
      fecha: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      adjuntosNombres: chatAdjuntos.length > 0 ? chatAdjuntos.map(a => a.nombre) : undefined,
    };

    setChatMessages(prev => [...prev, userMsg]);

    const idAi = 'ai-' + Date.now();
    const loadingAi: MensajeChat = {
      id: idAi,
      texto: driveAccessToken
        ? 'Analizando tu consulta y revisando Google Drive, Pliegos y Libro de Notas...'
        : 'Analizando tu consulta, Pliegos, Notas de Libro e ingeniería de obra...',
      esUsuario: false,
      fecha: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    setChatMessages(prev => [...prev, loadingAi]);

    const pliegoIds = pliegosReales.map(p => p.id);
    const contextoObra = construirContextoObra(msg);
    let ultimoErrorApi = '';

    try {
      // Hidratar Notas de Libro en segundo plano si aún no se sincronizó esta firma (sin bloquear el envío si falla)
      if (notasLibro.length > 0) {
        void hidratarNotasLibroEnServidorLocal(notasLibro);
      }
      let streamRes = await ejecutarStreamChat(
        msg,
        historialReciente,
        historialMensajes,
        pliegoIds,
        contextoObra,
        idAi,
        driveAccessToken,
        driveFolderResuelto,
        nivelActivo
      );
      if (streamRes.limitReached) {
        const msgLimite = `> ⚠️ **Límite diario de uso/costo alcanzado:** ${streamRes.errorMsg || 'Se alcanzó el límite configurado para este modelo.'}\n\nPuedes cambiar al nivel **Económico · Rápido** en el selector superior del chat o ampliar/reiniciar los límites diarios en **Límites y costos**.`;
        setChatMessages(prev => prev.map(m => (m.id === idAi ? { ...m, texto: msgLimite } : m)));
        return;
      }
      if (streamRes.needsSync) {
        setChatMessages(prev =>
          prev.map(m => (m.id === idAi ? { ...m, texto: 'Sincronizando índice de pliegos y notas...' } : m))
        );
        for (const p of pliegosReales) {
          if (p.contenidoTexto) {
            await hidratarPliegoEnServidorLocal(p);
          }
        }
        await resincronizarPliegosDesdeIDB();
        streamRes = await ejecutarStreamChat(
          msg,
          historialReciente,
          historialMensajes,
          pliegoIds,
          contextoObra,
          idAi,
          driveAccessToken,
          driveFolderResuelto,
          nivelActivo
        );
      }
      if (streamRes.limitReached) {
        const msgLimite = `> ⚠️ **Límite diario de uso/costo alcanzado:** ${streamRes.errorMsg || 'Se alcanzó el límite configurado para este modelo.'}\n\nPuedes cambiar al nivel **Económico · Rápido** en el selector superior del chat o ampliar/reiniciar los límites diarios en **Límites y costos**.`;
        setChatMessages(prev => prev.map(m => (m.id === idAi ? { ...m, texto: msgLimite } : m)));
        return;
      }
      if (streamRes.ok) return;
      if (streamRes.errorMsg) ultimoErrorApi = streamRes.errorMsg;
    } catch (errStream: any) {
      ultimoErrorApi = errStream?.message || 'Error en stream';
      console.warn('Error en stream /api/chat/stream:', errStream);
    }

    try {
      const res = await apiFetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mensaje: msg,
          historial: historialReciente,
          historialMensajes,
          pliegoIds,
          contextoObra,
          driveAccessToken,
          driveFolderId: driveFolderResuelto,
          precisionNivel: nivelActivo,
        }),
      });
      const data = await tryReadJsonResponse(res);
      if (typeof data?.driveDocsTotal === 'number') {
        setDriveDocsCount(data.driveDocsTotal);
      }
      if (data?.estadoPrecision) {
        setGeminiPrecisionState(data.estadoPrecision as GeminiPrecisionState);
      }
      if (res.status === 429 || data?.limitReached) {
        const msgLimite = `> ⚠️ **Límite diario de uso/costo alcanzado:** ${data?.error || 'Se alcanzó el límite configurado para este modelo.'}\n\n${
          modelosPagosHabilitados
            ? 'Puedes cambiar al nivel **Gratuito · $0** o **Económico · Rápido** en el selector superior del chat o ampliar/reiniciar los límites diarios en **Límites y costos**.'
            : 'Puedes ajustar el tope a 0 (sin límite) o reiniciar el contador hoy en **Límites y costos**.'
        }`;
        setChatMessages(prev => prev.map(m => (m.id === idAi ? { ...m, texto: msgLimite } : m)));
        return;
      }
      if (res.ok && data && data.exito && data.respuesta) {
        setChatMessages(prev =>
          prev.map(m =>
            m.id === idAi
              ? {
                  ...m,
                  texto: data.respuesta,
                  precisionMeta: data.precisionMeta as GeminiPrecisionMeta | undefined,
                }
              : m
          )
        );
        return;
      }
      ultimoErrorApi = data?.error ? String(data.error) : `HTTP ${res.status}`;
    } catch (errApi: any) {
      ultimoErrorApi = errApi?.message || ultimoErrorApi || 'Error de red';
      console.warn('API local /api/chat no respondió, usando respaldo local multifuente:', errApi);
    }

    const respaldo = construirRespaldoLocalMultifuente(msg, ultimoErrorApi);
    setChatMessages(prev => prev.map(m => (m.id === idAi ? { ...m, texto: respaldo } : m)));
  };

  const clearChat = () => {
    setChatMessages([
      {
        id: 'init-reset',
        texto:
          '⚡ Chat reiniciado.\n\n' +
          `Activos en memoria: **${notasLibro.length} nota(s) de libro** · ` +
          `**${pliegosReales.length} pliego(s) real(es)** · ` +
          `**${[planoCompararA, planoCompararB].filter(Boolean).length} plano(s) PDF en comparador** · ` +
          `**${planos.length} planos en catálogo** · **${hitos.length} hitos** · **${interferencias.length} cruces**.`,
        esUsuario: false,
        fecha: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
  };

  return (
    <AppContext.Provider
      value={{
        planos,
        hitos,
        interferencias,
        pliegosReales,
        planoCompararA,
        planoCompararB,
        chatAdjuntos,
        minutas,
        compromisosMinutas,
        notasPedido,
        notasLibro,
        config,
        connectionStatus,
        cloudSyncStatus,
        cloudUserEmail,
        cloudRole: cloudSession?.role || null,
        invitedEmailHint,
        megabytesR2,
        activeTab,
        selectedFrenteFilter,
        isSyncing,
        notasCampo,
        audiosCampo,
        fotosCampo,
        chatMessages,
        ultimoInforme,
        totalPlanificados,
        planificadosPorFrente,
        elencosMeta,
        sincronizarElencosDrive,
        isSettingsOpen,
        isHitosModalOpen,
        isPliegosModalOpen,
        setActiveTab,
        setSelectedFrenteFilter,
        setIsSettingsOpen,
        setIsHitosModalOpen,
        setIsPliegosModalOpen,
        conectarNubeDispositivos,
        conectarCorreoCorporativo,
        registrarCorreoCorporativo,
        reenviarMailVerificacion,
        reintentarConexionNube,
        enviarResetClaveCorreo,
        desconectarNubeDispositivos,
        invitarColaboradorNube,
        listarInvitacionesNube,
        revocarInvitacionNube,
        subirArchivoPliegoReal,
        subirPlanoComparador,
        eliminarPlanoComparador,
        subirAdjuntoChat,
        eliminarAdjuntoChat,
        limpiarAdjuntosChat,
        agregarPliegoReal,
        eliminarPliegoReal,
        limpiarTodosPliegosReales,
        sincronizarInterferenciasDrive,
        archivosPendientesNotasLibro,
        escaneoTruncadoNotasLibro,
        driveDocsCount,
        hasDriveToken,
        driveFolderId,
        setDriveFolderId,
        driveConnectionState,
        verificarConexionDriveLive,
        conectarGoogleDriveChat,
        desconectarGoogleDrive,
        sincronizarDocsTecnicosDrive,
        sincronizarNotasLibroDrive,
        subirNotaLibroArchivo,
        registrarNotaLibroTexto,
        actualizarNotaLibro,
        eliminarNotaLibro,
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
        updateConfig,
        sincronizarDatos,
        saveHitos,
        setNotasCampo,
        addFoto,
        actualizarFotoAnalisis,
        deleteFoto,
        addAudio,
        actualizarAudioTranscripcion,
        deleteAudio,
        sendChatMessage,
        extraerDePliego,
        clearChat,
        setUltimoInforme,
        precisionNivel,
        setPrecisionNivel,
        geminiPrecisionState,
        esUsuarioMaestro,
        modelosPagosHabilitados,
        toggleModelosPagosMaestro,
        refrescarEstadoGemini,
        guardarConfigPrecision,
        resetearUsoGemini,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within an AppProvider');
  return context;
};
