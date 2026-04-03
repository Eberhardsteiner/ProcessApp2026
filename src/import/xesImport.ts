import type { AiEventLogResultV1, AiEventLogEventV1 } from '../ai/aiEventLog';

export interface XesImportParseResult {
  ai: AiEventLogResultV1;
  sourceLabel: string;
  warnings: string[];
}

const XES_ATTR_TAG_NAMES = new Set(['string', 'date', 'int', 'float', 'boolean']);
const XES_IGNORED_TAG_NAMES = new Set(['list', 'container']);

function directChildrenByTagNS(parent: Element, localNames: Set<string>): Element[] {
  const result: Element[] = [];
  for (let i = 0; i < parent.childNodes.length; i++) {
    const child = parent.childNodes[i];
    if (child.nodeType === Node.ELEMENT_NODE) {
      const el = child as Element;
      if (localNames.has(el.localName)) {
        result.push(el);
      }
    }
  }
  return result;
}

function collectAttrs(parent: Element): Record<string, string> {
  const attrs: Record<string, string> = {};
  const children = directChildrenByTagNS(parent, XES_ATTR_TAG_NAMES);
  for (const el of children) {
    const key = el.getAttribute('key')?.trim();
    const value = el.getAttribute('value') ?? '';
    if (key) {
      attrs[key] = value;
    }
  }
  return attrs;
}

function hasIgnoredChildren(parent: Element): boolean {
  for (let i = 0; i < parent.childNodes.length; i++) {
    const child = parent.childNodes[i];
    if (child.nodeType === Node.ELEMENT_NODE) {
      const el = child as Element;
      if (XES_IGNORED_TAG_NAMES.has(el.localName)) {
        return true;
      }
    }
  }
  return false;
}

function directChildElements(parent: Element, localName: string): Element[] {
  const result: Element[] = [];
  for (let i = 0; i < parent.childNodes.length; i++) {
    const child = parent.childNodes[i];
    if (child.nodeType === Node.ELEMENT_NODE) {
      const el = child as Element;
      if (el.localName === localName) {
        result.push(el);
      }
    }
  }
  return result;
}

