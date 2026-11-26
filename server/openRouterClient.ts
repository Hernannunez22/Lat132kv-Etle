export interface OpenRouterKeyCandidate {
  nombre: string;
  valorLimpio: string;
  vistaSegura: string;
}

export interface OpenRouterFreeModelInfo {
  id: string;
  nombre: string;
  contextLength: number;
}

export const DEFAULT_OPENROUTER_FREE_MODEL = 'openrouter/free';

const CURATED_FREE_MODELS: OpenRouterFreeModelInfo[] = [
  { id: 'openrouter/free', nombre: 'Auto-Router Gratuito (OpenRouter)', contextLength: 200000 },
  { id: 'google/gemma-4-31b-it:free', nombre: 'Gemma 4 31B Instruct (Free)', contextLength: 262144 },
  { id: 'google/gemma-4-26b-a4b-it:free', nombre: 'Gemma 4 26B A4B (Free)', contextLength: 262144 },
  { id: 'nvidia/nemotron-3-super-120b-a12b:free', nombre: 'NVIDIA Nemotron 3 Super 120B (Free)', contextLength: 262144 },
  { id: 'meta-llama/llama-3.3-70b-instruct:free', nombre: 'Llama 3.3 70B Instruct (Free)', contextLength: 131072 },
];

let cachedFreeModels: OpenRouterFreeModelInfo[] = [...CURATED_FREE_MODELS];
let cachedFreeModelsAt = 0;
const MODELS_CACHE_TTL_MS = 10 * 60 * 1000;

const OPENROUTER_ALERT_TTL_MS = 10 * 60 * 1000;
let ultimoOpenRouterExitoso: { modelo: string; at: number } | null = null;
const openRouterAlertas = new Map<
  string,
  { estado: string; mensaje: string; timestamp: number }
>();

function recordOpenRouterSuccess(modelId: string) {
  ultimoOpenRouterExitoso = { modelo: modelId, at: Date.now() };
  openRouterAlertas.delete(modelId);
}

function recordOpenRouterAlert(modelId: string, estado: string, mensaje: string) {
  openRouterAlertas.set(modelId, {
    estado,
    mensaje: String(mensaje || '').slice(0, 180),
    timestamp: Date.now(),
  });
}

export function getOpenRouterSalud() {
  const ahora = Date.now();
  const modelosConAlerta: Array<{
    modelo: string;
    estado: string;
    mensaje: string;
    timestamp: string;
  }> = [];
  for (const [modelo, info] of openRouterAlertas.entries()) {
    if (ahora - info.timestamp > OPENROUTER_ALERT_TTL_MS) {
      openRouterAlertas.delete(modelo);
      continue;
    }
    modelosConAlerta.push({
      modelo,
      estado: info.estado,
      mensaje: info.mensaje,
      timestamp: new Date(info.timestamp).toISOString(),
    });
  }
  return {
    ultimoModeloExitoso: ultimoOpenRouterExitoso?.modelo || null,
    ultimoExitoAt: ultimoOpenRouterExitoso
      ? new Date(ultimoOpenRouterExitoso.at).toISOString()
      : null,
    modelosConAlerta,
  };
}

export function sanitizarErrorOpenRouter(raw: unknown): string {
  return String(raw || 'Error desconocido')
    .replace(/sk-or-v1-[0-9A-Za-z_-]{12,}/g, '[OPENROUTER_KEY]')
    .replace(/Bearer\s+[0-9A-Za-z._-]{12,}/gi, 'Bearer [KEY]');
}

