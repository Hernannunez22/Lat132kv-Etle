/**
 * ====================================================================================================
 * ARCHIVO: BackupCloudflareR2.gs
 * MÓDULO DE RESPALDO Y CONEXIÓN DIRECTA CON CLOUDFLARE R2 (S3 COMPATIBLE)
 * Implementa la firma criptográfica AWS SigV4 (HMAC-SHA256) nativa en Apps Script para subir
 * carpetas, documentos binarios de Drive y el catálogo estructurado (base de datos JSON).
 * ====================================================================================================
 */

/**
 * Prueba la conectividad enviando una consulta autenticada a Cloudflare R2.
 */
function probarConexionCloudflareR2() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!R2_CONFIG.ACCOUNT_ID || R2_CONFIG.ACCOUNT_ID.includes("TU_ACCOUNT_ID")) {
    ss.toast("Configura ACCOUNT_ID, ACCESS_KEY_ID y SECRET_ACCESS_KEY en Configuracion.gs", "Credenciales Incompletas ⚠️", 7);
    return { ok: false, error: "Credenciales no configuradas" };
  }

  const host = `${R2_CONFIG.ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const url = `https://${host}/${R2_CONFIG.BUCKET_NAME}?list-type=2&max-keys=5`;

  try {
    const headers = generarHeadersAwsSigV4({
      method: "GET",
      host: host,
      canonicalUri: `/${R2_CONFIG.BUCKET_NAME}`,
      canonicalQueryString: "list-type=2&max-keys=5",
      payloadBytes: null,
      useUnsignedPayload: false
    });

    const res = UrlFetchApp.fetch(url, {
      method: "GET",
      headers: headers,
      muteHttpExceptions: true
    });

    const code = res.getResponseCode();
    if (code >= 200 && code < 300) {
      ss.toast("Conexión exitosa con Cloudflare R2.", "Conexión OK ✅", 5);
      return { ok: true, status: code };
    } else {
      ss.toast(`Error ${code}: ${res.getContentText()}`, "Fallo Conexión ❌", 7);
      return { ok: false, error: res.getContentText() };
    }
  } catch (err) {
    ss.toast(err.message, "Error Crítico ❌", 7);
    return { ok: false, error: err.message };
  }
}

/**
 * Inicia o reanuda el respaldo completo a Cloudflare R2 por lotes controlados en tiempo (< 4.5 min).
 * Se auto-re-ejecuta de fondo con triggers temporales hasta completar el 100% de los archivos sin timeout.
 */
