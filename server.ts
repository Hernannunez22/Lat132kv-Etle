import express from 'express';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import {
  PliegoReal,
  MinutaReunion,
  CompromisoMinuta,
  NotaPedidoIngenieria,
  EstadoCompromiso,
  NotaLibro,
  Interferencia,
  ActorNotaLibro,
  EstadoRespuestaNota,
  SentidoNotaLibro,
} from './src/types';
import { buscarYExtraerDePliegosReales } from './src/data/pliegosContractuales';
import { attachVerifiedFirebaseUser, sanitizeSafeId, type FirebaseVerifiedUser } from './server/authMiddleware';
import {
  PliegoIndexado,
  procesarArchivoPliego,
  procesarArchivoDesdeDisco,
  procesarTextoPliego,
  cargarPliegosDesdeDisco,
  eliminarPliegoDeDisco,
  limpiarPliegosDeDisco,
  asegurarGeminiFileUri,
  recuperarFragmentosRelevantes,
  generarCuadroComparativoLocal,
  getRutaStaging,
  getRutaUploadTemp,
} from './server/pliegoProcessor';
import {
  PlanoComparadorIndexado,
  cargarPlanosComparador,
  eliminarPlanoComparadorDisco,
  indexarPlanoComparadorBuffer,
  indexarPlanoComparadorDesdeArchivo,
  prepararPartesComparacion,
  compararPlanosLocalFallback,
} from './server/planoComparator';
import {
  cargarStoreMinutas,
  guardarStoreMinutas,
  extraerTextoMinutaBuffer,
  inferirMetadatosMinuta,
  analizarYExtraerCompromisosMinuta,
  generarContenidoNotaPedido,
  normalizarFechaIso,
} from './server/minutasManager';
import {
  sincronizarMinutasDesdeGoogleDrive,
  DEFAULT_DRIVE_ROOT_FOLDER_ID,
} from './server/driveMinutas';
import {
  ChatAdjuntoIndexado,
  cargarChatAdjuntos,
  guardarChatAdjunto,
  eliminarChatAdjuntoDisco,
  limpiarChatAdjuntosDisco,
  indexarChatAdjuntoBuffer,
  indexarChatAdjuntoDesdeArchivo,
  auditarAdjuntoVsPliegoLocal,
} from './server/chatAdjuntos';
import {
  cargarStoreInterferencias,
  guardarStoreInterferencias,
  sincronizarInterferenciasDesdeGoogleDrive,
} from './server/driveInterferencias';
import {
  cargarStoreNotasLibro,
  guardarStoreNotasLibro,
  analizarNotaLibroConIA,
  recalcularHilosYRespuestas,
  construirContextoNotasLibro,
  construirFallbackLocalNotasLibro,
  normalizarActorNota,
  normalizarTipoNota,
  canonicalizarCodigoNota,
} from './server/notasLibroManager';
import { sincronizarNotasLibroDesdeGoogleDrive } from './server/driveNotasLibro';
import {
  DriveDocumentoIndexado,
  cargarDriveDocumentosStore,
  buscarYLeerDocumentosDriveEnVivo,
  sincronizarDocsTecnicosDriveCarpeta,
  extraerTerminosBusquedaDrive,
  verificarConexionDrive,
} from './server/driveDocumentos';
import { analizarYExpandirConsulta } from './server/semanticSearch';
import {
  ElencosDriveState,
  DEFAULT_ELENCOS_FOLDER_ID,
  cargarElencosDriveStore,
  sincronizarElencosDesdeGoogleDrive,
} from './server/driveElencos';
import {
  PRIMARY_GEMINI_MODEL,
  OPENROUTER_FREE_MODEL,
  AUDIO_TRANSCRIBE_MODEL,
  DEFAULT_TEXT_MODELS,
  obtenerCandidatosApiKeys,
  obtenerResumenVariablesEntorno,
  clasificarErrorGemini,
  formatearAvisoErrorGemini,
  generarContenidoConFallback,
  generarStreamConFallback,
  sanitizarTextoError,
  getPreferredGeminiModel,
  setPreferredGeminiModel,
  getLastWorkingGeminiInfo,
  getUltimoErrorGemini,
  setUltimoErrorGemini,
  clearUltimoErrorGemini,
  getGeminiPrecisionState,
  updateGeminiPrecisionConfig,
  resetGeminiUsoDiario,
  resolverEjecucionPrecision,
  registrarConsumoGemini,
  getOpenRouterModeloPreferido,
  MASTER_ADMIN_EMAIL,
  isModelosPagosHabilitados,
  setModelosPagosHabilitados,
  type IntentoModeloResultado,
} from './server/geminiClient';
import {
  clasificarErrorOpenRouter,
  formatearAvisoErrorOpenRouter,
  generarChatOpenRouter,
  generarStreamOpenRouter,
  generarVisionOpenRouter,
  obtenerCandidatosOpenRouterKeys,
  obtenerResumenOpenRouterEnv,
  refrescarModelosGratuitosOpenRouter,
  tieneOpenRouterConfigurado,
  type HistorialTurnoOpenRouter,
} from './server/openRouterClient';
import {
  generarBorradorMinutaDesdeTranscripcion,
  getRutaAudioStaging,
  getRutaAudioUploadTemp,
  obtenerResumenGroqEnv,
  sanitizarErrorGroq,
  tieneGroqConfigurado,
  transcribirAudioCortoConGroq,
  transcribirAudioLargo,
} from './server/groqAudio';

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const GEMINI_MODEL = PRIMARY_GEMINI_MODEL;
const GEMINI_TRANSCRIBE_MODEL = AUDIO_TRANSCRIBE_MODEL;

app.use('/api', attachVerifiedFirebaseUser);

function esUsuarioMaestroRequest(req: express.Request): boolean {
  const user = (req as express.Request & { firebaseUser?: FirebaseVerifiedUser }).firebaseUser;
  return Boolean(
    user?.emailVerified &&
      typeof user.email === 'string' &&
      user.email.toLowerCase().trim() === MASTER_ADMIN_EMAIL
  );
}

type DestinoSubida = 'pliego' | 'planoA' | 'planoB' | 'chatPdf';

interface JobSubida {
  id: string;
  destino: DestinoSubida;
  nombre: string;
  tipoMime: string;
  totalBytes: number;
  fechaSubida: string;
  estado: 'subiendo' | 'procesando' | 'completado' | 'error';
  progreso: number;
  detalle: string;
  pliego?: PliegoReal;
  plano?: any;
  adjuntoChat?: any;
  error?: string;
}

const jobsSubida = new Map<string, JobSubida>();

interface JobAudioMinuta {
  id: string;
  nombre: string;
  tipoMime: string;
  totalBytes: number;
  modeloMinutaId?: string;
  codigo?: string;
  titulo?: string;
  fechaReunion?: string;
  frente?: string;
  participantes?: string;
  motor: 'gratuito' | 'gemini';
  estado: 'subiendo' | 'procesando' | 'completado' | 'error';
  progreso: number;
  detalle: string;
  creadoEn: number;
  resultado?: {
    transcripcionMarcaTiempo: string;
    transcripcionLimpia: string;
    borradorMarkdown: string;
    segmentosProcesados: number;
    modeloTranscripcion: string;
    fuenteRedaccion: string;
    modeloReferenciaUsado: string | null;
  };
  error?: string;
}

const jobsAudioMinuta = new Map<string, JobAudioMinuta>();
const MAX_AUDIO_MINUTA_BYTES = 250 * 1024 * 1024;

function decodeAudioHeader(val: unknown, fallback = ''): string {
  const raw = typeof val === 'string' ? val : '';
  if (!raw) return fallback;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function depurarJobsAudioAntiguos() {
  if (jobsAudioMinuta.size <= 30) return;
  const limite = Date.now() - 2 * 60 * 60 * 1000;
  for (const [k, v] of jobsAudioMinuta.entries()) {
    if ((v.estado === 'completado' || v.estado === 'error') && v.creadoEn < limite) {
      jobsAudioMinuta.delete(k);
    }
  }
}

function ejecutarProcesamientoAudioAsync(job: JobAudioMinuta, uploadPath: string) {
  (async () => {
    try {
      const pagosHabilitados = isModelosPagosHabilitados();
      const clienteAi = pagosHabilitados ? obtenerClienteGeminiActivo() : null;
      const motorEfectivo: 'gratuito' | 'gemini' =
        pagosHabilitados && job.motor === 'gemini' ? 'gemini' : 'gratuito';
      const modeloElegido = job.modeloMinutaId
        ? storeMinutas.minutas.find(m => m.id === job.modeloMinutaId) || null
        : storeMinutas.minutas[0] || null;

      const transRes = await transcribirAudioLargo({
        inputPath: uploadPath,
        originalName: job.nombre,
        jobId: job.id,
        aiFallback: clienteAi,
        onProgress: (pct, detalle) => {
          job.progreso = pct;
          job.detalle = detalle;
        },
      });

      const borradorRes = await generarBorradorMinutaDesdeTranscripcion({
        transcripcionMarcaTiempo: transRes.transcripcionMarcaTiempo,
        transcripcionLimpia: transRes.transcripcionLimpia,
        minutaModelo: job.modeloMinutaId === '__NINGUNO__' ? null : modeloElegido,
        codigo: job.codigo,
        titulo: job.titulo,
        fechaReunion: job.fechaReunion,
        frente: job.frente,
        participantes: job.participantes,
        motor: motorEfectivo,
        openRouterModel: getOpenRouterModeloPreferido(),
        ai: clienteAi,
        onProgress: (pct, detalle) => {
          job.progreso = pct;
          job.detalle = detalle;
        },
      });

      job.estado = 'completado';
      job.progreso = 100;
      job.detalle = `Transcripción y borrador listos (${transRes.segmentosProcesados} tramo(s))`;
      job.resultado = {
        transcripcionMarcaTiempo: transRes.transcripcionMarcaTiempo,
        transcripcionLimpia: transRes.transcripcionLimpia,
        borradorMarkdown: borradorRes.borradorMarkdown,
        segmentosProcesados: transRes.segmentosProcesados,
        modeloTranscripcion: transRes.modeloTranscripcion,
        fuenteRedaccion: borradorRes.fuenteRedaccion,
        modeloReferenciaUsado: borradorRes.modeloReferenciaUsado,
      };
    } catch (err: any) {
      console.error(`[AudioMinuta] Error procesando "${job.nombre}":`, err);
      job.estado = 'error';
      job.error = sanitizarErrorGroq(err?.message || 'Error transcribiendo o redactando el audio de reunión.');
    } finally {
      try {
        if (fs.existsSync(uploadPath)) fs.unlinkSync(uploadPath);
      } catch {}
    }
  })();
}

function inicializarGemini(): { client: GoogleGenAI | null; keySource: string | null } {
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
let ai: GoogleGenAI | null = initGemini.client;
let geminiKeySource: string | null = initGemini.keySource;

function obtenerClienteGeminiActivo(): GoogleGenAI | null {
  const recarga = inicializarGemini();
  if (recarga.client) {
    ai = recarga.client;
    geminiKeySource = recarga.keySource;
  }
  return ai;
}

function obtenerAvisoSinClienteGemini(): string {
  const rawApi = (process.env.API_KEY || '').trim();
  const rawGemini = (process.env.GEMINI_API_KEY || '').trim();
  if (/MY_GEMINI_API_KEY/i.test(rawApi) || /MY_GEMINI_API_KEY/i.test(rawGemini)) {
    return `> ⚠️ **El servidor aún está recibiendo el valor de plantilla (\`MY_GEMINI_API_KEY\`) en este contenedor.** Se ignoró ese valor y no hay otra clave válida en \`API_KEY\` ni en \`GEMINI_API_KEY\`. Guarda tu clave real en **Settings > Secrets** y recarga/republica el entorno.\n\n`;
  }
  return `> ⚠️ **No se detectó una clave válida en \`API_KEY\` ni en \`GEMINI_API_KEY\` en el proceso del servidor.** Configúrala en **Settings > Secrets** y recarga el entorno para habilitar el análisis profundo con **Gemini**.\n\n`;
}

// Almacenamiento en memoria + disco de los pliegos REALES, planos comparador, adjuntos de chat y minutas
let pliegosIndexados: PliegoIndexado[] = cargarPliegosDesdeDisco();
let planosComparador = cargarPlanosComparador();
let chatAdjuntos: ChatAdjuntoIndexado[] = cargarChatAdjuntos();
let storeMinutas = cargarStoreMinutas();
let storeInterferencias = cargarStoreInterferencias();
let storeNotasLibro: NotaLibro[] = recalcularHilosYRespuestas(cargarStoreNotasLibro());
let storeDriveDocumentos: DriveDocumentoIndexado[] = cargarDriveDocumentosStore();
let storeElencos: ElencosDriveState = cargarElencosDriveStore();
if (pliegosIndexados.length > 0) {
  console.log(`[Pliegos] ${pliegosIndexados.length} pliego(s) restaurado(s) desde caché.`);
}
if (storeNotasLibro.length > 0) {
  console.log(`[NotasLibro] ${storeNotasLibro.length} nota(s) de libro restaurada(s) desde caché.`);
}
if (storeDriveDocumentos.length > 0) {
  console.log(`[DriveDocs] ${storeDriveDocumentos.length} documento(s) técnico(s) de Drive restaurado(s) desde caché.`);
}

function toPliegoResumenCliente(p: PliegoIndexado): PliegoReal {
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

function toPlanoComparadorCliente(p: PlanoComparadorIndexado | null) {
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

function toChatAdjuntoCliente(p: ChatAdjuntoIndexado) {
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

// Endpoint rápido para subir archivo binario chico (< 3.5 MB) en un solo paso
app.post(
  '/api/pliegos/subir',
  express.raw({ type: '*/*', limit: '20mb' }),
  async (req, res) => {
    try {
      const id = sanitizeSafeId(String(req.headers['x-pliego-id'] || `pliego_${Date.now()}`), 'pliegoId');
      const destinoRaw = String(req.headers['x-upload-destino'] || 'pliego');
      const destino: DestinoSubida =
        destinoRaw === 'planoA' || destinoRaw === 'planoB' || destinoRaw === 'chatPdf'
          ? destinoRaw
          : 'pliego';
      const nombreRaw = String(req.headers['x-pliego-nombre'] || 'documento.pdf');
      const nombre = decodeURIComponent(nombreRaw);
      const tipoMime = String(req.headers['x-pliego-mime'] || 'application/pdf');
      const fechaSubida = decodeURIComponent(
        String(req.headers['x-pliego-fecha'] || new Date().toLocaleDateString('es-AR'))
      );

      const buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || '');
      if (!buffer || buffer.length === 0) {
        res.status(400).json({ exito: false, error: 'Archivo vacío o no recibido' });
        return;
      }

      if (destino === 'chatPdf') {
        const adj = await indexarChatAdjuntoBuffer({
          id,
          nombre,
          tipoMime,
          buffer,
          fechaSubida,
        });
        chatAdjuntos = [adj, ...chatAdjuntos.filter(a => a.id !== adj.id)];
        const clienteAi = obtenerClienteGeminiActivo();
        if (adj.esEscaneado && clienteAi) {
          asegurarGeminiFileUri(adj as unknown as PliegoIndexado, clienteAi).catch(() => {});
        }
        res.json({
          exito: true,
          adjuntoChat: toChatAdjuntoCliente(adj),
        });
        return;
      }

      if (destino === 'planoA' || destino === 'planoB') {
        const rol = destino === 'planoA' ? 'A' : 'B';
        const plano = await indexarPlanoComparadorBuffer({
          rol,
          id,
          nombre,
          tipoMime,
          buffer,
          fechaSubida,
        });
        planosComparador[rol] = plano;
        res.json({
          exito: true,
          plano: toPlanoComparadorCliente(plano),
        });
        return;
      }

      const indexado = await procesarArchivoPliego({
        id,
        nombre,
        tipoMime,
        buffer,
        fechaSubida,
      });

      pliegosIndexados = [indexado, ...pliegosIndexados.filter(p => p.id !== indexado.id)];

      if (indexado.esEscaneado && ai) {
        asegurarGeminiFileUri(indexado, ai).catch(() => {});
      }

      console.log(
        `[Pliegos] Indexado "${indexado.nombre}" (${indexado.paginas} págs, ${indexado.caracteresTexto} chars, escaneado=${indexado.esEscaneado}) en ${indexado.tiempoProcesoMs} ms`
      );

      res.json({
        exito: true,
        pliego: toPliegoResumenCliente(indexado),
        totalPliegos: pliegosIndexados.length,
      });
    } catch (err: any) {
      const status = err?.status === 400 ? 400 : 500;
      console.error('[Pliegos] Error en /api/pliegos/subir:', err);
      res.status(status).json({ exito: false, error: err?.message || 'Error procesando archivo' });
    }
  }
);

// Endpoint para recibir fragmentos binarios (chunks de ~4 MB) para pliegos pesados (250 MB+)
app.post(
  '/api/pliegos/subir/chunk',
  express.raw({ type: '*/*', limit: '20mb' }),
  (req, res) => {
    try {
      const id = sanitizeSafeId(String(req.headers['x-pliego-id'] || ''), 'pliegoId');
      const offset = Number(req.headers['x-chunk-offset'] || 0);
      if (Number.isNaN(offset) || offset < 0) {
        res.status(400).json({ exito: false, error: 'Encabezados de fragmento inválidos' });
        return;
      }

      const partPath = getRutaStaging(id);
      if (!fs.existsSync(partPath)) {
        res.status(404).json({ exito: false, error: 'Sesión de subida no inicializada' });
        return;
      }

      const chunkBuf = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || '');
      const fd = fs.openSync(partPath, 'r+');
      try {
        fs.writeSync(fd, chunkBuf, 0, chunkBuf.length, offset);
      } finally {
        fs.closeSync(fd);
      }

      res.json({ exito: true, bytesEscritos: chunkBuf.length });
    } catch (err: any) {
      const status = err?.status === 400 ? 400 : 500;
      console.error('[Pliegos] Error en /api/pliegos/subir/chunk:', err);
      res.status(status).json({ exito: false, error: err?.message || 'Error escribiendo fragmento' });
    }
  }
);

// Subida directa de archivo de Minuta de Reunión (PDF / DOCX / TXT) con extracción automática de compromisos
app.post(
  '/api/minutas/subir',
  express.raw({ type: '*/*', limit: '25mb' }),
  async (req, res) => {
    try {
      const nombre = decodeURIComponent(String(req.headers['x-minuta-nombre'] || 'minuta.pdf'));
      const tipoMime = String(req.headers['x-minuta-mime'] || 'application/pdf');
      const codigoHeader = decodeURIComponent(String(req.headers['x-minuta-codigo'] || ''));
      const tituloHeader = decodeURIComponent(String(req.headers['x-minuta-titulo'] || ''));
      const fechaHeader = decodeURIComponent(String(req.headers['x-minuta-fecha'] || ''));
      const frenteHeader = decodeURIComponent(String(req.headers['x-minuta-frente'] || ''));
      const participantesHeader = decodeURIComponent(String(req.headers['x-minuta-participantes'] || ''));

      const buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || '');
      if (!buffer || buffer.length === 0) {
        res.status(400).json({ exito: false, error: 'Archivo de minuta vacío o no recibido.' });
        return;
      }

      const contenidoTexto = await extraerTextoMinutaBuffer(buffer, nombre, tipoMime);
      if (!contenidoTexto || contenidoTexto.trim().length < 5) {
        res.status(422).json({
          exito: false,
          error: 'No se pudo extraer texto legible del archivo de minuta. Verifica que el PDF tenga texto seleccionable o pega el contenido manualmente.',
        });
        return;
      }

      const meta = inferirMetadatosMinuta({
        nombreArchivo: nombre,
        codigo: codigoHeader,
        titulo: tituloHeader,
        fechaReunion: fechaHeader,
        frente: frenteHeader,
        participantes: participantesHeader,
        contenidoTexto,
      });

      const minutaId = `min_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const nuevaMinuta: MinutaReunion = {
        id: minutaId,
        codigo: meta.codigo,
        titulo: meta.titulo,
        fechaReunion: meta.fechaReunion,
        frente: meta.frente,
        participantes: meta.participantes,
        origen: 'archivo',
        nombreArchivo: nombre,
        contenidoTexto: contenidoTexto.slice(0, 120000),
        fechaCarga: new Date().toLocaleDateString('es-AR'),
      };

      const clienteAi = obtenerClienteGeminiActivo();
      const analisis = await analizarYExtraerCompromisosMinuta({
        minuta: nuevaMinuta,
        ai: clienteAi,
        model: GEMINI_MODEL,
      });
      nuevaMinuta.resumen = analisis.resumen;

      storeMinutas.minutas = [nuevaMinuta, ...storeMinutas.minutas];
      storeMinutas.compromisos = [...analisis.compromisos, ...storeMinutas.compromisos];
      guardarStoreMinutas(storeMinutas);

      res.json({
        exito: true,
        minuta: nuevaMinuta,
        compromisosExtraidos: analisis.compromisos,
        fuenteExtraccion: analisis.fuente,
      });
    } catch (err: any) {
      console.error('[Minutas] Error en /api/minutas/subir:', err);
      res.status(500).json({ exito: false, error: err?.message || 'Error procesando minuta.' });
    }
  }
);

// Subida directa de archivo de Nota de Libro (PDF / DOCX / TXT) con detección de actores y Q&A
app.post(
  '/api/notas-libro/subir',
  express.raw({ type: '*/*', limit: '25mb' }),
  async (req, res) => {
    try {
      const nombre = decodeURIComponent(String(req.headers['x-nota-nombre'] || 'nota_libro.pdf'));
      const tipoMime = String(req.headers['x-nota-mime'] || 'application/pdf');

      const buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || '');
      if (!buffer || buffer.length === 0) {
        res.status(400).json({ exito: false, error: 'Archivo de nota vacío o no recibido.' });
        return;
      }

      const clienteAi = obtenerClienteGeminiActivo();
      let texto = await extraerTextoMinutaBuffer(buffer, nombre, tipoMime);

      if (
        isModelosPagosHabilitados() &&
        (!texto || texto.trim().length < 25) &&
        (tipoMime === 'application/pdf' || nombre.toLowerCase().endsWith('.pdf')) &&
        clienteAi &&
        buffer.length <= 18 * 1024 * 1024
      ) {
        try {
          const { response: ocr } = await generarContenidoConFallback({
            ai: clienteAi,
            contents: [
              {
                inlineData: {
                  mimeType: 'application/pdf',
                  data: buffer.toString('base64'),
                },
              },
              {
                text: `Transcribe íntegramente esta nota del Libro de Comunicaciones ("${nombre}") incluyendo código, fecha, emisor, receptor, referencias, pedidos y respuestas.`,
              },
            ],
            config: { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } },
            timeoutMs: 20000,
          });
          if (ocr.text?.trim()) texto = ocr.text.trim();
        } catch {}
      }

      if (!texto || texto.trim().length < 5) {
        res.status(422).json({
          exito: false,
          error: 'No se pudo extraer texto legible de la nota. Verifica que el PDF sea legible o pega el texto manualmente.',
        });
        return;
      }

      const notaId = `nl_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const nuevaNota = await analizarNotaLibroConIA({
        id: notaId,
        nombreArchivo: nombre,
        texto,
        origen: 'archivo',
        ai: clienteAi,
        model: GEMINI_MODEL,
      });

      storeNotasLibro = recalcularHilosYRespuestas([nuevaNota, ...storeNotasLibro]);
      guardarStoreNotasLibro(storeNotasLibro);

      const notaFinal = storeNotasLibro.find(n => n.id === notaId) || nuevaNota;
      res.json({
        exito: true,
        nota: notaFinal,
        notasLibro: storeNotasLibro,
      });
    } catch (err: any) {
      console.error('[NotasLibro] Error en /api/notas-libro/subir:', err);
      res.status(500).json({ exito: false, error: err?.message || 'Error procesando nota de libro.' });
    }
  }
);

// Subida directa de audio de reunión chico (< 3.5 MB) con procesamiento asíncrono unificado
app.post(
  '/api/minutas/audio/subir-directo',
  express.raw({ type: '*/*', limit: '20mb' }),
  (req, res) => {
    try {
      depurarJobsAudioAntiguos();
      const id = sanitizeSafeId(
        String(req.headers['x-audio-id'] || `maud_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`),
        'audioMinutaId'
      );
      const nombre = decodeAudioHeader(req.headers['x-audio-nombre'], 'reunion.webm');
      const tipoMime = String(req.headers['x-audio-mime'] || 'audio/webm');
      const motorRaw = String(req.headers['x-audio-motor'] || 'gratuito');

      const buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || '');
      if (!buffer || buffer.length === 0) {
        res.status(400).json({ exito: false, error: 'Archivo de audio vacío o no recibido.' });
        return;
      }

      const uploadPath = getRutaAudioUploadTemp(id);
      fs.writeFileSync(uploadPath, buffer);

      const job: JobAudioMinuta = {
        id,
        nombre,
        tipoMime,
        totalBytes: buffer.length,
        modeloMinutaId: decodeAudioHeader(req.headers['x-audio-modelo-id'], ''),
        codigo: decodeAudioHeader(req.headers['x-audio-codigo'], ''),
        titulo: decodeAudioHeader(req.headers['x-audio-titulo'], ''),
        fechaReunion: decodeAudioHeader(req.headers['x-audio-fecha'], ''),
        frente: decodeAudioHeader(req.headers['x-audio-frente'], ''),
        participantes: decodeAudioHeader(req.headers['x-audio-participantes'], ''),
        motor: isModelosPagosHabilitados() && motorRaw === 'gemini' ? 'gemini' : 'gratuito',
        estado: 'procesando',
        progreso: 5,
        detalle: 'Audio recibido. Iniciando segmentación y transcripción...',
        creadoEn: Date.now(),
      };
      jobsAudioMinuta.set(id, job);
      ejecutarProcesamientoAudioAsync(job, uploadPath);

      res.json({ exito: true, jobId: id });
    } catch (err: any) {
      const status = err?.status === 400 ? 400 : 500;
      res.status(status).json({
        exito: false,
        error: sanitizarErrorGroq(err?.message || 'Error recibiendo audio de minuta.'),
      });
    }
  }
);

// Recepción de fragmentos binarios (~4 MB) para audios largos (hasta 2+ horas / 250 MB)
app.post(
  '/api/minutas/audio/subir/chunk',
  express.raw({ type: '*/*', limit: '20mb' }),
  (req, res) => {
    try {
      const id = sanitizeSafeId(String(req.headers['x-audio-id'] || ''), 'audioMinutaId');
      const offset = Number(req.headers['x-chunk-offset'] || 0);
      if (Number.isNaN(offset) || offset < 0) {
        res.status(400).json({ exito: false, error: 'Encabezados de fragmento de audio inválidos.' });
        return;
      }

      const partPath = getRutaAudioStaging(id);
      if (!fs.existsSync(partPath)) {
        res.status(404).json({ exito: false, error: 'Sesión de subida de audio no inicializada.' });
        return;
      }

      const chunkBuf = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || '');
      const fd = fs.openSync(partPath, 'r+');
      try {
        fs.writeSync(fd, chunkBuf, 0, chunkBuf.length, offset);
      } finally {
        fs.closeSync(fd);
      }

      res.json({ exito: true, bytesEscritos: chunkBuf.length });
    } catch (err: any) {
      const status = err?.status === 400 ? 400 : 500;
      res.status(status).json({
        exito: false,
        error: sanitizarErrorGroq(err?.message || 'Error guardando fragmento de audio.'),
      });
    }
  }
);

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Inicializar sesión de subida fragmentada para archivos pesados (pliegos o planos CAD PDF)
app.post('/api/pliegos/subir/init', (req, res) => {
  try {
    const { id: rawId, nombre, tipoMime, totalBytes, fechaSubida, destino } = req.body || {};
    if (!rawId || !nombre) {
      res.status(400).json({ exito: false, error: 'Datos de inicialización incompletos' });
      return;
    }
    const id = sanitizeSafeId(rawId, 'pliegoId');

    const dest: DestinoSubida =
      destino === 'planoA' || destino === 'planoB' || destino === 'chatPdf' ? destino : 'pliego';

    const partPath = getRutaStaging(id);
    fs.writeFileSync(partPath, Buffer.alloc(0));

    jobsSubida.set(id, {
      id,
      destino: dest,
      nombre,
      tipoMime: tipoMime || 'application/pdf',
      totalBytes: Number(totalBytes) || 0,
      fechaSubida: fechaSubida || new Date().toLocaleDateString('es-AR'),
      estado: 'subiendo',
      progreso: 0,
      detalle: 'Preparando subida por partes...',
    });

    res.json({ exito: true, id });
  } catch (err: any) {
    const status = err?.status === 400 ? 400 : 500;
    res.status(status).json({ exito: false, error: err?.message || 'Error inicializando subida' });
  }
});

