import type {
  EventlogEligibilityCriterion,
  NormalizedTableEvent,
  SourceRoutingContext,
  TableColumnMapping,
  TableColumnProfile,
  TableColumnSemanticType,
} from '../domain/process';
import { routeSourceMaterial } from './sourceRouter';

export interface TableSourceAnalysis {
  routingContext: SourceRoutingContext;
  pipelineMode: 'eventlog-table' | 'weak-raw-table';
  tableProfile: {
    rowCount: number;
    columnCount: number;
    consistentWidthShare: number;
    emptyValueShare: number;
    timestampParseShare: number;
    numericValueShare: number;
    shortValueShare: number;
    longValueShare: number;
    averageTextLengthPerCell: number;
    rowOrderCoherence: number;
    caseCoherence: number;
    columnProfiles: TableColumnProfile[];
  };
  inferredSchema: TableColumnMapping[];
  acceptedColumnMappings: TableColumnMapping[];
  rejectedColumnMappings: TableColumnMapping[];
  mappingConfidence: number;
  eventlogEligibility: {
    eligible: boolean;
    reasons: string[];
    fallbackReason?: string;
    minimumCriteria: EventlogEligibilityCriterion[];
  };
  normalizedEvents: NormalizedTableEvent[];
  weakTableSignals: Array<{ label: string; snippet: string }>;
  weakRowSignals: Array<{
    label: string;
    snippet: string;
    sourceRowIndex: number;
    sourceCellRefs: string[];
    confidence: number;
    supportClass: 'support-evidence' | 'issue-signal' | 'weak-raw-fragment';
    roleHint?: string;
    systemHint?: string;
  }>;
  rowEvidenceStats: {
    rowsWithEvidence: number;
    eventsCreated: number;
    weakSignalsCreated: number;
    rowsWithAcceptedCoreMapping: number;
    rowsWithMissingCoreData: number;
  };
  traceStats?: {
    caseCount: number;
    averageEventsPerCase: number;
    orderedTraceShare: number;
    reconstructedSingleCase?: boolean;
  };
}

type InternalColumnProfile = TableColumnProfile & {
  values: string[];
  topValues: Array<{ value: string; count: number }>;
  integerShare: number;
  monotonicShare: number;
  activityLikeShare: number;
  roleLikeShare: number;
  personLikeShare: number;
  systemLikeShare: number;
  statusLikeShare: number;
  lifecycleLikeShare: number;
  locationLikeShare: number;
  freeTextLikeShare: number;
  identifierLikeShare: number;
  caseLikeShare: number;
};

type MappingScoreEntry = {
  semanticType: TableColumnSemanticType;
  score: number;
  supportingSignals: string[];
  conflictingSignals: string[];
  mappingOrigin: string[];
};

import {
  ACTIVITY_HEADER_RE,
  AMOUNT_HINT_RE,
  CASE_HEADER_RE,
  CASE_HINT_RE,
  clamp01,
  COMMENT_HINT_RE,
  END_HINT_RE,
  headerSuggestsSupportNotActivity,
  headerSuggestsSupportNotTimestamp,
  LOCATION_HINT_RE,
  looksActivityLike,
  looksCaseIdentifier,
  looksFreeTextLike,
  looksIdentifierLike,
  looksInteger,
  looksLifecycleLike,
  looksLocationLike,
  looksNumeric,
  looksPersonLike,
  looksRoleLike,
  looksStatusLike,
  looksSystemLike,
  looksTimestamp,
  normalizeCell,
  parseNumber,
  parseTimestampIso,
  ratio,
  RESOURCE_HINT_RE,
  ROLE_HINT_RE,
  round2,
  START_HINT_RE,
  ORDER_HINT_RE,
} from './tabularSignalHeuristics';

function uniqueValues(values: string[]): string[] {
  return Array.from(new Set(values));
}

function isBooleanLike(value: string): boolean {
  return /^(true|false|ja|nein|yes|no|0|1)$/i.test(value);
}

function getTopValues(values: string[]): Array<{ value: string; count: number }> {
  const counts = new Map<string, number>();
  values.forEach(value => {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  });
  return Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5)
    .map(([value, count]) => ({ value, count }));
}

function computeRepetitionRate(values: string[]): number {
  if (values.length === 0) return 0;
  const uniqueCount = uniqueValues(values).length;
  return clamp01(1 - uniqueCount / values.length);
}

function computeMonotonicShare(values: string[], parser: (value: string) => number | null): number {
  const parsed = values.map(parser).filter((value): value is number => value !== null);
  if (parsed.length <= 1) return 0;
  let orderedPairs = 0;
  for (let index = 1; index < parsed.length; index += 1) {
    if (parsed[index] >= parsed[index - 1]) orderedPairs += 1;
  }
  return orderedPairs / Math.max(parsed.length - 1, 1);
}

function averageLength(values: string[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value.length, 0) / values.length;
}

function normalizeHeaders(headers: string[], columnCount: number): string[] {
  return Array.from({ length: columnCount }, (_, index) => normalizeCell(headers[index] ?? `Spalte ${index + 1}`));
}

function normalizeRows(headers: string[], rows: string[][]): { headers: string[]; rows: string[][]; columnCount: number } {
  const columnCount = Math.max(headers.length, ...rows.map(row => row.length), 1);
  const normalizedHeaders = normalizeHeaders(headers, columnCount);
  const normalizedRows = rows.map(row =>
    Array.from({ length: columnCount }, (_, index) => normalizeCell(row[index])),
  );
  return { headers: normalizedHeaders, rows: normalizedRows, columnCount };
}

function buildColumnSemanticDistribution(profile: {
  activityLikeShare: number;
  roleLikeShare: number;
  personLikeShare: number;
  systemLikeShare: number;
  statusLikeShare: number;
  lifecycleLikeShare: number;
  locationLikeShare: number;
  freeTextLikeShare: number;
  identifierLikeShare: number;
  caseLikeShare: number;
}): Array<{ signal: string; share: number }> {
  return [
    { signal: 'activity-like', share: round2(profile.activityLikeShare) },
    { signal: 'case-like', share: round2(profile.caseLikeShare) },
    { signal: 'identifier-like', share: round2(profile.identifierLikeShare) },
    { signal: 'role-like', share: round2(profile.roleLikeShare) },
    { signal: 'person-like', share: round2(profile.personLikeShare) },
    { signal: 'system-like', share: round2(profile.systemLikeShare) },
    { signal: 'status-like', share: round2(profile.statusLikeShare) },
    { signal: 'lifecycle-like', share: round2(profile.lifecycleLikeShare) },
    { signal: 'location-like', share: round2(profile.locationLikeShare) },
    { signal: 'free-text-like', share: round2(profile.freeTextLikeShare) },
  ].filter(entry => entry.share > 0);
}

