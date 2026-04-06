import type { ProcessMiningAcceptanceDecision, ProcessMiningAssistedV2State, ProcessMiningBenchmarkSnapshot, ProcessMiningSecurityState } from '../../domain/process';
import { DEFAULT_SETTINGS } from '../../settings/appSettings';
import { LOCAL_MINING_ENGINE_VERSION } from './documentDerivation';
import { evaluateAcceptanceReadiness, createAcceptanceSnapshot, compareAcceptanceSnapshotToCurrent } from './acceptance';
import { buildStateForScenario } from './pilotCheckLab';
import { computeGovernanceWorkflow } from './governanceWorkflow';

export interface AcceptanceCheckResult {
  key: string;
  label: string;
  score: number;
  levelLabel: string;
  recommendedDecision: string;
  storedDecision?: string;
  snapshotFresh: boolean;
  status: 'pass' | 'attention' | 'fail';
  summary: string;
}

export interface AcceptanceCheckSuiteResult {
  engineVersion: string;
  computedAt: string;
  passedCount: number;
  attentionCount: number;
  failedCount: number;
  averageScore: number;
  headline: string;
  summary: string;
  results: AcceptanceCheckResult[];
}

function createBenchmarkSnapshot(score: number, status: 'pass' | 'attention' | 'fail', strictPass: boolean, caseCount = 12): ProcessMiningBenchmarkSnapshot {
  return {
    computedAt: new Date().toISOString(),
    engineVersion: `${LOCAL_MINING_ENGINE_VERSION} · benchmark`,
    status,
    overallScore: score,
    passedCount: status === 'pass' ? caseCount : Math.max(caseCount - 2, 0),
    attentionCount: status === 'attention' ? 2 : 0,
    failedCount: status === 'fail' ? 1 : 0,
    caseCount,
    goldCaseCount: Math.max(caseCount - 4, 0),
    samplePackCount: 4,
    headline: status === 'pass' ? 'Lokaler Benchmark wirkt stabil.' : status === 'attention' ? 'Lokaler Benchmark ist brauchbar, aber nicht ganz ruhig.' : 'Lokaler Benchmark zeigt kritische Lücken.',
    summary: `${caseCount} Referenzfälle · ${score}/100`,
    domainScores: [],
    dimensionScores: [],
    weakestCases: [],
    recommendations: [],
    strictGate: {
      pass: strictPass,
      summary: strictPass ? 'Strenger Check bestanden.' : 'Strenger Check noch nicht bestanden.',
      reasons: strictPass ? [] : ['Mindestens eine Qualitätsdimension ist noch instabil.'],
    },
  };
}

function fillAcceptanceBasics(state: ProcessMiningAssistedV2State, decision: ProcessMiningAcceptanceDecision): ProcessMiningAssistedV2State {
  const security: ProcessMiningSecurityState = {
    reviewedBy: 'IT / Datenschutz',
    reviewedAt: new Date().toISOString(),
    dataClassification: 'confidential',
    deploymentTarget: 'managed-pilot',
    allowExternalProcessing: false,
    incidentContact: 'pilot@example.org',
    retentionNote: 'Pilotmaterial wird 30 Tage aufbewahrt.',
    backupNote: 'Snapshots werden intern gesichert.',
    deploymentNote: 'Betrieb im betreuten Pilotmodus.',
    privacyNote: 'Kundendaten werden vor externer Weitergabe geschwärzt.',
  };
  return {
    ...state,
    security,
    pilotToolkit: {
      sessionTitle: 'Pilotlauf',
      sessionGoal: 'Belastbarkeit und Nutzen im Fachbereich prüfen',
      facilitator: 'Projektleitung',
      audience: 'Fachbereich, Prozessverantwortung, IT',
      plannedAt: '2026-04-20',
      note: 'Pilot mit begrenztem Kreis und festen Review-Terminen.',
      lastExportedAt: new Date().toISOString(),
    },
    acceptance: {
      decision,
      decidedBy: 'Programmleitung',
      scope: 'Betreuter Pilot mit klaren Review-Terminen',
      targetWindow: 'Nächster Entscheidungszeitpunkt in 14 Tagen',
      successCriteria: 'Bericht ist verständlich, Governance bleibt stabil und lokale Analyse spart Suchaufwand.',
      knownRisks: 'Noch nicht alle Fachbereiche sind gemessen; Chunk-Größe bleibt zu beobachten.',
      trainingNote: 'Kurze Einweisung für Fachbereich und Pilotmoderation vorgesehen.',
      note: 'Entscheidung gilt nur für den aktuellen kontrollierten Pilotstand.',
      checklist: {
        benchmarkReviewed: true,
        reportReviewed: true,
        governanceReviewed: true,
        securityReviewed: true,
        pilotPrepared: true,
        enablementPrepared: true,
      },
      history: [],
    },
  };
}

