export interface ArticuloPliego {
  id: string;
  pliegoCodigo: string;
  pliegoNombre: string;
  seccion: string;
  articulo: string;
  titulo: string;
  tags: string[];
  contenido: string;
  parametrosClave: Record<string, string>;
  tolerancias?: string;
  normativaReferencia: string;
  planosRelacionados: string[];
}

export interface PliegoDocumento {
  codigo: string;
  titulo: string;
  organismo: string;
  ambito: string;
  descripcion: string;
  articulosCount: number;
}

export const LISTA_PLIEGOS_CARGADOS: PliegoDocumento[] = [
  {
    codigo: "PETP-LAT-132",
    titulo: "Pliego de Especificaciones Técnicas Particulares - Línea 132 kV",
    organismo: "Comitente Tucumán / TRANSNOA S.A.",
    ambito: "LAT El Bracho - Villa Quinteros (56 km)",
    descripcion: "Conductores 300/50 mm², cable OPGW 24 FO, torres reticuladas, fundaciones H-25, stubs, aisladores y PAT de estructuras.",
    articulosCount: 7
  },
  {
    codigo: "PETP-ET-132",
    titulo: "Pliego de Especificaciones Técnicas Particulares - Estaciones Transformadoras",
    organismo: "Comitente Tucumán / TRANSNOA S.A.",
    ambito: "ET Leales, ET Villa Quinteros y ET El Bracho",
    descripcion: "Transformadores 132/33/13.2 kV 30 MVA, interruptores SF6, seccionadores, malla PAT R≤0.5Ω y sistema SAS IEC 61850.",
    articulosCount: 6
  },
  {
    codigo: "PBCP-LEGAL",
    titulo: "Pliego de Bases y Condiciones Particulares - Régimen Contractual y SLA",
    organismo: "Fideicomiso Obras 132 kV / Comitente",
    ambito: "General - Contratista UTE y Supervisión",
    descripcion: "Circuito de aprobación de planos (SLA 15 días), emisión de sellos APC, multas por mora (0.1% diario) y ruta crítica.",
    articulosCount: 4
  },
  {
    codigo: "PETP-CRUCES",
    titulo: "Pliego de Especificaciones Técnicas de Cruces e Interferencias",
    organismo: "TGN, DNV (Ruta 38), FFCC Belgrano Cargas, EDET",
    ambito: "Traza y vanos especiales de la LAT 132 kV",
    descripcion: "Distancias mínimas de seguridad, gálibos verticales (≥10m TGN, ≥10.5m DNV), protecciones catódicas y doble aislación.",
    articulosCount: 4
  },
  {
    codigo: "PETP-ENSAYOS",
    titulo: "Protocolo Contractual de Ensayos FAT, SAT y Puesta en Servicio",
    organismo: "TRANSNOA S.A. / CAMMESA",
    ambito: "Recepción de fábrica y campo de equipos mayores",
    descripcion: "Rigidez dieléctrica, SFRA en transformadores, corte de interruptores, ensayo de calentamiento y protocolos de energización.",
    articulosCount: 3
  }
];

