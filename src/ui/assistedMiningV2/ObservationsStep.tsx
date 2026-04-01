import { useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Info, MessageSquare, Plus, RotateCcw, Sparkles, Upload } from 'lucide-react';
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
import { EvidenceInspectorPanel } from './EvidenceInspectorPanel';
import { BenchmarkPanel } from './BenchmarkPanel';
import { SourceOverviewPanel } from './SourceOverviewPanel';
import { QualitySummaryCard } from './QualitySummaryCard';
import { DataMaturityWorkshopPanel } from './DataMaturityWorkshopPanel';
import { StepReviewWorkbench } from './StepReviewWorkbench';
import { WorkbenchSection } from './WorkbenchSection';
import { StepQuickJumpBar } from './StepQuickJumpBar';
import { StepActionBar } from './StepActionBar';
import { LocalEngineProfilePanel } from './LocalEngineProfilePanel';
import {
  applyCanonicalLabelSuggestions,
  applyIssueReclassificationSuggestions,
  applySplitSuggestions,
  buildReviewOverview,
} from './reviewSuggestions';
import { deriveProcessArtifactsFromText } from './documentDerivation';
import { computeQualitySummary } from './narrativeParsing';
import { getAnalysisModeLabel } from './pmShared';
import { buildSampleScenario, getSampleScenarios } from './sampleCases';
import { HelpPopover } from '../components/HelpPopover';

type InputTab = 'describe' | 'upload';

interface Props {
  process: Process;
  version: ProcessVersion;
  settings: AppSettings;
  state: ProcessMiningAssistedV2State;
  onChange: (patch: Partial<ProcessMiningAssistedV2State>) => void;
  onResetState: () => void;
  onNext: () => void;
}

