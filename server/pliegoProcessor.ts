import fs from 'fs';
import path from 'path';
import os from 'os';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import mammoth from 'mammoth';
import { GoogleGenAI } from '@google/genai';

export interface PliegoChunk {
  id: string;
  pliegoId: string;
  pliegoNombre: string;
  pagina: number;
  texto: string;
  textoNormalizado: string;
}

export interface PliegoIndexado {
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
  chunks: PliegoChunk[];
  introTexto: string;
  rutaBinario?: string;
  geminiFileUri?: string;
  geminiFileMime?: string;
}

export const CACHE_DIR = path.join(os.tmpdir(), 'obras132kv_pliegos_cache');

export function asegurarDirectorioCache() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

export function getRutaStaging(id: string): string {
  asegurarDirectorioCache();
  return path.join(CACHE_DIR, `${id}.part`);
}

export function getRutaUploadTemp(id: string): string {
  asegurarDirectorioCache();
  return path.join(CACHE_DIR, `${id}.upload`);
}

export function normalizarTextoBusqueda(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s./-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function extraerPaginasPdfDoc(
  pdfDoc: {
    numPages: number;
    getPage(n: number): Promise<{
      getTextContent(): Promise<{ items: Array<{ str?: string; hasEOL?: boolean }> }>;
      cleanup?(): boolean;
    }>;
  },
  onProgress?: (paginasProcesadas: number, totalPaginas: number) => void
): Promise<{ paginasTexto: { pagina: number; texto: string }[]; totalPaginas: number }> {
  const totalPaginas = pdfDoc.numPages;
  const paginasTexto: { pagina: number; texto: string }[] = new Array(totalPaginas);
  let procesadas = 0;

  // Lotes de 8 páginas mantienen bajo el consumo de memoria incluso en PDFs de cientos de MB
  const BATCH_SIZE = 8;
  for (let start = 1; start <= totalPaginas; start += BATCH_SIZE) {
    const end = Math.min(totalPaginas, start + BATCH_SIZE - 1);
    const promises: Promise<void>[] = [];

    for (let pageNum = start; pageNum <= end; pageNum++) {
      promises.push(
        (async () => {
          try {
            const page = await pdfDoc.getPage(pageNum);
            const content = await page.getTextContent();
            let pageStr = '';
            let lastWasEol = false;

            for (const item of content.items) {
              const s = item.str || '';
              if (s) {
                pageStr += (lastWasEol || !pageStr ? '' : ' ') + s;
              }
              if (item.hasEOL) {
                pageStr += '\n';
                lastWasEol = true;
              } else {
                lastWasEol = false;
              }
            }

            paginasTexto[pageNum - 1] = {
              pagina: pageNum,
              texto: pageStr.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim(),
            };
            page.cleanup?.();
          } catch {
            paginasTexto[pageNum - 1] = { pagina: pageNum, texto: '' };
          } finally {
            procesadas++;
          }
        })()
      );
    }

    await Promise.all(promises);
    onProgress?.(procesadas, totalPaginas);
  }

  return { paginasTexto, totalPaginas };
}

/**
 * Extrae texto página por página de un PDF en disco usando PDFDataRangeTransport (sin cargar 250MB en RAM).
 */
async function extraerTextoDePdfArchivo(
  filePath: string,
  onProgress?: (paginasProcesadas: number, totalPaginas: number) => void
): Promise<{
  paginasTexto: { pagina: number; texto: string }[];
  totalPaginas: number;
}> {
  const size = fs.statSync(filePath).size;
  const fd = fs.openSync(filePath, 'r');

  class FileRangeTransport extends pdfjsLib.PDFDataRangeTransport {
    constructor(length: number, initialData: Uint8Array) {
      super(length, initialData);
    }
    requestDataRange(begin: number, end: number) {
      const safeBegin = Math.max(0, begin);
      const len = Math.max(0, Math.min(size, end) - safeBegin);
      if (len <= 0) {
        this.onDataRange(safeBegin, new Uint8Array(0));
        return;
      }
      const buf = Buffer.allocUnsafe(len);
      const bytesRead = fs.readSync(fd, buf, 0, len, safeBegin);
      this.onDataRange(safeBegin, new Uint8Array(buf.buffer, buf.byteOffset, bytesRead));
    }
    abort() {}
  }

  const initLen = Math.min(size, 65536);
  const initBuf = Buffer.allocUnsafe(initLen);
  const initRead = fs.readSync(fd, initBuf, 0, initLen, 0);
  const transport = new FileRangeTransport(size, new Uint8Array(initBuf.buffer, initBuf.byteOffset, initRead));

  const loadingTask = pdfjsLib.getDocument({
    range: transport,
    length: size,
    verbosity: 0,
    useSystemFonts: true,
    disableFontFace: true,
  });

  try {
    const pdfDoc = await loadingTask.promise;
    const res = await extraerPaginasPdfDoc(pdfDoc, onProgress);
    await pdfDoc.cleanup?.().catch(() => {});
    return res;
  } finally {
    await loadingTask.destroy?.().catch(() => {});
    try {
      fs.closeSync(fd);
    } catch {}
  }
}

/**
 * Extrae texto de un Buffer en memoria (archivos chicos < 4 MB).
 */
async function extraerTextoDePdfBuffer(buffer: Buffer): Promise<{
  paginasTexto: { pagina: number; texto: string }[];
  totalPaginas: number;
}> {
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    verbosity: 0,
    useSystemFonts: true,
    disableFontFace: true,
  });

  try {
    const pdfDoc = await loadingTask.promise;
    const res = await extraerPaginasPdfDoc(pdfDoc);
    await pdfDoc.cleanup?.().catch(() => {});
    return res;
  } finally {
    await loadingTask.destroy?.().catch(() => {});
  }
}

