/**
 * ====================================================================================================
 * ARCHIVO: TrazabilidadConciliacion.gs
 * MÓDULO COMPLETO DE TRAZABILIDAD CRONOLÓGICA, BUSCADOR DE LÍNEA DE TIEMPO, REGISTRO DE EVENTOS,
 * CONCILIACIÓN DE ELENCOS (CARGADOS VS FALTANTES), TABLERO RESUMEN FÍSICO Y ACTIVADORES AUTOMÁTICOS.
 * ====================================================================================================
 */

/**
 * Devuelve el catálogo completo de planos (de las 4 Hojas Master, del Histórico y del Elenco Oficial)
 * para alimentar el buscador con autocompletado en TrazabilidadModal.html.
 */
function obtenerCatalogoCodigosParaTrazabilidad() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const mapaCatalogo = new Map();

  // 1. Leer de las 4 Hojas Master
  NOMBRES_HOJAS_MASTER.forEach(nomHoja => {
    const proy = nomHoja.replace("Master ", "");
    const sh = ss.getSheetByName(nomHoja);
    if (!sh || sh.getLastRow() < 2) return;

    const datos = sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues();
    datos.forEach(r => {
      const cod = String(r[0] || "").trim();
      const desc = String(r[1] || "").trim();
      if (!cod || cod.toUpperCase() === "CÓDIGO" || cod.toUpperCase() === "CODIGO") return;

      const key = cod.toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (key && !mapaCatalogo.has(key)) {
        mapaCatalogo.set(key, {
          cod: cod,
          desc: desc || "Documento Técnico",
          proy: proy
        });
      }
    });
  });

  // 2. Complementar con Histórico Transmittals por si se busca un plano o remito histórico
  const hojaHist = ss.getSheetByName("Histórico Transmittals") || ss.getSheetByName("Historico Transmittals");
  if (hojaHist && hojaHist.getLastRow() >= 2) {
    const datosH = hojaHist.getRange(2, 1, hojaHist.getLastRow() - 1, 7).getValues();
    datosH.forEach(r => {
      const proy = String(r[1] || "").trim();
      const cod = String(r[2] || "").trim();
      const desc = String(r[3] || "").trim();
      if (!cod || cod.toUpperCase() === "CÓDIGO") return;

      const key = cod.toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (key && !mapaCatalogo.has(key)) {
        mapaCatalogo.set(key, {
          cod: cod,
          desc: desc || "Documento en Histórico",
          proy: proy || determinarProyectoPorCodigo(cod, desc, "")
        });
      }
    });
  }

  return Array.from(mapaCatalogo.values()).sort((a, b) => a.cod.localeCompare(b.cod));
}

/**
 * Convierte una fecha en formato DD/MM/YYYY o YYYY-MM-DD a milisegundos para ordenar cronológicamente.
 */
function parsearFechaAMilisegundos(fechaStr) {
  if (!fechaStr) return 0;
  if (Object.prototype.toString.call(fechaStr) === "[object Date]" && !isNaN(fechaStr.getTime())) {
    return fechaStr.getTime();
  }
  const norm = normalizarFechaEstandar(fechaStr);
  if (!norm) return 0;
  const partes = norm.split("/");
  if (partes.length === 3) {
    const d = parseInt(partes[0], 10);
    const m = parseInt(partes[1], 10) - 1;
    const y = parseInt(partes[2], 10);
    const dt = new Date(y, m, d);
    if (!isNaN(dt.getTime())) return dt.getTime();
  }
  return 0;
}

/**
 * ====================================================================================================
 * ACTUALIZADOR Y COMPARADOR DE ELENCOS DE INGENIERÍA
 * Escanea la carpeta 'Elenco de documentos de ingeniería' en Google Drive, lee PDFs o Sheets del elenco
 * con Gemini / Tablas, y detecta qué planos se agregaron, cambiaron de revisión oficial o cambiaron
 * de descripción respecto a la pestaña 'Elencos_Oficiales_Referencia'.
 * ====================================================================================================
 */
