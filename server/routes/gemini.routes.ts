import express from 'express';
import { ThinkingLevel } from '@google/genai';
import {
  OPENROUTER_FREE_MODEL,
  DEFAULT_TEXT_MODELS,
  obtenerCandidatosApiKeys,
  obtenerResumenVariablesEntorno,
  clasificarErrorGemini,
  sanitizarTextoError,
  getPreferredGeminiModel,
  getLastWorkingGeminiInfo,
  setUltimoErrorGemini,
  clearUltimoErrorGemini,
  updateGeminiPrecisionConfig,
  resetGeminiUsoDiario,
  MASTER_ADMIN_EMAIL,
  isModelosPagosHabilitados,
  updateMasterControlIA,
  type IntentoModeloResultado,
} from '../geminiClient';
import {
  clasificarErrorOpenRouter,
  generarChatOpenRouter,
  obtenerCandidatosOpenRouterKeys,
  obtenerResumenOpenRouterEnv,
  refrescarModelosGratuitosOpenRouter,
} from '../openRouterClient';
import { getOpenRouterModeloPreferido } from '../geminiClient';
import { esUsuarioMaestroRequest, getUserPrecisionOpts } from '../utils/authRequest';
import {
  GEMINI_MODEL,
  inicializarGemini,
  obraState,
  obtenerClienteGeminiActivo,
} from '../utils/runtimeState';

export function createGeminiRouter(port: number): express.Router {
  const router = express.Router();

  router.get('/config', async (req, res) => {
    await refrescarModelosGratuitosOpenRouter(false);
    const userOpts = getUserPrecisionOpts(req);
    res.json({
      exito: true,
      ...getLastWorkingGeminiInfo(userOpts),
    });
  });

  router.post('/config', (req, res) => {
    const userOpts = getUserPrecisionOpts(req);
    const puedeUsarPagos = isModelosPagosHabilitados();
    const {
      nivelPreferido,
      modeloPreferido,
      politicaLimite,
      openRouterModeloPreferido,
      limitesPorModelo,
    } = req.body || {};

    const nivelStr = typeof nivelPreferido === 'string' ? nivelPreferido.trim() : undefined;
    if (!puedeUsarPagos && nivelStr && nivelStr !== 'gratuito') {
      res.status(403).json({
        exito: false,
        error: 'Tu cuenta solo tiene habilitado el modo gratuito ($0) por el administrador maestro.',
        ...getLastWorkingGeminiInfo(userOpts),
      });
      return;
    }

    updateGeminiPrecisionConfig(
      {
        nivelPreferido: nivelStr,
        modeloPreferido: typeof modeloPreferido === 'string' ? modeloPreferido.trim() : undefined,
        politicaLimite: typeof politicaLimite === 'string' ? politicaLimite.trim() : undefined,
        openRouterModeloPreferido:
          typeof openRouterModeloPreferido === 'string' ? openRouterModeloPreferido.trim() : undefined,
        limitesPorModelo:
          limitesPorModelo && typeof limitesPorModelo === 'object' ? limitesPorModelo : undefined,
      },
      userOpts
    );
    res.json({
      exito: true,
      ...getLastWorkingGeminiInfo(userOpts),
    });
  });

  router.post('/master-control', (req, res) => {
    if (!esUsuarioMaestroRequest(req)) {
      res.status(403).json({
        exito: false,
        error: `Solo el administrador maestro (${MASTER_ADMIN_EMAIL}) puede administrar el acceso a modelos pagos.`,
      });
      return;
    }

    const habilitado = req.body?.modelosPagosHabilitados;
    const usuarios = req.body?.usuariosPagosAutorizados;
    const limitesUsuarios = req.body?.limitesPorUsuarioUsd;
    const tieneHabilitado = typeof habilitado === 'boolean';
    const tieneUsuarios = Array.isArray(usuarios);
    const tieneLimites =
      limitesUsuarios !== undefined &&
      limitesUsuarios !== null &&
      typeof limitesUsuarios === 'object' &&
      !Array.isArray(limitesUsuarios);

    if (!tieneHabilitado && !tieneUsuarios && !tieneLimites) {
      res.status(400).json({
        exito: false,
        error:
          'Debes enviar modelosPagosHabilitados (boolean), usuariosPagosAutorizados (array) o limitesPorUsuarioUsd (objeto).',
      });
      return;
    }

    const userOpts = getUserPrecisionOpts(req);
    updateMasterControlIA(
      {
        ...(tieneHabilitado ? { modelosPagosHabilitados: habilitado } : {}),
        ...(tieneUsuarios ? { usuariosPagosAutorizados: usuarios } : {}),
        ...(tieneLimites ? { limitesPorUsuarioUsd: limitesUsuarios } : {}),
      },
      userOpts
    );
    res.json({
      exito: true,
      ...getLastWorkingGeminiInfo(userOpts),
    });
  });

  router.post('/reset-uso', (req, res) => {
    const userOpts = getUserPrecisionOpts(req);
    const { modelo } = req.body || {};
    resetGeminiUsoDiario(typeof modelo === 'string' ? modelo.trim() : undefined, userOpts);
    res.json({
      exito: true,
      ...getLastWorkingGeminiInfo(userOpts),
    });
  });

  function obtenerEstadoProceso() {
    return {
      pid: process.pid,
      nodeVersion: process.version,
      platform: process.platform,
      uptimeSegundos: Math.round(process.uptime()),
      nodeEnv: process.env.NODE_ENV || 'no definido',
      puerto: port,
      clienteSdkInicializado: isModelosPagosHabilitados() ? Boolean(obtenerClienteGeminiActivo()) : false,
      fuenteClienteActivo: isModelosPagosHabilitados() ? obraState.geminiKeySource : 'OPENROUTER_FREE',
      pliegosEnMemoria: obraState.pliegosIndexados.length,
      timestamp: new Date().toISOString(),
    };
  }

  async function ejecutarDiagnosticoGemini(_req: express.Request, res: express.Response) {
    const t0 = Date.now();
    const pagosHabilitados = isModelosPagosHabilitados();
    if (pagosHabilitados) {
      const recarga = inicializarGemini();
      if (recarga.client) {
        obraState.ai = recarga.client;
        obraState.geminiKeySource = recarga.keySource;
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
  router.get('/diagnostico', ejecutarDiagnosticoGemini);
  router.post('/diagnostico', ejecutarDiagnosticoGemini);
  router.get('/ping', ejecutarDiagnosticoGemini);
  router.post('/ping', ejecutarDiagnosticoGemini);

  return router;
}