function limpiarValorOpenRouterKey(raw?: string): string {
  if (!raw) return '';
  let k = raw.trim();
  if (/^(OPENROUTER_API_KEY|OPENROUTER_KEY|OPENROUTER_API)\s*=/i.test(k)) {
    k = k.replace(/^(OPENROUTER_API_KEY|OPENROUTER_KEY|OPENROUTER_API)\s*=/i, '').trim();
  }
  k = k.replace(/^['"]+|['"]+$/g, '').trim();
  if (!k || /^(YOUR_API_KEY|TU_CLAVE_AQUI|PLACEHOLDER|MY_OPENROUTER_API_KEY)$/i.test(k)) {
    return '';
  }
  return k;
}

export function obtenerCandidatosOpenRouterKeys(): OpenRouterKeyCandidate[] {
  const vistos = new Map<string, OpenRouterKeyCandidate>();
  const registrar = (nombre: string, raw?: string) => {
    const limpio = limpiarValorOpenRouterKey(raw);
    if (!limpio || limpio.length < 16) return;
    if (vistos.has(limpio)) return;
    const vistaSegura =
      limpio.length >= 16
        ? `${limpio.slice(0, 9)}...${limpio.slice(-4)} (${limpio.length} chars)`
        : `*** (${limpio.length} chars)`;
    vistos.set(limpio, { nombre, valorLimpio: limpio, vistaSegura });
  };

  registrar('OPENROUTER_API_KEY', process.env.OPENROUTER_API_KEY);
  registrar('OPENROUTER_KEY', process.env.OPENROUTER_KEY);
  registrar('OPENROUTER_API', process.env.OPENROUTER_API);
  registrar('VITE_OPENROUTER_API_KEY', process.env.VITE_OPENROUTER_API_KEY);

  for (const [nombre, raw] of Object.entries(process.env)) {
    const limpio = limpiarValorOpenRouterKey(raw);
    if (limpio.startsWith('sk-or-v1-') && limpio.length >= 24) {
      registrar(nombre, raw);
    }
  }

  return Array.from(vistos.values());
}

export function tieneOpenRouterConfigurado(): boolean {
  return obtenerCandidatosOpenRouterKeys().length > 0;
}

export function obtenerResumenOpenRouterEnv() {
  const candidatos = obtenerCandidatosOpenRouterKeys();
  const principal = candidatos[0] || null;
  return {
    configurado: candidatos.length > 0,
    totalClaves: candidatos.length,
    nombreVariable: principal?.nombre || 'OPENROUTER_API_KEY',
    vistaSegura: principal?.vistaSegura || '(no definida)',
  };
}

export function getModelosGratuitosOpenRouterCache(): OpenRouterFreeModelInfo[] {
  return cachedFreeModels;
}

export async function refrescarModelosGratuitosOpenRouter(
  forzar = false
): Promise<OpenRouterFreeModelInfo[]> {
  const ahora = Date.now();
  if (!forzar && ahora - cachedFreeModelsAt < MODELS_CACHE_TTL_MS && cachedFreeModels.length > 1) {
    return cachedFreeModels;
  }

  try {
    const resp = await fetch('https://openrouter.ai/api/v1/models', {
      method: 'GET',
      signal: AbortSignal.timeout(6000),
    });
    if (!resp.ok) return cachedFreeModels;
    const json: any = await resp.json();
    const data: any[] = Array.isArray(json?.data) ? json.data : [];
    const libres: OpenRouterFreeModelInfo[] = [];

    libres.push({
      id: 'openrouter/free',
      nombre: 'Auto-Router Gratuito (OpenRouter)',
      contextLength: 200000,
    });

    const filtered = data
      .filter(m => {
        const id = String(m?.id || '');
        if (!id.endsWith(':free')) return false;
        const promptPrice = Number(m?.pricing?.prompt ?? 0);
        const compPrice = Number(m?.pricing?.completion ?? 0);
        return promptPrice === 0 && compPrice === 0;
      })
      .map(m => ({
        id: String(m.id),
        nombre: String(m.name || m.id).replace(/\s*\(free\)\s*/i, '').trim() + ' (Free)',
        contextLength: Number(m.context_length || 32768),
      }))
      .sort((a, b) => b.contextLength - a.contextLength)
      .slice(0, 15);

    const seen = new Set<string>(['openrouter/free']);
    for (const item of filtered) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        libres.push(item);
      }
    }

    if (libres.length > 1) {
      cachedFreeModels = libres;
      cachedFreeModelsAt = ahora;
    }
  } catch {
    // Mantiene la lista cacheada/curada en caso de fallo de red
  }

  return cachedFreeModels;
}