export function parseXesXmlToAiEventLog(params: {
  xmlText: string;
  fallbackSourceLabel: string;
  maxEvents?: number;
}): XesImportParseResult {
  const { xmlText, fallbackSourceLabel } = params;
  const maxEvents = params.maxEvents ?? 200000;
  const warnings: string[] = [];
  let warnedSkippedActivity = false;
  let warnedNestedAttrs = false;

  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'application/xml');

  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error('XES/XML Parserfehler – Datei ist kein gültiges XES oder enthält ungültiges XML.');
  }

  const logEls = doc.getElementsByTagNameNS('*', 'log');
  const logEl = logEls.length > 0 ? logEls[0] : doc.documentElement;

  if (hasIgnoredChildren(logEl) && !warnedNestedAttrs) {
    warnings.push('Nested XES Attributes (list/container) werden ignoriert.');
    warnedNestedAttrs = true;
  }

  const logAttrs = collectAttrs(logEl);
  const sourceLabel = logAttrs['sourceLabel'] || logAttrs['concept:name'] || fallbackSourceLabel;

  const traces = directChildElements(logEl, 'trace');
  if (traces.length === 0) {
    const nsTraces = logEl.getElementsByTagNameNS('*', 'trace');
    for (let i = 0; i < nsTraces.length; i++) {
      traces.push(nsTraces[i]);
    }
  }

  const events: AiEventLogEventV1[] = [];
  let totalEventsProcessed = 0;
  let missingCaseIdTraces = 0;

  interface XesValidationError {
    type: 'missing_activity' | 'missing_timestamp' | 'invalid_timestamp';
    caseId: string;
    eventIndex: number;
    rawValue?: string;
  }
  const validationErrors: XesValidationError[] = [];

  for (const traceEl of traces) {
    if (!warnedNestedAttrs && hasIgnoredChildren(traceEl)) {
      warnings.push('Nested XES Attributes (list/container) werden ignoriert.');
      warnedNestedAttrs = true;
    }

    const traceAttrs = collectAttrs(traceEl);
    const caseId = (traceAttrs['concept:name'] || traceAttrs['caseId'] || '').trim();
    if (!caseId) {
      missingCaseIdTraces++;
      continue;
    }

    const eventEls = Array.from(traceEl.childNodes)
      .filter((n): n is Element => n.nodeType === Node.ELEMENT_NODE)
      .filter((el) => el.localName === 'event');

    for (let ei = 0; ei < eventEls.length; ei++) {
      if (totalEventsProcessed >= maxEvents) {
        throw new Error(
          `XES-Import abgebrochen: Die XES-Datei enthält mehr als ${maxEvents.toLocaleString('de-DE')} Events.\n` +
          'Automatisches Kürzen des Event Logs ist nicht zulässig. Ein abgeschnittenes Log ergibt ein unvollständiges Ist-Bild.\n' +
          'Bitte das XES extern vorfiltern (z.\u202fB. auf einen Zeitraum oder eine Teilmenge von Cases) und erneut importieren.'
        );
      }

      const eventEl = eventEls[ei];

      if (!warnedNestedAttrs && hasIgnoredChildren(eventEl)) {
        warnings.push('Nested XES Attributes (list/container) werden ignoriert.');
        warnedNestedAttrs = true;
      }

      const eventAttrs = collectAttrs(eventEl);

      const activity = eventAttrs['concept:name'] || eventAttrs['activity'] || '';
      if (!activity.trim()) {
        validationErrors.push({ type: 'missing_activity', caseId, eventIndex: totalEventsProcessed + 1 });
        if (!warnedSkippedActivity) warnedSkippedActivity = true;
        continue;
      }

      const timestamp = eventAttrs['time:timestamp'] || eventAttrs['timestamp'] || undefined;
      const resource = eventAttrs['org:resource'] || eventAttrs['resource'] || undefined;

      const attributes: Record<string, string> = {};
      for (const [k, v] of Object.entries(traceAttrs)) {
        if (k === 'concept:name') continue;
        const normKey = k.trim().toLowerCase();
        if (normKey) attributes[normKey] = v;
      }
      for (const [k, v] of Object.entries(eventAttrs)) {
        if (k === 'concept:name' || k === 'time:timestamp' || k === 'org:resource'
          || k === 'timestamp' || k === 'activity' || k === 'resource') continue;
        const normKey = k.trim().toLowerCase();
        if (normKey) attributes[normKey] = v;
      }

      if (!timestamp?.trim()) {
        validationErrors.push({ type: 'missing_timestamp', caseId, eventIndex: totalEventsProcessed + 1 });
        continue;
      }

      const tsMs = Date.parse(timestamp.trim());
      if (!Number.isFinite(tsMs)) {
        validationErrors.push({ type: 'invalid_timestamp', caseId, eventIndex: totalEventsProcessed + 1, rawValue: timestamp.trim() });
        continue;
      }

      const event: AiEventLogEventV1 = {
        caseId,
        activity: activity.trim(),
        timestamp: timestamp.trim(),
      };

      if (resource?.trim()) event.resource = resource.trim();
      if (Object.keys(attributes).length > 0) event.attributes = attributes;

      events.push(event);
      totalEventsProcessed++;
    }
  }

  if (missingCaseIdTraces > 0) {
    throw new Error(
      `XES-Import abgebrochen: ${missingCaseIdTraces} Trace(s) ohne Case-ID (concept:name fehlt oder leer).\n` +
      'Jeder XES-Trace muss ein <string key="concept:name" value="..."/> Attribut mit der echten Case-ID aus dem Quellsystem enthalten.\n' +
      'Generierte oder fehlende Case-IDs sind nicht zulässig. ' +
      'Bitte korrigieren Sie das XES und importieren Sie erneut. Kein teilbereinigtes Dataset wird gespeichert.'
    );
  }

  if (validationErrors.length > 0) {
    const missingActivity = validationErrors.filter(e => e.type === 'missing_activity');
    const missingTs = validationErrors.filter(e => e.type === 'missing_timestamp');
    const invalidTs = validationErrors.filter(e => e.type === 'invalid_timestamp');

    const parts: string[] = [];
    if (missingActivity.length > 0) {
      const samples = missingActivity.slice(0, 3).map(e => `Case "${e.caseId}" Event #${e.eventIndex}`).join(', ');
      parts.push(`${missingActivity.length} Event(s) ohne Aktivität (concept:name) (${samples}${missingActivity.length > 3 ? ', ...' : ''})`);
    }
    if (missingTs.length > 0) {
      const samples = missingTs.slice(0, 3).map(e => `Case "${e.caseId}" Event #${e.eventIndex}`).join(', ');
      parts.push(`${missingTs.length} Event(s) ohne Zeitstempel (time:timestamp) (${samples}${missingTs.length > 3 ? ', ...' : ''})`);
    }
    if (invalidTs.length > 0) {
      const samples = invalidTs.slice(0, 3).map(e => `"${e.rawValue}" (Case "${e.caseId}" Event #${e.eventIndex})`).join(', ');
      parts.push(`${invalidTs.length} Event(s) mit ungültigem Zeitstempel-Format (${samples}${invalidTs.length > 3 ? ', ...' : ''})`);
    }

    throw new Error(
      `XES-Import abgebrochen: ${validationErrors.length} Event(s) verletzen Pflichtfelder (activity/concept:name und time:timestamp müssen vorhanden und gültig sein).\n` +
      parts.join('\n') +
      '\nBitte korrigieren Sie das XES und importieren Sie erneut. Kein teilbereinigtes Dataset wird gespeichert.'
    );
  }

  const ai: AiEventLogResultV1 = {
    schemaVersion: 'ai-event-log-v1',
    language: 'de',
    timeMode: 'real',
    events,
    warnings: warnings.length > 0 ? warnings : undefined,
  };

  return { ai, sourceLabel, warnings };
}
