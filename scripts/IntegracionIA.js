/**
 * ====================================================================================================
 * ARCHIVO: IntegracionIA.gs
 * MÓDULO DE INTEGRACIÓN MULTIMODAL CON GEMINI IA
 * Procesamiento de PDFs, transcripción de tablas, detección de sellos APC, cotejo de elencos,
 * COMPARADOR MULTIMODAL DE PLANOS (Diferencias técnicas entre revisiones/documentos),
 * Asistente Autónomo con acceso a Drive/Master, CONEXIÓN CON CLOUDFLARE R2 y AUTOSAVE AUTOMÁTICO.
 * ====================================================================================================
 */

function procesarPdfConGemini(base64Data, nombreArchivo, rutaCarpeta) {
  const schema = {
    type: "OBJECT",
    properties: {
      tipo_comunicacion: {
        type: "STRING",
        enum: [
          "TRANSMITTAL_ENTREGA",
          "DEVOLUCION_OBSERVACIONES",
          "APROBACION_TECNICA",
          "NOTA_PRIORIDAD_O_GESTION",
          "PLANO_O_DOCUMENTO_TECNICO"
        ]
      },
      tiene_sello_apc: {
        type: "BOOLEAN",
        description: "TRUE únicamente si el plano o documento tiene estampado visiblemente el sello 'APC' o 'APTO PARA CONSTRUCCIÓN' firmado/sellado, o si la Orden de Servicio otorga explícitamente el Sello APC."
      },
      numero_remito: {
        type: "STRING",
        description: "Código formal de la nota o comunicación, ej: 'COMCT2-TU1-00016', 'COMCT2-TU1-00011', 'NP-015', 'OS-008'."
      },
      fecha: {
        type: "STRING",
        description: "Fecha de emisión de la nota en formato DD/MM/YYYY."
      },
      emisor: {
        type: "STRING",
        description: "Actor que emite: 'UTE', 'TRANSNOA / TRANSENER', 'Comitente (Gobierno de Tucumán)' o 'Ingeniería (Contratista)'"
      },
      receptor: {
        type: "STRING",
        description: "Actor que recibe: 'TRANSNOA / TRANSENER', 'UTE', 'Comitente (Gobierno de Tucumán)' o 'Ingeniería (Contratista)'"
      },
      dictamen: {
        type: "STRING",
        enum: [
          "Enviado a TRANSNOA / TRANSENER",
          "Enviado a Comitente (Gobierno de Tucumán)",
          "Devuelto por Transportista (Con Observaciones)",
          "Enviado a Ingeniería (Contratista) p/ Corrección",
          "Apto para Construcción (Sello APC)",
          "Pendiente de Envío a TRANSNOA / TRANSENER",
          "Observado por UTE - Devuelto a Ingeniería",
          "Nota de Prioridad / Sin Dictamen"
        ]
      },
      documentos: {
        type: "ARRAY",
        description: "Lista exhaustiva de TODOS los planos, memorias y documentos técnicos mencionados en las tablas o en el texto de la nota.",
        items: {
          type: "OBJECT",
          properties: {
            codigo: {
              type: "STRING",
              description: "Código oficial del documento (ej: L-EB-VQ-OC-PL-500, ET-VQ-OE-PL-101, ET-LE-OC-MD-001, ET-BR-OEM-PL-300)."
            },
            descripcion: { type: "STRING" },
            revision: {
              type: "STRING",
              description: "Revisión del plano mencionada en la tabla o texto (ej: EO, 0, A, B, 1)."
            },
            observacion: { type: "STRING" }
          },
          required: ["codigo"]
        }
      }
    },
    required: ["tipo_comunicacion", "tiene_sello_apc", "fecha", "documentos"]
  };

  const contextoArchivo = `Nombre de archivo: "${nombreArchivo || ""}" | Ruta en Drive: "${rutaCarpeta || ""}". `;

  const prompt =
    contextoArchivo +
    "Analiza exhaustivamente esta comunicación oficial / Nota de Pedido / Orden de Servicio de las obras eléctricas de 132 kV en Tucumán (ET Leales, ET El Bracho, ET Villa Quinteros, LAT El Bracho - Villa Quinteros). " +
    "INSTRUCCIÓN CRÍTICA 1: Extrae ABSOLUTAMENTE TODOS los códigos de planos, memorias descriptivas, planillas y cálculos que figuren listados en las tablas o mencionados en los párrafos del cuerpo de la nota (códigos que comienzan con ET-LE, ET-VQ, ET-BR, ET-EB o L-EB-VQ seguidos de OE, OC, OEM o TCYP y PL, MD, PN, DG, ET, IS o MC). No omitas ninguna fila si la tabla tiene varias páginas. " +
    "INSTRUCCIÓN CRÍTICA 2: Si el documento es una Nota de Pedido de UTE hacia TRANSNOA/TRANSENER (ej: códigos COMCT2-TU1-..., NP-..., o dice 'Entrega Ingeniería', 'Se envía documentación'), clasifícalo con emisor='UTE', receptor='TRANSNOA / TRANSENER' y dictamen='Enviado a TRANSNOA / TRANSENER'. " +
    "INSTRUCCIÓN CRÍTICA 3: Extrae el número exacto de nota (ej: COMCT2-TU1-00016) en 'numero_remito'. " +
    "INSTRUCCIÓN CRÍTICA 4: Pon tiene_sello_apc = true ÚNICAMENTE si el documento otorga explícitamente el Sello 'APC' (Apto para Construcción).";

  const payload = {
    contents: [{
      parts: [
        { text: prompt },
        { inline_data: { mime_type: "application/pdf", data: base64Data } }
      ]
    }],
    generationConfig: {
      response_mime_type: "application/json",
      response_schema: schema,
      temperature: 0.0
    }
  };

  const apiKey = obtenerGeminiApiKeySegura();
  for (let m = 0; m < MODELOS_GEMINI.length; m++) {
    const modelo = MODELOS_GEMINI[m];
    const url = "https://generativelanguage.googleapis.com/v1beta/models/" + modelo + ":generateContent?key=" + apiKey;
    try {
      const response = UrlFetchApp.fetch(url, {
        method: "post",
        contentType: "application/json",
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
      });
      if (response.getResponseCode() === 200) {
        const jsonResp = JSON.parse(response.getContentText());
        return { exito: true, datos: JSON.parse(jsonResp.candidates[0].content.parts[0].text) };
      }
    } catch (e) {
      Logger.log(`Error modelo ${modelo}: ${e.message}`);
    }
  }
  return { exito: false, error: "Fallo en consulta de modelos Gemini." };
}

