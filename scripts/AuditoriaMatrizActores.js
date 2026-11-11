/**
 * ====================================================================================================
 * ARCHIVO: AuditoriaMatrizActores.gs
 * Auditoría profunda multi-nivel de TODOS los Libros de Comunicaciones de la obra
 * (Comitente / D.E. Tucumán <-> Inspección <-> UTE <-> Contratistas / Proyectistas <-> TRANSNOA / TRANSENER).
 * Recorrido recursivo ilimitado de subcarpetas, extracción multimodal de notas de envío y órdenes,
 * e impacto directo en la trazabilidad, etapas contractuales y semáforos SLA de las Hojas Master.
 * ====================================================================================================
 */

function obtenerMatrizComunicacionesActores(filtroActor, filtroObra) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const resultados = [];

  const mapaHistoricoPorCodigo = new Map();
  const hojaHist = ss.getSheetByName("Histórico Transmittals") || ss.getSheetByName("Historico Transmittals");

  if (hojaHist && hojaHist.getLastRow() >= 2) {
    const ultH = hojaHist.getLastRow();
    const filasH = hojaHist.getRange(2, 1, ultH - 1, 12).getValues();
    const richH = hojaHist.getRange(2, 7, ultH - 1, 1).getRichTextValues();

    filasH.forEach((fh, idx) => {
      const codH = String(fh[2] || "").trim();
      const descH = String(fh[3] || "").trim();
      const remitoTexto = String(fh[6] || "").trim();

      if (!esDocumentoTecnicoEstrictoElenco(codH, descH, remitoTexto)) return;

      const codKey = codH.toUpperCase().replace(/[^A-Z0-9]/g, "");
      let urlRem = "";
      if (richH[idx] && richH[idx][0] && richH[idx][0].getLinkUrl()) {
        urlRem = richH[idx][0].getLinkUrl();
      }

      const evento = {
        proyecto: fh[1],
        codigo: codH,
        descripcion: descH,
        revision: fh[4],
        fecha: normalizarFechaEstandar(fh[5]),
        remitoTexto: remitoTexto,
        urlRemito: urlRem,
        emisor: String(fh[7] || "").toUpperCase(),
        receptor: String(fh[8] || "").toUpperCase(),
        dictamen: String(fh[9] || ""),
        ciclo: fh[10],
        estado: fh[11]
      };

      if (!mapaHistoricoPorCodigo.has(codKey)) {
        mapaHistoricoPorCodigo.set(codKey, []);
      }
      mapaHistoricoPorCodigo.get(codKey).push(evento);
    });
  }

  NOMBRES_HOJAS_MASTER.forEach(nomHoja => {
    const nombreObra = nomHoja.replace("Master ", "");
    if (filtroObra && filtroObra !== "TODOS" && !nombreObra.toLowerCase().includes(filtroObra.toLowerCase())) {
      return;
    }

    const hoja = ss.getSheetByName(nomHoja);
    if (!hoja || hoja.getLastRow() < 2) return;

    const ultF = hoja.getLastRow();
    const datos = hoja.getRange(2, 1, ultF - 1, 11).getValues();
    const richs = hoja.getRange(2, 10, ultF - 1, 1).getRichTextValues();

    for (let i = 0; i < datos.length; i++) {
      const cod = String(datos[i][0] || "").trim();
      const desc = String(datos[i][1] || "").trim();
      const remitoTextoMaster = String(datos[i][9] || "").trim();

      if (!esDocumentoTecnicoEstrictoElenco(cod, desc, remitoTextoMaster)) continue;

      const clave = cod.toUpperCase().replace(/[^A-Z0-9]/g, "");
      const revActual = String(datos[i][3] || "EO").trim();
      const eventosPlano = mapaHistoricoPorCodigo.get(clave) || [];

      let enviadoATransnoa = false;
      let envioNota = "";
      let fechaEnvio = "";
      let urlEnvioNota = "";

      let devueltoPorTransnoa = false;
      let devolucionOrden = "";
      let fechaDevolucion = "";
      let urlDevolucionOrden = "";
      let dictamenDevolucion = "";

      let reingresadoPorContratista = false;
      let remitoReingreso = "";
      let revisionReingreso = "";

      eventosPlano.forEach(ev => {
        const dictUpper = ev.dictamen.toUpperCase();
        if (dictUpper.includes("PRIORIDAD") || dictUpper.includes("SIN DICTAMEN")) return;

        if (
          ev.receptor.includes("TRANSNOA") ||
          ev.receptor.includes("TRANSENER") ||
          ev.receptor.includes("TRANSPORTISTA") ||
          dictUpper.includes("ENVÍO A TR") ||
          dictUpper.includes("ENVIO A TR")
        ) {
          enviadoATransnoa = true;
          envioNota = ev.remitoTexto;
          fechaEnvio = ev.fecha;
          urlEnvioNota = ev.urlRemito;
        }

        if (
          ev.emisor.includes("TRANSNOA") ||
          dictUpper.includes("OBSERVADO POR TR") ||
          (dictUpper.includes("APROBADO") && ev.emisor.includes("TR"))
        ) {
          devueltoPorTransnoa = true;
          devolucionOrden = ev.remitoTexto;
          fechaDevolucion = ev.fecha;
          urlDevolucionOrden = ev.urlRemito;
          dictamenDevolucion = ev.dictamen;
        }

        const matchCiclo = String(ev.ciclo || "").match(/\d+/);
        if (matchCiclo && parseInt(matchCiclo[0], 10) >= 2) {
          reingresadoPorContratista = true;
          remitoReingreso = ev.remitoTexto;
          revisionReingreso = ev.revision;
        }
      });

      resultados.push({
        proyecto: nombreObra,
        codigo: cod,
        descripcion: desc,
        revision: revActual,
        enviadoATransnoa: enviadoATransnoa,
        envioNota: envioNota,
        fechaEnvio: fechaEnvio,
        urlEnvioNota: urlEnvioNota,
        devueltoPorTransnoa: devueltoPorTransnoa,
        devolucionOrden: devolucionOrden,
        fechaDevolucion: fechaDevolucion,
        urlDevolucionOrden: urlDevolucionOrden,
        dictamenDevolucion: dictamenDevolucion,
        reingresadoPorContratista: reingresadoPorContratista,
        remitoReingreso: remitoReingreso,
        revisionReingreso: revisionReingreso
      });
    }
  });

  return { items: resultados };
}

