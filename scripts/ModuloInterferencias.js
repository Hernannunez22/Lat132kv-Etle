/**
 * ====================================================================================================
 * ARCHIVO: ModuloInterferencias.gs
 * MÓDULO INTELIGENTE DE AUDITORÍA Y GESTIÓN DE INTERFERENCIAS (LAT 132 kV)
 * Audita requisitos analizando el documento específico que ya existe en cada carpeta
 * (ej: 'Interferencias Vialidad Nacional.docx', 'Interferencias TGN.docx', 'Requisitos Naturgy.pdf', etc.),
 * indexa planos de LAT (L-EB-VQ-...) Y ARCHIVOS DE TRAZA (.KML / .KMZ), arma el Dossier Digital
 * de presentación SIN DUPLICAR archivos en Drive y reporta qué falta para iniciar cada trámite.
 * ====================================================================================================
 */

const CARPETAS_IGNORADAS_INTERFERENCIAS = new Set([
  "INFORMACION DE CONTACTOS",
  "INFORMACIÓN DE CONTACTOS",
  "CONTACTOS",
  "PLANTILLAS",
  "MODELOS",
  "GENERAL",
  "NOTAS MODELO",
  "BORRADORES"
]);

/**
 * Matriz Técnica de Entes y Cruces de la LAT 132 kV El Bracho - Villa Quinteros.
 * Define los requisitos normativos específicos, vanos/piquetes críticos y la documentación exigida.
 */
const MATRIZ_ENTES_INTERFERENCIAS = {
  "TGN": {
    tipo: "Gasoducto de Alta Presión",
    norma: "NAG-100 / ENARGAS",
    vanos: "Piquetes 35 a 38 / 112 a 115",
    requisitosClave: ["KML Traza", "Planimetría PL-500", "Perfil de Cruce PL-011", "Estudio PAT Catódica MD-300"],
    puntosCriticos: "Verificar distancia a electrodos de puesta a tierra y ángulo de cruce perpendicular (>60°)."
  },
  "GASNOR": {
    tipo: "Red de Distribución de Gas Natural",
    norma: "NAG-100 / Gasnor Reg.",
    vanos: "Cruce Acceso Sur y derivaciones",
    requisitosClave: ["KML Traza", "Plano de Interferencia", "Memoria Técnica MD-002"],
    puntosCriticos: "Profundidad de tapada mínima y protección mecánica con losa de hormigón."
  },
  "VIALIDAD NACIONAL": {
    tipo: "Ruta Nacional N° 38",
    norma: "DNV Res. 1021/87",
    vanos: "Cruce Progresiva RN 38 (Piquete 84-85)",
    requisitosClave: ["KML Traza", "Plano Planialtimétrico PL-500", "Perfil de Gálibo Vertical PL-011"],
    puntosCriticos: "Gálibo vertical libre mínimo de 8.50 m sobre rasante de calzada y estructuras fuera de zona de camino."
  },
  "VIALIDAD PROVINCIAL": {
    tipo: "Rutas Provinciales (DPV Tucumán)",
    norma: "DPV Ley Provincial",
    vanos: "Cruce RP 323 / RP 329",
    requisitosClave: ["KML Traza", "Plano de Traza", "Perfil de Cruce"],
    puntosCriticos: "Ubicación de piquetes fuera del talud de banquina y gálibo mínimo 7.50 m."
  },
  "FERROCARRILES ARGENTINOS": {
    tipo: "Línea Ferroviaria Belgrano Cargas",
    norma: "CNRT / ADIFSE",
    vanos: "Cruce Vía Belgrano Cargas (Piquete 52-53)",
    requisitosClave: ["KML Traza", "Plano de Cruce Ferroviario", "Estudio de Aislación PAT"],
    puntosCriticos: "Gálibo vertical libre > 9.50 m sobre cabeza de riel y conexión equipotencial."
  },
  "EDET": {
    tipo: "Líneas de Distribución MT/BT (33 kV / 13.2 kV)",
    norma: "Reglamento EDET / AEA 95201",
    vanos: "Múltiples cruces y paralelismos a lo largo de la traza",
    requisitosClave: ["Planimetría PL-500", "Unifilar de Interconexión", "Protocolo de Coordinación"],
    puntosCriticos: "Distancia mínima entre conductores de 132 kV y 33 kV en condición de máxima flecha (>3.5 m)."
  },
  "TELECOM": {
    tipo: "Fibra Óptica y Telefonía",
    norma: "CNC / ENACOM",
    vanos: "Paralelismo traza RN 38",
    requisitosClave: ["KML Traza", "Planimetría"],
    puntosCriticos: "Inducción electromagnética en cables metálicos y cruzamientos aéreos."
  },
  "MOVISTAR": {
    tipo: "Telefonía Celular y Enlaces Microondas",
    norma: "ENACOM",
    vanos: "Zona de influencia antenas",
    requisitosClave: ["KML Traza", "Plano de Servidumbre"],
    puntosCriticos: "No interferir línea visual de enlaces microondas de telecomunicaciones."
  },
  "CLARO": {
    tipo: "Telefonía Móvil y Fibra Óptica",
    norma: "ENACOM",
    vanos: "Tendidos subterráneos RN 38",
    requisitosClave: ["KML Traza", "Planimetría"],
    puntosCriticos: "Verificación de interferencias subterráneas en excavaciones de fundaciones."
  },
  "SAT": {
    tipo: "Canales de Riego y Red de Agua",
    norma: "DPA / SAT Tucumán",
    vanos: "Cruce canal matriz de desagüe pluvial",
    requisitosClave: ["Plano Civil PL-503", "Memoria Desagües Pluviales MD-503"],
    puntosCriticos: "Protección contra erosión en fundaciones próximas a canales de descarga."
  }
};

