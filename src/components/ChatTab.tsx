import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Send, Trash2, Bot } from 'lucide-react';

export const ChatTab: React.FC = () => {
  const { chatMessages, sendChatMessage, clearChat } = useApp();
  const [inputText, setInputText] = useState('');

  const handleSend = () => {
    if (!inputText.trim()) return;
    const txt = inputText.trim();
    setInputText('');
    sendChatMessage(txt);
  };

  return (
    <div className="flex flex-col space-y-4">
      {/* Top Bar Chat */}
      <div className="bento-card p-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-white">Asistente IA de Obra (Gemini)</h4>
            <p className="text-[11px] text-slate-400">Conectado con pliegos, planos y respaldo R2</p>
          </div>
        </div>
        <button 
          onClick={clearChat}
          className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700/80 flex items-center gap-1 cursor-pointer"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Limpiar</span>
        </button>
      </div>

      {/* Mensajes */}
      <div className="bento-card p-4 space-y-3 min-h-[380px] max-h-[520px] overflow-y-auto">
        {chatMessages.map(msg => (
          <div 
            key={msg.id} 
            className={`flex flex-col ${msg.esUsuario ? 'items-end' : 'items-start'} w-full`}
          >
            <div 
              className={`p-3.5 rounded-2xl text-xs max-w-xl leading-relaxed shadow-sm ${
                msg.esUsuario 
                  ? 'bg-sky-600 text-white rounded-br-xs' 
                  : 'bg-slate-950 border border-slate-800 text-slate-200 rounded-bl-xs'
              }`}
            >
              <div className="whitespace-pre-line">{msg.texto}</div>
              {msg.fecha && (
                <div className={`text-[9px] mt-1 text-right font-mono ${msg.esUsuario ? 'text-sky-200' : 'text-slate-500'}`}>
                  {msg.fecha}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="flex items-center gap-2">
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
          placeholder="Pregunta sobre planos, pliegos, notas u órdenes..." 
          className="flex-1 bg-slate-900 border border-slate-700/80 rounded-xl px-4 py-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 font-sans"
        />
        <button 
          onClick={handleSend}
          className="h-11 px-5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl flex items-center justify-center font-bold text-xs shadow-lg active:scale-95 transition-all gap-1.5 cursor-pointer"
        >
          <Send className="w-4 h-4" />
          <span>Enviar</span>
        </button>
      </div>
    </div>
  );
};
