import type {
  Process,
  ProcessMiningAssistedV2State,
  ProcessMiningConnectorBundleKey,
  ProcessMiningConnectorBundleStatus,
  ProcessMiningConnectorContractSnapshot,
  ProcessMiningConnectorReceipt,
  ProcessVersion,
} from '../../domain/process';
import type { AppSettings } from '../../settings/appSettings';
import { APP_VERSION_LABEL } from '../../config/release';
import { buildConnectorBundlePreviews, type ConnectorBundlePreview } from './connectorBundles';
import { uniqueStrings } from './pmShared';

export interface ConnectorContractField {
  key: string;
  label: string;
  required: boolean;
  filled: boolean;
  sourceHint: string;
  summary: string;
  valuePreview?: string;
}

export interface ConnectorContractProfile {
  key: ProcessMiningConnectorBundleKey;
  label: string;
  shortLabel: string;
  audience: string;
  status: ProcessMiningConnectorBundleStatus;
  summary: string;
  rationale: string;
  fileBase: string;
  basisFingerprint: string;
  contractScore: number;
  requiredCount: number;
  filledRequiredCount: number;
  optionalCount: number;
  filledOptionalCount: number;
  missingRequiredFields: string[];
  fields: ConnectorContractField[];
  payload: Record<string, unknown>;
  textBriefing: string;
  exchangePackage: Record<string, unknown>;
}

export interface ConnectorContractsSummary {
  headline: string;
  recommendation: string;
  readyCount: number;
  partialCount: number;
  blockedCount: number;
  profiles: ConnectorContractProfile[];
}

function toPreview(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed.slice(0, 120) : undefined;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.length > 0 ? `${value.length} Einträge` : undefined;
  if (typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>);
    return keys.length > 0 ? `${keys.length} Felder` : undefined;
  }
  return undefined;
}

function field(params: {
  key: string;
  label: string;
  required: boolean;
  sourceHint: string;
  value: unknown;
  summary: string;
  filled?: boolean;
}): ConnectorContractField {
  const preview = toPreview(params.value);
  const filled = params.filled ?? preview !== undefined;
  return {
    key: params.key,
    label: params.label,
    required: params.required,
    filled,
    sourceHint: params.sourceHint,
    summary: params.summary,
    valuePreview: preview,
  };
}