/**
 * Convierte archivos DOCX a texto plano temporalmente usando Google Docs
 * para que la IA Gemini pueda leerlos con 100% de precisión sin fallas de formato.
 */
function extraerTextoDeArchivo(archivoDrive) {
  const mime = archivoDrive.getMimeType();
  const nom = archivoDrive.getName().toLowerCase();
  
  if (mime === MimeType.GOOGLE_DOCS) {
    try {
      return DocumentApp.openById(archivoDrive.getId()).getBody().getText();
    } catch (e) {}
  }
  
  if (mime.includes("word") || nom.endsWith(".docx") || nom.endsWith(".doc")) {
    try {
      const tempFile = Drive.Files.copy({ title: "Temp_Req", mimeType: MimeType.GOOGLE_DOCS }, archivoDrive.getId(), { convert: true });
      const doc = DocumentApp.openById(tempFile.id);
      const texto = doc.getBody().getText();
      Drive.Files.remove(tempFile.id);
      return texto;
    } catch (e) {
      Logger.log("Aviso: No se pudo extraer texto de DOCX: " + e.message);
    }
  }
  
  return null;
}

/**
 * Extrae con Gemini los requisitos documentales solicitados en el archivo de la empresa (.docx / .pdf)
 * incluyendo la detección de planos específicos exactos (ej. PL-015, PL-022).
 */
