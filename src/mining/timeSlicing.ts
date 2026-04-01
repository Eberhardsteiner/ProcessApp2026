import type { EventLogEvent } from '../domain/process';

export interface TimeSlice {
  key: string;
  startIso: string;
  endIso: string;
  events: EventLogEvent[];
  caseCount: number;
}

function toMonthKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function monthStartUtc(y: number, m0: number): Date {
  return new Date(Date.UTC(y, m0, 1));
}

function addMonthsUtc(d: Date, delta: number): Date {
  const y = d.getUTCFullYear();
  const m0 = d.getUTCMonth() + delta;
  return new Date(Date.UTC(y, m0, 1));
}

function parseMonthKey(key: string): { y: number; m0: number } | null {
  const m = key.match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const y = parseInt(m[1], 10);
  const m0 = parseInt(m[2], 10) - 1;
  if (m0 < 0 || m0 > 11) return null;
  return { y, m0 };
}

function toQuarterKey(d: Date): string {
  const y = d.getUTCFullYear();
  const q = Math.floor(d.getUTCMonth() / 3) + 1;
  return `${y}-Q${q}`;
}

function quarterStartUtc(y: number, q: number): Date {
  const m0 = (q - 1) * 3;
  return new Date(Date.UTC(y, m0, 1));
}

export function sliceByCaseStartMonth(params: {
  events: EventLogEvent[];
  rangeStartMonth?: string;
  rangeEndMonth?: string;
  maxSlices?: number;
}): { slices: TimeSlice[]; warnings: string[] } {
  const { events, rangeStartMonth, rangeEndMonth, maxSlices = 24 } = params;
  const warnings: string[] = [];

  const caseStartMs = new Map<string, number>();
  for (const ev of events) {
    const ts = Date.parse(ev.timestamp);
    if (!isFinite(ts)) continue;
    const prev = caseStartMs.get(ev.caseId);
    if (prev === undefined || ts < prev) {
      caseStartMs.set(ev.caseId, ts);
    }
  }

  if (caseStartMs.size === 0) {
    warnings.push('Keine parsebaren Timestamps gefunden – Zeitschnitte nicht möglich.');
    return { slices: [], warnings };
  }

  let minMs = Infinity;
  let maxMs = -Infinity;
  for (const ms of caseStartMs.values()) {
    if (ms < minMs) minMs = ms;
    if (ms > maxMs) maxMs = ms;
  }

  let startDate: Date;
  let endDate: Date;

  if (rangeStartMonth) {
    const p = parseMonthKey(rangeStartMonth);
    if (!p) {
      warnings.push(`Ungültiges Start-Monat-Format: ${rangeStartMonth}`);
      return { slices: [], warnings };
    }
    startDate = monthStartUtc(p.y, p.m0);
  } else {
    const d = new Date(minMs);
    startDate = monthStartUtc(d.getUTCFullYear(), d.getUTCMonth());
  }

  if (rangeEndMonth) {
    const p = parseMonthKey(rangeEndMonth);
    if (!p) {
      warnings.push(`Ungültiges End-Monat-Format: ${rangeEndMonth}`);
      return { slices: [], warnings };
    }
    endDate = addMonthsUtc(monthStartUtc(p.y, p.m0), 1);
  } else {
    const d = new Date(maxMs);
    endDate = addMonthsUtc(monthStartUtc(d.getUTCFullYear(), d.getUTCMonth()), 1);
  }

  const buckets: Array<{ key: string; startMs: number; endMs: number }> = [];
  let cur = startDate;
  while (cur < endDate) {
    const next = addMonthsUtc(cur, 1);
    buckets.push({ key: toMonthKey(cur), startMs: cur.getTime(), endMs: next.getTime() });
    cur = next;
  }

  if (buckets.length > maxSlices) {
    warnings.push(`Zeitraum ergibt ${buckets.length} Monate – auf ${maxSlices} begrenzt.`);
    buckets.splice(maxSlices);
  }

  const bucketIndexByKey = new Map<string, number>();
  for (let i = 0; i < buckets.length; i++) {
    bucketIndexByKey.set(buckets[i].key, i);
  }

  const bucketCaseIdSets: Set<string>[] = buckets.map(() => new Set<string>());
  for (const [caseId, ms] of caseStartMs.entries()) {
    const d = new Date(ms);
    const key = toMonthKey(d);
    const idx = bucketIndexByKey.get(key);
    if (idx !== undefined) {
      bucketCaseIdSets[idx].add(caseId);
    }
  }

  const caseMonthKey = new Map<string, number>();
  for (let i = 0; i < buckets.length; i++) {
    for (const caseId of bucketCaseIdSets[i]) {
      caseMonthKey.set(caseId, i);
    }
  }

  const bucketEvents: EventLogEvent[][] = buckets.map(() => []);
  for (const ev of events) {
    const idx = caseMonthKey.get(ev.caseId);
    if (idx !== undefined) {
      bucketEvents[idx].push(ev);
    }
  }

  const slices: TimeSlice[] = [];
  for (let i = 0; i < buckets.length; i++) {
    const b = buckets[i];
    const caseCount = bucketCaseIdSets[i].size;
    if (caseCount === 0) continue;
    slices.push({
      key: b.key,
      startIso: new Date(b.startMs).toISOString(),
      endIso: new Date(b.endMs).toISOString(),
      events: bucketEvents[i],
      caseCount,
    });
  }

  slices.sort((a, b) => a.key.localeCompare(b.key));

  return { slices, warnings };
}

