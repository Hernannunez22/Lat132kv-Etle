import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  GoogleGenAI,
  ThinkingLevel,
  type GenerateContentConfig,
  type GenerateContentResponse,
} from '@google/genai';
import type {
  GeminiModeloId,
  GeminiModelCatalogItem,
  GeminiPrecisionState,
  PoliticaLimiteModelo,
  PrecisionNivelId,
  ProveedorIAModelo,
} from '../src/types/index.js';
import {
  DEFAULT_OPENROUTER_FREE_MODEL,
  generarChatOpenRouter,
  getModelosGratuitosOpenRouterCache,
  tieneOpenRouterConfigurado,
} from './openRouterClient.js';

export const MASTER_ADMIN_EMAIL = 'hernannunez27@gmail.com';
export const OPENROUTER_FREE_MODEL: GeminiModeloId = 'openrouter/free';
export const LITE_GEMINI_MODEL: GeminiModeloId = 'gemini-3.1-flash-lite';
export const BALANCED_GEMINI_MODEL: GeminiModeloId = 'gemini-4-hydrogen';
export const HIGH_GEMINI_MODEL: GeminiModeloId = 'gemini-4-neon';
export const PRIMARY_GEMINI_MODEL = LITE_GEMINI_MODEL;
export const AUDIO_TRANSCRIBE_MODEL = 'gemini-3.5-transcribe';

export const DEFAULT_TEXT_MODELS = [
  LITE_GEMINI_MODEL,
  BALANCED_GEMINI_MODEL,
  HIGH_GEMINI_MODEL,
] as const;
export const DEFAULT_AUDIO_MODELS = [
  AUDIO_TRANSCRIBE_MODEL,
  LITE_GEMINI_MODEL,
] as const;

export type ModeloPreferido = 'auto' | GeminiModeloId;

interface PrecisionCatalogDef {
  nivelId: PrecisionNivelId;
  etiquetaNivel: string;
  descripcion: string;
  proveedor: ProveedorIAModelo;
  modelo: GeminiModeloId;
  thinkingLevel: 'MINIMAL' | 'LOW' | 'MEDIUM' | 'HIGH';
  costoInputPor1M: number;
  costoOutputPor1M: number;
  requiereCreditosPago: boolean;
  defaultMaxConsultasDiarias: number;
  defaultMaxCostoUsdDiario: number;
}

export const GEMINI_PRECISION_CATALOG: Record<PrecisionNivelId, PrecisionCatalogDef> = {
  gratuito: {
    nivelId: 'gratuito',
    etiquetaNivel: 'Gratuito · $0',
    descripcion: 'Modelos :free en OpenRouter a $0.00 (contexto compactado para Notas, Pliegos y Minutas).',
    proveedor: 'openrouter',
    modelo: OPENROUTER_FREE_MODEL,
    thinkingLevel: 'LOW',
    costoInputPor1M: 0,
    costoOutputPor1M: 0,
    requiereCreditosPago: false,
    defaultMaxConsultasDiarias: 0,
    defaultMaxCostoUsdDiario: 0,
  },
  economico: {
    nivelId: 'economico',
    etiquetaNivel: 'Económico · Rápido',
    descripcion: 'Respuestas ágiles y costo mínimo (ideal para consultas diarias y búsquedas).',
    proveedor: 'gemini',
    modelo: LITE_GEMINI_MODEL,
    thinkingLevel: 'LOW',
    costoInputPor1M: 0.075,
    costoOutputPor1M: 0.3,
    requiereCreditosPago: false,
    defaultMaxConsultasDiarias: 150,
    defaultMaxCostoUsdDiario: 0.5,
  },
  balanceado: {
    nivelId: 'balanceado',
    etiquetaNivel: 'Estándar · IA Real',
    descripcion: 'Motor principal (Gemini 4): comprensión profunda de lenguaje extenso, contexto multi-turno y razonamiento técnico.',
    proveedor: 'gemini',
    modelo: BALANCED_GEMINI_MODEL,
    thinkingLevel: 'MEDIUM',
    costoInputPor1M: 0.3,
    costoOutputPor1M: 2.5,
    requiereCreditosPago: false,
    defaultMaxConsultasDiarias: 120,
    defaultMaxCostoUsdDiario: 3.0,
  },
  alta: {
    nivelId: 'alta',
    etiquetaNivel: 'Alta Precisión · Pro',
    descripcion: 'Razonamiento profundo para auditorías complejas, cruces múltiples y pliegos.',
    proveedor: 'gemini',
    modelo: HIGH_GEMINI_MODEL,
    thinkingLevel: 'HIGH',
    costoInputPor1M: 1.25,
    costoOutputPor1M: 10.0,
    requiereCreditosPago: true,
    defaultMaxConsultasDiarias: 10,
    defaultMaxCostoUsdDiario: 1.5,
  },
};

const PRECISION_CACHE_DIR = path.join(os.tmpdir(), 'obras132kv_pliegos_cache');
const PRECISION_LIMITS_FILE = path.join(PRECISION_CACHE_DIR, 'gemini_precision_limits.json');

interface PersistedModelLimitAndUsage {
  maxConsultasDiarias: number;
  maxCostoUsdDiario: number;
  usoHoy: {
    fecha: string;
    consultas: number;
    inputTokens: number;
    outputTokens: number;
    costoUsd: number;
  };
  historicoConsultas: number;
  historicoCostoUsd: number;
}

const PRECISION_STORE_SCHEMA_VERSION = 3;

interface PersistedPrecisionStore {
  schemaVersion?: number;
  modelosPagosHabilitados: boolean;
  nivelPreferido: PrecisionNivelId;
  politicaLimite: PoliticaLimiteModelo;
  openRouterModeloPreferido: string;
  modelos: Record<GeminiModeloId, PersistedModelLimitAndUsage>;
}