function buildFieldSet(params: {
  key: ProcessMiningConnectorBundleKey;
  bundle: ConnectorBundlePreview;
  state: ProcessMiningAssistedV2State;
  settings: AppSettings;
}): ConnectorContractField[] {
  const { key, bundle, state, settings } = params;
  const payload = bundle.jsonPayload as Record<string, unknown>;
  const processInfo = (payload.process ?? {}) as Record<string, unknown>;
  const sourceSummary = (payload.sourceSummary ?? {}) as Record<string, unknown>;
  const metrics = (payload.metrics ?? {}) as Record<string, unknown>;
  const context = (payload.context ?? {}) as Record<string, unknown>;
  const guardrails = (payload.guardrails ?? {}) as Record<string, unknown>;
  const governance = (payload.governance ?? {}) as Record<string, unknown>;
  const workflow = (governance.workflow ?? {}) as Record<string, unknown>;
  const promptAssets = (payload.promptAssets ?? {}) as Record<string, unknown>;
  const reports = (payload.reports ?? {}) as Record<string, unknown>;
  const fallbackCoreSteps = Array.isArray(payload.mainFlow)
    ? (payload.mainFlow as string[])
    : state.discoverySummary?.topSteps ?? uniqueStrings(state.observations.filter(item => item.kind === 'step').map(item => item.label)).slice(0, 8);
  const fallbackDiscovery = payload.discovery ?? (fallbackCoreSteps.length > 0 ? {
    caseCount: state.cases.length,
    topSteps: fallbackCoreSteps,
  } : undefined);
  const fallbackNextActions = Array.isArray(payload.nextActions)
    ? (payload.nextActions as string[])
    : state.reportSnapshot?.nextActions ?? state.enhancementSummary?.issues.map(item => item.title).slice(0, 4) ?? [];
  const decisionsValue = governance.decisions ?? state.governance?.decisions ?? [];
  const guardrailsValue = Object.keys(guardrails).length > 0 ? guardrails : {
    stable: [],
    caution: [],
    blocked: [],
  };

  switch (key) {
    case 'ticket-handover':
      return [
        field({ key: 'process.title', label: 'Prozessbezug', required: true, sourceHint: 'Prozess und Version', value: processInfo.title, summary: 'Titel des Prozessstands für das Zielsystem.' }),
        field({ key: 'sourceSummary.cases', label: 'Quellenbasis', required: true, sourceHint: 'Erfasste Fälle und Dokumente', value: sourceSummary.cases, filled: Number(sourceSummary.cases ?? 0) > 0, summary: 'Zeigt, wie breit der Handover fachlich abgestützt ist.' }),
        field({ key: 'mainFlow', label: 'Hauptlinie', required: true, sourceHint: 'Discovery / Kernprozess', value: fallbackCoreSteps, filled: fallbackCoreSteps.length > 0, summary: 'Die zentrale Schrittabfolge für Ticket- oder Case-Systeme.' }),
        field({ key: 'nextActions', label: 'Nächste Schritte', required: true, sourceHint: 'Bericht oder lokale Zusammenfassung', value: fallbackNextActions, filled: fallbackNextActions.length > 0, summary: 'Operative To-dos für die Weitergabe.' }),
        field({ key: 'deviations', label: 'Soll-Hinweise', required: false, sourceHint: 'Soll-Abgleich', value: payload.deviations, summary: 'Hilft dem Zielsystem, kritische Abweichungen mitzunehmen.' }),
        field({ key: 'hotspots', label: 'Hotspots', required: false, sourceHint: 'Verbesserungsanalyse', value: payload.hotspots, summary: 'Zeigt Reibungspunkte oder Engpässe für operative Nacharbeit.' }),
      ];
    case 'bi-feed':
      return [
        field({ key: 'process.title', label: 'Prozessbezug', required: true, sourceHint: 'Prozess und Version', value: processInfo.title, summary: 'Titel des Prozessstands für BI oder Reporting.' }),
        field({ key: 'metrics.steps', label: 'Kennzahlenbasis', required: true, sourceHint: 'Lokale Schritterkennung', value: metrics.steps, filled: Number(metrics.steps ?? 0) > 0, summary: 'Schritte sind die Grundmenge für Dashboards und Reporting.' }),
        field({ key: 'readiness', label: 'Analyse-Einordnung', required: true, sourceHint: 'Readiness und Datenreife', value: payload.readiness ?? { mode: state.lastDerivationSummary?.analysisMode }, filled: Boolean(payload.readiness || state.lastDerivationSummary?.analysisMode), summary: 'Ordnet die Belastbarkeit des Feeds fachlich ein.' }),
        field({ key: 'discovery', label: 'Discovery-Summe', required: true, sourceHint: 'Kernprozess erkennen', value: fallbackDiscovery, filled: Boolean(fallbackDiscovery), summary: 'Verdichteter Kernprozess für Reporting und Zeitreihen.' }),
        field({ key: 'conformance', label: 'Soll-Abgleich', required: false, sourceHint: 'Mit Soll abgleichen', value: payload.conformance, summary: 'Nimmt Abweichungen mit, wenn sie bereits berechnet wurden.' }),
        field({ key: 'domainBenchmark', label: 'Benchmark und Qualitätslage', required: false, sourceHint: 'Goldfälle und Qualitätsmetriken', value: payload.domainBenchmark, summary: 'Zeigt, wie stark die lokale Analyse in diesem Fachfeld schon ist.' }),
      ];
    case 'ai-proxy':
      return [
        field({ key: 'process.title', label: 'Prozessbezug', required: true, sourceHint: 'Prozess und Version', value: processInfo.title, summary: 'Referenz für Proxy oder KI-Orchestrierung.' }),
        field({ key: 'context.mainFlow', label: 'Kernkontext', required: true, sourceHint: 'Discovery / Kernprozess', value: context.mainFlow ?? fallbackCoreSteps, filled: fallbackCoreSteps.length > 0 || Array.isArray(context.mainFlow), summary: 'Die lokale Hauptlinie bleibt der führende Kern für externe Verfeinerung.' }),
        field({ key: 'guardrails', label: 'Guardrails', required: true, sourceHint: 'Integrationsrahmen und Betriebsgrenzen', value: guardrailsValue, filled: true, summary: 'Definiert, was die externe KI beachten oder gerade nicht überdehnen soll.' }),
        field({ key: 'roles-and-systems', label: 'Rollen und Systeme', required: false, sourceHint: 'Lokale Extraktion', value: uniqueStrings([...(context.roles as string[] | undefined ?? []), ...(context.systems as string[] | undefined ?? [])]), summary: 'Kontext für Formulierung, Einordnung und systemische Anschlussfähigkeit.' }),
        field({ key: 'prompt', label: 'Vorbereiteter Prompt', required: false, sourceHint: 'Optionale KI-Verfeinerung', value: promptAssets.prompt, summary: 'Kann direkt an einen Proxy oder per Copy/Paste übergeben werden.' }),
        field({ key: 'endpointConfigured', label: 'API-Hinweis', required: false, sourceHint: 'Setup', value: settings.ai.api.endpointUrl || undefined, summary: 'Zeigt, ob ein optionaler API-Pfad bewusst vorkonfiguriert wurde.' }),
      ];
    case 'governance-archive':
      return [
        field({ key: 'process.title', label: 'Prozessbezug', required: true, sourceHint: 'Prozess und Version', value: processInfo.title, summary: 'Referenz für Governance, Review oder Audit.' }),
        field({ key: 'workflow.stage', label: 'Governance-Workflow', required: true, sourceHint: 'Freigabe und Governance', value: workflow.stage ?? state.governance?.approval?.status, filled: Boolean(workflow.stage || state.governance?.approval?.status || state.governance), summary: 'Aktueller Stand von Vorbereitung, Review oder Freigabe.' }),
        field({ key: 'reports.current', label: 'Aktueller Bericht', required: true, sourceHint: 'Bericht und Übergaben', value: reports.current ?? state.reportSnapshot, filled: Boolean(reports.current || state.reportSnapshot), summary: 'Zentrale Berichtsbasis für Archiv, Review und Weitergabe.' }),
        field({ key: 'governance.decisions', label: 'Entscheidungslog', required: true, sourceHint: 'Governance-Entscheidungen', value: decisionsValue, filled: Array.isArray(decisionsValue), summary: 'Offene, geprüfte oder freigegebene Punkte im Governance-Verlauf.' }),
        field({ key: 'governance.history', label: 'Gemerkte Governance-Stände', required: false, sourceHint: 'Governance-Snapshots', value: governance.history, summary: 'Macht Freigabe- und Review-Entwicklung vergleichbar.' }),
        field({ key: 'pilot-and-connector-context', label: 'Pilot- und Connector-Kontext', required: false, sourceHint: 'Pilot-Toolkit und Connector-Hilfe', value: { pilot: payload.pilot, connectorToolkit: payload.connectorToolkit }, summary: 'Hält Nachvollziehbarkeit für Pilot und externe Übergaben fest.' }),
      ];
    default:
      return [];
  }
}

