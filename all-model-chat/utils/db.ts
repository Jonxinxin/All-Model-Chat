import { AppSettings, ChatGroup, SavedChatSession, SavedScenario } from '../types';
import { LogEntry } from '../services/logService';

const DB_NAME = 'AllModelChatDB';
const DB_VERSION = 4;

const SESSIONS_STORE = 'sessions';
const GROUPS_STORE = 'groups';
const SCENARIOS_STORE = 'scenarios';
const KEY_VALUE_STORE = 'keyValueStore';
const LOGS_STORE = 'logs';

const LOCK_NAME = 'all_model_chat_db_write_lock';

let dbPromise: Promise<IDBDatabase> | null = null;

const getDb = (): Promise<IDBDatabase> => {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onerror = () => {
        console.error('IndexedDB error:', request.error);
        dbPromise = null;
        reject(request.error);
      };
      request.onsuccess = () => {
        const db = request.result;
        // Reset cached promise if connection is unexpectedly closed
        db.onclose = () => { dbPromise = null; };
        db.onerror = () => { dbPromise = null; };
        resolve(db);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        const oldVersion = event.oldVersion;

        // v1: initial creation
        if (oldVersion < 1) {
          if (!db.objectStoreNames.contains(SESSIONS_STORE)) {
            db.createObjectStore(SESSIONS_STORE, { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains(GROUPS_STORE)) {
            db.createObjectStore(GROUPS_STORE, { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains(SCENARIOS_STORE)) {
            db.createObjectStore(SCENARIOS_STORE, { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains(KEY_VALUE_STORE)) {
            db.createObjectStore(KEY_VALUE_STORE);
          }
        }

        // v3: add logs store
        if (oldVersion < 3) {
          if (!db.objectStoreNames.contains(LOGS_STORE)) {
            const logStore = db.createObjectStore(LOGS_STORE, { keyPath: 'id', autoIncrement: true });
            logStore.createIndex('timestamp', 'timestamp', { unique: false });
          }
        }

        // v4: add title index on sessions for search performance
        if (oldVersion < 4) {
          if (db.objectStoreNames.contains(SESSIONS_STORE)) {
            const sessionStore = (event.target as IDBOpenDBRequest).transaction!.objectStore(SESSIONS_STORE);
            if (!sessionStore.indexNames.contains('title')) {
              sessionStore.createIndex('title', 'title', { unique: false });
            }
          }
        }
      };
    });
  }
  return dbPromise;
};

const requestToPromise = <T>(request: IDBRequest<T>): Promise<T> => {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const transactionToPromise = (tx: IDBTransaction): Promise<void> => {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
};

/**
 * Ensures that write operations across tabs do not interleave and cause data loss.
 */
async function withWriteLock<T>(callback: () => Promise<T>): Promise<T> {
    if ('locks' in navigator) {
        return navigator.locks.request(LOCK_NAME, { mode: 'exclusive' }, callback);
    }
    return callback();
}

async function getItem<T>(storeName: string, key: string): Promise<T | undefined> {
  const db = await getDb();
  return requestToPromise(db.transaction(storeName, 'readonly').objectStore(storeName).get(key));
}

async function getAll<T>(storeName: string): Promise<T[]> {
  const db = await getDb();
  return requestToPromise(db.transaction(storeName, 'readonly').objectStore(storeName).getAll());
}

/**
 * Atomic setAll: put all new values first, then delete any stale keys.
 * This avoids the clear()-then-put() data loss window.
 */
async function setAll<T extends { id: string }>(storeName: string, values: T[]): Promise<void> {
  return withWriteLock(async () => {
    const db = await getDb();
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);

    // Put all new values first
    const newIds = new Set<string>();
    values.forEach(value => {
      newIds.add(value.id);
      store.put(value);
    });

    // Delete stale keys that are no longer in the new set
    return new Promise<void>((resolve, reject) => {
      const cursorRequest = store.openCursor();
      cursorRequest.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          if (!newIds.has(cursor.key as string)) {
            cursor.delete();
          }
          cursor.continue();
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  });
}

async function put<T>(storeName: string, value: T): Promise<void> {
  return withWriteLock(async () => {
    const db = await getDb();
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put(value);
    return transactionToPromise(tx);
  });
}

async function deleteItem(storeName: string, key: string): Promise<void> {
  return withWriteLock(async () => {
      const db = await getDb();
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).delete(key);
      return transactionToPromise(tx);
  });
}

async function getKeyValue<T>(key: string): Promise<T | undefined> {
  const db = await getDb();
  return requestToPromise(db.transaction(KEY_VALUE_STORE, 'readonly').objectStore(KEY_VALUE_STORE).get(key));
}

async function setKeyValue<T>(key: string, value: T): Promise<void> {
  return withWriteLock(async () => {
      const db = await getDb();
      const tx = db.transaction(KEY_VALUE_STORE, 'readwrite');
      tx.objectStore(KEY_VALUE_STORE).put(value, key);
      return transactionToPromise(tx);
  });
}

/** Check storage quota and estimate usage */
async function estimateStorageUsage(): Promise<{ usage: number; quota: number }> {
  if (navigator.storage && navigator.storage.estimate) {
    const est = await navigator.storage.estimate();
    return { usage: est.usage ?? 0, quota: est.quota ?? Infinity };
  }
  return { usage: 0, quota: Infinity };
}

/** Check if there's enough quota to store data of a given size */
async function checkStorageAvailable(bytesNeeded: number): Promise<boolean> {
  const { usage, quota } = await estimateStorageUsage();
  // Leave 10MB buffer
  return (usage + bytesNeeded) < (quota - 10 * 1024 * 1024);
}

export const dbService = {
  getAllSessions: () => getAll<SavedChatSession>(SESSIONS_STORE),

  getSession: (id: string) => getItem<SavedChatSession>(SESSIONS_STORE, id),

  getAllSessionMetadata: async (): Promise<SavedChatSession[]> => {
      const db = await getDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(SESSIONS_STORE, 'readonly');
        const store = tx.objectStore(SESSIONS_STORE);
        const request = store.openCursor();
        const results: SavedChatSession[] = [];

        request.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
          if (cursor) {
            const { messages, ...rest } = cursor.value;
            results.push({ ...rest, messages: [] });
            cursor.continue();
          } else {
            resolve(results);
          }
        };
        request.onerror = () => reject(request.error);
      });
  },

  searchSessions: async (query: string, signal?: AbortSignal): Promise<string[]> => {
      const db = await getDb();
      const lowerQuery = query.toLowerCase();
      return new Promise((resolve, reject) => {
          if (signal?.aborted) { reject(new DOMException('Aborted', 'AbortError')); return; }

          const tx = db.transaction(SESSIONS_STORE, 'readonly');
          const store = tx.objectStore(SESSIONS_STORE);

          // Use title index for fast title matching
          const hasTitleIndex = store.indexNames.contains('title');
          const results: string[] = [];
          let titleResults: Set<string> | null = null;

          const onAbort = () => {
              tx.abort();
              cleanup();
              reject(new DOMException('Aborted', 'AbortError'));
          };

          const cleanup = () => {
              signal?.removeEventListener('abort', onAbort);
          };

          signal?.addEventListener('abort', onAbort, { once: true });

          // Phase 1: Fast title search via index (if available)
          if (hasTitleIndex) {
            titleResults = new Set<string>();
            const index = store.index('title');
            const titleRequest = index.openCursor();
            titleRequest.onsuccess = (event) => {
              if (signal?.aborted) { cleanup(); return; }
              const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
              if (cursor) {
                if (cursor.value.title?.toLowerCase().includes(lowerQuery)) {
                  titleResults!.add(cursor.value.id);
                  results.push(cursor.value.id);
                }
                cursor.continue();
              } else {
                // Phase 2: Full scan for message content
                scanMessages(store, titleResults!);
              }
            };
            titleRequest.onerror = () => { cleanup(); reject(titleRequest.error); };
          } else {
            scanMessages(store, null);
          }

          function scanMessages(store: IDBObjectStore, excludeIds: Set<string> | null) {
            const request = store.openCursor();
            request.onsuccess = (event) => {
                if (signal?.aborted) { cleanup(); return; }
                const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
                if (cursor) {
                    const session = cursor.value as SavedChatSession;
                    if (!excludeIds || !excludeIds.has(session.id)) {
                      const titleMatch = session.title?.toLowerCase().includes(lowerQuery);
                      const contentMatch = session.messages?.some(m =>
                          (m.content && m.content.toLowerCase().includes(lowerQuery)) ||
                          (m.thoughts && m.thoughts.toLowerCase().includes(lowerQuery))
                      );

                      if (titleMatch || contentMatch) {
                          results.push(session.id);
                      }
                    }
                    cursor.continue();
                } else {
                    cleanup();
                    resolve(results);
                }
            };
            request.onerror = () => { cleanup(); reject(request.error); };
          }
      });
  },

  setAllSessions: (sessions: SavedChatSession[]) => setAll<SavedChatSession>(SESSIONS_STORE, sessions),
  saveSession: (session: SavedChatSession) => put<SavedChatSession>(SESSIONS_STORE, session),
  deleteSession: (id: string) => deleteItem(SESSIONS_STORE, id),

  getAllGroups: () => getAll<ChatGroup>(GROUPS_STORE),
  setAllGroups: (groups: ChatGroup[]) => setAll<ChatGroup>(GROUPS_STORE, groups),

  getAllScenarios: () => getAll<SavedScenario>(SCENARIOS_STORE),
  setAllScenarios: (scenarios: SavedScenario[]) => setAll<SavedScenario>(SCENARIOS_STORE, scenarios),

  getAppSettings: () => getKeyValue<AppSettings>('appSettings'),
  setAppSettings: (settings: AppSettings) => setKeyValue<AppSettings>('appSettings', settings),

  getActiveSessionId: () => getKeyValue<string | null>('activeSessionId'),
  setActiveSessionId: (id: string | null) => setKeyValue<string | null>('activeSessionId', id),

  estimateStorageUsage,
  checkStorageAvailable,

  addLogs: (logs: LogEntry[]) => withWriteLock(async () => {
      const db = await getDb();
      const tx = db.transaction(LOGS_STORE, 'readwrite');
      const store = tx.objectStore(LOGS_STORE);
      logs.forEach(log => store.add(log));
      return transactionToPromise(tx);
  }),
  getLogs: (limit = 500, offset = 0): Promise<LogEntry[]> => getDb().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction(LOGS_STORE, 'readonly');
      const store = tx.objectStore(LOGS_STORE);
      const index = store.index('timestamp');
      const request = index.openCursor(null, 'prev');
      const results: LogEntry[] = [];
      let hasAdvanced = false;
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (!cursor) { resolve(results); return; }
        if (offset > 0 && !hasAdvanced) { hasAdvanced = true; cursor.advance(offset); return; }
        results.push(cursor.value);
        if (results.length < limit) cursor.continue();
        else resolve(results);
      };
      request.onerror = () => reject(request.error);
  })),
  clearLogs: () => withWriteLock(async () => {
      const db = await getDb();
      const tx = db.transaction(LOGS_STORE, 'readwrite');
      tx.objectStore(LOGS_STORE).clear();
      return transactionToPromise(tx);
  }),
  pruneLogs: (olderThan: number) => withWriteLock(async () => {
      const db = await getDb();
      const tx = db.transaction(LOGS_STORE, 'readwrite');
      const store = tx.objectStore(LOGS_STORE);
      const index = store.index('timestamp');
      const range = IDBKeyRange.upperBound(new Date(olderThan));
      const request = index.openKeyCursor(range);
      request.onsuccess = () => {
          const cursor = request.result;
          if (cursor) { store.delete(cursor.primaryKey); cursor.continue(); }
      };
      return transactionToPromise(tx);
  }),
  clearAllData: () => withWriteLock(async () => {
      const db = await getDb();
      const storeNames = [SESSIONS_STORE, GROUPS_STORE, SCENARIOS_STORE, KEY_VALUE_STORE, LOGS_STORE];
      const tx = db.transaction(storeNames, 'readwrite');
      for (const storeName of storeNames) tx.objectStore(storeName).clear();
      return transactionToPromise(tx);
  }),
};
