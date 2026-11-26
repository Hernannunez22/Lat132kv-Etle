export interface Plano {
  codigo: string;
  descripcion: string;
  disciplina: string;
  revision: string;
  proyecto: string;
  estado?: string;
  selloApc?: boolean;
  urlDrive?: string;
  urlR2?: string;
  fecha?: string;
  fechaDocumento?: string;
  fechaSubida?: string;
}

export interface Hito {
  id: string;
  codigo: string;
  nombre: string;
  frente: string;
  fechaObjetivo: string; // ISO YYYY-MM-DD
  pesoContractual?: string;
  responsable?: string;
  requisitosCriticos?: string[];
  planosRequeridos?: string[];
}

export interface Interferencia {
  id?: string;
  empresa: string;
  tipoInterferencia?: string;
  normativa?: string;
  estadoTramite: string;
  vanosAfectados?: string;
  faltantes?: string[];
  carpetaNombre?: string;
  carpetaDriveId?: string;
  archivoSolicitudNombre?: string;
  archivoSolicitudId?: string;
  archivoSolicitudUrl?: string;
  fechaDocumento?: string;
  resumenSolicitud?: string;
  origen?: 'drive' | 'manual';
  archivosCarpetaCount?: number;
  documentosLeidos?: string[];
}

export interface FrenteObra {
  id: string;
  nombre: string;
  tension: string;
  tipo: string;
  icono: string;
  totalPlanificados: number;
}

export interface NotaAudio {
  id: string;
  fecha: string;
  duracion: string;
  dataUrl: string;
  transcripcion?: string;
}

export interface FotoCampo {
  id: string;
  nombre: string;
  fecha: string;
  dataUrl: string;
  analisisIA?: string;
  frente?: string;
  interferenciaId?: string;
}

export interface ChatAdjuntoPdf {
  id: string;
  nombre: string;
  tipoMime: string;
  tamanioBytes: number;
  tamanioTexto: string;
  fechaSubida: string;
  paginas: number;
  caracteresTexto: number;
  esEscaneado: boolean;
  tiempoProcesoMs: number;
  metricasDetectadas?: string[];
  contenidoTexto?: string;
}

export type PrecisionNivelId = 'gratuito' | 'economico' | 'balanceado' | 'alta';
export type GeminiModeloId =
  | 'openrouter/free'
  | 'gemini-3.1-flash-lite'
  | 'gemini-4-hydrogen'
  | 'gemini-4-neon';
export type ProveedorIAModelo = 'gemini' | 'openrouter';
export type PoliticaLimiteModelo = 'bloquear' | 'fallback_economico';

export interface GeminiPrecisionMeta {
  nivelId: PrecisionNivelId;
  etiquetaNivel: string;
  proveedor?: ProveedorIAModelo;
  modeloUsado: string;
  thinkingLevel: string;
  inputTokens: number;
  outputTokens: number;
  costoUsd: number;
  fallbackDesdeModelo?: string;
}

export interface GeminiModelUsageStat {
  fecha: string;
  consultas: number;
  inputTokens: number;
  outputTokens: number;
  costoUsd: number;
}

export interface GeminiModelCatalogItem {
  nivelId: PrecisionNivelId;
  etiquetaNivel: string;
  descripcion: string;
  proveedor: ProveedorIAModelo;
  modelo: GeminiModeloId;
  thinkingLevel: 'MINIMAL' | 'LOW' | 'MEDIUM' | 'HIGH';
  costoInputPor1M: number;
  costoOutputPor1M: number;
  requiereCreditosPago: boolean;
  configuradoEnServidor: boolean;
  maxConsultasDiarias: number;
  maxCostoUsdDiario: number;
  usoHoy: GeminiModelUsageStat;
  historicoConsultas: number;
  historicoCostoUsd: number;
  limiteConsultasAlcanzado: boolean;
  limiteCostoAlcanzado: boolean;
  disponiblePorLimite: boolean;
}

export interface GeminiUserUsageSummary {
  email: string;
  consultas: number;
  inputTokens: number;
  outputTokens: number;
  costoUsd: number;
  limiteUsd: number;
}

export interface OpenRouterModelSalud {
  ultimoModeloExitoso: string | null;
  ultimoExitoAt: string | null;
  modelosConAlerta: Array<{
    modelo: string;
    estado: string;
    mensaje: string;
    timestamp: string;
  }>;
}

export interface GeminiPrecisionState {
  fechaActual: string;
  nivelPreferido: PrecisionNivelId;
  modeloPreferido: string;
  politicaLimite: PoliticaLimiteModelo;
  modelosPagosHabilitados: boolean;
  puedeUsarModelosPagos?: boolean;
  usuariosPagosAutorizados?: string[];
  limitesPorUsuarioUsd?: Record<string, number>;
  usoPorUsuarioHoy?: GeminiUserUsageSummary[];
  miConsumoHoyUsd?: number;
  miLimiteDiarioUsd?: number;
  esUsuarioMaestro?: boolean;
  costoTotalHoyUsd: number;
  consultasTotalesHoy: number;
  costoHistoricoUsd: number;
  openRouterConfigurado: boolean;
  openRouterModeloPreferido: string;
  openRouterModelosGratuitos: Array<{ id: string; nombre: string; contextLength: number }>;
  openRouterSalud?: OpenRouterModelSalud;
  modelos: GeminiModelCatalogItem[];
}

