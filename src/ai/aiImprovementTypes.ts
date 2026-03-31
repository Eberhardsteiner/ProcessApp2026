import type {
  ImprovementCategory,
  ImprovementScope,
  ImprovementStatus,
  Level3,
  AutomationApproach,
  AutomationLevel,
  ControlType,
} from '../domain/process';

export type AiImprovementSchemaVersion = 'ai-improvement-v1';

export interface AiImprovementPatchV1 {
  schemaVersion: AiImprovementSchemaVersion;
  language: 'de';
  itemId: string;

  patch: {
    title?: string;
    description?: string;
    category?: ImprovementCategory;
    scope?: ImprovementScope;
    relatedStepId?: string;

    impact?: Level3;
    effort?: Level3;
    risk?: Level3;

    owner?: string;
    dueDate?: string;
    status?: ImprovementStatus;

    automationBlueprint?: {
      approach: AutomationApproach;
      level: AutomationLevel;
      humanInTheLoop: boolean;

      systemIds?: string[];
      dataObjectIds?: string[];
      kpiIds?: string[];
      controls?: ControlType[];
      notes?: string;
    };
  };

  assumptions?: string[];
  warnings?: string[];
}

export type AiImprovementSuggestionsSchemaVersion = 'ai-improvement-suggestions-v1';

export interface AiImprovementSuggestionV1 {
  title: string;
  description?: string;

  category: ImprovementCategory;
  scope: ImprovementScope;
  relatedStepId?: string;

  impact: Level3;
  effort: Level3;
  risk: Level3;

  owner?: string;
  dueDate?: string;
  status?: ImprovementStatus;

  automationBlueprint?: {
    approach: AutomationApproach;
    level: AutomationLevel;
    humanInTheLoop: boolean;

    systemIds?: string[];
    dataObjectIds?: string[];
    kpiIds?: string[];
    controls?: ControlType[];
    notes?: string;
  };
}

export interface AiImprovementSuggestionsV1 {
  schemaVersion: AiImprovementSuggestionsSchemaVersion;
  language: 'de';
  suggestions: AiImprovementSuggestionV1[];
  assumptions?: string[];
  warnings?: string[];
}
