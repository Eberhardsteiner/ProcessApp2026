import { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, Copy, CheckCircle, AlertTriangle, Loader, Sparkles } from 'lucide-react';
import type { Process, ProcessVersion, ImprovementBacklogItem, ImprovementCategory, ImprovementScope, Level3 } from '../domain/process';
import type { AppSettings } from '../settings/appSettings';
import { buildClaudeAssistedImprovementSuggestionsPrompt } from '../ai/claudeAssistedImprovementSuggestionsPrompt';
import { parseAiImprovementSuggestions, validateAndNormalizeSuggestions } from '../ai/aiImprovementSuggestions';
import { runAiProxyRequest } from '../ai/aiApiClient';
import { startWebSpeechTranscription, type WebSpeechSession } from '../speech/webSpeechTranscription';
import { isWebSpeechSupported } from '../speech/transcriptionProviders';

interface AssistedOptimizationAiMeasuresProps {
  process: Process;
  version: ProcessVersion;
  settings: AppSettings;
  onSave: (patch: Partial<ProcessVersion>) => Promise<void>;
}

interface ParsedSuggestion {
  title: string;
  description?: string;
  category: ImprovementCategory;
  scope: ImprovementScope;
  relatedStepId?: string;
  impact: Level3;
  effort: Level3;
  risk: Level3;
  automationBlueprint?: ImprovementBacklogItem['automationBlueprint'];
  duplicate: boolean;
  selected: boolean;
}

function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/\s+/g, ' ').trim();
}

