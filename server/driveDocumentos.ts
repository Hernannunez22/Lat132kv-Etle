import fs from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import {
  CACHE_DIR,
  PliegoChunk,
  PliegoIndexado,
  asegurarDirectorioCache,
  construirChunks,
  dividirTextoEnPaginasSimuladas,
  extraerTextoDePdfBuffer,
  normalizarTextoBusqueda,
  recuperarFragmentosRelevantes,
} from './pliegoProcessor';
import { DEFAULT_DRIVE_ROOT_FOLDER_ID, DriveFileItem } from './driveMinutas';
import { extraerTextoMinutaBuffer } from './minutasManager';
import { generarContenidoConFallback } from './geminiClient';
import { analizarYExpandirConsulta } from './semanticSearch';

const STORE_DRIVE_DOCS_PATH = path.join(CACHE_DIR, 'drive_documentos_index.json');

const MIME_FOLDER = 'application/vnd.google-apps.folder';
const MIME_GOOGLE_DOC = 'application/vnd.google-apps.document';
const MIME_GOOGLE_SHEET = 'application/vnd.google-apps.spreadsheet';
const MIME_PDF = 'application/pdf';
const MIME_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const MIME_TXT = 'text/plain';

export interface DriveDocumentoIndexado extends PliegoIndexado {
  driveFileId: string;
  driveUrl: string;
  driveModifiedTime: string;
  rutaCarpeta: string;
}

