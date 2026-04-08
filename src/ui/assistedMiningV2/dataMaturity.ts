import type { ProcessMiningAssistedV2State, ProcessVersion } from '../../domain/process';

export type DataMaturityStatus = 'good' | 'attention' | 'missing';
export type DataMaturityLevel = 'starting' | 'usable' | 'solid' | 'strong';
export type DataMaturityActionId = 'add-source' | 'review' | 'sources' | 'details' | 'autofix';

export interface DataMaturityItem {
  key: string;
  label: string;
  status: DataMaturityStatus;
  metric?: string;
  summary: string;
  detail: string;
}

export interface DataMaturityAction {
  key: string;
  label: string;
  detail: string;
  emphasis: 'high' | 'medium' | 'low';
  actionId?: DataMaturityActionId;
}

export interface DataMaturityResult {
  level: DataMaturityLevel;
  levelLabel: string;
  headline: string;
  summary: string;
  blockers: number;
  items: DataMaturityItem[];
  actions: DataMaturityAction[];
  strengths: string[];
}

function hasHappyPath(version?: ProcessVersion): boolean {
  return Boolean(version?.sidecar.captureDraft?.happyPath?.length);
}

function countStepObservationsWith<T extends 'evidenceSnippet' | 'role' | 'system'>(
  state: ProcessMiningAssistedV2State,
  key: T,
): number {
  return state.observations.filter(observation => observation.kind === 'step' && Boolean(observation[key]?.trim())).length;
}

function pct(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 100);
}

function buildItem(
  key: string,
  label: string,
  status: DataMaturityStatus,
  metric: string,
  summary: string,
  detail: string,
): DataMaturityItem {
  return { key, label, status, metric, summary, detail };
}

function uniqueStrings(values: Array<string | undefined | null>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value?.trim())).map(value => value.trim()))];
}

