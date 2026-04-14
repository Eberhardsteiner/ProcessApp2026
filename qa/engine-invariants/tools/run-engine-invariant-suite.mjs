import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildMutationVariants } from './build-mutations.mjs';
import { runEngineInvariantCheck } from './check-engine-invariants.mjs';
import { readStructuredSourceText } from './source-reader.mjs';
import { createEngineInvariantExporter } from './run-engine-invariant-export.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const qaRoot = path.resolve(scriptDir, '..');
const repoRoot = path.resolve(qaRoot, '..', '..');
const manifestPath = path.join(qaRoot, 'fixtures', 'manifest.json');
const expectationsDir = path.join(qaRoot, 'expectations');
const exportsDir = path.join(qaRoot, 'exports');
const mutationsDir = path.join(qaRoot, 'mutations');

function sanitizeFilePart(value) {
  return String(value ?? '')
    .replace(/[^a-z0-9._-]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

function formatOutcomeLabel(item) {
  return item.mutationId ? `${item.fixtureId} :: ${item.mutationId}` : item.fixtureId;
}

async function runFixtureCheck(params) {
  const sourceText = await readStructuredSourceText(params.sourcePath);
  await params.exporter.exportOne({
    sourceText,
    fileName: path.basename(params.sourcePath),
    sourceType: params.sourceType,
    exportPath: params.exportPath,
    fixtureFamily: params.fixtureFamily,
  });

  return runEngineInvariantCheck({
    expectationPath: params.expectationPath,
    sourcePath: params.sourcePath,
    exportPath: params.exportPath,
  });
}

async function loadManifest() {
  return JSON.parse(await readFile(manifestPath, 'utf8'));
}

export async function runEngineInvariantSuite() {
  const manifest = await loadManifest();
  const exporter = await createEngineInvariantExporter();
  const summary = {
    runAt: new Date().toISOString(),
    appVersion: undefined,
    totalChecks: 0,
    passedChecks: 0,
    failedChecks: 0,
    results: [],
  };

  try {
    await mkdir(exportsDir, { recursive: true });
    await mkdir(mutationsDir, { recursive: true });

    for (const fixture of manifest.fixtures ?? []) {
      const fixturePath = path.resolve(repoRoot, fixture.sourcePath);
      const expectationPath = path.join(expectationsDir, `${fixture.fixtureFamily}.json`);
      const exportBase = sanitizeFilePart(fixture.id);
      const exportPath = path.join(exportsDir, `${exportBase}.json`);

      try {
        const check = await runFixtureCheck({
          exporter,
          sourcePath: fixturePath,
          sourceType: fixture.runtimeSourceType || 'docx',
          expectationPath,
          exportPath,
          fixtureFamily: fixture.fixtureFamily,
        });
        const result = {
          fixtureId: fixture.id,
          mutationId: null,
          fixtureFamily: fixture.fixtureFamily,
          sourcePath: path.relative(repoRoot, fixturePath).replace(/\\/g, '/'),
          exportPath: path.relative(repoRoot, exportPath).replace(/\\/g, '/'),
          passed: check.passed,
          errors: check.errors,
          explicitStepCount: check.sourceModel.explicitStepCount,
        };
        summary.results.push(result);
        summary.totalChecks += 1;
        summary.passedChecks += check.passed ? 1 : 0;
        summary.failedChecks += check.passed ? 0 : 1;
        console.log(`${check.passed ? 'PASS' : 'FAIL'} ${formatOutcomeLabel(result)}`);
        if (!check.passed) {
          check.errors.forEach(error => console.log(`- ${error}`));
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const result = {
          fixtureId: fixture.id,
          mutationId: null,
          fixtureFamily: fixture.fixtureFamily,
          sourcePath: path.relative(repoRoot, fixturePath).replace(/\\/g, '/'),
          exportPath: path.relative(repoRoot, exportPath).replace(/\\/g, '/'),
          passed: false,
          errors: [message],
          explicitStepCount: 0,
        };
        summary.results.push(result);
        summary.totalChecks += 1;
        summary.failedChecks += 1;
        console.log(`FAIL ${formatOutcomeLabel(result)}`);
        console.log(`- ${message}`);
      }

      if (!fixture.includeMutations) continue;

      const fixtureMutationDir = path.join(mutationsDir, sanitizeFilePart(fixture.id));
      const mutations = await buildMutationVariants({
        sourcePath: fixturePath,
        outputDir: fixtureMutationDir,
      });

      for (const mutation of mutations) {
        const mutationExportPath = path.join(exportsDir, `${exportBase}--${sanitizeFilePart(mutation.id)}.json`);
        try {
          const check = await runFixtureCheck({
            exporter,
            sourcePath: mutation.sourcePath,
            sourceType: fixture.runtimeSourceType || 'docx',
            expectationPath,
            exportPath: mutationExportPath,
            fixtureFamily: fixture.fixtureFamily,
          });
          const result = {
            fixtureId: fixture.id,
            mutationId: mutation.id,
            fixtureFamily: fixture.fixtureFamily,
            sourcePath: path.relative(repoRoot, mutation.sourcePath).replace(/\\/g, '/'),
            exportPath: path.relative(repoRoot, mutationExportPath).replace(/\\/g, '/'),
            passed: check.passed,
            errors: check.errors,
            explicitStepCount: check.sourceModel.explicitStepCount,
          };
          summary.results.push(result);
          summary.totalChecks += 1;
          summary.passedChecks += check.passed ? 1 : 0;
          summary.failedChecks += check.passed ? 0 : 1;
          console.log(`${check.passed ? 'PASS' : 'FAIL'} ${formatOutcomeLabel(result)}`);
          if (!check.passed) {
            check.errors.forEach(error => console.log(`- ${error}`));
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const result = {
            fixtureId: fixture.id,
            mutationId: mutation.id,
            fixtureFamily: fixture.fixtureFamily,
            sourcePath: path.relative(repoRoot, mutation.sourcePath).replace(/\\/g, '/'),
            exportPath: path.relative(repoRoot, mutationExportPath).replace(/\\/g, '/'),
            passed: false,
            errors: [message],
            explicitStepCount: 0,
          };
          summary.results.push(result);
          summary.totalChecks += 1;
          summary.failedChecks += 1;
          console.log(`FAIL ${formatOutcomeLabel(result)}`);
          console.log(`- ${message}`);
        }
      }
    }
  } finally {
    await exporter.dispose();
  }

  const firstExportPath = summary.results.find(item => item.passed)?.exportPath;
  if (firstExportPath) {
    const firstExport = JSON.parse(await readFile(path.resolve(repoRoot, firstExportPath), 'utf8'));
    summary.appVersion = firstExport.appVersion;
  }

  const summaryPath = path.join(exportsDir, 'summary.json');
  await writeFile(summaryPath, JSON.stringify(summary, null, 2), 'utf8');
  console.log(`Summary -> ${path.relative(repoRoot, summaryPath).replace(/\\/g, '/')}`);

  if (summary.failedChecks > 0) {
    throw new Error(`${summary.failedChecks} Engine-Invarianten-Prüfungen fehlgeschlagen.`);
  }

  return summary;
}

const invokedAsScript = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedAsScript) {
  try {
    const summary = await runEngineInvariantSuite();
    console.log(`PASS ${summary.passedChecks}/${summary.totalChecks} Engine-Invarianten-Prüfungen`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
