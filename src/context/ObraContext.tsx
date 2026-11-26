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
import {
  Plano,
  Hito,
  Interferencia,
  NotaAudio,
  FotoCampo,
  NotaLibro,
} from '../types';
import {
  TOTAL_PLANIFICADOS_CONTRATO_GLOBAL,
  PLANOS_INICIALES_FIJOS,
  HITOS_CONTRATUALES_INICIALES_FIJOS,
  INTERFERENCIAS_INICIALES,
} from '../data/initialData';
import { apiFetch, readJsonResponse, tryReadJsonResponse } from '../utils/apiClient';
import {
  DEFAULT_DRIVE_ROOT_FOLDER_ID,
  DEFAULT_ELENCOS_FOLDER_ID,
  getGoogleDriveAccessToken,
  runWithDriveToken,
  subscribeDriveToken,
} from '../utils/googleAuth';
import {
  deleteWorkspaceSubdoc,
  syncAudioCampoToFirestore,
  syncFotoCampoToFirestore,
  syncHitosCollectionToFirestore,
  syncInterferenciasCollectionToFirestore,
  syncNotaLibroToFirestore,
  syncNotasLibroCollectionToFirestore,
  syncPlanosCollectionToFirestore,
  syncWorkspaceSettingsFields,
} from '../utils/firestoreSync';
import { useUI } from './UIContext';
import { useAuth } from './AuthContext';
import { useDrive } from './DriveContext';

export function filtrarInterferenciasRealesCache(lista: any[]): Interferencia[] {
  if (!Array.isArray(lista)) return [];
  // Purgar datos ficticios anteriores (INT-1..INT-5 sin origen Drive real)
  return lista.filter(
    item => item && (item.origen === 'drive' || !/^INT-[1-5]$/.test(String(item.id || '')))
  );
}

export interface ObraContextType {
  planos: Plano[];
  setPlanos: React.Dispatch<React.SetStateAction<Plano[]>>;
  hitos: Hito[];
  setHitos: React.Dispatch<React.SetStateAction<Hito[]>>;
  saveHitos: (nuevosHitos: Hito[]) => Promise<void>;
  totalPlanificados: number;
  setTotalPlanificados: React.Dispatch<React.SetStateAction<number>>;
  planificadosPorFrente: Record<string, number>;
  setPlanificadosPorFrente: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  elencosMeta: {
    fuente: string;
    ultimaSincronizacion: string | null;
    archivosAnalizados: number;
    folderId: string;
  };
  setElencosMeta: React.Dispatch<
    React.SetStateAction<{
      fuente: string;
      ultimaSincronizacion: string | null;
      archivosAnalizados: number;
      folderId: string;
    }>
  >;
  aplicarResultadoElencos: (elData: any) => void;
  sincronizarElencosDrive: (params?: {
    accessToken?: string;
    folderId?: string;
  }) => Promise<{ totalPlanificados: number; porFrente: Record<string, number>; fuente: string }>;
  megabytesR2: string;
  setMegabytesR2: React.Dispatch<React.SetStateAction<string>>;
  sincronizarDatos: () => Promise<void>;
  ultimoInforme: string;
  setUltimoInforme: (inf: string) => void;
  setUltimoInformeState: React.Dispatch<React.SetStateAction<string>>;
  interferencias: Interferencia[];
  setInterferencias: React.Dispatch<React.SetStateAction<Interferencia[]>>;
  sincronizarInterferenciasDrive: (params?: {
    accessToken?: string;
    folderId?: string;
    forzarRelectura?: boolean;
  }) => Promise<{
    carpetaInterferenciasNombre: string;
    subcarpetasDetectadas: number;
    subcarpetasProcesadas: number;
    interferencias: Interferencia[];
    erroresCarpetas: Array<{ carpeta: string; error: string }>;
  }>;
  hidratarInterferenciasEnServidorLocal: (lista: Interferencia[]) => Promise<void>;
  notasLibro: NotaLibro[];
  setNotasLibro: React.Dispatch<React.SetStateAction<NotaLibro[]>>;
  archivosPendientesNotasLibro: number;
  escaneoTruncadoNotasLibro: boolean;
  sincronizarNotasLibroDrive: (params?: {
    accessToken?: string;
    folderId?: string;
    forzarRelectura?: boolean;
    continuarLote?: boolean;
  }) => Promise<{
    carpetaRaizNombre: string;
    carpetasEscaneadas: number;
    archivosDetectados: number;
    archivosOmitidosSinCodigo: number;
    notasNuevas: number;
    notasActualizadas: number;
    notasOmitidasPorExistentes: number;
    archivosPendientes: number;
    escaneoTruncado: boolean;
    notasLibro: NotaLibro[];
    erroresArchivos: Array<{ nombre: string; error: string }>;
  }>;
  subirNotaLibroArchivo: (file: File) => Promise<{ nota: NotaLibro; notasLibro: NotaLibro[] }>;
  registrarNotaLibroTexto: (payload: {
    titulo?: string;
    contenidoTexto: string;
  }) => Promise<{ nota: NotaLibro; notasLibro: NotaLibro[] }>;
  actualizarNotaLibro: (
    id: string,
    cambios: Partial<
      Pick<
        NotaLibro,
        | 'codigo'
        | 'tipoNota'
        | 'actorEmisor'
        | 'emisorDetalle'
        | 'actorReceptor'
        | 'receptorDetalle'
        | 'sentido'
        | 'estadoRespuesta'
        | 'referenciasNotas'
        | 'resumen'
      >
    >
  ) => Promise<void>;
  eliminarNotaLibro: (id: string) => Promise<void>;
  hidratarNotasLibroEnServidorLocal: (lista: NotaLibro[]) => Promise<void>;
  notasCampo: string;
  setNotasCampo: (notas: string) => void;
  setNotasCampoState: React.Dispatch<React.SetStateAction<string>>;
  fotosCampo: FotoCampo[];
  setFotosCampo: React.Dispatch<React.SetStateAction<FotoCampo[]>>;
  addFoto: (foto: FotoCampo) => void;
  actualizarFotoAnalisis: (id: string, analisisIA: string) => void;
  deleteFoto: (id: string) => void;
  audiosCampo: NotaAudio[];
  setAudiosCampo: React.Dispatch<React.SetStateAction<NotaAudio[]>>;
  addAudio: (audio: NotaAudio) => void;
  actualizarAudioTranscripcion: (id: string, transcripcion: string) => void;
  deleteAudio: (id: string) => void;
}

