import type { DataHandlingMode } from '../settings/appSettings';

export type TranslationProviderId = 'none' | 'external_stub';

export interface TranslationProviderOption {
  id: TranslationProviderId;
  label: string;
  dataHandling: DataHandlingMode;
  description?: string;
  isAvailable: () => boolean;
}

export const TRANSLATION_PROVIDERS: TranslationProviderOption[] = [
  {
    id: 'none',
    label: 'Aus',
    dataHandling: 'local',
    description: 'Keine Übersetzung.',
    isAvailable: () => true,
  },
  {
    id: 'external_stub',
    label: 'Externe Übersetzung (noch nicht verfügbar)',
    dataHandling: 'external',
    description: 'Noch nicht implementiert. Platzhalter für spätere Provider (z.B. DeepL, Azure).',
    isAvailable: () => false,
  },
];

export function listTranslationProviders(mode: DataHandlingMode): TranslationProviderOption[] {
  return TRANSLATION_PROVIDERS.filter((p) => (mode === 'external' ? true : p.dataHandling === 'local'));
}
