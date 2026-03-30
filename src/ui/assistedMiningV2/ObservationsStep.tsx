import { useMemo, useState } from 'react';
import { ArrowRight, FileText, Info, MessageSquare, Plus, Sparkles, Upload } from 'lucide-react';
import type {
  DerivationSummary,
  Process,
  ProcessMiningAssistedV2State,
  ProcessMiningObservation,
  ProcessMiningObservationCase,
  ProcessMiningQualitySummary,
  ProcessVersion,
} from '../../domain/process';
import type { AppSettings } from '../../settings/appSettings';
import { NarrativeCaseCard } from './NarrativeCaseCard';
import { ObservationEditor } from './ObservationEditor';
import { ObservationIntakePanel } from './ObservationIntakePanel';
import { FileImportPanel } from './FileImportPanel';
import { ProcessMiningAiPanel } from './ProcessMiningAiPanel';
import { QualitySummaryCard } from './QualitySummaryCard';
import { StepReviewWorkbench } from './StepReviewWorkbench';
import { buildReviewOverview } from './reviewSuggestions';
import { deriveProcessArtifactsFromText } from './documentDerivation';
import { computeQualitySummary } from './narrativeParsing';
import { getAnalysisModeLabel } from './pmShared';
import { InstantAnalysisPanel } from './InstantAnalysisPanel';
import { computeInstantAnalysisSnapshot } from './instantAnalysis';

type InputTab = 'describe' | 'upload';

interface Props {
  process: Process;
  version: ProcessVersion;
  settings: AppSettings;
  state: ProcessMiningAssistedV2State;
  onChange: (patch: Partial<ProcessMiningAssistedV2State>) => void;
  onNext: () => void;
  onGoToStep: (step: ProcessMiningAssistedV2State['currentStep']) => void;
}

