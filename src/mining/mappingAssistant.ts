export interface MappingSuggestion {
  stepId: string;
  order: number;
  label: string;
  score: number;
  reasons: string[];
}

export function tokenize(text: string): string[] {
  const normalized = text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ');
  const tokens = normalized
    .split(/\s+/)
    .filter((t) => t.length >= 2);

  const stopWords = new Set(['und', 'der', 'die', 'das', 'den', 'dem', 'des', 'the', 'and', 'for', 'with', 'from']);
  return tokens.filter((t) => !stopWords.has(t));
}

export function tokenOverlapScore(aTokens: string[], bTokens: string[]): number {
  if (aTokens.length === 0 && bTokens.length === 0) return 0;

  const setA = new Set(aTokens);
  const setB = new Set(bTokens);

  const intersection = new Set([...setA].filter((x) => setB.has(x)));
  const union = new Set([...setA, ...setB]);

  if (union.size === 0) return 0;

  return intersection.size / union.size;
}

export function levenshteinSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 && b.length === 0) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  const distance = matrix[b.length][a.length];
  const maxLen = Math.max(a.length, b.length);

  if (maxLen === 0) return 1;

  return 1 - distance / maxLen;
}

export function suggestMappingsForActivities(params: {
  activities: Array<{ activityKey: string; example: string; count: number; stepId?: string }>;
  steps: Array<{
    stepId: string;
    order: number;
    label: string;
    roleId?: string | null;
    systemId?: string | null;
    dataIn?: string[];
    dataOut?: string[];
  }>;
  roles?: Array<{ id: string; name: string; aliases?: string[] }>;
  systems?: Array<{ id: string; name: string; aliases?: string[] }>;
  dataObjects?: Array<{ id: string; name: string; aliases?: string[] }>;
  maxSuggestions?: number;
  minScore?: number;
}): Record<string, MappingSuggestion[]> {
  const {
    activities,
    steps,
    roles = [],
    systems = [],
    dataObjects = [],
    maxSuggestions = 3,
    minScore = 0.25,
  } = params;

  const roleMap = new Map(roles.map((r) => [r.id, r]));
  const systemMap = new Map(systems.map((s) => [s.id, s]));
  const dataObjectMap = new Map(dataObjects.map((d) => [d.id, d]));

  const stepProfiles = steps.map((step) => {
    const terms: string[] = [step.label];

    if (step.roleId) {
      const role = roleMap.get(step.roleId);
      if (role) {
        terms.push(role.name);
        if (role.aliases) terms.push(...role.aliases);
      }
    }

    if (step.systemId) {
      const system = systemMap.get(step.systemId);
      if (system) {
        terms.push(system.name);
        if (system.aliases) terms.push(...system.aliases);
      }
    }

    if (step.dataIn) {
      for (const id of step.dataIn) {
        const dataObj = dataObjectMap.get(id);
        if (dataObj) {
          terms.push(dataObj.name);
          if (dataObj.aliases) terms.push(...dataObj.aliases);
        }
      }
    }

    if (step.dataOut) {
      for (const id of step.dataOut) {
        const dataObj = dataObjectMap.get(id);
        if (dataObj) {
          terms.push(dataObj.name);
          if (dataObj.aliases) terms.push(...dataObj.aliases);
        }
      }
    }

    const allText = terms.join(' ');
    const tokens = tokenize(allText);

    return {
      step,
      tokens,
      labelLower: step.label.toLowerCase(),
    };
  });

  const result: Record<string, MappingSuggestion[]> = {};

  for (const activity of activities) {
    if (activity.stepId) continue;

    const activityTokens = tokenize(activity.example);
    const activityLower = activity.example.toLowerCase();

    const scores: Array<{
      step: typeof steps[0];
      score: number;
      reasons: string[];
    }> = [];

    for (const profile of stepProfiles) {
      const tokenScore = tokenOverlapScore(activityTokens, profile.tokens);
      const levScore = levenshteinSimilarity(activity.example, profile.step.label);

      let score = 0.65 * tokenScore + 0.35 * levScore;
      const reasons: string[] = [];

      const commonTokens = activityTokens.filter((t) => profile.tokens.includes(t));
      if (commonTokens.length > 0) {
        const displayTokens = commonTokens.slice(0, 4);
        reasons.push(`Token: ${displayTokens.join(', ')}`);
      }

      if (activityLower.includes(profile.labelLower) || profile.labelLower.includes(activityLower)) {
        score = Math.min(1.0, score + 0.08);
        reasons.push('Substring-Treffer');
      }

      if (score >= minScore) {
        scores.push({
          step: profile.step,
          score,
          reasons,
        });
      }
    }

    scores.sort((a, b) => b.score - a.score);
    const topSuggestions = scores.slice(0, maxSuggestions);

    if (topSuggestions.length > 0) {
      result[activity.activityKey] = topSuggestions.map((s) => ({
        stepId: s.step.stepId,
        order: s.step.order,
        label: s.step.label,
        score: s.score,
        reasons: s.reasons,
      }));
    }
  }

  return result;
}
