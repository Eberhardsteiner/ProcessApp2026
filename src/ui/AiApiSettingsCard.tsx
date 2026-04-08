import { useEffect } from 'react';
import type { AppSettings } from '../settings/appSettings';
import { FieldLabel } from './components/FieldLabel';

interface AiApiSettingsCardProps {
  settings: AppSettings;
  onChange: (next: AppSettings) => void;
}

export function AiApiSettingsCard({ settings, onChange }: AiApiSettingsCardProps) {
  const isLocalMode = settings.dataHandlingMode !== 'external';
  const aiMode = settings.ai.mode;
  const apiSettings = settings.ai.api;

  useEffect(() => {
    if (isLocalMode && aiMode === 'api') {
      onChange({
        ...settings,
        ai: {
          ...settings.ai,
          mode: 'copy_paste',
        },
      });
    }
  }, [isLocalMode, aiMode, onChange, settings]);

  const handleModeChange = (mode: 'copy_paste' | 'api') => {
    onChange({
      ...settings,
      ai: {
        ...settings.ai,
        mode,
      },
    });
  };

  const handleApiSettingChange = (field: keyof typeof apiSettings, value: string | number) => {
    onChange({
      ...settings,
      ai: {
        ...settings.ai,
        api: {
          ...apiSettings,
          [field]: value,
        },
      },
    });
  };

  return (
    <div>
      <h3 className="text-lg font-semibold text-slate-900 mb-2">KI-Integration (optional)</h3>
      <p className="text-sm text-slate-600 mb-4">
        Standardmäßig erfolgt die KI-Interaktion über Copy/Paste ohne automatische Datenübertragung.
        Im API-Modus können Sie einen Endpoint konfigurieren, der nur auf expliziten Klick Prompts sendet.
        Empfehlung: Nutzen Sie einen eigenen Proxy/Backend als Endpoint.
      </p>

      <div className="space-y-4">
        <div>
          <div className="mb-2">
            <FieldLabel
              label="Modus"
              info={{
                title: 'KI-Integrationsmodus',
                content: (
                  <>
                    <p className="mb-2">
                      <strong>Copy/Paste:</strong> Sie kopieren die generierten Prompts manuell und fügen KI-Antworten ein. Keine automatische Datenübertragung.
                    </p>
                    <p>
                      <strong>API:</strong> Direkter API-Aufruf an einen konfigurierten Endpoint. Daten werden nur bei explizitem Klick gesendet.
                    </p>
                  </>
                ),
              }}
            />
          </div>
          <div className="space-y-2">
            <label className="flex items-center">
              <input
                type="radio"
                checked={aiMode === 'copy_paste'}
                onChange={() => handleModeChange('copy_paste')}
                className="mr-2"
              />
              <span className="text-sm text-slate-700">Copy/Paste (Standard)</span>
            </label>
            <label className="flex items-center">
              <input
                type="radio"
                checked={aiMode === 'api'}
                onChange={() => handleModeChange('api')}
                disabled={isLocalMode}
                className="mr-2"
              />
              <span className={`text-sm ${isLocalMode ? 'text-slate-400' : 'text-slate-700'}`}>
                API (Endpoint)
              </span>
            </label>
          </div>
          {isLocalMode && (
            <p className="text-xs text-slate-500 mt-2">
              Im lokalen Modus deaktiviert. Wechseln Sie zu "Externer Dienst" im Datenmodus.
            </p>
          )}
        </div>

        {aiMode === 'api' && !isLocalMode && (
          <div className="space-y-4 border-t border-slate-200 pt-4">
            <div>
              <div className="mb-2">
                <FieldLabel
                  label="Endpoint URL"
                  info={{
                    title: 'API Endpoint',
                    content: (
                      <>
                        <p className="mb-2">
                          Die URL Ihres KI-API-Endpoints.
                        </p>
                        <p>
                          <strong>Empfehlung:</strong> Verwenden Sie einen eigenen Proxy oder Backend-Server, um API-Keys zu schützen und Anfragen zu kontrollieren.
                        </p>
                      </>
                    ),
                  }}
                />
              </div>
              <input
                type="text"
                value={apiSettings.endpointUrl}
                onChange={(e) => handleApiSettingChange('endpointUrl', e.target.value)}
                placeholder="https://example.com/ai"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <div className="mb-2">
                <FieldLabel
                  label="Authentifizierung"
                  info={{
                    title: 'Authentifizierungsmethode',
                    content: (
                      <>
                        <p className="mb-2">
                          Wählen Sie die Authentifizierungsmethode für Ihren API-Endpoint:
                        </p>
                        <p className="text-xs mb-1">
                          <strong>Keine:</strong> Keine Authentifizierung
                        </p>
                        <p className="text-xs mb-1">
                          <strong>Bearer Token:</strong> Authorization Header mit Bearer Token
                        </p>
                        <p className="text-xs">
                          <strong>API Key Header:</strong> x-api-key Header
                        </p>
                      </>
                    ),
                  }}
                />
              </div>
              <select
                value={apiSettings.authMode}
                onChange={(e) => handleApiSettingChange('authMode', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="none">Keine</option>
                <option value="bearer">Bearer Token (Authorization: Bearer ...)</option>
                <option value="x_api_key">API Key Header (x-api-key: ...)</option>
              </select>
            </div>

            {apiSettings.authMode !== 'none' && (
              <div>
                <div className="mb-2">
                  <FieldLabel
                    label="API Key"
                    info={{
                      title: 'API Key Speicherung',
                      content: (
                        <>
                          <p className="mb-2">
                            Ihr API Key wird ausschließlich lokal im Browser gespeichert (localStorage).
                          </p>
                          <p>
                            <strong>Wichtig:</strong> Der Key verlässt Ihren Browser nur bei API-Aufrufen an den konfigurierten Endpoint. Verwenden Sie einen eigenen Proxy, um sensible Keys zu schützen.
                          </p>
                        </>
                      ),
                    }}
                  />
                </div>
                <input
                  type="password"
                  value={apiSettings.apiKey}
                  onChange={(e) => handleApiSettingChange('apiKey', e.target.value)}
                  placeholder="Ihr API Key"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-slate-500 mt-1">
                  API Key wird lokal im Browser gespeichert.
                </p>
              </div>
            )}

            <div>
              <div className="mb-2">
                <FieldLabel
                  label="Timeout (ms)"
                  info={{
                    title: 'Request Timeout',
                    content: (
                      <>
                        <p className="mb-2">
                          Maximale Wartezeit für API-Anfragen in Millisekunden.
                        </p>
                        <p className="text-xs">
                          <strong>Standard:</strong> 60000ms (60 Sekunden)<br />
                          <strong>Minimum:</strong> 5000ms (5 Sekunden)<br />
                          <strong>Maximum:</strong> 180000ms (3 Minuten)
                        </p>
                      </>
                    ),
                  }}
                />
              </div>
              <input
                type="number"
                value={apiSettings.timeoutMs}
                onChange={(e) => handleApiSettingChange('timeoutMs', parseInt(e.target.value, 10) || 60000)}
                min={5000}
                max={180000}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-slate-500 mt-1">
                Standard: 60000ms (60 Sekunden), Minimum: 5000ms, Maximum: 180000ms
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