function buildContractScore(fields: ConnectorContractField[]) {
  const required = fields.filter(item => item.required);
  const optional = fields.filter(item => !item.required);
  const requiredFilled = required.filter(item => item.filled).length;
  const optionalFilled = optional.filter(item => item.filled).length;
  const raw = ((requiredFilled * 1) + (optionalFilled * 0.35)) / Math.max(required.length + optional.length * 0.35, 1);
  return {
    requiredCount: required.length,
    filledRequiredCount: requiredFilled,
    optionalCount: optional.length,
    filledOptionalCount: optionalFilled,
    contractScore: Math.round(raw * 100),
    missingRequiredFields: required.filter(item => !item.filled).map(item => item.label),
  };
}

function buildExchangePackage(params: {
  bundle: ConnectorBundlePreview;
  fields: ConnectorContractField[];
  contractScore: number;
  missingRequiredFields: string[];
  endpointNote?: string;
}): Record<string, unknown> {
  const { bundle, fields, contractScore, missingRequiredFields, endpointNote } = params;
  return {
    schemaVersion: 'pm-integration-exchange-v1',
    manifest: {
      connectorKey: bundle.key,
      label: bundle.label,
      shortLabel: bundle.shortLabel,
      appVersion: APP_VERSION_LABEL,
      builtAt: new Date().toISOString(),
      basisFingerprint: bundle.basisFingerprint,
      contractScore,
      status: bundle.status,
      audience: bundle.audience,
      endpointNote: endpointNote?.trim() || null,
    },
    contract: {
      summary: bundle.summary,
      rationale: bundle.rationale,
      includes: bundle.includes,
      missingRequiredFields,
      fields,
    },
    payload: bundle.jsonPayload,
    textBriefing: bundle.textPayload,
  };
}

