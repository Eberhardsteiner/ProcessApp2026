import { extractJsonFromText } from './aiImprovementPatch';
import type { EventLogEvent, ProcessMiningState, ProcessMiningDataset } from '../domain/process';
import type { CaptureDraftStep } from '../domain/capture';
import { buildActivityStats } from '../mining/processMiningLite';

export type AiEventLogSchemaVersion = 'ai-event-log-v1';

export interface AiEventLogEventV1 {
  caseId: string;
  activity: string;
  timestamp: string;
  resource?: string;
  attributes?: Record<string, string>;
}

export interface AiEventLogResultV1 {
  schemaVersion: AiEventLogSchemaVersion;
  language: 'de';
  timeMode: 'real';
  events: AiEventLogEventV1[];
  notes?: string[];
  warnings?: string[];
}

export function parseAiEventLog(text: string): AiEventLogResultV1 {
  const parsed = extractJsonFromText(text);

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('JSON ist kein Objekt.');
  }

  const obj = parsed as Record<string, unknown>;

  if (obj.schemaVersion !== 'ai-event-log-v1') {
    throw new Error('Ungültige schemaVersion. Erwartet: "ai-event-log-v1"');
  }

  if (obj.language !== 'de') {
    throw new Error('Ungültige Sprache. Erwartet: "de"');
  }

  if (obj.timeMode !== 'real') {
    throw new Error(
      'Nur timeMode="real" ist erlaubt. Synthetische Event Logs werden nicht akzeptiert. ' +
      'Process Mining erfordert echte Zeitstempel aus einem realen System-Log.'
    );
  }

  if (!Array.isArray(obj.events)) {
    throw new Error('events muss ein Array sein.');
  }

  const events = obj.events as Array<Record<string, unknown>>;

  for (let i = 0; i < events.length; i++) {
    const e = events[i];

    const caseId = typeof e.caseId === 'string' ? e.caseId.trim() : '';
    if (!caseId) {
      throw new Error(
        `Event #${i + 1}: caseId fehlt oder ist leer. ` +
        'Jedes Event muss eine echte, aus der Quelle stammende Fall-ID enthalten. ' +
        'Generierte IDs wie CASE-1 sind nicht erlaubt. Das gesamte Payload wird abgelehnt.'
      );
    }

    const activity = typeof e.activity === 'string' ? e.activity.trim() : '';
    if (!activity) {
      throw new Error(
        `Event #${i + 1} (caseId="${caseId}"): activity fehlt oder ist leer. ` +
        'Jedes Event muss eine Aktivitätsbezeichnung enthalten. Das gesamte Payload wird abgelehnt.'
      );
    }

    const ts = e.timestamp;
    if (!ts || typeof ts !== 'string' || !ts.trim()) {
      throw new Error(
        `Event #${i + 1} (caseId="${caseId}", activity="${activity}"): timestamp fehlt. ` +
        'Jedes Event muss einen echten Zeitstempel aus dem Quellsystem enthalten. ' +
        'Das gesamte Payload wird abgelehnt.'
      );
    }

    const ms = Date.parse(ts.trim());
    if (!Number.isFinite(ms)) {
      throw new Error(
        `Event #${i + 1} (caseId="${caseId}", activity="${activity}"): timestamp "${ts}" ist kein gültiges ISO-8601-Datum. ` +
        'Das gesamte Payload wird abgelehnt.'
      );
    }
  }

  return parsed as AiEventLogResultV1;
}

