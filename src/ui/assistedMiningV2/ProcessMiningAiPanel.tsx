import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ClipboardCopy, Loader, RefreshCw, Sparkles, Wand2 } from 'lucide-react';
import type { Process, ProcessMiningAssistedV2State, ProcessVersion } from '../../domain/process';
import type { AppSettings } from '../../settings/appSettings';
import { runAiProxyRequest } from '../../ai/aiApiClient';
import { applyPmAiRefinement, buildPmAiRefinementPrompt, parsePmAiRefinement } from './pmAi';

interface Props {
  process: Process;
  version: ProcessVersion;
  settings: AppSettings;
  state: ProcessMiningAssistedV2State;
  onApply: (patch: Partial<ProcessMiningAssistedV2State>) => void;
}

export function ProcessMiningAiPanel({ process, version, settings, state, onApply }: Props) {
  const casesWithText = state.cases.filter(caseItem => (caseItem.rawText || caseItem.narrative || '').trim().length > 0);
  const [selectedCaseId, setSelectedCaseId] = useState<string>(state.aiRefinement?.sourceCaseId ?? casesWithText[0]?.id ?? '');
  const [prompt, setPrompt] = useState(state.aiRefinement?.prompt ?? '');
  const [copied, setCopied] = useState(false);
  const [responseText, setResponseText] = useState(state.aiRefinement?.responseText ?? '');
  const [statusText, setStatusText] = useState(state.aiRefinement?.lastStatus ?? '');
  const [errorText, setErrorText] = useState(state.aiRefinement?.lastError ?? '');
  const [apiRunning, setApiRunning] = useState(false);

  useEffect(() => {
    if (!selectedCaseId && casesWithText[0]) {
      setSelectedCaseId(casesWithText[0].id);
    }
  }, [casesWithText, selectedCaseId]);

  const selectedCase = useMemo(
    () => state.cases.find(caseItem => caseItem.id === selectedCaseId) ?? casesWithText[0],
    [casesWithText, selectedCaseId, state.cases],
  );

  const selectedObservations = useMemo(
    () => state.observations.filter(observation => observation.sourceCaseId === selectedCase?.id),
    [selectedCase?.id, state.observations],
  );

  const apiAvailable = settings.dataHandlingMode === 'external' && settings.ai.mode === 'api' && settings.ai.api.endpointUrl.trim().length > 0;

  function persistAiState(patch: Partial<NonNullable<ProcessMiningAssistedV2State['aiRefinement']>>) {
    onApply({
      aiRefinement: {
        ...(state.aiRefinement ?? {}),
        ...patch,
      },
    });
  }

  function handleGeneratePrompt() {
    if (!selectedCase) {
      setErrorText('Bitte zuerst einen Fall oder ein Dokument auswählen.');
      return;
    }

    const generatedPrompt = buildPmAiRefinementPrompt({
      process,
      version,
      caseItem: selectedCase,
      existingObservations: selectedObservations,
      derivationSummary: state.lastDerivationSummary,
    });

    setPrompt(generatedPrompt);
    setErrorText('');
    setStatusText('KI-Prompt erzeugt.');
    persistAiState({ sourceCaseId: selectedCase.id, prompt: generatedPrompt, lastMode: apiAvailable ? 'api' : 'copy_paste', lastStatus: 'KI-Prompt erzeugt.', lastError: '' });
  }

  async function handleCopyPrompt() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch (error) {
      setErrorText(`Prompt konnte nicht kopiert werden: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function handleRunViaApi() {
    if (!prompt.trim()) {
      setErrorText('Bitte zuerst einen Prompt erzeugen.');
      return;
    }
    if (!apiAvailable) {
      setErrorText('Die API ist im Setup nicht aktiv oder kein Endpoint ist hinterlegt.');
      return;
    }

    setApiRunning(true);
    setErrorText('');
    setStatusText('Sende Prompt an die KI-API…');
    try {
      const response = await runAiProxyRequest({
        endpointUrl: settings.ai.api.endpointUrl,
        authMode: settings.ai.api.authMode,
        apiKey: settings.ai.api.apiKey,
        timeoutMs: settings.ai.api.timeoutMs,
        prompt,
      });
      setResponseText(response);
      setStatusText('KI-Antwort empfangen. Bitte prüfen und übernehmen.');
      persistAiState({ responseText: response, lastMode: 'api', lastStatus: 'KI-Antwort empfangen. Bitte prüfen und übernehmen.', lastError: '' });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setErrorText(message);
      setStatusText('');
      persistAiState({ lastMode: 'api', lastError: message });
    } finally {
      setApiRunning(false);
    }
  }

  function handleApplyResponse() {
    if (!selectedCase) {
      setErrorText('Bitte zuerst einen Fall oder ein Dokument auswählen.');
      return;
    }
    if (!responseText.trim()) {
      setErrorText('Bitte fügen Sie zuerst eine KI-Antwort ein.');
      return;
    }

    try {
      const parsed = parsePmAiRefinement(responseText);
      const applied = applyPmAiRefinement({
        cases: state.cases,
        observations: state.observations,
        caseId: selectedCase.id,
        parsed,
        sourceLabel: selectedCase.name,
        existingSummary: state.lastDerivationSummary,
      });
      const status = `${parsed.canonicalSteps.length} KI-verfeinerte Schritte übernommen.`;
      setStatusText(status);
      setErrorText('');
      onApply({
        cases: applied.cases,
        observations: applied.observations,
        qualitySummary: applied.qualitySummary,
        lastDerivationSummary: applied.summary,
        aiRefinement: {
          ...(state.aiRefinement ?? {}),
          sourceCaseId: selectedCase.id,
          prompt,
          responseText,
          lastAppliedAt: new Date().toISOString(),
          lastMode: apiAvailable ? 'api' : 'copy_paste',
          lastStatus: status,
          lastError: '',
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setErrorText(message);
      setStatusText('');
      persistAiState({ lastError: message, responseText });
    }
  }

  if (casesWithText.length === 0) {
    return null;
  }

  return (
    <div className="border border-violet-200 rounded-xl p-5 bg-violet-50/40 space-y-4">
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-violet-800">
          <Wand2 className="w-4 h-4" />
          <h3 className="text-sm font-semibold">Optional: mit KI verfeinern</h3>
        </div>
        <p className="text-xs text-slate-600">
          Die lokale Engine liefert einen belastbaren Erstentwurf. Optional kann eine KI die Schrittlabels, Rollen,
          Systeme und Reibungssignale weiter schärfen. Das funktioniert per Copy/Paste oder direkt über die API, wenn
          sie im Setup hinterlegt ist.
        </p>
      </div>

      <div className="grid md:grid-cols-[220px_minmax(0,1fr)] gap-3 items-start">
        <div className="space-y-1">
          <label className="block text-xs font-semibold text-slate-600">Quelle auswählen</label>
          <select
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
            value={selectedCaseId}
            onChange={event => setSelectedCaseId(event.target.value)}
          >
            {casesWithText.map(caseItem => (
              <option key={caseItem.id} value={caseItem.id}>{caseItem.name}</option>
            ))}
          </select>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleGeneratePrompt}
            className="flex items-center gap-1.5 px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-700 transition-colors"
          >
            <Sparkles className="w-4 h-4" />
            Prompt erzeugen
          </button>
          <button
            type="button"
            onClick={handleCopyPrompt}
            disabled={!prompt.trim()}
            className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 text-slate-700 rounded-lg text-sm hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {copied ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <ClipboardCopy className="w-4 h-4" />}
            {copied ? 'Kopiert' : 'Prompt kopieren'}
          </button>
          {apiAvailable && (
            <button
              type="button"
              onClick={handleRunViaApi}
              disabled={!prompt.trim() || apiRunning}
              className="flex items-center gap-1.5 px-3 py-2 border border-violet-200 text-violet-700 bg-white rounded-lg text-sm hover:bg-violet-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {apiRunning ? <Loader className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              {apiRunning ? 'API läuft…' : 'Per API ausführen'}
            </button>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-slate-600">Vorgeprägter KI-Prompt</label>
          <textarea
            rows={12}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs leading-relaxed font-mono focus:outline-none focus:ring-2 focus:ring-violet-400 resize-y bg-white"
            value={prompt}
            onChange={event => setPrompt(event.target.value)}
            placeholder="Hier erscheint der strukturierte Prompt für die KI."
          />
        </div>
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-slate-600">KI-Antwort einfügen</label>
          <textarea
            rows={12}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs leading-relaxed font-mono focus:outline-none focus:ring-2 focus:ring-violet-400 resize-y bg-white"
            value={responseText}
            onChange={event => {
              setResponseText(event.target.value);
              persistAiState({ responseText: event.target.value, sourceCaseId: selectedCase?.id });
            }}
            placeholder='Fügen Sie hier die JSON-Antwort der KI ein.'
          />
          <button
            type="button"
            onClick={handleApplyResponse}
            disabled={!responseText.trim()}
            className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Wand2 className="w-4 h-4" />
            KI-Ergebnis übernehmen
          </button>
        </div>
      </div>

      {statusText && (
        <div className="flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-800">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{statusText}</span>
        </div>
      )}

      {errorText && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{errorText}</span>
        </div>
      )}
    </div>
  );
}
