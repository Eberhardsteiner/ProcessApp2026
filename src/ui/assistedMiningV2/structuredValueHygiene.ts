import { normalizeWhitespace, uniqueStrings } from './pmShared';

const STRUCTURED_VALUE_SPLIT_RE = /[,;|]|\s+\/\s+|\s+und\s+|\s+sowie\s+|\s+plus\s+/i;

export interface SanitizedStructuredValueCollections {
  finalValues: string[];
  explicitValues: string[];
  inferredValues: string[];
  supportOnlyValues: string[];
  suppressedValues: string[];
}

export function atomizeStructuredValues(values: Array<string | undefined | null>): string[] {
  return uniqueStrings(
    values.flatMap(value => normalizeWhitespace(value ?? '').split(STRUCTURED_VALUE_SPLIT_RE).map(part => normalizeWhitespace(part))),
  );
}

export function includesStructuredValue(values: Array<string | undefined | null>, candidate: string | undefined | null): boolean {
  const normalizedCandidate = normalizeWhitespace(candidate ?? '').toLowerCase();
  if (!normalizedCandidate) return false;
  return atomizeStructuredValues(values).some(value => value.toLowerCase() === normalizedCandidate);
}

export function excludeStructuredValues(
  values: Array<string | undefined | null>,
  excluded: Array<string | undefined | null>,
): string[] {
  const excludedValues = atomizeStructuredValues(excluded);
  return atomizeStructuredValues(values).filter(value => !includesStructuredValue(excludedValues, value));
}

export function retainStructuredValues(
  values: Array<string | undefined | null>,
  allowed: Array<string | undefined | null>,
): string[] {
  const allowedValues = atomizeStructuredValues(allowed);
  return atomizeStructuredValues(values).filter(value => includesStructuredValue(allowedValues, value));
}

export function sanitizeStructuredValueCollections(params: {
  final?: Array<string | undefined | null>;
  explicit?: Array<string | undefined | null>;
  inferred?: Array<string | undefined | null>;
  supportOnly?: Array<string | undefined | null>;
  suppressed?: Array<string | undefined | null>;
}): SanitizedStructuredValueCollections {
  const explicitValues = atomizeStructuredValues(params.explicit ?? []);
  const suppressedValues = excludeStructuredValues(params.suppressed ?? [], explicitValues);
  const supportOnlyValues = excludeStructuredValues(params.supportOnly ?? [], [...explicitValues, ...suppressedValues]);
  const inferredCandidates = excludeStructuredValues(
    params.inferred ?? [],
    [...explicitValues, ...supportOnlyValues, ...suppressedValues],
  );
  const finalSeed = atomizeStructuredValues(
    (params.final ?? []).length > 0
      ? params.final ?? []
      : [...explicitValues, ...inferredCandidates],
  );
  const finalValues = excludeStructuredValues(finalSeed, [...supportOnlyValues, ...suppressedValues]);
  const fallbackFinalValues = finalValues.length > 0
    ? finalValues
    : uniqueStrings([...explicitValues, ...inferredCandidates]);
  const inferredValues = retainStructuredValues(inferredCandidates, fallbackFinalValues);

  return {
    finalValues: fallbackFinalValues,
    explicitValues,
    inferredValues,
    supportOnlyValues,
    suppressedValues,
  };
}

export function pickPrimaryStructuredValue(...valueGroups: Array<Array<string | undefined | null> | undefined>): string | undefined {
  return uniqueStrings(valueGroups.flatMap(values => atomizeStructuredValues(values ?? [])))[0];
}