function getHoyISO(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function crearEstadoInicialModelo(def: PrecisionCatalogDef, hoy: string): PersistedModelLimitAndUsage {
  return {
    maxConsultasDiarias: def.defaultMaxConsultasDiarias,
    maxCostoUsdDiario: def.defaultMaxCostoUsdDiario,
    usoHoy: {
      fecha: hoy,
      consultas: 0,
      inputTokens: 0,
      outputTokens: 0,
      costoUsd: 0,
    },
    historicoConsultas: 0,
    historicoCostoUsd: 0,
  };
}

function normalizarStorePrecision(raw?: any): PersistedPrecisionStore {
  const hoy = getHoyISO();
  const schemaPrev = raw && typeof raw === 'object' ? Number(raw.schemaVersion || 1) : 0;
  const esMigracionPreV3 = schemaPrev > 0 && schemaPrev < PRECISION_STORE_SCHEMA_VERSION;
  const modelosPagosHabilitados =
    !esMigracionPreV3 && raw && typeof raw === 'object' && typeof raw.modelosPagosHabilitados === 'boolean'
      ? raw.modelosPagosHabilitados
      : false;

  let nivelValido: PrecisionNivelId =
    raw?.nivelPreferido === 'gratuito' ||
    raw?.nivelPreferido === 'economico' ||
    raw?.nivelPreferido === 'balanceado' ||
    raw?.nivelPreferido === 'alta'
      ? raw.nivelPreferido
      : 'gratuito';
  if (!modelosPagosHabilitados || esMigracionPreV3) {
    nivelValido = 'gratuito';
  }
  const politicaValida: PoliticaLimiteModelo =
    raw?.politicaLimite === 'fallback_economico' ? 'fallback_economico' : 'bloquear';
  const openRouterModeloPreferido =
    typeof raw?.openRouterModeloPreferido === 'string' && raw.openRouterModeloPreferido.trim()
      ? raw.openRouterModeloPreferido.trim()
      : DEFAULT_OPENROUTER_FREE_MODEL;

  const modelos = {} as Record<GeminiModeloId, PersistedModelLimitAndUsage>;
  for (const def of Object.values(GEMINI_PRECISION_CATALOG)) {
    const prev = raw?.modelos?.[def.modelo];
    const base = crearEstadoInicialModelo(def, hoy);
    if (prev && typeof prev === 'object') {
      const esViejoLimiteFree =
        esMigracionPreV3 &&
        def.modelo === OPENROUTER_FREE_MODEL &&
        prev.maxConsultasDiarias === 50;
      base.maxConsultasDiarias =
        !esViejoLimiteFree && typeof prev.maxConsultasDiarias === 'number' && prev.maxConsultasDiarias >= 0
          ? Math.round(prev.maxConsultasDiarias)
          : def.defaultMaxConsultasDiarias;
      base.maxCostoUsdDiario =
        typeof prev.maxCostoUsdDiario === 'number' && prev.maxCostoUsdDiario >= 0
          ? Number(prev.maxCostoUsdDiario.toFixed(4))
          : def.defaultMaxCostoUsdDiario;
      base.historicoConsultas =
        typeof prev.historicoConsultas === 'number' && prev.historicoConsultas >= 0
          ? Math.round(prev.historicoConsultas)
          : 0;
      base.historicoCostoUsd =
        typeof prev.historicoCostoUsd === 'number' && prev.historicoCostoUsd >= 0
          ? Number(prev.historicoCostoUsd.toFixed(6))
          : 0;
      if (prev.usoHoy && prev.usoHoy.fecha === hoy) {
        base.usoHoy = {
          fecha: hoy,
          consultas: Math.max(0, Math.round(Number(prev.usoHoy.consultas || 0))),
          inputTokens: Math.max(0, Math.round(Number(prev.usoHoy.inputTokens || 0))),
          outputTokens: Math.max(0, Math.round(Number(prev.usoHoy.outputTokens || 0))),
          costoUsd: Math.max(0, Number(Number(prev.usoHoy.costoUsd || 0).toFixed(6))),
        };
      }
    }
    modelos[def.modelo] = base;
  }

  return {
    schemaVersion: PRECISION_STORE_SCHEMA_VERSION,
    modelosPagosHabilitados,
    nivelPreferido: nivelValido,
    politicaLimite: politicaValida,
    openRouterModeloPreferido,
    modelos,
  };
}

function cargarStorePrecisionDesdeDisco(): PersistedPrecisionStore {
  try {
    if (fs.existsSync(PRECISION_LIMITS_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(PRECISION_LIMITS_FILE, 'utf8'));
      const normalized = normalizarStorePrecision(parsed);
      if (Number(parsed?.schemaVersion || 1) < PRECISION_STORE_SCHEMA_VERSION) {
        guardarStorePrecisionEnDisco(normalized);
      }
      return normalized;
    }
  } catch (err) {
    console.warn('[Gemini Precision] Error leyendo store de límites/costos:', err);
  }
  return normalizarStorePrecision();
}

function guardarStorePrecisionEnDisco(store: PersistedPrecisionStore) {
  try {
    if (!fs.existsSync(PRECISION_CACHE_DIR)) {
      fs.mkdirSync(PRECISION_CACHE_DIR, { recursive: true });
    }
    fs.writeFileSync(PRECISION_LIMITS_FILE, JSON.stringify(store, null, 2), 'utf8');
  } catch (err) {
    console.warn('[Gemini Precision] Error guardando store de límites/costos:', err);
  }
}

let precisionStore: PersistedPrecisionStore = cargarStorePrecisionDesdeDisco();

function asegurarFechaHoyStore() {
  const hoy = getHoyISO();
  let changed = false;
  for (const m of Object.keys(precisionStore.modelos) as GeminiModeloId[]) {
    if (precisionStore.modelos[m].usoHoy.fecha !== hoy) {
      precisionStore.modelos[m].usoHoy = {
        fecha: hoy,
        consultas: 0,
        inputTokens: 0,
        outputTokens: 0,
        costoUsd: 0,
      };
      changed = true;
    }
  }
  if (changed) guardarStorePrecisionEnDisco(precisionStore);
}

export function getCatalogDefByNivelOrModel(
  nivelOrModel?: string
): PrecisionCatalogDef {
  if (!precisionStore.modelosPagosHabilitados) {
    return GEMINI_PRECISION_CATALOG.gratuito;
  }
  if (
    nivelOrModel === 'gratuito' ||
    nivelOrModel === OPENROUTER_FREE_MODEL ||
    (typeof nivelOrModel === 'string' && nivelOrModel.endsWith(':free'))
  ) {
    return GEMINI_PRECISION_CATALOG.gratuito;
  }
  if (nivelOrModel === 'balanceado' || nivelOrModel === BALANCED_GEMINI_MODEL) {
    return GEMINI_PRECISION_CATALOG.balanceado;
  }
  if (nivelOrModel === 'alta' || nivelOrModel === HIGH_GEMINI_MODEL) {
    return GEMINI_PRECISION_CATALOG.alta;
  }
  if (nivelOrModel === 'economico' || nivelOrModel === LITE_GEMINI_MODEL) {
    return GEMINI_PRECISION_CATALOG.economico;
  }
  return GEMINI_PRECISION_CATALOG[precisionStore.nivelPreferido] || GEMINI_PRECISION_CATALOG.gratuito;
}

export function getOpenRouterModeloPreferido(): string {
  return precisionStore.openRouterModeloPreferido || DEFAULT_OPENROUTER_FREE_MODEL;
}

export function isModelosPagosHabilitados(): boolean {
  return Boolean(precisionStore.modelosPagosHabilitados);
}

export function setModelosPagosHabilitados(
  habilitado: boolean,
  options?: { esMaestro?: boolean }
): GeminiPrecisionState {
  asegurarFechaHoyStore();
  precisionStore.modelosPagosHabilitados = Boolean(habilitado);
  if (!precisionStore.modelosPagosHabilitados) {
    precisionStore.nivelPreferido = 'gratuito';
    preferredModelState = OPENROUTER_FREE_MODEL;
  } else {
    preferredModelState = GEMINI_PRECISION_CATALOG[precisionStore.nivelPreferido].modelo;
  }
  guardarStorePrecisionEnDisco(precisionStore);
  return getGeminiPrecisionState({ esMaestro: options?.esMaestro ?? true });
}

export function getGeminiPrecisionState(options?: { esMaestro?: boolean }): GeminiPrecisionState {
  asegurarFechaHoyStore();
  const hoy = getHoyISO();
  const pagosHabilitados = Boolean(precisionStore.modelosPagosHabilitados);
  const esMaestro = Boolean(options?.esMaestro);
  let costoTotalHoyUsd = 0;
  let consultasTotalesHoy = 0;
  let costoHistoricoUsd = 0;
  const geminiConfigurado = pagosHabilitados ? obtenerCandidatosApiKeys().length > 0 : false;
  const openRouterConfigurado = tieneOpenRouterConfigurado();

  const nivelesVisibles: PrecisionNivelId[] = pagosHabilitados
    ? ['gratuito', 'economico', 'balanceado', 'alta']
    : ['gratuito'];

  const modelos: GeminiModelCatalogItem[] = nivelesVisibles.map(nivelId => {
    const def = GEMINI_PRECISION_CATALOG[nivelId];
    const entry = precisionStore.modelos[def.modelo];
    const limiteConsultasAlcanzado =
      entry.maxConsultasDiarias > 0 && entry.usoHoy.consultas >= entry.maxConsultasDiarias;
    const limiteCostoAlcanzado =
      entry.maxCostoUsdDiario > 0 && entry.usoHoy.costoUsd >= entry.maxCostoUsdDiario;

    costoTotalHoyUsd += entry.usoHoy.costoUsd;
    consultasTotalesHoy += entry.usoHoy.consultas;
    costoHistoricoUsd += entry.historicoCostoUsd;

    return {
      nivelId: def.nivelId,
      etiquetaNivel: def.etiquetaNivel,
      descripcion: def.descripcion,
      proveedor: def.proveedor,
      modelo: def.modelo,
      thinkingLevel: def.thinkingLevel,
      costoInputPor1M: def.costoInputPor1M,
      costoOutputPor1M: def.costoOutputPor1M,
      requiereCreditosPago: def.requiereCreditosPago,
      configuradoEnServidor:
        def.proveedor === 'openrouter' ? openRouterConfigurado : geminiConfigurado,
      maxConsultasDiarias: entry.maxConsultasDiarias,
      maxCostoUsdDiario: entry.maxCostoUsdDiario,
      usoHoy: { ...entry.usoHoy },
      historicoConsultas: entry.historicoConsultas,
      historicoCostoUsd: Number(entry.historicoCostoUsd.toFixed(6)),
      limiteConsultasAlcanzado,
      limiteCostoAlcanzado,
      disponiblePorLimite: !limiteConsultasAlcanzado && !limiteCostoAlcanzado,
    };
  });

  const nivelEfectivo: PrecisionNivelId = pagosHabilitados
    ? precisionStore.nivelPreferido
    : 'gratuito';
  const defPref = GEMINI_PRECISION_CATALOG[nivelEfectivo];
  return {
    fechaActual: hoy,
    nivelPreferido: nivelEfectivo,
    modeloPreferido: defPref.modelo,
    politicaLimite: precisionStore.politicaLimite,
    modelosPagosHabilitados: pagosHabilitados,
    esUsuarioMaestro: esMaestro,
    costoTotalHoyUsd: Number(costoTotalHoyUsd.toFixed(6)),
    consultasTotalesHoy,
    costoHistoricoUsd: Number(costoHistoricoUsd.toFixed(6)),
    openRouterConfigurado,
    openRouterModeloPreferido: getOpenRouterModeloPreferido(),
    openRouterModelosGratuitos: getModelosGratuitosOpenRouterCache(),
    modelos,
  };
}

export function updateGeminiPrecisionConfig(
  payload: {
    nivelPreferido?: string;
    modeloPreferido?: string;
    politicaLimite?: string;
    openRouterModeloPreferido?: string;
    limitesPorModelo?: Record<
      string,
      { maxConsultasDiarias?: number; maxCostoUsdDiario?: number }
    >;
  },
  options?: { esMaestro?: boolean }
): GeminiPrecisionState {
  asegurarFechaHoyStore();
  const pagosHabilitados = Boolean(precisionStore.modelosPagosHabilitados);

  if (!pagosHabilitados) {
    precisionStore.nivelPreferido = 'gratuito';
  } else if (
    payload.nivelPreferido === 'gratuito' ||
    payload.nivelPreferido === 'economico' ||
    payload.nivelPreferido === 'balanceado' ||
    payload.nivelPreferido === 'alta'
  ) {
    precisionStore.nivelPreferido = payload.nivelPreferido;
  } else if (payload.modeloPreferido) {
    if (payload.modeloPreferido === OPENROUTER_FREE_MODEL || payload.modeloPreferido.endsWith(':free')) {
      precisionStore.nivelPreferido = 'gratuito';
    } else if (payload.modeloPreferido === 'auto' || payload.modeloPreferido === LITE_GEMINI_MODEL) {
      precisionStore.nivelPreferido = 'economico';
    } else if (payload.modeloPreferido === BALANCED_GEMINI_MODEL) {
      precisionStore.nivelPreferido = 'balanceado';
    } else if (payload.modeloPreferido === HIGH_GEMINI_MODEL) {
      precisionStore.nivelPreferido = 'alta';
    }
  }

  if (typeof payload.openRouterModeloPreferido === 'string' && payload.openRouterModeloPreferido.trim()) {
    const cleanOrModel = payload.openRouterModeloPreferido.trim();
    if (cleanOrModel === 'openrouter/free' || cleanOrModel.endsWith(':free')) {
      precisionStore.openRouterModeloPreferido = cleanOrModel;
    }
  }

  preferredModelState = GEMINI_PRECISION_CATALOG[precisionStore.nivelPreferido].modelo;

  if (payload.politicaLimite === 'bloquear' || payload.politicaLimite === 'fallback_economico') {
    precisionStore.politicaLimite = payload.politicaLimite;
  }

  if (payload.limitesPorModelo && typeof payload.limitesPorModelo === 'object') {
    for (const [key, cfg] of Object.entries(payload.limitesPorModelo)) {
      if (!pagosHabilitados && key !== 'gratuito' && key !== OPENROUTER_FREE_MODEL && !key.endsWith(':free')) {
        continue;
      }
      const def = getCatalogDefByNivelOrModel(key);
      const entry = precisionStore.modelos[def.modelo];
      if (!entry || !cfg || typeof cfg !== 'object') continue;
      if (typeof cfg.maxConsultasDiarias === 'number' && Number.isFinite(cfg.maxConsultasDiarias) && cfg.maxConsultasDiarias >= 0) {
        entry.maxConsultasDiarias = Math.min(10000, Math.round(cfg.maxConsultasDiarias));
      }
      if (typeof cfg.maxCostoUsdDiario === 'number' && Number.isFinite(cfg.maxCostoUsdDiario) && cfg.maxCostoUsdDiario >= 0) {
        entry.maxCostoUsdDiario = Math.min(1000, Number(cfg.maxCostoUsdDiario.toFixed(4)));
      }
    }
  }

  guardarStorePrecisionEnDisco(precisionStore);
  return getGeminiPrecisionState({ esMaestro: options?.esMaestro });
}

export function resetGeminiUsoDiario(
  modelo?: string,
  options?: { esMaestro?: boolean }
): GeminiPrecisionState {
  const hoy = getHoyISO();
  const targets: GeminiModeloId[] = !precisionStore.modelosPagosHabilitados
    ? [OPENROUTER_FREE_MODEL]
    : modelo && precisionStore.modelos[modelo as GeminiModeloId]
      ? [modelo as GeminiModeloId]
      : (Object.keys(precisionStore.modelos) as GeminiModeloId[]);

  for (const m of targets) {
    precisionStore.modelos[m].usoHoy = {
      fecha: hoy,
      consultas: 0,
      inputTokens: 0,
      outputTokens: 0,
      costoUsd: 0,
    };
  }
  guardarStorePrecisionEnDisco(precisionStore);
  return getGeminiPrecisionState({ esMaestro: options?.esMaestro });
}

export function resolverEjecucionPrecision(params?: {
  nivelSolicitado?: string;
  modeloSolicitado?: string;
}):
  | {
      permitido: true;
      def: PrecisionCatalogDef;
      thinkingEnum: ThinkingLevel;
      fallbackDesdeModelo?: string;
    }
  | {
      permitido: false;
      def: PrecisionCatalogDef;
      motivoLimite: string;
    } {
  asegurarFechaHoyStore();
  if (!precisionStore.modelosPagosHabilitados) {
    const freeDef = GEMINI_PRECISION_CATALOG.gratuito;
    const entryFree = precisionStore.modelos[freeDef.modelo];
    const exFree =
      entryFree.maxConsultasDiarias > 0 && entryFree.usoHoy.consultas >= entryFree.maxConsultasDiarias;
    if (exFree) {
      return {
        permitido: false,
        def: freeDef,
        motivoLimite: `Límite diario alcanzado para "${freeDef.etiquetaNivel}" (${entryFree.usoHoy.consultas}/${entryFree.maxConsultasDiarias} hoy). Ajusta el tope a 0 para consultas ilimitadas.`,
      };
    }
    return {
      permitido: true,
      def: freeDef,
      thinkingEnum: ThinkingLevel.LOW,
    };
  }
  const solicitadoDef = getCatalogDefByNivelOrModel(
    params?.nivelSolicitado || params?.modeloSolicitado
  );

  const checkModeloDisponible = (def: PrecisionCatalogDef) => {
    const entry = precisionStore.modelos[def.modelo];
    const exConsultas =
      entry.maxConsultasDiarias > 0 && entry.usoHoy.consultas >= entry.maxConsultasDiarias;
    const exCosto =
      entry.maxCostoUsdDiario > 0 && entry.usoHoy.costoUsd >= entry.maxCostoUsdDiario;
    return { entry, exConsultas, exCosto, ok: !exConsultas && !exCosto };
  };

  const toThinkingEnum = (lvl: PrecisionCatalogDef['thinkingLevel']): ThinkingLevel => {
    if (lvl === 'HIGH') return ThinkingLevel.HIGH;
    if (lvl === 'MEDIUM') return ThinkingLevel.MEDIUM;
    if (lvl === 'MINIMAL') return ThinkingLevel.MINIMAL;
    return ThinkingLevel.LOW;
  };

  const st = checkModeloDisponible(solicitadoDef);
  if (st.ok) {
    return {
      permitido: true,
      def: solicitadoDef,
      thinkingEnum: toThinkingEnum(solicitadoDef.thinkingLevel),
    };
  }

  const fallbackDesdeDestino =
    solicitadoDef.nivelId === 'gratuito'
      ? GEMINI_PRECISION_CATALOG.economico
      : GEMINI_PRECISION_CATALOG.economico;

  if (
    precisionStore.politicaLimite === 'fallback_economico' &&
    solicitadoDef.modelo !== fallbackDesdeDestino.modelo
  ) {
    const stEco = checkModeloDisponible(fallbackDesdeDestino);
    if (stEco.ok) {
      return {
        permitido: true,
        def: fallbackDesdeDestino,
        thinkingEnum: toThinkingEnum(fallbackDesdeDestino.thinkingLevel),
        fallbackDesdeModelo: solicitadoDef.modelo,
      };
    }
  }

  const razones: string[] = [];
  if (st.exConsultas) {
    razones.push(
      `consultas (${st.entry.usoHoy.consultas}/${st.entry.maxConsultasDiarias} hoy)`
    );
  }
  if (st.exCosto) {
    razones.push(
      `tope de gasto ($${st.entry.usoHoy.costoUsd.toFixed(4)}/$${st.entry.maxCostoUsdDiario.toFixed(2)} USD hoy)`
    );
  }

  const sugerenciaCambio =
    solicitadoDef.modelo === LITE_GEMINI_MODEL
      ? 'Cambia a "Gratuito · $0 (OpenRouter :free)" o amplía/reinicia el límite diario.'
      : 'Cambia a "Económico · Rápido (gemini-3.1-flash-lite)" o a otro nivel, amplía el límite o reinicia el contador diario.';

  return {
    permitido: false,
    def: solicitadoDef,
    motivoLimite:
      `Límite diario alcanzado para el nivel "${solicitadoDef.etiquetaNivel}" (${solicitadoDef.modelo}): ${razones.join(' y ')}. ${sugerenciaCambio}`,
  };
}

export function registrarConsumoGemini(params: {
  modelo: string;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    thoughtsTokenCount?: number;
    totalTokenCount?: number;
  };
  inputTokensDirecto?: number;
  outputTokensDirecto?: number;
  inputCharsFallback?: number;
  outputCharsFallback?: number;
}): {
  inputTokens: number;
  outputTokens: number;
  costoUsd: number;
} {
  asegurarFechaHoyStore();
  const def = getCatalogDefByNivelOrModel(params.modelo);
  const entry = precisionStore.modelos[def.modelo];

  const meta = params.usageMetadata || {};
  const inputTokens =
    typeof params.inputTokensDirecto === 'number' && params.inputTokensDirecto > 0
      ? Math.round(params.inputTokensDirecto)
      : typeof meta.promptTokenCount === 'number' && meta.promptTokenCount > 0
        ? Math.round(meta.promptTokenCount)
        : Math.max(1, Math.round((params.inputCharsFallback || 800) / 4));

  const rawOut =
    (typeof meta.candidatesTokenCount === 'number' ? meta.candidatesTokenCount : 0) +
    (typeof meta.thoughtsTokenCount === 'number' ? meta.thoughtsTokenCount : 0);
  const outputTokens =
    typeof params.outputTokensDirecto === 'number' && params.outputTokensDirecto > 0
      ? Math.round(params.outputTokensDirecto)
      : rawOut > 0
        ? Math.round(rawOut)
        : typeof meta.totalTokenCount === 'number' && meta.totalTokenCount > inputTokens
          ? Math.round(meta.totalTokenCount - inputTokens)
          : Math.max(1, Math.round((params.outputCharsFallback || 400) / 4));

  const costoUsd =
    def.proveedor === 'openrouter'
      ? 0
      : Number(
          (
            (inputTokens / 1_000_000) * def.costoInputPor1M +
            (outputTokens / 1_000_000) * def.costoOutputPor1M
          ).toFixed(6)
        );

  if (entry) {
    entry.usoHoy.consultas += 1;
    entry.usoHoy.inputTokens += inputTokens;
    entry.usoHoy.outputTokens += outputTokens;
    entry.usoHoy.costoUsd = Number((entry.usoHoy.costoUsd + costoUsd).toFixed(6));
    entry.historicoConsultas += 1;
    entry.historicoCostoUsd = Number((entry.historicoCostoUsd + costoUsd).toFixed(6));
    guardarStorePrecisionEnDisco(precisionStore);
  }

  return { inputTokens, outputTokens, costoUsd };
}

