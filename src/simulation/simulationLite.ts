import type {
  StepLeadTimeBucket,
  CaptureDraftStep,
} from '../domain/capture';
import type { FrequencyBucket, ImprovementBacklogItem } from '../domain/process';

export function bucketToMinutes(bucket?: StepLeadTimeBucket): number | null {
  switch (bucket) {
    case 'minutes':
      return 15;
    case 'hours':
      return 120;
    case '1_day':
      return 480;
    case '2_5_days':
      return 1680;
    case '1_2_weeks':
      return 3600;
    case 'over_2_weeks':
      return 7200;
    case 'unknown':
    case 'varies':
    default:
      return null;
  }
}

export interface BaselineResult {
  processingKnownMin: number;
  waitingKnownMin: number;
  leadTimeKnownMin: number;
  unknownProcessingCount: number;
  unknownWaitingCount: number;
  assumptions: string[];
}

export function computeBaselineFromSteps(steps: CaptureDraftStep[]): BaselineResult {
  let processingKnownMin = 0;
  let waitingKnownMin = 0;
  let unknownProcessingCount = 0;
  let unknownWaitingCount = 0;

  for (const step of steps) {
    const procMin = bucketToMinutes(step.processingTime);
    const waitMin = bucketToMinutes(step.waitingTime);

    if (procMin !== null) {
      processingKnownMin += procMin;
    } else {
      unknownProcessingCount++;
    }

    if (waitMin !== null) {
      waitingKnownMin += waitMin;
    } else {
      unknownWaitingCount++;
    }
  }

  const leadTimeKnownMin = processingKnownMin + waitingKnownMin;

  const assumptions = [
    'Annahme: 8h pro Arbeitstag',
    'Buckets werden als typische Minutenwerte abgebildet',
    'minutes=15, hours=120, 1_day=480, 2_5_days=1680, 1_2_weeks=3600, over_2_weeks=7200',
    'unknown/varies werden nicht quantifiziert',
  ];

  return {
    processingKnownMin,
    waitingKnownMin,
    leadTimeKnownMin,
    unknownProcessingCount,
    unknownWaitingCount,
    assumptions,
  };
}

export interface CasesPerYearResult {
  casesPerYear: number | null;
  label: string;
}

export function estimateCasesPerYear(freq?: FrequencyBucket): CasesPerYearResult {
  switch (freq) {
    case 'daily':
      return { casesPerYear: 250, label: 'täglich (≈250 Arbeitstage/Jahr)' };
    case 'weekly':
      return { casesPerYear: 52, label: 'wöchentlich (≈52 Wochen/Jahr)' };
    case 'monthly':
      return { casesPerYear: 12, label: 'monatlich (12 Monate/Jahr)' };
    case 'quarterly':
      return { casesPerYear: 4, label: 'quartalsweise (4 Quartale/Jahr)' };
    case 'yearly':
      return { casesPerYear: 1, label: 'jährlich (1x/Jahr)' };
    case 'unknown':
    case 'ad_hoc':
    default:
      return { casesPerYear: null, label: 'unbekannt/ad hoc' };
  }
}

export function expectedSavingMinPerCase(item: ImprovementBacklogItem): number {
  const share = Math.max(0, Math.min(100, item.impactEstimate?.affectedCaseSharePct ?? 100)) / 100;
  const saving = item.impactEstimate?.leadTimeSavingMinPerCase ?? 0;
  return saving * share;
}

export function formatMinutesShort(min: number): string {
  if (min < 60) {
    return `${Math.round(min)}m`;
  }

  const hours = min / 60;
  if (hours < 8) {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }

  const days = hours / 8;
  const d = Math.floor(days);
  const remainingHours = Math.round((days - d) * 8);
  return remainingHours > 0 ? `${d}d ${remainingHours}h` : `${d}d`;
}
