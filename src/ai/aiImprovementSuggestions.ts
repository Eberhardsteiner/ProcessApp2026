import { extractJsonFromText } from './aiImprovementPatch';
import type { AiImprovementSuggestionsV1, AiImprovementSuggestionV1 } from './aiImprovementTypes';
import type {
  ImprovementCategory,
  ImprovementScope,
  ImprovementStatus,
  Level3,
  AutomationApproach,
  AutomationLevel,
  ControlType,
} from '../domain/process';

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

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function normalizeStringArray(
  value: unknown,
  label: string,
  warnings: string[],
  ctx: string
): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    warnings.push(`${ctx}: ${label} war kein Array und wurde entfernt.`);
    return undefined;
  }
  const filtered = value.filter((x) => typeof x === 'string' && x.trim().length > 0).map((x) => (x as string).trim());
  if (filtered.length !== value.length) {
    warnings.push(`${ctx}: ${label} enthielt ungültige Einträge und wurde bereinigt.`);
  }
  return filtered;
}

function filterAllowedIds(
  value: unknown,
  label: string,
  allowed: Set<string>,
  warnings: string[],
  ctx: string
): string[] | undefined {
  const arr = normalizeStringArray(value, label, warnings, ctx);
  if (!arr) return arr;

  const valid = arr.filter((id) => allowed.has(id));
  const invalid = arr.filter((id) => !allowed.has(id));

  if (invalid.length > 0) {
    warnings.push(`${ctx}: Unbekannte ${label} wurden entfernt: ${invalid.join(', ')}`);
  }

  return valid;
}

export function parseAiImprovementSuggestions(text: string): AiImprovementSuggestionsV1 {
  const parsed = extractJsonFromText(text);

  if (!isRecord(parsed)) {
    throw new Error('JSON ist kein Objekt.');
  }

  if (parsed.schemaVersion !== 'ai-improvement-suggestions-v1') {
    throw new Error('Ungültige schemaVersion. Erwartet: "ai-improvement-suggestions-v1"');
  }

  if (parsed.language !== 'de') {
    throw new Error('Ungültige Sprache. Erwartet: "de"');
  }

  if (!Array.isArray(parsed.suggestions)) {
    throw new Error('suggestions fehlt oder ist kein Array.');
  }

  return parsed as unknown as AiImprovementSuggestionsV1;
}