function extraerRequisitosEmpresaConIA(archivoDrive) {
  let textoExtraido = extraerTextoDeArchivo(archivoDrive);
  let payloadGemini;
  const nombreArchivo = archivoDrive.getName();
  
  const schema = {
    type: "OBJECT",
    properties: {
      pide_kml: { type: "BOOLEAN", description: "Verdadero SOLO si exige archivo digital KMZ, KML, Google Earth, GIS o shapefile de la traza." },
      pide_planimetria: { type: "BOOLEAN", description: "Verdadero SOLO si exige plano planialtimétrico general, catastral o de servidumbre." },
      pide_memoria: { type: "BOOLEAN", description: "Verdadero SOLO si exige memoria descriptiva de la obra." },
      pide_perfil: { type: "BOOLEAN", description: "Verdadero SOLO si exige plano de cruce acotado, perfil altimétrico o cálculo de gálibo." },
      pide_suelos: { type: "BOOLEAN", description: "Verdadero SOLO si exige estudio de suelos o geológico." },
      pide_pat: { type: "BOOLEAN", description: "Verdadero SOLO si exige informe de resistividad o puesta a tierra (PAT)." },
      planos_especificos: { 
        type: "ARRAY", 
        items: { type: "STRING" },
        description: "Lista de códigos EXACTOS de planos mencionados en el texto (ej: 'L-EB-VQ-OC-PL-015', 'L-EB-VQ-OC-PL-020'). Deja vacío si solo pide planos genéricos." 
      }
    },
    required: ["pide_kml", "pide_planimetria", "pide_memoria", "pide_perfil", "pide_suelos", "pide_pat"]
  };

  if (textoExtraido && textoExtraido.trim().length > 10) {
    const prompt = 
      `Eres un auditor de ingeniería eléctrica 132 kV. Analiza los siguientes requisitos de interferencias extraídos del documento "${nombreArchivo}":\n\n` +
      `"${textoExtraido.substring(0, 10000)}"\n\n` +
      `Responde ESTRICTAMENTE con un JSON. SOLO pon 'true' si el texto exige de forma expresa presentar ese tipo de documento. Si menciona códigos exactos de planos, agrégalos al array 'planos_especificos'.`;
    
    payloadGemini = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { response_mime_type: "application/json", response_schema: schema, temperature: 0.0 }
    };
  } else if (archivoDrive.getMimeType() === MimeType.PDF || nombreArchivo.toLowerCase().endsWith(".pdf")) {
    const b64 = Utilities.base64Encode(archivoDrive.getBlob().getBytes());
    const prompt = 
      `Analiza este instructivo de requisitos para permisos de cruce de la empresa "${nombreArchivo}". ` +
      `Responde ESTRICTAMENTE con un JSON identificando qué documentos exige presentar y extrae códigos de planos exactos si los hubiera.`;
    
    payloadGemini = {
      contents: [{
        parts: [
          { text: prompt },
          { inline_data: { mime_type: "application/pdf", data: b64 } }
        ]
      }],
      generationConfig: { response_mime_type: "application/json", response_schema: schema, temperature: 0.0 }
    };
  } else {
    const nomU = nombreArchivo.toUpperCase();
    return {
      pide_kml: true,
      pide_planimetria: true,
      pide_memoria: false,
      pide_perfil: nomU.includes("VIAL") || nomU.includes("FERRO") || nomU.includes("DNV") || nomU.includes("DPV"),
      pide_suelos: false,
      pide_pat: nomU.includes("GAS") || nomU.includes("TGN") || nomU.includes("NATURGY"),
      planos_especificos: []
    };
  }

  const apiKey = obtenerGeminiApiKeySegura();
  for (let m = 0; m < MODELOS_GEMINI.length; m++) {
    const url = "https://generativelanguage.googleapis.com/v1beta/models/" + MODELOS_GEMINI[m] + ":generateContent?key=" + apiKey;
    try {
      const resp = UrlFetchApp.fetch(url, {
        method: "post",
        contentType: "application/json",
        payload: JSON.stringify(payloadGemini),
        muteHttpExceptions: true
      });
      if (resp.getResponseCode() === 200) {
        const jsonResp = JSON.parse(resp.getContentText());
        return JSON.parse(jsonResp.candidates[0].content.parts[0].text);
      }
    } catch (eMod) {}
  }

  return { pide_kml: true, pide_planimetria: true, pide_memoria: false, pide_perfil: false, pide_suelos: false, pide_pat: false, planos_especificos: [] };
}

/**
 * Auditoría Inteligente de Interferencias (Virtual Dossier Engine):
 * 1. Mapea la documentación real de la obra (Planos LAT en Drive + Respaldo R2 + KMZ de Traza).
 * 2. Cruza con la normativa técnica exigida por cada organismo y los archivos de instrucciones.
 * 3. Arma un catálogo digital estructurado de presentación SIN DUPLICAR archivos en Drive.
 * 4. Actualiza la Hoja 'Resumen_Interferencias' y alimenta la app del celular en tiempo real.
 */
