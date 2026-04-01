import { create } from 'zustand';
import { SavedChatSession, ChatGroup, ChatMessage, UploadedFile, InputCommand, ChatSettings } from '../types';
import { ACTIVE_CHAT_SESSION_ID_KEY } from '../constants/appConstants';
import { dbService } from '../utils/db';
import { logService, rehydrateSessionFiles } from '../utils/appUtils';
import type { SyncMessage } from '../utils/broadcastChannel';
import { broadcastSync, getSyncChannel } from '../utils/broadcastChannel';

// BroadcastChannel singleton is in utils/broadcastChannel.ts

// --- Non-reactive refs (for data that should NOT trigger re-renders) ---
const activeJobs = { current: new Map<string, AbortController>() };
const userScrolledUp = { current: false };
const fileDraftsRef = { current: {} as Record<string, UploadedFile[]> };
const sessionKeyMapRef = { current: new Map<string, string>() };
const localLoadingSessionIds = { current: new Set<string>() };

// --- Persistence queue to serialize writes and prevent race conditions ---
let persistQueue: Promise<void> = Promise.resolve();

function enqueuePersist(task: () => Promise<void>): void {
  const store = useChatStore;
  persistQueue = persistQueue.then(async () => {
    try {
      await task();
    } catch (e) {
      logService.error('Persist task failed', { error: e });
      store.getState().setPersistenceError('Failed to save data. Your changes may not be persisted.');
    }
  });
}

// --- Dirty tracking for multi-tab sync (tracks which types need refresh) ---
const dirtyFlags = { sessions: false, groups: false, settings: false };

function markDirty(type: 'sessions' | 'groups' | 'settings') {
  dirtyFlags[type] = true;
}

function consumeDirty() {
  const result = { ...dirtyFlags };
  dirtyFlags.sessions = false;
  dirtyFlags.groups = false;
  dirtyFlags.settings = false;
  return result;
}

// --- Persistence helpers ---
async function refreshSessionsFromDB(
  setSavedSessions: (updater: (prev: SavedChatSession[]) => SavedChatSession[]) => void,
  setActiveMessages: (msgs: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void,
  activeSessionId: string | null,
) {
  try {
    const metadataList = await dbService.getAllSessionMetadata();

    if (activeSessionId) {
      const fullActiveSession = await dbService.getSession(activeSessionId);
      if (fullActiveSession) {
        const rehydrated = rehydrateSessionFiles(fullActiveSession);
        setActiveMessages(rehydrated.messages);
      }
    }

    const sortedList = metadataList.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return b.timestamp - a.timestamp;
    });

    setSavedSessions(() => sortedList);
  } catch (e) {
    logService.error("Failed to refresh sessions from DB", { error: e });
  }
}

async function refreshGroupsFromDB(
  setSavedGroups: (updater: (prev: ChatGroup[]) => ChatGroup[]) => void,
) {
  try {
    const groups = await dbService.getAllGroups();
    setSavedGroups(() => groups);
  } catch (e) {
    logService.error("Failed to refresh groups from DB", { error: e });
  }
}

// --- Store types ---
interface ChatState {
  savedSessions: SavedChatSession[];
  savedGroups: ChatGroup[];
  activeSessionId: string | null;
  activeMessages: ChatMessage[];
  editingMessageId: string | null;
  editMode: 'update' | 'resend';
  commandedInput: InputCommand | null;
  loadingSessionIds: Set<string>;
  generatingTitleSessionIds: Set<string>;
  selectedFiles: UploadedFile[];
  appFileError: string | null;
  persistenceError: string | null;
  isAppProcessingFile: boolean;
  aspectRatio: string;
  imageSize: string;
  ttsMessageId: string | null;
  isSwitchingModel: boolean;
  isLoading: boolean;
  scrollContainerRef: HTMLElement | null;
}

