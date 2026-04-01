import type { Process, ProcessVersion, ModelQuality } from '../domain/process';
import type {
  CapturePhase,
  CaptureProgress,
  CaptureDraftStep,
  CaptureDraftDecision,
} from '../domain/capture';
import { createInitialCaptureDraft } from '../domain/capture';
import type { WizardQuestion, WizardAnswer } from './wizardTypes';
import { getQuestionsByPhase, getQuestionById } from './wizardSpec';

export const CAPTURE_PHASES_ALL: CapturePhase[] = [
  'scope',
  'happy_path',
  'roles',
  'decisions',
  'exceptions',
  'data_it',
  'kpis',
  'automation',
  'review',
];

export const CAPTURE_PHASES_SKELETON: CapturePhase[] = [
  'scope',
  'happy_path',
  'roles',
];

function getValueAtPath(obj: unknown, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    const match = part.match(/^(.+?)\[(\d+)\]$/);
    if (match) {
      const key = match[1];
      const index = parseInt(match[2], 10);
      if (current && typeof current === 'object' && key in current) {
        const arr = (current as Record<string, unknown>)[key];
        if (Array.isArray(arr) && index < arr.length) {
          current = arr[index];
        } else {
          return undefined;
        }
      } else {
        return undefined;
      }
    } else {
      if (current && typeof current === 'object' && part in current) {
        current = (current as Record<string, unknown>)[part];
      } else {
        return undefined;
      }
    }
  }

  return current;
}

export function getCurrentPhase(version: ProcessVersion): CapturePhase {
  const { phaseStates } = version.captureProgress;

  const phases: CapturePhase[] = [
    'scope',
    'happy_path',
    'roles',
    'decisions',
    'exceptions',
    'data_it',
    'kpis',
    'automation',
    'review',
  ];

  for (const phase of phases) {
    if (phaseStates[phase] !== 'done') {
      return phase;
    }
  }

  return 'review';
}

export function getNextQuestions(
  process: Process,
  version: ProcessVersion,
  max: number = 3
): WizardQuestion[] {
  const currentPhase = getCurrentPhase(version);
  const phaseQuestions = getQuestionsByPhase(currentPhase);

  const unanswered: WizardQuestion[] = [];

  for (const question of phaseQuestions) {
    const value = getValueFromTarget(process, version, question.mapsTo.target, question.mapsTo.path);

    if (question.required && isEmptyValue(value)) {
      unanswered.push(question);
      if (unanswered.length >= max) {
        break;
      }
    }
  }

  if (unanswered.length === 0) {
    for (const question of phaseQuestions) {
      if (!question.required) {
        const value = getValueFromTarget(process, version, question.mapsTo.target, question.mapsTo.path);
        if (isEmptyValue(value)) {
          unanswered.push(question);
          if (unanswered.length >= max) {
            break;
          }
        }
      }
    }
  }

  return unanswered;
}

function getValueFromTarget(
  process: Process,
  version: ProcessVersion,
  target: string,
  path: string
): unknown {
  switch (target) {
    case 'process':
      return getValueAtPath(process, path);
    case 'version':
      return getValueAtPath(version, path);
    case 'sidecar':
      return getValueAtPath(version.sidecar, path);
    case 'draft':
      if (!version.sidecar.captureDraft) {
        return undefined;
      }
      return getValueAtPath(version.sidecar.captureDraft, path);
    default:
      return undefined;
  }
}

function isEmptyValue(value: unknown): boolean {
  if (value === undefined || value === null || value === '') {
    return true;
  }
  if (Array.isArray(value) && value.length === 0) {
    return true;
  }
  return false;
}

export function getCurrentPhaseForPhases(
  version: ProcessVersion,
  phases: CapturePhase[]
): CapturePhase | null {
  for (const phase of phases) {
    if (version.captureProgress.phaseStates[phase] !== 'done') {
      return phase;
    }
  }
  return null;
}

