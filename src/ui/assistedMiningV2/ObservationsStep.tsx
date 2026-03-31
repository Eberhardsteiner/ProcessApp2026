import { useMemo, useState } from 'react';
import { ArrowRight, ChevronDown, ChevronRight, Info, MessageSquare, Plus, Sparkles, Upload } from 'lucide-react';
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
import { SourceOverviewPanel } from './SourceOverviewPanel';
import { QualitySummaryCard } from './QualitySummaryCard';
import { StepReviewWorkbench } from './StepReviewWorkbench';
import { buildReviewOverview } from './reviewSuggestions';
import { deriveProcessArtifactsFromText } from './documentDerivation';
import { computeQualitySummary } from './narrativeParsing';
import { getAnalysisModeLabel } from './pmShared';
import { HelpPopover } from '../components/HelpPopover';

type InputTab = 'describe' | 'upload';

interface Props {
  process: Process;
  version: ProcessVersion;
  settings: AppSettings;
  state: ProcessMiningAssistedV2State;
  onChange: (patch: Partial<ProcessMiningAssistedV2State>) => void;
  onNext: () => void;
}

export function ObservationsStep({ process, version, settings, state, onChange, onNext }: Props) {
  const [activeTab, setActiveTab] = useState<InputTab>('describe');
  const [expandedEditorCaseId, setExpandedEditorCaseId] = useState<string | null>(null);
  const [showCaseDetails, setShowCaseDetails] = useState(true);

  const cases = state.cases as ProcessMiningObservationCase[];
  const observations = state.observations as ProcessMiningObservation[];
  const stepObservations = useMemo(() => observations.filter(observation => observation.kind === 'step'), [observations]);
  const reviewOverview = useMemo(() => buildReviewOverview({ cases, observations }), [cases, observations]);

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
      setShowCaseDetails(true);
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
    setShowCaseDetails(true);
  }

  function handleFileImport(importedCases: ProcessMiningObservationCase[], importedObservations: ProcessMiningObservation[], derivationSummary?: DerivationSummary) {
    mergeState([...cases, ...importedCases], [...observations, ...importedObservations], derivationSummary);
    const firstCaseWithSteps = importedCases.find(caseItem =>
      importedObservations.some(observation => observation.sourceCaseId === caseItem.id && observation.kind === 'step'),
    );
    if (firstCaseWithSteps) {
      setExpandedEditorCaseId(firstCaseWithSteps.id);
      setShowCaseDetails(true);
    }
  }

  function toggleEditorForCase(caseId: string) {
    setExpandedEditorCaseId(current => (current === caseId ? null : caseId));
  }

  function focusEditorForCase(caseId: string) {
    setExpandedEditorCaseId(caseId);
    setShowCaseDetails(true);
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
          <div className="flex items-center gap-2">
            <p className="font-medium">Dokument oder Fall automatisch auswerten</p>
            <HelpPopover helpKey="pmv2.observations" ariaLabel="Hilfe: Prozess auswerten" />
          </div>
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

      <div className="grid gap-3 md:grid-cols-3">
        {[
          {
            title: '1. Quelle wählen',
            text: 'Freitext beschreiben oder ein Dokument hochladen. Beides bleibt in der App sichtbar und nachvollziehbar.',
          },
          {
            title: '2. Automatisch auswerten',
            text: 'Die lokale Engine erkennt Hauptschritte, Rollen, Systeme und Reibungssignale direkt in der Anwendung.',
          },
          {
            title: '3. Kurz prüfen',
            text: 'Mit der Prüfwerkstatt und der Quellenübersicht schärfen Sie das Ergebnis, bevor Discovery und Soll-Abgleich starten.',
          },
        ].map(card => (
          <div key={card.title} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{card.title}</p>
            <p className="mt-2 text-sm text-slate-700 leading-relaxed">{card.text}</p>
          </div>
        ))}
      </div>

      {quality && <QualitySummaryCard summary={quality} />}

      <StepReviewWorkbench
        cases={cases}
        observations={observations}
        onUpdate={updateObservations}
        onFocusCase={focusEditorForCase}
      />

      <SourceOverviewPanel
        cases={cases}
        observations={observations}
        expandedCaseId={expandedEditorCaseId}
        onFocusCase={focusEditorForCase}
        onReanalyzeCase={caseId => {
          const selectedCase = cases.find(caseItem => caseItem.id === caseId);
          if (selectedCase) extractForCase(selectedCase);
        }}
      />

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="font-semibold text-slate-800 text-sm">
              {cases.length === 0
                ? 'Noch keine Fälle oder Dokumente erfasst'
                : `${cases.length} ${cases.length === 1 ? 'Quelle' : 'Quellen'} im Detail bearbeiten`}
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Öffnen Sie die Detailkarten nur dann, wenn Sie Texte, Metadaten oder erkannte Schritte im Einzelfall nachschärfen möchten.
            </p>
            {reviewOverview.suggestionCount > 0 && (
              <p className="text-xs text-slate-500 mt-1">
                {reviewOverview.suggestionCount} empfohlene Korrekturen sind offen. Sie können trotzdem weitergehen, erhalten aber meist stabilere Ergebnisse nach einer kurzen Prüfung.
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setShowCaseDetails(show => !show)}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors"
            >
              {showCaseDetails ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              {showCaseDetails ? 'Detailkarten ausblenden' : 'Detailkarten anzeigen'}
            </button>
            <button
              type="button"
              onClick={addEmptyCase}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Leere Karte anlegen
            </button>
          </div>
        </div>

        {cases.length === 0 && (
          <div className="border border-dashed border-slate-300 rounded-xl p-6 text-center text-sm text-slate-400">
            Noch keine Fälle. Beschreiben Sie einen Prozessfall oben oder laden Sie ein Dokument hoch.
          </div>
        )}

        {showCaseDetails && (
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
        )}
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
          Kernprozess erkennen
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
