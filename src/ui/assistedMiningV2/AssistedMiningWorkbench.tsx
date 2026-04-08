import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import type {
  Process,
  ProcessVersion,
  ImprovementBacklogItem,
  EvidenceSource,
} from '../../domain/process';
import type { AppSettings } from '../../settings/appSettings';
import type { ProcessMiningAssistedV2State, ProcessMiningAssistedV2Step } from './types';
import { MINING_STEPS } from './types';
import { createEmptyV2State, loadV2State, setV2Step, buildSidecarPatch } from './storage';
import { AssistedMiningStepper } from './AssistedMiningStepper';
import { ObservationsStep } from './ObservationsStep';
import { DiscoveryStep } from './DiscoveryStep';
import { ConformanceStep } from './ConformanceStep';
import { EnhancementStep } from './EnhancementStep';
import { AugmentationStep } from './AugmentationStep';
import { AnalysisReadinessPanel } from './AnalysisReadinessPanel';
import { LocalAnalysisDigestPanel } from './LocalAnalysisDigestPanel';
import { DataMaturityWorkshopPanel } from './DataMaturityWorkshopPanel';
import { buildReviewOverview } from './reviewSuggestions';
import { MiningWorkspaceOverview } from './MiningWorkspaceOverview';
import { applyConsistentPatch } from './stateConsistency';
import { hardenWorkspaceState, type WorkspaceIntegrityReport } from './workspaceIntegrity';
import { WorkspaceIntegrityPanel } from './WorkspaceIntegrityPanel';
import { HelpPopover } from '../components/HelpPopover';
import type { HelpKey } from '../help/helpTexts';

interface Props {
  process: Process;
  version: ProcessVersion;
  settings: AppSettings;
  onSave: (patch: Partial<ProcessVersion>) => Promise<void>;
}

const STEP_HELP_KEYS: Record<ProcessMiningAssistedV2Step, HelpKey> = {
  observations: 'pmv2.observations',
  discovery: 'pmv2.discovery',
  conformance: 'pmv2.conformance',
  enhancement: 'pmv2.enhancement',
  augmentation: 'pmv2.augmentation',
};

const STEP_ORDER: ProcessMiningAssistedV2Step[] = [
  'observations',
  'discovery',
  'conformance',
  'enhancement',
  'augmentation',
];

const EMPTY_INTEGRITY: WorkspaceIntegrityReport = {
  severity: 'healthy',
  headline: 'Arbeitsstand wirkt konsistent.',
  summary: 'Die Kernobjekte des Assisted Process Mining wirken im aktuellen Stand stimmig.',
  issues: [],
  repairedCount: 0,
  criticalCount: 0,
};

