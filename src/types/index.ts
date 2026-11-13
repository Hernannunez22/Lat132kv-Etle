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
}

export interface MensajeChat {
  id: string;
  texto: string;
  esUsuario: boolean;
  fecha?: string;
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

export type TabType = 
  | 'dashboard' 
  | 'planos' 
  | 'comparador'
  | 'hitos' 
  | 'informes' 
  | 'interferencias' 
  | 'anotador' 
  | 'chat';