export interface MensajeChat {
  id: string;
  texto: string;
  esUsuario: boolean;
  fecha?: string;
  adjuntosNombres?: string[];
  precisionMeta?: GeminiPrecisionMeta;
}

export interface AppConfig {
  apiUrl: string;
  r2AccountId: string;
  r2Bucket: string;
}

export interface PliegoReal {
  id: string;
  nombre: string;
  tipoMime: string;
  tamanioBytes: number;
  tamanioTexto: string;
  fechaSubida: string;
  contenidoTexto?: string;
  dataBase64?: string;
  resumen?: string;
  paginas?: number;
  caracteresTexto?: number;
  esEscaneado?: boolean;
  tiempoProcesoMs?: number;
}

export interface PlanoComparacionDoc {
  id: string;
  rol: 'A' | 'B';
  nombre: string;
  tipoMime: string;
  tamanioBytes: number;
  tamanioTexto: string;
  fechaSubida: string;
  paginas: number;
  caracteresTexto: number;
  esEscaneado: boolean;
  tiempoProcesoMs: number;
  contenidoTexto?: string;
  metricasDetectadas?: string[];
}

export type EstadoCompromiso = 'PENDIENTE' | 'EN_CURSO' | 'CUMPLIDO' | 'INCUMPLIDO';

export interface MinutaReunion {
  id: string;
  codigo: string;
  titulo: string;
  fechaReunion: string; // YYYY-MM-DD
  frente: string;
  participantes: string;
  origen: 'drive' | 'archivo' | 'texto' | 'manual';
  nombreArchivo?: string;
  driveFileId?: string;
  driveUrl?: string;
  driveRuta?: string;
  driveModifiedTime?: string;
  resumen?: string;
  contenidoTexto: string;
  fechaCarga: string;
}

export interface CompromisoMinuta {
  id: string;
  minutaId: string;
  minutaCodigo: string;
  minutaFecha: string;
  numeroItem: string;
  descripcion: string;
  responsable: string;
  area: string; // Ingeniería / Obra Civil / Suministros / Gestión / etc.
  frente: string;
  fechaLimite: string; // YYYY-MM-DD
  estado: EstadoCompromiso;
  observaciones?: string;
  documentosRelacionados?: string[];
  notasPedidoIds?: string[];
}

export interface NotaPedidoIngenieria {
  id: string;
  numeroNota: string;
  fechaEmision: string; // YYYY-MM-DD
  emisor: string;
  destinatario: string;
  frente: string;
  asunto: string;
  plazoDescargoDias: number;
  compromisoIds: string[];
  minutasReferenciadas: string[];
  contenidoMarkdown: string;
  fuenteGeneracion: string;
}

export type ActorNotaLibro =
  | 'UTE / Contratista'
  | 'TRANSNOA'
  | 'Inspección'
  | 'Comitente'
  | 'Proyectista'
  | 'Organismo Externo'
  | 'Otro';

export type TipoNotaLibro =
  | 'Nota de Pedido'
  | 'Nota de Servicio'
  | 'Orden de Servicio'
  | 'Comunicación'
  | 'Contestación'
  | 'Otro';

export type SentidoNotaLibro =
  | 'pregunta_solicitud'
  | 'respuesta_devolucion'
  | 'intimacion_observacion'
  | 'informativa';

export type EstadoRespuestaNota =
  | 'CONTESTADA'
  | 'PARCIALMENTE_CONTESTADA'
  | 'SIN_RESPUESTA'
  | 'CON_DISCREPANCIA'
  | 'INFORMATIVA';

export interface NotaLibro {
  id: string;
  codigo: string;
  tipoNota: TipoNotaLibro;
  titulo: string;
  fecha: string; // YYYY-MM-DD
  actorEmisor: ActorNotaLibro;
  emisorDetalle: string;
  actorReceptor: ActorNotaLibro;
  receptorDetalle: string;
  sentido: SentidoNotaLibro;
  frente: string;
  referenciasNotas: string[];
  respondeANotas: string[];
  respondidaPorNotas: string[];
  estadoRespuesta: EstadoRespuestaNota;
  preguntasOPuntos: string[];
  respuestasODescargos: string[];
  resumen: string;
  contenidoTexto: string;
  origen: 'drive' | 'archivo' | 'texto';
  nombreArchivo?: string;
  driveFileId?: string;
  driveUrl?: string;
  driveRuta?: string;
  driveModifiedTime?: string;
  fechaCarga: string;
  manualOverride?: boolean;
}

export type TabType = 
  | 'dashboard' 
  | 'planos' 
  | 'comparador'
  | 'hitos' 
  | 'minutas'
  | 'informes' 
  | 'interferencias' 
  | 'anotador' 
  | 'chat';

export interface DriveSubcarpetaInfo {
  id: string;
  name: string;
  webViewLink?: string;
}

export interface DriveConnectionState {
  connected: boolean;
  verificando: boolean;
  permisoLecturaDrive: boolean;
  accountEmail: string | null;
  accountName: string | null;
  remainingMinutes: number;
  rootFolderId: string;
  rootFolderName: string | null;
  rootFolderAccessible: boolean;
  subcarpetas: DriveSubcarpetaInfo[];
  elencosAccesible: boolean;
  sugerencia?: string;
  error?: string | null;
  ultimaVerificacion?: string | null;
}