// Finalizar subida por partes e iniciar extracción asíncrona (evita timeouts HTTP)
app.post('/api/pliegos/subir/finalizar', (req, res) => {
  try {
    const { id } = req.body || {};
    const job = id ? jobsSubida.get(id) : undefined;
    const partPath = id ? getRutaStaging(id) : '';

    if (!id || !job || !fs.existsSync(partPath)) {
      res.status(404).json({ exito: false, error: 'Archivo en progreso no encontrado' });
      return;
    }

    const uploadPath = getRutaUploadTemp(id);
    if (fs.existsSync(uploadPath)) fs.unlinkSync(uploadPath);
    fs.renameSync(partPath, uploadPath);

    const actualSize = fs.statSync(uploadPath).size;
    job.estado = 'procesando';
    job.progreso = 0;
    job.detalle = 'Iniciando lectura e indexación de páginas...';

    (async () => {
      try {
        if (job.destino === 'chatPdf') {
          const adj = await indexarChatAdjuntoDesdeArchivo({
            id: job.id,
            nombre: job.nombre,
            tipoMime: job.tipoMime,
            rutaArchivo: uploadPath,
            tamanioBytes: actualSize || job.totalBytes,
            fechaSubida: job.fechaSubida,
            onProgress: (procesadas, total) => {
              const pct = total > 0 ? Math.min(99, Math.round((procesadas / total) * 100)) : 50;
              job.progreso = pct;
              job.detalle = `Extrayendo texto de adjunto Chat: página ${procesadas} de ${total}...`;
            },
          });
          chatAdjuntos = [adj, ...chatAdjuntos.filter(a => a.id !== adj.id)];
          const clienteAi = obtenerClienteGeminiActivo();
          if (adj.esEscaneado && clienteAi) {
            asegurarGeminiFileUri(adj as unknown as PliegoIndexado, clienteAi).catch(() => {});
          }
          job.estado = 'completado';
          job.progreso = 100;
          job.detalle = `PDF adjunto listo (${adj.paginas} págs)`;
          job.adjuntoChat = toChatAdjuntoCliente(adj);
          return;
        }

        if (job.destino === 'planoA' || job.destino === 'planoB') {
          const rol = job.destino === 'planoA' ? 'A' : 'B';
          const plano = await indexarPlanoComparadorDesdeArchivo({
            rol,
            id: job.id,
            nombre: job.nombre,
            tipoMime: job.tipoMime,
            rutaArchivo: uploadPath,
            tamanioBytes: actualSize || job.totalBytes,
            fechaSubida: job.fechaSubida,
            onProgress: (procesadas, total) => {
              const pct = total > 0 ? Math.min(99, Math.round((procesadas / total) * 100)) : 50;
              job.progreso = pct;
              job.detalle = `Analizando Plano ${rol}: página ${procesadas} de ${total}...`;
            },
          });
          planosComparador[rol] = plano;
          job.estado = 'completado';
          job.progreso = 100;
          job.detalle = `Plano ${rol} indexado (${plano.paginas} págs)`;
          job.plano = toPlanoComparadorCliente(plano);
          return;
        }

        const indexado = await procesarArchivoDesdeDisco({
          id: job.id,
          nombre: job.nombre,
          tipoMime: job.tipoMime,
          rutaArchivo: uploadPath,
          tamanioBytes: actualSize || job.totalBytes,
          fechaSubida: job.fechaSubida,
          onProgress: (procesadas, total) => {
            const pct = total > 0 ? Math.min(99, Math.round((procesadas / total) * 100)) : 50;
            job.progreso = pct;
            job.detalle = `Extrayendo texto: página ${procesadas} de ${total}...`;
          },
        });

        pliegosIndexados = [indexado, ...pliegosIndexados.filter(p => p.id !== indexado.id)];

        if (indexado.esEscaneado && ai) {
          job.detalle = 'Subiendo PDF escaneado a Gemini Files API (una sola vez)...';
          asegurarGeminiFileUri(indexado, ai).catch(() => {});
        }

        const resumenCliente = toPliegoResumenCliente(indexado);
        job.estado = 'completado';
        job.progreso = 100;
        job.detalle = `Indexado en ${indexado.tiempoProcesoMs} ms (${indexado.paginas} páginas)`;
        job.pliego = resumenCliente;

        console.log(
          `[Pliegos Pesados] Indexado "${indexado.nombre}" (${indexado.tamanioTexto}, ${indexado.paginas} págs, ${indexado.caracteresTexto} chars, escaneado=${indexado.esEscaneado}) en ${indexado.tiempoProcesoMs} ms`
        );
      } catch (err: any) {
        console.error(`[Subida Pesada] Error procesando "${job.nombre}":`, err);
        job.estado = 'error';
        job.error = err?.message || 'Error indexando el archivo';
        try {
          if (fs.existsSync(uploadPath)) fs.unlinkSync(uploadPath);
        } catch {}
      }
    })();

    res.json({ exito: true, jobId: id });
  } catch (err: any) {
    res.status(500).json({ exito: false, error: err?.message || 'Error finalizando subida' });
  }
});

// Consultar progreso de extracción
app.get('/api/pliegos/subir/estado/:id', (req, res) => {
  const job = jobsSubida.get(req.params.id);
  if (!job) {
    res.status(404).json({ exito: false, error: 'Trabajo de indexación no encontrado' });
    return;
  }
  res.json({
    exito: true,
    estado: job.estado,
    progreso: job.progreso,
    detalle: job.detalle,
    pliego: job.pliego,
    plano: job.plano,
    adjuntoChat: job.adjuntoChat,
    error: job.error,
  });
});

// Endpoints de adjuntos PDF dentro del Chat IA
app.get('/api/chat/adjuntos', (_req, res) => {
  res.json({
    exito: true,
    adjuntos: chatAdjuntos.map(toChatAdjuntoCliente),
  });
});

app.post('/api/chat/adjuntos/hidratar', (req, res) => {
  try {
    const incoming = Array.isArray(req.body?.adjuntos) ? req.body.adjuntos : [];
    const byId = new Map<string, ChatAdjuntoIndexado>();
    for (const a of chatAdjuntos) {
      byId.set(a.id, a);
    }
    for (const item of incoming) {
      if (!item?.id || !item?.nombre) continue;
      const safeId = sanitizeSafeId(String(item.id), 'adjuntoId');
      if (!byId.has(safeId)) {
        const adj: ChatAdjuntoIndexado = {
          id: safeId,
          nombre: String(item.nombre),
          tipoMime: String(item.tipoMime || 'application/pdf'),
          tamanioBytes: Number(item.tamanioBytes || 0),
          tamanioTexto: String(item.tamanioTexto || '0 KB'),
          fechaSubida: String(item.fechaSubida || ''),
          contenidoTexto: String(item.contenidoTexto || ''),
          paginas: Number(item.paginas || 1),
          caracteresTexto: Number(item.caracteresTexto || (item.contenidoTexto || '').length),
          esEscaneado: Boolean(item.esEscaneado),
          tiempoProcesoMs: Number(item.tiempoProcesoMs || 0),
          metricasDetectadas: Array.isArray(item.metricasDetectadas) ? item.metricasDetectadas : [],
        };
        byId.set(safeId, adj);
        guardarChatAdjunto(adj);
      }
    }
    chatAdjuntos = Array.from(byId.values());
    res.json({
      exito: true,
      total: chatAdjuntos.length,
      adjuntos: chatAdjuntos.map(toChatAdjuntoCliente),
    });
  } catch (err: any) {
    const status = err?.status === 400 ? 400 : 500;
    res.status(status).json({ exito: false, error: err?.message || 'Error hidratando adjuntos.' });
  }
});

app.delete('/api/chat/adjuntos/:id', (req, res) => {
  try {
    const safeId = sanitizeSafeId(req.params.id, 'adjuntoId');
    chatAdjuntos = chatAdjuntos.filter(a => a.id !== safeId);
    eliminarChatAdjuntoDisco(safeId);
    res.json({ exito: true, totalRestantes: chatAdjuntos.length });
  } catch (err: any) {
    const status = err?.status === 400 ? 400 : 500;
    res.status(status).json({ exito: false, error: err?.message || 'ID de adjunto inválido' });
  }
});

app.post('/api/chat/adjuntos/limpiar', (_req, res) => {
  chatAdjuntos = [];
  limpiarChatAdjuntosDisco();
  res.json({ exito: true });
});

// Endpoints del Comparador de Planos PDF
app.get('/api/comparador/planos', (req, res) => {
  const esMaestro = esUsuarioMaestroRequest(req);
  const info = getLastWorkingGeminiInfo({ esMaestro });
  res.json({
    exito: true,
    planoA: toPlanoComparadorCliente(planosComparador.A),
    planoB: toPlanoComparadorCliente(planosComparador.B),
    tieneGeminiKey: isModelosPagosHabilitados() && Boolean(obtenerClienteGeminiActivo()),
    modelo: info.modelo || OPENROUTER_FREE_MODEL,
    modelosDisponibles: info.modelosTextoDisponibles,
    modeloPreferido: info.modeloPreferido,
    ultimoErrorGemini: isModelosPagosHabilitados() ? getUltimoErrorGemini() : null,
  });
});

app.get('/api/gemini/config', async (req, res) => {
  await refrescarModelosGratuitosOpenRouter(false);
  const esMaestro = esUsuarioMaestroRequest(req);
  res.json({
    exito: true,
    ...getLastWorkingGeminiInfo({ esMaestro }),
  });
});

app.post('/api/gemini/config', (req, res) => {
  const esMaestro = esUsuarioMaestroRequest(req);
  const {
    nivelPreferido,
    modeloPreferido,
    politicaLimite,
    openRouterModeloPreferido,
    limitesPorModelo,
  } = req.body || {};

  const nivelStr = typeof nivelPreferido === 'string' ? nivelPreferido.trim() : undefined;
  if (
    !isModelosPagosHabilitados() &&
    !esMaestro &&
    nivelStr &&
    nivelStr !== 'gratuito'
  ) {
    res.status(403).json({
      exito: false,
      error: 'Los modelos pagos están desactivados por el administrador maestro.',
      ...getLastWorkingGeminiInfo({ esMaestro }),
    });
    return;
  }

  updateGeminiPrecisionConfig({
    nivelPreferido: nivelStr,
    modeloPreferido: typeof modeloPreferido === 'string' ? modeloPreferido.trim() : undefined,
    politicaLimite: typeof politicaLimite === 'string' ? politicaLimite.trim() : undefined,
    openRouterModeloPreferido:
      typeof openRouterModeloPreferido === 'string' ? openRouterModeloPreferido.trim() : undefined,
    limitesPorModelo:
      limitesPorModelo && typeof limitesPorModelo === 'object' ? limitesPorModelo : undefined,
  });
  res.json({
    exito: true,
    ...getLastWorkingGeminiInfo({ esMaestro }),
  });
});

