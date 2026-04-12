import type { Process, ProcessVersion } from '../domain/process';
import type { CaptureDraftStep, CaptureDraftDecision, CaptureDraftException, WorkType, ExceptionType, StepLeadTimeBucket } from '../domain/capture';
import { isIsoDuration } from '../utils/isoDuration';

export interface BpmnExportResult {
  xml: string;
  warnings: string[];
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function inferIsoDurationFromWaitingBucket(bucket: string | undefined): string | null {
  if (!bucket) return null;

  const mapping: Record<StepLeadTimeBucket, string> = {
    minutes: 'PT15M',
    hours: 'PT2H',
    '1_day': 'P1D',
    '2_5_days': 'P3D',
    '1_2_weeks': 'P10D',
    over_2_weeks: 'P21D',
    unknown: '',
    varies: '',
  };

  const result = mapping[bucket as StepLeadTimeBucket];
  return result || null;
}

function resolveTimeoutDurationIso(params: {
  exception: CaptureDraftException;
  relatedStep?: CaptureDraftStep;
  warnings: string[];
}): string {
  const { exception, relatedStep, warnings } = params;

  if (exception.timeoutDurationIso) {
    const trimmed = exception.timeoutDurationIso.trim();
    if (isIsoDuration(trimmed)) {
      return trimmed;
    }
    warnings.push(`Ungültige Timeout-Duration "${exception.timeoutDurationIso}". Fallback wird genutzt.`);
  }

  if (relatedStep?.waitingTime) {
    const inferred = inferIsoDurationFromWaitingBucket(relatedStep.waitingTime);
    if (inferred) {
      warnings.push(
        `Timeout bei Schritt ${relatedStep.order}. ${relatedStep.label} nutzt aus Wartezeit-Bucket abgeleitete Duration ${inferred} – bitte prüfen`
      );
      return inferred;
    }
  }

  warnings.push('Timeout nutzt Default PT1H, bitte anpassen');
  return 'PT1H';
}

function getExceptionEventDefinitionXml(
  exception: CaptureDraftException,
  relatedStep: CaptureDraftStep | undefined,
  warnings: string[]
): { xml: string } {
  const exceptionType = exception.type;
  switch (exceptionType) {
    case 'timeout': {
      const duration = resolveTimeoutDurationIso({ exception, relatedStep, warnings });
      return {
        xml: `<bpmn:timerEventDefinition><bpmn:timeDuration>${duration}</bpmn:timeDuration></bpmn:timerEventDefinition>`,
      };
    }
    case 'error':
    case 'missing_data':
      return { xml: '<bpmn:errorEventDefinition />' };
    case 'cancellation':
    case 'compliance':
    case 'other':
      return { xml: '<bpmn:escalationEventDefinition />' };
  }
}

function getExceptionTypeLabel(exceptionType: ExceptionType): string {
  switch (exceptionType) {
    case 'timeout': return 'Zeitüberschreitung';
    case 'error': return 'Fehler';
    case 'missing_data': return 'Fehlende Daten';
    case 'cancellation': return 'Abbruch';
    case 'compliance': return 'Compliance';
    case 'other': return 'Ausnahme';
  }
}

interface LaneInfo {
  laneId: string;
  roleId: string | null;
  roleName: string;
  index: number;
}

interface NodeBounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface ProcessedDecision {
  decision: CaptureDraftDecision;
  afterStep: CaptureDraftStep;
  gatewayId: string;
}

interface ProcessedAndDecision {
  decision: CaptureDraftDecision;
  afterStep: CaptureDraftStep;
  splitGatewayId: string;
  joinGatewayId: string;
  parallelStepIds: string[];
  joinTargetRef: string;
  joinTargetStepId?: string;
}

const LANE_X = 50;
const LANE_Y0 = 60;
const LANE_HEIGHT = 140;
const LANE_GAP = 20;
const TASK_Y_OFFSET = 30;
const TASK_X0 = 200;
const STEP_GAP_X = 200;

function getBpmnTaskElement(
  step: CaptureDraftStep,
  taskId: string,
  version: ProcessVersion
): string {
  const workType = step.workType || 'unknown';
  const label = escapeXml(step.label);

  const documentationParts: string[] = [];

  if (step.systemId) {
    const system = version.sidecar.systems.find((s) => s.id === step.systemId);
    if (system) {
      documentationParts.push(`System: ${escapeXml(system.name)}`);
    }
  }

  if (workType === 'ai_assisted') {
    documentationParts.push('KI-unterstützt');
  }

  const hasDocumentation = documentationParts.length > 0;
  const documentation = hasDocumentation
    ? `\n      <bpmn:documentation>${documentationParts.join(' | ')}</bpmn:documentation>`
    : '';

  const tagName = getTaskTagName(workType);
  const closingTag = hasDocumentation ? `\n    </${tagName}>` : ' />';

  return `    <${tagName} id="${taskId}" name="${label}"${hasDocumentation ? '>' : ''}${documentation}${closingTag}`;
}

function getTaskTagName(workType: WorkType): string {
  switch (workType) {
    case 'manual':
      return 'bpmn:manualTask';
    case 'user_task':
      return 'bpmn:userTask';
    case 'service_task':
      return 'bpmn:serviceTask';
    case 'ai_assisted':
      return 'bpmn:userTask';
    case 'unknown':
    default:
      return 'bpmn:task';
  }
}

function buildLanes(
  happyPath: CaptureDraftStep[],
  version: ProcessVersion
): { lanes: LaneInfo[]; stepToLaneIndex: Map<string, number> } {
  const roleById = new Map(version.sidecar.roles.map((r) => [r.id, r.name]));
  const usedRoleIds = new Set<string | null>();
  const roleOrder: (string | null)[] = [];

  happyPath.forEach((step) => {
    const roleId = step.roleId || null;
    if (!usedRoleIds.has(roleId)) {
      usedRoleIds.add(roleId);
      roleOrder.push(roleId);
    }
  });

  const lanes: LaneInfo[] = roleOrder.map((roleId, index) => ({
    laneId: roleId ? `Lane_${roleId}` : 'Lane_Unassigned',
    roleId,
    roleName: roleId ? roleById.get(roleId) || 'Unbekannte Rolle' : 'Unzugeordnet',
    index,
  }));

  const stepToLaneIndex = new Map<string, number>();
  happyPath.forEach((step) => {
    const roleId = step.roleId || null;
    const laneIndex = roleOrder.indexOf(roleId);
    stepToLaneIndex.set(step.stepId, laneIndex);
  });

  return { lanes, stepToLaneIndex };
}

function processDecisions(
  decisions: CaptureDraftDecision[],
  happyPath: CaptureDraftStep[],
  warnings: string[]
): ProcessedDecision[] {
  const stepById = new Map(happyPath.map((s) => [s.stepId, s]));
  const decisionsByAfterStepId = new Map<string, CaptureDraftDecision[]>();

  decisions.forEach((decision) => {
    if (!stepById.has(decision.afterStepId)) {
      warnings.push(
        `Entscheidung "${decision.question || decision.decisionId}" verweist auf unbekannten Schritt ${decision.afterStepId} - wird ignoriert`
      );
      return;
    }

    if (decision.gatewayType === 'and') {
      return;
    }

    if (decision.gatewayType !== 'xor') {
      warnings.push(
        `Entscheidung "${decision.question || decision.decisionId}" mit Typ ${decision.gatewayType} wird noch nicht unterstützt - wird ignoriert`
      );
      return;
    }

    const existing = decisionsByAfterStepId.get(decision.afterStepId) || [];
    existing.push(decision);
    decisionsByAfterStepId.set(decision.afterStepId, existing);
  });

  decisionsByAfterStepId.forEach((decisions, afterStepId) => {
    if (decisions.length > 1) {
      warnings.push(
        `Mehrere Entscheidungen nach Schritt ${afterStepId} gefunden - nur die erste wird exportiert`
      );
    }
  });

  const processed: ProcessedDecision[] = [];
  decisionsByAfterStepId.forEach((decisions, afterStepId) => {
    const decision = decisions[0];
    const afterStep = stepById.get(afterStepId)!;

    const validBranches = decision.branches.filter((branch) => {
      if (branch.endsProcess) {
        return true;
      }
      if (!branch.nextStepId) {
        warnings.push(
          `Branch "${branch.conditionLabel}" in Entscheidung "${decision.question || decision.decisionId}" hat weder nextStepId noch endsProcess - wird ignoriert`
        );
        return false;
      }
      if (!stepById.has(branch.nextStepId)) {
        warnings.push(
          `Branch "${branch.conditionLabel}" verweist auf unbekannten Schritt ${branch.nextStepId} - wird ignoriert`
        );
        return false;
      }
      const targetStep = stepById.get(branch.nextStepId)!;
      if (targetStep.order <= afterStep.order) {
        warnings.push(
          `Branch "${branch.conditionLabel}" führt zurück zu Schritt ${targetStep.order}. Schleifen werden exportiert, Layout bitte prüfen.`
        );
      }
      return true;
    });

    if (validBranches.length === 0) {
      warnings.push(
        `Entscheidung "${decision.question || decision.decisionId}" hat keine gültigen Branches - wird ignoriert`
      );
      return;
    }

    processed.push({
      decision: { ...decision, branches: validBranches },
      afterStep,
      gatewayId: `Gateway_${decision.decisionId}`,
    });
  });

  return processed;
}

function processAndDecisions(
  decisions: CaptureDraftDecision[],
  happyPath: CaptureDraftStep[],
  warnings: string[]
): ProcessedAndDecision[] {
  const stepById = new Map(happyPath.map((s) => [s.stepId, s]));
  const andDecisions = decisions.filter((d) => d.gatewayType === 'and');

  const byAfter = new Map<string, CaptureDraftDecision[]>();
  andDecisions.forEach((decision) => {
    const existing = byAfter.get(decision.afterStepId) || [];
    existing.push(decision);
    byAfter.set(decision.afterStepId, existing);
  });

  byAfter.forEach((decisions, afterStepId) => {
    if (decisions.length > 1) {
      warnings.push(
        `Mehrere AND-Entscheidungen nach Schritt ${afterStepId} gefunden - nur die erste wird exportiert`
      );
    }
  });

  const processed: ProcessedAndDecision[] = [];

  for (const [, decisionsForStep] of byAfter) {
    const decision = decisionsForStep[0];
    const afterStep = stepById.get(decision.afterStepId);
    if (!afterStep) {
      warnings.push(
        `AND-Entscheidung "${decision.question || decision.decisionId}" verweist auf unbekannten Schritt ${decision.afterStepId} - wird ignoriert`
      );
      continue;
    }

    if (decision.branches.some((b) => b.endsProcess)) {
      warnings.push(
        `AND-Entscheidung "${decision.question || decision.decisionId}" mit endsProcess nicht unterstützt - wird ignoriert`
      );
      continue;
    }

    const validBranches = decision.branches.filter((b) => !b.endsProcess && b.nextStepId);
    if (validBranches.length < 2) {
      warnings.push(
        `AND-Entscheidung "${decision.question || decision.decisionId}" hat <2 gültige Branches - wird ignoriert`
      );
      continue;
    }

    const branchSteps = validBranches
      .map((b) => stepById.get(b.nextStepId!))
      .filter((s): s is CaptureDraftStep => s !== undefined);

    if (branchSteps.length !== validBranches.length) {
      warnings.push(
        `AND-Entscheidung "${decision.question || decision.decisionId}" hat Branch nextStepId unbekannt - wird ignoriert`
      );
      continue;
    }

    const orders = Array.from(new Set(branchSteps.map((s) => s.order))).sort((a, b) => a - b);
    const minOrder = orders[0];
    const maxOrder = orders[orders.length - 1];

    if (minOrder !== afterStep.order + 1) {
      warnings.push(
        `AND-Entscheidung "${decision.question || decision.decisionId}" unterstützt nur contiguous parallel block direkt nach afterStep (minOrder == afterStep+1) - wird ignoriert`
      );
      continue;
    }

    let isContiguous = true;
    for (let i = 1; i < orders.length; i++) {
      if (orders[i] !== orders[i - 1] + 1) {
        isContiguous = false;
        break;
      }
    }

    if (!isContiguous) {
      warnings.push(
        `AND-Entscheidung "${decision.question || decision.decisionId}" unterstützt nur contiguous parallel block (keine Lücken in Orders) - wird ignoriert`
      );
      continue;
    }

    const parallelSteps = happyPath
      .filter((s) => s.order >= minOrder && s.order <= maxOrder)
      .sort((a, b) => a.order - b.order);

    const parallelStepIds = parallelSteps.map((s) => s.stepId);

    const joinTargetStep = happyPath.find((s) => s.order === maxOrder + 1);
    const joinTargetRef = joinTargetStep ? `Task_${joinTargetStep.stepId}` : 'EndEvent_1';
    const joinTargetStepId = joinTargetStep?.stepId;

    const splitGatewayId = `Gateway_${decision.decisionId}_Split`;
    const joinGatewayId = `Gateway_${decision.decisionId}_Join`;

    processed.push({
      decision,
      afterStep,
      splitGatewayId,
      joinGatewayId,
      parallelStepIds,
      joinTargetRef,
      joinTargetStepId,
    });

    warnings.push(
      `AND exportiert als Parallel-Block; Join wurde auf ${joinTargetStep ? `Schritt ${joinTargetStep.order}. ${joinTargetStep.label}` : 'End Event'} gesetzt`
    );
  }

  return processed;
}

export function buildBpmnXmlFromDraft(
  process: Process,
  version: ProcessVersion
): BpmnExportResult {
  const warnings: string[] = [];

  const draft = version.sidecar.captureDraft;
  const happyPath = draft?.happyPath || [];

  if (happyPath.length === 0) {
    warnings.push('Kein Happy Path vorhanden – BPMN wird nicht generiert.');
    return {
      xml: buildEmptyBpmnSkeleton(process.processId),
      warnings,
    };
  }

  const decisions = draft?.decisions ?? [];

  const processedAndDecisions = processAndDecisions(decisions, happyPath, warnings);
  const andByAfterStepId = new Map(
    processedAndDecisions.map((pad) => [pad.afterStep.stepId, pad])
  );
  const parallelStepIdSet = new Set(
    processedAndDecisions.flatMap((pad) => pad.parallelStepIds)
  );

  const processedDecisionsAll = processDecisions(decisions, happyPath, warnings);

  const processedDecisions = processedDecisionsAll.filter((pd) => {
    const afterId = pd.afterStep.stepId;

    if (andByAfterStepId.has(afterId)) {
      warnings.push(
        `XOR-Entscheidung "${pd.decision.question || pd.decision.decisionId}" nach Schritt ${pd.afterStep.order} (${pd.afterStep.label}) wird ignoriert, weil ein AND-Parallelblock exportiert wird`
      );
      return false;
    }

    if (parallelStepIdSet.has(afterId)) {
      warnings.push(
        `XOR-Entscheidung "${pd.decision.question || pd.decision.decisionId}" nach Schritt ${pd.afterStep.order} (${pd.afterStep.label}) wird ignoriert, weil der Schritt Teil eines AND-Parallelblocks ist`
      );
      return false;
    }

    return true;
  });

  const decisionByAfterStepId = new Map(
    processedDecisions.map((pd) => [pd.afterStep.stepId, pd])
  );

  if (decisions.length > 0 && processedDecisions.length === 0 && processedAndDecisions.length === 0) {
    warnings.push(
      'Alle Entscheidungen waren ungültig oder nicht unterstützt - Export enthält nur Happy Path'
    );
  }

  const exceptions = draft?.exceptions ?? [];
  const stepById = new Map(happyPath.map((s) => [s.stepId, s]));
  const exceptionsByStepId = new Map<string, CaptureDraftException[]>();

  exceptions.forEach((exception) => {
    if (!exception.relatedStepId) {
      const shortDesc = exception.description.substring(0, 30);
      warnings.push(
        `Ausnahme "${shortDesc}..." hat keinen Bezugsschritt (relatedStepId) und wird nicht exportiert.`
      );
      return;
    }

    if (!stepById.has(exception.relatedStepId)) {
      const shortDesc = exception.description.substring(0, 30);
      warnings.push(
        `Ausnahme "${shortDesc}..." verweist auf unbekannten Schritt ${exception.relatedStepId} und wird nicht exportiert.`
      );
      return;
    }

    const existing = exceptionsByStepId.get(exception.relatedStepId) || [];
    existing.push(exception);
    exceptionsByStepId.set(exception.relatedStepId, existing);
  });

  const processId = `Process_${process.processId}`;
  const startEventId = 'StartEvent_1';
  const endEventId = 'EndEvent_1';

  const hasRoles = version.sidecar.roles.length > 0 && happyPath.some((s) => s.roleId);
  const { lanes, stepToLaneIndex } = hasRoles
    ? buildLanes(happyPath, version)
    : { lanes: [], stepToLaneIndex: new Map() };

  const taskElements: string[] = [];
  const gatewayElements: string[] = [];
  const boundaryElements: string[] = [];
  const exceptionEndEvents: string[] = [];
  const sequenceFlows: string[] = [];
  const shapes: string[] = [];
  const edges: string[] = [];
  const laneShapes: string[] = [];

  const boundsByElementId = new Map<string, NodeBounds>();
  const flowNodeRefs = new Map<number, string[]>();

  const startLaneIndex = stepToLaneIndex.get(happyPath[0]?.stepId) || 0;
  const startY = hasRoles ? LANE_Y0 + startLaneIndex * (LANE_HEIGHT + LANE_GAP) + TASK_Y_OFFSET : 102;

  boundsByElementId.set(startEventId, { x: 100, y: startY, w: 36, h: 36 });
  flowNodeRefs.set(startLaneIndex, [startEventId]);

  happyPath.forEach((step, index) => {
    const taskId = `Task_${step.stepId}`;
    taskElements.push(getBpmnTaskElement(step, taskId, version));

    const x = TASK_X0 + index * STEP_GAP_X;
    const laneIndex = stepToLaneIndex.get(step.stepId) || 0;
    const y = hasRoles ? LANE_Y0 + laneIndex * (LANE_HEIGHT + LANE_GAP) + TASK_Y_OFFSET : 80;

    boundsByElementId.set(taskId, { x, y, w: 140, h: 80 });

    flowNodeRefs.set(laneIndex, flowNodeRefs.get(laneIndex) || []);
    flowNodeRefs.get(laneIndex)!.push(taskId);
  });

  processedDecisions.forEach((pd) => {
    const afterTaskBounds = boundsByElementId.get(`Task_${pd.afterStep.stepId}`)!;
    const laneIndex = stepToLaneIndex.get(pd.afterStep.stepId) || 0;

    const gatewayX = afterTaskBounds.x + 145;
    const centerY = afterTaskBounds.y + 40;
    const gatewayY = centerY - 25;

    boundsByElementId.set(pd.gatewayId, { x: gatewayX, y: gatewayY, w: 50, h: 50 });

    const gatewayName = escapeXml(pd.decision.question || 'Entscheidung');
    gatewayElements.push(
      `    <bpmn:exclusiveGateway id="${pd.gatewayId}" name="${gatewayName}" gatewayDirection="Diverging" />`
    );

    flowNodeRefs.set(laneIndex, flowNodeRefs.get(laneIndex) || []);
    flowNodeRefs.get(laneIndex)!.push(pd.gatewayId);
  });

  processedAndDecisions.forEach((pad) => {
    const afterTaskBounds = boundsByElementId.get(`Task_${pad.afterStep.stepId}`)!;
    const afterLaneIndex = stepToLaneIndex.get(pad.afterStep.stepId) || 0;

    const splitX = afterTaskBounds.x + 145;
    const splitY = afterTaskBounds.y + 40 - 25;

    boundsByElementId.set(pad.splitGatewayId, { x: splitX, y: splitY, w: 50, h: 50 });

    const lastParallelId = pad.parallelStepIds[pad.parallelStepIds.length - 1];
    const lastBounds = boundsByElementId.get(`Task_${lastParallelId}`)!;

    let joinY = afterTaskBounds.y + 40 - 25;
    if (pad.joinTargetStepId) {
      const joinTargetBounds = boundsByElementId.get(`Task_${pad.joinTargetStepId}`);
      if (joinTargetBounds) {
        joinY = joinTargetBounds.y + 40 - 25;
      }
    }
    const joinX = lastBounds.x + 145;

    boundsByElementId.set(pad.joinGatewayId, { x: joinX, y: joinY, w: 50, h: 50 });

    const gatewayName = escapeXml(pad.decision.question || 'Parallelität');
    gatewayElements.push(
      `    <bpmn:parallelGateway id="${pad.splitGatewayId}" name="${gatewayName}" gatewayDirection="Diverging" />`
    );
    gatewayElements.push(
      `    <bpmn:parallelGateway id="${pad.joinGatewayId}" name="${gatewayName} (Join)" gatewayDirection="Converging" />`
    );

    flowNodeRefs.set(afterLaneIndex, flowNodeRefs.get(afterLaneIndex) || []);
    flowNodeRefs.get(afterLaneIndex)!.push(pad.splitGatewayId);

    const joinLaneIndex = pad.joinTargetStepId
      ? stepToLaneIndex.get(pad.joinTargetStepId) || afterLaneIndex
      : afterLaneIndex;

    flowNodeRefs.set(joinLaneIndex, flowNodeRefs.get(joinLaneIndex) || []);
    flowNodeRefs.get(joinLaneIndex)!.push(pad.joinGatewayId);
  });

  const lanesWithExceptions = new Set<number>();

  exceptionsByStepId.forEach((exceptionList, stepId) => {
    const taskRef = `Task_${stepId}`;
    const taskBounds = boundsByElementId.get(taskRef);
    if (!taskBounds) return;

    const relatedStep = stepById.get(stepId);
    const laneIndex = stepToLaneIndex.get(stepId) || 0;
    lanesWithExceptions.add(laneIndex);

    exceptionList.forEach((exception, idx) => {
      const boundaryId = `BoundaryEvent_${exception.exceptionId}`;
      const typeLabel = getExceptionTypeLabel(exception.type);
      const eventName = escapeXml(`${typeLabel} (Ausnahme)`);

      const boundaryX = taskBounds.x + 10 + idx * 40;
      const boundaryY = taskBounds.y + taskBounds.h - 18;

      boundsByElementId.set(boundaryId, { x: boundaryX, y: boundaryY, w: 36, h: 36 });

      flowNodeRefs.set(laneIndex, flowNodeRefs.get(laneIndex) || []);
      flowNodeRefs.get(laneIndex)!.push(boundaryId);

      const docDescription = escapeXml(exception.description);
      const docHandling = escapeXml(exception.handling);
      const documentation = `Beschreibung: ${docDescription}\nHandling: ${docHandling}`;

      const eventDefResult = getExceptionEventDefinitionXml(exception, relatedStep, warnings);

      const cancelActivity = exception.type === 'timeout' && exception.timeoutInterrupting === false
        ? ' cancelActivity="false"'
        : '';

      boundaryElements.push(
        `    <bpmn:boundaryEvent id="${boundaryId}" name="${eventName}" attachedToRef="${taskRef}"${cancelActivity}>
      <bpmn:documentation>${documentation}</bpmn:documentation>
      ${eventDefResult.xml}
    </bpmn:boundaryEvent>`
      );
    });
  });

  const endX = TASK_X0 + happyPath.length * STEP_GAP_X;
  const endLaneIndex = stepToLaneIndex.get(happyPath[happyPath.length - 1]?.stepId) || 0;
  const endY = hasRoles ? LANE_Y0 + endLaneIndex * (LANE_HEIGHT + LANE_GAP) + TASK_Y_OFFSET : 102;

  boundsByElementId.set(endEventId, { x: endX, y: endY, w: 36, h: 36 });

  flowNodeRefs.set(endLaneIndex, flowNodeRefs.get(endLaneIndex) || []);
  if (!flowNodeRefs.get(endLaneIndex)!.includes(endEventId)) {
    flowNodeRefs.get(endLaneIndex)!.push(endEventId);
  }

  lanesWithExceptions.forEach((laneIndex) => {
    const exceptionEndEventId = `EndEvent_Exception_${laneIndex}`;
    const exceptionEndX = endX + 250;

    let exceptionEndY: number;
    if (hasRoles) {
      const laneY = LANE_Y0 + laneIndex * (LANE_HEIGHT + LANE_GAP);
      const taskY = laneY + TASK_Y_OFFSET;
      exceptionEndY = taskY + 22;
    } else {
      exceptionEndY = 102;
    }

    boundsByElementId.set(exceptionEndEventId, { x: exceptionEndX, y: exceptionEndY, w: 36, h: 36 });

    flowNodeRefs.set(laneIndex, flowNodeRefs.get(laneIndex) || []);
    flowNodeRefs.get(laneIndex)!.push(exceptionEndEventId);

    exceptionEndEvents.push(
      `    <bpmn:endEvent id="${exceptionEndEventId}" name="Abbruch (Ausnahme)" />`
    );
  });

  let flowCounter = 1;

  sequenceFlows.push(
    `    <bpmn:sequenceFlow id="Flow_${flowCounter++}" sourceRef="${startEventId}" targetRef="Task_${happyPath[0].stepId}" />`
  );

  happyPath.forEach((step, index) => {
    const taskId = `Task_${step.stepId}`;

    if (parallelStepIdSet.has(step.stepId)) {
      return;
    }

    const processedAndDecision = andByAfterStepId.get(step.stepId);
    if (processedAndDecision) {
      sequenceFlows.push(
        `    <bpmn:sequenceFlow id="Flow_${flowCounter++}" sourceRef="${taskId}" targetRef="${processedAndDecision.splitGatewayId}" />`
      );

      processedAndDecision.parallelStepIds.forEach((parallelStepId) => {
        sequenceFlows.push(
          `    <bpmn:sequenceFlow id="Flow_${flowCounter++}" sourceRef="${processedAndDecision.splitGatewayId}" targetRef="Task_${parallelStepId}" />`
        );

        sequenceFlows.push(
          `    <bpmn:sequenceFlow id="Flow_${flowCounter++}" sourceRef="Task_${parallelStepId}" targetRef="${processedAndDecision.joinGatewayId}" />`
        );
      });

      sequenceFlows.push(
        `    <bpmn:sequenceFlow id="Flow_${flowCounter++}" sourceRef="${processedAndDecision.joinGatewayId}" targetRef="${processedAndDecision.joinTargetRef}" />`
      );

      return;
    }

    const processedDecision = decisionByAfterStepId.get(step.stepId);
    if (processedDecision) {
      sequenceFlows.push(
        `    <bpmn:sequenceFlow id="Flow_${flowCounter++}" sourceRef="${taskId}" targetRef="${processedDecision.gatewayId}" />`
      );

      const nextStepIndex = index + 1;
      const defaultNextRef =
        nextStepIndex < happyPath.length ? `Task_${happyPath[nextStepIndex].stepId}` : endEventId;

      let hasDefaultBranch = false;

      processedDecision.decision.branches.forEach((branch) => {
        const targetRef = branch.endsProcess ? endEventId : `Task_${branch.nextStepId}`;
        const flowName = escapeXml(branch.conditionLabel);

        sequenceFlows.push(
          `    <bpmn:sequenceFlow id="Flow_${flowCounter++}" name="${flowName}" sourceRef="${processedDecision.gatewayId}" targetRef="${targetRef}" />`
        );

        if (targetRef === defaultNextRef) {
          hasDefaultBranch = true;
        }
      });

      if (!hasDefaultBranch) {
        sequenceFlows.push(
          `    <bpmn:sequenceFlow id="Flow_${flowCounter++}" name="Weiter" sourceRef="${processedDecision.gatewayId}" targetRef="${defaultNextRef}" />`
        );
        warnings.push(
          `Entscheidung nach Schritt ${step.order} (${step.label}) hatte keinen Branch zum nächsten Standardschritt; 'Weiter'-Branch wurde ergänzt`
        );
      }
    } else {
      const nextStepIndex = index + 1;
      const targetRef =
        nextStepIndex < happyPath.length ? `Task_${happyPath[nextStepIndex].stepId}` : endEventId;

      sequenceFlows.push(
        `    <bpmn:sequenceFlow id="Flow_${flowCounter++}" sourceRef="${taskId}" targetRef="${targetRef}" />`
      );
    }
  });

  exceptionsByStepId.forEach((exceptionList, stepId) => {
    const laneIndex = stepToLaneIndex.get(stepId) || 0;
    const exceptionEndEventId = `EndEvent_Exception_${laneIndex}`;

    exceptionList.forEach((exception) => {
      const boundaryId = `BoundaryEvent_${exception.exceptionId}`;
      sequenceFlows.push(
        `    <bpmn:sequenceFlow id="Flow_${flowCounter++}" sourceRef="${boundaryId}" targetRef="${exceptionEndEventId}" />`
      );
    });
  });

  boundsByElementId.forEach((bounds, elementId) => {
    if (elementId === startEventId || elementId === endEventId || elementId.startsWith('EndEvent_Exception_') || elementId.startsWith('BoundaryEvent_')) {
      shapes.push(`      <bpmndi:BPMNShape id="${elementId}_di" bpmnElement="${elementId}">
        <dc:Bounds x="${bounds.x}" y="${bounds.y}" width="${bounds.w}" height="${bounds.h}" />
      </bpmndi:BPMNShape>`);
    } else if (elementId.startsWith('Gateway_')) {
      shapes.push(`      <bpmndi:BPMNShape id="${elementId}_di" bpmnElement="${elementId}" isMarkerVisible="true">
        <dc:Bounds x="${bounds.x}" y="${bounds.y}" width="${bounds.w}" height="${bounds.h}" />
      </bpmndi:BPMNShape>`);
    } else {
      shapes.push(`      <bpmndi:BPMNShape id="${elementId}_di" bpmnElement="${elementId}">
        <dc:Bounds x="${bounds.x}" y="${bounds.y}" width="${bounds.w}" height="${bounds.h}" />
      </bpmndi:BPMNShape>`);
    }
  });

  sequenceFlows.forEach((flow, index) => {
    const flowId = `Flow_${index + 1}`;
    const match = flow.match(/sourceRef="([^"]+)" targetRef="([^"]+)"/);
    if (!match) return;

    const sourceRef = match[1];
    const targetRef = match[2];

    const sourceBounds = boundsByElementId.get(sourceRef);
    const targetBounds = boundsByElementId.get(targetRef);

    if (!sourceBounds || !targetBounds) return;

    const wp1x = sourceBounds.x + sourceBounds.w;
    const wp1y = sourceBounds.y + sourceBounds.h / 2;
    const wp2x = targetBounds.x;
    const wp2y = targetBounds.y + targetBounds.h / 2;

    edges.push(`      <bpmndi:BPMNEdge id="${flowId}_di" bpmnElement="${flowId}">
        <di:waypoint x="${wp1x}" y="${wp1y}" />
        <di:waypoint x="${wp2x}" y="${wp2y}" />
      </bpmndi:BPMNEdge>`);
  });

  let laneSetXml = '';
  if (hasRoles && lanes.length > 0) {
    let maxX = 0;
    boundsByElementId.forEach((bounds) => {
      const rightEdge = bounds.x + bounds.w;
      if (rightEdge > maxX) {
        maxX = rightEdge;
      }
    });
    const diagramWidth = maxX + 200;

    const laneElements = lanes.map((lane) => {
      const refs = flowNodeRefs.get(lane.index) || [];
      const refElements = refs.map((ref) => `        <bpmn:flowNodeRef>${ref}</bpmn:flowNodeRef>`).join('\n');
      return `      <bpmn:lane id="${lane.laneId}" name="${escapeXml(lane.roleName)}">
${refElements}
      </bpmn:lane>`;
    });

    laneSetXml = `    <bpmn:laneSet id="LaneSet_1">
${laneElements.join('\n')}
    </bpmn:laneSet>
`;

    lanes.forEach((lane) => {
      const laneY = LANE_Y0 + lane.index * (LANE_HEIGHT + LANE_GAP);
      laneShapes.push(`      <bpmndi:BPMNShape id="${lane.laneId}_di" bpmnElement="${lane.laneId}" isHorizontal="true">
        <dc:Bounds x="${LANE_X}" y="${laneY}" width="${diagramWidth}" height="${LANE_HEIGHT}" />
      </bpmndi:BPMNShape>`);
    });
  }

  const processName = escapeXml(version.titleSnapshot || process.title);

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
                  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
                  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
                  id="Definitions_1"
                  targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="${processId}" name="${processName}" isExecutable="false">
${laneSetXml}    <bpmn:startEvent id="${startEventId}" name="Start" />
${taskElements.join('\n')}
${gatewayElements.join('\n')}
${boundaryElements.join('\n')}
    <bpmn:endEvent id="${endEventId}" name="End" />
${exceptionEndEvents.join('\n')}
${sequenceFlows.join('\n')}
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="${processId}">
${laneShapes.join('\n')}
${shapes.join('\n')}
${edges.join('\n')}
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

  return { xml, warnings };
}

function buildEmptyBpmnSkeleton(processId: string): string {
  const bpmnProcessId = `Process_${processId}`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
                  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
                  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
                  id="Definitions_1"
                  targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="${bpmnProcessId}" name="Empty Process" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1" name="Start" />
    <bpmn:endEvent id="EndEvent_1" name="End" />
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="EndEvent_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="${bpmnProcessId}">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="100" y="102" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EndEvent_1_di" bpmnElement="EndEvent_1">
        <dc:Bounds x="200" y="102" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1">
        <di:waypoint x="136" y="120" />
        <di:waypoint x="200" y="120" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;
}
