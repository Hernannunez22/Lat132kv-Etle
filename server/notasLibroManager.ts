import fs from 'fs';
import path from 'path';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import {
  ActorNotaLibro,
  EstadoRespuestaNota,
  NotaLibro,
  SentidoNotaLibro,
  TipoNotaLibro,
} from '../src/types';
import { CACHE_DIR, asegurarDirectorioCache, normalizarTextoBusqueda } from './pliegoProcessor';
import { normalizarFechaIso } from './minutasManager';
import { generarContenidoConFallback } from './geminiClient';
import { analizarYExpandirConsulta } from './semanticSearch';

const STORE_NOTAS_LIBRO_PATH = path.join(CACHE_DIR, 'notas_libro_store.json');

export function cargarStoreNotasLibro(): NotaLibro[] {
  try {
    asegurarDirectorioCache();
    if (fs.existsSync(STORE_NOTAS_LIBRO_PATH)) {
      const raw = fs.readFileSync(STORE_NOTAS_LIBRO_PATH, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (err) {
    console.warn('[NotasLibro] Error cargando store en disco:', err);
  }
  return [];
}

export function guardarStoreNotasLibro(lista: NotaLibro[]) {
  try {
    asegurarDirectorioCache();
    fs.writeFileSync(STORE_NOTAS_LIBRO_PATH, JSON.stringify(lista, null, 2), 'utf8');
  } catch (err) {
    console.warn('[NotasLibro] Error guardando store en disco:', err);
  }
}

export function normalizarActorNota(raw?: string): ActorNotaLibro {
  const n = normalizarTextoBusqueda(raw || '');
  if (!n) return 'Otro';
  if (n.includes('transnoa') || n.includes('transportadora')) return 'TRANSNOA';
  if (
    n.includes('ute') ||
    n.includes('contratista') ||
    n.includes('constructor') ||
    n.includes('subcontratista') ||
    n.includes('empresa ejecut')
  ) {
    return 'UTE / Contratista';
  }
  if (n.includes('inspecc') || n.includes('sobrestante') || n.includes('supervisor')) {
    return 'Inspección';
  }
  if (
    n.includes('comitente') ||
    n.includes('secretaria') ||
    n.includes('ministerio') ||
    n.includes('provincia') ||
    n.includes('edet') ||
    n.includes('ente')
  ) {
    return 'Comitente';
  }
  if (n.includes('proyect') || n.includes('ingenier')) return 'Proyectista';
  if (
    n.includes('tgn') ||
    n.includes('vialidad') ||
    n.includes('gasnor') ||
    n.includes('ferrocarril') ||
    n.includes('trenes') ||
    n.includes('dnv') ||
    n.includes('dpv')
  ) {
    return 'Organismo Externo';
  }
  return 'Otro';
}

export function normalizarTipoNota(raw?: string, nombreArchivo?: string, rutaCarpeta?: string): TipoNotaLibro {
  const n = normalizarTextoBusqueda(`${raw || ''} ${nombreArchivo || ''} ${rutaCarpeta || ''}`);
  if (n.includes('nota de pedido') || /\bnp[-_\s]*\d+/i.test(n)) return 'Nota de Pedido';
  if (n.includes('orden de servicio') || /\bos[-_\s]*\d+/i.test(n)) return 'Orden de Servicio';
  if (n.includes('nota de servicio') || /\bns[-_\s]*\d+/i.test(n)) return 'Nota de Servicio';
  if (n.includes('contestacion') || n.includes('respuesta') || n.includes('descargo') || n.includes('devolucion')) {
    return 'Contestación';
  }
  if (n.includes('comunicacion') || n.includes('nota') || n.includes('libro')) return 'Comunicación';
  return 'Otro';
}

export function canonicalizarCodigoNota(raw: string): string {
  const s = (raw || '').toUpperCase().replace(/\s+/g, ' ').trim();
  if (!s) return '';
  const m = s.match(/\b(NP|OS|NS|NC|NT|LIB|NOT|COM)\s*(?:N[°ºO.]*)?\s*[-_/.\s]?\s*(\d{1,4})(?:[\/\-](\d{2,4}))?\b/i);
  if (m) {
    const pref = m[1].toUpperCase();
    const num = m[2].padStart(3, '0');
    return `${pref}-${num}`;
  }
  return s.replace(/[^\w\-/]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}

export function extraerReferenciasNotasTexto(texto: string, codigoPropio?: string): string[] {
  if (!texto) return [];
  const encontrado = new Set<string>();
  const propioCanon = codigoPropio ? canonicalizarCodigoNota(codigoPropio) : '';

  const patrones = [
    /\b(?:Nota\s+de\s+Pedido|N\.?P\.?)\s*(?:N[°ºo.]*)?\s*[-_/.\s]*(\d{1,4})\b/gi,
    /\b(?:Orden\s+de\s+Servicio|O\.?S\.?)\s*(?:N[°ºo.]*)?\s*[-_/.\s]*(\d{1,4})\b/gi,
    /\b(?:Nota\s+de\s+Servicio|N\.?S\.?)\s*(?:N[°ºo.]*)?\s*[-_/.\s]*(\d{1,4})\b/gi,
    /\b(NP|OS|NS)\s*[-_.]?\s*(\d{1,4})\b/gi,
  ];

  for (let i = 0; i < patrones.length; i++) {
    const rx = patrones[i];
    let match: RegExpExecArray | null;
    while ((match = rx.exec(texto)) !== null) {
      let canon = '';
      if (i === 0) canon = `NP-${match[1].padStart(3, '0')}`;
      else if (i === 1) canon = `OS-${match[1].padStart(3, '0')}`;
      else if (i === 2) canon = `NS-${match[1].padStart(3, '0')}`;
      else canon = `${match[1].toUpperCase()}-${match[2].padStart(3, '0')}`;

      if (canon && canon !== propioCanon) {
        encontrado.add(canon);
      }
      if (encontrado.size >= 30) break;
    }
  }

  return Array.from(encontrado);
}

function extraerCodigoPropioHeuristico(
  nombreArchivo: string,
  rutaCarpeta: string,
  texto: string,
  tipo: TipoNotaLibro
): string {
  const cabecera = `${nombreArchivo} ${texto.slice(0, 1200)}`;
  const m = cabecera.match(
    /\b(NP|OS|NS|Nota\s+de\s+Pedido|Orden\s+de\s+Servicio|Nota\s+de\s+Servicio)\s*(?:N[°ºo.]*)?\s*[-_/.\s]*(\d{1,4})\b/i
  );
  if (m) {
    const rawPref = m[1].toUpperCase();
    const pref = rawPref.includes('PEDIDO') || rawPref === 'NP'
      ? 'NP'
      : rawPref.includes('ORDEN') || rawPref === 'OS'
        ? 'OS'
        : rawPref.includes('SERVICIO') || rawPref === 'NS'
          ? 'NS'
          : 'NOT';
    return `${pref}-${m[2].padStart(3, '0')}`;
  }

  const mSoloNum = nombreArchivo.match(/\b(\d{1,4})\b/);
  if (mSoloNum) {
    const pref =
      tipo === 'Nota de Pedido'
        ? 'NP'
        : tipo === 'Orden de Servicio'
          ? 'OS'
          : tipo === 'Nota de Servicio'
            ? 'NS'
            : 'LIB';
    return `${pref}-${mSoloNum[1].padStart(3, '0')}`;
  }

  const cleanName = nombreArchivo.replace(/\.[^/.]+$/, '').slice(0, 28);
  const full = `${cleanName || rutaCarpeta}`.trim();
  return full ? `LIB-${full.replace(/[^\w\-]+/g, '_').slice(0, 24)}` : `LIB-${Date.now().toString(36)}`;
}

function inferirMetadatosHeuristica(params: {
  nombreArchivo: string;
  rutaCarpeta: string;
  texto: string;
  fechaDrive?: string;
}): {
  codigo: string;
  tipoNota: TipoNotaLibro;
  titulo: string;
  fecha: string;
  actorEmisor: ActorNotaLibro;
  emisorDetalle: string;
  actorReceptor: ActorNotaLibro;
  receptorDetalle: string;
  sentido: SentidoNotaLibro;
  frente: string;
  referenciasNotas: string[];
  preguntasOPuntos: string[];
  respuestasODescargos: string[];
  resumen: string;
} {
  const { nombreArchivo, rutaCarpeta, texto, fechaDrive } = params;
  const limpio = (texto || '').replace(/\r/g, '');
  const tipoNota = normalizarTipoNota('', nombreArchivo, rutaCarpeta);
  const codigo = extraerCodigoPropioHeuristico(nombreArchivo, rutaCarpeta, limpio, tipoNota);

  const fechaMatch = limpio.slice(0, 2000).match(/\b(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})\b/);
  const fecha = fechaMatch ? normalizarFechaIso(fechaMatch[1], fechaDrive) : normalizarFechaIso(fechaDrive);

  const cabeceraLower = normalizarTextoBusqueda(`${nombreArchivo} ${rutaCarpeta} ${limpio.slice(0, 2200)}`);

  // Detectar emisor y receptor
  let emisorDetalle = '';
  let receptorDetalle = '';

  const emisorMatch = limpio.match(/(?:De|Emisor|Remitente|Suscribe|Firma)\s*[:\-]\s*([^\n]{3,90})/i);
  if (emisorMatch) emisorDetalle = emisorMatch[1].trim();

  const receptorMatch = limpio.match(/(?:Para|A|Destinatario|Sres\.?|Señores)\s*[:\-]\s*([^\n]{3,90})/i);
  if (receptorMatch) receptorDetalle = receptorMatch[1].trim();

  let actorEmisor: ActorNotaLibro = normalizarActorNota(emisorDetalle);
  let actorReceptor: ActorNotaLibro = normalizarActorNota(receptorDetalle);

  if (actorEmisor === 'Otro') {
    if (tipoNota === 'Orden de Servicio') {
      actorEmisor = cabeceraLower.includes('transnoa') ? 'TRANSNOA' : 'Inspección';
    } else if (tipoNota === 'Nota de Pedido') {
      actorEmisor = 'UTE / Contratista';
    } else if (cabeceraLower.includes('de: transnoa') || cabeceraLower.includes('transnoa') && !cabeceraLower.includes('sres. transnoa')) {
      actorEmisor = 'TRANSNOA';
    } else if (cabeceraLower.includes('ute') || cabeceraLower.includes('contratista')) {
      actorEmisor = 'UTE / Contratista';
    }
  }

  if (actorReceptor === 'Otro') {
    if (cabeceraLower.includes('sres. transnoa') || cabeceraLower.includes('a: transnoa') || cabeceraLower.includes('para: transnoa') || (actorEmisor === 'UTE / Contratista' && cabeceraLower.includes('transnoa'))) {
      actorReceptor = 'TRANSNOA';
    } else if (actorEmisor === 'TRANSNOA' || actorEmisor === 'Inspección') {
      actorReceptor = 'UTE / Contratista';
    } else if (actorEmisor === 'UTE / Contratista') {
      actorReceptor = 'Inspección';
    }
  }

  if (!emisorDetalle) emisorDetalle = actorEmisor;
  if (!receptorDetalle) receptorDetalle = actorReceptor;

  let sentido: SentidoNotaLibro = 'informativa';
  if (/\b(solicit|consult|requier|pedimos|solicitamos|pregunt|aclarac|aprobaci[oó]n|elevamos)\b/i.test(limpio)) {
    sentido = 'pregunta_solicitud';
  }
  if (/\b(en\s+respuesta\s+a|contestaci[oó]n|devoluci[oó]n|devuelve|se\s+responde|damos\s+respuesta|ref\.?\s*(?:np|ns|os)|observamos|rechaza|aprobamos\s+con\s+observ)\b/i.test(limpio)) {
    sentido = 'respuesta_devolucion';
  } else if (tipoNota === 'Orden de Servicio' && /\b(intima|ordena|corregir|subsanar|discrep|incumpl)\b/i.test(limpio)) {
    sentido = 'intimacion_observacion';
  } else if (tipoNota === 'Nota de Pedido' && sentido === 'informativa') {
    sentido = 'pregunta_solicitud';
  }

  let frente = 'Obra General 132 kV';
  if (/bracho|quinteros|\blat\b|traza|linea/i.test(limpio)) frente = 'LAT El Bracho - Villa Quinteros';
  else if (/et\s+villa|quinteros|subestacion|estacion/i.test(limpio)) frente = 'ET Villa Quinteros / El Bracho';

  const referenciasNotas = extraerReferenciasNotasTexto(`${nombreArchivo}\n${limpio}`, codigo);

  const preguntasOPuntos: string[] = [];
  const respuestasODescargos: string[] = [];

  for (const linea of limpio.split('\n')) {
    const l = linea.trim().replace(/^[-•*\d.)\s]+/, '').trim();
    if (l.length < 12 || l.length > 260) continue;
    if (
      /(\?$|solicit|requier|consult|se\s+pide|informar|aprobar|definir|confirmar)/i.test(l) &&
      preguntasOPuntos.length < 10
    ) {
      preguntasOPuntos.push(l);
    } else if (
      /(responde|devuelve|se\s+aprueba|no\s+se\s+autoriza|observa|rechaza|corresponde|deber[aá]|presentar\s+nuevamente|en\s+respuesta)/i.test(l) &&
      respuestasODescargos.length < 10
    ) {
      respuestasODescargos.push(l);
    }
  }

  const titulo = `${codigo} · ${tipoNota} (${actorEmisor} ➔ ${actorReceptor})`;
  const resumen = limpio
    .replace(/\[Página \d+\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 420) || titulo;

  return {
    codigo,
    tipoNota,
    titulo,
    fecha,
    actorEmisor,
    emisorDetalle,
    actorReceptor,
    receptorDetalle,
    sentido,
    frente,
    referenciasNotas,
    preguntasOPuntos,
    respuestasODescargos,
    resumen,
  };
}

export async function analizarNotaLibroConIA(params: {
  id: string;
  nombreArchivo: string;
  rutaCarpeta?: string;
  texto: string;
  fechaDrive?: string;
  origen: 'drive' | 'archivo' | 'texto';
  driveFileId?: string;
  driveUrl?: string;
  driveModifiedTime?: string;
  ai: GoogleGenAI | null;
  model: string;
}): Promise<NotaLibro> {
  const {
    id,
    nombreArchivo,
    rutaCarpeta = '',
    texto,
    fechaDrive,
    origen,
    driveFileId,
    driveUrl,
    driveModifiedTime,
    ai,
    model,
  } = params;

  const base = inferirMetadatosHeuristica({
    nombreArchivo,
    rutaCarpeta,
    texto,
    fechaDrive,
  });

  if (ai && texto.trim().length >= 30) {
    try {
      const textoRecortado =
        texto.length > 20000
          ? `${texto.slice(0, 14000)}\n\n[... contenido intermedio omitido ...]\n\n${texto.slice(-6000)}`
          : texto;

      const { response: resp } = await generarContenidoConFallback({
        ai,
        model,
        contents: [
          {
            text:
              `Analiza esta comunicación del Libro de Obra / Libro de Comunicaciones (Nota de Pedido, Nota de Servicio, Orden de Servicio o Devolución).\n` +
              `Es CRÍTICO identificar exactamente QUIÉN EMITE la nota (actorEmisor: por ejemplo UTE / Contratista, TRANSNOA, Inspección, Comitente, Proyectista), A QUIÉN VA DIRIGIDA (actorReceptor), si plantea PREGUNTAS/SOLICITUDES o si RESPONDE/DEVUELVE/INTIMA respecto a otra nota anterior, y listar todas las referencias explícitas a otras notas (ej. NP-015, OS-008, NS-012).\n` +
              `Archivo: "${nombreArchivo}"\nCarpeta Drive: "${rutaCarpeta || 'N/A'}"\n\n` +
              `TEXTO COMPLETO:\n${textoRecortado}`,
          },
        ],
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              codigo: { type: Type.STRING, description: 'Código normalizado de la nota (ej. NP-015, OS-022, NS-010).' },
              tipoNota: {
                type: Type.STRING,
                description: 'Nota de Pedido | Nota de Servicio | Orden de Servicio | Comunicación | Contestación | Otro',
              },
              titulo: { type: Type.STRING, description: 'Título descriptivo breve de la nota y su objeto.' },
              fecha: { type: Type.STRING, description: 'Fecha de emisión YYYY-MM-DD.' },
              actorEmisor: {
                type: Type.STRING,
                description: 'UTE / Contratista | TRANSNOA | Inspección | Comitente | Proyectista | Organismo Externo | Otro',
              },
              emisorDetalle: { type: Type.STRING, description: 'Nombre o empresa exacta del firmante/emisor.' },
              actorReceptor: {
                type: Type.STRING,
                description: 'UTE / Contratista | TRANSNOA | Inspección | Comitente | Proyectista | Organismo Externo | Otro',
              },
              receptorDetalle: { type: Type.STRING, description: 'Destinatario exacto indicado en la nota.' },
              sentido: {
                type: Type.STRING,
                description: 'pregunta_solicitud | respuesta_devolucion | intimacion_observacion | informativa',
              },
              frente: { type: Type.STRING, description: 'Frente o tramo de obra involucrado.' },
              referenciasNotas: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'Códigos de otras notas mencionadas o contestadas en el texto (ej. NP-012, OS-004).',
              },
              preguntasOPuntos: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'Lista puntual de preguntas, pedidos, consultas o presentaciones formuladas en esta nota.',
              },
              respuestasODescargos: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'Lista puntual de respuestas, devoluciones, rechazos, observaciones o resoluciones emitidas en esta nota.',
              },
              resumen: {
                type: Type.STRING,
                description: 'Resumen claro de 2 a 4 oraciones especificando emisor, receptor, asunto y resolución/pedido.',
              },
            },
            required: [
              'codigo',
              'tipoNota',
              'titulo',
              'actorEmisor',
              'actorReceptor',
              'sentido',
              'referenciasNotas',
              'preguntasOPuntos',
              'respuestasODescargos',
              'resumen',
            ],
          },
        },
        timeoutMs: 15000,
      });

      const rawJson = (resp.text || '').trim();
      if (rawJson) {
        const parsed = JSON.parse(rawJson);
        const tipoFinal = normalizarTipoNota(parsed.tipoNota, nombreArchivo, rutaCarpeta);
        const codigoFinal = canonicalizarCodigoNota(parsed.codigo || base.codigo) || base.codigo;
        const emisorNorm = normalizarActorNota(parsed.actorEmisor || base.actorEmisor);
        const receptorNorm = normalizarActorNota(parsed.actorReceptor || base.actorReceptor);
        const sentidoVal: SentidoNotaLibro =
          parsed.sentido === 'pregunta_solicitud' ||
          parsed.sentido === 'respuesta_devolucion' ||
          parsed.sentido === 'intimacion_observacion' ||
          parsed.sentido === 'informativa'
            ? parsed.sentido
            : base.sentido;

        const refsCombinadas = Array.from(
          new Set([
            ...base.referenciasNotas,
            ...(Array.isArray(parsed.referenciasNotas)
              ? parsed.referenciasNotas.map((r: any) => canonicalizarCodigoNota(String(r))).filter(Boolean)
              : []),
          ])
        )
          .filter(r => r !== codigoFinal)
          .slice(0, 35);

        const preguntas = Array.isArray(parsed.preguntasOPuntos)
          ? parsed.preguntasOPuntos.map((x: any) => String(x).trim()).filter(Boolean).slice(0, 30)
          : base.preguntasOPuntos;

        const respuestas = Array.isArray(parsed.respuestasODescargos)
          ? parsed.respuestasODescargos.map((x: any) => String(x).trim()).filter(Boolean).slice(0, 30)
          : base.respuestasODescargos;

        return {
          id,
          codigo: codigoFinal,
          tipoNota: tipoFinal,
          titulo: String(parsed.titulo || base.titulo).trim().slice(0, 280),
          fecha: normalizarFechaIso(parsed.fecha, base.fecha),
          actorEmisor: emisorNorm,
          emisorDetalle: String(parsed.emisorDetalle || base.emisorDetalle || emisorNorm).trim().slice(0, 190),
          actorReceptor: receptorNorm,
          receptorDetalle: String(parsed.receptorDetalle || base.receptorDetalle || receptorNorm).trim().slice(0, 190),
          sentido: sentidoVal,
          frente: String(parsed.frente || base.frente).trim().slice(0, 110),
          referenciasNotas: refsCombinadas,
          respondeANotas: [],
          respondidaPorNotas: [],
          estadoRespuesta: sentidoVal === 'informativa' ? 'INFORMATIVA' : 'SIN_RESPUESTA',
          preguntasOPuntos: preguntas,
          respuestasODescargos: respuestas,
          resumen: String(parsed.resumen || base.resumen).trim().slice(0, 3500),
          contenidoTexto: texto.slice(0, 145000),
          origen,
          nombreArchivo,
          driveFileId,
          driveUrl,
          driveRuta: rutaCarpeta,
          driveModifiedTime,
          fechaCarga: new Date().toLocaleDateString('es-AR'),
        };
      }
    } catch (err) {
      console.warn(`[NotasLibro] Fallback heurístico para "${nombreArchivo}":`, err);
    }
  }

  return {
    id,
    codigo: base.codigo,
    tipoNota: base.tipoNota,
    titulo: base.titulo,
    fecha: base.fecha,
    actorEmisor: base.actorEmisor,
    emisorDetalle: base.emisorDetalle,
    actorReceptor: base.actorReceptor,
    receptorDetalle: base.receptorDetalle,
    sentido: base.sentido,
    frente: base.frente,
    referenciasNotas: base.referenciasNotas,
    respondeANotas: [],
    respondidaPorNotas: [],
    estadoRespuesta: base.sentido === 'informativa' ? 'INFORMATIVA' : 'SIN_RESPUESTA',
    preguntasOPuntos: base.preguntasOPuntos,
    respuestasODescargos: base.respuestasODescargos,
    resumen: base.resumen,
    contenidoTexto: texto.slice(0, 145000),
    origen,
    nombreArchivo,
    driveFileId,
    driveUrl,
    driveRuta: rutaCarpeta,
    driveModifiedTime,
    fechaCarga: new Date().toLocaleDateString('es-AR'),
  };
}