/**
 * Divide páginas o texto plano en fragmentos indexados (~1,600 caracteres con solapamiento).
 */
function construirChunks(
  pliegoId: string,
  pliegoNombre: string,
  paginasTexto: { pagina: number; texto: string }[]
): PliegoChunk[] {
  const chunks: PliegoChunk[] = [];
  const MAX_CHUNK_CHARS = 1600;
  const OVERLAP_CHARS = 220;

  for (const pag of paginasTexto) {
    const txt = pag.texto.trim();
    if (!txt) continue;

    if (txt.length <= MAX_CHUNK_CHARS) {
      chunks.push({
        id: `${pliegoId}_p${pag.pagina}_0`,
        pliegoId,
        pliegoNombre,
        pagina: pag.pagina,
        texto: txt,
        textoNormalizado: normalizarTextoBusqueda(txt),
      });
    } else {
      let offset = 0;
      let idx = 0;
      while (offset < txt.length) {
        const sliceEnd = Math.min(txt.length, offset + MAX_CHUNK_CHARS);
        let cutEnd = sliceEnd;
        if (sliceEnd < txt.length) {
          const lastNewline = txt.lastIndexOf('\n', sliceEnd);
          const lastSpace = txt.lastIndexOf(' ', sliceEnd);
          if (lastNewline > offset + MAX_CHUNK_CHARS * 0.6) {
            cutEnd = lastNewline;
          } else if (lastSpace > offset + MAX_CHUNK_CHARS * 0.6) {
            cutEnd = lastSpace;
          }
        }
        const part = txt.slice(offset, cutEnd).trim();
        if (part) {
          chunks.push({
            id: `${pliegoId}_p${pag.pagina}_${idx++}`,
            pliegoId,
            pliegoNombre,
            pagina: pag.pagina,
            texto: part,
            textoNormalizado: normalizarTextoBusqueda(part),
          });
        }
        if (cutEnd >= txt.length) break;
        offset = Math.max(offset + 1, cutEnd - OVERLAP_CHARS);
      }
    }
  }

  return chunks;
}

