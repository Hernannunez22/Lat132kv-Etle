import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { matchPlanoFrente } from '../data/initialData';
import { Search, Cloud, ExternalLink, Filter } from 'lucide-react';

const FRENTES_FILTROS = ['TODOS', 'LAT', 'Leales', 'Villa Quinteros', 'Bracho'];

export const PlanosTab: React.FC = () => {
  const { planos, selectedFrenteFilter, setSelectedFrenteFilter, config } = useApp();
  const [searchQuery, setSearchQuery] = useState('');

  const filtrados = planos.filter(p => {
    const matchFrente = matchPlanoFrente(p.proyecto, selectedFrenteFilter);
    const q = searchQuery.toLowerCase().trim();
    const matchQuery = !q || 
      (p.codigo || '').toLowerCase().includes(q) || 
      (p.descripcion || '').toLowerCase().includes(q) || 
      (p.disciplina || '').toLowerCase().includes(q) || 
      (p.revision || '').toLowerCase().includes(q);
    return matchFrente && matchQuery;
  });

  const accountId = config.r2AccountId || 'e1d197bd1aa5e242733d883eab2a9322';
  const bucketName = config.r2Bucket || 'backup-obra-132kv';

  return (
    <div className="space-y-4">
      {/* Search & Filter Bar Bento */}
      <div className="bento-card p-4 space-y-3 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2">
            <span className="text-xl">📁</span>
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-sky-400">
                Catálogo de Planos y Documentación Técnica
              </h3>
              <p className="text-[11px] text-slate-400">
                Explorador con respaldo de alta disponibilidad en Cloudflare R2
              </p>
            </div>
          </div>
          <span className="text-xs text-slate-400 font-mono">
            {filtrados.length} de {planos.length} planos
          </span>
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
            className="w-full bg-slate-950 border border-slate-700/80 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 font-medium"
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
        <div className="flex items-center gap-2 overflow-x-auto text-xs pt-1">
          <span className="text-[10px] text-slate-500 flex items-center gap-1 font-semibold uppercase tracking-wider pl-1">
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

      {/* Listado de Planos */}
      <div id="listaPlanosContenedor" className="space-y-3">
        {filtrados.length === 0 ? (
          <div className="bento-card p-8 text-center text-slate-500 text-xs">
            No se encontraron planos con esos criterios de búsqueda o filtro.
          </div>
        ) : (
          filtrados.map((item, idx) => {
            const urlR2Fallback = `https://${accountId}.r2.cloudflarestorage.com/${bucketName}/${encodeURI(item.proyecto || 'Documentación')}/${encodeURI(item.codigo)}.pdf`;
            const urlDescargaR2 = item.urlR2 || urlR2Fallback;

            return (
              <div key={item.codigo + '-' + idx} className="bento-card p-4 space-y-2 hover:border-sky-500/40">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-sky-400">{item.codigo}</span>
                    {item.selloApc && (
                      <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800 font-mono">
                        Sello APC ✅
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-sky-950 text-sky-300 border border-sky-800 font-mono">
                    Rev {item.revision || 'EO'}
                  </span>
                </div>

                <p className="text-xs text-slate-200 leading-snug font-medium">
                  {item.descripcion}
                </p>

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
          })
        )}
      </div>
    </div>
  );
};
