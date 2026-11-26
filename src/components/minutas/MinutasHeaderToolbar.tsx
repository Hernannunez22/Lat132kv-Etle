import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  ExternalLink,
  FileWarning,
  Loader2,
  LogOut,
  Mic,
  Plus,
  Upload,
} from 'lucide-react';
import { DriveConnectionState } from '../../types';
import { DEFAULT_DRIVE_ROOT_FOLDER_ID, esErrorPopupBloqueado } from '../../utils/googleAuth';
import { formatearCronometro, SubVistaMinutas, UltimoScanDriveInfo } from './minutasHelpers';

interface MinutasHeaderToolbarProps {
  hasDriveToken: boolean;
  driveConnectionState: DriveConnectionState;
  sincronizandoDrive: boolean;
  driveFolderInput: string;
  setDriveFolderInput: (val: string) => void;
  buscarTodoDrive: boolean;
  setBuscarTodoDrive: (val: boolean) => void;
  ultimoScanDrive: UltimoScanDriveInfo | null;
  ejecutarLecturaDrive: (tokenOverride?: string, forceConsent?: boolean) => Promise<void>;
  handleDesconectarDrive: () => Promise<void>;
  mostrarAudioMinuta: boolean;
  recEstado: 'inactivo' | 'grabando' | 'pausado';
  recSegundos: number;
  onToggleAltaCompromiso: () => void;
  onToggleAudioMinuta: () => void;
  onToggleAltaMinuta: () => void;
  minutasCount: number;
  resumenConteos: {
    total: number;
    incumplidos: number;
    cumplidos: number;
    pendientes: number;
  };
  notasPedidoCount: number;
  seleccionadosCount: number;
  onEmitirNotaPedidoHeader: () => void;
  subVista: SubVistaMinutas;
  setSubVista: (vista: SubVistaMinutas) => void;
  errorAccion: string | null;
  mensajeOk: string | null;
}

