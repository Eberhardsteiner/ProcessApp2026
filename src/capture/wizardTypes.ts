import type { CapturePhase } from '../domain/capture';

export type WizardPhase = CapturePhase;

export type QuestionType =
  | 'short_text'
  | 'long_text'
  | 'single_select'
  | 'multi_select'
  | 'boolean'
  | 'number'
  | 'rating'
  | 'list';

export interface QuestionOption {
  value: string;
  label: string;
  help?: string;
}

export interface QuestionValidation {
  minLen?: number;
  maxLen?: number;
  pattern?: string;
  message?: string;
  min?: number;
  max?: number;
}

export type MappingTarget = 'process' | 'version' | 'draft' | 'sidecar';

export interface QuestionMapping {
  target: MappingTarget;
  path: string;
}

export interface WizardQuestion {
  id: string;
  phase: WizardPhase;
  title: string;
  prompt: string;
  help?: string;
  examples?: string[];
  required?: boolean;
  type: QuestionType;
  options?: QuestionOption[];
  validation?: QuestionValidation;
  mapsTo: QuestionMapping;
}

export interface WizardAnswer {
  questionId: string;
  value: unknown;
}
