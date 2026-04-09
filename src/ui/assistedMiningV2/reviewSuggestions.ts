import type { ProcessMiningObservation, ProcessMiningObservationCase } from '../../domain/process';
import { normalizeLabel, sentenceCase, uniqueStrings } from './pmShared';
import {
  canonicalizeProcessStepLabel,
  inferStepFamily,
  labelsLikelySameProcessStep,
  stepSemanticKey,
} from './semanticStepFamilies';

export type ReviewSuggestionType = 'rename' | 'reclassify' | 'split';

export interface ReviewSuggestion {
  id: string;
  type: ReviewSuggestionType;
  observationId: string;
  caseId?: string;
  caseName?: string;
  currentLabel: string;
  suggestedLabel?: string;
  suggestedParts?: string[];
  reason: string;
}

export interface ReviewOverview {
  suggestionCount: number;
  renameCount: number;
  reclassifyCount: number;
  splitCount: number;
  stepCount: number;
  issueCount: number;
  roles: string[];
  systems: string[];
  suggestions: ReviewSuggestion[];
}

export interface RepairReport {
  renamedSteps: number;
  reclassifiedIssues: number;
  splitSteps: number;
  mergedDuplicates: number;
  notes: string[];
}

const HARD_SPLIT_SEPARATORS: RegExp[] = [/\s*\/\s*/g, /\s*;\s*/g, /\s*\n+\s*/g];
const SOFT_SPLIT_RE = /\s+(?:und|sowie|plus)\s+/i;
const ISSUE_STEP_RE = /fehlende pflichtangaben|unvollst[aä]ndig|mehreren systemen|mehrfachdokumentation|kommunikationslast|freigaben verzoegern|freigaben verzögern|wartezeiten|koordinationsaufwand|verteiltes wissen|wissensspeicher|implizite koordination|priorisierung .* unsicherheit|unsicherheit|reibungsignal/i;

function sortCaseObservations(observations: ProcessMiningObservation[]): ProcessMiningObservation[] {
  return [...observations].sort((a, b) => {
    if (a.sequenceIndex !== b.sequenceIndex) return a.sequenceIndex - b.sequenceIndex;
    return a.createdAt.localeCompare(b.createdAt);
  });
}

function replaceCaseObservations(
  observations: ProcessMiningObservation[],
  caseId: string,
  nextCaseObservations: ProcessMiningObservation[],
): ProcessMiningObservation[] {
  const other = observations.filter(observation => observation.sourceCaseId !== caseId);
  const reindexed = sortCaseObservations(nextCaseObservations).map((observation, index) => ({
    ...observation,
    sourceCaseId: caseId,
    sequenceIndex: index,
  }));
  return [...other, ...reindexed];
}

function splitIntoParts(label: string, allowSoftSplit = false): string[] {
  const compact = label.replace(/\s+/g, ' ').trim();
  if (!compact) return [];

  let parts = [compact];
  for (const separator of HARD_SPLIT_SEPARATORS) {
    if (separator.test(compact)) {
      parts = compact
        .split(separator)
        .map(part => sentenceCase(part.replace(/[.:]+$/g, '').trim()))
        .filter(part => part.length >= 4);
      break;
    }
  }

  if (parts.length <= 1 && allowSoftSplit && compact.length >= 70 && SOFT_SPLIT_RE.test(compact)) {
    parts = compact
      .split(SOFT_SPLIT_RE)
      .map(part => sentenceCase(part.replace(/[.:]+$/g, '').trim()))
      .filter(part => part.length >= 10);
  }

  return uniqueStrings(parts);
}

export function getCanonicalLabelSuggestion(observation: ProcessMiningObservation): string | null {
  if (observation.kind !== 'step') return null;
  if (/^\|/.test((observation.evidenceSnippet ?? '').trim()) && observation.label.trim().length >= 8) {
    return null;
  }
  const suggested = canonicalizeProcessStepLabel({
    title: observation.label,
    body: observation.evidenceSnippet,
    fallback: observation.label,
    index: observation.sequenceIndex,
  });
  if (!suggested || normalizeLabel(suggested) === normalizeLabel(observation.label)) return null;
  if (labelsLikelySameProcessStep(suggested, observation.label) && normalizeLabel(suggested) === normalizeLabel(observation.label)) {
    return null;
  }
  return suggested;
}

