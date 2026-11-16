import fs from 'fs';
import path from 'path';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import mammoth from 'mammoth';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { CACHE_DIR, asegurarDirectorioCache, PliegoIndexado, recuperarFragmentosRelevantes } from './pliegoProcessor';
import {
  MinutaReunion,
  CompromisoMinuta,
  NotaPedidoIngenieria,
  EstadoCompromiso,
} from '../src/types';

const STORE_PATH = path.join(CACHE_DIR, 'minutas_compromisos_store.json');

export interface MinutasStoreData {
  minutas: MinutaReunion[];
  compromisos: CompromisoMinuta[];
  notasPedido: NotaPedidoIngenieria[];
}

export function cargarStoreMinutas(): MinutasStoreData {
  try {
    asegurarDirectorioCache();
    if (fs.existsSync(STORE_PATH)) {
      const raw = fs.readFileSync(STORE_PATH, 'utf8');
      const parsed = JSON.parse(raw);
      return {
        minutas: Array.isArray(parsed?.minutas) ? parsed.minutas : [],
        compromisos: Array.isArray(parsed?.compromisos) ? parsed.compromisos : [],
        notasPedido: Array.isArray(parsed?.notasPedido) ? parsed.notasPedido : [],
      };
    }
  } catch (err) {
    console.warn('[Minutas] Error leyendo store en disco:', err);
  }
  return { minutas: [], compromisos: [], notasPedido: [] };
}

export function guardarStoreMinutas(data: MinutasStoreData) {
  try {
    asegurarDirectorioCache();
    fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.warn('[Minutas] Error guardando store en disco:', err);
  }
}

export async function extraerTextoMinutaBuffer(
  buffer: Buffer,
  nombre: string,
  tipoMime: string
): Promise<string> {
  const lower = nombre.toLowerCase();

  if (lower.endsWith('.pdf') || tipoMime === 'application/pdf') {
    const uint8 = new Uint8Array(buffer);
    const loadingTask = pdfjsLib.getDocument({
      data: uint8,
      useSystemFonts: true,
      disableFontFace: true,
      verbosity: 0,
    });
    const pdfDoc = await loadingTask.promise;
    const paginas: string[] = [];
    for (let p = 1; p <= pdfDoc.numPages; p++) {
      try {
        const page = await pdfDoc.getPage(p);
        const content = await page.getTextContent();
        let txt = '';
        let lastEol = false;
        for (const item of content.items as Array<{ str?: string; hasEOL?: boolean }>) {
          const s = item.str || '';
          if (s) txt += (lastEol || !txt ? '' : ' ') + s;
          if (item.hasEOL) {
            txt += '\n';
            lastEol = true;
          } else {
            lastEol = false;
          }
        }
        paginas.push(`[Página ${p}]\n${txt.replace(/[ \t]+/g, ' ').trim()}`);
        page.cleanup?.();
      } catch {
        // Ignorar página ilegible
      }
    }
    await pdfDoc.cleanup?.();
    return paginas.join('\n\n').trim();
  }

  if (
    lower.endsWith('.docx') ||
    tipoMime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    const result = await mammoth.extractRawText({ buffer });
    return (result.value || '').trim();
  }

  return buffer.toString('utf8').trim();
}