function actualizarYVerificarCambiosEnElencos() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.toast("Buscando archivos de Elenco en Drive...", "Actualizando Elencos 📑", 5);

  let hojaElenco = ss.getSheetByName("Elencos_Oficiales_Referencia");
  if (!hojaElenco) {
    hojaElenco = ss.insertSheet("Elencos_Oficiales_Referencia");
    hojaElenco.appendRow([
      "OBRA / PROYECTO",
      "CÓDIGO OFICIAL",
      "DESCRIPCIÓN OFICIAL",
      "DISCIPLINA",
      "REV CONTRACTUAL",
      "ARCHIVO ORIGEN",
      "FECHA ÚLTIMA ACTUALIZACIÓN"
    ]);
    hojaElenco.getRange(1, 1, 1, 7).setBackground("#15803d").setFontColor("#ffffff").setFontWeight("bold");
    hojaElenco.setFrozenRows(1);
  }

  // 1. Cargar el catálogo existente en memoria
  const mapaElencoExistente = new Map();
  if (hojaElenco.getLastRow() >= 2) {
    const filasE = hojaElenco.getRange(2, 1, hojaElenco.getLastRow() - 1, 6).getValues();
    filasE.forEach((r, idx) => {
      const cod = String(r[1] || "").trim();
      const codK = cod.toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (codK) {
        mapaElencoExistente.set(codK, {
          fila: idx + 2,
          proyecto: String(r[0] || "").trim(),
          codigo: cod,
          descripcion: String(r[2] || "").trim(),
          disciplina: String(r[3] || "").trim(),
          revision: String(r[4] || "EO").trim(),
          archivoOrigen: String(r[5] || "").trim()
        });
      }
    });
  }

  // 2. Localizar la carpeta 'Elenco de documentos de ingeniería' en Drive
  const carpetaRaiz = DriveApp.getFolderById(ID_CARPETA_RAIZ);
  let carpetaElencos = null;

  function buscarCarpetaElencoRec(folder) {
    const nNorm = normalizarTexto(folder.getName());
    if (nNorm.includes("elenco de documentos de ingenieria") || (nNorm.includes("elenco") && nNorm.includes("ingenieria"))) {
      carpetaElencos = folder;
      return;
    }
    const subs = folder.getFolders();
    while (subs.hasNext()) {
      const s = subs.next();
      buscarCarpetaElencoRec(s);
      if (carpetaElencos) return;
    }
  }

  buscarCarpetaElencoRec(carpetaRaiz);

  if (!carpetaElencos) {
    ss.toast("No se encontró la carpeta de Elencos en Drive. Se verificará con los datos cargados.", "Aviso", 5);
    generarReporteComparacionElencos();
    return { ok: false, error: "Carpeta de Elencos no encontrada." };
  }

  // 3. Extraer documentos técnicos de cada archivo de elenco encontrado en Drive
  const archivos = carpetaElencos.getFiles();
  const documentosNuevosLeidos = [];
  const hoyStr = normalizarFechaEstandar(new Date());

  let totalArchivosElencoLeidos = 0;

  while (archivos.hasNext()) {
    const arc = archivos.next();
    const nomArc = arc.getName();
    if (nomArc.startsWith("~$") || nomArc.startsWith("._")) continue;

    const mime = arc.getMimeType();
    totalArchivosElencoLeidos++;
    ss.toast(`Analizando elenco: ${nomArc}...`, "IA Gemini 📑", 3);

    try {
      if (mime === MimeType.PDF) {
        const b64 = Utilities.base64Encode(arc.getBlob().getBytes());
        const datos = extraerElencoConGemini(b64, nomArc);
        if (datos && datos.documentos) {
          datos.documentos.forEach(doc => {
            documentosNuevosLeidos.push({
              codigo: doc.codigo,
              descripcion: doc.descripcion,
              disciplina: doc.disciplina,
              revision: doc.revision || "EO",
              archivoOrigen: nomArc
            });
          });
        }
      } else if (mime === MimeType.GOOGLE_SHEETS || nomArc.endsWith(".xlsx") || nomArc.endsWith(".xls")) {
        // Si el elenco es una planilla de cálculo, leer celdas directamente
        let shElenco;
        if (mime === MimeType.GOOGLE_SHEETS) {
          shElenco = SpreadsheetApp.openById(arc.getId()).getSheets()[0];
        } else {
          // Si es Excel, intentar parsear
          try {
            const tempFile = Drive.Files.copy({ title: "Temp_Elenco_Parse" }, arc.getId(), { convert: true });
            const tempSs = SpreadsheetApp.openById(tempFile.id);
            shElenco = tempSs.getSheets()[0];
            Drive.Files.remove(tempFile.id);
          } catch (eCnv) {}
        }

        if (shElenco && shElenco.getLastRow() >= 2) {
          const vals = shElenco.getRange(2, 1, Math.min(600, shElenco.getLastRow() - 1), Math.min(8, shElenco.getLastColumn())).getValues();
          vals.forEach(fila => {
            const c0 = String(fila[0] || "").trim();
            const c1 = String(fila[1] || "").trim();
            const c2 = String(fila[2] || "").trim();
            const c3 = String(fila[3] || "").trim();

            const matchCod = (c0 + " " + c1).match(/((?:ET[-_](?:LE|VQ|BR|EB)|L[-_]EB[-_]VQ)[-_](?:OE|OC|OEM|TCYP)[-_](?:PL|MD|PN|DG|ET|IS|MC)[-_]?[0-9]{2,4})/i);
            if (matchCod) {
              const codEncontrado = matchCod[1].toUpperCase().replace(/_/g, "-");
              const desc = (c1.length > 5 && !c1.includes(codEncontrado)) ? c1 : (c2 || "Documento Técnico " + codEncontrado);
              const rev = extraerRevisionCanonico(c2 + " " + c3, c3);
              documentosNuevosLeidos.push({
                codigo: codEncontrado,
                descripcion: desc,
                disciplina: inferirDisciplina(codEncontrado, desc),
                revision: rev || "EO",
                archivoOrigen: nomArc
              });
            }
          });
        }
      }
    } catch (errArc) {
      Logger.log("Aviso al procesar archivo de elenco " + nomArc + ": " + errArc.message);
    }
  }

  // 4. Comparar lo leído contra lo que ya estaba en la hoja oficial
  let agregados = 0;
  let modificacionesRevision = 0;
  let modificacionesDescripcion = 0;
  const listaNovedadesElenco = [];

  documentosNuevosLeidos.forEach(doc => {
    const meta = desglosarMetadatosDocumento(doc.codigo, doc.descripcion);
    const codLimpio = limpiarCodigoPlanoOficial(meta.codigo || doc.codigo);
    if (!codLimpio) return;

    const codK = codLimpio.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const proy = determinarProyectoPorCodigo(codLimpio, meta.descripcion, doc.archivoOrigen);
    const revLimpia = extraerRevisionCanonico(doc.revision, doc.revision);
    const discLimpia = doc.disciplina || meta.disciplina || inferirDisciplina(codLimpio, meta.descripcion);

    if (!mapaElencoExistente.has(codK)) {
      // PLANO NUEVO EN EL ELENCO CONTRACTUAL: Insertar fila
      hojaElenco.appendRow([
        proy,
        codLimpio,
        meta.descripcion,
        discLimpia,
        revLimpia,
        doc.archivoOrigen,
        hoyStr
      ]);
      const nuevaF = hojaElenco.getLastRow();
      hojaElenco.getRange(nuevaF, 1, 1, 7).setBackground("#f0fdf4").setFontSize(9);
      hojaElenco.getRange(nuevaF, 2).setFontFamily("Consolas").setFontWeight("bold");

      agregados++;
      listaNovedadesElenco.push({
        tipo: "NUEVO_EN_ELENCO",
        codigo: codLimpio,
        detalle: `Plano nuevo incorporado al contrato: ${meta.descripcion}`
      });

      mapaElencoExistente.set(codK, {
        fila: nuevaF,
        proyecto: proy,
        codigo: codLimpio,
        descripcion: meta.descripcion,
        disciplina: discLimpia,
        revision: revLimpia,
        archivoOrigen: doc.archivoOrigen
      });
    } else {
      // PLANO YA EXISTÍA: Verificar si cambió su revisión contractual o descripción
      const previo = mapaElencoExistente.get(codK);
      let cambioFila = false;

      if (revLimpia && revLimpia !== "EO" && revLimpia !== previo.revision) {
        hojaElenco.getRange(previo.fila, 5).setValue(revLimpia).setFontWeight("bold").setFontColor("#15803d");
        listaNovedadesElenco.push({
          tipo: "CAMBIO_REVISION",
          codigo: codLimpio,
          detalle: `Revisión contractual actualizada: de Rev ${previo.revision} a Rev ${revLimpia}`
        });
        previo.revision = revLimpia;
        modificacionesRevision++;
        cambioFila = true;
      }

      if (meta.descripcion && meta.descripcion.length > previo.descripcion.length + 5) {
        hojaElenco.getRange(previo.fila, 3).setValue(meta.descripcion);
        previo.descripcion = meta.descripcion;
        modificacionesDescripcion++;
        cambioFila = true;
      }

      if (cambioFila) {
        hojaElenco.getRange(previo.fila, 7).setValue(hoyStr);
        hojaElenco.getRange(previo.fila, 1, 1, 7).setBackground("#fefce8");
      }
    }
  });

  // 5. Normalizar descripciones en las 4 Master y actualizar el Tablero Físico Resumen
  limpiarYNormalizarHojasMasterCompleto();
  const kpisActualizados = generarReporteComparacionElencos();

  let mensajeToast = `Elencos verificados. Planificados totales: ${kpisActualizados.totalPlanificados}. `;
  if (agregados > 0 || modificacionesRevision > 0) {
    mensajeToast += `(${agregados} nuevos agregados, ${modificacionesRevision} revisiones actualizadas).`;
  } else {
    mensajeToast += `No se detectaron discrepancias contractuales nuevas.`;
  }

  SpreadsheetApp.getActiveSpreadsheet().toast(mensajeToast, "Elencos al Día ✅", 7);

  return {
    ok: true,
    archivosLeidos: totalArchivosElencoLeidos,
    agregados: agregados,
    modificacionesRevision: modificacionesRevision,
    modificacionesDescripcion: modificacionesDescripcion,
    totalPlanificados: kpisActualizados.totalPlanificados,
    novedades: listaNovedadesElenco
  };
}

/**
 * Reconstruye la trazabilidad completa y línea de tiempo de un plano (o búsqueda por código/título/remito),
 * integrando entregas del Contratista, envíos a TRANSNOA (Notas de Pedido NP), devoluciones de TRANSNOA
 * (Órdenes de Servicio OS), archivos físicos en Drive y estado actual en la Hoja Master.
 *
 * @param {string} query Código del plano, parte del nombre o número de nota/remito.
 * @return {Object} Objeto detallado para TrazabilidadModal.html.
 */
