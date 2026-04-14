import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  Process,
  ProcessMiningAssistedV2State,
  ProcessMiningConformanceSummary,
  ProcessMiningDiscoverySummary,
  ProcessMiningEnhancementSummary,
  ProcessVersion,
} from '../../../src/domain/process';
import { createInitialCaptureProgress } from '../../../src/domain/capture';
import { createInitialBpmnModelRef } from '../../../src/domain/bpmn';
import { DEFAULT_SETTINGS } from '../../../src/settings/appSettings';
import { deriveProcessArtifactsFromText } from '../../../src/ui/assistedMiningV2/documentDerivation';
import { computeQualitySummary } from '../../../src/ui/assistedMiningV2/narrativeParsing';
import { computeV2Discovery } from '../../../src/ui/assistedMiningV2/discovery';
import { computeV2Conformance } from '../../../src/ui/assistedMiningV2/conformance';
import { computeV2Enhancement } from '../../../src/ui/assistedMiningV2/enhancement';
import { buildProcessMiningReport } from '../../../src/ui/assistedMiningV2/reporting';
import { buildQualityExportFile, serializeQualityExportFile } from '../../../src/ui/assistedMiningV2/qualityExport';
import { createEmptyV2State } from '../../../src/ui/assistedMiningV2/storage';
import { hardenWorkspaceState } from '../../../src/ui/assistedMiningV2/workspaceIntegrity';

function buildDiscoverySummary(result: ReturnType<typeof computeV2Discovery>): ProcessMiningDiscoverySummary {
  return {
    caseCount: result.totalCases,
    variantCount: result.variants.length,
    mainVariantShare: result.coreProcessCaseCoverage,
    topSteps: result.coreProcess,
    analysisMode: result.analysisMode,
    sampleNotice: result.sampleNotice,
    notes: '',
    updatedAt: result.computedAt,
  };
}

function buildConformanceSummary(result: ReturnType<typeof computeV2Conformance>): ProcessMiningConformanceSummary {
  return {
    checkedSteps: result.targetSteps.length,
    deviationCount: result.topDeviations.length,
    deviationNotes: result.topDeviations.map(item => item.description),
    analysisMode: result.analysisMode,
    sampleNotice: result.sampleNotice,
    notes: '',
    updatedAt: result.computedAt,
  };
}

function mapHotspotKind(kind: ReturnType<typeof computeV2Enhancement>['hotspots'][number]['kind'], headline: string): 'timing' | 'rework' | 'handoff' | 'missing' | 'other' {
  if (kind === 'timing') return 'timing';
  if (kind === 'rework') return 'rework';
  if (kind === 'handoff') return 'handoff';
  if (kind === 'exception' && /fehl|mindestdaten|pflichtangaben|information/i.test(headline)) return 'missing';
  return 'other';
}

function buildEnhancementSummary(result: ReturnType<typeof computeV2Enhancement>): ProcessMiningEnhancementSummary {
  return {
    issueCount: result.hotspots.length,
    issues: result.hotspots.map(hotspot => ({
      title: hotspot.headline,
      description: hotspot.detail,
      kind: mapHotspotKind(hotspot.kind, hotspot.headline),
    })),
    analysisMode: result.analysisMode,
    sampleNotice: result.sampleNotice,
    notes: '',
    updatedAt: result.computedAt,
  };
}

function buildSyntheticProcess(params: { fileName: string; fixtureFamily?: string }): Process {
  const now = new Date().toISOString();
  const key = path.basename(params.fileName, path.extname(params.fileName)).toLowerCase();
  return {
    processId: `engine-invariant-${key}`,
    projectId: 'qa-engine-invariants',
    title: `Engine Invariant ${path.basename(params.fileName, path.extname(params.fileName))}`,
    category: 'kern',
    managementLevel: 'fachlich',
    hierarchyLevel: 'hauptprozess',
    parentProcessId: null,
    createdAt: now,
    updatedAt: now,
  };
}

