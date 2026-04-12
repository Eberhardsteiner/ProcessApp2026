import type { ProcessMiningAssistedV2State, ProcessVersion } from '../../domain/process';
import type { AppSettings } from '../../settings/appSettings';
import { computeMiningReadiness } from './analysisReadiness';
import { buildConnectorBundlePreviews, compareConnectorExportToCurrent } from './connectorBundles';
import { computeDataMaturity } from './dataMaturity';
import { computeGovernanceSummary } from './governance';
import { compareGovernanceSnapshotToCurrent, computeGovernanceWorkflow } from './governanceWorkflow';
import { evaluateIntegrationReadiness } from './integrationReadiness';
import { evaluatePilotReadiness } from './pilotReadiness';
import { uniqueStrings } from './pmShared';
import { compareReportToCurrentState } from './reportHistory';
import { buildCollaborationSummary } from './collaboration';
import { buildReviewOverview } from './reviewSuggestions';
import { evaluateSecurityReadiness } from './securityReadiness';
import { compareAcceptanceSnapshotToCurrent, evaluateAcceptanceReadiness } from './acceptance';

export type ReleaseGateKey =
  | 'basis'
  | 'analysis'
  | 'report'
  | 'governance'
  | 'collaboration'
  | 'security'
  | 'pilot'
  | 'acceptance'
  | 'connectors'
  | 'quality';

export type ReleaseGateStatus = 'ready' | 'attention' | 'blocked';
export type ReleaseFlowLevel = 'blocked' | 'stabilizing' | 'review-ready' | 'release-ready';

export interface ReleaseStabilityGate {
  key: ReleaseGateKey;
  label: string;
  status: ReleaseGateStatus;
  summary: string;
  detail: string;
  action?: string;
  optional?: boolean;
}

export interface ReleaseStabilitySummary {
  level: ReleaseFlowLevel;
  levelLabel: string;
  headline: string;
  summary: string;
  score: number;
  gates: ReleaseStabilityGate[];
  strengths: string[];
  nextActions: string[];
}

function statusWeight(status: ReleaseGateStatus): number {
  if (status === 'ready') return 100;
  if (status === 'attention') return 60;
  return 20;
}

function levelLabel(level: ReleaseFlowLevel): string {
  if (level === 'blocked') return 'Noch nicht freigabefähig';
  if (level === 'stabilizing') return 'Stabilisierung läuft';
  if (level === 'review-ready') return 'Gut für Review und Pilotvorbereitung';
  return 'Gut für Freigabe und Pilotbetrieb';
}

function buildGate(
  key: ReleaseGateKey,
  label: string,
  status: ReleaseGateStatus,
  summary: string,
  detail: string,
  action?: string,
  optional = false,
): ReleaseStabilityGate {
  return { key, label, status, summary, detail, action, optional };
}

function latestBenchmark(state: ProcessMiningAssistedV2State) {
  const snapshots = state.benchmarkSnapshots ?? [];
  return snapshots.length > 0 ? snapshots[snapshots.length - 1] : undefined;
}

