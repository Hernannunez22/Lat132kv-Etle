import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { X, Save, Settings } from 'lucide-react';

export const ModalConfiguracion: React.FC = () => {
  const { isSettingsOpen, setIsSettingsOpen, config, updateConfig, sincronizarDatos } = useApp();
  const [apiUrl, setApiUrl] = useState('');
  const [r2AccountId, setR2AccountId] = useState('');
  const [r2Bucket, setR2Bucket] = useState('');

  useEffect(() => {
    if (isSettingsOpen) {
      setApiUrl(config.apiUrl);
      setR2AccountId(config.r2AccountId);
      setR2Bucket(config.r2Bucket);
    }
  }, [isSettingsOpen, config]);

  if (!isSettingsOpen) return null;

  const handleSave = () => {
    updateConfig({
      apiUrl: apiUrl.trim(),
      r2AccountId: r2AccountId.trim(),
      r2Bucket: r2Bucket.trim()
    });
    setIsSettingsOpen(false);
    sincronizarDatos();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bento-card max-w-sm w-full p-6 space-y-4 border-slate-700 bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <h3 className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-2">
            <Settings className="w-4 h-4 text-sky-400" />
            <span>Configuración de Conexión</span>
          </h3>
          <button 
            onClick={() => setIsSettingsOpen(false)} 
            className="text-slate-400 hover:text-white font-bold text-sm cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-3.5 text-xs">
          <div>
            <label className="block text-[11px] font-semibold text-slate-300 mb-1">
              URL Endpoint Web App (Apps Script):
            </label>
            <input 
              type="text" 
              value={apiUrl}
              onChange={e => setApiUrl(e.target.value)}
              placeholder="https://script.google.com/macros/s/.../exec" 
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-sky-500 font-mono"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-300 mb-1">
              Clave Cloudflare R2 Account ID:
            </label>
            <input 
              type="text" 
              value={r2AccountId}
              onChange={e => setR2AccountId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-sky-500 font-mono"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-300 mb-1">
              Nombre Bucket R2:
            </label>
            <input 
              type="text" 
              value={r2Bucket}
              onChange={e => setR2Bucket(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-sky-500 font-mono"
            />
          </div>
        </div>

        <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-800">
          <button 
            onClick={() => setIsSettingsOpen(false)} 
            className="px-3.5 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs font-semibold hover:bg-slate-700 cursor-pointer"
          >
            Cancelar
          </button>
          <button 
            onClick={handleSave} 
            className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold shadow-md flex items-center gap-1.5 cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Guardar y Conectar</span>
          </button>
        </div>
      </div>
    </div>
  );
};
