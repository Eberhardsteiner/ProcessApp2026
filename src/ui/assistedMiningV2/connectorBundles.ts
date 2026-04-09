import type {
  Process,
  ProcessMiningAssistedV2State,
  ProcessMiningConnectorBundleKey,
  ProcessMiningConnectorBundleStatus,
  ProcessMiningConnectorExportSnapshot,
  ProcessVersion,
} from '../../domain/process';
import type { AppSettings } from '../../settings/appSettings';
import { APP_VERSION_LABEL } from '../../config/release';
import { computeMiningReadiness } from './analysisReadiness';
import { computeDataMaturity } from './dataMaturity';
import { countGovernanceDecisionStatuses } from './governance';
import { buildGovernanceBasisFingerprint, computeGovernanceWorkflow } from './governanceWorkflow';
import { evaluateIntegrationReadiness } from './integrationReadiness';
import { sentenceCase, uniqueStrings } from './pmShared';
import { buildReviewOverview } from './reviewSuggestions';

export type ConnectorBundlePreview = {
  key: ProcessMiningConnectorBundleKey;
  label: string;
  shortLabel: string;
  status: ProcessMiningConnectorBundleStatus;
  audience: string;
  summary: string;
  rationale: string;
  includes: string[];
  jsonPayload: Record<string, unknown>;
  textPayload: string;
  fileBase: string;
  basisFingerprint: string;
};

export type ConnectorToolkitSummary = {
  headline: string;
  recommendation: string;
  readinessText: string;
  bundles: ConnectorBundlePreview[];
};

function latestBenchmark(state: ProcessMiningAssistedV2State) {
  const snapshots = state.benchmarkSnapshots ?? [];
  return snapshots.length > 0 ? snapshots[snapshots.length - 1] : undefined;
}

function isoNow() {
  return new Date().toISOString();
}