export function compactarPartesParaOpenRouter(
  parts: any[],
  maxTotalChars = 95000
): { promptTexto: string; tuvoArchivosBinarios: boolean } {
  const textos: string[] = [];
  let tuvoArchivosBinarios = false;

  for (const p of parts || []) {
    if (p && typeof p === 'object') {
      if (typeof p.text === 'string' && p.text.trim()) {
        textos.push(p.text.trim());
      } else if ('fileData' in p || 'inlineData' in p) {
        tuvoArchivosBinarios = true;
      }
    } else if (typeof p === 'string' && p.trim()) {
      textos.push(p.trim());
    }
  }

  if (textos.length === 0) {
    return { promptTexto: '', tuvoArchivosBinarios };
  }

  // Siempre conservar intactos el primer bloque (inventario) y el último bloque (consulta actual + historial)
  const totalActual = textos.reduce((acc, t) => acc + t.length, 0);
  if (totalActual <= maxTotalChars) {
    const avisoBin = tuvoArchivosBinarios
      ? '\n\n[Nota del sistema: Algunos PDFs escaneados sin texto OCR no pueden enviarse como imagen binaria en el nivel Gratuito; se utiliza todo el texto indexado disponible.]'
      : '';
    return { promptTexto: textos.join('\n\n') + avisoBin, tuvoArchivosBinarios };
  }

  const primero = textos[0] || '';
  const ultimo = textos.length > 1 ? textos[textos.length - 1] : '';
  const intermedios = textos.length > 2 ? textos.slice(1, -1) : [];

  const presupuestoIntermedio = Math.max(
    8000,
    maxTotalChars - Math.min(primero.length, 6000) - Math.min(ultimo.length, 16000) - 800
  );

  const intermediosRecortados: string[] = [];
  if (intermedios.length > 0) {
    const cuotaPorBloque = Math.max(2500, Math.floor(presupuestoIntermedio / intermedios.length));
    for (const bloque of intermedios) {
      if (bloque.length <= cuotaPorBloque) {
        intermediosRecortados.push(bloque);
      } else {
        intermediosRecortados.push(
          `${bloque.slice(0, cuotaPorBloque)}\n...[extracto compactado para ventana de contexto gratuita]`
        );
      }
    }
  }

  const partesFinales = [
    primero.slice(0, 6000),
    ...intermediosRecortados,
    ultimo.slice(-16000),
  ].filter(Boolean);

  if (tuvoArchivosBinarios) {
    partesFinales.push(
      '[Nota: En el modo Gratuito OpenRouter solo se procesa el texto extraído de documentos; para inspección visual directa de planos/PDFs escaneados usa los niveles Gemini.]'
    );
  }

  return {
    promptTexto: partesFinales.join('\n\n'),
    tuvoArchivosBinarios,
  };
}

export function clasificarErrorOpenRouter(status: number | null, rawMsg: string): {
  codigoHttp: number | null;
  estado: string;
  mensaje: string;
} {
  const msg = sanitizarErrorOpenRouter(rawMsg);
  if (status === 401 || /invalid api key|unauthorized|no auth credentials/i.test(msg)) {
    return { codigoHttp: status || 401, estado: 'CLAVE_INVALIDA', mensaje: msg };
  }
  if (status === 402 || /insufficient credits|negative balance|payment required/i.test(msg)) {
    return { codigoHttp: status || 402, estado: 'CREDITOS_AGOTADOS', mensaje: msg };
  }
  if (
    status === 404 &&
    /data policy|privacy|no endpoints found matching your data policy/i.test(msg)
  ) {
    return { codigoHttp: 404, estado: 'POLITICA_PRIVACIDAD_OPENROUTER', mensaje: msg };
  }
  if (status === 429 || /rate limit|too many requests/i.test(msg)) {
    return { codigoHttp: status || 429, estado: 'CUOTA_EXCEDIDA', mensaje: msg };
  }
  if (
    status === 400 &&
    /context length|maximum context|too many tokens|reduce the length/i.test(msg)
  ) {
    return { codigoHttp: 400, estado: 'CONTEXTO_EXCEDIDO', mensaje: msg };
  }
  return { codigoHttp: status, estado: 'ERROR_OPENROUTER', mensaje: msg };
}

