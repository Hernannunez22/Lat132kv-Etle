/**
 * ====================================================================================================
 * ARCHIVO: Configuracion.gs
 * Módulo de configuración global, credenciales seguras, endpoints de Cloudflare R2 y utilidades base.
 * ====================================================================================================
 */

// Clave de respaldo inicial; se migra y lee de forma segura desde PropertiesService
const GEMINI_API_KEY_FALLBACK = "AIzaSyCkQOGyG6Ct-r4_UzwJnmteZul75ddhZ6c";
const ID_CARPETA_RAIZ = "1hRZXHfqmcFdhiHj2Fbx1IV9gCCVX7edw";
const ID_CARPETA_ELENCOS = "1Dmg0tKE6glZR0EYrjujzD_iJCZJnljrj";
const NOMBRE_CARPETA_ELENCOS = "Elenco de documentos de ingeniería";

// Umbrales contractuales de SLA (Días corridos en poder de un actor)
const SLA_DIAS_ALERTA = 10;
const SLA_DIAS_VENCIDO = 15;

/**
 * ====================================================================================================
 * CONFIGURACIÓN DE CONEXIÓN CON CLOUDFLARE R2 (BASE DE DATOS Y STORAGE S3 COMPATIBLE)
 * ====================================================================================================
 */
const R2_CONFIG = {
  ACCOUNT_ID: "e1d197bd1aa5e242733d883eab2a9322",
  ACCESS_KEY_ID: "d3fba158bfaa15e8481f5768f8e5eb9e",
  SECRET_ACCESS_KEY: "23e7e7a9b3fb15347cba3fdab2a0f17c30cef0b508f754509d6a46f6fcd3c480",
  BUCKET_NAME: "backup-obra-132kv",
  PUBLIC_URL: "" // Opcional: dominio público r2.dev si se encuentra habilitado
};

/**
 * Obtiene la API Key de Gemini desde PropertiesService para protegerla de lecturas en el editor.
 */
function obtenerGeminiApiKeySegura() {
  const props = PropertiesService.getScriptProperties();
  let key = props.getProperty("GEMINI_API_KEY");
  if (!key) {
    key = GEMINI_API_KEY_FALLBACK;
    props.setProperty("GEMINI_API_KEY", key);
  }
  return key.trim();
}

/**
 * Permite actualizar la API Key de Gemini desde el menú sin exponerla en el código.
 */
function configurarGeminiApiKeyManual(nuevaKey) {
  if (!nuevaKey || String(nuevaKey).trim().length < 15) {
    return { ok: false, error: "Clave API inválida." };
  }
  PropertiesService.getScriptProperties().setProperty("GEMINI_API_KEY", String(nuevaKey).trim());
  return { ok: true };
}

/**
 * Calcula el estado del Semáforo SLA según la fecha del último evento y el estado del circuito.
 */
function calcularSemaforoSLA(fechaUltimoEventoStr, estadoCircuito, responsableActual) {
  if (String(estadoCircuito || "").toUpperCase() === "CERRADO") {
    return {
      dias: 0,
      nivel: "CERRADO",
      etiqueta: "✅ Cerrado (APC)",
      colorFondo: "#dcfce7",
      colorTexto: "#166534"
    };
  }

  const norm = normalizarFechaEstandar(fechaUltimoEventoStr);
  if (!norm) {
    return {
      dias: 0,
      nivel: "SIN_FECHA",
      etiqueta: "⚪ Sin fecha base",
      colorFondo: "#f1f5f9",
      colorTexto: "#475569"
    };
  }

  const partes = norm.split("/");
  const fechaEvento = new Date(parseInt(partes[2], 10), parseInt(partes[1], 10) - 1, parseInt(partes[0], 10));
  const hoy = new Date();
  const diffMs = Math.max(0, hoy.getTime() - fechaEvento.getTime());
  const dias = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const actorCorto = String(responsableActual || "Inspección").split("(")[0].trim();

  if (dias > SLA_DIAS_VENCIDO) {
    return {
      dias: dias,
      nivel: "VENCIDO",
      etiqueta: `🔴 Vencido (${dias}d en ${actorCorto})`,
      colorFondo: "#fee2e2",
      colorTexto: "#991b1b"
    };
  } else if (dias >= SLA_DIAS_ALERTA) {
    return {
      dias: dias,
      nivel: "ALERTA",
      etiqueta: `🟡 Por vencer (${dias}d en ${actorCorto})`,
      colorFondo: "#fef3c7",
      colorTexto: "#92400e"
    };
  } else {
    return {
      dias: dias,
      nivel: "A_TIEMPO",
      etiqueta: `🟢 En plazo (${dias}d en ${actorCorto})`,
      colorFondo: "#f0fdf4",
      colorTexto: "#15803d"
    };
  }
}

// Lista de correos para notificaciones automáticas y reportes diarios a las 18:00 hs.
const EMAILS_NOTIFICACION = [
  "hernannunez27@gmail.com",
  Session.getActiveUser().getEmail()
];

