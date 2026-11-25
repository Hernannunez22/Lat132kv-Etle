import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import {
  X,
  Save,
  Settings,
  Activity,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Cloud,
  LogOut,
  UserPlus,
  Mail,
  Copy,
  Check,
  Trash2,
  RefreshCw,
  KeyRound,
  Send,
  ExternalLink,
  ShieldCheck,
} from 'lucide-react';
import { apiFetch, readJsonResponse } from '../utils/apiClient';
import type { WorkspaceInviteRecord } from '../utils/firestoreSync';
import type { PoliticaLimiteModelo, PrecisionNivelId } from '../types';

interface ResultadoModeloDiag {
  modelo: string;
  fuenteClave: string;
  ok: boolean;
  codigoHttp?: number | string | null;
  estado: string;
  latenciaMs: number;
  respuestaModelo?: string;
  detalleError?: string;
}

interface DiagnosticoGeminiResult {
  ok: boolean;
  estado: string;
  codigoHttp?: number | string | null;
  modelo: string;
  modeloPreferido?: string;
  modelosDisponibles?: string[];
  resultadosPorModelo?: ResultadoModeloDiag[];
  variableDetectada: string;
  latenciaMs: number;
  respuestaModelo?: string;
  detalle: string;
  estadoProceso?: {
    pid: number;
    nodeVersion: string;
    platform: string;
    uptimeSegundos: number;
    nodeEnv: string;
    puerto: number;
    clienteSdkInicializado: boolean;
    fuenteClienteActivo: string | null;
    pliegosEnMemoria: number;
    timestamp: string;
  };
  errorTecnico?: {
    nombre: string;
    codigoHttp: number | string | null;
    statusText: string | null;
    mensaje: string;
    causa: string | null;
    pingEjecutado: boolean;
  } | null;
}

