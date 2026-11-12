import express from 'express';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import { 
  ARTICULOS_PLIEGOS, 
  LISTA_PLIEGOS_CARGADOS, 
  buscarYExtraerArticulosPliego 
} from './src/data/pliegosContractuales';

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json({ limit: '10mb' }));

// Inicialización de cliente Gemini con header aistudio-build
let ai: GoogleGenAI | null = null;
if (process.env.GEMINI_API_KEY) {
  try {
    ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  } catch (err) {
    console.warn('[Gemini SDK] Inicialización con error:', err);
  }
}

// Generación de contexto de pliegos para el modelo
function generarContextoPliegosCompleto(): string {
  const articulosTexto = ARTICULOS_PLIEGOS.map(a => 
    `[PLIEGO: ${a.pliegoCodigo} - ${a.pliegoNombre} | ${a.articulo}: ${a.titulo}]\n` +
    `Sección: ${a.seccion}\n` +
    `Exigencia: ${a.contenido}\n` +
    `Parámetros: ${JSON.stringify(a.parametrosClave)}\n` +
    `Tolerancias: ${a.tolerancias || 'Conforme a norma'}\n` +
    `Normativa: ${a.normativaReferencia}\n` +
    `Planos: ${a.planosRelacionados.join(', ')}`
  ).join('\n\n--------------------\n\n');

  return (
    `ERES EL AUDITOR SENIOR DE INGENIERÍA Y CONTROL DOCUMENTAL DE OBRAS 132 KV (Tucumán, Argentina).\n` +
    `TIENES ACCESO DIRECTO Y TOTAL A TODOS LOS PLIEGOS CONTRACTUALES DE LA OBRA (Línea 132 kV El Bracho - Villa Quinteros y ETs Leales, Villa Quinteros y El Bracho, Comitente / TRANSNOA S.A.).\n\n` +
    `EL USUARIO NO NECESITA CARGAR NINGÚN PLIEGO NI ARCHIVO. TU TAREA ES LEER DIRECTAMENTE ESTE CORPUS OFICIAL Y EXTRAER EXACTAMENTE LO QUE EL USUARIO SOLICITA (artículos, parámetros numéricos, tolerancias de montaje, resistencias de hormigón, gálibos de cruce, especificaciones de transformadores, penalidades por mora, circuitos de aprobación SLA de 15 días, sellos APC, etc.).\n\n` +
    `ESTRUCTURA SIEMPRE LA EXTRACCIÓN CON:\n` +
    `1. 📋 **Pliego & Artículo Identificado**: Código formal del pliego, número de artículo y título.\n` +
    `2. 🎯 **Exigencia y Parámetros Extraídos**: Valores numéricos exactos (ej: 300/50 mm², H-25 con f'c ≥ 250 kg/cm², R_pat ≤ 10 Ω, gálibo ≥ 10.0 m, 0.1% diario por mora).\n` +
    `3. 📐 **Tolerancias de Montaje y Ensayos**: Ensayos de laboratorio (probetas 7/14/28 días, cono 8-12 cm, rigidez aceite ≥ 60 kV), tolerancias topográficas (± 3 mm stubs, 1:1000 plomada).\n` +
    `4. 🔗 **Planos y Normativa Asociada**: Referencias directas a planos del proyecto y normas CIRSOC, IRAM, IEC, IEEE o NAG-100.\n\n` +
    `CORPUS OFICIAL DE PLIEGOS CARGADOS:\n\n${articulosTexto}`
  );
}

// 1. Endpoint para consultar lista de pliegos cargados
app.get('/api/pliegos', (_req, res) => {
  res.json({
    exito: true,
    pliegos: LISTA_PLIEGOS_CARGADOS,
    totalArticulos: ARTICULOS_PLIEGOS.length,
    mensaje: 'Todos los pliegos técnicos y bases contractuales están precargados en memoria y listos para extracción directa.'
  });
});

// 2. Endpoint de extracción puntual de artículos de pliego
app.post('/api/pliegos/extraer', async (req, res) => {
  try {
    const { consulta } = req.body;
    if (!consulta || typeof consulta !== 'string') {
      res.status(400).json({ exito: false, error: 'Consulta requerida' });
      return;
    }

    const extraccionLocal = buscarYExtraerArticulosPliego(consulta);

    // Si Gemini está disponible y configurado, generar síntesis de ingeniería avanzada
    if (ai && process.env.GEMINI_API_KEY) {
      try {
        const prompt = `El usuario solicita extraer la siguiente información de los pliegos de la obra 132 kV:\n"${consulta}"\n\n` +
          `Lee los pliegos precargados y extrae con máxima fidelidad técnica los artículos pertinentes, tolerancias, valores exactos y planos asociados.`;

        const response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: prompt,
          config: {
            systemInstruction: generarContextoPliegosCompleto(),
          }
        });

        const texto = response.text;
        if (texto && texto.trim().length > 0) {
          res.json({
            exito: true,
            fuente: 'gemini-3.8-flash',
            respuesta: texto,
            articulos: extraccionLocal.articulosCoincidentes
          });
          return;
        }
      } catch (geminiError: any) {
        console.warn('[Gemini API] Fallo al consultar modelo, usando motor de extracción directa:', geminiError?.message || geminiError);
      }
    }

    // Fallback: Motor de extracción semántica directa de los pliegos
    res.json({
      exito: true,
      fuente: 'pliegos-directos',
      respuesta: extraccionLocal.resumenExtraccion,
      articulos: extraccionLocal.articulosCoincidentes
    });
  } catch (err: any) {
    res.status(500).json({ exito: false, error: err?.message || 'Error en extracción' });
  }
});