function obtenerTrazabilidadCompleta(query) {
  if (!query) return { encontrado: false };

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const qRaw = String(query || "").trim();
  const qUpper = qRaw.toUpperCase();
  const qKey = qUpper.replace(/[^A-Z0-9]/g, "");

  let infoMaster = null;
  let codigoObjetivoKey = "";
  let codigoOficial = "";

  // 1. Buscar coincidencia exacta o parcial en las 4 Hojas Master
  for (let m = 0; m < NOMBRES_HOJAS_MASTER.length; m++) {
    const nomHoja = NOMBRES_HOJAS_MASTER[m];
    const proy = nomHoja.replace("Master ", "");
    const sh = ss.getSheetByName(nomHoja);
    if (!sh || sh.getLastRow() < 2) continue;

    const ultF = sh.getLastRow();
    const numCols = Math.max(13, sh.getLastColumn());
    const datos = sh.getRange(2, 1, ultF - 1, numCols).getValues();
    const richs = sh.getRange(2, 10, ultF - 1, 1).getRichTextValues();
    const richsHist = sh.getRange(2, 13, ultF - 1, 1).getRichTextValues();

    for (let i = 0; i < datos.length; i++) {
      const fila = datos[i];
      const cod = String(fila[0] || "").trim();
      const desc = String(fila[1] || "").trim();
      const remito = String(fila[9] || "").trim();
      const codK = cod.toUpperCase().replace(/[^A-Z0-9]/g, "");

      if (!codK) continue;

      const esExacto = (codK === qKey) || (cod.toUpperCase() === qUpper);
      const esParcial = codK.includes(qKey) || desc.toUpperCase().includes(qUpper) || remito.toUpperCase().includes(qUpper);

      if (esExacto || (!infoMaster && esParcial)) {
        let linkMaster = "";
        if (richs[i] && richs[i][0] && richs[i][0].getLinkUrl()) {
          linkMaster = richs[i][0].getLinkUrl();
        }

        // Extraer todos los links multi-revisión guardados en la columna 13
        const versionesPreviaLista = [];
        if (richsHist[i] && richsHist[i][0] && richsHist[i][0].getRuns()) {
          richsHist[i][0].getRuns().forEach(run => {
            const u = run.getLinkUrl();
            const t = run.getText().trim();
            if (u && t) {
              versionesPreviaLista.push({ etiqueta: t, url: u });
            }
          });
        }

        const fecUlt = normalizarFechaEstandar(fila[8]);
        const estCirc = String(fila[5] || "Abierto");
        const respAct = String(fila[7] || "Inspección");
        const slaObj = calcularSemaforoSLA(fecUlt, estCirc, respAct);

        infoMaster = {
          proyecto: proy,
          codigo: cod,
          descripcion: desc,
          disciplina: String(fila[2] || "-"),
          revisionActual: String(fila[3] || "EO"),
          cicloActual: String(fila[4] || "Ciclo 1"),
          estadoCircuito: estCirc,
          etapaActual: String(fila[6] || "En Revisión Interna"),
          responsableActual: respAct,
          fechaUltimoEvento: fecUlt,
          remitoUltimo: remito,
          urlUltimo: linkMaster,
          observaciones: String(fila[10] || ""),
          semaforoSLA: slaObj,
          versionesMultiRev: versionesPreviaLista
        };
        codigoObjetivoKey = codK;
        codigoOficial = cod;
        if (esExacto) break;
      }
    }
    if (infoMaster && codigoObjetivoKey === qKey) break;
  }

  // 2. Recolectar todos los eventos de Histórico Transmittals para ese plano (o por número de remito)
  const eventosHistorial = [];
  const hojaHist = ss.getSheetByName("Histórico Transmittals") || ss.getSheetByName("Historico Transmittals");

  if (hojaHist && hojaHist.getLastRow() >= 2) {
    const ultH = hojaHist.getLastRow();
    const datosH = hojaHist.getRange(2, 1, ultH - 1, 12).getValues();
    const richH = hojaHist.getRange(2, 7, ultH - 1, 1).getRichTextValues();

    for (let i = 0; i < datosH.length; i++) {
      const fh = datosH[i];
      const proyH = String(fh[1] || "").trim();
      const codH = String(fh[2] || "").trim();
      const descH = String(fh[3] || "").trim();
      const revH = String(fh[4] || "EO").trim();
      const fecH = normalizarFechaEstandar(fh[5]);
      const remH = String(fh[6] || "").trim();
      const emisorH = String(fh[7] || "Contratista").trim();
      const receptorH = String(fh[8] || "Inspección").trim();
      const dictamenH = String(fh[9] || "Movimiento Documental").trim();
      const cicloH = String(fh[10] || "Ciclo 1").trim();
      const estadoH = String(fh[11] || "Abierto").trim();

      const codHK = codH.toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (!codHK) continue;

      if (!codigoObjetivoKey) {
        if (codHK === qKey || codHK.includes(qKey) || remH.toUpperCase().includes(qUpper) || descH.toUpperCase().includes(qUpper)) {
          codigoObjetivoKey = codHK;
          codigoOficial = codH;
          infoMaster = {
            proyecto: proyH || determinarProyectoPorCodigo(codH, descH, ""),
            codigo: codH,
            descripcion: descH,
            disciplina: inferirDisciplina(codH, descH),
            revisionActual: revH,
            cicloActual: cicloH,
            estadoCircuito: estadoH,
            etapaActual: dictamenH,
            responsableActual: receptorH,
            fechaUltimoEvento: fecH,
            remitoUltimo: remH,
            urlUltimo: (richH[i] && richH[i][0] && richH[i][0].getLinkUrl()) ? richH[i][0].getLinkUrl() : "",
            observaciones: ""
          };
        }
      }

      if (codigoObjetivoKey && codHK === codigoObjetivoKey) {
        let urlRem = "";
        if (richH[i] && richH[i][0] && richH[i][0].getLinkUrl()) {
          urlRem = richH[i][0].getLinkUrl();
        }

        const remU = remH.toUpperCase();
        const dictU = dictamenH.toUpperCase();
        if (dictU === "DOCUMENTO TÉCNICO" || dictU === "PRESENTACIÓN") continue;
        if (/^(?:ET[-_](?:LE|VQ|BR|EB)|L[-_]EB[-_]VQ)[-_](?:OE|OC|OEM|TCYP)/i.test(remU) && !dictU.includes("SELLO APC")) {
          continue;
        }

        let hitoTitulo = "Movimiento Documental";
        const emU = emisorH.toUpperCase();
        const recU = receptorH.toUpperCase();

        if (dictU.includes("SELLO APC") || tieneSelloApcVerificado(remH, "", dictamenH)) {
          hitoTitulo = "✅ Aprobación Final: Apto para Construcción (Sello APC)";
        } else if (recU.includes("TRANSNOA") || recU.includes("TRANSENER") || recU.includes("TRANSPORTISTA") || dictU.includes("ENVIADO A TRANSNOA") || remU.startsWith("NP") || remU.includes("COMCT")) {
          hitoTitulo = "📤 UTE ➔ Envío a TRANSNOA / TRANSENER (Nota de Pedido)";
        } else if (recU.includes("COMITENTE") || recU.includes("GOBIERNO") || dictU.includes("ENVIADO A COMITENTE")) {
          hitoTitulo = "📤 UTE ➔ Envío a Comitente (Gobierno de Tucumán)";
        } else if (emU.includes("TRANSNOA") || emU.includes("TRANSENER") || dictU.includes("DEVUELTO POR TRANSPORTISTA") || remU.startsWith("OS")) {
          hitoTitulo = "📥 Devolución de TRANSNOA / TRANSENER (Orden de Servicio)";
        } else if (dictU.includes("ENVIADO A INGENIER") || recU.includes("INGENIER") || dictU.includes("OBSERVADO POR UTE")) {
          hitoTitulo = "🔄 UTE ➔ Reenvío a Ingeniería (Contratista) por Observaciones";
        } else if (dictU.includes("INGRESO") || emU.includes("CONTRATISTA") || emU.includes("INGENIER")) {
          hitoTitulo = "📄 Entrega de Ingeniería (Contratista) a UTE";
        }

        eventosHistorial.push({
          hito: hitoTitulo,
          accion: dictamenH,
          fecha: fecH || "Sin fecha",
          timestamp: parsearFechaAMilisegundos(fecH),
          emisor: emisorH,
          receptor: receptorH,
          revision: revH,
          ciclo: cicloH,
          estado: estadoH,
          remitoTexto: remH || codH,
          urlRemito: urlRem,
          observaciones: ""
        });
      }
    }
  }

  // 3. Buscar todos los archivos físicos de este código en Registro_Archivos_Drive
  const hojaLog = ss.getSheetByName("Registro_Archivos_Drive");
  if (hojaLog && hojaLog.getLastRow() >= 2 && codigoObjetivoKey) {
    const logs = hojaLog.getRange(2, 1, hojaLog.getLastRow() - 1, 4).getValues();
    logs.forEach(l => {
      const idArc = String(l[0] || "").trim();
      const nomArc = String(l[1] || "").trim();
      const rutaArc = String(l[2] || "").trim();
      const fecArc = normalizarFechaEstandar(l[3]);

      if (!idArc || !nomArc) return;
      const meta = desglosarMetadatosDocumento(nomArc, "");
      const keyArc = (meta.codigo || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

      if (keyArc === codigoObjetivoKey) {
        const urlArc = "https://drive.google.com/file/d/" + idArc + "/view";
        const yaRegistrado = eventosHistorial.some(e => e.remitoTexto === nomArc || e.urlRemito === urlArc);
        if (!yaRegistrado) {
          const esApcReal = tieneSelloApcVerificado(nomArc, "", "");
          const nomU = nomArc.toUpperCase();
          const esObsUte = nomU.includes("NO ENVIAR") || nomU.includes("OBSERVADO");

          let hitoDrive = "📁 Ingreso de Ingeniería en Drive (Recibido por UTE)";
          let accionDrive = "Pendiente de Envío a TRANSNOA / TRANSENER";
          let receptorDrive = "UTE (Inspección / Gestión)";

          if (esApcReal) {
            hitoDrive = "✅ Documento con Sello APC en Drive";
            accionDrive = "Apto para Construcción (Sello APC)";
            receptorDrive = "Archivo Obra (Carpeta APC)";
          } else if (esObsUte) {
            hitoDrive = "⚠️ Observado por UTE (No Enviar)";
            accionDrive = "Observado por UTE - Devuelto a Ingeniería";
            receptorDrive = "Ingeniería (Contratista)";
          }

          eventosHistorial.push({
            hito: hitoDrive,
            accion: accionDrive,
            fecha: fecArc || (infoMaster ? infoMaster.fechaUltimoEvento : "Sin fecha"),
            timestamp: parsearFechaAMilisegundos(fecArc),
            emisor: "Ingeniería (Contratista)",
            receptor: receptorDrive,
            revision: meta.revision || "EO",
            ciclo: (meta.revision && meta.revision !== "EO" && meta.revision !== "0") ? "Ciclo 2" : "Ciclo 1",
            estado: esApcReal ? "Cerrado" : "Abierto",
            remitoTexto: nomArc,
            urlRemito: urlArc,
            observaciones: "Ubicación en Drive: " + rutaArc
          });
        }
      }
    });
  }

  // 4. Si no estaba en Master ni Histórico pero está en Elencos_Oficiales_Referencia
  if (!infoMaster) {
    const hojaElenco = ss.getSheetByName("Elencos_Oficiales_Referencia");
    if (hojaElenco && hojaElenco.getLastRow() >= 2) {
      const datosE = hojaElenco.getRange(2, 1, hojaElenco.getLastRow() - 1, 6).getValues();
      for (let i = 0; i < datosE.length; i++) {
        const r = datosE[i];
        const codE = String(r[1] || "").trim();
        const descE = String(r[2] || "").trim();
        const codEK = codE.toUpperCase().replace(/[^A-Z0-9]/g, "");
        if (codEK === qKey || codEK.includes(qKey) || descE.toUpperCase().includes(qUpper)) {
          infoMaster = {
            proyecto: String(r[0] || determinarProyectoPorCodigo(codE, descE, "")),
            codigo: codE,
            descripcion: descE,
            disciplina: String(r[3] || inferirDisciplina(codE, descE)),
            revisionActual: String(r[4] || "EO"),
            cicloActual: "Sin iniciar",
            estadoCircuito: "Pendiente de Emisión",
            etapaActual: "No entregado en Drive",
            responsableActual: "Contratista",
            fechaUltimoEvento: "",
            remitoUltimo: "Faltante en Drive",
            urlUltimo: "",
            observaciones: "Plano planificado en Elenco Oficial pero aún no cargado en Drive."
          };
          codigoObjetivoKey = codEK;
          break;
        }
      }
    }
  }

  if (!infoMaster) {
    return { encontrado: false };
  }

  if (eventosHistorial.length === 0) {
    eventosHistorial.push({
      hito: infoMaster.estadoCircuito === "Pendiente de Emisión" ? "⏳ Planificado en Elenco Contractual" : "📥 Registro en Hoja Master",
      accion: infoMaster.etapaActual || "En Revisión Interna",
      fecha: infoMaster.fechaUltimoEvento || "Pendiente",
      timestamp: parsearFechaAMilisegundos(infoMaster.fechaUltimoEvento),
      emisor: "Contratista",
      receptor: infoMaster.responsableActual || "Inspección",
      revision: infoMaster.revisionActual || "EO",
      ciclo: infoMaster.cicloActual || "Ciclo 1",
      estado: infoMaster.estadoCircuito || "Abierto",
      remitoTexto: infoMaster.remitoUltimo || infoMaster.codigo,
      urlRemito: infoMaster.urlUltimo || "",
      observaciones: infoMaster.observaciones || ""
    });
  }

  eventosHistorial.sort((a, b) => {
    if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
    return String(a.revision).localeCompare(String(b.revision));
  });

  let diasEnCircuito = 0;
  const timestampsValidos = eventosHistorial.map(e => e.timestamp).filter(t => t > 0);
  if (timestampsValidos.length > 0) {
    const minTs = Math.min(...timestampsValidos);
    const maxTs = infoMaster.estadoCircuito === "Cerrado" ? Math.max(...timestampsValidos) : new Date().getTime();
    diasEnCircuito = Math.max(0, Math.round((maxTs - minTs) / (1000 * 60 * 60 * 24)));
  }

  const ultimoEv = eventosHistorial[eventosHistorial.length - 1];
  if (ultimoEv && eventosHistorial.length > 1) {
    if (ultimoEv.accion.toUpperCase().includes("ENVÍO A TR") || ultimoEv.receptor.toUpperCase().includes("TRANSNOA")) {
      infoMaster.etapaActual = "Enviado a TRANSNOA (" + ultimoEv.remitoTexto + ")";
      infoMaster.responsableActual = "TRANSNOA / TRANSENER";
    } else if (ultimoEv.emisor.toUpperCase().includes("TRANSNOA") || ultimoEv.accion.toUpperCase().includes("POR TR")) {
      infoMaster.etapaActual = "Devuelto por TRANSNOA (" + ultimoEv.remitoTexto + ")";
      infoMaster.responsableActual = "UTE (Reenviar a Ingeniería)";
    }
  }

  const slaCalculado = infoMaster.semaforoSLA || calcularSemaforoSLA(
    infoMaster.fechaUltimoEvento,
    infoMaster.estadoCircuito,
    infoMaster.responsableActual
  );

  return {
    encontrado: true,
    proyecto: infoMaster.proyecto,
    codigo: infoMaster.codigo,
    descripcion: infoMaster.descripcion,
    disciplina: infoMaster.disciplina,
    revisionActual: infoMaster.revisionActual,
    cicloActual: infoMaster.cicloActual,
    estadoCircuito: infoMaster.estadoCircuito,
    etapaActual: infoMaster.etapaActual,
    responsableActual: infoMaster.responsableActual,
    diasEnCircuito: diasEnCircuito,
    semaforoSLA: slaCalculado,
    versionesMultiRev: infoMaster.versionesMultiRev || [],
    historial: eventosHistorial
  };
}

/**
 * Permite registrar manualmente desde Index.html una Nota de Pedido (NP), Orden de Servicio (OS)
 * o Transmittal de entrega/devolución e impactarlo tanto en Histórico como en la Hoja Master.
 */
function registrarDesdeHTML(payload) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const hojaHist = obtenerHojaHistorico(ss);
    const fechaNorm = normalizarFechaEstandar(payload.fecha) || normalizarFechaEstandar(new Date());
    const remito = String(payload.remito || "").trim();
    const emisor = String(payload.emisor || "Contratista").trim();
    const receptor = String(payload.receptor || "Inspección").trim();
    const dictamen = String(payload.dictamen || "Ingreso Contratista").trim();
    const linkDrive = String(payload.linkDrive || "").trim();
    const planos = payload.planos || [];

    let procesados = 0;

    planos.forEach(p => {
      const meta = desglosarMetadatosDocumento(p.codigo, p.descripcion);
      const codLimpio = meta.codigo || limpiarCodigoPlanoOficial(p.codigo);
      if (!codLimpio) return;

      const revLimpia = extraerRevisionCanonico(p.revision, p.revision);
      const proy = determinarProyectoPorCodigo(codLimpio, meta.descripcion, "");
      const esCerrado = dictamen.toUpperCase().includes("APTO") || dictamen.toUpperCase().includes("APC");
      const estado = esCerrado ? "Cerrado" : "Abierto";

      const idEvento = Utilities.getUuid().slice(0, 8);
      hojaHist.appendRow([
        idEvento, proy, codLimpio, p.descripcion || meta.descripcion, revLimpia,
        fechaNorm, remito, emisor, receptor, dictamen, "Ciclo 1", estado
      ]);

      if (linkDrive) {
        const rich = SpreadsheetApp.newRichTextValue().setText(remito).setLinkUrl(linkDrive).build();
        hojaHist.getRange(hojaHist.getLastRow(), 7).setRichTextValue(rich);
      }

      actualizarOInsertarEnMaster(ss, {
        proyecto: proy,
        codigo: codLimpio,
        descripcion: p.descripcion || meta.descripcion,
        disciplina: meta.disciplina,
        revision: revLimpia,
        ciclo: "Ciclo 1",
        estado: estado,
        etapa: dictamen,
        responsable: receptor,
        fecha: fechaNorm,
        remitoTexto: remito,
        url: linkDrive,
        observaciones: p.observacion || ("Actualizado con " + remito)
      });

      procesados++;
    });

    generarReporteComparacionElencos();
    return { exito: true, procesados: procesados };
  } catch (e) {
    return { exito: false, error: e.message };
  }
}