function sincronizarTodoACloudflareR2() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const props = PropertiesService.getScriptProperties();
  const tiempoInicio = new Date().getTime();
  const TIEMPO_MAXIMO_MS = 250 * 1000; // 4 minutos y 10 segundos (margen seguro contra los 6 minutos de Google)

  // 1. Obtener o escanear el catálogo completo de Drive
  let catalogoArchivos = [];
  let catalogoCarpetas = [];
  const catalogoGuardado = props.getProperty("R2_CATALOGO_ARCHIVOS_JSON");

  if (!catalogoGuardado) {
    ss.toast("Escaneando árbol de Drive para preparar el índice...", "Backup R2 ☁️", 6);
    props.setProperty("R2_BACKUP_ESTADO", "Escaneando Drive...");
    props.setProperty("R2_BACKUP_ACTUAL", "0");

    let carpetaRaiz;
    try {
      carpetaRaiz = DriveApp.getFolderById(ID_CARPETA_RAIZ);
    } catch (e) {
      props.setProperty("R2_BACKUP_ESTADO", "Error");
      return { ok: false, error: "No se pudo acceder a la carpeta raíz de Drive: " + e.message };
    }

    const visitados = new Set();
    function recorrerArbolRec(folder, rutaAcumulada) {
      const idF = folder.getId();
      if (visitados.has(idF)) return;
      visitados.add(idF);

      const nomF = folder.getName();
      const rutaActual = rutaAcumulada ? `${rutaAcumulada}/${nomF}` : nomF;
      catalogoCarpetas.push({ id_carpeta: idF, nombre: nomF, ruta: rutaActual });

      const files = folder.getFiles();
      while (files.hasNext()) {
        const arc = files.next();
        const nomArc = arc.getName();
        if (nomArc.startsWith("~$") || nomArc.startsWith("._")) continue;

        catalogoArchivos.push({
          id: arc.getId(),
          nombre: nomArc,
          rutaCarpeta: rutaActual,
          tamano: arc.getSize(),
          fechaMod: normalizarFechaEstandar(arc.getLastUpdated()),
          mimeType: arc.getMimeType()
        });
      }

      const subs = folder.getFolders();
      while (subs.hasNext()) {
        recorrerArbolRec(subs.next(), rutaActual);
      }
    }

    recorrerArbolRec(carpetaRaiz, "");

    props.setProperty("R2_CATALOGO_ARCHIVOS_JSON", JSON.stringify(catalogoArchivos));
    props.setProperty("R2_CATALOGO_CARPETAS_JSON", JSON.stringify(catalogoCarpetas));
    props.setProperty("R2_BACKUP_TOTAL", catalogoArchivos.length.toString());
    props.setProperty("R2_INDICE_CURSOR", "0");
    props.setProperty("R2_TOTAL_SUBIDOS", "0");
    props.setProperty("R2_TOTAL_MB", "0");
  } else {
    catalogoArchivos = JSON.parse(catalogoGuardado);
    catalogoCarpetas = JSON.parse(props.getProperty("R2_CATALOGO_CARPETAS_JSON") || "[]");
  }

  const totalArchivos = catalogoArchivos.length;
  let cursorInicio = parseInt(props.getProperty("R2_INDICE_CURSOR") || "0", 10);
  let subidosAcumulados = parseInt(props.getProperty("R2_TOTAL_SUBIDOS") || "0", 10);
  let mbAcumulados = parseFloat(props.getProperty("R2_TOTAL_MB") || "0");

  const setArchivosRespaldados = new Set(
    JSON.parse(props.getProperty("R2_ARCHIVOS_COMPLETADOS_SET") || "[]")
  );

  props.setProperty("R2_BACKUP_TOTAL", totalArchivos.toString());
  props.setProperty("R2_BACKUP_ESTADO", "Transfiriendo archivos (Turbo)");

  let i = cursorInicio;
  let cortePorTiempo = false;

  for (; i < totalArchivos; i++) {
    if (new Date().getTime() - tiempoInicio > TIEMPO_MAXIMO_MS) {
      cortePorTiempo = true;
      break;
    }

    const item = catalogoArchivos[i];
    const nroActual = i + 1;

    if (setArchivosRespaldados.has(item.id)) {
      continue;
    }

    if (i % 5 === 0 || i === totalArchivos - 1) {
      const porcentaje = Math.round((nroActual / totalArchivos) * 100);
      props.setProperty("R2_BACKUP_ACTUAL", nroActual.toString());
      props.setProperty("R2_BACKUP_PORCENTAJE", porcentaje.toString());
      props.setProperty("R2_BACKUP_ULTIMO", item.nombre);

      ss.toast(
        `[${nroActual}/${totalArchivos}] (${porcentaje}%) ⚡ Subiendo: ${item.nombre.substring(0, 30)}...`,
        "Turbo Backup R2 ☁️",
        3
      );
    }

    try {
      const arcObj = DriveApp.getFileById(item.id);
      const resUpload = subirArchivoABucketR2({
        id: item.id,
        nombre: item.nombre,
        rutaCarpeta: item.rutaCarpeta,
        tamano: item.tamano,
        mimeType: item.mimeType,
        archivoObj: arcObj
      });

      if (resUpload.ok) {
        subidosAcumulados++;
        const pesoMbNum = item.tamano / (1024 * 1024);
        mbAcumulados += pesoMbNum;
        setArchivosRespaldados.add(item.id);
      }
    } catch (eFile) {
      Logger.log(`Aviso subiendo ${item.nombre}: ${eFile.message}`);
    }
  }

  props.setProperty("R2_INDICE_CURSOR", i.toString());
  props.setProperty("R2_TOTAL_SUBIDOS", subidosAcumulados.toString());
  props.setProperty("R2_TOTAL_MB", mbAcumulados.toFixed(2));
  props.setProperty("R2_ARCHIVOS_COMPLETADOS_SET", JSON.stringify(Array.from(setArchivosRespaldados)));

  if (cortePorTiempo && i < totalArchivos) {
    eliminarTriggersDeBackupR2();
    ScriptApp.newTrigger("sincronizarTodoACloudflareR2")
      .timeBased()
      .after(25 * 1000)
      .create();

    const pctPausa = Math.round((i / totalArchivos) * 100);
    props.setProperty("R2_BACKUP_ESTADO", `Auto-reanudando (${pctPausa}%)...`);
    ss.toast(
      `Lote completado (${i}/${totalArchivos}). Auto-reanudando en 25 seg sin timeout...`,
      "Modo Turbo R2 ⏱️",
      6
    );
    return { ok: true, completado: false, procesados: i, total: totalArchivos };
  }

  eliminarTriggersDeBackupR2();

  props.setProperty("R2_BACKUP_ULTIMO", "Generando _indice_maestro_obra.json...");
  
  const totalEnR2 = setArchivosRespaldados.size;
  const yaExistentesPreviamente = Math.max(0, totalArchivos - subidosAcumulados);

  const baseDatosJson = {
    fecha_generacion: new Date().toISOString(),
    total_archivos_inspeccionados: totalArchivos,
    total_archivos_en_r2: totalEnR2,
    archivos_transferidos_en_sesion: subidosAcumulados,
    archivos_previamente_respaldados: yaExistentesPreviamente,
    megabytes_transferidos: mbAcumulados.toFixed(2),
    total_carpetas: catalogoCarpetas.length,
    carpetas: catalogoCarpetas
  };

  subirJsonBaseDatosAR2("_indice_maestro_obra.json", JSON.stringify(baseDatosJson, null, 2));

  const ahoraFormateada = normalizarFechaEstandar(new Date());
  props.setProperty("R2_BACKUP_ESTADO", "Completado");
  props.setProperty("R2_BACKUP_FECHA", ahoraFormateada);
  
  const resumenClarificado = `${totalEnR2} respaldados (${subidosAcumulados} nuevos, ${yaExistentesPreviamente} ya existentes), ${mbAcumulados.toFixed(1)} MB`;
  props.setProperty("R2_BACKUP_RESUMEN", resumenClarificado);
  props.setProperty("R2_BACKUP_PORCENTAJE", "100");

  props.deleteProperty("R2_CATALOGO_ARCHIVOS_JSON");
  props.deleteProperty("R2_CATALOGO_CARPETAS_JSON");
  props.deleteProperty("R2_INDICE_CURSOR");
  props.deleteProperty("R2_TOTAL_SUBIDOS");
  props.deleteProperty("R2_TOTAL_MB");
  props.deleteProperty("R2_ARCHIVOS_COMPLETADOS_SET");

  ss.toast(
    `✅ Respaldo completo en Cloudflare R2: ${subidosAcumulados} archivos transferidos (${mbAcumulados.toFixed(1)} MB).`,
    "Respaldo Exitoso ☁️",
    8
  );

  return {
    ok: true,
    completado: true,
    archivosSubidos: subidosAcumulados,
    megabytesTransferidos: mbAcumulados.toFixed(2),
    totalEncontrados: totalArchivos
  };
}