/**
 * Recalcula todo el grafo de Preguntas/Pedidos vs. Respuestas/Órdenes de Servicio entre los actores del Libro.
 */
export function recalcularHilosYRespuestas(notas: NotaLibro[]): NotaLibro[] {
  const copias: NotaLibro[] = notas.map(n => ({
    ...n,
    referenciasNotas: Array.isArray(n.referenciasNotas) ? Array.from(new Set(n.referenciasNotas)) : [],
    respondeANotas: [],
    respondidaPorNotas: [],
  }));

  const porCodigoCanon = new Map<string, NotaLibro[]>();
  for (const n of copias) {
    const c = canonicalizarCodigoNota(n.codigo);
    if (!c) continue;
    const arr = porCodigoCanon.get(c) || [];
    arr.push(n);
    porCodigoCanon.set(c, arr);
  }

  const respondeMap = new Map<string, Set<string>>();
  const respondidaPorMap = new Map<string, Set<string>>();
  for (const n of copias) {
    respondeMap.set(n.id, new Set<string>());
    respondidaPorMap.set(n.id, new Set<string>());
  }

  for (const notaB of copias) {
    const bCanon = canonicalizarCodigoNota(notaB.codigo) || notaB.codigo;
    const refs = new Set<string>([
      ...notaB.referenciasNotas.map(r => canonicalizarCodigoNota(r) || r),
      ...extraerReferenciasNotasTexto(notaB.contenidoTexto || '', bCanon),
    ]);

    for (const refCode of refs) {
      if (!refCode || refCode === bCanon) continue;
      const targets = porCodigoCanon.get(refCode) || [];
      for (const notaA of targets) {
        if (notaA.id === notaB.id) continue;
        // Verificar si notaB es respuesta / contestación / devolución / OS posterior o de actor distinto
        const fechaValida = !notaA.fecha || !notaB.fecha || notaB.fecha >= notaA.fecha;
        const actorDistinto = notaB.actorEmisor !== notaA.actorEmisor;
        const esRespuestaExplicita =
          notaB.sentido === 'respuesta_devolucion' ||
          notaB.sentido === 'intimacion_observacion' ||
          notaB.respuestasODescargos.length > 0;

        if ((actorDistinto || esRespuestaExplicita) && fechaValida) {
          respondeMap.get(notaB.id)?.add(notaA.codigo);
          respondidaPorMap.get(notaA.id)?.add(notaB.codigo);
        }
      }
    }
  }

  for (const n of copias) {
    n.respondeANotas = Array.from(respondeMap.get(n.id) || []).slice(0, 35);
    n.respondidaPorNotas = Array.from(respondidaPorMap.get(n.id) || []).slice(0, 35);

    if (n.manualOverride && n.estadoRespuesta) {
      continue;
    }

    if (n.respondidaPorNotas.length > 0) {
      // Evaluar texto de las notas que la respondieron para detectar discrepancias o devoluciones
      const notasQueResponden = copias.filter(cand => n.respondidaPorNotas.includes(cand.codigo));
      const textoRespuestas = notasQueResponden
        .map(r => `${r.resumen} ${(r.respuestasODescargos || []).join(' ')} ${(r.contenidoTexto || '').slice(0, 6000)}`)
        .join('\n')
        .toLowerCase();

      if (/\b(discrep|incompatib|rechaz|no\s+se\s+aprueba|devuelve|devoluci[oó]n|no\s+cumple|objeci[oó]n|incorrect)\b/i.test(textoRespuestas)) {
        n.estadoRespuesta = 'CON_DISCREPANCIA';
      } else if (/\b(parcial|pendiente|falta|subsanar|completar|observaci[oó]n)\b/i.test(textoRespuestas)) {
        n.estadoRespuesta = 'PARCIALMENTE_CONTESTADA';
      } else {
        n.estadoRespuesta = 'CONTESTADA';
      }
    } else if (
      n.sentido === 'respuesta_devolucion' &&
      n.respondeANotas.length > 0 &&
      n.preguntasOPuntos.length === 0
    ) {
      n.estadoRespuesta = 'INFORMATIVA';
    } else if (n.sentido === 'informativa' && n.preguntasOPuntos.length === 0) {
      n.estadoRespuesta = 'INFORMATIVA';
    } else {
      n.estadoRespuesta = 'SIN_RESPUESTA';
    }
  }

  copias.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '') || a.codigo.localeCompare(b.codigo));
  return copias;
}