export function buildConnectorContractProfiles(params: {
  process: Process;
  version: ProcessVersion;
  state: ProcessMiningAssistedV2State;
  settings: AppSettings;
}): ConnectorContractsSummary {
  const bundlesSummary = buildConnectorBundlePreviews(params);
  const profiles = bundlesSummary.bundles.map(bundle => {
    const fields = buildFieldSet({ key: bundle.key, bundle, state: params.state, settings: params.settings });
    const scoring = buildContractScore(fields);
    const exchangePackage = buildExchangePackage({
      bundle,
      fields,
      contractScore: scoring.contractScore,
      missingRequiredFields: scoring.missingRequiredFields,
      endpointNote: params.state.connectorToolkit?.endpointNote,
    });

    return {
      key: bundle.key,
      label: bundle.label,
      shortLabel: bundle.shortLabel,
      audience: bundle.audience,
      status: bundle.status,
      summary: bundle.summary,
      rationale: bundle.rationale,
      fileBase: bundle.fileBase,
      basisFingerprint: bundle.basisFingerprint,
      contractScore: scoring.contractScore,
      requiredCount: scoring.requiredCount,
      filledRequiredCount: scoring.filledRequiredCount,
      optionalCount: scoring.optionalCount,
      filledOptionalCount: scoring.filledOptionalCount,
      missingRequiredFields: scoring.missingRequiredFields,
      fields,
      payload: bundle.jsonPayload,
      textBriefing: bundle.textPayload,
      exchangePackage,
    } satisfies ConnectorContractProfile;
  });

  return {
    headline: profiles.filter(item => item.status === 'ready').length >= 2
      ? 'Die Integrationsschicht ist für mehrere Wege strukturiert vorbereitet.'
      : 'Mindestens ein Integrationsweg ist strukturiert angelegt. Weitere Wege gewinnen mit Bericht, Governance oder Benchmark.',
    recommendation: profiles.find(item => item.status === 'ready')?.label ?? profiles.find(item => item.status === 'partial')?.label ?? 'Noch kein Integrationsweg empfohlen',
    readyCount: profiles.filter(item => item.status === 'ready').length,
    partialCount: profiles.filter(item => item.status === 'partial').length,
    blockedCount: profiles.filter(item => item.status === 'blocked').length,
    profiles,
  };
}

