import { build } from 'vite';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const rootDir = process.cwd();
const tempDir = await mkdtemp(path.join(tmpdir(), 'pm-phase8-'));
const outDir = path.join(tempDir, 'dist');
const entry = path.resolve(rootDir, 'src/ui/assistedMiningV2/benchmarkLab.ts');
const exportDir = path.resolve(rootDir, 'artifacts', 'phase8-reference-results');

function safeName(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9äöüß_-]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

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
          entryFileNames: 'pm-phase8.mjs',
        },
      },
    },
  });

  const mod = await import(pathToFileURL(path.join(outDir, 'pm-phase8.mjs')).href);
  const suite = mod.runBenchmarkSuite();

  await mkdir(exportDir, { recursive: true });

  const meta = {
    exportedAt: new Date().toISOString(),
    engineVersion: suite.engineVersion,
    overallScore: suite.overallScore,
    status: suite.status,
    strictGate: suite.strictGate,
    coverage: suite.coverage,
    recommendations: suite.recommendations,
  };
  await writeFile(path.join(exportDir, 'phase8-suite-summary.json'), JSON.stringify(meta, null, 2), 'utf8');

  for (const result of suite.results) {
    const payload = {
      exportedAt: new Date().toISOString(),
      caseId: result.id,
      label: result.label,
      domain: result.domain,
      status: result.status,
      score: result.score,
      analysisMode: result.analysisMode,
      confidence: result.confidence,
      warnings: result.warnings,
      steps: result.steps,
      signals: result.signals,
      roles: result.roles,
      systems: result.systems,
      evidencePct: result.evidencePct,
      dimensionScores: result.dimensionScores,
      observedStepLabels: result.observedStepLabels,
      headline: result.headline,
      detail: result.detail,
    };
    await writeFile(
      path.join(exportDir, `${safeName(result.label)}.json`),
      JSON.stringify(payload, null, 2),
      'utf8',
    );
  }

  const lines = [
    `Phase-8 Referenztest · ${suite.engineVersion}`,
    `Gesamtstatus: ${suite.status} (${suite.overallScore}/100)`,
    `Strict Gate: ${suite.strictGate.pass ? 'PASS' : 'FAIL'}`,
    `Exports: ${suite.results.length + 1} Dateien in ${path.relative(rootDir, exportDir)}`,
  ];
  console.log(lines.join('\n'));

  if (!suite.strictGate.pass) {
    process.exitCode = 1;
  }
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