/**
 * Calcula y escribe físicamente el Tablero de Control en la hoja 'Resumen_Control_Elencos'.
 * Corrige los porcentajes matemáticos de cobertura (% = Cargados / Elenco Total) y
 * actualiza los conteos reales de planos con Sello APC (Cerrados).
 */
function generarReporteComparacionElencos() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let hojaResumen = ss.getSheetByName("Resumen_Control_Elencos");
  if (!hojaResumen) {
    hojaResumen = ss.insertSheet("Resumen_Control_Elencos", 0);
  }

  try {
    const filtroExistente = hojaResumen.getFilter();
    if (filtroExistente) {
      filtroExistente.remove();
    }
  } catch (eFiltro) {
    Logger.log("Nota: No se pudo remover filtro: " + eFiltro.message);
  }

  const cargadosPorProyecto = {
    "ET Leales": [],
    "ET El Bracho": [],
    "ET Villa Quinteros": [],
    "LAT El Bracho - Villa Quinteros": []
  };

  const cargadosMap = new Map();
  const planosConciliadosLista = [];
  const estadisticasSLA = { vencidos: 0, enAlerta: 0, enPlazo: 0, cerrados: 0, listaVencidos: [] };

  NOMBRES_HOJAS_MASTER.forEach(nom => {
    const proyNombre = nom.replace("Master ", "");
    const sh = ss.getSheetByName(nom);
    if (!sh || sh.getLastRow() < 2) return;

    const datos = sh.getRange(2, 1, sh.getLastRow() - 1, Math.max(11, sh.getLastColumn())).getValues();
    const richs = sh.getRange(2, 10, sh.getLastRow() - 1, 1).getRichTextValues();

    datos.forEach((f, idx) => {
      const c = String(f[0] || "").trim();
      const d = String(f[1] || "").trim();
      if (!c || c.toUpperCase() === "CÓDIGO" || c.toUpperCase() === "CODIGO") return;

      const cKey = c.toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (!cKey) return;

      let linkUrl = "";
      if (richs[idx] && richs[idx][0] && richs[idx][0].getLinkUrl()) {
        linkUrl = richs[idx][0].getLinkUrl();
      }

      const fecEv = normalizarFechaEstandar(f[8]);
      const estEv = String(f[5] || "Abierto");
      const respEv = String(f[7] || "UTE");
      const slaInfo = calcularSemaforoSLA(fecEv, estEv, respEv);

      const itemPlano = {
        proyecto: proyNombre,
        codigo: c,
        descripcion: d,
        disciplina: f[2] || "-",
        rev: f[3] || "EO",
        estado: estEv,
        responsable: respEv,
        fecha: fecEv,
        slaEtiqueta: slaInfo.etiqueta,
        slaNivel: slaInfo.nivel,
        slaDias: slaInfo.dias,
        documento: f[9] || c,
        linkUrl: linkUrl
      };

      if (!cargadosMap.has(cKey)) {
        cargadosMap.set(cKey, itemPlano);
        planosConciliadosLista.push(itemPlano);
        if (cargadosPorProyecto[proyNombre]) {
          cargadosPorProyecto[proyNombre].push(itemPlano);
        }

        if (slaInfo.nivel === "VENCIDO") {
          estadisticasSLA.vencidos++;
          estadisticasSLA.listaVencidos.push(itemPlano);
        } else if (slaInfo.nivel === "ALERTA") {
          estadisticasSLA.enAlerta++;
        } else if (slaInfo.nivel === "CERRADO") {
          estadisticasSLA.cerrados++;
        } else {
          estadisticasSLA.enPlazo++;
        }
      }
    });
  });

  const totalPlanificadosMap = new Map();
  const listaElencoOficial = [];
  const planificadosPorProyCount = {
    "ET Leales": 0,
    "ET El Bracho": 0,
    "ET Villa Quinteros": 0,
    "LAT El Bracho - Villa Quinteros": 0
  };

  const hojaElenco = ss.getSheetByName("Elencos_Oficiales_Referencia");
  if (hojaElenco && hojaElenco.getLastRow() >= 2) {
    const datosE = hojaElenco.getRange(2, 1, hojaElenco.getLastRow() - 1, Math.min(6, hojaElenco.getLastColumn())).getValues();
    datosE.forEach(r => {
      let proyE = String(r[0] || "").trim();
      const codE = String(r[1] || "").trim();
      const descE = String(r[2] || "").trim();
      const discE = String(r[3] || "").trim();
      const revE = String(r[4] || "EO").trim();
      const origenE = String(r[5] || "Elenco Oficial").trim();

      if (!codE || codE.toUpperCase() === "CÓDIGO OFICIAL") return;

      if (proyE.includes("Leales")) proyE = "ET Leales";
      else if (proyE.includes("Villa")) proyE = "ET Villa Quinteros";
      else if (proyE.includes("LAT") || proyE.includes("Bracho - Villa")) proyE = "LAT El Bracho - Villa Quinteros";
      else if (proyE.includes("Bracho")) proyE = "ET El Bracho";
      else proyE = determinarProyectoPorCodigo(codE, descE, "");

      const codKey = codE.toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (codKey && !totalPlanificadosMap.has(codKey)) {
        totalPlanificadosMap.set(codKey, true);
        if (planificadosPorProyCount[proyE] !== undefined) {
          planificadosPorProyCount[proyE]++;
        }
        listaElencoOficial.push({
          proyecto: proyE,
          codigo: codE,
          descripcion: descE,
          disciplina: discE || inferirDisciplina(codE, descE),
          revision: revE,
          archivoOrigen: origenE
        });
      }
    });
  }

  const totalPlanificados = totalPlanificadosMap.size > 0 ? totalPlanificadosMap.size : 910;
  const totalCargados = planosConciliadosLista.length;
  const faltantesGlobales = Math.max(0, totalPlanificados - totalCargados);
  const pctGlobal = totalPlanificados > 0 ? Math.min(100, Math.round((totalCargados / totalPlanificados) * 100)) : 0;

  const planosFaltantesLista = [];
  listaElencoOficial.forEach(itemE => {
    const codKey = itemE.codigo.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!cargadosMap.has(codKey)) {
      planosFaltantesLista.push(itemE);
    }
  });

  planosConciliadosLista.sort((a, b) => {
    if (a.proyecto !== b.proyecto) return a.proyecto.localeCompare(b.proyecto);
    return a.codigo.localeCompare(b.codigo);
  });

  planosFaltantesLista.sort((a, b) => {
    if (a.proyecto !== b.proyecto) return a.proyecto.localeCompare(b.proyecto);
    return a.codigo.localeCompare(b.codigo);
  });

  try {
    // Totales superiores en C4 y D4
    hojaResumen.getRange("C4").setValue(totalCargados).setFontWeight("bold").setFontColor("#15803d");
    hojaResumen.getRange("D4").setValue(faltantesGlobales).setFontWeight("bold").setFontColor("#b91c1c");

    // Proyectos contractuales (Filas 7 a 10)
    const proyectosOrden = [
      { fila: 7, nombre: "ET Leales", plan: planificadosPorProyCount["ET Leales"] || 529 },
      { fila: 8, nombre: "ET El Bracho", plan: planificadosPorProyCount["ET El Bracho"] || 99 },
      { fila: 9, nombre: "ET Villa Quinteros", plan: planificadosPorProyCount["ET Villa Quinteros"] || (planificadosPorProyCount["Villa Quinteros"] || 282) },
      { fila: 10, nombre: "LAT El Bracho - Villa Quinteros", plan: planificadosPorProyCount["LAT El Bracho - Villa Quinteros"] || 173 }
    ];

    let totalCerradosApcGlobal = 0;

    proyectosOrden.forEach(p => {
      const listaProy = cargadosPorProyecto[p.nombre] || [];
      const cantCargados = listaProy.length;
      const cantFaltantes = Math.max(0, p.plan - cantCargados);

      // CÁLCULO REAL Y EXACTO DEL PORCENTAJE DE COBERTURA:
      const pctCalculado = p.plan > 0 ? (cantCargados / p.plan) : 0;

      // Conteo de planos con Sello APC formalmente cerrados en este proyecto
      const cantCerradosProy = listaProy.filter(item => {
        const estU = String(item.estado || "").toUpperCase();
        return estU.includes("CERRADO") || estU.includes("APTO") || estU.includes("APC");
      }).length;
      totalCerradosApcGlobal += cantCerradosProy;

      // Columna B: Elenco Total
      hojaResumen.getRange(p.fila, 2).setValue(p.plan).setHorizontalAlignment("center").setFontSize(10);

      // Columna C: Conciliados (Drive)
      hojaResumen.getRange(p.fila, 3).setValue(cantCargados).setHorizontalAlignment("center").setFontWeight("bold").setFontColor("#15803d").setFontSize(10);

      // Columna D: Faltantes
      hojaResumen.getRange(p.fila, 4).setValue(cantFaltantes).setHorizontalAlignment("center").setFontWeight("bold").setFontColor("#b91c1c").setFontSize(10);

      // Columna E: % Cobertura Real (Matemáticamente exacto con formato de porcentaje)
      hojaResumen.getRange(p.fila, 5)
        .setValue(pctCalculado)
        .setNumberFormat("0.0%")
        .setHorizontalAlignment("center")
        .setFontWeight("bold")
        .setFontColor("#1e293b");

      // Columna F: Aptos para Construcción (Cerrados APC)
      hojaResumen.getRange(p.fila, 6)
        .setValue(cantCerradosProy)
        .setHorizontalAlignment("center")
        .setFontWeight("bold")
        .setFontColor(cantCerradosProy > 0 ? "#15803d" : "#64748b");
    });

    // Actualizar también la tarjeta superior de Aptos para Construcción (Celda F4)
    hojaResumen.getRange("F4").setValue(totalCerradosApcGlobal).setFontWeight("bold").setFontColor("#1e40af");

    // Limpiar filas anteriores de tablas de detalle
    const maxFilaExistente = Math.max(14, hojaResumen.getLastRow());
    if (maxFilaExistente >= 12) {
      hojaResumen.getRange(12, 1, maxFilaExistente - 11, 8).clearContent().clearFormat();
    }

    let cursorFila = 12;

    // TABLA 1: PLANOS CARGADOS Y CONCILIADOS
    const rangoTituloCargados = hojaResumen.getRange(cursorFila, 1, 1, 8);
    rangoTituloCargados.setValue("");
    rangoTituloCargados.setBackground("#15803d");
    hojaResumen.getRange(cursorFila, 1).setValue(`✅ DETALLE DE PLANOS CARGADOS Y CONCILIADOS EN DRIVE (${totalCargados})`)
      .setFontColor("#ffffff")
      .setFontWeight("bold")
      .setFontSize(11);
    cursorFila++;

    const cabecerasConciliados = [
      "PROYECTO", "CÓDIGO OFICIAL", "DESCRIPCIÓN OFICIAL", "DISCIPLINA",
      "REV", "ESTADO", "DOCUMENTO EN DRIVE", "SEMÁFORO SLA (PLAZO)"
    ];
    hojaResumen.getRange(cursorFila, 1, 1, 8)
      .setValues([cabecerasConciliados])
      .setBackground("#2e5339")
      .setFontColor("#ffffff")
      .setFontWeight("bold")
      .setFontSize(9)
      .setHorizontalAlignment("center");
    cursorFila++;

    if (planosConciliadosLista.length > 0) {
      const matrizConciliados = planosConciliadosLista.map(p => [
        p.proyecto, p.codigo, p.descripcion, p.disciplina,
        p.rev, p.estado, p.documento, p.slaEtiqueta || "🟢 En plazo"
      ]);

      hojaResumen.getRange(cursorFila, 1, matrizConciliados.length, 8)
        .setValues(matrizConciliados)
        .setFontSize(9)
        .setBackground("#ffffff")
        .setFontColor("#000000");

      hojaResumen.getRange(cursorFila, 2, matrizConciliados.length, 1).setFontFamily("Consolas").setFontWeight("bold");
      hojaResumen.getRange(cursorFila, 5, matrizConciliados.length, 2).setHorizontalAlignment("center");
      hojaResumen.getRange(cursorFila, 8, matrizConciliados.length, 1).setFontWeight("bold").setHorizontalAlignment("center");

      for (let i = 0; i < planosConciliadosLista.length; i++) {
        const item = planosConciliadosLista[i];
        if (item.linkUrl) {
          const rich = SpreadsheetApp.newRichTextValue()
            .setText(item.documento)
            .setLinkUrl(item.linkUrl)
            .build();
          hojaResumen.getRange(cursorFila + i, 7).setRichTextValue(rich);
        }
      }
      cursorFila += matrizConciliados.length;
    }

    cursorFila += 2;

    // TABLA 2: PLANOS FALTANTES DE EMISIÓN
    const rangoTituloFaltantes = hojaResumen.getRange(cursorFila, 1, 1, 8);
    rangoTituloFaltantes.setValue("");
    rangoTituloFaltantes.setBackground("#b91c1c");
    hojaResumen.getRange(cursorFila, 1).setValue(`⚠️ DETALLE DE PLANOS FALTANTES DE EMISIÓN SEGÚN ELENCO (${planosFaltantesLista.length})`)
      .setFontColor("#ffffff")
      .setFontWeight("bold")
      .setFontSize(11);
    cursorFila++;

    const cabecerasFaltantes = [
      "PROYECTO", "CÓDIGO PLANIFICADO", "DESCRIPCIÓN OFICIAL", "DISCIPLINA",
      "REV CONTRACTUAL", "ESTADO EMISIÓN", "ELENCO ORIGEN", "ACCIONES REQUERIDAS"
    ];
    hojaResumen.getRange(cursorFila, 1, 1, 8)
      .setValues([cabecerasFaltantes])
      .setBackground("#7f1d1d")
      .setFontColor("#ffffff")
      .setFontWeight("bold")
      .setFontSize(9)
      .setHorizontalAlignment("center");
    cursorFila++;

    if (planosFaltantesLista.length > 0) {
      const matrizFaltantes = planosFaltantesLista.map(f => [
        f.proyecto, f.codigo, f.descripcion, f.disciplina,
        f.revision || "EO", "PENDIENTE", f.archivoOrigen || "Elenco Oficial", "Exigir Entrega a Contratista"
      ]);

      hojaResumen.getRange(cursorFila, 1, matrizFaltantes.length, 8)
        .setValues(matrizFaltantes)
        .setFontSize(9)
        .setBackground("#fff5f5")
        .setFontColor("#7f1d1d");

      hojaResumen.getRange(cursorFila, 2, matrizFaltantes.length, 1).setFontFamily("Consolas").setFontWeight("bold");
      hojaResumen.getRange(cursorFila, 5, matrizFaltantes.length, 2).setHorizontalAlignment("center");
    }

    hojaResumen.autoResizeColumns(1, 8);
  } catch (eErr) {
    Logger.log("Error al escribir en Resumen_Control_Elencos: " + eErr.message);
  }

  return {
    totalPlanificados: totalPlanificados,
    totalCargados: totalCargados,
    faltantes: faltantesGlobales,
    porcentajeGlobal: pctGlobal,
    sla: estadisticasSLA
  };
}

