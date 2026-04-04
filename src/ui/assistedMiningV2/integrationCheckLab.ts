import { DEFAULT_SETTINGS } from '../../settings/appSettings';
import { createEmptyV2State } from './storage';
import { buildSampleScenario } from './sampleCases';
import { evaluateImportHealth } from './importHealth';
import { evaluateIntegrationReadiness } from './integrationReadiness';
import { LOCAL_MINING_ENGINE_VERSION } from './documentDerivation';

function makeStateFromSample(key: Parameters<typeof buildSampleScenario>[0]) {
  const sample = buildSampleScenario(key);
  return {
    ...createEmptyV2State(),
    cases: sample.cases,
    observations: sample.observations,
    qualitySummary: undefined,
    lastDerivationSummary: sample.summary,
    updatedAt: new Date().toISOString(),
  };
}

export function runIntegrationCheckSuite() {
  const scenarios = [
    { key: 'complaints' as const, label: 'Reklamationen' },
    { key: 'service' as const, label: 'Service' },
    { key: 'mixed' as const, label: 'Mischdokumente' },
  ];

  const results = scenarios.map(item => {
    const state = makeStateFromSample(item.key);
    const importHealth = evaluateImportHealth(state);
    const readiness = evaluateIntegrationReadiness({
      state,
      settings: DEFAULT_SETTINGS,
    });

    const blockedCount = readiness.items.filter(entry => entry.status === 'blocked').length;
    const score = Math.max(0, 100 - blockedCount * 10 - (importHealth.level === 'weak' ? 25 : importHealth.level === 'attention' ? 10 : 0));

    return {
      label: item.label,
      importHealth: importHealth.level,
      readyItems: readiness.items.filter(entry => entry.status === 'ready').length,
      blockedItems: blockedCount,
      score,
    };
  });

  const averageScore = Math.round(results.reduce((sum, item) => sum + item.score, 0) / results.length);
  const failedCount = results.filter(item => item.score < 60).length;

  return {
    engineVersion: LOCAL_MINING_ENGINE_VERSION,
    headline: averageScore >= 85 ? 'Integrations- und Betriebscheck wirkt stabil.' : 'Integrations- und Betriebscheck braucht noch Aufmerksamkeit.',
    summary: `${results.length} Szenarien geprüft · Durchschnitt ${averageScore}/100 · ${failedCount} kritisch`,
    results,
    failedCount,
  };
}
