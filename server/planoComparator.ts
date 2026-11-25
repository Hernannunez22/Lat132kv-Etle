import fs from 'fs';
import path from 'path';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import {
  CACHE_DIR,
  PliegoIndexado,
  asegurarDirectorioCache,
  extraerMetricasTecnicas,
  procesarArchivoDesdeDisco,
  procesarArchivoPliego,
  recuperarFragmentosRelevantes,
} from './pliegoProcessor';
import { sanitizeSafeId } from './authMiddleware';

export interface PlanoComparadorIndexado {
  id: string;
  rol: 'A' | 'B';
  nombre: string;
  tipoMime: string;
  tamanioBytes: number;
  tamanioTexto: string;
  fechaSubida: string;
  contenidoTexto: string;
  paginas: number;
  caracteresTexto: number;
  esEscaneado: boolean;
  tiempoProcesoMs: number;
  metricasDetectadas: string[];
  rutaBinario?: string;
  geminiFileUri?: string;
  geminiFileMime?: string;
}

const PLANOS_DIR = path.join(CACHE_DIR, 'planos');

function asegurarDirPlanos() {
  asegurarDirectorioCache();
  if (!fs.existsSync(PLANOS_DIR)) {
    fs.mkdirSync(PLANOS_DIR, { recursive: true });
  }
}

export function guardarPlanoComparador(plano: PlanoComparadorIndexado) {
  asegurarDirPlanos();
  const metaPath = path.join(PLANOS_DIR, `plano_${plano.rol}.json`);
  fs.writeFileSync(metaPath, JSON.stringify(plano), 'utf-8');
}

export function cargarPlanosComparador(): { A: PlanoComparadorIndexado | null; B: PlanoComparadorIndexado | null } {
  asegurarDirPlanos();
  const leer = (rol: 'A' | 'B'): PlanoComparadorIndexado | null => {
    const p = path.join(PLANOS_DIR, `plano_${rol}.json`);
    if (!fs.existsSync(p)) return null;
    try {
      return JSON.parse(fs.readFileSync(p, 'utf-8')) as PlanoComparadorIndexado;
    } catch {
      return null;
    }
  };
  return { A: leer('A'), B: leer('B') };
}

export function eliminarPlanoComparadorDisco(rol: 'A' | 'B') {
  asegurarDirPlanos();
  for (const name of [`plano_${rol}.json`, `plano_${rol}.pdf`]) {
    const p = path.join(PLANOS_DIR, name);
    if (fs.existsSync(p)) {
      try {
        fs.unlinkSync(p);
      } catch {}
    }
  }
}

export async function indexarPlanoComparadorDesdeArchivo(params: {
  rol: 'A' | 'B';
  id: string;
  nombre: string;
  tipoMime: string;
  rutaArchivo: string;
  tamanioBytes: number;
  fechaSubida: string;
  onProgress?: (paginasProcesadas: number, totalPaginas: number) => void;
}): Promise<PlanoComparadorIndexado> {
  asegurarDirPlanos();
  const safeId = sanitizeSafeId(params.id, 'planoId');
  const rol = params.rol === 'B' ? 'B' : 'A';
  const binDestino = path.join(PLANOS_DIR, `plano_${rol}.pdf`);

  // Copiar binario si es <= 45 MB para que Gemini pueda inspeccionar dibujos CAD/tablas visualmente
  let tieneBinario = false;
  if (params.tamanioBytes <= 45 * 1024 * 1024 && fs.existsSync(params.rutaArchivo)) {
    try {
      fs.copyFileSync(params.rutaArchivo, binDestino);
      tieneBinario = true;
    } catch {}
  }

  const base = await procesarArchivoDesdeDisco({
    id: `cmp_${rol}_${safeId}`,
    nombre: params.nombre,
    tipoMime: params.tipoMime,
    rutaArchivo: params.rutaArchivo,
    tamanioBytes: params.tamanioBytes,
    fechaSubida: params.fechaSubida,
    onProgress: params.onProgress,
  });

  // No dejar el índice del plano mezclado con los pliegos del CACHE_DIR
  const jsonEnPliegos = path.join(CACHE_DIR, `cmp_${rol}_${safeId}.json`);
  if (fs.existsSync(jsonEnPliegos)) {
    try {
      fs.unlinkSync(jsonEnPliegos);
    } catch {}
  }

  // Si era escaneado, procesarArchivoDesdeDisco pudo moverlo a CACHE_DIR/cmp_...pdf
  const pdfEscaneadoEnPliegos = path.join(CACHE_DIR, `cmp_${rol}_${safeId}.pdf`);
  if (fs.existsSync(pdfEscaneadoEnPliegos)) {
    try {
      fs.renameSync(pdfEscaneadoEnPliegos, binDestino);
      tieneBinario = true;
    } catch {}
  }

  const metricas = extraerMetricasTecnicas(base.contenidoTexto);
  const resultado: PlanoComparadorIndexado = {
    id: params.id,
    rol: params.rol,
    nombre: base.nombre,
    tipoMime: base.tipoMime,
    tamanioBytes: base.tamanioBytes,
    tamanioTexto: base.tamanioTexto,
    fechaSubida: base.fechaSubida,
    contenidoTexto: base.contenidoTexto,
    paginas: base.paginas,
    caracteresTexto: base.caracteresTexto,
    esEscaneado: base.esEscaneado,
    tiempoProcesoMs: base.tiempoProcesoMs,
    metricasDetectadas: metricas,
    rutaBinario: tieneBinario ? binDestino : undefined,
  };

  guardarPlanoComparador(resultado);
  return resultado;
}