app.post('/api/gemini/master-control', (req, res) => {
  if (!esUsuarioMaestroRequest(req)) {
    res.status(403).json({
      exito: false,
      error: `Solo el administrador maestro (${MASTER_ADMIN_EMAIL}) puede habilitar o deshabilitar los modelos pagos.`,
    });
    return;
  }

  const habilitado = req.body?.modelosPagosHabilitados;
  if (typeof habilitado !== 'boolean') {
    res.status(400).json({
      exito: false,
      error: 'El parámetro booleano modelosPagosHabilitados es obligatorio.',
    });
    return;
  }

  setModelosPagosHabilitados(habilitado, { esMaestro: true });
  res.json({
    exito: true,
    ...getLastWorkingGeminiInfo({ esMaestro: true }),
  });
});

app.post('/api/gemini/reset-uso', (req, res) => {
  const esMaestro = esUsuarioMaestroRequest(req);
  const { modelo } = req.body || {};
  resetGeminiUsoDiario(typeof modelo === 'string' ? modelo.trim() : undefined);
  res.json({
    exito: true,
    ...getLastWorkingGeminiInfo({ esMaestro }),
  });
});

function obtenerEstadoProceso() {
  return {
    pid: process.pid,
    nodeVersion: process.version,
    platform: process.platform,
    uptimeSegundos: Math.round(process.uptime()),
    nodeEnv: process.env.NODE_ENV || 'no definido',
    puerto: PORT,
    clienteSdkInicializado: isModelosPagosHabilitados() ? Boolean(obtenerClienteGeminiActivo()) : false,
    fuenteClienteActivo: isModelosPagosHabilitados() ? geminiKeySource : 'OPENROUTER_FREE',
    pliegosEnMemoria: pliegosIndexados.length,
    timestamp: new Date().toISOString(),
  };
}

async function ejecutarDiagnosticoGemini(_req: express.Request, res: express.Response) {
  const t0 = Date.now();
  const pagosHabilitados = isModelosPagosHabilitados();
  if (pagosHabilitados) {
    const recarga = inicializarGemini();
    if (recarga.client) {
      ai = recarga.client;
      geminiKeySource = recarga.keySource;
    }
  }

  const {
    variablesEntorno,
    infoApiKey,
    infoGeminiKey,
    infoGoogleKey,
    hayPlantillaIgnorada,
  } = obtenerResumenVariablesEntorno();

  const openRouterEnv = obtenerResumenOpenRouterEnv();
  const openRouterKeys = obtenerCandidatosOpenRouterKeys();
  const candidatosKeys = pagosHabilitados ? obtenerCandidatosApiKeys() : [];
  const candidatoPrincipal = pagosHabilitados
    ? infoApiKey.validaParaUso
      ? infoApiKey
      : infoGeminiKey.validaParaUso
        ? infoGeminiKey
        : infoGoogleKey.validaParaUso
          ? infoGoogleKey
          : null
    : null;

  const partesVarDetectada = candidatosKeys.map(c => `${c.nombre} (${c.vistaSegura})`);
  if (openRouterEnv.configurado) {
    partesVarDetectada.push(`${openRouterEnv.nombreVariable} (${openRouterEnv.vistaSegura})`);
  }

  const variableDetectada =
    partesVarDetectada.length > 0
      ? partesVarDetectada.join(' · ')
      : !pagosHabilitados
        ? 'Solo modo gratuito (OPENROUTER_API_KEY / GROQ_API_KEY no detectadas)'
        : infoGeminiKey.esPlantilla
          ? `GEMINI_API_KEY (${infoGeminiKey.vistaSegura})`
          : infoApiKey.esPlantilla
            ? `API_KEY (${infoApiKey.vistaSegura})`
            : 'Ninguna definida';

  const estadoProceso = obtenerEstadoProceso();
  const modeloPreferido = getPreferredGeminiModel();
  const modelosDisponibles = pagosHabilitados
    ? [...DEFAULT_TEXT_MODELS, OPENROUTER_FREE_MODEL]
    : [OPENROUTER_FREE_MODEL];

  if (candidatosKeys.length === 0 && !candidatoPrincipal && openRouterKeys.length === 0) {
    res.json({
      ok: false,
      estado: !pagosHabilitados
        ? 'SOLO_GRATUITO_SIN_CLAVE_OPENROUTER'
        : hayPlantillaIgnorada
          ? 'PLANTILLA_NO_REEMPLAZADA'
          : 'CLAVE_AUSENTE',
      codigoHttp: null,
      modelo: pagosHabilitados ? GEMINI_MODEL : OPENROUTER_FREE_MODEL,
      modeloPreferido,
      modelosDisponibles,
      resultadosPorModelo: [] as IntentoModeloResultado[],
      variableDetectada,
      latenciaMs: Date.now() - t0,
      estadoProceso,
      variablesEntorno: {
        ...(pagosHabilitados ? variablesEntorno : {}),
        OPENROUTER_API_KEY: {
          definida: openRouterEnv.configurado,
          longitud: openRouterEnv.configurado ? 1 : 0,
          esPlantilla: false,
          vistaSegura: openRouterEnv.vistaSegura,
        },
      },
      errorTecnico: {
        nombre: hayPlantillaIgnorada && pagosHabilitados ? 'PlaceholderApiKeyIgnored' : 'MissingApiKeyError',
        codigoHttp: null,
        statusText: !pagosHabilitados ? 'OPENROUTER_KEY_MISSING' : 'ENV_VAR_MISSING',
        mensaje: !pagosHabilitados
          ? 'Modo gratuito activo: no se detectó OPENROUTER_API_KEY en el servidor.'
          : 'No se encontró ninguna clave válida en API_KEY, GEMINI_API_KEY ni OPENROUTER_API_KEY.',
        causa: null,
        pingEjecutado: false,
        stackResumen: null,
      },
      detalle: !pagosHabilitados
        ? 'El sistema opera exclusivamente en modo gratuito ($0). Configura OPENROUTER_API_KEY en Settings > Secrets para probar el motor OpenRouter :free.'
        : 'No se encontró ninguna clave en API_KEY, GEMINI_API_KEY ni OPENROUTER_API_KEY. Configúrala en Settings > Secrets y recarga el entorno.',
    });
    return;
  }

  // Probar TODOS los modelos habilitados en vivo (Gemini solo si modelosPagosHabilitados === true + OpenRouter :free)
  const resultadosPorModelo: IntentoModeloResultado[] = [];
  let ganador: IntentoModeloResultado | null = null;
  let ultimoErrObj: any = null;

  if (pagosHabilitados) {
    for (const kc of candidatosKeys) {
      for (const modeloTest of DEFAULT_TEXT_MODELS) {
        const mT0 = Date.now();
        try {
          const resp = await kc.client.models.generateContent({
            model: modeloTest,
            contents: 'Responde únicamente con la palabra: OK',
            config: {
              thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            },
          });
          const txt = (resp.text || '').trim();
          const item: IntentoModeloResultado = {
            modelo: modeloTest,
            fuenteClave: kc.nombre,
            ok: true,
            codigoHttp: 200,
            estado: 'CONECTADA',
            latenciaMs: Date.now() - mT0,
            respuestaModelo: txt.slice(0, 60) || '(sin texto)',
          };
          resultadosPorModelo.push(item);
          if (!ganador) ganador = item;
        } catch (err: any) {
          ultimoErrObj = err;
          const infoErr = clasificarErrorGemini(err);
          resultadosPorModelo.push({
            modelo: modeloTest,
            fuenteClave: kc.nombre,
            ok: false,
            codigoHttp: infoErr.codigoHttp,
            estado: infoErr.estado,
            latenciaMs: Date.now() - mT0,
            detalleError: infoErr.mensaje.slice(0, 300),
          });
        }
      }
    }
  }

  if (openRouterKeys.length > 0) {
    const orModel = getOpenRouterModeloPreferido();
    const orT0 = Date.now();
    try {
      const orPing = await generarChatOpenRouter({
        parts: [{ text: 'Responde únicamente con la palabra: OK' }],
        systemInstruction: 'Responde únicamente con OK.',
        model: orModel,
        timeoutMs: 15000,
      });
      const itemOr: IntentoModeloResultado = {
        modelo: orPing.modelUsed || orModel,
        fuenteClave: orPing.keySourceUsed,
        ok: true,
        codigoHttp: 200,
        estado: 'CONECTADA',
        latenciaMs: Date.now() - orT0,
        respuestaModelo: orPing.texto.slice(0, 60) || 'OK',
      };
      resultadosPorModelo.push(itemOr);
      if (!ganador) ganador = itemOr;
    } catch (errOr: any) {
      ultimoErrObj = ultimoErrObj || errOr;
      const infoOr = clasificarErrorOpenRouter(
        typeof errOr?.status === 'number' ? errOr.status : null,
        errOr?.message || String(errOr)
      );
      resultadosPorModelo.push({
        modelo: orModel,
        fuenteClave: openRouterKeys[0].nombre,
        ok: false,
        codigoHttp: infoOr.codigoHttp,
        estado: infoOr.estado,
        latenciaMs: Date.now() - orT0,
        detalleError: infoOr.mensaje.slice(0, 300),
      });
    }
  }

  if (ganador) {
    clearUltimoErrorGemini();
    const fallidos = resultadosPorModelo.filter(r => !r.ok);
    const notaParcial =
      fallidos.length > 0
        ? ` (${fallidos.map(f => `${f.modelo}: ${f.estado} ${f.codigoHttp || ''}`).join('; ')}; conmutación automática activa hacia ${ganador.modelo}).`
        : '';

    res.json({
      ok: true,
      estado: 'CONECTADA',
      codigoHttp: 200,
      modelo: ganador.modelo,
      modeloPreferido,
      modelosDisponibles,
      resultadosPorModelo,
      variableDetectada,
      latenciaMs: Date.now() - t0,
      respuestaModelo: ganador.respuestaModelo,
      estadoProceso: obtenerEstadoProceso(),
      variablesEntorno,
      errorTecnico: null,
      detalle: `Conexión verificada con ${ganador.modelo} usando ${ganador.fuenteClave}.${notaParcial}`,
    });
    return;
  }

  const ultimoResultado = resultadosPorModelo[resultadosPorModelo.length - 1];
  const infoUltimo = clasificarErrorGemini(ultimoErrObj);
  setUltimoErrorGemini(
    `${infoUltimo.codigoHttp ? `[${infoUltimo.codigoHttp}] ` : ''}${infoUltimo.mensaje}`
  );

  const es402Todos = resultadosPorModelo.some(r => r.estado === 'CREDITOS_AGOTADOS');

  res.json({
    ok: false,
    estado: es402Todos ? 'CREDITOS_AGOTADOS' : ultimoResultado?.estado || infoUltimo.estado,
    codigoHttp: ultimoResultado?.codigoHttp ?? infoUltimo.codigoHttp,
    modelo: modelosDisponibles.join(' · '),
    modeloPreferido,
    modelosDisponibles,
    resultadosPorModelo,
    variableDetectada,
    latenciaMs: Date.now() - t0,
    estadoProceso,
    variablesEntorno,
    errorTecnico: {
      nombre: ultimoErrObj?.name || 'Error',
      codigoHttp: infoUltimo.codigoHttp,
      statusText: ultimoErrObj?.statusText || null,
      mensaje: infoUltimo.mensaje.slice(0, 500),
      causa: ultimoErrObj?.cause ? sanitizarTextoError(ultimoErrObj.cause?.message || ultimoErrObj.cause) : null,
      pingEjecutado: true,
      stackResumen:
        typeof ultimoErrObj?.stack === 'string'
          ? sanitizarTextoError(ultimoErrObj.stack.split('\n').slice(0, 3).join(' | '))
          : null,
    },
    detalle: es402Todos
      ? `Se probaron todos los modelos configurados (${modelosDisponibles.join(', ')}), pero la clave activa devolvió HTTP 402 (créditos prepagos agotados en Google AI Studio). Recarga saldo en https://ai.studio/projects o configura otra clave con cuota disponible en Settings > Secrets (GEMINI_API_KEY).`
      : infoUltimo.mensaje.slice(0, 400),
  });
}

// Diagnóstico / ping real a Google Gemini API (GET y POST para uso desde navegador, curl o UI)
app.get('/api/gemini/diagnostico', ejecutarDiagnosticoGemini);
app.post('/api/gemini/diagnostico', ejecutarDiagnosticoGemini);
app.get('/api/gemini/ping', ejecutarDiagnosticoGemini);
app.post('/api/gemini/ping', ejecutarDiagnosticoGemini);

app.delete('/api/comparador/planos/:rol', (req, res) => {
  const rol = req.params.rol === 'B' ? 'B' : 'A';
  planosComparador[rol] = null;
  eliminarPlanoComparadorDisco(rol);
  res.json({ exito: true });
});

app.post('/api/comparador/analizar/stream', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const enviar = (payload: Record<string, any>) => {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  try {
    const { enfoque = 'Auditoría completa de discrepancias entre planos y pliego' } = req.body || {};
    const planoA = planosComparador.A;
    const planoB = planosComparador.B;

    if (!planoA) {
      enviar({
        error: 'Debes cargar al menos el Plano A en PDF para iniciar la comparación.',
        done: true,
      });
      res.end();
      return;
    }

    const parts = await prepararPartesComparacion({
      planoA,
      planoB,
      pliegos: pliegosIndexados,
      enfoque,
      ai,
    });

    let avisoErrorGemini = '';
    const clienteAi = isModelosPagosHabilitados() ? obtenerClienteGeminiActivo() : null;
    if (clienteAi) {
      try {
        const { stream, modelUsed } = await generarStreamConFallback({
          ai: clienteAi,
          contents: { parts },
          config: {
            thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
            systemInstruction:
              'Eres un Inspector Jefe de Ingeniería Eléctrica 132 kV (Líneas de Alta Tensión y Estaciones Transformadoras). ' +
              'Tu trabajo es auditar planos en PDF (inspeccionando tanto texto como tablas, rótulos y detalles gráficos) comparando dos planos entre sí y contrastándolos contra los Pliegos de Licitación reales. ' +
              'Entrega siempre cuadros comparativos claros en tablas Markdown citando valores numéricos exactos, páginas y artículos. Nunca inventes especificaciones.',
          },
        });

        let huboTexto = false;
        for await (const chunk of stream) {
          const txt = chunk.text;
          if (txt) {
            huboTexto = true;
            enviar({ chunk: txt });
          }
        }
        if (huboTexto) {
          clearUltimoErrorGemini();
          enviar({ done: true, fuente: `${modelUsed}-multimodal` });
          res.end();
          return;
        }
      } catch (geminiErr: any) {
        console.warn('[Comparador Gemini Error]:', geminiErr?.message || geminiErr);
        avisoErrorGemini = formatearAvisoErrorGemini(geminiErr);
      }
    } else if (isModelosPagosHabilitados()) {
      avisoErrorGemini = obtenerAvisoSinClienteGemini();
    }

    const fallbackMd = compararPlanosLocalFallback({
      planoA,
      planoB,
      pliegos: pliegosIndexados,
      enfoque,
    });
    enviar({ chunk: `${avisoErrorGemini}${fallbackMd}`, done: true, fuente: 'comparador-local' });
    res.end();
  } catch (err: any) {
    enviar({ error: err?.message || 'Error ejecutando comparación', done: true });
    res.end();
  }
});

// 1. Obtener lista de pliegos reales cargados
app.get('/api/pliegos', (_req, res) => {
  res.json({
    exito: true,
    pliegos: pliegosIndexados.map(toPliegoResumenCliente),
    total: pliegosIndexados.length,
  });
});

// 1b. Obtener texto completo de un pliego indexado para sincronización completa en Firestore
app.get('/api/pliegos/:id/texto', (req, res) => {
  try {
    const safeId = sanitizeSafeId(req.params.id, 'pliegoId');
    const encontrado = pliegosIndexados.find(p => p.id === safeId);
    if (!encontrado) {
      res.status(404).json({ exito: false, error: 'Pliego no encontrado en caché del servidor' });
      return;
    }
    res.json({
      exito: true,
      id: encontrado.id,
      contenidoTexto: encontrado.contenidoTexto || '',
      caracteresTexto: encontrado.caracteresTexto || (encontrado.contenidoTexto || '').length,
    });
  } catch (err: any) {
    const status = err?.status === 400 ? 400 : 500;
    res.status(status).json({ exito: false, error: err?.message || 'Error obteniendo texto del pliego' });
  }
});

// 2. Cargar un pliego por texto pegado o JSON (compatibilidad)
app.post('/api/pliegos/cargar', async (req, res) => {
  try {
    const pliego: PliegoReal = req.body;
    if (!pliego || !pliego.nombre) {
      res.status(400).json({ exito: false, error: 'Datos de pliego inválidos' });
      return;
    }
    const safeId = sanitizeSafeId(pliego.id || `pliego_${Date.now()}`, 'pliegoId');

    let indexado: PliegoIndexado;
    if (pliego.dataBase64) {
      const buffer = Buffer.from(pliego.dataBase64, 'base64');
      indexado = await procesarArchivoPliego({
        id: safeId,
        nombre: pliego.nombre,
        tipoMime: pliego.tipoMime,
        buffer,
        fechaSubida: pliego.fechaSubida,
      });
      if (indexado.esEscaneado && ai) {
        asegurarGeminiFileUri(indexado, ai).catch(() => {});
      }
    } else {
      indexado = procesarTextoPliego({
        id: safeId,
        nombre: pliego.nombre,
        contenidoTexto: pliego.contenidoTexto || '',
        fechaSubida: pliego.fechaSubida,
      });
    }

    pliegosIndexados = [indexado, ...pliegosIndexados.filter(p => p.id !== indexado.id)];

    res.json({
      exito: true,
      pliego: toPliegoResumenCliente(indexado),
      mensaje: `Pliego "${indexado.nombre}" indexado en ${indexado.tiempoProcesoMs} ms`,
      totalPliegos: pliegosIndexados.length,
    });
  } catch (err: any) {
    const status = err?.status === 400 ? 400 : 500;
    res.status(status).json({ exito: false, error: err?.message || 'Error al guardar pliego' });
  }
});

// 3. Eliminar un pliego real
app.delete('/api/pliegos/:id', (req, res) => {
  try {
    const safeId = sanitizeSafeId(req.params.id, 'pliegoId');
    pliegosIndexados = pliegosIndexados.filter(p => p.id !== safeId);
    eliminarPliegoDeDisco(safeId);
    res.json({ exito: true, totalRestantes: pliegosIndexados.length });
  } catch (err: any) {
    const status = err?.status === 400 ? 400 : 500;
    res.status(status).json({ exito: false, error: err?.message || 'ID de pliego inválido' });
  }
});

// 4. Limpiar todos los pliegos reales
app.post('/api/pliegos/limpiar', (_req, res) => {
  pliegosIndexados = [];
  limpiarPliegosDeDisco();
  res.json({ exito: true, mensaje: 'Pliegos limpiados en el servidor' });
});

// =========================================================================================
// ENDPOINTS DE DOCUMENTOS TÉCNICOS DE GOOGLE DRIVE (MEMORIAS DESCRIPTIVAS, ESTUDIOS, ETC.)
// =========================================================================================