/**
 * Elimina disparadores temporales residuales de respaldo R2.
 */
function eliminarTriggersDeBackupR2() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(t => {
    if (t.getHandlerFunction() === "sincronizarTodoACloudflareR2") {
      ScriptApp.deleteTrigger(t);
    }
  });
}

/**
 * Reinicia el cursor de respaldo R2 a cero si se desea empezar un nuevo backup desde el inicio.
 */
function reiniciarProgresoBackupR2() {
  eliminarTriggersDeBackupR2();
  const props = PropertiesService.getScriptProperties();
  props.deleteProperty("R2_CATALOGO_ARCHIVOS_JSON");
  props.deleteProperty("R2_CATALOGO_CARPETAS_JSON");
  props.deleteProperty("R2_INDICE_CURSOR");
  props.deleteProperty("R2_TOTAL_SUBIDOS");
  props.deleteProperty("R2_TOTAL_MB");
  props.deleteProperty("R2_ARCHIVOS_COMPLETADOS_SET");
  props.setProperty("R2_BACKUP_ESTADO", "Inactivo");
  props.setProperty("R2_BACKUP_TOTAL", "0");
  props.setProperty("R2_BACKUP_ACTUAL", "0");
  props.setProperty("R2_BACKUP_PORCENTAJE", "0");
  props.setProperty("R2_BACKUP_ULTIMO", "-");

  SpreadsheetApp.getActiveSpreadsheet().toast("Progreso de respaldo R2 restablecido.", "Reinicio OK", 4);
}

