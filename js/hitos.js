/**
 * =========================================================================
 * ARCHIVO: js/hitos.js
 * Extractor automático de Hitos desde archivos Excel (.xlsx / .xls / .csv)
 * Adaptado a la matriz real: "CRONOGRAMA DE HITOS / SAE / FECHAS CLAVES - TUCUMAN"
 * Lee tareas en filas y detecta la fecha en las columnas con marca "X".
 * Editor modal de hitos y renderizado del cronograma con cálculo de vencimientos.
 * Prioridad estricta para: Suministros/Provisiones, Equipos O.C., Suelos, Civil,
 * Servidumbres/SAE y Entregables Ponderados (50% y 100% de Proyecto Ejecutivo).
 * =========================================================================
 */

let hitosEnEdicion = [];

function abrirModalEditorHitos() {
  let cargados = (listaHitosLocal && listaHitosLocal.length > 0) ? listaHitosLocal : null;
  if (!cargados || cargados.length === 0) {
    try {
      cargados = JSON.parse(localStorage.getItem('cache_hitos_obra_132kv') || '[]');
    } catch(e) {
      cargados = null;
    }
  }
  if (!cargados || cargados.length === 0) {
    cargados = typeof HITOS_CONTRATUALES_INICIALES_FIJOS !== 'undefined' ? HITOS_CONTRATUALES_INICIALES_FIJOS : obtenerHitosBaseFallback();
  }

  hitosEnEdicion = JSON.parse(JSON.stringify(cargados));
  renderizarFilasEditorHitos();
  const modal = document.getElementById('modalEditorHitos');
  if (modal) modal.classList.remove('hidden');
}

function cerrarModalEditorHitos() {
  const modal = document.getElementById('modalEditorHitos');
  if (modal) modal.classList.add('hidden');
}

/**
 * IMPORTACIÓN Y PARSEO AUTOMÁTICO DE ARCHIVO EXCEL (.xlsx / .xls / .csv)
 * Adaptado a la matriz real: "CRONOGRAMA DE HITOS / SAE / FECHAS CLAVES - TUCUMAN"
 * Lee tareas en filas y detecta la fecha en las columnas con marca "X".
 */