app.get('/api/drive-docs', (_req, res) => {
  res.json({
    exito: true,
    total: storeDriveDocumentos.length,
    docs: storeDriveDocumentos.map(d => ({
      id: d.id,
      driveFileId: d.driveFileId,
      nombre: d.nombre,
      rutaCarpeta: d.rutaCarpeta,
      driveUrl: d.driveUrl,
      paginas: d.paginas,
      caracteresTexto: d.caracteresTexto,
      fechaSubida: d.fechaSubida,
    })),
  });
});

app.post('/api/drive-docs/sincronizar', async (req, res) => {
  try {
    const authHeader = String(req.headers.authorization || '');
    const accessToken = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!accessToken) {
      res.status(401).json({
        exito: false,
        error: 'Se requiere iniciar sesión con Google Drive para indexar Memorias Descriptivas y documentos técnicos.',
      });
      return;
    }

    const folderId =
      typeof req.body?.folderId === 'string' && req.body.folderId.trim()
        ? req.body.folderId.trim()
        : DEFAULT_DRIVE_ROOT_FOLDER_ID;
    const maxNuevos =
      typeof req.body?.maxNuevos === 'number' && req.body.maxNuevos > 0
        ? Math.min(30, req.body.maxNuevos)
        : 15;

    const resultado = await sincronizarDocsTecnicosDriveCarpeta({
      accessToken,
      folderId,
      ai: obtenerClienteGeminiActivo(),
      storeActual: storeDriveDocumentos,
      maxNuevos,
    });

    storeDriveDocumentos = resultado.storeActualizado;

    res.json({
      exito: true,
      totalIndexados: resultado.totalIndexados,
      nuevos: resultado.nuevos,
      omitidosExistentes: resultado.omitidosExistentes,
      nombresNuevos: resultado.nombresNuevos,
      docs: storeDriveDocumentos.map(d => ({
        id: d.id,
        driveFileId: d.driveFileId,
        nombre: d.nombre,
        rutaCarpeta: d.rutaCarpeta,
        driveUrl: d.driveUrl,
        paginas: d.paginas,
        caracteresTexto: d.caracteresTexto,
        fechaSubida: d.fechaSubida,
      })),
    });
  } catch (err: any) {
    const status = err?.status === 401 ? 401 : 500;
    res.status(status).json({
      exito: false,
      error: err?.message || 'Error indexando documentos técnicos desde Google Drive.',
    });
  }
});

app.post('/api/drive/verificar', async (req, res) => {
  try {
    const authHeader = String(req.headers.authorization || '');
    const accessToken = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!accessToken) {
      res.status(401).json({
        exito: false,
        conectado: false,
        permisoLecturaDrive: false,
        error: 'No hay un token activo de Google Drive para verificar.',
      });
      return;
    }

    const folderId =
      typeof req.body?.folderId === 'string' && req.body.folderId.trim()
        ? req.body.folderId.trim()
        : DEFAULT_DRIVE_ROOT_FOLDER_ID;

    const diag = await verificarConexionDrive({
      accessToken,
      folderId,
      elencosFolderId: DEFAULT_ELENCOS_FOLDER_ID,
    });

    if (!diag.permisoLecturaDrive) {
      res.status(403).json({
        exito: false,
        ...diag,
        error: diag.sugerencia || 'Falta permiso de lectura de Google Drive (drive.readonly).',
      });
      return;
    }

    res.json({
      exito: true,
      ...diag,
    });
  } catch (err: any) {
    const httpStatus = Number(err?.status) === 401 ? 401 : Number(err?.status) === 403 ? 403 : 500;
    res.status(httpStatus).json({
      exito: false,
      conectado: false,
      permisoLecturaDrive: httpStatus !== 403,
      error: err?.message || 'No se pudo verificar la conexión con Google Drive.',
    });
  }
});

// =========================================================================================
// ENDPOINTS DE ELENCOS OFICIALES (SEGUIMIENTO DE ELENCOS / CARPETA DRIVE)
// =========================================================================================

app.get('/api/elencos', (_req, res) => {
  res.json({
    exito: true,
    ...storeElencos,
  });
});

app.post('/api/elencos/sincronizar-drive', async (req, res) => {
  try {
    const authHeader = String(req.headers.authorization || '');
    const accessToken = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!accessToken) {
      res.status(401).json({
        exito: false,
        error: 'Se requiere conectar Google Drive para leer la carpeta de Elencos y la hoja de Seguimiento.',
      });
      return;
    }

    const folderId =
      typeof req.body?.folderId === 'string' && req.body.folderId.trim()
        ? req.body.folderId.trim()
        : DEFAULT_ELENCOS_FOLDER_ID;

    const resultado = await sincronizarElencosDesdeGoogleDrive({
      accessToken,
      folderId,
      rootFolderId: DEFAULT_DRIVE_ROOT_FOLDER_ID,
      ai: obtenerClienteGeminiActivo(),
    });

    storeElencos = resultado;
    res.json({
      exito: true,
      ...storeElencos,
    });
  } catch (err: any) {
    const status = err?.status === 401 ? 401 : err?.status === 403 ? 403 : 500;
    const msg =
      status === 401
        ? 'Tu sesión de Google Drive expiró. Vuelve a conectar Google Drive e intenta nuevamente.'
        : err?.message || 'Error leyendo carpeta de Elencos desde Google Drive.';
    res.status(status).json({ exito: false, error: msg });
  }
});

// =========================================================================================
// ENDPOINTS DE INTERFERENCIAS Y CRUCES REALES DESDE GOOGLE DRIVE
// =========================================================================================

app.get('/api/interferencias', (_req, res) => {
  res.json({
    exito: true,
    interferencias: storeInterferencias,
  });
});

app.post('/api/interferencias/hidratar', (req, res) => {
  try {
    const incoming = Array.isArray(req.body?.interferencias)
      ? (req.body.interferencias as Interferencia[])
      : [];
    const MOCK_IDS = new Set(['INT-1', 'INT-2', 'INT-3', 'INT-4', 'INT-5']);
    const merged = new Map<string, Interferencia>();

    for (const existing of storeInterferencias) {
      if (existing?.id && !MOCK_IDS.has(existing.id)) {
        merged.set(existing.id, existing);
      }
    }
    for (const item of incoming) {
      const key = item?.id || item?.carpetaDriveId || item?.empresa;
      if (!key || (item.id && MOCK_IDS.has(item.id))) continue;
      merged.set(key, item);
    }

    storeInterferencias = Array.from(merged.values());
    guardarStoreInterferencias(storeInterferencias);

    res.json({
      exito: true,
      total: storeInterferencias.length,
      interferencias: storeInterferencias,
    });
  } catch (err: any) {
    res.status(500).json({ exito: false, error: err?.message || 'Error hidratando interferencias.' });
  }
});

app.post('/api/interferencias/sincronizar-drive', async (req, res) => {
  try {
    const authHeader = String(req.headers.authorization || '');
    const accessToken = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!accessToken) {
      res.status(401).json({
        exito: false,
        error: 'Se requiere iniciar sesión con Google para leer la carpeta "interferencias" en Google Drive.',
      });
      return;
    }

    const { folderId, forzarRelectura = false } = req.body || {};
    const clienteAi = obtenerClienteGeminiActivo();

    const syncRes = await sincronizarInterferenciasDesdeGoogleDrive({
      accessToken,
      folderId: folderId ? String(folderId).trim() : DEFAULT_DRIVE_ROOT_FOLDER_ID,
      interferenciasExistentes: storeInterferencias,
      forzarRelectura: Boolean(forzarRelectura),
      ai: clienteAi,
      model: GEMINI_MODEL,
    });

    storeInterferencias = syncRes.interferencias;
    guardarStoreInterferencias(storeInterferencias);

    res.json({
      exito: true,
      ...syncRes,
    });
  } catch (err: any) {
    const status = err?.status === 401 || err?.status === 403 ? err.status : 500;
    console.error('[DriveInterferencias] Error sincronizando desde Drive:', err);
    res.status(status).json({
      exito: false,
      error:
        status === 401
          ? 'Tu sesión de Google Drive expiró. Vuelve a conectar Google Drive e intenta nuevamente.'
          : err?.message || 'Error leyendo carpeta interferencias desde Google Drive.',
    });
  }
});

// =========================================================================================
// ENDPOINTS DE LIBRO DE COMUNICACIONES / NOTAS DE LIBRO (ACTORES Y PREGUNTAS/RESPUESTAS)
// =========================================================================================

app.get('/api/notas-libro', (_req, res) => {
  res.json({
    exito: true,
    notasLibro: storeNotasLibro,
    total: storeNotasLibro.length,
  });
});

app.post('/api/notas-libro/sincronizar-drive', async (req, res) => {
  try {
    const authHeader = String(req.headers.authorization || '');
    const accessToken = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!accessToken) {
      res.status(401).json({
        exito: false,
        error: 'Se requiere iniciar sesión con Google para leer las Notas de Libro desde Google Drive.',
      });
      return;
    }

    const { folderId, forzarRelectura = false, continuarLote = false } = req.body || {};
    const clienteAi = obtenerClienteGeminiActivo();

    const syncRes = await sincronizarNotasLibroDesdeGoogleDrive({
      accessToken,
      folderId: folderId ? String(folderId).trim() : DEFAULT_DRIVE_ROOT_FOLDER_ID,
      notasExistentes: storeNotasLibro,
      forzarRelectura: Boolean(forzarRelectura),
      continuarLote: Boolean(continuarLote),
      ai: clienteAi,
      model: GEMINI_MODEL,
    });

    storeNotasLibro = syncRes.notasLibro;
    guardarStoreNotasLibro(storeNotasLibro);

    res.json({
      exito: true,
      ...syncRes,
    });
  } catch (err: any) {
    const status = err?.status === 401 || err?.status === 403 ? err.status : 500;
    console.error('[DriveNotasLibro] Error sincronizando desde Drive:', err);
    res.status(status).json({
      exito: false,
      error:
        status === 401
          ? 'Tu sesión de Google Drive expiró. Vuelve a conectar Google Drive e intenta nuevamente.'
          : err?.message || 'Error leyendo Notas de Libro desde Google Drive.',
    });
  }
});

app.post('/api/notas-libro/registrar', async (req, res) => {
  try {
    const { nombreArchivo, titulo, contenidoTexto } = req.body || {};
    const texto = String(contenidoTexto || '').trim();
    if (!texto) {
      res.status(400).json({ exito: false, error: 'El contenido de la nota es obligatorio.' });
      return;
    }

    const clienteAi = obtenerClienteGeminiActivo();
    const notaId = `nl_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const procesada = await analizarNotaLibroConIA({
      id: notaId,
      nombreArchivo: String(nombreArchivo || titulo || 'Nota_Libro_Manual.txt'),
      texto,
      origen: 'texto',
      ai: clienteAi,
      model: GEMINI_MODEL,
    });

    storeNotasLibro = recalcularHilosYRespuestas([procesada, ...storeNotasLibro]);
    guardarStoreNotasLibro(storeNotasLibro);

    const notaFinal = storeNotasLibro.find(n => n.id === notaId) || procesada;
    res.json({ exito: true, nota: notaFinal, notasLibro: storeNotasLibro });
  } catch (err: any) {
    res.status(500).json({ exito: false, error: err?.message || 'Error registrando nota.' });
  }
});

app.post('/api/notas-libro/hidratar', (req, res) => {
  try {
    const compact = req.body?.compact === true || req.query?.compact === '1';
    const incoming = Array.isArray(req.body?.notasLibro) ? (req.body.notasLibro as NotaLibro[]) : [];
    if (incoming.length === 0) {
      res.json(
        compact
          ? { exito: true, total: storeNotasLibro.length }
          : { exito: true, total: storeNotasLibro.length, notasLibro: storeNotasLibro }
      );
      return;
    }

    const merged = new Map<string, NotaLibro>();
    for (const existing of storeNotasLibro) {
      if (existing?.id) merged.set(existing.id, existing);
    }
    for (const item of incoming) {
      if (item?.id) merged.set(item.id, item);
    }

    storeNotasLibro = recalcularHilosYRespuestas(Array.from(merged.values()));
    guardarStoreNotasLibro(storeNotasLibro);

    res.json(
      compact
        ? { exito: true, total: storeNotasLibro.length }
        : {
            exito: true,
            total: storeNotasLibro.length,
            notasLibro: storeNotasLibro,
          }
    );
  } catch (err: any) {
    res.status(500).json({ exito: false, error: err?.message || 'Error hidratando notas de libro.' });
  }
});

app.patch('/api/notas-libro/:id', (req, res) => {
  const { id } = req.params;
  const idx = storeNotasLibro.findIndex(n => n.id === id);
  if (idx === -1) {
    res.status(404).json({ exito: false, error: 'Nota de libro no encontrada.' });
    return;
  }

  const actual = storeNotasLibro[idx];
  const body = req.body || {};

  const emisorActualizado: ActorNotaLibro =
    body.actorEmisor !== undefined ? normalizarActorNota(String(body.actorEmisor)) : actual.actorEmisor;
  const receptorActualizado: ActorNotaLibro =
    body.actorReceptor !== undefined ? normalizarActorNota(String(body.actorReceptor)) : actual.actorReceptor;

  const estadoVal = body.estadoRespuesta as EstadoRespuestaNota | undefined;
  const estadoActualizado: EstadoRespuestaNota =
    estadoVal &&
    ['CONTESTADA', 'PARCIALMENTE_CONTESTADA', 'SIN_RESPUESTA', 'CON_DISCREPANCIA', 'INFORMATIVA'].includes(estadoVal)
      ? estadoVal
      : actual.estadoRespuesta;

  const sentidoVal = body.sentido as SentidoNotaLibro | undefined;
  const sentidoActualizado: SentidoNotaLibro =
    sentidoVal &&
    ['pregunta_solicitud', 'respuesta_devolucion', 'intimacion_observacion', 'informativa'].includes(sentidoVal)
      ? sentidoVal
      : actual.sentido;

  const actualizada: NotaLibro = {
    ...actual,
    ...(body.codigo !== undefined ? { codigo: canonicalizarCodigoNota(String(body.codigo)) || actual.codigo } : {}),
    ...(body.tipoNota !== undefined ? { tipoNota: normalizarTipoNota(String(body.tipoNota)) } : {}),
    actorEmisor: emisorActualizado,
    emisorDetalle:
      body.emisorDetalle !== undefined ? String(body.emisorDetalle).trim().slice(0, 190) : actual.emisorDetalle,
    actorReceptor: receptorActualizado,
    receptorDetalle:
      body.receptorDetalle !== undefined ? String(body.receptorDetalle).trim().slice(0, 190) : actual.receptorDetalle,
    sentido: sentidoActualizado,
    estadoRespuesta: estadoActualizado,
    ...(Array.isArray(body.referenciasNotas)
      ? {
          referenciasNotas: body.referenciasNotas
            .map((r: any) => canonicalizarCodigoNota(String(r)))
            .filter(Boolean)
            .slice(0, 35),
        }
      : {}),
    ...(body.resumen !== undefined ? { resumen: String(body.resumen).trim().slice(0, 3500) } : {}),
    manualOverride: true,
  };

  const reemplazo = storeNotasLibro.map((n, i) => (i === idx ? actualizada : n));
  storeNotasLibro = recalcularHilosYRespuestas(reemplazo);
  guardarStoreNotasLibro(storeNotasLibro);

  const notaFinal = storeNotasLibro.find(n => n.id === id) || actualizada;
  res.json({
    exito: true,
    nota: notaFinal,
    notasLibro: storeNotasLibro,
  });
});

app.delete('/api/notas-libro/:id', (req, res) => {
  const { id } = req.params;
  storeNotasLibro = recalcularHilosYRespuestas(storeNotasLibro.filter(n => n.id !== id));
  guardarStoreNotasLibro(storeNotasLibro);
  res.json({ exito: true, notasLibro: storeNotasLibro });
});

app.post('/api/notas-libro/limpiar', (_req, res) => {
  storeNotasLibro = [];
  guardarStoreNotasLibro(storeNotasLibro);
  res.json({ exito: true });
});

// =========================================================================================
// ENDPOINTS DE MINUTAS, COMPROMISOS Y NOTAS DE PEDIDO POR INCUMPLIMIENTO
// =========================================================================================

app.get('/api/minutas', (_req, res) => {
  res.json({
    exito: true,
    minutas: storeMinutas.minutas,
    compromisos: storeMinutas.compromisos,
    notasPedido: storeMinutas.notasPedido,
  });
});

app.get('/api/minutas/audio/config', (_req, res) => {
  const groqEnv = obtenerResumenGroqEnv();
  res.json({
    exito: true,
    groqConfigurado: tieneGroqConfigurado(),
    groqFuente: groqEnv.fuente,
    groqVistaSegura: groqEnv.vistaSegura,
    openRouterConfigurado: tieneOpenRouterConfigurado(),
    geminiConfigurado: isModelosPagosHabilitados() && Boolean(obtenerClienteGeminiActivo()),
  });
});

app.post('/api/minutas/audio/subir/init', (req, res) => {
  try {
    depurarJobsAudioAntiguos();
    const {
      id: rawId,
      nombre,
      tipoMime,
      totalBytes,
      modeloMinutaId,
      codigo,
      titulo,
      fechaReunion,
      frente,
      participantes,
      motor,
    } = req.body || {};

    const bytesNum = Number(totalBytes) || 0;
    if (!rawId || !nombre) {
      res.status(400).json({ exito: false, error: 'Datos de inicialización de audio incompletos.' });
      return;
    }
    if (bytesNum > MAX_AUDIO_MINUTA_BYTES) {
      res.status(400).json({
        exito: false,
        error: 'El archivo de audio supera el máximo permitido (250 MB). Comprímelo o divídelo antes de subir.',
      });
      return;
    }

    const id = sanitizeSafeId(rawId, 'audioMinutaId');
    const partPath = getRutaAudioStaging(id);
    fs.writeFileSync(partPath, Buffer.alloc(0));

    jobsAudioMinuta.set(id, {
      id,
      nombre: String(nombre),
      tipoMime: String(tipoMime || 'audio/webm'),
      totalBytes: bytesNum,
      modeloMinutaId: typeof modeloMinutaId === 'string' ? modeloMinutaId : undefined,
      codigo: typeof codigo === 'string' ? codigo : undefined,
      titulo: typeof titulo === 'string' ? titulo : undefined,
      fechaReunion: typeof fechaReunion === 'string' ? fechaReunion : undefined,
      frente: typeof frente === 'string' ? frente : undefined,
      participantes: typeof participantes === 'string' ? participantes : undefined,
      motor: isModelosPagosHabilitados() && motor === 'gemini' ? 'gemini' : 'gratuito',
      estado: 'subiendo',
      progreso: 0,
      detalle: 'Preparando subida por partes de audio...',
      creadoEn: Date.now(),
    });

    res.json({ exito: true, id });
  } catch (err: any) {
    const status = err?.status === 400 ? 400 : 500;
    res.status(status).json({
      exito: false,
      error: sanitizarErrorGroq(err?.message || 'Error inicializando subida de audio.'),
    });
  }
});

app.post('/api/minutas/audio/subir/finalizar', (req, res) => {
  try {
    const rawId = req.body?.id;
    const id = sanitizeSafeId(rawId, 'audioMinutaId');
    const job = jobsAudioMinuta.get(id);
    const partPath = getRutaAudioStaging(id);

    if (!job || !fs.existsSync(partPath)) {
      res.status(404).json({ exito: false, error: 'Sesión de audio en progreso no encontrada.' });
      return;
    }

    const uploadPath = getRutaAudioUploadTemp(id);
    if (fs.existsSync(uploadPath)) fs.unlinkSync(uploadPath);
    fs.renameSync(partPath, uploadPath);

    job.estado = 'procesando';
    job.progreso = 4;
    job.detalle = 'Audio completo recibido. Iniciando segmentación para Groq Whisper...';
    ejecutarProcesamientoAudioAsync(job, uploadPath);

    res.json({ exito: true, jobId: id });
  } catch (err: any) {
    const status = err?.status === 400 ? 400 : 500;
    res.status(status).json({
      exito: false,
      error: sanitizarErrorGroq(err?.message || 'Error finalizando subida de audio.'),
    });
  }
});

app.get('/api/minutas/audio/estado/:id', (req, res) => {
  try {
    const id = sanitizeSafeId(req.params.id, 'audioMinutaId');
    const job = jobsAudioMinuta.get(id);
    if (!job) {
      res.status(404).json({ exito: false, error: 'Trabajo de transcripción de audio no encontrado.' });
      return;
    }
    res.json({
      exito: true,
      estado: job.estado,
      progreso: job.progreso,
      detalle: job.detalle,
      resultado: job.resultado,
      error: job.error,
    });
  } catch (err: any) {
    res.status(err?.status === 400 ? 400 : 500).json({
      exito: false,
      error: sanitizarErrorGroq(err?.message || 'Identificador inválido.'),
    });
  }
});

app.post('/api/minutas/hidratar', (req, res) => {
  try {
    const incomingMinutas = Array.isArray(req.body?.minutas) ? (req.body.minutas as MinutaReunion[]) : [];
    const incomingCompromisos = Array.isArray(req.body?.compromisos)
      ? (req.body.compromisos as CompromisoMinuta[])
      : [];
    const incomingNotasPedido = Array.isArray(req.body?.notasPedido)
      ? (req.body.notasPedido as NotaPedidoIngenieria[])
      : [];

    const mMap = new Map<string, MinutaReunion>();
    for (const m of storeMinutas.minutas) if (m?.id) mMap.set(m.id, m);
    for (const m of incomingMinutas) if (m?.id) mMap.set(m.id, m);

    const cMap = new Map<string, CompromisoMinuta>();
    for (const c of storeMinutas.compromisos) if (c?.id) cMap.set(c.id, c);
    for (const c of incomingCompromisos) if (c?.id) cMap.set(c.id, c);

    const npMap = new Map<string, NotaPedidoIngenieria>();
    for (const n of storeMinutas.notasPedido) if (n?.id) npMap.set(n.id, n);
    for (const n of incomingNotasPedido) if (n?.id) npMap.set(n.id, n);

    storeMinutas = {
      minutas: Array.from(mMap.values()),
      compromisos: Array.from(cMap.values()),
      notasPedido: Array.from(npMap.values()),
    };
    guardarStoreMinutas(storeMinutas);

    res.json({
      exito: true,
      ...storeMinutas,
    });
  } catch (err: any) {
    res.status(500).json({ exito: false, error: err?.message || 'Error hidratando minutas.' });
  }
});

app.post('/api/minutas/sincronizar-drive', async (req, res) => {
  try {
    const authHeader = String(req.headers.authorization || '');
    const accessToken = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!accessToken) {
      res.status(401).json({
        exito: false,
        error: 'Se requiere iniciar sesión con Google para leer las minutas desde Google Drive.',
      });
      return;
    }

    const { folderId, buscarEnTodoDrive = true } = req.body || {};
    const clienteAi = obtenerClienteGeminiActivo();

    const syncRes = await sincronizarMinutasDesdeGoogleDrive({
      accessToken,
      folderId: folderId ? String(folderId).trim() : DEFAULT_DRIVE_ROOT_FOLDER_ID,
      buscarEnTodoDrive: Boolean(buscarEnTodoDrive),
      minutasExistentes: storeMinutas.minutas,
      ai: clienteAi,
      model: GEMINI_MODEL,
    });

    if (syncRes.minutasNuevas.length > 0 || syncRes.minutasActualizadas > 0) {
      const nuevasMap = new Map(syncRes.minutasNuevas.map(m => [m.id, m]));
      const filtradas = storeMinutas.minutas.filter(m => !nuevasMap.has(m.id));
      storeMinutas.minutas = [...syncRes.minutasNuevas, ...filtradas];
      if (syncRes.compromisosNuevos.length > 0) {
        storeMinutas.compromisos = [...syncRes.compromisosNuevos, ...storeMinutas.compromisos];
      }
      guardarStoreMinutas(storeMinutas);
    }

    res.json({
      exito: true,
      ...syncRes,
      minutas: storeMinutas.minutas,
      compromisos: storeMinutas.compromisos,
      notasPedido: storeMinutas.notasPedido,
    });
  } catch (err: any) {
    const status = err?.status === 401 || err?.status === 403 ? err.status : 500;
    console.error('[DriveMinutas] Error sincronizando desde Drive:', err);
    res.status(status).json({
      exito: false,
      error:
        status === 401
          ? 'Tu sesión de Google Drive expiró. Vuelve a conectar Google Drive e intenta nuevamente.'
          : err?.message || 'Error leyendo minutas desde Google Drive.',
    });
  }
});

app.post('/api/minutas/registrar', async (req, res) => {
  try {
    const {
      codigo,
      titulo,
      fechaReunion,
      frente,
      participantes,
      contenidoTexto,
      compromisosManuales,
      extraerAutomaticamente = true,
    } = req.body || {};

    const texto = String(contenidoTexto || '').trim();
    if (!texto && (!Array.isArray(compromisosManuales) || compromisosManuales.length === 0)) {
      res.status(400).json({
        exito: false,
        error: 'Ingresa el contenido de la minuta o al menos un compromiso.',
      });
      return;
    }

    const meta = inferirMetadatosMinuta({
      codigo,
      titulo,
      fechaReunion,
      frente,
      participantes,
      contenidoTexto: texto || `${titulo || ''} ${codigo || ''}`,
    });

    const minutaId = `min_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const nuevaMinuta: MinutaReunion = {
      id: minutaId,
      codigo: meta.codigo,
      titulo: meta.titulo,
      fechaReunion: meta.fechaReunion,
      frente: meta.frente,
      participantes: meta.participantes,
      origen: texto ? 'texto' : 'manual',
      contenidoTexto: texto.slice(0, 120000),
      fechaCarga: new Date().toLocaleDateString('es-AR'),
    };

    const hoyIso = new Date().toISOString().split('T')[0];
    let nuevosCompromisos: CompromisoMinuta[] = [];
    let fuenteExtraccion = 'manual';

    if (Array.isArray(compromisosManuales) && compromisosManuales.length > 0) {
      nuevosCompromisos = compromisosManuales
        .filter((c: any) => c && String(c.descripcion || '').trim().length > 0)
        .map((c: any, idx: number) => {
          const fechaLimite = normalizarFechaIso(c.fechaLimite, meta.fechaReunion);
          const estadoSolicitado = c.estado as EstadoCompromiso | undefined;
          const estado: EstadoCompromiso =
            estadoSolicitado || (fechaLimite < hoyIso ? 'INCUMPLIDO' : 'PENDIENTE');
          return {
            id: `comp_${Date.now()}_${idx + 1}_${Math.random().toString(36).slice(2, 6)}`,
            minutaId,
            minutaCodigo: nuevaMinuta.codigo,
            minutaFecha: nuevaMinuta.fechaReunion,
            numeroItem: String(c.numeroItem || `C-${String(idx + 1).padStart(2, '0')}`).trim(),
            descripcion: String(c.descripcion).trim(),
            responsable: String(c.responsable || 'Ingeniería / Proyectista').trim(),
            area: String(c.area || 'Ingeniería').trim(),
            frente: String(c.frente || nuevaMinuta.frente).trim(),
            fechaLimite,
            estado,
            observaciones: String(c.observaciones || '').trim(),
            documentosRelacionados: Array.isArray(c.documentosRelacionados)
              ? c.documentosRelacionados.map((d: any) => String(d).trim()).filter(Boolean)
              : [],
            notasPedidoIds: [],
          };
        });
      nuevaMinuta.resumen = `Minuta ${nuevaMinuta.codigo} con ${nuevosCompromisos.length} compromiso(s) registrado(s).`;
    } else if (extraerAutomaticamente && texto) {
      const clienteAi = obtenerClienteGeminiActivo();
      const analisis = await analizarYExtraerCompromisosMinuta({
        minuta: nuevaMinuta,
        ai: clienteAi,
        model: GEMINI_MODEL,
      });
      nuevaMinuta.resumen = analisis.resumen;
      nuevosCompromisos = analisis.compromisos;
      fuenteExtraccion = analisis.fuente;
    }

    storeMinutas.minutas = [nuevaMinuta, ...storeMinutas.minutas];
    storeMinutas.compromisos = [...nuevosCompromisos, ...storeMinutas.compromisos];
    guardarStoreMinutas(storeMinutas);

    res.json({
      exito: true,
      minuta: nuevaMinuta,
      compromisosExtraidos: nuevosCompromisos,
      fuenteExtraccion,
    });
  } catch (err: any) {
    console.error('[Minutas] Error en /api/minutas/registrar:', err);
    res.status(500).json({ exito: false, error: err?.message || 'Error registrando minuta.' });
  }
});