export function normalizarFechaIso(raw?: string, fallback?: string): string {
  const hoyIso = fallback || new Date().toISOString().split('T')[0];
  if (!raw) return hoyIso;
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const dmy = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
  if (dmy) {
    const year = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3];
    return `${year}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  }
  return hoyIso;
}

function sumarDiasIso(fechaIso: string, dias: number): string {
  const d = new Date(`${fechaIso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return fechaIso;
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().split('T')[0];
}

function detectarFrenteDesdeTexto(texto: string, fallback = 'LAT El Bracho - Villa Quinteros'): string {
  const u = texto.toUpperCase();
  if (u.includes('LEALES') || u.includes('ET-LE')) return 'ET Leales';
  if (u.includes('VILLA QUINTEROS') || u.includes('ET VQ') || u.includes('ET-VQ')) return 'ET Villa Quinteros';
  if (u.includes('EL BRACHO') && !u.includes('VILLA QUINTEROS')) return 'ET El Bracho';
  if (u.includes('LAT') || u.includes('BRACHO') || u.includes('TRAZA')) return 'LAT El Bracho - Villa Quinteros';
  return fallback;
}

function extraerCodigoMinutaDesdeTexto(texto: string, nombreArchivo?: string): string {
  const fuente = `${nombreArchivo || ''} ${texto.slice(0, 1200)}`;
  const matchCom = fuente.match(/(COMCT2-TU1-\d+|MIN-[A-Z0-9-]+|MR-\d+(?:-\d+)?|ACTA[-_\s]*N?[°º]?\s*\d+)/i);
  if (matchCom) return matchCom[1].toUpperCase().replace(/\s+/g, '-');
  return `MIN-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}`;
}

function extraerFechaReunionDesdeTexto(texto: string): string {
  const inicio = texto.slice(0, 1800);
  const match = inicio.match(/(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}|\d{4}-\d{2}-\d{2})/);
  if (match) return normalizarFechaIso(match[1]);
  return new Date().toISOString().split('T')[0];
}

function extraerCompromisosLocal(
  texto: string,
  minuta: MinutaReunion
): { resumen: string; compromisos: CompromisoMinuta[] } {
  const lineas = texto
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 8);

  const hoyIso = new Date().toISOString().split('T')[0];
  const compromisos: CompromisoMinuta[] = [];
  const palabrasAccion =
    /(?:compromis|acuerd|entregar|presentar|remitir|enviar|responder|regularizar|emitir|corregir|revisar|aprobar|plazo|fecha\s*l[ií]mite|vence|responsable|pendiente|deber[aá]|se\s+solicita|ingenier[ií]a|proyectista|transnoa|ute)/i;

  let itemIdx = 1;
  for (const linea of lineas) {
    if (linea.startsWith('[Página')) continue;
    if (/^(p[áa]gina\s+\d+|minuta\s+de\s+reuni[óo]n|asistentes|participantes|fecha:|tema:)$/i.test(linea)) continue;

    const esBulletONumerada = /^(?:\d+[\.\)\-]|[-•*]|\[\s*\])/.test(linea);
    if (!esBulletONumerada && !palabrasAccion.test(linea)) continue;
    if (linea.length < 18) continue;

    const limpia = linea.replace(/^(?:\d+[\.\)\-]|[-•*])\s*/, '').trim();
    const matchFecha = limpia.match(/(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}|\d{4}-\d{2}-\d{2})/);
    const fechaLimite = matchFecha
      ? normalizarFechaIso(matchFecha[1])
      : sumarDiasIso(minuta.fechaReunion, 7);

    let responsable = 'Ingeniería / Proyectista';
    if (/proyectista/i.test(limpia)) responsable = 'Proyectista';
    else if (/ingenier[ií]a/i.test(limpia)) responsable = 'Ingeniería';
    else if (/ute/i.test(limpia)) responsable = 'UTE';
    else if (/transnoa|transener/i.test(limpia)) responsable = 'TRANSNOA / Supervisión';
    else if (/contratista|geotecnia|civil/i.test(limpia)) responsable = 'Contratista de Obra';

    const matchPlanos = limpia.match(/(?:ET|L)-[A-Z0-9-]+(?:-\d+)?/g) || [];
    const estado: EstadoCompromiso = fechaLimite < hoyIso ? 'INCUMPLIDO' : 'PENDIENTE';

    compromisos.push({
      id: `comp_${Date.now()}_${itemIdx}_${Math.random().toString(36).slice(2, 6)}`,
      minutaId: minuta.id,
      minutaCodigo: minuta.codigo,
      minutaFecha: minuta.fechaReunion,
      numeroItem: `C-${String(itemIdx).padStart(2, '0')}`,
      descripcion: limpia.slice(0, 380),
      responsable,
      area: /civil|suelo|fundaci/i.test(limpia)
        ? 'Obra Civil / Geotecnia'
        : /protec|scada|tele|unifilar/i.test(limpia)
          ? 'Control y Protecciones'
          : 'Ingeniería',
      frente: detectarFrenteDesdeTexto(limpia, minuta.frente),
      fechaLimite,
      estado,
      observaciones: '',
      documentosRelacionados: Array.from(new Set(matchPlanos)),
      notasPedidoIds: [],
    });

    itemIdx++;
    if (compromisos.length >= 25) break;
  }

  const resumen =
    lineas
      .filter(l => !l.startsWith('[Página'))
      .slice(0, 4)
      .join(' ')
      .slice(0, 320) || `Minuta ${minuta.codigo} registrada (${minuta.fechaReunion}).`;

  return { resumen, compromisos };
}

