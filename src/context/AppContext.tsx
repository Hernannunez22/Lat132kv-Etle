import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import {
  Plano,
  Hito,
  Interferencia,
  AppConfig,
  TabType,
  NotaAudio,
  FotoCampo,
  MensajeChat,
  PliegoReal,
  PlanoComparacionDoc,
  ChatAdjuntoPdf,
  MinutaReunion,
  CompromisoMinuta,
  NotaPedidoIngenieria,
  EstadoCompromiso,
} from '../types';
import { 
  TOTAL_PLANIFICADOS_CONTRATO_GLOBAL, 
  PLANOS_INICIALES_FIJOS, 
  HITOS_CONTRATUALES_INICIALES_FIJOS, 
  INTERFERENCIAS_INICIALES 
} from '../data/initialData';
import { buscarYExtraerDePliegosReales } from '../data/pliegosContractuales';
import {
  guardarArchivoEnIDB,
  obtenerTodosArchivosIDB,
  eliminarArchivoDeIDB,
  limpiarTodosArchivosIDB,
} from '../utils/pliegoStorage';

export interface SubidaProgresoInfo {
  fase: 'subiendo' | 'procesando';
  porcentaje: number;
  detalle: string;
}

interface AppContextType {
  planos: Plano[];
  hitos: Hito[];
  interferencias: Interferencia[];
  pliegosReales: PliegoReal[];
  planoCompararA: PlanoComparacionDoc | null;
  planoCompararB: PlanoComparacionDoc | null;
  chatAdjuntos: ChatAdjuntoPdf[];
  minutas: MinutaReunion[];
  compromisosMinutas: CompromisoMinuta[];
  notasPedido: NotaPedidoIngenieria[];
  config: AppConfig;
  connectionStatus: string;
  megabytesR2: string;
  activeTab: TabType;
  selectedFrenteFilter: string;
  isSyncing: boolean;
  notasCampo: string;
  audiosCampo: NotaAudio[];
  fotosCampo: FotoCampo[];
  chatMessages: MensajeChat[];
  ultimoInforme: string;
  totalPlanificados: number;
  isSettingsOpen: boolean;
  isHitosModalOpen: boolean;
  isPliegosModalOpen: boolean;
  setActiveTab: (tab: TabType) => void;
  setSelectedFrenteFilter: (filter: string) => void;
  setIsSettingsOpen: (open: boolean) => void;
  setIsHitosModalOpen: (open: boolean) => void;
  setIsPliegosModalOpen: (open: boolean) => void;
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
  sincronizarMinutasDrive: (params: {
    accessToken: string;
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
    cambios: Partial<Pick<CompromisoMinuta, 'estado' | 'responsable' | 'fechaLimite' | 'descripcion' | 'observaciones' | 'frente'>>
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
  updateConfig: (cfg: AppConfig) => void;
  sincronizarDatos: () => Promise<void>;
  saveHitos: (nuevosHitos: Hito[]) => Promise<void>;
  setNotasCampo: (notas: string) => void;
  addFoto: (foto: FotoCampo) => void;
  deleteFoto: (id: string) => void;
  addAudio: (audio: NotaAudio) => void;
  deleteAudio: (id: string) => void;
  sendChatMessage: (texto: string) => Promise<void>;
  extraerDePliego: (consulta: string) => Promise<string>;
  clearChat: () => void;
  setUltimoInforme: (inf: string) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Config
  const [config, setConfig] = useState<AppConfig>(() => ({
    apiUrl: localStorage.getItem('cfg_api_url') || '',
    r2AccountId: localStorage.getItem('cfg_r2_account_id') || 'e1d197bd1aa5e242733d883eab2a9322',
    r2Bucket: localStorage.getItem('cfg_r2_bucket') || 'backup-obra-132kv'
  }));

  // App State
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [selectedFrenteFilter, setSelectedFrenteFilter] = useState<string>('TODOS');
  const [connectionStatus, setConnectionStatus] = useState<string>('Conectado');
  const [megabytesR2, setMegabytesR2] = useState<string>('156.4 MB');
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isHitosModalOpen, setIsHitosModalOpen] = useState<boolean>(false);
  const [isPliegosModalOpen, setIsPliegosModalOpen] = useState<boolean>(false);

  // Pliegos Reales del usuario (sin ejemplos inventados)
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

  // Data
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
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.error(e);
    }
    return INTERFERENCIAS_INICIALES;
  });

  // Media & Notes
  const [notasCampo, setNotasCampoState] = useState<string>(() => {
    return localStorage.getItem('notas_obra_132kv') || '';
  });

  const [audiosCampo, setAudiosCampo] = useState<NotaAudio[]>(() => {
    try {
      const saved = localStorage.getItem('audios_obra_132kv');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  const [fotosCampo, setFotosCampo] = useState<FotoCampo[]>(() => {
    try {
      const saved = localStorage.getItem('fotos_obra_132kv');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  const [chatMessages, setChatMessages] = useState<MensajeChat[]>([
    {
      id: 'init-1',
      texto:
        '⚡ **Asistente Integral de Ingeniería, Auditoría y Cuadros Comparativos (132 kV)**\n\n' +
        'Opera sobre toda la documentación de obra conectada en memoria:\n' +
        '- **Pliegos Reales (PDF / Word / Texto):** lee artículos, tolerancias y exigencias de todos tus tomos sin volver a adjuntarlos.\n' +
        '- **Planos PDF del Comparador (A vs. B):** cruza lo que cargues en la pestaña **Comparar** frente a tus pliegos.\n' +
        '- **Estado Vivo de Obra:** incluye catálogo de planos, hitos contractuales, interferencias y notas de campo para generar **tablas y matrices comparativas**.',
      esUsuario: false,
      fecha: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);

  const [ultimoInforme, setUltimoInforme] = useState<string>('');

  const guardarMetadataLocal = (lista: PliegoReal[]) => {
    try {
      const compacta = lista.map(({ dataBase64: _drop, ...rest }) => ({
        ...rest,
        contenidoTexto: rest.contenidoTexto ? rest.contenidoTexto.slice(0, 12000) : ''
      }));
      localStorage.setItem('pliegos_reales_obra_132kv', JSON.stringify(compacta));
    } catch (e) {
      console.warn('LocalStorage limit for pliegos:', e);
    }
  };

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
      const CHUNK_SIZE = 4 * 1024 * 1024; // 4 MB por parte (seguro bajo el límite de 32 MB de Cloud Run)
      const totalBytes = blob.size;
      const totalMB = (totalBytes / (1024 * 1024)).toFixed(1);

      onProgress?.({
        fase: 'subiendo',
        porcentaje: 0,
        detalle: `Iniciando subida de "${nombre}" (${totalMB} MB)...`,
      });

      const initRes = await fetch('/api/pliegos/subir/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, nombre, tipoMime, totalBytes, fechaSubida, destino }),
      });
      if (!initRes.ok) {
        const errData = await initRes.json().catch(() => ({}));
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
            const chunkRes = await fetch('/api/pliegos/subir/chunk', {
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
            const errJson = await chunkRes.json().catch(() => ({}));
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

      const finRes = await fetch('/api/pliegos/subir/finalizar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!finRes.ok) {
        const errData = await finRes.json().catch(() => ({}));
        throw new Error(errData?.error || 'Error finalizando subida');
      }

      // Consultar progreso de extracción página por página hasta completar
      while (true) {
        await new Promise(r => setTimeout(r, 500));
        const stRes = await fetch(`/api/pliegos/subir/estado/${encodeURIComponent(id)}`);
        if (!stRes.ok) {
          throw new Error('Se perdió el seguimiento de indexación en el servidor.');
        }
        const stData = await stRes.json();
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
            } catch {
              // Continuar con siguientes
            }
          } else {
            const res = await fetch('/api/pliegos/subir', {
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
              const data = await res.json();
              if (data?.pliego) actualizados.push(data.pliego);
            }
          }
        } else if (item.contenidoTexto) {
          const res = await fetch('/api/pliegos/cargar', {
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
            const data = await res.json();
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
  }, [enviarArchivoPorPartes]);

  const persistirMinutasLocal = (
    m: MinutaReunion[],
    c: CompromisoMinuta[],
    np: NotaPedidoIngenieria[]
  ) => {
    try {
      localStorage.setItem('cache_minutas_132kv', JSON.stringify(m));
      localStorage.setItem('cache_compromisos_minutas_132kv', JSON.stringify(c));
      localStorage.setItem('cache_notas_pedido_132kv', JSON.stringify(np));
    } catch {}
  };

  // Al iniciar, sincronizar pliegos, planos comparador y minutas con el servidor
  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const [resPliegos, resPlanos, resMinutas, resChatAdj] = await Promise.all([
          fetch('/api/pliegos'),
          fetch('/api/comparador/planos'),
          fetch('/api/minutas'),
          fetch('/api/chat/adjuntos'),
        ]);
        if (cancelado) return;
        if (resPliegos.ok) {
          const data = await resPliegos.json();
          if (Array.isArray(data?.pliegos) && data.pliegos.length > 0) {
            setPliegosReales(data.pliegos);
            guardarMetadataLocal(data.pliegos);
          } else {
            await resincronizarPliegosDesdeIDB();
          }
        }
        if (resPlanos.ok && !cancelado) {
          const cmpData = await resPlanos.json();
          if (cmpData?.planoA) setPlanoCompararA(cmpData.planoA);
          if (cmpData?.planoB) setPlanoCompararB(cmpData.planoB);
        }
        if (resMinutas.ok && !cancelado) {
          const minData = await resMinutas.json();
          if (minData?.exito) {
            const mList = Array.isArray(minData.minutas) ? minData.minutas : [];
            const cList = Array.isArray(minData.compromisos) ? minData.compromisos : [];
            const npList = Array.isArray(minData.notasPedido) ? minData.notasPedido : [];
            setMinutas(mList);
            setCompromisosMinutas(cList);
            setNotasPedido(npList);
            persistirMinutasLocal(mList, cList, npList);
          }
        }
        if (resChatAdj.ok && !cancelado) {
          const adjData = await resChatAdj.json();
          if (Array.isArray(adjData?.adjuntos)) {
            setChatAdjuntos(adjData.adjuntos);
          }
        }
      } catch {
        // Ignorar si servidor aún está iniciando
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [resincronizarPliegosDesdeIDB]);

  const subirArchivoPliegoReal = async (
    file: File,
    onProgress?: (info: SubidaProgresoInfo) => void
  ): Promise<PliegoReal> => {
    const id = 'pliego_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const fechaSubida = new Date().toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    const tipoMime = file.type || (file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream');

    let pliegoIndexado: PliegoReal;

    if (file.size <= 3.5 * 1024 * 1024) {
      onProgress?.({
        fase: 'subiendo',
        porcentaje: 50,
        detalle: `Subiendo e indexando "${file.name}"...`,
      });
      const res = await fetch('/api/pliegos/subir', {
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
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData?.error || `Error subiendo ${file.name} (HTTP ${res.status})`);
      }

      const data = await res.json();
      pliegoIndexado = data.pliego;
      onProgress?.({
        fase: 'procesando',
        porcentaje: 100,
        detalle: `Completado (${pliegoIndexado.paginas || 1} pág.)`,
      });
    } else {
      // Subida en fragmentos de 4 MB para archivos grandes (ej. 50 MB, 250 MB, 500 MB)
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

    // Para archivos <= 30 MB respaldar el binario en IDB; para archivos pesados (ej. 250 MB) guardar solo el texto extraído
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

    setPliegosReales(prev => {
      const actualizados = [pliegoIndexado, ...prev.filter(p => p.id !== pliegoIndexado.id)];
      guardarMetadataLocal(actualizados);
      return actualizados;
    });

    return pliegoIndexado;
  };

  const subirPlanoComparador = async (
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
      const res = await fetch('/api/pliegos/subir', {
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
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData?.error || `Error subiendo Plano ${rol} (HTTP ${res.status})`);
      }
      const data = await res.json();
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
  };

  const eliminarPlanoComparador = async (rol: 'A' | 'B') => {
    if (rol === 'A') setPlanoCompararA(null);
    else setPlanoCompararB(null);
    try {
      await fetch(`/api/comparador/planos/${rol}`, { method: 'DELETE' });
    } catch (err) {
      console.warn(`Error eliminando Plano ${rol}:`, err);
    }
  };

  const subirAdjuntoChat = async (
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
    const tipoMime = file.type || (file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream');

    let adjunto: ChatAdjuntoPdf;

    if (file.size <= 3.5 * 1024 * 1024) {
      onProgress?.({
        fase: 'subiendo',
        porcentaje: 55,
        detalle: `Adjuntando e indexando "${file.name}"...`,
      });
      const res = await fetch('/api/pliegos/subir', {
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
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData?.error || `Error adjuntando "${file.name}" (HTTP ${res.status})`);
      }
      const data = await res.json();
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
    return adjunto;
  };

  const eliminarAdjuntoChat = async (id: string) => {
    setChatAdjuntos(prev => prev.filter(a => a.id !== id));
    try {
      await fetch(`/api/chat/adjuntos/${encodeURIComponent(id)}`, { method: 'DELETE' });
    } catch (err) {
      console.warn('Error eliminando adjunto de chat:', err);
    }
  };

  const limpiarAdjuntosChat = async () => {
    setChatAdjuntos([]);
    try {
      await fetch('/api/chat/adjuntos/limpiar', { method: 'POST' });
    } catch (err) {
      console.warn('Error limpiando adjuntos de chat:', err);
    }
  };

  const agregarPliegoReal = async (pliego: PliegoReal) => {
    let pliegoFinal = pliego;
    try {
      const res = await fetch('/api/pliegos/cargar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pliego)
      });
      if (res.ok) {
        const data = await res.json();
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

    setPliegosReales(prev => {
      const actualizados = [pliegoFinal, ...prev.filter(p => p.id !== pliegoFinal.id)];
      guardarMetadataLocal(actualizados);
      return actualizados;
    });
  };

  const eliminarPliegoReal = async (id: string) => {
    setPliegosReales(prev => {
      const actualizados = prev.filter(p => p.id !== id);
      guardarMetadataLocal(actualizados);
      return actualizados;
    });

    await eliminarArchivoDeIDB(id);
    try {
      await fetch(`/api/pliegos/${id}`, { method: 'DELETE' });
    } catch (err) {
      console.warn('Fallo al eliminar pliego del servidor:', err);
    }
  };

  const limpiarTodosPliegosReales = async () => {
    setPliegosReales([]);
    localStorage.removeItem('pliegos_reales_obra_132kv');
    await limpiarTodosArchivosIDB();
    try {
      await fetch('/api/pliegos/limpiar', { method: 'POST' });
    } catch (err) {
      console.warn('Fallo al limpiar pliegos en servidor:', err);
    }
  };

  // Acciones de Minutas, Compromisos y Notas de Pedido
  const sincronizarMinutasDrive = async (params: {
    accessToken: string;
    folderId?: string;
    buscarEnTodoDrive?: boolean;
  }) => {
    const res = await fetch('/api/minutas/sincronizar-drive', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${params.accessToken}`,
      },
      body: JSON.stringify({
        folderId: params.folderId,
        buscarEnTodoDrive: params.buscarEnTodoDrive ?? true,
      }),
    });
    const data = await res.json();
    if (!res.ok || !data?.exito) {
      throw new Error(data?.error || `Error sincronizando minutas desde Drive (HTTP ${res.status})`);
    }
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

    return {
      carpetaRaizNombre: String(data.carpetaRaizNombre || 'Google Drive'),
      carpetasEscaneadas: Number(data.carpetasEscaneadas || 0),
      archivosDetectados: Number(data.archivosDetectados || 0),
      minutasNuevas: Array.isArray(data.minutasNuevas) ? (data.minutasNuevas as MinutaReunion[]) : [],
      minutasActualizadas: Number(data.minutasActualizadas || 0),
      minutasOmitidasPorExistentes: Number(data.minutasOmitidasPorExistentes || 0),
      compromisosNuevos: Array.isArray(data.compromisosNuevos)
        ? (data.compromisosNuevos as CompromisoMinuta[])
        : [],
      erroresArchivos: Array.isArray(data.erroresArchivos) ? data.erroresArchivos : [],
    };
  };

  const subirMinutaArchivo = async (
    file: File,
    meta?: { codigo?: string; titulo?: string; fechaReunion?: string; frente?: string; participantes?: string }
  ) => {
    const res = await fetch('/api/minutas/subir', {
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
    const data = await res.json();
    if (!res.ok || !data?.exito) {
      throw new Error(data?.error || `No se pudo procesar la minuta (HTTP ${res.status})`);
    }
    const nuevasMinutas = [data.minuta as MinutaReunion, ...minutas];
    const nuevosComp = [...(data.compromisosExtraidos as CompromisoMinuta[]), ...compromisosMinutas];
    setMinutas(nuevasMinutas);
    setCompromisosMinutas(nuevosComp);
    persistirMinutasLocal(nuevasMinutas, nuevosComp, notasPedido);
    return {
      minuta: data.minuta as MinutaReunion,
      compromisosExtraidos: data.compromisosExtraidos as CompromisoMinuta[],
      fuenteExtraccion: String(data.fuenteExtraccion || 'extractor-local'),
    };
  };

  const registrarMinutaTexto = async (payload: {
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
    const res = await fetch('/api/minutas/registrar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok || !data?.exito) {
      throw new Error(data?.error || `Error registrando minuta (HTTP ${res.status})`);
    }
    const nuevasMinutas = [data.minuta as MinutaReunion, ...minutas];
    const nuevosComp = [...(data.compromisosExtraidos as CompromisoMinuta[]), ...compromisosMinutas];
    setMinutas(nuevasMinutas);
    setCompromisosMinutas(nuevosComp);
    persistirMinutasLocal(nuevasMinutas, nuevosComp, notasPedido);
    return {
      minuta: data.minuta as MinutaReunion,
      compromisosExtraidos: data.compromisosExtraidos as CompromisoMinuta[],
      fuenteExtraccion: String(data.fuenteExtraccion || 'manual'),
    };
  };

  const eliminarMinuta = async (id: string) => {
    const res = await fetch(`/api/minutas/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('No se pudo eliminar la minuta');
    const nuevasMinutas = minutas.filter(m => m.id !== id);
    const nuevosComp = compromisosMinutas.filter(c => c.minutaId !== id);
    setMinutas(nuevasMinutas);
    setCompromisosMinutas(nuevosComp);
    persistirMinutasLocal(nuevasMinutas, nuevosComp, notasPedido);
  };

  const agregarCompromisoMinuta = async (payload: {
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
    const res = await fetch('/api/minutas/compromisos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok || !data?.exito) {
      throw new Error(data?.error || 'Error creando compromiso');
    }
    const nuevosComp = [data.compromiso as CompromisoMinuta, ...compromisosMinutas];
    setCompromisosMinutas(nuevosComp);
    persistirMinutasLocal(minutas, nuevosComp, notasPedido);
    return data.compromiso as CompromisoMinuta;
  };

  const actualizarCompromisoMinuta = async (
    id: string,
    cambios: Partial<Pick<CompromisoMinuta, 'estado' | 'responsable' | 'fechaLimite' | 'descripcion' | 'observaciones' | 'frente'>>
  ) => {
    const res = await fetch(`/api/minutas/compromisos/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cambios),
    });
    const data = await res.json();
    if (!res.ok || !data?.exito) {
      throw new Error(data?.error || 'No se pudo actualizar el compromiso');
    }
    const nuevosComp = compromisosMinutas.map(c => (c.id === id ? (data.compromiso as CompromisoMinuta) : c));
    setCompromisosMinutas(nuevosComp);
    persistirMinutasLocal(minutas, nuevosComp, notasPedido);
  };

  const eliminarCompromisoMinuta = async (id: string) => {
    const res = await fetch(`/api/minutas/compromisos/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('No se pudo eliminar el compromiso');
    const nuevosComp = compromisosMinutas.filter(c => c.id !== id);
    setCompromisosMinutas(nuevosComp);
    persistirMinutasLocal(minutas, nuevosComp, notasPedido);
  };

  const generarNotaPedido = async (payload: {
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
    const res = await fetch('/api/minutas/nota-pedido/generar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
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
    return nota;
  };

  const eliminarNotaPedido = async (id: string) => {
    const res = await fetch(`/api/minutas/notas-pedido/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('No se pudo eliminar la Nota de Pedido');
    const nuevasNotas = notasPedido.filter(n => n.id !== id);
    setNotasPedido(nuevasNotas);
    persistirMinutasLocal(minutas, compromisosMinutas, nuevasNotas);
  };

  // Persist handlers
  const updateConfig = (newCfg: AppConfig) => {
    setConfig(newCfg);
    localStorage.setItem('cfg_api_url', newCfg.apiUrl);
    localStorage.setItem('cfg_r2_account_id', newCfg.r2AccountId);
    localStorage.setItem('cfg_r2_bucket', newCfg.r2Bucket);
  };

  const setNotasCampo = (txt: string) => {
    setNotasCampoState(txt);
    localStorage.setItem('notas_obra_132kv', txt);
  };

  const addFoto = (f: FotoCampo) => {
    setFotosCampo(prev => {
      const updated = [f, ...prev].slice(0, 10);
      try {
        localStorage.setItem('fotos_obra_132kv', JSON.stringify(updated));
      } catch (e) {
        console.warn('LocalStorage limit for photos:', e);
      }
      return updated;
    });
  };

  const deleteFoto = (id: string) => {
    setFotosCampo(prev => {
      const updated = prev.filter(f => f.id !== id);
      localStorage.setItem('fotos_obra_132kv', JSON.stringify(updated));
      return updated;
    });
  };

  const addAudio = (a: NotaAudio) => {
    setAudiosCampo(prev => {
      const updated = [a, ...prev].slice(0, 10);
      try {
        localStorage.setItem('audios_obra_132kv', JSON.stringify(updated));
      } catch (e) {
        console.warn('LocalStorage limit for audio:', e);
      }
      return updated;
    });
  };

  const deleteAudio = (id: string) => {
    setAudiosCampo(prev => {
      const updated = prev.filter(a => a.id !== id);
      localStorage.setItem('audios_obra_132kv', JSON.stringify(updated));
      return updated;
    });
  };

  const saveHitos = async (nuevosHitos: Hito[]) => {
    setHitos(nuevosHitos);
    localStorage.setItem('cache_hitos_obra_132kv', JSON.stringify(nuevosHitos));

    if (config.apiUrl && config.apiUrl.startsWith('http')) {
      let url = config.apiUrl;
      if (url.includes('/edit')) url = url.replace(/\/edit.*$/, '/exec');
      if (!url.endsWith('/exec')) url = url.replace(/\/?$/, '/exec');

      try {
        await fetch(url, {
          method: 'POST',
          body: JSON.stringify({
            accion: 'guardar_cronograma_hitos_r2',
            hitos: nuevosHitos
          })
        });
      } catch (e) {
        console.warn('Could not sync hitos to remote API:', e);
      }
    }
  };

  // Sync Logic
  const sincronizarDatos = useCallback(async () => {
    setIsSyncing(true);
    setConnectionStatus('Sincronizando...');

    const apiUrl = config.apiUrl.trim();
    if (apiUrl && apiUrl.startsWith('http')) {
      let finalUrl = apiUrl;
      if (finalUrl.includes('/edit')) finalUrl = finalUrl.replace(/\/edit.*$/, '/exec');
      if (!finalUrl.endsWith('/exec') && !finalUrl.includes('/exec?')) finalUrl = finalUrl.replace(/\/?$/, '/exec');

      try {
        const separador = finalUrl.includes('?') ? '&' : '?';
        const res = await fetch(`${finalUrl}${separador}api=datos&_t=${Date.now()}`, {
          method: 'GET',
          redirect: 'follow'
        });
        const data = await res.json();
        if (data && data.planos && Array.isArray(data.planos)) {
          setPlanos(data.planos);
          localStorage.setItem('cache_planos_132kv', JSON.stringify(data.planos));
          if (data.interferencias) setInterferencias(data.interferencias);
          if (data.hitos) setHitos(data.hitos);
          if (data.megabytesR2) setMegabytesR2(`${data.megabytesR2} MB`);
          setConnectionStatus('Sheets Conectado');
          setIsSyncing(false);
          return;
        }
      } catch (err) {
        console.warn('Fetch to Sheets failed, trying R2...', err);
      }
    }

    // Direct Cloudflare R2 backup check
    const accountId = config.r2AccountId || 'e1d197bd1aa5e242733d883eab2a9322';
    const bucketName = config.r2Bucket || 'backup-obra-132kv';
    const urlR2 = `https://${accountId}.r2.cloudflarestorage.com/${bucketName}/_indice_maestro_obra.json`;

    try {
      const resR2 = await fetch(urlR2);
      const dataR2 = await resR2.json();
      if (dataR2 && (dataR2.carpetas || dataR2.planos)) {
        const planosExtraidos: Plano[] = (dataR2.carpetas || []).map((c: { ruta?: string; nombre: string }) => {
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
            urlR2: `https://${accountId}.r2.cloudflarestorage.com/${bucketName}/${encodeURI(c.ruta || '')}`
          };
        });

        if (planosExtraidos.length > 0) {
          setPlanos(planosExtraidos);
          localStorage.setItem('cache_planos_132kv', JSON.stringify(planosExtraidos));
        }
        if (dataR2.megabytes_transferidos) {
          setMegabytesR2(`${dataR2.megabytes_transferidos} MB`);
        }
        setConnectionStatus('Respaldo R2 Activo');
        setIsSyncing(false);
        return;
      }
    } catch (errR2) {
      console.warn('R2 backup check:', errR2);
    }

    // Keep active local state
    setConnectionStatus('Respaldo R2 Activo');
    setIsSyncing(false);
  }, [config.apiUrl, config.r2AccountId, config.r2Bucket]);

  // Extracción directa de pliegos técnicos reales (solo envía consulta, nunca megabytes)
  const extraerDePliego = async (consulta: string): Promise<string> => {
    if (pliegosReales.length === 0) {
      return "⚠️ **No hay pliegos reales cargados en el sistema.**\n\nPor favor, haz clic en **'➕ Cargar Pliego Real'** para subir tus documentos (PDF, Word o Texto).";
    }

    try {
      const res = await fetch('/api/pliegos/extraer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ consulta })
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.exito && data.respuesta) {
          return data.respuesta;
        }
      }
    } catch (e) {
      console.warn('Fallo en /api/pliegos/extraer, usando motor local:', e);
    }
    const local = buscarYExtraerDePliegosReales(consulta, pliegosReales);
    return local.resumen;
  };

  const construirContextoObra = () => {
    const apcCount = planos.filter(p => p.selloApc).length;
    const resumenPorDisciplina: Record<string, { total: number; apc: number }> = {};
    for (const p of planos) {
      const disc = p.disciplina || 'General';
      if (!resumenPorDisciplina[disc]) resumenPorDisciplina[disc] = { total: 0, apc: 0 };
      resumenPorDisciplina[disc].total += 1;
      if (p.selloApc) resumenPorDisciplina[disc].apc += 1;
    }
    return {
      resumenPlanos: {
        totalPlanificados: TOTAL_PLANIFICADOS_CONTRATO_GLOBAL,
        emitidos: planos.length,
        conSelloApc: apcCount,
        porDisciplina: resumenPorDisciplina,
        muestraPlanos: planos.slice(0, 45).map(p => ({
          codigo: p.codigo,
          descripcion: p.descripcion,
          disciplina: p.disciplina,
          revision: p.revision,
          proyecto: p.proyecto,
          estado: p.estado,
          selloApc: p.selloApc,
        })),
      },
      hitos,
      interferencias,
      minutas: minutas.slice(0, 15).map(m => ({
        codigo: m.codigo,
        titulo: m.titulo,
        fechaReunion: m.fechaReunion,
        frente: m.frente,
        resumen: m.resumen,
      })),
      compromisosMinutas: compromisosMinutas.slice(0, 50),
      notasPedido: notasPedido.slice(0, 20).map(n => ({
        numeroNota: n.numeroNota,
        fechaEmision: n.fechaEmision,
        destinatario: n.destinatario,
        frente: n.frente,
        asunto: n.asunto,
      })),
      notasCampo: notasCampo ? notasCampo.slice(0, 3000) : '',
    };
  };

  // Streaming SSE hacia el backend: muestra la respuesta palabra a palabra al instante
  const ejecutarStreamChat = async (
    msg: string,
    historial: string,
    pliegoIds: string[],
    contextoObra: Record<string, any>,
    idAi: string
  ): Promise<{ ok: boolean; needsSync?: boolean }> => {
    const res = await fetch('/api/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mensaje: msg, historial, pliegoIds, contextoObra })
    });

    if (!res.ok || !res.body) {
      return { ok: false };
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let acumulado = '';
    let needsSync = false;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const eventos = buffer.split('\n\n');
      buffer = eventos.pop() || '';

      for (const evt of eventos) {
        const line = evt.trim();
        if (!line.startsWith('data:')) continue;
        const jsonStr = line.slice(5).trim();
        if (!jsonStr) continue;
        try {
          const payload = JSON.parse(jsonStr);
          if (payload.needsSync) {
            needsSync = true;
          }
          if (payload.chunk) {
            acumulado += payload.chunk;
            const textoActual = acumulado;
            setChatMessages(prev =>
              prev.map(m => (m.id === idAi ? { ...m, texto: textoActual } : m))
            );
          }
          if (payload.error && !acumulado) {
            return { ok: false };
          }
        } catch {
          // Ignorar fragmentos parciales
        }
      }
    }

    if (needsSync) return { ok: false, needsSync: true };
    return { ok: acumulado.trim().length > 0 };
  };

  // Chat QA Logic integral (Pliegos + Planos PDF Comparador + Catálogo + Hitos + Interferencias)
  const sendChatMessage = async (msg: string) => {
    if (!msg.trim()) return;

    const historialReciente = chatMessages
      .filter(m => m.id !== 'init-1' && m.id !== 'init-reset')
      .slice(-6)
      .map(m => `${m.esUsuario ? 'Usuario' : 'Asistente'}: ${m.texto.slice(0, 600)}`)
      .join('\n\n');

    const userMsg: MensajeChat = {
      id: 'usr-' + Date.now(),
      texto: msg,
      esUsuario: true,
      fecha: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      adjuntosNombres: chatAdjuntos.length > 0 ? chatAdjuntos.map(a => a.nombre) : undefined,
    };

    setChatMessages(prev => [...prev, userMsg]);

    const idAi = 'ai-' + Date.now();
    const loadingAi: MensajeChat = {
      id: idAi,
      texto: 'Analizando pliegos, planos e ingeniería de obra...',
      esUsuario: false,
      fecha: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    setChatMessages(prev => [...prev, loadingAi]);

    const pliegoIds = pliegosReales.map(p => p.id);
    const contextoObra = construirContextoObra();

    // 1. Streaming SSE instantáneo (con contexto integral de obra + planos + pliegos)
    try {
      let streamRes = await ejecutarStreamChat(msg, historialReciente, pliegoIds, contextoObra, idAi);
      if (streamRes.needsSync) {
        setChatMessages(prev => prev.map(m => m.id === idAi ? { ...m, texto: 'Sincronizando índice de pliegos...' } : m));
        const synced = await resincronizarPliegosDesdeIDB();
        if (synced) {
          streamRes = await ejecutarStreamChat(msg, historialReciente, pliegoIds, contextoObra, idAi);
        }
      }
      if (streamRes.ok) return;
    } catch (errStream) {
      console.warn('Error en stream /api/chat/stream:', errStream);
    }

    // 2. Fallback no-streaming
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mensaje: msg, historial: historialReciente, pliegoIds, contextoObra })
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.exito && data.respuesta) {
          setChatMessages(prev => prev.map(m => m.id === idAi ? { ...m, texto: data.respuesta } : m));
          return;
        }
      }
    } catch (errApi) {
      console.warn('API local /api/chat no respondió, usando respaldo local:', errApi);
    }

    // 3. Fallback local instantáneo
    const extraccion = buscarYExtraerDePliegosReales(msg, pliegosReales);
    setChatMessages(prev => prev.map(m => m.id === idAi ? { ...m, texto: extraccion.resumen } : m));
  };

  const clearChat = () => {
    setChatMessages([
      {
        id: 'init-reset',
        texto:
          '⚡ Chat reiniciado.\n\n' +
          `Activos en memoria: **${pliegosReales.length} pliego(s) real(es)** · ` +
          `**${[planoCompararA, planoCompararB].filter(Boolean).length} plano(s) PDF en comparador** · ` +
          `**${planos.length} planos en catálogo** · **${hitos.length} hitos** · **${interferencias.length} interferencias**.`,
        esUsuario: false,
        fecha: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ]);
  };

  return (
    <AppContext.Provider value={{
      planos,
      hitos,
      interferencias,
      pliegosReales,
      planoCompararA,
      planoCompararB,
      chatAdjuntos,
      minutas,
      compromisosMinutas,
      notasPedido,
      config,
      connectionStatus,
      megabytesR2,
      activeTab,
      selectedFrenteFilter,
      isSyncing,
      notasCampo,
      audiosCampo,
      fotosCampo,
      chatMessages,
      ultimoInforme,
      totalPlanificados: TOTAL_PLANIFICADOS_CONTRATO_GLOBAL,
      isSettingsOpen,
      isHitosModalOpen,
      isPliegosModalOpen,
      setActiveTab,
      setSelectedFrenteFilter,
      setIsSettingsOpen,
      setIsHitosModalOpen,
      setIsPliegosModalOpen,
      subirArchivoPliegoReal,
      subirPlanoComparador,
      eliminarPlanoComparador,
      subirAdjuntoChat,
      eliminarAdjuntoChat,
      limpiarAdjuntosChat,
      agregarPliegoReal,
      eliminarPliegoReal,
      limpiarTodosPliegosReales,
      sincronizarMinutasDrive,
      subirMinutaArchivo,
      registrarMinutaTexto,
      eliminarMinuta,
      agregarCompromisoMinuta,
      actualizarCompromisoMinuta,
      eliminarCompromisoMinuta,
      generarNotaPedido,
      eliminarNotaPedido,
      updateConfig,
      sincronizarDatos,
      saveHitos,
      setNotasCampo,
      addFoto,
      deleteFoto,
      addAudio,
      deleteAudio,
      sendChatMessage,
      extraerDePliego,
      clearChat,
      setUltimoInforme
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within an AppProvider');
  return context;
};