app.delete('/api/minutas/:id', (req, res) => {
  const { id } = req.params;
  storeMinutas.minutas = storeMinutas.minutas.filter(m => m.id !== id);
  storeMinutas.compromisos = storeMinutas.compromisos.filter(c => c.minutaId !== id);
  guardarStoreMinutas(storeMinutas);
  res.json({ exito: true });
});

app.post('/api/minutas/compromisos', (req, res) => {
  try {
    const {
      minutaId,
      minutaCodigo,
      minutaFecha,
      numeroItem,
      descripcion,
      responsable,
      area,
      frente,
      fechaLimite,
      estado,
      observaciones,
      documentosRelacionados,
    } = req.body || {};

    if (!descripcion || !String(descripcion).trim()) {
      res.status(400).json({ exito: false, error: 'La descripción del compromiso es obligatoria.' });
      return;
    }

    const minutaAsociada = storeMinutas.minutas.find(m => m.id === minutaId);
    const hoyIso = new Date().toISOString().split('T')[0];
    const fechaLimIso = normalizarFechaIso(fechaLimite, hoyIso);
    const estadoFinal: EstadoCompromiso =
      estado || (fechaLimIso < hoyIso ? 'INCUMPLIDO' : 'PENDIENTE');

    const nuevo: CompromisoMinuta = {
      id: `comp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      minutaId: minutaAsociada?.id || minutaId || 'sin-minuta',
      minutaCodigo: minutaAsociada?.codigo || minutaCodigo || 'REG-DIRECTO',
      minutaFecha: minutaAsociada?.fechaReunion || normalizarFechaIso(minutaFecha, hoyIso),
      numeroItem: String(numeroItem || `C-${String(storeMinutas.compromisos.length + 1).padStart(2, '0')}`).trim(),
      descripcion: String(descripcion).trim(),
      responsable: String(responsable || 'Ingeniería / Proyectista').trim(),
      area: String(area || 'Ingeniería').trim(),
      frente: String(frente || minutaAsociada?.frente || 'LAT El Bracho - Villa Quinteros').trim(),
      fechaLimite: fechaLimIso,
      estado: estadoFinal,
      observaciones: String(observaciones || '').trim(),
      documentosRelacionados: Array.isArray(documentosRelacionados)
        ? documentosRelacionados.map((d: any) => String(d).trim()).filter(Boolean)
        : [],
      notasPedidoIds: [],
    };

    storeMinutas.compromisos = [nuevo, ...storeMinutas.compromisos];
    guardarStoreMinutas(storeMinutas);
    res.json({ exito: true, compromiso: nuevo });
  } catch (err: any) {
    res.status(500).json({ exito: false, error: err?.message || 'Error creando compromiso.' });
  }
});

app.patch('/api/minutas/compromisos/:id', (req, res) => {
  const { id } = req.params;
  const idx = storeMinutas.compromisos.findIndex(c => c.id === id);
  if (idx === -1) {
    res.status(404).json({ exito: false, error: 'Compromiso no encontrado.' });
    return;
  }

  const actual = storeMinutas.compromisos[idx];
  const body = req.body || {};
  const actualizado: CompromisoMinuta = {
    ...actual,
    ...(body.estado ? { estado: body.estado } : {}),
    ...(body.responsable !== undefined ? { responsable: String(body.responsable).trim() } : {}),
    ...(body.fechaLimite !== undefined ? { fechaLimite: normalizarFechaIso(body.fechaLimite, actual.fechaLimite) } : {}),
    ...(body.descripcion !== undefined ? { descripcion: String(body.descripcion).trim() } : {}),
    ...(body.observaciones !== undefined ? { observaciones: String(body.observaciones).trim() } : {}),
    ...(body.frente !== undefined ? { frente: String(body.frente).trim() } : {}),
  };

  storeMinutas.compromisos[idx] = actualizado;
  guardarStoreMinutas(storeMinutas);
  res.json({ exito: true, compromiso: actualizado });
});

app.delete('/api/minutas/compromisos/:id', (req, res) => {
  const { id } = req.params;
  storeMinutas.compromisos = storeMinutas.compromisos.filter(c => c.id !== id);
  guardarStoreMinutas(storeMinutas);
  res.json({ exito: true });
});

app.post('/api/minutas/nota-pedido/generar', async (req, res) => {
  try {
    const {
      compromisoIds,
      numeroNota,
      fechaEmision,
      emisor,
      destinatario,
      frente,
      asunto,
      plazoDescargoDias,
      encuadreAdicional,
    } = req.body || {};

    if (!Array.isArray(compromisoIds) || compromisoIds.length === 0) {
      res.status(400).json({
        exito: false,
        error: 'Selecciona al menos un compromiso incumplido para generar la Nota de Pedido.',
      });
      return;
    }

    const seleccionados = storeMinutas.compromisos.filter(c => compromisoIds.includes(c.id));
    if (seleccionados.length === 0) {
      res.status(404).json({
        exito: false,
        error: 'No se encontraron los compromisos seleccionados en el servidor.',
      });
      return;
    }

    const fechaHoyIso = normalizarFechaIso(fechaEmision, new Date().toISOString().split('T')[0]);
    const consecutivo = String(storeMinutas.notasPedido.length + 1).padStart(3, '0');
    const numeroFinal = String(numeroNota || `NP-ING-${consecutivo}`).trim();
    const emisorFinal = String(emisor || 'Dirección Técnica & Control de Proyecto (UTE)').trim();
    const destinatarioFinal = String(destinatario || 'Jefatura de Ingeniería / Proyectista').trim();
    const frenteFinal = String(frente || seleccionados[0].frente || 'Obras 132 kV').trim();
    const asuntoFinal = String(
      asunto || `Incumplimiento de compromisos de ingeniería asentados en minuta (${Array.from(new Set(seleccionados.map(c => c.minutaCodigo))).join(', ')})`
    ).trim();
    const plazoFinal = Math.max(1, Number(plazoDescargoDias) || 5);

    const clienteAi = obtenerClienteGeminiActivo();
    const generacion = await generarContenidoNotaPedido({
      numeroNota: numeroFinal,
      fechaEmision: fechaHoyIso,
      emisor: emisorFinal,
      destinatario: destinatarioFinal,
      frente: frenteFinal,
      asunto: asuntoFinal,
      plazoDescargoDias: plazoFinal,
      encuadreAdicional: encuadreAdicional ? String(encuadreAdicional).trim() : '',
      compromisos: seleccionados,
      minutas: storeMinutas.minutas,
      pliegos: pliegosIndexados,
      ai: clienteAi,
      model: GEMINI_MODEL,
    });

    const nota: NotaPedidoIngenieria = {
      id: `np_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      numeroNota: numeroFinal,
      fechaEmision: fechaHoyIso,
      emisor: emisorFinal,
      destinatario: destinatarioFinal,
      frente: frenteFinal,
      asunto: asuntoFinal,
      plazoDescargoDias: plazoFinal,
      compromisoIds: seleccionados.map(c => c.id),
      minutasReferenciadas: Array.from(new Set(seleccionados.map(c => c.minutaCodigo))),
      contenidoMarkdown: generacion.markdown,
      fuenteGeneracion: generacion.fuente,
    };

    // Marcar compromisos incluidos como INCUMPLIDO (si no estaban cumplidos) y vincular Nota de Pedido
    storeMinutas.compromisos = storeMinutas.compromisos.map(c => {
      if (!compromisoIds.includes(c.id)) return c;
      return {
        ...c,
        estado: c.estado === 'CUMPLIDO' ? 'CUMPLIDO' : 'INCUMPLIDO',
        notasPedidoIds: Array.from(new Set([...(c.notasPedidoIds || []), nota.numeroNota])),
      };
    });

    storeMinutas.notasPedido = [nota, ...storeMinutas.notasPedido];
    guardarStoreMinutas(storeMinutas);

    res.json({
      exito: true,
      notaPedido: nota,
      compromisosActualizados: storeMinutas.compromisos,
    });
  } catch (err: any) {
    console.error('[Minutas] Error generando Nota de Pedido:', err);
    res.status(500).json({ exito: false, error: err?.message || 'Error generando Nota de Pedido.' });
  }
});

app.delete('/api/minutas/notas-pedido/:id', (req, res) => {
  const { id } = req.params;
  storeMinutas.notasPedido = storeMinutas.notasPedido.filter(n => n.id !== id);
  guardarStoreMinutas(storeMinutas);
  res.json({ exito: true });
});

// =========================================================================================
// ENDPOINTS GEMINI REALES PARA INFORMES Y ANOTADOR DE CAMPO (AUDITORÍA, AUDIO Y FOTOS)
// =========================================================================================

