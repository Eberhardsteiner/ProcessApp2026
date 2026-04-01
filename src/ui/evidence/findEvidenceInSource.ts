export interface EvidenceMatch {
  line: number;
  charIndex: number;
  contextBefore: string;
  match: string;
  contextAfter: string;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function findEvidenceContexts(
  sourceText: string,
  snippet: string,
  maxMatches?: number
): EvidenceMatch[] {
  const trimmed = snippet.trim();
  if (!trimmed) return [];

  const limit = maxMatches ?? 3;
  const results: EvidenceMatch[] = [];

  const normalized = trimmed.replace(/\s+/g, ' ');
  const escaped = escapeRegExp(normalized);
  const pattern = escaped.replace(/ /g, '\\s+');

  let regex: RegExp;
  try {
    regex = new RegExp(pattern, 'ig');
  } catch {
    return [];
  }

  let match: RegExpExecArray | null;
  while ((match = regex.exec(sourceText)) !== null && results.length < limit) {
    const matchStart = match.index;
    const matchText = match[0];

    const lastNewlineBeforeMatch = sourceText.lastIndexOf('\n', matchStart - 1);
    const line = sourceText.slice(0, matchStart).split('\n').length;
    const charIndex = lastNewlineBeforeMatch === -1 ? matchStart : matchStart - lastNewlineBeforeMatch - 1;

    const contextLength = 120;
    const contextStart = Math.max(0, matchStart - contextLength);
    const contextEnd = Math.min(sourceText.length, matchStart + matchText.length + contextLength);

    const contextBefore = sourceText.slice(contextStart, matchStart);
    const contextAfter = sourceText.slice(matchStart + matchText.length, contextEnd);

    results.push({
      line,
      charIndex,
      contextBefore,
      match: matchText,
      contextAfter,
    });
  }

  return results;
}
