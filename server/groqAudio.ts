import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { GoogleGenAI } from '@google/genai';
import { MinutaReunion } from '../src/types';
import { sanitizeSafeId } from './authMiddleware';
import { CACHE_DIR, asegurarDirectorioCache } from './pliegoProcessor';
import {
  AUDIO_TRANSCRIBE_MODEL,
  LITE_GEMINI_MODEL,
  generarContenidoConFallback,
} from './geminiClient';
import {
  generarChatOpenRouter,
  tieneOpenRouterConfigurado,
} from './openRouterClient';

const execFileAsync = promisify(execFile);

const GROQ_TRANSCRIPTIONS_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
const GROQ_MODELS_PRIORITY = ['whisper-large-v3-turbo', 'whisper-large-v3'] as const;
const MAX_GROQ_BYTES = 24 * 1024 * 1024; // Margen seguro bajo límite 25 MB del tier gratuito
const SEGMENT_SECONDS = 900; // Tramos de 15 min (~3.6 MB en MP3 mono 32 kbps)

const DOMAIN_WHISPER_PROMPT =
  'Reunión técnica de ingeniería y obra eléctrica de Alta Tensión 132 kV en Argentina. ' +
  'Términos frecuentes: LAT, Estación Transformadora, ET El Bracho, ET Leales, ET Villa Quinteros, ' +
  'TRANSNOA, UTE, Comitente, Inspección de Obra, Sello APC, Apto Para Construcción, ' +
  'Nota de Pedido, Orden de Servicio, Libro de Comunicaciones, Elenco de Planos, ' +
  'OPGW, conductor ACSR, malla de puesta a tierra PAT, hormigón H-25, armadura, piquetes, vano, cruce ferroviario.';

export interface GroqKeyCandidate {
  nombre: string;
  valorLimpio: string;
}

function cleanEnvSecret(val: string | undefined): string {
  let s = (val || '').trim();
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1).trim();
  }
  return s;
}

export function sanitizarErrorGroq(msg: string): string {
  return String(msg || '')
    .replace(/gsk_[A-Za-z0-9_-]{8,}/g, '[GROQ_KEY]')
    .replace(/Bearer\s+[A-Za-z0-9._-]{12,}/gi, 'Bearer [TOKEN]');
}

export function obtenerCandidatosGroqKeys(): GroqKeyCandidate[] {
  const seen = new Set<string>();
  const out: GroqKeyCandidate[] = [];

  const pushIfValid = (nombre: string, raw: string | undefined) => {
    const clean = cleanEnvSecret(raw);
    if (!clean) return;
    if (/MY_GROQ_API_KEY|TU_CLAVE|PLACEHOLDER/i.test(clean)) return;
    if (clean.length < 16) return;
    if (seen.has(clean)) return;
    seen.add(clean);
    out.push({ nombre, valorLimpio: clean });
  };

  pushIfValid('GROQ_API_KEY', process.env.GROQ_API_KEY);
  pushIfValid('GROQ_KEY', process.env.GROQ_KEY);
  pushIfValid('VITE_GROQ_API_KEY', process.env.VITE_GROQ_API_KEY);

  for (const [k, v] of Object.entries(process.env)) {
    if (!v) continue;
    const clean = cleanEnvSecret(v);
    if (clean.startsWith('gsk_') || (k.toUpperCase().includes('GROQ') && clean.length >= 20)) {
      pushIfValid(k, clean);
    }
  }

  return out;
}

export function tieneGroqConfigurado(): boolean {
  return obtenerCandidatosGroqKeys().length > 0;
}

export function obtenerResumenGroqEnv(): {
  configurado: boolean;
  fuente: string | null;
  vistaSegura: string | null;
} {
  const keys = obtenerCandidatosGroqKeys();
  if (keys.length === 0) {
    return { configurado: false, fuente: null, vistaSegura: null };
  }
  const primary = keys[0];
  const val = primary.valorLimpio;
  const vistaSegura =
    val.length > 10 ? `${val.slice(0, 6)}...${val.slice(-4)}` : '***';
  return {
    configurado: true,
    fuente: primary.nombre,
    vistaSegura,
  };
}

