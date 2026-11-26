import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  ReactNode,
} from 'react';
import { DriveConnectionState } from '../types';
import { apiFetch, readJsonResponse, tryReadJsonResponse } from '../utils/apiClient';
import {
  DEFAULT_DRIVE_ROOT_FOLDER_ID,
  clearGoogleDriveAccessToken,
  extraerDriveFolderId,
  getGoogleDriveAccessToken,
  getGoogleDriveTokenInfo,
  markDriveConsentNeeded,
  runWithDriveToken,
  signInWithGoogleDrive,
  subscribeDriveToken,
} from '../utils/googleAuth';
import { syncWorkspaceSettingsFields } from '../utils/firestoreSync';
import { useAuth } from './AuthContext';
import { DriveSyncSnapshot } from './sharedTypes';

export interface DriveContextType {
  driveDocsCount: number;
  setDriveDocsCount: React.Dispatch<React.SetStateAction<number>>;
  hasDriveToken: boolean;
  setHasDriveToken: React.Dispatch<React.SetStateAction<boolean>>;
  driveFolderId: string;
  setDriveFolderId: (val: string) => void;
  setDriveFolderIdState: React.Dispatch<React.SetStateAction<string>>;
  driveConnectionState: DriveConnectionState;
  setDriveConnectionState: React.Dispatch<React.SetStateAction<DriveConnectionState>>;
  ultimaSyncDrive: DriveSyncSnapshot | null;
  registrarSyncDrive: (tipo: string, resumen: string) => void;
  verificarConexionDriveLive: (
    folderIdOverride?: string,
    tokenOverride?: string
  ) => Promise<DriveConnectionState | null>;
  conectarGoogleDriveChat: (options?: { forceConsent?: boolean }) => Promise<boolean>;
  desconectarGoogleDrive: () => Promise<void>;
  sincronizarDocsTecnicosDrive: (params?: {
    folderId?: string;
    maxNuevos?: number;
  }) => Promise<{
    totalIndexados: number;
    nuevos: number;
    omitidosExistentes: number;
    nombresNuevos: string[];
  }>;
}

const DriveContext = createContext<DriveContextType | undefined>(undefined);

