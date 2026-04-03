import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardCopy,
  Loader,
  RefreshCw,
  Sparkles,
  Wand2,
} from 'lucide-react';
import type { Process, ProcessMiningAssistedV2State, ProcessVersion } from '../../domain/process';
import type { AppSettings } from '../../settings/appSettings';
import { runAiProxyRequest } from '../../ai/aiApiClient';
import {
  applyPmAiRefinement,
  buildPmAiRefinementPrompt,
  parsePmAiRefinement,
  PM_AI_RESPONSE_SCHEMA_EXAMPLE,
  type PmAiPromptFocus,
} from './pmAi';
import { getAnalysisModeLabel } from './pmShared';
import { HelpPopover } from '../components/HelpPopover';

interface Props {
  process: Process;
  version: ProcessVersion;
  settings: AppSettings;
  state: ProcessMiningAssistedV2State;
  onApply: (patch: Partial<ProcessMiningAssistedV2State>) => void;
}

const FOCUS_OPTIONS: Array<{ value: PmAiPromptFocus; label: string; hint: string }> = [
  {
    value: 'balanced',
    label: 'Ausgewogen',
    hint: 'Schritte und Reibungen gemeinsam schärfen.',
  },
  {
    value: 'steps',
    label: 'Schrittreihenfolge',
    hint: 'Vor allem Schrittlabels, Reihenfolge und Rollen glätten.',
  },
  {
    value: 'frictions',
    label: 'Reibungen & Risiken',
    hint: 'Vor allem fehlende Angaben, Reibungen und Warnhinweise schärfen.',
  },
];