export async function analizarYExtraerCompromisosMinuta(params: {
  minuta: MinutaReunion;
  ai: GoogleGenAI | null;
  model: string;
}): Promise<{ resumen: string; compromisos: CompromisoMinuta[]; fuente: string }> {
  const { minuta, ai, model } = params;
  const hoyIso = new Date().toISOString().split('T')[0];

  if (ai && minuta.contenidoTexto.trim().length > 20) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents:
          `Analiza la siguiente MINUTA DE REUNIÓN de la obra 132 kV (LAT El Bracho - Villa Quinteros, ET Leales, ET El Bracho, ET Villa Quinteros).\n` +
          `Fecha de referencia de la reunión: ${minuta.fechaReunion}. Fecha actual hoy: ${hoyIso}.\n` +
          `Frente por defecto: ${minuta.frente}.\n\n` +
          `CONTENIDO DE LA MINUTA:\n${minuta.contenidoTexto.slice(0, 45000)}`,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          systemInstruction:
            'Eres un Inspector de Control de Ingeniería 132 kV. Extrae exclusivamente los compromisos reales, entregas acordadas, levantamiento de observaciones o acciones asumidas presentes en la minuta. ' +
            'No inventes compromisos que no estén respaldados por el texto. Para fechas sin año explícito, asume el año de la reunión. Convierte todas las fechas a formato YYYY-MM-DD.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              resumen: {
                type: Type.STRING,
                description: 'Resumen ejecutivo de 2-3 oraciones de los temas tratados en la minuta.',
              },
              participantesDetectados: {
                type: Type.STRING,
                description: 'Participantes o áreas mencionadas en la minuta.',
              },
              compromisos: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    numeroItem: { type: Type.STRING },
                    descripcion: { type: Type.STRING },
                    responsable: { type: Type.STRING },
                    area: { type: Type.STRING },
                    frente: { type: Type.STRING },
                    fechaLimite: { type: Type.STRING, description: 'Fecha YYYY-MM-DD' },
                    cumplidoEnMinuta: { type: Type.BOOLEAN },
                    documentosRelacionados: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                    },
                    observaciones: { type: Type.STRING },
                  },
                },
              },
            },
          },
        },
      });

      const parsed = JSON.parse((response.text || '{}').trim());
      if (parsed && Array.isArray(parsed.compromisos)) {
        const extraidos: CompromisoMinuta[] = parsed.compromisos
          .filter((c: any) => c && typeof c.descripcion === 'string' && c.descripcion.trim().length > 4)
          .map((c: any, idx: number) => {
            const fechaLim = normalizarFechaIso(c.fechaLimite, sumarDiasIso(minuta.fechaReunion, 7));
            const estado: EstadoCompromiso = c.cumplidoEnMinuta
              ? 'CUMPLIDO'
              : fechaLim < hoyIso
                ? 'INCUMPLIDO'
                : 'PENDIENTE';
            return {
              id: `comp_${Date.now()}_${idx + 1}_${Math.random().toString(36).slice(2, 6)}`,
              minutaId: minuta.id,
              minutaCodigo: minuta.codigo,
              minutaFecha: minuta.fechaReunion,
              numeroItem: String(c.numeroItem || `C-${String(idx + 1).padStart(2, '0')}`).trim(),
              descripcion: String(c.descripcion).trim(),
              responsable: String(c.responsable || 'Ingeniería / Proyectista').trim(),
              area: String(c.area || 'Ingeniería').trim(),
              frente: String(c.frente || minuta.frente).trim(),
              fechaLimite: fechaLim,
              estado,
              observaciones: String(c.observaciones || '').trim(),
              documentosRelacionados: Array.isArray(c.documentosRelacionados)
                ? c.documentosRelacionados.map((d: any) => String(d).trim()).filter(Boolean)
                : [],
              notasPedidoIds: [],
            };
          });

        if (extraidos.length > 0 || parsed.resumen) {
          return {
            resumen: String(parsed.resumen || `Minuta ${minuta.codigo} analizada.`).trim(),
            compromisos: extraidos,
            fuente: 'gemini',
          };
        }
      }
    } catch (err) {
      console.warn('[Minutas] Fallo extracción con Gemini, usando extractor local:', err);
    }
  }

  const local = extraerCompromisosLocal(minuta.contenidoTexto, minuta);
  return { ...local, fuente: 'extractor-local' };
}