function obtenerDetalleConciliacionRapida(filtroProy) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const conciliados = [];
  const cargadosKeys = new Set();

  NOMBRES_HOJAS_MASTER.forEach(nom => {
    const proyNombre = nom.replace("Master ", "");
    if (filtroProy && filtroProy !== "TODOS" && !proyNombre.toLowerCase().includes(filtroProy.toLowerCase())) return;

    const sh = ss.getSheetByName(nom);
    if (!sh || sh.getLastRow() < 2) return;

    const datos = sh.getRange(2, 1, sh.getLastRow() - 1, 11).getValues();
    datos.forEach(f => {
      const c = String(f[0] || "").trim();
      const d = String(f[1] || "").trim();
      if (!c || c.toUpperCase() === "CÓDIGO" || c.toUpperCase() === "CODIGO") return;

      const key = c.toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (cargadosKeys.has(key)) return;
      cargadosKeys.add(key);

      conciliados.push({
        proyecto: proyNombre,
        codigo: c,
        descripcion: d,
        disciplina: f[2] || "-",
        revision: f[3] || "EO",
        estado: f[5] || "Abierto",
        documento: f[9] || c
      });
    });
  });

  const faltantes = [];
  const hojaElenco = ss.getSheetByName("Elencos_Oficiales_Referencia");
  if (hojaElenco && hojaElenco.getLastRow() >= 2) {
    const datosE = hojaElenco.getRange(2, 1, hojaElenco.getLastRow() - 1, Math.min(6, hojaElenco.getLastColumn())).getValues();
    datosE.forEach(r => {
      let proyE = String(r[0] || "").trim();
      const codE = String(r[1] || "").trim();
      const descE = String(r[2] || "").trim();
      const discE = String(r[3] || "").trim();
      const revE = String(r[4] || "EO").trim();
      const origenE = String(r[5] || "Elenco Oficial").trim();

      if (!codE || codE.toUpperCase() === "CÓDIGO OFICIAL") return;

      if (proyE.includes("Leales")) proyE = "ET Leales";
      else if (proyE.includes("Villa")) proyE = "ET Villa Quinteros";
      else if (proyE.includes("LAT") || proyE.includes("Bracho - Villa")) proyE = "LAT El Bracho - Villa Quinteros";
      else if (proyE.includes("Bracho")) proyE = "ET El Bracho";
      else proyE = determinarProyectoPorCodigo(codE, descE, "");

      if (filtroProy && filtroProy !== "TODOS" && !proyE.toLowerCase().includes(filtroProy.toLowerCase())) return;

      const keyE = codE.toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (keyE && !cargadosKeys.has(keyE)) {
        faltantes.push({
          proyecto: proyE,
          codigo: codE,
          descripcion: descE,
          disciplina: discE || inferirDisciplina(codE, descE),
          revision: revE,
          elenco: origenE
        });
      }
    });
  }

  return {
    conciliados: conciliados,
    faltantes: faltantes,
    kpis: generarReporteComparacionElencos()
  };
}

