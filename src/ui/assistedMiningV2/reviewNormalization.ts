import type {
  ProcessMiningNormalizationRule,
  ProcessMiningObservation,
} from '../../domain/process';
import { normalizeLabel, normalizeWhitespace, sentenceCase } from './pmShared';
import { canonicalizeProcessStepLabel, stepSemanticKey } from './semanticStepFamilies';

export interface NormalizationVariant {
  value: string;
  count: number;
}

export interface ReviewNormalizationGroup {
  id: string;
  kind: ProcessMiningNormalizationRule['kind'];
  key: string;
  label: string;
  note: string;
  suggestedValue: string;
  variants: NormalizationVariant[];
  observationIds: string[];
  activeRule?: ProcessMiningNormalizationRule;
}

const ROLE_CANONICALS: Array<{ key: string; label: string; patterns: RegExp[] }> = [
  { key: 'role:servicekoordination', label: 'Servicekoordination', patterns: [/servicekoordination/i, /servicekoordinator(?:in)?/i, /service coordinator/i] },
  { key: 'role:qualitaetsmanagement', label: 'Qualitätsmanagement', patterns: [/qualit[aä]tsmanagement/i, /\bqm\b/i, /quality management/i] },
  { key: 'role:technik', label: 'Technik', patterns: [/\btechnik\b/i, /technischer dienst/i, /engineering/i, /service technik/i] },
  { key: 'role:vertrieb', label: 'Vertrieb', patterns: [/\bvertrieb\b/i, /key account/i, /sales/i] },
  { key: 'role:logistik', label: 'Logistik', patterns: [/\blogistik\b/i, /versand/i, /shipping/i] },
  { key: 'role:teamleitung', label: 'Teamleitung', patterns: [/teamleitung/i, /team lead/i, /leitung/i] },
];

const SYSTEM_CANONICALS: Array<{ key: string; label: string; patterns: RegExp[] }> = [
  { key: 'system:crm', label: 'CRM', patterns: [/\bcrm\b/i, /salesforce/i, /hubspot/i] },
  { key: 'system:erp', label: 'ERP', patterns: [/\berp\b/i, /sap/i] },
  { key: 'system:dms', label: 'DMS', patterns: [/\bdms\b/i, /dokumentenmanagement/i, /document management/i] },
  { key: 'system:email', label: 'E-Mail', patterns: [/e-?mail/i, /outlook/i, /mailbox/i] },
  { key: 'system:ticketsystem', label: 'Ticketsystem', patterns: [/ticket ?system/i, /servicenow/i, /jira/i, /\bticket\b/i] },
  { key: 'system:monitoring', label: 'Monitoring / Leitstand', patterns: [/monitoring/i, /leitstand/i, /dashboard/i] },
];

