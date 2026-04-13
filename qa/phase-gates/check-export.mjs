import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function fail(message) {
  throw new Error(message);
}

function normalizeText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function splitPathSegments(value) {
  const segments = [];
  let current = '';
  let bracketDepth = 0;
  for (const char of value) {
    if (char === '.' && bracketDepth === 0) {
      if (current) segments.push(current);
      current = '';
      continue;
    }
    if (char === '[') bracketDepth += 1;
    if (char === ']') bracketDepth = Math.max(0, bracketDepth - 1);
    current += char;
  }
  if (current) segments.push(current);
  return segments;
}

function parseSegment(segment) {
  const selectors = [];
  const selectorRe = /\[([^\]]+)\]/g;
  let match;
  while ((match = selectorRe.exec(segment)) !== null) {
    selectors.push(match[1].trim());
  }
  const name = segment.replace(selectorRe, '').trim();
  return { name, selectors };
}

function getNestedValue(target, field) {
  if (!field) return target;
  let current = target;
  for (const segment of field.split('.')) {
    if (current == null) return undefined;
    current = current[segment];
  }
  return current;
}

function applySelector(current, selector, fullPath) {
  if (!Array.isArray(current)) {
    return undefined;
  }
  if (/^\d+$/.test(selector)) {
    return current[Number(selector)];
  }

  const filters = selector
    .split('&')
    .map(entry => entry.trim())
    .filter(Boolean)
    .map(entry => {
      const eqIndex = entry.indexOf('=');
      if (eqIndex <= 0) {
        fail(`Ungültiger Filter im JSON-Pfad "${fullPath}": ${entry}`);
      }
      return {
        field: entry.slice(0, eqIndex).trim(),
        expected: entry.slice(eqIndex + 1).trim(),
      };
    });

  return current.find(item =>
    filters.every(filter => String(getNestedValue(item, filter.field) ?? '') === filter.expected),
  );
}

function resolvePath(root, value) {
  if (!value) return root;
  let current = root;
  for (const segment of splitPathSegments(value)) {
    const parsed = parseSegment(segment);
    if (parsed.name) {
      current = current?.[parsed.name];
    }
    for (const selector of parsed.selectors) {
      current = applySelector(current, selector, value);
    }
  }
  return current;
}

function arraysEqual(actual, expected) {
  return Array.isArray(actual)
    && Array.isArray(expected)
    && actual.length === expected.length
    && actual.every((value, index) => JSON.stringify(value) === JSON.stringify(expected[index]));
}

function sameMembers(actual, expected) {
  if (!Array.isArray(actual) || !Array.isArray(expected)) return false;
  const actualSorted = [...actual].map(value => JSON.stringify(value)).sort();
  const expectedSorted = [...expected].map(value => JSON.stringify(value)).sort();
  return arraysEqual(actualSorted, expectedSorted);
}

function flattenToText(value) {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map(item => flattenToText(item)).filter(Boolean).join(' | ');
  }
  if (typeof value === 'object') {
    return Object.values(value).map(item => flattenToText(item)).filter(Boolean).join(' | ');
  }
  return '';
}

function getCurrentAppVersion(repoRoot) {
  return readFile(path.join(repoRoot, 'package.json'), 'utf8')
    .then(content => JSON.parse(content))
    .then(pkg => {
      const version = String(pkg.version ?? '').trim();
      if (!version) {
        fail('package.json enthält keine gültige Version.');
      }
      return `v${version} (${version})`;
    });
}

