import { build } from 'vite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const rootDir = process.cwd();
const tempDir = await mkdtemp(path.join(tmpdir(), 'pm-benchmark-'));
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
          entryFileNames: 'pm-benchmark.mjs',
        },
      },
    },
  });

  const mod = await import(pathToFileURL(path.join(outDir, 'pm-benchmark.mjs')).href);
  const result = mod.runBenchmarkSuite();
  const lines = [
    `PM Benchmark · ${result.engineVersion}`,
    result.headline,
    result.summary,
    ...result.results.map(item => `- ${item.label}: ${item.score}/100 (${item.status})`),
  ];
  console.log(lines.join('\n'));

  if (result.failedCount > 0) {
    process.exitCode = 1;
  }
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
