/**
 * =========================================================================
 * ARCHIVO: js/media.js
 * Grabación y transcripción de notas de voz en campo y fotos con Gemini Vision.
 * =========================================================================
 */

function inicializarSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SpeechRecognition) {
    reconocimientoVoz = new SpeechRecognition();
    reconocimientoVoz.continuous = false;
    reconocimientoVoz.interimResults = false;
    reconocimientoVoz.lang = 'es-AR';

    reconocimientoVoz.onresult = function(event) {
      const transcript = event.results[0][0].transcript;
      if (dictandoConsulta) {
        const input = document.getElementById('txtConsultaAnotador');
        if (input) { input.value = transcript; ejecutarConsultaAnotador(); }
      } else if (dictandoNota) {
        const txtArea = document.getElementById('txtNotasCampo');
        if (txtArea) {
          const sep = txtArea.value.trim() ? " " : "";
          txtArea.value = txtArea.value + sep + transcript;
          guardarNotasLocales();
        }
      }
    };
    reconocimientoVoz.onerror = () => detenerTodoDictado();
    reconocimientoVoz.onend = () => detenerTodoDictado();
  }
}

function toggleDictadoConsulta() {
  if (!reconocimientoVoz) return alert("Tu navegador no soporta dictado directo por voz.");
  if (dictandoConsulta) { reconocimientoVoz.stop(); detenerTodoDictado(); }
  else {
    detenerTodoDictado();
    dictandoConsulta = true;
    document.getElementById('btnVozConsulta').className = 'h-8 w-8 bg-rose-600 text-white rounded-lg flex items-center justify-center text-sm animate-pulse';
    reconocimientoVoz.start();
  }
}

function toggleDictadoNota() {
  if (!reconocimientoVoz) return alert("Tu navegador no soporta dictado directo por voz.");
  if (dictandoNota) { reconocimientoVoz.stop(); detenerTodoDictado(); }
  else {
    detenerTodoDictado();
    dictandoNota = true;
    document.getElementById('btnDictarNota').className = 'px-2.5 py-1 rounded-lg bg-rose-600 border border-rose-500 text-white text-[11px] font-semibold flex items-center gap-1 animate-pulse';
    document.getElementById('txtBtnDictado').innerText = 'Escuchando...';
    reconocimientoVoz.start();
  }
}

function detenerTodoDictado() {
  dictandoConsulta = false;
  dictandoNota = false;
  const btnVoz = document.getElementById('btnVozConsulta');
  if (btnVoz) btnVoz.className = 'h-8 w-8 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg flex items-center justify-center text-sm transition-all border border-slate-700';
  const btnNota = document.getElementById('btnDictarNota');
  if (btnNota) {
    btnNota.className = 'px-2.5 py-1 rounded-lg bg-sky-950/80 hover:bg-sky-900 border border-sky-800/80 text-sky-300 text-[11px] font-semibold flex items-center gap-1 transition-all';
    document.getElementById('txtBtnDictado').innerText = 'Dictar por voz';
  }
}

async function toggleGrabacionAudio() {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
    clearInterval(grabacionTimer);
    document.getElementById('lblTimerGrabacion').classList.add('hidden');
    document.getElementById('lblBtnGrabarAudio').innerText = 'Grabar y Transcribir Nota de Voz';
    document.getElementById('btnGrabarAudio').className = 'flex-1 py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 border border-rose-900/40 text-rose-300 text-xs font-bold flex items-center justify-center gap-2 transition-all';
    document.getElementById('dotGrabando').className = 'w-2.5 h-2.5 rounded-full bg-rose-500';
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioChunks = [];
    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.ondataavailable = e => { if (e.data.size > 0) audioChunks.push(e.data); };
    mediaRecorder.onstop = () => {
      const blobAudio = new Blob(audioChunks, { type: 'audio/webm' });
      stream.getTracks().forEach(t => t.stop());
      const reader = new FileReader();
      reader.onloadend = () => {
        const duracion = `${Math.floor(segundosGrabando / 60)}:${(segundosGrabando % 60).toString().padStart(2, '0')}`;
        const nuevaNotaAudio = {
          id: 'audio_' + Date.now(),
          fecha: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          duracion: duracion,
          dataUrl: reader.result,
          transcripcion: "Procesando transcripción con Gemini..."
        };
        listaAudiosCampo.unshift(nuevaNotaAudio);
        guardarAudiosLocales();
        renderizarAudiosCampo();
      };
      reader.readAsDataURL(blobAudio);
    };

    mediaRecorder.start();
    segundosGrabando = 0;
    const lblTimer = document.getElementById('lblTimerGrabacion');
    lblTimer.innerText = '● 00:00';
    lblTimer.classList.remove('hidden');

    grabacionTimer = setInterval(() => {
      segundosGrabando++;
      const m = Math.floor(segundosGrabando / 60).toString().padStart(2, '0');
      const s = (segundosGrabando % 60).toString().padStart(2, '0');
      lblTimer.innerText = `● ${m}:${s}`;
    }, 1000);

    document.getElementById('lblBtnGrabarAudio').innerText = 'Detener y Transcribir';
    document.getElementById('btnGrabarAudio').className = 'flex-1 py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 border border-rose-400 text-white text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-lg animate-pulse';
    document.getElementById('dotGrabando').className = 'w-2.5 h-2.5 rounded-full bg-white';
  } catch (err) {
    alert("No se pudo acceder al micrófono: " + err.message);
  }
}

