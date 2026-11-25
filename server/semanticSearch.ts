/**
 * Expansión semántica y comprensión de lenguaje extenso / coloquial para ingeniería 132 kV
 * (LAT, Estaciones Transformadoras, Geotecnia, Civil, Control Documental y Libro de Obra).
 */

export function normalizarTextoSemantico(texto: string): string {
  return (texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s./-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const STOPWORDS_LARGAS = new Set([
  'a', 'al', 'algo', 'algun', 'alguna', 'algunas', 'algunos', 'alla', 'alli', 'ante', 'antes',
  'aqui', 'asi', 'aun', 'aunque', 'bajo', 'bien', 'bueno', 'busca', 'buscar', 'buscame', 'cada',
  'casi', 'che', 'como', 'con', 'contra', 'cual', 'cuales', 'cuando', 'cuanto', 'cuantos',
  'dame', 'dar', 'de', 'decime', 'decir', 'del', 'desde', 'despues', 'dijo', 'donde', 'dos',
  'el', 'ella', 'ellas', 'ellos', 'en', 'entonces', 'entre', 'era', 'es', 'esa', 'esas', 'ese',
  'eso', 'esos', 'esta', 'estaba', 'estamos', 'estan', 'estar', 'estas', 'este', 'esto', 'estos',
  'estoy', 'estuvo', 'explica', 'explicame', 'favor', 'fijate', 'fue', 'fueron', 'hacer', 'haceme',
  'hacia', 'haciendo', 'hasta', 'hay', 'haya', 'hecho', 'hice', 'hizo', 'hola', 'hoy', 'igual',
  'indica', 'indicame', 'informacion', 'la', 'las', 'le', 'les', 'lo', 'los', 'luego', 'mas',
  'me', 'mejor', 'menos', 'mira', 'mirar', 'mismo', 'mucha', 'muchas', 'mucho', 'muchos', 'muy',
  'nada', 'necesito', 'ni', 'no', 'nos', 'nosotros', 'nuestra', 'nuestro', 'o', 'otra', 'otras',
  'otro', 'otros', 'para', 'parece', 'parte', 'pasame', 'pasa', 'pasan', 'pedido', 'pero',
  'pide', 'piden', 'pidiendo', 'puede', 'pueden', 'puedes', 'podes', 'podrias', 'por', 'porque',
  'pregunta', 'primero', 'punto', 'puntos', 'que', 'queda', 'quedan', 'queremos', 'quiero',
  'quien', 'quienes', 'razon', 'real', 'reales', 'respecto', 'resumen', 'resumime', 'saber',
  'se', 'sea', 'segun', 'ser', 'si', 'siendo', 'sin', 'sino', 'sobre', 'solo', 'son', 'su',
  'sus', 'tal', 'tambien', 'tan', 'tanto', 'te', 'tema', 'temas', 'tener', 'tengo', 'tenia',
  'tiene', 'tienen', 'toda', 'todas', 'todo', 'todos', 'trabajos', 'tras', 'tu', 'tus', 'u',
  'un', 'una', 'unas', 'uno', 'unos', 'usted', 'ustedes', 'va', 'vamos', 'van', 'ver', 'vez',
  'vos', 'y', 'ya', 'yo',
]);

interface GrupoSemantico {
  disparadores: RegExp;
  expansiones: string[];
}

const DICCIONARIO_SEMANTICO_132KV: GrupoSemantico[] = [
  {
    disparadores: /\b(pat|puesta a tierra|jabalina|jabalinas|malla|resistividad|wenner|ohms?|ohmios|descarga a tierra|aterramiento|tension de paso|tension de contacto)\b/i,
    expansiones: ['puesta a tierra', 'pat', 'malla', 'resistividad', 'wenner', 'jabalina', 'ohm', 'ieee 80', 'cobre'],
  },
  {
    disparadores: /\b(hormigon|colado|cemento|probeta|asentamiento|h-?2[015]|h-?30|base|bases|zapata|zapatas|fundacion|fundaciones|cimiento|cimientos|platea|pilote|pilotes|armadura|acero|hierro|hierros|adn)\b/i,
    expansiones: ['hormigon', 'h-25', 'h-30', 'h-21', 'fundacion', 'armadura', 'adn-420', 'cirsoc', 'probeta', 'recubrimiento', 'excavacion'],
  },
  {
    disparadores: /\b(suelo|suelos|tierra|tosca|terraplen|terraplenes|relleno|aporte|compactacion|proctor|cbr|spt|napa|freatica|geotecnia|geotecnico|portante|calicata|ensayo de suelo)\b/i,
    expansiones: ['estudio de suelos', 'geotecnia', 'proctor', 'cbr', 'spt', 'terraplen', 'suelo de aporte', 'compactacion', 'capacidad portante', 'napa'],
  },
  {
    disparadores: /\b(conductor|conductores|cable|cables|alambre|aluminio|acsr|aaac|opgw|fibra optica|hilo de guardia|guardia|flecha|tiro|catenaria|vano|vanos|morseteria|amortiguador|grapa)\b/i,
    expansiones: ['conductor', 'acsr', 'opgw', 'hilo de guardia', 'flecha', 'tiro', 'vano', 'morseteria', 'aea 95301'],
  },
  {
    disparadores: /\b(estructura|estructuras|torre|torres|poste|postes|columna|columnas|monoposte|portico|porticos|mensula|cruceta|aislador|aisladores|cadena|cadenas|suspension|retencion|terminal|angular)\b/i,
    expansiones: ['estructura', 'portico', 'columna', 'aislador', 'cadena', 'retencion', 'suspension', 'galvanizado'],
  },
  {
    disparadores: /\b(transformador|trafo|trafos|interruptor|seccionador|descargador|ti|tv|tc|proteccion|protecciones|rele|reles|celda|celdas|tablero|servicios auxiliares|baterias|rectificador|scada|telecontrol)\b/i,
    expansiones: ['transformador', 'interruptor', 'seccionador', 'descargador', 'protecciones', 'servicios auxiliares', 'tablero', 'iec'],
  },
  {
    disparadores: /\b(cruce|cruces|interferencia|interferencias|ente|entes|organismo|vialidad|ruta|autopista|camino|gas|gasoducto|gasnor|ferrocarril|tren|via|telecom|telecomunicaciones|edet|agua|cloaca|canal|rio)\b/i,
    expansiones: ['interferencia', 'cruce', 'vialidad', 'dpv', 'dnv', 'gasnor', 'enargas', 'ferrocarril', 'permiso', 'vano'],
  },
  {
    disparadores: /\b(devolvieron|devolucion|observaron|observacion|rechazaron|rechazo|contestaron|respuesta|respondieron|rebotaron|descargo|intimacion|reclamo|pendiente|falta responder|sin respuesta)\b/i,
    expansiones: ['orden de servicio', 'nota de pedido', 'nota de servicio', 'devolucion', 'observacion', 'descargo', 'transnoa', 'respuesta'],
  },
  {
    disparadores: /\b(leales|et[\s-]?le)\b/i,
    expansiones: ['leales', 'et leales', 'et-le'],
  },
  {
    disparadores: /\b(quinteros|villa quinteros|et[\s-]?vq|\bvq\b)\b/i,
    expansiones: ['quinteros', 'villa quinteros', 'et-vq'],
  },
  {
    disparadores: /\b(bracho|el bracho|et[\s-]?eb|et[\s-]?br|\beb\b)\b/i,
    expansiones: ['bracho', 'el bracho', 'et-eb', 'et-br'],
  },
  {
    disparadores: /\b(linea|lat|traza|corredor|linea alta tension|l[\s-]?eb[\s-]?vq)\b/i,
    expansiones: ['lat', 'linea 132', 'l-eb-vq', 'bracho - villa quinteros'],
  },
  {
    disparadores: /\b(memoria|memorias|descriptiva|especificacion|especificaciones|pliego|contrato|contractual|alcance|criterio|criterios|norma|normativa)\b/i,
    expansiones: ['memoria descriptiva', 'especificacion tecnica', 'pliego', 'etg', 'etp'],
  },
  {
    disparadores: /\b(plazo|plazos|cronograma|fecha|fechas|demora|retraso|atraso|hito|hitos|vencimiento|vence|multa|compromiso|compromisos|minuta|minutas|reunion)\b/i,
    expansiones: ['hito', 'cronograma', 'plazo', 'minuta', 'compromiso', 'fecha limite'],
  },
];

export interface ConsultaExpandida {
  consultaOriginal: string;
  consultaNormalizada: string;
  tokensNucleo: string[];
  tokensExpandidos: string[];
  frasesClave: string[];
  codigosTecnicos: string[];
  consultaEnriquecida: string;
}

/**
 * Analiza mensajes extensos, coloquiales o multipárrafo, elimina muletillas y expande
 * términos técnicos y geográficos del proyecto 132 kV para potenciar la recuperación documental.
 */
export function analizarYExpandirConsulta(
  mensaje: string,
  historialReciente?: string
): ConsultaExpandida {
  const consultaOriginal = (mensaje || '').trim();
  const textoCombinado = [consultaOriginal, historialReciente ? historialReciente.slice(-1200) : '']
    .filter(Boolean)
    .join(' ');
  const consultaNormalizada = normalizarTextoSemantico(consultaOriginal);
  const combinadoNorm = normalizarTextoSemantico(textoCombinado);

  const codigosTecnicos = Array.from(
    new Set(
      (
        textoCombinado.match(
          /\b(?:(?:ET|LAT|L|NP|OS|NS|MIN|MR|LIB)[-_][A-Z0-9]{1,8}(?:[-_][A-Z0-9]{1,8}){0,4}|[A-Z]{2,4}[-_]\d{1,4})\b/gi
        ) || []
      ).map(c => c.toUpperCase())
    )
  ).slice(0, 12);

  const rawTokens = consultaNormalizada
    .replace(/[./]+/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 2 && !STOPWORDS_LARGAS.has(t));

  const tokensNucleo: string[] = [];
  for (const tok of rawTokens) {
    if (!tokensNucleo.includes(tok)) tokensNucleo.push(tok);
    if (tokensNucleo.length >= 36) break;
  }

  // Extraer bigramas/trigramas significativos de frases largas (muy útil cuando la pregunta tiene 3+ líneas)
  const frasesClave: string[] = [];
  const clausulas = consultaNormalizada
    .split(/[.;:?!,\n]+/)
    .map(c => c.trim())
    .filter(Boolean);
  for (const cl of clausulas) {
    const words = cl
      .split(/\s+/)
      .filter(w => w.length >= 3 && !STOPWORDS_LARGAS.has(w));
    for (let i = 0; i < words.length - 1; i++) {
      const bi = `${words[i]} ${words[i + 1]}`;
      if (!frasesClave.includes(bi)) frasesClave.push(bi);
      if (i + 2 < words.length) {
        const tri = `${words[i]} ${words[i + 1]} ${words[i + 2]}`;
        if (!frasesClave.includes(tri)) frasesClave.push(tri);
      }
      if (frasesClave.length >= 24) break;
    }
    if (frasesClave.length >= 24) break;
  }

  const expansionesSet = new Set<string>(tokensNucleo);
  for (const grp of DICCIONARIO_SEMANTICO_132KV) {
    if (grp.disparadores.test(combinadoNorm)) {
      for (const exp of grp.expansiones) {
        const normExp = normalizarTextoSemantico(exp);
        if (normExp) {
          for (const sub of normExp.split(/\s+/)) {
            if (sub.length >= 2 && !STOPWORDS_LARGAS.has(sub)) {
              expansionesSet.add(sub);
            }
          }
          if (normExp.includes(' ') && !frasesClave.includes(normExp)) {
            frasesClave.push(normExp);
          }
        }
      }
    }
  }

  for (const cod of codigosTecnicos) {
    const cNorm = normalizarTextoSemantico(cod);
    if (cNorm) expansionesSet.add(cNorm);
  }

  const tokensExpandidos = Array.from(expansionesSet).slice(0, 48);
  const consultaEnriquecida = [
    tokensNucleo.join(' '),
    tokensExpandidos.filter(t => !tokensNucleo.includes(t)).join(' '),
    codigosTecnicos.join(' '),
  ]
    .filter(Boolean)
    .join(' ')
    .trim();

  return {
    consultaOriginal,
    consultaNormalizada,
    tokensNucleo,
    tokensExpandidos,
    frasesClave: frasesClave.slice(0, 24),
    codigosTecnicos,
    consultaEnriquecida: consultaEnriquecida || consultaOriginal,
  };
}
