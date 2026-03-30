import type { EventLogEvent } from '../domain/process';
import type {
  MiningAttributeNormalization,
  MiningLifecycleMode,
  MiningMergeRule,
  MiningNoiseFilter,
  MiningSplitRule,
} from '../domain/process';
import { normalizeActivityKey } from './processMiningLite';

export interface TransformResult {
  events: EventLogEvent[];
  warnings: string[];
  stats: {
    beforeEvents: number;
    afterEvents: number;
    beforeCases: number;
    afterCases: number;
  };
}

export type RenameRule = { mode: 'contains' | 'equals'; from: string; to: string };

export function countCases(events: EventLogEvent[]): number {
  const ids = new Set<string>();
  for (const e of events) ids.add(e.caseId);
  return ids.size;
}

function makeStats(before: EventLogEvent[], after: EventLogEvent[]) {
  return {
    beforeEvents: before.length,
    afterEvents: after.length,
    beforeCases: countCases(before),
    afterCases: countCases(after),
  };
}

function eventKey(e: EventLogEvent): string {
  const attrs = e.attributes ? JSON.stringify(e.attributes, Object.keys(e.attributes).sort()) : '';
  return `${e.caseId}\0${e.activity}\0${e.timestamp}\0${e.resource ?? ''}\0${attrs}`;
}

export function dedupeExactEvents(events: EventLogEvent[]): TransformResult {
  const seen = new Set<string>();
  const result: EventLogEvent[] = [];
  for (const ev of events) {
    const k = eventKey(ev);
    if (!seen.has(k)) {
      seen.add(k);
      result.push(ev);
    }
  }
  const removed = events.length - result.length;
  const warnings: string[] = [];
  if (removed > 0) {
    warnings.push(`${removed} exakte Duplikat-Events entfernt.`);
  }
  return { events: result, warnings, stats: makeStats(events, result) };
}

function parseTs(ts: string): number {
  const d = new Date(ts);
  return Number.isFinite(d.getTime()) ? d.getTime() : NaN;
}

export function dedupeConsecutiveActivities(events: EventLogEvent[]): TransformResult {
  const byCaseOrder: Map<string, EventLogEvent[]> = new Map();
  for (const ev of events) {
    let arr = byCaseOrder.get(ev.caseId);
    if (!arr) {
      arr = [];
      byCaseOrder.set(ev.caseId, arr);
    }
    arr.push(ev);
  }

  let noTimestampCount = 0;
  const result: EventLogEvent[] = [];

  for (const [, caseEvents] of byCaseOrder) {
    const allValid = caseEvents.every((e) => Number.isFinite(parseTs(e.timestamp)));
    if (allValid) {
      caseEvents.sort((a, b) => parseTs(a.timestamp) - parseTs(b.timestamp));
    } else {
      noTimestampCount += caseEvents.filter((e) => !Number.isFinite(parseTs(e.timestamp))).length;
    }

    let prevKey = '';
    for (const ev of caseEvents) {
      const k = normalizeActivityKey(ev.activity);
      if (k !== prevKey) {
        result.push(ev);
        prevKey = k;
      }
    }
  }

  const removed = events.length - result.length;
  const warnings: string[] = [];
  if (removed > 0) {
    warnings.push(`${removed} konsekutive Duplikat-Aktivitäten entfernt.`);
  }
  if (noTimestampCount > 0) {
    warnings.push(
      `${noTimestampCount} Events mit nicht parsebarem Timestamp – für betroffene Cases wurde die Original-Reihenfolge beibehalten. ` +
      'Ein valides Dataset sollte ausschließlich parsbare ISO-8601-Timestamps enthalten. ' +
      'Bitte das Quell-Log prüfen.'
    );
  }
  return { events: result, warnings, stats: makeStats(events, result) };
}

export function filterByTimeRange(
  events: EventLogEvent[],
  startIso?: string,
  endIso?: string,
): TransformResult {
  const warnings: string[] = [];

  let startMs = -Infinity;
  let endMs = Infinity;

  if (startIso) {
    const d = new Date(startIso);
    if (Number.isFinite(d.getTime())) {
      startMs = d.getTime();
    } else {
      warnings.push(`Ungültiges Startdatum "${startIso}". Zeitfilter wird ignoriert.`);
    }
  }

  if (endIso) {
    const d = new Date(endIso);
    if (Number.isFinite(d.getTime())) {
      endMs = d.getTime();
    } else {
      warnings.push(`Ungültiges Enddatum "${endIso}". Zeitfilter wird ignoriert.`);
    }
  }

  if (startMs === -Infinity && endMs === Infinity) {
    return { events, warnings, stats: makeStats(events, events) };
  }

  let unparseable = 0;
  const result = events.filter((ev) => {
    const ts = parseTs(ev.timestamp);
    if (!Number.isFinite(ts)) { unparseable++; return true; }
    return ts >= startMs && ts <= endMs;
  });

  if (unparseable > 0) {
    warnings.push(
      `${unparseable} Events haben keinen parsbaren Timestamp und wurden vom Zeitfilter nicht erfasst. ` +
      'Bitte das Quell-Log prüfen.'
    );
  }

  return { events: result, warnings, stats: makeStats(events, result) };
}