app.post('/api/informes/generar', async (req, res) => {
  try {
    const {
      solicitud = 'Informe Ejecutivo Semanal de Estado General',
      planos = [],
      totalPlanificados = storeElencos.totalPlanificados || 543,
      hitos = [],
      interferencias = [],
      notasCampo = '',
      fotosCount = 0,
      audiosCount = 0,
    } = req.body || {};

    const planosList = Array.isArray(planos) ? planos : [];
    const hitosList = Array.isArray(hitos) ? hitos : [];
    const interfList =
      Array.isArray(interferencias) && interferencias.length > 0 ? interferencias : storeInterferencias;

    const totalEmitidos = planosList.length;
    const totalApc = planosList.filter((p: any) => Boolean(p?.selloApc)).length;
    const fechasCandidatas: string[] = [];
    for (const p of planosList) {
      const f = String(p?.fechaDocumento || p?.fechaSubida || p?.fecha || '').slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(f)) fechasCandidatas.push(f);
    }
    for (const m of storeMinutas.minutas) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(m.fechaReunion)) fechasCandidatas.push(m.fechaReunion);
    }
    for (const n of storeNotasLibro) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(n.fecha)) fechasCandidatas.push(n.fecha);
    }
    fechasCandidatas.sort();
    const fechaInicioObra = fechasCandidatas[0] || new Date().toISOString().slice(0, 10);
    const fechaHoy = new Date().toISOString().slice(0, 10);

    const resumenHitos = hitosList
      .slice(0, 15)
      .map((h: any) => `- [${h.codigo}] ${h.nombre} | Frente: ${h.frente} | Fecha Obj.: ${h.fechaObjetivo}`)
      .join('\n');

    const resumenInterf = interfList
      .slice(0, 20)
      .map(
        (c: any) =>
          `- **${c.empresa}** (${c.carpetaNombre || c.empresa}): Estado **${c.estadoTramite}** | Vanos: ${c.vanosAfectados || '-'} | Faltantes: ${(c.faltantes || []).join('; ') || 'Ninguno'} | Docs leídos: ${(c.documentosLeidos || [c.archivoSolicitudNombre]).filter(Boolean).join(', ')}`
      )
      .join('\n');

    const incumplidos = storeMinutas.compromisos.filter(c => c.estado === 'INCUMPLIDO');
    const notasSinResp = storeNotasLibro.filter(
      n => n.estadoRespuesta === 'SIN_RESPUESTA' || n.estadoRespuesta === 'CON_DISCREPANCIA'
    );

    const resumenNotasLibro = storeNotasLibro
      .slice(0, 20)
      .map(
        n =>
          `- [${n.codigo} | ${n.fecha}] ${n.actorEmisor} ➔ ${n.actorReceptor} | Estado: ${n.estadoRespuesta} | Respuesta por: ${n.respondidaPorNotas.join(', ') || 'NINGUNA'} | ${n.resumen.slice(0, 180)}`
      )
      .join('\n');

    const clienteAi = isModelosPagosHabilitados() ? obtenerClienteGeminiActivo() : null;
    if (clienteAi || (!isModelosPagosHabilitados() && tieneOpenRouterConfigurado())) {
      try {
        const prompt =
          `Genera un INFORME TÉCNICO EJECUTIVO riguroso en Markdown para la obra de Alta Tensión 132 kV.\n` +
          `Tipo de informe solicitado: "${solicitud}"\n` +
          `Fecha de emisión: ${fechaHoy} | Registro documental más antiguo detectado: ${fechaInicioObra}\n\n` +
          `=== MÉTRICAS REALES DEL PROYECTO ===\n` +
          `- Planos planificados totales: ${totalPlanificados}\n` +
          `- Planos emitidos en catálogo: ${totalEmitidos} (${totalPlanificados > 0 ? ((totalEmitidos / totalPlanificados) * 100).toFixed(1) : '0.0'}%)\n` +
          `- Planos con Sello APC (Apto Para Construcción): ${totalApc} (${totalPlanificados > 0 ? ((totalApc / totalPlanificados) * 100).toFixed(1) : '0.0'}%)\n` +
          `- Pliegos contractuales reales indexados: ${pliegosIndexados.map(p => `${p.nombre} (${p.paginas} págs)`).join(', ') || 'Ninguno'}\n` +
          `- Hitos contractuales activos (${hitosList.length}):\n${resumenHitos || 'Sin hitos cargados'}\n\n` +
          `- Interferencias y Cruces reales de Drive (${interfList.length}):\n${resumenInterf || 'Sin interferencias sincronizadas'}\n\n` +
          `- Libro de Comunicaciones (${storeNotasLibro.length} notas, ${notasSinResp.length} pendientes/con discrepancia):\n${resumenNotasLibro || 'Sin notas de libro cargadas'}\n\n` +
          `- Minutas y Compromisos (${storeMinutas.minutas.length} minutas, ${storeMinutas.compromisos.length} compromisos, ${incumplidos.length} incumplidos, ${storeMinutas.notasPedido.length} Notas de Pedido generadas).\n` +
          `- Relevamiento de Campo: ${fotosCount} fotos, ${audiosCount} audios.\n` +
          (notasCampo ? `Notas recientes de campo:\n${String(notasCampo).slice(0, 3500)}\n\n` : '') +
          `Estructura solicitada: Título claro, Resumen Ejecutivo con tabla de KPIs, Estado de Ingeniería y Planos APC, Seguimiento de Hitos Críticos, Gestión de Cruces/Interferencias reales (sin inventar datos), Estado de Notas de Libro y Compromisos de Minuta, y Plan de Acción Inmediato. No inventes datos fuera de las métricas aportadas.`;

        const { response: resp, modelUsed } = await generarContenidoConFallback({
          ai: clienteAi,
          contents: prompt,
          config: {
            thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
            systemInstruction:
              'Eres un Director Técnico y Jefe de Ingeniería Eléctrica 132 kV redactando informes gerenciales y contractuales reales en español.',
          },
          timeoutMs: 30000,
        });

        if (resp.text?.trim()) {
          clearUltimoErrorGemini();
          res.json({
            exito: true,
            fuente: modelUsed,
            markdown: resp.text.trim(),
          });
          return;
        }
      } catch (err: any) {
        console.warn('[Informes] Fallback estructurado:', err?.message || err);
        formatearAvisoErrorGemini(err);
      }
    }

    const fallbackMd =
      `# ${solicitud}\n\n` +
      `**Fecha de emisión:** ${fechaHoy} | **Primer registro documental:** ${fechaInicioObra}\n\n` +
      `## 1. Resumen Ejecutivo de Ingeniería\n\n` +
      `| Indicador | Valor Real | Porcentaje |\n|---|---|---|\n` +
      `| Planos Planificados | ${totalPlanificados} | 100% |\n` +
      `| Planos Emitidos en Catálogo | ${totalEmitidos} | ${totalPlanificados > 0 ? ((totalEmitidos / totalPlanificados) * 100).toFixed(1) : '0.0'}% |\n` +
      `| Planos con Sello APC | ${totalApc} | ${totalPlanificados > 0 ? ((totalApc / totalPlanificados) * 100).toFixed(1) : '0.0'}% |\n` +
      `| Cruces / Interferencias Activas | ${interfList.length} | - |\n` +
      `| Notas de Libro Indexadas | ${storeNotasLibro.length} (${notasSinResp.length} pendientes/discrepancias) | - |\n` +
      `| Compromisos de Minuta Incumplidos | ${incumplidos.length} de ${storeMinutas.compromisos.length} | - |\n\n` +
      `## 2. Estado de Interferencias y Cruces Reales\n\n` +
      (resumenInterf || '- Sin cruces sincronizados desde Google Drive.') +
      `\n\n## 3. Hitos Contractuales\n\n` +
      (resumenHitos || '- Sin hitos registrados.') +
      `\n\n## 4. Seguimiento de Notas de Libro y Campo\n\n` +
      (resumenNotasLibro || '- Sin notas de libro cargadas.') +
      (notasCampo ? `\n\n### Notas de Inspección de Campo (${fotosCount} fotos, ${audiosCount} audios)\n${String(notasCampo).slice(0, 2000)}` : '');

    res.json({
      exito: true,
      fuente: 'datos-vivos-locales',
      markdown: fallbackMd,
    });
  } catch (err: any) {
    res.status(500).json({ exito: false, error: err?.message || 'Error generando informe.' });
  }
});

app.post('/api/anotador/auditar', async (req, res) => {
  try {
    const { consulta, frente = 'Obra General 132 kV', planosMencionados = [] } = req.body || {};
    const queryStr = String(consulta || '').trim();
    if (!queryStr) {
      res.status(400).json({ exito: false, error: 'La consulta técnica es obligatoria.' });
      return;
    }

    const recuperado =
      pliegosIndexados.length > 0 ? recuperarFragmentosRelevantes(queryStr, pliegosIndexados, 45000) : null;
    const localRef = buscarYExtraerDePliegosReales(queryStr, pliegosIndexados);

    const clienteAi = isModelosPagosHabilitados() ? obtenerClienteGeminiActivo() : null;
    if (clienteAi || (!isModelosPagosHabilitados() && tieneOpenRouterConfigurado())) {
      try {
        const { response: resp, modelUsed } = await generarContenidoConFallback({
          ai: clienteAi,
          contents: [
            {
              text:
                `Eres un Inspector Jefe de Obra Eléctrica 132 kV realizando una auditoría de campo.\n` +
                `Frente de trabajo: ${frente}\n` +
                `Consulta / verificación solicitada: "${queryStr}"\n` +
                (Array.isArray(planosMencionados) && planosMencionados.length > 0
                  ? `Planos disponibles relacionados:\n${planosMencionados.slice(0, 12).map((p: any) => `- ${p.codigo} Rev.${p.revision} (${p.selloApc ? 'APC' : p.estado || 'Sin APC'}): ${p.descripcion}`).join('\n')}\n\n`
                  : '') +
                (recuperado?.contextoTexto
                  ? `=== EXTRACTOS REALES DE PLIEGOS INDEXADOS ===\n${recuperado.contextoTexto.slice(0, 35000)}\n\n`
                  : `=== BASE DE REFERENCIA ===\n${localRef.resumen}\n`) +
                `Devuelve un dictamen técnico estructurado en JSON con rigor contractual.`,
            },
          ],
          config: {
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                titulo: { type: Type.STRING, description: 'Título técnico de la verificación o rubro auditado.' },
                exigenciaPliego: {
                  type: Type.STRING,
                  description: 'Exigencia exacta del Pliego (valores, tolerancias, normas IRAM/AEA/CIRSOC, hormigón, Rpat, etc.).',
                },
                planoApc: {
                  type: Type.STRING,
                  description: 'Plano APC o código de ingeniería vigente de referencia.',
                },
                secuenciaInspeccion: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: 'Lista de 4 a 6 puntos de chequeo físico e instrumental antes de liberar en campo.',
                },
                referencias: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: 'Pliegos, artículos, páginas o notas citadas.',
                },
              },
              required: ['titulo', 'exigenciaPliego', 'planoApc', 'secuenciaInspeccion', 'referencias'],
            },
          },
          timeoutMs: 25000,
        });

        const rawJson = (resp.text || '').trim();
        if (rawJson) {
          const parsed = JSON.parse(rawJson);
          clearUltimoErrorGemini();
          res.json({
            exito: true,
            fuente: modelUsed,
            dictamen: {
              titulo: String(parsed.titulo || `Auditoría: ${queryStr}`).trim(),
              exigenciaPliego: String(parsed.exigenciaPliego || localRef.resumen).trim(),
              planoApc: String(parsed.planoApc || 'Verificar plano APC vigente en catálogo').trim(),
              secuenciaInspeccion: Array.isArray(parsed.secuenciaInspeccion)
                ? parsed.secuenciaInspeccion.map((x: any) => String(x).trim()).filter(Boolean)
                : [],
              referencias: Array.isArray(parsed.referencias)
                ? parsed.referencias.map((x: any) => String(x).trim()).filter(Boolean)
                : [],
            },
          });
          return;
        }
      } catch (err: any) {
        console.warn('[AnotadorAuditar] Fallback local:', err?.message || err);
        formatearAvisoErrorGemini(err);
      }
    }

    const frags = recuperado?.fragmentosSeleccionados || [];
    res.json({
      exito: true,
      fuente: 'indice-local',
      dictamen: {
        titulo: `Auditoría Técnica: ${queryStr}`,
        exigenciaPliego:
          frags.length > 0
            ? frags.slice(0, 2).map(f => `[${f.pliegoNombre} Pág. ${f.pagina}]: ${f.texto.slice(0, 420)}`).join('\n\n')
            : localRef.resumen,
        planoApc:
          Array.isArray(planosMencionados) && planosMencionados[0]
            ? `${planosMencionados[0].codigo} Rev.${planosMencionados[0].revision || '0'}`
            : 'Consultar plano APC en pestaña Planos',
        secuenciaInspeccion: [
          'Verificar disponibilidad de plano con sello Apto Para Construcción (APC) vigente en frente.',
          'Controlar cotas, materiales certificados y protocolos de ensayo previo a la liberación.',
          'Registrar mediciones reales con fotografías geotagged y nota de inspección.',
        ],
        referencias:
          frags.length > 0
            ? frags.slice(0, 4).map(f => `${f.pliegoNombre} (Pág. ${f.pagina})`)
            : ['Pliego Técnico de Obra 132 kV'],
      },
    });
  } catch (err: any) {
    res.status(500).json({ exito: false, error: err?.message || 'Error ejecutando auditoría técnica.' });
  }
});

app.post('/api/anotador/transcribir-audio', async (req, res) => {
  try {
    const { dataUrl, mimeType } = req.body || {};
    const raw = String(dataUrl || '').trim();
    if (!raw) {
      res.status(400).json({ exito: false, error: 'Audio requerido para transcribir.' });
      return;
    }

    const match = raw.match(/^data:([^;]+);base64,(.+)$/i);
    const detectedMime = match ? match[1].split(';')[0] : String(mimeType || 'audio/webm');
    const base64Data = match ? match[2] : raw;

    if (!isModelosPagosHabilitados() || tieneGroqConfigurado()) {
      if (!tieneGroqConfigurado()) {
        res.status(503).json({
          exito: false,
          error:
            'El modo gratuito ($0) usa Groq Whisper para transcribir notas de voz, pero falta GROQ_API_KEY en el servidor.',
        });
        return;
      }

      const groqRes = await transcribirAudioCortoConGroq({
        buffer: Buffer.from(base64Data, 'base64'),
        mimeType: detectedMime,
      });
      res.json({
        exito: true,
        modelo: groqRes.modeloUsado,
        transcripcion: groqRes.texto || '(Audio sin habla detectable)',
      });
      return;
    }

    const clienteAi = obtenerClienteGeminiActivo();
    if (!clienteAi) {
      res.status(503).json({
        exito: false,
        error: 'Gemini API no configurada en el servidor para transcribir audios.',
      });
      return;
    }

    const audioPart = {
      inlineData: {
        mimeType: detectedMime,
        data: base64Data,
      },
    };

    const { response, modelUsed } = await generarContenidoConFallback({
      ai: clienteAi,
      model: GEMINI_TRANSCRIBE_MODEL,
      isAudio: true,
      contents: {
        parts: [
          audioPart,
          {
            text:
              'Transcribe fielmente esta nota de voz de inspección de obra eléctrica 132 kV en español, respetando terminología técnica (hormigón H-25, puesta a tierra, PAT, ohmios, conductor ACSR, OPGW, aisladores, piquetes, APC, cruces).',
          },
        ],
      },
      timeoutMs: 25000,
    });

    const transcripcion = (response.text || '').trim();
    clearUltimoErrorGemini();
    res.json({
      exito: true,
      modelo: modelUsed,
      transcripcion: transcripcion || '(Audio sin habla detectable)',
    });
  } catch (err: any) {
    console.warn('[TranscribirAudio] Error:', err?.message || err);
    if (!isModelosPagosHabilitados()) {
      res.status(500).json({
        exito: false,
        error: sanitizarErrorGroq(err?.message || 'Error transcribiendo audio con Groq Whisper.'),
      });
      return;
    }
    formatearAvisoErrorGemini(err);
    const info = clasificarErrorGemini(err);
    res.status(info.codigoHttp === 402 ? 402 : 500).json({
      exito: false,
      error: info.estado === 'CREDITOS_AGOTADOS'
        ? 'Créditos prepagos de Gemini agotados (HTTP 402). Verifica facturación o clave en Settings > Secrets.'
        : info.mensaje || 'Error transcribiendo audio con Gemini.',
    });
  }
});

app.post('/api/anotador/analizar-foto', async (req, res) => {
  try {
    const { dataUrl, nombre = 'foto_campo.jpg', notaActual = '' } = req.body || {};
    const raw = String(dataUrl || '').trim();
    if (!raw) {
      res.status(400).json({ exito: false, error: 'Imagen requerida para analizar.' });
      return;
    }

    const match = raw.match(/^data:([^;]+);base64,(.+)$/i);
    const detectedMime = match ? match[1] : 'image/jpeg';
    const base64Data = match ? match[2] : raw;

    const promptAnalisisFoto =
      `Inspecciona esta fotografía de campo de una obra eléctrica 132 kV ("${nombre}"). ` +
      (notaActual ? `Contexto de notas de campo: "${String(notaActual).slice(0, 600)}". ` : '') +
      `Entrega un diagnóstico técnico conciso (4 a 6 puntos en viñetas): ` +
      `1) Elementos visibles (excavación, armadura, hormigón, estructura metálica, puesta a tierra, conductores, tablero o EPP), ` +
      `2) Estado constructivo o avance observado, ` +
      `3) Posibles observaciones de calidad o seguridad e higiene (H&S) si las hubiera, ` +
      `4) Recomendación de registro para libro/inspección.`;

    if (!isModelosPagosHabilitados()) {
      if (!tieneOpenRouterConfigurado()) {
        res.status(503).json({
          exito: false,
          error:
            'El modo gratuito ($0) usa OpenRouter Vision (:free) para analizar fotos, pero falta OPENROUTER_API_KEY en el servidor.',
        });
        return;
      }

      const normalizedDataUrl = raw.startsWith('data:')
        ? raw
        : `data:${detectedMime};base64,${base64Data}`;
      const visionRes = await generarVisionOpenRouter({
        dataUrl: normalizedDataUrl,
        prompt: promptAnalisisFoto,
        timeoutMs: 35000,
      });
      res.json({
        exito: true,
        modelo: visionRes.modelUsed,
        analisisIA: visionRes.texto || 'Análisis completado sin observaciones adicionales.',
      });
      return;
    }

    const clienteAi = obtenerClienteGeminiActivo();
    if (!clienteAi) {
      res.status(503).json({
        exito: false,
        error: 'Gemini API no configurada en el servidor para analizar imágenes.',
      });
      return;
    }

    const { response, modelUsed } = await generarContenidoConFallback({
      ai: clienteAi,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: detectedMime,
              data: base64Data,
            },
          },
          {
            text: promptAnalisisFoto,
          },
        ],
      },
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
      timeoutMs: 25000,
    });

    const analisisIA = (response.text || '').trim();
    clearUltimoErrorGemini();
    res.json({
      exito: true,
      modelo: modelUsed,
      analisisIA: analisisIA || 'Análisis completado sin observaciones adicionales.',
    });
  } catch (err: any) {
    console.warn('[AnalizarFoto] Error:', err?.message || err);
    if (!isModelosPagosHabilitados()) {
      res.status(500).json({
        exito: false,
        error: err?.message || 'Error analizando fotografía en modo gratuito.',
      });
      return;
    }
    formatearAvisoErrorGemini(err);
    const info = clasificarErrorGemini(err);
    res.status(info.codigoHttp === 402 ? 402 : 500).json({
      exito: false,
      error: info.estado === 'CREDITOS_AGOTADOS'
        ? 'Créditos prepagos de Gemini agotados (HTTP 402). Verifica facturación o clave en Settings > Secrets.'
        : info.mensaje || 'Error analizando imagen con Gemini.',
    });
  }
});

function normalizarHistorialConversacion(
  historialMensajes?: unknown,
  historialLegacy?: unknown
): HistorialTurnoOpenRouter[] {
  const resultado: HistorialTurnoOpenRouter[] = [];
  if (Array.isArray(historialMensajes)) {
    for (const item of historialMensajes) {
      if (!item || typeof item !== 'object') continue;
      const obj = item as Record<string, any>;
      const rawRol = String(obj.rol || obj.role || '').toLowerCase();
      const rol: 'usuario' | 'asistente' =
        rawRol === 'asistente' || rawRol === 'assistant' || rawRol === 'model'
          ? 'asistente'
          : 'usuario';
      const texto = String(obj.texto || obj.text || obj.content || obj.contenido || '').trim();
      if (!texto) continue;
      resultado.push({ rol, texto: texto.slice(0, 4000) });
    }
  } else if (Array.isArray(historialLegacy)) {
    for (const item of historialLegacy) {
      if (!item || typeof item !== 'object') continue;
      const obj = item as Record<string, any>;
      const rawRol = String(obj.rol || obj.role || '').toLowerCase();
      const rol: 'usuario' | 'asistente' =
        rawRol === 'asistente' || rawRol === 'assistant' || rawRol === 'model'
          ? 'asistente'
          : 'usuario';
      const texto = String(obj.texto || obj.text || obj.content || obj.contenido || '').trim();
      if (texto) resultado.push({ rol, texto: texto.slice(0, 4000) });
    }
  }
  return resultado.slice(-14);
}

