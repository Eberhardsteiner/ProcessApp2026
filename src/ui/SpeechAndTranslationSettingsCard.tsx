import { useEffect, useState } from 'react';
import type { AppSettings, DataHandlingMode } from '../settings/appSettings';
import { listTranscriptionProviders, isWebSpeechSupported } from '../speech/transcriptionProviders';
import { listTranslationProviders } from '../translation/translationProviders';
import { FieldLabel } from './components/FieldLabel';

interface SpeechAndTranslationSettingsCardProps {
  settings: AppSettings;
  onChange: (next: AppSettings) => void;
}

export function SpeechAndTranslationSettingsCard({
  settings,
  onChange,
}: SpeechAndTranslationSettingsCardProps) {
  const [providerNote, setProviderNote] = useState<string>('');

  const sttOptions = listTranscriptionProviders(settings.dataHandlingMode);
  const translationOptions = listTranslationProviders(settings.dataHandlingMode);

  const handleModeChange = (mode: DataHandlingMode) => {
    setProviderNote('');
    if (mode === 'local') {
      onChange({
        ...settings,
        dataHandlingMode: mode,
        transcription: { ...settings.transcription, providerId: 'none' },
        translation: { ...settings.translation, providerId: 'none' },
      });
    } else {
      onChange({
        ...settings,
        dataHandlingMode: mode,
      });
    }
  };

  const handleTranscriptionProviderChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nextId = e.target.value;
    if (nextId === 'web_speech' && !isWebSpeechSupported()) {
      setProviderNote('Dieser Browser unterstützt Web Speech nicht. Bitte "Aus" verwenden.');
      onChange({ ...settings, transcription: { ...settings.transcription, providerId: 'none' } });
      return;
    }
    setProviderNote('');
    onChange({ ...settings, transcription: { ...settings.transcription, providerId: nextId } });
  };

  const handleTranslationProviderChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nextId = e.target.value;
    if (nextId === 'external_stub') {
      setProviderNote('Übersetzung ist noch nicht implementiert.');
      onChange({ ...settings, translation: { ...settings.translation, providerId: 'none' } });
      return;
    }
    setProviderNote('');
    onChange({ ...settings, translation: { ...settings.translation, providerId: nextId } });
  };

  const handleTranscriptionLanguageChange = (language: string) => {
    onChange({
      ...settings,
      transcription: { ...settings.transcription, language },
    });
  };

  const handleTranslationTargetLanguageChange = (targetLanguage: string) => {
    onChange({
      ...settings,
      translation: { ...settings.translation, targetLanguage },
    });
  };

  const safeSttProviderId = sttOptions.some((o) => o.id === settings.transcription.providerId && o.isAvailable())
    ? settings.transcription.providerId
    : 'none';

  const safeTranslationProviderId = translationOptions.some((o) => o.id === settings.translation.providerId && o.isAvailable())
    ? settings.translation.providerId
    : 'none';

  useEffect(() => {
    if (settings.dataHandlingMode === 'local') {
      if (settings.transcription.providerId !== 'none' || settings.translation.providerId !== 'none') {
        onChange({
          ...settings,
          transcription: { ...settings.transcription, providerId: 'none' },
          translation: { ...settings.translation, providerId: 'none' },
        });
      }
      return;
    }

    if (settings.transcription.providerId === 'web_speech' && !isWebSpeechSupported()) {
      setProviderNote('Web Speech ist in diesem Browser nicht verfügbar. Der Provider wurde auf "Aus" zurückgesetzt.');
      onChange({
        ...settings,
        transcription: { ...settings.transcription, providerId: 'none' },
      });
      return;
    }

    if (settings.translation.providerId === 'external_stub') {
      setProviderNote('Übersetzung ist noch nicht implementiert. Der Provider wurde auf "Aus" zurückgesetzt.');
      onChange({
        ...settings,
        translation: { ...settings.translation, providerId: 'none' },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.dataHandlingMode, settings.transcription.providerId, settings.translation.providerId]);

  return (
    <div>
      <h2 className="text-lg font-semibold text-slate-900 mb-4">
        Sprache & Übersetzung (optional)
      </h2>

      <div className="space-y-6">
        <div>
          <p className="text-sm text-slate-600 mb-4">
            Diese Einstellungen bereiten zukünftige Funktionen für Spracherkennung und Übersetzung vor.
            Im lokalen Modus werden keine externen Dienste verwendet. Im Modus "Externer Dienst" können
            später auf explizite Nutzeraktion externe APIs genutzt werden.
          </p>
        </div>

        <div>
          <div className="mb-2">
            <FieldLabel
              label="Datenmodus"
              info={{
                title: 'Datenmodus',
                content: (
                  <>
                    <p className="mb-2">
                      <strong>Lokal:</strong> Alle Daten bleiben auf Ihrem Gerät. Keine externen Dienste werden verwendet.
                    </p>
                    <p>
                      <strong>Externer Dienst:</strong> Ermöglicht die Nutzung von Browser-APIs oder externen Diensten, die nur auf explizite Nutzeraktion aktiviert werden. Daten werden nur übertragen, wenn Sie eine entsprechende Funktion auslösen.
                    </p>
                  </>
                ),
              }}
            />
          </div>
          <div className="flex gap-4">
            <button
              type="button"
              onClick={() => handleModeChange('local')}
              className={`flex-1 px-4 py-3 rounded-lg border-2 text-sm font-medium transition-colors ${
                settings.dataHandlingMode === 'local'
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
              }`}
            >
              <div className="font-semibold mb-1">Lokal</div>
              <div className="text-xs opacity-75">Keine externen Dienste</div>
            </button>
            <button
              type="button"
              onClick={() => handleModeChange('external')}
              className={`flex-1 px-4 py-3 rounded-lg border-2 text-sm font-medium transition-colors ${
                settings.dataHandlingMode === 'external'
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
              }`}
            >
              <div className="font-semibold mb-1">Externer Dienst</div>
              <div className="text-xs opacity-75">Nur auf Nutzeraktion</div>
            </button>
          </div>
        </div>

        {providerNote && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
            <p className="text-sm text-yellow-800">{providerNote}</p>
          </div>
        )}

        {settings.dataHandlingMode === 'external' && !providerNote && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-800">
              Im External-Modus können Browser-basierte Dienste aktiviert werden.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-900">Spracherkennung (STT)</h3>

            <div>
              <div className="mb-2">
                <FieldLabel
                  label="Provider"
                  info={{
                    title: 'STT Provider',
                    content: (
                      <>
                        <p className="mb-2">
                          Speech-to-Text (STT) wandelt gesprochene Sprache in Text um.
                        </p>
                        <p>
                          <strong>Web Speech:</strong> Nutzt die Browser-API. Verfügbarkeit hängt vom verwendeten Browser ab (z.B. Chrome, Edge).
                        </p>
                      </>
                    ),
                  }}
                />
              </div>
              <select
                value={safeSttProviderId}
                onChange={handleTranscriptionProviderChange}
                disabled={settings.dataHandlingMode === 'local'}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm disabled:bg-slate-100 disabled:text-slate-500"
              >
                {sttOptions.map((opt) => (
                  <option
                    key={opt.id}
                    value={opt.id}
                    disabled={!opt.isAvailable()}
                  >
                    {opt.label}
                  </option>
                ))}
              </select>
              {settings.dataHandlingMode === 'local' && (
                <p className="mt-1 text-xs text-slate-500">
                  Im lokalen Modus deaktiviert
                </p>
              )}
              {settings.dataHandlingMode === 'external' && (
                <p className="mt-1 text-xs text-slate-500">
                  Browser-Unterstützung Web Speech: {isWebSpeechSupported() ? 'Ja' : 'Nein'}
                </p>
              )}
            </div>

            <div>
              <div className="mb-2">
                <FieldLabel
                  label="Sprache"
                  info={{
                    title: 'Sprachcode',
                    content: (
                      <>
                        <p className="mb-2">
                          Verwenden Sie BCP-47 Sprachcodes für die Spracherkennung.
                        </p>
                        <p className="text-xs">
                          Beispiele:<br />
                          <strong>de-DE</strong> - Deutsch (Deutschland)<br />
                          <strong>en-US</strong> - Englisch (USA)<br />
                          <strong>fr-FR</strong> - Französisch (Frankreich)<br />
                          <strong>es-ES</strong> - Spanisch (Spanien)
                        </p>
                      </>
                    ),
                  }}
                />
              </div>
              <input
                type="text"
                value={settings.transcription.language}
                onChange={(e) => handleTranscriptionLanguageChange(e.target.value)}
                placeholder="de-DE"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="mt-1 text-xs text-slate-500">
                z.B. de-DE, en-US, fr-FR
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-900">Übersetzung</h3>

            <div>
              <div className="mb-2">
                <FieldLabel
                  label="Provider"
                  info={{
                    title: 'Übersetzungs-Provider',
                    content: (
                      <p>
                        Übersetzungsfunktion ist optional und wird nur bei Bedarf aktiviert. Aktuell sind noch keine externen Provider implementiert.
                      </p>
                    ),
                  }}
                />
              </div>
              <select
                value={safeTranslationProviderId}
                onChange={handleTranslationProviderChange}
                disabled={settings.dataHandlingMode === 'local'}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm disabled:bg-slate-100 disabled:text-slate-500"
              >
                {translationOptions.map((opt) => (
                  <option
                    key={opt.id}
                    value={opt.id}
                    disabled={!opt.isAvailable()}
                  >
                    {opt.label}
                  </option>
                ))}
              </select>
              {settings.dataHandlingMode === 'local' && (
                <p className="mt-1 text-xs text-slate-500">
                  Im lokalen Modus deaktiviert
                </p>
              )}
            </div>

            <div>
              <div className="mb-2">
                <FieldLabel
                  label="Zielsprache"
                  info={{
                    title: 'Zielsprache',
                    content: (
                      <>
                        <p className="mb-2">
                          Die Sprache, in die übersetzt werden soll.
                        </p>
                        <p className="text-xs">
                          Beispiele:<br />
                          <strong>de</strong> - Deutsch<br />
                          <strong>en</strong> - Englisch<br />
                          <strong>fr</strong> - Französisch<br />
                          <strong>es</strong> - Spanisch
                        </p>
                      </>
                    ),
                  }}
                />
              </div>
              <input
                type="text"
                value={settings.translation.targetLanguage}
                onChange={(e) => handleTranslationTargetLanguageChange(e.target.value)}
                placeholder="de"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="mt-1 text-xs text-slate-500">
                z.B. de, en, fr
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
