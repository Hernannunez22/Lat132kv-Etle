/**
 * ====================================================================================================
 * ARCHIVO: EscaneoDrive.gs
 * Motores de escaneo de Google Drive: inserción inteligente sin duplicar (Upsert), enriquecimiento
 * con Elenco Oficial e Histórico de Transmittals, y escaneos profundos recursivos por proyecto.
 * ====================================================================================================
 */

/**
 * Inserta o actualiza (Upsert) un plano en su Hoja Master correspondiente sin duplicar filas.
 * Si el código ya existe en la hoja, actualiza su revisión, fecha, link y estado en la misma fila.
 */
function actualizarOInsertarEnMaster(ss, datosPlano) {
  const nombreHoja = "Master " + datosPlano.proyecto;
  const hojaMaster = obtenerOCrearHojaMaster(ss, nombreHoja);
  const claveNueva = limpiarCodigoPlanoOficial(datosPlano.codigo).toUpperCase().replace(/[^A-Z0-9]/g, "");

  // Consultar Elenco Oficial para obtener siempre la descripción y disciplina contractual limpia
  const hojaElenco = ss.getSheetByName("Elencos_Oficiales_Referencia");
  if (hojaElenco && hojaElenco.getLastRow() >= 2) {
    const datosE = hojaElenco.getRange(2, 1, hojaElenco.getLastRow() - 1, 4).getValues();
    for (let i = 0; i < datosE.length; i++) {
      const codE = limpiarCodigoPlanoOficial(datosE[i][1]).toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (codE === claveNueva) {
        if (datosE[i][2] && String(datosE[i][2]).trim().length > 4) {
          datosPlano.descripcion = String(datosE[i][2]).trim();
        }
        if (datosE[i][3] && String(datosE[i][3]).trim()) {
          datosPlano.disciplina = String(datosE[i][3]).trim();
        }
        break;
      }
    }
  }

  const ultFila = hojaMaster.getLastRow();
  let filaExistente = -1;
  let revPrevia = "";
  let fechaPrevia = "";
  let richPrevioCol10 = null;
  let richPrevioCol13 = null;

  if (ultFila >= 2) {
    const codigosExistentes = hojaMaster.getRange(2, 1, ultFila - 1, 13).getValues();
    for (let i = 0; i < codigosExistentes.length; i++) {
      const cEx = limpiarCodigoPlanoOficial(codigosExistentes[i][0]).toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (cEx === claveNueva) {
        filaExistente = i + 2;
        revPrevia = String(codigosExistentes[i][3] || "EO").trim();
        fechaPrevia = normalizarFechaEstandar(codigosExistentes[i][8]);
        richPrevioCol10 = hojaMaster.getRange(filaExistente, 10).getRichTextValue();
        richPrevioCol13 = hojaMaster.getRange(filaExistente, 13).getRichTextValue();
        break;
      }
    }
  }

  const slaInfo = calcularSemaforoSLA(
    datosPlano.fecha || "",
    datosPlano.estado || "Abierto",
    datosPlano.responsable || "UTE (Inspección)"
  );

  // Recolectar enlaces previos de la columna 13 y de la columna 10 para no perder ninguna revisión anterior
  let versionesAcumuladas = [];
  if (richPrevioCol13 && richPrevioCol13.getRuns()) {
    richPrevioCol13.getRuns().forEach(run => {
      const u = run.getLinkUrl();
      const t = run.getText().trim();
      if (u && t) {
        const mRev = t.match(/Rev\s+([0-9A-Z]+)/i);
        const mFec = t.match(/\(([^)]+)\)/);
        versionesAcumuladas.push({
          rev: mRev ? mRev[1] : "EO",
          fecha: mFec ? mFec[1] : "",
          url: u
        });
      }
    });
  }
  if (richPrevioCol10 && richPrevioCol10.getLinkUrl()) {
    const urlAnt = richPrevioCol10.getLinkUrl();
    versionesAcumuladas.push({
      rev: revPrevia || "EO",
      fecha: fechaPrevia || "",
      url: urlAnt
    });
  }
  if (datosPlano.url) {
    versionesAcumuladas.push({
      rev: datosPlano.revision || "EO",
      fecha: datosPlano.fecha || "",
      url: datosPlano.url
    });
  }

  // Desduplicar por Revisión Canónica y por ID de Drive
  versionesAcumuladas = consolidarVersionesUnicasPorRevision(versionesAcumuladas);

  const textoHistorialPlano = versionesAcumuladas
    .map(v => `Rev ${v.rev}${v.fecha ? " (" + v.fecha + ")" : ""}`)
    .join(" | ");

  const codigoOficialLimpio = limpiarCodigoPlanoOficial(datosPlano.codigo);

  const valoresFila = [
    codigoOficialLimpio,
    datosPlano.descripcion,
    datosPlano.disciplina,
    datosPlano.revision || "EO",
    datosPlano.ciclo || "Ciclo 1",
    datosPlano.estado || "Abierto",
    datosPlano.etapa || "Pendiente de Envío a TRANSNOA / TRANSENER",
    datosPlano.responsable || "UTE (Inspección)",
    datosPlano.fecha || "",
    datosPlano.remitoTexto || codigoOficialLimpio,
    datosPlano.observaciones || "Ingreso directo desde Drive",
    slaInfo.etiqueta,
    textoHistorialPlano
  ];

  let filaObjetivo = filaExistente;
  if (filaExistente !== -1) {
    hojaMaster.getRange(filaExistente, 1, 1, 13).setValues([valoresFila]);
  } else {
    asegurarEncabezadoHoja(hojaMaster);
    hojaMaster.appendRow(valoresFila);
    filaObjetivo = hojaMaster.getLastRow();
  }

  hojaMaster.getRange(filaObjetivo, 1, 1, 13).setBackground("#ffffff").setFontColor("#000000").setFontSize(10);
  hojaMaster.getRange(filaObjetivo, 4).setHorizontalAlignment("center").setFontWeight("bold");
  hojaMaster.getRange(filaObjetivo, 9).setNumberFormat("@");
  hojaMaster.getRange(filaObjetivo, 12)
    .setBackground(slaInfo.colorFondo)
    .setFontColor(slaInfo.colorTexto)
    .setFontWeight("bold")
    .setHorizontalAlignment("center");

  if (datosPlano.url) {
    const rich = SpreadsheetApp.newRichTextValue()
      .setText(datosPlano.remitoTexto || codigoOficialLimpio)
      .setLinkUrl(datosPlano.url)
      .build();
    hojaMaster.getRange(filaObjetivo, 10).setRichTextValue(rich);
  }

  if (versionesAcumuladas.length > 0) {
    const richMulti = construirRichTextMultiRevision(versionesAcumuladas);
    if (richMulti) {
      hojaMaster.getRange(filaObjetivo, 13).setRichTextValue(richMulti);
    }
  }
}