export async function indexarPlanoComparadorBuffer(params: {
  rol: 'A' | 'B';
  id: string;
  nombre: string;
  tipoMime: string;
  buffer: Buffer;
  fechaSubida: string;
}): Promise<PlanoComparadorIndexado> {
  asegurarDirPlanos();
  const safeId = sanitizeSafeId(params.id, 'planoId');
  const rol = params.rol === 'B' ? 'B' : 'A';
  const binDestino = path.join(PLANOS_DIR, `plano_${rol}.pdf`);
  fs.writeFileSync(binDestino, params.buffer);

  const base = await procesarArchivoPliego({
    id: `cmp_${rol}_${safeId}`,
    nombre: params.nombre,
    tipoMime: params.tipoMime,
    buffer: params.buffer,
    fechaSubida: params.fechaSubida,
  });

  const jsonEnPliegos = path.join(CACHE_DIR, `cmp_${rol}_${safeId}.json`);
  if (fs.existsSync(jsonEnPliegos)) {
    try {
      fs.unlinkSync(jsonEnPliegos);
    } catch {}
  }
  const pdfEscaneado = path.join(CACHE_DIR, `cmp_${rol}_${safeId}.pdf`);
  if (fs.existsSync(pdfEscaneado)) {
    try {
      fs.unlinkSync(pdfEscaneado);
    } catch {}
  }

  const metricas = extraerMetricasTecnicas(base.contenidoTexto);
  const resultado: PlanoComparadorIndexado = {
    id: params.id,
    rol: params.rol,
    nombre: base.nombre,
    tipoMime: base.tipoMime,
    tamanioBytes: base.tamanioBytes,
    tamanioTexto: base.tamanioTexto,
    fechaSubida: base.fechaSubida,
    contenidoTexto: base.contenidoTexto,
    paginas: base.paginas,
    caracteresTexto: base.caracteresTexto,
    esEscaneado: base.esEscaneado,
    tiempoProcesoMs: base.tiempoProcesoMs,
    metricasDetectadas: metricas,
    rutaBinario: binDestino,
  };

  guardarPlanoComparador(resultado);
  return resultado;
}

async function asegurarUriPlanoGemini(
  plano: PlanoComparadorIndexado,
  ai: GoogleGenAI
): Promise<string | null> {
  if (plano.geminiFileUri) return plano.geminiFileUri;
  if (!plano.rutaBinario || !fs.existsSync(plano.rutaBinario)) return null;
  try {
    const uploaded = await ai.files.upload({
      file: plano.rutaBinario,
      config: {
        mimeType: 'application/pdf',
        displayName: `Plano_${plano.rol}_${plano.nombre}`,
      },
    });
    if (uploaded?.uri) {
      plano.geminiFileUri = uploaded.uri;
      plano.geminiFileMime = uploaded.mimeType || 'application/pdf';
      guardarPlanoComparador(plano);
      return uploaded.uri;
    }
  } catch (err) {
    console.warn(`[Comparador] Error subiendo Plano ${plano.rol} a Gemini Files API:`, err);
  }
  return null;
}

