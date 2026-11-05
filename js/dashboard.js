/**
 * =========================================================================
 * ARCHIVO: js/dashboard.js
 * Cálculo de la barra global (48 emitidos vs 910 planificados = 5.3%),
 * renderizado de tarjetas de frentes y catálogo de planos.
 * =========================================================================
 */

function renderizarTarjetasObras() {
  const cont = document.getElementById('contenedorTarjetasObras');
  if (!cont) return;
  cont.innerHTML = '';

  const totalEmitidosGlobal = catalogoPlanosLocal.length;
  let totalApcGlobal = 0;

  FRENTES_OBRA.forEach(frente => {
    const planosFrente = catalogoPlanosLocal.filter(p => {
      const proyLower = (p.proyecto || '').toLowerCase();
      if (frente.id === 'LAT') return proyLower.includes('lat') || proyLower.includes('bracho - villa');
      if (frente.id === 'Leales') return proyLower.includes('leales');
      if (frente.id === 'Villa Quinteros') return proyLower.includes('quinteros') || proyLower.includes('vq');
      if (frente.id === 'Bracho') return proyLower.includes('bracho') && !proyLower.includes('lat') && !proyLower.includes('villa');
      return false;
    });

    const countCargados = planosFrente.length;
    const countApc = planosFrente.filter(p => p.selloApc === true).length;
    totalApcGlobal += countApc;

    const faltantes = Math.max(0, frente.totalPlanificados - countCargados);
    const pct = frente.totalPlanificados > 0 ? Math.min(100, Math.round((countCargados / frente.totalPlanificados) * 100)) : 0;

    const card = `
      <div class="bento-card p-5 space-y-4 cursor-pointer" onclick="verFrenteEspecifico('${frente.id}')">
        <div class="flex items-start justify-between">
          <div class="flex items-center gap-3">
            <div class="w-11 h-11 rounded-xl bg-slate-800/80 border border-slate-700/60 flex items-center justify-center text-xl shadow-inner shrink-0">
              ${frente.icono}
            </div>
            <div>
              <h4 class="text-xs font-bold text-white tracking-tight">${frente.nombre}</h4>
              <p class="text-[11px] text-slate-400">${frente.tipo} • <span class="font-mono text-sky-400 font-semibold">${frente.tension}</span></p>
            </div>
          </div>
          <span class="text-[10px] font-bold px-2.5 py-1 rounded-full bg-slate-950 text-slate-300 border border-slate-800 font-mono">
            ${countCargados} / ${frente.totalPlanificados}
          </span>
        </div>

        <div class="grid grid-cols-2 gap-2 text-center">
          <div class="metric-pill rounded-lg p-2.5 border-emerald-900/30 bg-emerald-950/20">
            <div class="text-xs font-bold text-emerald-400 font-mono">${countCargados}</div>
            <div class="text-[9px] text-emerald-400 uppercase font-semibold mt-0.5">Planos Emitidos</div>
          </div>
          <div class="metric-pill rounded-lg p-2.5 border-rose-900/30 bg-rose-950/20">
            <div class="text-xs font-bold text-rose-400 font-mono">${faltantes}</div>
            <div class="text-[9px] text-rose-400 uppercase font-semibold mt-0.5">Pendientes de Emisión</div>
          </div>
        </div>

        <div class="space-y-1.5 pt-1">
          <div class="flex justify-between text-[11px] text-slate-400">
            <span>Avance de Diseño</span>
            <span class="font-bold text-white font-mono">${pct}%</span>
          </div>
          <div class="h-1.5 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-800/80">
            <div class="h-full bg-gradient-to-r from-sky-500 to-emerald-400 rounded-full" style="width: ${pct}%;"></div>
          </div>
        </div>

        <div class="flex items-center justify-between text-xs text-sky-400 font-semibold pt-1 border-t border-slate-800/60">
          <span>Explorar planos del frente ➔</span>
          <span class="text-[11px] text-slate-500 font-normal">Ver ${countCargados} planos</span>
        </div>
      </div>
    `;
    cont.insertAdjacentHTML('beforeend', card);
  });

  // Métricas superiores
  const statPlanos = document.getElementById('statTotalPlanos');
  if (statPlanos) statPlanos.innerText = totalEmitidosGlobal;
  
  const statApcReal = document.getElementById('statTotalApc');
  if (statApcReal) statApcReal.innerText = totalApcGlobal;

  // CÁLCULO EXACTO BASADO EN 910 PLANOS CONTRACTUALES
  const pctGlobal = TOTAL_PLANIFICADOS_CONTRATO_GLOBAL > 0 
    ? ((totalEmitidosGlobal / TOTAL_PLANIFICADOS_CONTRATO_GLOBAL) * 100).toFixed(1) 
    : "0.0";

  const lblPct = document.getElementById('lblPorcentajeGlobal');
  if (lblPct) lblPct.innerText = `${pctGlobal}%`;

  const barraGlobal = document.getElementById('barraProgresoGlobal');
  if (barraGlobal) barraGlobal.style.width = `${Math.min(100, Math.max(3, parseFloat(pctGlobal)))}%`;

  const lblFraccion = document.getElementById('lblEmitidosVsTotal');
  if (lblFraccion) lblFraccion.innerText = `${totalEmitidosGlobal} / ${TOTAL_PLANIFICADOS_CONTRATO_GLOBAL}`;
}

