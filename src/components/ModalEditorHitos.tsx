import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { Hito } from '../types';
import * as XLSX from 'xlsx';
import { Upload, Plus, Trash2, X, Save, Lock } from 'lucide-react';

export const ModalEditorHitos: React.FC = () => {
  const { isHitosModalOpen, setIsHitosModalOpen, hitos, saveHitos } = useApp();
  const [hitosEnEdicion, setHitosEnEdicion] = useState<Hito[]>([]);
  const [estadoLectura, setEstadoLectura] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isHitosModalOpen) {
      setHitosEnEdicion(JSON.parse(JSON.stringify(hitos)));
      setEstadoLectura('');
    }
  }, [isHitosModalOpen, hitos]);

  if (!isHitosModalOpen) return null;

  const convertirFechaCsvAIso = (fechaInput: unknown): string => {
    if (!fechaInput) return "2026-12-31";

    if (fechaInput instanceof Date && !isNaN(fechaInput.getTime())) {
      const y = fechaInput.getFullYear();
      const m = String(fechaInput.getMonth() + 1).padStart(2, '0');
      const d = String(fechaInput.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }

    if (typeof fechaInput === 'number') {
      if (fechaInput > 30000 && fechaInput < 60000) {
        const dt = new Date((fechaInput - 25569) * 86400 * 1000);
        if (!isNaN(dt.getTime())) {
          const y = dt.getUTCFullYear();
          const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
          const d = String(dt.getUTCDate()).padStart(2, '0');
          return `${y}-${m}-${d}`;
        }
      }
    }

    const str = String(fechaInput).trim();
    const matchDmy = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/);
    if (matchDmy) {
      const dia = matchDmy[1].padStart(2, '0');
      const mes = matchDmy[2].padStart(2, '0');
      const anio = matchDmy[3];
      return `${anio}-${mes}-${dia}`;
    }

    const matchYmd = str.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/);
    if (matchYmd) {
      const anio = matchYmd[1];
      const mes = matchYmd[2].padStart(2, '0');
      const dia = matchYmd[3].padStart(2, '0');
      return `${anio}-${mes}-${dia}`;
    }

    return "2026-12-31";
  };

  const deducirPlanosRequeridosPorTarea = (descripcion: string, frente: string): string[] => {
    const dU = String(descripcion || '').toUpperCase();
    const fU = String(frente || '').toUpperCase();

    if (dU.includes("ESTUDIOS ELÉCTRICOS") || dU.includes("ESTUDIOS ELECTRICOS") || dU.includes("ESTUDIO ELÉCTRICO")) {
      return ["ET-LE-OE-MD-001 (Estudio Eléctrico Etapa I/II)", "L-EB-VQ-OE-MD-001 (Flujo de Cargas)", "Modelación PSS/E"];
    }
    if (dU.includes("TRANSFORMADORES DE POTENCIA") || dU.includes("REACTORES") || dU.includes("SECCIONADORES") || dU.includes("INTERRUPTORES")) {
      return ["ET-LE-OEM-ET-001 (Esp. Transformadores)", "Planilla PTG", "Ensayos FAT"];
    }
    if (dU.includes("RELEVAMIENTO PLANIALTIMÉTRICO") || dU.includes("CAMINOS DE ACCESO") || dU.includes("OBRADOR")) {
      return ["L-EB-VQ-OC-PL-500 (Planialtimetría Traza)", "L-EB-VQ-OC-MD-503 (Caminos de Acceso)"];
    }
    if (dU.includes("CONDUCTOR") || dU.includes("GUARDIA") || dU.includes("OPGW")) {
      return ["L-EB-VQ-OEM-ET-001 (Esp. Conductor)", "L-EB-VQ-OEM-PL-510 (Tabla Tensado)"];
    }
    if (dU.includes("50%") && dU.includes("PROYECTO EJECUTIVO")) {
      if (fU.includes("LAT")) return ["50% Elenco LAT (86/173 Planos)", "L-EB-VQ-OC-PL-500", "L-EB-VQ-OC-MD-501"];
      if (fU.includes("QUINTEROS") || dU.includes("VQ")) return ["50% Elenco ET VQ (141/282 Planos)", "ET-VQ-OC-MD-510", "ET-VQ-OEM-PL-313"];
      if (fU.includes("LEALES")) return ["50% Elenco ET Leales (265/529 Planos)", "ET-LE-OC-MD-513", "ET-LE-OEM-PL-300"];
      return ["50% Elenco Ejecutivo Emitido"];
    }
    if (dU.includes("ESTUDIOS DE SUELO") || dU.includes("GEOTECN")) {
      if (fU.includes("QUINTEROS") || dU.includes("VQ")) return ["ET-VQ-OC-MD-510 (Mecánica de Suelos ET VQ)"];
      if (fU.includes("LEALES")) return ["ET-LE-OC-MD-513 (Mecánica de Suelos ET Leales)"];
      if (fU.includes("BRACHO")) return ["ET-BR-OC-MD-501 (Estudio de Suelos ET EB)"];
      return ["L-EB-VQ-OC-MD-501 (Estudio Geotécnico Traza LAT)"];
    }
    if (dU.includes("CRUCE") || dU.includes("GASODUCTO") || dU.includes("RUTA") || dU.includes("FERROCARRIL")) {
      return ["L-EB-VQ-OC-PL-011 (Perfil Cruce)", "L-EB-VQ-OEM-MD-300 (PAT Catódica)"];
    }
    if (dU.includes("FUNDACION") || dU.includes("HORMIGÓN") || dU.includes("H-25")) {
      if (fU.includes("LEALES")) return ["ET-LE-OC-PL-501 (Fundaciones)", "ET-LE-OC-PL-505"];
      return ["L-EB-VQ-OC-PL-501 (Fundaciones LAT)", "L-EB-VQ-OC-PL-502"];
    }
    if (dU.includes("PAT") || dU.includes("PUESTA A TIERRA")) {
      return ["ET-VQ-OEM-PL-313 (Malla PAT)", "L-EB-VQ-OEM-MD-300"];
    }

    if (fU.includes("LAT")) return ["L-EB-VQ-OC-PL-500 (Traza General)"];
    if (fU.includes("LEALES")) return ["ET-LE-OC-PL-501 (Plano General)"];
    if (fU.includes("QUINTEROS")) return ["ET-VQ-OC-MD-510 (Memoria General)"];
    return ["Documentación Técnica Contractual"];
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setEstadoLectura(`⏳ Procesando ${file.name}...`);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const buffer = evt.target?.result as ArrayBuffer;
        const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array' });
        const firstSheet = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheet];
        const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false }) as unknown[][];

        if (!rows || rows.length < 3) {
          setEstadoLectura('⚠️ Archivo sin suficientes datos.');
          return;
        }

        // Búsqueda de cabeceras matriciales
        let filaTitulos = -1;
        let filaFechas = -1;

        for (let r = 0; r < Math.min(12, rows.length); r++) {
          const rowStr = (rows[r] || []).map(cell => String(cell || '')).join(' ').toUpperCase();
          if (rowStr.includes('DESCRIP') || rowStr.includes('HITOS') || rowStr.includes('RUBRO')) {
            filaTitulos = r;
          }
          const cantFechas = (rows[r] || []).filter(c => /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(String(c || '').trim())).length;
          if (cantFechas >= 3) filaFechas = r;
        }

        if (filaFechas === -1 && filaTitulos !== -1) {
          filaFechas = Math.max(0, filaTitulos - 1);
        }

        const extraidos: Hito[] = [];

        if (filaTitulos !== -1) {
          const headerTitulos = rows[filaTitulos] || [];
          const headerFechas = (filaFechas !== -1 ? rows[filaFechas] : headerTitulos) || [];

          let colHito = 0;
          let colHitoNum = 2;
          let colRubro = 3;
          let colDesc = 4;

          headerTitulos.forEach((val, idx) => {
            const u = String(val || '').toUpperCase();
            if (u.includes('HITO') && !u.includes('Nº')) colHito = idx;
            if (u.includes('HITO N') || u.includes('HITO Nº')) colHitoNum = idx;
            if (u.includes('RUBRO')) colRubro = idx;
            if (u.includes('DESCRIP') || u.includes('TAREA')) colDesc = idx;
          });

          const mapaFechas: { colIndex: number; fechaIso: string }[] = [];
          headerFechas.forEach((val, idx) => {
            if (idx <= colDesc) return;
            const iso = convertirFechaCsvAIso(val);
            if (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso)) {
              mapaFechas.push({ colIndex: idx, fechaIso: iso });
            }
          });

          for (let r = filaTitulos + 1; r < rows.length; r++) {
            const row = rows[r];
            if (!row || !Array.isArray(row)) continue;
            const desc = String(row[colDesc] || '').trim();
            if (!desc || desc.length < 3 || desc.toUpperCase().startsWith('TOTAL')) continue;

            const hitoGrupo = String(row[colHito] || '').trim();
            const hitoNum = String(row[colHitoNum] || '').trim();
            const rubro = String(row[colRubro] || '').trim();

            let cod = hitoNum ? `HT-${hitoNum}` : (hitoGrupo ? `HT-${hitoGrupo}` : `HT-${extraidos.length + 1}`);
            if (hitoGrupo && hitoNum && hitoGrupo !== hitoNum) {
              cod = `${hitoGrupo}-${hitoNum}`;
            }

            let fechaIso = '';
            for (const mf of mapaFechas) {
              const valCelda = String(row[mf.colIndex] || '').trim().toUpperCase();
              if (valCelda === 'X' || valCelda === 'SI' || valCelda === '1' || valCelda.includes('X')) {
                fechaIso = mf.fechaIso;
                break;
              }
            }

            if (!fechaIso) fechaIso = "2026-10-15";

            let frente = "LAT El Bracho - Villa Quinteros";
            const dU = desc.toUpperCase();
            if (dU.includes("ET VQ") || dU.includes("VILLA QUINTEROS")) frente = "ET Villa Quinteros";
            else if (dU.includes("LEALES")) frente = "ET Leales";
            else if (dU.includes("BRACHO") && !dU.includes("LAT")) frente = "ET El Bracho";

            extraidos.push({
              id: `HITO-${extraidos.length + 1}`,
              codigo: cod,
              nombre: desc,
              frente: frente,
              fechaObjetivo: fechaIso,
              pesoContractual: rubro || "INGENIERÍA",
              responsable: "UTE / Contratista",
              requisitosCriticos: [`Rubro: ${rubro || 'General'}`],
              planosRequeridos: deducirPlanosRequeridosPorTarea(desc, frente)
            });
          }
        }

        if (extraidos.length > 0) {
          setHitosEnEdicion(extraidos);
          setEstadoLectura(`✅ Se importaron ${extraidos.length} hitos exitosamente.`);
        } else {
          setEstadoLectura('⚠️ No se encontraron hitos en formato compatible.');
        }
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        setEstadoLectura('❌ Error: ' + errorMsg);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleUpdate = (idx: number, campo: keyof Hito, val: unknown) => {
    setHitosEnEdicion(prev => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], [campo]: val };
      return copy;
    });
  };

  const handleUpdatePlanos = (idx: number, texto: string) => {
    const list = texto.split(',').map(s => s.trim()).filter(Boolean);
    handleUpdate(idx, 'planosRequeridos', list);
  };

  const handleAddHito = () => {
    const proxNum = hitosEnEdicion.length + 1;
    const nuevo: Hito = {
      id: `HT-MANUAL-${Date.now()}`,
      codigo: `HT-${proxNum}`,
      nombre: `Nuevo Hito Contractual ${proxNum}`,
      frente: "LAT El Bracho - Villa Quinteros",
      fechaObjetivo: "2026-12-31",
      pesoContractual: "10%",
      responsable: "UTE",
      requisitosCriticos: ["Emisión de ingeniería"],
      planosRequeridos: ["L-EB-VQ-OC-PL-500"]
    };
    setHitosEnEdicion(prev => [...prev, nuevo]);
  };

  const handleDeleteHito = (idx: number) => {
    setHitosEnEdicion(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSaveDefinitivo = async () => {
    setIsSaving(true);
    await saveHitos(hitosEnEdicion);
    setIsSaving(false);
    setIsHitosModalOpen(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-2.5 sm:p-4">
      <div className="bento-card max-w-3xl w-full p-3.5 sm:p-6 space-y-3.5 sm:space-y-4 border-amber-700/60 bg-slate-900 shadow-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header Modal */}
        <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xl shrink-0">📊</span>
            <div className="min-w-0">
              <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400 truncate">
                Carga / Edición de Cronograma de Hitos
              </h3>
              <p className="text-[11px] text-slate-400 truncate">
                Persistencia en Base de Datos (Cloudflare R2 / Local)
              </p>
            </div>
          </div>
          <button 
            onClick={() => setIsHitosModalOpen(false)} 
            className="text-slate-400 hover:text-white font-bold text-sm cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Zona de Importación Excel */}
        <div className="p-3 sm:p-4 rounded-xl border-2 border-dashed border-amber-600/60 bg-amber-950/30 text-center space-y-2 shrink-0">
          <input 
            type="file" 
            id="inputModalExcel" 
            accept=".xlsx, .xls, .csv" 
            className="hidden" 
            onChange={handleFileUpload} 
          />
          <div className="text-2xl">📥</div>
          <div className="text-xs font-bold text-white">
            Importar Cronograma desde Archivo Excel (.xlsx / .xls / .csv)
          </div>
          <p className="text-[10px] text-slate-400 max-w-md mx-auto">
            Sube tu matriz de cronograma. El sistema cruzará automáticamente las tareas con las columnas de fechas detectando marcas "X" y asociando planos requeridos.
          </p>
          <button 
            type="button" 
            onClick={() => document.getElementById('inputModalExcel')?.click()} 
            className="px-4 py-2 bg-gradient-to-r from-amber-600 via-orange-600 to-amber-700 hover:from-amber-500 hover:to-orange-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-amber-900/40 transition-all flex items-center gap-2 mx-auto cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Seleccionar Archivo Excel (.xlsx / .xls)</span>
          </button>
          {estadoLectura && (
            <div className="text-[11px] text-amber-300 font-semibold pt-1">
              {estadoLectura}
            </div>
          )}
        </div>

        {/* Lista de Filas */}
        <div className="space-y-3 flex-1 overflow-y-auto pr-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-slate-300 font-semibold">
              Hitos Contractuales ({hitosEnEdicion.length}):
            </span>
            <button 
              onClick={handleAddHito} 
              className="px-2.5 py-1 bg-amber-950 text-amber-300 border border-amber-800/80 rounded-lg text-[10px] font-bold hover:bg-amber-900 flex items-center gap-1 transition-all cursor-pointer"
            >
              <Plus className="w-3 h-3" />
              <span>Agregar Hito Manual</span>
            </button>
          </div>

          <div className="space-y-2.5">
            {hitosEnEdicion.map((h, idx) => (
              <div key={h.id || idx} className="p-2.5 sm:p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2">
                  <input 
                    type="text" 
                    value={h.codigo || ''} 
                    onChange={e => handleUpdate(idx, 'codigo', e.target.value)}
                    className="w-20 sm:w-24 bg-slate-900 border border-slate-700 text-amber-400 font-mono font-bold text-xs p-1.5 rounded-lg shrink-0"
                    placeholder="HT-01"
                  />
                  <input 
                    type="text" 
                    value={h.nombre || ''} 
                    onChange={e => handleUpdate(idx, 'nombre', e.target.value)}
                    className="min-w-[140px] flex-1 bg-slate-900 border border-slate-700 text-white font-semibold text-xs p-1.5 rounded-lg"
                    placeholder="Nombre del hito..."
                  />
                  <button 
                    onClick={() => handleDeleteHito(idx)} 
                    className="text-rose-400 hover:text-rose-300 p-1 cursor-pointer shrink-0" 
                    title="Eliminar este hito"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-0.5">Fecha Objetivo:</label>
                    <input 
                      type="date" 
                      value={h.fechaObjetivo || '2026-11-20'} 
                      onChange={e => handleUpdate(idx, 'fechaObjetivo', e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 text-slate-200 text-xs p-1.5 rounded-lg font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-0.5">Frente de Obra:</label>
                    <input 
                      type="text" 
                      value={h.frente || ''} 
                      onChange={e => handleUpdate(idx, 'frente', e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 text-slate-200 text-xs p-1.5 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-0.5">Planos Requeridos (coma):</label>
                    <input 
                      type="text" 
                      value={(h.planosRequeridos || []).join(', ')} 
                      onChange={e => handleUpdatePlanos(idx, e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 text-slate-200 text-xs p-1.5 rounded-lg font-mono"
                      placeholder="PL-500, PL-011"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer Modal */}
        <div className="pt-3 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 border-t border-slate-800 shrink-0">
          <span className="text-[10px] text-slate-500 font-mono flex items-center gap-1">
            <Lock className="w-3 h-3 shrink-0" /> Persistencia en R2 / Local
          </span>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button 
              onClick={() => setIsHitosModalOpen(false)} 
              className="px-3.5 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs font-semibold hover:bg-slate-700 cursor-pointer"
            >
              Cancelar
            </button>
            <button 
              onClick={handleSaveDefinitivo} 
              disabled={isSaving}
              className="px-4 sm:px-5 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold shadow-md flex items-center gap-1.5 cursor-pointer disabled:opacity-60 whitespace-nowrap"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isSaving ? 'Guardando...' : 'Guardar Cronograma'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
