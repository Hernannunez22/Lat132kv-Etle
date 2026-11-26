import React, { useEffect, useRef, useState } from 'react';
import { AudioMinutaResultado, SubidaProgresoInfo } from '../../context/AppContext';
import { CompromisoMinuta, MinutaReunion } from '../../types';
import { apiFetch, tryReadJsonResponse } from '../../utils/apiClient';
import { AudioConfigStatus, FRENTES_OPCIONES, SubVistaMinutas } from './minutasHelpers';

interface UseAudioMinutaRecorderParams {
  hoyIso: string;
  mostrarAudioMinuta: boolean;
  puedeUsarModelosPagos: boolean;
  transcribirAudioMinuta: (
    archivo: File | Blob,
    meta: {
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
  registrarMinutaTexto: (params: {
    codigo?: string;
    titulo?: string;
    fechaReunion?: string;
    frente?: string;
    participantes?: string;
    contenidoTexto: string;
    extraerAutomaticamente?: boolean;
  }) => Promise<{
    minuta: MinutaReunion;
    compromisosExtraidos: CompromisoMinuta[];
  }>;
  limpiarMensajes: () => void;
  setErrorAccion: React.Dispatch<React.SetStateAction<string | null>>;
  setMensajeOk: React.Dispatch<React.SetStateAction<string | null>>;
  setMostrarAudioMinuta: React.Dispatch<React.SetStateAction<boolean>>;
  setSubVista: React.Dispatch<React.SetStateAction<SubVistaMinutas>>;
}

export function useAudioMinutaRecorder({
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
}: UseAudioMinutaRecorderParams) {
  const audioFileInputRef = useRef<HTMLInputElement>(null);

  const [audioConfig, setAudioConfig] = useState<AudioConfigStatus | null>(null);
  const [audioModeloId, setAudioModeloId] = useState<string>('');
  const [audioMotor, setAudioMotor] = useState<'gratuito' | 'gemini'>('gratuito');
  useEffect(() => {
    if (!puedeUsarModelosPagos && audioMotor !== 'gratuito') {
      setAudioMotor('gratuito');
    }
  }, [puedeUsarModelosPagos, audioMotor]);

  const [audioCodigo, setAudioCodigo] = useState('');
  const [audioFecha, setAudioFecha] = useState(hoyIso);
  const [audioFrente, setAudioFrente] = useState(FRENTES_OPCIONES[0]);
  const [audioTitulo, setAudioTitulo] = useState('');
  const [audioParticipantes, setAudioParticipantes] = useState(
    'UTE · Ingeniería / Proyectista · Inspección'
  );
  const [recEstado, setRecEstado] = useState<'inactivo' | 'grabando' | 'pausado'>('inactivo');
  const [recSegundos, setRecSegundos] = useState(0);
  const [recBytesAprox, setRecBytesAprox] = useState(0);
  const [procesandoAudio, setProcesandoAudio] = useState(false);
  const [progresoAudio, setProgresoAudio] = useState<SubidaProgresoInfo | null>(null);
  const [resultadoAudio, setResultadoAudio] = useState<AudioMinutaResultado | null>(null);
  const [borradorEditado, setBorradorEditado] = useState('');
  const [verTranscripcionLiteral, setVerTranscripcionLiteral] = useState(false);
  const [guardandoBorradorAudio, setGuardandoBorradorAudio] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const wakeLockRef = useRef<any>(null);
  const recTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelRecFlagRef = useRef<boolean>(false);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const res = await apiFetch('/api/minutas/audio/config');
        if (!res.ok || cancel) return;
        const data = await tryReadJsonResponse(res);
        if (data?.exito && !cancel) {
          setAudioConfig({
            groqConfigurado: Boolean(data.groqConfigurado),
            groqVistaSegura: data.groqVistaSegura || null,
            openRouterConfigurado: Boolean(data.openRouterConfigurado),
            geminiConfigurado: Boolean(data.geminiConfigurado),
          });
        }
      } catch {}
    })();
    return () => {
      cancel = true;
    };
  }, [mostrarAudioMinuta]);

  const liberarRecursosGrabacion = () => {
    if (recTimerRef.current) {
      clearInterval(recTimerRef.current);
      recTimerRef.current = null;
    }
    if (wakeLockRef.current) {
      try {
        wakeLockRef.current.release();
      } catch {}
      wakeLockRef.current = null;
    }
    if (mediaStreamRef.current) {
      for (const track of mediaStreamRef.current.getTracks()) {
        track.stop();
      }
      mediaStreamRef.current = null;
    }
    mediaRecorderRef.current = null;
  };

  useEffect(() => {
    return () => {
      cancelRecFlagRef.current = true;
      liberarRecursosGrabacion();
    };
  }, []);

  useEffect(() => {
    if (recEstado === 'inactivo') return;
    const onBeforeUnload = (ev: BeforeUnloadEvent) => {
      ev.preventDefault();
      ev.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [recEstado]);

  const procesarBlobAudioHaciaMinuta = async (blob: Blob, nombreArchivo: string) => {
    limpiarMensajes();
    setProcesandoAudio(true);
    setResultadoAudio(null);
    setBorradorEditado('');
    setVerTranscripcionLiteral(false);
    setProgresoAudio({
      fase: 'subiendo',
      porcentaje: 2,
      detalle: `Preparando "${nombreArchivo}" (${(blob.size / (1024 * 1024)).toFixed(1)} MB)...`,
    });

    try {
      const res = await transcribirAudioMinuta(
        blob,
        {
          nombreArchivo,
          modeloMinutaId: audioModeloId,
          codigo: audioCodigo.trim() || undefined,
          titulo: audioTitulo.trim() || undefined,
          fechaReunion: audioFecha || hoyIso,
          frente: audioFrente || undefined,
          participantes: audioParticipantes.trim() || undefined,
          motor: audioMotor,
        },
        info => setProgresoAudio(info)
      );
      setResultadoAudio(res);
      setBorradorEditado(res.borradorMarkdown);
      setMensajeOk(
        `Audio transcrito en ${res.segmentosProcesados} tramo(s) y borrador de minuta redactado. Revisa y guarda los compromisos.`
      );
    } catch (err: any) {
      setErrorAccion(err?.message || 'Error transcribiendo el audio de reunión.');
    } finally {
      setProcesandoAudio(false);
      setProgresoAudio(null);
    }
  };

  const handleIniciarGrabacionReunion = async () => {
    limpiarMensajes();
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setErrorAccion('Tu navegador no admite grabación de micrófono directa. Usa "Subir Audio".');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const mimeCandidates = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/ogg;codecs=opus',
      ];
      const selectedMime =
        typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.isTypeSupported === 'function'
          ? mimeCandidates.find(m => MediaRecorder.isTypeSupported(m))
          : undefined;

      const recorder = new MediaRecorder(stream, {
        ...(selectedMime ? { mimeType: selectedMime } : {}),
        audioBitsPerSecond: 32000,
      });

      audioChunksRef.current = [];
      cancelRecFlagRef.current = false;
      setRecSegundos(0);
      setRecBytesAprox(0);

      recorder.ondataavailable = ev => {
        if (ev.data && ev.data.size > 0) {
          audioChunksRef.current.push(ev.data);
          setRecBytesAprox(prev => prev + ev.data.size);
        }
      };

      recorder.onstop = () => {
        const mimeFinal = recorder.mimeType || selectedMime || 'audio/webm';
        const chunks = [...audioChunksRef.current];
        const fueCancelado = cancelRecFlagRef.current;
        liberarRecursosGrabacion();
        setRecEstado('inactivo');

        if (fueCancelado || chunks.length === 0) {
          return;
        }
        const ext = mimeFinal.includes('mp4') ? 'm4a' : mimeFinal.includes('ogg') ? 'ogg' : 'webm';
        const blobFinal = new Blob(chunks, { type: mimeFinal });
        void procesarBlobAudioHaciaMinuta(
          blobFinal,
          `reunion_${audioFecha || hoyIso}_${Date.now()}.${ext}`
        );
      };

      mediaRecorderRef.current = recorder;
      recorder.start(2000);
      setRecEstado('grabando');

      recTimerRef.current = setInterval(() => {
        setRecSegundos(prev => prev + 1);
      }, 1000);

      if (typeof navigator !== 'undefined' && 'wakeLock' in navigator) {
        try {
          wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
        } catch {}
      }
    } catch (err: any) {
      liberarRecursosGrabacion();
      setRecEstado('inactivo');
      setErrorAccion(
        err?.message || 'No se pudo acceder al micrófono. Verifica los permisos del navegador.'
      );
    }
  };

  const handlePausarReanudarGrabacion = () => {
    const rec = mediaRecorderRef.current;
    if (!rec) return;
    if (recEstado === 'grabando' && rec.state === 'recording') {
      rec.pause();
      if (recTimerRef.current) {
        clearInterval(recTimerRef.current);
        recTimerRef.current = null;
      }
      setRecEstado('pausado');
    } else if (recEstado === 'pausado' && rec.state === 'paused') {
      rec.resume();
      recTimerRef.current = setInterval(() => {
        setRecSegundos(prev => prev + 1);
      }, 1000);
      setRecEstado('grabando');
    }
  };

  const handleFinalizarGrabacion = () => {
    const rec = mediaRecorderRef.current;
    if (!rec) return;
    cancelRecFlagRef.current = false;
    if (rec.state !== 'inactive') {
      rec.stop();
    }
  };

  const handleDescartarGrabacion = () => {
    const rec = mediaRecorderRef.current;
    cancelRecFlagRef.current = true;
    audioChunksRef.current = [];
    setRecSegundos(0);
    setRecBytesAprox(0);
    if (rec && rec.state !== 'inactive') {
      rec.stop();
    } else {
      liberarRecursosGrabacion();
      setRecEstado('inactivo');
    }
  };

  const handleSubirArchivoAudio = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    await procesarBlobAudioHaciaMinuta(file, file.name);
  };

  const handleGuardarBorradorAudioComoMinuta = async () => {
    if (!borradorEditado.trim()) {
      setErrorAccion('El borrador de la minuta está vacío.');
      return;
    }
    limpiarMensajes();
    setGuardandoBorradorAudio(true);
    try {
      const res = await registrarMinutaTexto({
        codigo: audioCodigo.trim() || undefined,
        titulo: audioTitulo.trim() || undefined,
        fechaReunion: audioFecha || hoyIso,
        frente: audioFrente,
        participantes: audioParticipantes.trim() || undefined,
        contenidoTexto: borradorEditado.trim(),
        extraerAutomaticamente: true,
      });
      setMensajeOk(
        `Minuta ${res.minuta.codigo} guardada desde audio con ${res.compromisosExtraidos.length} compromiso(s) extraído(s).`
      );
      setResultadoAudio(null);
      setBorradorEditado('');
      setAudioCodigo('');
      setAudioTitulo('');
      setMostrarAudioMinuta(false);
      setSubVista('compromisos');
    } catch (err: any) {
      setErrorAccion(err?.message || 'Error guardando la minuta generada.');
    } finally {
      setGuardandoBorradorAudio(false);
    }
  };

  return {
    audioFileInputRef,
    audioConfig,
    audioModeloId,
    setAudioModeloId,
    audioMotor,
    setAudioMotor,
    audioCodigo,
    setAudioCodigo,
    audioFecha,
    setAudioFecha,
    audioFrente,
    setAudioFrente,
    audioTitulo,
    setAudioTitulo,
    audioParticipantes,
    setAudioParticipantes,
    recEstado,
    recSegundos,
    recBytesAprox,
    procesandoAudio,
    progresoAudio,
    resultadoAudio,
    setResultadoAudio,
    borradorEditado,
    setBorradorEditado,
    verTranscripcionLiteral,
    setVerTranscripcionLiteral,
    guardandoBorradorAudio,
    handleIniciarGrabacionReunion,
    handlePausarReanudarGrabacion,
    handleFinalizarGrabacion,
    handleDescartarGrabacion,
    handleSubirArchivoAudio,
    handleGuardarBorradorAudioComoMinuta,
  };
}
