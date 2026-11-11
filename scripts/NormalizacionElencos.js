/**
 * ====================================================================================================
 * ARCHIVO: NormalizacionElencos.gs
 * MÓDULO EXHAUSTIVO DE REGLAS DE INGENIERÍA, NORMALIZACIÓN, CLASIFICACIÓN, INTEGRACIÓN DE TRAZABILIDAD
 * CON HISTÓRICO DE TRANSMITTALS Y PURGA DE DOCUMENTOS DUPLICADOS O FANTASMAS.
 * ====================================================================================================
 */

function escaparParaRegex(str) {
  if (!str) return "";
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function determinarProyectoPorCodigo(codigo, descripcion, archivoOContexto) {
  const codLimpio = String(codigo || "").toUpperCase().replace(/^[._\-\s]+/, "").trim();
  const descLimpia = String(descripcion || "").toUpperCase().trim();
  const contexto = String(archivoOContexto || "").toUpperCase().trim();
  const str = `${codLimpio} ${descLimpia} ${contexto}`;

  if (codLimpio.startsWith("L-EB-VQ") || codLimpio.startsWith("LEBVQ") || codLimpio.startsWith("LAT")) {
    return "LAT El Bracho - Villa Quinteros";
  }
  if (codLimpio.startsWith("ET-VQ") || codLimpio.startsWith("ETVQ") || codLimpio.startsWith("VQ-")) {
    return "ET Villa Quinteros";
  }
  if (
    codLimpio.startsWith("ET-BR") || 
    codLimpio.startsWith("ET-EB") || 
    codLimpio.startsWith("ETEB") || 
    codLimpio.startsWith("ETBR") || 
    codLimpio.startsWith("BR-")
  ) {
    return "ET El Bracho";
  }
  if (codLimpio.startsWith("ET-LE") || codLimpio.startsWith("ETLE") || codLimpio.startsWith("LE-")) {
    return "ET Leales";
  }

  if (
    str.includes("L-EB-VQ") || 
    str.includes("04-LAT") || 
    str.includes("02-ING LAT") || 
    str.includes("LAT BRACHO") || 
    (str.includes("LINEA") && str.includes("BRACHO"))
  ) {
    return "LAT El Bracho - Villa Quinteros";
  }
  if (
    str.includes("VILLA QUINTEROS") || 
    str.includes("ET VQ") || 
    str.includes("ET-VQ") || 
    str.includes("03-ING ET VILLA") || 
    str.includes("ADECUACION ET VQ")
  ) {
    return "ET Villa Quinteros";
  }
  if (
    str.includes("BRACHO") && 
    !str.includes("LAT") && 
    !str.includes("LINEA") && 
    !str.includes("L-EB-VQ")
  ) {
    return "ET El Bracho";
  }
  if (str.includes("LEALES") || str.includes("01-ING ET LEALES")) {
    return "ET Leales";
  }

  return "ET Leales";
}

function determinarNombreHojaProyecto(codigo, descripcion, rutaCarpeta) {
  const proy = determinarProyectoPorCodigo(codigo, descripcion, rutaCarpeta);
  return "Master " + proy;
}

function esDocumentoTecnicoEstrictoElenco(codigo, descripcion, nombreArchivo, fechaInput) {
  let c = String(codigo || "").toUpperCase().trim();
  let d = String(descripcion || "").toUpperCase().trim();
  let n = String(nombreArchivo || "").toUpperCase().trim();
  const f = String(fechaInput || "").toUpperCase().trim();

  if (
    c.startsWith("._") || n.startsWith("._") || d.startsWith("._") ||
    c.startsWith("~$") || n.startsWith("~$") || d.startsWith("~$")
  ) {
    return false;
  }

  // Ignorar archivos de Google Earth (.kmz / .kml) o archivos comprimidos (.zip / .rar)
  if (/\.(KMZ|KML|ZIP|RAR|DWG|XLSX|DOCX)$/i.test(n) || /\.(KMZ|KML|ZIP|RAR|DWG)$/i.test(c)) {
    return false;
  }

  c = c.replace(/^[._\-\s]+/, "").trim();
  n = n.replace(/^[._\-\s]+/, "").trim();

  if (
    f && (
      f.includes("XX") || 
      f.includes("??") || 
      f.includes("00/00") || 
      f.includes("S/F") || 
      f.includes("SIN FECHA") || 
      f.includes("PENDIENTE")
    )
  ) {
    return false;
  }
  if (c.includes("XX") || d.includes("XX/XX") || n.includes("XX.XX")) {
    return false;
  }

  // PRIORIDAD ABSOLUTA: Si el código o el nombre del archivo comienza con la nomenclatura oficial de plano
  // (ej: L-EB-VQ-OC-PN-003, L-EB-VQ-OC-PL-011, L-EB-VQ-OC-MD-002, ET-VQ-OE-PL-101), es 100% válido
  const regexOficialObra = /^(?:ET[-_](?:LE|VQ|BR|EB)|L[-_]EB[-_]VQ)[-_](?:OE|OC|OEM|TCYP)[-_](?:PL|MD|PN|DG|ET|IS|MC)[-_]?[0-9]{2,4}/i;
  if (regexOficialObra.test(c) || regexOficialObra.test(n)) {
    return true;
  }

  const regexConSufijo = /((?:ET[-_](?:LE|VQ|BR|EB)|L[-_]EB[-_]VQ)[-_](?:OE|OC|OEM|TCYP)[-_](?:PL|MD|PN|DG|ET|IS|MC)[-_]?[0-9]{2,4})/i;
  if (regexConSufijo.test(c)) {
    return true;
  }

  return false;
}

function esDocumentoTecnicoCodificado(codigo, descripcion, nombreArchivo, fechaInput) {
  return esDocumentoTecnicoEstrictoElenco(codigo, descripcion, nombreArchivo, fechaInput);
}

function limpiarCodigoPlanoOficial(codigo) {
  let c = String(codigo || "").toUpperCase().replace(/^[._\-\s]+/, "").trim();
  const match = c.match(/^((?:ET[-_](?:LE|VQ|BR|EB)|L[-_]EB[-_]VQ)[-_](?:OE|OC|OEM|TCYP)[-_](?:PL|MD|PN|DG|ET|IS|MC)[-_]?[0-9]{2,4})/i);
  if (match) {
    return match[1].toUpperCase().replace(/_/g, "-");
  }
  return c;
}

function inferirDisciplina(codigo, descripcion) {
  const c = String(codigo || "").toUpperCase();
  const d = String(descripcion || "").toUpperCase();
  const texto = `${c} ${d}`;

  if (c.includes("-OC-")) return "Civil";
  if (c.includes("-OEM-")) return "Electromecánica";
  if (c.includes("-TCYP-")) return "Control y Protecciones";
  if (c.includes("-OE-")) {
    if (c.includes("-PN-") || texto.includes("SCADA") || texto.includes("RTU") || texto.includes("PROTECCION") || texto.includes("TELECONTROL")) {
      return "Control y Protecciones";
    }
    return "Eléctrica";
  }

  if (
    texto.includes("SCADA") || texto.includes("PROTECCION") || texto.includes("PROTECCIÓN") ||
    texto.includes("SEÑALES") || texto.includes("TELECONTROL") || texto.includes("RTU") ||
    texto.includes("CONTROL Y MEDICION") || texto.includes("TABLERO DE CONTROL")
  ) {
    return "Control y Protecciones";
  }

  if (
    texto.includes("ELECTROMECANIC") || texto.includes("MORSETERIA") || texto.includes("MORSETERÍA") ||
    texto.includes("DISPOSICION") || texto.includes("DISPOSICIÓN") || texto.includes("CAMPOS DE LINEA") ||
    texto.includes("MALLA DE PAT") || texto.includes("PUESTA A TIERRA") || texto.includes("RESISTIVIDAD")
  ) {
    return "Electromecánica";
  }

  if (
    texto.includes("CIVIL") || texto.includes("PLANIALTIMETR") || texto.includes("PLANIMETRIA") ||
    texto.includes("DESAGUE") || texto.includes("EDIFICIO") || texto.includes("SUELOS") ||
    texto.includes("CERCO") || texto.includes("CATASTRAL") || texto.includes("SERVIDUMBRE") ||
    texto.includes("PARCELAS") || texto.includes("FUNDACIONES") || texto.includes("TRAZA")
  ) {
    return "Civil";
  }

  return "Eléctrica";
}

function extraerRevisionCanonico(textoCompleto, revCruda) {
  const strCrudo = String(revCruda || "").toUpperCase().trim();
  const texto = String(textoCompleto || "").toUpperCase();

  const listaNegra = new Set([
    "PL", "ME", "CA", "MC", "LA", "UN", "T", "BI", "FU", "LI", "PA", "TO",
    "DE", "EL", "EN", "CON", "POR", "SIN", "DEL", "LOS", "LAS", "RO",
    "SE", "NO", "SI", "AL", "SU", "ES", "DT", "BR", "VQ", "LE", "EB"
  ]);

  if (strCrudo && !listaNegra.has(strCrudo)) {
    if (strCrudo === "EO" || /^[0-9]$/.test(strCrudo) || /^[A-E]$/.test(strCrudo)) {
      return strCrudo;
    }
    const matchRevDirecto = strCrudo.match(/(?:REV|R)?\s*([0-9A-E]|EO)\b/i);
    if (matchRevDirecto && !listaNegra.has(matchRevDirecto[1])) {
      return matchRevDirecto[1].toUpperCase();
    }
  }

  if (/(?:[-_\s.]EO\b|EMISI[OÓ]N\s+ORIGINAL\b)/i.test(texto)) {
    return "EO";
  }

  const matchPrefijo = texto.match(/\b(?:REV|REVISION|REVISIÓN|R)[-_\s.:]*([0-9A-E]|EO)\b/i);
  if (matchPrefijo) {
    const val = matchPrefijo[1].toUpperCase();
    if (!listaNegra.has(val)) return val;
  }

  const matchSufijo = texto.match(/[-_]([0-9A-E])(?:\.[a-zA-Z0-9]+|[-_\s]|$)/i);
  if (matchSufijo) {
    const val = matchSufijo[1].toUpperCase();
    if (!listaNegra.has(val)) return val;
  }

  return "EO";
}

function desglosarMetadatosDocumento(nombreArchivoOTexto, descOriginal) {
  let str = String(nombreArchivoOTexto || "").replace(/\.[^/.]+$/, "").replace(/^[._\-\s]+/, "").trim();
  let desc = String(descOriginal || "").replace(/\.[^/.]+$/, "").replace(/^[._\-\s]+/, "").trim();

  let codigo = "";
  const regexCod = /((?:ET[-_](?:LE|VQ|BR|EB)|L[-_]EB[-_]VQ)[-_](?:OE|OC|OEM|TCYP)[-_](?:PL|MD|PN|DG|ET|IS|MC)[-_]?[0-9]{2,4})/i;
  const matchCod = str.match(regexCod) || desc.match(regexCod);

  if (matchCod) {
    codigo = matchCod[1].toUpperCase().replace(/_/g, "-");
  } else {
    codigo = limpiarCodigoPlanoOficial(str);
  }

  const revision = extraerRevisionCanonico(str + " " + desc, "");

  let textoLimpio = desc && desc.length > 5 ? desc : str;
  if (codigo) {
    const codigoEscapado = escaparParaRegex(codigo).replace(/[-_]/g, "[-_]");
    try {
      const regexRemoverCod = new RegExp(codigoEscapado, "gi");
      textoLimpio = textoLimpio.replace(regexRemoverCod, "");
    } catch (eRegex) {}
  }

  textoLimpio = textoLimpio
    .replace(/^[-_\s.:]*(?:EO|REV\s*[0-9A-E]|R[0-9A-E]|[A-E])[-_\s.:]+/i, "")
    .replace(/[-_\s.:]+(?:EO|REV\s*[0-9A-E]|R[0-9A-E])[-_\s.:]*$/i, "")
    .replace(/^[-_\s.:]+/, "")
    .replace(/[-_\s.:]+$/, "")
    .trim();

  if (textoLimpio.length < 4) {
    textoLimpio = "Documento Técnico " + codigo;
  }

  return {
    codigo: codigo,
    revision: revision,
    descripcion: textoLimpio,
    disciplina: inferirDisciplina(codigo, textoLimpio)
  };
}

function tieneSelloApcVerificado(nombreArchivo, textoObservacion, dictamenHistorico) {
  const nomU = String(nombreArchivo || "").toUpperCase();
  const obsU = String(textoObservacion || "").toUpperCase();
  const dictU = String(dictamenHistorico || "").toUpperCase();

  if (
    nomU.includes("NO ENVIAR") ||
    nomU.includes("OBSERVADO") ||
    obsU.includes("NO ENVIAR") ||
    obsU.includes("SIN SELLO")
  ) {
    return false;
  }

  const regexSelloEnNombre = /(?:[-_\s(\[]APC[-_\s)\].]|[-_\s]SELLO\s*APC|APTO\s*PARA\s*CONSTRUCCI[OÓ]N)/i;
  if (regexSelloEnNombre.test(nomU)) {
    return true;
  }

  if (dictU.includes("SELLO APC") || (dictU.includes("APTO PARA CONSTRUCCIÓN") && obsU.includes("SELLO APC"))) {
    return true;
  }

  return false;
}

function calcularEstadoPuntualYCircuito(meta, nomArc, rutaCarpeta, eventosPlano) {
  const nomU = String(nomArc || "").toUpperCase();
  const revU = String(meta.revision || "EO").toUpperCase();

  const eventosValidos = (eventosPlano || []).filter(ev => {
    const remU = String(ev.remito || "").toUpperCase();
    const dictU = String(ev.dictamen || "").toUpperCase();
    if (dictU === "DOCUMENTO TÉCNICO" || dictU === "PRESENTACIÓN" || dictU.includes("PRIORIDAD")) return false;
    if (/^(?:ET[-_](?:LE|VQ|BR|EB)|L[-_]EB[-_]VQ)[-_](?:OE|OC|OEM|TCYP)/i.test(remU)) return false;
    return true;
  });

  let numCiclo = 1;
  let devolucionesCount = 0;

  eventosValidos.forEach(ev => {
    const dU = ev.dictamen.toUpperCase();
    if (dU.includes("OBSERVADO") || dU.includes("DEVUELTO POR TRANSPORTISTA") || dU.includes("CORRECCIÓN")) {
      devolucionesCount++;
    }
  });

  if (devolucionesCount > 0) {
    numCiclo = 1 + devolucionesCount;
  } else if (revU !== "EO" && revU !== "0") {
    numCiclo = 2;
  }

  const cicloStr = "Ciclo " + numCiclo;

  if (nomU.includes("NO ENVIAR") || nomU.includes("OBSERVADO POR UTE")) {
    return {
      ciclo: cicloStr,
      estado: "Abierto",
      etapa: "Observado por UTE - Enviado a Ingeniería (Contratista)",
      responsable: "Ingeniería (Contratista)",
      obs: "Observado internamente por UTE (Pendiente nueva rev. de Ingeniería)",
      remitoNota: "",
      urlNota: ""
    };
  }

  const ultimoEv = eventosValidos.length > 0 ? eventosValidos[eventosValidos.length - 1] : null;
  const dictUltimo = ultimoEv ? ultimoEv.dictamen : "";
  const remUltimo = ultimoEv ? ultimoEv.remito : "";
  const urlUltimo = ultimoEv ? (ultimoEv.urlRemito || "") : "";

  if (tieneSelloApcVerificado(nomArc, "", dictUltimo)) {
    return {
      ciclo: cicloStr,
      estado: "Cerrado",
      etapa: "Apto para Construcción (Sello APC)",
      responsable: "Archivo Obra (UTE / Comitente)",
      obs: remUltimo ? `Sello APC verificado (${remUltimo})` : "Sello APC verificado en documento",
      remitoNota: remUltimo,
      urlNota: urlUltimo
    };
  }

  if (ultimoEv) {
    const dU = dictUltimo.toUpperCase();
    const recU = ultimoEv.receptor.toUpperCase();
    const emU = ultimoEv.emisor.toUpperCase();

    if (
      dU.includes("ENVIADO A TRANSNOA") ||
      dU.includes("ENVÍO A TR") ||
      dU.includes("ENVIO A TR") ||
      recU.includes("TRANSNOA") ||
      recU.includes("TRANSENER") ||
      recU.includes("TRANSPORTISTA")
    ) {
      return {
        ciclo: cicloStr,
        estado: "Abierto",
        etapa: "Enviado a TRANSNOA / TRANSENER" + (remUltimo ? ` (${remUltimo})` : ""),
        responsable: "TRANSNOA / TRANSENER (Supervisión)",
        obs: remUltimo ? `Enviado por UTE mediante ${remUltimo}` : "En revisión de Supervisión",
        remitoNota: remUltimo,
        urlNota: urlUltimo
      };
    }

    if (
      dU.includes("ENVIADO A COMITENTE") ||
      recU.includes("COMITENTE") ||
      recU.includes("GOBIERNO") ||
      recU.includes("DIRECCIÓN DE ENERGÍA") ||
      recU.includes("DIRECCION DE ENERGIA")
    ) {
      return {
        ciclo: cicloStr,
        estado: "Abierto",
        etapa: "Enviado a Comitente (Gobierno de Tucumán)" + (remUltimo ? ` (${remUltimo})` : ""),
        responsable: "Comitente (Gobierno de Tucumán)",
        obs: remUltimo ? `Enviado a Comitente con ${remUltimo}` : "En revisión del Comitente",
        remitoNota: remUltimo,
        urlNota: urlUltimo
      };
    }

    if (
      dU.includes("DEVUELTO POR TRANSPORTISTA") ||
      dU.includes("OBSERVADO POR TR") ||
      emU.includes("TRANSNOA") ||
      emU.includes("TRANSENER")
    ) {
      return {
        ciclo: "Ciclo " + Math.max(2, numCiclo),
        estado: "Abierto",
        etapa: "Devuelto por Transportista (Con Observaciones)" + (remUltimo ? ` (${remUltimo})` : ""),
        responsable: "UTE (Reenviar a Ingeniería)",
        obs: remUltimo ? `Devuelto con observaciones en ${remUltimo}` : "Requiere corrección de Ingeniería",
        remitoNota: remUltimo,
        urlNota: urlUltimo
      };
    }

    if (
      dU.includes("ENVIADO A INGENIERÍA") ||
      dU.includes("ENVIADO A INGENIERIA") ||
      dU.includes("OBSERVADO INTERNO") ||
      recU.includes("INGENIER") ||
      recU.includes("CONTRATISTA")
    ) {
      return {
        ciclo: "Ciclo " + Math.max(2, numCiclo),
        estado: "Abierto",
        etapa: "Enviado a Ingeniería (Contratista) p/ Corrección",
        responsable: "Ingeniería (Contratista)",
        obs: remUltimo ? `Reenviado a proyectista (${remUltimo})` : "En corrección por Ingeniería",
        remitoNota: remUltimo,
        urlNota: urlUltimo
      };
    }
  }

  const rutaU = String(rutaCarpeta || "").toUpperCase();
  const avisoSinSello = (rutaU.includes("APC") || rutaU.includes("APROBADOS"))
    ? "En carpeta Aprobados pero SIN Sello APC verificado"
    : "Recibido de Ingeniería - En poder de UTE";

  return {
    ciclo: cicloStr,
    estado: "Abierto",
    etapa: "Pendiente de Envío a TRANSNOA / TRANSENER",
    responsable: "UTE (Inspección / Gestión)",
    obs: avisoSinSello,
    remitoNota: "",
    urlNota: ""
  };
}

function compararJerarquiaRevision(revA, revB) {
  const orden = { "EO": 0, "0": 1, "A": 2, "B": 3, "C": 4, "D": 5, "E": 6, "1": 7, "2": 8, "3": 9, "4": 10 };
  const valA = orden[String(revA || "EO").toUpperCase()] !== undefined ? orden[String(revA || "EO").toUpperCase()] : 0;
  const valB = orden[String(revB || "EO").toUpperCase()] !== undefined ? orden[String(revB || "EO").toUpperCase()] : 0;
  return valA - valB;
}

function extraerIdDriveDesdeUrl(url) {
  if (!url) return "";
  const m = String(url).match(/\/d\/([a-zA-Z0-9_-]{15,})/);
  return m ? m[1] : String(url).trim();
}

function consolidarVersionesUnicasPorRevision(versionesLista) {
  if (!versionesLista || versionesLista.length === 0) return [];

  const mapaPorRev = new Map();

  versionesLista.forEach(v => {
    const revCanon = extraerRevisionCanonico(v.rev, v.rev);
    const idArc = extraerIdDriveDesdeUrl(v.url);
    const fecNorm = normalizarFechaEstandar(v.fecha);
    const ts = v.ts || parsearFechaAMilisegundos(fecNorm);

    if (!mapaPorRev.has(revCanon)) {
      mapaPorRev.set(revCanon, {
        rev: revCanon,
        fecha: fecNorm,
        ts: ts,
        idArchivo: idArc,
        url: idArc && idArc.length > 15 ? `https://drive.google.com/file/d/${idArc}/view` : (v.url || "")
      });
    } else {
      const existente = mapaPorRev.get(revCanon);
      if (fecNorm && (!existente.fecha || (ts > 0 && existente.ts > 0 && ts < existente.ts))) {
        existente.fecha = fecNorm;
        existente.ts = ts;
      }
      if (v.url && !existente.url) {
        existente.url = idArc && idArc.length > 15 ? `https://drive.google.com/file/d/${idArc}/view` : v.url;
      }
    }
  });

  const unicas = Array.from(mapaPorRev.values());
  unicas.sort((a, b) => {
    const cmp = compararJerarquiaRevision(a.rev, b.rev);
    if (cmp !== 0) return cmp;
    return (a.ts || 0) - (b.ts || 0);
  });

  return unicas;
}

function construirRichTextMultiRevision(versionesLista) {
  const ordenadas = consolidarVersionesUnicasPorRevision(versionesLista);
  if (ordenadas.length === 0) return null;

  const segmentos = [];
  let textoAcumulado = "";

  ordenadas.forEach((v, idx) => {
    const prefijo = idx > 0 ? " | " : "";
    textoAcumulado += prefijo;
    const inicio = textoAcumulado.length;
    const etiqueta = `Rev ${v.rev || "EO"}${v.fecha ? " (" + v.fecha + ")" : ""}`;
    textoAcumulado += etiqueta;
    const fin = textoAcumulado.length;

    if (v.url) {
      segmentos.push({ inicio: inicio, fin: fin, url: v.url });
    }
  });

  const builder = SpreadsheetApp.newRichTextValue().setText(textoAcumulado);
  segmentos.forEach(seg => {
    builder.setLinkUrl(seg.inicio, seg.fin, seg.url);
  });
  return builder.build();
}

function limpiarYNormalizarHojasMasterCompleto() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const mapaElencoOficial = new Map();
  const hojaElenco = ss.getSheetByName("Elencos_Oficiales_Referencia");
  if (hojaElenco && hojaElenco.getLastRow() >= 2) {
    const datosE = hojaElenco.getRange(2, 1, hojaElenco.getLastRow() - 1, Math.min(6, hojaElenco.getLastColumn())).getValues();
    datosE.forEach(r => {
      const codE = limpiarCodigoPlanoOficial(r[1]).toUpperCase().replace(/[^A-Z0-9]/g, "");
      const descE = String(r[2] || "").trim();
      const discE = String(r[3] || "").trim();
      const revE = String(r[4] || "EO").trim();
      if (codE) {
        mapaElencoOficial.set(codE, { 
          descripcion: descE, 
          disciplina: discE,
          revision: extraerRevisionCanonico(revE, revE)
        });
      }
    });
  }

  const mapaEventosHistorico = new Map();
  const hojaHist = ss.getSheetByName("Histórico Transmittals") || ss.getSheetByName("Historico Transmittals");
  if (hojaHist && hojaHist.getLastRow() >= 2) {
    const ultH = hojaHist.getLastRow();
    const datosH = hojaHist.getRange(2, 1, ultH - 1, 12).getValues();
    const richH = hojaHist.getRange(2, 7, ultH - 1, 1).getRichTextValues();

    datosH.forEach((fh, idx) => {
      const codH = limpiarCodigoPlanoOficial(fh[2]);
      const codKey = codH.toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (!codKey) return;

      const remitoStr = String(fh[6] || "").trim();
      const dictamen = String(fh[9] || "").trim();
      const fecNorm = normalizarFechaEstandar(fh[5]);
      const ts = parsearFechaAMilisegundos(fecNorm);

      let urlH = "";
      if (richH[idx] && richH[idx][0] && richH[idx][0].getLinkUrl()) {
        urlH = richH[idx][0].getLinkUrl();
      }

      if (!mapaEventosHistorico.has(codKey)) {
        mapaEventosHistorico.set(codKey, []);
      }

      mapaEventosHistorico.get(codKey).push({
        rev: extraerRevisionCanonico(fh[4], fh[4]),
        fecha: fecNorm,
        ts: ts,
        remito: remitoStr,
        urlRemito: urlH,
        emisor: String(fh[7] || "").trim(),
        receptor: String(fh[8] || "").trim(),
        dictamen: dictamen,
        ciclo: String(fh[10] || "Ciclo 1").trim(),
        estado: String(fh[11] || "Abierto").trim()
      });
    });
  }

  const archivosRealesPorMaster = {
    "Master ET Leales": new Map(),
    "Master ET El Bracho": new Map(),
    "Master ET Villa Quinteros": new Map(),
    "Master LAT El Bracho - Villa Quinteros": new Map()
  };

  const hojaLog = ss.getSheetByName("Registro_Archivos_Drive");
  if (hojaLog && hojaLog.getLastRow() >= 2) {
    const logs = hojaLog.getRange(2, 1, hojaLog.getLastRow() - 1, Math.min(6, hojaLog.getLastColumn())).getValues();
    logs.forEach((l, rowIndexZero) => {
      const idArc = String(l[0] || "").trim();
      const nomArc = String(l[1] || "").trim();
      let rutaCarpeta = String(l[2] || "").trim();
      const fecDrive = normalizarFechaEstandar(l[3]);

      if (!idArc || !nomArc) return;

      if (!esDocumentoTecnicoEstrictoElenco(nomArc, nomArc, nomArc, fecDrive)) {
        return;
      }

      const meta = desglosarMetadatosDocumento(nomArc, "");
      if (!meta.codigo) return;

      const claveUnica = meta.codigo.toUpperCase().replace(/[^A-Z0-9]/g, "");
      const proyNombre = determinarProyectoPorCodigo(meta.codigo, meta.descripcion, rutaCarpeta);
      const nombreHojaDestino = "Master " + proyNombre;

      if (!archivosRealesPorMaster[nombreHojaDestino]) return;

      // Si el plano está guardado dentro de una carpeta de Nota de Pedido (ej: COMCT2-TU1-00016),
      // aseguramos que ese evento de envío esté presente en memoria
      const matchNotaRuta = rutaCarpeta.match(/(COMCT2[-_A-Z0-9]+|TU1[-_A-Z0-9]+|(?:NP|OS)[-_ ]?\d+)/i);
      if (matchNotaRuta) {
        const codNotaRuta = matchNotaRuta[1].toUpperCase();
        if (!mapaEventosHistorico.has(claveUnica)) {
          mapaEventosHistorico.set(claveUnica, []);
        }
        const listaEv = mapaEventosHistorico.get(claveUnica);
        const yaTieneNota = listaEv.some(e => e.remito.toUpperCase().includes(codNotaRuta));
        if (!yaTieneNota) {
          listaEv.push({
            rev: meta.revision || "EO",
            fecha: fecDrive,
            ts: parsearFechaAMilisegundos(fecDrive),
            remito: codNotaRuta,
            urlRemito: "https://drive.google.com/file/d/" + idArc + "/view",
            emisor: "UTE",
            receptor: "TRANSNOA / TRANSENER",
            dictamen: "Enviado a TRANSNOA / TRANSENER",
            ciclo: "Ciclo 1",
            estado: "Abierto"
          });
        }
      }

      let descFinal = meta.descripcion;
      let discFinal = meta.disciplina;
      let revFinal = meta.revision || "EO";

      if (mapaElencoOficial.has(claveUnica)) {
        const itemE = mapaElencoOficial.get(claveUnica);
        if (itemE.descripcion && itemE.descripcion.length > 5) descFinal = itemE.descripcion;
        if (itemE.disciplina) discFinal = itemE.disciplina;
        if (revFinal === "EO" && itemE.revision && itemE.revision !== "EO") revFinal = itemE.revision;
      }

      const eventosPlano = mapaEventosHistorico.get(claveUnica) || [];
      eventosPlano.sort((a, b) => a.ts - b.ts);

      const estadoInfo = calcularEstadoPuntualYCircuito(
        { codigo: meta.codigo, revision: revFinal },
        nomArc,
        rutaCarpeta,
        eventosPlano
      );

      if (estadoInfo.estado === "Cerrado" && !rutaCarpeta.toUpperCase().includes("APC")) {
        const resMudanza = moverArchivoACarpetaApcProyecto(idArc, proyNombre);
        if (resMudanza && resMudanza.movido) {
          rutaCarpeta = resMudanza.nuevaRuta;
          hojaLog.getRange(rowIndexZero + 2, 3).setValue(rutaCarpeta);
          estadoInfo.obs = "Sello APC verificado (Movido auto a carpeta APC de " + proyNombre + ")";
        }
      }

      let fechaFinal = fecDrive;
      if (eventosPlano.length > 0) {
        const ultimoEv = eventosPlano[eventosPlano.length - 1];
        if (ultimoEv.fecha) fechaFinal = ultimoEv.fecha;
      }

      const urlPlanoActual = "https://drive.google.com/file/d/" + idArc + "/view";
      const tsActual = parsearFechaAMilisegundos(fechaFinal);

      const existente = archivosRealesPorMaster[nombreHojaDestino].get(claveUnica);
      let historialVersiones = existente ? existente.versiones : [];

      historialVersiones.push({
        rev: revFinal,
        fecha: fecDrive,
        ts: tsActual,
        nombre: nomArc,
        url: urlPlanoActual
      });
      historialVersiones = consolidarVersionesUnicasPorRevision(historialVersiones);

      let usarNuevoComoPrincipal = true;
      if (existente) {
        const cmpRev = compararJerarquiaRevision(revFinal, existente.rev);
        if (cmpRev < 0) {
          usarNuevoComoPrincipal = false;
        } else if (cmpRev === 0 && tsActual < (existente.ts || 0)) {
          usarNuevoComoPrincipal = false;
        }
      }

      if (usarNuevoComoPrincipal) {
        const slaInfo = calcularSemaforoSLA(fechaFinal, estadoInfo.estado, estadoInfo.responsable);
        const textoCol10 = estadoInfo.remitoNota ? `${estadoInfo.remitoNota} (${nomArc})` : nomArc;
        const urlCol10 = estadoInfo.urlNota || urlPlanoActual;

        archivosRealesPorMaster[nombreHojaDestino].set(claveUnica, {
          codigo: meta.codigo,
          desc: descFinal,
          disc: discFinal,
          rev: revFinal,
          ciclo: estadoInfo.ciclo,
          estado: estadoInfo.estado,
          etapa: estadoInfo.etapa,
          resp: estadoInfo.responsable,
          fecha: fechaFinal,
          ts: tsActual,
          remitoTexto: textoCol10,
          url: urlCol10,
          obs: estadoInfo.obs,
          slaEtiqueta: slaInfo.etiqueta,
          slaColorFondo: slaInfo.colorFondo,
          slaColorTexto: slaInfo.colorTexto,
          versiones: historialVersiones
        });
      } else {
        existente.versiones = historialVersiones;
        archivosRealesPorMaster[nombreHojaDestino].set(claveUnica, existente);
      }
    });
  }

  NOMBRES_HOJAS_MASTER.forEach(nomHoja => {
    const hoja = obtenerOCrearHojaMaster(ss, nomHoja);
    const ultFila = hoja.getLastRow();

    if (ultFila >= 2) {
      hoja.getRange(2, 1, ultFila - 1, Math.max(13, hoja.getLastColumn())).clearContent().clearFormat();
    }
    asegurarEncabezadoHoja(hoja);

    const mapaArchivos = archivosRealesPorMaster[nomHoja] || new Map();
    const lista = Array.from(mapaArchivos.values());
    lista.sort((a, b) => a.codigo.localeCompare(b.codigo));

    if (lista.length > 0) {
      const matriz = lista.map(item => {
        const versionesUnicas = consolidarVersionesUnicasPorRevision(item.versiones || []);
        item.versiones = versionesUnicas;
        const textoHist = versionesUnicas
          .map(v => `Rev ${v.rev}${v.fecha ? " (" + v.fecha + ")" : ""}`)
          .join(" | ");
        return [
          item.codigo, item.desc, item.disc, item.rev, item.ciclo,
          item.estado, item.etapa, item.resp, item.fecha, item.remitoTexto,
          item.obs, item.slaEtiqueta || "🟢 En plazo", textoHist
        ];
      });

      hoja.getRange(2, 1, matriz.length, 13)
        .setValues(matriz)
        .setBackground("#ffffff")
        .setFontColor("#000000")
        .setFontSize(10);

      hoja.getRange(2, 4, matriz.length, 1).setHorizontalAlignment("center").setFontWeight("bold");
      hoja.getRange(2, 9, matriz.length, 1).setNumberFormat("@");
      hoja.getRange(2, 12, matriz.length, 1).setFontWeight("bold").setHorizontalAlignment("center");

      for (let r = 0; r < lista.length; r++) {
        const item = lista[r];
        const numFila = r + 2;

        if (item.slaColorFondo && item.slaColorTexto) {
          hoja.getRange(numFila, 12)
            .setBackground(item.slaColorFondo)
            .setFontColor(item.slaColorTexto);
        }

        if (item.url) {
          const rich = SpreadsheetApp.newRichTextValue()
            .setText(item.remitoTexto)
            .setLinkUrl(item.url)
            .build();
          hoja.getRange(numFila, 10).setRichTextValue(rich);
        }

        if (item.versiones && item.versiones.length > 0) {
          const richMulti = construirRichTextMultiRevision(item.versiones);
          if (richMulti) {
            hoja.getRange(numFila, 13).setRichTextValue(richMulti);
          }
        }
      }
    }

    hoja.autoResizeColumns(1, 13);
  });

  generarReporteComparacionElencos();

  SpreadsheetApp.getActiveSpreadsheet().toast(
    "Estados puntuales, Semáforo SLA y links multi-revisión actualizados con éxito.",
    "Completado ✅",
    6
  );
}

