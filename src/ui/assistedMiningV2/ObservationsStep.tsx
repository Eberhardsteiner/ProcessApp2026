import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, MessageSquare, Plus, RotateCcw, Sparkles, Upload } from 'lucide-react';
import type {
  DerivationSummary,
  Process,
  ProcessMiningAssistedV2State,
  ProcessMiningObservation,
  ProcessMiningObservationCase,
  ProcessMiningQualitySummary,
  ProcessMiningReviewState,
  ProcessVersion,
} from '../../domain/process';
import type { AppSettings } from '../../settings/appSettings';
import { NarrativeCaseCard } from './NarrativeCaseCard';
import { ObservationEditor } from './ObservationEditor';
import { ObservationIntakePanel } from './ObservationIntakePanel';
import { FileImportPanel } from './FileImportPanel';
import { ProcessMiningAiPanel } from './ProcessMiningAiPanel';
import { EvidenceInspectorPanel } from './EvidenceInspectorPanel';
import { SourceOverviewPanel } from './SourceOverviewPanel';
import { QualitySummaryCard } from './QualitySummaryCard';
import { DataMaturityWorkshopPanel } from './DataMaturityWorkshopPanel';
import { ImportHealthPanel } from './ImportHealthPanel';
import { StepReviewWorkbench, type ReviewWorkbenchChange } from './StepReviewWorkbench';
import { WorkbenchSection } from './WorkbenchSection';
import { StepQuickJumpBar } from './StepQuickJumpBar';
import { StepActionBar } from './StepActionBar';
import { StepStageHeader } from './StepStageHeader';
import { LocalEngineProfilePanel } from './LocalEngineProfilePanel';
import { QualityExportPanel } from './QualityExportPanel';
import {
  applyCanonicalLabelSuggestions,
  applyIssueReclassificationSuggestions,
  applySplitSuggestions,
  buildReviewOverview,
} from './reviewSuggestions';
import { applyNormalizationRules } from './reviewNormalization';
import { deriveProcessArtifactsFromText } from './documentDerivation';
import { computeQualitySummary } from './narrativeParsing';
import { getAnalysisModeLabel } from './pmShared';
import { getOperatingModeProfile } from './operatingMode';
import type { WorkspaceIntegrityReport } from './workspaceIntegrity';

type InputTab = 'describe' | 'upload';

type SessionSnapshot = {
  cases: ProcessMiningObservationCase[];
  observations: ProcessMiningObservation[];
  qualitySummary?: ProcessMiningQualitySummary;
  lastDerivationSummary?: DerivationSummary;
  reviewState: ProcessMiningReviewState;
};

type SessionHistoryEntry = {
  label: string;
  snapshot: SessionSnapshot;
};

interface Props {
  process: Process;
  version: ProcessVersion;
  settings: AppSettings;
  state: ProcessMiningAssistedV2State;
  integrity: WorkspaceIntegrityReport;
  onChange: (patch: Partial<ProcessMiningAssistedV2State>) => void;
  onResetState: () => void;
  onNext: () => void;
}