export function ObservationsStep({ process, version, settings, state, onChange, onNext, onGoToStep }: Props) {
  const [activeTab, setActiveTab] = useState<InputTab>('describe');
  const [expandedEditorCaseId, setExpandedEditorCaseId] = useState<string | null>(null);

  const cases = state.cases as ProcessMiningObservationCase[];
  const observations = state.observations as ProcessMiningObservation[];
  const stepObservations = useMemo(() => observations.filter(observation => observation.kind === 'step'), [observations]);
  const reviewOverview = useMemo(() => buildReviewOverview({ cases, observations }), [cases, observations]);
  const instantSnapshot = useMemo(
    () => computeInstantAnalysisSnapshot({ state, version }),
    [state, version],
  );

  function mergeState(
    newCases: ProcessMiningObservationCase[],
    newObservations: ProcessMiningObservation[],
    derivationSummary?: DerivationSummary,
  ) {
    const quality = computeQualitySummary(newCases, newObservations);
    onChange({
      cases: newCases,
      observations: newObservations,
      qualitySummary: quality,
      ...(derivationSummary ? { lastDerivationSummary: derivationSummary } : {}),
    });
  }

  function updateCases(updatedCases: ProcessMiningObservationCase[]) {
    const quality = computeQualitySummary(updatedCases, observations);
    onChange({ cases: updatedCases, qualitySummary: quality });
  }

  function updateObservations(updatedObservations: ProcessMiningObservation[]) {
    const quality = computeQualitySummary(cases, updatedObservations);
    onChange({ observations: updatedObservations, qualitySummary: quality });
  }

  function addEmptyCase() {
    const now = new Date().toISOString();
    const newCase: ProcessMiningObservationCase = {
      id: crypto.randomUUID(),
      name: `Fall ${cases.length + 1}`,
      narrative: '',
      rawText: '',
      inputKind: 'narrative',
      sourceType: 'narrative',
      createdAt: now,
      updatedAt: now,
    };
    updateCases([...cases, newCase]);
  }

  function addRawCase(caseItem: ProcessMiningObservationCase) {
    updateCases([...cases, caseItem]);
  }

  function addDerivedCase(caseItem: ProcessMiningObservationCase, derivedObservations: ProcessMiningObservation[], summary?: DerivationSummary) {
    mergeState([...cases, caseItem], [...observations, ...derivedObservations], summary);
    if (derivedObservations.some(observation => observation.kind === 'step')) {
      setExpandedEditorCaseId(caseItem.id);
    }
  }

  function updateCase(id: string, updatedCase: ProcessMiningObservationCase) {
    updateCases(cases.map(caseItem => (caseItem.id === id ? updatedCase : caseItem)));
  }

  function deleteCase(id: string) {
    const updatedCases = cases.filter(caseItem => caseItem.id !== id);
    const updatedObservations = observations.filter(observation => observation.sourceCaseId !== id);
    mergeState(updatedCases, updatedObservations, state.lastDerivationSummary);
    if (expandedEditorCaseId === id) setExpandedEditorCaseId(null);
  }

  function extractForCase(caseItem: ProcessMiningObservationCase) {
    const sourceText = (caseItem.rawText || caseItem.narrative || '').trim();
    if (!sourceText) return;

    const result = deriveProcessArtifactsFromText({
      text: sourceText,
      fileName: caseItem.name,
      sourceType: caseItem.sourceType === 'eventlog' ? 'narrative' : (caseItem.sourceType ?? 'narrative'),
    });

    const refreshedCase: ProcessMiningObservationCase = {
      ...caseItem,
      narrative: result.cases[0]?.narrative ?? caseItem.narrative,
      rawText: result.cases[0]?.rawText ?? caseItem.rawText ?? sourceText,
      derivedStepLabels: result.summary.stepLabels,
      updatedAt: new Date().toISOString(),
    };

    const remappedObservations = result.observations.map(observation => ({
      ...observation,
      id: crypto.randomUUID(),
      sourceCaseId: caseItem.id,
    }));

    const remainingObservations = observations.filter(observation => observation.sourceCaseId !== caseItem.id);
    const updatedCases = cases.map(existingCase => (existingCase.id === caseItem.id ? refreshedCase : existingCase));
    mergeState(updatedCases, [...remainingObservations, ...remappedObservations], result.summary);
    setExpandedEditorCaseId(caseItem.id);
  }

  function handleFileImport(importedCases: ProcessMiningObservationCase[], importedObservations: ProcessMiningObservation[], derivationSummary?: DerivationSummary) {
    mergeState([...cases, ...importedCases], [...observations, ...importedObservations], derivationSummary);
    const firstCaseWithSteps = importedCases.find(caseItem =>
      importedObservations.some(observation => observation.sourceCaseId === caseItem.id && observation.kind === 'step'),
    );
    if (firstCaseWithSteps) setExpandedEditorCaseId(firstCaseWithSteps.id);
  }

  function toggleEditorForCase(caseId: string) {
    setExpandedEditorCaseId(current => (current === caseId ? null : caseId));
  }

  function focusEditorForCase(caseId: string) {
    setExpandedEditorCaseId(caseId);
  }

  const quality: ProcessMiningQualitySummary | undefined = state.qualitySummary ?? (
    observations.length > 0 ? computeQualitySummary(cases, observations) : undefined
  );

  const lastSummary = state.lastDerivationSummary;
  const canProceed = stepObservations.length > 0;

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex gap-3">
        <Info className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
        <div className="text-sm text-blue-800">
          <p className="font-medium">Dokument oder Fall automatisch auswerten</p>
          <p className="mt-0.5">
            Beschreibe einen Prozessfall oder lade ein Dokument hoch. Die App leitet daraus automatisch einen Prozessentwurf,
            Rollen, Reibungssignale und erkannte Schritte ab. Erst danach beginnt die eigentliche Analyse.
          </p>
        </div>
      </div>

      {lastSummary && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-blue-500" />
            <span className="text-sm font-semibold text-slate-700">Zuletzt ausgewertet: {lastSummary.sourceLabel}</span>
          </div>
          <div className="flex flex-wrap gap-3 text-xs text-slate-600">
            <span>{lastSummary.stepLabels.length} erkannte Hauptschritte</span>
            <span>{getAnalysisModeLabel(lastSummary.analysisMode)}</span>
            {lastSummary.issueSignals && lastSummary.issueSignals.length > 0 && <span>{lastSummary.issueSignals.length} Reibungssignale</span>}
            {lastSummary.roles.length > 0 && <span>Rollen: {lastSummary.roles.slice(0, 3).join(', ')}</span>}
            {lastSummary.systems && lastSummary.systems.length > 0 && <span>Systeme: {lastSummary.systems.slice(0, 3).join(', ')}</span>}
            <span className={`px-1.5 py-0.5 rounded font-medium ${lastSummary.confidence === 'high' ? 'bg-green-100 text-green-800' : lastSummary.confidence === 'medium' ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'}`}>
              {lastSummary.confidence === 'high' ? 'Hohe Verlässlichkeit' : lastSummary.confidence === 'medium' ? 'Mittlere Verlässlichkeit' : 'Niedrige Verlässlichkeit'}
            </span>
          </div>
          {lastSummary.documentSummary && (
            <p className="text-xs text-slate-500 leading-relaxed">{lastSummary.documentSummary}</p>
          )}
          {lastSummary.repairNotes && lastSummary.repairNotes.length > 0 && (
            <div className="space-y-1">
              {lastSummary.repairNotes.map((note, index) => (
                <p key={index} className="text-xs text-slate-500 bg-white border border-slate-200 rounded-lg px-3 py-2">
                  {note}
                </p>
              ))}
            </div>
          )}
          {lastSummary.engineVersion && (
            <p className="text-[11px] text-slate-400">Analyseengine: {lastSummary.engineVersion}</p>
          )}
          {lastSummary.issueSignals && lastSummary.issueSignals.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-1">
              {lastSummary.issueSignals.slice(0, 4).map((signal, index) => (
                <span key={index} className="text-xs bg-white border border-slate-200 text-slate-600 px-2 py-0.5 rounded">{signal}</span>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
        <button
          type="button"
          onClick={() => setActiveTab('describe')}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === 'describe'
              ? 'bg-white text-blue-700 border-b-2 border-blue-600 shadow-sm'
              : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
          }`}
        >
          <MessageSquare className="w-4 h-4" />
          Prozessfall beschreiben
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('upload')}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === 'upload'
              ? 'bg-white text-blue-700 border-b-2 border-blue-600 shadow-sm'
              : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
          }`}
        >
          <Upload className="w-4 h-4" />
          Dokument hochladen
        </button>
      </div>

      {activeTab === 'describe' && (
        <ObservationIntakePanel
          existingCaseCount={cases.length}
          onAddCase={addRawCase}
          onAddDerived={addDerivedCase}
        />
      )}

      {activeTab === 'upload' && (
        <FileImportPanel onImport={handleFileImport} />
      )}

      {cases.length === 0 && (
        <div className="grid md:grid-cols-3 gap-3">
          <div className="border border-slate-200 bg-slate-50 rounded-xl p-4 space-y-2">
            <span className="inline-flex w-7 h-7 items-center justify-center rounded-full bg-blue-100 text-blue-700 text-sm font-bold">1</span>
            <p className="text-sm font-semibold text-slate-900">Material eingeben</p>
            <p className="text-sm text-slate-600 leading-relaxed">
              Beschreiben Sie einen realen Fall oder laden Sie ein Dokument hoch. Die App extrahiert daraus lokal Prozessschritte und Reibungssignale.
            </p>
          </div>
          <div className="border border-slate-200 bg-slate-50 rounded-xl p-4 space-y-2">
            <span className="inline-flex w-7 h-7 items-center justify-center rounded-full bg-blue-100 text-blue-700 text-sm font-bold">2</span>
            <p className="text-sm font-semibold text-slate-900">Ergebnis kurz prüfen</p>
            <p className="text-sm text-slate-600 leading-relaxed">
              Die Prüfwerkstatt zeigt, welche Schrittbezeichnungen vereinheitlicht oder welche problemartigen Einträge eher als Reibungssignal geführt werden sollten.
            </p>
          </div>
          <div className="border border-slate-200 bg-slate-50 rounded-xl p-4 space-y-2">
            <span className="inline-flex w-7 h-7 items-center justify-center rounded-full bg-blue-100 text-blue-700 text-sm font-bold">3</span>
            <p className="text-sm font-semibold text-slate-900">Analyse sofort nutzen</p>
            <p className="text-sm text-slate-600 leading-relaxed">
              Danach können Kernprozess, Soll-Abgleich und Verbesserungshebel direkt lokal berechnet werden, auch ohne KI-Verbindung.
            </p>
          </div>
        </div>
      )}

      {instantSnapshot && (
        <InstantAnalysisPanel snapshot={instantSnapshot} onOpenStep={onGoToStep} />
      )}

      {quality && <QualitySummaryCard summary={quality} />}

      <StepReviewWorkbench
        cases={cases}
        observations={observations}
        onUpdate={updateObservations}
        onFocusCase={focusEditorForCase}
      />

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-slate-800 text-sm">
              {cases.length === 0
                ? 'Noch keine Fälle oder Dokumente erfasst'
                : `${cases.length} ${cases.length === 1 ? 'Quelle' : 'Quellen'} — ${stepObservations.length} erkannte Prozessschritte`}
            </h3>
            {reviewOverview.suggestionCount > 0 && (
              <p className="text-xs text-slate-500 mt-1">
                {reviewOverview.suggestionCount} empfohlene Korrekturen sind offen. Sie können trotzdem weitergehen, erhalten aber meist stabilere Ergebnisse nach einer kurzen Prüfung.
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={addEmptyCase}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Leere Karte anlegen
          </button>
        </div>

        {cases.length === 0 && (
          <div className="border border-dashed border-slate-300 rounded-xl p-6 text-center text-sm text-slate-400">
            Noch keine Fälle. Beschreiben Sie oben einen Prozessfall oder laden Sie ein Dokument hoch.
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-3">
          {cases.slice(0, 4).map(caseItem => {
            const caseObservations = observations.filter(observation => observation.sourceCaseId === caseItem.id);
            const caseStepCount = caseObservations.filter(observation => observation.kind === 'step').length;
            const caseIssueCount = caseObservations.filter(observation => observation.kind === 'issue').length;
            return (
              <button
                key={`summary-${caseItem.id}`}
                type="button"
                onClick={() => focusEditorForCase(caseItem.id)}
                className="text-left border border-slate-200 rounded-xl p-3 hover:border-blue-300 hover:bg-blue-50/40 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">{caseItem.name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {caseStepCount} erkannte Schritte{caseIssueCount > 0 ? ` · ${caseIssueCount} Reibungssignale` : ''}
                    </p>
                  </div>
                  <FileText className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                </div>
                {caseItem.derivedStepLabels && caseItem.derivedStepLabels.length > 0 && (
                  <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                    {caseItem.derivedStepLabels.slice(0, 3).join(' → ')}
                    {caseItem.derivedStepLabels.length > 3 ? ' …' : ''}
                  </p>
                )}
              </button>
            );
          })}
        </div>

        <div className="space-y-3">
          {cases.map((caseItem, index) => {
            const caseObservations = observations.filter(observation => observation.sourceCaseId === caseItem.id);
            return (
              <div key={caseItem.id}>
                <NarrativeCaseCard
                  caseItem={caseItem}
                  observations={caseObservations}
                  caseIndex={index}
                  onUpdate={updatedCase => updateCase(caseItem.id, updatedCase)}
                  onDelete={() => deleteCase(caseItem.id)}
                  onExtract={() => extractForCase(caseItem)}
                  onToggleEditor={() => toggleEditorForCase(caseItem.id)}
                  editorOpen={expandedEditorCaseId === caseItem.id}
                  dragHandleProps={{ onMouseDown: () => {} }}
                />
                {expandedEditorCaseId === caseItem.id && caseObservations.length > 0 && (
                  <ObservationEditor
                    observations={observations}
                    onUpdate={updateObservations}
                    caseId={caseItem.id}
                    caseName={caseItem.name}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <ProcessMiningAiPanel
        process={process}
        version={version}
        settings={settings}
        state={state}
        onApply={onChange}
      />

      <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
        <div className="text-xs text-slate-500 max-w-[70%]">
          {canProceed
            ? (reviewOverview.suggestionCount > 0
                ? `${stepObservations.length} Prozessschritte sind bereit. Empfohlen: zuerst ${reviewOverview.suggestionCount} kurze Korrekturen in der Prüfwerkstatt übernehmen, damit Discovery und Soll-Abgleich stabiler werden.`
                : `${stepObservations.length} Prozessschritte sind bereit für Discovery und Soll-Ist-Abgleich.`)
            : 'Bitte werten Sie mindestens einen Fall oder ein Dokument aus, damit die Analyse starten kann.'}
        </div>
        <button
          type="button"
          onClick={onNext}
          disabled={!canProceed}
          className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Weiter zur lokalen Verdichtung
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
