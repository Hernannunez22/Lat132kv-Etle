import fs from 'fs';
import path from 'path';
import {
  CACHE_DIR,
  PliegoIndexado,
  asegurarDirectorioCache,
  extraerMetricasTecnicas,
  procesarArchivoDesdeDisco,
  procesarArchivoPliego,
  recuperarFragmentosRelevantes,
} from './pliegoProcessor';

export interface ChatAdjuntoIndexado {
  id: string;
  nombre: string;
  tipoMime: string;
  tamanioBytes: number;
  tamanioTexto: string;
  fechaSubida: string;
  contenidoTexto: string;
  paginas: number;
  caracteresTexto: number;
  esEscaneado: boolean;
  tiempoProcesoMs: number;
  metricasDetectadas: string[];
  rutaBinario?: string;
  geminiFileUri?: string;
  geminiFileMime?: string;
}

const ADJUNTOS_DIR = path.join(CACHE_DIR, 'chat_adjuntos');

function asegurarDirAdjuntos() {
  asegurarDirectorioCache();
  if (!fs.existsSync(ADJUNTOS_DIR)) {
    fs.mkdirSync(ADJUNTOS_DIR, { recursive: true });
  }
}

export function guardarChatAdjunto(adj: ChatAdjuntoIndexado) {
  asegurarDirAdjuntos();
  const metaPath = path.join(ADJUNTOS_DIR, `${adj.id}.json`);
  fs.writeFileSync(metaPath, JSON.stringify(adj), 'utf-8');
}

export function cargarChatAdjuntos(): ChatAdjuntoIndexado[] {
  asegurarDirAdjuntos();
  const lista: ChatAdjuntoIndexado[] = [];
  try {
    for (const f of fs.readdirSync(ADJUNTOS_DIR)) {
      if (!f.endsWith('.json')) continue;
      try {
        const raw = fs.readFileSync(path.join(ADJUNTOS_DIR, f), 'utf-8');
        const parsed = JSON.parse(raw) as ChatAdjuntoIndexado;
        if (parsed && parsed.id && parsed.nombre) {
          lista.push(parsed);
        }
      } catch {
        // Ignorar JSON corrupto
      }
    }
  } catch {}
  return lista;
}

export function eliminarChatAdjuntoDisco(id: string) {
  asegurarDirAdjuntos();
  for (const name of [`${id}.json`, `${id}.pdf`]) {
    const p = path.join(ADJUNTOS_DIR, name);
    if (fs.existsSync(p)) {
      try {
        fs.unlinkSync(p);
      } catch {}
    }
  }
}

export function limpiarChatAdjuntosDisco() {
  asegurarDirAdjuntos();
  try {
    for (const name of fs.readdirSync(ADJUNTOS_DIR)) {
      fs.unlinkSync(path.join(ADJUNTOS_DIR, name));
    }
  } catch {}
}

export async function indexarChatAdjuntoDesdeArchivo(params: {
  id: string;
  nombre: string;
  tipoMime: string;
  rutaArchivo: string;
  tamanioBytes: number;
  fechaSubida: string;
  onProgress?: (paginasProcesadas: number, totalPaginas: number) => void;
}): Promise<ChatAdjuntoIndexado> {
  asegurarDirAdjuntos();
  const binDestino = path.join(ADJUNTOS_DIR, `${params.id}.pdf`);

  let tieneBinario = false;
  if (params.tamanioBytes <= 45 * 1024 * 1024 && fs.existsSync(params.rutaArchivo)) {
    try {
      fs.copyFileSync(params.rutaArchivo, binDestino);
      tieneBinario = true;
    } catch {}
  }

  const base = await procesarArchivoDesdeDisco({
    id: `chatpdf_${params.id}`,
    nombre: params.nombre,
    tipoMime: params.tipoMime,
    rutaArchivo: params.rutaArchivo,
    tamanioBytes: params.tamanioBytes,
    fechaSubida: params.fechaSubida,
    onProgress: params.onProgress,
  });

  // Limpiar artefacto temporal de CACHE_DIR raíz para no mezclarlo con pliegos
  const jsonEnPliegos = path.join(CACHE_DIR, `chatpdf_${params.id}.json`);
  if (fs.existsSync(jsonEnPliegos)) {
    try {
      fs.unlinkSync(jsonEnPliegos);
    } catch {}
  }
  const pdfEscaneadoEnPliegos = path.join(CACHE_DIR, `chatpdf_${params.id}.pdf`);
  if (fs.existsSync(pdfEscaneadoEnPliegos)) {
    try {
      fs.renameSync(pdfEscaneadoEnPliegos, binDestino);
      tieneBinario = true;
    } catch {}
  }

  const resultado: ChatAdjuntoIndexado = {
    id: params.id,
    nombre: base.nombre,
    tipoMime: base.tipoMime,
    tamanioBytes: base.tamanioBytes,
    tamanioTexto: base.tamanioTexto,
    fechaSubida: base.fechaSubida,
    contenidoTexto: base.contenidoTexto,
    paginas: base.paginas,
    caracteresTexto: base.caracteresTexto,
    esEscaneado: base.esEscaneado,
    tiempoProcesoMs: base.tiempoProcesoMs,
    metricasDetectadas: extraerMetricasTecnicas(base.contenidoTexto),
    rutaBinario: tieneBinario ? binDestino : undefined,
  };

  guardarChatAdjunto(resultado);
  return resultado;
}

