import { build } from 'vite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const rootDir = process.cwd();
const tempDir = await mkdtemp(path.join(tmpdir(), 'pm-benchmark-strict-'));
const outDir = path.join(tempDir, 'dist');
const entry = path.resolve(rootDir, 'src/ui/assistedMiningV2/benchmarkLab.ts');

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
          entryFileNames: 'pm-benchmark-strict.mjs',
        },
      },
    },
  });

  const mod = await import(pathToFileURL(path.join(outDir, 'pm-benchmark-strict.mjs')).href);
  const result = mod.runBenchmarkSuite();
  const lines = [
    `PM Benchmark (strict) · ${result.engineVersion}`,
    result.headline,
    result.summary,
    `Strict Gate: ${result.strictGate.pass ? 'PASS' : 'FAIL'}`,
    result.strictGate.summary,
    ...result.strictGate.reasons.map(reason => `- ${reason}`),
  ];
  console.log(lines.join('\n'));

  if (!result.strictGate.pass) {
    process.exitCode = 1;
  }
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
