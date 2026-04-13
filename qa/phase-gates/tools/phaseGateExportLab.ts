import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';
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

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, '\'')
    .replace(/&amp;/g, '&');
}

function extractTextRuns(xml: string): string {
  return Array.from(xml.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g))
    .map(match => decodeXml(match[1] ?? ''))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

async function extractTextFromDocxFile(filePath: string): Promise<string> {
  const buffer = await readFile(filePath);
  const zip = await JSZip.loadAsync(buffer);
  const documentXml = await zip.file('word/document.xml')?.async('string');
  if (!documentXml) {
    throw new Error(`DOCX enthält keine word/document.xml: ${filePath}`);
  }

  const blockRe = /<w:(p|tbl)\b[\s\S]*?<\/w:\1>/g;
  const blocks: string[] = [];

  for (const match of documentXml.matchAll(blockRe)) {
    const blockXml = match[0];
    if (match[1] === 'p') {
      const text = extractTextRuns(blockXml);
      if (text) blocks.push(text);
      continue;
    }

    const rows = Array.from(blockXml.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g))
      .map(rowMatch => {
        const cells = Array.from(rowMatch[0].matchAll(/<w:tc\b[\s\S]*?<\/w:tc>/g))
          .map(cellMatch => {
            const cellText = Array.from(cellMatch[0].matchAll(/<w:p\b[\s\S]*?<\/w:p>/g))
              .map(paragraphMatch => extractTextRuns(paragraphMatch[0]))
              .filter(Boolean)
              .join(' / ');
            return cellText.trim();
          })
          .filter(Boolean);
        return cells.length > 0 ? `| ${cells.join(' | ')} |` : '';
      })
      .filter(Boolean);
    if (rows.length > 0) {
      blocks.push(rows.join('\n'));
    }
  }

  const text = blocks.join('\n\n').trim();
  if (!text) {
    throw new Error(`DOCX enthält keinen extrahierbaren Text: ${filePath}`);
  }
  return text;
}

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

function buildSyntheticProcess(fileName: string): Process {
  const now = new Date().toISOString();
  const key = path.basename(fileName, path.extname(fileName)).toLowerCase();
  return {
    processId: `qa-${key}`,
    projectId: 'qa-phase-gates',
    title: `QA ${path.basename(fileName, path.extname(fileName))}`,
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
}): ProcessVersion {
  const now = new Date().toISOString();
  const key = path.basename(params.fileName, path.extname(params.fileName)).toLowerCase();
  return {
    id: `qa-version-${key}`,
    processId: params.processId,
    versionId: `qa-version-${key}`,
    status: 'draft',
    createdAt: now,
    updatedAt: now,
    titleSnapshot: path.basename(params.fileName, path.extname(params.fileName)),
    versionLabel: 'QA Gate',
    endToEndDefinition: {
      trigger: 'QA-Micro-Gate starten',
      customer: 'Interner QA-Check',
      outcome: 'Maschinenlesbarer Export für PG01/PG02',
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
          stepId: `qa-hp-${key}-${index + 1}`,
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

export async function generatePhaseGateExport(params: {
  fixturePath: string;
  exportPath: string;
}): Promise<{ exportPath: string; appVersion: string; routingClass?: string }> {
  const text = await extractTextFromDocxFile(params.fixturePath);
  const fileName = path.basename(params.fixturePath);
  const derivation = deriveProcessArtifactsFromText({
    text,
    fileName,
    sourceType: 'docx',
  });

  const initialQualitySummary = computeQualitySummary(derivation.cases, derivation.observations, derivation.summary.issueSignals?.length);
  const hardened = hardenWorkspaceState({
    ...createEmptyV2State(),
    currentStep: 'augmentation',
    cases: derivation.cases,
    observations: derivation.observations,
    qualitySummary: initialQualitySummary,
    lastDerivationSummary: derivation.summary,
    updatedAt: new Date().toISOString(),
  } satisfies ProcessMiningAssistedV2State);

  const qualitySummary = computeQualitySummary(hardened.state.cases, hardened.state.observations, derivation.summary.issueSignals?.length);
  const discovery = computeV2Discovery({
    cases: hardened.state.cases,
    observations: hardened.state.observations,
    lastDerivationSummary: derivation.summary,
  });
  const discoverySummary = buildDiscoverySummary(discovery);
  const process = buildSyntheticProcess(fileName);
  const version = buildSyntheticVersion({
    fileName,
    processId: process.processId,
    discoverySummary,
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
  };
}
