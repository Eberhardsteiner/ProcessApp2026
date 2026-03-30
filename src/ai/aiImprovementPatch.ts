import type { AiImprovementPatchV1 } from './aiImprovementTypes';
import type {
  ImprovementCategory,
  ImprovementScope,
  ImprovementStatus,
  Level3,
  AutomationApproach,
  AutomationLevel,
  ControlType,
} from '../domain/process';

export function extractJsonFromText(text: string): unknown {
  let cleaned = text.trim();

  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.replace(/^```json\s*/, '');
  }
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```\s*/, '');
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.replace(/\s*```$/, '');
  }

  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');

  if (firstBrace === -1 || lastBrace === -1 || firstBrace > lastBrace) {
    throw new Error('Kein gültiges JSON gefunden. Bitte nur das JSON aus der Claude-Antwort einfügen.');
  }

  const jsonStr = cleaned.substring(firstBrace, lastBrace + 1);

  try {
    return JSON.parse(jsonStr);
  } catch {
    throw new Error('JSON konnte nicht geparst werden. Häufige Ursache: doppelte Anführungszeichen (") innerhalb von Textfeldern (title/description) sind nicht escaped. Bitte im Text keine " verwenden oder durch „…" ersetzen.');
  }
}

export function parseAiImprovementPatch(text: string): AiImprovementPatchV1 {
  const parsed = extractJsonFromText(text);

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('JSON ist kein Objekt.');
  }

  const obj = parsed as Record<string, unknown>;

  if (obj.schemaVersion !== 'ai-improvement-v1') {
    throw new Error('Ungültige schemaVersion. Erwartet: "ai-improvement-v1"');
  }

  if (obj.language !== 'de') {
    throw new Error('Ungültige Sprache. Erwartet: "de"');
  }

  if (typeof obj.itemId !== 'string' || obj.itemId.trim() === '') {
    throw new Error('itemId fehlt oder ist ungültig.');
  }

  if (typeof obj.patch !== 'object' || obj.patch === null) {
    throw new Error('patch-Objekt fehlt oder ist ungültig.');
  }

  return parsed as AiImprovementPatchV1;
}

const VALID_CATEGORIES: ImprovementCategory[] = [
  'standardize',
  'digitize',
  'automate',
  'ai',
  'data',
  'governance',
  'customer',
  'compliance',
  'kpi',
];

const VALID_SCOPES: ImprovementScope[] = ['process', 'step'];

const VALID_STATUSES: ImprovementStatus[] = ['idea', 'planned', 'in_progress', 'done', 'discarded'];

const VALID_LEVELS: Level3[] = ['low', 'medium', 'high'];

const VALID_APPROACHES: AutomationApproach[] = [
  'workflow',
  'rpa',
  'api_integration',
  'erp_config',
  'low_code',
  'ai_assistant',
  'ai_document_processing',
  'ai_classification',
  'process_mining',
  'other',
];

const VALID_AUTOMATION_LEVELS: AutomationLevel[] = ['assist', 'partial', 'straight_through'];

const VALID_CONTROLS: ControlType[] = [
  'audit_trail',
  'approval',
  'monitoring',
  'data_privacy',
  'fallback_manual',
];

export function validateAndNormalizePatch(input: {
  patch: AiImprovementPatchV1;
  allowed: {
    systemIds: Set<string>;
    dataObjectIds: Set<string>;
    kpiIds: Set<string>;
    stepIds: Set<string>;
  };
}): { normalized: AiImprovementPatchV1; warnings: string[] } {
  const { patch, allowed } = input;
  const warnings: string[] = [];
  const normalized = JSON.parse(JSON.stringify(patch)) as AiImprovementPatchV1;

  if (normalized.patch.category && !VALID_CATEGORIES.includes(normalized.patch.category)) {
    warnings.push(`Ungültige Kategorie "${normalized.patch.category}" wurde entfernt.`);
    delete normalized.patch.category;
  }

  if (normalized.patch.scope && !VALID_SCOPES.includes(normalized.patch.scope)) {
    warnings.push(`Ungültiger Scope "${normalized.patch.scope}" wurde entfernt.`);
    delete normalized.patch.scope;
  }

  if (normalized.patch.status && !VALID_STATUSES.includes(normalized.patch.status)) {
    warnings.push(`Ungültiger Status "${normalized.patch.status}" wurde entfernt.`);
    delete normalized.patch.status;
  }

  if (normalized.patch.impact && !VALID_LEVELS.includes(normalized.patch.impact)) {
    warnings.push(`Ungültiger Impact "${normalized.patch.impact}" wurde entfernt.`);
    delete normalized.patch.impact;
  }

  if (normalized.patch.effort && !VALID_LEVELS.includes(normalized.patch.effort)) {
    warnings.push(`Ungültiger Effort "${normalized.patch.effort}" wurde entfernt.`);
    delete normalized.patch.effort;
  }

  if (normalized.patch.risk && !VALID_LEVELS.includes(normalized.patch.risk)) {
    warnings.push(`Ungültiges Risiko "${normalized.patch.risk}" wurde entfernt.`);
    delete normalized.patch.risk;
  }

  if (normalized.patch.relatedStepId) {
    const isRelatedStepIdValid = allowed.stepIds.has(normalized.patch.relatedStepId);

    if (normalized.patch.scope === 'process') {
      warnings.push('relatedStepId wurde entfernt, da scope="process" ist.');
      delete normalized.patch.relatedStepId;
    } else if (normalized.patch.scope === 'step') {
      if (!isRelatedStepIdValid) {
        warnings.push(`Unbekannte Schritt-ID "${normalized.patch.relatedStepId}" wurde entfernt und scope-Änderung verworfen.`);
        delete normalized.patch.relatedStepId;
        delete normalized.patch.scope;
      }
    } else {
      if (isRelatedStepIdValid) {
        warnings.push('relatedStepId war gesetzt, aber scope fehlte. scope wurde auf "step" gesetzt.');
        normalized.patch.scope = 'step';
      } else {
        warnings.push(`Unbekannte Schritt-ID "${normalized.patch.relatedStepId}" wurde entfernt.`);
        delete normalized.patch.relatedStepId;
      }
    }
  } else if (normalized.patch.scope === 'step') {
    warnings.push('scope="step" wurde ignoriert, weil relatedStepId fehlt.');
    delete normalized.patch.scope;
  }

  const blueprint = normalized.patch.automationBlueprint;
  if (blueprint) {
    if (!blueprint.approach || !VALID_APPROACHES.includes(blueprint.approach)) {
      warnings.push('automationBlueprint.approach war ungültig oder fehlte und wurde auf "other" gesetzt.');
      blueprint.approach = 'other';
    }

    if (!blueprint.level || !VALID_AUTOMATION_LEVELS.includes(blueprint.level)) {
      warnings.push('automationBlueprint.level war ungültig oder fehlte und wurde auf "partial" gesetzt.');
      blueprint.level = 'partial';
    }

    if (typeof blueprint.humanInTheLoop !== 'boolean') {
      const defaultHumanInLoop = blueprint.approach === 'ai_assistant' ||
        blueprint.approach === 'ai_document_processing' ||
        blueprint.approach === 'ai_classification';
      blueprint.humanInTheLoop = defaultHumanInLoop;
      warnings.push('automationBlueprint.humanInTheLoop fehlte/war ungültig und wurde auf Default gesetzt.');
    }

    if (blueprint.systemIds !== undefined) {
      if (!Array.isArray(blueprint.systemIds)) {
        warnings.push('systemIds war kein Array und wurde entfernt.');
        delete blueprint.systemIds;
      } else {
        const validSystemIds = blueprint.systemIds.filter((id) => allowed.systemIds.has(id));
        const invalidSystemIds = blueprint.systemIds.filter((id) => !allowed.systemIds.has(id));

        if (invalidSystemIds.length > 0) {
          warnings.push(`Unbekannte System-IDs wurden entfernt: ${invalidSystemIds.join(', ')}`);
        }

        blueprint.systemIds = validSystemIds;
      }
    }

    if (blueprint.dataObjectIds !== undefined) {
      if (!Array.isArray(blueprint.dataObjectIds)) {
        warnings.push('dataObjectIds war kein Array und wurde entfernt.');
        delete blueprint.dataObjectIds;
      } else {
        const validDataObjectIds = blueprint.dataObjectIds.filter((id) => allowed.dataObjectIds.has(id));
        const invalidDataObjectIds = blueprint.dataObjectIds.filter((id) => !allowed.dataObjectIds.has(id));

        if (invalidDataObjectIds.length > 0) {
          warnings.push(`Unbekannte Datenobjekt-IDs wurden entfernt: ${invalidDataObjectIds.join(', ')}`);
        }

        blueprint.dataObjectIds = validDataObjectIds;
      }
    }

    if (blueprint.kpiIds !== undefined) {
      if (!Array.isArray(blueprint.kpiIds)) {
        warnings.push('kpiIds war kein Array und wurde entfernt.');
        delete blueprint.kpiIds;
      } else {
        const validKpiIds = blueprint.kpiIds.filter((id) => allowed.kpiIds.has(id));
        const invalidKpiIds = blueprint.kpiIds.filter((id) => !allowed.kpiIds.has(id));

        if (invalidKpiIds.length > 0) {
          warnings.push(`Unbekannte KPI-IDs wurden entfernt: ${invalidKpiIds.join(', ')}`);
        }

        blueprint.kpiIds = validKpiIds;
      }
    }

    if (blueprint.controls !== undefined) {
      if (!Array.isArray(blueprint.controls)) {
        warnings.push('controls war kein Array und wurde entfernt.');
        delete blueprint.controls;
      } else {
        const validControls = blueprint.controls.filter((c) => VALID_CONTROLS.includes(c));
        const invalidControls = blueprint.controls.filter((c) => !VALID_CONTROLS.includes(c));

        if (invalidControls.length > 0) {
          warnings.push(`Unbekannte Kontrollen wurden entfernt: ${invalidControls.join(', ')}`);
        }

        blueprint.controls = validControls;
      }
    }
  }

  return { normalized, warnings };
}
