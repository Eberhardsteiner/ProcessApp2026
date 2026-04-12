import type { ProcessMiningAssistedV2State, ProcessVersion } from '../../domain/process';
import { computeMiningReadiness } from './analysisReadiness';
import { computeDataMaturity } from './dataMaturity';
import { buildReviewOverview } from './reviewSuggestions';

export type PilotReadinessStatus = 'good' | 'attention' | 'missing';
export type PilotReadinessLevel = 'not-ready' | 'internal-review' | 'workshop-ready' | 'pilot-ready';

export interface PilotReadinessCheck {
  key: string;
  label: string;
  status: PilotReadinessStatus;
  metric: string;
  summary: string;
  detail: string;
  action?: string;
}

export interface PilotReadinessSummary {
  level: PilotReadinessLevel;
  levelLabel: string;
  headline: string;
  summary: string;
  score: number;
  checks: PilotReadinessCheck[];
  strengths: string[];
  nextActions: string[];
  cautionNotes: string[];
}

function uniqueStrings(values: Array<string | undefined | null>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value?.trim())).map(value => value.trim()))];
}

function statusWeight(status: PilotReadinessStatus): number {
  if (status === 'good') return 100;
  if (status === 'attention') return 60;
  return 20;
}

function buildLevelLabel(level: PilotReadinessLevel): string {
  if (level === 'not-ready') return 'Noch nicht pilotnah';
  if (level === 'internal-review') return 'Gut für interne Prüfung';
  if (level === 'workshop-ready') return 'Gut für Fachworkshop';
  return 'Gut für Pilotlauf';
}

function buildCheck(
  key: string,
  label: string,
  status: PilotReadinessStatus,
  metric: string,
  summary: string,
  detail: string,
  action?: string,
): PilotReadinessCheck {
  return { key, label, status, metric, summary, detail, action };
}