export function formatearAvisoErrorOpenRouter(err: any, modeloIntentado?: string): string {
  const status = typeof err?.status === 'number' ? err.status : null;
  const info = clasificarErrorOpenRouter(status, err?.message || String(err || ''));
  const modTxt = modeloIntentado ? ` (${modeloIntentado})` : '';

  if (info.estado === 'POLITICA_PRIVACIDAD_OPENROUTER') {
    return (
      `> ⚠️ **OpenRouter bloqueó el modelo gratuito por configuración de privacidad (HTTP 404${modTxt}):** ` +
      `En **[openrouter.ai/settings/privacy](https://openrouter.ai/settings/privacy)** habilita el permiso para proveedores gratuitos (*Enable free endpoints / prompt logging*) o cambia al nivel **Económico · Rápido (Gemini)**.\n\n`
    );
  }
  if (info.estado === 'CLAVE_INVALIDA') {
    return (
      `> ⚠️ **Clave de OpenRouter inválida o rechazada (HTTP 401${modTxt}):** ` +
      `Verifica que \`OPENROUTER_API_KEY\` en **Settings > Secrets** comience con \`sk-or-v1-\` y esté activa.\n\n`
    );
  }
  if (info.estado === 'CREDITOS_AGOTADOS') {
    return (
      `> ⚠️ **OpenRouter devolvió saldo insuficiente / negativo (HTTP 402${modTxt}):** ` +
      `Aunque uses modelos \`:free\`, OpenRouter requiere que tu cuenta no tenga saldo negativo.\n\n`
    );
  }
  if (info.estado === 'CUOTA_EXCEDIDA') {
    return (
      `> ⚠️ **Límite temporal de peticiones en OpenRouter gratuito (HTTP 429${modTxt}):** ` +
      `Los modelos \`:free\` permiten ~20 req/min y 50 req/día en cuentas sin recarga. Espera unos segundos o cambia al nivel **Económico · Rápido**.\n\n`
    );
  }
  return `> ⚠️ **OpenRouter (${modeloIntentado || 'openrouter/free'}) no pudo responder:** \`${info.mensaje.slice(0, 220)}\`\n\n`;
}

function buildModelAttemptOrder(preferred?: string): string[] {
  const base = (preferred || DEFAULT_OPENROUTER_FREE_MODEL).trim();
  const candidates = [
    base,
    'openrouter/free',
    'google/gemma-4-31b-it:free',
    'google/gemma-4-26b-a4b-it:free',
    'nvidia/nemotron-3-super-120b-a12b:free',
    'meta-llama/llama-3.3-70b-instruct:free',
  ];
  const uniques = Array.from(new Set(candidates.filter(Boolean)));
  const ahora = Date.now();
  return uniques.sort((a, b) => {
    if (a === base) return -1;
    if (b === base) return 1;
    const alA = openRouterAlertas.get(a);
    const alB = openRouterAlertas.get(b);
    const saturadoA = alA && ahora - alA.timestamp < OPENROUTER_ALERT_TTL_MS ? 1 : 0;
    const saturadoB = alB && ahora - alB.timestamp < OPENROUTER_ALERT_TTL_MS ? 1 : 0;
    return saturadoA - saturadoB;
  });
}

export interface HistorialTurnoOpenRouter {
  rol: 'usuario' | 'asistente';
  texto: string;
}

function construirMensajesOpenRouter(params: {
  systemInstruction: string;
  promptTexto: string;
  historialMensajes?: HistorialTurnoOpenRouter[];
}) {
  const msgs: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: params.systemInstruction },
  ];
  if (Array.isArray(params.historialMensajes) && params.historialMensajes.length > 0) {
    let presupuestoHist = 18000;
    const recientes = params.historialMensajes.slice(-12);
    for (const turno of recientes) {
      const txt = String(turno?.texto || '').trim();
      if (!txt || presupuestoHist <= 0) continue;
      const clipped = txt.slice(0, Math.min(3000, presupuestoHist));
      presupuestoHist -= clipped.length;
      msgs.push({
        role: turno.rol === 'asistente' ? 'assistant' : 'user',
        content: clipped,
      });
    }
  }
  msgs.push({ role: 'user', content: params.promptTexto });
  return msgs;
}

