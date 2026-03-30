import type { Process, ProcessVersion } from '../domain/process';
import type { CreateVersionInput } from '../storage/repositories/versionsRepo';
import type { AiCaptureResultV1 } from './aiTypes';
import type {
  CaptureDraftStep,
  CaptureDraftDecision,
  CaptureDraftException,
  ExceptionType,
  WorkType,
  CaptureProgress,
  CapturePhase,
  CapturePhaseState,
  EvidenceRef,
} from '../domain/capture';
import type { ProcessRole, ProcessSystem, ProcessDataObject, ProcessKPI, EvidenceSource } from '../domain/process';
import { createInitialCaptureProgress } from '../domain/capture';
import { getPhaseAnswerStatus, generateQualityFindings } from '../capture/wizardEngine';
import { normalizeCatalogToken } from '../utils/catalogAliases';

export interface AiImportOptions {
  mergeIntoExistingSidecar?: boolean;
  defaultEvidenceRefId?: string;
  evidenceSource?: {
    refId: string;
    kind: 'ai_input' | 'file' | 'workshop' | 'other';
    language?: 'de' | 'en' | 'auto';
    text: string;
  };
  additionalWarnings?: string[];
  mergeStrategy?: 'replace_all' | 'enrich_existing';
}

export interface AiImportResult {
  versionInput: CreateVersionInput;
  processPatch?: Partial<Process>;
  warnings: string[];
}