async function runCheck(params) {
  const actual = resolvePath(params.exportJson, params.check.path);
  switch (params.check.op) {
    case 'eq': {
      if (actual !== params.check.value) {
        fail(`${params.label}: erwartet ${JSON.stringify(params.check.value)}, erhalten ${JSON.stringify(actual)}.`);
      }
      return;
    }
    case 'arrayEquals': {
      if (!arraysEqual(actual, params.check.value)) {
        fail(`${params.label}: Array stimmt nicht exakt. Erwartet ${JSON.stringify(params.check.value)}, erhalten ${JSON.stringify(actual)}.`);
      }
      return;
    }
    case 'arrayContains': {
      if (!Array.isArray(actual)) {
        fail(`${params.label}: Zielpfad ist kein Array.`);
      }
      const missing = (params.check.values ?? []).filter(value => !actual.includes(value));
      if (missing.length > 0) {
        fail(`${params.label}: fehlende Werte ${JSON.stringify(missing)} in ${JSON.stringify(actual)}.`);
      }
      return;
    }
    case 'arrayNotContains': {
      if (!Array.isArray(actual)) {
        fail(`${params.label}: Zielpfad ist kein Array.`);
      }
      const forbidden = (params.check.values ?? []).filter(value => actual.includes(value));
      if (forbidden.length > 0) {
        fail(`${params.label}: verbotene Werte gefunden ${JSON.stringify(forbidden)}.`);
      }
      return;
    }
    case 'arraySameMembers': {
      if (!sameMembers(actual, params.check.values ?? [])) {
        fail(`${params.label}: Array-Mitglieder stimmen nicht exakt überein. Erwartet ${JSON.stringify(params.check.values ?? [])}, erhalten ${JSON.stringify(actual)}.`);
      }
      return;
    }
    case 'arrayMinLength': {
      if (!Array.isArray(actual)) {
        fail(`${params.label}: Zielpfad ist kein Array.`);
      }
      if (actual.length < Number(params.check.value ?? 0)) {
        fail(`${params.label}: Array ist zu kurz. Erwartet mindestens ${params.check.value}, erhalten ${actual.length}.`);
      }
      return;
    }
    case 'notContainsTokens': {
      const haystack = normalizeText(flattenToText(actual));
      const forbidden = (params.check.values ?? []).filter(token => haystack.includes(normalizeText(token)));
      if (forbidden.length > 0) {
        fail(`${params.label}: verbotene Tokens gefunden ${JSON.stringify(forbidden)}.`);
      }
      return;
    }
    case 'matchesCurrentAppVersion': {
      const expected = await getCurrentAppVersion(params.repoRoot);
      if (actual !== expected) {
        fail(`${params.label}: App-Version passt nicht. Erwartet ${JSON.stringify(expected)}, erhalten ${JSON.stringify(actual)}.`);
      }
      return;
    }
    case 'pluckArrayEquals': {
      if (!Array.isArray(actual)) {
        fail(`${params.label}: Zielpfad ist kein Array.`);
      }
      const plucked = actual.map(item => resolvePath(item, params.check.field));
      if (!arraysEqual(plucked, params.check.value)) {
        fail(`${params.label}: geplückte Werte stimmen nicht exakt. Erwartet ${JSON.stringify(params.check.value)}, erhalten ${JSON.stringify(plucked)}.`);
      }
      return;
    }
    default:
      fail(`${params.label}: unbekannte Operation ${params.check.op}.`);
  }
}

const expectationArg = process.argv[2];
const exportArg = process.argv[3];

if (!expectationArg || !exportArg) {
  console.error('Usage: node qa/phase-gates/check-export.mjs <expectation.json> <export.json>');
  process.exit(1);
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..', '..');
const expectationPath = path.resolve(process.cwd(), expectationArg);
const exportPath = path.resolve(process.cwd(), exportArg);

const expectation = JSON.parse(await readFile(expectationPath, 'utf8'));
const exportJson = JSON.parse(await readFile(exportPath, 'utf8'));

const errors = [];
for (let index = 0; index < (expectation.checks ?? []).length; index += 1) {
  const check = expectation.checks[index];
  const label = check.label ?? `Check ${index + 1}`;
  try {
    await runCheck({ check, label, exportJson, repoRoot });
  } catch (error) {
    errors.push(error instanceof Error ? error.message : `${label}: ${String(error)}`);
  }
}

if (errors.length > 0) {
  console.error(`FAIL ${expectation.name ?? path.basename(expectationPath)}`);
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(`PASS ${expectation.name ?? path.basename(expectationPath)} (${(expectation.checks ?? []).length} checks)`);