export function validateAndNormalizeSuggestions(input: {
  result: AiImprovementSuggestionsV1;
  allowed: {
    systemIds: Set<string>;
    dataObjectIds: Set<string>;
    kpiIds: Set<string>;
    stepIds: Set<string>;
  };
}): { normalized: AiImprovementSuggestionsV1; warnings: string[] } {
  const { result, allowed } = input;
  const warnings: string[] = [];

  const normalized = JSON.parse(JSON.stringify(result)) as AiImprovementSuggestionsV1;

  if (normalized.assumptions !== undefined && !Array.isArray(normalized.assumptions)) {
    warnings.push('assumptions war kein Array und wurde entfernt.');
    delete normalized.assumptions;
  } else if (Array.isArray(normalized.assumptions)) {
    normalized.assumptions = normalized.assumptions.filter((x) => typeof x === 'string' && x.trim().length > 0);
  }

  if (normalized.warnings !== undefined && !Array.isArray(normalized.warnings)) {
    warnings.push('warnings (root) war kein Array und wurde entfernt.');
    delete normalized.warnings;
  } else if (Array.isArray(normalized.warnings)) {
    normalized.warnings = normalized.warnings.filter((x) => typeof x === 'string' && x.trim().length > 0);
  }

  const out: AiImprovementSuggestionV1[] = [];

  const rawList = Array.isArray(normalized.suggestions) ? normalized.suggestions : [];
  rawList.forEach((raw, idx) => {
    const ctx = `Vorschlag ${idx + 1}`;

    if (!isRecord(raw)) {
      warnings.push(`${ctx}: war kein Objekt und wurde entfernt.`);
      return;
    }

    if (!isNonEmptyString(raw.title)) {
      warnings.push(`${ctx}: title fehlt/ist ungültig und wurde entfernt.`);
      return;
    }

    const s = raw as unknown as AiImprovementSuggestionV1;
    s.title = s.title.trim();

    if (s.description !== undefined && typeof s.description !== 'string') {
      warnings.push(`${ctx} ("${s.title}"): description war kein String und wurde entfernt.`);
      delete (s as Partial<AiImprovementSuggestionV1>).description;
    } else if (typeof s.description === 'string') {
      s.description = s.description.trim();
      if (s.description.length === 0) delete (s as Partial<AiImprovementSuggestionV1>).description;
    }

    const allowedSuggestionKeys = new Set([
      'title','description','category','scope','relatedStepId',
      'impact','effort','risk','owner','dueDate','status','automationBlueprint'
    ]);

    Object.keys(s as unknown as Record<string, unknown>).forEach((k) => {
      if (!allowedSuggestionKeys.has(k)) {
        warnings.push(`${ctx} ("${s.title}"): Feld "${k}" ist im Schema nicht erlaubt und wurde entfernt.`);
        delete (s as unknown as Record<string, unknown>)[k];
      }
    });

    if (!VALID_CATEGORIES.includes(s.category)) {
      warnings.push(`${ctx} ("${s.title}"): ungültige category "${String((s as Partial<AiImprovementSuggestionV1>).category)}" -> auf "automate" gesetzt.`);
      s.category = 'automate';
    }

    if (!VALID_LEVELS.includes(s.impact)) {
      warnings.push(`${ctx} ("${s.title}"): ungültiger impact -> auf "medium" gesetzt.`);
      s.impact = 'medium';
    }
    if (!VALID_LEVELS.includes(s.effort)) {
      warnings.push(`${ctx} ("${s.title}"): ungültiger effort -> auf "medium" gesetzt.`);
      s.effort = 'medium';
    }
    if (!VALID_LEVELS.includes(s.risk)) {
      warnings.push(`${ctx} ("${s.title}"): ungültiges risk -> auf "medium" gesetzt.`);
      s.risk = 'medium';
    }

    if (!s.status || !VALID_STATUSES.includes(s.status)) {
      if (s.status !== undefined) {
        warnings.push(`${ctx} ("${s.title}"): ungültiger status -> auf "idea" gesetzt.`);
      }
      s.status = 'idea';
    }

    if (s.owner !== undefined && typeof s.owner !== 'string') {
      warnings.push(`${ctx} ("${s.title}"): owner war kein String und wurde entfernt.`);
      delete (s as Partial<AiImprovementSuggestionV1>).owner;
    }
    if (s.dueDate !== undefined && typeof s.dueDate !== 'string') {
      warnings.push(`${ctx} ("${s.title}"): dueDate war kein String und wurde entfernt.`);
      delete (s as Partial<AiImprovementSuggestionV1>).dueDate;
    }

    const hasRelatedStepId = typeof s.relatedStepId === 'string' && s.relatedStepId.trim().length > 0;
    const relatedStepValid = hasRelatedStepId ? allowed.stepIds.has(s.relatedStepId!) : false;

    const scopeValid = VALID_SCOPES.includes(s.scope as ImprovementScope);

    if (scopeValid && s.scope === 'step') {
      if (!relatedStepValid) {
        warnings.push(`${ctx} ("${s.title}"): scope="step" aber relatedStepId fehlt/ungültig -> scope auf "process" gesetzt.`);
        s.scope = 'process';
        delete (s as Partial<AiImprovementSuggestionV1>).relatedStepId;
      }
    } else if (scopeValid && s.scope === 'process') {
      if (hasRelatedStepId) {
        warnings.push(`${ctx} ("${s.title}"): relatedStepId entfernt, da scope="process" ist.`);
        delete (s as Partial<AiImprovementSuggestionV1>).relatedStepId;
      }
    } else {
      if (relatedStepValid) {
        warnings.push(`${ctx} ("${s.title}"): relatedStepId war gesetzt und gültig, scope fehlte/war ungültig -> scope auf "step" gesetzt.`);
        s.scope = 'step';
      } else {
        if (hasRelatedStepId && !relatedStepValid) {
          warnings.push(`${ctx} ("${s.title}"): unbekannte relatedStepId "${s.relatedStepId}" wurde entfernt.`);
          delete (s as Partial<AiImprovementSuggestionV1>).relatedStepId;
        }
        warnings.push(`${ctx} ("${s.title}"): ungültiger/fehlender scope -> auf "process" gesetzt.`);
        s.scope = 'process';
      }
    }

    const isAuto = s.category === 'automate' || s.category === 'ai';

    if (!isAuto) {
      if (s.automationBlueprint !== undefined) {
        warnings.push(`${ctx} ("${s.title}"): automationBlueprint entfernt (category ist nicht automate/ai).`);
        delete (s as Partial<AiImprovementSuggestionV1>).automationBlueprint;
      }
    } else {
      if (!s.automationBlueprint || typeof s.automationBlueprint !== 'object') {
        warnings.push(`${ctx} ("${s.title}"): automationBlueprint fehlte/war ungültig -> Default gesetzt.`);
        s.automationBlueprint =
          s.category === 'ai'
            ? {
                approach: 'ai_assistant',
                level: 'assist',
                humanInTheLoop: true,
                controls: ['audit_trail', 'data_privacy', 'fallback_manual'],
              }
            : {
                approach: 'workflow',
                level: 'partial',
                humanInTheLoop: false,
                controls: ['audit_trail', 'monitoring'],
              };
      }

      const bp = s.automationBlueprint as Record<string, unknown>;

      if (!bp.approach || !VALID_APPROACHES.includes(bp.approach as AutomationApproach)) {
        const def = s.category === 'ai' ? 'ai_assistant' : 'workflow';
        warnings.push(`${ctx} ("${s.title}"): automationBlueprint.approach fehlte/war ungültig -> auf "${def}" gesetzt.`);
        bp.approach = def;
      }

      if (!bp.level || !VALID_AUTOMATION_LEVELS.includes(bp.level as AutomationLevel)) {
        const def = s.category === 'ai' ? 'assist' : 'partial';
        warnings.push(`${ctx} ("${s.title}"): automationBlueprint.level fehlte/war ungültig -> auf "${def}" gesetzt.`);
        bp.level = def;
      }

      if (typeof bp.humanInTheLoop !== 'boolean') {
        const def = s.category === 'ai';
        warnings.push(`${ctx} ("${s.title}"): automationBlueprint.humanInTheLoop fehlte/war ungültig -> auf "${def}" gesetzt.`);
        bp.humanInTheLoop = def;
      }

      if (bp.systemIds !== undefined) {
        bp.systemIds = filterAllowedIds(bp.systemIds, 'systemIds', allowed.systemIds, warnings, `${ctx} ("${s.title}")`);
      }
      if (bp.dataObjectIds !== undefined) {
        bp.dataObjectIds = filterAllowedIds(bp.dataObjectIds, 'dataObjectIds', allowed.dataObjectIds, warnings, `${ctx} ("${s.title}")`);
      }
      if (bp.kpiIds !== undefined) {
        bp.kpiIds = filterAllowedIds(bp.kpiIds, 'kpiIds', allowed.kpiIds, warnings, `${ctx} ("${s.title}")`);
      }

      if (bp.controls !== undefined) {
        const arr = normalizeStringArray(bp.controls, 'controls', warnings, `${ctx} ("${s.title}")`);
        if (arr) {
          const valid = arr.filter((c) => VALID_CONTROLS.includes(c as ControlType)) as ControlType[];
          const invalid = arr.filter((c) => !VALID_CONTROLS.includes(c as ControlType));
          if (invalid.length > 0) {
            warnings.push(`${ctx} ("${s.title}"): unbekannte controls entfernt: ${invalid.join(', ')}`);
          }
          bp.controls = valid;
        } else {
          delete bp.controls;
        }
      }

      if (bp.notes !== undefined && typeof bp.notes !== 'string') {
        warnings.push(`${ctx} ("${s.title}"): automationBlueprint.notes war kein String und wurde entfernt.`);
        delete bp.notes;
      }

      const allowedBpKeys = new Set(['approach','level','humanInTheLoop','systemIds','dataObjectIds','kpiIds','controls','notes']);
      Object.keys(bp).forEach((k) => {
        if (!allowedBpKeys.has(k)) {
          warnings.push(`${ctx} ("${s.title}"): automationBlueprint Feld "${k}" entfernt (nicht erlaubt).`);
          delete (bp as Record<string, unknown>)[k];
        }
      });
    }

    out.push(s);
  });

  if (out.length > 15) {
    warnings.push(`suggestions hatte ${out.length} Einträge und wurde auf 15 gekürzt.`);
    normalized.suggestions = out.slice(0, 15);
  } else {
    normalized.suggestions = out;
  }

  if (normalized.suggestions.length < 8) {
    warnings.push(`Hinweis: suggestions enthält nur ${normalized.suggestions.length} Einträge (empfohlen: 8–15).`);
  }

  return { normalized, warnings };
}