function construirTurnosGemini(
  historialNormalizado: HistorialTurnoOpenRouter[],
  partsActuales: any[]
): Array<{ role: 'user' | 'model'; parts: any[] }> {
  const turns: Array<{ role: 'user' | 'model'; parts: any[] }> = [];
  for (const h of historialNormalizado) {
    const txt = (h.texto || '').trim();
    if (!txt) continue;
    const role: 'user' | 'model' = h.rol === 'asistente' ? 'model' : 'user';
    if (turns.length === 0 && role === 'model') {
      continue;
    }
    const prev = turns[turns.length - 1];
    if (prev && prev.role === role) {
      prev.parts.push({ text: `\n${txt}` });
    } else {
      turns.push({ role, parts: [{ text: txt }] });
    }
  }

  // Si el último turno previo ya era 'user', insertar un breve puente 'model' o concatenar limpio
  if (turns.length > 0 && turns[turns.length - 1].role === 'user') {
    turns[turns.length - 1].parts.push(...partsActuales);
    return turns;
  }

  turns.push({ role: 'user', parts: partsActuales });
  return turns;
}

function determinarThinkingLevelDinamico(
  decision: Extract<ReturnType<typeof resolverEjecucionPrecision>, { permitido: true }>,
  mensaje: string
): { thinkingEnum: ThinkingLevel; thinkingLabel: 'MINIMAL' | 'LOW' | 'MEDIUM' | 'HIGH' } {
  if (decision.def.modelo === 'gemini-4-hydrogen') {
    const esCompleja =
      mensaje.length > 180 ||
      /\b(compar|discrepanc|contradic|diferenc|resum|explic|redacta|calcula|analiza|audita|evalua|justifica|paso a paso|punto por punto|relacion|por que|como funciona|estrategia)\b/i.test(
        mensaje
      );
    if (esCompleja) {
      return { thinkingEnum: ThinkingLevel.HIGH, thinkingLabel: 'HIGH' };
    }
  }
  return {
    thinkingEnum: decision.thinkingEnum,
    thinkingLabel: decision.def.thinkingLevel,
  };
}

/**
 * Helper compartido para armar las partes de consulta completa (Pliegos + Docs Drive + Planos PDF + Datos vivos de Obra) hacia Gemini.
 */
async function prepararContenidoConsulta(
  mensaje: string,
  historial?: unknown,
  contextoObra?: any,
  driveOptions?: { accessToken?: string; folderId?: string },
  historialMensajes?: unknown
) {
  obtenerClienteGeminiActivo();
  const historialNormalizado = normalizarHistorialConversacion(historialMensajes, historial);
  const historialTexto =
    typeof historial === 'string' && historial.trim()
      ? historial
      : historialNormalizado
          .map(h => `${h.rol === 'usuario' ? 'Usuario' : 'Asistente'}: ${h.texto}`)
          .join('\n');

  const analisisSemantico = analizarYExpandirConsulta(mensaje, historialTexto);
  const { consultaCombinada } = extraerTerminosBusquedaDrive(mensaje, historialTexto);
  const recuperado = recuperarFragmentosRelevantes(consultaCombinada, pliegosIndexados, 160000);
  const escaneados = pliegosIndexados.filter(p => p.esEscaneado);

  // Búsqueda en caché local + búsqueda en vivo en Google Drive (Memorias Descriptivas, Estudios de Suelos, Especificaciones, etc.)
  const driveRes = await buscarYLeerDocumentosDriveEnVivo({
    query: mensaje,
    historial: historialTexto,
    accessToken: driveOptions?.accessToken,
    rootFolderId: driveOptions?.folderId,
    ai,
    storeActual: storeDriveDocumentos,
  });
  storeDriveDocumentos = driveRes.storeActualizado;

  const parts: any[] = [];

  if (ai && escaneados.length > 0) {
    for (const pEsc of escaneados) {
      const uri = await asegurarGeminiFileUri(pEsc, ai);
      if (uri) {
        parts.push({
          fileData: {
            mimeType: pEsc.geminiFileMime || 'application/pdf',
            fileUri: uri,
          },
        });
      }
    }
  }

  // Inventario explícito y verificable para evitar confundir Pliegos/Catálogo con Memorias no cargadas
  const notasLibroFuente: NotaLibro[] =
    storeNotasLibro.length > 0
      ? storeNotasLibro
      : Array.isArray(contextoObra?.notasLibro)
        ? (contextoObra.notasLibro as NotaLibro[])
        : Array.isArray(contextoObra?.notasLibroResumen)
          ? (contextoObra.notasLibroResumen as NotaLibro[])
          : [];

  const listaPliegosCargados =
    pliegosIndexados.length > 0
      ? pliegosIndexados.map(p => `${p.nombre} (${p.paginas} págs)`).join(' | ')
      : '(ninguno cargado)';
  const listaDocsDrive =
    storeDriveDocumentos.length > 0
      ? storeDriveDocumentos
          .slice(0, 30)
          .map(d => `${d.nombre} [${d.rutaCarpeta}, ${d.paginas} págs]`)
          .join(' | ')
      : '(ninguno indexado todavía)';
  const listaAdjuntosChat =
    chatAdjuntos.length > 0
      ? chatAdjuntos.map(a => `${a.nombre} (${a.paginas} págs)`).join(' | ')
      : '(ninguno)';
  const estadoDriveVivo = driveOptions?.accessToken
    ? driveRes.errorDrive
      ? `CONECTADO CON ERROR (${driveRes.errorDrive})`
      : `ACTIVO (búsqueda en vivo ejecutada; documentos nuevos leídos en este turno: ${
          driveRes.nuevosLeidos.length > 0 ? driveRes.nuevosLeidos.join(', ') : '0'
        })`
    : 'NO CONECTADO EN ESTA SESIÓN (para leer enlaces o carpetas de Drive en vivo el usuario debe presionar "Conectar Drive" / "Docs Drive"; si el navegador bloquea el popup con auth/popup-blocked, debe permitir popups o usar "Abrir en pestaña nueva", o bien usar "Adjuntar PDF" directo en el chat)';

  parts.push({
    text:
      `INVENTARIO REAL DE DOCUMENTOS DISPONIBLES EN ESTA CONSULTA:\n` +
      `- Pliegos Reales indexados (${pliegosIndexados.length}): ${listaPliegosCargados}\n` +
      `- Documentos Técnicos / Memorias Descriptivas de Google Drive indexados (${storeDriveDocumentos.length}): ${listaDocsDrive}\n` +
      `- Búsqueda en vivo en Google Drive: ${estadoDriveVivo}\n` +
      `- PDFs adjuntos en el Chat (${chatAdjuntos.length}): ${listaAdjuntosChat}\n` +
      `- Notas de Libro de Comunicaciones (${notasLibroFuente.length})\n` +
      `- Minutas de Reunión (${storeMinutas.minutas.length})\n` +
      `- Planos PDF en Comparador: A=${planosComparador.A?.nombre || 'ninguno'}, B=${planosComparador.B?.nombre || 'ninguno'}\n` +
      `- Catálogo de Planos: es SOLO un listado de códigos y títulos (ej. ET-LE-OC-MD-513), NO contiene el texto interno de Memorias Descriptivas ni Estudios de Suelos.\n` +
      `IMPORTANTE: Si el usuario pide buscar dentro de un documento específico (p. ej. una Memoria Descriptiva o Estudio particular) y ese documento NO figura en las listas reales anteriores ni en los extractos de Drive/Pliegos/Adjuntos de abajo, infórmalo con total transparencia al principio de tu respuesta antes de ofrecer cualquier información complementaria o criterio técnico general.`,
  });

  // 1. LIBRO DE COMUNICACIONES / NOTAS DE LIBRO (Índice completo + Hilos Pregunta-Respuesta + Actores + Textos)
  if (notasLibroFuente.length > 0) {
    const contextoNotas = construirContextoNotasLibro(consultaCombinada, notasLibroFuente, 85000);
    if (contextoNotas) {
      parts.push({
        text: contextoNotas,
      });
    }
  }

  // 2. Documentos Técnicos / Memorias Descriptivas / Estudios desde Google Drive
  if (driveRes.contextoTexto) {
    parts.push({
      text:
        `EXTRACTOS REALES DE DOCUMENTOS TÉCNICOS / MEMORIAS DESCRIPTIVAS DE GOOGLE DRIVE ` +
        `(Coincidentes: ${driveRes.documentosCoincidentes.map(d => `${d.nombre} [${d.rutaCarpeta}]`).join(', ') || 'ver inventario'}):\n` +
        `${driveRes.contextoTexto}`,
    });
  }

  // 3. Documentos PDF adjuntados en el Chat IA
  if (chatAdjuntos.length > 0) {
    const infoAdjuntos: string[] = [];
    for (const adj of chatAdjuntos) {
      if (adj.esEscaneado && ai) {
        const uri = await asegurarGeminiFileUri(adj as unknown as PliegoIndexado, ai);
        if (uri) {
          parts.push({
            fileData: {
              mimeType: adj.geminiFileMime || 'application/pdf',
              fileUri: uri,
            },
          });
        }
      }
      infoAdjuntos.push(
        `=== DOCUMENTO PDF ADJUNTO EN CHAT: ${adj.nombre} (${adj.paginas} págs, ${adj.caracteresTexto} chars) ===\n` +
        `Métricas / códigos detectados: ${(adj.metricasDetectadas || []).join(', ') || 'N/A'}\n` +
        `${adj.contenidoTexto ? adj.contenidoTexto.slice(0, 60000) : '[Archivo PDF escaneado adjunto visualmente]'}`
      );
    }
    parts.push({
      text: `DOCUMENTOS PDF ADJUNTADOS POR EL USUARIO EN EL CHAT:\n${infoAdjuntos.join('\n\n')}`,
    });
  }

  // 4. Planos PDF cargados en el comparador
  if (planosComparador.A || planosComparador.B) {
    const infoPlanos: string[] = [];
    if (planosComparador.A) {
      infoPlanos.push(
        `[PLANO A EN COMPARADOR: ${planosComparador.A.nombre} (${planosComparador.A.paginas} págs)]\n` +
        `Métricas: ${(planosComparador.A.metricasDetectadas || []).join(', ')}\n` +
        `${(planosComparador.A.contenidoTexto || '').slice(0, 22000)}`
      );
    }
    if (planosComparador.B) {
      infoPlanos.push(
        `[PLANO B EN COMPARADOR: ${planosComparador.B.nombre} (${planosComparador.B.paginas} págs)]\n` +
        `Métricas: ${(planosComparador.B.metricasDetectadas || []).join(', ')}\n` +
        `${(planosComparador.B.contenidoTexto || '').slice(0, 22000)}`
      );
    }
    parts.push({
      text: `PLANOS PDF CARGADOS EN COMPARADOR:\n${infoPlanos.join('\n\n')}`,
    });
  }

  // 5. Datos vivos de obra (Catálogo completo/filtrado de Planos, Hitos, Interferencias reales, Notas de Campo)
  if (contextoObra) {
    const { notasLibro: _omitDup, notasLibroResumen: _omitRes, ...restoContexto } = contextoObra;
    parts.push({
      text: `DATOS VIVOS DE LA OBRA (CATÁLOGO DE PLANOS, HITOS CONTRACTUALES, INTERFERENCIAS REALES Y NOTAS DE CAMPO):\n${JSON.stringify(restoContexto)}`,
    });
  } else if (storeInterferencias.length > 0) {
    parts.push({
      text: `INTERFERENCIAS Y CRUCES REALES SINCRONIZADOS (${storeInterferencias.length}):\n${JSON.stringify(storeInterferencias)}`,
    });
  }

  // 6. Minutas, Compromisos y Notas de Pedido de Ingeniería
  if (storeMinutas.minutas.length > 0 || storeMinutas.compromisos.length > 0 || storeMinutas.notasPedido.length > 0) {
    const indiceTodasMinutas = storeMinutas.minutas
      .map(
        m =>
          `• [${m.codigo} | ${m.fechaReunion} | ${m.frente}] ${m.titulo} | Participantes: ${m.participantes || 'N/A'} | Resumen: ${m.resumen || ''}`
      )
      .join('\n');

    const minutasConScore = storeMinutas.minutas.map(m => {
      const full = `${m.codigo} ${m.titulo} ${m.contenidoTexto || ''}`
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
      let sc = 0;
      for (const w of analisisSemantico.tokensNucleo) {
        if (full.includes(w)) sc += 12;
      }
      for (const w of analisisSemantico.tokensExpandidos) {
        if (full.includes(w)) sc += 5;
      }
      for (const frase of analisisSemantico.frasesClave) {
        if (full.includes(frase)) sc += 18;
      }
      return { m, sc };
    });
    minutasConScore.sort(
      (a, b) => b.sc - a.sc || (b.m.fechaReunion || '').localeCompare(a.m.fechaReunion || '')
    );

    const extractosMinutas = minutasConScore
      .slice(0, 12)
      .map(
        ({ m }) =>
          `[MINUTA ${m.codigo} | ${m.fechaReunion} | ${m.frente}]: ${m.titulo}\n${(m.contenidoTexto || '').slice(0, 5000)}`
      )
      .join('\n\n');

    const resumenComp = storeMinutas.compromisos
      .map(
        c =>
          `- [${c.estado}] (${c.minutaCodigo} ${c.minutaFecha}) ${c.numeroItem}: ${c.descripcion} | Resp: ${c.responsable} | Vence: ${c.fechaLimite} | NP: ${(c.notasPedidoIds || []).join(', ') || 'Sin NP'}`
      )
      .join('\n');

    const resumenNotasPed = storeMinutas.notasPedido
      .map(
        np =>
          `• [${np.numeroNota} | ${np.fechaEmision}] Emisor: ${np.emisor} ➔ Destinatario: ${np.destinatario} | Asunto: ${np.asunto}\n${(np.contenidoMarkdown || '').slice(0, 3500)}`
      )
      .join('\n\n');

    parts.push({
      text:
        `MINUTAS DE REUNIÓN (${storeMinutas.minutas.length} TOTALES):\n${indiceTodasMinutas}\n\n` +
        `EXTRACTOS DE MINUTAS RELEVANTES:\n${extractosMinutas}\n\n` +
        `COMPROMISOS (${storeMinutas.compromisos.length} TOTALES):\n${resumenComp}\n\n` +
        (resumenNotasPed ? `NOTAS DE PEDIDO GENERADAS:\n${resumenNotasPed}` : ''),
    });
  }

  // 7. Pliegos Reales indexados
  if (recuperado.contextoTexto) {
    parts.push({
      text: `CONTEXTO DE PLIEGOS REALES INDEXADOS:\n${recuperado.contextoTexto}`,
    });
  }

  const consultaEsSobreNotasLibro =
    /\b(nota|notas de libro|libro de comunicaciones|orden de servicio|nota de pedido|nota de servicio|np-|os-|ns-|lib-|transnoa.*contest|contest.*nota|discrepanc.*nota|quien emit)/i.test(
      mensaje
    );

  parts.push({
    text:
      `SOLICITUD ACTUAL DEL USUARIO:\n${mensaje}\n\n` +
      `Criterios de respuesta para este turno:\n` +
      `- Responde con la profundidad, fluidez y naturalidad de un Ingeniero Senior que domina tanto la ingeniería eléctrica/civil (AEA, CIRSOC, IRAM, IEC, ASTM) como la documentación real del proyecto.\n` +
      `- Si el usuario redactó una consulta extensa, coloquial o con múltiples sub-preguntas, aborda cada punto de manera ordenada, conectando las ideas y explicando implicancias prácticas de obra, sin omitir matices.\n` +
      `- Verifica primero el INVENTARIO REAL DE DOCUMENTOS arriba: si pidió un archivo puntual que NO figura cargado ni hallado en Google Drive, acláralo con naturalidad al inicio (indicando cómo conectar Drive o adjuntar el PDF) antes de aportar lo encontrado en otras fuentes o tu criterio de ingeniería.\n` +
      `- Nunca inventes códigos de nota, artículos, fechas ni fragmentos literales inexistentes.\n` +
      (consultaEsSobreNotasLibro
        ? `- Al tratarse de Notas de Libro / Comunicaciones, diferencia claramente Emisor vs. Receptor (UTE / Contratista vs. TRANSNOA vs. Inspección vs. Comitente) y resume en tabla Markdown clara cuando compare contestaciones o discrepancias.`
        : `- Adapta el formato a la intención del usuario (explicación clara, análisis por puntos, cálculos paso a paso, borrador formal o tabla comparativa si ayuda).`),
  });

  return { parts, historialNormalizado, recuperado, driveRes };
}

function construirFallbackInteligente(
  mensaje: string,
  recuperado: ReturnType<typeof recuperarFragmentosRelevantes>,
  contextoObra?: any,
  driveContextoTexto?: string
): string {
  if (chatAdjuntos.length > 0) {
    return auditarAdjuntoVsPliegoLocal(chatAdjuntos, pliegosIndexados, mensaje);
  }

  if (driveContextoTexto && driveContextoTexto.trim()) {
    return `### Extractos encontrados en Documentos Técnicos de Google Drive\n\n${driveContextoTexto.slice(0, 12000)}`;
  }

  if (
    storeNotasLibro.length > 0 &&
    /\b(nota|libro|transnoa|contest|respond|orden de servicio|nota de pedido|nota de servicio|discrepanc|actor|np|os|ns)\b/i.test(
      mensaje
    )
  ) {
    return construirFallbackLocalNotasLibro(mensaje, storeNotasLibro);
  }

  // Si el usuario pide comparar Planos A/B en el chat
  if (
    (planosComparador.A || planosComparador.B) &&
    /plano|compar|discrepanc|diferenc/i.test(mensaje) &&
    planosComparador.A
  ) {
    return compararPlanosLocalFallback({
      planoA: planosComparador.A,
      planoB: planosComparador.B,
      pliegos: pliegosIndexados,
      enfoque: mensaje,
    });
  }

  // Si pregunta por hitos o interferencias y hay contextoObra
  if (contextoObra && /hito|cruce|interferenc|cronograma|catalogo|apc/i.test(mensaje)) {
    const hitosArr = Array.isArray(contextoObra.hitos) ? contextoObra.hitos : [];
    const interfArr = Array.isArray(contextoObra.interferencias) ? contextoObra.interferencias : [];
    const filasHitos = hitosArr.slice(0, 10).map((h: any) => `| ${h.codigo} | ${h.nombre} | ${h.frente} | ${h.fechaObjetivo} |`);
    const filasInterf = interfArr.map((c: any) => `| ${c.empresa} | ${c.estadoTramite} | ${c.vanosAfectados || '-'} |`);

    return (
      `### Estado Vivo de Obra (Hitos e Interferencias)\n\n` +
      (filasHitos.length > 0
        ? `#### Hitos Contractuales (${hitosArr.length})\n| Código | Hito | Frente | Fecha Objetivo |\n|---|---|---|---|\n${filasHitos.join('\n')}\n\n`
        : '') +
      (filasInterf.length > 0
        ? `#### Interferencias y Cruces (${interfArr.length})\n| Organismo | Estado | Vanos |\n|---|---|---|\n${filasInterf.join('\n')}\n`
        : '')
    );
  }

  if (pliegosIndexados.length > 0) {
    return generarCuadroComparativoLocal(mensaje, pliegosIndexados, recuperado);
  }

  if (storeNotasLibro.length > 0) {
    return construirFallbackLocalNotasLibro(mensaje, storeNotasLibro);
  }

  const local = buscarYExtraerDePliegosReales(mensaje, pliegosIndexados);
  return local.resumen;
}