export function getNextQuestionsForPhase(
  process: Process,
  version: ProcessVersion,
  phase: CapturePhase,
  max: number = 3
): WizardQuestion[] {
  const phaseQuestions = getQuestionsByPhase(phase);
  const unanswered: WizardQuestion[] = [];

  for (const question of phaseQuestions) {
    const value = getValueFromTarget(process, version, question.mapsTo.target, question.mapsTo.path);
    if (question.required && isEmptyValue(value)) {
      unanswered.push(question);
      if (unanswered.length >= max) {
        return unanswered;
      }
    }
  }

  if (unanswered.length === 0) {
    for (const question of phaseQuestions) {
      if (!question.required) {
        const value = getValueFromTarget(process, version, question.mapsTo.target, question.mapsTo.path);
        if (isEmptyValue(value)) {
          unanswered.push(question);
          if (unanswered.length >= max) {
            return unanswered;
          }
        }
      }
    }
  }

  return unanswered;
}

export function getPhaseAnswerStatus(
  process: Process,
  version: ProcessVersion,
  phase: CapturePhase
): {
  requiredAnswered: boolean;
  optionalUnanswered: boolean;
  allQuestionsAnswered: boolean;
} {
  const phaseQuestions = getQuestionsByPhase(phase);

  const requiredQuestions = phaseQuestions.filter((q) => q.required);
  const optionalQuestions = phaseQuestions.filter((q) => !q.required);

  const requiredAnswered = requiredQuestions.every((q) => {
    const value = getValueFromTarget(process, version, q.mapsTo.target, q.mapsTo.path);
    return !isEmptyValue(value);
  });

  const optionalUnanswered = optionalQuestions.some((q) => {
    const value = getValueFromTarget(process, version, q.mapsTo.target, q.mapsTo.path);
    return isEmptyValue(value);
  });

  const allQuestionsAnswered = [...requiredQuestions, ...optionalQuestions].every((q) => {
    const value = getValueFromTarget(process, version, q.mapsTo.target, q.mapsTo.path);
    return !isEmptyValue(value);
  });

  return {
    requiredAnswered,
    optionalUnanswered,
    allQuestionsAnswered,
  };
}

function validateAnswer(question: WizardQuestion, value: unknown): string | null {
  if (question.required && isEmptyValue(value)) {
    return 'Dieses Feld ist erforderlich';
  }

  if (!question.validation) {
    return null;
  }

  const v = question.validation;

  if (typeof value === 'string') {
    if (v.minLen && value.length < v.minLen) {
      return v.message || `Mindestens ${v.minLen} Zeichen erforderlich`;
    }
    if (v.maxLen && value.length > v.maxLen) {
      return v.message || `Maximal ${v.maxLen} Zeichen erlaubt`;
    }
    if (v.pattern) {
      const regex = new RegExp(v.pattern);
      if (!regex.test(value)) {
        return v.message || 'Format ist ungültig';
      }
    }
  }

  if (typeof value === 'number') {
    if (v.min !== undefined && value < v.min) {
      return v.message || `Mindestwert ist ${v.min}`;
    }
    if (v.max !== undefined && value > v.max) {
      return v.message || `Maximalwert ist ${v.max}`;
    }
  }

  if (Array.isArray(value) && question.type === 'list') {
    if (v.minLen && value.length < v.minLen) {
      return v.message || `Mindestens ${v.minLen} Einträge erforderlich`;
    }
    if (v.maxLen && value.length > v.maxLen) {
      return v.message || `Maximal ${v.maxLen} Einträge erlaubt`;
    }
  }

  return null;
}

