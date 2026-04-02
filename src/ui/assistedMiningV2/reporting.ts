import type {
  Process,
  ProcessVersion,
  ProcessMiningAssistedV2State,
  ProcessMiningHandoverDraft,
  ProcessMiningReportAudience,
  ProcessMiningReportSnapshot,
} from '../../domain/process';
import { computeMiningReadiness } from './analysisReadiness';
import { computeDataMaturity } from './dataMaturity';
import { buildReviewOverview } from './reviewSuggestions';
import {
  buildAnalysisModeNotice,
  detectProcessMiningAnalysisMode,
  getAnalysisModeLabel,
  sentenceCase,
  uniqueStrings,
} from './pmShared';

function joinSteps(steps: string[], limit = 5): string {
  const relevant = steps.filter(Boolean).slice(0, limit);
  if (relevant.length === 0) return 'noch keine klaren Hauptschritte';
  if (relevant.length === 1) return relevant[0];
  if (relevant.length === 2) return `${relevant[0]} und ${relevant[1]}`;
  return `${relevant.slice(0, -1).join(', ')} und ${relevant[relevant.length - 1]}`;
}

function asBulletList(lines: string[]): string {
  return lines.filter(Boolean).map(line => `- ${line}`).join('\n');
}

function firstOrFallback(values: string[], fallback: string): string {
  return values.find(value => value.trim().length > 0) ?? fallback;
}

function buildStoryParagraphs(params: {
  state: ProcessMiningAssistedV2State;
  version: ProcessVersion;
  analysisModeLabel: string;
}): string {
  const { state, version, analysisModeLabel } = params;
  const coreSteps = state.discoverySummary?.topSteps ?? [];
  const deviations = state.conformanceSummary?.deviationNotes ?? [];
  const issues = state.enhancementSummary?.issues ?? [];
  const happyPath = version.sidecar.captureDraft?.happyPath?.map(step => step.label) ?? [];
  const quality = state.qualitySummary;
  const realTimes = quality?.observationsWithRealTime ?? state.observations.filter(item => item.timestampQuality === 'real').length;

  const paragraphs = [
    `Die aktuelle Auswertung ist als ${analysisModeLabel.toLowerCase()} zu lesen. Erkennbar ist vor allem eine Hauptlinie mit ${coreSteps.length > 0 ? joinSteps(coreSteps, 6) : 'noch unklaren Schritten'}.`,
    deviations.length > 0
      ? `Im Soll-Abgleich fällt aktuell besonders auf: ${deviations[0]}. ${deviations.length > 1 ? `Weitere Auffälligkeiten betreffen ${joinSteps(deviations.slice(1), 2)}.` : ''}`.trim()
      : happyPath.length > 0
      ? 'Der Soll-Abgleich zeigt aktuell keine dominante Abweichung. Das spricht dafür, dass die erkannte Hauptlinie grob zum vorhandenen Happy Path passt.'
      : 'Für den Soll-Abgleich liegt noch kein eigener Happy Path vor. Die App nutzt deshalb vorerst die lokal erkannte Hauptlinie als Vergleichsbasis.',
    issues.length > 0
      ? `Als wichtigster Reibungspunkt zeigt sich derzeit ${issues[0].title.toLowerCase()}. ${issues[0].description}`
      : 'Die lokale Analyse sieht derzeit noch keinen dominanten Reibungspunkt. Mit mehr Material oder klareren Belegstellen werden Verbesserungshebel meist greifbarer.',
    realTimes > 0
      ? 'Da echte Zeitangaben vorliegen, können erste zeitbezogene Hinweise in die Verbesserungsgespräche einfließen.'
      : 'Zeitangaben fehlen derzeit weitgehend. Die Ergebnisse sind deshalb vor allem als strukturelle und inhaltliche Analyse zu lesen.',
  ];

  return paragraphs.join('\n\n');
}

function buildExecutiveSummary(params: {
  process: Process;
  state: ProcessMiningAssistedV2State;
  version: ProcessVersion;
}): string {
  const { process, state, version } = params;
  const readiness = computeMiningReadiness({ state, version });
  const reviewSuggestionCount = buildReviewOverview({ cases: state.cases, observations: state.observations }).suggestionCount;
  const maturity = computeDataMaturity({ state, version, reviewSuggestionCount });
  const coreSteps = state.discoverySummary?.topSteps ?? [];
  const deviations = state.conformanceSummary?.deviationNotes ?? [];
  const issues = state.enhancementSummary?.issues ?? [];
  const caseCount = state.qualitySummary?.totalCases ?? state.cases.length;

  const lines: string[] = [
    `Für den Prozess „${process.title}“ liegt aktuell ${readiness.headline.toLowerCase()}`,
    `Die Materialbasis umfasst ${caseCount} ${caseCount === 1 ? 'Quelle' : 'Quellen'} und erreicht derzeit den Reifegrad „${maturity.levelLabel}“.`,
    coreSteps.length > 0
      ? `Die aktuell erkennbare Hauptlinie verläuft über ${joinSteps(coreSteps, 5)}.`
      : 'Eine stabile Hauptlinie ist noch nicht erkennbar.',
    deviations.length > 0
      ? `Der wichtigste Soll-Hinweis lautet: ${deviations[0]}.`
      : version.sidecar.captureDraft?.happyPath?.length
      ? 'Im Soll-Abgleich zeigt sich aktuell keine dominierende Abweichung.'
      : 'Ein eigener Happy Path fehlt noch; der Soll-Abgleich arbeitet deshalb vorerst mit der lokalen Hauptlinie.',
    issues.length > 0
      ? `Der deutlichste Reibungspunkt ist derzeit „${issues[0].title}“.`
      : 'Ein dominanter Reibungspunkt ist derzeit noch nicht abgesichert.',
  ];

  if (maturity.actions[0]) {
    lines.push(`Als nächster sinnvoller Schritt bietet sich an: ${maturity.actions[0].label}.`);
  }

  return lines.join(' ');
}

