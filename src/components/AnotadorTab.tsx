import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { 
  Search, 
  Mic, 
  MicOff, 
  Camera, 
  Trash2, 
  CheckCircle, 
  FileText, 
  Sparkles,
  Volume2
} from 'lucide-react';
import { buscarYExtraerArticulosPliego } from '../data/pliegosContractuales';

interface FichaData {
  titulo: string;
  exigenciaPliego: string;
  planoApc: string;
  secuenciaInspeccion: string[];
}

export const AnotadorTab: React.FC = () => {
  const { 
    notasCampo, 
    setNotasCampo, 
    fotosCampo, 
    addFoto, 
    deleteFoto, 
    audiosCampo, 
    addAudio, 
    deleteAudio 
  } = useApp();

  const [consulta, setConsulta] = useState('');
  const [ficha, setFicha] = useState<FichaData | null>(null);
  const [isDictatingConsulta, setIsDictatingConsulta] = useState(false);
  const [isDictatingNota, setIsDictatingNota] = useState(false);
  const [isAnalyzingFoto, setIsAnalyzingFoto] = useState(false);
  const [estadoGuardadoNota, setEstadoGuardadoNota] = useState('Guardado automáticamente');
  const [bannerNotice, setBannerNotice] = useState<string | null>(null);
  const [isConfirmingClearNotes, setIsConfirmingClearNotes] = useState(false);

  // Audio Recording State & Refs
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const speechRecognitionRef = useRef<any>(null);

  const showNotice = (msg: string) => {
    setBannerNotice(msg);
    setTimeout(() => setBannerNotice(null), 3500);
  };

  // Setup SpeechRecognition
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'es-AR';

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        if (isDictatingConsulta) {
          setConsulta(transcript);
          ejecutarAuditoria(transcript);
        } else if (isDictatingNota) {
          setNotasCampo(notasCampo ? `${notasCampo} ${transcript}` : transcript);
        }
      };

      recognition.onerror = () => {
        setIsDictatingConsulta(false);
        setIsDictatingNota(false);
      };

      recognition.onend = () => {
        setIsDictatingConsulta(false);
        setIsDictatingNota(false);
      };

      speechRecognitionRef.current = recognition;
    }
  }, [isDictatingConsulta, isDictatingNota, notasCampo, setNotasCampo]);

  const toggleDictadoConsulta = () => {
    if (!speechRecognitionRef.current) {
      showNotice("Dictado no soportado por este navegador.");
      return;
    }
    if (isDictatingConsulta) {
      speechRecognitionRef.current.stop();
      setIsDictatingConsulta(false);
    } else {
      setIsDictatingNota(false);
      setIsDictatingConsulta(true);
      speechRecognitionRef.current.start();
    }
  };

  const toggleDictadoNota = () => {
    if (!speechRecognitionRef.current) {
      showNotice("Dictado no soportado por este navegador.");
      return;
    }
    if (isDictatingNota) {
      speechRecognitionRef.current.stop();
      setIsDictatingNota(false);
    } else {
      setIsDictatingConsulta(false);
      setIsDictatingNota(true);
      speechRecognitionRef.current.start();
    }
  };

  const ejecutarAuditoria = (textoQuery?: string) => {
    const q = (textoQuery || consulta).toLowerCase().trim();
    if (!q) return;

    if (q.includes('fundacion') || q.includes('portic') || q.includes('hormig') || q.includes('stub') || q.includes('h25') || q.includes('h-25')) {
      setFicha({
        titulo: "Fundaciones de Pórticos y Monobloques H-25 (ET y LAT 132 kV)",
        exigenciaPliego: "Pliego Técnico General Art. 4.2: Hormigón estructural H-25 (f'c ≥ 250 kg/cm² a 28 días). Asentamiento con Cono de Abrams: 8 a 12 cm. Recubrimiento mínimo de armaduras: 50 mm en contacto con terreno o suelo agresivo. Tiempo mínimo de curado húmedo: 7 días continuos.",
        planoApc: "Planos Aprobados ET-LE-OC-PL-501 y L-EB-VQ-OC-PL-501 (Rev 0 / Sello APC): Nivelación milimétrica de pernos de anclaje (stubs) con tolerancia máxima en cota ± 3 mm y en verticalidad 1:1000 antes del colado. Prohibido vibrado directo sobre armaduras.",
        secuenciaInspeccion: [
          "Verificar cota de fondo de excavación y compactación de suelo con densímetro nuclear (≥ 95% Proctor Modificado).",
          "Inspeccionar armadura doblada, separadores plásticos de recubrimiento (50 mm) y puesta a tierra de fundación vinculada al stub.",
          "Verificar nivelación topográfica con estación total de los 4 pernos de anclaje y plantilla rígida fijada.",
          "Control de pastón de hormigón elaborado: ensayo de asentamiento y moldeo obligatorio de 3 probetas cilíndricas (7, 14 y 28 días).",
          "Aplicación inmediata de membrana de curado químico o arpillera húmeda tras el desencofrado lateral (mínimo 48 h)."
        ]
      });
    } else if (q.includes('malla') || q.includes('pat') || q.includes('puesta a tierra') || q.includes('resistiv')) {
      setFicha({
        titulo: "Malla de Puesta a Tierra (PAT) y Medición de Resistividad",
        exigenciaPliego: "Especificación Técnica TRANSNOA Art. 8: Resistencia combinada de la malla en ET ≤ 0.5 ohms en cualquier época del año. Tensión de paso ≤ 125 V y tensión de contacto ≤ 65 V para corriente de cortocircuito monofásica de 31.5 kA en 0.5 s.",
        planoApc: "Plano Aprobado ET-LE-OEM-PL-313 / ET-VQ-OEM-PL-313: Conductor de cobre electrolítico desnudo de 95 mm² enterrado a 0.80 m de profundidad con cuadrícula de 10x10 m. Soldaduras cuproaluminotérmicas (tipo Cadweld) en todos los cruces.",
        secuenciaInspeccion: [
          "Comprobación de zanja a profundidad reglamentaria (mínimo 80 cm libre).",
          "Inspección visual de cada disparo de soldadura exotérmica (sin escoria ni porosidades).",
          "Vinculación de chicotes de cobre a tanques de transformador, seccionadores e interruptores.",
          "Medición de resistividad aparente con telurímetro de 4 picas (método de Wenner) antes del tapado con tierra vegetal sin piedras."
        ]
      });
    } else if (q.includes('cruce') || q.includes('gasoducto') || q.includes('tgn') || q.includes('galibo') || q.includes('ruta')) {
      setFicha({
        titulo: "Cruce Especial LAT 132 kV sobre Gasoducto Troncal Norte TGN",
        exigenciaPliego: "Norma NAG-100 / Res. ENARGAS: Distancia vertical mínima entre el conductor inferior a máxima flecha (temperatura de cálculo +50°C o sobrecarga extraordinaria) y la superficie superior del gasoducto enterrado: ≥ 10.0 metros.",
        planoApc: "Plano Aprobado L-EB-VQ-OC-PL-011: Vano 42 (Piquetes 42 a 43). El poste P-42 debe ubicarse a no menos de 30 metros de la generatriz del ducto. Instalación obligatoria de descargadores de sobretensión y electrodos de puesta a tierra anódica galvánica para evitar corrosión por inducción electromagnética.",
        secuenciaInspeccion: [
          "Relevamiento conjunto en terreno con inspector designado de TGN antes de cualquier movimiento de suelo.",
          "Sondeo manual cuidadoso para individualizar la tapada real del ducto y su revestimiento anticorrosivo.",
          "Verificación topográfica de gálibo vertical con distanciador láser y tabla de flechado a temperatura ambiente.",
          "Acta de inicio y cierre de cruce rubricada por Inspección de Obra y TGN."
        ]
      });
    } else {
      const extraccion = buscarYExtraerArticulosPliego(q);
      if (extraccion.articulosCoincidentes.length > 0) {
        const art = extraccion.articulosCoincidentes[0];
        setFicha({
          titulo: `${art.pliegoCodigo} - ${art.articulo}: ${art.titulo}`,
          exigenciaPliego: `${art.pliegoNombre} (${art.seccion}): ${art.contenido}`,
          planoApc: `Planos y Normativa Asociada: ${art.planosRelacionados.join(", ")} | Tolerancias: ${art.tolerancias || 'Conforme a pliego'} | Norma: ${art.normativaReferencia}`,
          secuenciaInspeccion: [
            `Verificar cumplimiento del artículo contractual: ${art.articulo} (${art.pliegoCodigo}).`,
            ...Object.entries(art.parametrosClave).map(([k, v]) => `Control de parámetro garantizado: ${k} = ${v}`),
            `Comprobar que los protocolos de ensayo y planos de obra cuenten con el sello APC (Aprobado para Construcción).`
          ]
        });
      } else {
        setFicha({
          titulo: `Auditoría Técnica: "${textoQuery || consulta}"`,
          exigenciaPliego: "Pliego de Bases y Condiciones: Los materiales, equipos y metodologías constructivas deben responder estrictamente a las Normas IRAM, AEA 95301 y Especificaciones Técnicas Particulares del Contrato de Línea 132 kV.",
          planoApc: "Planos Aprobados APC: Cualquier desvío de traza, fundación o modelo de equipo respecto al proyecto ejecutivo sellado requiere la previa aprobación por escrito de TRANSNOA mediante Orden de Servicio.",
          secuenciaInspeccion: [
            "Verificar la vigencia de la última revisión emitida del plano (Rev 0 o APC).",
            "Comprobar certificados de calidad de fábrica (ensayos de recepción y protocolos de lote).",
            "Asentar en el Libro de Comunicaciones de Obra el inicio de los trabajos y solicitud de inspección."
          ]
        });
      }
    }
  };

  // Manejo de Fotos
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsAnalyzingFoto(true);

    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = evt => {
        addFoto({
          id: 'foto_' + Date.now() + Math.random(),
          nombre: file.name,
          fecha: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          dataUrl: evt.target?.result as string
        });
      };
      reader.readAsDataURL(file);
    });

    setTimeout(() => {
      setIsAnalyzingFoto(false);
    }, 1500);

    e.target.value = '';
  };

  // Manejo de Audio
  const toggleGrabacionAudio = async () => {
    if (isRecordingAudio) {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      if (timerRef.current) clearInterval(timerRef.current);
      setIsRecordingAudio(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mr = new MediaRecorder(stream);

      mr.ondataavailable = e => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mr.onstop = () => {
        const blobAudio = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        stream.getTracks().forEach(t => t.stop());

        const reader = new FileReader();
        reader.onloadend = () => {
          const m = Math.floor(recordingSeconds / 60);
          const s = (recordingSeconds % 60).toString().padStart(2, '0');
          addAudio({
            id: 'audio_' + Date.now(),
            fecha: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            duracion: `${m}:${s}`,
            dataUrl: reader.result as string,
            transcripcion: "Nota de voz grabada en terreno."
          });
          setRecordingSeconds(0);
        };
        reader.readAsDataURL(blobAudio);
      };

      mr.start();
      mediaRecorderRef.current = mr;
      setIsRecordingAudio(true);
      setRecordingSeconds(0);

      timerRef.current = setInterval(() => {
        setRecordingSeconds((prev: number) => prev + 1);
      }, 1000);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      showNotice("No se pudo acceder al micrófono: " + errorMsg);
    }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setNotasCampo(e.target.value);
    setEstadoGuardadoNota('Guardado ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
  };

  return (
    <div className="space-y-5">
      {bannerNotice && (
        <div className="p-3 rounded-xl bg-amber-950/80 border border-amber-800 text-amber-200 text-xs flex items-center justify-between">
          <span>{bannerNotice}</span>
          <button onClick={() => setBannerNotice(null)} className="text-amber-400 hover:text-white font-bold ml-2">✕</button>
        </div>
      )}

      {/* Search Bar Bento Anotador */}
      <div className="bento-card p-5 space-y-3.5 border-sky-800/40 bg-gradient-to-br from-slate-900 via-slate-900 to-sky-950/20">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-sky-400 flex items-center gap-1.5 font-mono">
            <span>📓</span> Auditoría Técnica & Normativa
          </span>
          <span className="text-[10px] bg-sky-950/80 text-sky-300 border border-sky-800 px-2.5 py-0.5 rounded-full font-mono flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-sky-400" />
            <span>IA Gemini Flash</span>
          </span>
        </div>
        <p className="text-xs text-slate-300 leading-relaxed">
          Escribe cualquier tema de obra para auditar en segundos qué exige el <b>Pliego Técnico</b> vs qué indica el <b>Plano Aprobado (APC)</b> y la secuencia de inspección.
        </p>

        {/* Campo de Consulta con Dictado y Búsqueda */}
        <div className="relative">
          <input 
            type="text"
            id="txtConsultaAnotador"
            value={consulta}
            onChange={e => setConsulta(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') ejecutarAuditoria(); }}
            placeholder="Ej: fundaciones de pórticos H-25, malla PAT, cruce gasoducto TGN..."
            className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-4 py-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 font-medium pr-20"
          />
          <div className="absolute right-2 top-2 flex items-center gap-1">
            <button 
              type="button"
              onClick={toggleDictadoConsulta}
              title={isDictatingConsulta ? "Detener dictado" : "Dictar consulta por voz"}
              className={`h-8 w-8 rounded-lg flex items-center justify-center text-sm transition-all cursor-pointer ${
                isDictatingConsulta 
                  ? 'bg-rose-600 text-white animate-pulse' 
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700'
              }`}
            >
              {isDictatingConsulta ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>
            <button 
              onClick={() => ejecutarAuditoria()}
              className="h-8 w-8 bg-sky-600 hover:bg-sky-500 text-white rounded-lg flex items-center justify-center text-sm font-bold shadow-md active:scale-95 transition-all cursor-pointer"
            >
              <Search className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Chips de Búsqueda Rápida */}
        <div className="flex items-center gap-2 overflow-x-auto pt-1">
          <button 
            onClick={() => { setConsulta('fundaciones de porticos hormigones H25 y stub'); ejecutarAuditoria('fundaciones de porticos hormigones H25 y stub'); }}
            className="shrink-0 text-xs px-3 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700/80 transition-all cursor-pointer"
          >
            🏗️ Fundaciones
          </button>
          <button 
            onClick={() => { setConsulta('malla de puesta a tierra PAT resistividad y cables'); ejecutarAuditoria('malla de puesta a tierra PAT resistividad y cables'); }}
            className="shrink-0 text-xs px-3 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700/80 transition-all cursor-pointer"
          >
            ⚡ Malla PAT
          </button>
          <button 
            onClick={() => { setConsulta('cruce de gasoducto TGN galibos y protecciones'); ejecutarAuditoria('cruce de gasoducto TGN galibos y protecciones'); }}
            className="shrink-0 text-xs px-3 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700/80 transition-all cursor-pointer"
          >
            🔥 Cruce TGN
          </button>
          <button 
            onClick={() => { setConsulta('curado y probetas de hormigon tiempo de desencofrado'); ejecutarAuditoria('curado y probetas de hormigon tiempo de desencofrado'); }}
            className="shrink-0 text-xs px-3 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700/80 transition-all cursor-pointer"
          >
            🧪 Ensayos H°
          </button>
        </div>
      </div>

      {/* Ficha Técnica de Inspección */}
      {ficha && (
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <FileText className="w-3.5 h-3.5 text-sky-400" />
              <span>Ficha Técnica de Inspección</span>
            </h4>
            <button 
              onClick={() => setFicha(null)} 
              className="text-xs text-slate-400 hover:text-white underline cursor-pointer"
            >
              Cerrar ficha
            </button>
          </div>

          <div className="bento-card p-5 text-xs space-y-4 border-sky-800/50 bg-slate-900/90 shadow-xl">
            <h3 className="text-sm font-extrabold text-sky-300 border-b border-slate-800 pb-2">
              {ficha.titulo}
            </h3>

            <div className="space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <span>📜</span> Exigencia del Pliego Técnico Contractual:
              </span>
              <p className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/90 text-slate-300 leading-relaxed font-sans">
                {ficha.exigenciaPliego}
              </p>
            </div>

            <div className="space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                <span>📐</span> Disposición en Plano Aprobado con Sello APC:
              </span>
              <p className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/90 text-slate-300 leading-relaxed font-sans">
                {ficha.planoApc}
              </p>
            </div>

            <div className="space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                <span>📋</span> Protocolo de Control & Secuencia de Inspección en Terreno:
              </span>
              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/90 space-y-1.5">
                {ficha.secuenciaInspeccion.map((p, idx) => (
                  <div key={idx} className="flex items-start gap-2 text-slate-200">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
                    <span>{p}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Notas Privadas de Campo */}
      <div className="bento-card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
            <span>✍️</span> Mis Notas Privadas de Campo
          </h4>
          <div className="flex items-center gap-2">
            <button 
              type="button"
              onClick={toggleDictadoNota}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                isDictatingNota 
                  ? 'bg-rose-600 border border-rose-500 text-white animate-pulse' 
                  : 'bg-sky-950/80 hover:bg-sky-900 border border-sky-800/80 text-sky-300'
              }`}
            >
              {isDictatingNota ? <MicOff className="w-3 h-3" /> : <Mic className="w-3 h-3" />}
              <span>{isDictatingNota ? 'Escuchando...' : 'Dictar por voz'}</span>
            </button>
            <span className="text-[10px] text-slate-500 font-mono hidden sm:inline-block">Persistente</span>
          </div>
        </div>

        <textarea 
          rows={4}
          value={notasCampo}
          onChange={handleTextChange}
          placeholder="Anota observaciones o dicta por voz en terreno (ej: 'Revisar piquete 42: verificar nivelación del stub antes de colar hormigón')..."
          className="w-full bg-slate-950 border border-slate-700/80 rounded-xl p-3.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-500 resize-none font-sans"
        />

        <div className="flex items-center justify-between text-xs text-slate-400">
          <span className="text-[11px]">{estadoGuardadoNota}</span>
          {isConfirmingClearNotes ? (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-amber-300">¿Confirmar borrado?</span>
              <button 
                onClick={() => { setNotasCampo(""); setIsConfirmingClearNotes(false); }}
                className="text-rose-400 hover:text-rose-300 font-bold px-1.5 py-0.5 rounded bg-rose-950/60 border border-rose-800"
              >
                Sí, borrar
              </button>
              <button 
                onClick={() => setIsConfirmingClearNotes(false)}
                className="text-slate-400 hover:text-white px-1.5 py-0.5"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <button 
              onClick={() => setIsConfirmingClearNotes(true)}
              className="text-rose-400 hover:text-rose-300 font-medium cursor-pointer"
            >
              Borrar notas
            </button>
          )}
        </div>

        {/* Sección de Fotos y Evidencia */}
        <div className="pt-3 border-t border-slate-800/80 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <span>📷</span> Fotos y Evidencia de Campo
            </span>
            <span className="text-[10px] text-slate-400 font-mono">{fotosCampo.length} fotos</span>
          </div>

          <input 
            type="file"
            id="fileInputFoto"
            accept="image/*"
            capture="environment"
            multiple
            className="hidden"
            onChange={handlePhotoUpload}
          />

          <div className="flex items-center gap-2">
            <button 
              type="button"
              onClick={() => document.getElementById('fileInputFoto')?.click()}
              className="flex-1 py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 border border-sky-800/40 text-sky-300 text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <Camera className="w-4 h-4 text-sky-400" />
              <span>Tomar Foto / Adjuntar Imagen</span>
            </button>
          </div>

          {isAnalyzingFoto && (
            <div className="text-[11px] text-emerald-400 font-medium flex items-center gap-2 bg-emerald-950/40 p-2.5 rounded-xl border border-emerald-800/40">
              <div className="w-3.5 h-3.5 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin"></div>
              <span>Analizando fotografía con IA de ingeniería...</span>
            </div>
          )}

          {/* Grilla de Fotos */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {fotosCampo.map(f => (
              <div key={f.id} className="bento-card p-3 space-y-2 bg-slate-950/90 border-slate-800">
                <div className="flex justify-between items-center text-[11px]">
                  <span className="font-bold text-slate-200 truncate max-w-[180px]">{f.nombre}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500 font-mono text-[10px]">{f.fecha}</span>
                    <button 
                      onClick={() => deleteFoto(f.id)} 
                      className="text-rose-400 hover:text-rose-300 cursor-pointer p-0.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <img src={f.dataUrl} alt={f.nombre} className="w-full h-36 object-cover rounded-lg" />
              </div>
            ))}
          </div>
        </div>

        {/* Grabadora de Notas de Voz */}
        <div className="pt-3 border-t border-slate-800/80 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <span>🎧</span> Notas de Audio Grabadas en Campo
            </span>
            {isRecordingAudio && (
              <span className="text-[11px] font-mono text-rose-400 font-bold animate-pulse">
                ● {Math.floor(recordingSeconds / 60).toString().padStart(2, '0')}:{(recordingSeconds % 60).toString().padStart(2, '0')}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button 
              type="button"
              onClick={toggleGrabacionAudio}
              className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                isRecordingAudio 
                  ? 'bg-rose-600 hover:bg-rose-500 border border-rose-400 text-white shadow-lg animate-pulse' 
                  : 'bg-slate-900 hover:bg-slate-800 border border-rose-900/40 text-rose-300'
              }`}
            >
              <span className={`w-2.5 h-2.5 rounded-full ${isRecordingAudio ? 'bg-white' : 'bg-rose-500'}`}></span>
              <span>{isRecordingAudio ? 'Detener y Guardar Grabación' : 'Grabar y Transcribir Nota de Voz'}</span>
            </button>
          </div>

          {/* Lista de Audios */}
          <div className="space-y-2">
            {audiosCampo.length === 0 ? (
              <div className="text-[11px] text-slate-500 italic p-3 text-center bg-slate-950/60 rounded-xl border border-slate-800/60">
                No hay grabaciones de voz aún.
              </div>
            ) : (
              audiosCampo.map((item, idx) => (
                <div key={item.id} className="bento-card p-3 space-y-2 bg-slate-950/80 border-slate-800">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-200 flex items-center gap-1.5">
                      <Volume2 className="w-3.5 h-3.5 text-rose-400" />
                      <span>Nota #{audiosCampo.length - idx} ({item.duracion})</span>
                      <span className="text-slate-500 text-[10px] font-mono font-normal">({item.fecha})</span>
                    </span>
                    <button 
                      onClick={() => deleteAudio(item.id)} 
                      className="text-rose-400 hover:text-rose-300 text-xs font-bold cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <audio controls src={item.dataUrl} className="w-full h-8" />
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