function exportarMatrizActoresASheet(payload) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const actor = payload.actor || "TODOS";
  const items = payload.items || [];

  const hoy = new Date();
  const fechaNom = Utilities.formatDate(hoy, Session.getScriptTimeZone(), "yyyy-MM-dd_HHmm");
  const nombreHoja = `Informe_Comunicaciones_${fechaNom}`;

  let hoja = ss.insertSheet(nombreHoja);

  const cabeceras = [
    "OBRA / PROYECTO",
    "CÓDIGO DEL PLANO",
    "DESCRIPCIÓN",
    "REV ACTUAL",
    "ENVÍO COMUNICACIÓN",
    "FECHA ENVÍO",
    "DEVOLUCIÓN / DICTAMEN",
    "FECHA DEVOLUCIÓN",
    "ESTADO RESPUESTA",
    "REINGRESO / NUEVO CICLO"
  ];

  hoja.getRange(1, 1, 1, cabeceras.length)
    .setValues([cabeceras])
    .setBackground("#1e1b4b")
    .setFontColor("#ffffff")
    .setFontWeight("bold")
    .setFontSize(10)
    .setHorizontalAlignment("center");

  hoja.setFrozenRows(1);

  if (items.length > 0) {
    const matriz = items.map(it => [
      it.proyecto,
      it.codigo,
      it.descripcion,
      it.revision,
      it.enviadoATransnoa ? it.envioNota : "Sin registro de envío",
      it.fechaEnvio || "-",
      it.devueltoPorTransnoa ? it.devolucionOrden : "Sin devolución formal",
      it.fechaDevolucion || "-",
      it.dictamenDevolucion || "-",
      it.reingresadoPorContratista ? `Rev ${it.revisionReingreso || it.revision}` : "-"
    ]);

    hoja.getRange(2, 1, matriz.length, cabeceras.length)
      .setValues(matriz)
      .setFontSize(9);

    for (let r = 0; r < items.length; r++) {
      const it = items[r];
      const numFila = r + 2;

      if (it.enviadoATransnoa && it.urlEnvioNota) {
        const rich = SpreadsheetApp.newRichTextValue()
          .setText(it.envioNota)
          .setLinkUrl(it.urlEnvioNota)
          .build();
        hoja.getRange(numFila, 5).setRichTextValue(rich);
      }

      if (it.devueltoPorTransnoa && it.urlDevolucionOrden) {
        const rich = SpreadsheetApp.newRichTextValue()
          .setText(it.devolucionOrden)
          .setLinkUrl(it.urlDevolucionOrden)
          .build();
        hoja.getRange(numFila, 7).setRichTextValue(rich);
      }
    }
  }

  hoja.autoResizeColumns(1, cabeceras.length);
  return { exito: true, nombreHoja: nombreHoja };
}