function importarHitosDesdeArchivoExcel(event) {
  const file = event.target.files[0];
  if (!file) return;

  const lblEstado = document.getElementById('lblEstadoLecturaExcel');
  if (lblEstado) {
    lblEstado.innerText = `⏳ Procesando matriz ${file.name}...`;
    lblEstado.classList.remove('hidden');
  }

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array', cellDates: false });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false });

      if (!rows || !Array.isArray(rows) || rows.length < 5) {
        alert("El archivo no contiene suficientes filas.");
        if (lblEstado) lblEstado.classList.add('hidden');
        return;
      }

      // 1. Detectar si es la plantilla matricial con "X" en fechas (filas 5 a 8)
      let filaCabecerasFechas = -1;
      let filaTitulos = -1;

      for (let r = 0; r < Math.min(12, rows.length); r++) {
        const row = rows[r];
        if (!row || !Array.isArray(row)) continue;
        const rowStr = row.map(cell => String(cell || '')).join(' ').toUpperCase();

        if (
          rowStr.includes('DESCRIPCIÓN DE TAREAS') || 
          rowStr.includes('DESCRIPCION DE TAREAS') || 
          (rowStr.includes('HITOS') && rowStr.includes('RUBRO'))
        ) {
          filaTitulos = r;
        }

        // Buscar fila que contenga fechas con barra (ej: 1/10/2025, 15/5/2026, 15/12/2026)
        const cantidadFechas = row.filter(c => {
          const s = String(c || '').trim();
          return /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s);
        }).length;

        if (cantidadFechas >= 4) {
          filaCabecerasFechas = r;
        }
      }

      // Si no encontró la fila de fechas explícitamente, suele estar una fila arriba de los títulos o en la misma
      if (filaCabecerasFechas === -1 && filaTitulos !== -1) {
        filaCabecerasFechas = Math.max(0, filaTitulos - 1);
      }

      const nuevosHitosExtraidos = [];

      // =====================================================================
      // CASO A: MATRIZ CRONOGRAMA DE HITOS TUCUMÁN (Con "X" cruzada con fechas)
      // =====================================================================
      if (filaTitulos !== -1) {
        const headerRowTitulos = rows[filaTitulos] || [];
        const headerRowFechas = (filaCabecerasFechas !== -1 ? rows[filaCabecerasFechas] : headerRowTitulos) || [];

        // Detectar columnas fijas de la izquierda
        let colHito = 0;
        let colHitoNum = 2;
        let colRubro = 3;
        let colDesc = 4;
        let colPlanosArchivo = -1;
        let colCondicionArchivo = -1;

        headerRowTitulos.forEach((val, cIdx) => {
          const valU = String(val || '').trim().toUpperCase();
          if (valU.includes('HITO') && !valU.includes('Nº') && !valU.includes('NUM')) colHito = cIdx;
          if (valU.includes('HITO N') || valU.includes('HITO Nº')) colHitoNum = cIdx;
          if (valU.includes('RUBRO')) colRubro = cIdx;
          if (valU.includes('DESCRIPCIÓN') || valU.includes('DESCRIPCION') || valU.includes('TAREAS')) colDesc = cIdx;
          if (valU.includes('PLANOS') || valU.includes('DOCUMENTOS REQUERIDOS') || valU.includes('PLANOS REQUERIDOS')) colPlanosArchivo = cIdx;
          if (valU.includes('CONDICIÓN') || valU.includes('CONDICION') || valU.includes('OBSERVACIONES')) colCondicionArchivo = cIdx;
        });

        // Mapear todas las columnas que tengan una fecha válida en la fila de fechas
        const mapaColumnasFechas = [];
        headerRowFechas.forEach((celda, cIdx) => {
          if (cIdx <= colDesc) return;
          const s = String(celda || '').trim();
          const fechaIso = convertirFechaCsvAIso(s);
          if (fechaIso && fechaIso !== "2026-12-31" && /^\d{4}-\d{2}-\d{2}$/.test(fechaIso)) {
            mapaColumnasFechas.push({
              colIndex: cIdx,
              fechaTexto: s,
              fechaIso: fechaIso
            });
          }
        });

        // Recorrer las filas de tareas (desde la fila siguiente a los títulos)
        for (let r = filaTitulos + 1; r < rows.length; r++) {
          const row = rows[r];
          if (!row || !Array.isArray(row) || row.length === 0) continue;

          const descTarea = String(row[colDesc] || '').trim();
          if (!descTarea || descTarea.length < 4) continue;

          // Ignorar filas de sumatorias o títulos secundarios
          const descU = descTarea.toUpperCase();
          if (descU.startsWith('TOTAL') || descU.includes('MONTO TOTAL')) continue;

          const hitoGrupo = String(row[colHito] || '').trim();
          const hitoNum = String(row[colHitoNum] || '').trim();
          const rubro = String(row[colRubro] || '').trim();

          // Formateo limpio del código para evitar duplicaciones (ej: no permitir "206-206")
          let codigoHito = "";
          if (hitoGrupo && hitoNum) {
            if (hitoGrupo === hitoNum) {
              codigoHito = `HT-${hitoNum}`;
            } else {
              codigoHito = `${hitoGrupo}-${hitoNum}`;
            }
          } else if (hitoNum) {
            codigoHito = `HT-${hitoNum}`;
          } else if (hitoGrupo) {
            codigoHito = hitoGrupo.startsWith("HT-") ? hitoGrupo : `HT-${hitoGrupo}`;
          } else {
            codigoHito = `HT-${nuevosHitosExtraidos.length + 1}`;
          }

          // Buscar en qué columna de fecha está la "X" (o "x")
          let fechaObjetivoIso = "";
          let fechaTextoOriginal = "";

          for (let m = 0; m < mapaColumnasFechas.length; m++) {
            const colInfo = mapaColumnasFechas[m];
            const celdaValor = String(row[colInfo.colIndex] || '').trim().toUpperCase();
            if (
              celdaValor === 'X' || 
              celdaValor === 'SI' || 
              celdaValor === '1' || 
              celdaValor.includes('X') ||
              celdaValor === '✓' ||
              celdaValor === 'OK'
            ) {
              fechaObjetivoIso = colInfo.fechaIso;
              fechaTextoOriginal = colInfo.fechaTexto;
              break;
            }
          }

          // Si no tiene "X", intentar leer si tiene fecha en observaciones o asignar fecha coherente
          if (!fechaObjetivoIso) {
            const filaStr = row.join(' ');
            const matchFechaObs = filaStr.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
            if (matchFechaObs) {
              fechaObjetivoIso = convertirFechaCsvAIso(matchFechaObs[1]);
              fechaTextoOriginal = matchFechaObs[1];
            } else {
              if (hitoNum === "1" || hitoGrupo.includes("ANT.1")) fechaObjetivoIso = "2025-11-12";
              else if (hitoNum === "2" || hitoGrupo.includes("ANT.2")) fechaObjetivoIso = "2026-06-15";
              else fechaObjetivoIso = "2026-07-15";
            }
          }

          // Deducir frente a partir del texto de la tarea o rubro
          let frenteAsignado = "LAT El Bracho - Villa Quinteros";
          if (descU.includes("ET VQ") || descU.includes("VILLA QUINTEROS") || (hitoGrupo === "ET" && descU.includes("VQ"))) {
            frenteAsignado = "ET Villa Quinteros";
          } else if (descU.includes("ET LE") || descU.includes("LEALES")) {
            frenteAsignado = "ET Leales";
          } else if (descU.includes("ET EB") || (descU.includes("BRACHO") && !descU.includes("LAT"))) {
            frenteAsignado = "ET El Bracho";
          } else if (descU.includes("LAT") || descU.includes("TRAZA") || descU.includes("SERVIDUMBRE") || descU.includes("SAE")) {
            frenteAsignado = "LAT El Bracho - Villa Quinteros";
          }

          // PRIORIDAD 1: Si el archivo Excel ya contiene una columna con los planos requeridos, USARLA DIRECTAMENTE
          let planosReq = [];
          if (colPlanosArchivo !== -1 && row[colPlanosArchivo]) {
            const planosTexto = String(row[colPlanosArchivo]).trim();
            if (planosTexto && planosTexto.length > 2 && !planosTexto.toUpperCase().includes("PLANOS")) {
              planosReq = planosTexto.split(/[,;\n]+/).map(p => p.trim()).filter(Boolean);
            }
          }

          // PRIORIDAD 2: Si no los trae en una columna específica, deducir con rigor según la tarea
          if (planosReq.length === 0) {
            planosReq = deducirPlanosRequeridosPorTarea(descTarea, frenteAsignado);
          }

          const condicionTexto = (colCondicionArchivo !== -1 && row[colCondicionArchivo]) 
            ? String(row[colCondicionArchivo]).trim() 
            : `Rubro: ${rubro || 'General'} | Hito N° ${hitoNum || '-'}`;

          nuevosHitosExtraidos.push({
            id: `HITO-${nuevosHitosExtraidos.length + 1}`,
            codigo: codigoHito,
            nombre: descTarea,
            frente: frenteAsignado,
            fechaObjetivo: fechaObjetivoIso,
            pesoContractual: rubro || "INGENIERÍA",
            responsable: determinarResponsableHito(descTarea, rubro),
            requisitosCriticos: [condicionTexto],
            planosRequeridos: planosReq
          });
        }
      }

      // =====================================================================
      // CASO B: FORMATO CLÁSICO CSV TABULAR (Columnas directas)
      // =====================================================================
      if (nuevosHitosExtraidos.length === 0) {
        const headerRowIndex = encontrarFilaCabeceraExcel(rows);
        const headerRow = Array.isArray(rows[headerRowIndex]) ? rows[headerRowIndex] : [];
        const headers = headerRow.map(h => String(h || '').trim().toUpperCase());

        let colCodigo = headers.findIndex(h => h && (h.includes('COD') || h.includes('CÓD') || h.includes('ID')));
        let colNombre = headers.findIndex(h => h && (h.includes('HITO') || h.includes('TAREA') || h.includes('DESCRIP')));
        let colFecha = headers.findIndex(h => h && (h.includes('FECHA') || h.includes('OBJETIVO') || h.includes('LIMITE')));
        let colFrente = headers.findIndex(h => h && (h.includes('FRENTE') || h.includes('SECTOR') || h.includes('OBRA')));

        if (colCodigo === -1) colCodigo = 0;
        if (colNombre === -1) colNombre = 1;
        if (colFecha === -1) colFecha = 2;
        if (colFrente === -1) colFrente = 3;

        for (let r = headerRowIndex + 1; r < rows.length; r++) {
          const row = rows[r];
          if (!row || !Array.isArray(row) || row.length === 0) continue;

          const codVal = String(row[colCodigo] || '').trim();
          const nomVal = String(row[colNombre] || '').trim();
          const fechaRaw = row[colFecha];

          if (!nomVal || nomVal.length < 3) continue;

          nuevosHitosExtraidos.push({
            id: codVal || `HITO-${nuevosHitosExtraidos.length + 1}`,
            codigo: codVal || `HT-0${nuevosHitosExtraidos.length + 1}`,
            nombre: nomVal,
            frente: String(row[colFrente] || 'LAT El Bracho - Villa Quinteros').trim(),
            fechaObjetivo: convertirFechaCsvAIso(fechaRaw),
            pesoContractual: "15%",
            responsable: determinarResponsableHito(nomVal, ""),
            requisitosCriticos: ["Cumplimiento según cronograma"],
            planosRequeridos: deducirPlanosRequeridosPorTarea(nomVal, String(row[colFrente] || ''))
          });
        }
      }

      if (nuevosHitosExtraidos.length > 0) {
        hitosEnEdicion = nuevosHitosExtraidos;
        listaHitosLocal = nuevosHitosExtraidos;
        // PERSISTENCIA INMEDIATA BLINDADA PARA QUE QUEDE FIJO PERMANENTEMENTE
        try {
          localStorage.setItem('cache_hitos_obra_132kv', JSON.stringify(nuevosHitosExtraidos));
        } catch (eStorage) {}

        renderizarFilasEditorHitos();
        renderizarHitos();

        if (lblEstado) {
          lblEstado.innerText = `✅ Se extrajeron y guardaron exitosamente ${nuevosHitosExtraidos.length} tareas e hitos de tu cronograma.`;
          lblEstado.classList.remove('hidden');
        }
      } else {
        alert("No se pudieron extraer hitos de la plantilla. Verifica que contenga tareas marcadas con 'X' o fechas.");
        if (lblEstado) lblEstado.classList.add('hidden');
      }
    } catch (err) {
      alert("Error procesando archivo de hitos: " + err.message);
      if (lblEstado) lblEstado.classList.add('hidden');
    }
  };
  reader.readAsArrayBuffer(file);
}