export const ARTICULOS_PLIEGOS: ArticuloPliego[] = [
  // --- PETP-LAT-132 ---
  {
    id: "LAT-ART-02",
    pliegoCodigo: "PETP-LAT-132",
    pliegoNombre: "PETP Línea Aérea 132 kV",
    seccion: "Conductores y Accesorios",
    articulo: "Art. 2",
    titulo: "Conductor de Fase de Aluminio con Alma de Acero (Al/Ac 300/50 mm²)",
    tags: ["conductor", "fase", "al/ac", "aluminio", "acero", "300/50", "peace river", "flecha", "tiro", "iram 2187"],
    contenido: 
      "Los conductores de fase de la línea de alta tensión serán de aleación de Aluminio con alma de Acero cincado de sección nominal 300/50 mm² (designación IRAM 2187-1, tipo Peace River o Grosbeak).\n" +
      "• Tiro de rotura mínimo garantizado: 9.870 daN.\n" +
      "• Módulo de elasticidad: Inicial 7.200 daN/mm², Final 8.200 daN/mm².\n" +
      "• Coeficiente de dilatación lineal: 17.8 × 10⁻⁶ 1/°C.\n" +
      "• Tensión de tendido admisible: Máxima del 22% del tiro de rotura a temperatura media de 15°C sin viento; y máxima del 33% a solicitación extrema (-5°C con viento de 130 km/h).\n" +
      "• Temperatura máxima de diseño: +50°C en régimen continuo permanente, y +75°C para sobrecarga de emergencia admisible por cortocircuito de 1 segundo.",
    parametrosClave: {
      "Sección nominal": "300 mm² aluminio / 50 mm² acero",
      "Tiro de rotura mínimo": "9.870 daN",
      "Tensión máxima de tendido (EDS)": "22% de rotura a 15°C",
      "Temperatura régimen continuo": "+50°C",
      "Norma de fabricación": "IRAM 2187-1 / IEC 61089"
    },
    tolerancias: "Tolerancia en flechado entre fases del mismo vano: máximo ± 50 mm. Tensión mecánica de tendido: tolerancia ± 2.5% respecto a la tabla de tendido aprobada.",
    normativaReferencia: "IRAM 2187-1, CIRSOC 102, AEA 95301",
    planosRelacionados: ["L-EB-VQ-OE-PL-001", "L-EB-VQ-OE-MD-001", "Planilla de Tendido y Flechado"]
  },
  {
    id: "LAT-ART-03",
    pliegoCodigo: "PETP-LAT-132",
    pliegoNombre: "PETP Línea Aérea 132 kV",
    seccion: "Cables de Guardia y Telecomunicaciones",
    articulo: "Art. 3",
    titulo: "Cable de Guardia Óptico (OPGW 24 FO) y Cable de Acero 50 mm²",
    tags: ["opgw", "cable de guardia", "fibra optica", "24 fo", "acero 50", "telecomunicaciones", "apantallamiento"],
    contenido:
      "La protección contra descargas atmosféricas y el canal de datos/teleprotección se resolverá mediante dos cables de guardia en la cúspide de las torres:\n" +
      "• Cable OPGW: Con tubo central de acero inoxidable hermético alojando 24 fibras ópticas monomodo según recomendación ITU-T G.652D. Capas exteriores compuestas por alambres de acero recubierto de aluminio (ACS) y aleación de aluminio. Diámetro exterior 11.4 mm. Resistencia térmica de cortocircuito: 65 kA²·s (mínimo 8.5 kA en 0.9 s). Atenuación óptica máxima garantizada: ≤ 0.36 dB/km en 1310 nm y ≤ 0.22 dB/km en 1550 nm.\n" +
      "• Cable de acero convencional: 50 mm² de sección (7 × 3.00 mm), acero cincado grado Extra Alta Resistencia (EHS) según IRAM 722, con carga de rotura ≥ 4.800 daN.\n" +
      "• Apantallamiento: El ángulo de protección en todo vano respecto a los conductores de fase no superará los 30°.",
    parametrosClave: {
      "Fibras ópticas": "24 FO monomodo ITU-T G.652D",
      "Atenuación óptica a 1550 nm": "≤ 0.22 dB/km",
      "Capacidad térmica I²t": "≥ 65 kA²·s",
      "Ángulo apantallamiento": "≤ 30 grados",
      "Cable acero secundario": "50 mm² EHS (IRAM 722)"
    },
    tolerancias: "La flecha del cable de guardia OPGW en cualquier condición de carga debe ser igual o inferior al 90% de la flecha del conductor de fase en el mismo vano.",
    normativaReferencia: "ITU-T G.652D, IEEE 1138, IEC 60794-4-10, IRAM 722",
    planosRelacionados: ["L-EB-VQ-OE-PL-005", "L-EB-VQ-OE-MD-004 (Memoria OPGW)"]
  },
  {
    id: "LAT-ART-04",
    pliegoCodigo: "PETP-LAT-132",
    pliegoNombre: "PETP Línea Aérea 132 kV",
    seccion: "Aisladores y Cadenas",
    articulo: "Art. 4",
    titulo: "Aisladores de Vidrio Templado y Poliméricos de Silicona",
    tags: ["aisladores", "vidrio templado", "polimericos", "silicona", "linea de fuga", "caperuza y perno", "cadena"],
    contenido:
      "Las cadenas de aisladores serán aptas para nivel de tensión nominal 132 kV (tensión máxima 145 kV) y nivel de contaminación media-alta:\n" +
      "• Aisladores de vidrio: Tipo caperuza y perno de acoplamiento a rótula (IEC 60305, IRAM 2073). Carga de rotura electromecánica mínima: 120 kN para suspensión simple y 160 kN para retención.\n" +
      "• Cadenas poliméricas opcionales: Núcleo de resina de fibra de vidrio con vaina e изолиadores de goma de silicona hidrofóbica vulcanizada en caliente (HTV) de una sola pieza, libres de costuras.\n" +
      "• Línea de fuga específica mínima: 25 mm por kV de tensión máxima de fase (mínimo absoluto 3.625 mm por cadena).\n" +
      "• Configuración: Mínimo 10 discos estándar (146 × 254 mm) en suspensión y 11 discos en retenciones dobles.",
    parametrosClave: {
      "Carga electromecánica suspensión": "120 kN",
      "Carga electromecánica retención": "160 kN",
      "Línea de fuga específica": "≥ 25 mm/kV (mínimo 3.625 mm)",
      "Discos por cadena": "10 en suspensión / 11 en retención",
      "Distancia cuernos de arco": "1.150 mm"
    },
    tolerancias: "Desalineación de pernos o juego axial en rótulas: máximo 1 mm según galgas de control IEC 60120.",
    normativaReferencia: "IEC 60305, IEC 61109, IRAM 2073, IRAM 2404",
    planosRelacionados: ["L-EB-VQ-OE-PL-010 (Cadenas y Morsetería 132 kV)"]
  },
  {
    id: "LAT-ART-05",
    pliegoCodigo: "PETP-LAT-132",
    pliegoNombre: "PETP Línea Aérea 132 kV",
    seccion: "Estructuras Metálicas",
    articulo: "Art. 5",
    titulo: "Torres Reticuladas de Acero Galvanizado y Tolerancias de Montaje",
    tags: ["torres", "reticulado", "acero", "galvanizado", "montaje", "tolerancia", "verticalidad", "bulones", "astm a123"],
    contenido:
      "Las estructuras serán torres autosoportadas de celosía de acero estructural (ASTM A36 y ASTM A572 Grado 50), galvanizadas por inmersión en caliente según ASTM A123 / IRAM 60712:\n" +
      "• Espesor mínimo de recubrimiento de cinc: 85 µm (610 g/m²).\n" +
      "• Bulonería: De alta resistencia clase ISO 8.8 cincada con tuerca y contratuerca o arandela de seguridad tipo Grower.\n" +
      "• Tolerancias estrictas de montaje:\n" +
      "  a) Desvío de verticalidad del eje de la torre respecto a la plomada teórica: no mayor a 1:1000 de la altura total de la estructura (ej: máx. 30 mm en una torre de 30 m).\n" +
      "  b) Desvío angular de crucetas respecto al eje de la traza: máximo ± 10 minutos de arco.\n" +
      "  c) Desnivel entre extremos de crucetas: no superior a ± 10 mm.",
    parametrosClave: {
      "Acero estructural": "ASTM A36 / ASTM A572 Gr. 50",
      "Espesor de galvanizado": "≥ 85 µm (ASTM A123)",
      "Bulonería": "Grado 8.8 (ISO 898-1)",
      "Tolerancia de verticalidad": "Máx 1/1000 de la altura",
      "Tolerancia cruceta": "± 10 mm cota / 10' angular"
    },
    tolerancias: "Verticalidad: 1:1000. Cota en coronamiento de fundación: ± 3 mm. Descuadre en base de patas: ± 5 mm.",
    normativaReferencia: "ASTM A123, ASTM A394, CIRSOC 301, AEA 95301",
    planosRelacionados: ["L-EB-VQ-OC-PL-101 a 115 (Siluetas y Despiece de Torres)"]
  },
  {
    id: "LAT-ART-06",
    pliegoCodigo: "PETP-LAT-132",
    pliegoNombre: "PETP Línea Aérea 132 kV",
    seccion: "Fundaciones y Obras Civiles",
    articulo: "Art. 6",
    titulo: "Fundaciones de Hormigón H-25, Ensayos de Resistencia y Curado",
    tags: ["hormigon", "h25", "h-25", "fundaciones", "stubs", "curado", "probetas", "conodeabrams", "recubrimiento", "cirsoc 201"],
    contenido:
      "Todas las fundaciones de torres y monobloques de la traza serán de hormigón armado estructural tipo H-25 según CIRSOC 201:\n" +
      "• Resistencia característica cilíndrica requerida: f'c ≥ 250 kg/cm² (25 MPa) a los 28 días de edad.\n" +
      "• Cemento: Tipo normal o puzolánico resistente a sulfatos (ARS / MRS) en terrenos con presencia de aguas freáticas o sales.\n" +
      "• Asentamiento con Cono de Abrams: Entre 8 y 12 cm medido en obra al momento de la descarga del motohormigonero.\n" +
      "• Toma obligatoria de probetas: Mínimo 3 probetas cilíndricas de 15×30 cm por cada piquete o colada (ensayadas a 7, 14 y 28 días).\n" +
      "• Recubrimiento mínimo de armaduras: 50 mm en contacto directo con suelo natural agresivo; 40 mm si se utiliza hormigón de limpieza H-10 de 10 cm.\n" +
      "• Desencofrado: Laterales de zapata y chimenea no antes de 48 horas. Queda prohibido aplicar tiro o montar la estructura antes de que el hormigón alcance el 85% de la resistencia f'c (mínimo 14 días corridos).\n" +
      "• Curado: Húmedo continuo durante un mínimo ininterrumpido de 7 días con arpillera mojada o película impermeable de base acuosa (ASTM C309).\n" +
      "• Stubs de anclaje: Pernos y stubs fijados milimétricamente con plantilla rígida fijada a estacas firmes antes del colado. Tolerancia en cota de coronamiento: ± 3 mm. Tolerancia diagonal: ± 2 mm.",
    parametrosClave: {
      "Calidad de hormigón": "H-25 (f'c ≥ 250 kg/cm²)",
      "Asentamiento Cono de Abrams": "8 a 12 cm",
      "Probetas por colada": "3 unidades (7, 14 y 28 días)",
      "Recubrimiento armaduras": "50 mm (suelo) / 40 mm (con H-10)",
      "Curado obligatorio": "7 días húmedo ininterrumpido",
      "Tiempo mínimo desencofrado": "48 h lateral / 14 días tiro"
    },
    tolerancias: "Cota de enrase de stubs: ± 3 mm. Desalineación angular en plantilla de stub: ± 2 mm entre diagonales opuestas.",
    normativaReferencia: "CIRSOC 201, IRAM 1503, IRAM 1524, ASTM C39, ASTM C309",
    planosRelacionados: ["L-EB-VQ-OC-PL-501", "ET-LE-OC-PL-501", "Memorias de Cálculo de Fundaciones"]
  },
  {
    id: "LAT-ART-07",
    pliegoCodigo: "PETP-LAT-132",
    pliegoNombre: "PETP Línea Aérea 132 kV",
    seccion: "Puesta a Tierra de Línea",
    articulo: "Art. 7",
    titulo: "Puesta a Tierra de Estructuras (R_pat ≤ 10 Ω) y Contrapesos",
    tags: ["pat", "puesta a tierra", "10 ohm", "resistividad", "contrapeso", "jabalina", "copperweld"],
    contenido:
      "Cada soporte de la línea dispondrá de un sistema de puesta a tierra individual para disipar descargas atmosféricas y evitar contorneos inversos (backflashover):\n" +
      "• Conductor de dispersión: Cable de acero cobreado (Copperweld) o cobre de 50 mm² de sección enterrado a 0.80 m de profundidad mínima.\n" +
      "• Configuración: Cuatro ramas en pata de gallo radiales de 15 metros cada una, terminadas en jabalinas cilíndricas de 5/8\" × 3.0 m de acero cobreado con soldadura cuproaluminotérmica.\n" +
      "• Resistencia máxima admisible: R_pat ≤ 10.0 Ohms en época de suelo seco.\n" +
      "• Suelos de alta resistividad: Si la medición arroja R > 10 Ω, se extenderán contrapesos continuos entre patas consecutivas o se empleará material mejorador higroscópico tipo bentonita.",
    parametrosClave: {
      "Resistencia máxima admisible": "R_pat ≤ 10.0 Ohms",
      "Profundidad de enterramiento": "0.80 metros",
      "Conductor PAT": "50 mm² Copperweld o cobre desnudo",
      "Jabalinas": "5/8\" × 3.00 metros de acero cobreado",
      "Uniones": "Soldadura exotérmica o grampa de bronce pesada"
    },
    tolerancias: "La medición de resistividad de terreno y de resistencia de pata debe efectuarse con telurímetro calibrado con certificado vigente de laboratorio.",
    normativaReferencia: "Norma AEA 95301, TRANSNOA NI-01, IEEE 81",
    planosRelacionados: ["L-EB-VQ-OE-PL-020 (Detalle Puesta a Tierra de Estructuras)"]
  },

  // --- PETP-ET-132 ---
  {
    id: "ET-ART-10",
    pliegoCodigo: "PETP-ET-132",
    pliegoNombre: "PETP Estaciones Transformadoras",
    seccion: "Transformadores de Potencia",
    articulo: "Art. 10",
    titulo: "Transformadores 132/33/13.2 kV 30 MVA, Conexión YNd11d11 y OLTC",
    tags: ["transformador", "trafo", "30 mva", "132/33/13.2", "oltc", "reinhausen", "fat", "sat", "sfra", "tan delta", "aceite", "iec 60076"],
    contenido:
      "Transformadores de potencia trifásicos para intemperie en ET Leales y ET Villa Quinteros:\n" +
      "• Potencias nominales: 30 / 30 / 10 MVA con refrigeración forzada ONAF; 20 / 20 / 6.6 MVA en refrigeración natural ONAN.\n" +
      "• Tensiones nominales: Primario 132 kV ± 10 × 1.5%, Secundario 34.5 kV, Terciario de compensación y servicios auxiliares 13.8 kV.\n" +
      "• Grupo de conexión: YNd11d11 con neutro del primario 132 kV accesible en bornes para puesta a tierra.\n" +
      "• Regulador de tensión bajo carga (OLTC): Marca Maschinenfabrik Reinhausen (MR) en devanado de 132 kV con 17 o 19 tomas y comando motorizado a 110 Vcc.\n" +
      "• Ensayos FAT en Fábrica (IEC 60076): Relación de transformación, impedancia de cortocircuito zcc = 10.5% (tolerancia IEC), pérdidas en vacío y con carga, descargas parciales < 100 pC, y ensayo de calentamiento.\n" +
      "• Ensayos SAT en Obra: Rigidez dieléctrica del aceite aislante ≥ 60 kV (ASTM D877/D1816), humedad en aceite < 15 ppm, Tan Delta (factor de disipación) ≤ 0.5% a 20°C, y ensayo de respuesta en frecuencia SFRA para cotejar contra curva huella de fábrica.",
    parametrosClave: {
      "Potencia nominal ONAF/ONAN": "30/20 MVA",
      "Relación de transformación": "132 ± 10x1.5% / 34.5 / 13.8 kV",
      "Grupo de conexión": "YNd11d11",
      "Impedancia de cortocircuito (zcc)": "10.5% (base 30 MVA)",
      "Rigidez dieléctrica aceite": "≥ 60 kV",
      "Humedad máxima en aceite": "< 15 ppm",
      "Factor de disipación (Tan Delta)": "≤ 0.5% a 20°C"
    },
    tolerancias: "Tolerancia de relación de transformación: ± 0.5% en la toma principal y ± 1.0% en tomas extremas. Tolerancia en impedancia de cortocircuito: ± 7.5% según IEC 60076.",
    normativaReferencia: "IEC 60076, IRAM 2250, IEEE C57.12.00, ASTM D877, ASTM D1816",
    planosRelacionados: ["ET-LE-OEM-ET-001 (Especificación Transformador Leales)", "ET-VQ-OEM-ET-001", "Planilla PTG"]
  },
  {
    id: "ET-ART-11",
    pliegoCodigo: "PETP-ET-132",
    pliegoNombre: "PETP Estaciones Transformadoras",
    seccion: "Interruptores de Potencia 132 kV",
    articulo: "Art. 11",
    titulo: "Interruptores en Gas SF6 de 145 kV, 2000 A y Poder de Corte 31.5 kA",
    tags: ["interruptor", "sf6", "145 kv", "31.5 ka", "2000 a", "densimetro", "bil 650", "iec 62271"],
    contenido:
      "Interruptores tripolares de potencia para intemperie tipo cámara de corte en hexafluoruro de azufre (SF6) con tecnología auto-soplo (puffer):\n" +
      "• Tensión nominal: 145 kV. Tensión de impulso de rayo (BIL): 650 kV pico a tierra y entre fases.\n" +
      "• Corriente nominal en servicio continuo: 2.000 A en campos de acoplamiento y barras; 1.250 A en campos de línea y transformador.\n" +
      "• Capacidad de interrupción de cortocircuito simétrico: 31.5 kA eficaz durante 1 segundo.\n" +
      "• Secuencia de maniobra nominal rápida: O - 0.3 s - CO - 3 min - CO.\n" +
      "• Mando: Mecanismo de resorte motorizado con carga a 110 Vcc, apto para recierre unipolar y tripolar rápido.\n" +
      "• Manometría de SF6: Densímetro con contactos eléctricos compensados en temperatura con dos umbrales: Alarma a 5.2 bar y Bloqueo de apertura/cierre a 5.0 bar.",
    parametrosClave: {
      "Tensión máxima de servicio": "145 kV",
      "Nivel básico de aislamiento (BIL)": "650 kV",
      "Poder de corte en cortocircuito": "31.5 kA (1 s)",
      "Ciclo de maniobra": "O - 0.3s - CO - 3min - CO",
      "Presión de SF6 (Bloqueo)": "5.0 bar relativos",
      "Tensión mando motorizado": "110 Vcc"
    },
    tolerancias: "Discrepancia temporal de apertura entre polos: inferior a 3 milisegundos. Discrepancia de cierre: inferior a 5 milisegundos.",
    normativaReferencia: "IEC 62271-100, IRAM 2211, IEEE C37.04",
    planosRelacionados: ["ET-LE-OEM-PL-201 (Disposición de Aparatos 132 kV)", "ET-VQ-OEM-PL-201"]
  },
  {
    id: "ET-ART-13",
    pliegoCodigo: "PETP-ET-132",
    pliegoNombre: "PETP Estaciones Transformadoras",
    seccion: "Puesta a Tierra de Estación",
    articulo: "Art. 13",
    titulo: "Malla de Puesta a Tierra en Estaciones (R_malla ≤ 0.50 Ω)",
    tags: ["malla", "pat", "puesta a tierra", "0.5 ohm", "cadweld", "tension de paso", "tension de contacto", "cuadricula 10x10", "cobre 95", "ieee 80"],
    contenido:
      "La malla de puesta a tierra general de la estación transformadora debe garantizar la seguridad de personas y equipos bajo corriente de falla de 31.5 kA:\n" +
      "• Conductor principal: Cable de cobre electrolítico de 95 mm² de sección desnudo, enterrado a 0.80 metros de profundidad formando una retícula ortogonal de 10 × 10 m en toda el área de intemperie y sala de control.\n" +
      "• Jabalinas perimetrales: Electrodos de acero-cobre de 5/8\" × 3.0 m hincados en todo el perímetro exterior y junto a tanques de transformador y descargadores de sobretensión.\n" +
      "• Uniones bajo tierra: Se ejecutarán ÚNICAMENTE con soldadura cuproaluminotérmica por fusión exotérmica (tipo Cadweld). Quedan expresamente prohibidos los morsetos mecánicos enterrados.\n" +
      "• Resistencia de dispersión máxima de la malla combinada: R_malla ≤ 0.50 Ohms en cualquier época del año.\n" +
      "• Tensiones de seguridad admisibles (IEEE 80): Tensión de paso ≤ 125 V, Tensión de contacto ≤ 65 V para tiempo de despeje de 0.5 s.\n" +
      "• Capa superficial protectora: Manto de 10 a 15 cm de piedra partida granítica limpia (tamaño 19-32 mm) extendido sobre geotextil en toda la playa de maniobra.",
    parametrosClave: {
      "Resistencia máxima de malla": "R_malla ≤ 0.50 Ohms",
      "Conductor retícula": "Cobre electrolítico desnudo 95 mm²",
      "Profundidad enterramiento": "0.80 metros",
      "Cuadrícula de la malla": "10 × 10 metros",
      "Tipo de unión bajo tierra": "Exclusivamente soldadura exotérmica (Cadweld)",
      "Espesor de piedra partida": "10 a 15 cm",
      "Tensión de paso máxima": "≤ 125 V",
      "Tensión de contacto máxima": "≤ 65 V"
    },
    tolerancias: "Medición de resistencia mediante telurímetro de cuatro bornes método de Wenner y de caída de potencial con inyección de alta corriente desintonizada.",
    normativaReferencia: "IEEE 80, AEA 95201, TRANSNOA NI-08",
    planosRelacionados: ["ET-LE-OEM-PL-313", "ET-VQ-OEM-PL-313 (Malla de Tierra General)"]
  },
  {
    id: "ET-ART-14",
    pliegoCodigo: "PETP-ET-132",
    pliegoNombre: "PETP Estaciones Transformadoras",
    seccion: "Sistema de Control y Protecciones (SAS)",
    articulo: "Art. 14",
    titulo: "Sistema SAS IEC 61850 y Protecciones de Línea (21, 87L) y Trafo (87T)",
    tags: ["sas", "iec 61850", "protecciones", "distancia 21", "diferencial 87l", "diferencial 87t", "buchholz", "prp", "110 vcc"],
    contenido:
      "El sistema de automatización, control y protección de la estación transformadora (SAS) responderá a la norma internacional IEC 61850:\n" +
      "• Red de comunicaciones de proceso y estación: Doble anillo óptico Ethernet redundante bajo protocolo PRP (Parallel Redundancy Protocol, IEC 62439-3), garantizando tiempo de conmutación cero (bumpless).\n" +
      "• Protección Principal 1 de Línea: Relé numérico de distancia de 5 zonas (ANSI 21/21N) con esquema de teleprotección por canal óptico en OPGW.\n" +
      "• Protección Principal 2 de Línea: Relé diferencial de línea segregado por fases (ANSI 87L) comunicado punto a punto mediante fibra óptica monomodo dedicada.\n" +
      "• Protección de Transformador: Relé diferencial porcentual tripolar de 3 devanados (ANSI 87T) con restricción por 2° armónico (inrush) y 5° armónico (sobreexcitación) + relé de sobrecorriente temporizado (51/51N) + Falla de Interruptor (50BF).\n" +
      "• Protecciones mecánicas intrínsecas del transformador: Relé Buchholz de dos flotadores (alarma y disparo directo), válvula de sobrepresión instantánea y termómetro de aceite/devanados con doble contacto.",
    parametrosClave: {
      "Protocolo de comunicaciones": "IEC 61850 Edición 2",
      "Redundancia de red": "PRP (IEC 62439-3 con tiempo cero)",
      "Protección principal línea": "Doble esquema (21/21N + 87L óptico)",
      "Protección transformador": "87T diferencial con restricción de armónicos",
      "Alimentación auxiliar IEDs": "110 Vcc banco baterías"
    },
    tolerancias: "Tiempo de operación del disparo de protección diferencial: inferior a 25 milisegundos. Sincronización de tiempo GPS mediante protocolo IEEE 1588 PTP precisión < 1 µs.",
    normativaReferencia: "IEC 61850, IEC 60255, IEEE C37.90",
    planosRelacionados: ["ET-LE-OE-DG-001 (Unifilar de Protecciones)", "ET-VQ-OE-DG-001"]
  },

  // --- PBCP-LEGAL ---
  {
    id: "PBCP-ART-22",
    pliegoCodigo: "PBCP-LEGAL",
    pliegoNombre: "Pliego de Bases y Condiciones Particulares",
    seccion: "Ingeniería y Control Documental",
    articulo: "Art. 22",
    titulo: "Circuito de Aprobación de Planos, Plazos de Revisión (SLA) y Sello APC",
    tags: ["circuito", "aprobacion", "sla", "15 dias", "sello apc", "apto para construccion", "revision", "transnoa", "ute"],
    contenido:
      "Toda la documentación técnica de ingeniería de detalle y planos ejecutivos seguirá el siguiente procedimiento improrrogable:\n" +
      "1. Emisión inicial: La Contratista (UTE) remitirá los planos en Revisión preliminar (Rev A, B o EO) mediante Nota de Pedido (NP / COMCT2).\n" +
      "2. Plazo de revisión de la Inspección (SLA): La Supervisión de Obra (TRANSNOA / Comitente) dispondrá de un plazo máximo de QUINCE (15) DÍAS CORRIDOS para pronunciarse formalmente mediante Orden de Servicio (OS / COMTC2).\n" +
      "3. Dictámenes posibles: 'Aprobado', 'Aprobado con Observaciones' o 'Rechazado/Observado'.\n" +
      "4. Subsanación de observaciones: Si la Inspección emite observaciones técnicas, la Contratista dispondrá de DIEZ (10) DÍAS CORRIDOS para reemitir el plano con la revisión siguiente subsanada.\n" +
      "5. Sello APC (Apto para Construcción): Obtenida la conformidad técnica final, se estampará el sello 'APC' firmado por la Supervisión. Queda expresamente prohibido ejecutar tareas en obra sin planos con sello APC rubricado.",
    parametrosClave: {
      "Plazo de revisión Inspección (SLA)": "15 días corridos",
      "Plazo de subsanación Contratista": "10 días corridos",
      "Sello habilitante en obra": "APC (Apto para Construcción)",
      "Comunicaciones contractuales": "NP (Contratista ➔ TRANSNOA) y OS (TRANSNOA ➔ Contratista)"
    },
    tolerancias: "Vencido el plazo de 15 días corridos sin pronunciamiento expreso, la Contratista tiene derecho a reiterar mediante NP formal solicitando pronto despacho para deslindar responsabilidades de cronograma.",
    normativaReferencia: "Pliego de Bases y Condiciones Particulares, Ley de Obras Públicas",
    planosRelacionados: ["Histórico de Transmittals", "Matriz de Trazabilidad SLA"]
  },
  {
    id: "PBCP-ART-35",
    pliegoCodigo: "PBCP-LEGAL",
    pliegoNombre: "Pliego de Bases y Condiciones Particulares",
    seccion: "Régimen Sancionatorio",
    articulo: "Art. 35",
    titulo: "Penalidades, Multas por Demora en Hitos Críticos y Rescisión",
    tags: ["penalidades", "multas", "mora", "hitos", "0.1%", "uno por mil", "garantia", "rescision", "fuerza mayor"],
    contenido:
      "Régimen de penalidades aplicables al Contratista por mora culpable en el cumplimiento de los hitos contractuales:\n" +
      "• Multa diaria por mora: Por cada día corrido de atraso injustificado en la consecución de cualquiera de los Hitos Contractuales fijados en el Cronograma Maestro, se aplicará una penalidad equivalente al UNO POR MIL (0.1% o 1‰) del monto total del contrato por cada día de retraso.\n" +
      "• Deducción de certificados: Las multas serán deducidas automáticamente de los certificados mensuales de obra inmediatos posteriores o del fondo de reparo.\n" +
      "• Apercibimiento y rescisión: Si la demora en un hito de la ruta crítica supera los TREINTA (30) DÍAS CORRIDOS continuos, el Comitente intimará a la UTE por 10 días para regularizar el ritmo. Vencido este plazo, podrá decretar la rescisión culpable del contrato, con pérdida de la garantía de cumplimiento (10% del contrato).\n" +
      "• Deslinde de responsabilidad: Para deslindar la multa, la Contratista debe haber notificado fehacientemente dentro de las 48 horas de acaecido el evento de fuerza mayor o la demora atribuible al Comitente / terceros (permisos de paso, liberación de traza o interferencias).",
    parametrosClave: {
      "Multa por día de mora": "0.1% (1‰) del monto contractual por día corrido",
      "Límite de intimación de ruta crítica": "30 días corridos de mora",
      "Póliza de garantía de cumplimiento": "10% del monto total de contrato",
      "Plazo notificación de fuerza mayor": "48 horas hábiles"
    },
    tolerancias: "No se admiten tolerancias en hitos que afecten la fecha de habilitación comercial y energización en el Mercado Eléctrico Mayorista (MEM).",
    normativaReferencia: "Pliego de Bases y Condiciones Particulares Art. 35 a 42",
    planosRelacionados: ["Cronograma Maestro de Hitos", "Curva de Avance Contractual"]
  },

  // --- PETP-CRUCES ---
  {
    id: "CRUCE-ART-40",
    pliegoCodigo: "PETP-CRUCES",
    pliegoNombre: "Pliego Cruces e Interferencias",
    seccion: "Ductos de Hidrocarburos",
    articulo: "Art. 40",
    titulo: "Cruce con Gasoducto Troncal Norte TGN Ø 24\" (NAG-100 / ENARGAS)",
    tags: ["gasoducto", "tgn", "cruce", "nag-100", "enargas", "galibo", "10 metros", "30 metros", "corrosion", "catodica"],
    contenido:
      "Disposiciones obligatorias para el cruce aéreo de la LAT 132 kV sobre el Gasoducto Troncal Norte de TGN (Ø 24\", Piquetes 42 a 43):\n" +
      "• Gálibo vertical libre de seguridad: La distancia vertical mínima entre el conductor más bajo de la LAT a máxima flecha (temperatura +50°C o sobrecarga) y la superficie superior del gasoducto enterrado no será inferior a DIEZ METROS (≥ 10.00 m).\n" +
      "• Distancia horizontal de estructuras: Ningún poste, torre o anclaje de rienda podrá ubicarse a menos de TREINTA METROS (≥ 30.00 m) de la generatriz exterior del ducto.\n" +
      "• Mitigación de corrosión por inducción: Se deberán instalar descargadores de sobretensión tipo óxido de zinc y cupones de puesta a tierra galvánica paralelos para derivar sobretensiones transitorias y voltajes inducidos que puedan perforar el recubrimiento dieléctrico del gasoducto.\n" +
      "• Inspección presencial: Todo trabajo de sondeo, excavación o izaje dentro de la franja de servidumbre de 100 m del gasoducto requiere la presencia obligatoria de un inspector técnico de TGN.",
    parametrosClave: {
      "Gálibo vertical mínimo sobre ducto": "≥ 10.00 metros",
      "Distancia horizontal mínima de torre a ducto": "≥ 30.00 metros",
      "Norma rectora": "NAG-100 / Resoluciones ENARGAS",
      "Franja de seguridad con inspector TGN": "100 metros",
      "Vano afectado": "Piquetes 42 a 43 (Traza LAT 132 kV)"
    },
    tolerancias: "Tolerancia en gálibo: cero por debajo de 10.0 m. La verificación topográfica debe medirse con distanciador láser y tabla de corrección de flecha por temperatura.",
    normativaReferencia: "Norma NAG-100 (ENARGAS), IRAM 20002, TGN Especificación de Cruces",
    planosRelacionados: ["L-EB-VQ-OC-PL-011 (Plano de Cruce Gasoducto TGN)", "Memoria de Interferencia Catódica"]
  },
  {
    id: "CRUCE-ART-41",
    pliegoCodigo: "PETP-CRUCES",
    pliegoNombre: "Pliego Cruces e Interferencias",
    seccion: "Rutas y Autovías",
    articulo: "Art. 41",
    titulo: "Cruce con Autovía Ruta Nacional N° 38 (DNV Res. 2038/98)",
    tags: ["dnv", "ruta 38", "cruce", "galibo", "10.5 metros", "doble cadena", "vialidad", "carretera"],
    contenido:
      "Normas técnicas para el cruce de la LAT 132 kV sobre la traza de la Ruta Nacional N° 38 (Piquetes 78 a 79):\n" +
      "• Gálibo vertical libre sobre coronamiento de calzada: Mínimo DIEZ METROS CON CINCUENTA CENTÍMETROS (≥ 10.50 m) a máxima flecha a +50°C.\n" +
      "• Seguridad en vano de cruce: Las estructuras adyacentes al cruce llevarán cadenas dobles de aisladores con herrajes independientes para evitar caída de fase ante rotura de un aislador.\n" +
      "• Empalmes: Queda estrictamente prohibido cualquier empalme o manguito de reparación del conductor en el vano de cruce sobre la calzada y banquinas.\n" +
      "• Ubicación de postes: Fuera de la zona de camino reglamentaria de la DNV (a más de 35 metros de la línea de borde de calzada).",
    parametrosClave: {
      "Gálibo vertical sobre calzada": "≥ 10.50 metros",
      "Tipo de aislación": "Doble cadena de retención / suspensión",
      "Empalmes en vano de cruce": "Estrictamente prohibidos",
      "Distancia de torres al camino": "≥ 35 metros"
    },
    tolerancias: "Gálibo reglamentario inalterable. Se controlará con termo-distanciómetro en horario de máxima insolación.",
    normativaReferencia: "Resolución DNV 2038/98, Ley Nacional de Tránsito 24.449",
    planosRelacionados: ["L-EB-VQ-OC-PL-012 (Cruce RN 38)", "L-EB-VQ-OC-PL-500"]
  }
];