export function getRutaAudioStaging(id: string): string {
  asegurarDirectorioCache();
  const safeId = sanitizeSafeId(id, 'audioMinutaId');
  const baseResolved = path.resolve(CACHE_DIR);
  const target = path.resolve(baseResolved, `audio_${safeId}.part`);
  if (!target.startsWith(baseResolved + path.sep)) {
    throw new Error('Ruta temporal de audio fuera del directorio permitido.');
  }
  return target;
}

export function getRutaAudioUploadTemp(id: string): string {
  asegurarDirectorioCache();
  const safeId = sanitizeSafeId(id, 'audioMinutaId');
  const baseResolved = path.resolve(CACHE_DIR);
  const target = path.resolve(baseResolved, `audio_${safeId}.upload`);
  if (!target.startsWith(baseResolved + path.sep)) {
    throw new Error('Ruta temporal de audio fuera del directorio permitido.');
  }
  return target;
}

function getSegDirConfined(jobId: string): string {
  asegurarDirectorioCache();
  const safeId = sanitizeSafeId(jobId, 'audioMinutaId');
  const baseResolved = path.resolve(CACHE_DIR);
  const segDir = path.resolve(baseResolved, `audio_seg_${safeId}_${Date.now().toString(36)}`);
  if (!segDir.startsWith(baseResolved + path.sep)) {
    throw new Error('Directorio de segmentación fuera de caché permitido.');
  }
  fs.mkdirSync(segDir, { recursive: true });
  return segDir;
}