function buildReadyState() {
  const base = buildStateForScenario('complaints');
  let state = fillAcceptanceBasics(base.state, 'limited-release');
  state = {
    ...state,
    benchmarkSnapshots: [createBenchmarkSnapshot(94, 'pass', true)],
  };
  const workflow = computeGovernanceWorkflow({ state, version: base.version });
  state = {
    ...state,
    governance: {
      decisions: [],
      teamPlan: {
        coordinator: 'Programmleitung',
        reviewers: ['Fachbereich', 'IT', 'Qualität'],
        nextReviewAt: '2026-04-20',
        shareTargets: 'Pilotleitung und Management',
      },
      approval: {
        status: 'approved',
        approvedBy: 'Programmleitung',
        approvedAt: new Date().toISOString(),
        note: 'Kontrollierte begrenzte Freigabe für den Pilotbetrieb.',
        basisFingerprint: workflow.basisFingerprint,
      },
      history: [],
    },
  };
  const summary = evaluateAcceptanceReadiness({ state, version: base.version, settings: DEFAULT_SETTINGS });
  const snapshot = createAcceptanceSnapshot({ state, summary, label: 'Ready Acceptance' });
  state = {
    ...state,
    acceptance: {
      ...(state.acceptance ?? {}),
      history: [snapshot],
    },
  };
  return { ...base, state };
}