export async function indexarChatAdjuntoBuffer(params: {
  id: string;
  nombre: string;
  tipoMime: string;
  buffer: Buffer;
  fechaSubida: string;
}): Promise<ChatAdjuntoIndexado> {
  asegurarDirAdjuntos();
  const binDestino = path.join(ADJUNTOS_DIR, `${params.id}.pdf`);
  if (params.tipoMime === 'application/pdf' || params.nombre.toLowerCase().endsWith('.pdf')) {
    fs.writeFileSync(binDestino, params.buffer);
  }

  const base = await procesarArchivoPliego({
    id: `chatpdf_${params.id}`,
    nombre: params.nombre,
    tipoMime: params.tipoMime,
    buffer: params.buffer,
    fechaSubida: params.fechaSubida,
  });

  const jsonEnPliegos = path.join(CACHE_DIR, `chatpdf_${params.id}.json`);
  if (fs.existsSync(jsonEnPliegos)) {
    try {
      fs.unlinkSync(jsonEnPliegos);
    } catch {}
  }
  const pdfEscaneadoEnPliegos = path.join(CACHE_DIR, `chatpdf_${params.id}.pdf`);
  if (fs.existsSync(pdfEscaneadoEnPliegos)) {
    try {
      fs.unlinkSync(pdfEscaneadoEnPliegos);
    } catch {}
  }

  const resultado: ChatAdjuntoIndexado = {
    id: params.id,
    nombre: base.nombre,
    tipoMime: base.tipoMime,
    tamanioBytes: base.tamanioBytes,
    tamanioTexto: base.tamanioTexto,
    fechaSubida: base.fechaSubida,
    contenidoTexto: base.contenidoTexto,
    paginas: base.paginas,
    caracteresTexto: base.caracteresTexto,
    esEscaneado: base.esEscaneado,
    tiempoProcesoMs: base.tiempoProcesoMs,
    metricasDetectadas: extraerMetricasTecnicas(base.contenidoTexto),
    rutaBinario: fs.existsSync(binDestino) ? binDestino : undefined,
  };

  guardarChatAdjunto(resultado);
  return resultado;
}

export function auditarAdjuntoVsPliegoLocal(
  adjuntos: ChatAdjuntoIndexado[],
  pliegos: PliegoIndexado[],
  consulta: string
): string {
  const codigosRx = /(?:ET|L)-[A-Z0-9-]+|(?:OS|NP|NI|NE|COMCT2)[-\s]?\d+/gi;
  const filas: string[] = [];

  for (const adj of adjuntos) {
    const codigos = Array.from(new Set(adj.contenidoTexto.match(codigosRx) || [])).slice(0, 6);
    const metricas = adj.metricasDetectadas.slice(0, 6).join(', ') || 'Sin métricas aisladas';
    const consultaLocal = `${consulta} ${codigos.join(' ')} ${adj.metricasDetectadas.slice(0, 4).join(' ')}`;
    const rec = recuperarFragmentosRelevantes(consultaLocal, pliegos, 12000);
    const refPliego = rec.fragmentosSeleccionados[0]
      ? `${rec.fragmentosSeleccionados[0].pliegoNombre} (Pág. ${rec.fragmentosSeleccionados[0].pagina}): "${rec.fragmentosSeleccionados[0].texto.replace(/\s+/g, ' ').slice(0, 140).replace(/\|/g, '/')}..."`
      : pliegos.length > 0
        ? 'Sin coincidencia textual directa en los fragmentos recuperados'
        : 'Sin pliegos reales cargados para contrastar';

    filas.push(
      `| **${adj.nombre}** (${adj.paginas} pág.) | ${codigos.join(', ') || '-'} | ${metricas} | ${refPliego} |`
    );
  }

  return (
    `### Auditoría Preliminar de PDF Adjuntos vs. Pliego (Modo Local)\n\n` +
    `| Documento Adjunto en Chat | Códigos / Planos Mencionados | Parámetros Detectados | Referencia Encontrada en Pliego |\n` +
    `|---|---|---|---|\n` +
    `${filas.join('\n')}\n`
  );
}