export function applyAnswers(
  process: Process,
  version: ProcessVersion,
  answers: WizardAnswer[],
  phaseOverride?: CapturePhase
): {
  processPatch?: Partial<Process>;
  versionPatch: Partial<ProcessVersion>;
  updatedCaptureProgress: CaptureProgress;
  errors: Array<{ questionId: string; error: string }>;
} {
  const errors: Array<{ questionId: string; error: string }> = [];
  const extraSemanticQuestions: ModelQuality['semanticQuestions'] = [];

  const workingVersion: ProcessVersion = structuredClone(version);
  const workingProcess: Process = structuredClone(process);

  if (!workingVersion.sidecar.captureDraft) {
    workingVersion.sidecar.captureDraft = createInitialCaptureDraft();
  }

  for (const answer of answers) {
    const question = getQuestionById(answer.questionId);
    if (!question) {
      errors.push({ questionId: answer.questionId, error: 'Frage nicht gefunden' });
      continue;
    }

    let processedValue = answer.value;

    if (question.type === 'list') {
      if (typeof processedValue === 'string') {
        processedValue = processedValue
          .split('\n')
          .map(l => l.trim())
          .filter(l => l.length > 0);
      }
      if (Array.isArray(processedValue)) {
        processedValue = processedValue
          .map(v => typeof v === 'string' ? v.trim() : String(v))
          .filter(v => v.length > 0);
      }
    }

    const validationError = validateAnswer(question, processedValue);
    if (validationError) {
      errors.push({ questionId: answer.questionId, error: validationError });
      continue;
    }

    if (question.mapsTo.path === 'happyPath' && Array.isArray(processedValue)) {
      const steps: CaptureDraftStep[] = (processedValue as string[]).map((label, index) => ({
        stepId: crypto.randomUUID(),
        order: index + 1,
        label,
      }));
      processedValue = steps;
    }

    if (question.mapsTo.path === 'decisions' && Array.isArray(processedValue)) {
      const decisions: CaptureDraftDecision[] = [];
      const happyPath = workingVersion.sidecar.captureDraft?.happyPath || [];

      for (const line of processedValue as string[]) {
        let afterStepId: string | undefined;
        let questionText = line;

        const stepNoMatch = line.match(/^(\d+)\s*[:-]\s*(.+)$/);
        if (stepNoMatch) {
          const stepNo = parseInt(stepNoMatch[1], 10);
          questionText = stepNoMatch[2];
          const step = happyPath.find((s) => s.order === stepNo);
          if (step) {
            afterStepId = step.stepId;
          }
        } else {
          const labelMatch = line.match(/^nach\s+(.+?)\s*:\s*(.+)$/i);
          if (labelMatch) {
            const labelPart = labelMatch[1];
            questionText = labelMatch[2];
            const step = happyPath.find(
              (s) => s.label.toLowerCase() === labelPart.toLowerCase()
            );
            if (step) {
              afterStepId = step.stepId;
            }
          }
        }

        if (!afterStepId && happyPath.length > 0) {
          afterStepId = happyPath[happyPath.length - 1].stepId;
          extraSemanticQuestions.push({
            id: crypto.randomUUID(),
            question: 'Eine Entscheidung konnte keinem Schritt eindeutig zugeordnet werden. Bitte prüfen.',
            relatedStepHint: 'Entscheidungen',
          });
        }

        if (afterStepId) {
          decisions.push({
            decisionId: crypto.randomUUID(),
            afterStepId,
            gatewayType: 'xor',
            question: questionText.trim(),
            branches: [
              { branchId: crypto.randomUUID(), conditionLabel: 'Ja' },
              { branchId: crypto.randomUUID(), conditionLabel: 'Nein' },
            ],
          });
        }
      }

      processedValue = decisions;
    }

    if (question.mapsTo.path === 'roles' && Array.isArray(processedValue)) {
      const roles = (processedValue as string[]).map((name) => ({
        id: crypto.randomUUID(),
        name,
        kind: 'role' as const,
      }));
      processedValue = roles;
    }

    if (question.mapsTo.path === 'systems' && Array.isArray(processedValue)) {
      const systems = (processedValue as string[]).map((name) => ({
        id: crypto.randomUUID(),
        name,
      }));
      processedValue = systems;
    }

    if (question.mapsTo.path === 'dataObjects' && Array.isArray(processedValue)) {
      const dataObjects = (processedValue as string[]).map((name) => ({
        id: crypto.randomUUID(),
        name,
        kind: 'document' as const,
      }));
      processedValue = dataObjects;
    }

    if (question.mapsTo.path === 'kpis' && Array.isArray(processedValue)) {
      const kpis = (processedValue as string[]).map((def) => ({
        id: crypto.randomUUID(),
        name: def.split(':')[0]?.trim() || def,
        definition: def.split(':')[1]?.trim() || def,
      }));
      processedValue = kpis;
    }

    if (
      question.mapsTo.path.startsWith('exceptions[') &&
      question.mapsTo.path.endsWith('].handling')
    ) {
      const indexMatch = question.mapsTo.path.match(/exceptions\[(\d+)\]/);
      if (indexMatch && typeof processedValue === 'string') {
        const index = parseInt(indexMatch[1], 10);
        const draft = workingVersion.sidecar.captureDraft!;
        if (!Array.isArray(draft.exceptions)) {
          draft.exceptions = [];
        }
        while (draft.exceptions.length <= index) {
          draft.exceptions.push({
            exceptionId: crypto.randomUUID(),
            type: 'other',
            description: '',
            handling: '',
          });
        }
        if (index === 0) {
          draft.exceptions[index].type = 'missing_data';
          draft.exceptions[index].description = 'Fehlende Informationen';
        } else if (index === 1) {
          draft.exceptions[index].type = 'timeout';
          draft.exceptions[index].description = 'Zeitüberschreitung';
        } else if (index === 2) {
          draft.exceptions[index].type = 'error';
          draft.exceptions[index].description = 'Fehler';
        }
        draft.exceptions[index].handling = processedValue;
        continue;
      }
    }

    switch (question.mapsTo.target) {
      case 'process':
        if (question.mapsTo.path === 'title') {
          workingProcess.title = processedValue as string;
        } else if (question.mapsTo.path === 'category') {
          workingProcess.category = processedValue as typeof workingProcess.category;
        } else if (question.mapsTo.path === 'managementLevel') {
          workingProcess.managementLevel = processedValue as typeof workingProcess.managementLevel;
        } else if (question.mapsTo.path === 'hierarchyLevel') {
          workingProcess.hierarchyLevel = processedValue as typeof workingProcess.hierarchyLevel;
        } else if (question.mapsTo.path === 'parentProcessId') {
          workingProcess.parentProcessId = (processedValue as string | undefined) ?? null;
        }
        break;
      case 'version':
        if (question.mapsTo.path.startsWith('endToEndDefinition.')) {
          const field = question.mapsTo.path.split('.')[1];
          if (field && typeof field === 'string') {
            (workingVersion.endToEndDefinition as unknown as Record<string, unknown>)[field] = processedValue;
          }
        }
        break;
      case 'sidecar':
        if (question.mapsTo.path.startsWith('aiReadinessSignals.')) {
          const field = question.mapsTo.path.split('.')[1];
          if (field && typeof field === 'string') {
            if (!workingVersion.sidecar.aiReadinessSignals) {
              workingVersion.sidecar.aiReadinessSignals = {
                standardization: 'low',
                dataAvailability: 'low',
                variability: 'low',
                complianceRisk: 'low',
              };
            }
            (workingVersion.sidecar.aiReadinessSignals as unknown as Record<string, unknown>)[field] =
              processedValue;
          }
        } else if (question.mapsTo.path.startsWith('operationalContext.')) {
          const field = question.mapsTo.path.split('.')[1];
          if (field && typeof field === 'string' && processedValue) {
            if (!workingVersion.sidecar.operationalContext) {
              workingVersion.sidecar.operationalContext = {};
            }
            (workingVersion.sidecar.operationalContext as Record<string, unknown>)[field] = processedValue;
          }
        } else if (question.mapsTo.path === 'roles') {
          workingVersion.sidecar.roles = processedValue as typeof workingVersion.sidecar.roles;
        } else if (question.mapsTo.path === 'systems') {
          workingVersion.sidecar.systems = processedValue as typeof workingVersion.sidecar.systems;
        } else if (question.mapsTo.path === 'dataObjects') {
          workingVersion.sidecar.dataObjects =
            processedValue as typeof workingVersion.sidecar.dataObjects;
        } else if (question.mapsTo.path === 'kpis') {
          workingVersion.sidecar.kpis = processedValue as typeof workingVersion.sidecar.kpis;
        } else if (question.mapsTo.path === 'automationNotes') {
          workingVersion.sidecar.automationNotes =
            processedValue as typeof workingVersion.sidecar.automationNotes;
        }
        break;
      case 'draft':
        if (question.mapsTo.path === 'happyPath') {
          workingVersion.sidecar.captureDraft!.happyPath =
            processedValue as typeof workingVersion.sidecar.captureDraft.happyPath;
        } else if (question.mapsTo.path === 'decisions') {
          workingVersion.sidecar.captureDraft!.decisions =
            processedValue as typeof workingVersion.sidecar.captureDraft.decisions;
        } else if (question.mapsTo.path === 'notes[0]') {
          if (!workingVersion.sidecar.captureDraft!.notes) {
            workingVersion.sidecar.captureDraft!.notes = [];
          }
          workingVersion.sidecar.captureDraft!.notes[0] = processedValue as string;
        }
        break;
    }
  }

  const qualityFindings = generateQualityFindings(process, workingVersion);
  const generated = qualityFindings.semanticQuestions ?? [];
  const combined = [...generated, ...extraSemanticQuestions];

  const normalizeKey = (q: string): string => {
    return q.trim().toLowerCase().replace(/\s+/g, ' ');
  };

  const seen = new Set<string>();
  const deduped = combined.filter(q => {
    const key = normalizeKey(q.question);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const mergeSemanticQuestions = (
    existing: ModelQuality['semanticQuestions'],
    generated: ModelQuality['semanticQuestions']
  ): ModelQuality['semanticQuestions'] => {
    const existingMap = new Map<string, ModelQuality['semanticQuestions'][0]>();
    existing.forEach(q => {
      existingMap.set(normalizeKey(q.question), q);
    });

    return generated.map(genQ => {
      const existingQ = existingMap.get(normalizeKey(genQ.question));
      if (existingQ) {
        return {
          ...genQ,
          id: existingQ.id,
          status: existingQ.status,
          answer: existingQ.answer,
          relatedStepId: existingQ.relatedStepId,
          relatedStepHint: genQ.relatedStepHint || existingQ.relatedStepHint,
        };
      }
      return {
        ...genQ,
        status: 'open' as const,
        id: genQ.id || crypto.randomUUID(),
      };
    });
  };

  const mergedSemanticQuestions = mergeSemanticQuestions(
    version.quality.semanticQuestions,
    deduped
  );

  const mergedQuality: ModelQuality = {
    ...workingVersion.quality,
    namingFindings: qualityFindings.namingFindings ?? workingVersion.quality.namingFindings,
    semanticQuestions: mergedSemanticQuestions,
  };
  workingVersion.quality = mergedQuality;

  const phaseToUpdate = phaseOverride ?? getCurrentPhase(version);
  const status = getPhaseAnswerStatus(workingProcess, workingVersion, phaseToUpdate);

  const updatedCaptureProgress: CaptureProgress = {
    ...version.captureProgress,
    phaseStates: { ...version.captureProgress.phaseStates },
  };

  if (!status.requiredAnswered) {
    updatedCaptureProgress.phaseStates[phaseToUpdate] = 'in_progress';
  } else {
    if (answers.length === 0) {
      updatedCaptureProgress.phaseStates[phaseToUpdate] = 'done';
    } else if (status.allQuestionsAnswered) {
      updatedCaptureProgress.phaseStates[phaseToUpdate] = 'done';
    } else {
      updatedCaptureProgress.phaseStates[phaseToUpdate] = 'in_progress';
    }
  }

  updatedCaptureProgress.lastTouchedAt = new Date().toISOString();

  const versionPatch: Partial<ProcessVersion> = {
    endToEndDefinition: workingVersion.endToEndDefinition,
    sidecar: workingVersion.sidecar,
    captureProgress: updatedCaptureProgress,
    quality: mergedQuality,
  };

  const processPatch: Partial<Process> = {
    title: workingProcess.title,
    category: workingProcess.category,
    managementLevel: workingProcess.managementLevel,
    hierarchyLevel: workingProcess.hierarchyLevel,
    parentProcessId: workingProcess.parentProcessId ?? null,
  };

  return {
    processPatch,
    versionPatch,
    updatedCaptureProgress,
    errors,
  };
}

export function generateQualityFindings(
  _process: Process,
  version: ProcessVersion
): Partial<ModelQuality> {
  const namingFindings: ModelQuality['namingFindings'] = [];
  const semanticQuestions: ModelQuality['semanticQuestions'] = [];

  const { trigger, outcome } = version.endToEndDefinition;
  if (trigger && /^[A-Z][a-z]+\s+[a-z]/.test(trigger)) {
    namingFindings.push({
      severity: 'info',
      message: 'Trigger sollte als Zustand formuliert sein (nicht als Tätigkeit)',
      exampleFix: 'Statt "Kunde bestellt" besser "Bestellung ist eingegangen"',
    });
  }

  if (outcome && /^[A-Z][a-z]+\s+[a-z]/.test(outcome)) {
    namingFindings.push({
      severity: 'info',
      message: 'Outcome sollte als Zustand/Ergebnis formuliert sein',
      exampleFix: 'Statt "Auftrag bearbeiten" besser "Auftrag ist bearbeitet"',
    });
  }

  const draft = version.sidecar.captureDraft;
  if (draft?.happyPath) {
    for (const step of draft.happyPath) {
      const words = step.label.split(' ');
      if (words.length === 1) {
        namingFindings.push({
          severity: 'warn',
          message: `Schritt "${step.label}" sollte aus Substantiv + Verb bestehen`,
          exampleFix: 'z.B. "Rechnung prüfen", "Kunde informieren"',
        });
      }
    }

    if (draft.happyPath.length < 5) {
      semanticQuestions.push({
        id: crypto.randomUUID(),
        question:
          'Der Prozess hat nur wenige Schritte. Ist das wirklich der vollständige Ablauf?',
        relatedStepHint: 'Happy Path',
      });
    }

    if (draft.happyPath.length > 30) {
      semanticQuestions.push({
        id: crypto.randomUUID(),
        question:
          'Der Prozess hat sehr viele Schritte. Sollten einige davon als Unterprozesse ausgelagert werden?',
        relatedStepHint: 'Happy Path',
      });
    }
  }

  semanticQuestions.push({
    id: crypto.randomUUID(),
    question:
      'Ist der Prozess wirklich End-to-End? Beginnt er beim Kundenbedarf und endet beim gelieferten Ergebnis?',
  });

  if (version.sidecar.roles.length === 0) {
    semanticQuestions.push({
      id: crypto.randomUUID(),
      question: 'Keine Rollen erfasst. Wer führt die Schritte aus?',
      relatedStepHint: 'Rollen',
    });
  }

  if (draft && draft.decisions.length === 0 && draft.happyPath.length > 5) {
    semanticQuestions.push({
      id: crypto.randomUUID(),
      question:
        'Es wurden keine Entscheidungen erfasst. Gibt es wirklich keine Verzweigungen im Prozess?',
      relatedStepHint: 'Entscheidungen',
    });
  }

  if (version.sidecar.systems.length > 0 && version.sidecar.dataObjects.length === 0) {
    semanticQuestions.push({
      id: crypto.randomUUID(),
      question:
        'IT-Systeme sind vorhanden, aber keine Datenobjekte. Welche Daten werden verarbeitet?',
      relatedStepHint: 'Daten',
    });
  }

  if (version.sidecar.roles.length > 0 && draft?.happyPath) {
    const stepsWithoutRole = draft.happyPath.filter((step) => !step.roleId);
    if (stepsWithoutRole.length > 0) {
      semanticQuestions.push({
        id: crypto.randomUUID(),
        question:
          'Nicht alle Schritte sind Rollen zugeordnet – wer macht was?',
        relatedStepHint: 'Rollen',
      });
    }
  }

  if (version.sidecar.systems.length > 0 && draft?.happyPath) {
    const stepsWithSystem = draft.happyPath.filter((step) => step.systemId);
    if (stepsWithSystem.length === 0) {
      semanticQuestions.push({
        id: crypto.randomUUID(),
        question:
          'IT-Systeme sind erfasst, aber nicht den Schritten zugeordnet – wo werden sie genutzt?',
        relatedStepHint: 'Systeme',
      });
    }
  }

  if (draft?.decisions && draft.decisions.length > 0) {
    const happyPathStepIds = new Set(draft.happyPath.map((s) => s.stepId));

    for (const decision of draft.decisions) {
      if (decision.afterStepId && !happyPathStepIds.has(decision.afterStepId)) {
        semanticQuestions.push({
          id: crypto.randomUUID(),
          question:
            'Eine Entscheidung referenziert einen Schritt, der im Happy Path nicht mehr existiert. Bitte prüfen.',
          relatedStepHint: 'Entscheidungen',
        });
        break;
      }

      const incompleteBranches = decision.branches.filter(
        (b) => !b.endsProcess && !b.nextStepId
      );
      if (incompleteBranches.length > 0) {
        semanticQuestions.push({
          id: crypto.randomUUID(),
          question:
            'Einige Entscheidungszweige sind noch nicht mit einem Folgeschritt verbunden oder als Ende markiert.',
          relatedStepHint: 'Entscheidungen',
        });
        break;
      }
    }
  }

  if (draft?.exceptions && draft.exceptions.length > 0) {
    const incompleteExceptions = draft.exceptions.filter(
      (exc) => !exc.description.trim() || !exc.handling.trim()
    );
    if (incompleteExceptions.length > 0) {
      semanticQuestions.push({
        id: crypto.randomUUID(),
        question:
          'Einige Ausnahmen sind unvollständig beschrieben (Beschreibung/Handling fehlt).',
        relatedStepHint: 'Ausnahmen',
      });
    }
  }

  return {
    namingFindings,
    semanticQuestions,
  };
}
