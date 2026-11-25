import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  DEFAULT_DRIVE_ROOT_FOLDER_ID,
  esErrorPopupBloqueado,
  extraerDriveFolderId,
} from '../utils/googleAuth';
import {
  FolderSync,
  CheckCircle2,
  AlertTriangle,
  MapPin,
  FileText,
  ExternalLink,
  FolderOpen,
  Loader2,
  RefreshCw,
} from 'lucide-react';

const STORAGE_KEY_INTERFERENCIAS_FOLDER = 'drive_folder_interferencias_132kv';

export const InterferenciasTab: React.FC = () => {
  const {
    interferencias,
    sincronizarInterferenciasDrive,
    hasDriveToken,
    driveConnectionState,
    conectarGoogleDriveChat,
  } = useApp();
  const [filtro, setFiltro] = useState<'TODOS' | 'LISTOS' | 'FALTANTES'>('TODOS');
  const [folderInput, setFolderInput] = useState<string>(
    () => localStorage.getItem(STORAGE_KEY_INTERFERENCIAS_FOLDER) || DEFAULT_DRIVE_ROOT_FOLDER_ID
  );
  const [mostrarFolderInput, setMostrarFolderInput] = useState(false);
  const [sincronizandoDrive, setSincronizandoDrive] = useState(false);
  const [errorSync, setErrorSync] = useState<string | null>(null);
  const [resumenSync, setResumenSync] = useState<{
    carpetaInterferenciasNombre: string;
    subcarpetasDetectadas: number;
    subcarpetasProcesadas: number;
    erroresCarpetas: Array<{ carpeta: string; error: string }>;
  } | null>(null);

  const handleFolderInputChange = (val: string) => {
    setFolderInput(val);
    try {
      localStorage.setItem(STORAGE_KEY_INTERFERENCIAS_FOLDER, val);
    } catch {}
  };

  const handleSincronizarDrive = async (forzarRelectura = false) => {
    setErrorSync(null);
    setSincronizandoDrive(true);
    try {
      const folderId = extraerDriveFolderId(folderInput);
      const res = await sincronizarInterferenciasDrive({ folderId, forzarRelectura });
      setResumenSync({
        carpetaInterferenciasNombre: res.carpetaInterferenciasNombre,
        subcarpetasDetectadas: res.subcarpetasDetectadas,
        subcarpetasProcesadas: res.subcarpetasProcesadas,
        erroresCarpetas: res.erroresCarpetas,
      });
    } catch (err: any) {
      setErrorSync(
        err?.message ||
          'No se pudo leer la carpeta "interferencias" en Google Drive. Verifica la sesión y permisos.'
      );
    } finally {
      setSincronizandoDrive(false);
    }
  };

  const filtradas = interferencias.filter(item => {
    const estado = (item.estadoTramite || '').toUpperCase();
    const esListo =
      estado.includes('LISTO') ||
      estado.includes('SUFICIENTES') ||
      estado.includes('APROBADO') ||
      estado.includes('PRESENTADA');
    if (filtro === 'LISTOS') return esListo && (!item.faltantes || item.faltantes.length === 0);
    if (filtro === 'FALTANTES') return !esListo || (item.faltantes && item.faltantes.length > 0);
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Top Banner Bento */}
      <div className="bento-card p-3 sm:p-5 bg-gradient-to-br from-slate-900 via-slate-900 to-amber-950/20 border-amber-900/30 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="text-xl shrink-0">🚧</span>
            <div className="min-w-0">
              <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400">
                Interferencias & Cruces Reales (Google Drive)
              </h3>
              <p className="text-[11px] text-slate-400">
                Lee automáticamente cada subcarpeta dentro de <b className="text-slate-200">"interferencias"</b> y extrae los datos de su <b className="text-slate-200">solicitud de cruce</b>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setMostrarFolderInput(v => !v)}
              className="px-2.5 py-1.5 bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
              <span>Carpeta Drive</span>
            </button>
            <button
              type="button"
              onClick={() => handleSincronizarDrive(false)}
              disabled={sincronizandoDrive}
              className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-60 shadow-sm"
            >
              {sincronizandoDrive ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <FolderSync className="w-3.5 h-3.5" />
              )}
              <span>{sincronizandoDrive ? 'Leyendo Solicitudes...' : 'Sincronizar Cruces de Drive'}</span>
            </button>
          </div>
        </div>

        {mostrarFolderInput && (
          <div className="rounded-xl bg-slate-950/80 border border-slate-800 p-3 space-y-2.5 text-xs">
            <label className="block text-[11px] font-semibold text-slate-300">
              ID o enlace de carpeta raíz del proyecto (o directamente la carpeta "interferencias"):
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={folderInput}
                onChange={e => handleFolderInputChange(e.target.value)}
                placeholder={DEFAULT_DRIVE_ROOT_FOLDER_ID}
                className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
              <button
                type="button"
                onClick={() => handleSincronizarDrive(true)}
                disabled={sincronizandoDrive}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-700/50 rounded-lg text-[11px] font-bold whitespace-nowrap cursor-pointer disabled:opacity-60"
                title="Ignora caché incremental y vuelve a leer Solicitud + Respuesta en cada carpeta"
              >
                Forzar relectura completa
              </button>
            </div>
          </div>
        )}

        {hasDriveToken && driveConnectionState.accountEmail && (
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-teal-300/90 pt-1">
            <span>
              Drive activo: <strong className="font-mono">{driveConnectionState.accountEmail}</strong>
              {driveConnectionState.remainingMinutes > 0 ? ` (${driveConnectionState.remainingMinutes} min restantes)` : ''}
            </span>
            <button
              type="button"
              onClick={() => void conectarGoogleDriveChat({ forceConsent: true })}
              className="text-[10px] underline text-slate-300 hover:text-white cursor-pointer"
            >
              Cambiar cuenta / Reautorizar
            </button>
          </div>
        )}

        {errorSync && (
          <div className="rounded-xl bg-rose-950/40 border border-rose-500/40 p-3 text-xs text-rose-200 space-y-2">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{errorSync}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {esErrorPopupBloqueado(errorSync) && (
                <a
                  href={typeof window !== 'undefined' ? window.location.href : '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2.5 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-bold inline-flex items-center gap-1"
                >
                  <ExternalLink className="w-3 h-3" />
                  <span>Abrir en pestaña nueva</span>
                </a>
              )}
              <button
                type="button"
                onClick={async () => {
                  try {
                    await conectarGoogleDriveChat({ forceConsent: true });
                    await handleSincronizarDrive(false);
                  } catch (e: any) {
                    setErrorSync(e?.message || errorSync);
                  }
                }}
                className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 text-[10px] font-semibold inline-flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Reautorizar Google Drive</span>
              </button>
            </div>
          </div>
        )}

        {resumenSync && (
          <div className="rounded-xl bg-emerald-950/30 border border-emerald-500/30 p-3 text-[11px] text-emerald-200 space-y-1">
            <div className="font-bold flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>
                Carpeta "{resumenSync.carpetaInterferenciasNombre}" sincronizada:{' '}
                {resumenSync.subcarpetasProcesadas} de {resumenSync.subcarpetasDetectadas} carpeta(s) de cruce leída(s).
              </span>
            </div>
            {resumenSync.erroresCarpetas.length > 0 && (
              <div className="text-amber-300 text-[10px] pt-1">
                Avisos en {resumenSync.erroresCarpetas.length} carpeta(s):{' '}
                {resumenSync.erroresCarpetas.map(e => `${e.carpeta} (${e.error})`).join(' · ')}
              </div>
            )}
          </div>
        )}

        {/* Filtros */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar text-xs pt-1">
          <button
            onClick={() => setFiltro('TODOS')}
            className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition-all cursor-pointer font-bold ${
              filtro === 'TODOS'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
            }`}
          >
            Todos ({interferencias.length})
          </button>
          <button
            onClick={() => setFiltro('LISTOS')}
            className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition-all cursor-pointer font-medium ${
              filtro === 'LISTOS'
                ? 'bg-amber-600 text-white font-bold shadow-sm'
                : 'bg-slate-800 hover:bg-slate-700 text-emerald-400'
            }`}
          >
            ✅ Presentados / Listos
          </button>
          <button
            onClick={() => setFiltro('FALTANTES')}
            className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition-all cursor-pointer font-medium ${
              filtro === 'FALTANTES'
                ? 'bg-amber-600 text-white font-bold shadow-sm'
                : 'bg-slate-800 hover:bg-slate-700 text-rose-400'
            }`}
          >
            ⚠️ Con Faltantes / Pendientes
          </button>
        </div>
      </div>

      {/* Grilla de Organismos e Interferencias Reales */}
      <div id="contenedorTarjetasInterferencias" className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filtradas.length === 0 ? (
          <div className="col-span-full bento-card p-6 sm:p-8 text-center space-y-3">
            {interferencias.length === 0 ? (
              <>
                <div className="text-2xl">📂</div>
                <p className="text-xs font-bold text-slate-200">
                  Aún no se sincronizaron los cruces reales desde Google Drive
                </p>
                <p className="text-[11px] text-slate-400 max-w-md mx-auto leading-relaxed">
                  No se muestran datos inventados. Presiona <b className="text-amber-300">"Sincronizar Cruces de Drive"</b> para leer la carpeta <code className="text-sky-300">interferencias</code> y extraer la información real de la solicitud de cruce dentro de cada subcarpeta.
                </p>
                <button
                  type="button"
                  onClick={() => handleSincronizarDrive(false)}
                  disabled={sincronizandoDrive}
                  className="mx-auto px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold inline-flex items-center gap-2 cursor-pointer disabled:opacity-60"
                >
                  {sincronizandoDrive ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <FolderSync className="w-4 h-4" />
                  )}
                  <span>Conectar y Leer Carpeta "interferencias"</span>
                </button>
              </>
            ) : (
              <p className="text-slate-500 text-xs">
                No hay cruces reales que coincidan con ese filtro.
              </p>
            )}
          </div>
        ) : (
          filtradas.map((item, idx) => {
            const estado = (item.estadoTramite || '').toUpperCase();
            const esListo =
              (estado.includes('LISTO') ||
                estado.includes('SUFICIENTES') ||
                estado.includes('APROBADO') ||
                estado.includes('PRESENTADA')) &&
              (!item.faltantes || item.faltantes.length === 0);

            return (
              <div
                key={item.id || idx}
                className="bento-card p-3 sm:p-5 space-y-3.5 flex flex-col justify-between hover:border-amber-700/40"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-[10px] font-mono uppercase font-bold text-slate-400 break-words">
                        {item.normativa || 'Según solicitud'}
                      </span>
                      <h4 className="text-sm font-extrabold text-white leading-tight mt-0.5 break-words">
                        {item.empresa}
                      </h4>
                      <p className="text-[11px] text-amber-300 font-medium mt-0.5 break-words">
                        {item.tipoInterferencia || 'Solicitud de Cruce'}
                      </p>
                    </div>
                    <span
                      className={`text-[10px] font-bold px-2.5 py-1 rounded-full border shrink-0 flex items-center gap-1 ${
                        esListo
                          ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                          : 'bg-rose-950 text-rose-400 border-rose-800'
                      }`}
                    >
                      {esListo ? (
                        <CheckCircle2 className="w-3 h-3" />
                      ) : (
                        <AlertTriangle className="w-3 h-3" />
                      )}
                      <span>{item.estadoTramite || (esListo ? 'Listo' : 'Pendiente')}</span>
                    </span>
                  </div>

                  {/* Vanos Afectados */}
                  <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800 text-[11px] text-slate-300 flex items-start gap-2">
                    <MapPin className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                    <div className="min-w-0 break-words">
                      <span className="text-slate-500 font-semibold">Ubicación / Piquetes: </span>
                      <b className="text-white">{item.vanosAfectados || 'No especificado en solicitud'}</b>
                    </div>
                  </div>

                  {/* Trazabilidad real hacia Drive (subcarpeta y solicitud leída) */}
                  {(item.carpetaNombre || item.archivoSolicitudNombre) && (
                    <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 text-[11px] space-y-1.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-slate-400 flex items-center gap-1.5 min-w-0">
                          <FolderOpen className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                          <span className="truncate">
                            Carpeta: <b className="text-slate-200">{item.carpetaNombre || item.empresa}</b>
                            {typeof item.archivosCarpetaCount === 'number' && item.archivosCarpetaCount > 0
                              ? ` (${item.archivosCarpetaCount} arch.)`
                              : ''}
                          </span>
                        </span>
                        {item.fechaDocumento && (
                          <span className="text-[10px] font-mono text-slate-500 shrink-0">
                            {item.fechaDocumento}
                          </span>
                        )}
                      </div>

                      {item.archivoSolicitudNombre && (
                        <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-800/60">
                          <span className="text-sky-300 flex items-center gap-1.5 min-w-0 truncate">
                            <FileText className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate" title={item.archivoSolicitudNombre}>
                              {item.archivoSolicitudNombre}
                            </span>
                          </span>
                          {item.archivoSolicitudUrl && (
                            <a
                              href={item.archivoSolicitudUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[10px] font-bold text-amber-300 hover:text-amber-200 flex items-center gap-1 shrink-0"
                            >
                              <span>Abrir</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                      )}

                      {item.resumenSolicitud && (
                        <p className="text-[11px] text-slate-300 leading-relaxed pt-1 border-t border-slate-800/50 break-words">
                          {item.resumenSolicitud}
                        </p>
                      )}

                      {Array.isArray(item.documentosLeidos) && item.documentosLeidos.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1 pt-1.5 border-t border-slate-800/40">
                          <span className="text-[10px] text-slate-500 mr-1">Docs analizados:</span>
                          {item.documentosLeidos.map((docName, dIdx) => (
                            <span
                              key={dIdx}
                              className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700/80 text-[10px] text-slate-300 font-mono truncate max-w-[200px]"
                              title={docName}
                            >
                              {docName}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Faltantes reales si existen */}
                  {item.faltantes && item.faltantes.length > 0 && (
                    <div className="space-y-1.5 p-2.5 rounded-lg bg-rose-950/20 border border-rose-900/40 text-[11px]">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-rose-400 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> Requisitos Faltantes / Observaciones:
                      </span>
                      <ul className="space-y-1 pl-1">
                        {item.faltantes.map((f, fIdx) => (
                          <li key={fIdx} className="text-rose-200 flex items-start gap-1.5">
                            <span className="text-rose-400">•</span>
                            <span className="break-words">{f}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
