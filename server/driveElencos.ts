import fs from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { CACHE_DIR, asegurarDirectorioCache, extraerTextoDePdfBuffer } from './pliegoProcessor';
import { DEFAULT_DRIVE_ROOT_FOLDER_ID, DriveFileItem } from './driveMinutas';
import { generarContenidoConFallback } from './geminiClient';

export const DEFAULT_ELENCOS_FOLDER_ID = '1Dmg0tKE6glZR0EYrjujzD_iJCZJnljrj';
export const DEFAULT_TOTAL_PLANIFICADOS_ELENCO = 543;
export const DEFAULT_POR_FRENTE_ELENCO: Record<string, number> = {
  LAT: 159,
  Leales: 170,
  'Villa Quinteros': 114,
  Bracho: 100,
};

const ELENCOS_PARSER_VERSION = 2;
const STORE_ELENCOS_PATH = path.join(CACHE_DIR, 'elencos_drive_store.json');

const MIME_FOLDER = 'application/vnd.google-apps.folder';
const MIME_GOOGLE_SHEET = 'application/vnd.google-apps.spreadsheet';
const MIME_GOOGLE_DOC = 'application/vnd.google-apps.document';
const MIME_PDF = 'application/pdf';
const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export interface ElencoArchivoAnalizado {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
  planosDetectados: number;
}

export interface ElencosDriveState {
  parserVersion?: number;
  folderId: string;
  folderName: string;
  totalPlanificados: number;
  porFrente: Record<string, number>;
  fuente: string;
  archivosAnalizados: ElencoArchivoAnalizado[];
  ultimaSincronizacion: string | null;
}

function crearEstadoBaseElencos(): ElencosDriveState {
  return {
    parserVersion: ELENCOS_PARSER_VERSION,
    folderId: DEFAULT_ELENCOS_FOLDER_ID,
    folderName: 'Elencos (Google Drive)',
    totalPlanificados: DEFAULT_TOTAL_PLANIFICADOS_ELENCO,
    porFrente: { ...DEFAULT_POR_FRENTE_ELENCO },
    fuente: 'Seguimiento de Elencos (Base 543)',
    archivosAnalizados: [],
    ultimaSincronizacion: null,
  };
}

export function cargarElencosDriveStore(): ElencosDriveState {
  try {
    asegurarDirectorioCache();
    if (fs.existsSync(STORE_ELENCOS_PATH)) {
      const raw = fs.readFileSync(STORE_ELENCOS_PATH, 'utf8');
      const parsed = JSON.parse(raw);
      if (
        parsed &&
        typeof parsed === 'object' &&
        Number(parsed.parserVersion) === ELENCOS_PARSER_VERSION &&
        Number(parsed.totalPlanificados) > 0
      ) {
        return {
          parserVersion: ELENCOS_PARSER_VERSION,
          folderId: String(parsed.folderId || DEFAULT_ELENCOS_FOLDER_ID),
          folderName: String(parsed.folderName || 'Elencos (Google Drive)'),
          totalPlanificados: Math.round(Number(parsed.totalPlanificados)),
          porFrente:
            parsed.porFrente && typeof parsed.porFrente === 'object'
              ? parsed.porFrente
              : { ...DEFAULT_POR_FRENTE_ELENCO },
          fuente: String(parsed.fuente || 'Google Drive Elencos'),
          archivosAnalizados: Array.isArray(parsed.archivosAnalizados)
            ? parsed.archivosAnalizados
            : [],
          ultimaSincronizacion: parsed.ultimaSincronizacion || null,
        };
      }
    }
  } catch (err) {
    console.warn('[DriveElencos] Error cargando caché de elencos:', err);
  }
  return crearEstadoBaseElencos();
}

export function guardarElencosDriveStore(state: ElencosDriveState): void {
  try {
    asegurarDirectorioCache();
    fs.writeFileSync(
      STORE_ELENCOS_PATH,
      JSON.stringify({ ...state, parserVersion: ELENCOS_PARSER_VERSION }, null, 2),
      'utf8'
    );
  } catch (err) {
    console.warn('[DriveElencos] Error guardando caché de elencos:', err);
  }
}

