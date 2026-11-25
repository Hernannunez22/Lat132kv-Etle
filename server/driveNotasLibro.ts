import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import * as XLSX from 'xlsx';
import { NotaLibro } from '../src/types';
import { DEFAULT_DRIVE_ROOT_FOLDER_ID, DriveFileItem } from './driveMinutas';
import { extraerTextoMinutaBuffer, normalizarFechaIso } from './minutasManager';
import { analizarNotaLibroConIA, recalcularHilosYRespuestas } from './notasLibroManager';
import { generarContenidoConFallback } from './geminiClient';

const MIME_FOLDER = 'application/vnd.google-apps.folder';
const MIME_GOOGLE_DOC = 'application/vnd.google-apps.document';
const MIME_GOOGLE_SHEET = 'application/vnd.google-apps.spreadsheet';
const MIME_PDF = 'application/pdf';
const MIME_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const MIME_TXT = 'text/plain';

export interface NotasLibroDriveSyncResult {
  carpetaRaizId: string;
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
}

function normalizar(txt: string): string {
  return (txt || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function esArchivoSoportadoNotaLibro(file: DriveFileItem): boolean {
  const lower = (file.name || '').toLowerCase();
  if (lower.startsWith('~$') || lower.startsWith('._')) return false;
  return (
    file.mimeType === MIME_PDF ||
    file.mimeType === MIME_GOOGLE_DOC ||
    file.mimeType === MIME_GOOGLE_SHEET ||
    file.mimeType === MIME_DOCX ||
    file.mimeType === MIME_XLSX ||
    file.mimeType === MIME_TXT ||
    lower.endsWith('.pdf') ||
    lower.endsWith('.docx') ||
    lower.endsWith('.xlsx') ||
    lower.endsWith('.xls') ||
    lower.endsWith('.txt')
  );
}

export function tieneCodigoDeNotaEnNombre(nombreArchivo: string): boolean {
  const sinExt = (nombreArchivo || '').replace(/\.[^/.]+$/, '').trim();
  if (!sinExt) return false;
  const n = normalizar(sinExt);

  // Códigos estándar de Libro de Comunicaciones: NP-015, NP 15, NP015, OS-022, NS-010, NC-004, NT-008, ND-003
  if (
    /(?:^|[^a-z0-9])(np|os|ns|nc|nt|nd)\s*(?:n[°ºo.]*)?\s*[-_./\s]?\s*(?:20\d{2}\s*[-_./\s]?)?\d{1,4}(?:$|[^0-9])/i.test(
      n
    )
  ) {
    return true;
  }

  // Abreviaturas con puntos: N.P. 15, O.S. 22, N.S. 10
  if (
    /(?:^|[^a-z0-9])(n\.p\.|o\.s\.|n\.s\.)\s*(?:n[°ºo.]*)?\s*[-_./\s]?\s*\d{1,4}(?:$|[^0-9])/i.test(
      n
    )
  ) {
    return true;
  }

  // Frases completas con número de nota: "Nota de Pedido N° 15", "Orden de Servicio 022", "Nota de Servicio 10", "Nota N° 05"
  if (
    /\b(?:nota\s+de\s+pedido|nota\s+pedido|orden\s+de\s+servicio|orden\s+servicio|nota\s+de\s+servicio|nota\s+servicio|nota\s+(?:n[°ºo.]|nro\.?))\s*(?:n[°ºo.]*|nro\.?)?\s*[-_./\s]*\d{1,4}(?:$|[^0-9])/i.test(
      n
    )
  ) {
    return true;
  }

  return false;
}

function prioridadCarpetaNotas(nombreCarpeta: string): number {
  const n = normalizar(nombreCarpeta);
  if (n.includes('libro') || n.includes('comunicacion')) return 0;
  if (n.includes('nota de pedido') || n.includes('orden de servicio') || n.includes('nota de servicio')) return 1;
  if (n.includes('notas') || n.includes('transnoa') || n.includes('gestion') || n.includes('contrato')) return 2;
  if (n.includes('plano') || n.includes('elenco')) return 90;
  return 6;
}

interface ColaPendienteNotasLibro {
  carpetaRaizId: string;
  carpetaRaizNombre: string;
  archivosDetectados: number;
  archivosOmitidosSinCodigo: number;
  carpetasEscaneadas: number;
  pendientes: Array<{ file: DriveFileItem; rutaCarpeta: string }>;
  createdAt: number;
}

const colasPendientesNotasLibro = new Map<string, ColaPendienteNotasLibro>();
const COLA_TTL_MS = 15 * 60 * 1000;

function normalizarDriveFolderId(raw?: string): string {
  const s = (raw || '').trim();
  if (!s) return DEFAULT_DRIVE_ROOT_FOLDER_ID;
  const urlMatch = s.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (urlMatch) return urlMatch[1];
  const idParamMatch = s.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idParamMatch) return idParamMatch[1];
  return s.replace(/[^a-zA-Z0-9_-]/g, '') || DEFAULT_DRIVE_ROOT_FOLDER_ID;
}

async function driveFetchJson<T>(url: string, accessToken: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(15000),
  });
  const rawText = await res.text().catch(() => '');
  if (!res.ok) {
    let msg = rawText;
    try {
      const j = JSON.parse(rawText);
      msg = j?.error?.message || rawText;
    } catch {
      if (/^\s*</.test(rawText)) {
        msg = `Google Drive devolvió HTML en lugar de JSON (HTTP ${res.status}). Verifica tu sesión de Google.`;
      }
    }
    const error = new Error(msg || `Google Drive API HTTP ${res.status}`) as Error & { status?: number };
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

async function listarHijosCarpeta(folderId: string, accessToken: string): Promise<DriveFileItem[]> {
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
    if (Array.isArray(data.files)) items.push(...data.files);
    pageToken = data.nextPageToken || '';
  } while (pageToken && items.length < 1000);

  return items;
}

