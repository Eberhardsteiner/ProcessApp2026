import type {
  ProcessMiningAssistedV2State,
  ProcessMiningObservation,
  ProcessMiningObservationCase,
} from '../../domain/process';
import { uniqueStrings } from './pmShared';

export type ImportHealthLevel = 'stable' | 'attention' | 'weak';

export interface ImportHealthSummary {
  level: ImportHealthLevel;
  headline: string;
  summary: string;
  sourceCount: number;
  sourceMix: {
    documents: number;
    narratives: number;
    tables: number;
    eventLogs: number;
  };
  sourcesWithSteps: number;
  sourcesWithoutSteps: Array<{ id: string; label: string; sourceType: string }>;
  sourcesWithWeakEvidence: Array<{ id: string; label: string; sourceType: string }>;
  sourcesWithRealTime: number;
  realTimeCoverageLabel: string;
  recommendedActions: string[];
}

function getCaseLabel(caseItem: ProcessMiningObservationCase): string {
  return caseItem.name || caseItem.caseRef || 'Unbenannte Quelle';
}

function getSourceTypeLabel(caseItem: ProcessMiningObservationCase): string {
  switch (caseItem.sourceType) {
    case 'pdf':
      return 'PDF';
    case 'docx':
      return 'DOCX';
    case 'csv-row':
      return 'CSV';
    case 'xlsx-row':
      return 'XLSX';
    case 'eventlog':
      return 'Eventdaten';
    default:
      return 'Freitext';
  }
}

function observationsForCase(
  observations: ProcessMiningObservation[],
  caseId: string,
): ProcessMiningObservation[] {
  return observations.filter(observation => observation.sourceCaseId === caseId);
}

export function evaluateImportHealth(state: ProcessMiningAssistedV2State): ImportHealthSummary {
  const cases = state.cases ?? [];
  const observations = state.observations ?? [];

  if (cases.length === 0) {
    return {
      level: 'weak',
      headline: 'Noch keine Quelle ausgewertet',
      summary: 'Sobald ein Text, Dokument oder eine Tabelle ausgewertet wurde, prüft die App hier automatisch die Import-Gesundheit.',
      sourceCount: 0,
      sourceMix: { documents: 0, narratives: 0, tables: 0, eventLogs: 0 },
      sourcesWithSteps: 0,
      sourcesWithoutSteps: [],
      sourcesWithWeakEvidence: [],
      sourcesWithRealTime: 0,
      realTimeCoverageLabel: 'Noch keine Zeitbasis vorhanden',
      recommendedActions: [
        'Zuerst einen Freitext, ein Dokument oder eine Tabelle auswerten.',
      ],
    };
  }

  const sourceMix = cases.reduce(
    (acc, caseItem) => {
      if (caseItem.sourceType === 'pdf' || caseItem.sourceType === 'docx') acc.documents += 1;
      else if (caseItem.sourceType === 'csv-row' || caseItem.sourceType === 'xlsx-row') acc.tables += 1;
      else if (caseItem.sourceType === 'eventlog') acc.eventLogs += 1;
      else acc.narratives += 1;
      return acc;
    },
    { documents: 0, narratives: 0, tables: 0, eventLogs: 0 },
  );

  const sourcesWithoutSteps: ImportHealthSummary['sourcesWithoutSteps'] = [];
  const sourcesWithWeakEvidence: ImportHealthSummary['sourcesWithWeakEvidence'] = [];
  let sourcesWithSteps = 0;
  let sourcesWithRealTime = 0;

  for (const caseItem of cases) {
    const caseObservations = observationsForCase(observations, caseItem.id);
    const stepObservations = caseObservations.filter(observation => observation.kind === 'step');
    const evidenceCount = stepObservations.filter(observation => Boolean(observation.evidenceSnippet?.trim())).length;
    const hasRealTime = caseObservations.some(observation => observation.timestampQuality === 'real');

    if (stepObservations.length === 0) {
      sourcesWithoutSteps.push({
        id: caseItem.id,
        label: getCaseLabel(caseItem),
        sourceType: getSourceTypeLabel(caseItem),
      });
    } else {
      sourcesWithSteps += 1;
      if (evidenceCount === 0 || evidenceCount < Math.ceil(stepObservations.length / 3)) {
        sourcesWithWeakEvidence.push({
          id: caseItem.id,
          label: getCaseLabel(caseItem),
          sourceType: getSourceTypeLabel(caseItem),
        });
      }
    }

    if (hasRealTime) sourcesWithRealTime += 1;
  }

  const realTimeCoverageLabel =
    sourcesWithRealTime === 0
      ? 'Keine Quelle enthält belastbare Zeitangaben. Zeit-Hotspots bleiben daher vorsichtig.'
      : sourcesWithRealTime === cases.length
      ? 'Alle Quellen enthalten echte Zeitangaben.'
      : `${sourcesWithRealTime} von ${cases.length} Quellen enthalten echte Zeitangaben.`;

  const recommendedActions = uniqueStrings([
    sourcesWithoutSteps.length > 0
      ? 'Mindestens eine Quelle liefert noch keine tragfähigen Prozessschritte. Diese Quelle erneut auswerten oder als Tabelle anders zuordnen.'
      : undefined,
    sourcesWithWeakEvidence.length > 0
      ? 'Bei einigen Quellen sind die Belegstellen noch schwach. Detailkarten oder Prüfwerkstatt helfen beim Nachschärfen.'
      : undefined,
    sourcesWithRealTime === 0
      ? 'Für belastbare Zeit-Hotspots braucht die App echte Zeitangaben aus Tabelle oder Eventdaten.'
      : undefined,
    sourceMix.tables === 0 && sourceMix.eventLogs === 0
      ? 'Wenn später ein tieferer Soll-Abgleich oder Zeitvergleich gewünscht ist, lohnt sich zusätzlich tabellarisches Material.'
      : undefined,
  ]);

  const level: ImportHealthLevel =
    sourcesWithSteps === 0 || sourcesWithoutSteps.length >= Math.max(1, Math.ceil(cases.length / 2))
      ? 'weak'
      : sourcesWithoutSteps.length > 0 || sourcesWithWeakEvidence.length > 0
      ? 'attention'
      : 'stable';

  const headline =
    level === 'stable'
      ? `${sourcesWithSteps} von ${cases.length} Quellen liefern bereits tragfähige Prozessschritte.`
      : level === 'attention'
      ? `${sourcesWithSteps} von ${cases.length} Quellen sind nutzbar, aber einzelne Importpfade brauchen noch Nachschärfung.`
      : `Die Materialbasis ist noch brüchig. Nur ${sourcesWithSteps} von ${cases.length} Quellen liefern derzeit verwertbare Prozessschritte.`;

  const summary =
    level === 'stable'
      ? 'Die App kann auf der aktuellen Basis lokal weiterarbeiten. Ergänzende Tabellen oder Zeitstempel würden die Analyse weiter stabilisieren.'
      : level === 'attention'
      ? 'Die lokale Analyse ist bereits nutzbar, sollte aber vor tieferen Auswertungen noch kurz auf schwache Quellen und Belegstellen geprüft werden.'
      : 'Die App hat bereits Material erkannt, aber noch nicht genug tragfähige Schritte. Bitte zuerst Quellen prüfen oder einen weiteren Importweg nutzen.';

  return {
    level,
    headline,
    summary,
    sourceCount: cases.length,
    sourceMix,
    sourcesWithSteps,
    sourcesWithoutSteps,
    sourcesWithWeakEvidence,
    sourcesWithRealTime,
    realTimeCoverageLabel,
    recommendedActions,
  };
}
