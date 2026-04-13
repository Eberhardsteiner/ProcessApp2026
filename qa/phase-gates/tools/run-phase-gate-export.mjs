import { build } from 'vite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const fixtureArg = process.argv[2];
const exportArg = process.argv[3];

if (!fixtureArg || !exportArg) {
  console.error('Usage: node qa/phase-gates/tools/run-phase-gate-export.mjs <fixture.docx> <export.json>');
  process.exit(1);
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..', '..', '..');
const entry = path.resolve(repoRoot, 'qa/phase-gates/tools/phaseGateExportLab.ts');
const fixturePath = path.resolve(process.cwd(), fixtureArg);
const exportPath = path.resolve(process.cwd(), exportArg);
const tempDir = await mkdtemp(path.join(tmpdir(), 'phase-gate-export-'));
const outDir = path.join(tempDir, 'dist');

try {
  await build({
    root: repoRoot,
    logLevel: 'silent',
    ssr: {
      noExternal: true,
    },
    build: {
      ssr: entry,
      outDir,
      emptyOutDir: true,
      minify: false,
      rollupOptions: {
        output: {
          entryFileNames: 'phase-gate-export.mjs',
        },
      },
    },
  });

  const mod = await import(pathToFileURL(path.join(outDir, 'phase-gate-export.mjs')).href);
  const result = await mod.generatePhaseGateExport({ fixturePath, exportPath });
  console.log(`Exported ${path.basename(fixturePath)} -> ${result.exportPath}`);
  console.log(`App-Version: ${result.appVersion}`);
  console.log(`Routing: ${result.routingClass ?? 'n/a'}`);
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
