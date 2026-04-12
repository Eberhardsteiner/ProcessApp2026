import type { ProcessMiningOperatingMode } from '../../domain/process';

export interface OperatingModeProfile {
  key: ProcessMiningOperatingMode;
  label: string;
  shortLabel: string;
  summary: string;
  detail: string;
  badgeClass: string;
  observationDefaults: {
    showReadiness: boolean;
    showReview: boolean;
    showSources: boolean;
    showEvidence: boolean;
    showDetailsSection: boolean;
    showBenchmark: boolean;
    showAiSection: boolean;
    showCaseDetails: boolean;
  };
  augmentationDefaults: {
    showSteps: boolean;
    showDeviations: boolean;
    showHotspots: boolean;
  };
}

export const OPERATING_MODE_PROFILES: Record<ProcessMiningOperatingMode, OperatingModeProfile> = {
  'quick-check': {
    key: 'quick-check',
    label: 'Kurztest',
    shortLabel: 'Kurztest',
    summary: 'Für den ersten Eindruck. Die App hält den Blick auf Erfassung, Hauptlinie und nächste sinnvolle Schritte.',
    detail: 'Optionale Tiefenbereiche bleiben zunächst im Hintergrund. Gut für erste Tests mit wenig Material.',
    badgeClass: 'border-cyan-200 bg-cyan-50 text-cyan-800',
    observationDefaults: {
      showReadiness: true,
      showReview: true,
      showSources: false,
      showEvidence: false,
      showDetailsSection: false,
      showBenchmark: false,
      showAiSection: false,
      showCaseDetails: false,
    },
    augmentationDefaults: {
      showSteps: true,
      showDeviations: false,
      showHotspots: false,
    },
  },
  standard: {
    key: 'standard',
    label: 'Standard',
    shortLabel: 'Standard',
    summary: 'Der ausgewogene Normalmodus. Die App zeigt die Hauptstrecke offen und hält Vertiefungen erreichbar, aber nicht dominant.',
    detail: 'Empfohlen für die meisten Einzelanalysen und den normalen Ausbau eines Arbeitsstands.',
    badgeClass: 'border-violet-200 bg-violet-50 text-violet-800',
    observationDefaults: {
      showReadiness: true,
      showReview: true,
      showSources: true,
      showEvidence: false,
      showDetailsSection: false,
      showBenchmark: false,
      showAiSection: false,
      showCaseDetails: true,
    },
    augmentationDefaults: {
      showSteps: true,
      showDeviations: false,
      showHotspots: false,
    },
  },
  pilot: {
    key: 'pilot',
    label: 'Pilotlauf',
    shortLabel: 'Pilot',
    summary: 'Für längere Tests und nachvollziehbare Übergaben. Qualität, Quellen, Belege und Benchmarks werden stärker in den Vordergrund gerückt.',
    detail: 'Sinnvoll, wenn mehrere Personen mitarbeiten oder der Stand für Review, Bericht und Pilottermine belastbar bleiben soll.',
    badgeClass: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    observationDefaults: {
      showReadiness: true,
      showReview: true,
      showSources: true,
      showEvidence: true,
      showDetailsSection: true,
      showBenchmark: true,
      showAiSection: false,
      showCaseDetails: true,
    },
    augmentationDefaults: {
      showSteps: true,
      showDeviations: true,
      showHotspots: true,
    },
  },
};

export function getOperatingModeProfile(mode: ProcessMiningOperatingMode | undefined): OperatingModeProfile {
  return OPERATING_MODE_PROFILES[mode ?? 'standard'];
}
