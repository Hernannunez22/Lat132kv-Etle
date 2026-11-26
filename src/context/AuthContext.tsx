import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  ReactNode,
} from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import {
  AppConfig,
  PrecisionNivelId,
  GeminiPrecisionState,
  PoliticaLimiteModelo,
} from '../types';
import { auth } from '../firebase';
import { apiFetch, readJsonResponse } from '../utils/apiClient';
import {
  clearGoogleDriveAccessToken,
  getGoogleDriveAccessToken,
  signInWithGoogleDrive,
  signOutGoogleDrive,
} from '../utils/googleAuth';
import {
  iniciarSesionCorreoCorporativo,
  reenviarVerificacionCorreo,
  registrarConCorreoCorporativo,
  restablecerClaveCorreo,
  verificarEstadoEmailActual,
} from '../utils/corporateAuth';
import {
  BOOTSTRAP_ADMIN_EMAIL,
  WorkspaceIAControlState,
  WorkspaceInviteRecord,
  WorkspaceSessionInfo,
  bootstrapWorkspaceForUser,
  invitarColaboradorWorkspace,
  listarInvitacionesWorkspace,
  revocarInvitacionWorkspace,
  setWorkspaceIAControl,
  subscribeWorkspaceIAControl,
  syncWorkspaceSettingsFields,
} from '../utils/firestoreSync';
import { useUI } from './UIContext';
import { CloudSyncStatus } from './sharedTypes';

export interface AuthContextType {
  config: AppConfig;
  setConfig: React.Dispatch<React.SetStateAction<AppConfig>>;
  updateConfig: (cfg: AppConfig) => void;
  cloudSyncStatus: CloudSyncStatus;
  cloudUserEmail: string | null;
  cloudRole: 'admin' | 'engineer' | null;
  cloudSession: WorkspaceSessionInfo | null;
  setCloudSession: React.Dispatch<React.SetStateAction<WorkspaceSessionInfo | null>>;
  cloudSessionRef: React.MutableRefObject<WorkspaceSessionInfo | null>;
  conectarNubeDispositivos: () => Promise<void>;
  conectarCorreoCorporativo: (email: string, password: string) => Promise<{ emailVerified: boolean }>;
  registrarCorreoCorporativo: (email: string, password: string, nombre?: string) => Promise<void>;
  reenviarMailVerificacion: () => Promise<void>;
  reintentarConexionNube: () => Promise<
    'sincronizado' | 'verificacion-pendiente' | 'acceso-pendiente' | 'sin-sesion'
  >;
  enviarResetClaveCorreo: (email: string) => Promise<void>;
  desconectarNubeDispositivos: () => Promise<void>;
  invitarColaboradorNube: (email: string) => Promise<void>;
  listarInvitacionesNube: () => Promise<WorkspaceInviteRecord[]>;
  revocarInvitacionNube: (inviteId: string) => Promise<void>;
  precisionNivel: PrecisionNivelId;
  setPrecisionNivel: (nivel: PrecisionNivelId) => void;
  geminiPrecisionState: GeminiPrecisionState | null;
  setGeminiPrecisionState: React.Dispatch<React.SetStateAction<GeminiPrecisionState | null>>;
  esUsuarioMaestro: boolean;
  modelosPagosHabilitados: boolean;
  puedeUsarModelosPagos: boolean;
  usuariosPagosAutorizados: string[];
  limitesPorUsuarioUsd: Record<string, number>;
  toggleModelosPagosMaestro: (habilitado: boolean) => Promise<GeminiPrecisionState | null>;
  actualizarControlMaestroIA: (payload: {
    modelosPagosHabilitados?: boolean;
    usuariosPagosAutorizados?: string[];
    limitesPorUsuarioUsd?: Record<string, number>;
  }) => Promise<GeminiPrecisionState | null>;
  refrescarEstadoGemini: () => Promise<GeminiPrecisionState | null>;
  guardarConfigPrecision: (payload: {
    nivelPreferido?: PrecisionNivelId;
    politicaLimite?: PoliticaLimiteModelo;
    openRouterModeloPreferido?: string;
    limitesPorModelo?: Record<string, { maxConsultasDiarias?: number; maxCostoUsdDiario?: number }>;
  }) => Promise<GeminiPrecisionState | null>;
  resetearUsoGemini: (modelo?: string) => Promise<GeminiPrecisionState | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { setConnectionStatus } = useUI();