function cloneSessionSnapshot<T>(value: T): T {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

function ensureReviewState(value: ProcessMiningReviewState | undefined): ProcessMiningReviewState {
  return {
    normalizationRules: value?.normalizationRules ?? [],
    repairJournal: value?.repairJournal ?? [],
  };
}

export function ObservationsStep({ process, version, settings, state, integrity, onChange, onResetState, onNext }: Props) {
  const operatingModeProfile = getOperatingModeProfile(state.operatingMode);
  const [activeTab, setActiveTab] = useState<InputTab>('describe');
  const [expandedEditorCaseId, setExpandedEditorCaseId] = useState<string | null>(null);
  const [showCaseDetails, setShowCaseDetails] = useState(operatingModeProfile.observationDefaults.showCaseDetails);
  const [lastWorkshopNotes, setLastWorkshopNotes] = useState<string[]>([]);
  const [showReadiness, setShowReadiness] = useState(true);
  const [showOptionalSection, setShowOptionalSection] = useState(false);
  const [showReview, setShowReview] = useState(operatingModeProfile.observationDefaults.showReview);
  const [showEvidence, setShowEvidence] = useState(operatingModeProfile.observationDefaults.showEvidence);
  const [showDetailsSection, setShowDetailsSection] = useState(operatingModeProfile.observationDefaults.showDetailsSection);
  const [showAiSection, setShowAiSection] = useState(operatingModeProfile.observationDefaults.showAiSection);
  const [sessionStatusLabel, setSessionStatusLabel] = useState('Noch keine Reparaturaktion in dieser Sitzung.');
  const intakeRef = useRef<HTMLDivElement | null>(null);
  const readinessRef = useRef<HTMLDivElement | null>(null);
  const optionalRef = useRef<HTMLDivElement | null>(null);
  const exportRef = useRef<HTMLDivElement | null>(null);
  const reviewRef = useRef<HTMLDivElement | null>(null);
  const detailsRef = useRef<HTMLDivElement | null>(null);
  const aiRef = useRef<HTMLDivElement | null>(null);
  const undoHistoryRef = useRef<SessionHistoryEntry[]>([]);
  const redoHistoryRef = useRef<SessionHistoryEntry[]>([]);
  const [historyCounts, setHistoryCounts] = useState({ undo: 0, redo: 0 });

  const cases = state.cases as ProcessMiningObservationCase[];
  const observations = state.observations as ProcessMiningObservation[];
  const reviewState = ensureReviewState(state.reviewState);
  const stepObservations = useMemo(() => observations.filter(observation => observation.kind === 'step'), [observations]);
  const reviewOverview = useMemo(() => buildReviewOverview({ cases, observations }), [cases, observations]);

  useEffect(() => {
    undoHistoryRef.current = [];
    redoHistoryRef.current = [];
    setHistoryCounts({ undo: 0, redo: 0 });
    setSessionStatusLabel('Noch keine Reparaturaktion in dieser Sitzung.');
  }, [version.id]);

  useEffect(() => {
    const defaults = operatingModeProfile.observationDefaults;
    setShowReadiness(true);
    setShowOptionalSection(false);
    setShowReview(defaults.showReview && reviewOverview.suggestionCount > 0);
    setShowEvidence(false);
    setShowDetailsSection(false);
    setShowAiSection(false);
    setShowCaseDetails(false);
  }, [operatingModeProfile.key, reviewOverview.suggestionCount, version.id]);

  function createSnapshot(): SessionSnapshot {
    return cloneSessionSnapshot({
      cases,
      observations,
      qualitySummary: state.qualitySummary,
      lastDerivationSummary: state.lastDerivationSummary,
      reviewState,
    });
  }

  function refreshHistoryCounts() {
    setHistoryCounts({ undo: undoHistoryRef.current.length, redo: redoHistoryRef.current.length });
  }

  function pushSessionHistory(label: string) {
    undoHistoryRef.current.push({ label, snapshot: createSnapshot() });
    if (undoHistoryRef.current.length > 20) {
      undoHistoryRef.current = undoHistoryRef.current.slice(-20);
    }
    redoHistoryRef.current = [];
    refreshHistoryCounts();
    setSessionStatusLabel(`Letzte Aktion: ${label}`);
  }

  function restoreSessionSnapshot(entry: SessionHistoryEntry, modeLabel: string, target: 'undo' | 'redo') {
    const currentSnapshot = createSnapshot();
    if (target === 'undo') {
      redoHistoryRef.current.unshift({ label: sessionStatusLabel, snapshot: currentSnapshot });
      undoHistoryRef.current = undoHistoryRef.current.slice(0, -1);
    } else {
      undoHistoryRef.current.push({ label: sessionStatusLabel, snapshot: currentSnapshot });
      redoHistoryRef.current = redoHistoryRef.current.slice(1);
    }
    refreshHistoryCounts();
    onChange({
      cases: entry.snapshot.cases,
      observations: entry.snapshot.observations,
      qualitySummary: entry.snapshot.qualitySummary,
      lastDerivationSummary: entry.snapshot.lastDerivationSummary,
      reviewState: entry.snapshot.reviewState,
    });
    setLastWorkshopNotes([modeLabel]);
    setSessionStatusLabel(modeLabel);
  }

  function undoReviewChange() {
    const entry = undoHistoryRef.current[undoHistoryRef.current.length - 1];
    if (!entry) return;
    restoreSessionSnapshot(entry, `Rückgängig: ${entry.label}`, 'undo');
    setShowReview(true);
  }

  function redoReviewChange() {
    const entry = redoHistoryRef.current[0];
    if (!entry) return;
    restoreSessionSnapshot(entry, `Wiederholt: ${entry.label}`, 'redo');
    setShowReview(true);
  }

  function applyStateChange(params: {
    cases?: ProcessMiningObservationCase[];
    observations?: ProcessMiningObservation[];
    derivationSummary?: DerivationSummary;
    reviewState?: ProcessMiningReviewState;
    repairNotes?: string[];
    trackHistory?: boolean;
    historyLabel?: string;
    journalEntry?: { title: string; detail?: string };
  }) {
    if (params.trackHistory && params.historyLabel) {
      pushSessionHistory(params.historyLabel);
    }

    const nextCases = params.cases ?? cases;
    const nextReviewStateBase = ensureReviewState(params.reviewState ?? reviewState);
    const nextReviewState: ProcessMiningReviewState = {
      normalizationRules: nextReviewStateBase.normalizationRules ?? [],
      repairJournal: nextReviewStateBase.repairJournal ?? [],
    };

    if (params.journalEntry) {
      nextReviewState.repairJournal = [
        {
          id: crypto.randomUUID(),
          title: params.journalEntry.title,
          detail: params.journalEntry.detail,
          createdAt: new Date().toISOString(),
        },
        ...(nextReviewState.repairJournal ?? []),
      ].slice(0, 12);
    }

    const normalized = applyNormalizationRules(params.observations ?? observations, nextReviewState.normalizationRules);
    const nextObservations = normalized.observations;
    const repairNotes = params.repairNotes && params.repairNotes.length > 0 ? params.repairNotes : undefined;
    const mergedRepairNotes = repairNotes
      ? [...new Set([...(params.derivationSummary?.repairNotes ?? state.lastDerivationSummary?.repairNotes ?? []), ...repairNotes])]
      : params.derivationSummary?.repairNotes ?? state.lastDerivationSummary?.repairNotes;

    const nextDerivationSummary = params.derivationSummary
      ? {
          ...params.derivationSummary,
          repairNotes: mergedRepairNotes,
        }
      : state.lastDerivationSummary
      ? {
          ...state.lastDerivationSummary,
          repairNotes: mergedRepairNotes,
          updatedAt: repairNotes ? new Date().toISOString() : state.lastDerivationSummary.updatedAt,
        }
      : undefined;

    const quality = computeQualitySummary(nextCases, nextObservations, nextDerivationSummary?.issueSignals?.length);

    onChange({
      cases: nextCases,
      observations: nextObservations,
      qualitySummary: quality,
      reviewState: nextReviewState,
      ...(nextDerivationSummary ? { lastDerivationSummary: nextDerivationSummary } : {}),
    });

    if (repairNotes) {
      setLastWorkshopNotes(repairNotes);
      setShowReadiness(true);
    } else {
      setLastWorkshopNotes([]);
    }
  }

  function mergeState(
    newCases: ProcessMiningObservationCase[],
    newObservations: ProcessMiningObservation[],
    derivationSummary?: DerivationSummary,
    options?: { trackHistory?: boolean; historyLabel?: string },
  ) {
    applyStateChange({
      cases: newCases,
      observations: newObservations,
      derivationSummary,
      trackHistory: options?.trackHistory,
      historyLabel: options?.historyLabel,
    });
  }

  function updateCases(updatedCases: ProcessMiningObservationCase[], options?: { trackHistory?: boolean; historyLabel?: string }) {
    applyStateChange({
      cases: updatedCases,
      trackHistory: options?.trackHistory,
      historyLabel: options?.historyLabel,
    });
  }

  function updateObservations(
    updatedObservations: ProcessMiningObservation[],
    repairNotes?: string[],
    options?: { trackHistory?: boolean; historyLabel?: string; journalEntry?: { title: string; detail?: string } },
  ) {
    applyStateChange({
      observations: updatedObservations,
      repairNotes,
      trackHistory: options?.trackHistory,
      historyLabel: options?.historyLabel,
      journalEntry: options?.journalEntry,
    });
  }

  function handleReviewWorkbenchChange(change: ReviewWorkbenchChange) {
    applyStateChange({
      observations: change.observations,
      reviewState: change.reviewState,
      repairNotes: change.repairNotes,
      trackHistory: true,
      historyLabel: change.historyLabel,
      journalEntry: change.journalEntry,
    });
    setShowReview(true);
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

    updateObservations(renameResult.observations, repairNotes, {
      trackHistory: true,
      historyLabel: 'Lokale Standard-Reparatur angewendet',
      journalEntry: {
        title: 'Lokale Standard-Reparatur angewendet',
        detail: repairNotes.join(' '),
      },
    });
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
      setShowOptionalSection(true);
      setShowReview(true);
      scrollToSection(optionalRef);
      return;
    }
    if (actionId === 'sources') {
      setShowReadiness(true);
      scrollToSection(readinessRef);
      return;
    }
    if (actionId === 'details') {
      setShowOptionalSection(true);
      setShowDetailsSection(true);
      setShowCaseDetails(true);
      if (!expandedEditorCaseId && cases[0]) {
        setExpandedEditorCaseId(cases[0].id);
      }
      scrollToSection(optionalRef);
      return;
    }
    applyLocalStandardRepair();
  }


  function handleResetState() {
    if (cases.length === 0 && observations.length === 0) return;
    if (!window.confirm('Nur den Assisted-Process-Mining-Arbeitsstand dieser Version zurücksetzen? Andere Bereiche der Version bleiben erhalten.')) return;
    setExpandedEditorCaseId(null);
    setShowCaseDetails(true);
    setLastWorkshopNotes([]);
    undoHistoryRef.current = [];
    redoHistoryRef.current = [];
    refreshHistoryCounts();
    setSessionStatusLabel('Assisted-Process-Mining-Arbeitsstand zurückgesetzt.');
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
    updateCases([...cases, newCase], { trackHistory: true, historyLabel: 'Leere Detailkarte angelegt' });
    setShowDetailsSection(true);
  }

  function addRawCase(caseItem: ProcessMiningObservationCase) {
    updateCases([...cases, caseItem], { trackHistory: true, historyLabel: 'Neuer Prozessfall hinzugefügt' });
    setShowDetailsSection(true);
  }

  function addDerivedCase(caseItem: ProcessMiningObservationCase, derivedObservations: ProcessMiningObservation[], summary?: DerivationSummary) {
    mergeState([...cases, caseItem], [...observations, ...derivedObservations], summary, {
      trackHistory: true,
      historyLabel: 'Prozessfall automatisch ausgewertet',
    });
    if (derivedObservations.some(observation => observation.kind === 'step')) {
      setExpandedEditorCaseId(caseItem.id);
      setShowReadiness(true);
    }
  }

  function updateCase(id: string, updatedCase: ProcessMiningObservationCase) {
    updateCases(cases.map(caseItem => (caseItem.id === id ? updatedCase : caseItem)));
  }

  function deleteCase(id: string) {
    const updatedCases = cases.filter(caseItem => caseItem.id !== id);
    const updatedObservations = observations.filter(observation => observation.sourceCaseId !== id);
    mergeState(updatedCases, updatedObservations, state.lastDerivationSummary, {
      trackHistory: true,
      historyLabel: 'Quelle entfernt',
    });
    if (expandedEditorCaseId === id) setExpandedEditorCaseId(null);
  }

  function canReanalyzeCase(caseItem: ProcessMiningObservationCase): boolean {
    return caseItem.sourceType !== 'eventlog' && caseItem.routingContext?.routingClass !== 'eventlog-table';
  }

  function extractForCase(caseItem: ProcessMiningObservationCase) {
    if (!canReanalyzeCase(caseItem)) return;
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
    mergeState(updatedCases, [...remainingObservations, ...remappedObservations], result.summary, {
      trackHistory: true,
      historyLabel: 'Quelle neu ausgewertet',
    });
    setExpandedEditorCaseId(caseItem.id);
    setShowCaseDetails(true);
    setShowDetailsSection(true);
  }

  function handleFileImport(importedCases: ProcessMiningObservationCase[], importedObservations: ProcessMiningObservation[], derivationSummary?: DerivationSummary) {
    mergeState([...cases, ...importedCases], [...observations, ...importedObservations], derivationSummary, {
      trackHistory: true,
      historyLabel: 'Dokumente oder Tabellen importiert',
    });
    const firstCaseWithSteps = importedCases.find(caseItem =>
      importedObservations.some(observation => observation.sourceCaseId === caseItem.id && observation.kind === 'step'),
    );
    if (firstCaseWithSteps) {
      setExpandedEditorCaseId(firstCaseWithSteps.id);
      setShowReadiness(true);
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
    observations.length > 0 ? computeQualitySummary(cases, observations, state.lastDerivationSummary?.issueSignals?.length) : undefined
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
  const quickJumpItems = [
    {
      id: 'intake',
      label: '1. Hochladen',
      hint: cases.length > 0 ? `${cases.length} Quellen vorhanden` : 'Dokument oder Fall hinzufügen',
      onClick: () => scrollToSection(intakeRef),
    },
    {
      id: 'result',
      label: '2. Ergebnis prüfen',
      hint: quality ? `${quality.stepObservationCount} Schritte · ${quality.issueObservationCount} Reibungssignale` : 'noch keine Auswertung',
      badge: readinessBadge,
      onClick: () => {
        setShowReadiness(true);
        scrollToSection(readinessRef);
      },
    },
    {
      id: 'optional',
      label: '3. Optional nachschärfen',
      hint: reviewOverview.suggestionCount > 0 ? 'empfohlene Korrekturen prüfen' : 'nur bei Bedarf öffnen',
      badge: reviewBadge,
      onClick: () => {
        setShowOptionalSection(true);
        setShowReview(true);
        scrollToSection(optionalRef);
      },
    },
    {
      id: 'export',
      label: '4. Qualitätscheck exportieren',
      hint: canProceed ? 'JSON für die externe Qualitätsbewertung erzeugen' : 'wird nach der ersten Auswertung aktiv',
      onClick: () => {
        scrollToSection(exportRef);
      },
    },
  ];

  return (
    <div className="space-y-6">
      <StepStageHeader
        title="Dokument oder Fall automatisch auswerten"
        description="Der Hauptpfad ist bewusst einfach gehalten: Dokument hochladen oder Fall beschreiben, automatisch analysieren, Ergebnis kurz prüfen und danach den Qualitätscheck als JSON exportieren. Alles Weitere bleibt optional eingeklappt."
        helpKey="pmv2.observations"
        tone="blue"
        badges={(
          <>
            <span className="rounded-full border border-white/90 bg-white/90 px-2.5 py-1 text-[11px] font-medium text-slate-700">
              {cases.length === 0 ? 'Noch keine Quelle' : `${cases.length} ${cases.length === 1 ? 'Quelle' : 'Quellen'}`}
            </span>
            <span className="rounded-full border border-white/90 bg-white/90 px-2.5 py-1 text-[11px] font-medium text-slate-700">
              {stepObservations.length === 0 ? 'Noch keine Schritte' : `${stepObservations.length} erkannte Schritte`}
            </span>
            {quality && (
              <span className="rounded-full border border-white/90 bg-white/90 px-2.5 py-1 text-[11px] font-medium text-slate-700">
                {quality.issueObservationCount} Reibungssignale
              </span>
            )}
          </>
        )}
      />

      <StepQuickJumpBar title="Kernpfad" items={quickJumpItems} />


      <div ref={intakeRef}>
        <WorkbenchSection
          title="1. Dokument hochladen oder Fall beschreiben"
          description="Starten Sie hier mit eigenem Material. Alles Weitere bleibt bewusst nachgelagert oder optional."
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

            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">So läuft der Hauptpfad</p>
              <ol className="mt-3 grid gap-3 md:grid-cols-3">
                {[
                  {
                    title: '1. Quelle wählen',
                    text: 'Dokument hochladen oder Fall beschreiben.',
                  },
                  {
                    title: '2. Analyse prüfen',
                    text: 'Erkannte Schritte, Rollen und Signale kurz auf Plausibilität prüfen.',
                  },
                  {
                    title: '3. Qualitätscheck exportieren',
                    text: 'Den Analysezustand als JSON für die externe Bewertung mitnehmen.',
                  },
                ].map((card, index) => (
                  <li key={card.title} className="rounded-xl border border-white bg-white px-4 py-3 shadow-sm">
                    <div className="flex items-center gap-2 text-slate-700">
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-xs font-semibold text-white">
                        {index + 1}
                      </span>
                      <p className="text-sm font-semibold text-slate-900">{card.title}</p>
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-slate-600">{card.text}</p>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </WorkbenchSection>
      </div>

      <div ref={readinessRef}>
        <WorkbenchSection
          title="2. Analyseergebnis prüfen"
          description="Hier sehen Sie, was die App aus Ihrem Material wirklich abgeleitet hat. Erst wenn dieses Ergebnis plausibel wirkt, gehen Sie weiter oder exportieren den Qualitätscheck als JSON."
          helpKey="pmv2.maturity"
          badge={sourceBadge ?? readinessBadge ?? undefined}
          collapsible
          open={showReadiness}
          onToggle={() => setShowReadiness(open => !open)}
        >
          <div className="space-y-4">
            {!lastSummary && !quality && cases.length === 0 && (
              <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
                Sobald ein Dokument oder Fall ausgewertet wurde, sehen Sie hier den erkannten Prozessentwurf und die wichtigsten Qualitätsmerkmale.
              </div>
            )}

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
                {lastSummary.documentSummary && <p className="text-xs leading-relaxed text-slate-500">{lastSummary.documentSummary}</p>}
              </div>
            )}

            {lastSummary && <LocalEngineProfilePanel summary={lastSummary} />}
            {quality && <QualitySummaryCard summary={quality} />}
            {cases.length > 0 && <ImportHealthPanel state={state} />}
            {cases.length > 0 && (
              <SourceOverviewPanel
                cases={cases}
                observations={observations}
                lastDerivationSummary={lastSummary}
                expandedCaseId={expandedEditorCaseId}
                onFocusCase={focusEditorForCase}
                onReanalyzeCase={caseId => {
                  const selectedCase = cases.find(caseItem => caseItem.id === caseId);
                  if (selectedCase) extractForCase(selectedCase);
                }}
              />
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

      <div ref={optionalRef}>
        <WorkbenchSection
          title="3. Optional nachschärfen"
          description="Diese Werkzeuge sind bewusst optional. Öffnen Sie sie nur, wenn das Ergebnis noch nicht plausibel genug wirkt oder einzelne Quellen nachbearbeitet werden müssen."
          helpKey="pmv2.details"
          badge={reviewBadge}
          collapsible
          open={showOptionalSection}
          onToggle={() => setShowOptionalSection(open => !open)}
        >
          <div className="space-y-4">
            {(quality || cases.length > 0) && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-900">Qualität und Datenreife nachschärfen</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">Nutzen Sie diese Hinweise nur bei Bedarf. Der Hauptpfad funktioniert auch ohne diese Zusatzschicht.</p>
                <div className="mt-3">
                  <DataMaturityWorkshopPanel state={state} version={version} reviewSuggestionCount={reviewOverview.suggestionCount} onAction={handleMaturityAction} />
                </div>
              </div>
            )}

            <div ref={reviewRef} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Prüfwerkstatt</p>
                  <p className="text-xs leading-relaxed text-slate-500">Öffnen Sie diesen Bereich vor allem dann, wenn offene Korrekturvorschläge angezeigt werden.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowReview(open => !open)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
                >
                  {showReview ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  {showReview ? 'Prüfwerkstatt ausblenden' : 'Prüfwerkstatt anzeigen'}
                </button>
              </div>
              {showReview && (
                <StepReviewWorkbench
                  cases={cases}
                  observations={observations}
                  reviewState={reviewState}
                  onApplyChange={handleReviewWorkbenchChange}
                  onFocusCase={focusEditorForCase}
                  onUndo={undoReviewChange}
                  onRedo={redoReviewChange}
                  canUndo={historyCounts.undo > 0}
                  canRedo={historyCounts.redo > 0}
                  sessionStatusLabel={sessionStatusLabel}
                />
              )}
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Beleg-Inspektor</p>
                  <p className="text-xs leading-relaxed text-slate-500">Optionaler Tiefenblick auf Fundstellen, Rollen- und Systemkontext einzelner Schritte.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowEvidence(open => !open)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
                >
                  {showEvidence ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  {showEvidence ? 'Belege ausblenden' : 'Belege anzeigen'}
                </button>
              </div>
              {showEvidence && <EvidenceInspectorPanel cases={cases} observations={observations} onFocusCase={focusEditorForCase} />}
            </div>

            <div ref={detailsRef} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Detailbearbeitung</p>
                  <p className="text-xs leading-relaxed text-slate-500">Nur nötig, wenn Texte, Metadaten oder einzelne erkannte Schritte im Einzelfall nachgeschärft werden sollen.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowDetailsSection(open => !open)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
                  >
                    {showDetailsSection ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    {showDetailsSection ? 'Detailbearbeitung ausblenden' : 'Detailbearbeitung anzeigen'}
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
              </div>
              {showDetailsSection && (
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
                  {cases.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setShowCaseDetails(show => !show)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
                      >
                        {showCaseDetails ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        {showCaseDetails ? 'Detailkarten ausblenden' : 'Detailkarten anzeigen'}
                      </button>
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
                              allowExtract={canReanalyzeCase(caseItem)}
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
              )}
            </div>

            <div ref={aiRef} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Optionale KI-Verfeinerung</p>
                  <p className="text-xs leading-relaxed text-slate-500">Die lokale Analyse bleibt der Hauptweg. Öffnen Sie diesen Bereich nur, wenn Formulierungen oder Cluster zusätzlich per KI geschärft werden sollen.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAiSection(open => !open)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
                >
                  {showAiSection ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  {showAiSection ? 'KI-Bereich ausblenden' : 'KI-Bereich anzeigen'}
                </button>
              </div>
              {showAiSection && <ProcessMiningAiPanel process={process} version={version} settings={settings} state={state} onApply={onChange} />}
            </div>
          </div>
        </WorkbenchSection>
      </div>

      <div ref={exportRef}>
        <WorkbenchSection
          title="4. Qualitätscheck exportieren"
          description="Wenn das aktuelle Ergebnis plausibel wirkt, exportieren Sie den Analysezustand als JSON und laden ihn anschließend zur externen Qualitätsbewertung hoch."
          helpKey="pmv2.qualityExport"
        >
          <QualityExportPanel
            process={process}
            version={version}
            state={state}
            settings={settings}
            integrity={integrity}
          />
        </WorkbenchSection>
      </div>

      <StepActionBar
        summaryTitle="Was als Nächstes sinnvoll ist"
        statusBadge={(
          <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${canProceed ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
            {canProceed ? 'Analyse kann starten' : 'Basis fehlt noch'}
          </span>
        )}
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