function buildAttentionState() {
  const base = buildStateForScenario('mixed');
  let state = fillAcceptanceBasics(base.state, 'continue-pilot');
  state = {
    ...state,
    benchmarkSnapshots: [createBenchmarkSnapshot(78, 'attention', false)],
    governance: {
      decisions: [
        {
          id: 'gov-1',
          title: 'Restpunkte aus Team-Review klären',
          status: 'in_review',
          sourceType: 'analysis',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      teamPlan: {
        coordinator: 'Programmleitung',
        reviewers: ['Fachbereich', 'IT'],
        reviewStartedAt: new Date().toISOString(),
        nextReviewAt: '2026-04-18',
        shareTargets: 'Pilotkreis',
      },
      history: [],
    },
    acceptance: {
      ...(state.acceptance ?? {}),
      checklist: {
        benchmarkReviewed: true,
        reportReviewed: true,
        governanceReviewed: true,
        securityReviewed: false,
        pilotPrepared: true,
        enablementPrepared: false,
      },
    },
  };
  return { ...base, state };
}

function buildBlockedState() {
  const base = buildStateForScenario('masterdata');
  const state: ProcessMiningAssistedV2State = {
    ...base.state,
    reportSnapshot: undefined,
    handoverDrafts: undefined,
    benchmarkSnapshots: [createBenchmarkSnapshot(58, 'fail', false)],
    governance: {
      decisions: [],
      teamPlan: {},
      history: [],
    },
    security: {},
    pilotToolkit: {},
    acceptance: {
      decision: 'needs-refinement',
      decidedBy: 'Programmleitung',
      checklist: {
        benchmarkReviewed: false,
        reportReviewed: false,
        governanceReviewed: false,
        securityReviewed: false,
        pilotPrepared: false,
        enablementPrepared: false,
      },
      history: [],
    },
  };
  return { ...base, state };
}

function buildScenarioStatus(params: {
  expectedLevel: 'ready' | 'attention' | 'blocked';
  expectedDecision: ProcessMiningAcceptanceDecision;
  observedLevel: 'ready' | 'attention' | 'blocked';
  observedDecision: ProcessMiningAcceptanceDecision;
  snapshotFresh: boolean;
  requireFreshSnapshot?: boolean;
}): { status: AcceptanceCheckResult['status']; score: number; summary: string } {
  const { expectedLevel, expectedDecision, observedLevel, observedDecision, snapshotFresh, requireFreshSnapshot } = params;
  const levelMatch = expectedLevel === observedLevel;
  const decisionMatch = expectedDecision === observedDecision;
  const snapshotMatch = !requireFreshSnapshot || snapshotFresh;

  const score = (levelMatch ? 45 : 20) + (decisionMatch ? 35 : 15) + (snapshotMatch ? 20 : 5);

  if (levelMatch && decisionMatch && snapshotMatch) {
    return {
      status: 'pass',
      score,
      summary: 'Erwartete Einstufung und Entscheidung wurden korrekt erkannt.',
    };
  }
  if ((levelMatch && decisionMatch) || (levelMatch && snapshotMatch) || (decisionMatch && snapshotMatch)) {
    return {
      status: 'attention',
      score,
      summary: 'Die Logik liegt nahe an der Erwartung, sollte aber noch kurz beobachtet werden.',
    };
  }
  return {
    status: 'fail',
    score,
    summary: 'Die Abnahmelogik weicht spürbar von der erwarteten Entscheidungslinie ab.',
  };
}

export function runAcceptanceCheckSuite(): AcceptanceCheckSuiteResult {
  const scenarios = [
    {
      key: 'ready',
      label: 'Formale Abnahme · begrenzte Freigabe',
      expectedLevel: 'ready' as const,
      expectedDecision: 'limited-release' as const,
      requireFreshSnapshot: true,
      data: buildReadyState(),
    },
    {
      key: 'attention',
      label: 'Formale Abnahme · Pilot mit Restpunkten',
      expectedLevel: 'attention' as const,
      expectedDecision: 'needs-refinement' as const,
      requireFreshSnapshot: false,
      data: buildAttentionState(),
    },
    {
      key: 'blocked',
      label: 'Formale Abnahme · noch nicht tragfähig',
      expectedLevel: 'blocked' as const,
      expectedDecision: 'stop' as const,
      requireFreshSnapshot: false,
      data: buildBlockedState(),
    },
  ];

  const results: AcceptanceCheckResult[] = scenarios.map(item => {
    const summary = evaluateAcceptanceReadiness({ state: item.data.state, version: item.data.version, settings: DEFAULT_SETTINGS });
    const latestSnapshot = item.data.state.acceptance?.history?.length
      ? item.data.state.acceptance.history[item.data.state.acceptance.history.length - 1]
      : undefined;
    const delta = compareAcceptanceSnapshotToCurrent(latestSnapshot, item.data.state);
    const evaluation = buildScenarioStatus({
      expectedLevel: item.expectedLevel,
      expectedDecision: item.expectedDecision,
      observedLevel: summary.level,
      observedDecision: summary.recommendedDecision,
      snapshotFresh: delta?.isAligned ?? false,
      requireFreshSnapshot: item.requireFreshSnapshot,
    });

    return {
      key: item.key,
      label: item.label,
      score: evaluation.score,
      levelLabel: summary.levelLabel,
      recommendedDecision: summary.recommendedDecisionLabel,
      storedDecision: item.data.state.acceptance?.decision,
      snapshotFresh: delta?.isAligned ?? false,
      status: evaluation.status,
      summary: `${evaluation.summary} Beobachtet: ${summary.levelLabel} · ${summary.recommendedDecisionLabel}.`,
    };
  });

  const passedCount = results.filter(item => item.status === 'pass').length;
  const attentionCount = results.filter(item => item.status === 'attention').length;
  const failedCount = results.filter(item => item.status === 'fail').length;
  const averageScore = Math.round(results.reduce((sum, item) => sum + item.score, 0) / Math.max(results.length, 1));

  return {
    engineVersion: `${LOCAL_MINING_ENGINE_VERSION} · acceptance`,
    computedAt: new Date().toISOString(),
    passedCount,
    attentionCount,
    failedCount,
    averageScore,
    headline: failedCount > 0
      ? 'Abnahme-Check zeigt noch Widersprüche in der Entscheidungslogik.'
      : attentionCount > 0
      ? 'Abnahme-Check ist grundsätzlich tragfähig, sollte aber weiter beobachtet werden.'
      : 'Abnahme-Check wirkt stabil und konsistent.',
    summary: `${results.length} Szenarien geprüft · Durchschnitt ${averageScore}/100 · ${passedCount} stabil · ${attentionCount} beobachten · ${failedCount} kritisch.`,
    results,
  };
}