export const ModalConfiguracion: React.FC = () => {
  const {
    isSettingsOpen,
    setIsSettingsOpen,
    config,
    updateConfig,
    sincronizarDatos,
    cloudSyncStatus,
    cloudUserEmail,
    cloudRole,
    invitedEmailHint,
    conectarNubeDispositivos,
    conectarCorreoCorporativo,
    registrarCorreoCorporativo,
    reenviarMailVerificacion,
    reintentarConexionNube,
    enviarResetClaveCorreo,
    desconectarNubeDispositivos,
    invitarColaboradorNube,
    listarInvitacionesNube,
    revocarInvitacionNube,
    precisionNivel,
    setPrecisionNivel,
    geminiPrecisionState,
    esUsuarioMaestro,
    modelosPagosHabilitados,
    toggleModelosPagosMaestro,
    refrescarEstadoGemini,
    guardarConfigPrecision,
    resetearUsoGemini,
    hasDriveToken,
    driveConnectionState,
    conectarGoogleDriveChat,
    desconectarGoogleDrive,
  } = useApp();

  const [apiUrl, setApiUrl] = useState('');
  const [r2AccountId, setR2AccountId] = useState('');
  const [r2Bucket, setR2Bucket] = useState('');

  // Login corporativo / Google
  const [metodoLogin, setMetodoLogin] = useState<'corporativo' | 'google'>('corporativo');
  const [modoCorporativo, setModoCorporativo] = useState<'login' | 'registro' | 'reset'>(
    invitedEmailHint ? 'registro' : 'login'
  );
  const [corpEmail, setCorpEmail] = useState(invitedEmailHint || '');
  const [corpPassword, setCorpPassword] = useState('');
  const [corpNombre, setCorpNombre] = useState('');
  const [authBusy, setAuthBusy] = useState(false);

  // Gestión de invitaciones del administrador
  const [publicAppUrl, setPublicAppUrl] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('cfg_public_app_url') || '';
      if (saved) return saved;
      if (typeof window !== 'undefined') {
        return window.location.origin.replace('://ais-dev-', '://ais-pre-');
      }
    } catch {}
    return '';
  });
  const [emailInvitar, setEmailInvitar] = useState('');
  const [invitando, setInvitando] = useState(false);
  const [invitaciones, setInvitaciones] = useState<WorkspaceInviteRecord[]>([]);
  const [cargandoInvitaciones, setCargandoInvitaciones] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [msgNube, setMsgNube] = useState<string | null>(null);
  const [errNube, setErrNube] = useState<string | null>(null);

  const [probandoGemini, setProbandoGemini] = useState(false);
  const [diagnostico, setDiagnostico] = useState<DiagnosticoGeminiResult | null>(null);
  const [errorDiagnostico, setErrorDiagnostico] = useState<string | null>(null);
  const [guardandoModelo, setGuardandoModelo] = useState(false);
  const [cambiandoMaster, setCambiandoMaster] = useState(false);
  const [msgLimites, setMsgLimites] = useState<string | null>(null);
  const [politicaCfg, setPoliticaCfg] = useState<PoliticaLimiteModelo>('bloquear');
  const [limitesCfg, setLimitesCfg] = useState<
    Record<string, { maxConsultasDiarias: string; maxCostoUsdDiario: string }>
  >({});

  const cargarInvitaciones = useCallback(async () => {
    if (cloudSyncStatus !== 'sincronizado' || cloudRole !== 'admin') return;
    setCargandoInvitaciones(true);
    try {
      const lista = await listarInvitacionesNube();
      setInvitaciones(lista);
    } catch {
      // Silencioso si no es admin o falla temporalmente
    } finally {
      setCargandoInvitaciones(false);
    }
  }, [cloudSyncStatus, cloudRole, listarInvitacionesNube]);

  useEffect(() => {
    if (isSettingsOpen) {
      setApiUrl(config.apiUrl);
      setR2AccountId(config.r2AccountId);
      setR2Bucket(config.r2Bucket);
      setDiagnostico(null);
      setErrorDiagnostico(null);
      setMsgLimites(null);
      if (invitedEmailHint) {
        setCorpEmail(prev => prev || invitedEmailHint);
      }
      void refrescarEstadoGemini();
      void cargarInvitaciones();
    }
  }, [isSettingsOpen, config, invitedEmailHint, cargarInvitaciones, refrescarEstadoGemini]);

  useEffect(() => {
    if (!geminiPrecisionState) return;
    setPoliticaCfg(geminiPrecisionState.politicaLimite);
    const map: Record<string, { maxConsultasDiarias: string; maxCostoUsdDiario: string }> = {};
    for (const m of geminiPrecisionState.modelos) {
      map[m.modelo] = {
        maxConsultasDiarias: String(m.maxConsultasDiarias),
        maxCostoUsdDiario: String(m.maxCostoUsdDiario),
      };
    }
    setLimitesCfg(map);
  }, [geminiPrecisionState]);

  const cambiarNivelPreferido = async (nuevoNivel: PrecisionNivelId) => {
    const nivelEfectivo: PrecisionNivelId = modelosPagosHabilitados ? nuevoNivel : 'gratuito';
    setPrecisionNivel(nivelEfectivo);
    setGuardandoModelo(true);
    try {
      await guardarConfigPrecision({ nivelPreferido: nivelEfectivo });
    } catch {
    } finally {
      setGuardandoModelo(false);
    }
  };

  const handleToggleMasterModal = async () => {
    if (!esUsuarioMaestro || cambiandoMaster) return;
    setCambiandoMaster(true);
    setMsgLimites(null);
    try {
      await toggleModelosPagosMaestro(!modelosPagosHabilitados);
      setMsgLimites(
        !modelosPagosHabilitados
          ? 'Modelos pagos habilitados para todo el equipo.'
          : 'Modelos pagos ocultos para todo el equipo (solo motor gratuito $0).'
      );
    } catch (e: any) {
      setMsgLimites(e?.message || 'Error actualizando control maestro.');
    } finally {
      setCambiandoMaster(false);
    }
  };

  const guardarLimitesYCostos = async () => {
    setGuardandoModelo(true);
    setMsgLimites(null);
    try {
      const limitesPorModelo: Record<
        string,
        { maxConsultasDiarias?: number; maxCostoUsdDiario?: number }
      > = {};
      for (const [modelo, vals] of Object.entries(limitesCfg)) {
        const q = Number(vals.maxConsultasDiarias);
        const usd = Number(vals.maxCostoUsdDiario);
        limitesPorModelo[modelo] = {
          maxConsultasDiarias: Number.isFinite(q) && q >= 0 ? Math.round(q) : 0,
          maxCostoUsdDiario: Number.isFinite(usd) && usd >= 0 ? Number(usd.toFixed(4)) : 0,
        };
      }
      await guardarConfigPrecision({
        nivelPreferido: precisionNivel,
        politicaLimite: politicaCfg,
        limitesPorModelo,
      });
      setMsgLimites('Límites y topes de costo actualizados.');
    } catch (e: any) {
      setMsgLimites(e?.message || 'Error guardando límites.');
    } finally {
      setGuardandoModelo(false);
    }
  };

  if (!isSettingsOpen) return null;

  const construirUrlInvitacion = (emailDestino: string) => {
    const rawOrigin = typeof window !== 'undefined' ? window.location.origin : '';
    const fallbackOrigin = rawOrigin.replace('://ais-dev-', '://ais-pre-');
    const cleanBase = (publicAppUrl.trim() || fallbackOrigin).replace(/\/+$/, '');
    return `${cleanBase}/?invitar=${encodeURIComponent(emailDestino.trim().toLowerCase())}`;
  };

  const esEntornoDevPrivado =
    typeof window !== 'undefined' && window.location.hostname.startsWith('ais-dev-');

  const construirTextoInvitacion = (emailDestino: string) => {
    const link = construirUrlInvitacion(emailDestino);
    return (
      `Hola,\n\n` +
      `Ya autoricé tu correo (${emailDestino}) para sincronizar en tiempo real la plataforma Obras 132 kV.\n\n` +
      `Ingresa desde este enlace:\n${link}\n\n` +
      `Pasos para conectarte (correo corporativo no Gmail):\n` +
      `1. En «Sincronización Multi-Dispositivo», elige «Correo Corporativo» -> «Crear cuenta».\n` +
      `2. Usa tu correo ${emailDestino} y define una contraseña.\n` +
      `3. Abre el mail de verificación que te llegará a tu casilla y haz clic en el enlace.\n` +
      `4. Vuelve a la app y presiona «Ya confirmé mi correo — Activar Sync».`
    );
  };

  const construirMailtoHref = (emailDestino: string) => {
    const subject = encodeURIComponent('Acceso a Sincronización - Obras 132 kV');
    const body = encodeURIComponent(construirTextoInvitacion(emailDestino));
    return `mailto:${encodeURIComponent(emailDestino)}?subject=${subject}&body=${body}`;
  };

  const copiarAlPortapapeles = async (texto: string, tagId: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiedId(tagId);
      setTimeout(() => setCopiedId(prev => (prev === tagId ? null : prev)), 2500);
    } catch {
      setErrNube('No se pudo copiar automáticamente; selecciona y copia el enlace manualmente.');
    }
  };

  const handleSubmitCorporativo = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrNube(null);
    setMsgNube(null);
    setAuthBusy(true);
    try {
      if (modoCorporativo === 'reset') {
        await enviarResetClaveCorreo(corpEmail);
        setMsgNube(`Se envió un mail para restablecer la contraseña a ${corpEmail.trim().toLowerCase()}.`);
        setModoCorporativo('login');
        return;
      }

      if (modoCorporativo === 'registro') {
        await registrarCorreoCorporativo(corpEmail, corpPassword, corpNombre);
        setMsgNube(
          `Cuenta creada. Te enviamos un correo de verificación a ${corpEmail.trim().toLowerCase()}. Confírmalo y presiona «Ya confirmé mi correo».`
        );
        return;
      }

      const res = await conectarCorreoCorporativo(corpEmail, corpPassword);
      if (!res.emailVerified) {
        setMsgNube(
          'Tu correo aún figura sin verificar. Revisa tu bandeja de entrada o reenvía el correo de verificación abajo.'
        );
      } else {
        setMsgNube('Sesión iniciada correctamente.');
      }
    } catch (err: any) {
      setErrNube(err?.message || 'Error de autenticación con correo corporativo.');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSave = () => {
    updateConfig({
      apiUrl: apiUrl.trim(),
      r2AccountId: r2AccountId.trim(),
      r2Bucket: r2Bucket.trim(),
    });
    setIsSettingsOpen(false);
    sincronizarDatos();
  };

  const probarConexionGemini = async () => {
    setProbandoGemini(true);
    setErrorDiagnostico(null);
    setDiagnostico(null);
    try {
      const res = await apiFetch('/api/gemini/diagnostico', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await readJsonResponse<DiagnosticoGeminiResult>(
        res,
        'Error ejecutando diagnóstico de Gemini'
      );
      if (!res.ok) {
        throw new Error((data as any)?.error || `El servidor respondió HTTP ${res.status}`);
      }
      setDiagnostico(data);
    } catch (err: any) {
      setErrorDiagnostico(err?.message || 'No se pudo contactar al servidor para ejecutar la prueba.');
    } finally {
      setProbandoGemini(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-2.5 sm:p-4">
      <div className="bento-card max-w-lg w-full p-3.5 sm:p-6 space-y-3.5 sm:space-y-4 border-slate-700 bg-slate-900 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <h3 className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-2">
            <Settings className="w-4 h-4 text-sky-400" />
            <span>Configuración y Sincronización</span>
          </h3>
          <button
            onClick={() => setIsSettingsOpen(false)}
            className="text-slate-400 hover:text-white font-bold text-sm cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-3.5 text-xs">
          {/* Bloque de Sincronización Multi-Dispositivo en Nube */}
          <div className="rounded-xl bg-slate-950/90 border border-slate-800 p-3 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-[11px] font-bold text-slate-100 flex items-center gap-1.5">
                <Cloud className="w-3.5 h-3.5 text-emerald-400" />
                <span>Sincronización Celulares y Notebooks</span>
              </h4>
              <span
                className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${
                  cloudSyncStatus === 'sincronizado'
                    ? 'bg-emerald-950 text-emerald-300 border-emerald-700'
                    : cloudSyncStatus === 'verificacion-pendiente' || cloudSyncStatus === 'acceso-pendiente'
                    ? 'bg-amber-950 text-amber-300 border-amber-700'
                    : 'bg-slate-800 text-slate-300 border-slate-700'
                }`}
              >
                {cloudSyncStatus === 'sincronizado' ? 'ACTIVA' : cloudSyncStatus.toUpperCase()}
              </span>
            </div>

            {cloudSyncStatus === 'sincronizado' ? (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2 text-[11px] text-slate-300">
                  <span className="truncate">
                    Cuenta: <b className="text-white">{cloudUserEmail}</b>
                  </span>
                  <button
                    type="button"
                    onClick={() => desconectarNubeDispositivos()}
                    className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-semibold flex items-center gap-1 cursor-pointer shrink-0"
                  >
                    <LogOut className="w-3 h-3" />
                    <span>Salir</span>
                  </button>
                </div>
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  Todos los pliegos, hitos, planos, minutas, notas de pedido, cruces y anotador se sincronizan en vivo en cualquier celular o notebook conectado.
                </p>

                {cloudRole === 'admin' && (
                  <div className="pt-2.5 border-t border-slate-800/80 space-y-2.5">
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-300">
                        Autorizar colaborador (Correo Corporativo o Gmail):
                      </label>
                      <p className="text-[10px] text-slate-400 mt-0.5 leading-relaxed">
                        Habilita el acceso en la base de datos. Como Firebase no envía un mail automático al autorizar, luego haz clic en <strong className="text-slate-200">Enviar Mail</strong> o <strong className="text-slate-200">Copiar</strong> para enviarle el link directo a tu colega.
                      </p>
                      {esEntornoDevPrivado && (
                        <div className="mt-1.5 space-y-1 bg-amber-950/30 border border-amber-700/40 rounded-lg px-2 py-1.5">
                          <p className="text-[10px] text-amber-200/95 leading-relaxed">
                            Para correos externos sin Gmail (ej. <code className="text-white">@codeler.com.ar</code>), publica la app con el botón <strong className="text-white">Deploy / Desplegar a Cloud Run</strong> en AI Studio (la vista previa <code className="text-amber-200">ais-pre-...</code> puede devolver Error 403 o Error 500 si no está publicada) y pega abajo la URL pública desplegada:
                          </p>
                          <input
                            type="url"
                            value={publicAppUrl}
                            onChange={e => {
                              const val = e.target.value;
                              setPublicAppUrl(val);
                              try {
                                localStorage.setItem('cfg_public_app_url', val);
                              } catch {}
                            }}
                            placeholder="https://tu-app-desplegada.run.app"
                            className="w-full bg-slate-900 border border-amber-700/50 rounded px-2 py-1 text-[10px] font-mono text-white focus:outline-none focus:ring-1 focus:ring-amber-400"
                          />
                        </div>
                      )}
                    </div>

                    <div className="flex gap-1.5">
                      <input
                        type="email"
                        value={emailInvitar}
                        onChange={e => setEmailInvitar(e.target.value)}
                        placeholder="colega@empresa.com"
                        className="flex-1 min-w-0 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-[11px] text-white focus:outline-none focus:ring-1 focus:ring-sky-500"
                      />
                      <button
                        type="button"
                        disabled={invitando || !emailInvitar.trim()}
                        onClick={async () => {
                          const target = emailInvitar.trim().toLowerCase();
                          setErrNube(null);
                          setMsgNube(null);
                          setInvitando(true);
                          try {
                            await invitarColaboradorNube(target);
                            setMsgNube(
                              `Correo ${target} autorizado en la base de datos. Envíale el enlace desde la lista de abajo para que cree su clave y active la sincronización.`
                            );
                            setEmailInvitar('');
                            await cargarInvitaciones();
                          } catch (e: any) {
                            setErrNube(e?.message || 'Error autorizando correo.');
                          } finally {
                            setInvitando(false);
                          }
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50 shrink-0"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        <span>Autorizar</span>
                      </button>
                    </div>

                    {/* Lista de correos autorizados */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                          Correos autorizados ({invitaciones.length})
                        </span>
                        <button
                          type="button"
                          onClick={() => cargarInvitaciones()}
                          disabled={cargandoInvitaciones}
                          className="text-[10px] text-sky-400 hover:text-sky-300 flex items-center gap-1 cursor-pointer disabled:opacity-50"
                        >
                          <RefreshCw className={`w-3 h-3 ${cargandoInvitaciones ? 'animate-spin' : ''}`} />
                          <span>Actualizar</span>
                        </button>
                      </div>

                      {invitaciones.length > 0 ? (
                        <div className="space-y-1.5 max-h-48 overflow-y-auto pr-0.5">
                          {invitaciones.map(inv => (
                            <div
                              key={inv.id}
                              className="rounded-lg bg-slate-900/90 border border-slate-800 px-2.5 py-2 flex flex-col gap-1.5"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[11px] font-mono text-slate-200 truncate">
                                  {inv.invitedEmail}
                                </span>
                                <span
                                  className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border shrink-0 ${
                                    inv.status === 'accepted'
                                      ? 'bg-emerald-950/80 text-emerald-300 border-emerald-700/60'
                                      : 'bg-amber-950/80 text-amber-300 border-amber-700/60'
                                  }`}
                                >
                                  {inv.status === 'accepted' ? 'Conectado' : 'Pendiente'}
                                </span>
                              </div>
                              <div className="flex flex-wrap items-center gap-1.5">
                                <a
                                  href={construirMailtoHref(inv.invitedEmail)}
                                  className="px-2 py-1 rounded bg-sky-600/20 hover:bg-sky-600/35 border border-sky-500/40 text-sky-200 text-[10px] font-semibold inline-flex items-center gap-1"
                                >
                                  <Send className="w-3 h-3" />
                                  <span>Enviar Mail</span>
                                </a>
                                <button
                                  type="button"
                                  onClick={() =>
                                    copiarAlPortapapeles(construirTextoInvitacion(inv.invitedEmail), inv.id)
                                  }
                                  className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-[10px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                                >
                                  {copiedId === inv.id ? (
                                    <>
                                      <Check className="w-3 h-3 text-emerald-400" />
                                      <span className="text-emerald-300">Copiado</span>
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="w-3 h-3" />
                                      <span>Copiar Link</span>
                                    </>
                                  )}
                                </button>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    setErrNube(null);
                                    try {
                                      await revocarInvitacionNube(inv.id);
                                      setInvitaciones(prev => prev.filter(x => x.id !== inv.id));
                                    } catch (e: any) {
                                      setErrNube(e?.message || 'No se pudo revocar la invitación.');
                                    }
                                  }}
                                  className="ml-auto px-2 py-1 rounded bg-rose-950/50 hover:bg-rose-900/60 border border-rose-800/50 text-rose-300 text-[10px] inline-flex items-center gap-1 cursor-pointer"
                                  title="Revocar invitación"
                                >
                                  <Trash2 className="w-3 h-3" />
                                  <span>Quitar</span>
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[10px] text-slate-500 italic">
                          Aún no hay otros correos autorizados.
                        </p>
                      )}
                    </div>

                    <details className="rounded-lg bg-slate-900/70 border border-slate-800 px-2.5 py-2 text-[10px] text-slate-400">
                      <summary className="cursor-pointer font-semibold text-slate-300 select-none">
                        Configuración necesaria en Firebase (para correos no Gmail)
                      </summary>
                      <ol className="list-decimal pl-4 mt-1.5 space-y-1 leading-relaxed">
                        <li>
                          Abre Firebase Console → proyecto <code className="text-slate-200">gen-lang-client-0070217603</code> →{' '}
                          <strong className="text-slate-200">Authentication → Sign-in method</strong>.
                        </li>
                        <li>
                          Habilita el proveedor <strong className="text-slate-200">Correo electrónico/contraseña</strong> (Email/Password).
                        </li>
                        <li>
                          Listo: cuando tus colegas entren con su correo corporativo y creen su clave, Firebase enviará automáticamente el correo de verificación a su casilla.
                        </li>
                      </ol>
                    </details>
                  </div>
                )}
              </div>
            ) : cloudSyncStatus === 'verificacion-pendiente' ? (
              <div className="space-y-2.5">
                <div className="rounded-lg bg-amber-950/40 border border-amber-600/40 p-2.5 text-[11px] text-amber-100 space-y-1.5">
                  <div className="font-bold flex items-center gap-1.5 text-amber-300">
                    <Mail className="w-4 h-4 shrink-0" />
                    <span>Verificación de correo pendiente</span>
                  </div>
                  <p className="text-[10px] leading-relaxed text-amber-100/90">
                    Enviamos un mail de verificación a <strong className="text-white">{cloudUserEmail}</strong>. Abre ese enlace en tu casilla corporativa (revisa también Correo no deseado / Spam) y luego presiona el botón verde.
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                  <button
                    type="button"
                    disabled={authBusy}
                    onClick={async () => {
                      setErrNube(null);
                      setMsgNube(null);
                      setAuthBusy(true);
                      try {
                        const status = await reintentarConexionNube();
                        if (status === 'verificacion-pendiente') {
                          setErrNube(
                            'Todavía figura sin verificar. Haz clic en el enlace del correo recibido y vuelve a intentar.'
                          );
                        } else if (status === 'acceso-pendiente') {
                          setErrNube(
                            'Correo verificado, pero falta que el administrador autorice este correo en Configuración.'
                          );
                        } else if (status === 'sincronizado') {
                          setMsgNube('Correo verificado y sincronización activada.');
                        }
                      } catch (e: any) {
                        setErrNube(e?.message || 'Error comprobando verificación.');
                      } finally {
                        setAuthBusy(false);
                      }
                    }}
                    className="flex-1 py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{authBusy ? 'Comprobando...' : 'Ya confirmé mi correo — Activar Sync'}</span>
                  </button>
                  <button
                    type="button"
                    disabled={authBusy}
                    onClick={async () => {
                      setErrNube(null);
                      setMsgNube(null);
                      setAuthBusy(true);
                      try {
                        await reenviarMailVerificacion();
                        setMsgNube(`Reenviamos el correo de verificación a ${cloudUserEmail}.`);
                      } catch (e: any) {
                        setErrNube(e?.message || 'No se pudo reenviar el correo.');
                      } finally {
                        setAuthBusy(false);
                      }
                    }}
                    className="py-2 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-[11px] font-semibold cursor-pointer disabled:opacity-60"
                  >
                    Reenviar mail
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => desconectarNubeDispositivos()}
                  className="text-[10px] text-slate-400 hover:text-slate-200 underline cursor-pointer"
                >
                  Cambiar de cuenta o correo
                </button>
              </div>
            ) : cloudSyncStatus === 'acceso-pendiente' ? (
              <div className="space-y-2.5">
                <div className="rounded-lg bg-amber-950/40 border border-amber-600/40 p-2.5 text-[11px] text-amber-100 space-y-1.5">
                  <div className="font-bold flex items-center gap-1.5 text-amber-300">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>Falta autorización del administrador</span>
                  </div>
                  <p className="text-[10px] leading-relaxed text-amber-100/90">
                    Tu sesión está iniciada con <strong className="text-white">{cloudUserEmail}</strong>, pero ese correo aún no figura en la lista de colaboradores autorizados del proyecto. Pide al administrador que autorice exactamente ese correo.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={authBusy}
                    onClick={async () => {
                      setErrNube(null);
                      setMsgNube(null);
                      setAuthBusy(true);
                      try {
                        const status = await reintentarConexionNube();
                        if (status === 'sincronizado') {
                          setMsgNube('Acceso habilitado y sincronización activa.');
                        } else {
                          setErrNube(
                            `El correo ${cloudUserEmail || ''} todavía no aparece autorizado. Verifica que no tenga errores de escritura.`
                          );
                        }
                      } catch (e: any) {
                        setErrNube(e?.message || 'No se pudo reintentar la conexión.');
                      } finally {
                        setAuthBusy(false);
                      }
                    }}
                    className="flex-1 py-2 px-3 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-[11px] font-bold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${authBusy ? 'animate-spin' : ''}`} />
                    <span>Ya me autorizaron — Reintentar</span>
                  </button>
                  {cloudUserEmail && (
                    <button
                      type="button"
                      onClick={() => copiarAlPortapapeles(cloudUserEmail, 'self-email')}
                      className="py-2 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                    >
                      {copiedId === 'self-email' ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      <span>{copiedId === 'self-email' ? 'Copiado' : 'Copiar correo'}</span>
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => desconectarNubeDispositivos()}
                  className="text-[10px] text-slate-400 hover:text-slate-200 underline cursor-pointer"
                >
                  Cerrar sesión / Probar otro correo
                </button>
              </div>
            ) : (
              <div className="space-y-2.5">
                {invitedEmailHint && (
                  <div className="rounded-lg bg-sky-950/60 border border-sky-700/60 px-2.5 py-2 text-[10px] text-sky-200">
                    Invitación detectada para <strong className="text-white">{invitedEmailHint}</strong>. Crea tu clave con este correo o inicia sesión para comenzar a sincronizar.
                  </div>
                )}

                {/* Selector Correo Corporativo vs Google */}
                <div className="grid grid-cols-2 gap-1.5 p-1 rounded-lg bg-slate-900 border border-slate-800">
                  <button
                    type="button"
                    onClick={() => {
                      setMetodoLogin('corporativo');
                      setErrNube(null);
                      setMsgNube(null);
                    }}
                    className={`py-1.5 px-2 rounded-md text-[11px] font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                      metodoLogin === 'corporativo'
                        ? 'bg-sky-600 text-white'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Mail className="w-3.5 h-3.5" />
                    <span>Correo Corporativo</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMetodoLogin('google');
                      setErrNube(null);
                      setMsgNube(null);
                    }}
                    className={`py-1.5 px-2 rounded-md text-[11px] font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                      metodoLogin === 'google'
                        ? 'bg-indigo-600 text-white'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Cloud className="w-3.5 h-3.5" />
                    <span>Google / Gmail</span>
                  </button>
                </div>

                {metodoLogin === 'corporativo' ? (
                  <form onSubmit={handleSubmitCorporativo} className="space-y-2">
                    <div className="flex items-center gap-1 border-b border-slate-800 pb-1.5">
                      <button
                        type="button"
                        onClick={() => setModoCorporativo('login')}
                        className={`px-2 py-1 rounded text-[10px] font-bold cursor-pointer ${
                          modoCorporativo === 'login'
                            ? 'bg-slate-800 text-sky-300'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        Iniciar sesión
                      </button>
                      <button
                        type="button"
                        onClick={() => setModoCorporativo('registro')}
                        className={`px-2 py-1 rounded text-[10px] font-bold cursor-pointer ${
                          modoCorporativo === 'registro'
                            ? 'bg-slate-800 text-emerald-300'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        Crear cuenta (1ª vez)
                      </button>
                      <button
                        type="button"
                        onClick={() => setModoCorporativo('reset')}
                        className={`ml-auto px-2 py-1 rounded text-[10px] font-semibold cursor-pointer ${
                          modoCorporativo === 'reset'
                            ? 'bg-slate-800 text-amber-300'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        Olvidé clave
                      </button>
                    </div>

                    {modoCorporativo === 'registro' && (
                      <input
                        type="text"
                        value={corpNombre}
                        onChange={e => setCorpNombre(e.target.value)}
                        placeholder="Nombre y Apellido (ej. Ing. Juan Pérez)"
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 text-[11px] text-white focus:outline-none focus:ring-1 focus:ring-sky-500"
                      />
                    )}

                    <input
                      type="email"
                      required
                      value={corpEmail}
                      onChange={e => setCorpEmail(e.target.value)}
                      placeholder="tu.nombre@empresa.com"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 text-[11px] text-white focus:outline-none focus:ring-1 focus:ring-sky-500"
                    />

                    {modoCorporativo !== 'reset' && (
                      <input
                        type="password"
                        required
                        minLength={6}
                        value={corpPassword}
                        onChange={e => setCorpPassword(e.target.value)}
                        placeholder="Contraseña (mínimo 6 caracteres)"
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 text-[11px] text-white focus:outline-none focus:ring-1 focus:ring-sky-500"
                      />
                    )}

                    <button
                      type="submit"
                      disabled={authBusy}
                      className="w-full py-2 px-3 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60"
                    >
                      {authBusy ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <KeyRound className="w-4 h-4" />
                      )}
                      <span>
                        {modoCorporativo === 'registro'
                          ? 'Crear cuenta y enviar mail de verificación'
                          : modoCorporativo === 'reset'
                          ? 'Enviar correo para restablecer clave'
                          : 'Ingresar y sincronizar'}
                      </span>
                    </button>

                    <p className="text-[10px] text-slate-400 leading-relaxed">
                      Para correos corporativos (Outlook, Exchange, dominio propio). Al crear la cuenta recibirás un correo de verificación para habilitar la sincronización multi-equipo.
                    </p>
                  </form>
                ) : (
                  <div className="space-y-2">
                    <p className="text-[10px] text-slate-400 leading-relaxed">
                      Inicia sesión con tu cuenta Gmail o Google Workspace para sincronizar datos y conectar carpetas de Google Drive.
                    </p>
                    <button
                      type="button"
                      onClick={async () => {
                        setErrNube(null);
                        setMsgNube(null);
                        try {
                          await conectarNubeDispositivos();
                          setMsgNube('Cuenta Google conectada.');
                        } catch (e: any) {
                          setErrNube(e?.message || 'No se pudo iniciar sesión con Google.');
                        }
                      }}
                      className="w-full py-2 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Cloud className="w-4 h-4" />
                      <span>Conectar Google Sync Multi-Dispositivo</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Estado dedicado de Google Drive en memoria */}
            <div className="pt-2.5 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-[10px]">
              <div className="min-w-0">
                <div className="font-semibold text-slate-200">
                  Google Drive (Memorias, Minutas, Notas y Elencos)
                </div>
                <div className="text-slate-400 truncate">
                  {hasDriveToken
                    ? `Conectado: ${driveConnectionState.accountEmail || 'Cuenta Google'}${
                        driveConnectionState.remainingMinutes > 0
                          ? ` · ~${driveConnectionState.remainingMinutes} min`
                          : ''
                      }${
                        driveConnectionState.rootFolderName
                          ? ` · Carpeta: ${driveConnectionState.rootFolderName}`
                          : ''
                      }`
                    : 'Sin token Drive activo en esta pestaña (se conecta en 1 clic sin volver a loguear correo).'}
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={async () => {
                    setErrNube(null);
                    setMsgNube(null);
                    try {
                      await conectarGoogleDriveChat({ forceConsent: hasDriveToken });
                      setMsgNube('Google Drive conectado y verificado en vivo.');
                    } catch (e: any) {
                      setErrNube(e?.message || 'No se pudo conectar Google Drive.');
                    }
                  }}
                  className="px-2.5 py-1 rounded bg-teal-600/85 hover:bg-teal-500 text-white font-bold cursor-pointer"
                >
                  {hasDriveToken ? 'Renovar Drive' : 'Conectar Drive'}
                </button>
                {hasDriveToken && (
                  <button
                    type="button"
                    onClick={() => void desconectarGoogleDrive()}
                    className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                  >
                    Desconectar
                  </button>
                )}
              </div>
            </div>

            {msgNube && <p className="text-[10px] text-emerald-300 font-medium leading-relaxed">{msgNube}</p>}
            {errNube && (
              <div className="space-y-1.5">
                <p className="text-[10px] text-rose-300 font-medium leading-relaxed">{errNube}</p>
                {errNube.toLowerCase().includes('popup-blocked') && (
                  <a
                    href={typeof window !== 'undefined' ? window.location.href : '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-bold"
                  >
                    <ExternalLink className="w-3 h-3" />
                    <span>Abrir app en pestaña nueva y reintentar</span>
                  </a>
                )}
              </div>
            )}
          </div>

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

          {/* Diagnóstico y motor IA en servidor */}
          <div className="pt-3 border-t border-slate-800 space-y-2.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h4 className="text-[11px] font-bold text-slate-200 flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-sky-400" />
                  <span>
                    {modelosPagosHabilitados
                      ? 'Motor Multi-Modelo IA y Diagnóstico'
                      : 'Motor IA Gratuito ($0) y Diagnóstico'}
                  </span>
                </h4>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  {modelosPagosHabilitados
                    ? 'Conmuta automáticamente entre modelos si hay límite de cuota o error.'
                    : 'Opera exclusivamente con modelos gratuitos ($0.00): OpenRouter :free y Groq Whisper.'}
                </p>
              </div>
              <button
                type="button"
                onClick={probarConexionGemini}
                disabled={probandoGemini}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-sky-600/25 border border-slate-700 hover:border-sky-500/50 text-sky-300 text-[11px] font-semibold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60 transition-colors shrink-0 self-start sm:self-auto"
              >
                {probandoGemini ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Probando modelos...</span>
                  </>
                ) : (
                  <>
                    <Activity className="w-3.5 h-3.5" />
                    <span>Probar Modelos</span>
                  </>
                )}
              </button>
            </div>

            {esUsuarioMaestro && (
              <div
                className={`rounded-xl border p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${
                  modelosPagosHabilitados
                    ? 'bg-amber-950/25 border-amber-500/40'
                    : 'bg-emerald-950/25 border-emerald-600/40'
                }`}
              >
                <div className="space-y-0.5 min-w-0">
                  <div className="text-[11px] font-bold text-white flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Control Maestro — Modelos Pagos</span>
                  </div>
                  <p className="text-[10px] text-slate-300 leading-relaxed">
                    {modelosPagosHabilitados
                      ? 'Activo: todos los usuarios ven y pueden elegir los niveles pagos de Gemini.'
                      : 'Solo Gratuito ($0): los modelos pagos están ocultos y bloqueados para todos los usuarios.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleToggleMasterModal()}
                  disabled={cambiandoMaster}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer shrink-0 disabled:opacity-60 transition-colors ${
                    modelosPagosHabilitados
                      ? 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                      : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                  }`}
                >
                  {cambiandoMaster
                    ? 'Aplicando...'
                    : modelosPagosHabilitados
                      ? 'Ocultar Pagos (Solo Gratis)'
                      : 'Habilitar Modelos Pagos'}
                </button>
              </div>
            )}

            <div className="space-y-2 bg-slate-950/70 border border-slate-800 rounded-xl p-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <label htmlFor="select-nivel-gemini" className="text-[10px] font-semibold text-slate-300">
                  Nivel de precisión por defecto:
                </label>
                <div className="flex items-center gap-2">
                  <select
                    id="select-nivel-gemini"
                    value={modelosPagosHabilitados ? precisionNivel : 'gratuito'}
                    onChange={e => void cambiarNivelPreferido(e.target.value as PrecisionNivelId)}
                    disabled={guardandoModelo || !modelosPagosHabilitados}
                    className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-[11px] text-white font-mono focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:opacity-80"
                  >
                    <option value="gratuito">Gratuito · OpenRouter :free ($0.00)</option>
                    {modelosPagosHabilitados && (
                      <>
                        <option value="economico">Económico · gemini-3.1-flash-lite ($0.075/$0.30 1M)</option>
                        <option value="balanceado">Estándar · gemini-4-hydrogen ($0.30/$2.50 1M)</option>
                        <option value="alta">Alta Precisión · gemini-4-neon ($1.25/$10.00 1M)</option>
                      </>
                    )}
                  </select>
                  {guardandoModelo && <Loader2 className="w-3 h-3 animate-spin text-sky-400" />}
                </div>
              </div>

              {geminiPrecisionState && (
                <div className="space-y-2 pt-2 border-t border-slate-800/80">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-400">
                    <span>
                      Hoy ({geminiPrecisionState.fechaActual}):{' '}
                      <strong className="text-emerald-300 font-mono">
                        ${geminiPrecisionState.costoTotalHoyUsd.toFixed(4)} USD
                      </strong>{' '}
                      ({geminiPrecisionState.consultasTotalesHoy} consultas)
                      {modelosPagosHabilitados && (
                        <>
                          {' '}· Histórico:{' '}
                          <strong className="text-sky-300 font-mono">
                            ${geminiPrecisionState.costoHistoricoUsd.toFixed(4)} USD
                          </strong>
                        </>
                      )}
                    </span>
                    {modelosPagosHabilitados && (
                      <select
                        value={politicaCfg}
                        onChange={e => setPoliticaCfg(e.target.value as PoliticaLimiteModelo)}
                        className="bg-slate-900 border border-slate-700 rounded px-2 py-0.5 text-[10px] text-slate-200"
                      >
                        <option value="bloquear">Al llegar al límite: Bloquear modelo</option>
                        <option value="fallback_economico">Al llegar al límite: Auto-bajar a Económico</option>
                      </select>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    {(modelosPagosHabilitados
                      ? geminiPrecisionState.modelos
                      : geminiPrecisionState.modelos.filter(m => m.nivelId === 'gratuito')
                    ).map(m => {
                      const draft = limitesCfg[m.modelo] || {
                        maxConsultasDiarias: String(m.maxConsultasDiarias),
                        maxCostoUsdDiario: String(m.maxCostoUsdDiario),
                      };
                      const esOpenRouter = m.proveedor === 'openrouter';
                      return (
                        <div
                          key={m.modelo}
                          className="grid grid-cols-1 sm:grid-cols-12 gap-1.5 items-center bg-slate-900/80 border border-slate-800 rounded-lg px-2.5 py-1.5 text-[10px]"
                        >
                          <div className="sm:col-span-6 min-w-0">
                            <div className="font-bold text-slate-100 truncate">
                              {m.etiquetaNivel}{' '}
                              <span className={`font-mono font-normal ${esOpenRouter ? 'text-emerald-300' : 'text-sky-300'}`}>
                                ({m.modelo})
                              </span>
                            </div>
                            <div className="text-[9px] font-mono text-slate-400 tabular-nums">
                              Hoy: {m.usoHoy.consultas} cons. · ${m.usoHoy.costoUsd.toFixed(4)} USD ·{' '}
                              {esOpenRouter ? 'Gratis $0' : `Tarifa $${m.costoInputPor1M}/${m.costoOutputPor1M}`}
                            </div>
                          </div>
                          <div className={esOpenRouter ? 'sm:col-span-6' : 'sm:col-span-3'}>
                            <label className="block text-[9px] text-slate-500">Cons./día (0 = ∞)</label>
                            <input
                              type="number"
                              min={0}
                              step={1}
                              value={draft.maxConsultasDiarias}
                              onChange={e =>
                                setLimitesCfg(prev => ({
                                  ...prev,
                                  [m.modelo]: { ...draft, maxConsultasDiarias: e.target.value },
                                }))
                              }
                              className="w-full bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-[10px] font-mono text-white"
                            />
                          </div>
                          {!esOpenRouter && (
                            <div className="sm:col-span-3">
                              <label className="block text-[9px] text-slate-500">Tope USD/día</label>
                              <input
                                type="number"
                                min={0}
                                step={0.05}
                                value={draft.maxCostoUsdDiario}
                                onChange={e =>
                                  setLimitesCfg(prev => ({
                                    ...prev,
                                    [m.modelo]: { ...draft, maxCostoUsdDiario: e.target.value },
                                  }))
                                }
                                className="w-full bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-[10px] font-mono text-white"
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <span className="text-[10px] text-emerald-300">{msgLimites || ''}</span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => void resetearUsoGemini()}
                        disabled={guardandoModelo}
                        className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-[10px] font-semibold cursor-pointer disabled:opacity-60"
                      >
                        Reiniciar hoy
                      </button>
                      <button
                        type="button"
                        onClick={() => void guardarLimitesYCostos()}
                        disabled={guardandoModelo}
                        className="px-2.5 py-1 rounded bg-sky-600 hover:bg-sky-500 text-white text-[10px] font-bold cursor-pointer disabled:opacity-60"
                      >
                        Guardar límites
                      </button>
                    </div>
                  </div>
                </div>
              )}
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

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1 text-[10px] font-mono text-slate-300 border-t border-white/10 pt-2">
                  <div>
                    <span className="text-slate-500">Modelo activo: </span>
                    <span className="text-slate-100">{diagnostico.modelo}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Variable: </span>
                    <span className="text-slate-100 break-all">{diagnostico.variableDetectada}</span>
                  </div>
                  {diagnostico.codigoHttp != null && (
                    <div>
                      <span className="text-slate-500">HTTP: </span>
                      <span className={diagnostico.ok ? 'text-emerald-300' : 'text-rose-300'}>
                        {String(diagnostico.codigoHttp)}
                      </span>
                    </div>
                  )}
                  {diagnostico.respuestaModelo && (
                    <div>
                      <span className="text-slate-500">Respuesta: </span>
                      <span className="text-emerald-300">{diagnostico.respuestaModelo}</span>
                    </div>
                  )}
                  {diagnostico.estadoProceso && (
                    <div className="sm:col-span-2 text-slate-400 break-words">
                      <span className="text-slate-500">Proceso: </span>
                      <span>
                        PID {diagnostico.estadoProceso.pid} · {diagnostico.estadoProceso.nodeEnv} · uptime {diagnostico.estadoProceso.uptimeSegundos}s · SDK {diagnostico.estadoProceso.clienteSdkInicializado ? 'activo' : 'inactivo'}
                      </span>
                    </div>
                  )}
                </div>

                {Array.isArray(diagnostico.resultadosPorModelo) && diagnostico.resultadosPorModelo.length > 0 && (
                  <div className="border-t border-white/10 pt-2 space-y-1">
                    <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                      Pruebas por modelo y clave:
                    </div>
                    <div className="space-y-1">
                      {diagnostico.resultadosPorModelo.map((r, i) => (
                        <div
                          key={`${r.modelo}-${r.fuenteClave}-${i}`}
                          className="flex items-center justify-between gap-2 text-[10px] font-mono bg-black/25 rounded-lg px-2 py-1"
                        >
                          <span className="truncate text-slate-200">
                            {r.modelo} <span className="text-slate-500">({r.fuenteClave})</span>
                          </span>
                          <span className={`shrink-0 ${r.ok ? 'text-emerald-300' : 'text-rose-300'}`}>
                            {r.ok ? `OK (${r.latenciaMs}ms)` : `${r.estado} ${r.codigoHttp ?? ''}`}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <p className="text-[11px] leading-relaxed text-slate-200 border-t border-white/10 pt-2">
                  {diagnostico.detalle}
                </p>

                {diagnostico.errorTecnico && (
                  <div className="rounded-lg bg-black/30 border border-white/10 p-2 text-[10px] font-mono text-rose-200 break-words">
                    <span className="text-rose-400 font-semibold">
                      [{diagnostico.errorTecnico.nombre}
                      {diagnostico.errorTecnico.codigoHttp != null ? ` · HTTP ${diagnostico.errorTecnico.codigoHttp}` : ''}]
                    </span>{' '}
                    {diagnostico.errorTecnico.mensaje}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="pt-3 flex flex-wrap items-center justify-end gap-2 border-t border-slate-800">
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