function profileColumn(headers: string[], rows: string[][], index: number): InternalColumnProfile {
  const header = normalizeCell(headers[index] ?? `Spalte ${index + 1}`);
  const values = rows.map(row => normalizeCell(row[index])).filter(Boolean);
  const total = Math.max(values.length, 1);
  const emptyShare = 1 - values.length / Math.max(rows.length, 1);
  const shortLabelShare = ratio(values.filter(value => value.length <= 36).length, total);
  const longFreeTextShare = ratio(values.filter(looksFreeTextLike).length, total);
  const parseableTimestampShare = ratio(values.filter(looksTimestamp).length, total);
  const numericShare = ratio(values.filter(looksNumeric).length, total);
  const integerShare = ratio(values.filter(looksInteger).length, total);
  const booleanShare = ratio(values.filter(isBooleanLike).length, total);
  const activityLikeShare = ratio(values.filter(looksActivityLike).length, total);
  const caseLikeShare = ratio(values.filter(looksCaseIdentifier).length, total);
  const identifierLikeShare = ratio(values.filter(looksIdentifierLike).length, total);
  const roleLikeShare = ratio(values.filter(looksRoleLike).length, total);
  const personLikeShare = ratio(values.filter(looksPersonLike).length, total);
  const systemLikeShare = ratio(values.filter(looksSystemLike).length, total);
  const statusLikeShare = ratio(values.filter(looksStatusLike).length, total);
  const lifecycleLikeShare = ratio(values.filter(looksLifecycleLike).length, total);
  const locationLikeShare = ratio(values.filter(looksLocationLike).length, total);
  const freeTextLikeShare = ratio(values.filter(looksFreeTextLike).length, total);
  const topValues = getTopValues(values);
  const monotonicShare = Math.max(
    computeMonotonicShare(values, value => {
      const iso = parseTimestampIso(value);
      return iso ? Date.parse(iso) : null;
    }),
    computeMonotonicShare(values, value => parseNumber(value)),
  );

  return {
    columnIndex: index,
    header,
    nonEmptyShare: round2(values.length / Math.max(rows.length, 1)),
    emptyShare: round2(emptyShare),
    averageCellLength: round2(averageLength(values)),
    repetitionRate: round2(computeRepetitionRate(values)),
    cardinalityRatio: round2(values.length === 0 ? 0 : uniqueValues(values).length / values.length),
    parseableTimestampShare: round2(parseableTimestampShare),
    numericShare: round2(numericShare),
    shortLabelShare: round2(shortLabelShare),
    longFreeTextShare: round2(longFreeTextShare),
    semanticDistribution: buildColumnSemanticDistribution({
      activityLikeShare,
      caseLikeShare,
      identifierLikeShare,
      roleLikeShare,
      personLikeShare,
      systemLikeShare,
      statusLikeShare,
      lifecycleLikeShare,
      locationLikeShare,
      freeTextLikeShare,
    }),
    typeDistribution: {
      empty: round2(emptyShare),
      numeric: round2(numericShare),
      timestamp: round2(parseableTimestampShare),
      boolean: round2(booleanShare),
      shortText: round2(shortLabelShare),
      longText: round2(longFreeTextShare),
    },
    values,
    topValues,
    integerShare: round2(integerShare),
    monotonicShare: round2(monotonicShare),
    activityLikeShare: round2(activityLikeShare),
    caseLikeShare: round2(caseLikeShare),
    identifierLikeShare: round2(identifierLikeShare),
    roleLikeShare: round2(roleLikeShare),
    personLikeShare: round2(personLikeShare),
    systemLikeShare: round2(systemLikeShare),
    statusLikeShare: round2(statusLikeShare),
    lifecycleLikeShare: round2(lifecycleLikeShare),
    locationLikeShare: round2(locationLikeShare),
    freeTextLikeShare: round2(freeTextLikeShare),
  };
}

function buildTableProfile(headers: string[], rows: string[][]): TableSourceAnalysis['tableProfile'] {
  const rowCount = rows.length;
  const columnCount = Math.max(headers.length, 1);
  const rowWidths = rows.map(row => row.filter(Boolean).length);
  const widthCounts = new Map<number, number>();
  rowWidths.forEach(width => widthCounts.set(width, (widthCounts.get(width) ?? 0) + 1));
  const modalWidth = Array.from(widthCounts.entries()).sort((left, right) => right[1] - left[1])[0]?.[0] ?? columnCount;
  const consistentWidthShare = ratio(rowWidths.filter(width => Math.abs(width - modalWidth) <= 1).length, Math.max(rowCount, 1));
  const allCells = rows.flat();
  const nonEmptyCells = allCells.filter(Boolean);
  const emptyValueShare = 1 - ratio(nonEmptyCells.length, Math.max(allCells.length, 1));
  const timestampParseShare = ratio(nonEmptyCells.filter(looksTimestamp).length, Math.max(nonEmptyCells.length, 1));
  const numericValueShare = ratio(nonEmptyCells.filter(looksNumeric).length, Math.max(nonEmptyCells.length, 1));
  const shortValueShare = ratio(nonEmptyCells.filter(value => value.length <= 36).length, Math.max(nonEmptyCells.length, 1));
  const longValueShare = ratio(nonEmptyCells.filter(looksFreeTextLike).length, Math.max(nonEmptyCells.length, 1));
  const averageTextLengthPerCell = averageLength(nonEmptyCells);
  const columnProfiles = Array.from({ length: columnCount }, (_, index) => profileColumn(headers, rows, index));

  return {
    rowCount,
    columnCount,
    consistentWidthShare: round2(consistentWidthShare),
    emptyValueShare: round2(emptyValueShare),
    timestampParseShare: round2(timestampParseShare),
    numericValueShare: round2(numericValueShare),
    shortValueShare: round2(shortValueShare),
    longValueShare: round2(longValueShare),
    averageTextLengthPerCell: round2(averageTextLengthPerCell),
    rowOrderCoherence: 0,
    caseCoherence: 0,
    columnProfiles,
  };
}