/**
 * Procesa e impacta un documento técnico individual en su Hoja Master correspondiente.
 */
function impactarComoDocumentoIndividual(ss, item) {
  let nombreLimpio = String(item.nombre || "").replace(/\.[^/.]+$/, "").replace(/^[._\-\s]+/, "").trim();
  const fechaStr = normalizarFechaEstandar(item.fecha);

  if (!esDocumentoTecnicoCodificado(nombreLimpio, item.ruta || "", item.nombre, fechaStr)) {
    return null;
  }

  const meta = desglosarMetadatosDocumento(nombreLimpio, "");
  const codLimpio = limpiarCodigoPlanoOficial(meta.codigo || nombreLimpio);
  if (!codLimpio) return null;

  const proy = determinarProyectoPorCodigo(codLimpio, meta.descripcion, item.ruta || "");
  const tieneApc = tieneSelloApcVerificado(item.nombre, "", "");

  actualizarOInsertarEnMaster(ss, {
    proyecto: proy,
    codigo: codLimpio,
    descripcion: meta.descripcion,
    disciplina: meta.disciplina,
    revision: meta.revision || "EO",
    ciclo: (meta.revision && meta.revision !== "EO" && meta.revision !== "0") ? "Ciclo 2" : "Ciclo 1",
    estado: tieneApc ? "Cerrado" : "Abierto",
    etapa: tieneApc ? "Apto para Construcción (Sello APC)" : "Pendiente de Envío a TRANSNOA / TRANSENER",
    responsable: tieneApc ? "Archivo Obra" : "UTE (Inspección / Gestión)",
    fecha: fechaStr,
    remitoTexto: item.nombre,
    url: item.link || ("https://drive.google.com/file/d/" + item.id + "/view"),
    observaciones: "Ingreso directo desde Drive"
  });

  return {
    proyecto: proy,
    codigo: codLimpio,
    descripcion: meta.descripcion,
    revision: meta.revision || "EO",
    fecha: fechaStr,
    url: item.link || ("https://drive.google.com/file/d/" + item.id + "/view")
  };
}