export async function generarChatOpenRouter(params: {
  parts: any[];
  systemInstruction: string;
  historialMensajes?: HistorialTurnoOpenRouter[];
  model?: string;
  timeoutMs?: number;
}): Promise<{
  texto: string;
  modelUsed: string;
  keySourceUsed: string;
  inputTokens: number;
  outputTokens: number;
}> {
  const keys = obtenerCandidatosOpenRouterKeys();
  if (keys.length === 0) {
    const err: any = new Error(
      'No se detectó OPENROUTER_API_KEY en Settings > Secrets en este contenedor.'
    );
    err.status = 401;
    throw err;
  }

  const modelos = buildModelAttemptOrder(params.model);
  let lastError: any = null;

  for (const kc of keys) {
    for (const modelId of modelos) {
      for (const maxChars of [95000, 32000]) {
        try {
          const { promptTexto } = compactarPartesParaOpenRouter(params.parts, maxChars);
          const messages = construirMensajesOpenRouter({
            systemInstruction: params.systemInstruction,
            promptTexto,
            historialMensajes: maxChars >= 95000 ? params.historialMensajes : params.historialMensajes?.slice(-4),
          });
          const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${kc.valorLimpio}`,
              'Content-Type': 'application/json',
              'HTTP-Referer': 'https://obras132kv.aistudio.app',
              'X-Title': 'Obras 132 kV - Control e Ingenieria',
            },
            body: JSON.stringify({
              model: modelId,
              messages,
              temperature: 0.35,
            }),
            signal: AbortSignal.timeout(params.timeoutMs || 45000),
          });

          const rawText = await resp.text();
          let data: any = null;
          try {
            data = JSON.parse(rawText);
          } catch {}

          if (!resp.ok) {
            const errMsg = data?.error?.message || data?.message || rawText || `HTTP ${resp.status}`;
            const errInfo = clasificarErrorOpenRouter(resp.status, errMsg);
            const err: any = new Error(errInfo.mensaje);
            err.status = errInfo.codigoHttp;
            err.estado = errInfo.estado;
            lastError = err;

            if (errInfo.estado === 'CONTEXTO_EXCEDIDO' && maxChars > 32000) {
              continue; // reintentar con contexto más compacto en el mismo modelo
            }
            recordOpenRouterAlert(modelId, errInfo.estado, errInfo.mensaje);
            if (errInfo.estado === 'CLAVE_INVALIDA' || errInfo.estado === 'CREDITOS_AGOTADOS') {
              break; // probar siguiente clave si hubiera
            }
            break; // probar siguiente modelo gratuito
          }

          const contenido = data?.choices?.[0]?.message?.content;
          const texto =
            typeof contenido === 'string'
              ? contenido.trim()
              : Array.isArray(contenido)
                ? contenido.map((c: any) => c?.text || '').join('').trim()
                : '';

          if (!texto) {
            recordOpenRouterAlert(modelId, 'RESPUESTA_VACIA', 'OpenRouter devolvió respuesta vacía');
            lastError = new Error(`OpenRouter devolvió respuesta vacía (${modelId}).`);
            break;
          }

          const modelFinal = String(data?.model || modelId);
          recordOpenRouterSuccess(modelFinal);
          const promptTok = Number(data?.usage?.prompt_tokens || 0);
          const compTok = Number(data?.usage?.completion_tokens || 0);
          return {
            texto,
            modelUsed: modelFinal,
            keySourceUsed: kc.nombre,
            inputTokens: promptTok > 0 ? promptTok : Math.max(1, Math.round(promptTexto.length / 4)),
            outputTokens: compTok > 0 ? compTok : Math.max(1, Math.round(texto.length / 4)),
          };
        } catch (err: any) {
          lastError = err;
          if (err?.estado === 'CONTEXTO_EXCEDIDO' && maxChars > 32000) continue;
          recordOpenRouterAlert(modelId, err?.estado || 'ERROR_OPENROUTER', err?.message || 'Error');
          break;
        }
      }
    }
  }

  throw lastError || new Error('No se pudo obtener respuesta desde OpenRouter (:free).');
}

export async function generarStreamOpenRouter(params: {
  parts: any[];
  systemInstruction: string;
  historialMensajes?: HistorialTurnoOpenRouter[];
  model?: string;
  onChunk: (chunk: string) => void;
}): Promise<{
  textoCompleto: string;
  modelUsed: string;
  keySourceUsed: string;
  inputTokens: number;
  outputTokens: number;
}> {
  const keys = obtenerCandidatosOpenRouterKeys();
  if (keys.length === 0) {
    const err: any = new Error(
      'No se detectó OPENROUTER_API_KEY en Settings > Secrets en este contenedor.'
    );
    err.status = 401;
    throw err;
  }

  const modelos = buildModelAttemptOrder(params.model);
  let lastError: any = null;

  for (const kc of keys) {
    for (const modelId of modelos) {
      for (const maxChars of [95000, 32000]) {
        try {
          const { promptTexto } = compactarPartesParaOpenRouter(params.parts, maxChars);
          const messages = construirMensajesOpenRouter({
            systemInstruction: params.systemInstruction,
            promptTexto,
            historialMensajes: maxChars >= 95000 ? params.historialMensajes : params.historialMensajes?.slice(-4),
          });
          const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${kc.valorLimpio}`,
              'Content-Type': 'application/json',
              'HTTP-Referer': 'https://obras132kv.aistudio.app',
              'X-Title': 'Obras 132 kV - Control e Ingenieria',
            },
            body: JSON.stringify({
              model: modelId,
              stream: true,
              stream_options: { include_usage: true },
              messages,
              temperature: 0.35,
            }),
            signal: AbortSignal.timeout(60000),
          });

          if (!resp.ok || !resp.body) {
            const rawErr = await resp.text().catch(() => '');
            let errJson: any = null;
            try {
              errJson = JSON.parse(rawErr);
            } catch {}
            const msg = errJson?.error?.message || errJson?.message || rawErr || `HTTP ${resp.status}`;
            const info = clasificarErrorOpenRouter(resp.status, msg);
            const err: any = new Error(info.mensaje);
            err.status = info.codigoHttp;
            err.estado = info.estado;
            lastError = err;

            if (info.estado === 'CONTEXTO_EXCEDIDO' && maxChars > 32000) {
              continue;
            }
            recordOpenRouterAlert(modelId, info.estado, info.mensaje);
            break;
          }

          const reader = resp.body.getReader();
          const decoder = new TextDecoder('utf-8');
          let buffer = '';
          let textoCompleto = '';
          let realModel = modelId;
          let inputTokens = 0;
          let outputTokens = 0;

          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const rawLine of lines) {
              const line = rawLine.trim();
              if (!line || line.startsWith(':') || !line.startsWith('data:')) continue;
              const payloadStr = line.slice(5).trim();
              if (payloadStr === '[DONE]') continue;
              try {
                const parsed = JSON.parse(payloadStr);
                if (parsed?.error?.message) {
                  const errInfo = clasificarErrorOpenRouter(
                    Number(parsed?.error?.code || 500),
                    parsed.error.message
                  );
                  const e: any = new Error(errInfo.mensaje);
                  e.status = errInfo.codigoHttp;
                  e.estado = errInfo.estado;
                  throw e;
                }
                if (parsed?.model) realModel = String(parsed.model);
                const delta = parsed?.choices?.[0]?.delta?.content;
                if (typeof delta === 'string' && delta.length > 0) {
                  textoCompleto += delta;
                  params.onChunk(delta);
                }
                if (parsed?.usage) {
                  if (Number(parsed.usage.prompt_tokens) > 0) {
                    inputTokens = Number(parsed.usage.prompt_tokens);
                  }
                  if (Number(parsed.usage.completion_tokens) > 0) {
                    outputTokens = Number(parsed.usage.completion_tokens);
                  }
                }
              } catch (innerErr: any) {
                if (innerErr?.estado) throw innerErr;
              }
            }
          }

          if (textoCompleto.trim().length > 0) {
            recordOpenRouterSuccess(realModel);
            return {
              textoCompleto,
              modelUsed: realModel,
              keySourceUsed: kc.nombre,
              inputTokens: inputTokens > 0 ? inputTokens : Math.max(1, Math.round(promptTexto.length / 4)),
              outputTokens:
                outputTokens > 0 ? outputTokens : Math.max(1, Math.round(textoCompleto.length / 4)),
            };
          }

          recordOpenRouterAlert(modelId, 'STREAM_VACIO', 'Stream vacío de OpenRouter');
          lastError = new Error(`Stream vacío de OpenRouter (${modelId}).`);
          break;
        } catch (err: any) {
          lastError = err;
          if (err?.estado === 'CONTEXTO_EXCEDIDO' && maxChars > 32000) {
            continue;
          }
          recordOpenRouterAlert(modelId, err?.estado || 'ERROR_OPENROUTER', err?.message || 'Error');
          break;
        }
      }
    }
  }

  throw lastError || new Error('Todos los modelos gratuitos de OpenRouter fallaron.');
}

