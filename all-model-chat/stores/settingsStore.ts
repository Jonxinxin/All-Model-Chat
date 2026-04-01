import { create } from 'zustand';
import { AppSettings, ModelOption } from '../types';
import { DEFAULT_APP_SETTINGS, DEFAULT_FILES_API_CONFIG } from '../constants/appConstants';
import { AVAILABLE_THEMES, DEFAULT_THEME_ID } from '../constants/themeConstants';
import { applyThemeToDocument, logService } from '../utils/appUtils';
import { dbService } from '../utils/db';
import { invalidateProxyCache } from '../services/api/baseApi';
import { sortModels, getDefaultModelOptions } from '../utils/appUtils';
import type { SyncMessage } from '../utils/broadcastChannel';
import { broadcastSync, getSyncChannel } from '../utils/broadcastChannel';

const CUSTOM_MODELS_KEY = 'custom_model_list_v1';

// BroadcastChannel singleton is in utils/broadcastChannel.ts

// --- Resolved theme helper ---
function resolveTheme(themeId: string): 'onyx' | 'pearl' {
  if (themeId === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'onyx' : 'pearl';
  }
  return themeId as 'onyx' | 'pearl';
}

function resolveLanguage(appSettings: AppSettings): 'en' | 'zh' {
  const settingLang = appSettings.language || 'system';
  if (settingLang === 'system') {
    return navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
  }
  return settingLang;
}

// --- Store types ---
interface SettingsState {
  appSettings: AppSettings;
  isSettingsLoaded: boolean;
  language: 'en' | 'zh';
  resolvedThemeId: 'onyx' | 'pearl';
  apiModels: ModelOption[];
  isModelsLoading: boolean;
  modelsLoadingError: string | null;
}

interface SettingsActions {
  loadSettings: () => Promise<void>;
  setAppSettings: (settings: AppSettings | ((prev: AppSettings) => AppSettings)) => void;
  setApiModels: (models: ModelOption[]) => void;
  // Multi-tab sync listener setup
  initMultiTabSync: () => () => void;
  // System theme change listener
  initSystemThemeListener: () => () => void;
}

export const useSettingsStore = create<SettingsState & SettingsActions>((set, get) => ({
  appSettings: DEFAULT_APP_SETTINGS,
  isSettingsLoaded: false,
  language: 'zh',
  resolvedThemeId: resolveTheme(DEFAULT_APP_SETTINGS.themeId),
  apiModels: (() => {
    try {
      const stored = localStorage.getItem(CUSTOM_MODELS_KEY);
      if (stored) return JSON.parse(stored);
    } catch { /* ignore */ }
    return getDefaultModelOptions();
  })(),
  isModelsLoading: false,
  modelsLoadingError: null,

  loadSettings: async () => {
    try {
      const storedSettings = await dbService.getAppSettings();
      if (storedSettings) {
        const newSettings = { ...DEFAULT_APP_SETTINGS, ...storedSettings };
        if (storedSettings.filesApiConfig) {
          newSettings.filesApiConfig = { ...DEFAULT_FILES_API_CONFIG, ...storedSettings.filesApiConfig };
        }
        const resolvedThemeId = resolveTheme(newSettings.themeId);
        const language = resolveLanguage(newSettings);

        set({
          appSettings: newSettings,
          resolvedThemeId,
          language,
          isSettingsLoaded: true,
        });

        const currentTheme = AVAILABLE_THEMES.find(t => t.id === resolvedThemeId) || AVAILABLE_THEMES.find(t => t.id === DEFAULT_THEME_ID)!;
        applyThemeToDocument(document, currentTheme, newSettings);
      } else {
        set({ isSettingsLoaded: true });
      }
    } catch (error) {
      logService.error("Failed to load settings from IndexedDB", { error });
      set({ isSettingsLoaded: true });
    }
  },

  setAppSettings: (settingsInput) => {
    const state = get();
    const next = typeof settingsInput === 'function' ? settingsInput(state.appSettings) : settingsInput;

    const resolvedThemeId = resolveTheme(next.themeId);
    const language = resolveLanguage(next);
    const currentTheme = AVAILABLE_THEMES.find(t => t.id === resolvedThemeId) || AVAILABLE_THEMES.find(t => t.id === DEFAULT_THEME_ID)!;

    set({
      appSettings: next,
      resolvedThemeId,
      language,
    });

    // Side effects
    applyThemeToDocument(document, currentTheme, next);

    if (state.isSettingsLoaded) {
      invalidateProxyCache();
      dbService.setAppSettings(next)
        .then(() => broadcastSync({ type: 'SETTINGS_UPDATED' }))
        .catch(e => logService.error("Failed to save settings", { error: e }));
    }
  },

  setApiModels: (models) => {
    set({ apiModels: models });
    localStorage.setItem(CUSTOM_MODELS_KEY, JSON.stringify(models));
  },

  initMultiTabSync: () => {
    const ch = getSyncChannel();
    const handler = (event: MessageEvent<SyncMessage>) => {
      const msg = event.data;
      if (msg.type === 'SETTINGS_UPDATED') {
        logService.info("[Sync] Reloading settings from DB");
        get().loadSettings();
      }
    };
    ch.addEventListener('message', handler);
    return () => ch.removeEventListener('message', handler);
  },

  initSystemThemeListener: () => {
    const { appSettings } = get();
    if (appSettings.themeId !== 'system') return () => {};

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const updateTheme = () => {
      const newResolved = mediaQuery.matches ? 'onyx' : 'pearl';
      set({ resolvedThemeId: newResolved });
      const theme = AVAILABLE_THEMES.find(t => t.id === newResolved) || AVAILABLE_THEMES.find(t => t.id === DEFAULT_THEME_ID)!;
      applyThemeToDocument(document, theme, get().appSettings);
    };
    mediaQuery.addEventListener('change', updateTheme);
    return () => mediaQuery.removeEventListener('change', updateTheme);
  },
}));

// --- Computed selectors ---
export const useCurrentTheme = () => {
  const resolvedThemeId = useSettingsStore(s => s.resolvedThemeId);
  return AVAILABLE_THEMES.find(t => t.id === resolvedThemeId) || AVAILABLE_THEMES.find(t => t.id === DEFAULT_THEME_ID)!;
};
