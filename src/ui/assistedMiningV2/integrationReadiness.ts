import type {
  ProcessMiningAssistedV2State,
  ProcessMiningGovernanceDecisionStatus,
  ProcessVersion,
} from '../../domain/process';
import type { AppSettings } from '../../settings/appSettings';
import { APP_VERSION_LABEL } from '../../config/release';
import { computeGovernanceSummary } from './governance';
import { computeMiningReadiness } from './analysisReadiness';
import { evaluatePilotReadiness } from './pilotReadiness';

export type IntegrationStatus = 'ready' | 'partial' | 'blocked';

export interface IntegrationItemSummary {
  key: 'local' | 'ai' | 'governance' | 'handover' | 'time-data' | 'snapshot';
  label: string;
  status: IntegrationStatus;
  summary: string;
  detail: string;
}

export interface IntegrationPayloads {
  profile: Record<string, unknown>;
  handover: Record<string, unknown>;
}

export interface IntegrationReadinessSummary {
  headline: string;
  items: IntegrationItemSummary[];
  boundaries: {
    stable: string[];
    caution: string[];
    blocked: string[];
  };
  payloads: IntegrationPayloads;
}

function countGovernanceStatuses(state: ProcessMiningAssistedV2State): Record<ProcessMiningGovernanceDecisionStatus, number> {
  const counts: Record<ProcessMiningGovernanceDecisionStatus, number> = {
    open: 0,
    in_review: 0,
    approved: 0,
    deferred: 0,
  };
  for (const item of state.governance?.decisions ?? []) {
    counts[item.status] += 1;
  }
  return counts;
}

function normalizeEndpoint(endpointUrl: string): string {
  try {
    const url = new URL(endpointUrl);
    return `${url.origin}${url.pathname}`;
  } catch {
    return endpointUrl;
  }
}

