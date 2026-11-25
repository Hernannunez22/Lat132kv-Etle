import fs from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { Interferencia } from '../src/types';
import { DEFAULT_DRIVE_ROOT_FOLDER_ID, DriveFileItem } from './driveMinutas';
import { extraerTextoMinutaBuffer, normalizarFechaIso } from './minutasManager';
import { CACHE_DIR, asegurarDirectorioCache } from './pliegoProcessor';
import { generarContenidoConFallback } from './geminiClient';

const STORE_INTERFERENCIAS_PATH = path.join(CACHE_DIR, 'interferencias_drive_store.json');
const SIG_CACHE_INTERFERENCIAS_PATH = path.join(CACHE_DIR, 'interferencias_sig_cache.json');

const MIME_FOLDER = 'application/vnd.google-apps.folder';
const MIME_GOOGLE_DOC = 'application/vnd.google-apps.document';
const MIME_GOOGLE_SHEET = 'application/vnd.google-apps.spreadsheet';
const MIME_PDF = 'application/pdf';
const MIME_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const MIME_TXT = 'text/plain';

export interface InterferenciasDriveSyncResult {
  carpetaInterferenciasId: string;
  carpetaInterferenciasNombre: string;
  subcarpetasDetectadas: number;
  subcarpetasProcesadas: number;
  subcarpetasOmitidasPorCache?: number;
  interferencias: Interferencia[];
  erroresCarpetas: Array<{ carpeta: string; error: string }>;
}