export async function prepararPartesComparacion(params: {
  planoA: PlanoComparadorIndexado;
  planoB: PlanoComparadorIndexado | null;
  pliegos: PliegoIndexado[];
  enfoque: string;
  ai: GoogleGenAI | null;
}) {
  const { planoA, planoB, pliegos, enfoque, ai } = params;
  const parts: any[] = [];

  // Adjuntar PDFs binarios vía File API (una sola subida cacheada) para lectura VISUAL de planos CAD, rótulos y tablas
  if (ai) {
    const uriA = await asegurarUriPlanoGemini(planoA, ai);
    if (uriA) {
      parts.push({ fileData: { mimeType: planoA.geminiFileMime || 'application/pdf', fileUri: uriA } });
    }
    if (planoB) {
      const uriB = await asegurarUriPlanoGemini(planoB, ai);
      if (uriB) {
        parts.push({ fileData: { mimeType: planoB.geminiFileMime || 'application/pdf', fileUri: uriB } });
      }
    }
  }

  // Construir consulta semántica combinando el enfoque + métricas extraídas de ambos planos para buscar en el Pliego
  const queryPliegos = [
    enfoque,
    ...planoA.metricasDetectadas.slice(0, 15),
    ...(planoB ? planoB.metricasDetectadas.slice(0, 15) : []),
    planoA.nombre,
    planoB?.nombre || '',
  ]
    .filter(Boolean)
    .join(' ');

  const contextoPliegos =
    pliegos.length > 0
      ? recuperarFragmentosRelevantes(queryPliegos, pliegos, 80000).contextoTexto
      : 'No hay pliegos cargados actualmente en el sistema.';

  const textoPlanoA = planoA.contenidoTexto
    ? planoA.contenidoTexto.slice(0, 32000)
    : '[Plano PDF con trazado gráfico/CAD sin texto seleccionable; inspeccionar visualmente el archivo adjunto]';

  const textoPlanoB = planoB
    ? planoB.contenidoTexto
      ? planoB.contenidoTexto.slice(0, 32000)
      : '[Plano B con trazado gráfico/CAD sin texto seleccionable; inspeccionar visualmente el archivo adjunto]'
    : null;

  parts.push({
    text:
      `=== PLANO A (${planoA.nombre} | ${planoA.paginas} págs | ${planoA.tamanioTexto}) ===\n` +
      `Métricas detectadas: ${planoA.metricasDetectadas.join(', ') || 'Inspección visual'}\n` +
      `${textoPlanoA}\n\n` +
      (planoB
        ? `=== PLANO B (${planoB.nombre} | ${planoB.paginas} págs | ${planoB.tamanioTexto}) ===\n` +
          `Métricas detectadas: ${planoB.metricasDetectadas.join(', ') || 'Inspección visual'}\n` +
          `${textoPlanoB}\n\n`
        : '') +
      `=== PLIEGOS CONTRACTUALES REALES DE REFERENCIA ===\n${contextoPliegos}\n\n` +
      `=== INSTRUCCIÓN DE AUDITORÍA TÉCNICA ===\n` +
      `Enfoque solicitado: "${enfoque || 'Auditoría completa de discrepancias entre planos y pliego'}"\n\n` +
      `Genera un informe técnico riguroso en Markdown con exactamente estas secciones:\n` +
      `1. **Resumen Ejecutivo de Auditoría** (estado general, hallazgos críticos y revisión/rótulo detectado).\n` +
      `2. **Cuadro Comparativo Técnico** en tabla Markdown con columnas:\n` +
      (planoB
        ? `   | Parámetro / Ítem Técnico | Plano A (${planoA.nombre}) | Plano B (${planoB.nombre}) | Exigencia del Pliego (Art./Pág.) | Estado |\n`
        : `   | Parámetro / Ítem Técnico | Valor en Plano A (${planoA.nombre}) | Exigencia del Pliego (Art./Pág.) | Estado |\n`) +
      `   En la columna **Estado** usa exactamente una de estas etiquetas: \`CUMPLE\`, \`DISCREPANCIA\`, \`CAMBIO\`, u \`OBSERVACIÓN\`.\n` +
      `3. **Discrepancias Críticas respecto al Pliego** (detalla cada desvío con valor del plano vs. valor exigido en el pliego).\n` +
      (planoB
        ? `4. **Diferencias Detectadas entre Plano A y Plano B** (cambios geométricos, de cotas, notas, materiales o revisión).\n`
        : '') +
      `5. **Acciones Correctivas Recomendadas** antes de emitir Sello APC.`,
  });

  return parts;
}

