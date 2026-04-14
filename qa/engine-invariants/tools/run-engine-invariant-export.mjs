import { build } from 'vite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readStructuredSourceText } from './source-reader.mjs';

const DEFAULT_SOURCE_TYPE = 'docx';

export async function createEngineInvariantExporter() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(scriptDir, '..', '..', '..');
  const entry = path.resolve(repoRoot, 'qa/engine-invariants/tools/engineInvariantExportLab.ts');
  const tempDir = await mkdtemp(path.join(tmpdir(), 'engine-invariant-export-'));
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
            entryFileNames: 'engine-invariant-export.mjs',
          },
        },
      },
    });

    const mod = await import(pathToFileURL(path.join(outDir, 'engine-invariant-export.mjs')).href);
    return {
      exportOne: async params => mod.generateEngineInvariantExport(params),
      dispose: async () => {
        await rm(tempDir, { recursive: true, force: true });
      },
    };
  } catch (error) {
    await rm(tempDir, { recursive: true, force: true });
    throw error;
  }
}

async function runCli() {
  const sourceArg = process.argv[2];
  const exportArg = process.argv[3];
  const sourceTypeArg = process.argv[4] || DEFAULT_SOURCE_TYPE;
  const fixtureFamilyArg = process.argv[5];

  if (!sourceArg || !exportArg) {
    console.error('Usage: node qa/engine-invariants/tools/run-engine-invariant-export.mjs <source> <export.json> [sourceType] [fixtureFamily]');
    process.exit(1);
  }

  const sourcePath = path.resolve(process.cwd(), sourceArg);
  const exportPath = path.resolve(process.cwd(), exportArg);
  const sourceText = await readStructuredSourceText(sourcePath);
  const exporter = await createEngineInvariantExporter();

  try {
    const result = await exporter.exportOne({
      sourceText,
      fileName: path.basename(sourcePath),
      sourceType: sourceTypeArg,
      exportPath,
      fixtureFamily: fixtureFamilyArg,
    });
    console.log(`Exported ${path.basename(sourcePath)} -> ${result.exportPath}`);
    console.log(`App-Version: ${result.appVersion}`);
    console.log(`Routing: ${result.routingClass ?? 'n/a'}`);
    console.log(`DocumentClass: ${result.documentClass ?? 'n/a'}`);
  } finally {
    await exporter.dispose();
  }
}

const invokedAsScript = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedAsScript) {
  await runCli();
}