const ObraContext = createContext<ObraContextType | undefined>(undefined);

export const ObraProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { setConnectionStatus, setIsSyncing } = useUI();
  const { config, cloudSessionRef } = useAuth();
  const { setHasDriveToken, registrarSyncDrive } = useDrive();

  const [megabytesR2, setMegabytesR2] = useState<string>('156.4 MB');
  const [totalPlanificados, setTotalPlanificados] = useState<number>(
    TOTAL_PLANIFICADOS_CONTRATO_GLOBAL
  );
  const [planificadosPorFrente, setPlanificadosPorFrente] = useState<Record<string, number>>({});
  const [elencosMeta, setElencosMeta] = useState<{
    fuente: string;
    ultimaSincronizacion: string | null;
    archivosAnalizados: number;
    folderId: string;
  }>({
    fuente: 'Seguimiento de Elencos (Base 543)',
    ultimaSincronizacion: null,
    archivosAnalizados: 0,
    folderId: DEFAULT_ELENCOS_FOLDER_ID,
  });

  const [archivosPendientesNotasLibro, setArchivosPendientesNotasLibro] = useState<number>(0);
  const [escaneoTruncadoNotasLibro, setEscaneoTruncadoNotasLibro] = useState<boolean>(false);

  const [notasLibro, setNotasLibro] = useState<NotaLibro[]>(() => {
    try {
      const saved = localStorage.getItem('cache_notas_libro_132kv');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  });

  const [planos, setPlanos] = useState<Plano[]>(() => {
    try {
      const saved = localStorage.getItem('cache_planos_132kv');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.error(e);
    }
    return PLANOS_INICIALES_FIJOS;
  });

  const [hitos, setHitos] = useState<Hito[]>(() => {
    try {
      const saved = localStorage.getItem('cache_hitos_obra_132kv');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.error(e);
    }
    return HITOS_CONTRATUALES_INICIALES_FIJOS;
  });

  const [interferencias, setInterferencias] = useState<Interferencia[]>(() => {
    try {
      const saved = localStorage.getItem('cache_interferencias_132kv');
      if (saved) {
        const parsed = JSON.parse(saved);
        const reales = filtrarInterferenciasRealesCache(parsed);
        if (reales.length !== (Array.isArray(parsed) ? parsed.length : 0)) {
          localStorage.setItem('cache_interferencias_132kv', JSON.stringify(reales));
        }
        return reales;
      }
    } catch (e) {
      console.error(e);
    }
    return INTERFERENCIAS_INICIALES;
  });

  const [notasCampo, setNotasCampoState] = useState<string>(() => {
    return localStorage.getItem('notas_obra_132kv') || '';
  });

  const [audiosCampo, setAudiosCampo] = useState<NotaAudio[]>(() => {
    try {
      const saved = localStorage.getItem('audios_obra_132kv');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [fotosCampo, setFotosCampo] = useState<FotoCampo[]>(() => {
    try {
      const saved = localStorage.getItem('fotos_obra_132kv');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [ultimoInforme, setUltimoInformeState] = useState<string>('');

  const notasLibroHydratedSigRef = useRef<string>('');
  const interferenciasHydratedSigRef = useRef<string>('');

  // Hidrata Notas de Libro sincronizadas desde Firestore en la memoria del servidor local
  const hidratarNotasLibroEnServidorLocal = useCallback(async (lista: NotaLibro[]) => {
    if (!Array.isArray(lista) || lista.length === 0) return;
    const firma = lista.map(n => `${n.id}:${n.estadoRespuesta}:${n.actorEmisor}`).join('|');
    if (notasLibroHydratedSigRef.current === firma) return;
    notasLibroHydratedSigRef.current = firma;
    try {
      await apiFetch('/api/notas-libro/hidratar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notasLibro: lista, compact: true }),
      });
    } catch {
      notasLibroHydratedSigRef.current = '';
    }
  }, []);

  const hidratarInterferenciasEnServidorLocal = useCallback(async (lista: Interferencia[]) => {
    if (!Array.isArray(lista) || lista.length === 0) return;
    const firma = lista.map(x => `${x.id}:${x.estadoTramite}:${x.fechaDocumento || ''}`).join('|');
    if (interferenciasHydratedSigRef.current === firma) return;
    interferenciasHydratedSigRef.current = firma;
    try {
      await apiFetch('/api/interferencias/hidratar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interferencias: lista }),
      });
    } catch {
      interferenciasHydratedSigRef.current = '';
    }
  }, []);

  // Sincronización REAL de Interferencias y Cruces desde carpeta "interferencias" en Google Drive
  const sincronizarInterferenciasDrive = useCallback(
    async (params?: {
      accessToken?: string;
      folderId?: string;
      forzarRelectura?: boolean;
    }) => {
      const data = await runWithDriveToken(async token => {
        const res = await apiFetch('/api/interferencias/sincronizar-drive', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            folderId: params?.folderId || DEFAULT_DRIVE_ROOT_FOLDER_ID,
            forzarRelectura: Boolean(params?.forzarRelectura),
          }),
        });
        const json = await readJsonResponse(
          res,
          'Error sincronizando carpeta "interferencias" desde Drive'
        );
        if (!res.ok || !json?.exito) {
          throw new Error(
            json?.error ||
              `Error sincronizando carpeta "interferencias" desde Drive (HTTP ${res.status})`
          );
        }
        return json;
      }, params?.accessToken);

      const nuevas: Interferencia[] = Array.isArray(data.interferencias) ? data.interferencias : [];
      const anteriores = [...interferencias];
      setInterferencias(nuevas);
      localStorage.setItem('cache_interferencias_132kv', JSON.stringify(nuevas));
      registrarSyncDrive('Interferencias y Cruces', `${nuevas.length} cruces sincronizados desde Drive`);

      const sess = cloudSessionRef.current;
      if (sess) {
        await syncInterferenciasCollectionToFirestore(sess, nuevas, anteriores).catch(err =>
          console.warn('[FirestoreSync] Error sincronizando interferencias reales:', err)
        );
      }

      return {
        carpetaInterferenciasNombre: String(data.carpetaInterferenciasNombre || 'interferencias'),
        subcarpetasDetectadas: Number(data.subcarpetasDetectadas || 0),
        subcarpetasProcesadas: Number(data.subcarpetasProcesadas || 0),
        interferencias: nuevas,
        erroresCarpetas: Array.isArray(data.erroresCarpetas) ? data.erroresCarpetas : [],
      };
    },
    [interferencias, cloudSessionRef, registrarSyncDrive]
  );

  // Sincronización y gestión de Notas de Libro (Libro de Comunicaciones con Actores y Q&A)
  const sincronizarNotasLibroDrive = useCallback(
    async (params?: {
      accessToken?: string;
      folderId?: string;
      forzarRelectura?: boolean;
      continuarLote?: boolean;
    }) => {
      const data = await runWithDriveToken(async token => {
        const res = await apiFetch('/api/notas-libro/sincronizar-drive', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            folderId: params?.folderId || DEFAULT_DRIVE_ROOT_FOLDER_ID,
            forzarRelectura: Boolean(params?.forzarRelectura),
            continuarLote: Boolean(params?.continuarLote),
          }),
        });
        const json = await readJsonResponse(
          res,
          'Error sincronizando Notas de Libro desde Drive'
        );
        if (!res.ok || !json?.exito) {
          throw new Error(
            json?.error || `Error sincronizando Notas de Libro desde Drive (HTTP ${res.status})`
          );
        }
        return json;
      }, params?.accessToken);

      const anteriores = [...notasLibro];
      const nuevas: NotaLibro[] = Array.isArray(data.notasLibro) ? data.notasLibro : [];
      setNotasLibro(nuevas);
      setArchivosPendientesNotasLibro(Number(data.archivosPendientes || 0));
      setEscaneoTruncadoNotasLibro(Boolean(data.escaneoTruncado));
      try {
        localStorage.setItem('cache_notas_libro_132kv', JSON.stringify(nuevas));
      } catch {}
      registrarSyncDrive('Libro de Comunicaciones', `${nuevas.length} notas indexadas desde Drive`);

      const sess = cloudSessionRef.current;
      if (sess) {
        syncNotasLibroCollectionToFirestore(sess, nuevas, anteriores).catch(err =>
          console.warn('[FirestoreSync] Error sincronizando Notas de Libro:', err)
        );
      }

      return {
        carpetaRaizNombre: String(data.carpetaRaizNombre || 'Google Drive'),
        carpetasEscaneadas: Number(data.carpetasEscaneadas || 0),
        archivosDetectados: Number(data.archivosDetectados || 0),
        archivosOmitidosSinCodigo: Number(data.archivosOmitidosSinCodigo || 0),
        notasNuevas: Number(data.notasNuevas || 0),
        notasActualizadas: Number(data.notasActualizadas || 0),
        notasOmitidasPorExistentes: Number(data.notasOmitidasPorExistentes || 0),
        archivosPendientes: Number(data.archivosPendientes || 0),
        escaneoTruncado: Boolean(data.escaneoTruncado),
        notasLibro: nuevas,
        erroresArchivos: Array.isArray(data.erroresArchivos) ? data.erroresArchivos : [],
      };
    },
    [notasLibro, cloudSessionRef, registrarSyncDrive]
  );

  const subirNotaLibroArchivo = useCallback(
    async (file: File) => {
      const res = await apiFetch('/api/notas-libro/subir', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'x-nota-nombre': encodeURIComponent(file.name),
          'x-nota-mime': file.type || 'application/pdf',
        },
        body: file,
      });
      const data = await readJsonResponse(res, 'No se pudo leer la nota de libro');
      if (!res.ok || !data?.exito) {
        throw new Error(data?.error || `No se pudo leer la nota (HTTP ${res.status})`);
      }
      const anteriores = [...notasLibro];
      const lista: NotaLibro[] = Array.isArray(data.notasLibro) ? data.notasLibro : [];
      setNotasLibro(lista);
      try {
        localStorage.setItem('cache_notas_libro_132kv', JSON.stringify(lista));
      } catch {}

      const sess = cloudSessionRef.current;
      if (sess) {
        syncNotasLibroCollectionToFirestore(sess, lista, anteriores).catch(() => {});
      }
      return { nota: data.nota as NotaLibro, notasLibro: lista };
    },
    [notasLibro, cloudSessionRef]
  );

  const registrarNotaLibroTexto = useCallback(
    async (payload: { titulo?: string; contenidoTexto: string }) => {
      const res = await apiFetch('/api/notas-libro/registrar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await readJsonResponse(res, 'Error registrando nota de libro');
      if (!res.ok || !data?.exito) {
        throw new Error(data?.error || `Error registrando nota (HTTP ${res.status})`);
      }
      const anteriores = [...notasLibro];
      const lista: NotaLibro[] = Array.isArray(data.notasLibro) ? data.notasLibro : [];
      setNotasLibro(lista);
      try {
        localStorage.setItem('cache_notas_libro_132kv', JSON.stringify(lista));
      } catch {}

      const sess = cloudSessionRef.current;
      if (sess) {
        syncNotasLibroCollectionToFirestore(sess, lista, anteriores).catch(() => {});
      }
      return { nota: data.nota as NotaLibro, notasLibro: lista };
    },
    [notasLibro, cloudSessionRef]
  );

  const actualizarNotaLibro = useCallback(
    async (
      id: string,
      cambios: Partial<
        Pick<
          NotaLibro,
          | 'codigo'
          | 'tipoNota'
          | 'actorEmisor'
          | 'emisorDetalle'
          | 'actorReceptor'
          | 'receptorDetalle'
          | 'sentido'
          | 'estadoRespuesta'
          | 'referenciasNotas'
          | 'resumen'
        >
      >
    ) => {
      const res = await apiFetch(`/api/notas-libro/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cambios),
      });
      const data = await readJsonResponse(res, 'Error actualizando nota de libro');
      if (!res.ok || !data?.exito) {
        throw new Error(data?.error || 'No se pudo actualizar la nota de libro');
      }
      const anteriores = [...notasLibro];
      const lista: NotaLibro[] = Array.isArray(data.notasLibro) ? data.notasLibro : anteriores;
      setNotasLibro(lista);
      try {
        localStorage.setItem('cache_notas_libro_132kv', JSON.stringify(lista));
      } catch {}

      const sess = cloudSessionRef.current;
      if (sess) {
        if (data.nota) {
          await syncNotaLibroToFirestore(sess, data.nota as NotaLibro).catch(() => {});
        } else {
          await syncNotasLibroCollectionToFirestore(sess, lista, anteriores).catch(() => {});
        }
      }
    },
    [notasLibro, cloudSessionRef]
  );

  const eliminarNotaLibro = useCallback(
    async (id: string) => {
      const anteriores = [...notasLibro];
      const res = await apiFetch(`/api/notas-libro/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('No se pudo eliminar la nota de libro');
      const data = await tryReadJsonResponse(res);
      const lista: NotaLibro[] = Array.isArray(data?.notasLibro)
        ? data.notasLibro
        : anteriores.filter(n => n.id !== id);
      setNotasLibro(lista);
      try {
        localStorage.setItem('cache_notas_libro_132kv', JSON.stringify(lista));
      } catch {}

      const sess = cloudSessionRef.current;
      if (sess) {
        await deleteWorkspaceSubdoc(sess, 'notas_libro', id).catch(() => {});
        await syncNotasLibroCollectionToFirestore(sess, lista, lista).catch(() => {});
      }
    },
    [notasLibro, cloudSessionRef]
  );

  // Persist handlers & Elencos
  const aplicarResultadoElencos = useCallback((elData: any) => {
    if (!elData) return;
    if (Number.isFinite(Number(elData.totalPlanificados)) && Number(elData.totalPlanificados) > 0) {
      setTotalPlanificados(Math.round(Number(elData.totalPlanificados)));
    }
    if (elData.porFrente && typeof elData.porFrente === 'object') {
      setPlanificadosPorFrente(elData.porFrente);
    }
    setElencosMeta({
      fuente: String(elData.fuente || 'Google Drive Elencos'),
      ultimaSincronizacion: elData.ultimaSincronizacion || new Date().toISOString(),
      archivosAnalizados: Array.isArray(elData.archivosAnalizados)
        ? elData.archivosAnalizados.length
        : 0,
      folderId: String(elData.folderId || DEFAULT_ELENCOS_FOLDER_ID),
    });
  }, []);

  // Auto-sincronizar Elencos desde la carpeta oficial de Drive en cuanto exista un token de Drive activo
  const autoSyncedElencoSessionRef = useRef(false);

  const sincronizarElencosDrive = useCallback(
    async (params?: { accessToken?: string; folderId?: string }) => {
      autoSyncedElencoSessionRef.current = true;
      try {
        const data = await runWithDriveToken(async token => {
          setHasDriveToken(true);
          const res = await apiFetch('/api/elencos/sincronizar-drive', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              folderId: params?.folderId || DEFAULT_ELENCOS_FOLDER_ID,
            }),
          });
          const json = await readJsonResponse(
            res,
            'Error sincronizando carpeta de Elencos en Drive'
          );
          if (!res.ok || !json?.exito) {
            throw new Error(json?.error || `Error leyendo carpeta de Elencos (HTTP ${res.status})`);
          }
          return json;
        }, params?.accessToken);

        aplicarResultadoElencos(data);
        registrarSyncDrive(
          'Elencos Oficiales',
          `${Number(data.totalPlanificados || TOTAL_PLANIFICADOS_CONTRATO_GLOBAL)} planos planificados`
        );
        return {
          totalPlanificados: Number(data.totalPlanificados || TOTAL_PLANIFICADOS_CONTRATO_GLOBAL),
          porFrente: (data.porFrente || {}) as Record<string, number>,
          fuente: String(data.fuente || 'Google Drive Elencos'),
        };
      } catch (err) {
        if (!getGoogleDriveAccessToken()) {
          autoSyncedElencoSessionRef.current = false;
        }
        throw err;
      }
    },
    [aplicarResultadoElencos, registrarSyncDrive, setHasDriveToken]
  );

  useEffect(() => {
    const tokenInicial = getGoogleDriveAccessToken();
    if (tokenInicial && !autoSyncedElencoSessionRef.current) {
      void sincronizarElencosDrive({ accessToken: tokenInicial }).catch(() => {});
    }
    return subscribeDriveToken(token => {
      if (token) {
        if (!autoSyncedElencoSessionRef.current) {
          void sincronizarElencosDrive({ accessToken: token }).catch(() => {});
        }
      } else {
        autoSyncedElencoSessionRef.current = false;
      }
    });
  }, [sincronizarElencosDrive]);

  const notasTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setNotasCampo = useCallback(
    (txt: string) => {
      setNotasCampoState(txt);
      localStorage.setItem('notas_obra_132kv', txt);

      const sess = cloudSessionRef.current;
      if (sess) {
        if (notasTimerRef.current) clearTimeout(notasTimerRef.current);
        notasTimerRef.current = setTimeout(() => {
          syncWorkspaceSettingsFields(sess, { notasCampo: txt }).catch(() => {});
        }, 800);
      }
    },
    [cloudSessionRef]
  );

  const setUltimoInforme = useCallback(
    (inf: string) => {
      setUltimoInformeState(inf);
      const sess = cloudSessionRef.current;
      if (sess) {
        syncWorkspaceSettingsFields(sess, { ultimoInforme: inf }).catch(() => {});
      }
    },
    [cloudSessionRef]
  );

  const addFoto = useCallback(
    (f: FotoCampo) => {
      setFotosCampo(prev => {
        const updated = [f, ...prev].slice(0, 10);
        try {
          localStorage.setItem('fotos_obra_132kv', JSON.stringify(updated));
        } catch (e) {
          console.warn('LocalStorage limit for photos:', e);
        }
        return updated;
      });
      const sess = cloudSessionRef.current;
      if (sess) {
        syncFotoCampoToFirestore(sess, f).catch(() => {});
      }
    },
    [cloudSessionRef]
  );

  const actualizarFotoAnalisis = useCallback(
    (id: string, analisisIA: string) => {
      let fotoActualizada: FotoCampo | null = null;
      setFotosCampo(prev => {
        const updated = prev.map(f => {
          if (f.id === id) {
            fotoActualizada = { ...f, analisisIA };
            return fotoActualizada;
          }
          return f;
        });
        try {
          localStorage.setItem('fotos_obra_132kv', JSON.stringify(updated));
        } catch {}
        return updated;
      });
      const sess = cloudSessionRef.current;
      if (sess && fotoActualizada) {
        syncFotoCampoToFirestore(sess, fotoActualizada).catch(() => {});
      }
    },
    [cloudSessionRef]
  );

  const deleteFoto = useCallback(
    (id: string) => {
      setFotosCampo(prev => {
        const updated = prev.filter(f => f.id !== id);
        localStorage.setItem('fotos_obra_132kv', JSON.stringify(updated));
        return updated;
      });
      const sess = cloudSessionRef.current;
      if (sess) {
        deleteWorkspaceSubdoc(sess, 'fotos_campo', id).catch(() => {});
      }
    },
    [cloudSessionRef]
  );

  const addAudio = useCallback(
    (a: NotaAudio) => {
      setAudiosCampo(prev => {
        const updated = [a, ...prev].slice(0, 10);
        try {
          localStorage.setItem('audios_obra_132kv', JSON.stringify(updated));
        } catch (e) {
          console.warn('LocalStorage limit for audio:', e);
        }
        return updated;
      });
      const sess = cloudSessionRef.current;
      if (sess) {
        syncAudioCampoToFirestore(sess, a).catch(() => {});
      }
    },
    [cloudSessionRef]
  );

  const actualizarAudioTranscripcion = useCallback(
    (id: string, transcripcion: string) => {
      let audioActualizado: NotaAudio | null = null;
      setAudiosCampo(prev => {
        const updated = prev.map(a => {
          if (a.id === id) {
            audioActualizado = { ...a, transcripcion };
            return audioActualizado;
          }
          return a;
        });
        try {
          localStorage.setItem('audios_obra_132kv', JSON.stringify(updated));
        } catch {}
        return updated;
      });
      const sess = cloudSessionRef.current;
      if (sess && audioActualizado) {
        syncAudioCampoToFirestore(sess, audioActualizado).catch(() => {});
      }
    },
    [cloudSessionRef]
  );

  const deleteAudio = useCallback(
    (id: string) => {
      setAudiosCampo(prev => {
        const updated = prev.filter(a => a.id !== id);
        localStorage.setItem('audios_obra_132kv', JSON.stringify(updated));
        return updated;
      });
      const sess = cloudSessionRef.current;
      if (sess) {
        deleteWorkspaceSubdoc(sess, 'audios_campo', id).catch(() => {});
      }
    },
    [cloudSessionRef]
  );

  const saveHitos = useCallback(
    async (nuevosHitos: Hito[]) => {
      const anteriores = [...hitos];
      setHitos(nuevosHitos);
      localStorage.setItem('cache_hitos_obra_132kv', JSON.stringify(nuevosHitos));

      const sess = cloudSessionRef.current;
      if (sess) {
        syncHitosCollectionToFirestore(sess, nuevosHitos, anteriores).catch(err =>
          console.warn('[FirestoreSync] Error sincronizando hitos:', err)
        );
      }

      if (config.apiUrl && config.apiUrl.startsWith('http')) {
        let url = config.apiUrl;
        if (url.includes('/edit')) url = url.replace(/\/edit.*$/, '/exec');
        if (!url.endsWith('/exec')) url = url.replace(/\/?$/, '/exec');

        try {
          await fetch(url, {
            method: 'POST',
            body: JSON.stringify({
              accion: 'guardar_cronograma_hitos_r2',
              hitos: nuevosHitos,
            }),
          });
        } catch (e) {
          console.warn('Could not sync hitos to remote API:', e);
        }
      }
    },
    [hitos, config.apiUrl, cloudSessionRef]
  );

  // Sync Logic (Sheets/R2 + Cloud Firestore)
  const sincronizarDatos = useCallback(async () => {
    setIsSyncing(true);
    setConnectionStatus('Sincronizando...');

    const sess = cloudSessionRef.current;
    const apiUrl = config.apiUrl.trim();
    if (apiUrl && apiUrl.startsWith('http')) {
      let finalUrl = apiUrl;
      if (finalUrl.includes('/edit')) finalUrl = finalUrl.replace(/\/edit.*$/, '/exec');
      if (!finalUrl.endsWith('/exec') && !finalUrl.includes('/exec?'))
        finalUrl = finalUrl.replace(/\/?$/, '/exec');

      try {
        const separador = finalUrl.includes('?') ? '&' : '?';
        const res = await fetch(`${finalUrl}${separador}api=datos&_t=${Date.now()}`, {
          method: 'GET',
          redirect: 'follow',
        });
        const data = await readJsonResponse(res, 'Error leyendo Google Sheets');
        if (data && data.planos && Array.isArray(data.planos)) {
          setPlanos(data.planos);
          localStorage.setItem('cache_planos_132kv', JSON.stringify(data.planos));
          if (sess) {
            syncPlanosCollectionToFirestore(sess, data.planos).catch(() => {});
          }
          if (Array.isArray(data.hitos) && data.hitos.length > 0) {
            setHitos(data.hitos);
            localStorage.setItem('cache_hitos_obra_132kv', JSON.stringify(data.hitos));
            if (sess) {
              syncHitosCollectionToFirestore(sess, data.hitos, hitos).catch(() => {});
            }
          }
          if (data.megabytesR2) {
            const mb = `${data.megabytesR2} MB`;
            setMegabytesR2(mb);
            if (sess) syncWorkspaceSettingsFields(sess, { megabytesR2: mb }).catch(() => {});
          }
          if (Number.isFinite(Number(data.totalPlanificados)) && Number(data.totalPlanificados) > 0) {
            setTotalPlanificados(Math.round(Number(data.totalPlanificados)));
          }
          if (data.porFrente && typeof data.porFrente === 'object') {
            setPlanificadosPorFrente(data.porFrente);
          }
          const driveToken = getGoogleDriveAccessToken();
          if (driveToken) {
            void sincronizarElencosDrive({ accessToken: driveToken }).catch(() => {});
          }
          setConnectionStatus(sess ? 'Nube + Sheets ✓' : 'Sheets Conectado');
          setIsSyncing(false);
          return;
        }
      } catch (err) {
        console.warn('Fetch to Sheets failed, trying R2...', err);
      }
    }

    // Si Google Drive está conectado, sincronizar automáticamente los Elencos / Seguimiento desde la carpeta oficial
    const activeDriveToken = getGoogleDriveAccessToken();
    if (activeDriveToken) {
      try {
        await sincronizarElencosDrive({ accessToken: activeDriveToken });
      } catch (errEl) {
        console.warn('Drive Elencos sync warning:', errEl);
      }
    } else {
      try {
        const resEl = await apiFetch('/api/elencos');
        if (resEl.ok) {
          const elData = await tryReadJsonResponse(resEl);
          if (elData?.exito) aplicarResultadoElencos(elData);
        }
      } catch {}
    }

    const accountId = config.r2AccountId || 'e1d197bd1aa5e242733d883eab2a9322';
    const bucketName = config.r2Bucket || 'backup-obra-132kv';
    const urlR2 = `https://${accountId}.r2.cloudflarestorage.com/${bucketName}/_indice_maestro_obra.json`;

    try {
      const resR2 = await fetch(urlR2);
      const dataR2 = await readJsonResponse(resR2, 'Error leyendo respaldo R2');
      if (dataR2 && (dataR2.carpetas || dataR2.planos)) {
        const planosExtraidos: Plano[] = (dataR2.carpetas || []).map(
          (c: { ruta?: string; nombre: string }) => {
            const partes = (c.ruta || '').split('/');
            const nombreDoc = partes[partes.length - 1] || c.nombre;
            return {
              codigo: nombreDoc,
              descripcion: nombreDoc,
              disciplina: 'General',
              revision: 'EO',
              proyecto: 'General',
              estado: 'Abierto',
              selloApc: false,
              urlDrive: '',
              urlR2: `https://${accountId}.r2.cloudflarestorage.com/${bucketName}/${encodeURI(c.ruta || '')}`,
            };
          }
        );

        if (planosExtraidos.length > 0) {
          setPlanos(planosExtraidos);
          localStorage.setItem('cache_planos_132kv', JSON.stringify(planosExtraidos));
          if (sess) {
            syncPlanosCollectionToFirestore(sess, planosExtraidos).catch(() => {});
          }
        }
        if (dataR2.megabytes_transferidos) {
          const mb = `${dataR2.megabytes_transferidos} MB`;
          setMegabytesR2(mb);
          if (sess) syncWorkspaceSettingsFields(sess, { megabytesR2: mb }).catch(() => {});
        }
        setConnectionStatus(sess ? 'Nube Sync ✓' : 'Respaldo R2 Activo');
        setIsSyncing(false);
        return;
      }
    } catch (errR2) {
      console.warn('R2 backup check:', errR2);
    }

    setConnectionStatus(sess ? 'Nube Sync ✓' : 'Respaldo R2 Activo');
    setIsSyncing(false);
  }, [
    config.apiUrl,
    config.r2AccountId,
    config.r2Bucket,
    hitos,
    cloudSessionRef,
    setConnectionStatus,
    setIsSyncing,
    sincronizarElencosDrive,
    aplicarResultadoElencos,
  ]);

  const value = useMemo<ObraContextType>(
    () => ({
      planos,
      setPlanos,
      hitos,
      setHitos,
      saveHitos,
      totalPlanificados,
      setTotalPlanificados,
      planificadosPorFrente,
      setPlanificadosPorFrente,
      elencosMeta,
      setElencosMeta,
      aplicarResultadoElencos,
      sincronizarElencosDrive,
      megabytesR2,
      setMegabytesR2,
      sincronizarDatos,
      ultimoInforme,
      setUltimoInforme,
      setUltimoInformeState,
      interferencias,
      setInterferencias,
      sincronizarInterferenciasDrive,
      hidratarInterferenciasEnServidorLocal,
      notasLibro,
      setNotasLibro,
      archivosPendientesNotasLibro,
      escaneoTruncadoNotasLibro,
      sincronizarNotasLibroDrive,
      subirNotaLibroArchivo,
      registrarNotaLibroTexto,
      actualizarNotaLibro,
      eliminarNotaLibro,
      hidratarNotasLibroEnServidorLocal,
      notasCampo,
      setNotasCampo,
      setNotasCampoState,
      fotosCampo,
      setFotosCampo,
      addFoto,
      actualizarFotoAnalisis,
      deleteFoto,
      audiosCampo,
      setAudiosCampo,
      addAudio,
      actualizarAudioTranscripcion,
      deleteAudio,
    }),
    [
      planos,
      hitos,
      saveHitos,
      totalPlanificados,
      planificadosPorFrente,
      elencosMeta,
      aplicarResultadoElencos,
      sincronizarElencosDrive,
      megabytesR2,
      sincronizarDatos,
      ultimoInforme,
      setUltimoInforme,
      interferencias,
      sincronizarInterferenciasDrive,
      hidratarInterferenciasEnServidorLocal,
      notasLibro,
      archivosPendientesNotasLibro,
      escaneoTruncadoNotasLibro,
      sincronizarNotasLibroDrive,
      subirNotaLibroArchivo,
      registrarNotaLibroTexto,
      actualizarNotaLibro,
      eliminarNotaLibro,
      hidratarNotasLibroEnServidorLocal,
      notasCampo,
      setNotasCampo,
      fotosCampo,
      addFoto,
      actualizarFotoAnalisis,
      deleteFoto,
      audiosCampo,
      addAudio,
      actualizarAudioTranscripcion,
      deleteAudio,
    ]
  );

  return <ObraContext.Provider value={value}>{children}</ObraContext.Provider>;
};

export const useObra = () => {
  const context = useContext(ObraContext);
  if (!context) throw new Error('useObra must be used within an ObraProvider');
  return context;
};