interface ChatActions {
  // Session data
  setActiveSessionId: (id: string | null) => void;
  setActiveMessages: (msgs: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
  setSavedSessions: (updater: (prev: SavedChatSession[]) => SavedChatSession[]) => void;
  setSavedGroups: (updater: (prev: ChatGroup[]) => ChatGroup[]) => void;

  // Auxiliary state
  setEditingMessageId: (id: string | null) => void;
  setEditMode: (mode: 'update' | 'resend') => void;
  setCommandedInput: (cmd: InputCommand | null) => void;
  setLoadingSessionIds: (updater: (prev: Set<string>) => Set<string>) => void;
  setGeneratingTitleSessionIds: (updater: (prev: Set<string>) => Set<string>) => void;
  setSelectedFiles: (files: UploadedFile[] | ((prev: UploadedFile[]) => UploadedFile[])) => void;
  setAppFileError: (error: string | null) => void;
  setPersistenceError: (error: string | null) => void;
  setIsAppProcessingFile: (val: boolean) => void;
  setAspectRatio: (ratio: string) => void;
  setImageSize: (size: string) => void;
  setTtsMessageId: (id: string | null) => void;
  setIsSwitchingModel: (val: boolean) => void;
  setIsLoading: (val: boolean) => void;
  setScrollContainerRef: (ref: HTMLElement | null) => void;

  // Persistence
  updateAndPersistSessions: (updater: (prev: SavedChatSession[]) => SavedChatSession[], options?: { persist?: boolean }) => void;
  updateAndPersistGroups: (updater: (prev: ChatGroup[]) => ChatGroup[]) => void;
  refreshSessions: () => void;
  refreshGroups: () => void;
  setSessionLoading: (sessionId: string, isLoading: boolean) => void;

  // Multi-tab sync
  initMultiTabSync: () => () => void;

  // Refs accessor
  getRefs: () => {
    activeJobs: typeof activeJobs;
    userScrolledUp: typeof userScrolledUp;
    fileDraftsRef: typeof fileDraftsRef;
    sessionKeyMapRef: typeof sessionKeyMapRef;
  };
}

export const useChatStore = create<ChatState & ChatActions>((set, get) => ({
  savedSessions: [],
  savedGroups: [],
  activeSessionId: null,
  activeMessages: [],
  editingMessageId: null,
  editMode: 'resend',
  commandedInput: null,
  loadingSessionIds: new Set<string>(),
  generatingTitleSessionIds: new Set<string>(),
  selectedFiles: [],
  appFileError: null,
  persistenceError: null,
  isAppProcessingFile: false,
  aspectRatio: '1:1',
  imageSize: '1K',
  ttsMessageId: null,
  isSwitchingModel: false,
  isLoading: false,
  scrollContainerRef: null,

  setActiveSessionId: (id) => {
    set({ activeSessionId: id });

    // Sync to sessionStorage and URL
    if (id) {
      try { sessionStorage.setItem(ACTIVE_CHAT_SESSION_ID_KEY, id); } catch {}
      const targetPath = `/chat/${id}`;
      try {
        if (window.location.pathname !== targetPath) {
          if (window.location.pathname.startsWith('/chat/')) {
            window.history.replaceState({ sessionId: id }, '', targetPath);
          } else {
            window.history.pushState({ sessionId: id }, '', targetPath);
          }
        }
      } catch (e) { console.warn('Unable to update URL history:', e); }
    } else {
      try { sessionStorage.removeItem(ACTIVE_CHAT_SESSION_ID_KEY); } catch {}
      try {
        if (window.location.pathname !== '/' && !window.location.pathname.startsWith('/chat/')) {
          window.history.pushState({}, '', '/');
        }
      } catch (e) { console.warn('Unable to update URL history:', e); }
    }
  },

  setActiveMessages: (msgs) => {
    if (typeof msgs === 'function') {
      set(s => ({ activeMessages: msgs(s.activeMessages) }));
    } else {
      set({ activeMessages: msgs });
    }
  },

  setSavedSessions: (updater) => {
    set(s => ({ savedSessions: updater(s.savedSessions) }));
  },

  setSavedGroups: (updater) => {
    set(s => ({ savedGroups: updater(s.savedGroups) }));
  },

  setEditingMessageId: (id) => set({ editingMessageId: id }),
  setEditMode: (mode) => set({ editMode: mode }),
  setCommandedInput: (cmd) => set({ commandedInput: cmd }),
  setLoadingSessionIds: (updater) => set(s => ({ loadingSessionIds: updater(s.loadingSessionIds) })),
  setGeneratingTitleSessionIds: (updater) => set(s => ({ generatingTitleSessionIds: updater(s.generatingTitleSessionIds) })),
  setSelectedFiles: (files) => set(s => ({ selectedFiles: typeof files === 'function' ? files(s.selectedFiles) : files })),
  setAppFileError: (error) => set({ appFileError: error }),
  setPersistenceError: (error) => set({ persistenceError: error }),
  setIsAppProcessingFile: (val) => set({ isAppProcessingFile: val }),
  setAspectRatio: (ratio) => set({ aspectRatio: ratio }),
  setImageSize: (size) => set({ imageSize: size }),
  setTtsMessageId: (id) => set({ ttsMessageId: id }),
  setIsSwitchingModel: (val) => set({ isSwitchingModel: val }),
  setIsLoading: (val) => set({ isLoading: val }),
  setScrollContainerRef: (ref) => set({ scrollContainerRef: ref }),

  refreshSessions: () => {
    const { setSavedSessions, setActiveMessages, activeSessionId } = get();
    refreshSessionsFromDB(setSavedSessions, setActiveMessages, activeSessionId);
  },

  refreshGroups: () => {
    refreshGroupsFromDB(get().setSavedGroups);
  },

  setSessionLoading: (sessionId, isLoading) => {
    if (isLoading) {
      localLoadingSessionIds.current.add(sessionId);
    } else {
      localLoadingSessionIds.current.delete(sessionId);
    }

    get().setLoadingSessionIds(prev => {
      const next = new Set(prev);
      if (isLoading) next.add(sessionId);
      else next.delete(sessionId);
      return next;
    });

    if (sessionId === get().activeSessionId) {
      set({ isLoading });
    }

    broadcastSync({ type: 'SESSION_LOADING', sessionId, isLoading });
  },

  updateAndPersistSessions: (updater, options = {}) => {
    const { persist = true } = options;
    const { setSavedSessions, setActiveMessages } = get();

    // Capture snapshot of current state for this update
    const snapshotActiveId = get().activeSessionId;
    const snapshotActiveMsgs = get().activeMessages;

    setSavedSessions(prevMetadataSessions => {
      const virtualFullSessions = prevMetadataSessions.map(s => {
        if (s.id === snapshotActiveId) {
          return { ...s, messages: snapshotActiveMsgs };
        }
        return s;
      });

      const newFullSessions = updater(virtualFullSessions);

      if (newFullSessions.length !== prevMetadataSessions.length) {
        newFullSessions.sort((a, b) => {
          if (a.isPinned && !b.isPinned) return -1;
          if (!a.isPinned && b.isPinned) return 1;
          return b.timestamp - a.timestamp;
        });
      }

      if (snapshotActiveId) {
        const newActiveSession = newFullSessions.find(s => s.id === snapshotActiveId);
        if (newActiveSession && newActiveSession.messages !== snapshotActiveMsgs) {
          setActiveMessages(newActiveSession.messages);
        }
      }

      if (persist) {
        const newSessionsMap = new Map(newFullSessions.map(s => [s.id, s]));
        const prevSessionsMap = new Map(virtualFullSessions.map(s => [s.id, s]));
        const modifiedSessionIds: string[] = [];

        const sessionsToSave: SavedChatSession[] = [];
        newFullSessions.forEach(session => {
          const prevSession = prevSessionsMap.get(session.id);
          if (prevSession !== session) {
            sessionsToSave.push(session);
            modifiedSessionIds.push(session.id);
          }
        });

        const sessionIdsToDelete: string[] = [];
        prevMetadataSessions.forEach(session => {
          if (!newSessionsMap.has(session.id)) {
            sessionIdsToDelete.push(session.id);
          }
        });

        if (sessionsToSave.length > 0 || sessionIdsToDelete.length > 0) {
          // Serialize persist operations via queue to prevent race conditions
          enqueuePersist(async () => {
            const ops: Promise<void>[] = [
              ...sessionsToSave.map(s => dbService.saveSession(s)),
              ...sessionIdsToDelete.map(id => dbService.deleteSession(id)),
            ];
            await Promise.all(ops);
            if (modifiedSessionIds.length === 1) {
              broadcastSync({ type: 'SESSION_CONTENT_UPDATED', sessionId: modifiedSessionIds[0] });
            } else if (modifiedSessionIds.length > 0) {
              broadcastSync({ type: 'SESSIONS_UPDATED' });
            }
          });
        }
      }

      return newFullSessions.map(s => {
        if (s.messages && s.messages.length === 0) return s;
        const { messages, ...rest } = s;
        return { ...rest, messages: [] };
      });
    });
  },

  updateAndPersistGroups: (updater) => {
    const { setSavedGroups } = get();
    setSavedGroups(prevGroups => {
      const newGroups = updater(prevGroups);
      enqueuePersist(async () => {
        await dbService.setAllGroups(newGroups);
        broadcastSync({ type: 'GROUPS_UPDATED' });
      });
      return newGroups;
    });
  },

  initMultiTabSync: () => {
    const ch = getSyncChannel();
    const handler = (event: MessageEvent<SyncMessage>) => {
      const msg = event.data;
      const { setSavedSessions, setSavedGroups, setActiveMessages, setIsLoading, setLoadingSessionIds } = get();

      switch (msg.type) {
        case 'SESSIONS_UPDATED':
          if (document.hidden) { markDirty('sessions'); return; }
          refreshSessionsFromDB(setSavedSessions, setActiveMessages, get().activeSessionId);
          break;
        case 'GROUPS_UPDATED':
          if (document.hidden) { markDirty('groups'); return; }
          refreshGroupsFromDB(setSavedGroups);
          break;
        case 'SESSION_CONTENT_UPDATED':
          if (localLoadingSessionIds.current.has(msg.sessionId)) return;
          if (document.hidden) { markDirty('sessions'); return; }
          if (msg.sessionId === get().activeSessionId) {
            dbService.getSession(msg.sessionId).then(s => {
              if (s) {
                const rehydrated = rehydrateSessionFiles(s);
                setActiveMessages(rehydrated.messages);
                setSavedSessions(prev => prev.map(old => old.id === msg.sessionId ? { ...rehydrated, messages: [] } : old));
              }
            });
          } else {
            refreshSessionsFromDB(setSavedSessions, setActiveMessages, get().activeSessionId);
          }
          break;
        case 'SESSION_LOADING':
          setLoadingSessionIds(prev => {
            const next = new Set(prev);
            if (msg.isLoading) next.add(msg.sessionId);
            else next.delete(msg.sessionId);
            return next;
          });
          if (msg.sessionId === get().activeSessionId) {
            setIsLoading(msg.isLoading);
          }
          break;
      }
    };

    ch.addEventListener('message', handler);

    // Visibility change handler - refreshes all dirty types
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const dirty = consumeDirty();
        if (dirty.sessions || dirty.groups) {
          logService.info('[Sync] Tab visible, syncing pending updates from DB.');
          if (dirty.sessions) {
            const { setSavedSessions, setActiveMessages, activeSessionId } = get();
            refreshSessionsFromDB(setSavedSessions, setActiveMessages, activeSessionId);
          }
          if (dirty.groups) {
            refreshGroupsFromDB(get().setSavedGroups);
          }
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      ch.removeEventListener('message', handler);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  },

  getRefs: () => ({
    activeJobs,
    userScrolledUp,
    fileDraftsRef,
    sessionKeyMapRef,
  }),
}));

// --- Computed selectors ---
export const useActiveChat = () => {
  const activeSessionId = useChatStore(s => s.activeSessionId);
  const activeMessages = useChatStore(s => s.activeMessages);
  const savedSessions = useChatStore(s => s.savedSessions);
  const metadata = savedSessions.find(s => s.id === activeSessionId);
  if (metadata) return { ...metadata, messages: activeMessages };
  return undefined;
};
