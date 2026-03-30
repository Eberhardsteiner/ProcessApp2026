import type { EventLogEvent, ProcessMiningState } from '../domain/process';

export interface XesExportOptions {
  filenameBase?: string;
  includeAttributes?: boolean;
  allowedCaseIds?: Set<string>;
  logAttributes?: Record<string, string>;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function strAttr(key: string, value: string): string {
  return `<string key="${escapeXml(key)}" value="${escapeXml(value)}"/>`;
}

function dateAttr(key: string, value: string): string {
  return `<date key="${escapeXml(key)}" value="${escapeXml(value)}"/>`;
}

function assertExportableState(pm: ProcessMiningState): void {
  if (pm.timeMode !== 'real') {
    throw new Error(
      'XES-Export abgebrochen: Das Event Log hat kein gültiges timeMode-Feld.\n' +
      'Nur mit timeMode="real" importierte Event Logs dürfen exportiert werden.\n' +
      'Dieser Altbestand wird blockiert. Bitte das Event Log neu importieren.'
    );
  }

  const raw = pm as unknown as Record<string, unknown>;
  if (raw['truncated'] === true) {
    throw new Error(
      'XES-Export abgebrochen: Das Event Log ist als abgeschnitten markiert (truncated = true).\n' +
      'Gekappte Event Logs enthalten keinen vollständigen Prozessbestand und dürfen nicht exportiert werden.\n' +
      'Bitte das vollständige Event Log neu importieren.'
    );
  }
}

function assertExportableDataset(ds: Record<string, unknown>, context: string): void {
  const timeMode = ds['timeMode'];
  if (timeMode !== 'real') {
    throw new Error(
      `${context}: Dataset hat kein gültiges timeMode-Feld (gefunden: ${JSON.stringify(timeMode)}).\n` +
      'Nur mit timeMode="real" importierte Datasets dürfen exportiert werden.\n' +
      'Dieser Legacy-Altbestand wird blockiert. Bitte das Dataset neu importieren.'
    );
  }
  if (ds['truncated'] === true) {
    throw new Error(
      `${context}: Dataset ist als abgeschnitten markiert (truncated = true).\n` +
      'Gekappte Datasets enthalten keinen vollständigen Prozessbestand und dürfen nicht exportiert werden.\n' +
      'Bitte das vollständige Event Log neu importieren.'
    );
  }
}

export { assertExportableDataset };

export function buildXesXml(params: {
  processMining: ProcessMiningState;
  options?: XesExportOptions;
}): { xml: string; warnings: string[] } {
  const { processMining, options = {} } = params;
  const includeAttributes = options.includeAttributes !== false;
  const allowedCaseIds = options.allowedCaseIds;
  const logAttributes = options.logAttributes;
  const warnings: string[] = [];

  assertExportableState(processMining);

  if (!processMining.events || processMining.events.length === 0) {
    throw new Error(
      'XES-Export abgebrochen: Das Event Log enthält keine Events.\n' +
      'Ein leeres Event Log kann nicht als valides XES exportiert werden.'
    );
  }

  const relevantEvents = allowedCaseIds
    ? processMining.events.filter((e) => allowedCaseIds.has(e.caseId))
    : processMining.events;

  const eventsWithoutTimestamp = relevantEvents.filter((e) => !e.timestamp || !e.timestamp.trim());
  if (eventsWithoutTimestamp.length > 0) {
    const sampleCaseIds = [...new Set(eventsWithoutTimestamp.map((e) => e.caseId))].slice(0, 3).join(', ');
    throw new Error(
      `XES-Export abgebrochen: ${eventsWithoutTimestamp.length} Event(s) haben keinen Timestamp (leer oder fehlend).\n` +
      `Betroffene Cases (Auswahl): ${sampleCaseIds}.\n` +
      'Der XES-Standard erfordert für jedes Event einen gültigen Zeitstempel (time:timestamp).\n' +
      'Bitte korrigieren Sie die Quelldaten und importieren Sie erneut.'
    );
  }

  const eventsWithUnparseableTimestamp = relevantEvents.filter((e) => {
    const ts = e.timestamp!.trim();
    return isNaN(Date.parse(ts));
  });
  if (eventsWithUnparseableTimestamp.length > 0) {
    const sample = eventsWithUnparseableTimestamp.slice(0, 3).map((e) => `"${e.timestamp}"`).join(', ');
    const sampleCases = [...new Set(eventsWithUnparseableTimestamp.map((e) => e.caseId))].slice(0, 3).join(', ');
    throw new Error(
      `XES-Export abgebrochen: ${eventsWithUnparseableTimestamp.length} Event(s) haben einen nicht parsebaren Timestamp.\n` +
      `Betroffene Timestamps (Auswahl): ${sample}.\n` +
      `Betroffene Cases (Auswahl): ${sampleCases}.\n` +
      'Nur ISO-8601-konforme Zeitstempel (z.B. 2024-01-15T08:30:00Z) sind für den XES-Export zulässig.\n' +
      'Bitte korrigieren Sie die Quelldaten und importieren Sie erneut.'
    );
  }

  const caseMap = new Map<string, EventLogEvent[]>();
  for (const e of relevantEvents) {
    let bucket = caseMap.get(e.caseId);
    if (!bucket) { bucket = []; caseMap.set(e.caseId, bucket); }
    bucket.push(e);
  }

  const sortedCaseIds = Array.from(caseMap.keys()).sort((a, b) => a.localeCompare(b));

  const maxAttrPerEvent = 40;
  const maxValueLen = 500;
  let warnedAttrLimit = false;
  let warnedValueTrunc = false;

  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8" ?>');
  lines.push('<log xes.version="1.0" xes.features="nested-attributes" openxes.version="1.0RC7" xmlns="http://www.xes-standard.org/">');
  lines.push(`  ${strAttr('concept:name', 'Process Mining Event Log')}`);
  lines.push(`  ${strAttr('sourceLabel', processMining.sourceLabel ?? '')}`);
  lines.push(`  ${strAttr('importedAt', processMining.importedAt ?? '')}`);
  lines.push(`  ${strAttr('app', 'Process Capture & Optimization Workbench')}`);

  if (logAttributes) {
    for (const [k, v] of Object.entries(logAttributes)) {
      if (k && v !== undefined && v !== null) {
        lines.push(`  ${strAttr(k.trim(), String(v).trim())}`);
      }
    }
  }

  for (const caseId of sortedCaseIds) {
    const rawEvents = caseMap.get(caseId)!;
    const sortedEvents = rawEvents.slice().sort((a, b) => a.timestamp!.localeCompare(b.timestamp!));

    lines.push('  <trace>');
    lines.push(`    ${strAttr('concept:name', caseId)}`);

    for (const e of sortedEvents) {
      lines.push('    <event>');
      lines.push(`      ${strAttr('concept:name', e.activity)}`);
      lines.push(`      ${dateAttr('time:timestamp', e.timestamp!)}`);

      if (e.resource) {
        lines.push(`      ${strAttr('org:resource', e.resource)}`);
      }

      if (includeAttributes && e.attributes) {
        let attrCount = 0;
        for (const [k, v] of Object.entries(e.attributes)) {
          if (!k || !v) continue;
          if (attrCount >= maxAttrPerEvent) {
            if (!warnedAttrLimit) {
              warnings.push(`Attribute auf ${maxAttrPerEvent} pro Event begrenzt (weitere ignoriert).`);
              warnedAttrLimit = true;
            }
            break;
          }
          let val = v;
          if (val.length > maxValueLen) {
            if (!warnedValueTrunc) {
              warnings.push(`Attribut-Werte auf ${maxValueLen} Zeichen gekürzt.`);
              warnedValueTrunc = true;
            }
            val = val.slice(0, maxValueLen);
          }
          lines.push(`      ${strAttr(k.trim(), val)}`);
          attrCount++;
        }
      }

      lines.push('    </event>');
    }

    lines.push('  </trace>');
  }

  lines.push('</log>');

  if (warnings.length > 10) {
    const overflow = warnings.length - 10;
    warnings.splice(10);
    warnings.push(`... und ${overflow} weitere Hinweise.`);
  }

  return { xml: lines.join('\n'), warnings };
}

export function sanitizeFilenameBase(label: string): string {
  return label
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9\-_äöüÄÖÜß]/g, '')
    .slice(0, 60) || 'event-log';
}