function scoreMapping(profile: InternalColumnProfile): MappingScoreEntry[] {
  const header = profile.header.toLowerCase();
  const lowLongText = 1 - profile.longFreeTextShare;
  const moderateCardinality = profile.cardinalityRatio >= 0.05 && profile.cardinalityRatio <= 0.9 ? 1 : profile.cardinalityRatio <= 0.98 ? 0.55 : 0;
  const lowCardinality = profile.cardinalityRatio <= 0.2 ? 1 : profile.cardinalityRatio <= 0.4 ? 0.5 : 0;
  const repeatedValues = profile.repetitionRate;
  const supportHeaderBias = headerSuggestsSupportNotActivity(header);
  const supportTimestampBias = headerSuggestsSupportNotTimestamp(header);
  const results: MappingScoreEntry[] = [];

  const pushEntry = (semanticType: TableColumnSemanticType, score: number, supportingSignals: string[], conflictingSignals: string[], mappingOrigin: string[]) => {
    results.push({
      semanticType,
      score: clamp01(score),
      supportingSignals,
      conflictingSignals,
      mappingOrigin,
    });
  };

  const caseSignals: string[] = [];
  const caseConflicts: string[] = [];
  const caseOrigin: string[] = [];
  let caseScore = 0;
  if (CASE_HINT_RE.test(header)) {
    caseScore += 0.24;
    caseSignals.push('header-case-hint');
    caseOrigin.push('header');
  }
  caseScore += profile.caseLikeShare * 0.34
    + profile.identifierLikeShare * 0.14
    + repeatedValues * 0.18
    + moderateCardinality * 0.14
    + profile.shortLabelShare * 0.08
    + profile.nonEmptyShare * 0.06
    + lowLongText * 0.06;
  if (profile.longFreeTextShare > 0.28) caseConflicts.push('long-free-text-conflict');
  if (profile.parseableTimestampShare > 0.5 && profile.caseLikeShare < 0.42) caseConflicts.push('timestamp-conflict');
  if (profile.activityLikeShare > 0.65 && profile.caseLikeShare < 0.3) caseConflicts.push('activity-heavy-values');
  caseSignals.push(`case-like=${profile.caseLikeShare}`);
  caseSignals.push(`identifier-like=${profile.identifierLikeShare}`);
  caseSignals.push(`repetition=${profile.repetitionRate}`);
  caseOrigin.push('value-patterns', 'distribution');
  pushEntry('case-id', caseScore, caseSignals, caseConflicts, caseOrigin);

  const activitySignals: string[] = [];
  const activityConflicts: string[] = [];
  const activityOrigin: string[] = [];
  let activityScore = 0;
  if (ACTIVITY_HEADER_RE.test(header)) {
    activityScore += 0.24;
    activitySignals.push('header-activity-hint');
    activityOrigin.push('header');
  }
  if (supportHeaderBias && !ACTIVITY_HEADER_RE.test(header)) {
    activityScore -= 0.22;
    activityConflicts.push('support-header-conflict');
  }
  activityScore += profile.activityLikeShare * 0.42
    + profile.shortLabelShare * 0.08
    + repeatedValues * 0.08
    + profile.nonEmptyShare * 0.08
    + lowLongText * 0.06;
  if (profile.numericShare > 0.55) activityConflicts.push('numeric-conflict');
  if (profile.longFreeTextShare > 0.24) activityConflicts.push('free-text-conflict');
  if (profile.parseableTimestampShare > 0.25) activityConflicts.push('timestamp-conflict');
  if (profile.systemLikeShare > 0.55 && profile.activityLikeShare < 0.55) activityConflicts.push('system-heavy-values');
  if (profile.roleLikeShare > 0.55 && profile.activityLikeShare < 0.55) activityConflicts.push('role-heavy-values');
  if (profile.caseLikeShare > 0.45) activityConflicts.push('case-id-pattern-conflict');
  activitySignals.push(`activity-like=${profile.activityLikeShare}`);
  activityOrigin.push('value-distribution');
  pushEntry('activity', activityScore, activitySignals, activityConflicts, activityOrigin);

  const timestampSignals: string[] = [];
  const timestampConflicts: string[] = [];
  const timestampOrigin: string[] = [];
  let timestampScore = 0;
  if (/\b(timestamp|zeit|datum|time|created|occurred|logged|date_hint)\b/i.test(header)) {
    timestampScore += 0.24;
    timestampSignals.push('header-timestamp-hint');
    timestampOrigin.push('header');
  }
  if (supportTimestampBias && !/\b(timestamp|zeit|datum|time|created|occurred|logged|date_hint)\b/i.test(header)) {
    timestampScore -= 0.18;
    timestampConflicts.push('non-time-header-conflict');
  }
  timestampScore += profile.parseableTimestampShare * 0.62 + profile.monotonicShare * 0.08 + profile.nonEmptyShare * 0.06;
  if (profile.longFreeTextShare > 0.22) timestampConflicts.push('free-text-conflict');
  if (profile.numericShare > 0.65 && profile.parseableTimestampShare < 0.3) timestampConflicts.push('numeric-index-conflict');
  if (profile.identifierLikeShare > 0.3) timestampConflicts.push('identifier-pattern-conflict');
  if (profile.caseLikeShare > 0.35) timestampConflicts.push('case-id-pattern-conflict');
  timestampSignals.push(`timestamp-share=${profile.parseableTimestampShare}`);
  timestampOrigin.push('value-parsing');
  pushEntry('timestamp', timestampScore, timestampSignals, timestampConflicts, timestampOrigin);

  pushEntry(
    'start-timestamp',
    (START_HINT_RE.test(header) && /\b(time|zeit|datum|timestamp|date)\b/i.test(header) ? 0.3 : 0.01) + profile.parseableTimestampShare * 0.54 + profile.monotonicShare * 0.08,
    START_HINT_RE.test(header) ? ['header-start-timestamp-hint'] : [],
    [
      ...(profile.longFreeTextShare > 0.24 ? ['free-text-conflict'] : []),
      ...(profile.identifierLikeShare > 0.22 ? ['identifier-pattern-conflict'] : []),
    ],
    ['header', 'value-parsing'],
  );

  pushEntry(
    'end-timestamp',
    (END_HINT_RE.test(header) && /\b(time|zeit|datum|timestamp|date)\b/i.test(header) ? 0.3 : 0.01) + profile.parseableTimestampShare * 0.54 + profile.monotonicShare * 0.08,
    END_HINT_RE.test(header) ? ['header-end-timestamp-hint'] : [],
    [
      ...(profile.longFreeTextShare > 0.24 ? ['free-text-conflict'] : []),
      ...(profile.identifierLikeShare > 0.22 ? ['identifier-pattern-conflict'] : []),
    ],
    ['header', 'value-parsing'],
  );

  pushEntry(
    'order-index',
    (ORDER_HINT_RE.test(header) ? 0.16 : 0) + profile.integerShare * 0.4 + profile.monotonicShare * 0.26 + profile.nonEmptyShare * 0.08,
    [ORDER_HINT_RE.test(header) ? 'header-order-hint' : '', `monotonicity=${profile.monotonicShare}`].filter(Boolean),
    [
      ...(profile.longFreeTextShare > 0.15 ? ['free-text-conflict'] : []),
      ...(profile.parseableTimestampShare > 0.5 ? ['timestamp-preferred'] : []),
      ...(profile.caseLikeShare > 0.35 ? ['case-id-preferred'] : []),
    ],
    ['header', 'value-order'],
  );

  pushEntry(
    'resource',
    (RESOURCE_HINT_RE.test(header) ? 0.22 : 0) + profile.personLikeShare * 0.22 + profile.roleLikeShare * 0.12 + moderateCardinality * 0.1 + profile.shortLabelShare * 0.06 + lowLongText * 0.06,
    RESOURCE_HINT_RE.test(header) ? ['header-resource-hint'] : [],
    [
      ...(profile.longFreeTextShare > 0.28 ? ['free-text-conflict'] : []),
      ...(profile.numericShare > 0.35 ? ['numeric-conflict'] : []),
      ...(profile.systemLikeShare > 0.55 && profile.roleLikeShare < 0.25 ? ['system-preferred'] : []),
    ],
    ['header', 'entity-patterns'],
  );

  pushEntry(
    'role',
    (ROLE_HINT_RE.test(header) ? 0.26 : 0) + profile.roleLikeShare * 0.3 + profile.shortLabelShare * 0.08 + lowLongText * 0.08 + lowCardinality * 0.08,
    ROLE_HINT_RE.test(header) ? ['header-role-hint'] : [],
    [
      ...(profile.longFreeTextShare > 0.3 ? ['free-text-conflict'] : []),
      ...(profile.numericShare > 0.4 ? ['numeric-conflict'] : []),
      ...(profile.systemLikeShare > 0.55 && profile.roleLikeShare < 0.35 ? ['system-preferred'] : []),
    ],
    ['header', 'entity-patterns'],
  );

  pushEntry(
    'system',
    (/\b(system|system_hint|tool|app|application|anwendung|plattform|portal)\b/i.test(header) ? 0.28 : 0) + profile.systemLikeShare * 0.36 + profile.shortLabelShare * 0.06 + lowLongText * 0.08 + lowCardinality * 0.06,
    /\b(system|system_hint|tool|app|application|anwendung|plattform|portal)\b/i.test(header) ? ['header-system-hint'] : [],
    [
      ...(profile.longFreeTextShare > 0.26 ? ['free-text-conflict'] : []),
      ...(profile.numericShare > 0.35 ? ['numeric-conflict'] : []),
      ...(profile.activityLikeShare > 0.6 && profile.systemLikeShare < 0.35 ? ['activity-preferred'] : []),
    ],
    ['header', 'entity-patterns'],
  );

  pushEntry(
    'status',
    (/\b(status|state)\b/i.test(header) ? 0.18 : 0) + profile.statusLikeShare * 0.34 + lowCardinality * 0.16 + profile.shortLabelShare * 0.08,
    /\b(status|state)\b/i.test(header) ? ['header-status-hint'] : [],
    profile.longFreeTextShare > 0.22 ? ['free-text-conflict'] : [],
    ['header', 'value-distribution'],
  );

  pushEntry(
    'lifecycle',
    (/\b(lifecycle|life.?cycle|phase|transition)\b/i.test(header) ? 0.18 : 0) + profile.lifecycleLikeShare * 0.36 + lowCardinality * 0.16 + profile.shortLabelShare * 0.08,
    /\b(lifecycle|life.?cycle|phase|transition)\b/i.test(header) ? ['header-lifecycle-hint'] : [],
    profile.longFreeTextShare > 0.22 ? ['free-text-conflict'] : [],
    ['header', 'value-distribution'],
  );

  pushEntry(
    'comment',
    (/\b(comment|kommentar|remark|feedback)\b/i.test(header) ? 0.22 : 0) + profile.freeTextLikeShare * 0.28 + profile.longFreeTextShare * 0.18 + profile.nonEmptyShare * 0.08,
    /\b(comment|kommentar|remark|feedback)\b/i.test(header) ? ['header-comment-hint'] : [],
    profile.numericShare > 0.45 ? ['numeric-conflict'] : [],
    ['header', 'text-density'],
  );

  pushEntry(
    'note',
    (/\b(note|notiz|bemerkung|memo)\b/i.test(header) ? 0.22 : 0) + profile.freeTextLikeShare * 0.24 + profile.longFreeTextShare * 0.14 + profile.nonEmptyShare * 0.06,
    /\b(note|notiz|bemerkung|memo)\b/i.test(header) ? ['header-note-hint'] : [],
    profile.numericShare > 0.45 ? ['numeric-conflict'] : [],
    ['header', 'text-density'],
  );

  pushEntry(
    'free-text-support',
    (COMMENT_HINT_RE.test(header) ? 0.2 : 0) + profile.freeTextLikeShare * 0.32 + profile.longFreeTextShare * 0.18 + profile.nonEmptyShare * 0.08,
    COMMENT_HINT_RE.test(header) ? ['header-free-text-hint'] : [],
    profile.numericShare > 0.45 ? ['numeric-conflict'] : [],
    ['header', 'text-density'],
  );

  pushEntry(
    'amount',
    (AMOUNT_HINT_RE.test(header) ? 0.18 : 0) + profile.numericShare * 0.46 + profile.nonEmptyShare * 0.08,
    AMOUNT_HINT_RE.test(header) ? ['header-amount-hint'] : [],
    [
      ...(profile.monotonicShare > 0.75 && profile.integerShare > 0.8 ? ['order-index-conflict'] : []),
      ...(profile.longFreeTextShare > 0.18 ? ['free-text-conflict'] : []),
    ],
    ['header', 'value-parsing'],
  );

  pushEntry(
    'location',
    (LOCATION_HINT_RE.test(header) ? 0.18 : 0) + profile.locationLikeShare * 0.28 + profile.shortLabelShare * 0.08 + lowLongText * 0.08,
    LOCATION_HINT_RE.test(header) ? ['header-location-hint'] : [],
    [
      ...(profile.longFreeTextShare > 0.25 ? ['free-text-conflict'] : []),
      ...(profile.numericShare > 0.4 ? ['numeric-conflict'] : []),
    ],
    ['header', 'entity-patterns'],
  );

  pushEntry('unknown', 0.12 + profile.longFreeTextShare * 0.18, ['fallback-unknown'], [], ['fallback']);
  return results;
}

