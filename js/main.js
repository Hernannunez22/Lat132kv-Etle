/**
 * =========================================================================
 * ARCHIVO: js/main.js
 * Punto de entrada de la aplicación, navegación entre pestañas y chat IA.
 * =========================================================================
 */

window.onload = function() {
  cargarConfiguracionGuardada();
  cargarNotasLocales();
  cargarAudiosLocales();
  cargarFotosLocales();
  inicializarSpeechRecognition();
  sincronizarDatosCompletos();
};

function cambiarSeccion(tabId) {
  seccionActual = tabId;
  ['dashboard', 'planos', 'pliegos', 'hitos', 'informes', 'interferencias', 'anotador', 'chat'].forEach(t => {
    const el = document.getElementById('tab-' + t);
    const nav = document.getElementById('nav-' + t);
    if (t === tabId) {
      if (el) el.classList.remove('hidden');
      if (nav) nav.className = 'flex flex-col items-center justify-center w-12 py-1 text-sky-400 font-bold transition-all';
    } else {
      if (el) el.classList.add('hidden');
      if (nav) nav.className = 'flex flex-col items-center justify-center w-12 py-1 text-slate-400 hover:text-slate-200 font-medium transition-all';
    }
  });

  const sub = document.getElementById('lblSubtituloHeader');
  if (sub) {
    if (tabId === 'dashboard') sub.innerText = 'Control Documental & Ingeniería de Campo';
    if (tabId === 'planos') sub.innerText = 'Explorador de Planos y Respaldo R2';
    if (tabId === 'pliegos') sub.innerText = 'Pliegos Técnicos & Especificaciones Contractuales';
    if (tabId === 'hitos') sub.innerText = 'Cronograma de Hitos & Alerta de Vencimientos';
    if (tabId === 'informes') sub.innerText = 'Generador de Informes Ejecutivos en 1 Clic';
    if (tabId === 'interferencias') sub.innerText = 'Auditoría de Cruces & Entes (LAT 132 kV)';
    if (tabId === 'anotador') sub.innerText = 'Anotador Técnico & Auditoría';
    if (tabId === 'chat') sub.innerText = 'Asistente IA Multimodal (Gemini)';
  }
}

function filtrarInterferencias(filtro) {
  filtroInterferenciasActivo = filtro;
  ['TODOS', 'LISTOS', 'FALTANTES'].forEach(f => {
    const btn = document.getElementById('btnInt-' + f);
    if (btn) {
      if (f === filtro) btn.className = 'px-3 py-1.5 rounded-lg bg-amber-600 text-white font-bold whitespace-nowrap shadow-sm';
      else btn.className = 'px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium whitespace-nowrap';
    }
  });
  renderizarInterferencias();
}

function renderizarInterferencias() {
  const cont = document.getElementById('contenedorTarjetasInterferencias');
  if (!cont) return;
  cont.innerHTML = '';

  const cnt = document.getElementById('cntIntTodos');
  if (cnt) cnt.innerText = listaInterferenciasLocal.length;

  const filtradas = listaInterferenciasLocal.filter(item => {
    if (filtroInterferenciasActivo === 'LISTOS') return (item.estadoTramite || '').includes('LISTO') || (item.estadoTramite || '').includes('SUFICIENTES');
    if (filtroInterferenciasActivo === 'FALTANTES') return (item.estadoTramite || '').includes('INCOMPLETA') || (item.faltantes && item.faltantes.length > 0);
    return true;
  });

  if (filtradas.length === 0) {
    cont.innerHTML = `<div class="col-span-full bento-card p-8 text-center text-slate-500 text-xs">No hay organismos con ese filtro de interferencias.</div>`;
    return;
  }

  filtradas.forEach(item => {
    const esListo = (item.estadoTramite || '').includes('LISTO') || (item.estadoTramite || '').includes('SUFICIENTES');
    const badgeClass = esListo ? 'bg-emerald-950 text-emerald-400 border-emerald-800' : 'bg-rose-950 text-rose-400 border-rose-800';

    cont.insertAdjacentHTML('beforeend', `
      <div class="bento-card p-5 space-y-3.5 flex flex-col justify-between">
        <div class="space-y-3">
          <div class="flex items-start justify-between gap-2">
            <div>
              <span class="text-[10px] font-mono uppercase font-bold text-slate-400">${item.normativa || 'Norma Ente'}</span>
              <h4 class="text-sm font-extrabold text-white leading-tight mt-0.5">${item.empresa}</h4>
              <p class="text-[11px] text-amber-300 font-medium">${item.tipoInterferencia || 'Cruce'}</p>
            </div>
            <span class="text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${badgeClass}">
              ${esListo ? 'Listo' : 'Incompleto'}
            </span>
          </div>
          <div class="p-2 rounded-lg bg-slate-950/80 border border-slate-800 text-[11px] text-slate-300">
            <div><span class="text-slate-500 font-semibold">📍 Vanos:</span> <b class="text-white">${item.vanosAfectados || 'Traza General'}</b></div>
          </div>
        </div>
      </div>
    `);
  });
}