export async function generarVisionOpenRouter(params: {
  dataUrl: string;
  prompt: string;
  systemInstruction?: string;
  timeoutMs?: number;
}): Promise<{
  texto: string;
  modelUsed: string;
  inputTokens: number;
  outputTokens: number;
}> {
  const keys = obtenerCandidatosOpenRouterKeys();
  if (keys.length === 0) {
    const err: any = new Error(
      'No se detectó OPENROUTER_API_KEY en Settings > Secrets en este contenedor.'
    );
    err.status = 401;
    throw err;
  }

  const visionFreeModels = [
    'google/gemma-4-31b-it:free',
    'google/gemma-4-26b-a4b-it:free',
    'nvidia/nemotron-3.5-super-vl:free',
    'openrouter/free',
  ];

  let lastError: any = null;
  for (const kc of keys) {
    for (const modelId of visionFreeModels) {
      try {
        const messages: any[] = [];
        if (params.systemInstruction) {
          messages.push({ role: 'system', content: params.systemInstruction });
        }
        messages.push({
          role: 'user',
          content: [
            { type: 'text', text: params.prompt },
            { type: 'image_url', image_url: { url: params.dataUrl } },
          ],
        });

        const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${kc.valorLimpio}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://obras132kv.aistudio.app',
            'X-Title': 'Obras 132 kV - Control e Ingenieria',
          },
          body: JSON.stringify({
            model: modelId,
            messages,
            temperature: 0.25,
          }),
          signal: AbortSignal.timeout(params.timeoutMs || 35000),
        });

        const rawText = await resp.text();
        let data: any = null;
        try {
          data = JSON.parse(rawText);
        } catch {}

        if (!resp.ok) {
          const msg = data?.error?.message || data?.message || rawText || `HTTP ${resp.status}`;
          const info = clasificarErrorOpenRouter(resp.status, msg);
          const err: any = new Error(info.mensaje);
          err.status = info.codigoHttp;
          err.estado = info.estado;
          lastError = err;
          if (info.estado === 'CLAVE_INVALIDA' || info.estado === 'CREDITOS_AGOTADOS') break;
          continue;
        }

        const contenido = data?.choices?.[0]?.message?.content;
        const texto =
          typeof contenido === 'string'
            ? contenido.trim()
            : Array.isArray(contenido)
              ? contenido.map((c: any) => c?.text || '').join('').trim()
              : '';
        if (!texto) {
          lastError = new Error(`OpenRouter visión devolvió respuesta vacía (${modelId}).`);
          continue;
        }

        return {
          texto,
          modelUsed: String(data?.model || modelId),
          inputTokens: Number(data?.usage?.prompt_tokens || 1200),
          outputTokens: Number(data?.usage?.completion_tokens || Math.max(1, Math.round(texto.length / 4))),
        };
      } catch (err: any) {
        lastError = err;
      }
    }
  }

  throw lastError || new Error('No se pudo analizar la imagen con los modelos gratuitos de OpenRouter.');
}