export function inferirMetadatosMinuta(params: {
  nombreArchivo?: string;
  codigo?: string;
  titulo?: string;
  fechaReunion?: string;
  frente?: string;
  participantes?: string;
  contenidoTexto: string;
}) {
  const { contenidoTexto, nombreArchivo } = params;
  const codigo =
    (params.codigo || '').trim() || extraerCodigoMinutaDesdeTexto(contenidoTexto, nombreArchivo);
  const fechaReunion = normalizarFechaIso(
    params.fechaReunion,
    extraerFechaReunionDesdeTexto(contenidoTexto)
  );
  const frente =
    (params.frente || '').trim() || detectarFrenteDesdeTexto(contenidoTexto);
  const titulo =
    (params.titulo || '').trim() ||
    (nombreArchivo ? nombreArchivo.replace(/\.[^.]+$/, '') : `Minuta de Reunión ${codigo}`);
  const participantes =
    (params.participantes || '').trim() || 'UTE · Ingeniería / Proyectista · Inspección';

  return { codigo, titulo, fechaReunion, frente, participantes };
}

function calcularDiasMora(fechaLimite: string, fechaReferencia: string): number {
  const fLim = new Date(`${fechaLimite}T00:00:00Z`).getTime();
  const fRef = new Date(`${fechaReferencia}T00:00:00Z`).getTime();
  if (Number.isNaN(fLim) || Number.isNaN(fRef)) return 0;
  return Math.max(0, Math.round((fRef - fLim) / (1000 * 60 * 60 * 24)));
}