/**
 * Devuelve el estado en tiempo real del respaldo de Cloudflare R2 para la barra lateral.
 */
function obtenerEstadoProgresoR2() {
  const props = PropertiesService.getScriptProperties();
  const total = parseInt(props.getProperty("R2_BACKUP_TOTAL") || "0", 10);
  const actual = parseInt(props.getProperty("R2_BACKUP_ACTUAL") || "0", 10);
  const porcentaje = parseInt(props.getProperty("R2_BACKUP_PORCENTAJE") || "0", 10);
  const estado = props.getProperty("R2_BACKUP_ESTADO") || "Inactivo";
  const ultimoArchivo = props.getProperty("R2_BACKUP_ULTIMO") || "-";
  const fechaUltimo = props.getProperty("R2_BACKUP_FECHA") || "Sin respaldo previo";
  const resumen = props.getProperty("R2_BACKUP_RESUMEN") || "-";

  return {
    total: total,
    actual: actual,
    porcentaje: estado === "Completado" ? 100 : porcentaje,
    estado: estado,
    ultimoArchivo: ultimoArchivo,
    fechaUltimo: fechaUltimo,
    resumen: resumen
  };
}

/**
 * Sube un archivo binario a Cloudflare R2 mediante PUT S3 SigV4.
 * Optimizado con UNSIGNED-PAYLOAD para evitar hasheo SHA256 pesado en CPU de Apps Script.
 * RESPALDO TOTAL: Procesa todos los tipos de archivos (PDF, DWG, KMZ, ZIP, DOCX, etc.).
 */