function inferColumnMapping(profile: InternalColumnProfile): TableColumnMapping {
  const scored = scoreMapping(profile).sort((left, right) => right.score - left.score);
  const [best, runnerUp] = scored;
  const acceptedThreshold = ['case-id', 'activity', 'timestamp', 'start-timestamp', 'end-timestamp', 'order-index'].includes(best.semanticType)
    ? 0.58
    : ['resource', 'role', 'system', 'status', 'lifecycle'].includes(best.semanticType)
    ? 0.5
    : ['comment', 'note', 'amount', 'location', 'free-text-support'].includes(best.semanticType)
    ? 0.46
    : 0.7;
  const scoreMargin = best.score - (runnerUp?.score ?? 0);
  const supportHeaderBias = headerSuggestsSupportNotActivity(profile.header);
  const supportTimestampBias = headerSuggestsSupportNotTimestamp(profile.header);
  const conflictingSignals = best.conflictingSignals.slice(0, 6);

  const accepted =
    best.semanticType !== 'unknown'
    && best.score >= acceptedThreshold
    && conflictingSignals.length < 3
    && scoreMargin >= (['case-id', 'activity', 'timestamp', 'order-index'].includes(best.semanticType) ? 0.05 : 0.03)
    && !(best.semanticType === 'activity' && supportHeaderBias && scoreMargin < 0.12)
    && !(best.semanticType === 'timestamp' && supportTimestampBias && scoreMargin < 0.12)
    && !(best.semanticType === 'timestamp' && profile.identifierLikeShare > 0.3)
    && !(best.semanticType === 'activity' && profile.systemLikeShare > 0.65 && profile.activityLikeShare < 0.55)
    && !(best.semanticType === 'activity' && profile.roleLikeShare > 0.65 && profile.activityLikeShare < 0.55);

  return {
    columnIndex: profile.columnIndex,
    header: profile.header,
    inferredSemanticType: best.semanticType,
    confidence: round2(best.score),
    supportingSignals: [...best.supportingSignals.slice(0, 5), `margin=${round2(scoreMargin)}`].slice(0, 6),
    conflictingSignals,
    accepted,
    fallbackUse: accepted
      ? undefined
      : best.semanticType === 'activity' || best.semanticType === 'case-id' || best.semanticType === 'timestamp' || best.semanticType === 'order-index'
      ? 'not-strong-enough-for-core'
      : best.semanticType === 'comment' || best.semanticType === 'note' || best.semanticType === 'free-text-support'
      ? 'support-only'
      : 'cluster-signal',
    mappingOrigin: best.mappingOrigin,
  };
}

