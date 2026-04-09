import { createInitialCaptureProgress } from '../../domain/capture';
import { createInitialBpmnModelRef } from '../../domain/bpmn';
import type { Process, ProcessVersion } from '../../domain/process';
import { DEFAULT_SETTINGS } from '../../settings/appSettings';
import { buildProcessMiningReport } from './reporting';
import { buildSampleScenario } from './sampleCases';
import { LOCAL_MINING_ENGINE_VERSION } from './documentDerivation';
import { createEmptyV2State } from './storage';
import { buildConnectorContractProfiles, parseConnectorReceipt } from './integrationContracts';

function createMockProcess(key: string): Process {
  const now = new Date().toISOString();
  return {
    processId: `contract-process-${key}`,
    projectId: 'mock-project',
    title: `Integrationsvertrag ${key}`,
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
    versionLabel: 'Integrationstest',
    endToEndDefinition: {
      trigger: 'Testszenario',
      customer: 'Intern',
      outcome: 'Integrationsvertrag geprüft',
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

export function runConnectorContractCheckSuite() {
  const scenarios = [
    { key: 'complaints' as const, label: 'Reklamationen' },
    { key: 'service' as const, label: 'Service' },
    { key: 'billing' as const, label: 'Rechnung' },
  ];

  const results = scenarios.map(item => {
    const { process, version, state } = makeState(item.key);
    const summary = buildConnectorContractProfiles({ process, version, state, settings: DEFAULT_SETTINGS });
    const averageContractScore = Math.round(summary.profiles.reduce((sum, profile) => sum + profile.contractScore, 0) / Math.max(summary.profiles.length, 1));
    const candidate = summary.profiles.find(profile => profile.status !== 'blocked') ?? summary.profiles[0];
    const receiptText = JSON.stringify({
      connectorKey: candidate.key,
      status: candidate.status === 'blocked' ? 'queued' : 'accepted',
      externalRef: `${item.key.toUpperCase()}-1001`,
      endpoint: `${candidate.key}/v1`,
      basisFingerprint: candidate.basisFingerprint,
      note: 'Roundtrip geprüft',
    });
    const parsed = parseConnectorReceipt({ text: receiptText, profiles: summary.profiles, source: 'paste' });
    const roundtripOk = Boolean(parsed.receipt && !parsed.error);
    const score = Math.max(0, averageContractScore + (roundtripOk ? 8 : -20) - summary.blockedCount * 4);

    return {
      label: item.label,
      averageContractScore,
      blockedCount: summary.blockedCount,
      roundtripOk,
      score,
    };
  });

  const averageScore = Math.round(results.reduce((sum, item) => sum + item.score, 0) / Math.max(results.length, 1));
  const failedCount = results.filter(item => item.score < 70 || !item.roundtripOk).length;

  return {
    engineVersion: `${LOCAL_MINING_ENGINE_VERSION} · connector-contracts`,
    headline: averageScore >= 85 ? 'Integrationsverträge und Rückmeldungen wirken strukturiert belastbar.' : 'Integrationsverträge brauchen noch Nachschärfung.',
    summary: `${results.length} Szenarien geprüft · Durchschnitt ${averageScore}/100 · ${failedCount} kritisch`,
    results,
    failedCount,
  };
}