async function buscarNotasGlobalesEnDrive(
  accessToken: string
): Promise<Array<{ file: DriveFileItem; rutaCarpeta: string }>> {
  const encontrados = new Map<string, { file: DriveFileItem; rutaCarpeta: string }>();

  // 1. Buscar carpetas dedicadas a Notas de Libro / Comunicaciones / NP / OS / NS
  try {
    const qFolders = encodeURIComponent(
      `mimeType = '${MIME_FOLDER}' and trashed = false and (` +
        `name contains 'Libro' or name contains 'libro' or ` +
        `name contains 'Notas' or name contains 'notas' or ` +
        `name contains 'Comunicaciones' or name contains 'comunicaciones' or ` +
        `name contains 'Orden de Servicio' or name contains 'Ordenes de Servicio' or ` +
        `name contains 'Nota de Pedido' or name contains 'Notas de Pedido' or ` +
        `name contains 'Nota de Servicio' or name contains 'Notas de Servicio'` +
        `)`
    );
    const fields = encodeURIComponent('files(id,name,mimeType,modifiedTime)');
    const resFolders = await driveFetchJson<{ files?: DriveFileItem[] }>(
      `https://www.googleapis.com/drive/v3/files?q=${qFolders}&fields=${fields}&pageSize=30&supportsAllDrives=true&includeItemsFromAllDrives=true`,
      accessToken
    );

    for (const folder of resFolders.files || []) {
      const hijos = await listarHijosCarpeta(folder.id, accessToken);
      for (const h of hijos) {
        if (h.mimeType !== MIME_FOLDER && esArchivoSoportadoNotaLibro(h) && tieneCodigoDeNotaEnNombre(h.name)) {
          encontrados.set(h.id, { file: h, rutaCarpeta: folder.name });
        } else if (h.mimeType === MIME_FOLDER) {
          const subHijos = await listarHijosCarpeta(h.id, accessToken);
          for (const sh of subHijos) {
            if (sh.mimeType !== MIME_FOLDER && esArchivoSoportadoNotaLibro(sh) && tieneCodigoDeNotaEnNombre(sh.name)) {
              encontrados.set(sh.id, { file: sh, rutaCarpeta: `${folder.name} / ${h.name}` });
            }
          }
        }
      }
    }
  } catch (err) {
    console.warn('[DriveNotasLibro] Aviso buscando carpetas globales:', err);
  }

  // 2. Buscar archivos individuales NP / OS / NS / Notas de Pedido / Ordenes de Servicio
  try {
    const qFiles = encodeURIComponent(
      `mimeType != '${MIME_FOLDER}' and trashed = false and (` +
        `name contains 'Nota de Pedido' or name contains 'NOTA DE PEDIDO' or ` +
        `name contains 'Orden de Servicio' or name contains 'ORDEN DE SERVICIO' or ` +
        `name contains 'Nota de Servicio' or name contains 'NOTA DE SERVICIO' or ` +
        `name contains 'NP-' or name contains 'NP ' or ` +
        `name contains 'OS-' or name contains 'OS ' or ` +
        `name contains 'NS-' or name contains 'NS ' or ` +
        `name contains 'TRANSNOA'` +
        `)`
    );
    const fields = encodeURIComponent(
      'files(id,name,mimeType,modifiedTime,webViewLink,size,parents)'
    );
    const resFiles = await driveFetchJson<{ files?: DriveFileItem[] }>(
      `https://www.googleapis.com/drive/v3/files?q=${qFiles}&fields=${fields}&pageSize=120&orderBy=modifiedTime desc&supportsAllDrives=true&includeItemsFromAllDrives=true`,
      accessToken
    );

    for (const f of resFiles.files || []) {
      if (esArchivoSoportadoNotaLibro(f) && tieneCodigoDeNotaEnNombre(f.name) && !encontrados.has(f.id)) {
        encontrados.set(f.id, { file: f, rutaCarpeta: 'Búsqueda en Google Drive' });
      }
    }
  } catch (err) {
    console.warn('[DriveNotasLibro] Aviso buscando archivos globales:', err);
  }

  return Array.from(encontrados.values());
}

