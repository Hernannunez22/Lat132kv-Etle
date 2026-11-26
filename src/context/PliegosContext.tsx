import React, {
  createContext,
  useContext,
  useState,
  useRef,
  useCallback,
  useMemo,
  ReactNode,
} from 'react';
import { PliegoReal, PlanoComparacionDoc, ChatAdjuntoPdf } from '../types';
import { buscarYExtraerDePliegosReales } from '../data/pliegosContractuales';
import {
  guardarArchivoEnIDB,
  obtenerTodosArchivosIDB,
  eliminarArchivoDeIDB,
  limpiarTodosArchivosIDB,
} from '../utils/pliegoStorage';
import { apiFetch, readJsonResponse, tryReadJsonResponse } from '../utils/apiClient';
import {
  deletePliegoFromFirestore,
  deleteWorkspaceSubdoc,
  syncChatAdjuntoToFirestore,
  syncPliegoToFirestore,
} from '../utils/firestoreSync';
import { useAuth } from './AuthContext';
import { SubidaProgresoInfo } from './sharedTypes';

export interface PliegosContextType {
  pliegosReales: PliegoReal[];
  setPliegosReales: React.Dispatch<React.SetStateAction<PliegoReal[]>>;
  planoCompararA: PlanoComparacionDoc | null;
  setPlanoCompararA: React.Dispatch<React.SetStateAction<PlanoComparacionDoc | null>>;
  planoCompararB: PlanoComparacionDoc | null;
  setPlanoCompararB: React.Dispatch<React.SetStateAction<PlanoComparacionDoc | null>>;
  chatAdjuntos: ChatAdjuntoPdf[];
  setChatAdjuntos: React.Dispatch<React.SetStateAction<ChatAdjuntoPdf[]>>;
  pliegosHydratedServerRef: React.MutableRefObject<Set<string>>;
  guardarMetadataLocal: (lista: PliegoReal[]) => void;
  hidratarPliegoEnServidorLocal: (pliego: PliegoReal) => Promise<void>;
  hidratarChatAdjuntosEnServidorLocal: (lista: ChatAdjuntoPdf[]) => Promise<void>;
  resincronizarPliegosDesdeIDB: () => Promise<boolean>;
  subirArchivoPliegoReal: (
    file: File,
    onProgress?: (info: SubidaProgresoInfo) => void
  ) => Promise<PliegoReal>;
  subirPlanoComparador: (
    rol: 'A' | 'B',
    file: File,
    onProgress?: (info: SubidaProgresoInfo) => void
  ) => Promise<PlanoComparacionDoc>;
  eliminarPlanoComparador: (rol: 'A' | 'B') => Promise<void>;
  subirAdjuntoChat: (
    file: File,
    onProgress?: (info: SubidaProgresoInfo) => void
  ) => Promise<ChatAdjuntoPdf>;
  eliminarAdjuntoChat: (id: string) => Promise<void>;
  limpiarAdjuntosChat: () => Promise<void>;
  agregarPliegoReal: (pliego: PliegoReal) => Promise<void>;
  eliminarPliegoReal: (id: string) => Promise<void>;
  limpiarTodosPliegosReales: () => Promise<void>;
  extraerDePliego: (consulta: string) => Promise<string>;
}

const PliegosContext = createContext<PliegosContextType | undefined>(undefined);

