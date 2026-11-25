import React, { useEffect, useRef } from 'react';
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
  const activeBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    activeBtnRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'center',
    });
  }, [activeTab]);

  return (
    <nav
      aria-label="Navegación principal"
      className="fixed bottom-0 inset-x-0 z-50 h-16 bg-[#0f172a]/95 border-t border-slate-800/90 flex items-center justify-start md:justify-around gap-1 px-2 overflow-x-auto flex-nowrap no-scrollbar scroll-smooth backdrop-blur-2xl"
    >
      {NAV_ITEMS.map(({ id, label, Icon }) => {
        const isActive = activeTab === id;
        return (
          <button
            key={id}
            ref={isActive ? activeBtnRef : undefined}
            type="button"
            onClick={() => setActiveTab(id)}
            aria-current={isActive ? 'page' : undefined}
            className={`flex flex-col items-center justify-center min-w-[68px] shrink-0 px-2 py-1.5 rounded-xl transition-all cursor-pointer whitespace-nowrap ${
              isActive
                ? 'text-sky-400 font-bold bg-sky-500/10'
                : 'text-slate-400 hover:text-slate-200 font-medium'
            }`}
          >
            <Icon className="w-4 h-4 mb-1 shrink-0" />
            <span className="text-[10px] leading-none whitespace-nowrap">{label}</span>
          </button>
        );
      })}
    </nav>
  );
};

