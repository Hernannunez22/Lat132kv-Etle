import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  FileText,
  Clock,
  Settings,
  RefreshCw,
  BookOpen,
  MoreVertical,
  X,
  Cloud,
  CloudOff,
  MailCheck,
  AlertTriangle,
} from 'lucide-react';
import { PWAInstallButton } from './PWAInstallButton';

export const Header: React.FC = () => {
  const {
    activeTab,
    setActiveTab,
    connectionStatus,
    cloudSyncStatus,
    cloudUserEmail,
    reintentarConexionNube,
    isSyncing,
    sincronizarDatos,
    setIsSettingsOpen,
    pliegosReales,
    setIsPliegosModalOpen,
  } = useApp();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [retryingSync, setRetryingSync] = useState(false);

  const handleAbrirSync = () => {
    setIsSettingsOpen(true);
  };

  const handleReintentarRapido = async () => {
    setRetryingSync(true);
    try {
      const next = await reintentarConexionNube();
      if (next !== 'sincronizado') {
        setIsSettingsOpen(true);
      }
    } catch {
      setIsSettingsOpen(true);
    } finally {
      setRetryingSync(false);
    }
  };

  const getSubtitle = () => {
    switch (activeTab) {
      case 'dashboard': return 'Control Documental & Ingeniería de Campo';
      case 'planos': return 'Explorador de Planos y Respaldo R2';
      case 'comparador': return 'Comparador de Planos PDF y Auditoría vs. Pliego';
      case 'hitos': return 'Cronograma de Hitos & Alerta de Vencimientos';
      case 'minutas': return 'Minutas de Reunión, Compromisos y Notas de Pedido';
      case 'informes': return 'Generador de Informes Ejecutivos en 1 Clic';
      case 'interferencias': return 'Auditoría de Cruces & Entes (LAT 132 kV)';
      case 'anotador': return 'Anotador Técnico & Auditoría';
      case 'chat': return 'Asistente IA Multimodal (Gemini)';
      default: return 'Control Documental & Ingeniería de Campo';
    }
  };

  const isPendingState =
    cloudSyncStatus === 'verificacion-pendiente' || cloudSyncStatus === 'acceso-pendiente';

  return (
    <header className="bg-[#0f172a]/95 border-b border-slate-800/80 px-3 py-2.5 md:px-6 lg:px-8 md:py-3.5 shrink-0 z-40 backdrop-blur-xl relative">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between md:gap-4">
        {/* Fila superior en móvil / Izquierda en escritorio: Marca + Estado */}
        <div className="flex items-center justify-between gap-2 min-w-0">
          <div className="flex items-center gap-2.5 md:gap-3 min-w-0">
            <div className="w-8 h-8 md:w-10 md:h-10 rounded-xl bg-gradient-to-tr from-sky-600 via-blue-600 to-indigo-600 flex items-center justify-center text-base md:text-lg font-black shadow-lg shadow-sky-500/20 text-white border border-sky-400/30 shrink-0">
              ⚡
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-sm font-extrabold tracking-tight text-white leading-none whitespace-nowrap">
                  Obras 132 kV
                </h1>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                    isPendingState
                      ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                      : cloudSyncStatus === 'sincronizado'
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                      : 'bg-slate-800/80 text-slate-300 border-slate-700'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      isPendingState
                        ? 'bg-amber-400 animate-pulse'
                        : cloudSyncStatus === 'sincronizado'
                        ? `bg-emerald-400 ${isSyncing ? 'animate-ping' : 'animate-pulse'}`
                        : 'bg-slate-400'
                    }`}
                  ></span>
                  <span>{connectionStatus}</span>
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium mt-0.5 truncate">
                {getSubtitle()}
              </p>
            </div>
          </div>
        </div>

        {/* Fila compacta inferior en móvil (< 768px): Menú secundario + Sync + Configuración + Sincronizar */}
        <div className="flex md:hidden items-center justify-between gap-2 pt-1 border-t border-slate-800/60">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(prev => !prev)}
            className="px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 border border-slate-700/70 text-slate-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
            aria-expanded={mobileMenuOpen}
            aria-label="Abrir menú de herramientas"
          >
            {mobileMenuOpen ? <X className="w-3.5 h-3.5 text-sky-400" /> : <MoreVertical className="w-3.5 h-3.5 text-sky-400" />}
            <span>Herramientas</span>
            {pliegosReales.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-sky-500 text-white text-[10px] font-bold font-mono tabular-nums">
                {pliegosReales.length}
              </span>
            )}
          </button>

          <div className="flex items-center gap-1.5 shrink-0">
            {cloudSyncStatus === 'sincronizado' ? (
              <button
                type="button"
                onClick={handleAbrirSync}
                className="px-2.5 py-1.5 rounded-xl bg-emerald-950/70 border border-emerald-700/60 text-emerald-300 text-[11px] font-bold flex items-center gap-1 cursor-pointer shrink-0"
                title={`Sincronizado en tiempo real (${cloudUserEmail || 'Nube'})`}
                aria-label="Estado Nube Sync"
              >
                <Cloud className="w-3.5 h-3.5" />
                <span>Sync ✓</span>
              </button>
            ) : isPendingState ? (
              <button
                type="button"
                onClick={handleAbrirSync}
                className="px-2.5 py-1.5 rounded-xl bg-amber-950/80 border border-amber-600/60 text-amber-200 text-[11px] font-bold flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
                title="Finalizar verificación o autorización de correo"
              >
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                <span>{cloudSyncStatus === 'verificacion-pendiente' ? 'Verificar' : 'Pendiente'}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleAbrirSync}
                className="px-2.5 py-1.5 rounded-xl bg-indigo-950/90 hover:bg-indigo-900 border border-indigo-700 text-indigo-200 text-[11px] font-bold flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
                title="Conectar Correo Corporativo o Google para sincronizar dispositivos"
              >
                <CloudOff className="w-3.5 h-3.5 text-indigo-400" />
                <span>Conectar Sync</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setIsSettingsOpen(true)}
              className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 active:scale-95 text-slate-300 text-xs border border-slate-700/60 transition-all shadow-sm cursor-pointer shrink-0"
              title="Ajustes de Conexión (Nube / Correo / API / R2)"
              aria-label="Configuración"
            >
              <Settings className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => sincronizarDatos()}
              disabled={isSyncing}
              className="px-3 py-2 rounded-xl bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 active:scale-95 text-white text-xs font-bold shadow-md shadow-sky-600/20 flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-60 whitespace-nowrap shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Sincronizando' : 'Sincronizar'}</span>
            </button>
          </div>
        </div>

        {/* Barra de acciones completa en escritorio (>= 768px) */}
        <div className="hidden md:flex items-center gap-2 shrink-0">
          {cloudSyncStatus === 'sincronizado' ? (
            <button
              onClick={handleAbrirSync}
              className="px-2.5 py-1.5 rounded-xl bg-emerald-950/70 hover:bg-emerald-900/70 border border-emerald-700/60 text-emerald-300 text-[11px] font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
              title={`Sincronizado en tiempo real entre dispositivos (${cloudUserEmail || ''})`}
            >
              <Cloud className="w-3.5 h-3.5" />
              <span>Sync Multi-Equipo</span>
            </button>
          ) : isPendingState ? (
            <button
              onClick={handleAbrirSync}
              className="px-2.5 py-1.5 rounded-xl bg-amber-950/80 hover:bg-amber-900/80 border border-amber-600/60 text-amber-200 text-[11px] font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
              title={`Cuenta ${cloudUserEmail || ''}: completar paso pendiente para activar Sync`}
            >
              <MailCheck className="w-3.5 h-3.5 text-amber-400" />
              <span>
                {cloudSyncStatus === 'verificacion-pendiente' ? 'Verificar Correo' : 'Acceso Pendiente'}
              </span>
            </button>
          ) : (
            <button
              onClick={handleAbrirSync}
              className="px-2.5 py-1.5 rounded-xl bg-indigo-950/90 hover:bg-indigo-900 border border-indigo-700 text-indigo-200 text-[11px] font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
              title="Iniciar sesión con Correo Corporativo o Google para sincronizar dispositivos"
            >
              <CloudOff className="w-3.5 h-3.5 text-indigo-400" />
              <span>Conectar Sync</span>
            </button>
          )}

          <button
            onClick={() => setIsPliegosModalOpen(true)}
            className="px-3 py-1.5 rounded-xl bg-sky-950/80 hover:bg-sky-900 border border-sky-800 text-sky-300 text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
            title="Cargar y Gestionar Pliegos Reales (PDF / Word / Texto)"
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Pliegos Reales</span>
            {pliegosReales.length > 0 ? (
              <span className="px-1.5 py-0.2 rounded-full bg-sky-500 text-white text-[10px] font-bold">
                {pliegosReales.length}
              </span>
            ) : (
              <span className="px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-semibold border border-amber-500/40">
                Cargar
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('informes')}
            className="px-3 py-1.5 rounded-xl bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-800 text-emerald-300 text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Generar Informe</span>
          </button>

          <button
            onClick={() => setActiveTab('hitos')}
            className="px-3 py-1.5 rounded-xl bg-amber-950/80 hover:bg-amber-900 border border-amber-800 text-amber-300 text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Hitos</span>
          </button>

          <PWAInstallButton />

          <button
            onClick={() => setIsSettingsOpen(true)}
            className="p-2 rounded-xl bg-slate-800/70 hover:bg-slate-700 active:scale-95 text-slate-300 text-xs border border-slate-700/60 transition-all shadow-sm cursor-pointer shrink-0"
            title="Ajustes de Conexión (Nube / Correo / API / R2)"
          >
            <Settings className="w-4 h-4" />
          </button>

          <button
            onClick={() => sincronizarDatos()}
            disabled={isSyncing}
            className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 active:scale-95 text-white text-xs font-bold shadow-md shadow-sky-600/20 flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-60 whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Sincronizando' : 'Sincronizar'}</span>
          </button>
        </div>
      </div>

      {/* Aviso directo cuando falta verificar correo corporativo o falta autorización de admin */}
      {isPendingState && (
        <div className="mt-2 rounded-xl bg-amber-950/50 border border-amber-600/40 px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-amber-100">
          <div className="flex items-center gap-2 min-w-0">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="truncate">
              {cloudSyncStatus === 'verificacion-pendiente' ? (
                <>
                  Revisa tu bandeja de <strong className="text-white">{cloudUserEmail}</strong> y confirma el correo de verificación para activar la sincronización.
                </>
              ) : (
                <>
                  Tu correo <strong className="text-white">{cloudUserEmail}</strong> aún no está autorizado en este proyecto. Pide al administrador que lo autorice.
                </>
              )}
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              disabled={retryingSync}
              onClick={handleReintentarRapido}
              className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-[10px] font-bold cursor-pointer disabled:opacity-60"
            >
              {retryingSync ? 'Verificando...' : 'Reintentar Sync'}
            </button>
            <button
              type="button"
              onClick={handleAbrirSync}
              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-[10px] font-semibold cursor-pointer"
            >
              Opciones
            </button>
          </div>
        </div>
      )}

      {/* Menú desplegable de acciones secundarias en móvil (< 768px) */}
      {mobileMenuOpen && (
        <>
          <div
            className="fixed inset-0 z-30 bg-black/40 md:hidden"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="md:hidden absolute left-3 right-3 top-full mt-1.5 z-40 rounded-2xl bg-[#0f172a] border border-slate-700/80 shadow-2xl p-3 space-y-2">
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                handleAbrirSync();
              }}
              className={`w-full px-3 py-2.5 rounded-xl border text-xs font-bold flex items-center justify-between gap-2 cursor-pointer ${
                cloudSyncStatus === 'sincronizado'
                  ? 'bg-emerald-950/70 border-emerald-700 text-emerald-300'
                  : isPendingState
                  ? 'bg-amber-950/70 border-amber-700 text-amber-200'
                  : 'bg-indigo-950/80 border-indigo-700 text-indigo-200'
              }`}
            >
              <span className="flex items-center gap-2">
                {cloudSyncStatus === 'sincronizado' ? (
                  <Cloud className="w-4 h-4 shrink-0" />
                ) : (
                  <CloudOff className="w-4 h-4 shrink-0" />
                )}
                <span>
                  {cloudSyncStatus === 'sincronizado'
                    ? 'Sincronización Multi-Equipo Activa'
                    : isPendingState
                    ? 'Completar Activación de Sync'
                    : 'Conectar Sync (Correo Corporativo / Google)'}
                </span>
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                setIsPliegosModalOpen(true);
              }}
              className="w-full px-3 py-2.5 rounded-xl bg-sky-950/80 hover:bg-sky-900 border border-sky-800 text-sky-300 text-xs font-bold flex items-center justify-between gap-2 cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 shrink-0" />
                <span>Pliegos Reales</span>
              </span>
              {pliegosReales.length > 0 ? (
                <span className="px-2 py-0.5 rounded-full bg-sky-500 text-white text-[10px] font-bold font-mono tabular-nums">
                  {pliegosReales.length} cargados
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-semibold border border-amber-500/40">
                  Cargar
                </span>
              )}
            </button>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  setActiveTab('hitos');
                }}
                className="px-3 py-2.5 rounded-xl bg-amber-950/80 hover:bg-amber-900 border border-amber-800 text-amber-300 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Clock className="w-4 h-4 shrink-0" />
                <span>Hitos</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  setActiveTab('informes');
                }}
                className="px-3 py-2.5 rounded-xl bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-800 text-emerald-300 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <FileText className="w-4 h-4 shrink-0" />
                <span>Informes</span>
              </button>
            </div>

            <PWAInstallButton
              variant="menu-item"
              onAfterTrigger={() => setMobileMenuOpen(false)}
            />
          </div>
        </>
      )}
    </header>
  );
};
