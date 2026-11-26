import React, {
  createContext,
  useContext,
  useState,
  useRef,
  useCallback,
  useMemo,
  ReactNode,
} from 'react';
import {
  MinutaReunion,
  CompromisoMinuta,
  NotaPedidoIngenieria,
  EstadoCompromiso,
} from '../types';
import { apiFetch, readJsonResponse, tryReadJsonResponse } from '../utils/apiClient';
import { runWithDriveToken } from '../utils/googleAuth';
import {
  deleteWorkspaceSubdoc,
  syncCompromisoToFirestore,
  syncMinutaToFirestore,
  syncNotaPedidoToFirestore,
} from '../utils/firestoreSync';
import { useAuth } from './AuthContext';
import { useDrive } from './DriveContext';
import { AudioMinutaResultado, SubidaProgresoInfo } from './sharedTypes';

export interface MinutasContextType {
  minutas: MinutaReunion[];
  setMinutas: React.Dispatch<React.SetStateAction<MinutaReunion[]>>;
  compromisosMinutas: CompromisoMinuta[];
  setCompromisosMinutas: React.Dispatch<React.SetStateAction<CompromisoMinuta[]>>;
  notasPedido: NotaPedidoIngenieria[];
  setNotasPedido: React.Dispatch<React.SetStateAction<NotaPedidoIngenieria[]>>;
  persistirMinutasLocal: (
    m: MinutaReunion[],
    c: CompromisoMinuta[],
    np: NotaPedidoIngenieria[]
  ) => void;
  hidratarMinutasEnServidorLocal: (
    m: MinutaReunion[],
    c: CompromisoMinuta[],
    np: NotaPedidoIngenieria[]
  ) => Promise<void>;
  sincronizarMinutasDrive: (params?: {
    accessToken?: string;
    folderId?: string;
    buscarEnTodoDrive?: boolean;
  }) => Promise<{
    carpetaRaizNombre: string;
    carpetasEscaneadas: number;
    archivosDetectados: number;
    minutasNuevas: MinutaReunion[];
    minutasActualizadas: number;
    minutasOmitidasPorExistentes: number;
    compromisosNuevos: CompromisoMinuta[];
    erroresArchivos: Array<{ nombre: string; error: string }>;
  }>;
  subirMinutaArchivo: (
    file: File,
    meta?: { codigo?: string; titulo?: string; fechaReunion?: string; frente?: string; participantes?: string }
  ) => Promise<{ minuta: MinutaReunion; compromisosExtraidos: CompromisoMinuta[]; fuenteExtraccion: string }>;
  transcribirAudioMinuta: (
    audio: Blob | File,
    options?: {
      nombreArchivo?: string;
      modeloMinutaId?: string;
      codigo?: string;
      titulo?: string;
      fechaReunion?: string;
      frente?: string;
      participantes?: string;
      motor?: 'gratuito' | 'gemini';
    },
    onProgress?: (info: SubidaProgresoInfo) => void
  ) => Promise<AudioMinutaResultado>;
  registrarMinutaTexto: (payload: {
    codigo?: string;
    titulo?: string;
    fechaReunion?: string;
    frente?: string;
    participantes?: string;
    contenidoTexto?: string;
    compromisosManuales?: Array<{
      descripcion: string;
      responsable?: string;
      area?: string;
      frente?: string;
      fechaLimite?: string;
      estado?: EstadoCompromiso;
      documentosRelacionados?: string[];
    }>;
    extraerAutomaticamente?: boolean;
  }) => Promise<{ minuta: MinutaReunion; compromisosExtraidos: CompromisoMinuta[]; fuenteExtraccion: string }>;
  eliminarMinuta: (id: string) => Promise<void>;
  agregarCompromisoMinuta: (payload: {
    minutaId?: string;
    minutaCodigo?: string;
    minutaFecha?: string;
    descripcion: string;
    responsable?: string;
    area?: string;
    frente?: string;
    fechaLimite?: string;
    estado?: EstadoCompromiso;
    observaciones?: string;
    documentosRelacionados?: string[];
  }) => Promise<CompromisoMinuta>;
  actualizarCompromisoMinuta: (
    id: string,
    cambios: Partial<
      Pick<CompromisoMinuta, 'estado' | 'responsable' | 'fechaLimite' | 'descripcion' | 'observaciones' | 'frente'>
    >
  ) => Promise<void>;
  eliminarCompromisoMinuta: (id: string) => Promise<void>;
  generarNotaPedido: (payload: {
    compromisoIds: string[];
    numeroNota?: string;
    fechaEmision?: string;
    emisor?: string;
    destinatario?: string;
    frente?: string;
    asunto?: string;
    plazoDescargoDias?: number;
    encuadreAdicional?: string;
  }) => Promise<NotaPedidoIngenieria>;
  eliminarNotaPedido: (id: string) => Promise<void>;
}