export interface ApiKeyCandidate {
  nombre: string;
  valorLimpio: string;
  vistaSegura: string;
  client: GoogleGenAI;
}

export interface IntentoModeloResultado {
  modelo: string;
  fuenteClave: string;
  ok: boolean;
  codigoHttp: number | string | null;
  estado: string;
  latenciaMs: number;
  respuestaModelo?: string;
  detalleError?: string;
}

let preferredModelState: ModeloPreferido =
  GEMINI_PRECISION_CATALOG[precisionStore.nivelPreferido].modelo;
let lastWorkingModel: string | null = null;
let lastWorkingKeySource: string | null = null;
let ultimoErrorGeminiGlobal: string | null = null;

// Cooldown temporal (60s) para combinaciones clave+modelo que devolvieron 402/429/404
const COOLDOWN_MS = 60_000;
const cooldownHasta = new Map<string, number>();

export function setPreferredGeminiModel(model: string | undefined): ModeloPreferido {
  updateGeminiPrecisionConfig({ modeloPreferido: model || 'auto' });
  return preferredModelState;
}

export function getPreferredGeminiModel(): ModeloPreferido {
  return preferredModelState;
}

export function getLastWorkingGeminiInfo(options?: { esMaestro?: boolean }) {
  const precision = getGeminiPrecisionState(options);
  const pagosHabilitados = precision.modelosPagosHabilitados;
  return {
    modelo: pagosHabilitados ? lastWorkingModel || precision.modeloPreferido : OPENROUTER_FREE_MODEL,
    fuenteClave: pagosHabilitados ? lastWorkingKeySource : 'OPENROUTER_FREE',
    ultimoError: pagosHabilitados ? ultimoErrorGeminiGlobal : null,
    modeloPreferido: precision.modeloPreferido,
    nivelPreferido: precision.nivelPreferido,
    politicaLimite: precision.politicaLimite,
    modelosPagosHabilitados: precision.modelosPagosHabilitados,
    esUsuarioMaestro: precision.esUsuarioMaestro,
    costoTotalHoyUsd: precision.costoTotalHoyUsd,
    consultasTotalesHoy: precision.consultasTotalesHoy,
    costoHistoricoUsd: precision.costoHistoricoUsd,
    modelos: precision.modelos,
    precisionState: precision,
    modelosTextoDisponibles: pagosHabilitados ? [...DEFAULT_TEXT_MODELS] : [OPENROUTER_FREE_MODEL],
    modelosAudioDisponibles: pagosHabilitados ? [...DEFAULT_AUDIO_MODELS] : ['groq:whisper-large-v3-turbo'],
  };
}