  // Config
  const [config, setConfig] = useState<AppConfig>(() => ({
    apiUrl: localStorage.getItem('cfg_api_url') || '',
    r2AccountId: localStorage.getItem('cfg_r2_account_id') || 'e1d197bd1aa5e242733d883eab2a9322',
    r2Bucket: localStorage.getItem('cfg_r2_bucket') || 'backup-obra-132kv',
  }));

  const [cloudSyncStatus, setCloudSyncStatus] = useState<CloudSyncStatus>('sin-sesion');
  const [cloudUserEmail, setCloudUserEmail] = useState<string | null>(null);
  const [cloudSession, setCloudSession] = useState<WorkspaceSessionInfo | null>(null);
  const cloudSessionRef = useRef<WorkspaceSessionInfo | null>(null);
  useEffect(() => {
    cloudSessionRef.current = cloudSession;
  }, [cloudSession]);

  const [precisionNivel, setPrecisionNivelState] = useState<PrecisionNivelId>(() => {
    try {
      const saved = localStorage.getItem('cfg_gemini_precision_nivel');
      if (
        saved === 'gratuito' ||
        saved === 'economico' ||
        saved === 'balanceado' ||
        saved === 'alta'
      ) {
        return saved;
      }
    } catch {}
    return 'gratuito';
  });
  const [geminiPrecisionState, setGeminiPrecisionState] = useState<GeminiPrecisionState | null>(null);
  const [firestoreIAControl, setFirestoreIAControl] = useState<WorkspaceIAControlState | null>(null);

  const esUsuarioMaestro = Boolean(
    cloudSession?.email?.toLowerCase().trim() === BOOTSTRAP_ADMIN_EMAIL ||
      geminiPrecisionState?.esUsuarioMaestro
  );
  const modelosPagosHabilitados =
    firestoreIAControl !== null
      ? firestoreIAControl.modelosPagosHabilitados
      : Boolean(geminiPrecisionState?.modelosPagosHabilitados);
  const usuariosPagosAutorizados = useMemo(
    () =>
      firestoreIAControl !== null
        ? firestoreIAControl.usuariosPagosAutorizados
        : geminiPrecisionState?.usuariosPagosAutorizados || [],
    [firestoreIAControl, geminiPrecisionState?.usuariosPagosAutorizados]
  );
  const limitesPorUsuarioUsd = useMemo(
    () =>
      firestoreIAControl?.limitesPorUsuarioUsd && Object.keys(firestoreIAControl.limitesPorUsuarioUsd).length > 0
        ? firestoreIAControl.limitesPorUsuarioUsd
        : geminiPrecisionState?.limitesPorUsuarioUsd || {},
    [firestoreIAControl?.limitesPorUsuarioUsd, geminiPrecisionState?.limitesPorUsuarioUsd]
  );
  const puedeUsarModelosPagos = (() => {
    if (!modelosPagosHabilitados) return false;
    if (firestoreIAControl !== null) {
      const emailActual = cloudSession?.email?.toLowerCase().trim();
      return Boolean(emailActual && firestoreIAControl.usuariosPagosAutorizados.includes(emailActual));
    }
    return Boolean(geminiPrecisionState?.puedeUsarModelosPagos);
  })();

  const setPrecisionNivel = useCallback((nivel: PrecisionNivelId) => {
    setPrecisionNivelState(nivel);
    try {
      localStorage.setItem('cfg_gemini_precision_nivel', nivel);
    } catch {}
  }, []);

  useEffect(() => {
    if (!puedeUsarModelosPagos && precisionNivel !== 'gratuito') {
      setPrecisionNivel('gratuito');
    }
  }, [puedeUsarModelosPagos, precisionNivel, setPrecisionNivel]);

  const refrescarEstadoGemini = useCallback(async (): Promise<GeminiPrecisionState | null> => {
    try {
      const res = await apiFetch('/api/gemini/config');
      if (!res.ok) return null;
      const data = await res.json();
      if (data?.precisionState) {
        setGeminiPrecisionState(data.precisionState as GeminiPrecisionState);
        return data.precisionState as GeminiPrecisionState;
      }
    } catch {}
    return null;
  }, []);

