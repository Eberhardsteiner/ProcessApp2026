import type { EventLogEvent, ProcessMiningActivityMapping, MiningSlaRule, MiningSlaRuleKind } from '../domain/process';
import type { CaptureDraftStep } from '../domain/capture';
import { normalizeActivityKey } from './processMiningLite';

export interface SlaWorstCase {
  caseId: string;
  valueMs: number;
}

export interface SlaRuleResult {
  ruleId: string;
  name: string;
  kind: MiningSlaRuleKind;
  thresholdMs: number;

  analyzedCases: number;
  breach: { count: number; pct: number };
  missing: { count: number; pct: number };
  worstCases: SlaWorstCase[];
  warnings: string[];
}

export function evaluateSlaRules(params: {
  events: EventLogEvent[];
  activityMappings: ProcessMiningActivityMapping[];
  draftSteps: CaptureDraftStep[];
  rules: MiningSlaRule[];
  maxCases?: number;
  timeMode?: string;
}): { analyzedCases: number; totalCases: number; results: SlaRuleResult[]; warnings: string[] } {
  const { events, activityMappings, draftSteps, rules, maxCases = 5000, timeMode } = params;
  const globalWarnings: string[] = [];

  if (timeMode !== 'real') {
    throw new Error(
      'evaluateSlaRules: Dataset hat kein explizit gültiges timeMode="real". ' +
      (timeMode
        ? `Empfangener Wert: "${timeMode}" – nur "real" ist zulässig.`
        : 'Fehlendes timeMode-Feld. Legacy-Dataset wird blockiert.') +
      ' Bitte das Dataset neu importieren.'
    );
  }

  const validStepIds = new Set(draftSteps.map(s => s.stepId));
  const actKeyToStepId = new Map<string, string>();
  for (const m of activityMappings) {
    if (m.stepId && validStepIds.has(m.stepId)) {
      actKeyToStepId.set(m.activityKey, m.stepId);
    }
  }

  const caseMap = new Map<string, EventLogEvent[]>();
  for (const e of events) {
    let arr = caseMap.get(e.caseId);
    if (!arr) { arr = []; caseMap.set(e.caseId, arr); }
    arr.push(e);
  }

  const totalCases = caseMap.size;
  const allCaseIds = Array.from(caseMap.keys());

  let sampledIds = allCaseIds;
  if (allCaseIds.length > maxCases) {
    sampledIds = allCaseIds.slice(0, maxCases);
    globalWarnings.push(
      `Anzeigestichprobe: ${maxCases.toLocaleString('de-DE')} von ${totalCases.toLocaleString('de-DE')} Cases für diese Ansicht berechnet. ` +
      'Das zugrunde liegende Dataset ist vollständig und unverändert. SLA-Ergebnisse sind Näherungswerte der Stichprobe.'
    );
  }

  interface CaseData {
    caseId: string;
    caseStartMs: number | null;
    caseEndMs: number | null;
    stepFirstTs: Map<string, number>;
    stepLastTs: Map<string, number>;
  }

  const caseData: CaseData[] = [];
  for (const caseId of sampledIds) {
    const evs = caseMap.get(caseId)!.slice().sort((a, b) => {
      const ta = Date.parse(a.timestamp);
      const tb = Date.parse(b.timestamp);
      return (isFinite(ta) ? ta : 0) - (isFinite(tb) ? tb : 0);
    });

    let caseStartMs: number | null = null;
    let caseEndMs: number | null = null;
    const stepFirstTs = new Map<string, number>();
    const stepLastTs = new Map<string, number>();

    for (const e of evs) {
      const ts = Date.parse(e.timestamp);
      if (!isFinite(ts)) continue;

      if (caseStartMs === null || ts < caseStartMs) caseStartMs = ts;
      if (caseEndMs === null || ts > caseEndMs) caseEndMs = ts;

      const actKey = normalizeActivityKey(e.activity);
      const stepId = actKeyToStepId.get(actKey);
      if (stepId) {
        if (!stepFirstTs.has(stepId) || ts < stepFirstTs.get(stepId)!) stepFirstTs.set(stepId, ts);
        if (!stepLastTs.has(stepId) || ts > stepLastTs.get(stepId)!) stepLastTs.set(stepId, ts);
      }
    }

    caseData.push({ caseId, caseStartMs, caseEndMs, stepFirstTs, stepLastTs });
  }

  const analyzedCases = caseData.length;
  const enabledRules = rules.filter(r => r.enabled);

  const results: SlaRuleResult[] = enabledRules.map(rule => {
    const ruleWarnings: string[] = [];
    let breachCount = 0;
    let missingCount = 0;
    const worstCandidates: SlaWorstCase[] = [];
    let negativeValueWarned = false;

    for (const cd of caseData) {
      let valueMs: number | null = null;
      let isMissing = false;

      if (rule.kind === 'case_duration') {
        if (cd.caseStartMs === null || cd.caseEndMs === null) {
          isMissing = true;
        } else {
          valueMs = cd.caseEndMs - cd.caseStartMs;
        }
      } else if (rule.kind === 'time_to_step') {
        const targetId = rule.targetStepId;
        if (!targetId || cd.caseStartMs === null || !cd.stepFirstTs.has(targetId)) {
          isMissing = true;
        } else {
          valueMs = cd.stepFirstTs.get(targetId)! - cd.caseStartMs;
        }
      } else if (rule.kind === 'wait_between_steps') {
        const fromId = rule.fromStepId;
        const toId = rule.toStepId;
        if (!fromId || !toId || !cd.stepLastTs.has(fromId) || !cd.stepFirstTs.has(toId)) {
          isMissing = true;
        } else {
          const raw = cd.stepFirstTs.get(toId)! - cd.stepLastTs.get(fromId)!;
          if (raw < 0) {
            if (!negativeValueWarned) {
              ruleWarnings.push('Negative Wartezeit ignoriert (Events möglicherweise falsch sortiert oder Steps überlappend).');
              negativeValueWarned = true;
            }
            isMissing = true;
          } else {
            valueMs = raw;
          }
        }
      }

      if (isMissing) {
        missingCount++;
        const countAsBreach =
          rule.kind === 'wait_between_steps'
            ? rule.countMissingAsBreachForWait === true
            : rule.countMissingAsBreach === true;
        if (countAsBreach) breachCount++;
      } else if (valueMs !== null) {
        if (valueMs > rule.thresholdMs) {
          breachCount++;
          worstCandidates.push({ caseId: cd.caseId, valueMs });
        }
      }
    }

    worstCandidates.sort((a, b) => b.valueMs - a.valueMs);
    const worstCases = worstCandidates.slice(0, 10);

    const pct = (n: number) => (analyzedCases > 0 ? n / analyzedCases : 0);

    return {
      ruleId: rule.id,
      name: rule.name,
      kind: rule.kind,
      thresholdMs: rule.thresholdMs,
      analyzedCases,
      breach: { count: breachCount, pct: pct(breachCount) },
      missing: { count: missingCount, pct: pct(missingCount) },
      worstCases,
      warnings: ruleWarnings,
    };
  });

  return { analyzedCases, totalCases, results, warnings: globalWarnings };
}
