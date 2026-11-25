import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, Smartphone, Share, X, Copy, Check } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  variant?: 'header' | 'menu-item';
  onAfterTrigger?: () => void;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  variant = 'header',
  onAfterTrigger,
}) => {
  const { isInstallable, isInstalled, isIOS, isInIframe, install } = usePWAInstall();
  const [mostrarGuia, setMostrarGuia] = useState(false);
  const [copiadoUrl, setCopiadoUrl] = useState(false);

  // Si ya se ejecuta instalada en modo standalone, ocultar botón
  if (isInstalled) {
    return null;
  }

  const handleClick = async () => {
    if (isInstallable) {
      const ok = await install();
      onAfterTrigger?.();
      if (!ok) return;
    } else {
      setMostrarGuia(true);
    }
  };

  const copiarEnlace = () => {
    navigator.clipboard.writeText(window.location.origin);
    setCopiadoUrl(true);
    setTimeout(() => setCopiadoUrl(false), 2000);
  };

  const modalGuia =
    mostrarGuia && typeof document !== 'undefined'
      ? createPortal(
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm p-3 sm:p-4">
            <div className="w-full max-w-md rounded-2xl bg-[#0f172a] border border-slate-700/80 p-4 sm:p-5 shadow-2xl space-y-4 text-xs text-slate-200 max-h-[90vh] overflow-y-auto">
              <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-sky-400 shrink-0">
                    <Smartphone className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-white leading-snug">
                      Instalar Obras 132 kV como App (PWA)
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Acceso directo en pantalla de inicio y pantalla completa
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setMostrarGuia(false);
                    onAfterTrigger?.();
                  }}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white cursor-pointer shrink-0"
                  aria-label="Cerrar"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {isInIframe && (
                <div className="p-3 rounded-xl bg-amber-950/35 border border-amber-500/30 text-amber-200 space-y-2">
                  <p className="font-semibold">
                    Estás viendo la aplicación dentro de una vista previa embebida.
                  </p>
                  <p className="text-[11px] text-amber-100/90">
                    Para instalarla en tu celular o navegador, abre la URL compartida de la app directamente en Chrome (Android) o Safari (iPhone):
                  </p>
                  <div className="flex items-center gap-2 min-w-0">
                    <code className="flex-1 min-w-0 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-[10px] text-sky-300 truncate font-mono">
                      {window.location.origin}
                    </code>
                    <button
                      type="button"
                      onClick={copiarEnlace}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-semibold flex items-center gap-1 cursor-pointer shrink-0"
                    >
                      {copiadoUrl ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>{copiadoUrl ? 'Copiado' : 'Copiar'}</span>
                    </button>
                  </div>
                </div>
              )}

              {isIOS ? (
                <div className="space-y-2 bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 leading-relaxed">
                  <div className="font-bold text-white flex items-center gap-1.5">
                    <Share className="w-3.5 h-3.5 text-sky-400" />
                    <span>Pasos en iPhone / iPad (Safari):</span>
                  </div>
                  <ol className="list-decimal pl-4 space-y-1 text-slate-300">
                    <li>Abre esta página en <strong>Safari</strong>.</li>
                    <li>Toca el botón <strong>Compartir</strong> (cuadrado con flecha hacia arriba).</li>
                    <li>Desliza y selecciona <strong>Agregar a la pantalla de inicio</strong>.</li>
                    <li>Confirma tocando <strong>Agregar</strong>.</li>
                  </ol>
                </div>
              ) : (
                <div className="space-y-2 bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 leading-relaxed">
                  <div className="font-bold text-white">Pasos en Android (Chrome / Edge):</div>
                  <ol className="list-decimal pl-4 space-y-1 text-slate-300">
                    <li>Abre la app directamente en <strong>Google Chrome</strong> en tu celular.</li>
                    <li>Toca el menú <strong>⋮</strong> (arriba a la derecha).</li>
                    <li>Selecciona <strong>Instalar aplicación</strong> o <strong>Agregar a pantalla principal</strong>.</li>
                  </ol>
                </div>
              )}

              <button
                type="button"
                onClick={() => {
                  setMostrarGuia(false);
                  onAfterTrigger?.();
                }}
                className="w-full py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold cursor-pointer transition-colors"
              >
                Entendido
              </button>
            </div>
          </div>,
          document.body
        )
      : null;

  if (variant === 'menu-item') {
    return (
      <>
        <button
          type="button"
          onClick={handleClick}
          className="w-full px-3 py-2.5 rounded-xl bg-indigo-950/70 hover:bg-indigo-900/90 border border-indigo-700/60 text-indigo-200 text-xs font-bold flex items-center justify-between gap-2 cursor-pointer transition-colors"
        >
          <span className="flex items-center gap-2">
            {isInstallable ? (
              <Download className="w-4 h-4 text-sky-400 shrink-0" />
            ) : (
              <Smartphone className="w-4 h-4 text-sky-400 shrink-0" />
            )}
            <span>{isInstallable ? 'Instalar App' : 'Instalar en Celular'}</span>
          </span>
          <span className="text-[10px] text-sky-300 font-mono">PWA</span>
        </button>
        {modalGuia}
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className="px-3 py-1.5 rounded-xl bg-indigo-950/80 hover:bg-indigo-900 border border-indigo-700/70 text-indigo-200 text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
        title="Instalar Obras 132 kV en tu celular o PC como app"
      >
        {isInstallable ? (
          <Download className="w-3.5 h-3.5 text-sky-400" />
        ) : (
          <Smartphone className="w-3.5 h-3.5 text-sky-400" />
        )}
        <span className="hidden md:inline">
          {isInstallable ? 'Instalar App' : 'Instalar en Celular'}
        </span>
      </button>

      {modalGuia}
    </>
  );
};
