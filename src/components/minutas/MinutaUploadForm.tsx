import React from 'react';
import { Loader2, Upload } from 'lucide-react';
import { FRENTES_OPCIONES } from './minutasHelpers';

interface MinutaUploadFormProps {
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  subiendoArchivo: boolean;
  guardandoMinuta: boolean;
  minCodigo: string;
  setMinCodigo: (val: string) => void;
  minFecha: string;
  setMinFecha: (val: string) => void;
  minFrente: string;
  setMinFrente: (val: string) => void;
  minTitulo: string;
  setMinTitulo: (val: string) => void;
  minParticipantes: string;
  setMinParticipantes: (val: string) => void;
  minTexto: string;
  setMinTexto: (val: string) => void;
  handleArchivoMinuta: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  handleGuardarMinutaTexto: (e: React.FormEvent) => Promise<void>;
  onCancel: () => void;
}

export const MinutaUploadForm: React.FC<MinutaUploadFormProps> = ({
  fileInputRef,
  subiendoArchivo,
  guardandoMinuta,
  minCodigo,
  setMinCodigo,
  minFecha,
  setMinFecha,
  minFrente,
  setMinFrente,
  minTitulo,
  setMinTitulo,
  minParticipantes,
  setMinParticipantes,
  minTexto,
  setMinTexto,
  handleArchivoMinuta,
  handleGuardarMinutaTexto,
  onCancel,
}) => {
  return (
    <div className="bento-card p-3.5 sm:p-5 space-y-4 border-sky-500/30">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-800">
        <div>
          <h3 className="text-xs font-bold text-white">
            Registrar Minuta de Reunión y Extraer Compromisos
          </h3>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Sube el acta en PDF / Word (.docx) / TXT o pega el texto completo. Los compromisos, responsables y fechas límite se extraerán automáticamente.
          </p>
        </div>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
            onChange={handleArchivoMinuta}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={subiendoArchivo}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-xs font-bold flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0"
          >
            {subiendoArchivo ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Analizando archivo...</span>
              </>
            ) : (
              <>
                <Upload className="w-3.5 h-3.5" />
                <span>Subir PDF / Word / TXT</span>
              </>
            )}
          </button>
        </div>
      </div>

      <form onSubmit={handleGuardarMinutaTexto} className="space-y-3 text-xs">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-slate-300 mb-1">
              Código Minuta / Nota
            </label>
            <input
              type="text"
              value={minCodigo}
              onChange={e => setMinCodigo(e.target.value)}
              placeholder="Ej: MIN-ING-018 o COMCT2-TU1-00018"
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-300 mb-1">
              Fecha de Reunión
            </label>
            <input
              type="date"
              value={minFecha}
              onChange={e => setMinFecha(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-300 mb-1">
              Frente de Obra
            </label>
            <select
              value={minFrente}
              onChange={e => setMinFrente(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-sky-500"
            >
              {FRENTES_OPCIONES.map(f => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-300 mb-1">
              Título / Tema Principal
            </label>
            <input
              type="text"
              value={minTitulo}
              onChange={e => setMinTitulo(e.target.value)}
              placeholder="Ej: Revisión Ingeniería Ejecutiva ET VQ"
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-slate-300 mb-1">
            Participantes / Áreas
          </label>
          <input
            type="text"
            value={minParticipantes}
            onChange={e => setMinParticipantes(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-slate-300 mb-1">
            Contenido de la Minuta (o sube el archivo arriba)
          </label>
          <textarea
            rows={5}
            value={minTexto}
            onChange={e => setMinTexto(e.target.value)}
            placeholder="Pega aquí los puntos tratados y compromisos asumidos (ej: 1. Ingeniería se compromete a entregar plano ET-VQ-OC-PL-500 rev B antes del 05/11/2026...)"
            className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
        </div>

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-3.5 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700 cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={guardandoMinuta}
            className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-60 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
          >
            {guardandoMinuta ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Extrayendo compromisos...</span>
              </>
            ) : (
              <span>Guardar y Extraer Compromisos</span>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};