/**
 * ESCANEO PROFUNDO MULTI-NIVEL DE TODOS LOS LIBROS DE COMUNICACIONES
 * Recorre recursivamente todas las ramas de subcarpetas en Google Drive que contengan:
 * - Libros de Comunicaciones UTE <-> TRANSNOA / TRANSENER (ej: COMCT2-TU1-..., NP, OS)
 * - Libros de Órdenes de Servicio y Notas de Pedido Inspección / Comitente (D.E. Tucumán)
 * - Remitos, Minutas y Transmittals de Contratistas / Proyectistas
 *
 * Lee el cuerpo de las notas con Gemini Multimodal, extrae tablas y listados de planos
 * detallados en el texto y actualiza automáticamente el ciclo y responsable en las Hojas Master.
 * Cuenta con priorización de notas recientes y control de tiempo (< 4.2 min) anti-timeout.
 */
function escanearTodosLosLibrosProfundo() {
  const tiempoInicioMs = new Date().getTime();
  const TIEMPO_MAX_MS = 250 * 1000; // 4 minutos y 10 segundos de margen seguro

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.toast("Localizando ramas de Libros y Notas de Pedido en Drive...", "Auditoría Profunda 📚", 5);

  let carpetaRaiz;
  try {
    carpetaRaiz = DriveApp.getFolderById(ID_CARPETA_RAIZ);
  } catch (e) {
    return { ok: false, error: "No se pudo acceder a la carpeta raíz de Drive: " + e.message };
  }

  let hojaLog = ss.getSheetByName("Registro_Archivos_Drive");
  if (!hojaLog) {
    hojaLog = ss.insertSheet("Registro_Archivos_Drive");
    hojaLog.appendRow(CABECERAS_REGISTRO_DRIVE);
  }

  // 1. Identificar qué notas ya tienen planos impactados en Histórico Transmittals
  // para no gastar tiempo re-procesando notas viejas y priorizar las nuevas o pendientes
  const remitosYaEnHistorico = new Set();
  const urlsYaEnHistorico = new Set();
  const hojaHist = ss.getSheetByName("Histórico Transmittals") || ss.getSheetByName("Historico Transmittals");
  if (hojaHist && hojaHist.getLastRow() >= 2) {
    const ultH = hojaHist.getLastRow();
    const valsH = hojaHist.getRange(2, 7, ultH - 1, 1).getValues();
    const richsH = hojaHist.getRange(2, 7, ultH - 1, 1).getRichTextValues();
    for (let i = 0; i < valsH.length; i++) {
      const txtRem = String(valsH[i][0] || "").trim().toUpperCase();
      if (txtRem) {
        remitosYaEnHistorico.add(txtRem);
        const matchCodNota = txtRem.match(/(COMCT[0-9A-Z\-_]+|TU1[0-9A-Z\-_]+|(?:NP|OS|NI|NE)[\s\-_]*\d+)/i);
        if (matchCodNota) remitosYaEnHistorico.add(matchCodNota[1].toUpperCase());
      }
      if (richsH[i] && richsH[i][0] && richsH[i][0].getLinkUrl()) {
        const idUrl = extraerIdDriveDesdeUrl(richsH[i][0].getLinkUrl());
        if (idUrl) urlsYaEnHistorico.add(idUrl);
      }
    }
  }

  const idsLogMap = new Map();
  if (hojaLog.getLastRow() >= 2) {
    const datosLog = hojaLog.getRange(2, 1, hojaLog.getLastRow() - 1, 5).getValues();
    datosLog.forEach((r, idx) => {
      const idStr = String(r[0] || "").trim();
      const estStr = String(r[4] || "").trim();
      if (idStr) idsLogMap.set(idStr, { fila: idx + 2, estado: estStr });
    });
  }

  // 2. Recolectar sin duplicados todos los PDFs candidatos dentro de cualquier rama de Libros
  const mapaArchivosCandidatos = new Map();
  const carpetasVisitadas = new Set();

  function recolectarPdfsLibrosRec(folder, rutaAcumulada, dentroDeRamaLibros) {
    if (new Date().getTime() - tiempoInicioMs > TIEMPO_MAX_MS) return;

    const idFolder = folder.getId();
    if (carpetasVisitadas.has(idFolder)) return;
    carpetasVisitadas.add(idFolder);

    const nomF = folder.getName();
    const nomU = nomF.toUpperCase();

    // Ignorar carpeta de elencos base
    if (normalizarTexto(nomF).includes("elenco de documentos de ingenieria")) return;

    const esRamaLibros = dentroDeRamaLibros || (
      nomU.includes("05 - LIBRO") ||
      nomU.includes("05-LIBRO") ||
      nomU.includes("LIBRO") ||
      nomU.includes("COMUNICACI") ||
      nomU.includes("NOTAS DE PEDIDO") ||
      nomU.includes("NOTA DE PEDIDO") ||
      nomU.includes("ORDENES DE SERVICIO") ||
      nomU.includes("ORDEN DE SERVICIO") ||
      nomU.includes("UT - TRANSNOA") ||
      nomU.includes("UTE - TRANSNOA") ||
      nomU.includes("TRANSNOA") ||
      nomU.includes("TRANSENER") ||
      nomU.includes("COMITENTE") ||
      nomU.includes("TRANSMITTAL") ||
      nomU.includes("REMITO")
    );

    if (esRamaLibros) {
      const archivos = folder.getFiles();
      while (archivos.hasNext()) {
        if (new Date().getTime() - tiempoInicioMs > TIEMPO_MAX_MS) break;
        const arc = archivos.next();
        const idArc = arc.getId();
        if (mapaArchivosCandidatos.has(idArc)) continue;

        const nomArc = arc.getName();
        if (nomArc.startsWith("._") || nomArc.startsWith("~$")) continue;
        if (arc.getMimeType() !== MimeType.PDF) continue;

        const nomArcU = nomArc.toUpperCase();
        const rutaU = rutaAcumulada.toUpperCase();

        // Si el archivo está dentro de Libros, verificamos si es la Nota/Orden/Transmittal
        // o si es un plano suelto que está adjunto dentro de la subcarpeta de una Nota COMCT/NP/OS
        const matchNotaEnRuta = rutaAcumulada.match(/(COMCT2[-_A-Z0-9]+|TU1[-_A-Z0-9]+|(?:NP|OS|NI|NE)[-_ ]?\d+)/i);
        const esPlanoIndividual = esDocumentoTecnicoEstrictoElenco(nomArc, "", nomArc, "");

        const esNotaComunicacion = (
          nomArcU.includes("COMCT") ||
          nomArcU.includes("TU1") ||
          nomArcU.startsWith("NP") ||
          nomArcU.startsWith("OS") ||
          nomArcU.startsWith("NI") ||
          nomArcU.startsWith("NE") ||
          nomArcU.includes("NOTA") ||
          nomArcU.includes("REMITO") ||
          nomArcU.includes("TRANSMITTAL") ||
          nomArcU.includes("ORDEN") ||
          nomArcU.includes("PEDIDO") ||
          nomArcU.includes("ENTREGA") ||
          nomArcU.includes("ENVIO") ||
          nomArcU.includes("ENVÍO") ||
          nomArcU.includes("DEVOLUCION") ||
          nomArcU.includes("DEVOLUCIÓN") ||
          (!esPlanoIndividual && (rutaU.includes("NOTAS DE PEDIDO") || rutaU.includes("ORDENES") || rutaU.includes("LIBRO")))
        );

        if (esNotaComunicacion || (esPlanoIndividual && matchNotaEnRuta)) {
          mapaArchivosCandidatos.set(idArc, {
            archivo: arc,
            id: idArc,
            nombre: nomArc,
            ruta: rutaAcumulada,
            fechaMod: arc.getLastUpdated(),
            tsMod: arc.getLastUpdated().getTime(),
            esPlanoEnCarpetaNota: esPlanoIndividual && Boolean(matchNotaEnRuta),
            notaPadreCodigo: matchNotaEnRuta ? matchNotaEnRuta[1].toUpperCase() : ""
          });
        }
      }
    }

    const subcarpetas = folder.getFolders();
    while (subcarpetas.hasNext()) {
      if (new Date().getTime() - tiempoInicioMs > TIEMPO_MAX_MS) break;
      const sub = subcarpetas.next();
      recolectarPdfsLibrosRec(sub, rutaAcumulada + " / " + sub.getName(), esRamaLibros);
    }
  }

  recolectarPdfsLibrosRec(carpetaRaiz, carpetaRaiz.getName(), false);

  // 3. Ordenar candidatos:
  // Primero las notas que AÚN NO están en Histórico Transmittals, y de las más recientes (ayer/hoy) a las más antiguas
  const listaCandidatos = Array.from(mapaArchivosCandidatos.values());
  listaCandidatos.sort((a, b) => {
    const aYaEnHist = urlsYaEnHistorico.has(a.id);
    const bYaEnHist = urlsYaEnHistorico.has(b.id);
    if (aYaEnHist !== bYaEnHist) return aYaEnHist ? 1 : -1;
    return b.tsMod - a.tsMod;
  });

  ss.toast(
    `Detectados ${listaCandidatos.length} documentos en Libros. Procesando primero los más recientes...`,
    "Auditoría Profunda 📚",
    5
  );

  let notasProcesadasTotal = 0;
  let planosImpactadosTotal = 0;
  const hoyStr = normalizarFechaEstandar(new Date());

  for (let i = 0; i < listaCandidatos.length; i++) {
    if (new Date().getTime() - tiempoInicioMs > TIEMPO_MAX_MS) {
      ss.toast("Margen seguro de tiempo alcanzado. Consolidando resultados en Hojas Master...", "Aviso Tiempo ⏱️", 5);
      break;
    }

    const item = listaCandidatos[i];

    // Si este archivo exacto ya fue volcado con éxito al Histórico antes, no gastar cuota de IA de nuevo
    if (urlsYaEnHistorico.has(item.id)) {
      continue;
    }

    // CASO ESPECIAL A: Si en la subcarpeta de la Nota (ej: carpeta "COMCT2-TU1-00016, Entrega...")
    // están guardados los PDFs de los planos adjuntos, vincular automáticamente ese plano con la Nota de su carpeta
    if (item.esPlanoEnCarpetaNota && item.notaPadreCodigo) {
      const metaPlano = desglosarMetadatosDocumento(item.nombre, "");
      if (metaPlano.codigo) {
        const datosSinteticos = {
          tipo_comunicacion: "TRANSMITTAL_ENTREGA",
          tiene_sello_apc: tieneSelloApcVerificado(item.nombre, "", ""),
          numero_remito: item.notaPadreCodigo,
          fecha: normalizarFechaEstandar(item.fechaMod),
          emisor: "UTE",
          receptor: "TRANSNOA / TRANSENER",
          dictamen: "Enviado a TRANSNOA / TRANSENER",
          documentos: [{
            codigo: metaPlano.codigo,
            descripcion: metaPlano.descripcion,
            revision: metaPlano.revision || "EO",
            observacion: "Plano adjunto en carpeta de nota " + item.notaPadreCodigo
          }]
        };
        const cant = impactarArchivoEnSheets(ss, datosSinteticos, item.fechaMod, item.archivo.getUrl(), item.notaPadreCodigo, item.ruta);
        if (cant > 0) {
          planosImpactadosTotal += cant;
          urlsYaEnHistorico.add(item.id);
        }
      }
      continue;
    }

    // CASO B: Es el PDF de la Nota de Pedido (COMCT2-TU1-..., NP, OS, Remito)
    if (item.archivo.getSize() > 25 * 1024 * 1024) continue;

    try {
      ss.toast(`Analizando nota (${notasProcesadasTotal + 1}): ${item.nombre}`, "IA Gemini 📄", 3);
      const b64 = Utilities.base64Encode(item.archivo.getBlob().getBytes());
      const resIA = procesarPdfConGemini(b64, item.nombre, item.ruta);

      if (resIA && resIA.exito && resIA.datos) {
        const datos = resIA.datos;
        const cantImpactados = impactarArchivoEnSheets(
          ss,
          datos,
          item.fechaMod,
          item.archivo.getUrl(),
          item.nombre,
          item.ruta
        );

        const estadoLog = `LIBRO AUDITADO (${cantImpactados} planos vinculados)`;
        if (idsLogMap.has(item.id)) {
          const infoFila = idsLogMap.get(item.id);
          hojaLog.getRange(infoFila.fila, 5, 1, 2).setValues([[estadoLog, hoyStr]]);
        } else {
          hojaLog.appendRow([
            item.id,
            item.nombre,
            item.ruta,
            normalizarFechaEstandar(item.fechaMod),
            estadoLog,
            hoyStr
          ]);
          idsLogMap.set(item.id, { fila: hojaLog.getLastRow(), estado: estadoLog });
        }

        if (cantImpactados > 0) {
          urlsYaEnHistorico.add(item.id);
        }

        notasProcesadasTotal++;
        planosImpactadosTotal += cantImpactados;
      }
    } catch (errNota) {
      Logger.log(`Aviso procesando nota ${item.nombre}: ${errNota.message}`);
    }
  }

  // 4. Sincronizar y normalizar las 4 Hojas Master con todos los eventos del Histórico
  ss.toast("Consolidando estados, notas COMCT/NP/OS y semáforos SLA en las 4 Hojas Master...", "Consolidando ⚙️", 5);
  limpiarYNormalizarHojasMasterCompleto();
  generarReporteComparacionElencos();

  ss.toast(
    `✅ Auditoría finalizada: ${notasProcesadasTotal} notas leídas y ${planosImpactadosTotal} planos actualizados con su estado de envío/devolución.`,
    "Auditoría Completa 📚",
    8
  );

  return {
    ok: true,
    notasProcesadas: notasProcesadasTotal,
    planosImpactados: planosImpactadosTotal
  };
}

function escanearCarpetaLibrosComunicaciones() {
  return escanearTodosLosLibrosProfundo();
}