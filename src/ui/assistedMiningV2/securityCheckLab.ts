import type { AppSettings } from '../../settings/appSettings';
import { DEFAULT_SETTINGS } from '../../settings/appSettings';
import type { ProcessMiningAssistedV2State } from '../../domain/process';
import { createEmptyV2State } from './storage';
import { LOCAL_MINING_ENGINE_VERSION } from './documentDerivation';
import { evaluateSecurityReadiness } from './securityReadiness';

export interface SecurityCheckResult {
  key: string;
  label: string;
  score: number;
  status: 'pass' | 'attention' | 'fail';
  summary: string;
}

export interface SecurityCheckSuiteResult {
  engineVersion: string;
  computedAt: string;
  headline: string;
  summary: string;
  averageScore: number;
  passedCount: number;
  attentionCount: number;
  failedCount: number;
  results: SecurityCheckResult[];
}

function toStatus(score: number): SecurityCheckResult['status'] {
  if (score >= 85) return 'pass';
  if (score >= 65) return 'attention';
  return 'fail';
}

function withCase(state: ProcessMiningAssistedV2State, narrative: string): ProcessMiningAssistedV2State {
  const now = new Date().toISOString();
  const caseId = crypto.randomUUID();
  return {
    ...state,
    cases: [{
      id: caseId,
      name: 'Sicherheitsfall',
      narrative,
      createdAt: now,
      updatedAt: now,
    }],
    observations: [{
      id: crypto.randomUUID(),
      sourceCaseId: caseId,
      label: 'Fall prüfen',
      kind: 'step',
      sequenceIndex: 1,
      timestampQuality: 'missing',
      createdAt: now,
    }],
    updatedAt: now,
  };
}

export function runSecurityCheckSuite(): SecurityCheckSuiteResult {
  const localSettings: AppSettings = { ...DEFAULT_SETTINGS };
  const reviewedState = withCase(createEmptyV2State(), 'Kundenfall mit Auftragsnummer und Seriennummer, intern geprüft und ohne externe Dienste bearbeitet.');
  reviewedState.security = {
    reviewedBy: 'PMO',
    reviewedAt: new Date().toISOString(),
    dataClassification: 'confidential',
    deploymentTarget: 'local-browser',
    incidentContact: 'IT-Service',
    privacyNote: 'Nutzung nur intern und ohne externe Übertragung.',
    retentionNote: 'Pilotmaterial nach Review löschen.',
    backupNote: 'Snapshots nur verschlüsselt ablegen.',
    deploymentNote: 'Nur lokaler Browserbetrieb im internen Netz.',
  };
  reviewedState.collaboration = { comments: [], auditTrail: [{
    id: crypto.randomUUID(),
    action: 'security-profile-reviewed',
    targetType: 'release',
    targetLabel: 'Sicherheitsprofil',
    detail: 'Lokaler Betrieb geprüft.',
    createdAt: new Date().toISOString(),
  }] };
  const reviewed = evaluateSecurityReadiness({ state: reviewedState, settings: localSettings });

  const riskySettings: AppSettings = {
    ...DEFAULT_SETTINGS,
    dataHandlingMode: 'external',
    ai: {
      mode: 'api',
      api: {
        endpointUrl: 'https://api.example.invalid/v1/process',
        authMode: 'none',
        apiKey: '',
        timeoutMs: 60000,
      },
    },
    translation: {
      providerId: 'browser',
      targetLanguage: 'en',
    },
  };
  const riskyState = withCase(createEmptyV2State(), 'Kundin Julia meldet sich unter julia@example.com wegen Ticket 4815 und Seriennummer FM-240.');
  const risky = evaluateSecurityReadiness({ state: riskyState, settings: riskySettings });

  const pilotSettings: AppSettings = {
    ...DEFAULT_SETTINGS,
    ai: {
      mode: 'api',
      api: {
        endpointUrl: 'https://proxy.internal.example/v1/process',
        authMode: 'bearer',
        apiKey: 'demo-key',
        timeoutMs: 60000,
      },
    },
  };
  const pilotState = withCase(createEmptyV2State(), 'Kundenfall mit Telefonnummer +49 30 1234567 und Auftragsnummer 12345.');
  pilotState.security = {
    reviewedBy: 'Pilotleitung',
    reviewedAt: new Date().toISOString(),
    dataClassification: 'confidential',
    deploymentTarget: 'managed-pilot',
    allowExternalProcessing: true,
    incidentContact: 'Pilot-Team',
    privacyNote: 'Externe KI nur über internen Proxy.',
    deploymentNote: 'Betreuter Pilotbetrieb im internen Netzwerk.',
  };
  const pilot = evaluateSecurityReadiness({ state: pilotState, settings: pilotSettings });

  const reviewedScore = reviewed.level !== 'risk' && reviewed.score >= 85 ? 94 : 68;
  const riskyScore = risky.level === 'risk' && risky.items.some(item => item.status === 'blocked') ? 96 : 58;
  const pilotScore = pilot.level === 'review' && pilot.items.some(item => item.key === 'retention' && item.status !== 'ready') ? 91 : 63;

  const scenarios = [
    {
      key: 'local-reviewed',
      label: 'Lokaler Betrieb mit sichtbarer Prüfung',
      score: reviewedScore,
      summary: `${reviewed.levelLabel} · ${reviewed.summary}`,
    },
    {
      key: 'external-unreviewed',
      label: 'Externe Wege ohne Freigabe',
      score: riskyScore,
      summary: `Die Prüflogik erkennt den riskanten Zustand korrekt: ${risky.headline}`,
    },
    {
      key: 'managed-pilot',
      label: 'Pilotbetrieb mit Proxy und Restpunkten',
      score: pilotScore,
      summary: `Der Pilotbetrieb bleibt bewusst unter Beobachtung: ${pilot.summary}`,
    },
  ].map(item => ({
    ...item,
    status: toStatus(item.score),
  }));

  const averageScore = Math.round(scenarios.reduce((sum, item) => sum + item.score, 0) / scenarios.length);
  const passedCount = scenarios.filter(item => item.status === 'pass').length;
  const attentionCount = scenarios.filter(item => item.status === 'attention').length;
  const failedCount = scenarios.filter(item => item.status === 'fail').length;

  return {
    engineVersion: `${LOCAL_MINING_ENGINE_VERSION} · security`,
    computedAt: new Date().toISOString(),
    headline: averageScore >= 85 ? 'Sicherheits- und Deployment-Rahmen wirken stabil.' : averageScore >= 65 ? 'Sicherheitsrahmen ist brauchbar, braucht aber noch Review.' : 'Sicherheitsrahmen zeigt noch deutliche Lücken.',
    summary: `${scenarios.length} Szenarien geprüft · Durchschnitt ${averageScore}/100 · ${failedCount} kritisch.`,
    averageScore,
    passedCount,
    attentionCount,
    failedCount,
    results: scenarios,
  };
}