function dividirTextoEnPaginasSimuladas(rawText: string): { pagina: number; texto: string }[] {
  const paginasTexto: { pagina: number; texto: string }[] = [];
  const lines = rawText.split(/\n+/);
  let currentBlock = '';
  let pageCounter = 1;
  for (const line of lines) {
    if ((currentBlock + '\n' + line).length > 2800 && currentBlock.length > 0) {
      paginasTexto.push({ pagina: pageCounter++, texto: currentBlock.trim() });
      currentBlock = line;
    } else {
      currentBlock += (currentBlock ? '\n' : '') + line;
    }
  }
  if (currentBlock.trim()) {
    paginasTexto.push({ pagina: pageCounter, texto: currentBlock.trim() });
  }
  return paginasTexto;
}

/**
 * Procesa un archivo pesado ya guardado en disco (por chunks) sin cargarlo completo en RAM.
 */
export async function procesarArchivoDesdeDisco(params: {
  id: string;
  nombre: string;
  tipoMime: string;
  rutaArchivo: string;
  tamanioBytes: number;
  fechaSubida: string;
  onProgress?: (paginasProcesadas: number, totalPaginas: number) => void;
}): Promise<PliegoIndexado> {
  const t0 = Date.now();
  asegurarDirectorioCache();

  const { id, nombre, tipoMime, rutaArchivo, tamanioBytes, fechaSubida, onProgress } = params;
  const nombreLower = nombre.toLowerCase();
  const esPdf = tipoMime === 'application/pdf' || nombreLower.endsWith('.pdf');
  const esDocx =
    nombreLower.endsWith('.docx') ||
    tipoMime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

  let paginasTexto: { pagina: number; texto: string }[] = [];
  let totalPaginas = 1;
  let esEscaneado = false;
  let rutaBinario: string | undefined;

  if (esPdf) {
    try {
      const resPdf = await extraerTextoDePdfArchivo(rutaArchivo, onProgress);
      paginasTexto = resPdf.paginasTexto;
      totalPaginas = resPdf.totalPaginas;

      const totalChars = paginasTexto.reduce((acc, p) => acc + p.texto.length, 0);
      const promedioCharsPorPagina = totalPaginas > 0 ? totalChars / totalPaginas : 0;

      if (promedioCharsPorPagina < 45) {
        esEscaneado = true;
        rutaBinario = path.join(CACHE_DIR, `${id}.pdf`);
        fs.renameSync(rutaArchivo, rutaBinario);
      } else {
        // Texto extraído con éxito: borrar el PDF temporal de cientos de MB para liberar memoria/tmpfs
        try {
          if (fs.existsSync(rutaArchivo)) fs.unlinkSync(rutaArchivo);
        } catch {}
      }
    } catch (err) {
      console.warn(`[PliegoProcessor] Falló extracción pdfjs streaming para "${nombre}":`, err);
      esEscaneado = true;
      rutaBinario = path.join(CACHE_DIR, `${id}.pdf`);
      try {
        fs.renameSync(rutaArchivo, rutaBinario);
      } catch {}
    }
  } else if (esDocx) {
    try {
      const resDocx = await mammoth.extractRawText({ path: rutaArchivo });
      paginasTexto = dividirTextoEnPaginasSimuladas((resDocx.value || '').trim());
      totalPaginas = Math.max(1, paginasTexto.length);
    } catch (err) {
      console.warn(`[PliegoProcessor] Error leyendo DOCX "${nombre}":`, err);
      paginasTexto = [{ pagina: 1, texto: '' }];
    } finally {
      try {
        if (fs.existsSync(rutaArchivo)) fs.unlinkSync(rutaArchivo);
      } catch {}
    }
  } else {
    try {
      const text = fs.readFileSync(rutaArchivo, 'utf-8').trim();
      paginasTexto = dividirTextoEnPaginasSimuladas(text);
      totalPaginas = Math.max(1, paginasTexto.length);
    } finally {
      try {
        if (fs.existsSync(rutaArchivo)) fs.unlinkSync(rutaArchivo);
      } catch {}
    }
  }

  const contenidoTexto = paginasTexto
    .filter(p => p.texto.length > 0)
    .map(p => `[Página ${p.pagina}]\n${p.texto}`)
    .join('\n\n');

  const chunks = construirChunks(id, nombre, paginasTexto);
  const introTexto = contenidoTexto.slice(0, 3500);
  const tiempoProcesoMs = Date.now() - t0;

  const indexado: PliegoIndexado = {
    id,
    nombre,
    tipoMime: tipoMime || (esPdf ? 'application/pdf' : 'text/plain'),
    tamanioBytes,
    tamanioTexto: formatFileSize(tamanioBytes),
    fechaSubida,
    contenidoTexto,
    paginas: totalPaginas,
    caracteresTexto: contenidoTexto.length,
    esEscaneado,
    tiempoProcesoMs,
    chunks,
    introTexto,
    rutaBinario,
  };

  guardarPliegoEnDisco(indexado);
  return indexado;
}

