import type { StepLeadTimeBucket, StepLevelBucket } from '../domain/capture';

export function leadTimeBucketFromMs(ms: number): StepLeadTimeBucket {
  if (!ms || ms <= 0 || !Number.isFinite(ms)) return 'unknown';
  const min60 = 60 * 60 * 1000;
  const h8 = 8 * min60;
  const h24 = 24 * min60;
  const d5 = 5 * h24;
  const d14 = 14 * h24;
  if (ms < min60) return 'minutes';
  if (ms < h8) return 'hours';
  if (ms < h24) return '1_day';
  if (ms < d5) return '2_5_days';
  if (ms < d14) return '1_2_weeks';
  return 'over_2_weeks';
}

export function volumeBucketFromCoverage(coverage: number): StepLevelBucket {
  if (coverage >= 0.8) return 'high';
  if (coverage >= 0.4) return 'medium';
  if (coverage > 0) return 'low';
  return 'unknown';
}

export function reworkBucketFromPct(pct: number): StepLevelBucket {
  if (pct >= 0.2) return 'high';
  if (pct >= 0.05) return 'medium';
  if (pct > 0) return 'low';
  return 'unknown';
}