/**
 * Busca (o crea si no existe dentro de la rama del proyecto) la carpeta '03-DOCUMENTOS APC'
 * respetando estrictamente la división de los 4 proyectos, y mueve el archivo allí cuando tiene Sello APC.
 */
function moverArchivoACarpetaApcProyecto(idArchivo, proyecto) {
  try {
    const archivo = DriveApp.getFileById(idArchivo);
    const padresActuales = archivo.getParents();
    if (padresActuales.hasNext()) {
      const carpetaActual = padresActuales.next();
      const nomAct = carpetaActual.getName().toUpperCase();
      if (nomAct.includes("APC")) {
        return { movido: false, nuevaRuta: carpetaActual.getName() };
      }
    }

    const carpetaRaiz = DriveApp.getFolderById(ID_CARPETA_RAIZ);
    let palabraClaveProy = "LEALES";
    if (proyecto.includes("Villa Quinteros") && !proyecto.includes("LAT")) palabraClaveProy = "VILLA QUINTEROS";
    else if (proyecto.includes("LAT")) palabraClaveProy = "LAT";
    else if (proyecto.includes("Bracho")) palabraClaveProy = "BRACHO";

    let carpetaProyecto = null;
    let carpetaApcDestino = null;
    let rutaDestinoTexto = "";

    const subRaiz = carpetaRaiz.getFolders();
    while (subRaiz.hasNext()) {
      const f = subRaiz.next();
      const nU = f.getName().toUpperCase();
      if (
        (palabraClaveProy === "LAT" && (nU.includes("LAT") || nU.includes("02-ING LAT"))) ||
        (palabraClaveProy === "VILLA QUINTEROS" && (nU.includes("VILLA QUINTEROS") || nU.includes("ET VQ"))) ||
        (palabraClaveProy === "BRACHO" && nU.includes("BRACHO") && !nU.includes("LAT")) ||
        (palabraClaveProy === "LEALES" && nU.includes("LEALES"))
      ) {
        carpetaProyecto = f;
        break;
      }
    }

    function buscarSubcarpetaApcRec(folder, rutaAcum) {
      const subs = folder.getFolders();
      while (subs.hasNext()) {
        const sub = subs.next();
        const nomSubU = sub.getName().toUpperCase();
        const nuevaRuta = rutaAcum + " / " + sub.getName();
        if (nomSubU.includes("03-DOCUMENTOS APC") || nomSubU.includes("DOCUMENTOS APC") || nomSubU === "APC") {
          carpetaApcDestino = sub;
          rutaDestinoTexto = nuevaRuta;
          return;
        }
        buscarSubcarpetaApcRec(sub, nuevaRuta);
        if (carpetaApcDestino) return;
      }
    }

    if (carpetaProyecto) {
      buscarSubcarpetaApcRec(carpetaProyecto, carpetaRaiz.getName() + " / " + carpetaProyecto.getName());
      if (!carpetaApcDestino) {
        carpetaApcDestino = carpetaProyecto.createFolder("03-DOCUMENTOS APC (COMITENTE)");
        rutaDestinoTexto = carpetaRaiz.getName() + " / " + carpetaProyecto.getName() + " / 03-DOCUMENTOS APC (COMITENTE)";
      }
    }

    if (carpetaApcDestino) {
      archivo.moveTo(carpetaApcDestino);
      return { movido: true, nuevaRuta: rutaDestinoTexto };
    }
  } catch (eMove) {
    Logger.log("Aviso al mover archivo APC a su carpeta de proyecto: " + eMove.message);
  }
  return { movido: false, nuevaRuta: "" };
}

