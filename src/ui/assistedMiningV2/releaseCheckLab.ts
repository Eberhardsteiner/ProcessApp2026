import { runBenchmarkSuite } from './benchmarkLab';
import { runAcceptanceCheckSuite } from './acceptanceCheckLab';
import { runConnectorCheckSuite } from './connectorCheckLab';
import { runConnectorContractCheckSuite } from './connectorContractCheckLab';
import { runCollaborationCheckSuite } from './collaborationCheckLab';
import { runGovernanceCheckSuite } from './governanceCheckLab';
import { runHardeningCheckSuite } from './hardeningCheckLab';
import { LOCAL_MINING_ENGINE_VERSION } from './documentDerivation';
import { runIntegrationCheckSuite } from './integrationCheckLab';
import { runPilotCheckSuite } from './pilotCheckLab';
import { runSecurityCheckSuite } from './securityCheckLab';

export type ReleaseCheckStatus = 'pass' | 'attention' | 'fail';

export interface ReleaseCheckEntry {
  key: 'benchmark' | 'pilot' | 'acceptance' | 'integration' | 'connectors' | 'adapters' | 'governance' | 'hardening' | 'collaboration' | 'security';
  label: string;
  status: ReleaseCheckStatus;
  score: number;
  summary: string;
}

export interface ReleaseCheckSuiteResult {
  engineVersion: string;
  computedAt: string;
  status: ReleaseCheckStatus;
  overallScore: number;
  passedCount: number;
  attentionCount: number;
  failedCount: number;
  headline: string;
  summary: string;
  checks: ReleaseCheckEntry[];
}

function statusFromScore(score: number): ReleaseCheckStatus {
  if (score >= 85) return 'pass';
  if (score >= 65) return 'attention';
  return 'fail';
}

