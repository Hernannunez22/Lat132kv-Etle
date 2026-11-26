import express from 'express';
import fs from 'fs';
import { ThinkingLevel } from '@google/genai';
import {
  eliminarPlanoComparadorDisco,
  prepararPartesComparacion,
  compararPlanosLocalFallback,
  getRutaPdfComparador,
} from '../planoComparator';
import {
  OPENROUTER_FREE_MODEL,
  clearUltimoErrorGemini,
  formatearAvisoErrorGemini,
  generarStreamConFallback,
  getLastWorkingGeminiInfo,
  getUltimoErrorGemini,
  isModelosPagosHabilitados,
} from '../geminiClient';
import { getUserPrecisionOpts } from '../utils/authRequest';
import {
  obraState,
  obtenerAvisoSinClienteGemini,
  obtenerClienteGeminiActivo,
  toPlanoComparadorCliente,
} from '../utils/runtimeState';

export function createComparadorRouter(): express.Router {
  const router = express.Router();

  router.get('/planos', (req, res) => {
    const userOpts = getUserPrecisionOpts(req);
    const info = getLastWorkingGeminiInfo(userOpts);
    res.json({
      exito: true,
      planoA: toPlanoComparadorCliente(obraState.planosComparador.A),
      planoB: toPlanoComparadorCliente(obraState.planosComparador.B),
      tieneGeminiKey: isModelosPagosHabilitados() && Boolean(obtenerClienteGeminiActivo()),
      modelo: info.modelo || OPENROUTER_FREE_MODEL,
      modelosDisponibles: info.modelosTextoDisponibles,
      modeloPreferido: info.modeloPreferido,
      ultimoErrorGemini: isModelosPagosHabilitados() ? getUltimoErrorGemini() : null,
    });
  });

  router.get('/pdf/:rol', (req, res) => {
    const rol = String(req.params.rol || '').toUpperCase();
    if (rol !== 'A' && rol !== 'B') {
      res.status(400).json({ exito: false, error: 'Rol de plano inválido. Debe ser A o B.' });
      return;
    }
    const rutaPdf = getRutaPdfComparador(rol);
    if (!rutaPdf || !fs.existsSync(rutaPdf)) {
      res.status(404).json({ exito: false, error: `No hay archivo PDF cargado para el Plano ${rol}.` });
      return;
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(rutaPdf, err => {
      if (err && !res.headersSent) {
        res.status(500).json({ exito: false, error: 'No se pudo entregar el PDF del plano.' });
      }
    });
  });

  router.delete('/planos/:rol', (req, res) => {
    const rol = req.params.rol === 'B' ? 'B' : 'A';
    obraState.planosComparador[rol] = null;
    eliminarPlanoComparadorDisco(rol);
    res.json({ exito: true });
  });

  router.post('/analizar/stream', async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const enviar = (payload: Record<string, any>) => {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    try {
      const { enfoque = 'Auditoría completa de discrepancias entre planos y pliego' } = req.body || {};
      const planoA = obraState.planosComparador.A;
      const planoB = obraState.planosComparador.B;

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
        pliegos: obraState.pliegosIndexados,
        enfoque,
        ai: obraState.ai,
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
        pliegos: obraState.pliegosIndexados,
        enfoque,
      });
      enviar({ chunk: `${avisoErrorGemini}${fallbackMd}`, done: true, fuente: 'comparador-local' });
      res.end();
    } catch (err: any) {
      enviar({ error: err?.message || 'Error ejecutando comparación', done: true });
      res.end();
    }
  });

  return router;
}