/**
 * Escanea archivos nuevos o modificados dentro del árbol de la carpeta raíz del proyecto,
 * asegurando que cualquier plano que aún no figure en su Hoja Master sea incorporado de inmediato.
 */
function escanearNovedadesDesdeUltimaFecha() {
  const tiempoInicioMs = new Date().getTime();
  const TIEMPO_MAX_EJECUCION_MS = 240 * 1000; // 4 minutos de margen seguro

  const props = PropertiesService.getScriptProperties();
  const ahora = new Date();
  const ahoraMs = ahora.getTime();

  let timestampBase = parseInt(props.getProperty("TIMESTAMP_ULTIMO_ESCANEO") || "0", 10);
  if (timestampBase === 0 || timestampBase > ahoraMs) {
    timestampBase = ahoraMs - (30 * 24 * 60 * 60 * 1000); // Últimos 30 días por defecto
  }

  props.setProperty("ESTADO_PROCESO", "Escaneando Novedades");

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let hojaLog = ss.getSheetByName("Registro_Archivos_Drive");
  if (!hojaLog) {
    hojaLog = ss.insertSheet("Registro_Archivos_Drive");
    hojaLog.appendRow(CABECERAS_REGISTRO_DRIVE);
  }

  const idsYaProcesados = new Set();
  if (hojaLog.getLastRow() > 1) {
    const datosLog = hojaLog.getRange(2, 1, hojaLog.getLastRow() - 1, 1).getValues();
    datosLog.forEach(r => {
      const idStr = String(r[0] || "").trim();
      if (idStr) idsYaProcesados.add(idStr);
    });
  }

  // Cargar todos los códigos que ya están presentes en las 4 hojas Master
  const codigosEnMasters = new Set();
  NOMBRES_HOJAS_MASTER.forEach(nomH => {
    const sh = ss.getSheetByName(nomH);
    if (sh && sh.getLastRow() >= 2) {
      const cods = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
      cods.forEach(c => {
        const k = limpiarCodigoPlanoOficial(c[0]).toUpperCase().replace(/[^A-Z0-9]/g, "");
        if (k) codigosEnMasters.add(k);
      });
    }
  });

  let carpetaRaiz;
  try {
    carpetaRaiz = DriveApp.getFolderById(ID_CARPETA_RAIZ);
  } catch (e) {
    props.setProperty("ESTADO_PROCESO", "Error Acceso Drive");
    return { ok: false, error: "No se pudo acceder a la carpeta raíz de Drive." };
  }

  const archivosNuevos = [];
  const carpetasVisitadas = new Set();

  function recolectarNovedadesArbolRec(carpeta, rutaAcumulada) {
    if (new Date().getTime() - tiempoInicioMs > TIEMPO_MAX_EJECUCION_MS) return;
    if (archivosNuevos.length >= 120) return;

    const idCarp = carpeta.getId();
    if (carpetasVisitadas.has(idCarp)) return;
    carpetasVisitadas.add(idCarp);

    const nomCarpetaNorm = normalizarTexto(carpeta.getName());
    if (nomCarpetaNorm.includes("elenco de documentos de ingenieria")) return;

    const archivos = carpeta.getFiles();
    while (archivos.hasNext() && archivosNuevos.length < 120) {
      if (new Date().getTime() - tiempoInicioMs > TIEMPO_MAX_EJECUCION_MS) break;

      const arc = archivos.next();
      const id = arc.getId();
      const nom = arc.getName();

      if (nom.startsWith("._") || nom.startsWith("~$")) continue;

      const nomSinExt = nom.replace(/\.[^/.]+$/, "").replace(/^[_ \-\.]+/, "").trim();
      const nomUpper = nom.toUpperCase();

      const esNota = (
        nomUpper.startsWith("NP") || nomUpper.startsWith("OS") ||
        nomUpper.startsWith("NI") || nomUpper.startsWith("NE") ||
        nomUpper.startsWith("COMCT") || nomUpper.startsWith("TU1")
      ) && arc.getMimeType() === MimeType.PDF;

      const fechaArcStr = normalizarFechaEstandar(arc.getLastUpdated());
      const esPlanoValido = esDocumentoTecnicoCodificado(nomSinExt, rutaAcumulada, nom, fechaArcStr);

      if (!esPlanoValido && !esNota) continue;

      const meta = desglosarMetadatosDocumento(nomSinExt, "");
      const keyPlano = limpiarCodigoPlanoOficial(meta.codigo || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      const faltaEnMaster = esPlanoValido && keyPlano && !codigosEnMasters.has(keyPlano);
      const modMs = arc.getLastUpdated().getTime();

      if (!idsYaProcesados.has(id) || faltaEnMaster || modMs >= timestampBase) {
        archivosNuevos.push({
          archivo: arc,
          id: id,
          nombre: nom,
          fecha: arc.getLastUpdated(),
          link: arc.getUrl(),
          ruta: rutaAcumulada
        });
      }
    }

    const subCarpetas = carpeta.getFolders();
    while (subCarpetas.hasNext() && archivosNuevos.length < 120) {
      if (new Date().getTime() - tiempoInicioMs > TIEMPO_MAX_EJECUCION_MS) break;
      const sub = subCarpetas.next();
      recolectarNovedadesArbolRec(sub, rutaAcumulada + " / " + sub.getName());
    }
  }

  recolectarNovedadesArbolRec(carpetaRaiz, carpetaRaiz.getName());

  let procesadosExitosos = 0;
  const novedadesDetalle = [];
  const ahoraFormateado = normalizarFechaEstandar(ahora);

  for (let i = 0; i < archivosNuevos.length; i++) {
    if (new Date().getTime() - tiempoInicioMs > TIEMPO_MAX_EJECUCION_MS) break;

    const item = archivosNuevos[i];
    props.setProperty("ULTIMO_ARCHIVO", item.nombre);

    if (item.archivo.getSize() > 25 * 1024 * 1024) {
      if (!idsYaProcesados.has(item.id)) {
        hojaLog.appendRow([item.id, item.nombre, item.ruta, normalizarFechaEstandar(item.fecha), "OMITIDO (>25MB)", ahoraFormateado]);
        idsYaProcesados.add(item.id);
      }
      continue;
    }

    try {
      const nomUpper = item.nombre.toUpperCase();
      const rutaUpper = item.ruta.toUpperCase();
      const esPlanoIndividual = esDocumentoTecnicoCodificado(item.nombre, item.ruta, item.nombre, "");

      const esNotaORemito = !esPlanoIndividual && (
        nomUpper.startsWith("NP") || nomUpper.startsWith("OS") || nomUpper.startsWith("NI") ||
        nomUpper.startsWith("NE") || nomUpper.startsWith("COMCT") || nomUpper.startsWith("TU1") ||
        rutaUpper.includes("LIBRO") || rutaUpper.includes("TRANSNOA")
      ) && item.archivo.getMimeType() === MimeType.PDF;

      if (esNotaORemito) {
        const b64 = Utilities.base64Encode(item.archivo.getBlob().getBytes());
        const resIA = procesarPdfConGemini(b64, item.nombre, item.ruta);
        if (resIA && resIA.exito && resIA.datos) {
          impactarArchivoEnSheets(ss, resIA.datos, item.fecha, item.link, item.nombre, item.ruta);
          novedadesDetalle.push({
            proyecto: "Comunicaciones / Transmittals",
            codigo: resIA.datos.numero_remito || item.nombre,
            descripcion: `${resIA.datos.dictamen || "Nota"} (${(resIA.datos.documentos || []).length} planos vinculados)`,
            revision: "-",
            fecha: normalizarFechaEstandar(item.fecha),
            url: item.link
          });
          procesadosExitosos++;
        }
      } else {
        const infoImpactado = impactarComoDocumentoIndividual(ss, item);
        if (infoImpactado) {
          novedadesDetalle.push(infoImpactado);
          procesadosExitosos++;
        }
      }

      if (!idsYaProcesados.has(item.id)) {
        hojaLog.appendRow([item.id, item.nombre, item.ruta, normalizarFechaEstandar(item.fecha), "ACTUALIZADO (NOVEDAD)", ahoraFormateado]);
        idsYaProcesados.add(item.id);
      }
    } catch (errArc) {
      Logger.log("Error procesando novedad " + item.nombre + ": " + errArc.message);
    }
  }

  props.setProperty("TIMESTAMP_ULTIMO_ESCANEO", ahoraMs.toString());
  props.setProperty("FECHA_ULTIMO_ESCANEO", ahoraFormateado);
  props.setProperty("NOVEDADES_ULTIMO_ESCANEO", procesadosExitosos.toString());
  props.setProperty("ESTADO_PROCESO", "Inactivo");

  if (novedadesDetalle.length > 0) {
    try {
      const previasRaw = props.getProperty("ULTIMAS_NOVEDADES_DIA") || "[]";
      const previas = JSON.parse(previasRaw);
      // Guardamos todas las novedades del día para enviarlas juntas a las 18hs
      const combinadas = novedadesDetalle.concat(previas);
      props.setProperty("ULTIMAS_NOVEDADES_DIA", JSON.stringify(combinadas));
    } catch (eJson) {}
  }

  generarReporteComparacionElencos();

  SpreadsheetApp.getActiveSpreadsheet().toast(
    `Novedades procesadas: ${procesadosExitosos} documento(s) técnico(s).`,
    "Actualizado ✅",
    5
  );
  return {
    ok: true,
    novedades: procesadosExitosos,
    continuaToken: false,
    items: novedadesDetalle
  };
}

/**
 * Devuelve a pedido los últimos documentos subidos a Google Drive.
 */
function obtenerUltimosDocumentosSubidosDrive(limite) {
  const cantMax = limite || 25;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const hojaLog = ss.getSheetByName("Registro_Archivos_Drive");
  const lista = [];

  if (hojaLog && hojaLog.getLastRow() >= 2) {
    const datos = hojaLog.getRange(2, 1, hojaLog.getLastRow() - 1, 6).getValues();
    datos.forEach(r => {
      const idArc = String(r[0] || "").trim();
      const nomArc = String(r[1] || "").trim();
      const rutaArc = String(r[2] || "").trim();
      const fecDrive = normalizarFechaEstandar(r[3]);
      if (!idArc || !nomArc) return;

      const meta = desglosarMetadatosDocumento(nomArc, "");
      const cod = meta.codigo || nomArc;
      const proy = determinarProyectoPorCodigo(cod, meta.descripcion, rutaArc);
      const tieneApc = tieneSelloApcVerificado(nomArc, "", "");

      lista.push({
        id: idArc,
        proyecto: proy,
        codigo: cod,
        nombreArchivo: nomArc,
        revision: meta.revision || "EO",
        fecha: fecDrive || "-",
        timestamp: parsearFechaAMilisegundos(fecDrive),
        ruta: rutaArc,
        selloApc: tieneApc,
        url: "https://drive.google.com/file/d/" + idArc + "/view"
      });
    });
  }

  lista.sort((a, b) => b.timestamp - a.timestamp);
  return lista.slice(0, cantMax);
}

/**
 * Función de soporte para el botón "▶ Escaneo Completo Continuo" de la barra lateral.
 */
function procesarUnArchivo() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty("PAUSAR_SOLICITADO") === "TRUE") {
    props.setProperty("ESTADO_PROCESO", "Pausado");
    return { finalizado: false, estado: "Pausado" };
  }

  const res = escanearNovedadesDesdeUltimaFecha();
  const finalizado = !res.continuaToken;
  return {
    finalizado: finalizado,
    estado: finalizado ? "Completado" : "Escaneando",
    novedades: res.novedades || 0
  };
}

