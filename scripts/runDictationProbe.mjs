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

  for (const b of out.optionB) {
    console.log('');
    console.log(b.label);
    console.log(`  ok: ${b.ok}   #Schritte: ${b.steps}   #Rollen: ${b.roles}   #Systeme: ${b.systems}   #Reibung: ${b.friction}${b.error ? `   error: ${b.error}` : ''}`);
    console.log(`  Systeme: ${(b.systemsList ?? []).join(', ') || '(keine)'}`);
    console.log(`  Rollen:  ${(b.rolesList ?? []).join(', ') || '(keine)'}`);
    console.log('  erste 5 Schritt-Label:');
    b.sample.forEach((s, i) => console.log(`    ${i + 1}. ${s}`));
  }

  // --- Paket 9: lokale Pfad-Fixtures ---
  const fx = mod.runLocalPathFixtures();
  console.log('\n=== Lokaler Pfad — 10 Fixtures ===');
  const p = (s, n) => String(s).padEnd(n);
  console.log(`${p('Text', 5)} | ${p('Pfad', 7)} | ${p('Schr', 5)} | ${p('Roll', 5)} | ${p('Sys', 4)} | ${p('Reib', 5)} | Schritt 1`);
  for (const r of fx.rows) {
    console.log(`${p(r.key, 5)} | ${p(r.path, 7)} | ${p(r.steps, 5)} | ${p(r.roles, 5)} | ${p(r.systems, 4)} | ${p(r.friction, 5)} | ${(r.sample[0] ?? '').slice(0, 56)}`);
  }
  if (fx.failures.length) {
    console.error('\n✗ FIXTURE-FEHLER:');
    for (const f of fx.failures) console.error('  - ' + f);
    process.exitCode = 1;
  } else {
    console.log('\n✓ Alle harten Fixture-Erwartungen erfüllt.');
  }
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
