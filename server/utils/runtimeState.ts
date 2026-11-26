import { GoogleGenAI } from '@google/genai';
import type { NotaLibro, PliegoReal } from '../../src/types';
import {
  PliegoIndexado,
  cargarPliegosDesdeDisco,
} from '../pliegoProcessor';
import {
  PlanoComparadorIndexado,
  cargarPlanosComparador,
} from '../planoComparator';
import { cargarStoreMinutas } from '../minutasManager';
import {
  ChatAdjuntoIndexado,
  cargarChatAdjuntos,
} from '../chatAdjuntos';
import { cargarStoreInterferencias } from '../driveInterferencias';
import {
  cargarStoreNotasLibro,
  recalcularHilosYRespuestas,
} from '../notasLibroManager';
import {
  DriveDocumentoIndexado,
  cargarDriveDocumentosStore,
} from '../driveDocumentos';
import {
  ElencosDriveState,
  cargarElencosDriveStore,
} from '../driveElencos';
import {
  PRIMARY_GEMINI_MODEL,
  AUDIO_TRANSCRIBE_MODEL,
  obtenerCandidatosApiKeys,
} from '../geminiClient';

export const GEMINI_MODEL = PRIMARY_GEMINI_MODEL;
export const GEMINI_TRANSCRIBE_MODEL = AUDIO_TRANSCRIBE_MODEL;

export function inicializarGemini(): { client: GoogleGenAI | null; keySource: string | null } {
  const candidatos = obtenerCandidatosApiKeys();
  if (candidatos.length > 0) {
    return {
      client: candidatos[0].client,
      keySource: candidatos[0].nombre,
    };
  }
  return { client: null, keySource: null };
}

const initGemini = inicializarGemini();

const pliegosIniciales = cargarPliegosDesdeDisco();
const notasLibroIniciales: NotaLibro[] = recalcularHilosYRespuestas(cargarStoreNotasLibro());
const driveDocsIniciales: DriveDocumentoIndexado[] = cargarDriveDocumentosStore();

if (pliegosIniciales.length > 0) {
  console.log(`[Pliegos] ${pliegosIniciales.length} pliego(s) restaurado(s) desde caché.`);
}
if (notasLibroIniciales.length > 0) {
  console.log(`[NotasLibro] ${notasLibroIniciales.length} nota(s) de libro restaurada(s) desde caché.`);
}
if (driveDocsIniciales.length > 0) {
  console.log(`[DriveDocs] ${driveDocsIniciales.length} documento(s) técnico(s) de Drive restaurado(s) desde caché.`);
}

export const obraState = {
  ai: initGemini.client as GoogleGenAI | null,
  geminiKeySource: initGemini.keySource as string | null,
  pliegosIndexados: pliegosIniciales as PliegoIndexado[],
  planosComparador: cargarPlanosComparador(),
  chatAdjuntos: cargarChatAdjuntos() as ChatAdjuntoIndexado[],
  storeMinutas: cargarStoreMinutas(),
  storeInterferencias: cargarStoreInterferencias(),
  storeNotasLibro: notasLibroIniciales,
  storeDriveDocumentos: driveDocsIniciales,
  storeElencos: cargarElencosDriveStore() as ElencosDriveState,
};

export function obtenerClienteGeminiActivo(): GoogleGenAI | null {
  const recarga = inicializarGemini();
  if (recarga.client) {
    obraState.ai = recarga.client;
    obraState.geminiKeySource = recarga.keySource;
  }
  return obraState.ai;
}

export function obtenerAvisoSinClienteGemini(): string {
  const rawApi = (process.env.API_KEY || '').trim();
  const rawGemini = (process.env.GEMINI_API_KEY || '').trim();
  if (/MY_GEMINI_API_KEY/i.test(rawApi) || /MY_GEMINI_API_KEY/i.test(rawGemini)) {
    return `> ⚠️ **El servidor aún está recibiendo el valor de plantilla (\`MY_GEMINI_API_KEY\`) en este contenedor.** Se ignoró ese valor y no hay otra clave válida en \`API_KEY\` ni en \`GEMINI_API_KEY\`. Guarda tu clave real en **Settings > Secrets** y recarga/republica el entorno.\n\n`;
  }
  return `> ⚠️ **No se detectó una clave válida en \`API_KEY\` ni en \`GEMINI_API_KEY\` en el proceso del servidor.** Configúrala en **Settings > Secrets** y recarga el entorno para habilitar el análisis profundo con **Gemini**.\n\n`;
}

export function toPliegoResumenCliente(p: PliegoIndexado): PliegoReal {
  return {
    id: p.id,
    nombre: p.nombre,
    tipoMime: p.tipoMime,
    tamanioBytes: p.tamanioBytes,
    tamanioTexto: p.tamanioTexto,
    fechaSubida: p.fechaSubida,
    paginas: p.paginas,
    caracteresTexto: p.caracteresTexto,
    esEscaneado: p.esEscaneado,
    tiempoProcesoMs: p.tiempoProcesoMs,
    contenidoTexto: p.contenidoTexto ? p.contenidoTexto.slice(0, 60000) : '',
  };
}

export function toPlanoComparadorCliente(p: PlanoComparadorIndexado | null) {
  if (!p) return null;
  return {
    id: p.id,
    rol: p.rol,
    nombre: p.nombre,
    tipoMime: p.tipoMime,
    tamanioBytes: p.tamanioBytes,
    tamanioTexto: p.tamanioTexto,
    fechaSubida: p.fechaSubida,
    paginas: p.paginas,
    caracteresTexto: p.caracteresTexto,
    esEscaneado: p.esEscaneado,
    tiempoProcesoMs: p.tiempoProcesoMs,
    metricasDetectadas: p.metricasDetectadas,
    contenidoTexto: p.contenidoTexto ? p.contenidoTexto.slice(0, 40000) : '',
  };
}

export function toChatAdjuntoCliente(p: ChatAdjuntoIndexado) {
  return {
    id: p.id,
    nombre: p.nombre,
    tipoMime: p.tipoMime,
    tamanioBytes: p.tamanioBytes,
    tamanioTexto: p.tamanioTexto,
    fechaSubida: p.fechaSubida,
    paginas: p.paginas,
    caracteresTexto: p.caracteresTexto,
    esEscaneado: p.esEscaneado,
    tiempoProcesoMs: p.tiempoProcesoMs,
    metricasDetectadas: p.metricasDetectadas,
    contenidoTexto: p.contenidoTexto ? p.contenidoTexto.slice(0, 40000) : '',
  };
}
