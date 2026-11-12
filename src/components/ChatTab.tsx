import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { 
  Send, 
  Trash2, 
  Bot, 
  BookOpen, 
  Sparkles, 
  Check, 
  Copy, 
  ChevronDown, 
  ChevronUp, 
  FileText, 
  ShieldCheck, 
  AlertCircle 
} from 'lucide-react';
import { LISTA_PLIEGOS_CARGADOS } from '../data/pliegosContractuales';

export const ChatTab: React.FC = () => {
  const { chatMessages, sendChatMessage, clearChat } = useApp();
  const [inputText, setInputText] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showPliegosList, setShowPliegosList] = useState(false);
  const [selectedPliegoFilter, setSelectedPliegoFilter] = useState<string>('TODOS');

  const handleSend = (textToSend?: string) => {
    const txt = (textToSend || inputText).trim();
    if (!txt) return;
    setInputText('');
    sendChatMessage(txt);
  };

  const copyToClipboard = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const quickPrompts = [
    {
      label: '🏗️ Hormigón H-25 y Fundaciones',
      prompt: 'Extrae del pliego técnico las especificaciones del hormigón H-25, ensayos de cono de Abrams, curado y tolerancias de stubs de fundaciones.'
    },
    {
      label: '⚡ Transformadores 132/33 kV',
      prompt: 'Extrae del pliego técnico las especificaciones de los transformadores de potencia de 30 MVA para ET Leales y Villa Quinteros (OLTC, ensayos FAT y SAT).'
    },
    {
      label: '🛡️ Malla Puesta a Tierra (PAT)',
      prompt: 'Extrae las exigencias contractuales de las mallas de puesta a tierra (resistencia máxima R≤0.5Ω en ET y R≤10Ω en línea, tensión de paso y contacto, y tipo de soldaduras).'
    },
    {
      label: '🚧 Cruce Gasoducto TGN (NAG-100)',
      prompt: 'Extrae los requisitos del pliego para el cruce de la LAT 132 kV sobre el Gasoducto Troncal Norte de TGN (gálibo vertical de 10m, distancia horizontal de 30m e inspección).'
    },
    {
      label: '⏱️ Circuito SLA y Sello APC',
      prompt: 'Extrae el artículo del pliego que fija los plazos del circuito de aprobación de planos (SLA de 15 días corridos para Inspección) y obligatoriedad del sello APC.'
    },
    {
      label: '⚖️ Penalidades por Demora en Hitos',
      prompt: 'Extrae del Pliego de Bases y Condiciones Particulares el régimen de multas y penalidades por mora injustificada en hitos de la ruta crítica (0.1% diario y rescisión).'
    },
    {
      label: '📡 Conductor 300/50 y OPGW 24 FO',
      prompt: 'Extrae las características técnicas garantizadas del conductor de fase Al/Ac 300/50 mm² y del cable de guardia OPGW de 24 fibras ópticas.'
    }
  ];

  return (
    <div className="flex flex-col space-y-4">
      {/* Top Bar Chat con indicador de Pliegos Precargados */}
      <div className="bento-card p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400 shadow-sm">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-bold text-white">Asistente IA de Obra & Lector de Pliegos</h4>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" />
                  Pliegos Precargados en Memoria
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Lectura directa sin subir archivos • Extrae artículos, tolerancias y parámetros técnicos al instante
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setShowPliegosList(!showPliegosList)}
              className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-sky-400 text-xs font-semibold border border-sky-500/30 flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>{showPliegosList ? 'Ocultar Pliegos' : 'Ver 5 Pliegos Activos'}</span>
              {showPliegosList ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
            <button 
              onClick={clearChat}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700/80 flex items-center gap-1 cursor-pointer transition-colors"
              title="Reiniciar conversación"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Limpiar</span>
            </button>
          </div>
        </div>

        {/* Banner Informativo Explícito */}
        <div className="bg-sky-950/40 border border-sky-500/25 rounded-xl p-3 text-xs text-sky-200 flex items-start gap-2.5">
          <BookOpen className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-semibold text-white">No es necesario adjuntar ni subir ningún pliego en el chat:</span>
            <p className="text-[11px] text-slate-300 leading-relaxed">
              Todos los pliegos de bases, especificaciones técnicas de la LAT 132 kV, estaciones transformadoras, cruces de gasoducto TGN, DNV y normas TRANSNOA ya están integrados en el sistema. Simplemente formula tu pedido con lo que precisas extraer.
            </p>
          </div>
        </div>

        {/* Panel Desplegable de Pliegos Precargados */}
        {showPliegosList && (
          <div className="mt-2 pt-3 border-t border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-bold text-slate-200">Pliegos contractuales cargados en el motor analítico:</span>
              <span className="text-[11px]">Haga clic en cualquier pliego para extraer sus especificaciones</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {LISTA_PLIEGOS_CARGADOS.map(pliego => (
                <div 
                  key={pliego.codigo}
                  className="bg-slate-900/90 border border-slate-800 hover:border-sky-500/40 rounded-xl p-3 flex flex-col justify-between transition-all"
                >
                  <div>
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-300">
                        {pliego.codigo}
                      </span>
                      <span className="text-[10px] text-slate-500">{pliego.organismo}</span>
                    </div>
                    <h5 className="text-xs font-bold text-white mb-1 leading-snug">{pliego.titulo}</h5>
                    <p className="text-[11px] text-slate-400 line-clamp-2 mb-2 leading-relaxed">
                      {pliego.descripcion}
                    </p>
                  </div>
                  <button
                    onClick={() => handleSend(`Extrae del pliego ${pliego.codigo} (${pliego.titulo}) los artículos principales, exigencias técnicas, tolerancias y requisitos contractuales.`)}
                    className="w-full mt-1 py-1.5 px-2 bg-slate-800 hover:bg-sky-600 text-slate-200 hover:text-white rounded-lg text-[11px] font-semibold border border-slate-700/60 flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <Sparkles className="w-3 h-3 text-sky-400" />
                    <span>Extraer Requisitos de este Pliego</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Botones de Extracción Rápida */}
        <div className="space-y-1.5 pt-1">
          <div className="text-[11px] font-bold text-slate-400 flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-amber-400" />
            <span>Extracciones Técnicas Rápidas en 1 Clic:</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {quickPrompts.map((qp, idx) => (
              <button
                key={idx}
                onClick={() => handleSend(qp.prompt)}
                className="px-2.5 py-1.5 bg-slate-900/90 hover:bg-sky-600/30 hover:border-sky-500/50 border border-slate-800 rounded-lg text-[11px] text-slate-300 hover:text-white font-medium cursor-pointer transition-all active:scale-95 flex items-center gap-1 shadow-sm"
              >
                <span>{qp.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Historial de Mensajes */}
      <div className="bento-card p-4 space-y-4 min-h-[400px] max-h-[580px] overflow-y-auto">
        {chatMessages.map(msg => (
          <div 
            key={msg.id} 
            className={`flex flex-col ${msg.esUsuario ? 'items-end' : 'items-start'} w-full group`}
          >
            <div 
              className={`p-4 rounded-2xl text-xs max-w-2xl leading-relaxed shadow-sm relative ${
                msg.esUsuario 
                  ? 'bg-sky-600 text-white rounded-br-xs' 
                  : 'bg-slate-950 border border-slate-800/90 text-slate-200 rounded-bl-xs'
              }`}
            >
              {!msg.esUsuario && (
                <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-sky-400">
                    <FileText className="w-3.5 h-3.5" />
                    <span>Dictamen y Extracción Técnica de Pliego</span>
                  </div>
                  <button
                    onClick={() => copyToClipboard(msg.id, msg.texto)}
                    className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 text-[10px] flex items-center gap-1 cursor-pointer transition-colors"
                    title="Copiar texto extraído"
                  >
                    {copiedId === msg.id ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-400" />
                        <span className="text-emerald-400">Copiado</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>Copiar</span>
                      </>
                    )}
                  </button>
                </div>
              )}

              <div className="whitespace-pre-line space-y-2 font-sans">
                {msg.texto}
              </div>

              {msg.fecha && (
                <div className={`text-[9px] mt-2 text-right font-mono ${msg.esUsuario ? 'text-sky-200' : 'text-slate-500'}`}>
                  {msg.fecha}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Barra de Entrada / Consulta de Extracción */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <input 
            type="text" 
            id="txtChatInput" 
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Pide qué extraer del pliego (ej: 'extraer tolerancias de fundaciones', 'gálibo sobre gasoducto', 'multas')..." 
            className="w-full bg-slate-900 border border-slate-700/80 rounded-xl pl-4 pr-10 py-3.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 font-sans shadow-inner"
          />
        </div>
        <button 
          onClick={() => handleSend()}
          className="h-12 px-6 bg-sky-600 hover:bg-sky-500 text-white rounded-xl flex items-center justify-center font-bold text-xs shadow-lg active:scale-95 transition-all gap-1.5 cursor-pointer shrink-0"
        >
          <Send className="w-4 h-4" />
          <span>Extraer / Consultar</span>
        </button>
      </div>
    </div>
  );
};