export function buscarYExtraerArticulosPliego(consulta: string): {
  articulosCoincidentes: ArticuloPliego[];
  resumenExtraccion: string;
} {
  const q = consulta.toLowerCase().trim();
  const palabras = q.split(/\s+/).filter(p => p.length > 2);

  // Score match
  const scored = ARTICULOS_PLIEGOS.map(art => {
    let score = 0;
    const artText = (art.titulo + " " + art.contenido + " " + art.tags.join(" ") + " " + art.articulo + " " + art.pliegoCodigo).toLowerCase();

    // Direct phrase
    if (artText.includes(q)) score += 20;

    // Word matches
    palabras.forEach(pal => {
      if (art.tags.some(t => t.includes(pal))) score += 8;
      if (art.titulo.toLowerCase().includes(pal)) score += 6;
      if (artText.includes(pal)) score += 2;
    });

    return { art, score };
  });

  const filtrados = scored.filter(s => s.score > 0).sort((a, b) => b.score - a.score);
  const seleccionados = (filtrados.length > 0 ? filtrados : scored.slice(0, 2)).slice(0, 3).map(s => s.art);

  // Construir resumen técnico de extracción
  let resumen = "";
  if (seleccionados.length === 1) {
    const a = seleccionados[0];
    resumen = `📖 **Extracción del ${a.pliegoNombre} - ${a.articulo} (${a.titulo}):**\n` +
      `Se identificó el artículo correspondiente a tu solicitud con los parámetros y tolerancias contractuales.\n\n` +
      `${a.contenido}\n\n` +
      `📐 **Tolerancias y Control de Calidad:** ${a.tolerancias || 'Según pliego estándar'}\n` +
      `📚 **Normas Aplicables:** ${a.normativaReferencia}\n` +
      `🔗 **Planos Relacionados:** ${a.planosRelacionados.join(", ")}`;
  } else {
    resumen = `📖 **Extracción de Pliegos Contractuales (${seleccionados.length} artículos identificados):**\n\n` +
      seleccionados.map((a, i) => 
        `### ${i + 1}. [${a.pliegoCodigo}] ${a.articulo} — ${a.titulo}\n` +
        `**Sección:** ${a.seccion}\n` +
        `**Exigencia Contractual:**\n${a.contenido}\n` +
        `**Parámetros Clave:**\n${Object.entries(a.parametrosClave).map(([k, v]) => `• ${k}: **${v}**`).join("\n")}\n` +
        `**Tolerancias:** ${a.tolerancias || 'Conforme a norma'}\n` +
        `**Norma:** ${a.normativaReferencia} | **Planos:** ${a.planosRelacionados.join(", ")}`
      ).join("\n\n---\n\n");
  }

  return {
    articulosCoincidentes: seleccionados,
    resumenExtraccion: resumen
  };
}
