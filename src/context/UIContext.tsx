import React, { createContext, useContext, useState, useMemo, ReactNode } from 'react';
import { TabType } from '../types';

export interface UIContextType {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  selectedFrenteFilter: string;
  setSelectedFrenteFilter: (filter: string) => void;
  connectionStatus: string;
  setConnectionStatus: (status: string) => void;
  isSyncing: boolean;
  setIsSyncing: (syncing: boolean) => void;
  isSettingsOpen: boolean;
  setIsSettingsOpen: (open: boolean) => void;
  isHitosModalOpen: boolean;
  setIsHitosModalOpen: (open: boolean) => void;
  isPliegosModalOpen: boolean;
  setIsPliegosModalOpen: (open: boolean) => void;
  invitedEmailHint: string;
}

const UIContext = createContext<UIContextType | undefined>(undefined);

export const UIProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [selectedFrenteFilter, setSelectedFrenteFilter] = useState<string>('TODOS');
  const [connectionStatus, setConnectionStatus] = useState<string>('Conectado');
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  const [invitedEmailHint] = useState<string>(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      const raw = sp.get('invitar') || sp.get('inviteEmail') || '';
      return raw.trim().toLowerCase();
    } catch {
      return '';
    }
  });

  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      return Boolean((sp.get('invitar') || sp.get('inviteEmail') || '').trim());
    } catch {
      return false;
    }
  });
  const [isHitosModalOpen, setIsHitosModalOpen] = useState<boolean>(false);
  const [isPliegosModalOpen, setIsPliegosModalOpen] = useState<boolean>(false);

  const value = useMemo<UIContextType>(
    () => ({
      activeTab,
      setActiveTab,
      selectedFrenteFilter,
      setSelectedFrenteFilter,
      connectionStatus,
      setConnectionStatus,
      isSyncing,
      setIsSyncing,
      isSettingsOpen,
      setIsSettingsOpen,
      isHitosModalOpen,
      setIsHitosModalOpen,
      isPliegosModalOpen,
      setIsPliegosModalOpen,
      invitedEmailHint,
    }),
    [
      activeTab,
      selectedFrenteFilter,
      connectionStatus,
      isSyncing,
      isSettingsOpen,
      isHitosModalOpen,
      isPliegosModalOpen,
      invitedEmailHint,
    ]
  );

  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
};

export const useUI = () => {
  const context = useContext(UIContext);
  if (!context) throw new Error('useUI must be used within a UIProvider');
  return context;
};