export function renameActivities(events: EventLogEvent[], rules: RenameRule[]): TransformResult {
  const validRules = rules
    .map((r) => ({ mode: r.mode, from: r.from.trim(), to: r.to.trim() }))
    .filter((r) => r.from.length > 0);

  if (validRules.length === 0) {
    return { events, warnings: [], stats: makeStats(events, events) };
  }

  let renamed = 0;
  const result = events.map((ev) => {
    let activity = ev.activity;
    for (const rule of validRules) {
      if (rule.mode === 'equals' && activity.toLowerCase() === rule.from.toLowerCase()) {
        activity = rule.to;
      } else if (rule.mode === 'contains' && activity.toLowerCase().includes(rule.from.toLowerCase())) {
        activity = rule.to;
      }
    }
    if (activity !== ev.activity) {
      renamed++;
      return { ...ev, activity };
    }
    return ev;
  });

  const warnings: string[] = [];
  if (renamed > 0) {
    warnings.push(`Aktivitätsnamen in ${renamed} Events umbenannt.`);
  }
  return { events: result, warnings, stats: makeStats(events, result) };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseNumberAuto(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  let normalized = trimmed;
  const commaCount = (normalized.match(/,/g) ?? []).length;
  const dotCount = (normalized.match(/\./g) ?? []).length;
  if (commaCount === 1 && dotCount === 0) {
    const parts = normalized.split(',');
    if (parts[1].length <= 3 && parts[0].length > 0) {
      normalized = normalized.replace(',', '.');
    } else {
      normalized = normalized.replace(',', '.');
    }
  } else if (commaCount > 1 && dotCount === 0) {
    normalized = normalized.replace(/,/g, '');
  } else if (dotCount > 1 && commaCount === 0) {
    normalized = normalized.replace(/\./g, '');
  } else if (commaCount >= 1 && dotCount >= 1) {
    const lastComma = normalized.lastIndexOf(',');
    const lastDot = normalized.lastIndexOf('.');
    if (lastComma > lastDot) {
      normalized = normalized.replace(/\./g, '').replace(',', '.');
    } else {
      normalized = normalized.replace(/,/g, '');
    }
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function parseDateAuto(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const ddmmyyyy = /^(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/;
  const m = trimmed.match(ddmmyyyy);
  if (m) {
    const isoStr = `${m[3]}-${m[2]}-${m[1]}${m[4] ? `T${m[4]}:${m[5]}${m[6] ? `:${m[6]}` : ':00'}` : 'T00:00:00'}`;
    const d = new Date(isoStr);
    return Number.isFinite(d.getTime()) ? d.getTime() : null;
  }
  const ms = Date.parse(trimmed);
  return Number.isFinite(ms) ? ms : null;
}

function formatDate(ms: number, mode: 'date' | 'datetime'): string {
  const d = new Date(ms);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  if (mode === 'date') return `${yyyy}-${mm}-${dd}`;
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mi = String(d.getUTCMinutes()).padStart(2, '0');
  const ss = String(d.getUTCSeconds()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}`;
}

// ── New transform exports ─────────────────────────────────────────────────────

export function normalizeEventAttributes(
  events: EventLogEvent[],
  cfg?: MiningAttributeNormalization,
): TransformResult {
  if (!cfg?.enabled) {
    return { events, warnings: [], stats: makeStats(events, events) };
  }

  const enumMaxUnique = cfg.enumMaxUnique ?? 50;
  const dateMode = cfg.dateFormat ?? 'date';

  type ColType = 'number' | 'date' | 'enum' | 'string';
  const colTypeCache = new Map<string, ColType>();

  function inferColType(key: string, allEvents: EventLogEvent[]): ColType {
    if (colTypeCache.has(key)) return colTypeCache.get(key)!;
    const sample: string[] = [];
    for (const ev of allEvents) {
      if (!ev.attributes) continue;
      const val = ev.attributes[key];
      if (val !== undefined && val !== null && String(val).trim() !== '') {
        sample.push(String(val).trim());
        if (sample.length >= 200) break;
      }
    }
    if (sample.length === 0) { colTypeCache.set(key, 'string'); return 'string'; }
    let numericCount = 0;
    let dateCount = 0;
    const unique = new Set<string>();
    for (const v of sample) {
      if (parseNumberAuto(v) !== null) numericCount++;
      if (parseDateAuto(v) !== null) dateCount++;
      unique.add(v.toLowerCase());
    }
    const numericShare = numericCount / sample.length;
    const dateShare = dateCount / sample.length;
    let type: ColType = 'string';
    if (numericShare >= 0.8) type = 'number';
    else if (dateShare >= 0.8) type = 'date';
    else if (cfg && unique.size <= enumMaxUnique && cfg.enumCase && cfg.enumCase !== 'preserve') type = 'enum';
    colTypeCache.set(key, type);
    return type;
  }

  let modifiedAttrCount = 0;
  let droppedEmpty = 0;

  const result = events.map((ev) => {
    if (!ev.attributes) return ev;
    const raw = ev.attributes;
    const next: Record<string, string> = {};
    let changed = false;

    for (const rawKey of Object.keys(raw)) {
      let key = rawKey;
      if (cfg.trimKeys) key = key.trim();
      if (cfg.lowerCaseKeys) key = key.toLowerCase();
      if (cfg.replaceSpacesInKeys) key = key.replace(/\s+/g, '_');

      let val = String(raw[rawKey] ?? '');
      if (cfg.trimValues) val = val.trim();

      if (cfg.dropEmptyAttributes && val === '') {
        droppedEmpty++;
        changed = true;
        continue;
      }

      if (cfg.inferTypes && val !== '') {
        const colType = inferColType(rawKey, events);
        if (colType === 'number' && cfg.normalizeNumbers) {
          const n = parseNumberAuto(val);
          if (n !== null) { val = String(n); }
        } else if (colType === 'date' && cfg.normalizeDates) {
          const ms = parseDateAuto(val);
          if (ms !== null) { val = formatDate(ms, dateMode); }
        } else if (colType === 'enum' && cfg.enumCase && cfg.enumCase !== 'preserve') {
          val = cfg.enumCase === 'lower' ? val.toLowerCase() : val.toUpperCase();
        }
      }

      if (key !== rawKey || val !== String(raw[rawKey] ?? '')) changed = true;
      next[key] = val;
    }

    if (changed) {
      modifiedAttrCount++;
      return { ...ev, attributes: next };
    }
    return ev;
  });

  const warnings: string[] = [];
  if (modifiedAttrCount > 0) warnings.push(`Attribute in ${modifiedAttrCount} Events normalisiert.`);
  if (droppedEmpty > 0) warnings.push(`${droppedEmpty} leere Attributwerte entfernt.`);
  return { events: result, warnings, stats: makeStats(events, result) };
}

const LIFECYCLE_START_SUFFIXES = [' start', ':start', '_start', ' (start)', '.start'];
const LIFECYCLE_COMPLETE_SUFFIXES = [' complete', ':complete', '_complete', ' (complete)', '.complete', ' end', ':end'];

function detectLifecycleSuffix(activity: string): { type: 'start' | 'complete' | null; base: string } {
  const lower = activity.toLowerCase();
  for (const s of LIFECYCLE_COMPLETE_SUFFIXES) {
    if (lower.endsWith(s)) return { type: 'complete', base: activity.slice(0, activity.length - s.length) };
  }
  for (const s of LIFECYCLE_START_SUFFIXES) {
    if (lower.endsWith(s)) return { type: 'start', base: activity.slice(0, activity.length - s.length) };
  }
  return { type: null, base: activity };
}

export function applyLifecycleHandling(
  events: EventLogEvent[],
  mode?: MiningLifecycleMode,
): TransformResult {
  if (!mode || mode === 'off') {
    return { events, warnings: [], stats: makeStats(events, events) };
  }

  let filtered = 0;
  let renamed = 0;

  const result: EventLogEvent[] = [];
  for (const ev of events) {
    const { type, base } = detectLifecycleSuffix(ev.activity);
    if (mode === 'keep_complete') {
      if (type === 'start') { filtered++; continue; }
      const newActivity = type === 'complete' ? base : ev.activity;
      if (newActivity !== ev.activity) renamed++;
      result.push(newActivity !== ev.activity ? { ...ev, activity: newActivity } : ev);
    } else if (mode === 'keep_start') {
      if (type === 'complete') { filtered++; continue; }
      const newActivity = type === 'start' ? base : ev.activity;
      if (newActivity !== ev.activity) renamed++;
      result.push(newActivity !== ev.activity ? { ...ev, activity: newActivity } : ev);
    } else if (mode === 'strip_suffix') {
      const newActivity = type !== null ? base : ev.activity;
      if (newActivity !== ev.activity) renamed++;
      result.push(newActivity !== ev.activity ? { ...ev, activity: newActivity } : ev);
    } else {
      result.push(ev);
    }
  }

  const warnings: string[] = [];
  if (filtered > 0) warnings.push(`Lifecycle: ${filtered} Events entfernt.`);
  if (renamed > 0) warnings.push(`Lifecycle: ${renamed} Aktivitätsnamen bereinigt.`);
  return { events: result, warnings, stats: makeStats(events, result) };
}

export function mergeActivities(
  events: EventLogEvent[],
  rules?: MiningMergeRule[],
): TransformResult {
  if (!rules || rules.length === 0) {
    return { events, warnings: [], stats: makeStats(events, events) };
  }

  let changed = 0;
  const result = events.map((ev) => {
    let activity = ev.activity;
    for (const rule of rules) {
      const lower = activity.toLowerCase();
      const match = rule.mode === 'equals'
        ? rule.sources.some((s) => lower === s.toLowerCase())
        : rule.sources.some((s) => lower.includes(s.toLowerCase()));
      if (match) { activity = rule.target; break; }
    }
    if (activity !== ev.activity) { changed++; return { ...ev, activity }; }
    return ev;
  });

  const warnings: string[] = [];
  if (changed > 0) warnings.push(`Merge: ${changed} Events auf Ziel-Aktivitäten gemappt.`);
  return { events: result, warnings, stats: makeStats(events, result) };
}

export function splitActivitiesByAttribute(
  events: EventLogEvent[],
  rules?: MiningSplitRule[],
): TransformResult {
  if (!rules || rules.length === 0) {
    return { events, warnings: [], stats: makeStats(events, events) };
  }

  let splitCount = 0;
  let missingAttr = 0;

  const result = events.map((ev) => {
    for (const rule of rules) {
      const lower = ev.activity.toLowerCase();
      const matched = rule.mode === 'equals'
        ? lower === rule.match.toLowerCase()
        : lower.includes(rule.match.toLowerCase());
      if (!matched) continue;

      const attrKeyLower = rule.attributeKey.toLowerCase();
      let attrVal: string | undefined;
      if (ev.attributes) {
        const foundKey = Object.keys(ev.attributes).find((k) => k.toLowerCase() === attrKeyLower);
        if (foundKey !== undefined) attrVal = String(ev.attributes[foundKey] ?? '').trim() || undefined;
      }
      if (attrVal === undefined || attrVal === '') { missingAttr++; return ev; }

      const separator = rule.separator ?? ' · ';
      const prefix = rule.prefix ?? '';
      const newActivity = `${prefix}${ev.activity}${separator}${attrVal}`;
      splitCount++;
      return { ...ev, activity: newActivity };
    }
    return ev;
  });

  const warnings: string[] = [];
  if (splitCount > 0) warnings.push(`Split: Aktivitätsname in ${splitCount} Events erweitert.`);
  if (missingAttr > 0) warnings.push(`Split: Bei ${missingAttr} Events fehlte das Attribut (Regel hat gematcht).`);
  return { events: result, warnings, stats: makeStats(events, result) };
}

export function filterRareActivities(
  events: EventLogEvent[],
  cfg?: MiningNoiseFilter,
): TransformResult {
  if (!cfg?.enabled) {
    return { events, warnings: [], stats: makeStats(events, events) };
  }

  const minEventCount = cfg.minEventCount ?? 10;

  const activityEventCount = new Map<string, number>();
  const activityCaseSet = new Map<string, Set<string>>();
  const totalCases = new Set<string>();

  for (const ev of events) {
    const key = normalizeActivityKey(ev.activity);
    activityEventCount.set(key, (activityEventCount.get(key) ?? 0) + 1);
    if (!activityCaseSet.has(key)) activityCaseSet.set(key, new Set());
    activityCaseSet.get(key)!.add(ev.caseId);
    totalCases.add(ev.caseId);
  }

  const totalCaseCount = totalCases.size;

  const removedKeys = new Set<string>();
  for (const [key, count] of activityEventCount) {
    let remove = count < minEventCount;
    if (!remove && cfg.minCaseCoveragePct !== undefined) {
      const caseCoverage = totalCaseCount > 0 ? (activityCaseSet.get(key)?.size ?? 0) / totalCaseCount : 0;
      if (caseCoverage < cfg.minCaseCoveragePct) remove = true;
    }
    if (remove) removedKeys.add(key);
  }

  if (removedKeys.size === 0) {
    return { events, warnings: [], stats: makeStats(events, events) };
  }

  const result = events.filter((ev) => !removedKeys.has(normalizeActivityKey(ev.activity)));
  const removedEvents = events.length - result.length;

  const topRemoved = [...removedKeys].slice(0, 5).join(', ');
  const warnings: string[] = [];
  warnings.push(`Noise-Filter: ${removedEvents} Events entfernt (${removedKeys.size} seltene Aktivitäts-Keys). Häufigste entfernte: ${topRemoved}`);
  return { events: result, warnings, stats: makeStats(events, result) };
}