export function normalizeAiEventLogToProcessMining(params: {
  ai: AiEventLogResultV1;
  sourceLabel: string;
  draftSteps: CaptureDraftStep[];
  maxEvents?: number;
  evidenceSource?: { refId: string };
}): { state: ProcessMiningState; warnings: string[] } {
  const { ai, sourceLabel, draftSteps, evidenceSource } = params;
  const maxEvents = params.maxEvents ?? 200000;
  const warnings: string[] = [];

  if (ai.timeMode !== 'real') {
    throw new Error(
      'Nur timeMode="real" ist erlaubt. Synthetische Event Logs werden nicht akzeptiert. ' +
      'Process Mining erfordert echte Zeitstempel aus einem realen System-Log.'
    );
  }

  if (ai.warnings) {
    for (const w of ai.warnings) {
      if (warnings.length < 20) warnings.push(`[KI] ${w}`);
    }
  }

  const events: EventLogEvent[] = [];

  for (let i = 0; i < ai.events.length; i++) {
    const e = ai.events[i];

    const caseId = typeof e.caseId === 'string' ? e.caseId.trim() : '';
    if (!caseId) {
      throw new Error(
        `Event #${i + 1}: caseId fehlt oder ist leer. ` +
        'Jedes Event muss eine echte, aus der Quelle stammende Fall-ID enthalten. ' +
        'Generierte IDs wie CASE-1 sind nicht erlaubt. Das gesamte Payload wird abgelehnt.'
      );
    }

    const activity = typeof e.activity === 'string' ? e.activity.trim() : '';
    if (!activity) {
      throw new Error(
        `Event #${i + 1} (caseId="${caseId}"): activity fehlt oder ist leer. ` +
        'Jedes Event muss eine Aktivitätsbezeichnung enthalten. Das gesamte Payload wird abgelehnt.'
      );
    }

    const tsRaw = typeof e.timestamp === 'string' ? e.timestamp.trim() : '';
    if (!tsRaw) {
      throw new Error(
        `Event #${i + 1} (caseId="${caseId}", activity="${activity}"): timestamp fehlt. ` +
        'Jedes Event muss einen echten Zeitstempel aus dem Quellsystem enthalten. ' +
        'Das gesamte Payload wird abgelehnt.'
      );
    }

    const ms = Date.parse(tsRaw);
    if (!Number.isFinite(ms)) {
      throw new Error(
        `Event #${i + 1} (caseId="${caseId}", activity="${activity}"): timestamp "${tsRaw}" ist kein gültiges ISO-8601-Datum. ` +
        'Das gesamte Payload wird abgelehnt.'
      );
    }

    let normalizedAttributes: Record<string, string> | undefined;
    if (e.attributes && typeof e.attributes === 'object' && !Array.isArray(e.attributes)) {
      const raw = e.attributes as Record<string, unknown>;
      const entries = Object.entries(raw);
      if (entries.length > 0) {
        normalizedAttributes = {};
        let keyCount = 0;
        for (const [k, v] of entries) {
          if (keyCount >= 20) {
            if (warnings.length < 20) warnings.push(`Event #${i + 1}: attributes auf 20 Keys begrenzt.`);
            break;
          }
          if (typeof k === 'string' && typeof v === 'string') {
            const normKey = k.trim().toLowerCase();
            if (normKey) {
              normalizedAttributes[normKey] = v;
              keyCount++;
            }
          }
        }
        if (Object.keys(normalizedAttributes).length === 0) normalizedAttributes = undefined;
      }
    }

    events.push({
      caseId,
      activity,
      timestamp: new Date(ms).toISOString(),
      resource: typeof e.resource === 'string' ? e.resource.trim() || undefined : undefined,
      attributes: normalizedAttributes,
    });
  }

  if (events.length === 0) {
    throw new Error(
      'Das Event Log enthält keine Events. ' +
      'Für Process Mining werden reale Events mit caseId, activity und timestamp benötigt.'
    );
  }

  if (events.length > maxEvents) {
    throw new Error(
      `Import abgebrochen: Das Event Log enthält ${events.length.toLocaleString('de-DE')} Events und überschreitet damit das Limit von ${maxEvents.toLocaleString('de-DE')}.\n` +
      'Automatisches Kürzen des Event Logs ist nicht zulässig. Ein abgeschnittenes Log ergibt ein unvollständiges Ist-Bild.\n' +
      'Bitte das Log extern vorfiltern (z.\u202fB. auf einen Zeitraum oder eine Teilmenge von Cases) und erneut importieren.'
    );
  }

  const activityMappings = buildActivityStats(events, draftSteps);

  const importedAt = new Date().toISOString();

  const dataset: ProcessMiningDataset = {
    id: crypto.randomUUID(),
    sourceLabel,
    importedAt,
    events,
    activityMappings,
    warnings: warnings.length > 0 ? warnings : undefined,
    timeMode: 'real',
    sourceRefId: evidenceSource?.refId,
  };

  const state: ProcessMiningState = {
    schemaVersion: 'process-mining-v1',
    sourceLabel: dataset.sourceLabel,
    importedAt: dataset.importedAt,
    events: dataset.events,
    activityMappings: dataset.activityMappings,
    warnings: dataset.warnings,
    timeMode: dataset.timeMode,
    sourceRefId: dataset.sourceRefId,
    datasets: [dataset],
    activeDatasetId: dataset.id,
  };

  return { state, warnings };
}