function reorganizarPlanosEnHojasCorrectas() {
  limpiarYNormalizarHojasMasterCompleto();
}

/**
 * Impacta una Nota de Pedido, Orden de Servicio o Transmittal extraído con IA tanto en
 * 'Histórico Transmittals' como en la Hoja Master correspondiente para reflejar entregas y devoluciones.
 */
function impactarArchivoEnSheets(ss, datosJson, fechaDrive, urlArchivo, nombreArchivoOriginal, rutaCarpeta) {
  if (!datosJson || !datosJson.documentos || datosJson.documentos.length === 0) return 0;

  if (datosJson.tipo_comunicacion === "PLANO_O_DOCUMENTO_TECNICO" && !datosJson.tiene_sello_apc) {
    return 0;
  }

  // Extraer código limpio de la nota (ej: COMCT2-TU1-00016) desde el JSON, el nombre del archivo o la carpeta
  let remitoNumero = String(datosJson.numero_remito || "").trim();
  const matchCodNota = (nombreArchivoOriginal + " " + rutaCarpeta).match(/(COMCT2[-_A-Z0-9]+|TU1[-_A-Z0-9]+|(?:NP|OS|NI|NE)[-_ ]?\d+)/i);
  if (!remitoNumero || remitoNumero.length > 35) {
    remitoNumero = matchCodNota ? matchCodNota[1].toUpperCase() : nombreArchivoOriginal.replace(/\.[^/.]+$/, "");
  }

  if (/^(?:ET[-_](?:LE|VQ|BR|EB)|L[-_]EB[-_]VQ)[-_](?:OE|OC|OEM|TCYP)/i.test(remitoNumero) && !datosJson.tiene_sello_apc) {
    return 0;
  }

  const fechaDoc = normalizarFechaEstandar(datosJson.fecha) || normalizarFechaEstandar(fechaDrive);
  const rutaU = String(rutaCarpeta || "").toUpperCase();
  const nomArcU = String(nombreArchivoOriginal || "").toUpperCase();

  let emisor = datosJson.emisor || "UTE";
  let receptor = datosJson.receptor || "TRANSNOA / TRANSENER";
  let dictamen = datosJson.dictamen || "Enviado a TRANSNOA / TRANSENER";

  if (
    rutaU.includes("UT - TRANSNOA") ||
    rutaU.includes("UTE - TRANSNOA") ||
    rutaU.includes("NOTAS DE PEDIDO") ||
    nomArcU.includes("COMCT") ||
    nomArcU.includes("TU1") ||
    remitoNumero.toUpperCase().includes("COMCT") ||
    remitoNumero.toUpperCase().includes("TU1")
  ) {
    emisor = "UTE";
    receptor = "TRANSNOA / TRANSENER";
    dictamen = "Enviado a TRANSNOA / TRANSENER";
  } else if (rutaU.includes("ORDENES DE SERVICIO") || nomArcU.startsWith("OS")) {
    emisor = "TRANSNOA / TRANSENER";
    receptor = "UTE";
    dictamen = dictamen.toUpperCase().includes("OBSERV")
      ? "Devuelto por Transportista (Con Observaciones)"
      : "Devolución de TRANSNOA / TRANSENER";
  }

  const tieneSelloApc = datosJson.tiene_sello_apc === true || tieneSelloApcVerificado(nombreArchivoOriginal, "", dictamen);
  if (tieneSelloApc) {
    dictamen = "Apto para Construcción (Sello APC)";
  }

  const hojaHistorico = obtenerHojaHistorico(ss);
  let planosImpactados = 0;

  datosJson.documentos.forEach(doc => {
    const codCrudo = String(doc.codigo || "").trim();
    const descCruda = String(doc.descripcion || "").trim();

    if (!esDocumentoTecnicoEstrictoElenco(codCrudo, descCruda, codCrudo, fechaDoc)) {
      return;
    }

    const meta = desglosarMetadatosDocumento(codCrudo, descCruda);
    const codLimpio = limpiarCodigoPlanoOficial(meta.codigo || codCrudo);
    if (!codLimpio) return;

    const revLimpia = extraerRevisionCanonico(doc.revision || codCrudo, doc.revision);
    const proy = determinarProyectoPorCodigo(codLimpio, meta.descripcion, rutaCarpeta);
    const estado = tieneSelloApc ? "Cerrado" : "Abierto";

    let cicloMov = "Ciclo 1";
    if (
      dictamen.toUpperCase().includes("OBSERV") ||
      dictamen.toUpperCase().includes("DEVUELTO POR TRANSPORTISTA") ||
      dictamen.toUpperCase().includes("CORRECCIÓN") ||
      (revLimpia !== "EO" && revLimpia !== "0")
    ) {
      cicloMov = "Ciclo 2";
    }

    // 1. Registrar evento en Histórico Transmittals
    const idEvento = Utilities.getUuid().slice(0, 8);
    hojaHistorico.appendRow([
      idEvento, proy, codLimpio, meta.descripcion, revLimpia,
      fechaDoc, remitoNumero, emisor, receptor, dictamen, cicloMov, estado
    ]);

    if (urlArchivo) {
      const rich = SpreadsheetApp.newRichTextValue().setText(remitoNumero).setLinkUrl(urlArchivo).build();
      hojaHistorico.getRange(hojaHistorico.getLastRow(), 7).setRichTextValue(rich);
    }

    planosImpactados++;

    // 2. Actualizar inmediatamente la fila en la Hoja Master correspondiente
    const nombreHoja = "Master " + proy;
    const hojaMaster = ss.getSheetByName(nombreHoja);
    if (hojaMaster && hojaMaster.getLastRow() >= 2) {
      const claveBuscada = codLimpio.toUpperCase().replace(/[^A-Z0-9]/g, "");
      const codigosM = hojaMaster.getRange(2, 1, hojaMaster.getLastRow() - 1, 1).getValues();
      for (let i = 0; i < codigosM.length; i++) {
        const cM = limpiarCodigoPlanoOficial(codigosM[i][0]).toUpperCase().replace(/[^A-Z0-9]/g, "");
        if (cM === claveBuscada) {
          const filaM = i + 2;
          hojaMaster.getRange(filaM, 5).setValue(cicloMov);
          hojaMaster.getRange(filaM, 6).setValue(estado);
          hojaMaster.getRange(filaM, 7).setValue(dictamen + (remitoNumero ? ` (${remitoNumero})` : ""));
          hojaMaster.getRange(filaM, 8).setValue(receptor);
          if (fechaDoc) hojaMaster.getRange(filaM, 9).setValue(fechaDoc);
          hojaMaster.getRange(filaM, 11).setValue(tieneSelloApc ? "Sello APC por " + remitoNumero : "Enviado por UTE mediante " + remitoNumero);

          const nuevoSla = calcularSemaforoSLA(fechaDoc, estado, receptor);
          hojaMaster.getRange(filaM, 12)
            .setValue(nuevoSla.etiqueta)
            .setBackground(nuevoSla.colorFondo)
            .setFontColor(nuevoSla.colorTexto);
          break;
        }
      }
    }
  });

  return planosImpactados;
}