export const PliegosProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { cloudSessionRef } = useAuth();

  const [pliegosReales, setPliegosReales] = useState<PliegoReal[]>(() => {
    try {
      const saved = localStorage.getItem('pliegos_reales_obra_132kv');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.error('Error al recuperar pliegos reales:', e);
    }
    return [];
  });

  const [planoCompararA, setPlanoCompararA] = useState<PlanoComparacionDoc | null>(null);
  const [planoCompararB, setPlanoCompararB] = useState<PlanoComparacionDoc | null>(null);
  const [chatAdjuntos, setChatAdjuntos] = useState<ChatAdjuntoPdf[]>([]);

  const pliegosHydratedServerRef = useRef<Set<string>>(new Set());
  const chatAdjuntosHydratedSigRef = useRef<string>('');

  const guardarMetadataLocal = useCallback((lista: PliegoReal[]) => {
    try {
      const compacta = lista.map(({ dataBase64: _drop, ...rest }) => ({
        ...rest,
        contenidoTexto: rest.contenidoTexto ? rest.contenidoTexto.slice(0, 12000) : '',
      }));
      localStorage.setItem('pliegos_reales_obra_132kv', JSON.stringify(compacta));
    } catch (e) {
      console.warn('LocalStorage limit for pliegos:', e);
    }
  }, []);

  // Hidrata en el servidor Express local los pliegos sincronizados desde otro dispositivo vía Firestore
  const hidratarPliegoEnServidorLocal = useCallback(async (pliego: PliegoReal) => {
    if (!pliego?.id || !pliego?.contenidoTexto) return;
    if (pliegosHydratedServerRef.current.has(pliego.id)) return;
    pliegosHydratedServerRef.current.add(pliego.id);
    try {
      await apiFetch('/api/pliegos/cargar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: pliego.id,
          nombre: pliego.nombre,
          tipoMime: pliego.tipoMime || 'text/plain',
          tamanioBytes: pliego.tamanioBytes || pliego.contenidoTexto.length,
          tamanioTexto:
            pliego.tamanioTexto || `${Math.max(1, Math.round(pliego.contenidoTexto.length / 1024))} KB`,
          fechaSubida: pliego.fechaSubida,
          paginas: pliego.paginas,
          contenidoTexto: pliego.contenidoTexto,
        }),
      });
    } catch {
      pliegosHydratedServerRef.current.delete(pliego.id);
    }
  }, []);

  const hidratarChatAdjuntosEnServidorLocal = useCallback(async (lista: ChatAdjuntoPdf[]) => {
    if (!Array.isArray(lista) || lista.length === 0) return;
    const firma = lista.map(x => `${x.id}:${x.caracteresTexto}`).join('|');
    if (chatAdjuntosHydratedSigRef.current === firma) return;
    chatAdjuntosHydratedSigRef.current = firma;
    try {
      await apiFetch('/api/chat/adjuntos/hidratar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adjuntos: lista }),
      });
    } catch {
      chatAdjuntosHydratedSigRef.current = '';
    }
  }, []);

  const enviarArchivoPorPartes = useCallback(
    async (
      id: string,
      nombre: string,
      tipoMime: string,
      fechaSubida: string,
      blob: Blob,
      onProgress?: (info: SubidaProgresoInfo) => void,
      destino: 'pliego' | 'planoA' | 'planoB' | 'chatPdf' = 'pliego'
    ): Promise<{ pliego?: PliegoReal; plano?: PlanoComparacionDoc; adjuntoChat?: ChatAdjuntoPdf }> => {
      const CHUNK_SIZE = 4 * 1024 * 1024;
      const totalBytes = blob.size;
      const totalMB = (totalBytes / (1024 * 1024)).toFixed(1);

      onProgress?.({
        fase: 'subiendo',
        porcentaje: 0,
        detalle: `Iniciando subida de "${nombre}" (${totalMB} MB)...`,
      });

      const initRes = await apiFetch('/api/pliegos/subir/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, nombre, tipoMime, totalBytes, fechaSubida, destino }),
      });
      if (!initRes.ok) {
        const errData = await tryReadJsonResponse(initRes);
        throw new Error(errData?.error || `No se pudo iniciar la subida de ${nombre}`);
      }

      const totalChunks = Math.max(1, Math.ceil(totalBytes / CHUNK_SIZE));
      for (let i = 0; i < totalChunks; i++) {
        const offset = i * CHUNK_SIZE;
        const slice = blob.slice(offset, Math.min(totalBytes, offset + CHUNK_SIZE));

        let lastErr: any = null;
        let ok = false;
        for (let intento = 0; intento < 3; intento++) {
          try {
            const chunkRes = await apiFetch('/api/pliegos/subir/chunk', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/octet-stream',
                'x-pliego-id': id,
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
          await new Promise(r => setTimeout(r, 350 * (intento + 1)));
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
          detalle: `Subiendo "${nombre}": ${subidoMB} / ${totalMB} MB (${pct}%)`,
        });
      }

      onProgress?.({
        fase: 'procesando',
        porcentaje: 5,
        detalle: `Archivo subido. Iniciando extracción de texto e índice...`,
      });

      const finRes = await apiFetch('/api/pliegos/subir/finalizar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!finRes.ok) {
        const errData = await tryReadJsonResponse(finRes);
        throw new Error(errData?.error || 'Error finalizando subida');
      }

      while (true) {
        await new Promise(r => setTimeout(r, 500));
        const stRes = await apiFetch(`/api/pliegos/subir/estado/${encodeURIComponent(id)}`);
        if (!stRes.ok) {
          throw new Error('Se perdió el seguimiento de indexación en el servidor.');
        }
        const stData = await readJsonResponse(stRes, 'Error consultando estado de indexación');
        if (stData.estado === 'error') {
          throw new Error(stData.error || 'Error procesando el PDF');
        }
        onProgress?.({
          fase: 'procesando',
          porcentaje: Number(stData.progreso) || 0,
          detalle: stData.detalle || 'Extrayendo texto e indexando...',
        });
        if (stData.estado === 'completado') {
          if (stData.adjuntoChat) return { adjuntoChat: stData.adjuntoChat as ChatAdjuntoPdf };
          if (stData.plano) return { plano: stData.plano as PlanoComparacionDoc };
          if (stData.pliego) return { pliego: stData.pliego as PliegoReal };
        }
      }
    },
    []
  );

  // Resincroniza pliegos guardados en IndexedDB hacia el servidor si este se reinició
  const resincronizarPliegosDesdeIDB = useCallback(async () => {
    try {
      const itemsIDB = await obtenerTodosArchivosIDB();
      if (itemsIDB.length === 0) return false;

      const actualizados: PliegoReal[] = [];
      for (const item of itemsIDB) {
        if (item.blob) {
          if (item.blob.size > 3.5 * 1024 * 1024) {
            try {
              const resPart = await enviarArchivoPorPartes(
                item.id,
                item.nombre,
                item.tipoMime || 'application/pdf',
                item.fechaSubida,
                item.blob,
                undefined,
                'pliego'
              );
              if (resPart.pliego) actualizados.push(resPart.pliego);
            } catch {}
          } else {
            const res = await apiFetch('/api/pliegos/subir', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/octet-stream',
                'x-pliego-id': item.id,
                'x-pliego-nombre': encodeURIComponent(item.nombre),
                'x-pliego-mime': item.tipoMime || 'application/pdf',
                'x-pliego-fecha': encodeURIComponent(item.fechaSubida),
              },
              body: item.blob,
            });
            if (res.ok) {
              const data = await tryReadJsonResponse(res);
              if (data?.pliego) actualizados.push(data.pliego);
            }
          }
        } else if (item.contenidoTexto) {
          const res = await apiFetch('/api/pliegos/cargar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: item.id,
              nombre: item.nombre,
              tipoMime: item.tipoMime || 'text/plain',
              tamanioBytes: item.contenidoTexto.length,
              tamanioTexto: `${Math.max(1, Math.round(item.contenidoTexto.length / 1024))} KB`,
              fechaSubida: item.fechaSubida,
              contenidoTexto: item.contenidoTexto,
            }),
          });
          if (res.ok) {
            const data = await tryReadJsonResponse(res);
            if (data?.pliego) actualizados.push(data.pliego);
          }
        }
      }
      if (actualizados.length > 0) {
        setPliegosReales(actualizados);
        guardarMetadataLocal(actualizados);
        return true;
      }
    } catch (err) {
      console.warn('Fallo resincronizando IDB:', err);
    }
    return false;
  }, [enviarArchivoPorPartes, guardarMetadataLocal]);

  const subirArchivoPliegoReal = useCallback(
    async (file: File, onProgress?: (info: SubidaProgresoInfo) => void): Promise<PliegoReal> => {
      const id = 'pliego_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
      const fechaSubida = new Date().toLocaleDateString('es-AR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
      const tipoMime =
        file.type ||
        (file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream');

      let pliegoIndexado: PliegoReal;

      if (file.size <= 3.5 * 1024 * 1024) {
        onProgress?.({
          fase: 'subiendo',
          porcentaje: 50,
          detalle: `Subiendo e indexando "${file.name}"...`,
        });
        const res = await apiFetch('/api/pliegos/subir', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/octet-stream',
            'x-pliego-id': id,
            'x-pliego-nombre': encodeURIComponent(file.name),
            'x-pliego-mime': tipoMime,
            'x-pliego-fecha': encodeURIComponent(fechaSubida),
          },
          body: file,
        });

        if (!res.ok) {
          const errData = await tryReadJsonResponse(res);
          throw new Error(errData?.error || `Error subiendo ${file.name} (HTTP ${res.status})`);
        }

        const data = await readJsonResponse(res, `Error procesando ${file.name}`);
        pliegoIndexado = data.pliego;
        onProgress?.({
          fase: 'procesando',
          porcentaje: 100,
          detalle: `Completado (${pliegoIndexado.paginas || 1} pág.)`,
        });
      } else {
        const resPart = await enviarArchivoPorPartes(
          id,
          file.name,
          tipoMime,
          fechaSubida,
          file,
          onProgress,
          'pliego'
        );
        if (!resPart.pliego) {
          throw new Error('No se recibió el pliego procesado del servidor.');
        }
        pliegoIndexado = resPart.pliego;
      }

      if (file.size <= 30 * 1024 * 1024) {
        await guardarArchivoEnIDB({
          id: pliegoIndexado.id,
          nombre: pliegoIndexado.nombre,
          tipoMime: pliegoIndexado.tipoMime,
          fechaSubida: pliegoIndexado.fechaSubida,
          blob: file,
        });
      } else if (pliegoIndexado.contenidoTexto) {
        await guardarArchivoEnIDB({
          id: pliegoIndexado.id,
          nombre: pliegoIndexado.nombre,
          tipoMime: 'text/plain',
          fechaSubida: pliegoIndexado.fechaSubida,
          contenidoTexto: pliegoIndexado.contenidoTexto,
        });
      }

      pliegosHydratedServerRef.current.add(pliegoIndexado.id);
      setPliegosReales(prev => {
        const actualizados = [pliegoIndexado, ...prev.filter(p => p.id !== pliegoIndexado.id)];
        guardarMetadataLocal(actualizados);
        return actualizados;
      });

      const sess = cloudSessionRef.current;
      if (sess) {
        try {
          let pliegoParaNube = pliegoIndexado;
          if (
            !pliegoParaNube.contenidoTexto ||
            pliegoParaNube.contenidoTexto.length < (pliegoParaNube.caracteresTexto || 0)
          ) {
            const txtRes = await apiFetch(`/api/pliegos/${encodeURIComponent(pliegoIndexado.id)}/texto`);
            if (txtRes.ok) {
              const txtData = await tryReadJsonResponse(txtRes);
              if (txtData?.contenidoTexto) {
                pliegoParaNube = { ...pliegoParaNube, contenidoTexto: txtData.contenidoTexto };
              }
            }
          }
          await syncPliegoToFirestore(sess, pliegoParaNube);
        } catch (err) {
          console.warn('[FirestoreSync] Error sincronizando pliego:', err);
        }
      }

      return pliegoIndexado;
    },
    [cloudSessionRef, enviarArchivoPorPartes, guardarMetadataLocal]
  );

  const subirPlanoComparador = useCallback(
    async (
      rol: 'A' | 'B',
      file: File,
      onProgress?: (info: SubidaProgresoInfo) => void
    ): Promise<PlanoComparacionDoc> => {
      const id = `cmp_${rol}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const destino = rol === 'A' ? 'planoA' : 'planoB';
      const fechaSubida = new Date().toLocaleDateString('es-AR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
      const tipoMime = file.type || 'application/pdf';

      let planoDoc: PlanoComparacionDoc;

      if (file.size <= 3.5 * 1024 * 1024) {
        onProgress?.({
          fase: 'subiendo',
          porcentaje: 50,
          detalle: `Subiendo e indexando Plano ${rol}: "${file.name}"...`,
        });
        const res = await apiFetch('/api/pliegos/subir', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/octet-stream',
            'x-pliego-id': id,
            'x-upload-destino': destino,
            'x-pliego-nombre': encodeURIComponent(file.name),
            'x-pliego-mime': tipoMime,
            'x-pliego-fecha': encodeURIComponent(fechaSubida),
          },
          body: file,
        });
        if (!res.ok) {
          const errData = await tryReadJsonResponse(res);
          throw new Error(errData?.error || `Error subiendo Plano ${rol} (HTTP ${res.status})`);
        }
        const data = await readJsonResponse(res, `Error procesando Plano ${rol}`);
        if (!data?.plano) {
          throw new Error(`El servidor no devolvió los metadatos del Plano ${rol}`);
        }
        planoDoc = data.plano as PlanoComparacionDoc;
        onProgress?.({
          fase: 'procesando',
          porcentaje: 100,
          detalle: `Plano ${rol} listo (${planoDoc.paginas || 1} pág.)`,
        });
      } else {
        const resPart = await enviarArchivoPorPartes(
          id,
          file.name,
          tipoMime,
          fechaSubida,
          file,
          onProgress,
          destino
        );
        if (!resPart.plano) {
          throw new Error(`No se recibió el Plano ${rol} procesado del servidor.`);
        }
        planoDoc = resPart.plano;
      }

      if (rol === 'A') setPlanoCompararA(planoDoc);
      else setPlanoCompararB(planoDoc);

      return planoDoc;
    },
    [enviarArchivoPorPartes]
  );

  const eliminarPlanoComparador = useCallback(async (rol: 'A' | 'B') => {
    if (rol === 'A') setPlanoCompararA(null);
    else setPlanoCompararB(null);
    try {
      await apiFetch(`/api/comparador/planos/${rol}`, { method: 'DELETE' });
    } catch (err) {
      console.warn(`Error eliminando Plano ${rol}:`, err);
    }
  }, []);

  const subirAdjuntoChat = useCallback(
    async (
      file: File,
      onProgress?: (info: SubidaProgresoInfo) => void
    ): Promise<ChatAdjuntoPdf> => {
      const id = `chatpdf_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const fechaSubida = new Date().toLocaleDateString('es-AR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
      const tipoMime =
        file.type ||
        (file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream');

      let adjunto: ChatAdjuntoPdf;

      if (file.size <= 3.5 * 1024 * 1024) {
        onProgress?.({
          fase: 'subiendo',
          porcentaje: 55,
          detalle: `Adjuntando e indexando "${file.name}"...`,
        });
        const res = await apiFetch('/api/pliegos/subir', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/octet-stream',
            'x-pliego-id': id,
            'x-upload-destino': 'chatPdf',
            'x-pliego-nombre': encodeURIComponent(file.name),
            'x-pliego-mime': tipoMime,
            'x-pliego-fecha': encodeURIComponent(fechaSubida),
          },
          body: file,
        });
        if (!res.ok) {
          const errData = await tryReadJsonResponse(res);
          throw new Error(errData?.error || `Error adjuntando "${file.name}" (HTTP ${res.status})`);
        }
        const data = await readJsonResponse(res, `Error adjuntando "${file.name}"`);
        if (!data?.adjuntoChat) {
          throw new Error('No se recibió el PDF adjunto indexado del servidor.');
        }
        adjunto = data.adjuntoChat as ChatAdjuntoPdf;
        onProgress?.({
          fase: 'procesando',
          porcentaje: 100,
          detalle: `Listo (${adjunto.paginas} pág.)`,
        });
      } else {
        const resPart = await enviarArchivoPorPartes(
          id,
          file.name,
          tipoMime,
          fechaSubida,
          file,
          onProgress,
          'chatPdf'
        );
        if (!resPart.adjuntoChat) {
          throw new Error('No se recibió el PDF adjunto procesado.');
        }
        adjunto = resPart.adjuntoChat;
      }

      setChatAdjuntos(prev => [adjunto, ...prev.filter(a => a.id !== adjunto.id)]);
      const sess = cloudSessionRef.current;
      if (sess) {
        syncChatAdjuntoToFirestore(sess, adjunto).catch(() => {});
      }
      return adjunto;
    },
    [cloudSessionRef, enviarArchivoPorPartes]
  );

  const eliminarAdjuntoChat = useCallback(
    async (id: string) => {
      setChatAdjuntos(prev => prev.filter(a => a.id !== id));
      try {
        await apiFetch(`/api/chat/adjuntos/${encodeURIComponent(id)}`, { method: 'DELETE' });
      } catch (err) {
        console.warn('Error eliminando adjunto de chat:', err);
      }
      const sess = cloudSessionRef.current;
      if (sess) {
        deleteWorkspaceSubdoc(sess, 'chat_adjuntos', id).catch(() => {});
      }
    },
    [cloudSessionRef]
  );

  const limpiarAdjuntosChat = useCallback(async () => {
    const actuales = [...chatAdjuntos];
    setChatAdjuntos([]);
    try {
      await apiFetch('/api/chat/adjuntos/limpiar', { method: 'POST' });
    } catch (err) {
      console.warn('Error limpiando adjuntos de chat:', err);
    }
    const sess = cloudSessionRef.current;
    if (sess) {
      for (const a of actuales) {
        deleteWorkspaceSubdoc(sess, 'chat_adjuntos', a.id).catch(() => {});
      }
    }
  }, [chatAdjuntos, cloudSessionRef]);

  const agregarPliegoReal = useCallback(
    async (pliego: PliegoReal) => {
      let pliegoFinal = pliego;
      try {
        const res = await apiFetch('/api/pliegos/cargar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(pliego),
        });
        if (res.ok) {
          const data = await tryReadJsonResponse(res);
          if (data?.pliego) pliegoFinal = data.pliego;
        }
      } catch (err) {
        console.warn('Fallo al sincronizar pliego con servidor:', err);
      }

      await guardarArchivoEnIDB({
        id: pliegoFinal.id,
        nombre: pliegoFinal.nombre,
        tipoMime: pliegoFinal.tipoMime,
        fechaSubida: pliegoFinal.fechaSubida,
        contenidoTexto: pliego.contenidoTexto,
      });

      pliegosHydratedServerRef.current.add(pliegoFinal.id);
      setPliegosReales(prev => {
        const actualizados = [pliegoFinal, ...prev.filter(p => p.id !== pliegoFinal.id)];
        guardarMetadataLocal(actualizados);
        return actualizados;
      });

      const sess = cloudSessionRef.current;
      if (sess) {
        syncPliegoToFirestore(sess, {
          ...pliegoFinal,
          contenidoTexto: pliegoFinal.contenidoTexto || pliego.contenidoTexto || '',
        }).catch(err => console.warn('[FirestoreSync] Error subiendo pliego texto:', err));
      }
    },
    [cloudSessionRef, guardarMetadataLocal]
  );

  const eliminarPliegoReal = useCallback(
    async (id: string) => {
      setPliegosReales(prev => {
        const actualizados = prev.filter(p => p.id !== id);
        guardarMetadataLocal(actualizados);
        return actualizados;
      });

      await eliminarArchivoDeIDB(id);
      try {
        await apiFetch(`/api/pliegos/${encodeURIComponent(id)}`, { method: 'DELETE' });
      } catch (err) {
        console.warn('Fallo al eliminar pliego del servidor:', err);
      }

      const sess = cloudSessionRef.current;
      if (sess) {
        deletePliegoFromFirestore(sess, id).catch(err =>
          console.warn('[FirestoreSync] Error eliminando pliego de Firestore:', err)
        );
      }
    },
    [cloudSessionRef, guardarMetadataLocal]
  );

  const limpiarTodosPliegosReales = useCallback(async () => {
    const actuales = [...pliegosReales];
    setPliegosReales([]);
    localStorage.removeItem('pliegos_reales_obra_132kv');
    await limpiarTodosArchivosIDB();
    try {
      await apiFetch('/api/pliegos/limpiar', { method: 'POST' });
    } catch (err) {
      console.warn('Fallo al limpiar pliegos en servidor:', err);
    }

    const sess = cloudSessionRef.current;
    if (sess) {
      for (const p of actuales) {
        deletePliegoFromFirestore(sess, p.id).catch(() => {});
      }
    }
  }, [pliegosReales, cloudSessionRef]);

  // Extracción directa de pliegos técnicos reales
  const extraerDePliego = useCallback(
    async (consulta: string): Promise<string> => {
      if (pliegosReales.length === 0) {
        return "⚠️ **No hay pliegos reales cargados en el sistema.**\n\nPor favor, haz clic en **'➕ Cargar Pliego Real'** para subir tus documentos (PDF, Word o Texto).";
      }

      try {
        const res = await apiFetch('/api/pliegos/extraer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ consulta }),
        });
        if (res.ok) {
          const data = await tryReadJsonResponse(res);
          if (data && data.exito && data.respuesta) {
            return data.respuesta;
          }
        }
      } catch (e) {
        console.warn('Fallo en /api/pliegos/extraer, usando motor local:', e);
      }
      const local = buscarYExtraerDePliegosReales(consulta, pliegosReales);
      return local.resumen;
    },
    [pliegosReales]
  );

  const value = useMemo<PliegosContextType>(
    () => ({
      pliegosReales,
      setPliegosReales,
      planoCompararA,
      setPlanoCompararA,
      planoCompararB,
      setPlanoCompararB,
      chatAdjuntos,
      setChatAdjuntos,
      pliegosHydratedServerRef,
      guardarMetadataLocal,
      hidratarPliegoEnServidorLocal,
      hidratarChatAdjuntosEnServidorLocal,
      resincronizarPliegosDesdeIDB,
      subirArchivoPliegoReal,
      subirPlanoComparador,
      eliminarPlanoComparador,
      subirAdjuntoChat,
      eliminarAdjuntoChat,
      limpiarAdjuntosChat,
      agregarPliegoReal,
      eliminarPliegoReal,
      limpiarTodosPliegosReales,
      extraerDePliego,
    }),
    [
      pliegosReales,
      planoCompararA,
      planoCompararB,
      chatAdjuntos,
      guardarMetadataLocal,
      hidratarPliegoEnServidorLocal,
      hidratarChatAdjuntosEnServidorLocal,
      resincronizarPliegosDesdeIDB,
      subirArchivoPliegoReal,
      subirPlanoComparador,
      eliminarPlanoComparador,
      subirAdjuntoChat,
      eliminarAdjuntoChat,
      limpiarAdjuntosChat,
      agregarPliegoReal,
      eliminarPliegoReal,
      limpiarTodosPliegosReales,
      extraerDePliego,
    ]
  );

  return <PliegosContext.Provider value={value}>{children}</PliegosContext.Provider>;
};

export const usePliegos = () => {
  const context = useContext(PliegosContext);
  if (!context) throw new Error('usePliegos must be used within a PliegosProvider');
  return context;
};