export function clearUltimoErrorGemini() {
  ultimoErrorGeminiGlobal = null;
}

export function getUltimoErrorGemini(): string | null {
  return ultimoErrorGeminiGlobal;
}

export function setUltimoErrorGemini(msg: string | null) {
  ultimoErrorGeminiGlobal = msg;
}

export function limpiarValorApiKey(raw?: string): string {
  if (!raw) return '';
  let k = raw.trim();
  if (/^(GEMINI_API_KEY|API_KEY|GOOGLE_API_KEY)\s*=/i.test(k)) {
    k = k.replace(/^(GEMINI_API_KEY|API_KEY|GOOGLE_API_KEY)\s*=/i, '').trim();
  }
  k = k.replace(/^['"]+|['"]+$/g, '').trim();
  if (
    !k ||
    /MY_GEMINI_API_KEY/i.test(k) ||
    /^(YOUR_API_KEY|TU_CLAVE_AQUI|PLACEHOLDER)$/i.test(k)
  ) {
    return '';
  }
  return k;
}

export function sanitizarTextoError(raw: unknown): string {
  return String(raw || 'Error desconocido')
    .replace(/AIza[0-9A-Za-z_-]{16,}/g, '[KEY]')
    .replace(/AQ\.[0-9A-Za-z._-]{16,}/g, '[KEY]');
}

export function inspeccionarVariableClave(nombre: string, raw?: string) {
  const trimmed = (raw || '')
    .trim()
    .replace(/^(GEMINI_API_KEY|API_KEY|GOOGLE_API_KEY)\s*=/i, '')
    .replace(/^['"]+|['"]+$/g, '')
    .trim();
  const definida = trimmed.length > 0;
  const esPlantilla =
    /MY_GEMINI_API_KEY/i.test(trimmed) ||
    /^(YOUR_API_KEY|TU_CLAVE_AQUI|PLACEHOLDER)$/i.test(trimmed);
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

export function crearClienteGemini(apiKey: string): GoogleGenAI {
  return new GoogleGenAI({
    apiKey,
    httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
  });
}

export function obtenerCandidatosApiKeys(): ApiKeyCandidate[] {
  const vistasPorValor = new Map<string, ApiKeyCandidate>();

  const registrar = (nombre: string, raw?: string) => {
    const info = inspeccionarVariableClave(nombre, raw);
    if (!info.validaParaUso || !info.valorLimpio) return;
    if (vistasPorValor.has(info.valorLimpio)) return;
    try {
      const client = crearClienteGemini(info.valorLimpio);
      vistasPorValor.set(info.valorLimpio, {
        nombre: info.nombre,
        valorLimpio: info.valorLimpio,
        vistaSegura: info.vistaSegura,
        client,
      });
    } catch (err) {
      console.warn(`[Gemini SDK] No se pudo inicializar cliente para ${nombre}:`, err);
    }
  };

  registrar('API_KEY', process.env.API_KEY);
  registrar('GEMINI_API_KEY', process.env.GEMINI_API_KEY);
  registrar('GOOGLE_API_KEY', process.env.GOOGLE_API_KEY);
  registrar('VITE_GEMINI_API_KEY', process.env.VITE_GEMINI_API_KEY);

  for (const [nombre, raw] of Object.entries(process.env)) {
    const cleaned = limpiarValorApiKey(raw);
    if ((cleaned.startsWith('AIza') || cleaned.startsWith('AQ.')) && cleaned.length >= 30) {
      registrar(nombre, raw);
    }
  }

  return Array.from(vistasPorValor.values());
}

export function obtenerResumenVariablesEntorno() {
  const infoApiKey = inspeccionarVariableClave('API_KEY', process.env.API_KEY);
  const infoGeminiKey = inspeccionarVariableClave('GEMINI_API_KEY', process.env.GEMINI_API_KEY);
  const infoGoogleKey = inspeccionarVariableClave('GOOGLE_API_KEY', process.env.GOOGLE_API_KEY);
  const infoViteKey = inspeccionarVariableClave('VITE_GEMINI_API_KEY', process.env.VITE_GEMINI_API_KEY);

  return {
    variablesEntorno: {
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
    },
    infoApiKey,
    infoGeminiKey,
    infoGoogleKey,
    infoViteKey,
    hayPlantillaIgnorada: infoApiKey.esPlantilla || infoGeminiKey.esPlantilla,
  };
}

export function clasificarErrorGemini(err: any): {
  codigoHttp: number | string | null;
  estado: string;
  mensaje: string;
  esRetriable: boolean;
} {
  const raw = String(err?.message || err || 'Error desconocido');
  const msg = sanitizarTextoError(raw);
  let status: number | string | null = err?.status ?? err?.code ?? null;

  if (status == null) {
    const m = msg.match(/"code"\s*:\s*(\d{3})|HTTP\s+(\d{3})/i);
    if (m) status = Number(m[1] || m[2]);
  }

  if (
    status === 402 ||
    /prepayment credits are depleted|billing#prepay|PAYMENT_REQUIRED|\b402\b/i.test(msg)
  ) {
    return {
      codigoHttp: status || 402,
      estado: 'CREDITOS_AGOTADOS',
      mensaje: msg,
      esRetriable: true,
    };
  }

  if (/API_KEY_INVALID|API key not valid/i.test(msg)) {
    return {
      codigoHttp: status || 400,
      estado: 'CLAVE_INVALIDA',
      mensaje: msg,
      esRetriable: true,
    };
  }

  if (/PERMISSION_DENIED|403|401/i.test(msg) || status === 403 || status === 401) {
    return {
      codigoHttp: status || 403,
      estado: 'PERMISO_DENEGADO',
      mensaje: msg,
      esRetriable: true,
    };
  }

  if (/RESOURCE_EXHAUSTED|429|quota|rate limit/i.test(msg) || status === 429) {
    return {
      codigoHttp: status || 429,
      estado: 'CUOTA_EXCEDIDA',
      mensaje: msg,
      esRetriable: true,
    };
  }

  if (/NOT_FOUND|404/i.test(msg) || status === 404) {
    return {
      codigoHttp: status || 404,
      estado: 'MODELO_NO_ENCONTRADO',
      mensaje: msg,
      esRetriable: true,
    };
  }

  if (/Timeout|ETIMEDOUT|ECONNRESET|fetch failed|503|502|500|UNAVAILABLE/i.test(msg) || status === 503 || status === 500) {
    return {
      codigoHttp: status || 503,
      estado: 'ERROR_TEMPORAL',
      mensaje: msg,
      esRetriable: true,
    };
  }

  return {
    codigoHttp: status,
    estado: 'ERROR_CONEXION',
    mensaje: msg,
    esRetriable: true,
  };
}

export function formatearAvisoErrorGemini(err: any, modeloIntentado?: string): string {
  const { codigoHttp, estado, mensaje } = clasificarErrorGemini(err);
  ultimoErrorGeminiGlobal = `${codigoHttp ? `[${codigoHttp}] ` : ''}${mensaje}`;
  const modTxt = modeloIntentado ? ` (${modeloIntentado})` : '';

  if (estado === 'CREDITOS_AGOTADOS') {
    return (
      `> ⚠️ **Créditos prepagos agotados en Google AI Studio (HTTP 402${modTxt}):** ` +
      `Se probaron los modelos configurados (${DEFAULT_TEXT_MODELS.join(', ')}), pero la cuenta/clave activa indica créditos agotados (\`RESOURCE_EXHAUSTED\`). ` +
      `Recarga créditos en AI Studio o actualiza la clave en **Settings > Secrets**.\n\n`
    );
  }
  if (estado === 'CLAVE_INVALIDA' || estado === 'PERMISO_DENEGADO') {
    return (
      `> ⚠️ **Error de autenticación con Gemini (${codigoHttp || '403'}${modTxt}):** ` +
      `La clave configurada fue rechazada por Google. Verifica en **Settings > Secrets** que sea una clave válida con acceso al proyecto y recarga la aplicación.\n\n`
    );
  }
  if (estado === 'CUOTA_EXCEDIDA') {
    return (
      `> ⚠️ **Límite de cuota / RPM alcanzado en todos los modelos (${codigoHttp || '429'}):** \`${mensaje.slice(0, 180)}\`.\n\n`
    );
  }
  if (estado === 'MODELO_NO_ENCONTRADO') {
    return (
      `> ⚠️ **Modelo no disponible (404${modTxt}):** \`${mensaje.slice(0, 180)}\`.\n\n`
    );
  }
  return `> ⚠️ **Gemini no pudo responder esta consulta${modTxt}:** \`${mensaje.slice(0, 220)}\`\n\n`;
}

export function adaptarConfigParaModelo(
  model: string,
  config?: GenerateContentConfig
): GenerateContentConfig | undefined {
  if (!config) return undefined;
  const cloned: GenerateContentConfig = { ...config };

  if (cloned.thinkingConfig) {
    if (model === AUDIO_TRANSCRIBE_MODEL) {
      delete cloned.thinkingConfig;
    } else if (model === LITE_GEMINI_MODEL) {
      const level = cloned.thinkingConfig.thinkingLevel;
      const safeLevel =
        level === ThinkingLevel.MEDIUM || level === ThinkingLevel.HIGH
          ? ThinkingLevel.LOW
          : level === ThinkingLevel.LOW
            ? ThinkingLevel.LOW
            : ThinkingLevel.MINIMAL;
      cloned.thinkingConfig = { ...cloned.thinkingConfig, thinkingLevel: safeLevel };
    } else {
      // gemini-4-hydrogen / gemini-4-neon no admiten ThinkingLevel.MINIMAL
      const level = cloned.thinkingConfig.thinkingLevel;
      const safeLevel =
        !level || level === ThinkingLevel.MINIMAL ? ThinkingLevel.LOW : level;
      cloned.thinkingConfig = { ...cloned.thinkingConfig, thinkingLevel: safeLevel };
    }
  }

  return cloned;
}

function resolverOrdenModelos(params: {
  modelos?: readonly string[];
  model?: string;
  preferredModel?: string;
  isAudio?: boolean;
  omitirOrdenDinamico?: boolean;
}): string[] {
  if (params.modelos && params.modelos.length > 0) {
    return Array.from(new Set(params.modelos));
  }
  if (params.isAudio) {
    return [...DEFAULT_AUDIO_MODELS];
  }
  // Si el llamador solicita un modelo explícito (por nivel de precisión), respetar exactamente ese modelo sin escalar a modelos más caros
  if (params.model) {
    return [params.model];
  }
  // Por defecto para tareas automáticas / background: siempre económico flash-lite primero para proteger costos
  const baseList: string[] = [LITE_GEMINI_MODEL];
  const pref = params.preferredModel;
  if (pref && pref !== 'auto' && !baseList.includes(pref)) {
    return [pref, LITE_GEMINI_MODEL];
  }
  return baseList;
}

function construirParesCandidatos(params: {
  aiOverride?: GoogleGenAI | null;
  modelos: string[];
  omitirCooldown?: boolean;
}): Array<{ keySource: string; vistaSegura: string; client: GoogleGenAI; model: string; inCooldown: boolean }> {
  const envCandidates = obtenerCandidatosApiKeys();
  const keyCandidates: Array<{ keySource: string; vistaSegura: string; client: GoogleGenAI }> =
    envCandidates.map(c => ({
      keySource: c.nombre,
      vistaSegura: c.vistaSegura,
      client: c.client,
    }));

  if (keyCandidates.length === 0 && params.aiOverride) {
    keyCandidates.push({
      keySource: 'CLIENT_ACTIVO',
      vistaSegura: '(inyectado)',
      client: params.aiOverride,
    });
  }

  // Si hay última clave funcionando, probarla primero
  if (!params.omitirCooldown && lastWorkingKeySource) {
    keyCandidates.sort((a, b) =>
      a.keySource === lastWorkingKeySource ? -1 : b.keySource === lastWorkingKeySource ? 1 : 0
    );
  }

  const now = Date.now();
  const pares: Array<{
    keySource: string;
    vistaSegura: string;
    client: GoogleGenAI;
    model: string;
    inCooldown: boolean;
  }> = [];

  for (const kc of keyCandidates) {
    for (const model of params.modelos) {
      const ck = `${kc.keySource}::${model}`;
      const until = cooldownHasta.get(ck) || 0;
      pares.push({
        ...kc,
        model,
        inCooldown: !params.omitirCooldown && until > now,
      });
    }
  }

  if (params.omitirCooldown) return pares;
  const activos = pares.filter(p => !p.inCooldown);
  const enfriando = pares.filter(p => p.inCooldown);
  return [...activos, ...enfriando];
}

/**
 * Si se rota a una clave secundaria distinta a la primaria, descarta `fileData.fileUri`
 * porque los URIs de Files API pertenecen al proyecto de la clave que los subió.
 */
function sanitizarContentsParaClaveSecundaria(contents: any, esClavePrimaria: boolean): any {
  if (esClavePrimaria || !contents) return contents;
  if (Array.isArray(contents)) {
    return contents
      .map((item: any) => {
        if (item && typeof item === 'object' && Array.isArray(item.parts)) {
          return {
            ...item,
            parts: item.parts.filter((p: any) => !(p && typeof p === 'object' && 'fileData' in p)),
          };
        }
        return item;
      })
      .filter((item: any) => !(item && typeof item === 'object' && 'fileData' in item));
  }
  if (typeof contents === 'object' && Array.isArray(contents.parts)) {
    return {
      ...contents,
      parts: contents.parts.filter((p: any) => !(p && typeof p === 'object' && 'fileData' in p)),
    };
  }
  return contents;
}

function extraerTextoDesdeContentsParaOpenRouter(contents: any): {
  parts: Array<{ text: string }>;
  tieneBinarios: boolean;
} {
  const parts: Array<{ text: string }> = [];
  let tieneBinarios = false;

  const visitarPart = (p: any) => {
    if (!p) return;
    if (typeof p === 'string') {
      if (p.trim()) parts.push({ text: p });
      return;
    }
    if (typeof p === 'object') {
      if (typeof p.text === 'string' && p.text.trim()) {
        parts.push({ text: p.text });
      }
      if ('inlineData' in p || 'fileData' in p) {
        tieneBinarios = true;
      }
      if (Array.isArray(p.parts)) {
        for (const sub of p.parts) visitarPart(sub);
      }
    }
  };

  if (Array.isArray(contents)) {
    for (const item of contents) visitarPart(item);
  } else {
    visitarPart(contents);
  }

  return { parts, tieneBinarios };
}

function extraerSystemInstructionTexto(si: unknown): string {
  if (!si) return 'Eres un asistente técnico experto en ingeniería de obras de Alta Tensión 132 kV en español.';
  if (typeof si === 'string') return si;
  if (typeof si === 'object' && Array.isArray((si as any).parts)) {
    return (si as any).parts
      .map((p: any) => (typeof p?.text === 'string' ? p.text : ''))
      .filter(Boolean)
      .join('\n') || 'Eres un asistente técnico experto en ingeniería de obras de Alta Tensión 132 kV en español.';
  }
  return String(si);
}

export async function generarContenidoConFallback(params: {
  ai?: GoogleGenAI | null;
  contents: any;
  config?: GenerateContentConfig;
  model?: string;
  modelos?: readonly string[];
  preferredModel?: string;
  isAudio?: boolean;
  timeoutMs?: number;
  omitirCooldown?: boolean;
}): Promise<{
  response: GenerateContentResponse;
  modelUsed: string;
  keySourceUsed: string;
  intentos: IntentoModeloResultado[];
}> {
  if (!precisionStore.modelosPagosHabilitados) {
    const { parts, tieneBinarios } = extraerTextoDesdeContentsParaOpenRouter(params.contents);
    if (!tieneBinarios && !params.isAudio && parts.length > 0 && tieneOpenRouterConfigurado()) {
      const t0 = Date.now();
      const wantsJson = params.config?.responseMimeType === 'application/json';
      let sysInst = extraerSystemInstructionTexto(params.config?.systemInstruction);
      if (wantsJson) {
        sysInst += '\nIMPORTANTE: Devuelve ÚNICAMENTE un objeto o arreglo JSON válido sin texto extra ni bloques markdown.';
      }
      const orRes = await generarChatOpenRouter({
        parts,
        systemInstruction: sysInst,
        model: getOpenRouterModeloPreferido(),
        timeoutMs: params.timeoutMs || 45000,
      });
      let finalText = orRes.texto.trim();
      if (wantsJson) {
        finalText = finalText
          .replace(/^```(?:json)?\s*/i, '')
          .replace(/```\s*$/i, '')
          .trim();
      }
      registrarConsumoGemini({
        modelo: OPENROUTER_FREE_MODEL,
        inputTokensDirecto: orRes.inputTokens,
        outputTokensDirecto: orRes.outputTokens,
      });
      return {
        response: { text: finalText } as unknown as GenerateContentResponse,
        modelUsed: orRes.modelUsed,
        keySourceUsed: orRes.keySourceUsed,
        intentos: [
          {
            modelo: orRes.modelUsed,
            fuenteClave: orRes.keySourceUsed,
            ok: true,
            codigoHttp: 200,
            estado: 'OPENROUTER_FREE',
            latenciaMs: Date.now() - t0,
            respuestaModelo: finalText.slice(0, 60),
          },
        ],
      };
    }

    const disabledErr: any = new Error(
      'PAID_MODELS_DISABLED: Los modelos pagos están desactivados por el administrador maestro; solo el motor gratuito está habilitado.'
    );
    disabledErr.status = 403;
    throw disabledErr;
  }

  const modelos = resolverOrdenModelos({
    modelos: params.modelos,
    model: params.model,
    preferredModel: params.preferredModel,
    isAudio: params.isAudio,
    omitirOrdenDinamico: params.omitirCooldown,
  });

  const pares = construirParesCandidatos({
    aiOverride: params.ai,
    modelos,
    omitirCooldown: params.omitirCooldown,
  });

  if (pares.length === 0) {
    throw new Error('NO_API_KEY: No se detectó una clave válida de Gemini en el servidor.');
  }

  const primaryKeySource = pares[0].keySource;
  const intentos: IntentoModeloResultado[] = [];
  let ultimoError: any = null;

  for (const par of pares) {
    const t0 = Date.now();
    try {
      const contentsSeguros = sanitizarContentsParaClaveSecundaria(
        params.contents,
        par.keySource === primaryKeySource
      );
      const configAdaptada = adaptarConfigParaModelo(par.model, params.config);

      const callPromise = par.client.models.generateContent({
        model: par.model,
        contents: contentsSeguros,
        ...(configAdaptada ? { config: configAdaptada } : {}),
      });

      const response = params.timeoutMs
        ? await Promise.race([
            callPromise,
            new Promise<never>((_, reject) =>
              setTimeout(
                () => reject(new Error(`Timeout Gemini ${par.model} (${params.timeoutMs}ms)`)),
                params.timeoutMs
              )
            ),
          ])
        : await callPromise;

      lastWorkingModel = par.model;
      lastWorkingKeySource = par.keySource;
      ultimoErrorGeminiGlobal = null;
      cooldownHasta.delete(`${par.keySource}::${par.model}`);

      intentos.push({
        modelo: par.model,
        fuenteClave: par.keySource,
        ok: true,
        codigoHttp: 200,
        estado: 'CONECTADA',
        latenciaMs: Date.now() - t0,
        respuestaModelo: (response.text || '').trim().slice(0, 60),
      });

      return {
        response,
        modelUsed: par.model,
        keySourceUsed: par.keySource,
        intentos,
      };
    } catch (err: any) {
      ultimoError = err;
      const infoErr = clasificarErrorGemini(err);
      if (
        infoErr.estado === 'CREDITOS_AGOTADOS' ||
        infoErr.estado === 'CUOTA_EXCEDIDA' ||
        infoErr.estado === 'MODELO_NO_ENCONTRADO' ||
        infoErr.estado === 'CLAVE_INVALIDA' ||
        infoErr.estado === 'PERMISO_DENEGADO'
      ) {
        cooldownHasta.set(`${par.keySource}::${par.model}`, Date.now() + COOLDOWN_MS);
      }
      ultimoErrorGeminiGlobal = `${infoErr.codigoHttp ? `[${infoErr.codigoHttp}] ` : ''}${infoErr.mensaje}`;
      intentos.push({
        modelo: par.model,
        fuenteClave: par.keySource,
        ok: false,
        codigoHttp: infoErr.codigoHttp,
        estado: infoErr.estado,
        latenciaMs: Date.now() - t0,
        detalleError: infoErr.mensaje.slice(0, 260),
      });
      console.warn(
        `[Gemini Fallback] Falló ${par.model} (${par.keySource}) [${infoErr.estado} ${infoErr.codigoHttp || ''}]: ${infoErr.mensaje.slice(0, 160)}`
      );
    }
  }

  if (ultimoError && typeof ultimoError === 'object') {
    (ultimoError as any).intentosGemini = intentos;
  }
  throw ultimoError || new Error('Todos los modelos de Gemini fallaron.');
}

export async function generarStreamConFallback(params: {
  ai?: GoogleGenAI | null;
  contents: any;
  config?: GenerateContentConfig;
  model?: string;
  modelos?: readonly string[];
  preferredModel?: string;
}): Promise<{
  stream: AsyncIterable<GenerateContentResponse>;
  modelUsed: string;
  keySourceUsed: string;
  intentos: IntentoModeloResultado[];
}> {
  if (!precisionStore.modelosPagosHabilitados) {
    const disabledErr: any = new Error(
      'PAID_MODELS_DISABLED: Los modelos pagos están desactivados por el administrador maestro; solo el motor gratuito está habilitado.'
    );
    disabledErr.status = 403;
    throw disabledErr;
  }
  const modelos = resolverOrdenModelos({
    modelos: params.modelos,
    model: params.model,
    preferredModel: params.preferredModel,
  });

  const pares = construirParesCandidatos({
    aiOverride: params.ai,
    modelos,
  });

  if (pares.length === 0) {
    throw new Error('NO_API_KEY: No se detectó una clave válida de Gemini en el servidor.');
  }

  const primaryKeySource = pares[0].keySource;
  const intentos: IntentoModeloResultado[] = [];
  let ultimoError: any = null;

  for (const par of pares) {
    const t0 = Date.now();
    try {
      const contentsSeguros = sanitizarContentsParaClaveSecundaria(
        params.contents,
        par.keySource === primaryKeySource
      );
      const configAdaptada = adaptarConfigParaModelo(par.model, params.config);

      const rawStream = await par.client.models.generateContentStream({
        model: par.model,
        contents: contentsSeguros,
        ...(configAdaptada ? { config: configAdaptada } : {}),
      });

      const iter = rawStream[Symbol.asyncIterator]();
      const firstResult = await iter.next();

      lastWorkingModel = par.model;
      lastWorkingKeySource = par.keySource;
      ultimoErrorGeminiGlobal = null;
      cooldownHasta.delete(`${par.keySource}::${par.model}`);

      intentos.push({
        modelo: par.model,
        fuenteClave: par.keySource,
        ok: true,
        codigoHttp: 200,
        estado: 'CONECTADA',
        latenciaMs: Date.now() - t0,
      });

      const wrappedStream: AsyncIterable<GenerateContentResponse> = {
        async *[Symbol.asyncIterator]() {
          if (!firstResult.done && firstResult.value) {
            yield firstResult.value;
          }
          while (true) {
            const next = await iter.next();
            if (next.done) break;
            if (next.value) yield next.value;
          }
        },
      };

      return {
        stream: wrappedStream,
        modelUsed: par.model,
        keySourceUsed: par.keySource,
        intentos,
      };
    } catch (err: any) {
      ultimoError = err;
      const infoErr = clasificarErrorGemini(err);
      if (
        infoErr.estado === 'CREDITOS_AGOTADOS' ||
        infoErr.estado === 'CUOTA_EXCEDIDA' ||
        infoErr.estado === 'MODELO_NO_ENCONTRADO' ||
        infoErr.estado === 'CLAVE_INVALIDA' ||
        infoErr.estado === 'PERMISO_DENEGADO'
      ) {
        cooldownHasta.set(`${par.keySource}::${par.model}`, Date.now() + COOLDOWN_MS);
      }
      ultimoErrorGeminiGlobal = `${infoErr.codigoHttp ? `[${infoErr.codigoHttp}] ` : ''}${infoErr.mensaje}`;
      intentos.push({
        modelo: par.model,
        fuenteClave: par.keySource,
        ok: false,
        codigoHttp: infoErr.codigoHttp,
        estado: infoErr.estado,
        latenciaMs: Date.now() - t0,
        detalleError: infoErr.mensaje.slice(0, 260),
      });
      console.warn(
        `[Gemini Stream Fallback] Falló ${par.model} (${par.keySource}) [${infoErr.estado} ${infoErr.codigoHttp || ''}]: ${infoErr.mensaje.slice(0, 160)}`
      );
    }
  }

  if (ultimoError && typeof ultimoError === 'object') {
    (ultimoError as any).intentosGemini = intentos;
  }
  throw ultimoError || new Error('Todos los modelos de Gemini fallaron en streaming.');
}
