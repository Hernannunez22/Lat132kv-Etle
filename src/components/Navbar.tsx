import React from 'react';
import { useApp } from '../context/AppContext';
import { TabType } from '../types';

interface NavItem {
  id: TabType;
  label: string;
  icon: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Obras', icon: '📊' },
  { id: 'planos', label: 'Planos', icon: '📁' },
  { id: 'hitos', label: 'Hitos', icon: '⏳' },
  { id: 'informes', label: 'Informes', icon: '📄' },
  { id: 'interferencias', label: 'Cruces', icon: '🚧' },
  { id: 'anotador', label: 'Anotador', icon: '📓' },
  { id: 'chat', label: 'Chat IA', icon: '💬' },
];

export const Navbar: React.FC = () => {
  const { activeTab, setActiveTab } = useApp();

  return (
    <nav className="fixed bottom-0 left-0 right-0 h-16 bg-[#0f172a]/95 border-t border-slate-800/90 flex items-center justify-around px-1 z-40 backdrop-blur-2xl">
      {NAV_ITEMS.map(item => {
        const isActive = activeTab === item.id;
        return (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={`flex flex-col items-center justify-center w-12 py-1 transition-all cursor-pointer ${
              isActive 
                ? 'text-sky-400 font-bold scale-105' 
                : 'text-slate-400 hover:text-slate-200 font-medium'
            }`}
          >
            <span className="text-base mb-0.5">{item.icon}</span>
            <span className="text-[9px]">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
};