function buildNextActions(params: {
  state: ProcessMiningAssistedV2State;
  version: ProcessVersion;
}): string[] {
  const { state, version } = params;
  const readiness = computeMiningReadiness({ state, version });
  const reviewSuggestionCount = buildReviewOverview({ cases: state.cases, observations: state.observations }).suggestionCount;
  const maturity = computeDataMaturity({ state, version, reviewSuggestionCount });

  return uniqueStrings([
    ...(maturity.actions.slice(0, 3).map(action => sentenceCase(action.label))),
    ...(readiness.nextActions.slice(0, 2).map(action => sentenceCase(action))),
  ]).slice(0, 5);
}

function buildHandoverText(params: {
  audience: ProcessMiningReportAudience;
  process: Process;
  state: ProcessMiningAssistedV2State;
  version: ProcessVersion;
  report: ProcessMiningReportSnapshot;
}): ProcessMiningHandoverDraft {
  const { audience, process, state, version, report } = params;
  const quality = state.qualitySummary;
  const caseCount = quality?.totalCases ?? state.cases.length;
  const coreSteps = state.discoverySummary?.topSteps ?? [];
  const deviations = state.conformanceSummary?.deviationNotes ?? [];
  const issues = state.enhancementSummary?.issues ?? [];
  const ready = computeMiningReadiness({ state, version });

  if (audience === 'management') {
    const text = [
      `Management-Kurzbrief | ${process.title}`,
      '',
      `Stand: ${new Date(report.generatedAt).toLocaleString('de-DE')}`,
      `Einordnung: ${getAnalysisModeLabel(report.analysisMode)}`,
      '',
      'Kernaussage',
      report.executiveSummary,
      '',
      'Wichtigste Befunde',
      asBulletList(report.keyFindings),
      '',
      'Empfohlene nächste Schritte',
      asBulletList(report.nextActions.slice(0, 3)),
      '',
      'Einordnung der Belastbarkeit',
      firstOrFallback(report.cautionNotes, ready.summary),
    ].join('\n');
    return {
      audience,
      label: 'Management-Kurzbrief',
      summary: 'Knapper Überblick für Entscheidungsträger mit Kernaussage, Risiken und nächsten Schritten.',
      text,
    };
  }

  if (audience === 'process_owner') {
    const text = [
      `Übergabe an Prozessverantwortung | ${process.title}`,
      '',
      'Was die App aktuell als Hauptlinie sieht',
      asBulletList(coreSteps.length > 0 ? coreSteps.slice(0, 8) : ['Noch keine stabile Hauptlinie erkennbar.']),
      '',
      'Worauf im Soll-Abgleich geachtet werden sollte',
      asBulletList(deviations.slice(0, 5).length > 0 ? deviations.slice(0, 5) : ['Der Soll-Abgleich zeigt aktuell keine dominante Abweichung.']),
      '',
      'Was fachlich zuerst geklärt oder bestätigt werden sollte',
      asBulletList(report.nextActions.slice(0, 4)),
    ].join('\n');
    return {
      audience,
      label: 'Übergabe an Prozessverantwortung',
      summary: 'Fokussiert auf Hauptlinie, Soll-Abgleich und fachliche Klärpunkte.',
      text,
    };
  }

  if (audience === 'operations') {
    const text = [
      `Arbeitsübergabe für das operative Team | ${process.title}`,
      '',
      'Bitte als Nächstes prüfen',
      asBulletList(report.nextActions.slice(0, 4)),
      '',
      'Wichtige Reibungspunkte',
      asBulletList(issues.slice(0, 4).map(issue => `${issue.title}: ${issue.description}`)),
      '',
      'Datenlage',
      `${caseCount} ${caseCount === 1 ? 'Quelle wurde' : 'Quellen wurden'} ausgewertet. ${firstOrFallback(report.cautionNotes, 'Die Ergebnisse sind lokal belastbar genug für die nächste Arbeitsschleife.')}`,
    ].join('\n');
    return {
      audience,
      label: 'Arbeitsübergabe für das Team',
      summary: 'Konkrete Arbeits- und Prüfhinweise für die nächste operative Schleife.',
      text,
    };
  }

  const text = [
    `Workshop-Fahrplan | ${process.title}`,
    '',
    'So lässt sich die Lage im Termin kurz erzählen',
    report.processStory,
    '',
    'Drei Fragen für den nächsten Workshop',
    asBulletList([
      'Welche der erkannten Hauptschritte sind fachlich korrekt und welche müssen umbenannt oder getrennt werden?',
      firstOrFallback(deviations.slice(0, 1), 'Wo sollte der Happy Path zuerst ergänzt oder geschärft werden?'),
      firstOrFallback(report.nextActions.slice(0, 1), 'Welcher nächste Schritt stärkt die Analyse am schnellsten?'),
    ]),
  ].join('\n');
  return {
    audience,
    label: 'Workshop-Fahrplan',
    summary: 'Erzählt den Stand verständlich weiter und liefert gute Leitfragen für den nächsten Termin.',
    text,
  };
}

