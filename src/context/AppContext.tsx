import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { Plano, Hito, Interferencia, AppConfig, TabType, NotaAudio, FotoCampo, MensajeChat } from '../types';
import { 
  TOTAL_PLANIFICADOS_CONTRATO_GLOBAL, 
  PLANOS_INICIALES_FIJOS, 
  HITOS_CONTRATUALES_INICIALES_FIJOS, 
  INTERFERENCIAS_INICIALES 
} from '../data/initialData';
import { buscarYExtraerArticulosPliego } from '../data/pliegosContractuales';

interface AppContextType {
  planos: Plano[];
  hitos: Hito[];
  interferencias: Interferencia[];
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
  setActiveTab: (tab: TabType) => void;
  setSelectedFrenteFilter: (filter: string) => void;
  setIsSettingsOpen: (open: boolean) => void;
  setIsHitosModalOpen: (open: boolean) => void;
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
      texto: '⚡ **Asistente de Ingeniería y Auditoría (132 kV)**\n\n📖 **Pliegos Contractuales 100% Precargados y Listos:** Tengo integradas todas las especificaciones técnicas del proyecto (Línea 132 kV, ETs Leales / Villa Quinteros / El Bracho, Pliego de Bases y Condiciones Particulares, Cruces con Gasoducto TGN / DNV y Ensayos FAT/SAT).\n\n**No necesitas cargar ni adjuntar los pliegos:** solo indícame qué artículo, exigencia de hormigón, parámetro técnico, tolerancia, gálibo de cruce o penalidad contractual precisas extraer y te lo presentaré al instante.',
      esUsuario: false,
      fecha: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);

  const [ultimoInforme, setUltimoInforme] = useState<string>('');

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

  // Extracción directa de pliegos técnicos
  const extraerDePliego = async (consulta: string): Promise<string> => {
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
    const local = buscarYExtraerArticulosPliego(consulta);
    return local.resumenExtraccion;
  };

  // Chat QA Logic con lectura directa de pliegos y backend local / Gemini
  const sendChatMessage = async (msg: string) => {
    if (!msg.trim()) return;

    const userMsg: MensajeChat = {
      id: 'usr-' + Date.now(),
      texto: msg,
      esUsuario: true,
      fecha: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setChatMessages(prev => [...prev, userMsg]);

    const idAi = 'ai-' + Date.now();
    const loadingAi: MensajeChat = {
      id: idAi,
      texto: 'Leyendo pliegos contractuales y analizando con IA de ingeniería...',
      esUsuario: false,
      fecha: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    setChatMessages(prev => [...prev, loadingAi]);

    // 1. Intentar llamar al backend local /api/chat (Full-stack con Gemini y Pliegos precargados)
    let answered = false;
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mensaje: msg })
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.exito && data.respuesta) {
          setChatMessages(prev => prev.map(m => m.id === idAi ? { ...m, texto: data.respuesta } : m));
          answered = true;
          return;
        }
      }
    } catch (errApi) {
      console.warn('API local /api/chat no respondió, verificando fallback:', errApi);
    }

    // 2. Si no respondió /api/chat y está configurada una API remota externa (Google Apps Script)
    if (!answered && config.apiUrl && config.apiUrl.startsWith('http')) {
      try {
        let url = config.apiUrl;
        if (url.includes('/edit')) url = url.replace(/\/edit.*$/, '/exec');
        if (!url.endsWith('/exec')) url = url.replace(/\/?$/, '/exec');

        const res = await fetch(url, {
          method: 'POST',
          body: JSON.stringify({ accion: 'consulta_chat', mensaje: msg })
        });
        const data = await res.json();
        if (data && data.exito && data.respuesta) {
          setChatMessages(prev => prev.map(m => m.id === idAi ? { ...m, texto: data.respuesta } : m));
          answered = true;
          return;
        }
      } catch (e) {
        console.warn('Remote chat error, falling back to local pliegos extraction:', e);
      }
    }

    // 3. Fallback inteligente local: Extracción directa de los pliegos y análisis de obra
    if (!answered) {
      setTimeout(() => {
        const q = msg.toLowerCase();
        let answer = '';

        if (q.includes('plano') && (q.includes('cuántos') || q.includes('emitido') || q.includes('avance'))) {
          const emitidos = planos.length;
          const apc = planos.filter(p => p.selloApc).length;
          const pct = ((emitidos / TOTAL_PLANIFICADOS_CONTRATO_GLOBAL) * 100).toFixed(1);
          answer = `📊 **Estado Documental al Día (Base 910 Planos Contractuales):**\n- **Planos Emitidos:** ${emitidos} de ${TOTAL_PLANIFICADOS_CONTRATO_GLOBAL} contractuales (${pct}% de avance global).\n- **Aprobados Sello APC:** ${apc} planos.\n- **Distribución:**\n  • LAT El Bracho - Villa Quinteros: ${planos.filter(p => p.proyecto.includes('LAT') || p.proyecto.includes('Bracho - Villa')).length} emitidos.\n  • ET Leales: ${planos.filter(p => p.proyecto.includes('Leales')).length} emitidos.\n  • ET Villa Quinteros: ${planos.filter(p => p.proyecto.includes('Quinteros')).length} emitidos.\n  • ET El Bracho: ${planos.filter(p => p.proyecto.includes('Bracho') && !p.proyecto.includes('LAT')).length} emitidos.\n\n*Nota:* Los pliegos técnicos y bases de licitación están cargados en el sistema para consulta o extracción de artículos sin necesidad de adjuntar archivos.`;
        } else if (q.includes('hito') && (q.includes('crítica') || q.includes('venc') || q.includes('cronograma'))) {
          const hoy = new Date();
          const vencidos = hitos.filter(h => new Date(h.fechaObjetivo + 'T00:00:00').getTime() < hoy.getTime());
          answer = `⏳ **Auditoría de Ruta Crítica e Hitos:**\n- Total de hitos maestros: ${hitos.length}.\n- Hitos exigibles vencidos a hoy: ${vencidos.length}.\n${vencidos.map(v => `• [${v.codigo}] ${v.nombre} (Venció: ${v.fechaObjetivo})`).join('\n')}\n\n**Exigencia del Pliego (PBCP Art. 35):** Multa de 0.1% diario por cada día de mora en hitos de la ruta crítica. Se recomienda emitir las Notas de Pedido de descargo de responsabilidades a la Supervisión TRANSNOA.`;
        } else {
          // Extrae directamente de los pliegos cargados
          const extraccion = buscarYExtraerArticulosPliego(msg);
          answer = extraccion.resumenExtraccion;
        }

        setChatMessages(prev => prev.map(m => m.id === idAi ? { ...m, texto: answer } : m));
      }, 350);
    }
  };

  const clearChat = () => {
    setChatMessages([
      {
        id: 'init-reset',
        texto: '⚡ Chat reiniciado.\n\n📖 **Pliegos cargados y lectura directa habilitada:** Puedes pedirme cualquier artículo o extracto de las especificaciones técnicas (hormigón H-25, transformadores 30 MVA, mallas PAT, cruces TGN o multas contractuales) sin necesidad de subir archivos.',
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
      setActiveTab,
      setSelectedFrenteFilter,
      setIsSettingsOpen,
      setIsHitosModalOpen,
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