export function AssistedMiningWorkbench({ process, version, settings, onSave }: Props) {
  const initialLoad = useMemo(() => loadV2State(version), [version]);
  const [miningState, setMiningState] = useState<ProcessMiningAssistedV2State>(() => initialLoad.state);
  const latestStateRef = useRef(miningState);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string>('');
  const [consistencyNotice, setConsistencyNotice] = useState<string[]>([]);
  const [integrityReport, setIntegrityReport] = useState<WorkspaceIntegrityReport>(initialLoad.integrity);
  const [showOverviewDetails, setShowOverviewDetails] = useState(false);

  useEffect(() => {
    latestStateRef.current = miningState;
  }, [miningState]);

  useEffect(() => {
    const loaded = loadV2State(version);
    latestStateRef.current = loaded.state;
    setSaveError('');
    setConsistencyNotice(loaded.integrity.issues.map(issue => issue.message));
    setIntegrityReport(loaded.integrity);
    setMiningState(loaded.state);
    setShowOverviewDetails(false);
  }, [version.id]);

  const saveState = useCallback(
    async (newState: ProcessMiningAssistedV2State) => {
      setSaving(true);
      setSaveError('');
      try {
        const sidecarPatch = buildSidecarPatch(newState);
        await onSave({ sidecar: { ...version.sidecar, ...sidecarPatch } });
      } catch (error) {
        setSaveError(error instanceof Error ? `Speichern fehlgeschlagen: ${error.message}` : 'Speichern fehlgeschlagen.');
      } finally {
        setSaving(false);
      }
    },
    [onSave, version.sidecar],
  );

  function applyPatch(patch: Partial<ProcessMiningAssistedV2State>) {
    const result = applyConsistentPatch(latestStateRef.current, patch);
    latestStateRef.current = result.next;
    setConsistencyNotice(result.notes);
    setIntegrityReport(result.integrity);
    setMiningState(result.next);
    void saveState(result.next);
  }

  function goToStep(step: ProcessMiningAssistedV2Step) {
    const hardened = hardenWorkspaceState(setV2Step(latestStateRef.current, step));
    latestStateRef.current = hardened.state;
    setConsistencyNotice(hardened.report.issues.map(issue => issue.message));
    setIntegrityReport(hardened.report);
    setMiningState(hardened.state);
    void saveState(hardened.state);
  }

  function resetState() {
    const next = createEmptyV2State();
    latestStateRef.current = next;
    setConsistencyNotice(['Der Assisted-Process-Mining-Arbeitsstand wurde für diese Version zurückgesetzt. Andere Bereiche der Version bleiben unverändert.']);
    setIntegrityReport(EMPTY_INTEGRITY);
    setSaveError('');
    setMiningState(next);
    setShowOverviewDetails(true);
    void saveState(next);
  }

  function replaceState(nextState: ProcessMiningAssistedV2State) {
    const hardened = hardenWorkspaceState(nextState);
    latestStateRef.current = hardened.state;
    setConsistencyNotice([
      'Ein gesicherter PM-Arbeitsstand wurde wiederhergestellt. Prüfen Sie kurz Bericht, Übergaben und Datenreife.',
      ...hardened.report.issues.map(issue => issue.message),
    ]);
    setIntegrityReport(hardened.report);
    setSaveError('');
    setMiningState(hardened.state);
    setShowOverviewDetails(false);
    void saveState(hardened.state);
  }

  function goNext() {
    const idx = STEP_ORDER.indexOf(miningState.currentStep);
    if (idx < STEP_ORDER.length - 1) {
      goToStep(STEP_ORDER[idx + 1]);
    }
  }

  function goBack() {
    const idx = STEP_ORDER.indexOf(miningState.currentStep);
    if (idx > 0) {
      goToStep(STEP_ORDER[idx - 1]);
    }
  }

  async function handleSaveVersion(patch: {
    improvementItems?: ImprovementBacklogItem[];
    evidenceSources?: EvidenceSource[];
  }) {
    const currentBacklog = version.sidecar.improvementBacklog ?? [];
    const currentEvidence = version.sidecar.evidenceSources ?? [];
    const updatedSidecar = { ...version.sidecar };
    if (patch.improvementItems) {
      updatedSidecar.improvementBacklog = [...currentBacklog, ...patch.improvementItems];
    }
    if (patch.evidenceSources) {
      updatedSidecar.evidenceSources = [...currentEvidence, ...patch.evidenceSources];
    }
    await onSave({ sidecar: updatedSidecar });
  }

  const currentStepDef = MINING_STEPS.find(s => s.id === miningState.currentStep);
  const reviewSuggestionCount = useMemo(
    () => buildReviewOverview({ cases: miningState.cases, observations: miningState.observations }).suggestionCount,
    [miningState.cases, miningState.observations],
  );
  const completedSteps = new Set<ProcessMiningAssistedV2Step>(
    STEP_ORDER.slice(0, STEP_ORDER.indexOf(miningState.currentStep)) as ProcessMiningAssistedV2Step[],
  );

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 space-y-1.5">
              {currentStepDef && (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                      Assisted Process Mining
                    </span>
                    <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-medium text-blue-800">
                      Aktueller Schritt: {currentStepDef.label}
                    </span>
                    <HelpPopover helpKey={STEP_HELP_KEYS[miningState.currentStep]} ariaLabel={`Hilfe: ${currentStepDef.label}`} />
                  </div>
                  <div className="space-y-1">
                    <h2 className="text-lg font-bold text-slate-900">{currentStepDef.label}</h2>
                    <p className="text-sm font-medium text-slate-500">{currentStepDef.subtitle}</p>
                    <p className="text-sm leading-relaxed text-slate-600">{currentStepDef.description}</p>
                  </div>
                </>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-700">
                Version {version.versionLabel ?? version.versionId}
              </span>
              <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${saveError ? 'border-rose-200 bg-rose-50 text-rose-800' : saving ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
                {saveError ? 'Speichern fehlgeschlagen' : saving ? 'Speichern läuft' : 'Arbeitsstand lokal gesichert'}
              </span>
            </div>
          </div>

          <AssistedMiningStepper
            currentStep={miningState.currentStep}
            completedSteps={completedSteps}
            onStepClick={goToStep}
          />
        </div>
      </div>

      {saveError && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 shadow-sm space-y-3">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 h-2.5 w-2.5 rounded-full bg-rose-500 shrink-0" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-rose-900">Der Arbeitsstand konnte nicht sicher gespeichert werden.</p>
              <p className="text-sm leading-relaxed text-rose-900/90">{saveError}</p>
              <p className="text-xs leading-relaxed text-rose-900/80">
                Ihre Änderungen bleiben in dieser Sitzung sichtbar. Speichern Sie den aktuellen Stand bitte erneut, bevor Sie weiterarbeiten oder den Browser schließen.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void saveState(latestStateRef.current)}
              className="inline-flex items-center rounded-xl bg-rose-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-rose-700 transition-colors"
            >
              Erneut speichern
            </button>
          </div>
        </div>
      )}

      <MiningWorkspaceOverview
        state={miningState}
        version={version}
        settings={settings}
        currentStep={miningState.currentStep}
        detailsOpen={showOverviewDetails}
        consistencyNotice={consistencyNotice}
        onToggleDetails={() => setShowOverviewDetails(open => !open)}
        onOperatingModeChange={mode => applyPatch({ operatingMode: mode })}
      />

      {(integrityReport.severity !== 'healthy' || showOverviewDetails) && <WorkspaceIntegrityPanel report={integrityReport} />}

      {showOverviewDetails && (
        <div className="space-y-4">
          <AnalysisReadinessPanel state={miningState} version={version} />
          {miningState.currentStep !== 'observations' && (
            <DataMaturityWorkshopPanel
              state={miningState}
              version={version}
              reviewSuggestionCount={reviewSuggestionCount}
              compact
            />
          )}
          <LocalAnalysisDigestPanel state={miningState} version={version} />
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        {miningState.currentStep === 'observations' && (
          <ObservationsStep
            process={process}
            version={version}
            settings={settings}
            state={miningState}
            integrity={integrityReport}
            onChange={applyPatch}
            onResetState={resetState}
            onNext={goNext}
          />
        )}
        {miningState.currentStep === 'discovery' && (
          <DiscoveryStep
            state={miningState}
            onChange={applyPatch}
            onNext={goNext}
            onBack={goBack}
          />
        )}
        {miningState.currentStep === 'conformance' && (
          <ConformanceStep
            state={miningState}
            version={version}
            onChange={applyPatch}
            onNext={goNext}
            onBack={goBack}
          />
        )}
        {miningState.currentStep === 'enhancement' && (
          <EnhancementStep
            state={miningState}
            onChange={applyPatch}
            onNext={goNext}
            onBack={goBack}
          />
        )}
        {miningState.currentStep === 'augmentation' && (
          <AugmentationStep
            process={process}
            version={version}
            settings={settings}
            state={miningState}
            onChange={applyPatch}
            onSaveVersion={handleSaveVersion}
            onRestoreState={replaceState}
            onBack={goBack}
          />
        )}
      </div>
    </div>
  );
}
