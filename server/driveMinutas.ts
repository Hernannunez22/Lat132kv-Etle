import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import {
  analizarYExtraerCompromisosMinuta,
  extraerTextoMinutaBuffer,
  inferirMetadatosMinuta,
  normalizarFechaIso,
} from './minutasManager';
import { CompromisoMinuta, MinutaReunion } from '../src/types';
import { generarContenidoConFallback } from './geminiClient';

export const DEFAULT_DRIVE_ROOT_FOLDER_ID = '1hRZXHfqmcFdhiHj2Fbx1IV9gCCVX7edw';

const MIME_FOLDER = 'application/vnd.google-apps.folder';
const MIME_GOOGLE_DOC = 'application/vnd.google-apps.document';
const MIME_PDF = 'application/pdf';
const MIME_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const MIME_TXT = 'text/plain';

export interface DriveFileItem {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  webViewLink?: string;
  size?: string;
  parents?: string[];
}

interface DriveCandidateFile {
  file: DriveFileItem;
  rutaCarpeta: string;
}

export interface DriveSyncResult {
  carpetaRaizId: string;
  carpetaRaizNombre: string;
  carpetasEscaneadas: number;
  archivosDetectados: number;
  minutasNuevas: MinutaReunion[];
  minutasActualizadas: number;
  minutasOmitidasPorExistentes: number;
  compromisosNuevos: CompromisoMinuta[];
  erroresArchivos: Array<{ nombre: string; error: string }>;
}

