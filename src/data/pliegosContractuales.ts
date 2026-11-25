import { PliegoReal } from '../types';

const STOPWORDS_ES = new Set([
  'los', 'las', 'una', 'uno', 'unos', 'unas', 'con', 'sin', 'por', 'para', 'sobre',
  'entre', 'hasta', 'desde', 'hacia', 'segun', 'según', 'como', 'cómo', 'cual', 'cuál',
  'cuales', 'cuáles', 'que', 'qué', 'quien', 'quién', 'donde', 'dónde', 'cuando', 'cuándo',
  'hay', 'tiene', 'tienen', 'esta', 'está', 'están', 'este', 'esto', 'estos', 'estas',
  'esa', 'ese', 'esos', 'esas', 'del', 'al', 'fue', 'son', 'ser', 'era', 'puede',
  'pueden', 'algun', 'algún', 'alguna', 'algunas', 'algunos', 'todo', 'toda', 'todos',
  'todas', 'mas', 'más', 'pero', 'sino', 'aunque', 'porque', 'ya', 'muy', 'bien',
]);

function normalizarTokenBusq(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Busca y extrae fragmentos relevantes de los pliegos reales cargados por el usuario,
 * rankeando por densidad de términos técnicos reales (sin stopwords como "con", "hay", "para").
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
      resumen:
        "⚠️ **No hay pliegos reales cargados en el sistema.**\n\nPor favor, utiliza el botón **'Pliegos Reales'** para subir tus archivos de pliego (PDF, Word o Texto). Una vez subidos, la IA los leerá de forma permanente y extraerá cualquier exigencia, tolerancia o artículo que solicites.",
      coincidencias: [],
    };
  }

  const qNorm = normalizarTokenBusq(consulta);
  const palabrasBrutas = qNorm
    .replace(/[^a-z0-9_-]+/g, ' ')
    .split(/\s+/)
    .filter(p => p.length >= 3 && !STOPWORDS_ES.has(p));

  const palabras = Array.from(
    new Set(palabrasBrutas.length > 0 ? palabrasBrutas : qNorm.split(/\s+/).filter(p => p.length >= 3))
  );

  const candidatos: { pliegoNombre: string; fragmento: string; score: number }[] = [];
  const vistos = new Set<string>();

  for (const pliego of pliegos) {
    const texto = pliego.contenidoTexto || '';
    if (!texto) continue;

    const lineas = texto.split(/\n+/);
    for (let i = 0; i < lineas.length; i++) {
      const linea = lineas[i];
      if (linea.trim().length <= 15) continue;

      const inicio = Math.max(0, i - 1);
      const fin = Math.min(lineas.length, i + 4);
      const fragmento = lineas.slice(inicio, fin).join('\n').trim();
      if (!fragmento || vistos.has(fragmento)) continue;

      const fragNorm = normalizarTokenBusq(fragmento);
      let distintos = 0;
      let ocurrencias = 0;
      for (const tok of palabras) {
        const re = new RegExp(`\\b${tok.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g');
        const matches = fragNorm.match(re);
        if (matches && matches.length > 0) {
          distintos += 1;
          ocurrencias += Math.min(4, matches.length);
        }
      }

      if (distintos > 0) {
        vistos.add(fragmento);
        const esPortada =
          i < 35 && /indice general|república argentina|ministerio de econom/i.test(fragmento);
        const score = distintos * 25 + ocurrencias * 4 - (esPortada ? 30 : 0);
        candidatos.push({
          pliegoNombre: pliego.nombre,
          fragmento,
          score,
        });
      }
    }
  }

  candidatos.sort((a, b) => b.score - a.score);
  const coincidencias = candidatos.slice(0, 8).map(({ pliegoNombre, fragmento }) => ({
    pliegoNombre,
    fragmento,
  }));

  if (coincidencias.length > 0) {
    const resumen =
      `📖 **Extracción de Pliegos Reales Cargados (${coincidencias.length} fragmentos más relevantes):**\n\n` +
      coincidencias
        .map((c, idx) => `### ${idx + 1}. Documento: ${c.pliegoNombre}\n${c.fragmento}`)
        .join('\n\n---\n\n');

    return {
      encontrado: true,
      resumen,
      coincidencias,
    };
  }

  return {
    encontrado: true,
    resumen:
      `📖 **Pliegos Reales Registrados (${pliegos.length} documento${pliegos.length > 1 ? 's' : ''}):**\n` +
      pliegos
        .map(
          p =>
            `• **${p.nombre}** (${p.tamanioTexto || Math.round(p.tamanioBytes / 1024) + ' KB'}, subido el ${p.fechaSubida})`
        )
        .join('\n') +
      `\n\nNo se hallaron coincidencias literales exactas para "${consulta}" en los fragmentos locales.`,
    coincidencias: [],
  };
}