function bestAcceptedMapping(mappings: TableColumnMapping[], semanticTypes: TableColumnSemanticType[]): TableColumnMapping | undefined {
  return mappings
    .filter(mapping => semanticTypes.includes(mapping.inferredSemanticType) && mapping.accepted)
    .sort((left, right) => right.confidence - left.confidence)[0];
}

function computeMappingConfidence(mappings: TableColumnMapping[]): number {
  const core = mappings.filter(mapping => ['case-id', 'activity', 'timestamp', 'start-timestamp', 'end-timestamp', 'order-index'].includes(mapping.inferredSemanticType) && mapping.accepted);
  if (core.length === 0) return 0;
  return round2(core.reduce((sum, mapping) => sum + mapping.confidence, 0) / core.length);
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function confidenceFromScore(score: number): SourceRoutingContext['routingConfidence'] {
  if (score >= 0.78) return 'high';
  if (score >= 0.56) return 'medium';
  return 'low';
}

function computeRowOrderCoherence(columnProfiles: InternalColumnProfile[], mappings: TableColumnMapping[]): number {
  const timestampMapping = bestAcceptedMapping(mappings, ['timestamp', 'start-timestamp', 'end-timestamp']);
  const orderMapping = bestAcceptedMapping(mappings, ['order-index']);
  const timestampCoherence = timestampMapping ? columnProfiles[timestampMapping.columnIndex]?.monotonicShare ?? 0 : 0;
  const orderCoherence = orderMapping ? columnProfiles[orderMapping.columnIndex]?.monotonicShare ?? 0 : 0;
  return round2(Math.max(timestampCoherence, orderCoherence));
}

function computeCaseCoherence(
  rows: string[][],
  columnProfiles: InternalColumnProfile[],
  mappings: TableColumnMapping[],
  reconstructedSingleCase: boolean,
): number {
  if (reconstructedSingleCase) return 0.82;
  const caseMapping = bestAcceptedMapping(mappings, ['case-id']);
  if (!caseMapping) return 0;
  const profile = columnProfiles[caseMapping.columnIndex];
  const caseValues = rows.map(row => normalizeCell(row[caseMapping.columnIndex])).filter(Boolean);
  if (caseValues.length === 0) return 0;
  const counts = new Map<string, number>();
  caseValues.forEach(value => counts.set(value, (counts.get(value) ?? 0) + 1));
  const distinctCaseCount = counts.size;
  const multiEventCaseShare = ratio(Array.from(counts.values()).filter(count => count > 1).length, Math.max(distinctCaseCount, 1));
  const averageEventsPerCase = caseValues.length / Math.max(distinctCaseCount, 1);
  return round2(
    clamp01(
      profile.nonEmptyShare * 0.22 +
        profile.repetitionRate * 0.18 +
        clamp01((averageEventsPerCase - 1) / 3) * 0.34 +
        multiEventCaseShare * 0.26,
    ),
  );
}

function buildRoutingContext(params: {
  routerContext: SourceRoutingContext;
  pipelineMode: 'eventlog-table' | 'weak-raw-table';
  mappingConfidence: number;
  rowOrderCoherence: number;
  caseCoherence: number;
  acceptedColumnMappings: TableColumnMapping[];
  fallbackReason?: string;
}): SourceRoutingContext {
  const mappingSignals = params.acceptedColumnMappings
    .slice(0, 6)
    .map(mapping => `${mapping.inferredSemanticType}:${mapping.header}:${mapping.confidence.toFixed(2)}`);
  const routingSignals = uniqueStrings([
    ...params.routerContext.routingSignals,
    `tablePipeline=${params.pipelineMode}`,
    `mappingConfidence=${params.mappingConfidence.toFixed(2)}`,
    `rowOrderCoherence=${params.rowOrderCoherence.toFixed(2)}`,
    `caseCoherence=${params.caseCoherence.toFixed(2)}`,
    ...mappingSignals,
  ]);

  if (params.pipelineMode === 'eventlog-table') {
    return {
      routingClass: 'eventlog-table',
      routingConfidence: confidenceFromScore((params.mappingConfidence + params.rowOrderCoherence + params.caseCoherence) / 3),
      routingSignals,
    };
  }

  return {
    routingClass: 'weak-raw-table',
    routingConfidence: 'low',
    routingSignals,
    fallbackReason: params.fallbackReason ?? params.routerContext.fallbackReason,
  };
}

function buildEligibility(params: {
  tableProfile: TableSourceAnalysis['tableProfile'];
  mappings: TableColumnMapping[];
  allMappings: TableColumnMapping[];
  rows: string[][];
  mappingConfidence: number;
}): {
  eligible: boolean;
  reasons: string[];
  fallbackReason?: string;
  minimumCriteria: EventlogEligibilityCriterion[];
  reconstructedSingleCase: boolean;
  rowsWithAcceptedCoreMapping: number;
  rowsWithMissingCoreData: number;
} {
  const { tableProfile, mappings, allMappings, rows, mappingConfidence } = params;
  const activityMapping = bestAcceptedMapping(mappings, ['activity']);
  const caseMapping = bestAcceptedMapping(mappings, ['case-id']);
  const timestampMapping = bestAcceptedMapping(mappings, ['timestamp', 'start-timestamp', 'end-timestamp']);
  const orderMapping = bestAcceptedMapping(mappings, ['order-index']);
  const coreCandidates = allMappings.filter(mapping =>
    ['case-id', 'activity', 'timestamp', 'start-timestamp', 'end-timestamp', 'order-index'].includes(mapping.inferredSemanticType),
  );
  const conflictingCoreAssignments = coreCandidates.filter(mapping => !mapping.accepted && mapping.confidence >= 0.45).length;
  const plausibleCaseHints = allMappings.filter(mapping =>
    (mapping.inferredSemanticType === 'case-id' && mapping.confidence >= 0.42)
    || (CASE_HEADER_RE.test(mapping.header) && mapping.confidence >= 0.35)
    || mapping.supportingSignals.some(signal => signal === 'header-case-hint'),
  );
  const hasPlausibleCaseHint = plausibleCaseHints.length > 0;

  const reconstructedSingleCase = !caseMapping
    && !hasPlausibleCaseHint
    && Boolean(activityMapping)
    && Boolean(timestampMapping || orderMapping)
    && tableProfile.rowCount >= 3
    && tableProfile.consistentWidthShare >= 0.72
    && tableProfile.longValueShare <= 0.22
    && tableProfile.averageTextLengthPerCell <= 42
    && tableProfile.rowCount <= 12;

  const cleanActivityChannel = Boolean(activityMapping) && (activityMapping?.confidence ?? 0) >= 0.55;
  const cleanCaseAnchor = Boolean(caseMapping) && (caseMapping?.confidence ?? 0) >= 0.55;
  const cleanTimeAnchor = Boolean(timestampMapping)
    && (timestampMapping?.confidence ?? 0) >= 0.55
    && tableProfile.timestampParseShare >= 0.55;

  let rowsWithAcceptedCoreMapping = 0;
  let rowsWithMissingCoreData = 0;
  rows.forEach(row => {
    const activityValue = activityMapping ? normalizeCell(row[activityMapping.columnIndex]) : '';
    const caseValue = caseMapping ? normalizeCell(row[caseMapping.columnIndex]) : reconstructedSingleCase ? 'single-case' : '';
    const orderValue = timestampMapping
      ? normalizeCell(row[timestampMapping.columnIndex])
      : orderMapping
      ? normalizeCell(row[orderMapping.columnIndex])
      : '';
    if (activityValue && caseValue && orderValue) {
      rowsWithAcceptedCoreMapping += 1;
    } else {
      rowsWithMissingCoreData += 1;
    }
  });

  const rowCoverage = ratio(rowsWithAcceptedCoreMapping, Math.max(rows.length, 1));
  const criteria: EventlogEligibilityCriterion[] = [
    {
      key: 'activity-channel',
      passed: cleanActivityChannel,
      detail: activityMapping
        ? cleanActivityChannel
          ? `Aktivitätskanal sauber erkannt (${activityMapping.header}, ${activityMapping.confidence.toFixed(2)}).`
          : `Aktivitätskanal ist noch zu unsicher (${activityMapping.header}, ${activityMapping.confidence.toFixed(2)}).`
        : 'Kein belastbarer Aktivitätskanal erkannt.',
    },
    {
      key: 'case-anchor',
      passed: cleanCaseAnchor,
      detail: caseMapping
        ? cleanCaseAnchor
          ? `Case-ID-Kanal sauber erkannt (${caseMapping.header}, ${caseMapping.confidence.toFixed(2)}).`
          : `Case-ID-Kanal ist noch zu unsicher (${caseMapping.header}, ${caseMapping.confidence.toFixed(2)}).`
        : reconstructedSingleCase
        ? 'Nur eine defensive Single-Case-Rekonstruktion liegt vor; das reicht nicht fuer eventlogEligibility=true.'
        : hasPlausibleCaseHint
        ? 'Plausible Case-Hinweise liegen vor, wurden aber noch nicht belastbar genug als Case-ID bestätigt.'
        : 'Kein belastbarer Case-Anker erkannt.',
    },
    {
      key: 'time-anchor',
      passed: cleanTimeAnchor,
      detail: timestampMapping
        ? cleanTimeAnchor
          ? `Zeitanker sauber erkannt (${timestampMapping.header}, ${timestampMapping.confidence.toFixed(2)}).`
          : `Zeitanker ist noch zu unsicher (${timestampMapping.header}, ${timestampMapping.confidence.toFixed(2)}).`
        : 'Kein belastbarer Zeitanker erkannt.',
    },
    {
      key: 'order-anchor',
      passed: Boolean(timestampMapping || orderMapping),
      detail: timestampMapping
        ? `Zeit- oder Reihenfolgeanker erkannt (${timestampMapping.header}, ${timestampMapping.confidence.toFixed(2)}).`
        : orderMapping
        ? `Nur Sequenzanker erkannt (${orderMapping.header}, ${orderMapping.confidence.toFixed(2)}).`
        : 'Kein belastbarer Zeit- oder Sequenzanker erkannt.',
    },
    {
      key: 'core-row-coverage',
      passed: rowCoverage >= 0.58,
      detail: `Zeilen mit vollständigem Kern-Mapping: ${(rowCoverage * 100).toFixed(0)} %.`,
    },
    {
      key: 'mapping-confidence',
      passed: mappingConfidence >= 0.6,
      detail: `Kern-Mapping-Konfidenz: ${mappingConfidence.toFixed(2)}.`,
    },
    {
      key: 'free-text-dominance',
      passed: tableProfile.longValueShare <= 0.3 && tableProfile.averageTextLengthPerCell <= 52,
      detail: `Freitextanteil ${tableProfile.longValueShare.toFixed(2)}, mittlere Zelllänge ${tableProfile.averageTextLengthPerCell.toFixed(2)}.`,
    },
    {
      key: 'conflict-load',
      passed: conflictingCoreAssignments <= 2,
      detail: `Konfliktlast in Kernspalten: ${conflictingCoreAssignments}.`,
    },
    {
      key: 'table-shape',
      passed: tableProfile.rowCount >= 4 && tableProfile.consistentWidthShare >= 0.68 && tableProfile.emptyValueShare <= 0.55,
      detail: `Tabellenform: ${tableProfile.rowCount} Zeilen, Width-Konsistenz ${tableProfile.consistentWidthShare.toFixed(2)}, Leeranteil ${tableProfile.emptyValueShare.toFixed(2)}.`,
    },
  ];

  const eligible = criteria.every(criterion => criterion.passed);
  const reasons = criteria.filter(criterion => !criterion.passed).map(criterion => criterion.detail);
  const fallbackReason = eligible ? undefined : reasons.join(' ');

  return {
    eligible,
    reasons: eligible ? criteria.map(criterion => criterion.detail) : reasons,
    fallbackReason,
    minimumCriteria: criteria,
    reconstructedSingleCase,
    rowsWithAcceptedCoreMapping,
    rowsWithMissingCoreData,
  };
}

function buildRowEvidenceAnchor(headers: string[], row: string[], columnIndexes: number[], rowIndex: number): {
  anchor: string;
  cellRefs: string[];
} {
  const uniqueIndexes = Array.from(new Set(columnIndexes)).filter(index => index >= 0);
  const fragments = uniqueIndexes
    .map(index => {
      const value = normalizeCell(row[index]);
      if (!value) return undefined;
      return `${headers[index] ?? `Spalte ${index + 1}`}: ${value}`;
    })
    .filter((value): value is string => Boolean(value));
  const cellRefs = uniqueIndexes
    .filter(index => normalizeCell(row[index]).length > 0)
    .map(index => `r${rowIndex + 1}c${index + 1}`);
  return {
    anchor: [`row:${rowIndex + 1}`, ...fragments].join(' | ').slice(0, 360),
    cellRefs,
  };
}

function normalizeEvents(params: {
  headers: string[];
  rows: string[][];
  mappings: TableColumnMapping[];
  reconstructedSingleCase: boolean;
}): {
  normalizedEvents: NormalizedTableEvent[];
  traceStats: TableSourceAnalysis['traceStats'];
} {
  const { headers, rows, mappings, reconstructedSingleCase } = params;
  const caseMapping = bestAcceptedMapping(mappings, ['case-id']);
  const activityMapping = bestAcceptedMapping(mappings, ['activity']);
  const timestampMapping = bestAcceptedMapping(mappings, ['timestamp', 'start-timestamp', 'end-timestamp']);
  const orderMapping = bestAcceptedMapping(mappings, ['order-index']);
  const resourceMapping = bestAcceptedMapping(mappings, ['resource']);
  const roleMapping = bestAcceptedMapping(mappings, ['role']);
  const systemMapping = bestAcceptedMapping(mappings, ['system']);
  const statusMapping = bestAcceptedMapping(mappings, ['status']);
  const lifecycleMapping = bestAcceptedMapping(mappings, ['lifecycle']);
  const normalizedEvents: NormalizedTableEvent[] = [];

  if (!activityMapping || !(caseMapping || reconstructedSingleCase) || !(timestampMapping || orderMapping)) {
    return { normalizedEvents, traceStats: undefined };
  }

  rows.forEach((row, rowIndex) => {
    const activity = normalizeCell(row[activityMapping.columnIndex]);
    const caseId = caseMapping ? normalizeCell(row[caseMapping.columnIndex]) : 'single-case';
    const timestampRaw = timestampMapping ? normalizeCell(row[timestampMapping.columnIndex]) : undefined;
    const timestampIso = timestampRaw ? parseTimestampIso(timestampRaw) : undefined;
    const orderAnchor = orderMapping
      ? normalizeCell(row[orderMapping.columnIndex])
      : timestampIso ?? timestampRaw;
    if (!activity || !caseId || !(timestampRaw || orderAnchor)) return;

    const mappedColumns = [
      activityMapping.columnIndex,
      caseMapping?.columnIndex ?? -1,
      timestampMapping?.columnIndex ?? -1,
      orderMapping?.columnIndex ?? -1,
      resourceMapping?.columnIndex ?? -1,
      roleMapping?.columnIndex ?? -1,
      systemMapping?.columnIndex ?? -1,
      statusMapping?.columnIndex ?? -1,
      lifecycleMapping?.columnIndex ?? -1,
    ];
    const evidence = buildRowEvidenceAnchor(headers, row, mappedColumns, rowIndex);
    const participatingMappings = [
      activityMapping,
      caseMapping,
      timestampMapping,
      orderMapping,
      resourceMapping,
      roleMapping,
      systemMapping,
      statusMapping,
      lifecycleMapping,
    ].filter((mapping): mapping is TableColumnMapping => Boolean(mapping));
    const confidence = round2(
      participatingMappings.reduce((sum, mapping) => sum + mapping.confidence, 0) / Math.max(participatingMappings.length, 1),
    );

    normalizedEvents.push({
      eventId: crypto.randomUUID(),
      caseId,
      activity,
      timestampRaw,
      timestampIso,
      orderAnchor: orderAnchor || undefined,
      resource: resourceMapping ? normalizeCell(row[resourceMapping.columnIndex]) || undefined : undefined,
      role: roleMapping ? normalizeCell(row[roleMapping.columnIndex]) || undefined : undefined,
      system: systemMapping ? normalizeCell(row[systemMapping.columnIndex]) || undefined : undefined,
      status: statusMapping ? normalizeCell(row[statusMapping.columnIndex]) || undefined : undefined,
      lifecycle: lifecycleMapping ? normalizeCell(row[lifecycleMapping.columnIndex]) || undefined : undefined,
      rowEvidenceAnchor: evidence.anchor,
      confidence,
      mappingOrigin: uniqueStrings(participatingMappings.flatMap(mapping => mapping.mappingOrigin ?? [])),
      sourceRowIndex: rowIndex,
      sourceCellRefs: evidence.cellRefs,
    });
  });

  const sortedEvents = normalizedEvents.sort((left, right) => {
    if (left.caseId !== right.caseId) return left.caseId.localeCompare(right.caseId);
    if (left.timestampIso && right.timestampIso && left.timestampIso !== right.timestampIso) {
      return left.timestampIso.localeCompare(right.timestampIso);
    }
    const leftOrder = left.orderAnchor ? parseNumber(left.orderAnchor) : null;
    const rightOrder = right.orderAnchor ? parseNumber(right.orderAnchor) : null;
    if (leftOrder !== null && rightOrder !== null && leftOrder !== rightOrder) return leftOrder - rightOrder;
    if ((left.orderAnchor ?? '') !== (right.orderAnchor ?? '')) return (left.orderAnchor ?? '').localeCompare(right.orderAnchor ?? '');
    return left.sourceRowIndex - right.sourceRowIndex;
  });

  const eventsByCase = new Map<string, NormalizedTableEvent[]>();
  sortedEvents.forEach(event => {
    const bucket = eventsByCase.get(event.caseId) ?? [];
    bucket.push(event);
    eventsByCase.set(event.caseId, bucket);
  });
  const orderedCaseCount = Array.from(eventsByCase.values()).filter(events =>
    events.every(event => Boolean(event.timestampIso || event.orderAnchor)),
  ).length;
  const traceStats = sortedEvents.length === 0
    ? undefined
    : {
        caseCount: eventsByCase.size,
        averageEventsPerCase: round2(sortedEvents.length / Math.max(eventsByCase.size, 1)),
        orderedTraceShare: round2(ratio(orderedCaseCount, Math.max(eventsByCase.size, 1))),
        reconstructedSingleCase: reconstructedSingleCase || undefined,
      };

  return {
    normalizedEvents: sortedEvents,
    traceStats,
  };
}

function buildWeakTableSignals(params: {
  headers: string[];
  rows: string[][];
  mappings: TableColumnMapping[];
  tableProfile: TableSourceAnalysis['tableProfile'];
  eligibility: ReturnType<typeof buildEligibility>;
}): TableSourceAnalysis['weakRowSignals'] {
  const { headers, rows, mappings, tableProfile, eligibility } = params;
  const statusMapping = bestAcceptedMapping(mappings, ['status', 'lifecycle']);
  const commentMapping = bestAcceptedMapping(mappings, ['comment', 'note', 'free-text-support']);
  const roleMapping = bestAcceptedMapping(mappings, ['role', 'resource']);
  const systemMapping = bestAcceptedMapping(mappings, ['system']);
  const activityMapping = bestAcceptedMapping(mappings, ['activity']);
  const caseMapping = bestAcceptedMapping(mappings, ['case-id']);
  const orderMapping = bestAcceptedMapping(mappings, ['timestamp', 'start-timestamp', 'end-timestamp', 'order-index']);
  const signals: TableSourceAnalysis['weakRowSignals'] = [];
  const seen = new Set<string>();

  const pushSignal = (signal: TableSourceAnalysis['weakRowSignals'][number]) => {
    const key = `${signal.label}::${signal.sourceRowIndex}`;
    if (seen.has(key) || signals.length >= 18) return;
    seen.add(key);
    signals.push(signal);
  };

  rows.forEach((row, rowIndex) => {
    const statusValue = statusMapping ? normalizeCell(row[statusMapping.columnIndex]) : '';
    const commentValue = commentMapping ? normalizeCell(row[commentMapping.columnIndex]) : '';
    const roleValue = roleMapping ? normalizeCell(row[roleMapping.columnIndex]) : '';
    const systemValue = systemMapping ? normalizeCell(row[systemMapping.columnIndex]) : '';
    const activityValue = activityMapping ? normalizeCell(row[activityMapping.columnIndex]) : '';
    const caseValue = caseMapping ? normalizeCell(row[caseMapping.columnIndex]) : eligibility.reconstructedSingleCase ? 'single-case' : '';
    const orderValue = orderMapping ? normalizeCell(row[orderMapping.columnIndex]) : '';

    if (!activityValue || !caseValue || !orderValue) {
      const evidence = buildRowEvidenceAnchor(
        headers,
        row,
        [activityMapping?.columnIndex ?? -1, caseMapping?.columnIndex ?? -1, orderMapping?.columnIndex ?? -1, statusMapping?.columnIndex ?? -1, commentMapping?.columnIndex ?? -1],
        rowIndex,
      );
      pushSignal({
        label: 'Unvollständige Tabellenzeile',
        snippet: evidence.anchor,
        sourceRowIndex: rowIndex,
        sourceCellRefs: evidence.cellRefs,
        confidence: 0.34,
        supportClass: 'issue-signal',
        roleHint: roleValue || undefined,
        systemHint: systemValue || undefined,
      });
    }

    if (statusValue) {
      const evidence = buildRowEvidenceAnchor(headers, row, [statusMapping!.columnIndex], rowIndex);
      pushSignal({
        label: `Statussignal: ${statusValue.slice(0, 48)}`,
        snippet: evidence.anchor,
        sourceRowIndex: rowIndex,
        sourceCellRefs: evidence.cellRefs,
        confidence: 0.36,
        supportClass: 'issue-signal',
      });
    }

    if (commentValue && commentValue.length >= 20) {
      const evidence = buildRowEvidenceAnchor(headers, row, [commentMapping!.columnIndex], rowIndex);
      pushSignal({
        label: `Freitexthinweis: ${commentValue.slice(0, 52)}`,
        snippet: evidence.anchor,
        sourceRowIndex: rowIndex,
        sourceCellRefs: evidence.cellRefs,
        confidence: 0.28,
        supportClass: commentValue.length >= 80 ? 'weak-raw-fragment' : 'support-evidence',
      });
    }

    if (roleValue) {
      const evidence = buildRowEvidenceAnchor(headers, row, [roleMapping!.columnIndex], rowIndex);
      pushSignal({
        label: `Rollenhinweis: ${roleValue.slice(0, 48)}`,
        snippet: evidence.anchor,
        sourceRowIndex: rowIndex,
        sourceCellRefs: evidence.cellRefs,
        confidence: 0.26,
        supportClass: 'support-evidence',
        roleHint: roleValue,
      });
    }

    if (systemValue) {
      const evidence = buildRowEvidenceAnchor(headers, row, [systemMapping!.columnIndex], rowIndex);
      pushSignal({
        label: `Systemhinweis: ${systemValue.slice(0, 48)}`,
        snippet: evidence.anchor,
        sourceRowIndex: rowIndex,
        sourceCellRefs: evidence.cellRefs,
        confidence: 0.26,
        supportClass: 'support-evidence',
        systemHint: systemValue,
      });
    }
  });

  if (signals.length === 0) {
    pushSignal({
      label: 'Schwache Tabelle defensiv gehalten',
      snippet: eligibility.fallbackReason ?? 'Die Mindeststruktur fuer ein belastbares Eventlog fehlt.',
      sourceRowIndex: 0,
      sourceCellRefs: [],
      confidence: 0.2,
      supportClass: 'weak-raw-fragment',
    });
  }

  if (tableProfile.emptyValueShare >= 0.38 && signals.length < 18) {
    pushSignal({
      label: 'Viele fehlende Tabellenwerte',
      snippet: `Leeranteil ${tableProfile.emptyValueShare.toFixed(2)} bei ${tableProfile.rowCount} Zeilen.`,
      sourceRowIndex: 0,
      sourceCellRefs: [],
      confidence: 0.24,
      supportClass: 'issue-signal',
    });
  }

  return signals;
}

export function analyzeTableSource(params: {
  headers: string[];
  rows: string[][];
  sourceType?: 'csv-row' | 'xlsx-row';
}): TableSourceAnalysis {
  const normalized = normalizeRows(params.headers, params.rows);
  const tableProfile = buildTableProfile(normalized.headers, normalized.rows);
  const columnProfiles = tableProfile.columnProfiles as InternalColumnProfile[];
  const inferredSchema = columnProfiles.map(profile => inferColumnMapping(profile));
  const acceptedByType = new Map<TableColumnSemanticType, TableColumnMapping>();
  const acceptedColumnMappings: TableColumnMapping[] = [];
  const rejectedColumnMappings: TableColumnMapping[] = [];

  inferredSchema
    .slice()
    .sort((left, right) => right.confidence - left.confidence)
    .forEach(mapping => {
      if (!mapping.accepted) {
        rejectedColumnMappings.push(mapping);
        return;
      }
      const semanticType = mapping.inferredSemanticType;
      const allowMultiple = ['comment', 'note', 'free-text-support', 'amount', 'location'].includes(semanticType);
      if (allowMultiple) {
        acceptedColumnMappings.push(mapping);
        return;
      }
      const existing = acceptedByType.get(semanticType);
      if (!existing) {
        acceptedByType.set(semanticType, mapping);
        acceptedColumnMappings.push(mapping);
        return;
      }
      rejectedColumnMappings.push({
        ...mapping,
        accepted: false,
        fallbackUse: 'conflicting-mapping',
        conflictingSignals: uniqueStrings([...mapping.conflictingSignals, `conflict-with:${existing.header}`]),
      });
    });

  const mappingConfidence = computeMappingConfidence(acceptedColumnMappings);
  const eligibility = buildEligibility({
    tableProfile,
    mappings: acceptedColumnMappings,
    allMappings: [...acceptedColumnMappings, ...rejectedColumnMappings],
    rows: normalized.rows,
    mappingConfidence,
  });
  tableProfile.rowOrderCoherence = computeRowOrderCoherence(columnProfiles, acceptedColumnMappings);
  tableProfile.caseCoherence = computeCaseCoherence(normalized.rows, columnProfiles, acceptedColumnMappings, eligibility.reconstructedSingleCase);
  const routerContext = routeSourceMaterial({
    sourceType: params.sourceType,
    headers: normalized.headers,
    rows: normalized.rows,
  });
  const pipelineMode: TableSourceAnalysis['pipelineMode'] = eligibility.eligible ? 'eventlog-table' : 'weak-raw-table';
  const { normalizedEvents, traceStats } = pipelineMode === 'eventlog-table'
    ? normalizeEvents({
        headers: normalized.headers,
        rows: normalized.rows,
        mappings: acceptedColumnMappings,
        reconstructedSingleCase: eligibility.reconstructedSingleCase,
      })
    : { normalizedEvents: [], traceStats: undefined };
  const weakRowSignals = pipelineMode === 'weak-raw-table'
    ? buildWeakTableSignals({
        headers: normalized.headers,
        rows: normalized.rows,
        mappings: acceptedColumnMappings,
        tableProfile,
        eligibility,
      })
    : [];
  const routingContext = buildRoutingContext({
    routerContext,
    pipelineMode,
    mappingConfidence,
    rowOrderCoherence: tableProfile.rowOrderCoherence,
    caseCoherence: tableProfile.caseCoherence,
    acceptedColumnMappings,
    fallbackReason: eligibility.fallbackReason,
  });

  return {
    routingContext,
    pipelineMode,
    tableProfile,
    inferredSchema,
    acceptedColumnMappings,
    rejectedColumnMappings,
    mappingConfidence,
    eventlogEligibility: {
      eligible: eligibility.eligible,
      reasons: eligibility.reasons,
      fallbackReason: eligibility.fallbackReason,
      minimumCriteria: eligibility.minimumCriteria,
    },
    normalizedEvents,
    weakTableSignals: weakRowSignals.map(signal => ({ label: signal.label, snippet: signal.snippet })),
    weakRowSignals,
    rowEvidenceStats: {
      rowsWithEvidence: pipelineMode === 'eventlog-table' ? normalizedEvents.length : weakRowSignals.length,
      eventsCreated: normalizedEvents.length,
      weakSignalsCreated: weakRowSignals.length,
      rowsWithAcceptedCoreMapping: eligibility.rowsWithAcceptedCoreMapping,
      rowsWithMissingCoreData: eligibility.rowsWithMissingCoreData,
    },
    traceStats,
  };
}
