export type DataHandlingMode = 'local' | 'external';
export type AiIntegrationMode = 'copy_paste' | 'api';
export type AiApiAuthMode = 'none' | 'bearer' | 'x_api_key';
export type UiMode = 'assisted' | 'expert';

export interface AiApiSettings {
  endpointUrl: string;
  authMode: AiApiAuthMode;
  apiKey: string;
  timeoutMs: number;
}

export interface AppSettings {
  dataHandlingMode: DataHandlingMode;
  uiMode: UiMode;

  transcription: {
    providerId: string;
    language: string;
  };

  translation: {
    providerId: string;
    targetLanguage: string;
  };

  ai: {
    mode: AiIntegrationMode;
    api: AiApiSettings;
  };

  processMining: {
    externalizeEvents: boolean;
    externalizeThreshold: number;
  };
}

const STORAGE_KEY = 'process-app-settings-v1';

export const DEFAULT_SETTINGS: AppSettings = {
  dataHandlingMode: 'local',
  uiMode: 'assisted',
  transcription: {
    providerId: 'none',
    language: 'de-DE'
  },
  translation: {
    providerId: 'none',
    targetLanguage: 'de'
  },
  ai: {
    mode: 'copy_paste',
    api: {
      endpointUrl: '',
      authMode: 'none',
      apiKey: '',
      timeoutMs: 60000,
    },
  },
  processMining: {
    externalizeEvents: false,
    externalizeThreshold: 150000,
  },
};

export function loadAppSettings(): AppSettings {
  if (typeof window === 'undefined') {
    return DEFAULT_SETTINGS;
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return DEFAULT_SETTINGS;
    }

    const parsed = JSON.parse(stored) as Partial<AppSettings>;

    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      transcription: {
        ...DEFAULT_SETTINGS.transcription,
        ...(parsed.transcription ?? {})
      },
      translation: {
        ...DEFAULT_SETTINGS.translation,
        ...(parsed.translation ?? {})
      },
      ai: {
        ...DEFAULT_SETTINGS.ai,
        ...(parsed.ai ?? {}),
        api: {
          ...DEFAULT_SETTINGS.ai.api,
          ...(parsed.ai && typeof parsed.ai === 'object' && 'api' in parsed.ai ? (parsed.ai.api as Partial<AiApiSettings>) : {})
        }
      },
      processMining: {
        ...DEFAULT_SETTINGS.processMining,
        ...(parsed.processMining ?? {})
      },
    };
  } catch (error) {
    console.warn('Failed to load app settings, using defaults:', error);
    return DEFAULT_SETTINGS;
  }
}

export function saveAppSettings(settings: AppSettings): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    console.error('Failed to save app settings:', error);
  }
}