  const actualizarControlMaestroIA = useCallback(
    async (payload: {
      modelosPagosHabilitados?: boolean;
      usuariosPagosAutorizados?: string[];
      limitesPorUsuarioUsd?: Record<string, number>;
    }): Promise<GeminiPrecisionState | null> => {
      const sess = cloudSessionRef.current;
      const esMaestroActual = Boolean(
        sess?.email?.toLowerCase().trim() === BOOTSTRAP_ADMIN_EMAIL ||
          geminiPrecisionState?.esUsuarioMaestro
      );
      if (!esMaestroActual) {
        throw new Error('Solo el administrador maestro puede administrar el acceso a modelos pagos.');
      }

      const nextHabilitado =
        typeof payload.modelosPagosHabilitados === 'boolean'
          ? payload.modelosPagosHabilitados
          : modelosPagosHabilitados;

      let nextUsers = Array.isArray(payload.usuariosPagosAutorizados)
        ? Array.from(
            new Set(
              payload.usuariosPagosAutorizados
                .map(e => String(e || '').trim().toLowerCase())
                .filter(e => e.includes('@') && e.includes('.'))
            )
          ).sort()
        : [...usuariosPagosAutorizados];

      if (
        payload.modelosPagosHabilitados === true &&
        !Array.isArray(payload.usuariosPagosAutorizados) &&
        nextUsers.length === 0
      ) {
        nextUsers = [BOOTSTRAP_ADMIN_EMAIL];
      }

      const rawLimits =
        payload.limitesPorUsuarioUsd && typeof payload.limitesPorUsuarioUsd === 'object'
          ? payload.limitesPorUsuarioUsd
          : limitesPorUsuarioUsd;
      const nextLimits: Record<string, number> = {};
      for (const [emailKey, usdVal] of Object.entries(rawLimits)) {
        const cleanEmail = String(emailKey || '').trim().toLowerCase();
        const num = Number(usdVal);
        if (cleanEmail.includes('@') && Number.isFinite(num) && num > 0) {
          nextLimits[cleanEmail] = Math.round(num * 100) / 100;
        }
      }

      const res = await apiFetch('/api/gemini/master-control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modelosPagosHabilitados: nextHabilitado,
          usuariosPagosAutorizados: nextUsers,
          limitesPorUsuarioUsd: nextLimits,
        }),
      });
      const data = await readJsonResponse(res, 'Error actualizando control maestro de IA');
      let updatedState: GeminiPrecisionState | null = null;
      if (data?.precisionState) {
        updatedState = data.precisionState as GeminiPrecisionState;
        setGeminiPrecisionState(updatedState);
      }

      if (sess) {
        const nextControl: WorkspaceIAControlState = {
          modelosPagosHabilitados: nextHabilitado,
          usuariosPagosAutorizados: nextUsers,
          limitesPorUsuarioUsd: nextLimits,
        };
        await setWorkspaceIAControl(sess, nextControl);
        setFirestoreIAControl(nextControl);
      }

      if (!nextHabilitado) {
        setPrecisionNivel('gratuito');
      }
      return updatedState;
    },
    [
      geminiPrecisionState?.esUsuarioMaestro,
      modelosPagosHabilitados,
      usuariosPagosAutorizados,
      limitesPorUsuarioUsd,
      setPrecisionNivel,
    ]
  );

  const toggleModelosPagosMaestro = useCallback(
    async (habilitado: boolean): Promise<GeminiPrecisionState | null> => {
      return actualizarControlMaestroIA({ modelosPagosHabilitados: Boolean(habilitado) });
    },
    [actualizarControlMaestroIA]
  );

  const guardarConfigPrecision = useCallback(
    async (payload: {
      nivelPreferido?: PrecisionNivelId;
      politicaLimite?: PoliticaLimiteModelo;
      openRouterModeloPreferido?: string;
      limitesPorModelo?: Record<string, { maxConsultasDiarias?: number; maxCostoUsdDiario?: number }>;
    }): Promise<GeminiPrecisionState | null> => {
      const effectivePayload = !puedeUsarModelosPagos
        ? { ...payload, nivelPreferido: 'gratuito' as PrecisionNivelId }
        : payload;
      if (effectivePayload.nivelPreferido) {
        setPrecisionNivel(effectivePayload.nivelPreferido);
      }
      const res = await apiFetch('/api/gemini/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(effectivePayload),
      });
      const data = await readJsonResponse(res, 'Error guardando límites de modelos IA');
      if (data?.precisionState) {
        setGeminiPrecisionState(data.precisionState as GeminiPrecisionState);
        return data.precisionState as GeminiPrecisionState;
      }
      return null;
    },
    [puedeUsarModelosPagos, setPrecisionNivel]
  );

  const resetearUsoGemini = useCallback(
    async (modelo?: string): Promise<GeminiPrecisionState | null> => {
      const res = await apiFetch('/api/gemini/reset-uso', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelo }),
      });
      const data = await readJsonResponse(res, 'Error reiniciando uso diario de IA');
      if (data?.precisionState) {
        setGeminiPrecisionState(data.precisionState as GeminiPrecisionState);
        return data.precisionState as GeminiPrecisionState;
      }
      return null;
    },
    []
  );

  useEffect(() => {
    void refrescarEstadoGemini();
  }, [refrescarEstadoGemini, cloudSession?.uid]);

  const masterInitSeededRef = useRef<boolean>(false);
  useEffect(() => {
    if (!cloudSession) {
      setFirestoreIAControl(null);
      masterInitSeededRef.current = false;
      return;
    }

    const esMaestroSess = cloudSession.email.toLowerCase().trim() === BOOTSTRAP_ADMIN_EMAIL;
    const unsubControl = subscribeWorkspaceIAControl(cloudSession.workspaceId, val => {
      setFirestoreIAControl(val);
      if (val === null) {
        if (esMaestroSess && !masterInitSeededRef.current) {
          masterInitSeededRef.current = true;
          void setWorkspaceIAControl(cloudSession, {
            modelosPagosHabilitados: false,
            usuariosPagosAutorizados: [],
            limitesPorUsuarioUsd: {},
          }).catch(() => {
            masterInitSeededRef.current = false;
          });
        }
        return;
      }

      if (esMaestroSess) {
        void apiFetch('/api/gemini/master-control', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            modelosPagosHabilitados: val.modelosPagosHabilitados,
            usuariosPagosAutorizados: val.usuariosPagosAutorizados,
            limitesPorUsuarioUsd: val.limitesPorUsuarioUsd || {},
          }),
        })
          .then(r => (r.ok ? r.json() : null))
          .then(data => {
            if (data?.precisionState) {
              setGeminiPrecisionState(data.precisionState as GeminiPrecisionState);
            }
          })
          .catch(() => {});
      }
    });

    return () => {
      unsubControl();
    };
  }, [cloudSession]);

  const attachUserToWorkspace = useCallback(
    async (
      user: User | null,
      isCancelled?: () => boolean
    ): Promise<'sincronizado' | 'verificacion-pendiente' | 'acceso-pendiente' | 'sin-sesion'> => {
      if (!user) {
        clearGoogleDriveAccessToken();
        setCloudSession(null);
        cloudSessionRef.current = null;
        setCloudUserEmail(null);
        setCloudSyncStatus('sin-sesion');
        setConnectionStatus('Local');
        return 'sin-sesion';
      }

      setCloudUserEmail(user.email || null);

      if (!user.emailVerified) {
        setCloudSession(null);
        cloudSessionRef.current = null;
        setCloudSyncStatus('verificacion-pendiente');
        setConnectionStatus('Verificar Mail');
        return 'verificacion-pendiente';
      }

      setCloudSyncStatus('conectando');

      try {
        const session = await bootstrapWorkspaceForUser(user);
        if (isCancelled?.()) return 'sin-sesion';

        if (!session) {
          setCloudSession(null);
          cloudSessionRef.current = null;
          setCloudSyncStatus('acceso-pendiente');
          setConnectionStatus('Acceso Pendiente');
          return 'acceso-pendiente';
        }

        setCloudSession(session);
        cloudSessionRef.current = session;
        setCloudSyncStatus('sincronizado');
        setConnectionStatus('Nube Sync ✓');
        return 'sincronizado';
      } catch (err) {
        console.error('[FirestoreSync] Error conectando nube:', err);
        setCloudSyncStatus('error');
        return 'acceso-pendiente';
      }
    },
    [setConnectionStatus]
  );

  // Escucha Firebase Auth para todos los dispositivos
  useEffect(() => {
    let cancelado = false;
    const unsubAuth = onAuthStateChanged(auth, async user => {
      await attachUserToWorkspace(user, () => cancelado);
    });

    return () => {
      cancelado = true;
      unsubAuth();
    };
  }, [attachUserToWorkspace]);

  const conectarNubeDispositivos = useCallback(async () => {
    setCloudSyncStatus('conectando');
    try {
      const res = await signInWithGoogleDrive({ forceConsent: false, includeDriveScope: true });
      void (res?.accessToken || getGoogleDriveAccessToken());
    } catch (err) {
      setCloudSyncStatus('error');
      throw err;
    }
  }, []);

  const conectarCorreoCorporativo = useCallback(
    async (email: string, password: string) => {
      setCloudSyncStatus('conectando');
      try {
        const res = await iniciarSesionCorreoCorporativo({ email, password });
        await attachUserToWorkspace(res.user);
        return { emailVerified: res.emailVerified };
      } catch (err) {
        setCloudSyncStatus('sin-sesion');
        throw err;
      }
    },
    [attachUserToWorkspace]
  );

  const registrarCorreoCorporativo = useCallback(
    async (email: string, password: string, nombre?: string) => {
      setCloudSyncStatus('conectando');
      try {
        const res = await registrarConCorreoCorporativo({ email, password, nombre });
        await attachUserToWorkspace(res.user);
      } catch (err) {
        setCloudSyncStatus('sin-sesion');
        throw err;
      }
    },
    [attachUserToWorkspace]
  );

  const reenviarMailVerificacion = useCallback(async () => {
    await reenviarVerificacionCorreo();
  }, []);

  const reintentarConexionNube = useCallback(async () => {
    const checked = await verificarEstadoEmailActual();
    if (!checked) {
      setCloudSyncStatus('sin-sesion');
      return 'sin-sesion' as const;
    }
    return attachUserToWorkspace(checked.user);
  }, [attachUserToWorkspace]);

  const enviarResetClaveCorreo = useCallback(async (email: string) => {
    await restablecerClaveCorreo(email);
  }, []);

  const desconectarNubeDispositivos = useCallback(async () => {
    await signOutGoogleDrive();
    setCloudSession(null);
    cloudSessionRef.current = null;
    setCloudUserEmail(null);
    setCloudSyncStatus('sin-sesion');
    setConnectionStatus('Local');
  }, [setConnectionStatus]);

  const invitarColaboradorNube = useCallback(async (email: string) => {
    const sess = cloudSessionRef.current;
    if (!sess) {
      throw new Error(
        'Primero conecta tu cuenta administradora en Sincronización Multi-Dispositivo.'
      );
    }
    await invitarColaboradorWorkspace({ session: sess, emailColaborador: email });
  }, []);

  const listarInvitacionesNube = useCallback(async () => {
    const sess = cloudSessionRef.current;
    if (!sess) return [];
    return listarInvitacionesWorkspace(sess);
  }, []);

  const revocarInvitacionNube = useCallback(async (inviteId: string) => {
    const sess = cloudSessionRef.current;
    if (!sess) {
      throw new Error('Debes estar conectado como administrador para revocar accesos.');
    }
    await revocarInvitacionWorkspace(sess, inviteId);
  }, []);

  const updateConfig = useCallback((newCfg: AppConfig) => {
    setConfig(newCfg);
    localStorage.setItem('cfg_api_url', newCfg.apiUrl);
    localStorage.setItem('cfg_r2_account_id', newCfg.r2AccountId);
    localStorage.setItem('cfg_r2_bucket', newCfg.r2Bucket);

    const sess = cloudSessionRef.current;
    if (sess) {
      syncWorkspaceSettingsFields(sess, { config: newCfg }).catch(err =>
        console.warn('[FirestoreSync] Error guardando config:', err)
      );
    }
  }, []);

  const cloudRole = cloudSession?.role || null;

  const value = useMemo<AuthContextType>(
    () => ({
      config,
      setConfig,
      updateConfig,
      cloudSyncStatus,
      cloudUserEmail,
      cloudRole,
      cloudSession,
      setCloudSession,
      cloudSessionRef,
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
      setGeminiPrecisionState,
      esUsuarioMaestro,
      modelosPagosHabilitados,
      puedeUsarModelosPagos,
      usuariosPagosAutorizados,
      limitesPorUsuarioUsd,
      toggleModelosPagosMaestro,
      actualizarControlMaestroIA,
      refrescarEstadoGemini,
      guardarConfigPrecision,
      resetearUsoGemini,
    }),
    [
      config,
      updateConfig,
      cloudSyncStatus,
      cloudUserEmail,
      cloudRole,
      cloudSession,
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
      puedeUsarModelosPagos,
      usuariosPagosAutorizados,
      limitesPorUsuarioUsd,
      toggleModelosPagosMaestro,
      actualizarControlMaestroIA,
      refrescarEstadoGemini,
      guardarConfigPrecision,
      resetearUsoGemini,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