/**
 * Deduce con rigor de ingeniería los documentos y planos técnicos aplicables a cada tarea:
 * Discrimina con máxima prioridad:
 * 1. ESTUDIOS ELÉCTRICOS (Etapa I, II, Flujo de Carga)
 * 2. ORDEN DE COMPRA (O.C.) Y PROVISIÓN DE EQUIPOS PESADOS (Transformadores, Reactores, Interruptores)
 * 3. RELEVAMIENTO PLANIALTIMÉTRICO Y CAMINOS DE ACCESO
 * 4. PROVISIÓN DE CONDUCTOR, OPGW, AISLADORES Y MORSETERÍA
 * 5. ESTUDIOS AMBIENTALES (PGA, Capítulo XV)
 * 6. HITOS DE AVANCE PONDERADO DE PROYECTO EJECUTIVO (50%, 100%)
 * 7. ESTUDIOS DE SUELOS Y GEOTECNIA (100% O 50%)
 * 8. SERVIDUMBRES (SAE) Y PERMISOS DE PASO (1/3, 2/3)
 * 9. CRUCES E INTERFERENCIAS
 * 10. OBRA CIVIL: FUNDACIONES, HORMIGÓN H-25, MOVIMIENTO DE SUELOS
 * 11. MALLA DE PUESTA A TIERRA (PAT)
 * 12. TENDIDO Y MONTAJE
 * 13. TELECONTROL, PROTECCIONES, SCADA Y SAT
 */