export function getSplitSuggestion(observation: ProcessMiningObservation, allowSoftSplit = true): string[] | null {
  if (observation.kind !== 'step') return null;
  if (inferStepFamily(observation.label) && !/[\/;]/.test(observation.label)) return null;
  const parts = splitIntoParts(observation.label, allowSoftSplit);
  return parts.length >= 2 ? parts : null;
}

export function shouldSuggestIssueReclassification(observation: ProcessMiningObservation): boolean {
  if (observation.kind !== 'step') return false;
  if (inferStepFamily(observation.label)) return false;
  const text = `${observation.label} ${observation.evidenceSnippet ?? ''}`;
  return ISSUE_STEP_RE.test(normalizeLabel(text));
}

function mergeConsecutiveDuplicates(observations: ProcessMiningObservation[]): {
  observations: ProcessMiningObservation[];
  mergedCount: number;
} {
  const sorted = sortCaseObservations(observations);
  const merged: ProcessMiningObservation[] = [];
  let mergedCount = 0;

  for (const observation of sorted) {
    const last = merged[merged.length - 1];
    if (
      last &&
      last.kind === observation.kind &&
      last.kind === 'step' &&
      stepSemanticKey(last.label) === stepSemanticKey(observation.label)
    ) {
      merged[merged.length - 1] = {
        ...last,
        evidenceSnippet: [last.evidenceSnippet, observation.evidenceSnippet].filter(Boolean).join(' '),
        role: last.role ?? observation.role,
        system: last.system ?? observation.system,
        timestampRaw: last.timestampRaw ?? observation.timestampRaw,
        timestampIso: last.timestampIso ?? observation.timestampIso,
        timestampQuality:
          last.timestampQuality === 'real' || observation.timestampQuality === 'real'
            ? 'real'
            : last.timestampQuality === 'synthetic' || observation.timestampQuality === 'synthetic'
            ? 'synthetic'
            : 'missing',
      };
      mergedCount += 1;
    } else {
      merged.push(observation);
    }
  }

  return { observations: merged, mergedCount };
}

export function repairDerivedObservations(observations: ProcessMiningObservation[]): {
  observations: ProcessMiningObservation[];
  report: RepairReport;
} {
  const grouped = new Map<string, ProcessMiningObservation[]>();
  observations.forEach(observation => {
    const caseId = observation.sourceCaseId ?? '__unassigned__';
    if (!grouped.has(caseId)) grouped.set(caseId, []);
    grouped.get(caseId)!.push(observation);
  });

  let repaired: ProcessMiningObservation[] = [];
  const report: RepairReport = {
    renamedSteps: 0,
    reclassifiedIssues: 0,
    splitSteps: 0,
    mergedDuplicates: 0,
    notes: [],
  };

  for (const [caseId, caseObservations] of grouped.entries()) {
    let nextCase: ProcessMiningObservation[] = [];
    for (const observation of sortCaseObservations(caseObservations)) {
      const splitParts = getSplitSuggestion(observation, false);
      if (splitParts && splitParts.length >= 2) {
        splitParts.forEach((part, index) => {
          nextCase.push({
            ...observation,
            id: crypto.randomUUID(),
            label: canonicalizeProcessStepLabel({ title: part, body: observation.evidenceSnippet, fallback: part, index }),
            evidenceSnippet: part,
            sequenceIndex: nextCase.length + index,
          });
        });
        report.splitSteps += 1;
        continue;
      }

      let nextObservation: ProcessMiningObservation = { ...observation };
      if (shouldSuggestIssueReclassification(nextObservation)) {
        nextObservation = { ...nextObservation, kind: 'issue' };
        report.reclassifiedIssues += 1;
      }

      const rename = getCanonicalLabelSuggestion(nextObservation);
      if (rename) {
        nextObservation = { ...nextObservation, label: rename };
        report.renamedSteps += 1;
      }

      nextCase.push(nextObservation);
    }

    const merged = mergeConsecutiveDuplicates(nextCase);
    report.mergedDuplicates += merged.mergedCount;
    repaired = [...repaired, ...merged.observations.map((observation, index) => ({
      ...observation,
      sourceCaseId: caseId === '__unassigned__' ? observation.sourceCaseId : caseId,
      sequenceIndex: index,
    }))];
  }

  if (report.renamedSteps > 0) {
    report.notes.push(`${report.renamedSteps} Schrittbezeichnungen wurden vereinheitlicht.`);
  }
  if (report.reclassifiedIssues > 0) {
    report.notes.push(`${report.reclassifiedIssues} erkannte Punkte wurden als Reibungssignal statt als Prozessschritt geführt.`);
  }
  if (report.splitSteps > 0) {
    report.notes.push(`${report.splitSteps} Sammelschritte wurden lokal in mehrere Schritte aufgeteilt.`);
  }
  if (report.mergedDuplicates > 0) {
    report.notes.push(`${report.mergedDuplicates} doppelte Folgeschritte wurden zusammengeführt.`);
  }

  return { observations: repaired, report };
}