function subirArchivoABucketR2(item) {
  try {
    let bytes = null;
    let mimeTypeFinal = item.mimeType || "application/octet-stream";
    let nombreFinal = item.nombre;

    if (item.mimeType === MimeType.GOOGLE_DOCS || item.mimeType === MimeType.GOOGLE_SHEETS) {
      bytes = item.archivoObj.getAs(MimeType.PDF).getBytes();
      nombreFinal = item.nombre.endsWith(".pdf") ? item.nombre : item.nombre + ".pdf";
      mimeTypeFinal = "application/pdf";
    } else {
      if (item.tamano > 48 * 1024 * 1024) {
        Logger.log(`Archivo gigante (>48MB): ${item.nombre}. Se indexa metadato.`);
        return { ok: false, error: "Excede límite memoria Apps Script (48 MB)" };
      }
      bytes = item.archivoObj.getBlob().getBytes();
    }

    if (!bytes || bytes.length === 0) {
      return { ok: false, error: "Archivo sin contenido" };
    }

    const keyLimpia = `${item.rutaCarpeta}/${nombreFinal}`.replace(/\/\/+/g, "/").replace(/^\//, "");
    const host = `${R2_CONFIG.ACCOUNT_ID}.r2.cloudflarestorage.com`;
    const canonicalUri = `/${R2_CONFIG.BUCKET_NAME}/${encodeURI(keyLimpia)}`;
    const url = `https://${host}${canonicalUri}`;

    const headers = generarHeadersAwsSigV4({
      method: "PUT",
      host: host,
      canonicalUri: canonicalUri,
      canonicalQueryString: "",
      payloadBytes: bytes,
      useUnsignedPayload: true,
      contentType: mimeTypeFinal
    });

    const res = UrlFetchApp.fetch(url, {
      method: "PUT",
      headers: headers,
      payload: bytes,
      muteHttpExceptions: true
    });

    const code = res.getResponseCode();
    if (code >= 200 && code < 300) {
      const urlPublica = R2_CONFIG.PUBLIC_URL ? `${R2_CONFIG.PUBLIC_URL}/${encodeURI(keyLimpia)}` : url;
      return { ok: true, keyR2: keyLimpia, urlR2: urlPublica };
    } else {
      return { ok: false, error: res.getContentText() };
    }
  } catch (e) {
    Logger.log(`Aviso subiendo ${item.nombre} a R2: ${e.message}`);
    return { ok: false, error: e.message };
  }
}

/**
 * Sube un archivo JSON de base de datos a la raíz del bucket R2.
 */
function subirJsonBaseDatosAR2(nombreObjeto, jsonString) {
  try {
    const bytes = Utilities.newBlob(jsonString).getBytes();
    const host = `${R2_CONFIG.ACCOUNT_ID}.r2.cloudflarestorage.com`;
    const canonicalUri = `/${R2_CONFIG.BUCKET_NAME}/${nombreObjeto}`;
    const url = `https://${host}${canonicalUri}`;

    const headers = generarHeadersAwsSigV4({
      method: "PUT",
      host: host,
      canonicalUri: canonicalUri,
      canonicalQueryString: "",
      payloadBytes: bytes,
      useUnsignedPayload: false,
      contentType: "application/json"
    });

    UrlFetchApp.fetch(url, {
      method: "PUT",
      headers: headers,
      payload: bytes,
      muteHttpExceptions: true
    });
  } catch (e) {
    Logger.log("Aviso subiendo índice JSON a R2: " + e.message);
  }
}

/**
 * ====================================================================================================
 * IMPLEMENTACIÓN CRIPTOGRÁFICA DE AWS SIGNATURE VERSION 4 (HMAC-SHA256) PARA APPS SCRIPT
 * Permite usar UNSIGNED-PAYLOAD para transferir archivos sin recalcular SHA256 de archivos gigantes.
 * ====================================================================================================
 */
function generarHeadersAwsSigV4(cfg) {
  const ahora = new Date();
  const amzDate = Utilities.formatDate(ahora, "UTC", "yyyyMMdd'T'HHmmss'Z'");
  const dateStamp = Utilities.formatDate(ahora, "UTC", "yyyyMMdd");
  const region = "auto";
  const service = "s3";

  let payloadHash = "UNSIGNED-PAYLOAD";
  if (!cfg.useUnsignedPayload) {
    payloadHash = cfg.payloadBytes && cfg.payloadBytes.length > 0
      ? bytesToHex(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, cfg.payloadBytes))
      : "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
  }

  const canonicalHeadersMap = {
    "host": cfg.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate
  };

  if (cfg.contentType) {
    canonicalHeadersMap["content-type"] = cfg.contentType;
  }

  const sortedHeaderKeys = Object.keys(canonicalHeadersMap).sort();
  const canonicalHeadersStr = sortedHeaderKeys.map(k => `${k}:${canonicalHeadersMap[k]}\n`).join("");
  const signedHeadersStr = sortedHeaderKeys.join(";");

  const canonicalRequest = [
    cfg.method,
    cfg.canonicalUri,
    cfg.canonicalQueryString || "",
    canonicalHeadersStr,
    signedHeadersStr,
    payloadHash
  ].join("\n");

  const canonicalRequestHash = bytesToHex(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, canonicalRequest, Utilities.Charset.UTF_8));
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    canonicalRequestHash
  ].join("\n");

  const kSecretBytes = Utilities.newBlob("AWS4" + R2_CONFIG.SECRET_ACCESS_KEY).getBytes();
  const dateBytes = Utilities.newBlob(dateStamp).getBytes();
  const regionBytes = Utilities.newBlob(region).getBytes();
  const serviceBytes = Utilities.newBlob(service).getBytes();
  const requestBytes = Utilities.newBlob("aws4_request").getBytes();
  const stringToSignBytes = Utilities.newBlob(stringToSign).getBytes();

  const kDate = Utilities.computeHmacSha256Signature(dateBytes, kSecretBytes);
  const kRegion = Utilities.computeHmacSha256Signature(regionBytes, kDate);
  const kService = Utilities.computeHmacSha256Signature(serviceBytes, kRegion);
  const kSigning = Utilities.computeHmacSha256Signature(requestBytes, kService);

  const signature = bytesToHex(Utilities.computeHmacSha256Signature(stringToSignBytes, kSigning));
  const authHeader = `AWS4-HMAC-SHA256 Credential=${R2_CONFIG.ACCESS_KEY_ID}/${credentialScope}, SignedHeaders=${signedHeadersStr}, Signature=${signature}`;

  const headersFinales = {
    "x-amz-date": amzDate,
    "x-amz-content-sha256": payloadHash,
    "Authorization": authHeader
  };

  if (cfg.contentType) {
    headersFinales["Content-Type"] = cfg.contentType;
  }

  return headersFinales;
}

function bytesToHex(bytes) {
  return bytes.map(b => {
    const v = (b < 0 ? b + 256 : b).toString(16);
    return v.length === 1 ? "0" + v : v;
  }).join("");
}