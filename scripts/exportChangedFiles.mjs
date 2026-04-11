import { mkdir, cp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

function parseArgs(argv) {
  const args = {
    from: 'HEAD~1',
    to: 'HEAD',
    out: 'artifacts/changed-files',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      continue;
    }

    const [key, inlineValue] = token.split('=', 2);
    const next = argv[index + 1];
    const value = inlineValue ?? (next && !next.startsWith('--') ? next : undefined);

    if (value === undefined) {
      throw new Error(`Fehlender Wert für ${key}`);
    }

    if (!inlineValue) {
      index += 1;
    }

    if (key === '--from') {
      args.from = value;
    } else if (key === '--to') {
      args.to = value;
    } else if (key === '--out') {
      args.out = value;
    } else {
      throw new Error(`Unbekanntes Argument: ${key}`);
    }
  }

  return args;
}

async function git(args) {
  const { stdout } = await execFileAsync('git', args, { encoding: 'utf8' });
  return stdout.trim();
}

const options = parseArgs(process.argv.slice(2));
const repoRoot = process.cwd();
const outDir = path.resolve(repoRoot, options.out);
const revisionRange = `${options.from}..${options.to}`;

const changedRaw = await git(['diff', '--name-only', '--diff-filter=ACMR', revisionRange]);
const changedFiles = changedRaw ? changedRaw.split('\n').filter(Boolean) : [];

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

for (const relativePath of changedFiles) {
  const sourcePath = path.resolve(repoRoot, relativePath);
  const targetPath = path.resolve(outDir, relativePath);
  await mkdir(path.dirname(targetPath), { recursive: true });
  await cp(sourcePath, targetPath, { recursive: false });
}

const payload = {
  generatedAt: new Date().toISOString(),
  from: options.from,
  to: options.to,
  revisionRange,
  fileCount: changedFiles.length,
  files: changedFiles,
};

await writeFile(path.join(outDir, 'manifest.json'), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

const summary = [
  `Range: ${revisionRange}`,
  `Dateien: ${changedFiles.length}`,
  `Ziel: ${path.relative(repoRoot, outDir)}`,
].join('\n');

console.log(summary);