function extractJsonFromText(text: string): AiCaptureResultV1 {
  let cleanText = text.trim();

  const codeBlockMatch = cleanText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    cleanText = codeBlockMatch[1].trim();
  }

  const firstBrace = cleanText.indexOf('{');
  const lastBrace = cleanText.lastIndexOf('}');

  if (firstBrace === -1 || lastBrace === -1 || firstBrace >= lastBrace) {
    throw new Error(
      'Antwort konnte nicht als JSON gelesen werden. Es wurde keine gültige JSON-Struktur gefunden. Stellen Sie sicher, dass die Claude-Antwort mit { beginnt und mit } endet.'
    );
  }

  const jsonText = cleanText.slice(firstBrace, lastBrace + 1);

  try {
    const parsed = JSON.parse(jsonText);
    return parsed as AiCaptureResultV1;
  } catch (err) {
    throw new Error(
      `Antwort konnte nicht als JSON gelesen werden. JSON-Parse-Fehler: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

function validateAiCapture(data: AiCaptureResultV1): void {
  if (data.schemaVersion !== 'ai-capture-v1') {
    throw new Error(
      `Ungültige Schema-Version: "${data.schemaVersion}". Erwartet: "ai-capture-v1".`
    );
  }

  if (!data.endToEnd?.trigger?.trim()) {
    throw new Error('Pflichtfeld "endToEnd.trigger" fehlt oder ist leer.');
  }

  if (!data.endToEnd?.customer?.trim()) {
    throw new Error('Pflichtfeld "endToEnd.customer" fehlt oder ist leer.');
  }

  if (!data.endToEnd?.outcome?.trim()) {
    throw new Error('Pflichtfeld "endToEnd.outcome" fehlt oder ist leer.');
  }

  if (!Array.isArray(data.happyPath)) {
    throw new Error('Pflichtfeld "happyPath" muss ein Array sein.');
  }

  if (data.happyPath.length < 1) {
    throw new Error('Happy Path muss mindestens 1 Schritt enthalten.');
  }

  const emptySteps = data.happyPath.filter((s) => !s?.trim());
  if (emptySteps.length > 0) {
    throw new Error('Happy Path enthält leere Schritte.');
  }
}

function normalizeStrings(arr: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  arr.forEach((item) => {
    const normalized = item.trim();
    const lowerKey = normalized.toLowerCase();
    if (normalized && !seen.has(lowerKey)) {
      seen.add(lowerKey);
      result.push(normalized);
    }
  });

  return result;
}

export function importAiCaptureToNewVersion(
  process: Process,
  version: ProcessVersion,
  aiText: string,
  options?: AiImportOptions
): AiImportResult {
  const warnings: string[] = [];
  const mergeWithExisting = options?.mergeIntoExistingSidecar ?? true;
  const defaultEvidenceRefId = options?.defaultEvidenceRefId?.trim() || undefined;

  if (options?.additionalWarnings) {
    warnings.push(...options.additionalWarnings);
  }

  const aiData = extractJsonFromText(aiText);
  validateAiCapture(aiData);

  const enrichMode = options?.mergeStrategy === 'enrich_existing';

  const hpLen = aiData.happyPath.length;
  if (hpLen > 40) warnings.push(`Hinweis: Happy Path enthält ${hpLen} Schritte. Das ist zulässig, kann aber unübersichtlich werden. Erwägen Sie Unterprozesse.`);
  if (hpLen < 3) warnings.push(`Hinweis: Happy Path enthält nur ${hpLen} Schritt(e). Prüfen Sie, ob der End-to-End Ablauf vollständig ist.`);

  const roles = normalizeStrings(aiData.roles || []);
  const systems = normalizeStrings(aiData.systems || []);
  const dataObjects = normalizeStrings(aiData.dataObjects || []);

  const kpis: Array<{ name: string; definition: string; unit?: string; target?: string }> = [];
  (aiData.kpis || []).forEach((kpi) => {
    if (!kpi.name?.trim() || !kpi.definition?.trim()) {
      warnings.push(
        `KPI mit ungültigen Daten wurde übersprungen (name oder definition fehlt).`
      );
      return;
    }
    kpis.push({
      name: kpi.name.trim(),
      definition: kpi.definition.trim(),
      unit: kpi.unit?.trim(),
      target: kpi.target?.trim(),
    });
  });

  const existingHappyPath = version.sidecar.captureDraft?.happyPath ?? [];
  const hasManualHappyPath = mergeWithExisting && existingHappyPath.length > 0;

  let happyPath: CaptureDraftStep[];

  if (enrichMode && hasManualHappyPath) {
    const aiLen = aiData.happyPath.length;
    const manualLen = existingHappyPath.length;

    if (aiLen === manualLen) {
      happyPath = existingHappyPath.map((existing, index) => ({
        ...existing,
        order: index + 1,
      }));
    } else {
      if (Math.abs(aiLen - manualLen) > Math.max(2, Math.round(manualLen * 0.3))) {
        warnings.push(
          `enrich_existing: KI lieferte ${aiLen} Schritte, manuell sind ${manualLen} Schritte vorhanden. ` +
          `Manuelle Schritt-Reihenfolge bleibt führend. KI-Struktur in warnings dokumentiert.`
        );
      }
      happyPath = existingHappyPath.map((existing, index) => ({
        ...existing,
        order: index + 1,
      }));
    }
  } else {
    happyPath = aiData.happyPath.map((label, index) => ({
      stepId: crypto.randomUUID(),
      order: index + 1,
      label: label.trim(),
      status: 'derived' as const,
    }));
  }

  const stepIdByOrder = new Map<number, string>();
  happyPath.forEach((step) => {
    stepIdByOrder.set(step.order, step.stepId);
  });

  const roleMap = new Map<string, string>();
  const systemMap = new Map<string, string>();
  const dataObjectMap = new Map<string, string>();

  const sidecarRoles: ProcessRole[] = [];
  const sidecarSystems: ProcessSystem[] = [];
  const sidecarDataObjects: ProcessDataObject[] = [];
  const sidecarKpis: ProcessKPI[] = [];

  if (mergeWithExisting) {
    version.sidecar.roles.forEach((role) => {
      sidecarRoles.push({ ...role });
      roleMap.set(normalizeCatalogToken(role.name), role.id);
      (role.aliases || []).forEach((alias) => {
        roleMap.set(normalizeCatalogToken(alias), role.id);
      });
    });

    version.sidecar.systems.forEach((system) => {
      sidecarSystems.push({ ...system });
      systemMap.set(normalizeCatalogToken(system.name), system.id);
      (system.aliases || []).forEach((alias) => {
        systemMap.set(normalizeCatalogToken(alias), system.id);
      });
    });

    version.sidecar.dataObjects.forEach((dataObj) => {
      sidecarDataObjects.push({ ...dataObj });
      dataObjectMap.set(normalizeCatalogToken(dataObj.name), dataObj.id);
      (dataObj.aliases || []).forEach((alias) => {
        dataObjectMap.set(normalizeCatalogToken(alias), dataObj.id);
      });
    });

    version.sidecar.kpis.forEach((kpi) => {
      sidecarKpis.push({ ...kpi });
    });
  }

  roles.forEach((name) => {
    const key = normalizeCatalogToken(name);
    if (!roleMap.has(key)) {
      const id = crypto.randomUUID();
      roleMap.set(key, id);
      sidecarRoles.push({ id, name, kind: 'role' });
    }
  });

  systems.forEach((name) => {
    const key = normalizeCatalogToken(name);
    if (!systemMap.has(key)) {
      const id = crypto.randomUUID();
      systemMap.set(key, id);
      sidecarSystems.push({ id, name });
    }
  });

  dataObjects.forEach((name) => {
    const key = normalizeCatalogToken(name);
    if (!dataObjectMap.has(key)) {
      const id = crypto.randomUUID();
      dataObjectMap.set(key, id);
      sidecarDataObjects.push({ id, name, kind: 'document' });
    }
  });

  const kpiKeyMap = new Map<string, string>();
  sidecarKpis.forEach((kpi) => {
    kpiKeyMap.set(normalizeCatalogToken(kpi.name), kpi.id);
    (kpi.aliases || []).forEach((alias) => {
      kpiKeyMap.set(normalizeCatalogToken(alias), kpi.id);
    });
  });

  kpis.forEach((kpi) => {
    const key = normalizeCatalogToken(kpi.name);
    if (!kpiKeyMap.has(key)) {
      const id = crypto.randomUUID();
      sidecarKpis.push({
        id,
        name: kpi.name,
        definition: kpi.definition,
        unit: kpi.unit,
        target: kpi.target,
      });
      kpiKeyMap.set(key, id);
    }
  });

  const sidecarEvidenceSources: EvidenceSource[] = [];
  if (mergeWithExisting && version.sidecar.evidenceSources) {
    version.sidecar.evidenceSources.forEach((source) => {
      sidecarEvidenceSources.push({ ...source });
    });
  }

  const nowIso = new Date().toISOString();
  if (options?.evidenceSource) {
    const { refId, kind, language, text } = options.evidenceSource;
    const existing = sidecarEvidenceSources.find((s) => s.refId === refId);
    if (existing) {
      existing.text = text;
      existing.updatedAt = nowIso;
      if (language) existing.language = language;
    } else {
      sidecarEvidenceSources.push({
        refId,
        kind,
        language,
        text,
        createdAt: nowIso,
        updatedAt: nowIso,
      });
    }
  }

  const notes: import('../domain/process').AiImportNote[] = [];
  if (mergeWithExisting && version.sidecar.aiImportNotes) {
    notes.push(...structuredClone(version.sidecar.aiImportNotes));
  }

  const sourceRefId = options?.evidenceSource?.refId || defaultEvidenceRefId || 'unknown';
  const seenMessages = new Set<string>();

  notes.forEach(note => {
    const key = note.message.trim().toLowerCase().replace(/\s+/g, ' ');
    seenMessages.add(key);
  });

  function resolveRoleId(roleName: string | undefined): string | undefined {
    if (!roleName?.trim()) return undefined;
    const key = normalizeCatalogToken(roleName.trim());
    let id = roleMap.get(key);
    if (!id) {
      id = crypto.randomUUID();
      roleMap.set(key, id);
      sidecarRoles.push({ id, name: roleName.trim(), kind: 'role' });
      warnings.push(`Rolle "${roleName.trim()}" wurde automatisch ergänzt.`);
    }
    return id;
  }

  function resolveSystemId(systemName: string | undefined): string | undefined {
    if (!systemName?.trim()) return undefined;
    const key = normalizeCatalogToken(systemName.trim());
    let id = systemMap.get(key);
    if (!id) {
      id = crypto.randomUUID();
      systemMap.set(key, id);
      sidecarSystems.push({ id, name: systemName.trim() });
      warnings.push(`System "${systemName.trim()}" wurde automatisch ergänzt.`);
    }
    return id;
  }

  function resolveDataObjectIds(names: string[] | undefined): string[] {
    if (!names || !Array.isArray(names)) return [];
    return names
      .map((name) => {
        if (!name?.trim()) return undefined;
        const key = normalizeCatalogToken(name.trim());
        let id = dataObjectMap.get(key);
        if (!id) {
          id = crypto.randomUUID();
          dataObjectMap.set(key, id);
          sidecarDataObjects.push({ id, name: name.trim(), kind: 'document' });
          warnings.push(`Datenobjekt "${name.trim()}" wurde automatisch ergänzt.`);
        }
        return id;
      })
      .filter((id): id is string => !!id);
  }

  function attachTextEvidenceSnippet(opts: {
    target: { evidence?: EvidenceRef[] };
    rawSnippet: string;
    ctx: string;
    warnings: string[];
  }) {
    const raw = (opts.rawSnippet || '').trim();
    if (!raw) return;

    const normalized = raw.replace(/\s+/g, ' ').trim();
    const maxLen = 240;
    const snippet = normalized.length > maxLen ? normalized.slice(0, maxLen) + '…' : normalized;

    if (normalized.length > maxLen) {
      opts.warnings.push(`Evidence-Snippet (${opts.ctx}) wurde auf ${maxLen} Zeichen gekürzt.`);
    }

    const existing = (opts.target.evidence || [])
      .map((e) => (typeof e?.snippet === 'string' ? e.snippet.trim() : ''))
      .filter((s) => s.length > 0);

    if (!existing.includes(snippet)) {
      const evidenceRef: EvidenceRef = { type: 'text', snippet };
      if (defaultEvidenceRefId) {
        evidenceRef.refId = defaultEvidenceRefId;
      }
      const next: EvidenceRef[] = [
        ...(opts.target.evidence || []),
        evidenceRef,
      ];
      opts.target.evidence = next.slice(0, 2);
    }
  }

  (aiData.stepDetails || []).forEach((detail) => {
    if (!detail.step || detail.step < 1 || detail.step > happyPath.length) {
      warnings.push(
        `stepDetails für Schritt ${detail.step} ignoriert (ungültiger Index).`
      );
      return;
    }

    const step = happyPath[detail.step - 1];

    if (detail.role) {
      step.roleId = resolveRoleId(detail.role);
    }

    if (detail.system) {
      step.systemId = resolveSystemId(detail.system);
    }

    if (detail.workType) {
      const validWorkTypes: WorkType[] = [
        'manual',
        'user_task',
        'service_task',
        'ai_assisted',
        'unknown',
      ];
      if (validWorkTypes.includes(detail.workType as WorkType)) {
        step.workType = detail.workType as WorkType;
      } else {
        warnings.push(
          `Ungültiger workType "${detail.workType}" für Schritt ${detail.step} - wird ignoriert.`
        );
      }
    }

    if (detail.painPointHint?.trim()) {
      step.painPointHint = detail.painPointHint.trim();
    }

    if (detail.dataIn) {
      const ids = resolveDataObjectIds(detail.dataIn);
      if (ids.length > 0) {
        step.dataIn = ids;
      }
    }

    if (detail.dataOut) {
      const ids = resolveDataObjectIds(detail.dataOut);
      if (ids.length > 0) {
        step.dataOut = ids;
      }
    }

    if (detail.evidenceSnippet) {
      attachTextEvidenceSnippet({
        target: step,
        rawSnippet: detail.evidenceSnippet,
        ctx: `Schritt ${detail.step}`,
        warnings,
      });
    }
  });

  const decisions: CaptureDraftDecision[] = [];
  (aiData.decisions || []).forEach((dec) => {
    if (!dec.afterStep || dec.afterStep < 1 || dec.afterStep > happyPath.length) {
      warnings.push(
        `Entscheidung mit afterStep ${dec.afterStep} ignoriert (ungültiger Index).`
      );
      return;
    }

    const afterStepId = stepIdByOrder.get(dec.afterStep);
    if (!afterStepId) {
      warnings.push(`Entscheidung nach Schritt ${dec.afterStep} ignoriert (Step nicht gefunden).`);
      return;
    }

    const validBranches = dec.branches
      .map((branch) => {
        if (!branch.conditionLabel?.trim()) {
          warnings.push('Branch ohne conditionLabel wurde übersprungen.');
          return null;
        }

        if (branch.endsProcess) {
          return {
            branchId: crypto.randomUUID(),
            conditionLabel: branch.conditionLabel.trim(),
            endsProcess: true,
            notes: branch.notes?.trim(),
          };
        }

        if (branch.nextStep) {
          if (branch.nextStep < 1 || branch.nextStep > happyPath.length) {
            warnings.push(
              `Branch "${branch.conditionLabel}" verweist auf ungültigen Schritt ${branch.nextStep} - wird übersprungen.`
            );
            return null;
          }

          const nextStepId = stepIdByOrder.get(branch.nextStep);
          if (!nextStepId) {
            warnings.push(
              `Branch "${branch.conditionLabel}" verweist auf unbekannten Schritt ${branch.nextStep} - wird übersprungen.`
            );
            return null;
          }

          return {
            branchId: crypto.randomUUID(),
            conditionLabel: branch.conditionLabel.trim(),
            nextStepId,
            notes: branch.notes?.trim(),
          };
        }

        warnings.push(
          `Branch "${branch.conditionLabel}" hat weder nextStep noch endsProcess - wird übersprungen.`
        );
        return null;
      })
      .filter((b): b is NonNullable<typeof b> => b !== null);

    if (validBranches.length === 0) {
      warnings.push(
        `Entscheidung nach Schritt ${dec.afterStep} hat keine gültigen Branches - wird ignoriert.`
      );
      return;
    }

    const decision: CaptureDraftDecision = {
      decisionId: crypto.randomUUID(),
      afterStepId,
      gatewayType: dec.gatewayType || 'xor',
      question: dec.question?.trim() || '',
      branches: validBranches,
      status: 'derived',
    };

    if (dec.evidenceSnippet) {
      attachTextEvidenceSnippet({
        target: decision,
        rawSnippet: dec.evidenceSnippet,
        ctx: `Entscheidung nach Schritt ${dec.afterStep}`,
        warnings,
      });
    }

    decisions.push(decision);
  });

  const exceptions: CaptureDraftException[] = [];
  (aiData.exceptions || []).forEach((exc) => {
    if (!exc.description?.trim() || !exc.handling?.trim()) {
      warnings.push('Ausnahme ohne Beschreibung oder Handling wurde übersprungen.');
      return;
    }

    const validTypes: ExceptionType[] = [
      'missing_data',
      'timeout',
      'error',
      'cancellation',
      'compliance',
      'other',
    ];
    let exceptionType: ExceptionType = exc.type;

    if (!validTypes.includes(exceptionType)) {
      warnings.push(
        `Ungültiger Ausnahme-Typ "${exc.type}" - wird auf "other" gesetzt.`
      );
      exceptionType = 'other';
    }

    let relatedStepId: string | undefined;
    if (exc.relatedStep) {
      if (exc.relatedStep < 1 || exc.relatedStep > happyPath.length) {
        warnings.push(
          `Ausnahme verweist auf ungültigen Schritt ${exc.relatedStep} - relatedStepId wird nicht gesetzt.`
        );
      } else {
        relatedStepId = stepIdByOrder.get(exc.relatedStep);
        if (!relatedStepId) {
          warnings.push(
            `Ausnahme verweist auf unbekannten Schritt ${exc.relatedStep} - relatedStepId wird nicht gesetzt.`
          );
        }
      }
    }

    const ex: CaptureDraftException = {
      exceptionId: crypto.randomUUID(),
      type: exceptionType,
      description: exc.description.trim(),
      handling: exc.handling.trim(),
      relatedStepId,
      status: 'derived',
    };

    if (exc.evidenceSnippet) {
      attachTextEvidenceSnippet({
        target: ex,
        rawSnippet: exc.evidenceSnippet,
        ctx: `Ausnahme ${exceptionType}`,
        warnings,
      });
    }

    exceptions.push(ex);
  });

  const baseProgress = createInitialCaptureProgress();
  const phaseStates = { ...baseProgress.phaseStates };

  const existingE2E = version.endToEndDefinition;
  const mergedEndToEnd = enrichMode && existingE2E ? {
    trigger: existingE2E.trigger?.trim() || aiData.endToEnd.trigger.trim(),
    customer: existingE2E.customer?.trim() || aiData.endToEnd.customer.trim(),
    outcome: existingE2E.outcome?.trim() || aiData.endToEnd.outcome.trim(),
    doneCriteria: existingE2E.doneCriteria?.trim() || aiData.endToEnd.doneCriteria?.trim(),
  } : {
    trigger: aiData.endToEnd.trigger.trim(),
    customer: aiData.endToEnd.customer.trim(),
    outcome: aiData.endToEnd.outcome.trim(),
    doneCriteria: aiData.endToEnd.doneCriteria?.trim(),
  };

  const existingDecisions = enrichMode ? (version.sidecar.captureDraft?.decisions ?? []) : [];
  const existingExceptions = enrichMode ? (version.sidecar.captureDraft?.exceptions ?? []) : [];

  const mergedDecisions = enrichMode
    ? mergeDecisions(existingDecisions, decisions, warnings)
    : decisions;

  const mergedExceptions = enrichMode
    ? mergeExceptions(existingExceptions, exceptions)
    : exceptions;

  const workingVersionCandidate: ProcessVersion = {
    ...version,
    endToEndDefinition: mergedEndToEnd,
    sidecar: {
      roles: sidecarRoles,
      systems: sidecarSystems,
      dataObjects: sidecarDataObjects,
      kpis: sidecarKpis,
      captureDraft: {
        draftVersion: 'capture-draft-v1',
        happyPath,
        decisions: mergedDecisions,
        exceptions: mergedExceptions,
      },
      aiReadinessSignals: aiData.aiReadinessSignals,
    },
    quality: {
      syntaxFindings: [],
      semanticQuestions: [],
      namingFindings: [],
    },
    captureProgress: {
      phaseStates,
      lastTouchedAt: nowIso,
    },
  };

  const quality = generateQualityFindings(process, workingVersionCandidate);

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

  phases.forEach((phaseId) => {
    const status = getPhaseAnswerStatus(process, workingVersionCandidate, phaseId);

    let phaseState: CapturePhaseState = 'not_started';
    if (!status.requiredAnswered) {
      phaseState = 'not_started';
    } else if (status.optionalUnanswered) {
      phaseState = 'in_progress';
    } else {
      phaseState = 'done';
    }

    phaseStates[phaseId] = phaseState;
  });

  const captureProgress: CaptureProgress = {
    phaseStates,
    lastTouchedAt: nowIso,
  };

  if (aiData.notes && aiData.notes.length > 0) {
    aiData.notes.forEach(msg => warnings.push(`Hinweise aus AI: ${msg}`));
  }

  if (aiData.assumptions && aiData.assumptions.length > 0) {
    aiData.assumptions.forEach(msg => warnings.push(`Annahmen aus AI: ${msg}`));
  }

  if (aiData.warnings && aiData.warnings.length > 0) {
    aiData.warnings.forEach((w) => warnings.push(`AI-Warnung: ${w}`));
  }

  warnings.forEach(msg => {
    const normalizedMsg = msg.trim().toLowerCase().replace(/\s+/g, ' ');
    if (!seenMessages.has(normalizedMsg)) {
      seenMessages.add(normalizedMsg);
      notes.push({
        id: crypto.randomUUID(),
        severity: 'warn',
        message: msg,
        sourceRefId,
        createdAt: nowIso,
      });
    }
  });

  const versionInput: CreateVersionInput = {
    titleSnapshot: process.title,
    status: 'draft',
    endToEndDefinition: workingVersionCandidate.endToEndDefinition,
    sidecar: {
      roles: sidecarRoles,
      systems: sidecarSystems,
      dataObjects: sidecarDataObjects,
      kpis: sidecarKpis,
      captureDraft: {
        draftVersion: 'capture-draft-v1',
        happyPath,
        decisions: mergedDecisions,
        exceptions: mergedExceptions,
      },
      aiReadinessSignals: aiData.aiReadinessSignals,
      evidenceSources: sidecarEvidenceSources,
      aiImportNotes: notes,
    },
    quality,
    captureProgress,
  };

  return {
    versionInput,
    warnings,
  };
}

function mergeDecisions(
  existing: import('../domain/capture').CaptureDraftDecision[],
  incoming: import('../domain/capture').CaptureDraftDecision[],
  warnings: string[]
): import('../domain/capture').CaptureDraftDecision[] {
  if (existing.length === 0) return incoming;
  if (incoming.length === 0) return existing;

  const result = [...existing];
  const existingQuestions = new Set(existing.map(d => d.question.trim().toLowerCase()));

  incoming.forEach(d => {
    const key = d.question.trim().toLowerCase();
    if (!existingQuestions.has(key)) {
      const afterStepUsed = existing.some(e => e.afterStepId === d.afterStepId);
      if (afterStepUsed) {
        warnings.push(
          `enrich_existing: KI-Entscheidung "${d.question}" konnte nicht eindeutig einem Schritt zugeordnet werden – als neue Entscheidung ergänzt.`
        );
      }
      result.push(d);
    }
  });

  return result;
}

function mergeExceptions(
  existing: import('../domain/capture').CaptureDraftException[],
  incoming: import('../domain/capture').CaptureDraftException[]
): import('../domain/capture').CaptureDraftException[] {
  if (existing.length === 0) return incoming;
  if (incoming.length === 0) return existing;

  const result = [...existing];
  const existingDescs = new Set(existing.map(e => e.description.trim().toLowerCase()));

  incoming.forEach(ex => {
    const key = ex.description.trim().toLowerCase();
    if (!existingDescs.has(key)) {
      result.push(ex);
    }
  });

  return result;
}