function deducirPlanosRequeridosPorTarea(descripcion, frente) {
  const dU = String(descripcion || '').toUpperCase();
  const fU = String(frente || '').toUpperCase();

  // =========================================================================
  // 1. ESTUDIOS ELÉCTRICOS Y FLUJO DE POTENCIA (ETAPA I, II, DINÁMICOS)
  // =========================================================================
  if (
    dU.includes("ESTUDIOS ELÉCTRICOS") || 
    dU.includes("ESTUDIOS ELECTRICOS") || 
    dU.includes("ESTUDIO ELÉCTRICO") || 
    dU.includes("ESTUDIO ELECTRICO")
  ) {
    return [
      "ET-LE-OE-MD-001 (Estudio Eléctrico Etapa I/II)", 
      "L-EB-VQ-OE-MD-001 (Flujo de Cargas y Cortocircuito)", 
      "Modelación en PSS/E y DIgSILENT"
    ];
  }

  // =========================================================================
  // 2. ORDEN DE COMPRA (O.C.) Y PROVISIÓN DE EQUIPOS ELECTROMECÁNICOS PESADOS
  // =========================================================================
  if (
    dU.startsWith("O.C.") || 
    dU.includes("O.C.:") || 
    dU.includes("ORDEN DE COMPRA") || 
    dU.includes("TRANSFORMADORES DE POTENCIA") ||
    dU.includes("REACTORES") ||
    dU.includes("SECCIONADORES")
  ) {
    return [
      "ET-LE-OEM-ET-001 (Esp. Transformadores de Potencia)",
      "ET-LE-OEM-ET-002 (Esp. Reactores e Interruptores)",
      "Planilla de Características Técnicas Garantizadas (PTG)",
      "Orden de Compra / Ensayos FAT en Fábrica"
    ];
  }

  // =========================================================================
  // 3. RELEVAMIENTO PLANIALTIMÉTRICO Y CAMINOS DE ACCESO
  // =========================================================================
  if (
    dU.includes("RELEVAMIENTO PLANIALTIMÉTRICO") || 
    dU.includes("RELEVAMIENTO PLANIALTIMETRICO") || 
    dU.includes("CAMINOS DE ACCESO")
  ) {
    return [
      "L-EB-VQ-OC-PL-500 (Planialtimetría Traza)",
      "L-EB-VQ-OC-MD-503 (Caminos de Acceso y Obrador)",
      "Archivo Digital Georreferenciado (.KMZ / .KML)"
    ];
  }

  // =========================================================================
  // 4. PROVISIÓN DE MATERIALES, COMPRAS Y SUMINISTROS DE LÍNEA
  // =========================================================================
  if (
    dU.includes("PROVISIÓN") || 
    dU.includes("PROVISION") || 
    dU.includes("COMPRA") || 
    dU.includes("SUMINISTRO") || 
    dU.includes("ADQUISICIÓN") ||
    dU.includes("ADQUISICION")
  ) {
    if (dU.includes("CONDUCTOR") && !dU.includes("GUARDIA") && !dU.includes("OPGW")) {
      return ["L-EB-VQ-OEM-ET-001 (Esp. Conductor Al/Ac)", "L-EB-VQ-OEM-PL-510 (Tabla Tensado)"];
    }
    if (dU.includes("GUARDIA") || dU.includes("OPGW") || dU.includes("A°G°") || dU.includes("AG°") || dU.includes("FIBRA")) {
      return ["L-EB-VQ-OEM-ET-002 (Esp. Cable Guardia y OPGW)", "L-EB-VQ-TCYP-PL-100 (Empalmes FO)"];
    }
    if (dU.includes("AISLADOR") || dU.includes("CADENA")) {
      return ["L-EB-VQ-OEM-PL-301 (Cadenas Suspensión y Retención)", "L-EB-VQ-OEM-ET-003"];
    }
    if (dU.includes("MORSETERÍA") || dU.includes("MORSETERIA") || dU.includes("HERRAJE") || dU.includes("AMORTIGUADOR")) {
      return ["L-EB-VQ-OEM-PL-300 (Conjunto Morsetería)", "L-EB-VQ-OEM-PL-302 (Amortiguadores Stockbridge)"];
    }
    if (dU.includes("TRANSFORMADOR") || dU.includes("TRAFO") || dU.includes("REACTOR")) {
      if (fU.includes("LEALES")) return ["ET-LE-OEM-PL-300 (Disp. Trafo)", "ET-LE-OC-PL-505 (Bases H°A°)"];
      return ["ET-VQ-OEM-PL-300 (Disp. Trafo)", "ET-VQ-OC-PL-505 (Bases H°A°)"];
    }
    if (dU.includes("INTERRUPTOR") || dU.includes("SECCIONADOR") || dU.includes("DESCARGADOR") || dU.includes("EQUIPOS")) {
      return ["ET-LE-OEM-PL-310 (Equipos 132 kV)", "ET-LE-OEM-PL-311"];
    }
    if (dU.includes("ESTRUCTURA") || dU.includes("POSTE") || dU.includes("TORRE")) {
      return ["L-EB-VQ-OEM-PL-200 (Arboladura Estructuras)", "L-EB-VQ-OC-PL-501 (Fundaciones)"];
    }
    return ["Especificación Técnica de Suministro / Orden de Compra"];
  }

  // =========================================================================
  // 5. ESTUDIOS AMBIENTALES Y GESTIÓN AMBIENTAL (CAPÍTULO XV)
  // =========================================================================
  if (
    dU.includes("AMBIENTAL") || 
    dU.includes("AMBIENTALES") || 
    dU.includes("PGA") || 
    dU.includes("CAPÍTULO XV") || 
    dU.includes("CAPITULO XV")
  ) {
    return [
      "PET-PGA-132KV (Plan de Gestión Ambiental)", 
      "Estudio de Impacto Ambiental (EsIA)", 
      "Plan de Gestión de Residuos de Obrador"
    ];
  }

  // =========================================================================
  // 6. HITOS DE AVANCE PONDERADO DE PROYECTO EJECUTIVO (50%, 100%, ELENCOS)
  // =========================================================================
  if (
    dU.includes("PROYECTO EJECUTIVO") || 
    dU.includes("INGENIERÍA EJECUTIVA") || 
    dU.includes("INGENIERIA EJECUTIVA") ||
    dU.includes("PROYECTO DE ADECUACION") ||
    dU.includes("PROYECTO DE ADECUACIÓN")
  ) {
    if (dU.includes("50%")) {
      if (fU.includes("LAT") || dU.includes("LAT")) {
        return [
          "50% Elenco LAT (86/173 Planos)", 
          "L-EB-VQ-OC-PL-500 (Traza)", 
          "L-EB-VQ-OC-MD-501 (Suelos)", 
          "L-EB-VQ-OEM-PL-300 (Montaje)", 
          "L-EB-VQ-OC-PL-011 (Cruces)"
        ];
      }
      if (fU.includes("QUINTEROS") || dU.includes("VQ")) {
        return [
          "50% Elenco ET VQ (141/282 Planos)", 
          "ET-VQ-OC-MD-510 (Civil)", 
          "ET-VQ-OEM-PL-313 (Malla PAT)", 
          "ET-VQ-TCYP-PL-100 (Unifilar)"
        ];
      }
      if (fU.includes("LEALES") || dU.includes("LEALES")) {
        return [
          "50% Elenco ET Leales (265/529 Planos)", 
          "ET-LE-OC-MD-513 (Suelos)", 
          "ET-LE-OC-PL-501 (Planimetría)", 
          "ET-LE-OEM-PL-300 (Disposición)"
        ];
      }
      return ["50% Elenco Ejecutivo Emitido"];
    }

    if (dU.includes("100%")) {
      if (fU.includes("LAT") || dU.includes("LAT")) return ["100% Elenco LAT (173 Planos Emitidos)"];
      if (fU.includes("QUINTEROS") || dU.includes("VQ")) return ["100% Elenco ET VQ (282 Planos Emitidos)"];
      if (fU.includes("LEALES") || dU.includes("LEALES")) return ["100% Elenco ET Leales (529 Planos Emitidos)"];
      return ["100% Elenco Ejecutivo Emitido"];
    }

    if (fU.includes("QUINTEROS") || dU.includes("VQ")) {
      return ["ET-VQ-OC-MD-510 (Adecuación Civil)", "ET-VQ-OC-PL-500 (Accesos)"];
    }
  }

  // =========================================================================
  // 7. ESTUDIOS DE SUELOS Y GEOTECNIA (100% O 50%)
  // =========================================================================
  if (
    dU.includes("ESTUDIOS DE SUELO") || 
    dU.includes("ESTUDIO DE SUELOS") || 
    dU.includes("ESTUDIO DE SUELO") || 
    dU.includes("GEOTECN")
  ) {
    if (fU.includes("QUINTEROS") || dU.includes("VQ")) {
      return ["ET-VQ-OC-MD-510 (Mecánica de Suelos ET VQ)", "Perfiles Estratigráficos"];
    }
    if (fU.includes("LEALES") || dU.includes("LEALES")) {
      return ["ET-LE-OC-MD-513 (Mecánica de Suelos ET Leales)", "Protocolos Geotécnicos"];
    }
    if (fU.includes("BRACHO") || dU.includes("ET EB") || dU.includes("BRACHO")) {
      return ["ET-BR-OC-MD-501 (Estudio de Suelos ET EB)"];
    }
    return ["L-EB-VQ-OC-MD-501 (Estudio Geotécnico Traza LAT)"];
  }

  // =========================================================================
  // 8. SERVIDUMBRES (SAE) Y PERMISOS DE PASO (1/3, 2/3, NOTIFICACIONES)
  // =========================================================================
  if (
    dU.includes("PERMISOS DE PASO") || 
    dU.includes("PERMISO DE PASO") || 
    dU.includes("SAE") || 
    dU.includes("SERVIDUMBRE")
  ) {
    return [
      "L-EB-VQ-OC-PL-500 (Traza y Parcelario)", 
      "L-EB-VQ-OC-PN-002 (Plano Catastral)", 
      "Actas de Notificación Propietarios"
    ];
  }

  // =========================================================================
  // 9. CRUCES E INTERFERENCIAS
  // =========================================================================
  if (
    dU.includes("CRUCE") || 
    dU.includes("INTERFERENCIA") || 
    dU.includes("GASODUCTO") || 
    dU.includes("RUTA") || 
    dU.includes("FERROCARRIL")
  ) {
    return ["L-EB-VQ-OC-PL-011 (Perfil Cruce)", "L-EB-VQ-OEM-MD-300 (PAT Catódica)"];
  }

  // =========================================================================
  // 10. OBRA CIVIL: FUNDACIONES, HORMIGÓN H-25, MOVIMIENTO DE SUELOS
  // =========================================================================
  if (
    dU.includes("FUNDACION") || 
    dU.includes("FUNDACIONES") || 
    dU.includes("HORMIGÓN") || 
    dU.includes("HORMIGON") || 
    dU.includes("H-25")
  ) {
    if (fU.includes("LEALES") || dU.includes("LEALES")) {
      return ["ET-LE-OC-PL-501 (Fundaciones)", "ET-LE-OC-PL-505 (Bases H°A°)"];
    }
    if (fU.includes("QUINTEROS") || dU.includes("VQ")) {
      return ["ET-VQ-OC-PL-501", "ET-VQ-OC-MD-510"];
    }
    return ["L-EB-VQ-OC-PL-501 (Fundaciones LAT)", "L-EB-VQ-OC-PL-502"];
  }

  if (
    dU.includes("DESMONTE") || 
    dU.includes("APERTURA") || 
    dU.includes("NIVELACIÓN") || 
    dU.includes("NIVELACION") || 
    dU.includes("MOVIMIENTO")
  ) {
    if (fU.includes("LAT") || dU.includes("LAT")) {
      return ["L-EB-VQ-OC-PL-500 (Progresivas y Vértices)", "L-EB-VQ-OC-MD-503 (Caminos de Acceso)"];
    }
    if (fU.includes("BRACHO") || dU.includes("BRACHO")) {
      return ["ET-BR-OC-PL-500 (Planimetría y Altimetría Plataforma)"];
    }
    return ["ET-LE-OC-PL-500 (Movimiento de Suelos y Nivelación)"];
  }

  // =========================================================================
  // 11. MALLA DE PUESTA A TIERRA (PAT)
  // =========================================================================
  if (dU.includes("PAT") || dU.includes("PUESTA A TIERRA") || dU.includes("MALLA")) {
    if (fU.includes("QUINTEROS") || dU.includes("VQ")) {
      return ["ET-VQ-OEM-PL-313 (Malla PAT)"];
    }
    if (fU.includes("LEALES")) {
      return ["ET-LE-OEM-PL-313 (Malla PAT)"];
    }
    return ["L-EB-VQ-OEM-MD-300 (PAT Estructuras)"];
  }

  // =========================================================================
  // 12. TENDIDO Y MONTAJE
  // =========================================================================
  if (dU.includes("TENDIDO") || dU.includes("MONTAJE") || dU.includes("FLECHADO") || dU.includes("TIRADO")) {
    return ["L-EB-VQ-OEM-PL-300 (Montaje)", "L-EB-VQ-OC-PL-510 (Tabla Tensado)"];
  }

  // =========================================================================
  // 13. TELECONTROL, PROTECCIONES, SCADA Y SAT
  // =========================================================================
  if (
    dU.includes("SCADA") || 
    dU.includes("SAT") || 
    dU.includes("TELECONTROL") || 
    dU.includes("PROTECCION") || 
    dU.includes("PROTECCIÓN")
  ) {
    return ["ET-VQ-TCYP-PL-100 (Unifilar)", "ET-VQ-TCYP-DG-001 (Arquitectura)"];
  }

  // =========================================================================
  // 14. TAREAS ADMINISTRATIVAS O CONTRACTUALES
  // =========================================================================
  if (
    dU.includes("FIDEICOMISO") || 
    dU.includes("OBRADOR") || 
    dU.includes("GESTION") || 
    dU.includes("GESTIÓN") || 
    dU.includes("CONTRATO")
  ) {
    return ["Documentación Administrativa / Contractual"];
  }

  // =========================================================================
  // FALLBACK POR FRENTE (SOLO SI NINGUNA CONDICIÓN ANTERIOR COINCIDIÓ)
  // =========================================================================
  if (fU.includes("LAT")) return ["L-EB-VQ-OC-PL-500 (Traza General)"];
  if (fU.includes("LEALES")) return ["ET-LE-OC-PL-501 (Plano General)"];
  if (fU.includes("QUINTEROS") || fU.includes("VQ")) return ["ET-VQ-OC-MD-510 (Memoria General)"];
  if (fU.includes("BRACHO")) return ["ET-BR-OEM-PL-300 (Disposición General)"];

  return ["Documentación Técnica Contractual"];
}

