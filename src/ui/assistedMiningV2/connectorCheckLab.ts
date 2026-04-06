import { createInitialCaptureProgress } from '../../domain/capture';
import { createInitialBpmnModelRef } from '../../domain/bpmn';
import type { Process, ProcessVersion } from '../../domain/process';
import { DEFAULT_SETTINGS } from '../../settings/appSettings';
import { createEmptyV2State } from './storage';
import { buildSampleScenario } from './sampleCases';
import { buildProcessMiningReport } from './reporting';
import { buildConnectorBundlePreviews } from './connectorBundles';
import { LOCAL_MINING_ENGINE_VERSION } from './documentDerivation';

function createMockProcess(key: string): Process {
  const now = new Date().toISOString();
  return {
    processId: `mock-process-${key}`,
    projectId: 'mock-project',
    title: `Connector-Test ${key}`,
    category: 'kern',
    managementLevel: 'fachlich',
    hierarchyLevel: 'hauptprozess',
    parentProcessId: null,
    createdAt: now,
    updatedAt: now,
  };
}

function createMockVersion(process: Process): ProcessVersion {
  const now = new Date().toISOString();
  return {
    id: `version-${process.processId}`,
    versionId: `version-${process.processId}`,
    processId: process.processId,
    status: 'draft',
    createdAt: now,
    updatedAt: now,
    titleSnapshot: process.title,
    versionLabel: 'Connector-Test',
    endToEndDefinition: {
      trigger: 'Teststart',
      customer: 'Intern',
      outcome: 'Connector-Bundles geprüft',
    },
    bpmn: createInitialBpmnModelRef(),
    sidecar: {
      roles: [],
      systems: [],
      dataObjects: [],
      kpis: [],
    },
    quality: {
      syntaxFindings: [],
      semanticQuestions: [],
      namingFindings: [],
    },
    captureProgress: createInitialCaptureProgress(),
  };
}

function makeState(key: Parameters<typeof buildSampleScenario>[0]) {
  const scenario = buildSampleScenario(key);
  const process = createMockProcess(key);
  const version = createMockVersion(process);
  const baseState = createEmptyV2State();
  const state = {
    ...baseState,
    cases: scenario.cases,
    observations: scenario.observations,
    lastDerivationSummary: scenario.summary,
    updatedAt: new Date().toISOString(),
  };
  const report = buildProcessMiningReport({ process, version, state });
  return {
    process,
    version,
    state: {
      ...state,
      reportSnapshot: report.snapshot,
      handoverDrafts: report.handovers,
    },
  };
}

export function runConnectorCheckSuite() {
  const scenarios = [
    { key: 'complaints' as const, label: 'Reklamationen' },
    { key: 'service' as const, label: 'Service' },
    { key: 'returns' as const, label: 'Retouren' },
  ];

  const results = scenarios.map(item => {
    const { process, version, state } = makeState(item.key);
    const summary = buildConnectorBundlePreviews({ process, version, state, settings: DEFAULT_SETTINGS });
    const ready = summary.bundles.filter(bundle => bundle.status === 'ready').length;
    const partial = summary.bundles.filter(bundle => bundle.status === 'partial').length;
    const blocked = summary.bundles.filter(bundle => bundle.status === 'blocked').length;
    const score = Math.max(0, 55 + ready * 12 + partial * 5 - blocked * 6);
    return {
      label: item.label,
      ready,
      partial,
      blocked,
      score,
      recommendation: summary.recommendation,
    };
  });

  const averageScore = Math.round(results.reduce((sum, item) => sum + item.score, 0) / results.length);
  const failedCount = results.filter(item => item.score < 70).length;

  return {
    engineVersion: LOCAL_MINING_ENGINE_VERSION,
    headline: averageScore >= 85 ? 'Connector- und Betriebspakete wirken stabil vorbereitet.' : 'Connector- und Betriebspakete brauchen noch Aufmerksamkeit.',
    summary: `${results.length} Szenarien geprüft · Durchschnitt ${averageScore}/100 · ${failedCount} kritisch`,
    results,
    failedCount,
  };
}
