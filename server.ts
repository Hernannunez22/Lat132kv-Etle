import express from 'express';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { PliegoReal, MinutaReunion, CompromisoMinuta, NotaPedidoIngenieria, EstadoCompromiso } from './src/types';
import { buscarYExtraerDePliegosReales } from './src/data/pliegosContractuales';
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
  eliminarChatAdjuntoDisco,
  limpiarChatAdjuntosDisco,
  indexarChatAdjuntoBuffer,
  indexarChatAdjuntoDesdeArchivo,
  auditarAdjuntoVsPliegoLocal,
} from './server/chatAdjuntos';

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const GEMINI_MODEL = 'gemini-3.8-flash';

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

// Inicialización de cliente Gemini con header aistudio-build
let ultimoErrorGemini: string | null = null;

function limpiarValorApiKey(raw?: string): string {
  if (!raw) return '';
  let k = raw.trim();
  if (/^(GEMINI_API_KEY|API_KEY)\s*=/i.test(k)) {
    k = k.replace(/^(GEMINI_API_KEY|API_KEY)\s*=/i, '').trim();
  }
  k = k.replace(/^['"]+|['"]+$/g, '').trim();
  if (!k || /MY_GEMINI_API_KEY/i.test(k) || /^(YOUR_API_KEY|TU_CLAVE_AQUI|PLACEHOLDER)$/i.test(k)) {
    return '';
  }
  return k;
}

function inicializarGemini(): { client: GoogleGenAI | null; keySource: string | null } {
  const claveApi = limpiarValorApiKey(process.env.API_KEY);
  const claveGemini = limpiarValorApiKey(process.env.GEMINI_API_KEY);
  const clavePrincipal = claveApi || claveGemini;

  if (clavePrincipal) {
    const fuente = claveApi ? 'API_KEY' : 'GEMINI_API_KEY';
    try {
      return {
        client: new GoogleGenAI({
          apiKey: clavePrincipal,
          httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
        }),
        keySource: fuente,
      };
    } catch (err: any) {
      ultimoErrorGemini = err?.message || String(err);
      console.warn('[Gemini SDK] Inicialización con error:', err);
    }
  }

  // Respaldo secundario si se guardó en otra variable estándar o con prefijo AIza
  for (const [nombre, raw] of [
    ['GOOGLE_API_KEY', process.env.GOOGLE_API_KEY],
    ['VITE_GEMINI_API_KEY', process.env.VITE_GEMINI_API_KEY],
    ...Object.entries(process.env),
  ] as Array<[string, string | undefined]>) {
    const cleaned = limpiarValorApiKey(raw);
    if (cleaned.startsWith('AIza') && cleaned.length >= 30) {
      try {
        return {
          client: new GoogleGenAI({
            apiKey: cleaned,
            httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
          }),
          keySource: nombre,
        };
      } catch (err: any) {
        ultimoErrorGemini = err?.message || String(err);
      }
    }
  }

  return { client: null, keySource: null };
}

const initGemini = inicializarGemini();
let ai: GoogleGenAI | null = initGemini.client;
let geminiKeySource: string | null = initGemini.keySource;

function obtenerClienteGeminiActivo(): GoogleGenAI | null {
  if (!ai) {
    const recarga = inicializarGemini();
    if (recarga.client) {
      ai = recarga.client;
      geminiKeySource = recarga.keySource;
    }
  }
  return ai;
}

function formatearAvisoErrorGemini(err: any): string {
  const raw = String(err?.message || err || 'Error desconocido');
  const status = err?.status || err?.code || '';
  const msg = raw.replace(/AIza[0-9A-Za-z_-]{20,}/g, '[KEY]');
  ultimoErrorGemini = `${status ? `[${status}] ` : ''}${msg}`;

  if (/API_KEY_INVALID|API key not valid|PERMISSION_DENIED|403|401/i.test(msg) || status === 403 || status === 401) {
    return `> ⚠️ **Error de autenticación con Gemini (${status || '403'}):** La clave configurada en \`GEMINI_API_KEY\` fue rechazada por Google (\`API_KEY_INVALID\`). Verifica en **Settings > Secrets** que sea una clave válida de Google AI Studio (comienza con \`AIza...\`, sin espacios ni texto extra) y luego recarga la vista previa.\n\n`;
  }
  if (/RESOURCE_EXHAUSTED|429|quota/i.test(msg) || status === 429) {
    return `> ⚠️ **Límite de cuota / RPM alcanzado en Gemini (429):** \`${msg.slice(0, 180)}\`.\n\n`;
  }
  if (/NOT_FOUND|404/i.test(msg) || status === 404) {
    return `> ⚠️ **Modelo no disponible (404) para \`${GEMINI_MODEL}\`:** \`${msg.slice(0, 180)}\`.\n\n`;
  }
  return `> ⚠️ **Gemini no pudo responder esta consulta:** \`${msg.slice(0, 220)}\`\n\n`;
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
if (pliegosIndexados.length > 0) {
  console.log(`[Pliegos] ${pliegosIndexados.length} pliego(s) restaurado(s) desde caché.`);
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
      const id = String(req.headers['x-pliego-id'] || `pliego_${Date.now()}`);
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
      console.error('[Pliegos] Error en /api/pliegos/subir:', err);
      res.status(500).json({ exito: false, error: err?.message || 'Error procesando archivo' });
    }
  }
);

// Endpoint para recibir fragmentos binarios (chunks de ~4 MB) para pliegos pesados (250 MB+)
app.post(
  '/api/pliegos/subir/chunk',
  express.raw({ type: '*/*', limit: '20mb' }),
  (req, res) => {
    try {
      const id = String(req.headers['x-pliego-id'] || '');
      const offset = Number(req.headers['x-chunk-offset'] || 0);
      if (!id || Number.isNaN(offset) || offset < 0) {
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
      console.error('[Pliegos] Error en /api/pliegos/subir/chunk:', err);
      res.status(500).json({ exito: false, error: err?.message || 'Error escribiendo fragmento' });
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

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Inicializar sesión de subida fragmentada para archivos pesados (pliegos o planos CAD PDF)
app.post('/api/pliegos/subir/init', (req, res) => {
  try {
    const { id, nombre, tipoMime, totalBytes, fechaSubida, destino } = req.body || {};
    if (!id || !nombre) {
      res.status(400).json({ exito: false, error: 'Datos de inicialización incompletos' });
      return;
    }

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
    res.status(500).json({ exito: false, error: err?.message || 'Error inicializando subida' });
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

app.delete('/api/chat/adjuntos/:id', (req, res) => {
  const { id } = req.params;
  chatAdjuntos = chatAdjuntos.filter(a => a.id !== id);
  eliminarChatAdjuntoDisco(id);
  res.json({ exito: true, totalRestantes: chatAdjuntos.length });
});

app.post('/api/chat/adjuntos/limpiar', (_req, res) => {
  chatAdjuntos = [];
  limpiarChatAdjuntosDisco();
  res.json({ exito: true });
});

// Endpoints del Comparador de Planos PDF
app.get('/api/comparador/planos', (_req, res) => {
  res.json({
    exito: true,
    planoA: toPlanoComparadorCliente(planosComparador.A),
    planoB: toPlanoComparadorCliente(planosComparador.B),
    tieneGeminiKey: Boolean(ai),
    modelo: GEMINI_MODEL,
    ultimoErrorGemini,
  });
});

function sanitizarTextoError(raw: unknown): string {
  return String(raw || 'Error desconocido').replace(/AIza[0-9A-Za-z_-]{16,}/g, '[KEY]');
}

function inspeccionarVariableClave(nombre: string, raw?: string) {
  const trimmed = (raw || '')
    .trim()
    .replace(/^(GEMINI_API_KEY|API_KEY)\s*=/i, '')
    .replace(/^['"]+|['"]+$/g, '')
    .trim();
  const definida = trimmed.length > 0;
  const esPlantilla = /MY_GEMINI_API_KEY/i.test(trimmed) || /^(YOUR_API_KEY|TU_CLAVE_AQUI|PLACEHOLDER)$/i.test(trimmed);
  let vistaSegura = '(no definida)';
  if (definida) {
    if (esPlantilla) {
      vistaSegura = `${trimmed} (ignorada por ser plantilla)`;
    } else if (trimmed.length >= 12) {
      vistaSegura = `${trimmed.slice(0, 4)}...${trimmed.slice(-4)} (${trimmed.length} chars)`;
    } else {
      vistaSegura = `*** (${trimmed.length} chars)`;
    }
  }
  return {
    nombre,
    definida,
    validaParaUso: definida && !esPlantilla,
    longitud: trimmed.length,
    esPlantilla,
    vistaSegura,
    valorLimpio: esPlantilla ? '' : trimmed,
  };
}

function obtenerEstadoProceso() {
  return {
    pid: process.pid,
    nodeVersion: process.version,
    platform: process.platform,
    uptimeSegundos: Math.round(process.uptime()),
    nodeEnv: process.env.NODE_ENV || 'no definido',
    puerto: PORT,
    clienteSdkInicializado: Boolean(ai),
    fuenteClienteActivo: geminiKeySource,
    pliegosEnMemoria: pliegosIndexados.length,
    timestamp: new Date().toISOString(),
  };
}

async function ejecutarDiagnosticoGemini(_req: express.Request, res: express.Response) {
  const t0 = Date.now();
  const recarga = inicializarGemini();
  if (recarga.client) {
    ai = recarga.client;
    geminiKeySource = recarga.keySource;
  }

  const infoApiKey = inspeccionarVariableClave('API_KEY', process.env.API_KEY);
  const infoGeminiKey = inspeccionarVariableClave('GEMINI_API_KEY', process.env.GEMINI_API_KEY);
  const infoGoogleKey = inspeccionarVariableClave('GOOGLE_API_KEY', process.env.GOOGLE_API_KEY);
  const infoViteKey = inspeccionarVariableClave('VITE_GEMINI_API_KEY', process.env.VITE_GEMINI_API_KEY);

  const variablesEntorno = {
    API_KEY: {
      definida: infoApiKey.definida,
      longitud: infoApiKey.longitud,
      esPlantilla: infoApiKey.esPlantilla,
      vistaSegura: infoApiKey.vistaSegura,
    },
    GEMINI_API_KEY: {
      definida: infoGeminiKey.definida,
      longitud: infoGeminiKey.longitud,
      esPlantilla: infoGeminiKey.esPlantilla,
      vistaSegura: infoGeminiKey.vistaSegura,
    },
    GOOGLE_API_KEY: {
      definida: infoGoogleKey.definida,
      longitud: infoGoogleKey.longitud,
      esPlantilla: infoGoogleKey.esPlantilla,
      vistaSegura: infoGoogleKey.vistaSegura,
    },
    VITE_GEMINI_API_KEY: {
      definida: infoViteKey.definida,
      longitud: infoViteKey.longitud,
      esPlantilla: infoViteKey.esPlantilla,
      vistaSegura: infoViteKey.vistaSegura,
    },
  };

  // Orden exacto solicitado: process.env.API_KEY || process.env.GEMINI_API_KEY (ignorando MY_GEMINI_API_KEY)
  const candidatoPrincipal = infoApiKey.validaParaUso
    ? infoApiKey
    : infoGeminiKey.validaParaUso
      ? infoGeminiKey
      : infoGoogleKey.validaParaUso
        ? infoGoogleKey
        : null;

  const hayPlantillaIgnorada = infoApiKey.esPlantilla || infoGeminiKey.esPlantilla;

  const variableDetectada = candidatoPrincipal
    ? `${candidatoPrincipal.nombre} (${candidatoPrincipal.vistaSegura})`
    : infoGeminiKey.esPlantilla
      ? `GEMINI_API_KEY (${infoGeminiKey.vistaSegura})`
      : infoApiKey.esPlantilla
        ? `API_KEY (${infoApiKey.vistaSegura})`
        : 'Ninguna definida';

  const estadoProceso = obtenerEstadoProceso();

  if (!candidatoPrincipal) {
    res.json({
      ok: false,
      estado: hayPlantillaIgnorada ? 'PLANTILLA_NO_REEMPLAZADA' : 'CLAVE_AUSENTE',
      codigoHttp: null,
      modelo: GEMINI_MODEL,
      variableDetectada,
      latenciaMs: Date.now() - t0,
      estadoProceso,
      variablesEntorno,
      errorTecnico: {
        nombre: hayPlantillaIgnorada ? 'PlaceholderApiKeyIgnored' : 'MissingApiKeyError',
        codigoHttp: null,
        statusText: hayPlantillaIgnorada ? 'PLACEHOLDER_KEY_IGNORED' : 'ENV_VAR_MISSING',
        mensaje: hayPlantillaIgnorada
          ? 'Se ignoró el valor de plantilla MY_GEMINI_API_KEY y no existe otra clave válida en process.env.API_KEY ni process.env.GEMINI_API_KEY.'
          : 'No se encontró ninguna clave válida en process.env.API_KEY ni en process.env.GEMINI_API_KEY.',
        causa: null,
        pingEjecutado: false,
        stackResumen: null,
      },
      detalle: hayPlantillaIgnorada
        ? 'Se detectó e ignoró MY_GEMINI_API_KEY en el entorno del contenedor y tampoco hay clave en process.env.API_KEY. Guarda tu clave real en Settings > Secrets y recarga/republica el entorno.'
        : 'No se encontró ninguna clave en process.env.API_KEY ni en process.env.GEMINI_API_KEY. Configúrala en Settings > Secrets y recarga el entorno.',
    });
    return;
  }

  try {
    const pingClient = new GoogleGenAI({
      apiKey: candidatoPrincipal.valorLimpio,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
    });

    const respuesta = await pingClient.models.generateContent({
      model: GEMINI_MODEL,
      contents: 'Responde únicamente con la palabra: OK',
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    });

    const texto = (respuesta.text || '').trim();
    ultimoErrorGemini = null;

    res.json({
      ok: true,
      estado: 'CONECTADA',
      codigoHttp: 200,
      modelo: GEMINI_MODEL,
      variableDetectada,
      latenciaMs: Date.now() - t0,
      respuestaModelo: texto.slice(0, 60) || '(sin texto)',
      estadoProceso: obtenerEstadoProceso(),
      variablesEntorno,
      errorTecnico: null,
      detalle: `Ping exitoso y conexión verificada con ${GEMINI_MODEL} usando ${candidatoPrincipal.nombre}.`,
    });
  } catch (err: any) {
    const cleanMsg = sanitizarTextoError(err?.message || err);
    const status = err?.status || err?.code || null;
    const statusText = err?.statusText || null;
    const causa = err?.cause ? sanitizarTextoError(err.cause?.message || err.cause) : null;
    const stackResumen = typeof err?.stack === 'string'
      ? sanitizarTextoError(err.stack.split('\n').slice(0, 3).join(' | '))
      : null;

    ultimoErrorGemini = `${status ? `[${status}] ` : ''}${cleanMsg}`;

    let estado = 'ERROR_CONEXION';
    if (candidatoPrincipal.esPlantilla) {
      estado = 'PLANTILLA_NO_REEMPLAZADA';
    } else if (/API_KEY_INVALID|API key not valid/i.test(cleanMsg)) {
      estado = 'CLAVE_INVALIDA';
    } else if (/PERMISSION_DENIED|403|401/i.test(cleanMsg) || status === 403 || status === 401) {
      estado = 'PERMISO_DENEGADO';
    } else if (/RESOURCE_EXHAUSTED|429|quota/i.test(cleanMsg) || status === 429) {
      estado = 'CUOTA_EXCEDIDA';
    } else if (/NOT_FOUND|404/i.test(cleanMsg) || status === 404) {
      estado = 'MODELO_NO_ENCONTRADO';
    }

    res.json({
      ok: false,
      estado,
      codigoHttp: status,
      modelo: GEMINI_MODEL,
      variableDetectada,
      latenciaMs: Date.now() - t0,
      estadoProceso,
      variablesEntorno,
      errorTecnico: {
        nombre: err?.name || 'Error',
        codigoHttp: status,
        statusText,
        mensaje: cleanMsg.slice(0, 500),
        causa,
        pingEjecutado: true,
        stackResumen,
      },
      detalle: candidatoPrincipal.esPlantilla
        ? `Ping ejecutado con ${candidatoPrincipal.nombre}=${candidatoPrincipal.vistaSegura}, rechazado por la API (${cleanMsg.slice(0, 220)}). Verifica Settings > Secrets y recarga/republica el entorno.`
        : cleanMsg.slice(0, 400),
    });
  }
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
    const clienteAi = obtenerClienteGeminiActivo();
    if (clienteAi) {
      try {
        const stream = await clienteAi.models.generateContentStream({
          model: GEMINI_MODEL,
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
          ultimoErrorGemini = null;
          enviar({ done: true, fuente: 'gemini-3.8-flash-multimodal' });
          res.end();
          return;
        }
      } catch (geminiErr: any) {
        console.warn('[Comparador Gemini Error]:', geminiErr?.message || geminiErr);
        avisoErrorGemini = formatearAvisoErrorGemini(geminiErr);
      }
    } else {
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

// 2. Cargar un pliego por texto pegado o JSON (compatibilidad)
app.post('/api/pliegos/cargar', async (req, res) => {
  try {
    const pliego: PliegoReal = req.body;
    if (!pliego || !pliego.nombre) {
      res.status(400).json({ exito: false, error: 'Datos de pliego inválidos' });
      return;
    }

    let indexado: PliegoIndexado;
    if (pliego.dataBase64) {
      const buffer = Buffer.from(pliego.dataBase64, 'base64');
      indexado = await procesarArchivoPliego({
        id: pliego.id,
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
        id: pliego.id,
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
    res.status(500).json({ exito: false, error: err?.message || 'Error al guardar pliego' });
  }
});

// 3. Eliminar un pliego real
app.delete('/api/pliegos/:id', (req, res) => {
  const { id } = req.params;
  pliegosIndexados = pliegosIndexados.filter(p => p.id !== id);
  eliminarPliegoDeDisco(id);
  res.json({ exito: true, totalRestantes: pliegosIndexados.length });
});

// 4. Limpiar todos los pliegos reales
app.post('/api/pliegos/limpiar', (_req, res) => {
  pliegosIndexados = [];
  limpiarPliegosDeDisco();
  res.json({ exito: true, mensaje: 'Pliegos limpiados en el servidor' });
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

/**
 * Helper compartido para armar las partes de consulta completa (Pliegos + Planos PDF + Datos vivos de Obra) hacia Gemini.
 */
async function prepararContenidoConsulta(
  mensaje: string,
  historial?: string,
  contextoObra?: any
) {
  obtenerClienteGeminiActivo();
  const recuperado = recuperarFragmentosRelevantes(mensaje, pliegosIndexados, 110000);
  const escaneados = pliegosIndexados.filter(p => p.esEscaneado);

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

  // Si hay documentos PDF adjuntados en el Chat IA (Órdenes de Servicio TRANSNOA, devoluciones, notas), incluirlos íntegros
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
        `${adj.contenidoTexto ? adj.contenidoTexto.slice(0, 45000) : '[Archivo PDF escaneado adjunto visualmente]'}`
      );
    }
    parts.push({
      text: `DOCUMENTOS PDF ADJUNTADOS POR EL USUARIO EN EL CHAT (ÓRDENES DE SERVICIO / DEVOLUCIONES / NOTAS A AUDITAR CONTRA PLIEGO):\n${infoAdjuntos.join('\n\n')}`,
    });
  }

  // Si hay planos PDF cargados en el comparador, incluirlos también en el chat integral
  if (planosComparador.A || planosComparador.B) {
    const infoPlanos: string[] = [];
    if (planosComparador.A) {
      infoPlanos.push(
        `[PLANO A EN COMPARADOR: ${planosComparador.A.nombre} (${planosComparador.A.paginas} págs)]\n` +
        `Métricas: ${planosComparador.A.metricasDetectadas.join(', ')}\n` +
        `${planosComparador.A.contenidoTexto.slice(0, 18000)}`
      );
    }
    if (planosComparador.B) {
      infoPlanos.push(
        `[PLANO B EN COMPARADOR: ${planosComparador.B.nombre} (${planosComparador.B.paginas} págs)]\n` +
        `Métricas: ${planosComparador.B.metricasDetectadas.join(', ')}\n` +
        `${planosComparador.B.contenidoTexto.slice(0, 18000)}`
      );
    }
    parts.push({
      text: `PLANOS PDF CARGADOS EN COMPARADOR:\n${infoPlanos.join('\n\n')}`,
    });
  }

  if (contextoObra) {
    parts.push({
      text: `DATOS VIVOS DE LA OBRA (CATÁLOGO DE PLANOS, HITOS CONTRACTUALES, INTERFERENCIAS, MINUTAS Y COMPROMISOS):\n${JSON.stringify(contextoObra)}`,
    });
  }

  if (storeMinutas.minutas.length > 0 || storeMinutas.compromisos.length > 0) {
    const resumenMinutas = storeMinutas.minutas.slice(0, 12).map(m =>
      `[MINUTA ${m.codigo} | ${m.fechaReunion} | ${m.frente}]: ${m.titulo}\nResumen: ${m.resumen || ''}\nExtracto:\n${m.contenidoTexto.slice(0, 4500)}`
    ).join('\n\n');
    const resumenComp = storeMinutas.compromisos.slice(0, 50).map(c =>
      `- [${c.estado}] (${c.minutaCodigo} ${c.minutaFecha}) ${c.numeroItem}: ${c.descripcion} | Resp: ${c.responsable} | Vence: ${c.fechaLimite} | NP: ${(c.notasPedidoIds || []).join(', ') || 'Sin NP'}`
    ).join('\n');
    parts.push({
      text: `MINUTAS DE REUNIÓN Y COMPROMISOS REGISTRADOS:\n${resumenMinutas}\n\nCOMPROMISOS:\n${resumenComp}`,
    });
  }

  if (recuperado.contextoTexto) {
    parts.push({
      text: `CONTEXTO DE PLIEGOS REALES INDEXADOS:\n${recuperado.contextoTexto}`,
    });
  }

  parts.push({
    text:
      `${historial ? `Historial reciente de conversación:\n${historial}\n\n` : ''}` +
      `SOLICITUD DEL USUARIO:\n${mensaje}\n\n` +
      `Instrucción: Si existen Documentos PDF Adjuntos en el Chat (ej. Orden de Servicio de TRANSNOA / devolución de documentación) y/o el usuario solicita comparar contra el pliego, genera obligatoriamente un **cuadro comparativo de discrepancias y cumplimiento en tabla Markdown** citando cada observación/cláusula del PDF adjunto, el texto/exigencia exacta del Pliego (tomo, artículo y página) y el dictamen técnico-contractual (Discrepancia / Cumple / Excede el Pliego / Sin respaldo en pliego).`,
  });

  return { parts, recuperado };
}

function construirFallbackInteligente(
  mensaje: string,
  recuperado: ReturnType<typeof recuperarFragmentosRelevantes>,
  contextoObra?: any
): string {
  if (chatAdjuntos.length > 0) {
    return auditarAdjuntoVsPliegoLocal(chatAdjuntos, pliegosIndexados, mensaje);
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

  const local = buscarYExtraerDePliegosReales(mensaje, pliegosIndexados);
  return local.resumen;
}

const SYSTEM_INSTRUCTION_OBRA_COMPLETA =
  'Eres el Asistente Integral de Ingeniería Eléctrica 132 kV, Control Documental y Auditoría Contractual. ' +
  'Tienes acceso completo a los PLIEGOS REALES indexados, los DOCUMENTOS PDF ADJUNTADOS EN EL CHAT (como Órdenes de Servicio de TRANSNOA o devoluciones de archivos), los PLANOS PDF cargados en el comparador, Minutas/Compromisos, el Catálogo de Planos emitido, Hitos Contractuales e Interferencias. ' +
  'Reglas de respuesta:\n' +
  '1. Cuando existan PDF adjuntos en el Chat y/o el usuario pida discrepancias, cruces o comparaciones, responde SIEMPRE con **tablas Markdown** claras y ordenadas (| Columna 1 | Columna 2 | ... |).\n' +
  '2. Cita siempre documento, número de página, cláusula o artículo exacto con sus tolerancias y unidades.\n' +
  '3. No inventes datos ni valores ausentes; si algo no figura en los documentos provistos, indícalo explícitamente.';

// 5. Endpoint STREAMING (SSE) para respuesta instantánea palabra por palabra
app.post('/api/chat/stream', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const enviarEvento = (payload: Record<string, any>) => {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  try {
    const { mensaje, historial, pliegoIds, contextoObra } = req.body || {};
    if (!mensaje || typeof mensaje !== 'string') {
      enviarEvento({ error: 'Mensaje requerido', done: true });
      res.end();
      return;
    }

    const tienePlanosPdf = Boolean(planosComparador.A || planosComparador.B);
    const tieneAdjuntosChat = chatAdjuntos.length > 0;

    if (pliegosIndexados.length === 0 && Array.isArray(pliegoIds) && pliegoIds.length > 0) {
      enviarEvento({ needsSync: true, done: true });
      res.end();
      return;
    }

    if (pliegosIndexados.length === 0 && !tienePlanosPdf && !tieneAdjuntosChat && !contextoObra) {
      enviarEvento({
        chunk:
          '⚠️ **Aún no hay documentos cargados.**\n\nAdjunta un PDF directamente aquí abajo en el Chat o carga tus pliegos en **"Cargar Pliego Real"**.',
        done: true,
      });
      res.end();
      return;
    }

    const { parts, recuperado } = await prepararContenidoConsulta(mensaje, historial, contextoObra);

    let avisoErrorGemini = '';
    const clienteAi = obtenerClienteGeminiActivo();
    if (clienteAi) {
      try {
        const stream = await clienteAi.models.generateContentStream({
          model: GEMINI_MODEL,
          contents: { parts },
          config: {
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            systemInstruction: SYSTEM_INSTRUCTION_OBRA_COMPLETA,
          },
        });

        let huboTexto = false;
        for await (const chunk of stream) {
          const txt = chunk.text;
          if (txt) {
            huboTexto = true;
            enviarEvento({ chunk: txt });
          }
        }

        if (huboTexto) {
          ultimoErrorGemini = null;
          enviarEvento({ done: true, fuente: 'gemini-3.8-flash-stream' });
          res.end();
          return;
        }
      } catch (geminiError: any) {
        console.warn('[Gemini Stream] Error llamando a Gemini:', geminiError?.message || geminiError);
        avisoErrorGemini = formatearAvisoErrorGemini(geminiError);
      }
    } else {
      avisoErrorGemini = obtenerAvisoSinClienteGemini();
    }

    const respuestaLocal = construirFallbackInteligente(mensaje, recuperado, contextoObra);
    enviarEvento({ chunk: `${avisoErrorGemini}${respuestaLocal}`, done: true, fuente: 'indice-local-rapido' });
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

    const { parts, recuperado } = await prepararContenidoConsulta(consulta);

    let avisoErrorGemini = '';
    const clienteAi = obtenerClienteGeminiActivo();
    if (clienteAi) {
      try {
        const response = await clienteAi.models.generateContent({
          model: GEMINI_MODEL,
          contents: { parts },
          config: {
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            systemInstruction: SYSTEM_INSTRUCTION_OBRA_COMPLETA,
          },
        });

        if (response.text && response.text.trim()) {
          ultimoErrorGemini = null;
          res.json({
            exito: true,
            fuente: 'gemini-3.8-flash',
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
      respuesta: `${avisoErrorGemini}${construirFallbackInteligente(consulta, recuperado)}`,
    });
  } catch (err: any) {
    res.status(500).json({ exito: false, error: err?.message || 'Error en extracción' });
  }
});

// 7. Endpoint no-streaming /api/chat (compatibilidad)
app.post('/api/chat', async (req, res) => {
  try {
    const { mensaje, historial, pliegoIds, contextoObra } = req.body || {};
    if (!mensaje || typeof mensaje !== 'string') {
      res.status(400).json({ exito: false, error: 'Mensaje requerido' });
      return;
    }

    if (pliegosIndexados.length === 0 && Array.isArray(pliegoIds) && pliegoIds.length > 0) {
      res.json({ exito: false, needsSync: true });
      return;
    }

    const { parts, recuperado } = await prepararContenidoConsulta(mensaje, historial, contextoObra);

    let avisoErrorGemini = '';
    const clienteAi = obtenerClienteGeminiActivo();
    if (clienteAi) {
      try {
        const response = await clienteAi.models.generateContent({
          model: GEMINI_MODEL,
          contents: { parts },
          config: {
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            systemInstruction: SYSTEM_INSTRUCTION_OBRA_COMPLETA,
          },
        });

        if (response.text && response.text.trim()) {
          ultimoErrorGemini = null;
          res.json({
            exito: true,
            fuente: 'gemini-3.8-flash',
            respuesta: response.text,
          });
          return;
        }
      } catch (err: any) {
        console.warn('[Gemini Chat] Fallback local:', err?.message || err);
        avisoErrorGemini = formatearAvisoErrorGemini(err);
      }
    } else {
      avisoErrorGemini = obtenerAvisoSinClienteGemini();
    }

    res.json({
      exito: true,
      fuente: 'indice-local-rapido',
      respuesta: `${avisoErrorGemini}${construirFallbackInteligente(mensaje, recuperado, contextoObra)}`,
    });
  } catch (err: any) {
    res.status(500).json({ exito: false, error: err?.message || 'Error en procesamiento' });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
    app.get('*', (_req, res) => {
      res.sendFile('dist/index.html', { root: '.' });
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[AI Studio] Servidor rápido de Pliegos Reales activo en http://0.0.0.0:${PORT}`);
  });
}

startServer();
