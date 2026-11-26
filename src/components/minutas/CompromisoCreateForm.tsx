import React from 'react';
import { EstadoCompromiso, MinutaReunion } from '../../types';
import { FRENTES_OPCIONES } from './minutasHelpers';

interface CompromisoCreateFormProps {
  minutas: MinutaReunion[];
  compMinutaId: string;
  setCompMinutaId: (val: string) => void;
  compResp: string;
  setCompResp: (val: string) => void;
  compFrente: string;
  setCompFrente: (val: string) => void;
  compFechaLim: string;
  setCompFechaLim: (val: string) => void;
  compDesc: string;
  setCompDesc: (val: string) => void;
  compEstadoInit: EstadoCompromiso;
  setCompEstadoInit: (val: EstadoCompromiso) => void;
  compArea: string;
  setCompArea: (val: string) => void;
  compDocs: string;
  setCompDocs: (val: string) => void;
  onSubmit: (e: React.FormEvent) => Promise<void>;
  onCancel: () => void;
}

export const CompromisoCreateForm: React.FC<CompromisoCreateFormProps> = ({
  minutas,
  compMinutaId,
  setCompMinutaId,
  compResp,
  setCompResp,
  compFrente,
  setCompFrente,
  compFechaLim,
  setCompFechaLim,
  compDesc,
  setCompDesc,
  compEstadoInit,
  setCompEstadoInit,
  compArea,
  setCompArea,
  compDocs,
  setCompDocs,
  onSubmit,
  onCancel,
}) => {
  return (
    <form onSubmit={onSubmit} className="bento-card p-3.5 sm:p-5 space-y-3 border-slate-700 text-xs">
      <div className="pb-2 border-b border-slate-800">
        <h3 className="text-xs font-bold text-white">Registrar Compromiso de Minuta</h3>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div>
          <label className="block text-[11px] font-semibold text-slate-300 mb-1">Minuta Vinculada</label>
          <select
            value={compMinutaId}
            onChange={e => setCompMinutaId(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
          >
            <option value="">Registro directo (sin minuta previa)</option>
            {minutas.map(m => (
              <option key={m.id} value={m.id}>
                {m.codigo} · {m.fechaReunion}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-slate-300 mb-1">Responsable</label>
          <input
            type="text"
            value={compResp}
            onChange={e => setCompResp(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
          />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-slate-300 mb-1">Frente</label>
          <select
            value={compFrente}
            onChange={e => setCompFrente(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
          >
            {FRENTES_OPCIONES.map(f => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-slate-300 mb-1">Fecha Límite</label>
          <input
            type="date"
            value={compFechaLim}
            onChange={e => setCompFechaLim(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="sm:col-span-2">
          <label className="block text-[11px] font-semibold text-slate-300 mb-1">Descripción del Compromiso</label>
          <input
            type="text"
            value={compDesc}
            onChange={e => setCompDesc(e.target.value)}
            placeholder="Ej: Entregar memoria de cálculo de fundaciones y planos de pórticos 132 kV revisados"
            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
          />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-slate-300 mb-1">Estado Inicial</label>
          <select
            value={compEstadoInit}
            onChange={e => setCompEstadoInit(e.target.value as EstadoCompromiso)}
            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
          >
            <option value="INCUMPLIDO">Incumplido</option>
            <option value="PENDIENTE">Pendiente</option>
            <option value="EN_CURSO">En Curso</option>
            <option value="CUMPLIDO">Cumplido</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-[11px] font-semibold text-slate-300 mb-1">Área / Especialidad</label>
          <input
            type="text"
            value={compArea}
            onChange={e => setCompArea(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
          />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-slate-300 mb-1">Planos / Documentos asociados (separados por coma)</label>
          <input
            type="text"
            value={compDocs}
            onChange={e => setCompDocs(e.target.value)}
            placeholder="Ej: ET-VQ-OC-PL-500, ET-VQ-OEM-PL-300"
            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono"
          />
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="px-3.5 py-2 rounded-xl bg-slate-800 text-slate-300 font-semibold hover:bg-slate-700 cursor-pointer"
        >
          Cancelar
        </button>
        <button
          type="submit"
          className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold cursor-pointer"
        >
          Guardar Compromiso
        </button>
      </div>
    </form>
  );
};
