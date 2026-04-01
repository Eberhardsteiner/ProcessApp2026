import type { ProcessVersion, ImprovementBacklogItem } from '../domain/process';
import type { CaptureDraftStep, CaptureDraftDecision, CaptureDraftException } from '../domain/capture';

export interface FieldChange {
  field: string;
  before: string;
  after: string;
}

export interface EntityChange<T> {
  id: string;
  before: T;
  after: T;
  changedFields: string[];
}

export interface VersionDiff {
  fromVersionId: string;
  toVersionId: string;

  endToEndChanges: FieldChange[];

  stepsAdded: CaptureDraftStep[];
  stepsRemoved: CaptureDraftStep[];
  stepsModified: EntityChange<CaptureDraftStep>[];

  decisionsAdded: CaptureDraftDecision[];
  decisionsRemoved: CaptureDraftDecision[];

  exceptionsAdded: CaptureDraftException[];
  exceptionsRemoved: CaptureDraftException[];

  backlogAdded: ImprovementBacklogItem[];
  backlogRemoved: ImprovementBacklogItem[];
  backlogModified: EntityChange<ImprovementBacklogItem>[];
}

function norm(s: unknown): string {
  return (typeof s === 'string' ? s : '').trim();
}

function sameString(a: unknown, b: unknown): boolean {
  return norm(a) === norm(b);
}

function sameStringArray(a?: string[], b?: string[]): boolean {
  const arrA = (a ?? []).slice().sort();
  const arrB = (b ?? []).slice().sort();
  if (arrA.length !== arrB.length) return false;
  return arrA.every((val, idx) => val === arrB[idx]);
}

function compareSteps(before: CaptureDraftStep, after: CaptureDraftStep): string[] {
  const changed: string[] = [];

  if (before.order !== after.order) changed.push('order');
  if (!sameString(before.label, after.label)) changed.push('label');
  if (before.roleId !== after.roleId) changed.push('roleId');
  if (before.systemId !== after.systemId) changed.push('systemId');
  if (before.workType !== after.workType) changed.push('workType');
  if (!sameString(before.painPointHint, after.painPointHint)) changed.push('painPointHint');
  if (!sameString(before.toBeHint, after.toBeHint)) changed.push('toBeHint');
  if (!sameStringArray(before.dataIn, after.dataIn)) changed.push('dataIn');
  if (!sameStringArray(before.dataOut, after.dataOut)) changed.push('dataOut');

  return changed;
}

function compareBacklogItems(before: ImprovementBacklogItem, after: ImprovementBacklogItem): string[] {
  const changed: string[] = [];

  if (!sameString(before.title, after.title)) changed.push('title');
  if (before.category !== after.category) changed.push('category');
  if (before.scope !== after.scope) changed.push('scope');
  if (before.relatedStepId !== after.relatedStepId) changed.push('relatedStepId');
  if (before.impact !== after.impact) changed.push('impact');
  if (before.effort !== after.effort) changed.push('effort');
  if (before.risk !== after.risk) changed.push('risk');
  if (before.owner !== after.owner) changed.push('owner');
  if (before.dueDate !== after.dueDate) changed.push('dueDate');
  if (before.status !== after.status) changed.push('status');
  if (!sameString(before.description, after.description)) changed.push('description');

  const beforeBlueprint = before.automationBlueprint;
  const afterBlueprint = after.automationBlueprint;

  if (beforeBlueprint || afterBlueprint) {
    if (!beforeBlueprint || !afterBlueprint) {
      changed.push('automationBlueprint');
    } else {
      if (beforeBlueprint.approach !== afterBlueprint.approach) changed.push('automationBlueprint.approach');
      if (beforeBlueprint.level !== afterBlueprint.level) changed.push('automationBlueprint.level');
      if (beforeBlueprint.humanInTheLoop !== afterBlueprint.humanInTheLoop) changed.push('automationBlueprint.humanInTheLoop');
      if (!sameStringArray(beforeBlueprint.systemIds, afterBlueprint.systemIds)) changed.push('automationBlueprint.systemIds');
      if (!sameStringArray(beforeBlueprint.dataObjectIds, afterBlueprint.dataObjectIds)) changed.push('automationBlueprint.dataObjectIds');
      if (!sameStringArray(beforeBlueprint.kpiIds, afterBlueprint.kpiIds)) changed.push('automationBlueprint.kpiIds');
      if (!sameStringArray(beforeBlueprint.controls, afterBlueprint.controls)) changed.push('automationBlueprint.controls');
      if (!sameString(beforeBlueprint.notes, afterBlueprint.notes)) changed.push('automationBlueprint.notes');
    }
  }

  return changed;
}

