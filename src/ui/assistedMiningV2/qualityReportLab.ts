import { runBenchmarkSuite } from './benchmarkLab';
import { runQualityDocumentSuite } from './qualityDocumentLab';
import { runReleaseCheckSuite } from './releaseCheckLab';
import { LOCAL_MINING_ENGINE_VERSION } from './documentDerivation';

export type QualityReportStatus = 'pass' | 'attention' | 'fail';

export interface QualityReportSection {
  key: 'documents' | 'benchmark' | 'release';
  label: string;
  score: number;
  status: QualityReportStatus;
  summary: string;
}

export interface QualityRegressionSummary {
  previousScore?: number;
  delta?: number;
  direction: 'better' | 'same' | 'worse' | 'new';
}

export interface QualityReportResult {
  engineVersion: string;
  computedAt: string;
  overallScore: number;
  status: QualityReportStatus;
  headline: string;
  summary: string;
  sections: QualityReportSection[];
  recommendations: string[];
  documentSuite: ReturnType<typeof runQualityDocumentSuite>;
  benchmarkSuite: ReturnType<typeof runBenchmarkSuite>;
  releaseSuite: ReturnType<typeof runReleaseCheckSuite>;
}

function normalizeStatus(status: 'pass' | 'attention' | 'fail'): QualityReportStatus {
  return status;
}

export function runQualityReportSuite(): QualityReportResult {
  const documentSuite = runQualityDocumentSuite();
  const benchmarkSuite = runBenchmarkSuite();
  const releaseSuite = runReleaseCheckSuite();

  const sections: QualityReportSection[] = [
    {
      key: 'documents',
      label: 'Fünf Referenzdokumente',
      score: documentSuite.overallScore,
      status: normalizeStatus(documentSuite.status),
      summary: documentSuite.summary,
    },
    {
      key: 'benchmark',
      label: 'Referenzbibliothek und Regression',
      score: benchmarkSuite.overallScore,
      status: benchmarkSuite.failedCount > 0 ? 'fail' : benchmarkSuite.strictGate.pass ? 'pass' : 'attention',
      summary: `${benchmarkSuite.coverage.totalCases} Fälle · ${benchmarkSuite.strictGate.pass ? 'strenger Check bestanden' : 'strenger Check offen'}`,
    },
    {
      key: 'release',
      label: 'Produktreife und Übergabekette',
      score: releaseSuite.overallScore,
      status: normalizeStatus(releaseSuite.status),
      summary: releaseSuite.summary,
    },
  ];

  const overallScore = Math.round(
    sections.find(item => item.key === 'documents')!.score * 0.42 +
    sections.find(item => item.key === 'benchmark')!.score * 0.28 +
    sections.find(item => item.key === 'release')!.score * 0.30,
  );

  const status: QualityReportStatus = sections.some(item => item.status === 'fail')
    ? 'fail'
    : sections.some(item => item.status === 'attention')
      ? 'attention'
      : 'pass';

  const recommendations: string[] = [];
  const weakestDocument = documentSuite.weakestDocuments[0];
  if (weakestDocument) {
    recommendations.push(`Schwächstes Referenzdokument aktuell: ${weakestDocument.title} (${weakestDocument.score}/100).`);
  }

  const weakestBenchmarkDomain = benchmarkSuite.domainScores.slice().sort((a, b) => a.score - b.score)[0];
  if (weakestBenchmarkDomain) {
    recommendations.push(`Schwächstes gemessenes Fachfeld: ${weakestBenchmarkDomain.label} (${weakestBenchmarkDomain.score}/100).`);
  }

  if (releaseSuite.attentionCount > 0 || releaseSuite.failedCount > 0) {
    const openRelease = releaseSuite.checks.filter(item => item.status !== 'pass').map(item => item.label);
    if (openRelease.length > 0) {
      recommendations.push(`Produktreife weiter stabilisieren bei: ${openRelease.join(', ')}.`);
    }
  }

  const headline =
    status === 'fail'
      ? 'Der Qualitätsreport zeigt noch kritische Punkte vor einer belastbaren Bewertung.'
      : status === 'attention'
        ? 'Der Qualitätsreport ist insgesamt tragfähig, weist aber noch sichtbare Nachschärfungsfelder aus.'
        : 'Der Qualitätsreport wirkt stabil und gibt eine belastbare Gesamtsicht.';

  const summary = `${sections.length} Bewertungsblöcke · Gesamt ${overallScore}/100 · ${sections.filter(item => item.status === 'pass').length} stabil · ${sections.filter(item => item.status === 'attention').length} beobachten · ${sections.filter(item => item.status === 'fail').length} kritisch.`;

  return {
    engineVersion: `${LOCAL_MINING_ENGINE_VERSION} · quality-report`,
    computedAt: new Date().toISOString(),
    overallScore,
    status,
    headline,
    summary,
    sections,
    recommendations,
    documentSuite,
    benchmarkSuite,
    releaseSuite,
  };
}