export function computeDataMaturity(params: {
  state: ProcessMiningAssistedV2State;
  version?: ProcessVersion;
  reviewSuggestionCount?: number;
}): DataMaturityResult {
  const { state, version, reviewSuggestionCount = 0 } = params;
  const quality = state.qualitySummary;
  const totalCases = quality?.totalCases ?? state.cases.length;
  const stepCount = quality?.stepObservationCount ?? state.observations.filter(observation => observation.kind === 'step').length;
  const issueCount = quality?.issueObservationCount ?? state.observations.filter(observation => observation.kind === 'issue').length;
  const orderingCount = quality?.casesWithOrdering ?? 0;
  const unclearLabels = quality?.unclearLabelCount ?? 0;
  const realTimeCount = quality?.observationsWithRealTime ?? state.observations.filter(observation => observation.timestampQuality === 'real').length;
  const evidenceCount = countStepObservationsWith(state, 'evidenceSnippet');
  const roleCount = countStepObservationsWith(state, 'role');
  const systemCount = countStepObservationsWith(state, 'system');
  const happyPathAvailable = hasHappyPath(version);

  const evidencePct = pct(evidenceCount, stepCount);
  const rolePct = pct(roleCount, stepCount);
  const systemPct = pct(systemCount, stepCount);
  const timePct = pct(realTimeCount, stepCount);

  const items: DataMaturityItem[] = [
    buildItem(
      'material',
      'Materialbasis',
      totalCases >= 3 && stepCount >= 6 ? 'good' : totalCases > 0 && stepCount > 0 ? 'attention' : 'missing',
      totalCases === 0 ? 'noch leer' : `${totalCases} ${totalCases === 1 ? 'Quelle' : 'Quellen'}`,
      totalCases === 0
        ? 'Noch kein auswertbares Material vorhanden.'
        : totalCases === 1
        ? 'Die App hat einen belastbaren Erstentwurf, aber noch keinen Vergleich zwischen Fällen.'
        : 'Mehrere Quellen erlauben bereits einen Vergleich zwischen Fällen.',
      totalCases >= 5
        ? 'Mit dieser Materialbasis werden Varianten, Häufigkeiten und Hotspots deutlich robuster.'
        : 'Weitere Fälle oder Dokumente erhöhen die Belastbarkeit der Mustererkennung merklich.',
    ),
    buildItem(
      'clarity',
      'Schrittklarheit',
      stepCount === 0 ? 'missing' : reviewSuggestionCount === 0 && unclearLabels === 0 ? 'good' : 'attention',
      stepCount === 0 ? 'keine Schritte' : `${Math.max(0, stepCount - unclearLabels)} von ${stepCount} klar`,
      stepCount === 0
        ? 'Ohne erkannte Hauptschritte kann die Analyse nicht beginnen.'
        : reviewSuggestionCount === 0 && unclearLabels === 0
        ? 'Die Schrittbezeichnungen wirken bereits konsistent.'
        : 'Ein kurzer Feinschliff verbessert Discovery und Soll-Abgleich spürbar.',
      reviewSuggestionCount > 0
        ? `${reviewSuggestionCount} lokale Korrekturvorschläge warten in der Prüfwerkstatt.`
        : 'Achten Sie auf kurze oder sehr allgemeine Bezeichnungen wie „Prüfen“ oder „Klärung“.',
    ),
    buildItem(
      'ordering',
      'Reihenfolge & Vergleich',
      stepCount === 0 ? 'missing' : orderingCount >= totalCases && totalCases >= 2 ? 'good' : orderingCount > 0 ? 'attention' : 'missing',
      totalCases === 0 ? 'noch leer' : `${orderingCount} von ${totalCases} mit Reihenfolge`,
      orderingCount === 0
        ? 'Die App sieht noch keine tragfähige Schrittfolge.'
        : totalCases >= 2 && orderingCount >= totalCases
        ? 'Alle Quellen enthalten eine brauchbare Reihenfolge für Mustervergleich und Soll-Abgleich.'
        : 'Die Reihenfolge ist nur teilweise abgesichert.',
      totalCases < 2
        ? 'Für echte Varianten braucht es mindestens zwei Quellen.'
        : 'Prüfen Sie die Quellen, in denen nur ein einzelner oder ungeordneter Schritt erkannt wurde.',
    ),
    buildItem(
      'evidence',
      'Belegstellen',
      stepCount === 0 ? 'missing' : evidencePct >= 80 ? 'good' : evidencePct >= 40 ? 'attention' : 'missing',
      stepCount === 0 ? 'keine Schritte' : `${evidencePct} % der Schritte belegt`,
      stepCount === 0
        ? 'Ohne Schritte gibt es auch noch keine Belegstellen.'
        : evidencePct >= 80
        ? 'Die meisten Schritte sind mit klaren Textbelegen abgesichert.'
        : 'Nicht alle Schritte sind schon mit guten Belegstellen hinterlegt.',
      'Gute Belegstellen erleichtern Prüfung, Diskussion und spätere Übergaben.',
    ),
    buildItem(
      'context',
      'Rollen & Systeme',
      stepCount === 0 ? 'missing' : rolePct >= 50 || systemPct >= 40 ? 'good' : rolePct > 0 || systemPct > 0 ? 'attention' : 'missing',
      stepCount === 0 ? 'keine Schritte' : `${rolePct} % Rollen · ${systemPct} % Systeme`,
      stepCount === 0
        ? 'Kontext entsteht erst, sobald Schritte erkannt wurden.'
        : rolePct >= 50 || systemPct >= 40
        ? 'Ein relevanter Teil der Schritte ist bereits kontextualisiert.'
        : 'Rollen und Systeme sind noch lückenhaft hinterlegt.',
      'Mehr Kontext macht Reibungen, Übergaben und Automatisierungspotenziale greifbarer.',
    ),
    buildItem(
      'timing',
      'Zeitangaben',
      stepCount === 0 ? 'missing' : timePct >= 40 ? 'good' : realTimeCount > 0 ? 'attention' : 'missing',
      stepCount === 0 ? 'keine Schritte' : `${timePct} % mit echter Zeit`,
      stepCount === 0
        ? 'Zeitbezogene Hinweise setzen erkannte Schritte voraus.'
        : realTimeCount > 0
        ? 'Zeitangaben sind vorhanden, aber noch nicht flächig genug.'
        : 'Die Analyse bleibt derzeit auf Struktur und Reibungen fokussiert.',
      realTimeCount > 0
        ? 'Mit mehr echten Zeitpunkten werden Wartezeiten und Durchlaufzeiten stabiler.'
        : 'Ergänzen Sie nach Möglichkeit Datum, Uhrzeit oder zeitliche Reihenfolgen im Text.',
    ),
    buildItem(
      'target',
      'Soll-Basis',
      happyPathAvailable ? 'good' : stepCount > 0 ? 'attention' : 'missing',
      happyPathAvailable ? 'Happy Path vorhanden' : 'noch kein Happy Path',
      happyPathAvailable
        ? 'Der Soll-Abgleich kann sich auf die erfasste Soll-Strecke stützen.'
        : stepCount > 0
        ? 'Der Soll-Abgleich nutzt vorerst den lokal erkannten Kernprozess.'
        : 'Ohne Schritte und ohne Happy Path fehlt die Vergleichsbasis.',
      happyPathAvailable
        ? 'Das stärkt Aussagen zu Abweichungen und Ausnahmen.'
        : 'Ein gepflegter Happy Path im Capture-Teil erhöht die Aussagekraft des Soll-Abgleichs.',
    ),
  ];

  let level: DataMaturityLevel = 'starting';
  if (stepCount > 0) level = 'usable';
  if (stepCount >= 4 && totalCases >= 2 && orderingCount >= Math.min(totalCases, 2) && evidencePct >= 40) level = 'solid';
  if (stepCount >= 8 && totalCases >= 5 && orderingCount >= totalCases && evidencePct >= 70 && timePct >= 25) level = 'strong';

  const blockers = items.filter(item => item.status === 'missing').length;
  const strengths = uniqueStrings([
    totalCases >= 2 ? 'Mehrere Quellen erlauben bereits einen Vergleich.' : undefined,
    reviewSuggestionCount === 0 && stepCount > 0 ? 'Die Schrittbezeichnungen wirken bereits konsistent.' : undefined,
    issueCount > 0 ? `${issueCount} Reibungssignale wurden lokal erkannt.` : undefined,
    evidencePct >= 70 ? 'Die meisten Schritte besitzen gute Belegstellen.' : undefined,
    happyPathAvailable ? 'Ein Happy Path ist bereits als Soll-Basis vorhanden.' : undefined,
    realTimeCount > 0 ? `${realTimeCount} echte Zeitangaben erlauben erste zeitbezogene Hinweise.` : undefined,
  ]);

  const actions: DataMaturityAction[] = [];
  if (stepCount === 0) {
    actions.push({
      key: 'start-intake',
      label: 'Mindestens eine Quelle auswerten',
      detail: 'Beschreiben Sie einen Fall oder laden Sie ein Dokument hoch. Erst dann kann die App einen Prozessentwurf bilden.',
      emphasis: 'high',
      actionId: 'add-source',
    });
  }
  if (reviewSuggestionCount > 0) {
    actions.push({
      key: 'autofix',
      label: 'Lokale Standard-Reparatur anwenden',
      detail: 'Vereinheitlicht Schrittbezeichnungen, teilt typische Sammelschritte auf und führt Problemhinweise als Reibungssignal.',
      emphasis: 'high',
      actionId: 'autofix',
    });
    actions.push({
      key: 'review',
      label: 'Prüfwerkstatt öffnen',
      detail: `${reviewSuggestionCount} Korrekturvorschläge warten auf eine kurze Prüfung.`,
      emphasis: 'high',
      actionId: 'review',
    });
  }
  if (stepCount > 0 && totalCases < 2) {
    actions.push({
      key: 'second-source',
      label: 'Zweiten Fall ergänzen',
      detail: 'Mit mindestens zwei Quellen werden Unterschiede, Varianten und Soll-Abweichungen wesentlich aussagekräftiger.',
      emphasis: 'medium',
      actionId: 'add-source',
    });
  }
  if (orderingCount < totalCases && totalCases > 0) {
    actions.push({
      key: 'ordering',
      label: 'Quellen mit schwacher Reihenfolge prüfen',
      detail: 'Öffnen Sie Quellen, in denen nur einzelne oder ungeordnete Schritte erkannt wurden, und schärfen Sie die Reihenfolge nach.',
      emphasis: 'medium',
      actionId: 'sources',
    });
  }
  if (realTimeCount === 0 && stepCount > 0) {
    actions.push({
      key: 'time',
      label: 'Zeitangaben ergänzen',
      detail: 'Falls verfügbar, ergänzen Sie Uhrzeiten, Daten oder Reihenfolgehinweise in den Detailkarten.',
      emphasis: 'medium',
      actionId: 'details',
    });
  }
  if ((rolePct < 40 || systemPct < 25) && stepCount > 0) {
    actions.push({
      key: 'context',
      label: 'Rollen und Systeme nachschärfen',
      detail: 'Ergänzen Sie in wichtigen Schritten, wer beteiligt ist und in welchem System die Arbeit stattfindet.',
      emphasis: 'medium',
      actionId: 'details',
    });
  }
  if (!happyPathAvailable && stepCount > 0) {
    actions.push({
      key: 'happy-path',
      label: 'Soll-Strecke ergänzen',
      detail: 'Ein gepflegter Happy Path im Capture-Teil macht den Soll-Abgleich belastbarer. Dieser Schritt liegt außerhalb des Mining-Bereichs.',
      emphasis: 'low',
    });
  }

  const levelLabel =
    level === 'starting'
      ? 'Noch keine tragfähige Basis'
      : level === 'usable'
      ? 'Belastbarer Prozessentwurf'
      : level === 'solid'
      ? 'Vergleichsfähige Datenbasis'
      : 'Starke Basis für Mining';

  const headline =
    level === 'starting'
      ? 'Die App braucht noch auswertbares Material.'
      : level === 'usable'
      ? 'Die lokale Analyse trägt bereits einen guten Prozessentwurf.'
      : level === 'solid'
      ? 'Die Daten reichen für sinnvolle Vergleiche und stabilere Abweichungsanalysen.'
      : 'Die Datenbasis ist bereits weit genug für belastbarere Mining-Aussagen.';

  const summary =
    level === 'starting'
      ? 'Sobald mindestens eine Quelle automatisch ausgewertet wurde, entsteht eine lokale Arbeitsgrundlage aus Schritten, Rollen und Reibungssignalen.'
      : level === 'usable'
      ? 'Die App kann schon Hauptlinie, erste Reibungen und einen weichen Soll-Abgleich liefern. Für Varianten und Quoten braucht es mehr Material.'
      : level === 'solid'
      ? 'Mehrere Quellen, ausreichende Belegstellen und eine brauchbare Reihenfolge stärken Discovery, Soll-Abgleich und Hotspot-Suche deutlich.'
      : 'Mehrere saubere Fälle, gute Belegstellen und zumindest einige echte Zeitangaben machen die lokale Analyse auch ohne KI sehr tragfähig.';

  return {
    level,
    levelLabel,
    headline,
    summary,
    blockers,
    items,
    actions: actions.slice(0, 5),
    strengths,
  };
}
