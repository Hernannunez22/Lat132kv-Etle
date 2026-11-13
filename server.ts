import express from 'express';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { PliegoReal } from './src/types';
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

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const GEMINI_MODEL = 'gemini-3.8-flash';

type DestinoSubida = 'pliego' | 'planoA' | 'planoB';

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
  error?: string;
}

const jobsSubida = new Map<string, JobSubida>();

// Inicialización de cliente Gemini con header aistudio-build
let ultimoErrorGemini: string | null = null;

function limpiarValorApiKey(raw?: string): string {
  if (!raw) return '';
  let k = raw.trim();
  if (/^GEMINI_API_KEY\s*=/i.test(k)) {
    k = k.replace(/^GEMINI_API_KEY\s*=/i, '').trim();
  }
  k = k.replace(/^['"]+|['"]+$/g, '').trim();
  if (/^(MY_GEMINI_API_KEY|YOUR_API_KEY|TU_CLAVE_AQUI|PLACEHOLDER)$/i.test(k)) {
    return '';
  }
  return k;
}

function inicializarGemini(): { client: GoogleGenAI | null; keySource: string | null } {
  const candidatos = [
    ['GEMINI_API_KEY', process.env.GEMINI_API_KEY],
    ['API_KEY', process.env.API_KEY],
    ['GOOGLE_API_KEY', process.env.GOOGLE_API_KEY],
    ['VITE_GEMINI_API_KEY', process.env.VITE_GEMINI_API_KEY],
  ] as const;

  for (const [nombre, raw] of candidatos) {
    const cleaned = limpiarValorApiKey(raw);
    if (cleaned) {
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
        console.warn('[Gemini SDK] Inicialización con error:', err);
      }
    }
  }

  // Respaldo: buscar si el usuario guardó la clave AIza bajo otro nombre en Secrets
  for (const [nombre, raw] of Object.entries(process.env)) {
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
  const raw = (process.env.GEMINI_API_KEY || '').trim();
  if (/^MY_GEMINI_API_KEY$/i.test(raw)) {
    return `> ⚠️ **El servidor aún está recibiendo la clave de plantilla (\`MY_GEMINI_API_KEY\`) en este contenedor.** Si ya guardaste tu clave real en **Settings > Secrets** como \`GEMINI_API_KEY\`, guarda/recarga el entorno (o vuelve a publicar si usas la URL compartida) para que el servidor inyecte el nuevo secreto.\n\n`;
  }
  return `> ⚠️ **Clave \`GEMINI_API_KEY\` no detectada en el proceso del servidor.** Configúrala en **Settings > Secrets** y recarga el entorno para habilitar el análisis profundo con **Gemini**.\n\n`;
}

// Almacenamiento en memoria + disco de los pliegos REALES y planos comparador
let pliegosIndexados: PliegoIndexado[] = cargarPliegosDesdeDisco();
let planosComparador = cargarPlanosComparador();
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

// Endpoint rápido para subir archivo binario chico (< 3.5 MB) en un solo paso
app.post(
  '/api/pliegos/subir',
  express.raw({ type: '*/*', limit: '20mb' }),
  async (req, res) => {
    try {
      const id = String(req.headers['x-pliego-id'] || `pliego_${Date.now()}`);
      const destinoRaw = String(req.headers['x-upload-destino'] || 'pliego');
      const destino: DestinoSubida =
        destinoRaw === 'planoA' || destinoRaw === 'planoB' ? destinoRaw : 'pliego';
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
      destino === 'planoA' || destino === 'planoB' ? destino : 'pliego';

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
    error: job.error,
  });
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

// Diagnóstico de conexión real con Gemini API (solo lectura/prueba en servidor)
app.post('/api/gemini/diagnostico', async (_req, res) => {
  const t0 = Date.now();
  const recarga = inicializarGemini();
  if (recarga.client) {
    ai = recarga.client;
    geminiKeySource = recarga.keySource;
  }

  const rawEnv = (process.env.GEMINI_API_KEY || '').trim();
  const esPlantilla = /^MY_GEMINI_API_KEY$/i.test(rawEnv);

  if (!ai) {
    res.json({
      ok: false,
      estado: esPlantilla ? 'PLANTILLA_NO_REEMPLAZADA' : 'CLAVE_AUSENTE',
      modelo: GEMINI_MODEL,
      variableDetectada: esPlantilla ? 'GEMINI_API_KEY (MY_GEMINI_API_KEY)' : 'No definida',
      latenciaMs: Date.now() - t0,
      detalle: esPlantilla
        ? 'El contenedor sigue recibiendo el valor de plantilla MY_GEMINI_API_KEY en process.env.GEMINI_API_KEY. Configura la clave real en Settings > Secrets y recarga/vuelve a publicar el entorno.'
        : 'No se encontró ninguna clave válida de Gemini en las variables de entorno del servidor.',
    });
    return;
  }

  try {
    const respuesta = await ai.models.generateContent({
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
      modelo: GEMINI_MODEL,
      variableDetectada: geminiKeySource || 'GEMINI_API_KEY',
      latenciaMs: Date.now() - t0,
      respuestaModelo: texto.slice(0, 60) || '(sin texto)',
      detalle: `Conexión activa y verificada con ${GEMINI_MODEL}.`,
    });
  } catch (err: any) {
    const rawMsg = String(err?.message || err || 'Error desconocido');
    const cleanMsg = rawMsg.replace(/AIza[0-9A-Za-z_-]{20,}/g, '[KEY]');
    const status = err?.status || err?.code || null;
    ultimoErrorGemini = `${status ? `[${status}] ` : ''}${cleanMsg}`;

    let estado = 'ERROR_CONEXION';
    if (/API_KEY_INVALID|API key not valid/i.test(cleanMsg)) {
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
      variableDetectada: geminiKeySource || 'GEMINI_API_KEY',
      latenciaMs: Date.now() - t0,
      detalle: cleanMsg.slice(0, 400),
    });
  }
});

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
      text: `DATOS VIVOS DE LA OBRA (CATÁLOGO DE PLANOS, HITOS CONTRACTUALES E INTERFERENCIAS):\n${JSON.stringify(contextoObra)}`,
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
      `Instrucción: Si el usuario solicita comparar documentos, planos, hitos o valores, genera obligatoriamente un **cuadro comparativo en tabla Markdown** bien estructurado, citando documento/plano, página/artículo y discrepancias.`,
  });

  return { parts, recuperado };
}

