import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { matchPlanoFrente } from '../data/initialData';
import type { NotaLibro, Plano } from '../types';
import {
  Search,
  Cloud,
  ExternalLink,
  Filter,
  History,
  MessageSquareText,
  ChevronDown,
  ChevronUp,
  Clock,
} from 'lucide-react';

const FRENTES_FILTROS = ['TODOS', 'LAT', 'Leales', 'Villa Quinteros', 'Bracho'];
const PAGE_SIZE = 40;

function baseCodigoPlano(codigo: string): string {
  return String(codigo || '')
    .trim()
    .toUpperCase()
    .replace(/[-_\s]*(?:REV|R)?[-_\s]*(?:EO|APC|0|[A-Z])$/i, '')
    .trim() || String(codigo || '').trim().toUpperCase();
}

function parseFechaPlanoMs(fecha?: string): number | null {
  if (!fecha) return null;
  const iso = String(fecha).trim();
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const ms = Date.parse(`${match[1]}-${match[2]}-${match[3]}T00:00:00Z`);
    return Number.isFinite(ms) ? ms : null;
  }
  const lat = iso.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (lat) {
    const ms = Date.parse(`${lat[3]}-${lat[2]}-${lat[1]}T00:00:00Z`);
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}

export const PlanosTab: React.FC = () => {
  const {
    planos,
    notasLibro,
    selectedFrenteFilter,
    setSelectedFrenteFilter,
    config,
    sendChatMessage,
    setActiveTab,
  } = useApp();
  const [searchQuery, setSearchQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [mostrarHistorial, setMostrarHistorial] = useState(false);
  const [expandedNotaCodigo, setExpandedNotaCodigo] = useState<string | null>(null);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [searchQuery, selectedFrenteFilter]);

  const filtrados = useMemo(() => {
    return planos.filter(p => {
      const matchFrente = matchPlanoFrente(p.proyecto, selectedFrenteFilter);
      const q = searchQuery.toLowerCase().trim();
      const matchQuery =
        !q ||
        (p.codigo || '').toLowerCase().includes(q) ||
        (p.descripcion || '').toLowerCase().includes(q) ||
        (p.disciplina || '').toLowerCase().includes(q) ||
        (p.revision || '').toLowerCase().includes(q);
      return matchFrente && matchQuery;
    });
  }, [planos, selectedFrenteFilter, searchQuery]);

  // Índice rápido de notas de libro vinculadas por código de plano
  const notasPorPlanoMap = useMemo(() => {
    const map = new Map<string, NotaLibro[]>();
    if (!notasLibro.length) return map;
    for (const p of filtrados) {
      const cod = (p.codigo || '').trim().toUpperCase();
      const baseCod = baseCodigoPlano(cod);
      if (!cod || cod.length < 3) continue;
      const matches = notasLibro.filter(n => {
        const corpus = `${n.codigo} ${n.titulo || n.nombreArchivo || ''} ${n.resumen || ''} ${(n.referenciasNotas || []).join(' ')}`.toUpperCase();
        return corpus.includes(cod) || (baseCod.length >= 4 && corpus.includes(baseCod));
      });
      if (matches.length > 0) {
        map.set(cod, matches);
      }
    }
    return map;
  }, [filtrados, notasLibro]);

  // Historial de revisiones agrupado por código base y tiempos promedio por disciplina
  const historialRevisiones = useMemo(() => {
    const porCodigo = new Map<string, Plano[]>();
    const disciplinaStats = new Map<
      string,
      { total: number; apc: number; cambios: number[]; revMultiples: number }
    >();

    for (const p of filtrados) {
      const base = baseCodigoPlano(p.codigo);
      const list = porCodigo.get(base) || [];
      list.push(p);
      porCodigo.set(base, list);

      const disc = (p.disciplina || 'General').trim() || 'General';
      const st = disciplinaStats.get(disc) || { total: 0, apc: 0, cambios: [], revMultiples: 0 };
      st.total += 1;
      if (p.selloApc) st.apc += 1;
      disciplinaStats.set(disc, st);
    }

    const familias: Array<{
      codigoBase: string;
      descripcion: string;
      disciplina: string;
      revisiones: Plano[];
      diasEntreRevisiones: number | null;
    }> = [];

    for (const [codigoBase, revs] of porCodigo.entries()) {
      const ordenadas = [...revs].sort((a, b) => {
        const ma = parseFechaPlanoMs(a.fechaDocumento || a.fechaSubida || a.fecha);
        const mb = parseFechaPlanoMs(b.fechaDocumento || b.fechaSubida || b.fecha);
        if (ma !== null && mb !== null) return ma - mb;
        return String(a.revision || '').localeCompare(String(b.revision || ''));
      });
      let diasTotal: number | null = null;
      if (ordenadas.length >= 2) {
        const primera = parseFechaPlanoMs(ordenadas[0].fechaDocumento || ordenadas[0].fechaSubida || ordenadas[0].fecha);
        const ultima = parseFechaPlanoMs(
          ordenadas[ordenadas.length - 1].fechaDocumento ||
            ordenadas[ordenadas.length - 1].fechaSubida ||
            ordenadas[ordenadas.length - 1].fecha
        );
        if (primera !== null && ultima !== null && ultima >= primera) {
          diasTotal = Math.round((ultima - primera) / (1000 * 60 * 60 * 24));
        }
        const disc = (ordenadas[0].disciplina || 'General').trim() || 'General';
        const ds = disciplinaStats.get(disc);
        if (ds) {
          ds.revMultiples += 1;
          if (diasTotal !== null) ds.cambios.push(diasTotal);
        }
      }
      familias.push({
        codigoBase,
        descripcion: ordenadas[ordenadas.length - 1]?.descripcion || ordenadas[0]?.descripcion || '',
        disciplina: ordenadas[0]?.disciplina || 'General',
        revisiones: ordenadas,
        diasEntreRevisiones: diasTotal,
      });
    }

    const familiasOrdenadas = familias.sort(
      (a, b) => b.revisiones.length - a.revisiones.length || a.codigoBase.localeCompare(b.codigoBase)
    );

    const resumenDisciplinas = Array.from(disciplinaStats.entries())
      .map(([disciplina, st]) => ({
        disciplina,
        total: st.total,
        apc: st.apc,
        pctApc: st.total > 0 ? Math.round((st.apc / st.total) * 100) : 0,
        promedioDiasRev:
          st.cambios.length > 0
            ? Math.round(st.cambios.reduce((acc, v) => acc + v, 0) / st.cambios.length)
            : null,
      }))
      .sort((a, b) => b.total - a.total);

    return {
      familias: familiasOrdenadas,
      resumenDisciplinas,
      conMultiplesRev: familiasOrdenadas.filter(f => f.revisiones.length > 1).length,
    };
  }, [filtrados]);

  const visibles = filtrados.slice(0, visibleCount);
  const restantes = Math.max(0, filtrados.length - visibles.length);

  const accountId = config.r2AccountId || 'e1d197bd1aa5e242733d883eab2a9322';
  const bucketName = config.r2Bucket || 'backup-obra-132kv';

  const consultarPlanoEnChat = (plano: Plano, notas: NotaLibro[]) => {
    const listaCodigos = notas.map(n => `${n.codigo} (${n.estadoRespuesta})`).join(', ');
    void sendChatMessage(
      `Analiza la trazabilidad contractual del plano ${plano.codigo} (${plano.descripcion}, Rev ${plano.revision || 'EO'}) y sus Notas de Libro vinculadas (${listaCodigos}). Resume observaciones vigentes, si ya tiene sello APC o si falta respuesta.`
    );
    setActiveTab('chat');
  };

  return (
    <div className="space-y-4">
      {/* Search & Filter Bar Bento */}
      <div className="bento-card p-3 sm:p-4 space-y-3 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xl shrink-0">📁</span>
            <div className="min-w-0">
              <h3 className="text-xs font-bold uppercase tracking-wider text-sky-400">
                Catálogo de Planos y Documentación Técnica
              </h3>
              <p className="text-[11px] text-slate-400">
                Explorador con respaldo R2, historial de revisiones y trazabilidad hacia Libro de Obra
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setMostrarHistorial(v => !v)}
              className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold flex items-center gap-1.5 cursor-pointer transition-colors ${
                mostrarHistorial
                  ? 'bg-sky-600/25 border-sky-400/60 text-sky-200'
                  : 'bg-slate-800/80 hover:bg-slate-700 border-slate-700 text-slate-300'
              }`}
            >
              <History className="w-3.5 h-3.5 text-sky-400" />
              <span>Revisiones y Tiempos ({historialRevisiones.familias.length})</span>
              {mostrarHistorial ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
            <span className="text-xs text-slate-400 font-mono tabular-nums shrink-0">
              {filtrados.length}/{planos.length}
            </span>
          </div>
        </div>

        {/* Buscador */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
          <input
            type="text"
            id="txtBuscadorPlanos"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Buscar por código (ej: PL-500), palabra clave, disciplina o revisión..."
            className="w-full bg-slate-950 border border-slate-700/80 rounded-xl pl-10 pr-8 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 font-medium"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-2.5 text-slate-400 hover:text-white text-xs cursor-pointer"
            >
              ✕
            </button>
          )}
        </div>

        {/* Botones de Filtro por Frente */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar text-xs pt-1">
          <span className="text-[10px] text-slate-500 flex items-center gap-1 font-semibold uppercase tracking-wider pl-1 shrink-0">
            <Filter className="w-3 h-3" /> Frente:
          </span>
          {FRENTES_FILTROS.map(frente => {
            const isSelected = selectedFrenteFilter === frente;
            return (
              <button
                key={frente}
                onClick={() => setSelectedFrenteFilter(frente)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-sky-600 text-white font-bold shadow-sm'
                    : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300'
                }`}
              >
                {frente}
              </button>
            );
          })}
        </div>
      </div>

      {/* Panel Historial de Revisiones y Tiempos por Disciplina */}
      {mostrarHistorial && (
        <div className="bento-card p-3 sm:p-4 space-y-3 border-sky-500/30 bg-slate-950/90">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
            <div className="text-xs font-bold text-sky-300 flex items-center gap-1.5">
              <Clock className="w-4 h-4" />
              <span>Tiempos y Madurez APC por Disciplina</span>
            </div>
            <span className="text-[10px] font-mono text-slate-400">
              {historialRevisiones.conMultiplesRev} código(s) con múltiples revisiones registradas
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {historialRevisiones.resumenDisciplinas.map(d => (
              <div
                key={d.disciplina}
                className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800 text-[11px] space-y-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-slate-100 truncate">{d.disciplina}</span>
                  <span className="font-mono text-[10px] text-emerald-300 shrink-0">
                    {d.apc}/{d.total} APC ({d.pctApc}%)
                  </span>
                </div>
                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500" style={{ width: `${d.pctApc}%` }} />
                </div>
                {d.promedioDiasRev !== null && (
                  <div className="text-[10px] text-slate-400 font-mono">
                    Ciclo promedio entre revisiones: <strong className="text-sky-300">{d.promedioDiasRev} d</strong>
                  </div>
                )}
              </div>
            ))}
          </div>

          {historialRevisiones.familias.some(f => f.revisiones.length > 1) && (
            <div className="space-y-1.5 pt-1 border-t border-slate-800/80">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Cadena de Revisiones Detectadas
              </div>
              <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                {historialRevisiones.familias
                  .filter(f => f.revisiones.length > 1)
                  .slice(0, 25)
                  .map(fam => (
                    <div
                      key={fam.codigoBase}
                      className="p-2 rounded-lg bg-slate-900/70 border border-slate-800 flex flex-wrap items-center justify-between gap-2 text-[10px]"
                    >
                      <div className="min-w-0">
                        <span className="font-mono font-bold text-sky-300">{fam.codigoBase}</span>
                        <span className="text-slate-400 ml-2 truncate">{fam.descripcion}</span>
                      </div>
                      <div className="flex items-center gap-1 flex-wrap shrink-0">
                        {fam.revisiones.map((r, rIdx) => (
                          <React.Fragment key={`${r.codigo}-${rIdx}`}>
                            {rIdx > 0 && <span className="text-slate-600">➔</span>}
                            <span
                              className={`px-1.5 py-0.5 rounded font-mono border ${
                                r.selloApc
                                  ? 'bg-emerald-950/80 text-emerald-300 border-emerald-700'
                                  : 'bg-slate-950 text-slate-300 border-slate-700'
                              }`}
                            >
                              Rev {r.revision || 'EO'}
                              {r.fecha ? ` (${r.fecha})` : ''}
                            </span>
                          </React.Fragment>
                        ))}
                        {fam.diasEntreRevisiones !== null && (
                          <span className="text-amber-300 font-mono ml-1">
                            · {fam.diasEntreRevisiones}d
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Listado de Planos */}
      <div id="listaPlanosContenedor" className="space-y-3">
        {filtrados.length === 0 ? (
          <div className="bento-card p-8 text-center text-slate-500 text-xs">
            No se encontraron planos con esos criterios de búsqueda o filtro.
          </div>
        ) : (
          <>
            {visibles.map((item, idx) => {
              const urlR2Fallback = `https://${accountId}.r2.cloudflarestorage.com/${bucketName}/${encodeURI(item.proyecto || 'Documentación')}/${encodeURI(item.codigo)}.pdf`;
              const urlDescargaR2 = item.urlR2 || urlR2Fallback;
              const codKey = (item.codigo || '').trim().toUpperCase();
              const notasVinculadas = notasPorPlanoMap.get(codKey) || [];
              const notasExpandidas = expandedNotaCodigo === codKey;

              return (
                <div key={item.codigo + '-' + idx} className="bento-card p-3 sm:p-4 space-y-2 hover:border-sky-500/40">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2 min-w-0">
                      <span className="font-mono text-xs font-bold text-sky-400 break-all">{item.codigo}</span>
                      {item.selloApc && (
                        <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800 font-mono shrink-0">
                          Sello APC ✅
                        </span>
                      )}
                      {notasVinculadas.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setExpandedNotaCodigo(notasExpandidas ? null : codKey)}
                          className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-violet-950/70 hover:bg-violet-900/70 text-violet-200 border border-violet-500/40 inline-flex items-center gap-1 cursor-pointer shrink-0"
                        >
                          <MessageSquareText className="w-3 h-3 text-violet-300" />
                          <span>{notasVinculadas.length} nota(s) Libro</span>
                        </button>
                      )}
                    </div>
                    <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-sky-950 text-sky-300 border border-sky-800 font-mono shrink-0">
                      Rev {item.revision || 'EO'}
                    </span>
                  </div>

                  <p className="text-xs text-slate-200 leading-snug font-medium">
                    {item.descripcion}
                  </p>

                  {notasExpandidas && notasVinculadas.length > 0 && (
                    <div className="p-2.5 rounded-lg bg-violet-950/20 border border-violet-500/30 space-y-1.5 text-[11px]">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-violet-200 text-[10px] uppercase tracking-wider">
                          Notas de Libro vinculadas a {item.codigo}
                        </span>
                        <button
                          type="button"
                          onClick={() => consultarPlanoEnChat(item, notasVinculadas)}
                          className="px-2 py-0.5 rounded bg-violet-600 hover:bg-violet-500 text-white text-[10px] font-bold cursor-pointer"
                        >
                          Consultar en Chat
                        </button>
                      </div>
                      {notasVinculadas.slice(0, 5).map(n => (
                        <div key={n.id} className="text-[10px] text-slate-300 flex flex-wrap items-center gap-1.5">
                          <span className="font-mono font-bold text-white">{n.codigo}</span>
                          <span className="text-slate-400">({n.actorEmisor} ➔ {n.actorReceptor})</span>
                          <span className="text-amber-300 font-mono">{n.estadoRespuesta.replace(/_/g, ' ')}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-400 pt-2 border-t border-slate-800/80">
                    <div className="text-[11px]">
                      <span className="text-slate-300 font-semibold">{item.proyecto}</span> • <span className="text-slate-400">{item.disciplina}</span>
                      {item.fecha && <span className="text-slate-500 ml-2 font-mono">({item.fecha})</span>}
                    </div>
                    <div className="flex items-center gap-2 self-end sm:self-auto">
                      <a
                        href={urlDescargaR2}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2.5 py-1 rounded-lg bg-sky-950/80 hover:bg-sky-900 text-sky-300 text-xs font-bold border border-sky-800/60 flex items-center gap-1.5 transition-colors"
                        title="Descargar copia de seguridad en Cloudflare R2"
                      >
                        <Cloud className="w-3 h-3 text-sky-400" />
                        <span>R2 Backup</span>
                      </a>
                      {item.urlDrive && (
                        <a
                          href={item.urlDrive}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 flex items-center gap-1 transition-colors"
                        >
                          <ExternalLink className="w-3 h-3" />
                          <span>Drive</span>
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {restantes > 0 && (
              <div className="pt-2 flex flex-col items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setVisibleCount(v => v + PAGE_SIZE)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-sky-300 text-xs font-bold border border-slate-700 cursor-pointer transition-colors"
                >
                  Mostrar {Math.min(PAGE_SIZE, restantes)} más ({restantes} restantes)
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