export function cargarDriveDocumentosStore(): DriveDocumentoIndexado[] {
  try {
    asegurarDirectorioCache();
    if (fs.existsSync(STORE_DRIVE_DOCS_PATH)) {
      const raw = fs.readFileSync(STORE_DRIVE_DOCS_PATH, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (err) {
    console.warn('[DriveDocs] Error cargando caché de documentos técnicos:', err);
  }
  return [];
}

export function guardarDriveDocumentosStore(docs: DriveDocumentoIndexado[]): void {
  try {
    asegurarDirectorioCache();
    fs.writeFileSync(STORE_DRIVE_DOCS_PATH, JSON.stringify(docs), 'utf8');
  } catch (err) {
    console.warn('[DriveDocs] Error guardando caché de documentos técnicos:', err);
  }
}

export function esArchivoDocumentoLegible(file: DriveFileItem): boolean {
  const mime = (file.mimeType || '').toLowerCase();
  const name = (file.name || '').toLowerCase();
  if (mime === MIME_FOLDER) return false;
  if (
    mime === MIME_PDF ||
    mime === MIME_GOOGLE_DOC ||
    mime === MIME_GOOGLE_SHEET ||
    mime === MIME_DOCX ||
    mime === MIME_XLSX ||
    mime === MIME_TXT ||
    mime.includes('wordprocessingml') ||
    mime.includes('spreadsheetml') ||
    mime === 'application/msword' ||
    mime === 'application/vnd.ms-excel'
  ) {
    return true;
  }
  return /\.(pdf|docx|doc|xlsx|xls|txt|csv|md)$/i.test(name);
}

async function driveFetchJson<T>(url: string, accessToken: string, timeoutMs = 8000): Promise<T> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const textBody = await res.text();
  if (!res.ok) {
    let detail = textBody.slice(0, 260);
    try {
      const parsed = JSON.parse(textBody);
      detail = parsed?.error?.message || detail;
    } catch {}
    const err = new Error(`Google Drive API HTTP ${res.status}: ${detail}`);
    (err as any).status = res.status;
    throw err;
  }
  try {
    return JSON.parse(textBody) as T;
  } catch {
    throw new Error('Google Drive devolvió una respuesta no JSON.');
  }
}

function escaparQueryDrive(term: string): string {
  return term.replace(/\\/g, '\\\\').replace(/'/g, "\\'").trim();
}

const STOPWORDS_ES = new Set([
  'para', 'como', 'donde', 'cual', 'cuales', 'quien', 'sobre', 'entre', 'desde', 'hasta',
  'busca', 'buscar', 'dime', 'decime', 'necesito', 'quiero', 'podes', 'puedes', 'tiene',
  'tienen', 'esta', 'este', 'estos', 'estas', 'sobre', 'segun', 'según', 'todo', 'toda',
  'todos', 'todas', 'obra', 'favor', 'mira', 'respuesta', 'pregunta', 'material',
]);

export function extraerTerminosBusquedaDrive(query: string, historial?: string): {
  codigos: string[];
  palabrasNombre: string[];
  palabrasContenido: string[];
  consultaCombinada: string;
} {
  const soloUserHist = (historial || '')
    .split('\n')
    .filter(l => /^Usuario:/i.test(l.trim()))
    .slice(-4)
    .join(' ');
  const consultaCombinada = `${query} ${soloUserHist}`.trim();

  const expandida = analizarYExpandirConsulta(query, soloUserHist);
  const codigos = Array.from(
    new Set([
      ...(consultaCombinada.match(/\b[A-Z]{1,4}(?:-[A-Z0-9]{1,6}){2,}\b/gi) || []).map(c =>
        c.toUpperCase()
      ),
      ...expandida.codigosTecnicos,
    ])
  ).slice(0, 6);

  const norm = normalizarTextoBusqueda(consultaCombinada);
  const tokens = Array.from(
    new Set([
      ...norm.split(/\s+/).filter(t => t.length >= 3 && !STOPWORDS_ES.has(t) && !/^\d+$/.test(t)),
      ...expandida.tokensExpandidos.filter(t => t.length >= 3 && !STOPWORDS_ES.has(t) && !/^\d+$/.test(t)),
    ])
  );

  // Priorizar palabras clave de documento (memoria, descriptiva, leales, bracho, quinteros, etc.)
  const docHints = [
    'memoria', 'descriptiva', 'estudio', 'suelo', 'suelos', 'leales', 'bracho', 'quinteros',
    'calculo', 'especificacion', 'terraplen', 'aporte', 'malla', 'fundacion', 'portico',
    'pat', 'geotecnia', 'conductor', 'opgw', 'interferencia', 'minuta', 'pliego',
  ];
  const palabrasNombre: string[] = [];
  const palabrasContenido: string[] = [];

  for (const h of docHints) {
    if ((norm.includes(h) || expandida.tokensExpandidos.includes(h)) && !palabrasNombre.includes(h)) {
      palabrasNombre.push(h);
    }
  }
  for (const t of tokens) {
    if (palabrasNombre.length < 10 && !palabrasNombre.includes(t)) {
      palabrasNombre.push(t);
    }
    if (palabrasContenido.length < 10 && !palabrasContenido.includes(t)) {
      palabrasContenido.push(t);
    }
  }

  return { codigos, palabrasNombre, palabrasContenido, consultaCombinada: expandida.consultaEnriquecida || consultaCombinada };
}

async function descargarYIndexarArchivoDrive(params: {
  file: DriveFileItem;
  rutaCarpeta: string;
  accessToken: string;
  ai: GoogleGenAI | null;
}): Promise<DriveDocumentoIndexado | null> {
  const { file, rutaCarpeta, accessToken, ai } = params;
  const lower = (file.name || '').toLowerCase();
  const mime = file.mimeType || MIME_PDF;

  let paginasTexto: { pagina: number; texto: string }[] = [];
  let totalPaginas = 1;
  let esEscaneado = false;
  let bufferLength = 0;

  if (mime === MIME_GOOGLE_DOC) {
    const expUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}/export?mimeType=text/plain`;
    const res = await fetch(expUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;
    const raw = (await res.text()).trim();
    bufferLength = Buffer.byteLength(raw, 'utf8');
    paginasTexto = dividirTextoEnPaginasSimuladas(raw);
    totalPaginas = Math.max(1, paginasTexto.length);
  } else if (mime === MIME_GOOGLE_SHEET) {
    const expUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}/export?mimeType=text/csv`;
    const res = await fetch(expUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;
    const raw = (await res.text()).trim();
    bufferLength = Buffer.byteLength(raw, 'utf8');
    paginasTexto = dividirTextoEnPaginasSimuladas(raw);
    totalPaginas = Math.max(1, paginasTexto.length);
  } else {
    const mediaUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}?alt=media&supportsAllDrives=true`;
    const resMedia = await fetch(mediaUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(15000),
    });
    if (!resMedia.ok) return null;

    const ab = await resMedia.arrayBuffer();
    const buffer = Buffer.from(ab);
    bufferLength = buffer.length;

    if (mime === MIME_XLSX || lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
      const wb = XLSX.read(buffer, { type: 'buffer' });
      const hojas: string[] = [];
      for (const sheetName of wb.SheetNames.slice(0, 8)) {
        const csv = XLSX.utils.sheet_to_csv(wb.Sheets[sheetName]);
        if (csv.trim()) hojas.push(`[Hoja ${sheetName}]\n${csv.trim()}`);
      }
      paginasTexto = dividirTextoEnPaginasSimuladas(hojas.join('\n\n'));
      totalPaginas = Math.max(1, paginasTexto.length);
    } else if (mime === MIME_PDF || lower.endsWith('.pdf')) {
      try {
        const pdfRes = await extraerTextoDePdfBuffer(buffer);
        paginasTexto = pdfRes.paginasTexto;
        totalPaginas = Math.max(1, pdfRes.totalPaginas);
      } catch {
        paginasTexto = [];
      }

      const charsTotal = paginasTexto.reduce((acc, p) => acc + p.texto.length, 0);
      if (charsTotal < 80 && ai && buffer.length > 0 && buffer.length <= 14 * 1024 * 1024) {
        esEscaneado = true;
        try {
          const { response } = await generarContenidoConFallback({
            ai,
            contents: [
              {
                inlineData: {
                  mimeType: 'application/pdf',
                  data: buffer.toString('base64'),
                },
              },
              {
                text: `Transcribe fielmente el texto técnico, tablas y especificaciones de este documento de ingeniería ("${file.name}").`,
              },
            ],
            config: { thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL } },
            timeoutMs: 18000,
          });
          const ocrTxt = (response.text || '').trim();
          if (ocrTxt) {
            paginasTexto = dividirTextoEnPaginasSimuladas(ocrTxt);
            totalPaginas = Math.max(totalPaginas, paginasTexto.length);
          }
        } catch (err) {
          console.warn(`[DriveDocs] OCR fallido para "${file.name}":`, err);
        }
      }
    } else {
      const txt = await extraerTextoMinutaBuffer(buffer, file.name, mime);
      if (txt) {
        paginasTexto = dividirTextoEnPaginasSimuladas(txt);
        totalPaginas = Math.max(1, paginasTexto.length);
      }
    }
  }

  const contenidoTexto = paginasTexto
    .map(p => (p.texto ? `[Página ${p.pagina}]\n${p.texto}` : ''))
    .filter(Boolean)
    .join('\n\n')
    .trim();

  if (!contenidoTexto) return null;

  const id = `drv_${file.id.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32)}`;
  const chunks: PliegoChunk[] = construirChunks(id, file.name, paginasTexto);
  const mb = bufferLength / (1024 * 1024);
  const tamanioTexto =
    mb >= 1 ? `${mb.toFixed(2)} MB` : `${Math.max(1, Math.round(bufferLength / 1024))} KB`;

  return {
    id,
    driveFileId: file.id,
    driveUrl: file.webViewLink || `https://drive.google.com/file/d/${file.id}/view`,
    driveModifiedTime: file.modifiedTime || '',
    rutaCarpeta,
    nombre: file.name,
    tipoMime: mime,
    tamanioBytes: bufferLength,
    tamanioTexto,
    fechaSubida: (file.modifiedTime || new Date().toISOString()).slice(0, 10),
    contenidoTexto: contenidoTexto.slice(0, 450000),
    paginas: totalPaginas,
    caracteresTexto: contenidoTexto.length,
    esEscaneado,
    tiempoProcesoMs: 0,
    chunks,
    introTexto: contenidoTexto.slice(0, 3500),
  };
}

function puntuarCandidatoDrive(
  file: DriveFileItem,
  codigos: string[],
  palabrasNombre: string[],
  palabrasContenido: string[]
): number {
  const nameNorm = normalizarTextoBusqueda(file.name || '');
  let score = 0;

  for (const cod of codigos) {
    if ((file.name || '').toUpperCase().includes(cod)) score += 120;
  }
  for (const w of palabrasNombre) {
    if (nameNorm.includes(w)) score += 28;
  }
  for (const w of palabrasContenido) {
    if (nameNorm.includes(w)) score += 12;
  }
  if (/memoria|descriptiva|estudio|suelo|calculo|especificacion|\bmd\b/i.test(file.name || '')) {
    score += 20;
  }
  if (/\.pdf$/i.test(file.name || '') || file.mimeType === MIME_GOOGLE_DOC) {
    score += 8;
  }
  return score;
}

async function listarCarpetasYCandidatosRaiz(
  rootFolderId: string,
  accessToken: string,
  keywords: string[]
): Promise<Array<{ file: DriveFileItem; ruta: string }>> {
  const resultados: Array<{ file: DriveFileItem; ruta: string }> = [];
  const fields = encodeURIComponent(
    'files(id,name,mimeType,modifiedTime,webViewLink,size,parents)'
  );

  const listar = async (fId: string) => {
    const q = encodeURIComponent(`'${fId}' in parents and trashed = false`);
    const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=${fields}&pageSize=100&supportsAllDrives=true&includeItemsFromAllDrives=true`;
    const data = await driveFetchJson<{ files?: DriveFileItem[] }>(url, accessToken, 6000);
    return data.files || [];
  };

  try {
    const hijosRaiz = await listar(rootFolderId);
    const subcarpetas: DriveFileItem[] = [];
    for (const h of hijosRaiz) {
      if (h.mimeType === MIME_FOLDER) {
        subcarpetas.push(h);
      } else if (esArchivoDocumentoLegible(h)) {
        resultados.push({ file: h, ruta: 'Raíz Drive' });
      }
    }

    // Priorizar subcarpetas relacionadas con memorias, ingeniería, ET Leales, documentos o estudios
    subcarpetas.sort((a, b) => {
      const aN = normalizarTextoBusqueda(a.name);
      const bN = normalizarTextoBusqueda(b.name);
      let sA = 0;
      let sB = 0;
      for (const k of keywords) {
        if (aN.includes(k)) sA += 20;
        if (bN.includes(k)) sB += 20;
      }
      if (/memoria|ingenier|leales|estudio|suelo|especif|doc|tecnic|obra/i.test(a.name)) sA += 15;
      if (/memoria|ingenier|leales|estudio|suelo|especif|doc|tecnic|obra/i.test(b.name)) sB += 15;
      return sB - sA;
    });

    const topSubcarpetas = subcarpetas.slice(0, 12);
    const nivel2 = await Promise.all(
      topSubcarpetas.map(async sub => {
        try {
          const items = await listar(sub.id);
          return { sub, items };
        } catch {
          return { sub, items: [] as DriveFileItem[] };
        }
      })
    );

    const nivel2Carpetas: Array<{ folder: DriveFileItem; ruta: string }> = [];
    for (const { sub, items } of nivel2) {
      for (const it of items) {
        if (it.mimeType === MIME_FOLDER) {
          nivel2Carpetas.push({ folder: it, ruta: `${sub.name}/${it.name}` });
        } else if (esArchivoDocumentoLegible(it)) {
          resultados.push({ file: it, ruta: sub.name });
        }
      }
    }

    // Explorar hasta 8 subcarpetas de segundo nivel relevantes
    nivel2Carpetas.sort((a, b) => {
      const aN = normalizarTextoBusqueda(a.ruta);
      const bN = normalizarTextoBusqueda(b.ruta);
      let sA = 0;
      let sB = 0;
      for (const k of keywords) {
        if (aN.includes(k)) sA += 20;
        if (bN.includes(k)) sB += 20;
      }
      if (/memoria|leales|suelo|civil|ingenier|\bmd\b/i.test(a.ruta)) sA += 12;
      if (/memoria|leales|suelo|civil|ingenier|\bmd\b/i.test(b.ruta)) sB += 12;
      return sB - sA;
    });

    const nivel3 = await Promise.all(
      nivel2Carpetas.slice(0, 8).map(async ({ folder, ruta }) => {
        try {
          const items = await listar(folder.id);
          return { ruta, items };
        } catch {
          return { ruta, items: [] as DriveFileItem[] };
        }
      })
    );

    for (const { ruta, items } of nivel3) {
      for (const it of items) {
        if (esArchivoDocumentoLegible(it)) {
          resultados.push({ file: it, ruta });
        }
      }
    }
  } catch (err) {
    console.warn('[DriveDocs] Error explorando árbol raíz de Drive:', err);
  }

  return resultados;
}

function extraerDriveIdsDesdeTexto(texto: string): {
  folderIds: string[];
  fileIds: string[];
} {
  const folderIds = new Set<string>();
  const fileIds = new Set<string>();
  const raw = String(texto || '');

  for (const m of raw.matchAll(/drive\.google\.com\/(?:drive\/(?:u\/\d+\/)?folders|folderview\?id=)([a-zA-Z0-9_-]{12,})/gi)) {
    if (m[1]) folderIds.add(m[1]);
  }
  for (const m of raw.matchAll(/(?:drive|docs)\.google\.com\/(?:file|document|spreadsheets|presentation)\/d\/([a-zA-Z0-9_-]{12,})/gi)) {
    if (m[1]) fileIds.add(m[1]);
  }
  for (const m of raw.matchAll(/drive\.google\.com\/[^\s]*[?&]id=([a-zA-Z0-9_-]{12,})/gi)) {
    const id = m[1];
    if (id && !folderIds.has(id) && !fileIds.has(id)) {
      fileIds.add(id);
    }
  }
  return {
    folderIds: Array.from(folderIds).slice(0, 3),
    fileIds: Array.from(fileIds).slice(0, 4),
  };
}

export async function buscarYLeerDocumentosDriveEnVivo(params: {
  query: string;
  historial?: string;
  accessToken?: string;
  rootFolderId?: string;
  ai: GoogleGenAI | null;
  storeActual: DriveDocumentoIndexado[];
}): Promise<{
  storeActualizado: DriveDocumentoIndexado[];
  contextoTexto: string;
  documentosCoincidentes: Array<{
    nombre: string;
    rutaCarpeta: string;
    driveUrl: string;
    paginas: number;
  }>;
  nuevosLeidos: string[];
  busquedaEjecutada: boolean;
  errorDrive?: string;
}> {
  const {
    query,
    historial,
    accessToken,
    rootFolderId = DEFAULT_DRIVE_ROOT_FOLDER_ID,
    ai,
    storeActual,
  } = params;

  const { codigos, palabrasNombre, palabrasContenido, consultaCombinada } =
    extraerTerminosBusquedaDrive(query, historial);
  const { folderIds: folderIdsUrl, fileIds: fileIdsUrl } =
    extraerDriveIdsDesdeTexto(consultaCombinada);

  let docs = [...storeActual];
  const nuevosLeidos: string[] = [];
  let errorDrive: string | undefined;
  let busquedaEjecutada = false;

  if (
    accessToken &&
    (palabrasNombre.length > 0 ||
      codigos.length > 0 ||
      palabrasContenido.length > 0 ||
      folderIdsUrl.length > 0 ||
      fileIdsUrl.length > 0)
  ) {
    busquedaEjecutada = true;
    const tInicio = Date.now();
    const candidatosMap = new Map<string, { file: DriveFileItem; ruta: string; score: number }>();

    try {
      const fields = encodeURIComponent(
        'files(id,name,mimeType,modifiedTime,webViewLink,size,parents)'
      );
      const queriesDrive: string[] = [];

      // 1) Búsqueda directa por código o palabras clave en nombre de archivo
      const nameParts: string[] = [];
      for (const cod of codigos) {
        nameParts.push(`name contains '${escaparQueryDrive(cod)}'`);
      }
      for (const w of palabrasNombre.slice(0, 4)) {
        nameParts.push(`name contains '${escaparQueryDrive(w)}'`);
      }
      if (nameParts.length > 0) {
        queriesDrive.push(`trashed = false and mimeType != '${MIME_FOLDER}' and (${nameParts.join(' or ')})`);
      }

      // 2) Búsqueda fullText dentro de PDFs / Docs en Google Drive
      const fullTextTerms = Array.from(new Set([...codigos, ...palabrasContenido])).slice(0, 4);
      if (fullTextTerms.length > 0) {
        const ftParts = fullTextTerms.map(t => `fullText contains '${escaparQueryDrive(t)}'`);
        queriesDrive.push(`trashed = false and mimeType != '${MIME_FOLDER}' and (${ftParts.join(' or ')})`);
      }

      const carpetasObjetivo = Array.from(new Set([rootFolderId, ...folderIdsUrl]));

      const [resultadosQueries, resultadosCarpetas, archivosDirectosUrl] = await Promise.all([
        Promise.all(
          queriesDrive.map(async qRaw => {
            try {
              const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(qRaw)}&fields=${fields}&pageSize=30&orderBy=modifiedTime desc&supportsAllDrives=true&includeItemsFromAllDrives=true`;
              const data = await driveFetchJson<{ files?: DriveFileItem[] }>(url, accessToken, 7000);
              return data.files || [];
            } catch (e: any) {
              if (e?.status === 401) throw e;
              return [] as DriveFileItem[];
            }
          })
        ),
        Promise.all(
          carpetasObjetivo.map(fId =>
            listarCarpetasYCandidatosRaiz(fId, accessToken, [
              ...palabrasNombre,
              ...codigos.map(c => c.toLowerCase()),
            ])
          )
        ).then(arr => arr.flat()),
        Promise.all(
          fileIdsUrl.map(async fId => {
            try {
              const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fId)}?fields=id,name,mimeType,modifiedTime,webViewLink,size,parents&supportsAllDrives=true`;
              const meta = await driveFetchJson<DriveFileItem>(url, accessToken, 7000);
              if (meta?.mimeType === MIME_FOLDER) {
                const subItems = await listarCarpetasYCandidatosRaiz(meta.id, accessToken, [
                  ...palabrasNombre,
                  ...codigos.map(c => c.toLowerCase()),
                ]);
                return subItems.map(x => x.file);
              }
              return meta?.id ? [meta] : [];
            } catch (e: any) {
              if (e?.status === 401) throw e;
              return [] as DriveFileItem[];
            }
          })
        ).then(arr => arr.flat()),
      ]);

      for (const f of archivosDirectosUrl) {
        if (!esArchivoDocumentoLegible(f)) continue;
        candidatosMap.set(f.id, { file: f, ruta: 'Link Drive en Chat', score: 200 });
      }

      for (const lista of resultadosQueries) {
        for (const f of lista) {
          if (!esArchivoDocumentoLegible(f)) continue;
          const sc = puntuarCandidatoDrive(f, codigos, palabrasNombre, palabrasContenido) + 10;
          const prev = candidatosMap.get(f.id);
          if (!prev || sc > prev.score) {
            candidatosMap.set(f.id, { file: f, ruta: prev?.ruta || 'Google Drive', score: sc });
          }
        }
      }

      const resultadosCarpeta = resultadosCarpetas;

      for (const item of resultadosCarpeta) {
        const sc = puntuarCandidatoDrive(item.file, codigos, palabrasNombre, palabrasContenido);
        if (sc <= 0 && candidatosMap.size >= 8) continue;
        const prev = candidatosMap.get(item.file.id);
        if (!prev || sc > prev.score) {
          candidatosMap.set(item.file.id, {
            file: item.file,
            ruta: item.ruta,
            score: sc + 5,
          });
        }
      }

      const ordenados = Array.from(candidatosMap.values())
        .filter(c => c.score > 8)
        .sort((a, b) => b.score - a.score)
        .slice(0, 12);

      const mapaExistentes = new Map(docs.map(d => [d.driveFileId, d]));
      let procesadosAhora = 0;

      for (const cand of ordenados) {
        if (procesadosAhora >= 4 || Date.now() - tInicio > 16000) break;
        const previo = mapaExistentes.get(cand.file.id);
        if (
          previo &&
          (!cand.file.modifiedTime || previo.driveModifiedTime === cand.file.modifiedTime) &&
          previo.caracteresTexto > 30
        ) {
          continue;
        }
        try {
          const indexado = await descargarYIndexarArchivoDrive({
            file: cand.file,
            rutaCarpeta: cand.ruta,
            accessToken,
            ai,
          });
          if (indexado) {
            mapaExistentes.set(cand.file.id, indexado);
            nuevosLeidos.push(indexado.nombre);
            procesadosAhora++;
          }
        } catch (err: any) {
          if (err?.status === 401) throw err;
          console.warn(`[DriveDocs] Error leyendo "${cand.file.name}":`, err);
        }
      }

      if (nuevosLeidos.length > 0) {
        docs = Array.from(mapaExistentes.values());
        guardarDriveDocumentosStore(docs);
      }
    } catch (err: any) {
      errorDrive =
        err?.status === 401
          ? 'Tu token de Google Drive expiró; vuelve a conectar Google Drive para buscar documentos en vivo.'
          : err?.message || 'Error consultando Google Drive.';
    }
  }

  if (docs.length === 0) {
    return {
      storeActualizado: docs,
      contextoTexto: '',
      documentosCoincidentes: [],
      nuevosLeidos,
      busquedaEjecutada,
      errorDrive,
    };
  }

  const recuperado = recuperarFragmentosRelevantes(consultaCombinada, docs, 95000);
  const nombresCoincidentes = new Set(recuperado.fragmentosSeleccionados.map(f => f.pliegoNombre));
  const documentosCoincidentes = docs
    .filter(d => nombresCoincidentes.has(d.nombre) || nuevosLeidos.includes(d.nombre))
    .map(d => ({
      nombre: d.nombre,
      rutaCarpeta: d.rutaCarpeta,
      driveUrl: d.driveUrl,
      paginas: d.paginas,
    }));

  return {
    storeActualizado: docs,
    contextoTexto: recuperado.contextoTexto,
    documentosCoincidentes,
    nuevosLeidos,
    busquedaEjecutada,
    errorDrive,
  };
}

export async function sincronizarDocsTecnicosDriveCarpeta(params: {
  accessToken: string;
  folderId?: string;
  ai: GoogleGenAI | null;
  storeActual: DriveDocumentoIndexado[];
  maxNuevos?: number;
}): Promise<{
  storeActualizado: DriveDocumentoIndexado[];
  totalIndexados: number;
  nuevos: number;
  omitidosExistentes: number;
  nombresNuevos: string[];
}> {
  const {
    accessToken,
    folderId = DEFAULT_DRIVE_ROOT_FOLDER_ID,
    ai,
    storeActual,
    maxNuevos = 15,
  } = params;

  const mapaExistentes = new Map(storeActual.map(d => [d.driveFileId, d]));
  const encontrados = await listarCarpetasYCandidatosRaiz(folderId, accessToken, [
    'memoria',
    'descriptiva',
    'estudio',
    'suelo',
    'leales',
    'bracho',
    'quinteros',
    'especificacion',
  ]);

  // Priorizar Memorias Descriptivas, Estudios de Suelo y Especificaciones Técnicas
  encontrados.sort((a, b) => {
    const scoreFn = (name: string) => {
      let s = 0;
      if (/memoria|descriptiva|\bmd\b/i.test(name)) s += 50;
      if (/suelo|geotec|estudio|calculo|especificacion/i.test(name)) s += 30;
      if (/leales|bracho|quinteros|et-le|et-vq/i.test(name)) s += 20;
      return s;
    };
    return scoreFn(b.file.name) - scoreFn(a.file.name);
  });

  let nuevos = 0;
  let omitidosExistentes = 0;
  const nombresNuevos: string[] = [];
  const t0 = Date.now();

  for (const cand of encontrados) {
    if (nuevos >= maxNuevos || Date.now() - t0 > 22000) break;
    const prev = mapaExistentes.get(cand.file.id);
    if (
      prev &&
      (!cand.file.modifiedTime || prev.driveModifiedTime === cand.file.modifiedTime) &&
      prev.caracteresTexto > 30
    ) {
      omitidosExistentes++;
      continue;
    }
    try {
      const idx = await descargarYIndexarArchivoDrive({
        file: cand.file,
        rutaCarpeta: cand.ruta,
        accessToken,
        ai,
      });
      if (idx) {
        mapaExistentes.set(cand.file.id, idx);
        nombresNuevos.push(idx.nombre);
        nuevos++;
      }
    } catch (err: any) {
      if (err?.status === 401) throw err;
      console.warn(`[DriveDocs Sync] Error procesando "${cand.file.name}":`, err);
    }
  }

  const storeActualizado = Array.from(mapaExistentes.values());
  if (nuevos > 0) {
    guardarDriveDocumentosStore(storeActualizado);
  }

  return {
    storeActualizado,
    totalIndexados: storeActualizado.length,
    nuevos,
    omitidosExistentes,
    nombresNuevos,
  };
}

export interface DriveDiagnosticoCarpeta {
  folderId: string;
  nombre: string;
  accesible: boolean;
  webViewLink?: string;
  error?: string;
  subcarpetas: Array<{ id: string; name: string; webViewLink?: string }>;
  archivosCount: number;
}

export interface DriveDiagnosticoResultado {
  conectado: boolean;
  permisoLecturaDrive: boolean;
  cuentaEmail: string | null;
  cuentaNombre: string | null;
  carpetaPrincipal: DriveDiagnosticoCarpeta;
  carpetaElencos?: {
    folderId: string;
    nombre: string;
    accesible: boolean;
    error?: string;
  };
  sugerencia?: string;
}

function diagnosticarErrorHttpDrive(status: number | undefined, rawMsg: string): string {
  const lower = (rawMsg || '').toLowerCase();
  if (status === 401 || lower.includes('invalid credentials') || lower.includes('unauthorized')) {
    return 'Token vencido o revocado (HTTP 401). Vuelve a conectar Google Drive.';
  }
  if (status === 403 && (lower.includes('insufficient') || lower.includes('scope'))) {
    return 'La cuenta inició sesión sin marcar el permiso de lectura de Google Drive (scope drive.readonly). Usa "Reautorizar Drive" y marca la casilla de Google Drive.';
  }
  if (status === 403) {
    return 'Sin permiso de acceso a esta carpeta/archivo (HTTP 403). Verifica que la carpeta esté compartida con tu cuenta de Google.';
  }
  if (status === 404 || lower.includes('file not found')) {
    return 'Carpeta no encontrada o no compartida con esta cuenta de Google (HTTP 404).';
  }
  return rawMsg || `Error HTTP ${status || 500} consultando Google Drive.`;
}

export async function verificarConexionDrive(params: {
  accessToken: string;
  folderId?: string;
  elencosFolderId?: string;
}): Promise<DriveDiagnosticoResultado> {
  const targetFolderId = (params.folderId || DEFAULT_DRIVE_ROOT_FOLDER_ID).trim();
  const elencosId = (params.elencosFolderId || '').trim();

  let cuentaEmail: string | null = null;
  let cuentaNombre: string | null = null;
  let permisoLecturaDrive = true;

  try {
    const about = await driveFetchJson<{
      user?: { displayName?: string; emailAddress?: string };
    }>('https://www.googleapis.com/drive/v3/about?fields=user(displayName,emailAddress)', params.accessToken, 7000);
    cuentaEmail = about.user?.emailAddress || null;
    cuentaNombre = about.user?.displayName || null;
  } catch (err: any) {
    const st = Number(err?.status) || undefined;
    if (st === 401) {
      throw err;
    }
    if (st === 403) {
      permisoLecturaDrive = false;
    }
  }

  const carpetaPrincipal: DriveDiagnosticoCarpeta = {
    folderId: targetFolderId,
    nombre: 'Carpeta Drive',
    accesible: false,
    subcarpetas: [],
    archivosCount: 0,
  };

  try {
    const meta = await driveFetchJson<{
      id: string;
      name: string;
      mimeType: string;
      webViewLink?: string;
    }>(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(targetFolderId)}?fields=id,name,mimeType,webViewLink&supportsAllDrives=true`,
      params.accessToken,
      7000
    );
    carpetaPrincipal.nombre = meta.name || 'Carpeta raíz';
    carpetaPrincipal.webViewLink = meta.webViewLink;
    carpetaPrincipal.accesible = true;

    const q = encodeURIComponent(`'${targetFolderId}' in parents and trashed = false`);
    const fields = encodeURIComponent('files(id,name,mimeType,webViewLink)');
    const childrenUrl = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=${fields}&pageSize=100&orderBy=folder,name&supportsAllDrives=true&includeItemsFromAllDrives=true`;
    const listRes = await driveFetchJson<{ files?: DriveFileItem[] }>(childrenUrl, params.accessToken, 7000);
    const items = listRes.files || [];
    carpetaPrincipal.subcarpetas = items
      .filter(f => f.mimeType === MIME_FOLDER)
      .map(f => ({ id: f.id, name: f.name, webViewLink: f.webViewLink }))
      .slice(0, 30);
    carpetaPrincipal.archivosCount = items.filter(f => f.mimeType !== MIME_FOLDER).length;
  } catch (err: any) {
    const st = Number(err?.status) || undefined;
    if (st === 401) throw err;
    if (st === 403 && String(err?.message || '').toLowerCase().includes('insufficient')) {
      permisoLecturaDrive = false;
    }
    carpetaPrincipal.error = diagnosticarErrorHttpDrive(st, err?.message || '');
  }

  let carpetaElencos: DriveDiagnosticoResultado['carpetaElencos'];
  if (elencosId) {
    try {
      const metaEl = await driveFetchJson<{ id: string; name: string }>(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(elencosId)}?fields=id,name&supportsAllDrives=true`,
        params.accessToken,
        6000
      );
      carpetaElencos = {
        folderId: elencosId,
        nombre: metaEl.name || 'Elencos',
        accesible: true,
      };
    } catch (err: any) {
      carpetaElencos = {
        folderId: elencosId,
        nombre: 'Elencos',
        accesible: false,
        error: diagnosticarErrorHttpDrive(Number(err?.status) || undefined, err?.message || ''),
      };
    }
  }

  return {
    conectado: true,
    permisoLecturaDrive,
    cuentaEmail,
    cuentaNombre,
    carpetaPrincipal,
    ...(carpetaElencos ? { carpetaElencos } : {}),
    ...(!permisoLecturaDrive
      ? {
          sugerencia:
            'Falta el permiso drive.readonly. Haz clic en "Reautorizar Drive" y marca la casilla de Google Drive en la ventana de Google.',
        }
      : !carpetaPrincipal.accesible
        ? {
            sugerencia:
              'La cuenta está conectada pero no puede acceder a la carpeta indicada. Comparte la carpeta con tu cuenta o pega el enlace de otra carpeta.',
          }
        : {}),
  };
}
