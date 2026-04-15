import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const qaRoot = path.resolve(scriptDir, '..');
const repoRoot = path.resolve(qaRoot, '..', '..');
const srcRoot = path.join(repoRoot, 'src');
const manifestPath = path.join(qaRoot, 'fixtures', 'manifest.json');
const exportsDir = path.join(qaRoot, 'exports');
const reportPath = path.join(exportsDir, 'runtime-specialization-guard.json');
const scanExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

const pathRules = [
  {
    category: 'qa-path',
    description: 'Runtime darf keine QA-Pfade referenzieren.',
    regex: /\bqa[\\/]/i,
  },
  {
    category: 'qa-area',
    description: 'Runtime darf keine externe Invarianten- oder Phase-Gate-Bereiche referenzieren.',
    regex: /\b(engine-invariants|phase-gates|fixture-sources)\b/i,
  },
];

function normalizeWhitespace(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function uniqueStrings(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function sanitizeToken(value) {
  return normalizeWhitespace(value)
    .replace(/\.[^.]+$/u, '')
    .replace(/^#+\s*/u, '')
    .trim();
}

async function collectFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries
    .filter(entry => !entry.name.startsWith('.'))
    .map(async entry => {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) return collectFiles(entryPath);
      return [entryPath];
    }));
  return nested.flat().sort((left, right) => left.localeCompare(right));
}

async function readFixtureHeadingTokens(pathsToRead) {
  const headings = [];
  for (const fixturePath of pathsToRead) {
    if (path.extname(fixturePath).toLowerCase() !== '.md') continue;
    const content = await readFile(fixturePath, 'utf8');
    const heading = content
      .split(/\r?\n/u)
      .map(line => line.trim())
      .find(line => /^#{1,6}\s+/u.test(line));
    const token = sanitizeToken(heading);
    if (!token) continue;
    const wordCount = token.split(/\s+/u).filter(Boolean).length;
    const looksSpecificHeading = wordCount >= 4 || /[-_\d:()]/u.test(token);
    if (looksSpecificHeading && token.length >= 14) headings.push(token);
  }
  return headings;
}

async function deriveFixtureTokens() {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const fixtureDirs = [
    path.join(qaRoot, 'fixtures'),
    path.join(repoRoot, 'qa', 'phase-gates', 'fixtures'),
    path.join(repoRoot, 'qa', 'phase-gates', 'fixture-sources'),
  ];
  const fixtureFiles = (await Promise.all(fixtureDirs.map(dir => collectFiles(dir)))).flat();
  const headingTokens = await readFixtureHeadingTokens(fixtureFiles);
  const manifestTokens = (manifest.fixtures ?? []).flatMap(fixture => [
    fixture.id,
    fixture.fixtureFamily,
    sanitizeToken(path.basename(fixture.sourcePath ?? '')),
  ]);
  const fileStemTokens = fixtureFiles.map(filePath => sanitizeToken(path.basename(filePath)));

  return uniqueStrings([
    ...manifestTokens,
    ...fileStemTokens,
    ...headingTokens,
  ])
    .map(token => token.trim())
    .filter(token => token.length >= 8)
    .filter(token => /[-_\d]/u.test(token) || token.split(/\s+/u).length >= 3 || token.length >= 18)
    .sort((left, right) => left.localeCompare(right));
}

function findTokenViolations(content, token, relativePath, category) {
  const lines = content.split(/\r?\n/u);
  const loweredToken = token.toLowerCase();
  const violations = [];

  lines.forEach((line, index) => {
    const loweredLine = line.toLowerCase();
    let startIndex = loweredLine.indexOf(loweredToken);
    while (startIndex >= 0) {
      violations.push({
        file: relativePath.replace(/\\/gu, '/'),
        line: index + 1,
        column: startIndex + 1,
        category,
        token,
        snippet: line.trim(),
      });
      startIndex = loweredLine.indexOf(loweredToken, startIndex + loweredToken.length);
    }
  });

  return violations;
}

export async function runRuntimeSpecializationGuard() {
  const fixtureTokens = await deriveFixtureTokens();
  const sourceFiles = (await collectFiles(srcRoot)).filter(filePath => scanExtensions.has(path.extname(filePath).toLowerCase()));
  const violations = [];

  for (const filePath of sourceFiles) {
    const relativePath = path.relative(repoRoot, filePath);
    const content = await readFile(filePath, 'utf8');
    const lines = content.split(/\r?\n/u);

    pathRules.forEach(rule => {
      lines.forEach((line, index) => {
        const match = line.match(rule.regex);
        if (!match) return;
        violations.push({
          file: relativePath.replace(/\\/gu, '/'),
          line: index + 1,
          column: (match.index ?? 0) + 1,
          category: rule.category,
          token: match[0],
          snippet: line.trim(),
        });
      });
    });

    fixtureTokens.forEach(token => {
      violations.push(...findTokenViolations(content, token, relativePath, 'fixture-token'));
    });
  }

  const report = {
    scannedAt: new Date().toISOString(),
    runtimeRoot: path.relative(repoRoot, srcRoot).replace(/\\/gu, '/'),
    scannedFileCount: sourceFiles.length,
    fixtureTokenCount: fixtureTokens.length,
    fixtureTokens,
    pathRules: pathRules.map(rule => ({ category: rule.category, description: rule.description })),
    violationCount: violations.length,
    violations,
  };

  await mkdir(exportsDir, { recursive: true });
  await writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');

  if (violations.length > 0) {
    console.error(`FAIL Runtime-Spezialisierungs-Guard (${violations.length} Treffer)`);
    violations.forEach(violation => {
      console.error(`- ${violation.file}:${violation.line}:${violation.column} [${violation.category}] ${violation.token}`);
    });
    throw new Error('Runtime referenziert QA-/Fixture-Artefakte oder bekannte Prüftokens.');
  }

  console.log(`PASS Runtime-Spezialisierungs-Guard (${sourceFiles.length} Runtime-Dateien geprüft)`);
  console.log(`Report -> ${path.relative(repoRoot, reportPath).replace(/\\/gu, '/')}`);
  return report;
}

const invokedAsScript = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedAsScript) {
  try {
    await runRuntimeSpecializationGuard();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