/**
 * Procesa e indexa un archivo binario chico (< 4 MB) recibido en memoria.
 */
export async function procesarArchivoPliego(params: {
  id: string;
  nombre: string;
  tipoMime: string;
  buffer: Buffer;
  fechaSubida: string;
}): Promise<PliegoIndexado> {
  const t0 = Date.now();
  asegurarDirectorioCache();

  const { id, nombre, tipoMime, buffer, fechaSubida } = params;
  const nombreLower = nombre.toLowerCase();
  const esPdf = tipoMime === 'application/pdf' || nombreLower.endsWith('.pdf');
  const esDocx =
    nombreLower.endsWith('.docx') ||
    tipoMime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

  let paginasTexto: { pagina: number; texto: string }[] = [];
  let totalPaginas = 1;
  let esEscaneado = false;
  let rutaBinario: string | undefined;

  if (esPdf) {
    try {
      const resPdf = await extraerTextoDePdfBuffer(buffer);
      paginasTexto = resPdf.paginasTexto;
      totalPaginas = resPdf.totalPaginas;

      const totalChars = paginasTexto.reduce((acc, p) => acc + p.texto.length, 0);
      const promedioCharsPorPagina = totalPaginas > 0 ? totalChars / totalPaginas : 0;

      if (promedioCharsPorPagina < 45) {
        esEscaneado = true;
        rutaBinario = path.join(CACHE_DIR, `${id}.pdf`);
        fs.writeFileSync(rutaBinario, buffer);
      }
    } catch (err) {
      console.warn(`[PliegoProcessor] Falló extracción pdfjs para "${nombre}", guardando binario:`, err);
      esEscaneado = true;
      rutaBinario = path.join(CACHE_DIR, `${id}.pdf`);
      fs.writeFileSync(rutaBinario, buffer);
    }
  } else if (esDocx) {
    try {
      const resDocx = await mammoth.extractRawText({ buffer });
      paginasTexto = dividirTextoEnPaginasSimuladas((resDocx.value || '').trim());
      totalPaginas = Math.max(1, paginasTexto.length);
    } catch (err) {
      console.warn(`[PliegoProcessor] Error leyendo DOCX "${nombre}":`, err);
      const fallbackText = buffer.toString('utf-8');
      paginasTexto = [{ pagina: 1, texto: fallbackText }];
    }
  } else {
    const text = buffer.toString('utf-8').trim();
    paginasTexto = dividirTextoEnPaginasSimuladas(text);
    totalPaginas = Math.max(1, paginasTexto.length);
  }

  const contenidoTexto = paginasTexto
    .filter(p => p.texto.length > 0)
    .map(p => `[Página ${p.pagina}]\n${p.texto}`)
    .join('\n\n');

  const chunks = construirChunks(id, nombre, paginasTexto);
  const introTexto = contenidoTexto.slice(0, 3500);
  const tiempoProcesoMs = Date.now() - t0;

  const indexado: PliegoIndexado = {
    id,
    nombre,
    tipoMime: tipoMime || (esPdf ? 'application/pdf' : 'text/plain'),
    tamanioBytes: buffer.length,
    tamanioTexto: formatFileSize(buffer.length),
    fechaSubida,
    contenidoTexto,
    paginas: totalPaginas,
    caracteresTexto: contenidoTexto.length,
    esEscaneado,
    tiempoProcesoMs,
    chunks,
    introTexto,
    rutaBinario,
  };

  guardarPliegoEnDisco(indexado);
  return indexado;
}

