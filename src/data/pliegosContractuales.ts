import { PliegoReal } from '../types';

/**
 * Busca y extrae fragmentos relevantes de los pliegos reales cargados por el usuario.
 */
export function buscarYExtraerDePliegosReales(
  consulta: string,
  pliegos: PliegoReal[]
): {
  encontrado: boolean;
  resumen: string;
  coincidencias: { pliegoNombre: string; fragmento: string }[];
} {
  if (!pliegos || pliegos.length === 0) {
    return {
      encontrado: false,
      resumen: "⚠️ **No hay pliegos reales cargados en el sistema.**\n\nPor favor, utiliza el botón **'➕ Cargar Pliegos Reales'** para subir tus archivos de pliego (PDF, Word o Texto) o pegar el contenido. Una vez subidos, la IA los leerá de forma permanente y extraerá cualquier exigencia, tolerancia o artículo que solicites.",
      coincidencias: []
    };
  }

  const q = consulta.toLowerCase().trim();
  const palabras = q.split(/\s+/).filter(p => p.length > 2);
  const coincidencias: { pliegoNombre: string; fragmento: string }[] = [];

  for (const pliego of pliegos) {
    const texto = pliego.contenidoTexto || "";
    if (!texto) continue;

    // Buscar párrafos o secciones que coincidan
    const lineas = texto.split(/\n+/);
    for (let i = 0; i < lineas.length; i++) {
      const linea = lineas[i];
      const lineaL = linea.toLowerCase();

      const tienePalabra = palabras.some(p => lineaL.includes(p));
      if (tienePalabra && linea.trim().length > 15) {
        // Tomar contexto circundante de 3 líneas
        const inicio = Math.max(0, i - 1);
        const fin = Math.min(lineas.length, i + 3);
        const fragmento = lineas.slice(inicio, fin).join("\n").trim();

        if (!coincidencias.some(c => c.fragmento === fragmento)) {
          coincidencias.push({
            pliegoNombre: pliego.nombre,
            fragmento: fragmento
          });
        }
        if (coincidencias.length >= 8) break;
      }
    }
  }

  if (coincidencias.length > 0) {
    const resumen = `📖 **Extracción de Pliegos Reales Cargados (${coincidencias.length} fragmentos coincidentes):**\n\n` +
      coincidencias.map((c, idx) => 
        `### ${idx + 1}. Documento: ${c.pliegoNombre}\n${c.fragmento}`
      ).join("\n\n---\n\n");

    return {
      encontrado: true,
      resumen,
      coincidencias
    };
  }

  // Si no hay texto plano extraíble directamente (ej: PDF sin OCR local aún procesándose en Gemini)
  return {
    encontrado: true,
    resumen: `📖 **Pliegos Reales Registrados (${pliegos.length} documento${pliegos.length > 1 ? 's' : ''}):**\n` +
      pliegos.map(p => `• **${p.nombre}** (${p.tamanioTexto || (Math.round(p.tamanioBytes / 1024) + ' KB')}, subido el ${p.fechaSubida})`).join("\n") +
      `\n\n*Procesando solicitud técnica sobre tus documentos reales:* "${consulta}".`,
    coincidencias: []
  };
}
