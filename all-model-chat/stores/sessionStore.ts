import { create } from 'zustand';
import { AppSettings, SavedChatSession, ChatGroup, ChatSettings } from '../types';
import { DEFAULT_CHAT_SETTINGS, ACTIVE_CHAT_SESSION_ID_KEY } from '../constants/appConstants';
import { dbService } from '../utils/db';
import { createNewSession, rehydrateSessionFiles, logService, cleanupFilePreviewUrls } from '../utils/appUtils';
import { useChatStore } from './chatStore';

interface SessionState {
  isInitialized: boolean;
}

interface SessionActions {
  loadInitialData: (appSettings: AppSettings) => Promise<void>;
  startNewChat: (appSettings: AppSettings) => void;
  loadChatSession: (sessionId: string) => Promise<void>;
  handleDeleteChatHistorySession: (sessionId: string) => Promise<void>;
  handleRenameSession: (sessionId: string, newTitle: string) => void;
  handleTogglePinSession: (sessionId: string) => void;
  handleTogglePinCurrentSession: () => void;
  handleDuplicateSession: (sessionId: string) => void;
  handleAddNewGroup: (title: string) => void;
  handleDeleteGroup: (groupId: string) => void;
  handleRenameGroup: (groupId: string, newTitle: string) => void;
  handleMoveSessionToGroup: (sessionId: string, groupId: string | null) => void;
  handleToggleGroupExpansion: (groupId: string) => void;
  clearAllHistory: () => Promise<void>;
  clearCacheAndReload: () => Promise<void>;
}

