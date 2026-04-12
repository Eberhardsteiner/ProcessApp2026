export type AiCaptureSchemaVersion = 'ai-capture-v1';

export interface AiCaptureResultV1 {
  schemaVersion: AiCaptureSchemaVersion;
  language: 'de';
  endToEnd: {
    trigger: string;
    customer: string;
    outcome: string;
    doneCriteria?: string;
  };
  happyPath: string[];
  roles?: string[];
  systems?: string[];
  dataObjects?: string[];
  kpis?: Array<{
    name: string;
    definition: string;
    unit?: string;
    target?: string;
  }>;
  aiReadinessSignals?: {
    standardization: 'low' | 'medium' | 'high';
    dataAvailability: 'low' | 'medium' | 'high';
    variability: 'low' | 'medium' | 'high';
    complianceRisk: 'low' | 'medium' | 'high';
  };
  decisions?: Array<{
    gatewayType?: 'xor' | 'and' | 'or';
    afterStep: number;
    question: string;
    evidenceSnippet?: string;
    branches: Array<{
      conditionLabel: string;
      nextStep?: number;
      endsProcess?: boolean;
      notes?: string;
    }>;
  }>;
  exceptions?: Array<{
    type: 'missing_data' | 'timeout' | 'error' | 'cancellation' | 'compliance' | 'other';
    relatedStep?: number;
    description: string;
    handling: string;
    evidenceSnippet?: string;
  }>;
  stepDetails?: Array<{
    step: number;
    role?: string;
    system?: string;
    workType?: 'manual' | 'user_task' | 'service_task' | 'ai_assisted' | 'unknown';
    painPointHint?: string;
    dataIn?: string[];
    dataOut?: string[];
    evidenceSnippet?: string;
  }>;
  notes?: string[];
  assumptions?: string[];
  warnings?: string[];
}
