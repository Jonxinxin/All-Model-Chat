


import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useSettingsStore, useCurrentTheme } from '../../stores/settingsStore';
import { useUIStore } from '../../stores/uiStore';
import { useChat } from '../chat/useChat';
import { useAppEvents } from '../core/useAppEvents';
import { usePictureInPicture } from '../core/usePictureInPicture';
import { useDataManagement } from '../useDataManagement';
import { getTranslator, applyThemeToDocument, logService } from '../../utils/appUtils';

// Import new modularized hooks
import { useAppInitialization } from './logic/useAppInitialization';
import { useAppTitle } from './logic/useAppTitle';
import { useAppHandlers } from './logic/useAppHandlers';

export const useAppLogic = () => {
  // Read from Zustand store instead of local hook
  const appSettings = useSettingsStore(s => s.appSettings);
  const setAppSettings = useSettingsStore(s => s.setAppSettings);
  const language = useSettingsStore(s => s.language);
  const currentTheme = useCurrentTheme();

  // Read UI state from Zustand store
  const isSettingsModalOpen = useUIStore(s => s.isSettingsModalOpen);
  const isPreloadedMessagesModalOpen = useUIStore(s => s.isPreloadedMessagesModalOpen);
  const setIsHistorySidebarOpen = useUIStore(s => s.setIsHistorySidebarOpen);
  const isLogViewerOpen = useUIStore(s => s.isLogViewerOpen);
  const setIsLogViewerOpen = useUIStore(s => s.setIsLogViewerOpen);
  const setIsSettingsModalOpen = useUIStore(s => s.setIsSettingsModalOpen);
  const setIsPreloadedMessagesModalOpen = useUIStore(s => s.setIsPreloadedMessagesModalOpen);
  const isHistorySidebarOpen = useUIStore(s => s.isHistorySidebarOpen);
  const handleTouchStart = useUIStore(s => s.handleTouchStart);
  const handleTouchEnd = useUIStore(s => s.handleTouchEnd);
  const sidePanelContent = useUIStore(s => s.sidePanelContent);
  const openSidePanel = useUIStore(s => s.openSidePanel);
  const closeSidePanel = useUIStore(s => s.closeSidePanel);

  const t = useMemo(() => getTranslator(language), [language]);

  // 1. Initialization
  useAppInitialization(appSettings);

  const chatState = useChat(appSettings, setAppSettings, language);

  // 2. Side Panel Logic — now reads from store directly
  const handleOpenSidePanel = openSidePanel;
  const handleCloseSidePanel = closeSidePanel;

  // 3. PiP Logic
  const pipState = usePictureInPicture(setIsHistorySidebarOpen);

  // Sync styles to PiP window when theme changes
  useEffect(() => {
    if (pipState.pipWindow && pipState.pipWindow.document) {
        applyThemeToDocument(pipState.pipWindow.document, currentTheme, appSettings);
    }
  }, [pipState.pipWindow, currentTheme, appSettings]);

  // 4. App Events (Shortcuts, PWA)
  const eventsState = useAppEvents({
    appSettings,
    startNewChat: chatState.startNewChat,
    handleClearCurrentChat: chatState.handleClearCurrentChat,
    currentChatSettings: chatState.currentChatSettings,
    handleSelectModelInHeader: chatState.handleSelectModelInHeader,
    isSettingsModalOpen,
    isPreloadedMessagesModalOpen,
    setIsLogViewerOpen,
    onTogglePip: pipState.togglePip,
    isPipSupported: pipState.isPipSupported,
    pipWindow: pipState.pipWindow,
    isLoading: chatState.isLoading,
    onStopGenerating: chatState.handleStopGenerating
  });

  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportStatus, setExportStatus] = useState<'idle' | 'exporting'>('idle');
  
  const activeChat = chatState.savedSessions.find(s => s.id === chatState.activeSessionId);
  const sessionTitle = activeChat?.title || t('newChat');

  // 5. Title & Timer Logic
  useAppTitle({
      isLoading: chatState.isLoading,
      messages: chatState.messages,
      language,
      sessionTitle
  });

  // 6. Data Management
  const dataManagement = useDataManagement({
    appSettings,
    setAppSettings,
    savedSessions: chatState.savedSessions,
    updateAndPersistSessions: chatState.updateAndPersistSessions,
    savedGroups: chatState.savedGroups,
    updateAndPersistGroups: chatState.updateAndPersistGroups,
    savedScenarios: chatState.savedScenarios,
    handleSaveAllScenarios: chatState.handleSaveAllScenarios,
    t,
    activeChat,
    scrollContainerRef: chatState.scrollContainerRef,
    currentTheme,
    language,
  });

  // Use ref to access exportChatLogic without adding dataManagement to deps
  const exportChatLogicRef = useRef(dataManagement.exportChatLogic);
  exportChatLogicRef.current = dataManagement.exportChatLogic;

  const handleExportChat = useCallback(async (format: 'png' | 'html' | 'txt' | 'json') => {
    if (!activeChat) return;
    setExportStatus('exporting');
    try {
      await exportChatLogicRef.current(format);
    } catch (error) {
        logService.error(`Chat export failed (format: ${format})`, { error });
        alert(`Export failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
        setExportStatus('idle');
        setIsExportModalOpen(false);
    }
  }, [activeChat]);

  // 7. Core Handlers
  const {
      handleSaveSettings,
      handleLoadCanvasPromptAndSave,
      handleToggleBBoxMode,
      handleToggleGuideMode,
      handleSuggestionClick,
      handleSetThinkingLevel,
      getCurrentModelDisplayName
  } = useAppHandlers({
      setAppSettings,
      activeSessionId: chatState.activeSessionId,
      setCurrentChatSettings: chatState.setCurrentChatSettings,
      currentChatSettings: chatState.currentChatSettings,
      appSettings,
      chatState,
      t
  });

  return {
    appSettings, setAppSettings, currentTheme, language, t,
    chatState,
    // UI state (from store)
    isSettingsModalOpen, setIsSettingsModalOpen,
    isPreloadedMessagesModalOpen, setIsPreloadedMessagesModalOpen,
    isHistorySidebarOpen, setIsHistorySidebarOpen,
    isLogViewerOpen, setIsLogViewerOpen,
    handleTouchStart, handleTouchEnd,
    // PiP
    pipState, eventsState, dataManagement,
    sidePanelContent, handleOpenSidePanel, handleCloseSidePanel,
    isExportModalOpen, setIsExportModalOpen, exportStatus, handleExportChat,
    activeChat, sessionTitle,
    handleSaveSettings,
    handleLoadCanvasPromptAndSave,
    handleToggleBBoxMode,
    handleToggleGuideMode,
    handleSuggestionClick,
    handleSetThinkingLevel,
    getCurrentModelDisplayName
  };
};