import { useState } from 'react';
import { Wand2, Copy, Check, Download, AlertCircle, Info, Send } from 'lucide-react';
import type { Process, ProcessVersion } from '../domain/process';
import { buildClaudeSemanticQuestionsAnalysisPrompt } from '../ai/claudeSemanticQuestionsAnalysisPrompt';
import { runAiProxyRequest } from '../ai/aiApiClient';
import type { AppSettings } from '../settings/appSettings';

interface SemanticQuestionsAiPanelProps {
  process: Process;
  version: ProcessVersion;
  settings: AppSettings;
}

export function SemanticQuestionsAiPanel({ process, version, settings }: SemanticQuestionsAiPanelProps): JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [promptCopied, setPromptCopied] = useState(false);
  const [aiResponse, setAiResponse] = useState('');
  const [responseCopied, setResponseCopied] = useState(false);
  const [error, setError] = useState('');

  const [apiConsent, setApiConsent] = useState(false);
  const [apiRunning, setApiRunning] = useState(false);
  const [apiError, setApiError] = useState('');
  const [apiRequestPreview, setApiRequestPreview] = useState('');

  const hasQuestions = version.quality.semanticQuestions.length > 0;

  const apiModeActive = settings.dataHandlingMode === 'external' && settings.ai.mode === 'api';
  const apiEndpoint = settings.ai.api.endpointUrl.trim();

  const handleOpen = () => {
    try {
      const generatedPrompt = buildClaudeSemanticQuestionsAnalysisPrompt({ process, version });
      setPrompt(generatedPrompt);
      setIsOpen(true);
      setError('');
      setApiConsent(false);
      setApiError('');
      setApiRunning(false);
      const promptPreview = generatedPrompt.length > 4000 ? generatedPrompt.slice(0, 4000) + '\n\n… (gekürzt)' : generatedPrompt;
      setApiRequestPreview(JSON.stringify({ schemaVersion: 'process-ai-proxy-v1', prompt: promptPreview }, null, 2));
    } catch (err) {
      setError(`Fehler beim Erstellen des Prompts: ${err}`);
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    setPromptCopied(false);
    setResponseCopied(false);
  };

  const copyToClipboard = async (text: string, setCopied: (val: boolean) => void) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      setError(`Fehler beim Kopieren: ${err}`);
    }
  };

  const handleCopyPrompt = () => {
    copyToClipboard(prompt, setPromptCopied);
  };

  const handleCopyResponse = () => {
    copyToClipboard(aiResponse, setResponseCopied);
  };

  const handleDownloadMarkdown = () => {
    if (!aiResponse) {
      setError('Keine Antwort zum Exportieren vorhanden');
      return;
    }

    try {
      const processTitle = process.title.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
      const versionPrefix = version.versionId.slice(0, 8);
      const filename = `semantic_questions_ai_${processTitle}_${versionPrefix}.md`;

      const blob = new Blob([aiResponse], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(`Fehler beim Download: ${err}`);
    }
  };

  const handleApiSend = async () => {
    setApiRunning(true);
    setApiError('');
    try {
      const text = await runAiProxyRequest({
        endpointUrl: apiEndpoint,
        authMode: settings.ai.api.authMode,
        apiKey: settings.ai.api.apiKey,
        timeoutMs: settings.ai.api.timeoutMs,
        prompt,
      });
      setAiResponse(text);
    } catch (err) {
      setApiError(err instanceof Error ? err.message : String(err));
    } finally {
      setApiRunning(false);
    }
  };

  if (!hasQuestions) {
    return (
      <div className="bg-gray-50 rounded p-3 border border-gray-200">
        <button
          disabled
          className="px-4 py-2 bg-gray-300 text-gray-500 rounded cursor-not-allowed flex items-center gap-2"
          title="Keine semantischen Fragen vorhanden"
        >
          <Wand2 size={16} />
          KI: Fragen priorisieren
        </button>
        <p className="text-xs text-gray-500 mt-2">
          Keine semantischen Fragen vorhanden
        </p>
      </div>
    );
  }

  return (
    <div className="border border-blue-200 rounded-lg bg-blue-50 p-4">
      {!isOpen ? (
        <div>
          <button
            onClick={handleOpen}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center gap-2 transition-colors"
          >
            <Wand2 size={16} />
            KI: Fragen priorisieren
          </button>
          <p className="text-xs text-gray-600 mt-2">
            Öffnet einen Workflow zum Copy/Paste mit Claude
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-start justify-between">
            <h4 className="font-semibold text-blue-900 flex items-center gap-2">
              <Wand2 size={18} />
              KI-Auswertung semantischer Prüffragen
            </h4>
            <button
              onClick={handleClose}
              className="text-gray-500 hover:text-gray-700 text-sm"
            >
              Schließen
            </button>
          </div>

          <div className="bg-yellow-50 border border-yellow-200 rounded p-3 flex items-start gap-2">
            <Info size={16} className="text-yellow-600 mt-0.5 flex-shrink-0" />
            <div className="text-xs text-yellow-800">
              <strong>Datenschutz:</strong> Die App sendet keine Daten automatisch.
              {apiModeActive
                ? ' Standard ist Copy/Paste. API-Modus sendet nur auf Klick mit Consent.'
                : ' Sie kopieren den Prompt manuell in Claude und fügen die Antwort hier ein.'}
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded p-3 flex items-start gap-2">
              <AlertCircle size={16} className="text-red-600 mt-0.5 flex-shrink-0" />
              <div className="text-xs text-red-800">{error}</div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              1. Prompt für Claude (kopieren)
            </label>
            <textarea
              readOnly
              value={prompt}
              className="w-full h-32 p-2 border border-gray-300 rounded font-mono text-xs bg-white"
            />
            <button
              onClick={handleCopyPrompt}
              className="mt-2 px-3 py-1.5 bg-gray-700 text-white rounded hover:bg-gray-800 flex items-center gap-2 text-sm transition-colors"
            >
              {promptCopied ? (
                <>
                  <Check size={14} />
                  Kopiert!
                </>
              ) : (
                <>
                  <Copy size={14} />
                  Prompt kopieren
                </>
              )}
            </button>
          </div>

          {apiModeActive && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-blue-900 mb-3">API-Modus</h4>

              {apiEndpoint ? (
                <p className="text-xs text-blue-800 mb-2">
                  Endpoint: <span className="font-mono">{apiEndpoint}</span>
                </p>
              ) : (
                <div className="bg-yellow-50 border border-yellow-300 rounded p-2 mb-2">
                  <p className="text-xs text-yellow-800">Kein Endpoint konfiguriert. Bitte in den Einstellungen festlegen.</p>
                </div>
              )}

              <label className="flex items-start gap-2 text-xs text-blue-900 mb-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={apiConsent}
                  onChange={(e) => setApiConsent(e.target.checked)}
                  className="mt-0.5"
                />
                <span>Ich stimme der Übertragung an den konfigurierten Endpoint zu.</span>
              </label>

              <details className="mb-3">
                <summary className="text-xs text-blue-800 cursor-pointer mb-1">Request Preview</summary>
                <pre className="text-xs bg-white border border-blue-200 rounded p-2 overflow-auto max-h-32 font-mono">
                  {apiRequestPreview}
                </pre>
              </details>

              {apiError && (
                <div className="bg-red-50 border border-red-200 rounded p-2 mb-3">
                  <p className="text-xs text-red-800">{apiError}</p>
                </div>
              )}

              <button
                onClick={handleApiSend}
                disabled={!apiConsent || !apiEndpoint || apiRunning || !prompt.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2 text-sm transition-colors"
              >
                <Send size={14} />
                {apiRunning ? 'Sende...' : 'Per API senden (Antwort übernehmen)'}
              </button>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              2. Claude-Antwort (Markdown einfügen)
            </label>
            <textarea
              value={aiResponse}
              onChange={(e) => setAiResponse(e.target.value)}
              placeholder="Fügen Sie hier die Markdown-Antwort von Claude ein..."
              className="w-full h-48 p-2 border border-gray-300 rounded font-mono text-xs"
            />
            <div className="mt-2 flex gap-2">
              <button
                onClick={handleCopyResponse}
                disabled={!aiResponse}
                className="px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2 text-sm transition-colors"
              >
                {responseCopied ? (
                  <>
                    <Check size={14} />
                    Kopiert!
                  </>
                ) : (
                  <>
                    <Copy size={14} />
                    Antwort kopieren
                  </>
                )}
              </button>
              <button
                onClick={handleDownloadMarkdown}
                disabled={!aiResponse}
                className="px-3 py-1.5 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2 text-sm transition-colors"
              >
                <Download size={14} />
                Markdown exportieren
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