function normalizar(txt: string): string {
  return (txt || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

async function driveFetchJson<T>(url: string, accessToken: string, timeoutMs = 10000): Promise<T> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const textBody = await res.text().catch(() => '');
  if (!res.ok) {
    let msg = textBody.slice(0, 260);
    try {
      const j = JSON.parse(textBody);
      msg = j?.error?.message || msg;
    } catch {}
    const err = new Error(msg || `Google Drive API HTTP ${res.status}`) as Error & {
      status?: number;
    };
    err.status = res.status;
    throw err;
  }
  return JSON.parse(textBody) as T;
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

type FrenteKey = 'LAT' | 'Leales' | 'Villa Quinteros' | 'Bracho';

function clasificarPorTextoProyecto(texto: string): FrenteKey | null {
  const p = normalizar(texto);
  if (!p) return null;
  if (p.includes('lat') || (p.includes('bracho') && p.includes('villa')) || p.includes('linea')) {
    return 'LAT';
  }
  if (p.includes('leales')) return 'Leales';
  if (p.includes('quinteros') || /\bvq\b/.test(p)) return 'Villa Quinteros';
  if (p.includes('bracho') || /\beb\b/.test(p)) return 'Bracho';
  return null;
}

function clasificarFrente(
  codigo: string,
  proyectoExplicito: string,
  contexto: string
): FrenteKey | null {
  // 1. Columna explícita de Proyecto / Obra (máxima confianza)
  const porProy = clasificarPorTextoProyecto(proyectoExplicito);
  if (porProy) return porProy;

  // 2. Prefijo normalizado del código oficial de plano
  const c = (codigo || '').toUpperCase().replace(/_/g, '-').trim();
  if (/^(?:L[- ]?EB[- ]?VQ|LAT[- ])/i.test(c) || /L[- ]EB[- ]VQ/i.test(c)) return 'LAT';
  if (/^ET[- ]?LE\b/i.test(c)) return 'Leales';
  if (/^ET[- ]?VQ\b/i.test(c)) return 'Villa Quinteros';
  if (/^ET[- ]?(?:BR|EB)\b/i.test(c)) return 'Bracho';

  // 3. Contexto (nombre de pestaña / archivo / carpeta)
  return clasificarPorTextoProyecto(contexto);
}

const REGEX_CODIGO_OFICIAL =
  /\b(?:(?:ET[-_](?:LE|VQ|BR|EB)|L[-_]EB[-_]VQ)[-_][A-Z0-9]{1,8}(?:[-_][A-Z0-9]{1,8}){1,4})\b/gi;
const REGEX_CODIGO_GENERICO = /\b[A-Z]{1,4}(?:-[A-Z0-9]{2,6}){2,5}\b/g;

function esCodigoPlanoValido(raw: string): boolean {
  const up = raw.toUpperCase().replace(/_/g, '-').trim();
  if (up.length < 6 || up.length > 45) return false;
  if (!/\d/.test(up)) return false;
  if (/^(?:NP|OS|NS|MIN|MR|INT|COMCT|COMTC|IRAM|IEC|CIRSOC|AEA|NAG|ISO)-/i.test(up)) {
    return false;
  }
  if (/^(?:CODIGO|CÓDIGO|TOTAL|PROYECTO|DESCRIPCION|DESCRIPCIÓN|PENDIENTE)/i.test(up)) {
    return false;
  }
  return true;
}

function registrarCodigoEnMapa(
  codigoRaw: string,
  proyectoExplicito: string,
  contexto: string,
  mapaGlobal: Map<string, { codigo: string; frente: FrenteKey | null }>
): boolean {
  const clean = codigoRaw.toUpperCase().replace(/_/g, '-').trim();
  if (!esCodigoPlanoValido(clean)) return false;
  const key = clean.replace(/[^A-Z0-9]/g, '');
  if (!key) return false;

  const frente = clasificarFrente(clean, proyectoExplicito, contexto);
  const existente = mapaGlobal.get(key);
  if (!existente) {
    mapaGlobal.set(key, { codigo: clean, frente });
    return true;
  }
  if (!existente.frente && frente) {
    existente.frente = frente;
  }
  return false;
}

function extraerCodigosDeTexto(
  texto: string,
  contexto: string,
  mapaGlobal: Map<string, { codigo: string; frente: FrenteKey | null }>
): number {
  let encontradosEnArchivo = 0;
  const oficiales = texto.match(REGEX_CODIGO_OFICIAL) || [];
  const candidatos = oficiales.length > 0 ? oficiales : texto.match(REGEX_CODIGO_GENERICO) || [];

  for (const raw of candidatos) {
    if (registrarCodigoEnMapa(raw, '', contexto, mapaGlobal)) {
      encontradosEnArchivo++;
    }
  }
  return encontradosEnArchivo;
}

function parseEnteroCelda(val: any): number | null {
  if (typeof val === 'number' && Number.isFinite(val)) {
    const r = Math.round(val);
    return r >= 0 && r <= 5000 ? r : null;
  }
  const s = String(val ?? '')
    .trim()
    .replace(/\./g, '')
    .replace(/,/g, '.');
  if (!/^\d{1,4}(?:\.0+)?$/.test(s)) return null;
  const n = Math.round(Number(s));
  return Number.isFinite(n) && n >= 0 && n <= 5000 ? n : null;
}

function intentarLeerResumenHoja(
  wb: XLSX.WorkBook,
  fileName: string
): { totalResumen: number; porFrenteResumen: Partial<Record<FrenteKey, number>> } | null {
  let bestTotal = 0;
  let bestPorFrente: Partial<Record<FrenteKey, number>> = {};

  for (const sheetName of wb.SheetNames) {
    const sNorm = normalizar(sheetName);
    const fNorm = normalizar(fileName);
    const esResumen =
      sNorm.includes('resumen') ||
      sNorm.includes('tablero') ||
      sNorm.includes('control') ||
      sNorm.includes('general') ||
      (fNorm.includes('seguimiento') && sheetName === wb.SheetNames[0]);
    if (!esResumen) continue;

    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: '' }).slice(0, 60);

    let totalHoja = 0;
    const porFrenteHoja: Partial<Record<FrenteKey, number>> = {};

    // 1. Buscar tarjeta KPI ("TOTAL PLANIFICADOS (ELENCO)" en fila r, número en fila r+1 misma columna o vecina)
    for (let r = 0; r < Math.min(rows.length - 1, 15); r++) {
      const row = rows[r];
      const nextRow = rows[r + 1];
      if (!Array.isArray(row) || !Array.isArray(nextRow)) continue;

      for (let c = 0; c < row.length; c++) {
        const cellTxt = normalizar(String(row[c] ?? ''));
        if (
          cellTxt.includes('total planificado') ||
          cellTxt.includes('total elenco') ||
          cellTxt.includes('elenco total')
        ) {
          for (let offset = 0; offset <= 2 && c + offset < nextRow.length; offset++) {
            const num = parseEnteroCelda(nextRow[c + offset]);
            if (num !== null && num >= 50) {
              totalHoja = Math.max(totalHoja, num);
              break;
            }
          }
        }
      }
    }

    // 2. Buscar tabla estructurada "PROYECTO | ELENCO TOTAL | CONCILIADOS | ..."
    for (let r = 0; r < Math.min(rows.length - 1, 25); r++) {
      const row = rows[r];
      if (!Array.isArray(row)) continue;

      let colProy = -1;
      let colElencoTotal = -1;

      for (let c = 0; c < row.length; c++) {
        const h = normalizar(String(row[c] ?? ''));
        if (!h) continue;
        if (colProy === -1 && (h === 'proyecto' || h.includes('obra / proyecto') || h === 'frente')) {
          colProy = c;
        }
        if (
          colElencoTotal === -1 &&
          (h.includes('elenco total') || h.includes('total planificado') || h === 'planificados')
        ) {
          colElencoTotal = c;
        }
      }

      if (colProy >= 0 && colElencoTotal >= 0) {
        for (let rSub = r + 1; rSub < Math.min(rows.length, r + 12); rSub++) {
          const subRow = rows[rSub];
          if (!Array.isArray(subRow)) continue;
          const rowJoined = normalizar(subRow.map(x => String(x ?? '')).join(' '));
          if (!rowJoined || rowJoined.includes('detalle de planos')) break;

          const frente = clasificarPorTextoProyecto(String(subRow[colProy] ?? ''));
          const val = parseEnteroCelda(subRow[colElencoTotal]);
          if (frente && val !== null && val > 0) {
            porFrenteHoja[frente] = val;
          }
        }
        break;
      }
    }

    const sumaFrentes = Object.values(porFrenteHoja).reduce((a, b) => a + (b || 0), 0);
    if (totalHoja === 0 && sumaFrentes > 0) {
      totalHoja = sumaFrentes;
    }

    if (totalHoja > 0 && (sumaFrentes > 0 || totalHoja > bestTotal)) {
      bestTotal = totalHoja;
      bestPorFrente = porFrenteHoja;
      if (Object.keys(bestPorFrente).length >= 3) {
        break;
      }
    }
  }

  if (bestTotal > 0) {
    return { totalResumen: bestTotal, porFrenteResumen: bestPorFrente };
  }
  return null;
}