function extraerElencoConGemini(base64Data, nombreArchivo) {
  const prompt = "Analiza este ELENCO DE DOCUMENTOS DE INGENIERÍA. " +
                 "Extrae TODOS los planos y documentos con código formal, descripción detallada, disciplina y revisión contractual.";

  const schema = {
    type: "OBJECT",
    properties: {
      documentos: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            codigo: { type: "STRING" },
            descripcion: { type: "STRING" },
            disciplina: { type: "STRING" },
            revision: { type: "STRING" }
          },
          required: ["codigo", "descripcion"]
        }
      }
    },
    required: ["documentos"]
  };

  const payload = {
    contents: [{
      parts: [
        { text: prompt },
        { inline_data: { mime_type: "application/pdf", data: base64Data } }
      ]
    }],
    generationConfig: {
      response_mime_type: "application/json",
      response_schema: schema,
      temperature: 0.1
    }
  };

  const apiKey = obtenerGeminiApiKeySegura();
  for (let m = 0; m < MODELOS_GEMINI.length; m++) {
    const modelo = MODELOS_GEMINI[m];
    const url = "https://generativelanguage.googleapis.com/v1beta/models/" + modelo + ":generateContent?key=" + apiKey;
    try {
      const response = UrlFetchApp.fetch(url, {
        method: "post",
        contentType: "application/json",
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
      });
      if (response.getResponseCode() === 200) {
        const jsonResp = JSON.parse(response.getContentText());
        return JSON.parse(jsonResp.candidates[0].content.parts[0].text);
      }
    } catch (e) {
      Logger.log(`Error extrayendo elenco modelo ${modelo}: ${e.message}`);
    }
  }
  return null;
}

function extraerTablasDeImagenConGemini(base64Data, mimeType) {
  const schema = {
    type: "OBJECT",
    properties: {
      documentos: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            codigo: { type: "STRING" },
            descripcion: { type: "STRING" },
            revision: { type: "STRING" }
          },
          required: ["codigo"]
        }
      }
    },
    required: ["documentos"]
  };

  const prompt = "Analiza esta imagen/captura de informe o tabla técnica de ingeniería eléctrica. " +
                 "Extrae la tabla con: código de plano, descripción y revisión.";

  const payload = {
    contents: [{
      parts: [
        { text: prompt },
        { inline_data: { mime_type: mimeType || "image/png", data: base64Data } }
      ]
    }],
    generationConfig: {
      response_mime_type: "application/json",
      response_schema: schema,
      temperature: 0.1
    }
  };

  const apiKey = obtenerGeminiApiKeySegura();
  for (let m = 0; m < MODELOS_GEMINI.length; m++) {
    const modelo = MODELOS_GEMINI[m];
    const url = "https://generativelanguage.googleapis.com/v1beta/models/" + modelo + ":generateContent?key=" + apiKey;
    try {
      const response = UrlFetchApp.fetch(url, {
        method: "post",
        contentType: "application/json",
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
      });
      if (response.getResponseCode() === 200) {
        const jsonResp = JSON.parse(response.getContentText());
        const datos = JSON.parse(jsonResp.candidates[0].content.parts[0].text);
        return datos.documentos || [];
      }
    } catch (e) {
      Logger.log(`Error OCR imagen modelo ${modelo}: ${e.message}`);
    }
  }
  return [];
}