function construirFallbackInteligente(
  mensaje: string,
  recuperado: ReturnType<typeof recuperarFragmentosRelevantes>,
  contextoObra?: any
): string {
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
  'Tienes acceso completo a los PLIEGOS REALES indexados, los PLANOS PDF cargados en el comparador, el Catálogo de Planos emitido, los Hitos Contractuales y las Interferencias de la obra. ' +
  'Reglas de respuesta:\n' +
  '1. Cuando el usuario pida comparaciones, cruces, matrices o discrepancias, responde SIEMPRE con **tablas Markdown** claras y ordenadas (| Columna 1 | Columna 2 | ... |).\n' +
  '2. Cita siempre documento, número de página y artículo exacto con sus tolerancias y unidades.\n' +
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

    if (pliegosIndexados.length === 0 && Array.isArray(pliegoIds) && pliegoIds.length > 0) {
      enviarEvento({ needsSync: true, done: true });
      res.end();
      return;
    }

    if (pliegosIndexados.length === 0 && !tienePlanosPdf && !contextoObra) {
      enviarEvento({
        chunk:
          '⚠️ **Aún no hay documentos cargados.**\n\nCarga tus pliegos en **"Cargar Pliego Real"** o sube planos PDF en la pestaña **"Comparar"**.',
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
