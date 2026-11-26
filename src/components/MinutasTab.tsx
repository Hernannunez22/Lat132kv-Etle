import React, { useMemo, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { EstadoCompromiso, MinutaReunion, NotaPedidoIngenieria } from '../types';
import {
  DEFAULT_DRIVE_ROOT_FOLDER_ID,
  extraerDriveFolderId,
  getGoogleDriveAccessToken,
} from '../utils/googleAuth';
import {
  esIncumplidoOVencido,
  FiltroEstado,
  FRENTES_OPCIONES,
  SubVistaMinutas,
  UltimoScanDriveInfo,
} from './minutas/minutasHelpers';
import { useAudioMinutaRecorder } from './minutas/useAudioMinutaRecorder';
import { MinutasHeaderToolbar } from './minutas/MinutasHeaderToolbar';
import { AudioMinutaStudio } from './minutas/AudioMinutaStudio';
import { MinutaUploadForm } from './minutas/MinutaUploadForm';
import { CompromisoCreateForm } from './minutas/CompromisoCreateForm';
import { MinutasFilterBar } from './minutas/MinutasFilterBar';
import { CompromisosList } from './minutas/CompromisosList';
import { MinutasArchiveList } from './minutas/MinutasArchiveList';
import { NotasPedidoView } from './minutas/NotasPedidoView';

export const MinutasTab: React.FC = () => {
  const {
    minutas,
    compromisosMinutas,
    notasPedido,
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
    setActiveTab,
    sendChatMessage,
    hasDriveToken,
    driveConnectionState,
    conectarGoogleDriveChat,
    desconectarGoogleDrive,
    puedeUsarModelosPagos,
  } = useApp();

  const hoyIso = new Date().toISOString().split('T')[0];

  const [subVista, setSubVista] = useState<SubVistaMinutas>('compromisos');
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>('TODOS');
  const [filtroFrente, setFiltroFrente] = useState<string>('TODOS');
  const [seleccionados, setSeleccionados] = useState<string[]>([]);

  // Google Drive sync
  const [driveFolderInput, setDriveFolderInput] = useState<string>(DEFAULT_DRIVE_ROOT_FOLDER_ID);
  const [buscarTodoDrive, setBuscarTodoDrive] = useState<boolean>(true);
  const [sincronizandoDrive, setSincronizandoDrive] = useState<boolean>(false);
  const [ultimoScanDrive, setUltimoScanDrive] = useState<UltimoScanDriveInfo | null>(null);

  // Paneles de alta
  const [mostrarAltaMinuta, setMostrarAltaMinuta] = useState(false);
  const [mostrarAudioMinuta, setMostrarAudioMinuta] = useState(false);
  const [mostrarAltaCompromiso, setMostrarAltaCompromiso] = useState(false);
  const [subiendoArchivo, setSubiendoArchivo] = useState(false);
  const [guardandoMinuta, setGuardandoMinuta] = useState(false);
  const [errorAccion, setErrorAccion] = useState<string | null>(null);
  const [mensajeOk, setMensajeOk] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form nueva minuta
  const [minCodigo, setMinCodigo] = useState('');
  const [minTitulo, setMinTitulo] = useState('');
  const [minFecha, setMinFecha] = useState(hoyIso);
  const [minFrente, setMinFrente] = useState(FRENTES_OPCIONES[0]);
  const [minParticipantes, setMinParticipantes] = useState('UTE · Ingeniería / Proyectista · Inspección');
  const [minTexto, setMinTexto] = useState('');

  // Form nuevo compromiso puntual
  const [compMinutaId, setCompMinutaId] = useState('');
  const [compDesc, setCompDesc] = useState('');
  const [compResp, setCompResp] = useState('Ingeniería / Proyectista');
  const [compArea, setCompArea] = useState('Ingeniería');
  const [compFrente, setCompFrente] = useState(FRENTES_OPCIONES[0]);
  const [compFechaLim, setCompFechaLim] = useState(hoyIso);
  const [compDocs, setCompDocs] = useState('');
  const [compEstadoInit, setCompEstadoInit] = useState<EstadoCompromiso>('INCUMPLIDO');

  // Form Nota de Pedido
  const [npNumero, setNpNumero] = useState('');
  const [npFecha, setNpFecha] = useState(hoyIso);
  const [npEmisor, setNpEmisor] = useState('Dirección Técnica & Control de Proyecto (UTE)');
  const [npDestinatario, setNpDestinatario] = useState('Jefatura de Ingeniería / Proyectista');
  const [npFrente, setNpFrente] = useState(FRENTES_OPCIONES[0]);
  const [npAsunto, setNpAsunto] = useState('');
  const [npPlazo, setNpPlazo] = useState(5);
  const [npEncuadre, setNpEncuadre] = useState('');
  const [generandoNp, setGenerandoNp] = useState(false);

  // Vista detalle
  const [minutaExpandidaId, setMinutaExpandidaId] = useState<string | null>(null);
  const [notaActivaId, setNotaActivaId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const limpiarMensajes = () => {
    setErrorAccion(null);
    setMensajeOk(null);
  };

  // Estudio de Audio Largo -> Minuta (Groq Whisper + Modelo de referencia)
  const audioStudio = useAudioMinutaRecorder({
    hoyIso,
    mostrarAudioMinuta,
    puedeUsarModelosPagos,
    transcribirAudioMinuta,
    registrarMinutaTexto,
    limpiarMensajes,
    setErrorAccion,
    setMensajeOk,
    setMostrarAudioMinuta,
    setSubVista,
  });

  const resumenConteos = useMemo(() => {
    const total = compromisosMinutas.length;
    const incumplidos = compromisosMinutas.filter(c => esIncumplidoOVencido(c, hoyIso)).length;
    const cumplidos = compromisosMinutas.filter(c => c.estado === 'CUMPLIDO').length;
    const pendientes = total - incumplidos - cumplidos;
    return { total, incumplidos, cumplidos, pendientes };
  }, [compromisosMinutas, hoyIso]);

  const compromisosFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return compromisosMinutas.filter(c => {
      const esInc = esIncumplidoOVencido(c, hoyIso);
      if (filtroEstado === 'INCUMPLIDO' && !esInc) return false;
      if (filtroEstado === 'CUMPLIDO' && c.estado !== 'CUMPLIDO') return false;
      if (filtroEstado === 'PENDIENTE' && (c.estado === 'CUMPLIDO' || esInc)) return false;
      if (filtroFrente !== 'TODOS' && c.frente !== filtroFrente) return false;
      if (!q) return true;
      return (
        c.descripcion.toLowerCase().includes(q) ||
        c.responsable.toLowerCase().includes(q) ||
        c.minutaCodigo.toLowerCase().includes(q) ||
        c.frente.toLowerCase().includes(q) ||
        (c.documentosRelacionados || []).some(d => d.toLowerCase().includes(q))
      );
    });
  }, [compromisosMinutas, busqueda, filtroEstado, filtroFrente, hoyIso]);

  const minutasFiltradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return minutas.filter(m => {
      if (filtroFrente !== 'TODOS' && m.frente !== filtroFrente) return false;
      if (!q) return true;
      return (
        m.codigo.toLowerCase().includes(q) ||
        m.titulo.toLowerCase().includes(q) ||
        m.contenidoTexto.toLowerCase().includes(q) ||
        m.participantes.toLowerCase().includes(q)
      );
    });
  }, [minutas, busqueda, filtroFrente]);

  const notaVisualizada: NotaPedidoIngenieria | null = useMemo(() => {
    if (notaActivaId) {
      return notasPedido.find(n => n.id === notaActivaId) || notasPedido[0] || null;
    }
    return notasPedido[0] || null;
  }, [notasPedido, notaActivaId]);

  const ejecutarLecturaDrive = async (tokenOverride?: string, forceConsent = false) => {
    limpiarMensajes();
    setSincronizandoDrive(true);
    try {
      let token = tokenOverride || (forceConsent ? null : getGoogleDriveAccessToken());
      if (!token) {
        await conectarGoogleDriveChat({ forceConsent });
        token = getGoogleDriveAccessToken();
        if (!token) {
          throw new Error(
            'No se recibió el permiso de lectura de Google Drive. Vuelve a iniciar sesión y acepta el acceso a Google Drive.'
          );
        }
      }

      const folderId = extraerDriveFolderId(driveFolderInput);
      const res = await sincronizarMinutasDrive({
        accessToken: token,
        folderId,
        buscarEnTodoDrive: buscarTodoDrive,
      });

      setUltimoScanDrive({
        carpetaRaizNombre: res.carpetaRaizNombre,
        carpetasEscaneadas: res.carpetasEscaneadas,
        archivosDetectados: res.archivosDetectados,
        minutasNuevas: res.minutasNuevas.length,
        compromisosNuevos: res.compromisosNuevos.length,
        erroresArchivos: res.erroresArchivos,
      });

      if (res.minutasNuevas.length > 0) {
        setMensajeOk(
          `Drive sincronizado ("${res.carpetaRaizNombre}"): ${res.minutasNuevas.length} minuta(s) leída(s) y ${res.compromisosNuevos.length} compromiso(s) extraído(s).`
        );
      } else if (res.archivosDetectados > 0) {
        setMensajeOk(
          `Drive verificado (${res.archivosDetectados} archivo(s) de minutas detectado(s), sin novedades pendientes).`
        );
      } else {
        setErrorAccion(
          `Se escanearon ${res.carpetasEscaneadas} carpeta(s) en "${res.carpetaRaizNombre}" sin encontrar archivos con nombre o carpeta de minuta. Pega el link o ID de la carpeta específica de minutas si están en otro directorio.`
        );
      }
    } catch (err: any) {
      setErrorAccion(err?.message || 'No se pudieron leer las minutas desde Google Drive.');
    } finally {
      setSincronizandoDrive(false);
    }
  };

  const handleDesconectarDrive = async () => {
    await desconectarGoogleDrive();
  };

  const handleArchivoMinuta = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    limpiarMensajes();
    setSubiendoArchivo(true);
    try {
      const res = await subirMinutaArchivo(file, {
        codigo: minCodigo.trim() || undefined,
        titulo: minTitulo.trim() || undefined,
        fechaReunion: minFecha || undefined,
        frente: minFrente || undefined,
        participantes: minParticipantes.trim() || undefined,
      });
      setMensajeOk(
        `Minuta ${res.minuta.codigo} cargada con ${res.compromisosExtraidos.length} compromiso(s) extraído(s).`
      );
      setMostrarAltaMinuta(false);
      setMinCodigo('');
      setMinTitulo('');
      setMinTexto('');
    } catch (err: any) {
      setErrorAccion(err?.message || 'Error cargando el archivo de minuta.');
    } finally {
      setSubiendoArchivo(false);
    }
  };

  const handleGuardarMinutaTexto = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!minTexto.trim()) {
      setErrorAccion('Pega el contenido de la minuta para poder extraer los compromisos.');
      return;
    }
    limpiarMensajes();
    setGuardandoMinuta(true);
    try {
      const res = await registrarMinutaTexto({
        codigo: minCodigo.trim() || undefined,
        titulo: minTitulo.trim() || undefined,
        fechaReunion: minFecha,
        frente: minFrente,
        participantes: minParticipantes.trim(),
        contenidoTexto: minTexto.trim(),
        extraerAutomaticamente: true,
      });
      setMensajeOk(
        `Minuta ${res.minuta.codigo} registrada con ${res.compromisosExtraidos.length} compromiso(s).`
      );
      setMostrarAltaMinuta(false);
      setMinCodigo('');
      setMinTitulo('');
      setMinTexto('');
    } catch (err: any) {
      setErrorAccion(err?.message || 'Error registrando la minuta.');
    } finally {
      setGuardandoMinuta(false);
    }
  };

  const handleCrearCompromiso = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!compDesc.trim()) {
      setErrorAccion('Ingresa la descripción del compromiso.');
      return;
    }
    limpiarMensajes();
    try {
      await agregarCompromisoMinuta({
        minutaId: compMinutaId || undefined,
        descripcion: compDesc.trim(),
        responsable: compResp.trim(),
        area: compArea.trim(),
        frente: compFrente,
        fechaLimite: compFechaLim,
        estado: compEstadoInit,
        documentosRelacionados: compDocs
          .split(',')
          .map(s => s.trim())
          .filter(Boolean),
      });
      setCompDesc('');
      setCompDocs('');
      setMostrarAltaCompromiso(false);
      setMensajeOk('Compromiso registrado en seguimiento.');
    } catch (err: any) {
      setErrorAccion(err?.message || 'No se pudo agregar el compromiso.');
    }
  };

  const toggleSeleccion = (id: string) => {
    setSeleccionados(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const seleccionarTodosIncumplidos = () => {
    const ids = compromisosMinutas
      .filter(c => esIncumplidoOVencido(c, hoyIso))
      .map(c => c.id);
    setSeleccionados(ids);
  };

  const prepararNotaPedidoDesde = (ids: string[]) => {
    if (ids.length === 0) {
      setErrorAccion('Selecciona al menos un compromiso para generar la Nota de Pedido.');
      return;
    }
    const items = compromisosMinutas.filter(c => ids.includes(c.id));
    const consecutivo = String(notasPedido.length + 1).padStart(3, '0');
    const codMinutas = Array.from(new Set(items.map(i => i.minutaCodigo))).join(', ');
    setSeleccionados(ids);
    setNpNumero(`NP-ING-${consecutivo}`);
    setNpFecha(hoyIso);
    setNpFrente(items[0]?.frente || FRENTES_OPCIONES[0]);
    setNpAsunto(
      `Intimación por incumplimiento de compromisos de ingeniería (${codMinutas})`
    );
    setSubVista('notas_pedido');
    limpiarMensajes();
  };

  const handleGenerarNotaPedido = async (e: React.FormEvent) => {
    e.preventDefault();
    if (seleccionados.length === 0) {
      setErrorAccion('Debes seleccionar al menos un compromiso incumplido.');
      return;
    }
    limpiarMensajes();
    setGenerandoNp(true);
    try {
      const nueva = await generarNotaPedido({
        compromisoIds: seleccionados,
        numeroNota: npNumero.trim() || undefined,
        fechaEmision: npFecha,
        emisor: npEmisor.trim(),
        destinatario: npDestinatario.trim(),
        frente: npFrente,
        asunto: npAsunto.trim(),
        plazoDescargoDias: Number(npPlazo) || 5,
        encuadreAdicional: npEncuadre.trim(),
      });
      setNotaActivaId(nueva.id);
      setSeleccionados([]);
      setNpEncuadre('');
      setMensajeOk(`Nota de Pedido ${nueva.numeroNota} generada e incorporada al historial.`);
    } catch (err: any) {
      setErrorAccion(err?.message || 'No se pudo generar la Nota de Pedido.');
    } finally {
      setGenerandoNp(false);
    }
  };

  const handleCopiar = (id: string, texto: string) => {
    navigator.clipboard.writeText(texto);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleAuditarMinutaEnChat = (m: MinutaReunion) => {
    const compAsociados = compromisosMinutas.filter(c => c.minutaId === m.id);
    const incumplidos = compAsociados.filter(c => esIncumplidoOVencido(c, hoyIso));
    setActiveTab('chat');
    sendChatMessage(
      `Analiza la minuta ${m.codigo} ("${m.titulo}", fecha ${m.fechaReunion}). Tiene ${compAsociados.length} compromisos registrados (${incumplidos.length} incumplidos o vencidos). Resume los desvíos críticos y genera un cuadro comparativo de cumplimiento frente al cronograma y pliego.`
    );
  };

  return (
    <div className="space-y-4">
      <MinutasHeaderToolbar
        hasDriveToken={hasDriveToken}
        driveConnectionState={driveConnectionState}
        sincronizandoDrive={sincronizandoDrive}
        driveFolderInput={driveFolderInput}
        setDriveFolderInput={setDriveFolderInput}
        buscarTodoDrive={buscarTodoDrive}
        setBuscarTodoDrive={setBuscarTodoDrive}
        ultimoScanDrive={ultimoScanDrive}
        ejecutarLecturaDrive={ejecutarLecturaDrive}
        handleDesconectarDrive={handleDesconectarDrive}
        mostrarAudioMinuta={mostrarAudioMinuta}
        recEstado={audioStudio.recEstado}
        recSegundos={audioStudio.recSegundos}
        onToggleAltaCompromiso={() => {
          setMostrarAltaCompromiso(prev => !prev);
          setMostrarAltaMinuta(false);
          limpiarMensajes();
        }}
        onToggleAudioMinuta={() => {
          setMostrarAudioMinuta(prev => !prev);
          setMostrarAltaMinuta(false);
          setMostrarAltaCompromiso(false);
          limpiarMensajes();
        }}
        onToggleAltaMinuta={() => {
          setMostrarAltaMinuta(prev => !prev);
          setMostrarAudioMinuta(false);
          setMostrarAltaCompromiso(false);
          limpiarMensajes();
        }}
        minutasCount={minutas.length}
        resumenConteos={resumenConteos}
        notasPedidoCount={notasPedido.length}
        seleccionadosCount={seleccionados.length}
        onEmitirNotaPedidoHeader={() => {
          const ids =
            seleccionados.length > 0
              ? seleccionados
              : compromisosMinutas.filter(c => esIncumplidoOVencido(c, hoyIso)).map(c => c.id);
          prepararNotaPedidoDesde(ids);
        }}
        subVista={subVista}
        setSubVista={setSubVista}
        errorAccion={errorAccion}
        mensajeOk={mensajeOk}
      />

      {mostrarAudioMinuta && (
        <AudioMinutaStudio
          minutas={minutas}
          puedeUsarModelosPagos={puedeUsarModelosPagos}
          {...audioStudio}
        />
      )}

      {mostrarAltaMinuta && (
        <MinutaUploadForm
          fileInputRef={fileInputRef}
          subiendoArchivo={subiendoArchivo}
          guardandoMinuta={guardandoMinuta}
          minCodigo={minCodigo}
          setMinCodigo={setMinCodigo}
          minFecha={minFecha}
          setMinFecha={setMinFecha}
          minFrente={minFrente}
          setMinFrente={setMinFrente}
          minTitulo={minTitulo}
          setMinTitulo={setMinTitulo}
          minParticipantes={minParticipantes}
          setMinParticipantes={setMinParticipantes}
          minTexto={minTexto}
          setMinTexto={setMinTexto}
          handleArchivoMinuta={handleArchivoMinuta}
          handleGuardarMinutaTexto={handleGuardarMinutaTexto}
          onCancel={() => setMostrarAltaMinuta(false)}
        />
      )}

      {mostrarAltaCompromiso && (
        <CompromisoCreateForm
          minutas={minutas}
          compMinutaId={compMinutaId}
          setCompMinutaId={setCompMinutaId}
          compResp={compResp}
          setCompResp={setCompResp}
          compFrente={compFrente}
          setCompFrente={setCompFrente}
          compFechaLim={compFechaLim}
          setCompFechaLim={setCompFechaLim}
          compDesc={compDesc}
          setCompDesc={setCompDesc}
          compEstadoInit={compEstadoInit}
          setCompEstadoInit={setCompEstadoInit}
          compArea={compArea}
          setCompArea={setCompArea}
          compDocs={compDocs}
          setCompDocs={setCompDocs}
          onSubmit={handleCrearCompromiso}
          onCancel={() => setMostrarAltaCompromiso(false)}
        />
      )}

      {subVista !== 'notas_pedido' && (
        <MinutasFilterBar
          subVista={subVista}
          busqueda={busqueda}
          setBusqueda={setBusqueda}
          filtroFrente={filtroFrente}
          setFiltroFrente={setFiltroFrente}
          filtroEstado={filtroEstado}
          setFiltroEstado={setFiltroEstado}
        />
      )}

      {subVista === 'compromisos' && (
        <CompromisosList
          hoyIso={hoyIso}
          totalCompromisosCount={compromisosMinutas.length}
          incumplidosCount={resumenConteos.incumplidos}
          compromisosFiltrados={compromisosFiltrados}
          seleccionados={seleccionados}
          sincronizandoDrive={sincronizandoDrive}
          onSeleccionarTodosIncumplidos={seleccionarTodosIncumplidos}
          onLimpiarSeleccion={() => setSeleccionados([])}
          onPrepararNotaPedidoDesde={prepararNotaPedidoDesde}
          onToggleSeleccion={toggleSeleccion}
          onActualizarCompromiso={actualizarCompromisoMinuta}
          onEliminarCompromiso={eliminarCompromisoMinuta}
          onEjecutarLecturaDrive={ejecutarLecturaDrive}
          onAbrirAltaCompromiso={() => setMostrarAltaCompromiso(true)}
        />
      )}

      {subVista === 'minutas' && (
        <MinutasArchiveList
          hoyIso={hoyIso}
          minutasFiltradas={minutasFiltradas}
          compromisosMinutas={compromisosMinutas}
          minutaExpandidaId={minutaExpandidaId}
          setMinutaExpandidaId={setMinutaExpandidaId}
          copiedId={copiedId}
          onAbrirAltaMinuta={() => setMostrarAltaMinuta(true)}
          onAuditarMinutaEnChat={handleAuditarMinutaEnChat}
          onPrepararNotaPedidoDesde={prepararNotaPedidoDesde}
          onEliminarMinuta={eliminarMinuta}
          onCopiar={handleCopiar}
        />
      )}

      {subVista === 'notas_pedido' && (
        <NotasPedidoView
          compromisosMinutas={compromisosMinutas}
          notasPedido={notasPedido}
          notaVisualizada={notaVisualizada}
          setNotaActivaId={setNotaActivaId}
          seleccionados={seleccionados}
          incumplidosCount={resumenConteos.incumplidos}
          copiedId={copiedId}
          npNumero={npNumero}
          setNpNumero={setNpNumero}
          npFecha={npFecha}
          setNpFecha={setNpFecha}
          npEmisor={npEmisor}
          setNpEmisor={setNpEmisor}
          npDestinatario={npDestinatario}
          setNpDestinatario={setNpDestinatario}
          npFrente={npFrente}
          setNpFrente={setNpFrente}
          npPlazo={npPlazo}
          setNpPlazo={setNpPlazo}
          npAsunto={npAsunto}
          setNpAsunto={setNpAsunto}
          npEncuadre={npEncuadre}
          setNpEncuadre={setNpEncuadre}
          generandoNp={generandoNp}
          onSeleccionarTodosIncumplidos={seleccionarTodosIncumplidos}
          onToggleSeleccion={toggleSeleccion}
          onGenerarNotaPedido={handleGenerarNotaPedido}
          onEliminarNotaPedido={eliminarNotaPedido}
          onCopiar={handleCopiar}
        />
      )}
    </div>
  );
};