/**
 * ====================================================================================================
 * COMPARADOR MULTIMODAL DE PLANOS Y DOCUMENTOS TÉCNICOS
 * Descarga dos archivos de Drive (PDF o imágenes), los envía a Gemini Multimodal y realiza
 * una auditoría de ingeniería comparando rótulos, tablas de revisiones, modificaciones gráficas y notas.
 * ====================================================================================================
 */
function compararDosPlanosConIA(identificadorA, identificadorB, preguntaEspecifica) {
  try {
    let blobA = null;
    let blobB = null;
    let nombreA = identificadorA;
    let nombreB = identificadorB;
    let urlA = "";
    let urlB = "";

    const archivoA = localizarArchivoDrivePorCriterio(identificadorA);
    if (archivoA) {
      blobA = archivoA.getBlob();
      nombreA = archivoA.getName();
      urlA = archivoA.getUrl();
    } else {
      const resR2A = rescatarArchivoDesdeR2(identificadorA);
      if (resR2A.ok) {
        blobA = resR2A.blob;
        nombreA = resR2A.nombre;
        urlA = resR2A.url;
      }
    }

    const archivoB = localizarArchivoDrivePorCriterio(identificadorB);
    if (archivoB) {
      blobB = archivoB.getBlob();
      nombreB = archivoB.getName();
      urlB = archivoB.getUrl();
    } else {
      const resR2B = rescatarArchivoDesdeR2(identificadorB);
      if (resR2B.ok) {
        blobB = resR2B.blob;
        nombreB = resR2B.nombre;
        urlB = resR2B.url;
      }
    }

    if (!blobA) {
      return { exito: false, error: `No se pudo encontrar ni en Drive ni en Cloudflare R2 el primer documento: "${identificadorA}".` };
    }
    if (!blobB) {
      return { exito: false, error: `No se pudo encontrar ni en Drive ni en Cloudflare R2 el segundo documento: "${identificadorB}".` };
    }

    if (blobA.getBytes().length > 20 * 1024 * 1024 || blobB.getBytes().length > 20 * 1024 * 1024) {
      return { exito: false, error: "Uno de los planos excede los 20 MB y no puede enviarse en memoria a la API de IA." };
    }

    const b64A = Utilities.base64Encode(blobA.getBytes());
    const b64B = Utilities.base64Encode(blobB.getBytes());

    const promptComparacion = 
      `Eres un Ingeniero Principal de Control de Proyectos y Auditoría de Obras Eléctricas de Alta Tensión (132 kV).\n` +
      `Estás recibiendo DOS documentos técnicos de ingeniería (desde repositorio principal y respaldo en Cloudflare R2):\n` +
      `- DOCUMENTO 1: "${nombreA}"\n` +
      `- DOCUMENTO 2: "${nombreB}"\n\n` +
      `CONSULTA ESPECÍFICA DEL USUARIO: "${preguntaEspecifica || "¿Qué diferencias técnicas, de revisión, de diseño o documentales existen entre ambos planos?"}"\n\n` +
      `INSTRUCCIONES DE AUDITORÍA COMPARATIVA:\n` +
      `1. COMPARA EL RÓTULO CONTRACTUAL: Código oficial, títulos, autores, fecha y cuadro de historial de revisiones (EO, 0, A, B, etc.).\n` +
      `2. COMPARA EL CONTENIDO TÉCNICO: Si son planos eléctricos, unifilares, civiles o de traza, identifica los cambios en esquemas, notas de cálculo, cotas, coordenadas, disposición de estructuras o equipos modificados.\n` +
      `3. REVISA SELLOS Y OBSERVACIONES: Detecta sellos de aprobación (ej: APC, Aprobado con Observaciones, Rechazado) o nubes de revisión.\n` +
      `4. ESTRUCTURA TU RESPUESTA CON FORMATO:\n` +
      `   - 📌 **Identificación**: Código, nombre y revisión de cada uno.\n` +
      `   - 🔄 **Historial de Cambios / Modificaciones Declaradas**: Lo que indica el cuadro de revisiones.\n` +
      `   - 📐 **Diferencias Técnicas Detectadas en el Contenido**: Cambios específicos de ingeniería.\n` +
      `   - ⚖️ **Dictamen / Estado Contractual**: Cuál es la versión más reciente, si alguna tiene Sello APC o si difieren en alcance.`;

    const payload = {
      contents: [{
        parts: [
          { text: promptComparacion },
          { text: `--- INICIO DOCUMENTO 1: ${nombreA} ---` },
          { inline_data: { mime_type: blobA.getContentType() || "application/pdf", data: b64A } },
          { text: `--- INICIO DOCUMENTO 2: ${nombreB} ---` },
          { inline_data: { mime_type: blobB.getContentType() || "application/pdf", data: b64B } }
        ]
      }],
      generationConfig: {
        temperature: 0.1
      }
    };

    const apiKey = obtenerGeminiApiKeySegura();
    for (let m = 0; m < MODELOS_GEMINI.length; m++) {
      const modelo = MODELOS_GEMINI[m];
      const url = "https://generativelanguage.googleapis.com/v1beta/models/" + modelo + ":generateContent?key=" + apiKey;
      try {
        const response = UrlFetchApp.fetch(url, {
          method: "post",
          contentType: "application/json",
          payload: JSON.stringify(payload),
          muteHttpExceptions: true
        });

        if (response.getResponseCode() === 200) {
          const jsonResp = JSON.parse(response.getContentText());
          const texto = jsonResp.candidates[0].content.parts[0].text;
          return {
            exito: true,
            archivoA: { nombre: nombreA, url: urlA },
            archivoB: { nombre: nombreB, url: urlB },
            analisis: texto
          };
        }
      } catch (err) {
        Logger.log(`Error comparando planos con modelo ${modelo}: ${err.message}`);
      }
    }

    return { exito: false, error: "No se pudo procesar la comparación visual con los modelos Gemini configurados." };
  } catch (eGlobal) {
    return { exito: false, error: "Error en motor de comparación: " + eGlobal.message };
  }
}

