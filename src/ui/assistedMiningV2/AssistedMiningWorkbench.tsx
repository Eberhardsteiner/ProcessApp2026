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

export function AssistedMiningWorkbench({ process, version, settings, onSave }: Props) {
  const [miningState, setMiningState] = useState<ProcessMiningAssistedV2State>(() =>
    loadV2State(version),
  );
  const latestStateRef = useRef(miningState);
  const [saving, setSaving] = useState(false);
  const [consistencyNotice, setConsistencyNotice] = useState<string[]>([]);
  const [showOverviewDetails, setShowOverviewDetails] = useState(
    miningState.currentStep === 'observations' || miningState.observations.length === 0,
  );

  useEffect(() => {
    latestStateRef.current = miningState;
  }, [miningState]);

  useEffect(() => {
    const loadedState = loadV2State(version);
    latestStateRef.current = loadedState;
    setConsistencyNotice([]);
    setMiningState(loadedState);
    setShowOverviewDetails(loadedState.currentStep === 'observations' || loadedState.observations.length === 0);
  }, [version.id]);

  const saveState = useCallback(
    async (newState: ProcessMiningAssistedV2State) => {
      setSaving(true);
      try {
        const sidecarPatch = buildSidecarPatch(newState);
        await onSave({ sidecar: { ...version.sidecar, ...sidecarPatch } });
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
    setMiningState(result.next);
    saveState(result.next);
  }

  function goToStep(step: ProcessMiningAssistedV2Step) {
    const next = setV2Step(latestStateRef.current, step);
    latestStateRef.current = next;
    setMiningState(next);
    saveState(next);
  }

  function resetState() {
    const next = createEmptyV2State();
    latestStateRef.current = next;
    setConsistencyNotice(['Der Assisted-Process-Mining-Arbeitsstand wurde für diese Version zurückgesetzt. Andere Bereiche der Version bleiben unverändert.']);
    setMiningState(next);
    setShowOverviewDetails(true);
    saveState(next);
  }

  function replaceState(nextState: ProcessMiningAssistedV2State) {
    latestStateRef.current = nextState;
    setConsistencyNotice(['Ein gesicherter PM-Arbeitsstand wurde wiederhergestellt. Prüfen Sie kurz Bericht, Übergaben und Datenreife.']);
    setMiningState(nextState);
    setShowOverviewDetails(nextState.currentStep === 'observations' || nextState.observations.length === 0);
    saveState(nextState);
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
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
        <AssistedMiningStepper
          currentStep={miningState.currentStep}
          completedSteps={completedSteps}
          onStepClick={goToStep}
        />
      </div>

      {currentStepDef && (
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold text-slate-900">{currentStepDef.label}</h2>
            <HelpPopover helpKey={STEP_HELP_KEYS[miningState.currentStep]} ariaLabel={`Hilfe: ${currentStepDef.label}`} />
            <span className="text-xs text-slate-400 font-medium">{currentStepDef.subtitle}</span>
          </div>
          <p className="text-sm text-slate-500">{currentStepDef.description}</p>
        </div>
      )}

      {saving && (
        <div className="text-xs text-slate-400 text-right">Speichern…</div>
      )}

      <MiningWorkspaceOverview
        state={miningState}
        version={version}
        currentStep={miningState.currentStep}
        detailsOpen={showOverviewDetails}
        consistencyNotice={consistencyNotice}
        onToggleDetails={() => setShowOverviewDetails(open => !open)}
      />

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
