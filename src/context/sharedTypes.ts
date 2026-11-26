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

export interface DriveSyncSnapshot {
  fechaIso: string;
  tipo: string;
  resumen: string;
}

export type CloudSyncStatus =
  | 'sin-sesion'
  | 'conectando'
  | 'verificacion-pendiente'
  | 'acceso-pendiente'
  | 'sincronizado'
  | 'error';