function esPestanaExcluidaParaConteoElenco(sheetName: string): boolean {
  const s = normalizar(sheetName);
  return (
    s.includes('resumen') ||
    s.includes('tablero') ||
    s.includes('control') ||
    s.includes('master') ||
    s.includes('registro_archivos') ||
    s.includes('registro archivos') ||
    s.includes('historico') ||
    s.includes('interferencia') ||
    s.includes('comunicacion') ||
    s.includes('libro') ||
    s.includes('minuta') ||
    s.includes('observad') ||
    s.includes('matriz') ||
    s.includes('config') ||
    s.includes('hito') ||
    s.includes('pliego')
  );
}

function esPestanaReferenciaOficialElenco(sheetName: string): boolean {
  const s = normalizar(sheetName);
  return (
    s.includes('elencos_oficiales') ||
    s.includes('elenco_oficial') ||
    s.includes('elencos oficiales') ||
    s.includes('elenco oficial') ||
    (s.includes('elenco') && s.includes('referencia'))
  );
}

function extraerCodigosDeHojaTabular(
  ws: XLSX.WorkSheet,
  sheetName: string,
  fileName: string,
  ruta: string,
  mapaDestino: Map<string, { codigo: string; frente: FrenteKey | null }>
): number {
  const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: '' });
  if (rows.length === 0) return 0;

  let headerIdx = -1;
  let colCodigo = -1;
  let colProyecto = -1;

  for (let r = 0; r < Math.min(rows.length, 15); r++) {
    const row = rows[r];
    if (!Array.isArray(row)) continue;

    let tmpCod = -1;
    let tmpProy = -1;

    for (let c = 0; c < row.length; c++) {
      const h = normalizar(String(row[c] ?? ''));
      if (!h) continue;
      if (
        h === 'codigo oficial' ||
        h === 'codigo del plano' ||
        h === 'codigo planificado' ||
        h === 'codigo' ||
        h.includes('codigo oficial')
      ) {
        tmpCod = c;
      } else if (
        tmpProy === -1 &&
        (h.includes('proyecto') || h.includes('obra') || h === 'frente')
      ) {
        tmpProy = c;
      }
    }

    if (tmpCod >= 0) {
      headerIdx = r;
      colCodigo = tmpCod;
      colProyecto = tmpProy;
      break;
    }
  }

  let agregados = 0;

  if (headerIdx >= 0 && colCodigo >= 0) {
    for (let r = headerIdx + 1; r < rows.length; r++) {
      const row = rows[r];
      if (!Array.isArray(row)) continue;
      const rawCod = String(row[colCodigo] ?? '').trim();
      if (!rawCod) continue;

      const rawProy = colProyecto >= 0 ? String(row[colProyecto] ?? '').trim() : '';
      const contexto = `${sheetName} ${fileName} ${ruta}`;

      const matchOf = rawCod.match(REGEX_CODIGO_OFICIAL);
      if (matchOf && matchOf.length > 0) {
        for (const m of matchOf) {
          if (registrarCodigoEnMapa(m, rawProy, contexto, mapaDestino)) {
            agregados++;
          }
        }
      } else {
        const candidatoUnico = rawCod.split(/\s+/)[0] || rawCod;
        if (registrarCodigoEnMapa(candidatoUnico, rawProy, contexto, mapaDestino)) {
          agregados++;
        }
      }
    }
    return agregados;
  }

  // Fallback si la hoja no tiene encabezados estándar
  for (const row of rows) {
    if (!Array.isArray(row)) continue;
    const rowTxt = row.map(c => String(c ?? '').trim()).join(' | ');
    agregados += extraerCodigosDeTexto(rowTxt, `${fileName} ${sheetName} ${ruta}`, mapaDestino);
  }
  return agregados;
}