function verFrenteEspecifico(frenteId) {
  cambiarSeccion('planos');
  filtrarProyecto(frenteId);
}

function filtrarProyecto(proy) {
  proyectoFiltro = proy;
  ['TODOS', 'LAT', 'Leales', 'Villa Quinteros', 'Bracho'].forEach(p => {
    const btn = document.getElementById('btnFiltro-' + p);
    if (btn) {
      if (p === proy) {
        btn.className = 'px-3 py-1.5 rounded-lg bg-sky-600 text-white font-bold whitespace-nowrap shadow-sm';
      } else {
        btn.className = 'px-3 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 font-medium whitespace-nowrap';
      }
    }
  });
  renderizarListaPlanos();
}

function renderizarListaPlanos() {
  const q = (document.getElementById('txtBuscadorPlanos').value || '').toLowerCase().trim();
  const cont = document.getElementById('listaPlanosContenedor');
  if (!cont) return;
  cont.innerHTML = '';

  const filtrados = catalogoPlanosLocal.filter(p => {
    const matchP = proyectoFiltro === 'TODOS' || (p.proyecto || '').toLowerCase().includes(proyectoFiltro.toLowerCase());
    const matchQ = !q || 
      (p.codigo || '').toLowerCase().includes(q) || 
      (p.descripcion || '').toLowerCase().includes(q) || 
      (p.disciplina || '').toLowerCase().includes(q) || 
      (p.revision || '').toLowerCase().includes(q);
    return matchP && matchQ;
  });

  const lblConteo = document.getElementById('lblConteoResultadosPlanos');
  if (lblConteo) lblConteo.innerText = `Mostrando ${filtrados.length} de ${catalogoPlanosLocal.length} planos`;

  if (filtrados.length === 0) {
    cont.innerHTML = `<div class="bento-card p-8 text-center text-slate-500 text-xs">No se encontraron planos con esos criterios de búsqueda.</div>`;
    return;
  }

  const bucketName = localStorage.getItem('cfg_r2_bucket') || 'backup-obra-132kv';
  const accountId = localStorage.getItem('cfg_r2_account_id') || 'e1d197bd1aa5e242733d883eab2a9322';

  filtrados.slice(0, 100).forEach(item => {
    const badgeRev = `<span class="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-sky-950 text-sky-300 border border-sky-800 font-mono">Rev ${item.revision || 'EO'}</span>`;
    const urlR2Fallback = `https://${accountId}.r2.cloudflarestorage.com/${bucketName}/${encodeURI(item.proyecto || 'Documentación')}/${encodeURI(item.codigo)}.pdf`;
    const urlDescargaR2 = item.urlR2 || urlR2Fallback;

    const card = `
      <div class="bento-card p-4 space-y-2">
        <div class="flex items-center justify-between">
          <span class="font-mono text-xs font-bold text-sky-400">${item.codigo}</span>
          ${badgeRev}
        </div>
        <p class="text-xs text-slate-200 leading-snug font-medium">${item.descripcion}</p>
        <div class="flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-slate-800/80">
          <span class="text-[11px]">${item.proyecto} • <b class="text-slate-300">${item.disciplina}</b></span>
          <div class="flex items-center gap-2">
            <a href="${urlDescargaR2}" target="_blank" class="px-2.5 py-1 rounded-lg bg-sky-950/80 hover:bg-sky-900 text-sky-300 text-xs font-bold border border-sky-800/60 flex items-center gap-1 transition-colors">
              <span>☁️ R2 Backup</span>
            </a>
            ${item.urlDrive ? `<a href="${item.urlDrive}" target="_blank" class="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 transition-colors">Drive</a>` : ''}
          </div>
        </div>
      </div>
    `;
    cont.insertAdjacentHTML('beforeend', card);
  });
}