/**
 * Construye el índice completo de TODAS las Notas de Libro (con Actores y estado Pregunta-Respuesta)
 * + el texto completo de las notas relevantes y sus notas enlazadas para Gemini.
 */
export function construirContextoNotasLibro(
  consulta: string,
  notas: NotaLibro[],
  maxCharsTextoCompleto = 85000
): string {
  if (!notas || notas.length === 0) return '';

  const ordenadas = [...notas].sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));

  const indiceLineas = ordenadas.map(n => {
    const respPor = n.respondidaPorNotas.length > 0 ? n.respondidaPorNotas.join(', ') : 'NINGUNA';
    const respA = n.respondeANotas.length > 0 ? n.respondeANotas.join(', ') : 'N/A';
    const refs = n.referenciasNotas.length > 0 ? n.referenciasNotas.join(', ') : 'Ninguna';
    const preg = n.preguntasOPuntos.length > 0 ? `Preguntas/Pedidos: ${n.preguntasOPuntos.slice(0, 4).join(' | ')}` : '';
    const desc = n.respuestasODescargos.length > 0 ? `Respuestas/Devoluciones: ${n.respuestasODescargos.slice(0, 4).join(' | ')}` : '';
    return (
      `• [${n.codigo} | ${n.tipoNota} | Fecha: ${n.fecha || 's/f'}] ` +
      `EMISOR: ${n.actorEmisor} (${n.emisorDetalle}) ➔ RECEPTOR: ${n.actorReceptor} (${n.receptorDetalle}) | ` +
      `Sentido: ${n.sentido} | Estado Respuesta: ${n.estadoRespuesta} | ` +
      `Responde a: [${respA}] | Respondida por: [${respPor}] | Citas: [${refs}]\n` +
      `  Resumen: ${n.resumen}${preg ? `\n  ${preg}` : ''}${desc ? `\n  ${desc}` : ''}`
    );
  });

  const bloqueIndice =
    `=== LIBRO DE COMUNICACIONES / NOTAS DE LIBRO (${notas.length} NOTAS TOTALES INDEXADAS CON ACTORES Y Q&A) ===\n` +
    indiceLineas.join('\n\n');

  const consultaNorm = normalizarTextoBusqueda(consulta);
  const expandida = analizarYExpandirConsulta(consulta);
  const tokensNucleo = new Set(expandida.tokensNucleo);
  const tokens = Array.from(
    new Set([
      ...consultaNorm.split(/\s+/).filter(t => t.length >= 2),
      ...expandida.tokensExpandidos,
    ])
  ).slice(0, 48);
  const codigosEnConsulta = new Set<string>(extraerReferenciasNotasTexto(consulta));

  // También capturar códigos sueltos como "nota 15", "os 22"
  const mSuelto = consultaNorm.match(/\b(\d{1,4})\b/g) || [];
  const numsEnConsulta = new Set(mSuelto.map(x => x.padStart(3, '0')));

  const puntuadas = ordenadas.map(n => {
    let score = 0;
    const textoNorm = normalizarTextoBusqueda(
      `${n.codigo} ${n.titulo} ${n.actorEmisor} ${n.actorReceptor} ${n.resumen} ${(n.contenidoTexto || '').slice(0, 20000)}`
    );
    const canon = canonicalizarCodigoNota(n.codigo);
    if (codigosEnConsulta.has(canon)) score += 150;
    for (const num of numsEnConsulta) {
      if (canon.endsWith(`-${num}`)) score += 80;
    }
    if (tokens.includes('transnoa') && (n.actorEmisor === 'TRANSNOA' || n.actorReceptor === 'TRANSNOA')) {
      score += 35;
    }
    if ((tokens.includes('ute') || tokens.includes('contratista')) && (n.actorEmisor === 'UTE / Contratista' || n.actorReceptor === 'UTE / Contratista')) {
      score += 25;
    }
    for (const fr of expandida.frasesClave.slice(0, 12)) {
      if (textoNorm.includes(fr)) score += 22;
    }
    for (const tok of tokens) {
      if (textoNorm.includes(tok)) {
        score += tokensNucleo.has(tok) ? 14 : 6;
      }
    }
    if (n.estadoRespuesta === 'SIN_RESPUESTA' || n.estadoRespuesta === 'CON_DISCREPANCIA') {
      score += 6;
    }
    return { nota: n, score };
  });

  puntuadas.sort((a, b) => b.score - a.score);

  // Seleccionar notas top + automáticamente incluir las notas enlazadas en sus hilos Q&A
  const seleccionadas = new Map<string, NotaLibro>();
  const porCodigo = new Map<string, NotaLibro>();
  for (const n of ordenadas) {
    porCodigo.set(n.codigo, n);
  }

  for (const item of puntuadas) {
    if (seleccionadas.size >= 24) break;
    seleccionadas.set(item.nota.id, item.nota);
    for (const linkedCode of [
      ...item.nota.respondeANotas,
      ...item.nota.respondidaPorNotas,
      ...item.nota.referenciasNotas,
    ]) {
      const linked = porCodigo.get(linkedCode);
      if (linked && seleccionadas.size < 28) {
        seleccionadas.set(linked.id, linked);
      }
    }
  }

  let chars = 0;
  const extractos: string[] = [];
  for (const n of Array.from(seleccionadas.values()).sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''))) {
    const limiteNota = Math.max(3500, Math.min(12000, Math.floor(maxCharsTextoCompleto / Math.max(1, seleccionadas.size))));
    const cuerpo = (n.contenidoTexto || n.resumen || '').slice(0, limiteNota);
    const bloque =
      `--- [${n.codigo} | ${n.tipoNota} | ${n.fecha} | EMISOR: ${n.actorEmisor} (${n.emisorDetalle}) ➔ RECEPTOR: ${n.actorReceptor} (${n.receptorDetalle}) | Estado: ${n.estadoRespuesta}] ---\n` +
      `Responde a: ${n.respondeANotas.join(', ') || 'Ninguna'} | Respondida por: ${n.respondidaPorNotas.join(', ') || 'Ninguna'}\n` +
      `${cuerpo}`;
    if (chars + bloque.length > maxCharsTextoCompleto && extractos.length >= 3) break;
    extractos.push(bloque);
    chars += bloque.length;
  }

  return `${bloqueIndice}\n\n=== TEXTO COMPLETO / EXTRACTOS DE NOTAS DE LIBRO RELEVANTES Y SUS HILOS Q&A ===\n${extractos.join('\n\n')}`;
}

export function construirFallbackLocalNotasLibro(consulta: string, notas: NotaLibro[]): string {
  if (!notas || notas.length === 0) {
    return '⚠️ No hay Notas de Libro cargadas aún. Usa **"Leer Notas de Libro (Drive)"** o sube tus notas en PDF/Word en el Chat.';
  }

  const filas = notas.slice(0, 25).map(n => {
    const respA = n.respondeANotas.join(', ') || '-';
    const respPor = n.respondidaPorNotas.join(', ') || 'Sin respuesta registrada';
    return `| **${n.codigo}** (${n.tipoNota}) | ${n.fecha || '-'} | ${n.actorEmisor} ➔ ${n.actorReceptor} | ${respA} | ${respPor} | **${n.estadoRespuesta}** |`;
  });

  return (
    `### Seguimiento de Notas de Libro, Actores y Preguntas vs. Respuestas (${notas.length} notas)\n\n` +
    `| Código / Tipo | Fecha | Emisor ➔ Receptor | Responde a | Respondida por | Estado |\n` +
    `|---|---|---|---|---|---|\n` +
    `${filas.join('\n')}\n`
  );
}
