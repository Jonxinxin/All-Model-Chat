
import { useMemo } from 'react';
import { useAppLogic } from '../useAppLogic';
import { useUIStore } from '../../../stores/uiStore';
import { getShortcutDisplay } from '../../../utils/shortcutUtils';

export const useSidebarProps = (logic: ReturnType<typeof useAppLogic>) => {
  const {
    appSettings,
    chatState,
    currentTheme,
    language,
    t,
    setIsExportModalOpen,
  } = logic;

  // UI state from Zustand store
  const isHistorySidebarOpen = useUIStore(s => s.isHistorySidebarOpen);
  const setIsHistorySidebarOpen = useUIStore(s => s.setIsHistorySidebarOpen);
  const setIsSettingsModalOpen = useUIStore(s => s.setIsSettingsModalOpen);
  const setIsPreloadedMessagesModalOpen = useUIStore(s => s.setIsPreloadedMessagesModalOpen);

  return useMemo(() => ({
    isOpen: isHistorySidebarOpen,
    onToggle: () => setIsHistorySidebarOpen(prev => !prev),
    sessions: chatState.savedSessions,
    groups: chatState.savedGroups,
    activeSessionId: chatState.activeSessionId,
    loadingSessionIds: chatState.loadingSessionIds,
    generatingTitleSessionIds: chatState.generatingTitleSessionIds,
    onSelectSession: (id: string) => { chatState.loadChatSession(id); },
    onNewChat: () => chatState.startNewChat(),
    onDeleteSession: chatState.handleDeleteChatHistorySession,
    onRenameSession: chatState.handleRenameSession,
    onTogglePinSession: chatState.handleTogglePinCurrentSession,
    onDuplicateSession: chatState.handleDuplicateSession,
    onOpenExportModal: () => setIsExportModalOpen(true),
    onAddNewGroup: chatState.handleAddNewGroup,
    onDeleteGroup: chatState.handleDeleteGroup,
    onRenameGroup: chatState.handleRenameGroup,
    onMoveSessionToGroup: chatState.handleMoveSessionToGroup,
    onToggleGroupExpansion: chatState.handleToggleGroupExpansion,
    onOpenSettingsModal: () => setIsSettingsModalOpen(true),
    onOpenScenariosModal: () => setIsPreloadedMessagesModalOpen(true),
    t,
    themeId: currentTheme.id,
    language,
    newChatShortcut: getShortcutDisplay('general.newChat', appSettings),
  }), [
    isHistorySidebarOpen,
    setIsHistorySidebarOpen,
    setIsSettingsModalOpen,
    setIsPreloadedMessagesModalOpen,
    chatState.savedSessions,
    chatState.savedGroups,
    chatState.activeSessionId,
    chatState.loadingSessionIds,
    chatState.generatingTitleSessionIds,
    chatState.loadChatSession,
    chatState.startNewChat,
    chatState.handleDeleteChatHistorySession,
    chatState.handleRenameSession,
    chatState.handleTogglePinCurrentSession,
    chatState.handleDuplicateSession,
    chatState.handleAddNewGroup,
    chatState.handleDeleteGroup,
    chatState.handleRenameGroup,
    chatState.handleMoveSessionToGroup,
    chatState.handleToggleGroupExpansion,
    currentTheme,
    language,
    t,
    appSettings,
    setIsExportModalOpen
  ]);
};