/**
 * Rescata un archivo binario directamente desde el bucket de Cloudflare R2
 * si no fue encontrado localmente en Drive.
 */
function rescatarArchivoDesdeR2(identificador) {
  try {
    const host = `${R2_CONFIG.ACCOUNT_ID}.r2.cloudflarestorage.com`;
    const criterio = String(identificador || "").trim().toUpperCase();

    const indiceR2 = obtenerIndiceMaestroDesdeR2();
    let keyEncontrada = "";

    if (indiceR2 && indiceR2.carpetas) {
      for (let i = 0; i < indiceR2.carpetas.length; i++) {
        const c = indiceR2.carpetas[i];
        if (c.ruta && c.ruta.toUpperCase().includes(criterio)) {
          keyEncontrada = c.ruta;
          break;
        }
      }
    }

    if (!keyEncontrada) {
      const urlListar = `https://${host}/${R2_CONFIG.BUCKET_NAME}?list-type=2&prefix=${encodeURIComponent(identificador)}`;
      const headersList = generarHeadersAwsSigV4({
        method: "GET",
        host: host,
        canonicalUri: `/${R2_CONFIG.BUCKET_NAME}`,
        canonicalQueryString: `list-type=2&prefix=${encodeURIComponent(identificador)}`,
        payloadBytes: null,
        useUnsignedPayload: false
      });
      const resList = UrlFetchApp.fetch(urlListar, { method: "GET", headers: headersList, muteHttpExceptions: true });
      if (resList.getResponseCode() === 200) {
        const xml = resList.getContentText();
        const matchKey = xml.match(/<Key>([^<]+)<\/Key>/);
        if (matchKey) keyEncontrada = matchKey[1];
      }
    }

    if (!keyEncontrada) return { ok: false, error: "No encontrado en R2" };

    const canonicalUri = `/${R2_CONFIG.BUCKET_NAME}/${encodeURI(keyEncontrada)}`;
    const urlDownload = `https://${host}${canonicalUri}`;

    const headersGet = generarHeadersAwsSigV4({
      method: "GET",
      host: host,
      canonicalUri: canonicalUri,
      canonicalQueryString: "",
      payloadBytes: null,
      useUnsignedPayload: false
    });

    const resDownload = UrlFetchApp.fetch(urlDownload, {
      method: "GET",
      headers: headersGet,
      muteHttpExceptions: true
    });

    if (resDownload.getResponseCode() === 200) {
      const blob = resDownload.getBlob();
      const partes = keyEncontrada.split("/");
      const nombreArchivo = partes[partes.length - 1];
      blob.setName(nombreArchivo);
      return {
        ok: true,
        blob: blob,
        nombre: nombreArchivo,
        url: R2_CONFIG.PUBLIC_URL ? `${R2_CONFIG.PUBLIC_URL}/${encodeURI(keyEncontrada)}` : `https://${host}${canonicalUri}`
      };
    }
  } catch (err) {
    Logger.log("Aviso rescatando de R2: " + err.message);
  }
  return { ok: false, error: "Fallo al conectar con Cloudflare R2" };
}

/**
 * Lee el archivo '_indice_maestro_obra.json' guardado en Cloudflare R2
 * para que la IA conozca todo el mapa del backup sin consultar la hoja de cálculo.
 */