function guardarAudiosLocales() {
  try { localStorage.setItem('audios_obra_132kv', JSON.stringify(listaAudiosCampo)); } catch(e){}
}

function cargarAudiosLocales() {
  try {
    const g = localStorage.getItem('audios_obra_132kv');
    if (g) { listaAudiosCampo = JSON.parse(g); renderizarAudiosCampo(); }
  } catch(e) { listaAudiosCampo = []; }
}

function renderizarAudiosCampo() {
  const cont = document.getElementById('contenedorAudiosGrabados');
  if (!cont) return;
  cont.innerHTML = '';
  if (listaAudiosCampo.length === 0) {
    cont.innerHTML = `<div class="text-[11px] text-slate-500 italic p-3 text-center bg-slate-950/60 rounded-xl border border-slate-800/60">No hay grabaciones de voz aún.</div>`;
    return;
  }
  listaAudiosCampo.forEach((item, idx) => {
    cont.insertAdjacentHTML('beforeend', `
      <div class="bento-card p-3.5 space-y-2 bg-slate-950/80 border-slate-800">
        <div class="flex items-center justify-between text-xs">
          <span class="font-bold text-slate-200">🎙️ Nota #${listaAudiosCampo.length - idx} (${item.duracion})</span>
          <button onclick="eliminarAudio('${item.id}')" class="text-rose-400 text-xs font-bold">✕</button>
        </div>
        <audio controls src="${item.dataUrl}" class="w-full h-8"></audio>
      </div>
    `);
  });
}

function eliminarAudio(id) {
  if (confirm("¿Eliminar audio?")) {
    listaAudiosCampo = listaAudiosCampo.filter(a => a.id !== id);
    guardarAudiosLocales();
    renderizarAudiosCampo();
  }
}

function procesarFotosSeleccionadas(e) {
  const files = e.target.files;
  if (!files || files.length === 0) return;
  Array.from(files).forEach(file => {
    const reader = new FileReader();
    reader.onload = evt => {
      listaFotosCampo.unshift({
        id: 'foto_' + Date.now(),
        nombre: file.name,
        fecha: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        dataUrl: evt.target.result
      });
      guardarFotosLocales();
      renderizarFotosCampo();
    };
    reader.readAsDataURL(file);
  });
  e.target.value = '';
}

function guardarFotosLocales() {
  try { localStorage.setItem('fotos_obra_132kv', JSON.stringify(listaFotosCampo.slice(0, 4))); } catch(e){}
  const lbl = document.getElementById('lblConteoFotos');
  if (lbl) lbl.innerText = `${listaFotosCampo.length} fotos`;
}

function cargarFotosLocales() {
  try {
    const g = localStorage.getItem('fotos_obra_132kv');
    if (g) { listaFotosCampo = JSON.parse(g); renderizarFotosCampo(); }
  } catch(e) { listaFotosCampo = []; }
  const lbl = document.getElementById('lblConteoFotos');
  if (lbl) lbl.innerText = `${listaFotosCampo.length} fotos`;
}

function renderizarFotosCampo() {
  const cont = document.getElementById('contenedorFotosAdjuntas');
  if (!cont) return;
  cont.innerHTML = '';
  listaFotosCampo.forEach(f => {
    cont.insertAdjacentHTML('beforeend', `
      <div class="bento-card p-3 space-y-2 bg-slate-950/90 border-slate-800">
        <div class="flex justify-between text-[11px]">
          <span class="font-bold text-slate-200 truncate">${f.nombre}</span>
          <button onclick="eliminarFoto('${f.id}')" class="text-rose-400 font-bold">✕</button>
        </div>
        <img src="${f.dataUrl}" class="w-full h-36 object-cover rounded-lg" />
      </div>
    `);
  });
}

function eliminarFoto(id) {
  if (confirm("¿Eliminar foto?")) {
    listaFotosCampo = listaFotosCampo.filter(f => f.id !== id);
    guardarFotosLocales();
    renderizarFotosCampo();
  }
}

function guardarNotasLocales() {
  try {
    const val = document.getElementById('txtNotasCampo').value;
    localStorage.setItem('notas_obra_132kv', val);
    const lbl = document.getElementById('lblEstadoNotas');
    if (lbl) lbl.innerText = 'Guardado ' + new Date().toLocaleTimeString();
  } catch(e){}
}

function cargarNotasLocales() {
  try {
    const val = localStorage.getItem('notas_obra_132kv');
    if (val && document.getElementById('txtNotasCampo')) document.getElementById('txtNotasCampo').value = val;
  } catch(e){}
}

function limpiarNotasCampo() {
  if (confirm("¿Borrar notas?")) {
    document.getElementById('txtNotasCampo').value = "";
    localStorage.removeItem('notas_obra_132kv');
  }
}