export function evaluatePilotReadiness(params: {
  state: ProcessMiningAssistedV2State;
  version?: ProcessVersion;
}): PilotReadinessSummary {
  const { state, version } = params;
  const readiness = computeMiningReadiness({ state, version });
  const reviewSuggestionCount = buildReviewOverview({ cases: state.cases, observations: state.observations }).suggestionCount;
  const maturity = computeDataMaturity({ state, version, reviewSuggestionCount });
  const quality = state.qualitySummary;
  const stepCount = quality?.stepObservationCount ?? state.observations.filter(item => item.kind === 'step').length;
  const evidenceCount = quality?.stepObservationsWithEvidence ?? state.observations.filter(item => item.kind === 'step' && Boolean(item.evidenceSnippet?.trim())).length;
  const caseCount = quality?.totalCases ?? state.cases.length;
  const realTimes = quality?.observationsWithRealTime ?? state.observations.filter(item => item.timestampQuality === 'real').length;
  const evidencePct = stepCount > 0 ? Math.round((evidenceCount / stepCount) * 100) : 0;
  const hasReport = Boolean(state.reportSnapshot?.executiveSummary?.trim());
  const handoverCount = state.handoverDrafts?.length ?? 0;
  const hasAnalysisChain = Boolean(
    state.discoverySummary?.topSteps?.length && state.conformanceSummary && state.enhancementSummary,
  );
  const hasHappyPath = Boolean(version?.sidecar.captureDraft?.happyPath?.length);
  const normalizationCount = state.reviewState?.normalizationRules?.length ?? 0;
  const repairCount = state.reviewState?.repairJournal?.length ?? 0;

  const checks: PilotReadinessCheck[] = [
    buildCheck(
      'material',
      'Materialbasis',
      caseCount >= 2 && stepCount >= 6 ? 'good' : caseCount >= 1 && stepCount >= 3 ? 'attention' : 'missing',
      caseCount === 0 ? 'noch leer' : `${caseCount} ${caseCount === 1 ? 'Quelle' : 'Quellen'} · ${stepCount} Schritte`,
      caseCount === 0
        ? 'Noch kein belastbarer Arbeitsstand vorhanden.'
        : caseCount === 1
        ? 'Die App kann schon einen guten Prozessentwurf liefern, aber noch keinen robusten Vergleich.'
        : 'Mehrere Quellen liefern bereits eine brauchbare Basis für Review, Workshop und Pilotgespräche.',
      caseCount >= 3
        ? 'Mit drei oder mehr Quellen steigen Mustererkennung und Soll-Abgleich deutlich in ihrer Aussagekraft.'
        : 'Ein zusätzlicher Fall stärkt Variantenbild, Soll-Abgleich und Hotspots spürbar.',
      caseCount < 2 ? 'Mindestens einen weiteren Fall oder ein weiteres Dokument ergänzen.' : undefined,
    ),
    buildCheck(
      'evidence',
      'Belegstellen und Nachvollziehbarkeit',
      evidencePct >= 70 ? 'good' : evidencePct >= 40 ? 'attention' : 'missing',
      stepCount === 0 ? 'keine Schritte' : `${evidencePct} % belegt`,
      evidencePct >= 70
        ? 'Die meisten Schritte lassen sich gut auf konkrete Textstellen zurückführen.'
        : evidencePct > 0
        ? 'Es gibt schon Belegstellen, aber noch nicht durchgängig genug für einen Pilotlauf.'
        : 'Schritte wurden erkannt, sind aber noch kaum durch Belegstellen abgesichert.',
      'Gerade in Pilotgesprächen helfen konkrete Textbelege dabei, Vertrauen in die lokale Analyse aufzubauen.',
      evidencePct < 70 && stepCount > 0 ? 'Wichtige Schritte in der Prüfwerkstatt oder im Beleg-Inspektor kurz absichern.' : undefined,
    ),
    buildCheck(
      'alignment',
      'Analysekette',
      hasAnalysisChain ? 'good' : stepCount > 0 ? 'attention' : 'missing',
      hasAnalysisChain ? 'vollständig vorhanden' : stepCount > 0 ? 'teilweise vorhanden' : 'noch nicht gestartet',
      hasAnalysisChain
        ? 'Discovery, Soll-Abgleich und Verbesserungsanalyse liegen bereits vor.'
        : stepCount > 0
        ? 'Die Grundanalyse ist möglich, aber noch nicht vollständig durch die Folgeschritte gelaufen.'
        : 'Ohne erkannte Schritte bleibt die Analysekette leer.',
      'Ein Pilot profitiert davon, wenn die gesamte Kette von Prozessentwurf bis Verbesserungshebel einmal sauber durchlaufen wurde.',
      !hasAnalysisChain && stepCount > 0 ? 'Discovery, Soll-Abgleich und Verbesserungsanalyse nacheinander öffnen und prüfen.' : undefined,
    ),
    buildCheck(
      'communication',
      'Bericht und Übergaben',
      hasReport && handoverCount >= 2 ? 'good' : hasReport ? 'attention' : 'missing',
      hasReport ? `${handoverCount} Übergaben` : 'noch kein Bericht',
      hasReport
        ? 'Ein verständlicher Bericht liegt bereits vor und kann weitergegeben werden.'
        : 'Für eine Pilotvorbereitung fehlt noch ein lokal erzeugter Bericht.',
      'Für einen echten Test mit Fachbereichen sollte mindestens eine Management-Kurzfassung und eine Team-Übergabe vorliegen.',
      !hasReport ? 'Im letzten Schritt einen lokalen Bericht erzeugen.' : handoverCount < 2 ? 'Mindestens zwei Übergabetexte für die Zielgruppen öffnen und prüfen.' : undefined,
    ),
    buildCheck(
      'normalization',
      'Nachschärfung und Konsistenz',
      reviewSuggestionCount === 0 || normalizationCount + repairCount >= 2 ? 'good' : stepCount > 0 ? 'attention' : 'missing',
      stepCount === 0 ? 'noch leer' : `${normalizationCount} Regeln · ${repairCount} Reparaturen`,
      stepCount === 0
        ? 'Ohne Arbeitsstand gibt es noch nichts zu normalisieren.'
        : reviewSuggestionCount === 0
        ? 'Die lokale Begriffs- und Schrittlogik wirkt bereits konsistent.'
        : 'Es gibt noch offene Nachschärfungen oder erst wenige gemerkte Reparaturschritte.',
      'Gemerkte Vereinheitlichungsregeln und eine kurze Reparaturhistorie erhöhen die Stabilität neuer Ergänzungen.',
      reviewSuggestionCount > 0 ? 'Offene Vorschläge in der Prüfwerkstatt kurz abarbeiten oder begründet verwerfen.' : undefined,
    ),
    buildCheck(
      'target',
      'Vergleichsbasis und Kontext',
      hasHappyPath && realTimes > 0 ? 'good' : hasHappyPath || realTimes > 0 ? 'attention' : 'missing',
      `${hasHappyPath ? 'Happy Path vorhanden' : 'kein Happy Path'} · ${realTimes} echte Zeitangaben`,
      hasHappyPath && realTimes > 0
        ? 'Soll-Basis und erste Zeitbezüge sind vorhanden.'
        : hasHappyPath || realTimes > 0
        ? 'Ein Teil der Vergleichsbasis steht bereits, aber noch nicht vollständig.'
        : 'Soll-Basis und Zeitkontext fehlen noch weitgehend.',
      'Für einen Pilotlauf ist es hilfreich, wenn Soll-Strecke und zumindest einige echte Zeitbezüge bekannt sind.',
      !hasHappyPath ? 'Den Happy Path im Capture-Teil ergänzen.' : realTimes === 0 ? 'Wenn möglich Datums- oder Uhrzeitangaben in die Quellen aufnehmen.' : undefined,
    ),
  ];

  const score = Math.round(checks.reduce((sum, item) => sum + statusWeight(item.status), 0) / Math.max(checks.length, 1));

  let level: PilotReadinessLevel = 'not-ready';
  if (stepCount > 0 && score >= 40) level = 'internal-review';
  if (caseCount >= 2 && hasAnalysisChain && hasReport && score >= 65) level = 'workshop-ready';
  if (caseCount >= 2 && hasAnalysisChain && hasReport && evidencePct >= 70 && score >= 80) level = 'pilot-ready';

  const levelLabel = buildLevelLabel(level);
  const headline =
    level === 'not-ready'
      ? 'Der Arbeitsstand ist noch nicht stabil genug für einen Pilotlauf.'
      : level === 'internal-review'
      ? 'Die App ist gut genug für eine interne Prüfung und Nachschärfung.'
      : level === 'workshop-ready'
      ? 'Der Stand eignet sich bereits gut für einen Fachworkshop oder eine geführte Review-Runde.'
      : 'Der Stand wirkt gut vorbereitet für einen begleiteten Pilotlauf.';

  const summary =
    level === 'not-ready'
      ? 'Zuerst braucht es mindestens eine belastbare Quelle, erkannte Schritte und eine kurze Prüfung der Beleglage.'
      : level === 'internal-review'
      ? 'Die lokale Analyse kann jetzt sinnvoll intern geprüft, erklärt und nachgeschärft werden.'
      : level === 'workshop-ready'
      ? 'Bericht, Übergaben und lokale Analyse sind ausreichend weit, um mit Fachbereichen belastbar zu diskutieren.'
      : 'Die Kombination aus Materialbasis, Analysekette, Bericht und Nachvollziehbarkeit wirkt stark genug für einen ersten Pilotbetrieb.';

  const strengths = uniqueStrings([
    ...maturity.strengths,
    hasReport ? 'Ein lokaler Bericht liegt bereits vor.' : undefined,
    handoverCount >= 2 ? 'Mehrere Übergaben sind bereits vorbereitet.' : undefined,
    hasAnalysisChain ? 'Die vollständige Analysekette wurde bereits durchlaufen.' : undefined,
  ]).slice(0, 6);

  const nextActions = uniqueStrings([
    ...checks.map(item => item.action),
    ...maturity.actions.map(action => action.label),
    ...readiness.nextActions,
  ]).slice(0, 5);

  const cautionNotes = uniqueStrings([
    ...readiness.cautionNotes,
    ...(level === 'not-ready' ? ['Aussagen sollten derzeit nur als Prozessentwurf und nicht als Pilotbefund gelesen werden.'] : []),
    ...(level === 'internal-review' ? ['Für einen Pilotlauf sollte mindestens Bericht, Analysekette und Beleglage noch einmal kurz geprüft werden.'] : []),
  ]).slice(0, 4);

  return {
    level,
    levelLabel,
    headline,
    summary,
    score,
    checks,
    strengths,
    nextActions,
    cautionNotes,
  };
}
