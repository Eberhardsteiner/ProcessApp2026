import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';

const rootDir = process.cwd();
const reportsDir = path.join(rootDir, 'reports');
mkdirSync(reportsDir, { recursive: true });

const previousJsonPath = path.join(reportsDir, 'quality-report.json');
const previousReport = existsSync(previousJsonPath)
  ? JSON.parse(readFileSync(previousJsonPath, 'utf-8'))
  : null;

function runCommand(label, command, args) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    encoding: 'utf-8',
    shell: process.platform === 'win32',
  });

  return {
    label,
    passed: result.status === 0,
    score: result.status === 0 ? 100 : 0,
    summary: result.status === 0 ? `${label} erfolgreich.` : `${label} fehlgeschlagen.`,
    output: [result.stdout, result.stderr].filter(Boolean).join('\n').trim(),
  };
}

const typecheck = runCommand('Typecheck', 'npm', ['run', 'typecheck']);
const appBuild = runCommand('Produktionsbuild', 'npm', ['run', 'build']);

const tempDir = await mkdtemp(path.join(tmpdir(), 'pm-quality-report-'));
const outDir = path.join(tempDir, 'dist');
const entry = path.resolve(rootDir, 'src/ui/assistedMiningV2/qualityReportLab.ts');

let qualityReport;
try {
  await build({
    root: rootDir,
    logLevel: 'silent',
    build: {
      ssr: entry,
      outDir,
      emptyOutDir: true,
      minify: false,
      rollupOptions: {
        output: {
          entryFileNames: 'pm-quality-report.mjs',
        },
      },
    },
  });

  const mod = await import(pathToFileURL(path.join(outDir, 'pm-quality-report.mjs')).href);
  qualityReport = mod.runQualityReportSuite();
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

const technical = {
  overallScore: Math.round((typecheck.score + appBuild.score) / 2),
  status: !typecheck.passed || !appBuild.passed ? 'fail' : 'pass',
  checks: [typecheck, appBuild],
};

const sections = [
  {
    key: 'technical',
    label: 'Technische Funktionsfähigkeit',
    score: technical.overallScore,
    status: technical.status,
    summary: `${technical.checks.filter(item => item.passed).length}/${technical.checks.length} Kernchecks erfolgreich.`,
  },
  ...qualityReport.sections,
];

const overallScore = Math.round(
  technical.overallScore * 0.18 +
  qualityReport.sections.find(item => item.key === 'documents').score * 0.32 +
  qualityReport.sections.find(item => item.key === 'benchmark').score * 0.22 +
  qualityReport.sections.find(item => item.key === 'release').score * 0.28
);

const status = sections.some(item => item.status === 'fail')
  ? 'fail'
  : sections.some(item => item.status === 'attention')
    ? 'attention'
    : 'pass';

const regression = previousReport
  ? {
      previousScore: previousReport.overallScore,
      delta: overallScore - previousReport.overallScore,
      direction:
        overallScore > previousReport.overallScore ? 'better' : overallScore < previousReport.overallScore ? 'worse' : 'same',
    }
  : {
      direction: 'new',
    };

const recommendation = qualityReport.recommendations[0] ?? 'Keine priorisierte Empfehlung vorhanden.';

const finalReport = {
  version: JSON.parse(readFileSync(path.join(rootDir, 'package.json'), 'utf-8')).version,
  engineVersion: qualityReport.engineVersion,
  computedAt: new Date().toISOString(),
  overallScore,
  status,
  headline:
    status === 'fail'
      ? 'Der Qualitätsreport zeigt noch kritische Punkte.'
      : status === 'attention'
        ? 'Der Qualitätsreport ist insgesamt tragfähig, aber noch nicht vollständig stabil.'
        : 'Der Qualitätsreport wirkt stabil und belastbar.',
  summary: `${sections.length} Bewertungsblöcke · Gesamt ${overallScore}/100 · ${sections.filter(item => item.status === 'pass').length} stabil · ${sections.filter(item => item.status === 'attention').length} beobachten · ${sections.filter(item => item.status === 'fail').length} kritisch.`,
  sections,
  technical,
  regression,
  recommendation,
  qualityReport,
};

function formatStatus(status) {
  return status === 'pass' ? 'stabil' : status === 'attention' ? 'beobachten' : 'kritisch';
}

const markdownLines = [
  `# Qualitätsreport v${finalReport.version}`,
  '',
  `- Stand: ${finalReport.computedAt}`,
  `- Engine: ${finalReport.engineVersion}`,
  `- Gesamtscore: **${finalReport.overallScore}/100**`,
  `- Status: **${formatStatus(finalReport.status)}**`,
  '',
  finalReport.headline,
  '',
  finalReport.summary,
  '',
  '## Bewertungsblöcke',
  '',
  ...finalReport.sections.map(section => `- **${section.label}**: ${section.score}/100 (${formatStatus(section.status)}) · ${section.summary}`),
  '',
  '## Technische Kernchecks',
  '',
  ...technical.checks.map(check => `- **${check.label}**: ${check.passed ? 'bestanden' : 'fehlgeschlagen'} · ${check.summary}`),
  '',
  '## Fünf Referenzdokumente',
  '',
  ...qualityReport.documentSuite.results.flatMap(result => [
    `### ${result.fileName}`,
    `- Score: **${result.score}/100** (${formatStatus(result.status)})`,
    `- Gütegrad: ${result.qualityLevel}`,
    `- Fokus: ${result.intendedChecks.join(', ')}`,
    `- Beobachtet: ${result.observed.stepCount} Schritte · ${result.observed.signalCount} Signale · ${result.observed.roleCount} Rollen · ${result.observed.systemCount} Systeme · ${result.observed.evidencePct}% Belegstellen`,
    result.headline,
    result.summary,
    result.strengths.length ? `- Stärken: ${result.strengths.join(' | ')}` : '- Stärken: -',
    result.issues.length ? `- Auffälligkeiten: ${result.issues.join(' | ')}` : '- Auffälligkeiten: -',
    `- Empfehlung: ${result.recommendation}`,
    '',
  ]),
  '## Benchmark und Produktreife',
  '',
  `- Referenzbibliothek: ${qualityReport.benchmarkSuite.overallScore}/100 · ${qualityReport.benchmarkSuite.summary}`,
  `- Produktreife: ${qualityReport.releaseSuite.overallScore}/100 · ${qualityReport.releaseSuite.summary}`,
  '',
  '## Regression',
  '',
  previousReport
    ? `Voriger Score: ${regression.previousScore}/100 · Delta: ${regression.delta >= 0 ? '+' : ''}${regression.delta} · Richtung: ${regression.direction}`
    : 'Kein vorheriger Qualitätsreport vorhanden.',
  '',
  '## Priorisierte Empfehlung',
  '',
  recommendation,
  '',
];

const csvLines = [
  'scope,id,label,status,score,summary',
  ...finalReport.sections.map(section => `section,${section.key},"${section.label}",${section.status},${section.score},"${section.summary.replace(/"/g, '""')}"`),
  ...qualityReport.documentSuite.results.map(result => `document,${result.id},"${result.fileName}",${result.status},${result.score},"${result.summary.replace(/"/g, '""')}"`),
];

const jsonPath = path.join(reportsDir, 'quality-report.json');
const mdPath = path.join(reportsDir, 'quality-report.md');
const csvPath = path.join(reportsDir, 'quality-report.csv');
writeFileSync(jsonPath, JSON.stringify(finalReport, null, 2), 'utf-8');
writeFileSync(mdPath, markdownLines.join('\n'), 'utf-8');
writeFileSync(csvPath, csvLines.join('\n'), 'utf-8');

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
copyFileSync(jsonPath, path.join(reportsDir, `quality-report-${timestamp}.json`));
copyFileSync(mdPath, path.join(reportsDir, `quality-report-${timestamp}.md`));
copyFileSync(csvPath, path.join(reportsDir, `quality-report-${timestamp}.csv`));

console.log([
  `PM Quality Report · ${finalReport.engineVersion}`,
  finalReport.headline,
  finalReport.summary,
  ...finalReport.sections.map(section => `- ${section.label}: ${section.score}/100 (${formatStatus(section.status)}) · ${section.summary}`),
  `Report geschrieben nach: ${jsonPath}`,
  `Markdown geschrieben nach: ${mdPath}`,
  `CSV geschrieben nach: ${csvPath}`,
].join('\n'));

if (!typecheck.passed || !appBuild.passed) {
  process.exitCode = 1;
}