function instalarActivadoresAutomaticos() {
  eliminarActivadoresAutomaticos();

  ScriptApp.newTrigger("activadorAutoDrive")
    .timeBased()
    .everyMinutes(30)
    .create();

  ScriptApp.newTrigger("enviarReporteDiarioMail")
    .timeBased()
    .atHour(18)
    .everyDays(1)
    .create();

  SpreadsheetApp.getActiveSpreadsheet().toast(
    "Monitoreo activado: Escaneo en 2° plano cada 30 min y mail a las 18:00 hs.",
    "Automatización Lista ✅",
    6
  );
  return { ok: true };
}

function eliminarActivadoresAutomaticos() {
  const triggers = ScriptApp.getProjectTriggers();
  let count = 0;
  triggers.forEach(t => {
    const fn = t.getHandlerFunction();
    if (fn === "activadorAutoDrive" || fn === "enviarReporteDiarioMail") {
      ScriptApp.deleteTrigger(t);
      count++;
    }
  });

  SpreadsheetApp.getActiveSpreadsheet().toast(
    `Se pausaron ${count} activadores automáticos.`,
    "Automatización Pausada ⏸️",
    5
  );
  return { ok: true, count: count };
}

function activadorAutoDrive() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty("PAUSAR_SOLICITADO") === "TRUE") return;
  escanearNovedadesDesdeUltimaFecha();
}