export function evaluateReleaseStability(params: {
  state: ProcessMiningAssistedV2State;
  version: ProcessVersion;
  settings: AppSettings;
}): ReleaseStabilitySummary {
  const { state, version, settings } = params;
  const reviewSuggestionCount = buildReviewOverview({ cases: state.cases, observations: state.observations }).suggestionCount;
  const readiness = computeMiningReadiness({ state, version });
  const maturity = computeDataMaturity({ state, version, reviewSuggestionCount });
  const pilotReadiness = evaluatePilotReadiness({ state, version });
  const governanceSummary = computeGovernanceSummary({ state, version });
  const governanceWorkflow = computeGovernanceWorkflow({ state, version });
  const latestGovernanceSnapshot = state.governance?.history?.length
    ? state.governance.history[state.governance.history.length - 1]
    : undefined;
  const governanceDelta = compareGovernanceSnapshotToCurrent(latestGovernanceSnapshot, { state, version });
  const reportFreshness = state.reportSnapshot ? compareReportToCurrentState(state.reportSnapshot, state) : null;
  const integrationReadiness = evaluateIntegrationReadiness({ state, version, settings });
  const securityReadiness = evaluateSecurityReadiness({ state, version, settings });
  const acceptanceSummary = evaluateAcceptanceReadiness({ state, version, settings });
  const latestAcceptanceSnapshot = state.acceptance?.history?.length
    ? state.acceptance.history[state.acceptance.history.length - 1]
    : undefined;
  const acceptanceDelta = compareAcceptanceSnapshotToCurrent(latestAcceptanceSnapshot, state);
  const connectorSummary = buildConnectorBundlePreviews({
    process: {
      processId: version.processId,
      projectId: '',
      title: version.titleSnapshot,
      category: 'kern',
      managementLevel: 'fachlich',
      hierarchyLevel: 'hauptprozess',
      parentProcessId: null,
      createdAt: version.createdAt,
      updatedAt: version.updatedAt,
    },
    version,
    state,
    settings,
  });
  const latestConnectorExport = state.connectorToolkit?.history?.length
    ? state.connectorToolkit.history[state.connectorToolkit.history.length - 1]
    : undefined;
  const connectorDelta = compareConnectorExportToCurrent(latestConnectorExport, connectorSummary.bundles);
  const benchmark = latestBenchmark(state);
  const collaborationSummary = buildCollaborationSummary(state);

  const caseCount = state.qualitySummary?.totalCases ?? state.cases.length;
  const stepCount = state.qualitySummary?.stepObservationCount ?? state.observations.filter(item => item.kind === 'step').length;
  const evidenceCount = state.qualitySummary?.stepObservationsWithEvidence
    ?? state.observations.filter(item => item.kind === 'step' && Boolean(item.evidenceSnippet?.trim())).length;
  const evidenceCoverage = stepCount > 0 ? Math.round((evidenceCount / stepCount) * 100) : 0;
  const hasAnalysisChain = Boolean(state.discoverySummary && state.conformanceSummary && state.enhancementSummary);
  const handoverCount = state.handoverDrafts?.length ?? 0;
  const readyConnectorCount = connectorSummary.bundles.filter(item => item.status === 'ready').length;
  const blockedConnectorCount = connectorSummary.bundles.filter(item => item.status === 'blocked').length;
  const integrationBlockedCount = integrationReadiness.items.filter(item => item.status === 'blocked').length;
  const qualityPass = Boolean(benchmark?.strictGate?.pass ?? (benchmark && benchmark.status === 'pass'));
  const hasPilotExport = Boolean(state.pilotToolkit?.lastExportedAt);

  const gates: ReleaseStabilityGate[] = [
    buildGate(
      'basis',
      'Analysebasis',
      caseCount >= 2 && stepCount >= 6 && evidenceCoverage >= 50 ? 'ready' : caseCount >= 1 && stepCount >= 3 ? 'attention' : 'blocked',
      caseCount === 0
        ? 'Noch keine belastbare Grundlage vorhanden.'
        : `${caseCount} ${caseCount === 1 ? 'Quelle' : 'Quellen'} · ${stepCount} Schritte · ${evidenceCoverage} % belegt.`,
      caseCount >= 2 && stepCount >= 6
        ? 'Die Materialbasis trägt bereits einen ruhigen Review- und Übergabefluss.'
        : 'Die App kann schon sinnvoll arbeiten, aber die Basis sollte noch etwas stabiler werden, bevor Sie den Stand freigeben.',
      caseCount < 2 || stepCount < 6 ? 'Mindestens eine weitere belastbare Quelle oder mehr abgesicherte Schritte ergänzen.' : undefined,
    ),
    buildGate(
      'analysis',
      'Analysekette',
      hasAnalysisChain ? 'ready' : stepCount > 0 ? 'attention' : 'blocked',
      hasAnalysisChain ? 'Discovery, Soll-Abgleich und Verbesserungsanalyse liegen vor.' : stepCount > 0 ? 'Die Folgeschritte sind noch nicht vollständig durchlaufen.' : 'Ohne Schritte bleibt die Kette leer.',
      hasAnalysisChain
        ? 'Die Analyse baut auf derselben Hauptlinie auf und ist für Bericht und Governance konsistent anschlussfähig.'
        : 'Vor Bericht, Review und Connector-Export sollte die Analysekette einmal vollständig und auf derselben Basis durchlaufen sein.',
      hasAnalysisChain ? undefined : 'Discovery, Soll-Abgleich und Verbesserungsanalyse nacheinander öffnen und prüfen.',
    ),
    buildGate(
      'report',
      'Bericht und Übergaben',
      state.reportSnapshot && reportFreshness?.isAligned && handoverCount >= 2 ? 'ready' : state.reportSnapshot ? 'attention' : 'blocked',
      !state.reportSnapshot
        ? 'Noch kein aktueller Bericht vorhanden.'
        : reportFreshness?.isAligned
        ? `${handoverCount} Übergaben liegen auf aktueller Basis vor.`
        : reportFreshness?.summary ?? 'Der Bericht sollte noch einmal geprüft werden.',
      state.reportSnapshot && reportFreshness?.isAligned && handoverCount >= 2
        ? 'Bericht, Storyline und Übergaben passen bereits zusammen und können in die Freigabe oder den Pilotlauf gehen.'
        : 'Die Kommunikation sollte erst dann als belastbar gelten, wenn Bericht und Übergaben zur aktuellen Analysebasis passen.',
      !state.reportSnapshot || !reportFreshness?.isAligned
        ? 'Bericht für die aktuelle Analysebasis neu erzeugen.'
        : handoverCount < 2
        ? 'Mindestens Übergaben für Management und operatives Team prüfen.'
        : undefined,
    ),
    buildGate(
      'governance',
      'Review und Freigabe',
      governanceWorkflow.stage === 'approved' && governanceWorkflow.approvalFresh && governanceSummary.readyForShare
        ? 'ready'
        : governanceWorkflow.stage === 'review-running' || governanceWorkflow.stage === 'approval-ready' || governanceWorkflow.stage === 'approved'
        ? 'attention'
        : 'blocked',
      `${governanceWorkflow.stageLabel}${governanceDelta?.summary ? ` · ${governanceDelta.summary}` : ''}`,
      governanceWorkflow.stage === 'approved' && governanceWorkflow.approvalFresh && governanceSummary.readyForShare
        ? 'Der Governance-Stand ist freigegeben und passt noch zur aktuellen Analysebasis.'
        : 'Für einen stabilen Pilotbetrieb sollte der Review- und Freigabepfad sichtbar gepflegt und auf Basisänderungen erneut bestätigt werden.',
      governanceWorkflow.stage === 'approved' && governanceWorkflow.approvalFresh && governanceSummary.readyForShare
        ? undefined
        : governanceWorkflow.stage === 'draft'
        ? 'Review-Vorlage anwenden und offene Entscheidungen strukturiert anlegen.'
        : governanceWorkflow.stage === 'review-prep'
        ? 'Review aktiv starten und offene Punkte priorisieren.'
        : governanceWorkflow.stage === 'review-running'
        ? 'Offene Punkte in Prüfung bringen oder zur Freigabe reif machen.'
        : 'Freigabe bestätigen oder nach Basisänderungen erneut prüfen.',
    ),
    buildGate(
      'collaboration',
      'Zusammenarbeit und Auditspur',
      collaborationSummary.openCommentCount === 0 && collaborationSummary.inReviewCommentCount === 0 && collaborationSummary.auditEntryCount > 0
        ? 'ready'
        : collaborationSummary.totalCommentCount > 0 || collaborationSummary.auditEntryCount > 0
        ? 'attention'
        : 'attention',
      collaborationSummary.auditEntryCount > 0
        ? `${collaborationSummary.auditEntryCount} Audit-Einträge · ${collaborationSummary.openCommentCount} offen · ${collaborationSummary.inReviewCommentCount} in Prüfung.`
        : 'Noch keine Team-Kommentare oder Auditspur dokumentiert.',
      collaborationSummary.auditEntryCount > 0
        ? 'Kommentare, Team-Notizen und Auditspur machen den Review-Pfad nachvollziehbarer und helfen bei der Weitergabe.'
        : 'Eine knappe Kommentar- und Auditspur hilft, Review-Entscheidungen und offene Punkte später sicher nachzuvollziehen.',
      collaborationSummary.auditEntryCount > 0 && collaborationSummary.openCommentCount === 0 && collaborationSummary.inReviewCommentCount === 0
        ? undefined
        : collaborationSummary.totalCommentCount === 0
        ? 'Mindestens einen Team-Kommentar oder ein Review-Update am Arbeitsstand festhalten.'
        : 'Offene oder laufende Kommentare vor der Weitergabe kurz prüfen.',
      true,
    ),
    buildGate(
      'security',
      'Sicherheit, Datenschutz und Deployment',
      securityReadiness.level === 'controlled'
        ? 'ready'
        : securityReadiness.level === 'review'
        ? 'attention'
        : 'blocked',
      `${securityReadiness.levelLabel} · ${securityReadiness.score}/100${securityReadiness.latestReviewLabel ? ` · ${securityReadiness.latestReviewLabel}` : ''}`,
      securityReadiness.summary,
      securityReadiness.items.find(item => item.status !== 'ready')?.action,
    ),
    buildGate(
      'pilot',
      'Pilot-Paket',
      pilotReadiness.level === 'pilot-ready' && hasPilotExport ? 'ready' : pilotReadiness.level !== 'not-ready' ? 'attention' : 'blocked',
      hasPilotExport
        ? `Pilot-Paket zuletzt exportiert am ${new Date(state.pilotToolkit?.lastExportedAt ?? '').toLocaleString('de-DE')}.`
        : 'Noch kein aktuelles Pilot-Paket exportiert.',
      hasPilotExport
        ? 'Das Pilot-Paket bündelt Bericht, Governance, Arbeitsstand und Moderationsrahmen. Es sollte nach größeren Änderungen bewusst neu erzeugt werden.'
        : 'Ein Pilotlauf profitiert von einem bewusst gebündelten Paket statt verstreuten Einzelartefakten.',
      hasPilotExport ? undefined : 'Pilot-Briefing und Paket in Schritt 5 einmal exportieren.',
    ),
    buildGate(
      'acceptance',
      'Formale Abnahme',
      acceptanceSummary.readyForAcceptance && acceptanceDelta?.isAligned !== false && Boolean(state.acceptance?.decision)
        ? 'ready'
        : acceptanceSummary.score >= 70 || Boolean(state.acceptance?.decision)
        ? 'attention'
        : 'blocked',
      acceptanceDelta
        ? acceptanceDelta.summary
        : `Empfehlung: ${acceptanceSummary.recommendedDecisionLabel}`,
      acceptanceSummary.headline,
      acceptanceSummary.readyForAcceptance && acceptanceDelta?.isAligned !== false && Boolean(state.acceptance?.decision)
        ? undefined
        : acceptanceSummary.nextActions[0] ?? 'Checkliste, Entscheidung und Abnahmestand bewusst festhalten.',
    ),
    buildGate(
      'connectors',
      'Connector-Pakete',
      connectorDelta?.isAligned && readyConnectorCount >= 2 ? 'ready' : readyConnectorCount > 0 ? 'attention' : 'blocked',
      connectorDelta
        ? connectorDelta.summary
        : readyConnectorCount > 0
        ? `${readyConnectorCount} Connector-Pakete sind bereits nutzbar.`
        : 'Noch keine brauchbaren Connector-Pakete vorbereitet.',
      blockedConnectorCount === 0
        ? 'Die Connector-Pakete bleiben optional. Wenn Sie sie nutzen, sollten sie zum aktuellen Stand passen und bewusst exportiert werden.'
        : 'Mindestens ein Connector-Paket ist aktuell noch blockiert und sollte nicht ungeprüft als Übergabekanal gelesen werden.',
      connectorDelta?.isAligned
        ? undefined
        : readyConnectorCount > 0
        ? 'Wichtigstes Connector-Paket neu exportieren oder Status kurz prüfen.'
        : 'Connector-Pakete erst nach Bericht und Governance sinnvoll vorbereiten.',
      true,
    ),
    buildGate(
      'quality',
      'Qualitätsschutz',
      qualityPass && integrationBlockedCount === 0 ? 'ready' : benchmark || integrationBlockedCount > 0 ? 'attention' : 'blocked',
      qualityPass
        ? `Benchmark und Checks wirken stabil${integrationBlockedCount > 0 ? `, aber ${integrationBlockedCount} Integrationshinweise sind noch offen.` : '.'}`
        : benchmark
        ? `Letzter Qualitätslauf: ${benchmark.headline}`
        : 'Noch kein gespeicherter Qualitätslauf vorhanden.',
      qualityPass && integrationBlockedCount === 0
        ? 'Die lokale Referenzbibliothek und die Betriebschecks sprechen aktuell nicht gegen einen strukturierten Pilotlauf.'
        : 'Vor Freigabe oder Pilotbetrieb sollten Benchmark, Integrations- und Connector-Checks einmal ruhig durchlaufen sein.',
      qualityPass && integrationBlockedCount === 0
        ? undefined
        : !benchmark
        ? 'Lokalen Qualitätscheck und Release-Check einmal laufen lassen.'
        : integrationBlockedCount > 0
        ? 'Betriebsgrenzen und Integrationshinweise im letzten Schritt prüfen.'
        : 'Release-Check einmal lokal ausführen und offene Punkte bewerten.',
    ),
  ];

  const score = Math.round(gates.reduce((sum, gate) => sum + statusWeight(gate.status), 0) / Math.max(gates.length, 1));
  const coreBlocked = gates.filter(gate => !gate.optional && gate.status === 'blocked').length;
  const coreAttention = gates.filter(gate => !gate.optional && gate.status === 'attention').length;

  let level: ReleaseFlowLevel = 'blocked';
  if (coreBlocked === 0 && coreAttention <= 2) {
    level = 'review-ready';
  } else if (coreBlocked === 0) {
    level = 'stabilizing';
  }
  if (
    coreBlocked === 0 &&
    gates.find(gate => gate.key === 'report')?.status === 'ready' &&
    gates.find(gate => gate.key === 'governance')?.status === 'ready' &&
    gates.find(gate => gate.key === 'pilot')?.status === 'ready' &&
    gates.find(gate => gate.key === 'acceptance')?.status === 'ready' &&
    gates.find(gate => gate.key === 'quality')?.status === 'ready'
  ) {
    level = 'release-ready';
  }

  const headline =
    level === 'blocked'
      ? 'Der Stand braucht noch sichtbare Nacharbeit, bevor Freigabe oder Pilotbetrieb sinnvoll sind.'
      : level === 'stabilizing'
      ? 'Der Stand ist schon gut nutzbar, sollte aber noch sauber zusammengezogen werden.'
      : level === 'review-ready'
      ? 'Der Stand ist gut genug für einen ruhigen Review- und Pilotvorbereitungsfluss.'
      : 'Der Stand wirkt stabil genug für Freigabe und einen begleiteten Pilotbetrieb.';

  const summary =
    level === 'blocked'
      ? 'Zuerst Analysekette, Bericht oder Governance schließen. Dann erst Pilot- oder Connector-Pakete exportieren.'
      : level === 'stabilizing'
      ? 'Die App ist fachlich weit genug. Jetzt geht es darum, Bericht, Review, Pilotpaket und optionale Connectoren sauber auf denselben Stand zu bringen.'
      : level === 'review-ready'
      ? 'Bericht, Review und Pilotvorbereitung tragen bereits gut zusammen. Die letzten offenen Punkte sollten jetzt bewusst und sichtbar geschlossen werden.'
      : 'Bericht, Governance, Pilot-Paket, formale Abnahme und Qualitätsschutz greifen bereits sauber ineinander.';

  const strengths = uniqueStrings([
    ...(gates.filter(gate => gate.status === 'ready').map(gate => `${gate.label} ist stabil.`)),
    maturity.strengths[0],
    pilotReadiness.strengths[0],
    securityReadiness.level === 'controlled' ? 'Sicherheits- und Deployment-Rahmen sind sichtbar gefasst.' : undefined,
    readiness.headline,
  ]).slice(0, 5);

  const nextActions = uniqueStrings([
    ...gates.filter(gate => gate.status !== 'ready').map(gate => gate.action),
    ...securityReadiness.items.filter(item => item.status !== 'ready').map(item => item.action),
    ...pilotReadiness.nextActions,
    ...readiness.nextActions,
  ]).slice(0, 6);

  return {
    level,
    levelLabel: levelLabel(level),
    headline,
    summary,
    score,
    gates,
    strengths,
    nextActions,
  };
}