export function buildReviewOverview(params: {
  cases: ProcessMiningObservationCase[];
  observations: ProcessMiningObservation[];
}): ReviewOverview {
  const caseNameById = new Map(params.cases.map(caseItem => [caseItem.id, caseItem.name]));
  const suggestions: ReviewSuggestion[] = [];

  params.observations
    .filter(observation => observation.kind === 'step')
    .forEach(observation => {
      const canonical = getCanonicalLabelSuggestion(observation);
      if (canonical) {
        suggestions.push({
          id: `rename:${observation.id}`,
          type: 'rename',
          observationId: observation.id,
          caseId: observation.sourceCaseId,
          caseName: observation.sourceCaseId ? caseNameById.get(observation.sourceCaseId) : undefined,
          currentLabel: observation.label,
          suggestedLabel: canonical,
          reason: 'Die Bezeichnung lässt sich robuster vereinheitlichen und wird dadurch für Discovery und Soll-Abgleich stabiler.',
        });
      }

      const splitParts = getSplitSuggestion(observation, true);
      if (splitParts) {
        suggestions.push({
          id: `split:${observation.id}`,
          type: 'split',
          observationId: observation.id,
          caseId: observation.sourceCaseId,
          caseName: observation.sourceCaseId ? caseNameById.get(observation.sourceCaseId) : undefined,
          currentLabel: observation.label,
          suggestedParts: splitParts,
          reason: 'Der Schritt wirkt wie ein Sammelschritt und lässt sich verständlicher in Teilstücke zerlegen.',
        });
      }

      if (shouldSuggestIssueReclassification(observation)) {
        suggestions.push({
          id: `issue:${observation.id}`,
          type: 'reclassify',
          observationId: observation.id,
          caseId: observation.sourceCaseId,
          caseName: observation.sourceCaseId ? caseNameById.get(observation.sourceCaseId) : undefined,
          currentLabel: observation.label,
          suggestedLabel: 'Als Reibungssignal führen',
          reason: 'Dieser Eintrag beschreibt eher ein Problem oder Hindernis als einen eigentlichen Prozessschritt.',
        });
      }
    });

  return {
    suggestionCount: suggestions.length,
    renameCount: suggestions.filter(suggestion => suggestion.type === 'rename').length,
    reclassifyCount: suggestions.filter(suggestion => suggestion.type === 'reclassify').length,
    splitCount: suggestions.filter(suggestion => suggestion.type === 'split').length,
    stepCount: params.observations.filter(observation => observation.kind === 'step').length,
    issueCount: params.observations.filter(observation => observation.kind === 'issue').length,
    roles: uniqueStrings(params.observations.map(observation => observation.role)),
    systems: uniqueStrings(params.observations.map(observation => observation.system)),
    suggestions,
  };
}

export function applyCanonicalLabelSuggestions(
  observations: ProcessMiningObservation[],
  targetObservationIds?: string[],
): { observations: ProcessMiningObservation[]; changedCount: number } {
  let changedCount = 0;
  const targetSet = targetObservationIds ? new Set(targetObservationIds) : null;
  const next = observations.map(observation => {
    if (observation.kind !== 'step') return observation;
    if (targetSet && !targetSet.has(observation.id)) return observation;
    const suggested = getCanonicalLabelSuggestion(observation);
    if (!suggested) return observation;
    if (normalizeLabel(suggested) === normalizeLabel(observation.label)) return observation;
    changedCount += 1;
    return { ...observation, label: suggested };
  });
  return { observations: next, changedCount };
}

