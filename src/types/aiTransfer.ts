export type AiTransferContext =
  | 'phase2-goal'
  | 'phase1-model-selection'
  | 'phase3-summary'
  | 'phase4-summary'
  | 'phase5-completion'
  | 'full-process';

export type AiSupportType =
  | 'reflection'
  | 'alternatives'
  | 'implementation'
  | 'feedback'
  | 'questions';

export interface AiTransferSection {
  id: string;
  title: string;
  description: string;
  phaseNumber: number;
  order: number;
  defaultForContexts: AiTransferContext[];
}

export interface AiTransferOptions {
  context: AiTransferContext;
  supportType: AiSupportType;
  selectedSectionIds: string[];
  userQuestion?: string;
}

export interface AiTransferData {
  processTitle?: string;
  processGoal?: string;
  processContext?: string;
  clusters?: string[];
  focusTopic?: string;
  resourceAnalysis?: string;
  modelReflection?: string;
  selectedResources?: string[];
  actionPlan?: string;
  timeline?: string;
  implementationControl?: string;
  additionalNotes?: string;
}