export function buildProcessMiningReport(params: {
  process: Process;
  version: ProcessVersion;
  state: ProcessMiningAssistedV2State;
}): {
  snapshot: ProcessMiningReportSnapshot;
  handovers: ProcessMiningHandoverDraft[];
} {
  const { process, version, state } = params;
  const analysisMode = detectProcessMiningAnalysisMode({
    cases: state.cases,
    observations: state.observations,
    lastDerivationSummary: state.lastDerivationSummary,
  });
  const analysisModeLabel = getAnalysisModeLabel(analysisMode);
  const reviewSuggestionCount = buildReviewOverview({ cases: state.cases, observations: state.observations }).suggestionCount;
  const maturity = computeDataMaturity({ state, version, reviewSuggestionCount });
  const coreSteps = state.discoverySummary?.topSteps ?? [];
  const deviations = state.conformanceSummary?.deviationNotes ?? [];
  const issues = state.enhancementSummary?.issues ?? [];
  const caseCount = state.qualitySummary?.totalCases ?? state.cases.length;
  const quality = state.qualitySummary;
  const now = new Date().toISOString();

  const keyFindings = uniqueStrings([
    coreSteps.length > 0 ? `Hauptlinie erkannt: ${joinSteps(coreSteps, 5)}.` : undefined,
    deviations[0] ? `Wichtigster Soll-Hinweis: ${deviations[0]}.` : undefined,
    issues[0] ? `Wichtigster Reibungspunkt: ${issues[0].title}.` : undefined,
    quality?.stepObservationsWithEvidence ? `${quality.stepObservationsWithEvidence} Schritte sind bereits mit Belegstellen abgesichert.` : undefined,
    caseCount > 1 ? `${caseCount} Quellen erlauben bereits einen Vergleich zwischen Fällen.` : undefined,
  ]).slice(0, 5);

  const nextActions = buildNextActions({ state, version });
  const cautionNotes = uniqueStrings([
    buildAnalysisModeNotice({
      mode: analysisMode,
      caseCount,
      documentKind: state.lastDerivationSummary?.documentKind,
    }),
    ...(computeMiningReadiness({ state, version }).cautionNotes ?? []),
    ...(maturity.items.filter(item => item.status !== 'good').slice(0, 2).map(item => item.detail) ?? []),
  ]).slice(0, 4);

  const executiveSummary = buildExecutiveSummary({ process, state, version });
  const processStory = buildStoryParagraphs({ state, version, analysisModeLabel });
  const title = `Mining-Überblick · ${process.title}`;

  const markdown = [
    `# ${title}`,
    '',
    `**Stand:** ${new Date(now).toLocaleString('de-DE')}`,
    `**Einordnung:** ${analysisModeLabel}`,
    `**Datenreife:** ${maturity.levelLabel}`,
    '',
    '## Management-Zusammenfassung',
    '',
    executiveSummary,
    '',
    '## Die Geschichte des aktuell erkennbaren Prozesses',
    '',
    processStory,
    '',
    '## Wichtigste Befunde',
    '',
    asBulletList(keyFindings),
    '',
    '## Nächste sinnvolle Schritte',
    '',
    asBulletList(nextActions),
    '',
    '## Wichtige Einordnung der Belastbarkeit',
    '',
    asBulletList(cautionNotes),
  ].join('\n');

  const snapshot: ProcessMiningReportSnapshot = {
    title,
    executiveSummary,
    processStory,
    keyFindings,
    nextActions,
    cautionNotes,
    markdown,
    analysisMode,
    generatedAt: now,
  };

  const handovers: ProcessMiningHandoverDraft[] = [
    buildHandoverText({ audience: 'management', process, state, version, report: snapshot }),
    buildHandoverText({ audience: 'process_owner', process, state, version, report: snapshot }),
    buildHandoverText({ audience: 'operations', process, state, version, report: snapshot }),
    buildHandoverText({ audience: 'workshop', process, state, version, report: snapshot }),
  ];

  return { snapshot, handovers };
}

export function buildReportEvidenceText(snapshot: ProcessMiningReportSnapshot): string {
  return `${snapshot.title}\n\n${snapshot.markdown}`;
}
