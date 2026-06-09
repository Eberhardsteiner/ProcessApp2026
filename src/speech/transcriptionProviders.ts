import type { DataHandlingMode } from '../settings/appSettings';
import { isAudioRecordingSupported } from './audioRecorder';

export type TranscriptionProviderId = 'none' | 'web_speech' | 'whisper';

export interface TranscriptionProviderOption {
  id: TranscriptionProviderId;
  label: string;
  dataHandling: DataHandlingMode;
  description?: string;
  isAvailable: () => boolean;
}

export function isWebSpeechSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
}

export const TRANSCRIPTION_PROVIDERS: TranscriptionProviderOption[] = [
  {
    id: 'none',
    label: 'Aus',
    dataHandling: 'local',
    description: 'Keine Spracherkennung.',
    isAvailable: () => true,
  },
  {
    id: 'web_speech',
    label: 'Browser-Spracherkennung (Web Speech API)',
    dataHandling: 'external',
    description: 'Kann je nach Browser über einen externen Dienst laufen.',
    isAvailable: isWebSpeechSupported,
  },
  {
    id: 'whisper',
    label: 'Whisper (Server)',
    dataHandling: 'external',
    description: 'Nimmt Audio im Browser auf und sendet es an einen konfigurierten Transkriptions-Proxy (Whisper/OpenAI-kompatibel).',
    isAvailable: () => isAudioRecordingSupported(),
  },
];

export function listTranscriptionProviders(mode: DataHandlingMode): TranscriptionProviderOption[] {
  return TRANSCRIPTION_PROVIDERS.filter((p) => (mode === 'external' ? true : p.dataHandling === 'local'));
}
