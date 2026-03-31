import { useEffect, useState } from 'react';
import { DEFAULT_SETTINGS, loadAppSettings, saveAppSettings, type AppSettings } from './appSettings';

export function useAppSettings() {
  const [settings, setSettingsState] = useState<AppSettings>(() => {
    if (typeof window === 'undefined') {
      return DEFAULT_SETTINGS;
    }
    return loadAppSettings();
  });

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    saveAppSettings(settings);
  }, [settings]);

  const setSettings = (next: AppSettings) => setSettingsState(next);

  return { settings, setSettings };
}