/**
 * ESCANEO PROFUNDO DE TODAS LAS CARPETAS Y SUBCARPETAS DE LAT (Incluyendo 05-SAE LAT DT BR-VQ y Pto 02).
 * Si una carpeta pertenece a una rama LAT, escanea automáticamente TODAS sus subcarpetas internas.
 */
function escanearCarpetasLATProfundo() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.toast("Escaneando profundamente todas las carpetas y subcarpetas de LAT en Drive...", "Escaneo LAT 🚀", 6);

  let hojaLog = ss.getSheetByName("Registro_Archivos_Drive");
  if (!hojaLog) {
    hojaLog = ss.insertSheet("Registro_Archivos_Drive");
    hojaLog.appendRow(CABECERAS_REGISTRO_DRIVE);
  }

  const idsYaEnLog = new Set(
    hojaLog.getLastRow() > 1
      ? hojaLog.getRange(2, 1, hojaLog.getLastRow() - 1, 1).getValues().flat().map(String)
      : []
  );

  const carpetaRaiz = DriveApp.getFolderById(ID_CARPETA_RAIZ);
  const carpetasVisitadas = new Set();
  const hoyStr = normalizarFechaEstandar(new Date());
  let totalPlanosLAT = 0;

  function recorrerRamaLAT(folder, rutaAcum, dentroDeRamaLAT) {
    const idF = folder.getId();
    if (carpetasVisitadas.has(idF)) return;
    carpetasVisitadas.add(idF);

    const nom = folder.getName().toUpperCase();
    if (normalizarTexto(nom).includes("elenco de documentos de ingenieria")) return;

    // Si la carpeta actual o cualquiera de sus carpetas padre es de LAT, activamos lectura completa
    const esRamaLAT = dentroDeRamaLAT || (
      nom.includes("02-ING LAT") ||
      nom.includes("LAT BRACHO") ||
      nom.includes("LAT DT") ||
      nom.includes("BR-VQ") ||
      nom.includes("EB-VQ") ||
      nom.includes("PTO 02") ||
      nom.includes("04-LAT") ||
      nom.includes("05-SAE") ||
      nom.includes("LAT ") ||
      nom.startsWith("LAT")
    );

    // También leemos archivos en cualquier carpeta si el propio archivo empieza con L-EB-VQ
    const files = folder.getFiles();
    while (files.hasNext()) {
      const arc = files.next();
      const nomArc = arc.getName();
      if (nomArc.startsWith("~$") || nomArc.startsWith("._")) continue;

      const nomLimpio = nomArc.replace(/^[._\-\s]+/, "").trim();
      const esCodigoLAT = nomLimpio.toUpperCase().startsWith("L-EB-VQ") || nomLimpio.toUpperCase().includes("L-EB-VQ");

      if (!esRamaLAT && !esCodigoLAT) continue;

      const idArc = arc.getId();
      const fechaArcStr = normalizarFechaEstandar(arc.getLastUpdated());

      if (esDocumentoTecnicoCodificado(nomLimpio, rutaAcum, nomArc, fechaArcStr)) {
        impactarComoDocumentoIndividual(ss, {
          archivo: arc,
          id: idArc,
          nombre: nomArc,
          fecha: arc.getLastUpdated(),
          link: arc.getUrl(),
          ruta: rutaAcum
        });

        if (!idsYaEnLog.has(idArc)) {
          hojaLog.appendRow([idArc, nomArc, rutaAcum, fechaArcStr, "PROCESADO (FORZADO LAT)", hoyStr]);
          idsYaEnLog.add(idArc);
        }
        totalPlanosLAT++;
      }
    }

    const subs = folder.getFolders();
    while (subs.hasNext()) {
      const sub = subs.next();
      recorrerRamaLAT(sub, rutaAcum + " / " + sub.getName(), esRamaLAT);
    }
  }

  recorrerRamaLAT(carpetaRaiz, carpetaRaiz.getName(), false);

  limpiarYNormalizarHojasMasterCompleto();
  ss.toast(`✅ Escaneo LAT completado: ${totalPlanosLAT} planos verificados e impactados en Master LAT.`, "Éxito LAT", 6);
}

