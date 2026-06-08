import { useEffect } from 'react';
import type { AppSettings } from '../settings/appSettings';
import { FieldLabel } from './components/FieldLabel';
import { resolveAnalysisMode, describeAnalysisMode, getAiApiReadiness } from '../ai/analysisMode';

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

  const handleToggleAnalysis = (useForAnalysis: boolean) => {
    onChange({ ...settings, ai: { ...settings.ai, useForAnalysis } });
  };

  const handleGrantConsent = () => {
    onChange({ ...settings, ai: { ...settings.ai, externalConsentGivenAt: new Date().toISOString() } });
  };

  const handleRevokeConsent = () => {
    onChange({ ...settings, ai: { ...settings.ai, externalConsentGivenAt: null } });
  };

  const handleBudgetChange = (field: 'maxInputChars' | 'warnInputChars', value: number) => {
    onChange({ ...settings, ai: { ...settings.ai, [field]: value } });
  };

  // Reaktiv abgeleiteter Zustand für die Anzeige (ändert kein Extraktionsverhalten).
  const effectiveMode = resolveAnalysisMode(settings);
  const apiReadiness = getAiApiReadiness(settings);
  const consentGivenAt = settings.ai.externalConsentGivenAt;
  const estTokens = (chars: number) => Math.round(chars / 4).toLocaleString('de-DE');

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
                <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 leading-relaxed">
                  <strong>Wichtig:</strong> Dieses Feld enthält <strong>nicht</strong> den Anthropic-Schlüssel,
                  sondern bei authMode „bearer" das <strong>PROXY_SHARED_SECRET</strong> Ihres Proxys. Bei
                  authMode „none" bleibt es leer. Der echte Anthropic-Schlüssel liegt ausschließlich im Proxy,
                  niemals im Browser.
                </div>
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

        {/* === Analyse-Modus & KI ============================================= */}
        <div className="border-t-2 border-slate-200 pt-5 space-y-4">
          <div>
            <h4 className="text-base font-semibold text-slate-900">Analyse-Modus &amp; KI</h4>
            <p className="mt-1 text-sm text-slate-600">
              Steuert, ob die Analyse die KI nutzt. Ohne Zustimmung und ohne aktive API-Konfiguration
              wird nichts automatisch gesendet.
            </p>
          </div>

          {/* Master-Schalter: KI für die Analyse verwenden */}
          <label className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.ai.useForAnalysis}
              onChange={(e) => handleToggleAnalysis(e.target.checked)}
              className="mt-1"
            />
            <span>
              <span className="block text-sm font-medium text-slate-800">KI für die Analyse verwenden</span>
              <span className="block text-xs text-slate-500 mt-0.5">
                Aus = lokale Vorschau ohne KI. Ein = KI automatisch (bei aktiver API und erteilter Zustimmung)
                oder über Kopieren &amp; Einfügen.
              </span>
            </span>
          </label>

          {/* Effektiver Analyse-Modus (reagiert live auf Änderungen) */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-sm text-slate-700">
              <span className="font-medium">Effektiver Analyse-Modus:</span>{' '}
              <span className="font-semibold text-slate-900">{describeAnalysisMode(effectiveMode)}</span>
            </p>
            {settings.ai.useForAnalysis && effectiveMode !== 'ai-api' && apiReadiness.missing.length > 0 && (
              <p className="mt-1 text-xs text-amber-700">
                Für „KI automatisch (über Endpoint)" fehlt noch: {apiReadiness.missingLabels.join(', ')}.
              </p>
            )}
          </div>

          {/* Consent-Block (nur relevant für den automatischen API-Versand) */}
          <div className="rounded-lg border border-slate-200 p-3 space-y-2">
            <p className="text-sm font-medium text-slate-800">Zustimmung zum externen Versand</p>
            <p className="text-xs text-slate-600 leading-relaxed">
              Bei „KI automatisch" wird der eingegebene bzw. hochgeladene <strong>Analysetext</strong>
              {' '}(optional inklusive der von Ihnen bereitgestellten <strong>Übersetzung</strong>) an den
              konfigurierten <strong>externen Endpoint</strong> gesendet — also an Ihren Proxy, der die Anfrage
              an die Anthropic-API weiterreicht. <strong>Ohne diese Zustimmung und ohne aktive API-Konfiguration
              wird nichts automatisch gesendet.</strong>
            </p>
            {consentGivenAt ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-green-700">
                  Zustimmung erteilt am {new Date(consentGivenAt).toLocaleString('de-DE')}.
                </span>
                <button
                  type="button"
                  onClick={handleRevokeConsent}
                  className="px-3 py-1.5 text-xs font-medium border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Zustimmung widerrufen
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-slate-500">Noch keine Zustimmung erteilt.</span>
                <button
                  type="button"
                  onClick={handleGrantConsent}
                  className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Zustimmung erteilen
                </button>
              </div>
            )}
          </div>

          {/* Eingabe-Budget */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <div className="mb-1">
                <FieldLabel label="Max. Eingabezeichen" />
              </div>
              <input
                type="number"
                min={0}
                value={settings.ai.maxInputChars}
                onChange={(e) => handleBudgetChange('maxInputChars', parseInt(e.target.value, 10) || 0)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-slate-500 mt-1">
                Harte Obergrenze für den Analysetext. Entspricht grob ungefähr {estTokens(settings.ai.maxInputChars)} Tokens
                (grobe Schätzung).
              </p>
            </div>
            <div>
              <div className="mb-1">
                <FieldLabel label="Warnschwelle (Zeichen)" />
              </div>
              <input
                type="number"
                min={0}
                value={settings.ai.warnInputChars}
                onChange={(e) => handleBudgetChange('warnInputChars', parseInt(e.target.value, 10) || 0)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-slate-500 mt-1">
                Ab dieser Länge wird vor langer Eingabe gewarnt. Entspricht grob ungefähr {estTokens(settings.ai.warnInputChars)} Tokens
                (grobe Schätzung).
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
