/**
 * =========================================================================
 * ARCHIVO: js/state.js
 * Estado global, variables reactivas y constantes maestras de la obra.
 * =========================================================================
 */

let seccionActual = 'dashboard';
let catalogoPlanosLocal = [];
let listaInterferenciasLocal = [];
let listaPliegosLocal = [];
let listaHitosLocal = [];
let ultimoInformeGenerado = "";
let filtroInterferenciasActivo = 'TODOS';
let filtroHitosActivo = 'TODOS';
let proyectoFiltro = 'TODOS';
let historialChatMovil = "";

// Variables de audio, voz y fotos
let reconocimientoVoz = null;
let dictandoConsulta = false;
let dictandoNota = false;
let reconocimientoVozGrabacion = null;
let textoTranscritoEnVivo = "";
let mediaRecorder = null;
let audioChunks = [];
let grabacionTimer = null;
let segundosGrabando = 0;
let listaAudiosCampo = [];
let listaFotosCampo = [];

// TOTAL EXACTO DEL CONTRATO SEGÚN GOOGLE SHEET: 910 PLANOS
// 48 emitidos / 910 planificados = 5.3% de avance real
const TOTAL_PLANIFICADOS_CONTRATO_GLOBAL = 910;

// CRONOGRAMA MAESTRO FIJO INICIAL (Para que nunca vuelva a cero al recargar)
const HITOS_CONTRATUALES_INICIALES_FIJOS = [
  {
    id: "HT-1",
    codigo: "ANT.1-1",
    nombre: "Esquema organizativo para desarrollo de ingeniería de detalle de todo el proyecto",
    frente: "LAT El Bracho - Villa Quinteros",
    fechaObjetivo: "2025-11-12",
    pesoContractual: "GENERAL",
    responsable: "UTE",
    requisitosCriticos: ["Cumplido 12/11/2025"],
    planosRequeridos: ["Documentación Administrativa / Contractual"]
  },
  {
    id: "HT-2",
    codigo: "ANT.1-1",
    nombre: "Acreditación haber dado inicio a la instalación de Obradores y Depósitos",
    frente: "LAT El Bracho - Villa Quinteros",
    fechaObjetivo: "2025-11-12",
    pesoContractual: "GENERAL",
    responsable: "Contratista Obra Civil",
    requisitosCriticos: ["Cumplido 12/11/2025"],
    planosRequeridos: ["L-EB-VQ-OC-MD-503 (Caminos de Acceso y Obrador)"]
  },
  {
    id: "HT-3",
    codigo: "ANT.2-2",
    nombre: "Acreditación relevamiento planialtimétrico, ubicación de caminos de acceso (SAE)",
    frente: "LAT El Bracho - Villa Quinteros",
    fechaObjetivo: "2026-06-15",
    pesoContractual: "SERVIDUMBRE",
    responsable: "UTE (Gestión Permisos)",
    requisitosCriticos: ["Relevamiento de obstáculos georreferenciados"],
    planosRequeridos: ["L-EB-VQ-OC-PL-500 (Planialtimetría Traza)", "L-EB-VQ-OC-MD-503 (Caminos de Acceso y Obrador)"]
  },
  {
    id: "HT-4",
    codigo: "ANT.2-2",
    nombre: "O.C.: Transformadores de Potencia, Reactores, Interruptores, Seccionadores",
    frente: "ET Leales",
    fechaObjetivo: "2026-06-15",
    pesoContractual: "COMPRAS",
    responsable: "UTE / Suministros",
    requisitosCriticos: ["Ensayos FAT en Fábrica y Aprobación de PTG"],
    planosRequeridos: ["ET-LE-OEM-ET-001 (Esp. Transformadores de Potencia)", "Planilla de Características Técnicas Garantizadas (PTG)"]
  },
  {
    id: "HT-5",
    codigo: "ANT.2-2",
    nombre: "Entrega de Estudios Eléctricos Etapa II",
    frente: "LAT El Bracho - Villa Quinteros",
    fechaObjetivo: "2026-06-15",
    pesoContractual: "INGENIERÍA",
    responsable: "Proyectista / UTE",
    requisitosCriticos: ["Modelación en PSS/E y DIgSILENT"],
    planosRequeridos: ["ET-LE-OE-MD-001 (Estudio Eléctrico Etapa I/II)", "L-EB-VQ-OE-MD-001 (Flujo de Cargas y Cortocircuito)"]
  },
  {
    id: "HT-6",
    codigo: "ET-56",
    nombre: "Finalización 100% de estudios de suelo ET VQ",
    frente: "ET Villa Quinteros",
    fechaObjetivo: "2026-07-15",
    pesoContractual: "INGENIERÍA",
    responsable: "Contratista Geotecnia",
    requisitosCriticos: ["Perfiles estratigráficos y protocolos de laboratorio"],
    planosRequeridos: ["ET-VQ-OC-MD-510 (Mecánica de Suelos ET VQ)", "Perfiles Estratigráficos"]
  },
  {
    id: "HT-7",
    codigo: "ET-3",
    nombre: "Finalización 100% de estudios de suelo ET EB",
    frente: "ET El Bracho",
    fechaObjetivo: "2026-08-15",
    pesoContractual: "INGENIERÍA",
    responsable: "Contratista Geotecnia",
    requisitosCriticos: ["Ensayos de penetración SPT y resistividad"],
    planosRequeridos: ["ET-BR-OC-MD-501 (Estudio de Suelos ET EB)"]
  },
  {
    id: "HT-8",
    codigo: "ET-57",
    nombre: "Finalización de proyecto de adecuación de ingresos de las LAT a la ET Villa Quinteros",
    frente: "ET Villa Quinteros",
    fechaObjetivo: "2026-09-15",
    pesoContractual: "INGENIERÍA",
    responsable: "Proyectista",
    requisitosCriticos: ["Adecuación geométrica de pórticos"],
    planosRequeridos: ["ET-VQ-OC-MD-510 (Adecuación Civil)", "ET-VQ-OC-PL-500 (Accesos)"]
  },
  {
    id: "HT-9",
    codigo: "ET-58",
    nombre: "Finalización 50% proyecto ejecutivo ET VQ",
    frente: "ET Villa Quinteros",
    fechaObjetivo: "2026-10-15",
    pesoContractual: "INGENIERÍA",
    responsable: "Proyectista",
    requisitosCriticos: ["50% de planos del elenco ET VQ aprobados"],
    planosRequeridos: ["50% Elenco ET VQ (141/282 Planos)", "ET-VQ-OC-MD-510 (Civil)", "ET-VQ-OEM-PL-313 (Malla PAT)"]
  },
  {
    id: "HT-10",
    codigo: "LAT-194",
    nombre: "Finalización 50% proyecto ejecutivo LAT",
    frente: "LAT El Bracho - Villa Quinteros",
    fechaObjetivo: "2026-10-15",
    pesoContractual: "INGENIERÍA",
    responsable: "Proyectista / TRANSNOA",
    requisitosCriticos: ["50% de planos del elenco LAT emitidos"],
    planosRequeridos: ["50% Elenco LAT (86/173 Planos)", "L-EB-VQ-OC-PL-500 (Traza)", "L-EB-VQ-OC-MD-501 (Suelos)"]
  },
  {
    id: "HT-11",
    codigo: "LAT-191",
    nombre: "Finalización 50% de estudios de suelo",
    frente: "LAT El Bracho - Villa Quinteros",
    fechaObjetivo: "2026-11-15",
    pesoContractual: "INGENIERÍA",
    responsable: "Contratista Geotecnia",
    requisitosCriticos: ["Avance sobre los primeros 28 km de traza"],
    planosRequeridos: ["L-EB-VQ-OC-MD-501 (Estudio Geotécnico Traza LAT)"]
  },
  {
    id: "HT-12",
    codigo: "LAT-222",
    nombre: "Finalización 25% de la longitud de la traza, desmonte, acceso, apertura y limpieza",
    frente: "LAT El Bracho - Villa Quinteros",
    fechaObjetivo: "2026-11-15",
    pesoContractual: "OBRA",
    responsable: "Contratista Obra",
    requisitosCriticos: ["Apertura de camino de servicio piquetes 01 al 35"],
    planosRequeridos: ["L-EB-VQ-OC-PL-500 (Progresivas y Vértices)", "L-EB-VQ-OC-MD-503 (Caminos de Acceso)"]
  }
];

const FRENTES_OBRA = [
  {
    id: 'LAT',
    nombre: 'LAT El Bracho - Villa Quinteros',
    tension: '132 kV',
    tipo: 'Línea de Alta Tensión',
    icono: '⚡',
    totalPlanificados: 173
  },
  {
    id: 'Leales',
    nombre: 'ET Leales',
    tension: '132 / 33 / 13.2 kV',
    tipo: 'Estación Transformadora',
    icono: '🏢',
    totalPlanificados: 529
  },
  {
    id: 'Villa Quinteros',
    nombre: 'ET Villa Quinteros',
    tension: '132 / 33 / 13.2 kV',
    tipo: 'Ampliación y Adecuación ET',
    icono: '🔌',
    totalPlanificados: 282
  },
  {
    id: 'Bracho',
    nombre: 'ET El Bracho',
    tension: '132 kV',
    tipo: 'Salida de Campo & Conexión',
    icono: '🏭',
    totalPlanificados: 99
  }
];