function buildSyntheticVersion(params: {
  fileName: string;
  processId: string;
  discoverySummary: ProcessMiningDiscoverySummary;
  fixtureFamily?: string;
}): ProcessVersion {
  const now = new Date().toISOString();
  const key = path.basename(params.fileName, path.extname(params.fileName)).toLowerCase();
  return {
    id: `engine-invariant-version-${key}`,
    processId: params.processId,
    versionId: `engine-invariant-version-${key}`,
    status: 'draft',
    createdAt: now,
    updatedAt: now,
    titleSnapshot: path.basename(params.fileName, path.extname(params.fileName)),
    versionLabel: params.fixtureFamily ? `Invariant ${params.fixtureFamily}` : 'Invariant QA',
    endToEndDefinition: {
      trigger: 'Engine-Invariantenlauf starten',
      customer: 'Externe QA',
      outcome: 'Strukturbasierter Qualitäts-Export ohne Fixture-Memorisierung',
    },
    bpmn: createInitialBpmnModelRef(),
    sidecar: {
      roles: [],
      systems: [],
      dataObjects: [],
      kpis: [],
      improvementBacklog: [],
      evidenceSources: [],
      aiImportNotes: [],
      captureDraft: {
        draftVersion: 'capture-draft-v1',
        happyPath: params.discoverySummary.topSteps.map((label, index) => ({
          stepId: `engine-invariant-hp-${key}-${index + 1}`,
          order: index + 1,
          label,
        })),
        decisions: [],
        exceptions: [],
      },
    },
    quality: {
      syntaxFindings: [],
      semanticQuestions: [],
      namingFindings: [],
    },
    captureProgress: createInitialCaptureProgress(),
  };
}

export async function generateEngineInvariantExport(params: {
  sourceText: string;
  fileName: string;
  sourceType: 'pdf' | 'docx' | 'narrative' | 'csv-row' | 'xlsx-row';
  exportPath: string;
  fixtureFamily?: string;
}): Promise<{ exportPath: string; appVersion: string; routingClass?: string; documentClass?: string }> {
  const derivation = deriveProcessArtifactsFromText({
    text: params.sourceText,
    fileName: params.fileName,
    sourceType: params.sourceType,
  });

  const initialQualitySummary = computeQualitySummary(
    derivation.cases,
    derivation.observations,
    derivation.summary.issueSignals?.length,
  );
  const hardened = hardenWorkspaceState({
    ...createEmptyV2State(),
    currentStep: 'augmentation',
    cases: derivation.cases,
    observations: derivation.observations,
    qualitySummary: initialQualitySummary,
    lastDerivationSummary: derivation.summary,
    updatedAt: new Date().toISOString(),
  } satisfies ProcessMiningAssistedV2State);

  const qualitySummary = computeQualitySummary(
    hardened.state.cases,
    hardened.state.observations,
    derivation.summary.issueSignals?.length,
  );
  const discovery = computeV2Discovery({
    cases: hardened.state.cases,
    observations: hardened.state.observations,
    lastDerivationSummary: derivation.summary,
  });
  const discoverySummary = buildDiscoverySummary(discovery);
  const process = buildSyntheticProcess({
    fileName: params.fileName,
    fixtureFamily: params.fixtureFamily,
  });
  const version = buildSyntheticVersion({
    fileName: params.fileName,
    processId: process.processId,
    discoverySummary,
    fixtureFamily: params.fixtureFamily,
  });
  const conformance = computeV2Conformance({
    cases: hardened.state.cases,
    observations: hardened.state.observations,
    captureHappyPath: version.sidecar.captureDraft?.happyPath,
    coreProcess: discovery.coreProcess,
    lastDerivationSummary: derivation.summary,
  });
  const enhancement = computeV2Enhancement({
    cases: hardened.state.cases,
    observations: hardened.state.observations,
    lastDerivationSummary: derivation.summary,
  });

  const state: ProcessMiningAssistedV2State = {
    ...hardened.state,
    currentStep: 'augmentation',
    qualitySummary,
    lastDerivationSummary: derivation.summary,
    discoverySummary,
    conformanceSummary: buildConformanceSummary(conformance),
    enhancementSummary: buildEnhancementSummary(enhancement),
    updatedAt: new Date().toISOString(),
  };

  const report = buildProcessMiningReport({ process, version, state });
  state.reportSnapshot = report.snapshot;
  state.handoverDrafts = report.handovers;

  const exportFile = buildQualityExportFile({
    process,
    version,
    state,
    settings: DEFAULT_SETTINGS,
    integrity: hardened.report,
  });

  await mkdir(path.dirname(params.exportPath), { recursive: true });
  await writeFile(params.exportPath, serializeQualityExportFile(exportFile), 'utf8');

  return {
    exportPath: params.exportPath,
    appVersion: exportFile.appVersion,
    routingClass: exportFile.analysisResults.routing?.routingClass,
    documentClass: exportFile.analysisResults.lastDerivationSummary?.sourceProfile?.documentClass,
  };
}