// 3. Endpoint principal del Chat de Asistente de Ingeniería
app.post('/api/chat', async (req, res) => {
  try {
    const { mensaje, historial } = req.body;
    if (!mensaje || typeof mensaje !== 'string') {
      res.status(400).json({ exito: false, error: 'Mensaje requerido' });
      return;
    }

    // Si la consulta solicita pliegos o extracción técnica
    const q = mensaje.toLowerCase();
    const esExtraccionPliego = 
      q.includes('extra') || 
      q.includes('pliego') || 
      q.includes('artícul') || 
      q.includes('especifica') || 
      q.includes('hormig') || 
      q.includes('transformador') || 
      q.includes('malla') || 
      q.includes('pat') || 
      q.includes('cruce') || 
      q.includes('tgn') || 
      q.includes('ruta 38') || 
      q.includes('conductor') || 
      q.includes('opgw') || 
      q.includes('penalid') || 
      q.includes('multa') || 
      q.includes('sla') || 
      q.includes('apc') || 
      q.includes('tolerancia');

    // Intentar Gemini si está activo
    if (ai && process.env.GEMINI_API_KEY) {
      try {
        const promptChat = `${historial ? `Historial previo:\n${historial}\n\n` : ''}Consulta del usuario:\n${mensaje}`;
        const response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: promptChat,
          config: {
            systemInstruction: generarContextoPliegosCompleto(),
          }
        });

        const respuestaTexto = response.text;
        if (respuestaTexto && respuestaTexto.trim().length > 0) {
          res.json({
            exito: true,
            fuente: 'gemini-3.8-flash',
            respuesta: respuestaTexto
          });
          return;
        }
      } catch (geminiError: any) {
        console.warn('[Gemini Chat] Error en invocación remota, usando motor local:', geminiError?.message || geminiError);
      }
    }

    // Fallback con motor de extracción de pliegos y datos de obra
    if (esExtraccionPliego) {
      const extraccion = buscarYExtraerArticulosPliego(mensaje);
      res.json({
        exito: true,
        fuente: 'pliegos-directos',
        respuesta: extraccion.resumenExtraccion
      });
      return;
    }

    // Respuestas analíticas de obra estándar
    if (q.includes('plano') || q.includes('cuántos') || q.includes('emitido') || q.includes('avance')) {
      res.json({
        exito: true,
        fuente: 'motor-ingenieria',
        respuesta: `📊 **Estado Documental al Día (Base 910 Planos Contractuales):**\n- **Planos Emitidos:** 48 de 910 contractuales (5.3% de avance global).\n- **Aprobados Sello APC:** 12 planos con aptitud para construcción.\n- **Distribución por Frentes:**\n  • LAT El Bracho - Villa Quinteros: 173 planificados (12 emitidos).\n  • ET Leales: 529 planificados (20 emitidos).\n  • ET Villa Quinteros: 282 planificados (11 emitidos).\n  • ET El Bracho: 99 planificados (5 emitidos).\n\n*Nota:* Todos los pliegos técnicos y bases de licitación están cargados en el sistema para consulta o extracción de artículos sin necesidad de adjuntar archivos.`
      });
      return;
    }

    if (q.includes('hito') || q.includes('crítica') || q.includes('venc')) {
      res.json({
        exito: true,
        fuente: 'motor-ingenieria',
        respuesta: `⏳ **Auditoría de Ruta Crítica e Hitos Contractuales:**\n- Hito inmediato en riesgo: **ANT.2-2 (15/06/2026)** - Entrega de Estudios Eléctricos Etapa II y Planialtimetría con caminos de acceso.\n- **Exigencia del Pliego (PBCP Art. 35):** Multa de 0.1% (1‰) diario del contrato por cada día de mora en hitos de la ruta crítica.\n- Se recomienda emitir Notas de Pedido (NP) de pronto despacho para deslindar penalidades ante la Inspección de TRANSNOA.`
      });
      return;
    }

    // Respuesta general de asistencia con pliegos
    const extraccionGeneral = buscarYExtraerArticulosPliego(mensaje);
    res.json({
      exito: true,
      fuente: 'pliegos-directos',
      respuesta: `⚡ **Asistente de Pliegos e Ingeniería 132 kV:**\n\nHe analizado tu consulta: "${mensaje}".\n\n${extraccionGeneral.resumenExtraccion}`
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
    console.log(`[AI Studio] Servidor de Ingeniería y Pliegos 132 kV activo en http://0.0.0.0:${PORT}`);
  });
}

startServer();