export function ProcessMiningAiPanel({ process, version, settings, state, onApply }: Props) {
  const casesWithText = state.cases.filter(
    caseItem => (caseItem.rawText || caseItem.narrative || '').trim().length > 0,
  );
  const [selectedCaseId, setSelectedCaseId] = useState<string>(
    state.aiRefinement?.sourceCaseId ?? casesWithText[0]?.id ?? '',
  );
  const [promptFocus, setPromptFocus] = useState<PmAiPromptFocus>(
    state.aiRefinement?.promptFocus ?? 'balanced',
  );
  const [prompt, setPrompt] = useState(state.aiRefinement?.prompt ?? '');
  const [copied, setCopied] = useState(false);
  const [responseText, setResponseText] = useState(state.aiRefinement?.responseText ?? '');
  const [statusText, setStatusText] = useState(state.aiRefinement?.lastStatus ?? '');
  const [errorText, setErrorText] = useState(state.aiRefinement?.lastError ?? '');
  const [apiRunning, setApiRunning] = useState(false);
  const [panelOpen, setPanelOpen] = useState(
    Boolean(state.aiRefinement?.prompt || state.aiRefinement?.responseText || state.aiRefinement?.lastAppliedAt || state.aiRefinement?.lastError),
  );

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
    () =>
      state.observations
        .filter(observation => observation.sourceCaseId === selectedCase?.id)
        .sort((a, b) => a.sequenceIndex - b.sequenceIndex),
    [selectedCase?.id, state.observations],
  );

  const localSteps = selectedObservations.filter(observation => observation.kind === 'step');
  const localIssues = selectedObservations.filter(observation => observation.kind === 'issue');
  const apiAvailable =
    settings.dataHandlingMode === 'external' &&
    settings.ai.mode === 'api' &&
    settings.ai.api.endpointUrl.trim().length > 0;

  const preview = useMemo(() => {
    if (!responseText.trim()) return { parsed: null as ReturnType<typeof parsePmAiRefinement> | null, error: '' };
    try {
      return { parsed: parsePmAiRefinement(responseText), error: '' };
    } catch (error) {
      return {
        parsed: null,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }, [responseText]);

  function persistAiState(
    patch: Partial<NonNullable<ProcessMiningAssistedV2State['aiRefinement']>>,
  ) {
    onApply({
      aiRefinement: {
        ...(state.aiRefinement ?? {}),
        ...patch,
      },
    });
  }

  function buildPromptNow(): string {
    if (!selectedCase) {
      throw new Error('Bitte zuerst einen Fall oder ein Dokument auswählen.');
    }
    return buildPmAiRefinementPrompt({
      process,
      version,
      caseItem: selectedCase,
      existingObservations: selectedObservations,
      derivationSummary: state.lastDerivationSummary,
      promptFocus,
    });
  }

  function handleGeneratePrompt() {
    try {
      const generatedPrompt = buildPromptNow();
      setPrompt(generatedPrompt);
      setErrorText('');
      setStatusText('KI-Prompt erzeugt. Sie können ihn jetzt kopieren oder direkt per API senden.');
      persistAiState({
        sourceCaseId: selectedCase?.id,
        prompt: generatedPrompt,
        promptFocus,
        lastMode: apiAvailable ? 'api' : 'copy_paste',
        lastStatus: 'KI-Prompt erzeugt. Sie können ihn jetzt kopieren oder direkt per API senden.',
        lastError: '',
      });
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleCopyPrompt() {
    try {
      const promptToCopy = prompt.trim() ? prompt : buildPromptNow();
      if (!prompt.trim()) {
        setPrompt(promptToCopy);
        persistAiState({ sourceCaseId: selectedCase?.id, prompt: promptToCopy, promptFocus });
      }
      await navigator.clipboard.writeText(promptToCopy);
      setCopied(true);
      setStatusText('Prompt in die Zwischenablage kopiert.');
      setErrorText('');
      setTimeout(() => setCopied(false), 1800);
    } catch (error) {
      setErrorText(`Prompt konnte nicht kopiert werden: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function handleRunViaApi() {
    if (!apiAvailable) {
      setErrorText('Die API ist im Setup nicht aktiv oder es ist kein Endpoint hinterlegt.');
      return;
    }

    setApiRunning(true);
    setErrorText('');
    try {
      const promptToSend = prompt.trim() ? prompt : buildPromptNow();
      if (!prompt.trim()) {
        setPrompt(promptToSend);
        persistAiState({ sourceCaseId: selectedCase?.id, prompt: promptToSend, promptFocus });
      }
      setStatusText('Sende Prompt an die KI-API…');
      const response = await runAiProxyRequest({
        endpointUrl: settings.ai.api.endpointUrl,
        authMode: settings.ai.api.authMode,
        apiKey: settings.ai.api.apiKey,
        timeoutMs: settings.ai.api.timeoutMs,
        prompt: promptToSend,
      });
      setResponseText(response);
      setStatusText('KI-Antwort empfangen. Bitte Vorschau prüfen und dann übernehmen.');
      persistAiState({
        responseText: response,
        prompt: promptToSend,
        promptFocus,
        lastMode: 'api',
        lastStatus: 'KI-Antwort empfangen. Bitte Vorschau prüfen und dann übernehmen.',
        lastError: '',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setErrorText(message);
      setStatusText('');
      persistAiState({ lastMode: 'api', lastError: message, promptFocus });
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
      const parsed = preview.parsed ?? parsePmAiRefinement(responseText);
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
          promptFocus,
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
      persistAiState({ lastError: message, responseText, promptFocus });
    }
  }

  if (casesWithText.length === 0) {
    return null;
  }

  const hasAiProgress = Boolean(prompt.trim() || responseText.trim() || state.aiRefinement?.lastAppliedAt);

  return (
    <div className="border border-violet-200 rounded-2xl p-5 bg-violet-50/40 space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-violet-900">
            <Wand2 className="w-4 h-4" />
            <h3 className="text-sm font-semibold">Optional: mit KI verfeinern</h3>
            <HelpPopover helpKey="pmv2.ai" ariaLabel="Hilfe: Optionale KI-Verfeinerung" />
            <span className="rounded-full bg-white border border-violet-200 px-2 py-0.5 text-[11px] font-medium text-violet-700">
              {apiAvailable ? 'API direkt verfügbar' : 'Copy/Paste bereit'}
            </span>
            <span className="rounded-full bg-white border border-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-600">
              Für die lokale Analyse nicht nötig
            </span>
          </div>
          <p className="text-sm text-slate-600 leading-relaxed">
            Die lokale Engine bleibt führend. Öffnen Sie diesen Bereich nur dann, wenn Sie Schrittlabels, Rollen, Systeme oder
            Reibungssignale mit KI weiter schärfen möchten.
          </p>
          {!panelOpen && (
            <p className="text-xs text-slate-500 leading-relaxed">
              {hasAiProgress
                ? 'Es liegt bereits ein Prompt oder ein KI-Ergebnis vor. Sie können die Verfeinerung jederzeit wieder öffnen.'
                : 'Standardweg: erst lokal prüfen, dann nur bei Bedarf mit KI verfeinern.'}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={() => setPanelOpen(open => !open)}
          className="inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-white px-3.5 py-2 text-sm font-medium text-violet-700 hover:bg-violet-50 transition-colors"
        >
          {panelOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          {panelOpen ? 'KI-Bereich ausblenden' : 'KI-Bereich öffnen'}
        </button>
      </div>

      {panelOpen && (
        <div className="grid gap-4 xl:grid-cols-[1.05fr_1.2fr]">
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600">1. Quelle auswählen</label>
              <select
                className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                value={selectedCaseId}
                onChange={event => {
                  setSelectedCaseId(event.target.value);
                  setErrorText('');
                  persistAiState({ sourceCaseId: event.target.value });
                }}
              >
                {casesWithText.map(caseItem => (
                  <option key={caseItem.id} value={caseItem.id}>
                    {caseItem.name}
                  </option>
                ))}
              </select>
            </div>

            {selectedCase && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
                <div className="flex flex-wrap gap-2 text-xs text-slate-600">
                  {selectedCase.sourceType && (
                    <span className="rounded-full bg-white border border-slate-200 px-2 py-0.5">
                      Quelle: {selectedCase.sourceType}
                    </span>
                  )}
                  <span className="rounded-full bg-white border border-slate-200 px-2 py-0.5">
                    {localSteps.length} lokale Schritte
                  </span>
                  <span className="rounded-full bg-white border border-slate-200 px-2 py-0.5">
                    {localIssues.length} Reibungssignale
                  </span>
                </div>
                {selectedCase.derivedStepLabels && selectedCase.derivedStepLabels.length > 0 && (
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Lokale Hauptlinie: {selectedCase.derivedStepLabels.slice(0, 4).join(' → ')}
                    {selectedCase.derivedStepLabels.length > 4 ? ' → …' : ''}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
            <div>
              <p className="text-xs font-semibold text-slate-600">2. Ziel der Verfeinerung</p>
              <p className="mt-1 text-xs text-slate-500">
                Legen Sie fest, worauf der Prompt die KI besonders ausrichten soll.
              </p>
            </div>
            <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-1">
              {FOCUS_OPTIONS.map(option => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    setPromptFocus(option.value);
                    persistAiState({ promptFocus: option.value });
                  }}
                  className={`rounded-xl border px-3 py-3 text-left transition-colors ${
                    promptFocus === option.value
                      ? 'border-violet-300 bg-violet-50 text-violet-900'
                      : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-white'
                  }`}
                >
                  <p className="text-sm font-semibold">{option.label}</p>
                  <p className="mt-1 text-xs leading-relaxed opacity-80">{option.hint}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="text-xs font-semibold text-slate-600">3. Prompt erzeugen oder direkt senden</p>
                <p className="mt-1 text-xs text-slate-500">
                  Die App erzeugt einen vorstrukturierten Prompt auf Basis der lokalen Analyse.
                </p>
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
                  className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 text-slate-700 rounded-lg text-sm hover:bg-slate-50 transition-colors"
                >
                  {copied ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <ClipboardCopy className="w-4 h-4" />}
                  {copied ? 'Kopiert' : 'Prompt kopieren'}
                </button>
                {apiAvailable && (
                  <button
                    type="button"
                    onClick={handleRunViaApi}
                    disabled={apiRunning}
                    className="flex items-center gap-1.5 px-3 py-2 border border-violet-200 text-violet-700 bg-white rounded-lg text-sm hover:bg-violet-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {apiRunning ? <Loader className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    {apiRunning ? 'API läuft…' : 'Per API senden'}
                  </button>
                )}
              </div>
            </div>

            <textarea
              rows={13}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs leading-relaxed font-mono focus:outline-none focus:ring-2 focus:ring-violet-400 resize-y bg-slate-950 text-slate-50"
              value={prompt}
              onChange={event => {
                setPrompt(event.target.value);
                persistAiState({ prompt: event.target.value, sourceCaseId: selectedCase?.id, promptFocus });
              }}
              placeholder="Hier erscheint der strukturierte Prompt für die KI."
            />
            <details className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <summary className="cursor-pointer text-xs font-semibold text-slate-700">
                Erwartetes JSON-Format anzeigen
              </summary>
              <pre className="mt-3 overflow-auto rounded-lg bg-slate-900 p-3 text-[11px] leading-relaxed text-slate-100 whitespace-pre-wrap">
                {PM_AI_RESPONSE_SCHEMA_EXAMPLE}
              </pre>
            </details>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="text-xs font-semibold text-slate-600">4. KI-Antwort prüfen und übernehmen</p>
                <p className="mt-1 text-xs text-slate-500">
                  Die Antwort wird vor dem Übernehmen lokal geprüft. Erst danach ersetzt sie die bisherige Ableitung für die gewählte Quelle.
                </p>
              </div>
              <button
                type="button"
                onClick={handleApplyResponse}
                disabled={!responseText.trim() || Boolean(preview.error)}
                className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <Wand2 className="w-4 h-4" />
                KI-Ergebnis übernehmen
              </button>
            </div>

            <textarea
              rows={13}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs leading-relaxed font-mono focus:outline-none focus:ring-2 focus:ring-violet-400 resize-y bg-white"
              value={responseText}
              onChange={event => {
                setResponseText(event.target.value);
                persistAiState({ responseText: event.target.value, sourceCaseId: selectedCase?.id, promptFocus });
              }}
              placeholder="Fügen Sie hier die JSON-Antwort der KI ein. Bei API-Nutzung landet die Antwort automatisch hier."
            />

            {preview.parsed && (
              <div className="rounded-xl border border-green-200 bg-green-50 p-4 space-y-3">
                <div className="flex items-center gap-2 text-green-800">
                  <CheckCircle2 className="w-4 h-4" />
                  <p className="text-sm font-semibold">Antwortformat ist lesbar</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-4">
                  <div className="rounded-lg border border-green-200 bg-white px-3 py-2">
                    <p className="text-[11px] uppercase tracking-wide text-slate-500">Schritte</p>
                    <p className="text-lg font-semibold text-slate-900">{preview.parsed.canonicalSteps.length}</p>
                  </div>
                  <div className="rounded-lg border border-green-200 bg-white px-3 py-2">
                    <p className="text-[11px] uppercase tracking-wide text-slate-500">Signale</p>
                    <p className="text-lg font-semibold text-slate-900">{preview.parsed.issueSignals?.length ?? 0}</p>
                  </div>
                  <div className="rounded-lg border border-green-200 bg-white px-3 py-2">
                    <p className="text-[11px] uppercase tracking-wide text-slate-500">Rollen</p>
                    <p className="text-lg font-semibold text-slate-900">{preview.parsed.roles?.length ?? 0}</p>
                  </div>
                  <div className="rounded-lg border border-green-200 bg-white px-3 py-2">
                    <p className="text-[11px] uppercase tracking-wide text-slate-500">Analysemodus</p>
                    <p className="text-sm font-semibold text-slate-900 mt-1">
                      {getAnalysisModeLabel(preview.parsed.analysisMode ?? 'process-draft')}
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-semibold text-slate-600">Vorschau der KI-Schritte</p>
                  <ol className="space-y-1.5">
                    {preview.parsed.canonicalSteps.slice(0, 6).map((step, index) => (
                      <li key={`${step.label}-${index}`} className="flex items-start gap-2 rounded-lg border border-green-200 bg-white px-3 py-2 text-sm text-slate-700">
                        <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-100 text-[11px] font-semibold text-green-700">
                          {index + 1}
                        </span>
                        <span>
                          <span className="font-medium text-slate-900">{step.label}</span>
                          {step.role ? ` · Rolle: ${step.role}` : ''}
                          {step.system ? ` · System: ${step.system}` : ''}
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>

                {preview.parsed.warnings && preview.parsed.warnings.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-slate-600">Warnhinweise der KI</p>
                    {preview.parsed.warnings.slice(0, 4).map((warning, index) => (
                      <p key={`${warning}-${index}`} className="text-xs text-slate-600 leading-relaxed">
                        • {warning}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}

            {preview.error && responseText.trim() && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{preview.error}</span>
              </div>
            )}
          </div>
        </div>
        </div>
      )}

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
