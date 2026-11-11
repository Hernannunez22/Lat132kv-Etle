import { FrenteObra, Hito, Plano, Interferencia } from '../types';

export const TOTAL_PLANIFICADOS_CONTRATO_GLOBAL = 910;

export function matchPlanoFrente(proyecto: string, frenteId: string): boolean {
  if (!frenteId || frenteId === 'TODOS') return true;
  const p = (proyecto || '').toLowerCase();
  if (frenteId === 'LAT') return p.includes('lat') || (p.includes('bracho') && p.includes('villa'));
  if (frenteId === 'Leales') return p.includes('leales');
  if (frenteId === 'Villa Quinteros') return (p.includes('quinteros') || p.includes('vq')) && !p.includes('lat');
  if (frenteId === 'Bracho') return p.includes('bracho') && !p.includes('lat') && !p.includes('villa');
  return p.includes(frenteId.toLowerCase());
}

export const FRENTES_OBRA: FrenteObra[] = [
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

export const HITOS_CONTRATUALES_INICIALES_FIJOS: Hito[] = [
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

export const PLANOS_INICIALES_FIJOS: Plano[] = [
  // LAT El Bracho - Villa Quinteros (18 planos)
  { codigo: "L-EB-VQ-OC-PL-500", descripcion: "Planimetría y Altimetría General de la Traza LAT 132 kV (Progresivas 00k+000 a 56k+400)", disciplina: "Civil / Traza", revision: "0", proyecto: "LAT El Bracho - Villa Quinteros", estado: "Aprobado", selloApc: true, fecha: "2025-11-15" },
  { codigo: "L-EB-VQ-OC-PL-501", descripcion: "Cálculo y Tipologías de Fundaciones Monobloque y Pilotes para Postes de H°A°", disciplina: "Civil / Fundaciones", revision: "A", proyecto: "LAT El Bracho - Villa Quinteros", estado: "En Revisión", selloApc: false, fecha: "2025-12-01" },
  { codigo: "L-EB-VQ-OC-PL-502", descripcion: "Detalles Constructivos de Fundaciones Especiales para Vértices y Retenciones", disciplina: "Civil / Estructuras", revision: "0", proyecto: "LAT El Bracho - Villa Quinteros", estado: "Aprobado", selloApc: true, fecha: "2025-12-10" },
  { codigo: "L-EB-VQ-OC-MD-501", descripcion: "Memoria Técnica de Estudio Geotécnico y Ensayos de Suelo SPT a lo largo de Traza", disciplina: "Geotecnia", revision: "B", proyecto: "LAT El Bracho - Villa Quinteros", estado: "En Revisión", selloApc: false, fecha: "2025-12-15" },
  { codigo: "L-EB-VQ-OC-MD-503", descripcion: "Memoria Descriptiva de Caminos de Acceso, Instalación de Obrador y Plan Logístico", disciplina: "Civil / Obrador", revision: "0", proyecto: "LAT El Bracho - Villa Quinteros", estado: "Aprobado", selloApc: true, fecha: "2025-11-20" },
  { codigo: "L-EB-VQ-OC-PL-011", descripcion: "Perfil Longitudinal y Detalle de Cruce Especial sobre Gasoducto Troncal Norte TGN", disciplina: "Interferencias", revision: "A", proyecto: "LAT El Bracho - Villa Quinteros", estado: "En Trámite", selloApc: false, fecha: "2026-01-10" },
  { codigo: "L-EB-VQ-OC-PL-012", descripcion: "Perfil Longitudinal y Gálibo Vertical en Cruce con Ruta Nacional N° 38 (DNV)", disciplina: "Interferencias", revision: "A", proyecto: "LAT El Bracho - Villa Quinteros", estado: "En Trámite", selloApc: false, fecha: "2026-01-12" },
  { codigo: "L-EB-VQ-OC-PN-002", descripcion: "Plano Catastral de Parcelario Afectado por Servidumbre Administrativa de Electroducto", disciplina: "Catastro / SAE", revision: "0", proyecto: "LAT El Bracho - Villa Quinteros", estado: "Aprobado", selloApc: true, fecha: "2025-11-30" },
  { codigo: "L-EB-VQ-OEM-PL-200", descripcion: "Arboladura y Siluetas de Estructuras de Hormigón Armado para 132 kV Simple Terna", disciplina: "Electromecánico", revision: "0", proyecto: "LAT El Bracho - Villa Quinteros", estado: "Aprobado", selloApc: true, fecha: "2025-12-20" },
  { codigo: "L-EB-VQ-OEM-PL-300", descripcion: "Conjunto General de Morsetería y Herrajes de Suspensión y Retención 132 kV", disciplina: "Electromecánico", revision: "A", proyecto: "LAT El Bracho - Villa Quinteros", estado: "En Revisión", selloApc: false, fecha: "2026-01-05" },
  { codigo: "L-EB-VQ-OEM-PL-301", descripcion: "Cadenas de Aisladores de Vidrio Templado Tipo Fog / Estándar para 132 kV", disciplina: "Electromecánico", revision: "0", proyecto: "LAT El Bracho - Villa Quinteros", estado: "Aprobado", selloApc: true, fecha: "2026-01-08" },
  { codigo: "L-EB-VQ-OEM-PL-302", descripcion: "Distribución de Amortiguadores Tipo Stockbridge para Conductor Al/Ac 300/50 mm²", disciplina: "Electromecánico", revision: "0", proyecto: "LAT El Bracho - Villa Quinteros", estado: "Aprobado", selloApc: true, fecha: "2026-01-15" },
  { codigo: "L-EB-VQ-OEM-PL-510", descripcion: "Tabla de Tensado y Flechado de Conductores Al/Ac y Cable de Guardia OPGW", disciplina: "Cálculo Mecánico", revision: "A", proyecto: "LAT El Bracho - Villa Quinteros", estado: "En Revisión", selloApc: false, fecha: "2026-01-20" },
  { codigo: "L-EB-VQ-OEM-ET-001", descripcion: "Especificación Técnica de Provisión de Conductor de Aluminio con Alma de Acero", disciplina: "Suministros", revision: "0", proyecto: "LAT El Bracho - Villa Quinteros", estado: "Aprobado", selloApc: true, fecha: "2025-12-05" },
  { codigo: "L-EB-VQ-OEM-ET-002", descripcion: "Especificación Técnica para Cable Guardia con Fibras Ópticas Incorporadas (OPGW)", disciplina: "Suministros", revision: "0", proyecto: "LAT El Bracho - Villa Quinteros", estado: "Aprobado", selloApc: true, fecha: "2025-12-08" },
  { codigo: "L-EB-VQ-OEM-MD-300", descripcion: "Memoria de Cálculo de Puesta a Tierra (PAT) de Estructuras y Dispersores Contrapeso", disciplina: "Puesta a Tierra", revision: "A", proyecto: "LAT El Bracho - Villa Quinteros", estado: "En Revisión", selloApc: false, fecha: "2026-01-25" },
  { codigo: "L-EB-VQ-OE-MD-001", descripcion: "Estudio de Coordinación de Aislamiento y Sobretensiones Atmosféricas LAT 132 kV", disciplina: "Estudios Eléctricos", revision: "B", proyecto: "LAT El Bracho - Villa Quinteros", estado: "En Revisión", selloApc: false, fecha: "2026-02-01" },
  { codigo: "L-EB-VQ-TCYP-PL-100", descripcion: "Diagrama de Empalmes y Cajas de Conexión de Fibra Óptica OPGW en Estructuras", disciplina: "Telecomunicaciones", revision: "0", proyecto: "LAT El Bracho - Villa Quinteros", estado: "Aprobado", selloApc: true, fecha: "2026-02-05" },

  // ET Leales (16 planos)
  { codigo: "ET-LE-OC-PL-500", descripcion: "Plano de Movimiento de Suelos, Plataforma y Nivelación General ET Leales", disciplina: "Civil / Suelos", revision: "0", proyecto: "ET Leales", estado: "Aprobado", selloApc: true, fecha: "2025-11-25" },
  { codigo: "ET-LE-OC-PL-501", descripcion: "Replanteo General y Coordenadas de Pórticos y Bases de Equipos 132 kV", disciplina: "Civil / Replanteo", revision: "A", proyecto: "ET Leales", estado: "En Revisión", selloApc: false, fecha: "2025-12-18" },
  { codigo: "ET-LE-OC-PL-505", descripcion: "Fundaciones de Hormigón Armado para Transformadores de Potencia 132/33/13.2 kV", disciplina: "Civil / Estructuras", revision: "A", proyecto: "ET Leales", estado: "En Revisión", selloApc: false, fecha: "2026-01-14" },
  { codigo: "ET-LE-OC-MD-513", descripcion: "Estudio Geotécnico, Perfiles Estratigráficos y Capacidad Portante Predio ET Leales", disciplina: "Geotecnia", revision: "0", proyecto: "ET Leales", estado: "Aprobado", selloApc: true, fecha: "2025-11-18" },
  { codigo: "ET-LE-OC-PL-520", descripcion: "Red de Desagües Pluviales, Fosas de Retención de Aceite y Separador de Hidrocarburos", disciplina: "Civil / Hidráulica", revision: "B", proyecto: "ET Leales", estado: "En Revisión", selloApc: false, fecha: "2026-01-18" },
  { codigo: "ET-LE-OEM-PL-300", descripcion: "Disposición Electromecánica General en Planta - Campo de 132 kV y Transformación", disciplina: "Electromecánico", revision: "0", proyecto: "ET Leales", estado: "Aprobado", selloApc: true, fecha: "2025-12-22" },
  { codigo: "ET-LE-OEM-PL-301", descripcion: "Cortes Electromecánicos Transversales y Longitudinales - Campo 132 kV", disciplina: "Electromecánico", revision: "A", proyecto: "ET Leales", estado: "En Revisión", selloApc: false, fecha: "2026-01-10" },
  { codigo: "ET-LE-OEM-PL-310", descripcion: "Detalle de Conexiones de Alta Tensión a Interruptores y Seccionadores de 132 kV", disciplina: "Electromecánico", revision: "0", proyecto: "ET Leales", estado: "Aprobado", selloApc: true, fecha: "2026-01-22" },
  { codigo: "ET-LE-OEM-PL-313", descripcion: "Malla de Puesta a Tierra (PAT) Principal en Cobre y Cálculo de Tensiones Paso/Contacto", disciplina: "Puesta a Tierra", revision: "A", proyecto: "ET Leales", estado: "En Revisión", selloApc: false, fecha: "2026-01-28" },
  { codigo: "ET-LE-OEM-ET-001", descripcion: "Especificación Técnica y Planilla Garantizada (PTG) Transformador 30/30/30 MVA", disciplina: "Equipos Mayores", revision: "0", proyecto: "ET Leales", estado: "Aprobado", selloApc: true, fecha: "2025-12-02" },
  { codigo: "ET-LE-OEM-ET-002", descripcion: "Especificación Técnica de Interruptores Tripolares en SF6 132 kV 2000 A 31.5 kA", disciplina: "Equipos Mayores", revision: "0", proyecto: "ET Leales", estado: "Aprobado", selloApc: true, fecha: "2025-12-04" },
  { codigo: "ET-LE-OEM-ET-003", descripcion: "Especificación Técnica de Seccionadores de Barra y Línea con Cuchilla de PAT", disciplina: "Equipos Mayores", revision: "0", proyecto: "ET Leales", estado: "Aprobado", selloApc: true, fecha: "2025-12-07" },
  { codigo: "ET-LE-OE-MD-001", descripcion: "Estudio Eléctrico de Flujo de Potencia, Cortocircuito y Regulación de Tensión Etapa I/II", disciplina: "Estudios Eléctricos", revision: "A", proyecto: "ET Leales", estado: "En Revisión", selloApc: false, fecha: "2026-01-30" },
  { codigo: "ET-LE-TCYP-PL-100", descripcion: "Diagrama Unifilar General de Medición, Protección y Comando 132 / 33 / 13.2 kV", disciplina: "Control y Protecciones", revision: "0", proyecto: "ET Leales", estado: "Aprobado", selloApc: true, fecha: "2026-01-16" },
  { codigo: "ET-LE-TCYP-PL-105", descripcion: "Esquema Funcional de Disparo, Bloqueo y Recierre Automático Campo 132 kV", disciplina: "Control y Protecciones", revision: "A", proyecto: "ET Leales", estado: "En Revisión", selloApc: false, fecha: "2026-02-02" },
  { codigo: "ET-LE-TCYP-DG-001", descripcion: "Arquitectura del Sistema de Telecontrol y Comunicaciones SCADA bajo Protocolo IEC 61850", disciplina: "Comunicaciones", revision: "A", proyecto: "ET Leales", estado: "En Revisión", selloApc: false, fecha: "2026-02-04" },

  // ET Villa Quinteros (10 planos)
  { codigo: "ET-VQ-OC-MD-510", descripcion: "Memoria Técnica y Geotécnica de Adecuación Civil y Ampliación de Pórticos ET VQ", disciplina: "Civil / Suelos", revision: "0", proyecto: "ET Villa Quinteros", estado: "Aprobado", selloApc: true, fecha: "2025-11-28" },
  { codigo: "ET-VQ-OC-PL-500", descripcion: "Planimetría de Nuevos Accesos y Adecuación de Calzadas Internas ET Villa Quinteros", disciplina: "Civil / Vial", revision: "A", proyecto: "ET Villa Quinteros", estado: "En Revisión", selloApc: false, fecha: "2025-12-28" },
  { codigo: "ET-VQ-OC-PL-501", descripcion: "Bases de Hormigón Armado para Nuevos Transformadores de Medición (TI / TV) 132 kV", disciplina: "Civil / Estructuras", revision: "0", proyecto: "ET Villa Quinteros", estado: "Aprobado", selloApc: true, fecha: "2026-01-09" },
  { codigo: "ET-VQ-OEM-PL-300", descripcion: "Disposición Electromecánica de Ampliación de Campo de Entrada LAT 132 kV", disciplina: "Electromecánico", revision: "A", proyecto: "ET Villa Quinteros", estado: "En Revisión", selloApc: false, fecha: "2026-01-17" },
  { codigo: "ET-VQ-OEM-PL-313", descripcion: "Vinculación de Malla de Puesta a Tierra Existente con Nuevo Sector de Ampliación", disciplina: "Puesta a Tierra", revision: "0", proyecto: "ET Villa Quinteros", estado: "Aprobado", selloApc: true, fecha: "2026-01-23" },
  { codigo: "ET-VQ-OEM-ET-001", descripcion: "Especificación Técnica para Transformadores de Corriente y Tensión 132 kV", disciplina: "Equipos", revision: "0", proyecto: "ET Villa Quinteros", estado: "Aprobado", selloApc: true, fecha: "2025-12-12" },
  { codigo: "ET-VQ-OEM-PL-320", descripcion: "Disposición de Descargadores de Sobretensión de Óxido de Zinc (ZnO) en Llegada LAT", disciplina: "Electromecánico", revision: "0", proyecto: "ET Villa Quinteros", estado: "Aprobado", selloApc: true, fecha: "2026-01-26" },
  { codigo: "ET-VQ-TCYP-PL-100", descripcion: "Esquema Unifilar y de Protecciones Diferencial de Barras y Distancia de Línea (21)", disciplina: "Protecciones", revision: "A", proyecto: "ET Villa Quinteros", estado: "En Revisión", selloApc: false, fecha: "2026-02-03" },
  { codigo: "ET-VQ-TCYP-DG-001", descripcion: "Integración de Señales de Telecontrol a Unidad Terminal Remota (RTU) Existente", disciplina: "Telecontrol", revision: "0", proyecto: "ET Villa Quinteros", estado: "Aprobado", selloApc: true, fecha: "2026-02-06" },
  { codigo: "ET-VQ-TCYP-PL-200", descripcion: "Listado de Cables de Comando, Señalización y Alimentación Auxiliar de CC y CA", disciplina: "Cableado", revision: "A", proyecto: "ET Villa Quinteros", estado: "En Revisión", selloApc: false, fecha: "2026-02-08" },

  // ET El Bracho (4 planos)
  { codigo: "ET-BR-OC-MD-501", descripcion: "Estudio Geotécnico y Verificación de Estabilidad para Campo de Salida ET El Bracho", disciplina: "Geotecnia", revision: "0", proyecto: "ET El Bracho", estado: "Aprobado", selloApc: true, fecha: "2025-12-03" },
  { codigo: "ET-BR-OC-PL-500", descripcion: "Plano de Replanteo y Fundaciones de Pórtico Terminal de Salida 132 kV", disciplina: "Civil / Replanteo", revision: "A", proyecto: "ET El Bracho", estado: "En Revisión", selloApc: false, fecha: "2026-01-11" },
  { codigo: "ET-BR-OEM-PL-300", descripcion: "Disposición Electromecánica y Vano Flojo de Salida de Línea hacia Villa Quinteros", disciplina: "Electromecánico", revision: "0", proyecto: "ET El Bracho", estado: "Aprobado", selloApc: true, fecha: "2026-01-19" },
  { codigo: "ET-BR-TCYP-PL-101", descripcion: "Adecuación de Paneles de Protección y Acople Óptico de Teleprotección ET El Bracho", disciplina: "Protecciones", revision: "A", proyecto: "ET El Bracho", estado: "En Revisión", selloApc: false, fecha: "2026-02-05" }
];

export const INTERFERENCIAS_INICIALES: Interferencia[] = [
  {
    id: "INT-1",
    empresa: "Transportadora de Gas del Norte (TGN)",
    tipoInterferencia: "Cruce con Gasoducto Troncal Norte Ø 24\"",
    normativa: "NAG-100 / ENARGAS",
    estadoTramite: "LISTO PARA PRESENTAR",
    vanosAfectados: "Piquetes 42 a 43 (Vano 42)",
    faltantes: []
  },
  {
    id: "INT-2",
    empresa: "Dirección Nacional de Vialidad (DNV)",
    tipoInterferencia: "Cruce con Autovía Ruta Nacional N° 38",
    normativa: "Res. DNV 2038/98 Gálibos Mínimos",
    estadoTramite: "LISTO PARA PRESENTAR",
    vanosAfectados: "Piquetes 78 a 79 (Km 742)",
    faltantes: []
  },
  {
    id: "INT-3",
    empresa: "Gasnor S.A.",
    tipoInterferencia: "Paralelismo con Ramal de Distribución de Gas Natural",
    normativa: "NAG-108 Protección Catódica",
    estadoTramite: "DOCUMENTACIÓN INCOMPLETA",
    vanosAfectados: "Piquetes 12 a 19 (Tramo Leales)",
    faltantes: ["Medición de resistividad de suelo para ánodos galvánicos", "Memoria de interferencia inductiva en régimen permanente"]
  },
  {
    id: "INT-4",
    empresa: "Trenes Argentinos Cargas / SOFSE",
    tipoInterferencia: "Cruce con Vía Férrea Ramal CC Ferrocarril Belgrano",
    normativa: "Norma Ferrocarriles Argentinos NEFA",
    estadoTramite: "LISTO PARA PRESENTAR",
    vanosAfectados: "Piquetes 104 a 105",
    faltantes: []
  },
  {
    id: "INT-5",
    empresa: "EDET S.A. (Distribuidora Eléctrica Tucumán)",
    tipoInterferencia: "Cruce bajo Líneas de Media Tensión 33 kV y 13.2 kV",
    normativa: "AEA 95301 / Pliego Técnico EDET",
    estadoTramite: "DOCUMENTACIÓN INCOMPLETA",
    vanosAfectados: "Piquetes 28, 51 y 87",
    faltantes: ["Cronograma de cortes programados para tendido", "Acuerdo de reemplazo provisorio de postación de madera por hormigón"]
  }
];