/**
 * ESCANEO PROFUNDO DE TODAS LAS CARPETAS Y SUBCARPETAS DE VILLA QUINTEROS.
 */
function escanearCarpetasVQProfundo() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.toast("Escaneando profundamente todas las carpetas y subcarpetas de Villa Quinteros...", "Escaneo VQ 🚀", 6);

  let hojaLog = ss.getSheetByName("Registro_Archivos_Drive");
  if (!hojaLog) {
    hojaLog = ss.insertSheet("Registro_Archivos_Drive");
    hojaLog.appendRow(CABECERAS_REGISTRO_DRIVE);
  }

  const idsYaEnLog = new Set(
    hojaLog.getLastRow() > 1
      ? hojaLog.getRange(2, 1, hojaLog.getLastRow() - 1, 1).getValues().flat().map(String)
      : []
  );

  const carpetaRaiz = DriveApp.getFolderById(ID_CARPETA_RAIZ);
  const carpetasVisitadas = new Set();
  const hoyStr = normalizarFechaEstandar(new Date());
  let totalPlanosVQ = 0;

  function recorrerRamaVQ(folder, rutaAcum, dentroDeRamaVQ) {
    const idF = folder.getId();
    if (carpetasVisitadas.has(idF)) return;
    carpetasVisitadas.add(idF);

    const nom = folder.getName().toUpperCase();
    if (normalizarTexto(nom).includes("elenco de documentos de ingenieria")) return;

    const esRamaVQ = dentroDeRamaVQ || (
      nom.includes("VILLA QUINTEROS") ||
      nom.includes("ET VQ") ||
      nom.includes("ET-VQ") ||
      nom.includes("03-ING ET VILLA")
    );

    const files = folder.getFiles();
    while (files.hasNext()) {
      const arc = files.next();
      const nomArc = arc.getName();
      if (nomArc.startsWith("~$") || nomArc.startsWith("._")) continue;

      const nomLimpio = nomArc.replace(/^[._\-\s]+/, "").trim();
      const esCodigoVQ = nomLimpio.toUpperCase().startsWith("ET-VQ") || nomLimpio.toUpperCase().includes("ET-VQ");

      if (!esRamaVQ && !esCodigoVQ) continue;

      const idArc = arc.getId();
      const fechaArcStr = normalizarFechaEstandar(arc.getLastUpdated());

      if (esDocumentoTecnicoCodificado(nomLimpio, rutaAcum, nomArc, fechaArcStr)) {
        impactarComoDocumentoIndividual(ss, {
          archivo: arc,
          id: idArc,
          nombre: nomArc,
          fecha: arc.getLastUpdated(),
          link: arc.getUrl(),
          ruta: rutaAcum
        });

        if (!idsYaEnLog.has(idArc)) {
          hojaLog.appendRow([idArc, nomArc, rutaAcum, fechaArcStr, "PROCESADO (FORZADO VQ)", hoyStr]);
          idsYaEnLog.add(idArc);
        }
        totalPlanosVQ++;
      }
    }

    const subs = folder.getFolders();
    while (subs.hasNext()) {
      const sub = subs.next();
      recorrerRamaVQ(sub, rutaAcum + " / " + sub.getName(), esRamaVQ);
    }
  }

  recorrerRamaVQ(carpetaRaiz, carpetaRaiz.getName(), false);

  limpiarYNormalizarHojasMasterCompleto();
  ss.toast(`✅ Escaneo Villa Quinteros completado: ${totalPlanosVQ} planos verificados.`, "Éxito VQ", 6);
}

/**
 * Sincroniza fechas desde Drive y repara estados según el Histórico de Transmittals.
 */
function sincronizarYRepararMetadatosDrive() {
  limpiarYNormalizarHojasMasterCompleto();
}