/**
 * Procesa texto pegado manualmente.
 */
export function procesarTextoPliego(params: {
  id: string;
  nombre: string;
  contenidoTexto: string;
  fechaSubida: string;
}): PliegoIndexado {
  const t0 = Date.now();
  asegurarDirectorioCache();

  const { id, nombre, contenidoTexto, fechaSubida } = params;
  const cleanText = contenidoTexto.trim();
  const bytes = Buffer.byteLength(cleanText, 'utf-8');

  const paginasTexto = dividirTextoEnPaginasSimuladas(cleanText);
  const chunks = construirChunks(id, nombre, paginasTexto);
  const indexado: PliegoIndexado = {
    id,
    nombre,
    tipoMime: 'text/plain',
    tamanioBytes: bytes,
    tamanioTexto: formatFileSize(bytes),
    fechaSubida,
    contenidoTexto: cleanText,
    paginas: Math.max(1, paginasTexto.length),
    caracteresTexto: cleanText.length,
    esEscaneado: false,
    tiempoProcesoMs: Date.now() - t0,
    chunks,
    introTexto: cleanText.slice(0, 3500),
  };

  guardarPliegoEnDisco(indexado);
  return indexado;
}

function guardarPliegoEnDisco(pliego: PliegoIndexado) {
  try {
    asegurarDirectorioCache();
    const jsonPath = path.join(CACHE_DIR, `${pliego.id}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(pliego), 'utf-8');
  } catch (err) {
    console.warn('[PliegoProcessor] No se pudo escribir caché en disco:', err);
  }
}

export function cargarPliegosDesdeDisco(): PliegoIndexado[] {
  try {
    asegurarDirectorioCache();
    const files = fs.readdirSync(CACHE_DIR).filter(f => f.endsWith('.json'));
    const lista: PliegoIndexado[] = [];
    for (const f of files) {
      try {
        const raw = fs.readFileSync(path.join(CACHE_DIR, f), 'utf-8');
        const parsed = JSON.parse(raw) as PliegoIndexado;
        if (parsed && parsed.id && parsed.nombre) {
          lista.push(parsed);
        }
      } catch {
        // Ignorar JSON corrupto
      }
    }
    return lista;
  } catch {
    return [];
  }
}

export function eliminarPliegoDeDisco(id: string) {
  try {
    for (const ext of ['.json', '.pdf', '.part', '.upload']) {
      const p = path.join(CACHE_DIR, `${id}${ext}`);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
  } catch (err) {
    console.warn('[PliegoProcessor] Error eliminando de disco:', err);
  }
}

export function limpiarPliegosDeDisco() {
  try {
    if (!fs.existsSync(CACHE_DIR)) return;
    for (const f of fs.readdirSync(CACHE_DIR)) {
      fs.unlinkSync(path.join(CACHE_DIR, f));
    }
  } catch (err) {
    console.warn('[PliegoProcessor] Error limpiando caché:', err);
  }
}

/**
 * Sube un PDF escaneado UNA SOLA VEZ a Gemini Files API para evitar enviar MB de base64 por mensaje.
 * Si supera 40MB y ya quedó en Gemini, libera el archivo temporal del disco.
 */
export async function asegurarGeminiFileUri(
  pliego: PliegoIndexado,
  ai: GoogleGenAI
): Promise<string | null> {
  if (pliego.geminiFileUri) return pliego.geminiFileUri;
  if (!pliego.rutaBinario || !fs.existsSync(pliego.rutaBinario)) return null;

  try {
    const uploaded = await ai.files.upload({
      file: pliego.rutaBinario,
      config: {
        mimeType: 'application/pdf',
        displayName: pliego.nombre,
      },
    });
    if (uploaded?.uri) {
      pliego.geminiFileUri = uploaded.uri;
      pliego.geminiFileMime = uploaded.mimeType || 'application/pdf';
      if (pliego.tamanioBytes > 40 * 1024 * 1024) {
        try {
          fs.unlinkSync(pliego.rutaBinario);
          pliego.rutaBinario = undefined;
        } catch {}
      }
      guardarPliegoEnDisco(pliego);
      return uploaded.uri;
    }
  } catch (err) {
    console.warn(`[Gemini Files API] Error subiendo PDF escaneado "${pliego.nombre}":`, err);
  }
  return null;
}

const STOPWORDS_ES = new Set([
  'a', 'al', 'de', 'del', 'el', 'la', 'los', 'las', 'lo', 'le', 'les', 'un', 'una', 'uno', 'unos', 'unas',
  'y', 'o', 'u', 'e', 'ni', 'si', 'no', 'en', 'con', 'por', 'para', 'sin', 'sobre', 'entre', 'desde',
  'hasta', 'hacia', 'segun', 'contra', 'tras', 'ante', 'bajo', 'cabe', 'es', 'son', 'fue', 'ser', 'hay',
  'su', 'sus', 'se', 'me', 'te', 'nos', 'mi', 'tu', 'ya', 'muy', 'mas', 'pero', 'sino', 'aunque',
  'todos', 'todas', 'todo', 'toda', 'cada', 'cual', 'cuales', 'donde', 'cuando', 'quien', 'quienes',
  'este', 'esta', 'estos', 'estas', 'esto', 'ese', 'esa', 'esos', 'esas', 'eso', 'aquel', 'aquella',
  'que', 'como', 'respecto', 'acerca', 'extrae', 'extraer', 'dime', 'decime', 'dame', 'busca', 'buscar',
  'indica', 'indicar', 'pliego', 'pliegos', 'reales', 'real', 'documento', 'documentos', 'archivo',
  'archivos', 'cuadro', 'comparativo', 'compara', 'comparar', 'tabla', 'diferencia', 'diferencias',
  'discrepancia', 'discrepancias', 'matriz', 'haz', 'arma', 'genera', 'generar', 'necesito', 'quiero',
  'puedes', 'podes', 'cuales', 'tiene', 'tienen', 'estan', 'esta',
]);

/**
 * Extrae métricas técnicas clave (hormigón, acero, puesta a tierra, tensiones, normas, cotas, secciones)
 */
export function extraerMetricasTecnicas(texto: string): string[] {
  if (!texto) return [];
  const patrones = [
    /\bH-\d{2}\b/gi,
    /\bADN[\s-]?\d{3}\b/gi,
    /\b132\s*kV\b|\b\d+(?:[.,]\d+)?\s*kV\b/gi,
    /\b\d+(?:[.,]\d+)?\s*(?:ohm|ohms|Ω)\b/gi,
    /\b\d+(?:[.,]\d+)?\s*(?:mm2|mm²|mm|cm|m)\b/gi,
    /\b(?:ACSR|AAAC|OPGW|XLPE|PRFV|SF6)\b/gi,
    /\b(?:CIRSOC|IRAM|IEC|IEEE|AEA|ANSI|ASTM)\s*[\d.-]+\b/gi,
    /\b(?:Rev\.?|Revisión)\s*[A-Z0-9]+\b/gi,
  ];
  const encontrados = new Set<string>();
  for (const rx of patrones) {
    const matches = texto.match(rx) || [];
    for (const m of matches) {
      const clean = m.replace(/\s+/g, ' ').trim();
      if (clean.length >= 2 && clean.length <= 32) {
        encontrados.add(clean);
      }
      if (encontrados.size >= 40) break;
    }
    if (encontrados.size >= 40) break;
  }
  return Array.from(encontrados);
}

/**
 * Recuperación balanceada por documento (<15ms) de los fragmentos más relevantes de TODOS los pliegos indexados.
 */
export function recuperarFragmentosRelevantes(
  consulta: string,
  pliegos: PliegoIndexado[],
  maxCharsTotales = 110000
): {
  contextoTexto: string;
  fragmentosSeleccionados: { pliegoNombre: string; pagina: number; texto: string; score: number }[];
  modoCompleto: boolean;
} {
  const pliegosConTexto = pliegos.filter(p => p.caracteresTexto > 0 && !p.esEscaneado);
  const totalChars = pliegosConTexto.reduce((acc, p) => acc + p.caracteresTexto, 0);

  if (totalChars > 0 && totalChars <= maxCharsTotales) {
    const contextoCompleto = pliegosConTexto
      .map(p => `=== DOCUMENTO REAL: ${p.nombre} (${p.paginas} págs) ===\n${p.contenidoTexto}`)
      .join('\n\n====================================\n\n');

    return {
      contextoTexto: contextoCompleto,
      fragmentosSeleccionados: pliegosConTexto.flatMap(p =>
        p.chunks.slice(0, 8).map(c => ({
          pliegoNombre: c.pliegoNombre,
          pagina: c.pagina,
          texto: c.texto,
          score: 100,
        }))
      ),
      modoCompleto: true,
    };
  }

  const consultaNorm = normalizarTextoBusqueda(consulta);
  const tokens = Array.from(
    new Set(
      consultaNorm
        .split(/\s+/)
        .filter(t => t.length >= 2 && !STOPWORDS_ES.has(t))
    )
  );

  // Compilar regex de palabra completa para precisión (evita falsos positivos por subcadena)
  const tokenMatchers = tokens.map(tok => {
    const esc = tok.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return {
      tok,
      wordRx: new RegExp(`\\b${esc}\\b`, 'g'),
      isShort: tok.length <= 3,
      weight: tok.length >= 6 ? 14 : tok.length >= 4 ? 10 : 12,
    };
  });

  const regexNumArt = consultaNorm.match(/\b(?:art(?:iculo)?\.?\s*\d+|\d+(?:[.,]\d+)?)\b/g) || [];
  const porDocumento: Array<Array<PliegoChunk & { score: number }>> = [];

  for (const p of pliegosConTexto) {
    const scoredDoc: Array<PliegoChunk & { score: number }> = [];
    for (const chunk of p.chunks) {
      let score = 0;
      const tNorm = chunk.textoNormalizado;

      if (tokenMatchers.length === 0) {
        score = chunk.pagina <= 8 ? 25 - chunk.pagina : 1;
      } else {
        if (consultaNorm.length > 8 && tNorm.includes(consultaNorm)) {
          score += 65;
        }
        let distintos = 0;
        for (const tm of tokenMatchers) {
          const exactMatches = tNorm.match(tm.wordRx);
          if (exactMatches && exactMatches.length > 0) {
            distintos++;
            score += tm.weight * Math.min(4, exactMatches.length);
          } else if (!tm.isShort && tNorm.includes(tm.tok)) {
            distintos++;
            const occurrences = Math.min(3, tNorm.split(tm.tok).length - 1);
            score += 4 * occurrences;
          }
        }
        if (distintos > 1) {
          score += distintos * 16;
        }
        for (const ref of regexNumArt) {
          if (tNorm.includes(ref)) score += 15;
        }
      }

      if (score > 0) {
        scoredDoc.push({ ...chunk, score });
      }
    }

    scoredDoc.sort((a, b) => b.score - a.score);
    if (scoredDoc.length === 0 && p.chunks.length > 0) {
      porDocumento.push(p.chunks.slice(0, 4).map(c => ({ ...c, score: 1 })));
    } else {
      porDocumento.push(scoredDoc);
    }
  }

  // Selección round-robin balanceada para que ningún pliego quede excluido en comparaciones multi-documento
  const elegidos: { pliegoNombre: string; pagina: number; texto: string; score: number }[] = [];
  const intros = pliegosConTexto
    .map(p => `[RESUMEN INICIAL DE "${p.nombre}" (${p.paginas} págs.)]:\n${p.introTexto.slice(0, 1400)}`)
    .join('\n\n');
  let charsAcumulados = intros.length;

  const maxSlots = 52;
  let ronda = 0;
  while (elegidos.length < maxSlots && charsAcumulados < maxCharsTotales) {
    let agregoEnRonda = false;
    for (const listaDoc of porDocumento) {
      if (ronda < listaDoc.length) {
        const ch = listaDoc[ronda];
        if (charsAcumulados + ch.texto.length > maxCharsTotales && elegidos.length >= 6) {
          continue;
        }
        elegidos.push({
          pliegoNombre: ch.pliegoNombre,
          pagina: ch.pagina,
          texto: ch.texto,
          score: ch.score,
        });
        charsAcumulados += ch.texto.length + 80;
        agregoEnRonda = true;
        if (elegidos.length >= maxSlots) break;
      }
    }
    if (!agregoEnRonda) break;
    ronda++;
  }

  elegidos.sort((a, b) => {
    if (a.pliegoNombre !== b.pliegoNombre) return a.pliegoNombre.localeCompare(b.pliegoNombre);
    return a.pagina - b.pagina;
  });

  const fragmentosTexto = elegidos
    .map(e => `--- [${e.pliegoNombre} | Página ${e.pagina}] ---\n${e.texto}`)
    .join('\n\n');

  return {
    contextoTexto: `${intros}\n\n=== FRAGMENTOS RELEVANTES EXTRAÍDOS ===\n\n${fragmentosTexto}`,
    fragmentosSeleccionados: elegidos,
    modoCompleto: false,
  };
}

/**
 * Construye una respuesta estructurada con cuadro comparativo cuando el servidor opera sin Gemini API Key.
 */
export function generarCuadroComparativoLocal(
  consulta: string,
  pliegos: PliegoIndexado[],
  recuperado: ReturnType<typeof recuperarFragmentosRelevantes>
): string {
  const esPedidoComparativo = /compar|tabla|cuadro|diferenc|discrepanc|matriz|vs|frente a/i.test(consulta);
  const top = recuperado.fragmentosSeleccionados.slice(0, 8);

  if (top.length === 0) {
    return (
      `⚠️ No se encontraron coincidencias directas para **"${consulta}"** en los ${pliegos.length} documento(s) cargado(s).\n\n` +
      `Prueba indicando términos técnicos específicos (ej. \`H-25\`, \`puesta a tierra\`, \`conductor\`, \`tolerancia\`, \`artículo\`).`
    );
  }

  if (esPedidoComparativo && pliegos.length >= 1) {
    const porDoc = new Map<string, typeof top>();
    for (const frag of recuperado.fragmentosSeleccionados.slice(0, 16)) {
      const arr = porDoc.get(frag.pliegoNombre) || [];
      if (arr.length < 3) {
        arr.push(frag);
        porDoc.set(frag.pliegoNombre, arr);
      }
    }

    const filas = Array.from(porDoc.entries()).map(([nombreDoc, frags]) => {
      const paginas = frags.map(f => `Pág. ${f.pagina}`).join(', ');
      const metricas = extraerMetricasTecnicas(frags.map(f => f.texto).join('\n')).slice(0, 5).join(', ') || 'Sin métricas numéricas aisladas';
      const extracto = frags[0].texto.replace(/\s+/g, ' ').slice(0, 220).replace(/\|/g, '/');
      return `| **${nombreDoc}** | ${paginas} | ${metricas} | ${extracto}... |`;
    });

    return (
      `### Cuadro Comparativo Preliminar (Índice Local)\n\n` +
      `| Documento | Páginas Coincidentes | Parámetros / Normas Detectadas | Extracto Principal |\n` +
      `|---|---|---|---|\n` +
      `${filas.join('\n')}\n`
    );
  }

  return (
    `### Coincidencias Encontradas en tus Documentos (${top.length} secciones)\n\n` +
    top
      .slice(0, 5)
      .map(
        (f, i) =>
          `#### ${i + 1}. ${f.pliegoNombre} (Página ${f.pagina})\n${f.texto.slice(0, 900)}${f.texto.length > 900 ? '...' : ''}`
      )
      .join('\n\n---\n\n')
  );
}
