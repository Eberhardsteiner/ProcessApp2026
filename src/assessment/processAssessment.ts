import type { Process, ProcessVersion } from '../domain/process';

export type Level = 'low' | 'medium' | 'high';

export interface AssessmentDimension {
  key: string;
  label: string;
  score0to100: number;
  level: Level;
  rationale: string[];
  recommendations: string[];
}

export interface ProcessAssessment {
  generatedAt: string;
  overallScore0to100: number;
  summary: string;
  dimensions: AssessmentDimension[];
  nextSteps: string[];
  automationHints: string[];
}

function levelToScore(level: Level): number {
  switch (level) {
    case 'low':
      return 25;
    case 'medium':
      return 60;
    case 'high':
      return 85;
  }
}

function scoreToLevel(score: number): Level {
  if (score >= 70) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

function invertScore(score: number): number {
  return 100 - score;
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

export function assessProcess(_process: Process, version: ProcessVersion): ProcessAssessment {
  const signals = version.sidecar.aiReadinessSignals ?? {
    standardization: 'low',
    dataAvailability: 'low',
    variability: 'low',
    complianceRisk: 'low',
  };

  const captureDraft = version.sidecar.captureDraft || {
    draftVersion: 'capture-draft-v1' as const,
    happyPath: [],
    decisions: [],
    exceptions: [],
  };

  const systems = version.sidecar.systems.length;
  const dataObjects = version.sidecar.dataObjects.length;
  const kpis = version.sidecar.kpis.length;
  const roles = version.sidecar.roles.length;
  const happyPathSteps = captureDraft.happyPath.length;
  const decisions = captureDraft.decisions.length;
  const exceptions = captureDraft.exceptions.length;

  const stepsWithRole = captureDraft.happyPath.filter((s) => s.roleId).length;
  const stepsWithSystem = captureDraft.happyPath.filter((s) => s.systemId).length;
  const stepsWithoutRole = happyPathSteps - stepsWithRole;

  const dimensions: AssessmentDimension[] = [];

  const standardizationScore = calculateStandardization(
    signals,
    happyPathSteps,
    decisions,
    exceptions
  );
  dimensions.push(standardizationScore);

  const dataItScore = calculateDataIT(
    signals,
    systems,
    dataObjects,
    stepsWithSystem,
    happyPathSteps
  );
  dimensions.push(dataItScore);

  const automationScore = calculateAutomation(
    standardizationScore.score0to100,
    dataItScore.score0to100,
    signals,
    kpis,
    stepsWithoutRole,
    happyPathSteps
  );
  dimensions.push(automationScore);

  const riskScore = calculateRisk(signals);
  dimensions.push(riskScore);

  const overallScore = clamp(
    Math.round(
      (standardizationScore.score0to100 * 0.25 +
        dataItScore.score0to100 * 0.25 +
        automationScore.score0to100 * 0.35 +
        riskScore.score0to100 * 0.15)
    )
  );

  const summary = generateSummary(overallScore);
  const nextSteps = generateNextSteps(
    roles,
    stepsWithoutRole,
    systems,
    stepsWithSystem,
    dataObjects,
    kpis,
    decisions,
    happyPathSteps,
    version
  );
  const automationHints = generateAutomationHints(
    automationScore.score0to100,
    standardizationScore.score0to100,
    dataItScore.score0to100,
    signals
  );

  return {
    generatedAt: new Date().toISOString(),
    overallScore0to100: overallScore,
    summary,
    dimensions,
    nextSteps,
    automationHints,
  };
}

function calculateStandardization(
  signals: NonNullable<ProcessVersion['sidecar']['aiReadinessSignals']>,
  happyPathSteps: number,
  decisions: number,
  exceptions: number
): AssessmentDimension {
  let score = levelToScore(signals.standardization);
  const rationale: string[] = [];
  const recommendations: string[] = [];

  rationale.push(`Ausgangsbewertung: ${signals.standardization}`);

  if (happyPathSteps > 15) {
    score -= 10;
    rationale.push(`Prozess hat ${happyPathSteps} Schritte (sehr lang)`);
    recommendations.push('Prüfen Sie, ob der Prozess in Unterprozesse aufgeteilt werden kann');
  } else if (happyPathSteps < 5) {
    score -= 5;
    rationale.push(`Prozess hat nur ${happyPathSteps} Schritte (möglicherweise zu abstrakt)`);
    recommendations.push('Detaillieren Sie die Prozessschritte für bessere Transparenz');
  } else {
    rationale.push(`Schrittanzahl (${happyPathSteps}) ist angemessen`);
  }

  const variantComplexity = decisions + exceptions;
  if (variantComplexity > 5) {
    score -= 15;
    rationale.push(`${variantComplexity} Entscheidungen/Ausnahmen erhöhen die Variabilität`);
    recommendations.push('Dokumentieren Sie alle Varianten sauber und prüfen Sie Vereinfachungspotenzial');
  } else if (variantComplexity > 2) {
    score -= 5;
    rationale.push(`${variantComplexity} Entscheidungen/Ausnahmen vorhanden`);
  } else if (variantComplexity === 0 && happyPathSteps > 5) {
    rationale.push('Keine dokumentierten Varianten (ideal für Standardisierung)');
    recommendations.push('Falls es doch Sonderfälle gibt, dokumentieren Sie diese');
  }

  score = clamp(score);
  const level = scoreToLevel(score);

  if (level === 'low') {
    recommendations.push('Fokussieren Sie auf Prozessstabilität vor Automatisierung');
  }

  return {
    key: 'standardization',
    label: 'Standardisierung',
    score0to100: score,
    level,
    rationale,
    recommendations,
  };
}

function calculateDataIT(
  signals: NonNullable<ProcessVersion['sidecar']['aiReadinessSignals']>,
  systems: number,
  dataObjects: number,
  stepsWithSystem: number,
  happyPathSteps: number
): AssessmentDimension {
  let score = levelToScore(signals.dataAvailability);
  const rationale: string[] = [];
  const recommendations: string[] = [];

  rationale.push(`Datenverfügbarkeit: ${signals.dataAvailability}`);

  if (systems > 0 && dataObjects > 0) {
    score += 10;
    rationale.push(`${systems} Systeme und ${dataObjects} Datenobjekte erfasst`);
  } else if (systems > 0 && dataObjects === 0) {
    score -= 10;
    rationale.push(`${systems} Systeme vorhanden, aber keine Datenobjekte definiert`);
    recommendations.push('Definieren Sie die wichtigsten Datenobjekte (z.B. Kunde, Auftrag, Rechnung)');
  } else if (systems === 0) {
    rationale.push('Keine IT-Systeme erfasst');
    recommendations.push('Erfassen Sie die genutzten IT-Systeme im Setup-Tab');
  }

  if (systems > 0 && stepsWithSystem === 0) {
    score -= 15;
    rationale.push('Systeme sind nicht den Schritten zugeordnet');
    recommendations.push('Ordnen Sie Systeme den Schritten zu (Draft-Tab: „Schritt-Details“)');
  } else if (systems > 0 && stepsWithSystem < happyPathSteps / 2) {
    score -= 5;
    rationale.push(`Nur ${stepsWithSystem} von ${happyPathSteps} Schritten haben System-Zuordnung`);
    recommendations.push('Vervollständigen Sie die System-Zuordnung (Draft-Tab: „Schritt-Details“)');
  } else if (stepsWithSystem > 0) {
    rationale.push(`${stepsWithSystem} von ${happyPathSteps} Schritten nutzen IT-Systeme`);
  }

  score = clamp(score);
  const level = scoreToLevel(score);

  if (level === 'low') {
    recommendations.push('Digitalisierung ist Voraussetzung für Automatisierung - starten Sie hier');
  }

  return {
    key: 'dataIT',
    label: 'Daten & IT-Unterstützung',
    score0to100: score,
    level,
    rationale,
    recommendations,
  };
}

function calculateAutomation(
  standardizationScore: number,
  dataItScore: number,
  signals: NonNullable<ProcessVersion['sidecar']['aiReadinessSignals']>,
  kpis: number,
  stepsWithoutRole: number,
  happyPathSteps: number
): AssessmentDimension {
  const variabilityScore = invertScore(levelToScore(signals.variability));
  const riskInverted = invertScore(levelToScore(signals.complianceRisk));

  let score = Math.round(
    standardizationScore * 0.35 + dataItScore * 0.35 + variabilityScore * 0.15 + riskInverted * 0.15
  );

  const rationale: string[] = [];
  const recommendations: string[] = [];

  rationale.push('Berechnet aus Standardisierung, Daten/IT, Variabilität und Risiko');
  rationale.push(`Standardisierung trägt ${Math.round(standardizationScore * 0.35)} Punkte bei`);
  rationale.push(`Daten & IT tragen ${Math.round(dataItScore * 0.35)} Punkte bei`);

  if (kpis === 0) {
    score -= 10;
    rationale.push('Keine KPIs definiert erschwert Erfolgsmessung');
    recommendations.push('Definieren Sie 1-3 Kennzahlen zur Erfolgsmessung');
  } else {
    rationale.push(`${kpis} KPIs zur Erfolgsmessung definiert`);
  }

  if (stepsWithoutRole > happyPathSteps / 2) {
    score -= 10;
    rationale.push(`${stepsWithoutRole} Schritte ohne Rollenzuordnung`);
    recommendations.push('Klären Sie Verantwortlichkeiten: Wer führt welchen Schritt aus?');
  } else if (stepsWithoutRole > 0) {
    score -= 5;
    rationale.push(`${stepsWithoutRole} Schritte noch ohne Rollenzuordnung`);
  }

  score = clamp(score);
  const level = scoreToLevel(score);

  if (level === 'high') {
    recommendations.push('Prozess hat gutes Automatisierungspotenzial - erstellen Sie einen Umsetzungsplan');
  } else if (level === 'medium') {
    recommendations.push('Teilautomatisierung ist möglich - identifizieren Sie die besten Kandidaten');
  } else {
    recommendations.push('Fokussieren Sie zunächst auf Standardisierung und Digitalisierung');
  }

  return {
    key: 'automation',
    label: 'Automatisierbarkeit',
    score0to100: score,
    level,
    rationale,
    recommendations,
  };
}

function calculateRisk(
  signals: NonNullable<ProcessVersion['sidecar']['aiReadinessSignals']>
): AssessmentDimension {
  const riskLevel = signals.complianceRisk;
  const score = invertScore(levelToScore(riskLevel));
  const rationale: string[] = [];
  const recommendations: string[] = [];

  rationale.push(`Compliance-Risiko: ${riskLevel}`);

  if (riskLevel === 'high') {
    rationale.push('Hohe Anforderungen an Nachvollziehbarkeit und Kontrolle');
    recommendations.push('Implementieren Sie Freigabe-Workflows und Vier-Augen-Prinzip');
    recommendations.push('Stellen Sie vollständigen Audit-Trail sicher');
    recommendations.push('Human-in-the-loop für kritische Entscheidungen ist Pflicht');
  } else if (riskLevel === 'medium') {
    rationale.push('Moderate Risikobewertung erfordert Überwachung');
    recommendations.push('Implementieren Sie Stichprobenkontrollen');
    recommendations.push('Richten Sie Monitoring und Alerting ein');
    recommendations.push('Definieren Sie klare Eskalationswege');
  } else {
    rationale.push('Niedriges Risiko erlaubt hohen Automatisierungsgrad');
    recommendations.push('Straight-through-Processing ist möglich');
    recommendations.push('Fokussieren Sie auf Exception-Handling');
  }

  const level = scoreToLevel(score);

  return {
    key: 'risk',
    label: 'Risiko & Kontrollen',
    score0to100: score,
    level,
    rationale,
    recommendations,
  };
}

function generateSummary(overallScore: number): string {
  const level = scoreToLevel(overallScore);

  if (level === 'high') {
    return `Dieser Prozess zeigt exzellentes Potenzial für Digitalisierung und Automatisierung (${overallScore}/100). Die Voraussetzungen sind gut, um zeitnah konkrete Maßnahmen umzusetzen.`;
  } else if (level === 'medium') {
    return `Dieser Prozess hat moderates Potenzial für Digitalisierung und Automatisierung (${overallScore}/100). Mit gezielten Verbesserungen in den identifizierten Bereichen kann das Potenzial deutlich gesteigert werden.`;
  } else {
    return `Dieser Prozess benötigt noch grundlegende Arbeit an Standardisierung und Digitalisierung (${overallScore}/100). Fokussieren Sie zunächst auf die Basis, bevor Sie Automatisierung angehen.`;
  }
}

function generateNextSteps(
  roles: number,
  stepsWithoutRole: number,
  systems: number,
  stepsWithSystem: number,
  dataObjects: number,
  kpis: number,
  decisions: number,
  happyPathSteps: number,
  version: ProcessVersion
): string[] {
  const steps: string[] = [];

  if (roles === 0) {
    steps.push('Erfassen Sie die beteiligten Rollen im Setup-Tab');
  }

  if (roles > 0 && stepsWithoutRole > happyPathSteps / 2) {
    steps.push('Ordnen Sie allen Prozessschritten Rollen zu (Draft-Tab: „Schritt-Details“)');
  }

  if (systems === 0) {
    steps.push('Erfassen Sie die genutzten IT-Systeme im Setup-Tab');
  }

  if (systems > 0 && stepsWithSystem === 0) {
    steps.push('Ordnen Sie die Systeme den entsprechenden Schritten zu (Draft-Tab: „Schritt-Details“)');
  }

  if (dataObjects === 0) {
    steps.push('Definieren Sie die wichtigsten Datenobjekte im Setup-Tab');
  }

  if (kpis === 0) {
    steps.push('Definieren Sie 1-3 Kennzahlen zur Erfolgsmessung (Setup-Tab)');
  }

  if (decisions === 0 && happyPathSteps > 5) {
    steps.push('Dokumentieren Sie Entscheidungspunkte und Varianten (Wizard-Phase „Entscheidungen“)');
  }

  if (!version.sidecar.automationNotes || version.sidecar.automationNotes.length === 0) {
    steps.push('Notieren Sie erste Automatisierungsideen (Wizard-Phase „Automatisierung“)');
  }

  if (steps.length === 0) {
    steps.push('Grundlegende Erfassung ist vollständig - fokussieren Sie auf Detaillierung und Umsetzung');
  }

  return steps.slice(0, 8);
}

function generateAutomationHints(
  automationScore: number,
  standardizationScore: number,
  dataItScore: number,
  signals: NonNullable<ProcessVersion['sidecar']['aiReadinessSignals']>
): string[] {
  const hints: string[] = [];

  if (automationScore >= 70) {
    hints.push('✓ Workflow-Automatisierung ist realistisch und sollte geprüft werden');
    hints.push('✓ RPA (Robotic Process Automation) könnte für manuelle IT-Schritte eingesetzt werden');
  } else if (automationScore >= 40) {
    hints.push('○ Teilautomatisierung einzelner Schritte ist möglich');
    hints.push('○ Starten Sie mit den am besten standardisierten Teilprozessen');
  } else {
    hints.push('− Vollautomatisierung ist noch nicht realistisch');
    hints.push('− Fokussieren Sie auf Prozessverbesserung vor Automatisierung');
  }

  if (standardizationScore >= 60 && dataItScore < 40) {
    hints.push('! Gute Standardisierung, aber Digitalisierung fehlt noch');
    hints.push('! Erst Datenerfassung und IT-Integration verbessern, dann automatisieren');
  }

  if (signals.variability === 'high') {
    hints.push('○ Hohe Variabilität → Eher Assistenzfunktionen als Vollautomatisierung');
    hints.push('○ KI-basierte Entscheidungsunterstützung könnte sinnvoll sein');
  }

  if (signals.complianceRisk === 'high') {
    hints.push('! Hohes Risiko → Human-in-the-loop ist Pflicht');
    hints.push('! Automatisierung kann Compliance unterstützen (Audit-Trail, Konsistenz)');
  }

  return hints;
}
