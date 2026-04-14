import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { readStructuredSourceText } from './source-reader.mjs';
import { deriveStructuredSourceModel } from './structured-source-model.mjs';

const COMPOSITE_VALUE_RE = /[;,|]|\s+\/\s+|\s+und\s+|\s+sowie\s+|\s+plus\s+/i;
const SPLIT_RE = /[,;|]|\s+\/\s+|\s+und\s+|\s+sowie\s+|\s+plus\s+/i;

function normalizeWhitespace(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeKey(value) {
  return normalizeWhitespace(value).toLowerCase();
}

function atomizeStructuredValues(values) {
  const input = Array.isArray(values) ? values : [];
  return Array.from(new Set(
    input
      .flatMap(value => normalizeWhitespace(value).split(SPLIT_RE).map(part => normalizeWhitespace(part)))
      .filter(Boolean)
      .map(value => value.toLowerCase()),
  )).map(value => input
    .flatMap(entry => normalizeWhitespace(entry).split(SPLIT_RE).map(part => normalizeWhitespace(part)))
    .find(entry => normalizeKey(entry) === value));
}

function arraysEqualNormalized(actual, expected) {
  return actual.length === expected.length && actual.every((value, index) => normalizeKey(value) === normalizeKey(expected[index]));
}

function sameMembers(actual, expected) {
  const left = atomizeStructuredValues(actual).map(normalizeKey).sort();
  const right = atomizeStructuredValues(expected).map(normalizeKey).sort();
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function findDimension(exportJson, key) {
  return asArray(exportJson?.qualityAssessment?.dimensions).find(item => item?.key === key)
    ?? asArray(exportJson?.analysisResults?.qualityAssessment?.dimensions).find(item => item?.key === key);
}

function getPreservedSteps(exportJson) {
  const preservedSteps = asArray(exportJson?.analysisResults?.extractionEvidence?.structuredPreserve?.preservedSteps);
  if (preservedSteps.length > 0) return preservedSteps;
  return asArray(exportJson?.sourceMaterial?.observations).filter(item => item?.kind === 'step' && item?.stepWasPreserved);
}

function getStepObservations(exportJson) {
  return asArray(exportJson?.sourceMaterial?.observations).filter(item => item?.kind === 'step');
}

function findStepByLabel(steps, label) {
  return steps.find(step => normalizeKey(step?.label ?? step?.originalStepLabel) === normalizeKey(label));
}

function flattenText(value) {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) return value.map(item => flattenText(item)).join(' ');
  if (typeof value === 'object') return Object.values(value).map(item => flattenText(item)).join(' ');
  return '';
}

function assertAtomicArray(errors, label, values) {
  asArray(values).forEach(value => {
    if (COMPOSITE_VALUE_RE.test(String(value))) {
      errors.push(`${label}: nicht-atomarer Wert gefunden (${JSON.stringify(value)}).`);
    }
  });
}

function assert(errors, condition, message) {
  if (!condition) errors.push(message);
}

function verifyStructuredWorkflow(errors, exportJson, sourceModel) {
  assert(errors, exportJson?.analysisResults?.routing?.routingClass === 'structured-procedure', 'Routingklasse ist nicht `structured-procedure`.');
  assert(errors, exportJson?.analysisResults?.lastDerivationSummary?.method === 'structured', 'Ableitungsmethode ist nicht `structured`.');
  assert(
    errors,
    exportJson?.analysisResults?.lastDerivationSummary?.sourceProfile?.documentClass === 'structured-target-procedure',
    'Dokumentenklasse ist nicht `structured-target-procedure`.',
  );
  assert(
    errors,
    exportJson?.analysisResults?.extractionEvidence?.structuredPreserve?.applied === true,
    'Structured-Preserve ist nicht aktiv.',
  );
  assert(
    errors,
    exportJson?.analysisResults?.extractionEvidence?.structuredPreserve?.explicitStructuredStepCount === sourceModel.explicitStepCount,
    `Explizite Ablaufzeilen zählen nicht sauber (${sourceModel.explicitStepCount} erwartet).`,
  );
  assert(
    errors,
    exportJson?.analysisResults?.extractionEvidence?.structuredPreserve?.preservedStructuredStepCount === sourceModel.explicitStepCount,
    `Preserved-Step-Zahl stimmt nicht mit der Quelle überein (${sourceModel.explicitStepCount} erwartet).`,
  );
}

function verifyPreservedOrder(errors, exportJson, sourceModel) {
  const expectedLabels = sourceModel.explicitStepLabels;
  const preservedLabels = getPreservedSteps(exportJson).map(step => step?.label ?? step?.originalStepLabel).filter(Boolean);
  assert(errors, arraysEqualNormalized(preservedLabels, expectedLabels), `Preserved-Step-Reihenfolge weicht von der Quelle ab. Erwartet ${JSON.stringify(expectedLabels)}, erhalten ${JSON.stringify(preservedLabels)}.`);

  const discoveryLabels = asArray(exportJson?.analysisResults?.discoverySummary?.topSteps);
  assert(errors, arraysEqualNormalized(discoveryLabels, expectedLabels), `Discovery-TopSteps weichen von der Quellenreihenfolge ab. Erwartet ${JSON.stringify(expectedLabels)}, erhalten ${JSON.stringify(discoveryLabels)}.`);

  const derivedLabels = asArray(exportJson?.sourceMaterial?.cases?.[0]?.derivedStepLabels);
  assert(errors, arraysEqualNormalized(derivedLabels, expectedLabels), `derivedStepLabels weichen von der Quellenreihenfolge ab. Erwartet ${JSON.stringify(expectedLabels)}, erhalten ${JSON.stringify(derivedLabels)}.`);

  const summaryStepLabels = asArray(exportJson?.analysisResults?.lastDerivationSummary?.stepLabels);
  assert(errors, arraysEqualNormalized(summaryStepLabels, expectedLabels), `lastDerivationSummary.stepLabels weichen von der Quelle ab. Erwartet ${JSON.stringify(expectedLabels)}, erhalten ${JSON.stringify(summaryStepLabels)}.`);
}

function verifyPreservedSuggestions(errors, exportJson, sourceModel) {
  const preservedLabels = new Set(sourceModel.explicitStepLabels.map(normalizeKey));
  const suggestions = asArray(exportJson?.qualityControl?.reviewOverview?.suggestions);
  const invalidSuggestions = suggestions.filter(suggestion => (
    preservedLabels.has(normalizeKey(suggestion?.currentLabel))
    && ['rename', 'split', 'reclassify'].includes(String(suggestion?.type))
  ));
  assert(errors, invalidSuggestions.length === 0, `Review erzeugt noch Suggestions auf preserved Steps: ${JSON.stringify(invalidSuggestions)}.`);
}

function verifyAtomicLists(errors, exportJson) {
  const roleDimension = findDimension(exportJson, 'roleQuality');
  const systemDimension = findDimension(exportJson, 'systemQuality');
  const arraysToCheck = [
    ['lastDerivationSummary.roles', exportJson?.analysisResults?.lastDerivationSummary?.roles],
    ['lastDerivationSummary.systems', exportJson?.analysisResults?.lastDerivationSummary?.systems],
    ['lastDerivationSummary.explicitRoles', exportJson?.analysisResults?.lastDerivationSummary?.explicitRoles],
    ['lastDerivationSummary.explicitSystems', exportJson?.analysisResults?.lastDerivationSummary?.explicitSystems],
    ['lastDerivationSummary.inferredRoles', exportJson?.analysisResults?.lastDerivationSummary?.inferredRoles],
    ['lastDerivationSummary.inferredSystems', exportJson?.analysisResults?.lastDerivationSummary?.inferredSystems],
    ['lastDerivationSummary.supportOnlyRoles', exportJson?.analysisResults?.lastDerivationSummary?.supportOnlyRoles],
    ['lastDerivationSummary.supportOnlySystems', exportJson?.analysisResults?.lastDerivationSummary?.supportOnlySystems],
    ['lastDerivationSummary.suppressedRoles', exportJson?.analysisResults?.lastDerivationSummary?.suppressedRoles],
    ['lastDerivationSummary.suppressedSystems', exportJson?.analysisResults?.lastDerivationSummary?.suppressedSystems],
    ['structuredPreserve.finalRoles', exportJson?.analysisResults?.extractionEvidence?.structuredPreserve?.finalRoles],
    ['structuredPreserve.finalSystems', exportJson?.analysisResults?.extractionEvidence?.structuredPreserve?.finalSystems],
    ['structuredPreserve.explicitRoles', exportJson?.analysisResults?.extractionEvidence?.structuredPreserve?.explicitRoles],
    ['structuredPreserve.explicitSystems', exportJson?.analysisResults?.extractionEvidence?.structuredPreserve?.explicitSystems],
    ['reviewOverview.rolesFull', exportJson?.qualityControl?.reviewOverview?.rolesFull],
    ['reviewOverview.systemsFull', exportJson?.qualityControl?.reviewOverview?.systemsFull],
    ['reviewOverview.explicitRoles', exportJson?.qualityControl?.reviewOverview?.explicitRoles],
    ['reviewOverview.explicitSystems', exportJson?.qualityControl?.reviewOverview?.explicitSystems],
    ['roleQuality.uniqueValues', roleDimension?.observed?.uniqueValues],
    ['systemQuality.uniqueValues', systemDimension?.observed?.uniqueValues],
  ];

  getStepObservations(exportJson).forEach((step, index) => {
    arraysToCheck.push([`sourceMaterial.observations[${index}].roles`, step?.roles]);
    arraysToCheck.push([`sourceMaterial.observations[${index}].systems`, step?.systems]);
    arraysToCheck.push([`sourceMaterial.observations[${index}].explicitRoles`, step?.explicitRoles]);
    arraysToCheck.push([`sourceMaterial.observations[${index}].explicitSystems`, step?.explicitSystems]);
  });

  getPreservedSteps(exportJson).forEach((step, index) => {
    arraysToCheck.push([`structuredPreserve.preservedSteps[${index}].roles`, step?.roles]);
    arraysToCheck.push([`structuredPreserve.preservedSteps[${index}].systems`, step?.systems]);
    arraysToCheck.push([`structuredPreserve.preservedSteps[${index}].explicitRoles`, step?.explicitRoles]);
    arraysToCheck.push([`structuredPreserve.preservedSteps[${index}].explicitSystems`, step?.explicitSystems]);
  });

  arraysToCheck.forEach(([label, values]) => assertAtomicArray(errors, label, values));
}

function verifyMultivalue(errors, exportJson, sourceModel, kind) {
  const steps = getStepObservations(exportJson);
  const preservedSteps = getPreservedSteps(exportJson);
  sourceModel.explicitSteps
    .filter(step => (kind === 'role' ? step.explicitRoles.length > 1 : step.explicitSystems.length > 1))
    .forEach(sourceStep => {
      const expected = kind === 'role' ? sourceStep.explicitRoles : sourceStep.explicitSystems;
      const observation = findStepByLabel(steps, sourceStep.label);
      const preserved = findStepByLabel(preservedSteps, sourceStep.label);
      assert(errors, Boolean(observation), `Kein finaler Export-Schritt für ${JSON.stringify(sourceStep.label)} gefunden.`);
      assert(errors, Boolean(preserved), `Kein preserved Export-Schritt für ${JSON.stringify(sourceStep.label)} gefunden.`);
      assert(
        errors,
        sameMembers(kind === 'role' ? observation?.roles : observation?.systems, expected),
        `${sourceStep.label}: finale ${kind === 'role' ? 'Rollen' : 'Systeme'} weichen von der expliziten Quellmenge ab.`,
      );
      assert(
        errors,
        sameMembers(kind === 'role' ? observation?.explicitRoles : observation?.explicitSystems, expected),
        `${sourceStep.label}: explizite ${kind === 'role' ? 'Rollen' : 'Systeme'} weichen von der Quellmenge ab.`,
      );
      assert(
        errors,
        sameMembers(kind === 'role' ? preserved?.roles : preserved?.systems, expected),
        `${sourceStep.label}: preserved ${kind === 'role' ? 'Rollen' : 'Systeme'} weichen von der Quellmenge ab.`,
      );
    });
}

function verifyClassificationConsistency(errors, exportJson) {
  const routingText = flattenText(exportJson?.context?.sourceRouting).toLowerCase();
  const profileText = flattenText(exportJson?.analysisResults?.lastDerivationSummary?.sourceProfile).toLowerCase();
  assert(errors, !/semi-structured-procedure|weak-material|mixed-document/.test(routingText), 'Structured-Quelle wird im Routing-/Diagnosetext uneindeutig oder fachfremd beschrieben.');
  assert(errors, !/semi-structured-procedure|weak-material|mixed-document/.test(profileText), 'Structured-Quelle wird im SourceProfile uneindeutig oder fachfremd beschrieben.');
}

function verifyDomainConsistency(errors, exportJson, sourceModel) {
  if (sourceModel.hasDomainConflict) return;
  const domainDimension = findDimension(exportJson, 'domainConsistency');
  assert(errors, domainDimension?.status !== 'critical', 'domainConsistency wird trotz konfliktfreier Quelle kritisch bewertet.');
  assert(errors, asArray(domainDimension?.blockerReasons).length === 0, 'domainConsistency erzeugt Blocker ohne reale Konfliktbasis.');
}

export async function runEngineInvariantCheck(params) {
  const expectation = JSON.parse(await readFile(params.expectationPath, 'utf8'));
  const exportJson = JSON.parse(await readFile(params.exportPath, 'utf8'));
  const sourceText = await readStructuredSourceText(params.sourcePath);
  const sourceModel = deriveStructuredSourceModel(sourceText);
  const errors = [];

  assert(errors, sourceModel.sourceFamily === expectation.fixtureFamily, `Quellfamilie ${sourceModel.sourceFamily} passt nicht zur Erwartung ${expectation.fixtureFamily}.`);
  assert(errors, sourceModel.isStructuredWorkflow, 'Quelle liefert keine belastbare explizite Ablaufstruktur.');

  if (expectation.requiresStructuredWorkflow) {
    verifyStructuredWorkflow(errors, exportJson, sourceModel);
  }
  if (expectation.requiresPreservedOrder || expectation.requiresMergeProtection || expectation.requiresPrimaryPreserveLabels) {
    verifyPreservedOrder(errors, exportJson, sourceModel);
  }
  if (expectation.requiresPrimaryPreserveLabels) {
    verifyPreservedSuggestions(errors, exportJson, sourceModel);
  }
  if (expectation.requiresAtomicFinalLists) {
    verifyAtomicLists(errors, exportJson);
  }
  if (expectation.requiresMultivalueRoles) {
    verifyMultivalue(errors, exportJson, sourceModel, 'role');
  }
  if (expectation.requiresMultivalueSystems) {
    verifyMultivalue(errors, exportJson, sourceModel, 'system');
  }
  if (expectation.requiresClassificationConsistency) {
    verifyClassificationConsistency(errors, exportJson);
  }
  if (expectation.requiresNonCriticalDomainConsistencyWithoutConflict) {
    verifyDomainConsistency(errors, exportJson, sourceModel);
  }

  return {
    passed: errors.length === 0,
    errors,
    sourceModel,
  };
}

const expectationArg = process.argv[2];
const sourceArg = process.argv[3];
const exportArg = process.argv[4];

if (expectationArg && sourceArg && exportArg) {
  const result = await runEngineInvariantCheck({
    expectationPath: path.resolve(process.cwd(), expectationArg),
    sourcePath: path.resolve(process.cwd(), sourceArg),
    exportPath: path.resolve(process.cwd(), exportArg),
  });

  if (!result.passed) {
    console.error(`FAIL ${path.basename(sourceArg)}`);
    result.errors.forEach(error => console.error(`- ${error}`));
    process.exit(1);
  }

  console.log(`PASS ${path.basename(sourceArg)} (${result.sourceModel.explicitStepCount} explizite Ablaufzeilen)`);
}