export function ObservationsStep({ process, version, settings, state, onChange, onResetState, onNext }: Props) {
  const [activeTab, setActiveTab] = useState<InputTab>('describe');
  const [expandedEditorCaseId, setExpandedEditorCaseId] = useState<string | null>(null);
  const [showCaseDetails, setShowCaseDetails] = useState(true);
  const [lastWorkshopNotes, setLastWorkshopNotes] = useState<string[]>([]);
  const [showReadiness, setShowReadiness] = useState(true);
  const [showReview, setShowReview] = useState(true);
  const [showSources, setShowSources] = useState(true);
  const [showEvidence, setShowEvidence] = useState(false);
  const [showDetailsSection, setShowDetailsSection] = useState(false);
  const [showBenchmark, setShowBenchmark] = useState(false);
  const [showAiSection, setShowAiSection] = useState(false);
  const intakeRef = useRef<HTMLDivElement | null>(null);
  const readinessRef = useRef<HTMLDivElement | null>(null);
  const reviewRef = useRef<HTMLDivElement | null>(null);
  const sourcesRef = useRef<HTMLDivElement | null>(null);
  const detailsRef = useRef<HTMLDivElement | null>(null);
  const benchmarkRef = useRef<HTMLDivElement | null>(null);
  const aiRef = useRef<HTMLDivElement | null>(null);

  const cases = state.cases as ProcessMiningObservationCase[];
  const observations = state.observations as ProcessMiningObservation[];
  const stepObservations = useMemo(() => observations.filter(observation => observation.kind === 'step'), [observations]);
  const reviewOverview = useMemo(() => buildReviewOverview({ cases, observations }), [cases, observations]);
  const sampleScenarios = useMemo(() => getSampleScenarios(), []);

  function mergeState(
    newCases: ProcessMiningObservationCase[],
    newObservations: ProcessMiningObservation[],
    derivationSummary?: DerivationSummary,
  ) {
    const quality = computeQualitySummary(newCases, newObservations);
    setLastWorkshopNotes([]);
    onChange({
      cases: newCases,
      observations: newObservations,
      qualitySummary: quality,
      ...(derivationSummary ? { lastDerivationSummary: derivationSummary } : {}),
    });
  }

  function updateCases(updatedCases: ProcessMiningObservationCase[]) {
    const quality = computeQualitySummary(updatedCases, observations);
    setLastWorkshopNotes([]);
    onChange({ cases: updatedCases, qualitySummary: quality });
  }

  function updateObservations(updatedObservations: ProcessMiningObservation[], repairNotes?: string[]) {
    const quality = computeQualitySummary(cases, updatedObservations);
    const mergedRepairNotes = repairNotes && repairNotes.length > 0
      ? [...new Set([...(state.lastDerivationSummary?.repairNotes ?? []), ...repairNotes])]
      : state.lastDerivationSummary?.repairNotes;

    onChange({
      observations: updatedObservations,
      qualitySummary: quality,
      ...(state.lastDerivationSummary
        ? {
            lastDerivationSummary: {
              ...state.lastDerivationSummary,
              repairNotes: mergedRepairNotes,
              updatedAt: new Date().toISOString(),
            },
          }
        : {}),
    });

    if (repairNotes) {
      setLastWorkshopNotes(repairNotes);
      setShowReadiness(true);
    } else {
      setLastWorkshopNotes([]);
    }
  }

  function scrollToSection(target: { current: HTMLDivElement | null }) {
    requestAnimationFrame(() => {
      target.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function applyLocalStandardRepair() {
    const splitResult = applySplitSuggestions(observations);
    const reclassifyResult = applyIssueReclassificationSuggestions(splitResult.observations);
    const renameResult = applyCanonicalLabelSuggestions(reclassifyResult.observations);

    const repairNotes: string[] = [];
    if (splitResult.changedCount > 0) {
      repairNotes.push(`${splitResult.changedCount} ${splitResult.changedCount === 1 ? 'Sammelschritt wurde' : 'Sammelschritte wurden'} lokal aufgeteilt.`);
    }
    if (reclassifyResult.changedCount > 0) {
      repairNotes.push(`${reclassifyResult.changedCount} ${reclassifyResult.changedCount === 1 ? 'Punkt wurde' : 'Punkte wurden'} als Reibungssignal statt als Prozessschritt geführt.`);
    }
    if (renameResult.changedCount > 0) {
      repairNotes.push(`${renameResult.changedCount} ${renameResult.changedCount === 1 ? 'Schrittbezeichnung wurde' : 'Schrittbezeichnungen wurden'} vereinheitlicht.`);
    }

    if (repairNotes.length === 0) {
      setLastWorkshopNotes(['Die lokale Standard-Reparatur hat aktuell nichts mehr zu verbessern.']);
      setShowReadiness(true);
      scrollToSection(readinessRef);
      return;
    }

    updateObservations(renameResult.observations, repairNotes);
    setShowReview(true);
    scrollToSection(reviewRef);
  }

  function handleMaturityAction(actionId: 'add-source' | 'review' | 'sources' | 'details' | 'autofix') {
    if (actionId === 'add-source') {
      setActiveTab(cases.length > 0 ? 'upload' : 'describe');
      scrollToSection(intakeRef);
      return;
    }
    if (actionId === 'review') {
      setShowReview(true);
      scrollToSection(reviewRef);
      return;
    }
    if (actionId === 'sources') {
      setShowSources(true);
      scrollToSection(sourcesRef);
      return;
    }
    if (actionId === 'details') {
      setShowDetailsSection(true);
      setShowCaseDetails(true);
      if (!expandedEditorCaseId && cases[0]) {
        setExpandedEditorCaseId(cases[0].id);
      }
      scrollToSection(detailsRef);
      return;
    }
    applyLocalStandardRepair();
  }

  function loadSampleScenario(key: 'complaints' | 'service') {
    const payload = buildSampleScenario(key);
    mergeState(payload.cases, payload.observations, payload.summary);
    setExpandedEditorCaseId(payload.cases[0]?.id ?? null);
    setShowCaseDetails(true);
    setShowSources(true);
  }



  function handleResetState() {
    if (cases.length === 0 && observations.length === 0) return;
    if (!window.confirm('Nur den Assisted-Process-Mining-Arbeitsstand dieser Version zurücksetzen? Andere Bereiche der Version bleiben erhalten.')) return;
    setExpandedEditorCaseId(null);
    setShowCaseDetails(true);
    setLastWorkshopNotes([]);
    onResetState();
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
    setShowDetailsSection(true);
  }

  function addRawCase(caseItem: ProcessMiningObservationCase) {
    updateCases([...cases, caseItem]);
    setShowDetailsSection(true);
  }

  function addDerivedCase(caseItem: ProcessMiningObservationCase, derivedObservations: ProcessMiningObservation[], summary?: DerivationSummary) {
    mergeState([...cases, caseItem], [...observations, ...derivedObservations], summary);
    if (derivedObservations.some(observation => observation.kind === 'step')) {
      setExpandedEditorCaseId(caseItem.id);
      setShowCaseDetails(true);
      setShowSources(true);
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
    setShowDetailsSection(true);
  }

  function handleFileImport(importedCases: ProcessMiningObservationCase[], importedObservations: ProcessMiningObservation[], derivationSummary?: DerivationSummary) {
    mergeState([...cases, ...importedCases], [...observations, ...importedObservations], derivationSummary);
    const firstCaseWithSteps = importedCases.find(caseItem =>
      importedObservations.some(observation => observation.sourceCaseId === caseItem.id && observation.kind === 'step'),
    );
    if (firstCaseWithSteps) {
      setExpandedEditorCaseId(firstCaseWithSteps.id);
      setShowCaseDetails(true);
      setShowSources(true);
    }
  }

  function toggleEditorForCase(caseId: string) {
    setExpandedEditorCaseId(current => (current === caseId ? null : caseId));
  }

  function focusEditorForCase(caseId: string) {
    setExpandedEditorCaseId(caseId);
    setShowCaseDetails(true);
    setShowDetailsSection(true);
  }

  const quality: ProcessMiningQualitySummary | undefined = state.qualitySummary ?? (
    observations.length > 0 ? computeQualitySummary(cases, observations) : undefined
  );

  const lastSummary = state.lastDerivationSummary;
  const canProceed = stepObservations.length > 0;
  const readinessBadge = quality ? (
    <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-0.5 text-[11px] font-medium text-violet-800">
      {quality.stepObservationCount} erkannte Schritte
    </span>
  ) : null;
  const reviewBadge = reviewOverview.suggestionCount > 0 ? (
    <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-medium text-amber-800">
      {reviewOverview.suggestionCount} offen
    </span>
  ) : (
    <span className="rounded-full border border-green-200 bg-green-50 px-2.5 py-0.5 text-[11px] font-medium text-green-800">
      aktuell ruhig
    </span>
  );
  const sourceBadge = cases.length > 0 ? (
    <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] font-medium text-slate-700">
      {cases.length} {cases.length === 1 ? 'Quelle' : 'Quellen'}
    </span>
  ) : null;
  const detailBadge = cases.length > 0 ? (
    <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] font-medium text-slate-700">
      Detailbearbeitung optional
    </span>
  ) : null;

  const quickJumpItems = [
    {
      id: 'intake',
      label: 'Erfassen',
      hint: cases.length > 0 ? `${cases.length} Quellen vorhanden` : 'neue Quelle hinzufügen',
      onClick: () => scrollToSection(intakeRef),
    },
    {
      id: 'readiness',
      label: 'Datenreife',
      hint: quality ? `${quality.stepObservationCount} Schritte, ${quality.issueObservationCount} Reibungssignale` : 'noch keine Auswertung',
      badge: readinessBadge,
      onClick: () => {
        setShowReadiness(true);
        scrollToSection(readinessRef);
      },
    },
    {
      id: 'review',
      label: 'Prüfwerkstatt',
      hint: reviewOverview.suggestionCount > 0 ? 'empfohlene Korrekturen prüfen' : 'nur bei Bedarf öffnen',
      badge: reviewBadge,
      onClick: () => {
        setShowReview(true);
        scrollToSection(reviewRef);
      },
    },
    {
      id: 'sources',
      label: 'Quellen',
      hint: cases.length > 0 ? 'Herkunft und Belege ansehen' : 'wird nach der ersten Auswertung wichtig',
      badge: sourceBadge,
      onClick: () => {
        setShowSources(true);
        scrollToSection(sourcesRef);
      },
    },
    {
      id: 'details',
      label: 'Details',
      hint: cases.length > 0 ? 'Einzelfälle nachschärfen' : 'optional für später',
      badge: detailBadge,
      onClick: () => {
        setShowDetailsSection(true);
        scrollToSection(detailsRef);
      },
    },
  ];

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
        <div className="flex gap-3">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
          <div className="text-sm text-blue-800">
            <div className="flex items-center gap-2">
              <p className="font-medium">Dokument oder Fall automatisch auswerten</p>
              <HelpPopover helpKey="pmv2.observations" ariaLabel="Hilfe: Prozess auswerten" />
            </div>
            <p className="mt-0.5 leading-relaxed">
              Beschreiben Sie einen Prozessfall oder laden Sie ein Dokument hoch. Die App leitet daraus automatisch einen Prozessentwurf,
              Rollen, Reibungssignale und erkannte Schritte ab. Erst danach beginnt die eigentliche Analyse.
            </p>
          </div>
        </div>
      </div>

      <StepQuickJumpBar items={quickJumpItems} />

      <div ref={intakeRef}>
        <WorkbenchSection
          title="1. Prozessmaterial erfassen"
          description="Starten Sie mit eigenem Material oder laden Sie ein lokales Beispiel. Die Hauptaktion liegt bewusst hier."
          helpKey="pmv2.observations"
          badge={cases.length > 0 ? (
            <span className="rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-0.5 text-[11px] font-medium text-cyan-800">
              {cases.length} {cases.length === 1 ? 'Quelle erfasst' : 'Quellen erfasst'}
            </span>
          ) : undefined}
          actions={cases.length > 0 ? (
            <button
              type="button"
              onClick={handleResetState}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
            >
              <RotateCcw className="h-4 w-4" />
              PM-Arbeitsstand zurücksetzen
            </button>
          ) : undefined}
        >
          <div className="space-y-4">
            {lastSummary && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-blue-500" />
                  <span className="text-sm font-semibold text-slate-700">Zuletzt ausgewertet: {lastSummary.sourceLabel}</span>
                </div>
                <div className="flex flex-wrap gap-3 text-xs text-slate-600">
                  <span>{lastSummary.stepLabels.length} erkannte Hauptschritte</span>
                  <span>{getAnalysisModeLabel(lastSummary.analysisMode)}</span>
                  {lastSummary.issueSignals && lastSummary.issueSignals.length > 0 && <span>{lastSummary.issueSignals.length} Reibungssignale</span>}
                  {lastSummary.roles.length > 0 && <span>Rollen: {lastSummary.roles.slice(0, 3).join(', ')}</span>}
                  {lastSummary.systems && lastSummary.systems.length > 0 && <span>Systeme: {lastSummary.systems.slice(0, 3).join(', ')}</span>}
                  <span className={`rounded px-1.5 py-0.5 font-medium ${lastSummary.confidence === 'high' ? 'bg-green-100 text-green-800' : lastSummary.confidence === 'medium' ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'}`}>
                    {lastSummary.confidence === 'high' ? 'Hohe Verlässlichkeit' : lastSummary.confidence === 'medium' ? 'Mittlere Verlässlichkeit' : 'Niedrige Verlässlichkeit'}
                  </span>
                </div>
                {lastSummary.documentSummary && (
                  <p className="text-xs leading-relaxed text-slate-500">{lastSummary.documentSummary}</p>
                )}
                {lastSummary.repairNotes && lastSummary.repairNotes.length > 0 && (
                  <div className="space-y-1">
                    {lastSummary.repairNotes.map((note, index) => (
                      <p key={index} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs leading-relaxed text-slate-500">
                        {note}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}

            {lastSummary && <LocalEngineProfilePanel summary={lastSummary} />}

            {cases.length === 0 && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                <div className="flex items-center gap-2 text-slate-700">
                  <Sparkles className="h-4 w-4 text-violet-600" />
                  <p className="text-sm font-semibold">Zum Ausprobieren ohne eigenes Material</p>
                  <HelpPopover helpKey="pmv2.samples" ariaLabel="Hilfe: Beispielpakete" />
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {sampleScenarios.map(sample => (
                    <div key={sample.key} className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{sample.label}</p>
                        <p className="mt-1 text-xs leading-relaxed text-slate-500">{sample.summary}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => loadSampleScenario(sample.key)}
                        className="inline-flex items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-medium text-violet-800 transition-colors hover:bg-violet-100"
                      >
                        <Sparkles className="h-4 w-4" />
                        Beispiel laden
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
              <div className="grid grid-cols-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('describe')}
                  className={`flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${activeTab === 'describe' ? 'border-b-2 border-blue-600 bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'}`}
                >
                  <MessageSquare className="h-4 w-4" />
                  Prozessfall beschreiben
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('upload')}
                  className={`flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${activeTab === 'upload' ? 'border-b-2 border-blue-600 bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'}`}
                >
                  <Upload className="h-4 w-4" />
                  Dokument hochladen
                </button>
              </div>
              <div className="p-4">
                {activeTab === 'describe' ? (
                  <ObservationIntakePanel existingCaseCount={cases.length} onAddCase={addRawCase} onAddDerived={addDerivedCase} />
                ) : (
                  <FileImportPanel onImport={handleFileImport} />
                )}
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              {[
                {
                  title: '1. Quelle wählen',
                  text: 'Freitext beschreiben oder ein Dokument hochladen. Beides bleibt sichtbar und nachvollziehbar in der App.',
                },
                {
                  title: '2. Automatisch auswerten',
                  text: 'Die lokale Engine erkennt Hauptschritte, Rollen, Systeme und Reibungssignale direkt in der Anwendung.',
                },
                {
                  title: '3. Kurz prüfen',
                  text: 'Mit Prüfwerkstatt und Quellenübersicht schärfen Sie das Ergebnis, bevor Discovery und Soll-Abgleich starten.',
                },
              ].map(card => (
                <div key={card.title} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{card.title}</p>
                  <p className="mt-2 text-sm leading-relaxed text-slate-700">{card.text}</p>
                </div>
              ))}
            </div>
          </div>
        </WorkbenchSection>
      </div>

      <div ref={readinessRef}>
        <WorkbenchSection
          title="2. Datenreife und erste Qualität prüfen"
          description="Diese Sicht zeigt, ob das Material schon stabil genug für Discovery, Soll-Abgleich und Hotspots ist."
          helpKey="pmv2.maturity"
          badge={readinessBadge ?? undefined}
          collapsible
          open={showReadiness}
          onToggle={() => setShowReadiness(open => !open)}
        >
          <div className="space-y-4">
            {quality && <QualitySummaryCard summary={quality} />}
            {(quality || cases.length > 0) && (
              <DataMaturityWorkshopPanel state={state} version={version} reviewSuggestionCount={reviewOverview.suggestionCount} onAction={handleMaturityAction} />
            )}
            {lastWorkshopNotes.length > 0 && (
              <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900 space-y-1">
                {lastWorkshopNotes.map((note, index) => (
                  <p key={index}>{note}</p>
                ))}
              </div>
            )}
          </div>
        </WorkbenchSection>
      </div>

      <div ref={reviewRef}>
        <WorkbenchSection
          title="3. Prüfwerkstatt"
          description="Hier schärfen Sie erkannte Schritte nach. Öffnen Sie den Bereich vor allem dann, wenn offene Korrekturvorschläge angezeigt werden."
          helpKey="pmv2.review"
          badge={reviewBadge}
          collapsible
          open={showReview}
          onToggle={() => setShowReview(open => !open)}
        >
          <StepReviewWorkbench cases={cases} observations={observations} onUpdate={updateObservations} onFocusCase={focusEditorForCase} />
        </WorkbenchSection>
      </div>

      <div ref={sourcesRef} className="space-y-4">
        <WorkbenchSection
          title="4. Quellenübersicht"
          description="Nutzen Sie diese Sicht, um Herkunft, Belegstellen, Rollen und Systemsignale pro Quelle schnell einzuordnen."
          helpKey="pmv2.sources"
          badge={sourceBadge ?? undefined}
          collapsible
          open={showSources}
          onToggle={() => setShowSources(open => !open)}
        >
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
        </WorkbenchSection>

        <WorkbenchSection
          title="Beleg-Inspektor"
          description="Optionaler Tiefenblick: Prüfen Sie zu einzelnen Schritten die Fundstelle, den Rollen- oder Systemkontext und die Herleitung."
          helpKey="pmv2.evidenceInspector"
          collapsible
          open={showEvidence}
          onToggle={() => setShowEvidence(open => !open)}
        >
          <EvidenceInspectorPanel cases={cases} observations={observations} onFocusCase={focusEditorForCase} />
        </WorkbenchSection>
      </div>

      <div ref={detailsRef}>
        <WorkbenchSection
          title={cases.length === 0 ? '5. Detailbearbeitung' : `5. Detailbearbeitung für ${cases.length} ${cases.length === 1 ? 'Quelle' : 'Quellen'}`}
          description="Diese Karten sind bewusst optional. Öffnen Sie sie nur, wenn Texte, Metadaten oder erkannte Schritte im Einzelfall nachgeschärft werden sollen."
          helpKey="pmv2.details"
          badge={detailBadge ?? undefined}
          collapsible
          open={showDetailsSection}
          onToggle={() => setShowDetailsSection(open => !open)}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowCaseDetails(show => !show)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
              >
                {showCaseDetails ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                {showCaseDetails ? 'Detailkarten ausblenden' : 'Detailkarten anzeigen'}
              </button>
              <button
                type="button"
                onClick={addEmptyCase}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
              >
                <Plus className="h-4 w-4" />
                Leere Karte anlegen
              </button>
            </div>
          }
        >
          <div className="space-y-3">
            {reviewOverview.suggestionCount > 0 && (
              <p className="text-xs text-slate-500">
                {reviewOverview.suggestionCount} empfohlene Korrekturen sind offen. Sie können trotzdem weitergehen, erhalten aber meist stabilere Ergebnisse nach einer kurzen Prüfung.
              </p>
            )}

            {cases.length === 0 && (
              <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400">
                Noch keine Fälle. Beschreiben Sie oben einen Prozessfall oder laden Sie ein Dokument hoch.
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
                        <ObservationEditor observations={observations} onUpdate={updateObservations} caseId={caseItem.id} caseName={caseItem.name} />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </WorkbenchSection>
      </div>

      <div ref={benchmarkRef}>
        <WorkbenchSection
          title="Goldfälle und lokaler Qualitätscheck"
          description="Nutzen Sie Referenzfälle, um die lokale Engine schnell gegen bekannte Muster zu prüfen. Das ist für die eigentliche Arbeit optional."
          helpKey="pmv2.benchmark"
          collapsible
          open={showBenchmark}
          onToggle={() => setShowBenchmark(open => !open)}
        >
          <BenchmarkPanel />
        </WorkbenchSection>
      </div>

      <div ref={aiRef}>
        <WorkbenchSection
          title="Optionale KI-Verfeinerung"
          description="Die lokale Analyse bleibt der Hauptweg. Öffnen Sie diesen Bereich nur, wenn Sie Formulierungen, Cluster oder Ergänzungen zusätzlich per KI schärfen möchten."
          helpKey="pmv2.ai"
          collapsible
          open={showAiSection}
          onToggle={() => setShowAiSection(open => !open)}
        >
          <ProcessMiningAiPanel process={process} version={version} settings={settings} state={state} onApply={onChange} />
        </WorkbenchSection>
      </div>

      <StepActionBar
        summary={
          canProceed
            ? (reviewOverview.suggestionCount > 0
                ? `${stepObservations.length} Prozessschritte sind bereit. Empfohlen ist jetzt eine kurze Prüfung in der Prüfwerkstatt, damit Discovery und Soll-Abgleich stabiler werden.`
                : `${stepObservations.length} Prozessschritte sind bereit. Sie können jetzt den Kernprozess erkennen lassen.`)
            : 'Bitte werten Sie mindestens einen Fall oder ein Dokument aus, damit die Analyse starten kann.'
        }
        nextLabel="Kernprozess erkennen"
        nextDisabled={!canProceed}
        onNext={onNext}
      />
    </div>
  );
}
