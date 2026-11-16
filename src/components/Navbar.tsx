import React from 'react';
import { useApp } from '../context/AppContext';
import { TabType } from '../types';
import {
  BarChart3,
  FolderOpen,
  FileDiff,
  Clock,
  ClipboardList,
  FileText,
  Construction,
  NotebookPen,
  MessageSquare,
} from 'lucide-react';

interface NavItem {
  id: TabType;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Obras', Icon: BarChart3 },
  { id: 'planos', label: 'Planos', Icon: FolderOpen },
  { id: 'comparador', label: 'Comparar', Icon: FileDiff },
  { id: 'hitos', label: 'Hitos', Icon: Clock },
  { id: 'minutas', label: 'Minutas', Icon: ClipboardList },
  { id: 'informes', label: 'Informes', Icon: FileText },
  { id: 'interferencias', label: 'Cruces', Icon: Construction },
  { id: 'anotador', label: 'Anotador', Icon: NotebookPen },
  { id: 'chat', label: 'Chat IA', Icon: MessageSquare },
];

export const Navbar: React.FC = () => {
  const { activeTab, setActiveTab } = useApp();

  return (
    <nav className="fixed bottom-0 left-0 right-0 h-16 bg-[#0f172a]/95 border-t border-slate-800/90 flex items-center justify-around px-1 z-40 backdrop-blur-2xl">
      {NAV_ITEMS.map(({ id, label, Icon }) => {
        const isActive = activeTab === id;
        return (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex flex-col items-center justify-center min-w-[40px] px-1 py-1 transition-all cursor-pointer ${
              isActive
                ? 'text-sky-400 font-bold scale-105'
                : 'text-slate-400 hover:text-slate-200 font-medium'
            }`}
          >
            <Icon className="w-4 h-4 mb-1" />
            <span className="text-[9px] leading-none">{label}</span>
          </button>
        );
      })}
    </nav>
  );
};

