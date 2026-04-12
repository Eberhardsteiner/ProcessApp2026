import type {
  Process,
  ProcessMiningAssistedV2State,
  ProcessVersion,
} from '../../domain/process';
import type { AppSettings } from '../../settings/appSettings';
import { evaluatePilotReadiness } from './pilotReadiness';
import { ReleaseReadinessPanel } from './ReleaseReadinessPanel';
import { GovernancePanel } from './GovernancePanel';
import { CollaborationPanel } from './CollaborationPanel';
import { SecurityPrivacyPanel } from './SecurityPrivacyPanel';
import { PilotReadinessPanel } from './PilotReadinessPanel';
import { PilotToolkitPanel } from './PilotToolkitPanel';
import { AcceptancePanel } from './AcceptancePanel';
import { IntegrationReadinessPanel } from './IntegrationReadinessPanel';
import { ConnectorBundlesPanel } from './ConnectorBundlesPanel';
import { IntegrationWorkbenchPanel } from './IntegrationWorkbenchPanel';
import { WorkspaceSnapshotPanel } from './WorkspaceSnapshotPanel';
import { WorkbenchSection } from './WorkbenchSection';

interface Props {
  process: Process;
  version: ProcessVersion;
  settings: AppSettings;
  state: ProcessMiningAssistedV2State;
  onChange: (patch: Partial<ProcessMiningAssistedV2State>) => void;
  onSaveEvidence: (text: string, key: string) => void;
  onRestoreState: (nextState: ProcessMiningAssistedV2State) => void;
}

export function AssistedMiningQaSection({
  process,
  version,
  settings,
  state,
  onChange,
  onSaveEvidence,
  onRestoreState,
}: Props) {
  const pilotReadiness = evaluatePilotReadiness({ state, version });

  return (
    <WorkbenchSection
      title="QA-, Review- und Freigabeflächen"
      description="Dieser Bereich ist bewusst vom operativen Hauptpfad getrennt. Er bündelt lokale Review-, Pilot-, Connector-, Security- und Abnahmehilfen für gezielte QA-Sitzungen."
      helpKey="pmv2.augmentation"
    >
      <div className="space-y-6">
        <ReleaseReadinessPanel state={state} version={version} settings={settings} />

        <GovernancePanel
          state={state}
          version={version}
          onChange={onChange}
          onSaveEvidence={onSaveEvidence}
        />

        <CollaborationPanel
          state={state}
          version={version}
          onChange={onChange}
          onSaveEvidence={onSaveEvidence}
        />

        <SecurityPrivacyPanel
          version={version}
          state={state}
          settings={settings}
          onChange={onChange}
        />

        <div className="space-y-4">
          <PilotReadinessPanel state={state} version={version} />
          <PilotToolkitPanel
            process={process}
            version={version}
            state={state}
            onChange={onChange}
            onSaveEvidence={onSaveEvidence}
          />
        </div>

        <AcceptancePanel
          process={process}
          version={version}
          settings={settings}
          state={state}
          onChange={onChange}
          onSaveEvidence={onSaveEvidence}
        />

        <div className="space-y-4">
          <IntegrationReadinessPanel
            state={state}
            version={version}
            settings={settings}
          />
          <ConnectorBundlesPanel
            process={process}
            version={version}
            state={state}
            settings={settings}
            onChange={onChange}
          />
          <IntegrationWorkbenchPanel
            process={process}
            version={version}
            state={state}
            settings={settings}
            onChange={onChange}
          />
        </div>

        <WorkspaceSnapshotPanel
          process={process}
          version={version}
          state={state}
          readiness={pilotReadiness}
          onRestoreState={onRestoreState}
        />
      </div>
    </WorkbenchSection>
  );
}
