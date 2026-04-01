
import { useEffect } from 'react';
import { AppSettings } from '../../../types';
import { networkInterceptor } from '../../../services/networkInterceptor';
import { logService } from '../../../utils/appUtils';
import { useSettingsStore } from '../../../stores/settingsStore';

export const useAppInitialization = (appSettings: AppSettings) => {
  // Load settings from IndexedDB on mount (only once)
  useEffect(() => {
      useSettingsStore.getState().loadSettings();
  }, []);

  // Initialize multi-tab sync for settings
  useEffect(() => {
      const cleanupSync = useSettingsStore.getState().initMultiTabSync();
      const cleanupTheme = useSettingsStore.getState().initSystemThemeListener();
      return () => { cleanupSync(); cleanupTheme(); };
  }, []);

  // Initialize Network Interceptor
  useEffect(() => {
      networkInterceptor.mount();
  }, []);

  // Update Interceptor Configuration when settings change
  useEffect(() => {
      const shouldUseProxy = appSettings.useCustomApiConfig && appSettings.useApiProxy;
      networkInterceptor.configure(!!shouldUseProxy, appSettings.apiProxyUrl);
  }, [appSettings.useCustomApiConfig, appSettings.useApiProxy, appSettings.apiProxyUrl]);

  useEffect(() => {
    logService.info('App initialized.');
  }, []);
};
