import { build } from 'vite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Diagnose-Runner: baut src/import/dictationProbe.ts als SSR-Entry (wie runPmBenchmark.mjs)
// und ruft runDictationProbe() auf. Misst RAW / SENTENCES / NUMBERED gegen die echte Engine.

const rootDir = process.cwd();
const tempDir = await mkdtemp(path.join(tmpdir(), 'dictation-probe-'));
const outDir = path.join(tempDir, 'dist');
const entry = path.resolve(rootDir, 'src/import/dictationProbe.ts');

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
          entryFileNames: 'dictation-probe.mjs',
        },
      },
    },
  });

  const mod = await import(pathToFileURL(path.join(outDir, 'dictation-probe.mjs')).href);
  const out = mod.runDictationProbe();

  const pad = (s, n) => String(s).padEnd(n);
  console.log(`${pad('Variante', 26)} | ${pad('routingClass', 26)} | ${pad('#obs', 5)} | #derivedSteps`);
  console.log(`${'-'.repeat(27)}+${'-'.repeat(28)}+${'-'.repeat(7)}+--------------`);
  for (const r of out.rows) {
    console.log(`${pad(r.label, 26)} | ${pad(r.routingClass, 26)} | ${pad(r.obs, 5)} | ${r.derivedSteps}`);
  }

  const b = out.optionB;
  console.log('');
  console.log(b.label);
  console.log(`  ok: ${b.ok}   #Schritte: ${b.steps}${b.error ? `   error: ${b.error}` : ''}`);
  console.log('  erste 5 Schritt-Label:');
  b.sample.forEach((s, i) => console.log(`    ${i + 1}. ${s}`));
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