export function applyIssueReclassificationSuggestions(
  observations: ProcessMiningObservation[],
  targetObservationIds?: string[],
): { observations: ProcessMiningObservation[]; changedCount: number } {
  let changedCount = 0;
  const targetSet = targetObservationIds ? new Set(targetObservationIds) : null;
  const next = observations.map(observation => {
    if (targetSet && !targetSet.has(observation.id)) return observation;
    if (!shouldSuggestIssueReclassification(observation)) return observation;
    changedCount += 1;
    return { ...observation, kind: 'issue' as const };
  });
  return { observations: next, changedCount };
}

export function applySplitSuggestions(
  observations: ProcessMiningObservation[],
  targetObservationIds?: string[],
): { observations: ProcessMiningObservation[]; changedCount: number } {
  const targetSet = targetObservationIds ? new Set(targetObservationIds) : null;
  const grouped = new Map<string, ProcessMiningObservation[]>();
  observations.forEach(observation => {
    const caseId = observation.sourceCaseId ?? '__unassigned__';
    if (!grouped.has(caseId)) grouped.set(caseId, []);
    grouped.get(caseId)!.push(observation);
  });

  let nextAll: ProcessMiningObservation[] = [];
  let changedCount = 0;

  for (const [caseId, caseObservations] of grouped.entries()) {
    const nextCase: ProcessMiningObservation[] = [];
    for (const observation of sortCaseObservations(caseObservations)) {
      const isTarget = !targetSet || targetSet.has(observation.id);
      const parts = isTarget ? getSplitSuggestion(observation, true) : null;
      if (!parts) {
        nextCase.push(observation);
        continue;
      }
      parts.forEach((part, partIndex) => {
        nextCase.push({
          ...observation,
          id: partIndex === 0 ? observation.id : crypto.randomUUID(),
          label: canonicalizeProcessStepLabel({ title: part, body: observation.evidenceSnippet, fallback: part, index: partIndex }),
          evidenceSnippet: part,
        });
      });
      changedCount += 1;
    }

    const replaced = replaceCaseObservations(nextAll.length === 0 ? [] : nextAll, caseId, nextCase.map((observation, index) => ({
      ...observation,
      sourceCaseId: caseId === '__unassigned__' ? observation.sourceCaseId : caseId,
      sequenceIndex: index,
    })));
    nextAll = replaced;
  }

  if (nextAll.length === 0) nextAll = observations;
  return { observations: nextAll, changedCount };
}

export function insertManualStep(
  observations: ProcessMiningObservation[],
  params: { caseId: string; afterIndex?: number; label?: string },
): ProcessMiningObservation[] {
  const caseObservations = sortCaseObservations(observations.filter(observation => observation.sourceCaseId === params.caseId));
  const otherObservations = observations.filter(observation => observation.sourceCaseId !== params.caseId);
  const template = caseObservations[Math.max(0, Math.min(params.afterIndex ?? caseObservations.length - 1, caseObservations.length - 1))];
  const newObservation: ProcessMiningObservation = {
    id: crypto.randomUUID(),
    sourceCaseId: params.caseId,
    label: params.label ?? 'Neuer Prozessschritt',
    evidenceSnippet: '',
    role: template?.role,
    system: template?.system,
    kind: 'step',
    sequenceIndex: Math.max(0, (params.afterIndex ?? caseObservations.length - 1) + 1),
    timestampQuality: 'missing',
    createdAt: new Date().toISOString(),
  };

  const insertIndex = Math.max(0, Math.min(params.afterIndex ?? caseObservations.length - 1, caseObservations.length - 1)) + 1;
  const nextCase = caseObservations.length === 0
    ? [newObservation]
    : [
        ...caseObservations.slice(0, insertIndex),
        newObservation,
        ...caseObservations.slice(insertIndex),
      ];

  const reindexed = nextCase.map((observation, index) => ({ ...observation, sequenceIndex: index }));
  return [...otherObservations, ...reindexed];
}