function obtenerIndiceMaestroDesdeR2() {
  try {
    const host = `${R2_CONFIG.ACCOUNT_ID}.r2.cloudflarestorage.com`;
    const canonicalUri = `/${R2_CONFIG.BUCKET_NAME}/_indice_maestro_obra.json`;
    const url = `https://${host}${canonicalUri}`;

    const headers = generarHeadersAwsSigV4({
      method: "GET",
      host: host,
      canonicalUri: canonicalUri,
      canonicalQueryString: "",
      payloadBytes: null,
      useUnsignedPayload: false
    });

    const res = UrlFetchApp.fetch(url, {
      method: "GET",
      headers: headers,
      muteHttpExceptions: true
    });

    if (res.getResponseCode() === 200) {
      return JSON.parse(res.getContentText());
    }
  } catch (e) {
    Logger.log("Aviso leyendo índice R2: " + e.message);
  }
  return null;
}

/**
 * ====================================================================================================
 * ASISTENTE DOCUMENTAL E INTELIGENCIA ARTIFICIAL INTEGRADA (INGENIERÍA TOTAL)
 * ====================================================================================================
 */
function responderConsultaAsistente(mensaje, historialChat) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const mensajeLimpio = String(mensaje || "").trim();
    const mensajeU = mensajeLimpio.toUpperCase();

    const esConsultaComparativa = (
      mensajeU.includes("DIFERENCIA") || 
      mensajeU.includes("COMPAR") || 
      mensajeU.includes("DISTINTO") ||
      mensajeU.includes("CAMBIO ENTRE") ||
      mensajeU.includes("QUE CAMBIO") ||
      mensajeU.includes("QUÉ CAMBIÓ")
    );

    const regexCodigos = /((?:ET[-_](?:LE|VQ|BR|EB)|L[-_]EB[-_]VQ)[-_](?:OE|OC|OEM|TCYP)[-_](?:PL|MD|PN|DG|ET|IS|MC)[-_]?[0-9]{2,4}(?:[-_][0-9A-Z]{1,3})?)/gi;
    const codigosEncontrados = mensajeLimpio.match(regexCodigos) || [];

    if (esConsultaComparativa && codigosEncontrados.length >= 2) {
      const resComp = compararDosPlanosConIA(codigosEncontrados[0], codigosEncontrados[1], mensajeLimpio);
      if (resComp.exito) {
        const respuestaEnriquecida = 
          `### 🔍 Auditoría Comparativa Multimodal\n` +
          `- **Documento A:** [${resComp.archivoA.nombre}](${resComp.archivoA.url})\n` +
          `- **Documento B:** [${resComp.archivoB.nombre}](${resComp.archivoB.url})\n\n` +
          resComp.analisis;
        return { exito: true, respuesta: respuestaEnriquecida };
      }
    }

    if (esConsultaComparativa && codigosEncontrados.length === 1) {
      const matchRevs = mensajeU.match(/(?:REV|REVISION|REVISIÓN)\s*([0-9A-E]|EO)/gi) || [];
      if (matchRevs.length >= 2) {
        const rev1 = matchRevs[0].replace(/[^0-9A-E]/gi, "");
        const rev2 = matchRevs[1].replace(/[^0-9A-E]/gi, "");
        const codBase = codigosEncontrados[0];
        const resComp = compararDosPlanosConIA(`${codBase}_${rev1}`, `${codBase}_${rev2}`, mensajeLimpio);
        if (resComp.exito) {
          const respuestaEnriquecida = 
            `### 🔍 Comparación de Revisiones: ${codBase}\n` +
            `- **Versión 1:** [${resComp.archivoA.nombre}](${resComp.archivoA.url})\n` +
            `- **Versión 2:** [${resComp.archivoB.nombre}](${resComp.archivoB.url})\n\n` +
            resComp.analisis;
          return { exito: true, respuesta: respuestaEnriquecida };
        }
      }
    }

    let contextoEspecial = "";
    
    const hojaRes = ss.getSheetByName("Resumen_Control_Elencos");
    if (hojaRes) {
      const totalPlanificados = hojaRes.getRange("B7:B10").getValues().reduce((a, b) => a + Number(b[0] || 0), 0);
      const cargados = hojaRes.getRange("C4").getValue();
      const faltantes = hojaRes.getRange("D4").getValue();
      const cerradosApc = hojaRes.getRange("F4").getValue();
      
      contextoEspecial += `► ESTADO GENERAL DE LA OBRA (HOY):\n`;
      contextoEspecial += `- Total Planificados en Elenco: ${totalPlanificados} | Cargados en Drive: ${cargados} | Faltantes: ${faltantes} | Cerrados con Sello APC: ${cerradosApc}\n\n`;
    }

    const mapaDrive = new Map();
    const hojaLog = ss.getSheetByName("Registro_Archivos_Drive");
    if (hojaLog && hojaLog.getLastRow() >= 2) {
      const logs = hojaLog.getRange(2, 1, hojaLog.getLastRow() - 1, 4).getValues();
      logs.forEach(l => {
        const idArc = String(l[0] || "").trim();
        const nomArc = String(l[1] || "").trim();
        const rutaArc = String(l[2] || "").trim();
        const fecArc = normalizarFechaEstandar(l[3]);
        if (nomArc) {
          mapaDrive.set(nomArc.toUpperCase(), {
            id: idArc,
            nombre: nomArc,
            ruta: rutaArc,
            fecha: fecArc,
            url: idArc ? ("https://drive.google.com/file/d/" + idArc + "/view") : ""
          });
        }
      });
    }

    const comunicacionesMap = new Map();
    const hojaHist = ss.getSheetByName("Histórico Transmittals") || ss.getSheetByName("Historico Transmittals");

    if (hojaHist && hojaHist.getLastRow() >= 2) {
      const ultFila = hojaHist.getLastRow();
      const datosH = hojaHist.getRange(2, 1, ultFila - 1, 12).getValues();
      const richH = hojaHist.getRange(2, 7, ultFila - 1, 1).getRichTextValues();

      for (let i = 0; i < datosH.length; i++) {
        const fh = datosH[i];
        const proyH = String(fh[1] || "").trim();
        const codPlano = String(fh[2] || "").trim();
        const descPlano = String(fh[3] || "").trim();
        const revPlano = String(fh[4] || "").trim();
        const fecH = normalizarFechaEstandar(fh[5]);
        const remH = String(fh[6] || "").trim();
        let emisorH = String(fh[7] || "").trim();
        let receptorH = String(fh[8] || "").trim();
        let dictamenH = String(fh[9] || "").trim();

        let urlRem = "";
        if (richH[i] && richH[i][0] && richH[i][0].getLinkUrl()) {
          urlRem = richH[i][0].getLinkUrl();
        }

        if (!remH || remH.length < 2) continue;

        const remU = remH.toUpperCase();
        let tipoExacto = "Comunicación Oficial";

        if (remU.includes("COMTC") || remU.startsWith("OS-") || remU.startsWith("OS ") || remU.includes("ORDEN DE SERVICIO") || remU.includes("-OS-")) {
          tipoExacto = "Orden de Servicio (OS - COMTC2)";
          emisorH = "TRANSNOA / TRANSENER (Supervisión)";
          receptorH = "UT (Contratista)";
        } else if (remU.includes("COMCT") || remU.includes("TU1") || remU.startsWith("NP-") || remU.startsWith("NP ")) {
          tipoExacto = "Nota de Pedido (NP - COMCT2)";
          emisorH = "UT (Contratista)";
          receptorH = "TRANSNOA / TRANSENER";
          if (!dictamenH) dictamenH = "Entrega de Ingeniería / Solicitud Técnica";
        }

        if (!comunicacionesMap.has(remH)) {
          let rutaFisica = "Drive Obra / 05 - Libros";
          for (let [nomDocUpper, infoD] of mapaDrive.entries()) {
            if (nomDocUpper.includes(remU)) {
              rutaFisica = infoD.ruta;
              if (!urlRem && infoD.url) urlRem = infoD.url;
              break;
            }
          }

          comunicacionesMap.set(remH, {
            numero: remH,
            tipo: tipoExacto,
            emisor: emisorH,
            receptor: receptorH,
            fecha: fecH,
            dictamen: dictamenH,
            url: urlRem,
            rutaDrive: rutaFisica,
            proyecto: proyH,
            planosTratados: []
          });
        }

        if (codPlano) {
          comunicacionesMap.get(remH).planosTratados.push({
            codigo: codPlano,
            descripcion: descPlano,
            revision: revPlano
          });
        }
      }
    }

    const todasLasComunicaciones = Array.from(comunicacionesMap.values());
    contextoEspecial += `► CATÁLOGO DE COMUNICACIONES (${todasLasComunicaciones.length} notas/órdenes registradas):\n`;
    todasLasComunicaciones.forEach((c, idx) => {
      const planosResumen = c.planosTratados.map(p => `${p.codigo} (Rev ${p.revision})`).join(", ");
      contextoEspecial += `${idx + 1}. [${c.tipo}] N°: "${c.numero}" | Obra: ${c.proyecto} | ${c.emisor} ➔ ${c.receptor} | Fecha: ${c.fecha} | Dictamen: ${c.dictamen} | Carpeta: "${c.rutaDrive}" | Link: ${c.url || "Sin enlace"} | Planos: ${planosResumen || "General"}\n`;
    });

    const indiceR2 = obtenerIndiceMaestroDesdeR2();
    if (indiceR2) {
      contextoEspecial += `\n► REPOSITORIO DE RESPALDO CONECTADO (Cloudflare R2):\n`;
      contextoEspecial += `- Total de archivos respaldados en R2: ${indiceR2.total_archivos_en_r2 || indiceR2.total_archivos_inspeccionados || 0}\n`;
      contextoEspecial += `- Volumen en almacenamiento seguro: ${indiceR2.megabytes_transferidos || 0} MB\n`;
      contextoEspecial += `- Estado de sincronización: Conectado y operativo como fuente de rescate documental.\n`;
    }

    if (codigosEncontrados.length > 0) {
      codigosEncontrados.forEach(c => {
        const infoTraz = obtenerTrazabilidadCompleta(c);
        if (infoTraz && infoTraz.encontrado) {
          contextoEspecial += `\n► INFORMACIÓN VIVA DEL PLANO ${infoTraz.codigo}:\n`;
          contextoEspecial += `- Título: ${infoTraz.descripcion} | Disciplina: ${infoTraz.disciplina} | Proyecto: ${infoTraz.proyecto}\n`;
          contextoEspecial += `- Rev Actual: ${infoTraz.revisionActual} | Ciclo: ${infoTraz.cicloActual} | Estado: ${infoTraz.estadoCircuito} | Etapa: ${infoTraz.etapaActual}\n`;
          contextoEspecial += `- Responsable: ${infoTraz.responsableActual} | Semáforo SLA: ${infoTraz.semaforoSLA.etiqueta}\n`;
          contextoEspecial += `- Movimientos registrados: ${infoTraz.historial.map(h => `[${h.fecha}]: ${h.hito} (${h.remitoTexto})`).join(" -> ")}\n`;
        }
      });
    }

    const prompt = 
      `Eres la "Inteligencia Artificial de Ingeniería y Control Documental de Obras 132 kV". ` +
      `No eres un simple bot; eres un analista técnico con capacidad de auditar planos, comunicaciones, pliegos, expedientes, base de datos y RESPALDO EN CLOUDFLARE R2.\n\n` +
      `REGLAS DE ACTUACIÓN:\n` +
      `1. COMPRENSIÓN TOTAL: Atiende cualquier consulta del usuario (técnica, contractual, estado de avance, discrepancias, comparaciones, semáforos SLA, carpetas en Drive o respaldo en Cloudflare R2).\n` +
      `2. DIFERENCIA DE COMUNICACIONES: Las notas COMCT/TU1/NP son NOTAS DE PEDIDO (UTE ➔ TRANSNOA). Las OS son ÓRDENES DE SERVICIO (TRANSNOA ➔ UTE). Jamás confundas los roles.\n` +
      `3. ENLACES CLICABLES: Si citas un documento o plano, incluye siempre su enlace en formato Markdown: [Código o Nota](URL).\n` +
      `4. RESPALDO R2 ACTIVO: Tienes conexión directa con el bucket de Cloudflare R2 ('backup-obra-132kv'). Si un plano no está visible en Drive, puedes obtenerlo del respaldo.\n` +
      `5. EXHAUSTIVIDAD Y PRECISIÓN: Si se consultan comunicaciones o planos, lista todos los registros coincidentes.\n\n` +
      `CONTEXTO DE LA BASE DE DATOS, DRIVE Y CLOUDFLARE R2:\n${contextoEspecial}\n\n` +
      `HISTORIAL DE LA CONVERSACIÓN:\n${historialChat || "Inicio de sesión."}\n\n` +
      `USUARIO: ${mensajeLimpio}\n` +
      `IA:`;

    const payload = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1 }
    };

    const apiKey = obtenerGeminiApiKeySegura();
    let ultimoError = "Error desconocido.";
    
    for (let i = 0; i < MODELOS_GEMINI.length; i++) {
      const url = "https://generativelanguage.googleapis.com/v1beta/models/" + MODELOS_GEMINI[i] + ":generateContent?key=" + apiKey;
      try {
        const response = UrlFetchApp.fetch(url, {
          method: "post",
          contentType: "application/json",
          payload: JSON.stringify(payload),
          muteHttpExceptions: true
        });

        if (response.getResponseCode() === 200) {
          const json = JSON.parse(response.getContentText());
          return { exito: true, respuesta: json.candidates[0].content.parts[0].text };
        } else {
          ultimoError = response.getContentText();
        }
      } catch (e) {
        ultimoError = e.message;
      }
    }
    
    return { exito: false, error: "Detalle API Gemini: " + ultimoError };
  } catch (errGlobal) {
    return { exito: false, error: errGlobal.message };
  }
}