export const DriveProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { cloudSessionRef, cloudSyncStatus } = useAuth();

  const [driveDocsCount, setDriveDocsCount] = useState<number>(0);
  const [hasDriveToken, setHasDriveToken] = useState<boolean>(() => Boolean(getGoogleDriveAccessToken()));
  const [driveFolderId, setDriveFolderIdState] = useState<string>(
    () => localStorage.getItem('drive_folder_notas_libro_132kv') || DEFAULT_DRIVE_ROOT_FOLDER_ID
  );
  const [ultimaSyncDrive, setUltimaSyncDrive] = useState<DriveSyncSnapshot | null>(() => {
    try {
      const saved = localStorage.getItem('ultima_sync_drive_132kv');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed.fechaIso === 'string') return parsed as DriveSyncSnapshot;
      }
    } catch {}
    return null;
  });

  const registrarSyncDrive = useCallback((tipo: string, resumen: string) => {
    const snap: DriveSyncSnapshot = {
      fechaIso: new Date().toISOString(),
      tipo,
      resumen,
    };
    setUltimaSyncDrive(snap);
    try {
      localStorage.setItem('ultima_sync_drive_132kv', JSON.stringify(snap));
    } catch {}
  }, []);

  const setDriveFolderId = useCallback(
    (val: string) => {
      setDriveFolderIdState(val);
      try {
        localStorage.setItem('drive_folder_notas_libro_132kv', val);
      } catch {}
      const sess = cloudSessionRef.current;
      if (sess && sess.role === 'admin' && val.trim()) {
        syncWorkspaceSettingsFields(sess, { defaultDriveFolderId: val.trim() }).catch(() => {});
      }
    },
    [cloudSessionRef]
  );

  const [driveConnectionState, setDriveConnectionState] = useState<DriveConnectionState>(() => {
    const info = getGoogleDriveTokenInfo();
    return {
      connected: info.hasToken,
      verificando: false,
      permisoLecturaDrive: info.hasToken,
      accountEmail: info.accountEmail,
      accountName: info.accountName,
      remainingMinutes: info.remainingMinutes,
      rootFolderId: extraerDriveFolderId(
        localStorage.getItem('drive_folder_notas_libro_132kv') || ''
      ),
      rootFolderName: null,
      rootFolderAccessible: false,
      subcarpetas: [],
      elencosAccesible: false,
      error: null,
      ultimaVerificacion: null,
    };
  });

  const verificarConexionDriveLive = useCallback(
    async (
      folderIdOverride?: string,
      tokenOverride?: string
    ): Promise<DriveConnectionState | null> => {
      const token = tokenOverride || getGoogleDriveAccessToken();
      const targetFolderId = extraerDriveFolderId(folderIdOverride ?? driveFolderId);
      if (!token) {
        setHasDriveToken(false);
        const vacio: DriveConnectionState = {
          connected: false,
          verificando: false,
          permisoLecturaDrive: false,
          accountEmail: null,
          accountName: null,
          remainingMinutes: 0,
          rootFolderId: targetFolderId,
          rootFolderName: null,
          rootFolderAccessible: false,
          subcarpetas: [],
          elencosAccesible: false,
          error: null,
          ultimaVerificacion: null,
        };
        setDriveConnectionState(vacio);
        return null;
      }

      const tokenInfo = getGoogleDriveTokenInfo();
      setDriveConnectionState(prev => ({
        ...prev,
        connected: true,
        verificando: true,
        accountEmail: tokenInfo.accountEmail || prev.accountEmail,
        accountName: tokenInfo.accountName || prev.accountName,
        remainingMinutes: tokenInfo.remainingMinutes || prev.remainingMinutes,
        rootFolderId: targetFolderId,
        error: null,
      }));

      try {
        const res = await apiFetch('/api/drive/verificar', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ folderId: targetFolderId }),
        });
        const data = await tryReadJsonResponse(res);

        if (res.status === 401) {
          clearGoogleDriveAccessToken();
          setHasDriveToken(false);
          const nextState: DriveConnectionState = {
            connected: false,
            verificando: false,
            permisoLecturaDrive: false,
            accountEmail: null,
            accountName: null,
            remainingMinutes: 0,
            rootFolderId: targetFolderId,
            rootFolderName: null,
            rootFolderAccessible: false,
            subcarpetas: [],
            elencosAccesible: false,
            error: data?.error || 'La sesión de Google Drive venció.',
            ultimaVerificacion: new Date().toISOString(),
          };
          setDriveConnectionState(nextState);
          return nextState;
        }

        if (res.status === 403 && data && !data.permisoLecturaDrive) {
          markDriveConsentNeeded(true);
        }

        const nextState: DriveConnectionState = {
          connected: Boolean(data?.conectado ?? res.ok),
          verificando: false,
          permisoLecturaDrive: Boolean(data?.permisoLecturaDrive),
          accountEmail: data?.usuarioEmail || tokenInfo.accountEmail || null,
          accountName: data?.usuarioNombre || tokenInfo.accountName || null,
          remainingMinutes: tokenInfo.remainingMinutes,
          rootFolderId: targetFolderId,
          rootFolderName: data?.carpetaRaizNombre || null,
          rootFolderAccessible: Boolean(data?.carpetaRaizAccesible),
          subcarpetas: Array.isArray(data?.subcarpetas) ? data.subcarpetas : [],
          elencosAccesible: Boolean(data?.elencosAccesible),
          sugerencia: data?.sugerencia || undefined,
          error: !res.ok ? data?.error || `HTTP ${res.status}` : data?.sugerencia || null,
          ultimaVerificacion: new Date().toISOString(),
        };
        setDriveConnectionState(nextState);
        return nextState;
      } catch (err: any) {
        const fallbackState: DriveConnectionState = {
          connected: true,
          verificando: false,
          permisoLecturaDrive: true,
          accountEmail: tokenInfo.accountEmail,
          accountName: tokenInfo.accountName,
          remainingMinutes: tokenInfo.remainingMinutes,
          rootFolderId: targetFolderId,
          rootFolderName: null,
          rootFolderAccessible: false,
          subcarpetas: [],
          elencosAccesible: false,
          error: err?.message || 'No se pudo verificar la carpeta de Google Drive.',
          ultimaVerificacion: new Date().toISOString(),
        };
        setDriveConnectionState(fallbackState);
        return fallbackState;
      }
    },
    [driveFolderId]
  );

  // Limpiar estado completo de Drive cuando se cierra sesión
  useEffect(() => {
    if (cloudSyncStatus === 'sin-sesion') {
      setHasDriveToken(Boolean(getGoogleDriveAccessToken()));
      if (!getGoogleDriveAccessToken()) {
        setDriveConnectionState(prev => ({
          ...prev,
          connected: false,
          verificando: false,
          permisoLecturaDrive: false,
          accountEmail: null,
          accountName: null,
          remainingMinutes: 0,
          rootFolderName: null,
          rootFolderAccessible: false,
          subcarpetas: [],
          elencosAccesible: false,
          error: null,
        }));
      }
    }
  }, [cloudSyncStatus]);

  useEffect(() => {
    const tokenInicial = getGoogleDriveAccessToken();
    if (tokenInicial) {
      setHasDriveToken(true);
      void verificarConexionDriveLive(driveFolderId, tokenInicial);
    }
    return subscribeDriveToken(token => {
      setHasDriveToken(Boolean(token));
      if (token) {
        void verificarConexionDriveLive(driveFolderId, token);
      } else {
        setDriveConnectionState(prev => ({
          ...prev,
          connected: false,
          verificando: false,
          permisoLecturaDrive: false,
          remainingMinutes: 0,
        }));
      }
    });
  }, [verificarConexionDriveLive, driveFolderId]);

  useEffect(() => {
    if (!hasDriveToken) return;
    const timer = setInterval(() => {
      const info = getGoogleDriveTokenInfo();
      setHasDriveToken(info.hasToken);
      setDriveConnectionState(prev => ({
        ...prev,
        connected: info.hasToken,
        remainingMinutes: info.remainingMinutes,
      }));
    }, 30000);
    return () => clearInterval(timer);
  }, [hasDriveToken]);

  const conectarGoogleDriveChat = useCallback(
    async (options?: { forceConsent?: boolean }): Promise<boolean> => {
      const res = await signInWithGoogleDrive({
        forceConsent: Boolean(options?.forceConsent),
        includeDriveScope: true,
      });
      const tok = res?.accessToken || getGoogleDriveAccessToken();
      const ok = Boolean(tok);
      setHasDriveToken(ok);
      if (!ok || !tok) {
        throw new Error(
          'No se recibió el permiso de lectura de Google Drive. Asegúrate de marcar la casilla de Google Drive en la ventana de Google.'
        );
      }
      const diag = await verificarConexionDriveLive(driveFolderId, tok);
      if (diag && !diag.permisoLecturaDrive) {
        markDriveConsentNeeded(true);
        throw new Error(
          diag.sugerencia ||
            'Tu cuenta de Google inició sesión sin permiso de lectura de Drive. Haz clic en "Reautorizar Drive" y marca la casilla de Google Drive.'
        );
      }
      return ok;
    },
    [driveFolderId, verificarConexionDriveLive]
  );

  const desconectarGoogleDrive = useCallback(async () => {
    markDriveConsentNeeded(false);
    clearGoogleDriveAccessToken();
    setHasDriveToken(false);
    setDriveConnectionState(prev => ({
      ...prev,
      connected: false,
      verificando: false,
      permisoLecturaDrive: false,
      accountEmail: null,
      accountName: null,
      remainingMinutes: 0,
      rootFolderName: null,
      rootFolderAccessible: false,
      subcarpetas: [],
      elencosAccesible: false,
      error: null,
    }));
  }, []);

  const sincronizarDocsTecnicosDrive = useCallback(
    async (params?: { folderId?: string; maxNuevos?: number }) => {
      const data = await runWithDriveToken(async token => {
        setHasDriveToken(true);
        const res = await apiFetch('/api/drive-docs/sincronizar', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            folderId: params?.folderId || extraerDriveFolderId(driveFolderId),
            maxNuevos: params?.maxNuevos ?? 15,
          }),
        });
        const json = await readJsonResponse(res, 'Error indexando documentos técnicos desde Drive');
        if (!res.ok || !json?.exito) {
          throw new Error(json?.error || `Error indexando Drive (HTTP ${res.status})`);
        }
        return json;
      });

      const total = Number(data.totalIndexados || 0);
      setDriveDocsCount(total);
      registrarSyncDrive('Docs Técnicos Drive', `${total} documentos técnicos en caché`);
      return {
        totalIndexados: total,
        nuevos: Number(data.nuevos || 0),
        omitidosExistentes: Number(data.omitidosExistentes || 0),
        nombresNuevos: Array.isArray(data.nombresNuevos) ? (data.nombresNuevos as string[]) : [],
      };
    },
    [driveFolderId, registrarSyncDrive]
  );

  const value = useMemo<DriveContextType>(
    () => ({
      driveDocsCount,
      setDriveDocsCount,
      hasDriveToken,
      setHasDriveToken,
      driveFolderId,
      setDriveFolderId,
      setDriveFolderIdState,
      driveConnectionState,
      setDriveConnectionState,
      ultimaSyncDrive,
      registrarSyncDrive,
      verificarConexionDriveLive,
      conectarGoogleDriveChat,
      desconectarGoogleDrive,
      sincronizarDocsTecnicosDrive,
    }),
    [
      driveDocsCount,
      hasDriveToken,
      driveFolderId,
      setDriveFolderId,
      driveConnectionState,
      ultimaSyncDrive,
      registrarSyncDrive,
      verificarConexionDriveLive,
      conectarGoogleDriveChat,
      desconectarGoogleDrive,
      sincronizarDocsTecnicosDrive,
    ]
  );

  return <DriveContext.Provider value={value}>{children}</DriveContext.Provider>;
};

export const useDrive = () => {
  const context = useContext(DriveContext);
  if (!context) throw new Error('useDrive must be used within a DriveProvider');
  return context;
};