export const MinutasHeaderToolbar: React.FC<MinutasHeaderToolbarProps> = ({
  hasDriveToken,
  driveConnectionState,
  sincronizandoDrive,
  driveFolderInput,
  setDriveFolderInput,
  buscarTodoDrive,
  setBuscarTodoDrive,
  ultimoScanDrive,
  ejecutarLecturaDrive,
  handleDesconectarDrive,
  mostrarAudioMinuta,
  recEstado,
  recSegundos,
  onToggleAltaCompromiso,
  onToggleAudioMinuta,
  onToggleAltaMinuta,
  minutasCount,
  resumenConteos,
  notasPedidoCount,
  seleccionadosCount,
  onEmitirNotaPedidoHeader,
  subVista,
  setSubVista,
  errorAccion,
  mensajeOk,
}) => {
  return (
    <>
      {/* Cabecera de módulo y navegación segmentada */}
      <div className="bento-card p-3 sm:p-5 space-y-3 sm:space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 sm:gap-4">
          <div className="flex items-start gap-2.5 sm:gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400 shrink-0">
              <ClipboardList className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-xs sm:text-sm font-bold text-white tracking-tight">
                Minutas, Compromisos y Notas de Pedido a Ingeniería
              </h2>
              <p className="text-[11px] sm:text-xs text-slate-400 mt-0.5">
                Accede a actas de reunión, controla fechas límite de compromisos y emite Notas de Pedido formales ante incumplimientos.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => ejecutarLecturaDrive()}
              disabled={sincronizandoDrive}
              className="px-3.5 py-2 rounded-xl bg-white hover:bg-slate-100 disabled:opacity-70 text-slate-900 text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0 shadow-sm"
            >
              {sincronizandoDrive ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-600" />
                  <span>Leyendo Drive...</span>
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                    <path fill="#4285F4" d="M23.745 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-8.97z" />
                    <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24z" />
                    <path fill="#FBBC05" d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14z" />
                    <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96z" />
                  </svg>
                  <span>{hasDriveToken ? 'Sincronizar Minutas de Drive' : 'Conectar y Leer Drive'}</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={onToggleAltaCompromiso}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Nuevo Compromiso</span>
            </button>
            <button
              type="button"
              onClick={onToggleAudioMinuta}
              className={`px-3.5 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                mostrarAudioMinuta || recEstado !== 'inactivo'
                  ? 'bg-sky-600 border-sky-500 text-white'
                  : 'bg-sky-600/15 hover:bg-sky-600/25 border-sky-500/40 text-sky-300'
              }`}
              title="Grabar reunión o subir audio largo con Groq Whisper"
            >
              <Mic className="w-3.5 h-3.5" />
              <span>
                {recEstado !== 'inactivo'
                  ? `REC ${formatearCronometro(recSegundos)}`
                  : 'Grabar / Audio'}
              </span>
            </button>
            <button
              type="button"
              onClick={onToggleAltaMinuta}
              className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              title="Carga manual alternativa"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Carga Manual</span>
            </button>
            {resumenConteos.incumplidos > 0 && (
              <button
                type="button"
                onClick={onEmitirNotaPedidoHeader}
                className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <FileWarning className="w-3.5 h-3.5" />
                <span>
                  {seleccionadosCount > 0
                    ? `Nota de Pedido (${seleccionadosCount})`
                    : `Emitir NP (${resumenConteos.incumplidos} incumplidos)`}
                </span>
              </button>
            )}
          </div>
        </div>

        {/* Barra de origen Google Drive */}
        <div className="pt-3 border-t border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-3 text-xs">
          <div className="flex flex-1 flex-wrap items-center gap-2 min-w-0">
            <label className="text-[11px] font-semibold text-slate-400 whitespace-nowrap">
              Carpeta / Link Google Drive:
            </label>
            <input
              type="text"
              value={driveFolderInput}
              onChange={e => setDriveFolderInput(e.target.value)}
              placeholder={DEFAULT_DRIVE_ROOT_FOLDER_ID}
              className="w-full sm:w-auto sm:flex-1 sm:min-w-[220px] sm:max-w-md bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-[11px] text-slate-200 font-mono focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
            <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={buscarTodoDrive}
                onChange={e => setBuscarTodoDrive(e.target.checked)}
                className="rounded border-slate-600 bg-slate-950"
              />
              <span>Buscar también en todo mi Drive</span>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400 shrink-0">
            {driveConnectionState.accountEmail && (
              <span className="text-emerald-300 font-mono">
                {driveConnectionState.accountEmail}
                {driveConnectionState.remainingMinutes > 0 ? ` (${driveConnectionState.remainingMinutes}m)` : ''}
              </span>
            )}
            {hasDriveToken && (
              <button
                type="button"
                onClick={() => void ejecutarLecturaDrive(undefined, true)}
                disabled={sincronizandoDrive}
                className="text-sky-300 hover:text-sky-200 underline cursor-pointer"
                title="Cambiar de cuenta o renovar permiso de Google Drive"
              >
                Reautorizar
              </button>
            )}
            {hasDriveToken && (
              <button
                type="button"
                onClick={handleDesconectarDrive}
                className="text-slate-400 hover:text-slate-200 inline-flex items-center gap-1 cursor-pointer"
              >
                <LogOut className="w-3 h-3" />
                <span>Desconectar</span>
              </button>
            )}
            {ultimoScanDrive && (
              <span className="font-mono tabular-nums text-sky-300">
                {ultimoScanDrive.carpetasEscaneadas} carpetas · {ultimoScanDrive.archivosDetectados} minutas detectadas
              </span>
            )}
          </div>
        </div>

        {/* Métricas planas y pestañas internas */}
        <div className="pt-3 border-t border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400 font-mono tabular-nums">
            <span>
              <strong className="text-white">{minutasCount}</strong> minutas
            </span>
            <span aria-hidden="true">·</span>
            <span>
              <strong className="text-white">{resumenConteos.total}</strong> compromisos
            </span>
            <span aria-hidden="true">·</span>
            <span>
              <strong className="text-rose-400">{resumenConteos.incumplidos}</strong> incumplidos / vencidos
            </span>
            <span aria-hidden="true">·</span>
            <span>
              <strong className="text-emerald-400">{resumenConteos.cumplidos}</strong> cumplidos
            </span>
            <span aria-hidden="true">·</span>
            <span>
              <strong className="text-sky-400">{notasPedidoCount}</strong> notas de pedido
            </span>
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-950 border border-slate-800 rounded-xl max-w-full overflow-x-auto flex-nowrap no-scrollbar self-start md:self-auto">
            <button
              type="button"
              onClick={() => setSubVista('compromisos')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                subVista === 'compromisos'
                  ? 'bg-sky-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Compromisos ({resumenConteos.total})
            </button>
            <button
              type="button"
              onClick={() => setSubVista('minutas')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                subVista === 'minutas'
                  ? 'bg-sky-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Minutas ({minutasCount})
            </button>
            <button
              type="button"
              onClick={() => setSubVista('notas_pedido')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                subVista === 'notas_pedido'
                  ? 'bg-rose-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Notas de Pedido ({notasPedidoCount})
            </button>
          </div>
        </div>
      </div>

      {/* Alertas de operación */}
      {errorAccion && (
        <div className="bento-card p-3.5 border-rose-500/40 bg-rose-950/30 text-xs text-rose-200 flex flex-col gap-2">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span>{errorAccion}</span>
          </div>
          {(esErrorPopupBloqueado(errorAccion) ||
            errorAccion.toLowerCase().includes('drive') ||
            errorAccion.toLowerCase().includes('permiso') ||
            errorAccion.toLowerCase().includes('expir')) && (
            <div className="flex flex-wrap items-center gap-2">
              {esErrorPopupBloqueado(errorAccion) && (
                <a
                  href={typeof window !== 'undefined' ? window.location.href : '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-bold"
                >
                  <ExternalLink className="w-3 h-3" />
                  <span>Abrir en pestaña nueva y reintentar</span>
                </a>
              )}
              <button
                type="button"
                onClick={() => void ejecutarLecturaDrive(undefined, true)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 text-[11px] font-semibold cursor-pointer"
              >
                <span>Reautorizar Google Drive</span>
              </button>
            </div>
          )}
        </div>
      )}
      {mensajeOk && (
        <div className="bento-card p-3.5 border-emerald-500/40 bg-emerald-950/25 text-xs text-emerald-200 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{mensajeOk}</span>
        </div>
      )}
    </>
  );
};