/**
 * ====================================================================================================
 * AUTOSAVE AUTOMÁTICO EN SEGUNDO PLANO Y PERSISTENCIA DE SESIONES DEL CHATBOT
 * ====================================================================================================
 */
function registrarAutosaveInteraccionChat(payload) {
  try {
    const pregunta = String(payload.pregunta || "").trim();
    const respuesta = String(payload.respuesta || "").trim();
    if (!pregunta || !respuesta) return { ok: false, error: "Datos vacíos" };

    const ahora = new Date();
    const tz = Session.getScriptTimeZone();
    const timestampStr = Utilities.formatDate(ahora, tz, "dd/MM/yyyy HH:mm:ss");
    const fechaDiaStr = Utilities.formatDate(ahora, tz, "yyyy-MM-dd");
    const usuarioEmail = Session.getActiveUser().getEmail() || "Operador de Obra";

    const ss = SpreadsheetApp.getActiveSpreadsheet();

    let hojaHistChat = ss.getSheetByName("Historial_Chat_IA");
    if (!hojaHistChat) {
      hojaHistChat = ss.insertSheet("Historial_Chat_IA");
      const cabeceras = ["FECHA Y HORA", "USUARIO", "CONSULTA / PREGUNTA REALIZADA", "RESPUESTA / DICTAMEN DE LA IA", "DOCUMENTO GENERADO EN DRIVE"];
      hojaHistChat.getRange(1, 1, 1, cabeceras.length)
        .setValues([cabeceras])
        .setBackground("#1e1b4b")
        .setFontColor("#ffffff")
        .setFontWeight("bold")
        .setFontSize(10)
        .setHorizontalAlignment("center");
      hojaHistChat.setFrozenRows(1);
    }

    const nuevaFila = hojaHistChat.getLastRow() + 1;
    hojaHistChat.getRange(nuevaFila, 1, 1, 4).setValues([[
      timestampStr,
      usuarioEmail,
      pregunta,
      respuesta
    ]]);
    hojaHistChat.getRange(nuevaFila, 1, 1, 4).setFontSize(9).setVerticalAlignment("top");
    hojaHistChat.getRange(nuevaFila, 1).setHorizontalAlignment("center").setFontColor("#64748b");
    hojaHistChat.getRange(nuevaFila, 2).setHorizontalAlignment("center").setFontWeight("bold");

    let urlDocDiario = "";
    try {
      const carpetaRaiz = DriveApp.getFolderById(ID_CARPETA_RAIZ);
      let carpetaInformes = null;
      const subs = carpetaRaiz.getFolders();
      while (subs.hasNext()) {
        const f = subs.next();
        const nU = f.getName().toUpperCase();
        if (nU.includes("CONSULTAS") || nU.includes("INFORMES IA") || nU.includes("BITACORA IA")) {
          carpetaInformes = f;
          break;
        }
      }
      if (!carpetaInformes) {
        carpetaInformes = carpetaRaiz.createFolder("07 - Consultas e Informes IA");
      }

      const nombreDocDiario = `Bitácora_IA_${fechaDiaStr}`;
      let docDiario = null;
      const archivosDoc = carpetaInformes.getFilesByName(nombreDocDiario);

      if (archivosDoc.hasNext()) {
        const fileDocExistente = archivosDoc.next();
        docDiario = DocumentApp.openById(fileDocExistente.getId());
        urlDocDiario = fileDocExistente.getUrl();
      } else {
        docDiario = DocumentApp.create(nombreDocDiario);
        const fileNuevo = DriveApp.getFileById(docDiario.getId());
        fileNuevo.moveTo(carpetaInformes);
        urlDocDiario = fileNuevo.getUrl();

        const body = docDiario.getBody();
        body.insertParagraph(0, `BITÁCORA DIARIA DE CONSULTAS Y AUDITORÍAS IA (132 kV) - ${fechaDiaStr}`)
          .setHeading(DocumentApp.ParagraphHeading.HEADING_1)
          .setAlignment(DocumentApp.HorizontalAlignment.CENTER);
        body.appendParagraph(`Registro continuo de consultas formuladas al asistente inteligente.`)
          .setItalic(true)
          .setForegroundColor("#64748b");
        body.appendHorizontalRule();
      }

      const body = docDiario.getBody();
      const pPregunta = body.appendParagraph(`\n[${timestampStr}] 👤 USUARIO (${usuarioEmail}):\n${pregunta}`);
      pPregunta.setHeading(DocumentApp.ParagraphHeading.HEADING_3).setForegroundColor("#1e40af");

      const pRespuesta = body.appendParagraph(`🤖 RESPUESTA IA:\n${respuesta}`);
      pRespuesta.setForegroundColor("#1e293b");
      body.appendHorizontalRule();

      docDiario.saveAndClose();

      if (urlDocDiario) {
        const richDoc = SpreadsheetApp.newRichTextValue()
          .setText("📄 Abrir Bitácora en Drive")
          .setLinkUrl(urlDocDiario)
          .build();
        hojaHistChat.getRange(nuevaFila, 5).setRichTextValue(richDoc).setHorizontalAlignment("center");
      }
    } catch (eDoc) {
      Logger.log("Aviso al actualizar Doc de Bitácora Diaria: " + eDoc.message);
    }

    return { ok: true, fila: nuevaFila, urlDoc: urlDocDiario, timestamp: timestampStr };
  } catch (err) {
    Logger.log("Error en autosave de chat: " + err.message);
    return { ok: false, error: err.message };
  }
}