function obtenerDestinatariosValidos() {
  const unicos = new Set();
  EMAILS_NOTIFICACION.forEach(mail => {
    const m = String(mail || "").trim().toLowerCase();
    if (m && m.includes("@") && !m.includes("ejemplo.com") && !m.includes("destinatario")) {
      unicos.add(m);
    }
  });
  if (unicos.size === 0) {
    unicos.add("hernannunez27@gmail.com");
  }
  return Array.from(unicos).join(",");
}

// Modelos Gemini admitidos para procesamiento multimodal en cascada
const MODELOS_GEMINI = [
  "gemini-2.5-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.6-flash",
  "gemini-3.8-flash"
];

const CABECERAS_MASTER = [
  "CÓDIGO",
  "DESCRIPCIÓN",
  "DISCIPLINA",
  "REV ACTUAL",
  "CICLO ACTUAL",
  "ESTADO CIRCUITO",
  "ETAPA ACTUAL",
  "RESPONSABLE ACTUAL",
  "FECHA ÚLTIMO EVENTO",
  "N° ÚLTIMA NOTA / REMITO",
  "OBSERVACIONES",
  "SEMÁFORO SLA (DÍAS)",
  "HISTORIAL REVS PREVIAS"
];

const NOMBRES_HOJAS_MASTER = [
  "Master ET Leales",
  "Master ET El Bracho",
  "Master ET Villa Quinteros",
  "Master LAT El Bracho - Villa Quinteros"
];

const CABECERAS_HISTORICO = [
  "ID EVENTO",
  "PROYECTO",
  "CÓDIGO",
  "DESCRIPCIÓN",
  "REV",
  "FECHA",
  "N° REMITO",
  "EMISOR",
  "RECEPTOR",
  "DICTAMEN / ACCIÓN",
  "CICLO",
  "ESTADO CIRCUITO"
];

const CABECERAS_REGISTRO_DRIVE = [
  "ID_ARCHIVO",
  "NOMBRE_ARCHIVO",
  "RUTA_CARPETA",
  "FECHA_DRIVE",
  "ESTADO_PROCESADO",
  "FECHA_PROCESADO"
];

function esFechaValidaOficial(fechaInput) {
  if (!fechaInput) return false;

  const str = String(fechaInput).trim().toUpperCase();

  if (
    str.includes("XX") || 
    str.includes("??") || 
    str.includes("00/00") || 
    str.includes("0000") || 
    str.includes("S/F") ||
    str.includes("SIN FECHA") ||
    str.includes("PENDIENTE")
  ) {
    return false;
  }

  if (Object.prototype.toString.call(fechaInput) === "[object Date]" && !isNaN(fechaInput.getTime())) {
    const anio = fechaInput.getFullYear();
    return anio >= 2020 && anio <= 2035;
  }

  const limpio = str.split("T")[0].split(" ")[0].replace(/-/g, "/");
  const partes = limpio.split("/");

  if (partes.length === 3) {
    let dia = 0;
    let mes = 0;
    let anio = 0;

    if (partes[0].length === 4) {
      anio = parseInt(partes[0], 10);
      mes = parseInt(partes[1], 10);
      dia = parseInt(partes[2], 10);
    } else {
      dia = parseInt(partes[0], 10);
      mes = parseInt(partes[1], 10);
      anio = parseInt(partes[2], 10);
      if (anio < 100) anio = 2000 + anio;
    }

    if (!isNaN(dia) && !isNaN(mes) && !isNaN(anio)) {
      if (mes >= 1 && mes <= 12 && dia >= 1 && dia <= 31 && anio >= 2020 && anio <= 2035) {
        return true;
      }
    }
  }

  return false;
}

function normalizarFechaEstandar(fechaInput) {
  if (!fechaInput) return "";

  if (!esFechaValidaOficial(fechaInput)) {
    return "";
  }

  if (Object.prototype.toString.call(fechaInput) === "[object Date]" && !isNaN(fechaInput.getTime())) {
    const d = ("0" + fechaInput.getDate()).slice(-2);
    const m = ("0" + (fechaInput.getMonth() + 1)).slice(-2);
    const y = fechaInput.getFullYear();
    return `${d}/${m}/${y}`;
  }

  let str = String(fechaInput).trim();
  if (str.includes("T")) str = str.split("T")[0];
  if (str.includes(" ")) str = str.split(" ")[0];

  str = str.replace(/-/g, "/");
  const partes = str.split("/");

  if (partes.length === 3) {
    let dia = "";
    let mes = "";
    let anio = "";

    if (partes[0].length === 4) {
      anio = partes[0];
      mes = ("0" + parseInt(partes[1], 10)).slice(-2);
      dia = ("0" + parseInt(partes[2], 10)).slice(-2);
    } else {
      dia = ("0" + parseInt(partes[0], 10)).slice(-2);
      mes = ("0" + parseInt(partes[1], 10)).slice(-2);
      anio = partes[2];
      if (anio.length === 2) anio = "20" + anio;
    }

    return `${dia}/${mes}/${anio}`;
  }

  const parsed = new Date(fechaInput);
  if (!isNaN(parsed.getTime())) {
    const d = ("0" + parsed.getDate()).slice(-2);
    const m = ("0" + (parsed.getMonth() + 1)).slice(-2);
    const y = parsed.getFullYear();
    return `${d}/${m}/${y}`;
  }

  return "";
}

function normalizarTexto(txt) {
  if (!txt) return "";
  return String(txt)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}