async function descargarTextoNotaDrive(
  file: DriveFileItem,
  accessToken: string,
  ai: GoogleGenAI | null,
  model: string
): Promise<string> {
  if (file.mimeType === MIME_GOOGLE_DOC) {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
        file.id
      )}/export?mimeType=text/plain&supportsAllDrives=true`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(15000),
      }
    );
    if (res.ok) return (await res.text()).trim();
  }

  if (file.mimeType === MIME_GOOGLE_SHEET) {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
        file.id
      )}/export?mimeType=text/csv&supportsAllDrives=true`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(15000),
      }
    );
    if (res.ok) return (await res.text()).trim();
  }

  const resMedia = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
      file.id
    )}?alt=media&supportsAllDrives=true`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(18000),
    }
  );
  if (!resMedia.ok) {
    throw new Error(`No se pudo descargar "${file.name}" (HTTP ${resMedia.status})`);
  }

  const buffer = Buffer.from(await resMedia.arrayBuffer());
  const lower = (file.name || '').toLowerCase();

  if (file.mimeType === MIME_XLSX || lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const hojas: string[] = [];
    for (const sheetName of wb.SheetNames.slice(0, 6)) {
      const csv = XLSX.utils.sheet_to_csv(wb.Sheets[sheetName]);
      if (csv.trim()) hojas.push(`[Hoja ${sheetName}]\n${csv.trim()}`);
    }
    return hojas.join('\n\n').trim();
  }

  let texto = await extraerTextoMinutaBuffer(buffer, file.name, file.mimeType || MIME_PDF);

  if (
    (!texto || texto.trim().length < 30) &&
    (file.mimeType === MIME_PDF || lower.endsWith('.pdf')) &&
    ai &&
    buffer.length > 0 &&
    buffer.length <= 12 * 1024 * 1024
  ) {
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
              `Transcribe íntegramente esta nota del Libro de Comunicaciones ("${file.name}") incluyendo encabezado, número/código de nota, fecha, emisor (quién envía), destinatario/receptor, referencias a otras notas, preguntas/pedidos y respuestas/resoluciones.`,
          },
        ],
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
        timeoutMs: 15000,
      });
      if (resp.text?.trim()) texto = resp.text.trim();
    } catch (err) {
      console.warn(`[DriveNotasLibro] OCR Gemini fallback falló para "${file.name}":`, err);
    }
  }

  return texto.trim();
}

export async function sincronizarNotasLibroDesdeGoogleDrive(params: {
  accessToken: string;
  folderId?: string;
  notasExistentes: NotaLibro[];
  forzarRelectura?: boolean;
  continuarLote?: boolean;
  ai: GoogleGenAI | null;
  model: string;
}): Promise<NotasLibroDriveSyncResult> {
  const {
    accessToken,
    folderId = DEFAULT_DRIVE_ROOT_FOLDER_ID,
    notasExistentes,
    forzarRelectura = false,
    continuarLote = false,
    ai,
    model,
  } = params;

  const carpetaRaizId = normalizarDriveFolderId(folderId);
  const esCarpetaEspecifica = carpetaRaizId !== DEFAULT_DRIVE_ROOT_FOLDER_ID;
  let carpetaRaizNombre = 'Carpeta Raíz Proyecto';
  let carpetasEscaneadas = 0;
  let archivosDetectados = 0;
  let archivosOmitidosSinCodigo = 0;
  let notasOmitidasPorExistentes = 0;

  const existentesPorDriveId = new Map<string, NotaLibro>();
  for (const n of notasExistentes) {
    if (n.driveFileId) existentesPorDriveId.set(n.driveFileId, n);
  }

  const mapaResultado = new Map<string, NotaLibro>();
  for (const n of notasExistentes) {
    mapaResultado.set(n.id, n);
  }

  // Reusar cola pendiente si es continuación de lote (evita re-escanear carpetas de Drive)
  let colaActiva = continuarLote ? colasPendientesNotasLibro.get(carpetaRaizId) : undefined;
  if (colaActiva && Date.now() - colaActiva.createdAt > COLA_TTL_MS) {
    colasPendientesNotasLibro.delete(carpetaRaizId);
    colaActiva = undefined;
  }

  let pendientesDeProceso: Array<{ file: DriveFileItem; rutaCarpeta: string }> = [];

  if (colaActiva && colaActiva.pendientes.length > 0) {
    carpetaRaizNombre = colaActiva.carpetaRaizNombre;
    archivosDetectados = colaActiva.archivosDetectados;
    archivosOmitidosSinCodigo = colaActiva.archivosOmitidosSinCodigo;
    carpetasEscaneadas = colaActiva.carpetasEscaneadas;
    pendientesDeProceso = [...colaActiva.pendientes];
  } else {
    const candidatosMap = new Map<string, { file: DriveFileItem; rutaCarpeta: string }>();

    try {
      const metaRaiz = await driveFetchJson<DriveFileItem>(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
          carpetaRaizId
        )}?fields=id,name,mimeType&supportsAllDrives=true`,
        accessToken
      );
      if (metaRaiz?.name) carpetaRaizNombre = metaRaiz.name;

      const cola: Array<{ id: string; ruta: string; prof: number }> = [
        {
          id: carpetaRaizId,
          ruta: carpetaRaizNombre,
          prof: 0,
        },
      ];
      const visitadas = new Set<string>();
      const MAX_CARPETAS = 120;
      const tInicioScan = Date.now();

      while (cola.length > 0 && carpetasEscaneadas < MAX_CARPETAS && Date.now() - tInicioScan < 12000) {
        const loteCarpetas: typeof cola = [];
        while (cola.length > 0 && loteCarpetas.length < 4 && carpetasEscaneadas + loteCarpetas.length < MAX_CARPETAS) {
          const item = cola.shift()!;
          if (!visitadas.has(item.id)) {
            visitadas.add(item.id);
            loteCarpetas.push(item);
          }
        }
        if (loteCarpetas.length === 0) break;

        const resultadosLote = await Promise.all(
          loteCarpetas.map(async actual => {
            try {
              const hijos = await listarHijosCarpeta(actual.id, accessToken);
              return { actual, hijos };
            } catch {
              return { actual, hijos: [] as DriveFileItem[] };
            }
          })
        );
        carpetasEscaneadas += loteCarpetas.length;

        const subcarpetas: Array<{ id: string; ruta: string; prof: number; prio: number }> = [];
        for (const { actual, hijos } of resultadosLote) {
          for (const item of hijos) {
            if (item.mimeType === MIME_FOLDER) {
              const prio = prioridadCarpetaNotas(item.name);
              if (prio < 95 && actual.prof < 4) {
                subcarpetas.push({
                  id: item.id,
                  ruta: `${actual.ruta} / ${item.name}`,
                  prof: actual.prof + 1,
                  prio,
                });
              }
              continue;
            }
            if (!esArchivoSoportadoNotaLibro(item)) continue;
            if (tieneCodigoDeNotaEnNombre(item.name)) {
              candidatosMap.set(item.id, { file: item, rutaCarpeta: actual.ruta });
            } else {
              archivosOmitidosSinCodigo++;
            }
          }
        }

        subcarpetas.sort((a, b) => a.prio - b.prio);
        for (const sub of subcarpetas) {
          cola.push({
            id: sub.id,
            ruta: sub.ruta,
            prof: sub.prof,
          });
        }
      }
    } catch (err: any) {
      if (err?.status === 401 || err?.status === 403) throw err;
      if (esCarpetaEspecifica) {
        const customErr = new Error(
          `No se pudo acceder a la carpeta de Google Drive (${carpetaRaizId}). Verifica que el código o enlace sea correcto y tengas permiso de lectura.`
        ) as Error & { status?: number };
        customErr.status = err?.status || 404;
        throw customErr;
      }
      console.warn('[DriveNotasLibro] Aviso escaneando carpeta raíz:', err?.message || err);
    }

    // Solo buscar globalmente si se usa la carpeta raíz por defecto y halló muy pocas notas
    if (!esCarpetaEspecifica && candidatosMap.size < 3) {
      const globales = await buscarNotasGlobalesEnDrive(accessToken);
      for (const g of globales) {
        if (!candidatosMap.has(g.file.id)) {
          candidatosMap.set(g.file.id, g);
        }
      }
    }

    // Al forzar relectura completa, limpiar PDFs previos de Drive sin código de nota (respetando ediciones manuales)
    if (forzarRelectura) {
      for (const [idNota, notaExistente] of Array.from(mapaResultado.entries())) {
        if (
          notaExistente.origen === 'drive' &&
          !notaExistente.manualOverride &&
          !tieneCodigoDeNotaEnNombre(notaExistente.nombreArchivo || '')
        ) {
          mapaResultado.delete(idNota);
        }
      }
    }

    archivosDetectados = candidatosMap.size;
    const todosCandidatos = Array.from(candidatosMap.values());

    for (const cand of todosCandidatos) {
      const existente = existentesPorDriveId.get(cand.file.id);
      const esIgualEnDrive =
        existente &&
        existente.driveModifiedTime &&
        cand.file.modifiedTime &&
        existente.driveModifiedTime === cand.file.modifiedTime;

      const omitirPorManual = Boolean(existente?.manualOverride);
      if (omitirPorManual || (!forzarRelectura && esIgualEnDrive)) {
        notasOmitidasPorExistentes++;
        continue;
      }
      pendientesDeProceso.push(cand);
    }
  }

  const MAX_NOTAS_LOTE = 10;
  const BUDGET_PROCESO_MS = 20000;
  const CONCURRENCIA = 4;

  const candidatosLote = pendientesDeProceso.slice(0, MAX_NOTAS_LOTE);
  const colaDespuesDeLote = pendientesDeProceso.slice(MAX_NOTAS_LOTE);
  const noIniciadosPorTiempo: Array<{ file: DriveFileItem; rutaCarpeta: string }> = [];

  const erroresArchivos: Array<{ nombre: string; error: string }> = [];
  let notasNuevas = 0;
  let notasActualizadas = 0;

  let cursor = 0;
  const tInicioProceso = Date.now();

  const trabajador = async () => {
    while (true) {
      const idx = cursor++;
      if (idx >= candidatosLote.length) break;
      const cand = candidatosLote[idx];

      if (idx > 0 && Date.now() - tInicioProceso > BUDGET_PROCESO_MS) {
        noIniciadosPorTiempo.push(cand);
        continue;
      }

      const existente = existentesPorDriveId.get(cand.file.id);
      const sizeBytes = Number(cand.file.size || 0);
      if (sizeBytes > 25 * 1024 * 1024) {
        erroresArchivos.push({
          nombre: cand.file.name,
          error: 'Archivo supera el límite de 25 MB para lectura directa.',
        });
        continue;
      }

      try {
        const texto = await descargarTextoNotaDrive(cand.file, accessToken, ai, model);
        if (!texto || texto.trim().length < 10) {
          erroresArchivos.push({
            nombre: cand.file.name,
            error: 'No se pudo extraer texto legible de la nota.',
          });
          continue;
        }

        const fechaDrive = cand.file.modifiedTime
          ? normalizarFechaIso(cand.file.modifiedTime.slice(0, 10))
          : undefined;

        const notaId = existente?.id || `nl_drv_${cand.file.id}`;
        const procesada = await analizarNotaLibroConIA({
          id: notaId,
          nombreArchivo: cand.file.name,
          rutaCarpeta: cand.rutaCarpeta,
          texto,
          fechaDrive,
          origen: 'drive',
          driveFileId: cand.file.id,
          driveUrl: cand.file.webViewLink || `https://drive.google.com/file/d/${cand.file.id}/view`,
          driveModifiedTime: cand.file.modifiedTime,
          ai,
          model,
        });

        mapaResultado.set(notaId, procesada);
        if (existente) notasActualizadas++;
        else notasNuevas++;
      } catch (err: any) {
        erroresArchivos.push({
          nombre: cand.file.name,
          error: err?.message || 'Error leyendo nota desde Drive.',
        });
      }
    }
  };

  const numWorkers = Math.min(CONCURRENCIA, Math.max(1, candidatosLote.length));
  await Promise.all(Array.from({ length: numWorkers }, () => trabajador()));

  const pendientesRestantes = [...noIniciadosPorTiempo, ...colaDespuesDeLote];
  if (pendientesRestantes.length > 0) {
    colasPendientesNotasLibro.set(carpetaRaizId, {
      carpetaRaizId,
      carpetaRaizNombre,
      archivosDetectados,
      archivosOmitidosSinCodigo,
      carpetasEscaneadas,
      pendientes: pendientesRestantes,
      createdAt: Date.now(),
    });
  } else {
    colasPendientesNotasLibro.delete(carpetaRaizId);
  }

  const notasRecalculadas = recalcularHilosYRespuestas(Array.from(mapaResultado.values()));

  return {
    carpetaRaizId,
    carpetaRaizNombre,
    carpetasEscaneadas,
    archivosDetectados,
    archivosOmitidosSinCodigo,
    notasNuevas,
    notasActualizadas,
    notasOmitidasPorExistentes,
    archivosPendientes: pendientesRestantes.length,
    escaneoTruncado: pendientesRestantes.length > 0,
    notasLibro: notasRecalculadas,
    erroresArchivos,
  };
}
