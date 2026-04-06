import type { ProcessMiningAssistedV2State } from '../../domain/process';
import { createEmptyV2State } from './storage';
import { hardenWorkspaceState } from './workspaceIntegrity';
import { parseWorkspaceSnapshotText } from './workspaceSnapshot';
import { LOCAL_MINING_ENGINE_VERSION } from './documentDerivation';

export interface HardeningCheckResult {
  key: string;
  label: string;
  score: number;
  status: 'pass' | 'attention' | 'fail';
  summary: string;
}

export interface HardeningCheckSuiteResult {
  engineVersion: string;
  computedAt: string;
  headline: string;
  summary: string;
  averageScore: number;
  passedCount: number;
  attentionCount: number;
  failedCount: number;
  results: HardeningCheckResult[];
}

function toStatus(score: number): HardeningCheckResult['status'] {
  if (score >= 85) return 'pass';
  if (score >= 65) return 'attention';
  return 'fail';
}

function buildCorruptedState(): unknown {
  const now = new Date().toISOString();
  return {
    ...createEmptyV2State(),
    currentStep: 'kaputt',
    cases: [
      { id: 'case-1', name: 'Fall 1', narrative: 'Eingang erfassen. Fall prüfen.', createdAt: now, updatedAt: now },
      { id: 'case-1', name: 'Fall 1 doppelt', narrative: 'Duplikat', createdAt: now, updatedAt: now },
      null,
    ],
    observations: [
      { id: 'obs-1', sourceCaseId: 'case-1', label: 'Eingang erfassen', kind: 'step', sequenceIndex: 4, timestampQuality: 'missing', createdAt: now },
      { id: 'obs-1', sourceCaseId: 'case-1', label: 'Duplikat', kind: 'step', sequenceIndex: 5, timestampQuality: 'missing', createdAt: now },
      { id: 'obs-2', sourceCaseId: 'nicht-da', label: 'Prüfung', kind: 'step', sequenceIndex: 7, timestampQuality: 'missing', createdAt: now },
      { foo: 'bar' },
    ],
  };
}

function buildStaleDownstreamState(): ProcessMiningAssistedV2State {
  const now = new Date().toISOString();
  return {
    ...createEmptyV2State(),
    currentStep: 'augmentation',
    discoverySummary: {
      caseCount: 1,
      variantCount: 1,
      topSteps: ['Eingang'],
      updatedAt: now,
    },
    conformanceSummary: {
      checkedSteps: 1,
      deviationCount: 0,
      deviationNotes: [],
      updatedAt: now,
    },
    enhancementSummary: {
      issueCount: 1,
      issues: [{ title: 'Wartezeit', description: 'Test', kind: 'timing' }],
      updatedAt: now,
    },
    reportSnapshot: {
      title: 'Veralteter Bericht',
      executiveSummary: 'Test',
      processStory: 'Test',
      keyFindings: ['Test'],
      nextActions: ['Neu rechnen'],
      cautionNotes: [],
      markdown: '# Test',
      analysisMode: 'process-draft',
      generatedAt: now,
    },
    handoverDrafts: [
      {
        audience: 'management',
        label: 'Management',
        summary: 'Test',
        text: 'Test',
      },
    ],
  };
}

export function runHardeningCheckSuite(): HardeningCheckSuiteResult {
  const malformed = hardenWorkspaceState(buildCorruptedState());
  const malformedScore =
    malformed.state.currentStep === 'observations' &&
    malformed.state.cases.length === 1 &&
    malformed.state.observations.length === 2
      ? 96
      : 62;

  const stale = hardenWorkspaceState(buildStaleDownstreamState());
  const staleScore =
    !stale.state.discoverySummary &&
    !stale.state.conformanceSummary &&
    !stale.state.enhancementSummary &&
    !stale.state.reportSnapshot &&
    !stale.state.handoverDrafts?.length &&
    stale.state.currentStep === 'observations'
      ? 95
      : 60;

  const snapshot = parseWorkspaceSnapshotText(JSON.stringify({
    schemaVersion: 'pm-assisted-v2-snapshot',
    exportedAt: new Date().toISOString(),
    appVersion: 'v0-test',
    process: { processId: 'p', title: 'Snapshot-Test' },
    state: buildCorruptedState(),
  }));
  const snapshotScore = snapshot.state.cases.length === 1 && snapshot.warnings.length > 0 ? 93 : 63;

  const results: HardeningCheckResult[] = [
    {
      key: 'malformed-state',
      label: 'Beschädigter Arbeitsstand wird stabilisiert',
      score: malformedScore,
      status: toStatus(malformedScore),
      summary: `${malformed.report.repairedCount} Reparaturen · ${malformed.state.cases.length} Fall · ${malformed.state.observations.length} erkennbare Einträge bleiben nutzbar.`,
    },
    {
      key: 'stale-downstream',
      label: 'Veraltete Folgeartefakte werden geleert',
      score: staleScore,
      status: toStatus(staleScore),
      summary: `${stale.report.repairedCount} Reparaturen · Bericht und Analysen werden nicht auf leerer Basis stehen gelassen.`,
    },
    {
      key: 'snapshot-recovery',
      label: 'Importierter Arbeitsstand bleibt wiederherstellbar',
      score: snapshotScore,
      status: toStatus(snapshotScore),
      summary: `${snapshot.warnings.length} Hinweise beim Snapshot-Import · Arbeitsstand bleibt trotzdem nutzbar.`,
    },
  ];

  const averageScore = Math.round(results.reduce((sum, item) => sum + item.score, 0) / results.length);
  const passedCount = results.filter(item => item.status === 'pass').length;
  const attentionCount = results.filter(item => item.status === 'attention').length;
  const failedCount = results.filter(item => item.status === 'fail').length;

  return {
    engineVersion: `${LOCAL_MINING_ENGINE_VERSION} · hardening`,
    computedAt: new Date().toISOString(),
    headline: averageScore >= 85 ? 'Arbeitsstand-Härtung wirkt stabil.' : 'Arbeitsstand-Härtung braucht noch Nacharbeit.',
    summary: `${results.length} Szenarien geprüft · Durchschnitt ${averageScore}/100 · ${failedCount} kritisch.`,
    averageScore,
    passedCount,
    attentionCount,
    failedCount,
    results,
  };
}
