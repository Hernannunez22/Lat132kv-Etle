/**
 * ====================================================================================================
 * ARCHIVO: AuditoriaWord.gs
 * Auditoría y cotejo triangular: Declarado en Informe Contratista ➔ Real en Drive ➔ Registrado en Master.
 * ====================================================================================================
 */

function procesarYCotejarArchivoWord(payload) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let documentosExtraidos = [];

    if (payload.textoPlano) {
      documentosExtraidos = parsearTextoPlanoWord(payload.textoPlano);
    } else if (payload.base64) {
      const mime = payload.mimeType || "";
      if (mime.includes("image")) {
        documentosExtraidos = extraerTablasDeImagenConGemini(payload.base64, mime);
      } else if (mime.includes("pdf")) {
        const resIA = procesarPdfConGemini(payload.base64, payload.nombreArchivo);
        if (resIA && resIA.exito && resIA.datos && resIA.datos.documentos) {
          documentosExtraidos = resIA.datos.documentos;
        }
      } else {
        documentosExtraidos = extraerDocumentosDeWordNativo(payload.base64, payload.nombreArchivo);
      }
    }

    if (!documentosExtraidos || documentosExtraidos.length === 0) {
      return { exito: false, error: "No se detectaron tablas ni planos codificados en el documento subido." };
    }

    const mapaDrive = new Map();
    const hojaLog = ss.getSheetByName("Registro_Archivos_Drive");
    if (hojaLog && hojaLog.getLastRow() >= 2) {
      const logs = hojaLog.getRange(2, 1, hojaLog.getLastRow() - 1, 4).getValues();
      logs.forEach(l => {
        const id = String(l[0] || "");
        const nom = String(l[1] || "");
        const fec = normalizarFechaEstandar(l[3]);
        if (nom) {
          const meta = desglosarMetadatosDocumento(nom, "");
          if (meta.codigo) {
            const key = meta.codigo.toUpperCase().replace(/[^A-Z0-9]/g, "");
            mapaDrive.set(key, {
              nombre: nom,
              url: "https://drive.google.com/file/d/" + id + "/view",
              fecha: fec,
              rev: meta.revision
            });
          }
        }
      });
    }

    const itemsAuditoria = [];
    let coinc = 0;
    let discRev = 0;
    let faltantes = 0;

    documentosExtraidos.forEach(doc => {
      const codDec = String(doc.codigo || "").trim();
      const descDec = String(doc.descripcion || codDec).trim();
      const revDec = String(doc.revision || "0").trim();

      if (!esDocumentoTecnicoEstrictoElenco(codDec, descDec, "")) return;

      const meta = desglosarMetadatosDocumento(codDec, descDec);
      const codLimpio = meta.codigo || limpiarCodigoPlanoOficial(codDec);
      const keyCod = codLimpio.toUpperCase().replace(/[^A-Z0-9]/g, "");
      const proy = determinarProyectoPorCodigo(codLimpio, descDec, "");

      let existeEnDrive = false;
      let revDrive = "-";
      let fechaDrive = "-";
      let remitoDrive = "No recibido en Drive";
      let urlDrive = "";
      let estadoCruce = "FALTANTE_DRIVE";
      let detalleCruce = "El plano está declarado en el informe pero no se encontró en Drive.";

      if (mapaDrive.has(keyCod)) {
        existeEnDrive = true;
        const dItem = mapaDrive.get(keyCod);
        revDrive = dItem.rev || "EO";
        fechaDrive = dItem.fecha;
        remitoDrive = dItem.nombre;
        urlDrive = dItem.url;

        if (revDec.toUpperCase() === revDrive.toUpperCase() || (revDec === "0" && revDrive === "EO")) {
          estadoCruce = "COINCIDENTE";
          detalleCruce = "Coincidencia plena: Plano y revisión presentes en Drive.";
          coinc++;
        } else {
          estadoCruce = "DISCREPANCIA_REV";
          detalleCruce = `Discrepancia: Informe declara Rev ${revDec}, pero en Drive está Rev ${revDrive}.`;
          discRev++;
        }
      } else {
        faltantes++;
      }

      itemsAuditoria.push({
        proyecto: proy,
        codigoDeclarado: codLimpio,
        descripcionDeclarada: meta.descripcion || descDec,
        revDeclarada: revDec,
        existeEnDrive: existeEnDrive,
        revEnDrive: revDrive,
        fechaEnDrive: fechaDrive,
        remitoDrive: remitoDrive,
        urlDrive: urlDrive,
        estadoCruce: estadoCruce,
        detalleCruce: detalleCruce
      });
    });

    const total = itemsAuditoria.length;
    const pct = total > 0 ? Math.round((coinc / total) * 100) : 0;

    return {
      exito: true,
      items: itemsAuditoria,
      kpis: {
        totalDeclarados: total,
        coincidentes: coinc,
        discrepanciasRev: discRev,
        faltantesEnDrive: faltantes,
        pctRecepcion: pct
      }
    };
  } catch (err) {
    return { exito: false, error: err.message };
  }
}