function cargarSigCacheInterferencias(): Record<string, string> {
  try {
    asegurarDirectorioCache();
    if (fs.existsSync(SIG_CACHE_INTERFERENCIAS_PATH)) {
      const parsed = JSON.parse(fs.readFileSync(SIG_CACHE_INTERFERENCIAS_PATH, 'utf8'));
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch {}
  return {};
}

function guardarSigCacheInterferencias(cache: Record<string, string>) {
  try {
    asegurarDirectorioCache();
    fs.writeFileSync(SIG_CACHE_INTERFERENCIAS_PATH, JSON.stringify(cache, null, 2), 'utf8');
  } catch {}
}

export function cargarStoreInterferencias(): Interferencia[] {
  try {
    asegurarDirectorioCache();
    if (fs.existsSync(STORE_INTERFERENCIAS_PATH)) {
      const raw = fs.readFileSync(STORE_INTERFERENCIAS_PATH, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (err) {
    console.warn('[DriveInterferencias] Error cargando store en disco:', err);
  }
  return [];
}

export function guardarStoreInterferencias(lista: Interferencia[]) {
  try {
    asegurarDirectorioCache();
    fs.writeFileSync(STORE_INTERFERENCIAS_PATH, JSON.stringify(lista, null, 2), 'utf8');
  } catch (err) {
    console.warn('[DriveInterferencias] Error guardando store en disco:', err);
  }
}

function normalizar(txt: string): string {
  return (txt || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function esArchivoSoportadoCruce(file: DriveFileItem): boolean {
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

async function driveFetchJson<T>(url: string, accessToken: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
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
    if (Array.isArray(data.files)) {
      items.push(...data.files);
    }
    pageToken = data.nextPageToken || '';
  } while (pageToken && items.length < 1000);

  return items;
}

async function ubicarCarpetaInterferencias(
  rootFolderId: string,
  accessToken: string
): Promise<{ id: string; name: string } | null> {
  try {
    const meta = await driveFetchJson<DriveFileItem>(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
        rootFolderId
      )}?fields=id,name,mimeType&supportsAllDrives=true`,
      accessToken
    );
    if (meta?.name && normalizar(meta.name).includes('interferenc')) {
      return { id: meta.id, name: meta.name };
    }

    // BFS en la carpeta raíz del proyecto buscando la carpeta "interferencias"
    const cola: Array<{ id: string; name: string; depth: number }> = [
      { id: rootFolderId, name: meta?.name || 'Raíz', depth: 0 },
    ];
    const visitadas = new Set<string>();
    let carpetasVistas = 0;

    while (cola.length > 0 && carpetasVistas < 85) {
      const actual = cola.shift()!;
      if (visitadas.has(actual.id)) continue;
      visitadas.add(actual.id);
      carpetasVistas++;

      const hijos = await listarHijosCarpeta(actual.id, accessToken);
      const subcarpetas = hijos.filter(h => h.mimeType === MIME_FOLDER);

      // Primero coincidencia exacta o por inclusión de "interferencias"
      const exacta = subcarpetas.find(s => normalizar(s.name) === 'interferencias');
      if (exacta) return { id: exacta.id, name: exacta.name };

      const parcial = subcarpetas.find(s => normalizar(s.name).includes('interferenc'));
      if (parcial) return { id: parcial.id, name: parcial.name };

      if (actual.depth < 3) {
        subcarpetas.sort((a, b) => {
          const na = normalizar(a.name);
          const nb = normalizar(b.name);
          const pa = na.includes('cruce') || na.includes('ingenier') || na.includes('permiso') ? 0 : 1;
          const pb = nb.includes('cruce') || nb.includes('ingenier') || nb.includes('permiso') ? 0 : 1;
          return pa - pb;
        });
        for (const sub of subcarpetas) {
          cola.push({ id: sub.id, name: sub.name, depth: actual.depth + 1 });
        }
      }
    }
  } catch (err: any) {
    if (err?.status === 401 || err?.status === 403) throw err;
    console.warn('[DriveInterferencias] Aviso ubicando carpeta en raíz:', err?.message || err);
  }

  // Fallback global en todo Drive accesible
  try {
    const q = encodeURIComponent(
      `mimeType = '${MIME_FOLDER}' and trashed = false and (name contains 'interferenc' or name contains 'Interferenc' or name contains 'INTERFERENC')`
    );
    const fields = encodeURIComponent('files(id,name,mimeType,modifiedTime)');
    const res = await driveFetchJson<{ files?: DriveFileItem[] }>(
      `https://www.googleapis.com/drive/v3/files?q=${q}&fields=${fields}&pageSize=20&supportsAllDrives=true&includeItemsFromAllDrives=true`,
      accessToken
    );
    const carpetas = res.files || [];
    const exact = carpetas.find(f => normalizar(f.name) === 'interferencias');
    if (exact) return { id: exact.id, name: exact.name };
    if (carpetas[0]) return { id: carpetas[0].id, name: carpetas[0].name };
  } catch (err: any) {
    if (err?.status === 401 || err?.status === 403) throw err;
  }

  return null;
}

interface ArchivoCruceCandidato {
  file: DriveFileItem;
  rutaRelativa: string;
  puntajeSolicitud: number;
  puntajeRespuesta: number;
}

function puntuarArchivoSolicitud(file: DriveFileItem, rutaRelativa: string): {
  solicitud: number;
  respuesta: number;
} {
  const n = normalizar(file.name);
  const r = normalizar(rutaRelativa);
  let scoreSol = 0;
  let scoreResp = 0;

  const tieneSolicitud = n.includes('solicitud') || r.includes('solicitud');
  const tieneCruce =
    n.includes('cruce') ||
    n.includes('paralelismo') ||
    n.includes('interferenc') ||
    r.includes('solicitud');
  const tieneNota = n.includes('nota') || n.includes('presentacion') || n.includes('permiso');

  if (n.includes('solicitud') && n.includes('cruce')) scoreSol += 140;
  else if (tieneSolicitud && tieneCruce) scoreSol += 110;
  else if (n.includes('solicitud')) scoreSol += 90;
  else if (r.includes('solicitud')) scoreSol += 75;

  if (tieneCruce) scoreSol += 35;
  if (tieneNota) scoreSol += 25;
  if (n.includes('memoria') || n.includes('informe')) scoreSol += 15;

  // Puntuación para respuestas, autorizaciones, no objeciones, observaciones o devoluciones
  if (
    n.includes('no objecion') ||
    n.includes('autorizacion') ||
    n.includes('aprobacion') ||
    n.includes('factibilidad') ||
    n.includes('permiso otorgado')
  ) {
    scoreResp += 130;
  }
  if (
    n.includes('respuesta') ||
    n.includes('contestacion') ||
    n.includes('observacion') ||
    n.includes('devolucion') ||
    n.includes('acta') ||
    r.includes('respuesta') ||
    r.includes('observacion')
  ) {
    scoreResp += 95;
  }
  if (n.includes('checklist') || n.includes('requisitos') || n.includes('faltante') || n.includes('expediente')) {
    scoreResp += 60;
    scoreSol += 12;
  }

  // Preferir PDF/DOCX/Google Doc frente a hojas sueltas
  if (file.mimeType === MIME_PDF || n.endsWith('.pdf')) {
    scoreSol += 8;
    scoreResp += 8;
  } else if (file.mimeType === MIME_DOCX || file.mimeType === MIME_GOOGLE_DOC || n.endsWith('.docx')) {
    scoreSol += 6;
    scoreResp += 6;
  }

  return { solicitud: scoreSol, respuesta: scoreResp };
}

async function listarArchivosDentroSubcarpetaCruce(
  subcarpeta: DriveFileItem,
  accessToken: string
): Promise<{ candidatos: ArchivoCruceCandidato[]; todosNombres: string[] }> {
  const candidatos: ArchivoCruceCandidato[] = [];
  const todosNombres: string[] = [];
  const cola: Array<{ id: string; ruta: string; depth: number }> = [
    { id: subcarpeta.id, ruta: subcarpeta.name, depth: 0 },
  ];
  const visitadas = new Set<string>();

  while (cola.length > 0 && visitadas.size < 25) {
    const actual = cola.shift()!;
    if (visitadas.has(actual.id)) continue;
    visitadas.add(actual.id);

    const hijos = await listarHijosCarpeta(actual.id, accessToken);
    for (const h of hijos) {
      if (h.mimeType === MIME_FOLDER) {
        if (actual.depth < 3) {
          cola.push({ id: h.id, ruta: `${actual.ruta} / ${h.name}`, depth: actual.depth + 1 });
        }
        continue;
      }
      todosNombres.push(h.name);
      if (esArchivoSoportadoCruce(h)) {
        const scores = puntuarArchivoSolicitud(h, actual.ruta);
        candidatos.push({
          file: h,
          rutaRelativa: actual.ruta,
          puntajeSolicitud: scores.solicitud,
          puntajeRespuesta: scores.respuesta,
        });
      }
    }
  }

  candidatos.sort((a, b) => b.puntajeSolicitud - a.puntajeSolicitud);
  return { candidatos, todosNombres };
}

async function descargarYExtraerTextoArchivoCruce(
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
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (res.ok) {
      return (await res.text()).trim();
    }
  }

  if (file.mimeType === MIME_GOOGLE_SHEET) {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
        file.id
      )}/export?mimeType=text/csv&supportsAllDrives=true`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (res.ok) {
      return (await res.text()).trim();
    }
  }

  const sizeBytes = Number(file.size || 0);
  if (sizeBytes > 25 * 1024 * 1024) {
    return '';
  }

  const resMedia = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
      file.id
    )}?alt=media&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
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
      const sheet = wb.Sheets[sheetName];
      const csv = XLSX.utils.sheet_to_csv(sheet);
      if (csv.trim()) {
        hojas.push(`[Hoja ${sheetName}]\n${csv.trim()}`);
      }
    }
    return hojas.join('\n\n').trim();
  }

  let texto = await extraerTextoMinutaBuffer(buffer, file.name, file.mimeType || MIME_PDF);

  if (
    (!texto || texto.trim().length < 30) &&
    (file.mimeType === MIME_PDF || lower.endsWith('.pdf')) &&
    ai &&
    buffer.length > 0 &&
    buffer.length <= 18 * 1024 * 1024
  ) {
    try {
      const { response: ocrResp } = await generarContenidoConFallback({
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
              `Transcribe fielmente el contenido completo de esta solicitud de cruce/interferencia ("${file.name}"): destinatario/empresa, objeto del cruce, progresivas/piquetes/vanos, normativa citada, fecha, observaciones o documentación pendiente.`,
          },
        ],
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
        timeoutMs: 20000,
      });
      if (ocrResp.text?.trim()) {
        texto = ocrResp.text.trim();
      }
    } catch (err) {
      console.warn(`[DriveInterferencias] Fallback OCR fallido para "${file.name}":`, err);
    }
  }

  return texto.trim();
}

function extraerConHeuristicaLocal(params: {
  carpetaNombre: string;
  archivoNombre: string;
  texto: string;
  todosArchivos: string[];
  fechaDrive?: string;
}): {
  empresa: string;
  tipoInterferencia: string;
  normativa: string;
  estadoTramite: string;
  vanosAfectados: string;
  faltantes: string[];
  fechaDocumento: string;
  resumenSolicitud: string;
} {
  const { carpetaNombre, archivoNombre, texto, todosArchivos, fechaDrive } = params;
  const limpio = (texto || '').replace(/\r/g, '');

  const empresaMatch =
    limpio.match(/(?:Señores|Sres\.?|Destinatario|Organismo|Empresa|Ente)\s*[:\-]?\s*([^\n]{4,90})/i) ||
    limpio.match(/(?:Transportadora de Gas del Norte|TGN|Gasnor|Vialidad Nacional|DNV|Dirección Provincial de Vialidad|DPV|Trenes Argentinos|Belgrano Cargas|EDET|TRANSNOA|Recursos Hídricos|DPA|Telecom|Movistar|Claro)[^\n]{0,50}/i);

  const empresa = empresaMatch
    ? (empresaMatch[1] || empresaMatch[0]).replace(/\s+/g, ' ').trim().slice(0, 140)
    : carpetaNombre;

  const tipoMatch = limpio.match(
    /(?:Asunto|Ref\.?|Referencia|Objeto|Solicitud de(?:\s+permiso\s+de)?\s+cruce)\s*[:\-]?\s*([^\n]{6,180})/i
  );
  const tipoInterferencia = tipoMatch
    ? (tipoMatch[1] || tipoMatch[0]).replace(/\s+/g, ' ').trim().slice(0, 220)
    : `Solicitud de cruce - ${carpetaNombre}`;

  const normMatches = limpio.match(
    /\b(?:NAG[-\s]?\d+|AEA\s*\d+|Res\.?\s*(?:DNV|ENARGAS|ENRE)?\s*\d+(?:\/\d+)?|IRAM\s*\d+|NEFA|Ley\s*\d+|Decreto\s*\d+)\b/gi
  );
  const normativa = normMatches
    ? Array.from(new Set(normMatches.map(s => s.replace(/\s+/g, ' ').trim()))).slice(0, 4).join(' / ')
    : 'Según solicitud de cruce';

  const ubicMatches = limpio.match(
    /(?:piquetes?|pk|progresiva|vano|v[eé]rtice|km|ruta|ramal|lat\.?\/?lon\.?)[^\n.;]{2,90}/gi
  );
  const vanosAfectados = ubicMatches
    ? Array.from(new Set(ubicMatches.map(s => s.replace(/\s+/g, ' ').trim()))).slice(0, 3).join(' · ').slice(0, 220)
    : 'Ver detalle en solicitud';

  const faltantes: string[] = [];
  for (const linea of limpio.split('\n')) {
    const l = linea.trim();
    if (
      l.length >= 8 &&
      l.length <= 220 &&
      /(?:faltante|pendiente|adjuntar|rest[ao]\s+presentar|sin\s+presentar|observaci[oó]n|requerido|a\s+completar)/i.test(l)
    ) {
      faltantes.push(l.replace(/^[-•*\d.)\s]+/, '').trim());
    }
  }

  const lowerAll = `${limpio} ${archivoNombre} ${todosArchivos.join(' ')}`.toLowerCase();
  let estadoTramite = 'SOLICITUD DETECTADA';
  if (/aprobado|autorizado|no\s+objeci[oó]n|factibilidad\s+otorgada/i.test(lowerAll)) {
    estadoTramite = 'APROBADO / AUTORIZADO';
  } else if (faltantes.length > 0 || /incomplet|faltante|observad|subsanar/i.test(lowerAll)) {
    estadoTramite = 'DOCUMENTACIÓN INCOMPLETA';
  } else if (/presentad|ingresad|mesa\s+de\s+entradas|expediente|tr[aá]mite/i.test(lowerAll)) {
    estadoTramite = 'SOLICITUD PRESENTADA';
  } else if (/listo\s+para\s+presentar/i.test(lowerAll)) {
    estadoTramite = 'LISTO PARA PRESENTAR';
  }

  const fechaMatch = limpio.match(/\b(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})\b/);
  const fechaDocumento = fechaMatch
    ? normalizarFechaIso(fechaMatch[1], fechaDrive)
    : fechaDrive || '';

  const resumenSolicitud =
    limpio
      .replace(/\[Página \d+\]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 420) || `Documento leído: ${archivoNombre}`;

  return {
    empresa,
    tipoInterferencia,
    normativa,
    estadoTramite,
    vanosAfectados,
    faltantes: Array.from(new Set(faltantes)).slice(0, 8),
    fechaDocumento,
    resumenSolicitud,
  };
}

async function extraerDatosRealesCruceConGemini(params: {
  carpetaNombre: string;
  archivoNombre: string;
  texto: string;
  todosArchivos: string[];
  fechaDrive?: string;
  ai: GoogleGenAI | null;
  model: string;
}): Promise<{
  empresa: string;
  tipoInterferencia: string;
  normativa: string;
  estadoTramite: string;
  vanosAfectados: string;
  faltantes: string[];
  fechaDocumento: string;
  resumenSolicitud: string;
}> {
  const { carpetaNombre, archivoNombre, texto, todosArchivos, fechaDrive, ai, model } = params;

  if (!ai || !texto || texto.trim().length < 25) {
    return extraerConHeuristicaLocal({ carpetaNombre, archivoNombre, texto, todosArchivos, fechaDrive });
  }

  try {
    const { response: resp } = await generarContenidoConFallback({
      ai,
      model,
      contents: [
        {
          text:
            `Analiza EXCLUSIVAMENTE el documento real de solicitud de cruce ubicado dentro de la subcarpeta "${carpetaNombre}" de la carpeta "interferencias" en Google Drive.\n` +
            `NO inventes ni supongas datos que no figuren en el texto o en la lista de archivos de la carpeta.\n` +
            `Archivo principal leído: "${archivoNombre}"\n` +
            `Otros archivos presentes en la carpeta "${carpetaNombre}": ${todosArchivos.join(', ') || 'ninguno'}\n\n` +
            `TEXTO EXTRAÍDO DE LA SOLICITUD:\n${texto.slice(0, 45000)}`,
        },
      ],
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            empresa: {
              type: Type.STRING,
              description: 'Empresa u organismo destinatario real indicado en la solicitud (ej. TGN, Vialidad, EDET, Gasnor, etc.) o el nombre de la subcarpeta si no se explicita otro.',
            },
            tipoInterferencia: {
              type: Type.STRING,
              description: 'Objeto real del cruce o interferencia descripto en la solicitud (ej. cruce aéreo 132 kV sobre ruta/gasoducto/vía/línea).',
            },
            normativa: {
              type: Type.STRING,
              description: 'Normativa, resolución o especificación citada en el documento (si no se menciona, indicar "No especificada en solicitud").',
            },
            estadoTramite: {
              type: Type.STRING,
              description: 'Estado real reflejado en la solicitud y archivos: LISTO PARA PRESENTAR, SOLICITUD PRESENTADA, EN TRÁMITE, APROBADO / AUTORIZADO, CON OBSERVACIONES o DOCUMENTACIÓN INCOMPLETA.',
            },
            vanosAfectados: {
              type: Type.STRING,
              description: 'Piquetes, progresivas, kilómetros, vértices, vanos o ubicación geográfica real mencionada en la solicitud.',
            },
            faltantes: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'Lista de requisitos pendientes, documentación faltante u observaciones reales mencionadas en la solicitud o carpeta (vacío si está completa).',
            },
            fechaDocumento: {
              type: Type.STRING,
              description: 'Fecha de emisión de la solicitud en formato YYYY-MM-DD si aparece en el documento.',
            },
            resumenSolicitud: {
              type: Type.STRING,
              description: 'Resumen técnico breve (2 a 3 oraciones) basado 100% en lo que indica la solicitud.',
            },
          },
          required: [
            'empresa',
            'tipoInterferencia',
            'normativa',
            'estadoTramite',
            'vanosAfectados',
            'faltantes',
            'resumenSolicitud',
          ],
        },
      },
      timeoutMs: 20000,
    });

    const jsonText = (resp.text || '').trim();
    if (jsonText) {
      const parsed = JSON.parse(jsonText);
      return {
        empresa: String(parsed.empresa || carpetaNombre).trim(),
        tipoInterferencia: String(parsed.tipoInterferencia || `Cruce - ${carpetaNombre}`).trim(),
        normativa: String(parsed.normativa || 'No especificada en solicitud').trim(),
        estadoTramite: String(parsed.estadoTramite || 'SOLICITUD DETECTADA').trim().toUpperCase(),
        vanosAfectados: String(parsed.vanosAfectados || 'No especificado en solicitud').trim(),
        faltantes: Array.isArray(parsed.faltantes)
          ? parsed.faltantes.map((f: any) => String(f).trim()).filter(Boolean).slice(0, 15)
          : [],
        fechaDocumento: parsed.fechaDocumento
          ? normalizarFechaIso(String(parsed.fechaDocumento), fechaDrive)
          : fechaDrive || '',
        resumenSolicitud: String(parsed.resumenSolicitud || '').trim(),
      };
    }
  } catch (err) {
    console.warn(`[DriveInterferencias] Fallback heurístico para "${carpetaNombre}":`, err);
  }

  return extraerConHeuristicaLocal({ carpetaNombre, archivoNombre, texto, todosArchivos, fechaDrive });
}

export async function sincronizarInterferenciasDesdeGoogleDrive(params: {
  accessToken: string;
  folderId?: string;
  interferenciasExistentes?: Interferencia[];
  forzarRelectura?: boolean;
  ai: GoogleGenAI | null;
  model: string;
}): Promise<InterferenciasDriveSyncResult> {
  const {
    accessToken,
    folderId = DEFAULT_DRIVE_ROOT_FOLDER_ID,
    interferenciasExistentes = [],
    forzarRelectura = false,
    ai,
    model,
  } = params;
  const rootId = (folderId || DEFAULT_DRIVE_ROOT_FOLDER_ID).trim();

  const carpetaInterf = await ubicarCarpetaInterferencias(rootId, accessToken);
  if (!carpetaInterf) {
    throw new Error(
      'No se encontró la carpeta "interferencias" en Google Drive. Verifica el ID de carpeta raíz o comparte la carpeta "interferencias" con tu cuenta.'
    );
  }

  const hijosInterf = await listarHijosCarpeta(carpetaInterf.id, accessToken);
  const subcarpetas = hijosInterf.filter(h => h.mimeType === MIME_FOLDER);

  const existentesPorSubId = new Map<string, Interferencia>();
  for (const item of interferenciasExistentes) {
    if (item.carpetaDriveId) existentesPorSubId.set(item.carpetaDriveId, item);
    else if (item.id?.startsWith('drv_int_')) {
      existentesPorSubId.set(item.id.replace('drv_int_', ''), item);
    }
  }
  const sigCache = cargarSigCacheInterferencias();

  const resultado: Interferencia[] = [];
  const erroresCarpetas: Array<{ carpeta: string; error: string }> = [];
  let subcarpetasOmitidasPorCache = 0;

  for (const sub of subcarpetas) {
    try {
      const { candidatos, todosNombres } = await listarArchivosDentroSubcarpetaCruce(sub, accessToken);
      const firmaActual = candidatos
        .map(c => `${c.file.id}:${c.file.modifiedTime || ''}`)
        .sort()
        .join('|');

      const existente = existentesPorSubId.get(sub.id);
      if (
        !forzarRelectura &&
        firmaActual &&
        sigCache[sub.id] === firmaActual &&
        existente &&
        existente.origen === 'drive'
      ) {
        subcarpetasOmitidasPorCache++;
        resultado.push(existente);
        continue;
      }

      if (candidatos.length === 0) {
        erroresCarpetas.push({
          carpeta: sub.name,
          error: 'La carpeta no contiene archivos legibles (PDF, Word, Google Docs, Excel o TXT).',
        });
        resultado.push({
          id: `drv_int_${sub.id}`,
          empresa: sub.name,
          tipoInterferencia: `Carpeta de cruce: ${sub.name}`,
          normativa: 'Sin documento de solicitud legible',
          estadoTramite: 'DOCUMENTACIÓN INCOMPLETA',
          vanosAfectados: 'No especificado',
          faltantes: ['No se encontró archivo de solicitud de cruce legible dentro de la carpeta'],
          carpetaNombre: sub.name,
          carpetaDriveId: sub.id,
          archivoSolicitudNombre: todosNombres[0] || '',
          archivoSolicitudId: '',
          archivoSolicitudUrl: sub.webViewLink || `https://drive.google.com/drive/folders/${sub.id}`,
          fechaDocumento: sub.modifiedTime ? sub.modifiedTime.slice(0, 10) : '',
          resumenSolicitud: `Carpeta "${sub.name}" detectada en Drive sin documento legible de solicitud para el cruce.`,
          origen: 'drive',
          archivosCarpetaCount: todosNombres.length,
          documentosLeidos: [],
        });
        continue;
      }

      const principal = candidatos[0];
      const documentosLeidos: string[] = [principal.file.name];
      const textoPrincipal = await descargarYExtraerTextoArchivoCruce(
        principal.file,
        accessToken,
        ai,
        model
      );
      let textoCombinado = textoPrincipal
        ? `=== DOCUMENTO PRINCIPAL DE SOLICITUD (${principal.file.name}) ===\n${textoPrincipal}`
        : '';

      // Complementar SIEMPRE con hasta 2 documentos de respuesta/autorización/observación (o el 2° mejor candidato)
      const complementarios = candidatos
        .slice(1)
        .sort((a, b) => {
          if (b.puntajeRespuesta !== a.puntajeRespuesta) {
            return b.puntajeRespuesta - a.puntajeRespuesta;
          }
          return (b.file.modifiedTime || '').localeCompare(a.file.modifiedTime || '');
        })
        .filter((c, idx) => c.puntajeRespuesta > 0 || (textoPrincipal.length < 400 && idx === 0))
        .slice(0, 2);

      for (const comp of complementarios) {
        if (textoCombinado.length >= 52000) break;
        try {
          const extraTxt = await descargarYExtraerTextoArchivoCruce(
            comp.file,
            accessToken,
            ai,
            model
          );
          if (extraTxt) {
            documentosLeidos.push(comp.file.name);
            const etiqueta = comp.puntajeRespuesta > 0 ? 'RESPUESTA / ACTUACIÓN / OBSERVACIÓN' : 'DOCUMENTO COMPLEMENTARIO';
            textoCombinado = `${textoCombinado}\n\n=== ${etiqueta} (${comp.file.name}) ===\n${extraTxt.slice(0, 18000)}`.trim();
          }
        } catch {
          // Ignorar error en archivo complementario
        }
      }

      textoCombinado = textoCombinado.slice(0, 55000);

      const fechaDrive = principal.file.modifiedTime
        ? principal.file.modifiedTime.slice(0, 10)
        : '';

      const extraido = await extraerDatosRealesCruceConGemini({
        carpetaNombre: sub.name,
        archivoNombre: documentosLeidos.join(' + '),
        texto: textoCombinado,
        todosArchivos: todosNombres,
        fechaDrive,
        ai,
        model,
      });

      const registro: Interferencia = {
        id: `drv_int_${sub.id}`,
        empresa: extraido.empresa || sub.name,
        tipoInterferencia: extraido.tipoInterferencia,
        normativa: extraido.normativa,
        estadoTramite: extraido.estadoTramite,
        vanosAfectados: extraido.vanosAfectados,
        faltantes: extraido.faltantes,
        carpetaNombre: sub.name,
        carpetaDriveId: sub.id,
        archivoSolicitudNombre: principal.file.name,
        archivoSolicitudId: principal.file.id,
        archivoSolicitudUrl:
          principal.file.webViewLink ||
          `https://drive.google.com/file/d/${principal.file.id}/view`,
        fechaDocumento: extraido.fechaDocumento,
        resumenSolicitud: extraido.resumenSolicitud,
        origen: 'drive',
        archivosCarpetaCount: todosNombres.length,
        documentosLeidos,
      };
      resultado.push(registro);
      if (firmaActual) {
        sigCache[sub.id] = firmaActual;
      }
    } catch (err: any) {
      erroresCarpetas.push({
        carpeta: sub.name,
        error: err?.message || 'Error leyendo carpeta de cruce desde Drive',
      });
    }
  }

  guardarSigCacheInterferencias(sigCache);

  return {
    carpetaInterferenciasId: carpetaInterf.id,
    carpetaInterferenciasNombre: carpetaInterf.name,
    subcarpetasDetectadas: subcarpetas.length,
    subcarpetasProcesadas: resultado.length,
    subcarpetasOmitidasPorCache,
    interferencias: resultado,
    erroresCarpetas,
  };
}