export function computeVersionDiff(fromV: ProcessVersion, toV: ProcessVersion): VersionDiff {
  const diff: VersionDiff = {
    fromVersionId: fromV.versionId,
    toVersionId: toV.versionId,
    endToEndChanges: [],
    stepsAdded: [],
    stepsRemoved: [],
    stepsModified: [],
    decisionsAdded: [],
    decisionsRemoved: [],
    exceptionsAdded: [],
    exceptionsRemoved: [],
    backlogAdded: [],
    backlogRemoved: [],
    backlogModified: [],
  };

  const fromE2E = fromV.endToEndDefinition;
  const toE2E = toV.endToEndDefinition;

  if (!sameString(fromE2E.trigger, toE2E.trigger)) {
    diff.endToEndChanges.push({
      field: 'Trigger',
      before: norm(fromE2E.trigger),
      after: norm(toE2E.trigger),
    });
  }

  if (!sameString(fromE2E.customer, toE2E.customer)) {
    diff.endToEndChanges.push({
      field: 'Kunde/Stakeholder',
      before: norm(fromE2E.customer),
      after: norm(toE2E.customer),
    });
  }

  if (!sameString(fromE2E.outcome, toE2E.outcome)) {
    diff.endToEndChanges.push({
      field: 'Ergebnis',
      before: norm(fromE2E.outcome),
      after: norm(toE2E.outcome),
    });
  }

  if (!sameString(fromE2E.doneCriteria, toE2E.doneCriteria)) {
    diff.endToEndChanges.push({
      field: 'Fertig-Kriterium',
      before: norm(fromE2E.doneCriteria || ''),
      after: norm(toE2E.doneCriteria || ''),
    });
  }

  const fromDraft = fromV.sidecar.captureDraft;
  const toDraft = toV.sidecar.captureDraft;

  const fromSteps = fromDraft?.happyPath ?? [];
  const toSteps = toDraft?.happyPath ?? [];

  const fromStepsMap = new Map(fromSteps.map(s => [s.stepId, s]));
  const toStepsMap = new Map(toSteps.map(s => [s.stepId, s]));

  for (const step of toSteps) {
    if (!fromStepsMap.has(step.stepId)) {
      diff.stepsAdded.push(step);
    }
  }

  for (const step of fromSteps) {
    if (!toStepsMap.has(step.stepId)) {
      diff.stepsRemoved.push(step);
    }
  }

  for (const step of toSteps) {
    const beforeStep = fromStepsMap.get(step.stepId);
    if (beforeStep) {
      const changedFields = compareSteps(beforeStep, step);
      if (changedFields.length > 0) {
        diff.stepsModified.push({
          id: step.stepId,
          before: beforeStep,
          after: step,
          changedFields,
        });
      }
    }
  }

  const fromDecisions = fromDraft?.decisions ?? [];
  const toDecisions = toDraft?.decisions ?? [];

  const fromDecisionsMap = new Map(fromDecisions.map(d => [d.decisionId, d]));
  const toDecisionsMap = new Map(toDecisions.map(d => [d.decisionId, d]));

  for (const decision of toDecisions) {
    if (!fromDecisionsMap.has(decision.decisionId)) {
      diff.decisionsAdded.push(decision);
    }
  }

  for (const decision of fromDecisions) {
    if (!toDecisionsMap.has(decision.decisionId)) {
      diff.decisionsRemoved.push(decision);
    }
  }

  const fromExceptions = fromDraft?.exceptions ?? [];
  const toExceptions = toDraft?.exceptions ?? [];

  const fromExceptionsMap = new Map(fromExceptions.map(e => [e.exceptionId, e]));
  const toExceptionsMap = new Map(toExceptions.map(e => [e.exceptionId, e]));

  for (const exception of toExceptions) {
    if (!fromExceptionsMap.has(exception.exceptionId)) {
      diff.exceptionsAdded.push(exception);
    }
  }

  for (const exception of fromExceptions) {
    if (!toExceptionsMap.has(exception.exceptionId)) {
      diff.exceptionsRemoved.push(exception);
    }
  }

  const fromBacklog = fromV.sidecar.improvementBacklog ?? [];
  const toBacklog = toV.sidecar.improvementBacklog ?? [];

  const fromBacklogMap = new Map(fromBacklog.map(b => [b.id, b]));
  const toBacklogMap = new Map(toBacklog.map(b => [b.id, b]));

  for (const item of toBacklog) {
    if (!fromBacklogMap.has(item.id)) {
      diff.backlogAdded.push(item);
    }
  }

  for (const item of fromBacklog) {
    if (!toBacklogMap.has(item.id)) {
      diff.backlogRemoved.push(item);
    }
  }

  for (const item of toBacklog) {
    const beforeItem = fromBacklogMap.get(item.id);
    if (beforeItem) {
      const changedFields = compareBacklogItems(beforeItem, item);
      if (changedFields.length > 0) {
        diff.backlogModified.push({
          id: item.id,
          before: beforeItem,
          after: item,
          changedFields,
        });
      }
    }
  }

  return diff;
}