export async function generarContenidoNotaPedido(params: {
  numeroNota: string;
  fechaEmision: string;
  emisor: string;
  destinatario: string;
  frente: string;
  asunto: string;
  plazoDescargoDias: number;
  encuadreAdicional?: string;
  compromisos: CompromisoMinuta[];
  minutas: MinutaReunion[];
  pliegos: PliegoIndexado[];
  ai: GoogleGenAI | null;
  model: string;
}): Promise<{ markdown: string; fuente: string }> {
  const {
    numeroNota,
    fechaEmision,
    emisor,
    destinatario,
    frente,
    asunto,
    plazoDescargoDias,
    encuadreAdicional,
    compromisos,
    minutas,
    pliegos,
    ai,
    model,
  } = params;

  const minutasRelacionadas = minutas.filter(m =>
    compromisos.some(c => c.minutaId === m.id)
  );

  const detalleCompromisos = compromisos.map((c, idx) => {
    const diasMora = calcularDiasMora(c.fechaLimite, fechaEmision);
    return {
      orden: idx + 1,
      minuta: `${c.minutaCodigo} (${c.minutaFecha})`,
      item: c.numeroItem,
      descripcion: c.descripcion,
      responsable: c.responsable,
      area: c.area,
      frente: c.frente,
      fechaLimite: c.fechaLimite,
      diasMora,
      documentos: (c.documentosRelacionados || []).join(', ') || 'Sin código asignado',
      observaciones: c.observaciones || '',
    };
  });

  if (ai) {
    try {
      let contextoPliegos = '';
      if (pliegos.length > 0) {
        const consultaPliego = `${asunto} ${compromisos.map(c => c.descripcion).join(' ')} plazos ingenieria penalidades incumplimiento`;
        const rec = recuperarFragmentosRelevantes(consultaPliego, pliegos, 24000);
        contextoPliegos = rec.contextoTexto;
      }

      const prompt =
        `Redacta una NOTA DE PEDIDO FORMAL DE INGENIERÍA POR INCUMPLIMIENTO DE COMPROMISOS DE MINUTA.\n\n` +
        `DATOS DE CABECERA:\n` +
        `- N° Nota de Pedido: ${numeroNota}\n` +
        `- Fecha de Emisión: ${fechaEmision}\n` +
        `- Emisor: ${emisor}\n` +
        `- Destinatario: ${destinatario}\n` +
        `- Obra / Frente: ${frente}\n` +
        `- Asunto: ${asunto}\n` +
        `- Plazo perentorio de regularización / descargo: ${plazoDescargoDias} días corridos\n` +
        `${encuadreAdicional ? `- Encuadre o instrucciones adicionales del usuario: ${encuadreAdicional}\n` : ''}\n` +
        `MINUTAS DE ORIGEN:\n` +
        `${minutasRelacionadas.map(m => `- ${m.codigo} | ${m.titulo} | Fecha reunión: ${m.fechaReunion} | Participantes: ${m.participantes}`).join('\n') || '- Registro directo de seguimiento'}\n\n` +
        `COMPROMISOS INCUMPLIDOS / VENCIDOS:\n` +
        `${JSON.stringify(detalleCompromisos, null, 2)}\n\n` +
        `${contextoPliegos ? `EXTRACTOS DE PLIEGOS CONTRACTUALES APLICABLES:\n${contextoPliegos}\n\n` : ''}` +
        `ESTRUCTURA OBLIGATORIA EN MARKDOWN:\n` +
        `1. Título oficial (# NOTA DE PEDIDO N° ${numeroNota}) y ficha formal de cabecera.\n` +
        `2. **I. OBJETO Y ANTECEDENTES DE MINUTA**: referencia precisa a las actas/minutas y fechas de compromiso.\n` +
        `3. **II. CUADRO DE COMPROMISOS INCUMPLIDOS Y MORA**: tabla Markdown con columnas | Ítem | Minuta | Compromiso Asumido | Responsable | Fecha Límite | Días de Mora | Documentos |\n` +
        `4. **III. IMPACTO EN RUTA CRÍTICA Y ENCUADRE TÉCNICO-CONTRACTUAL**: análisis concreto de las demoras y citas de pliego si figuran en los extractos.\n` +
        `5. **IV. REQUERIMIENTO PERENTORIO E INTIMACIÓN A INGENIERÍA**: acciones exigidas dentro del plazo de ${plazoDescargoDias} días y reserva de derechos/aplicación de penalidades contractuales.\n` +
        `6. **V. CIERRE Y CONSTANCIA DE NOTIFICACIÓN**.`;

      const resp = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          systemInstruction:
            'Eres el Director Técnico / Inspector de Obra en proyectos de Alta Tensión 132 kV en Argentina. Redacta notas de pedido formales en tono técnico-contractual firme, claro y verificable. Jamás inventes números de artículos de pliego si no figuran en los extractos.',
        },
      });

      const txt = (resp.text || '').trim();
      if (txt) {
        return { markdown: txt, fuente: 'gemini' };
      }
    } catch (err) {
      console.warn('[Minutas] Fallo redactando Nota de Pedido con Gemini, usando plantilla formal:', err);
    }
  }

  // Fallback estructurado profesional y completo
  const filasTabla = detalleCompromisos
    .map(
      d =>
        `| ${d.item} | ${d.minuta} | ${d.descripcion.replace(/\|/g, '/')} | ${d.responsable} | ${d.fechaLimite} | ${d.diasMora > 0 ? `${d.diasMora} días` : 'Vencido / Incumplido'} | ${d.documentos} |`
    )
    .join('\n');

  const listaMinutas =
    minutasRelacionadas.length > 0
      ? minutasRelacionadas
          .map(
            m =>
              `- **${m.codigo}** — *${m.titulo}* (Reunión del **${m.fechaReunion}** · Participantes: ${m.participantes})`
          )
          .join('\n')
      : `- Compromisos asentados en seguimiento de minuta de ingeniería (${frente}).`;

  const maxMora = Math.max(0, ...detalleCompromisos.map(d => d.diasMora));

  const md = [
    `# NOTA DE PEDIDO N° ${numeroNota}`,
    '',
    `**PROYECTO:** Corredor Eléctrico 132 kV — LAT El Bracho - Villa Quinteros y Estaciones Transformadoras`,
    `**OBRA / FRENTE:** ${frente}`,
    `**FECHA DE EMISIÓN:** ${fechaEmision}`,
    `**EMISOR:** ${emisor}`,
    `**DESTINATARIO:** ${destinatario}`,
    `**REFERENCIA / ASUNTO:** ${asunto}`,
    '',
    '---',
    '',
    '## I. OBJETO Y ANTECEDENTES DOCUMENTALES',
    `Por medio de la presente **Nota de Pedido N° ${numeroNota}**, se deja formal constancia del **incumplimiento de los compromisos técnicos asumidos en reunión de ingeniería**, conforme a las minutas que se detallan a continuación:`,
    '',
    listaMinutas,
    '',
    '## II. DETALLE DE COMPROMISOS INCUMPLIDOS',
    '',
    '| Ítem | Minuta de Origen | Compromiso Establecido | Responsable | Fecha Límite | Días de Mora | Documentación Asociada |',
    '|---|---|---|---|---|:---:|---|',
    filasTabla,
    '',
    '## III. IMPACTO TÉCNICO Y ENCUADRE CONTRACTUAL',
    `1. Se verifica un desvío máximo acumulado de **${maxMora} días corridos** respecto de las fechas límite formalmente comprometidas en minuta.`,
    '2. La falta de emisión oportuna de la documentación de ingeniería comprometida afecta el circuito de revisión y aprobación (Sello APC), comprometiendo la secuencia constructiva, el cronograma maestro de hitos y la liberación de frentes en obra.',
    encuadreAdicional ? `3. **Observación específica de Inspección / Control:** ${encuadreAdicional}` : '',
    '',
    '## IV. REQUERIMIENTO FORMAL E INTIMACIÓN A INGENIERÍA',
    `En virtud de lo expuesto, se intima a **${destinatario}** para que dentro del plazo perentorio e improrrogable de **${plazoDescargoDias} días corridos** contados desde la recepción de la presente:`,
    '- Efectúe la entrega formal completa y verificada de la totalidad de los entregables listados en la Sección II, debidamente codificados y revisados.',
    '- Presente en forma escrita un **Plan de Regularización y Recuperación de Plazos**, indicando responsables nominados y fechas ciertas de cierre para cada ítem pendiente.',
    '- Informe las causas técnicas del desvío registrado a efectos del deslinde de responsabilidades contractuales.',
    '',
    '> **Reserva Contractual:** El incumplimiento reiterado o la falta de respuesta satisfactoria dentro del plazo otorgado dará lugar a la elevación del presente antecedente al Libro de Órdenes de Servicio / Comitente y a la aplicación de las previsiones contractuales correspondientes.',
    '',
    '---',
    '',
    `**${emisor}**  `,
    `Notificación formal de Control Documental e Ingeniería — ${fechaEmision}`,
  ]
    .filter(Boolean)
    .join('\n');

  return { markdown: md, fuente: 'plantilla-contractual' };
}
