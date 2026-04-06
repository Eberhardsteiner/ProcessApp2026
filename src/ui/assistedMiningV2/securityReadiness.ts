import type {
  ProcessMiningAssistedV2State,
  ProcessMiningDataClassification,
  ProcessMiningDeploymentTarget,
  ProcessVersion,
} from '../../domain/process';
import type { AppSettings } from '../../settings/appSettings';
import { APP_VERSION_LABEL } from '../../config/release';
import { uniqueStrings } from './pmShared';

export type SecurityReadinessStatus = 'ready' | 'attention' | 'blocked';
export type SecurityReadinessLevel = 'controlled' | 'review' | 'risk';

export interface SecurityReadinessItem {
  key: 'handling' | 'signals' | 'retention' | 'deployment' | 'secrets' | 'exports';
  label: string;
  status: SecurityReadinessStatus;
  summary: string;
  detail: string;
  action?: string;
}

export interface SecuritySignalSummary {
  emailCount: number;
  phoneCount: number;
  identifierCount: number;
  sensitiveMarkerCount: number;
}

export interface SecurityReadinessSummary {
  level: SecurityReadinessLevel;
  levelLabel: string;
  score: number;
  headline: string;
  summary: string;
  items: SecurityReadinessItem[];
  stable: string[];
  caution: string[];
  blocked: string[];
  externalPaths: {
    active: string[];
    optional: string[];
  };
  signals: SecuritySignalSummary;
  latestReviewLabel?: string;
  payloads: {
    profile: Record<string, unknown>;
    briefing: string;
  };
}

function statusWeight(status: SecurityReadinessStatus): number {
  if (status === 'ready') return 100;
  if (status === 'attention') return 60;
  return 20;
}

function levelLabel(level: SecurityReadinessLevel): string {
  if (level === 'controlled') return 'Kontrollierter Betriebsrahmen';
  if (level === 'review') return 'Vor Einsatz kurz prüfen';
  return 'Noch nicht verantwortbar gefasst';
}

function buildItem(
  key: SecurityReadinessItem['key'],
  label: string,
  status: SecurityReadinessStatus,
  summary: string,
  detail: string,
  action?: string,
): SecurityReadinessItem {
  return { key, label, status, summary, detail, action };
}

function countMatches(text: string, regex: RegExp) {
  return Array.from(text.matchAll(regex)).length;
}

function collectSourceText(state: ProcessMiningAssistedV2State): string {
  return [
    ...state.cases.flatMap(item => [item.name, item.narrative, item.sourceNote]),
    state.reportSnapshot?.executiveSummary,
    state.reportSnapshot?.processStory,
    ...(state.discoverySummary?.topSteps ?? []),
    ...(state.conformanceSummary?.deviationNotes ?? []),
    ...(state.enhancementSummary?.issues ?? []).flatMap(item => [item.title, item.description]),
  ]
    .filter((value): value is string => Boolean(value?.trim()))
    .join('\n');
}

function detectSignals(text: string): SecuritySignalSummary {
  const emailCount = countMatches(text, /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi);
  const phoneCount = countMatches(text, /(?:\+?\d[\d\s/()-]{7,}\d)/g);
  const identifierCount = countMatches(text, /\b(?:seriennummer|serial|auftragsnummer|auftrag|ticket|kundennummer|rechnungsnummer|invoice|rma|lieferung|bestellnummer)\b/gi);
  const sensitiveMarkerCount = emailCount + phoneCount + identifierCount;
  return {
    emailCount,
    phoneCount,
    identifierCount,
    sensitiveMarkerCount,
  };
}

function classificationLabel(value?: ProcessMiningDataClassification) {
  if (value === 'restricted') return 'streng vertraulich';
  if (value === 'confidential') return 'vertraulich';
  if (value === 'internal') return 'intern';
  return 'noch nicht festgelegt';
}