export function evaluateIntegrationReadiness(params: {
  state: ProcessMiningAssistedV2State;
  version?: ProcessVersion;
  settings: AppSettings;
}): IntegrationReadinessSummary {
  const { state, version, settings } = params;
  const stepCount = state.observations.filter(observation => observation.kind === 'step').length;
  const caseCount = state.cases.length;
  const realTimeCount = state.observations.filter(observation => observation.timestampQuality === 'real').length;
  const report = state.reportSnapshot;
  const governanceCounts = countGovernanceStatuses(state);
  const governanceSummary = version ? computeGovernanceSummary({ state, version }) : null;
  const readiness = computeMiningReadiness({ state, version });
  const pilotReadiness = evaluatePilotReadiness({ state, version });
  const apiConfigured = Boolean(settings.ai.api.endpointUrl.trim());
  const aiModeLabel = settings.ai.mode === 'api' ? 'API-Modus' : 'Copy/Paste-Modus';

  const items: IntegrationItemSummary[] = [
    {
      key: 'local',
      label: 'Lokale Dokument- und Fallauswertung',
      status: stepCount > 0 ? 'ready' : caseCount > 0 ? 'partial' : 'blocked',
      summary:
        stepCount > 0
          ? `${stepCount} Prozessschritte wurden lokal erkannt. Die App kann damit ohne KI weiterarbeiten.`
          : caseCount > 0
          ? 'Quellen sind vorhanden, liefern aber noch keine tragfähigen Prozessschritte.'
          : 'Noch keine Quelle ausgewertet.',
      detail:
        caseCount > 0
          ? `Quellen: ${caseCount}. Analysemodus: ${readiness.analysisModeLabel}.`
          : 'Laden Sie zuerst Freitext, Dokument oder Tabelle in den Assisted-Flow.',
    },
    {
      key: 'ai',
      label: 'Optionale KI-Verfeinerung',
      status: stepCount === 0 ? 'blocked' : apiConfigured ? 'ready' : 'partial',
      summary:
        stepCount === 0
          ? 'Ohne lokal erkannte Schritte lohnt sich eine KI-Verfeinerung noch nicht.'
          : apiConfigured
          ? `${aiModeLabel} ist vorbereitet. Ein Endpoint ist hinterlegt.`
          : 'Copy/Paste ist bereit. Für direkte API-Aufrufe fehlt noch ein Endpoint im Setup.',
      detail: apiConfigured
        ? `Konfigurierter Endpoint: ${normalizeEndpoint(settings.ai.api.endpointUrl)}.`
        : 'Die App bleibt lokal nutzbar. Optional kann später ein API-Endpunkt ergänzt werden.',
    },
    {
      key: 'governance',
      label: 'Governance und Review-Weitergabe',
      status:
        report && governanceSummary?.readyForShare
          ? 'ready'
          : governanceCounts.open + governanceCounts.in_review > 0 || Boolean(report)
          ? 'partial'
          : 'blocked',
      summary:
        report && governanceSummary?.readyForShare
          ? 'Bericht und Governance-Stand sind bereits weitgehend weitergabefähig.'
          : report
          ? 'Ein Bericht liegt vor, aber Review oder Entscheidungen sind noch offen.'
          : 'Noch kein belastbarer Bericht für Governance oder Review vorhanden.',
      detail: `Offene Entscheidungen: ${governanceCounts.open}. In Prüfung: ${governanceCounts.in_review}. Freigegeben: ${governanceCounts.approved}.`,
    },
    {
      key: 'handover',
      label: 'Export- und Handover-Pfade',
      status: state.handoverDrafts?.length || report ? 'ready' : stepCount > 0 ? 'partial' : 'blocked',
      summary:
        state.handoverDrafts?.length
          ? `${state.handoverDrafts.length} Übergaben liegen bereits vor.`
          : report
          ? 'Ein Bericht ist vorhanden. Zielgruppenspezifische Übergaben können direkt erzeugt werden.'
          : 'Noch keine Übergaben oder Berichte vorbereitet.',
      detail: state.pilotToolkit?.lastExportedAt
        ? `Letztes Pilot-Paket exportiert am ${new Date(state.pilotToolkit.lastExportedAt).toLocaleString('de-DE')}.`
        : 'Pilot-Paket, Bericht und Snapshot stehen als vorbereitete Exportwege bereit.',
    },
    {
      key: 'time-data',
      label: 'Tabellen- und Eventdaten-Übergabe',
      status: realTimeCount > 0 && caseCount > 1 ? 'ready' : caseCount > 0 ? 'partial' : 'blocked',
      summary:
        realTimeCount > 0 && caseCount > 1
          ? 'Zeitbasierte Analysen und tabellarische Übergaben sind grundsätzlich vorbereitet.'
          : caseCount > 0
          ? 'Die App kann Tabellen und Eventdaten importieren, aber für belastbare Zeitpfade fehlen noch echte Zeitangaben oder weitere Fälle.'
          : 'Noch keine Basis für tabellarische oder zeitbasierte Übergaben.',
      detail: realTimeCount > 0
        ? `${realTimeCount} Ereignisse mit echten Zeitangaben erkannt.`
        : 'Aktuell keine echten Zeitangaben in den Quellen gefunden.',
    },
    {
      key: 'snapshot',
      label: 'Arbeitsstand sichern und wiederverwenden',
      status: caseCount > 0 ? 'ready' : 'partial',
      summary:
        caseCount > 0
          ? 'Snapshot-Export und Wiederaufnahme sind direkt nutzbar.'
          : 'Die Funktion ist vorbereitet und wird sinnvoll, sobald ein Arbeitsstand vorliegt.',
      detail: `App-Stand ${APP_VERSION_LABEL}. Pilot-Readiness: ${pilotReadiness.levelLabel} (${pilotReadiness.score}/100).`,
    },
  ];

  const boundaries = {
    stable: [
      stepCount > 0 ? 'Lokale Dokument- und Fallauswertung mit Prozessschritten, Rollen und Reibungssignalen.' : '',
      report ? 'Berichte, Übergaben und Pilot-/Governance-Pakete auf Basis des aktuellen Arbeitsstands.' : '',
      caseCount > 0 ? 'Arbeitsstand als Snapshot sichern und später wieder vollständig laden.' : '',
    ].filter(Boolean),
    caution: [
      caseCount < 3 && stepCount > 0 ? 'Soll-Abgleich und Variantenbilder sind bei sehr wenigen Fällen eher Orientierung als Statistik.' : '',
      realTimeCount === 0 && stepCount > 0 ? 'Zeit-Hotspots und Durchlaufzeiten sollten ohne echte Zeitstempel nur vorsichtig gelesen werden.' : '',
      !governanceSummary?.readyForShare && (governanceCounts.open + governanceCounts.in_review > 0)
        ? 'Weitergaben sind fachlich möglich, aber Governance und Review sind noch nicht vollständig geklärt.'
        : '',
    ].filter(Boolean),
    blocked: [
      !apiConfigured ? 'Direkte Live-Anbindung an eine KI-API ist noch nicht aktiv, solange im Setup kein Endpoint hinterlegt ist.' : '',
      realTimeCount === 0 ? 'Belastbare zeitbasierte Connector-Pfade brauchen echte Zeitangaben aus Tabelle oder Eventdaten.' : '',
      'Direkte Live-Synchronisation mit Drittsystemen ist bewusst noch nicht aktiv. Die App liefert vorbereitete Exportprofile statt stiller Hintergrundkopplung.',
    ].filter(Boolean),
  };

  const headline =
    items.filter(item => item.status === 'ready').length >= 4
      ? 'Die Betriebsbasis wirkt stabil. Lokale Analyse, Übergabe und vorbereitete Integrationswege sind gut nutzbar.'
      : items.some(item => item.status === 'blocked')
      ? 'Die wichtigsten Wege sind vorbereitet, einzelne Integrations- oder Betriebswege brauchen aber noch Ergänzungen.'
      : 'Die Integrationsbasis ist nutzbar, sollte aber vor längeren Pilotläufen noch kurz geprüft werden.';

  const payloads: IntegrationPayloads = {
    profile: {
      schemaVersion: 'pm-integration-profile-v1',
      exportedAt: new Date().toISOString(),
      appVersion: APP_VERSION_LABEL,
      analysisMode: readiness.analysisModeLabel,
      processTitle: version?.titleSnapshot ?? 'Unbenannter Prozess',
      versionLabel: version?.versionLabel ?? version?.id ?? 'ohne Versionslabel',
      counts: {
        cases: caseCount,
        steps: stepCount,
        observations: state.observations.length,
        realTimeEvents: realTimeCount,
      },
      localEngine: state.lastDerivationSummary?.engineVersion ?? 'pm-local-engine',
      reportAvailable: Boolean(report),
      governanceStatus: governanceSummary?.headline ?? 'Noch kein Governance-Stand',
      pilotReadiness: {
        level: pilotReadiness.level,
        label: pilotReadiness.levelLabel,
        score: pilotReadiness.score,
      },
      integrationItems: items.map(item => ({
        key: item.key,
        label: item.label,
        status: item.status,
        summary: item.summary,
      })),
    },
    handover: {
      schemaVersion: 'pm-integration-handover-v1',
      exportedAt: new Date().toISOString(),
      process: {
        title: version?.titleSnapshot ?? 'Unbenannter Prozess',
        versionLabel: version?.versionLabel ?? version?.id ?? 'ohne Versionslabel',
      },
      report: report
        ? {
            title: report.title,
            executiveSummary: report.executiveSummary,
            keyFindings: report.keyFindings,
            nextActions: report.nextActions,
            cautionNotes: report.cautionNotes,
          }
        : null,
      governance: {
        open: governanceCounts.open,
        inReview: governanceCounts.in_review,
        approved: governanceCounts.approved,
        deferred: governanceCounts.deferred,
      },
      handovers: state.handoverDrafts?.map(item => ({
        audience: item.audience,
        label: item.label,
        summary: item.summary,
      })) ?? [],
      lastDerivationSummary: state.lastDerivationSummary
        ? {
            sourceLabel: state.lastDerivationSummary.sourceLabel,
            confidence: state.lastDerivationSummary.confidence,
            stepLabels: state.lastDerivationSummary.stepLabels,
            issueSignals: state.lastDerivationSummary.issueSignals,
          }
        : null,
      boundaries,
    },
  };

  return {
    headline,
    items,
    boundaries,
    payloads,
  };
}