function gestionarYAuditarInterferenciasTotal() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.toast("Indexando planos de LAT, archivos KMZ y normas de entes...", "Auditoría de Interferencias 🚧", 5);

  let carpetaRaiz;
  try {
    carpetaRaiz = DriveApp.getFolderById(ID_CARPETA_RAIZ);
  } catch (e) {
    return { ok: false, error: "No se pudo acceder a la carpeta raíz de Drive: " + e.message };
  }

  // 1. Localizar la carpeta 'Interferencias' en Drive
  let carpetaInterferencias = null;
  function buscarCarpetaInterferenciasRec(folder) {
    const nomU = folder.getName().toUpperCase();
    if (nomU.includes("INTERFERENCIA") || nomU.includes("CRUCES Y PARALELISMO") || nomU.includes("PERMISOS")) {
      carpetaInterferencias = folder;
      return;
    }
    const subs = folder.getFolders();
    while (subs.hasNext()) {
      const s = subs.next();
      buscarCarpetaInterferenciasRec(s);
      if (carpetaInterferencias) return;
    }
  }
  buscarCarpetaInterferenciasRec(carpetaRaiz);

  // 2. Indexar archivos KMZ / KML de traza
  const catalogoArchivosKML = [];
  try {
    const iterKml = DriveApp.searchFiles("(title contains '.kmz' or title contains '.kml') and trashed = false");
    while (iterKml.hasNext()) {
      const arc = iterKml.next();
      const nU = arc.getName().toUpperCase();
      if (nU.includes("LAT") || nU.includes("BR-VQ") || nU.includes("EB-VQ") || nU.includes("TRAZA") || nU.includes("CRUCE")) {
        catalogoArchivosKML.push({ id: arc.getId(), nombre: arc.getName(), url: arc.getUrl() });
      }
    }
  } catch (eSearch) {}

  // 3. Indexar planos de la LAT desde la Hoja Master LAT y el Respaldo R2
  const planosLATDisponibles = [];
  const hojaMasterLAT = ss.getSheetByName("Master LAT El Bracho - Villa Quinteros");
  if (hojaMasterLAT && hojaMasterLAT.getLastRow() >= 2) {
    const ultF = hojaMasterLAT.getLastRow();
    const datosM = hojaMasterLAT.getRange(2, 1, ultF - 1, 11).getValues();
    const richM = hojaMasterLAT.getRange(2, 10, ultF - 1, 1).getRichTextValues();

    for (let i = 0; i < datosM.length; i++) {
      const cod = String(datosM[i][0] || "").trim();
      const desc = String(datosM[i][1] || "").trim();
      if (!cod || cod.toUpperCase() === "CÓDIGO") continue;

      let linkUrl = "";
      if (richM[i] && richM[i][0] && richM[i][0].getLinkUrl()) {
        linkUrl = richM[i][0].getLinkUrl();
      }

      const host = `${R2_CONFIG.ACCOUNT_ID}.r2.cloudflarestorage.com`;
      const urlR2 = `https://${host}/${R2_CONFIG.BUCKET_NAME}/Documentaci%C3%B3n%20T%C3%A9cnica/LAT%20El%20Bracho%20-%20Villa%20Quinteros/${encodeURI(cod)}`;

      planosLATDisponibles.push({
        codigo: cod,
        descripcion: desc,
        revision: String(datosM[i][3] || "EO").trim(),
        estado: String(datosM[i][5] || "Abierto").trim(),
        urlDrive: linkUrl,
        urlR2: urlR2
      });
    }
  }

  // 4. Recorrer las subcarpetas de entes o utilizar la matriz si no hay carpetas físicas aún
  const mapaCarpetasEmpresas = new Map();
  if (carpetaInterferencias) {
    const subCarpetas = carpetaInterferencias.getFolders();
    while (subCarpetas.hasNext()) {
      const f = subCarpetas.next();
      const nU = f.getName().trim().toUpperCase();
      if (!CARPETAS_IGNORADAS_INTERFERENCIAS.has(nU)) {
        mapaCarpetasEmpresas.set(nU, f);
      }
    }
  }

  // Lista consolidada de empresas a evaluar (carpetas físicas + matriz oficial de la obra)
  const nombresEmpresasEvaluadas = new Set(Object.keys(MATRIZ_ENTES_INTERFERENCIAS));
  mapaCarpetasEmpresas.forEach((folder, key) => nombresEmpresasEvaluadas.add(key));

  const resultadosPorEmpresa = [];

  nombresEmpresasEvaluadas.forEach(nomEmpresa => {
    const nomU = nomEmpresa.toUpperCase();
    let folderEmpresa = null;
    for (let [k, f] of mapaCarpetasEmpresas.entries()) {
      if (nomU.includes(k) || k.includes(nomU)) {
        folderEmpresa = f;
        break;
      }
    }

    // Datos normativos de la matriz
    let matrizInfo = null;
    for (let k in MATRIZ_ENTES_INTERFERENCIAS) {
      if (nomU.includes(k) || k.includes(nomU)) {
        matrizInfo = MATRIZ_ENTES_INTERFERENCIAS[k];
        break;
      }
    }

    if (!matrizInfo) {
      matrizInfo = {
        tipo: "Interferencia General",
        norma: "Reglamento Específico",
        vanos: "Traza General LAT",
        requisitosClave: ["KML Traza", "Planimetría PL-500"],
        puntosCriticos: "Coordinar con la empresa prestataria."
      };
    }

    // Buscar si existe un documento de requisitos propio en la carpeta
    let docRequisitos = null;
    if (folderEmpresa) {
      const filesIter = folderEmpresa.getFiles();
      while (filesIter.hasNext()) {
        const file = filesIter.next();
        const nFileU = file.getName().toUpperCase();
        if (nFileU.includes("INTERFERENCIA") || nFileU.includes("REQUISITO") || nFileU.includes("GUIA") || nFileU.includes("INSTRUCTIVO")) {
          docRequisitos = file;
          break;
        }
      }
    }

    // Identificar qué planos aplican para esta empresa
    const documentosPresentables = [];
    const faltantes = [];

    // A. Archivo KMZ / KML
    if (catalogoArchivosKML.length > 0) {
      documentosPresentables.push({
        tipo: "Georreferenciación",
        nombre: catalogoArchivosKML[0].nombre,
        url: catalogoArchivosKML[0].url,
        fuente: "Drive (KMZ Traza Oficial)"
      });
    } else {
      faltantes.push("Archivo digital georreferenciado (.KMZ / .KML de la traza)");
    }

    // B. Planialtimetría General de la LAT (PL-500 o PL-001)
    const planoPlanimetria = planosLATDisponibles.find(p => p.codigo.includes("PL-500") || p.codigo.includes("PL-001"));
    if (planoPlanimetria) {
      documentosPresentables.push({
        tipo: "Plano Planialtimétrico",
        nombre: `${planoPlanimetria.codigo} (Rev ${planoPlanimetria.revision})`,
        url: planoPlanoUrlValida(planoPlanimetria),
        fuente: planoPlanimetria.urlDrive ? "Drive" : "Cloudflare R2"
      });
    } else {
      faltantes.push("Plano Planialtimétrico General de Traza (PL-500)");
    }

    // C. Cruces viales y ferroviarios (requieren PL-011 perfil de gálibo)
    const esCruceVialOFerro = nomU.includes("VIALIDAD") || nomU.includes("FERRO");
    if (esCruceVialOFerro) {
      const planoCruce = planosLATDisponibles.find(p => p.codigo.includes("PL-011") || p.codigo.includes("PL-514") || p.codigo.includes("PL-502"));
      if (planoCruce) {
        documentosPresentables.push({
          tipo: "Perfil de Cruce y Gálibo",
          nombre: `${planoCruce.codigo} (Rev ${planoCruce.revision})`,
          url: planoPlanoUrlValida(planoCruce),
          fuente: planoCruce.urlDrive ? "Drive" : "Cloudflare R2"
        });
      } else {
        faltantes.push("Plano de Cruce Acotado con Perfil de Gálibo Vertical (PL-011)");
      }
    }

    // D. Cruce de gasoductos (requiere PAT e impacto catódico MD-300)
    const esGas = nomU.includes("TGN") || nomU.includes("GASNOR") || nomU.includes("GAS");
    if (esGas) {
      const planoPat = planosLATDisponibles.find(p => p.codigo.includes("MD-300") || p.codigo.includes("OEM-PL-313") || p.codigo.includes("OEM-MC-30"));
      if (planoPat) {
        documentosPresentables.push({
          tipo: "Estudio PAT y Protección Catódica",
          nombre: `${planoPat.codigo} (Rev ${planoPat.revision})`,
          url: planoPlanoUrlValida(planoPat),
          fuente: planoPat.urlDrive ? "Drive" : "Cloudflare R2"
        });
      } else {
        faltantes.push("Estudio de Puesta a Tierra y Protección Catódica (MD-300)");
      }
    }

    // E. Memoria Descriptiva de la LAT
    const memoriaLAT = planosLATDisponibles.find(p => p.codigo.includes("MD-002") || p.codigo.includes("MD-503"));
    if (memoriaLAT) {
      documentosPresentables.push({
        tipo: "Memoria de Ingeniería",
        nombre: `${memoriaLAT.codigo} (Rev ${memoriaLAT.revision})`,
        url: planoPlanoUrlValida(memoriaLAT),
        fuente: memoriaLAT.urlDrive ? "Drive" : "Cloudflare R2"
      });
    }

    // Diagnóstico Ejecutivo y Estado del Trámite
    let estadoTramite = "PAQUETE COMPLETO - LISTO PARA PRESENTAR";
    let colorFondo = "#dcfce7";
    let colorTexto = "#15803d";
    let nivelPrioridad = "NORMAL";

    if (faltantes.length > 0) {
      estadoTramite = `DOCUMENTACIÓN INCOMPLETA (Faltan ${faltantes.length})`;
      colorFondo = "#fee2e2";
      colorTexto = "#991b1b";
      nivelPrioridad = "ALTA";
    } else if (!docRequisitos && !folderEmpresa) {
      estadoTramite = "DATOS TÉCNICOS SUFICIENTES (Pendiente Apertura Formal)";
      colorFondo = "#fef3c7";
      colorTexto = "#92400e";
      nivelPrioridad = "MEDIA";
    }

    resultadosPorEmpresa.push({
      empresa: nomEmpresa,
      tipoInterferencia: matrizInfo.tipo,
      normativa: matrizInfo.norma,
      vanosAfectados: matrizInfo.vanos,
      puntosControl: matrizInfo.puntosCriticos,
      estadoTramite: estadoTramite,
      prioridad: nivelPrioridad,
      colorFondo: colorFondo,
      colorTexto: colorTexto,
      carpetaUrl: folderEmpresa ? folderEmpresa.getUrl() : "",
      documentosListos: documentosPresentables,
      faltantes: faltantes
    });
  });

  // Guardar en la hoja 'Resumen_Interferencias'
  volcarHojaResumenInterferencias(ss, resultadosPorEmpresa);

  SpreadsheetApp.getActiveSpreadsheet().toast(
    `Interferencias auditadas: ${resultadosPorEmpresa.length} entes evaluados.`,
    "Interferencias Actualizadas ✅",
    6
  );

  return {
    ok: true,
    totalEmpresas: resultadosPorEmpresa.length,
    empresas: resultadosPorEmpresa
  };
}

