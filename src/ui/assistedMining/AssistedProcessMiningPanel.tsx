import type { Process, ProcessVersion } from '../../domain/process';
import type { AppSettings } from '../../settings/appSettings';
import { AssistedMiningWorkbench } from '../assistedMiningV2/AssistedMiningWorkbench';

interface AssistedProcessMiningPanelProps {
  process: Process;
  version: ProcessVersion;
  settings: AppSettings;
  onSave: (patch: Partial<ProcessVersion>) => Promise<void>;
  variant?: 'guided' | 'expert';
}

export function AssistedProcessMiningPanel(props: AssistedProcessMiningPanelProps) {
  return <AssistedMiningWorkbench {...props} />;
}