function countVariants(values: string[]): NormalizationVariant[] {
  const counts = new Map<string, number>();
  values.forEach(value => {
    const cleaned = normalizeWhitespace(value);
    if (!cleaned) return;
    counts.set(cleaned, (counts.get(cleaned) ?? 0) + 1);
  });
  return Array.from(counts.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

function buildLookup<T extends { key: string; label: string; patterns: RegExp[] }>(
  value: string,
  definitions: T[],
): { key: string; label: string } | null {
  const trimmed = normalizeWhitespace(value);
  if (!trimmed) return null;
  for (const definition of definitions) {
    if (definition.patterns.some(pattern => pattern.test(trimmed))) {
      return { key: definition.key, label: definition.label };
    }
  }
  return null;
}

export function roleNormalizationKey(value: string): string {
  const alias = buildLookup(value, ROLE_CANONICALS);
  if (alias) return alias.key;
  return `role:${normalizeLabel(value).replace(/[^a-z0-9äöüß]+/g, '-')}`;
}

export function rolePreferredValue(value: string): string {
  const alias = buildLookup(value, ROLE_CANONICALS);
  if (alias) return alias.label;
  return sentenceCase(normalizeWhitespace(value));
}

export function systemNormalizationKey(value: string): string {
  const alias = buildLookup(value, SYSTEM_CANONICALS);
  if (alias) return alias.key;
  return `system:${normalizeLabel(value).replace(/[^a-z0-9äöüß]+/g, '-')}`;
}

export function systemPreferredValue(value: string): string {
  const alias = buildLookup(value, SYSTEM_CANONICALS);
  if (alias) return alias.label;
  return sentenceCase(normalizeWhitespace(value));
}

export function stepNormalizationKey(value: string): string {
  return stepSemanticKey(value);
}

export function stepPreferredValue(value: string): string {
  return canonicalizeProcessStepLabel({ title: value, fallback: value });
}

function buildRuleMap(rules: ProcessMiningNormalizationRule[] | undefined) {
  const map = new Map<string, ProcessMiningNormalizationRule>();
  (rules ?? []).forEach(rule => {
    map.set(`${rule.kind}:${rule.key}`, rule);
  });
  return map;
}

export function buildReviewNormalizationGroups(params: {
  observations: ProcessMiningObservation[];
  rules?: ProcessMiningNormalizationRule[];
}): ReviewNormalizationGroup[] {
  const ruleMap = buildRuleMap(params.rules);
  const groups = new Map<string, {
    kind: ProcessMiningNormalizationRule['kind'];
    key: string;
    label: string;
    note: string;
    suggestedValue: string;
    values: string[];
    observationIds: string[];
  }>();

  const register = (
    kind: ProcessMiningNormalizationRule['kind'],
    key: string,
    currentValue: string,
    suggestedValue: string,
    note: string,
    observationId: string,
  ) => {
    const compositeKey = `${kind}:${key}`;
    const existing = groups.get(compositeKey);
    if (existing) {
      existing.values.push(currentValue);
      existing.observationIds.push(observationId);
      return;
    }
    groups.set(compositeKey, {
      kind,
      key,
      label:
        kind === 'step'
          ? 'Schrittbezeichnungen vereinheitlichen'
          : kind === 'role'
          ? 'Rollenbezeichnungen vereinheitlichen'
          : 'Systembezeichnungen vereinheitlichen',
      note,
      suggestedValue,
      values: [currentValue],
      observationIds: [observationId],
    });
  };

  params.observations.forEach(observation => {
    if (observation.kind === 'step') {
      register(
        'step',
        stepNormalizationKey(observation.label),
        observation.label,
        stepPreferredValue(observation.label),
        'Gleicher Prozessschritt wird in mehreren Varianten beschrieben.',
        observation.id,
      );
    }
    if (observation.role) {
      register(
        'role',
        roleNormalizationKey(observation.role),
        observation.role,
        rolePreferredValue(observation.role),
        'Eine einheitliche Rollenbezeichnung verbessert Verantwortungs- und Übergabeanalysen.',
        observation.id,
      );
    }
    if (observation.system) {
      register(
        'system',
        systemNormalizationKey(observation.system),
        observation.system,
        systemPreferredValue(observation.system),
        'Konsistente Systemnamen machen Suchaufwand und Medienbrüche sichtbarer.',
        observation.id,
      );
    }
  });

  return Array.from(groups.entries())
    .map(([compositeKey, group]) => {
      const variants = countVariants(group.values);
      const activeRule = ruleMap.get(compositeKey);
      return {
        id: compositeKey,
        kind: group.kind,
        key: group.key,
        label: group.label,
        note: group.note,
        suggestedValue: activeRule?.preferredValue ?? group.suggestedValue,
        variants,
        observationIds: Array.from(new Set(group.observationIds)),
        activeRule,
      } satisfies ReviewNormalizationGroup;
    })
    .filter(group => group.variants.length > 1 || Boolean(group.activeRule))
    .sort((a, b) => {
      const order = { step: 0, role: 1, system: 2 } as const;
      const diff = order[a.kind] - order[b.kind];
      if (diff !== 0) return diff;
      const countA = a.variants.reduce((sum, variant) => sum + variant.count, 0);
      const countB = b.variants.reduce((sum, variant) => sum + variant.count, 0);
      return countB - countA;
    });
}

function observationMatchesRule(observation: ProcessMiningObservation, rule: ProcessMiningNormalizationRule): boolean {
  if (rule.kind === 'step') {
    return observation.kind === 'step' && stepNormalizationKey(observation.label) === rule.key;
  }
  if (rule.kind === 'role') {
    return Boolean(observation.role) && roleNormalizationKey(observation.role ?? '') === rule.key;
  }
  return Boolean(observation.system) && systemNormalizationKey(observation.system ?? '') === rule.key;
}

export function applyNormalizationRules(
  observations: ProcessMiningObservation[],
  rules: ProcessMiningNormalizationRule[] | undefined,
): { observations: ProcessMiningObservation[]; changedCount: number } {
  if (!rules || rules.length === 0) return { observations, changedCount: 0 };

  let changedCount = 0;
  const next = observations.map(observation => {
    let updated = observation;
    rules.forEach(rule => {
      if (!observationMatchesRule(updated, rule)) return;
      if (rule.kind === 'step') {
        const preferredValue = sentenceCase(normalizeWhitespace(rule.preferredValue));
        if (normalizeLabel(updated.label) !== normalizeLabel(preferredValue)) {
          updated = { ...updated, label: preferredValue };
          changedCount += 1;
        }
        return;
      }
      if (rule.kind === 'role') {
        const preferredValue = sentenceCase(normalizeWhitespace(rule.preferredValue));
        if (normalizeLabel(updated.role ?? '') !== normalizeLabel(preferredValue)) {
          updated = { ...updated, role: preferredValue };
          changedCount += 1;
        }
        return;
      }
      const preferredValue = sentenceCase(normalizeWhitespace(rule.preferredValue));
      if (normalizeLabel(updated.system ?? '') !== normalizeLabel(preferredValue)) {
        updated = { ...updated, system: preferredValue };
        changedCount += 1;
      }
    });
    return updated;
  });

  return { observations: next, changedCount };
}

export function upsertNormalizationRule(
  rules: ProcessMiningNormalizationRule[] | undefined,
  rule: ProcessMiningNormalizationRule,
): ProcessMiningNormalizationRule[] {
  const current = rules ?? [];
  const next = current.filter(existing => !(existing.kind === rule.kind && existing.key === rule.key));
  return [...next, rule].sort((a, b) => a.kind.localeCompare(b.kind) || a.preferredValue.localeCompare(b.preferredValue));
}