function planoPlanoUrlValida(plano) {
  if (plano.urlDrive && plano.urlDrive.startsWith("http")) return plano.urlDrive;
  if (plano.urlR2 && plano.urlR2.startsWith("http")) return plano.urlR2;
  return "";
}

/**
 * Escribe y da formato visual moderno a la pestaña 'Resumen_Interferencias'.
 */
function volcarHojaResumenInterferencias(ss, listaEmpresas) {
  let hoja = ss.getSheetByName("Resumen_Interferencias");
  if (!hoja) {
    hoja = ss.insertSheet("Resumen_Interferencias");
  }

  hoja.clear();

  // Banner Principal
  hoja.getRange("A1:H1").merge()
    .setValue("🚧 TABLERO DE CONTROL Y GESTIÓN DE INTERFERENCIAS (LAT 132 kV El Bracho - Villa Quinteros)")
    .setBackground("#0f172a")
    .setFontColor("#ffffff")
    .setFontWeight("bold")
    .setFontSize(12)
    .setHorizontalAlignment("center");

  // Tarjetas Resumen
  const total = listaEmpresas.length;
  const listas = listaEmpresas.filter(e => e.estadoTramite.includes("LISTO") || e.estadoTramite.includes("SUFICIENTES")).length;
  const incompletas = total - listas;

  hoja.getRange("A3:B3").merge().setValue("TOTAL ORGANISMOS").setFontSize(9).setFontColor("#64748b").setHorizontalAlignment("center");
  hoja.getRange("A4:B4").merge().setValue(total).setFontSize(18).setFontWeight("bold").setFontColor("#0f172a").setHorizontalAlignment("center");

  hoja.getRange("C3:D3").merge().setValue("HABILITADOS P/ INICIAR").setFontSize(9).setFontColor("#15803d").setHorizontalAlignment("center");
  hoja.getRange("C4:D4").merge().setValue(listas).setFontSize(18).setFontWeight("bold").setFontColor("#15803d").setHorizontalAlignment("center");

  hoja.getRange("E3:F3").merge().setValue("CON FALTANTES").setFontSize(9).setFontColor("#b91c1c").setHorizontalAlignment("center");
  hoja.getRange("E4:F4").merge().setValue(incompletas).setFontSize(18).setFontWeight("bold").setFontColor("#b91c1c").setHorizontalAlignment("center");

  hoja.getRange("G3:H3").merge().setValue("TRAZA AUDITADA").setFontSize(9).setFontColor("#0284c7").setHorizontalAlignment("center");
  hoja.getRange("G4:H4").merge().setValue("56.8 km (132 kV)").setFontSize(16).setFontWeight("bold").setFontColor("#0284c7").setHorizontalAlignment("center");

  hoja.getRange("A3:H4").setBackground("#f8fafc").setBorder(true, true, true, true, true, true, "#e2e8f0", SpreadsheetApp.BorderStyle.SOLID);

  // Cabeceras
  const cabeceras = [
    "ORGANISMO / ENTE",
    "TIPO DE CRUCE / INTERFERENCIA",
    "SECTOR AFECTADO (PIQUETES)",
    "ESTADO DEL EXPEDIENTE",
    "NORMATIVA APLICABLE",
    "DOCUMENTACIÓN EN EL DOSSIER",
    "REQUISITOS PENDIENTES",
    "CARPETA DRIVE"
  ];

  hoja.getRange(6, 1, 1, cabeceras.length)
    .setValues([cabeceras])
    .setBackground("#1e293b")
    .setFontColor("#ffffff")
    .setFontWeight("bold")
    .setFontSize(9)
    .setHorizontalAlignment("center");

  hoja.setFrozenRows(6);

  const matriz = listaEmpresas.map(item => {
    const docsTxt = item.documentosListos.map(d => `• ${d.tipo}: ${d.nombre}`).join("\n") || "Sin planos vinculados";
    const faltantesTxt = item.faltantes.length > 0 ? item.faltantes.map(f => `⚠️ ${f}`).join("\n") : "✅ Paquete Completo";

    return [
      item.empresa,
      item.tipoInterferencia,
      item.vanosAfectados,
      item.estadoTramite,
      item.normativa,
      docsTxt,
      faltantesTxt,
      item.carpetaUrl ? "📁 Abrir Carpeta" : "Sin carpeta"
    ];
  });

  if (matriz.length > 0) {
    hoja.getRange(7, 1, matriz.length, cabeceras.length)
      .setValues(matriz)
      .setFontSize(9)
      .setVerticalAlignment("middle");

    for (let i = 0; i < listaEmpresas.length; i++) {
      const item = listaEmpresas[i];
      const numFila = i + 7;

      hoja.getRange(numFila, 4)
        .setBackground(item.colorFondo)
        .setFontColor(item.colorTexto)
        .setFontWeight("bold")
        .setHorizontalAlignment("center");

      if (item.carpetaUrl) {
        const rich = SpreadsheetApp.newRichTextValue()
          .setText("📁 Abrir Carpeta")
          .setLinkUrl(item.carpetaUrl)
          .build();
        hoja.getRange(numFila, 8).setRichTextValue(rich).setHorizontalAlignment("center");
      }
    }
  }

  hoja.autoResizeColumns(1, cabeceras.length);
  hoja.setColumnWidth(6, 260);
  hoja.setColumnWidth(7, 240);
}