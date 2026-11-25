import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { apiFetch, readJsonResponse } from '../utils/apiClient';
import { MarkdownRenderer } from './MarkdownRenderer';
import { descargarMarkdownComoWord, markdownToCleanHtml } from '../utils/exportWord';
import {
  Zap,
  Copy,
  Download,
  Printer,
  Save,
  CheckCircle,
} from 'lucide-react';

const PLANTILLAS_INFORMES = {
  avance_diseno: `4. Una descripción del avance actual del trabajo de diseño.\n\n¿Qué planos se han emitido hasta ahora?\n¿El ritmo de emisión de planos está en línea con los requisitos del cronograma del proyecto?`,
  sellos_apc: `Informe ejecutivo sobre estado de documentación: ¿Qué planos se han emitido en cada frente y cuáles están en circuito de revisión?`,
  interferencias: `Detalle del estado de tramitación y expedientes de interferencias de la LAT 132 kV (TGN, Gasnor, Vialidad Nacional RN 38, Belgrano Cargas y EDET). ¿Cuáles están habilitados para iniciar obra y cuáles tienen faltantes?`,
  sla_vencidos: `Auditoría de plazos de revisión documental (SLA 15 días). ¿Qué planos se encuentran demorados y qué impacto tienen en la ruta crítica del cronograma?`
};