export function pushConnectorContractSnapshot(
  history: ProcessMiningConnectorContractSnapshot[] | undefined,
  next: ProcessMiningConnectorContractSnapshot,
  limit = 12,
): ProcessMiningConnectorContractSnapshot[] {
  const base = history ?? [];
  const latest = base.length > 0 ? base[base.length - 1] : undefined;
  if (
    latest &&
    latest.key === next.key &&
    latest.basisFingerprint === next.basisFingerprint &&
    latest.completenessScore === next.completenessScore &&
    latest.missingRequiredFields.join('|') === next.missingRequiredFields.join('|')
  ) {
    return [...base.slice(0, -1), { ...next, id: latest.id }].slice(-limit);
  }
  return [...base, next].slice(-limit);
}

export function pushConnectorReceipt(
  history: ProcessMiningConnectorReceipt[] | undefined,
  next: ProcessMiningConnectorReceipt,
  limit = 20,
): ProcessMiningConnectorReceipt[] {
  return [...(history ?? []), next].slice(-limit);
}

export function parseConnectorReceipt(params: {
  text: string;
  profiles: ConnectorContractProfile[];
  source: 'paste' | 'file';
}): { receipt?: ProcessMiningConnectorReceipt; error?: string } {
  const trimmed = params.text.trim();
  if (!trimmed) return { error: 'Bitte fügen Sie zuerst eine Rückmeldung als JSON ein.' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { error: 'Die Rückmeldung ist kein gültiges JSON.' };
  }

  const base = parsed && typeof parsed === 'object' && 'receipt' in parsed
    ? (parsed as { receipt?: unknown }).receipt
    : parsed;

  if (!base || typeof base !== 'object') {
    return { error: 'Die Rückmeldung enthält kein erkennbares Receipt-Objekt.' };
  }

  const data = base as Record<string, unknown>;
  const key = typeof data.connectorKey === 'string' ? data.connectorKey : typeof data.key === 'string' ? data.key : '';
  const profile = params.profiles.find(item => item.key === key);
  if (!profile) {
    return { error: 'Die Rückmeldung enthält keinen unterstützten Connector-Schlüssel.' };
  }

  const rawStatus = typeof data.status === 'string' ? data.status.toLowerCase() : 'queued';
  const status = rawStatus === 'accepted' || rawStatus === 'completed' || rawStatus === 'rejected' || rawStatus === 'queued'
    ? rawStatus
    : 'queued';
  const importedAtCandidate = typeof data.importedAt === 'string'
    ? data.importedAt
    : typeof data.acceptedAt === 'string'
    ? data.acceptedAt
    : typeof data.receivedAt === 'string'
    ? data.receivedAt
    : undefined;

  const importedAt = importedAtCandidate && !Number.isNaN(Date.parse(importedAtCandidate))
    ? new Date(importedAtCandidate).toISOString()
    : new Date().toISOString();

  return {
    receipt: {
      id: crypto.randomUUID(),
      key: profile.key,
      label: profile.label,
      importedAt,
      status,
      externalRef: typeof data.externalRef === 'string' ? data.externalRef.trim() || undefined : undefined,
      endpoint: typeof data.endpoint === 'string' ? data.endpoint.trim() || undefined : undefined,
      note: typeof data.note === 'string' ? data.note.trim() || undefined : typeof data.message === 'string' ? data.message.trim() || undefined : undefined,
      basisFingerprint: typeof data.basisFingerprint === 'string' ? data.basisFingerprint.trim() || undefined : undefined,
      source: params.source,
    },
  };
}

export function describeReceiptStatus(status: ProcessMiningConnectorReceipt['status']): string {
  switch (status) {
    case 'accepted':
      return 'angenommen';
    case 'completed':
      return 'abgeschlossen';
    case 'rejected':
      return 'abgelehnt';
    default:
      return 'eingegangen';
  }
}