function deploymentLabel(value?: ProcessMiningDeploymentTarget) {
  if (value === 'managed-pilot') return 'betreuter Pilotbetrieb';
  if (value === 'internal-proxy') return 'interner Proxy-/Gateway-Betrieb';
  if (value === 'internal-static') return 'interne statische Bereitstellung';
  if (value === 'local-browser') return 'lokaler Browserbetrieb';
  return 'noch nicht festgelegt';
}

function formatReviewLabel(state: ProcessMiningAssistedV2State) {
  if (!state.security?.reviewedAt) return undefined;
  const who = state.security.reviewedBy?.trim();
  const when = new Date(state.security.reviewedAt).toLocaleString('de-DE');
  return who ? `zuletzt geprüft von ${who} am ${when}` : `zuletzt geprüft am ${when}`;
}

export function evaluateSecurityReadiness(params: {
  state: ProcessMiningAssistedV2State;
  version?: ProcessVersion;
  settings: AppSettings;
}): SecurityReadinessSummary {
  const { state, version, settings } = params;
  const sourceText = collectSourceText(state);
  const signals = detectSignals(sourceText);
  const caseCount = state.cases.length;
  const stepCount = state.observations.filter(item => item.kind === 'step').length;
  const activeExternalPaths = uniqueStrings([
    settings.dataHandlingMode === 'external' ? 'genereller externer Verarbeitungsmodus' : undefined,
    settings.ai.mode === 'api' && settings.ai.api.endpointUrl.trim() ? `KI-API: ${settings.ai.api.endpointUrl.trim()}` : undefined,
    settings.transcription.providerId !== 'none' ? `Transkription: ${settings.transcription.providerId}` : undefined,
    settings.translation.providerId !== 'none' ? `Übersetzung: ${settings.translation.providerId}` : undefined,
    settings.processMining.externalizeEvents ? 'Event-Auslagerung ab Schwellwert' : undefined,
  ]);
  const optionalExternalPaths = uniqueStrings([
    settings.ai.mode === 'copy_paste' ? 'manuelles Copy/Paste zu einer externen KI' : undefined,
    state.connectorToolkit?.history?.length ? 'exportierte Connector-Pakete' : undefined,
    state.pilotToolkit?.lastExportedAt ? 'exportierte Pilot-Pakete' : undefined,
    state.security?.lastProfileExportedAt ? 'exportiertes Sicherheits-/Deployment-Profil' : undefined,
  ]);
  const hasSensitiveSignals = signals.sensitiveMarkerCount > 0;
  const classificationSet = Boolean(state.security?.dataClassification);
  const reviewPresent = Boolean(state.security?.reviewedAt);
  const retentionPresent = Boolean(state.security?.retentionNote?.trim());
  const backupPresent = Boolean(state.security?.backupNote?.trim());
  const deploymentSet = Boolean(state.security?.deploymentTarget);
  const deploymentNotePresent = Boolean(state.security?.deploymentNote?.trim());
  const incidentContactPresent = Boolean(state.security?.incidentContact?.trim());
  const externalApproved = state.security?.allowExternalProcessing ?? false;
  const authConfigured = settings.ai.mode !== 'api' || !settings.ai.api.endpointUrl.trim() || settings.ai.api.authMode !== 'none';
  const reportOrExportsPresent = Boolean(state.reportSnapshot || state.connectorToolkit?.history?.length || state.pilotToolkit?.lastExportedAt);
  const collaborationEntries = state.collaboration?.auditTrail?.length ?? 0;

  const items: SecurityReadinessItem[] = [
    buildItem(
      'handling',
      'Datenverarbeitung und externe Wege',
      activeExternalPaths.length === 0
        ? 'ready'
        : externalApproved
        ? 'attention'
        : 'blocked',
      activeExternalPaths.length === 0
        ? 'Die App arbeitet aktuell ohne aktivierte externe Verarbeitungswege.'
        : `${activeExternalPaths.length} aktive externe Wege sind konfiguriert.`,
      activeExternalPaths.length === 0
        ? 'Copy/Paste und Export bleiben bewusst manuelle Übergänge und werden nicht automatisch ausgelöst.'
        : `Aktiv: ${activeExternalPaths.join(' · ')}.${optionalExternalPaths.length ? ` Optional: ${optionalExternalPaths.join(' · ')}.` : ''}`,
      activeExternalPaths.length > 0 && !externalApproved
        ? 'Externe Verarbeitung bewusst freigeben oder den Betrieb zunächst lokal halten.'
        : undefined,
    ),
    buildItem(
      'signals',
      'Sensitivität und Klassifikation',
      hasSensitiveSignals && !classificationSet
        ? 'blocked'
        : hasSensitiveSignals || classificationSet
        ? 'attention'
        : 'ready',
      hasSensitiveSignals
        ? `${signals.sensitiveMarkerCount} sensible Marker im Material erkannt.`
        : classificationSet
        ? `Material als ${classificationLabel(state.security?.dataClassification)} eingestuft.`
        : 'Keine deutlichen sensiblen Marker erkannt.',
      hasSensitiveSignals
        ? `E-Mail-Adressen: ${signals.emailCount} · Telefonnummern: ${signals.phoneCount} · Fach-/Vorgangskennzeichen: ${signals.identifierCount}. Klassifikation: ${classificationLabel(state.security?.dataClassification)}.`
        : `Klassifikation: ${classificationLabel(state.security?.dataClassification)}.`,
      hasSensitiveSignals && !classificationSet
        ? 'Datenklassifikation festlegen und kurz dokumentieren, wie mit sensiblen Stellen umgegangen wird.'
        : hasSensitiveSignals && !state.security?.privacyNote?.trim()
        ? 'Kurze Datenschutznote ergänzen, damit die sensiblen Marker fachlich eingeordnet sind.'
        : undefined,
    ),
    buildItem(
      'retention',
      'Aufbewahrung, Backups und Wiederherstellung',
      retentionPresent && backupPresent
        ? 'ready'
        : reportOrExportsPresent || caseCount > 0
        ? 'attention'
        : 'blocked',
      retentionPresent && backupPresent
        ? 'Aufbewahrungs- und Backup-Hinweise sind dokumentiert.'
        : reportOrExportsPresent
        ? 'Es gibt bereits Berichte oder Exporte, aber Aufbewahrung und Backup sind noch nicht vollständig beschrieben.'
        : 'Noch kein dokumentierter Umgang mit Aufbewahrung oder Backups.',
      reportOrExportsPresent
        ? `Bericht/Exporte vorhanden. Snapshot-Funktion ist verfügbar${state.pilotToolkit?.lastExportedAt ? ', Pilot-Paket wurde bereits exportiert' : ''}.`
        : 'Die App kann Arbeitsstände als Snapshot sichern. Für den realen Einsatz sollte der Umgang damit ausdrücklich beschrieben werden.',
      !(retentionPresent && backupPresent)
        ? 'Kurz festlegen, wie lange Pilotmaterial aufbewahrt wird und wie Snapshots/Exporte gesichert werden.'
        : undefined,
    ),
    buildItem(
      'deployment',
      'Deployment-Ziel und Verantwortlichkeiten',
      deploymentSet && deploymentNotePresent && incidentContactPresent
        ? 'ready'
        : deploymentSet || deploymentNotePresent
        ? 'attention'
        : 'blocked',
      deploymentSet
        ? `Betriebsziel: ${deploymentLabel(state.security?.deploymentTarget)}.`
        : 'Noch kein Ziel für den Betriebsmodus festgelegt.',
      `Deployment-Ziel: ${deploymentLabel(state.security?.deploymentTarget)} · Kontakt: ${state.security?.incidentContact?.trim() || 'noch offen'}.`,
      !(deploymentSet && deploymentNotePresent && incidentContactPresent)
        ? 'Deployment-Ziel, Betriebsnotiz und Ansprechperson ergänzen.'
        : undefined,
    ),
    buildItem(
      'secrets',
      'API-Zugänge und Geheimnisse',
      authConfigured && (!settings.ai.api.endpointUrl.trim() || settings.ai.api.apiKey.trim())
        ? 'ready'
        : settings.ai.api.endpointUrl.trim()
        ? 'attention'
        : 'ready',
      settings.ai.api.endpointUrl.trim()
        ? authConfigured
          ? 'Ein API-Endpunkt ist vorhanden und die Authentisierung ist nicht offen gelassen.'
          : 'Ein API-Endpunkt ist vorhanden, aber ohne klaren Auth-Modus.'
        : 'Es ist kein direkter API-Endpunkt aktiviert.',
      settings.ai.api.endpointUrl.trim()
        ? `Endpoint: ${settings.ai.api.endpointUrl.trim()} · Auth: ${settings.ai.api.authMode}${settings.ai.api.apiKey.trim() ? ' · API-Schlüssel lokal hinterlegt' : ' · API-Schlüssel noch leer'}.`
        : 'Ohne direkten Endpoint bleibt der KI-Weg auf manuelles Copy/Paste oder lokale Nutzung begrenzt.',
      settings.ai.api.endpointUrl.trim() && (!authConfigured || !settings.ai.api.apiKey.trim())
        ? 'API-Zugriff nur mit bewusstem Auth-Modus und sauber verwaltetem Schlüssel betreiben.'
        : undefined,
    ),
    buildItem(
      'exports',
      'Audit, Exporte und letzte Prüfung',
      reviewPresent && collaborationEntries > 0
        ? 'ready'
        : reviewPresent || collaborationEntries > 0
        ? 'attention'
        : 'blocked',
      reviewPresent
        ? `Sicherheitsprofil wurde ${formatReviewLabel(state) ?? 'bereits geprüft'}.`
        : 'Es gibt noch keinen dokumentierten Sicherheits-Review im Arbeitsstand.',
      `Audit-Einträge: ${collaborationEntries} · Connector-Exporte: ${state.connectorToolkit?.history?.length ?? 0} · Rückmeldungen: ${state.connectorToolkit?.receipts?.length ?? 0}.`,
      !reviewPresent
        ? 'Sicherheitsprofil einmal bewusst merken, damit Datenschutz- und Deployment-Entscheidungen nachvollziehbar bleiben.'
        : undefined,
    ),
  ];

  const score = Math.round(items.reduce((sum, item) => sum + statusWeight(item.status), 0) / Math.max(items.length, 1));
  const level: SecurityReadinessLevel = items.some(item => item.status === 'blocked')
    ? 'risk'
    : items.some(item => item.status === 'attention')
    ? 'review'
    : 'controlled';
  const levelLabelText = levelLabel(level);

  const stable = uniqueStrings([
    activeExternalPaths.length === 0 ? 'Der aktuelle Stand kann vollständig lokal betrieben werden.' : undefined,
    reviewPresent ? `Sicherheitsprofil ist ${formatReviewLabel(state)}.` : undefined,
    retentionPresent && backupPresent ? 'Aufbewahrung und Backup sind beschrieben.' : undefined,
    deploymentSet ? `Betriebsziel ist auf ${deploymentLabel(state.security?.deploymentTarget)} festgelegt.` : undefined,
  ]);
  const caution = uniqueStrings([
    optionalExternalPaths.length > 0 ? `Manuelle Außenwege bleiben möglich: ${optionalExternalPaths.join(' · ')}.` : undefined,
    hasSensitiveSignals ? 'Im Material liegen sensible Marker vor und sollten bei Exporten bewusst mitgedacht werden.' : undefined,
    settings.ai.api.endpointUrl.trim() && !settings.ai.api.apiKey.trim() ? 'API-Endpunkt ist vorbereitet, aber ohne vollständig hinterlegten Schlüssel.' : undefined,
  ]);
  const blocked = uniqueStrings([
    activeExternalPaths.length > 0 && !externalApproved ? 'Externe Verarbeitung ist konfiguriert, aber noch nicht bewusst freigegeben.' : undefined,
    hasSensitiveSignals && !classificationSet ? 'Für sensibles Material fehlt noch eine Datenklassifikation.' : undefined,
    !deploymentSet ? 'Das Ziel für Deployment oder Pilotbetrieb ist noch nicht festgelegt.' : undefined,
  ]);

  const headline =
    level === 'controlled'
      ? 'Sicherheits-, Datenschutz- und Deployment-Rahmen wirken für den aktuellen Stand kontrolliert.'
      : level === 'review'
      ? 'Der Rahmen ist grundsätzlich tragfähig, braucht vor Pilot oder Ausrollen aber noch kurze Prüfung.'
      : 'Vor Einsatz oder Weitergabe sollten Datenschutz-, Sicherheits- und Deployment-Fragen noch sichtbarer gefasst werden.';

  const summary =
    level === 'controlled'
      ? 'Datenumgang, Betriebsziel und Wiederherstellung sind ausreichend beschrieben und passen zur aktuellen Analysebasis.'
      : level === 'review'
      ? 'Der Stand ist nutzbar, aber einzelne Punkte wie Klassifikation, Aufbewahrung oder externe Wege sollten noch bewusst bestätigt werden.'
      : 'Es fehlen noch zentrale Festlegungen zu sensiblem Material, externen Wegen oder dem geplanten Betriebsmodus.';

  const profile = {
    schemaVersion: 'pm-security-profile-v1',
    exportedAt: new Date().toISOString(),
    appVersion: APP_VERSION_LABEL,
    process: {
      title: version?.titleSnapshot ?? 'Unbenannter Prozess',
      versionLabel: version?.versionLabel ?? version?.id ?? 'ohne Versionslabel',
      cases: caseCount,
      steps: stepCount,
    },
    security: {
      level,
      levelLabel: levelLabelText,
      score,
      dataClassification: state.security?.dataClassification ?? null,
      deploymentTarget: state.security?.deploymentTarget ?? null,
      allowExternalProcessing: externalApproved,
      reviewedBy: state.security?.reviewedBy ?? null,
      reviewedAt: state.security?.reviewedAt ?? null,
      incidentContact: state.security?.incidentContact ?? null,
      privacyNote: state.security?.privacyNote ?? null,
      retentionNote: state.security?.retentionNote ?? null,
      backupNote: state.security?.backupNote ?? null,
      deploymentNote: state.security?.deploymentNote ?? null,
    },
    signals,
    externalPaths: {
      active: activeExternalPaths,
      optional: optionalExternalPaths,
    },
    items: items.map(item => ({
      key: item.key,
      label: item.label,
      status: item.status,
      summary: item.summary,
      detail: item.detail,
      action: item.action ?? null,
    })),
  } satisfies Record<string, unknown>;

  const briefing = [
    `Sicherheits- und Deployment-Kurzprofil · ${version?.titleSnapshot ?? 'Unbenannter Prozess'}`,
    `App-Stand: ${APP_VERSION_LABEL}`,
    `Gesamtbild: ${headline}`,
    `Score: ${score}/100 · ${levelLabelText}`,
    '',
    `Klassifikation: ${classificationLabel(state.security?.dataClassification)}`,
    `Deployment-Ziel: ${deploymentLabel(state.security?.deploymentTarget)}`,
    `Externe aktive Wege: ${activeExternalPaths.length ? activeExternalPaths.join(' · ') : 'keine'}`,
    `Externe optionale Wege: ${optionalExternalPaths.length ? optionalExternalPaths.join(' · ') : 'keine'}`,
    `Sensible Marker: ${signals.sensitiveMarkerCount} (E-Mail ${signals.emailCount}, Telefon ${signals.phoneCount}, Kennzeichen ${signals.identifierCount})`,
    '',
    ...items.map(item => `- ${item.label}: ${item.summary}${item.action ? ` · Nächster Schritt: ${item.action}` : ''}`),
  ].join('\n');

  return {
    level,
    levelLabel: levelLabelText,
    score,
    headline,
    summary,
    items,
    stable,
    caution,
    blocked,
    externalPaths: {
      active: activeExternalPaths,
      optional: optionalExternalPaths,
    },
    signals,
    latestReviewLabel: formatReviewLabel(state),
    payloads: {
      profile,
      briefing,
    },
  };
}
