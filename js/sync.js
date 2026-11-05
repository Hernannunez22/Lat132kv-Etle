/**
 * =========================================================================
 * ARCHIVO: js/sync.js
 * Comunicación bidireccional con Google Apps Script (JSONP anti-CORS)
 * y descarga directa de respaldo desde Cloudflare R2.
 * =========================================================================
 */

function sincronizarDatosCompletos() {
  const icon = document.getElementById('iconSpinSync');
  const badgeTxt = document.getElementById('txtEstadoConexion');
  if (icon) icon.classList.add('animate-spin');
  if (badgeTxt) badgeTxt.innerText = "Sincronizando...";

  let apiUrl = (localStorage.getItem('cfg_api_url') || '').trim();
  if (apiUrl) {
    if (apiUrl.includes('/edit')) apiUrl = apiUrl.replace(/\/edit.*$/, '/exec');
    if (!apiUrl.endsWith('/exec') && !apiUrl.includes('/exec?')) apiUrl = apiUrl.replace(/\/?$/, '/exec');
  }

  if (apiUrl && apiUrl.startsWith('http')) {
    sincronizarViaJsonp(apiUrl, function(exitoJsonp, resJsonp) {
      if (exitoJsonp && resJsonp && resJsonp.planos) {
        if (icon) icon.classList.remove('animate-spin');
        aplicarDatosRecibidos(resJsonp, "Sheets Conectado");
      } else {
        const separador = apiUrl.includes('?') ? '&' : '?';
        const urlFetch = `${apiUrl}${separador}api=datos&_t=${Date.now()}`;
        fetch(urlFetch, { method: 'GET', redirect: 'follow' })
          .then(r => r.json())
          .then(res => {
            if (icon) icon.classList.remove('animate-spin');
            if (res && res.planos) {
              aplicarDatosRecibidos(res, "Sheets Conectado");
            } else {
              intentarRespaldoR2Directo();
            }
          })
          .catch(() => intentarRespaldoR2Directo());
      }
    });
  } else {
    intentarRespaldoR2Directo();
  }
}

function sincronizarViaJsonp(urlBase, callback) {
  const nombreCallback = "cb_sync_" + Date.now();
  const script = document.createElement("script");
  let timeoutId = null;

  window[nombreCallback] = function(data) {
    clearTimeout(timeoutId);
    if (script.parentNode) script.parentNode.removeChild(script);
    try { delete window[nombreCallback]; } catch(e){}
    callback(true, data);
  };

  const separador = urlBase.includes("?") ? "&" : "?";
  script.src = `${urlBase}${separador}api=datos&callback=${nombreCallback}&_t=${Date.now()}`;
  script.onerror = function() {
    clearTimeout(timeoutId);
    if (script.parentNode) script.parentNode.removeChild(script);
    try { delete window[nombreCallback]; } catch(e){}
    callback(false, null);
  };

  timeoutId = setTimeout(function() {
    if (script.parentNode) script.parentNode.removeChild(script);
    try { delete window[nombreCallback]; } catch(e){}
    callback(false, null);
  }, 8000);

  document.head.appendChild(script);
}

function intentarRespaldoR2Directo() {
  const icon = document.getElementById('iconSpinSync');
  const badgeTxt = document.getElementById('txtEstadoConexion');
  const accountId = localStorage.getItem('cfg_r2_account_id') || 'e1d197bd1aa5e242733d883eab2a9322';
  const bucketName = localStorage.getItem('cfg_r2_bucket') || 'backup-obra-132kv';
  const urlR2 = `https://${accountId}.r2.cloudflarestorage.com/${bucketName}/_indice_maestro_obra.json`;

  fetch(urlR2)
    .then(r => r.json())
    .then(data => {
      if (icon) icon.classList.remove('animate-spin');
      if (data) {
        const planosExtraidos = (data.carpetas || []).map(c => {
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
            urlR2: `https://${accountId}.r2.cloudflarestorage.com/${bucketName}/${encodeURI(c.ruta)}`
          };
        });

        aplicarDatosRecibidos({
          planos: planosExtraidos,
          megabytesR2: data.megabytes_transferidos || "156.4",
          interferencias: []
        }, "Respaldo R2 Activo");
      } else {
        if (badgeTxt) badgeTxt.innerText = "Sin Conexión API";
        cargarCacheLocalExistente();
      }
    })
    .catch(() => {
      if (icon) icon.classList.remove('animate-spin');
      if (badgeTxt) badgeTxt.innerText = "Sin Conexión API";
      cargarCacheLocalExistente();
    });
}

function aplicarDatosRecibidos(res, estadoTexto) {
  catalogoPlanosLocal = res.planos || [];
  listaInterferenciasLocal = res.interferencias || [];
  listaPliegosLocal = res.pliegos || [];
  listaHitosLocal = res.hitos || [];

  guardarCacheLocalPlanos(catalogoPlanosLocal);

  if (res.megabytesR2) {
    const elR2 = document.getElementById('statTotalR2');
    if (elR2) elR2.innerText = res.megabytesR2 + " MB";
  }
  const badgeTxt = document.getElementById('txtEstadoConexion');
  if (badgeTxt) badgeTxt.innerText = estadoTexto;

  const cnt = document.getElementById('cntPlanosTodos');
  if (cnt) cnt.innerText = catalogoPlanosLocal.length;

  renderizarTarjetasObras();
  renderizarListaPlanos();
  renderizarInterferencias();
  renderizarHitos();
}

function guardarCacheLocalPlanos(planos) {
  try { localStorage.setItem('cache_planos_132kv', JSON.stringify(planos)); } catch(e){}
}

function cargarCacheLocalExistente() {
  const guardado = localStorage.getItem('cache_planos_132kv');
  if (guardado) {
    try { catalogoPlanosLocal = JSON.parse(guardado); } catch(e) { catalogoPlanosLocal = []; }
  }
  const guardadoHitos = localStorage.getItem('cache_hitos_obra_132kv');
  if (guardadoHitos) {
    try { listaHitosLocal = JSON.parse(guardadoHitos); } catch(e) { listaHitosLocal = []; }
  }
  renderizarTarjetasObras();
  renderizarListaPlanos();
  renderizarInterferencias();
  renderizarHitos();
}

function abrirModalConfiguracion() {
  document.getElementById('modalConfiguracion').classList.remove('hidden');
}

function cerrarModalConfiguracion() {
  document.getElementById('modalConfiguracion').classList.add('hidden');
}

function guardarConfiguracion() {
  const url = document.getElementById('cfgApiUrl').value.trim();
  const r2Acc = document.getElementById('cfgR2AccountId').value.trim();
  const r2Bkt = document.getElementById('cfgR2Bucket').value.trim();
  localStorage.setItem('cfg_api_url', url);
  localStorage.setItem('cfg_r2_account_id', r2Acc);
  localStorage.setItem('cfg_r2_bucket', r2Bkt);
  cerrarModalConfiguracion();
  sincronizarDatosCompletos();
}

function cargarConfiguracionGuardada() {
  const url = localStorage.getItem('cfg_api_url');
  const r2Acc = localStorage.getItem('cfg_r2_account_id');
  const r2Bkt = localStorage.getItem('cfg_r2_bucket');
  if (url) document.getElementById('cfgApiUrl').value = url;
  if (r2Acc) document.getElementById('cfgR2AccountId').value = r2Acc;
  if (r2Bkt) document.getElementById('cfgR2Bucket').value = r2Bkt;
}