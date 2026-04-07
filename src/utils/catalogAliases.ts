export function normalizeCatalogToken(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function parseAliasesCell(cell?: string): string[] {
  if (!cell || !cell.trim()) return [];

  const separators = /[|,\n\r]+/;
  const tokens = cell.split(separators)
    .map(t => t.trim())
    .filter(t => t.length > 0);

  const seen = new Set<string>();
  const result: string[] = [];

  tokens.forEach(token => {
    const normalized = normalizeCatalogToken(token);
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      result.push(token.trim());
    }
  });

  return result;
}

export function mergeAliases(params: {
  canonicalName: string;
  existing?: string[];
  incoming?: string[];
}): string[] | undefined {
  const { canonicalName, existing, incoming } = params;

  const canonicalNormalized = normalizeCatalogToken(canonicalName);
  const seen = new Set<string>();
  const result: string[] = [];

  const addAlias = (alias: string) => {
    const normalized = normalizeCatalogToken(alias);
    if (normalized && normalized !== canonicalNormalized && !seen.has(normalized)) {
      seen.add(normalized);
      result.push(alias.trim());
    }
  };

  if (existing) {
    existing.forEach(addAlias);
  }

  if (incoming) {
    incoming.forEach(addAlias);
  }

  return result.length > 0 ? result : undefined;
}