function formatSecondsMMSS(totalSec: number): string {
  const safe = Math.max(0, Math.round(totalSec));
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  if (hrs > 0) {
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export interface AudioSegmentInfo {
  index: number;
  filePath: string;
  fileName: string;
  sizeBytes: number;
  startSec: number;
  endSec: number;
}

/**
 * Convierte cualquier audio/video de reunión (.webm, .m4a, .mp3, .wav, .ogg, .mp4, .aac, .flac)
 * a tramos secuenciales MP3 mono 16 kHz @ 32 kbps (~3.6 MB cada 15 min), garantizando que nunca superen
 * el límite de 25 MB del tier gratuito de Groq Whisper.
 */
export async function segmentarAudioParaGroq(params: {
  inputPath: string;
  originalName: string;
  jobId: string;
}): Promise<{ segDir: string; segments: AudioSegmentInfo[]; isSingleFallback: boolean }> {
  const baseResolved = path.resolve(CACHE_DIR);
  const inputResolved = path.resolve(params.inputPath);
  if (!inputResolved.startsWith(baseResolved + path.sep)) {
    throw new Error('Archivo de entrada fuera de directorio seguro.');
  }

  const segDir = getSegDirConfined(params.jobId);
  const outputPattern = path.join(segDir, 'seg_%03d.mp3');

  try {
    await execFileAsync(
      'ffmpeg',
      [
        '-y',
        '-hide_banner',
        '-loglevel',
        'error',
        '-i',
        inputResolved,
        '-vn',
        '-ac',
        '1',
        '-ar',
        '16000',
        '-b:a',
        '32k',
        '-f',
        'segment',
        '-segment_time',
        String(SEGMENT_SECONDS),
        '-reset_timestamps',
        '1',
        outputPattern,
      ],
      { timeout: 240000 }
    );

    const files = fs
      .readdirSync(segDir)
      .filter(f => /^seg_\d+\.mp3$/i.test(f))
      .sort();

    const segments: AudioSegmentInfo[] = [];
    for (let i = 0; i < files.length; i++) {
      const filePath = path.join(segDir, files[i]);
      const stat = fs.statSync(filePath);
      if (stat.size <= 0) continue;
      if (stat.size > MAX_GROQ_BYTES) {
        throw new Error(
          `El tramo ${files[i]} superó 24 MB tras la compresión (${(stat.size / (1024 * 1024)).toFixed(1)} MB).`
        );
      }
      segments.push({
        index: segments.length,
        filePath,
        fileName: files[i],
        sizeBytes: stat.size,
        startSec: i * SEGMENT_SECONDS,
        endSec: (i + 1) * SEGMENT_SECONDS,
      });
    }

    if (segments.length > 0) {
      return { segDir, segments, isSingleFallback: false };
    }
  } catch (ffErr: any) {
    console.warn('[GroqAudio] ffmpeg no pudo segmentar, evaluando envío directo:', ffErr?.message || ffErr);
  }

  // Fallback si ffmpeg falla con formato nativo chico <= 22 MB compatible con Groq
  const rawStat = fs.statSync(inputResolved);
  if (rawStat.size > 0 && rawStat.size <= MAX_GROQ_BYTES) {
    const ext = path.extname(params.originalName || '').toLowerCase() || '.webm';
    const allowedExt = ['.mp3', '.mp4', '.mpeg', '.mpga', '.m4a', '.wav', '.webm', '.ogg', '.flac'];
    const safeExt = allowedExt.includes(ext) ? ext : '.webm';
    const singlePath = path.join(segDir, `seg_000${safeExt}`);
    fs.copyFileSync(inputResolved, singlePath);
    return {
      segDir,
      segments: [
        {
          index: 0,
          filePath: singlePath,
          fileName: `seg_000${safeExt}`,
          sizeBytes: rawStat.size,
          startSec: 0,
          endSec: SEGMENT_SECONDS,
        },
      ],
      isSingleFallback: true,
    };
  }

  fs.rmSync(segDir, { recursive: true, force: true });
  throw new Error(
    'No se pudo decodificar el archivo de audio para segmentarlo. Verifica que sea un formato válido (.mp3, .m4a, .wav, .webm, .ogg, .mp4).'
  );
}

async function transcribirSegmentoConGroq(params: {
  segment: AudioSegmentInfo;
  apiKey: string;
}): Promise<{ texto: string; modeloUsado: string }> {
  const buf = fs.readFileSync(params.segment.filePath);
  const ext = path.extname(params.segment.fileName).toLowerCase();
  const mime =
    ext === '.mp3'
      ? 'audio/mpeg'
      : ext === '.wav'
        ? 'audio/wav'
        : ext === '.m4a' || ext === '.mp4'
          ? 'audio/mp4'
          : ext === '.ogg'
            ? 'audio/ogg'
            : 'audio/webm';

  let lastError: any = null;

  for (const modelId of GROQ_MODELS_PRIORITY) {
    for (let retry = 0; retry < 3; retry++) {
      try {
        const form = new FormData();
        form.append('file', new Blob([buf], { type: mime }), params.segment.fileName);
        form.append('model', modelId);
        form.append('language', 'es');
        form.append('response_format', 'json');
        form.append('temperature', '0');
        form.append('prompt', DOMAIN_WHISPER_PROMPT);

        const resp = await fetch(GROQ_TRANSCRIPTIONS_URL, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${params.apiKey}`,
          },
          body: form,
          signal: AbortSignal.timeout(120000),
        });

        const rawText = await resp.text();
        let data: any = null;
        try {
          data = JSON.parse(rawText);
        } catch {}

        if (!resp.ok) {
          const msg = sanitizarErrorGroq(data?.error?.message || rawText || `HTTP ${resp.status}`);
          const err: any = new Error(msg);
          err.status = resp.status;
          lastError = err;

          if (resp.status === 429 && retry < 2) {
            const retryAfterSec = Number(resp.headers.get('retry-after'));
            const waitMs =
              Number.isFinite(retryAfterSec) && retryAfterSec > 0
                ? Math.min(18000, retryAfterSec * 1000)
                : 3500 * (retry + 1);
            await new Promise(r => setTimeout(r, waitMs));
            continue;
          }
          if (resp.status === 401 || resp.status === 403) {
            throw err;
          }
          break; // probar siguiente modelo Whisper en Groq
        }

        const texto = String(data?.text || '').trim();
        return { texto, modeloUsado: modelId };
      } catch (err: any) {
        lastError = err;
        if (err?.status === 401 || err?.status === 403) throw err;
        if (retry < 1) {
          await new Promise(r => setTimeout(r, 1500));
          continue;
        }
        break;
      }
    }
  }

  throw lastError || new Error('Groq Whisper no pudo transcribir el tramo de audio.');
}

export async function transcribirAudioCortoConGroq(params: {
  buffer: Buffer;
  mimeType: string;
}): Promise<{ texto: string; modeloUsado: string }> {
  const keys = obtenerCandidatosGroqKeys();
  if (keys.length === 0) {
    const err: any = new Error('GROQ_API_KEY no configurada en el servidor.');
    err.status = 401;
    throw err;
  }

  const mimeClean = (params.mimeType || 'audio/webm').split(';')[0].trim().toLowerCase();
  const ext = mimeClean.includes('mp3') || mimeClean.includes('mpeg')
    ? '.mp3'
    : mimeClean.includes('wav')
      ? '.wav'
      : mimeClean.includes('mp4') || mimeClean.includes('m4a')
        ? '.m4a'
        : mimeClean.includes('ogg')
          ? '.ogg'
          : '.webm';

  let lastError: any = null;
  for (const kc of keys) {
    for (const modelId of GROQ_MODELS_PRIORITY) {
      try {
        const form = new FormData();
        form.append('file', new Blob([new Uint8Array(params.buffer)], { type: mimeClean }), `nota_campo${ext}`);
        form.append('model', modelId);
        form.append('language', 'es');
        form.append('response_format', 'json');
        form.append('temperature', '0');
        form.append('prompt', DOMAIN_WHISPER_PROMPT);

        const resp = await fetch(GROQ_TRANSCRIPTIONS_URL, {
          method: 'POST',
          headers: { Authorization: `Bearer ${kc.valorLimpio}` },
          body: form,
          signal: AbortSignal.timeout(45000),
        });

        const rawText = await resp.text();
        let data: any = null;
        try {
          data = JSON.parse(rawText);
        } catch {}

        if (!resp.ok) {
          const msg = sanitizarErrorGroq(data?.error?.message || rawText || `HTTP ${resp.status}`);
          const err: any = new Error(msg);
          err.status = resp.status;
          lastError = err;
          if (resp.status === 401 || resp.status === 403) break;
          continue;
        }

        const texto = String(data?.text || '').trim();
        return { texto, modeloUsado: `groq:${modelId}` };
      } catch (err: any) {
        lastError = err;
      }
    }
  }

  throw lastError || new Error('Groq Whisper no pudo transcribir la nota de voz.');
}

async function transcribirSegmentoConGeminiFallback(params: {
  segment: AudioSegmentInfo;
  ai: GoogleGenAI;
}): Promise<{ texto: string; modeloUsado: string }> {
  const buf = fs.readFileSync(params.segment.filePath);
  if (buf.length > 18 * 1024 * 1024) {
    throw new Error('Tramo demasiado grande para respaldo Gemini (>18 MB).');
  }
  const ext = path.extname(params.segment.fileName).toLowerCase();
  const mimeType = ext === '.mp3' ? 'audio/mp3' : 'audio/webm';

  const { response, modelUsed } = await generarContenidoConFallback({
    ai: params.ai,
    model: AUDIO_TRANSCRIBE_MODEL,
    isAudio: true,
    contents: {
      parts: [
        {
          inlineData: {
            mimeType,
            data: buf.toString('base64'),
          },
        },
        {
          text:
            'Transcribe fielmente en español esta parte de reunión de obra eléctrica 132 kV, respetando códigos de planos, compromisos, responsables, fechas y términos técnicos (LAT, ET, TRANSNOA, APC, PAT, H-25).',
        },
      ],
    },
    timeoutMs: 60000,
  });

  return {
    texto: String(response.text || '').trim(),
    modeloUsado: modelUsed,
  };
}

export async function transcribirAudioLargo(params: {
  inputPath: string;
  originalName: string;
  jobId: string;
  aiFallback?: GoogleGenAI | null;
  onProgress?: (pct: number, detalle: string) => void;
}): Promise<{
  transcripcionMarcaTiempo: string;
  transcripcionLimpia: string;
  segmentosProcesados: number;
  modeloTranscripcion: string;
}> {
  params.onProgress?.(6, 'Preparando y dividiendo audio en tramos seguros (<25 MB)...');
  const { segDir, segments } = await segmentarAudioParaGroq({
    inputPath: params.inputPath,
    originalName: params.originalName,
    jobId: params.jobId,
  });

  const groqKeys = obtenerCandidatosGroqKeys();
  const bloquesMarcaTiempo: string[] = [];
  const bloquesLimpios: string[] = [];
  let modeloTranscripcion = '';

  try {
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const etiquetaTiempo = `${formatSecondsMMSS(seg.startSec)} - ${formatSecondsMMSS(seg.endSec)}`;
      const basePct = 12 + Math.round((i / Math.max(1, segments.length)) * 66);
      params.onProgress?.(
        basePct,
        `Transcribiendo tramo ${i + 1} de ${segments.length} (${etiquetaTiempo}) con Groq Whisper...`
      );

      let tramoTexto = '';
      let tramoModelo = '';
      let groqErrLast: any = null;

      if (groqKeys.length > 0) {
        for (const keyCandidate of groqKeys) {
          try {
            const resGroq = await transcribirSegmentoConGroq({
              segment: seg,
              apiKey: keyCandidate.valorLimpio,
            });
            tramoTexto = resGroq.texto;
            tramoModelo = `groq:${resGroq.modeloUsado}`;
            groqErrLast = null;
            break;
          } catch (err: any) {
            groqErrLast = err;
            if (err?.status !== 401 && err?.status !== 403) {
              break;
            }
          }
        }
      }

      if (!tramoTexto && groqErrLast) {
        if (params.aiFallback) {
          params.onProgress?.(
            basePct,
            `Respaldo Gemini en tramo ${i + 1}/${segments.length}...`
          );
          try {
            const resGem = await transcribirSegmentoConGeminiFallback({
              segment: seg,
              ai: params.aiFallback,
            });
            tramoTexto = resGem.texto;
            tramoModelo = `gemini-fallback:${resGem.modeloUsado}`;
          } catch (gemErr: any) {
            throw new Error(
              `Groq Whisper falló (${sanitizarErrorGroq(groqErrLast?.message || '')}) y el respaldo Gemini tampoco respondió (${sanitizarErrorGroq(gemErr?.message || '')}).`
            );
          }
        } else {
          const status = groqErrLast?.status;
          if (status === 401 || status === 403) {
            throw new Error(
              'Groq rechazó GROQ_API_KEY (HTTP 401/403). Verifica en Settings > Secrets que la clave comience con "gsk_" y esté activa.'
            );
          }
          if (status === 429) {
            throw new Error(
              'Groq alcanzó su límite temporal gratuito por hora/minuto (HTTP 429). Espera unos minutos o verifica tu cuota en console.groq.com.'
            );
          }
          throw new Error(
            `Error transcribiendo audio con Groq Whisper: ${sanitizarErrorGroq(groqErrLast?.message || 'Error desconocido')}`
          );
        }
      } else if (!tramoTexto && groqKeys.length === 0) {
        if (params.aiFallback) {
          params.onProgress?.(
            basePct,
            `GROQ_API_KEY no detectada; transcribiendo tramo ${i + 1}/${segments.length} con Gemini...`
          );
          const resGem = await transcribirSegmentoConGeminiFallback({
            segment: seg,
            ai: params.aiFallback,
          });
          tramoTexto = resGem.texto;
          tramoModelo = `gemini:${resGem.modeloUsado}`;
        } else {
          throw new Error(
            'No se detectó GROQ_API_KEY en Settings > Secrets. Agrégala y recarga el servidor para transcribir audios.'
          );
        }
      }

      if (!modeloTranscripcion && tramoModelo) {
        modeloTranscripcion = tramoModelo;
      }

      if (tramoTexto) {
        bloquesMarcaTiempo.push(`[${etiquetaTiempo}]\n${tramoTexto}`);
        bloquesLimpios.push(tramoTexto);
      }
    }
  } finally {
    try {
      fs.rmSync(segDir, { recursive: true, force: true });
    } catch {}
  }

  const transcripcionLimpia = bloquesLimpios.join('\n\n').trim();
  const transcripcionMarcaTiempo = bloquesMarcaTiempo.join('\n\n').trim();

  if (!transcripcionLimpia) {
    throw new Error(
      'No se detectó habla comprensible en el audio grabado/cargado.'
    );
  }

  return {
    transcripcionMarcaTiempo,
    transcripcionLimpia,
    segmentosProcesados: segments.length,
    modeloTranscripcion: modeloTranscripcion || 'groq:whisper-large-v3-turbo',
  };
}

function construirReferenciaModelo(minutaModelo?: MinutaReunion | null): string {
  if (minutaModelo && (minutaModelo.contenidoTexto || minutaModelo.resumen)) {
    const extracto = (minutaModelo.contenidoTexto || minutaModelo.resumen || '').slice(0, 6500);
    return (
      `MINUTA MODELO CARGADA EN EL SISTEMA (IMPRESCINDIBLE IMITAR SU FORMATO, SECCIONES, ENCABEZADO, ESTILO DE NUMERACIÓN Y REDACCIÓN):\n` +
      `- Código de referencia del modelo: ${minutaModelo.codigo}\n` +
      `- Título del modelo: ${minutaModelo.titulo}\n` +
      `- Frente del modelo: ${minutaModelo.frente}\n` +
      `- Texto íntegro/estructura del modelo:\n"""\n${extracto}\n"""\n`
    );
  }

  return (
    `PLANTILLA ESTÁNDAR DE MINUTA DE REUNIÓN DE INGENIERÍA 132 kV (seguir esta estructura exacta):\n` +
    `# MINUTA DE REUNIÓN TÉCNICA — [CÓDIGO]\n` +
    `**Fecha:** [YYYY-MM-DD] | **Frente:** [Frente] | **Participantes:** [Participantes]\n` +
    `**Tema / Referencia:** [Título]\n\n` +
    `## 1. Resumen Ejecutivo\n[Síntesis de 4-6 líneas con los acuerdos centrales de la reunión]\n\n` +
    `## 2. Temas Tratados y Definiciones Técnicas\n- **2.1 [Tema]:** [Decisiones tomadas, planos/normas mencionadas, observaciones]\n\n` +
    `## 3. Compromisos Asumidos\n` +
    `| Ítem | Compromiso / Entregable | Responsable | Área | Frente | Fecha Límite | Documentos / Planos |\n` +
    `|---|---|---|---|---|---|---|\n` +
    `| C-01 | ... | ... | ... | ... | YYYY-MM-DD | ... |\n\n` +
    `## 4. Próximos Pasos y Observaciones\n- ...\n`
  );
}

async function sintetizarBloquesLargo(params: {
  texto: string;
  motor: 'gratuito' | 'gemini';
  openRouterModel?: string;
  ai: GoogleGenAI | null;
  onProgress?: (pct: number, detalle: string) => void;
}): Promise<string> {
  const CHUNK_CHARS = 24000;
  const chunks: string[] = [];
  for (let i = 0; i < params.texto.length; i += CHUNK_CHARS) {
    chunks.push(params.texto.slice(i, i + CHUNK_CHARS));
  }

  const resumenes: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    params.onProgress?.(
      82 + Math.round((i / Math.max(1, chunks.length)) * 10),
      `Extrayendo acuerdos del bloque ${i + 1} de ${chunks.length} de la transcripción...`
    );

    const promptChunk =
      `Extrae con precisión todos los temas técnicos, definiciones, fechas límite, nombres de responsables, ` +
      `códigos de planos/notas y compromisos asumidos en este fragmento (${i + 1}/${chunks.length}) de la reunión de obra 132 kV. ` +
      `Conserva datos numéricos, plazos, nombres y decisiones exactas.\n\nFRAGMENTO:\n${chunks[i]}`;

    let parcial = '';
    if (params.motor === 'gratuito' && tieneOpenRouterConfigurado()) {
      try {
        const resOr = await generarChatOpenRouter({
          parts: [{ text: promptChunk }],
          systemInstruction:
            'Eres un Secretario Técnico de Ingeniería Eléctrica 132 kV extrayendo puntos clave fieles de una reunión.',
          model: params.openRouterModel,
          timeoutMs: 45000,
        });
        parcial = resOr.texto;
      } catch {}
    }
    if (!parcial && params.ai) {
      try {
        const { response } = await generarContenidoConFallback({
          ai: params.ai,
          model: LITE_GEMINI_MODEL,
          contents: [{ text: promptChunk }],
          timeoutMs: 35000,
        });
        parcial = String(response.text || '').trim();
      } catch {}
    }

    resumenes.push(parcial || chunks[i].slice(0, 6000));
  }

  return resumenes.map((r, idx) => `=== BLOQUE ${idx + 1} ===\n${r}`).join('\n\n');
}

export async function generarBorradorMinutaDesdeTranscripcion(params: {
  transcripcionMarcaTiempo: string;
  transcripcionLimpia: string;
  minutaModelo?: MinutaReunion | null;
  codigo?: string;
  titulo?: string;
  fechaReunion?: string;
  frente?: string;
  participantes?: string;
  motor?: 'gratuito' | 'gemini';
  openRouterModel?: string;
  ai?: GoogleGenAI | null;
  onProgress?: (pct: number, detalle: string) => void;
}): Promise<{
  borradorMarkdown: string;
  fuenteRedaccion: string;
  modeloReferenciaUsado: string | null;
}> {
  const motorSolicitado: 'gratuito' | 'gemini' =
    params.motor === 'gemini' ? 'gemini' : 'gratuito';
  const ai = params.ai || null;

  const referenciaModelo = construirReferenciaModelo(params.minutaModelo);
  const modeloReferenciaUsado = params.minutaModelo
    ? `${params.minutaModelo.codigo} — ${params.minutaModelo.titulo}`
    : null;

  params.onProgress?.(82, 'Estructurando minuta formal siguiendo el modelo de referencia...');

  const baseTranscript =
    params.transcripcionMarcaTiempo.length > 28000
      ? await sintetizarBloquesLargo({
          texto: params.transcripcionMarcaTiempo,
          motor: motorSolicitado,
          openRouterModel: params.openRouterModel,
          ai,
          onProgress: params.onProgress,
        })
      : params.transcripcionMarcaTiempo;

  params.onProgress?.(93, 'Redactando minuta final y tabla de compromisos...');

  const hoyIso = new Date().toISOString().split('T')[0];
  const promptFinal =
    `Redacta la MINUTA FORMAL DE REUNIÓN en español en formato Markdown limpio, tomando ESTRICTAMENTE como base la transcripción de audio real y copiando la ESTRUCTURA, TONO Y FORMATO DE SECCIONES de la minuta modelo indicada.\n\n` +
    `DATOS DE CABECERA (úsalos si están informados; si alguno falta, dedúcelo de la charla sin inventar cifras):\n` +
    `- Código: ${params.codigo?.trim() || 'A definir / inferir'}\n` +
    `- Fecha de reunión: ${params.fechaReunion?.trim() || hoyIso}\n` +
    `- Frente de obra: ${params.frente?.trim() || 'LAT / ET 132 kV'}\n` +
    `- Título / Tema: ${params.titulo?.trim() || 'Reunión Técnica de Seguimiento'}\n` +
    `- Participantes: ${params.participantes?.trim() || 'Equipos presentes según charla'}\n\n` +
    `${referenciaModelo}\n\n` +
    `REGLAS IMPORTANTES:\n` +
    `1. Adapta los encabezados y secciones a la minuta modelo de referencia.\n` +
    `2. En la sección de Compromisos / Tareas, detalla SIEMPRE cada compromiso concreto con: Descripción clara, Responsable, Área, Frente, Fecha límite estimada/acordada (en formato YYYY-MM-DD cuando se mencione fecha o plazo) y Documentos/Planos citados, para que el sistema pueda extraerlos automáticamente.\n` +
    `3. No inventes acuerdos, valores técnicos ni participantes que no surjan de la transcripción.\n` +
    `4. Devuelve directamente el documento de la minuta listo para guardar y exportar a Word/PDF (sin preámbulos conversacionales).\n\n` +
    `=== TRANSCRIPCIÓN DE LA REUNIÓN ===\n${baseTranscript.slice(0, 85000)}`;

  const systemInst =
    'Eres un Ingeniero Director de Proyecto y Secretario Técnico de Obras 132 kV redactando actas/minutas contractuales precisas en español.';

  // 1. Intentar OpenRouter gratuito si corresponde
  if (motorSolicitado === 'gratuito' && tieneOpenRouterConfigurado()) {
    try {
      const orRes = await generarChatOpenRouter({
        parts: [{ text: promptFinal }],
        systemInstruction: systemInst,
        model: params.openRouterModel,
        timeoutMs: 65000,
      });
      if (orRes.texto.trim()) {
        return {
          borradorMarkdown: orRes.texto.trim(),
          fuenteRedaccion: `openrouter:${orRes.modelUsed}`,
          modeloReferenciaUsado,
        };
      }
    } catch (orErr: any) {
      console.warn('[GroqAudio] Error redactando con OpenRouter, probando respaldo Gemini:', orErr?.message || orErr);
    }
  }

  // 2. Intentar Gemini (solicitado o respaldo)
  if (ai) {
    try {
      const { response, modelUsed } = await generarContenidoConFallback({
        ai,
        model: LITE_GEMINI_MODEL,
        contents: [{ text: promptFinal }],
        config: {
          systemInstruction: systemInst,
        },
        timeoutMs: 55000,
      });
      if (response.text?.trim()) {
        return {
          borradorMarkdown: response.text.trim(),
          fuenteRedaccion: `gemini:${modelUsed}`,
          modeloReferenciaUsado,
        };
      }
    } catch (gemErr: any) {
      console.warn('[GroqAudio] Error redactando con Gemini:', gemErr?.message || gemErr);
    }
  }

  // 3. Reintentar OpenRouter si estaba en Gemini y falló
  if (motorSolicitado === 'gemini' && tieneOpenRouterConfigurado()) {
    try {
      const orRes = await generarChatOpenRouter({
        parts: [{ text: promptFinal }],
        systemInstruction: systemInst,
        model: params.openRouterModel,
        timeoutMs: 65000,
      });
      if (orRes.texto.trim()) {
        return {
          borradorMarkdown: orRes.texto.trim(),
          fuenteRedaccion: `openrouter:${orRes.modelUsed}`,
          modeloReferenciaUsado,
        };
      }
    } catch {}
  }

  // 4. Fallback determinista estructurado (nunca se pierde el audio transcrito)
  const lineasAccion = params.transcripcionLimpia
    .split(/[.!?;\n]+/)
    .map(l => l.trim())
    .filter(
      l =>
        l.length > 20 &&
        /\b(comprom|entreg|envi|revis|emit|present|resol|termin|acord|quedo|fecha|lunes|martes|miercoles|jueves|viernes|semana|plano|pliego|nota|cruce)\b/i.test(
          l
        )
    )
    .slice(0, 12);

  const filasTabla =
    lineasAccion.length > 0
      ? lineasAccion
          .map(
            (l, i) =>
              `| C-${String(i + 1).padStart(2, '0')} | ${l.replace(/\|/g, ' ').slice(0, 180)} | A confirmar | Ingeniería | ${params.frente || 'Obra 132 kV'} | ${params.fechaReunion || hoyIso} | - |`
          )
          .join('\n')
      : `| C-01 | Revisar compromisos detallados en el registro de transcripción adjunto | A confirmar | Ingeniería | ${params.frente || 'Obra 132 kV'} | ${params.fechaReunion || hoyIso} | - |`;

  const fallbackMd =
    `# MINUTA DE REUNIÓN — ${params.codigo?.trim() || 'MIN-AUDIO-001'}\n` +
    `**Fecha:** ${params.fechaReunion || hoyIso} | **Frente:** ${params.frente || 'Obra 132 kV'} | **Participantes:** ${params.participantes || 'Participantes según audio'}\n` +
    `**Tema:** ${params.titulo || 'Reunión de Seguimiento (Transcripción automática)'}\n\n` +
    `## 1. Puntos Clave Detectados\n` +
    (lineasAccion.length > 0
      ? lineasAccion.map(l => `- ${l}`).join('\n')
      : '- Transcripción registrada íntegramente a continuación para revisión.') +
    `\n\n## 2. Compromisos Detectados\n` +
    `| Ítem | Compromiso | Responsable | Área | Frente | Fecha Límite | Documentos |\n` +
    `|---|---|---|---|---|---|---|\n` +
    `${filasTabla}\n\n` +
    `## 3. Desarrollo / Transcripción Literal\n` +
    params.transcripcionMarcaTiempo.slice(0, 60000);

  return {
    borradorMarkdown: fallbackMd,
    fuenteRedaccion: 'estructura-local',
    modeloReferenciaUsado,
  };
}