export function sliceByCaseStartQuarter(params: {
  events: EventLogEvent[];
  rangeStartMonth?: string;
  rangeEndMonth?: string;
  maxSlices?: number;
}): { slices: TimeSlice[]; warnings: string[] } {
  const { events, rangeStartMonth, rangeEndMonth, maxSlices = 24 } = params;
  const warnings: string[] = [];

  const caseStartMs = new Map<string, number>();
  for (const ev of events) {
    const ts = Date.parse(ev.timestamp);
    if (!isFinite(ts)) continue;
    const prev = caseStartMs.get(ev.caseId);
    if (prev === undefined || ts < prev) {
      caseStartMs.set(ev.caseId, ts);
    }
  }

  if (caseStartMs.size === 0) {
    warnings.push('Keine parsebaren Timestamps gefunden – Zeitschnitte nicht möglich.');
    return { slices: [], warnings };
  }

  let minMs = Infinity;
  let maxMs = -Infinity;
  for (const ms of caseStartMs.values()) {
    if (ms < minMs) minMs = ms;
    if (ms > maxMs) maxMs = ms;
  }

  let startDate: Date;
  let endDate: Date;

  if (rangeStartMonth) {
    const p = parseMonthKey(rangeStartMonth);
    if (!p) {
      warnings.push(`Ungültiges Start-Monat-Format: ${rangeStartMonth}`);
      return { slices: [], warnings };
    }
    const q = Math.floor(p.m0 / 3) + 1;
    startDate = quarterStartUtc(p.y, q);
  } else {
    const d = new Date(minMs);
    const y = d.getUTCFullYear();
    const q = Math.floor(d.getUTCMonth() / 3) + 1;
    startDate = quarterStartUtc(y, q);
  }

  if (rangeEndMonth) {
    const p = parseMonthKey(rangeEndMonth);
    if (!p) {
      warnings.push(`Ungültiges End-Monat-Format: ${rangeEndMonth}`);
      return { slices: [], warnings };
    }
    const q = Math.floor(p.m0 / 3) + 1;
    endDate = addMonthsUtc(quarterStartUtc(p.y, q), 3);
  } else {
    const d = new Date(maxMs);
    const y = d.getUTCFullYear();
    const q = Math.floor(d.getUTCMonth() / 3) + 1;
    endDate = addMonthsUtc(quarterStartUtc(y, q), 3);
  }

  const buckets: Array<{ key: string; startMs: number; endMs: number }> = [];
  let cur = startDate;
  while (cur < endDate) {
    const next = addMonthsUtc(cur, 3);
    buckets.push({ key: toQuarterKey(cur), startMs: cur.getTime(), endMs: next.getTime() });
    cur = next;
  }

  if (buckets.length > maxSlices) {
    warnings.push(`Zeitraum ergibt ${buckets.length} Quartale – auf ${maxSlices} begrenzt.`);
    buckets.splice(maxSlices);
  }

  const bucketIndexByKey = new Map<string, number>();
  for (let i = 0; i < buckets.length; i++) {
    bucketIndexByKey.set(buckets[i].key, i);
  }

  const bucketCaseIdSets: Set<string>[] = buckets.map(() => new Set<string>());
  for (const [caseId, ms] of caseStartMs.entries()) {
    const d = new Date(ms);
    const key = toQuarterKey(d);
    const idx = bucketIndexByKey.get(key);
    if (idx !== undefined) {
      bucketCaseIdSets[idx].add(caseId);
    }
  }

  const caseQuarterKey = new Map<string, number>();
  for (let i = 0; i < buckets.length; i++) {
    for (const caseId of bucketCaseIdSets[i]) {
      caseQuarterKey.set(caseId, i);
    }
  }

  const bucketEvents: EventLogEvent[][] = buckets.map(() => []);
  for (const ev of events) {
    const idx = caseQuarterKey.get(ev.caseId);
    if (idx !== undefined) {
      bucketEvents[idx].push(ev);
    }
  }

  const slices: TimeSlice[] = [];
  for (let i = 0; i < buckets.length; i++) {
    const b = buckets[i];
    const caseCount = bucketCaseIdSets[i].size;
    if (caseCount === 0) continue;
    slices.push({
      key: b.key,
      startIso: new Date(b.startMs).toISOString(),
      endIso: new Date(b.endMs).toISOString(),
      events: bucketEvents[i],
      caseCount,
    });
  }

  slices.sort((a, b) => a.key.localeCompare(b.key));

  return { slices, warnings };
}