export function compararPlanosLocalFallback(params: {
  planoA: PlanoComparadorIndexado;
  planoB: PlanoComparadorIndexado | null;
  pliegos: PliegoIndexado[];
  enfoque: string;
}): string {
  const { planoA, planoB, pliegos, enfoque } = params;

  const setA = new Set(planoA.metricasDetectadas.map(m => m.toUpperCase()));
  const setB = new Set((planoB?.metricasDetectadas || []).map(m => m.toUpperCase()));

  const todasMetricas = Array.from(new Set([...setA, ...setB])).slice(0, 25);

  const query = [enfoque, ...todasMetricas].join(' ');
  const recPliego = pliegos.length > 0 ? recuperarFragmentosRelevantes(query, pliegos, 40000) : null;
  const textoPliegosTodo = recPliego ? recPliego.fragmentosSeleccionados.map(f => `[${f.pliegoNombre} p.${f.pagina}] ${f.texto}`).join('\n') : '';

  const filas: string[] = [];

  // Fila de metadatos básicos
  filas.push(
    planoB
      ? `| Rótulo / Archivo | ${planoA.nombre} (${planoA.paginas} pág.) | ${planoB.nombre} (${planoB.paginas} pág.) | Documentación de Obra | CAMBIO |`
      : `| Archivo Analizado | ${planoA.nombre} (${planoA.paginas} pág.) | ${pliegos.length} Pliego(s) cargado(s) | OBSERVACIÓN |`
  );

  for (const metrica of todasMetricas) {
    const enA = setA.has(metrica) ? `Presente (${metrica})` : 'No detectado';
    const enB = setB.has(metrica) ? `Presente (${metrica})` : 'No detectado';
    const matchPliego = recPliego?.fragmentosSeleccionados.find(f =>
      f.texto.toUpperCase().includes(metrica)
    );
    const refPliego = matchPliego
      ? `Citado en ${matchPliego.pliegoNombre} (Pág. ${matchPliego.pagina})`
      : pliegos.length > 0
        ? 'No hallado en fragmentos coincidentes'
        : 'Sin pliegos cargados';

    let estado = 'OBSERVACIÓN';
    if (planoB) {
      if (setA.has(metrica) !== setB.has(metrica)) estado = 'CAMBIO';
      else if (matchPliego) estado = 'CUMPLE';
      else if (pliegos.length > 0) estado = 'DISCREPANCIA';
    } else {
      estado = matchPliego ? 'CUMPLE' : pliegos.length > 0 ? 'DISCREPANCIA' : 'OBSERVACIÓN';
    }

    filas.push(
      planoB
        ? `| Parámetro \`${metrica}\` | ${enA} | ${enB} | ${refPliego} | ${estado} |`
        : `| Parámetro \`${metrica}\` | ${enA} | ${refPliego} | ${estado} |`
    );
  }

  // Diferencias textuales rápidas entre A y B
  let diffTextoBlock = '';
  if (planoB && planoA.contenidoTexto && planoB.contenidoTexto) {
    const linesA = new Set(planoA.contenidoTexto.split('\n').map(l => l.trim()).filter(l => l.length > 10));
    const linesB = new Set(planoB.contenidoTexto.split('\n').map(l => l.trim()).filter(l => l.length > 10));
    const soloA = Array.from(linesA).filter(l => !linesB.has(l)).slice(0, 8);
    const soloB = Array.from(linesB).filter(l => !linesA.has(l)).slice(0, 8);

    diffTextoBlock =
      `\n### Diferencias Textuales Detectadas (Plano A vs. Plano B)\n` +
      `- **Solo en Plano A (${soloA.length} muestras):** ${soloA.length > 0 ? soloA.map(s => `\`${s.slice(0, 90)}\``).join(' · ') : 'Sin diferencias textuales'}\n` +
      `- **Solo en Plano B (${soloB.length} muestras):** ${soloB.length > 0 ? soloB.map(s => `\`${s.slice(0, 90)}\``).join(' · ') : 'Sin diferencias textuales'}\n`;
  }

  const headerTabla = planoB
    ? `| Parámetro / Ítem Técnico | Plano A (${planoA.nombre}) | Plano B (${planoB.nombre}) | Referencia en Pliego | Estado |\n|---|---|---|---|---|`
    : `| Parámetro / Ítem Técnico | Plano A (${planoA.nombre}) | Referencia en Pliego | Estado |\n|---|---|---|`;

  return (
    `# Auditoría Comparativa de Planos y Pliegos\n\n` +
    `> ℹ️ **Motor de comparación local activo.** Para inspección visual completa de planos CAD, cotas gráficas, tablas incrustadas y análisis semántico profundo con **Gemini (gemini-3.1-flash-lite)**, configura la clave API en **Settings > Secrets**.\n\n` +
    `### Resumen de Documentos Analizados\n` +
    `- **Plano A:** ${planoA.nombre} (${planoA.paginas} págs., ${planoA.caracteresTexto.toLocaleString('es-AR')} caracteres extraídos)\n` +
    (planoB ? `- **Plano B:** ${planoB.nombre} (${planoB.paginas} págs., ${planoB.caracteresTexto.toLocaleString('es-AR')} caracteres extraídos)\n` : '') +
    `- **Pliegos de Referencia:** ${pliegos.length} documento(s) cargado(s)\n\n` +
    `### Cuadro Comparativo de Parámetros Técnicos\n\n` +
    `${headerTabla}\n` +
    `${filas.join('\n')}\n` +
    `${diffTextoBlock}` +
    (textoPliegosTodo ? `\n### Cláusulas del Pliego Relacionadas\n${recPliego!.fragmentosSeleccionados.slice(0, 3).map(f => `- **${f.pliegoNombre} (Pág. ${f.pagina}):** ${f.texto.slice(0, 260).replace(/\n/g, ' ')}...`).join('\n')}` : '')
  );
}

export { ThinkingLevel };