export const InformesTab: React.FC = () => {
  const {
    planos,
    hitos,
    interferencias,
    totalPlanificados,
    notasCampo,
    fotosCampo,
    audiosCampo,
    ultimoInforme,
    setUltimoInforme,
  } = useApp();
  const [solicitud, setSolicitud] = useState(PLANTILLAS_INFORMES.avance_diseno);
  const [isGenerating, setIsGenerating] = useState(false);
  const [fuenteInforme, setFuenteInforme] = useState<string | null>(null);
  const [errorGeneracion, setErrorGeneracion] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [savedDbMessage, setSavedDbMessage] = useState('');

  const ejecutarGeneracion = async () => {
    if (!solicitud.trim()) return;

    setIsGenerating(true);
    setErrorGeneracion(null);
    const hoy = new Date();
    const fechaHoyStr = hoy.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });

    try {
      const res = await apiFetch('/api/informes/generar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          solicitud: solicitud.trim(),
          planos,
          totalPlanificados,
          hitos,
          interferencias,
          notasCampo,
          fotosCount: fotosCampo.length,
          audiosCount: audiosCampo.length,
        }),
      });
      const data = await readJsonResponse(res, 'Error generando informe');
      if (!res.ok || !data?.exito || !data?.markdown) {
        throw new Error(data?.error || `Error generando informe (HTTP ${res.status})`);
      }
      setUltimoInforme(String(data.markdown));
      setFuenteInforme(String(data.fuente || 'openrouter/free'));
    } catch (err: any) {
      // Respaldo offline estrictamente basado en datos reales vivos (sin fechas fijas ni textos inventados)
      setErrorGeneracion(
        err?.message ? `Generado en modo local (${err.message})` : 'Generado con datos locales.'
      );
      const totalEmitidos = planos.length;
      const totalApc = planos.filter(p => p.selloApc).length;
      const avanceGlobalPct =
        totalPlanificados > 0 ? ((totalEmitidos / totalPlanificados) * 100).toFixed(1) : '0.0';

      const fechasValidas = planos
        .map(p => String(p.fechaDocumento || p.fechaSubida || p.fecha || '').slice(0, 10))
        .filter(f => /^\d{4}-\d{2}-\d{2}$/.test(f))
        .sort();
      const primerRegistroStr = fechasValidas[0] || hoy.toISOString().slice(0, 10);

      const filasTabla = planos
        .map((p, idx) => {
          const est = p.selloApc ? '✅ Sello APC' : p.estado || 'En Circuito';
          return `| ${idx + 1} | \`${p.codigo}\` | ${p.descripcion} | ${p.disciplina} | ${p.proyecto} | ${p.revision} | ${est} |`;
        })
        .join('\n');

      const resumenInterf =
        interferencias.length > 0
          ? interferencias
              .map(
                c =>
                  `- **${c.empresa}** (${c.carpetaNombre || c.empresa}): ${c.estadoTramite} | Vanos: ${c.vanosAfectados || '-'} | Faltantes: ${(c.faltantes || []).join('; ') || 'Ninguno'}`
              )
              .join('\n')
          : '- Sin interferencias sincronizadas aún desde Drive.';

      const informeLocal =
        `# 📑 ${solicitud.trim().split('\n')[0]}\n` +
        `**FECHA DE CORTE:** ${fechaHoyStr} | **PRIMER REGISTRO:** ${primerRegistroStr}\n\n` +
        `## 1. KPIs Reales de Ingeniería\n` +
        `- **Planos Planificados:** ${totalPlanificados}\n` +
        `- **Planos Emitidos:** ${totalEmitidos} (${avanceGlobalPct}%)\n` +
        `- **Con Sello APC:** ${totalApc}\n` +
        `- **Cruces reales cargados:** ${interferencias.length}\n\n` +
        `## 2. Estado de Cruces / Interferencias Reales\n${resumenInterf}\n\n` +
        `## 3. Catálogo de Planos (${totalEmitidos})\n` +
        `| N° | CÓDIGO | DESCRIPCIÓN | DISCIPLINA | FRENTE | REV | ESTADO |\n|---|---|---|---|---|:---:|:---:|\n` +
        filasTabla;

      setUltimoInforme(informeLocal);
      setFuenteInforme('datos-vivos-locales');
    } finally {
      setIsGenerating(false);
    }
  };

  const copiarPortapapeles = () => {
    if (!ultimoInforme) return;
    navigator.clipboard.writeText(ultimoInforme);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const descargarWord = () => {
    if (!ultimoInforme) return;
    const fechaDoc = new Date().toISOString().split('T')[0];
    descargarMarkdownComoWord(
      `Informe_Tecnico_Ejecutivo_Obra_132kV_${fechaDoc}`,
      'Informe Técnico Ejecutivo - Obras 132 kV',
      ultimoInforme
    );
  };

  const imprimir = () => {
    if (!ultimoInforme) return;
    try {
      const printIframe = document.createElement('iframe');
      printIframe.style.position = 'fixed';
      printIframe.style.right = '0';
      printIframe.style.bottom = '0';
      printIframe.style.width = '0';
      printIframe.style.height = '0';
      printIframe.style.border = '0';
      document.body.appendChild(printIframe);
      const htmlContenido = markdownToCleanHtml(ultimoInforme);
      const doc = printIframe.contentWindow?.document;
      if (doc) {
        doc.open();
        doc.write(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>Informe Técnico de Avance - Obra 132 kV</title>
              <style>
                body { font-family: 'Segoe UI', Arial, sans-serif; padding: 30px; color: #1e293b; line-height: 1.6; font-size: 12px; }
                h1 { font-size: 16px; border-bottom: 2px solid #0f172a; padding-bottom: 6px; color: #0f172a; }
                h2 { font-size: 14px; color: #0369a1; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; margin-top: 16px; }
                h3 { font-size: 12px; color: #15803d; margin-top: 14px; text-transform: uppercase; }
                table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 10px; }
                th { background: #0f172a; color: #fff; padding: 6px 8px; border: 1px solid #334155; text-align: left; }
                td { padding: 4px 6px; border: 1px solid #cbd5e1; }
                code { font-family: monospace; background: #f1f5f9; padding: 2px 4px; border-radius: 4px; }
              </style>
            </head>
            <body>
              ${htmlContenido}
            </body>
          </html>
        `);
        doc.close();
        setTimeout(() => {
          printIframe.contentWindow?.focus();
          printIframe.contentWindow?.print();
          setTimeout(() => printIframe.remove(), 1000);
        }, 300);
      }
    } catch {
      window.print();
    }
  };

  const guardarEnHistorialYNube = () => {
    if (!ultimoInforme) return;
    try {
      const fechaClave = new Date().toISOString().replace(/[:.]/g, '-');
      const saved = JSON.parse(localStorage.getItem('informes_privados_obra') || '[]');
      saved.unshift({
        titulo: `Informe_${fechaClave.split('T')[0]}`,
        fecha: new Date().toLocaleString(),
        contenido: ultimoInforme,
      });
      localStorage.setItem('informes_privados_obra', JSON.stringify(saved.slice(0, 15)));
      setUltimoInforme(ultimoInforme);
      setSavedDbMessage('✅ Guardado en Historial y Nube');
      setTimeout(() => setSavedDbMessage(''), 3000);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Card Bento Formulario */}
      <div className="bento-card p-3 sm:p-5 bg-gradient-to-br from-slate-900 via-slate-900 to-emerald-950/20 border-emerald-900/30 space-y-3 sm:space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="text-xl shrink-0">📄</span>
            <div className="min-w-0">
              <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                Generador de Informes Ejecutivos en 1 Clic
              </h3>
              <p className="text-[11px] text-slate-400">
                Pega el pedido del comitente o supervisión y obtén el informe formal instantáneo
              </p>
            </div>
          </div>
          <span className="px-2.5 py-1 bg-emerald-950 text-emerald-400 border border-emerald-800 text-[10px] font-mono font-bold rounded-lg self-start sm:self-auto shrink-0 whitespace-nowrap">
            ⚡ 1 Clic
          </span>
        </div>

        {/* Plantillas Rápidas */}
        <div className="space-y-2">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            Plantillas Rápidas de Solicitud:
          </span>
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 text-xs">
            <button 
              onClick={() => setSolicitud(PLANTILLAS_INFORMES.avance_diseno)}
              className="px-3 py-1.5 bg-slate-800/90 hover:bg-slate-700 text-slate-200 rounded-lg whitespace-nowrap font-medium border border-slate-700 transition-all cursor-pointer"
            >
              📊 Avance de Diseño & Cronograma
            </button>
            <button 
              onClick={() => setSolicitud(PLANTILLAS_INFORMES.sellos_apc)}
              className="px-3 py-1.5 bg-slate-800/90 hover:bg-slate-700 text-emerald-300 rounded-lg whitespace-nowrap font-medium border border-slate-700 transition-all cursor-pointer"
            >
              ✅ Estado de Emisión de Planos
            </button>
            <button 
              onClick={() => setSolicitud(PLANTILLAS_INFORMES.interferencias)}
              className="px-3 py-1.5 bg-slate-800/90 hover:bg-slate-700 text-amber-300 rounded-lg whitespace-nowrap font-medium border border-slate-700 transition-all cursor-pointer"
            >
              🚧 Cruces e Interferencias
            </button>
            <button 
              onClick={() => setSolicitud(PLANTILLAS_INFORMES.sla_vencidos)}
              className="px-3 py-1.5 bg-slate-800/90 hover:bg-slate-700 text-rose-300 rounded-lg whitespace-nowrap font-medium border border-slate-700 transition-all cursor-pointer"
            >
              🛡️ Desvíos de Plazos (SLA)
            </button>
          </div>
        </div>

        {/* Textarea Requerimiento */}
        <div className="space-y-1.5">
          <label className="block text-[11px] font-semibold text-slate-300">
            Pega aquí lo que te solicitan (preguntas, requerimiento o directiva formal):
          </label>
          <textarea 
            rows={4}
            value={solicitud}
            onChange={e => setSolicitud(e.target.value)}
            placeholder="Ejemplo: '4. Una descripción del avance actual del trabajo de diseño. ¿Qué planos se han emitido hasta ahora? ¿El ritmo de emisión de planos está en línea con los requisitos del cronograma del proyecto?'"
            className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-sans"
          />
        </div>

        {/* Botones de Acción */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <button 
            onClick={ejecutarGeneracion}
            disabled={isGenerating}
            className="w-full sm:w-auto px-4 sm:px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-lg shadow-emerald-900/30 flex items-center justify-center gap-2 active:scale-95 transition-all cursor-pointer disabled:opacity-60"
          >
            <Zap className={`w-4 h-4 shrink-0 ${isGenerating ? 'animate-spin' : ''}`} />
            <span>{isGenerating ? 'Compilando Datos Vivos con IA...' : 'Generar Informe Completo en 1 Clic'}</span>
          </button>
          <button 
            onClick={() => setSolicitud('')}
            className="text-xs text-slate-400 hover:text-white cursor-pointer"
          >
            Limpiar
          </button>
        </div>
      </div>

      {/* Spinner Loader */}
      {isGenerating && (
        <div className="bento-card p-6 sm:p-8 text-center space-y-3 border-emerald-800/40 bg-slate-900/90">
          <div className="w-8 h-8 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <div className="text-xs font-bold text-white">Compilando datos vivos de planos, cronograma y contratos...</div>
          <p className="text-[11px] text-slate-400 max-w-md mx-auto">
            Cruzando los 4 frentes, extrayendo los planos emitidos y evaluando el ritmo de avance respecto al cronograma.
          </p>
        </div>
      )}

      {/* Hoja del Informe Renderizado */}
      {ultimoInforme && !isGenerating && (
        <div className="space-y-3 min-w-0">
          <div className="bento-card p-3 sm:p-4 flex flex-wrap items-center justify-between gap-2 border-emerald-800/60 bg-emerald-950/20">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-emerald-400 font-bold text-xs">✅ Informe Técnico Generado</span>
              {fuenteInforme && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-sky-300">
                  {fuenteInforme}
                </span>
              )}
              <span className="text-[11px] text-slate-400 font-mono">
                | {planos.length} planos · {interferencias.length} cruces
              </span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button 
                onClick={copiarPortapapeles} 
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-bold border border-slate-700 flex items-center gap-1 transition-all cursor-pointer"
              >
                {copied ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copiado' : 'Copiar Texto'}</span>
              </button>
              <button 
                onClick={descargarWord} 
                className="px-3 py-1.5 rounded-lg bg-blue-900/80 hover:bg-blue-800 text-blue-200 text-[11px] font-bold border border-blue-700 flex items-center gap-1.5 transition-all shadow-md cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Descargar Word (.doc)</span>
              </button>
              <button 
                onClick={imprimir} 
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-sky-300 text-[11px] font-bold border border-slate-700 flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Imprimir / PDF</span>
              </button>
              <button 
                onClick={guardarEnHistorialYNube} 
                className="px-3 py-1.5 rounded-lg bg-emerald-950 hover:bg-emerald-900 text-emerald-300 text-[11px] font-bold border border-emerald-800 flex items-center gap-1.5 transition-all cursor-pointer" 
                title="Guarda el informe en el historial local y en tu espacio en la nube"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{savedDbMessage || 'Guardar Historial (Nube)'}</span>
              </button>
            </div>
          </div>

          {errorGeneracion && (
            <div className="text-[11px] text-amber-300 bg-amber-950/30 border border-amber-800/40 rounded-lg px-3 py-2">
              {errorGeneracion}
            </div>
          )}

          {/* Hoja de Papel Digital del Informe */}
          <div className="bento-card p-3 sm:p-6 lg:p-8 text-xs leading-relaxed bg-slate-950/90 border-slate-800 text-slate-200 font-sans shadow-2xl w-full max-w-full overflow-x-auto">
            <MarkdownRenderer content={ultimoInforme} />
          </div>
        </div>
      )}
    </div>
  );
};