function normalizarTextoSimple(txt: string): string {
  return (txt || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function esTipoArchivoSoportado(file: DriveFileItem): boolean {
  const lower = (file.name || '').toLowerCase();
  if (lower.startsWith('~$') || lower.startsWith('._')) return false;
  return (
    file.mimeType === MIME_PDF ||
    file.mimeType === MIME_GOOGLE_DOC ||
    file.mimeType === MIME_DOCX ||
    file.mimeType === MIME_TXT ||
    lower.endsWith('.pdf') ||
    lower.endsWith('.docx') ||
    lower.endsWith('.txt')
  );
}

function esNombreOCarpetaDeMinuta(nombreArchivo: string, rutaCarpeta: string): boolean {
  const nomNorm = normalizarTextoSimple(nombreArchivo);
  const rutaNorm = normalizarTextoSimple(rutaCarpeta);

  if (
    rutaNorm.includes('minuta') ||
    rutaNorm.includes('actas de reunion') ||
    rutaNorm.includes('reunion')
  ) {
    return true;
  }

  return (
    nomNorm.includes('minuta') ||
    nomNorm.includes('acta de reunion') ||
    nomNorm.includes('acta reunion') ||
    nomNorm.includes('comct2-tu1') ||
    /\bmin[-_\s]?\d+/i.test(nomNorm) ||
    /\bmr[-_\s]?\d+/i.test(nomNorm)
  );
}

function prioridadCarpeta(nombreCarpeta: string): number {
  const n = normalizarTextoSimple(nombreCarpeta);
  if (n.includes('minuta')) return 0;
  if (n.includes('reunion') || n.includes('acta')) return 1;
  if (n.includes('comunicacion') || n.includes('comct') || n.includes('gestion') || n.includes('libro')) return 2;
  if (n.includes('elenco')) return 99;
  return 5;
}

async function driveFetchJson<T>(url: string, accessToken: string): Promise<T> {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const rawText = await res.text().catch(() => '');
  if (!res.ok) {
    let parsedMsg = rawText;
    try {
      const j = JSON.parse(rawText);
      parsedMsg = j?.error?.message || rawText;
    } catch {
      if (/^\s*</.test(rawText)) {
        parsedMsg = `Google Drive devolvió HTML en lugar de JSON (HTTP ${res.status}). Verifica tu sesión de Google.`;
      }
    }
    const error = new Error(parsedMsg || `Google Drive API HTTP ${res.status}`) as Error & { status?: number };
    error.status = res.status;
    throw error;
  }
  if (/^\s*</.test(rawText)) {
    const error = new Error(
      'Google Drive devolvió una página HTML en lugar de datos JSON (posible sesión expirada).'
    ) as Error & { status?: number };
    error.status = 401;
    throw error;
  }
  try {
    return JSON.parse(rawText) as T;
  } catch {
    throw new Error('Google Drive devolvió una respuesta no válida (JSON malformado).');
  }
}

async function listarHijosCarpetaDrive(
  folderId: string,
  accessToken: string
): Promise<DriveFileItem[]> {
  const items: DriveFileItem[] = [];
  let pageToken = '';

  do {
    const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
    const fields = encodeURIComponent(
      'nextPageToken,files(id,name,mimeType,modifiedTime,webViewLink,size,parents)'
    );
    const url =
      `https://www.googleapis.com/drive/v3/files?q=${q}&fields=${fields}` +
      `&pageSize=200&supportsAllDrives=true&includeItemsFromAllDrives=true` +
      (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '');

    const data = await driveFetchJson<{ nextPageToken?: string; files?: DriveFileItem[] }>(
      url,
      accessToken
    );
    if (Array.isArray(data.files)) {
      items.push(...data.files);
    }
    pageToken = data.nextPageToken || '';
  } while (pageToken && items.length < 1000);

  return items;
}

async function buscarMinutasGlobalesEnDrive(
  accessToken: string
): Promise<DriveCandidateFile[]> {
  const encontrados = new Map<string, DriveCandidateFile>();

  // 1. Buscar carpetas explícitas de "minuta" o "minutas" en todo el Drive accesible
  try {
    const qFolders = encodeURIComponent(
      `mimeType = '${MIME_FOLDER}' and trashed = false and (name contains 'minuta' or name contains 'Minuta' or name contains 'MINUTA')`
    );
    const fields = encodeURIComponent('files(id,name,mimeType,modifiedTime,webViewLink)');
    const resFolders = await driveFetchJson<{ files?: DriveFileItem[] }>(
      `https://www.googleapis.com/drive/v3/files?q=${qFolders}&fields=${fields}&pageSize=30&supportsAllDrives=true&includeItemsFromAllDrives=true`,
      accessToken
    );

    for (const folder of resFolders.files || []) {
      const hijos = await listarHijosCarpetaDrive(folder.id, accessToken);
      for (const h of hijos) {
        if (h.mimeType !== MIME_FOLDER && esTipoArchivoSoportado(h)) {
          encontrados.set(h.id, { file: h, rutaCarpeta: folder.name });
        }
      }
    }
  } catch (err) {
    console.warn('[DriveMinutas] Aviso buscando carpetas de minutas:', err);
  }

  // 2. Buscar archivos individuales cuyo nombre refiera a Minuta / COMCT2-TU1
  try {
    const qFiles = encodeURIComponent(
      `mimeType != '${MIME_FOLDER}' and trashed = false and (` +
        `name contains 'minuta' or name contains 'Minuta' or name contains 'MINUTA' or ` +
        `name contains 'COMCT2-TU1' or name contains 'Acta de Reunion' or name contains 'Acta de Reunión'` +
        `)`
    );
    const fields = encodeURIComponent(
      'files(id,name,mimeType,modifiedTime,webViewLink,size,parents)'
    );
    const resFiles = await driveFetchJson<{ files?: DriveFileItem[] }>(
      `https://www.googleapis.com/drive/v3/files?q=${qFiles}&fields=${fields}&pageSize=80&orderBy=modifiedTime desc&supportsAllDrives=true&includeItemsFromAllDrives=true`,
      accessToken
    );

    for (const f of resFiles.files || []) {
      if (esTipoArchivoSoportado(f) && !encontrados.has(f.id)) {
        encontrados.set(f.id, { file: f, rutaCarpeta: 'Búsqueda en Google Drive' });
      }
    }
  } catch (err) {
    console.warn('[DriveMinutas] Aviso buscando archivos de minutas:', err);
  }

  return Array.from(encontrados.values());
}

async function descargarContenidoArchivoDrive(
  file: DriveFileItem,
  accessToken: string
): Promise<{ buffer: Buffer; tipoMimeEfectivo: string; nombreEfectivo: string }> {
  if (file.mimeType === MIME_GOOGLE_DOC) {
    const exportUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
      file.id
    )}/export?mimeType=text/plain&supportsAllDrives=true`;
    const res = await fetch(exportUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.ok) {
      const ab = await res.arrayBuffer();
      return {
        buffer: Buffer.from(ab),
        tipoMimeEfectivo: MIME_TXT,
        nombreEfectivo: file.name.endsWith('.txt') ? file.name : `${file.name}.txt`,
      };
    }

    const exportPdfUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
      file.id
    )}/export?mimeType=application/pdf&supportsAllDrives=true`;
    const resPdf = await fetch(exportPdfUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!resPdf.ok) {
      throw new Error(`No se pudo exportar Google Doc "${file.name}" (HTTP ${resPdf.status})`);
    }
    const abPdf = await resPdf.arrayBuffer();
    return {
      buffer: Buffer.from(abPdf),
      tipoMimeEfectivo: MIME_PDF,
      nombreEfectivo: `${file.name}.pdf`,
    };
  }

  const mediaUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
    file.id
  )}?alt=media&supportsAllDrives=true`;
  const res = await fetch(mediaUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`No se pudo descargar "${file.name}" (HTTP ${res.status})`);
  }
  const ab = await res.arrayBuffer();
  return {
    buffer: Buffer.from(ab),
    tipoMimeEfectivo: file.mimeType || MIME_PDF,
    nombreEfectivo: file.name,
  };
}

async function extraerTextoConOcrGeminiSiEscaneado(
  buffer: Buffer,
  nombre: string,
  ai: GoogleGenAI | null,
  model: string
): Promise<string> {
  if (!ai || buffer.length === 0 || buffer.length > 18 * 1024 * 1024) return '';
  try {
    const { response: resp } = await generarContenidoConFallback({
      ai,
      model,
      contents: [
        {
          inlineData: {
            mimeType: 'application/pdf',
            data: buffer.toString('base64'),
          },
        },
        {
          text:
            `Transcribe fielmente el texto completo, fechas, asistentes, puntos tratados y acuerdos/compromisos presentes en esta minuta PDF ("${nombre}").`,
        },
      ],
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
      timeoutMs: 20000,
    });
    return (resp.text || '').trim();
  } catch (err) {
    console.warn(`[DriveMinutas] Fallback OCR Gemini para "${nombre}":`, err);
    return '';
  }
}

export async function sincronizarMinutasDesdeGoogleDrive(params: {
  accessToken: string;
  folderId?: string;
  buscarEnTodoDrive?: boolean;
  minutasExistentes: MinutaReunion[];
  ai: GoogleGenAI | null;
  model: string;
}): Promise<DriveSyncResult> {
  const {
    accessToken,
    folderId = DEFAULT_DRIVE_ROOT_FOLDER_ID,
    buscarEnTodoDrive = true,
    minutasExistentes,
    ai,
    model,
  } = params;

  const carpetaRaizId = (folderId || DEFAULT_DRIVE_ROOT_FOLDER_ID).trim();
  let carpetaRaizNombre = 'Carpeta Raíz Proyecto';

  const candidatosMap = new Map<string, DriveCandidateFile>();
  let carpetasEscaneadas = 0;

  // 1. Escanear árbol de la carpeta configurada (priorizando carpetas de minutas)
  try {
    const metaRaiz = await driveFetchJson<DriveFileItem>(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
        carpetaRaizId
      )}?fields=id,name,mimeType&supportsAllDrives=true`,
      accessToken
    );
    if (metaRaiz?.name) carpetaRaizNombre = metaRaiz.name;

    const cola: Array<{ id: string; ruta: string; profundidad: number; esCarpetaMinuta: boolean }> = [
      {
        id: carpetaRaizId,
        ruta: carpetaRaizNombre,
        profundidad: 0,
        esCarpetaMinuta: normalizarTextoSimple(carpetaRaizNombre).includes('minuta'),
      },
    ];
    const visitadas = new Set<string>();
    const MAX_CARPETAS = 90;
    const tInicio = Date.now();

    while (cola.length > 0 && carpetasEscaneadas < MAX_CARPETAS && Date.now() - tInicio < 25000) {
      const actual = cola.shift()!;
      if (visitadas.has(actual.id)) continue;
      visitadas.add(actual.id);
      carpetasEscaneadas++;

      const hijos = await listarHijosCarpetaDrive(actual.id, accessToken);
      const subcarpetas: Array<{ id: string; name: string; prio: number }> = [];

      for (const item of hijos) {
        if (item.mimeType === MIME_FOLDER) {
          const prio = prioridadCarpeta(item.name);
          if (prio < 99 && actual.profundidad < 5) {
            subcarpetas.push({ id: item.id, name: item.name, prio });
          }
          continue;
        }

        if (!esTipoArchivoSoportado(item)) continue;

        if (actual.esCarpetaMinuta || esNombreOCarpetaDeMinuta(item.name, actual.ruta)) {
          candidatosMap.set(item.id, { file: item, rutaCarpeta: actual.ruta });
        }
      }

      subcarpetas.sort((a, b) => a.prio - b.prio);
      for (const sub of subcarpetas) {
        const rutaSub = `${actual.ruta} / ${sub.name}`;
        const esSubMinuta =
          actual.esCarpetaMinuta || normalizarTextoSimple(sub.name).includes('minuta');
        cola.push({
          id: sub.id,
          ruta: rutaSub,
          profundidad: actual.profundidad + 1,
          esCarpetaMinuta: esSubMinuta,
        });
      }
    }
  } catch (err: any) {
    if (err?.status === 401 || err?.status === 403) {
      throw err;
    }
    console.warn(`[DriveMinutas] Aviso recorriendo carpeta ${carpetaRaizId}:`, err?.message || err);
  }

  // 2. Búsqueda complementaria global en Drive (para minutas compartidas fuera de la carpeta raíz o si no hubo hits)
  if (buscarEnTodoDrive || candidatosMap.size === 0) {
    const globales = await buscarMinutasGlobalesEnDrive(accessToken);
    for (const g of globales) {
      if (!candidatosMap.has(g.file.id)) {
        candidatosMap.set(g.file.id, g);
      }
    }
  }

  const existentesPorDriveId = new Map<string, MinutaReunion>();
  for (const m of minutasExistentes) {
    if (m.driveFileId) {
      existentesPorDriveId.set(m.driveFileId, m);
    }
  }

  const minutasNuevas: MinutaReunion[] = [];
  const compromisosNuevos: CompromisoMinuta[] = [];
  const erroresArchivos: Array<{ nombre: string; error: string }> = [];
  let minutasActualizadas = 0;
  let minutasOmitidasPorExistentes = 0;

  const candidatos = Array.from(candidatosMap.values()).slice(0, 35);

  for (const cand of candidatos) {
    const existente = existentesPorDriveId.get(cand.file.id);
    if (
      existente &&
      existente.driveModifiedTime &&
      cand.file.modifiedTime &&
      existente.driveModifiedTime === cand.file.modifiedTime
    ) {
      minutasOmitidasPorExistentes++;
      continue;
    }

    const sizeBytes = Number(cand.file.size || 0);
    if (sizeBytes > 25 * 1024 * 1024) {
      erroresArchivos.push({
        nombre: cand.file.name,
        error: 'Archivo supera el límite de 25 MB para lectura directa.',
      });
      continue;
    }

    try {
      const descargado = await descargarContenidoArchivoDrive(cand.file, accessToken);
      let texto = await extraerTextoMinutaBuffer(
        descargado.buffer,
        descargado.nombreEfectivo,
        descargado.tipoMimeEfectivo
      );

      if (
        (!texto || texto.trim().length < 25) &&
        descargado.tipoMimeEfectivo === MIME_PDF
      ) {
        const ocr = await extraerTextoConOcrGeminiSiEscaneado(
          descargado.buffer,
          cand.file.name,
          ai,
          model
        );
        if (ocr) texto = ocr;
      }

      if (!texto || texto.trim().length < 10) {
        erroresArchivos.push({
          nombre: cand.file.name,
          error: 'No se pudo extraer texto legible del archivo.',
        });
        continue;
      }

      const fechaDriveIso = cand.file.modifiedTime
        ? normalizarFechaIso(cand.file.modifiedTime.slice(0, 10))
        : undefined;

      const meta = inferirMetadatosMinuta({
        nombreArchivo: cand.file.name,
        fechaReunion: fechaDriveIso,
        contenidoTexto: texto,
      });

      const minutaId = existente?.id || `min_drv_${cand.file.id}`;
      const nuevaMinuta: MinutaReunion = {
        id: minutaId,
        codigo: meta.codigo,
        titulo: meta.titulo,
        fechaReunion: meta.fechaReunion,
        frente: meta.frente,
        participantes: meta.participantes,
        origen: 'drive',
        nombreArchivo: cand.file.name,
        driveFileId: cand.file.id,
        driveUrl: cand.file.webViewLink || `https://drive.google.com/file/d/${cand.file.id}/view`,
        driveRuta: cand.rutaCarpeta,
        driveModifiedTime: cand.file.modifiedTime,
        contenidoTexto: texto.slice(0, 120000),
        fechaCarga: new Date().toLocaleDateString('es-AR'),
      };

      const analisis = await analizarYExtraerCompromisosMinuta({
        minuta: nuevaMinuta,
        ai,
        model,
      });
      nuevaMinuta.resumen = analisis.resumen;

      if (existente) {
        minutasActualizadas++;
        minutasNuevas.push(nuevaMinuta);
      } else {
        minutasNuevas.push(nuevaMinuta);
        compromisosNuevos.push(...analisis.compromisos);
      }
    } catch (err: any) {
      erroresArchivos.push({
        nombre: cand.file.name,
        error: err?.message || 'Error leyendo archivo desde Drive.',
      });
    }
  }

  return {
    carpetaRaizId,
    carpetaRaizNombre,
    carpetasEscaneadas,
    archivosDetectados: candidatosMap.size,
    minutasNuevas,
    minutasActualizadas,
    minutasOmitidasPorExistentes,
    compromisosNuevos,
    erroresArchivos,
  };
}