/**
 * Envía el Resumen Ejecutivo Diario (18:00 hs o manual) con desglose completo por proyecto,
 * últimas novedades cargadas, últimos movimientos con TRANSNOA y enlace directo a la planilla.
 * SOLO se envía si hubo novedades en el día.
 */
function enviarReporteDiarioMail() {
  const props = PropertiesService.getScriptProperties();
  const novedadesRaw = props.getProperty("ULTIMAS_NOVEDADES_DIA") || "[]";
  let novedadesDelDia = [];
  try {
    novedadesDelDia = JSON.parse(novedadesRaw);
  } catch (e) {}

  if (novedadesDelDia.length === 0) {
    Logger.log("No hay documentos nuevos hoy. Se omite el envío del correo diario.");
    SpreadsheetApp.getActiveSpreadsheet().toast("No hay novedades nuevas para reportar hoy.", "Correo Omitido", 4);
    return { ok: true, msg: "Sin novedades, correo omitido." };
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const urlPlanilla = ss.getUrl();
  const hoyStr = normalizarFechaEstandar(new Date());

  const kpis = generarReporteComparacionElencos();
  const hojaResumen = ss.getSheetByName("Resumen_Control_Elencos");

  let filasProyectosHtml = "";
  if (hojaResumen && hojaResumen.getLastRow() >= 10) {
    const datosProy = hojaResumen.getRange(7, 1, 4, 5).getValues();
    datosProy.forEach(r => {
      const nomProy = r[0] || "-";
      const plan = Number(r[1] || 0);
      const carg = Number(r[2] || 0);
      const falt = Number(r[3] || 0);
      const pctStr = (typeof r[4] === "number") ? Math.round(r[4] * 100) + "%" : (r[4] || "0%");

      filasProyectosHtml += `
        <tr>
          <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-weight:bold;color:#1e293b;">${nomProy}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;text-align:center;color:#475569;">${plan}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;text-align:center;font-weight:bold;color:#15803d;background:#f0fdf4;">${carg}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;text-align:center;font-weight:bold;color:#b91c1c;background:#fef2f2;">${falt}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;text-align:center;font-weight:bold;color:#1e40af;">${pctStr}</td>
        </tr>
      `;
    });
  }

  let filasUltimosArchivosHtml = "";
  const hojaLog = ss.getSheetByName("Registro_Archivos_Drive");
  if (hojaLog && hojaLog.getLastRow() >= 2) {
    const ultFilaLog = hojaLog.getLastRow();
    const cantLeer = Math.min(15, ultFilaLog - 1);
    const logs = hojaLog.getRange(ultFilaLog - cantLeer + 1, 1, cantLeer, 6).getValues().reverse();

    let mostrados = 0;
    logs.forEach(l => {
      if (mostrados >= 8) return;
      const idArc = String(l[0] || "").trim();
      const nomArc = String(l[1] || "").trim();
      const rutaArc = String(l[2] || "").trim();
      const fecDrive = normalizarFechaEstandar(l[3]);

      if (!esDocumentoTecnicoCodificado(nomArc, rutaArc, nomArc, fecDrive) && !nomArc.toUpperCase().startsWith("NP") && !nomArc.toUpperCase().startsWith("OS")) {
        return;
      }

      const meta = desglosarMetadatosDocumento(nomArc, "");
      const proy = determinarProyectoPorCodigo(meta.codigo || nomArc, meta.descripcion, rutaArc);
      const url = "https://drive.google.com/file/d/" + idArc + "/view";

      filasUltimosArchivosHtml += `
        <tr>
          <td style="padding:7px 10px;border-bottom:1px solid #f1f5f9;font-size:12px;color:#334155;">${proy}</td>
          <td style="padding:7px 10px;border-bottom:1px solid #f1f5f9;font-family:monospace;font-weight:bold;font-size:12px;color:#0f172a;">${meta.codigo || nomArc}</td>
          <td style="padding:7px 10px;border-bottom:1px solid #f1f5f9;font-size:12px;color:#475569;">${meta.descripcion || nomArc}</td>
          <td style="padding:7px 10px;border-bottom:1px solid #f1f5f9;text-align:center;font-size:12px;color:#64748b;">${fecDrive || "-"}</td>
          <td style="padding:7px 10px;border-bottom:1px solid #f1f5f9;text-align:center;font-size:12px;">
            <a href="${url}" style="color:#15803d;font-weight:bold;text-decoration:none;">Ver PDF</a>
          </td>
        </tr>
      `;
      mostrados++;
    });
  }

  if (!filasUltimosArchivosHtml) {
    filasUltimosArchivosHtml = `<tr><td colspan="5" style="padding:12px;text-align:center;color:#94a3b8;font-size:12px;">Sin movimientos recientes registrados.</td></tr>`;
  }

  const slaResumen = kpis.sla || { vencidos: 0, enAlerta: 0, enPlazo: 0 };

  const cuerpo = `
    <div style="font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:780px;margin:0 auto;background:#ffffff;border:1px solid #cbd5e1;border-radius:12px;overflow:hidden;color:#1e293b;">
      
      <!-- Encabezado -->
      <div style="background:#2e5339;color:#ffffff;padding:22px 28px;">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;opacity:0.85;font-weight:bold;">obras de transporte eléctrico 132 kV</div>
        <h2 style="margin:6px 0 0 0;font-size:20px;">⚡ Resumen Diario de Control Documental (${hoyStr})</h2>
      </div>

      <div style="padding:24px 28px;">
        
        <!-- Tarjetas KPI Globales -->
        <table style="width:100%;border-collapse:separate;border-spacing:10px 0;margin:0 -10px 16px -10px;">
          <tr>
            <td style="width:25%;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;text-align:center;">
              <div style="font-size:10px;color:#64748b;font-weight:bold;text-transform:uppercase;">Total Planificados</div>
              <div style="font-size:22px;font-weight:bold;color:#0f172a;margin-top:4px;">${kpis.totalPlanificados}</div>
            </td>
            <td style="width:25%;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px;text-align:center;">
              <div style="font-size:10px;color:#15803d;font-weight:bold;text-transform:uppercase;">Cargados (Drive)</div>
              <div style="font-size:22px;font-weight:bold;color:#15803d;margin-top:4px;">${kpis.totalCargados}</div>
            </td>
            <td style="width:25%;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px;text-align:center;">
              <div style="font-size:10px;color:#b91c1c;font-weight:bold;text-transform:uppercase;">Faltantes Emisión</div>
              <div style="font-size:22px;font-weight:bold;color:#b91c1c;margin-top:4px;">${kpis.faltantes}</div>
            </td>
            <td style="width:25%;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:12px;text-align:center;">
              <div style="font-size:10px;color:#1d4ed8;font-weight:bold;text-transform:uppercase;">% Cobertura</div>
              <div style="font-size:22px;font-weight:bold;color:#1d4ed8;margin-top:4px;">${kpis.porcentajeGlobal}%</div>
            </td>
          </tr>
        </table>

        <!-- Semáforo de Plazos Contractuales SLA -->
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 16px;margin-bottom:22px;font-size:12px;">
          <b>⏱️ Semáforo de Plazos por Actor (SLA 15 días):</b>
          <span style="margin-left:10px;color:#15803d;font-weight:bold;">🟢 En plazo: ${slaResumen.enPlazo}</span> |
          <span style="margin-left:6px;color:#b45309;font-weight:bold;">🟡 Por vencer (10-15d): ${slaResumen.enAlerta}</span> |
          <span style="margin-left:6px;color:#b91c1c;font-weight:bold;">🔴 Vencidos (>15d): ${slaResumen.vencidos}</span>
        </div>

        <!-- Tabla de Estado por Obra -->
        <h3 style="font-size:14px;color:#2e5339;margin:0 0 10px 0;border-bottom:2px solid #e2e8f0;padding-bottom:6px;">
          📊 Estado de Conciliación por Proyecto
        </h3>
        <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:24px;">
          <thead>
            <tr style="background:#1e293b;color:#ffffff;font-size:11px;text-transform:uppercase;">
              <th style="padding:9px 12px;text-align:left;">Obra / Proyecto</th>
              <th style="padding:9px 12px;text-align:center;">Elenco Oficial</th>
              <th style="padding:9px 12px;text-align:center;">Cargados en Drive</th>
              <th style="padding:9px 12px;text-align:center;">Faltantes</th>
              <th style="padding:9px 12px;text-align:center;">Avance</th>
            </tr>
          </thead>
          <tbody>
            ${filasProyectosHtml}
          </tbody>
        </table>

        <!-- Últimos Documentos Técnicos Incorporados -->
        <h3 style="font-size:14px;color:#2e5339;margin:0 0 10px 0;border-bottom:2px solid #e2e8f0;padding-bottom:6px;">
          📥 Últimos Planos y Documentos Técnicos Registrados en Drive
        </h3>
        <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
          <thead>
            <tr style="background:#f1f5f9;color:#475569;font-size:11px;text-transform:uppercase;">
              <th style="padding:8px 10px;text-align:left;">Proyecto</th>
              <th style="padding:8px 10px;text-align:left;">Código Oficial</th>
              <th style="padding:8px 10px;text-align:left;">Descripción</th>
              <th style="padding:8px 10px;text-align:center;">Fecha Drive</th>
              <th style="padding:8px 10px;text-align:center;">Enlace</th>
            </tr>
          </thead>
          <tbody>
            ${filasUltimosArchivosHtml}
          </tbody>
        </table>

        <!-- Botón de Acción -->
        <div style="text-align:center;margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0;">
          <a href="${urlPlanilla}" style="display:inline-block;background:#15803d;color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:13px;">
            📈 Abrir Planilla de Control Documental y Faltantes
          </a>
          <p style="font-size:11px;color:#94a3b8;margin-top:10px;">
            Reporte generado automáticamente por el Sistema de Control Documental (132 kV).
          </p>
        </div>

      </div>
    </div>
  `;

  const destinatarios = obtenerDestinatariosValidos();
  MailApp.sendEmail({
    to: destinatarios,
    subject: `⚡ Control Documental: Resumen Diario (${hoyStr}) - ${novedadesDelDia.length} Nuevos Documentos`,
    htmlBody: cuerpo
  });

  // Limpiar las novedades del día para no repetir en el correo de mañana
  props.deleteProperty("ULTIMAS_NOVEDADES_DIA");

  SpreadsheetApp.getActiveSpreadsheet().toast("Reporte ejecutivo enviado por correo a: " + destinatarios, "Correo Enviado 📧", 5);
  return { ok: true, destinatarios: destinatarios };
}