async function descargarBufferDrive(file: DriveFileItem, accessToken: string): Promise<Buffer | null> {
  const lower = (file.name || '').toLowerCase();
  if (file.mimeType === MIME_GOOGLE_SHEET) {
    const expUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}/export?mimeType=${encodeURIComponent(MIME_XLSX)}`;
    const res = await fetch(expUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(18000),
    });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  }

  if (file.mimeType === MIME_GOOGLE_DOC) {
    const expUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}/export?mimeType=text/plain`;
    const res = await fetch(expUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    return Buffer.from(await res.text(), 'utf8');
  }

  if (
    file.mimeType === MIME_PDF ||
    file.mimeType === MIME_XLSX ||
    lower.endsWith('.pdf') ||
    lower.endsWith('.xlsx') ||
    lower.endsWith('.xls') ||
    lower.endsWith('.csv') ||
    lower.endsWith('.txt')
  ) {
    const mediaUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}?alt=media&supportsAllDrives=true`;
    const res = await fetch(mediaUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  }

  return null;
}

function esArchivoElencoCandidato(file: DriveFileItem): boolean {
  const lower = (file.name || '').toLowerCase();
  if (lower.startsWith('~$') || lower.startsWith('._')) return false;
  if (file.mimeType === MIME_FOLDER) return false;
  return (
    file.mimeType === MIME_GOOGLE_SHEET ||
    file.mimeType === MIME_GOOGLE_DOC ||
    file.mimeType === MIME_PDF ||
    file.mimeType === MIME_XLSX ||
    lower.endsWith('.xlsx') ||
    lower.endsWith('.xls') ||
    lower.endsWith('.csv') ||
    lower.endsWith('.pdf') ||
    lower.endsWith('.txt')
  );
}

export async function sincronizarElencosDesdeGoogleDrive(params: {
  accessToken: string;
  folderId?: string;
  rootFolderId?: string;
  ai?: GoogleGenAI | null;
}): Promise<ElencosDriveState> {
  const {
    accessToken,
    folderId = DEFAULT_ELENCOS_FOLDER_ID,
    rootFolderId = DEFAULT_DRIVE_ROOT_FOLDER_ID,
    ai = null,
  } = params;

  let folderName = 'Elencos (Google Drive)';
  try {
    const meta = await driveFetchJson<DriveFileItem>(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(folderId)}?fields=id,name,mimeType&supportsAllDrives=true`,
      accessToken
    );
    if (meta?.name) folderName = meta.name;
  } catch (err: any) {
    if (err?.status === 401 || err?.status === 403) throw err;
  }

  // 1. Recorrer carpeta específica de Elencos (BFS hasta 3 niveles)
  const archivosMap = new Map<string, { file: DriveFileItem; ruta: string }>();
  const cola: Array<{ id: string; ruta: string; depth: number }> = [
    { id: folderId, ruta: folderName, depth: 0 },
  ];
  const visitadas = new Set<string>();

  while (cola.length > 0 && visitadas.size < 40) {
    const actual = cola.shift()!;
    if (visitadas.has(actual.id)) continue;
    visitadas.add(actual.id);

    const hijos = await listarHijosCarpeta(actual.id, accessToken);
    for (const h of hijos) {
      if (h.mimeType === MIME_FOLDER) {
        if (actual.depth < 3) {
          cola.push({ id: h.id, ruta: `${actual.ruta}/${h.name}`, depth: actual.depth + 1 });
        }
      } else if (esArchivoElencoCandidato(h)) {
        archivosMap.set(h.id, { file: h, ruta: actual.ruta });
      }
    }
  }

  // 2. Buscar la planilla "Seguimiento de Elencos" en Drive si estuviera en la carpeta raíz del proyecto
  try {
    const q = encodeURIComponent(
      `trashed = false and (mimeType = '${MIME_GOOGLE_SHEET}' or mimeType = '${MIME_XLSX}') and (name contains 'seguimiento' or name contains 'Seguimiento' or name contains 'Elenco' or name contains 'elenco')`
    );
    const fields = encodeURIComponent('files(id,name,mimeType,modifiedTime,webViewLink,parents)');
    const resSearch = await driveFetchJson<{ files?: DriveFileItem[] }>(
      `https://www.googleapis.com/drive/v3/files?q=${q}&fields=${fields}&pageSize=20&supportsAllDrives=true&includeItemsFromAllDrives=true`,
      accessToken
    );
    for (const f of resSearch.files || []) {
      const fNorm = normalizar(f.name);
      const estaEnRaiz = Array.isArray(f.parents) && f.parents.includes(rootFolderId);
      const esSeguimientoElenco =
        (fNorm.includes('seguimiento') && fNorm.includes('elenco')) ||
        (estaEnRaiz && fNorm.includes('elenco'));
      if (esSeguimientoElenco && !archivosMap.has(f.id)) {
        archivosMap.set(f.id, { file: f, ruta: 'Seguimiento de Elencos (Drive)' });
      }
    }
  } catch (err: any) {
    if (err?.status === 401 || err?.status === 403) throw err;
  }

  const candidatos = Array.from(archivosMap.values()).sort((a, b) => {
    const aSeg = normalizar(a.file.name).includes('seguimiento') ? 0 : 1;
    const bSeg = normalizar(b.file.name).includes('seguimiento') ? 0 : 1;
    if (aSeg !== bSeg) return aSeg - bSeg;
    const aSheet = a.file.mimeType === MIME_GOOGLE_SHEET || /\.xlsx?$/i.test(a.file.name) ? 0 : 1;
    const bSheet = b.file.mimeType === MIME_GOOGLE_SHEET || /\.xlsx?$/i.test(b.file.name) ? 0 : 1;
    return aSheet - bSheet;
  });

  const mapaCodigosCarpeta = new Map<string, { codigo: string; frente: FrenteKey | null }>();
  const archivosAnalizados: ElencoArchivoAnalizado[] = [];
  let mejorResumen: {
    totalResumen: number;
    porFrenteResumen: Partial<Record<FrenteKey, number>>;
    nombreArchivo: string;
  } | null = null;
  let seguimientoDetectado: {
    nombreArchivo: string;
    tieneHojaElencoOficial: boolean;
    mapa: Map<string, { codigo: string; frente: FrenteKey | null }>;
    resumen: {
      totalResumen: number;
      porFrenteResumen: Partial<Record<FrenteKey, number>>;
    } | null;
  } | null = null;

  for (const { file, ruta } of candidatos.slice(0, 25)) {
    try {
      const buffer = await descargarBufferDrive(file, accessToken);
      if (!buffer || buffer.length === 0) continue;

      const lower = (file.name || '').toLowerCase();
      const esSpreadsheet =
        file.mimeType === MIME_GOOGLE_SHEET ||
        file.mimeType === MIME_XLSX ||
        lower.endsWith('.xlsx') ||
        lower.endsWith('.xls') ||
        lower.endsWith('.csv');
      const esSeguimiento = esSpreadsheet && normalizar(file.name).includes('seguimiento');
      let detectadosArchivo = 0;

      if (esSpreadsheet) {
        const wb = XLSX.read(buffer, { type: 'buffer' });
        const resumen = intentarLeerResumenHoja(wb, file.name);
        if (resumen && (!mejorResumen || esSeguimiento)) {
          mejorResumen = { ...resumen, nombreArchivo: file.name };
        }

        const hojasRefOficial = wb.SheetNames.filter(esPestanaReferenciaOficialElenco);
        const hojasARevisar =
          hojasRefOficial.length > 0
            ? hojasRefOficial
            : wb.SheetNames.filter(name => !esPestanaExcluidaParaConteoElenco(name));

        const mapaArchivo = new Map<string, { codigo: string; frente: FrenteKey | null }>();
        for (const sheetName of hojasARevisar) {
          const ws = wb.Sheets[sheetName];
          detectadosArchivo += extraerCodigosDeHojaTabular(
            ws,
            sheetName,
            file.name,
            ruta,
            mapaArchivo
          );
        }

        if (!esSeguimiento) {
          for (const [k, v] of mapaArchivo.entries()) {
            if (!mapaCodigosCarpeta.has(k)) mapaCodigosCarpeta.set(k, v);
          }
        }

        if (esSeguimiento && (mapaArchivo.size > 0 || resumen)) {
          seguimientoDetectado = {
            nombreArchivo: file.name,
            tieneHojaElencoOficial: hojasRefOficial.length > 0,
            mapa: mapaArchivo,
            resumen,
          };
        }
      } else if (file.mimeType === MIME_PDF || lower.endsWith('.pdf')) {
        let textoPdf = '';
        try {
          const pdfRes = await extraerTextoDePdfBuffer(buffer);
          textoPdf = pdfRes.paginasTexto.map(p => p.texto).join('\n');
        } catch {}

        if (textoPdf.trim().length < 120 && ai && buffer.length <= 14 * 1024 * 1024) {
          try {
            const { response } = await generarContenidoConFallback({
              ai,
              contents: [
                { inlineData: { mimeType: 'application/pdf', data: buffer.toString('base64') } },
                {
                  text: `Extrae únicamente la lista completa de códigos oficiales de planos y su descripción de este Elenco de Ingeniería ("${file.name}").`,
                },
              ],
              config: { thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL } },
              timeoutMs: 20000,
            });
            textoPdf = (response.text || '').trim();
          } catch {}
        }

        if (textoPdf) {
          detectadosArchivo += extraerCodigosDeTexto(
            textoPdf,
            `${file.name} ${ruta}`,
            mapaCodigosCarpeta
          );
        }
      } else {
        const txt = buffer.toString('utf8');
        detectadosArchivo += extraerCodigosDeTexto(
          txt,
          `${file.name} ${ruta}`,
          mapaCodigosCarpeta
        );
      }

      archivosAnalizados.push({
        id: file.id,
        name: file.name,
        mimeType: file.mimeType,
        webViewLink: file.webViewLink,
        planosDetectados: detectadosArchivo,
      });
    } catch (err) {
      console.warn(`[DriveElencos] Error procesando "${file.name}":`, err);
    }
  }

  let totalFinal = 0;
  let porFrenteFinal: Record<string, number> = {};
  let fuente = `${folderName} (${archivosAnalizados.length} archivo${archivosAnalizados.length === 1 ? '' : 's'})`;

  // Prioridad 1: Tablero / Resumen oficial de "Seguimiento de Elencos" si tiene desglose completo por frente
  // o si el libro tiene "Elencos_Oficiales_Referencia"
  if (seguimientoDetectado) {
    const resSeg = seguimientoDetectado.resumen;
    const frentesResumenCount = resSeg ? Object.keys(resSeg.porFrenteResumen).length : 0;
    const sumaFrentesRes = resSeg
      ? Object.values(resSeg.porFrenteResumen).reduce((a, b) => a + (b || 0), 0)
      : 0;

    if (
      resSeg &&
      resSeg.totalResumen > 0 &&
      frentesResumenCount >= 3 &&
      (!seguimientoDetectado.tieneHojaElencoOficial ||
        Math.abs(seguimientoDetectado.mapa.size - resSeg.totalResumen) <= 5 ||
        sumaFrentesRes === resSeg.totalResumen)
    ) {
      // Si Elencos_Oficiales_Referencia coincide exactamente o el resumen tiene la tabla completa del tablero oficial
      if (seguimientoDetectado.tieneHojaElencoOficial && seguimientoDetectado.mapa.size > 0) {
        const calc: Record<string, number> = {
          LAT: 0,
          Leales: 0,
          'Villa Quinteros': 0,
          Bracho: 0,
        };
        for (const item of seguimientoDetectado.mapa.values()) {
          if (item.frente) calc[item.frente] = (calc[item.frente] || 0) + 1;
        }
        const sumaCalc = Object.values(calc).reduce((a, b) => a + b, 0);
        totalFinal = seguimientoDetectado.mapa.size;
        if (sumaCalc === totalFinal) {
          porFrenteFinal = calc;
        } else if (sumaFrentesRes === totalFinal) {
          porFrenteFinal = {
            LAT: resSeg.porFrenteResumen.LAT || 0,
            Leales: resSeg.porFrenteResumen.Leales || 0,
            'Villa Quinteros': resSeg.porFrenteResumen['Villa Quinteros'] || 0,
            Bracho: resSeg.porFrenteResumen.Bracho || 0,
          };
        } else {
          porFrenteFinal = calc;
        }
      } else {
        totalFinal = resSeg.totalResumen;
        porFrenteFinal = {
          LAT: resSeg.porFrenteResumen.LAT || 0,
          Leales: resSeg.porFrenteResumen.Leales || 0,
          'Villa Quinteros': resSeg.porFrenteResumen['Villa Quinteros'] || 0,
          Bracho: resSeg.porFrenteResumen.Bracho || 0,
        };
      }
      fuente = `${seguimientoDetectado.nombreArchivo} (Drive)`;
    } else if (seguimientoDetectado.mapa.size > 0) {
      const calc: Record<string, number> = {
        LAT: 0,
        Leales: 0,
        'Villa Quinteros': 0,
        Bracho: 0,
      };
      for (const item of seguimientoDetectado.mapa.values()) {
        if (item.frente) calc[item.frente] = (calc[item.frente] || 0) + 1;
      }
      totalFinal = seguimientoDetectado.mapa.size;
      porFrenteFinal = calc;
      fuente = `${seguimientoDetectado.nombreArchivo} (Drive)`;
    } else if (resSeg && resSeg.totalResumen > 0) {
      totalFinal = resSeg.totalResumen;
      porFrenteFinal = {
        LAT: resSeg.porFrenteResumen.LAT || 0,
        Leales: resSeg.porFrenteResumen.Leales || 0,
        'Villa Quinteros': resSeg.porFrenteResumen['Villa Quinteros'] || 0,
        Bracho: resSeg.porFrenteResumen.Bracho || 0,
      };
      fuente = `${seguimientoDetectado.nombreArchivo} (Drive)`;
    }
  }

  // Prioridad 2: Códigos agregados de la carpeta oficial de Elencos (1Dmg0tKE6glZR0EYrjujzD_iJCZJnljrj)
  if (totalFinal === 0 && mapaCodigosCarpeta.size > 0) {
    const calc: Record<string, number> = {
      LAT: 0,
      Leales: 0,
      'Villa Quinteros': 0,
      Bracho: 0,
    };
    for (const item of mapaCodigosCarpeta.values()) {
      if (item.frente) calc[item.frente] = (calc[item.frente] || 0) + 1;
    }
    totalFinal = mapaCodigosCarpeta.size;
    porFrenteFinal = calc;
  }

  // Prioridad 3: Resumen leído en cualquier planilla de la carpeta de Elencos
  if (totalFinal === 0 && mejorResumen && mejorResumen.totalResumen > 0) {
    totalFinal = mejorResumen.totalResumen;
    porFrenteFinal = {
      LAT: mejorResumen.porFrenteResumen.LAT || 0,
      Leales: mejorResumen.porFrenteResumen.Leales || 0,
      'Villa Quinteros': mejorResumen.porFrenteResumen['Villa Quinteros'] || 0,
      Bracho: mejorResumen.porFrenteResumen.Bracho || 0,
    };
    fuente = `${mejorResumen.nombreArchivo} (Drive)`;
  }

  // Si no se detectó ningún código ni resumen válido, conservar el valor previo / base 543
  if (totalFinal <= 0) {
    const previo = cargarElencosDriveStore();
    return {
      ...previo,
      parserVersion: ELENCOS_PARSER_VERSION,
      folderId,
      folderName,
      archivosAnalizados,
      ultimaSincronizacion: new Date().toISOString(),
    };
  }

  const sumaFrentesClasificados = Object.values(porFrenteFinal).reduce((a, b) => a + b, 0);
  if (sumaFrentesClasificados === 0) {
    porFrenteFinal = {};
  }

  const nuevoEstado: ElencosDriveState = {
    parserVersion: ELENCOS_PARSER_VERSION,
    folderId,
    folderName,
    totalPlanificados: totalFinal,
    porFrente: porFrenteFinal,
    fuente,
    archivosAnalizados,
    ultimaSincronizacion: new Date().toISOString(),
  };

  guardarElencosDriveStore(nuevoEstado);
  return nuevoEstado;
}