export function runReleaseCheckSuite(): ReleaseCheckSuiteResult {
  const benchmark = runBenchmarkSuite();
  const pilot = runPilotCheckSuite();
  const acceptance = runAcceptanceCheckSuite();
  const integration = runIntegrationCheckSuite();
  const connectors = runConnectorCheckSuite();
  const adapters = runConnectorContractCheckSuite();
  const governance = runGovernanceCheckSuite();
  const collaboration = runCollaborationCheckSuite();
  const hardening = runHardeningCheckSuite();
  const security = runSecurityCheckSuite();

  const checks: ReleaseCheckEntry[] = [
    {
      key: 'benchmark',
      label: 'Goldfälle und Regression',
      status: benchmark.failedCount > 0 ? 'fail' : benchmark.strictGate.pass ? 'pass' : 'attention',
      score: benchmark.overallScore,
      summary: `${benchmark.coverage.totalCases} Referenzfälle · ${benchmark.strictGate.pass ? 'strenger Check bestanden' : 'strenger Check offen'}`,
    },
    {
      key: 'hardening',
      label: 'Arbeitsstand-Härtung und Recovery',
      status: hardening.failedCount > 0 ? 'fail' : hardening.attentionCount > 0 ? 'attention' : 'pass',
      score: hardening.averageScore,
      summary: `${hardening.results.length} Szenarien geprüft · ${hardening.failedCount} kritisch · ${hardening.attentionCount} beobachten`,
    },
    {
      key: 'pilot',
      label: 'Pilotlauf und Berichtskette',
      status: pilot.failedCount > 0 ? 'fail' : pilot.attentionCount > 0 ? 'attention' : 'pass',
      score: Math.round(pilot.results.reduce((sum, item) => sum + item.score, 0) / Math.max(pilot.results.length, 1)),
      summary: `${pilot.results.length} Pakete geprüft · ${pilot.passedCount} stabil · ${pilot.attentionCount} beobachten`,
    },
    {
      key: 'acceptance',
      label: 'Formale Abnahme und Entscheidungsvorlage',
      status: acceptance.failedCount > 0 ? 'fail' : acceptance.attentionCount > 0 ? 'attention' : 'pass',
      score: acceptance.averageScore,
      summary: `${acceptance.results.length} Szenarien geprüft · ${acceptance.passedCount} stabil · ${acceptance.attentionCount} beobachten`,
    },
    {
      key: 'integration',
      label: 'Importpfade und Integrationsrahmen',
      status: integration.failedCount > 0 ? 'fail' : statusFromScore(Math.round(integration.results.reduce((sum, item) => sum + item.score, 0) / Math.max(integration.results.length, 1))),
      score: Math.round(integration.results.reduce((sum, item) => sum + item.score, 0) / Math.max(integration.results.length, 1)),
      summary: `${integration.results.length} Szenarien geprüft · ${integration.failedCount} kritisch`,
    },
    {
      key: 'connectors',
      label: 'Connector- und Exportpakete',
      status: connectors.failedCount > 0 ? 'fail' : statusFromScore(Math.round(connectors.results.reduce((sum, item) => sum + item.score, 0) / Math.max(connectors.results.length, 1))),
      score: Math.round(connectors.results.reduce((sum, item) => sum + item.score, 0) / Math.max(connectors.results.length, 1)),
      summary: `${connectors.results.length} Szenarien geprüft · ${connectors.failedCount} kritisch`,
    },
    {
      key: 'adapters',
      label: 'Integrationsverträge und Rückmeldungen',
      status: adapters.failedCount > 0 ? 'fail' : statusFromScore(Math.round(adapters.results.reduce((sum, item) => sum + item.score, 0) / Math.max(adapters.results.length, 1))),
      score: Math.round(adapters.results.reduce((sum, item) => sum + item.score, 0) / Math.max(adapters.results.length, 1)),
      summary: `${adapters.results.length} Szenarien geprüft · ${adapters.failedCount} kritisch`,
    },
    {
      key: 'governance',
      label: 'Freigabe-Assistenz und Governance-Auswertung',
      status: governance.failedCount > 0 ? 'fail' : governance.attentionCount > 0 ? 'attention' : 'pass',
      score: governance.averageScore,
      summary: `${governance.results.length} Szenarien geprüft · ${governance.failedCount} kritisch · ${governance.attentionCount} beobachten`,
    },
    {
      key: 'security',
      label: 'Sicherheit, Datenschutz und Deployment',
      status: security.failedCount > 0 ? 'fail' : security.attentionCount > 0 ? 'attention' : 'pass',
      score: security.averageScore,
      summary: `${security.results.length} Szenarien geprüft · ${security.failedCount} kritisch · ${security.attentionCount} beobachten`,
    },
    {
      key: 'collaboration',
      label: 'Zusammenarbeit und Auditspur',
      status: collaboration.failedCount > 0 ? 'fail' : collaboration.attentionCount > 0 ? 'attention' : 'pass',
      score: collaboration.averageScore,
      summary: `${collaboration.results.length} Szenarien geprüft · ${collaboration.failedCount} kritisch · ${collaboration.attentionCount} beobachten`,
    },
  ];

  const passedCount = checks.filter(item => item.status === 'pass').length;
  const attentionCount = checks.filter(item => item.status === 'attention').length;
  const failedCount = checks.filter(item => item.status === 'fail').length;
  const overallScore = Math.round(checks.reduce((sum, item) => sum + item.score, 0) / Math.max(checks.length, 1));
  const status: ReleaseCheckStatus = failedCount > 0 ? 'fail' : attentionCount > 0 ? 'attention' : 'pass';

  const headline =
    status === 'fail'
      ? 'Release-Check zeigt noch klare Lücken vor einem Pilot- oder Freigabestand.'
      : status === 'attention'
      ? 'Release-Check wirkt insgesamt tragfähig, hat aber noch sichtbare Nacharbeit.'
      : 'Release-Check wirkt stabil und gut vorbereitet.';

  const summary = `${checks.length} Kernchecks · Gesamt ${overallScore}/100 · ${passedCount} stabil · ${attentionCount} beobachten · ${failedCount} kritisch.`;

  return {
    engineVersion: `${LOCAL_MINING_ENGINE_VERSION} · release-check`,
    computedAt: new Date().toISOString(),
    status,
    overallScore,
    passedCount,
    attentionCount,
    failedCount,
    headline,
    summary,
    checks,
  };
}