const MinutasContext = createContext<MinutasContextType | undefined>(undefined);

export const MinutasProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { cloudSessionRef, puedeUsarModelosPagos } = useAuth();
  const { registrarSyncDrive } = useDrive();

  const [minutas, setMinutas] = useState<MinutaReunion[]>(() => {
    try {
      const saved = localStorage.getItem('cache_minutas_132kv');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  });

  const [compromisosMinutas, setCompromisosMinutas] = useState<CompromisoMinuta[]>(() => {
    try {
      const saved = localStorage.getItem('cache_compromisos_minutas_132kv');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  });

  const [notasPedido, setNotasPedido] = useState<NotaPedidoIngenieria[]>(() => {
    try {
      const saved = localStorage.getItem('cache_notas_pedido_132kv');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  });

  const minutasHydratedSigRef = useRef<string>('');

  const persistirMinutasLocal = useCallback(
    (m: MinutaReunion[], c: CompromisoMinuta[], np: NotaPedidoIngenieria[]) => {
      try {
        localStorage.setItem('cache_minutas_132kv', JSON.stringify(m));
        localStorage.setItem('cache_compromisos_minutas_132kv', JSON.stringify(c));
        localStorage.setItem('cache_notas_pedido_132kv', JSON.stringify(np));
      } catch {}
    },
    []
  );

  const hidratarMinutasEnServidorLocal = useCallback(
    async (m: MinutaReunion[], c: CompromisoMinuta[], np: NotaPedidoIngenieria[]) => {
      if (m.length === 0 && c.length === 0 && np.length === 0) return;
      const firma = `${m.length}:${c.map(x => `${x.id}:${x.estado}`).join(',')}:${np.length}`;
      if (minutasHydratedSigRef.current === firma) return;
      minutasHydratedSigRef.current = firma;
      try {
        await apiFetch('/api/minutas/hidratar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ minutas: m, compromisos: c, notasPedido: np }),
        });
      } catch {
        minutasHydratedSigRef.current = '';
      }
    },
    []
  );

  const sincronizarMinutasDrive = useCallback(
    async (params?: {
      accessToken?: string;
      folderId?: string;
      buscarEnTodoDrive?: boolean;
    }) => {
      const data = await runWithDriveToken(async token => {
        const res = await apiFetch('/api/minutas/sincronizar-drive', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            folderId: params?.folderId,
            buscarEnTodoDrive: params?.buscarEnTodoDrive ?? true,
          }),
        });
        const json = await readJsonResponse(res, 'Error sincronizando minutas desde Drive');
        if (!res.ok || !json?.exito) {
          throw new Error(
            json?.error || `Error sincronizando minutas desde Drive (HTTP ${res.status})`
          );
        }
        return json;
      }, params?.accessToken);

      const mList = Array.isArray(data.minutas) ? (data.minutas as MinutaReunion[]) : minutas;
      const cList = Array.isArray(data.compromisos)
        ? (data.compromisos as CompromisoMinuta[])
        : compromisosMinutas;
      const npList = Array.isArray(data.notasPedido)
        ? (data.notasPedido as NotaPedidoIngenieria[])
        : notasPedido;
      setMinutas(mList);
      setCompromisosMinutas(cList);
      setNotasPedido(npList);
      persistirMinutasLocal(mList, cList, npList);
      registrarSyncDrive('Minutas de Reunión', `${mList.length} minutas · ${cList.length} compromisos`);

      const sess = cloudSessionRef.current;
      if (sess) {
        const mNuevas = Array.isArray(data.minutasNuevas)
          ? (data.minutasNuevas as MinutaReunion[])
          : mList;
        const cNuevos = Array.isArray(data.compromisosNuevos)
          ? (data.compromisosNuevos as CompromisoMinuta[])
          : [];
        for (const m of mNuevas) {
          await syncMinutaToFirestore(sess, m).catch(() => {});
        }
        for (const c of cNuevos) {
          await syncCompromisoToFirestore(sess, c).catch(() => {});
        }
      }

      return {
        carpetaRaizNombre: String(data.carpetaRaizNombre || 'Google Drive'),
        carpetasEscaneadas: Number(data.carpetasEscaneadas || 0),
        archivosDetectados: Number(data.archivosDetectados || 0),
        minutasNuevas: Array.isArray(data.minutasNuevas)
          ? (data.minutasNuevas as MinutaReunion[])
          : [],
        minutasActualizadas: Number(data.minutasActualizadas || 0),
        minutasOmitidasPorExistentes: Number(data.minutasOmitidasPorExistentes || 0),
        compromisosNuevos: Array.isArray(data.compromisosNuevos)
          ? (data.compromisosNuevos as CompromisoMinuta[])
          : [],
        erroresArchivos: Array.isArray(data.erroresArchivos) ? data.erroresArchivos : [],
      };
    },
    [minutas, compromisosMinutas, notasPedido, cloudSessionRef, persistirMinutasLocal, registrarSyncDrive]
  );

  const subirMinutaArchivo = useCallback(
    async (
      file: File,
      meta?: { codigo?: string; titulo?: string; fechaReunion?: string; frente?: string; participantes?: string }
    ) => {
      const res = await apiFetch('/api/minutas/subir', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'x-minuta-nombre': encodeURIComponent(file.name),
          'x-minuta-mime': file.type || 'application/pdf',
          'x-minuta-codigo': encodeURIComponent(meta?.codigo || ''),
          'x-minuta-titulo': encodeURIComponent(meta?.titulo || ''),
          'x-minuta-fecha': encodeURIComponent(meta?.fechaReunion || ''),
          'x-minuta-frente': encodeURIComponent(meta?.frente || ''),
          'x-minuta-participantes': encodeURIComponent(meta?.participantes || ''),
        },
        body: file,
      });
      const data = await readJsonResponse(res, 'No se pudo procesar la minuta');
      if (!res.ok || !data?.exito) {
        throw new Error(data?.error || `No se pudo procesar la minuta (HTTP ${res.status})`);
      }
      const nuevaMinuta = data.minuta as MinutaReunion;
      const nuevosCompExtraidos = data.compromisosExtraidos as CompromisoMinuta[];
      const nuevasMinutas = [nuevaMinuta, ...minutas];
      const nuevosComp = [...nuevosCompExtraidos, ...compromisosMinutas];
      setMinutas(nuevasMinutas);
      setCompromisosMinutas(nuevosComp);
      persistirMinutasLocal(nuevasMinutas, nuevosComp, notasPedido);

      const sess = cloudSessionRef.current;
      if (sess) {
        await syncMinutaToFirestore(sess, nuevaMinuta).catch(() => {});
        for (const c of nuevosCompExtraidos) {
          await syncCompromisoToFirestore(sess, c).catch(() => {});
        }
      }

      return {
        minuta: nuevaMinuta,
        compromisosExtraidos: nuevosCompExtraidos,
        fuenteExtraccion: String(data.fuenteExtraccion || 'extractor-local'),
      };
    },
    [minutas, compromisosMinutas, notasPedido, cloudSessionRef, persistirMinutasLocal]
  );

  const transcribirAudioMinuta = useCallback(
    async (
      audio: Blob | File,
      options?: {
        nombreArchivo?: string;
        modeloMinutaId?: string;
        codigo?: string;
        titulo?: string;
        fechaReunion?: string;
        frente?: string;
        participantes?: string;
        motor?: 'gratuito' | 'gemini';
      },
      onProgress?: (info: SubidaProgresoInfo) => void
    ): Promise<AudioMinutaResultado> => {
      const id = `maud_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const nombre =
        options?.nombreArchivo ||
        (audio instanceof File && audio.name
          ? audio.name
          : `reunion_${new Date().toISOString().slice(0, 10)}.webm`);
      const tipoMime = audio.type || 'audio/webm';
      const totalBytes = audio.size;
      const totalMB = (totalBytes / (1024 * 1024)).toFixed(1);

      const motorEfectivo: 'gratuito' | 'gemini' =
        puedeUsarModelosPagos && options?.motor === 'gemini' ? 'gemini' : 'gratuito';

      if (totalBytes <= 3.5 * 1024 * 1024) {
        onProgress?.({
          fase: 'subiendo',
          porcentaje: 45,
          detalle: `Enviando audio "${nombre}" (${totalMB} MB) al servidor...`,
        });
        const res = await apiFetch('/api/minutas/audio/subir-directo', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/octet-stream',
            'x-audio-id': id,
            'x-audio-nombre': encodeURIComponent(nombre),
            'x-audio-mime': tipoMime,
            'x-audio-modelo-id': encodeURIComponent(options?.modeloMinutaId || ''),
            'x-audio-codigo': encodeURIComponent(options?.codigo || ''),
            'x-audio-titulo': encodeURIComponent(options?.titulo || ''),
            'x-audio-fecha': encodeURIComponent(options?.fechaReunion || ''),
            'x-audio-frente': encodeURIComponent(options?.frente || ''),
            'x-audio-participantes': encodeURIComponent(options?.participantes || ''),
            'x-audio-motor': motorEfectivo,
          },
          body: audio,
        });
        if (!res.ok) {
          const errData = await tryReadJsonResponse(res);
          throw new Error(errData?.error || `Error enviando audio (HTTP ${res.status})`);
        }
      } else {
        const CHUNK_SIZE = 4 * 1024 * 1024;
        onProgress?.({
          fase: 'subiendo',
          porcentaje: 0,
          detalle: `Iniciando subida por partes de "${nombre}" (${totalMB} MB)...`,
        });

        const initRes = await apiFetch('/api/minutas/audio/subir/init', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id,
            nombre,
            tipoMime,
            totalBytes,
            modeloMinutaId: options?.modeloMinutaId || '',
            codigo: options?.codigo || '',
            titulo: options?.titulo || '',
            fechaReunion: options?.fechaReunion || '',
            frente: options?.frente || '',
            participantes: options?.participantes || '',
            motor: motorEfectivo,
          }),
        });
        if (!initRes.ok) {
          const errData = await tryReadJsonResponse(initRes);
          throw new Error(errData?.error || `No se pudo iniciar la subida de "${nombre}"`);
        }

        const totalChunks = Math.max(1, Math.ceil(totalBytes / CHUNK_SIZE));
        for (let i = 0; i < totalChunks; i++) {
          const offset = i * CHUNK_SIZE;
          const slice = audio.slice(offset, Math.min(totalBytes, offset + CHUNK_SIZE));

          let lastErr: any = null;
          let ok = false;
          for (let intento = 0; intento < 3; intento++) {
            try {
              const chunkRes = await apiFetch('/api/minutas/audio/subir/chunk', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/octet-stream',
                  'x-audio-id': id,
                  'x-chunk-offset': String(offset),
                },
                body: slice,
              });
              if (chunkRes.ok) {
                ok = true;
                break;
              }
              const errJson = await tryReadJsonResponse(chunkRes);
              lastErr = new Error(errJson?.error || `HTTP ${chunkRes.status}`);
            } catch (err) {
              lastErr = err;
            }
            await new Promise(r => setTimeout(r, 400 * (intento + 1)));
          }

          if (!ok) {
            throw new Error(
              `Error subiendo parte ${i + 1}/${totalChunks} de "${nombre}": ${lastErr?.message || 'Error de red'}`
            );
          }

          const subidoHastaAhora = Math.min(totalBytes, offset + slice.size);
          const pct = Math.round((subidoHastaAhora / totalBytes) * 100);
          const subidoMB = (subidoHastaAhora / (1024 * 1024)).toFixed(1);
          onProgress?.({
            fase: 'subiendo',
            porcentaje: pct,
            detalle: `Subiendo audio "${nombre}": ${subidoMB} / ${totalMB} MB (${pct}%)`,
          });
        }

        onProgress?.({
          fase: 'procesando',
          porcentaje: 4,
          detalle: 'Audio subido. Segmentando y enviando a Groq Whisper...',
        });

        const finRes = await apiFetch('/api/minutas/audio/subir/finalizar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id }),
        });
        if (!finRes.ok) {
          const errData = await tryReadJsonResponse(finRes);
          throw new Error(errData?.error || 'Error finalizando subida de audio');
        }
      }

      while (true) {
        await new Promise(r => setTimeout(r, 700));
        const stRes = await apiFetch(`/api/minutas/audio/estado/${encodeURIComponent(id)}`);
        if (!stRes.ok) {
          const errData = await tryReadJsonResponse(stRes);
          throw new Error(
            errData?.error || 'Se perdió el seguimiento de transcripción en el servidor.'
          );
        }
        const stData = await readJsonResponse(stRes, 'Error consultando progreso de audio');
        if (stData.estado === 'error') {
          throw new Error(stData.error || 'Error procesando el audio de reunión');
        }
        onProgress?.({
          fase: 'procesando',
          porcentaje: Number(stData.progreso) || 10,
          detalle: stData.detalle || 'Transcribiendo audio con Groq Whisper...',
        });
        if (stData.estado === 'completado' && stData.resultado) {
          return stData.resultado as AudioMinutaResultado;
        }
      }
    },
    [puedeUsarModelosPagos]
  );

  const registrarMinutaTexto = useCallback(
    async (payload: {
      codigo?: string;
      titulo?: string;
      fechaReunion?: string;
      frente?: string;
      participantes?: string;
      contenidoTexto?: string;
      compromisosManuales?: Array<{
        descripcion: string;
        responsable?: string;
        area?: string;
        frente?: string;
        fechaLimite?: string;
        estado?: EstadoCompromiso;
        documentosRelacionados?: string[];
      }>;
      extraerAutomaticamente?: boolean;
    }) => {
      const res = await apiFetch('/api/minutas/registrar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await readJsonResponse(res, 'Error registrando minuta');
      if (!res.ok || !data?.exito) {
        throw new Error(data?.error || `Error registrando minuta (HTTP ${res.status})`);
      }
      const nuevaMinuta = data.minuta as MinutaReunion;
      const nuevosCompExtraidos = data.compromisosExtraidos as CompromisoMinuta[];
      const nuevasMinutas = [nuevaMinuta, ...minutas];
      const nuevosComp = [...nuevosCompExtraidos, ...compromisosMinutas];
      setMinutas(nuevasMinutas);
      setCompromisosMinutas(nuevosComp);
      persistirMinutasLocal(nuevasMinutas, nuevosComp, notasPedido);

      const sess = cloudSessionRef.current;
      if (sess) {
        await syncMinutaToFirestore(sess, nuevaMinuta).catch(() => {});
        for (const c of nuevosCompExtraidos) {
          await syncCompromisoToFirestore(sess, c).catch(() => {});
        }
      }

      return {
        minuta: nuevaMinuta,
        compromisosExtraidos: nuevosCompExtraidos,
        fuenteExtraccion: String(data.fuenteExtraccion || 'manual'),
      };
    },
    [minutas, compromisosMinutas, notasPedido, cloudSessionRef, persistirMinutasLocal]
  );

  const eliminarMinuta = useCallback(
    async (id: string) => {
      const res = await apiFetch(`/api/minutas/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('No se pudo eliminar la minuta');
      const compEliminar = compromisosMinutas.filter(c => c.minutaId === id);
      const nuevasMinutas = minutas.filter(m => m.id !== id);
      const nuevosComp = compromisosMinutas.filter(c => c.minutaId !== id);
      setMinutas(nuevasMinutas);
      setCompromisosMinutas(nuevosComp);
      persistirMinutasLocal(nuevasMinutas, nuevosComp, notasPedido);

      const sess = cloudSessionRef.current;
      if (sess) {
        deleteWorkspaceSubdoc(sess, 'minutas', id).catch(() => {});
        for (const c of compEliminar) {
          deleteWorkspaceSubdoc(sess, 'compromisos', c.id).catch(() => {});
        }
      }
    },
    [minutas, compromisosMinutas, notasPedido, cloudSessionRef, persistirMinutasLocal]
  );

  const agregarCompromisoMinuta = useCallback(
    async (payload: {
      minutaId?: string;
      minutaCodigo?: string;
      minutaFecha?: string;
      descripcion: string;
      responsable?: string;
      area?: string;
      frente?: string;
      fechaLimite?: string;
      estado?: EstadoCompromiso;
      observaciones?: string;
      documentosRelacionados?: string[];
    }): Promise<CompromisoMinuta> => {
      const res = await apiFetch('/api/minutas/compromisos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await readJsonResponse(res, 'Error creando compromiso');
      if (!res.ok || !data?.exito) {
        throw new Error(data?.error || 'Error creando compromiso');
      }
      const comp = data.compromiso as CompromisoMinuta;
      const nuevosComp = [comp, ...compromisosMinutas];
      setCompromisosMinutas(nuevosComp);
      persistirMinutasLocal(minutas, nuevosComp, notasPedido);

      const sess = cloudSessionRef.current;
      if (sess) {
        await syncCompromisoToFirestore(sess, comp).catch(() => {});
      }

      return comp;
    },
    [minutas, compromisosMinutas, notasPedido, cloudSessionRef, persistirMinutasLocal]
  );

  const actualizarCompromisoMinuta = useCallback(
    async (
      id: string,
      cambios: Partial<
        Pick<
          CompromisoMinuta,
          'estado' | 'responsable' | 'fechaLimite' | 'descripcion' | 'observaciones' | 'frente'
        >
      >
    ) => {
      const res = await apiFetch(`/api/minutas/compromisos/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cambios),
      });
      const data = await readJsonResponse(res, 'No se pudo actualizar el compromiso');
      if (!res.ok || !data?.exito) {
        throw new Error(data?.error || 'No se pudo actualizar el compromiso');
      }
      const comp = data.compromiso as CompromisoMinuta;
      const nuevosComp = compromisosMinutas.map(c => (c.id === id ? comp : c));
      setCompromisosMinutas(nuevosComp);
      persistirMinutasLocal(minutas, nuevosComp, notasPedido);

      const sess = cloudSessionRef.current;
      if (sess) {
        await syncCompromisoToFirestore(sess, comp).catch(() => {});
      }
    },
    [minutas, compromisosMinutas, notasPedido, cloudSessionRef, persistirMinutasLocal]
  );

  const eliminarCompromisoMinuta = useCallback(
    async (id: string) => {
      const res = await apiFetch(`/api/minutas/compromisos/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('No se pudo eliminar el compromiso');
      const nuevosComp = compromisosMinutas.filter(c => c.id !== id);
      setCompromisosMinutas(nuevosComp);
      persistirMinutasLocal(minutas, nuevosComp, notasPedido);

      const sess = cloudSessionRef.current;
      if (sess) {
        deleteWorkspaceSubdoc(sess, 'compromisos', id).catch(() => {});
      }
    },
    [minutas, compromisosMinutas, notasPedido, cloudSessionRef, persistirMinutasLocal]
  );

  const generarNotaPedido = useCallback(
    async (payload: {
      compromisoIds: string[];
      numeroNota?: string;
      fechaEmision?: string;
      emisor?: string;
      destinatario?: string;
      frente?: string;
      asunto?: string;
      plazoDescargoDias?: number;
      encuadreAdicional?: string;
    }): Promise<NotaPedidoIngenieria> => {
      const res = await apiFetch('/api/minutas/nota-pedido/generar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await readJsonResponse(res, 'Error generando Nota de Pedido');
      if (!res.ok || !data?.exito) {
        throw new Error(data?.error || `Error generando Nota de Pedido (HTTP ${res.status})`);
      }
      const nota = data.notaPedido as NotaPedidoIngenieria;
      const compActualizados = Array.isArray(data.compromisosActualizados)
        ? (data.compromisosActualizados as CompromisoMinuta[])
        : compromisosMinutas;
      const nuevasNotas = [nota, ...notasPedido];
      setNotasPedido(nuevasNotas);
      setCompromisosMinutas(compActualizados);
      persistirMinutasLocal(minutas, compActualizados, nuevasNotas);

      const sess = cloudSessionRef.current;
      if (sess) {
        await syncNotaPedidoToFirestore(sess, nota).catch(() => {});
        for (const c of compActualizados.filter(item => payload.compromisoIds.includes(item.id))) {
          await syncCompromisoToFirestore(sess, c).catch(() => {});
        }
      }

      return nota;
    },
    [minutas, compromisosMinutas, notasPedido, cloudSessionRef, persistirMinutasLocal]
  );

  const eliminarNotaPedido = useCallback(
    async (id: string) => {
      const res = await apiFetch(`/api/minutas/notas-pedido/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('No se pudo eliminar la Nota de Pedido');
      const nuevasNotas = notasPedido.filter(n => n.id !== id);
      setNotasPedido(nuevasNotas);
      persistirMinutasLocal(minutas, compromisosMinutas, nuevasNotas);

      const sess = cloudSessionRef.current;
      if (sess) {
        deleteWorkspaceSubdoc(sess, 'notas_pedido', id).catch(() => {});
      }
    },
    [minutas, compromisosMinutas, notasPedido, cloudSessionRef, persistirMinutasLocal]
  );

  const value = useMemo<MinutasContextType>(
    () => ({
      minutas,
      setMinutas,
      compromisosMinutas,
      setCompromisosMinutas,
      notasPedido,
      setNotasPedido,
      persistirMinutasLocal,
      hidratarMinutasEnServidorLocal,
      sincronizarMinutasDrive,
      subirMinutaArchivo,
      transcribirAudioMinuta,
      registrarMinutaTexto,
      eliminarMinuta,
      agregarCompromisoMinuta,
      actualizarCompromisoMinuta,
      eliminarCompromisoMinuta,
      generarNotaPedido,
      eliminarNotaPedido,
    }),
    [
      minutas,
      compromisosMinutas,
      notasPedido,
      persistirMinutasLocal,
      hidratarMinutasEnServidorLocal,
      sincronizarMinutasDrive,
      subirMinutaArchivo,
      transcribirAudioMinuta,
      registrarMinutaTexto,
      eliminarMinuta,
      agregarCompromisoMinuta,
      actualizarCompromisoMinuta,
      eliminarCompromisoMinuta,
      generarNotaPedido,
      eliminarNotaPedido,
    ]
  );

  return <MinutasContext.Provider value={value}>{children}</MinutasContext.Provider>;
};

export const useMinutas = () => {
  const context = useContext(MinutasContext);
  if (!context) throw new Error('useMinutas must be used within a MinutasProvider');
  return context;
};
