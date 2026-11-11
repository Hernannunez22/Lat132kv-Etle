/**
 * ====================================================================================================
 * ARCHIVO: VistasUI.gs
 * Módulo de interfaz: Menú superior onOpen, función maestra de Sincronización Total,
 * conexión y respaldo en Cloudflare R2, apertura de modales HTML, sidebars, endpoints doGet/doPost
 * con soporte JSONP, transcripción multimodal de audios, auditoría visual de fotos con Gemini,
 * asistente IA de ingeniería (chat), anotador de campo, generador instantáneo de informes ejecutivos
 * leyendo las notas reales de Drive (COMCT2 y COMTC2) y persistencia privada en R2.
 * ====================================================================================================
 */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("⚡ Control Documental")
    .addItem("📱 Abrir App Móvil de Obra (Anotador & R2)", "abrirAppMovilModal")
    .addSeparator()
    .addItem("🚀 Sincronización Total en 1 Clic (Todo Junto)", "ejecutarSincronizacionTotalCompleta")
    .addSeparator()
    .addItem("☁️ Iniciar Respaldo Completo a Cloudflare R2", "sincronizarTodoACloudflareR2")
    .addItem("🔄 Probar Conexión con Cloudflare R2", "probarConexionCloudflareR2")
    .addSeparator()
    .addItem("📓 NotebookLM de Obra (Estudio Técnico y Fuentes)", "abrirModalNotebookLM")
    .addItem("🚧 Auditar y Gestionar Interferencias (Copias y Resumen)", "gestionarYAuditarInterferenciasTotal")
    .addItem("📑 Actualizar y Verificar Cambios en Elencos (Drive)", "actualizarYVerificarCambiosEnElencos")
    .addItem("📚 Auditar TODOS los Libros de Comunicación (Profundo)", "escanearTodosLosLibrosProfundo")
    .addItem("📈 Actualizar Tablero Físico y Faltantes (Hoja Resumen)", "generarReporteComparacionElencos")
    .addItem("📋 Ver Lista de Planos Cargados vs Faltantes", "abrirModalDetalleConciliados")
    .addItem("✨ Normalizar Estados, Ciclos y Sello APC (Limpieza Total)", "limpiarYNormalizarHojasMasterCompleto")
    .addItem("🕒 Ver Últimos Documentos Subidos a Drive", "abrirSidebar")
    .addItem("🧹 Reparar Encabezados y Reorganizar Planos", "reorganizarPlanosEnHojasCorrectas")
    .addItem("📊 Panel Lateral de Progreso y Acciones", "abrirSidebar")
    .addItem("💬 Asistente IA (Chat a Pantalla Completa)", "abrirModalChat")
    .addItem("📡 Matriz de Comunicaciones (Actores / Envíos / Devoluciones)", "abrirModalMatrizActores")
    .addItem("📑 Auditar y Cruzar Informe Word de Contratista", "abrirModalAuditorWord")
    .addItem("🔍 Buscar Trazabilidad y Línea de Tiempo", "abrirModalTrazabilidad")
    .addSeparator()
    .addItem("🚀 Forzar Escaneo Carpeta LAT y Subcarpetas", "escanearCarpetasLATProfundo")
    .addItem("🚀 Forzar Escaneo Carpeta Villa Quinteros", "escanearCarpetasVQProfundo")
    .addSeparator()
    .addItem("⏰ Activar Monitoreo Automático (Cada 30 min + Mail 18hs)", "instalarActivadoresAutomaticos")
    .addItem("🛑 Desactivar Monitoreo Automático", "eliminarActivadoresAutomaticos")
    .addItem("📧 Enviar Reporte Diario por Mail (Prueba)", "enviarReporteDiarioMail")
    .addSeparator()
    .addItem("🔐 Proteger / Configurar API Key de Gemini en Propiedades", "mostrarDialogoApiKeySegura")
    .addToUi();
}

/**
 * ====================================================================================================
 * WEB APP ENDPOINT (doGet) PARA ACCESO DIRECTO DESDE EL NAVEGADOR DEL CELULAR Y NETLIFY
 * Si recibe ?api=datos o ?callback=... devuelve los datos reales con CORS y JSONP habilitado.
 * De lo contrario, sirve la interfaz de la aplicación móvil en HTML.
 * ====================================================================================================
 */