function encontrarFilaCabeceraExcel(rows) {
  if (!rows || !Array.isArray(rows)) return 0;
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    const row = rows[i];
    if (!row || !Array.isArray(row)) continue;
    const rowStr = row.map(cell => String(cell || '')).join(' ').toUpperCase();
    if (
      (rowStr.includes('CÓDIGO') || rowStr.includes('CODIGO')) &&
      (rowStr.includes('HITO') || rowStr.includes('TAREA')) &&
      (rowStr.includes('FECHA'))
    ) {
      return i;
    }
  }
  return 0;
}

/**
 * Convierte formatos como "15/12/2026", "28/02/2027", "2026-12-15" o números seriales de Excel
 * al formato estricto ISO "YYYY-MM-DD" que exige el elemento <input type="date">.
 */
function convertirFechaCsvAIso(fechaInput) {
  if (!fechaInput) return "2026-12-31";

  // Si ya es un objeto Date
  if (fechaInput instanceof Date && !isNaN(fechaInput.getTime())) {
    const y = fechaInput.getFullYear();
    const m = String(fechaInput.getMonth() + 1).padStart(2, '0');
    const d = String(fechaInput.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // Si es un número serial de Excel (ej: 46350)
  if (typeof fechaInput === 'number' || (!isNaN(fechaInput) && !String(fechaInput).includes('/') && !String(fechaInput).includes('-'))) {
    const num = parseFloat(fechaInput);
    if (num > 30000 && num < 60000) {
      const dt = new Date((num - 25569) * 86400 * 1000);
      if (!isNaN(dt.getTime())) {
        const y = dt.getUTCFullYear();
        const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
        const d = String(dt.getUTCDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
      }
    }
  }

  const str = String(fechaInput).trim();

  // Caso formato argentino "DD/MM/YYYY" o "DD-MM-YYYY"
  const matchDmy = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/);
  if (matchDmy) {
    const dia = matchDmy[1].padStart(2, '0');
    const mes = matchDmy[2].padStart(2, '0');
    const anio = matchDmy[3];
    return `${anio}-${mes}-${dia}`;
  }

  // Caso formato ISO "YYYY-MM-DD"
  const matchYmd = str.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/);
  if (matchYmd) {
    const anio = matchYmd[1];
    const mes = matchYmd[2].padStart(2, '0');
    const dia = matchYmd[3].padStart(2, '0');
    return `${anio}-${mes}-${dia}`;
  }

  return "2026-12-31";
}

function determinarResponsableHito(nombreHito, condicion) {
  const txt = (nombreHito + " " + condicion).toUpperCase();
  if (txt.includes("TRANSNOA") || txt.includes("SUPERVISIÓN") || txt.includes("SUPERVISION")) {
    return "TRANSNOA / Inspección";
  }
  if (txt.includes("PERMISO") || txt.includes("INTERFERENCIA") || txt.includes("DNV") || txt.includes("TGN")) {
    return "UTE (Gestión Permisos)";
  }
  if (txt.includes("OBRA CIVIL") || txt.includes("HORMIGÓN") || txt.includes("FUNDACION")) {
    return "Contratista Obra Civil";
  }
  if (txt.includes("MONTAJE") || txt.includes("TENDIDO") || txt.includes("CONDUCTOR")) {
    return "Contratista Montaje";
  }
  if (txt.includes("ENERGIZACIÓN") || txt.includes("COD") || txt.includes("COMERCIAL")) {
    return "Comitente / UTE / TRANSNOA";
  }
  return "UTE / Contratista";
}

function renderizarFilasEditorHitos() {
  const cont = document.getElementById('listaEditorHitosContenedor');
  if (!cont) return;
  cont.innerHTML = '';

  hitosEnEdicion.forEach((h, idx) => {
    const fila = `
      <div class="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5">
        <div class="flex items-center justify-between gap-2">
          <input 
            type="text" 
            value="${h.codigo || ('H-0' + (idx+1))}" 
            onchange="actualizarDatoHito(${idx}, 'codigo', this.value)"
            class="w-24 bg-slate-900 border border-slate-700 text-amber-400 font-mono font-bold text-xs p-1.5 rounded-lg"
            placeholder="H-01"
          />
          <input 
            type="text" 
            value="${h.nombre || ''}" 
            onchange="actualizarDatoHito(${idx}, 'nombre', this.value)"
            class="flex-1 bg-slate-900 border border-slate-700 text-white font-semibold text-xs p-1.5 rounded-lg"
            placeholder="Nombre del hito..."
          />
          <button onclick="eliminarFilaHito(${idx})" class="text-rose-400 hover:text-rose-300 font-bold text-xs px-2" title="Eliminar este hito">✕</button>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
          <div>
            <label class="block text-[10px] text-slate-400 mb-0.5">Fecha Objetivo:</label>
            <input 
              type="date" 
              value="${h.fechaObjetivo || '2026-11-20'}" 
              onchange="actualizarDatoHito(${idx}, 'fechaObjetivo', this.value)"
              class="w-full bg-slate-900 border border-slate-700 text-slate-200 text-xs p-1.5 rounded-lg font-mono"
            />
          </div>
          <div>
            <label class="block text-[10px] text-slate-400 mb-0.5">Frente de Obra:</label>
            <input 
              type="text" 
              value="${h.frente || 'LAT 132 kV'}" 
              onchange="actualizarDatoHito(${idx}, 'frente', this.value)"
              class="w-full bg-slate-900 border border-slate-700 text-slate-200 text-xs p-1.5 rounded-lg"
            />
          </div>
          <div>
            <label class="block text-[10px] text-slate-400 mb-0.5">Planos Requeridos (separados por coma):</label>
            <input 
              type="text" 
              value="${(h.planosRequeridos || []).join(', ')}" 
              onchange="actualizarPlanosHito(${idx}, this.value)"
              class="w-full bg-slate-900 border border-slate-700 text-slate-200 text-xs p-1.5 rounded-lg font-mono"
              placeholder="PL-500, PL-011"
            />
          </div>
        </div>
      </div>
    `;
    cont.insertAdjacentHTML('beforeend', fila);
  });
}

function actualizarDatoHito(idx, campo, valor) {
  if (hitosEnEdicion[idx]) hitosEnEdicion[idx][campo] = valor;
}

function actualizarPlanosHito(idx, textoPlanos) {
  if (hitosEnEdicion[idx]) {
    hitosEnEdicion[idx].planosRequeridos = textoPlanos.split(',').map(p => p.trim()).filter(Boolean);
  }
}

function agregarFilaHitoNuevo() {
  const proxNum = hitosEnEdicion.length + 1;
  hitosEnEdicion.push({
    id: "HITO-0" + proxNum,
    codigo: "H-0" + proxNum,
    nombre: "Nuevo Hito Contractual " + proxNum,
    frente: "LAT El Bracho - Villa Quinteros",
    fechaObjetivo: "2026-12-31",
    pesoContractual: "10%",
    responsable: "UTE",
    requisitosCriticos: ["Emisión de planos ejecutivos"],
    planosRequeridos: ["PL-500"]
  });
  renderizarFilasEditorHitos();
}

function eliminarFilaHito(idx) {
  hitosEnEdicion.splice(idx, 1);
  renderizarFilasEditorHitos();
}

function guardarCronogramaHitosDefinitivo() {
  const btn = document.getElementById('btnGuardarHitosBD');
  if (btn) btn.innerText = "Guardando en R2...";

  localStorage.setItem('cache_hitos_obra_132kv', JSON.stringify(hitosEnEdicion));
  listaHitosLocal = hitosEnEdicion;
  renderizarHitos();

  let apiUrl = (localStorage.getItem('cfg_api_url') || '').trim();
  if (apiUrl && apiUrl.startsWith('http')) {
    if (apiUrl.includes('/edit')) apiUrl = apiUrl.replace(/\/edit.*$/, '/exec');
    if (!apiUrl.endsWith('/exec')) apiUrl = apiUrl.replace(/\/?$/, '/exec');

    fetch(apiUrl, {
      method: 'POST',
      body: JSON.stringify({
        accion: "guardar_cronograma_hitos_r2",
        hitos: hitosEnEdicion
      })
    })
    .then(r => r.json())
    .then(res => {
      if (btn) btn.innerText = "💾 Guardar en Base de Datos (R2)";
      cerrarModalEditorHitos();
      alert("✅ Cronograma de Hitos guardado con éxito en tu Base de Datos (Cloudflare R2).\n\nQuedó configurado sin crear archivos en Google Drive.");
    })
    .catch(() => {
      if (btn) btn.innerText = "💾 Guardar en Base de Datos (R2)";
      cerrarModalEditorHitos();
      alert("✅ Hitos guardados en la memoria privada de tu aplicación.");
    });
  } else {
    if (btn) btn.innerText = "💾 Guardar en Base de Datos (R2)";
    cerrarModalEditorHitos();
    alert("✅ Hitos guardados en la memoria privada de tu aplicación.");
  }
}

function renderizarHitos() {
  const cont = document.getElementById('contenedorTarjetasHitos');
  if (!cont) return;
  cont.innerHTML = '';

  const cntTodos = document.getElementById('cntHitosTodos');
  if (cntTodos) cntTodos.innerText = listaHitosLocal.length;

  const hitosCalculados = (listaHitosLocal.length > 0 ? listaHitosLocal : obtenerHitosBaseFallback()).map(h => {
    let fIso = h.fechaObjetivo || "2026-12-31";
    if (fIso.includes("/")) {
      const p = fIso.split("/");
      if (p.length === 3) fIso = `${p[2]}-${p[1].padStart(2, '0')}-${p[0].padStart(2, '0')}`;
    }

    const fObj = new Date(fIso + "T00:00:00");
    const diffMs = fObj.getTime() - new Date().getTime();
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

    return { ...h, fechaObjetivo: fIso, diasRestantes, semaforo, semaforoEtiqueta, semaforoColor };
  });

  const filtrados = hitosCalculados.filter(h => {
    if (filtroHitosActivo === 'ALERTA') return h.semaforo === 'ALERTA';
    if (filtroHitosActivo === 'VENCIDO') return h.semaforo === 'VENCIDO';
    if (filtroHitosActivo === 'EN_PLAZO') return h.semaforo === 'EN_PLAZO';
    return true;
  });

  if (filtrados.length === 0) {
    cont.innerHTML = `<div class="bento-card p-8 text-center text-slate-500 text-xs">No hay hitos con el filtro seleccionado.</div>`;
    return;
  }

  filtrados.forEach(hito => {
    const planosHtml = (hito.planosRequeridos || []).map(p => {
      const planoEncontrado = catalogoPlanosLocal.find(item => item.codigo.includes(p));
      const badgeP = planoEncontrado
        ? `<span class="text-[9px] font-bold px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800">Emitido (Rev ${planoEncontrado.revision || 'EO'})</span>`
        : `<span class="text-[9px] font-bold px-2 py-0.5 rounded bg-amber-950 text-amber-400 border border-amber-800">Pendiente ⚠️</span>`;

      return `
        <div class="flex items-center justify-between text-[11px] p-1.5 rounded bg-slate-900 border border-slate-800">
          <span class="font-mono text-slate-200 font-bold">${p}</span>
          ${badgeP}
        </div>
      `;
    }).join('');

    const card = `
      <div class="bento-card p-5 space-y-4 border-slate-800/90 bg-slate-900/80">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div class="flex items-center gap-2.5">
            <span class="px-2 py-1 rounded bg-slate-800 text-amber-400 font-mono font-extrabold text-xs border border-slate-700">
              ${hito.codigo}
            </span>
            <div>
              <h4 class="text-xs font-bold text-white leading-snug">${hito.nombre}</h4>
              <p class="text-[11px] text-slate-400">${hito.frente} • Ponderación: <b class="text-sky-400 font-mono">${hito.pesoContractual || '15%'}</b></p>
            </div>
          </div>
          <span class="text-[10px] font-mono font-bold px-2.5 py-1 rounded-full border ${hito.semaforoColor}">
            ${hito.semaforoEtiqueta}
          </span>
        </div>

        <div class="space-y-1.5">
          <div class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Planos Críticos Requeridos:</div>
          <div class="space-y-1">${planosHtml}</div>
        </div>

        <div class="pt-3 border-t border-slate-800 flex items-center justify-between text-xs">
          <span class="text-slate-400 text-[11px]">Responsable: <b class="text-slate-200">${hito.responsable || 'UTE'}</b> | Fecha: <b class="text-white font-mono">${hito.fechaObjetivo}</b></span>
          <button onclick="auditarHitoConIA('${hito.codigo}', '${hito.nombre}')" class="px-3 py-1.5 bg-amber-950/80 hover:bg-amber-900 border border-amber-800 text-amber-300 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-all">
            <span>⚡ Auditar Ruta Crítica</span>
          </button>
        </div>
      </div>
    `;
    cont.insertAdjacentHTML('beforeend', card);
  });
}

function filtrarHitos(filtro) {
  filtroHitosActivo = filtro;
  ['TODOS', 'ALERTA', 'VENCIDO', 'EN_PLAZO'].forEach(f => {
    const btn = document.getElementById('btnHito-' + f);
    if (btn) {
      if (f === filtro) btn.className = 'px-3 py-1.5 rounded-lg bg-amber-600 text-white font-bold whitespace-nowrap shadow-sm';
      else btn.className = 'px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium whitespace-nowrap';
    }
  });
  renderizarHitos();
}

function auditarHitoConIA(codigo, nombre) {
  cambiarSeccion('chat');
  const inp = document.getElementById('txtChatInput');
  if (inp) {
    inp.value = `¿Cuál es el estado crítico del Hito ${codigo} ("${nombre}") y qué documentación falta presentar para no retrasar el cronograma?`;
    enviarMensajeChatMovil();
  }
}

function obtenerHitosBaseFallback() {
  if (typeof HITOS_CONTRATUALES_INICIALES_FIJOS !== 'undefined' && HITOS_CONTRATUALES_INICIALES_FIJOS.length > 0) {
    return HITOS_CONTRATUALES_INICIALES_FIJOS;
  }
  return [
    { id: "H-01", codigo: "ANT.1-1", nombre: "Esquema organizativo para desarrollo de ingeniería de detalle", frente: "LAT El Bracho - Villa Quinteros", fechaObjetivo: "2025-11-12", planosRequeridos: ["Doc. Administrativa / Contractual"] },
    { id: "H-02", codigo: "ANT.2-2", nombre: "Relevamiento planialtimétrico, ubicación de caminos de acceso (SAE)", frente: "LAT El Bracho - Villa Quinteros", fechaObjetivo: "2026-06-15", planosRequeridos: ["L-EB-VQ-OC-PL-500", "L-EB-VQ-OC-MD-503"] },
    { id: "H-03", codigo: "ET-56", nombre: "Finalización 100% de estudios de suelo ET VQ", frente: "ET Villa Quinteros", fechaObjetivo: "2026-07-15", planosRequeridos: ["ET-VQ-OC-MD-510"] },
    { id: "H-04", codigo: "ET-58", nombre: "Finalización 50% proyecto ejecutivo ET VQ", frente: "ET Villa Quinteros", fechaObjetivo: "2026-10-15", planosRequeridos: ["50% Elenco ET VQ (141/282 Planos)"] },
    { id: "H-05", codigo: "LAT-194", nombre: "Finalización 50% proyecto ejecutivo LAT", frente: "LAT El Bracho - Villa Quinteros", fechaObjetivo: "2026-10-15", planosRequeridos: ["50% Elenco LAT (86/173 Planos)"] },
    { id: "H-06", codigo: "LAT-222", nombre: "Finalización 25% de la longitud de la traza y desmonte", frente: "LAT El Bracho - Villa Quinteros", fechaObjetivo: "2026-11-15", planosRequeridos: ["L-EB-VQ-OC-PL-500"] }
  ];
}