function parsearTextoPlanoWord(txt) {
  const lineas = txt.split("\n");
  const documentos = [];

  lineas.forEach(l => {
    const lTrim = l.trim();
    if (!lTrim) return;

    const meta = desglosarMetadatosDocumento(lTrim, "");
    if (meta.codigo && esDocumentoTecnicoEstrictoElenco(meta.codigo, meta.descripcion, "")) {
      documentos.push({
        codigo: meta.codigo,
        descripcion: meta.descripcion,
        revision: meta.revision
      });
    }
  });

  return documentos;
}

function extraerDocumentosDeWordNativo(base64Data, nombreArchivo) {
  try {
    const blob = Utilities.newBlob(Utilities.base64Decode(base64Data), "application/vnd.openxmlformats-officedocument.wordprocessingml.document", nombreArchivo);
    const pdfBlob = blob.getAs(MimeType.PDF);
    const base64Pdf = Utilities.base64Encode(pdfBlob.getBytes());
    const resIA = procesarPdfConGemini(base64Pdf, nombreArchivo);
    if (resIA && resIA.exito && resIA.datos && resIA.datos.documentos) {
      return resIA.datos.documentos;
    }
  } catch (e) {
    Logger.log("Conversión docx a PDF no soportada: " + e.message);
  }
  return [];
}

function exportarAuditoriaWordASheet(datosAuditoria) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const fechaNom = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd_HHmm");
  const nombreHoja = `Auditoría_Word_${fechaNom}`;

  let hoja = ss.insertSheet(nombreHoja);

  const cabeceras = [
    "ESTADO RECEPCIÓN",
    "PROYECTO",
    "CÓDIGO DECLARADO",
    "DESCRIPCIÓN DECLARADA",
    "REV DECLARADA",
    "REV EN DRIVE",
    "FECHA DRIVE",
    "DOCUMENTO EN DRIVE",
    "DIAGNÓSTICO AUDITORÍA"
  ];

  hoja.getRange(1, 1, 1, cabeceras.length)
    .setValues([cabeceras])
    .setBackground("#0c4a6e")
    .setFontColor("#ffffff")
    .setFontWeight("bold")
    .setFontSize(10)
    .setHorizontalAlignment("center");

  hoja.setFrozenRows(1);

  const items = datosAuditoria.items || [];
  if (items.length > 0) {
    const matriz = items.map(it => [
      it.estadoCruce,
      it.proyecto,
      it.codigoDeclarado,
      it.descripcionDeclarada,
      it.revDeclarada,
      it.revEnDrive,
      it.fechaEnDrive,
      it.remitoDrive,
      it.detalleCruce
    ]);

    hoja.getRange(2, 1, matriz.length, cabeceras.length).setValues(matriz).setFontSize(9);

    for (let r = 0; r < items.length; r++) {
      const it = items[r];
      if (it.existeEnDrive && it.urlDrive) {
        const rich = SpreadsheetApp.newRichTextValue()
          .setText(it.remitoDrive)
          .setLinkUrl(it.urlDrive)
          .build();
        hoja.getRange(r + 2, 8).setRichTextValue(rich);
      }
    }
  }

  hoja.autoResizeColumns(1, cabeceras.length);
  return { exito: true, nombreHoja: nombreHoja };
}