export const useSessionStore = create<SessionState & SessionActions>((set, get) => ({
  isInitialized: false,

  loadInitialData: async (appSettings: AppSettings) => {
    try {
      logService.info('Attempting to load chat history metadata from IndexedDB.');

      const [metadataList, groups] = await Promise.all([
        dbService.getAllSessionMetadata(),
        dbService.getAllGroups()
      ]);

      const { setActiveSessionId, setActiveMessages, setSavedSessions, setSavedGroups, setSelectedFiles } = useChatStore.getState();
      const { getRefs } = useChatStore.getState();
      const refs = getRefs();

      let initialActiveId: string | null = null;
      const urlMatch = window.location.pathname.match(/^\/chat\/([^/]+)$/);
      const urlSessionId = urlMatch ? urlMatch[1] : null;

      if (urlSessionId && metadataList.some(s => s.id === urlSessionId)) {
        initialActiveId = urlSessionId;
      } else {
        const storedActiveId = sessionStorage.getItem(ACTIVE_CHAT_SESSION_ID_KEY);
        if (storedActiveId && metadataList.some(s => s.id === storedActiveId)) {
          initialActiveId = storedActiveId;
        }
      }

      if (initialActiveId) {
        const fullActiveSession = await dbService.getSession(initialActiveId);
        if (fullActiveSession) {
          logService.info(`Loaded full content for active session: ${initialActiveId}`);
          const rehydrated = rehydrateSessionFiles(fullActiveSession);
          setActiveMessages(rehydrated.messages);
          setActiveSessionId(initialActiveId);
          const draftFiles = refs.fileDraftsRef.current[initialActiveId] || [];
          setSelectedFiles(draftFiles);
        } else {
          initialActiveId = null;
        }
      }

      const sortedList = metadataList.sort((a, b) => {
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        return b.timestamp - a.timestamp;
      });

      setSavedSessions(() => sortedList);
      setSavedGroups(() => groups.map(g => ({ ...g, isExpanded: g.isExpanded ?? true })));

      if (!initialActiveId) {
        const mostRecent = sortedList[0];
        let reused = false;

        if (mostRecent) {
          const fullSession = await dbService.getSession(mostRecent.id);
          if (fullSession && fullSession.messages.length === 0 && !fullSession.settings?.systemInstruction) {
            logService.info(`Reusing empty recent session: ${mostRecent.id}`);
            const rehydrated = rehydrateSessionFiles(fullSession);
            setActiveMessages(rehydrated.messages);
            setActiveSessionId(rehydrated.id);
            const draftFiles = refs.fileDraftsRef.current[rehydrated.id] || [];
            setSelectedFiles(draftFiles);
            reused = true;
          }
        }

        if (!reused) {
          logService.info('No active session found or empty session to reuse, starting fresh chat.');
          get().startNewChat(appSettings);
        }
      }

      set({ isInitialized: true });
    } catch (error) {
      logService.error("Error loading chat history:", error);
      get().startNewChat(appSettings);
      set({ isInitialized: true });
    }
  },

  startNewChat: (appSettings: AppSettings) => {
    const { setActiveSessionId, setActiveMessages, setSavedSessions, setSelectedFiles, setEditingMessageId, setCommandedInput, updateAndPersistSessions } = useChatStore.getState();
    const { getRefs } = useChatStore.getState();
    const refs = getRefs();
    const savedSessions = useChatStore.getState().savedSessions;
    const activeSessionId = useChatStore.getState().activeSessionId;

    const activeChat = savedSessions.find(s => s.id === activeSessionId);
    if (activeChat && activeChat.messages.length === 0 && !activeChat.settings?.systemInstruction) {
      logService.info('Already on an empty chat, reusing session.');
      setCommandedInput({ text: '', id: Date.now(), mode: 'replace' });
      setSelectedFiles([]);
      setEditingMessageId(null);
      setTimeout(() => {
        document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Chat message input"]')?.focus();
      }, 0);
      return;
    }

    logService.info('Starting new chat session.');
    refs.userScrolledUp.current = false;

    if (activeSessionId) {
      refs.fileDraftsRef.current[activeSessionId] = useChatStore.getState().selectedFiles;
      if (activeChat && activeChat.messages) {
        activeChat.messages.forEach(msg => cleanupFilePreviewUrls(msg.files));
      }
    }

    let settingsForNewChat: ChatSettings = { ...DEFAULT_CHAT_SETTINGS, ...appSettings };
    const templateSession = savedSessions.length > 0 ? savedSessions[0] : undefined;
    if (templateSession) {
      settingsForNewChat = {
        ...settingsForNewChat,
        modelId: templateSession.settings.modelId,
        isGoogleSearchEnabled: templateSession.settings.isGoogleSearchEnabled,
        isCodeExecutionEnabled: templateSession.settings.isCodeExecutionEnabled,
        isUrlContextEnabled: templateSession.settings.isUrlContextEnabled,
        isDeepSearchEnabled: templateSession.settings.isDeepSearchEnabled,
        thinkingBudget: templateSession.settings.thinkingBudget,
        thinkingLevel: templateSession.settings.thinkingLevel,
        ttsVoice: templateSession.settings.ttsVoice,
      };
    }

    const newSession = createNewSession(settingsForNewChat);
    setActiveMessages([]);
    setActiveSessionId(newSession.id);
    updateAndPersistSessions(prev => [newSession, ...prev]);
    setSelectedFiles([]);
    setEditingMessageId(null);

    setTimeout(() => {
      document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Chat message input"]')?.focus();
    }, 0);
  },

  loadChatSession: async (sessionId: string) => {
    logService.info(`Loading chat session: ${sessionId}`);
    const { setActiveSessionId, setActiveMessages, setSavedSessions, setSelectedFiles, setEditingMessageId } = useChatStore.getState();
    const { getRefs } = useChatStore.getState();
    const refs = getRefs();
    const activeSessionId = useChatStore.getState().activeSessionId;
    const savedSessions = useChatStore.getState().savedSessions;
    const activeChat = savedSessions.find(s => s.id === activeSessionId);

    refs.userScrolledUp.current = false;

    if (activeSessionId && activeSessionId !== sessionId) {
      refs.fileDraftsRef.current[activeSessionId] = useChatStore.getState().selectedFiles;
      if (activeChat && activeChat.messages) {
        activeChat.messages.forEach(msg => cleanupFilePreviewUrls(msg.files));
      }
    }

    try {
      const sessionToLoad = await dbService.getSession(sessionId);
      if (sessionToLoad) {
        const rehydrated = rehydrateSessionFiles(sessionToLoad);
        setActiveMessages(rehydrated.messages);
        setActiveSessionId(rehydrated.id);

        setSavedSessions(prev => {
          const exists = prev.some(s => s.id === sessionId);
          if (exists) {
            const { messages, ...metadata } = rehydrated;
            return prev.map(s => s.id === sessionId ? { ...s, ...metadata, messages: [] } : s);
          } else {
            const { messages, ...metadata } = rehydrated;
            return [{ ...metadata, messages: [] } as SavedChatSession, ...prev];
          }
        });

        const draftFiles = refs.fileDraftsRef.current[sessionId] || [];
        setSelectedFiles(draftFiles);
        setEditingMessageId(null);
        setTimeout(() => {
          document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Chat message input"]')?.focus();
        }, 0);
      } else {
        logService.warn(`Session ${sessionId} not found. Starting new chat.`);
        const chatState = useChatStore.getState();
        const activeSettings = chatState.savedSessions.find(s => s.id === chatState.activeSessionId)?.settings;
        get().startNewChat(activeSettings || DEFAULT_CHAT_SETTINGS as any);
      }
    } catch (error) {
      logService.error("Error loading chat session:", error);
      const chatState = useChatStore.getState();
      const activeSettings = chatState.savedSessions.find(s => s.id === chatState.activeSessionId)?.settings;
      get().startNewChat(activeSettings || DEFAULT_CHAT_SETTINGS as any);
    }
  },

  handleDeleteChatHistorySession: async (sessionId: string) => {
    const { updateAndPersistSessions, setActiveSessionId, setActiveMessages, setSelectedFiles } = useChatStore.getState();
    const { getRefs } = useChatStore.getState();
    const refs = getRefs();
    const activeSessionId = useChatStore.getState().activeSessionId;

    await updateAndPersistSessions(prev => prev.filter(s => s.id !== sessionId));

    if (activeSessionId === sessionId) {
      const remaining = useChatStore.getState().savedSessions;
      if (remaining.length > 0) {
        get().loadChatSession(remaining[0].id);
      } else {
        setActiveSessionId(null);
        setActiveMessages([]);
        setSelectedFiles([]);
      }
    }

    // Cleanup drafts
    delete refs.fileDraftsRef.current[sessionId];
  },

  handleRenameSession: (sessionId: string, newTitle: string) => {
    const { updateAndPersistSessions } = useChatStore.getState();
    updateAndPersistSessions(prev =>
      prev.map(s => s.id === sessionId ? { ...s, title: newTitle } : s)
    );
  },

  handleTogglePinSession: (sessionId: string) => {
    const { updateAndPersistSessions } = useChatStore.getState();
    updateAndPersistSessions(prev =>
      prev.map(s => s.id === sessionId ? { ...s, isPinned: !s.isPinned } : s)
    );
  },

  handleTogglePinCurrentSession: () => {
    const activeSessionId = useChatStore.getState().activeSessionId;
    if (activeSessionId) {
      get().handleTogglePinSession(activeSessionId);
    }
  },

  handleDuplicateSession: async (sessionId: string) => {
    const { updateAndPersistSessions, activeMessages, activeSessionId } = useChatStore.getState();
    // Load the full session from DB to get actual messages
    const fullSession = await dbService.getSession(sessionId);
    const sourceMessages = fullSession?.messages ?? [];
    // If duplicating the active session, use in-memory messages which are more current
    const messages = sessionId === activeSessionId ? activeMessages : sourceMessages;
    const settings = fullSession?.settings ?? useChatStore.getState().savedSessions.find(s => s.id === sessionId)?.settings;

    if (!settings) return;

    updateAndPersistSessions(prev => {
      const newSession: SavedChatSession = {
        id: crypto.randomUUID(),
        title: `${fullSession?.title ?? 'Untitled'} (copy)`,
        timestamp: Date.now(),
        settings,
        messages,
        isPinned: false,
      };
      return [newSession, ...prev];
    });
  },

  handleAddNewGroup: (title?: string) => {
    const { updateAndPersistGroups } = useChatStore.getState();
    updateAndPersistGroups(prev => [
      ...prev,
      { id: crypto.randomUUID(), title, timestamp: Date.now(), isPinned: false, isExpanded: true }
    ]);
  },

  handleDeleteGroup: (groupId: string) => {
    const { updateAndPersistGroups, updateAndPersistSessions } = useChatStore.getState();
    updateAndPersistSessions(prev =>
      prev.map(s => s.groupId === groupId ? { ...s, groupId: null } : s)
    );
    updateAndPersistGroups(prev => prev.filter(g => g.id !== groupId));
  },

  handleRenameGroup: (groupId: string, newTitle: string) => {
    const { updateAndPersistGroups } = useChatStore.getState();
    updateAndPersistGroups(prev =>
      prev.map(g => g.id === groupId ? { ...g, title: newTitle } : g)
    );
  },

  handleMoveSessionToGroup: (sessionId: string, groupId: string | null) => {
    const { updateAndPersistSessions } = useChatStore.getState();
    updateAndPersistSessions(prev =>
      prev.map(s => s.id === sessionId ? { ...s, groupId } : s)
    );
  },

  handleToggleGroupExpansion: (groupId: string) => {
    const { updateAndPersistGroups } = useChatStore.getState();
    updateAndPersistGroups(prev =>
      prev.map(g => g.id === groupId ? { ...g, isExpanded: !g.isExpanded } : g)
    );
  },

  clearAllHistory: async () => {
    await dbService.clearAllData();
    const { setActiveSessionId, setActiveMessages, setSavedSessions, setSavedGroups, setSelectedFiles, setEditingMessageId } = useChatStore.getState();
    setActiveSessionId(null);
    setActiveMessages([]);
    setSavedSessions(() => []);
    setSavedGroups(() => []);
    setSelectedFiles([]);
    setEditingMessageId(null);
  },

  clearCacheAndReload: async () => {
    try {
      await dbService.clearAllData();
      localStorage.clear();
      sessionStorage.clear();
    } catch (e) {
      console.error('Failed to clear cache:', e);
    }
    window.location.reload();
  },
}));
