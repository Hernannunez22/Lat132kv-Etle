import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { X, Save, Settings, Activity, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';

interface DiagnosticoGeminiResult {
  ok: boolean;
  estado: string;
  codigoHttp?: number | string | null;
  modelo: string;
  variableDetectada: string;
  latenciaMs: number;
  respuestaModelo?: string;
  detalle: string;
}

export const ModalConfiguracion: React.FC = () => {
  const { isSettingsOpen, setIsSettingsOpen, config, updateConfig, sincronizarDatos } = useApp();
  const [apiUrl, setApiUrl] = useState('');
  const [r2AccountId, setR2AccountId] = useState('');
  const [r2Bucket, setR2Bucket] = useState('');

  const [probandoGemini, setProbandoGemini] = useState(false);
  const [diagnostico, setDiagnostico] = useState<DiagnosticoGeminiResult | null>(null);
  const [errorDiagnostico, setErrorDiagnostico] = useState<string | null>(null);

  useEffect(() => {
    if (isSettingsOpen) {
      setApiUrl(config.apiUrl);
      setR2AccountId(config.r2AccountId);
      setR2Bucket(config.r2Bucket);
      setDiagnostico(null);
      setErrorDiagnostico(null);
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

  const probarConexionGemini = async () => {
    setProbandoGemini(true);
    setErrorDiagnostico(null);
    setDiagnostico(null);
    try {
      const res = await fetch('/api/gemini/diagnostico', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        throw new Error(`El servidor respondió HTTP ${res.status}`);
      }
      const data = (await res.json()) as DiagnosticoGeminiResult;
      setDiagnostico(data);
    } catch (err: any) {
      setErrorDiagnostico(err?.message || 'No se pudo contactar al servidor para ejecutar la prueba.');
    } finally {
      setProbandoGemini(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bento-card max-w-md w-full p-6 space-y-4 border-slate-700 bg-slate-900 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <h3 className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-2">
            <Settings className="w-4 h-4 text-sky-400" />
            <span>Configuración y Diagnóstico</span>
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

          {/* Diagnóstico en vivo del motor Gemini en servidor */}
          <div className="pt-3 border-t border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h4 className="text-[11px] font-bold text-slate-200 flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-sky-400" />
                  <span>Diagnóstico de API Gemini</span>
                </h4>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  Ejecuta una llamada real desde el servidor para validar la conexión.
                </p>
              </div>
              <button
                type="button"
                onClick={probarConexionGemini}
                disabled={probandoGemini}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-sky-600/25 border border-slate-700 hover:border-sky-500/50 text-sky-300 text-[11px] font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-60 transition-colors shrink-0"
              >
                {probandoGemini ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Probando...</span>
                  </>
                ) : (
                  <>
                    <Activity className="w-3.5 h-3.5" />
                    <span>Probar Conexión</span>
                  </>
                )}
              </button>
            </div>

            {errorDiagnostico && (
              <div className="rounded-xl bg-rose-950/40 border border-rose-500/30 p-3 text-[11px] text-rose-200 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>{errorDiagnostico}</span>
              </div>
            )}

            {diagnostico && (
              <div
                className={`rounded-xl border p-3 text-[11px] space-y-2 ${
                  diagnostico.ok
                    ? 'bg-emerald-950/30 border-emerald-500/35 text-emerald-100'
                    : 'bg-rose-950/35 border-rose-500/35 text-rose-100'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold flex items-center gap-1.5">
                    {diagnostico.ok ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                    )}
                    <span className="font-mono">{diagnostico.estado}</span>
                  </span>
                  <span className="font-mono text-[10px] text-slate-300 tabular-nums">
                    {diagnostico.latenciaMs} ms
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] font-mono text-slate-300 border-t border-white/10 pt-2">
                  <div>
                    <span className="text-slate-500">Modelo: </span>
                    <span className="text-slate-100">{diagnostico.modelo}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Variable: </span>
                    <span className="text-slate-100">{diagnostico.variableDetectada}</span>
                  </div>
                  {diagnostico.codigoHttp != null && (
                    <div>
                      <span className="text-slate-500">HTTP: </span>
                      <span className="text-rose-300">{String(diagnostico.codigoHttp)}</span>
                    </div>
                  )}
                  {diagnostico.respuestaModelo && (
                    <div>
                      <span className="text-slate-500">Respuesta: </span>
                      <span className="text-emerald-300">{diagnostico.respuestaModelo}</span>
                    </div>
                  )}
                </div>

                <p className="text-[11px] leading-relaxed text-slate-200 border-t border-white/10 pt-2">
                  {diagnostico.detalle}
                </p>
              </div>
            )}
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