export function AssistedOptimizationAiMeasures({ process, version, settings, onSave }: AssistedOptimizationAiMeasuresProps) {
  const brief = version.sidecar.assistedOptimizationBrief || {};

  const [aiMode, setAiMode] = useState<'copy_paste' | 'api'>(
    settings.ai.mode === 'api' ? 'api' : 'copy_paste'
  );
  const [narrative, setNarrative] = useState(brief.visionNarrative || '');
  const [prompt, setPrompt] = useState('');
  const [promptCopied, setPromptCopied] = useState(false);
  const [responseText, setResponseText] = useState('');
  const [parsedSuggestions, setParsedSuggestions] = useState<ParsedSuggestion[]>([]);
  const [statusText, setStatusText] = useState('');
  const [errorText, setErrorText] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [assumptions, setAssumptions] = useState<string[]>([]);
  const [apiRunning, setApiRunning] = useState(false);
  const [apiError, setApiError] = useState('');

  const [recordingField, setRecordingField] = useState<'narrative' | null>(null);
  const [interimTranscript, setInterimTranscript] = useState('');
  const sessionRef = useRef<WebSpeechSession | null>(null);

  const canUseSpeech =
    settings.dataHandlingMode === 'external' &&
    settings.transcription.providerId === 'web_speech' &&
    isWebSpeechSupported();

  useEffect(() => {
    return () => {
      if (sessionRef.current) {
        sessionRef.current.abort();
      }
    };
  }, []);

  const handleStartRecording = () => {
    if (!canUseSpeech || recordingField) return;

    setRecordingField('narrative');
    setInterimTranscript('');

    const session = startWebSpeechTranscription(
      {
        language: settings.transcription.language,
        interimResults: true,
        continuous: true,
      },
      {
        onInterim: (text) => setInterimTranscript(text),
        onFinal: (text) => {
          if (text.trim()) {
            setNarrative((prev) => {
              const joined = prev ? `${prev} ${text}` : text;
              return joined;
            });
          }
        },
        onEnd: () => {
          setRecordingField(null);
          setInterimTranscript('');
          sessionRef.current = null;
        },
        onError: (error) => {
          console.error('Speech recognition error:', error);
          setRecordingField(null);
          setInterimTranscript('');
          sessionRef.current = null;
        },
      }
    );

    sessionRef.current = session;
  };

  const handleStopRecording = () => {
    if (sessionRef.current) {
      sessionRef.current.abort();
    }
  };

  const handleGeneratePrompt = () => {
    setErrorText('');
    setPrompt('');
    setPromptCopied(false);

    try {
      const existingTitles = (version.sidecar.improvementBacklog || [])
        .map((i) => i.title)
        .filter(Boolean);

      const generatedPrompt = buildClaudeAssistedImprovementSuggestionsPrompt({
        process,
        version,
        existingTitles,
        userNarrative: narrative.trim(),
      });

      setPrompt(generatedPrompt);
    } catch (error) {
      setErrorText(`Fehler beim Generieren des Prompts: ${String(error)}`);
    }
  };

  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setPromptCopied(true);
      setTimeout(() => setPromptCopied(false), 2000);
    } catch (error) {
      setErrorText(`Fehler beim Kopieren: ${String(error)}`);
    }
  };

  const handleParseResponse = () => {
    setErrorText('');
    setWarnings([]);
    setAssumptions([]);
    setParsedSuggestions([]);
    setStatusText('');

    if (!responseText.trim()) {
      setErrorText('Bitte fügen Sie die KI-Antwort ein.');
      return;
    }

    try {
      const parsed = parseAiImprovementSuggestions(responseText);

      const systemIds = new Set((version.sidecar.systems || []).map((s) => s.id));
      const dataObjectIds = new Set((version.sidecar.dataObjects || []).map((d) => d.id));
      const kpiIds = new Set((version.sidecar.kpis || []).map((k) => k.id));
      const stepIds = new Set(
        (version.sidecar.captureDraft?.happyPath || []).map((s) => s.stepId)
      );

      const { normalized, warnings: validationWarnings } = validateAndNormalizeSuggestions({
        result: parsed,
        allowed: { systemIds, dataObjectIds, kpiIds, stepIds },
      });

      setWarnings(validationWarnings);
      setAssumptions(normalized.assumptions || []);

      const existingTitles = new Set(
        (version.sidecar.improvementBacklog || []).map((i) => normalizeTitle(i.title))
      );

      const suggestions: ParsedSuggestion[] = normalized.suggestions.map((s) => {
        const isDuplicate = existingTitles.has(normalizeTitle(s.title));
        return {
          title: s.title,
          description: s.description,
          category: s.category,
          scope: s.scope,
          relatedStepId: s.relatedStepId,
          impact: s.impact,
          effort: s.effort,
          risk: s.risk,
          automationBlueprint: s.automationBlueprint,
          duplicate: isDuplicate,
          selected: !isDuplicate,
        };
      });

      setParsedSuggestions(suggestions);
      setStatusText(
        `${suggestions.length} Vorschläge gefunden, davon ${suggestions.filter((s) => !s.duplicate).length} neu.`
      );
    } catch (error) {
      setErrorText(`Fehler beim Parsen: ${String(error)}`);
    }
  };

  const handleApplySuggestions = async () => {
    const selected = parsedSuggestions.filter((s) => s.selected && !s.duplicate);

    if (selected.length === 0) {
      setErrorText('Keine neuen Vorschläge ausgewählt.');
      return;
    }

    const existingBacklog = version.sidecar.improvementBacklog || [];
    const now = new Date().toISOString();

    const newItems: ImprovementBacklogItem[] = selected.map((s) => {
      const descriptionPrefix = 'KI-Vorschlag (Assistenzmodus)';
      const fullDescription = s.description
        ? `${descriptionPrefix}\n\n${s.description}`
        : descriptionPrefix;

      return {
        id: crypto.randomUUID(),
        title: s.title,
        category: s.category,
        scope: s.scope,
        relatedStepId: s.relatedStepId,
        description: fullDescription,
        impact: s.impact,
        effort: s.effort,
        risk: s.risk,
        status: 'idea' as const,
        createdAt: now,
        updatedAt: now,
        automationBlueprint: s.automationBlueprint,
      };
    });

    try {
      await onSave({
        sidecar: {
          ...version.sidecar,
          assistedOptimizationBrief: {
            ...(version.sidecar.assistedOptimizationBrief || {}),
            visionNarrative: narrative.trim() || undefined,
            updatedAt: now,
          },
          improvementBacklog: [...existingBacklog, ...newItems],
        },
      });

      setStatusText(`${newItems.length} Maßnahmen erfolgreich übernommen.`);
      setParsedSuggestions([]);
      setResponseText('');
      setPrompt('');
    } catch (error) {
      setErrorText(`Fehler beim Speichern: ${String(error)}`);
    }
  };

  const handleApiGenerate = async () => {
    setApiRunning(true);
    setApiError('');
    setErrorText('');
    setWarnings([]);
    setAssumptions([]);
    setParsedSuggestions([]);
    setStatusText('');

    try {
      const existingTitles = (version.sidecar.improvementBacklog || [])
        .map((i) => i.title)
        .filter(Boolean);

      const generatedPrompt = buildClaudeAssistedImprovementSuggestionsPrompt({
        process,
        version,
        existingTitles,
        userNarrative: narrative.trim(),
      });

      const response = await runAiProxyRequest({
        endpointUrl: settings.ai.api.endpointUrl,
        authMode: settings.ai.api.authMode,
        apiKey: settings.ai.api.apiKey,
        timeoutMs: settings.ai.api.timeoutMs,
        prompt: generatedPrompt,
      });

      const parsed = parseAiImprovementSuggestions(response);

      const systemIds = new Set((version.sidecar.systems || []).map((s) => s.id));
      const dataObjectIds = new Set((version.sidecar.dataObjects || []).map((d) => d.id));
      const kpiIds = new Set((version.sidecar.kpis || []).map((k) => k.id));
      const stepIds = new Set(
        (version.sidecar.captureDraft?.happyPath || []).map((s) => s.stepId)
      );

      const { normalized, warnings: validationWarnings } = validateAndNormalizeSuggestions({
        result: parsed,
        allowed: { systemIds, dataObjectIds, kpiIds, stepIds },
      });

      setWarnings(validationWarnings);
      setAssumptions(normalized.assumptions || []);

      const existingTitles2 = new Set(
        (version.sidecar.improvementBacklog || []).map((i) => normalizeTitle(i.title))
      );

      const suggestions: ParsedSuggestion[] = normalized.suggestions.map((s) => {
        const isDuplicate = existingTitles2.has(normalizeTitle(s.title));
        return {
          title: s.title,
          description: s.description,
          category: s.category,
          scope: s.scope,
          relatedStepId: s.relatedStepId,
          impact: s.impact,
          effort: s.effort,
          risk: s.risk,
          automationBlueprint: s.automationBlueprint,
          duplicate: isDuplicate,
          selected: !isDuplicate,
        };
      });

      const selected = suggestions.filter((s) => s.selected && !s.duplicate);

      if (selected.length === 0) {
        setStatusText('Keine neuen Vorschläge generiert.');
        setApiRunning(false);
        return;
      }

      const existingBacklog = version.sidecar.improvementBacklog || [];
      const now = new Date().toISOString();

      const newItems: ImprovementBacklogItem[] = selected.map((s) => {
        const descriptionPrefix = 'KI-Vorschlag (Assistenzmodus)';
        const fullDescription = s.description
          ? `${descriptionPrefix}\n\n${s.description}`
          : descriptionPrefix;

        return {
          id: crypto.randomUUID(),
          title: s.title,
          category: s.category,
          scope: s.scope,
          relatedStepId: s.relatedStepId,
          description: fullDescription,
          impact: s.impact,
          effort: s.effort,
          risk: s.risk,
          status: 'idea' as const,
          createdAt: now,
          updatedAt: now,
          automationBlueprint: s.automationBlueprint,
        };
      });

      await onSave({
        sidecar: {
          ...version.sidecar,
          assistedOptimizationBrief: {
            ...(version.sidecar.assistedOptimizationBrief || {}),
            visionNarrative: narrative.trim() || undefined,
            updatedAt: now,
          },
          improvementBacklog: [...existingBacklog, ...newItems],
        },
      });

      setStatusText(`${newItems.length} Maßnahmen automatisch erstellt und übernommen.`);
    } catch (error) {
      setApiError(`Fehler bei API-Generierung: ${String(error)}`);
    } finally {
      setApiRunning(false);
    }
  };

  const toggleSuggestion = (index: number) => {
    setParsedSuggestions((prev) =>
      prev.map((s, i) => (i === index ? { ...s, selected: !s.selected } : s))
    );
  };

  const apiAvailable =
    settings.dataHandlingMode === 'external' && settings.ai.api.endpointUrl.trim() !== '';

  const getPrimaryButtonLabel = (): string => {
    if (aiMode === 'api') {
      return 'Vorschläge automatisch erstellen';
    }

    if (!prompt) {
      return 'Prompt erstellen';
    }

    if (!responseText) {
      return 'Promptergebnis übernehmen';
    }

    if (parsedSuggestions.length > 0) {
      return 'Ausgewählte übernehmen';
    }

    return 'Promptergebnis übernehmen';
  };

  const handlePrimaryAction = () => {
    if (aiMode === 'api') {
      handleApiGenerate();
      return;
    }

    if (!prompt) {
      handleGeneratePrompt();
      return;
    }

    if (!responseText) {
      handleParseResponse();
      return;
    }

    if (parsedSuggestions.length > 0) {
      handleApplySuggestions();
      return;
    }

    handleParseResponse();
  };

  const showPromptArea = aiMode === 'copy_paste' && prompt;
  const showResponseArea = aiMode === 'copy_paste';

  return (
    <div className="pm-card pm-card-pad">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="w-5 h-5 text-blue-600" />
        <h3 className="text-lg font-semibold text-gray-900">
          KI‑Maßnahmen aus Ihrer Beschreibung
        </h3>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Wie könnte der Prozess besser ablaufen?
          </label>
          <div className="relative">
            <textarea
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              rows={4}
              value={narrative + (recordingField === 'narrative' ? ` ${interimTranscript}` : '')}
              onChange={(e) => setNarrative(e.target.value)}
              placeholder="Beschreiben Sie, wie der Prozess idealerweise ablaufen sollte..."
            />
            {canUseSpeech && (
              <button
                type="button"
                onClick={recordingField ? handleStopRecording : handleStartRecording}
                className={`absolute bottom-2 right-2 p-2 rounded-full transition-colors ${
                  recordingField
                    ? 'bg-red-100 text-red-600 hover:bg-red-200'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
                title={recordingField ? 'Aufnahme stoppen' : 'Spracheingabe starten'}
              >
                {recordingField ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">Modus:</span>
          <div className="inline-flex rounded-md shadow-sm" role="group">
            <button
              type="button"
              onClick={() => setAiMode('copy_paste')}
              className={`px-3 py-1.5 text-sm font-medium rounded-l-md border ${
                aiMode === 'copy_paste'
                  ? 'bg-blue-50 text-blue-700 border-blue-300'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              Copy/Paste
            </button>
            <button
              type="button"
              onClick={() => setAiMode('api')}
              disabled={!apiAvailable}
              className={`px-3 py-1.5 text-sm font-medium rounded-r-md border-t border-b border-r ${
                aiMode === 'api'
                  ? 'bg-blue-50 text-blue-700 border-blue-300'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed'
              }`}
            >
              Automatisch (API)
            </button>
          </div>
        </div>

        {showPromptArea && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Generierter Prompt
            </label>
            <textarea
              className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-sm font-mono"
              rows={6}
              value={prompt}
              readOnly
            />
          </div>
        )}

        {showResponseArea && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              KI-Antwort einfügen
            </label>
            <textarea
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono"
              rows={6}
              value={responseText}
              onChange={(e) => setResponseText(e.target.value)}
              placeholder="Fügen Sie hier die Antwort der KI ein..."
            />
          </div>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={handlePrimaryAction}
            disabled={apiRunning}
            className="pm-btn-primary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {apiRunning && <Loader className="w-4 h-4 animate-spin" />}
            {getPrimaryButtonLabel()}
          </button>

          {aiMode === 'copy_paste' && prompt && (
            <button
              type="button"
              onClick={handleCopyPrompt}
              className="pm-btn-secondary flex items-center gap-2"
            >
              {promptCopied ? (
                <>
                  <CheckCircle className="w-4 h-4" />
                  Kopiert
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  Prompt kopieren
                </>
              )}
            </button>
          )}
        </div>

        {statusText && (
          <div className="flex items-start gap-2 p-3 bg-green-50 border border-green-200 rounded-md">
            <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-green-800">{statusText}</p>
          </div>
        )}

        {(errorText || apiError) && (
          <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-md">
            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-800">{errorText || apiError}</p>
          </div>
        )}

        {warnings.length > 0 && (
          <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-md">
            <p className="text-sm font-medium text-yellow-800 mb-1">Warnungen:</p>
            <ul className="text-sm text-yellow-700 space-y-0.5 list-disc list-inside">
              {warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        )}

        {assumptions.length > 0 && (
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
            <p className="text-sm font-medium text-blue-800 mb-1">Annahmen:</p>
            <ul className="text-sm text-blue-700 space-y-0.5 list-disc list-inside">
              {assumptions.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          </div>
        )}

        {parsedSuggestions.length > 0 && (
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Vorschläge:</p>
            <div className="space-y-2">
              {parsedSuggestions.map((s, i) => (
                <div
                  key={i}
                  className={`flex items-start gap-2 p-2 border rounded ${
                    s.duplicate
                      ? 'bg-gray-50 border-gray-200 opacity-60'
                      : 'bg-white border-gray-300'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={s.selected}
                    disabled={s.duplicate}
                    onChange={() => toggleSuggestion(i)}
                    className="mt-1"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">
                      {s.title}
                      {s.duplicate && (
                        <span className="ml-2 text-xs text-gray-500">(bereits vorhanden)</span>
                      )}
                    </p>
                    <p className="text-xs text-gray-600">
                      {s.category} • {s.scope}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="pt-2 border-t border-gray-200">
          <p className="text-xs text-gray-600">
            Alle übernommenen Maßnahmen sind später im Expertenmodus vollständig bearbeitbar.
          </p>
        </div>
      </div>
    </div>
  );
}
