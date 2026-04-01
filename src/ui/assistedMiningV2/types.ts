import type {
  ProcessMiningAssistedV2State,
  ProcessMiningAssistedV2Step,
  ProcessMiningObservationCase,
  ProcessMiningObservation,
  ProcessMiningDiscoverySummary,
  ProcessMiningConformanceSummary,
  ProcessMiningEnhancementSummary,
  ProcessMiningQualitySummary,
} from '../../domain/process';

export type {
  ProcessMiningAssistedV2State,
  ProcessMiningAssistedV2Step,
  ProcessMiningObservationCase,
  ProcessMiningObservation,
  ProcessMiningDiscoverySummary,
  ProcessMiningConformanceSummary,
  ProcessMiningEnhancementSummary,
  ProcessMiningQualitySummary,
};

export interface MiningStepDef {
  id: ProcessMiningAssistedV2Step;
  label: string;
  subtitle: string;
  description: string;
}

export const MINING_STEPS: MiningStepDef[] = [
  {
    id: 'observations',
    label: 'Prozess auswerten',
    subtitle: 'Automatische Erkennung',
    description: 'Beschreibe einen Prozessablauf oder lade ein Dokument hoch — Schritte werden automatisch erkannt.',
  },
  {
    id: 'discovery',
    label: 'Kernprozess erkennen',
    subtitle: 'Discovery',
    description: 'Aus den erkannten Schritten wird der häufigste Ablauf sichtbar gemacht.',
  },
  {
    id: 'conformance',
    label: 'Mit Soll abgleichen',
    subtitle: 'Conformance',
    description: 'Vergleiche, was wirklich passiert, mit dem, was laut Prozessbeschreibung passieren soll.',
  },
  {
    id: 'enhancement',
    label: 'Verbesserungen erkennen',
    subtitle: 'Enhancement',
    description: 'Welche Probleme, Wartezeiten oder Schwachstellen fallen auf?',
  },
  {
    id: 'augmentation',
    label: 'Ergebnisse anreichern',
    subtitle: 'Augmented Results',
    description: 'Kontext ergänzen, Berichte erzeugen und gut lesbare Übergaben vorbereiten.',
  },
];

export const OBSERVATION_KINDS: Array<{ value: ProcessMiningObservation['kind']; label: string }> = [
  { value: 'step', label: 'Schritt' },
  { value: 'variant', label: 'Variante' },
  { value: 'timing', label: 'Zeitangabe' },
  { value: 'role', label: 'Beteiligte Person / Rolle' },
  { value: 'issue', label: 'Problem' },
  { value: 'other', label: 'Sonstiges' },
];

export const ENHANCEMENT_KINDS: Array<{ value: 'timing' | 'rework' | 'handoff' | 'missing' | 'other'; label: string }> = [
  { value: 'timing', label: 'Wartezeit / Verzögerung' },
  { value: 'rework', label: 'Wiederholung / Nacharbeit' },
  { value: 'handoff', label: 'Übergabe / Schnittstelle' },
  { value: 'missing', label: 'Fehlende Information' },
  { value: 'other', label: 'Sonstiges' },
];