function enviarMensajeChatMovil() {
  const inp = document.getElementById('txtChatInput');
  const msg = inp.value.trim();
  if (!msg) return;

  inp.value = '';
  agregarMensajeChatUI(msg, true);

  const cont = document.getElementById('contenedorMensajesChat');
  const idLoader = 'loader-movil-' + Date.now();
  cont.insertAdjacentHTML('beforeend', `
    <div id="${idLoader}" class="flex flex-col items-start">
      <div class="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 text-slate-400 text-xs flex items-center gap-2.5">
        <div class="w-4 h-4 border-2 border-sky-400 border-t-transparent rounded-full animate-spin"></div>
        <span>Analizando con IA...</span>
      </div>
    </div>
  `);
  cont.scrollTop = cont.scrollHeight;

  let apiUrl = (localStorage.getItem('cfg_api_url') || '').trim();
  if (apiUrl && apiUrl.startsWith('http')) {
    if (apiUrl.includes('/edit')) apiUrl = apiUrl.replace(/\/edit.*$/, '/exec');
    if (!apiUrl.endsWith('/exec')) apiUrl = apiUrl.replace(/\/?$/, '/exec');

    fetch(apiUrl, {
      method: 'POST',
      body: JSON.stringify({ accion: "consulta_chat", mensaje: msg, historial: historialChatMovil })
    })
    .then(r => r.json())
    .then(res => {
      const el = document.getElementById(idLoader);
      if (el) el.remove();
      if (res && res.exito) {
        agregarMensajeChatUI(res.respuesta, false);
        historialChatMovil += `Usuario: ${msg}\nIA: ${res.respuesta}\n`;
      } else {
        agregarMensajeChatUI("⚠️ Error al procesar consulta.", false);
      }
    })
    .catch(() => {
      const el = document.getElementById(idLoader);
      if (el) el.remove();
      agregarMensajeChatUI("Respuesta local de respaldo.", false);
    });
  } else {
    setTimeout(() => {
      const el = document.getElementById(idLoader);
      if (el) el.remove();
      agregarMensajeChatUI(`Consultando planos de la obra: ${catalogoPlanosLocal.length} documentos disponibles.`, false);
    }, 800);
  }
}

function agregarMensajeChatUI(texto, esUsuario = false) {
  const cont = document.getElementById('contenedorMensajesChat');
  if (!cont) return;
  const align = esUsuario ? 'items-end' : 'items-start';
  const bg = esUsuario ? 'bg-sky-600 text-white' : 'bg-slate-950 border border-slate-800 text-slate-200';
  cont.insertAdjacentHTML('beforeend', `
    <div class="flex flex-col ${align} w-full">
      <div class="p-3.5 rounded-2xl ${bg} text-xs max-w-xl leading-relaxed shadow-sm">${texto}</div>
    </div>
  `);
  cont.scrollTop = cont.scrollHeight;
}

function limpiarChatMovil() {
  historialChatMovil = '';
  const cont = document.getElementById('contenedorMensajesChat');
  if (cont) cont.innerHTML = `<div class="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-xs text-slate-200">Chat reiniciado.</div>`;
}