function buildFileBase(process: Process, key: ProcessMiningConnectorBundleKey): string {
  const slug = process.title
    .toLowerCase()
    .replace(/[^a-z0-9äöüß]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'prozess';
  return `${slug}-${key}`;
}

function buildHeader(process: Process, version: ProcessVersion, label: string): string[] {
  return [
    `${label} | ${process.title}`,
    '',
    `Version: ${version.versionLabel ?? version.id}`,
    `Erstellt am: ${new Date().toLocaleString('de-DE')}`,
    `App-Stand: ${APP_VERSION_LABEL}`,
    '',
  ];
}

export function buildConnectorBundlePreviews(params: {
  process: Process;
  version: ProcessVersion;
  state: ProcessMiningAssistedV2State;
  settings: AppSettings;
}): ConnectorToolkitSummary {
  const { process, version, state, settings } = params;
  const stepCount = state.qualitySummary?.stepObservationCount ?? state.observations.filter(item => item.kind === 'step').length;
  const caseCount = state.cases.length;
  const realTimeCount = state.observations.filter(item => item.timestampQuality === 'real').length;
  const readiness = computeMiningReadiness({ state, version });
  const review = buildReviewOverview({ cases: state.cases, observations: state.observations });
  const maturity = computeDataMaturity({ state, version, reviewSuggestionCount: review.suggestionCount });
  const governanceWorkflow = computeGovernanceWorkflow({ state, version });
  const governanceCounts = countGovernanceDecisionStatuses(state.governance);
  const benchmark = latestBenchmark(state);
  const integration = evaluateIntegrationReadiness({ state, version, settings });
  const basisFingerprint = buildGovernanceBasisFingerprint(state);
  const report = state.reportSnapshot;
  const coreSteps = state.discoverySummary?.topSteps ?? [];
  const deviations = state.conformanceSummary?.deviationNotes ?? [];
  const issues = state.enhancementSummary?.issues ?? [];
  const handovers = state.handoverDrafts ?? [];
  const roles = uniqueStrings(state.observations.map(item => item.role));
  const systems = uniqueStrings(state.observations.map(item => item.system));
  const aiConfigured = Boolean(settings.ai.api.endpointUrl?.trim());
  const aiPrompt = state.aiRefinement?.prompt?.trim() ?? '';
  const latestGovernance = state.governance?.history?.length ? state.governance.history[state.governance.history.length - 1] : undefined;

  const ticketPayload = {
    schemaVersion: 'pm-connector-ticket-v1',
    exportedAt: isoNow(),
    appVersion: APP_VERSION_LABEL,
    process: {
      title: process.title,
      versionLabel: version.versionLabel ?? version.id,
      readiness: readiness.headline,
      maturity: maturity.levelLabel,
    },
    sourceSummary: {
      cases: caseCount,
      steps: stepCount,
      evidenceSteps: state.qualitySummary?.stepObservationsWithEvidence ?? 0,
      realTimeEvents: realTimeCount,
    },
    mainFlow: coreSteps,
    deviations: deviations.slice(0, 8),
    hotspots: issues.slice(0, 6).map(item => ({
      title: item.title,
      detail: item.description,
      kind: item.kind,
    })),
    handovers: handovers.map(item => ({ audience: item.audience, label: item.label, summary: item.summary })),
    nextActions: report?.nextActions ?? [],
    cautionNotes: report?.cautionNotes ?? readiness.nextActions,
  };

  const biPayload = {
    schemaVersion: 'pm-connector-bi-v1',
    exportedAt: isoNow(),
    appVersion: APP_VERSION_LABEL,
    process: {
      title: process.title,
      versionLabel: version.versionLabel ?? version.id,
    },
    metrics: {
      cases: caseCount,
      steps: stepCount,
      variants: state.discoverySummary?.variantCount ?? 0,
      deviations: state.conformanceSummary?.deviationCount ?? 0,
      hotspots: state.enhancementSummary?.issueCount ?? 0,
      realTimeEvents: realTimeCount,
    },
    domainBenchmark: benchmark
      ? {
          overallScore: benchmark.overallScore,
          status: benchmark.status,
          domainScores: benchmark.domainScores,
          dimensionScores: benchmark.dimensionScores,
        }
      : null,
    readiness: {
      headline: readiness.headline,
      summary: readiness.summary,
      analysisMode: readiness.analysisModeLabel,
      maturity: maturity.levelLabel,
    },
    discovery: state.discoverySummary ?? null,
    conformance: state.conformanceSummary ?? null,
    enhancement: state.enhancementSummary ?? null,
  };

  const aiPayload = {
    schemaVersion: 'pm-connector-ai-proxy-v1',
    exportedAt: isoNow(),
    appVersion: APP_VERSION_LABEL,
    aiMode: settings.ai.mode,
    endpointConfigured: aiConfigured,
    endpointUrl: settings.ai.api.endpointUrl || null,
    process: {
      title: process.title,
      versionLabel: version.versionLabel ?? version.id,
    },
    context: {
      mainFlow: coreSteps,
      deviations: deviations.slice(0, 6),
      hotspots: issues.slice(0, 5).map(item => item.title),
      roles,
      systems,
      reportSummary: report?.executiveSummary ?? null,
      governanceHeadline: governanceWorkflow.headline,
    },
    promptAssets: {
      promptAvailable: Boolean(aiPrompt),
      lastPromptFocus: state.aiRefinement?.promptFocus ?? null,
      prompt: aiPrompt || null,
      responsePresent: Boolean(state.aiRefinement?.responseText?.trim()),
    },
    guardrails: {
      stable: integration.boundaries.stable,
      caution: integration.boundaries.caution,
      blocked: integration.boundaries.blocked,
    },
  };

  const governancePayload = {
    schemaVersion: 'pm-connector-governance-archive-v1',
    exportedAt: isoNow(),
    appVersion: APP_VERSION_LABEL,
    process: {
      title: process.title,
      versionLabel: version.versionLabel ?? version.id,
    },
    governance: {
      workflow: {
        stage: governanceWorkflow.stage,
        label: governanceWorkflow.stageLabel,
        headline: governanceWorkflow.headline,
        nextAction: governanceWorkflow.nextAction,
      },
      decisions: state.governance?.decisions ?? [],
      approval: state.governance?.approval ?? null,
      latestSnapshot: latestGovernance ?? null,
      history: state.governance?.history ?? [],
      counts: governanceCounts,
    },
    reports: {
      current: report ?? null,
      history: state.reportHistory ?? [],
    },
    pilot: state.pilotToolkit ?? {},
    connectorToolkit: {
      operator: state.connectorToolkit?.operator ?? null,
      endpointNote: state.connectorToolkit?.endpointNote ?? null,
      lastExportedAt: state.connectorToolkit?.lastExportedAt ?? null,
    },
  };

  const bundles: ConnectorBundlePreview[] = [
    {
      key: 'ticket-handover',
      label: 'Ticket- und Case-Handover',
      shortLabel: 'Ticket-Handover',
      audience: 'Service, Case-Management, operative Übergabe',
      status: stepCount > 0 ? (report ? 'ready' : 'partial') : 'blocked',
      summary: stepCount > 0
        ? report
          ? 'Der aktuelle Stand lässt sich als ruhige operative Übergabe an Ticket-, Service- oder Case-Systeme bündeln.'
          : 'Ein Ticket-Handover ist schon möglich, gewinnt aber mit einem aktuellen Bericht noch an Klarheit.'
        : 'Ohne erkannte Prozessschritte ist noch kein brauchbarer Ticket-Handover möglich.',
      rationale: report
        ? 'Nutzt Hauptlinie, Soll-Hinweise, Hotspots und die vorhandenen Übergaben in einer kompakten Form.'
        : 'Die Bundle-Vorlage baut bereits auf Schritten und Reibungssignalen auf, nutzt aber noch keine verdichtete Berichtslogik.',
      includes: [
        'Hauptlinie und nächste Schritte',
        'wichtige Soll-Hinweise und Hotspots',
        'zielgruppenspezifische Übergaben',
        'vorsichtige Einordnung der Belastbarkeit',
      ],
      jsonPayload: ticketPayload,
      textPayload: [
        ...buildHeader(process, version, 'Ticket- und Case-Handover'),
        'Einsatzbild',
        report?.executiveSummary ?? readiness.summary,
        '',
        'Nächste Schritte',
        ...(report?.nextActions ?? readiness.nextActions).slice(0, 5).map(item => `- ${sentenceCase(item)}`),
        '',
        'Wichtige Hotspots',
        ...(issues.slice(0, 5).length > 0 ? issues.slice(0, 5).map(item => `- ${item.title}: ${item.description}`) : ['- Noch kein dominanter Hotspot abgesichert.']),
      ].join('\n'),
      fileBase: buildFileBase(process, 'ticket-handover'),
      basisFingerprint,
    },
    {
      key: 'bi-feed',
      label: 'BI- und Reporting-Feed',
      shortLabel: 'BI-Feed',
      audience: 'BI, Reporting, Dashboard, Data Lab',
      status: stepCount > 0 ? (benchmark ? 'ready' : 'partial') : 'blocked',
      summary: stepCount > 0
        ? benchmark
          ? 'Kennzahlen, Benchmark und lokale Qualitätsdimensionen sind für BI- oder Reporting-Zwecke vorbereitet.'
          : 'Kennzahlen und Analysezusammenfassung liegen vor. Mit einem frischen Benchmark wird der BI-Feed aussagekräftiger.'
        : 'Für einen BI-Feed fehlt noch eine belastbare Analysebasis.',
      rationale: benchmark
        ? 'Kombiniert Kennzahlen, Qualitätsdimensionen, Benchmark und lokale Analysesummen in strukturierter Form.'
        : 'Stützt sich vor allem auf Discovery, Soll-Abgleich und Hotspot-Zusammenfassung des aktuellen Arbeitsstands.',
      includes: [
        'Kennzahlen zu Fällen, Schritten, Varianten und Hotspots',
        'Analysemodus, Reife und Benchmark-Stand',
        'Discovery-, Conformance- und Enhancement-Summen',
        'kompakte Struktur für externe Dashboards',
      ],
      jsonPayload: biPayload,
      textPayload: [
        ...buildHeader(process, version, 'BI- und Reporting-Feed'),
        'Kernaussage',
        benchmark ? `${benchmark.headline} ${benchmark.summary}` : readiness.summary,
        '',
        'Wesentliche Kennzahlen',
        `- Fälle: ${caseCount}`,
        `- Schritte: ${stepCount}`,
        `- Varianten: ${state.discoverySummary?.variantCount ?? 0}`,
        `- Abweichungstypen: ${state.conformanceSummary?.deviationCount ?? 0}`,
        `- Hotspots: ${state.enhancementSummary?.issueCount ?? 0}`,
      ].join('\n'),
      fileBase: buildFileBase(process, 'bi-feed'),
      basisFingerprint,
    },
    {
      key: 'ai-proxy',
      label: 'KI- und API-Proxy-Bundle',
      shortLabel: 'KI-/API-Proxy',
      audience: 'KI-Proxy, Orchestrierung, Copy/Paste oder API',
      status: stepCount > 0 ? ((aiConfigured || aiPrompt || report) ? 'ready' : 'partial') : 'blocked',
      summary: stepCount > 0
        ? aiConfigured
          ? 'Für einen optionalen KI- oder API-Proxy liegt ein vorbereiteter Bundle-Weg mit Guardrails und Kontext vor.'
          : 'Das Bundle kann bereits per Copy/Paste genutzt werden. Mit einem konfigurierten Endpoint wird daraus ein direkter API-Proxy-Pfad.'
        : 'Ohne Analysebasis gibt es noch keinen sinnvollen KI-/API-Kontext.',
      rationale: aiConfigured
        ? 'Nutzt die lokale Analyse als führenden Kern und ergänzt nur den Kontext für externe KI- oder API-Schritte.'
        : 'Das Bundle bleibt bewusst lokal führend und liefert Guardrails für manuelle Copy/Paste- oder spätere API-Nutzung.',
      includes: [
        'lokale Hauptlinie, Soll-Hinweise und Hotspots',
        'Rollen, Systeme und Guardrails',
        'optionaler Prompt- und Response-Kontext',
        'Endpoint-Hinweis nur, wenn im Setup konfiguriert',
      ],
      jsonPayload: aiPayload,
      textPayload: [
        ...buildHeader(process, version, 'KI- und API-Proxy-Bundle'),
        'Kontext für optionale KI- oder API-Nutzung',
        report?.executiveSummary ?? readiness.summary,
        '',
        'Guardrails',
        ...integration.boundaries.caution.slice(0, 4).map(item => `- Vorsicht: ${item}`),
        ...integration.boundaries.blocked.slice(0, 3).map(item => `- Noch nicht aktiv: ${item}`),
        ...(aiPrompt ? ['', 'Vorhandener Prompt', aiPrompt] : []),
      ].join('\n'),
      fileBase: buildFileBase(process, 'ai-proxy'),
      basisFingerprint,
    },
    {
      key: 'governance-archive',
      label: 'Governance- und Audit-Archiv',
      shortLabel: 'Governance-Archiv',
      audience: 'Governance, Review, Audit, Pilotsteuerung',
      status: report ? (state.governance?.history?.length || state.reportHistory?.length ? 'ready' : 'partial') : 'blocked',
      summary: report
        ? state.governance?.history?.length || state.reportHistory?.length
          ? 'Governance-, Berichts- und Freigabestände lassen sich als ruhiges Archivpaket sichern und vergleichen.'
          : 'Ein Governance-Archiv ist bereits möglich. Mit gemerkten Ständen wird es beim Vergleich noch hilfreicher.'
        : 'Für ein Governance-Archiv sollte zuerst ein Bericht erzeugt werden.',
      rationale: 'Bündelt Governance-Workflow, Entscheidungen, Freigaben, Berichtsstände und Pilotinformationen für nachvollziehbare Übergaben.',
      includes: [
        'Governance-Workflow und Entscheidungslog',
        'Freigaben, Review-Stände und Verlauf',
        'Bericht und Berichtshistorie',
        'Pilot- und Connector-Kontext für spätere Nachvollziehbarkeit',
      ],
      jsonPayload: governancePayload,
      textPayload: [
        ...buildHeader(process, version, 'Governance- und Audit-Archiv'),
        'Aktueller Governance-Stand',
        governanceWorkflow.headline,
        governanceWorkflow.detail,
        '',
        'Status offener Punkte',
        `- Offen: ${governanceCounts.open}`,
        `- In Prüfung: ${governanceCounts.in_review}`,
        `- Freigegeben: ${governanceCounts.approved}`,
        `- Zurückgestellt: ${governanceCounts.deferred}`,
        '',
        'Nächster sinnvoller Schritt',
        `- ${governanceWorkflow.nextAction}`,
      ].join('\n'),
      fileBase: buildFileBase(process, 'governance-archive'),
      basisFingerprint,
    },
  ];

  const readyBundles = bundles.filter(item => item.status === 'ready').length;
  const headline = readyBundles >= 3
    ? 'Die Connector- und Betriebspakete sind breit vorbereitet, bleiben aber bewusst optional.'
    : readyBundles >= 1
    ? 'Mindestens ein Connector-Paket ist schon gut nutzbar. Weitere Pakete gewinnen mit Bericht, Benchmark oder Governance-Verlauf.'
    : 'Die Bundle-Wege sind vorbereitet, brauchen aber noch etwas Analysebasis oder Freigabestand.';

  const recommendation = bundles.find(item => item.status === 'ready')?.label ?? bundles.find(item => item.status === 'partial')?.label ?? 'Noch kein Connector-Paket empfohlen';
  const readinessText = `Bereit: ${readyBundles} · Teilweise bereit: ${bundles.filter(item => item.status === 'partial').length} · Noch nicht bereit: ${bundles.filter(item => item.status === 'blocked').length}`;

  return { headline, recommendation, readinessText, bundles };
}

export function pushConnectorExportSnapshot(
  history: ProcessMiningConnectorExportSnapshot[] | undefined,
  next: ProcessMiningConnectorExportSnapshot,
  limit = 10,
): ProcessMiningConnectorExportSnapshot[] {
  const base = history ?? [];
  const latest = base.length > 0 ? base[base.length - 1] : undefined;
  if (latest && latest.key === next.key && latest.basisFingerprint === next.basisFingerprint && latest.status === next.status) {
    return [...base.slice(0, -1), { ...next, id: latest.id }].slice(-limit);
  }
  return [...base, next].slice(-limit);
}

export function compareConnectorExportToCurrent(
  snapshot: ProcessMiningConnectorExportSnapshot | undefined,
  bundles: ConnectorBundlePreview[],
) {
  if (!snapshot) return null;
  const current = bundles.find(item => item.key === snapshot.key);
  if (!current) {
    return {
      isAligned: false,
      summary: 'Das zuletzt exportierte Connector-Paket gehört zu einer älteren Paketdefinition.',
    };
  }
  const isAligned = snapshot.basisFingerprint === current.basisFingerprint;
  return {
    isAligned,
    summary: isAligned
      ? `${current.label} passt noch zur aktuellen Analysebasis.`
      : `${current.label} wurde seit dem letzten Export fachlich verändert und sollte vor der Weitergabe neu erzeugt werden.`,
  };
}