const SYSTEM_INSTRUCTION_OBRA_COMPLETA =
  'Eres un Ingeniero Senior Especialista en Obras de Alta Tensión 132 kV (Líneas Aéreas LAT y Estaciones Transformadoras ET), Ingeniería Civil/Geotecnia, Control Documental y Auditoría Contractual en Argentina.\n' +
  'Comunícate como una IA conversacional inteligente, natural y resolutiva en español: comprende preguntas extensas, coloquiales, matices de obra o consultas con múltiples temas entrelazados, razona paso a paso cuando la situación lo amerite y responde con claridad y criterio práctico.\n' +
  'Principios de trabajo:\n' +
  '1. **Comprensión amplia y continuidad real**: Interpreta el sentido completo de lo que el usuario pregunta (incluso si usa términos informales o hace preguntas de seguimiento como "y eso cómo afecta..." o "redactame la respuesta para..."), apoyándote en toda la conversación previa.\n' +
  '2. **Veracidad documental estricta**: Revisa el INVENTARIO REAL DE DOCUMENTOS de cada turno. Si el usuario pide buscar dentro de un documento concreto que NO está cargado ni hallado en Google Drive, dilo con honestidad al comienzo (indicando qué fuentes sí tienes y cómo conectar Drive o adjuntar el PDF) y nunca hagas pasar otro documento como si fuera ese archivo faltante. Jamás inventes códigos de nota, fechas, artículos ni citas literales.\n' +
  '3. **Criterio técnico y formato flexible**: Domina normativa AEA 95301, CIRSOC, IRAM, IEC y ASTM, redacción formal de Notas de Pedido/Servicio y análisis de desvíos. Adapta la estructura de tu respuesta a lo que mejor ayude al usuario (explicación fluida, lista estructurada, cálculo detallado, borrador listo para enviar o tabla comparativa).\n' +
  '4. **Libro de Comunicaciones (solo cuando corresponda)**: Si la consulta trata sobre Notas de Libro (NP, OS, NS) o contestaciones/discrepancias, diferencia claramente Emisor vs. Receptor (UTE/Contratista, TRANSNOA, Inspección, Comitente) y usa tablas comparativas cuando aporten claridad.';

// 5. Endpoint STREAMING (SSE) para respuesta instantánea palabra por palabra
app.post('/api/chat/stream', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const enviarEvento = (payload: Record<string, any>) => {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };
  enviarEvento({ status: 'analizando' });

  try {
    const {
      mensaje,
      historial,
      historialMensajes,
      pliegoIds,
      contextoObra,
      driveAccessToken,
      driveFolderId,
      precisionNivel,
      modeloSolicitado,
    } = req.body || {};
    if (!mensaje || typeof mensaje !== 'string') {
      enviarEvento({ error: 'Mensaje requerido', done: true });
      res.end();
      return;
    }

    if (pliegosIndexados.length === 0 && Array.isArray(pliegoIds) && pliegoIds.length > 0) {
      enviarEvento({ needsSync: true, done: true });
      res.end();
      return;
    }

    const decision = resolverEjecucionPrecision({
      nivelSolicitado: typeof precisionNivel === 'string' ? precisionNivel : undefined,
      modeloSolicitado: typeof modeloSolicitado === 'string' ? modeloSolicitado : undefined,
    });
    if (!decision.permitido) {
      enviarEvento({
        error: decision.motivoLimite,
        limitReached: true,
        estadoPrecision: getGeminiPrecisionState(),
        done: true,
      });
      res.end();
      return;
    }

    const tokenDrive =
      typeof driveAccessToken === 'string' && driveAccessToken.trim()
        ? driveAccessToken.trim()
        : String(req.headers['x-drive-token'] || '').trim() || undefined;
    const folderDrive =
      typeof driveFolderId === 'string' && driveFolderId.trim() ? driveFolderId.trim() : undefined;

    const { parts, historialNormalizado, recuperado, driveRes } = await prepararContenidoConsulta(
      mensaje,
      historial,
      contextoObra,
      { accessToken: tokenDrive, folderId: folderDrive },
      historialMensajes
    );

    const { thinkingEnum, thinkingLabel } = determinarThinkingLevelDinamico(decision, mensaje);

    let avisoErrorGemini = '';
    if (decision.def.proveedor === 'openrouter') {
      const modeloOrSolicitado = getOpenRouterModeloPreferido();
      if (tieneOpenRouterConfigurado()) {
        try {
          const orRes = await generarStreamOpenRouter({
            parts,
            historialMensajes: historialNormalizado,
            systemInstruction: SYSTEM_INSTRUCTION_OBRA_COMPLETA,
            model: modeloOrSolicitado,
            onChunk: chunkTxt => {
              enviarEvento({ chunk: chunkTxt });
            },
          });

          if (orRes.textoCompleto.trim().length > 0) {
            const consumo = registrarConsumoGemini({
              modelo: OPENROUTER_FREE_MODEL,
              inputTokensDirecto: orRes.inputTokens,
              outputTokensDirecto: orRes.outputTokens,
            });
            enviarEvento({
              done: true,
              fuente: `${orRes.modelUsed}-stream`,
              nuevosDriveLeidos: driveRes.nuevosLeidos,
              driveDocsTotal: storeDriveDocumentos.length,
              precisionMeta: {
                nivelId: decision.def.nivelId,
                etiquetaNivel: decision.def.etiquetaNivel,
                proveedor: 'openrouter',
                modeloUsado: orRes.modelUsed,
                thinkingLevel: 'OPENROUTER_FREE',
                inputTokens: consumo.inputTokens,
                outputTokens: consumo.outputTokens,
                costoUsd: 0,
                ...(decision.fallbackDesdeModelo
                  ? { fallbackDesdeModelo: decision.fallbackDesdeModelo }
                  : {}),
              },
              estadoPrecision: getGeminiPrecisionState(),
            });
            res.end();
            return;
          }
        } catch (orErr: any) {
          console.warn('[OpenRouter Stream] Error:', orErr?.message || orErr);
          avisoErrorGemini = formatearAvisoErrorOpenRouter(orErr, modeloOrSolicitado);
        }
      } else {
        avisoErrorGemini = isModelosPagosHabilitados()
          ? `> ⚠️ **No se detectó \`OPENROUTER_API_KEY\` en este proceso del servidor.** ` +
            `Si acabas de guardarla en **Settings > Secrets**, recarga o reinicia el entorno para que el servidor tome la variable; mientras tanto puedes usar **Económico · Rápido (Gemini)**.\n\n`
          : `> ⚠️ **No se detectó \`OPENROUTER_API_KEY\` en este proceso del servidor.** ` +
            `Configúrala en **Settings > Secrets** para habilitar el motor gratuito (:free). Mostrando búsqueda local.\n\n`;
      }
    } else {
      const clienteAi = obtenerClienteGeminiActivo();
      if (clienteAi) {
        try {
          const geminiContents = construirTurnosGemini(historialNormalizado, parts);
          const { stream, modelUsed } = await generarStreamConFallback({
            ai: clienteAi,
            model: decision.def.modelo,
            contents: geminiContents,
            config: {
              thinkingConfig: { thinkingLevel: thinkingEnum },
              systemInstruction: SYSTEM_INSTRUCTION_OBRA_COMPLETA,
            },
          });

          let huboTexto = false;
          let totalOutputChars = 0;
          let lastUsageMetadata: any = undefined;
          for await (const chunk of stream) {
            if ((chunk as any)?.usageMetadata) {
              lastUsageMetadata = (chunk as any).usageMetadata;
            }
            const txt = chunk.text;
            if (txt) {
              huboTexto = true;
              totalOutputChars += txt.length;
              enviarEvento({ chunk: txt });
            }
          }

          if (huboTexto) {
            clearUltimoErrorGemini();
            const inputCharsApprox =
              parts.reduce((acc, p) => acc + (typeof p?.text === 'string' ? p.text.length : 1000), 0) +
              historialNormalizado.reduce((acc, h) => acc + h.texto.length, 0);
            const consumo = registrarConsumoGemini({
              modelo: modelUsed,
              usageMetadata: lastUsageMetadata,
              inputCharsFallback: inputCharsApprox,
              outputCharsFallback: totalOutputChars,
            });
            enviarEvento({
              done: true,
              fuente: `${modelUsed}-stream`,
              nuevosDriveLeidos: driveRes.nuevosLeidos,
              driveDocsTotal: storeDriveDocumentos.length,
              precisionMeta: {
                nivelId: decision.def.nivelId,
                etiquetaNivel: decision.def.etiquetaNivel,
                proveedor: 'gemini',
                modeloUsado: modelUsed,
                thinkingLevel: thinkingLabel,
                inputTokens: consumo.inputTokens,
                outputTokens: consumo.outputTokens,
                costoUsd: consumo.costoUsd,
                ...(decision.fallbackDesdeModelo
                  ? { fallbackDesdeModelo: decision.fallbackDesdeModelo }
                  : {}),
              },
              estadoPrecision: getGeminiPrecisionState(),
            });
            res.end();
            return;
          }
        } catch (geminiError: any) {
          console.warn('[Gemini Stream] Error llamando a Gemini:', geminiError?.message || geminiError);
          avisoErrorGemini = formatearAvisoErrorGemini(geminiError, decision.def.modelo);
        }
      } else {
        avisoErrorGemini = obtenerAvisoSinClienteGemini();
      }
    }

    const respuestaLocal = construirFallbackInteligente(
      mensaje,
      recuperado,
      contextoObra,
      driveRes.contextoTexto
    );
    enviarEvento({
      chunk: `${avisoErrorGemini}${respuestaLocal}`,
      done: true,
      fuente: 'indice-local-rapido',
      nuevosDriveLeidos: driveRes.nuevosLeidos,
      driveDocsTotal: storeDriveDocumentos.length,
    });
    res.end();
  } catch (err: any) {
    enviarEvento({ error: err?.message || 'Error en stream', done: true });
    res.end();
  }
});

// 6. Endpoint estándar de extracción puntual sobre pliegos reales
app.post('/api/pliegos/extraer', async (req, res) => {
  try {
    const { consulta } = req.body || {};
    if (!consulta || typeof consulta !== 'string') {
      res.status(400).json({ exito: false, error: 'Consulta requerida' });
      return;
    }

    if (pliegosIndexados.length === 0) {
      res.json({
        exito: true,
        fuente: 'aviso-sin-pliegos',
        respuesta:
          '⚠️ **No tienes pliegos reales cargados.**\n\nPor favor, sube tus pliegos en **"Cargar Pliego Real"** para extraer la información solicitada.',
      });
      return;
    }

    const { parts, recuperado, driveRes } = await prepararContenidoConsulta(consulta);

    let avisoErrorGemini = '';
    const clienteAi = isModelosPagosHabilitados() ? obtenerClienteGeminiActivo() : null;
    if (clienteAi || (!isModelosPagosHabilitados() && tieneOpenRouterConfigurado())) {
      try {
        const { response, modelUsed } = await generarContenidoConFallback({
          ai: clienteAi,
          contents: { parts },
          config: {
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            systemInstruction: SYSTEM_INSTRUCTION_OBRA_COMPLETA,
          },
          timeoutMs: 30000,
        });

        if (response.text && response.text.trim()) {
          clearUltimoErrorGemini();
          res.json({
            exito: true,
            fuente: modelUsed,
            respuesta: response.text,
          });
          return;
        }
      } catch (err: any) {
        console.warn('[Gemini Extraer] Fallback local:', err?.message || err);
        avisoErrorGemini = formatearAvisoErrorGemini(err);
      }
    } else {
      avisoErrorGemini = obtenerAvisoSinClienteGemini();
    }

    res.json({
      exito: true,
      fuente: 'indice-local-rapido',
      respuesta: `${avisoErrorGemini}${construirFallbackInteligente(consulta, recuperado, undefined, driveRes.contextoTexto)}`,
    });
  } catch (err: any) {
    res.status(500).json({ exito: false, error: err?.message || 'Error en extracción' });
  }
});

// 7. Endpoint no-streaming /api/chat (compatibilidad)
app.post('/api/chat', async (req, res) => {
  try {
    const {
      mensaje,
      historial,
      historialMensajes,
      pliegoIds,
      contextoObra,
      driveAccessToken,
      driveFolderId,
      precisionNivel,
      modeloSolicitado,
    } = req.body || {};
    if (!mensaje || typeof mensaje !== 'string') {
      res.status(400).json({ exito: false, error: 'Mensaje requerido' });
      return;
    }

    if (pliegosIndexados.length === 0 && Array.isArray(pliegoIds) && pliegoIds.length > 0) {
      res.json({ exito: false, needsSync: true });
      return;
    }

    const decision = resolverEjecucionPrecision({
      nivelSolicitado: typeof precisionNivel === 'string' ? precisionNivel : undefined,
      modeloSolicitado: typeof modeloSolicitado === 'string' ? modeloSolicitado : undefined,
    });
    if (!decision.permitido) {
      res.status(429).json({
        exito: false,
        limitReached: true,
        error: decision.motivoLimite,
        estadoPrecision: getGeminiPrecisionState(),
      });
      return;
    }

    const tokenDrive =
      typeof driveAccessToken === 'string' && driveAccessToken.trim()
        ? driveAccessToken.trim()
        : String(req.headers['x-drive-token'] || '').trim() || undefined;
    const folderDrive =
      typeof driveFolderId === 'string' && driveFolderId.trim() ? driveFolderId.trim() : undefined;

    const { parts, historialNormalizado, recuperado, driveRes } = await prepararContenidoConsulta(
      mensaje,
      historial,
      contextoObra,
      { accessToken: tokenDrive, folderId: folderDrive },
      historialMensajes
    );

    const { thinkingEnum, thinkingLabel } = determinarThinkingLevelDinamico(decision, mensaje);

    let avisoErrorGemini = '';
    if (decision.def.proveedor === 'openrouter') {
      const modeloOrSolicitado = getOpenRouterModeloPreferido();
      if (tieneOpenRouterConfigurado()) {
        try {
          const orRes = await generarChatOpenRouter({
            parts,
            historialMensajes: historialNormalizado,
            systemInstruction: SYSTEM_INSTRUCTION_OBRA_COMPLETA,
            model: modeloOrSolicitado,
            timeoutMs: 45000,
          });
          if (orRes.texto && orRes.texto.trim()) {
            const consumo = registrarConsumoGemini({
              modelo: OPENROUTER_FREE_MODEL,
              inputTokensDirecto: orRes.inputTokens,
              outputTokensDirecto: orRes.outputTokens,
            });
            res.json({
              exito: true,
              fuente: orRes.modelUsed,
              respuesta: orRes.texto,
              nuevosDriveLeidos: driveRes.nuevosLeidos,
              driveDocsTotal: storeDriveDocumentos.length,
              precisionMeta: {
                nivelId: decision.def.nivelId,
                etiquetaNivel: decision.def.etiquetaNivel,
                proveedor: 'openrouter',
                modeloUsado: orRes.modelUsed,
                thinkingLevel: 'OPENROUTER_FREE',
                inputTokens: consumo.inputTokens,
                outputTokens: consumo.outputTokens,
                costoUsd: 0,
                ...(decision.fallbackDesdeModelo
                  ? { fallbackDesdeModelo: decision.fallbackDesdeModelo }
                  : {}),
              },
              estadoPrecision: getGeminiPrecisionState(),
            });
            return;
          }
        } catch (orErr: any) {
          console.warn('[OpenRouter Chat] Fallback local:', orErr?.message || orErr);
          avisoErrorGemini = formatearAvisoErrorOpenRouter(orErr, modeloOrSolicitado);
        }
      } else {
        avisoErrorGemini = isModelosPagosHabilitados()
          ? `> ⚠️ **No se detectó \`OPENROUTER_API_KEY\` en este proceso del servidor.** ` +
            `Si acabas de guardarla en **Settings > Secrets**, recarga o reinicia el entorno para que el servidor tome la variable; mientras tanto puedes usar **Económico · Rápido (Gemini)**.\n\n`
          : `> ⚠️ **No se detectó \`OPENROUTER_API_KEY\` en este proceso del servidor.** ` +
            `Configúrala en **Settings > Secrets** para habilitar el motor gratuito (:free). Mostrando búsqueda local.\n\n`;
      }
    } else {
      const clienteAi = obtenerClienteGeminiActivo();
      if (clienteAi) {
        try {
          const geminiContents = construirTurnosGemini(historialNormalizado, parts);
          const { response, modelUsed } = await generarContenidoConFallback({
            ai: clienteAi,
            model: decision.def.modelo,
            contents: geminiContents,
            config: {
              thinkingConfig: { thinkingLevel: thinkingEnum },
              systemInstruction: SYSTEM_INSTRUCTION_OBRA_COMPLETA,
            },
            timeoutMs: 90000,
          });

          if (response.text && response.text.trim()) {
            clearUltimoErrorGemini();
            const inputCharsApprox =
              parts.reduce((acc, p) => acc + (typeof p?.text === 'string' ? p.text.length : 1000), 0) +
              historialNormalizado.reduce((acc, h) => acc + h.texto.length, 0);
            const consumo = registrarConsumoGemini({
              modelo: modelUsed,
              usageMetadata: (response as any).usageMetadata,
              inputCharsFallback: inputCharsApprox,
              outputCharsFallback: response.text.length,
            });
            res.json({
              exito: true,
              fuente: modelUsed,
              respuesta: response.text,
              nuevosDriveLeidos: driveRes.nuevosLeidos,
              driveDocsTotal: storeDriveDocumentos.length,
              precisionMeta: {
                nivelId: decision.def.nivelId,
                etiquetaNivel: decision.def.etiquetaNivel,
                proveedor: 'gemini',
                modeloUsado: modelUsed,
                thinkingLevel: thinkingLabel,
                inputTokens: consumo.inputTokens,
                outputTokens: consumo.outputTokens,
                costoUsd: consumo.costoUsd,
                ...(decision.fallbackDesdeModelo
                  ? { fallbackDesdeModelo: decision.fallbackDesdeModelo }
                  : {}),
              },
              estadoPrecision: getGeminiPrecisionState(),
            });
            return;
          }
        } catch (err: any) {
          console.warn('[Gemini Chat] Fallback local:', err?.message || err);
          avisoErrorGemini = formatearAvisoErrorGemini(err, decision.def.modelo);
        }
      } else {
        avisoErrorGemini = obtenerAvisoSinClienteGemini();
      }
    }

    res.json({
      exito: true,
      fuente: 'indice-local-rapido',
      respuesta: `${avisoErrorGemini}${construirFallbackInteligente(
        mensaje,
        recuperado,
        contextoObra,
        driveRes.contextoTexto
      )}`,
      nuevosDriveLeidos: driveRes.nuevosLeidos,
      driveDocsTotal: storeDriveDocumentos.length,
    });
  } catch (err: any) {
    res.status(500).json({ exito: false, error: err?.message || 'Error en procesamiento' });
  }
});

async function startServer() {
  // Garantizar que ninguna ruta no encontrada o error bajo /api/* devuelva HTML (vite fallback o finalhandler)
  app.use('/api', (req, res) => {
    res.status(404).json({
      exito: false,
      error: `Ruta API no encontrada: ${req.method} ${req.originalUrl}`,
    });
  });

  app.use(
    '/api',
    (
      err: any,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      const status =
        typeof err?.status === 'number'
          ? err.status
          : typeof err?.statusCode === 'number'
            ? err.statusCode
            : err?.type === 'entity.too.large'
              ? 413
              : err?.type === 'entity.parse.failed'
                ? 400
                : 500;
      const mensaje =
        status === 413
          ? 'El envío supera el tamaño máximo permitido por solicitud. Divide el archivo o usa una versión más liviana.'
          : status === 400 && err?.type === 'entity.parse.failed'
            ? 'El cuerpo JSON de la solicitud es inválido.'
            : err?.message || 'Error interno procesando solicitud API';
      if (!res.headersSent) {
        res.status(status).json({ exito: false, error: mensaje });
      }
    }
  );

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        ws: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
    app.get('/{*splat}', (req, res) => {
      if (req.path.startsWith('/api/')) {
        return res.status(404).json({ exito: false, error: 'Ruta API no encontrada' });
      }
      res.sendFile('dist/index.html', { root: '.' });
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[AI Studio] Servidor rápido de Pliegos Reales activo en http://0.0.0.0:${PORT}`);
  });
}

startServer();