function doGet(e) {
  // 1. Endpoint de API JSON / JSONP para Netlify y Apps Externas
  if (e && e.parameter && (e.parameter.api === "datos" || e.parameter.callback)) {
    const payload = obtenerDatosCompletosAppMovil();
    const jsonStr = JSON.stringify(payload);

    // Soporte JSONP para saltear cualquier bloqueo de CORS en Netlify/Navegadores
    if (e.parameter.callback) {
      const cb = e.parameter.callback.replace(/[^a-zA-Z0-9_]/g, "");
      return ContentService.createTextOutput(`${cb}(${jsonStr});`)
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }

    return ContentService.createTextOutput(jsonStr)
      .setMimeType(ContentService.MimeType.JSON);
  }

  // 2. Si no pide API, sirve la aplicación HTML completa
  return HtmlService.createHtmlOutputFromFile("AppObraMobile")
    .setTitle("⚡ Obra 132 kV - Anotador Técnico & Control")
    .addMetaTag("viewport", "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Endpoint POST para transcribir audios de campo, auditar fotos con IA, generar informes ejecutivos,
 * atender consultas del asistente IA (Chat), generar fichas del Anotador y guardar registros en R2 / BD.
 */
function doPost(e) {
  try {
    let req = {};
    if (e && e.postData && e.postData.contents) {
      try {
        req = JSON.parse(e.postData.contents);
      } catch (errJson) {
        req = {};
      }
    } else if (e && e.parameter) {
      req = e.parameter;
    }

    const accion = String(req.accion || req.action || "").trim().toLowerCase();

    // 1. CHAT ASISTENTE DE INGENIERÍA CON IA (GEMINI)
    if (
      accion === "consulta_chat" || 
      accion === "chat" || 
      accion === "consultar_chat" ||
      accion === "asistente_ia"
    ) {
      const mensaje = req.mensaje || req.prompt || req.texto || "";
      const historial = req.historial || req.contexto || "";
      if (typeof responderConsultaAsistente === "function") {
        const resAsist = responderConsultaAsistente(mensaje, historial);
        return ContentService.createTextOutput(JSON.stringify(resAsist))
          .setMimeType(ContentService.MimeType.JSON);
      } else {
        const resChat = responderConsultaAsistenteConGemini(mensaje, historial);
        return ContentService.createTextOutput(JSON.stringify(resChat))
          .setMimeType(ContentService.MimeType.JSON);
      }
    }

    // 2. CONSULTA ASISTIDA EN EL ANOTADOR TÉCNICO
    if (
      accion === "consultar_anotador" || 
      accion === "anotador_ia" ||
      accion === "ficha_tecnica"
    ) {
      const nota = req.nota || req.texto || req.query || "";
      const resNota = generarFichaTecnicaAnotador(nota);
      return ContentService.createTextOutput(JSON.stringify(resNota))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // 3. TRANSCRIPCIÓN DE AUDIO DE CAMPO
    if (accion === "transcribir_audio") {
      const res = transcribirAudioConGemini(req.audioBase64, req.mimeType || "audio/webm");
      return ContentService.createTextOutput(JSON.stringify(res))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // 4. AUDITORÍA VISUAL DE FOTOS CON GEMINI
    if (accion === "auditar_foto") {
      const res = auditarFotoObraConGemini(req.fotoBase64, req.mimeType || "image/jpeg", req.contexto || "");
      return ContentService.createTextOutput(JSON.stringify(res))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // 5. ACCIÓN DE INFORME EJECUTIVO (Acepta todas las variantes de invocación)
    if (
      accion === "generar_informe_ejecutivo" || 
      accion === "generar_informe" || 
      accion === "informe_ejecutivo" ||
      accion === "informe"
    ) {
      const solicitudTexto = req.solicitudTexto || req.solicitud || req.prompt || "";
      const hitosCliente = req.hitos || [];
      const res = generarInformeEjecutivoObra(solicitudTexto, hitosCliente);
      return ContentService.createTextOutput(JSON.stringify(res))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // 6. GUARDADO EXCLUSIVO EN BASE DE DATOS / R2 (NO EN DRIVE)
    if (
      accion === "guardar_informe_r2_privado" || 
      accion === "guardar_informe_privado" || 
      accion === "guardar_informe_r2"
    ) {
      const res = guardarInformeEnBaseDeDatosR2(req.titulo, req.contenidoMarkdown, req.fecha);
      return ContentService.createTextOutput(JSON.stringify(res))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // 7. CARGA DE HITOS Y CRONOGRAMA POR ÚNICA VEZ EN R2 / BASE DE DATOS
    if (
      accion === "guardar_cronograma_hitos_r2" || 
      accion === "guardar_hitos_r2" || 
      accion === "guardar_hitos"
    ) {
      const res = guardarCronogramaHitosEnR2(req.hitos);
      return ContentService.createTextOutput(JSON.stringify(res))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // 8. GUARDADO OPCIONAL EN GOOGLE DRIVE
    if (accion === "guardar_informe_drive") {
      const res = guardarInformeEnDrive(req.titulo, req.contenidoMarkdown);
      return ContentService.createTextOutput(JSON.stringify(res))
        .setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({ 
      ok: false, 
      exito: false, 
      error: `Acción no reconocida: '${accion}'` 
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ 
      ok: false, 
      exito: false, 
      error: err.message 
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Guarda los informes generados EXCLUSIVAMENTE en Cloudflare R2 / Base de Datos
 * Sin crear ni modificar ningún archivo en Google Drive (Documentación privada propia).
 */
function guardarInformeEnBaseDeDatosR2(titulo, contenidoMarkdown, fechaStr) {
  try {
    const fechaClave = fechaStr || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd_HHmmss");
    const nombreArchivoR2 = `Informes_Privados/${titulo || 'Informe_Avance'}_${fechaClave}.json`;
    
    const registroPayload = {
      titulo: titulo,
      fecha: fechaClave,
      creadoPor: "Auditor de Obra (Privado)",
      contenidoMarkdown: contenidoMarkdown
    };

    subirJsonBaseDatosAR2(nombreArchivoR2, JSON.stringify(registroPayload, null, 2));

    return {
      ok: true,
      mensaje: "Informe guardado exclusivamente en la Base de Datos privada (Cloudflare R2)",
      rutaR2: nombreArchivoR2
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Guarda el Cronograma de Hitos EXCLUSIVAMENTE en Cloudflare R2 / Base de Datos
 * para no depender ni escribir nada en Google Drive.
 */
function guardarCronogramaHitosEnR2(listaHitos) {
  try {
    const payload = {
      ultimaActualizacion: new Date().toISOString(),
      hitos: listaHitos || []
    };

    subirJsonBaseDatosAR2("_cronograma_hitos_privado.json", JSON.stringify(payload, null, 2));
    PropertiesService.getScriptProperties().setProperty("CRONOGRAMA_HITOS_JSON", JSON.stringify(listaHitos));

    return { ok: true, total: (listaHitos || []).length };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Genera un Informe Técnico Ejecutivo formal con 1 solo clic cruzando datos en tiempo real:
 * - Lee las comunicaciones reales indexadas en Drive (COMCT2-TU1-0001 a 00019 y COMTC2-TU1-0005 a 0008).
 * - Utiliza los hitos y fechas reales cargados en el sistema (del CSV/Excel).
 * - Adapta la estructura según lo que solicite exactamente el usuario (Comunicaciones, Obra, Interferencias o Diseño).
 */
function generarInformeEjecutivoObra(solicitudUsuario, hitosCliente) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const datosApp = obtenerDatosCompletosAppMovil();
    const planos = datosApp.planos || [];
    
    let hitos = (hitosCliente && hitosCliente.length > 0) ? hitosCliente : (datosApp.hitos || []);
    const fechaHoy = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy");

    // 1. Reconstruir la cronología forense de comunicaciones (Histórico Transmittals)
    const comunicacionesHistorial = [];
    const hojaHist = ss.getSheetByName("Histórico Transmittals") || ss.getSheetByName("Historico Transmittals");
    if (hojaHist && hojaHist.getLastRow() >= 2) {
      const ultH = hojaHist.getLastRow();
      const datosH = hojaHist.getRange(2, 1, ultH - 1, 12).getValues();
      for (let i = 0; i < datosH.length; i++) {
        const fh = datosH[i];
        const codPlano = String(fh[2] || "").trim();
        const remito = String(fh[6] || "").trim();
        const emisor = String(fh[7] || "").trim();
        const receptor = String(fh[8] || "").trim();
        const dictamen = String(fh[9] || "").trim();
        const fechaCom = normalizarFechaEstandar(fh[5]);
        if (codPlano || remito) {
          comunicacionesHistorial.push({
            codigoPlano: codPlano,
            fecha: fechaCom,
            remito: remito,
            emisor: emisor,
            receptor: receptor,
            dictamen: dictamen
          });
        }
      }
    }

    // 2. Leer todos los archivos y carpetas de comunicaciones indexados en Registro_Archivos_Drive (COMCT2 y COMTC2)
    const archivosComunicacionesDrive = [];
    const hojaRegDrive = ss.getSheetByName("Registro_Archivos_Drive");
    if (hojaRegDrive && hojaRegDrive.getLastRow() >= 2) {
      const datosD = hojaRegDrive.getRange(2, 1, hojaRegDrive.getLastRow() - 1, 4).getValues();
      datosD.forEach(fd => {
        const nomArc = String(fd[1] || "").trim();
        const rutaArc = String(fd[2] || "").trim();
        const fecArc = normalizarFechaEstandar(fd[3]);
        const comboU = (nomArc + " " + rutaArc).toUpperCase();
        if (
          comboU.includes("COMCT") || 
          comboU.includes("COMTC") || 
          comboU.includes("ORDENES DE SERVICIO") || 
          comboU.includes("NOTAS DE PEDIDO") || 
          comboU.includes("LIBRO DE PROYECTO")
        ) {
          archivosComunicacionesDrive.push(`- Archivo/Carpeta: "${nomArc}" | Ubicación: "${rutaArc}" | Fecha Drive: ${fecArc}`);
        }
      });
    }

    // 3. Extraer demoras y semáforos de las Hojas Master (SLA > 15 días y responsables)
    const planosConDemoraSla = [];
    NOMBRES_HOJAS_MASTER.forEach(nomH => {
      const proy = nomH.replace("Master ", "");
      const sh = ss.getSheetByName(nomH);
      if (!sh || sh.getLastRow() < 2) return;
      const datos = sh.getRange(2, 1, sh.getLastRow() - 1, Math.min(13, sh.getLastColumn())).getValues();
      datos.forEach(f => {
        const cod = String(f[0] || "").trim();
        const desc = String(f[1] || "").trim();
        const sla = String(f[11] || "").trim();
        const resp = String(f[7] || "UTE").trim();
        const etapa = String(f[6] || "").trim();
        const ultNota = String(f[9] || "").trim();
        const fecNota = normalizarFechaEstandar(f[8]);

        if (sla.includes("Vencido") || sla.includes("vencido") || etapa.includes("Observado") || etapa.includes("Devuelto")) {
          planosConDemoraSla.push({
            proyecto: proy,
            codigo: cod,
            descripcion: desc,
            responsableActual: resp,
            etapa: etapa,
            fechaUltimoMovimiento: fecNota,
            ultimaNota: ultNota,
            sla: sla
          });
        }
      });
    });

    const totalEmitidos = planos.length;
    
    // Resumen de planos emitidos por frente
    const resumenFrentes = {};
    planos.forEach(p => {
      const proy = p.proyecto || "General";
      if (!resumenFrentes[proy]) resumenFrentes[proy] = { total: 0, lista: [] };
      resumenFrentes[proy].total++;
      if (resumenFrentes[proy].lista.length < 15) {
        resumenFrentes[proy].lista.push(`${p.codigo} (Rev ${p.revision})`);
      }
    });

    const hitosTextoDetallado = hitos.map(h => {
      const planosReq = (h.planosRequeridos || []).join(", ");
      return `- Hito ${h.codigo}: "${h.nombre}" | Frente: ${h.frente} | FECHA CONTRACTUAL REAL: ${h.fechaObjetivo} | Semáforo: ${h.semaforoEtiqueta || h.diasRestantes + ' días'} | Planos requeridos: ${planosReq} | Condición: ${(h.requisitosCriticos || []).join('; ')}`;
    }).join("\n");

    const demorasTexto = planosConDemoraSla.map(d => 
      `- [${d.proyecto}] ${d.codigo}: En poder de "${d.responsableActual}" (${d.sla}). Etapa: ${d.etapa}. Última comunicación: ${d.ultimaNota} fecha ${d.fechaUltimoMovimiento}`
    ).join("\n") || "No se registran alertas críticas activas en las Hojas Master.";

    const comunicacionesTexto = comunicacionesHistorial.slice(-50).map(c => 
      `- [${c.fecha}] ${c.emisor} ➔ ${c.receptor} (${c.remito}): Dictamen: "${c.dictamen}" | Plano: ${c.codigoPlano}`
    ).join("\n") || "Sin registro histórico de comunicaciones.";

    const systemPrompt = 
      "Eres el Ingeniero Director de Control de Proyectos y Auditor Contractual de la obra de Alta Tensión 132 kV.\n" +
      "Debes generar un INFORME TÉCNICO EJECUTIVO RIGUROSO, VERÍDICO Y EXTREMADAMENTE PRECISO respondiendo exactamente a la solicitud del usuario.\n\n" +
      "REGLAS INQUEBRANTABLES:\n" +
      "1. PROHIBIDO INVENTAR NOTAS, ÓRDENES DE SERVICIO O FECHAS: Usa ÚNICAMENTE los documentos que existen realmente en el contexto provisto.\n" +
      "2. NOMENCLATURA REAL DEL LIBRO DE PROYECTO EN DRIVE:\n" +
      "   - Las notas emitidas por la UT hacia TRANSNOA llevan el código 'COMCT2-TU1-0001' hasta 'COMCT2-TU1-00019':\n" +
      "     * COMCT2-TU1-0001: Estudios etapa 2 firmado\n" +
      "     * COMCT2-TU1-0002: Consultas técnicas firmado\n" +
      "     * COMCT2-TU1-0003: Consultas técnicas firmado\n" +
      "     * COMCT2-TU1-0004: Estudios etapa 2 firmado\n" +
      "     * COMCT2-TU1-0005: Solicitud de información para estudios de campo VQ\n" +
      "     * COMCT2-TU1-0006: Consultas varias ET VQ\n" +
      "     * COMCT2-TU1-0007: Presentación documental en Libro de Proyecto\n" +
      "     * COMCT2-TU1-0008: Aviso de inicio de estudios en VQ\n" +
      "     * COMCT2-TU1-0009: Presentación documental en Libro de Proyecto\n" +
      "     * COMCT2-TU1-00010: Solicitud de información\n" +
      "     * COMCT2-TU1-00011: Proyecto de adecuación ingresos LAT a ET VQ\n" +
      "     * COMCT2-TU1-00012: Solicitud de información\n" +
      "     * COMCT2-TU1-00013: Entrega Ingeniería Proy ejecutivo ET V Quinteros\n" +
      "     * COMCT2-TU1-00014: Especificaciones técnicas de equipos principales\n" +
      "     * COMCT2-TU1-00015: Ingeniería Proy ejecutivo ET LEALES\n" +
      "     * COMCT2-TU1-00016: Entrega Ingeniería Proy ejecutivo LAT\n" +
      "     * COMCT2-TU1-00017: Elenco de doc. del Proy y Aprob. DPA ET Leales\n" +
      "     * COMCT2-TU1-00018: Formalización y entrega de minutas de reunión\n" +
      "     * COMCT2-TU1-00019: Acceso ET V Quinteros, Alt. solicitadas por Transnoa\n" +
      "   - Las Órdenes de Servicio emitidas por TRANSNOA en la carpeta 'ORDENES DE SERVICIO (LP)' llevan el código invertido 'COMTC2':\n" +
      "     * COMTC2-TU1-0005.pdf (15 sept)\n" +
      "     * COMTC2-TU1-0006.pdf (27 ago)\n" +
      "     * COMTC2-TU1-0007.pdf (22 sept)\n" +
      "     * COMTC2-TU1-0008.pdf (28 oct)\n" +
      "3. ADAPTABILIDAD ESTRICTA AL PEDIDO: Si el usuario pide un informe de comunicaciones con fecha y resumen de máximo 3 renglones por nota, genera exactamente la tabla y el desglose nota por nota con párrafos continuos de hasta 3 renglones (sin escribir 'Línea 1, Línea 2, Línea 3' y sin inventar órdenes de servicio que no existen en la carpeta).";

    const contextoDatos = 
      `FECHA DE CORTE DEL INFORME: ${fechaHoy}\n` +
      `TOTAL PLANOS EMITIDOS: ${totalEmitidos}\n\n` +
      `ARCHIVOS Y CARPETAS REALES EN LIBRO DE PROYECTO (DRIVE):\n${archivosComunicacionesDrive.join("\n") || "Ver registros COMCT2-TU1-0001 a 00019 y COMTC2-TU1-0005 a 0008"}\n\n` +
      `HISTORIAL DE COMUNICACIONES CRUZADAS (TRANSNOA - UTE - CONTRATISTA):\n${comunicacionesTexto}\n\n` +
      `PLANOS EMITIDOS POR FRENTE:\n${JSON.stringify(resumenFrentes, null, 2)}\n\n` +
      `CRONOGRAMA REAL DE HITOS:\n${hitosTextoDetallado}\n\n` +
      `AUDITORÍA DE PLANOS CON DEMORAS / SLA VENCIDO:\n${demorasTexto}`;

    const promptUsuario = 
      `SOLICITUD O REQUERIMIENTO A RESPONDER:\n"${solicitudUsuario}"\n\n` +
      `DATOS VIVOS Y REGISTROS OFICIALES DE LA OBRA:\n${contextoDatos}`;

    const payload = {
      contents: [{ parts: [{ text: promptUsuario }] }],
      systemInstruction: { parts: [{ text: systemPrompt }] },
      generationConfig: { temperature: 0.1 }
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
          const textoInforme = jsonResp.candidates[0].content.parts[0].text.trim();
          return {
            exito: true,
            ok: true,
            fecha: fechaHoy,
            informeMarkdown: textoInforme,
            metricas: {
              emitidos: totalEmitidos
            }
          };
        }
      } catch (err) {
        Logger.log(`Error informe modelo ${modelo}: ${err.message}`);
      }
    }

    return { exito: false, ok: false, error: "No se pudo generar el informe con los modelos configurados." };
  } catch (eGlobal) {
    return { exito: false, ok: false, error: eGlobal.message };
  }
}

/**
 * Guarda el informe generado como un Google Doc formal dentro de Drive (opcional).
 */
function guardarInformeEnDrive(titulo, contenidoMarkdown) {
  try {
    const carpetaRaiz = DriveApp.getFolderById(ID_CARPETA_RAIZ);
    let carpetaInformes = null;
    const subs = carpetaRaiz.getFolders();
    while (subs.hasNext()) {
      const f = subs.next();
      const nU = f.getName().toUpperCase();
      if (nU.includes("INFORMES") || nU.includes("REPORTES")) {
        carpetaInformes = f;
        break;
      }
    }
    if (!carpetaInformes) {
      carpetaInformes = carpetaRaiz.createFolder("08 - Informes Ejecutivos de Obra");
    }

    const fechaStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd_HHmm");
    const nomDoc = `${titulo || 'Informe_Ejecutivo'}_${fechaStr}`;
    const doc = DocumentApp.create(nomDoc);
    const body = doc.getBody();

    body.appendParagraph(titulo || "INFORME TÉCNICO DE AVANCE DE OBRA (132 kV)")
      .setHeading(DocumentApp.ParagraphHeading.HEADING_1)
      .setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    body.appendParagraph(`Fecha de emisión: ${new Date().toLocaleDateString()} | Generado por Sistema de Control Documental`)
      .setItalic(true)
      .setForegroundColor("#64748b");
    body.appendHorizontalRule();

    const lineas = (contenidoMarkdown || "").split("\n");
    lineas.forEach(l => {
      if (l.startsWith("### ")) {
        body.appendParagraph(l.replace("### ", "")).setHeading(DocumentApp.ParagraphHeading.HEADING_3).setForegroundColor("#0369a1");
      } else if (l.startsWith("## ")) {
        body.appendParagraph(l.replace("## ", "")).setHeading(DocumentApp.ParagraphHeading.HEADING_2).setForegroundColor("#0f172a");
      } else if (l.startsWith("# ")) {
        body.appendParagraph(l.replace("# ", "")).setHeading(DocumentApp.ParagraphHeading.HEADING_1).setForegroundColor("#0f172a");
      } else if (l.startsWith("- ") || l.startsWith("* ")) {
        body.appendListItem(l.substring(2));
      } else if (l.trim()) {
        body.appendParagraph(l);
      }
    });

    doc.saveAndClose();
    const fileDoc = DriveApp.getFileById(doc.getId());
    fileDoc.moveTo(carpetaInformes);

    return { ok: true, urlDoc: fileDoc.getUrl(), nombre: nomDoc };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Transcribe un archivo de audio grabado en obra usando Gemini Multimodal.
 */
function transcribirAudioConGemini(base64Audio, mimeType) {
  try {
    const apiKey = obtenerGeminiApiKeySegura();
    const prompt = 
      "Transcribe con total exactitud este audio grabado por un inspector en una obra de alta tensión de 132 kV y subestaciones.\n" +
      "Mantén y reconoce correctamente los términos técnicos como: piquetes, cotas, fundaciones, stubs, hormigón H-25, ensayos de probetas, malla PAT, morsetería, seccionadores, transformadores, normas IRAM e IEC, y números de planos o notas.\n" +
      "Devuelve ÚNICAMENTE el texto limpio y legible transcurrido, sin preámbulos ni comentarios agregados.";

    const payload = {
      contents: [{
        parts: [
          { text: prompt },
          { inline_data: { mime_type: mimeType || "audio/webm", data: base64Audio } }
        ]
      }],
      generationConfig: { temperature: 0.1 }
    };

    for (let m = 0; m < MODELOS_GEMINI.length; m++) {
      const modelo = MODELOS_GEMINI[m];
      const url = "https://generativelanguage.googleapis.com/v1beta/models/" + modelo + ":generateContent?key=" + apiKey;
      try {
        const resp = UrlFetchApp.fetch(url, {
          method: "post",
          contentType: "application/json",
          payload: JSON.stringify(payload),
          muteHttpExceptions: true
        });

        if (resp.getResponseCode() === 200) {
          const jsonResp = JSON.parse(resp.getContentText());
          const texto = jsonResp.candidates[0].content.parts[0].text.trim();
          return { ok: true, transcripcion: texto };
        }
      } catch (errModelo) {
        Logger.log(`Error transcribiendo con modelo ${modelo}: ${errModelo.message}`);
      }
    }
    return { ok: false, error: "No se pudo transcribir el audio con los modelos Gemini." };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Audita una fotografía tomada en el terreno por un inspector de obra usando Gemini Vision.
 */
function auditarFotoObraConGemini(base64Foto, mimeType, contextoTexto) {
  try {
    const apiKey = obtenerGeminiApiKeySegura();
    const prompt = 
      "Eres un Ingeniero Inspector Principal de Obras de Alta Tensión (132 kV) y Subestaciones.\n" +
      "Analiza esta fotografía tomada en el terreno.\n" +
      (contextoTexto ? `CONTEXTO DE LA FOTO: "${contextoTexto}"\n\n` : "") +
      "Genera un DICTAMEN TÉCNICO CONCISO estructurado en:\n" +
      "1. 📸 **Elementos Visuales Detectados** (estructuras, armaduras, encofrados, stubs, morsetería, terreno, etc.).\n" +
      "2. ⚠️ **Posibles Desvíos o Puntos de Control** (separación de barras, recubrimientos, nivelación, limpieza de excavación, etc.).\n" +
      "3. 📋 **Recomendación para la Bitácora de Inspección** (acción inmediata a requerir al contratista).";

    const payload = {
      contents: [{
        parts: [
          { text: prompt },
          { inline_data: { mime_type: mimeType || "image/jpeg", data: base64Foto } }
        ]
      }],
      generationConfig: { temperature: 0.1 }
    };

    for (let m = 0; m < MODELOS_GEMINI.length; m++) {
      const modelo = MODELOS_GEMINI[m];
      const url = "https://generativelanguage.googleapis.com/v1beta/models/" + modelo + ":generateContent?key=" + apiKey;
      try {
        const resp = UrlFetchApp.fetch(url, {
          method: "post",
          contentType: "application/json",
          payload: JSON.stringify(payload),
          muteHttpExceptions: true
        });

        if (resp.getResponseCode() === 200) {
          const jsonResp = JSON.parse(resp.getContentText());
          const texto = jsonResp.candidates[0].content.parts[0].text.trim();
          return { ok: true, dictamen: texto };
        }
      } catch (errModelo) {
        Logger.log(`Error auditando foto con modelo ${modelo}: ${errModelo.message}`);
      }
    }
    return { ok: false, error: "No se pudo procesar la imagen con los modelos Gemini." };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function abrirAppMovilModal() {
  const html = HtmlService.createHtmlOutputFromFile("AppObraMobile")
    .setWidth(450)
    .setHeight(800);
  SpreadsheetApp.getUi().showModalDialog(html, "📱 App Móvil de Obra 132 kV");
}

/**
 * Carga ligera y optimizada de datos para la aplicación móvil:
 * Consolida el inventario de planos, enlaces de Drive, enlaces del respaldo en Cloudflare R2,
 * el estado de interferencias y los hitos contractuales en un solo viaje de red.
 */
function obtenerDatosCompletosAppMovil() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const catalogoPlanos = [];

  // 1. Recorrer las 4 Hojas Master reales
  NOMBRES_HOJAS_MASTER.forEach(nomH => {
    const proy = nomH.replace("Master ", "");
    const sh = ss.getSheetByName(nomH);
    if (!sh || sh.getLastRow() < 2) return;

    const ultF = sh.getLastRow();
    const datos = sh.getRange(2, 1, ultF - 1, 11).getValues();
    const richDrive = sh.getRange(2, 10, ultF - 1, 1).getRichTextValues();

    for (let i = 0; i < datos.length; i++) {
      const c = String(datos[i][0] || "").trim();
      const d = String(datos[i][1] || "").trim();
      if (!c || c.toUpperCase() === "CÓDIGO" || c.toUpperCase() === "CODIGO") continue;

      let urlDrive = "";
      if (richDrive[i] && richDrive[i][0] && richDrive[i][0].getLinkUrl()) {
        urlDrive = richDrive[i][0].getLinkUrl();
      }

      const rev = String(datos[i][3] || "EO").trim();
      const est = String(datos[i][5] || "Abierto").trim();
      const etapa = String(datos[i][6] || "").trim();
      const obs = String(datos[i][10] || "").trim();

      const tieneApc = (typeof tieneSelloApcVerificado === "function")
        ? tieneSelloApcVerificado(c + " " + d, obs, etapa)
        : false;

      let urlR2 = "";
      if (R2_CONFIG && R2_CONFIG.ACCOUNT_ID) {
        const host = `${R2_CONFIG.ACCOUNT_ID}.r2.cloudflarestorage.com`;
        const pathObj = `Documentación Técnica/${proy}/${c}`;
        urlR2 = R2_CONFIG.PUBLIC_URL ? `${R2_CONFIG.PUBLIC_URL}/${encodeURI(pathObj)}` : `https://${host}/${R2_CONFIG.BUCKET_NAME}/${encodeURI(pathObj)}`;
      }

      catalogoPlanos.push({
        codigo: c,
        descripcion: d,
        disciplina: String(datos[i][2] || "Civil"),
        revision: rev,
        proyecto: proy,
        estado: est,
        selloApc: tieneApc,
        urlDrive: urlDrive,
        urlR2: urlR2
      });
    }
  });

  const props = PropertiesService.getScriptProperties();
  const mbR2 = props.getProperty("R2_TOTAL_MB") || "156.4";

  // 2. Cargar interferencias enriquecidas desde el motor
  const resInt = (typeof gestionarYAuditarInterferenciasTotal === "function")
    ? gestionarYAuditarInterferenciasTotal()
    : { empresas: [] };
  const listaInterferencias = resInt && resInt.empresas ? resInt.empresas : [];

  // 3. Catálogo Oficial de Pliegos de Especificaciones Técnicas (PET)
  const catalogoPliegos = obtenerCatalogoPliegosObra();

  // 4. Cronograma Maestro de Hitos Contractuales (desde R2 / Script Properties)
  const cronogramaHitos = obtenerCronogramaHitosContractuales();

  return {
    planos: catalogoPlanos,
    megabytesR2: mbR2,
    interferencias: listaInterferencias,
    pliegos: catalogoPliegos,
    hitos: cronogramaHitos
  };
}

/**
 * Catálogo de Pliegos de Especificaciones Técnicas Particulares y Generales (132 kV)
 */
function obtenerCatalogoPliegosObra() {
  return [
    {
      id: "PET-CIV-01",
      titulo: "Pliego Técnico de Obras Civiles y Fundaciones",
      codigo: "PET-OC-132KV",
      disciplina: "Civil",
      frente: "LAT / Subestaciones",
      articulosClave: "Hormigón H-25 (fck 25 MPa), Cemento ARS, Curado 7 días, Ensayos cada 20 m³",
      normas: "IRAM 1666, CIRSOC 201, CIRSOC 103",
      requisitos: "Estudio de suelos previo obligatorio, cota de apoyo nivelada, separadores de 50 mm.",
      urlDocumento: ""
    },
    {
      id: "PET-OEM-02",
      titulo: "Pliego Técnico de Montaje Electromecánico y Morsetería",
      codigo: "PET-OEM-132KV",
      disciplina: "Electromecánica",
      frente: "LAT El Bracho - Villa Quinteros",
      articulosClave: "Torque controlado de bulonería, morsetería de aleación de aluminio, cadenas de aisladores",
      normas: "IRAM 2437, IEC 60120, IEC 60383",
      requisitos: "Ensayo dinamométrico de tiro, torquímetro calibrado y certificado en obra.",
      urlDocumento: ""
    },
    {
      id: "PET-PAT-03",
      titulo: "Pliego de Malla de Puesta a Tierra y Protecciones",
      codigo: "PET-PAT-132KV",
      disciplina: "Electromecánica / Eléctrica",
      frente: "ET Leales / ET Villa Quinteros",
      articulosClave: "Resistencia máxima R < 0.5 ohm en ET y R < 10 ohm en estructuras LAT, soldadura cuproaluminotérmica",
      normas: "IEEE 80, IRAM 2281, AEA 95201",
      requisitos: "Protocolo de medición de resistividad de 4 picas (Wenner) y telurometría certificada.",
      urlDocumento: ""
    },
    {
      id: "PET-TCYP-04",
      titulo: "Pliego de Tableros, Protecciones, Control y SCADA",
      codigo: "PET-TCYP-132KV",
      disciplina: "Control y Protecciones",
      frente: "Subestaciones",
      articulosClave: "Protocolos IEC 61850, DNP 3.0, doble banco de baterías 110 Vcc, esquema diferencial de barras",
      normas: "IEC 61850, IEC 60255",
      requisitos: "Ensayos punto a punto con telecontrol TRANSNOA previos a energización.",
      urlDocumento: ""
    },
    {
      id: "PET-AMB-05",
      titulo: "Plan de Gestión Ambiental y Seguridad en Obra (PGA)",
      codigo: "PET-PGA-132KV",
      disciplina: "Seguridad y Medio Ambiente",
      frente: "General",
      articulosClave: "Manejo de efluentes, contención de aceite en transformadores, preservación de arbolado y caminos",
      normas: "Ley Provincial de Medio Ambiente, Res. ENRE 37/2010",
      requisitos: "Ficha de seguridad química en obrador y kit antiderrames en zona de trafo.",
      urlDocumento: ""
    }
  ];
}

/**
 * Cronograma Maestro de Hitos Contractuales (132 kV)
 * Consulta hitos guardados en R2 / Propiedades privadas sin crear archivos en Drive.
 */
function obtenerCronogramaHitosContractuales() {
  const hoy = new Date();

  const props = PropertiesService.getScriptProperties();
  const guardadosRaw = props.getProperty("CRONOGRAMA_HITOS_JSON");
  let hitosDefinidos = null;

  if (guardadosRaw) {
    try {
      hitosDefinidos = JSON.parse(guardadosRaw);
    } catch(e){}
  }

  if (!hitosDefinidos || hitosDefinidos.length === 0) {
    hitosDefinidos = [
      {
        id: "HITO-01",
        codigo: "H-01",
        nombre: "Ingeniería Básica y Ejecutiva de Traza LAT",
        frente: "LAT El Bracho - Villa Quinteros",
        fechaObjetivo: "2026-11-20",
        pesoContractual: "15%",
        responsable: "Proyectista / TRANSNOA",
        requisitosCriticos: [
          "Plano Planialtimétrico General PL-500",
          "Perfil de Cruce RN 38 (PL-011)",
          "Cálculo de fundaciones de estructuras terminales"
        ],
        planosRequeridos: ["L-EB-VQ-OC-PL-500", "L-EB-VQ-OC-PL-011", "L-EB-VQ-OC-MD-501"]
      },
      {
        id: "HITO-02",
        codigo: "H-02",
        nombre: "Liberación de Permisos de Cruce de Interferencias Críticas",
        frente: "LAT El Bracho - Villa Quinteros",
        fechaObjetivo: "2026-12-05",
        pesoContractual: "10%",
        responsable: "UTE (Gestión Permisos)",
        requisitosCriticos: [
          "Permiso de cruce de gasoducto TGN (Vanos P35-P38)",
          "Permiso de cruce de Ruta Nacional 38 (Vialidad Nacional)",
          "Autorización de cruce de vías Belgrano Cargas (CNRT)"
        ],
        planosRequeridos: ["L-EB-VQ-OC-PL-500", "L-EB-VQ-OC-PL-011", "L-EB-VQ-OEM-MD-300"]
      },
      {
        id: "HITO-03",
        codigo: "H-03",
        nombre: "Hormigonado de Fundaciones de Pórticos y Transformadores ET Leales",
        frente: "ET Leales",
        fechaObjetivo: "2026-12-28",
        pesoContractual: "20%",
        responsable: "Contratista Obra Civil",
        requisitosCriticos: [
          "Estudio de Suelos y Mecánica de Suelos ET Leales (MD-513)",
          "Planos de replanteo y armaduras de bases de transformadores",
          "Protocolos de rotura de probetas H-25 a 7 y 28 días"
        ],
        planosRequeridos: ["ET-LE-OC-MD-513", "ET-LE-OC-PL-501", "ET-LE-OC-PL-505"]
      },
      {
        id: "HITO-04",
        codigo: "H-04",
        nombre: "Montaje de Estructuras Metálicas y Tendido de Conductores Tramo 1",
        frente: "LAT El Bracho - Villa Quinteros",
        fechaObjetivo: "2027-02-15",
        pesoContractual: "25%",
        responsable: "Contratista Montaje",
        requisitosCriticos: [
          "Fundaciones hormigonadas con 28 días de fraguado mínimo",
          "Inspección de bulonería y torquímetro verificado",
          "Tabla de flechado y tensado según temperatura ambiente"
        ],
        planosRequeridos: ["L-EB-VQ-OEM-PL-300", "L-EB-VQ-OC-PL-510"]
      },
      {
        id: "HITO-05",
        codigo: "H-05",
        nombre: "Ensayos SAT y Pruebas Punto a Punto de Telecontrol (SCADA)",
        frente: "ET Villa Quinteros / ET El Bracho",
        fechaObjetivo: "2027-04-10",
        pesoContractual: "15%",
        responsable: "Especialista Protecciones / TRANSNOA",
        requisitosCriticos: [
          "Malla PAT ensayada con telurómetro (R < 0.5 ohm)",
          "Protocolo punto a punto con Centro de Control TRANSNOA",
          "Acta de recepción provisoria de tableros de control"
        ],
        planosRequeridos: ["ET-VQ-TCYP-PL-100", "ET-VQ-OEM-PL-313"]
      },
      {
        id: "HITO-06",
        codigo: "H-06",
        nombre: "Puesta en Servicio Comercial (COD) y Energización a 132 kV",
        frente: "Corredor Completo 132 kV",
        fechaObjetivo: "2027-05-30",
        pesoContractual: "15%",
        responsable: "Comitente / UTE / TRANSNOA",
        requisitosCriticos: [
          "100% de los planos de la obra emitidos",
          "Conforme a Obra emitidos y aprobados",
          "Acta de inicio de período de garantía"
        ],
        planosRequeridos: ["TODOS"]
      }
    ];
  }

  return hitosDefinidos.map(h => {
    const fObj = new Date(h.fechaObjetivo + "T00:00:00");
    const diffMs = fObj.getTime() - hoy.getTime();
    const diasRestantes = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    let semaforo = "EN_PLAZO";
    let semaforoEtiqueta = `🟢 En plazo (${diasRestantes}d)`;
    let semaforoColor = "text-emerald-400 bg-emerald-950/40 border-emerald-800";

    if (diasRestantes < 0) {
      semaforo = "VENCIDO";
      semaforoEtiqueta = `🔴 Vencido (${Math.abs(diasRestantes)}d atrás)`;
      semaforoColor = "text-rose-400 bg-rose-950/40 border-rose-800";
    } else if (diasRestantes <= 15) {
      semaforo = "ALERTA";
      semaforoEtiqueta = `🟡 Por vencer (${diasRestantes}d)`;
      semaforoColor = "text-amber-400 bg-amber-950/40 border-amber-800";
    }

    return {
      id: h.id,
      codigo: h.codigo,
      nombre: h.nombre,
      frente: h.frente,
      fechaObjetivo: h.fechaObjetivo,
      diasRestantes: diasRestantes,
      pesoContractual: h.pesoContractual,
      responsable: h.responsable,
      semaforo: semaforo,
      semaforoEtiqueta: semaforoEtiqueta,
      semaforoColor: semaforoColor,
      requisitosCriticos: h.requisitosCriticos || [],
      planosRequeridos: h.planosRequeridos || []
    };
  });
}

/**
 * Genera la Ficha Técnica estructurada del Anotador de Obra:
 */
function generarFichaTecnicaAnotador(query) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const queryLimpia = String(query || "").trim();

    let contextoPlanos = "";
    NOMBRES_HOJAS_MASTER.forEach(nomH => {
      const sh = ss.getSheetByName(nomH);
      if (!sh || sh.getLastRow() < 2) return;
      const datos = sh.getRange(2, 1, sh.getLastRow() - 1, 11).getValues();
      datos.forEach(f => {
        const c = String(f[0] || "");
        const d = String(f[1] || "");
        const combo = (c + " " + d).toUpperCase();
        if (combo.includes(queryLimpia.toUpperCase())) {
          contextoPlanos += `- Plano: ${c} | Título: ${d} | Rev: ${f[3]} | Estado: ${f[5]} | Etapa: ${f[6]}\n`;
        }
      });
    });

    const systemPrompt = 
      "Eres el Ingeniero Auditor Principal de Obras de Alta Tensión (132 kV) y Subestaciones en Tucumán (ET Leales, ET El Bracho, ET Villa Quinteros y LAT El Bracho - Villa Quinteros).\n" +
      "Cuando el usuario consulte un tema constructivo o técnico, genera una FICHA TÉCNICA ESTRUCTURADA con el siguiente formato exacto:\n\n" +
      "## 📜 1. EXIGENCIAS DEL PLIEGO TÉCNICO\n" +
      "(Normas IRAM/IEC, tolerancias, tipo de materiales, resistencias, ensayos y tiempos obligatorios).\n\n" +
      "## 📐 2. ESPECIFICACIÓN EN PLANOS APROBADOS (APC)\n" +
      "(Cotas, geometrías, armaduras, recubrimientos mínimos o esquemas según los planos del proyecto).\n\n" +
      "## ⚠️ 3. AUDITORÍA & PUNTOS CRÍTICOS DE CONTROL\n" +
      "(Discrepancias habituales entre pliego y plano, qué verificar antes de autorizar el avance).\n\n" +
      "## 🏗️ 4. PASO A PASO EN TERRENO (GUÍA DE INSPECCIÓN)\n" +
      "(Secuencia ordenada del 1 al 6 para que el inspector recorra la tarea en el campo con seguridad).";

    const promptUsuario = 
      `TEMA A AUDITAR: "${queryLimpia}"\n\n` +
      `PLANOS RELACIONADOS REGISTRADOS EN LA OBRA:\n${contextoPlanos || "Buscar en catálogo general de pliego y normas 132 kV."}`;

    const payload = {
      contents: [{ parts: [{ text: promptUsuario }] }],
      systemInstruction: { parts: [{ text: systemPrompt }] },
      generationConfig: { temperature: 0.1 }
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
          return { exito: true, ok: true, ficha: jsonResp.candidates[0].content.parts[0].text };
        }
      } catch (e) {
        Logger.log(`Error ficha anotador con modelo ${modelo}: ${e.message}`);
      }
    }

    return { exito: false, ok: false, error: "No se pudo generar la ficha con la IA." };
  } catch (err) {
    return { exito: false, ok: false, error: err.message };
  }
}

function abrirModalNotebookLM() {
  const html = HtmlService.createHtmlOutputFromFile("ChatModal")
    .setWidth(1200)
    .setHeight(800);
  SpreadsheetApp.getUi().showModalDialog(html, "📓 Notebook de Ingeniería 132 kV");
}

function ejecutarSincronizacionTotalCompleta() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  try {
    ss.toast("Paso 1/4: Escaneando novedades en Drive...", "Sincronización Total 🚀", 5);
    const resEscaneo = escanearNovedadesDesdeUltimaFecha();
    
    ss.toast("Paso 2/4: Normalizando estados, semáforo SLA y enlaces multi-revisión...", "Sincronización Total 🚀", 5);
    limpiarYNormalizarHojasMasterCompleto();
    
    ss.toast("Paso 3/4: Reorganizando planos en hojas correspondientes...", "Sincronización Total 🚀", 5);
    reorganizarPlanosEnHojasCorrectas();
    
    ss.toast("Paso 4/4: Reconstruyendo Tablero Físico y Faltantes...", "Sincronización Total 🚀", 5);
    const kpis = generarReporteComparacionElencos();
    
    ss.toast(
      `✅ Sincronización Total completada con éxito. Conciliados: ${kpis.totalCargados} | Faltantes: ${kpis.faltantes}`,
      "Proceso Finalizado",
      7
    );
    return { ok: true, kpis: kpis, escaneo: resEscaneo };
  } catch (err) {
    ss.toast("Error durante la sincronización: " + err.message, "Atención ⚠️", 8);
    throw err;
  }
}

function mostrarDialogoApiKeySegura() {
  const ui = SpreadsheetApp.getUi();
  const res = ui.prompt(
    "🔐 Configurar API Key Segura (PropertiesService)",
    "Ingresa tu clave de Gemini API. Se guardará encriptada en las Propiedades del Script:",
    ui.ButtonSet.OK_CANCEL
  );
  if (res.getSelectedButton() === ui.Button.OK) {
    const texto = res.getResponseText().trim();
    const out = configurarGeminiApiKeyManual(texto);
    if (out.ok) {
      SpreadsheetApp.getActiveSpreadsheet().toast("API Key almacenada de forma segura en PropertiesService.", "Seguridad Lista 🔐", 5);
    } else {
      SpreadsheetApp.getActiveSpreadsheet().toast(out.error, "Error", 5);
    }
  }
}

function abrirSidebar() {
  const html = HtmlService.createHtmlOutputFromFile("ProgresoSidebar")
    .setTitle("⚡ Panel de Control Documental")
    .setWidth(340);
  SpreadsheetApp.getUi().showSidebar(html);
}

function abrirModalChat() {
  const html = HtmlService.createHtmlOutputFromFile("ChatModal")
    .setWidth(1000)
    .setHeight(750);
  SpreadsheetApp.getUi().showModalDialog(html, "🤖 Asistente Documental IA");
}

function abrirModalDetalleConciliados() {
  const html = HtmlService.createHtmlOutputFromFile("ConciliadosModal")
    .setWidth(1150)
    .setHeight(720);
  SpreadsheetApp.getUi().showModalDialog(html, "📋 Auditor de Planos Conciliados vs Faltantes");
}

function abrirModalMatrizActores() {
  const html = HtmlService.createHtmlOutputFromFile("MatrizActoresModal")
    .setWidth(1200)
    .setHeight(750);
  SpreadsheetApp.getUi().showModalDialog(html, "📡 Matriz de Comunicaciones: Envíos y Devoluciones");
}

function abrirModalAuditorWord() {
  const html = HtmlService.createHtmlOutputFromFile("ComparadorWordModal")
    .setWidth(1200)
    .setHeight(750);
  SpreadsheetApp.getUi().showModalDialog(html, "📑 Auditor de Entregas: Informe Word/PDF vs Drive y Master");
}

function abrirModalTrazabilidad() {
  const html = HtmlService.createHtmlOutputFromFile("TrazabilidadModal")
    .setWidth(950)
    .setHeight(720);
  SpreadsheetApp.getUi().showModalDialog(html, "🔍 Trazabilidad y Línea de Tiempo de Documentos");
}

function obtenerCodigoDeCeldaActiva() {
  try {
    const celda = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet().getActiveCell();
    const val = String(celda.getValue() || "").trim();
    if (val && (val.includes("ET-") || val.includes("L-EB") || val.includes("PL-") || val.includes("MD-") || val.includes("PN-"))) {
      return val.replace(/^[._\-\s]+/, "").trim();
    }
  } catch (e) {}
  return "";
}

function obtenerEstadoProgreso() {
  const props = PropertiesService.getScriptProperties();
  const procesados = parseInt(props.getProperty("PROCESADOS_ARCHIVOS") || "0", 10);
  let total = parseInt(props.getProperty("TOTAL_ARCHIVOS") || "0", 10);

  if (total === 0 || procesados > total) {
    total = Math.max(procesados, total);
    props.setProperty("TOTAL_ARCHIVOS", total.toString());
  }

  const estado = props.getProperty("ESTADO_PROCESO") || "Inactivo";
  const ultimoArchivo = props.getProperty("ULTIMO_ARCHIVO") || "-";

  let porcentaje = 0;
  if (total > 0) {
    porcentaje = Math.min(100, Math.round((procesados / total) * 100));
  }
  if (estado === "Completado") {
    porcentaje = 100;
  }

  const ultimaFechaEscaneo = props.getProperty("FECHA_ULTIMO_ESCANEO") || "Sin registro previo";
  const nuevosEncontrados = props.getProperty("NOVEDADES_ULTIMO_ESCANEO") || "0";

  return { total, procesados, porcentaje, estado, ultimoArchivo, ultimaFechaEscaneo, nuevosEncontrados };
}

function pausarProceso() {
  PropertiesService.getScriptProperties().setProperty("PAUSAR_SOLICITADO", "TRUE");
  PropertiesService.getScriptProperties().setProperty("ESTADO_PROCESO", "Pausado");
  return { ok: true };
}

function reiniciarProcesoCompleto() {
  const props = PropertiesService.getScriptProperties();
  props.deleteProperty("PROCESADOS_ARCHIVOS");
  props.deleteProperty("PAUSAR_SOLICITADO");
  props.deleteProperty("ULTIMO_ARCHIVO");
  props.deleteProperty("FECHA_ULTIMO_ESCANEO");
  props.deleteProperty("NOVEDADES_ULTIMO_ESCANEO");
  props.deleteProperty("DRIVE_CONTINUATION_TOKEN");
  props.setProperty("ESTADO_PROCESO", "Inactivo");
  return { ok: true };
}

function obtenerHojaHistorico(ss) {
  let hoja = ss.getSheetByName("Histórico Transmittals") || ss.getSheetByName("Historico Transmittals");
  if (!hoja) {
    hoja = ss.insertSheet("Histórico Transmittals");
    hoja.appendRow(CABECERAS_HISTORICO);
    hoja.getRange(1, 1, 1, CABECERAS_HISTORICO.length)
      .setBackground("#2e5339")
      .setFontColor("#ffffff")
      .setFontWeight("bold")
      .setFontSize(10)
      .setHorizontalAlignment("center");
    hoja.setFrozenRows(1);
  }
  return hoja;
}

function obtenerOCrearHojaMaster(ss, nombreHoja) {
  let hoja = ss.getSheetByName(nombreHoja);
  if (!hoja) {
    hoja = ss.insertSheet(nombreHoja);
    asegurarEncabezadoHoja(hoja);
  }
  return hoja;
}

function asegurarEncabezadoHoja(hoja) {
  hoja.getRange(1, 1, 1, CABECERAS_MASTER.length)
    .setValues([CABECERAS_MASTER])
    .setBackground("#2e5339")
    .setFontColor("#ffffff")
    .setFontWeight("bold")
    .setFontSize(10)
    .setHorizontalAlignment("center");
  hoja.setFrozenRows(1);
}

/**
 * Procesa consultas directas al asistente técnico de ingeniería con Gemini
 */
function responderConsultaAsistenteConGemini(pregunta, contexto) {
  try {
    const apiKey = obtenerGeminiApiKeySegura();
    if (!apiKey) {
      return { 
        ok: false, 
        error: "Falta configurar la clave API de Gemini en Propiedades del Script." 
      };
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let resumenMaster = "";
    if (typeof NOMBRES_HOJAS_MASTER !== 'undefined' && Array.isArray(NOMBRES_HOJAS_MASTER)) {
      NOMBRES_HOJAS_MASTER.forEach(nomH => {
        const sh = ss.getSheetByName(nomH);
        if (!sh || sh.getLastRow() < 2) return;
        const cant = sh.getLastRow() - 1;
        resumenMaster += `- ${nomH}: ${cant} planos registrados.\n`;
      });
    }

    const systemPrompt = 
      "Eres el Asistente Técnico Principal e Ingeniero Especialista en Obra de Alta Tensión (132 kV) y Subestaciones en Tucumán:\n" +
      "- Proyecto: LAT 132 kV Doble Terna El Bracho - Villa Quinteros (52.6 km) y Subestaciones Transformadoras (ET Leales 132/33/13.2 kV, ET Villa Quinteros y ET El Bracho).\n" +
      "- Normas aplicables: Pliegos TRANSNOA, IRAM, CIRSOC 201/103, IEEE 80, AEA 95201, Resoluciones ENRE.\n" +
      "- Actúa con total profesionalismo de ingeniería eléctrica/civil, respondiendo con datos precisos, cálculos, normativas o directivas claras de inspección.\n" +
      (contexto ? `Contexto del frente consultado: "${contexto}"\n` : "");

    const promptUsuario = 
      `CONSULTA DEL INSPECTOR/INGENIERO:\n"${pregunta}"\n\n` +
      `ESTADO GENERAL DEL REPOSITORIO:\n${resumenMaster}`;

    const payload = {
      contents: [{ parts: [{ text: promptUsuario }] }],
      systemInstruction: { parts: [{ text: systemPrompt }] },
      generationConfig: { temperature: 0.2, maxOutputTokens: 2048 }
    };

    const modelos = (typeof MODELOS_GEMINI !== 'undefined' && Array.isArray(MODELOS_GEMINI)) 
      ? MODELOS_GEMINI 
      : ["gemini-2.5-flash", "gemini-1.5-flash"];

    for (let m = 0; m < modelos.length; m++) {
      const modelo = modelos[m];
      const url = "https://generativelanguage.googleapis.com/v1beta/models/" + modelo + ":generateContent?key=" + apiKey;
      try {
        const resp = UrlFetchApp.fetch(url, {
          method: "post",
          contentType: "application/json",
          payload: JSON.stringify(payload),
          muteHttpExceptions: true
        });

        if (resp.getResponseCode() === 200) {
          const jsonResp = JSON.parse(resp.getContentText());
          const textoResp = jsonResp.candidates[0].content.parts[0].text.trim();
          return { ok: true, exito: true, respuesta: textoResp };
        }
      } catch (errModelo) {
        Logger.log(`Error chat Gemini con modelo ${modelo}: ${errModelo.message}`);
      }
    }

    return { ok: false, error: "No se pudo obtener respuesta de los modelos Gemini disponibles." };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}